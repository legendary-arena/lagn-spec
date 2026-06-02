/**
 * Sweep manifest anomaly oracle (WP-195).
 *
 * Engine pure helper that classifies WP-194's setup-matrix sweep manifest
 * into a closed 4-class anomaly taxonomy and aggregates distribution
 * summaries. The companion operator CLI lives at
 * `scripts/analyze-sweep-manifest.mjs`; this module owns the parser, the
 * classifier, and the summary aggregator. The CLI owns I/O (file read,
 * stderr warnings, stdout report rendering) and never re-implements
 * classification logic.
 *
 * The analyzer is read-only over the manifest. It never re-dispatches
 * anomalous cells, never imports `boardgame.io`, never imports
 * `@legendary-arena/registry`, never calls `Math.random()`, `Date.now()`,
 * or any environment / wall-clock surface. The drift-gate test reads
 * source files from disk at test-time; that is the only filesystem
 * touchpoint in the WP-195 surface and it is test-environment-only.
 *
 * Anchor decisions:
 *   - D-19501 — engine pure helper + operator CLI split; the classifier
 *     lives in the engine package so it is reachable to alternate
 *     consumers (dashboard widgets, multi-manifest aggregators) without
 *     re-implementing the rules.
 *   - D-19502 — closed 4-class anomaly taxonomy; `'not-endgame'` merges
 *     cap-hit + stuck-game (the manifest cannot discriminate them);
 *     fatal `errorSignature` = first 80 UTF-16 code units verbatim.
 *   - D-19503 — `MAX_TURNS_PER_GAME` local copy with drift gate;
 *     `ESCAPE_LIMIT` imported (already a public export).
 *   - D-19501 — `parseManifestLine` exact-set validation on enumerable
 *     own-properties; plain-object precondition; no coercion.
 *
 * No boardgame.io imports. No `@legendary-arena/registry` imports. No
 * `Math.random()`. No IO. No wall-clock reads.
 */

import type { EndgameOutcome } from '../endgame/endgame.types.js';
import { ESCAPE_LIMIT } from '../endgame/endgame.types.js';
import type { SweepCellResult } from './sweep.runner.js';

// why (D-19503): `MAX_TURNS_PER_GAME` is file-private in
// `simulation.runner.ts` (line 54); `par.aggregator.ts:450` already
// carries a local copy of the same constant by the same precedent.
// Drift-pinned by a test that reads both source files at test-time
// and asserts the literal declaration appears in each (see the
// drift-gate suite in `sweep.analyze.test.ts`). Exporting the
// constant from `simulation.runner.ts` would add a public engine API
// surface for a value that is functionally a runtime constant; the
// local-copy + drift-gate pattern is the established engine-side
// discipline.
const MAX_TURNS_PER_GAME = 200;

/**
 * Closed-set anomaly taxonomy for a sweep manifest cell.
 *
 * The four classes are mutually exclusive and exhaustive over the
 * manifest's record space:
 *   - `'endgame-reached'` — success record with `endgameReached: true`
 *     AND `outcome.escapedVillains < ESCAPE_LIMIT`. The healthy
 *     baseline (engine reached a terminal state via `evaluateEndgame`).
 *   - `'not-endgame'` — success record with `endgameReached: false`.
 *     Covers both the cap-hit (loop exited via `MAX_TURNS_PER_GAME`)
 *     and the stuck-game (loop exited via the stuck-endTurn break)
 *     sub-cases; the manifest cannot discriminate them (per D-19502).
 *   - `'escaped-villain-cap'` — success record with `endgameReached:
 *     true` AND `outcome.escapedVillains >= ESCAPE_LIMIT` (i.e., the
 *     legitimate scheme-wins-via-escape path).
 *   - `'fatal'` — fatal record (`type === 'fatal'`) emitted by the
 *     sweep dispatcher's outer try/catch when the cell threw.
 */
export type SweepAnomalyClass =
  | 'endgame-reached'
  | 'not-endgame'
  | 'escaped-villain-cap'
  | 'fatal';

