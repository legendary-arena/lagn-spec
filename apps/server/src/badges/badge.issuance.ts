/**
 * Badge Issuance — Server Layer (WP-105)
 *
 * `issueTier1BadgesForSubmission` is the sole entry point for Tier 1
 * badge issuance. It evaluates per-run predicates against the supplied
 * `ScoreBreakdown` and history predicates against the player's
 * competitive-score history, then issues qualifying badges via a single
 * multi-row INSERT with `ON CONFLICT DO NOTHING` (constraint inference).
 *
 * Layer-boundary contract: imports only type definitions from
 * `@legendary-arena/game-engine`. No runtime engine imports, no
 * `boardgame.io`, no registry, no preplan, no vue-sfc-loader, no UI
 * packages.
 *
 * Authority: WP-105 §Scope (In) §D; EC-160 §Locked Values +
 * §Guardrails; D-1004; D-5302 (append-only).
 */

import type { ScoreBreakdown } from '@legendary-arena/game-engine';

import type { DatabaseClient } from '../identity/identity.types.js';
import { validateScoreBreakdownShape, evaluatePerRunBadges } from './badge.predicates.js';
import { evaluateHistoryBadges } from './badge.veteran.js';

/**
 * Evaluate and issue Tier 1 badges for a competitive submission.
 *
 * Calls `evaluatePerRunBadges(breakdown)` for per-run badges and
 * `evaluateHistoryBadges(playerId, database)` for history-evaluated
 * badges (multiverse-mastery + veteran). Builds a single multi-row
 * INSERT with `ON CONFLICT DO NOTHING` (constraint inference — no
 * explicit conflict target) so both the composite UNIQUE and the
 * partial unique index suppress duplicates.
 *
 * MUST execute within the caller's transaction context. MUST NOT
 * open its own BEGIN/COMMIT.
 */
// why: the database parameter is the caller's transaction-scoped
// client. Badge issuance participates in the same transaction as the
// competitive-score INSERT so partial failures are atomic with the
// submission. This function MUST NOT open its own transaction — the
// caller (competition.logic.ts) owns the transaction boundary.
export async function issueTier1BadgesForSubmission(
  playerId: number,
  scoreId: number,
  breakdown: ScoreBreakdown,
  scenarioKey: string,
  configVersion: number,
  database: DatabaseClient,
): Promise<void> {
  validateScoreBreakdownShape(breakdown);

  const perRunKeys = evaluatePerRunBadges(breakdown);
  const historyKeys = await evaluateHistoryBadges(playerId, database);

  const allKeys = [...perRunKeys, ...historyKeys];
  if (allKeys.length === 0) {
    return;
  }

  const valueClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const badgeKey of allKeys) {
    const isPerRun = perRunKeys.includes(badgeKey);
    const sourceKind = isPerRun ? 'competitive_score' : 'competitive_history';
    const sourceRef = isPerRun ? scoreId : null;

    valueClauses.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`,
    );
    params.push(playerId, badgeKey, 1, sourceKind, sourceRef, configVersion);
    paramIndex += 6;
  }

  // why: ON CONFLICT DO NOTHING with constraint inference (no explicit
  // conflict target) so both UNIQUE constraints — the composite
  // (player_id, badge_key, source_ref) for per-run badges and the
  // partial index (player_id, badge_key) WHERE source_ref IS NULL for
  // veteran badges — can suppress duplicates. Explicit conflict target
  // would bind to only one constraint.
  const sql =
    'INSERT INTO legendary.player_badges ' +
    '(player_id, badge_key, tier, source_kind, source_ref, awarded_under_config_version) ' +
    'VALUES ' +
    valueClauses.join(', ') +
    ' ON CONFLICT DO NOTHING';

  await database.query(sql, params);
}
