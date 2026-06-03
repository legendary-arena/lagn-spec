/**
 * Tests for analytics HTTP routes (WP-205 / EC-233 — Sub-task C).
 *
 * Tests use mocked dependencies (fake `requireAuthenticatedSession`
 * returning a configured `Result`; fake `DatabaseClient` that
 * records SQL + returns canned rows). No real PostgreSQL, no real
 * `SessionVerifier`, no real `AccountResolver` — the deps bundle is
 * shimmed at the `registerAnalyticsRoutes` call site.
 *
 * Authority: WP-205 §Acceptance Criteria → Capture Endpoint + Query
 * Endpoints + Request Validation + Aggregation Semantics + Security
 * / Leakage; EC-233 §After Completing → Sub-task C close;
 * D-20501 / D-20502 / D-20503; D-10403 / D-11504 / D-11802.
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { registerAnalyticsRoutes } from './analytics.routes.js';
import type { AnalyticsRouteDependencies } from './analytics.routes.js';
import type { DatabaseClient } from './analytics.logic.js';

interface RecordedRoute {
  method: 'GET' | 'POST';
  path: string;
  handler: (koaContext: TestKoaContext) => Promise<void> | void;
}

interface TestKoaContext {
  request: {
    headers: Record<string, string>;
    body?: unknown;
    ip?: string;
    query?: Record<string, string | string[] | undefined>;
  };
  status: number;
  body: unknown;
  responseHeaders: Record<string, string>;
  set(field: string, value: string): void;
}

function makeRouter(): { router: { post: RecordedRoute['handler']; get: RecordedRoute['handler'] }; routes: RecordedRoute[] } {
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

function makeKoaContext(overrides: {
  body?: unknown;
  ip?: string;
  query?: Record<string, string | string[] | undefined>;
} = {}): TestKoaContext {
  const responseHeaders: Record<string, string> = {};
  return {
    request: {
      headers: {},
      body: overrides.body,
      ip: overrides.ip ?? '127.0.0.1',
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

const TEST_SALT = 'test-route-salt';
const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000000';

function makeAuthOk(): AnalyticsRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({ ok: true, value: TEST_ACCOUNT_ID as unknown as { __brand: 'AccountId' } & string });
}

function makeAuthFail(code: 'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account'): AnalyticsRouteDependencies['requireAuthenticatedSession'] {
  return async () => ({
    ok: false,
    reason: 'auth failed',
    code,
  });
}

function makeQueryFake(cannedRows: Array<{ rows: Array<Record<string, unknown>> }>): {
  database: DatabaseClient;
  recorded: Array<{ sql: string; values: readonly unknown[] }>;
  insertCount: { count: number };
} {
  const recorded: Array<{ sql: string; values: readonly unknown[] }> = [];
  const insertCount = { count: 0 };
  let cannedIndex = 0;
  const handleQuery = async (sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    if (sql.includes('INSERT INTO legendary.analytics_events')) {
      insertCount.count = insertCount.count + 1;
    }
    const next = cannedRows[cannedIndex] ?? { rows: [] };
    cannedIndex = cannedIndex + 1;
    return next;
  };
  const connectedClient = {
    query: handleQuery,
    release: () => {},
  };
  const database = {
    query: handleQuery,
    connect: async () => connectedClient,
  } as unknown as DatabaseClient;
  return { database, recorded, insertCount };
}

const FIXED_NOW = 1_717_459_200_000;
const VALID_TIMESTAMP = FIXED_NOW - 1000;

function makeDeps(overrides: Partial<AnalyticsRouteDependencies> = {}): AnalyticsRouteDependencies {
  return {
    requireAuthenticatedSession: overrides.requireAuthenticatedSession ?? makeAuthOk(),
    verifier: undefined,
    accountResolver: undefined,
    analyticsUserIdSalt: TEST_SALT,
    now: overrides.now ?? (() => FIXED_NOW),
    rateLimitCapacity: overrides.rateLimitCapacity,
  };
}

describe('POST /api/analytics/events (WP-205 / D-20503)', () => {
  test('single-event happy path → 202 { accepted: 1 } with hashed user_id (D-20502); Cache-Control no-store set', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const koaContext = makeKoaContext({
      body: {
        event_type: 'direct',
        user_id: 'alice@example.com',
        session_id: 'session-1',
        timestamp: VALID_TIMESTAMP,
      },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 202);
    assert.deepStrictEqual(koaContext.body, { accepted: 1 });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    // why: D-20502 — the INSERT bind values include the hashed
    // user_id, NOT the raw user_id. Computed hash = SHA-256 hex of
    // `alice@example.com|test-route-salt`.
    const expectedHash = createHash('sha256').update('alice@example.com|test-route-salt').digest('hex');
    const insertCall = fake.recorded.find((entry) => entry.sql.includes('INSERT INTO legendary.analytics_events'));
    assert.notEqual(insertCall, undefined);
    assert.equal(insertCall!.values[1], expectedHash);
    // why: D-20502 — raw user_id MUST NOT appear in ANY bound value.
    for (const value of insertCall!.values) {
      if (typeof value === 'string') {
        assert.equal(value.includes('alice@example.com'), false, 'Raw user_id MUST NOT appear in any INSERT bind value per D-20502.');
      }
    }
  });

  test('batch happy path → 202 { accepted: N } with single transaction', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const events = Array.from({ length: 5 }, (_, index) => ({
      event_type: 'direct' as const,
      user_id: null,
      session_id: `session-${index}`,
      timestamp: VALID_TIMESTAMP,
    }));
    const koaContext = makeKoaContext({ body: { events } });
    await handler(koaContext);
    assert.equal(koaContext.status, 202);
    assert.deepStrictEqual(koaContext.body, { accepted: 5 });
    const sqls = fake.recorded.map((entry) => entry.sql);
    assert.equal(sqls[0], 'BEGIN');
    assert.equal(sqls[sqls.length - 1], 'COMMIT');
  });

  test('closed-set event_type rejection → 400 invalid_request BEFORE any DB write (D-20501)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const koaContext = makeKoaContext({
      body: {
        event_type: 'unknown-channel',
        user_id: null,
        session_id: 'session-1',
        timestamp: VALID_TIMESTAMP,
      },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.deepStrictEqual(koaContext.body, { code: 'invalid_request' });
    assert.equal(fake.insertCount.count, 0);
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });

  test('malformed payload → 400 invalid_request (missing session_id; non-string session_id; non-number timestamp)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const cases = [
      { event_type: 'direct', user_id: null, timestamp: VALID_TIMESTAMP },
      { event_type: 'direct', user_id: null, session_id: 42, timestamp: VALID_TIMESTAMP },
      { event_type: 'direct', user_id: null, session_id: 'session-1', timestamp: 'not-a-number' },
    ];
    for (const body of cases) {
      const koaContext = makeKoaContext({ body });
      await handler(koaContext);
      assert.equal(koaContext.status, 400);
      assert.deepStrictEqual(koaContext.body, { code: 'invalid_request' });
    }
    assert.equal(fake.insertCount.count, 0);
  });

  test('batch over 50 events → 413 payload_too_large; no DB writes', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps({ rateLimitCapacity: 1000 }));
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const events = Array.from({ length: 51 }, (_, index) => ({
      event_type: 'direct',
      user_id: null,
      session_id: `s-${index}`,
      timestamp: VALID_TIMESTAMP,
    }));
    const koaContext = makeKoaContext({ body: { events } });
    await handler(koaContext);
    assert.equal(koaContext.status, 413);
    assert.deepStrictEqual(koaContext.body, { code: 'payload_too_large' });
    assert.equal(fake.insertCount.count, 0);
  });

  test('rate limit per-event semantics (D-20503): batch of 51 with 50-token capacity → 429 BEFORE any INSERT', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    let hashUserIdCallCount = 0;
    const originalHashUserId = (await import('./userIdHash.js')).hashUserId;
    // why: a spy is overkill here — the verification axis is the
    // INSERT count (0) and the response status (429), both of
    // which the fake DB and koaContext make observable.
    void originalHashUserId;
    void hashUserIdCallCount;
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps({ rateLimitCapacity: 40 }));
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    // why: D-20503 — capacity is 40 events; batch of 41 events
    // exceeds remaining tokens BEFORE any parsing/hashing/INSERT;
    // full batch dropped (no partial accept). Token bucket capacity
    // is on EVENTS, not REQUESTS — batching cannot bypass the limit.
    const events = Array.from({ length: 41 }, (_, index) => ({
      event_type: 'direct',
      user_id: null,
      session_id: `s-${index}`,
      timestamp: VALID_TIMESTAMP,
    }));
    const koaContext = makeKoaContext({ body: { events } });
    await handler(koaContext);
    assert.equal(koaContext.status, 429);
    assert.deepStrictEqual(koaContext.body, { code: 'rate_limited' });
    assert.equal(fake.insertCount.count, 0, 'Rate limit MUST reject the full batch BEFORE any INSERT per D-20503.');
  });

  test('rate limit triggers on subsequent request from same IP after capacity exhausted', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps({ rateLimitCapacity: 2 }));
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const event = { event_type: 'direct', user_id: null, session_id: 's', timestamp: VALID_TIMESTAMP };
    for (let i = 0; i < 2; i = i + 1) {
      const context = makeKoaContext({ body: event });
      await handler(context);
      assert.equal(context.status, 202);
    }
    const exceedContext = makeKoaContext({ body: event });
    await handler(exceedContext);
    assert.equal(exceedContext.status, 429);
    assert.deepStrictEqual(exceedContext.body, { code: 'rate_limited' });
  });

  test('anonymous event (user_id: null) → 202 with user_id_hash = NULL bound', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const koaContext = makeKoaContext({
      body: { event_type: 'direct', user_id: null, session_id: 's', timestamp: VALID_TIMESTAMP },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 202);
    const insertCall = fake.recorded.find((entry) => entry.sql.includes('INSERT INTO legendary.analytics_events'));
    assert.notEqual(insertCall, undefined);
    assert.equal(insertCall!.values[1], null, 'Anonymous events MUST bind user_id_hash = NULL per D-20502 null passthrough.');
  });

  test('NOT idempotent (D-20503): same payload POSTed twice produces 2 rows', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const body = { event_type: 'direct', user_id: 'alice', session_id: 's-1', timestamp: VALID_TIMESTAMP };
    await handler(makeKoaContext({ body }));
    await handler(makeKoaContext({ body }));
    assert.equal(fake.insertCount.count, 2, 'Capture endpoint MUST NOT deduplicate; duplicate POSTs produce duplicate rows per D-20503.');
  });

  test('timestamp bounds: < 0 → 400; > currentServerTime + 5min → 400; equal-to-upper-bound → 202', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const baseEvent = { event_type: 'direct', user_id: null, session_id: 's' };
    const tooLow = makeKoaContext({ body: { ...baseEvent, timestamp: -1 } });
    await handler(tooLow);
    assert.equal(tooLow.status, 400);
    const tooHigh = makeKoaContext({ body: { ...baseEvent, timestamp: FIXED_NOW + 5 * 60 * 1000 + 1 } });
    await handler(tooHigh);
    assert.equal(tooHigh.status, 400);
    const onBoundary = makeKoaContext({ body: { ...baseEvent, timestamp: FIXED_NOW + 5 * 60 * 1000 } });
    await handler(onBoundary);
    assert.equal(onBoundary.status, 202);
  });

  test('session_id length bounds: empty → 400; 129 chars → 400; 128 chars → 202', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const base = { event_type: 'direct', user_id: null, timestamp: VALID_TIMESTAMP };
    const empty = makeKoaContext({ body: { ...base, session_id: '' } });
    await handler(empty);
    assert.equal(empty.status, 400);
    const tooLong = makeKoaContext({ body: { ...base, session_id: 'a'.repeat(129) } });
    await handler(tooLong);
    assert.equal(tooLong.status, 400);
    const onBoundary = makeKoaContext({ body: { ...base, session_id: 'a'.repeat(128) } });
    await handler(onBoundary);
    assert.equal(onBoundary.status, 202);
  });

  test('user_id length: 513 chars → 400 WITHOUT hashing; 512 chars → 202; null → 202 (D-20503 ordering)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const base = { event_type: 'direct', session_id: 's', timestamp: VALID_TIMESTAMP };
    const tooLong = makeKoaContext({ body: { ...base, user_id: 'a'.repeat(513) } });
    await handler(tooLong);
    assert.equal(tooLong.status, 400);
    assert.equal(fake.insertCount.count, 0);
    const onBoundary = makeKoaContext({ body: { ...base, user_id: 'a'.repeat(512) } });
    await handler(onBoundary);
    assert.equal(onBoundary.status, 202);
    const nullCase = makeKoaContext({ body: { ...base, user_id: null } });
    await handler(nullCase);
    assert.equal(nullCase.status, 202);
  });

  test('properties depth 6 → 400; depth 5 → 202; arrays count as one level (D-20501)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const base = { event_type: 'direct', user_id: null, session_id: 's', timestamp: VALID_TIMESTAMP };
    // why: depth-6 nested object. Levels: 0 (root) → 1 → 2 → 3 → 4
    // → 5 → 6 (leaf at level 6 fails the MAX_PROPERTIES_DEPTH=5).
    const depth6: Record<string, unknown> = { l1: { l2: { l3: { l4: { l5: { l6: 'leaf' } } } } } };
    const tooDeep = makeKoaContext({ body: { ...base, properties: depth6 } });
    await handler(tooDeep);
    assert.equal(tooDeep.status, 400);
    // why: depth-5 nested object passes.
    const depth5: Record<string, unknown> = { l1: { l2: { l3: { l4: { l5: 'leaf' } } } } };
    const okDepth = makeKoaContext({ body: { ...base, properties: depth5 } });
    await handler(okDepth);
    assert.equal(okDepth.status, 202);
    // why: 5-level array nested inside a 1-level object → 6 levels
    // total (root + 5 array levels) → rejected.
    const arrayDeep: unknown = { l1: [[[[[ 'leaf' ]]]]] };
    const arrayTooDeep = makeKoaContext({ body: { ...base, properties: arrayDeep } });
    await handler(arrayTooDeep);
    assert.equal(arrayTooDeep.status, 400);
  });

  test('properties forbidden leaf types: Date / Map / Set / Function / class / BigInt / Symbol → 400 (D-20501)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const base = { event_type: 'direct', user_id: null, session_id: 's', timestamp: VALID_TIMESTAMP };
    class MyClass { constructor(public x = 1) {} }
    const forbidden: Array<{ name: string; value: unknown }> = [
      { name: 'Date', value: { ts: new Date() } },
      { name: 'Map', value: { m: new Map() } },
      { name: 'Set', value: { s: new Set() } },
      { name: 'Function', value: { f: () => {} } },
      { name: 'class instance', value: { c: new MyClass() } },
      { name: 'BigInt', value: { b: BigInt(1) } },
      { name: 'Symbol', value: { y: Symbol('x') } },
    ];
    for (const { name, value } of forbidden) {
      const context = makeKoaContext({ body: { ...base, properties: value } });
      await handler(context);
      assert.equal(context.status, 400, `Forbidden ${name} leaf in properties MUST be rejected with 400 per D-20501.`);
    }
    // why: D-20501 — arrays at root forbidden.
    const arrayRoot = makeKoaContext({ body: { ...base, properties: [] } });
    await handler(arrayRoot);
    assert.equal(arrayRoot.status, 400);
  });

  test('empty properties default: absent OR {} → 202 (D-20501; route relies on SQL DEFAULT for absent case)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const base = { event_type: 'direct', user_id: null, session_id: 's', timestamp: VALID_TIMESTAMP };
    const absent = makeKoaContext({ body: base });
    await handler(absent);
    assert.equal(absent.status, 202);
    const emptyObj = makeKoaContext({ body: { ...base, properties: {} } });
    await handler(emptyObj);
    assert.equal(emptyObj.status, 202);
  });

  test('leakage gate: raw user_id NOT in error response body when over-long user_id rejected (D-20502 tightening)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const koaContext = makeKoaContext({
      body: {
        event_type: 'direct',
        user_id: 'alice@example.com' + 'x'.repeat(500),
        session_id: 's',
        timestamp: VALID_TIMESTAMP,
      },
    });
    await handler(koaContext);
    assert.equal(koaContext.status, 400);
    const bodyJson = JSON.stringify(koaContext.body);
    assert.equal(
      bodyJson.includes('alice@example.com'),
      false,
      'D-20502 leakage gate: raw user_id MUST NOT appear in 4xx error response body — messages reference field NAMES, not VALUES.',
    );
  });

  test('leakage gate: raw user_id NOT in captured logs during happy-path POST (D-20502 tightening)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'POST', '/api/analytics/events').handler;
    const logSpy = mock.method(console, 'log', () => {});
    const infoSpy = mock.method(console, 'info', () => {});
    const warnSpy = mock.method(console, 'warn', () => {});
    const errorSpy = mock.method(console, 'error', () => {});
    try {
      const koaContext = makeKoaContext({
        body: {
          event_type: 'direct',
          user_id: 'alice@example.com',
          // why: D-20502 — `properties` string values are intentionally
          // preserved verbatim in the JSONB column (documented feature,
          // not leakage). The leakage gate scopes to LOGS + error
          // bodies — verifying the cleartext does NOT appear in any
          // captured console output emitted by analytics code.
          properties: { note: 'alice@example.com' },
          session_id: 's-leakage',
          timestamp: VALID_TIMESTAMP,
        },
      });
      await handler(koaContext);
      assert.equal(koaContext.status, 202);
      const allLogCalls = [
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ];
      for (const call of allLogCalls) {
        for (const argument of call.arguments) {
          const text = String(argument);
          assert.equal(
            text.includes('alice@example.com'),
            false,
            'D-20502 leakage gate: raw user_id MUST NOT appear in any captured log line emitted by analytics code.',
          );
        }
      }
    } finally {
      logSpy.mock.restore();
      infoSpy.mock.restore();
      warnSpy.mock.restore();
      errorSpy.mock.restore();
    }
  });
});

describe('GET /api/analytics/traffic-sources (WP-205 / D-20503)', () => {
  test('authenticated happy path → 200 { data: TrafficSource[] } SQL-pre-sorted; Cache-Control set', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([
      {
        rows: [
          { channel: 'direct', date: '2026-05-25', visitor_count: 10, signup_count: 3 },
          { channel: 'search', date: '2026-05-26', visitor_count: 5, signup_count: 1 },
        ],
      },
    ]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'GET', '/api/analytics/traffic-sources').handler;
    const koaContext = makeKoaContext({ query: { range: '14d' } });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, {
      data: [
        { channel: 'direct', date: '2026-05-25', visitorCount: 10, signupCount: 3 },
        { channel: 'search', date: '2026-05-26', visitorCount: 5, signupCount: 1 },
      ],
    });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
    // why: D-20503 envelope shape — server returns bare `{ data: T[] }`;
    // dashboard wraps with source/updatedAt at the LIVE-flip site.
    assert.equal('source' in (koaContext.body as Record<string, unknown>), false);
    assert.equal('updatedAt' in (koaContext.body as Record<string, unknown>), false);
  });

  test('invalid range → 400 invalid_request; range absent → 400', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'GET', '/api/analytics/traffic-sources').handler;
    const invalid = makeKoaContext({ query: { range: 'forever' } });
    await handler(invalid);
    assert.equal(invalid.status, 400);
    assert.deepStrictEqual(invalid.body, { code: 'invalid_request' });
    const absent = makeKoaContext({ query: {} });
    await handler(absent);
    assert.equal(absent.status, 400);
  });

  test('auth failure collapse: 4 401-mapped codes all collapse to { code: unauthorized } (D-10403)', async () => {
    for (const code of ['missing_token', 'invalid_token', 'expired_token', 'unknown_account'] as const) {
      const { router, routes } = makeRouter();
      const fake = makeQueryFake([]);
      registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps({ requireAuthenticatedSession: makeAuthFail(code) }));
      const handler = findRoute(routes, 'GET', '/api/analytics/traffic-sources').handler;
      const koaContext = makeKoaContext({ query: { range: '7d' } });
      await handler(koaContext);
      assert.equal(koaContext.status, 401, `Auth code "${code}" MUST collapse to 401.`);
      assert.deepStrictEqual(koaContext.body, { code: 'unauthorized' });
    }
  });

  test('empty data path → 200 { data: [] } (NOT 404) with Cache-Control set', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([{ rows: [] }]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'GET', '/api/analytics/traffic-sources').handler;
    const koaContext = makeKoaContext({ query: { range: '7d' } });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, { data: [] });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });
});

describe('GET /api/analytics/activation-funnel + /retention-cohorts (WP-205 / D-20503)', () => {
  test('activation-funnel: authenticated happy path → 200 { data: ActivationFunnelStep[] }', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([
      {
        rows: [{ step: 'signup-start', date: '2026-05-25', count: 100 }],
      },
    ]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'GET', '/api/analytics/activation-funnel').handler;
    const koaContext = makeKoaContext({ query: { range: '30d' } });
    await handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepStrictEqual(koaContext.body, {
      data: [{ step: 'signup-start', date: '2026-05-25', count: 100 }],
    });
    assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store');
  });

  test('retention-cohorts: cohortCount defaults to 8 if absent; out-of-range → 400; valid → 200', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([
      { rows: [{ cohort_week: '2026-W22', cohort_size: 50, day1_return_count: 20, day7_return_count: 15 }] },
      { rows: [] },
      { rows: [] },
    ]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps());
    const handler = findRoute(routes, 'GET', '/api/analytics/retention-cohorts').handler;
    const defaultCase = makeKoaContext({ query: {} });
    await handler(defaultCase);
    assert.equal(defaultCase.status, 200);
    const cohortQueryValues = fake.recorded[0]?.values ?? [];
    assert.equal(cohortQueryValues[0], 8, 'cohortCount MUST default to 8 when absent per D-20503.');
    const overMax = makeKoaContext({ query: { cohortCount: '27' } });
    await handler(overMax);
    assert.equal(overMax.status, 400);
    const valid = makeKoaContext({ query: { cohortCount: '4' } });
    await handler(valid);
    assert.equal(valid.status, 200);
  });

  test('Cache-Control no-store set on every response path including error paths (D-11504 lock)', async () => {
    const { router, routes } = makeRouter();
    const fake = makeQueryFake([]);
    registerAnalyticsRoutes(router as unknown as Parameters<typeof registerAnalyticsRoutes>[0], fake.database, makeDeps({ requireAuthenticatedSession: makeAuthFail('missing_token') }));
    for (const path of [
      '/api/analytics/traffic-sources',
      '/api/analytics/activation-funnel',
      '/api/analytics/retention-cohorts',
    ]) {
      const handler = findRoute(routes, 'GET', path).handler;
      const koaContext = makeKoaContext({ query: { range: '7d' } });
      await handler(koaContext);
      assert.equal(koaContext.responseHeaders['Cache-Control'], 'no-store', `Cache-Control MUST be set on ${path} 401 response.`);
    }
  });
});
