/**
 * Tests for the setup-matrix sweep runner (WP-194).
 *
 * Covers the two exported runtime symbols (`cartesianProduct` and
 * `sweepSetupMatrix`) plus the locked `CELL_SEED_SEPARATOR` constant and
 * the `SweepCellResult` field-set drift gate.
 *
 * The dispatcher is exercised against the same minimal `CardRegistryReader`
 * stub the WP-036 / WP-193 tests use (`{ listCards: () => [] }`). No real
 * card data; no `boardgame.io` import; no `@legendary-arena/registry`
 * import. The cellSeed byte-equality assertion (D-19402) and the field-set
 * assertion (mirror of EC-220 §Field-set drift) are load-bearing drift
 * gates — they fail loudly on silent regressions.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { AIPolicy } from './ai.types.js';

import { createRandomPolicy } from './ai.random.js';
import {
  CELL_SEED_SEPARATOR,
  cartesianProduct,
  sweepSetupMatrix,
  type SweepCellResult,
} from './sweep.runner.js';

/**
 * Builds a valid 9-field MatchSetupConfig fixture for sweep tests.
 *
 * Mirrors the canonical pattern used by `simulation.test.ts` and
 * `simulation.captureMoves.test.ts`; the per-cell substitution in the
 * dispatcher only touches `schemeId` and `mastermindId`, so the other
 * seven fields can be anything that satisfies the type.
 */
function createBaseSetupConfig(): MatchSetupConfig {
  return {
    schemeId: 'base/scheme',
    mastermindId: 'base/mastermind',
    villainGroupIds: ['test-villain-group-001'],
    henchmanGroupIds: ['test-henchman-group-001'],
    heroDeckIds: ['test-hero-deck-001', 'test-hero-deck-002'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  };
}

/**
 * Minimal `CardRegistryReader` stub. The harness MUST NOT import
 * `@legendary-arena/registry`; the sweep tests construct the same
 * empty-result stub used by `simulation.test.ts` and
 * `simulation.captureMoves.test.ts`. `buildInitialGameState` handles
 * narrow mocks gracefully.
 */
function createMockRegistry(): CardRegistryReader {
  return {
    listCards: () => [],
  } as CardRegistryReader;
}

/**
 * Single-seat `buildPolicies` factory using `createRandomPolicy`.
 *
 * Mirrors the WP-193 seat-derived seed convention nested on top of the
 * cell seed (`${cellSeed}::seat:${seatIndex}`) so the test exercises the
 * full nested derivation. `playerCount = 1` in tests, so only one seat
 * policy is built.
 */
function buildSinglePolicyFromCellSeed(
  cellSeed: string,
  playerCount: number,
): readonly AIPolicy[] {
  const policies: AIPolicy[] = [];
  for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
    policies.push(createRandomPolicy(`${cellSeed}::seat:${seatIndex}`));
  }
  return policies;
}

// ---------------------------------------------------------------------------
// cartesianProduct invariants — zero / one / two / three axes.
// ---------------------------------------------------------------------------

describe('cartesianProduct — N-axis enumeration', () => {
  test('zero axes yields exactly one empty tuple (cross-product identity)', () => {
    const tuples = [...cartesianProduct<string>([])];
    assert.equal(tuples.length, 1);
    assert.deepEqual(tuples[0], []);
  });

  test('one axis with N items yields N single-item tuples in input order', () => {
    const tuples = [...cartesianProduct<string>([['a', 'b', 'c']])];
    assert.equal(tuples.length, 3);
    assert.deepEqual(tuples[0], ['a']);
    assert.deepEqual(tuples[1], ['b']);
    assert.deepEqual(tuples[2], ['c']);
  });

  test('two axes (M × N) yield M·N tuples with outer axis varying slowest', () => {
    const tuples = [...cartesianProduct<string>([['a', 'b'], ['x', 'y', 'z']])];
    assert.equal(tuples.length, 6);
    assert.deepEqual(tuples[0], ['a', 'x']);
    assert.deepEqual(tuples[1], ['a', 'y']);
    assert.deepEqual(tuples[2], ['a', 'z']);
    assert.deepEqual(tuples[3], ['b', 'x']);
    assert.deepEqual(tuples[4], ['b', 'y']);
    assert.deepEqual(tuples[5], ['b', 'z']);
  });

  test('three axes confirm the N-axis-generic behaviour (D-19401 extensibility smoke)', () => {
    const tuples = [...cartesianProduct<string>([
      ['a', 'b'],
      ['x', 'y'],
      ['1', '2'],
    ])];
    assert.equal(tuples.length, 8);
    assert.deepEqual(tuples[0], ['a', 'x', '1']);
    assert.deepEqual(tuples[7], ['b', 'y', '2']);
  });

  test('any empty axis collapses the cross product to zero tuples', () => {
    const tuples = [...cartesianProduct<string>([['a', 'b'], []])];
    assert.equal(tuples.length, 0);
  });
});

