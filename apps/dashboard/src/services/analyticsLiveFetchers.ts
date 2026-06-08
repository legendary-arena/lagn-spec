import { ref, type Ref } from 'vue';
import type {
  ActivationFunnelStep,
  DateRange,
  RetentionCohort,
  ServiceResponse,
  TrafficSource,
} from '../types/index.js';

// ============================================================================
// WP-206 / EC-234 / D-20601 — LIVE-mode analytics fetchers.
//
// Three synchronous getter exports
// (`fetchTrafficSourcesLive` / `fetchActivationFunnelLive` /
// `fetchRetentionCohortsLive`) preserve the composable's
// `() => ServiceResponse<readonly T[]>` contract by backing each cache
// entry with a Vue `Ref<ServiceResponse>`. The async fetch closures are
// FILE-INTERNAL — no `export async function fetch*` here; the public
// API is strictly the synchronous getters plus the helpers
// (`isLiveModeEnabled` / `isValidEnvelope` / `makeLiveEmptySentinel` /
// `__testHooks`).
//
// See WP-206 §Non-Negotiable Constraints + EC-234 §Locked Values for
// the full enumeration of invariants enforced here.
//
// SPEC DEVIATION (documented in execution commit body): WP-206 §Locked
// LIVE-fetcher contract values shows the predicate body as
// `import.meta.env.VITE_USE_MOCKS !== 'true' && ...` with direct
// `import.meta.env` references. Under `node --import tsx --test`
// (the dashboard's test runner per `package.json`), `import.meta.env`
// is `undefined` — a direct `.VITE_USE_MOCKS` access throws TypeError
// before any test can assert. To satisfy BOTH the WP's behavioral
// contract (`isLiveModeEnabled()` returns `true` iff the three
// conditions hold on the env) AND the WP's test-coverage requirement
// (≥ 14 tests including `isLiveModeEnabled` truth table + DEV-gated
// console assertions), env access goes through a one-line indirection
// (`readEnv()`) swappable via `__testHooks.setEnv()`. The triple-AND
// predicate body is otherwise byte-identical to the locked text; the
// production runtime path resolves `readEnv()` to the live
// `import.meta.env` object on every call (Vite rewrites the inner
// reference at build time exactly as it would have on a direct
// reference).
// ============================================================================

/**
 * Locked warning text emitted when a fetcher runs with LIVE mode "on" but
 * `VITE_API_BASE_URL` is unset (or `isLiveModeEnabled()` flips false at
 * fetch time for any other reason — e.g. mid-execution env-var corruption).
 * Byte-identical to EC-234 §Locked Values; drifting the string is a
 * Pre-Commit Failure Smell.
 */
// why: D-20601 + EC-234 §Locked Values — exact text is the only string in
// source that references the env-var name; copied verbatim per the locked-
// values contract so a future ops-doc reader can grep for the constant
// across logs and the source tree and land on the same byte sequence.
const MISSING_BASE_URL_WARNING =
  '[analytics] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.';

/**
 * Locked fetch-options shape. Every analytics LIVE fetch passes this exact
 * object. `credentials: 'include'` forwards the operator's Hanko session
 * cookie cross-origin (dashboard.legendary-arena.com → api.legendary-arena.com)
 * — the server's CORS allowlist receives the dashboard origin in this WP's
 * paired server-side edit.
 */
// why: D-20601 cookie-credentials auth posture — no Bearer header
// construction at the dashboard layer; the operator's CF-Access-gated
// browser session already carries a valid Hanko cookie, so `'include'`
// is the only path that gets it onto the cross-origin request.
const FETCH_OPTIONS: RequestInit = {
  credentials: 'include',
  headers: { Accept: 'application/json' },
};

/**
 * Subset of `ImportMetaEnv` this module actually reads. Kept narrow on
 * purpose so the test-injection hook (`__testHooks.setEnv`) only has to
 * supply the fields under test, not the full Vite env shape.
 */
interface AnalyticsEnv {
  VITE_USE_MOCKS?: string;
  VITE_API_BASE_URL?: string;
  DEV?: boolean;
}

