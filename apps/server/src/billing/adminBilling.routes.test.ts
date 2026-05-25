/**
 * Tests for the `GET /api/admin/billing/history` route handler
 * registered by `registerAdminBillingRoutes` (WP-176 / EC-198).
 * Logic-pure suite: fakes are injected at construction time; no live
 * database, no network.
 *
 * Authority: WP-176 §B; EC-198 §Locked Values + §Guardrails.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { registerAdminBillingRoutes } from './adminBilling.routes.js';
import type { DatabaseClient } from './billing.types.js';
import type {
  AdminSessionResult,
} from '../auth/adminSession.js';
import type {
  AccountId,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
} from '../auth/sessionToken.types.js';

/**
 * Minimal fake Koa context for testing the billing route handler.
 */
interface FakeAdminContext {
  readonly req: SessionTokenRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
  headersSet: Record<string, string>;
}

/**
 * Captured GET route registration from the fake router.
 */
interface RegisteredGetRoute {
  path: string;
  handler: (ctx: FakeAdminContext) => Promise<void> | void;
}

/**
 * Fake Koa router that captures route registrations.
 */
class FakeRouter {
  readonly getRoutes: RegisteredGetRoute[] = [];
  get(
    path: string,
    handler: (ctx: FakeAdminContext) => Promise<void> | void,
  ): unknown {
    this.getRoutes.push({ path, handler });
    return undefined;
  }
  getRouteFor(path: string): RegisteredGetRoute {
    const found = this.getRoutes.find((route) => route.path === path);
    assert.ok(found !== undefined, `expected GET route ${path} to be registered`);
    return found;
  }
}

/**
 * Build a fake Koa context with optional request headers.
 */
function makeContext(): FakeAdminContext {
  const headersSet: Record<string, string> = {};
  return {
    req: { headers: {} } as unknown as SessionTokenRequest,
    status: 0,
    body: undefined,
    set(field, value) {
      headersSet[field] = value;
    },
    headersSet,
  };
}

/**
 * Build a fake DatabaseClient that returns fixed rows or throws.
 */
function makeFakeDatabase(args: {
  rows?: ReadonlyArray<Record<string, unknown>>;
  throwOnQuery?: boolean;
}): DatabaseClient {
  const rows = args.rows ?? [];
  const throwOnQuery = args.throwOnQuery ?? false;
  return {
    async query() {
      if (throwOnQuery) {
        throw new Error('Simulated database connection failure.');
      }
      return { rows: [...rows] };
    },
  } as unknown as DatabaseClient;
}

/**
 * Factory for a fake `requireAdminSession` that always returns a
 * fixed result. Byte-identical to `adminProfile.routes.test.ts`.
 */
function makeRequireAdminSession(
  result: AdminSessionResult,
): (
  request: SessionTokenRequest,
  options: RequireAuthenticatedSessionOptions,
) => Promise<AdminSessionResult> {
  return async () => result;
}

const okSession: AdminSessionResult = {
  ok: true,
  accountId: 'aaaaaaaa-1111-4444-9999-aaaaaaaaaaaa' as AccountId,
};
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

describe('GET /api/admin/billing/history (WP-176)', () => {
  test('returns 200 with entries for valid admin session', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({
      rows: [
        {
          account_id: 'acct-001',
          session_id: 'cs_test_abc',
          entitlement_key: 'supporter_tier_basic_2026',
          intent_status: 'completed',
          created_at: new Date('2026-05-01T10:00:00Z'),
          completed_at: new Date('2026-05-01T10:05:00Z'),
        },
      ],
    });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.status, 200);
    const responseBody = ctx.body as { entries: unknown[] };
    assert.equal(responseBody.entries.length, 1);
  });

  test('returns 401 when requireAdminSession returns unauthorized', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(unauthorizedSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.status, 401);
    assert.deepStrictEqual(ctx.body, {
      code: 'unauthorized',
      reason: 'Admin session validation failed: upstream session check rejected the request.',
    });
  });

  test('returns 403 when requireAdminSession returns forbidden', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(forbiddenSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.status, 403);
    assert.deepStrictEqual(ctx.body, {
      code: 'forbidden',
      reason: 'Authenticated account does not have admin privileges.',
    });
  });

  test('Cache-Control no-store header present on 200 response', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('Cache-Control no-store header present on 401 response', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(unauthorizedSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('returns 500 on database fault with valid admin session', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ throwOnQuery: true });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.status, 500);
    assert.deepStrictEqual(ctx.body, { error: 'internal_error' });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('Cache-Control no-store header present on 500 response', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ throwOnQuery: true });
    registerAdminBillingRoutes(router as never, database, {
      requireAdminSession: makeRequireAdminSession(okSession),
    });
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });
});