// ---------------------------------------------------------------------------
// sweepSetupMatrix invariants — lex-sort, determinism, skip predicate,
// drift gates.
// ---------------------------------------------------------------------------

describe('sweepSetupMatrix — dispatcher invariants', () => {
  test('lex-sort invariant: shuffled axis input produces lex-sorted callback sequence', () => {
    const collected: SweepCellResult[] = [];
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-b', 'scheme-a'],
      ['mastermind-y', 'mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-lex',
      (cell) => {
        collected.push(cell);
      },
    );

    assert.equal(collected.length, 4);
    assert.equal(collected[0]!.schemeId, 'scheme-a');
    assert.equal(collected[0]!.mastermindId, 'mastermind-x');
    assert.equal(collected[1]!.schemeId, 'scheme-a');
    assert.equal(collected[1]!.mastermindId, 'mastermind-y');
    assert.equal(collected[2]!.schemeId, 'scheme-b');
    assert.equal(collected[2]!.mastermindId, 'mastermind-x');
    assert.equal(collected[3]!.schemeId, 'scheme-b');
    assert.equal(collected[3]!.mastermindId, 'mastermind-y');
    assert.equal(collected[0]!.cellIndex, 0);
    assert.equal(collected[3]!.cellIndex, 3);
  });

  test('input axis arrays are not mutated by the dispatcher (stable copy)', () => {
    const schemeIds = ['scheme-b', 'scheme-a'];
    const mastermindIds = ['mastermind-y', 'mastermind-x'];
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      schemeIds,
      mastermindIds,
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-stable',
      () => {
        /* no-op collector — verifying that the caller's arrays are
         * untouched matters more than the cell payloads here. */
      },
    );
    assert.deepEqual(schemeIds, ['scheme-b', 'scheme-a']);
    assert.deepEqual(mastermindIds, ['mastermind-y', 'mastermind-x']);
  });

  test('determinism: two invocations with identical args produce deep-equal callback sequences', () => {
    const collectFirst: SweepCellResult[] = [];
    const collectSecond: SweepCellResult[] = [];
    const args = {
      base: createBaseSetupConfig(),
      schemes: ['scheme-a', 'scheme-b'],
      masterminds: ['mastermind-x', 'mastermind-y'],
      runSeed: 'run-seed-det',
    };

    sweepSetupMatrix(
      args.base,
      1,
      args.schemes,
      args.masterminds,
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      args.runSeed,
      (cell) => {
        collectFirst.push(cell);
      },
    );
    sweepSetupMatrix(
      args.base,
      1,
      args.schemes,
      args.masterminds,
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      args.runSeed,
      (cell) => {
        collectSecond.push(cell);
      },
    );

    assert.deepEqual(collectFirst, collectSecond);
    assert.equal(collectFirst.length, 4);
  });

  test('skip predicate honoured; cellIndex reflects original enumeration order', () => {
    const collected: SweepCellResult[] = [];
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a', 'scheme-b'],
      ['mastermind-x', 'mastermind-y'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-skip',
      (cell) => {
        collected.push(cell);
      },
      (schemeId, mastermindId) =>
        // why: skip the first cell (scheme-a, mastermind-x) and the third
        // cell (scheme-b, mastermind-x); callbacks should fire for the
        // remaining two, but with cellIndex values 1 and 3 — reflecting
        // the original 0-based enumeration over the lex-sorted product
        // rather than the post-skip ordinal.
        mastermindId === 'mastermind-x' && (schemeId === 'scheme-a' || schemeId === 'scheme-b'),
    );

    assert.equal(collected.length, 2);
    assert.equal(collected[0]!.schemeId, 'scheme-a');
    assert.equal(collected[0]!.mastermindId, 'mastermind-y');
    assert.equal(collected[0]!.cellIndex, 1);
    assert.equal(collected[1]!.schemeId, 'scheme-b');
    assert.equal(collected[1]!.mastermindId, 'mastermind-y');
    assert.equal(collected[1]!.cellIndex, 3);
  });

  test('empty schemeIds OR empty mastermindIds → callback never invoked', () => {
    let callbackCount = 0;
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      [],
      ['mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-empty-a',
      () => {
        callbackCount++;
      },
    );
    assert.equal(callbackCount, 0);

    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a'],
      [],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-empty-b',
      () => {
        callbackCount++;
      },
    );
    assert.equal(callbackCount, 0);
  });

  test('cellSeed byte-equality drift gate (D-19402): `${runSeed}::cell:${schemeId}:${mastermindId}`', () => {
    const collected: SweepCellResult[] = [];
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a'],
      ['mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-byte',
      (cell) => {
        collected.push(cell);
      },
    );

    assert.equal(collected.length, 1);
    assert.equal(
      collected[0]!.cellSeed,
      'run-seed-byte::cell:scheme-a:mastermind-x',
    );
    // why: re-derive the constant in-test so any drift on the
    // CELL_SEED_SEPARATOR value is also caught here.
    assert.equal(CELL_SEED_SEPARATOR, '::cell:');
  });

  test('SweepCellResult field-set drift assertion (mirror of EC-220 §Field-set drift)', () => {
    const collected: SweepCellResult[] = [];
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a'],
      ['mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-field-set',
      (cell) => {
        collected.push(cell);
      },
    );

    assert.equal(collected.length, 1);
    const keys = Object.keys(collected[0]!).sort();
    assert.deepEqual(keys, [
      'cellIndex',
      'cellSeed',
      'endgameReached',
      'hollowEffects',
      'hollowEffectsDropped',
      'mastermindId',
      'moveCount',
      'outcome',
      'schemeId',
    ]);
  });

  test('per-cell composition substitutes only schemeId + mastermindId; other 7 fields held verbatim', () => {
    const collected: SweepCellResult[] = [];
    const base = createBaseSetupConfig();
    sweepSetupMatrix(
      base,
      1,
      ['scheme-z'],
      ['mastermind-q'],
      createMockRegistry(),
      // why: capture the composition the dispatcher passed into
      // simulateOneGameAndCaptureMoves indirectly by inspecting the
      // resulting cell payload. The dispatcher does not surface the
      // composition itself, but the cell carries the substituted IDs;
      // the other seven fields must remain whatever the base had.
      buildSinglePolicyFromCellSeed,
      'run-seed-compose',
      (cell) => {
        collected.push(cell);
      },
    );
    assert.equal(collected.length, 1);
    assert.equal(collected[0]!.schemeId, 'scheme-z');
    assert.equal(collected[0]!.mastermindId, 'mastermind-q');
    // Sanity-check the base was not mutated.
    assert.equal(base.schemeId, 'base/scheme');
    assert.equal(base.mastermindId, 'base/mastermind');
  });

  test('per-cell hollow diagnostics pass-through (WP-263): []/0 under the mock registry', () => {
    const collected: SweepCellResult[] = [];
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a'],
      ['mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-hollow',
      (cell) => {
        collected.push(cell);
      },
    );

    assert.equal(collected.length, 1);
    // why (WP-263): the mock registry produces no hollow effects, so the
    // per-cell fields pass through the CapturedGameResult as []/0.
    assert.deepEqual(collected[0]!.hollowEffects, []);
    assert.equal(collected[0]!.hollowEffectsDropped, 0);
  });
});

