import { ref, type Ref } from 'vue';
import type { DateRange, ServiceResponse } from '../types/index.js';
import type { SweepHealthSnapshot } from '../types/sweep.js';
// why: D-20601/D-23801 single-source-of-truth LIVE gate — `isLiveModeEnabled`
// is IMPORTED from the analytics module, never re-derived here. Two
// independently-inlined env-var checks would drift silently over the long tail
// of future edits, surfacing only when production diverged from local-dev. The
// close-out grep requires zero `VITE_USE_MOCKS` matches in this file.
import { isLiveModeEnabled } from './analyticsLiveFetchers.js';
// why: server requires Authorization: Bearer (D-11202); cookies are ignored —
// supersedes D-20601 (D-24003). The bearer header and the null-token
// fail-silent path come from the shared authToken.ts seam (SOLE producer + SOLE
// skip path), identical to the analytics + triage fetchers.
import {
  buildLiveRequestOptions,
  handleMissingAuthToken,
  readAuthToken,
} from './authToken.js';

// ============================================================================
// WP-238 / EC-269 / D-23801 — LIVE-mode sweep-health fetcher.
//
// One synchronous getter export (`fetchSweepHealthLive`) preserves the
// widget's `() => ServiceResponse<SweepHealthSnapshot>` contract by backing
// the cache with a Vue `Ref<ServiceResponse>`. The async fetch closure is
// FILE-INTERNAL — no `export async function fetch*` here; the public API is
// the synchronous getter plus the helpers (`isValidSweepEnvelope` /
// `__testHooks`).
//
// This file mirrors `analyticsLiveFetchers.ts` (read it for the full
// structural rationale). The single structural deviation is the response
// envelope: analytics ships `{ data: readonly T[] }` (an array), whereas
// `GET /api/sweep/latest` ships `{ data: { latest, recentRuns } }` (an
// OBJECT). That deviation lives entirely inside `isValidSweepEnvelope` and
// the sentinel factory below. There is also exactly ONE cached resource here
// (not a per-key Map) because the endpoint ignores all query params per
// WP-209, so a single module-level `Ref` is the whole cache.
// ============================================================================

/**
 * Locked warning text emitted once when the fetcher runs with LIVE mode "on"
 * but `VITE_API_BASE_URL` is unset (or `isLiveModeEnabled()` reads false at
 * fetch time for any other reason). Mirrors the analytics fetcher's one-shot
 * missing-URL warning so an operator sees the same loud misconfiguration
 * signal on the sweep surface as on the analytics surface.
 */
const MISSING_BASE_URL_WARNING =
  '[sweep] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.';

/**
 * Subset of `ImportMetaEnv` this module reads. Only `VITE_API_BASE_URL` (for
 * the request URL) and `DEV` (for dev-only debug logging) are needed — the
 * boolean LIVE gate is delegated to `isLiveModeEnabled()` and is NOT re-read
 * here. Kept narrow so the test-injection hook (`__testHooks.setEnv`) only has
 * to supply the fields under test.
 */
interface SweepEnv {
  VITE_API_BASE_URL?: string;
  DEV?: boolean;
}

// why: test-injection seam matching the analytics fetcher. Production:
// `readEnv()` returns the live `import.meta.env` object (Vite resolves the
// reference at build time so the call has no production cost beyond a property
// read). Tests: `__testHooks.setEnv(stub)` swaps the source so the URL read
// can be exercised without mutating the read-only `import.meta` record. NOTE:
// this reads `VITE_API_BASE_URL` only — never `VITE_USE_MOCKS`; the env gate
// is the shared `isLiveModeEnabled()` predicate, so this file holds no second
// gate.
let readEnv: () => SweepEnv = () => (import.meta as unknown as { env?: SweepEnv }).env ?? {};

// why: injectable time source + `__testHooks.setNow` swap point — the sentinel
// `updatedAt` and the populated `updatedAt` both flow through `now()` so tests
// can pin them deterministically. A bare `Date.now()` anywhere else in this
// file is forbidden; this initializer line is the only `Date.now` reference.
let now: () => number = () => Date.now();

/**
 * One-shot guard for the missing-`VITE_API_BASE_URL` warning. Flipped to
 * `true` after the first emission so the operator sees exactly one warning per
 * process lifetime (a page reload re-arms it once).
 */
let hasWarnedAboutMissingBaseUrl = false;

// why: D-24003 — one-shot guard set for the missing-auth-token fail-silent
// warning, passed to the shared `handleMissingAuthToken()`. Separate from the
// missing-URL guard above (no operator token vs no base URL).
const authTokenWarnOnce = new Set<string>();

