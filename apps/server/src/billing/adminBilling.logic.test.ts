/**
 * Tests for `getAdminBillingHistory` (WP-110 / EC-163). Logic-pure
 * suite: fakes are injected at construction time; no live database,
 * no network.
 *
 * Authority: WP-110 §J; EC-163 §Files to Produce.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getAdminBillingHistory } from './adminBilling.logic.js';
import type { DatabaseClient } from './billing.types.js';

function makeFakeDatabase(
  queryHandler: (text: string, values?: unknown[]) => { rows: Record<string, unknown>[] },
): DatabaseClient {
  return {
    query(text: string, values?: unknown[]) {
      return Promise.resolve(queryHandler(text, values));
    },
  } as DatabaseClient;
}

describe('getAdminBillingHistory', () => {
  test('returns empty array when no checkout sessions exist', async () => {
    const database = makeFakeDatabase(() => ({ rows: [] }));
    const result = await getAdminBillingHistory(database);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.deepStrictEqual(result.value, []);
    }
  });

  test('returns correctly shaped entries for populated results', async () => {
    const database = makeFakeDatabase(() => ({
      rows: [
        {
          account_id: 'acct-001',
          session_id: 'cs_test_abc',
          entitlement_key: 'supporter_tier_basic_2026',
          intent_status: 'completed',
          created_at: new Date('2026-05-01T10:00:00Z'),
          completed_at: new Date('2026-05-01T10:05:00Z'),
        },
        {
          account_id: 'acct-002',
          session_id: 'cs_test_def',
          entitlement_key: 'cosmetic_playmat_classic',
          intent_status: 'open',
          created_at: new Date('2026-05-02T12:00:00Z'),
          completed_at: null,
        },
      ],
    }));
    const result = await getAdminBillingHistory(database);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.value.length, 2);

      const first = result.value[0];
      assert.equal(first.accountId, 'acct-001');
      assert.equal(first.sessionId, 'cs_test_abc');
      assert.equal(first.entitlementKey, 'supporter_tier_basic_2026');
      assert.equal(first.intentStatus, 'completed');
      assert.equal(first.createdAt, '2026-05-01T10:00:00.000Z');
      assert.equal(first.completedAt, '2026-05-01T10:05:00.000Z');

      const second = result.value[1];
      assert.equal(second.accountId, 'acct-002');
      assert.equal(second.sessionId, 'cs_test_def');
      assert.equal(second.intentStatus, 'open');
      assert.equal(second.completedAt, null);
    }
  });

  test('returns history_lookup_failed on database fault', async () => {
    const database = makeFakeDatabase(() => {
      throw new Error('Simulated database connection failure.');
    });
    const result = await getAdminBillingHistory(database);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'history_lookup_failed');
    }
  });
});
