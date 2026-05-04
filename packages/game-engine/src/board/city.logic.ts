/**
 * City and HQ zone helpers for the Legendary Arena game engine.
 *
 * pushVillainIntoCity implements the deterministic push logic for placing
 * revealed villains and henchmen into the City. initializeCity and
 * initializeHq create empty zones for game setup.
 *
 * All helpers are pure functions — no boardgame.io imports, no side effects,
 * no .reduce(). Inputs are never mutated.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { CityZone, HqZone } from './city.types.js';

// ---------------------------------------------------------------------------
// Push result
// ---------------------------------------------------------------------------

/**
 * Result of pushing a villain into the City.
 */
export interface PushVillainResult {
  /** The new City state after the push. */
  city: CityZone;
  /** The card that escaped (was in space 4), or null if space 4 was empty. */
  escapedCard: CardExtId | null;
}

// ---------------------------------------------------------------------------
// pushVillainIntoCity
// ---------------------------------------------------------------------------

/**
 * Pushes a villain or henchman card into City space 0.
 *
 * All existing cards shift rightward (toward the escape edge at space 4).
 * If space 4 was occupied, that card escapes and is returned as escapedCard.
 *
 * @param city - The current City zone (5-tuple). Not mutated.
 * @param cardId - The card to place at space 0.
 * @returns The new City state and the escaped card (or null).
 */
export function pushVillainIntoCity(
  city: CityZone,
  cardId: CardExtId,
): PushVillainResult {
  // Capture escape before shifting
  const escapedCard = city[4];

  // why: rightward = toward escape. Space 4 is the escape edge.
  // Explicit assignment — no .reduce(), no array methods.
  const newCity: CityZone = [
    cardId,   // space 0: newly revealed card enters here
    city[0],  // space 1: old space 0 shifts right
    city[1],  // space 2: old space 1 shifts right
    city[2],  // space 3: old space 2 shifts right
    city[3],  // space 4: old space 3 shifts right (old space 4 escaped above)
  ];

  return {
    city: newCity,
    escapedCard: escapedCard ?? null,
  };
}

// ---------------------------------------------------------------------------
// Initialization helpers
// ---------------------------------------------------------------------------

/**
 * Creates an empty City zone for game setup.
 *
 * @returns A 5-element tuple of nulls.
 */
export function initializeCity(): CityZone {
  return [null, null, null, null, null];
}

/**
 * Creates an empty HQ zone for game setup.
 *
 * @returns A 5-element tuple of nulls.
 */
export function initializeHq(): HqZone {
  // why: recruit slot population is WP-016 scope
  return [null, null, null, null, null];
}

// ---------------------------------------------------------------------------
// fillHqFromDeck — WP-135 setup-time HQ population
// ---------------------------------------------------------------------------

/**
 * Result of filling the HQ from the front of a hero deck.
 */
export interface FillHqFromDeckResult {
  /** The newly populated HQ — slots filled left-to-right from the deck front. */
  hq: HqZone;
  /** The deck after popping the cards used to populate the HQ. */
  remainingDeck: CardExtId[];
}

/**
 * Pops the first `slotCount` cards off the front of `heroDeck` and places
 * them into HQ slots 0..(slotCount-1) in deck-front order. When the deck
 * has fewer than `slotCount` cards, the trailing slots stay null.
 *
 * Pure helper — pops front-to-back so the deck's top card lands at HQ slot 0.
 * Mirrors the city's pushVillainIntoCity entry-edge pattern; engine indexes 0-4
 * with slot 0 as the canonical first-fill site. Index 0 = first-fill slot is
 * locked semantics; do not reorder.
 *
 * @param heroDeck - Source hero deck reservoir; not mutated.
 * @param slotCount - Number of HQ slots to fill (typically 5 for MVP).
 * @returns The populated HQ and the deck after the front-pop.
 */
export function fillHqFromDeck(
  heroDeck: CardExtId[],
  slotCount: number,
): FillHqFromDeckResult {
  const newHq: (CardExtId | null)[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const card = heroDeck[slotIndex];
    newHq.push(card === undefined ? null : card);
  }

  const remainingDeck: CardExtId[] = [];
  for (let cardIndex = slotCount; cardIndex < heroDeck.length; cardIndex++) {
    remainingDeck.push(heroDeck[cardIndex]!);
  }

  return {
    hq: newHq as HqZone,
    remainingDeck,
  };
}

// ---------------------------------------------------------------------------
// refillHqSlot — WP-135 move-time HQ refill
// ---------------------------------------------------------------------------

/**
 * Result of refilling a single HQ slot from the front of a hero deck.
 */
export interface RefillHqSlotResult {
  /** The newly assembled HQ with the supplied slot replaced. */
  hq: HqZone;
  /** The deck after popping the front card (or unchanged when deck was empty). */
  heroDeck: CardExtId[];
}

/**
 * Refills `hq[hqIndex]` with the front card of `heroDeck` (FIFO via shift).
 * When the deck is empty, the slot stays `null` and the deck remains `[]`
 * per D-13503 — no auto-reshuffle of the active player's discard back into
 * the shared hero deck.
 *
 * Pure helper — returns new arrays; never mutates the supplied hq or
 * heroDeck. The move body rebinds `G.hq = result.hq; G.heroDeck =
 * result.heroDeck` to apply the refill; never `G.heroDeck.shift()` /
 * `G.hq[i] = ...` directly.
 *
 * @param hq - Current HQ zone; not mutated.
 * @param hqIndex - 0-based slot to refill.
 * @param heroDeck - Current hero deck reservoir; not mutated.
 * @returns The new HQ and the post-pop deck.
 */
export function refillHqSlot(
  hq: HqZone,
  hqIndex: number,
  heroDeck: CardExtId[],
): RefillHqSlotResult {
  const newHq: (CardExtId | null)[] = [];
  for (let slotIndex = 0; slotIndex < hq.length; slotIndex++) {
    newHq.push(hq[slotIndex] ?? null);
  }

  if (heroDeck.length === 0) {
    newHq[hqIndex] = null;
    return {
      hq: newHq as HqZone,
      heroDeck: [],
    };
  }

  const nextCard = heroDeck[0]!;
  newHq[hqIndex] = nextCard;

  const remainingDeck: CardExtId[] = [];
  for (let cardIndex = 1; cardIndex < heroDeck.length; cardIndex++) {
    remainingDeck.push(heroDeck[cardIndex]!);
  }

  return {
    hq: newHq as HqZone,
    heroDeck: remainingDeck,
  };
}
