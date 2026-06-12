import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  __testHooks,
  fetchInspectionTriageLive,
  fetchHandoffChainLive,
  isValidInspectionEnvelope,
  isValidHandoffEnvelope,
} from './triageLiveFetchers.js';
import { __testHooks as analyticsTestHooks, isLiveModeEnabled } from './analyticsLiveFetchers.js';
import { __testHooks as authTokenTestHooks } from './authToken.js';
import type {
  HandoffLatestData,
  HandoffRecord,
  HandoffStatusCounts,
  InspectionLatestData,
  InspectionReportSummary,
} from '../types/triage.js';

// ============================================================================
// WP-239 / EC-270 / D-23903 — triageLiveFetchers test coverage.
//
// Mirrors `sweepLiveFetchers.test.ts` for TWO object-envelope resources
// (inspection + handoff). Covers: the shared `isLiveModeEnabled` gate, both
// lightweight object guards (including array-shape + partial-counts cases),
// sentinel-then-populate, cache dedupe (one request), sentinel non-regression
// on error, the one-shot missing-URL warning, and `credentials: 'include'`
// session parity. The boolean gate lives in `analyticsLiveFetchers.ts`, so
// `analyticsTestHooks.setEnv` drives it; the triage module's own
// `__testHooks.setEnv` drives only the `VITE_API_BASE_URL` read.
// ============================================================================

const LIVE_ENV = {
  VITE_USE_MOCKS: 'false',
  VITE_API_BASE_URL: 'http://localhost:8080',
  DEV: false,
};

const ZERO_COUNTS: HandoffStatusCounts = {
  open: 0,
  claimed: 0,
  fixProposed: 0,
  escalated: 0,
  resolved: 0,
  wontFix: 0,
};

interface FetchSpyCall {
  url: string;
  init?: RequestInit | undefined;
}

interface FetchSpy {
  calls: FetchSpyCall[];
  responder: (url: string, init?: RequestInit) => Promise<Response> | Response;
}

function installFetchSpy(responder: FetchSpy['responder']): FetchSpy {
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

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeReport(reportId: string): InspectionReportSummary {
  return {
    reportId,
    sweepRunId: 'sweep-0',
    submittedAt: '2026-06-11T00:00:00.000Z',
    generatedAt: '2026-06-11T00:00:00.000Z',
    verdict: 'FAIL',
    counts: { p0: 1, p1: 0, p2: 0 },
    findings: [
      { severity: 'P0', anomalyClass: 'x', cellId: null, description: 'd', route: 'Builder' },
    ],
  };
}

function makeHandoff(handoffId: string, reportId: string): HandoffRecord {
  return {
    handoffId,
    reportId,
    sweepRunId: 'sweep-0',
    findingIndex: 0,
    severity: 'P0',
    route: 'Builder',
    anomalyClass: 'x',
    cellId: null,
    description: 'd',
    status: 'open',
    branchRef: null,
    amendmentRequest: null,
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  };
}

function inspectionEnvelope(
  latest: InspectionReportSummary | null,
  recentReports: readonly InspectionReportSummary[],
): { data: InspectionLatestData } {
  return { data: { latest, recentReports } };
}

function handoffEnvelope(
  reportId: string | null,
  handoffs: readonly HandoffRecord[],
  counts: HandoffStatusCounts,
): { data: HandoffLatestData } {
  return { data: { reportId, handoffs, counts } };
}

beforeEach(() => {
  analyticsTestHooks.setEnv(LIVE_ENV);
  __testHooks.setEnv(LIVE_ENV);
  __testHooks.setNow(() => 1_700_000_000_000);
  __testHooks.resetWarningGuard();
  __testHooks.clearCaches();
  // why: register a non-null operator token so both LIVE fetchers reach the
  // network fetch (WP-241 D-24003); without it they fail silent.
  authTokenTestHooks.setAuthToken(() => 'test-token');
});

afterEach(() => {
  analyticsTestHooks.setEnv(undefined);
  __testHooks.setEnv(undefined);
  __testHooks.setNow(() => Date.now());
  __testHooks.resetWarningGuard();
  __testHooks.clearCaches();
  authTokenTestHooks.setAuthToken(null);
});

// ----------------------------------------------------------------------------
// Shared gate truth table (reused analytics predicate)
// ----------------------------------------------------------------------------

test('1. isLiveModeEnabled true when use-mocks off + URL present', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), true);
});

test('2. isLiveModeEnabled false when use-mocks = "true"', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'true', VITE_API_BASE_URL: 'http://x' });
  assert.equal(isLiveModeEnabled(), false);
});

test('3. isLiveModeEnabled false when URL is empty', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: '' });
  assert.equal(isLiveModeEnabled(), false);
});

// ----------------------------------------------------------------------------
// isValidInspectionEnvelope — object-shape guard
// ----------------------------------------------------------------------------

