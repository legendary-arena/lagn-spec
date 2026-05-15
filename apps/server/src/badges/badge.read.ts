/**
 * Badge Read Surface — Server Layer (WP-105)
 *
 * `getPlayerBadges` returns non-revoked badges for a player, ordered
 * by `awarded_at DESC` (most recent first). Side-effect free, no
 * caching. All reads are direct from DB.
 *
 * Layer-boundary contract: no imports from `boardgame.io`,
 * `@legendary-arena/game-engine`, `@legendary-arena/registry`,
 * `@legendary-arena/preplan`, `@legendary-arena/vue-sfc-loader`, or
 * any UI package.
 *
 * Authority: WP-105 §Scope (In) §E; EC-160 §Guardrails.
 */

import type { DatabaseClient } from '../identity/identity.types.js';
import type { PlayerBadge } from './badge.types.js';

/**
 * Internal row shape returned by the badge SELECT. Mapped to
 * `PlayerBadge` by the caller loop.
 */
interface PlayerBadgeRow {
  badge_id: number | string;
  badge_key: string;
  tier: number;
  source_kind: string;
  source_ref: number | string | null;
  awarded_at: Date | string;
  awarded_under_config_version: number;
  is_revoked: boolean;
}

/**
 * Read all non-revoked badges for a player, ordered by `awarded_at
 * DESC`. Returns an empty array when the player has no badges.
 * Side-effect free — no caching, no writes.
 */
export async function getPlayerBadges(
  playerId: number,
  database: DatabaseClient,
): Promise<PlayerBadge[]> {
  const result = await database.query(
    'SELECT badge_id, badge_key, tier, source_kind, source_ref, ' +
      'awarded_at, awarded_under_config_version, is_revoked ' +
      'FROM legendary.player_badges ' +
      'WHERE player_id = $1 AND is_revoked = false ' +
      'ORDER BY awarded_at DESC',
    [playerId],
  );

  const badges: PlayerBadge[] = [];
  for (const row of result.rows as PlayerBadgeRow[]) {
    badges.push({
      badgeId:
        typeof row.badge_id === 'string'
          ? Number(row.badge_id)
          : row.badge_id,
      badgeKey: row.badge_key,
      tier: row.tier,
      sourceKind: row.source_kind,
      sourceRef:
        row.source_ref === null
          ? null
          : typeof row.source_ref === 'string'
            ? Number(row.source_ref)
            : row.source_ref,
      awardedAt:
        row.awarded_at instanceof Date
          ? row.awarded_at.toISOString()
          : row.awarded_at,
      awardedUnderConfigVersion: row.awarded_under_config_version,
      isRevoked: row.is_revoked,
    });
  }

  return badges;
}
