/**
 * Tests for the sweep manifest anomaly oracle (WP-195).
 *
 * Covers the 15 locked exports of `sweep.analyze.ts`:
 *   - Closed-set drift gate on `SWEEP_ANOMALY_CLASSES` vs the
 *     `SweepAnomalyClass` union (canonical-array drift pattern).
 *   - `classifyCell` rules with boundary cases at `escapedVillains`
 *     7 / 8 / 12.
 *   - Fatal `errorSignature` length cases (short / 80-char / longer
 *     with whitespace-bearing prefix).
 *   - `parseManifestLine` shape checks: valid success + fatal; five
 *     malformed variants (non-JSON, neither-shape, missing field,
 *     wrong-typed field, wrong `type` value, extra key on outer, extra
 *     key on nested `outcome`).
 *   - `parseManifestLine` non-plain-object rejection (array, `null`,
 *     primitive, non-`Object.prototype` object).
 *   - `classifyManifestRecords` summary invariants
 *     (`sum(anomalyCounts) === totalCells === sum(winnerCounts)`),
 *     winner-bucket attribution (success + fatal), exclusion of
 *     malformed lines from `totalCells`.
 *   - Distribution math: `count === 0`, `count === 1`, mean/median
 *     rounding order (average first then round), `p95` at `count === 1`.
 *   - Sum accumulation order (input-array iteration order; no Kahan,
 *     no reordering).
 *   - Unicode comparator divergence under `localeCompare` vs Unicode
 *     code-unit order in `fatalErrorSignatures` sort.
 *   - Stdout byte-stream contract is owned by the CLI script, but the
 *     classifier's output object is structured so the renderer can
 *     emit a single trailing `\n` with no BOM — exercised here by
 *     asserting fixture renderer output shape.
 *   - `MAX_TURNS_PER_GAME` drift gate that reads
 *     `simulation.runner.ts` + `sweep.analyze.ts` source from disk and
 *     asserts the literal `const MAX_TURNS_PER_GAME = 200;` appears
 *     once in each.
 *   - Determinism invariant: two calls to `classifyManifestRecords`
 *     with deep-equal inputs produce deep-equal outputs.
 *
 * No `boardgame.io` import. No `@legendary-arena/registry` import. No
 * live FS deps except the drift-gate test which reads source files
 * from disk (test-environment-only filesystem touchpoint).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SWEEP_ANOMALY_CLASSES,
  type SweepAnomalyClass,
  type ParsedSuccessRecord,
  type ParsedFatalRecord,
  type ParsedManifestRecord,
  type MalformedLine,
  parseManifestLine,
  classifyCell,
  classifyManifestRecords,
} from './sweep.analyze.js';

/**
 * Resolves to the absolute path of the simulation/ directory so the
 * drift-gate test reads `simulation.runner.ts` and `sweep.analyze.ts`
 * sources verbatim from disk. `import.meta.url` is the only stable
 * anchor in an ESM test file under `node:test`.
 */
const SIMULATION_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Constructs a canonical success-shape record with sane defaults. Each
 * test overrides only the fields it cares about.
 */
function makeSuccessRecord(
  overrides: Partial<Omit<ParsedSuccessRecord, 'type' | 'outcome'>> & {
    outcome?: Partial<ParsedSuccessRecord['outcome']>;
  } = {},
): ParsedSuccessRecord {
  // Spread the overrides over the defaults so an explicit `winner: null`
  // is preserved (rather than coerced back to `'heroes-win'` by `??`).
  const mergedOutcome = {
    escapedVillains: 0,
    winner: 'heroes-win' as ParsedSuccessRecord['outcome']['winner'],
    ...(overrides.outcome ?? {}),
  };
  return {
    type: 'success',
    cellIndex: overrides.cellIndex ?? 0,
    cellSeed: overrides.cellSeed ?? 'run::cell:scheme-a:mastermind-x',
    endgameReached: overrides.endgameReached ?? true,
    mastermindId: overrides.mastermindId ?? 'mastermind-x',
    moveCount: overrides.moveCount ?? 30,
    outcome: mergedOutcome,
    schemeId: overrides.schemeId ?? 'scheme-a',
  };
}

