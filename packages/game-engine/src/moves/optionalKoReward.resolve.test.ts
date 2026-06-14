/**
 * Tests for the resolveOptionalKoReward move (WP-248 / D-24019), the turn-end
 * guards, and the block-all action-move guards that freeze the board while an
 * optional-KO-reward choice is pending.
 *
 * Covers: decline (no KO/reward); KO-from-hand → reward; KO-from-discard →
 * reward; invalid card/zone → no-op (queue intact, never throws); front-pop
 * ordering; atomicity (no reward without KO; reward applied exactly once);
 * invalid arg shapes; wrong playerID; hasPendingOptionalKoReward; block-all
 * completeness across every guarded move; the three resolvers stay available.
 *
 * Covers AC per WP-248 / EC-279. Uses node:test + node:assert only.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOptionalKoReward,
  hasPendingOptionalKoReward,
} from './optionalKoReward.resolve.js';
import { endTurn, playCard, drawCards } from './coreMoves.impl.js';
import { fightVillain } from './fightVillain.js';
import { recruitHero } from './recruitHero.js';
import { fightMastermind } from './fightMastermind.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import { resolveKoHeroChoice } from './koHeroChoice.resolve.js';
import { resolveHeroChoice } from './heroChoice.resolve.js';
import { LegendaryGame } from '../game.js';
import type {
  LegendaryGameState,
  PendingHeroChoice,
  PendingKoHeroChoice,
  PendingOptionalKoReward,
} from '../types.js';
import type { CardExtId } from '../state/zones.types.js';

/**
 * Creates a minimal LegendaryGameState for testing the optional-KO-reward flow.
 *
 * @param overrides - Selective overrides for player "0" zones, the pending
 *   queues, the pending hero choice, the bystander supply, and current stage.
 */
function makeTestGameState(
  overrides: {
    hand?: CardExtId[];
    discard?: CardExtId[];
    inPlay?: CardExtId[];
    deck?: CardExtId[];
    bystanders?: CardExtId[];
    pendingOptionalKoRewards?: PendingOptionalKoReward[];
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
    piles: { bystanders: overrides.bystanders ?? [], wounds: [], officers: [], sidekicks: [], horrors: [] },
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

  if (overrides.pendingOptionalKoRewards !== undefined) {
    state.pendingOptionalKoRewards = overrides.pendingOptionalKoRewards;
  }
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
): { context: Parameters<typeof resolveOptionalKoReward>[0]; endTurnSpy: ReturnType<typeof mock.fn> } {
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
  } as unknown as Parameters<typeof resolveOptionalKoReward>[0];

  return { context, endTurnSpy };
}

/** A pending rescue-reward choice for player "0" sourced from 'hero-x'. */
const rescuePending = (playerID = '0'): PendingOptionalKoReward => ({
  playerID,
  rewardType: 'rescue',
  rewardMagnitude: 1,
  sourceCardId: 'hero-x' as CardExtId,
});

