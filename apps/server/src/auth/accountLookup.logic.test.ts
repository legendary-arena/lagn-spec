/**
 * Tests for the account-lookup helper (WP-112 / EC-112).
 *
 * Six tests inside one describe block. Tests 1-2 are pure logic
 * checks that do not require a live database (lookup_failed on
 * `query()` exception, and the no-canonicalization invariant
 * verified via a recording fake). Tests 3-6 exercise
 * `findAccountByAuthProviderSub` against a real PostgreSQL test
 * database; each uses node:test's options-based non-silent skip when
 * `process.env.TEST_DATABASE_URL` is unset (locked WP-052 §3.1
 * post-mortem pattern; mirrors `handle.logic.test.ts`'s skip form).
 *
 * Per-run uniqueness: every DB-required test generates `email` and
 * `authProviderId` values prefixed by a per-suite-run identifier
 * (`Date.now()` plus a per-test counter). This avoids `UNIQUE`-
 * constraint conflicts across runs without requiring a `beforeEach`
 * cleanup; the EC-112 §2 SQL-write gate forbids row-mutating SQL
 * keywords anywhere in scope, and a cleanup-style row purge would
 * also trip the single-reader gate that requires the lookup
 * helper to be the lone consumer of the players-table read
 * projection in scope.
 *
 * Authority: WP-112 §Scope (In) §E; EC-112 §2 (SQL-write gate +
 * single-SELECT gate); D-11203 (signature lock); WP-101
 * `handle.logic.test.ts` (skip-pattern precedent).
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { findAccountByAuthProviderSub } from './accountLookup.logic.js';
import { createPlayerAccount } from '../identity/identity.logic.js';

import pg from 'pg';

const { Pool } = pg;

const hasTestDatabase = process.env.TEST_DATABASE_URL !== undefined;

// why: per-suite-run identifier guarantees row uniqueness across
// repeated test runs without requiring a beforeEach cleanup.
// `Date.now()` provides millisecond granularity; the per-test
// counter disambiguates within a single run.
const SUITE_RUN_ID = `wp112-${Date.now()}`;
let testCounter = 0;
function uniqueLabel(suffix: string): string {
  testCounter += 1;
  return `${SUITE_RUN_ID}-${testCounter}-${suffix}`;
}

describe('account lookup logic (WP-112)', () => {
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

  test('findAccountByAuthProviderSub returns Result.fail with code lookup_failed when the database client throws', async () => {
    const throwingDatabase = {
      query: async () => {
        throw new Error('connection refused');
      },
    } as unknown as pg.Pool;
    const result = await findAccountByAuthProviderSub(
      'email',
      'alice@example.com',
      throwingDatabase,
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'lookup_failed');
    assert.ok(
      typeof (result as { reason: string }).reason === 'string' &&
        (result as { reason: string }).reason.length > 0,
      'lookup_failed result must carry a non-empty full-sentence reason',
    );
  });

  test('findAccountByAuthProviderSub does not canonicalize input — case-mismatched authProviderSub yields no match against a canonical row', async () => {
    // why: pure-logic test using a fake DB that records the bound
    // parameters and returns an empty result set. Confirms the
    // helper passes input verbatim without trim / lowercase /
    // canonicalization, matching WP-101 `findAccountByHandle`'s
    // minimal-canonicalization posture (the verifier's `sub` claim
    // is opaque per OIDC; canonicalizing would risk a silent miss).
    const recordedParams: unknown[][] = [];
    const recordingDatabase = {
      query: async (_text: string, params: unknown[]) => {
        recordedParams.push(params);
        return { rows: [], rowCount: 0 };
      },
    } as unknown as pg.Pool;
    const result = await findAccountByAuthProviderSub(
      'email',
      'Alice@Example.COM',
      recordingDatabase,
    );
    assert.ok(result.ok === true);
    assert.equal(result.value, null);
    assert.equal(recordedParams.length, 1);
    assert.deepEqual(recordedParams[0], ['email', 'Alice@Example.COM']);
  });

  test(
    'findAccountByAuthProviderSub returns Result.ok with the row when (authProvider, authProviderId) matches an existing account',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const idCounter = { value: 0 };
      const idProvider = () => {
        idCounter.value += 1;
        return `00000000-0000-4000-8000-${String(Date.now() % 1_000_000_000_000)
          .padStart(9, '0')}${String(idCounter.value).padStart(3, '0')}`;
      };
      const email = `${uniqueLabel('hit')}@example.com`;
      const authProviderId = `${uniqueLabel('hit')}-sub`;

      const accountResult = await createPlayerAccount(
        {
          email,
          displayName: 'AliceHit',
          authProvider: 'email',
          authProviderId,
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);

      const lookup = await findAccountByAuthProviderSub(
        'email',
        authProviderId,
        testPool,
      );
      assert.ok(lookup.ok === true);
      assert.ok(lookup.value !== null);
      assert.equal(lookup.value.accountId, accountResult.value.accountId);
      assert.equal(lookup.value.authProvider, 'email');
      assert.equal(lookup.value.authProviderId, authProviderId);
    },
  );

  test(
    'findAccountByAuthProviderSub returns Result.ok(null) when no row matches the supplied claim pair',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const lookup = await findAccountByAuthProviderSub(
        'email',
        `${uniqueLabel('absent')}-never-stored`,
        testPool,
      );
      assert.ok(lookup.ok === true);
      assert.equal(lookup.value, null);
    },
  );

  test(
    'findAccountByAuthProviderSub returns Result.ok(null) when authProvider mismatches the row',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const idCounter = { value: 0 };
      const idProvider = () => {
        idCounter.value += 1;
        return `00000000-0000-4000-8000-${String(Date.now() % 1_000_000_000_000)
          .padStart(9, '0')}${String(idCounter.value).padStart(3, '0')}`;
      };
      const email = `${uniqueLabel('provider-mismatch')}@example.com`;
      const authProviderId = `${uniqueLabel('provider-mismatch')}-sub`;

      const accountResult = await createPlayerAccount(
        {
          email,
          displayName: 'BobMismatch',
          authProvider: 'email',
          authProviderId,
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);

      const lookup = await findAccountByAuthProviderSub(
        'google',
        authProviderId,
        testPool,
      );
      assert.ok(lookup.ok === true);
      assert.equal(lookup.value, null);
    },
  );

  test(
    'findAccountByAuthProviderSub matches rows for non-email auth providers (google) on the locked claim pair',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const idCounter = { value: 0 };
      const idProvider = () => {
        idCounter.value += 1;
        return `00000000-0000-4000-8000-${String(Date.now() % 1_000_000_000_000)
          .padStart(9, '0')}${String(idCounter.value).padStart(3, '0')}`;
      };
      const email = `${uniqueLabel('google-hit')}@example.com`;
      const authProviderId = `google-${uniqueLabel('google-hit')}-sub`;

      const accountResult = await createPlayerAccount(
        {
          email,
          displayName: 'CharlieGoogle',
          authProvider: 'google',
          authProviderId,
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);

      const lookup = await findAccountByAuthProviderSub(
        'google',
        authProviderId,
        testPool,
      );
      assert.ok(lookup.ok === true);
      assert.ok(lookup.value !== null);
      assert.equal(lookup.value.accountId, accountResult.value.accountId);
      assert.equal(lookup.value.authProvider, 'google');
      assert.equal(lookup.value.authProviderId, authProviderId);
    },
  );
});
