/**
 * Tests for the account provisioning helper (WP-174 / EC-196).
 *
 * Four test cases covering: happy-path INSERT, concurrent-insert
 * conflict resolution (ON CONFLICT + re-SELECT), duplicate-email
 * (different auth provider), and database fault propagation. All
 * tests use a locally-defined fake `DatabaseClient` — no real
 * PostgreSQL connection.
 *
 * Authority: WP-174 §E; EC-196 (locked values — ON CONFLICT target,
 * idempotency guarantee, atomicity requirement).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { provisionPlayerAccount } from './accountProvisioning.logic.js';

const fixtureInput = {
  email: 'test@example.com',
  displayName: 'Test User',
  authProvider: 'email' as const,
  authProviderId: 'hanko-sub-1',
};

const fixtureIdProvider = () => 'generated-uuid-1';

describe('provisionPlayerAccount (WP-174)', () => {
  test('happy path: INSERT succeeds and returns the new account', async () => {
    const fakeDatabase = {
      query: async (_text: string, params: unknown[]) => ({
        rows: [
          {
            ext_id: params[0],
            email: params[1],
            display_name: params[2],
            auth_provider: params[3],
            auth_provider_id: params[4],
          },
        ],
        rowCount: 1,
      }),
    } as unknown as pg.Pool;

    const result = await provisionPlayerAccount(
      fixtureInput,
      fakeDatabase,
      fixtureIdProvider,
    );

    assert.ok(result.ok === true);
    assert.equal(result.value.accountId, 'generated-uuid-1');
    assert.equal(result.value.email, 'test@example.com');
    assert.equal(result.value.displayName, 'Test User');
    assert.equal(result.value.authProvider, 'email');
    assert.equal(result.value.authProviderId, 'hanko-sub-1');
  });

  test('concurrent insert: ON CONFLICT fires (zero RETURNING rows), re-SELECT returns winning row', async () => {
    let callCount = 0;
    const fakeDatabase = {
      query: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              ext_id: 'existing-uuid-winner',
              email: 'test@example.com',
              display_name: 'Test User',
              auth_provider: 'email',
              auth_provider_id: 'hanko-sub-1',
            },
          ],
          rowCount: 1,
        };
      },
    } as unknown as pg.Pool;

    const result = await provisionPlayerAccount(
      fixtureInput,
      fakeDatabase,
      fixtureIdProvider,
    );

    assert.ok(result.ok === true);
    assert.equal(result.value.accountId, 'existing-uuid-winner');
    assert.equal(callCount, 2);
  });

  test('duplicate email under different auth provider returns Result.fail with code duplicate_email', async () => {
    const throwingDatabase = {
      query: async () => {
        const error = new Error('duplicate key value violates unique constraint "players_email_key"');
        (error as unknown as { code: string }).code = '23505';
        throw error;
      },
    } as unknown as pg.Pool;

    const result = await provisionPlayerAccount(
      fixtureInput,
      throwingDatabase,
      fixtureIdProvider,
    );

    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'duplicate_email');
    assert.ok(
      (result as { reason: string }).reason.includes('different auth provider'),
      'reason must mention account linking is not supported',
    );
  });

  test('database fault returns Result.fail with code lookup_failed', async () => {
    const throwingDatabase = {
      query: async () => {
        throw new Error('connection refused');
      },
    } as unknown as pg.Pool;

    const result = await provisionPlayerAccount(
      fixtureInput,
      throwingDatabase,
      fixtureIdProvider,
    );

    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'lookup_failed');
    assert.ok(
      (result as { reason: string }).reason.includes('connection refused'),
      'reason must propagate the underlying error message',
    );
  });
});
