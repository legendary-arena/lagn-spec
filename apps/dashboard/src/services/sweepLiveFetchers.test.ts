import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { __testHooks, fetchSweepHealthLive, isValidSweepEnvelope } from './sweepLiveFetchers.js';
import { __testHooks as analyticsTestHooks, isLiveModeEnabled } from './analyticsLiveFetchers.js';
import type { SweepHealthSnapshot, SweepRunSummary } from '../types/sweep.js';

// ============================================================================
// WP-238 / EC-269 / D-23801 — sweepLiveFetchers test coverage.
//
// Mirrors `analyticsLiveFetchers.test.ts` adapted for the sweep OBJECT
// envelope (`{ data: { latest, recentRuns } }`) and the single cached
// resource (the endpoint ignores query params per WP-209). Covers: the
// `isLiveModeEnabled` truth table (REUSING the shared analytics gate), the
// `isValidSweepEnvelope` object guard, sentinel-then-populate, cache dedupe
// (exactly one request), sentinel non-regression on error, network /
// HTTP-error / invalid-JSON / shape-mismatch paths, the one-shot missing-URL
// warning, `credentials: 'include'` presence, the query-free URL, DEV-only
// debug gating, and the three deterministic invariants (sentinel replaced not
// mutated; cached reference stable; in-flight guard yields one request).
//
// Env injection: the boolean LIVE gate lives in `analyticsLiveFetchers.ts`, so
// `analyticsTestHooks.setEnv` drives `isLiveModeEnabled()`; the sweep module's
// own `__testHooks.setEnv` drives only the `VITE_API_BASE_URL` read used to
// build the request URL. Both are set in `beforeEach` for the LIVE cases.
// ============================================================================

const LIVE_ENV = {
  VITE_USE_MOCKS: 'false',
  VITE_API_BASE_URL: 'http://localhost:8080',
  DEV: false,
};

interface FetchSpyCall {
  url: string;
  init?: RequestInit | undefined;
}

interface FetchSpy {
  calls: FetchSpyCall[];
  responder: (url: string, init?: RequestInit) => Promise<Response> | Response;
}

function installFetchSpy(
  responder: FetchSpy['responder'] = () =>
    new Response(JSON.stringify({ data: { latest: null, recentRuns: [] } }), { status: 200 }),
): FetchSpy {
  const spy: FetchSpy = { calls: [], responder };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    spy.calls.push({ url, init });
    return spy.responder(url, init);
  }) as typeof globalThis.fetch;
  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeRun(runId: string): SweepRunSummary {
  return {
    runId,
    submittedAt: '2026-06-10T00:00:00.000Z',
    startedAt: '2026-06-09T23:55:00.000Z',
    cellCount: 100,
    anomalyCounts: { 'endgame-reached': 80, 'soft-lock': 5 },
  };
}

function sweepEnvelope(
  latest: SweepRunSummary | null,
  recentRuns: readonly SweepRunSummary[],
): { data: SweepHealthSnapshot } {
  return { data: { latest, recentRuns } };
}

// Drain the microtask queue so the fire-and-forget fetch closure (await fetch +
// await json) completes before the assertion. One `setImmediate` tick is enough
// because both awaits are microtasks, drained before the next macrotask.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  // why: the gate is the shared analytics predicate, so its env source must be
  // set on the analytics module; the sweep module's env source supplies only
  // the URL base.
  analyticsTestHooks.setEnv(LIVE_ENV);
  __testHooks.setEnv(LIVE_ENV);
  __testHooks.setNow(() => 1_700_000_000_000);
  __testHooks.resetWarningGuard();
  __testHooks.clearCache();
});

afterEach(() => {
  analyticsTestHooks.setEnv(undefined);
  __testHooks.setEnv(undefined);
  __testHooks.setNow(() => Date.now());
  __testHooks.resetWarningGuard();
  __testHooks.clearCache();
});

// ----------------------------------------------------------------------------
// isLiveModeEnabled — truth table (reused shared gate, per WP-238 §Scope C)
// ----------------------------------------------------------------------------

test('1. isLiveModeEnabled returns true when both env conditions hold', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), true);
});

test('2. isLiveModeEnabled returns true when VITE_USE_MOCKS is unset (only URL required)', () => {
  analyticsTestHooks.setEnv({ VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), true);
});

test('3. isLiveModeEnabled returns false when VITE_USE_MOCKS = "true"', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'true', VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), false);
});

test('4. isLiveModeEnabled returns false when VITE_API_BASE_URL is undefined', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false' });
  assert.equal(isLiveModeEnabled(), false);
});

test('5. isLiveModeEnabled returns false when VITE_API_BASE_URL is empty string', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: '' });
  assert.equal(isLiveModeEnabled(), false);
});

// ----------------------------------------------------------------------------
// isValidSweepEnvelope — object-shape guard (the one deviation from analytics)
// ----------------------------------------------------------------------------

test('6. isValidSweepEnvelope accepts a populated { data: { latest, recentRuns } }', () => {
  assert.equal(isValidSweepEnvelope(sweepEnvelope(makeRun('r0'), [makeRun('r0')])), true);
});