// why (D-19502): the four-class set is exhaustive and mutually
// exclusive over the manifest's record space — the manifest carries
// `endgameReached`, `outcome.escapedVillains`, and the fatal-vs-success
// discriminator, and those three signals collapse onto exactly four
// legal classifications. Drift-pinned to the `SweepAnomalyClass` union
// via the project's canonical-array drift pattern (a parallel readonly
// array that a typecheck-time assertion compares against the union's
// member set). Adding a fifth class requires a follow-up DECISIONS
// entry.
export const SWEEP_ANOMALY_CLASSES: readonly SweepAnomalyClass[] = [
  'endgame-reached',
  'not-endgame',
  'escaped-villain-cap',
  'fatal',
] as const;

/**
 * Parsed manifest success record.
 *
 * Mirrors the on-disk success-shape JSONL line (7 keys per D-19403)
 * plus a synthetic `type: 'success'` discriminator added by
 * `parseManifestLine` so downstream code branches on a single tag.
 * The nested `outcome` carries the exact `CapturedOutcomeSummary`
 * projection from WP-193 (2 keys: `escapedVillains`, `winner`).
 */
export interface ParsedSuccessRecord {
  readonly type: 'success';
  readonly cellIndex: number;
  readonly cellSeed: string;
  readonly endgameReached: boolean;
  readonly mastermindId: string;
  readonly moveCount: number;
  readonly outcome: {
    readonly escapedVillains: number;
    readonly winner: EndgameOutcome | null;
  };
  readonly schemeId: string;
}

/**
 * Parsed manifest fatal record.
 *
 * Mirrors the closed 5-key fatal-shape JSONL line (per D-19403). The
 * `type: 'fatal'` literal is the on-disk discriminator; the parser
 * carries it through verbatim (it is NOT synthetic for fatal records).
 */
export interface ParsedFatalRecord {
  readonly type: 'fatal';
  readonly cellSeed: string;
  readonly error: string;
  readonly mastermindId: string;
  readonly schemeId: string;
}

/**
 * Discriminated union of parseable manifest records.
 *
 * Every successfully parsed line is either a success record or a fatal
 * record. Malformed lines produce no `ParsedManifestRecord` — they are
 * tracked separately in `MalformedLine[]` by the CLI script.
 */
export type ParsedManifestRecord = ParsedSuccessRecord | ParsedFatalRecord;

/**
 * Result of classifying a single parsed manifest record.
 *
 * Carries the cell's identity (`schemeId`, `mastermindId`, `cellSeed`),
 * the assigned anomaly class, and the discrimination signals an
 * operator needs to distinguish sub-cases within a class. Fields that
 * do not apply to the record's shape are `null`:
 *   - `moveCount` / `winner` / `escapedVillains` are `null` for fatal
 *     records (the manifest's fatal shape carries none of those
 *     fields).
 *   - `errorSignature` is `null` for non-fatal records and the
 *     deterministic 80-UTF-16-code-unit prefix of the fatal record's
 *     `error` field for fatal records.
 */
export interface ClassifiedCell {
  readonly schemeId: string;
  readonly mastermindId: string;
  readonly cellSeed: string;
  readonly anomalyClass: SweepAnomalyClass;
  readonly moveCount: number | null;
  readonly winner: EndgameOutcome | null;
  readonly escapedVillains: number | null;
  readonly errorSignature: string | null;
}

/**
 * Numeric distribution stats over a single integer column of the
 * manifest (`moveCount` or `outcome.escapedVillains`).
 *
 * `count === 0` → all five other fields are `null`. `count === 1` →
 * `min === max === mean === median === p95 === <the single value>`
 * (with `mean` and `median` rounded to 2 decimal places).
 *
 * Sum accumulation honors the input array's iteration order verbatim
 * — no reordering before summation, no Kahan-style precision
 * compensation. Raw IEEE-754 `sum / count` is the locked contract so
 * cross-implementation ports (Python, Go, etc.) reproduce the same
 * byte-stable output.
 */
export interface NumericDistributionStats {
  readonly count: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
  readonly median: number | null;
  readonly p95: number | null;
}

/**
 * One bucket of the `fatalErrorSignatures` aggregate.
 *
 * Buckets are sorted descending by `count` then ascending by
 * `signature`. Each bucket's `cellSeeds` is the FULL list (no
 * truncation, no per-bucket cap — v1 retention guarantee). The
 * markdown renderer shows up to the first 3 sorted seeds as a
 * preview; the JSON renderer carries the full list.
 */
