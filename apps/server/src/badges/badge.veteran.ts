/**
 * Veteran Badge Evaluation — Server Layer (WP-105)
 *
 * Evaluates history-based Tier 1 badges (multiverse-mastery + 4 veteran
 * badges) by querying the player's competitive-score history for
 * distinct sub-PAR scenario breadth. Threshold predicates are pure
 * functions of the queried count; the DB query itself is a single
 * `COUNT(DISTINCT scenario_key)` aggregate.
 *
 * Layer-boundary contract: no imports from `boardgame.io`,
 * `@legendary-arena/game-engine` (runtime), `@legendary-arena/registry`,
 * `@legendary-arena/preplan`, `@legendary-arena/vue-sfc-loader`, or any
 * UI package. The `pg` driver is reachable only through `DatabaseClient`.
 *
 * Authority: WP-105 §Scope (In) §C; EC-160 §Locked Values; D-1004;
 * D-0005 (anti-volume — breadth-gated, not volume-gated); D-0006
 * (veteran recognition).
 */

import type { DatabaseClient } from '../identity/identity.types.js';

// -----------------------------------------------------------------------
// Veteran thresholds (distinct sub-PAR scenario keys)
// -----------------------------------------------------------------------

// why: these badges are breadth-gated (distinct scenarios), not
// volume-gated (total submissions) per D-0005. 100 sub-PAR runs of the
// same scenario do not advance any of these badges. The thresholds are
// locked in EC-160 §Locked Values.

const MULTIVERSE_MASTERY_THRESHOLD = 5;
const SEASONED_DEFENDER_THRESHOLD = 10;
const DECADE_LEGEND_THRESHOLD = 25;
const HALL_OF_SUSTAINED_MASTERY_THRESHOLD = 50;
const CROSSROADS_OF_MULTIVERSE_THRESHOLD = 100;

/**
 * Evaluate which history-based Tier 1 badges a player qualifies for.
 * Queries `legendary.competitive_scores` for the count of distinct
 * `scenario_key` values where the player achieved a sub-PAR
 * (`final_score < 0`) completion.
 *
 * Returns `gameplay.multiverse-mastery` plus any veteran badges whose
 * thresholds are met. Returns an empty array when the player has
 * fewer than 5 distinct sub-PAR scenarios.
 *
 * Intentionally runs on every submission due to the low-frequency
 * submission pattern and simplicity tradeoff — the query is a single
 * `COUNT(DISTINCT scenario_key)` aggregate.
 */
export async function evaluateHistoryBadges(
  playerId: number,
  database: DatabaseClient,
): Promise<string[]> {
  const result = await database.query(
    'SELECT COUNT(DISTINCT scenario_key) AS distinct_count ' +
      'FROM legendary.competitive_scores ' +
      'WHERE player_id = $1 AND final_score < 0',
    [playerId],
  );

  const distinctCount =
    result.rows.length > 0
      ? Number(result.rows[0].distinct_count)
      : 0;

  const earned: string[] = [];

  if (distinctCount >= MULTIVERSE_MASTERY_THRESHOLD) {
    earned.push('gameplay.multiverse-mastery');
  }

  if (distinctCount >= SEASONED_DEFENDER_THRESHOLD) {
    earned.push('gameplay.veteran.seasoned-defender');
  }

  if (distinctCount >= DECADE_LEGEND_THRESHOLD) {
    earned.push('gameplay.veteran.decade-legend');
  }

  if (distinctCount >= HALL_OF_SUSTAINED_MASTERY_THRESHOLD) {
    earned.push('gameplay.veteran.hall-of-sustained-mastery');
  }

  if (distinctCount >= CROSSROADS_OF_MULTIVERSE_THRESHOLD) {
    earned.push('gameplay.veteran.crossroads-of-multiverse');
  }

  return earned;
}
