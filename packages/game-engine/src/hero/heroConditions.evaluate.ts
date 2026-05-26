/**
 * Hero condition evaluation for the Legendary Arena game engine.
 *
 * Evaluates declarative hero ability conditions against current game state.
 * Pure functions only — conditions read G and return boolean, never mutating
 * state. Unsupported condition types return false (safe skip).
 *
 * WP-179: heroClassMatch and requiresTeam are fully wired against G.cardTraits.
 * requiresKeyword and playedThisTurn are unchanged from WP-023.
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 */

import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { HeroCondition } from '../rules/heroAbility.types.js';
import { getHooksForCard } from '../rules/heroAbility.types.js';

// ---------------------------------------------------------------------------
// evaluateCondition — single condition evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates a single hero ability condition against current game state.
 *
 * Pure function: reads G, returns boolean, never mutates state.
 * Unsupported condition types return false (safe skip).
 *
 * @param G - Current game state (read-only).
 * @param playerID - Active player ID.
 * @param condition - The condition descriptor to evaluate.
 * @param triggeringCardId - Optional CardExtId of the card whose superpower is
 *   being evaluated. When provided, heroClassMatch and requiresTeam exclude
 *   this card from the inPlay scan (self-exclusion rule).
 * @returns Whether the condition is met.
 */
export function evaluateCondition(
  G: LegendaryGameState,
  playerID: string,
  condition: HeroCondition,
  triggeringCardId?: CardExtId,
): boolean {
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return false;
  }

  switch (condition.type) {
    case 'heroClassMatch': {
      // why: self is excluded from scan — a card's own class does not satisfy
      // its own superpower. The physical card game rule requires *another*
      // card of the same class to have been played this turn.
      if (!G.cardTraits) {
        return false;
      }

      for (const playedCardId of playerZones.inPlay) {
        if (triggeringCardId !== undefined && playedCardId === triggeringCardId) {
          continue;
        }
        const traitEntry = G.cardTraits[playedCardId as CardExtId];
        if (traitEntry !== undefined && traitEntry.heroClass === condition.value) {
          return true;
        }
      }

      return false;
    }

    case 'requiresTeam': {
      // why: self is excluded from scan — a card's own team does not satisfy
      // its own superpower. Same self-exclusion logic as heroClassMatch.
      if (!G.cardTraits) {
        return false;
      }

      for (const playedCardId of playerZones.inPlay) {
        if (triggeringCardId !== undefined && playedCardId === triggeringCardId) {
          continue;
        }
        const traitEntry = G.cardTraits[playedCardId as CardExtId];
        if (traitEntry !== undefined && traitEntry.team === condition.value) {
          return true;
        }
      }

      return false;
    }

    case 'requiresKeyword': {
      // why: evaluates keyword synergy — checks if any played card has
      // hooks with the specified keyword. Uses G.heroAbilityHooks which
      // is built at setup time and available at runtime.
      if (!G.heroAbilityHooks) {
        return false;
      }

      const targetKeyword = condition.value;

      for (const cardId of playerZones.inPlay) {
        const hooksForCard = getHooksForCard(G.heroAbilityHooks, cardId);
        for (const hook of hooksForCard) {
          for (const keyword of hook.keywords) {
            if (keyword === targetKeyword) {
              return true;
            }
          }
        }
      }

      return false;
    }

    case 'playedThisTurn': {
      // why: condition.value is always a string per HeroCondition contract
      // — parse to number for threshold comparison. Returns false if
      // parseInt produces NaN (safe skip for malformed data).
      const threshold = parseInt(condition.value, 10);
      if (Number.isNaN(threshold)) {
        return false;
      }

      return playerZones.inPlay.length >= threshold;
    }

    default: {
      // why: unsupported condition types are safely skipped — same pattern
      // as WP-022 for unsupported keywords. Future WPs will add new
      // condition types by extending this switch.
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// evaluateAllConditions — AND logic over all conditions
// ---------------------------------------------------------------------------

/**
 * Evaluates all conditions on a hero ability hook (AND logic).
 *
 * Returns true only if ALL conditions pass. Empty or undefined conditions
 * array returns true (unconditional effect).
 *
 * @param G - Current game state (read-only).
 * @param playerID - Active player ID.
 * @param conditions - Array of conditions to evaluate (may be undefined).
 * @param triggeringCardId - Optional CardExtId forwarded to each evaluateCondition call.
 * @returns Whether all conditions are met.
 */
export function evaluateAllConditions(
  G: LegendaryGameState,
  playerID: string,
  conditions: HeroCondition[] | undefined,
  triggeringCardId?: CardExtId,
): boolean {
  if (conditions === undefined || conditions.length === 0) {
    return true;
  }

  for (const condition of conditions) {
    if (!evaluateCondition(G, playerID, condition, triggeringCardId)) {
      return false;
    }
  }

  return true;
}
