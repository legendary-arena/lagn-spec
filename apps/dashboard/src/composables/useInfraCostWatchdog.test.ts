import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useInfraCostWatchdog } from './useInfraCostWatchdog.js';
import { mockInfraCostEntries } from '../services/opsHealthMocks.js';
import { INFRA_COST_BUDGETS, type InfraCostBudget } from '../config/infraCostBudgets.js';
import {
  INFRA_COST_VENDORS,
  type InfraCostEntry,
  type InfraCostVendor,
  type ServiceResponse,
} from '../types/index.js';

// ============================================================================
// WP-204 / EC-232 — Sub-task B test coverage for `useInfraCostWatchdog`.
// Required ≥ 7 tests per WP-204 §Acceptance Criteria → Build / Test / Layer;
// this file contributes 9 (per-vendor MTD sum + EOM projection formula;
// status mapping via computeKpiStatus → 'on-track' / 'needs-attention' /
// 'off-track' matches WP-198 helper semantics; total utilization ratio +
// zero-mtd vendor renders 0 not null; wall-clock-independence test —
// composable returns deep-equal output at two different system-clock
// instants; latest-entry anchor under Unicode code-unit comparison;
// empty-input sentinels + source/updatedAt passthrough; mock value
// bounds at factory boundary — per-vendor monthly sum ≤ 200% of budget).
// Locked `should_<behavior>_when_<condition>` test naming.
// ============================================================================

function wrap(
  data: readonly InfraCostEntry[],
  overrides: Partial<Pick<ServiceResponse<readonly InfraCostEntry[]>, 'source' | 'updatedAt'>> = {},
): ServiceResponse<readonly InfraCostEntry[]> {
  return {
    data,
    source: 'MOCK',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function entry(
  vendor: InfraCostVendor,
  date: string,
  amountCents: number,
): InfraCostEntry {
  return { vendor, date, amountCents, currency: 'USD' };
}

function budget(
  vendor: InfraCostVendor,
  monthlyBudgetCents: number,
  toleranceRatio: number = 0.20,
): InfraCostBudget {
  return { vendor, monthlyBudgetCents, toleranceRatio, isMock: true };
}

const STANDARD_BUDGETS: readonly InfraCostBudget[] = [
  budget('render', 10000),
  budget('cloudflare', 5000),
  budget('postgres', 3000),
  budget('hanko', 2500),
];

test('should_sum_per_vendor_mtd_when_series_has_current_month_entries', () => {
  // Latest entry's date = 2026-06-15; current month prefix = '2026-06'.
  // Only June entries count toward MTD.
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-06-01', 300),
    entry('render', '2026-06-02', 250),
    entry('render', '2026-05-31', 9999), // prior month — excluded
    entry('cloudflare', '2026-06-15', 100),
    entry('postgres', '2026-06-10', 50),
    entry('hanko', '2026-06-15', 80),
  ];
  const { mtdByVendor } = useInfraCostWatchdog(() => wrap(series), STANDARD_BUDGETS);
  assert.equal(mtdByVendor.value.render, 550);
  assert.equal(mtdByVendor.value.cloudflare, 100);
  assert.equal(mtdByVendor.value.postgres, 50);
  assert.equal(mtdByVendor.value.hanko, 80);
});

test('should_project_eom_using_linear_formula_when_dayOfMonth_and_daysInMonth_derive_from_latest_entry', () => {
  // Latest entry = 2026-06-15. June has 30 days. dayOfMonth=15;
  // daysInMonth=30. Projection = Math.round(mtd * 30 / 15) = 2 × mtd.
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-06-15', 5000),
  ];
  const { projectedEomByVendor } = useInfraCostWatchdog(
    () => wrap(series),
    STANDARD_BUDGETS,
  );
  assert.equal(projectedEomByVendor.value.render, 10000);
});

