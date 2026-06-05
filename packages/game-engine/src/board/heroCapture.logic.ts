/**
 * Hero capture helpers for the Legendary Arena game engine (WP-214).
 *
 * Three pure functions for the hero capture lifecycle:
 * - captureHeroFromHq: remove a hero from HQ by selector, attach to villain,
 *   refill HQ slot from hero deck
 * - awardAttachedHeroes: award captured heroes to player's discard on defeat
 * - koAttachedHeroesOnEscape: KO captured heroes when villain escapes
 *
 * All functions operate on G directly (not returning new objects) to match
 * the existing villain-effect mutation pattern. No boardgame.io import.
 * No ctx dependency. No randomness. No .reduce().
 */

import type { CardExtId } from '../state/zones.types.js';
import type { LegendaryGameState } from '../types.js';
import { refillHqSlot } from './city.logic.js';

/**
 * Result of a successful hero capture operation.
 *
 * Returned by captureHeroFromHq when a non-null HQ slot is found.
 * null is returned when the HQ has no non-null slots (safe no-op).
 */
export interface CaptureHeroResult {
  /** The hero ext_id removed from the HQ and attached to the villain. */
  capturedHeroId: CardExtId;
  /** The HQ slot index that was vacated (0-4). */
  hqIndex: number;
  /** The hero ext_id that refilled the slot, or null when the deck is empty. */
  refilledHeroId: CardExtId | null;
}

/**
 * Captures a hero from the HQ and attaches it to a villain.
 *
 * Scans HQ slots by the given selector strategy, removes the selected hero,
 * attaches it to G.villainAttachedHeroes[villainCardId], and refills the HQ
 * slot from G.heroDeck. All three steps execute atomically — no intermediate
 * state is observable.
 *
 * Selector strategies:
 * - 'rightmost': scans index 4 → 0, captures first non-null slot.
 * - 'highestCost': scans left→right, captures highest G.cardStats[id].cost;
 *   ties broken by rightmost index.
 * - 'lowestCost': scans left→right, captures lowest G.cardStats[id].cost;
 *   ties broken by rightmost index.
 *
 * @param G - Game state (mutated directly).
 * @param villainCardId - The villain zone-instance ext_id to attach to.
 * @param selector - Which HQ selection strategy to apply.
 * @returns CaptureHeroResult when a hero was captured; null when HQ is empty.
 */
export function captureHeroFromHq(
  G: LegendaryGameState,
  villainCardId: CardExtId,
  selector: 'rightmost' | 'highestCost' | 'lowestCost',
): CaptureHeroResult | null {
  let selectedIndex: number | null = null;

  if (selector === 'rightmost') {
    // why: scan right-to-left (index 4 → 0); capture the first non-null slot
    for (let hqIndex = 4; hqIndex >= 0; hqIndex--) {
      if (G.hq[hqIndex] !== null) {
        selectedIndex = hqIndex;
        break;
      }
    }
  } else if (selector === 'highestCost') {
    // why: scan left-to-right; track highest cost hero; rightmost index wins ties
    let highestCost = -1;
    for (let hqIndex = 0; hqIndex < G.hq.length; hqIndex++) {
      const heroSlot = G.hq[hqIndex];
      if (heroSlot === null || heroSlot === undefined) continue;
      const heroId: CardExtId = heroSlot;
      const heroCost = G.cardStats[heroId]?.cost ?? 0;
      if (heroCost > highestCost || (heroCost === highestCost && hqIndex > (selectedIndex ?? -1))) {
        highestCost = heroCost;
        selectedIndex = hqIndex;
      }
    }
  } else {
    // why: scan left-to-right; track lowest cost hero; rightmost index wins ties
    let lowestCost = Infinity;
    for (let hqIndex = 0; hqIndex < G.hq.length; hqIndex++) {
      const heroSlot = G.hq[hqIndex];
      if (heroSlot === null || heroSlot === undefined) continue;
      const heroId: CardExtId = heroSlot;
      const heroCost = G.cardStats[heroId]?.cost ?? 0;
      if (heroCost < lowestCost || (heroCost === lowestCost && hqIndex > (selectedIndex ?? -1))) {
        lowestCost = heroCost;
        selectedIndex = hqIndex;
      }
    }
  }

  if (selectedIndex === null) {
    // why: all HQ slots are null — safe no-op per zone-exhaustion defence
    return null;
  }

  const capturedHeroId = G.hq[selectedIndex] as CardExtId;

  // Step 1: Remove hero from HQ slot (set to null before refill)
  G.hq[selectedIndex] = null;

  // Step 2: Attach hero to villain's capture list
  const existingCaptures = G.villainAttachedHeroes[villainCardId];
  if (existingCaptures === undefined) {
    G.villainAttachedHeroes[villainCardId] = [capturedHeroId];
  } else {
    existingCaptures.push(capturedHeroId);
  }

  // Step 3: Refill HQ slot from hero deck
  const refillResult = refillHqSlot(G.hq, selectedIndex, G.heroDeck);
  G.hq = refillResult.hq;
  G.heroDeck = refillResult.heroDeck;

  const refilledHeroId = G.hq[selectedIndex] ?? null;

  return {
    capturedHeroId,
    hqIndex: selectedIndex,
    refilledHeroId,
  };
}

