// why: WP-204 / EC-232 + D-20403 + WP-196 `revenueDeductions.ts` precedent —
// this file locks the SHAPE of the per-vendor monthly cost-budget config
// (per-vendor `monthlyBudgetCents` + `toleranceRatio` + `isMock` flag),
// NOT the values. The placeholder numbers below reflect rough order-of-
// magnitude estimates so the cost-watchdog widget renders meaningful
// status chips in mock mode; real values require operator + finance
// review and a separate follow-up WP. Every entry carries the mock
// flag per the deferral pattern from `revenueDeductions.ts`; the
// `InfraCostWatchdogWidget` reads this flag (transitively via the
// composable's `source` passthrough) as the source of truth for the
// `MOCK` freshness badge label.

import type { InfraCostVendor } from '../types/index.js';
import { INFRA_COST_VENDORS } from '../types/index.js';

/**
 * Per-vendor monthly USD cost-budget config consumed by
 * `useInfraCostWatchdog` to derive the cost-watchdog status chip.
 * `monthlyBudgetCents` is the integer-cents budget (per D-19601
 * integer-cents discipline carry-forward). `toleranceRatio` is a
 * decimal fraction expressing the over-target band size as a fraction
 * of `monthlyBudgetCents`; the composable converts to cents at call
 * time via `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`
 * and passes the resulting `KpiSnapshot` to `computeKpiStatus()`. With
 * `direction: 'lower-is-better'` and `toleranceRatio = 0.20`:
 * `mtd <= budget` → `'on-track'`; `budget < mtd <= budget * 1.20` →
 * `'needs-attention'`; `mtd > budget * 1.20` → `'off-track'`.
 */
export interface InfraCostBudget {
  readonly vendor: InfraCostVendor;
  readonly monthlyBudgetCents: number;
  readonly toleranceRatio: number;
  readonly isMock: boolean;
}

// why: WP-204 §Cost-budget config + D-20403 — placeholder per-vendor
// budgets. Order matches `INFRA_COST_VENDORS` canonical iteration so
// the widget's 4-card grid renders in the locked render/cloudflare/
// postgres/hanko sequence. Uniform `toleranceRatio: 0.20` (20%
// over-budget band before `'off-track'` fires) across all four vendors
// in v1 per D-20403 — per-vendor tuning (tighter band on highest-spend
// vendor; seasonal adjustments) is a future finance-loop WP. All
// entries carry the mock flag; the `InfraCostWatchdogWidget` reads
// this flag (via composable source passthrough) as the MOCK badge
// source of truth — mirrors WP-196 `revenueDeductions.ts` (`isMock:
// true` until the finance review flips it).
export const INFRA_COST_BUDGETS: readonly InfraCostBudget[] = [
  // why: D-20403 — `render` placeholder $100/mo (10000 cents). Render hosts
  // the game server; the v1 budget reflects a single web-service free-to-
  // standard transition with no autoscaling yet. Real number set by finance.
  { vendor: 'render', monthlyBudgetCents: 10000, toleranceRatio: 0.20, isMock: true },
  // why: D-20403 — `cloudflare` placeholder $50/mo (5000 cents). Covers
  // Pages + R2 reads + Workers in v1; multi-product split is future.
  { vendor: 'cloudflare', monthlyBudgetCents: 5000, toleranceRatio: 0.20, isMock: true },
  // why: D-20403 — `postgres` placeholder $30/mo (3000 cents). Reflects
  // a single managed-Postgres instance at the smallest tier; tier
  // changes await operator review.
  { vendor: 'postgres', monthlyBudgetCents: 3000, toleranceRatio: 0.20, isMock: true },
  // why: D-20403 — `hanko` placeholder $25/mo (2500 cents). Identity
  // provider baseline; per-MAU pricing scales post-launch.
  { vendor: 'hanko', monthlyBudgetCents: 2500, toleranceRatio: 0.20, isMock: true },
];

// why: drift-check at module load — if `INFRA_COST_BUDGETS` falls out of
// sync with `INFRA_COST_VENDORS` (mid-edit error: vendor appended to
// the union+array but not added here, or added here but not to the
// canonical array), surface it loudly. Two assertions: same length;
// every vendor in canonical order maps to the corresponding budget
// entry. Mirrors the WP-198 KPI_STATUSES drift discipline at the
// config-array level.
if (INFRA_COST_BUDGETS.length !== INFRA_COST_VENDORS.length) {
  throw new Error(
    `INFRA_COST_BUDGETS length (${INFRA_COST_BUDGETS.length}) does not match INFRA_COST_VENDORS length (${INFRA_COST_VENDORS.length}); update both when adding or removing a vendor.`,
  );
}
for (let i = 0; i < INFRA_COST_VENDORS.length; i++) {
  const expectedVendor = INFRA_COST_VENDORS[i];
  const budgetEntry = INFRA_COST_BUDGETS[i];
  if (budgetEntry === undefined || budgetEntry.vendor !== expectedVendor) {
    throw new Error(
      `INFRA_COST_BUDGETS[${i}].vendor (${budgetEntry?.vendor ?? 'undefined'}) does not match INFRA_COST_VENDORS[${i}] (${expectedVendor}); INFRA_COST_BUDGETS must list vendors in canonical INFRA_COST_VENDORS order.`,
    );
  }
}
