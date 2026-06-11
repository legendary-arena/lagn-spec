import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  useSweepHealth,
  computeSweepHealthRate,
  SWEEP_HEALTHY_ANOMALY_KEY,
  type SweepHealthFetchState,
} from './useSweepHealth.js';
import { mockSweepHealth } from '../services/sweepHealthMocks.js';
import type { ApiError, ServiceResponse } from '../types/index.js';
import type { SweepHealthSnapshot, SweepRunSummary } from '../types/sweep.js';

// ============================================================================
// WP-210 / EC-242 — Test coverage for `useSweepHealth`. Required ≥ 9 tests per
// WP-210 §Scope (In); this file contributes 11 (happy-path data; empty-state
// sentinel; error-state surface + error-never-renders-empty; stale boundary
// 36h-1ms = fresh; stale boundary 36h+1ms = stale; 30-run sparkline cap
// retaining the most-recent 30; sparkline aggregation correctness; opaque-key
// handling; unknown-future-key flows through unbranched; KpiStatus mapping via
// computeKpiStatus; wall-clock-independence). Locked
// `should_<behavior>_when_<condition>` test naming.
// ============================================================================

const STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000;
const FIXED_NOW_MS = Date.parse('2026-06-04T12:00:00.000Z');

/**
 * Wrap a snapshot into the loaded fetch state (`error: null`) the composable
 * consumes. `updatedAt` / `source` default to fixed MOCK values.
 */
function loaded(snapshot: SweepHealthSnapshot): SweepHealthFetchState {
  const response: ServiceResponse<SweepHealthSnapshot> = {
    data: snapshot,
    updatedAt: 1_700_000_000_000,
    source: 'MOCK',
  };
  return { response, error: null };
}

/**
 * Build one `SweepRunSummary`. `ageMs` is the run's age relative to
 * `FIXED_NOW_MS`; `anomalyCounts` are opaque mock keys.
 */
function run(
  runId: string,
  ageMs: number,
  anomalyCounts: Readonly<Record<string, number>>,
  cellCount: number = 200,
): SweepRunSummary {
  const submittedAtMs = FIXED_NOW_MS - ageMs;
  return {
    runId,
    submittedAt: new Date(submittedAtMs).toISOString(),
    startedAt: new Date(submittedAtMs - 5 * 60 * 1000).toISOString(),
    cellCount,
    anomalyCounts,
  };
}

/**
 * Assemble a snapshot from a list of runs (already most-recent-first);
 * `latest` is `runs[0]` or `null`.
 */
function snapshotOf(runs: readonly SweepRunSummary[]): SweepHealthSnapshot {
  return {
    latest: runs.length > 0 ? (runs[0] ?? null) : null,
    recentRuns: runs,
  };
}

test('should_surface_data_state_with_projections_when_latest_run_present', () => {
  const runs = [
    run('r0', 60 * 60 * 1000, { 'soft-lock': 2, timeout: 1 }),
    run('r1', 2 * 60 * 60 * 1000, { 'soft-lock': 0, timeout: 3 }),
  ];
  const { state, latestRun, recentRuns, lastRunAgeMs, source, updatedAt } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  assert.equal(state.value, 'data');
  assert.equal(latestRun.value?.runId, 'r0');
  assert.equal(recentRuns.value.length, 2);
  assert.equal(lastRunAgeMs.value, 60 * 60 * 1000);
  assert.equal(source.value, 'MOCK');
  assert.equal(updatedAt.value, 1_700_000_000_000);
});

test('should_surface_empty_state_when_latest_run_is_null', () => {
  const { state, latestRun, lastRunAgeMs, staleStatus, kpiStatus } = useSweepHealth(
    () => loaded(snapshotOf([])),
    FIXED_NOW_MS,
  );
  assert.equal(state.value, 'empty');
  assert.equal(latestRun.value, null);
  assert.equal(lastRunAgeMs.value, null);
  // Defaults when there is no run: fresh, no chip.
  assert.equal(staleStatus.value, 'fresh');
  assert.equal(kpiStatus.value, null);
});

test('should_surface_error_state_and_never_render_empty_copy_when_fetch_failed', () => {
  // why: AC #17 — empty and error are mutually exclusive. Even when the
  // response is absent (which would otherwise be empty/loading), a non-null
  // error MUST yield 'error', never 'empty'.
  const fetchError: ApiError = { message: 'Sweep health request failed.' };
  const errorState: SweepHealthFetchState = { response: null, error: fetchError };
  const { state } = useSweepHealth(() => errorState, FIXED_NOW_MS);
  assert.equal(state.value, 'error');
  assert.notEqual(state.value, 'empty');
});

