/**
 * City integration tests for the villain deck reveal pipeline (WP-015).
 *
 * Verifies that revealVillainCard correctly routes villains and henchmen
 * to the City, leaves the City unchanged for other card types, increments
 * the escape counter, and maintains G.hq immutability.
 *
 * Uses node:test and node:assert only. Uses makeMockCtx. No boardgame.io
 * imports for test setup.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { revealVillainCard } from './villainDeck.reveal.js';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { RevealedCardType } from './villainDeck.types.js';
import type { HookDefinition } from '../rules/ruleHooks.types.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { TURN_STAGES } from '../turn/turnPhases.types.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';

// ---------------------------------------------------------------------------
// Mock G factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for city integration tests.
 * Includes city and hq fields.
 */
function createMockGameState(options: {
  deck: CardExtId[];
  discard: CardExtId[];
  cardTypes: Record<CardExtId, RevealedCardType>;
  city?: LegendaryGameState['city'];
  hookDefinitions?: HookDefinition[];
}): LegendaryGameState {
  const config = {
    schemeId: 'test-scheme',
    mastermindId: 'test-mastermind',
    villainGroupIds: ['test-villain-group'],
    henchmanGroupIds: ['test-henchman-group'],
    heroDeckIds: ['test-hero-deck'],
    bystandersCount: 1,
    woundsCount: 1,
    officersCount: 1,
    sidekicksCount: 1,
  };

  const defaultHooks = buildDefaultHookDefinitions(config);
  const additionalHooks = options.hookDefinitions ?? [];

  return {
    matchConfiguration: config,
    selection: {
      schemeId: config.schemeId,
      mastermindId: config.mastermindId,
      villainGroupIds: [...config.villainGroupIds],
      henchmanGroupIds: [...config.henchmanGroupIds],
      heroDeckIds: [...config.heroDeckIds],
    },
    currentStage: TURN_STAGES[0]!,
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
      bystanders: [],
      wounds: [],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: [...defaultHooks, ...additionalHooks],
    villainDeck: {
      deck: options.deck,
      discard: options.discard,
    },
    villainDeckCardTypes: options.cardTypes,
    ko: [],
    attachedBystanders: {},
    mastermind: {
      id: 'test-mastermind' as CardExtId,
      baseCardId: 'test-mastermind-base' as CardExtId,
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
    },
    scheme: { twistPile: [] },
    escapedPile: [],
    city: options.city ?? initializeCity(),
    hq: initializeHq(),
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
  };
}

/**
 * Creates a mock MoveContext for revealVillainCard.
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
      activePlayers: null,
    },
    random: mockCtx.random,
    events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
    playerID: '0' as string,
    log: { setMetadata: () => {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('revealVillainCard — City integration', () => {
  it('villain reveal places card in G.city[0]', () => {
    const gameState = createMockGameState({
      deck: ['villain-card-001', 'villain-card-002'],
      discard: [],
      cardTypes: {
        'villain-card-001': 'villain',
        'villain-card-002': 'villain',
      },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.city[0],
      'villain-card-001',
      'Villain must be placed at city space 0',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('villain-card-001'),
      'Villain must NOT be in discard (it is in the City)',
    );
  });

  it('henchman reveal places card in G.city[0]', () => {
    const gameState = createMockGameState({
      deck: ['henchman-card-001'],
      discard: [],
      cardTypes: { 'henchman-card-001': 'henchman' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.city[0],
      'henchman-card-001',
      'Henchman must be placed at city space 0',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('henchman-card-001'),
      'Henchman must NOT be in discard',
    );
  });

  it('scheme-twist reveal does NOT modify G.city', () => {
    const gameState = createMockGameState({
      deck: ['twist-card-001'],
      discard: [],
      cardTypes: { 'twist-card-001': 'scheme-twist' },
    });

    const cityBefore = [...gameState.city];
    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.city,
      cityBefore,
      'City must NOT be modified by scheme-twist reveal',
    );
    assert.ok(
      moveContext.G.scheme.twistPile.includes('twist-card-001'),
      'Scheme-twist must go to G.scheme.twistPile',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('twist-card-001'),
      'Scheme-twist must NOT go to discard',
    );
  });

  it('mastermind-strike reveal does NOT modify G.city', () => {
    const gameState = createMockGameState({
      deck: ['strike-card-001'],
      discard: [],
      cardTypes: { 'strike-card-001': 'mastermind-strike' },
    });

    const cityBefore = [...gameState.city];
    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.city,
      cityBefore,
      'City must NOT be modified by mastermind-strike reveal',
    );
    assert.ok(
      moveContext.G.mastermind.strikePile.includes('strike-card-001'),
      'Mastermind-strike must go to G.mastermind.strikePile',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('strike-card-001'),
      'Mastermind-strike must NOT go to discard',
    );
  });

  it('escape increments G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS]', () => {
    // Fill city so next push causes escape
    const gameState = createMockGameState({
      deck: ['villain-new'],
      discard: [],
      cardTypes: { 'villain-new': 'villain' },
      city: ['v1', 'v2', 'v3', 'v4', 'v5'],
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS],
      1,
      'Escape counter must be incremented to 1',
    );
    assert.ok(
      moveContext.G.messages.some((message) => message.includes('escaped')),
      'An escape message must be in G.messages',
    );
  });

  it('JSON.stringify(G) succeeds after reveal + city placement', () => {
    const gameState = createMockGameState({
      deck: ['villain-card-001'],
      discard: [],
      cardTypes: { 'villain-card-001': 'villain' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    const serialized = JSON.stringify(moveContext.G);
    assert.ok(
      serialized,
      'JSON.stringify(G) must produce a non-empty string after city placement',
    );
  });

  it('G.hq remains unchanged (all null) after villain reveals', () => {
    const gameState = createMockGameState({
      deck: ['villain-a', 'villain-b', 'henchman-c'],
      discard: [],
      cardTypes: {
        'villain-a': 'villain',
        'villain-b': 'villain',
        'henchman-c': 'henchman',
      },
    });

    const hqBefore = [...gameState.hq];
    const moveContext = createMockMoveContext(gameState);

    // Reveal all three cards
    revealVillainCard(moveContext);
    revealVillainCard(moveContext);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.hq,
      hqBefore,
      'G.hq must remain all null after villain/henchman reveals',
    );
  });

  it('malformed G.city causes safe failure: card remains in deck, no counter increment, no throw', () => {
    const gameState = createMockGameState({
      deck: ['villain-card-001'],
      discard: [],
      cardTypes: { 'villain-card-001': 'villain' },
    });

    // Deliberately corrupt city to a non-5-element array
    (gameState as unknown as Record<string, unknown>).city = [null, null, null];

    const moveContext = createMockMoveContext(gameState);
    const counterBefore = moveContext.G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0;
    const deckBefore = [...moveContext.G.villainDeck.deck];

    // Should not throw
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.villainDeck.deck,
      deckBefore,
      'Deck must remain unchanged when city is malformed (card stays on top)',
    );
    assert.equal(
      moveContext.G.villainDeck.discard.length,
      0,
      'Discard must remain empty when city is malformed',
    );
    assert.equal(
      moveContext.G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0,
      counterBefore,
      'Counter must not increment when city is malformed',
    );
    assert.ok(
      moveContext.G.messages.some((message) => message.includes('malformed')),
      'A malformed-city message must be in G.messages',
    );
  });
});
