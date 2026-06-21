/**
 * Tests for the resolveKoHeroChoice move (WP-242), the dual turn-end guards,
 * and the block-all action-move guards that freeze the board while a KO-a-Hero
 * choice is pending.
 *
 * Covers: resolve from each zone + front-pop; multi-entry front-only integrity;
 * repeated invalid resolves leave the queue intact; no-mutation-while-guarded;
 * dual-pending coexistence with pendingHeroChoice; hasPendingKoHeroChoice;
 * turn-end blocks (endTurn / advanceStage); block-all no-op on every action
 * move; resolvers NOT blocked.
 *
 * Covers AC per WP-242 / EC-273. Uses node:test + node:assert only.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveKoHeroChoice,
  hasPendingKoHeroChoice,
} from './koHeroChoice.resolve.js';
import { endTurn, playCard, drawCards } from './coreMoves.impl.js';
import { fightVillain } from './fightVillain.js';
import { recruitHero } from './recruitHero.js';
import { fightMastermind } from './fightMastermind.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import { resolveHeroChoice } from './heroChoice.resolve.js';
import { LegendaryGame } from '../game.js';
import type { LegendaryGameState, PendingHeroChoice, PendingKoHeroChoice } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';

const WOUND = 'pile-wound' as CardExtId;

/**
 * Creates a minimal LegendaryGameState for testing the KO-choice flow.
 *
 * @param overrides - Selective overrides for player "0" zones, the pending
 *   queue, the pending hero choice, and current stage.
 */
function makeTestGameState(
  overrides: {
    hand?: CardExtId[];
    discard?: CardExtId[];
    inPlay?: CardExtId[];
    deck?: CardExtId[];
    pendingKoHeroChoices?: PendingKoHeroChoice[];
    pendingHeroChoice?: PendingHeroChoice;
    currentStage?: LegendaryGameState['currentStage'];
  } = {},
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
    currentStage: overrides.currentStage ?? 'main',
    playerZones: {
      '0': {
        deck: overrides.deck ?? [],
        hand: overrides.hand ?? [],
        discard: overrides.discard ?? [],
        inPlay: overrides.inPlay ?? [],
        victory: [],
      },
    },
    piles: { bystanders: [], wounds: [], officers: [], sidekicks: [], horrors: [] },
    messages: [],
    counters: {},
    hookRegistry: [],
    villainAbilityHooks: [],
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    villainAttachedHeroes: {},
    turnEconomy: { attack: 10, recruit: 10, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
    cardStats: {},
    cardKeywords: {},
    heroDeck: [],
    escapedPile: [],
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: ['tactic-0'] as CardExtId[],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    },
    scheme: { twistPile: [] },
    notableEvents: [],
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    cardDisplayData: {},
    cardTraits: {},
    schemeSetupInstructions: [],
    heroAbilityHooks: [],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
  } as unknown as LegendaryGameState;

  if (overrides.pendingKoHeroChoices !== undefined) {
    state.pendingKoHeroChoices = overrides.pendingKoHeroChoices;
  }
  if (overrides.pendingHeroChoice !== undefined) {
    state.pendingHeroChoice = overrides.pendingHeroChoice;
  }

  return state;
}

/**
 * Builds a move context with event spies for the move under test.
 */
function makeMoveContext(
  gameState: LegendaryGameState,
  playerId: string = '0',
): { context: Parameters<typeof resolveKoHeroChoice>[0]; endTurnSpy: ReturnType<typeof mock.fn> } {
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
      D4: mock.fn(), D6: mock.fn(), D10: mock.fn(), D12: mock.fn(), D20: mock.fn(),
      Die: mock.fn(), Number: mock.fn(),
    },
    playerID: playerId,
    log: { setMetadata: mock.fn() },
  } as unknown as Parameters<typeof resolveKoHeroChoice>[0];

  return { context, endTurnSpy };
}

const koChoice = (playerID = '0'): PendingKoHeroChoice => ({ choiceType: 'ko-hero', playerID });

