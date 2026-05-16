/**
 * Reveal pipeline tests for the villain deck subsystem.
 *
 * All tests construct mock G states with pre-populated villainDeck and
 * villainDeckCardTypes. They do not depend on buildVillainDeck (WP-014B).
 *
 * Trigger emission is verified by installing test hooks in G.hookRegistry
 * that return deterministic queueMessage effects, then asserting the
 * expected messages appear in G.messages after revealVillainCard runs.
 *
 * Uses node:test and node:assert only. Uses makeMockCtx. No boardgame.io
 * imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { revealVillainCard } from './villainDeck.reveal.js';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { RevealedCardType, VillainDeckState } from './villainDeck.types.js';
import type { HookDefinition, RuleEffect } from '../rules/ruleHooks.types.js';
import type { ImplementationMap } from '../rules/ruleRuntime.execute.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { TURN_STAGES } from '../turn/turnPhases.types.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import { DEFAULT_IMPLEMENTATION_MAP } from '../rules/ruleRuntime.impl.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';

// ---------------------------------------------------------------------------
// Test hook infrastructure
// ---------------------------------------------------------------------------

/** Stable identifier for the test reveal hook. */
const TEST_REVEAL_HOOK_ID = 'test-reveal-hook';

/**
 * Creates a HookDefinition that subscribes to the given triggers.
 * The handler encodes the trigger name and card ID into a queueMessage effect
 * so tests can observe which triggers fired and with what payload.
 */
function createTestHookDefinition(
  triggers: HookDefinition['triggers'],
): HookDefinition {
  return {
    id: TEST_REVEAL_HOOK_ID,
    kind: 'scheme',
    sourceId: 'test-source',
    triggers,
    priority: 1,
  };
}

/**
 * Handler for the test reveal hook. Returns a queueMessage effect encoding
 * the trigger name and cardId from the payload.
 */
function testRevealHandler(
  _gameState: LegendaryGameState,
  _ctx: unknown,
  payload: unknown,
): RuleEffect[] {
  const typedPayload = payload as { cardId?: string; cardTypeSlug?: string };
  const cardId = typedPayload.cardId ?? 'unknown';
  const cardTypeSlug = typedPayload.cardTypeSlug ?? '';
  const suffix = cardTypeSlug ? `:type:${cardTypeSlug}` : '';
  return [
    { type: 'queueMessage', message: `test-trigger:cardId:${cardId}${suffix}` },
  ];
}

/**
 * Builds an ImplementationMap that includes the test reveal hook handler
 * alongside the default implementations.
 */
function createTestImplementationMap(): ImplementationMap {
  return {
    ...DEFAULT_IMPLEMENTATION_MAP,
    [TEST_REVEAL_HOOK_ID]: testRevealHandler,
  };
}

// ---------------------------------------------------------------------------
// Mock G factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for reveal tests.
 * All fields required by LegendaryGameState are present. The villainDeck
 * and villainDeckCardTypes are populated with the provided test data.
 */
