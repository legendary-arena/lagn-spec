/**
 * Setup-matrix sweep runner for the Legendary Arena balance simulation
 * framework (WP-194).
 *
 * `cartesianProduct` is a generic N-axis cross-product enumerator that yields
 * tuples in lexicographic order over the input axes. `sweepSetupMatrix` wraps
 * it for the Scheme × Mastermind sweep MVP: it lex-sorts both axes (stable
 * copy; input arrays are not mutated), enumerates the cross-product, derives
 * a per-cell seed via the locked `${runSeed}::cell:${schemeId}:${mastermindId}`
 * convention, calls `simulateOneGameAndCaptureMoves` (WP-193) per cell, and
 * invokes the operator-supplied callback with a `SweepCellResult` projection.
 *
 * The dispatcher is the single cross-product enumeration path in the codebase.
 * The CLI script (`scripts/sweep-setup-matrix.mjs`) consumes this dispatcher
 * directly and does NOT inline a second cross-product loop.
 *
 * Anchor decisions:
 *   - D-19401 — Sweep dimensions for the MVP are schemeId × mastermindId;
 *     the helper is N-axis-generic so future axes extend the input array
 *     instead of rewriting the enumeration engine. Iteration is lex-sorted
 *     ascending (outer = schemeId, inner = mastermindId); the dispatcher
 *     does the sort itself.
 *   - D-19402 — Per-cell seed convention is
 *     `${runSeed}::cell:${schemeId}:${mastermindId}` with the literal
 *     separator `::cell:` carried verbatim as `CELL_SEED_SEPARATOR`. The
 *     intra-cell-coordinate `:` between schemeId and mastermindId is NOT
 *     the `::cell:` separator.
 *   - D-19303 (preserved from WP-193) — Per-seat seeds nest on top of the
 *     cell seed via `${cellSeed}::seat:${seatIndex}`. The two-domain PRNG
 *     invariant from D-3604 (policy PRNG vs run-level shuffle PRNG) holds
 *     at every level of the nesting.
 *
 * No boardgame.io imports. No `@legendary-arena/registry` imports. No
 * `Math.random()`. No IO. No wall-clock reads.
 */

import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { AIPolicy } from './ai.types.js';
import type { CapturedOutcomeSummary } from './simulation.runner.js';
// why (WP-263 / D-24039): reuse the WP-257 hollow-effect record type for the
// per-cell diagnostics pass-through — never a parallel shape.
import type { HollowEffectRecord } from '../diagnostics/hollowEffect.types.js';

import { simulateOneGameAndCaptureMoves } from './simulation.runner.js';

// why (D-19402): the literal cell-seed separator `::cell:` is carried verbatim
// in this constant and concatenated into the cell seed by the dispatcher. The
// CLI script imports `CELL_SEED_SEPARATOR` rather than echoing the literal so
// the grep-gated drift check passes (the literal lives in this file only).
// Nesting on top of WP-193's `::seat:` per D-19303 preserves the D-3604
// two-domain PRNG invariant.
export const CELL_SEED_SEPARATOR = '::cell:' as const;

/**
 * Per-cell result emitted by the sweep dispatcher.
 *
 * Carries the seven canonical fields that map directly onto the JSONL
 * manifest record shape (success records). The manifest serialiser produces
 * canonical JSON with lexicographically sorted keys; this interface's TS
 * field order does NOT need to match the JSON key order. `outcome` carries
 * the narrower `CapturedOutcomeSummary` projection from WP-193 verbatim.
 *
 * `moveCount` is the length of the captured `ReplayMove[]` returned by
 * `simulateOneGameAndCaptureMoves`. `endgameReached` is the WP-193 signal
 * indicating whether the per-turn loop exited via `evaluateEndgame`
 * returning non-null (true) vs the safety cap / stuck-game break (false).
 */
// why: `cellIndex` is the per-run enumeration index over the lex-sorted
// cross-product. It is informational only — NOT stable across axis-file
// changes (adding a new schemeId that lex-sorts earlier shifts every
// subsequent cellIndex). The identity key for resume + dedup is the
// `(schemeId, mastermindId)` pair, NOT `cellIndex`.
export interface SweepCellResult {
  readonly cellIndex: number;
  readonly schemeId: string;
  readonly mastermindId: string;
  readonly cellSeed: string;
  readonly outcome: CapturedOutcomeSummary;
  readonly endgameReached: boolean;
  readonly moveCount: number;
  // why (WP-263 / D-24039): per-cell pass-through of the finished game's
  // runtime-only hollow-effect diagnostics (WP-257 / D-24034), sibling to
  // `outcome` — the WP-259 runtime-observed coverage harness reads these off
  // each cell's callback. Carried verbatim from the cell's CapturedGameResult;
  // the engine emits, the projection only carries (never persisted, never
  // gameplay input).
  readonly hollowEffects: readonly HollowEffectRecord[];
  readonly hollowEffectsDropped: number;
}

