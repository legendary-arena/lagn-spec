/**
 * Static four-bucket revenue-deduction config consumed by
 * `useNetRevenueBreakdown` to derive the operator's net-revenue view from
 * the gross-revenue mock series. Percentages are decimal fractions
 * (`0.20 = 20%`), never integers. The `stripeFeeFixedCents` value is added
 * AFTER the percentage component (`grossCents * stripeFeePercent`) and
 * represents Stripe's per-transaction fixed charge in integer cents.
 */
export interface RevenueDeductionConfig {
  readonly royaltyPercent: number;
  readonly stripeFeePercent: number;
  readonly stripeFeeFixedCents: number;
  readonly infraCogsPercent: number;
  readonly isMock: boolean;
}

export const REVENUE_DEDUCTIONS: RevenueDeductionConfig = {
  royaltyPercent: 0.20,
  stripeFeePercent: 0.029,
  stripeFeeFixedCents: 30,
  infraCogsPercent: 0.05,
  // why: D-19602 (Royalty Deduction Placeholder Posture) — these percentages
  // are placeholders by design. The royalty contract terms are operationally
  // sensitive and outside the scope of a client-only widget WP. Finance
  // review owns the real values; a follow-up WP swaps them in by editing
  // this single config file and flips `isMock` to `false`. The widget reads
  // this flag as the source of truth for its `MOCK` freshness badge label.
  isMock: true,
};
