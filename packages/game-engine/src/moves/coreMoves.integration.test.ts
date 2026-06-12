/**
 * Integration tests for the three core move implementations.
 *
 * Verifies drawCards, playCard, and endTurn against the contracts defined
 * in WP-008A and the behavioral spec in WP-008B.
 *
 * No boardgame.io imports. Uses inline mock context following the WP-007B
 * pattern — makeMockCtx provides SetupContext, not a move context with
 * events.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { drawCards, playCard, endTurn } from './coreMoves.impl.js';
import { HAND_SIZE } from './drawCards.logic.js';
import { TURN_STAGES } from '../turn/turnPhases.types.js';
import type { LegendaryGameState } from '../types.js';

/**
 * Creates a minimal LegendaryGameState for testing a single player.
 *
 * @param zones - Partial zone overrides for player "0".
 * @param currentStage - The turn stage to set. Defaults to 'main'.
 * @returns A minimal LegendaryGameState.
 */
function makeTestGameState(
  zones: {
    deck?: string[];
    hand?: string[];
    discard?: string[];
    inPlay?: string[];
    victory?: string[];
  },
  currentStage: string = 'main',
): LegendaryGameState {
  return {
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
    currentStage: currentStage as LegendaryGameState['currentStage'],
    playerZones: {
      '0': {
        deck: zones.deck ?? [],
        hand: zones.hand ?? [],
        discard: zones.discard ?? [],
        inPlay: zones.inPlay ?? [],
        victory: zones.victory ?? [],
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
}

/**
 * Creates a minimal move context with spies for events.endTurn and
 * a deterministic random.Shuffle (reverses the array, same as makeMockCtx).
 *
 * @param gameState - The G object to include in the context.
 * @param playerId - The player ID string. Defaults to "0".
 * @returns An object with the context and the endTurn spy.
 */
function makeMoveContext(
  gameState: LegendaryGameState,
  playerId: string = '0',
): { context: Parameters<typeof drawCards>[0]; endTurnSpy: ReturnType<typeof mock.fn> } {
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
      // why: Reversing the array provides deterministic, predictable
      // reshuffling behavior in tests, matching the makeMockCtx pattern
      // from WP-005B. An identity function would not prove shuffle ran.
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
    log: {
      setMetadata: mock.fn(),
    },
  } as unknown as Parameters<typeof drawCards>[0];

  return { context, endTurnSpy };
}

describe('drawCards', () => {
  it('draws count cards from deck to hand', () => {
    const gameState = makeTestGameState({
      deck: ['card-a', 'card-b', 'card-c'],
      hand: [],
    });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 2 });

    assert.deepEqual(gameState.playerZones['0']!.hand, ['card-a', 'card-b']);
    assert.deepEqual(gameState.playerZones['0']!.deck, ['card-c']);
  });

  it('reshuffles discard into deck when deck is exhausted mid-draw', () => {
    const gameState = makeTestGameState({
      deck: ['card-a', 'card-b'],
      hand: [],
      discard: ['card-c', 'card-d', 'card-e'],
    });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 5 });

    // After drawing 2 from deck, discard is reshuffled (reversed) into deck.
    // Reversed discard: ['card-e', 'card-d', 'card-c'], then 3 more drawn.
    assert.equal(gameState.playerZones['0']!.hand.length, 5);
    assert.equal(gameState.playerZones['0']!.deck.length, 0);
    assert.equal(gameState.playerZones['0']!.discard.length, 0);
  });

  it('is blocked in cleanup stage — G unchanged', () => {
    const gameState = makeTestGameState(
      { deck: ['card-a', 'card-b'], hand: [] },
      'cleanup',
    );
    const deckBefore = [...gameState.playerZones['0']!.deck];
    const handBefore = [...gameState.playerZones['0']!.hand];
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 2 });

    assert.deepEqual(gameState.playerZones['0']!.deck, deckBefore);
    assert.deepEqual(gameState.playerZones['0']!.hand, handBefore);
  });

  it('caps the draw at HAND_SIZE and sets hasDrawnThisTurn (count above the cap)', () => {
    // why: WP-236 — the move can never fill past HAND_SIZE, the race-free cap
    // the deleted UI scaffold could only approximate.
    const gameState = makeTestGameState({
      deck: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
      hand: [],
    });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 10 });

    assert.equal(gameState.playerZones['0']!.hand.length, HAND_SIZE);
    assert.equal(gameState.playerZones['0']!.deck.length, 8 - HAND_SIZE);
    assert.equal(gameState.hasDrawnThisTurn, true);
  });

  it('blocks a second drawCards in the same turn with zero mutation', () => {
    // why: WP-236 — once-per-turn guard. After the first draw consumes the
    // allowance, a second drawCards leaves G deepStrictEqual to its snapshot.
    const gameState = makeTestGameState({
      deck: ['c1', 'c2', 'c3', 'c4'],
      hand: [],
    });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 2 });
    const snapshot = structuredClone(gameState);

    drawCards(context, { count: 2 });

    assert.deepStrictEqual(gameState, snapshot);
  });

  it('consumes the allowance on an empty-deck-and-empty-discard attempt', () => {
    // why: WP-236 — the flag is set on the draw attempt, not the draw count,
    // foreclosing an empty-deck retry loop.
    const gameState = makeTestGameState({ deck: [], hand: [], discard: [] });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 3 });

    assert.deepEqual(gameState.playerZones['0']!.hand, []);
    assert.equal(gameState.hasDrawnThisTurn, true);
  });

  it('consumes the allowance on a zero-draw attempt (count: 0)', () => {
    // why: WP-236 — count: 0 is valid (the validator accepts count >= 0); the
    // flag is set unconditionally after a clean validate-args + stage-gate pass.
    const gameState = makeTestGameState({ deck: ['c1', 'c2'], hand: [] });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 0 });

    assert.deepEqual(gameState.playerZones['0']!.hand, []);
    assert.deepEqual(gameState.playerZones['0']!.deck, ['c1', 'c2']);
    assert.equal(gameState.hasDrawnThisTurn, true);
  });

  it('consumes the allowance when the hand is already at HAND_SIZE (draws zero)', () => {
    // why: WP-236 — count = min(args.count, max(0, HAND_SIZE - hand.length)) is
    // zero when the hand is full, yet the attempt still spends the allowance.
    const fullHand = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const gameState = makeTestGameState({ deck: ['c1', 'c2'], hand: [...fullHand] });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: 3 });

    assert.deepEqual(gameState.playerZones['0']!.hand, fullHand);
    assert.deepEqual(gameState.playerZones['0']!.deck, ['c1', 'c2']);
    assert.equal(gameState.hasDrawnThisTurn, true);
  });

  it('does NOT set hasDrawnThisTurn when args fail validation (negative count)', () => {
    // why: WP-236 contract guard — the flag is set unconditionally but ONLY
    // after a clean validate-args pass. A negative count returns at step 1,
    // before the guard, leaving the flag untouched. Do not move the flag-set
    // ahead of validation to make a "count consumed" case pass.
    const gameState = makeTestGameState({ deck: ['c1', 'c2'], hand: [] });
    const { context } = makeMoveContext(gameState);

    drawCards(context, { count: -1 });

    assert.equal(gameState.hasDrawnThisTurn, undefined);
    assert.deepEqual(gameState.playerZones['0']!.hand, []);
    assert.deepEqual(gameState.playerZones['0']!.deck, ['c1', 'c2']);
  });
});

