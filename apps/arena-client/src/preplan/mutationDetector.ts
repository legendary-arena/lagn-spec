/**
 * Pure UIState diff → PlayerAffectingMutation[] detector.
 *
 * Compares a previous and current UIState projection to identify
 * mutations that affect a waiting player's active pre-plan. The field
 * set is closed — see the anchored field table in WP-070 §A.
 *
 * No boardgame.io imports. No .reduce(). No dynamic property traversal.
 */

import type { UIState } from '@legendary-arena/game-engine';
import type { PlayerAffectingMutation } from '@legendary-arena/preplan';

/**
 * Find the UIPlayerState entry for a given player ID.
 *
 * @param players - The players array from UIState.
 * @param playerId - The player ID to look up.
 * @returns The matching UIPlayerState, or undefined if not found.
 */
function findPlayerState(
  players: UIState['players'],
  playerId: string,
): UIState['players'][number] | undefined {
  for (const player of players) {
    if (player.playerId === playerId) {
      return player;
    }
  }
  return undefined;
}

/**
 * Detect player-affecting mutations between two UIState projections.
 *
 * Compares the anchored UIState field set (WP-070 §A closed table) and
 * returns an array of `PlayerAffectingMutation` describing each detected
 * change. Returns an empty array when no mutations affect the viewer.
 *
 * @param previous - The UIState from the prior subscription frame.
 * @param current - The UIState from the current subscription frame.
 * @param viewerPlayerId - The player whose pre-plan may be disrupted.
 * @returns An array of detected mutations (empty when nothing changed).
 */
export function detectPlayerAffectingMutations(
  previous: UIState | null | undefined,
  current: UIState | null | undefined,
  viewerPlayerId: string,
): PlayerAffectingMutation[] {
  if (previous === null || previous === undefined || current === null || current === undefined) {
    return [];
  }

  // why: turn-change to the viewer's own turn means the plan is consumed
  // (it is now the viewer's turn to act), not disrupted. Return empty so
  // the middleware does not fire a disruption notification.
  if (
    current.game.activePlayerId !== previous.game.activePlayerId &&
    current.game.activePlayerId === viewerPlayerId
  ) {
    return [];
  }

  const sourcePlayerId = previous.game.activePlayerId;
  const mutations: PlayerAffectingMutation[] = [];

  // --- City spaces ---
  const previousSpaces = previous.city.spaces;
  const currentSpaces = current.city.spaces;
  const spaceCount = Math.max(previousSpaces.length, currentSpaces.length);
  for (let i = 0; i < spaceCount; i++) {
    const previousSlot = previousSpaces[i] ?? null;
    const currentSlot = currentSpaces[i] ?? null;
    if (previousSlot !== currentSlot) {
      const description = currentSlot === null
        ? `Villain left city space ${i}`
        : `Villain appeared in city space ${i}`;
      mutations.push({
        sourcePlayerId,
        affectedPlayerId: viewerPlayerId,
        effectType: 'other',
        effectDescription: description,
      });
    }
  }

  // --- City escaped pile ---
  if (current.city.escapedPile.length !== previous.city.escapedPile.length) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Villain escaped from the city',
    });
  }

  // --- HQ slots ---
  const previousHqSlots = previous.hq.slots;
  const currentHqSlots = current.hq.slots;
  const hqSlotCount = Math.max(previousHqSlots.length, currentHqSlots.length);
  for (let i = 0; i < hqSlotCount; i++) {
    const previousHqSlot = previousHqSlots[i] ?? null;
    const currentHqSlot = currentHqSlots[i] ?? null;
    if (previousHqSlot !== currentHqSlot) {
      mutations.push({
        sourcePlayerId,
        affectedPlayerId: viewerPlayerId,
        effectType: 'other',
        effectDescription: `HQ slot ${i} changed`,
      });
    }
  }

  // --- Per-player wound count ---
  const previousViewerPlayer = findPlayerState(previous.players, viewerPlayerId);
  const currentViewerPlayer = findPlayerState(current.players, viewerPlayerId);
  if (previousViewerPlayer !== undefined && currentViewerPlayer !== undefined) {
    if (currentViewerPlayer.woundCount !== previousViewerPlayer.woundCount) {
      mutations.push({
        sourcePlayerId,
        affectedPlayerId: viewerPlayerId,
        effectType: 'ko',
        effectDescription: 'Wound dealt to you',
      });
    }

    // --- Per-player hand count ---
    if (currentViewerPlayer.handCount !== previousViewerPlayer.handCount) {
      mutations.push({
        sourcePlayerId,
        affectedPlayerId: viewerPlayerId,
        effectType: 'other',
        effectDescription: 'Your hand size changed',
      });
    }
  }

  // --- Shared piles: bystanders ---
  if (current.piles.bystandersCount !== previous.piles.bystandersCount) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Bystander pool changed',
    });
  }

  // --- Shared piles: wounds ---
  if (current.piles.woundsCount !== previous.piles.woundsCount) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Wound pool changed',
    });
  }

  // --- Mastermind tactics remaining ---
  if (current.mastermind.tacticsRemaining !== previous.mastermind.tacticsRemaining) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Mastermind tactic revealed',
    });
  }

  // --- Mastermind attached bystanders ---
  if (current.mastermind.attachedBystanders.length !== previous.mastermind.attachedBystanders.length) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Bystander attached to mastermind',
    });
  }

  // --- Scheme twist pile ---
  if (current.scheme.twistPile.length !== previous.scheme.twistPile.length) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Scheme twist pile changed',
    });
  }

  // --- Progress: escaped villains ---
  if (current.progress.escapedVillains !== previous.progress.escapedVillains) {
    mutations.push({
      sourcePlayerId,
      affectedPlayerId: viewerPlayerId,
      effectType: 'other',
      effectDescription: 'Escaped villain count changed',
    });
  }

  return mutations;
}