// why: D-20601 single-source-of-truth LIVE gate (with test-injection
// seam). Production: `readEnv()` returns the live `import.meta.env`
// object as a `Partial<AnalyticsEnv>`; Vite has resolved the reference
// at build time so the function call has no production cost beyond a
// property read. Tests: `__testHooks.setEnv(stub)` swaps the source so
// the predicate can be exercised across its full truth table without
// trying to mutate the read-only `import.meta` per module record.
let readEnv: () => AnalyticsEnv = () =>
  (import.meta as unknown as { env?: AnalyticsEnv }).env ?? {};

// why: D-20601 injectable-time-source + `__testHooks.setNow` swap point —
// every timestamp capture in this module MUST flow through `now()` so
// tests can drive deterministic time. Direct `Date#now` calls elsewhere
// in this file are FORBIDDEN; the audit grep allows exactly one
// `Date#now` match (this initializer line) and any extra match is a
// HARD FAIL on the injectable-time invariant.
let now: () => number = () => Date.now();

/**
 * One-shot guard for the missing-`VITE_API_BASE_URL` warning. Module-level
 * boolean flipped to `true` after the first emission so the operator sees
 * exactly one warning per process lifetime (a fresh page reload re-arms it
 * once). Mirrors the WP-205 `userIdHash.ts` warn-once precedent.
 */
// why: D-20601 one-shot lifetime + EC-234 §Locked Values guard mechanism —
// prevents log-spam under repeated fetcher invocations in production while
// still surfacing the misconfiguration loudly on first hit. The reset
// happens implicitly on process restart; no manual clear path is exposed.
let hasWarnedAboutMissingBaseUrl = false;

/**
 * Single-source-of-truth LIVE-mode predicate. Consumed by `mocks.ts` (for
 * routing) AND by every LIVE fetcher in this module (for defensive
 * re-validation at fetch time). Returns `true` iff all three conditions
 * hold on the resolved env: `VITE_USE_MOCKS !== 'true'` AND
 * `VITE_API_BASE_URL` is a string AND `VITE_API_BASE_URL` is non-empty.
 * Any condition failing → MOCK mode (or, at fetch time, fall back to the
 * live empty sentinel + emit the one-shot warning).
 */
// why: D-20601 single-source-of-truth LIVE gate — defense against
// silent two-gate drift over the long tail of future edits. Inlining
// the env-var check at any other call site (either in `mocks.ts` or in
// a fetcher) is a Pre-Commit Failure Smell; the verification grep on
// `mocks.ts` requires ZERO `VITE_USE_MOCKS`/`VITE_API_BASE_URL` matches.
// The three conditions are evaluated literally on the env object
// resolved via `readEnv()` — semantics identical to the WP-206 §Locked
// LIVE-fetcher contract values text.
export function isLiveModeEnabled(): boolean {
  const env = readEnv();
  return (
    env.VITE_USE_MOCKS !== 'true' &&
    typeof env.VITE_API_BASE_URL === 'string' &&
    env.VITE_API_BASE_URL.length > 0
  );
}

/**
 * JSON envelope guard. Returns `true` iff `value` matches the WP-205
 * server-envelope shape `{ data: readonly T[] }`. Element-level schema
 * validation is the server's job per the WP-205 envelope contract; this
 * guard is intentionally structural so the dashboard's audit surface stays
 * a single line.
 */
// why: D-20601 JSON envelope guard reuse — one validator, three fetchers.
// Inline `Array.isArray(...)` at a fetcher call site is FORBIDDEN
// (single-validator HARD FAIL); the verification gate greps for that
// failure mode. Type-predicate form lets the call site narrow `unknown`
// to `{ data: readonly T[] }` without an extra cast.
export function isValidEnvelope<T>(value: unknown): value is { data: readonly T[] } {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as { data?: unknown }).data)
  );
}

/**
 * Live empty sentinel factory. Emits the initial-state `ServiceResponse`
 * a LIVE fetcher returns before the network fetch resolves (and also the
 * value returned on every error path, subject to the sentinel
 * non-regression invariant — once a cached ref's `.value` has been
 * replaced with successfully-fetched data, no path may overwrite it back
 * to a sentinel).
 *
 * The `Live` prefix is deliberate: at every cache-touch point downstream
 * a reader can grep for the factory name and immediately know whether
 * the value came from the MOCK side or the LIVE side. Renaming to
 * `makeEmptySentinel` is a Pre-Commit Failure Smell (locked-naming
 * HARD FAIL).
 */
