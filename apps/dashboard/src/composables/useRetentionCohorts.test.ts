import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useRetentionCohorts } from './useRetentionCohorts.js';
import { mockRetentionCohorts } from '../services/analyticsMocks.js';
import type { RetentionCohort, ServiceResponse } from '../types/index.js';

// ============================================================================
// WP-203 / EC-231 — Sub-task B test coverage for `useRetentionCohorts`.
// Required ≥ 7 tests per WP-203 §Acceptance Criteria → Build / Test /
// Layer; this file contributes 8 (averages; best-cohort selection; empty
// input returns null; single-cohort edge case; tie-break on day7ReturnCount
// by cohortWeek lexical descending; source + updatedAt passthrough per
// §Composable Source Contract; mock determinism + mock-output-is-pure-
// function-of-cohortCount per §Determinism scope).
// ============================================================================

function wrap(
  data: readonly RetentionCohort[],
  overrides: Partial<
    Pick<ServiceResponse<readonly RetentionCohort[]>, 'source' | 'updatedAt'>
  > = {},
): ServiceResponse<readonly RetentionCohort[]> {
  return {
    data,
    source: 'MOCK',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function cohort(
  cohortWeek: string,
  cohortSize: number,
  day1ReturnCount: number,
  day7ReturnCount: number,
): RetentionCohort {
  return { cohortWeek, cohortSize, day1ReturnCount, day7ReturnCount };
}

test('1. averageDay1Rate and averageDay7Rate are unweighted means of per-cohort rates', () => {
  const cohorts: readonly RetentionCohort[] = [
    cohort('2026-W18', 100, 50, 25),
    cohort('2026-W19', 100, 40, 20),
    cohort('2026-W20', 100, 60, 30),
  ];
  const { averageDay1Rate, averageDay7Rate } = useRetentionCohorts(() => wrap(cohorts));
  // (0.50 + 0.40 + 0.60) / 3 = 0.50
  assert.equal(averageDay1Rate.value, 0.5);
  // (0.25 + 0.20 + 0.30) / 3 = 0.25
  assert.equal(averageDay7Rate.value, 0.25);
});

test('2. cohortWithHighestDay7 returns the cohort with the highest day7ReturnCount', () => {
  const cohorts: readonly RetentionCohort[] = [
    cohort('2026-W18', 100, 50, 20),
    cohort('2026-W19', 100, 40, 35),
    cohort('2026-W20', 100, 60, 28),
  ];
  const { cohortWithHighestDay7 } = useRetentionCohorts(() => wrap(cohorts));
  assert.notEqual(cohortWithHighestDay7.value, null);
  assert.equal(cohortWithHighestDay7.value?.cohortWeek, '2026-W19');
});

test('3. Empty input returns averages of 0 and a null cohortWithHighestDay7', () => {
  const { averageDay1Rate, averageDay7Rate, cohortWithHighestDay7 } = useRetentionCohorts(() =>
    wrap([]),
  );
  assert.equal(averageDay1Rate.value, 0);
  assert.equal(averageDay7Rate.value, 0);
  assert.equal(cohortWithHighestDay7.value, null);
});

test('4. Single-cohort input returns that cohort as the highest and its rate as the average', () => {
  const cohorts: readonly RetentionCohort[] = [cohort('2026-W20', 80, 40, 16)];
  const { averageDay1Rate, averageDay7Rate, cohortWithHighestDay7 } = useRetentionCohorts(() =>
    wrap(cohorts),
  );
  assert.equal(averageDay1Rate.value, 0.5);
  assert.equal(averageDay7Rate.value, 0.2);
  assert.equal(cohortWithHighestDay7.value?.cohortWeek, '2026-W20');
});

test('5. Ties on day7ReturnCount broken by cohortWeek lexical descending (most-recent wins)', () => {
  // why: WP-203 §Retention semantics — deterministic tie-break, mirrors
  // D-18902 lexical-iteration discipline pattern. Most-recent cohort
  // wins on tie (lexical descending on YYYY-Www).
  const cohorts: readonly RetentionCohort[] = [
    cohort('2026-W18', 100, 50, 30),
    cohort('2026-W19', 100, 50, 30),
    cohort('2026-W20', 100, 50, 30),
    cohort('2026-W17', 100, 50, 30),
  ];
  const { cohortWithHighestDay7 } = useRetentionCohorts(() => wrap(cohorts));
  assert.equal(cohortWithHighestDay7.value?.cohortWeek, '2026-W20');
});

test('6. source and updatedAt passthrough per WP-203 §Composable Source Contract', () => {
  // why: WP-203 §Composable Source Contract — widgets read freshness from
  // the composable's `source` + `updatedAt`. MOCK → LIVE flip is a
  // getter-only change in WP-205.
  const { source, updatedAt } = useRetentionCohorts(() =>
    wrap([], { source: 'LIVE', updatedAt: 1_800_000_000_000 }),
  );
  assert.equal(source.value, 'LIVE');
  assert.equal(updatedAt.value, 1_800_000_000_000);
});

test('7. Mock determinism: mockRetentionCohorts(cohortCount, nowMs) is a pure function of inputs', () => {
  // why: WP-203 §Determinism scope — mock output is a pure function of
  // `cohortCount` (for retention) and `nowMs`. Call twice with identical
  // inputs and assert deep equality. No system clock / env / iteration-
  // order dependence may influence shape.
  const first = mockRetentionCohorts(8, 1_750_000_000_000);
  const second = mockRetentionCohorts(8, 1_750_000_000_000);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.source, 'MOCK');
  assert.equal(first.updatedAt, 1_750_000_000_000);
  assert.equal(first.data.length, 8);
});

test('8. Per-cohort zero-cohortSize contributes 0 (not NaN) to the average', () => {
  // why: D-19908 numeric-zero semantics — a cohort with `cohortSize === 0`
  // is a real (though degenerate) operator state. The composable's
  // per-cohort zero-denominator guard returns `0` so the cross-cohort
  // mean stays a finite number; without the guard, a single zero-size
  // cohort would propagate `NaN` across every average.
  const cohorts: readonly RetentionCohort[] = [
    cohort('2026-W18', 0, 0, 0),
    cohort('2026-W19', 100, 50, 25),
  ];
  const { averageDay1Rate, averageDay7Rate } = useRetentionCohorts(() => wrap(cohorts));
  assert.equal(averageDay1Rate.value, 0.25);
  assert.equal(averageDay7Rate.value, 0.125);
  assert.ok(!Number.isNaN(averageDay1Rate.value));
  assert.ok(!Number.isNaN(averageDay7Rate.value));
});
