import type {
  ActivationFunnelStep,
  ActivationStep,
  AcquisitionChannel,
  DateRange,
  RetentionCohort,
  ServiceResponse,
  TrafficSource,
} from '../types/index.js';
import { ACQUISITION_CHANNELS, ACTIVATION_STEPS } from '../types/index.js';
import { hashRange } from './hashRange.js';
import { normalizeRange } from './normalizeRange.js';

// ============================================================================
// WP-203 / EC-231 — Mock factories for the three analytics surfaces
// (traffic / funnel / retention). Mirrors `billingHealthMocks.ts` shape:
// FNV-1a-seeded determinism (D-19605), `wrapMock<T>` per factory, every
// response carries `source: 'MOCK'`. Mock-mode-first per WP-197 D-19702
// (D-20302); LIVE flip is WP-205's concern (the widget files stay byte-
// identical pre/post flip because composables read freshness from the
// composable's returned `source` / `updatedAt`, NOT directly from this
// service layer — see §Composable Source Contract in WP-203).
// ============================================================================

const MS_PER_DAY = 86400000;

// Per-channel base-line daily visitors. Order matches ACQUISITION_CHANNELS;
// values picked so the strip widget shows a realistic distribution
// (direct dominates, paid is the smallest non-zero channel). Numbers are
// design defaults — operator-tunable in a follow-up once real data flows.
const CHANNEL_BASE_VISITORS: Readonly<Record<AcquisitionChannel, number>> = {
  direct: 240,
  search: 170,
  referral: 80,
  paid: 35,
};

// Per-channel base conversion rate (visitor → signup). Direct and referral
// convert highest (intent-led traffic); search lower; paid lowest (top-of-
// funnel awareness traffic). Tunable defaults; same caveat as above.
const CHANNEL_BASE_CONVERSION: Readonly<Record<AcquisitionChannel, number>> = {
  direct: 0.06,
  search: 0.04,
  referral: 0.07,
  paid: 0.025,
};

// Funnel step-to-step retention multipliers (signup-complete reaches ~65%
// of signup-start; first-match-started reaches ~70% of signup-complete;
// first-match-completed reaches ~80% of first-match-started). Used as the
// MEAN of a small random band around each step's base count.
const STEP_RETENTION_MULTIPLIER: Readonly<Record<ActivationStep, number>> = {
  'signup-start': 1,
  'signup-complete': 0.65,
  'first-match-started': 0.45,
  'first-match-completed': 0.36,
};

const SIGNUP_START_BASE_DAILY = 38;

// Retention cohort defaults — typical SaaS-shape (D1 ≈ 50%, D7 ≈ 25%).
const COHORT_SIZE_BASE = 110;
const DAY1_RETURN_RATE_BASE = 0.5;
const DAY7_RETURN_RATE_BASE = 0.27;

/**
 * Seeded PRNG (mulberry32) — pure function: identical seed produces an
 * identical infinite stream of [0, 1) values across calls, reloads, and
 * platforms. Inlined here (rather than imported) so this file is the single
 * seeded-random consumer for the analytics surface; the billing-health
 * mock has its own copy of the same algorithm to keep determinism contracts
 * domain-local. Bare non-seeded RNG draws are forbidden in this directory
 * per D-19605.
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
 * supplied seeded PRNG. Mirrors `billingHealthMocks.ts` `sampleRange`.
 */
function sampleRange(prng: () => number, min: number, max: number): number {
  return min + (max - min) * prng();
}

/**
 * Format a UTC millisecond timestamp as the canonical `YYYY-MM-DD` string.
 * Mirrors `billingHealthMocks.ts` `toIsoDate`.
 */
function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build the inclusive list of `YYYY-MM-DD` dates between `start` and `end`
 * (both UTC, both canonical strings). Returned in chronological order
 * (ascending). Both endpoints are included; a 14-day range produces 14
 * entries.
 */
function buildDateRange(start: string, end: string): string[] {
  const startMs = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const endMs = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  const dates: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
    dates.push(toIsoDate(ms));
  }
  return dates;
}

/**
 * Wrap a value into a `ServiceResponse<T>` with the `MOCK` source label.
 * `updatedAt` is supplied by the caller (`nowMs` parameter) so this file
 * carries NO bare `Date.now()` call site — the caller controls when the
 * timestamp is sampled. Mirrors the `billingHealthMocks.ts` inline-wrap
 * pattern at lines 224-230; named `wrapMock` so the per-factory grep gate
 * (`hashRange|wrapMock`) sees the expected token.
 */
