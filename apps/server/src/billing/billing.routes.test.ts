/**
 * Tests for `registerBillingRoutes` (WP-133 / EC-136). Logic-pure
 * suite: fakes are injected at construction time; no live database,
 * no live Stripe, no network. Tests construct ctx-shaped fake Koa
 * contexts and invoke the registered handlers directly.
 *
 * Required cases per EC-136 §1 billing.routes.test.ts:
 *
 *   - `POST /api/billing/checkout-session`:
 *     * 200 happy path with stub Stripe client.
 *     * 400 on disallowed `priceId` ('invalid_price').
 *     * 400 on extra request field (e.g., `successUrl` posted from
 *       client) ('invalid_request') — confirms the redirect-
 *       manipulation defense.
 *     * 401 on auth failure (collapsed to 'unauthorized' per
 *       WP-104 D-10403).
 *     * 500 on unconfigured-verifier ('session_verifier_not_configured').
 *     * 503 on `billingConfig === undefined` ('billing_not_configured').
 *
 *   - `POST /api/billing/webhook/stripe`:
 *     * 200 on first delivery (`{ received: true, duplicate: false }`).
 *     * 200 on duplicate event ID (`{ received: true, duplicate: true }`).
 *     * 400 on bad signature ('invalid_signature').
 *
 * Authority: WP-133 §Scope (In) §F; EC-136 §1; EC-136 §3 (status-code
 * domains; envelope split; allowlist-before-Stripe; no-event-type-
 * filter); WP-104 D-10403 (collapse to 'unauthorized').
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type Stripe from 'stripe';
import type { IncomingMessage } from 'node:http';

import { registerBillingRoutes } from './billing.routes.js';
import type {
  AccountId,
  BillingConfig,
  DatabaseClient,
  EntitlementKey,
} from './billing.types.js';
import type {
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
} from '../auth/sessionToken.types.js';

const FAKE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001' as AccountId;

interface RegisteredRoute {
  path: string;
  handlers: ReadonlyArray<
    (
      ctx: FakeBillingContext,
      next: () => Promise<void>,
    ) => Promise<void> | void
  >;
}

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

class FakeRouter {
  readonly routes: RegisteredRoute[] = [];
  post(
    path: string,
    ...handlers: ReadonlyArray<
      (
        ctx: FakeBillingContext,
        next: () => Promise<void>,
      ) => Promise<void> | void
    >
  ): unknown {
    this.routes.push({ path, handlers });
    return undefined;
  }
  get(
    _path: string,
    _handler: (ctx: FakeBillingContext) => Promise<void> | void,
  ): unknown {
    return undefined;
  }
  routeFor(path: string): RegisteredRoute {
    const found = this.routes.find((route) => route.path === path);
    assert.ok(found !== undefined, `expected route ${path} to be registered`);
    return found;
  }
}

function makeContext(
  options: {
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string | readonly string[] | undefined>;
  } = {},
): FakeBillingContext {
  const headersSet: Record<string, string> = {};
  return {
    req: {} as IncomingMessage,
    request: {
      headers: options.headers ?? {},
      body: options.body,
      rawBody: options.rawBody,
    },
    status: 0,
    body: undefined,
    set(field, value) {
      headersSet[field] = value;
    },
    headersSet,
  };
}

async function invokeRoute(
  route: RegisteredRoute,
  ctx: FakeBillingContext,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    const current = route.handlers[index];
    index += 1;
    if (current === undefined) {
      return;
    }
    await current(ctx, next);
  }
  await next();
}

function makeAllowlist(
  entries: ReadonlyArray<readonly [string, EntitlementKey]>,
): ReadonlyMap<string, EntitlementKey> {
  return new Map(entries);
}

function makeBillingConfig(
  priceAllowlist: ReadonlyMap<string, EntitlementKey>,
): BillingConfig {
  return Object.freeze({
    stripeSecretKey: 'sk_test_dummy',
    webhookSecret: 'whsec_dummy',
    priceAllowlist,
    publicBaseUrl: 'https://app.legendary-arena.com',
  });
}

function makeDatabase(rowCount: number | null = 1): DatabaseClient {
  return {
    query: async () => ({ rowCount, rows: [] }),
  } as unknown as DatabaseClient;
}

/**
 * Stub `DatabaseClient` for WP-134 webhook tests. Dispatches on the
 * SQL text to return canned responses for `recordStripeEvent` INSERT,
 * the post-INSERT row SELECT (`loadStripeEventRecordByEventId`),
 * `processStripeEvent`'s session SELECT, and the transaction-scope
 * writes. The configuration object lets each test express only the
 * branches it cares about; defaults reproduce a happy fulfillment
 * path.
 */
