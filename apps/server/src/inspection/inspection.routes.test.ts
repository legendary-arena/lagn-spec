/**
 * Tests for inspection HTTP routes — WP-231 / EC-263.
 *
 * Mocked dependencies (fake `requireAuthenticatedSession` returning a configured
 * `Result`; fake `DatabaseClient` recording SQL + returning canned rows). No
 * real PostgreSQL / SessionVerifier / AccountResolver. The shared-secret path
 * runs the real `validateSharedSecret` (-> `node:crypto.timingSafeEqual`).
 *
 * Per D-23102 no test asserts finding CONTENT — only shape, status codes, the
 * server-recomputed derived values (D-23101), and the response envelope.
 *
 * Authority: WP-231 §Acceptance Criteria #4..#14 + #23; EC-263 §After
 * Completing; D-23101 (derived-field authority); D-10403 (session collapse);
 * D-11504 (Cache-Control first-statement lock).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseClient } from './inspection.logic.js';
import { InspectionReportDuplicateError } from './inspection.logic.js';
import { registerInspectionRoutes } from './inspection.routes.js';
import type { InspectionRouteDependencies } from './inspection.routes.js';

interface RecordedRoute {
  method: 'GET' | 'POST';
  path: string;
  handler: (koaContext: TestKoaContext) => Promise<void> | void;
}

interface TestKoaContext {
  request: {
    headers: Record<string, string>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  };
  status: number;
  body: unknown;
  responseHeaders: Record<string, string>;
  set(field: string, value: string): void;
}

function makeRouter(): {
  router: { post: RecordedRoute['handler']; get: RecordedRoute['handler'] };
  routes: RecordedRoute[];
} {
  const routes: RecordedRoute[] = [];
  return {
    routes,
    router: {
      post(path: string, handler: RecordedRoute['handler']) {
        routes.push({ method: 'POST', path, handler });
        return undefined;
      },
      get(path: string, handler: RecordedRoute['handler']) {
        routes.push({ method: 'GET', path, handler });
        return undefined;
      },
    } as unknown as { post: RecordedRoute['handler']; get: RecordedRoute['handler'] },
  };
}

function makeKoaContext(
  overrides: {
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
  } = {},
): TestKoaContext {
  const responseHeaders: Record<string, string> = {};
  return {
    request: {
      headers: overrides.headers ?? {},
      body: overrides.body,
      query: overrides.query,
    },
    status: 0,
    body: undefined,
    responseHeaders,
    set(field: string, value: string): void {
      responseHeaders[field] = value;
    },
  };
}

function findRoute(
  routes: RecordedRoute[],
  method: 'GET' | 'POST',
  path: string,
): RecordedRoute {
  const route = routes.find((entry) => entry.method === method && entry.path === path);
  if (route === undefined) {
    throw new Error(`Route ${method} ${path} not registered.`);
  }
  return route;
}

interface QueryRecorder {
  readonly database: DatabaseClient;
  readonly recorded: Array<{ sql: string; values: readonly unknown[] }>;
  setNextResult(rows: Array<Record<string, unknown>>): void;
  throwOnInsert(error: unknown): void;
}

function makeQueryRecorder(): QueryRecorder {
  const recorded: Array<{ sql: string; values: readonly unknown[] }> = [];
  let nextRows: Array<Record<string, unknown>> = [];
  let insertError: unknown = null;
  const handleQuery = async (
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    if (insertError !== null && /INSERT INTO legendary\.inspection_reports/.test(sql)) {
      const errorToThrow = insertError;
      insertError = null;
      throw errorToThrow;
    }
    return { rows: nextRows };
  };
  const database = { query: handleQuery } as unknown as DatabaseClient;
  return {
    database,
    recorded,
    setNextResult(rows) {
      nextRows = rows;
    },
    throwOnInsert(error) {
      insertError = error;
    },
  };
}

const TEST_INSPECTION_TOKEN = 'unit-test-inspection-token-32byte';
const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';

function makeAuthOk(): InspectionRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({
    ok: true,
    value: TEST_ACCOUNT_ID as unknown as { __brand: 'AccountId' } & string,
  });
}

function makeAuthFail(
  code: 'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account',
): InspectionRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({ ok: false, reason: 'auth failed', code });
}

function makeDeps(overrides: Partial<InspectionRouteDependencies> = {}): InspectionRouteDependencies {
  return {
    requireAuthenticatedSession: overrides.requireAuthenticatedSession ?? makeAuthOk(),
    verifier: undefined,
    accountResolver: undefined,
    inspectionSubmitToken: overrides.inspectionSubmitToken ?? TEST_INSPECTION_TOKEN,
  };
}

function makeFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    severity: 'P2',
    anomalyClass: 'not-endgame',
    cellId: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    route: 'Builder',
    ...overrides,
  };
}

function makeValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reportId: 'a1b2c3d4-20260610T071500Z-20260610T071530Z',
    sweepRunId: 'a1b2c3d4-20260610T071500Z',
    generatedAt: '2026-06-10T07:15:30.000Z',
    verdict: 'PASS',
    findings: [makeFinding()],
    ...overrides,
  };
}

function registerWith(recorder: QueryRecorder, deps = makeDeps()) {
  const { router, routes } = makeRouter();
  registerInspectionRoutes(
    router as unknown as Parameters<typeof registerInspectionRoutes>[0],
    recorder.database,
    deps,
  );
  return routes;
}

describe('POST /api/inspection/reports (WP-231 / D-23101)', () => {
  test('should_reject_with_401_when_X_Inspection_Token_header_is_missing', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({ body: makeValidBody() });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0, 'No DB query before the auth gate');
  });

  test('should_reject_with_401_when_token_is_strictly_shorter_without_RangeError', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': 'short' },
      body: makeValidBody(),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_201_and_accepted_true_when_payload_is_valid_and_token_matches', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const body = makeValidBody();
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body,
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 201);
    assert.deepStrictEqual(koaContext.body, { data: { reportId: body.reportId, accepted: true } });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 1, 'Exactly one INSERT on the happy path');
  });

  test('should_ignore_client_verdict_and_store_server_recomputed_FAIL_for_a_P0_finding', async () => {
    // why (AC #6): client sent verdict 'PASS' but a P0 finding is present —
    // the row IS inserted (no 400) with stored verdict 'FAIL'.
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody({ verdict: 'PASS', findings: [makeFinding({ severity: 'P0' })] }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 201);
    const insert = recorder.recorded[0]!;
    assert.match(insert.sql, /INSERT INTO legendary\.inspection_reports/);
    assert.equal(insert.values[3], 'FAIL', 'stored verdict is the server-recomputed FAIL, not client PASS');
  });

  test('should_ignore_client_counts_and_store_server_recomputed_per_severity_counts', async () => {
    // why (AC #23): client supplies deliberately wrong counts; the server
    // recomputes from findings and stores those.
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody({
        p0_count: 99,
        p1_count: 99,
        p2_count: 99,
        findings: [makeFinding({ severity: 'P0' }), makeFinding({ severity: 'P2' }), makeFinding({ severity: 'P2' })],
      }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 201);
    const insert = recorder.recorded[0]!;
    assert.equal(insert.values[4], 1, 'p0_count recomputed');
    assert.equal(insert.values[5], 0, 'p1_count recomputed');
    assert.equal(insert.values[6], 2, 'p2_count recomputed');
  });

  test('should_reject_with_400_when_a_finding_severity_is_outside_INSPECTION_SEVERITIES', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody({ findings: [makeFinding({ severity: 'P3' })] }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'invalid_request' });
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_400_when_a_finding_route_is_outside_INSPECTION_ROUTES', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody({ findings: [makeFinding({ route: 'Evaluator' })] }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_409_on_duplicate_reportId_with_existing_row_unchanged', async () => {
    const recorder = makeQueryRecorder();
    recorder.throwOnInsert(new InspectionReportDuplicateError('a1b2c3d4-20260610T071500Z-20260610T071530Z'));
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody(),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 409);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'conflict' });
    assert.equal(recorder.recorded.length, 1, 'exactly one INSERT attempted; no UPDATE');
  });

  test('should_reject_with_400_when_findings_exceed_the_500_cap', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    const tooMany = Array.from({ length: 501 }, () => makeFinding());
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody({ findings: tooMany }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_413_when_the_body_exceeds_the_5MB_cap', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/inspection/reports').handler;
    // why: a 6 MB padding field pushes JSON.stringify length past the 5 MB cap;
    // the 413 fires before payload validation and before any DB I/O.
    const koaContext = makeKoaContext({
      headers: { 'x-inspection-token': TEST_INSPECTION_TOKEN },
      body: makeValidBody({ padding: 'x'.repeat(6 * 1024 * 1024) }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 413);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'payload_too_large' });
    assert.equal(recorder.recorded.length, 0);
  });
});

describe('GET /api/inspection/latest (WP-231 / D-10403)', () => {
  test('should_return_401_when_session_is_invalid', async () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder, makeDeps({ requireAuthenticatedSession: makeAuthFail('invalid_token') }));
    const handler = findRoute(routes, 'GET', '/api/inspection/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_envelope_with_latest_null_and_recentReports_empty_when_table_is_empty', async () => {
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'GET', '/api/inspection/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, { data: { latest: null, recentReports: [] } });
  });

  test('should_set_latest_equal_to_recentReports_first_element_when_table_is_nonempty', async () => {
    const recorder = makeQueryRecorder();
    recorder.setNextResult([
      {
        report_id: 'r2',
        sweep_run_id: 's2',
        submitted_at: new Date('2026-06-10T08:00:00.000Z'),
        generated_at: new Date('2026-06-10T07:59:00.000Z'),
        verdict: 'FAIL',
        p0_count: 1,
        p1_count: 0,
        p2_count: 0,
        findings: [makeFinding({ severity: 'P0' })],
      },
      {
        report_id: 'r1',
        sweep_run_id: 's1',
        submitted_at: new Date('2026-06-10T07:00:00.000Z'),
        generated_at: new Date('2026-06-10T06:59:00.000Z'),
        verdict: 'PASS',
        p0_count: 0,
        p1_count: 0,
        p2_count: 1,
        findings: [makeFinding()],
      },
    ]);
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'GET', '/api/inspection/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    const body = koaContext.body as {
      data: { latest: { reportId: string } | null; recentReports: Array<{ reportId: string }> };
    };
    assert.deepStrictEqual(body.data.latest, body.data.recentReports[0]);
    assert.equal(body.data.latest!.reportId, 'r2');
    assert.ok(body.data.recentReports.length <= 30);
  });

  test('should_ignore_unknown_query_parameters_and_keep_response_shape_invariant', async () => {
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'GET', '/api/inspection/latest').handler;
    const baseline = makeKoaContext();
    await handler(baseline);
    recorder.setNextResult([]);
    const withQuery = makeKoaContext({ query: { limit: '5', since: '2026-01-01' } });
    await handler(withQuery);
    assert.deepStrictEqual(withQuery.body, baseline.body);
    assert.equal(withQuery.status, baseline.status);
  });

  test('should_return_500_and_set_no_store_when_DB_query_throws', async () => {
    const { router, routes } = makeRouter();
    const handleThrowing = async (): Promise<{ rows: Array<Record<string, unknown>> }> => {
      throw new Error('connection_refused');
    };
    const database = { query: handleThrowing } as unknown as DatabaseClient;
    registerInspectionRoutes(
      router as unknown as Parameters<typeof registerInspectionRoutes>[0],
      database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/inspection/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'internal_error' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });
});

describe('registerInspectionRoutes wiring (WP-231 / AC #4)', () => {
  test('should_register_exactly_two_routes_POST_reports_and_GET_latest', () => {
    const recorder = makeQueryRecorder();
    const routes = registerWith(recorder);
    assert.equal(routes.length, 2);
    assert.ok(routes.find((r) => r.method === 'POST' && r.path === '/api/inspection/reports'));
    assert.ok(routes.find((r) => r.method === 'GET' && r.path === '/api/inspection/latest'));
  });
});
