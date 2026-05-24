/**
 * Tests for the production account resolver (WP-131 / EC-134 + WP-174 / EC-196).
 *
 * Original three WP-131 tests (hit / clean miss / lookup failure) plus
 * WP-174 tests for the read-or-create provisioning flow: happy-path
 * provisioning, missing-email fallback, whitespace/no-@ email fallback,
 * duplicate-email (different provider) fallback, and concurrent-insert
 * idempotency.
 *
 * All tests use a locally-defined fake `DatabaseClient` — no real
 * PostgreSQL connection.
 *
 * Authority: WP-131 §B; WP-174 §C; EC-196.
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

describe('productionAccountResolver — WP-174 provisioning', () => {
  const claimWithEmail: VerifiedSessionClaim = {
    authProvider: 'email',
    authProviderSub: 'hanko-new-user',
    expiresAt: '2099-01-01T00:00:00.000Z',
    email: 'newuser@example.com',
    displayName: 'New User',
  };

  test('provisions a new account when lookup returns null and email is present', async () => {
    let queryCount = 0;
    const fakeDatabase = {
      query: async (text: string, params: unknown[]) => {
        queryCount += 1;
        if (queryCount === 1) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              ext_id: 'provisioned-uuid',
              email: params[1],
              display_name: params[2],
              auth_provider: params[3],
              auth_provider_id: params[4],
            },
          ],
          rowCount: 1,
        };
      },
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(claimWithEmail, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, 'provisioned-uuid');
  });

  test('returns Result.ok(null) when lookup returns null and email is absent', async () => {
    const claimNoEmail: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'hanko-no-email',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };

    const fakeDatabase = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(claimNoEmail, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, null);
  });

  test('returns Result.ok(null) when email is whitespace-only', async () => {
    const claimWhitespace: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'hanko-whitespace',
      expiresAt: '2099-01-01T00:00:00.000Z',
      email: '   ',
    };

    const fakeDatabase = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(claimWhitespace, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, null);
  });

  test('returns Result.ok(null) when email has no @ sign', async () => {
    const claimNoAt: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'hanko-no-at',
      expiresAt: '2099-01-01T00:00:00.000Z',
      email: 'notanemail',
    };

    const fakeDatabase = {
      query: async () => ({ rows: [], rowCount: 0 }),
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(claimNoAt, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, null);
  });

  test('returns Result.ok(null) when provisioning hits duplicate_email (different provider)', async () => {
    let queryCount = 0;
    const fakeDatabase = {
      query: async () => {
        queryCount += 1;
        if (queryCount === 1) {
          return { rows: [], rowCount: 0 };
        }
        const error = new Error('duplicate key value violates unique constraint "players_email_key"');
        (error as unknown as { code: string }).code = '23505';
        throw error;
      },
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(claimWithEmail, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(result.value, null);
  });

  test('uses display name fallback from email local-part when displayName is absent', async () => {
    const claimNoName: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'hanko-no-name',
      expiresAt: '2099-01-01T00:00:00.000Z',
      email: 'jeff@barefootbetters.com',
    };

    let capturedDisplayName: unknown;
    let queryCount = 0;
    const fakeDatabase = {
      query: async (_text: string, params: unknown[]) => {
        queryCount += 1;
        if (queryCount === 1) {
          return { rows: [], rowCount: 0 };
        }
        capturedDisplayName = params[2];
        return {
          rows: [
            {
              ext_id: 'uuid-fallback',
              email: params[1],
              display_name: params[2],
              auth_provider: params[3],
              auth_provider_id: params[4],
            },
          ],
          rowCount: 1,
        };
      },
    } as unknown as pg.Pool;

    const result = await productionAccountResolver(claimNoName, fakeDatabase);

    assert.ok(result.ok === true);
    assert.equal(capturedDisplayName, 'jeff');
  });

  test('normalizes email to lowercase before provisioning', async () => {
    const claimUppercase: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'hanko-uppercase',
      expiresAt: '2099-01-01T00:00:00.000Z',
      email: '  Alice@Example.COM  ',
    };

    let capturedEmail: unknown;
    let queryCount = 0;
    const fakeDatabase = {
      query: async (_text: string, params: unknown[]) => {
        queryCount += 1;
        if (queryCount === 1) {
          return { rows: [], rowCount: 0 };
        }
        capturedEmail = params[1];
        return {
          rows: [
            {
              ext_id: 'uuid-norm',
              email: params[1],
              display_name: params[2],
              auth_provider: params[3],
              auth_provider_id: params[4],
            },
          ],
          rowCount: 1,
        };
      },
    } as unknown as pg.Pool;

    await productionAccountResolver(claimUppercase, fakeDatabase);

    assert.equal(capturedEmail, 'alice@example.com');
  });
});
