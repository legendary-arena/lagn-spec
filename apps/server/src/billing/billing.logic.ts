/**
 * Billing Logic — Server Layer (WP-133)
 *
 * Two exported library functions:
 *
 *   1. `createCheckoutSession` — validates `priceId` against the
 *      env-configured allowlist BEFORE any Stripe SDK call (per
 *      EC-136 §3 allowlist-before-Stripe guardrail), creates a
 *      Stripe Checkout Session via the injected `stripeClient`, and
 *      INSERTs a row into `legendary.stripe_checkout_sessions` with
 *      `intent_status = 'open'`. The handler layer constructs
 *      `successUrl` / `cancelUrl` from `BillingConfig.publicBaseUrl`
 *      (per D-13309) and passes them through; this function never
 *      reads request input directly.
 *
 *   2. `recordStripeEvent` — INSERTs into `legendary.stripe_events`
 *      with the locked conflict-do-nothing idempotency clause (per
 *      D-13306). Stripe's at-least-once retry contract collapses
 *      duplicate deliveries to a single row at the database layer; the
 *      function reports `inserted: false` on duplicate so the webhook
 *      handler can surface `{ received: true, duplicate: true }`.
 *      `process_error` is always written as `NULL` — WP-134 owns that
 *      column.
 *
 * Layer-boundary contract: this module imports only `stripe` (the
 * provider SDK), `./billing.types.js`, and the identity-layer
 * `DatabaseClient`. The `stripe` SDK is confined to
 * `apps/server/src/billing/` per the EC-136 §5 grep gate. Zero
 * entitlement INSERTs and zero `intent_status` transitions appear
 * anywhere in this file — both invariants are EC-136 §3 guardrails
 * enforced by `Select-String` at session close.
 *
 * Authority: WP-133 §Scope (In) §D; EC-136 §1 (locked AC count);
 * EC-136 §3 (allowlist-before-Stripe + no-entitlement-INSERT +
 * no-intent_status-transition guardrails); D-13301 (module path);
 * D-13302 (FK form Option A — INSERT writes account_id text);
 * D-13306 (event_id UNIQUE idempotency); D-13307 (mode: 'payment');
 * D-13308 (defer Customer creation; pass customer_email only);
 * D-13309 (server-derived successUrl/cancelUrl).
 */

import Stripe from 'stripe';

import type {
  AccountId,
  BillingConfig,
  BillingResult,
  CheckoutSessionResponse,
  DatabaseClient,
} from './billing.types.js';

/**
 * Argument record for `createCheckoutSession`. The `successUrl` and
 * `cancelUrl` are constructed at the route layer from
 * `billingConfig.publicBaseUrl` (per D-13309) and passed through; this
 * function never reads request input. The `customerEmail` is
 * resolved from the validated `accountId` at the route layer (a
 * future Customer Portal WP introduces eager Customer creation per
 * D-13308 deferral).
 */
export interface CreateCheckoutSessionArgs {
  readonly accountId: AccountId;
  readonly priceId: string;
  readonly customerEmail: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly billingConfig: BillingConfig;
  readonly database: DatabaseClient;
  readonly stripeClient: Stripe;
}

/**
 * Argument record for `recordStripeEvent`. The `event` is the
 * verified Stripe event returned by
 * `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`;
 * the route layer is the sole caller and has already verified the
 * signature by the time this function runs.
 */
export interface RecordStripeEventArgs {
  readonly event: Stripe.Event;
  readonly database: DatabaseClient;
}

/**
 * Result payload returned by `recordStripeEvent` on success. The
 * `inserted: false` branch fires when the conflict-do-nothing
 * idempotency clause collapses a duplicate Stripe retry to a no-op; the
 * webhook handler surfaces `duplicate: !inserted` to Stripe.
 */
export interface RecordStripeEventResult {
  readonly inserted: boolean;
}

/**
 * Creates a Stripe Checkout Session for the supplied `accountId` +
 * `priceId` pair after gating on the allowlist. Steps in order:
 *
 *   1. Allowlist gate: if `priceId` is not a member of
 *      `billingConfig.priceAllowlist`, return
 *      `Result.fail({ code: 'invalid_price' })` WITHOUT calling
 *      Stripe. Tests inject a fake `stripeClient` that throws on use
 *      to assert this invariant.
 *   2. Stripe call: `stripeClient.checkout.sessions.create({ ... })`
 *      with `mode: 'payment'` (per D-13307), `client_reference_id =
 *      accountId`, `customer_email = customerEmail`,
 *      `metadata = { accountId, entitlementKey }`, and the
 *      server-derived `success_url` / `cancel_url`.
 *   3. INSERT into `legendary.stripe_checkout_sessions` with
 *      `intent_status = 'open'` (the ONLY value WP-133 ever writes;
 *      WP-134 owns transitions).
 *   4. Return `Result.ok({ checkoutUrl, sessionId })`.
 *
 * The function never throws — every failure path returns a typed
 * `BillingResult.fail`.
 */
