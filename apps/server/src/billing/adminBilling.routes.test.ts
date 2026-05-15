/**
 * Tests for the `GET /api/admin/billing/history` route handler
 * registered by `registerAdminBillingRoutes` (WP-110 / EC-163).
 * Logic-pure suite: fakes are injected at construction time; no live
 * database, no network.
 *
 * Authority: WP-110 §J; EC-163 §Files to Produce.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import type { IncomingMessage } from 'node:http';

import { registerAdminBillingRoutes } from './adminBilling.routes.js';
import type { DatabaseClient } from './billing.types.js';

const TEST_SECRET = 'test-admin-secret-value-32chars!!';

interface FakeAdminContext {
  readonly req: IncomingMessage;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
  headersSet: Record<string, string>;
}

interface RegisteredGetRoute {
  path: string;
  handler: (ctx: FakeAdminContext) => Promise<void> | void;
}

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

function makeContext(
  headers?: Record<string, string | string[] | undefined>,
): FakeAdminContext {
  const headersSet: Record<string, string> = {};
  return {
    req: { headers: headers ?? {} } as unknown as IncomingMessage,
    status: 0,
    body: undefined,
    set(field, value) {
      headersSet[field] = value;
    },
    headersSet,
  };
}

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

describe('GET /api/admin/billing/history', () => {
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    originalEnvValue = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalEnvValue;
    }
  });

  test('returns 200 with entries for valid admin secret', async () => {
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
    registerAdminBillingRoutes(router as never, database);
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext({ 'x-admin-secret': TEST_SECRET });
    await route.handler(ctx);

    assert.equal(ctx.status, 200);
    const responseBody = ctx.body as { entries: unknown[] };
    assert.equal(responseBody.entries.length, 1);
  });

  test('returns 401 when X-Admin-Secret header is missing', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database);
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.status, 401);
    assert.deepStrictEqual(ctx.body, { code: 'unauthorized' });
  });

  test('returns 401 when X-Admin-Secret header is wrong', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database);
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext({ 'x-admin-secret': 'wrong-value' });
    await route.handler(ctx);

    assert.equal(ctx.status, 401);
    assert.deepStrictEqual(ctx.body, { code: 'unauthorized' });
  });

  test('Cache-Control no-store header present on success response', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database);
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext({ 'x-admin-secret': TEST_SECRET });
    await route.handler(ctx);

    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('Cache-Control no-store header present on 401 response', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ rows: [] });
    registerAdminBillingRoutes(router as never, database);
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);

    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('returns 500 on database fault with valid admin secret', async () => {
    const router = new FakeRouter();
    const database = makeFakeDatabase({ throwOnQuery: true });
    registerAdminBillingRoutes(router as never, database);
    const route = router.getRouteFor('/api/admin/billing/history');
    const ctx = makeContext({ 'x-admin-secret': TEST_SECRET });
    await route.handler(ctx);

    assert.equal(ctx.status, 500);
    assert.deepStrictEqual(ctx.body, { error: 'internal_error' });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });
});
