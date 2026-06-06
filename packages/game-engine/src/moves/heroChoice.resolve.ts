/**
 * resolveHeroChoice move — resolves a pending hero reveal player choice.
 *
 * Called by the active player after reveal-attack-choose sets G.pendingHeroChoice.
 * Moves the revealed card to discard ('discard') or leaves it at deck[0] ('return'),
 * then clears G.pendingHeroChoice. All invalid states are silent no-ops (moves never throw).
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import { moveCardFromZone } from './zoneOps.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Payload for the resolveHeroChoice move.
 *
 * 'discard': move the revealed card from deck to discard.
 * 'return': leave the card at deck[0]; no zone mutation.
 */
export interface ResolveHeroChoiceArgs {
  resolution: 'discard' | 'return';
}

/**
 * Resolves a pending hero reveal choice (discard the revealed card or return
 * it to the top of the deck), then clears G.pendingHeroChoice.
 *
 * Silent no-ops: unknown resolution, no pending choice, wrong playerID, wrong choiceType.
 *
 * @param context - boardgame.io move context with G and playerID.
 * @param args - the resolution choice ('discard' | 'return').
 */
export function resolveHeroChoice({ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs): void {
  // Step 1: Validate args — unknown resolution is a silent no-op (moves never throw)
  if (args.resolution !== 'discard' && args.resolution !== 'return') { return; }
  // Step 2: Validate pending state — no-op if no pending choice, wrong player, or wrong type
  if (!G.pendingHeroChoice) { return; }
  if (G.pendingHeroChoice.playerID !== playerID) { return; }
  if (G.pendingHeroChoice.choiceType !== 'discard-or-return') { return; }
  // Step 3: Mutate G — clear pending FIRST so it is cleared even if the zone move fails
  const pendingChoice = G.pendingHeroChoice;
  // why: pending choice is always cleared before return, even when moveResult.found is
  // false, so a stale pending state can never wedge the turn-end guard (D-22002)
  G.pendingHeroChoice = undefined;
  if (args.resolution === 'discard') {
    const playerZones = G.playerZones[playerID];
    if (!playerZones) { return; }
    const moveResult = moveCardFromZone(playerZones.deck, playerZones.discard, pendingChoice.cardId);
    if (moveResult.found) {
      playerZones.deck = moveResult.from;
      playerZones.discard = moveResult.to;
    }
  }
  // args.resolution === 'return': card already at deck[0]; no mutation needed.
}
