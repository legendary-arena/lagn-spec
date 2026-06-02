// why: D-19605 (DateRange Normalization extension) + pre-flight RS-1
// disposition — the existing `DateRange` type is a closed string union
// (`'7d' | '14d' | '30d' | '90d'`) inherited from WP-157; the harden-round-2
// determinism contract assumes a `{ start, end }` shape suitable for the
// hash-of-range seed. This file is the SINGLE resolution point from the
// union string to a canonical `YYYY-MM-DD` date pair. Without normalization
// at the boundary, `'2026-06-01'` and `'2026-06-01T00:00:00Z'` would seed
// differently and break every cross-widget consistency check the
// harden-round-2 contract just locked. The contract is: `YYYY-MM-DD` ISO
// strings (no time, no timezone, no `Z`), inclusive both ends, error on
// `start > end` lexically. Service-boundary call sites only — widgets
// never invoke normalization themselves; they receive an already-normalized
// pair from the service function.

import type { DateRange } from '../types/index.js';

const MS_PER_DAY = 86400000;

const DATE_RANGE_DAYS: Record<DateRange, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

export interface NormalizedRange {
  readonly start: string;
  readonly end: string;
}

/**
 * Format a Date as the canonical `YYYY-MM-DD` string used by the dashboard's
 * mock determinism seed. The time component is discarded entirely; the date
 * portion reflects the date in the UTC timezone of the input Date.
 */
function toIsoDate(date: Date): string {
  const isoString = date.toISOString();
  return isoString.slice(0, 10);
}

/**
 * Resolve a `DateRange` union value to a `{ start, end }` pair of canonical
 * `YYYY-MM-DD` strings. The `end` anchor is "today" derived from the supplied
 * `nowMs` (a UTC millisecond timestamp); the `start` is `end - (days - 1)`
 * since the range is inclusive on both ends. A `'7d'` selection produces 7
 * data points: today plus the six preceding days.
 *
 * `nowMs` is a parameter (not a `Date.now()` read inside the function) so the
 * function remains pure — the same inputs always produce the same output.
 * Test code passes a fixed timestamp; production callers pass `Date.now()`
 * at the service-call boundary.
 *
 * Throws a full-sentence error when the resolved start is lexically greater
 * than the resolved end (which cannot happen for the four valid `DateRange`
 * values today, but the guard enforces the contract for any future caller
 * that constructs a `NormalizedRange` directly).
 */
export function normalizeRange(range: DateRange, nowMs: number): NormalizedRange {
  const dayCount = DATE_RANGE_DAYS[range];
  const endDate = new Date(nowMs);
  const endIso = toIsoDate(endDate);
  const startDate = new Date(nowMs - (dayCount - 1) * MS_PER_DAY);
  const startIso = toIsoDate(startDate);
  assertOrdered(startIso, endIso);
  return { start: startIso, end: endIso };
}

/**
 * Validate that an already-constructed `{ start, end }` pair satisfies the
 * inclusive-both-ends contract: `start <= end` under lexical comparison
 * (which matches chronological order for zero-padded `YYYY-MM-DD`). Throws
 * a full-sentence error naming both offending values when the order is
 * inverted. Used by `normalizeRange` to guard the resolved pair and by the
 * test suite to exercise the guard.
 */
export function assertOrdered(start: string, end: string): void {
  if (start > end) {
    throw new Error(
      `DateRange normalization failed because the start value "${start}" is later than the end value "${end}"; start must be lexically less than or equal to end.`,
    );
  }
}
