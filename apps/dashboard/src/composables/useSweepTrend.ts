import { computed, type ComputedRef } from 'vue';
import type { SweepRunSummary, SweepTrendPoint } from '../types/sweep.js';
import { computeSweepHealthRate } from './useSweepHealth.js';

// Matches a weekly full-corpus runId suffix `-weekly-w<windowIndex>` (WP-234
// runId grammar). The capture group is the integer rotation-window index. The
// `$` anchor keeps the match on the trailing suffix only, so a daily runId that
// merely contains digits never matches.
const WEEKLY_RUNID_PATTERN = /-weekly-w(\d+)$/;

/**
 * A sweep run's cadence classification: `weekly` full-corpus (with its rotation
 * `windowIndex`) or `daily` smoke (`windowIndex = null`).
 */
export interface SweepRunCadence {
  readonly cadence: 'daily' | 'weekly';
  readonly windowIndex: number | null;
}

/**
 * The two cadence-separated trend series. The composable owns this split; the
 * chart consumes it and never re-derives the partition.
 */
export interface SweepTrendSeries {
  readonly daily: readonly SweepTrendPoint[];
  readonly weekly: readonly SweepTrendPoint[];
}

/**
 * Return value of `useSweepTrend`: the ordered trend points and their
 * cadence-separated series, both as `ComputedRef`s.
 */
export interface UseSweepTrendReturn {
  points: ComputedRef<readonly SweepTrendPoint[]>;
  series: ComputedRef<SweepTrendSeries>;
}

/**
 * Classify a sweep run's cadence from its runId string grammar alone. A runId
 * ending `-weekly-w<N>` is a weekly full-corpus run with the parsed window
 * index; anything else is a daily smoke run.
 */
export function classifyRunCadence(runId: string): SweepRunCadence {
  // why (D-23502): cadence derives from the `-weekly-w<N>` runId suffix grammar
  // (the WP-209 + WP-234 contract), NOT from `cellCount` magnitude or the
  // opaque anomaly taxonomy. A clamped weekly tail or a future per-run cell-
  // cardinality change must never flip a run's cadence.
  const match = WEEKLY_RUNID_PATTERN.exec(runId);
  if (match === null || match[1] === undefined) {
    return { cadence: 'daily', windowIndex: null };
  }
  const windowIndex = Number.parseInt(match[1], 10);
  return { cadence: 'weekly', windowIndex };
}

/**
 * Project the server's most-recent-first `recentRuns` into trend points ordered
 * oldest → newest. Each point carries the parsed timestamp, derived cadence,
 * and the single-source-of-truth health rate.
 */
export function deriveSweepTrendPoints(
  recentRuns: readonly SweepRunSummary[],
): readonly SweepTrendPoint[] {
  const points: SweepTrendPoint[] = [];
  for (const run of recentRuns) {
    const cadence = classifyRunCadence(run.runId);
    points.push({
      runId: run.runId,
      submittedAt: run.submittedAt,
      // `submittedAt` is the server's `toISOString()` ISO-8601 string
      // (`sweep.logic.ts` `mapRowToSummary`), so `Date.parse` is a pure,
      // spec-deterministic parse — NOT a wall-clock read.
      submittedAtMs: Date.parse(run.submittedAt),
      cadence: cadence.cadence,
      windowIndex: cadence.windowIndex,
      cellCount: run.cellCount,
      healthRate: computeSweepHealthRate(run),
    });
  }
  // why (ordering lock): oldest → newest via a STABLE ascending sort on
  // `submittedAtMs` — NOT a bare `.reverse()` of the most-recent-first input
  // (a raw reverse would invert equal-timestamp tie order). `Array.sort` is
  // stable (ES2019+), so runs sharing a `submittedAtMs` keep their `recentRuns`
  // most-recent-first input order.
  points.sort((first, second) => first.submittedAtMs - second.submittedAtMs);
  return points;
}

/**
 * Partition trend points into `{ daily, weekly }` series by cadence with no loss
 * and no cross-contamination, using an explicit `for...of` loop rather than an
 * array fold.
 */
export function deriveSweepTrendSeries(points: readonly SweepTrendPoint[]): SweepTrendSeries {
  const daily: SweepTrendPoint[] = [];
  const weekly: SweepTrendPoint[] = [];
  for (const point of points) {
    if (point.cadence === 'weekly') {
      weekly.push(point);
    } else {
      daily.push(point);
    }
  }
  return { daily, weekly };
}

/**
 * Thin composable wrapping the pure trend helpers into `ComputedRef`s. Mirrors
 * `useSweepHealth`'s purity: a pure function of its input getter with no
 * internal `Date.now()` (the only time input is the fixed ISO string already in
 * each run, parsed deterministically).
 */
export function useSweepTrend(
  recentRunsGetter: () => readonly SweepRunSummary[],
): UseSweepTrendReturn {
  const points = computed<readonly SweepTrendPoint[]>(() =>
    deriveSweepTrendPoints(recentRunsGetter()),
  );
  const series = computed<SweepTrendSeries>(() => deriveSweepTrendSeries(points.value));
  return { points, series };
}