describe('resolveOptionalKoReward — KO then reward', () => {
  it('KOs the chosen hand card and grants the reward (rescue → bystander to victory)', () => {
    const gameState = makeTestGameState({
      hand: ['real-card' as CardExtId, 'other' as CardExtId],
      bystanders: ['by-0' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { zone: 'hand', cardId: 'real-card' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['real-card'], 'chosen card KOd');
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['other'], 'KO removed from hand');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, ['by-0'], 'reward rescued the bystander');
    assert.deepStrictEqual(gameState.piles.bystanders, [], 'bystander supply consumed by the reward');
    assert.equal(gameState.pendingOptionalKoRewards!.length, 0, 'queue front-popped');
  });

  it('KOs the chosen discard card and grants the reward', () => {
    const gameState = makeTestGameState({
      discard: ['disc-card' as CardExtId],
      bystanders: ['by-0' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { zone: 'discard', cardId: 'disc-card' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['disc-card']);
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, []);
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, ['by-0']);
    assert.equal(gameState.pendingOptionalKoRewards!.length, 0);
  });

  it('dispatches a draw reward via the existing executor (deck top → hand)', () => {
    const gameState = makeTestGameState({
      hand: ['ko-me' as CardExtId],
      deck: ['top-of-deck' as CardExtId, 'next' as CardExtId],
      pendingOptionalKoRewards: [{ playerID: '0', rewardType: 'draw', rewardMagnitude: 1, sourceCardId: 'hero-x' as CardExtId }],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { zone: 'hand', cardId: 'ko-me' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['ko-me'], 'chosen card KOd');
    assert.ok(gameState.playerZones['0']!.hand.includes('top-of-deck'), 'draw reward drew the deck top into hand');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['next'], 'one card drawn off the deck');
    assert.equal(gameState.pendingOptionalKoRewards!.length, 0);
  });
});

describe('resolveOptionalKoReward — decline', () => {
  it('front-pops with no KO and no reward', () => {
    const gameState = makeTestGameState({
      hand: ['keep-me' as CardExtId],
      bystanders: ['by-0' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { decline: true });

    assert.deepStrictEqual(gameState.ko, [], 'no card KOd on decline');
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['keep-me'], 'hand untouched on decline');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, [], 'no reward on decline');
    assert.deepStrictEqual(gameState.piles.bystanders, ['by-0'], 'bystander supply untouched on decline');
    assert.equal(gameState.pendingOptionalKoRewards!.length, 0, 'queue front-popped on decline');
    assert.deepStrictEqual(gameState.messages, [], 'decline is silent');
  });
});

describe('resolveOptionalKoReward — atomicity (no reward without KO)', () => {
  it('an absent/stale target is a no-op: no KO, no reward, queue intact', () => {
    const gameState = makeTestGameState({
      hand: ['real-card' as CardExtId],
      bystanders: ['by-0' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { zone: 'hand', cardId: 'not-here' as CardExtId });

    assert.deepStrictEqual(gameState.ko, [], 'no KO when the target is absent');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, [], 'no reward when no KO occurred');
    assert.deepStrictEqual(gameState.piles.bystanders, ['by-0'], 'bystander supply untouched');
    assert.equal(gameState.pendingOptionalKoRewards!.length, 1, 'queue intact for resubmit');
  });

  it('the reward fires exactly once on a successful KO', () => {
    const gameState = makeTestGameState({
      hand: ['ko-me' as CardExtId],
      bystanders: ['by-0' as CardExtId, 'by-1' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { zone: 'hand', cardId: 'ko-me' as CardExtId });

    assert.deepStrictEqual(gameState.playerZones['0']!.victory, ['by-0'], 'exactly one bystander rescued (magnitude 1)');
    assert.deepStrictEqual(gameState.piles.bystanders, ['by-1'], 'only one bystander consumed');
  });
});

describe('resolveOptionalKoReward — front-only multi-entry integrity', () => {
  it('a 2-entry queue: one resolve removes exactly the front entry', () => {
    const gameState = makeTestGameState({
      hand: ['a' as CardExtId],
      bystanders: ['by-0' as CardExtId],
      pendingOptionalKoRewards: [rescuePending('0'), rescuePending('0')],
    });
    const { context } = makeMoveContext(gameState);

    resolveOptionalKoReward(context, { zone: 'hand', cardId: 'a' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['a']);
    assert.equal(gameState.pendingOptionalKoRewards!.length, 1, 'exactly one entry removed');
    assert.deepStrictEqual(gameState.pendingOptionalKoRewards![0], rescuePending('0'), 'remaining entry intact');
  });
});

describe('resolveOptionalKoReward — silent no-ops leave the queue byte-identical', () => {
  function expectNoOp(
    args: Parameters<typeof resolveOptionalKoReward>[1],
    overrides: Parameters<typeof makeTestGameState>[0],
    playerId = '0',
  ): void {
    const gameState = makeTestGameState(overrides);
    const queueBefore = JSON.stringify(gameState.pendingOptionalKoRewards ?? null);
    const koBefore = JSON.stringify(gameState.ko);
    const { context } = makeMoveContext(gameState, playerId);
    resolveOptionalKoReward(context, args);
    assert.equal(JSON.stringify(gameState.pendingOptionalKoRewards ?? null), queueBefore, 'queue unchanged');
    assert.equal(JSON.stringify(gameState.ko), koBefore, 'ko unchanged');
  }

  it('no-op on an invalid zone', () => {
    expectNoOp(
      { zone: 'victory' as 'hand', cardId: 'a' as CardExtId },
      { hand: ['a' as CardExtId], pendingOptionalKoRewards: [rescuePending()] },
    );
  });

  it('no-op on an empty cardId', () => {
    expectNoOp(
      { zone: 'hand', cardId: '' as CardExtId },
      { hand: ['a' as CardExtId], pendingOptionalKoRewards: [rescuePending()] },
    );
  });

  it('no-op when neither decline nor a valid {zone,cardId} is supplied', () => {
    expectNoOp(
      {} as Parameters<typeof resolveOptionalKoReward>[1],
      { hand: ['a' as CardExtId], pendingOptionalKoRewards: [rescuePending()] },
    );
  });

  it('no-op when both decline and {zone,cardId} are supplied (malformed)', () => {
    expectNoOp(
      { decline: true, zone: 'hand', cardId: 'a' } as unknown as Parameters<typeof resolveOptionalKoReward>[1],
      { hand: ['a' as CardExtId], pendingOptionalKoRewards: [rescuePending()] },
    );
  });

  it('no-op on an empty queue', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'a' as CardExtId },
      { hand: ['a' as CardExtId], pendingOptionalKoRewards: [] },
    );
  });

  it('no-op on an absent queue (undefined)', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'a' as CardExtId },
      { hand: ['a' as CardExtId] },
    );
  });

  it('no-op on wrong playerID (front belongs to another player)', () => {
    expectNoOp(
      { zone: 'hand', cardId: 'a' as CardExtId },
      { hand: ['a' as CardExtId], pendingOptionalKoRewards: [rescuePending('1')] },
      '0',
    );
  });
});

describe('hasPendingOptionalKoReward predicate', () => {
  it('true when the queue has entries', () => {
    assert.equal(hasPendingOptionalKoReward(makeTestGameState({ pendingOptionalKoRewards: [rescuePending()] })), true);
  });
  it('false on an empty queue', () => {
    assert.equal(hasPendingOptionalKoReward(makeTestGameState({ pendingOptionalKoRewards: [] })), false);
  });
  it('false when the queue is absent (undefined)', () => {
    assert.equal(hasPendingOptionalKoReward(makeTestGameState({})), false);
  });
});

describe('turn-end guards block while an optional-KO-reward is pending', () => {
  it('endTurn does not sweep the hand or call events.endTurn() while pending', () => {
    const gameState = makeTestGameState({
      hand: ['a' as CardExtId, 'b' as CardExtId],
      inPlay: ['c' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
      currentStage: 'cleanup',
    });
    const { context, endTurnSpy } = makeMoveContext(gameState);

    endTurn(context);

    assert.equal(endTurnSpy.mock.calls.length, 0, 'events.endTurn() blocked');
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['a', 'b'], 'hand not swept');
    assert.deepStrictEqual(gameState.playerZones['0']!.inPlay, ['c'], 'inPlay not swept');
  });

  it('advanceStage is a no-op (no events.endTurn()) while pending', () => {
    const gameState = makeTestGameState({
      pendingOptionalKoRewards: [rescuePending()],
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
});

describe('block-all guards: every action move is a no-op while an optional-KO-reward is pending', () => {
  it('playCard does not move a card or change economy while pending', () => {
    const gameState = makeTestGameState({
      hand: ['a' as CardExtId, 'b' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    gameState.cardStats = { a: { attack: 3, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    playCard(context, { cardId: 'a' as CardExtId });

    assert.deepStrictEqual(gameState.playerZones['0']!.hand, ['a', 'b'], 'hand untouched');
    assert.deepStrictEqual(gameState.playerZones['0']!.inPlay, [], 'inPlay untouched');
    assert.equal(gameState.turnEconomy.attack, 10, 'economy untouched');
  });

  it('drawCards is a no-op while pending', () => {
    const gameState = makeTestGameState({
      deck: ['c0' as CardExtId, 'c1' as CardExtId],
      hand: [],
      pendingOptionalKoRewards: [rescuePending()],
      currentStage: 'start',
    });
    const { context } = makeMoveContext(gameState);
    drawCards(context, { count: 5 });
    assert.deepStrictEqual(gameState.playerZones['0']!.hand, [], 'no cards drawn');
    assert.deepStrictEqual(gameState.playerZones['0']!.deck, ['c0', 'c1'], 'deck untouched');
  });

  it('fightVillain is a no-op while pending', () => {
    const gameState = makeTestGameState({ pendingOptionalKoRewards: [rescuePending()] });
    gameState.city = ['villain-x' as CardExtId, null, null, null, null];
    gameState.cardStats = { 'villain-x': { attack: 0, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    fightVillain(context, { cityIndex: 0 });

    assert.equal(gameState.city[0], 'villain-x', 'villain still in city');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, [], 'victory untouched');
  });

  it('recruitHero is a no-op while pending', () => {
    const gameState = makeTestGameState({ pendingOptionalKoRewards: [rescuePending()] });
    gameState.hq = ['hero-hq' as CardExtId, null, null, null, null];
    gameState.cardStats = { 'hero-hq': { attack: 0, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    recruitHero(context, { hqIndex: 0 });

    assert.equal(gameState.hq[0], 'hero-hq', 'HQ slot untouched');
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, [], 'discard untouched');
  });

  it('fightMastermind is a no-op while pending', () => {
    const gameState = makeTestGameState({ pendingOptionalKoRewards: [rescuePending()] });
    gameState.cardStats = { 'test-mastermind-base': { attack: 0, recruit: 0, cost: 0, fightCost: 0 } } as unknown as LegendaryGameState['cardStats'];
    const { context } = makeMoveContext(gameState);

    fightMastermind(context);

    assert.deepStrictEqual(gameState.mastermind.tacticsDeck, ['tactic-0'], 'tactics untouched');
    assert.deepStrictEqual(gameState.playerZones['0']!.victory, [], 'victory untouched');
  });

  it('revealVillainCard is a no-op while pending', () => {
    const gameState = makeTestGameState({ pendingOptionalKoRewards: [rescuePending()], currentStage: 'start' });
    gameState.villainDeck = { deck: ['vd-0' as CardExtId], discard: [] };
    gameState.villainDeckCardTypes = { 'vd-0': 'bystander' } as unknown as LegendaryGameState['villainDeckCardTypes'];
    const { context } = makeMoveContext(gameState);

    revealVillainCard(context);

    assert.deepStrictEqual(gameState.villainDeck.deck, ['vd-0'], 'villain deck untouched');
    assert.equal(gameState.villainRevealedThisTurn ?? false, false, 'reveal allowance not consumed');
  });
});

describe('resolvers are NOT blocked while an optional-KO-reward is pending', () => {
  it('resolveOptionalKoReward itself resolves while pending', () => {
    const gameState = makeTestGameState({
      hand: ['a' as CardExtId],
      bystanders: ['by-0' as CardExtId],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);
    resolveOptionalKoReward(context, { zone: 'hand', cardId: 'a' as CardExtId });
    assert.deepStrictEqual(gameState.ko, ['a'], 'resolver not blocked');
  });

  it('resolveKoHeroChoice is NOT blocked by a pending optional-KO-reward (each clears its own state)', () => {
    const gameState = makeTestGameState({
      discard: ['ko-hero-target' as CardExtId],
      pendingKoHeroChoices: [{ choiceType: 'ko-hero', playerID: '0' }],
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveKoHeroChoice(context, { zone: 'discard', cardId: 'ko-hero-target' as CardExtId });

    assert.deepStrictEqual(gameState.ko, ['ko-hero-target'], 'KO-hero resolver acted');
    assert.equal(gameState.pendingKoHeroChoices!.length, 0, 'KO-hero queue front-popped');
    assert.equal(gameState.pendingOptionalKoRewards!.length, 1, 'optional-KO-reward queue untouched');
  });

  it('resolveHeroChoice is NOT blocked by a pending optional-KO-reward', () => {
    const gameState = makeTestGameState({
      deck: ['rev' as CardExtId, 'next' as CardExtId],
      pendingHeroChoice: { choiceType: 'discard-or-return', cardId: 'rev', playerID: '0' },
      pendingOptionalKoRewards: [rescuePending()],
    });
    const { context } = makeMoveContext(gameState);

    resolveHeroChoice(context, { resolution: 'discard' });

    assert.equal(gameState.pendingHeroChoice, undefined, 'hero choice cleared');
    assert.equal(gameState.pendingOptionalKoRewards!.length, 1, 'optional-KO-reward queue untouched');
  });
});