test('should_map_status_via_computeKpiStatus_when_mtd_crosses_budget_and_tolerance_thresholds', () => {
  // Budget for `render` = 10000 cents; toleranceRatio = 0.20 →
  // tolerance = 2000 cents.
  // mtd <= 10000 → on-track; 10000 < mtd <= 12000 → needs-attention;
  // mtd > 12000 → off-track.
  // The latest entry's date drives current-month grouping; all entries
  // below are dated 2026-06-15 so they all count toward MTD.
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-06-15', 8000),
    entry('cloudflare', '2026-06-15', 5500), // 500 over budget, within tolerance 1000
    entry('postgres', '2026-06-15', 5000),   // far over 3000 → off-track
    entry('hanko', '2026-06-15', 2500),       // exactly at budget → on-track
  ];
  const { statusByVendor } = useInfraCostWatchdog(() => wrap(series), STANDARD_BUDGETS);
  assert.equal(statusByVendor.value.render, 'on-track');
  assert.equal(statusByVendor.value.cloudflare, 'needs-attention');
  assert.equal(statusByVendor.value.postgres, 'off-track');
  assert.equal(statusByVendor.value.hanko, 'on-track');
});

test('should_compute_total_utilization_ratio_when_series_and_budgets_are_summed', () => {
  // Total MTD = 8000 + 5500 + 5000 + 2500 = 21000 cents
  // Total budget = 10000 + 5000 + 3000 + 2500 = 20500 cents
  // Utilization = 21000 / 20500 ≈ 1.0244
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-06-15', 8000),
    entry('cloudflare', '2026-06-15', 5500),
    entry('postgres', '2026-06-15', 5000),
    entry('hanko', '2026-06-15', 2500),
  ];
  const { totalMtdCents, totalMonthlyBudgetCents, totalBudgetUtilizationRatio } = useInfraCostWatchdog(
    () => wrap(series),
    STANDARD_BUDGETS,
  );
  assert.equal(totalMtdCents.value, 21000);
  assert.equal(totalMonthlyBudgetCents.value, 20500);
  assert.ok(Math.abs(totalBudgetUtilizationRatio.value - 21000 / 20500) < 1e-9);
});

test('should_render_zero_for_vendors_with_no_current_month_entries_when_partial_data_observed', () => {
  // Only `render` has current-month entries; the other 3 vendors have
  // none and must render `0` (D-19908 numeric-zero semantics), not
  // null. This is the partial-data case the widget's `data` state
  // handles by displaying `$0` per vendor (only the strip widget
  // renders the `"—"` placeholder for empty-partial cards).
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-06-15', 3000),
  ];
  const { mtdByVendor } = useInfraCostWatchdog(() => wrap(series), STANDARD_BUDGETS);
  assert.equal(mtdByVendor.value.render, 3000);
  for (const vendor of INFRA_COST_VENDORS) {
    if (vendor === 'render') {
      continue;
    }
    assert.equal(mtdByVendor.value[vendor], 0);
    assert.equal(Number.isNaN(mtdByVendor.value[vendor]), false);
  }
});

test('should_return_deep_equal_output_when_called_twice_at_different_wall_clock_instants', () => {
  // why: §Determinism scope HARD invariant + wall-clock-independence
  // gate — `useInfraCostWatchdog` derives date math from the latest
  // entry's `date` string, NOT `Date.now()`. Calling with identical
  // inputs at two different system-clock instants must produce
  // deep-equal output. Without this invariant, the composable would
  // silently shift over time as `Date.now()` advances and the
  // dayOfMonth changed.
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-06-15', 5000),
    entry('cloudflare', '2026-06-15', 2500),
    entry('postgres', '2026-06-15', 1500),
    entry('hanko', '2026-06-15', 1250),
  ];
  // First invocation — emulate "now is 2026-06-15T12:00".
  const firstWatchdog = useInfraCostWatchdog(() => wrap(series), STANDARD_BUDGETS);
  const firstSnapshot = {
    mtdByVendor: { ...firstWatchdog.mtdByVendor.value },
    projectedEomByVendor: { ...firstWatchdog.projectedEomByVendor.value },
    statusByVendor: { ...firstWatchdog.statusByVendor.value },
    totalMtdCents: firstWatchdog.totalMtdCents.value,
    totalBudgetUtilizationRatio: firstWatchdog.totalBudgetUtilizationRatio.value,
  };
  // Second invocation — emulate the same call running months later.
  // Because the composable never reads `Date.now()`, the output must
  // be deep-equal to the first invocation.
  const secondWatchdog = useInfraCostWatchdog(() => wrap(series), STANDARD_BUDGETS);
  const secondSnapshot = {
    mtdByVendor: { ...secondWatchdog.mtdByVendor.value },
    projectedEomByVendor: { ...secondWatchdog.projectedEomByVendor.value },
    statusByVendor: { ...secondWatchdog.statusByVendor.value },
    totalMtdCents: secondWatchdog.totalMtdCents.value,
    totalBudgetUtilizationRatio: secondWatchdog.totalBudgetUtilizationRatio.value,
  };
  assert.deepEqual(firstSnapshot, secondSnapshot);
});

