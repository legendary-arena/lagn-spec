/**
 * Tests for `getBillingHistoryForAccount` (WP-108 / EC-158). Logic-pure
 * suite: fakes are injected at construction time; no live database, no
 * network.
 *
 * Authority: WP-108 §Scope; EC-158 §4.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getBillingHistoryForAccount } from './billingHistory.logic.js';
import type { AccountId, DatabaseClient } from './billing.types.js';

const FAKE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001' as AccountId;

function makeFakeDatabase(
  queryHandler: (text: string, values: unknown[]) => { rows: Record<string, unknown>[] },
): DatabaseClient {
  return {
    query(text: string, values?: unknown[]) {
      return Promise.resolve(queryHandler(text, values ?? []));
    },
  } as DatabaseClient;
}

describe('getBillingHistoryForAccount', () => {
  test('returns empty array for account with no checkout sessions', async () => {
    let callCount = 0;
    const database = makeFakeDatabase((text) => {
      callCount += 1;
      if (callCount === 1) {
        return { rows: [{ player_id: 42 }] };
      }
      return { rows: [] };
    });
    const result = await getBillingHistoryForAccount(FAKE_ACCOUNT_ID, database);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.deepStrictEqual(result.value, []);
    }
  });

  test('returns entries ordered by created_at DESC', async () => {
    let callCount = 0;
    const database = makeFakeDatabase((text) => {
      callCount += 1;
      if (callCount === 1) {
        return { rows: [{ player_id: 42 }] };
      }
      return {
        rows: [
          {
            entitlement_key: 'cosmetic_card_back_2025',
            intent_status: 'completed',
            created_at: new Date('2026-05-10T12:00:00Z'),
            completed_at: new Date('2026-05-10T12:05:00Z'),
          },
          {
            entitlement_key: 'cosmetic_avatar_frame_2025',
            intent_status: 'open',
            created_at: new Date('2026-05-01T08:00:00Z'),
            completed_at: null,
          },
        ],
      };
    });
    const result = await getBillingHistoryForAccount(FAKE_ACCOUNT_ID, database);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.length, 2);
      assert.equal(result.value[0].entitlementKey, 'cosmetic_card_back_2025');
      assert.equal(result.value[0].intentStatus, 'completed');
      assert.equal(result.value[0].createdAt, '2026-05-10T12:00:00.000Z');
      assert.equal(result.value[0].completedAt, '2026-05-10T12:05:00.000Z');
      assert.equal(result.value[1].entitlementKey, 'cosmetic_avatar_frame_2025');
      assert.equal(result.value[1].intentStatus, 'open');
      assert.equal(result.value[1].completedAt, null);
    }
  });

  test('returns ok: false with code history_lookup_failed when account not found', async () => {
    const database = makeFakeDatabase(() => {
      return { rows: [] };
    });
    const result = await getBillingHistoryForAccount(FAKE_ACCOUNT_ID, database);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'history_lookup_failed');
    }
  });

  test('returns ok: false with code history_lookup_failed on database fault', async () => {
    const database = {
      query() {
        return Promise.reject(new Error('connection refused'));
      },
    } as unknown as DatabaseClient;
    const result = await getBillingHistoryForAccount(FAKE_ACCOUNT_ID, database);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'history_lookup_failed');
    }
  });
});
