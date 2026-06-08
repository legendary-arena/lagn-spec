import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useNetRevenueBreakdown, type GrossDailyInput } from './useNetRevenueBreakdown.js';
import type { RevenueDeductionConfig } from '../config/revenueDeductions.js';
import {
  buildBillingHealthSummary,
  generateBillingHealthMock,
} from '../services/billingHealthMocks.js';
import { hashRange } from '../services/hashRange.js';
import { normalizeRange, assertOrdered } from '../services/normalizeRange.js';

function makeDeductions(overrides: Partial<RevenueDeductionConfig> = {}): RevenueDeductionConfig {
  return {
    royaltyPercent: 0,
    stripeFeePercent: 0,
    stripeFeeFixedCents: 0,
    infraCogsPercent: 0,
    isMock: true,
    ...overrides,
  };
}

function makeGrossSeries(
  values: readonly number[],
  startDate: string = '2026-06-01',
): GrossDailyInput[] {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  return values.map((grossCents, index) => ({
    date: new Date(start + index * 86400000).toISOString().slice(0, 10),
    grossCents,
  }));
}

test('1. Single-day input with all-zero deductions returns net === gross', () => {
  const grossSeries = makeGrossSeries([10_000]);
  const deductions = makeDeductions();
  const { series, totalGross, totalNet, netMarginRatio } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  assert.equal(series.value.net[0], 10_000);
  assert.equal(series.value.gross[0], 10_000);
  assert.equal(totalGross.value, 10_000);
  assert.equal(totalNet.value, 10_000);
  assert.equal(netMarginRatio.value, 1);
});

test('2. Royalty-only deduction (20% royalty) subtracts exactly 20% rounded to cents', () => {
  const grossSeries = makeGrossSeries([10_001]);
  const deductions = makeDeductions({ royaltyPercent: 0.2 });
  const { series } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  assert.equal(series.value.royalty[0], Math.round(10_001 * 0.2));
  assert.equal(series.value.net[0], 10_001 - Math.round(10_001 * 0.2));
});

test('3. Stripe fee combines percentage and fixed-cents components per the formula', () => {
  const grossSeries = makeGrossSeries([100_000]);
  const deductions = makeDeductions({
    stripeFeePercent: 0.029,
    stripeFeeFixedCents: 30,
  });
  const { series } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  const expectedStripe = Math.round(100_000 * 0.029) + 30;
  assert.equal(series.value.stripeFees[0], expectedStripe);
  assert.equal(series.value.net[0], 100_000 - expectedStripe);
});

test('4. Day with gross too small to cover fixed Stripe fee produces a negative net (preserved, not clamped)', () => {
  const grossSeries = makeGrossSeries([20]);
  const deductions = makeDeductions({
    stripeFeePercent: 0.029,
    stripeFeeFixedCents: 30,
  });
  const { series } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  assert.ok(
    series.value.net[0]! < 0,
    'net for a sub-fee day must be negative, not clamped to zero',
  );
  assert.equal(series.value.net[0], 20 - (Math.round(20 * 0.029) + 30));
});

test('5. totalGross, totalNet, and netMarginRatio aggregate correctly over a 30-day series', () => {
  const grossValues: number[] = [];
  for (let i = 0; i < 30; i++) {
    grossValues.push(50_000 + i * 1_000);
  }
  const grossSeries = makeGrossSeries(grossValues);
  const deductions = makeDeductions({
    royaltyPercent: 0.2,
    stripeFeePercent: 0.029,
    stripeFeeFixedCents: 30,
    infraCogsPercent: 0.05,
  });
  const { totalGross, totalNet, netMarginRatio } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  let expectedGross = 0;
  for (const value of grossValues) {
    expectedGross += value;
  }
  assert.equal(totalGross.value, expectedGross);
  assert.ok(totalNet.value < totalGross.value);
  assert.ok(netMarginRatio.value > 0 && netMarginRatio.value < 1);
});

test('6. Empty input series returns totalGross === 0, totalNet === 0, netMarginRatio === 0', () => {
  const grossSeries: GrossDailyInput[] = [];
  const deductions = makeDeductions({ royaltyPercent: 0.2 });
  const { totalGross, totalNet, netMarginRatio } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  assert.equal(totalGross.value, 0);
  assert.equal(totalNet.value, 0);
  assert.equal(netMarginRatio.value, 0);
});

test('7. The composable does not mutate its input series (referential safety)', () => {
  const grossSeries = makeGrossSeries([10_000, 20_000, 30_000]);
  const snapshot = grossSeries.map((point) => ({ ...point }));
  const deductions = makeDeductions({ royaltyPercent: 0.2 });
  useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  assert.deepEqual(grossSeries, snapshot);
});

