/**
 * Tests for the resolveHeroChoice move and both turn-end guards that block
 * advancement while G.pendingHeroChoice is set.
 *
 * Guard 1 (endTurn move): coreMoves.impl.ts — blocks hand sweep and events.endTurn() call.
 * Guard 2 (advanceStage move): game.ts — blocks events.endTurn() at cleanup stage.
 *
 * Covers AC-1..AC-9 per WP-220 / EC-252.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeroChoice } from './heroChoice.resolve.js';
import { endTurn } from './coreMoves.impl.js';
import { LegendaryGame } from '../game.js';
import type { LegendaryGameState, PendingHeroChoice } from '../types.js';
import type { ResolveHeroChoiceArgs } from './heroChoice.resolve.js';

/**
 * Creates a minimal LegendaryGameState for testing.
 *
 * @param overrides - Selective overrides for player "0" zones and optional pendingHeroChoice.
 * @param currentStage - The turn stage to set. Defaults to 'main'.
 */
function makeTestGameState(
  overrides: {
    deck?: string[];
    hand?: string[];
    discard?: string[];
    inPlay?: string[];
    pendingHeroChoice?: PendingHeroChoice;
  } = {},
  currentStage: LegendaryGameState['currentStage'] = 'main',
): LegendaryGameState {
  const state: LegendaryGameState = {
    matchConfiguration: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    },
    selection: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
    },
    currentStage,
    playerZones: {
      '0': {
        deck: overrides.deck ?? [],
        hand: overrides.hand ?? [],
        discard: overrides.discard ?? [],
        inPlay: overrides.inPlay ?? [],
        victory: [],
      },
    },
    piles: { bystanders: [], wounds: [], officers: [], sidekicks: [] },
    messages: [],
    counters: {},
    hookRegistry: [],
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    turnEconomy: { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    cardStats: {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
    },
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
  };

  if (overrides.pendingHeroChoice !== undefined) {
    state.pendingHeroChoice = overrides.pendingHeroChoice;
  }

  return state;
}

/**
 * Creates a minimal move context for resolveHeroChoice / endTurn with event spies.
 */
function makeMoveContext(
  gameState: LegendaryGameState,
  playerId: string = '0',
): { context: Parameters<typeof resolveHeroChoice>[0]; endTurnSpy: ReturnType<typeof mock.fn> } {
  const endTurnSpy = mock.fn();
  const context = {
    G: gameState,
    ctx: {
      numPlayers: 1,
      currentPlayer: playerId,
      phase: 'play',
      turn: 1,
      playOrder: [playerId],
      playOrderPos: 0,
      activePlayers: null,
    },
    events: {
      endTurn: endTurnSpy,
      setPhase: mock.fn(),
      endPhase: mock.fn(),
      setStage: mock.fn(),
      endStage: mock.fn(),
      pass: mock.fn(),
      endGame: mock.fn(),
    },
    random: {
      Shuffle: <T>(deck: T[]): T[] => [...deck].reverse(),
      D4: mock.fn(),
      D6: mock.fn(),
      D10: mock.fn(),
      D12: mock.fn(),
      D20: mock.fn(),
      Die: mock.fn(),
      Number: mock.fn(),
    },
    playerID: playerId,
    log: { setMetadata: mock.fn() },
  } as unknown as Parameters<typeof resolveHeroChoice>[0];

  return { context, endTurnSpy };
}

