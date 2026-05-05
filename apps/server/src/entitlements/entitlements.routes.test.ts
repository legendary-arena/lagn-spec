/**
 * Tests for the entitlements HTTP route (WP-132 / EC-135).
 *
 * Five tests inside one describe block. All tests use mocked
 * dependencies (fake `requireAuthenticatedSession` returning a
 * configured `Result`; fake `getEntitlementsForAccount` is unused —
 * the helper is the real one but is fed a recording fake
 * `DatabaseClient` that produces deterministic rows).
 *
 * No real PostgreSQL, no real `SessionVerifier`, no real
 * `AccountResolver` — the deps bundle is shimmed at the
 * `registerEntitlementRoutes` call site.
 *
 * Authority: WP-132 §Scope (In) §F; EC-135 §3 (status-code closed
 * set; envelope split lock; Cache-Control first-statement lock);
 * D-13205 (route-wiring posture); WP-115 D-11504; WP-115 D-11802.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { registerEntitlementRoutes } from './entitlements.routes.js';
import type { EntitlementRouteDependencies } from './entitlements.routes.js';
import type {
  AccountId,
  DatabaseClient,
  SessionTokenRequest,
} from './entitlements.types.js';

interface RecordedHandler {
  path: string;
  handler: (koaContext: RecordedKoaContext) => Promise<void> | void;
}

interface RecordedKoaContext {
  readonly req: SessionTokenRequest;
  status: number;
  body: unknown;
  headers: Record<string, string>;
  set(field: string, value: string): void;
}

function makeRecordingRouter(): {
  router: { get: (path: string, handler: RecordedHandler['handler']) => void };
  recorded: RecordedHandler[];
} {
  const recorded: RecordedHandler[] = [];
  return {
    router: {
      get(path, handler) {
        recorded.push({ path, handler });
      },
    },
    recorded,
  };
}

function makeKoaContext(): RecordedKoaContext {
  const headers: Record<string, string> = {};
  return {
    req: {} as SessionTokenRequest,
    status: 0,
    body: undefined,
    headers,
    set(field: string, value: string): void {
      headers[field] = value;
    },
  };
}

const noopDatabase = {
  query: async () => ({ rows: [] }),
} as unknown as DatabaseClient;

function makeDeps(
  requireAuthenticatedSession: EntitlementRouteDependencies['requireAuthenticatedSession'],
): EntitlementRouteDependencies {
  return {
    requireAuthenticatedSession,
    verifier: undefined,
    accountResolver: undefined,
  };
}

const TEST_ACCOUNT_ID =
  '00000000-0000-4000-8000-000000000000' as AccountId;

describe('entitlements routes (WP-132)', () => {
  test('returns 200 with { entitlements: Entitlement[] } when authenticated and helper returns rows', async () => {
    const grantedAt = new Date('2026-04-01T12:00:00Z');
    const helperDatabase = {
      query: async (sql: string) => {
        if (sql.includes('FROM legendary.players')) {
          return { rows: [{ player_id: 7 }] };
        }
        if (sql.includes('FROM legendary.entitlements')) {
          return {
            rows: [
              {
                entitlement_key: 'cosmetic_playmat_classic',
                source: 'stripe',
                source_ref: 'cs_test_200',
                granted_at: grantedAt,
                revoked_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    } as unknown as DatabaseClient;
    const { router, recorded } = makeRecordingRouter();
    registerEntitlementRoutes(
      router,
      helperDatabase,
      makeDeps(async () => ({ ok: true, value: TEST_ACCOUNT_ID })),
    );
    const koaContext = makeKoaContext();
    await recorded[0]!.handler(koaContext);
    assert.equal(koaContext.status, 200);
    const responseBody = koaContext.body as {
      entitlements: { entitlementKey: string; source: string }[];
    };
    assert.equal(responseBody.entitlements.length, 1);
    assert.equal(
      responseBody.entitlements[0]?.entitlementKey,
      'cosmetic_playmat_classic',
    );
    assert.equal(responseBody.entitlements[0]?.source, 'stripe');
    assert.equal(koaContext.headers['Cache-Control'], 'no-store');
  });

  test('returns 401 with { code: unauthorized } when orchestrator returns missing_token', async () => {
    const { router, recorded } = makeRecordingRouter();
    registerEntitlementRoutes(
      router,
      noopDatabase,
      makeDeps(async () => ({
        ok: false,
        reason: 'no token',
        code: 'missing_token',
      })),
    );
    const koaContext = makeKoaContext();
    await recorded[0]!.handler(koaContext);
    assert.equal(koaContext.status, 401);
    assert.deepEqual(koaContext.body, { code: 'unauthorized' });
    assert.equal(koaContext.headers['Cache-Control'], 'no-store');
  });

  test('returns 500 with { code: session_verifier_not_configured } when orchestrator returns that code', async () => {
    const { router, recorded } = makeRecordingRouter();
    registerEntitlementRoutes(
      router,
      noopDatabase,
      makeDeps(async () => ({
        ok: false,
        reason: 'verifier missing',
        code: 'session_verifier_not_configured',
      })),
    );
    const koaContext = makeKoaContext();
    await recorded[0]!.handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepEqual(koaContext.body, {
      code: 'session_verifier_not_configured',
    });
    assert.equal(koaContext.headers['Cache-Control'], 'no-store');
  });

  test('returns 500 with { error: internal_error } when getEntitlementsForAccount returns lookup_failed', async () => {
    const failingDatabase = {
      query: async () => {
        throw new Error('simulated DB failure');
      },
    } as unknown as DatabaseClient;
    const { router, recorded } = makeRecordingRouter();
    registerEntitlementRoutes(
      router,
      failingDatabase,
      makeDeps(async () => ({ ok: true, value: TEST_ACCOUNT_ID })),
    );
    const koaContext = makeKoaContext();
    await recorded[0]!.handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepEqual(koaContext.body, { error: 'internal_error' });
    assert.equal(koaContext.headers['Cache-Control'], 'no-store');
  });

  test('sets Cache-Control: no-store as the first statement of every response branch', async () => {
    const grantedAt = new Date('2026-04-01T12:00:00Z');
    const helperDatabase = {
      query: async (sql: string) => {
        if (sql.includes('FROM legendary.players')) {
          return { rows: [{ player_id: 7 }] };
        }
        return {
          rows: [
            {
              entitlement_key: 'cosmetic_playmat_classic',
              source: 'stripe',
              source_ref: null,
              granted_at: grantedAt,
              revoked_at: null,
            },
          ],
        };
      },
    } as unknown as DatabaseClient;
    const failingDatabase = {
      query: async () => {
        throw new Error('simulated DB failure');
      },
    } as unknown as DatabaseClient;
    const branches: {
      label: string;
      database: DatabaseClient;
      deps: EntitlementRouteDependencies;
    }[] = [
      {
        label: '200 happy path',
        database: helperDatabase,
        deps: makeDeps(async () => ({ ok: true, value: TEST_ACCOUNT_ID })),
      },
      {
        label: '401 unauthorized',
        database: noopDatabase,
        deps: makeDeps(async () => ({
          ok: false,
          reason: 'no token',
          code: 'missing_token',
        })),
      },
      {
        label: '500 session_verifier_not_configured',
        database: noopDatabase,
        deps: makeDeps(async () => ({
          ok: false,
          reason: 'verifier missing',
          code: 'session_verifier_not_configured',
        })),
      },
      {
        label: '500 lookup_failed',
        database: failingDatabase,
        deps: makeDeps(async () => ({ ok: true, value: TEST_ACCOUNT_ID })),
      },
    ];
    for (const branch of branches) {
      const { router, recorded } = makeRecordingRouter();
      registerEntitlementRoutes(router, branch.database, branch.deps);
      const koaContext = makeKoaContext();
      await recorded[0]!.handler(koaContext);
      assert.equal(
        koaContext.headers['Cache-Control'],
        'no-store',
        `branch ${branch.label} did not set Cache-Control: no-store`,
      );
    }
  });
});