// why: single cached resource — `GET /api/sweep/latest` ignores every query
// param (WP-209), so there is exactly ONE sweep resource for the whole
// process. A single module-level `Ref` (not a per-key Map like analytics) is
// the entire cache. `undefined` means "never fetched"; once set, the `Ref`'s
// `.value` is replaced by the async closure on a successful fetch and Vue
// reactivity propagates the update to the widget.
let sweepHealthCache: Ref<ServiceResponse<SweepHealthSnapshot>> | undefined;

/**
 * Object-envelope guard. Returns `true` iff `value` matches the sweep wire
 * shape `{ data: { latest: SweepRunSummary | null, recentRuns: [...] } }`:
 * `data` is a non-null object, `latest` is `null` or a non-null object, and
 * `recentRuns` is an array of non-null objects. This is the ONE structural
 * deviation from the analytics `{ data: readonly T[] }` array guard.
 * Intentionally lightweight — per-field schema validation is the drift test's
 * job, not this guard's.
 */
export function isValidSweepEnvelope(value: unknown): value is { data: SweepHealthSnapshot } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const data = (value as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const latest = (data as { latest?: unknown }).latest;
  // `latest` is allowed to be `null` (pre-first-run empty state) OR a non-null
  // object; any other value (number, string, undefined/missing key) is invalid.
  // `null` is excluded first, so a remaining `typeof === 'object'` is non-null.
  if (latest !== null && typeof latest !== 'object') {
    return false;
  }
  const recentRuns = (data as { recentRuns?: unknown }).recentRuns;
  if (!Array.isArray(recentRuns)) {
    return false;
  }
  for (const run of recentRuns) {
    if (typeof run !== 'object' || run === null) {
      return false;
    }
  }
  return true;
}

/**
 * Live empty sentinel factory. Emits the initial-state `ServiceResponse` the
 * fetcher returns before the network fetch resolves (and the value returned on
 * every error path, subject to the sentinel non-regression invariant — once
 * the cached ref holds successfully-fetched data, no path overwrites it back
 * to a sentinel). The object shape `{ latest: null, recentRuns: [] }` is the
 * sweep-specific empty payload (analytics uses `[]`).
 */
function makeLiveEmptySentinel(): ServiceResponse<SweepHealthSnapshot> {
  // why: `updatedAt` uses the injectable `now()`, never a bare `Date.now()`,
  // so the sentinel timestamp is deterministic under `__testHooks.setNow`.
  return { data: { latest: null, recentRuns: [] }, updatedAt: now(), source: 'LIVE' };
}

/**
 * Emit the missing-URL warning exactly once per process via the module-level
 * boolean guard. Subsequent calls short-circuit.
 */
function warnAboutMissingBaseUrlOnce(): void {
  if (hasWarnedAboutMissingBaseUrl) {
    return;
  }
  hasWarnedAboutMissingBaseUrl = true;
  console.warn(MISSING_BASE_URL_WARNING);
}

/**
 * DEV-only structured debug log for a fetch failure. Centralized so the
 * DEV-gating discipline is enforced in one place; production builds skip the
 * emission entirely (the fail-silent sentinel posture means production
 * operators see the widget's `empty` arm and inspect via browser devtools).
 */
function debugLogFetchFailure(url: string, kind: string, detail: string): void {
  // why: console policy — `import.meta.env.DEV` (via `readEnv().DEV`) gates the
  // dev-tier output; this is the DEV-only console emission required by EC-269
  // §Fail-silent. The one-shot missing-URL `console.warn` above is separate and
  // stays always-on so a LIVE deploy misconfiguration is loud in production.
  if (readEnv().DEV) {
    console.debug(`[sweep] LIVE fetch ${url} ${kind}: ${detail}; preserving prior cache state.`);
  }
}

/**
 * LIVE-mode fetcher for the sweep-health surface. Synchronous getter: returns
 * a `ServiceResponse<SweepHealthSnapshot>` immediately (the cached value from a
 * prior call, or a fresh live empty sentinel whose backing `Ref` an in-flight
 * fetch will replace). Vue reactivity propagates fetch completion to the
 * composable + widget transparently. NEVER returns a `Promise`.
 *
 * @param range Accepted for signature parity with `mockSweepHealth(range, nowMs)`.
 * @param _nowMs Accepted for parity with the mock; LIVE timestamps come from
 *   the module-private `now()` at response time, so this is ignored.
 */