describe('resolveHeroChoice', () => {
  // ---------------------------------------------------------------------------
  // Test 1: discard resolution — card moves from deck to discard; pending cleared
  // ---------------------------------------------------------------------------
  it('discard resolution moves card from deck[0] to discard and clears pendingHeroChoice', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '0' };
    const gameState = makeTestGameState({
      deck: ['hero-a', 'hero-b'],
      discard: [],
      pendingHeroChoice: pending,
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must be cleared after discard resolution (AC-1).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-b'],
      'hero-a must be removed from deck after discard resolution (AC-1).');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, ['hero-a'],
      'hero-a must appear in discard after discard resolution (AC-1).');
  });

  // ---------------------------------------------------------------------------
  // Test 2: return resolution — card stays at deck[0]; pending cleared
  // ---------------------------------------------------------------------------
  it('return resolution leaves card at deck[0] and clears pendingHeroChoice', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '0' };
    const gameState = makeTestGameState({
      deck: ['hero-a', 'hero-b'],
      discard: [],
      pendingHeroChoice: pending,
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'return' });

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must be cleared even on return resolution (AC-2).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-a', 'hero-b'],
      'deck must be unchanged after return resolution — card stays at deck[0] (AC-2).');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, [],
      'discard must be empty after return resolution (AC-2).');
  });

  // ---------------------------------------------------------------------------
  // Test 3: unknown resolution — no-op; pending preserved
  // ---------------------------------------------------------------------------
  it('unknown resolution is a silent no-op; pendingHeroChoice is preserved', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '0' };
    const gameState = makeTestGameState({
      deck: ['hero-a'],
      pendingHeroChoice: pending,
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'invalid' as ResolveHeroChoiceArgs['resolution'] });

    assert.equal(gameState.pendingHeroChoice, pending,
      'pendingHeroChoice must be preserved when resolution is unknown (AC-3).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-a'],
      'deck must be unchanged when resolution is unknown (AC-3).');
  });

  // ---------------------------------------------------------------------------
  // Test 4: no pending choice — no-op
  // ---------------------------------------------------------------------------
  it('is a no-op when G.pendingHeroChoice is undefined', () => {
    const gameState = makeTestGameState({ deck: ['hero-a'], discard: [] });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must remain undefined when no pending choice exists (AC-4).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-a'],
      'deck must be unchanged when no pending choice exists (AC-4).');
  });

  // ---------------------------------------------------------------------------
  // Test 5: wrong playerID — no-op; pending preserved
  // ---------------------------------------------------------------------------
  it('is a no-op when pendingHeroChoice.playerID does not match context playerID', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '1' };
    const gameState = makeTestGameState({
      deck: ['hero-a'],
      pendingHeroChoice: pending,
    });
    // Player "0" tries to resolve a choice that belongs to player "1"
    const { context } = makeMoveContext(gameState, '0');

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, pending,
      'pendingHeroChoice must be preserved when playerID mismatch occurs (AC-5).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-a'],
      'deck must be unchanged on playerID mismatch (AC-5).');
  });

  // ---------------------------------------------------------------------------
  // Test 6: wrong choiceType — no-op; pending preserved
  // ---------------------------------------------------------------------------
  it('is a no-op when pendingHeroChoice.choiceType is not discard-or-return', () => {
    const pending = {
      choiceType: 'unknown-type' as PendingHeroChoice['choiceType'],
      cardId: 'hero-a',
      playerID: '0',
    };
    const gameState = makeTestGameState({
      deck: ['hero-a'],
      pendingHeroChoice: pending,
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, pending,
      'pendingHeroChoice must be preserved when choiceType is unknown (AC-6).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-a'],
      'deck must be unchanged when choiceType guard fires (AC-6).');
  });

  // ---------------------------------------------------------------------------
  // Test 7: discard with card not found in deck — pending still cleared (D-22002 stale-state guard)
  // ---------------------------------------------------------------------------
  it('clears pendingHeroChoice even when card is not found in deck (stale-state guard D-22002)', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'gone-card', playerID: '0' };
    const gameState = makeTestGameState({
      deck: ['other-card'],
      discard: [],
      pendingHeroChoice: pending,
    });
    const { context } = makeMoveContext(gameState);

    // Card referenced in pending is not in the deck — stale reference
    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must be cleared even when the card is no longer in the deck (D-22002).');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['other-card'],
      'deck must be unchanged when the referenced card is not found (D-22002).');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, [],
      'discard must be unchanged when the referenced card is not found (D-22002).');
  });

  // ---------------------------------------------------------------------------
  // Test 8: discard resolution with non-empty initial discard pile
  // ---------------------------------------------------------------------------
  it('discard resolution appends card to existing discard pile', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '0' };
    const gameState = makeTestGameState({
      deck: ['hero-a', 'hero-b'],
      discard: ['existing-card'],
      pendingHeroChoice: pending,
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must be cleared after discard resolution.');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['hero-b'],
      'hero-a must be removed from deck.');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, ['existing-card', 'hero-a'],
      'hero-a must be appended to existing discard pile.');
  });
});

describe('turn-end guard: endTurn blocks when pendingHeroChoice is set', () => {
  // ---------------------------------------------------------------------------
  // Guard 1 (coreMoves.impl.ts): endTurn must not sweep hand and must not call events.endTurn()
  // ---------------------------------------------------------------------------
  it('endTurn does not sweep hand or call events.endTurn() while pendingHeroChoice is set', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '0' };
    const gameState = makeTestGameState({
      deck: ['hero-a'],
      hand: ['hero-b', 'hero-c'],
      inPlay: ['hero-d'],
      pendingHeroChoice: pending,
    }, 'cleanup');
    const { context, endTurnSpy } = makeMoveContext(gameState);

    endTurn(context);

    assert.equal(endTurnSpy.mock.calls.length, 0,
      'events.endTurn() must NOT be called while pendingHeroChoice is set (Guard 1, D-22002).');
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['hero-b', 'hero-c'],
      'hand must NOT be swept to discard while pendingHeroChoice is set (Guard 1, D-22002).');
    assert.deepStrictEqual(gameState.playerZones['0']!.inPlay, ['hero-d'],
      'inPlay must NOT be swept to discard while pendingHeroChoice is set (Guard 1, D-22002).');
    assert.equal(gameState.pendingHeroChoice, pending,
      'pendingHeroChoice must remain set after blocked endTurn (Guard 1, D-22002).');
  });

  it('endTurn proceeds normally and calls events.endTurn() when pendingHeroChoice is cleared', () => {
    const gameState = makeTestGameState({
      hand: ['hero-b'],
      inPlay: ['hero-c'],
    }, 'cleanup');
    const { context, endTurnSpy } = makeMoveContext(gameState);

    endTurn(context);

    assert.equal(endTurnSpy.mock.calls.length, 1,
      'events.endTurn() must be called exactly once when no pending choice exists (Guard 1 control case).');
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, [],
      'hand must be swept to discard when no pending choice exists (Guard 1 control case).');
  });
});