test('7. isValidSweepEnvelope accepts latest: null with empty recentRuns (pre-first-run)', () => {
  assert.equal(isValidSweepEnvelope(sweepEnvelope(null, [])), true);
});

test('8. isValidSweepEnvelope rejects null, non-object data, and missing keys', () => {
  assert.equal(isValidSweepEnvelope(null), false);
  assert.equal(isValidSweepEnvelope('string'), false);
  assert.equal(isValidSweepEnvelope({}), false);
  assert.equal(isValidSweepEnvelope({ data: null }), false);
  assert.equal(isValidSweepEnvelope({ data: 'not-object' }), false);
  // `data` present but `recentRuns` key missing (latest absent too).
  assert.equal(isValidSweepEnvelope({ data: {} }), false);
  // `latest` present as a non-null non-object → invalid.
  assert.equal(isValidSweepEnvelope({ data: { latest: 5, recentRuns: [] } }), false);
});

test('9. isValidSweepEnvelope rejects a non-array recentRuns', () => {
  assert.equal(isValidSweepEnvelope({ data: { latest: null, recentRuns: 'nope' } }), false);
  assert.equal(isValidSweepEnvelope({ data: { latest: null, recentRuns: {} } }), false);
});

test('10. isValidSweepEnvelope rejects a recentRuns element that is not an object', () => {
  assert.equal(
    isValidSweepEnvelope({ data: { latest: null, recentRuns: [makeRun('r0'), 7] } }),
    false,
  );
  assert.equal(isValidSweepEnvelope({ data: { latest: null, recentRuns: [null] } }), false);
});

// ----------------------------------------------------------------------------
// Happy path — synchronous sentinel return + async populate
// ----------------------------------------------------------------------------

test('11. fetchSweepHealthLive returns the live empty sentinel synchronously on first call', () => {
  installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  const response = fetchSweepHealthLive('14d', 0);
  assert.deepEqual(response.data, { latest: null, recentRuns: [] });
  assert.equal(response.source, 'LIVE');
  assert.equal(response.updatedAt, 1_700_000_000_000);
});

test('12. fetchSweepHealthLive populates the cache from the network response (source = LIVE)', async () => {
  installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0'), makeRun('r1')])));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  const second = fetchSweepHealthLive('14d', 0);
  assert.equal(second.source, 'LIVE');
  assert.equal(second.data.latest?.runId, 'r0');
  assert.equal(second.data.recentRuns.length, 2);
});

test('13. updatedAt is captured at fetch RESPONSE time, not at sentinel emission', async () => {
  let clock = 1_000;
  __testHooks.setNow(() => clock);
  installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  const sentinel = fetchSweepHealthLive('14d', 0);
  assert.equal(sentinel.updatedAt, 1_000);
  clock = 1_500;
  await flushAsync();
  const populated = fetchSweepHealthLive('14d', 0);
  assert.equal(populated.updatedAt, 1_500);
});

test('14. anomalyCounts keys are copied verbatim (opaque, never enumerated)', async () => {
  const runWithOpaqueKeys: SweepRunSummary = {
    runId: 'r0',
    submittedAt: '2026-06-10T00:00:00.000Z',
    startedAt: '2026-06-09T23:55:00.000Z',
    cellCount: 10,
    anomalyCounts: { 'future-unknown-class': 3, 'endgame-reached': 7 },
  };
  installFetchSpy(() => jsonResponse(sweepEnvelope(runWithOpaqueKeys, [runWithOpaqueKeys])));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  const populated = fetchSweepHealthLive('14d', 0);
  assert.deepEqual(populated.data.latest?.anomalyCounts, {
    'future-unknown-class': 3,
    'endgame-reached': 7,
  });
});

// ----------------------------------------------------------------------------
// Caching + dedupe + single-resource invariants
// ----------------------------------------------------------------------------

test('15. Second call returns the cached ref without a second fetch', async () => {
  const spy = installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.equal(spy.calls.length, 1);
});

test('16. In-flight guard — multiple same-tick calls trigger exactly ONE network request', async () => {
  const spy = installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  fetchSweepHealthLive('14d', 0);
  fetchSweepHealthLive('14d', 0);
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.equal(spy.calls.length, 1);
});

test('17. range is ignored — different ranges share the single resource (one fetch, query-free URL)', async () => {
  const spy = installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  fetchSweepHealthLive('14d', 0);
  fetchSweepHealthLive('30d', 0);
  fetchSweepHealthLive('90d', 0);
  await flushAsync();
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0]?.url, 'http://localhost:8080/api/sweep/latest');
});

test('18. Cached reference is stable across calls when no update has occurred', () => {
  installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  const first = fetchSweepHealthLive('14d', 0);
  const second = fetchSweepHealthLive('14d', 0);
  assert.equal(first, second);
});