describe('resolveKoHeroChoice — success paths', () => {
  it('resolves from discard, KOs the card, and front-pops the queue', () => {
    const gameState = makeTestGameState({
      discard: ['hero-d' as CardExtId, 'hero-e' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    const { context } = makeMoveContext(gameState);

    resolveKoHeroChoice(context, { zone: 'discard', cardId: 'hero-d' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['hero-d'], 'chosen discard card KOd');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, ['hero-e'], 'KO removed from discard');
    assert.equal(gameState.pendingKoHeroChoices!.length, 0, 'queue front-popped');
  });

  it('resolves from hand', () => {
    const gameState = makeTestGameState({
      hand: ['hero-h' as CardExtId, 'hero-i' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    const { context } = makeMoveContext(gameState);

    resolveKoHeroChoice(context, { zone: 'hand', cardId: 'hero-i' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['hero-i']);
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['hero-h']);
    assert.equal(gameState.pendingKoHeroChoices!.length, 0);
  });

  it('resolves from inPlay', () => {
    const gameState = makeTestGameState({
      inPlay: ['hero-p' as CardExtId, 'hero-q' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    const { context } = makeMoveContext(gameState);

    resolveKoHeroChoice(context, { zone: 'inPlay', cardId: 'hero-p' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['hero-p']);
    assert.deepStrictEqual(gameState.playerZones['0']!.inPlay, ['hero-q']);
    assert.equal(gameState.pendingKoHeroChoices!.length, 0);
  });

  it('KOs only the first matching occurrence of a duplicated ext_id', () => {
    const gameState = makeTestGameState({
      discard: ['dup' as CardExtId, 'dup' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    const { context } = makeMoveContext(gameState);

    resolveKoHeroChoice(context, { zone: 'discard', cardId: 'dup' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['dup']);
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, ['dup'], 'one copy remains');
  });
});

describe('resolveKoHeroChoice — front-only multi-entry integrity', () => {
  it('a 2-entry queue: one resolve removes exactly the front entry, leaving the rest intact', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      pendingKoHeroChoices: [koChoice('0'), koChoice('0')],
    });
    const { context } = makeMoveContext(gameState);

    resolveKoHeroChoice(context, { zone: 'hand', cardId: 'hero-a' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['hero-a']);
    assert.equal(gameState.pendingKoHeroChoices!.length, 1, 'exactly one entry removed');
    assert.deepStrictEqual(
      gameState.pendingKoHeroChoices![0],
      { choiceType: 'ko-hero', playerID: '0' },
      'remaining entry intact',
    );
  });
});

describe('resolveKoHeroChoice — silent no-ops leave the queue byte-identical', () => {
  function expectNoOp(
    args: { zone: 'discard' | 'hand' | 'inPlay'; cardId: CardExtId },
    overrides: Parameters<typeof makeTestGameState>[0],
    playerId = '0',
  ): void {
    const gameState = makeTestGameState(overrides);
    const queueBefore = JSON.stringify(gameState.pendingKoHeroChoices ?? null);
    const koBefore = JSON.stringify(gameState.ko);
    const { context } = makeMoveContext(gameState, playerId);
    resolveKoHeroChoice(context, args);
    assert.equal(JSON.stringify(gameState.pendingKoHeroChoices ?? null), queueBefore, 'queue unchanged');
    assert.equal(JSON.stringify(gameState.ko), koBefore, 'ko unchanged');
  }

  it('no-op on invalid zone', () => {
    expectNoOp(
      { zone: 'victory' as 'hand', cardId: 'hero-a' as CardExtId },
      { hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId], pendingKoHeroChoices: [koChoice()] },
    );
  });

  it('no-op on empty cardId', () => {
    expectNoOp(
      { zone: 'hand', cardId: '' as CardExtId },
      { hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId], pendingKoHeroChoices: [koChoice()] },
    );
  });

  it('no-op on a wound cardId (wounds are never eligible)', () => {
    expectNoOp(
      { zone: 'discard', cardId: WOUND },
      { discard: [WOUND, 'hero-a' as CardExtId], pendingKoHeroChoices: [koChoice()] },
    );
  });

  it('no-op on empty queue', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'hero-a' as CardExtId },
      { hand: ['hero-a' as CardExtId], pendingKoHeroChoices: [] },
    );
  });

  it('no-op on absent queue (undefined)', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'hero-a' as CardExtId },
      { hand: ['hero-a' as CardExtId] },
    );
  });

  it('no-op on wrong playerID (front belongs to another player)', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'hero-a' as CardExtId },
      { hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId], pendingKoHeroChoices: [koChoice('1')] },
      '0',
    );
  });

  it('no-op on wrong choiceType', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
    });
    gameState.pendingKoHeroChoices = [
      { choiceType: 'not-ko' as PendingKoHeroChoice['choiceType'], playerID: '0' },
    ];
    const queueBefore = JSON.stringify(gameState.pendingKoHeroChoices);
    const { context } = makeMoveContext(gameState);
    resolveKoHeroChoice(context, { zone: 'hand', cardId: 'hero-a' as CardExtId });
    assert.equal(JSON.stringify(gameState.pendingKoHeroChoices), queueBefore, 'queue intact');
    assert.deepStrictEqual(gameState.ko, []);
  });

  it('no-op when the cardId is absent from the named zone (queue intact for resubmit)', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'not-here' as CardExtId },
      { hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId], pendingKoHeroChoices: [koChoice()] },
    );
  });

  it('repeated invalid resolves (spam) each leave the queue byte-identical', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    const queueBefore = JSON.stringify(gameState.pendingKoHeroChoices);
    const { context } = makeMoveContext(gameState);
    for (let attempt = 0; attempt < 5; attempt++) {
      resolveKoHeroChoice(context, { zone: 'hand', cardId: 'not-here' as CardExtId });
    }
    assert.equal(JSON.stringify(gameState.pendingKoHeroChoices), queueBefore);
    assert.deepStrictEqual(gameState.ko, []);
  });
});

