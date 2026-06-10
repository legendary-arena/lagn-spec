/**
 * Mastermind logic unit tests for WP-019.
 *
 * Tests defeatTopTactic and areAllTacticsDefeated pure helpers.
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defeatTopTactic, areAllTacticsDefeated } from './mastermind.logic.js';
import type { MastermindState } from './mastermind.types.js';

describe('defeatTopTactic', () => {
  it('removes first card from tacticsDeck and appends to tacticsDefeated', () => {
    const state: MastermindState = {
      id: 'mm-a',
      baseCardId: 'mm-a-base',
      tacticsDeck: ['tactic-1', 'tactic-2', 'tactic-3'],
      tacticsDefeated: [],
    };

    const result = defeatTopTactic(state);

    assert.deepStrictEqual(result.tacticsDeck, ['tactic-2', 'tactic-3']);
    assert.deepStrictEqual(result.tacticsDefeated, ['tactic-1']);
  });

  it('on empty tacticsDeck: returns unchanged', () => {
    const state: MastermindState = {
      id: 'mm-b',
      baseCardId: 'mm-b-base',
      tacticsDeck: [],
      tacticsDefeated: ['already-defeated'],
    };

    const result = defeatTopTactic(state);

    assert.strictEqual(result, state, 'Must return the same object when deck is empty');
    assert.deepStrictEqual(result.tacticsDeck, []);
    assert.deepStrictEqual(result.tacticsDefeated, ['already-defeated']);
  });

  it('preserves strikePile, attachedBystanders, and gameText through a defeat', () => {
    const state: MastermindState = {
      id: 'mm-f',
      baseCardId: 'mm-f-base',
      tacticsDeck: ['tactic-1'],
      tacticsDefeated: [],
      strikePile: ['strike-1'],
      attachedBystanders: ['pile-bystander'],
      gameText: ['Master Strike: each player discards a card.'],
    };

    const result = defeatTopTactic(state);

    assert.deepStrictEqual(
      result.strikePile,
      ['strike-1'],
      'strikePile must survive the rebuild',
    );
    assert.deepStrictEqual(
      result.attachedBystanders,
      ['pile-bystander'],
      'attachedBystanders must survive the rebuild',
    );
    assert.deepStrictEqual(
      result.gameText,
      ['Master Strike: each player discards a card.'],
      'gameText must survive the rebuild',
    );
  });

  it('returns new object (input not mutated)', () => {
    const state: MastermindState = {
      id: 'mm-c',
      baseCardId: 'mm-c-base',
      tacticsDeck: ['tactic-x', 'tactic-y'],
      tacticsDefeated: [],
    };

    const result = defeatTopTactic(state);

    assert.notStrictEqual(result, state, 'Must return a new object');
    assert.deepStrictEqual(
      state.tacticsDeck,
      ['tactic-x', 'tactic-y'],
      'Original tacticsDeck must not be mutated',
    );
    assert.deepStrictEqual(
      state.tacticsDefeated,
      [],
      'Original tacticsDefeated must not be mutated',
    );
  });
});

describe('areAllTacticsDefeated', () => {
  it('returns true when deck empty and defeated non-empty', () => {
    const state: MastermindState = {
      id: 'mm-d',
      baseCardId: 'mm-d-base',
      tacticsDeck: [],
      tacticsDefeated: ['t1', 't2', 't3'],
    };

    assert.strictEqual(areAllTacticsDefeated(state), true);
  });

  it('returns false when deck has cards', () => {
    const state: MastermindState = {
      id: 'mm-e',
      baseCardId: 'mm-e-base',
      tacticsDeck: ['remaining'],
      tacticsDefeated: ['t1'],
    };

    assert.strictEqual(areAllTacticsDefeated(state), false);
  });
});