function makeWebhookFulfillmentDatabase(args: {
  insertRowCount?: number;
  eventRow?: {
    id: bigint;
    event_id: string;
    event_type: string;
    payload: unknown;
    received_at: string;
    processed_at: string | null;
    process_error: string | null;
  } | null;
  sessionRow?: {
    account_id: string;
    price_id: string;
    entitlement_key: string;
    intent_status: string;
  } | null;
  playerIdRow?: { player_id: number } | null;
  insertEntitlementRowCount?: number;
}): DatabaseClient {
  const insertRowCount = args.insertRowCount ?? 1;
  const eventRow = args.eventRow ?? null;
  const sessionRow = args.sessionRow ?? null;
  const playerIdRow = args.playerIdRow ?? { player_id: 42 };
  const insertEntitlementRowCount = args.insertEntitlementRowCount ?? 1;

  async function dispatch(
    text: string,
  ): Promise<{ rows: ReadonlyArray<unknown>; rowCount: number }> {
    if (text.includes('INSERT INTO legendary.stripe_events')) {
      return { rows: [], rowCount: insertRowCount };
    }
    if (text.includes('FROM legendary.stripe_events WHERE event_id')) {
      return eventRow === null
        ? { rows: [], rowCount: 0 }
        : { rows: [eventRow], rowCount: 1 };
    }
    if (
      text.includes('SELECT account_id, price_id, entitlement_key, intent_status')
    ) {
      return sessionRow === null
        ? { rows: [], rowCount: 0 }
        : { rows: [sessionRow], rowCount: 1 };
    }
    if (text.includes('SELECT player_id FROM legendary.players')) {
      return playerIdRow === null
        ? { rows: [], rowCount: 0 }
        : { rows: [playerIdRow], rowCount: 1 };
    }
    if (text.includes('INSERT INTO legendary.entitlements')) {
      return insertEntitlementRowCount === 1
        ? { rows: [{ id: 100 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (text.includes('UPDATE legendary.stripe_checkout_sessions')) {
      return { rows: [], rowCount: 1 };
    }
    if (text.includes('UPDATE legendary.stripe_events')) {
      return { rows: [], rowCount: 1 };
    }
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  const stubClient = {
    query: async (text: string) => dispatch(text),
    release: () => undefined,
  };
  return {
    query: async (text: string) => dispatch(text),
    connect: async () => stubClient,
  } as unknown as DatabaseClient;
}

const FAKE_EVENT_ROW = {
  id: 123n,
  event_id: 'evt_first',
  event_type: 'checkout.session.completed',
  payload: {
    id: 'evt_first',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_abc',
        client_reference_id: '00000000-0000-4000-8000-000000000001',
        metadata: { entitlementKey: 'cosmetic_playmat_classic' },
        payment_status: 'paid',
      },
    },
  },
  received_at: '2026-05-07T00:00:00.000Z',
  processed_at: null,
  process_error: null,
};

const FAKE_SESSION_ROW = {
  account_id: '00000000-0000-4000-8000-000000000001',
  price_id: 'price_supporter_2026',
  entitlement_key: 'cosmetic_playmat_classic',
  intent_status: 'open',
};

const WEBHOOK_BILLING_CONFIG = makeBillingConfig(
  makeAllowlist([['price_supporter_2026', 'cosmetic_playmat_classic']]),
);

function makeRequireOk() {
  return async (): Promise<{ ok: true; value: AccountId }> => ({
    ok: true,
    value: FAKE_ACCOUNT_ID,
  });
}

function makeRequireFail(
  code:
    | 'missing_token'
    | 'invalid_token'
    | 'expired_token'
    | 'unknown_account'
    | 'session_verifier_not_configured'
    | 'lookup_failed',
) {
  return async (
    _req: SessionTokenRequest,
    _options: RequireAuthenticatedSessionOptions,
  ): Promise<{ ok: false; reason: string; code: typeof code }> => ({
    ok: false,
    reason: `synthetic test failure: ${code}`,
    code,
  });
}

function makeStripeClient(args: {
  createSession?: (
    params: Stripe.Checkout.SessionCreateParams,
  ) => Promise<Stripe.Checkout.Session>;
  constructEvent?: (
    rawBody: string,
    sig: string,
    secret: string,
  ) => Stripe.Event;
}): Stripe {
  const createSession =
    args.createSession ??
    (async () => {
      throw new Error(
        'Test Stripe client checkout.sessions.create invoked when the test expected the call site to fail earlier.',
      );
    });
  const constructEvent =
    args.constructEvent ??
    (() => {
      throw new Error(
        'Test Stripe client webhooks.constructEvent invoked when the test expected the call site to fail earlier.',
      );
    });
  return {
    checkout: {
      sessions: {
        create: createSession,
      },
    },
    webhooks: {
      constructEvent,
    },
  } as unknown as Stripe;
}

const VALID_BILLING_CONFIG = makeBillingConfig(
  makeAllowlist([['price_supporter_2026', 'supporter_tier_basic_2026']]),
);

describe('POST /api/billing/checkout-session (WP-133)', () => {
  test('503 when billingConfig is undefined', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: undefined,
      stripeClient: undefined,
    });
    const ctx = makeContext({ body: { priceId: 'price_supporter_2026' } });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 503);
    assert.deepEqual(ctx.body, { code: 'billing_not_configured' });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('500 when verifier is unconfigured (session_verifier_not_configured)', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireFail(
        'session_verifier_not_configured',
      ),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({}),
    });
    const ctx = makeContext({ body: { priceId: 'price_supporter_2026' } });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 500);
    assert.deepEqual(ctx.body, { code: 'session_verifier_not_configured' });
  });

  test('401 unauthorized on missing_token (collapsed to unauthorized per D-10403)', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireFail('missing_token'),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({}),
    });
    const ctx = makeContext({ body: { priceId: 'price_supporter_2026' } });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 401);
    assert.deepEqual(ctx.body, { code: 'unauthorized' });
  });

  test('401 unauthorized on unknown_account (collapsed)', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireFail('unknown_account'),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({}),
    });
    const ctx = makeContext({ body: { priceId: 'price_supporter_2026' } });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 401);
    assert.deepEqual(ctx.body, { code: 'unauthorized' });
  });

  test('400 invalid_request on extra successUrl field (redirect-manipulation defense)', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({}),
      resolveCustomerEmail: async () => 'test@example.com',
    });
    const ctx = makeContext({
      body: {
        priceId: 'price_supporter_2026',
        successUrl: 'https://attacker.example/phish',
      },
    });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 400);
    assert.deepEqual(ctx.body, { code: 'invalid_request' });
  });

  test('400 invalid_request on missing priceId', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({}),
      resolveCustomerEmail: async () => 'test@example.com',
    });
    const ctx = makeContext({ body: {} });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 400);
    assert.deepEqual(ctx.body, { code: 'invalid_request' });
  });

  test('400 invalid_price on disallowed priceId without invoking Stripe', async () => {
    let stripeCalled = false;
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        createSession: async () => {
          stripeCalled = true;
          throw new Error('Stripe must not be called');
        },
      }),
      resolveCustomerEmail: async () => 'test@example.com',
    });
    const ctx = makeContext({ body: { priceId: 'price_unknown' } });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 400);
    assert.deepEqual(ctx.body, { code: 'invalid_price' });
    assert.equal(stripeCalled, false, 'Stripe must NOT be invoked on invalid_price');
  });

  test('200 happy path with server-derived successUrl/cancelUrl', async () => {
    const captured: { params?: Stripe.Checkout.SessionCreateParams } = {};
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(1), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        createSession: async (params) => {
          captured.params = params;
          return {
            id: 'cs_test_xyz',
            url: 'https://checkout.stripe.com/c/pay/cs_test_xyz',
          } as Stripe.Checkout.Session;
        },
      }),
      resolveCustomerEmail: async () => 'test@example.com',
    });
    const ctx = makeContext({ body: { priceId: 'price_supporter_2026' } });
    await invokeRoute(router.routeFor('/api/billing/checkout-session'), ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_xyz',
      sessionId: 'cs_test_xyz',
    });
    assert.equal(
      captured.params?.success_url,
      'https://app.legendary-arena.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
    );
    assert.equal(
      captured.params?.cancel_url,
      'https://app.legendary-arena.com/billing/cancel',
    );
  });
});

