/**
 * Tests for badge issuance hook (WP-105).
 *
 * Uses a mock DatabaseClient to verify SQL generation and parameter
 * binding without requiring a live PostgreSQL connection. DB-dependent
 * tests are gated by the DATABASE_URL environment variable (skipped
 * when absent).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { issueTier1BadgesForSubmission } from './badge.issuance.js';
import type { ScoreBreakdown } from '@legendary-arena/game-engine';

/**
 * Build a minimal valid ScoreBreakdown for testing.
 */
function makeBreakdown(overrides: Partial<{
  finalScore: number;
  villainEscaped: number;
}>): ScoreBreakdown {
  return {
    finalScore: overrides.finalScore ?? -5,
    penaltyBreakdown: {
      villainEscaped: overrides.villainEscaped ?? 0,
      bystanderLost: 0,
      schemeTwistNegative: 0,
      mastermindTacticUntaken: 0,
      scenarioSpecificPenalty: 0,
    },
    inputs: {
      bystandersRescued: 3,
      escapes: 0,
    },
    scoringConfigVersion: 1,
  } as ScoreBreakdown;
}

interface MockQueryCall {
  sql: string;
  params: unknown[];
}

/**
 * Minimal mock DatabaseClient that records queries. The history badge
 * query (COUNT(DISTINCT scenario_key)) returns a configurable count.
 */
function makeMockDatabase(distinctScenarioCount: number = 0) {
  const calls: MockQueryCall[] = [];
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      if (sql.includes('COUNT(DISTINCT scenario_key)')) {
        return { rows: [{ distinct_count: distinctScenarioCount }] };
      }
      return { rows: [] };
    },
  };
}

describe('badge.issuance', () => {
  test('issues per-run badges with correct source_kind and source_ref', async () => {
    const database = makeMockDatabase(0);
    const breakdown = makeBreakdown({ finalScore: -3, villainEscaped: 0 });

    await issueTier1BadgesForSubmission(42, 100, breakdown, 'scenario-1', 1, database as any);

    const insertCall = database.calls.find((c) => c.sql.includes('INSERT INTO legendary.player_badges'));
    assert.ok(insertCall, 'Expected an INSERT INTO legendary.player_badges query.');
    assert.ok(insertCall.sql.includes('ON CONFLICT DO NOTHING'));

    // why: per-run badges have source_kind='competitive_score' and source_ref=scoreId
    assert.ok(insertCall.params.includes(42), 'Expected playerId in params.');
    assert.ok(insertCall.params.includes(100), 'Expected scoreId as source_ref.');
    assert.ok(insertCall.params.includes('competitive_score'), 'Expected competitive_score source_kind.');
    assert.ok(insertCall.params.includes('gameplay.sub-par-run'), 'Expected sub-par-run badge key.');
    assert.ok(insertCall.params.includes('gameplay.pristine-defense'), 'Expected pristine-defense badge key.');
  });

  test('issues no badges when none qualify', async () => {
    const database = makeMockDatabase(0);
    const breakdown = makeBreakdown({ finalScore: 5, villainEscaped: 2 });

    await issueTier1BadgesForSubmission(42, 100, breakdown, 'scenario-1', 1, database as any);

    const insertCall = database.calls.find((c) => c.sql.includes('INSERT INTO legendary.player_badges'));
    assert.equal(insertCall, undefined, 'No INSERT should fire when no badges qualify.');
  });

  test('includes history badges when distinct count meets thresholds', async () => {
    const database = makeMockDatabase(5);
    const breakdown = makeBreakdown({ finalScore: -3, villainEscaped: 0 });

    await issueTier1BadgesForSubmission(42, 100, breakdown, 'scenario-1', 1, database as any);

    const insertCall = database.calls.find((c) => c.sql.includes('INSERT INTO legendary.player_badges'));
    assert.ok(insertCall, 'Expected an INSERT query.');
    assert.ok(
      insertCall.params.includes('gameplay.multiverse-mastery'),
      'Expected multiverse-mastery badge key when distinct count >= 5.',
    );
    assert.ok(
      insertCall.params.includes('competitive_history'),
      'Expected competitive_history source_kind for history badge.',
    );
  });

  test('history badges have null source_ref', async () => {
    const database = makeMockDatabase(10);
    const breakdown = makeBreakdown({ finalScore: 5, villainEscaped: 2 });

    await issueTier1BadgesForSubmission(42, 100, breakdown, 'scenario-1', 1, database as any);

    const insertCall = database.calls.find((c) => c.sql.includes('INSERT INTO legendary.player_badges'));
    assert.ok(insertCall, 'Expected an INSERT for history badges.');
    // why: history badges use source_ref=null; per-run scored 0 here
    assert.ok(insertCall.params.includes(null), 'Expected null source_ref for history badge.');
  });

  test('throws on invalid ScoreBreakdown shape', async () => {
    const database = makeMockDatabase(0);
    const badBreakdown = { finalScore: 'not-a-number' } as unknown as ScoreBreakdown;

    await assert.rejects(
      () => issueTier1BadgesForSubmission(42, 100, badBreakdown, 'scenario-1', 1, database as any),
      /ScoreBreakdown deserialization failed/,
    );
  });

  test('includes veteran badges at threshold 10', async () => {
    const database = makeMockDatabase(10);
    const breakdown = makeBreakdown({ finalScore: -1, villainEscaped: 0 });

    await issueTier1BadgesForSubmission(42, 100, breakdown, 'scenario-1', 1, database as any);

    const insertCall = database.calls.find((c) => c.sql.includes('INSERT INTO legendary.player_badges'));
    assert.ok(insertCall);
    assert.ok(insertCall.params.includes('gameplay.veteran.seasoned-defender'));
  });
});
