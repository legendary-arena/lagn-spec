/**
 * Economy integration tests for WP-018.
 *
 * Tests the full play -> fight/recruit flow with economy checking.
 * Uses node:test and node:assert only. Uses makeMockCtx. No boardgame.io
 * imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playCard } from '../moves/coreMoves.impl.js';
import { fightVillain } from '../moves/fightVillain.js';
import { recruitHero } from '../moves/recruitHero.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import { resetTurnEconomy } from './economy.logic.js';
import type { LegendaryGameState } from '../types.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';
import { DEFAULT_IMPLEMENTATION_MAP } from '../rules/ruleRuntime.impl.js';

// ---------------------------------------------------------------------------
// Mock G factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for economy integration tests.
 */
function createMockGameState(options?: {
  city?: LegendaryGameState['city'];
  hq?: LegendaryGameState['hq'];
  hand?: string[];
  turnEconomy?: LegendaryGameState['turnEconomy'];
  cardStats?: LegendaryGameState['cardStats'];
  villainDeck?: LegendaryGameState['villainDeck'];
  villainDeckCardTypes?: LegendaryGameState['villainDeckCardTypes'];
  heroDeck?: LegendaryGameState['heroDeck'];
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

  return {
    matchConfiguration: config,
    selection: {
      schemeId: config.schemeId,
      mastermindId: config.mastermindId,
      villainGroupIds: [...config.villainGroupIds],
      henchmanGroupIds: [...config.henchmanGroupIds],
      heroDeckIds: [...config.heroDeckIds],
    },
    currentStage: 'main',
    playerZones: {
      '0': {
        deck: [],
        hand: options?.hand ?? [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    },
    piles: {
      bystanders: [],
      wounds: ['wound-01'],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    // why: WP-200 — required field; integration tests call fightVillain /
    // revealVillainCard which emit to this array.
    notableEvents: [],
    counters: {},
    hookRegistry: buildDefaultHookDefinitions(config),
    villainDeck: options?.villainDeck ?? { deck: [], discard: [] },
    villainDeckCardTypes: options?.villainDeckCardTypes ?? {},
    ko: [],
    escapedPile: [],
    cardKeywords: {},
    attachedBystanders: {},
    turnEconomy: options?.turnEconomy ?? resetTurnEconomy(),
    cardStats: options?.cardStats ?? {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    },
    city: options?.city ?? initializeCity(),
    hq: options?.hq ?? initializeHq(),
    // why: WP-135 — recruitHero refills the vacated HQ slot via
    // refillHqSlot (FIFO front-pop on G.heroDeck). The integration mock
    // supplies an empty reservoir by default; tests that exercise the
    // refill branch override `heroDeck`.
    heroDeck: options?.heroDeck ?? [],
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
  };
}

/**
 * Creates a mock MoveContext for economy tests.
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

describe('economy integration', () => {
  it('playing a hero card increases G.turnEconomy.attack and .recruit', () => {
    const gameState = createMockGameState({
      hand: ['hero-card-a'],
      cardStats: {
        'hero-card-a': { attack: 3, recruit: 2, cost: 4, fightCost: 0 },
      },
    });

    const moveContext = createMockMoveContext(gameState);
    playCard(moveContext, { cardId: 'hero-card-a' });

    assert.strictEqual(moveContext.G.turnEconomy.attack, 3);
    assert.strictEqual(moveContext.G.turnEconomy.recruit, 2);
    assert.strictEqual(moveContext.G.turnEconomy.spentAttack, 0);
    assert.strictEqual(moveContext.G.turnEconomy.spentRecruit, 0);
  });

  it('fight with sufficient attack succeeds and increments spentAttack', () => {
    const gameState = createMockGameState({
      city: ['villain-x', null, null, null, null],
      turnEconomy: { attack: 5, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
      cardStats: {
        'villain-x': { attack: 0, recruit: 0, cost: 0, fightCost: 3 },
      },
    });

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 0 });

    assert.strictEqual(
      moveContext.G.city[0],
      null,
      'Villain must be removed from city',
    );
    assert.strictEqual(
      moveContext.G.turnEconomy.spentAttack,
      3,
      'spentAttack must be incremented by fightCost',
    );
    assert.ok(
      moveContext.G.playerZones['0']!.victory.includes('villain-x'),
      'Villain must be in player victory zone',
    );
  });

  it('fight with insufficient attack: no G mutation', () => {
    const gameState = createMockGameState({
      city: ['villain-y', null, null, null, null],
      turnEconomy: { attack: 2, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
      cardStats: {
        'villain-y': { attack: 0, recruit: 0, cost: 0, fightCost: 5 },
      },
    });

    // Snapshot state before the call
    const cityBefore = [...gameState.city];
    const victoryBefore = [...gameState.playerZones['0']!.victory];
    const economyBefore = { ...gameState.turnEconomy };

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 0 });

    // Assert no mutation occurred
    assert.deepStrictEqual(
      moveContext.G.city,
      cityBefore,
      'City must be unchanged when attack is insufficient',
    );
    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.victory,
      victoryBefore,
      'Victory zone must be unchanged when attack is insufficient',
    );
    assert.deepStrictEqual(
      moveContext.G.turnEconomy,
      economyBefore,
      'Economy must be unchanged when attack is insufficient',
    );
  });

  it('recruit with sufficient recruit succeeds and increments spentRecruit', () => {
    const gameState = createMockGameState({
      hq: ['hero-b', null, null, null, null],
      turnEconomy: { attack: 0, recruit: 6, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
      cardStats: {
        'hero-b': { attack: 2, recruit: 1, cost: 4, fightCost: 0 },
      },
    });

    const moveContext = createMockMoveContext(gameState);
    recruitHero(moveContext, { hqIndex: 0 });

    assert.strictEqual(
      moveContext.G.hq[0],
      null,
      'Hero must be removed from HQ',
    );
    assert.strictEqual(
      moveContext.G.turnEconomy.spentRecruit,
      4,
      'spentRecruit must be incremented by cost',
    );
    assert.ok(
      moveContext.G.playerZones['0']!.discard.includes('hero-b'),
      'Hero must be in player discard zone',
    );
  });

  it('recruit with insufficient recruit: no G mutation', () => {
    const gameState = createMockGameState({
      hq: ['hero-c', null, null, null, null],
      turnEconomy: { attack: 0, recruit: 1, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
      cardStats: {
        'hero-c': { attack: 1, recruit: 0, cost: 5, fightCost: 0 },
      },
    });

    // Snapshot state before the call
    const hqBefore = [...gameState.hq];
    const discardBefore = [...gameState.playerZones['0']!.discard];
    const economyBefore = { ...gameState.turnEconomy };

    const moveContext = createMockMoveContext(gameState);
    recruitHero(moveContext, { hqIndex: 0 });

    // Assert no mutation occurred
    assert.deepStrictEqual(
      moveContext.G.hq,
      hqBefore,
      'HQ must be unchanged when recruit is insufficient',
    );
    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.discard,
      discardBefore,
      'Discard must be unchanged when recruit is insufficient',
    );
    assert.deepStrictEqual(
      moveContext.G.turnEconomy,
      economyBefore,
      'Economy must be unchanged when recruit is insufficient',
    );
  });

  it('turn reset clears all economy values', () => {
    const economy = resetTurnEconomy();

    assert.strictEqual(economy.attack, 0);
    assert.strictEqual(economy.recruit, 0);
    assert.strictEqual(economy.spentAttack, 0);
    assert.strictEqual(economy.spentRecruit, 0);
    assert.strictEqual(economy.piercing, 0);
    assert.strictEqual(economy.woundsDrawn, 0);

    // Verify it also works as a reset from non-zero values
    const modified = { attack: 5, recruit: 3, spentAttack: 2, spentRecruit: 1, piercing: 0, woundsDrawn: 3 };
    const reset = resetTurnEconomy();
    assert.notDeepStrictEqual(reset, modified);
    assert.strictEqual(reset.attack, 0);
    assert.strictEqual(reset.spentAttack, 0);
    assert.strictEqual(reset.woundsDrawn, 0);
  });

  it('JSON.stringify(G) succeeds after play + fight + recruit cycle', () => {
    const gameState = createMockGameState({
      hand: ['hero-d'],
      city: ['villain-z', null, null, null, null],
      hq: ['hero-e', null, null, null, null],
      turnEconomy: { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
      cardStats: {
        'hero-d': { attack: 5, recruit: 4, cost: 3, fightCost: 0 },
        'villain-z': { attack: 0, recruit: 0, cost: 0, fightCost: 3 },
        'hero-e': { attack: 1, recruit: 1, cost: 2, fightCost: 0 },
      },
    });

    const moveContext = createMockMoveContext(gameState);

    // Play a hero card
    playCard(moveContext, { cardId: 'hero-d' });
    // Fight a villain
    fightVillain(moveContext, { cityIndex: 0 });
    // Recruit a hero
    recruitHero(moveContext, { hqIndex: 0 });

    // Verify JSON serialization succeeds
    const serialized = JSON.stringify(moveContext.G);
    assert.ok(serialized.length > 0, 'G must be JSON-serializable');
  });

  it('reveal does not mutate economy', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 7, recruit: 3, spentAttack: 2, spentRecruit: 1, piercing: 0, woundsDrawn: 0 },
      villainDeck: { deck: ['reveal-villain-a'], discard: [] },
      villainDeckCardTypes: { 'reveal-villain-a': 'villain' },
    });

    // Set stage to start for reveal to proceed
    gameState.currentStage = 'start';

    const economyBefore = { ...gameState.turnEconomy };

    const mockCtx = makeMockCtx({ numPlayers: 1 });
    const moveContext = {
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

    revealVillainCard(moveContext);

    assert.deepStrictEqual(
      moveContext.G.turnEconomy,
      economyBefore,
      'Reveal must not mutate turnEconomy',
    );
  });

  it('escape increments woundsDrawn for current player', () => {
    const gameState = createMockGameState({
      villainDeck: { deck: ['escape-villain'], discard: [] },
      villainDeckCardTypes: { 'escape-villain': 'villain' },
    });
    gameState.currentStage = 'start';
    gameState.piles.wounds = ['wound-01', 'wound-02', 'wound-03'];
    gameState.city = ['city-v1', 'city-v2', 'city-v3', 'city-v4', 'city-v5'];

    const moveContext = createMockMoveContext(gameState);
    revealVillainCard(moveContext);

    assert.strictEqual(
      moveContext.G.turnEconomy.woundsDrawn,
      1,
      'Escape wound must increment woundsDrawn for current player',
    );
  });

  it('Ambush increments woundsDrawn only for current player', () => {
    const gameState = createMockGameState({
      villainDeck: { deck: ['ambush-villain'], discard: [] },
      villainDeckCardTypes: { 'ambush-villain': 'villain' },
    });
    gameState.currentStage = 'start';
    gameState.piles.wounds = ['wound-01', 'wound-02', 'wound-03', 'wound-04'];
    gameState.playerZones['1'] = { deck: [], hand: [], discard: [], inPlay: [], victory: [] };
    (gameState as Record<string, unknown>).cardKeywords = { 'ambush-villain': ['ambush'] };
    // why: WP-185 deleted the hardcoded Ambush wound loop (D-18504). Each-player
    // wounding now arrives via a parsed gainWoundEachPlayer hook dispatched
    // through executeVillainAbilities at the reveal fire site; the gate
    // (hasAmbush) and current-player woundsDrawn projection are preserved.
    (gameState as Record<string, unknown>).villainAbilityHooks = [
      {
        cardId: 'ambush-villain',
        timing: 'onAmbush',
        keywords: ['gainWoundEachPlayer'],
        effects: ['gainWoundEachPlayer'],
      },
    ];

    const mockCtx = makeMockCtx({ numPlayers: 2 });
    const moveContext = {
      G: gameState,
      ctx: {
        ...mockCtx.ctx,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        numMoves: 0,
        playOrder: ['0', '1'],
        playOrderPos: 0,
        activePlayers: null,
      },
      random: mockCtx.random,
      events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
      playerID: '0' as string,
      log: { setMetadata: () => {} },
    };

    revealVillainCard(moveContext);

    assert.strictEqual(
      moveContext.G.turnEconomy.woundsDrawn,
      1,
      'woundsDrawn must increment only for current player, not for all Ambush targets',
    );
  });

  it('turn reset clears woundsDrawn to 0', () => {
    const economy = resetTurnEconomy();
    assert.strictEqual(economy.woundsDrawn, 0, 'woundsDrawn must be 0 after reset');
    assert.strictEqual(economy.piercing, 0, 'piercing must be 0 after reset');
  });

  it('playing a card not in G.cardStats contributes 0/0', () => {
    const gameState = createMockGameState({
      hand: ['unknown-card'],
      cardStats: {}, // Empty — no stats for this card
    });

    const moveContext = createMockMoveContext(gameState);
    playCard(moveContext, { cardId: 'unknown-card' });

    assert.strictEqual(
      moveContext.G.turnEconomy.attack,
      0,
      'Unknown card must contribute 0 attack',
    );
    assert.strictEqual(
      moveContext.G.turnEconomy.recruit,
      0,
      'Unknown card must contribute 0 recruit',
    );
    assert.ok(
      moveContext.G.playerZones['0']!.inPlay.includes('unknown-card'),
      'Card must still be moved to inPlay',
    );
  });
});
