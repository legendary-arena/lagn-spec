/**
 * Billing Config Loader — Server Layer (WP-133)
 *
 * Reads the four billing-related env vars at startup, parses the
 * comma-separated `STRIPE_PRICE_ALLOWLIST` into a typed
 * `ReadonlyMap<string, EntitlementKey>`, and returns a frozen
 * `BillingConfig` wrapper. Mirrors the WP-126 / WP-131 startup
 * env-var construction pattern: production-mode missing-env throws
 * (server.mjs catches and exits 1); non-production-mode missing-env
 * returns `undefined` so the routes return 503 fail-closed without
 * blocking local dev.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/(game-engine|registry|preplan)`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `stripe` SDK is NOT imported here —
 * `BillingConfig` is provider-agnostic data; the Stripe client is
 * constructed in `server.mjs` from `BillingConfig.stripeSecretKey`.
 *
 * The `STRIPE_PRICE_ALLOWLIST` parser validates every
 * `entitlementKey` against `ENTITLEMENT_KEYS` (imported from WP-132's
 * `entitlements.types.ts`); a non-member value throws a full-sentence
 * diagnostic at startup. This is the gate that prevents a misconfigured
 * env var from grant-routing payments to an unrecognized entitlement.
 *
 * Authority: WP-133 §Scope (In) §C; EC-136 §2 (Object.freeze + four
 * branches required); D-13301 (module path); D-13303 (Stripe SDK
 * version pin lives at the call site in server.mjs); D-13305
 * (env-var allowlist source); D-13309 (env-derived publicBaseUrl);
 * WP-126 D-12601..D-12604 (startup env-var precedent); WP-131 D-13101
 * (production-fatal posture).
 */

import Stripe from 'stripe';

import type {
  BillingConfig,
  EntitlementKey,
} from './billing.types.js';
import { ENTITLEMENT_KEYS } from '../entitlements/entitlements.types.js';

// why: D-13303 — pinned Stripe API date-stamped string. Stripe-side
// API version drift is the security/correctness invariant; an
// `apiVersion` bump is a coordinated WP-133 + WP-134 review (the
// fulfillment parser reads `payload.data.object.payment_status`,
// `.client_reference_id`, `.metadata`, `.id`), never a routine
// dependency update. Changelog: https://docs.stripe.com/upgrades.
const STRIPE_API_VERSION = '2025-09-30.clover';

const ENTITLEMENT_KEY_SET: ReadonlySet<EntitlementKey> = new Set(
  ENTITLEMENT_KEYS,
);

function isEntitlementKey(value: string): value is EntitlementKey {
  return ENTITLEMENT_KEY_SET.has(value as EntitlementKey);
}

/**
 * Parses the comma-separated `STRIPE_PRICE_ALLOWLIST` env var into a
 * `ReadonlyMap<string, EntitlementKey>`. Format:
 *   `priceId1:entitlementKey1,priceId2:entitlementKey2,...`
 *
 * Whitespace around individual entries is trimmed. Empty entries
 * (`,,`) are skipped silently — a trailing comma is a common
 * configuration pattern and rejecting it would surprise operators.
 * Each `entitlementKey` value is validated against
 * `ENTITLEMENT_KEYS`; non-member values throw a full-sentence
 * diagnostic that names the offending value so the operator can
 * find and fix it without parsing prose.
 *
 * Returns the parsed map directly (no separate "frozen Map"
 * abstraction). The compile-time `ReadonlyMap` typing prevents
 * `.set()` calls in TypeScript; runtime mutation via an explicit
 * cast (`(map as Map<...>).set(...)`) would be loud in code review.
 */
export function parsePriceAllowlist(
  raw: string,
): ReadonlyMap<string, EntitlementKey> {
  const allowlist = new Map<string, EntitlementKey>();
  const rawEntries = raw.split(',');
  for (const rawEntry of rawEntries) {
    const trimmedEntry = rawEntry.trim();
    if (trimmedEntry.length === 0) {
      continue;
    }
    const colonIndex = trimmedEntry.indexOf(':');
    if (colonIndex <= 0 || colonIndex === trimmedEntry.length - 1) {
      throw new Error(
        `STRIPE_PRICE_ALLOWLIST entry '${trimmedEntry}' is not in the required '<priceId>:<entitlementKey>' shape; check the allowlist configuration in the Render dashboard or .env file.`,
      );
    }
    const priceId = trimmedEntry.slice(0, colonIndex).trim();
    const entitlementKey = trimmedEntry.slice(colonIndex + 1).trim();
    if (priceId.length === 0) {
      throw new Error(
        `STRIPE_PRICE_ALLOWLIST entry '${trimmedEntry}' has an empty priceId; check the allowlist configuration in the Render dashboard or .env file.`,
      );
    }
    if (isEntitlementKey(entitlementKey) === false) {
      throw new Error(
        `STRIPE_PRICE_ALLOWLIST entry '${entitlementKey}' is not a member of the ENTITLEMENT_KEYS closed set; check the allowlist configuration against apps/server/src/entitlements/entitlements.types.ts.`,
      );
    }
    allowlist.set(priceId, entitlementKey);
  }
  return allowlist;
}

