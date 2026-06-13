/**
 * Recruit hero move for the Legendary Arena game engine.
 *
 * recruitHero removes a hero from an HQ slot and places it in the current
 * player's discard pile. Follows the three-step validation contract:
 * validate args, check stage gate, mutate G.
 *
 * This is a non-core move that gates internally (same pattern as
 * revealVillainCard from WP-014A). It is NOT added to CoreMoveName,
 * CORE_MOVE_NAMES, or MOVE_ALLOWED_STAGES.
 *
 * No registry imports. No .reduce(). Moves never throw.
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import { getAvailableRecruit, spendRecruit } from '../economy/economy.logic.js';
import { refillHqSlot } from '../board/city.logic.js';
import { hasPendingKoHeroChoice } from './koHeroChoice.resolve.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/** Arguments for the recruitHero move. */
interface RecruitHeroArgs {
  /** 0-based index of the HQ slot to recruit from (0-4). */
  hqIndex: number;
}

/**
 * Recruits a hero from the HQ.
 *
 * Removes the card from the specified HQ slot and places it in the
 * current player's discard pile.
 *
 * @param context - boardgame.io move context with G, ctx.
 * @param args - The HQ slot index to recruit from.
 */
export function recruitHero(
  { G, ctx }: MoveContext,
  { hqIndex }: RecruitHeroArgs,
): void {
  // Step 1: Validate args
  if (
    typeof hqIndex !== 'number' ||
    !Number.isFinite(hqIndex) ||
    !Number.isInteger(hqIndex) ||
    hqIndex < 0 ||
    hqIndex > 4
  ) {
    return;
  }

  const cardId = G.hq[hqIndex];
  if (cardId === null || cardId === undefined) {
    return;
  }

  // why: silent failure preserves deterministic move contract — insufficient
  // recruit points means the recruit cannot proceed
  const requiredCost = G.cardStats[cardId]?.cost ?? 0;
  const availableRecruit = getAvailableRecruit(G.turnEconomy);
  if (availableRecruit < requiredCost) {
    return;
  }

  // Step 2: Stage gate (non-core move, internal gating)
  // why: recruiting happens during the main action window; non-core moves
  // gate internally per the WP-014A precedent
  if (G.currentStage !== 'main') return;

  // why: block-all guard (D-24008) — while a KO-a-Hero choice is pending the
  // board is frozen; recruitHero returns with no side effects. Placed
  // immediately after the stage gate, before any G/zone write.
  if (hasPendingKoHeroChoice(G)) return;

  // Step 3: Mutate G
  // why: WP-018 — economy deduction lands first; WP-135 — HQ slot refill
  // lands after the discard append. The slot is vacated by refillHqSlot
  // (which assigns null when heroDeck is empty per D-13503), so we must
  // not pre-null G.hq[hqIndex] here.
  G.playerZones[ctx.currentPlayer]!.discard.push(cardId);
  G.turnEconomy = spendRecruit(G.turnEconomy, requiredCost);

  // why: WP-135 — refill the vacated slot from G.heroDeck (FIFO via shift).
  // Empty-deck case leaves the slot null per D-13503; no auto-reshuffle of
  // recruited cards back into the deck (separate engine WP if ever needed).
  const refillResult = refillHqSlot(G.hq, hqIndex, G.heroDeck);
  G.hq = refillResult.hq;
  G.heroDeck = refillResult.heroDeck;

  // why: WP-135 — log line is replay-visible and snapshotted; format is
  // locked at this site to byte-equality. Replaces the pre-WP-135 line
  // shape from WP-016 (one push per successful recruit, not two). Never
  // add timestamps or non-deterministic context. The empty-deck branch
  // substitutes the trailing parenthetical per the §7.6 byte-locked format.
  const refillSuffix =
    refillResult.hq[hqIndex] === null
      ? '(heroDeck empty; slot left null)'
      : `(heroDeck.length: ${String(refillResult.heroDeck.length)})`;
  G.messages.push(
    `Player ${ctx.currentPlayer} recruited ${cardId}; HQ slot ${String(hqIndex)} refilled from heroDeck ${refillSuffix}`,
  );
}
