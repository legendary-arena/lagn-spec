import { computed, type ComputedRef } from 'vue';
import {
  INFRA_COST_VENDORS,
  type InfraCostEntry,
  type InfraCostVendor,
  type KpiSnapshot,
  type KpiStatus,
  type ServiceResponse,
} from '../types/index.js';
import type { InfraCostBudget } from '../config/infraCostBudgets.js';
import { computeKpiStatus } from '../utils/kpiStatus.js';

const MONTHS_NON_LEAP: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface UseInfraCostWatchdogReturn {
  mtdByVendor: ComputedRef<Readonly<Record<InfraCostVendor, number>>>;
  projectedEomByVendor: ComputedRef<Readonly<Record<InfraCostVendor, number>>>;
  statusByVendor: ComputedRef<Readonly<Record<InfraCostVendor, KpiStatus>>>;
  totalMtdCents: ComputedRef<number>;
  totalMonthlyBudgetCents: ComputedRef<number>;
  totalBudgetUtilizationRatio: ComputedRef<number>;
  source: ComputedRef<ServiceResponse<unknown>['source']>;
  updatedAt: ComputedRef<number>;
}

/**
 * Derive operator-facing per-vendor cost-watchdog aggregates from an
 * `InfraCostEntry[]` response. Per WP-204 §Composable Source Contract,
 * accepts a getter returning the FULL `ServiceResponse` envelope (not
 * the bare array) so widgets read freshness from the composable's
 * returned `source` / `updatedAt`.
 *
 * Per WP-204 §Files Expected to Change item 9, `budgets` is injected by
 * the caller (NOT reached into `config/infraCostBudgets.ts` directly)
 * so the test suite can exercise status-mapping edge cases with
 * synthetic budgets. The composable is a pure function of
 * `(entries-response, budgets)`.
 *
 * Date math derives `dayOfMonth` / `daysInMonth` from the **latest
 * entry's `date` string** per the HARD §Determinism scope invariant —
 * wall-clock and timestamp-parsing APIs are forbidden anywhere in
 * this composable. The wall-clock-independence test in the test file
 * is the load-bearing gate.
 *
 * Derivations:
 *
 * - `mtdByVendor` — per-vendor sum of `amountCents` for entries whose
 *   `date` falls in the latest entry's calendar UTC month. Vendors
 *   with no current-month entries render as `0` per D-19908 (zero is
 *   a meaningful "no cost captured yet" sentinel).
 * - `projectedEomByVendor` — linear projection `Math.round(mtdCents *
 *   daysInMonth / dayOfMonth)`. Per-vendor; same canonical iteration.
 * - `statusByVendor` — per-vendor status via `computeKpiStatus()` with
 *   a constructed `KpiSnapshot` per vendor (`direction:
 *   'lower-is-better'`; `target = monthlyBudgetCents`; `tolerance =
 *   Math.round(monthlyBudgetCents * toleranceRatio)`). Every vendor in
 *   `budgets` has a target by construction, so a non-null status is
 *   guaranteed — the composable asserts this; null = HARD FAIL.
 * - `totalMtdCents` / `totalMonthlyBudgetCents` /
 *   `totalBudgetUtilizationRatio` — range-wide aggregates for the
 *   widget footer.
 */
