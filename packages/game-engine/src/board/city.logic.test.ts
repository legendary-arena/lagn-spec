/**
 * City push logic unit tests for WP-015.
 *
 * Verifies pushVillainIntoCity correctly inserts at space 0, shifts existing
 * cards rightward, handles escapes from space 4, and maintains the 5-tuple
 * invariant.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pushVillainIntoCity,
  initializeCity,
  initializeHq,
  fillHqFromDeck,
  refillHqSlot,
} from './city.logic.js';
import type { CityZone, HqZone } from './city.types.js';
import type { CardExtId } from '../state/zones.types.js';

describe('pushVillainIntoCity', () => {
  it('places card at space 0 of an empty city', () => {
    const emptyCity: CityZone = [null, null, null, null, null];

    const result = pushVillainIntoCity(emptyCity, 'villain-a');

    assert.equal(result.city[0], 'villain-a', 'Card must be at space 0');
    assert.equal(result.city[1], null, 'Space 1 must be null');
    assert.equal(result.city[2], null, 'Space 2 must be null');
    assert.equal(result.city[3], null, 'Space 3 must be null');
    assert.equal(result.city[4], null, 'Space 4 must be null');
    assert.equal(result.escapedCard, null, 'No card should escape from empty city');
  });

  it('shifts existing cards forward (space 0 -> 1, etc.)', () => {
    const city: CityZone = ['villain-a', 'villain-b', null, null, null];

    const result = pushVillainIntoCity(city, 'villain-c');

    assert.equal(result.city[0], 'villain-c', 'New card must be at space 0');
    assert.equal(result.city[1], 'villain-a', 'Old space 0 must shift to space 1');
    assert.equal(result.city[2], 'villain-b', 'Old space 1 must shift to space 2');
    assert.equal(result.city[3], null, 'Space 3 must remain null');
    assert.equal(result.city[4], null, 'Space 4 must remain null');
    assert.equal(result.escapedCard, null, 'No escape when space 4 was empty');
  });

  it('with all 5 spaces full: space 4 card escapes', () => {
    const fullCity: CityZone = [
      'villain-1', 'villain-2', 'villain-3', 'villain-4', 'villain-5',
    ];

    const result = pushVillainIntoCity(fullCity, 'villain-new');

    assert.equal(result.city[0], 'villain-new', 'New card at space 0');
    assert.equal(result.city[1], 'villain-1', 'Old space 0 at space 1');
    assert.equal(result.city[2], 'villain-2', 'Old space 1 at space 2');
    assert.equal(result.city[3], 'villain-3', 'Old space 2 at space 3');
    assert.equal(result.city[4], 'villain-4', 'Old space 3 at space 4');
    assert.equal(result.escapedCard, 'villain-5', 'Old space 4 must escape');
  });

  it('escaped card is returned; non-escape returns null', () => {
    const cityWithGap: CityZone = ['villain-a', null, null, null, null];
    const resultNoEscape = pushVillainIntoCity(cityWithGap, 'villain-b');
    assert.equal(resultNoEscape.escapedCard, null, 'No escape when space 4 is null');

    const fullCity: CityZone = [
      'villain-1', 'villain-2', 'villain-3', 'villain-4', 'villain-5',
    ];
    const resultEscape = pushVillainIntoCity(fullCity, 'villain-new');
    assert.equal(resultEscape.escapedCard, 'villain-5', 'Escaped card must be returned');
  });

  it('escape identity: escapedCard is oldCity[4], never the newly revealed card', () => {
    const fullCity: CityZone = [
      'villain-a', 'villain-b', 'villain-c', 'villain-d', 'the-escapee',
    ];

    const result = pushVillainIntoCity(fullCity, 'the-new-card');

    assert.equal(
      result.escapedCard,
      'the-escapee',
      'Escaped card must be the one that was at space 4, not the new card',
    );
    assert.notEqual(
      result.escapedCard,
      'the-new-card',
      'Escaped card must never be the newly revealed card',
    );
  });

  it('city remains a 5-element tuple after push', () => {
    const emptyCity: CityZone = [null, null, null, null, null];

    const result1 = pushVillainIntoCity(emptyCity, 'v1');
    assert.equal(result1.city.length, 5, 'City must have 5 elements');

    const result2 = pushVillainIntoCity(result1.city, 'v2');
    assert.equal(result2.city.length, 5, 'City must still have 5 elements');

    const fullCity: CityZone = ['a', 'b', 'c', 'd', 'e'];
    const result3 = pushVillainIntoCity(fullCity, 'f');
    assert.equal(result3.city.length, 5, 'City must remain 5 elements after escape');
  });

  it('JSON.stringify succeeds after push', () => {
    const city: CityZone = ['villain-a', null, 'villain-c', null, null];

    const result = pushVillainIntoCity(city, 'villain-new');

    const serialized = JSON.stringify(result.city);
    assert.ok(serialized, 'JSON.stringify must produce a non-empty string');

    const parsed = JSON.parse(serialized);
    assert.equal(parsed.length, 5, 'Parsed city must have 5 elements');
  });
});

describe('initializeCity', () => {
  it('returns a 5-element tuple of all nulls', () => {
    const city = initializeCity();

    assert.equal(city.length, 5, 'City must have 5 elements');
    for (let spaceIndex = 0; spaceIndex < 5; spaceIndex++) {
      assert.equal(city[spaceIndex], null, `Space ${spaceIndex} must be null`);
    }
  });
});

describe('initializeHq', () => {
  it('returns a 5-element tuple of all nulls', () => {
    const hq = initializeHq();

    assert.equal(hq.length, 5, 'HQ must have 5 elements');
    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      assert.equal(hq[slotIndex], null, `Slot ${slotIndex} must be null`);
    }
  });
});

// ---------------------------------------------------------------------------
// WP-135 — fillHqFromDeck (setup-time HQ population)
// ---------------------------------------------------------------------------

describe('fillHqFromDeck', () => {
  it('pops the first 5 cards into HQ slots 0..4 in deck-front order', () => {
    const deck: CardExtId[] = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

    const result = fillHqFromDeck(deck, 5);

    assert.equal(result.hq[0], 'c0', 'Deck top must land at HQ slot 0');
    assert.equal(result.hq[1], 'c1');
    assert.equal(result.hq[2], 'c2');
    assert.equal(result.hq[3], 'c3');
    assert.equal(result.hq[4], 'c4');
  });

  it('returns the deck remainder after the front-pop', () => {
    const deck: CardExtId[] = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

    const result = fillHqFromDeck(deck, 5);

    assert.deepStrictEqual(
      result.remainingDeck,
      ['c5', 'c6'],
      'Remaining deck must contain everything after the popped prefix',
    );
  });

  it('when deck.length < slotCount: trailing slots stay null; remainingDeck is empty', () => {
    const deck: CardExtId[] = ['only-card'];

    const result = fillHqFromDeck(deck, 5);

    assert.equal(result.hq[0], 'only-card', 'First slot is filled');
    assert.equal(result.hq[1], null, 'Trailing slots stay null');
    assert.equal(result.hq[2], null);
    assert.equal(result.hq[3], null);
    assert.equal(result.hq[4], null);
    assert.deepStrictEqual(result.remainingDeck, [], 'Remaining deck is empty');
  });

  it('when deck is empty: HQ is all nulls; remainingDeck is empty', () => {
    const result = fillHqFromDeck([], 5);

    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      assert.equal(result.hq[slotIndex], null);
    }
    assert.deepStrictEqual(result.remainingDeck, []);
  });

  it('does not mutate the supplied deck (input-array immutability)', () => {
    const deck: CardExtId[] = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
    const snapshot = [...deck];

    fillHqFromDeck(deck, 5);

    assert.deepStrictEqual(deck, snapshot, 'Input deck must be unchanged after fillHqFromDeck');
  });

  it('returned hq is a new 5-element array reference', () => {
    const deck: CardExtId[] = ['c0', 'c1', 'c2', 'c3', 'c4'];
    const result = fillHqFromDeck(deck, 5);
    assert.equal(result.hq.length, 5);
  });
});

// ---------------------------------------------------------------------------
// WP-135 — refillHqSlot (move-time HQ refill)
// ---------------------------------------------------------------------------

describe('refillHqSlot', () => {
  it('refills the supplied slot with the front card of the deck (FIFO)', () => {
    const hq: HqZone = [null, 'b', 'c', 'd', 'e'];
    const deck: CardExtId[] = ['next-card', 'after-next'];

    const result = refillHqSlot(hq, 0, deck);

    assert.equal(result.hq[0], 'next-card', 'Vacated slot must be refilled');
    assert.equal(result.hq[1], 'b', 'Other slots unchanged');
    assert.equal(result.hq[2], 'c');
    assert.equal(result.hq[3], 'd');
    assert.equal(result.hq[4], 'e');
    assert.deepStrictEqual(result.heroDeck, ['after-next'], 'Deck length decrements by 1');
  });

  it('when deck is empty: vacated slot stays null; deck stays []', () => {
    const hq: HqZone = [null, 'b', 'c', 'd', 'e'];
    const deck: CardExtId[] = [];

    const result = refillHqSlot(hq, 0, deck);

    assert.equal(result.hq[0], null, 'Empty-deck branch leaves slot null per D-13503');
    assert.deepStrictEqual(result.heroDeck, [], 'Deck stays empty (no auto-reshuffle)');
  });

  it('refills only the requested slot — other slots are unchanged', () => {
    const hq: HqZone = ['a', 'b', null, 'd', 'e'];
    const deck: CardExtId[] = ['refill', 'tail'];

    const result = refillHqSlot(hq, 2, deck);

    assert.equal(result.hq[0], 'a');
    assert.equal(result.hq[1], 'b');
    assert.equal(result.hq[2], 'refill');
    assert.equal(result.hq[3], 'd');
    assert.equal(result.hq[4], 'e');
  });

  it('does not mutate the supplied hq (input-array immutability)', () => {
    const hq: HqZone = ['a', 'b', null, 'd', 'e'];
    const hqSnapshot = [...hq];
    const deck: CardExtId[] = ['refill', 'tail'];

    refillHqSlot(hq, 2, deck);

    assert.deepStrictEqual(
      [...hq],
      hqSnapshot,
      'Input hq must be unchanged after refillHqSlot',
    );
  });

  it('does not mutate the supplied deck (input-array immutability)', () => {
    const hq: HqZone = [null, 'b', 'c', 'd', 'e'];
    const deck: CardExtId[] = ['refill', 'tail'];
    const deckSnapshot = [...deck];

    refillHqSlot(hq, 0, deck);

    assert.deepStrictEqual(
      deck,
      deckSnapshot,
      'Input deck must be unchanged after refillHqSlot',
    );
  });
});
