/**
 * Pure helper that decides whether the active player can fight a city
 * villain or recruit an HQ hero given the current turn economy and the
 * card's display payload.
 *
 * Consumes WP-128 fields `economy.availableAttack` and
 * `economy.availableRecruit`, plus `UICardDisplay.cost` (added by WP-111).
 * Returns a `{ allowed, reason }` pair so binding sites (button
 * `aria-disabled` + `title`) can render the locked tooltip precedence
 * without re-deriving the message.
 *
 * Disabled-state tooltip precedence per EC-132 §3 (locked):
 *   (1) stage gating — owned by `useTurnActions`, not this composable
 *   (2) resource affordability — this composable's responsibility
 *   (3) structural lock (e.g., empty slot, mastermind defeated) — owned by
 *       individual SFCs
 *
 * @see WP-129 §Acceptance Criteria — cost gating
 * @see EC-132 §3 disabled-state tooltip precedence
 * @see WP-111 D-11104 (UICardDisplay.cost projection)
 */

import type { UICardDisplay, UITurnEconomyState } from '@legendary-arena/game-engine';

export interface GatingResult {
  /** True when the affordance is enabled; false when it should render disabled. */
  allowed: boolean;
  /**
   * Human-readable reason when `allowed === false`; null when allowed.
   * Bound by the caller's `aria-disabled` / `title` binding site.
   */
  reason: string | null;
}

const ALLOWED: GatingResult = { allowed: true, reason: null };

/**
 * Decide whether the active player can recruit a hero with the given
 * display data using the supplied turn economy. Returns disallowed when
 * `availableRecruit < hero.cost`. Heroes with `cost === null` (sidekicks,
 * non-recruitable artifacts) are treated as disallowed with a structural
 * reason.
 *
 * // why: cost gate consumes WP-128 `economy.availableRecruit`. The
 * structural-null branch protects HQ slots that hold non-recruitable
 * cards from rendering as enabled when the economy can technically
 * "afford" them.
 */
export function canRecruit(
  hero: UICardDisplay,
  economy: UITurnEconomyState,
): GatingResult {
  const cost = hero.cost;
  if (cost === null) {
    return {
      allowed: false,
      reason: 'This card is not recruitable.',
    };
  }
  if (economy.availableRecruit < cost) {
    return {
      allowed: false,
      reason: `Needs ${cost} recruit, you have ${economy.availableRecruit}.`,
    };
  }
  return ALLOWED;
}

/**
 * Decide whether the active player can fight a villain whose attack-cost
 * is the supplied display payload's `cost` field. Returns disallowed when
 * `availableAttack < villain.cost`. Villains with `cost === null` (e.g.,
 * non-fightable scenery cards if any future scenario projects them) are
 * treated as disallowed with a structural reason.
 *
 * // why: cost gate consumes WP-128 `economy.availableAttack`. The
 * structural-null branch protects city slots holding non-fightable cards
 * from rendering as enabled when the economy can technically "afford" them.
 */
export function canFight(
  villain: UICardDisplay,
  economy: UITurnEconomyState,
): GatingResult {
  const cost = villain.cost;
  if (cost === null) {
    return {
      allowed: false,
      reason: 'This card cannot be fought.',
    };
  }
  if (economy.availableAttack < cost) {
    return {
      allowed: false,
      reason: `Needs ${cost} attack, you have ${economy.availableAttack}.`,
    };
  }
  return ALLOWED;
}

/**
 * Composable wrapper exposing `canRecruit` / `canFight` over the supplied
 * economy. Returned as a plain object so SFC templates can bind directly
 * without further unwrapping.
 */
export function useCardCostGating(
  economy: UITurnEconomyState,
): {
  canRecruit: (hero: UICardDisplay) => GatingResult;
  canFight: (villain: UICardDisplay) => GatingResult;
} {
  return {
    canRecruit: (hero) => canRecruit(hero, economy),
    canFight: (villain) => canFight(villain, economy),
  };
}