test('8. Aggregation consistency (D-19604): totalNet equals sum(series.net[]); totalGross equals sum(series.gross[])', () => {
  const grossValues: number[] = [];
  for (let i = 0; i < 30; i++) {
    grossValues.push(40_000 + i * 750);
  }
  const grossSeries = makeGrossSeries(grossValues);
  const deductions = makeDeductions({
    royaltyPercent: 0.2,
    stripeFeePercent: 0.029,
    stripeFeeFixedCents: 30,
    infraCogsPercent: 0.05,
  });
  const { series, totalGross, totalNet } = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  let independentGrossSum = 0;
  for (const value of series.value.gross) {
    independentGrossSum += value;
  }
  let independentNetSum = 0;
  for (const value of series.value.net) {
    independentNetSum += value;
  }
  assert.equal(totalGross.value, independentGrossSum);
  assert.equal(totalNet.value, independentNetSum);
});

test('9. Referential stability (D-19605): two composable calls with the same input produce structurally identical output', () => {
  const grossSeries = makeGrossSeries([12_345, 23_456, 34_567, 45_678]);
  const deductions = makeDeductions({
    royaltyPercent: 0.2,
    stripeFeePercent: 0.029,
    stripeFeeFixedCents: 30,
    infraCogsPercent: 0.05,
  });
  const first = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  const second = useNetRevenueBreakdown(
    () => grossSeries,
    () => deductions,
  );
  assert.deepEqual(first.series.value.dates, second.series.value.dates);
  assert.deepEqual(first.series.value.gross, second.series.value.gross);
  assert.deepEqual(first.series.value.net, second.series.value.net);
  assert.equal(first.totalGross.value, second.totalGross.value);
  assert.equal(first.totalNet.value, second.totalNet.value);
  assert.equal(first.netMarginRatio.value, second.netMarginRatio.value);

  const seriesKeys = Object.keys(first.series.value).sort();
  assert.deepEqual(seriesKeys, ['dates', 'gross', 'infraCogs', 'net', 'royalty', 'stripeFees']);
});

test('10. DateRange normalization (D-19605 ext.): assertOrdered throws full-sentence error naming both values; normalized pair passes through unchanged', () => {
  assert.throws(
    () => assertOrdered('2026-06-02', '2026-06-01'),
    (caughtError: unknown) => {
      const error = caughtError as Error;
      assert.match(error.message, /2026-06-02/);
      assert.match(error.message, /2026-06-01/);
      assert.match(error.message, /start.*end|later than/i);
      return true;
    },
  );
  const normalized = normalizeRange('7d', Date.UTC(2026, 5, 7));
  assert.equal(normalized.end, '2026-06-07');
  assert.equal(normalized.start, '2026-06-01');
  assert.ok(normalized.start <= normalized.end, 'normalized pair is in order');
});

test('11. Hash determinism (D-19605 ext.): hashRange returns byte-identical output for identical input and different output for different input', () => {
  assert.equal(hashRange('2026-06-01|2026-06-07'), hashRange('2026-06-01|2026-06-07'));
  assert.notEqual(hashRange('2026-06-01|2026-06-07'), hashRange('2026-06-02|2026-06-08'));
  assert.notEqual(hashRange('a'), hashRange('b'));
  assert.equal(hashRange('a'), hashRange('a'));
});

test('12. Rate-zero safety guard (D-19603 ext.): billing-health mock returns rate === 0 when totalCount === 0', () => {
  const zeroTotal = buildBillingHealthSummary('2026-06-07', 0, 0.04, 0, 0.25);
  assert.equal(zeroTotal.webhookFailureRate, 0);
  assert.equal(zeroTotal.intentAbandonmentRate, 0);
  assert.equal(zeroTotal.webhookFailureCount, 0);
  assert.equal(zeroTotal.intentAbandonedCount, 0);
  assert.ok(!Number.isNaN(zeroTotal.webhookFailureRate), 'rate must not be NaN when total is 0');
  assert.ok(!Number.isNaN(zeroTotal.intentAbandonmentRate), 'rate must not be NaN when total is 0');

  const naturalMock = generateBillingHealthMock('7d', Date.UTC(2026, 5, 7));
  const keys = Object.keys(naturalMock.summary).sort();
  assert.deepEqual(keys, [
    'intentAbandonedCount',
    'intentAbandonmentRate',
    'intentTotalCount',
    'webhookFailureCount',
    'webhookFailureRate',
    'webhookTotalCount',
    'windowEnd',
    'windowStart',
  ]);
  assert.equal(naturalMock.webhookSparkline.length, 30);
  assert.equal(naturalMock.intentSparkline.length, 30);
});
