/**
 * Tests for the pending-KO short-circuit in getLegalMoves (WP-242 / D-24009).
 *
 * When a KO-a-Hero choice is pending, getLegalMoves MUST return a list of
 * length EXACTLY 1 whose single entry is resolveKoHeroChoice with the legacy
 * auto-resolution target (selectKoHeroTarget priority — captured here via
 * selectDefaultKoTarget). When no choice is pending, enumeration is unchanged.
 *
 * Uses node:test + node:assert only. No boardgame.io imports.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getLegalMoves } from './ai.legalMoves.js';
import { selectDefaultKoTarget } from '../villain/villainEffects.execute.js';
import { selectDefaultOptionalKoTarget } from '../hero/heroEffects.execute.js';
import type { LegendaryGameState, PendingKoHeroChoice, PendingOptionalKoReward } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';

const CONTEXT = { phase: 'play', turn: 1, currentPlayer: '0', numPlayers: 1 };

/**
 * Builds a minimal LegendaryGameState exercising only what getLegalMoves reads.
 */
function makeG(overrides: {
  hand?: CardExtId[];
  discard?: CardExtId[];
  inPlay?: CardExtId[];
  currentStage?: LegendaryGameState['currentStage'];
  pendingKoHeroChoices?: PendingKoHeroChoice[];
  villainRevealedThisTurn?: boolean;
}): LegendaryGameState {
  return {
    currentStage: overrides.currentStage ?? 'main',
    villainRevealedThisTurn: overrides.villainRevealedThisTurn ?? false,
    playerZones: {
      '0': {
        deck: [],
        hand: overrides.hand ?? [],
        discard: overrides.discard ?? [],
        inPlay: overrides.inPlay ?? [],
        victory: [],
      },
    },
    turnEconomy: { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 },
    cardStats: {},
    cardKeywords: {},
    hq: [null, null, null, null, null],
    city: [null, null, null, null, null],
    mastermind: { baseCardId: 'm-base', tacticsDeck: [] },
    pendingKoHeroChoices: overrides.pendingKoHeroChoices,
  } as unknown as LegendaryGameState;
}

describe('getLegalMoves — pending-KO short-circuit (WP-242 / D-24009)', () => {
  test('returns EXACTLY one resolveKoHeroChoice whose target = selectDefaultKoTarget when a KO choice is pending', () => {
    const gameState = makeG({
      discard: ['core/spider-man/strike' as CardExtId, 'starting-shield-agent' as CardExtId],
      hand: ['hero-h' as CardExtId],
      inPlay: ['hero-p' as CardExtId],
      currentStage: 'main',
      pendingKoHeroChoices: [{ choiceType: 'ko-hero', playerID: '0' }],
    });

    const legalMoves = getLegalMoves(gameState, CONTEXT);

    assert.equal(legalMoves.length, 1, 'exactly one legal move while pending');
    const only = legalMoves[0]!;
    assert.equal(only.name, 'resolveKoHeroChoice', 'the single move is resolveKoHeroChoice');
    const expectedTarget = selectDefaultKoTarget(gameState.playerZones['0']!);
    assert.deepStrictEqual(
      only.args,
      expectedTarget,
      'target equals the legacy auto-resolution pick (selectKoHeroTarget priority)',
    );
    // The default target is the starter SHIELD card in discard (D-20602).
    assert.deepStrictEqual(only.args, { zone: 'discard', cardId: 'starting-shield-agent' });
  });

  test('short-circuit fires regardless of stage (board frozen)', () => {
    const gameState = makeG({
      hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
      currentStage: 'start',
      pendingKoHeroChoices: [{ choiceType: 'ko-hero', playerID: '0' }],
    });
    const legalMoves = getLegalMoves(gameState, CONTEXT);
    assert.equal(legalMoves.length, 1);
    assert.equal(legalMoves[0]!.name, 'resolveKoHeroChoice');
  });

  test('no resolveKoHeroChoice and normal enumeration when no KO choice is pending', () => {
    const gameState = makeG({
      hand: ['hero-a' as CardExtId],
      currentStage: 'main',
    });
    const legalMoves = getLegalMoves(gameState, CONTEXT);
    const names = legalMoves.map((m) => m.name);
    assert.equal(
      names.includes('resolveKoHeroChoice'),
      false,
      'resolveKoHeroChoice absent when no KO choice pending',
    );
    assert.equal(names.includes('playCard'), true, 'normal main-stage moves enumerated');
  });

  test('an empty pending queue does not short-circuit', () => {
    const gameState = makeG({
      hand: ['hero-a' as CardExtId],
      currentStage: 'main',
      pendingKoHeroChoices: [],
    });
    const legalMoves = getLegalMoves(gameState, CONTEXT);
    assert.equal(
      legalMoves.some((m) => m.name === 'resolveKoHeroChoice'),
      false,
      'empty queue is not pending',
    );
  });
});

