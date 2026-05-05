/**
 * Tests for the production account resolver (WP-131 / EC-134).
 *
 * Three pure-logic tests inside one describe block. The resolver is
 * a thin closure over WP-112's `findAccountByAuthProviderSub`; the
 * locked column shape is `{ ext_id, auth_provider, auth_provider_id }`
 * per `accountLookup.logic.ts:68-72`. All tests use a locally-defined
 * fake `DatabaseClient` (the `query(text, params): Promise<{ rows: T[] }>`
 * shape from `identity.types.ts`) — no real PostgreSQL connection,
 * no `TEST_DATABASE_URL` skip-pattern (these tests are pure logic
 * by construction, mirroring tests 1-2 of `accountLookup.logic.test.ts`).
 *
 * The tests do not import from `boardgame.io`, `boardgame.io/testing`,
 * or any engine / registry / preplan / UI package. The only imports
 * are `node:test`, `node:assert/strict`, the resolver under test,
 * and the `VerifiedSessionClaim` type for the fake claim shape.
 *
 * Authority: WP-131 §B; EC-134 §3 (test plan — exactly three cases:
 * hit / clean miss / lookup failure); D-11203
 * (`findAccountByAuthProviderSub` signature + `'lookup_failed'`
 * propagation lock).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { productionAccountResolver } from './accountResolver.logic.js';
import type { VerifiedSessionClaim } from './sessionToken.types.js';

const fixtureClaim: VerifiedSessionClaim = {
  authProvider: 'google',
  authProviderSub: 'sub-fixture-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

describe('productionAccountResolver (WP-131)', () => {
  test('returns Result.ok(accountId) when findAccountByAuthProviderSub returns a hit', async () => {
    // why: locks the row → `AccountId` projection at the resolver
    // boundary. The hit branch drops `authProvider` and
    // `authProviderId` from the lookup helper's payload because the
    // orchestrator only consumes the bare `AccountId` going forward;
    // any consumer that wants the full row calls
    // `findAccountByAuthProviderSub` directly.
    const fakeDatabase = {
      query: async () => ({
        rows: [
          {
            ext_id: 'acct-fixture-1',
            auth_provider: 'google',
            auth_provider_id: 'sub-fixture-1',
          },
        ],
        rowCount: 1,
      }),
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(fixtureClaim, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, 'acct-fixture-1');
  });

  test('returns Result.ok(null) when findAccountByAuthProviderSub returns a clean miss', async () => {
    // why: locks the clean-miss branch as a Result.ok(null) (NOT a
    // failure). The orchestrator's translation site at
    // `sessionToken.logic.ts:211-218` is the sole site that maps
    // null → `'unknown_account'` (401, not 403, per the
    // account-existence-probe defense). Producing a failure here
    // would fold first-Hanko-callback brand-new-user requests into
    // the `'lookup_failed'` 500 path.
    const fakeDatabase = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(fixtureClaim, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, null);
  });

  test('returns Result.fail({ code: lookup_failed }) when findAccountByAuthProviderSub throws', async () => {
    // why: confirms the resolver does not swallow database faults —
    // `'lookup_failed'` must propagate verbatim so the orchestrator
    // routes 500, not 401, at the route boundary. The `reason` field
    // carrying the underlying error message is preserved per
    // `accountLookup.logic.ts:140-148` propagation, so operator-side
    // diagnostics see the root cause in the same log line.
    const throwingDatabase = {
      query: async () => {
        throw new Error('connection lost');
      },
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(fixtureClaim, throwingDatabase);

    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'lookup_failed');
    assert.ok(
      typeof (result as { reason: string }).reason === 'string' &&
        (result as { reason: string }).reason.includes('connection lost'),
      'lookup_failed result must propagate the underlying error message in its reason field',
    );
  });
});