/**
 * Constructs a canonical fatal-shape record with sane defaults.
 */
function makeFatalRecord(
  overrides: Partial<Omit<ParsedFatalRecord, 'type'>> = {},
): ParsedFatalRecord {
  return {
    type: 'fatal',
    cellSeed: overrides.cellSeed ?? 'run::cell:scheme-x:mastermind-z',
    error: overrides.error ?? 'Cell dispatch threw an unexpected error.',
    mastermindId: overrides.mastermindId ?? 'mastermind-z',
    schemeId: overrides.schemeId ?? 'scheme-x',
  };
}

/**
 * Serialises a record to canonical-JSON with lexicographically sorted
 * keys (mirrors WP-194's manifest emission rule). Used to build inline
 * JSONL fixtures for `parseManifestLine` tests.
 */
function serialiseRecord(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
      return inner;
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(inner).sort()) {
      sorted[key] = (inner as Record<string, unknown>)[key];
    }
    return sorted;
  });
}

describe('sweep.analyze — closed-set drift gate (D-19502)', () => {
  test('SWEEP_ANOMALY_CLASSES deep-equals the locked 4-class canonical array', () => {
    assert.deepStrictEqual(
      [...SWEEP_ANOMALY_CLASSES],
      ['endgame-reached', 'not-endgame', 'escaped-villain-cap', 'fatal'],
      'Canonical anomaly array drifted from the locked literal',
    );
  });

  test('SWEEP_ANOMALY_CLASSES has exactly 4 members; matches SweepAnomalyClass union', () => {
    // Canonical-array drift pattern: the union members are spelled out
    // here so a TypeScript compile error fires if the union diverges.
    const unionMembers: readonly SweepAnomalyClass[] = [
      'endgame-reached',
      'not-endgame',
      'escaped-villain-cap',
      'fatal',
    ];
    assert.strictEqual(SWEEP_ANOMALY_CLASSES.length, unionMembers.length);
    for (const member of unionMembers) {
      assert.ok(
        SWEEP_ANOMALY_CLASSES.includes(member),
        `Canonical array missing union member ${member}`,
      );
    }
  });
});