// why: D-20601 empty-sentinel error-path posture + widget `empty` arm
// fallback + the `Live` prefix's disambiguation role. v1 has no
// stale-while-revalidate, so the `LIVE` literal is the only source
// label emitted (no `CACHED`). `updatedAt` uses `now()` not
// `Date#now` so the test hook can pin it.
function makeLiveEmptySentinel<T>(): ServiceResponse<readonly T[]> {
  return { data: [], updatedAt: now(), source: 'LIVE' };
}

// why: D-20601 + EC-234 §Locked Values — test-only escape hatch. Production
// code NEVER invokes `__testHooks`; the verification grep on non-test source
// files counts call sites = 0. Tests use `__testHooks.setNow(fn)` to inject
// a deterministic clock, `__testHooks.setEnv(stub)` to inject env values,
// and the reset / cache-clear helpers to keep cross-test state isolated.
export const __testHooks = {
  /**
   * Swap the module-private `now` function for test determinism. Tests
   * must reset the clock in teardown so subsequent tests don't inherit
   * a frozen clock (the `afterEach` block restores `() => current epoch ms`).
   */
  setNow(fn: () => number): void {
    now = fn;
  },
  /**
   * Swap the module-private env source for test determinism. Production
   * code never invokes this method; Vite resolves `import.meta.env` at
   * build time and the default `readEnv` returns the resolved object.
   */
  setEnv(env: AnalyticsEnv | undefined): void {
    readEnv = () => env ?? {};
  },
  /**
   * Reset the one-shot missing-URL warning guard between tests so each
   * test can independently assert one-shot semantics. Production code
   * never invokes this method.
   */
  resetWarningGuard(): void {
    hasWarnedAboutMissingBaseUrl = false;
  },
  /**
   * Drop all per-fetcher cache entries. Tests that exercise cache-hit
   * paths use this to start each case from a known-empty state.
   */
  clearAllCaches(): void {
    trafficSourcesCache.clear();
    activationFunnelCache.clear();
    retentionCohortsCache.clear();
  },
  /**
   * Test-only export of `makeLiveEmptySentinel` so cache-state
   * assertions can compare against a freshly-constructed sentinel
   * without re-exporting the factory itself (which is intentionally
   * file-internal so production callers cannot construct one outside
   * the fetcher path).
   */
  makeLiveEmptySentinel,
};

// why: D-20601 per-key cache discipline + Vue reactivity bridge — each
// fetcher owns a module-level `Map<key, Ref<ServiceResponse>>`. SPA-
// lifetime persistence; no TTL, no background refetch (deferred to a
// future polish WP). The `Ref` wrap is what lets the composable's
// synchronous `() => ServiceResponse` getter contract bridge async
// fetch completion — Vue tracks `ref.value` reads and re-evaluates the
// composable downstream when the fetch closure replaces the value.
const trafficSourcesCache = new Map<DateRange, Ref<ServiceResponse<readonly TrafficSource[]>>>();
const activationFunnelCache = new Map<
  DateRange,
  Ref<ServiceResponse<readonly ActivationFunnelStep[]>>
>();
const retentionCohortsCache = new Map<number, Ref<ServiceResponse<readonly RetentionCohort[]>>>();

/**
 * Emit the missing-URL warning exactly once per process via the module-
 * level boolean guard. Subsequent calls short-circuit. This is the ONLY
 * console output permitted to fire in production builds (see the console
 * policy enumerated in WP-206 §Non-Negotiable Constraints).
 */
function warnAboutMissingBaseUrlOnce(): void {
  if (hasWarnedAboutMissingBaseUrl) {
    return;
  }
  hasWarnedAboutMissingBaseUrl = true;
  console.warn(MISSING_BASE_URL_WARNING);
}

/**
 * Construct the absolute URL for an analytics endpoint, anchored on the
 * `VITE_API_BASE_URL` env value. Callers MUST have verified
 * `isLiveModeEnabled()` is true before invoking — the function assumes
 * the env var is a non-empty string. Closed-set inputs (`DateRange` /
 * positive-integer `cohortCount`) flow through WP-205's server-side
 * route validator BEFORE reaching SQL, so `encodeURIComponent` is not
 * required on the query-string values.
 */
function buildAnalyticsUrl(path: string, query: string): string {
  return `${readEnv().VITE_API_BASE_URL}${path}?${query}`;
}

/**
 * DEV-only structured debug log for a fetch failure. Centralized in a
 * single helper so the DEV-gating discipline is enforced in one place;
 * call sites pass a structured tag so the message stays grep-friendly.
 */
