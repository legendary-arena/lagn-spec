import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRunCadence,
  deriveSweepTrendPoints,
  deriveSweepTrendSeries,
  useSweepTrend,
} from './useSweepTrend.js';
import { SWEEP_HEALTHY_ANOMALY_KEY } from './useSweepHealth.js';
import { mockSweepHealth } from '../services/sweepHealthMocks.js';
import type { SweepRunSummary } from '../types/sweep.js';

// ============================================================================
// WP-235 / EC-268 — Test coverage for the sweep health-rate trend helpers.
// Required ≥ 10 net-new cases per WP-235 §Scope (G); this file contributes 14:
// classifyRunCadence (weekly / daily / non-trailing-suffix edge / multi-digit
// window); deriveSweepTrendPoints (oldest→newest ordering, submittedAtMs parse,
// per-point health rate, 0-cell null guard, stable order under identical
// timestamps, mixed daily+weekly, empty input); deriveSweepTrendSeries
// (partition with no loss / no cross-contamination); the useSweepTrend
// composable; and a mock-data assertion that both cadences plus the healthy key
// are present. Non-healthy anomaly keys here are opaque mock strings — the
// forbidden taxonomy-class literals are never named.
// ============================================================================

/**
 * Build one `SweepRunSummary`. `submittedAt` is an explicit ISO string so a test
 * controls ordering and tie cases directly; `anomalyCounts` defaults to a fully
 * healthy run (health rate 1) unless a case overrides it.
 */
function run(
  runId: string,
  submittedAt: string,
  cellCount: number,
  anomalyCounts: Readonly<Record<string, number>> = { [SWEEP_HEALTHY_ANOMALY_KEY]: cellCount },
): SweepRunSummary {
  return {
    runId,
    submittedAt,
    startedAt: submittedAt,
    cellCount,
    anomalyCounts,
  };
}

test('should_classify_weekly_with_window_index_when_runId_has_trailing_weekly_suffix', () => {
  assert.deepEqual(classifyRunCadence('mock-sweep-run-00-weekly-w7'), {
    cadence: 'weekly',
    windowIndex: 7,
  });
});

test('should_classify_daily_with_null_window_when_runId_has_no_weekly_suffix', () => {
  assert.deepEqual(classifyRunCadence('mock-sweep-run-03'), {
    cadence: 'daily',
    windowIndex: null,
  });
});

test('should_classify_daily_when_weekly_token_is_not_the_trailing_w_number_suffix', () => {
  // why: cadence reads the `-weekly-w<digits>$` grammar ONLY; a 'weekly' that is
  // not the trailing `-weekly-w<N>` suffix must not flip the run to weekly.
  assert.deepEqual(classifyRunCadence('weekly-digest-run-01'), {
    cadence: 'daily',
    windowIndex: null,
  });
  assert.deepEqual(classifyRunCadence('run-weekly-wX'), {
    cadence: 'daily',
    windowIndex: null,
  });
});

test('should_parse_multi_digit_window_index_when_weekly_suffix_has_multiple_digits', () => {
  assert.deepEqual(classifyRunCadence('r-weekly-w12'), { cadence: 'weekly', windowIndex: 12 });
});

test('should_order_points_oldest_to_newest_when_given_most_recent_first_runs', () => {
  // recentRuns arrive most-recent-first (newest at index 0).
  const recentRuns = [
    run('newest', '2026-06-09T03:00:00.000Z', 100),
    run('middle', '2026-06-09T02:00:00.000Z', 100),
    run('oldest', '2026-06-09T01:00:00.000Z', 100),
  ];
  const points = deriveSweepTrendPoints(recentRuns);
  assert.deepEqual(
    points.map((point) => point.runId),
    ['oldest', 'middle', 'newest'],
  );
});

test('should_parse_submittedAtMs_from_the_iso_string_when_deriving_points', () => {
  const iso = '2026-06-09T01:00:00.000Z';
  const points = deriveSweepTrendPoints([run('r0', iso, 100)]);
  assert.equal(points[0]!.submittedAtMs, Date.parse(iso));
});

test('should_compute_healthRate_per_point_from_healthy_key_over_cellCount', () => {
  const points = deriveSweepTrendPoints([
    run('r0', '2026-06-09T01:00:00.000Z', 100, {
      [SWEEP_HEALTHY_ANOMALY_KEY]: 80,
      'soft-stall': 20,
    }),
  ]);
  assert.equal(points[0]!.healthRate, 0.8);
});

test('should_set_healthRate_null_for_a_zero_cell_run', () => {
  const points = deriveSweepTrendPoints([run('r0', '2026-06-09T01:00:00.000Z', 0, {})]);
  assert.equal(points[0]!.healthRate, null);
});

