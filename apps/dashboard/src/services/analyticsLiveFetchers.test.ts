import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  __testHooks,
  fetchActivationFunnelLive,
  fetchRetentionCohortsLive,
  fetchTrafficSourcesLive,
  isLiveModeEnabled,
  isValidEnvelope,
} from './analyticsLiveFetchers.js';
import type {
  ActivationFunnelStep,
  RetentionCohort,
  TrafficSource,
} from '../types/index.js';

// ============================================================================
// WP-206 / EC-234 / D-20601 — analyticsLiveFetchers test coverage.
//
// Required ≥ 14 tests per WP-206 §Acceptance Criteria → LIVE-fetcher
// behavior (concurrent same-key dedupe + sentinel non-regression +
// `__testHooks.setNow` time injection + `isValidEnvelope` /
// `isLiveModeEnabled` direct unit + DEV-only console gating + error
// paths + missing-URL + auth + URL construction). This file contributes
// 24 tests covering the full matrix across the 3 fetchers.
//
// Test-environment env injection rationale: `node --import tsx --test`
// (the dashboard's test runner) leaves `import.meta.env` undefined,
// so the SUT module uses a swappable `readEnv()` indirection swapped
// via `__testHooks.setEnv()` here. See SPEC DEVIATION block at the top
// of `analyticsLiveFetchers.ts` for the full rationale.
// ============================================================================

const LIVE_ENV = {
  VITE_USE_MOCKS: 'false',
  VITE_API_BASE_URL: 'http://localhost:8080',
  DEV: false,
};

interface FetchSpyCall {
  url: string;
  init?: RequestInit;
}

interface FetchSpy {
  calls: FetchSpyCall[];
  responder: (url: string, init?: RequestInit) => Promise<Response> | Response;
}

function installFetchSpy(
  responder: FetchSpy['responder'] = () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 }),
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

function makeTrafficSource(date: string): TrafficSource {
  return { channel: 'direct', date, visitorCount: 100, signupCount: 5 };
}

function makeFunnelStep(date: string): ActivationFunnelStep {
  return { step: 'signup-start', date, count: 50 };
}

function makeRetentionCohort(cohortWeek: string): RetentionCohort {
  return {
    cohortWeek,
    cohortSize: 100,
    day1ReturnCount: 50,
    day7ReturnCount: 25,
  };
}

beforeEach(() => {
  __testHooks.setEnv(LIVE_ENV);
  __testHooks.setNow(() => 1_700_000_000_000);
  __testHooks.resetWarningGuard();
  __testHooks.clearAllCaches();
});

afterEach(() => {
  __testHooks.setEnv(undefined);
  __testHooks.setNow(() => Date.now());
  __testHooks.resetWarningGuard();
  __testHooks.clearAllCaches();
});

// ----------------------------------------------------------------------------
// isLiveModeEnabled — truth table (WP-206 §AC → isLiveModeEnabled truth table)
// ----------------------------------------------------------------------------

test('1. isLiveModeEnabled returns true when both env conditions hold', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), true);
});

test('2. isLiveModeEnabled returns true when VITE_USE_MOCKS is unset (only URL required)', () => {
  __testHooks.setEnv({ VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), true);
});

test('3. isLiveModeEnabled returns false when VITE_USE_MOCKS = "true"', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'true', VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), false);
});

test('4. isLiveModeEnabled returns false when VITE_API_BASE_URL is undefined', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false' });
  assert.equal(isLiveModeEnabled(), false);
});

test('5. isLiveModeEnabled returns false when VITE_API_BASE_URL is empty string', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: '' });
  assert.equal(isLiveModeEnabled(), false);
});

// ----------------------------------------------------------------------------
// isValidEnvelope — direct unit (WP-206 §AC → isValidEnvelope reuse)
// ----------------------------------------------------------------------------

test('6. isValidEnvelope accepts { data: [] }', () => {
  assert.equal(isValidEnvelope({ data: [] }), true);
});

test('7. isValidEnvelope accepts { data: [items...] }', () => {
  assert.equal(isValidEnvelope({ data: [makeTrafficSource('2026-06-01')] }), true);
});

test('8. isValidEnvelope rejects null, string, empty object, non-array data, unrelated shape', () => {
  assert.equal(isValidEnvelope(null), false);
  assert.equal(isValidEnvelope('string'), false);
  assert.equal(isValidEnvelope({}), false);
  assert.equal(isValidEnvelope({ data: 'not-array' }), false);
  assert.equal(isValidEnvelope({ unrelated: 1 }), false);
});

// ----------------------------------------------------------------------------
// Happy path — synchronous sentinel return + async populate
// ----------------------------------------------------------------------------