function wrapMock<T>(data: T, nowMs: number): ServiceResponse<T> {
  return {
    data,
    updatedAt: nowMs,
    source: 'MOCK',
  };
}

/**
 * Deterministic mock generator for `TrafficSource[]`. Produces a per-channel
 * × per-day grid of discrete (NOT cumulative) visitor + signup counts
 * across the normalized date range. Seed derives from the normalized range
 * pair via FNV-1a so identical operator-picked ranges always produce
 * byte-identical output across reloads.
 *
 * Output is sorted ascending by `date` (Unicode code-unit comparison) and
 * iterates `ACQUISITION_CHANNELS` in canonical array order — both
 * required by WP-203 §Aggregation rule + §Determinism scope so per-channel
 * iteration order is observable-stable across JS runtimes.
 */
export function mockTrafficSources(
  range: DateRange,
  nowMs: number,
): ServiceResponse<readonly TrafficSource[]> {
  // why: D-19605 (DateRange normalization) — normalize at the entry point
  // so the seed input is a single canonical form. Without normalization,
  // two paths supplying differently-formatted range endpoints would seed
  // differently and break cross-reload determinism.
  const normalized = normalizeRange(range, nowMs);
  // why: D-19605 (Mock Determinism Contract) — seed derives from the
  // normalized range pair joined by a literal `|` separator. Identical
  // range input produces byte-identical output across calls.
  const seed = hashRange(normalized.start + '|' + normalized.end);
  // why: D-20302 (mock-mode-first per WP-197 D-19702) — every factory in
  // this file produces `source: 'MOCK'` output; flip to LIVE is WP-205's
  // concern via getter substitution, not a factory-side change.
  const prng = createPrng(seed);
  const dates = buildDateRange(normalized.start, normalized.end);

  const entries: TrafficSource[] = [];
  // why: WP-203 §Determinism scope — iterate ACQUISITION_CHANNELS in
  // canonical array order so output is byte-identical across JS runtimes
  // regardless of object-key insertion-order behavior. Using
  // `Object.keys(CHANNEL_BASE_VISITORS)` here would be observation-order-
  // dependent and is forbidden.
  for (const channel of ACQUISITION_CHANNELS) {
    const baseVisitors = CHANNEL_BASE_VISITORS[channel];
    const baseConversion = CHANNEL_BASE_CONVERSION[channel];
    for (const date of dates) {
      const visitorMultiplier = sampleRange(prng, 0.7, 1.4);
      const visitorCount = Math.max(0, Math.round(baseVisitors * visitorMultiplier));
      const conversionMultiplier = sampleRange(prng, 0.7, 1.3);
      const dailyConversion = baseConversion * conversionMultiplier;
      const signupCount = Math.min(visitorCount, Math.round(visitorCount * dailyConversion));
      entries.push({ channel, date, visitorCount, signupCount });
    }
  }

  // why: WP-203 §Aggregation rule — series sorted ascending by `date` via
  // Unicode code-unit comparison. `YYYY-MM-DD` sorts correctly under code-
  // unit comparison; `localeCompare` is forbidden per D-19605 / D-19904
  // (ambient-locale dependence). The comparator returns -1/0/1 explicitly
  // (rather than `a.date.localeCompare(b.date)`) to satisfy the
  // no-localeCompare invariant.
  entries.sort((left, right) => {
    if (left.date < right.date) {
      return -1;
    }
    if (left.date > right.date) {
      return 1;
    }
    return 0;
  });

  return wrapMock(entries as readonly TrafficSource[], nowMs);
}

/**
 * Deterministic mock generator for `ActivationFunnelStep[]`. Produces a
 * per-step × per-day grid of discrete counts across the normalized range.
 * Funnel attrition is driven by `STEP_RETENTION_MULTIPLIER` × small daily
 * noise so the shape always reads as a funnel (each step strictly ≤ the
 * previous step in expectation).
 *
 * Output is sorted ascending by `date` (Unicode code-unit comparison) and
 * iterates `ACTIVATION_STEPS` in canonical array order per the same
 * determinism discipline as `mockTrafficSources`.
 */
