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
  /** The card that escaped from space 4, or null when no card was pushed off. */
  escapedCard: CardExtId | null;
}

// ---------------------------------------------------------------------------
// pushVillainIntoCity
// ---------------------------------------------------------------------------

/**
 * Pushes a villain or henchman card into City space 0.
 *
 * The new card enters at space 0 and only the contiguous block of cards
 * starting at space 0 advances one space toward the escape edge. The
 * leftmost (lowest-index) empty space absorbs the push — every space to the
 * right of it is unchanged. A card on space 4 escapes ONLY when the City
 * has no empty space (i.e., the entry-side block reaches all the way to
 * the escape edge).
 *
 * Example (matches the player-visible bug scenario):
 *   `[A, _, _, _, B]` + `N` → `[N, A, _, _, B]`. B does NOT escape; the
 *   empty space at index 1 absorbs A's advance and B's neighborhood is
 *   untouched.
 *
 * Example (full city):
 *   `[A, B, C, D, E]` + `N` → `[N, A, B, C, D]` with `escapedCard = E`.
 *
 * @param city - The current City zone (5-tuple). Not mutated.
 * @param cardId - The card to place at space 0.
 * @returns The new City state and the escaped card (or null).
 */
export function pushVillainIntoCity(
  city: CityZone,
  cardId: CardExtId,
): PushVillainResult {
  // why: only the contiguous entry-side block advances. Empty spaces absorb
  // the push so a far-side card on space 4 does not escape unless every
  // space between it and the entry is occupied. Locate the leftmost empty
  // space — that's where the cascade stops.
  let leftmostEmptyIndex = -1;
  for (let spaceIndex = 0; spaceIndex < city.length; spaceIndex++) {
    if (city[spaceIndex] === null) {
      leftmostEmptyIndex = spaceIndex;
      break;
    }
  }

  // why: start from a copy so spaces past the empty slot (or all spaces in
  // the full-city escape branch) carry over unchanged without per-slot
  // re-assignment.
  const newCity: CityZone = [city[0], city[1], city[2], city[3], city[4]];

  let escapedCard: CardExtId | null = null;

  if (leftmostEmptyIndex === -1) {
    // City is full — space 4 escapes and the entire row shifts up by one.
    escapedCard = city[4];
    newCity[4] = city[3];
    newCity[3] = city[2];
    newCity[2] = city[1];
    newCity[1] = city[0];
  } else {
    // Shift the contiguous entry-side block one space toward the escape
    // edge, terminating at the leftmost empty slot. Iterate top-down so
    // each write reads the pre-shift value.
    for (let spaceIndex = leftmostEmptyIndex; spaceIndex >= 1; spaceIndex--) {
      newCity[spaceIndex] = city[spaceIndex - 1]!;
    }
  }

  newCity[0] = cardId;

  return {
    city: newCity,
    escapedCard,
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
