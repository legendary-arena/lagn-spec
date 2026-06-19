/**
 * Shared play-phase onBegin parity for the observation-only harnesses.
 *
 * The boardgame.io play-phase `onBegin` hook (game.ts) runs at the start of
 * every player turn: it resets the two once-per-turn allowance flags
 * (`villainRevealedThisTurn`, `hasDrawnThisTurn`) and auto-draws the active
 * player's hand up to `HAND_SIZE`. None of the engine's three non-framework
 * per-turn loops run that hook, so each must mirror it manually:
 *
 *   - the simulation runner (`simulation.runner.ts`),
 *   - the PAR aggregator (`par.aggregator.ts`),
 *   - the replay fixture harness (`runFixture.ts`).
 *
 * The replay harness already mirrored onBegin inline (WP-212 reveal reset +
 * WP-236 auto-draw); the simulation runner and PAR aggregator did not, so
 * their bot hands were never refilled and `playCard` was never legal. This
 * module is the single shared implementation all three call — extracted at the
 * third use, per the "abstract on the third copy" code-style rule.
 *
 * Pure helper: no boardgame.io import, no I/O, no `Math.random()`. Determinism
 * is the caller's: it supplies the `ShuffleProvider` whose `random.Shuffle`
 * draws from the harness's own seeded PRNG stream, so the reshuffle on deck
 * exhaustion stays reproducible.
 */

import type { LegendaryGameState } from '../types.js';
import type { ShuffleProvider } from '../setup/shuffle.js';
import { HAND_SIZE, drawCardsIntoHand } from '../moves/drawCards.logic.js';

/**
 * Mirrors the play-phase onBegin hook for one turn start: resets the two
 * once-per-turn allowance flags and auto-draws the active player's hand up to
 * HAND_SIZE.
 *
 * why: rule-hook firing (onTurnStart) is intentionally NOT mirrored — the three
 * callers are observation-only and defer rule hooks (D-0205). Stage/economy
 * reset stays with the callers (they already do it); this helper owns only the
 * flag reset + auto-draw part of onBegin.
 *
 * @param gameState - the live per-game state; the two flags + the active
 *   player's hand/deck/discard are mutated in place.
 * @param playerId - the seat whose turn is beginning (the player to draw for).
 * @param shuffleProvider - supplies the deterministic `random.Shuffle` used to
 *   reshuffle the discard into the deck on exhaustion; sourced from the
 *   caller's own seeded PRNG so replay/sim determinism holds.
 */
export function applyOnBeginParity(
  gameState: LegendaryGameState,
  playerId: string,
  shuffleProvider: ShuffleProvider,
): void {
  // why: the once-per-turn villain reveal allowance refreshes at the start of
  // every player turn; without this the move-level reveal guard (and the
  // legal-moves reveal gate) would permanently block reveals from turn 2 on.
  gameState.villainRevealedThisTurn = false;
  // why: the once-per-turn draw allowance refreshes at the start of every turn;
  // it is set true again below after the auto-draw so a later drawCards
  // submission is a guarded no-op (mirrors onBegin).
  gameState.hasDrawnThisTurn = false;
  const activePlayerZones = gameState.playerZones[playerId];
  if (activePlayerZones) {
    const cardsToDraw = Math.max(0, HAND_SIZE - activePlayerZones.hand.length);
    drawCardsIntoHand(activePlayerZones, cardsToDraw, shuffleProvider);
    gameState.hasDrawnThisTurn = true;
  }
}
