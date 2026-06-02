import type { BillingHealth, DateRange, ServiceResponse } from '../types/index.js';
import { hashRange } from './hashRange.js';
import { normalizeRange } from './normalizeRange.js';

const BILLING_WINDOW_DAYS = 30;
const MS_PER_DAY = 86400000;
const WEBHOOK_RATE_MIN = 0.00;
const WEBHOOK_RATE_MAX = 0.05;
const INTENT_RATE_MIN = 0.10;
const INTENT_RATE_MAX = 0.35;
const WEBHOOK_TOTAL_MIN = 80;
const WEBHOOK_TOTAL_MAX = 240;
const INTENT_TOTAL_MIN = 30;
const INTENT_TOTAL_MAX = 120;

/**
 * Seeded PRNG (mulberry32). Pure function: identical seed produces an
 * identical infinite stream of [0, 1) values across calls, reloads, and
 * platforms. Lives inline here so the only seeded-random consumer in the
 * dashboard services layer is the billing-health mock generator; no other
 * file imports this. Bare non-seeded RNG calls are forbidden in this
 * directory per D-19605; the determinism contract requires every random
 * draw flow through this PRNG, seeded by `hashRange(normalized range)`.
 */
function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return function nextSample(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a value uniformly from `[min, max]` (inclusive both ends) using the
 * supplied seeded PRNG. The bounds are floating-point because callers
 * sample percentages; integer-bound callers round the result themselves.
 */
function sampleRange(prng: () => number, min: number, max: number): number {
  return min + (max - min) * prng();
}

/**
 * Format a UTC millisecond timestamp as `YYYY-MM-DD`.
 */
function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Compute the trailing-30-day list of dates ending on `windowEnd`
 * (inclusive). Returned in chronological order; the first element is the
 * earliest date in the window.
 */
function buildWindowDates(windowEnd: string): string[] {
  const endMs = Date.UTC(
    Number(windowEnd.slice(0, 4)),
    Number(windowEnd.slice(5, 7)) - 1,
    Number(windowEnd.slice(8, 10)),
  );
  const dates: string[] = [];
  for (let i = BILLING_WINDOW_DAYS - 1; i >= 0; i--) {
    dates.push(toIsoDate(endMs - i * MS_PER_DAY));
  }
  return dates;
}

/**
 * Per-day sparkline point: a webhook-failure or intent-abandonment rate
 * for a single day within the trailing 30-day window. Both sparklines in
 * `PaidActionErrorsWidget` plot one of these per day (exactly 30 points
 * per sparkline per D-19603 ext.).
 */
export interface BillingHealthSparklinePoint {
  readonly date: string;
  readonly rate: number;
}

export interface BillingHealthMockResult {
  readonly summary: BillingHealth;
  readonly webhookSparkline: readonly BillingHealthSparklinePoint[];
  readonly intentSparkline: readonly BillingHealthSparklinePoint[];
}

/**
 * Deterministic mock generator for `BillingHealth`. Seeded from the
 * normalized range pair via FNV-1a so identical operator-picked ranges
 * always produce byte-identical output across calls, reloads, and widgets.
 *
 * Produces a trailing-30-day window ending on `range.end` (inclusive) with
 * exactly 30 daily sparkline points for each rate. The aggregate
 * `webhookFailureRate` and `intentAbandonmentRate` are sampled once per
 * call; per-day sparkline rates are independent draws around the same
 * underlying distribution so the operator's eye sees realistic daily
 * variation.
 *
 * The rate-zero safety guard (D-19603 ext.) is enforced at the count
 * derivation site: when `totalCount === 0`, the displayed rate is exactly
 * `0` — never `NaN`. The mock generator only emits non-zero `totalCount`
 * draws, but the consuming layer (composable / widget) preserves the
 * guard for future real-data paths where totals can legitimately be zero.
 */
export function generateBillingHealthMock(range: DateRange, nowMs: number): BillingHealthMockResult {
  // why: D-19605 (Mock Determinism Contract + DateRange Normalization
  // extension) — normalize at the entry point so the seed input is a
  // single canonical form. Without normalization, `range.start` arriving
  // with a `T00:00:00.000Z` suffix in one path and plain `YYYY-MM-DD` in
  // another would seed differently and break cross-reload determinism.
  const normalized = normalizeRange(range, nowMs);

  // why: D-19605 (Mock Determinism Contract) — seed derives from the
  // normalized range pair joined by a literal `|` separator. Identical
  // range input produces byte-identical output across calls, reloads,
  // and widgets. The hash function is the FNV-1a single source in
  // `hashRange.ts`; widgets and other mocks import that function rather
  // than re-implementing.
  const seed = hashRange(normalized.start + '|' + normalized.end);
  const prng = createPrng(seed);

  const webhookRate = sampleRange(prng, WEBHOOK_RATE_MIN, WEBHOOK_RATE_MAX);
  const intentRate = sampleRange(prng, INTENT_RATE_MIN, INTENT_RATE_MAX);
  const webhookTotal = Math.round(sampleRange(prng, WEBHOOK_TOTAL_MIN, WEBHOOK_TOTAL_MAX));
  const intentTotal = Math.round(sampleRange(prng, INTENT_TOTAL_MIN, INTENT_TOTAL_MAX));

  const summary = buildBillingHealthSummary(
    normalized.end,
    webhookTotal,
    webhookRate,
    intentTotal,
    intentRate,
  );

  // why: D-19603 ext. (Billing Health Window Definition) — trailing 30
  // days from `range.end` inclusive; both sparklines plot exactly 30
  // daily points so the operator's eye calibrates to a fixed visual
  // cadence across widget refreshes. A 22-point sparkline next to a
  // 30-point one reads as a different metric.
  const windowDates = buildWindowDates(normalized.end);
  const webhookSparkline = windowDates.map((date) => ({
    date,
    rate: sampleRange(prng, WEBHOOK_RATE_MIN, WEBHOOK_RATE_MAX),
  }));
  const intentSparkline = windowDates.map((date) => ({
    date,
    rate: sampleRange(prng, INTENT_RATE_MIN, INTENT_RATE_MAX),
  }));

  return { summary, webhookSparkline, intentSparkline };
}

/**
 * Build a `BillingHealth` summary record from raw counts and sampled
 * rates. Pure helper — no randomness, no I/O. Used by
 * `generateBillingHealthMock` to apply the count-from-rate derivation
 * and the rate-zero safety guard. Exposed so tests can exercise the
 * guard directly by passing `webhookTotal === 0` or
 * `intentTotal === 0`; producing a zero-total draw through the seeded
 * PRNG path is impossible because the natural sampling range
 * starts above zero.
 */
export function buildBillingHealthSummary(
  windowEnd: string,
  webhookTotal: number,
  webhookRate: number,
  intentTotal: number,
  intentRate: number,
): BillingHealth {
  const windowDates = buildWindowDates(windowEnd);
  // why: D-19603 (Paid-Action Error Union + Forward Server Contract) —
  // count derives AFTER the rate is sampled so the displayed pair never
  // visually disagrees. Drawing rate and count independently would let
  // them drift (e.g., 4.2% over 100 transactions but the count shows 5,
  // not 4); the operator's confidence in the metric collapses
  // immediately. The rate is the source-of-truth sample; the count is
  // the rendered consequence.
  const webhookFailureCount = webhookTotal === 0 ? 0 : Math.round(webhookTotal * webhookRate);
  const intentAbandonedCount = intentTotal === 0 ? 0 : Math.round(intentTotal * intentRate);

  // why: D-19603 ext. (Rate-Division Safety Guard) — `displayRate =
  // totalCount === 0 ? 0 : failureCount / totalCount`. The natural
  // mock sampling produces non-zero totals, but the guard sits here so
  // a future real-data path that legitimately returns `totalCount ===
  // 0` never lets `NaN` reach the renderer. This is the most common
  // production dashboard bug when metrics are sparsely populated.
  const webhookFailureRate = webhookTotal === 0 ? 0 : webhookFailureCount / webhookTotal;
  const intentAbandonmentRate = intentTotal === 0 ? 0 : intentAbandonedCount / intentTotal;

  return {
    windowStart: windowDates[0] ?? windowEnd,
    windowEnd,
    webhookFailureRate,
    webhookFailureCount,
    webhookTotalCount: webhookTotal,
    intentAbandonmentRate,
    intentAbandonedCount,
    intentTotalCount: intentTotal,
  };
}

/**
 * Wire shape returned by the sibling `fetchBillingHealthSparklines`
 * service function. The `BillingHealth` summary type is locked at 8
 * aggregate fields by the forward server contract (D-19603), so per-day
 * data lives in a parallel response payload rather than as additional
 * fields on `BillingHealth`. Both responses share the same hash seed,
 * which guarantees the rates rendered as bars match the aggregate
 * `BillingHealth` rates within rounding.
 */
export interface BillingHealthSparklines {
  readonly webhook: readonly BillingHealthSparklinePoint[];
  readonly intent: readonly BillingHealthSparklinePoint[];
}

/**
 * Service-wrapper variant that returns a `ServiceResponse<BillingHealth>`
 * with the `MOCK` source label. The widget consumes the 8-field summary
 * via this wrapper and the parallel sparkline data via
 * `mockBillingHealthSparklines`; the `ServiceResponse` payload here is
 * the summary record only since `BillingHealth` is the wire-shape
 * locked by the forward server contract (D-19603).
 */
export function mockBillingHealth(range: DateRange, nowMs: number): ServiceResponse<BillingHealth> {
  const result = generateBillingHealthMock(range, nowMs);
  return {
    data: result.summary,
    updatedAt: nowMs,
    source: 'MOCK',
  };
}

/**
 * Service-wrapper variant that returns the 30-day daily sparkline data
 * for both billing-health surfaces. Same seed as `mockBillingHealth` so
 * widget consumers see consistent values across the summary and the
 * sparkline visualizations.
 */
export function mockBillingHealthSparklines(
  range: DateRange,
  nowMs: number,
): ServiceResponse<BillingHealthSparklines> {
  const result = generateBillingHealthMock(range, nowMs);
  return {
    data: {
      webhook: result.webhookSparkline,
      intent: result.intentSparkline,
    },
    updatedAt: nowMs,
    source: 'MOCK',
  };
}
