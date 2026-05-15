/**
 * Tests for badge eligibility predicates (WP-105).
 *
 * All predicates are pure functions of ScoreBreakdown — no I/O, no
 * database, no mocks needed.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateScoreBreakdownShape,
  isEligibleSubParRun,
  isEligiblePristineDefense,
  evaluatePerRunBadges,
} from './badge.predicates.js';
import { TIER_1_BADGE_KEYS, BADGE_DEFINITIONS } from './badge.types.js';
import type { ScoreBreakdown } from '@legendary-arena/game-engine';

/**
 * Build a minimal valid ScoreBreakdown for testing.
 */
function makeBreakdown(overrides: Partial<{
  finalScore: number;
  villainEscaped: number;
  bystanderLost: number;
  schemeTwistNegative: number;
  mastermindTacticUntaken: number;
  scenarioSpecificPenalty: number;
  scoringConfigVersion: number;
}>): ScoreBreakdown {
  return {
    finalScore: overrides.finalScore ?? -5,
    penaltyBreakdown: {
      villainEscaped: overrides.villainEscaped ?? 0,
      bystanderLost: overrides.bystanderLost ?? 0,
      schemeTwistNegative: overrides.schemeTwistNegative ?? 0,
      mastermindTacticUntaken: overrides.mastermindTacticUntaken ?? 0,
      scenarioSpecificPenalty: overrides.scenarioSpecificPenalty ?? 0,
    },
    inputs: {
      bystandersRescued: 3,
      escapes: 0,
    },
    scoringConfigVersion: overrides.scoringConfigVersion ?? 1,
  } as ScoreBreakdown;
}

describe('badge.predicates', () => {
  describe('TIER_1_BADGE_KEYS drift detection', () => {
    test('contains exactly 7 entries', () => {
      assert.equal(TIER_1_BADGE_KEYS.length, 7);
    });

    test('every key has a BADGE_DEFINITIONS entry', () => {
      for (const key of TIER_1_BADGE_KEYS) {
        assert.ok(
          BADGE_DEFINITIONS.has(key),
          `Missing BADGE_DEFINITIONS entry for "${key}".`,
        );
      }
    });

    test('every BADGE_DEFINITIONS entry has a TIER_1_BADGE_KEYS member', () => {
      for (const key of BADGE_DEFINITIONS.keys()) {
        assert.ok(
          TIER_1_BADGE_KEYS.includes(key),
          `BADGE_DEFINITIONS contains "${key}" which is not in TIER_1_BADGE_KEYS.`,
        );
      }
    });
  });

  describe('validateScoreBreakdownShape', () => {
    test('accepts a valid ScoreBreakdown', () => {
      const breakdown = makeBreakdown({});
      assert.doesNotThrow(() => validateScoreBreakdownShape(breakdown));
    });

    test('throws on null input', () => {
      assert.throws(
        () => validateScoreBreakdownShape(null),
        /expected an object/,
      );
    });

    test('throws on missing finalScore', () => {
      const bad = { penaltyBreakdown: { villainEscaped: 0, bystanderLost: 0, schemeTwistNegative: 0, mastermindTacticUntaken: 0, scenarioSpecificPenalty: 0 }, inputs: {}, scoringConfigVersion: 1 };
      assert.throws(
        () => validateScoreBreakdownShape(bad),
        /finalScore must be a number/,
      );
    });

    test('throws on missing penaltyBreakdown key', () => {
      const bad = {
        finalScore: -3,
        penaltyBreakdown: { villainEscaped: 0 },
        inputs: {},
        scoringConfigVersion: 1,
      };
      assert.throws(
        () => validateScoreBreakdownShape(bad),
        /penaltyBreakdown\.bystanderLost must be a number/,
      );
    });

    test('throws on missing scoringConfigVersion', () => {
      const bad = {
        finalScore: -3,
        penaltyBreakdown: { villainEscaped: 0, bystanderLost: 0, schemeTwistNegative: 0, mastermindTacticUntaken: 0, scenarioSpecificPenalty: 0 },
        inputs: {},
      };
      assert.throws(
        () => validateScoreBreakdownShape(bad),
        /scoringConfigVersion must be a number/,
      );
    });
  });

  describe('isEligibleSubParRun', () => {
    test('returns true when finalScore < 0', () => {
      assert.equal(isEligibleSubParRun(makeBreakdown({ finalScore: -1 })), true);
    });

    test('returns false when finalScore === 0', () => {
      assert.equal(isEligibleSubParRun(makeBreakdown({ finalScore: 0 })), false);
    });

    test('returns false when finalScore > 0', () => {
      assert.equal(isEligibleSubParRun(makeBreakdown({ finalScore: 5 })), false);
    });
  });

  describe('isEligiblePristineDefense', () => {
    test('returns true when villainEscaped === 0', () => {
      assert.equal(
        isEligiblePristineDefense(makeBreakdown({ villainEscaped: 0 })),
        true,
      );
    });

    test('returns false when villainEscaped > 0', () => {
      assert.equal(
        isEligiblePristineDefense(makeBreakdown({ villainEscaped: 2 })),
        false,
      );
    });
  });

  describe('evaluatePerRunBadges', () => {
    test('returns both badges when eligible for both', () => {
      const breakdown = makeBreakdown({ finalScore: -3, villainEscaped: 0 });
      const result = evaluatePerRunBadges(breakdown);
      assert.deepStrictEqual(result, [
        'gameplay.sub-par-run',
        'gameplay.pristine-defense',
      ]);
    });

    test('returns only sub-par-run when villain escaped', () => {
      const breakdown = makeBreakdown({ finalScore: -3, villainEscaped: 1 });
      const result = evaluatePerRunBadges(breakdown);
      assert.deepStrictEqual(result, ['gameplay.sub-par-run']);
    });

    test('returns only pristine-defense when score >= 0', () => {
      const breakdown = makeBreakdown({ finalScore: 0, villainEscaped: 0 });
      const result = evaluatePerRunBadges(breakdown);
      assert.deepStrictEqual(result, ['gameplay.pristine-defense']);
    });

    test('returns empty array when neither eligible', () => {
      const breakdown = makeBreakdown({ finalScore: 5, villainEscaped: 2 });
      const result = evaluatePerRunBadges(breakdown);
      assert.deepStrictEqual(result, []);
    });

    test('never returns multiverse-mastery', () => {
      const breakdown = makeBreakdown({ finalScore: -100, villainEscaped: 0 });
      const result = evaluatePerRunBadges(breakdown);
      assert.equal(result.includes('gameplay.multiverse-mastery'), false);
    });
  });
});
