/**
 * Unit tests for the shared onBegin-parity helper (WP-266).
 *
 * applyOnBeginParity mirrors the play-phase onBegin reset+draw for the three
 * observation-only per-turn loops (simulation runner, PAR aggregator, replay
 * fixture harness). These tests verify the wrapper behaviour: both once-per-turn
 * flags are reset, the hand is auto-drawn up to HAND_SIZE via the supplied
 * deterministic ShuffleProvider (reshuffling the discard on exhaustion), an
 * exhausted deck+discard draws fewer without throwing, and a missing seat is a
 * safe no-op. The underlying draw primitive is covered in
 * moves/drawCards.logic.test.ts. No boardgame.io import — the helper is pure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyOnBeginParity } from './onBeginParity.js';
import { HAND_SIZE } from '../moves/drawCards.logic.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { ShuffleProvider } from '../setup/shuffle.js';

/**
 * Builds a valid 9-field MatchSetupConfig fixture (mirrors simulation.test.ts).
 *
 * @returns A complete MatchSetupConfig for the minimal mock registry.
 */
function createTestConfig(): MatchSetupConfig {
  return {
    schemeId: 'test-scheme-001',
    mastermindId: 'test-mastermind-001',
    villainGroupIds: ['test-villain-group-001'],
    henchmanGroupIds: ['test-henchman-group-001'],
    heroDeckIds: ['test-hero-deck-001', 'test-hero-deck-002'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  };
}

/**
 * Minimal CardRegistryReader returning an empty card list (buildInitialGameState
 * handles narrow mocks gracefully — see simulation.test.ts).
 *
 * @returns A registry reader exposing an empty listCards.
 */
function createMockRegistry(): CardRegistryReader {
  return { listCards: () => [] };
}

// why: the reverse-shuffle proves the reshuffle path actually ran on deck
// exhaustion — an identity shuffle would pass even if the helper skipped it.
// Mirrors the deterministic ShuffleProvider in drawCards.logic.test.ts.
const reverseShuffleContext: ShuffleProvider = {
  random: { Shuffle: <T>(deck: T[]): T[] => [...deck].reverse() },
};

/**
 * Builds a real LegendaryGameState and replaces player 0's zones with a known
 * deck/hand/discard so the helper's draw is deterministic regardless of what
 * the minimal mock registry produced at setup.
 *
 * @param deck - the deck contents to install for player 0.
 * @param hand - the hand contents to install for player 0.
 * @param discard - the discard contents to install for player 0.
 * @returns the built game state and a direct reference to player 0's zones.
 */
function makeStateWithDeck(deck: string[], hand: string[], discard: string[]) {
  const gameState = buildInitialGameState(
    createTestConfig(),
    createMockRegistry(),
    makeMockCtx({ numPlayers: 2 }),
  );
  const zones = gameState.playerZones['0'];
  assert.ok(zones, 'player 0 zones must exist in the built state');
  zones.deck = [...deck];
  zones.hand = [...hand];
  zones.discard = [...discard];
  return { gameState, zones };
}

describe('applyOnBeginParity (WP-266)', () => {
  it('resets villainRevealedThisTurn to false and leaves hasDrawnThisTurn true after a draw', () => {
    const { gameState } = makeStateWithDeck(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], [], []);
    gameState.villainRevealedThisTurn = true;
    gameState.hasDrawnThisTurn = false;

    applyOnBeginParity(gameState, '0', reverseShuffleContext);

    assert.equal(gameState.villainRevealedThisTurn, false);
    assert.equal(gameState.hasDrawnThisTurn, true);
  });

  it('auto-draws the active player hand up to HAND_SIZE from the top of the deck', () => {
    const { gameState, zones } = makeStateWithDeck(
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      [],
      [],
    );

    applyOnBeginParity(gameState, '0', reverseShuffleContext);

    assert.equal(zones.hand.length, HAND_SIZE);
    assert.deepEqual(zones.hand, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    assert.deepEqual(zones.deck, ['c7', 'c8']);
  });

  it('tops up a partial hand to HAND_SIZE (draws only the gap)', () => {
    const { gameState, zones } = makeStateWithDeck(['c1', 'c2', 'c3', 'c4'], ['h1', 'h2'], []);

    applyOnBeginParity(gameState, '0', reverseShuffleContext);

    assert.equal(zones.hand.length, HAND_SIZE);
    assert.deepEqual(zones.hand, ['h1', 'h2', 'c1', 'c2', 'c3', 'c4']);
  });

  it('reshuffles the discard into the deck via the supplied provider on exhaustion', () => {
    const { gameState, zones } = makeStateWithDeck(
      ['c1', 'c2'],
      [],
      ['d1', 'd2', 'd3', 'd4', 'd5'],
    );

    applyOnBeginParity(gameState, '0', reverseShuffleContext);

    // 2 drawn from the deck, then the discard is reversed into the new deck
    // (['d5','d4','d3','d2','d1']) and 4 more are drawn from its top.
    assert.equal(zones.hand.length, HAND_SIZE);
    assert.deepEqual(zones.hand, ['c1', 'c2', 'd5', 'd4', 'd3', 'd2']);
    assert.deepEqual(zones.deck, ['d1']);
    assert.deepEqual(zones.discard, []);
  });

  it('draws fewer than HAND_SIZE without throwing when deck and discard are exhausted', () => {
    const { gameState, zones } = makeStateWithDeck(['c1', 'c2'], [], []);

    applyOnBeginParity(gameState, '0', reverseShuffleContext);

    assert.equal(zones.hand.length, 2);
    assert.deepEqual(zones.hand, ['c1', 'c2']);
    assert.equal(gameState.hasDrawnThisTurn, true);
  });

  it('resets the reveal flag but does not draw (hasDrawnThisTurn stays false) for a missing seat', () => {
    const { gameState } = makeStateWithDeck(['c1'], [], []);
    gameState.villainRevealedThisTurn = true;
    gameState.hasDrawnThisTurn = false;

    // why: an unknown seat id must not throw — the helper guards on zones, so
    // the flags reset but no draw runs (hasDrawnThisTurn is only set after a draw).
    applyOnBeginParity(gameState, 'nonexistent-seat', reverseShuffleContext);

    assert.equal(gameState.villainRevealedThisTurn, false);
    assert.equal(gameState.hasDrawnThisTurn, false);
  });
});