describe('turn-end guard: advanceStage blocks at cleanup stage when pendingHeroChoice is set', () => {
  // ---------------------------------------------------------------------------
  // Guard 2 (game.ts advanceStage): at cleanup stage with pending set, events.endTurn() must NOT fire
  // ---------------------------------------------------------------------------
  it('advanceStage at cleanup stage does not call events.endTurn() when pendingHeroChoice is set', () => {
    const pending: PendingHeroChoice = { choiceType: 'discard-or-return', cardId: 'hero-a', playerID: '0' };
    const gameState = makeTestGameState({ pendingHeroChoice: pending }, 'cleanup');
    const endTurnSpy = mock.fn();
    const context = {
      G: gameState,
      ctx: {
        numPlayers: 1,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        playOrder: ['0'],
        playOrderPos: 0,
        activePlayers: null,
      },
      events: {
        endTurn: endTurnSpy,
        setPhase: mock.fn(),
        endPhase: mock.fn(),
        setStage: mock.fn(),
        endStage: mock.fn(),
        pass: mock.fn(),
        endGame: mock.fn(),
      },
      random: {
        Shuffle: <T>(deck: T[]): T[] => [...deck].reverse(),
        D4: mock.fn(), D6: mock.fn(), D10: mock.fn(), D12: mock.fn(), D20: mock.fn(),
        Die: mock.fn(), Number: mock.fn(),
      },
      playerID: '0',
      log: { setMetadata: mock.fn() },
    };

    type AdvanceStageFn = (context: typeof context) => void;
    type MoveDef = { move: AdvanceStageFn };
    const advanceStageFn = (LegendaryGame.moves?.advanceStage as MoveDef | undefined)?.move;
    assert.ok(advanceStageFn, 'advanceStage must be registered on LegendaryGame.moves');

    advanceStageFn(context);

    assert.equal(endTurnSpy.mock.calls.length, 0,
      'events.endTurn() must NOT be called by advanceStage at cleanup while pendingHeroChoice is set (Guard 2, D-22002).');
    assert.equal(gameState.pendingHeroChoice, pending,
      'pendingHeroChoice must remain set after Guard 2 fires (Guard 2, D-22002).');
    assert.equal(gameState.currentStage, 'cleanup',
      'currentStage must remain cleanup after Guard 2 fires (Guard 2, D-22002).');
  });

  it('advanceStage at cleanup proceeds and calls events.endTurn() when no pendingHeroChoice', () => {
    const gameState = makeTestGameState({}, 'cleanup');
    const endTurnSpy = mock.fn();
    const context = {
      G: gameState,
      ctx: {
        numPlayers: 1,
        currentPlayer: '0',
        phase: 'play',
        turn: 1,
        playOrder: ['0'],
        playOrderPos: 0,
        activePlayers: null,
      },
      events: {
        endTurn: endTurnSpy,
        setPhase: mock.fn(),
        endPhase: mock.fn(),
        setStage: mock.fn(),
        endStage: mock.fn(),
        pass: mock.fn(),
        endGame: mock.fn(),
      },
      random: {
        Shuffle: <T>(deck: T[]): T[] => [...deck].reverse(),
        D4: mock.fn(), D6: mock.fn(), D10: mock.fn(), D12: mock.fn(), D20: mock.fn(),
        Die: mock.fn(), Number: mock.fn(),
      },
      playerID: '0',
      log: { setMetadata: mock.fn() },
    };

    type AdvanceStageFn = (context: typeof context) => void;
    type MoveDef = { move: AdvanceStageFn };
    const advanceStageFn = (LegendaryGame.moves?.advanceStage as MoveDef | undefined)?.move;
    assert.ok(advanceStageFn, 'advanceStage must be registered on LegendaryGame.moves');

    advanceStageFn(context);

    assert.equal(endTurnSpy.mock.calls.length, 1,
      'events.endTurn() must be called by advanceStage at cleanup when no pending choice (Guard 2 control case).');
  });
});