export interface FatalErrorBucket {
  readonly signature: string;
  readonly count: number;
  readonly cellSeeds: readonly string[];
}

/**
 * One entry in the `malformedLines` aggregate.
 *
 * Carries the 1-based line number and a full-sentence reason naming
 * what the parser rejected. The CLI script assembles this array as it
 * walks the manifest file top-to-bottom; the engine module receives
 * the assembled array via `classifyManifestRecords` and surfaces it in
 * `ManifestClassification` for the renderer.
 */
export interface MalformedLine {
  readonly lineNumber: number;
  readonly reason: string;
}

/**
 * Manifest-level summary aggregate.
 *
 * `totalCells` counts ONLY successfully parsed records (malformed
 * lines are excluded and surfaced separately). The cell-count
 * invariant holds for every input:
 *   `totalCells === records.length` AND
 *   `sum(anomalyCounts) === totalCells` AND
 *   `sum(winnerCounts) === totalCells`.
 *
 * Fatal records contribute to `winnerCounts.null` (they have no
 * `outcome.winner`); success records with `outcome.winner === null`
 * also contribute to the same bucket.
 */
export interface ManifestSummary {
  readonly totalCells: number;
  readonly anomalyCounts: Readonly<Record<SweepAnomalyClass, number>>;
  readonly winnerCounts: {
    readonly 'heroes-win': number;
    readonly 'scheme-wins': number;
    readonly null: number;
  };
  readonly moveCountStats: NumericDistributionStats;
  readonly escapedVillainStats: NumericDistributionStats;
  readonly fatalErrorSignatures: readonly FatalErrorBucket[];
}

/**
 * Full output of `classifyManifestRecords`.
 *
 * `cells` preserves parsed-input order; `malformedLines` preserves the
 * script's emission order (ascending `lineNumber`). `summary` is the
 * aggregate the renderer consumes for the markdown and JSON reports.
 */
export interface ManifestClassification {
  readonly cells: readonly ClassifiedCell[];
  readonly summary: ManifestSummary;
  readonly malformedLines: readonly MalformedLine[];
}

/**
 * Result of `parseManifestLine`.
 *
 * Exactly one of the two fields is non-null. `record !== null` means
 * the line was a valid success-shape or fatal-shape JSON; `record ===
 * null` means the line was malformed and `malformedReason` carries a
 * full-sentence explanation suitable for stderr emission.
 */
export interface ParseRecordResult {
  readonly record: ParsedManifestRecord | null;
  readonly malformedReason: string | null;
}

/**
 * Canonical set of keys a success record MUST carry (exact-set
 * validation per D-19501). Used by `parseManifestLine`'s post-parse
 * shape check; order is not significant.
 */
const SUCCESS_RECORD_KEYS: readonly string[] = [
  'cellIndex',
  'cellSeed',
  'endgameReached',
  'mastermindId',
  'moveCount',
  'outcome',
  'schemeId',
];

/**
 * Canonical set of keys a fatal record MUST carry (exact-set
 * validation per D-19501).
 */
const FATAL_RECORD_KEYS: readonly string[] = [
  'cellSeed',
  'error',
  'mastermindId',
  'schemeId',
  'type',
];

/**
 * Canonical set of keys the nested `outcome` object on a success
 * record MUST carry (exact-set validation per D-19501).
 */
const OUTCOME_KEYS: readonly string[] = ['escapedVillains', 'winner'];

/**
 * Returns true when the input is a plain object (per D-19501's
 * plain-object precondition).
 *
 * Plain-object predicate:
 *   `typeof value === 'object' && value !== null &&
 *    Array.isArray(value) === false &&
 *    Object.getPrototypeOf(value) === Object.prototype`
 *
 * Arrays, `null`, primitives, and objects with non-`Object.prototype`
 * prototypes (including prototype-pollution variants and instances of
 * user-defined classes) are rejected. Used as the FIRST shape check
 * inside `parseManifestLine`, BEFORE the canonical-key check, so the
 * downstream error message names "input is not a plain object" rather
 * than "missing key cellIndex" (which would be misleading for an
 * array whose stringified keys happen to be `'0'`, `'1'`, `'2'`).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Returns true when `actualKeys` is exactly equal as a set to
 * `expectedKeys` (regardless of order). Used by the exact-set
 * validation step inside `parseManifestLine`.
 */
