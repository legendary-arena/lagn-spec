import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BYSTANDER_EXT_ID,
  WOUND_EXT_ID,
  type UIDisplayEntry,
} from '@legendary-arena/game-engine';
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

  test('classifies BYSTANDER_EXT_ID (pile-bystander) into bystandersRescued', () => {
    // why: regression guard for the production "Bystanders rescued = 1 with
    // 2 bystanders in pile" bug. The supply-pile token does NOT start with
    // 'bystander' so the legacy prefix-only heuristic mis-binned it as
    // villainsDefeated. Mirrors the dual condition the engine uses in
    // scoring.logic.ts:computeFinalScores.
    const result = useVictoryPileComposition([
      entry(BYSTANDER_EXT_ID),
      entry(BYSTANDER_EXT_ID),
    ]);
    assert.equal(result.bystandersRescued, 2);
    assert.equal(result.villainsDefeated, 0);
  });

  test('classifies WOUND_EXT_ID (pile-wound) into woundsInPile', () => {
    const result = useVictoryPileComposition([entry(WOUND_EXT_ID)]);
    assert.equal(result.woundsInPile, 1);
    assert.equal(result.villainsDefeated, 0);
  });

  test('classifies master-strike-NN into mastermindCards', () => {
    // why: master-strike ext_ids are emitted by villainDeck.setup.ts and
    // do not start with 'mastermind' or 'strike-' — without the explicit
    // 'master-strike-' prefix branch they would catch-all into
    // villainsDefeated.
    const result = useVictoryPileComposition([
      entry('master-strike-00'),
      entry('master-strike-01'),
    ]);
    assert.equal(result.mastermindCards, 2);
    assert.equal(result.villainsDefeated, 0);
  });

  test('mixed villain-deck and supply-pile bystanders are both counted', () => {
    const result = useVictoryPileComposition([
      entry('bystander-villain-deck-00'),
      entry(BYSTANDER_EXT_ID),
    ]);
    assert.equal(result.bystandersRescued, 2);
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