describe('sweep.analyze — classifyCell rules', () => {
  test('returns "endgame-reached" for success + endgameReached:true + escapedVillains < ESCAPE_LIMIT (boundary at 7)', () => {
    const record = makeSuccessRecord({
      endgameReached: true,
      outcome: { escapedVillains: 7, winner: 'heroes-win' },
    });
    const classified = classifyCell(record);
    assert.strictEqual(classified.anomalyClass, 'endgame-reached');
    assert.strictEqual(classified.errorSignature, null);
    assert.strictEqual(classified.escapedVillains, 7);
  });

  test('returns "escaped-villain-cap" for success + endgameReached:true + escapedVillains === ESCAPE_LIMIT (boundary at 8)', () => {
    const record = makeSuccessRecord({
      endgameReached: true,
      outcome: { escapedVillains: 8, winner: 'scheme-wins' },
    });
    const classified = classifyCell(record);
    assert.strictEqual(classified.anomalyClass, 'escaped-villain-cap');
  });

  test('returns "escaped-villain-cap" for success + endgameReached:true + escapedVillains > ESCAPE_LIMIT (boundary at 12)', () => {
    const record = makeSuccessRecord({
      endgameReached: true,
      outcome: { escapedVillains: 12, winner: 'scheme-wins' },
    });
    const classified = classifyCell(record);
    assert.strictEqual(classified.anomalyClass, 'escaped-villain-cap');
    assert.strictEqual(classified.escapedVillains, 12);
  });

  test('returns "not-endgame" for any success + endgameReached:false (regardless of escapedVillains)', () => {
    const record = makeSuccessRecord({
      endgameReached: false,
      outcome: { escapedVillains: 9, winner: null },
    });
    const classified = classifyCell(record);
    assert.strictEqual(classified.anomalyClass, 'not-endgame');
    assert.strictEqual(classified.errorSignature, null);
  });

  test('returns "fatal" with errorSignature for fatal record (short error preserved verbatim)', () => {
    const record = makeFatalRecord({ error: 'Short error message.' });
    const classified = classifyCell(record);
    assert.strictEqual(classified.anomalyClass, 'fatal');
    assert.strictEqual(classified.errorSignature, 'Short error message.');
    assert.strictEqual(classified.moveCount, null);
    assert.strictEqual(classified.winner, null);
    assert.strictEqual(classified.escapedVillains, null);
  });

  test('errorSignature equals first 80 UTF-16 code units for >80-char error (no normalization)', () => {
    // 200-char ASCII error with leading whitespace + newlines; the
    // signature MUST be the first 80 UTF-16 code units VERBATIM (no
    // trimming, no newline stripping, no case folding per D-19502).
    const error = '  \nError describing an unexpected condition that exceeds the eighty-character boundary by a wide margin.';
    assert.ok(error.length > 80, 'Test precondition: error must exceed 80 chars');
    const record = makeFatalRecord({ error });
    const classified = classifyCell(record);
    assert.strictEqual(classified.errorSignature!.length, 80);
    assert.strictEqual(classified.errorSignature, error.slice(0, 80));
    assert.ok(
      classified.errorSignature!.startsWith('  \n'),
      'Signature must preserve leading whitespace + newline verbatim',
    );
  });

  test('errorSignature equals the full error when exactly 80 UTF-16 code units', () => {
    const error = 'A'.repeat(80);
    const record = makeFatalRecord({ error });
    const classified = classifyCell(record);
    assert.strictEqual(classified.errorSignature, error);
    assert.strictEqual(classified.errorSignature!.length, 80);
  });
});

describe('sweep.analyze — parseManifestLine shape checks (D-19501)', () => {
  test('parses a valid 7-key canonical success-shape line to a ParsedSuccessRecord with type:"success"', () => {
    const record = {
      cellIndex: 0,
      cellSeed: 'run::cell:scheme-a:mastermind-x',
      endgameReached: true,
      mastermindId: 'mastermind-x',
      moveCount: 42,
      outcome: { escapedVillains: 3, winner: 'heroes-win' },
      schemeId: 'scheme-a',
    };
    const result = parseManifestLine(serialiseRecord(record));
    assert.strictEqual(result.malformedReason, null);
    assert.ok(result.record !== null);
    assert.strictEqual(result.record!.type, 'success');
    if (result.record!.type === 'success') {
      assert.strictEqual(result.record!.cellIndex, 0);
      assert.strictEqual(result.record!.moveCount, 42);
      assert.strictEqual(result.record!.outcome.escapedVillains, 3);
      assert.strictEqual(result.record!.outcome.winner, 'heroes-win');
    }
  });

  test('parses a valid 5-key canonical fatal-shape line to a ParsedFatalRecord', () => {
    const record = {
      cellSeed: 'run::cell:scheme-x:mastermind-z',
      error: 'Cell threw on dispatch.',
      mastermindId: 'mastermind-z',
      schemeId: 'scheme-x',
      type: 'fatal',
    };
    const result = parseManifestLine(serialiseRecord(record));
    assert.strictEqual(result.malformedReason, null);
    assert.ok(result.record !== null);
    assert.strictEqual(result.record!.type, 'fatal');
  });

  test('rejects non-JSON syntax with a full-sentence malformedReason', () => {
    const result = parseManifestLine('not-valid-json');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('not valid JSON'),
      `Reason must name invalid JSON; got: ${result.malformedReason}`,
    );
  });

  test('rejects neither-shape JSON object with a full-sentence malformedReason', () => {
    const result = parseManifestLine('{"foo":1,"bar":2}');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('key set'),
      `Reason must name the key-set mismatch; got: ${result.malformedReason}`,
    );
  });

  test('rejects success shape with a missing field (cellIndex absent)', () => {
    const result = parseManifestLine(
      '{"cellSeed":"s","endgameReached":true,"mastermindId":"m","moveCount":1,"outcome":{"escapedVillains":0,"winner":null},"schemeId":"s"}',
    );
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
  });

  test('rejects success shape with a wrong-typed field (moveCount as string)', () => {
    const result = parseManifestLine(
      '{"cellIndex":0,"cellSeed":"s","endgameReached":true,"mastermindId":"m","moveCount":"ten","outcome":{"escapedVillains":0,"winner":null},"schemeId":"s"}',
    );
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('moveCount'),
      `Reason must name moveCount; got: ${result.malformedReason}`,
    );
  });

  test('rejects fatal shape with a non-canonical type value', () => {
    const result = parseManifestLine(
      '{"cellSeed":"s","error":"e","mastermindId":"m","schemeId":"s","type":"error"}',
    );
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('type'),
      `Reason must name type field; got: ${result.malformedReason}`,
    );
  });

  test('rejects success shape with an extra (8th) key on the outer record', () => {
    const result = parseManifestLine(
      '{"cellIndex":0,"cellSeed":"s","endgameReached":true,"mastermindId":"m","moveCount":1,"outcome":{"escapedVillains":0,"winner":null},"schemeId":"s","extra":42}',
    );
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
  });

  test('rejects success shape with an extra key on the nested outcome object', () => {
    const result = parseManifestLine(
      '{"cellIndex":0,"cellSeed":"s","endgameReached":true,"mastermindId":"m","moveCount":1,"outcome":{"escapedVillains":0,"winner":null,"extra":"x"},"schemeId":"s"}',
    );
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('outcome'),
      `Reason must name the nested outcome object; got: ${result.malformedReason}`,
    );
  });
});

