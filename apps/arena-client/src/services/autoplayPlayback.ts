/**
 * Autoplay Playback Service — Arena Client (WP-164)
 *
 * Typed `fetch` wrapper for the WP-163 autoplay control endpoints and the
 * WP-165 status probe. The spectator-facing control bar
 * (`components/AutoplayControls.vue`, mounted by `pages/PlayDesktop.vue`)
 * calls these functions; the bar never `fetch`es directly.
 *
 * Layer-boundary contract: this module imports nothing from `boardgame.io`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or the engine Setup-Tooling Surface (the
 * `/setup` subpath; D-14401). The only engine import is the `UIState` TYPE
 * (compile-time only), needed to type the injected rewind snapshot.
 *
 * The service is STATELESS with respect to playback state (D-16304 / WP-164
 * §Service state ownership): it issues requests, returns the response envelope,
 * and performs the single `setSnapshot` side effect when a control response
 * carries a `uiState`. It stores no `paused` / `cursor` / `historyLength` /
 * `mode` and holds no cache — the component owns that state.
 *
 * Authority: WP-164 §Contract; EC-181 §Locked Values; D-16101 (buildApiUrl),
 * D-16301 (live broadcast wins), D-16304 (mode authoritative), D-16309
 * (no debounce), D-16501 (status-probe gating), D-14401 (no setup import).
 */

import type { UIState } from '@legendary-arena/game-engine';
import { useUiStateStore } from '../stores/uiState';
import { buildApiUrl } from '../lib/api/apiBaseUrl';

/**
 * The control / status envelope returned by the WP-163 control endpoints and
 * the WP-165 status probe. Declared locally (structural compatibility with the
 * server-side envelope) so the client does not import a server-layer type.
 *
 * `mode` is `'live' | 'paused'` only — there is no `'rewind'` value
 * (WP-163 D-16304 as-built). It is read DIRECTLY and never recomputed on the
 * client. `uiState` is present only on control responses that inject a rewind
 * frame; the status probe never carries it.
 */
export interface AutoplayControlResponse {
  ok: boolean;
  paused: boolean;
  historyLength: number;
  cursor: number;
  // why: server's `mode` is authoritative; the client reads it directly and
  // never recomputes it from cursor/historyLength (D-16304). It is never a
  // value other than 'live' | 'paused' — REWIND is derived separately from
  // cursor position, not from `mode`.
  mode: 'live' | 'paused';
  speedMode: '1x' | '2x' | '4x' | 'max';
  gameOver: boolean;
  // why: structural mirror of the WP-261 server envelope (D-24037). `aborted`
  // is ALWAYS present; `abortReason` is an own key only when `aborted === true`
  // (a public-safe full sentence). Both are read DIRECTLY off the parsed
  // envelope and never recomputed on the client — the abort DECISION is
  // server-side (WP-261), the client only surfaces it. No server-layer type is
  // imported (WP-164 / D-14401); the shapes match structurally.
  aborted: boolean;
  abortReason?: string;
  uiState?: UIState;
  error?: string;
}

// why: on an initial status-probe 404 the gating logic retries exactly once
// after this delay. 1000 ms absorbs the WP-165 transient-init 404 (the
// controller can be momentarily unregistered right after autoplay-create)
// without an unbounded loop or visible bar flicker (D-16501).
export const STATUS_RETRY_DELAY_MS = 1000;

// why: stall-detection poll cadence (WP-262 / D-24042). 3000 ms is frequent
// enough that a spectator sees the "Bot match stopped" banner within a few
// seconds of an abort, but infrequent enough that the periodic GET .../status
// traffic for the bar's lifetime stays negligible. Defined ONCE here and
// consumed by AutoplayControls.vue — there is no duplicate local interval
// literal in the component.
export const STALL_POLL_INTERVAL_MS = 3000;

/**
 * Probe whether a match is an autoplay match.
 *
 * @param matchId The live match id (already URL-safe; the live route supplies it).
 * @returns The parsed envelope on HTTP 200 (autoplay match), or `null` on HTTP
 *   404 (not an autoplay match). Throws on any other status, a network failure,
 *   or a parse failure.
 */
