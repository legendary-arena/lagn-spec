import type {
  DateRange,
  ErrorRateSnapshot,
  ErrorSignature,
  InfraCostEntry,
  InfraCostVendor,
  PublicSurfaceKey,
  ServiceResponse,
  UptimeProbe,
  UptimeStatus,
} from '../types/index.js';
import {
  INFRA_COST_VENDORS,
  PUBLIC_SURFACES,
} from '../types/index.js';
import { INFRA_COST_BUDGETS } from '../config/infraCostBudgets.js';
import { hashRange } from './hashRange.js';
import { normalizeRange } from './normalizeRange.js';

// ============================================================================
// WP-204 / EC-232 — Mock factories for the three ops-health surfaces
// (uptime / error rate / infra cost). Mirrors `analyticsMocks.ts` shape:
// FNV-1a-seeded determinism (D-19605), `wrapMock<T>` per factory, every
// response carries `source: 'MOCK'`. Mock-mode-first per WP-197 D-19702
// (D-20402); LIVE flip is the paired server WP's concern (the widget files
// stay byte-identical pre/post flip because composables read freshness
// from the composable's returned `source` / `updatedAt`, NOT directly
// from this service layer — see §Composable Source Contract in WP-204).
// ============================================================================

const MS_PER_DAY = 86400000;

// Per-surface baseline uptime (percent in [95.0, 100.0] per §Mock value
// bounds). Real-world public surfaces typically stay above 99%; the floor
// at 95 lets the operator see degraded days without exercising pathological
// outage cases. Order matches PUBLIC_SURFACES canonical order; values are
// design defaults — the paired server WP will overwrite with real data.
const SURFACE_BASE_UPTIME: Readonly<Record<PublicSurfaceKey, number>> = {
  marketing: 99.95,
  play: 99.5,
  cards: 99.85,
  api: 99.3,
};

// Per-surface daily-incident base probability (fraction in [0, 1]). When
// the seeded PRNG draws below this for a given day, the surface logs at
// least one incident on that day. Real numbers come from the paired
// server WP; v1 picks a low base rate so most days are clean.
const SURFACE_INCIDENT_RATE: Readonly<Record<PublicSurfaceKey, number>> = {
  marketing: 0.04,
  play: 0.10,
  cards: 0.05,
  api: 0.12,
};

// Daily error-rate baseline (decimal fraction in [0, 0.05] per §Mock value
// bounds). Aggregates to a ~1% daily error rate in expectation across the
// range; individual days draw uniformly in a band around this.
const DAILY_ERROR_RATE_BASE = 0.01;
const DAILY_ERROR_RATE_BAND_HALF_WIDTH = 0.007;

// Hourly bucket baseline (decimal fraction in [0, 0.05]). The hourly
// window is the "current 1h rate" panel's source; values vary more day-
// to-day than the daily aggregate so the operator's at-a-glance view
// reads as live.
const HOURLY_ERROR_RATE_BASE = 0.008;
const HOURLY_ERROR_RATE_BAND_HALF_WIDTH = 0.012;

// Per-day request count baseline. Bounded so the implied errorCount stays
// non-negative integer (D-19601 carry-forward) and totalRequests is a
// realistic scale for an early-stage operator (low thousands).
const DAILY_TOTAL_REQUESTS_BASE = 4500;
const DAILY_TOTAL_REQUESTS_BAND_HALF_WIDTH = 1500;

// Hourly request count baseline. Roughly daily total / 24 with daily
// variance preserved.
const HOURLY_TOTAL_REQUESTS_BASE = 220;
const HOURLY_TOTAL_REQUESTS_BAND_HALF_WIDTH = 100;

// Synthetic top-5 signature catalogue. Real production messages would
// come from the paired server WP's 5xx aggregator; this list is a
// stand-in vocabulary the operator can recognize as common operational
// failure modes. Each signature is < 80 UTF-16 code units so the
// truncation contract is not exercised in mock data (the contract still
// applies once real data flows).
const MOCK_SIGNATURE_CATALOGUE: readonly string[] = [
  'TypeError: Cannot read properties of undefined (reading "match")',
  'ECONNRESET: socket hang up to upstream service',
  'PG: connection pool exhausted; queue length exceeded',
  'TimeoutError: handler exceeded 30000ms budget',
  'RangeError: invalid array length in deck normalization',
  '5xx upstream: render-service returned 502 Bad Gateway',
  'TypeError: response.json is not a function',
  'AbortError: fetch aborted by client disconnect',
];

