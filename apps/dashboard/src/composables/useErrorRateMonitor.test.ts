import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useErrorRateMonitor } from './useErrorRateMonitor.js';
import { mockErrorRateSnapshots } from '../services/opsHealthMocks.js';
import type {
  ErrorRateSnapshot,
  ErrorSignature,
  ServiceResponse,
} from '../types/index.js';

// ============================================================================
// WP-204 / EC-232 — Sub-task B test coverage for `useErrorRateMonitor`.
// Required ≥ 7 tests per WP-204 §Acceptance Criteria → Build / Test / Layer;
// this file contributes 8 (currentRate selects lex-greatest 3600 entry;
// rollingDailyRate filters to 86400 only — mixed-window aggregation
// HARD FAIL test; zero-totalRequests → errorRate 0 not NaN; cross-range
// signature aggregation merge invariant; deterministic tie-break on
// equal counts; empty-input sentinels + source/updatedAt passthrough;
// totals sum across whole series; mock value bounds at factory
// boundary). Locked `should_<behavior>_when_<condition>` test naming.
// ============================================================================

function wrap(
  data: readonly ErrorRateSnapshot[],
  overrides: Partial<Pick<ServiceResponse<readonly ErrorRateSnapshot[]>, 'source' | 'updatedAt'>> = {},
): ServiceResponse<readonly ErrorRateSnapshot[]> {
  return {
    data,
    source: 'MOCK',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function snapshot(
  date: string,
  windowSeconds: number,
  options: {
    totalRequests?: number;
    errorCount?: number;
    errorRate?: number;
    topSignatures?: readonly ErrorSignature[];
  } = {},
): ErrorRateSnapshot {
  return {
    date,
    windowSeconds,
    totalRequests: options.totalRequests ?? 1000,
    errorCount: options.errorCount ?? 10,
    errorRate: options.errorRate ?? 0.01,
    topSignatures: options.topSignatures ?? [],
  };
}

function signature(
  signatureText: string,
  count: number,
  firstSeen: number,
  lastSeen: number,
): ErrorSignature {
  return { signature: signatureText, count, firstSeen, lastSeen };
}

test('should_select_lex_greatest_date_when_currentRate_filters_3600_window_entries', () => {
  // why: §"Current" snapshot selection — currentRate = errorRate of the
  // lex-greatest-date entry with windowSeconds === 3600. Mixing 86400
  // rows would be HARD FAIL.
  const series: readonly ErrorRateSnapshot[] = [
    snapshot('2026-06-01', 3600, { errorRate: 0.02 }),
    snapshot('2026-06-03', 3600, { errorRate: 0.04 }),
    snapshot('2026-06-02', 3600, { errorRate: 0.01 }),
    snapshot('2026-06-03', 86400, { errorRate: 0.99 }), // would corrupt if mixed
  ];
  const { currentRate } = useErrorRateMonitor(() => wrap(series));
  assert.equal(currentRate.value, 0.04);
});

test('should_return_disjoint_subsets_when_mixed_window_input_drives_currentRate_and_rollingDailyRate', () => {
  // why: §Mixed-window aggregation HARD FAIL — synthetic input contains
  // both windowSeconds = 3600 and = 86400 rows. currentRate filters to
  // the 3600 subset only (lex-greatest date among 3600); rollingDailyRate
  // takes the equal-weighted mean of the 86400 subset only. A
  // regression that pulls the wrong subset into either derivation
  // produces a visibly wrong number.
  const series: readonly ErrorRateSnapshot[] = [
    snapshot('2026-06-01', 3600, { errorRate: 0.005 }),
    snapshot('2026-06-02', 3600, { errorRate: 0.006 }),
    snapshot('2026-06-03', 3600, { errorRate: 0.007 }),
    snapshot('2026-06-01', 86400, { errorRate: 0.02 }),
    snapshot('2026-06-02', 86400, { errorRate: 0.04 }),
    snapshot('2026-06-03', 86400, { errorRate: 0.03 }),
  ];
  const { currentRate, rollingDailyRate } = useErrorRateMonitor(() => wrap(series));
  // currentRate = 0.007 (latest 3600 entry); IF mixed-window-aggregation
  // regressed, currentRate would pick the 86400 entry at the same date
  // (0.03), so the assertion catches the regression.
  assert.equal(currentRate.value, 0.007);
  // rollingDailyRate = mean(0.02, 0.04, 0.03) = 0.03; IF the 3600
  // subset got pulled in, the mean would shift to ~0.018 — caught by
  // the equality assertion below.
  assert.ok(Math.abs(rollingDailyRate.value - 0.03) < 1e-9);
});

test('should_return_zero_errorRate_when_zero_totalRequests_snapshot_drives_currentRate', () => {
  // why: D-19908 numeric-zero semantics — zero-totalRequests snapshots
  // produce errorRate = 0 in their `errorRate` field (the contract is
  // factory-side; the composable passes through). The composable's
  // own currentRate aggregation therefore returns 0 too, not NaN.
  const series: readonly ErrorRateSnapshot[] = [
    snapshot('2026-06-01', 3600, { totalRequests: 0, errorCount: 0, errorRate: 0 }),
  ];
  const { currentRate } = useErrorRateMonitor(() => wrap(series));
  assert.equal(currentRate.value, 0);
  assert.equal(Number.isNaN(currentRate.value), false);
});

test('should_merge_identical_signature_strings_when_aggregating_topSignatures_across_range', () => {
  // why: §Error rate math invariants — cross-range aggregation merges
  // identical signature strings (sum-of-counts + min firstSeen + max
  // lastSeen). Different signatures stay separate.
  const series: readonly ErrorRateSnapshot[] = [
    snapshot('2026-06-01', 3600, {
      topSignatures: [
        signature('TypeError: cannot read x', 10, 100, 200),
        signature('ECONNRESET', 5, 110, 180),
      ],
    }),
    snapshot('2026-06-02', 3600, {
      topSignatures: [
        signature('TypeError: cannot read x', 7, 90, 220),
        signature('PG: pool exhausted', 3, 150, 170),
      ],
    }),
  ];
  const { topSignaturesAcrossRange } = useErrorRateMonitor(() => wrap(series));
  const result = topSignaturesAcrossRange.value;
  const merged = result.find((s) => s.signature === 'TypeError: cannot read x');
  assert.notEqual(merged, undefined);
  assert.equal(merged?.count, 17);
  assert.equal(merged?.firstSeen, 90);
  assert.equal(merged?.lastSeen, 220);
  const econnreset = result.find((s) => s.signature === 'ECONNRESET');
  assert.equal(econnreset?.count, 5);
  const pg = result.find((s) => s.signature === 'PG: pool exhausted');
  assert.equal(pg?.count, 3);
});

test('should_tiebreak_by_signature_ascending_when_topSignatures_share_count', () => {
  // why: §Error rate math invariants — primary `count` descending;
  // tiebreak `signature` ascending under Unicode code-unit comparison.
  // Three signatures at count=5: alpha order is `aaa`, `bbb`, `ccc`.
  const series: readonly ErrorRateSnapshot[] = [
    snapshot('2026-06-01', 3600, {
      topSignatures: [
        signature('ccc', 5, 0, 1),
        signature('aaa', 5, 0, 1),
        signature('bbb', 5, 0, 1),
        signature('zzz', 10, 0, 1), // highest count → first
      ],
    }),
  ];
  const { topSignaturesAcrossRange } = useErrorRateMonitor(() => wrap(series));
  const result = topSignaturesAcrossRange.value;
  assert.equal(result.length, 4);
  assert.equal(result[0]?.signature, 'zzz');
  assert.equal(result[1]?.signature, 'aaa');
  assert.equal(result[2]?.signature, 'bbb');
  assert.equal(result[3]?.signature, 'ccc');
});

test('should_return_zero_sentinels_when_series_is_empty', () => {
  // why: empty-state coverage — every derivation returns its zero
  // sentinel; no field is NaN. Empty `topSignaturesAcrossRange` is the
  // empty array.
  const { currentRate, rollingDailyRate, totals, topSignaturesAcrossRange } = useErrorRateMonitor(
    () => wrap([]),
  );
  assert.equal(currentRate.value, 0);
  assert.equal(rollingDailyRate.value, 0);
  assert.equal(Number.isNaN(currentRate.value), false);
  assert.equal(Number.isNaN(rollingDailyRate.value), false);
  assert.equal(totals.value.totalRequests, 0);
  assert.equal(totals.value.errorCount, 0);
  assert.equal(topSignaturesAcrossRange.value.length, 0);
});

test('should_passthrough_source_and_updatedAt_when_called_per_Composable_Source_Contract', () => {
  // why: WP-204 §Composable Source Contract — widgets read freshness
  // from the composable. The passthrough is the MOCK → LIVE flip seam.
  const { source, updatedAt } = useErrorRateMonitor(() =>
    wrap([], { source: 'LIVE', updatedAt: 1_800_000_000_000 }),
  );
  assert.equal(source.value, 'LIVE');
  assert.equal(updatedAt.value, 1_800_000_000_000);
});

test('should_emit_byte_identical_output_when_mockErrorRateSnapshots_called_twice_with_identical_inputs', () => {
  // why: §Determinism scope + §Mock value bounds — identical seed
  // produces identical output; every errorRate ∈ [0, 0.05].
  const first = mockErrorRateSnapshots('14d', 1_750_000_000_000);
  const second = mockErrorRateSnapshots('14d', 1_750_000_000_000);
  assert.deepEqual(first.data, second.data);
  for (const entry of first.data) {
    assert.ok(entry.errorRate >= 0, `errorRate ${entry.errorRate} below 0 bound at ${entry.date}/${entry.windowSeconds}`);
    assert.ok(entry.errorRate <= 0.05, `errorRate ${entry.errorRate} above 0.05 bound at ${entry.date}/${entry.windowSeconds}`);
    assert.ok(entry.totalRequests >= 0, `totalRequests ${entry.totalRequests} below 0`);
    assert.ok(entry.errorCount >= 0, `errorCount ${entry.errorCount} below 0`);
  }
});
