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
import type { LegendaryGameState, PendingKoHeroChoice } from '../types.js';
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
}): LegendaryGameState {
  return {
    currentStage: overrides.currentStage ?? 'main',
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
