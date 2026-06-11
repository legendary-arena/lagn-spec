/**
 * Tests for handoff HTTP routes — WP-232 / EC-264.
 *
 * Mocked dependencies (fake `requireAuthenticatedSession` returning a configured
 * `Result`; recording fake `DatabaseClient` driven by a per-test `respond`
 * callback). No real PostgreSQL / SessionVerifier / AccountResolver. The
 * shared-secret path runs the real `validateSharedSecret` (-> `node:crypto`).
 *
 * Per D-23102 (inherited) no test asserts finding CONTENT — only shape, status
 * codes, lifecycle `status`, and the response envelope. Validation-before-read is
 * asserted by checking the recording fake's `query()` was never called on the
 * 401 / 413 / 400 paths.
 *
 * Authority: WP-232 §Acceptance Criteria #4..#15 + #16; EC-264 §After Completing;
 * D-23202 (atomic transition); D-10403 (session collapse); D-11504 (Cache-Control
 * first-statement lock).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseClient } from './handoff.logic.js';
import { registerHandoffRoutes } from './handoff.routes.js';
import type { HandoffRouteDependencies } from './handoff.routes.js';

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
      post(path: string, ...handlers: unknown[]) {
        routes.push({
          method: 'POST',
          path,
          handler: handlers[handlers.length - 1] as RecordedRoute['handler'],
        });
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

function findRoute(routes: RecordedRoute[], method: 'GET' | 'POST', path: string): RecordedRoute {
  const route = routes.find((entry) => entry.method === method && entry.path === path);
  if (route === undefined) {
    throw new Error(`Route ${method} ${path} not registered.`);
  }
  return route;
}

type RespondFn = (sql: string, values: readonly unknown[]) => Array<Record<string, unknown>>;

interface QueryRecorder {
  readonly database: DatabaseClient;
  readonly recorded: Array<{ sql: string; values: readonly unknown[] }>;
}

function makeRecorder(respond?: RespondFn): QueryRecorder {
  const recorded: Array<{ sql: string; values: readonly unknown[] }> = [];
  const handleQuery = async (
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    return { rows: respond ? respond(sql, values ?? []) : [] };
  };
  const database = { query: handleQuery } as unknown as DatabaseClient;
  return { database, recorded };
}

const TEST_HANDOFF_TOKEN = 'unit-test-handoff-token-32-bytes!';
const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';

function makeAuthOk(): HandoffRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({
    ok: true,
    value: TEST_ACCOUNT_ID as unknown as { __brand: 'AccountId' } & string,
  });
}

function makeAuthFail(
  code: 'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account',
): HandoffRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({ ok: false, reason: 'auth failed', code });
}

function makeDeps(overrides: Partial<HandoffRouteDependencies> = {}): HandoffRouteDependencies {
  return {
    requireAuthenticatedSession: overrides.requireAuthenticatedSession ?? makeAuthOk(),
    verifier: undefined,
    accountResolver: undefined,
    handoffSubmitToken: overrides.handoffSubmitToken ?? TEST_HANDOFF_TOKEN,
  };
}

function registerWith(recorder: QueryRecorder, deps = makeDeps()) {
  const { router, routes } = makeRouter();
  registerHandoffRoutes(
    router as unknown as Parameters<typeof registerHandoffRoutes>[0],
    recorder.database,
    deps,
  );
  return routes;
}

function makeInspectionFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    severity: 'P2',
    anomalyClass: 'not-endgame',
    cellId: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    route: 'Builder',
    ...overrides,
  };
}

function makeInspectionReportRow(findings: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    report_id: 'r1-20260610T071500Z-20260610T071530Z',
    sweep_run_id: 'r1-20260610T071500Z',
    submitted_at: new Date('2026-06-10T07:15:31.000Z'),
    generated_at: new Date('2026-06-10T07:15:30.000Z'),
    verdict: 'PASS',
    p0_count: 0,
    p1_count: 0,
    p2_count: findings.length,
    findings,
  };
}

function makeHandoffRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    handoff_id: 'r1#0',
    report_id: 'r1',
    sweep_run_id: 's1',
    finding_index: 0,
    severity: 'P2',
    route: 'Builder',
    anomaly_class: 'not-endgame',
    cell_id: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    status: 'open',
    branch_ref: null,
    amendment_request: null,
    created_at: new Date('2026-06-10T07:15:31.000Z'),
    updated_at: new Date('2026-06-10T07:15:31.000Z'),
    ...overrides,
  };
}

const isInspectionSelect = (sql: string): boolean => /FROM legendary\.inspection_reports/.test(sql);
const isHandoffInsert = (sql: string): boolean => /INSERT INTO legendary\.finding_handoffs/.test(sql);
const isHandoffUpdate = (sql: string): boolean => /UPDATE legendary\.finding_handoffs/.test(sql);

describe('POST /api/handoffs/sync (WP-232 / D-23203)', () => {
  test('should_reject_with_401_when_X_Handoff_Token_header_is_missing', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/sync').handler;
    const koaContext = makeKoaContext({ body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0, 'no DB query before the auth gate');
  });

  test('should_reject_with_401_when_token_is_strictly_shorter_without_RangeError', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/sync').handler;
    const koaContext = makeKoaContext({ headers: { 'x-handoff-token': 'short' }, body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_200_and_the_sync_summary_when_token_matches', async () => {
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [makeInspectionReportRow([makeInspectionFinding(), makeInspectionFinding({ severity: 'P0' })])];
      }
      if (isHandoffInsert(sql)) {
        return [{ handoff_id: 'created' }];
      }
      return [];
    });
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/sync').handler;
    const koaContext = makeKoaContext({ headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN }, body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, {
      data: {
        reportId: 'r1-20260610T071500Z-20260610T071530Z',
        findingCount: 2,
        created: 2,
        unchanged: 0,
      },
    });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });
});

describe('POST /api/handoffs/transition (WP-232 / D-23202)', () => {
  test('should_reject_with_401_when_token_is_missing_before_any_DB_access', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({ body: { handoffId: 'r1#0', toStatus: 'claimed' } });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_400_on_an_out_of_set_toStatus_before_any_DB_access', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'r1#0', toStatus: 'verified' },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'invalid_request' });
    assert.equal(recorder.recorded.length, 0, 'validation-before-read: no query on a 400');
  });

  test('should_reject_with_400_when_fix_proposed_omits_branchRef', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'r1#0', toStatus: 'fix-proposed' },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_400_when_escalated_omits_amendmentRequest', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'r1#0', toStatus: 'escalated' },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_413_when_the_body_exceeds_the_64KB_cap_before_any_DB_access', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    // why: a 70 KB padding field pushes JSON.stringify length past the 64 KB cap;
    // the 413 fires before payload validation and before any DB I/O.
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'r1#0', toStatus: 'claimed', padding: 'x'.repeat(70 * 1024) },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 413);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'payload_too_large' });
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_404_for_an_unknown_handoffId', async () => {
    const recorder = makeRecorder(() => []); // load returns no row.
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'missing#0', toStatus: 'claimed' },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 404);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'not_found' });
  });

  test('should_return_409_on_an_off_table_transition_with_status_unchanged', async () => {
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return [];
      }
      return [makeHandoffRow({ status: 'open' })]; // load returns an 'open' row.
    });
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'r1#0', toStatus: 'resolved' }, // open -> resolved is off-table.
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 409);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'conflict' });
    assert.equal(
      recorder.recorded.some((entry) => isHandoffUpdate(entry.sql)),
      false,
      'no UPDATE issued for an off-table transition',
    );
  });

  test('should_return_200_and_the_updated_handoff_on_the_happy_path', async () => {
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ status: 'claimed', updated_at: new Date('2026-06-10T08:00:00.000Z') })];
      }
      return [makeHandoffRow({ status: 'open' })];
    });
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/transition').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { handoffId: 'r1#0', toStatus: 'claimed' },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    const body = koaContext.body as { data: { handoff: { status: string; updatedAt: string } } };
    assert.equal(body.data.handoff.status, 'claimed');
    assert.equal(body.data.handoff.updatedAt, '2026-06-10T08:00:00.000Z');
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });
});

describe('GET /api/handoffs/latest (WP-232 / D-10403)', () => {
  test('should_return_401_when_session_is_invalid_with_no_store_and_no_DB_access', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder, makeDeps({ requireAuthenticatedSession: makeAuthFail('invalid_token') }));
    const handler = findRoute(routes, 'GET', '/api/handoffs/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_200_with_reportId_handoffs_and_counts_summing_to_length', async () => {
    const recorder = makeRecorder((sql, values) => {
      if (/ORDER BY created_at DESC, report_id DESC/.test(sql)) {
        return [{ report_id: 'r1' }];
      }
      if (/WHERE report_id = \$1/.test(sql)) {
        assert.equal(values[0], 'r1');
        return [
          makeHandoffRow({ handoff_id: 'r1#0', report_id: 'r1', finding_index: 0, status: 'open' }),
          makeHandoffRow({ handoff_id: 'r1#1', report_id: 'r1', finding_index: 1, status: 'claimed' }),
        ];
      }
      return [];
    });
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'GET', '/api/handoffs/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    const body = koaContext.body as {
      data: {
        reportId: string | null;
        handoffs: Array<{ status: string }>;
        counts: { open: number; claimed: number; fixProposed: number; escalated: number; resolved: number; wontFix: number };
      };
    };
    assert.equal(body.data.reportId, 'r1');
    assert.equal(body.data.handoffs.length, 2);
    assert.ok(body.data.handoffs.length <= 500);
    assert.equal(body.data.counts.open, 1);
    assert.equal(body.data.counts.claimed, 1);
    const total =
      body.data.counts.open +
      body.data.counts.claimed +
      body.data.counts.fixProposed +
      body.data.counts.escalated +
      body.data.counts.resolved +
      body.data.counts.wontFix;
    assert.equal(total, body.data.handoffs.length);
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });

  test('should_ignore_unknown_query_parameters_and_keep_response_shape_invariant', async () => {
    const respond: RespondFn = (sql) => (/ORDER BY created_at DESC, report_id DESC/.test(sql) ? [] : []);
    const baselineRecorder = makeRecorder(respond);
    const baselineRoutes = registerWith(baselineRecorder);
    const baselineHandler = findRoute(baselineRoutes, 'GET', '/api/handoffs/latest').handler;
    const baseline = makeKoaContext();
    await baselineHandler(baseline);
    const queryRecorder = makeRecorder(respond);
    const queryRoutes = registerWith(queryRecorder);
    const queryHandler = findRoute(queryRoutes, 'GET', '/api/handoffs/latest').handler;
    const withQuery = makeKoaContext({ query: { limit: '5', status: 'open' } });
    await queryHandler(withQuery);
    assert.deepStrictEqual(withQuery.body, baseline.body);
    assert.equal(withQuery.status, baseline.status);
  });

  test('should_return_500_and_set_no_store_when_DB_query_throws', async () => {
    const { router, routes } = makeRouter();
    const handleThrowing = async (): Promise<{ rows: Array<Record<string, unknown>> }> => {
      throw new Error('connection_refused');
    };
    const database = { query: handleThrowing } as unknown as DatabaseClient;
    registerHandoffRoutes(
      router as unknown as Parameters<typeof registerHandoffRoutes>[0],
      database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/handoffs/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'internal_error' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });
});

describe('registerHandoffRoutes wiring (WP-232 / AC #4; WP-233 verify route)', () => {
  // why (WP-233): the additive POST /api/handoffs/verify route makes the wiring
  // count 4. This is the ONE WP-232 test the additive endpoint must touch — a
  // route-count assertion mechanically reflecting a genuinely-new route, not a
  // weakening of WP-232 coverage (it now also asserts verify is wired).
  test('should_register_exactly_four_routes', () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    assert.equal(routes.length, 4);
    assert.ok(routes.find((r) => r.method === 'POST' && r.path === '/api/handoffs/sync'));
    assert.ok(routes.find((r) => r.method === 'POST' && r.path === '/api/handoffs/verify'));
    assert.ok(routes.find((r) => r.method === 'POST' && r.path === '/api/handoffs/transition'));
    assert.ok(routes.find((r) => r.method === 'GET' && r.path === '/api/handoffs/latest'));
  });
});

// WP-233 / EC-265 — verify route. Splits the two finding_handoffs SELECT shapes
// the verify flow issues (bulk fix-proposed load vs applyHandoffTransition's
// per-handoff load); the module-level `isInspectionSelect` / `isHandoffUpdate`
// are reused.
const isFixProposedLoad = (sql: string): boolean =>
  /FROM legendary\.finding_handoffs\s+WHERE status = \$1/.test(sql);
const isHandoffByIdLoad = (sql: string): boolean =>
  /FROM legendary\.finding_handoffs WHERE handoff_id = \$1/.test(sql);

describe('POST /api/handoffs/verify (WP-233 / D-23301, D-23302)', () => {
  test('should_reject_with_401_when_X_Handoff_Token_header_is_missing_before_any_DB_access', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/verify').handler;
    const koaContext = makeKoaContext({ body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0, 'no DB query before the auth gate');
  });

  test('should_reject_with_401_when_token_is_strictly_shorter_without_RangeError', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/verify').handler;
    const koaContext = makeKoaContext({ headers: { 'x-handoff-token': 'short' }, body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_413_when_the_body_exceeds_the_64KB_cap_before_any_DB_access', async () => {
    const recorder = makeRecorder();
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/verify').handler;
    // why: the verify body is ignored, but a 70 KB padding field pushes
    // JSON.stringify length past the 64 KB cap; the 413 fires before any DB I/O.
    const koaContext = makeKoaContext({
      headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN },
      body: { padding: 'x'.repeat(70 * 1024) },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 413);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'payload_too_large' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_200_with_the_verify_summary_driving_resolved_and_claimed_counts', async () => {
    const recorder = makeRecorder((sql, values) => {
      if (isInspectionSelect(sql)) {
        // latest report (id 'r1-...') carries only the 'cell-present' anomaly.
        return [makeInspectionReportRow([makeInspectionFinding({ cellId: 'cell-present', anomalyClass: 'fatal' })])];
      }
      if (isFixProposedLoad(sql)) {
        return [
          makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: 'fix-proposed', cell_id: 'cell-gone', anomaly_class: 'fatal' }),
          makeHandoffRow({ handoff_id: 'report-old#1', report_id: 'report-old', status: 'fix-proposed', cell_id: 'cell-present', anomaly_class: 'fatal' }),
        ];
      }
      if (isHandoffByIdLoad(sql)) {
        return [makeHandoffRow({ handoff_id: values[0], report_id: 'report-old', status: 'fix-proposed' })];
      }
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ handoff_id: values[0], report_id: 'report-old', status: values[1] })];
      }
      return [];
    });
    const routes = registerWith(recorder);
    const handler = findRoute(routes, 'POST', '/api/handoffs/verify').handler;
    const koaContext = makeKoaContext({ headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN }, body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    const body = koaContext.body as {
      data: { reportId: string | null; verified: number; regressed: number; skipped: number };
    };
    assert.equal(body.data.reportId, 'r1-20260610T071500Z-20260610T071530Z');
    assert.equal(body.data.verified, 1, 'cell-gone anomaly absent → resolved → verified');
    assert.equal(body.data.regressed, 1, 'cell-present anomaly persists → claimed → regressed');
    assert.equal(body.data.skipped, 0);
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });

  test('should_return_500_and_set_no_store_when_a_DB_query_throws', async () => {
    const { router, routes } = makeRouter();
    const handleThrowing = async (): Promise<{ rows: Array<Record<string, unknown>> }> => {
      throw new Error('connection_refused');
    };
    const database = { query: handleThrowing } as unknown as DatabaseClient;
    registerHandoffRoutes(
      router as unknown as Parameters<typeof registerHandoffRoutes>[0],
      database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/handoffs/verify').handler;
    const koaContext = makeKoaContext({ headers: { 'x-handoff-token': TEST_HANDOFF_TOKEN }, body: {} });
    await handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'internal_error' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });
});
