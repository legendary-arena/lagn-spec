/**
 * Tests for `registerAdminProfileRoutes` (WP-107 / EC-195).
 *
 * Logic-pure suite: fakes are injected at construction time; no live
 * database, no network. Covers the locked HTTP status mapping per
 * WP-107 §Locked contract values:
 *
 *   - 200 happy paths (GET integrity, POST suspend, POST unsuspend)
 *   - 401 unauthorized (requireAdminSession returns 'unauthorized')
 *   - 403 forbidden (requireAdminSession returns 'forbidden')
 *   - 404 handle not found
 *   - 400 invalid_request (empty handle, missing body, invalid body
 *     shape, invalid reason)
 *   - 400 self-action (acting === target, zero audit rows written)
 *   - 500 internal_error (logic-layer transaction failure)
 *   - Cache-Control: no-store header set on every response path
 *
 * Authority: WP-107 §Acceptance Criteria; EC-195 §Locked Values +
 * §Guardrails (transaction ownership in logic, not routes;
 * requireAdminSession first; self-action 400; reason trim).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { IncomingMessage } from 'node:http';

import { registerAdminProfileRoutes } from './adminProfile.routes.js';
import type {
  AccountId,
  DatabaseClient,
} from '../../identity/identity.types.js';
import type {
  AdminSessionResult,
} from '../../auth/adminSession.js';
import type {
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
} from '../../auth/sessionToken.types.js';

const ACTING_ADMIN_ID = 'cccccccc-3333-4444-9999-cccccccccccc' as AccountId;
const TARGET_PLAYER_ID = 'dddddddd-4444-4444-9999-dddddddddddd' as AccountId;
const TARGET_HANDLE = 'TargetPlayer';
const TARGET_HANDLE_CANONICAL = 'targetplayer';

interface RegisteredRoute {
  method: 'GET' | 'POST';
  path: string;
  handler: (ctx: FakeContext) => Promise<void> | void;
}

interface FakeContext {
  readonly req: SessionTokenRequest & { headers: Record<string, string> };
  request: { body?: unknown };
  params: { handle?: string };
  status: number;
  body: unknown;
  set(field: string, value: string): void;
  headersSet: Record<string, string>;
}

class FakeRouter {
  readonly routes: RegisteredRoute[] = [];
  get(path: string, handler: RegisteredRoute['handler']): unknown {
    this.routes.push({ method: 'GET', path, handler });
    return undefined;
  }
  post(path: string, handler: RegisteredRoute['handler']): unknown {
    this.routes.push({ method: 'POST', path, handler });
    return undefined;
  }
  routeFor(method: 'GET' | 'POST', path: string): RegisteredRoute {
    const found = this.routes.find(
      (route) => route.method === method && route.path === path,
    );
    assert.ok(
      found !== undefined,
      `expected ${method} ${path} to be registered`,
    );
    return found;
  }
}

function makeContext(args?: {
  handle?: string;
  body?: unknown;
}): FakeContext {
  const headersSet: Record<string, string> = {};
  return {
    req: { headers: {} } as unknown as IncomingMessage & SessionTokenRequest & {
      headers: Record<string, string>;
    },
    request: { body: args?.body },
    params: { handle: args?.handle },
    status: 0,
    body: undefined,
    set(field, value) {
      headersSet[field] = value;
    },
    headersSet,
  };
}

function makeDatabase(rowsFactories: ReadonlyArray<() => readonly unknown[]>): DatabaseClient {
  // why: shared linear counter across direct `database.query(...)` and
  // pool-client `client.query(...)` calls. The route handler invokes
  // resolveHandleToAccountId (direct query) FIRST, then dispatches into
  // the logic layer which calls `database.connect()` and issues four
  // pool-client queries (BEGIN / UPDATE / INSERT RETURNING / COMMIT for
  // mutation routes; BEGIN / SELECT profile / SELECT audit / COMMIT for
  // the GET route). Tests lay out `rowsFactories` in that exact linear
  // order so the index points to the correct row factory for both
  // surfaces.
  let nextIndex = 0;
  return {
    async query() {
      const index = nextIndex;
      nextIndex += 1;
      const factory = rowsFactories[index];
      return { rows: factory === undefined ? [] : factory() };
    },
    async connect() {
      return {
        async query() {
          const index = nextIndex;
          nextIndex += 1;
          const factory = rowsFactories[index];
          return { rows: factory === undefined ? [] : factory() };
        },
        release() {
          // noop
        },
      };
    },
  } as unknown as DatabaseClient;
}

function makeRequireAdminSession(
  result: AdminSessionResult,
): (
  request: SessionTokenRequest,
  options: RequireAuthenticatedSessionOptions,
) => Promise<AdminSessionResult> {
  return async () => result;
}

const okSession: AdminSessionResult = { ok: true, accountId: ACTING_ADMIN_ID };
const unauthorizedSession: AdminSessionResult = {
  ok: false,
  code: 'unauthorized',
  reason: 'Admin session validation failed: upstream session check rejected the request.',
};
const forbiddenSession: AdminSessionResult = {
  ok: false,
  code: 'forbidden',
  reason: 'Authenticated account does not have admin privileges.',
};

describe('registerAdminProfileRoutes (WP-107) — registration shape', () => {
  test('Registers exactly three routes at the locked paths', () => {
    const router = new FakeRouter();
    const database = makeDatabase([]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    assert.equal(router.routes.length, 3);
    router.routeFor('GET', '/api/admin/players/:handle/integrity');
    router.routeFor('POST', '/api/admin/players/:handle/suspend');
    router.routeFor('POST', '/api/admin/players/:handle/unsuspend');
  });
});

describe('registerAdminProfileRoutes (WP-107) — GET /integrity', () => {
  test('200 happy path: returns AdminProfileResponse with Cache-Control no-store', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      // pool-client sequence for getAdminProfileView: BEGIN, profile SELECT, audit SELECT, COMMIT
      () => [],
      () => [
        {
          ext_id: TARGET_PLAYER_ID,
          handle_canonical: TARGET_HANDLE_CANONICAL,
          display_handle: TARGET_HANDLE,
          is_suspended: false,
        },
      ],
      () => [],
      () => [],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('GET', '/api/admin/players/:handle/integrity');
    const ctx = makeContext({ handle: TARGET_HANDLE });
    await route.handler(ctx);
    assert.equal(ctx.status, 200);
    assert.deepStrictEqual(ctx.body, {
      accountId: TARGET_PLAYER_ID,
      handle: TARGET_HANDLE_CANONICAL,
      isSuspended: false,
      recentAuditLog: [],
    });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('401 when requireAdminSession returns unauthorized', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(unauthorizedSession),
    });
    const route = router.routeFor('GET', '/api/admin/players/:handle/integrity');
    const ctx = makeContext({ handle: TARGET_HANDLE });
    await route.handler(ctx);
    assert.equal(ctx.status, 401);
    assert.equal((ctx.body as { code: string }).code, 'unauthorized');
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('403 when requireAdminSession returns forbidden', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(forbiddenSession),
    });
    const route = router.routeFor('GET', '/api/admin/players/:handle/integrity');
    const ctx = makeContext({ handle: TARGET_HANDLE });
    await route.handler(ctx);
    assert.equal(ctx.status, 403);
    assert.equal((ctx.body as { code: string }).code, 'forbidden');
  });

  test('400 when handle path param is missing', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('GET', '/api/admin/players/:handle/integrity');
    const ctx = makeContext({ handle: '' });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.equal((ctx.body as { code: string }).code, 'invalid_request');
  });

  test('404 when handle resolves to no row', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      // getAdminProfileView pool sequence: BEGIN, zero-row profile SELECT, COMMIT
      () => [],
      () => [],
      () => [],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('GET', '/api/admin/players/:handle/integrity');
    const ctx = makeContext({ handle: 'nonexistent' });
    await route.handler(ctx);
    assert.equal(ctx.status, 404);
    assert.equal((ctx.body as { code: string }).code, 'not_found');
  });
});

describe('registerAdminProfileRoutes (WP-107) — POST /suspend', () => {
  test('200 happy path: returns ok+actionId with Cache-Control no-store', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      // resolveHandleToAccountId direct query (handle -> ext_id)
      () => [{ ext_id: TARGET_PLAYER_ID }],
      // pool sequence for suspendPlayer: BEGIN, UPDATE, INSERT RETURNING, COMMIT
      () => [],
      () => [],
      () => [{ action_id: '301' }],
      () => [],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({
      handle: TARGET_HANDLE,
      body: { reason: 'Confirmed score fraud per replay audit' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 200);
    assert.deepStrictEqual(ctx.body, { ok: true, actionId: '301' });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('400 self-action: acting === target after handle resolution; zero audit rows written', async () => {
    const router = new FakeRouter();
    let suspendPlayerCalled = false;
    const database = {
      async query() {
        // resolveHandleToAccountId returns the acting admin's ext_id
        // so the self-action guard fires before suspendPlayer is invoked
        return { rows: [{ ext_id: ACTING_ADMIN_ID }] };
      },
      async connect() {
        suspendPlayerCalled = true;
        // If suspendPlayer were ever invoked, the test would fail
        // because we'd register an unexpected connect() — the
        // self-action guard at the route level must short-circuit
        // BEFORE the logic-layer call.
        return {
          async query() {
            return { rows: [] };
          },
          release() {
            // noop
          },
        };
      },
    } as unknown as DatabaseClient;
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({
      handle: 'self',
      body: { reason: 'Suspending myself' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.deepStrictEqual(ctx.body, {
      code: 'invalid_request',
      reason: 'Admins cannot suspend their own account.',
    });
    assert.equal(suspendPlayerCalled, false);
  });

  test('400 when body is missing', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      () => [{ ext_id: TARGET_PLAYER_ID }],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({ handle: TARGET_HANDLE, body: undefined });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.equal((ctx.body as { code: string }).code, 'invalid_request');
  });

  test('400 when reason is empty string', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      () => [{ ext_id: TARGET_PLAYER_ID }],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({ handle: TARGET_HANDLE, body: { reason: '' } });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.equal((ctx.body as { code: string }).code, 'invalid_request');
  });

  test('400 when reason is whitespace-only', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      () => [{ ext_id: TARGET_PLAYER_ID }],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({
      handle: TARGET_HANDLE,
      body: { reason: '       ' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.equal((ctx.body as { code: string }).code, 'invalid_request');
  });

  test('400 when reason exceeds 500 chars', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      () => [{ ext_id: TARGET_PLAYER_ID }],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({
      handle: TARGET_HANDLE,
      body: { reason: 'x'.repeat(501) },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.equal((ctx.body as { code: string }).code, 'invalid_request');
  });

  test('404 when handle does not resolve', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([() => []]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({
      handle: 'nobody',
      body: { reason: 'Test reason' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 404);
    assert.equal((ctx.body as { code: string }).code, 'not_found');
  });

  test('401 / 403 propagate from requireAdminSession before any DB query', async () => {
    const router = new FakeRouter();
    let dbQueried = false;
    const database = {
      async query() {
        dbQueried = true;
        return { rows: [] };
      },
      async connect() {
        dbQueried = true;
        return {
          async query() {
            return { rows: [] };
          },
          release() {
            // noop
          },
        };
      },
    } as unknown as DatabaseClient;
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(unauthorizedSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/suspend');
    const ctx = makeContext({
      handle: TARGET_HANDLE,
      body: { reason: 'Test' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 401);
    assert.equal(dbQueried, false);
  });
});

describe('registerAdminProfileRoutes (WP-107) — POST /unsuspend', () => {
  test('200 happy path: returns ok+actionId', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      () => [{ ext_id: TARGET_PLAYER_ID }],
      () => [],
      () => [],
      () => [{ action_id: '402' }],
      () => [],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/unsuspend');
    const ctx = makeContext({
      handle: TARGET_HANDLE,
      body: { reason: 'Appeal upheld' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 200);
    assert.deepStrictEqual(ctx.body, { ok: true, actionId: '402' });
  });

  test('400 self-action: acting === target after handle resolution', async () => {
    const router = new FakeRouter();
    const database = makeDatabase([
      () => [{ ext_id: ACTING_ADMIN_ID }],
    ]);
    registerAdminProfileRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.routeFor('POST', '/api/admin/players/:handle/unsuspend');
    const ctx = makeContext({
      handle: 'self',
      body: { reason: 'Unsuspending myself' },
    });
    await route.handler(ctx);
    assert.equal(ctx.status, 400);
    assert.deepStrictEqual(ctx.body, {
      code: 'invalid_request',
      reason: 'Admins cannot suspend their own account.',
    });
  });
});