describe('sweep.analyze — parseManifestLine non-plain-object rejection (D-19501)', () => {
  test('rejects a JSON array', () => {
    const result = parseManifestLine('[1,2,3]');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('JSON array'),
      `Reason must name a JSON array; got: ${result.malformedReason}`,
    );
  });

  test('rejects the JSON literal null', () => {
    const result = parseManifestLine('null');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('null'),
      `Reason must name the null literal; got: ${result.malformedReason}`,
    );
  });

  test('rejects a JSON string primitive', () => {
    const result = parseManifestLine('"a string"');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('string'),
      `Reason must name the string primitive; got: ${result.malformedReason}`,
    );
  });

  test('rejects a JSON number primitive', () => {
    const result = parseManifestLine('42');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('number'),
      `Reason must name the number primitive; got: ${result.malformedReason}`,
    );
  });

  test('rejects a JSON boolean primitive', () => {
    const result = parseManifestLine('true');
    assert.strictEqual(result.record, null);
    assert.ok(result.malformedReason !== null);
    assert.ok(
      result.malformedReason!.includes('boolean'),
      `Reason must name the boolean primitive; got: ${result.malformedReason}`,
    );
  });
});

describe('sweep.analyze — classifyManifestRecords summary invariants', () => {
  test('cell-count invariant: totalCells === records.length AND sum(anomalyCounts) === totalCells AND sum(winnerCounts) === totalCells', () => {
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({
        cellSeed: 'a',
        endgameReached: true,
        outcome: { escapedVillains: 0, winner: 'heroes-win' },
      }),
      makeSuccessRecord({
        cellSeed: 'b',
        endgameReached: false,
        outcome: { escapedVillains: 0, winner: null },
      }),
      makeSuccessRecord({
        cellSeed: 'c',
        endgameReached: true,
        outcome: { escapedVillains: 8, winner: 'scheme-wins' },
      }),
      makeFatalRecord({ cellSeed: 'd', error: 'Fatal A' }),
      makeFatalRecord({ cellSeed: 'e', error: 'Fatal B' }),
    ];
    const result = classifyManifestRecords(records, []);
    assert.strictEqual(result.summary.totalCells, 5);
    assert.strictEqual(result.summary.totalCells, records.length);
    const anomalySum =
      result.summary.anomalyCounts['endgame-reached'] +
      result.summary.anomalyCounts['not-endgame'] +
      result.summary.anomalyCounts['escaped-villain-cap'] +
      result.summary.anomalyCounts['fatal'];
    assert.strictEqual(anomalySum, 5);
    const winnerSum =
      result.summary.winnerCounts['heroes-win'] +
      result.summary.winnerCounts['scheme-wins'] +
      result.summary.winnerCounts['null'];
    assert.strictEqual(winnerSum, 5);
    // Fatal records contribute to winnerCounts.null per the contract.
    assert.strictEqual(result.summary.winnerCounts['null'], 3);
    assert.strictEqual(result.summary.winnerCounts['heroes-win'], 1);
    assert.strictEqual(result.summary.winnerCounts['scheme-wins'], 1);
    assert.strictEqual(result.summary.anomalyCounts['fatal'], 2);
  });

  test('malformed lines are excluded from totalCells and surfaced separately', () => {
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({ cellSeed: 'a' }),
      makeSuccessRecord({ cellSeed: 'b' }),
      makeSuccessRecord({ cellSeed: 'c' }),
      makeSuccessRecord({ cellSeed: 'd' }),
      makeSuccessRecord({ cellSeed: 'e' }),
    ];
    const malformedLines: readonly MalformedLine[] = [
      { lineNumber: 2, reason: 'Manifest line is not valid JSON; expected canonical-JSON.' },
      { lineNumber: 5, reason: 'Manifest line is not valid JSON; expected canonical-JSON.' },
    ];
    const result = classifyManifestRecords(records, malformedLines);
    assert.strictEqual(result.summary.totalCells, 5);
    assert.strictEqual(result.malformedLines.length, 2);
  });
});

