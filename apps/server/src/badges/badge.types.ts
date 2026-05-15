/**
 * Player Badge Types — Server Layer (WP-105)
 *
 * Durable contracts for the Tier 1 gameplay badge surface introduced
 * by WP-105 per D-1004 (Badge Issuer Model Is Tiered; Gameplay Badges
 * Ship First). These types form the read-shape consumed by the profile
 * integration (WP-102 public + WP-104 owner) and the issuance hook in
 * `competition.logic.ts`.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`.
 *
 * Authority: WP-105 §Scope (In) §B; EC-160 §Locked Values; D-1004.
 */

/**
 * Row shape returned by `getPlayerBadges` from
 * `legendary.player_badges`. Maps 1:1 to the database columns per
 * WP-105 §Scope (In) §A. `badgeId` is the bigserial PK; `awardedAt`
 * is an ISO 8601 string (coerced from `timestamptz` by the mapper).
 */
export interface PlayerBadge {
  readonly badgeId: number;
  readonly badgeKey: string;
  readonly tier: number;
  readonly sourceKind: string;
  readonly sourceRef: number | null;
  readonly awardedAt: string;
  readonly awardedUnderConfigVersion: number;
  readonly isRevoked: boolean;
}

/**
 * Static definition of a Tier 1 gameplay badge. Keyed by `badgeKey`
 * in the `BADGE_DEFINITIONS` Map for O(1) lookup during profile
 * composition.
 */
export interface BadgeDefinition {
  readonly badgeKey: string;
  readonly tier: 1;
  readonly sourceKind: 'competitive_score' | 'competitive_history';
  readonly label: string;
  readonly description: string;
}

/**
 * Canonical readonly array of all 7 shipping Tier 1 badge keys.
 * Drift-detection test in `badge.predicates.test.ts` asserts this
 * array contains exactly 7 entries matching the expected set.
 *
 * Deferred badges (not in this array):
 * - gameplay.master-strike-ironwall — no PenaltyEventType for Master Strike resolution
 * - gameplay.bystander-guardian — no per-scenario bystander count in ScoreBreakdown
 * - gameplay.steady-crew — no registered-party concept on platform
 */
export const TIER_1_BADGE_KEYS: readonly string[] = [
  'gameplay.sub-par-run',
  'gameplay.pristine-defense',
  'gameplay.multiverse-mastery',
  'gameplay.veteran.seasoned-defender',
  'gameplay.veteran.decade-legend',
  'gameplay.veteran.hall-of-sustained-mastery',
  'gameplay.veteran.crossroads-of-multiverse',
] as const;

/** Type alias for badge key strings. */
export type BadgeKey = (typeof TIER_1_BADGE_KEYS)[number];

/**
 * Readonly Map of all Tier 1 badge definitions keyed by `badgeKey`.
 * Order-preserving 1:1 mapping with `TIER_1_BADGE_KEYS`. Used by
 * profile logic for O(1) lookup when mapping `PlayerBadge` rows to
 * `PlayerBadgeSummary` projections.
 */
export const BADGE_DEFINITIONS: ReadonlyMap<string, BadgeDefinition> = new Map<string, BadgeDefinition>([
  [
    'gameplay.sub-par-run',
    {
      badgeKey: 'gameplay.sub-par-run',
      tier: 1,
      sourceKind: 'competitive_score',
      label: 'Sub-PAR Run',
      description: 'Completed a scenario with a final score below the published PAR baseline.',
    },
  ],
  [
    'gameplay.pristine-defense',
    {
      badgeKey: 'gameplay.pristine-defense',
      tier: 1,
      sourceKind: 'competitive_score',
      label: 'Pristine Defense',
      description: 'Completed a scenario with zero villain escapes.',
    },
  ],
  [
    'gameplay.multiverse-mastery',
    {
      badgeKey: 'gameplay.multiverse-mastery',
      tier: 1,
      sourceKind: 'competitive_history',
      label: 'Multiverse Mastery',
      description: 'Completed at least 5 distinct scenarios with a final score below PAR.',
    },
  ],
  [
    'gameplay.veteran.seasoned-defender',
    {
      badgeKey: 'gameplay.veteran.seasoned-defender',
      tier: 1,
      sourceKind: 'competitive_history',
      label: 'Seasoned Defender',
      description: 'Achieved sub-PAR completions on at least 10 distinct scenarios.',
    },
  ],
  [
    'gameplay.veteran.decade-legend',
    {
      badgeKey: 'gameplay.veteran.decade-legend',
      tier: 1,
      sourceKind: 'competitive_history',
      label: 'Decade Legend',
      description: 'Achieved sub-PAR completions on at least 25 distinct scenarios.',
    },
  ],
  [
    'gameplay.veteran.hall-of-sustained-mastery',
    {
      badgeKey: 'gameplay.veteran.hall-of-sustained-mastery',
      tier: 1,
      sourceKind: 'competitive_history',
      label: 'Hall of Sustained Mastery',
      description: 'Achieved sub-PAR completions on at least 50 distinct scenarios.',
    },
  ],
  [
    'gameplay.veteran.crossroads-of-multiverse',
    {
      badgeKey: 'gameplay.veteran.crossroads-of-multiverse',
      tier: 1,
      sourceKind: 'competitive_history',
      label: 'Crossroads of the Multiverse',
      description: 'Achieved sub-PAR completions on at least 100 distinct scenarios.',
    },
  ],
]);
