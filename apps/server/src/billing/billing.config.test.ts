/**
 * Tests for `loadBillingConfig` and `parsePriceAllowlist` (WP-133 /
 * EC-136). Logic-pure suite: no live database, no live Stripe, no
 * network. Covers the four required branches per EC-136 §1
 * billing.config.test.ts:
 *
 *   1. Production-mode missing-env → throws with full-sentence
 *      diagnostic naming the missing vars.
 *   2. Non-production-mode missing-env → returns `undefined`.
 *   3. Valid env → returns frozen `BillingConfig` with parsed
 *      `ReadonlyMap<string, EntitlementKey>`.
 *   4. Allowlist entry whose `entitlementKey` is not a member of
 *      `ENTITLEMENT_KEYS` → throws.
 *
 * Drift-detection tests (5-6) assert `BILLING_ERROR_CODES` matches
 * the `BillingErrorCode` union by forward and backward inclusion.
 *
 * Authority: WP-133 §Scope (In) §C + §F; EC-136 §1 (4-branch lock);
 * D-13305 (startup-fatal allowlist).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadBillingConfig,
  parsePriceAllowlist,
} from './billing.config.js';
import {
  BILLING_ERROR_CODES,
  type BillingErrorCode,
} from './billing.types.js';

function envFrom(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

const VALID_ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_ALLOWLIST:
    'price_supporter_2026:supporter_tier_basic_2026,price_playmat_classic:cosmetic_playmat_classic',
  PUBLIC_BASE_URL: 'https://app.legendary-arena.com',
};

describe('loadBillingConfig (WP-133)', () => {
  test('production + missing env throws full-sentence diagnostic', () => {
    const env = envFrom({ NODE_ENV: 'production' });
    assert.throws(
      () => loadBillingConfig(env),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Billing configuration is incomplete/);
        assert.match(error.message, /STRIPE_SECRET_KEY/);
        assert.match(error.message, /STRIPE_WEBHOOK_SECRET/);
        assert.match(error.message, /STRIPE_PRICE_ALLOWLIST/);
        assert.match(error.message, /PUBLIC_BASE_URL/);
        return true;
      },
    );
  });

  test('non-production + missing env returns undefined', () => {
    const env = envFrom({ NODE_ENV: 'development' });
    const config = loadBillingConfig(env);
    assert.equal(config, undefined);
  });

  test('valid env parses into frozen BillingConfig with allowlist map', () => {
    const env = envFrom({ NODE_ENV: 'production', ...VALID_ENV });
    const config = loadBillingConfig(env);
    assert.ok(config !== undefined, 'expected a BillingConfig');
    assert.equal(config.stripeSecretKey, 'sk_test_dummy');
    assert.equal(config.webhookSecret, 'whsec_dummy');
    assert.equal(config.publicBaseUrl, 'https://app.legendary-arena.com');
    assert.equal(
      config.priceAllowlist.get('price_supporter_2026'),
      'supporter_tier_basic_2026',
    );
    assert.equal(
      config.priceAllowlist.get('price_playmat_classic'),
      'cosmetic_playmat_classic',
    );
    assert.equal(config.priceAllowlist.size, 2);
    // why: Object.freeze prevents wrapper-property reassignment per
    // D-13305 startup-fatal allowlist lock + EC-136 §4.
    assert.equal(Object.isFrozen(config), true);
  });

  test('allowlist entry with non-member entitlementKey throws', () => {
    const env = envFrom({
      NODE_ENV: 'production',
      ...VALID_ENV,
      STRIPE_PRICE_ALLOWLIST:
        'price_supporter_2026:supporter_tier_basic_2026,price_bad:not_a_real_key',
    });
    assert.throws(
      () => loadBillingConfig(env),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /not_a_real_key/);
        assert.match(error.message, /ENTITLEMENT_KEYS/);
        return true;
      },
    );
  });

  test('non-production + valid env still returns a frozen BillingConfig', () => {
    const env = envFrom({ NODE_ENV: 'development', ...VALID_ENV });
    const config = loadBillingConfig(env);
    assert.ok(config !== undefined);
    assert.equal(Object.isFrozen(config), true);
  });
});

describe('parsePriceAllowlist (WP-133)', () => {
  test('parses two-entry allowlist', () => {
    const allowlist = parsePriceAllowlist(
      'price_one:supporter_tier_basic_2026,price_two:cosmetic_playmat_comic',
    );
    assert.equal(allowlist.size, 2);
    assert.equal(allowlist.get('price_one'), 'supporter_tier_basic_2026');
    assert.equal(allowlist.get('price_two'), 'cosmetic_playmat_comic');
  });

  test('skips empty trailing-comma entries', () => {
    const allowlist = parsePriceAllowlist(
      'price_one:supporter_tier_basic_2026,',
    );
    assert.equal(allowlist.size, 1);
  });

  test('rejects entry missing colon separator', () => {
    assert.throws(
      () => parsePriceAllowlist('price_one_supporter_tier_basic_2026'),
      /required '<priceId>:<entitlementKey>' shape/,
    );
  });

  test('rejects entry with empty priceId', () => {
    assert.throws(
      () => parsePriceAllowlist(':supporter_tier_basic_2026'),
      /not in the required '<priceId>:<entitlementKey>' shape/,
    );
  });

  test('rejects entry with empty entitlementKey', () => {
    assert.throws(
      () => parsePriceAllowlist('price_one:'),
      /not in the required '<priceId>:<entitlementKey>' shape/,
    );
  });
});

describe('BILLING_ERROR_CODES drift detection (WP-133)', () => {
  test('every union member appears in the canonical array', () => {
    const expected: BillingErrorCode[] = [
      'unauthorized',
      'session_verifier_not_configured',
      'invalid_price',
      'invalid_request',
      'stripe_error',
      'invalid_signature',
      'billing_not_configured',
      'internal_error',
      'history_lookup_failed',
    ];
    for (const code of expected) {
      assert.ok(
        BILLING_ERROR_CODES.includes(code),
        `expected BILLING_ERROR_CODES to include '${code}'`,
      );
    }
    assert.equal(BILLING_ERROR_CODES.length, expected.length);
  });

  test('canonical array length matches the locked 9-member count', () => {
    assert.equal(BILLING_ERROR_CODES.length, 9);
  });
});