function hasExactKeySet(
  actualKeys: readonly string[],
  expectedKeys: readonly string[],
): boolean {
  if (actualKeys.length !== expectedKeys.length) {
    return false;
  }
  const expectedSet = new Set(expectedKeys);
  for (const key of actualKeys) {
    if (!expectedSet.has(key)) {
      return false;
    }
  }
  return true;
}

/**
 * Validates a parsed `outcome` value against the nested 2-key
 * contract. Returns `null` on success or a full-sentence reason on
 * any violation.
 */
function validateOutcomeShape(outcomeValue: unknown): string | null {
  if (!isPlainObject(outcomeValue)) {
    return 'Manifest success record carries a non-plain-object `outcome` field; expected an object with exactly the keys `escapedVillains` and `winner`.';
  }
  const outcomeKeys = Object.keys(outcomeValue);
  if (!hasExactKeySet(outcomeKeys, OUTCOME_KEYS)) {
    return `Manifest success record nested \`outcome\` object has key set ${JSON.stringify(outcomeKeys.sort())}; expected exactly the keys \`escapedVillains\` and \`winner\`.`;
  }
  const escapedVillains = outcomeValue['escapedVillains'];
  if (typeof escapedVillains !== 'number' || !Number.isFinite(escapedVillains)) {
    return 'Manifest success record `outcome.escapedVillains` is not a finite number; expected an integer count of escaped villains.';
  }
  const winner = outcomeValue['winner'];
  if (winner !== null && winner !== 'heroes-win' && winner !== 'scheme-wins') {
    return `Manifest success record \`outcome.winner\` is ${JSON.stringify(winner)}; expected one of \`'heroes-win'\`, \`'scheme-wins'\`, or \`null\`.`;
  }
  return null;
}

/**
 * Validates a parsed success record's top-level fields (assumes the
 * key set has already been confirmed exact). Returns `null` on
 * success or a full-sentence reason on any type violation.
 */
function validateSuccessFields(value: Record<string, unknown>): string | null {
  if (typeof value['cellIndex'] !== 'number' || !Number.isInteger(value['cellIndex'])) {
    return 'Manifest success record `cellIndex` is not an integer; expected the 0-based enumeration index from the sweep dispatcher.';
  }
  if (typeof value['cellSeed'] !== 'string' || value['cellSeed'].length === 0) {
    return 'Manifest success record `cellSeed` is not a non-empty string; expected the per-cell seed produced by the sweep dispatcher.';
  }
  if (typeof value['endgameReached'] !== 'boolean') {
    return 'Manifest success record `endgameReached` is not a boolean; expected `true` for engine-reached endgame, `false` for cap-hit or stuck-game.';
  }
  if (typeof value['mastermindId'] !== 'string' || value['mastermindId'].length === 0) {
    return 'Manifest success record `mastermindId` is not a non-empty string; expected the mastermind ext_id from the sweep axis.';
  }
  if (typeof value['moveCount'] !== 'number' || !Number.isInteger(value['moveCount'])) {
    return 'Manifest success record `moveCount` is not an integer; expected the count of moves dispatched during the captured game.';
  }
  if (typeof value['schemeId'] !== 'string' || value['schemeId'].length === 0) {
    return 'Manifest success record `schemeId` is not a non-empty string; expected the scheme ext_id from the sweep axis.';
  }
  return validateOutcomeShape(value['outcome']);
}

/**
 * Validates a parsed fatal record's fields (assumes the key set has
 * already been confirmed exact). Returns `null` on success or a
 * full-sentence reason on any type violation.
 */
function validateFatalFields(value: Record<string, unknown>): string | null {
  if (typeof value['cellSeed'] !== 'string' || value['cellSeed'].length === 0) {
    return 'Manifest fatal record `cellSeed` is not a non-empty string; expected the per-cell seed of the throwing cell.';
  }
  if (typeof value['error'] !== 'string') {
    return 'Manifest fatal record `error` is not a string; expected the full-sentence error message captured by the sweep dispatcher.';
  }
  if (typeof value['mastermindId'] !== 'string' || value['mastermindId'].length === 0) {
    return 'Manifest fatal record `mastermindId` is not a non-empty string; expected the mastermind ext_id of the throwing cell.';
  }
  if (typeof value['schemeId'] !== 'string' || value['schemeId'].length === 0) {
    return 'Manifest fatal record `schemeId` is not a non-empty string; expected the scheme ext_id of the throwing cell.';
  }
  if (value['type'] !== 'fatal') {
    return `Manifest fatal record \`type\` is ${JSON.stringify(value['type'])}; expected the literal string \`'fatal'\`.`;
  }
  return null;
}

