/**
 * Core move implementations for the Legendary Arena game engine.
 *
 * Each move follows the three-step ordering:
 *   1. Validate args (call validator from WP-008A)
 *   2. Check stage gate (call validateMoveAllowedInStage from WP-008A)
 *   3. Mutate G (via zoneOps.ts helpers)
 *
 * Moves never throw. Invalid input causes an early return (void).
 * All randomness uses ctx.random exclusively — never Math.random().
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import type { DrawCardsArgs, PlayCardArgs } from './coreMoves.types.js';
import { validateDrawCardsArgs, validatePlayCardArgs, validateMoveAllowedInStage } from './coreMoves.validate.js';
import { moveCardFromZone, moveAllCards } from './zoneOps.js';
import { shuffleDeck } from '../setup/shuffle.js';
import { addResources } from '../economy/economy.logic.js';
import { executeHeroEffects } from '../hero/heroEffects.execute.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Draws cards from the active player's deck into their hand.
 *
 * If the deck is exhausted mid-draw and the discard pile has cards, the
 * discard pile is reshuffled into the deck and drawing continues.
 *
 * @param context - boardgame.io move context with G, events, random, playerID.
 * @param args - DrawCardsArgs payload with a count field.
 */
export function drawCards({ G, playerID, ...context }: MoveContext, args: DrawCardsArgs): void {
  // Step 1: Validate args
  const argsResult = validateDrawCardsArgs(args);
  if (!argsResult.ok) {
    return;
  }

  // Step 2: Check stage gate
  const stageResult = validateMoveAllowedInStage('drawCards', G.currentStage);
  if (!stageResult.ok) {
    return;
  }

  // Step 3: Mutate G
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return;
  }

  for (let cardsDrawn = 0; cardsDrawn < args.count; cardsDrawn++) {
    // If deck is empty, attempt reshuffle from discard
    if (playerZones.deck.length === 0) {
      if (playerZones.discard.length === 0) {
        // No cards available anywhere — stop drawing
        return;
      }

      // why: Reshuffling discard into deck is the standard Legendary rule
      // when the draw pile is exhausted. ctx.random ensures determinism —
      // identical seeds produce identical deck orders for replay.
      const reshuffled = moveAllCards(playerZones.discard, []);
      playerZones.discard = reshuffled.from;
      playerZones.deck = shuffleDeck(reshuffled.to, context);
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

/**
 * Plays a card from the active player's hand into their inPlay zone.
 *
 * @param context - boardgame.io move context with G, events, random, playerID.
 * @param args - PlayCardArgs payload with a cardId field.
 */
export function playCard({ G, playerID, ...context }: MoveContext, args: PlayCardArgs): void {
  // Step 1: Validate args
  const argsResult = validatePlayCardArgs(args);
  if (!argsResult.ok) {
    return;
  }

  // Step 2: Check stage gate
  const stageResult = validateMoveAllowedInStage('playCard', G.currentStage);
  if (!stageResult.ok) {
    return;
  }

  // Step 3: Mutate G
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return;
  }

  const result = moveCardFromZone(playerZones.hand, playerZones.inPlay, args.cardId);
  if (!result.found) {
    return;
  }

  playerZones.hand = result.from;
  playerZones.inPlay = result.to;

  // why: MVP adds base values only; conditional bonuses are WP-023
  const cardStats = G.cardStats[args.cardId];
  const heroAttack = cardStats ? cardStats.attack : 0;
  const heroRecruit = cardStats ? cardStats.recruit : 0;
  G.turnEconomy = addResources(G.turnEconomy, heroAttack, heroRecruit);

  // why: hero ability effects fire immediately after play, before any
  // fight/recruit actions. This preserves "play -> generate resources -> act."
  // Hero hook economy is additive to base card stats above (WP-022).
  executeHeroEffects(G, context, playerID, args.cardId);
}

/**
 * Ends the current player's turn by moving all cards to discard and
 * calling ctx.events.endTurn() to advance to the next player.
 *
 * @param context - boardgame.io move context with G, events, random, playerID.
 */
export function endTurn({ G, playerID, events }: MoveContext): void {
  // Step 1: Validate args (endTurn has no args — skip to stage gate)

  // Step 2: Check stage gate
  const stageResult = validateMoveAllowedInStage('endTurn', G.currentStage);
  if (!stageResult.ok) {
    return;
  }

  // why: turn cannot end while a player-choice reveal is pending; the player must
  // call resolveHeroChoice first. Guard precedes the zone sweep so a blocked turn
  // does not discard the hand (D-22002)
  if (G.pendingHeroChoice !== undefined) {
    return;
  }

  // Step 3: Mutate G
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return;
  }

  const inPlayResult = moveAllCards(playerZones.inPlay, playerZones.discard);
  playerZones.inPlay = inPlayResult.from;
  playerZones.discard = inPlayResult.to;

  const handResult = moveAllCards(playerZones.hand, playerZones.discard);
  playerZones.hand = handResult.from;
  playerZones.discard = handResult.to;

  // why: boardgame.io manages player rotation via ctx.events.endTurn().
  // Manual player index rotation is forbidden — the framework handles
  // advancing to the next player and resetting turn state.
  events.endTurn();
}