test('should_surface_loading_state_when_no_response_and_no_error', () => {
  const loadingState: SweepHealthFetchState = { response: null, error: null };
  const { state } = useSweepHealth(() => loadingState, FIXED_NOW_MS);
  assert.equal(state.value, 'loading');
});

test('should_report_fresh_when_age_is_one_ms_below_stale_threshold', () => {
  const runs = [run('r0', STALE_THRESHOLD_MS - 1, { 'soft-lock': 1 })];
  const { staleStatus, lastRunAgeMs } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  assert.equal(lastRunAgeMs.value, STALE_THRESHOLD_MS - 1);
  assert.equal(staleStatus.value, 'fresh');
});

test('should_report_stale_when_age_is_one_ms_above_stale_threshold', () => {
  const runs = [run('r0', STALE_THRESHOLD_MS + 1, { 'soft-lock': 1 })];
  const { staleStatus, lastRunAgeMs } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  assert.equal(lastRunAgeMs.value, STALE_THRESHOLD_MS + 1);
  assert.equal(staleStatus.value, 'stale');
});

test('should_cap_sparkline_to_thirty_retaining_most_recent_when_thirty_five_runs_supplied', () => {
  const runs: SweepRunSummary[] = [];
  for (let index = 0; index < 35; index++) {
    // index 0 = most recent (smallest age); anomaly total = index so the
    // retained set is identifiable by value.
    runs.push(run(`r${index}`, index * 60 * 1000, { 'soft-lock': index }));
  }
  const { recentRuns, totalAnomalySparkline } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  assert.equal(recentRuns.value.length, 30);
  assert.equal(totalAnomalySparkline.value.length, 30);
  // Retains the FIRST 30 (most-recent 30), never the last 30, never reversed:
  // index 0 = most-recent run (total 0); index 29 = total 29.
  assert.equal(totalAnomalySparkline.value[0], 0);
  assert.equal(totalAnomalySparkline.value[29], 29);
  assert.equal(recentRuns.value[0]?.runId, 'r0');
  assert.equal(recentRuns.value[29]?.runId, 'r29');
});