/**
 * Parses one JSONL manifest line into a `ParsedManifestRecord` or a
 * malformed reason.
 *
 * Returns `{ record: <parsed>, malformedReason: null }` on a valid
 * success-shape or fatal-shape JSON; returns `{ record: null,
 * malformedReason: <full-sentence> }` on any failure. The function is
 * pure, deterministic, and never throws — failures collapse into the
 * `malformedReason` field. The CLI script is responsible for reading
 * the file line by line and assembling the `MalformedLine[]` array;
 * this function classifies one line at a time.
 *
 * Shape-check order (per D-19501):
 *   1. JSON parse via `JSON.parse`. Failure → malformed.
 *   2. Plain-object predicate. Arrays / `null` / primitives /
 *      non-`Object.prototype` objects → malformed.
 *   3. Exact-set canonical-key check (success or fatal).
 *   4. Per-field type check (success: 6 top-level + nested `outcome`;
 *      fatal: 5 fields with `type === 'fatal'`).
 *
 * The parser does NOT coerce, repair, or tolerate. Extra keys,
 * missing keys, wrong-typed fields, arrays, `null`, primitives, and
 * non-`Object.prototype` objects all yield `malformedReason`.
 *
 * @param jsonText - One manifest line (no trailing newline expected).
 * @returns `ParseRecordResult` with exactly one non-null field.
 */
// why (D-19501): the parser enforces an exact-set canonical-key check
// on enumerable own-properties — extra keys, missing keys, wrong-typed
// fields, and non-canonical `type` values all yield `malformedReason`.
// The contract is closed: no coercion, no repair, no tolerance. The
// plain-object precondition runs FIRST so the rejection reason names
// "non-plain-object" rather than "missing key" for arrays / primitives.
export function parseManifestLine(jsonText: string): ParseRecordResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (caughtError) {
    const errorMessage =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    return {
      record: null,
      malformedReason: `Manifest line is not valid JSON (${errorMessage}); expected one canonical-JSON success or fatal record per line.`,
    };
  }
  if (!isPlainObject(parsed)) {
    const valueDescription = Array.isArray(parsed)
      ? 'a JSON array'
      : parsed === null
        ? 'the JSON literal `null`'
        : `a JSON ${typeof parsed} value`;
    return {
      record: null,
      malformedReason: `Manifest line parsed to ${valueDescription}; expected a plain object with either the 7 canonical success-record keys or the 5 canonical fatal-record keys.`,
    };
  }
  const ownKeys = Object.keys(parsed);
  if (hasExactKeySet(ownKeys, FATAL_RECORD_KEYS)) {
    const fatalReason = validateFatalFields(parsed);
    if (fatalReason !== null) {
      return { record: null, malformedReason: fatalReason };
    }
    const fatalRecord: ParsedFatalRecord = {
      type: 'fatal',
      cellSeed: parsed['cellSeed'] as string,
      error: parsed['error'] as string,
      mastermindId: parsed['mastermindId'] as string,
      schemeId: parsed['schemeId'] as string,
    };
    return { record: fatalRecord, malformedReason: null };
  }
  if (hasExactKeySet(ownKeys, SUCCESS_RECORD_KEYS)) {
    const successReason = validateSuccessFields(parsed);
    if (successReason !== null) {
      return { record: null, malformedReason: successReason };
    }
    const outcomeValue = parsed['outcome'] as Record<string, unknown>;
    const successRecord: ParsedSuccessRecord = {
      type: 'success',
      cellIndex: parsed['cellIndex'] as number,
      cellSeed: parsed['cellSeed'] as string,
      endgameReached: parsed['endgameReached'] as boolean,
      mastermindId: parsed['mastermindId'] as string,
      moveCount: parsed['moveCount'] as number,
      outcome: {
        escapedVillains: outcomeValue['escapedVillains'] as number,
        winner: outcomeValue['winner'] as EndgameOutcome | null,
      },
      schemeId: parsed['schemeId'] as string,
    };
    return { record: successRecord, malformedReason: null };
  }
  return {
    record: null,
    malformedReason: `Manifest line has key set ${JSON.stringify(ownKeys.sort())}; expected exactly the 7 success-record keys (cellIndex, cellSeed, endgameReached, mastermindId, moveCount, outcome, schemeId) or the 5 fatal-record keys (cellSeed, error, mastermindId, schemeId, type).`,
  };
}

