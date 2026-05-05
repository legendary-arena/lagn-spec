/**
 * Tests for the entitlements logic helper (WP-132 / EC-135).
 *
 * Eight tests inside one describe block. Pure tests (drift assertion,
 * fake-DB fault paths) always run; DB-required tests use node:test's
 * options-based non-silent skip when `process.env.TEST_DATABASE_URL`
 * is unset (locked WP-052 §3.1 post-mortem pattern; mirrors
 * `accountLookup.logic.test.ts`, `handle.logic.test.ts`, and
 * `ownerProfile.logic.test.ts`).
 *
 * Authority: WP-132 §Scope (In) §D; EC-135 §3 (per-suite-run
 * uniqueness lock; SQL-write gate forbids row-purge cleanups);
 * D-13201..D-13206; WP-101 / WP-104 / WP-112 test-file precedents.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { getEntitlementsForAccount } from './entitlements.logic.js';
import {
  ENTITLEMENT_KEYS,
  type EntitlementKey,
} from './entitlements.types.js';
import { createPlayerAccount } from '../identity/identity.logic.js';
import type { AccountId, DatabaseClient } from '../identity/identity.types.js';

import pg from 'pg';

const { Pool } = pg;

const hasTestDatabase = process.env.TEST_DATABASE_URL !== undefined;

// why: per-suite-run identifier guarantees row uniqueness across
// repeated test runs without requiring a beforeEach cleanup. The
// EC-135 §3 SQL-write gate forbids row-mutating SQL against
// legendary.players / legendary.entitlements anywhere in scope (the
// EC-112 / EC-128 lesson established the per-suite-run-uniqueness
// pattern as the canonical alternative). `Date.now()` provides
// millisecond granularity; the per-test counter disambiguates within
// a single run.
const SUITE_RUN_ID = `wp132-${Date.now()}`;
let testCounter = 0;
function uniqueLabel(suffix: string): string {
  testCounter += 1;
  return `${SUITE_RUN_ID}-${testCounter}-${suffix}`;
}

function makeIdProvider(): () => string {
  const counter = { value: 0 };
  return () => {
    counter.value += 1;
    return `00000000-0000-4000-8000-${String(Date.now() % 1_000_000_000_000)
      .padStart(9, '0')}${String(counter.value).padStart(3, '0')}`;
  };
}

async function provisionAccount(
  testPool: pg.Pool,
  labelSuffix: string,
): Promise<{ accountId: AccountId; playerId: number }> {
  const email = `${uniqueLabel(labelSuffix)}@example.com`;
  const authProviderId = `${uniqueLabel(labelSuffix)}-sub`;
  const result = await createPlayerAccount(
    {
      email,
      displayName: `Ent${labelSuffix}`,
      authProvider: 'email',
      authProviderId,
    },
    testPool,
    makeIdProvider(),
  );
  assert.ok(result.ok === true, 'createPlayerAccount must succeed');
  const accountId = result.value.accountId;
  const playerIdResult = await testPool.query(
    'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
    [accountId],
  );
  const rawId = playerIdResult.rows[0].player_id;
  const playerId = typeof rawId === 'string' ? Number(rawId) : rawId;
  return { accountId, playerId };
}

describe('entitlements logic (WP-132)', () => {
  let testPool: pg.Pool | null = null;

  before(async () => {
    if (hasTestDatabase) {
      testPool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
      });
    }
  });

  after(async () => {
    if (testPool !== null) {
      await testPool.end();
      testPool = null;
    }
  });

  test(
    'returns Result.ok([]) when account has no entitlement rows',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const { accountId } = await provisionAccount(testPool, 'empty');
      const result = await getEntitlementsForAccount(accountId, testPool);
      assert.ok(result.ok === true);
      assert.deepEqual(result.value, []);
    },
  );

  test(
    'returns one-element array when account has a single active entitlement',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const { accountId, playerId } = await provisionAccount(testPool, 'one');
      await testPool.query(
        "INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref) VALUES ($1, 'cosmetic_playmat_classic', 'stripe', 'cs_test_one')",
        [playerId],
      );
      const result = await getEntitlementsForAccount(accountId, testPool);
      assert.ok(result.ok === true);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0]?.entitlementKey, 'cosmetic_playmat_classic');
      assert.equal(result.value[0]?.source, 'stripe');
      assert.equal(result.value[0]?.sourceRef, 'cs_test_one');
      assert.equal(result.value[0]?.revokedAt, null);
      assert.match(
        result.value[0]?.grantedAt ?? '',
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    },
  );

  test(
    'returns multiple entitlements ordered by granted_at ASC',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const { accountId, playerId } = await provisionAccount(testPool, 'multi');
      const baseTime = new Date('2026-01-01T00:00:00Z').getTime();
      await testPool.query(
        "INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref, granted_at) VALUES ($1, 'cosmetic_playmat_classic', 'stripe', 'cs_test_a', $2)",
        [playerId, new Date(baseTime + 0).toISOString()],
      );
      await testPool.query(
        "INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref, granted_at) VALUES ($1, 'cosmetic_playmat_comic', 'stripe', 'cs_test_b', $2)",
        [playerId, new Date(baseTime + 60_000).toISOString()],
      );
      await testPool.query(
        "INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref, granted_at) VALUES ($1, 'cosmetic_playmat_minimal', 'stripe', 'cs_test_c', $2)",
        [playerId, new Date(baseTime + 120_000).toISOString()],
      );
      const result = await getEntitlementsForAccount(accountId, testPool);
      assert.ok(result.ok === true);
      assert.equal(result.value.length, 3);
      assert.deepEqual(
        result.value.map((entitlement) => entitlement.entitlementKey),
        [
          'cosmetic_playmat_classic',
          'cosmetic_playmat_comic',
          'cosmetic_playmat_minimal',
        ],
      );
    },
  );

  test(
    'filters out revoked entitlements via WHERE revoked_at IS NULL',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const { accountId, playerId } = await provisionAccount(
        testPool,
        'revoked',
      );
      await testPool.query(
        "INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref, revoked_at) VALUES ($1, 'cosmetic_playmat_classic', 'stripe', 'cs_revoked', now())",
        [playerId],
      );
      await testPool.query(
        "INSERT INTO legendary.entitlements (player_id, entitlement_key, source, source_ref) VALUES ($1, 'cosmetic_playmat_comic', 'stripe', 'cs_active')",
        [playerId],
      );
      const result = await getEntitlementsForAccount(accountId, testPool);
      assert.ok(result.ok === true);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0]?.entitlementKey, 'cosmetic_playmat_comic');
      assert.equal(result.value[0]?.revokedAt, null);
    },
  );

  test(
    'returns Result.fail({ code: lookup_failed }) when AccountId not found in legendary.players',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const orphanAccountId =
        '00000000-0000-4000-8000-999999999999' as AccountId;
      const result = await getEntitlementsForAccount(orphanAccountId, testPool);
      assert.ok(result.ok === false);
      assert.equal((result as { code: string }).code, 'lookup_failed');
    },
  );

  test('returns Result.fail({ code: lookup_failed }) when Step 1 throws', async () => {
    const failingDatabase = {
      query: async () => {
        throw new Error('simulated Step 1 failure');
      },
    } as unknown as DatabaseClient;
    const accountId = '00000000-0000-4000-8000-000000000001' as AccountId;
    const result = await getEntitlementsForAccount(accountId, failingDatabase);
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'lookup_failed');
  });

  test('returns Result.fail({ code: lookup_failed }) when Step 2 throws', async () => {
    let callCount = 0;
    const partiallyFailingDatabase = {
      query: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { rows: [{ player_id: 42 }] };
        }
        throw new Error('simulated Step 2 failure');
      },
    } as unknown as DatabaseClient;
    const accountId = '00000000-0000-4000-8000-000000000002' as AccountId;
    const result = await getEntitlementsForAccount(
      accountId,
      partiallyFailingDatabase,
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'lookup_failed');
    assert.equal(callCount, 2, 'Step 2 must be reached when Step 1 succeeds');
  });

  // why: D-13206 = (a) compile-time parity gate. The
  // `default: const _: never = key` branch fails at type-check time
  // if the EntitlementKey union and ENTITLEMENT_KEYS array diverge.
  // The forEach call exercises every member of ENTITLEMENT_KEYS at
  // runtime as defense-in-depth that the array literal was kept in
  // sync with the switch's case clauses. A `assert.deepEqual` test
  // would only check runtime equality and would NOT fail the build
  // at type-check time; the `never` branch is the load-bearing
  // primitive.
  test('ENTITLEMENT_KEYS array matches EntitlementKey union (compile-time + runtime)', () => {
    function assertExhaustive(key: EntitlementKey): void {
      switch (key) {
        case 'supporter_tier_basic_2026':
          return;
        case 'cosmetic_playmat_classic':
          return;
        case 'cosmetic_playmat_comic':
          return;
        case 'cosmetic_playmat_minimal':
          return;
        case 'cosmetic_cardback_default_plus':
          return;
        case 'cosmetic_avatar_frame_supporter':
          return;
        default: {
          const _exhaustive: never = key;
          throw new Error(`Drift: unhandled EntitlementKey ${_exhaustive}`);
        }
      }
    }
    ENTITLEMENT_KEYS.forEach(assertExhaustive);
    assert.equal(ENTITLEMENT_KEYS.length, 6);
  });
});