/**
 * Recursive helper for the N-axis cartesian product enumeration.
 *
 * Walks each axis in order, prepending the chosen value to a growing prefix.
 * When the prefix reaches the full axis count, yields the assembled tuple.
 * Empty axes terminate the branch (the `for` loop body never executes), so
 * any one empty axis collapses the entire cross product to zero tuples.
 * Zero axes (`axes.length === 0`) hits the base case immediately with an
 * empty prefix — yielding exactly one empty tuple (the cross-product
 * identity element).
 *
 * @param axes - The full axes list (passed through verbatim each recursion).
 * @param axisIndex - Current depth into the axes list.
 * @param prefix - The tuple built so far across prior axes.
 */
function* enumerateCartesian<T>(
  axes: readonly (readonly T[])[],
  axisIndex: number,
  prefix: readonly T[],
): Generator<readonly T[]> {
  if (axisIndex === axes.length) {
    yield prefix;
    return;
  }
  for (const item of axes[axisIndex]!) {
    yield* enumerateCartesian(axes, axisIndex + 1, [...prefix, item]);
  }
}

/**
 * N-axis cartesian product enumerator.
 *
 * Yields one tuple per cross-product combination in lexicographic order over
 * the input axes (outer axis varies slowest, rightmost axis varies fastest).
 * The generator is generic on `T` — future WPs may extend the dispatcher with
 * a richer per-axis shape (structured value types instead of bare strings)
 * by passing an `axes` whose items carry that shape; this helper does not
 * need to change.
 *
 * Edge cases:
 *   - Zero axes (`axes.length === 0`) → yields exactly one empty tuple.
 *   - Any axis with zero items → yields zero tuples (the cross product is
 *     empty as soon as one factor is empty).
 *
 * @param axes - Read-only array of read-only per-axis arrays.
 * @returns Generator yielding read-only tuples in lex order.
 */
// why (D-19401): the helper is N-axis-generic so future WPs add an axis by
// extending the `axes` argument rather than editing the enumeration core.
// Special-casing two-axis input here would force a rewrite the first time a
// third axis (e.g., villainGroupIds or playerCount) lands; keeping the
// recursion length-driven keeps the core untouched.
export function* cartesianProduct<T>(
  axes: readonly (readonly T[])[],
): Generator<readonly T[]> {
  yield* enumerateCartesian(axes, 0, []);
}

/**
 * Returns a stable-copy, lex-sorted ascending version of the input array.
 *
 * `Array.prototype.sort` is stable in Node v22+ (V8 uses TimSort) so two
 * equal keys retain their relative input order. The caller's array is
 * spread into a fresh array first so the dispatcher never mutates the
 * operator's axis files.
 *
 * @param axis - The input axis (not mutated).
 * @returns A new array with the same values in lex-ascending order.
 */
function lexSortedCopy(axis: readonly string[]): string[] {
  const copy = [...axis];
  copy.sort();
  return copy;
}

/**
 * Sweep dispatcher: enumerates the Scheme × Mastermind cross-product over a
 * base setup envelope and invokes `onCellComplete` with a `SweepCellResult`
 * for each dispatched cell.
 *
 * The dispatcher:
 *   1. Stable-copies + lex-sorts both axes (caller's arrays not mutated).
 *   2. Enumerates the cross-product via `cartesianProduct` in lex order
 *      (outer = schemeId, inner = mastermindId).
 *   3. For each cell, computes `cellSeed` via the locked convention and
 *      calls `shouldSkipCell` — skipped cells advance `cellIndex` but do
 *      NOT invoke `onCellComplete`.
 *   4. For each non-skipped cell, builds a per-cell `MatchSetupConfig`
 *      (clone of `baseSetupConfig` with `schemeId` + `mastermindId`
 *      substituted), asks `buildPolicies(cellSeed, playerCount)` for the
 *      per-seat policy list, calls `simulateOneGameAndCaptureMoves`, and
 *      projects the result into a `SweepCellResult`.
 *
 * The dispatcher does NOT swallow exceptions. If
 * `simulateOneGameAndCaptureMoves` throws (which today it does not — the
 * function returns a degenerate `CapturedGameResult` on empty inputs), the
 * exception propagates to the caller. The script wraps this call in an
 * outer try/catch and appends a fatal-record JSONL line before exiting.
 *
 * @param baseSetupConfig - Base 9-field MatchSetupConfig; `schemeId` and
 *   `mastermindId` are substituted per cell, the other 7 fields are held
 *   verbatim.
 * @param playerCount - Seat count for `buildPolicies` and downstream setup.
 * @param schemeIds - Scheme ext_id axis (unsorted permitted; dispatcher
 *   sorts).
 * @param mastermindIds - Mastermind ext_id axis (unsorted permitted).
 * @param registry - Card registry reader passed straight through to the
 *   WP-193 capture primitive.
 * @param buildPolicies - Operator-supplied factory mapping
 *   `(cellSeed, playerCount)` to the per-seat policy list. The recorder /
 *   sweep script uses the WP-193 seat-derived seed convention
 *   (`${cellSeed}::seat:${seatIndex}`) per D-19303 inside this factory.
 * @param runSeed - Run-level seed string; combined with `schemeId` and
 *   `mastermindId` to produce each cell's seed.
 * @param onCellComplete - Callback invoked once per dispatched (non-skipped)
 *   cell with the projected `SweepCellResult`.
 * @param shouldSkipCell - Optional predicate; when supplied and returning
 *   true for a `(schemeId, mastermindId)` pair, the dispatcher skips that
 *   cell entirely. `cellIndex` still advances over skipped cells so the
 *   index reflects the full lex-sorted enumeration.
 * @param maxTurns - Optional per-cell turn cap forwarded verbatim to
 *   `simulateOneGameAndCaptureMoves`; when omitted, that function's own
 *   default (`MAX_TURNS_PER_GAME`, 200) applies. Lets the WP-265 bounded
 *   sweep run short, terminating games instead of grinding to the safety cap.
 */