/**
 * Constructs the per-instance `BillingConfig` from the supplied
 * `process.env`-shaped record. Branches on `NODE_ENV`:
 *
 *   - Production + complete env: parses allowlist, freezes wrapper,
 *     returns the config. A bad allowlist value throws — the caller
 *     (`server.mjs`) propagates and `process.exit(1)`.
 *   - Production + incomplete env: throws a full-sentence diagnostic
 *     listing the missing env vars by name so operators can fix the
 *     deploy without parsing prose.
 *   - Non-production + complete env: identical to the production
 *     complete-env path.
 *   - Non-production + incomplete env: returns `undefined` so the
 *     routes fail-closed with 503 `'billing_not_configured'`,
 *     preserving the WP-126 / WP-131 local-dev ergonomics.
 *
 * The four required env vars are: `STRIPE_SECRET_KEY`,
 * `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ALLOWLIST`, and
 * `PUBLIC_BASE_URL`. All four must be present and non-empty for a
 * `BillingConfig` to be returned in either env mode.
 */
export function loadBillingConfig(
  env: NodeJS.ProcessEnv,
): BillingConfig | undefined {
  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const priceAllowlistRaw = env.STRIPE_PRICE_ALLOWLIST;
  const publicBaseUrl = env.PUBLIC_BASE_URL;

  const envComplete =
    typeof stripeSecretKey === 'string' &&
    stripeSecretKey.length > 0 &&
    typeof webhookSecret === 'string' &&
    webhookSecret.length > 0 &&
    typeof priceAllowlistRaw === 'string' &&
    priceAllowlistRaw.length > 0 &&
    typeof publicBaseUrl === 'string' &&
    publicBaseUrl.length > 0;

  if (envComplete === false) {
    // why: WP-126 / WP-131 startup-guard precedent — production
    // missing-env is a fatal misconfiguration; the throw propagates
    // to the caller (server.mjs) which logs the diagnostic and calls
    // process.exit(1). Non-production preserves local-dev ergonomics
    // by returning undefined; the routes surface 503
    // 'billing_not_configured' for operators iterating without
    // Stripe configured. Required env vars: STRIPE_SECRET_KEY,
    // STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ALLOWLIST, PUBLIC_BASE_URL.
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Billing configuration is incomplete. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ALLOWLIST, and PUBLIC_BASE_URL in the Render dashboard before deploying. Production cannot start without them.',
      );
    }
    return undefined;
  }

  const priceAllowlist = parsePriceAllowlist(priceAllowlistRaw);

  // why: pricing policy changes only via deploy + DECISIONS.md entry
  // (per D-13305 startup-fatal allowlist lock); freeze the
  // BillingConfig wrapper so a future code path cannot reassign
  // priceAllowlist mid-request. Combined with ReadonlyMap typing,
  // this catches both reassignment bugs (runtime) and accidental
  // .set() calls (compile time).
  return Object.freeze({
    stripeSecretKey,
    webhookSecret,
    priceAllowlist,
    publicBaseUrl,
  });
}

/**
 * Constructs the Stripe SDK client once at startup from a
 * `BillingConfig`. The `apiVersion` parameter is pinned to the
 * date-stamped string locked under D-13303; an `apiVersion` bump
 * is a coordinated WP-133 + WP-134 review (the fulfillment parser
 * reads `payload.data.object` fields whose shape may change with
 * the API version) per the EC-136 §2 `apiVersion` lock and the
 * D-13303 changelog citation discipline.
 *
 * Exported from this module (rather than constructed at the call
 * site in `server.mjs`) so the `from 'stripe'` import stays inside
 * `apps/server/src/billing/` per the EC-136 §3 layer-boundary
 * guardrail and the §5 grep gate.
 */
export function createStripeClient(billingConfig: BillingConfig): Stripe {
  return new Stripe(billingConfig.stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
}