test('should_sum_all_anomaly_keys_for_sparkline_index_zero_when_latest_has_multiple_kinds', () => {
  const latestCounts = { 'soft-lock': 4, 'hard-crash': 2, timeout: 1 };
  const runs = [
    run('r0', 60 * 60 * 1000, latestCounts),
    run('r1', 2 * 60 * 60 * 1000, { 'soft-lock': 9 }),
  ];
  const { totalAnomalySparkline, recentRuns } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  const expectedZero = Object.values(recentRuns.value[0]?.anomalyCounts ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.equal(totalAnomalySparkline.value[0], expectedZero);
  assert.equal(totalAnomalySparkline.value[0], 7);
});

test('should_handle_unknown_future_anomaly_key_unbranched_when_key_not_in_engine_taxonomy', () => {
  // why: opaque-key posture (D-20703) — a key the dashboard has never seen
  // ('weird-future-case') must flow through: summed into the sparkline,
  // never throwing, never branched on.
  const runs = [run('r0', 60 * 60 * 1000, { 'weird-future-case': 5, 'soft-lock': 3 })];
  const { totalAnomalySparkline, state } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  assert.equal(state.value, 'data');
  assert.equal(totalAnomalySparkline.value[0], 8);
});

test('should_map_kpi_status_via_computeKpiStatus_when_age_crosses_threshold_band', () => {
  // direction 'lower-is-better', target 36h, tolerance 6h.
  // fresh (age < target) → on-track; target < age <= target+tolerance →
  // needs-attention; age > target+tolerance → off-track.
  const fresh = useSweepHealth(
    () => loaded(snapshotOf([run('r0', STALE_THRESHOLD_MS - 60 * 1000, { 'soft-lock': 1 })])),
    FIXED_NOW_MS,
  );
  assert.equal(fresh.kpiStatus.value, 'on-track');

  const mild = useSweepHealth(
    () => loaded(snapshotOf([run('r0', STALE_THRESHOLD_MS + 60 * 60 * 1000, { 'soft-lock': 1 })])),
    FIXED_NOW_MS,
  );
  assert.equal(mild.kpiStatus.value, 'needs-attention');

  const severe = useSweepHealth(
    () =>
      loaded(snapshotOf([run('r0', STALE_THRESHOLD_MS + 12 * 60 * 60 * 1000, { 'soft-lock': 1 })])),
    FIXED_NOW_MS,
  );
  assert.equal(severe.kpiStatus.value, 'off-track');
});

test('should_compute_health_rate_as_healthy_key_over_cellCount', () => {
  // why: AC #1 — the health rate is `endgame-reached / cellCount`. Non-healthy
  // keys are opaque mock strings; only the healthy key drives the numerator.
  const rate = computeSweepHealthRate(
    run('r0', 0, { [SWEEP_HEALTHY_ANOMALY_KEY]: 80, 'soft-lock': 20 }, 100),
  );
  assert.equal(rate, 0.8);
});

test('should_treat_missing_healthy_key_as_zero_healthy_cells', () => {
  // A run with no healthy key reads 0 healthy cells, not NaN/undefined.
  assert.equal(computeSweepHealthRate(run('r0', 0, { 'soft-lock': 5 }, 100)), 0);
});

test('should_treat_non_numeric_healthy_value_as_zero_without_NaN', () => {
  // why: AC #1 — a non-numeric healthy value (only reachable via a malformed
  // payload past the type boundary) reads 0; it must never propagate NaN.
  const base = run('r0', 0, { 'soft-lock': 1 }, 100);
  const malformed: SweepRunSummary = {
    ...base,
    anomalyCounts: {
      ...base.anomalyCounts,
      [SWEEP_HEALTHY_ANOMALY_KEY]: 'oops' as unknown as number,
    },
  };
  assert.equal(computeSweepHealthRate(malformed), 0);
});

test('should_return_null_health_rate_for_a_zero_cell_run', () => {
  // why: AC #1 — a 0-cell run yields null, never a divide-by-zero NaN.
  assert.equal(computeSweepHealthRate(run('r0', 0, { [SWEEP_HEALTHY_ANOMALY_KEY]: 0 }, 0)), null);
});

test('should_expose_latest_health_rate_and_per_run_sparkline_when_runs_present', () => {
  const runs = [
    // index 0 = most-recent run (mirrors the totalAnomalySparkline convention).
    run('r0', 60 * 60 * 1000, { [SWEEP_HEALTHY_ANOMALY_KEY]: 90 }, 100),
    run('r1', 2 * 60 * 60 * 1000, { [SWEEP_HEALTHY_ANOMALY_KEY]: 40 }, 100),
  ];
  const { healthRate, healthRateSparkline } = useSweepHealth(
    () => loaded(snapshotOf(runs)),
    FIXED_NOW_MS,
  );
  assert.equal(healthRate.value, 0.9);
  assert.deepEqual([...healthRateSparkline.value], [0.9, 0.4]);
});

test('should_expose_null_health_rate_and_empty_sparkline_in_empty_state', () => {
  const { healthRate, healthRateSparkline } = useSweepHealth(
    () => loaded(snapshotOf([])),
    FIXED_NOW_MS,
  );
  assert.equal(healthRate.value, null);
  assert.deepEqual([...healthRateSparkline.value], []);
});

test('should_return_deep_equal_output_when_called_twice_with_identical_inputs', () => {
  // why: wall-clock-independence gate — the composable derives age from the
  // passed-in `currentTimeMs`, NOT `Date.now()`. Identical inputs must yield
  // deep-equal output regardless of when the call runs.
  const response = mockSweepHealth('30d', FIXED_NOW_MS);
  const fetchState: SweepHealthFetchState = { response, error: null };

  const first = useSweepHealth(() => fetchState, FIXED_NOW_MS);
  const firstSnapshot = {
    state: first.state.value,
    lastRunAgeMs: first.lastRunAgeMs.value,
    staleStatus: first.staleStatus.value,
    kpiStatus: first.kpiStatus.value,
    sparkline: [...first.totalAnomalySparkline.value],
  };

  const second = useSweepHealth(() => fetchState, FIXED_NOW_MS);
  const secondSnapshot = {
    state: second.state.value,
    lastRunAgeMs: second.lastRunAgeMs.value,
    staleStatus: second.staleStatus.value,
    kpiStatus: second.kpiStatus.value,
    sparkline: [...second.totalAnomalySparkline.value],
  };

  assert.deepEqual(firstSnapshot, secondSnapshot);
  // The mock factory always produces a full 30-run window.
  assert.equal(first.recentRuns.value.length, 30);
});