/**
 * Classifies one parsed manifest record into a `ClassifiedCell`.
 *
 * Decision logic (per the locked classification rules in WP-195 §B):
 *   1. Fatal record → `'fatal'`.
 *   2. Success record with `endgameReached === false` → `'not-endgame'`.
 *   3. Success record with `endgameReached === true` AND
 *      `outcome.escapedVillains >= ESCAPE_LIMIT` → `'escaped-villain-cap'`.
 *   4. Success record with `endgameReached === true` AND
 *      `outcome.escapedVillains < ESCAPE_LIMIT` → `'endgame-reached'`.
 *
 * The four branches are decided in this order; the FIRST matching
 * branch wins.
 *
 * @param record - One parsed manifest record.
 * @returns `ClassifiedCell` with the assigned anomaly class and the
 *   per-shape discrimination signals.
 */
// why (D-19502): `'not-endgame'` merges cap-hit + stuck-game. The
// manifest does not carry `turnsElapsed` (WP-194 emits seven success
// keys; `turnsElapsed` is not among them), so the analyzer cannot
// discriminate cap-hit (loop exited via MAX_TURNS_PER_GAME = 200) from
// stuck-game (loop exited via the stuck-endTurn break) at this layer.
// Operators discriminate via the `moveCount` distribution slice: a
// stuck game typically has fewer moves than a cap-hit game.
//
// why (D-19502): fatal `errorSignature` = first 80 UTF-16 code units of
// the `error` field VERBATIM. No trimming, no whitespace
// normalization, no newline stripping, no case folding, no hashing.
// Any normalization is a divergence vector across implementations.
// `String.prototype.slice(0, 80)` counts UTF-16 code units; a
// surrogate pair straddling the 80th boundary is sliced at the
// boundary (the error field is ASCII in practice).
export function classifyCell(record: ParsedManifestRecord): ClassifiedCell {
  if (record.type === 'fatal') {
    return {
      schemeId: record.schemeId,
      mastermindId: record.mastermindId,
      cellSeed: record.cellSeed,
      anomalyClass: 'fatal',
      moveCount: null,
      winner: null,
      escapedVillains: null,
      errorSignature: record.error.slice(0, 80),
    };
  }
  if (record.endgameReached === false) {
    return {
      schemeId: record.schemeId,
      mastermindId: record.mastermindId,
      cellSeed: record.cellSeed,
      anomalyClass: 'not-endgame',
      moveCount: record.moveCount,
      winner: record.outcome.winner,
      escapedVillains: record.outcome.escapedVillains,
      errorSignature: null,
    };
  }
  if (record.outcome.escapedVillains >= ESCAPE_LIMIT) {
    return {
      schemeId: record.schemeId,
      mastermindId: record.mastermindId,
      cellSeed: record.cellSeed,
      anomalyClass: 'escaped-villain-cap',
      moveCount: record.moveCount,
      winner: record.outcome.winner,
      escapedVillains: record.outcome.escapedVillains,
      errorSignature: null,
    };
  }
  return {
    schemeId: record.schemeId,
    mastermindId: record.mastermindId,
    cellSeed: record.cellSeed,
    anomalyClass: 'endgame-reached',
    moveCount: record.moveCount,
    winner: record.outcome.winner,
    escapedVillains: record.outcome.escapedVillains,
    errorSignature: null,
  };
}

/**
 * Rounds a finite number to 2 decimal places using
 * `Math.round(value * 100) / 100`. Used by the `mean` and `median`
 * accessors AFTER full-precision arithmetic; never used to round the
 * inputs before averaging.
 */
function roundTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes a `NumericDistributionStats` over the input values.
 *
 * Sum accumulation honors the input array's iteration order verbatim;
 * the sorted copy is used ONLY for `min`, `max`, `median`, and `p95`,
 * NOT for the sum. The `mean` and `median` calculations average to
 * full precision FIRST, THEN round to 2 decimal places. `p95` uses
 * the nearest-rank method with index `Math.ceil(0.95 * count) - 1`.
 *
 * @param values - Integer values (the input is not mutated).
 * @returns `NumericDistributionStats` per the locked math.
 */
// why (locked by EC-222 §Locked Values): `mean` and `median` average
// to full precision FIRST, then round via
// `Math.round(value * 100) / 100`. Rounding before averaging is
// forbidden — it produces off-by-cent drift vs the test fixture
// (e.g., `[10.005, 20.005]` averaged first then rounded yields 15.01;
// rounding each value to 2 dp first then averaging yields 15.00).
//
// why (locked by EC-222 §Locked Values): `p95` uses nearest-rank with
// index `Math.ceil(0.95 * count) - 1`. The `count === 1` case is
// explicit: `Math.ceil(0.95 * 1) - 1 === 0`, so `p95` equals the
// single value (NOT `null` or off-by-one). The `count === 0` case
// returns `null` per the empty-distribution contract.
function computeDistribution(values: readonly number[]): NumericDistributionStats {
  if (values.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p95: null,
    };
  }
  // Sum accumulation honors input-array iteration order. No reordering,
  // no Kahan summation; raw IEEE-754 `sum / count` is the locked
  // contract for cross-implementation reproducibility.
  let sum = 0;
  for (const value of values) {
    sum = sum + value;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const lastIndex = sorted.length - 1;
  const minValue = sorted[0]!;
  const maxValue = sorted[lastIndex]!;
  const meanValue = roundTwoDecimals(sum / values.length);
  let medianValue: number;
  if (sorted.length % 2 === 1) {
    medianValue = sorted[(sorted.length - 1) / 2]!;
  } else {
    const upper = sorted[sorted.length / 2]!;
    const lower = sorted[sorted.length / 2 - 1]!;
    medianValue = roundTwoDecimals((upper + lower) / 2);
  }
  const p95Index = Math.ceil(0.95 * sorted.length) - 1;
  const p95Value = sorted[p95Index]!;
  return {
    count: values.length,
    min: minValue,
    max: maxValue,
    mean: meanValue,
    median: medianValue,
    p95: p95Value,
  };
}

/**
 * Aggregates `fatalErrorSignatures` from the classified-cell list.
 *
 * Iterates classified cells in input order; for each fatal cell,
 * inserts into a `Map<signature, cellSeed[]>` that preserves insertion
 * order. After the walk completes, sorts buckets descending by `count`
 * then ascending by `signature` (Unicode code-unit order), and sorts
 * each bucket's `cellSeeds` ascending lexicographically.
 *
 * Retention is FULL — each bucket holds every matching `cellSeed`. The
 * markdown renderer shows up to 3 sorted seeds as a preview; the JSON
 * renderer carries the full list.
 */
function aggregateFatalSignatures(
  classifiedCells: readonly ClassifiedCell[],
): readonly FatalErrorBucket[] {
  const signatureToSeeds = new Map<string, string[]>();
  for (const cell of classifiedCells) {
    if (cell.anomalyClass !== 'fatal' || cell.errorSignature === null) {
      continue;
    }
    const existing = signatureToSeeds.get(cell.errorSignature);
    if (existing === undefined) {
      signatureToSeeds.set(cell.errorSignature, [cell.cellSeed]);
    } else {
      existing.push(cell.cellSeed);
    }
  }
  const buckets: FatalErrorBucket[] = [];
  for (const [signature, cellSeeds] of signatureToSeeds.entries()) {
    const sortedSeeds = [...cellSeeds].sort();
    buckets.push({
      signature,
      count: cellSeeds.length,
      cellSeeds: sortedSeeds,
    });
  }
  buckets.sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    if (a.signature < b.signature) {
      return -1;
    }
    if (a.signature > b.signature) {
      return 1;
    }
    return 0;
  });
  return buckets;
}