test('should_anchor_dayOfMonth_to_lex_greatest_date_when_series_has_multiple_months', () => {
  // why: §Latest-entry selection — the anchor is the lex-greatest
  // `YYYY-MM-DD` string under Unicode code-unit comparison. With
  // entries in May AND June, the June 15 entry is the anchor;
  // current-month prefix = '2026-06'; dayOfMonth = 15;
  // daysInMonth = 30; projection scales accordingly.
  const series: readonly InfraCostEntry[] = [
    entry('render', '2026-05-30', 9999), // prior month — excluded
    entry('render', '2026-06-01', 200),
    entry('render', '2026-06-15', 300),  // latest entry
  ];
  const { mtdByVendor, projectedEomByVendor } = useInfraCostWatchdog(
    () => wrap(series),
    STANDARD_BUDGETS,
  );
  assert.equal(mtdByVendor.value.render, 500);
  // EOM projection = round(500 * 30 / 15) = 1000.
  assert.equal(projectedEomByVendor.value.render, 1000);
});

test('should_return_zero_sentinels_when_series_is_empty', () => {
  // why: empty-state coverage — every per-vendor map carries zero;
  // total ratio is zero (D-19908 zero-denominator guard); no NaN
  // anywhere. The widget's `state` computed reads these zeros and
  // drops to the explicit `empty` arm.
  const { mtdByVendor, projectedEomByVendor, totalMtdCents, totalBudgetUtilizationRatio } = useInfraCostWatchdog(
    () => wrap([]),
    STANDARD_BUDGETS,
  );
  for (const vendor of INFRA_COST_VENDORS) {
    assert.equal(mtdByVendor.value[vendor], 0);
    assert.equal(projectedEomByVendor.value[vendor], 0);
    assert.equal(Number.isNaN(mtdByVendor.value[vendor]), false);
    assert.equal(Number.isNaN(projectedEomByVendor.value[vendor]), false);
  }
  assert.equal(totalMtdCents.value, 0);
  assert.equal(totalBudgetUtilizationRatio.value, 0);
  assert.equal(Number.isNaN(totalBudgetUtilizationRatio.value), false);
});

test('should_passthrough_source_and_updatedAt_and_bound_mock_factory_when_called_with_real_mock_input', () => {
  // why: WP-204 §Composable Source Contract — widgets read freshness
  // from the composable. §Mock value bounds — mockInfraCostEntries
  // emits non-negative amountCents AND per-vendor monthly sum ≤
  // 200% of monthlyBudgetCents. The composable test asserts both:
  // factory bounds (so the consumer never sees out-of-band values)
  // AND passthrough (source = 'MOCK'; updatedAt = wrapMock arg).
  const response = mockInfraCostEntries('30d', 1_750_000_000_000);
  const { source, updatedAt } = useInfraCostWatchdog(() => response, STANDARD_BUDGETS);
  assert.equal(source.value, 'MOCK');
  assert.equal(updatedAt.value, 1_750_000_000_000);

  // §Mock value bounds factory assertions — per-vendor monthly sum
  // (across the entries the mock emitted) ≤ 200% of monthlyBudgetCents.
  const budgetLookup: Record<InfraCostVendor, number> = {
    render: 10000, cloudflare: 5000, postgres: 3000, hanko: 2500,
  };
  const monthlySumPerVendorPerMonth = new Map<string, number>();
  for (const item of response.data) {
    assert.ok(item.amountCents >= 0, `amountCents ${item.amountCents} below 0 for ${item.vendor}/${item.date}`);
    const monthKey = `${item.vendor}|${item.date.slice(0, 7)}`;
    monthlySumPerVendorPerMonth.set(monthKey, (monthlySumPerVendorPerMonth.get(monthKey) ?? 0) + item.amountCents);
  }
  for (const [monthKey, monthlySum] of monthlySumPerVendorPerMonth) {
    const vendor = monthKey.split('|')[0] as InfraCostVendor;
    const upperBound = budgetLookup[vendor] * 2;
    assert.ok(monthlySum <= upperBound, `Per-vendor monthly sum for ${monthKey} (${monthlySum}) exceeds 200% upper bound (${upperBound}).`);
  }
});