test('4. inspection guard accepts a populated { data: { latest, recentReports } }', () => {
  assert.equal(
    isValidInspectionEnvelope(inspectionEnvelope(makeReport('r0'), [makeReport('r0')])),
    true,
  );
});

test('5. inspection guard accepts latest: null with empty recentReports', () => {
  assert.equal(isValidInspectionEnvelope(inspectionEnvelope(null, [])), true);
});

test('6. inspection guard rejects null / non-object data / missing recentReports / bad latest', () => {
  assert.equal(isValidInspectionEnvelope(null), false);
  assert.equal(isValidInspectionEnvelope({ data: null }), false);
  assert.equal(isValidInspectionEnvelope({ data: {} }), false);
  assert.equal(isValidInspectionEnvelope({ data: { latest: 5, recentReports: [] } }), false);
});

test('7. inspection guard rejects the analytics array shape { data: [] }', () => {
  assert.equal(isValidInspectionEnvelope({ data: [] }), false);
});

// ----------------------------------------------------------------------------
// isValidHandoffEnvelope — object-shape guard
// ----------------------------------------------------------------------------

test('8. handoff guard accepts a populated { data: { reportId, handoffs, counts } }', () => {
  assert.equal(
    isValidHandoffEnvelope(handoffEnvelope('r0', [makeHandoff('r0#0', 'r0')], ZERO_COUNTS)),
    true,
  );
});

test('9. handoff guard accepts reportId: null with empty handoffs', () => {
  assert.equal(isValidHandoffEnvelope(handoffEnvelope(null, [], ZERO_COUNTS)), true);
});

test('10. handoff guard rejects non-array handoffs, non-object counts, bad reportId, array shape', () => {
  assert.equal(isValidHandoffEnvelope({ data: { reportId: null, handoffs: 'no', counts: {} } }), false);
  assert.equal(isValidHandoffEnvelope({ data: { reportId: null, handoffs: [], counts: null } }), false);
  assert.equal(isValidHandoffEnvelope({ data: { reportId: 5, handoffs: [], counts: {} } }), false);
  assert.equal(isValidHandoffEnvelope({ data: [] }), false);
});

test('11. handoff guard is STRUCTURAL — a partial counts object still passes (drift test + ?? 0 read own the keys)', () => {
  // why: the guard checks `counts` is a non-null object, NOT its six keys — a
  // partial counts object passes here and is narrowed to 0 by the composable's
  // defensive read, so one missing key never blanks the surface.
  assert.equal(isValidHandoffEnvelope({ data: { reportId: 'r0', handoffs: [], counts: { open: 1 } } }), true);
});

// ----------------------------------------------------------------------------
// Inspection fetcher — sentinel, populate, dedupe, error non-regression
// ----------------------------------------------------------------------------

test('12. inspection fetcher returns the live empty sentinel synchronously on first call', () => {
  installFetchSpy(() => jsonResponse(inspectionEnvelope(makeReport('r0'), [makeReport('r0')])));
  const response = fetchInspectionTriageLive(0);
  assert.deepEqual(response.data, { latest: null, recentReports: [] });
  assert.equal(response.source, 'LIVE');
  assert.equal(response.updatedAt, 1_700_000_000_000);
});

test('13. inspection fetcher populates the cache from the network response', async () => {
  installFetchSpy(() => jsonResponse(inspectionEnvelope(makeReport('r0'), [makeReport('r0')])));
  fetchInspectionTriageLive(0);
  await flushAsync();
  const populated = fetchInspectionTriageLive(0);
  assert.equal(populated.source, 'LIVE');
  assert.equal(populated.data.latest?.reportId, 'r0');
});

test('14. inspection fetcher dedupes — multiple same-tick calls trigger ONE request, query-free URL', async () => {
  const spy = installFetchSpy(() => jsonResponse(inspectionEnvelope(null, [])));
  fetchInspectionTriageLive(0);
  fetchInspectionTriageLive(0);
  fetchInspectionTriageLive(0);
  await flushAsync();
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0]?.url, 'http://localhost:8080/api/inspection/latest');
});

test('15. inspection fetcher — network reject preserves the sentinel, no throw', async () => {
  installFetchSpy(() => Promise.reject(new Error('network down')));
  assert.doesNotThrow(() => fetchInspectionTriageLive(0));
  await flushAsync();
  assert.deepEqual(fetchInspectionTriageLive(0).data, { latest: null, recentReports: [] });
});

test('16. inspection fetcher — array-shape payload rejected by guard, sentinel preserved (no mutation)', async () => {
  installFetchSpy(() => jsonResponse({ data: [] }));
  const sentinel = fetchInspectionTriageLive(0);
  await flushAsync();
  const after = fetchInspectionTriageLive(0);
  assert.deepEqual(after.data, { latest: null, recentReports: [] });
  assert.equal(after, sentinel);
});

// ----------------------------------------------------------------------------
// Handoff fetcher — sentinel, populate, dedupe, error non-regression
// ----------------------------------------------------------------------------

