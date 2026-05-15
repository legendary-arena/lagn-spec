/**
 * Badge Predicates — Server Layer (WP-105)
 *
 * Pure predicate functions for evaluating per-run Tier 1 gameplay badge
 * eligibility from a `ScoreBreakdown`. No I/O, no clock reads, no
 * database access. Each predicate is a deterministic function of its
 * input — the same `ScoreBreakdown` produces the same result on every
 * call.
 *
 * Layer-boundary contract: this module imports only type definitions
 * from `@legendary-arena/game-engine`. No runtime engine imports, no
 * `boardgame.io`, no registry, no preplan, no vue-sfc-loader, no UI
 * packages, no `pg`.
 *
 * Authority: WP-105 §Scope (In) §B + §C; EC-160 §Locked Values +
 * §Guardrails; D-1004; D-0005 (anti-volume).
 */

import type {
  PenaltyEventType,
  ScoreBreakdown,
} from '@legendary-arena/game-engine';

/**
 * Canonical list of all `PenaltyEventType` keys that must be present
 * in `penaltyBreakdown` for a valid `ScoreBreakdown`. Used by the
 * structural validation in `validateScoreBreakdownShape`.
 */
const REQUIRED_PENALTY_KEYS: readonly PenaltyEventType[] = [
  'villainEscaped',
  'bystanderLost',
  'schemeTwistNegative',
  'mastermindTacticUntaken',
  'scenarioSpecificPenalty',
];

/**
 * Validate the structural shape of a deserialized `ScoreBreakdown`
 * before badge evaluation. Throws on invalid shape so callers
 * short-circuit before predicate evaluation with corrupted data.
 *
 * Checks:
 * - `finalScore` is a number
 * - `penaltyBreakdown` is an object containing all `PenaltyEventType` keys
 * - `scoringConfigVersion` is a number
 */
export function validateScoreBreakdownShape(breakdown: unknown): asserts breakdown is ScoreBreakdown {
  if (breakdown === null || typeof breakdown !== 'object') {
    throw new Error(
      'ScoreBreakdown deserialization failed: expected an object, received ' +
        (breakdown === null ? 'null' : typeof breakdown) +
        '.',
    );
  }
  const candidate = breakdown as Record<string, unknown>;

  if (typeof candidate.finalScore !== 'number') {
    throw new Error(
      'ScoreBreakdown deserialization failed: finalScore must be a number, received ' +
        typeof candidate.finalScore +
        '.',
    );
  }

  if (typeof candidate.scoringConfigVersion !== 'number') {
    throw new Error(
      'ScoreBreakdown deserialization failed: scoringConfigVersion must be a number, received ' +
        typeof candidate.scoringConfigVersion +
        '.',
    );
  }

  if (candidate.penaltyBreakdown === null || typeof candidate.penaltyBreakdown !== 'object') {
    throw new Error(
      'ScoreBreakdown deserialization failed: penaltyBreakdown must be an object.',
    );
  }

  const penaltyBreakdown = candidate.penaltyBreakdown as Record<string, unknown>;
  for (const key of REQUIRED_PENALTY_KEYS) {
    if (typeof penaltyBreakdown[key] !== 'number') {
      throw new Error(
        `ScoreBreakdown deserialization failed: penaltyBreakdown.${key} must be a number, received ${typeof penaltyBreakdown[key]}.`,
      );
    }
  }
}

/**
 * Sub-PAR Run: `finalScore < 0`.
 */
export function isEligibleSubParRun(breakdown: ScoreBreakdown): boolean {
  return breakdown.finalScore < 0;
}

/**
 * Pristine Defense: zero villain escapes in the penalty breakdown.
 */
export function isEligiblePristineDefense(breakdown: ScoreBreakdown): boolean {
  return breakdown.penaltyBreakdown.villainEscaped === 0;
}

// -----------------------------------------------------------------------
// Deferred badge predicates (not shipped — comment-only stubs)
// -----------------------------------------------------------------------

// why: gameplay.master-strike-ironwall is DEFERRED. No PenaltyEventType
// tracks Master Strike resolution count. `mastermindTacticUntaken`
// tracks untaken mastermind tactics, not Master Strikes. Shipping this
// badge requires either (a) adding a `masterStrikeResolved` penalty
// event to the engine scoring pipeline, or (b) sourcing the count from
// replay event log. Either path is out of scope for WP-105.

// why: gameplay.bystander-guardian is DEFERRED. The predicate requires
// total bystanders available per scenario, which is not stored in
// `ScoreBreakdown` or `competitive_scores`. Shipping requires a
// deterministic per-ScenarioKey lookup of available bystander count
// (likely from PAR config or match setup). Approximation is not
// acceptable per D-1004.

// why: gameplay.steady-crew is DEFERRED per PROPOSAL-BADGES.md. Depends
// on a registered-party concept that does not exist on the platform.

/**
 * Evaluate which per-run Tier 1 badges a single competitive submission
 * qualifies for. Returns an array of badge key strings.
 *
 * Returns ONLY `gameplay.sub-par-run` and `gameplay.pristine-defense`.
 * NEVER returns `gameplay.multiverse-mastery` — that badge is
 * history-evaluated and belongs in `evaluateHistoryBadges`.
 */
export function evaluatePerRunBadges(breakdown: ScoreBreakdown): string[] {
  const earned: string[] = [];

  if (isEligibleSubParRun(breakdown)) {
    earned.push('gameplay.sub-par-run');
  }

  if (isEligiblePristineDefense(breakdown)) {
    earned.push('gameplay.pristine-defense');
  }

  return earned;
}