describe('POST /api/billing/webhook/stripe (WP-133)', () => {
  test('200 on first-delivery verified event with WP-134 fulfillment success shape', async () => {
    const router = new FakeRouter();
    const database = makeWebhookFulfillmentDatabase({
      insertRowCount: 1,
      eventRow: FAKE_EVENT_ROW,
      sessionRow: FAKE_SESSION_ROW,
    });
    registerBillingRoutes(router, database, {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: WEBHOOK_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => ({
          id: 'evt_first',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_abc' } },
          api_version: '2025-09-30.clover',
        }) as unknown as Stripe.Event,
      }),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_first"}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      received: true,
      duplicate: false,
      processed: true,
      reason: 'fulfilled',
    });
    assert.equal(ctx.headersSet['Cache-Control'], 'no-store');
  });

  test('200 on duplicate event with already-processed row skips WP-134 dispatch', async () => {
    const router = new FakeRouter();
    const database = makeWebhookFulfillmentDatabase({
      insertRowCount: 0,
      eventRow: { ...FAKE_EVENT_ROW, processed_at: '2026-05-07T00:00:00.000Z' },
      sessionRow: FAKE_SESSION_ROW,
    });
    registerBillingRoutes(router, database, {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: WEBHOOK_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => ({
          id: 'evt_dup',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_abc' } },
        }) as unknown as Stripe.Event,
      }),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_dup"}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      received: true,
      duplicate: true,
      processed: false,
      reason: null,
    });
  });

  test('400 invalid_signature on tampered body / bad signature', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(1), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => {
          throw new Error('No signatures found matching the expected signature');
        },
      }),
    });
    const ctx = makeContext({
      rawBody: '{"tampered":true}',
      headers: { 'stripe-signature': 't=1,v1=bad' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 400);
    assert.deepEqual(ctx.body, { code: 'invalid_signature' });
  });

  test('400 invalid_signature on missing Stripe-Signature header', async () => {
    const router = new FakeRouter();
    registerBillingRoutes(router, makeDatabase(1), {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({}),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_nosig"}',
      headers: {},
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 400);
    assert.deepEqual(ctx.body, { code: 'invalid_signature' });
  });

  test('500 internal_error when database INSERT fails', async () => {
    const router = new FakeRouter();
    const failingDatabase = {
      query: async () => {
        throw new Error('connection refused');
      },
    } as unknown as DatabaseClient;
    registerBillingRoutes(router, failingDatabase, {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: VALID_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => ({
          id: 'evt_db_fault',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_abc' } },
        }) as unknown as Stripe.Event,
      }),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_db_fault"}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 500);
    assert.deepEqual(ctx.body, { error: 'internal_error' });
  });
});