/**
 * Awards all heroes attached to a defeated villain to the player's discard pile.
 *
 * Called from fightVillain after the villain is placed in victory. Moves every
 * hero in G.villainAttachedHeroes[villainCardId] to G.playerZones[playerId].discard.
 * Deletes the mapping entry (not set to []).
 *
 * @param G - Game state (mutated directly).
 * @param villainCardId - The defeated villain zone-instance ext_id.
 * @param playerId - The defeating player's id (ctx.currentPlayer string).
 */
// why: heroes go to discard ("Gain that Hero" card text) — they enter the
// player's deck the normal way by shuffling, not into the victory pile
export function awardAttachedHeroes(
  G: LegendaryGameState,
  villainCardId: CardExtId,
  playerId: string,
): void {
  // why: guard for pre-WP-214 G fixtures in tests that do not include the field
  if (!G.villainAttachedHeroes) return;
  const capturedHeroes = G.villainAttachedHeroes[villainCardId];
  if (capturedHeroes === undefined || capturedHeroes.length === 0) {
    // why: no-op when villain has no attached heroes — backward compatible
    return;
  }

  const playerZones = G.playerZones[playerId];
  if (!playerZones) return;

  for (const heroId of capturedHeroes) {
    playerZones.discard.push(heroId);
  }

  // why: delete entry rather than setting to [] — zone integrity rule:
  // G.villainAttachedHeroes[v] exists only while length > 0 (D-21401)
  delete G.villainAttachedHeroes[villainCardId];
}

/**
 * KOs all heroes attached to an escaping villain.
 *
 * Called from villainDeck.reveal.ts escape branch after executeVillainAbilities.
 * Moves every hero in G.villainAttachedHeroes[villainCardId] to G.ko.
 * Deletes the mapping entry (not set to []).
 *
 * @param G - Game state (mutated directly).
 * @param villainCardId - The escaping villain zone-instance ext_id.
 */
// why: heroes KO'd on escape per tabletop rules — captured heroes do not
// return to HQ when their captor escapes
export function koAttachedHeroesOnEscape(
  G: LegendaryGameState,
  villainCardId: CardExtId,
): void {
  // why: guard for pre-WP-214 G fixtures in tests that do not include the field
  if (!G.villainAttachedHeroes) return;
  const capturedHeroes = G.villainAttachedHeroes[villainCardId];
  if (capturedHeroes === undefined || capturedHeroes.length === 0) {
    // why: no-op when villain has no attached heroes — backward compatible
    return;
  }

  for (const heroId of capturedHeroes) {
    G.ko.push(heroId);
  }

  // why: delete entry rather than setting to [] — zone integrity rule:
  // G.villainAttachedHeroes[v] exists only while length > 0 (D-21401)
  delete G.villainAttachedHeroes[villainCardId];
}