test('19. Sentinel is REPLACED (new identity), not mutated, on a successful fetch', async () => {
  installFetchSpy(() => jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')])));
  const sentinel = fetchSweepHealthLive('14d', 0);
  await flushAsync();
  const populated = fetchSweepHealthLive('14d', 0);
  assert.notEqual(populated, sentinel);
  // The original sentinel object was not mutated in place.
  assert.equal(sentinel.data.latest, null);
  assert.deepEqual(sentinel.data.recentRuns, []);
});

// ----------------------------------------------------------------------------
// Error paths — every failure mode preserves prior cache state, no throw
// ----------------------------------------------------------------------------

test('20. Network reject → live empty sentinel preserved (no exception propagates)', async () => {
  installFetchSpy(() => Promise.reject(new Error('network down')));
  assert.doesNotThrow(() => fetchSweepHealthLive('14d', 0));
  await flushAsync();
  const response = fetchSweepHealthLive('14d', 0);
  assert.deepEqual(response.data, { latest: null, recentRuns: [] });
  assert.equal(response.source, 'LIVE');
});

test('21. HTTP 401 / 500 → live empty sentinel preserved', async () => {
  installFetchSpy(() => new Response('Unauthorized', { status: 401 }));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.deepEqual(fetchSweepHealthLive('14d', 0).data, { latest: null, recentRuns: [] });

  __testHooks.clearCache();
  installFetchSpy(() => new Response('Internal Server Error', { status: 500 }));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.deepEqual(fetchSweepHealthLive('14d', 0).data, { latest: null, recentRuns: [] });
});

test('22. Invalid JSON in the response body → live empty sentinel preserved', async () => {
  installFetchSpy(() => new Response('not-json {{', { status: 200 }));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.deepEqual(fetchSweepHealthLive('14d', 0).data, { latest: null, recentRuns: [] });
});

test('23. Payload shape mismatch (analytics array shape) → live empty sentinel preserved', async () => {
  // The analytics `{ data: [] }` array envelope is INVALID for sweep — the
  // guard must reject it and the sentinel must survive.
  installFetchSpy(() => jsonResponse({ data: [] }));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.deepEqual(fetchSweepHealthLive('14d', 0).data, { latest: null, recentRuns: [] });
});

test('24. Sentinel non-regression — populated cache survives a subsequent fetch-rejection', async () => {
  let shouldReject = false;
  installFetchSpy(() => {
    if (shouldReject) {
      return Promise.reject(new Error('network down'));
    }
    return jsonResponse(sweepEnvelope(makeRun('r0'), [makeRun('r0')]));
  });
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  shouldReject = true;
  // Cache is populated, so this call returns the cached data WITHOUT refetching
  // (cache-presence means no second request) — populated data never regresses.
  const populated = fetchSweepHealthLive('14d', 0);
  assert.equal(populated.data.latest?.runId, 'r0');
  assert.equal(populated.source, 'LIVE');
});

// ----------------------------------------------------------------------------
// Missing-URL one-shot warning
// ----------------------------------------------------------------------------

test('25. Missing VITE_API_BASE_URL → live empty sentinel + ONE console.warn per process', () => {
  // Gate reads false (no URL on the shared analytics env), so the fetcher takes
  // the warn-and-sentinel branch without issuing a request.
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false' });
  const warnSpy = mock.method(console, 'warn', () => undefined);
  try {
    const first = fetchSweepHealthLive('14d', 0);
    const second = fetchSweepHealthLive('14d', 0);
    assert.deepEqual(first.data, { latest: null, recentRuns: [] });
    assert.equal(first.source, 'LIVE');
    assert.deepEqual(second.data, { latest: null, recentRuns: [] });
    assert.equal(warnSpy.mock.callCount(), 1);
    assert.equal(
      warnSpy.mock.calls[0]?.arguments[0],
      '[sweep] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.',
    );
  } finally {
    warnSpy.mock.restore();
  }
});

// ----------------------------------------------------------------------------
// Fetch options — credentials + Accept header (session-auth parity)
// ----------------------------------------------------------------------------

test('26. Fetch options always include credentials: include + Accept: application/json', async () => {
  const spy = installFetchSpy(() => jsonResponse(sweepEnvelope(null, [])));
  fetchSweepHealthLive('14d', 0);
  await flushAsync();
  assert.equal(spy.calls[0]?.init?.credentials, 'include');
  const headers = spy.calls[0]?.init?.headers as Record<string, string> | undefined;
  assert.equal(headers?.Accept, 'application/json');
});

// ----------------------------------------------------------------------------
// DEV-only console gating (DEV=false → 0 console.debug; DEV=true → 1)
// ----------------------------------------------------------------------------

test('27. DEV-only console gating — DEV=false emits 0 console.debug; DEV=true emits 1', async () => {
  __testHooks.setEnv({ VITE_API_BASE_URL: 'http://localhost:8080', DEV: false });
  const debugSpy = mock.method(console, 'debug', () => undefined);
  try {
    installFetchSpy(() => Promise.reject(new Error('network down')));
    fetchSweepHealthLive('14d', 0);
    await flushAsync();
    assert.equal(debugSpy.mock.callCount(), 0);

    __testHooks.clearCache();
    __testHooks.setEnv({ VITE_API_BASE_URL: 'http://localhost:8080', DEV: true });
    fetchSweepHealthLive('14d', 0);
    await flushAsync();
    assert.equal(debugSpy.mock.callCount(), 1);
  } finally {
    debugSpy.mock.restore();
  }
});