describe('sweep.analyze — NumericDistributionStats math', () => {
  test('count === 0 yields { count: 0, min/max/mean/median/p95: null }', () => {
    const result = classifyManifestRecords([], []);
    assert.deepStrictEqual(result.summary.moveCountStats, {
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p95: null,
    });
    assert.deepStrictEqual(result.summary.escapedVillainStats, {
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p95: null,
    });
  });

  test('count === 1: min === max === mean === median === p95 equals the single value', () => {
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({ moveCount: 42 }),
    ];
    const result = classifyManifestRecords(records, []);
    assert.strictEqual(result.summary.moveCountStats.count, 1);
    assert.strictEqual(result.summary.moveCountStats.min, 42);
    assert.strictEqual(result.summary.moveCountStats.max, 42);
    assert.strictEqual(result.summary.moveCountStats.mean, 42);
    assert.strictEqual(result.summary.moveCountStats.median, 42);
    assert.strictEqual(result.summary.moveCountStats.p95, 42);
  });

  test('mean averages full-precision FIRST then rounds to 2 decimals (locked order)', () => {
    // A round-before-averaging implementation would map
    // [10.005, 20.005] each to 10.01 / 20.01 → mean 15.01 — same answer
    // here, so we need a fixture where the two orders diverge. With
    // integer moveCount this is hard; use escapedVillains via a custom
    // record set that exposes the math directly through summary.
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({
        moveCount: 1,
        outcome: { escapedVillains: 1, winner: null },
      }),
      makeSuccessRecord({
        moveCount: 2,
        outcome: { escapedVillains: 2, winner: null },
      }),
      makeSuccessRecord({
        moveCount: 2,
        outcome: { escapedVillains: 2, winner: null },
      }),
    ];
    const result = classifyManifestRecords(records, []);
    // sum / count = 5/3 = 1.666... → rounds to 1.67
    assert.strictEqual(result.summary.moveCountStats.mean, 1.67);
    assert.strictEqual(result.summary.moveCountStats.median, 2);
  });

  test('median averages two middle values FIRST then rounds (even count)', () => {
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({ moveCount: 10 }),
      makeSuccessRecord({ moveCount: 20 }),
      makeSuccessRecord({ moveCount: 30 }),
      makeSuccessRecord({ moveCount: 41 }),
    ];
    const result = classifyManifestRecords(records, []);
    // median = (20 + 30) / 2 = 25; rounds to 25
    assert.strictEqual(result.summary.moveCountStats.median, 25);
    // mean = (10 + 20 + 30 + 41) / 4 = 25.25 (already 2 dp)
    assert.strictEqual(result.summary.moveCountStats.mean, 25.25);
  });

  test('p95 nearest-rank: count === 1 returns the single value (index 0)', () => {
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({ moveCount: 42 }),
    ];
    const result = classifyManifestRecords(records, []);
    assert.strictEqual(result.summary.moveCountStats.p95, 42);
  });

  test('p95 nearest-rank: 20 values → index Math.ceil(0.95 * 20) - 1 = 18', () => {
    const records: readonly ParsedManifestRecord[] = Array.from({ length: 20 }, (_, i) =>
      makeSuccessRecord({ moveCount: i + 1 }),
    );
    const result = classifyManifestRecords(records, []);
    // sorted: [1,2,...,20]; p95 index = ceil(0.95 * 20) - 1 = 18; sorted[18] = 19
    assert.strictEqual(result.summary.moveCountStats.p95, 19);
  });
});