test('9. fetchTrafficSourcesLive returns live empty sentinel synchronously on first call', () => {
  installFetchSpy(() => jsonResponse({ data: [makeTrafficSource('2026-06-01')] }));
  const response = fetchTrafficSourcesLive('14d', 0);
  assert.deepEqual(response.data, []);
  assert.equal(response.source, 'LIVE');
  assert.equal(response.updatedAt, 1_700_000_000_000);
});

test('10. fetchTrafficSourcesLive populates cache from network response (source = LIVE)', async () => {
  installFetchSpy(() => jsonResponse({ data: [makeTrafficSource('2026-06-01')] }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  const second = fetchTrafficSourcesLive('14d', 0);
  assert.equal(second.data.length, 1);
  assert.equal(second.data[0]?.date, '2026-06-01');
  assert.equal(second.source, 'LIVE');
});

test('11. updatedAt is captured at fetch RESPONSE time, not at sentinel emission', async () => {
  let clock = 1_000;
  __testHooks.setNow(() => clock);
  installFetchSpy(() => jsonResponse({ data: [makeTrafficSource('2026-06-01')] }));
  const sentinel = fetchTrafficSourcesLive('14d', 0);
  assert.equal(sentinel.updatedAt, 1_000);
  clock = 1_500;
  await new Promise((resolve) => setImmediate(resolve));
  const populated = fetchTrafficSourcesLive('14d', 0);
  assert.equal(populated.updatedAt, 1_500);
});

// ----------------------------------------------------------------------------
// Caching + dedupe (WP-206 §AC → per-key caching + concurrent same-key dedupe)
// ----------------------------------------------------------------------------

test('12. Second call with same key returns the cached ref without a second fetch', async () => {
  const spy = installFetchSpy(() => jsonResponse({ data: [makeTrafficSource('2026-06-01')] }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(spy.calls.length, 1);
});

test('13. Different keys produce independent fetches (cache miss kicks off second)', async () => {
  const spy = installFetchSpy(() => jsonResponse({ data: [makeTrafficSource('2026-06-01')] }));
  fetchTrafficSourcesLive('14d', 0);
  fetchTrafficSourcesLive('30d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(spy.calls.length, 2);
});

test('14. Concurrent same-key dedupe — two same-tick calls trigger exactly one fetch', async () => {
  const spy = installFetchSpy(() => jsonResponse({ data: [makeTrafficSource('2026-06-01')] }));
  fetchTrafficSourcesLive('14d', 0);
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(spy.calls.length, 1);
});

// ----------------------------------------------------------------------------
// Sentinel non-regression (WP-206 §AC → populated data preserved on error)
// ----------------------------------------------------------------------------

test('15. Sentinel non-regression — populated cache survives subsequent fetch-rejection', async () => {
  let shouldReject = false;
  installFetchSpy(() => {
    if (shouldReject) {
      return Promise.reject(new Error('network down'));
    }
    return jsonResponse({ data: [makeTrafficSource('2026-06-01')] });
  });
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  shouldReject = true;
  const populated = fetchTrafficSourcesLive('14d', 0);
  assert.equal(populated.data.length, 1);
  assert.equal(populated.source, 'LIVE');
});

// ----------------------------------------------------------------------------
// Error paths (WP-206 §AC → all failure modes preserve live empty sentinel)
// ----------------------------------------------------------------------------

test('16. Fetch network reject → live empty sentinel preserved (no exception propagates)', async () => {
  installFetchSpy(() => Promise.reject(new Error('network down')));
  assert.doesNotThrow(() => fetchTrafficSourcesLive('14d', 0));
  await new Promise((resolve) => setImmediate(resolve));
  const response = fetchTrafficSourcesLive('14d', 0);
  assert.deepEqual(response.data, []);
  assert.equal(response.source, 'LIVE');
});

test('17. HTTP 401 / 500 → live empty sentinel preserved', async () => {
  installFetchSpy(() => new Response('Unauthorized', { status: 401 }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  const response = fetchTrafficSourcesLive('14d', 0);
  assert.deepEqual(response.data, []);

  __testHooks.clearAllCaches();
  installFetchSpy(() => new Response('Internal Server Error', { status: 500 }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  const second = fetchTrafficSourcesLive('14d', 0);
  assert.deepEqual(second.data, []);
});

test('18. Invalid JSON in response body → live empty sentinel preserved', async () => {
  installFetchSpy(() => new Response('not-json {{', { status: 200 }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  const response = fetchTrafficSourcesLive('14d', 0);
  assert.deepEqual(response.data, []);
});

test('19. Payload shape mismatch (data not an array) → live empty sentinel preserved', async () => {
  installFetchSpy(() => jsonResponse({ data: 'not-array' }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  const response = fetchTrafficSourcesLive('14d', 0);
  assert.deepEqual(response.data, []);
});

// ----------------------------------------------------------------------------
// Missing-URL one-shot warning (WP-206 §AC → exactly one warn per process)
// ----------------------------------------------------------------------------

test('20. Missing VITE_API_BASE_URL → live empty sentinel + ONE console.warn per process', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false' });
  const warnSpy = mock.method(console, 'warn', () => undefined);
  try {
    const first = fetchTrafficSourcesLive('14d', 0);
    const second = fetchTrafficSourcesLive('14d', 0);
    const third = fetchActivationFunnelLive('14d', 0);
    assert.deepEqual(first.data, []);
    assert.equal(first.source, 'LIVE');
    assert.deepEqual(second.data, []);
    assert.deepEqual(third.data, []);
    assert.equal(warnSpy.mock.callCount(), 1);
    assert.equal(
      warnSpy.mock.calls[0]?.arguments[0],
      '[analytics] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.',
    );
  } finally {
    warnSpy.mock.restore();
  }
});

// ----------------------------------------------------------------------------
// Fetch options + URL construction (WP-206 §AC → credentials + Accept + URL)
// ----------------------------------------------------------------------------

test('21. Fetch options always include credentials: include + Accept: application/json', async () => {
  const spy = installFetchSpy(() => jsonResponse({ data: [] }));
  fetchTrafficSourcesLive('14d', 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(spy.calls[0]?.init?.credentials, 'include');
  const headers = spy.calls[0]?.init?.headers as Record<string, string> | undefined;
  assert.equal(headers?.Accept, 'application/json');
});

test('22. URL construction matches the locked patterns for all 3 fetchers', async () => {
  const spy = installFetchSpy(() => jsonResponse({ data: [] }));
  fetchTrafficSourcesLive('14d', 0);
  fetchActivationFunnelLive('30d', 0);
  fetchRetentionCohortsLive(8, 0);
  await new Promise((resolve) => setImmediate(resolve));
  const urls = spy.calls.map((call) => call.url).sort();
  assert.deepEqual(urls, [
    'http://localhost:8080/api/analytics/activation-funnel?range=30d',
    'http://localhost:8080/api/analytics/retention-cohorts?cohortCount=8',
    'http://localhost:8080/api/analytics/traffic-sources?range=14d',
  ]);
});

// ----------------------------------------------------------------------------
// DEV-only console gating (WP-206 §AC → DEV=false → 0 debug; DEV=true → 1)
// ----------------------------------------------------------------------------

test('23. DEV-only console gating — DEV=false emits 0 console.debug; DEV=true emits 1', async () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://x', DEV: false });
  const debugSpy = mock.method(console, 'debug', () => undefined);
  try {
    installFetchSpy(() => Promise.reject(new Error('network down')));
    fetchTrafficSourcesLive('14d', 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(debugSpy.mock.callCount(), 0);

    __testHooks.clearAllCaches();
    __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://x', DEV: true });
    fetchTrafficSourcesLive('14d', 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(debugSpy.mock.callCount(), 1);
  } finally {
    debugSpy.mock.restore();
  }
});

// ----------------------------------------------------------------------------
// Cross-fetcher parity — same axes for activation-funnel + retention-cohorts
// ----------------------------------------------------------------------------

test('24. fetchActivationFunnelLive + fetchRetentionCohortsLive exhibit identical sentinel + populate behavior', async () => {
  installFetchSpy((url) => {
    if (url.includes('activation-funnel')) {
      return jsonResponse({ data: [makeFunnelStep('2026-06-01')] });
    }
    if (url.includes('retention-cohorts')) {
      return jsonResponse({ data: [makeRetentionCohort('2026-W22')] });
    }
    return jsonResponse({ data: [] });
  });
  const funnelSentinel = fetchActivationFunnelLive('14d', 0);
  assert.deepEqual(funnelSentinel.data, []);
  assert.equal(funnelSentinel.source, 'LIVE');
  const cohortSentinel = fetchRetentionCohortsLive(8, 0);
  assert.deepEqual(cohortSentinel.data, []);
  assert.equal(cohortSentinel.source, 'LIVE');
  await new Promise((resolve) => setImmediate(resolve));
  const funnelPopulated = fetchActivationFunnelLive('14d', 0);
  assert.equal(funnelPopulated.data.length, 1);
  assert.equal(funnelPopulated.data[0]?.step, 'signup-start');
  const cohortPopulated = fetchRetentionCohortsLive(8, 0);
  assert.equal(cohortPopulated.data.length, 1);
  assert.equal(cohortPopulated.data[0]?.cohortWeek, '2026-W22');
});