export async function getStatus(
  matchId: string,
): Promise<AutoplayControlResponse | null> {
  const url = buildApiUrl(`/api/match/autoplay/${matchId}/status`);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(
      `Autoplay status request for match ${matchId} failed: the network request to ${url} did not complete. Check that the API server is reachable.`,
      { cause },
    );
  }
  // why: ONLY a 404 maps to null ("not an autoplay match", hides the bar). Any
  // other fault (500, network, parse) throws instead of being coerced to null,
  // so a real outage is never silently misread as a normal PvP match (D-16501).
  if (response.status === 404) {
    return null;
  }
  if (response.status !== 200) {
    throw new Error(
      `Autoplay status request for match ${matchId} returned HTTP ${response.status}; expected 200 (autoplay match) or 404 (not autoplay). A non-404 fault must not be treated as "not autoplay".`,
    );
  }
  try {
    return (await response.json()) as AutoplayControlResponse;
  } catch (cause) {
    throw new Error(
      `Autoplay status response for match ${matchId} could not be parsed as JSON. Check that the API server returned a valid status envelope.`,
      { cause },
    );
  }
}

/**
 * POST to a pre-built control URL and return its envelope. When the response
 * carries a truthy `uiState`, inject it into the shared UI store so the
 * spectator sees the rewound frame. The public control functions each build
 * their own URL via `buildApiUrl` and delegate the fetch / parse / inject here.
 *
 * @param url The absolute control URL (already built via `buildApiUrl`).
 * @param action The hyphenated route action (for error messages).
 * @param matchId The live match id (for error messages).
 * @returns The parsed control envelope.
 */
async function postControl(
  url: string,
  action: string,
  matchId: string,
): Promise<AutoplayControlResponse> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST' });
  } catch (cause) {
    throw new Error(
      `Autoplay ${action} request for match ${matchId} failed: the network request to ${url} did not complete. Check that the API server is reachable.`,
      { cause },
    );
  }
  if (response.status !== 200) {
    throw new Error(
      `Autoplay ${action} request for match ${matchId} returned HTTP ${response.status}; expected 200. The control was not applied.`,
    );
  }
  let envelope: AutoplayControlResponse;
  try {
    envelope = (await response.json()) as AutoplayControlResponse;
  } catch (cause) {
    throw new Error(
      `Autoplay ${action} response for match ${matchId} could not be parsed as JSON. Check that the API server returned a valid control envelope.`,
      { cause },
    );
  }
  // why: inject the rewind snapshot iff the control response carries one. This
  // does NOT race the Socket.IO live transport: the next live broadcast writes
  // the same `setSnapshot` store seam (via the existing client/bgioClient.ts
  // path) and unconditionally overwrites this frame — no merge, no
  // reconciliation, last write wins (D-16301). The value is passed EXACTLY,
  // never transformed, and never written when absent/null.
  if (envelope.uiState) {
    useUiStateStore().setSnapshot(envelope.uiState);
  }
  return envelope;
}

/**
 * POST to a control URL with a JSON body and return its envelope. Same as
 * `postControl` but sends a request body.
 *
 * @param url The absolute control URL.
 * @param action The hyphenated route action (for error messages).
 * @param matchId The live match id (for error messages).
 * @param body The JSON-serializable request body.
 * @returns The parsed control envelope.
 */
async function postControlWithBody(
  url: string,
  action: string,
  matchId: string,
  body: Record<string, unknown>,
): Promise<AutoplayControlResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new Error(
      `Autoplay ${action} request for match ${matchId} failed: the network request to ${url} did not complete. Check that the API server is reachable.`,
      { cause },
    );
  }
  if (response.status !== 200) {
    throw new Error(
      `Autoplay ${action} request for match ${matchId} returned HTTP ${response.status}; expected 200. The control was not applied.`,
    );
  }
  let envelope: AutoplayControlResponse;
  try {
    envelope = (await response.json()) as AutoplayControlResponse;
  } catch (cause) {
    throw new Error(
      `Autoplay ${action} response for match ${matchId} could not be parsed as JSON. Check that the API server returned a valid control envelope.`,
      { cause },
    );
  }
  if (envelope.uiState) {
    useUiStateStore().setSnapshot(envelope.uiState);
  }
  return envelope;
}

/**
 * Pause the autoplay loop.
 * @param matchId The live match id.
 */
export async function pause(
  matchId: string,
): Promise<AutoplayControlResponse> {
  return postControl(
    buildApiUrl(`/api/match/autoplay/${matchId}/pause`),
    'pause',
    matchId,
  );
}

/**
 * Resume the autoplay loop, optionally setting a speed mode.
 * @param matchId The live match id.
 * @param options Optional speed mode to apply on resume.
 */
export async function resume(
  matchId: string,
  options?: { speedMode?: '1x' | '2x' | '4x' },
): Promise<AutoplayControlResponse> {
  const url = buildApiUrl(`/api/match/autoplay/${matchId}/resume`);
  if (options?.speedMode) {
    return postControlWithBody(url, 'resume', matchId, { speedMode: options.speedMode });
  }
  return postControl(url, 'resume', matchId);
}

/**
 * Step the playback cursor forward one frame.
 * @param matchId The live match id.
 */