export function mockActivationFunnel(
  range: DateRange,
  nowMs: number,
): ServiceResponse<readonly ActivationFunnelStep[]> {
  // why: D-19605 — same normalization + seeding pattern as mockTrafficSources.
  const normalized = normalizeRange(range, nowMs);
  const seed = hashRange('funnel|' + normalized.start + '|' + normalized.end);
  // why: D-20302 — mock-mode-first per WP-197 D-19702.
  const prng = createPrng(seed);
  const dates = buildDateRange(normalized.start, normalized.end);

  const entries: ActivationFunnelStep[] = [];
  // why: WP-203 §Determinism scope — iterate ACTIVATION_STEPS in canonical
  // array order. Object-key iteration order on STEP_RETENTION_MULTIPLIER
  // would be observable-order-dependent across runtimes.
  for (const step of ACTIVATION_STEPS) {
    const multiplier = STEP_RETENTION_MULTIPLIER[step];
    for (const date of dates) {
      const dailyBase = SIGNUP_START_BASE_DAILY * sampleRange(prng, 0.7, 1.3);
      const count = Math.max(0, Math.round(dailyBase * multiplier));
      entries.push({ step, date, count });
    }
  }

  // why: WP-203 §Aggregation rule — ascending by `date` via Unicode code-
  // unit comparison; localeCompare forbidden per D-19605 / D-19904.
  entries.sort((left, right) => {
    if (left.date < right.date) {
      return -1;
    }
    if (left.date > right.date) {
      return 1;
    }
    return 0;
  });

  return wrapMock(entries as readonly ActivationFunnelStep[], nowMs);
}

/**
 * Compute the ISO 8601 week label (`YYYY-Www`) for a UTC date. The ISO
 * week-numbering year may differ from the calendar year for dates near
 * year boundaries: the year carried by `YYYY` is the ISO week-numbering
 * year (the year containing the week's Thursday), not the calendar year.
 *
 * Algorithm: shift the target date to the Thursday of its ISO week, then
 * compute the week index relative to the year's first Thursday. Standard
 * implementation.
 */
function isoWeekLabel(ms: number): string {
  const target = new Date(ms);
  const dayOfWeek = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursdayMs = Date.UTC(isoYear, 0, 4);
  const firstThursday = new Date(firstThursdayMs);
  const firstThursdayDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayOfWeek + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return `${isoYear}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Deterministic mock generator for `RetentionCohort[]`. Produces
 * `cohortCount` weekly cohorts ending at the ISO week containing `nowMs`,
 * walking backward one week per cohort. Cohort sizes and per-cohort D1 /
 * D7 return counts derive from seeded random draws around documented
 * base rates (D1 ≈ 50%, D7 ≈ 27%) so the heatmap shows realistic
 * variation without any specific cohort screaming high or low.
 *
 * Output is sorted ascending by `cohortWeek` (Unicode code-unit
 * comparison) so the widget can render the heatmap rows in chronological
 * order without further sorting.
 */
export function mockRetentionCohorts(
  cohortCount: number,
  nowMs: number,
): ServiceResponse<readonly RetentionCohort[]> {
  // why: D-19605 — seed derives from `cohortCount` (the documented
  // determinism-scope input); same `cohortCount` always produces
  // byte-identical output across calls.
  const seed = hashRange('retention|' + String(cohortCount));
  // why: D-20302 — mock-mode-first per WP-197 D-19702.
  const prng = createPrng(seed);

  const entries: RetentionCohort[] = [];
  for (let weeksBack = cohortCount - 1; weeksBack >= 0; weeksBack--) {
    const cohortWeek = isoWeekLabel(nowMs - weeksBack * 7 * MS_PER_DAY);
    const cohortSize = Math.max(1, Math.round(COHORT_SIZE_BASE * sampleRange(prng, 0.75, 1.25)));
    const day1Rate = Math.max(0, Math.min(1, DAY1_RETURN_RATE_BASE * sampleRange(prng, 0.8, 1.2)));
    const day7Rate = Math.max(
      0,
      Math.min(day1Rate, DAY7_RETURN_RATE_BASE * sampleRange(prng, 0.8, 1.2)),
    );
    const day1ReturnCount = Math.round(cohortSize * day1Rate);
    const day7ReturnCount = Math.round(cohortSize * day7Rate);
    entries.push({ cohortWeek, cohortSize, day1ReturnCount, day7ReturnCount });
  }

  // why: ascending sort by `cohortWeek` via Unicode code-unit comparison
  // so widgets receive a chronologically-ordered list and don't need to
  // re-sort. Ties on `cohortWeek` are impossible (each week is unique)
  // so the comparator never reaches the equal branch in practice.
  entries.sort((left, right) => {
    if (left.cohortWeek < right.cohortWeek) {
      return -1;
    }
    if (left.cohortWeek > right.cohortWeek) {
      return 1;
    }
    return 0;
  });

  return wrapMock(entries as readonly RetentionCohort[], nowMs);
}
