/**
 * Tests for the `GET /api/me/billing/history` route handler registered
 * by `registerBillingRoutes` (WP-108 / EC-158). Logic-pure suite:
 * fakes are injected at construction time; no live database, no
 * network.
 *
 * Authority: WP-108 §Scope; EC-158 §4.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { IncomingMessage } from 'node:http';

import { registerBillingRoutes } from './billing.routes.js';
import type {
  AccountId,
  DatabaseClient,
  EntitlementKey,
  BillingConfig,
} from './billing.types.js';
import type {
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
} from '../auth/sessionToken.types.js';

const FAKE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001' as AccountId;

type SessionValidationCode =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'unknown_account'
  | 'session_verifier_not_configured'
  | 'lookup_failed';

type RequireAuthenticatedSessionResult =
  | { ok: true; value: AccountId }
  | { ok: false; reason: string; code: SessionValidationCode };

interface FakeBillingRequest extends SessionTokenRequest {
  body?: unknown;
  rawBody?: string;
}

interface FakeBillingContext {
  readonly req: IncomingMessage;
  request: FakeBillingRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
  headersSet: Record<string, string>;
}

interface RegisteredGetRoute {
  path: string;
  handler: (ctx: FakeBillingContext) => Promise<void> | void;
}

class FakeRouter {
  readonly getRoutes: RegisteredGetRoute[] = [];
  post(
    _path: string,
    ..._handlers: ReadonlyArray<unknown>
  ): unknown {
    return undefined;
  }
  get(
    path: string,
    handler: (ctx: FakeBillingContext) => Promise<void> | void,
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
  options: {
    headers?: Record<string, string | readonly string[] | undefined>;
  } = {},
): FakeBillingContext {
  const headersSet: Record<string, string> = {};
  return {
    req: {} as IncomingMessage,
    request: {
      headers: options.headers ?? {},
    },
    status: 0,
    body: undefined,
    set(field, value) {
      headersSet[field] = value;
    },
    headersSet,
  };
}

function makeBillingConfig(): BillingConfig {
  return Object.freeze({
    stripeSecretKey: 'sk_test_dummy',
    webhookSecret: 'whsec_dummy',
    priceAllowlist: new Map<string, EntitlementKey>(),
    publicBaseUrl: 'https://app.legendary-arena.com',
  });
}

function makeBillingHistoryDatabase(args: {
  playerExists?: boolean;
  historyRows?: ReadonlyArray<Record<string, unknown>>;
  throwOnQuery?: boolean;
}): DatabaseClient {
  const playerExists = args.playerExists ?? true;
  const historyRows = args.historyRows ?? [];
  const throwOnQuery = args.throwOnQuery ?? false;
  let callCount = 0;
  return {
    async query(text: string) {
      if (throwOnQuery) {
        throw new Error('connection refused');
      }
      callCount += 1;
      if (callCount === 1) {
        return { rows: playerExists ? [{ player_id: 42 }] : [] };
      }
      return { rows: [...historyRows] };
    },
  } as unknown as DatabaseClient;
}

describe('GET /api/me/billing/history', () => {
  test('returns 200 with history entries for authenticated user', async () => {
    const router = new FakeRouter();
    const database = makeBillingHistoryDatabase({
      historyRows: [
        {
          entitlement_key: 'cosmetic_card_back_2025',
          intent_status: 'completed',
          created_at: new Date('2026-05-10T12:00:00Z'),
          completed_at: new Date('2026-05-10T12:05:00Z'),
        },
      ],
    });
    registerBillingRoutes(router as never, database, {
      requireAuthenticatedSession: async () =>
        ({ ok: true, value: FAKE_ACCOUNT_ID }) as RequireAuthenticatedSessionResult,
      billingConfig: makeBillingConfig(),
    });
    const route = router.getRouteFor('/api/me/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);
    assert.equal(ctx.status, 200);
    const responseBody = ctx.body as { history: unknown[] };
    assert.equal(responseBody.history.length, 1);
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('returns 200 with empty history for authenticated user with no sessions', async () => {
    const router = new FakeRouter();
    const database = makeBillingHistoryDatabase({ historyRows: [] });
    registerBillingRoutes(router as never, database, {
      requireAuthenticatedSession: async () =>
        ({ ok: true, value: FAKE_ACCOUNT_ID }) as RequireAuthenticatedSessionResult,
      billingConfig: makeBillingConfig(),
    });
    const route = router.getRouteFor('/api/me/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);
    assert.equal(ctx.status, 200);
    const responseBody = ctx.body as { history: unknown[] };
    assert.deepStrictEqual(responseBody.history, []);
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('returns 401 with code unauthorized for unauthenticated request', async () => {
    const router = new FakeRouter();
    const database = makeBillingHistoryDatabase({});
    registerBillingRoutes(router as never, database, {
      requireAuthenticatedSession: async () =>
        ({ ok: false, reason: 'missing token', code: 'missing_token' }) as RequireAuthenticatedSessionResult,
      billingConfig: makeBillingConfig(),
    });
    const route = router.getRouteFor('/api/me/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);
    assert.equal(ctx.status, 401);
    assert.deepStrictEqual(ctx.body, { code: 'unauthorized' });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('returns 500 with error internal_error when helper returns ok: false', async () => {
    const router = new FakeRouter();
    const database = makeBillingHistoryDatabase({ playerExists: false });
    registerBillingRoutes(router as never, database, {
      requireAuthenticatedSession: async () =>
        ({ ok: true, value: FAKE_ACCOUNT_ID }) as RequireAuthenticatedSessionResult,
      billingConfig: makeBillingConfig(),
    });
    const route = router.getRouteFor('/api/me/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);
    assert.equal(ctx.status, 500);
    assert.deepStrictEqual(ctx.body, { error: 'internal_error' });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('Cache-Control no-store header present on all response paths', async () => {
    const router = new FakeRouter();
    const database = makeBillingHistoryDatabase({ throwOnQuery: true });
    registerBillingRoutes(router as never, database, {
      requireAuthenticatedSession: async () =>
        ({ ok: true, value: FAKE_ACCOUNT_ID }) as RequireAuthenticatedSessionResult,
      billingConfig: makeBillingConfig(),
    });
    const route = router.getRouteFor('/api/me/billing/history');
    const ctx = makeContext();
    await route.handler(ctx);
    assert.equal(ctx.status, 500);
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });
});
