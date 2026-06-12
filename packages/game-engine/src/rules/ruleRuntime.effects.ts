/**
 * Effect applicator for the Legendary Arena rule execution pipeline.
 *
 * applyRuleEffects applies RuleEffect[] to G deterministically using
 * for...of. Each effect type has a dedicated handler. Unknown effect types
 * push a warning to G.messages — they never throw.
 *
 * No boardgame.io imports. No .reduce(). No throw.
 */

import type { RuleEffect } from './ruleHooks.types.js';
import type { LegendaryGameState } from '../types.js';
import { moveAllCards } from '../moves/zoneOps.js';
import { drawCardsIntoHand } from '../moves/drawCards.logic.js';

/**
 * Minimal interface for the context needed by drawCards effect.
 *
 * Narrower than the full boardgame.io Ctx — only requires the
 * deterministic shuffle capability needed for deck reshuffle.
 */
interface EffectContext {
  random: { Shuffle: <T>(deck: T[]) => T[] };
}

/**
 * Applies a queueMessage effect by pushing the message to G.messages.
 *
 * @param gameState - The game state to mutate.
 * @param effect - The queueMessage effect to apply.
 */
function applyQueueMessage(
  gameState: LegendaryGameState,
  effect: { type: 'queueMessage'; message: string },
): void {
  gameState.messages.push(effect.message);
}

/**
 * Applies a modifyCounter effect by adding delta to the named counter.
 *
 * @param gameState - The game state to mutate.
 * @param effect - The modifyCounter effect to apply.
 */
function applyModifyCounter(
  gameState: LegendaryGameState,
  effect: { type: 'modifyCounter'; counter: string; delta: number },
): void {
  gameState.counters[effect.counter] =
    (gameState.counters[effect.counter] ?? 0) + effect.delta;
}

/**
 * Applies a drawCards effect by moving cards from deck to hand.
 *
 * Delegates the deck-to-hand fill (with discard reshuffle on exhaustion)
 * to the shared drawCardsIntoHand primitive — the same primitive used by
 * the drawCards move and the play-phase onBegin auto-draw, so there is one
 * draw mechanism across the engine. This is the hero `draw` keyword path;
 * it deliberately does NOT consult G.hasDrawnThisTurn, so a card-effect
 * draw is never blocked by the move's once-per-turn guard. The caller owns
 * the player-not-found diagnostic; the helper owns the draw.
 *
 * @param gameState - The game state to mutate.
 * @param effect - The drawCards effect to apply.
 * @param ctx - Context providing deterministic shuffle.
 */
function applyDrawCards(
  gameState: LegendaryGameState,
  effect: { type: 'drawCards'; playerId: string; count: number },
  ctx: EffectContext,
): void {
  const playerZones = gameState.playerZones[effect.playerId];
  if (!playerZones) {
    gameState.messages.push(
      `Draw effect skipped: player "${effect.playerId}" not found in playerZones.`,
    );
    return;
  }

  drawCardsIntoHand(playerZones, effect.count, ctx);
}

/**
 * Applies a discardHand effect by moving all hand cards to discard.
 *
 * @param gameState - The game state to mutate.
 * @param effect - The discardHand effect to apply.
 */
function applyDiscardHand(
  gameState: LegendaryGameState,
  effect: { type: 'discardHand'; playerId: string },
): void {
  const playerZones = gameState.playerZones[effect.playerId];
  if (!playerZones) {
    gameState.messages.push(
      `Discard hand effect skipped: player "${effect.playerId}" not found in playerZones.`,
    );
    return;
  }

  const moveResult = moveAllCards(playerZones.hand, playerZones.discard);
  playerZones.hand = moveResult.from;
  playerZones.discard = moveResult.to;
}

/**
 * Applies an array of RuleEffect descriptions to the game state.
 *
 * Effects are applied in sequence using for...of. Each effect type is
 * handled by a dedicated function. Unknown effect types push a warning
 * to G.messages and continue — they never throw.
 *
 * @param gameState - The game state to mutate.
 * @param ctx - Context providing deterministic shuffle (for drawCards).
 * @param effects - Array of RuleEffect descriptions to apply in order.
 * @returns The mutated game state (same reference as input).
 */
export function applyRuleEffects(
  gameState: LegendaryGameState,
  ctx: unknown,
  effects: RuleEffect[],
): LegendaryGameState {
  for (const effect of effects) {
    if (effect.type === 'queueMessage') {
      applyQueueMessage(gameState, effect);
    } else if (effect.type === 'modifyCounter') {
      applyModifyCounter(gameState, effect);
    } else if (effect.type === 'drawCards') {
      applyDrawCards(gameState, effect, ctx as EffectContext);
    } else if (effect.type === 'discardHand') {
      applyDiscardHand(gameState, effect);
    } else {
      // why: Unknown effect types are handled gracefully rather than thrown.
      // New effect types added in later packets should fail gracefully in
      // older runtime versions rather than crashing the game.
      const unknownType = (effect as { type: string }).type;
      gameState.messages.push(
        `Unknown rule effect type "${unknownType}" was skipped.`,
      );
    }
  }

  return gameState;
}
