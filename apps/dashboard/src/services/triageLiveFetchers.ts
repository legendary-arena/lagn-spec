import { ref, type Ref } from 'vue';
import type { ServiceResponse } from '../types/index.js';
import type { HandoffLatestData, HandoffStatusCounts, InspectionLatestData } from '../types/triage.js';
// why (D-20601, reused): the LIVE gate is the SHARED single-source-of-truth
// predicate `isLiveModeEnabled` IMPORTED from the analytics module, never
// re-derived here. Two independently-inlined env-var checks would drift
// silently over the long tail of future edits, surfacing only when production
// diverged from local-dev. `mocks.ts` holds no second gate either.
import { isLiveModeEnabled } from './analyticsLiveFetchers.js';

// ============================================================================
// WP-239 / EC-270 / D-23903 — LIVE-mode triage fetchers.
//
// Two synchronous getter exports (`fetchInspectionTriageLive` +
// `fetchHandoffChainLive`) preserve each composable input's
// `() => ServiceResponse<T>` contract by backing the cache with a Vue
// `Ref<ServiceResponse>`. The async fetch closures are FILE-INTERNAL — the
// public API is the two getters plus the helpers (`isValidInspectionEnvelope` /
// `isValidHandoffEnvelope` / `__testHooks`).
//
// This file mirrors `sweepLiveFetchers.ts` (read it for the full structural
// rationale). Each endpoint serves an OBJECT envelope and ignores all query
// params, so each is ONE cached resource (a single module-level `Ref`, not a
// per-key Map). The two object guards are deliberately lightweight (structural
// shape only); per-field + the 6 `counts` keys are the drift test's job.
// ============================================================================

const MISSING_BASE_URL_WARNING =
  '[triage] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.';

/**
 * Locked fetch-options shape. Every triage LIVE fetch passes this exact object,
 * identical to the analytics + sweep LIVE fetchers.
 */
// why (WP-112 session parity): `credentials: 'include'` forwards the operator's
// authenticated session cookie cross-origin exactly as the shipped analytics +
// sweep fetchers do; `GET /api/inspection/latest` and `GET /api/handoffs/latest`
// are both `authenticated-session-required`, so omitting the cookie 401s. No
// Bearer header is constructed at the dashboard layer.
const FETCH_OPTIONS: RequestInit = {
  credentials: 'include',
  headers: { Accept: 'application/json' },
};

/**
 * Subset of `ImportMetaEnv` this module reads: `VITE_API_BASE_URL` for the
 * request URL and `DEV` for dev-only debug logging. The boolean LIVE gate is
 * delegated to `isLiveModeEnabled()` and is NOT re-read here.
 */
interface TriageEnv {
  VITE_API_BASE_URL?: string;
  DEV?: boolean;
}

// why: test-injection seam matching the sweep/analytics fetchers. Production:
// `readEnv()` returns the live `import.meta.env` object. Tests:
// `__testHooks.setEnv(stub)` swaps the source. This reads `VITE_API_BASE_URL`
// only — never the use-mocks flag; the gate is the shared `isLiveModeEnabled()`.
let readEnv: () => TriageEnv = () => (import.meta as unknown as { env?: TriageEnv }).env ?? {};

// why: injectable time source + `__testHooks.setNow` swap point — every
// `updatedAt` flows through `now()` so tests can pin it. A bare `Date.now()`
// anywhere else in this file is forbidden; this initializer is the only one.
let now: () => number = () => Date.now();

/**
 * One-shot guard for the missing-`VITE_API_BASE_URL` warning. Flipped after the
 * first emission so the operator sees exactly one warning per process lifetime.
 */
let hasWarnedAboutMissingBaseUrl = false;

// why: single cached resource per endpoint — both endpoints ignore every query
// param, so there is exactly ONE inspection resource and ONE handoff resource
// for the whole process. `undefined` means "never fetched"; once set, the
// async closure replaces the `Ref`'s `.value` on a successful fetch and Vue
// reactivity propagates the update.
let inspectionCache: Ref<ServiceResponse<InspectionLatestData>> | undefined;
let handoffCache: Ref<ServiceResponse<HandoffLatestData>> | undefined;