export function fetchSweepHealthLive(
  range: DateRange,
  _nowMs: number,
): ServiceResponse<SweepHealthSnapshot> {
  // why: `range` keeps this getter's signature byte-identical to
  // `mockSweepHealth(range, nowMs)` so the `mocks.ts` alias swap needs no
  // call-site change. The endpoint ignores all query params (API v1, WP-209),
  // so `range` is intentionally NOT serialized into the request URL — this
  // documented no-op references it so it reads as deliberate, not forgotten.
  void range;
  if (!isLiveModeEnabled()) {
    warnAboutMissingBaseUrlOnce();
    return makeLiveEmptySentinel();
  }
  if (sweepHealthCache !== undefined) {
    return sweepHealthCache.value;
  }
  const token = readAuthToken();
  const liveRef = ref<ServiceResponse<SweepHealthSnapshot>>(makeLiveEmptySentinel());
  if (token === null) {
    // why: D-24003 null-token fail-silent — same shape as the missing-URL case;
    // the cache is intentionally NOT seeded so a later call after the operator
    // signs in retries with the now-present token.
    return handleMissingAuthToken(liveRef, authTokenWarnOnce);
  }
  // why: cache-write-before-fetch is the dedup mechanism — the cached `Ref`
  // MUST be seeded BEFORE the async closure fires so a same-tick second call
  // hits the cached-branch return above and skips the fetch. Net invariant: at
  // most ONE network request per resource for the process lifetime. Inverting
  // the seed and the fetch is a hard fail caught by the single-request test.
  sweepHealthCache = liveRef;
  const url = `${readEnv().VITE_API_BASE_URL}/api/sweep/latest`;
  void (async () => {
    try {
      const response = await fetch(url, buildLiveRequestOptions(token));
      if (!response.ok) {
        debugLogFetchFailure(url, 'returned non-200', `HTTP ${response.status}`);
        return;
      }
      const payload: unknown = await response.json();
      if (!isValidSweepEnvelope(payload)) {
        debugLogFetchFailure(url, 'returned invalid envelope', 'shape mismatch');
        return;
      }
      // why (D-20703): `payload.data` is copied verbatim into the cached
      // response — `anomalyCounts` keys ride along untouched and are NEVER
      // enumerated or branched on here. The dashboard treats anomaly keys as
      // opaque strings, so unknown future engine keys render automatically with
      // no rebuild. `updatedAt` is captured at RESPONSE time via `now()`.
      liveRef.value = { data: payload.data, updatedAt: now(), source: 'LIVE' };
    } catch (error: unknown) {
      // why: fail-silent posture + sentinel non-regression — on first-time
      // failure the empty sentinel is preserved, and on any later failure the
      // previously-populated data is preserved (this branch never overwrites
      // the cached `Ref`). No raw error ever reaches the widget surface. The
      // entire closure — including `await response.json()` above — is wrapped
      // so no rejection escapes as an unhandled promise rejection.
      const message = error instanceof Error ? error.message : String(error);
      debugLogFetchFailure(url, 'rejected', message);
    }
  })();
  return liveRef.value;
}

// why: test-only escape hatch. Production code NEVER invokes `__testHooks`.
// Mirrors the analytics seam set (`setNow` / `setEnv` / `resetWarningGuard`)
// plus `clearCache` (singular — there is one cached resource, not a Map).
export const __testHooks = {
  /**
   * Swap the module-private `now` function for test determinism. Tests reset
   * the clock in teardown so subsequent tests don't inherit a frozen clock.
   */
  setNow(fn: () => number): void {
    now = fn;
  },
  /**
   * Swap the module-private env source for test determinism. Production code
   * never invokes this; Vite resolves `import.meta.env` at build time and the
   * default `readEnv` returns the resolved object. NOTE: this controls only the
   * URL read in this module; the LIVE gate is driven by the analytics module's
   * `__testHooks.setEnv` (the shared `isLiveModeEnabled` source).
   */
  setEnv(env: SweepEnv | undefined): void {
    readEnv = () => env ?? {};
  },
  /**
   * Reset the one-shot missing-URL warning guard between tests so each test can
   * independently assert one-shot semantics. Production code never invokes this.
   */
  resetWarningGuard(): void {
    hasWarnedAboutMissingBaseUrl = false;
  },
  /**
   * Drop the cached sweep resource so cache-hit tests start from a known-empty
   * state. Singular (`clearCache`) because there is exactly one cached
   * resource, not a per-key Map.
   */
  clearCache(): void {
    sweepHealthCache = undefined;
  },
};
