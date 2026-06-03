import { computed, type ComputedRef } from 'vue';
import type { RetentionCohort, ServiceResponse } from '../types/index.js';

export interface UseRetentionCohortsReturn {
  cohorts: ComputedRef<readonly RetentionCohort[]>;
  averageDay1Rate: ComputedRef<number>;
  averageDay7Rate: ComputedRef<number>;
  cohortWithHighestDay7: ComputedRef<RetentionCohort | null>;
  source: ComputedRef<ServiceResponse<unknown>['source']>;
  updatedAt: ComputedRef<number>;
}

/**
 * Derive cross-cohort aggregates from a `RetentionCohort[]` response. Per
 * WP-203 §Composable Source Contract, the composable accepts the FULL
 * `ServiceResponse<readonly RetentionCohort[]>` envelope.
 *
 * Derivations:
 *
 * - `cohorts` — passthrough of `response.data`.
 * - `averageDay1Rate` — unweighted mean of `day1ReturnCount / cohortSize`
 *   across all cohorts. Empty input returns `0` (NOT `NaN`) per D-19908.
 *   Cohorts with `cohortSize === 0` contribute `0` to the mean
 *   (zero-denominator guard).
 * - `averageDay7Rate` — same shape for D7.
 * - `cohortWithHighestDay7` — the cohort with the highest
 *   `day7ReturnCount`. Ties broken by `cohortWeek` lexical descending
 *   (most-recent week wins on tie), mirroring D-18902 lexical-iteration
 *   discipline. Empty input returns `null`.
 */
export function useRetentionCohorts(
  responseGetter: () => ServiceResponse<readonly RetentionCohort[]>,
): UseRetentionCohortsReturn {
  const response = computed(() => responseGetter());

  const cohorts = computed<readonly RetentionCohort[]>(() => response.value.data);

  // why: WP-203 §Composable Source Contract — widgets read freshness from
  // the composable's `source` / `updatedAt`. MOCK → LIVE flip in WP-205
  // is a getter-only change.
  const source = computed<ServiceResponse<unknown>['source']>(() => response.value.source);
  const updatedAt = computed<number>(() => response.value.updatedAt);

  const averageDay1Rate = computed<number>(() => {
    const list = cohorts.value;
    if (list.length === 0) {
      // why: D-19908 — empty input returns `0`, not `NaN`. The widget's
      // empty-state arm catches this before display but the composable
      // contract owns the safe return.
      return 0;
    }
    let sum = 0;
    for (const cohort of list) {
      // why: D-19908 — per-cohort zero-denominator guard. A cohort with
      // `cohortSize === 0` contributes `0` to the mean (rather than
      // `NaN` propagating across the average).
      sum += cohort.cohortSize === 0 ? 0 : cohort.day1ReturnCount / cohort.cohortSize;
    }
    return sum / list.length;
  });

  const averageDay7Rate = computed<number>(() => {
    const list = cohorts.value;
    if (list.length === 0) {
      return 0;
    }
    let sum = 0;
    for (const cohort of list) {
      sum += cohort.cohortSize === 0 ? 0 : cohort.day7ReturnCount / cohort.cohortSize;
    }
    return sum / list.length;
  });

  const cohortWithHighestDay7 = computed<RetentionCohort | null>(() => {
    const list = cohorts.value;
    if (list.length === 0) {
      return null;
    }
    let best: RetentionCohort = list[0] as RetentionCohort;
    for (let cohortIndex = 1; cohortIndex < list.length; cohortIndex++) {
      const candidate = list[cohortIndex];
      if (candidate === undefined) {
        continue;
      }
      if (candidate.day7ReturnCount > best.day7ReturnCount) {
        best = candidate;
        continue;
      }
      // why: WP-203 §Retention semantics — ties on `day7ReturnCount` are
      // broken by `cohortWeek` lexical descending so the most-recent
      // cohort wins on tie. Mirrors D-18902 lexical-iteration discipline
      // pattern. Unicode code-unit comparison is required (no
      // `localeCompare`) per D-19605 / D-19904 carry-forward — ambient-
      // locale dependence would make the tie-break non-deterministic.
      if (
        candidate.day7ReturnCount === best.day7ReturnCount &&
        candidate.cohortWeek > best.cohortWeek
      ) {
        best = candidate;
      }
    }
    return best;
  });

  return {
    cohorts,
    averageDay1Rate,
    averageDay7Rate,
    cohortWithHighestDay7,
    source,
    updatedAt,
  };
}
