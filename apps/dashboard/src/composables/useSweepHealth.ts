import { computed, type ComputedRef } from 'vue';
import {
  type ApiError,
  type KpiSnapshot,
  type KpiStatus,
  type ServiceResponse,
} from '../types/index.js';
import type { SweepHealthSnapshot, SweepRunSummary } from '../types/sweep.js';
import { computeKpiStatus } from '../utils/kpiStatus.js';

// why (D-20703): 36 hours = 1.5× nightly cadence (24h) — buffer for time-zone
// drift + GitHub Actions scheduling jitter. Anything >= this threshold
// surfaces an operator-actionable Stale chip.
const STALE_THRESHOLD_HOURS = 36;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;
const STALE_TOLERANCE_MS = 6 * 60 * 60 * 1000;

// Recent-runs sparkline cap (mirrors the WP-204 30-day sparkline convention).
const SPARKLINE_RUN_COUNT = 30;

/**
 * The composable's single data input: the resolved fetch state for
 * `GET /api/sweep/latest`. `response` is the `ServiceResponse` envelope when
 * the fetch has resolved with data, or `null` while still loading; `error` is
 * non-null only when the fetch failed. Keeping loading / error / data in one
 * value (rather than reading them from the service layer) is what lets the
 * composable be a pure function of `(fetchState, currentTimeMs)` and lets the
 * test suite inject every one of the four widget states deterministically.
 */
export interface SweepHealthFetchState {
  readonly response: ServiceResponse<SweepHealthSnapshot> | null;
  readonly error: ApiError | null;
}

export interface UseSweepHealthReturn {
  state: ComputedRef<'loading' | 'empty' | 'error' | 'data'>;
  latestRun: ComputedRef<SweepRunSummary | null>;
  recentRuns: ComputedRef<readonly SweepRunSummary[]>;
  totalAnomalySparkline: ComputedRef<readonly number[]>;
  lastRunAgeMs: ComputedRef<number | null>;
  staleStatus: ComputedRef<'fresh' | 'stale'>;
  kpiStatus: ComputedRef<KpiStatus | null>;
  source: ComputedRef<ServiceResponse<unknown>['source'] | null>;
  updatedAt: ComputedRef<number | null>;
}

/**
 * Sum a run's anomaly counts across ALL keys. The dashboard treats anomaly
 * keys as opaque strings (D-20703), so the total iterates `Object.values`
 * generically and never selects "interesting" keys — a key-selective sum would
 * be a covert opacity breach.
 */
function sumAnomalyCounts(run: SweepRunSummary): number {
  let total = 0;
  for (const count of Object.values(run.anomalyCounts)) {
    total += count;
  }
  return total;
}

/**
 * Derive the operator-facing sweep-health projections from a resolved fetch
 * state plus the current wall-clock instant. Mirrors the WP-204
 * `useInfraCostWatchdog` wall-clock-independence invariant: `Date.now()` is
 * NEVER called inside this composable — `currentTimeMs` is passed in by the
 * widget caller (which samples it ONCE at the render boundary), so identical
 * inputs always produce identical output.
 *
 * Derivations:
 *
 * - `state` — 4-arm gate: `error` when the fetch failed; `loading` when no
 *   response has resolved yet; `empty` ONLY when a response resolved with
 *   `latest === null` AND no error; `data` otherwise. Empty and error are
 *   mutually exclusive so a quiet failure never masquerades as "no data".
 * - `recentRuns` — the response's runs truncated to the most-recent
 *   `SPARKLINE_RUN_COUNT` via `slice(0, 30)` (retain the first 30, never the
 *   last 30, never reversed). This composable is the truncation boundary; the
 *   widget consumes whatever it is given.
 * - `totalAnomalySparkline` — `[i] === sum(Object.values(recentRuns[i]
 *   .anomalyCounts))`, index 0 = most-recent run; `length ===
 *   min(recentRuns.length, 30)`.
 * - `lastRunAgeMs` — `currentTimeMs - Date.parse(latest.submittedAt)`, or
 *   `null` in the empty state.
 * - `staleStatus` — `'stale'` when `lastRunAgeMs >= STALE_THRESHOLD_MS`, else
 *   `'fresh'` (and `'fresh'` by default when there is no run).
 * - `kpiStatus` — `computeKpiStatus()` (WP-198) over the locked KpiSnapshot;
 *   `null` in the empty state (no chip).
 */
