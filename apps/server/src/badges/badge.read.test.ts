/**
 * Tests for badge read surface (WP-105).
 *
 * Uses a mock DatabaseClient to verify query structure and row mapping.
 * DB-dependent tests are gated by DATABASE_URL (skipped when absent).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getPlayerBadges } from './badge.read.js';

interface MockQueryCall {
  sql: string;
  params: unknown[];
}

/**
 * Minimal mock DatabaseClient that returns configurable rows.
 */
function makeMockDatabase(rows: Record<string, unknown>[] = []) {
  const calls: MockQueryCall[] = [];
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return { rows };
    },
  };
}

describe('badge.read', () => {
  test('returns empty array when player has no badges', async () => {
    const database = makeMockDatabase([]);
    const result = await getPlayerBadges(42, database as any);
    assert.deepStrictEqual(result, []);
  });

  test('queries with correct player_id and filter', async () => {
    const database = makeMockDatabase([]);
    await getPlayerBadges(42, database as any);

    assert.equal(database.calls.length, 1);
    assert.ok(database.calls[0].sql.includes('WHERE player_id = $1'));
    assert.ok(database.calls[0].sql.includes('is_revoked = false'));
    assert.ok(database.calls[0].sql.includes('ORDER BY awarded_at DESC'));
    assert.deepStrictEqual(database.calls[0].params, [42]);
  });

  test('maps row fields to PlayerBadge shape', async () => {
    const database = makeMockDatabase([
      {
        badge_id: '7',
        badge_key: 'gameplay.sub-par-run',
        tier: 1,
        source_kind: 'competitive_score',
        source_ref: '100',
        awarded_at: '2026-05-01T12:00:00.000Z',
        awarded_under_config_version: 1,
        is_revoked: false,
      },
    ]);

    const result = await getPlayerBadges(42, database as any);
    assert.equal(result.length, 1);
    assert.equal(result[0].badgeId, 7);
    assert.equal(result[0].badgeKey, 'gameplay.sub-par-run');
    assert.equal(result[0].tier, 1);
    assert.equal(result[0].sourceKind, 'competitive_score');
    assert.equal(result[0].sourceRef, 100);
    assert.equal(result[0].awardedAt, '2026-05-01T12:00:00.000Z');
    assert.equal(result[0].awardedUnderConfigVersion, 1);
    assert.equal(result[0].isRevoked, false);
  });

  test('coerces bigserial string badge_id to number', async () => {
    const database = makeMockDatabase([
      {
        badge_id: '999',
        badge_key: 'gameplay.pristine-defense',
        tier: 1,
        source_kind: 'competitive_score',
        source_ref: null,
        awarded_at: new Date('2026-05-01T12:00:00.000Z'),
        awarded_under_config_version: 1,
        is_revoked: false,
      },
    ]);

    const result = await getPlayerBadges(42, database as any);
    assert.equal(typeof result[0].badgeId, 'number');
    assert.equal(result[0].badgeId, 999);
  });

  test('handles Date object for awarded_at', async () => {
    const database = makeMockDatabase([
      {
        badge_id: 1,
        badge_key: 'gameplay.sub-par-run',
        tier: 1,
        source_kind: 'competitive_score',
        source_ref: 50,
        awarded_at: new Date('2026-05-10T08:30:00.000Z'),
        awarded_under_config_version: 1,
        is_revoked: false,
      },
    ]);

    const result = await getPlayerBadges(42, database as any);
    assert.equal(result[0].awardedAt, '2026-05-10T08:30:00.000Z');
  });

  test('handles null source_ref', async () => {
    const database = makeMockDatabase([
      {
        badge_id: 2,
        badge_key: 'gameplay.multiverse-mastery',
        tier: 1,
        source_kind: 'competitive_history',
        source_ref: null,
        awarded_at: '2026-05-10T08:30:00.000Z',
        awarded_under_config_version: 1,
        is_revoked: false,
      },
    ]);

    const result = await getPlayerBadges(42, database as any);
    assert.equal(result[0].sourceRef, null);
  });
});
