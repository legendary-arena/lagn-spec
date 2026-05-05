/**
 * Tests for `createCheckoutSession` and `recordStripeEvent` (WP-133 /
 * EC-136). Logic-pure suite: fakes are injected at construction time;
 * no live database, no live Stripe, no network. Required cases per
 * EC-136 §1 billing.logic.test.ts:
 *
 *   - `createCheckoutSession`:
 *     * invalid `priceId` → `Result.fail('invalid_price')` AND the
 *       fake Stripe client is NEVER invoked (allowlist-before-Stripe
 *       guardrail per EC-136 §3).
 *     * valid `priceId` → Stripe client invoked with correct args;
 *       DB row inserted; `Result.ok({ checkoutUrl, sessionId })`.
 *     * Stripe SDK rejection → `Result.fail('stripe_error')` (DB
 *       INSERT not attempted).
 *
 *   - `recordStripeEvent`:
 *     * first call with a fresh `event.id` → `inserted: true`.
 *     * duplicate `event.id` (rowCount = 0 from ON CONFLICT DO NOTHING)
 *       → `inserted: false`.
 *
 * Authority: WP-133 §Scope (In) §F; EC-136 §1 (logic 4-case lock);
 * EC-136 §3 (allowlist-before-Stripe + ON CONFLICT DO NOTHING
 * guardrails).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type Stripe from 'stripe';

import {
  createCheckoutSession,
  recordStripeEvent,
} from './billing.logic.js';
import type {
  AccountId,
  BillingConfig,
  DatabaseClient,
  EntitlementKey,
} from './billing.types.js';

const FAKE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001' as AccountId;

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

interface FakeQueryResult {
  rowCount: number | null;
  rows: ReadonlyArray<Record<string, unknown>>;
}

function makeRecordingDatabase(
  rowCountForInsert: number | null,
): {
  database: DatabaseClient;
  calls: Array<{ sql: string; params: ReadonlyArray<unknown> }>;
} {
  const calls: Array<{ sql: string; params: ReadonlyArray<unknown> }> = [];
  const database = {
    query: async (
      sql: string,
      params: ReadonlyArray<unknown>,
    ): Promise<FakeQueryResult> => {
      calls.push({ sql, params });
      return { rowCount: rowCountForInsert, rows: [] };
    },
  } as unknown as DatabaseClient;
  return { database, calls };
}

function makeThrowingDatabase(): DatabaseClient {
  return {
    query: async () => {
      throw new Error(
        'Test database client query() invoked when the test expected the call site to reject earlier.',
      );
    },
  } as unknown as DatabaseClient;
}

interface FakeStripeRecording {
  stripeClient: Stripe;
  calls: Array<{ args: Stripe.Checkout.SessionCreateParams }>;
}

function makeRecordingStripeClient(
  sessionResponse: Pick<Stripe.Checkout.Session, 'id' | 'url'>,
): FakeStripeRecording {
  const calls: Array<{ args: Stripe.Checkout.SessionCreateParams }> = [];
  const stripeClient = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          calls.push({ args: params });
          return sessionResponse as Stripe.Checkout.Session;
        },
      },
    },
  } as unknown as Stripe;
  return { stripeClient, calls };
}

function makeThrowingStripeClient(): Stripe {
  return {
    checkout: {
      sessions: {
        create: async () => {
          throw new Error(
            'Test Stripe client checkout.sessions.create invoked when the test expected the allowlist gate to reject the call.',
          );
        },
      },
    },
  } as unknown as Stripe;
}

function makeRejectingStripeClient(rejectionMessage: string): Stripe {
  return {
    checkout: {
      sessions: {
        create: async () => {
          throw new Error(rejectionMessage);
        },
      },
    },
  } as unknown as Stripe;
}

describe('createCheckoutSession (WP-133)', () => {
  test('invalid priceId fails with invalid_price WITHOUT calling Stripe', async () => {
    const billingConfig = makeBillingConfig(
      makeAllowlist([
        ['price_supporter_2026', 'supporter_tier_basic_2026'],
      ]),
    );
    const stripeClient = makeThrowingStripeClient();
    const database = makeThrowingDatabase();
    const result = await createCheckoutSession({
      accountId: FAKE_ACCOUNT_ID,
      priceId: 'price_unknown_to_allowlist',
      customerEmail: 'test@example.com',
      successUrl: 'https://app.legendary-arena.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app.legendary-arena.com/billing/cancel',
      billingConfig,
      database,
      stripeClient,
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'invalid_price');
      assert.match(result.reason, /STRIPE_PRICE_ALLOWLIST/);
    }
  });

  test('valid priceId invokes Stripe with correct args + inserts DB row', async () => {
    const billingConfig = makeBillingConfig(
      makeAllowlist([
        ['price_supporter_2026', 'supporter_tier_basic_2026'],
      ]),
    );
    const recordingStripe = makeRecordingStripeClient({
      id: 'cs_test_abc123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_abc123',
    });
    const recordingDatabase = makeRecordingDatabase(1);

    const result = await createCheckoutSession({
      accountId: FAKE_ACCOUNT_ID,
      priceId: 'price_supporter_2026',
      customerEmail: 'test@example.com',
      successUrl: 'https://app.legendary-arena.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app.legendary-arena.com/billing/cancel',
      billingConfig,
      database: recordingDatabase.database,
      stripeClient: recordingStripe.stripeClient,
    });

    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.sessionId, 'cs_test_abc123');
      assert.equal(
        result.value.checkoutUrl,
        'https://checkout.stripe.com/c/pay/cs_test_abc123',
      );
    }

    assert.equal(recordingStripe.calls.length, 1);
    const stripeArgs = recordingStripe.calls[0].args;
    assert.equal(stripeArgs.mode, 'payment');
    assert.equal(stripeArgs.client_reference_id, FAKE_ACCOUNT_ID);
    assert.equal(stripeArgs.customer_email, 'test@example.com');
    assert.deepEqual(stripeArgs.line_items, [
      { price: 'price_supporter_2026', quantity: 1 },
    ]);
    assert.deepEqual(stripeArgs.metadata, {
      accountId: FAKE_ACCOUNT_ID,
      entitlementKey: 'supporter_tier_basic_2026',
    });
    assert.equal(
      stripeArgs.success_url,
      'https://app.legendary-arena.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
    );
    assert.equal(
      stripeArgs.cancel_url,
      'https://app.legendary-arena.com/billing/cancel',
    );

    assert.equal(recordingDatabase.calls.length, 1);
    const insertCall = recordingDatabase.calls[0];
    assert.match(insertCall.sql, /INSERT INTO legendary\.stripe_checkout_sessions/);
    assert.match(insertCall.sql, /'open'/);
    assert.deepEqual(insertCall.params, [
      'cs_test_abc123',
      FAKE_ACCOUNT_ID,
      'price_supporter_2026',
      'supporter_tier_basic_2026',
    ]);
  });

  test('Stripe SDK rejection maps to stripe_error', async () => {
    const billingConfig = makeBillingConfig(
      makeAllowlist([
        ['price_supporter_2026', 'supporter_tier_basic_2026'],
      ]),
    );
    const stripeClient = makeRejectingStripeClient('rate_limited');
    const database = makeThrowingDatabase();
    const result = await createCheckoutSession({
      accountId: FAKE_ACCOUNT_ID,
      priceId: 'price_supporter_2026',
      customerEmail: 'test@example.com',
      successUrl: 'https://app.legendary-arena.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app.legendary-arena.com/billing/cancel',
      billingConfig,
      database,
      stripeClient,
    });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'stripe_error');
      assert.match(result.reason, /rate_limited/);
    }
  });
});

describe('recordStripeEvent (WP-133)', () => {
  test('first delivery returns inserted: true', async () => {
    const recordingDatabase = makeRecordingDatabase(1);
    const fakeEvent = {
      id: 'evt_test_first',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_abc' } },
      api_version: '2025-09-30.clover',
    } as unknown as Stripe.Event;
    const result = await recordStripeEvent({
      event: fakeEvent,
      database: recordingDatabase.database,
    });
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.inserted, true);
    }
    assert.equal(recordingDatabase.calls.length, 1);
    const insertCall = recordingDatabase.calls[0];
    assert.match(insertCall.sql, /INSERT INTO legendary\.stripe_events/);
    assert.match(insertCall.sql, /ON CONFLICT \(event_id\) DO NOTHING/);
    assert.equal(insertCall.params[0], 'evt_test_first');
    assert.equal(insertCall.params[1], 'checkout.session.completed');
    // why: full envelope preserved — api_version round-trips through
    // JSON.stringify, asserting the WP-133 verbatim-storage contract.
    const storedPayload = JSON.parse(insertCall.params[2] as string);
    assert.equal(storedPayload.api_version, '2025-09-30.clover');
    assert.equal(storedPayload.id, 'evt_test_first');
  });

  test('duplicate event_id returns inserted: false (ON CONFLICT DO NOTHING no-op)', async () => {
    const recordingDatabase = makeRecordingDatabase(0);
    const fakeEvent = {
      id: 'evt_test_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_abc' } },
    } as unknown as Stripe.Event;
    const result = await recordStripeEvent({
      event: fakeEvent,
      database: recordingDatabase.database,
    });
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.inserted, false);
    }
  });

  test('database error maps to internal_error', async () => {
    const database = {
      query: async () => {
        throw new Error('connection refused');
      },
    } as unknown as DatabaseClient;
    const fakeEvent = {
      id: 'evt_test_db_fault',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_abc' } },
    } as unknown as Stripe.Event;
    const result = await recordStripeEvent({ event: fakeEvent, database });
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'internal_error');
    }
  });
});
