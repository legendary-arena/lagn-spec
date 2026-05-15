/**
 * Billing Types — Server Layer (WP-133)
 *
 * Durable contracts for the Stripe checkout-session creation half and
 * the webhook ingestion half of the monetization flow. WP-133 is
 * fulfillment-blind by construction — these types describe the
 * Stripe-facing wire shapes, the env-driven price allowlist, the
 * locked `BillingErrorCode` closed union, and the per-instance
 * `BillingConfig` object constructed once at startup.
 *
 * The `EntitlementKey` closed union is re-imported from
 * `../entitlements/entitlements.types.js` per the WP-132 D-13203
 * lock — never redeclared. The price allowlist parser
 * (`billing.config.ts`) validates every `entitlementKey` value
 * against `ENTITLEMENT_KEYS` at startup; any non-member value fails
 * loudly per the D-13305 startup-fatal posture.
 *
 * `AccountId` and `DatabaseClient` are re-imported from
 * `../identity/identity.types.js` per the WP-052 D-5201 contract.
 *
 * `BillingResult<T>` is declared locally — the identity-layer
 * `Result<T>` is keyed on `IdentityErrorCode` which cannot carry
 * the WP-133 billing codes; this mirrors the WP-102 `ProfileResult<T>`
 * / WP-104 `OwnerProfileResult<T>` / WP-132 `EntitlementsResult<T>`
 * declared-locally precedent verbatim.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`. The `stripe` SDK is confined to this
 * directory by EC-136 §5 grep gate; consumers reach Stripe only
 * through `BillingConfig` + the caller-injected Stripe client.
 *
 * Authority: WP-133 §Scope (In) §B; EC-136 §2 (locked
 * `BillingErrorCode` closed union, 8 members verbatim);
 * D-13301 (module path); D-13302 (migration slot 012);
 * D-13305 (price allowlist source); D-13307 (one-time payment
 * posture); D-13309 (server-derived successUrl/cancelUrl);
 * WP-132 D-13203 (`EntitlementKey` closed union).
 */

import type { EntitlementKey } from '../entitlements/entitlements.types.js';
import type {
  AccountId,
  DatabaseClient,
} from '../identity/identity.types.js';

// why: re-exported so route, logic, and test files can reference the
// inherited aliases through `./billing.types.js` without re-importing
// from `../entitlements/entitlements.types.js` or
// `../identity/identity.types.js` directly, preserving the single
// import boundary documented above.
export type { EntitlementKey, AccountId, DatabaseClient };

/**
 * Wire shape of the request body posted to
 * `POST /api/billing/checkout-session`. Locked at exactly one field
 * per WP-133 §Locked contract values: any extra field — including
 * `successUrl`, `cancelUrl`, or `redirectUri` — returns 400 with
 * `code: 'invalid_request'`. The `successUrl` and `cancelUrl` Stripe
 * Checkout requires are server-derived per D-13309; accepting either
 * from request input would permit a redirect-manipulation attack.
 */
export interface CheckoutSessionRequest {
  readonly priceId: string;
}

/**
 * Wire shape returned by `POST /api/billing/checkout-session` on
 * success. The `checkoutUrl` is Stripe-hosted — the client redirects
 * to this URL to complete payment. The `sessionId` is Stripe's
 * Checkout Session ID (`cs_*`) recorded on the
 * `legendary.stripe_checkout_sessions.session_id` row created in the
 * same handler invocation; future fulfillment correlates back via
 * this value.
 */
export interface CheckoutSessionResponse {
  readonly checkoutUrl: string;
  readonly sessionId: string;
}

/**
 * Closed union of programmatic error codes emitted by billing
 * operations. EC-136 §2 locks this list verbatim — eight members in
 * the order declared here. Adding a member requires a new
 * `DECISIONS.md` entry and a byte-identical update to
 * `BILLING_ERROR_CODES`.
 *
 *   - `'unauthorized'` — auth failure surfaced to the client. The
 *     orchestrator's four 401-mapping codes (`'missing_token'`,
 *     `'invalid_token'`, `'expired_token'`, `'unknown_account'`) all
 *     collapse to this single client-facing value to defeat the
 *     account-existence-probe defense locked in WP-104 D-10403.
 *   - `'session_verifier_not_configured'` — production wiring
 *     incomplete (operator-facing 500). Reachable only when
 *     `NODE_ENV != 'production'` once WP-131 / EC-134 ship.
 *   - `'invalid_price'` — submitted `priceId` is not a member of the
 *     env-configured allowlist; no Stripe API call was made.
 *   - `'invalid_request'` — request body shape mismatch (missing
 *     `priceId`, wrong type, or extra fields).
 *   - `'stripe_error'` — Stripe SDK call failed after the allowlist
 *     gate passed. The full-sentence reason carries the Stripe
 *     `requestId` (per D-13303 changelog citation discipline) for
 *     cross-referencing the Stripe dashboard.
 *   - `'invalid_signature'` — Stripe webhook signature verification
 *     failed (`stripe.webhooks.constructEvent` threw). 400 — the
 *     handler distinguishes probe traffic from tampered traffic.
 *   - `'billing_not_configured'` — `loadBillingConfig` returned
 *     `undefined` (non-production missing-env path); the route
 *     short-circuits with 503 fail-closed.
 *   - `'internal_error'` — operational fault on the database side
 *     (e.g., `recordStripeEvent` INSERT failure). Surfaced as
 *     `{ error: 'internal_error' }` per WP-115 D-11802 = (C); never
 *     mixed with the auth/config envelope.
 */