// The all-zero counts the handoff empty sentinel carries before any fetch.
const ZERO_HANDOFF_COUNTS: HandoffStatusCounts = {
  open: 0,
  claimed: 0,
  fixProposed: 0,
  escalated: 0,
  resolved: 0,
  wontFix: 0,
};

/**
 * Object-envelope guard for `GET /api/inspection/latest`. Returns `true` iff
 * `value` matches `{ data: { latest: object | null, recentReports: array } }`.
 * Structural depth only — per-field validation is the drift test's job.
 */
export function isValidInspectionEnvelope(value: unknown): value is { data: InspectionLatestData } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const data = (value as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const latest = (data as { latest?: unknown }).latest;
  // `latest` is allowed to be `null` (pre-first-run) OR a non-null object.
  if (latest !== null && typeof latest !== 'object') {
    return false;
  }
  return Array.isArray((data as { recentReports?: unknown }).recentReports);
}

/**
 * Object-envelope guard for `GET /api/handoffs/latest`. Returns `true` iff
 * `value` matches `{ data: { reportId: string | null, handoffs: array,
 * counts: object } }`. Structural depth only — the 6 `counts` keys are asserted
 * by the drift test and read defensively (`?? 0`) by the composable.
 */
export function isValidHandoffEnvelope(value: unknown): value is { data: HandoffLatestData } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const data = (value as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const reportId = (data as { reportId?: unknown }).reportId;
  // `reportId` is allowed to be `null` (empty) OR a string; the KEY must exist.
  if (reportId !== null && typeof reportId !== 'string') {
    return false;
  }
  if (!Array.isArray((data as { handoffs?: unknown }).handoffs)) {
    return false;
  }
  const counts = (data as { counts?: unknown }).counts;
  return typeof counts === 'object' && counts !== null;
}

/**
 * Live empty sentinel for the inspection resource — `{ latest: null,
 * recentReports: [] }` is the pre-first-run / pre-fetch payload.
 */
function makeInspectionSentinel(): ServiceResponse<InspectionLatestData> {
  return { data: { latest: null, recentReports: [] }, updatedAt: now(), source: 'LIVE' };
}

/**
 * Live empty sentinel for the handoff resource — `{ reportId: null,
 * handoffs: [], counts: <all-zero> }`.
 */
