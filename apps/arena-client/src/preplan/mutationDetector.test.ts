/**
 * Tests for detectPlayerAffectingMutations — pure UIState diff detection.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { UIState } from '@legendary-arena/game-engine';

import { detectPlayerAffectingMutations } from './mutationDetector';

/**
 * Build a minimal UIState fixture with sensible defaults.
 * Override individual fields via the partial parameter.
 */
function makeUIState(overrides?: Partial<UIState>): UIState {
  return {
    game: {
      phase: 'play',
      turn: 1,
      activePlayerId: '1',
      currentStage: 'main',
    },
    players: [
      {
        playerId: '0',
        deckCount: 10,
        handCount: 5,
        discardCount: 0,
        inPlayCount: 0,
        victoryCount: 0,
        woundCount: 0,
      },
      {
        playerId: '1',
        deckCount: 10,
        handCount: 5,
        discardCount: 0,
        inPlayCount: 0,
        victoryCount: 0,
        woundCount: 0,
      },
    ],
    city: {
      spaces: [null, null, null, null, null],
      escapedPile: [],
    },
    hq: {
      slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-e'],
    },
    mastermind: {
      id: 'core/dr-doom',
      tacticsRemaining: 4,
      tacticsDefeated: 0,
      display: { extId: 'core/dr-doom', name: 'Dr. Doom', imageUrl: '', cost: null },
      attachedBystanders: [],
      strikePile: [],
    },
    scheme: {
      id: 'core/midtown-bank-robbery',
      twistCount: 0,
      twistPile: [],
    },
    economy: {
      attack: 0,
      recruit: 0,
      availableAttack: 0,
      availableRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
    log: [],
    progress: {
      bystandersRescued: 0,
      escapedVillains: 0,
    },
    decks: {
      villainDeckCount: 20,
      heroDeckCount: 15,
    },
    piles: {
      bystandersCount: 10,
      woundsCount: 15,
      horrorsCount: 0,
      officersCount: 5,
      sidekicksCount: 4,
    },
    koPile: {
      count: 0,
      topCard: null,
      cards: [],
    },
    notableEvents: [],
    villainAttachedHeroes: {},
    ...overrides,
  };
}

const VIEWER = '0';

describe('detectPlayerAffectingMutations', () => {
  test('city space change produces a mutation with effectType other', () => {
    const previous = makeUIState();
    const villainCard = {
      extId: 'core/sentinel',
      type: 'villain',
      keywords: [],
      display: { extId: 'core/sentinel', name: 'Sentinel', imageUrl: '', cost: null },
      attachedHeroes: [],
      fightCost: 0,
    };
    const current = makeUIState({
      city: {
        spaces: [villainCard, null, null, null, null],
        escapedPile: [],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    assert.ok(mutations.length >= 1);
    const cityMutation = mutations.find((m) => m.effectDescription.includes('city space'));
    assert.ok(cityMutation !== undefined);
    assert.equal(cityMutation.effectType, 'other');
    assert.equal(cityMutation.affectedPlayerId, VIEWER);
  });

  test('villain escape (escapedPile length increase) produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      city: {
        spaces: [null, null, null, null, null],
        escapedPile: [
          { extId: 'core/sentinel', display: { extId: 'core/sentinel', name: 'Sentinel', imageUrl: '', cost: null } },
        ],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const escapeMutation = mutations.find((m) => m.effectDescription.includes('escaped'));
    assert.ok(escapeMutation !== undefined);
    assert.equal(escapeMutation.effectType, 'other');
  });

  test('HQ slot change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const hqMutation = mutations.find((m) => m.effectDescription.includes('HQ slot'));
    assert.ok(hqMutation !== undefined);
    assert.equal(hqMutation.effectType, 'other');
  });

  test('per-player wound count increase produces a mutation with effectType ko', () => {
    const previous = makeUIState();
    const current = makeUIState({
      players: [
        {
          playerId: '0',
          deckCount: 10,
          handCount: 5,
          discardCount: 0,
          inPlayCount: 0,
          victoryCount: 0,
          woundCount: 1,
        },
        {
          playerId: '1',
          deckCount: 10,
          handCount: 5,
          discardCount: 0,
          inPlayCount: 0,
          victoryCount: 0,
          woundCount: 0,
        },
      ],
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const woundMutation = mutations.find((m) => m.effectType === 'ko');
    assert.ok(woundMutation !== undefined);
    assert.equal(woundMutation.effectDescription, 'Wound dealt to you');
    assert.equal(woundMutation.affectedPlayerId, VIEWER);
  });

  test('shared pile change (bystandersCount) produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      piles: {
        bystandersCount: 9,
        woundsCount: 15,
        horrorsCount: 0,
        officersCount: 5,
        sidekicksCount: 4,
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const pileMutation = mutations.find((m) => m.effectDescription.includes('Bystander pool'));
    assert.ok(pileMutation !== undefined);
    assert.equal(pileMutation.effectType, 'other');
  });

  test('mastermind tactic change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      mastermind: {
        id: 'core/dr-doom',
        tacticsRemaining: 3,
        tacticsDefeated: 1,
        display: { extId: 'core/dr-doom', name: 'Dr. Doom', imageUrl: '', cost: null },
        attachedBystanders: [],
        strikePile: [],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const tacticMutation = mutations.find((m) => m.effectDescription.includes('tactic'));
    assert.ok(tacticMutation !== undefined);
    assert.equal(tacticMutation.effectType, 'other');
  });

  test('no mutations detected when UIState is structurally unchanged', () => {
    const state = makeUIState();
    const mutations = detectPlayerAffectingMutations(state, state, VIEWER);
    assert.equal(mutations.length, 0);
  });

  test('turn change to viewer returns empty array (not a disruption)', () => {
    const previous = makeUIState({
      game: { phase: 'play', turn: 1, activePlayerId: '1', currentStage: 'main' },
    });
    const current = makeUIState({
      game: { phase: 'play', turn: 2, activePlayerId: '0', currentStage: 'start' },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    assert.equal(mutations.length, 0);
  });

  test('multiple simultaneous changes produce multiple mutations', () => {
    const previous = makeUIState();
    const current = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
      piles: {
        bystandersCount: 9,
        woundsCount: 15,
        horrorsCount: 0,
        officersCount: 5,
        sidekicksCount: 4,
      },
      mastermind: {
        id: 'core/dr-doom',
        tacticsRemaining: 3,
        tacticsDefeated: 1,
        display: { extId: 'core/dr-doom', name: 'Dr. Doom', imageUrl: '', cost: null },
        attachedBystanders: [],
        strikePile: [],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    assert.ok(mutations.length >= 3);
  });

  test('null previous returns empty array', () => {
    const current = makeUIState();
    const mutations = detectPlayerAffectingMutations(null, current, VIEWER);
    assert.equal(mutations.length, 0);
  });

  test('null current returns empty array', () => {
    const previous = makeUIState();
    const mutations = detectPlayerAffectingMutations(previous, null, VIEWER);
    assert.equal(mutations.length, 0);
  });

  test('undefined previous returns empty array', () => {
    const current = makeUIState();
    const mutations = detectPlayerAffectingMutations(undefined, current, VIEWER);
    assert.equal(mutations.length, 0);
  });

  test('undefined current returns empty array', () => {
    const previous = makeUIState();
    const mutations = detectPlayerAffectingMutations(previous, undefined, VIEWER);
    assert.equal(mutations.length, 0);
  });

  test('scheme twist pile change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      scheme: {
        id: 'core/midtown-bank-robbery',
        twistCount: 1,
        twistPile: [
          { extId: 'core/scheme-twist', display: { extId: 'core/scheme-twist', name: 'Scheme Twist', imageUrl: '', cost: null } },
        ],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const twistMutation = mutations.find((m) => m.effectDescription.includes('twist'));
    assert.ok(twistMutation !== undefined);
  });

  test('escaped villain count change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      progress: {
        bystandersRescued: 0,
        escapedVillains: 1,
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const escapedMutation = mutations.find((m) => m.effectDescription.includes('Escaped villain'));
    assert.ok(escapedMutation !== undefined);
  });

  test('mastermind attached bystander change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      mastermind: {
        id: 'core/dr-doom',
        tacticsRemaining: 4,
        tacticsDefeated: 0,
        display: { extId: 'core/dr-doom', name: 'Dr. Doom', imageUrl: '', cost: null },
        attachedBystanders: [
          { extId: 'core/bystander', display: { extId: 'core/bystander', name: 'Bystander', imageUrl: '', cost: null } },
        ],
        strikePile: [],
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const bystanderMutation = mutations.find((m) => m.effectDescription.includes('Bystander attached'));
    assert.ok(bystanderMutation !== undefined);
  });

  test('viewer hand count change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      players: [
        {
          playerId: '0',
          deckCount: 10,
          handCount: 4,
          discardCount: 0,
          inPlayCount: 0,
          victoryCount: 0,
          woundCount: 0,
        },
        {
          playerId: '1',
          deckCount: 10,
          handCount: 5,
          discardCount: 0,
          inPlayCount: 0,
          victoryCount: 0,
          woundCount: 0,
        },
      ],
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const handMutation = mutations.find((m) => m.effectDescription.includes('hand size'));
    assert.ok(handMutation !== undefined);
    assert.equal(handMutation.effectType, 'other');
  });

  test('wound pool change produces a mutation', () => {
    const previous = makeUIState();
    const current = makeUIState({
      piles: {
        bystandersCount: 10,
        woundsCount: 14,
        horrorsCount: 0,
        officersCount: 5,
        sidekicksCount: 4,
      },
    });

    const mutations = detectPlayerAffectingMutations(previous, current, VIEWER);
    const woundPoolMutation = mutations.find((m) => m.effectDescription.includes('Wound pool'));
    assert.ok(woundPoolMutation !== undefined);
  });
});
