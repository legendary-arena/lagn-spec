/**
 * Integration tests for escape-wound-bystander interactions (WP-017).
 *
 * Exercises the interaction between escape detection, wound gain,
 * bystander attachment, bystander award on defeat, and bystander
 * resolution on escape. Tests use revealVillainCard and fightVillain
 * directly with mock game state.
 *
 * Uses node:test, node:assert, and makeMockCtx — no boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { RevealedCardType } from '../villainDeck/villainDeck.types.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import { fightVillain } from '../moves/fightVillain.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';

/**
 * Creates a mock LegendaryGameState for integration testing.
 */
function createMockGameState(options?: {
  deck?: CardExtId[];
  cardTypes?: Record<CardExtId, RevealedCardType>;
  city?: LegendaryGameState['city'];
  bystandersPile?: CardExtId[];
  woundsPile?: CardExtId[];
  attachedBystanders?: Record<CardExtId, CardExtId[]>;
  currentStage?: LegendaryGameState['currentStage'];
}): LegendaryGameState {
  const config: MatchSetupConfig = {
    schemeId: 'test-scheme',
    mastermindId: 'test-mastermind',
    villainGroupIds: ['test-villain-group'],
    henchmanGroupIds: ['test-henchman-group'],
    heroDeckIds: ['test-hero-deck'],
    bystandersCount: 5,
    woundsCount: 5,
    officersCount: 1,
    sidekicksCount: 1,
  };

  return {
    matchConfiguration: config,
    selection: {
      schemeId: config.schemeId,
      mastermindId: config.mastermindId,
      villainGroupIds: [...config.villainGroupIds],
      henchmanGroupIds: [...config.henchmanGroupIds],
      heroDeckIds: [...config.heroDeckIds],
    },
    currentStage: options?.currentStage ?? 'start',
    playerZones: {
      '0': {
        deck: [],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    },
    piles: {
      bystanders: options?.bystandersPile ?? ['bystander-1', 'bystander-2', 'bystander-3'],
      wounds: options?.woundsPile ?? ['wound-1', 'wound-2', 'wound-3'],
      officers: ['officer-1'],
      sidekicks: ['sidekick-1'],
    },
    messages: [],
    // why: WP-200 — required field; fightVillain emits to this array
    // when defeating a card.
    notableEvents: [],
    counters: {},
    hookRegistry: buildDefaultHookDefinitions(config),
    villainDeck: {
      deck: options?.deck ?? [],
      discard: [],
    },
    villainDeckCardTypes: options?.cardTypes ?? {},
    ko: [],
    attachedBystanders: options?.attachedBystanders ?? {},
    turnEconomy: { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
    cardStats: {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
    },
    scheme: { twistPile: [] },
    escapedPile: [],
    city: options?.city ?? initializeCity(),
    hq: initializeHq(),
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
  };
}

/**
 * Creates a mock MoveContext for moves that need ctx.
 */
function createMockMoveContext(gameState: LegendaryGameState) {
  const mockCtx = makeMockCtx({ numPlayers: 1 });
  return {
    G: gameState,
    ctx: {
      ...mockCtx.ctx,
      currentPlayer: '0',
      phase: 'play',
      turn: 1,
      numMoves: 0,
      playOrder: ['0'],
      playOrderPos: 0,
    },
    random: mockCtx.random,
    events: {
      setPhase: () => {},
      endTurn: () => {},
      endGame: () => {},
      setStage: () => {},
      endStage: () => {},
    },
    log: { setMetadata: () => {} },
    playerID: '0',
  };
}

describe('escape-wound integration', () => {
  it('villain escape triggers wound gain for current player', () => {
    // City full with 5 villains; pushing one more causes escape
    const gameState = createMockGameState({
      deck: ['new-villain'],
      cardTypes: {
        'new-villain': 'villain',
        'city-villain-0': 'villain',
        'city-villain-1': 'villain',
        'city-villain-2': 'villain',
        'city-villain-3': 'villain',
        'city-villain-4': 'villain',
      },
      city: ['city-villain-0', 'city-villain-1', 'city-villain-2', 'city-villain-3', 'city-villain-4'],
      woundsPile: ['wound-1', 'wound-2'],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      gameState.playerZones['0']!.discard.includes('wound-1'),
      'Current player must have gained a wound in discard',
    );
    assert.equal(
      gameState.piles.wounds.length,
      1,
      'Wounds pile must have one fewer wound',
    );
  });

  it('escape with empty wounds pile: no wound, no error', () => {
    const gameState = createMockGameState({
      deck: ['new-villain'],
      cardTypes: {
        'new-villain': 'villain',
        'city-villain-0': 'villain',
        'city-villain-1': 'villain',
        'city-villain-2': 'villain',
        'city-villain-3': 'villain',
        'city-villain-4': 'villain',
      },
      city: ['city-villain-0', 'city-villain-1', 'city-villain-2', 'city-villain-3', 'city-villain-4'],
      woundsPile: [],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      gameState.playerZones['0']!.discard.length,
      0,
      'No wound should be gained when wounds pile is empty',
    );
  });

  it('JSON.stringify(G) succeeds after escape + wound', () => {
    const gameState = createMockGameState({
      deck: ['new-villain'],
      cardTypes: {
        'new-villain': 'villain',
        'city-villain-0': 'villain',
        'city-villain-1': 'villain',
        'city-villain-2': 'villain',
        'city-villain-3': 'villain',
        'city-villain-4': 'villain',
      },
      city: ['city-villain-0', 'city-villain-1', 'city-villain-2', 'city-villain-3', 'city-villain-4'],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    const serialized = JSON.stringify(gameState);
    assert.ok(serialized.length > 0, 'G must be JSON-serializable after escape + wound');
  });
});

describe('bystander attachment on City entry', () => {
  it('on villain City entry: one bystander attached from G.piles.bystanders', () => {
    const gameState = createMockGameState({
      deck: ['villain-a'],
      cardTypes: { 'villain-a': 'villain' },
      bystandersPile: ['bystander-1', 'bystander-2'],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      gameState.attachedBystanders['villain-a'],
      ['bystander-1'],
      'One bystander must be attached to the entering villain',
    );
    assert.equal(
      gameState.piles.bystanders.length,
      1,
      'Bystanders pile must have one fewer bystander',
    );
  });

  it('empty bystander pile on City entry: no attachment, no error', () => {
    const gameState = createMockGameState({
      deck: ['villain-a'],
      cardTypes: { 'villain-a': 'villain' },
      bystandersPile: [],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      !('villain-a' in gameState.attachedBystanders) ||
      gameState.attachedBystanders['villain-a']!.length === 0,
      'No bystander should be attached when pile is empty',
    );
  });
});

describe('bystander award on defeat', () => {
  it('on defeat: attached bystanders move to player victory and mapping entry removed', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
      attachedBystanders: { 'villain-a': ['bystander-1', 'bystander-2'] },
      currentStage: 'main',
    });

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 0 });

    assert.ok(
      gameState.playerZones['0']!.victory.includes('bystander-1'),
      'Bystander-1 must be in player victory',
    );
    assert.ok(
      gameState.playerZones['0']!.victory.includes('bystander-2'),
      'Bystander-2 must be in player victory',
    );
    assert.ok(
      !('villain-a' in gameState.attachedBystanders),
      'Mapping entry for defeated villain must be removed',
    );
  });
});

describe('escape with attached bystanders', () => {
  it('escape with attached bystanders: bystanders returned to supply pile, mapping entry removed, no bystander leak', () => {
    const gameState = createMockGameState({
      deck: ['new-villain'],
      cardTypes: {
        'new-villain': 'villain',
        'city-villain-0': 'villain',
        'city-villain-1': 'villain',
        'city-villain-2': 'villain',
        'city-villain-3': 'villain',
        'city-villain-4': 'villain',
      },
      city: ['city-villain-0', 'city-villain-1', 'city-villain-2', 'city-villain-3', 'city-villain-4'],
      attachedBystanders: { 'city-villain-4': ['bystander-attached-1'] },
      bystandersPile: ['bystander-supply-1'],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      !('city-villain-4' in gameState.attachedBystanders),
      'Mapping entry for escaped villain must be removed',
    );
    assert.ok(
      gameState.piles.bystanders.includes('bystander-attached-1'),
      'Attached bystander must be returned to supply pile',
    );
  });
});
