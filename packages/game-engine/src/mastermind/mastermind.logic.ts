/**
 * Mastermind logic helpers for the Legendary Arena game engine.
 *
 * Pure functions for tactics deck manipulation and victory detection.
 * No boardgame.io imports. No .reduce(). No throws.
 */

import type { MastermindState } from './mastermind.types.js';

/**
 * Defeats the top tactic card from the tactics deck.
 *
 * Removes tacticsDeck[0] and appends it to tacticsDefeated.
 * Returns a new MastermindState — never mutates the input.
 *
 * If tacticsDeck is empty, returns the input unchanged.
 *
 * @param mastermindState - Current mastermind state.
 * @returns New MastermindState with the top tactic defeated.
 */
export function defeatTopTactic(
  mastermindState: MastermindState,
): MastermindState {
  if (mastermindState.tacticsDeck.length === 0) {
    return mastermindState;
  }

  const defeatedTactic = mastermindState.tacticsDeck[0]!;
  const remainingDeck = mastermindState.tacticsDeck.slice(1);
  const updatedDefeated = [...mastermindState.tacticsDefeated, defeatedTactic];

  // why: copy the prior state and override only the two deck fields so
  // non-deck fields (strikePile, attachedBystanders, gameText) survive the
  // defeat. An explicit field-by-field rebuild silently dropped gameText
  // when that field was added later (WP-154+); copy-then-override is
  // drift-proof against the next MastermindState field.
  return {
    ...mastermindState,
    tacticsDeck: remainingDeck,
    tacticsDefeated: updatedDefeated,
  };
}

/**
 * Checks whether all tactics have been defeated.
 *
 * Returns true only when the tactics deck is empty AND at least one
 * tactic has been defeated. An empty deck with no defeated tactics
 * (e.g., a mastermind with no tactics) returns false.
 *
 * @param mastermindState - Current mastermind state.
 * @returns true if all tactics are defeated.
 */
export function areAllTacticsDefeated(
  mastermindState: MastermindState,
): boolean {
  return (
    mastermindState.tacticsDeck.length === 0 &&
    mastermindState.tacticsDefeated.length > 0
  );
}