describe('webhook handler — WP-134 fulfillment', () => {
  test('self-heal duplicate-delivery: existing row with processed_at IS NULL triggers fulfillment dispatch', async () => {
    const router = new FakeRouter();
    const database = makeWebhookFulfillmentDatabase({
      insertRowCount: 0,
      eventRow: { ...FAKE_EVENT_ROW, processed_at: null },
      sessionRow: FAKE_SESSION_ROW,
    });
    registerBillingRoutes(router, database, {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: WEBHOOK_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => ({
          id: 'evt_first',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_abc' } },
        }) as unknown as Stripe.Event,
      }),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_first"}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      received: true,
      duplicate: true,
      processed: true,
      reason: 'fulfilled',
    });
  });

  test('skip duplicate-delivery: existing row with processed_at non-NULL returns reason null', async () => {
    const router = new FakeRouter();
    const database = makeWebhookFulfillmentDatabase({
      insertRowCount: 0,
      eventRow: {
        ...FAKE_EVENT_ROW,
        processed_at: '2026-05-07T00:00:00.000Z',
      },
      sessionRow: FAKE_SESSION_ROW,
    });
    registerBillingRoutes(router, database, {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: WEBHOOK_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => ({
          id: 'evt_first',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_abc' } },
        }) as unknown as Stripe.Event,
      }),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_first"}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      received: true,
      duplicate: true,
      processed: false,
      reason: null,
    });
  });

  test('always-200 fault: cross-validation failure returns processed false with FulfillmentErrorCode reason', async () => {
    const router = new FakeRouter();
    const database = makeWebhookFulfillmentDatabase({
      insertRowCount: 1,
      eventRow: FAKE_EVENT_ROW,
      sessionRow: { ...FAKE_SESSION_ROW, intent_status: 'expired' },
    });
    registerBillingRoutes(router, database, {
      requireAuthenticatedSession: makeRequireOk(),
      billingConfig: WEBHOOK_BILLING_CONFIG,
      stripeClient: makeStripeClient({
        constructEvent: () => ({
          id: 'evt_first',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_abc' } },
        }) as unknown as Stripe.Event,
      }),
    });
    const ctx = makeContext({
      rawBody: '{"id":"evt_first"}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    });
    await invokeRoute(router.routeFor('/api/billing/webhook/stripe'), ctx);
    assert.equal(ctx.status, 200);
    assert.deepEqual(ctx.body, {
      received: true,
      duplicate: false,
      processed: false,
      reason: 'session_lookup_failed',
    });
  });
});
