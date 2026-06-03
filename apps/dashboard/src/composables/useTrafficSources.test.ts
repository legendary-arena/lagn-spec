import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTrafficSources } from './useTrafficSources.js';
import { mockTrafficSources } from '../services/analyticsMocks.js';
import type { AcquisitionChannel, ServiceResponse, TrafficSource } from '../types/index.js';

// ============================================================================
// WP-203 / EC-231 — Sub-task B test coverage for `useTrafficSources`.
// Required ≥ 7 tests per WP-203 §Acceptance Criteria → Build / Test /
// Layer; this file contributes 8 (totals; per-channel conversion + zero-
// visitor zero-not-NaN; empty input; referential stability; source +
// updatedAt passthrough per §Composable Source Contract; series sorted
// ascending by date via Unicode code-unit comparison per §Aggregation
// rule; mock determinism per §Determinism scope).
// ============================================================================

function wrap(
  data: readonly TrafficSource[],
  overrides: Partial<Pick<ServiceResponse<readonly TrafficSource[]>, 'source' | 'updatedAt'>> = {},
): ServiceResponse<readonly TrafficSource[]> {
  return {
    data,
    source: 'MOCK',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function entry(
  channel: AcquisitionChannel,
  date: string,
  visitorCount: number,
  signupCount: number,
): TrafficSource {
  return { channel, date, visitorCount, signupCount };
}

test('1. totalVisitors and totalSignups sum across every entry in the series', () => {
  const series: readonly TrafficSource[] = [
    entry('direct', '2026-06-01', 100, 5),
    entry('search', '2026-06-01', 50, 2),
    entry('referral', '2026-06-01', 30, 3),
    entry('paid', '2026-06-01', 20, 1),
    entry('direct', '2026-06-02', 120, 7),
  ];
  const { totalVisitors, totalSignups } = useTrafficSources(() => wrap(series));
  assert.equal(totalVisitors.value, 100 + 50 + 30 + 20 + 120);
  assert.equal(totalSignups.value, 5 + 2 + 3 + 1 + 7);
});

test('2. totalsByChannel aggregates per-channel visitor counts (canonical-array iteration)', () => {
  const series: readonly TrafficSource[] = [
    entry('direct', '2026-06-01', 100, 5),
    entry('direct', '2026-06-02', 150, 8),
    entry('search', '2026-06-01', 50, 2),
    entry('referral', '2026-06-01', 30, 3),
    entry('paid', '2026-06-01', 20, 1),
  ];
  const { totalsByChannel } = useTrafficSources(() => wrap(series));
  assert.equal(totalsByChannel.value.direct, 250);
  assert.equal(totalsByChannel.value.search, 50);
  assert.equal(totalsByChannel.value.referral, 30);
  assert.equal(totalsByChannel.value.paid, 20);
});

test('3. signupConversionByChannel returns signups/visitors and 0 (not NaN) for zero-visitor channels', () => {
  // why: D-19908 numeric-zero semantics — zero-visitor channels are a real
  // operator state (no `paid` campaign that day), not a missing-data state.
  // `NaN%` rendering is a top-listed Pre-Commit Failure Smell.
  const series: readonly TrafficSource[] = [
    entry('direct', '2026-06-01', 100, 10),
    entry('search', '2026-06-01', 200, 8),
    entry('referral', '2026-06-01', 50, 5),
    // No `paid` entries at all → zero visitors → conversion must be 0.
  ];
  const { signupConversionByChannel } = useTrafficSources(() => wrap(series));
  assert.equal(signupConversionByChannel.value.direct, 0.1);
  assert.equal(signupConversionByChannel.value.search, 0.04);
  assert.equal(signupConversionByChannel.value.referral, 0.1);
  assert.equal(signupConversionByChannel.value.paid, 0);
  assert.ok(!Number.isNaN(signupConversionByChannel.value.paid));
});

test('4. Empty input series returns zeroed totals and zeroed per-channel conversion', () => {
  const { totalVisitors, totalSignups, totalsByChannel, signupConversionByChannel } = useTrafficSources(
    () => wrap([]),
  );
  assert.equal(totalVisitors.value, 0);
  assert.equal(totalSignups.value, 0);
  assert.equal(totalsByChannel.value.direct, 0);
  assert.equal(totalsByChannel.value.search, 0);
  assert.equal(totalsByChannel.value.referral, 0);
  assert.equal(totalsByChannel.value.paid, 0);
  assert.equal(signupConversionByChannel.value.direct, 0);
  assert.equal(signupConversionByChannel.value.search, 0);
  assert.equal(signupConversionByChannel.value.referral, 0);
  assert.equal(signupConversionByChannel.value.paid, 0);
});

test('5. Referential stability: composable does not mutate the input series', () => {
  // why: D-19607 Shared Source Contract carry-forward — multiple widgets
  // may share the same upstream response. Mutation here would corrupt
  // sibling widgets' views.
  const series: readonly TrafficSource[] = [
    entry('direct', '2026-06-01', 100, 5),
    entry('search', '2026-06-02', 50, 2),
  ];
  const snapshot = [...series];
  const { totalVisitors, totalsByChannel } = useTrafficSources(() => wrap(series));
  void totalVisitors.value;
  void totalsByChannel.value;
  assert.deepEqual(series, snapshot);
});

test('6. source and updatedAt passthrough per WP-203 §Composable Source Contract', () => {
  // why: WP-203 §Composable Source Contract — widgets read freshness from
  // the composable's `source` + `updatedAt`, NOT directly from the
  // service layer. This passthrough is the MOCK → LIVE flip seam: when
  // WP-205 wires real endpoints, the getter switches and the composable
  // automatically surfaces the new `source` value without widget churn.
  const { source, updatedAt } = useTrafficSources(() =>
    wrap([], { source: 'LIVE', updatedAt: 1_800_000_000_000 }),
  );
  assert.equal(source.value, 'LIVE');
  assert.equal(updatedAt.value, 1_800_000_000_000);
});

test('7. series passes through pre-sorted ascending-by-date input (no re-sort, no mutation)', () => {
  // why: WP-203 §Aggregation rule — series sorted ascending by date via
  // Unicode code-unit comparison; the mock factory pre-sorts so the
  // composable does NOT re-sort. The composable passes through; the
  // monotonic-date order asserted below proves the contract end-to-end.
  // YYYY-MM-DD sorts correctly under code-unit comparison; the assertion
  // below uses bare `<` (no `localeCompare`) per D-19605 / D-19904.
  const response = mockTrafficSources('14d', 1_750_000_000_000);
  const { series } = useTrafficSources(() => response);
  const result = series.value;
  assert.ok(result.length > 0);
  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    const previous = result[i - 1];
    if (current === undefined || previous === undefined) {
      continue;
    }
    assert.ok(current.date >= previous.date, `Series not ascending by date at index ${i}: ${previous.date} → ${current.date}`);
  }
});

test('8. Mock determinism: identical inputs to mockTrafficSources produce byte-identical output', () => {
  // why: D-19605 mock-determinism contract + WP-203 §Determinism scope —
  // same `(range, nowMs)` input → byte-identical output across two
  // consecutive calls. FNV-1a seed via `hashRange`; canonical iteration
  // via `ACQUISITION_CHANNELS`. Determinism is the operator-UX invariant
  // (no flicker on date-range change).
  const first = mockTrafficSources('14d', 1_750_000_000_000);
  const second = mockTrafficSources('14d', 1_750_000_000_000);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.source, 'MOCK');
  assert.equal(second.source, 'MOCK');
  assert.equal(first.updatedAt, 1_750_000_000_000);
});
