/**
 * Fight villain move for the Legendary Arena game engine.
 *
 * fightVillain removes a villain or henchman from a City space and places
 * it in the current player's victory pile. Follows the three-step
 * validation contract: validate args, check stage gate, mutate G.
 *
 * This is a non-core move that gates internally (same pattern as
 * revealVillainCard from WP-014A). It is NOT added to CoreMoveName,
 * CORE_MOVE_NAMES, or MOVE_ALLOWED_STAGES.
 *
 * No registry imports. No .reduce(). Moves never throw.
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import { awardAttachedBystanders } from '../board/bystanders.logic.js';
import { getAvailableAttack, spendAttack } from '../economy/economy.logic.js';
import { isGuardBlocking, getPatrolModifier } from '../board/boardKeywords.logic.js';
import { executeVillainAbilities } from '../villain/villainEffects.execute.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/** Arguments for the fightVillain move. */
interface FightVillainArgs {
  /** 0-based index of the City space to fight (0-4). */
  cityIndex: number;
}

/**
 * Fights a villain or henchman in the City.
 *
 * Removes the card from the specified City space and places it in the
 * current player's victory pile.
 *
 * @param context - boardgame.io move context with G, ctx.
 * @param args - The city space index to fight.
 */
export function fightVillain(
  { G, ctx }: MoveContext,
  { cityIndex }: FightVillainArgs,
): void {
  // Step 1: Validate args
  if (
    typeof cityIndex !== 'number' ||
    !Number.isFinite(cityIndex) ||
    !Number.isInteger(cityIndex) ||
    cityIndex < 0 ||
    cityIndex > 4
  ) {
    return;
  }

  const cardId = G.city[cityIndex];
  if (cardId === null || cardId === undefined) {
    return;
  }

  // why: Guard blocks access to lower-index City cards. A Guard at a higher
  // index (closer to escape) prevents fighting villains behind it. You must
  // defeat the Guard first. Guard check uses defensive access (G.cardKeywords
  // may be undefined in pre-WP-025 test states).
  const cardKeywords = G.cardKeywords ?? {};
  if (isGuardBlocking(G.city, cityIndex, cardKeywords)) {
    return;
  }

  // why: Patrol adds +1 to the fight cost (MVP additive modifier). The
  // patrol modifier is additive on top of the card's base fightCost.
  const baseFightCost = G.cardStats[cardId]?.fightCost ?? 0;
  const patrolModifier = getPatrolModifier(cardId, cardKeywords);
  const requiredFightCost = baseFightCost + patrolModifier;
  const availableAttack = getAvailableAttack(G.turnEconomy);
  if (availableAttack < requiredFightCost) {
    return;
  }

  // Step 2: Stage gate (non-core move, internal gating)
  // why: fighting happens during the main action window; non-core moves
  // gate internally per the WP-014A precedent
  if (G.currentStage !== 'main') return;

  // Step 3: Mutate G
  // why: MVP has no attack point check; WP-018 adds the economy. Any player
  // can fight any occupied City space without spending attack points.
  G.city[cityIndex] = null;
  G.playerZones[ctx.currentPlayer]!.victory.push(cardId);

  // Step 3b: Award attached bystanders to player's victory zone (WP-017)
  const victoryBefore = G.playerZones[ctx.currentPlayer]!.victory.length;
  const awardResult = awardAttachedBystanders(
    cardId,
    G.attachedBystanders,
    G.playerZones[ctx.currentPlayer]!.victory,
  );
  G.attachedBystanders = awardResult.attachedBystanders;
  G.playerZones[ctx.currentPlayer]!.victory = awardResult.playerVictory;

  G.turnEconomy = spendAttack(G.turnEconomy, requiredFightCost);

  // why: Fight: effects fire after the bystander award (Step 3b) and before
  // the message push, so they observe post-award pile state. A Fight:
  // captureBystander awards the newly attached bystander immediately (the card
  // is already in the victory pile), avoiding a stranded bystander (WP-185).
  executeVillainAbilities(G, ctx, cardId, 'onFight');

  G.messages.push(
    `Player ${ctx.currentPlayer} fought "${cardId}" at city space ${cityIndex}.`,
  );
  if (awardResult.playerVictory.length > victoryBefore) {
    G.messages.push(
      `Player ${ctx.currentPlayer} rescued ${awardResult.playerVictory.length - victoryBefore} bystander(s) from "${cardId}".`,
    );
  }
}