function createMockGameState(options: {
  deck: CardExtId[];
  discard: CardExtId[];
  cardTypes: Record<CardExtId, RevealedCardType>;
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
    playerZones: {},
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
    turnEconomy: { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
    city: initializeCity(),
    hq: initializeHq(),
    mastermind: {
      id: 'test-mastermind' as CardExtId,
      baseCardId: 'test-mastermind-base' as CardExtId,
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
    },
    scheme: { twistPile: [] },
    escapedPile: [],
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
  };
}

/**
 * Creates a mock MoveContext for revealVillainCard.
 * Uses makeMockCtx for the random provider and adds required boardgame.io
 * move context fields.
 */
function createMockMoveContext(gameState: LegendaryGameState) {
  const mockCtx = makeMockCtx({ numPlayers: 1 });
  return {
    G: gameState,
    ctx: { ...mockCtx.ctx, currentPlayer: '0', phase: 'play', turn: 1, numMoves: 0, playOrder: ['0'], playOrderPos: 0, activePlayers: null },
    random: mockCtx.random,
    events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
    playerID: '0' as string,
    log: { setMetadata: () => {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('revealVillainCard', () => {
  it('draws the top card from G.villainDeck.deck', () => {
    const gameState = createMockGameState({
      deck: ['card-a', 'card-b', 'card-c'],
      discard: [],
      cardTypes: { 'card-a': 'villain', 'card-b': 'villain', 'card-c': 'villain' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      !moveContext.G.villainDeck.deck.includes('card-a'),
      'card-a must be removed from deck after reveal',
    );
    assert.equal(
      moveContext.G.villainDeck.deck.length,
      2,
      'Deck must have 2 cards remaining after revealing 1',
    );
    assert.equal(
      moveContext.G.villainDeck.deck[0],
      'card-b',
      'card-b must be the new top of deck',
    );
  });

  it('places the revealed villain card in G.city[0], not discard', () => {
    const gameState = createMockGameState({
      deck: ['card-a', 'card-b'],
      discard: [],
      cardTypes: { 'card-a': 'villain', 'card-b': 'villain' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.city[0],
      'card-a',
      'card-a must be in city space 0 after reveal',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('card-a'),
      'card-a must NOT be in discard (villain cards go to City)',
    );
  });

  it('onCardRevealed trigger fires with correct cardId and cardTypeSlug', () => {
    const testHook = createTestHookDefinition(['onCardRevealed']);
    const gameState = createMockGameState({
      deck: ['villain-card-001'],
      discard: [],
      cardTypes: { 'villain-card-001': 'villain' },
      hookDefinitions: [testHook],
    });

    // why: We must replace the default implementation map with one that
    // includes our test handler. Since revealVillainCard uses the module-level
    // DEFAULT_IMPLEMENTATION_MAP, we need our test hook to be in that map.
    // We work around this by directly manipulating the map for testing.
    const originalHandler = DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID];
    DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID] = testRevealHandler;

    try {
      const moveContext = createMockMoveContext(gameState);
      revealVillainCard(moveContext);

      const triggerMessage = moveContext.G.messages.find(
        (message) => message.startsWith('test-trigger:'),
      );
      assert.ok(
        triggerMessage,
        'G.messages must contain a test-trigger message after reveal',
      );
      assert.ok(
        triggerMessage.includes('cardId:villain-card-001'),
        'Trigger message must contain the correct cardId',
      );
      assert.ok(
        triggerMessage.includes('type:villain'),
        'Trigger message must contain the correct cardTypeSlug',
      );
    } finally {
      if (originalHandler) {
        DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID] = originalHandler;
      } else {
        delete DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID];
      }
    }
  });

  it('onSchemeTwistRevealed fires only when card type is scheme-twist', () => {
    const testHook = createTestHookDefinition([
      'onCardRevealed',
      'onSchemeTwistRevealed',
    ]);
    const gameState = createMockGameState({
      deck: ['twist-card-001'],
      discard: [],
      cardTypes: { 'twist-card-001': 'scheme-twist' },
      hookDefinitions: [testHook],
    });

    DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID] = testRevealHandler;

    try {
      const moveContext = createMockMoveContext(gameState);
      revealVillainCard(moveContext);

      const triggerMessages = moveContext.G.messages.filter(
        (message) => message.startsWith('test-trigger:'),
      );
      assert.equal(
        triggerMessages.length,
        2,
        'Two test-trigger messages expected: onCardRevealed + onSchemeTwistRevealed',
      );
    } finally {
      delete DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID];
    }
  });

  it('onSchemeTwistRevealed does NOT fire for villain cards', () => {
    const testHook = createTestHookDefinition([
      'onCardRevealed',
      'onSchemeTwistRevealed',
    ]);
    const gameState = createMockGameState({
      deck: ['villain-card-001'],
      discard: [],
      cardTypes: { 'villain-card-001': 'villain' },
      hookDefinitions: [testHook],
    });

    DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID] = testRevealHandler;

    try {
      const moveContext = createMockMoveContext(gameState);
      revealVillainCard(moveContext);

      const triggerMessages = moveContext.G.messages.filter(
        (message) => message.startsWith('test-trigger:'),
      );
      assert.equal(
        triggerMessages.length,
        1,
        'Only onCardRevealed should fire for villain cards, not onSchemeTwistRevealed',
      );
    } finally {
      delete DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID];
    }
  });

  it('onMastermindStrikeRevealed fires only when card type is mastermind-strike', () => {
    const testHook = createTestHookDefinition([
      'onCardRevealed',
      'onMastermindStrikeRevealed',
    ]);
    const gameState = createMockGameState({
      deck: ['strike-card-001'],
      discard: [],
      cardTypes: { 'strike-card-001': 'mastermind-strike' },
      hookDefinitions: [testHook],
    });

    DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID] = testRevealHandler;

    try {
      const moveContext = createMockMoveContext(gameState);
      revealVillainCard(moveContext);

      const triggerMessages = moveContext.G.messages.filter(
        (message) => message.startsWith('test-trigger:'),
      );
      assert.equal(
        triggerMessages.length,
        2,
        'Two test-trigger messages expected: onCardRevealed + onMastermindStrikeRevealed',
      );
    } finally {
      delete DEFAULT_IMPLEMENTATION_MAP[TEST_REVEAL_HOOK_ID];
    }
  });

  it('reshuffles discard into deck when deck is empty but discard has cards', () => {
    const gameState = createMockGameState({
      deck: [],
      discard: ['card-x', 'card-y', 'card-z'],
      cardTypes: { 'card-x': 'villain', 'card-y': 'henchman', 'card-z': 'bystander' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    // makeMockCtx reverses arrays, so deck becomes ['card-z','card-y','card-x'].
    // Top card 'card-z' is a bystander and goes to discard. Villain/henchman
    // would go to City. Total cards across deck + discard + city must equal 3.
    const cityCards = moveContext.G.city.filter(
      (space: string | null) => space !== null,
    ).length;
    const totalCards =
      moveContext.G.villainDeck.deck.length +
      moveContext.G.villainDeck.discard.length +
      cityCards;
    assert.equal(
      totalCards,
      3,
      'Total cards across deck + discard + city must remain 3 after reshuffle + reveal',
    );
  });

  it('returns with message when both deck and discard are empty', () => {
    const gameState = createMockGameState({
      deck: [],
      discard: [],
      cardTypes: {},
    });

    const moveContext = createMockMoveContext(gameState);
    const messagesBefore = moveContext.G.messages.length;
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.villainDeck.deck.length,
      0,
      'Deck must remain empty',
    );
    assert.equal(
      moveContext.G.villainDeck.discard.length,
      0,
      'Discard must remain empty',
    );
    assert.ok(
      moveContext.G.messages.length > messagesBefore,
      'A message must be appended when both deck and discard are empty',
    );
  });

  it('JSON.stringify(G) succeeds after reveal', () => {
    const gameState = createMockGameState({
      deck: ['card-a', 'card-b'],
      discard: ['card-c'],
      cardTypes: { 'card-a': 'villain', 'card-b': 'henchman', 'card-c': 'bystander' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    const serialized = JSON.stringify(moveContext.G);
    assert.ok(
      serialized,
      'JSON.stringify(G) must produce a non-empty string after reveal',
    );
  });

  it('fails closed when cardType is missing from villainDeckCardTypes', () => {
    const gameState = createMockGameState({
      deck: ['unknown-card-001', 'card-b'],
      discard: [],
      cardTypes: { 'card-b': 'villain' },
    });

    const moveContext = createMockMoveContext(gameState);
    const deckBefore = [...moveContext.G.villainDeck.deck];
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.villainDeck.deck,
      deckBefore,
      'Deck must remain unchanged when cardType is missing (fail-closed)',
    );
    assert.equal(
      moveContext.G.villainDeck.discard.length,
      0,
      'Discard must remain empty when cardType is missing',
    );
    assert.ok(
      moveContext.G.messages.some((message) =>
        message.includes('unknown-card-001'),
      ),
      'A message mentioning the missing card must be appended',
    );
  });

  it('stage gating: no-op when G.currentStage is not start', () => {
    const gameState = createMockGameState({
      deck: ['card-a', 'card-b'],
      discard: [],
      cardTypes: { 'card-a': 'villain', 'card-b': 'villain' },
    });

    // Set stage to 'main' — reveal should be gated out
    gameState.currentStage = 'main';

    const moveContext = createMockMoveContext(gameState);
    const deckBefore = [...moveContext.G.villainDeck.deck];
    const messagesBefore = moveContext.G.messages.length;

    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.villainDeck.deck,
      deckBefore,
      'Deck must remain unchanged when stage is not start',
    );
    assert.equal(
      moveContext.G.villainDeck.discard.length,
      0,
      'Discard must remain empty when stage is not start',
    );
    assert.equal(
      moveContext.G.messages.length,
      messagesBefore,
      'No messages appended when stage gate blocks (silent return)',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-153: Destination pile routing tests
// ---------------------------------------------------------------------------

describe('revealVillainCard — destination pile routing (WP-153)', () => {
  it('routes scheme-twist to G.scheme.twistPile, not discard', () => {
    const gameState = createMockGameState({
      deck: ['twist-001'],
      discard: [],
      cardTypes: { 'twist-001': 'scheme-twist' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      moveContext.G.scheme.twistPile.includes('twist-001'),
      'scheme-twist card must be in G.scheme.twistPile',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('twist-001'),
      'scheme-twist card must NOT be in villainDeck.discard',
    );
  });

  it('routes mastermind-strike to G.mastermind.strikePile, not discard', () => {
    const gameState = createMockGameState({
      deck: ['strike-001'],
      discard: [],
      cardTypes: { 'strike-001': 'mastermind-strike' },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      moveContext.G.mastermind.strikePile.includes('strike-001'),
      'mastermind-strike card must be in G.mastermind.strikePile',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('strike-001'),
      'mastermind-strike card must NOT be in villainDeck.discard',
    );
  });

  it('pushes escaped villain to G.escapedPile when escapedCard is non-null', () => {
    const gameState = createMockGameState({
      deck: ['new-villain'],
      discard: [],
      cardTypes: { 'new-villain': 'villain' },
    });
    gameState.city = [
      'city-0' as CardExtId,
      'city-1' as CardExtId,
      'city-2' as CardExtId,
      'city-3' as CardExtId,
      'city-4' as CardExtId,
    ];
    gameState.playerZones = { '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] } };
    gameState.piles.wounds = ['wound-1' as CardExtId];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.ok(
      moveContext.G.escapedPile.includes('city-4'),
      'Escaped villain (city-4) must be in G.escapedPile',
    );
  });

  it('does not push to escapedPile when no villain is displaced (empty city)', () => {
    const gameState = createMockGameState({
      deck: ['new-villain'],
      discard: [],
      cardTypes: { 'new-villain': 'villain' },
    });
    gameState.playerZones = { '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] } };

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.escapedPile.length,
      0,
      'escapedPile must remain empty when no card is displaced',
    );
  });

  it('preserves insertion order across multiple scheme-twist reveals', () => {
    const gameState = createMockGameState({
      deck: ['twist-a', 'twist-b', 'twist-c'],
      discard: [],
      cardTypes: {
        'twist-a': 'scheme-twist',
        'twist-b': 'scheme-twist',
        'twist-c': 'scheme-twist',
      },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);
    revealVillainCard(moveContext);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.scheme.twistPile,
      ['twist-a', 'twist-b', 'twist-c'],
      'twistPile must preserve chronological insertion order',
    );
  });

  it('preserves insertion order across multiple mastermind-strike reveals', () => {
    const gameState = createMockGameState({
      deck: ['strike-a', 'strike-b'],
      discard: [],
      cardTypes: {
        'strike-a': 'mastermind-strike',
        'strike-b': 'mastermind-strike',
      },
    });

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.mastermind.strikePile,
      ['strike-a', 'strike-b'],
      'strikePile must preserve chronological insertion order',
    );
  });
});