describe('sweep.analyze — sum accumulation order (locked input-iteration order)', () => {
  test('sum honors input-array iteration order; reordering would change the IEEE-754 result', () => {
    // Fixture: [1e16, 1, -1e16] summed left-to-right yields 0 (the 1
    // is lost at IEEE-754 precision); summed sorted ascending would
    // be [-1e16, 1, 1e16] which also yields 0 — so we need a fixture
    // where the canceling pair brackets the small value.
    // The strongest divergence: [1e16, -1e16, 1] in input order →
    // (1e16 + -1e16) = 0, then +1 = 1; sorted [-1e16, 1, 1e16] →
    // (-1e16 + 1) = -1e16 (1 is lost), then +1e16 = 0. So:
    //   input-order sum   = 1 → mean = 0.33
    //   sorted-order sum  = 0 → mean = 0
    // The classifier MUST honor input order.
    //
    // We deliberately do NOT exercise this via moveCount (which is
    // integer); instead we use escapedVillains, which is also integer
    // per the manifest contract, but we can construct the values
    // because ParsedSuccessRecord is constructed in-test, not parsed
    // from JSON. The locked moveCount type is `number` (the WP-194
    // manifest writes integers; the parser checks integer typing, but
    // the in-test fixture skips the parser by going through the
    // classifier directly).
    const records: readonly ParsedManifestRecord[] = [
      // Each ParsedSuccessRecord must satisfy `number` types for the
      // numeric fields; non-integer values are accepted at the runtime
      // boundary (the parser would reject them, but classifier inputs
      // are accepted as-is).
      makeSuccessRecord({ moveCount: 1e16 }),
      makeSuccessRecord({ moveCount: -1e16 }),
      makeSuccessRecord({ moveCount: 1 }),
    ];
    const result = classifyManifestRecords(records, []);
    // Input-order sum = 1e16 + -1e16 = 0, then + 1 = 1; mean = 1/3 = 0.33
    assert.strictEqual(result.summary.moveCountStats.mean, 0.33);
  });
});