/**
 * Classifies a whole manifest's parsed records into the full
 * `ManifestClassification`.
 *
 * The function is deterministic: two invocations with deep-equal
 * inputs produce deep-equal outputs (including the order of
 * `fatalErrorSignatures` and the order of `cellSeeds` within each
 * bucket). The cell-count invariant is enforced by construction —
 * `totalCells` is `records.length` and every record contributes
 * exactly one count to `anomalyCounts` and exactly one count to
 * `winnerCounts`.
 *
 * @param records - Parsed manifest records (success + fatal).
 * @param malformedLines - Malformed lines assembled by the CLI script
 *   from its line-number tracking.
 * @returns `ManifestClassification` with cells, summary, and the
 *   malformed-lines passthrough.
 */
// why: `classifyManifestRecords` enforces the cell-count invariant
// `sum(anomalyCounts) === totalCells === sum(winnerCounts)` by
// construction. Every record contributes exactly one increment to
// `anomalyCounts` (the FIRST matching branch in `classifyCell`) and
// exactly one increment to `winnerCounts` (fatal records and success
// records with `outcome.winner === null` both land in the `null`
// bucket). `totalCells` is `records.length` — malformed lines are
// EXCLUDED from `totalCells` and tracked separately in the
// `malformedLines` passthrough.
export function classifyManifestRecords(
  records: readonly ParsedManifestRecord[],
  malformedLines: readonly MalformedLine[],
): ManifestClassification {
  const classifiedCells: ClassifiedCell[] = [];
  const anomalyCounts: Record<SweepAnomalyClass, number> = {
    'endgame-reached': 0,
    'not-endgame': 0,
    'escaped-villain-cap': 0,
    fatal: 0,
  };
  const winnerCounts = {
    'heroes-win': 0,
    'scheme-wins': 0,
    null: 0,
  };
  const moveCountValues: number[] = [];
  const escapedVillainValues: number[] = [];
  for (const record of records) {
    const classified = classifyCell(record);
    classifiedCells.push(classified);
    anomalyCounts[classified.anomalyClass] = anomalyCounts[classified.anomalyClass] + 1;
    if (record.type === 'fatal') {
      winnerCounts.null = winnerCounts.null + 1;
      continue;
    }
    if (record.outcome.winner === 'heroes-win') {
      winnerCounts['heroes-win'] = winnerCounts['heroes-win'] + 1;
    } else if (record.outcome.winner === 'scheme-wins') {
      winnerCounts['scheme-wins'] = winnerCounts['scheme-wins'] + 1;
    } else {
      winnerCounts.null = winnerCounts.null + 1;
    }
    moveCountValues.push(record.moveCount);
    escapedVillainValues.push(record.outcome.escapedVillains);
  }
  const summary: ManifestSummary = {
    totalCells: records.length,
    anomalyCounts,
    winnerCounts,
    moveCountStats: computeDistribution(moveCountValues),
    escapedVillainStats: computeDistribution(escapedVillainValues),
    fatalErrorSignatures: aggregateFatalSignatures(classifiedCells),
  };
  return {
    cells: classifiedCells,
    summary,
    malformedLines,
  };
}

// Drift-gate exports — the local `MAX_TURNS_PER_GAME` constant is
// surfaced ONLY through the source-reading test, NOT via a runtime
// export. The constant itself is intentionally unexported so the
// export list matches the locked 15 symbols exactly. The drift-gate
// test reads this file's source from disk and asserts the literal
// declaration appears; if the engine value at
// `simulation.runner.ts:54` ever changes, the test fires loudly and
// forces both copies to update in the same commit.
//
// The `MAX_TURNS_PER_GAME` constant is referenced in a no-op
// expression below so TypeScript's "unused local" check does not flag
// it. The expression has no runtime effect.
void MAX_TURNS_PER_GAME;

// The `SweepCellResult` type import is retained for documentation
// purposes — the analyzer's `ParsedSuccessRecord` field set mirrors
// `SweepCellResult` 1:1 (modulo the synthetic `type: 'success'`
// discriminator added at parse time). The type is not used at runtime
// in this module; the import is kept so a future maintainer adding a
// field to `SweepCellResult` reads this file and updates the parser
// in lockstep. The `void` reference below prevents the
// "unused import" warning under strict TypeScript settings.
type _SweepCellResultReference = SweepCellResult;
const _sweepCellResultReference: _SweepCellResultReference | undefined = undefined;
void _sweepCellResultReference;