test('should_preserve_input_order_for_runs_sharing_an_identical_submittedAt', () => {
  // why: ordering lock — equal `submittedAtMs` ties keep the recentRuns
  // most-recent-first input order via a STABLE ascending sort (not a reverse).
  // A bare `.reverse()` would emit ['older','tie-b','tie-a']; the stable sort
  // emits ['older','tie-a','tie-b'].
  const tie = '2026-06-09T02:00:00.000Z';
  const recentRuns = [
    run('tie-a', tie, 100),
    run('tie-b', tie, 100),
    run('older', '2026-06-09T01:00:00.000Z', 100),
  ];
  const points = deriveSweepTrendPoints(recentRuns);
  assert.deepEqual(
    points.map((point) => point.runId),
    ['older', 'tie-a', 'tie-b'],
  );
});

test('should_partition_mixed_daily_and_weekly_runs_into_distinct_series', () => {
  const recentRuns = [
    run('w-1-weekly-w1', '2026-06-09T04:00:00.000Z', 2000),
    run('d-1', '2026-06-09T03:00:00.000Z', 100),
    run('w-0-weekly-w0', '2026-06-09T02:00:00.000Z', 2000),
    run('d-0', '2026-06-09T01:00:00.000Z', 100),
  ];
  const series = deriveSweepTrendSeries(deriveSweepTrendPoints(recentRuns));
  assert.deepEqual(
    series.daily.map((point) => point.runId),
    ['d-0', 'd-1'],
  );
  assert.deepEqual(
    series.weekly.map((point) => point.runId),
    ['w-0-weekly-w0', 'w-1-weekly-w1'],
  );
});

test('should_return_empty_arrays_when_recentRuns_is_empty', () => {
  assert.deepEqual(deriveSweepTrendPoints([]), []);
  const series = deriveSweepTrendSeries(deriveSweepTrendPoints([]));
  assert.deepEqual([...series.daily], []);
  assert.deepEqual([...series.weekly], []);
});

test('should_partition_series_with_no_loss_when_cadence_counts_are_uneven', () => {
  const points = deriveSweepTrendPoints([
    run('d2', '2026-06-09T05:00:00.000Z', 100),
    run('wk1-weekly-w2', '2026-06-09T04:00:00.000Z', 2000),
    run('d1', '2026-06-09T03:00:00.000Z', 100),
    run('wk0-weekly-w0', '2026-06-09T02:00:00.000Z', 2000),
    run('d0', '2026-06-09T01:00:00.000Z', 100),
  ]);
  const series = deriveSweepTrendSeries(points);
  assert.equal(series.daily.length, 3);
  assert.equal(series.weekly.length, 2);
  assert.equal(series.daily.length + series.weekly.length, points.length);
  for (const dailyPoint of series.daily) {
    assert.equal(dailyPoint.cadence, 'daily');
  }
  for (const weeklyPoint of series.weekly) {
    assert.equal(weeklyPoint.cadence, 'weekly');
  }
});

test('should_expose_points_and_series_as_computed_refs_from_useSweepTrend', () => {
  const recentRuns = [
    run('w-weekly-w3', '2026-06-09T02:00:00.000Z', 2000),
    run('d', '2026-06-09T01:00:00.000Z', 100),
  ];
  const { points, series } = useSweepTrend(() => recentRuns);
  assert.equal(points.value.length, 2);
  // oldest first
  assert.equal(points.value[0]!.runId, 'd');
  assert.equal(series.value.daily.length, 1);
  assert.equal(series.value.weekly.length, 1);
  assert.equal(series.value.weekly[0]!.windowIndex, 3);
});

test('should_include_both_cadences_and_the_healthy_key_in_mock_sweep_runs', () => {
  // why: AC #8 — MOCK mode must show a daily + weekly mix and every run must
  // carry the healthy key so the trend's health rate is meaningful and varied.
  const fixedNowMs = Date.parse('2026-06-09T12:00:00.000Z');
  const response = mockSweepHealth('30d', fixedNowMs);
  const recentRuns = response.data.recentRuns;
  const series = deriveSweepTrendSeries(deriveSweepTrendPoints(recentRuns));
  assert.ok(series.weekly.length > 0, 'mock has at least one weekly run');
  assert.ok(series.daily.length > 0, 'mock has at least one daily run');
  for (const mockRun of recentRuns) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(mockRun.anomalyCounts, SWEEP_HEALTHY_ANOMALY_KEY),
      `mock run ${mockRun.runId} carries the healthy key`,
    );
  }
  for (const weeklyPoint of series.weekly) {
    assert.match(weeklyPoint.runId, /-weekly-w\d+$/);
  }
});