function debugLogFetchFailure(url: string, kind: string, detail: string): void {
  // why: D-20601 console policy — `import.meta.env.DEV` (via
  // `readEnv().DEV`) gates dev-tier output; production builds skip the
  // emission entirely. The fail-silent empty-sentinel posture means
  // production operators see the widget's `empty` arm and inspect via
  // browser devtools when needed; structured error display is deferred
  // to a future error-UX hardening WP.
  if (readEnv().DEV) {
    console.debug(`[analytics] LIVE fetch ${url} ${kind}: ${detail}; preserving empty sentinel.`);
  }
}

/**
 * LIVE-mode fetcher for the traffic-sources widget. Synchronous getter:
 * returns a `ServiceResponse<readonly TrafficSource[]>` immediately
 * (either the cached value from a prior call, or a fresh live empty
 * sentinel whose backing `Ref` will be updated by an in-flight fetch).
 * Vue reactivity propagates fetch completion to the composable + widget
 * transparently.
 *
 * The second `_nowMs` parameter is accepted to keep the function
 * signature byte-identical to `mockTrafficSources(range, nowMs)` — the
 * widget call site `fetchTrafficSources(range.value, nowMs)` stays
 * unchanged pre/post LIVE flip. LIVE-mode timestamps come from the
 * module-private `now()` (captured at RESPONSE time), so `_nowMs` is
 * deliberately ignored here.
 */
export function fetchTrafficSourcesLive(
  range: DateRange,
  _nowMs: number,
): ServiceResponse<readonly TrafficSource[]> {
  if (!isLiveModeEnabled()) {
    warnAboutMissingBaseUrlOnce();
    return makeLiveEmptySentinel<TrafficSource>();
  }
  const cached = trafficSourcesCache.get(range);
  if (cached !== undefined) {
    return cached.value;
  }
  // why: D-20601 cache-write-before-fetch invariant — `cache.set` MUST
  // precede the async fetch closure invocation so concurrent same-tick
  // callers see the populated cache on step (2) and skip directly to
  // the cached-branch return above. Exactly ONE network fetch per
  // (range, process) is initiated. Inverting (2) and (3) is a HARD
  // FAIL caught by the two-same-tick test in the paired test file.
  const liveRef =
    ref<ServiceResponse<readonly TrafficSource[]>>(makeLiveEmptySentinel<TrafficSource>());
  trafficSourcesCache.set(range, liveRef);
  const url = buildAnalyticsUrl('/api/analytics/traffic-sources', `range=${range}`);
  void (async () => {
    try {
      const response = await fetch(url, FETCH_OPTIONS);
      if (!response.ok) {
        debugLogFetchFailure(url, 'returned non-200', `HTTP ${response.status}`);
        return;
      }
      const payload: unknown = await response.json();
      if (!isValidEnvelope<TrafficSource>(payload)) {
        debugLogFetchFailure(url, 'returned invalid envelope', 'shape mismatch');
        return;
      }
      // why: D-20601 capture-timing lock — `updatedAt` is captured at
      // network RESPONSE time (here, immediately before the cached
      // ref is replaced) via the injectable `now()`. The sentinel
      // emission captured `now()` at its own build-time; the two
      // timestamps differ by however long the fetch took, which is
      // exactly the freshness signal the widget's
      // "LIVE · just now → LIVE · 12s ago" chip surfaces.
      liveRef.value = { data: payload.data, updatedAt: now(), source: 'LIVE' };
    } catch (error: unknown) {
      // why: D-20601 fail-silent posture + sentinel non-regression —
      // the empty sentinel from initial emission is preserved on
      // first-time failure, and any previously-populated data is
      // preserved on subsequent failure (v1 never re-enters the
      // cache-miss branch for an existing key; the future SWR /
      // refetch WPs inherit the invariant). No raw error message
      // ever reaches the widget surface — leakage HARD FAIL per the
      // D-20601 leakage gate.
      const message = error instanceof Error ? error.message : String(error);
      debugLogFetchFailure(url, 'rejected', message);
    }
  })();
  return liveRef.value;
}

/**
 * LIVE-mode fetcher for the activation-funnel widget. Same shape as
 * `fetchTrafficSourcesLive` — per-`DateRange` keyed module-level cache,
 * synchronous getter contract, cache-write-before-fetch ordering. The
 * `_nowMs` parameter is accepted for `mockActivationFunnel` signature
 * parity and is intentionally ignored.
 */