describe('hasPendingKoHeroChoice predicate', () => {
  it('true when the queue has entries', () => {
    const gameState = makeTestGameState({ pendingKoHeroChoices: [koChoice()] });
    assert.equal(hasPendingKoHeroChoice(gameState), true);
  });
  it('false on an empty queue', () => {
    const gameState = makeTestGameState({ pendingKoHeroChoices: [] });
    assert.equal(hasPendingKoHeroChoice(gameState), false);
  });
  it('false when the queue is absent (undefined)', () => {
    const gameState = makeTestGameState({});
    assert.equal(hasPendingKoHeroChoice(gameState), false);
  });
});

describe('turn-end guards block while a KO choice is pending', () => {
  it('endTurn does not sweep the hand or call events.endTurn() while a KO choice is pending', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      inPlay: ['hero-c' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
      currentStage: 'cleanup',
    });
    const { context, endTurnSpy } = makeMoveContext(gameState);

    endTurn(context);

    assert.equal(endTurnSpy.mock.calls.length, 0, 'events.endTurn() blocked');
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['hero-a', 'hero-b'], 'hand not swept');
    assert.deepStrictEqual(gameState.playerZones['0']!.inPlay, ['hero-c'], 'inPlay not swept');
  });

  it('advanceStage is a no-op (no events.endTurn()) while a KO choice is pending', () => {
    const gameState = makeTestGameState({
      pendingKoHeroChoices: [koChoice()],
      currentStage: 'cleanup',
    });
    const { context, endTurnSpy } = makeMoveContext(gameState);

    type MoveDef = { move: (c: typeof context) => void };
    const advanceStageFn = (LegendaryGame.moves?.advanceStage as MoveDef | undefined)?.move;
    assert.ok(advanceStageFn);
    advanceStageFn!(context);

    assert.equal(endTurnSpy.mock.calls.length, 0, 'advanceStage did not end the turn');
    assert.equal(gameState.currentStage, 'cleanup', 'stage unchanged');
  });

  it('turn-end stays blocked until BOTH pendingHeroChoice and the KO queue clear (dual-pending)', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
      pendingHeroChoice: { choiceType: 'discard-or-return', cardId: 'rev', playerID: '0' },
      currentStage: 'cleanup',
    });
    const { context, endTurnSpy } = makeMoveContext(gameState);

    // Resolve the KO choice first — turn still blocked by pendingHeroChoice.
    resolveKoHeroChoice(context, { zone: 'hand', cardId: 'hero-a' as CardExtId });
    endTurn(context);
    assert.equal(endTurnSpy.mock.calls.length, 0, 'still blocked by pendingHeroChoice');

    // Clear pendingHeroChoice — now the turn ends.
    gameState.pendingHeroChoice = undefined;
    endTurn(context);
    assert.equal(endTurnSpy.mock.calls.length, 1, 'turn ends once both choices clear');
  });
});