export async function createCheckoutSession(
  args: CreateCheckoutSessionArgs,
): Promise<BillingResult<CheckoutSessionResponse>> {
  // why: allowlist gate fires BEFORE any stripeClient.* call (EC-136
  // §3 invariant). A client submitting an arbitrary priceId gets 400
  // 'invalid_price' with NO Stripe API call made. Tests inject a fake
  // Stripe client that throws on use to assert this invariant —
  // moving this check below the Stripe call would surface as a thrown
  // error in test output.
  const entitlementKey = args.billingConfig.priceAllowlist.get(args.priceId);
  if (entitlementKey === undefined) {
    return {
      ok: false,
      reason:
        'Requested price ID is not a member of the configured STRIPE_PRICE_ALLOWLIST; no Stripe call was made. Verify the priceId against the deploy-time allowlist configuration.',
      code: 'invalid_price',
    };
  }

  let session: Stripe.Checkout.Session;
  try {
    // why: D-13309 — successUrl and cancelUrl are constructed by the
    // ROUTE layer from billingConfig.publicBaseUrl + fixed paths and
    // passed in here. The Stripe Checkout Session URL templating
    // token {CHECKOUT_SESSION_ID} is preserved literally so Stripe
    // expands it server-side before redirecting — the URL value the
    // route layer constructs has the literal token in it. Accepting
    // either URL from req.body would permit a redirect-manipulation
    // attack (post-payment phishing).
    session = await args.stripeClient.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: args.priceId, quantity: 1 }],
      client_reference_id: args.accountId,
      customer_email: args.customerEmail,
      metadata: {
        accountId: args.accountId,
        entitlementKey,
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });
  } catch (error) {
    const stripeMessage =
      error instanceof Error ? error.message : 'unknown Stripe error';
    return {
      ok: false,
      reason: `Stripe Checkout Session creation failed for priceId ${args.priceId}; the Stripe SDK call rejected with: ${stripeMessage}.`,
      code: 'stripe_error',
    };
  }

  if (session.url === null || typeof session.url !== 'string') {
    return {
      ok: false,
      reason:
        'Stripe Checkout Session was created but the returned object did not carry a checkoutUrl; this should not occur for mode: payment sessions and indicates a Stripe SDK contract change.',
      code: 'stripe_error',
    };
  }

  try {
    await args.database.query(
      `INSERT INTO legendary.stripe_checkout_sessions
         (session_id, account_id, price_id, entitlement_key, intent_status)
       VALUES ($1, $2, $3, $4, 'open')`,
      [session.id, args.accountId, args.priceId, entitlementKey],
    );
  } catch {
    return {
      ok: false,
      reason:
        'Stripe Checkout Session was created but the legendary.stripe_checkout_sessions INSERT failed; check database connectivity and the migration 012 schema integrity.',
      code: 'internal_error',
    };
  }

  return {
    ok: true,
    value: {
      checkoutUrl: session.url,
      sessionId: session.id,
    },
  };
}

/**
 * Records a verified Stripe event in `legendary.stripe_events` with
 * conflict-do-nothing idempotency semantics (per D-13306). The
 * full event envelope is serialized via `JSON.stringify(event)` and
 * stored verbatim in the `payload jsonb` column — never just
 * `event.data.object` (the outer envelope's `api_version` is the
 * forensic signal for Stripe-side API version drift).
 *
 * `inserted: true` indicates a first-delivery record; `inserted:
 * false` indicates a Stripe retry hitting the UNIQUE constraint and
 * collapsing to a no-op via the conflict-do-nothing clause. WP-133's
 * webhook handler returns 200 in either case (Stripe's at-least-once
 * delivery contract makes idempotent ingestion the correct response).
 *
 * `process_error` is always written as `NULL` — WP-134 is the sole
 * writer of non-NULL values in that column.
 */
export async function recordStripeEvent(
  args: RecordStripeEventArgs,
): Promise<BillingResult<RecordStripeEventResult>> {
  // why: full envelope storage (per WP-133 §Locked contract values
  // §stripe_events.payload). JSON.stringify(event) preserves
  // api_version, type, data.object, data.previous_attributes,
  // livemode, pending_webhooks, request — all of which WP-134's
  // fulfillment parser may need. Storing event.data.object alone
  // would lose api_version (the drift-detection signal).
  const payloadJson = JSON.stringify(args.event);

  let insertResult: { rowCount: number | null };
  try {
    insertResult = await args.database.query(
      `INSERT INTO legendary.stripe_events
         (event_id, event_type, payload, process_error)
       VALUES ($1, $2, $3::jsonb, NULL)
       ON CONFLICT (event_id) DO NOTHING`,
      [args.event.id, args.event.type, payloadJson],
    );
  } catch {
    return {
      ok: false,
      reason:
        'recordStripeEvent failed at the legendary.stripe_events INSERT; check database connectivity and the migration 012 schema integrity.',
      code: 'internal_error',
    };
  }

  // why: the conflict-do-nothing INSERT returns rowCount=0 on a
  // duplicate-event retry; rowCount=1 on first delivery. Stripe
  // retries the same event_id on 5xx responses, so this is the
  // normal-traffic discriminant rather than an error path.
  const inserted =
    insertResult.rowCount !== null && insertResult.rowCount > 0;

  return {
    ok: true,
    value: { inserted },
  };
}
