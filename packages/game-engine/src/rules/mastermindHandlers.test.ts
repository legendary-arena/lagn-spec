/**
 * Tests for mastermind strike handler (WP-024, WP-154).
 *
 * Verifies bystander capture on strike, empty-supply logging,
 * negative assertions on city-villain attachedBystanders, and
 * serialization.
 *
 * No boardgame.io imports. Uses node:test and node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mastermindStrikeHandler } from './mastermindHandlers.js';
import type { LegendaryGameState } from '../types.js';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for mastermind handler testing.
 *
 * @returns A minimal LegendaryGameState with populated bystander supply.
 */
function makeTestState(): LegendaryGameState {
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
    currentStage: 'main' as LegendaryGameState['currentStage'],
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
      bystanders: ['bystander-001', 'bystander-002', 'bystander-003'],
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
    turnEconomy: {
      attack: 0,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
    },
    cardStats: {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    },
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
    heroAbilityHooks: [],
  };
}

describe('mastermindStrikeHandler', () => {
  // -------------------------------------------------------------------------
  // Test 1: handler returns non-empty RuleEffect[]
  // -------------------------------------------------------------------------
  it('returns non-empty RuleEffect[]', () => {
    const gameState = makeTestState();
    const effects = mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.ok(Array.isArray(effects), 'result must be an array');
    assert.ok(effects.length > 0, 'result must not be empty');
  });

  // -------------------------------------------------------------------------
  // Test 2: produces counter increment effect
  // -------------------------------------------------------------------------
  it('produces modifyCounter effect for masterStrikeCount', () => {
    const gameState = makeTestState();
    const effects = mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    const counterEffect = effects.find(
      (effect) =>
        effect.type === 'modifyCounter' &&
        'counter' in effect &&
        (effect as { counter: string }).counter === 'masterStrikeCount',
    );

    assert.ok(counterEffect, 'must contain modifyCounter for masterStrikeCount');
    assert.equal(
      (counterEffect as { delta: number }).delta,
      1,
      'delta must be 1',
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: captures top bystander (index 0) from non-empty supply
  // -------------------------------------------------------------------------
  it('captures top bystander from supply onto mastermind.attachedBystanders', () => {
    const gameState = makeTestState();
    const originalBystanderCount = gameState.piles.bystanders.length;
    const topBystander = gameState.piles.bystanders[0];

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      1,
      'mastermind.attachedBystanders must have exactly 1 entry after capture',
    );
    assert.equal(
      gameState.mastermind.attachedBystanders[0],
      topBystander,
      'captured bystander must be the former index-0 card',
    );
    assert.equal(
      gameState.piles.bystanders.length,
      originalBystanderCount - 1,
      'bystander pile must shrink by exactly 1',
    );
    assert.equal(
      gameState.piles.bystanders[0],
      'bystander-002',
      'new top of pile must be the former index-1 card',
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: empty supply — no capture, message appended
  // -------------------------------------------------------------------------
  it('skips capture and appends message when bystander supply is empty', () => {
    const gameState = makeTestState();
    gameState.piles.bystanders = [];
    const messagesBefore = gameState.messages.length;

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      0,
      'no bystander captured when supply is empty',
    );
    assert.equal(
      gameState.messages.length,
      messagesBefore + 1,
      'exactly one message appended on empty supply',
    );
    assert.ok(
      gameState.messages[gameState.messages.length - 1]!.startsWith('[Master Strike]'),
      'empty-supply message must begin with [Master Strike] prefix',
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: city-villain attachedBystanders unchanged (negative assertion)
  // -------------------------------------------------------------------------
  it('does not modify G.attachedBystanders (city-villain captures)', () => {
    const gameState = makeTestState();
    const cityBystandersBefore = JSON.parse(JSON.stringify(gameState.attachedBystanders));

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.deepStrictEqual(
      gameState.attachedBystanders,
      cityBystandersBefore,
      'G.attachedBystanders (city-villain) must not be modified by mastermind strike',
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: bystander pile length unchanged when supply is empty
  // -------------------------------------------------------------------------
  it('bystander pile length remains 0 when supply is already empty', () => {
    const gameState = makeTestState();
    gameState.piles.bystanders = [];

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.equal(
      gameState.piles.bystanders.length,
      0,
      'empty pile must remain at length 0',
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: effects are JSON-serializable
  // -------------------------------------------------------------------------
  it('effects are JSON-serializable', () => {
    const gameState = makeTestState();
    const effects = mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    const serialized = JSON.stringify(effects);
    assert.ok(serialized, 'JSON.stringify(effects) must produce a non-empty string');
  });
});