export type BillingErrorCode =
  | 'unauthorized'
  | 'session_verifier_not_configured'
  | 'invalid_price'
  | 'invalid_request'
  | 'stripe_error'
  | 'invalid_signature'
  | 'billing_not_configured'
  | 'internal_error'
  | 'history_lookup_failed';

/**
 * Canonical readonly array mirroring the `BillingErrorCode` union.
 * Adding a value requires updating both the union and this array
 * in the same change (see `.claude/rules/code-style.md §Drift
 * Detection`).
 */
export const BILLING_ERROR_CODES: readonly BillingErrorCode[] = [
  'unauthorized',
  'session_verifier_not_configured',
  'invalid_price',
  'invalid_request',
  'stripe_error',
  'invalid_signature',
  'billing_not_configured',
  'internal_error',
  'history_lookup_failed',
] as const;

/**
 * Discriminated-union result type for fallible billing operations.
 * Mirrors the WP-052 `Result<T>` shape with the billing-specific
 * error union. Declared locally per the WP-102 / WP-104 / WP-132
 * precedent — the identity-layer `Result<T>` is keyed on
 * `IdentityErrorCode` (a four-value union) and cannot carry the
 * WP-133 billing codes.
 */
export type BillingResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: BillingErrorCode };

/**
 * One entry in the env-configured price allowlist. The
 * `STRIPE_PRICE_ALLOWLIST` env var is parsed at startup into a
 * `ReadonlyMap<string, EntitlementKey>` keyed by `priceId`; this
 * type names the per-entry pair for the parser's intermediate
 * representation and for test fixtures.
 */
export interface PriceAllowlistEntry {
  readonly priceId: string;
  readonly entitlementKey: EntitlementKey;
}

/**
 * Per-instance billing configuration constructed once at startup
 * by `loadBillingConfig`. Frozen via `Object.freeze` before return
 * so the wrapper's three properties cannot be reassigned mid-request
 * (per the WP-126 startup-construction precedent + the D-13305
 * pricing-policy-changes-only-via-deploy lock).
 *
 * The `priceAllowlist` is typed as `ReadonlyMap<string, EntitlementKey>`
 * so accidental `.set()` calls fail at compile time. Runtime
 * mutation via an explicit cast (`(config.priceAllowlist as Map<string,
 * EntitlementKey>).set(...)`) is theoretically possible but loud in
 * code review.
 */
export interface BillingConfig {
  readonly stripeSecretKey: string;
  readonly webhookSecret: string;
  readonly priceAllowlist: ReadonlyMap<string, EntitlementKey>;
  readonly publicBaseUrl: string;
}

/**
 * Server-side persistence shape of one row in
 * `legendary.stripe_events`. Field-name mapping to the underlying
 * column:
 *   - `id`            ← `id`
 *   - `eventId`       ← `event_id`
 *   - `eventType`     ← `event_type`
 *   - `payload`       ← `payload` (full Stripe event envelope, not
 *     `event.data.object` alone — see migration 012's `payload`
 *     comment for the rationale)
 *   - `receivedAt`    ← `received_at` (ISO-8601 UTC string)
 *   - `processedAt`   ← `processed_at` (always `null` at WP-133
 *     close — WP-134 owns the writer)
 *   - `processError`  ← `process_error` (always `null` at WP-133
 *     close — WP-134 owns the writer)
 */
/**
 * One row from `legendary.stripe_checkout_sessions` projected for the
 * billing history read surface (`GET /api/me/billing/history`).
 */
export interface BillingHistoryEntry {
  readonly entitlementKey: string;
  readonly intentStatus: 'open' | 'completed' | 'expired' | 'canceled';
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/**
 * Wire shape returned by `GET /api/me/billing/history` on success.
 */
export interface BillingHistoryResponse {
  readonly history: readonly BillingHistoryEntry[];
}

export interface StripeEventRecord {
  readonly id: bigint;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly processedAt: string | null;
  readonly processError: string | null;
}