describe('playCard', () => {
  it('moves a valid card from hand to inPlay', () => {
    const gameState = makeTestGameState({
      hand: ['card-x', 'card-y'],
      inPlay: [],
    });
    const { context } = makeMoveContext(gameState);

    playCard(context, { cardId: 'card-x' });

    assert.deepEqual(gameState.playerZones['0']!.hand, ['card-y']);
    assert.deepEqual(gameState.playerZones['0']!.inPlay, ['card-x']);
  });

  it('does not mutate G when cardId is not in hand', () => {
    const gameState = makeTestGameState({
      hand: ['card-x', 'card-y'],
      inPlay: [],
    });
    const handBefore = [...gameState.playerZones['0']!.hand];
    const inPlayBefore = [...gameState.playerZones['0']!.inPlay];
    const { context } = makeMoveContext(gameState);

    playCard(context, { cardId: 'card-z' });

    assert.deepEqual(gameState.playerZones['0']!.hand, handBefore);
    assert.deepEqual(gameState.playerZones['0']!.inPlay, inPlayBefore);
  });

  it('is blocked in start stage — G unchanged', () => {
    const gameState = makeTestGameState(
      { hand: ['card-x'], inPlay: [] },
      'start',
    );
    const handBefore = [...gameState.playerZones['0']!.hand];
    const inPlayBefore = [...gameState.playerZones['0']!.inPlay];
    const { context } = makeMoveContext(gameState);

    playCard(context, { cardId: 'card-x' });

    assert.deepEqual(gameState.playerZones['0']!.hand, handBefore);
    assert.deepEqual(gameState.playerZones['0']!.inPlay, inPlayBefore);
  });
});

describe('endTurn', () => {
  it('moves all inPlay and hand cards to discard', () => {
    const gameState = makeTestGameState({
      hand: ['card-a', 'card-b'],
      inPlay: ['card-c', 'card-d'],
      discard: ['card-e'],
    }, 'cleanup');
    const { context } = makeMoveContext(gameState);

    endTurn(context);

    assert.deepEqual(gameState.playerZones['0']!.hand, []);
    assert.deepEqual(gameState.playerZones['0']!.inPlay, []);
    // Discard should contain: original discard + inPlay + hand
    assert.deepEqual(gameState.playerZones['0']!.discard, [
      'card-e', 'card-c', 'card-d', 'card-a', 'card-b',
    ]);
  });

  it('calls ctx.events.endTurn exactly once', () => {
    const gameState = makeTestGameState({
      hand: [],
      inPlay: [],
      discard: [],
    }, 'cleanup');
    const { context, endTurnSpy } = makeMoveContext(gameState);

    endTurn(context);

    assert.equal(endTurnSpy.mock.callCount(), 1);
  });
});

describe('JSON serializability', () => {
  it('G remains JSON-serializable after each move', () => {
    const gameState = makeTestGameState({
      deck: ['card-a', 'card-b', 'card-c', 'card-d', 'card-e'],
      hand: [],
      discard: [],
      inPlay: [],
    }, 'start');

    const { context } = makeMoveContext(gameState);

    // drawCards in start stage
    drawCards(context, { count: 3 });
    assert.doesNotThrow(() => JSON.stringify(gameState));

    // Advance to main stage for playCard
    gameState.currentStage = TURN_STAGES[1]!;
    playCard(context, { cardId: 'card-a' });
    assert.doesNotThrow(() => JSON.stringify(gameState));

    // Advance to cleanup stage for endTurn
    gameState.currentStage = TURN_STAGES[2]!;
    endTurn(context);
    assert.doesNotThrow(() => JSON.stringify(gameState));
  });
});