test('17. handoff fetcher returns the live empty sentinel synchronously on first call', () => {
  installFetchSpy(() => jsonResponse(handoffEnvelope('r0', [], ZERO_COUNTS)));
  const response = fetchHandoffChainLive(0);
  assert.deepEqual(response.data, { reportId: null, handoffs: [], counts: ZERO_COUNTS });
  assert.equal(response.source, 'LIVE');
});

test('18. handoff fetcher populates the cache from the network response', async () => {
  installFetchSpy(() =>
    jsonResponse(handoffEnvelope('r0', [makeHandoff('r0#0', 'r0')], { ...ZERO_COUNTS, open: 1 })),
  );
  fetchHandoffChainLive(0);
  await flushAsync();
  const populated = fetchHandoffChainLive(0);
  assert.equal(populated.data.reportId, 'r0');
  assert.equal(populated.data.handoffs.length, 1);
  assert.equal(populated.data.counts.open, 1);
});

test('19. handoff fetcher dedupes — multiple same-tick calls trigger ONE request, query-free URL', async () => {
  const spy = installFetchSpy(() => jsonResponse(handoffEnvelope(null, [], ZERO_COUNTS)));
  fetchHandoffChainLive(0);
  fetchHandoffChainLive(0);
  await flushAsync();
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0]?.url, 'http://localhost:8080/api/handoffs/latest');
});

test('20. handoff fetcher — HTTP 401 preserves the sentinel', async () => {
  installFetchSpy(() => new Response('Unauthorized', { status: 401 }));
  fetchHandoffChainLive(0);
  await flushAsync();
  assert.deepEqual(fetchHandoffChainLive(0).data, {
    reportId: null,
    handoffs: [],
    counts: ZERO_COUNTS,
  });
});

// ----------------------------------------------------------------------------
// Session-auth parity + missing-URL warning
// ----------------------------------------------------------------------------

test('21. both fetchers carry Authorization: Bearer <token> + Accept and NO credentials', async () => {
  const inspectionSpy = installFetchSpy(() => jsonResponse(inspectionEnvelope(null, [])));
  fetchInspectionTriageLive(0);
  await flushAsync();
  const inspectionHeaders = inspectionSpy.calls[0]?.init?.headers as
    | Record<string, string>
    | undefined;
  assert.equal(inspectionHeaders?.Authorization, 'Bearer test-token');
  assert.equal(inspectionHeaders?.Accept, 'application/json');
  // why (D-24003): cookie path dropped — bearer-only server (D-11202).
  assert.equal(inspectionSpy.calls[0]?.init?.credentials, undefined);

  const handoffSpy = installFetchSpy(() => jsonResponse(handoffEnvelope(null, [], ZERO_COUNTS)));
  fetchHandoffChainLive(0);
  await flushAsync();
  const handoffHeaders = handoffSpy.calls[0]?.init?.headers as Record<string, string> | undefined;
  assert.equal(handoffHeaders?.Authorization, 'Bearer test-token');
  assert.equal(handoffSpy.calls[0]?.init?.credentials, undefined);
});

test('22. missing VITE_API_BASE_URL → sentinel + ONE console.warn per process', () => {
  analyticsTestHooks.setEnv({ VITE_USE_MOCKS: 'false' });
  const warnSpy = mock.method(console, 'warn', () => undefined);
  try {
    fetchInspectionTriageLive(0);
    fetchHandoffChainLive(0);
    assert.equal(warnSpy.mock.callCount(), 1);
    assert.equal(
      warnSpy.mock.calls[0]?.arguments[0],
      '[triage] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.',
    );
  } finally {
    warnSpy.mock.restore();
  }
});

// ----------------------------------------------------------------------------
// Null-token fail-silent (WP-241 §AC #5c — one per fetcher: no request, sentinel)
// ----------------------------------------------------------------------------

test('23. Null auth token → fetchInspectionTriageLive fires no request, returns the sentinel', async () => {
  authTokenTestHooks.setAuthToken(() => null);
  const spy = installFetchSpy(() => jsonResponse(inspectionEnvelope(makeReport('r0'), [makeReport('r0')])));
  const response = fetchInspectionTriageLive(0);
  await flushAsync();
  assert.equal(spy.calls.length, 0);
  assert.deepEqual(response.data, { latest: null, recentReports: [] });
  assert.equal(response.source, 'LIVE');
});

test('24. Null auth token → fetchHandoffChainLive fires no request, returns the sentinel', async () => {
  authTokenTestHooks.setAuthToken(() => null);
  const spy = installFetchSpy(() => jsonResponse(handoffEnvelope('r0', [makeHandoff('r0#0', 'r0')], ZERO_COUNTS)));
  const response = fetchHandoffChainLive(0);
  await flushAsync();
  assert.equal(spy.calls.length, 0);
  assert.deepEqual(response.data, { reportId: null, handoffs: [], counts: ZERO_COUNTS });
  assert.equal(response.source, 'LIVE');
});
