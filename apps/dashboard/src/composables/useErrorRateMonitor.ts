import { computed, type ComputedRef } from 'vue';
import type {
  ErrorRateSnapshot,
  ErrorSignature,
  ServiceResponse,
} from '../types/index.js';

const HOURLY_WINDOW_SECONDS = 3600;
const DAILY_WINDOW_SECONDS = 86400;
const TOP_SIGNATURE_LIMIT = 5;

export interface ErrorRateTotals {
  readonly totalRequests: number;
  readonly errorCount: number;
}

export interface UseErrorRateMonitorReturn {
  series: ComputedRef<readonly ErrorRateSnapshot[]>;
  currentRate: ComputedRef<number>;
  rollingDailyRate: ComputedRef<number>;
  totals: ComputedRef<ErrorRateTotals>;
  topSignaturesAcrossRange: ComputedRef<readonly ErrorSignature[]>;
  source: ComputedRef<ServiceResponse<unknown>['source']>;
  updatedAt: ComputedRef<number>;
}

/**
 * Derive operator-facing error-rate aggregates from an
 * `ErrorRateSnapshot[]` response. Per WP-204 §Composable Source Contract,
 * accepts a getter returning the FULL `ServiceResponse` envelope (not
 * the bare array) so widgets read freshness from the composable's
 * returned `source` / `updatedAt`.
 *
 * Derivations:
 *
 * - `series` — passthrough of `response.data` (the full unfiltered list;
 *   per-derivation filtering happens inside this composable, never in
 *   the widget template per §"Current" snapshot selection).
 * - `currentRate` — `errorRate` of the lex-greatest-`date` entry whose
 *   `windowSeconds === 3600`. Empty subset returns `0` per D-19908.
 * - `rollingDailyRate` — arithmetic mean of `errorRate` across entries
 *   whose `windowSeconds === 86400`. Empty subset returns `0`.
 *   Mixed-window aggregation is forbidden — the two bucket sizes are
 *   not commensurable without rescaling and v1 does not rescale.
 * - `totals` — `totalRequests` and `errorCount` sums across the WHOLE
 *   series (both window sizes). The totals reflect everything captured
 *   in the operator's selected range; the per-window-size filters
 *   apply only to the rate-derivation accessors above.
 * - `topSignaturesAcrossRange` — top 5 `ErrorSignature` entries by
 *   aggregate `count` (descending), tiebreak `signature` ascending
 *   under Unicode code-unit comparison. Aggregation merges identical
 *   `signature` strings (sum-of-counts + min `firstSeen` + max
 *   `lastSeen`); different signatures stay separate.
 */
export function useErrorRateMonitor(
  responseGetter: () => ServiceResponse<readonly ErrorRateSnapshot[]>,
): UseErrorRateMonitorReturn {
  const response = computed(() => responseGetter());

  const series = computed<readonly ErrorRateSnapshot[]>(() => response.value.data);

  // why: WP-204 §Composable Source Contract — widgets read freshness
  // from this passthrough. MOCK → LIVE flip is a getter substitution
  // at the paired server WP; widget templates stay byte-identical.
  const source = computed<ServiceResponse<unknown>['source']>(() => response.value.source);
  const updatedAt = computed<number>(() => response.value.updatedAt);

  const currentRate = computed<number>(() => {
    // why: §"Current" snapshot selection lock — `currentRate` filters
    // to `windowSeconds = 3600` ONLY. Pulling daily-bucket rows
    // (86400) into this would silently corrupt the rate because the
    // two bucket sizes are not commensurable without rescaling, and
    // v1 does not rescale. Empty subset → `0` per D-19908 numeric-zero
    // semantics (zero is meaningful "no current data" — NOT NaN).
    let latest: ErrorRateSnapshot | null = null;
    for (const entry of series.value) {
      if (entry.windowSeconds !== HOURLY_WINDOW_SECONDS) {
        continue;
      }
      // why: §Latest-entry selection — sort on the `YYYY-MM-DD` string
      // under Unicode code-unit comparison only. Bare `>` here (NOT a
      // parsed-Date comparator) preserves the locale-independent
      // ordering the spec mandates.
      if (latest === null || entry.date > latest.date) {
        latest = entry;
      }
    }
    if (latest === null) {
      return 0;
    }
    return latest.errorRate;
  });

  const rollingDailyRate = computed<number>(() => {
    // why: §"Current" snapshot selection lock — `rollingDailyRate`
    // filters to `windowSeconds = 86400` ONLY. The daily rate is the
    // equal-weighted arithmetic mean over daily-bucket entries; pulling
    // 1h-bucket rows would silently corrupt the rate (a 1h bucket
    // with 100 errors / 10,000 requests reports the same errorRate
    // as a 24h bucket with 2,400 errors / 240,000 requests, but the
    // operator's interpretation of "rolling 24h" is the daily-bucket
    // aggregate). Empty subset → `0` per D-19908 numeric-zero.
    let sum = 0;
    let count = 0;
    for (const entry of series.value) {
      if (entry.windowSeconds !== DAILY_WINDOW_SECONDS) {
        continue;
      }
      sum += entry.errorRate;
      count += 1;
    }
    if (count === 0) {
      return 0;
    }
    return sum / count;
  });

  const totals = computed<ErrorRateTotals>(() => {
    let totalRequests = 0;
    let errorCount = 0;
    for (const entry of series.value) {
      totalRequests += entry.totalRequests;
      errorCount += entry.errorCount;
    }
    return { totalRequests, errorCount };
  });

  const topSignaturesAcrossRange = computed<readonly ErrorSignature[]>(() => {
    // why: §Error rate math invariants — cross-range aggregation merges
    // identical `signature` strings (sum-of-counts; min `firstSeen`;
    // max `lastSeen`). Different signatures stay separate even if they
    // look similar (a single character difference is a different
    // signature). Map keyed by `signature` (literal string) keeps the
    // merge contract explicit; iteration order is irrelevant because
    // the final list is sorted by the locked tie-break.
    const aggregateBySignature = new Map<string, ErrorSignature>();
    for (const snapshot of series.value) {
      for (const signature of snapshot.topSignatures) {
        const existing = aggregateBySignature.get(signature.signature);
        if (existing === undefined) {
          aggregateBySignature.set(signature.signature, {
            signature: signature.signature,
            count: signature.count,
            firstSeen: signature.firstSeen,
            lastSeen: signature.lastSeen,
          });
          continue;
        }
        aggregateBySignature.set(signature.signature, {
          signature: signature.signature,
          count: existing.count + signature.count,
          firstSeen: Math.min(existing.firstSeen, signature.firstSeen),
          lastSeen: Math.max(existing.lastSeen, signature.lastSeen),
        });
      }
    }
    const flattened: ErrorSignature[] = [];
    for (const value of aggregateBySignature.values()) {
      flattened.push(value);
    }
    // why: §Error rate math invariants — top-5 ordering: primary key
    // `count` descending; tiebreak `signature` ascending under Unicode
    // code-unit comparison. Bare `<` / `>` (NOT `localeCompare`) per
    // D-19605 / D-19904 locale-independence invariant.
    flattened.sort((left, right) => {
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
    return flattened.slice(0, TOP_SIGNATURE_LIMIT);
  });

  return {
    series,
    currentRate,
    rollingDailyRate,
    totals,
    topSignaturesAcrossRange,
    source,
    updatedAt,
  };
}