describe('block-all guards: every action move is a no-op while a KO choice is pending', () => {
  it('playCard does not move a card or change economy while pending', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    gameState.cardStats = { 'hero-a': { attack: 3, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    playCard(context, { cardId: 'hero-a' as CardExtId });

    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['hero-a', 'hero-b'], 'hand untouched');
    assert.deepStrictEqual(gameState.playerZones['0']!.inPlay, [], 'inPlay untouched');
    assert.equal(gameState.turnEconomy.attack, 10, 'economy untouched');
  });

  it('drawCards is a no-op while pending', () => {
    const gameState = makeTestGameState({
      deck: ['c0' as CardExtId, 'c1' as CardExtId],
      hand: [],
      pendingKoHeroChoices: [koChoice()],
      currentStage: 'start',
    });
    const { context } = makeMoveContext(gameState);
    drawCards(context, { count: 5 });
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, [], 'no cards drawn');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['c0', 'c1'], 'deck untouched');
  });

  it('fightVillain is a no-op while pending (city + victory untouched)', () => {
    const gameState = makeTestGameState({ pendingKoHeroChoices: [koChoice()] });
    gameState.city = ['villain-x' as CardExtId, null, null, null, null];
    gameState.cardStats = { 'villain-x': { attack: 0, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    fightVillain(context, { cityIndex: 0 });

    assert.equal(gameState.city[0], 'villain-x', 'villain still in city');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, [], 'victory untouched');
  });

  it('recruitHero is a no-op while pending (HQ + discard untouched)', () => {
    const gameState = makeTestGameState({ pendingKoHeroChoices: [koChoice()] });
    gameState.hq = ['hero-hq' as CardExtId, null, null, null, null];
    gameState.cardStats = { 'hero-hq': { attack: 0, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    recruitHero(context, { hqIndex: 0 });

    assert.equal(gameState.hq[0], 'hero-hq', 'HQ slot untouched');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, [], 'discard untouched');
  });

  it('fightMastermind is a no-op while pending (tactics untouched)', () => {
    const gameState = makeTestGameState({ pendingKoHeroChoices: [koChoice()] });
    gameState.cardStats = { 'test-mastermind-base': { attack: 0, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    fightMastermind(context);

    assert.deepStrictEqual(gameState.mastermind.tacticsDeck, ['tactic-0'], 'tactics untouched');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, [], 'victory untouched');
  });

  it('revealVillainCard is a no-op while pending (villain deck untouched)', () => {
    const gameState = makeTestGameState({ pendingKoHeroChoices: [koChoice()], currentStage: 'start' });
    gameState.villainDeck = { deck: ['vd-0' as CardExtId], discard: [] };
    gameState.villainDeckCardTypes = { 'vd-0': 'bystander' } as unknown as LegendaryGameState['villainDeckCardTypes'];
    const { context } = makeMoveContext(gameState);

    revealVillainCard(context);

    assert.deepStrictEqual(gameState.villainDeck.deck, ['vd-0'], 'villain deck untouched');
    assert.equal(gameState.villainRevealedThisTurn ?? false, false, 'reveal allowance not consumed');
  });
});

describe('resolvers are NOT blocked while a KO choice is pending', () => {
  it('resolveKoHeroChoice itself resolves while pending', () => {
    const gameState = makeTestGameState({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
    });
    const { context } = makeMoveContext(gameState);
    resolveKoHeroChoice(context, { zone: 'hand', cardId: 'hero-a' as CardExtId });
    assert.deepStrictEqual(gameState.ko, ['hero-a'], 'resolver not blocked');
  });

  it('resolveHeroChoice is NOT blocked by a pending KO choice (dual-pending, each clears its own state)', () => {
    const gameState = makeTestGameState({
      deck: ['rev' as CardExtId, 'next' as CardExtId],
      pendingKoHeroChoices: [koChoice()],
      pendingHeroChoice: { choiceType: 'discard-or-return', cardId: 'rev', playerID: '0' },
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, undefined, 'hero choice cleared');
    assert.equal(gameState.pendingKoHeroChoices!.length, 1, 'KO queue untouched by the hero resolver');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, ['rev'], 'revealed card discarded');
  });
});