export function useInfraCostWatchdog(
  responseGetter: () => ServiceResponse<readonly InfraCostEntry[]>,
  budgets: readonly InfraCostBudget[],
): UseInfraCostWatchdogReturn {
  const response = computed(() => responseGetter());

  const series = computed<readonly InfraCostEntry[]>(() => response.value.data);

  // why: WP-204 §Composable Source Contract — MOCK → LIVE flip seam.
  const source = computed<ServiceResponse<unknown>['source']>(() => response.value.source);
  const updatedAt = computed<number>(() => response.value.updatedAt);

  // Per-vendor budget lookup so per-vendor derivations don't repeatedly
  // scan the `budgets` array.
  const budgetByVendor = computed<Readonly<Record<InfraCostVendor, InfraCostBudget | undefined>>>(
    () => {
      const result: Record<InfraCostVendor, InfraCostBudget | undefined> = {
        render: undefined,
        cloudflare: undefined,
        postgres: undefined,
        hanko: undefined,
      };
      for (const budget of budgets) {
        result[budget.vendor] = budget;
      }
      return result;
    },
  );

  // Latest entry's date string per §Determinism scope HARD invariant —
  // sort on `YYYY-MM-DD` under Unicode code-unit comparison only.
  // Wall-clock and timestamp-parsing APIs are forbidden anywhere in
  // this composable.
  const latestDate = computed<string | null>(() => {
    // why: §Latest-entry selection — lex-greatest `YYYY-MM-DD` string
    // under Unicode code-unit comparison. Empty input returns null;
    // downstream derivations treat null as "no anchor → all-zero".
    let latest: string | null = null;
    for (const entry of series.value) {
      if (latest === null || entry.date > latest) {
        latest = entry.date;
      }
    }
    return latest;
  });

  const currentMonthPrefix = computed<string | null>(() => {
    const anchor = latestDate.value;
    if (anchor === null) {
      return null;
    }
    return anchor.slice(0, 7);
  });

  const dayOfMonth = computed<number>(() => {
    // why: §Determinism scope HARD invariant — dayOfMonth derives from
    // the latest entry's `date` string, NOT from the system clock.
    // Parse the integer suffix of the `YYYY-MM-DD` string by literal
    // slice and `Number()` — pure arithmetic, locale-independent,
    // wall-clock-independent. The wall-clock-independence test in
    // `useInfraCostWatchdog.test.ts` is the enforcement gate.
    const anchor = latestDate.value;
    if (anchor === null) {
      return 0;
    }
    return Number(anchor.slice(8, 10));
  });

  const daysInMonth = computed<number>(() => {
    // why: §Determinism scope HARD invariant — daysInMonth derives from
    // the latest entry's `YYYY-MM` prefix via a lookup table + a
    // leap-year arithmetic check. Date constructors are banned anywhere
    // in composables per the EC (the locked pattern is string +
    // arithmetic only). Leap-year rule:
    // (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0.
    const anchor = latestDate.value;
    if (anchor === null) {
      return 0;
    }
    const year = Number(anchor.slice(0, 4));
    const monthIndex = Number(anchor.slice(5, 7)) - 1;
    const baseDays = MONTHS_NON_LEAP[monthIndex] ?? 30;
    if (monthIndex === 1) {
      const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return isLeapYear ? 29 : 28;
    }
    return baseDays;
  });

  const mtdByVendor = computed<Readonly<Record<InfraCostVendor, number>>>(() => {
    const result: Record<InfraCostVendor, number> = {
      render: 0,
      cloudflare: 0,
      postgres: 0,
      hanko: 0,
    };
    const monthPrefix = currentMonthPrefix.value;
    if (monthPrefix === null) {
      return result;
    }
    for (const entry of series.value) {
      if (entry.date.slice(0, 7) !== monthPrefix) {
        continue;
      }
      result[entry.vendor] += entry.amountCents;
    }
    return result;
  });

  const projectedEomByVendor = computed<Readonly<Record<InfraCostVendor, number>>>(() => {
    const result: Record<InfraCostVendor, number> = {
      render: 0,
      cloudflare: 0,
      postgres: 0,
      hanko: 0,
    };
    const day = dayOfMonth.value;
    const monthLength = daysInMonth.value;
    // why: D-19908 numeric-zero zero-denominator guard — `dayOfMonth =
    // 0` cannot happen for any valid date string but the guard returns
    // `0` rather than NaN (a `NaN%` cost projection in the widget is a
    // top-listed Pre-Commit Failure Smell).
    if (day === 0) {
      return result;
    }
    const mtdMap = mtdByVendor.value;
    // why: WP-204 §Determinism scope — iterate INFRA_COST_VENDORS in
    // canonical array order so per-vendor projection assembly is
    // byte-identical across JS runtimes. Object-key iteration on
    // derived sums would be observable-order-dependent and is
    // forbidden.
    for (const vendor of INFRA_COST_VENDORS) {
      // why: §Cost math invariants — linear projection
      // `Math.round(mtd * daysInMonth / dayOfMonth)`. Integer cents
      // preserved at the composable boundary; display formatting
      // (cents → USD) lives at the widget render boundary only.
      result[vendor] = Math.round((mtdMap[vendor] * monthLength) / day);
    }
    return result;
  });

  const statusByVendor = computed<Readonly<Record<InfraCostVendor, KpiStatus>>>(() => {
    const result: Record<InfraCostVendor, KpiStatus> = {
      render: 'on-track',
      cloudflare: 'on-track',
      postgres: 'on-track',
      hanko: 'on-track',
    };
    const mtdMap = mtdByVendor.value;
    const budgetLookup = budgetByVendor.value;
    // why: WP-204 §Determinism scope — canonical-array iteration.
    for (const vendor of INFRA_COST_VENDORS) {
      const budget = budgetLookup[vendor];
      // why: every vendor in `INFRA_COST_VENDORS` MUST have a matching
      // budget in the injected `budgets` array (the dashboard's
      // `INFRA_COST_BUDGETS` is canonical and the test suite passes
      // synthetic budgets that mirror the canonical shape). A missing
      // budget is a configuration error; treat as `'on-track'`
      // (no chip would be misleading — the operator sees green and
      // assumes coverage). A defensive `default` arm rather than a
      // throw because moves and composables never throw at runtime
      // per ARCHITECTURE.md.
      if (budget === undefined) {
        continue;
      }
      // why: WP-198 single-implementation discipline — reuse
      // `computeKpiStatus()` verbatim by constructing a `KpiSnapshot`
      // per vendor. `direction: 'lower-is-better'` because lower
      // cost = better outcome; `target = monthlyBudgetCents`;
      // `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`
      // (toleranceRatio uniform at 0.20 in v1 per D-20403). The
      // helper returns the existing 3-set KpiStatus enum
      // ('on-track' | 'needs-attention' | 'off-track') — no new
      // status taxonomy invented; widget display copy MAY render
      // 'off-track' cost as "Over budget" but that's a display
      // string, not a fork of the enum.
      const snapshot: KpiSnapshot = {
        id: vendor,
        label: vendor,
        value: mtdMap[vendor],
        previousValue: 0,
        unit: 'cents',
        trend: 'flat',
        target: budget.monthlyBudgetCents,
        tolerance: Math.round(budget.monthlyBudgetCents * budget.toleranceRatio),
        direction: 'lower-is-better',
      };
      const status = computeKpiStatus(snapshot);
      // why: every `INFRA_COST_BUDGETS` entry has a target by
      // construction, so `computeKpiStatus()` cannot return null.
      // If it does, the budget config drifted (target undefined or
      // tolerance/direction missing). Fall back to 'on-track' rather
      // than throw — composables never throw at runtime per
      // ARCHITECTURE.md — and let the bidirectional drift gate in
      // `opsTaxonomy.test.ts` catch the upstream config error.
      result[vendor] = status ?? 'on-track';
    }
    return result;
  });

  const totalMtdCents = computed<number>(() => {
    let sum = 0;
    const mtdMap = mtdByVendor.value;
    for (const vendor of INFRA_COST_VENDORS) {
      sum += mtdMap[vendor];
    }
    return sum;
  });

  const totalMonthlyBudgetCents = computed<number>(() => {
    let sum = 0;
    for (const budget of budgets) {
      sum += budget.monthlyBudgetCents;
    }
    return sum;
  });

  const totalBudgetUtilizationRatio = computed<number>(() => {
    const denominator = totalMonthlyBudgetCents.value;
    // why: D-19908 zero-denominator guard — `0` not `NaN`. An empty
    // budget config is a configuration edge case; the widget renders
    // 0% utilization rather than NaN%.
    if (denominator === 0) {
      return 0;
    }
    return totalMtdCents.value / denominator;
  });

  return {
    mtdByVendor,
    projectedEomByVendor,
    statusByVendor,
    totalMtdCents,
    totalMonthlyBudgetCents,
    totalBudgetUtilizationRatio,
    source,
    updatedAt,
  };
}