// why (D-19401): both axes are lex-sorted ascending here so iteration order
// is a deterministic property of the dispatcher rather than the caller. The
// sort is a load-bearing determinism guarantee — resume logic + manifest
// line order both depend on it. Stable copy ensures the operator's axis
// files are not mutated when the dispatcher is invoked from the CLI.
//
// why (D-19402): `cellSeed` is built with the locked `::cell:` separator via
// `CELL_SEED_SEPARATOR` (the literal lives in this file only). The
// intra-cell-coordinate separator `:` between schemeId and mastermindId is
// the single-colon coordinate join, NOT the `::cell:` separator. Nesting on
// top of WP-193's `::seat:` (applied by `buildPolicies`) preserves the
// D-3604 two-domain PRNG invariant.
//
// why: the dispatcher is registry-agnostic — `registry` is supplied by the
// host (the CLI script uses `EMPTY_REGISTRY`, mirroring the WP-193 recorder
// precedent). The sweep itself never imports `@legendary-arena/registry`,
// preserving the engine-category Layer Boundary rule.
export function sweepSetupMatrix(
  baseSetupConfig: MatchSetupConfig,
  playerCount: number,
  schemeIds: readonly string[],
  mastermindIds: readonly string[],
  registry: CardRegistryReader,
  buildPolicies: (cellSeed: string, playerCount: number) => readonly AIPolicy[],
  runSeed: string,
  onCellComplete: (cell: SweepCellResult) => void,
  shouldSkipCell?: (schemeId: string, mastermindId: string) => boolean,
  maxTurns?: number,
): void {
  const sortedSchemes = lexSortedCopy(schemeIds);
  const sortedMasterminds = lexSortedCopy(mastermindIds);

  let cellIndex = 0;
  for (const tuple of cartesianProduct<string>([sortedSchemes, sortedMasterminds])) {
    const schemeId = tuple[0]!;
    const mastermindId = tuple[1]!;

    if (shouldSkipCell !== undefined && shouldSkipCell(schemeId, mastermindId)) {
      cellIndex++;
      continue;
    }

    const cellSeed = `${runSeed}${CELL_SEED_SEPARATOR}${schemeId}:${mastermindId}`;
    const perCellComposition: MatchSetupConfig = {
      ...baseSetupConfig,
      schemeId,
      mastermindId,
    };
    const policies = buildPolicies(cellSeed, playerCount);

    // why: forward maxTurns verbatim; when the caller omits it (undefined),
    // simulateOneGameAndCaptureMoves applies its own MAX_TURNS_PER_GAME default,
    // so the omitting sweep path stays byte-identical to today's.
    const captured = simulateOneGameAndCaptureMoves(
      perCellComposition,
      registry,
      policies,
      cellSeed,
      0,
      maxTurns,
    );

    const cell: SweepCellResult = {
      cellIndex,
      schemeId,
      mastermindId,
      cellSeed,
      outcome: captured.outcome,
      endgameReached: captured.endgameReached,
      moveCount: captured.moves.length,
      hollowEffects: captured.hollowEffects,
      hollowEffectsDropped: captured.hollowEffectsDropped,
    };

    onCellComplete(cell);
    cellIndex++;
  }
}
