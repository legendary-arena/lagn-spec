import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';
import { useVictoryPileComposition } from './useVictoryPileComposition';

function entry(extId: string): UIDisplayEntry {
  return {
    extId,
    display: {
      extId,
      name: extId,
      imageUrl: `https://images.barefootbetters.com/${extId}.png`,
      cost: null,
    },
  };
}

describe('useVictoryPileComposition (WP-129)', () => {
  test('returns all-zero composition for an empty pile', () => {
    const result = useVictoryPileComposition([]);
    assert.equal(result.bystandersRescued, 0);
    assert.equal(result.villainsDefeated, 0);
    assert.equal(result.henchmenDefeated, 0);
    assert.equal(result.mastermindCards, 0);
    assert.equal(result.woundsInPile, 0);
    assert.deepEqual(result.scenarioSpecific, []);
  });

  test('returns all-zero composition for undefined victoryCards (audience filter redacted)', () => {
    const result = useVictoryPileComposition(undefined);
    assert.equal(result.bystandersRescued, 0);
    assert.equal(result.villainsDefeated, 0);
    assert.deepEqual(result.scenarioSpecific, []);
  });

  test('classifies bystander* prefix into bystandersRescued', () => {
    const result = useVictoryPileComposition([
      entry('bystander-civilian-1'),
      entry('bystander-civilian-2'),
    ]);
    assert.equal(result.bystandersRescued, 2);
    assert.equal(result.villainsDefeated, 0);
  });

  test('classifies wound* prefix into woundsInPile', () => {
    const result = useVictoryPileComposition([entry('wound')]);
    assert.equal(result.woundsInPile, 1);
  });

  test('classifies henchman* prefix into henchmenDefeated', () => {
    const result = useVictoryPileComposition([
      entry('henchman-doombot-1'),
      entry('henchman-doombot-2'),
      entry('henchman-doombot-3'),
    ]);
    assert.equal(result.henchmenDefeated, 3);
  });

  test('classifies mastermind* and strike-* prefixes into mastermindCards', () => {
    const result = useVictoryPileComposition([
      entry('mastermind-doom-tactic-1'),
      entry('strike-doom-1'),
    ]);
    assert.equal(result.mastermindCards, 2);
  });

  test('classifies non-prefixed cards into villainsDefeated', () => {
    const result = useVictoryPileComposition([
      entry('doom-himself'),
      entry('mystique'),
    ]);
    assert.equal(result.villainsDefeated, 2);
  });

  test('mixed pile is binned correctly across all five universal counters', () => {
    const result = useVictoryPileComposition([
      entry('bystander-civilian-1'),
      entry('henchman-doombot-1'),
      entry('mystique'),
      entry('mystique'),
      entry('mastermind-doom-tactic-1'),
      entry('wound'),
    ]);
    assert.equal(result.bystandersRescued, 1);
    assert.equal(result.henchmenDefeated, 1);
    assert.equal(result.villainsDefeated, 2);
    assert.equal(result.mastermindCards, 1);
    assert.equal(result.woundsInPile, 1);
  });

  test('scenarioSpecific is always [] in WP-129 (D-12906 deferred derivation)', () => {
    const result = useVictoryPileComposition([entry('whatever')]);
    assert.deepEqual(result.scenarioSpecific, []);
  });
});
