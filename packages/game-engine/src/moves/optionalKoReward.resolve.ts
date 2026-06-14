/**
 * resolveOptionalKoReward move — resolves a pending optional-KO-then-reward
 * player choice (WP-248 / D-24019).
 *
 * Called by the active player after an optional-ko-reward hero ability parked a
 * PendingOptionalKoReward on G.pendingOptionalKoRewards (FIFO). The player
 * either declines (no KO, no reward) or KOs exactly one card from their hand or
 * discard pile, in which case the reward is dispatched to the ALREADY-BUILT
 * reward executor (rescue / draw / attack / recruit via executeSingleEffect) —
 * no re-implementation.
 *
 * Atomicity is exact: the reward fires ONLY after the KO actually removes a
 * card from its zone. Decline pops the queue with no KO and no reward. A
 * stale/absent target is a silent no-op that leaves the queue intact so the
 * player can resubmit (the block-all guard guarantees a valid target still
 * exists while pending).
 *
 * Unlike koHeroChoice.resolve.ts, this move destructures `context` because the
 * dispatched `draw` reward needs ctx.random for its deck reshuffle.
 *
 * No registry imports. No .reduce(). Moves never throw.
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import { moveCardFromZone } from './zoneOps.js';
import { koCard } from '../board/ko.logic.js';
import { executeSingleEffect } from '../hero/heroEffects.execute.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Payload for the resolveOptionalKoReward move.
 *
 * Exactly one shape is valid per call:
 * - { decline: true } — decline the choice (no KO, no reward).
 * - { zone, cardId } — KO the named hand/discard card, then take the reward.
 */
export type ResolveOptionalKoRewardArgs =
  | { decline: true }
  | { zone: 'hand' | 'discard'; cardId: CardExtId };

/**
 * Whether any optional-KO-reward choice is currently pending.
 *
 * Single predicate imported by the block-all action-move guards and the
 * getLegalMoves short-circuit. `undefined` and `[]` both mean no pending
 * choice (mirrors hasPendingKoHeroChoice, D-24007).
 *
 * @param G - The game state to inspect (not mutated).
 * @returns true when the pending optional-KO-reward queue holds at least one entry.
 */
export function hasPendingOptionalKoReward(G: LegendaryGameState): boolean {
  return (G.pendingOptionalKoRewards?.length ?? 0) > 0;
}

/**
 * Resolves the FRONT pending optional-KO-reward choice.
 *
 * Atomic sequence (HARD — exact order, mirrors koHeroChoice.resolve.ts):
 *   1. Validate args — exactly { decline: true } XOR { zone, cardId }; an
 *      invalid shape is a silent no-op (queue intact).
 *   2. Validate the front pending entry — non-empty queue, front.playerID match.
 *   3. { decline } → front-pop ONLY, no KO, no reward (silent).
 *   4. { zone, cardId } → the card must be present in playerZones[pid][zone]
 *      NOW (recomputed fresh, no snapshot). Absent/stale → silent no-op, queue
 *      intact (resubmit).
 *   5. Remove the card from its zone → G.ko = koCard(...).
 *   6. THEN dispatch the reward via the existing executor (no re-implementation).
 *   7. Front-pop (queue.shift()) LAST.
 *
 * Any failure before step 5 ABORTS the reward (no KO ⇒ no reward; no KO via the
 * { zone, cardId } path without a reward dispatch). Moves never throw.
 *
 * // why: D-24019 — the reward fires only on an actual KO (atomic); FIFO
 * front-pop; the reward is dispatched to the existing executor (no re-impl).
 *
 * @param context - boardgame.io move context with G, playerID, and the rest
 *   (ctx, events, random, log) spread into `context` for the reward dispatch.
 * @param args - the decline flag or the { zone, cardId } to KO.
 */
export function resolveOptionalKoReward(
  { G, playerID, ...context }: MoveContext,
  args: ResolveOptionalKoRewardArgs,
): void {
  // Step 1: Validate args — exactly one of { decline: true } / { zone, cardId }.
  const isDecline = (args as { decline?: unknown }).decline === true;
  const zone = (args as { zone?: unknown }).zone;
  const cardId = (args as { cardId?: unknown }).cardId;
  const isKoRequest =
    (zone === 'hand' || zone === 'discard') &&
    typeof cardId === 'string' &&
    cardId.length > 0;
  // why: exactly-one-shape — both present (decline AND zone/cardId) or neither
  // present is a malformed payload and a silent no-op.
  if (isDecline === isKoRequest) { return; }

  // Step 2: Validate the front pending entry — front-only resolution (no index
  // in the payload, so a non-front entry can never be targeted).
  const queue = G.pendingOptionalKoRewards;
  if (queue === undefined || queue.length === 0) { return; }
  const front = queue[0]!;
  if (front.playerID !== playerID) { return; }

  // Step 3: Decline → front-pop only, no KO, no reward (silent).
  if (isDecline) {
    queue.shift();
    return;
  }

  // Step 4: KO request — the chosen card must be present in the named zone right
  // now (no eligible snapshot is stored; eligibility is recomputed fresh).
  const playerZones = G.playerZones[playerID];
  if (!playerZones) { return; }
  const targetZone = zone as 'hand' | 'discard';
  const targetCardId = cardId as CardExtId;
  const moveResult = moveCardFromZone(playerZones[targetZone], [], targetCardId);
  if (!moveResult.found) {
    // why: invalid/stale target is a no-op that leaves the queue intact so the
    // player resubmits; the block-all guard guarantees a valid target exists.
    return;
  }

  // Step 5: Mutate — shorten the source zone and KO the chosen card.
  playerZones[targetZone] = moveResult.from;
  G.ko = koCard(G.ko, targetCardId);

  // Step 6: THEN dispatch the reward by REUSING the existing executor — no
  // re-implementation. The reward's own logging (e.g. D-24017 for rescue) is the
  // only reward log; this move adds no duplicate. `context` carries ctx.random
  // for the draw reward's reshuffle.
  executeSingleEffect(G, context, playerID, front.sourceCardId, {
    type: front.rewardType,
    magnitude: front.rewardMagnitude,
  });

  // Step 7: Front-pop LAST (front-pop = Array.shift), mirroring WP-242.
  queue.shift();
}