describe('getLegalMoves — pending optional-KO-reward short-circuit (WP-248 / D-24019)', () => {
  const optionalPending: PendingOptionalKoReward[] = [
    { playerID: '0', rewardType: 'rescue', rewardMagnitude: 1, sourceCardId: 'hero-x' as CardExtId },
  ];

  test('returns EXACTLY one resolveOptionalKoReward whose target = selectDefaultOptionalKoTarget; never declines', () => {
    const gameState = makeG({
      discard: ['pricey-discard' as CardExtId],
      hand: ['cheap-hand' as CardExtId],
      currentStage: 'main',
    });
    gameState.pendingOptionalKoRewards = optionalPending;
    gameState.cardStats = {
      'pricey-discard': { attack: 0, recruit: 0, cost: 3, fightCost: 0 },
      'cheap-hand': { attack: 0, recruit: 0, cost: 1, fightCost: 0 },
    } as unknown as LegendaryGameState['cardStats'];

    const legalMoves = getLegalMoves(gameState, CONTEXT);

    assert.equal(legalMoves.length, 1, 'exactly one legal move while pending');
    const only = legalMoves[0]!;
    assert.equal(only.name, 'resolveOptionalKoReward', 'the single move is resolveOptionalKoReward');
    const expectedTarget = selectDefaultOptionalKoTarget(gameState.playerZones['0']!, gameState.cardStats);
    assert.deepStrictEqual(only.args, expectedTarget, 'target equals the deterministic default pick');
    // The default target is the lowest-cost card (hand cost 1 beats discard cost 3).
    assert.deepStrictEqual(only.args, { zone: 'hand', cardId: 'cheap-hand' });
    // The bot never declines.
    assert.notDeepStrictEqual(only.args, { decline: true }, 'the bot never emits decline');
  });

  test('optional-KO-reward short-circuit fires BEFORE the KO-hero one (precedence lock)', () => {
    const gameState = makeG({
      discard: ['only-card' as CardExtId],
      currentStage: 'main',
      pendingKoHeroChoices: [{ choiceType: 'ko-hero', playerID: '0' }],
    });
    gameState.pendingOptionalKoRewards = optionalPending;
    gameState.cardStats = {
      'only-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0 },
    } as unknown as LegendaryGameState['cardStats'];

    const legalMoves = getLegalMoves(gameState, CONTEXT);

    assert.equal(legalMoves.length, 1, 'still exactly one move when both queues are non-empty');
    assert.equal(
      legalMoves[0]!.name,
      'resolveOptionalKoReward',
      'optional-KO-reward takes precedence over resolveKoHeroChoice',
    );
  });

  test('no resolveOptionalKoReward and normal enumeration when no optional-KO-reward is pending', () => {
    const gameState = makeG({ hand: ['hero-a' as CardExtId], currentStage: 'main' });
    const legalMoves = getLegalMoves(gameState, CONTEXT);
    const names = legalMoves.map((m) => m.name);
    assert.equal(names.includes('resolveOptionalKoReward'), false, 'absent when not pending');
    assert.equal(names.includes('playCard'), true, 'normal main-stage moves enumerated');
  });
});

describe('getLegalMoves — once-per-turn reveal gate (WP-266)', () => {
  test('offers revealVillainCard at the start stage when the reveal allowance is unspent', () => {
    const gameState = makeG({ currentStage: 'start', villainRevealedThisTurn: false });
    const names = getLegalMoves(gameState, CONTEXT).map((m) => m.name);
    assert.equal(
      names.includes('revealVillainCard'),
      true,
      'reveal is offered while villainRevealedThisTurn is false',
    );
  });

  test('suppresses revealVillainCard at the start stage once the reveal allowance is spent', () => {
    const gameState = makeG({ currentStage: 'start', villainRevealedThisTurn: true });
    const names = getLegalMoves(gameState, CONTEXT).map((m) => m.name);
    assert.equal(
      names.includes('revealVillainCard'),
      false,
      'reveal is gated out once villainRevealedThisTurn is true (mirrors the move-level guard)',
    );
    // why: the gate must not strand the turn — advanceStage stays available so
    // the bot can progress to main after its single start-stage reveal.
    assert.equal(names.includes('advanceStage'), true, 'advanceStage remains available');
  });
});
