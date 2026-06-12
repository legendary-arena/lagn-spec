/**
 * Unit tests for the start-of-turn draw primitive (WP-236).
 *
 * Verifies drawCardsIntoHand fills the hand from the deck, reshuffles the
 * discard on exhaustion, stops early when no cards remain, and keeps the
 * zones JSON-serializable. No boardgame.io import — the helper is pure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HAND_SIZE, drawCardsIntoHand } from './drawCards.logic.js';
import type { PlayerZones } from '../state/zones.types.js';
import type { ShuffleProvider } from '../setup/shuffle.js';

/**
 * Builds a minimal PlayerZones literal with the supplied zone overrides.
 *
 * @param partial - Zone overrides; omitted zones default to empty arrays.
 * @returns A complete PlayerZones object.
 */
function makeZones(partial: Partial<PlayerZones>): PlayerZones {
  return {
    deck: partial.deck ?? [],
    hand: partial.hand ?? [],
    discard: partial.discard ?? [],
    inPlay: partial.inPlay ?? [],
    victory: partial.victory ?? [],
  };
}

// why: the reverse-shuffle proves the reshuffle actually ran — an identity
// shuffle would pass even if the helper skipped the reshuffle. Mirrors the
// deterministic makeMockCtx pattern used across the engine test suite.
const reverseShuffleContext: ShuffleProvider = {
  random: { Shuffle: <T>(deck: T[]): T[] => [...deck].reverse() },
};

describe('drawCardsIntoHand', () => {
  it('exports HAND_SIZE === 6', () => {
    assert.equal(HAND_SIZE, 6);
  });

  it('draws count cards from the top of the deck into the hand', () => {
    const zones = makeZones({ deck: ['card-a', 'card-b', 'card-c'], hand: [] });

    drawCardsIntoHand(zones, 2, reverseShuffleContext);

    assert.deepEqual(zones.hand, ['card-a', 'card-b']);
    assert.deepEqual(zones.deck, ['card-c']);
  });

  it('reshuffles the discard into the deck when the deck is exhausted mid-draw', () => {
    const zones = makeZones({
      deck: ['card-a', 'card-b'],
      hand: [],
      discard: ['card-c', 'card-d', 'card-e'],
    });

    drawCardsIntoHand(zones, 5, reverseShuffleContext);

    // 2 drawn from the deck, then the discard is reversed into the new deck
    // (['card-e', 'card-d', 'card-c']) and 3 more are drawn from its top.
    assert.equal(zones.hand.length, 5);
    assert.equal(zones.deck.length, 0);
    assert.equal(zones.discard.length, 0);
    assert.deepEqual(zones.hand, ['card-a', 'card-b', 'card-e', 'card-d', 'card-c']);
  });

  it('stops early when the deck and discard are both empty', () => {
    const zones = makeZones({ deck: ['card-a'], hand: [], discard: [] });

    drawCardsIntoHand(zones, 5, reverseShuffleContext);

    assert.deepEqual(zones.hand, ['card-a']);
    assert.equal(zones.deck.length, 0);
    assert.equal(zones.discard.length, 0);
  });

  it('draws zero cards when count is 0 and leaves the zones untouched', () => {
    const zones = makeZones({ deck: ['card-a', 'card-b'], hand: [] });

    drawCardsIntoHand(zones, 0, reverseShuffleContext);

    assert.deepEqual(zones.hand, []);
    assert.deepEqual(zones.deck, ['card-a', 'card-b']);
  });

  it('leaves the zones JSON-serializable after drawing', () => {
    const zones = makeZones({ deck: ['card-a', 'card-b', 'card-c'], hand: [] });

    drawCardsIntoHand(zones, 2, reverseShuffleContext);

    assert.doesNotThrow(() => JSON.stringify(zones));
  });
});