function makeHandoffSentinel(): ServiceResponse<HandoffLatestData> {
  return {
    data: { reportId: null, handoffs: [], counts: ZERO_HANDOFF_COUNTS },
    updatedAt: now(),
    source: 'LIVE',
  };
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
 * DEV-only structured debug log for a fetch failure. Production builds skip the
 * emission entirely (fail-silent sentinel posture).
 */
function debugLogFetchFailure(url: string, kind: string, detail: string): void {
  // why: console policy — `import.meta.env.DEV` (via `readEnv().DEV`) gates the
  // dev-tier output; the always-on one-shot missing-URL `console.warn` above is
  // separate so a LIVE deploy misconfiguration stays loud in production.
  if (readEnv().DEV) {
    console.debug(`[triage] LIVE fetch ${url} ${kind}: ${detail}; preserving prior cache state.`);
  }
}

/**
 * LIVE-mode fetcher for `GET /api/inspection/latest`. Synchronous getter:
 * returns the cached value or a fresh live empty sentinel whose backing `Ref`
 * an in-flight fetch replaces. NEVER returns a `Promise`.
 *
 * @param _nowMs Accepted for parity with `mockInspectionTriage(nowMs)`; LIVE
 *   timestamps come from the module-private `now()` at response time.
 */
export function fetchInspectionTriageLive(_nowMs: number): ServiceResponse<InspectionLatestData> {
  if (!isLiveModeEnabled()) {
    warnAboutMissingBaseUrlOnce();
    return makeInspectionSentinel();
  }
  if (inspectionCache !== undefined) {
    return inspectionCache.value;
  }
  // why: cache-write-before-fetch dedup — seed the cached `Ref` BEFORE the async
  // closure fires so a same-tick second call hits the cached branch and skips
  // the fetch. At most ONE network request per resource for the process lifetime.
  const liveRef = ref<ServiceResponse<InspectionLatestData>>(makeInspectionSentinel());
  inspectionCache = liveRef;
  const url = `${readEnv().VITE_API_BASE_URL}/api/inspection/latest`;
  void (async () => {
    try {
      const response = await fetch(url, FETCH_OPTIONS);
      if (!response.ok) {
        debugLogFetchFailure(url, 'returned non-200', `HTTP ${response.status}`);
        return;
      }
      const payload: unknown = await response.json();
      if (!isValidInspectionEnvelope(payload)) {
        debugLogFetchFailure(url, 'returned invalid envelope', 'shape mismatch');
        return;
      }
      // why (D-20703): `payload.data` is copied verbatim — `anomalyClass` strings
      // ride along untouched, never enumerated or branched on here.
      liveRef.value = { data: payload.data, updatedAt: now(), source: 'LIVE' };
    } catch (error: unknown) {
      // why: fail-silent + sentinel non-regression — the prior cache state is
      // preserved on any failure; no raw error reaches the page surface.
      const message = error instanceof Error ? error.message : String(error);
      debugLogFetchFailure(url, 'rejected', message);
    }
  })();
  return liveRef.value;
}

/**
 * LIVE-mode fetcher for `GET /api/handoffs/latest`. Same shape as the inspection
 * fetcher with its own cached resource + object guard + sentinel.
 *
 * @param _nowMs Accepted for parity with `mockHandoffChain(nowMs)`; ignored.
 */
export function fetchHandoffChainLive(_nowMs: number): ServiceResponse<HandoffLatestData> {
  if (!isLiveModeEnabled()) {
    warnAboutMissingBaseUrlOnce();
    return makeHandoffSentinel();
  }
  if (handoffCache !== undefined) {
    return handoffCache.value;
  }
  // why: cache-write-before-fetch dedup (see fetchInspectionTriageLive).
  const liveRef = ref<ServiceResponse<HandoffLatestData>>(makeHandoffSentinel());
  handoffCache = liveRef;
  const url = `${readEnv().VITE_API_BASE_URL}/api/handoffs/latest`;
  void (async () => {
    try {
      const response = await fetch(url, FETCH_OPTIONS);
      if (!response.ok) {
        debugLogFetchFailure(url, 'returned non-200', `HTTP ${response.status}`);
        return;
      }
      const payload: unknown = await response.json();
      if (!isValidHandoffEnvelope(payload)) {
        debugLogFetchFailure(url, 'returned invalid envelope', 'shape mismatch');
        return;
      }
      // why (D-20703): `payload.data` copied verbatim; `anomalyClass` opaque.
      liveRef.value = { data: payload.data, updatedAt: now(), source: 'LIVE' };
    } catch (error: unknown) {
      // why: fail-silent + sentinel non-regression (see inspection fetcher).
      const message = error instanceof Error ? error.message : String(error);
      debugLogFetchFailure(url, 'rejected', message);
    }
  })();
  return liveRef.value;
}

// why: test-only escape hatch. Production code NEVER invokes `__testHooks`.
// Mirrors the sweep seam set plus a `clearCaches` that drops BOTH cached
// resources.
export const __testHooks = {
  setNow(fn: () => number): void {
    now = fn;
  },
  setEnv(env: TriageEnv | undefined): void {
    readEnv = () => env ?? {};
  },
  resetWarningGuard(): void {
    hasWarnedAboutMissingBaseUrl = false;
  },
  clearCaches(): void {
    inspectionCache = undefined;
    handoffCache = undefined;
  },
};
