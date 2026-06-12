/**
 * Start-of-turn draw primitive for the Legendary Arena game engine.
 *
 * Exports the canonical HAND_SIZE constant and drawCardsIntoHand — the
 * single deck-to-hand fill-with-reshuffle helper shared by the drawCards
 * move, the rule-effect applier (applyDrawCards), the play-phase onBegin
 * auto-draw, and the runFixture replay harness. Consolidating the four
 * call sites onto one helper keeps the draw mechanics identical everywhere.
 *
 * Pure helper — no game-framework import, no I/O, no Math.random(), no
 * .reduce(). Deterministic given the supplied shuffle context: the same
 * deck/discard contents and the same context.random.Shuffle produce the
 * same result, which is what replay reproducibility requires.
 */

import type { PlayerZones } from '../state/zones.types.js';
import { shuffleDeck, type ShuffleProvider } from '../setup/shuffle.js';
import { moveCardFromZone, moveAllCards } from './zoneOps.js';

// why: canonical start-of-turn hand size — the single source of truth for
// how many cards a player draws at the start of their turn. Cross-checked
// against docs/ai/REFERENCE/00.2-data-requirements.md. No other file may
// hardcode the literal 6 for hand size. (Magneto's MAGNETO_HAND_SIZE_LIMIT
// is a separate mastermind hand cap and is not derived from this constant.)
export const HAND_SIZE = 6;

/**
 * Moves up to `count` cards from the player's deck into their hand.
 *
 * Draws one card at a time off the top of the deck. When the deck is
 * exhausted mid-draw and the discard pile still has cards, the discard is
 * reshuffled into the deck (via the engine's deterministic shuffleDeck) and
 * drawing continues. Stops early when no cards remain anywhere — a draw can
 * legitimately move fewer than `count` cards.
 *
 * Mutates the passed `playerZones` in place (matching the existing move and
 * rule-effect mutation style). The shuffle context is any object exposing a
 * deterministic `random.Shuffle`; the reshuffle never introduces a new
 * randomness source.
 *
 * @param playerZones - The active player's zones; deck/hand/discard mutated.
 * @param count - The maximum number of cards to draw (may be 0).
 * @param shuffleContext - Provides the deterministic reshuffle (random.Shuffle).
 */
export function drawCardsIntoHand(
  playerZones: PlayerZones,
  count: number,
  shuffleContext: ShuffleProvider,
): void {
  for (let cardsDrawn = 0; cardsDrawn < count; cardsDrawn++) {
    // If the deck is empty, attempt to reshuffle the discard back into it.
    if (playerZones.deck.length === 0) {
      if (playerZones.discard.length === 0) {
        // No cards available anywhere — stop drawing.
        return;
      }

      // why: reshuffling the discard into the deck is the standard Legendary
      // rule when the draw pile is exhausted. The reshuffle uses the supplied
      // deterministic shuffleDeck so identical seeds produce identical deck
      // orders for replay — never Math.random().
      const reshuffled = moveAllCards(playerZones.discard, []);
      playerZones.discard = reshuffled.from;
      playerZones.deck = shuffleDeck(reshuffled.to, shuffleContext);
    }

    const topCard = playerZones.deck[0];
    if (!topCard) {
      return;
    }

    const result = moveCardFromZone(playerZones.deck, playerZones.hand, topCard);
    playerZones.deck = result.from;
    playerZones.hand = result.to;
  }
}