/**
 * Seeded PRNG (mulberry32) — pure function: identical seed produces an
 * identical infinite stream of [0, 1) values across calls, reloads, and
 * platforms. Inlined here (rather than imported) so this file is the
 * single seeded-random consumer for the ops-health surface, matching the
 * `analyticsMocks.ts` and `billingHealthMocks.ts` precedent. Bare
 * non-seeded `Math.random` draws are forbidden in this directory per
 * D-19605.
 */
function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return function nextSample(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let nextState = state;
    nextState = Math.imul(nextState ^ (nextState >>> 15), nextState | 1);
    nextState ^= nextState + Math.imul(nextState ^ (nextState >>> 7), nextState | 61);
    return ((nextState ^ (nextState >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a value uniformly from `[min, max]` (inclusive both ends) using the
 * supplied seeded PRNG. Mirrors `analyticsMocks.ts` `sampleRange`.
 */
function sampleRange(prng: () => number, min: number, max: number): number {
  return min + (max - min) * prng();
}

/**
 * Clamp a value to the inclusive `[min, max]` band. Used at factory output
 * sites to enforce the §Mock value bounds invariants (uptime ∈ [95, 100],
 * errorRate ∈ [0, 0.05]). Consumers MUST NOT clamp — bounds belong to the
 * mock layer only; if a consumer observes an out-of-band value, the
 * factory is wrong, not the consumer.
 */
function clampToBand(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * Format a UTC millisecond timestamp as the canonical `YYYY-MM-DD` string.
 * Mirrors `analyticsMocks.ts` `toIsoDate`.
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
 * Convert a `YYYY-MM-DD` date string to the UTC midnight epoch-ms value
 * for that day. Used to anchor incident timestamps (epoch ms inside the
 * day) without re-parsing the string at each call site.
 */
function dateToUtcMidnightMs(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

/**
 * Round a numeric `uptimePercent` to 1-decimal precision per WP-204
 * §Uptime math invariants. Applied at the factory output boundary so
 * downstream consumers see the same rounding the spec mandates.
 */
function round1Decimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Derive the per-day `UptimeStatus` from the day's `uptimePercent`. Locked
 * thresholds: `>=99.9%` ⇒ `'up'`; `[99.0, 99.9)` ⇒ `'degraded'`; below ⇒
 * `'down'`. Status reflects the rollup; the percent reflects the ratio —
 * a `'down'` day MAY still have an uptime percent above zero (the surface
 * spent part of the day down per WP-204 §Uptime math invariants).
 */
function deriveStatus(uptimePercent: number): UptimeStatus {
  if (uptimePercent >= 99.9) {
    return 'up';
  }
  if (uptimePercent >= 99.0) {
    return 'degraded';
  }
  return 'down';
}

/**
 * Wrap a value into a `ServiceResponse<T>` with the `MOCK` source label.
 * `updatedAt` is supplied by the caller (`nowMs` parameter) so this file
 * carries NO bare `Date.now()` call site — the caller controls when the
 * timestamp is sampled. Named `wrapMock` so the per-factory grep gate
 * (`hashRange|wrapMock`) sees the expected token; mirrors `analyticsMocks.ts`.
 */
function wrapMock<T>(data: T, nowMs: number): ServiceResponse<T> {
  return {
    data,
    updatedAt: nowMs,
    source: 'MOCK',
  };
}

/**
 * Stable ascending comparator on `YYYY-MM-DD` date strings under Unicode
 * code-unit comparison. Returns -1/0/1 explicitly so `Array.sort` is
 * insensitive to the JS engine's three-way comparison conventions, and
 * so the no-`localeCompare` invariant (D-19605 / D-19904) is unambiguous
 * at the comparator site.
 */
function ascendingByDate(left: { date: string }, right: { date: string }): number {
  if (left.date < right.date) {
    return -1;
  }
  if (left.date > right.date) {
    return 1;
  }
  return 0;
}

/**
 * Deterministic mock generator for `UptimeProbe[]`. Produces one entry per
 * `PublicSurfaceKey` per UTC day in the normalized range. Seed derives
 * from the normalized range pair via FNV-1a so identical operator-picked
 * ranges always produce byte-identical output across reloads.
 *
 * Output is sorted ascending by `date` (Unicode code-unit comparison) and
 * iterates `PUBLIC_SURFACES` in canonical array order — both required by
 * WP-204 §Aggregation rule + §Determinism scope so per-surface iteration
 * order is observable-stable across JS runtimes.
 *
 * §Mock value bounds: every emitted `uptimePercent` is clamped to
 * `[95.0, 100.0]` at the factory output. Composables and widgets MUST NOT
 * clamp — bounds belong to this layer only.
 */
export function mockUptimeProbes(
  range: DateRange,
  nowMs: number,
): ServiceResponse<readonly UptimeProbe[]> {
  // why: D-19605 (DateRange normalization) — normalize at the entry point
  // so the seed input is a single canonical form. Without normalization,
  // two paths supplying differently-formatted range endpoints would seed
  // differently and break cross-reload determinism.
  const normalized = normalizeRange(range, nowMs);
  // why: D-19605 (Mock Determinism Contract) — seed derives from the
  // normalized range pair joined by a literal `|` separator with a
  // domain prefix so this factory's seed cannot collide with the other
  // two ops factories on the same range.
  const seed = hashRange('ops-uptime|' + normalized.start + '|' + normalized.end);
  // why: D-20402 (mock-mode-first per WP-197 D-19702) — every factory in
  // this file produces `source: 'MOCK'` output; flip to LIVE is the
  // paired server WP's concern via getter substitution, not a factory-
  // side change.
  const prng = createPrng(seed);
  const dates = buildDateRange(normalized.start, normalized.end);

  const entries: UptimeProbe[] = [];
  // why: WP-204 §Determinism scope — iterate PUBLIC_SURFACES in canonical
  // array order so per-surface assembly is byte-identical across JS
  // runtimes. `Object.keys(SURFACE_BASE_UPTIME)` would be observation-
  // order-dependent and is forbidden.
  for (const surface of PUBLIC_SURFACES) {
    const baseUptime = SURFACE_BASE_UPTIME[surface];
    const incidentBaseRate = SURFACE_INCIDENT_RATE[surface];
    for (const date of dates) {
      // why: §Mock value bounds — uptimePercent ∈ [95.0, 100.0]. Sample
      // a per-day deviation in [-0.7, +0.4] around the surface's base
      // uptime, then clamp to the locked band so factory output never
      // leaves the operator-plausible range. Slight positive skew on
      // the deviation keeps most days at the high end (matches real-
      // world ops where 99%+ is the dominant state).
      const deviation = sampleRange(prng, -0.7, 0.4);
      const rawUptime = baseUptime + deviation;
      const uptimePercent = round1Decimal(clampToBand(rawUptime, 95.0, 100.0));
      const status = deriveStatus(uptimePercent);

      const incidentRoll = prng();
      const hasIncident = incidentRoll < incidentBaseRate;
      // why: D-19908 numeric-zero semantics — `incidentCount` is a real
      // count (zero = no incidents that day); `lastIncidentTimestamp`
      // is `null` ONLY when no incidents are present in the day. Zero
      // is a meaningful epoch ms value (1970-01-01 UTC) and would
      // surface to the operator as "incident at the dawn of UNIX time"
      // — null is the explicit absence sentinel.
      const incidentCount = hasIncident ? Math.max(1, Math.round(sampleRange(prng, 1, 3))) : 0;
      let lastIncidentTimestamp: number | null = null;
      if (hasIncident) {
        const dayMidnightMs = dateToUtcMidnightMs(date);
        const offsetSeconds = Math.round(sampleRange(prng, 0, 86399));
        lastIncidentTimestamp = dayMidnightMs + offsetSeconds * 1000;
      }
      entries.push({
        surface,
        date,
        status,
        uptimePercent,
        incidentCount,
        lastIncidentTimestamp,
      });
    }
  }

  // why: WP-204 §Aggregation rule — series sorted ascending by `date` via
  // Unicode code-unit comparison. Per-surface output ordering within a
  // single date is preserved by Array.sort stability (V8 + recent Node
  // versions use TimSort which is stable); since dates differ across
  // entries unless surface+date matches, the surface tie-break is moot
  // in practice. `localeCompare` is forbidden per D-19605 / D-19904.
  entries.sort(ascendingByDate);

  return wrapMock(entries as readonly UptimeProbe[], nowMs);
}

/**
 * Deterministic mock generator for `ErrorRateSnapshot[]`. Produces TWO
 * entries per UTC day in the normalized range: one daily aggregate
 * (`windowSeconds = 86400`) and one rolling-1h panel (`windowSeconds =
 * 3600`). The composable filters per derivation — see WP-204 §"Current"
 * snapshot selection (mixed-window aggregation is forbidden; the
 * composable consumes each subset disjointly).
 *
 * Top-5 signatures per snapshot are pre-truncated and ordered
 * deterministically (`count` desc, tiebreak `signature` asc Unicode
 * code-unit) so the widget never re-sorts.
 */
export function mockErrorRateSnapshots(
  range: DateRange,
  nowMs: number,
): ServiceResponse<readonly ErrorRateSnapshot[]> {
  // why: D-19605 — same normalization + seeding pattern as mockUptimeProbes;
  // domain prefix `ops-errors` keeps this factory's seed disjoint from
  // siblings on the same range.
  const normalized = normalizeRange(range, nowMs);
  const seed = hashRange('ops-errors|' + normalized.start + '|' + normalized.end);
  // why: D-20402 — mock-mode-first per WP-197 D-19702.
  const prng = createPrng(seed);
  const dates = buildDateRange(normalized.start, normalized.end);

  const entries: ErrorRateSnapshot[] = [];
  for (const date of dates) {
    // Daily 86400 entry — represents the day's aggregate 5xx rate.
    const dailyRateRaw =
      DAILY_ERROR_RATE_BASE
      + sampleRange(prng, -DAILY_ERROR_RATE_BAND_HALF_WIDTH, DAILY_ERROR_RATE_BAND_HALF_WIDTH);
    // why: §Mock value bounds — errorRate ∈ [0, 0.05]. Clamp at the
    // factory output; consumers MUST NOT clamp.
    const dailyErrorRate = clampToBand(dailyRateRaw, 0, 0.05);
    const dailyTotalRequests = Math.max(
      1,
      Math.round(
        DAILY_TOTAL_REQUESTS_BASE
        + sampleRange(prng, -DAILY_TOTAL_REQUESTS_BAND_HALF_WIDTH, DAILY_TOTAL_REQUESTS_BAND_HALF_WIDTH),
      ),
    );
    const dailyErrorCount = Math.round(dailyTotalRequests * dailyErrorRate);
    const dayMidnightMs = dateToUtcMidnightMs(date);
    entries.push({
      date,
      windowSeconds: 86400,
      totalRequests: dailyTotalRequests,
      errorCount: dailyErrorCount,
      errorRate: dailyErrorRate,
      topSignatures: pickTopSignatures(prng, dailyErrorCount, dayMidnightMs),
    });

    // Rolling 1h panel — represents the latest hour of the day in v1.
    const hourlyRateRaw =
      HOURLY_ERROR_RATE_BASE
      + sampleRange(prng, -HOURLY_ERROR_RATE_BAND_HALF_WIDTH, HOURLY_ERROR_RATE_BAND_HALF_WIDTH);
    const hourlyErrorRate = clampToBand(hourlyRateRaw, 0, 0.05);
    const hourlyTotalRequests = Math.max(
      1,
      Math.round(
        HOURLY_TOTAL_REQUESTS_BASE
        + sampleRange(prng, -HOURLY_TOTAL_REQUESTS_BAND_HALF_WIDTH, HOURLY_TOTAL_REQUESTS_BAND_HALF_WIDTH),
      ),
    );
    const hourlyErrorCount = Math.round(hourlyTotalRequests * hourlyErrorRate);
    entries.push({
      date,
      windowSeconds: 3600,
      totalRequests: hourlyTotalRequests,
      errorCount: hourlyErrorCount,
      errorRate: hourlyErrorRate,
      topSignatures: pickTopSignatures(prng, hourlyErrorCount, dayMidnightMs),
    });
  }

  // why: WP-204 §Aggregation rule — series sorted ascending by `date` via
  // Unicode code-unit comparison. Stable sort preserves daily / hourly
  // pair ordering within a single date in their factory-emission order;
  // the composable's window-size filters operate on the post-sort series.
  entries.sort(ascendingByDate);

  return wrapMock(entries as readonly ErrorRateSnapshot[], nowMs);
}

/**
 * Build a deterministic top-5 `ErrorSignature[]` list for a single
 * snapshot. The total `errorCount` is partitioned across a sampled
 * subset of `MOCK_SIGNATURE_CATALOGUE` entries; counts decrease in
 * geometric-ish fashion so the top entry dominates and the tail is
 * realistic. Final list is sorted by `count` desc, tiebreak `signature`
 * asc Unicode code-unit per WP-204 §Error rate math invariants.
 */
function pickTopSignatures(
  prng: () => number,
  totalErrorCount: number,
  dayMidnightMs: number,
): readonly ErrorSignature[] {
  if (totalErrorCount === 0) {
    return [];
  }
  const signatureIndexes = pickDistinctIndexes(prng, MOCK_SIGNATURE_CATALOGUE.length, 5);
  const rawWeights: number[] = [];
  for (let i = 0; i < signatureIndexes.length; i++) {
    rawWeights.push(sampleRange(prng, 0.5, 1.0) * Math.pow(0.6, i));
  }
  let weightSum = 0;
  for (const weight of rawWeights) {
    weightSum += weight;
  }
  const counts: number[] = [];
  for (const weight of rawWeights) {
    counts.push(Math.max(1, Math.round((weight / weightSum) * totalErrorCount)));
  }
  const result: ErrorSignature[] = [];
  for (let i = 0; i < signatureIndexes.length; i++) {
    const signatureIndex = signatureIndexes[i];
    if (signatureIndex === undefined) {
      continue;
    }
    const signatureText = MOCK_SIGNATURE_CATALOGUE[signatureIndex];
    if (signatureText === undefined) {
      continue;
    }
    const occurrencesInSlot = counts[i] ?? 1;
    // Sample two intra-day second offsets and anchor them to the
    // snapshot's UTC midnight so firstSeen / lastSeen are full
    // epoch-ms timestamps (not 1970-anchored offsets). firstSeen <=
    // lastSeen by construction.
    const lateOffsetSeconds = Math.round(sampleRange(prng, 0, 86399));
    const earlyOffsetSeconds = Math.round(sampleRange(prng, 0, lateOffsetSeconds));
    result.push({
      signature: signatureText,
      count: occurrencesInSlot,
      firstSeen: dayMidnightMs + earlyOffsetSeconds * 1000,
      lastSeen: dayMidnightMs + lateOffsetSeconds * 1000,
    });
  }
  // why: WP-204 §Error rate math invariants — top-5 ordering: primary
  // key `count` descending; tiebreak `signature` ascending under Unicode
  // code-unit comparison so the operator's view is stable across
  // identical-input runs.
  result.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    if (left.signature < right.signature) {
      return -1;
    }
    if (left.signature > right.signature) {
      return 1;
    }
    return 0;
  });
  return result;
}

/**
 * Draw `count` distinct integer indexes from `[0, populationSize)` using
 * the supplied PRNG. Reservoir-free sampling via the swap-into-place
 * trick (Fisher-Yates partial shuffle) — deterministic, no rejection
 * loops. Used by `pickTopSignatures` to choose a stable subset of the
 * signature catalogue per snapshot.
 */
function pickDistinctIndexes(
  prng: () => number,
  populationSize: number,
  count: number,
): readonly number[] {
  const effectiveCount = Math.min(populationSize, count);
  const population: number[] = [];
  for (let i = 0; i < populationSize; i++) {
    population.push(i);
  }
  for (let i = 0; i < effectiveCount; i++) {
    const swapIndex = i + Math.floor(prng() * (populationSize - i));
    const tmp = population[i];
    const target = population[swapIndex];
    if (tmp === undefined || target === undefined) {
      continue;
    }
    population[i] = target;
    population[swapIndex] = tmp;
  }
  return population.slice(0, effectiveCount);
}

/**
 * Deterministic mock generator for `InfraCostEntry[]`. Produces one entry
 * per `InfraCostVendor` per UTC day in the normalized range. Per-day
 * cents derive from each vendor's `monthlyBudgetCents / 30` baseline ×
 * a per-day multiplier in `[0.5, 1.5]`. The implied per-vendor monthly
 * sum stays well within `[0, 200%]` of `monthlyBudgetCents` (the upper
 * bound at `≤ 200%` is the §Mock value bounds invariant; this factory's
 * worst-case ≈ 150% so the bound is satisfied with headroom).
 *
 * Output is sorted ascending by `date` (Unicode code-unit comparison)
 * and iterates `INFRA_COST_VENDORS` in canonical array order.
 */
export function mockInfraCostEntries(
  range: DateRange,
  nowMs: number,
): ServiceResponse<readonly InfraCostEntry[]> {
  // why: D-19605 — same normalization + seeding pattern; domain prefix
  // `ops-cost` keeps this seed disjoint from the uptime / error
  // factories.
  const normalized = normalizeRange(range, nowMs);
  const seed = hashRange('ops-cost|' + normalized.start + '|' + normalized.end);
  // why: D-20402 — mock-mode-first per WP-197 D-19702.
  const prng = createPrng(seed);
  const dates = buildDateRange(normalized.start, normalized.end);

  // Build a per-vendor budget lookup so we don't repeatedly scan
  // INFRA_COST_BUDGETS inside the inner loop. Iteration is canonical
  // via INFRA_COST_VENDORS.
  const monthlyBudgetByVendor: Record<InfraCostVendor, number> = {
    render: 0,
    cloudflare: 0,
    postgres: 0,
    hanko: 0,
  };
  for (const budgetEntry of INFRA_COST_BUDGETS) {
    monthlyBudgetByVendor[budgetEntry.vendor] = budgetEntry.monthlyBudgetCents;
  }

  const entries: InfraCostEntry[] = [];
  // why: WP-204 §Determinism scope — iterate INFRA_COST_VENDORS in
  // canonical array order so per-vendor assembly is byte-identical
  // across JS runtimes.
  for (const vendor of INFRA_COST_VENDORS) {
    const monthlyBudget = monthlyBudgetByVendor[vendor];
    // Per-day baseline = monthly budget / 30 days; multiplier in
    // [0.5, 1.5] keeps each day under 5% of monthly budget (worst-case
    // 30-day sum ≈ 150% of monthly budget — well under the locked
    // 200% bound).
    const dailyBaseCents = monthlyBudget / 30;
    for (const date of dates) {
      const multiplier = sampleRange(prng, 0.5, 1.5);
      // why: §Mock value bounds + D-19601 integer-cents discipline —
      // amountCents is a non-negative integer; rounding lives at the
      // factory boundary so composable arithmetic stays in integer-
      // cents space without re-rounding drift.
      const amountCents = Math.max(0, Math.round(dailyBaseCents * multiplier));
      entries.push({
        vendor,
        date,
        amountCents,
        // why: D-20401 single-currency lock — every entry carries the
        // literal `'USD'`. Multi-currency is a future WP; widening
        // here would require composable + widget + display-formatter
        // changes downstream.
        currency: 'USD',
      });
    }
  }

  // why: WP-204 §Aggregation rule — series sorted ascending by `date`
  // via Unicode code-unit comparison. `localeCompare` is forbidden per
  // D-19605 / D-19904.
  entries.sort(ascendingByDate);

  return wrapMock(entries as readonly InfraCostEntry[], nowMs);
}
