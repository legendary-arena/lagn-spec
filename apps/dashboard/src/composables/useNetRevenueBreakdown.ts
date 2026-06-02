import { computed, type ComputedRef } from 'vue';
import type { DailyMetric, NetRevenueSeries } from '../types/index.js';
import type { RevenueDeductionConfig } from '../config/revenueDeductions.js';

export interface UseNetRevenueBreakdownReturn {
  series: ComputedRef<NetRevenueSeries>;
  totalGross: ComputedRef<number>;
  totalNet: ComputedRef<number>;
  netMarginRatio: ComputedRef<number>;
}

/**
 * Source representation for the gross-revenue input. The composable accepts
 * either the canonical `DailyMetric` array used by `fetchRevenueHistory` or
 * the raw integer-cents accessor required by the per-day formula. Either
 * shape is normalized internally into the `{ date, grossCents }` pair.
 */
export interface GrossDailyInput {
  readonly date: string;
  readonly grossCents: number;
}

function isGrossDailyInput(point: DailyMetric | GrossDailyInput): point is GrossDailyInput {
  return typeof (point as GrossDailyInput).grossCents === 'number';
}

/**
 * Derive the four-bucket net-revenue breakdown from a gross daily series.
 *
 * Every money computation runs in **integer cents**. Per-day rounding uses
 * `Math.round` — round half toward +∞ / asymmetric half-up (NOT banker's
 * round-half-to-even). The composable exposes the per-day series plus
 * three aggregates (`totalGross`, `totalNet`, `netMarginRatio`).
 *
 * Negative-net days are preserved as-is; they are a real signal (gross too
 * small to cover the fixed Stripe per-transaction fee on that day). The
 * widget surfaces negative days explicitly via tooltip labelling.
 *
 * The input series is treated as read-only at every internal site; callers
 * may reuse the same reference across multiple widgets without observing
 * mutation.
 */
export function useNetRevenueBreakdown(
  grossSeries: () => readonly (DailyMetric | GrossDailyInput)[],
  deductions: () => RevenueDeductionConfig,
): UseNetRevenueBreakdownReturn {
  const series = computed<NetRevenueSeries>(() => {
    // why: input series is read-only — the same mock store may be shared
    // across multiple revenue widgets per D-19607. Building fresh local
    // arrays here (rather than mutating the input) prevents one widget
    // from corrupting another's view.
    const input = grossSeries();
    const config = deductions();
    const dates: string[] = [];
    const gross: number[] = [];
    const royalty: number[] = [];
    const stripeFees: number[] = [];
    const infraCogs: number[] = [];
    const net: number[] = [];

    for (const point of input) {
      const grossCents = isGrossDailyInput(point) ? point.grossCents : point.value;
      // why: D-19601 (Net Revenue Four-Bucket Decomposition + Integer-Cents
      // Discipline) — per-day rounding uses `Math.round`, which is round
      // half toward +∞ / asymmetric half-up. This is NOT banker's
      // round-half-to-even. The integer-cents discipline avoids the
      // floating-point rounding drift that surfaces when monthly totals
      // are summed from floating-point dailies. Every money value above
      // and below is integer cents.
      const royaltyCents = Math.round(grossCents * config.royaltyPercent);
      const stripeFeesCents =
        Math.round(grossCents * config.stripeFeePercent) + config.stripeFeeFixedCents;
      const infraCogsCents = Math.round(grossCents * config.infraCogsPercent);
      const netCents = grossCents - royaltyCents - stripeFeesCents - infraCogsCents;

      dates.push(point.date);
      gross.push(grossCents);
      royalty.push(royaltyCents);
      stripeFees.push(stripeFeesCents);
      infraCogs.push(infraCogsCents);
      net.push(netCents);
    }

    return { dates, gross, royalty, stripeFees, infraCogs, net };
  });

  const totalGross = computed(() => {
    // why: D-19604 (Aggregation Derivation Rule) — aggregates derive ONLY
    // from summing the already-rounded per-day arrays. Recomputing from
    // raw inputs (e.g., `Math.round(rawSum * royaltyPercent)`) is FAIL;
    // chart totals, tooltip totals, and table totals would diverge by a
    // few cents at month boundaries and the operator could not tell
    // which display was authoritative. The single derivation direction
    // (per-day rounded → summed) means every downstream display traces
    // to the same source.
    let sum = 0;
    for (const value of series.value.gross) {
      sum += value;
    }
    return sum;
  });

  const totalNet = computed(() => {
    let sum = 0;
    for (const value of series.value.net) {
      sum += value;
    }
    return sum;
  });

  const netMarginRatio = computed(() => {
    // why: D-19604 (Numerical Integrity Guard) — this is the only division
    // in the composable, producing the ratio for display. The result
    // MUST NOT be re-multiplied into a money value downstream; ratios
    // are display-only. The zero-denominator branch returns `0`
    // explicitly so `NaN` never reaches the renderer or the widget's
    // operator-interpretation footer.
    const grossTotal = totalGross.value;
    if (grossTotal === 0) {
      return 0;
    }
    return totalNet.value / grossTotal;
  });

  return { series, totalGross, totalNet, netMarginRatio };
}
