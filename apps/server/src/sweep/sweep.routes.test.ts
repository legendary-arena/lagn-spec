/**
 * Tests for sweep HTTP routes — WP-209 / EC-241 Sub-task C.
 *
 * Tests use mocked dependencies (fake `requireAuthenticatedSession` returning
 * a configured `Result`; fake `DatabaseClient` that records SQL + returns
 * canned rows). No real PostgreSQL, no real `SessionVerifier`, no real
 * `AccountResolver`. Token comparison uses the real `node:crypto.timingSafeEqual`
 * path; the fake test token is fixed at module load.
 *
 * Authority: WP-209 §Acceptance Criteria #3..#15 + #25; EC-241 §After
 * Completing grep gates; D-20701 (storage shape lock); D-20702 (auth posture);
 * D-19502 (sweep anomaly 4-class closed taxonomy carry-forward); D-11504
 * (Cache-Control first-statement lock); D-10403 (session code collapse to
 * `'unauthorized'`).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseClient } from './sweep.logic.js';
import { SweepRunDuplicateError } from './sweep.logic.js';
import { registerSweepRoutes } from './sweep.routes.js';
import type { SweepRouteDependencies } from './sweep.routes.js';
import { SWEEP_ANOMALY_CLASSES } from './sweep.types.js';
import { SWEEP_ANOMALY_CLASSES as ENGINE_SWEEP_ANOMALY_CLASSES } from '@legendary-arena/game-engine';

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
    if (insertError !== null && /INSERT INTO legendary\.sweep_runs/.test(sql)) {
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

const TEST_SWEEP_TOKEN = 'unit-test-sweep-token-with-32-bytes';
const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';

function makeAuthOk(): SweepRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({
    ok: true,
    value: TEST_ACCOUNT_ID as unknown as { __brand: 'AccountId' } & string,
  });
}

function makeAuthFail(
  code: 'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account',
): SweepRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({ ok: false, reason: 'auth failed', code });
}

function makeDeps(overrides: Partial<SweepRouteDependencies> = {}): SweepRouteDependencies {
  return {
    requireAuthenticatedSession: overrides.requireAuthenticatedSession ?? makeAuthOk(),
    verifier: undefined,
    accountResolver: undefined,
    sweepSubmitToken: overrides.sweepSubmitToken ?? TEST_SWEEP_TOKEN,
  };
}

function makeValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: 'a1b2c3d-20260604T070000Z',
    startedAt: '2026-06-04T06:59:00.000Z',
    cellCount: 4,
    anomalyCounts: {
      'endgame-reached': 2,
      'not-endgame': 1,
      'escaped-villain-cap': 1,
      'fatal': 0,
    },
    manifestBlob: { cells: [], summary: {}, malformedLines: [] },
    ...overrides,
  };
}

describe('POST /api/sweep/runs (WP-209 / D-20702)', () => {
  test('should_reject_with_401_when_X_Sweep_Token_header_is_missing', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({ body: makeValidPayload() });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    // why: no DB I/O before auth gate per WP-209 §Locked Type Contracts
    // validator failure-mode table (token-length-eq + timingSafeEqual fire
    // BEFORE the body-shape check).
    assert.equal(
      recorder.recorded.length,
      0,
      'No DB query MUST be issued when the auth token is missing',
    );
  });

  test('should_reject_with_401_when_token_is_strictly_shorter_than_env_token_without_RangeError', async () => {
    // why (D-20702 / AC #6): Buffer.byteLength precheck MUST run BEFORE
    // timingSafeEqual; unequal-length buffers would otherwise throw
    // RangeError. The shorter-token submission asserts 401 returns cleanly
    // (no 500 leak, no DB call).
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': 'short' },
      body: makeValidPayload(),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_401_when_token_is_strictly_longer_than_env_token_without_RangeError', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': `${TEST_SWEEP_TOKEN}-extra-bytes` },
      body: makeValidPayload(),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_reject_with_401_when_token_matches_length_but_differs_byte_for_byte', async () => {
    // why (D-20702): equal-length comparison routes through
    // node:crypto.timingSafeEqual (constant time); the test validates the
    // 401 path without leaking a 500 RangeError.
    const equalLengthMismatch = `${'x'.repeat(TEST_SWEEP_TOKEN.length)}`;
    assert.equal(equalLengthMismatch.length, TEST_SWEEP_TOKEN.length);
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': equalLengthMismatch },
      body: makeValidPayload(),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(recorder.recorded.length, 0);
  });

  test('should_return_201_and_accepted_true_when_payload_is_valid_and_token_matches', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const payload = makeValidPayload();
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': TEST_SWEEP_TOKEN },
      body: payload,
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 201);
    assert.deepStrictEqual(koaContext.body, {
      data: { runId: payload.runId, accepted: true },
    });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 1, 'Exactly one INSERT MUST be issued on the happy path');
  });

  test('should_reject_with_413_when_cellCount_exceeds_10000_cap_before_INSERT', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': TEST_SWEEP_TOKEN },
      body: makeValidPayload({ cellCount: 10001 }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 413);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'payload_too_large' });
    assert.equal(recorder.recorded.length, 0, 'No INSERT MUST be issued when cellCount > 10000');
  });

  test('should_reject_with_409_and_existing_row_unchanged_on_duplicate_runId', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    recorder.throwOnInsert(new SweepRunDuplicateError('a1b2c3d-20260604T070000Z'));
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': TEST_SWEEP_TOKEN },
      body: makeValidPayload(),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 409);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'conflict' });
    // why (D-20701 / AC #8): duplicate POST returns 409 with the existing row
    // unchanged — no UPDATE issued, only the rejected INSERT. The recorder
    // sees exactly one INSERT statement attempted (which the duplicate-error
    // path catches and reports as 409).
    assert.equal(
      recorder.recorded.length,
      1,
      'Duplicate POST MUST attempt exactly one INSERT (the throw maps to 409); no UPDATE issued',
    );
  });

  test('should_reject_with_400_when_anomalyCounts_carries_a_key_outside_SWEEP_ANOMALY_CLASSES', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': TEST_SWEEP_TOKEN },
      body: makeValidPayload({
        anomalyCounts: {
          'endgame-reached': 4,
          'not-endgame': 0,
          'escaped-villain-cap': 0,
          'fatal': 0,
          'never-classified': 7,
        },
      }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'invalid_request' });
    assert.equal(
      recorder.recorded.length,
      0,
      'No INSERT MUST be issued when anomalyCounts carries an out-of-set key',
    );
  });

  test('should_drift_pin_SWEEP_ANOMALY_CLASSES_to_engine_canonical_array_byte_identical', () => {
    // why (D-19502 carry-forward): the server's validator gate uses
    // SWEEP_ANOMALY_CLASSES re-exported from sweep.types.ts; the engine's
    // canonical array is the single source of truth. This drift test asserts
    // they are byte-identical so a future engine-side taxonomy change forces
    // both consumers to update in lockstep.
    assert.deepStrictEqual(
      [...SWEEP_ANOMALY_CLASSES],
      [...ENGINE_SWEEP_ANOMALY_CLASSES],
      'Server SWEEP_ANOMALY_CLASSES MUST match engine canonical array byte-identical per D-19502',
    );
  });

  test('should_reject_with_400_when_startedAt_is_unparseable_as_ISO_8601', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'POST', '/api/sweep/runs').handler;
    const koaContext = makeKoaContext({
      headers: { 'x-sweep-token': TEST_SWEEP_TOKEN },
      body: makeValidPayload({ startedAt: 'not-an-iso-timestamp' }),
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'invalid_request' });
    assert.equal(recorder.recorded.length, 0);
  });
});

describe('GET /api/sweep/latest (WP-209 / D-20702)', () => {
  test('should_return_401_when_session_is_invalid', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps({ requireAuthenticatedSession: makeAuthFail('invalid_token') }),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(
      recorder.recorded.length,
      0,
      'No DB query MUST be issued when the session is invalid',
    );
  });

  test('should_return_envelope_with_latest_null_and_recentRuns_empty_when_table_is_empty', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, {
      data: { latest: null, recentRuns: [] },
    });
  });

  test('should_set_latest_equal_to_recentRuns_first_element_when_table_is_nonempty', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    recorder.setNextResult([
      {
        run_id: 'C',
        submitted_at: new Date('2026-06-04T03:00:00.000Z'),
        started_at: new Date('2026-06-04T02:59:00.000Z'),
        cell_count: 4,
        anomaly_counts: { 'endgame-reached': 4, 'not-endgame': 0, 'escaped-villain-cap': 0, 'fatal': 0 },
      },
      {
        run_id: 'B',
        submitted_at: new Date('2026-06-04T02:00:00.000Z'),
        started_at: new Date('2026-06-04T01:59:00.000Z'),
        cell_count: 4,
        anomaly_counts: { 'endgame-reached': 3, 'not-endgame': 1, 'escaped-villain-cap': 0, 'fatal': 0 },
      },
    ]);
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    const body = koaContext.body as {
      data: { latest: unknown; recentRuns: Array<{ runId: string }> };
    };
    assert.deepStrictEqual(
      body.data.latest,
      body.data.recentRuns[0],
      'GET envelope latest MUST equal recentRuns[0] when table is non-empty per D-20701',
    );
    assert.equal((body.data.latest as { runId: string }).runId, 'C');
  });

  test('should_ignore_unknown_query_parameters_and_keep_response_shape_invariant', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/latest').handler;
    const baselineContext = makeKoaContext();
    await handler(baselineContext);
    recorder.setNextResult([]);
    const withQueryContext = makeKoaContext({
      query: { limit: '5', since: '2026-01-01', runId: 'whatever' },
    });
    await handler(withQueryContext);
    assert.deepStrictEqual(
      withQueryContext.body,
      baselineContext.body,
      'GET response MUST be byte-identical regardless of query string per D-20702',
    );
    assert.equal(withQueryContext.status, baselineContext.status);
  });

  test('should_return_500_when_DB_query_throws_and_set_Cache_Control_no_store', async () => {
    const { router, routes } = makeRouter();
    const handleQueryThrowing = async (): Promise<{ rows: Array<Record<string, unknown>> }> => {
      throw new Error('connection_refused');
    };
    const database = { query: handleQueryThrowing } as unknown as DatabaseClient;
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'internal_error' });
    assert.equal(
      koaContext.responseHeaders['Cache-Control'],
      'no-store',
      'Cache-Control: no-store MUST be set even on the 500 error path per D-11504',
    );
  });
});

describe('GET /api/sweep/runs/latest (WP-231 / D-23103 CI blob read)', () => {
  test('should_reject_with_401_when_X_Sweep_Token_is_missing_before_any_DB_IO', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/runs/latest').handler;
    const koaContext = makeKoaContext();
    await handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepStrictEqual(koaContext.body, { data: [], error: 'unauthorized' });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    assert.equal(recorder.recorded.length, 0, 'No DB query before the shared-secret gate');
  });

  test('should_return_the_latest_run_including_manifestBlob_when_token_matches', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    recorder.setNextResult([
      {
        run_id: 'latest-run',
        submitted_at: new Date('2026-06-10T07:15:00.000Z'),
        started_at: new Date('2026-06-10T07:14:00.000Z'),
        cell_count: 4,
        anomaly_counts: { 'endgame-reached': 4, 'not-endgame': 0, 'escaped-villain-cap': 0, 'fatal': 0 },
        manifest_blob: { cells: [], summary: { totalCells: 4 }, malformedLines: [] },
      },
    ]);
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/runs/latest').handler;
    const koaContext = makeKoaContext({ headers: { 'x-sweep-token': TEST_SWEEP_TOKEN } });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    const body = koaContext.body as { data: { run: { runId: string; manifestBlob: unknown } | null } };
    assert.ok(body.data.run);
    assert.equal(body.data.run.runId, 'latest-run');
    assert.deepStrictEqual(body.data.run.manifestBlob, { cells: [], summary: { totalCells: 4 }, malformedLines: [] });
  });

  test('should_return_run_null_when_the_table_is_empty', async () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    const handler = findRoute(routes, 'GET', '/api/sweep/runs/latest').handler;
    const koaContext = makeKoaContext({ headers: { 'x-sweep-token': TEST_SWEEP_TOKEN } });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, { data: { run: null } });
  });
});

describe('registerSweepRoutes wiring (WP-209 + WP-231)', () => {
  test('should_register_exactly_three_routes_POST_runs_GET_latest_and_GET_runs_latest', () => {
    const { router, routes } = makeRouter();
    const recorder = makeQueryRecorder();
    registerSweepRoutes(
      router as unknown as Parameters<typeof registerSweepRoutes>[0],
      recorder.database,
      makeDeps(),
    );
    assert.equal(routes.length, 3);
    assert.ok(routes.find((r) => r.method === 'POST' && r.path === '/api/sweep/runs'));
    assert.ok(routes.find((r) => r.method === 'GET' && r.path === '/api/sweep/latest'));
    assert.ok(routes.find((r) => r.method === 'GET' && r.path === '/api/sweep/runs/latest'));
  });
});