export async function stepForward(
  matchId: string,
): Promise<AutoplayControlResponse> {
  return postControl(
    buildApiUrl(`/api/match/autoplay/${matchId}/step-forward`),
    'step-forward',
    matchId,
  );
}

/**
 * Step the playback cursor back one frame.
 * @param matchId The live match id.
 */
export async function stepBack(
  matchId: string,
): Promise<AutoplayControlResponse> {
  return postControl(
    buildApiUrl(`/api/match/autoplay/${matchId}/step-back`),
    'step-back',
    matchId,
  );
}

/**
 * Restart playback from the first recorded frame.
 * @param matchId The live match id.
 */
export async function restart(
  matchId: string,
): Promise<AutoplayControlResponse> {
  return postControl(
    buildApiUrl(`/api/match/autoplay/${matchId}/restart`),
    'restart',
    matchId,
  );
}

/**
 * Jump the playback cursor to the live edge (most recent frame).
 * @param matchId The live match id.
 */
export async function goToEnd(
  matchId: string,
): Promise<AutoplayControlResponse> {
  return postControl(
    buildApiUrl(`/api/match/autoplay/${matchId}/go-to-end`),
    'go-to-end',
    matchId,
  );
}

/**
 * Decide whether to show the control bar for a match, with the bounded
 * single-retry status probe (D-16501 / WP-165 transient-404 guard). This is
 * the mount/gating logic extracted as a pure, testable unit; `getStatus`
 * itself stays a single request.
 *
 * - A missing `matchId` (undefined / null / empty) ⇒ no probe, `null` (bar
 *   hidden). // why: avoids an invalid `…/undefined/status` request.
 * - First probe resolves a `200` envelope ⇒ return it (show the bar).
 * - First probe resolves `null` (404) ⇒ wait `retryDelay`, probe once more:
 *   a second `200` ⇒ return it (recovered from a transient init 404); a second
 *   `null` ⇒ return `null` (autoplay absent, bar hidden, NO further retries).
 * - A thrown `getStatus` error (non-404 / network) is NOT a `null` outcome: it
 *   propagates so the caller can surface it and leave the bar hidden — it is
 *   never swallowed into "not an autoplay match".
 *
 * @param matchId The live match id, or an absent value.
 * @param probe The status probe (`getStatus`), injectable for testing.
 * @param retryDelay Awaited once between the two probes, injectable for testing.
 * @returns The autoplay envelope (show the bar) or `null` (hide the bar).
 */
export async function resolveAutoplayGating(
  matchId: string | null | undefined,
  probe: (matchId: string) => Promise<AutoplayControlResponse | null>,
  retryDelay: () => Promise<void>,
): Promise<AutoplayControlResponse | null> {
  if (matchId === undefined || matchId === null || matchId === '') {
    return null;
  }
  const firstResult = await probe(matchId);
  if (firstResult !== null) {
    return firstResult;
  }
  await retryDelay();
  return probe(matchId);
}

/**
 * The classification of a SETTLED stall-detection probe result. The poll in
 * `AutoplayControls.vue` maps each outcome to an action: `'aborted'` raises the
 * "Bot match stopped" banner and stops the poll, `'stopped'` stops the poll
 * silently, `'continue'` keeps polling.
 */
export type StallProbeOutcome = 'aborted' | 'stopped' | 'continue';

/**
 * Classify an already-settled stall-detection probe result (WP-262 / D-24042).
 *
 * This is the pure, timer-free decision half of the stall poll, mirroring the
 * `resolveAutoplayGating` pure-helper split so the classification is unit
 * tested without fake timers. It handles ONLY settled results
 * (`AutoplayControlResponse | null`); a thrown `getStatus` fault never reaches
 * here — the poll caller catches and logs transient faults and keeps polling.
 *
 * @param response The settled probe envelope (HTTP 200), or `null` (HTTP 404).
 * @returns `'aborted'` when the envelope reports `aborted === true`; `'stopped'`
 *   for a `null` (404) probe or a `gameOver === true` envelope; `'continue'`
 *   for a normal live envelope.
 */
export function interpretStallProbe(
  response: AutoplayControlResponse | null,
): StallProbeOutcome {
  // why: a `null` (404) probe means the autoplay controller is no longer
  // observable (torn down, or never registered), so it is classified
  // `'stopped'` rather than `'aborted'`: the client cannot read an abort reason
  // for a controller it can no longer see, so it must not invent an abort
  // banner. Only an explicit `aborted === true` envelope raises the banner.
  if (response === null) {
    return 'stopped';
  }
  if (response.aborted === true) {
    return 'aborted';
  }
  if (response.gameOver === true) {
    return 'stopped';
  }
  return 'continue';
}