export function useSweepHealth(
  fetchStateGetter: () => SweepHealthFetchState,
  // why (D-19608 carry-forward + WP-204 invariant): pure-function discipline —
  // composable is a pure function of (fetchedSnapshot, currentTimeMs);
  // Date.now() is called ONCE at the widget render boundary and passed in.
  // Wall-clock-independence test enforces.
  currentTimeMs: number,
): UseSweepHealthReturn {
  const fetchState = computed<SweepHealthFetchState>(() => fetchStateGetter());

  const snapshot = computed<SweepHealthSnapshot | null>(() => {
    return fetchState.value.response?.data ?? null;
  });

  const latestRun = computed<SweepRunSummary | null>(() => {
    return snapshot.value?.latest ?? null;
  });

  const recentRuns = computed<readonly SweepRunSummary[]>(() => {
    const currentSnapshot = snapshot.value;
    if (currentSnapshot === null) {
      return [];
    }
    // why: §Locked contract values — truncation lives at the composable layer;
    // `slice(0, SPARKLINE_RUN_COUNT)` retains the most-recent 30 (the endpoint
    // orders `submitted_at DESC`, so index 0 is newest). Never the last 30,
    // never reversed.
    return currentSnapshot.recentRuns.slice(0, SPARKLINE_RUN_COUNT);
  });

  const totalAnomalySparkline = computed<readonly number[]>(() => {
    const values: number[] = [];
    for (const run of recentRuns.value) {
      values.push(sumAnomalyCounts(run));
    }
    return values;
  });

  const lastRunAgeMs = computed<number | null>(() => {
    const latest = latestRun.value;
    if (latest === null) {
      return null;
    }
    // `Date.parse` over a fixed ISO-8601 string is pure and platform-stable;
    // the only wall-clock input is `currentTimeMs`, passed in by the caller.
    return currentTimeMs - Date.parse(latest.submittedAt);
  });

  const staleStatus = computed<'fresh' | 'stale'>(() => {
    const ageMs = lastRunAgeMs.value;
    if (ageMs === null) {
      return 'fresh';
    }
    return ageMs >= STALE_THRESHOLD_MS ? 'stale' : 'fresh';
  });

  const kpiStatus = computed<KpiStatus | null>(() => {
    const ageMs = lastRunAgeMs.value;
    if (ageMs === null) {
      return null;
    }
    // why (WP-198 reuse): computeKpiStatus() is the canonical KPI status
    // taxonomy helper; constructing a KpiSnapshot here preserves single-
    // implementation discipline so the Fresh/Stale chip stays consistent with
    // WP-198 / WP-204 surface chips.
    const kpiSnapshot: KpiSnapshot = {
      id: 'sweep-freshness',
      label: 'Sweep freshness',
      value: ageMs,
      previousValue: 0,
      unit: 'ms',
      trend: 'flat',
      direction: 'lower-is-better',
      target: STALE_THRESHOLD_MS,
      tolerance: STALE_TOLERANCE_MS,
    };
    return computeKpiStatus(kpiSnapshot);
  });

  const state = computed<'loading' | 'empty' | 'error' | 'data'>(() => {
    if (fetchState.value.error !== null) {
      return 'error';
    }
    if (fetchState.value.response === null) {
      return 'loading';
    }
    if (latestRun.value === null) {
      return 'empty';
    }
    return 'data';
  });

  const source = computed<ServiceResponse<unknown>['source'] | null>(() => {
    return fetchState.value.response?.source ?? null;
  });

  const updatedAt = computed<number | null>(() => {
    return fetchState.value.response?.updatedAt ?? null;
  });

  return {
    state,
    latestRun,
    recentRuns,
    totalAnomalySparkline,
    lastRunAgeMs,
    staleStatus,
    kpiStatus,
    source,
    updatedAt,
  };
}
