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
import type { VillainAbilityHook } from '../rules/villainAbility.types.js';
import type { BoardKeyword } from '../board/boardKeywords.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { TURN_STAGES } from '../turn/turnPhases.types.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import { DEFAULT_IMPLEMENTATION_MAP } from '../rules/ruleRuntime.impl.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';

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
  /** Per-card villain ability hooks (WP-185 / WP-186). Empty by default. */
  villainAbilityHooks?: VillainAbilityHook[];
  /** Per-card board keywords (e.g., `ambush` from buildCardKeywords). */
  cardKeywords?: Record<CardExtId, BoardKeyword[]>;
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
    villainAbilityHooks: options.villainAbilityHooks ?? [],
    cardKeywords: options.cardKeywords ?? {},
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
    // why: WP-200 — the Ambush branch pushes one `ambushResolved` event
    // and the scheme-twist / mastermind-strike paths (via their
    // handlers) push their own events. Initialised here so the emissions
    // do not throw on a missing field.
    notableEvents: [],
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
    // Top card 'card-z' is a bystander; with the empty City, it attaches to
    // the Mastermind. Villain/henchman would go to City. Total cards across
    // deck + discard + city + attachedBystanders must equal 3.
    const cityCards = moveContext.G.city.filter(
      (space: string | null) => space !== null,
    ).length;
    let attachedCount = 0;
    for (const attached of Object.values(moveContext.G.attachedBystanders)) {
      attachedCount += attached.length;
    }
    const totalCards =
      moveContext.G.villainDeck.deck.length +
      moveContext.G.villainDeck.discard.length +
      cityCards +
      attachedCount;
    assert.equal(
      totalCards,
      3,
      'Total cards across deck + discard + city + attachedBystanders must remain 3 after reshuffle + reveal',
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

// ---------------------------------------------------------------------------
// Bystander capture routing — frontmost villain or mastermind
// ---------------------------------------------------------------------------

describe('revealVillainCard — bystander capture routing', () => {
  it('attaches bystander to frontmost villain (highest occupied city index)', () => {
    const gameState = createMockGameState({
      deck: ['bystander-001'],
      discard: [],
      cardTypes: { 'bystander-001': 'bystander' },
    });
    // city[3] is the frontmost occupied slot (closest to escape edge at 4)
    gameState.city = [
      'villain-back' as CardExtId,
      null,
      'villain-middle' as CardExtId,
      'villain-front' as CardExtId,
      null,
    ];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.attachedBystanders['villain-front'],
      ['bystander-001'],
      'Bystander must be attached to the frontmost villain (city[3])',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('bystander-001'),
      'Bystander must NOT be routed to villain deck discard',
    );
    assert.equal(
      moveContext.G.attachedBystanders['villain-middle'],
      undefined,
      'No bystander should attach to villain-middle',
    );
    assert.equal(
      moveContext.G.attachedBystanders['villain-back'],
      undefined,
      'No bystander should attach to villain-back',
    );
  });

  it('attaches bystander to mastermind when city is empty', () => {
    const gameState = createMockGameState({
      deck: ['bystander-001'],
      discard: [],
      cardTypes: { 'bystander-001': 'bystander' },
    });
    // City stays empty (initializeCity returns all nulls)

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.attachedBystanders['test-mastermind-base'],
      ['bystander-001'],
      'Bystander must attach to G.mastermind.baseCardId when city is empty',
    );
    assert.ok(
      !moveContext.G.villainDeck.discard.includes('bystander-001'),
      'Bystander must NOT be routed to villain deck discard',
    );
  });

  it('appends to existing attached bystanders without overwriting', () => {
    const gameState = createMockGameState({
      deck: ['bystander-002'],
      discard: [],
      cardTypes: { 'bystander-002': 'bystander' },
    });
    gameState.city = [
      null,
      null,
      null,
      null,
      'villain-frontmost' as CardExtId,
    ];
    gameState.attachedBystanders = {
      'villain-frontmost': ['bystander-existing' as CardExtId],
    };

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.attachedBystanders['villain-frontmost'],
      ['bystander-existing', 'bystander-002'],
      'New bystander must be appended to existing attached list',
    );
  });

  it('logs a G.messages entry naming the captor', () => {
    const gameState = createMockGameState({
      deck: ['bystander-001'],
      discard: [],
      cardTypes: { 'bystander-001': 'bystander' },
    });
    gameState.city = [
      null,
      null,
      null,
      null,
      'villain-frontmost' as CardExtId,
    ];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    const captureMessage = moveContext.G.messages.find(
      (message) =>
        message.includes('bystander-001') &&
        message.includes('villain-frontmost'),
    );
    assert.ok(
      captureMessage,
      'G.messages must contain an entry naming both the bystander and captor',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-186: villain & henchman Escape + Overrun effect fire site
// ---------------------------------------------------------------------------

describe('revealVillainCard — onEscape fire site (WP-186 §Files #7a)', () => {
  it('escaped villain carrying [effect:gainWoundEachPlayer] fires on all players AND preserves the pre-existing escape branch order', () => {
    // why: WP-186 appended one executeVillainAbilities(..., 'onEscape') call
    // inside the existing escape branch AFTER resolveEscapedBystanders. This
    // integration test asserts (a) the new card-text effect fires on a real
    // escape, (b) it does NOT replace the generic WP-015 escape wound (which
    // still hits the current player), and (c) the pre-existing escape branch
    // body — counter increment, escape-pile push, generic wound, bystander
    // release — all still occur in the same order.
    const escapedCardId = 'core-villain-spider-foes-venom-00' as CardExtId;
    const gameState = createMockGameState({
      deck: ['new-villain' as CardExtId],
      discard: [],
      cardTypes: { 'new-villain': 'villain' },
      villainAbilityHooks: [
        {
          cardId: escapedCardId,
          timing: 'onEscape',
          keywords: ['gainWoundEachPlayer'],
          effects: ['gainWoundEachPlayer'],
        },
      ],
    });
    gameState.city = [
      'c0' as CardExtId,
      'c1' as CardExtId,
      'c2' as CardExtId,
      'c3' as CardExtId,
      escapedCardId,
    ];
    gameState.playerZones = {
      '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
    };
    gameState.piles.wounds = [
      'w0',
      'w1',
      'w2',
      'w3',
      'w4',
    ] as CardExtId[];
    // Attach a bystander to the escaped card so the release step is exercised.
    // Pre-populate the supply pile with another bystander so that the
    // newly-entering villain's attachBystanderToVillain step (which runs
    // AFTER the escape branch) consumes the existing one and leaves the
    // released bystander still observable in the supply pile.
    gameState.attachedBystanders = {
      [escapedCardId]: ['attached-bystander' as CardExtId],
    };
    gameState.piles.bystanders = ['existing-bystander'] as CardExtId[];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    // (a) Counter increment — ENDGAME_CONDITIONS.ESCAPED_VILLAINS = 1.
    assert.equal(
      moveContext.G.counters['escapedVillains'],
      1,
      'escape counter must increment by 1',
    );
    // (b) Escape pile contains the escaped card.
    assert.ok(
      moveContext.G.escapedPile.includes(escapedCardId),
      'escaped card must be in G.escapedPile',
    );
    // (c) Bystander release ran — attached bystander returned to supply.
    assert.equal(
      moveContext.G.attachedBystanders[escapedCardId],
      undefined,
      'attached bystander must be released from the escaped card',
    );
    assert.ok(
      moveContext.G.piles.bystanders.includes('attached-bystander' as CardExtId),
      'released bystander must return to the supply pile',
    );
    // (d) WP-015 generic current-player wound PRESERVED (p0 gets 1 generic
    // wound) AND new gainWoundEachPlayer card-text effect layers on top.
    // p0 total = 1 generic + 1 each-player = 2; p1 total = 1 each-player.
    assert.equal(
      moveContext.G.playerZones['0']!.discard.length,
      2,
      'current player gets generic WP-015 wound + onEscape gainWoundEachPlayer wound',
    );
    assert.equal(
      moveContext.G.playerZones['1']!.discard.length,
      1,
      'other player gets onEscape gainWoundEachPlayer wound only (no generic)',
    );
    assert.equal(
      moveContext.G.piles.wounds.length,
      5 - 3,
      'wound pool decreased by 3 (1 generic + 2 each-player)',
    );
    // (e) Order proof — the escape message precedes the wound message which
    // precedes the bystander release message (existing emission order).
    const escapeMessageIndex = moveContext.G.messages.findIndex((m) =>
      m.includes(`Villain "${escapedCardId}" escaped`),
    );
    const woundMessageIndex = moveContext.G.messages.findIndex((m) =>
      m.includes('gained a wound from villain escape'),
    );
    const releaseMessageIndex = moveContext.G.messages.findIndex((m) =>
      m.includes('Bystanders from escaped villain'),
    );
    assert.ok(escapeMessageIndex >= 0, 'escape message present');
    assert.ok(woundMessageIndex > escapeMessageIndex, 'wound message follows escape message');
    assert.ok(
      releaseMessageIndex > woundMessageIndex,
      'bystander release message follows wound message',
    );
  });

  it('escaped card with no onEscape hook safely no-ops (per-card hook lookup misses)', () => {
    // why: this is the henchman-shape case — no onEscape hook authored for
    // the card, so executeVillainAbilities reaches the per-card lookup,
    // returns an empty array, and the for-of loop never executes. The
    // mechanical escape behavior (counter, pile, generic wound, release)
    // must still fire exactly as before.
    const escapedCardId = 'henchman-doombot-legion-04' as CardExtId;
    const gameState = createMockGameState({
      deck: ['new-villain' as CardExtId],
      discard: [],
      cardTypes: { 'new-villain': 'villain' },
      // No villainAbilityHooks entry for henchman-doombot-legion-04.
      villainAbilityHooks: [],
    });
    gameState.city = [
      'c0' as CardExtId,
      'c1' as CardExtId,
      'c2' as CardExtId,
      'c3' as CardExtId,
      escapedCardId,
    ];
    gameState.playerZones = {
      '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
    };
    gameState.piles.wounds = ['w0', 'w1'] as CardExtId[];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.counters['escapedVillains'],
      1,
      'escape counter still increments for hookless escapes',
    );
    assert.ok(
      moveContext.G.escapedPile.includes(escapedCardId),
      'escaped card still added to G.escapedPile',
    );
    assert.equal(
      moveContext.G.playerZones['0']!.discard.length,
      1,
      'generic WP-015 wound still fires for current player',
    );
    assert.equal(
      moveContext.G.playerZones['1']!.discard.length,
      0,
      'no card-text effect → other player unaffected',
    );
  });
});

describe('revealVillainCard — escape-before-Ambush ordering lock (WP-186 §Files #7b)', () => {
  it('escape effects resolve BEFORE the entering card Ambush effects (finite wound pool fixture)', () => {
    // why: the canonical Reveal → Fight → Side-Effect ordering requires the
    // escaped card's onEscape effects to resolve before the entering card's
    // onAmbush effects, within a single reveal. This holds today by the
    // sequential structure in performVillainReveal (escape branch precedes
    // the hasAmbush block). To pin it, contend a finite wound pool with an
    // asymmetric pair: escaped card carries [effect:gainWoundCurrentPlayer]
    // (single-target), entering card carries [effect:gainWoundEachPlayer]
    // (broadcast). With G.piles.wounds.length = 3 and 2 players:
    //   escape-first (correct): WP-015 wound p0+1 (pool:2), onEscape
    //     gainWoundCurrentPlayer p0+1 (pool:1), onAmbush gainWoundEachPlayer
    //     p0+1 (pool:0) then p1 skipped (pool empty). Result: {p0:3, p1:0}.
    //   ambush-first (broken refactor): WP-015 wound p0+1 (pool:2), onAmbush
    //     gainWoundEachPlayer p0+1 (pool:1) then p1+1 (pool:0), onEscape
    //     gainWoundCurrentPlayer no-op (pool empty). Result: {p0:2, p1:1}.
    // The two orderings yield non-commutative per-player distributions.
    const escapedCardId = 'escaped-card' as CardExtId;
    const enteringCardId = 'entering-card' as CardExtId;
    const gameState = createMockGameState({
      deck: [enteringCardId],
      discard: [],
      cardTypes: { [enteringCardId]: 'villain' },
      villainAbilityHooks: [
        {
          cardId: escapedCardId,
          timing: 'onEscape',
          keywords: ['gainWoundCurrentPlayer'],
          effects: ['gainWoundCurrentPlayer'],
        },
        {
          cardId: enteringCardId,
          timing: 'onAmbush',
          keywords: ['gainWoundEachPlayer'],
          effects: ['gainWoundEachPlayer'],
        },
      ],
      // why: hasAmbush gates the entering card's onAmbush fire site —
      // without the 'ambush' keyword the gate returns false and the test
      // could not distinguish the orderings. Mirrors what buildCardKeywords
      // would emit at setup time for a card carrying an Ambush: line.
      cardKeywords: {
        [enteringCardId]: ['ambush'],
      },
    });
    gameState.city = [
      'c0' as CardExtId,
      'c1' as CardExtId,
      'c2' as CardExtId,
      'c3' as CardExtId,
      escapedCardId,
    ];
    gameState.playerZones = {
      '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
    };
    gameState.piles.wounds = ['w0', 'w1', 'w2'] as CardExtId[];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.equal(
      moveContext.G.playerZones['0']!.discard.length,
      3,
      'escape-first ordering: p0 gets generic WP-015 + onEscape gainWoundCurrentPlayer + onAmbush gainWoundEachPlayer (pool exhausts at p0)',
    );
    assert.equal(
      moveContext.G.playerZones['1']!.discard.length,
      0,
      'escape-first ordering: p1 gets nothing — pool empty by the time onAmbush iterates to player 1',
    );
    assert.equal(
      moveContext.G.piles.wounds.length,
      0,
      'wound pool fully exhausted',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-186 §Files #7c — real-registry villain + henchman end-to-end
// ---------------------------------------------------------------------------

/**
 * Builds a registry whose villain group includes one Venom-shaped card
 * (copies:1) carrying the real WP-188 `Escape: ... [effect:gainWoundEachPlayer]`
 * line. Mirrors the precedent shape used by
 * `setup/extIdReconciliation.e2e.test.ts §buildPopulatedRegistry`.
 */
function buildEscapeRegistry(): CardRegistryReader {
  const setData = {
    abbr: 'core',
    villains: [
      {
        slug: 'spider-foes',
        cards: [
          {
            slug: 'venom',
            copies: 1,
            vAttack: '5',
            abilities: [
              "You can't defeat Venom unless you have a [hc:covert] Hero.",
              'Escape: Each player gains a Wound. [effect:gainWoundEachPlayer]',
            ],
          },
          {
            slug: 'green-goblin',
            copies: 2,
            vAttack: '5',
            abilities: ['Ambush: Green Goblin captures a Bystander. [effect:captureBystander]'],
          },
        ],
      },
    ],
    henchmen: [
      {
        slug: 'doombot-legion',
        vAttack: '3',
        abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
      },
    ],
    masterminds: [
      {
        slug: 'doc-ock',
        cards: [
          { name: 'Doctor Octopus', slug: 'doc-ock-base', tactic: false, vAttack: '8', abilities: [] },
          { name: 'Tentacle Slam', slug: 'tentacle-slam', tactic: true, vAttack: '5', abilities: [] },
        ],
      },
    ],
    schemes: [{ slug: 'bank-job', cards: [{ abilities: [] }] }],
    heroes: [
      {
        slug: 'spider-man',
        cards: [
          { slug: 'web-strike', name: 'Web Strike', rarityLabel: 'Common 1', attack: '2', recruit: null, cost: 0, abilities: ['You get +1[icon:attack].'] },
          { slug: 'spider-sense', name: 'Spider Sense', rarityLabel: 'Common 2', attack: null, recruit: '2', cost: 3, abilities: ['You get +1[icon:recruit].'] },
          { slug: 'wall-crawl', name: 'Wall Crawl', rarityLabel: 'Uncommon', attack: '1', recruit: '1', cost: 4, abilities: ['You get +1[icon:attack].'] },
          { slug: 'the-amazing', name: 'The Amazing Spider-Man', rarityLabel: 'Rare', attack: '4', recruit: null, cost: 6, abilities: ['You get +3[icon:attack].'] },
        ],
        physicalCards: [
          { id: 'p1', count: 5, sides: ['web-strike'] },
          { id: 'p2', count: 3, sides: ['spider-sense'] },
          { id: 'p3', count: 3, sides: ['wall-crawl'] },
          { id: 'p4', count: 3, sides: ['the-amazing'] },
        ],
      },
    ],
    bystanders: [],
    wounds: [],
    other: [],
  };

  // why: buildCardKeywords gates `ambush` emission on the villain definition
  // key existing in listCards (a real listed villain). Provide villain
  // FlatCards only — same posture as extIdReconciliation.e2e.test.
  const flatCards = [
    { key: 'core-villain-spider-foes-venom', cardType: 'villain', slug: 'venom', setAbbr: 'core' },
    { key: 'core-villain-spider-foes-green-goblin', cardType: 'villain', slug: 'green-goblin', setAbbr: 'core' },
  ];

  return {
    listCards: () => flatCards,
    listSets: () => [{ abbr: 'core' }],
    getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
  } as unknown as CardRegistryReader;
}

/** The match config the escape end-to-end tests build from. */
function buildEscapeConfig(): MatchSetupConfig {
  return {
    schemeId: 'core/bank-job',
    mastermindId: 'core/doc-ock',
    villainGroupIds: ['core/spider-foes'],
    henchmanGroupIds: ['core/doombot-legion'],
    heroDeckIds: ['core/spider-man'],
    bystandersCount: 8,
    woundsCount: 8,
    officersCount: 5,
    sidekicksCount: 5,
  };
}

// ---------------------------------------------------------------------------
// WP-200 — ambushResolved emission
// ---------------------------------------------------------------------------

describe('revealVillainCard — WP-200 ambushResolved emission', () => {
  it('pushes exactly one ambushResolved event when an ambush villain enters the city', () => {
    const villainExtId = 'villain-ambush-1' as CardExtId;
    const gameState = createMockGameState({
      deck: [villainExtId],
      discard: [],
      cardTypes: { [villainExtId]: 'villain' },
      cardKeywords: { [villainExtId]: ['ambush'] },
      villainAbilityHooks: [
        {
          cardId: villainExtId,
          timing: 'onAmbush',
          keywords: ['gainWoundEachPlayer'],
          effects: ['gainWoundEachPlayer'],
        },
      ],
    });
    gameState.playerZones['0'] = {
      deck: [],
      hand: [],
      discard: [],
      inPlay: [],
      victory: [],
    };
    gameState.piles.wounds = ['w0' as CardExtId];

    const setupCtx = makeMockCtx({ numPlayers: 1 });
    const moveContext = {
      G: gameState,
      ctx: {
        ...setupCtx.ctx,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        numMoves: 0,
        playOrder: ['0'],
        playOrderPos: 0,
        activePlayers: null,
      },
      random: setupCtx.random,
      events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
      playerID: '0' as string,
      log: { setMetadata: () => {} },
    };
    revealVillainCard(moveContext);

    assert.equal(
      gameState.notableEvents.length,
      1,
      'exactly one ambushResolved event must be emitted',
    );
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'ambushResolved');
    if (event.type === 'ambushResolved') {
      assert.equal(event.revealedCardId, villainExtId);
      assert.deepStrictEqual(
        event.appliedEffects,
        ['gainWoundEachPlayer'],
        'appliedEffects mirrors the executor dispatch order',
      );
      assert.ok(
        event.narrative.length > 0 && event.narrative.includes(villainExtId),
        'narrative is non-empty and names the card',
      );
    }
  });

  it('does NOT push ambushResolved when the villain has no Ambush keyword', () => {
    const villainExtId = 'villain-noambush-1' as CardExtId;
    const gameState = createMockGameState({
      deck: [villainExtId],
      discard: [],
      cardTypes: { [villainExtId]: 'villain' },
      cardKeywords: {},
    });
    gameState.playerZones['0'] = {
      deck: [],
      hand: [],
      discard: [],
      inPlay: [],
      victory: [],
    };

    const setupCtx = makeMockCtx({ numPlayers: 1 });
    const moveContext = {
      G: gameState,
      ctx: {
        ...setupCtx.ctx,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        numMoves: 0,
        playOrder: ['0'],
        playOrderPos: 0,
        activePlayers: null,
      },
      random: setupCtx.random,
      events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
      playerID: '0' as string,
      log: { setMetadata: () => {} },
    };
    revealVillainCard(moveContext);

    // why: WP-200 — Ambush emission is gated by `hasAmbush`; without the
    // keyword, no event is pushed (the unconditional bystander attach is
    // NOT an Ambush effect per D-20001-style scoping).
    assert.equal(gameState.notableEvents.length, 0);
  });
});

describe('revealVillainCard — real-registry villain end-to-end (WP-186 §Files #7c; WP-191 consumption)', () => {
  it('a real Venom escape fires its Escape: [effect:gainWoundEachPlayer] marker on every player', () => {
    // why: this is the test that would have FAILED under the D-18508 grammar
    // gap (villain hooks keyed by the definition id while zones carried the
    // copy-indexed instance id) and PASSES under WP-191's reconciliation
    // (D-18704..D-18708). It builds the initial state via buildInitialGameState
    // against a registry shaped exactly like the real data/cards/core.json
    // (Venom carries copies:1 and the WP-188-authored escape marker), then
    // pushes a real Venom-00 off the escape edge and asserts every player's
    // wound count increases. A failure here means either (a) §Files #7c not
    // wired correctly, or (b) the WP-191 reconciliation is not being
    // consumed at the new escape fire site — investigate; do NOT dismiss as
    // a known limitation (D-18508 is CLOSED at 20de3ae).
    const config = buildEscapeConfig();
    const registry = buildEscapeRegistry();
    const setupCtx = makeMockCtx({ numPlayers: 2 });
    const gameState = buildInitialGameState(config, registry, setupCtx);

    // Confirm Venom-00 made it into the villain deck under the reconciled
    // zone-instance grammar.
    const venomId = 'core-villain-spider-foes-venom-00' as CardExtId;
    const venomInDeck = gameState.villainDeck.deck.includes(venomId);
    const venomInDiscard = gameState.villainDeck.discard.includes(venomId);
    assert.ok(
      venomInDeck || venomInDiscard,
      'Venom-00 must be present in the villain deck at setup (WP-191 grammar)',
    );

    // Confirm the WP-191 hook lookup hits Venom-00's onEscape entry.
    const venomEscapeHook = gameState.villainAbilityHooks.find(
      (h) => h.cardId === venomId && h.timing === 'onEscape',
    );
    assert.ok(
      venomEscapeHook,
      "Venom-00 must have an onEscape hook keyed by the zone-instance ext_id (WP-191 grammar); if missing, the parser is not consuming WP-188's marker correctly",
    );
    assert.deepStrictEqual(
      venomEscapeHook!.effects,
      ['gainWoundEachPlayer'],
      "Venom-00's onEscape hook must carry the gainWoundEachPlayer effect from WP-188's marker",
    );

    // Force the city: occupy slots 0-3 with arbitrary villain placeholders
    // and place Venom-00 at the escape edge (slot 4). Reveal pushes a fresh
    // card in and pops Venom out. The deck top must be a card whose type is
    // villain or henchman so the reveal routes through the city-push branch
    // (bystanders / scheme-twists / mastermind-strikes go to other piles
    // and would not push Venom off the edge).
    const cityRoutingTypes: Record<string, true> = { villain: true, henchman: true };
    const deckTop = gameState.villainDeck.deck.find(
      (id) =>
        id !== venomId &&
        cityRoutingTypes[gameState.villainDeckCardTypes[id] ?? ''] === true,
    );
    assert.ok(deckTop, 'deck must have a non-Venom villain/henchman card to push Venom off the edge');
    // Re-arrange deck so deckTop is in position [0].
    gameState.villainDeck.deck = [
      deckTop!,
      ...gameState.villainDeck.deck.filter((id) => id !== deckTop),
    ];
    gameState.city = [
      'placeholder-0' as CardExtId,
      'placeholder-1' as CardExtId,
      'placeholder-2' as CardExtId,
      'placeholder-3' as CardExtId,
      venomId,
    ];

    const woundPoolBefore = gameState.piles.wounds.length;
    const p0DiscardBefore = gameState.playerZones['0']!.discard.length;
    const p1DiscardBefore = gameState.playerZones['1']!.discard.length;

    const moveContext = {
      G: gameState,
      ctx: {
        ...setupCtx.ctx,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        numMoves: 0,
        playOrder: ['0', '1'],
        playOrderPos: 0,
        activePlayers: null,
      },
      random: setupCtx.random,
      events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
      playerID: '0' as string,
      log: { setMetadata: () => {} },
    };
    revealVillainCard(moveContext);

    assert.ok(
      gameState.escapedPile.includes(venomId),
      'Venom must be in the escaped pile after the reveal pushes it off the edge',
    );
    // Generic WP-015 escape wound: p0 +1; onEscape gainWoundEachPlayer: p0
    // +1 and p1 +1 (subject to pool availability — pool is sized 8 so all
    // three wounds fit). Expected: p0+2, p1+1.
    assert.equal(
      gameState.playerZones['0']!.discard.length - p0DiscardBefore,
      2,
      'current player gains generic WP-015 wound + onEscape gainWoundEachPlayer wound = 2',
    );
    assert.equal(
      gameState.playerZones['1']!.discard.length - p1DiscardBefore,
      1,
      'other player gains the onEscape gainWoundEachPlayer wound (1) — proves the real-card hook lookup hit',
    );
    assert.equal(
      woundPoolBefore - gameState.piles.wounds.length,
      3,
      'wound pool decreased by exactly 3 (1 generic + 2 each-player)',
    );
  });

  it('a real henchman escape runs the path end-to-end (symmetry: no card-text effect, mechanical state still mutates)', () => {
    // why: paired henchman test for symmetry. Henchman onEscape hooks are
    // not emitted in v1 (the parser's collectHenchmanHookEntries filter
    // excludes every timing except onFight), so executeVillainAbilities
    // safe-skips for henchman escapes via per-card hook lookup. The
    // mechanical escape behavior (counter, pile, generic wound, bystander
    // release) must still fire. This proves the new fire site does not
    // crash on real henchman ext_ids and the path runs end-to-end against
    // the real registry's instance grammar.
    const config = buildEscapeConfig();
    const registry = buildEscapeRegistry();
    const setupCtx = makeMockCtx({ numPlayers: 2 });
    const gameState = buildInitialGameState(config, registry, setupCtx);

    // Find a real henchman instance id in the deck (henchmen are 10 copies
    // 00-09 under the zone-instance grammar; both pre- and post-WP-191).
    const henchmanId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('henchman-doombot-legion-'),
    );
    assert.ok(
      henchmanId,
      'doombot-legion henchman instances must be in the deck at setup',
    );

    // Confirm there is NO onEscape hook for this henchman — symmetry guard
    // pinning the D-18507-class filter for henchman onEscape.
    const henchmanEscapeHook = gameState.villainAbilityHooks.find(
      (h) => h.cardId === henchmanId! && h.timing === 'onEscape',
    );
    assert.equal(
      henchmanEscapeHook,
      undefined,
      'henchman onEscape hooks are not emitted in v1 (parser filter)',
    );

    const cityRoutingTypes: Record<string, true> = { villain: true, henchman: true };
    const deckTop = gameState.villainDeck.deck.find(
      (id) =>
        id !== henchmanId &&
        cityRoutingTypes[gameState.villainDeckCardTypes[id] ?? ''] === true,
    );
    assert.ok(deckTop, 'deck must have a non-this-henchman villain/henchman card to push the henchman off');
    gameState.villainDeck.deck = [
      deckTop!,
      ...gameState.villainDeck.deck.filter((id) => id !== deckTop),
    ];
    gameState.city = [
      'placeholder-0' as CardExtId,
      'placeholder-1' as CardExtId,
      'placeholder-2' as CardExtId,
      'placeholder-3' as CardExtId,
      henchmanId!,
    ];

    const escapedCountBefore = gameState.counters['escapedVillains'] ?? 0;
    const p0DiscardBefore = gameState.playerZones['0']!.discard.length;
    const p1DiscardBefore = gameState.playerZones['1']!.discard.length;

    const moveContext = {
      G: gameState,
      ctx: {
        ...setupCtx.ctx,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        numMoves: 0,
        playOrder: ['0', '1'],
        playOrderPos: 0,
        activePlayers: null,
      },
      random: setupCtx.random,
      events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
      playerID: '0' as string,
      log: { setMetadata: () => {} },
    };
    revealVillainCard(moveContext);

    assert.equal(
      (gameState.counters['escapedVillains'] ?? 0) - escapedCountBefore,
      1,
      'escape counter increments for the henchman escape',
    );
    assert.ok(
      gameState.escapedPile.includes(henchmanId!),
      'henchman must enter the escaped pile end-to-end',
    );
    assert.equal(
      gameState.playerZones['0']!.discard.length - p0DiscardBefore,
      1,
      'current player still gets the generic WP-015 escape wound',
    );
    assert.equal(
      gameState.playerZones['1']!.discard.length - p1DiscardBefore,
      0,
      'no card-text onEscape effect → other player unaffected (henchman has no onEscape hook)',
    );
  });
});