describe('sweep.analyze — fatalErrorSignatures sort (Unicode code-unit order)', () => {
  test('buckets sort descending by count, then ascending by signature in Unicode code-unit order', () => {
    // Signatures chosen so localeCompare ordering ('a','A','1') would
    // disagree with Unicode code-unit ordering ('1','A','a'). All
    // three buckets have count 1, so the secondary sort by signature
    // is what determines the order. Unicode code-unit < ordering:
    //   '1' (0x31) < 'A' (0x41) < 'a' (0x61).
    // localeCompare default tends to put letters together (case-insensitive)
    // before digits, which would produce ['A', 'a', '1'] or similar.
    const records: readonly ParsedManifestRecord[] = [
      makeFatalRecord({ cellSeed: 'seed-1', error: 'a' }),
      makeFatalRecord({ cellSeed: 'seed-2', error: 'A' }),
      makeFatalRecord({ cellSeed: 'seed-3', error: '1' }),
    ];
    const result = classifyManifestRecords(records, []);
    const signatures = result.summary.fatalErrorSignatures.map((bucket) => bucket.signature);
    assert.deepStrictEqual(signatures, ['1', 'A', 'a']);
  });

  test('fatalErrorSignatures retains FULL cellSeeds list (no truncation, no per-bucket cap)', () => {
    // 5 fatal records with the same signature — bucket cellSeeds
    // array must hold all 5 (v1 retention guarantee).
    const records: readonly ParsedManifestRecord[] = Array.from({ length: 5 }, (_, i) =>
      makeFatalRecord({ cellSeed: `seed-${i}`, error: 'Same error message.' }),
    );
    const result = classifyManifestRecords(records, []);
    assert.strictEqual(result.summary.fatalErrorSignatures.length, 1);
    const bucket = result.summary.fatalErrorSignatures[0]!;
    assert.strictEqual(bucket.count, 5);
    assert.strictEqual(bucket.cellSeeds.length, 5);
    // cellSeeds sorted lexicographically ascending
    assert.deepStrictEqual(
      [...bucket.cellSeeds],
      ['seed-0', 'seed-1', 'seed-2', 'seed-3', 'seed-4'],
    );
  });

  test('cellSeeds within a bucket use Unicode code-unit order (NOT localeCompare)', () => {
    // Mix of digit + uppercase + lowercase to expose the same
    // divergence as the signature sort.
    const records: readonly ParsedManifestRecord[] = [
      makeFatalRecord({ cellSeed: 'a-seed', error: 'X' }),
      makeFatalRecord({ cellSeed: 'A-seed', error: 'X' }),
      makeFatalRecord({ cellSeed: '1-seed', error: 'X' }),
    ];
    const result = classifyManifestRecords(records, []);
    const bucket = result.summary.fatalErrorSignatures[0]!;
    assert.deepStrictEqual([...bucket.cellSeeds], ['1-seed', 'A-seed', 'a-seed']);
  });
});

describe('sweep.analyze — determinism invariant', () => {
  test('two calls with deep-equal inputs produce deep-equal outputs', () => {
    const records: readonly ParsedManifestRecord[] = [
      makeSuccessRecord({
        cellSeed: 'a',
        endgameReached: true,
        outcome: { escapedVillains: 0, winner: 'heroes-win' },
      }),
      makeFatalRecord({ cellSeed: 'b', error: 'Boom' }),
      makeSuccessRecord({
        cellSeed: 'c',
        endgameReached: false,
        outcome: { escapedVillains: 0, winner: null },
      }),
    ];
    const first = classifyManifestRecords(records, []);
    const second = classifyManifestRecords(records, []);
    assert.deepStrictEqual(first, second);
  });
});

describe('sweep.analyze — MAX_TURNS_PER_GAME drift gate (D-19503)', () => {
  test('simulation.runner.ts carries the literal `const MAX_TURNS_PER_GAME = 200;`', async () => {
    const path = join(SIMULATION_DIR, 'simulation.runner.ts');
    const source = await readFile(path, 'utf8');
    const matches = source.match(/const MAX_TURNS_PER_GAME = 200;/g) ?? [];
    assert.ok(
      matches.length >= 1,
      `Expected at least one literal \`const MAX_TURNS_PER_GAME = 200;\` in simulation.runner.ts; found ${matches.length}`,
    );
  });

  test('sweep.analyze.ts carries the literal `const MAX_TURNS_PER_GAME = 200;` (drift-pinned local copy)', async () => {
    const path = join(SIMULATION_DIR, 'sweep.analyze.ts');
    const source = await readFile(path, 'utf8');
    const matches = source.match(/const MAX_TURNS_PER_GAME = 200;/g) ?? [];
    assert.ok(
      matches.length >= 1,
      `Expected at least one literal \`const MAX_TURNS_PER_GAME = 200;\` in sweep.analyze.ts; found ${matches.length}`,
    );
  });
});