export function fetchActivationFunnelLive(
  range: DateRange,
  _nowMs: number,
): ServiceResponse<readonly ActivationFunnelStep[]> {
  if (!isLiveModeEnabled()) {
    warnAboutMissingBaseUrlOnce();
    return makeLiveEmptySentinel<ActivationFunnelStep>();
  }
  const cached = activationFunnelCache.get(range);
  if (cached !== undefined) {
    return cached.value;
  }
  // why: D-20601 cache-write-before-fetch invariant (see
  // fetchTrafficSourcesLive for full rationale).
  const liveRef =
    ref<ServiceResponse<readonly ActivationFunnelStep[]>>(
      makeLiveEmptySentinel<ActivationFunnelStep>(),
    );
  activationFunnelCache.set(range, liveRef);
  const url = buildAnalyticsUrl('/api/analytics/activation-funnel', `range=${range}`);
  void (async () => {
    try {
      const response = await fetch(url, FETCH_OPTIONS);
      if (!response.ok) {
        debugLogFetchFailure(url, 'returned non-200', `HTTP ${response.status}`);
        return;
      }
      const payload: unknown = await response.json();
      if (!isValidEnvelope<ActivationFunnelStep>(payload)) {
        debugLogFetchFailure(url, 'returned invalid envelope', 'shape mismatch');
        return;
      }
      // why: D-20601 capture-timing lock — `updatedAt` at RESPONSE
      // time via the injectable `now()` (see fetchTrafficSourcesLive
      // for the full freshness-chip rationale).
      liveRef.value = { data: payload.data, updatedAt: now(), source: 'LIVE' };
    } catch (error: unknown) {
      // why: D-20601 fail-silent posture + sentinel non-regression
      // (see fetchTrafficSourcesLive for the full leakage-gate
      // rationale).
      const message = error instanceof Error ? error.message : String(error);
      debugLogFetchFailure(url, 'rejected', message);
    }
  })();
  return liveRef.value;
}

/**
 * LIVE-mode fetcher for the retention-cohorts widget. Same shape as the
 * other two fetchers but keyed by `cohortCount` (integer) rather than
 * `DateRange`. The `_nowMs` parameter is accepted for
 * `mockRetentionCohorts` signature parity and is intentionally ignored.
 */
export function fetchRetentionCohortsLive(
  cohortCount: number,
  _nowMs: number,
): ServiceResponse<readonly RetentionCohort[]> {
  if (!isLiveModeEnabled()) {
    warnAboutMissingBaseUrlOnce();
    return makeLiveEmptySentinel<RetentionCohort>();
  }
  const cached = retentionCohortsCache.get(cohortCount);
  if (cached !== undefined) {
    return cached.value;
  }
  // why: D-20601 cache-write-before-fetch invariant (see
  // fetchTrafficSourcesLive for full rationale).
  const liveRef =
    ref<ServiceResponse<readonly RetentionCohort[]>>(makeLiveEmptySentinel<RetentionCohort>());
  retentionCohortsCache.set(cohortCount, liveRef);
  const url = buildAnalyticsUrl('/api/analytics/retention-cohorts', `cohortCount=${cohortCount}`);
  void (async () => {
    try {
      const response = await fetch(url, FETCH_OPTIONS);
      if (!response.ok) {
        debugLogFetchFailure(url, 'returned non-200', `HTTP ${response.status}`);
        return;
      }
      const payload: unknown = await response.json();
      if (!isValidEnvelope<RetentionCohort>(payload)) {
        debugLogFetchFailure(url, 'returned invalid envelope', 'shape mismatch');
        return;
      }
      // why: D-20601 capture-timing lock — `updatedAt` at RESPONSE
      // time via the injectable `now()` (see fetchTrafficSourcesLive
      // for the full freshness-chip rationale).
      liveRef.value = { data: payload.data, updatedAt: now(), source: 'LIVE' };
    } catch (error: unknown) {
      // why: D-20601 fail-silent posture + sentinel non-regression
      // (see fetchTrafficSourcesLive for the full leakage-gate
      // rationale).
      const message = error instanceof Error ? error.message : String(error);
      debugLogFetchFailure(url, 'rejected', message);
    }
  })();
  return liveRef.value;
}