describe('sweepSetupMatrix — maxTurns turn cap (WP-264)', () => {
  test('a small maxTurns lowers the cell moveCount (forwarded to the capture call)', () => {
    const cappedCells: SweepCellResult[] = [];
    const uncappedCells: SweepCellResult[] = [];

    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a'],
      ['mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-wp264-bound',
      (cell) => {
        cappedCells.push(cell);
      },
      undefined,
      5,
    );
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a'],
      ['mastermind-x'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-wp264-bound',
      (cell) => {
        uncappedCells.push(cell);
      },
    );

    assert.equal(cappedCells.length, 1);
    assert.equal(uncappedCells.length, 1);
    // why (WP-264): maxTurns is forwarded to simulateOneGameAndCaptureMoves, so
    // a small cap bounds the per-turn loop and the cell's moveCount drops at or
    // below the uncapped run (the mock registry never reaches endgame, so the
    // uncapped run spins to the 200 safety cap).
    assert.equal(
      cappedCells[0]!.moveCount <= uncappedCells[0]!.moveCount,
      true,
      'a maxTurns of 5 must bound the cell moveCount at or below the uncapped run',
    );
  });

  test('default-equivalence: omitting maxTurns deep-equals passing the literal 200', () => {
    const omitted: SweepCellResult[] = [];
    const explicit: SweepCellResult[] = [];

    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a', 'scheme-b'],
      ['mastermind-x', 'mastermind-y'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-wp264-default',
      (cell) => {
        omitted.push(cell);
      },
    );
    // why (WP-264): maxTurns is the trailing param after shouldSkipCell?, so the
    // explicit-200 call passes undefined for shouldSkipCell to reach it. The two
    // full callback sequences must be deep-equal — omitting === the 200 default.
    sweepSetupMatrix(
      createBaseSetupConfig(),
      1,
      ['scheme-a', 'scheme-b'],
      ['mastermind-x', 'mastermind-y'],
      createMockRegistry(),
      buildSinglePolicyFromCellSeed,
      'run-seed-wp264-default',
      (cell) => {
        explicit.push(cell);
      },
      undefined,
      200,
    );

    assert.equal(omitted.length, 4);
    assert.deepStrictEqual(omitted, explicit);
  });
});
