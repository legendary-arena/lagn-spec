import { computed, type ComputedRef } from 'vue';
import {
  PUBLIC_SURFACES,
  type PublicSurfaceKey,
  type ServiceResponse,
  type UptimeProbe,
} from '../types/index.js';

export interface WorstSurface {
  readonly surface: PublicSurfaceKey;
  readonly uptimePercent: number;
}

export interface UsePublicSurfaceHealthReturn {
  series: ComputedRef<readonly UptimeProbe[]>;
  uptimeBySurface: ComputedRef<Readonly<Record<PublicSurfaceKey, number>>>;
  worstSurface: ComputedRef<WorstSurface | null>;
  lastIncidentBySurface: ComputedRef<Readonly<Record<PublicSurfaceKey, number | null>>>;
  source: ComputedRef<ServiceResponse<unknown>['source']>;
  updatedAt: ComputedRef<number>;
}

/**
 * Derive operator-facing per-surface aggregates from a `UptimeProbe[]`
 * response. Per WP-204 §Composable Source Contract, accepts a getter
 * returning the FULL `ServiceResponse` envelope (not the bare array) so
 * widgets read freshness from the composable's returned `source` /
 * `updatedAt` rather than from the service layer. This is what makes the
 * MOCK → LIVE flip in the paired server WP a pure getter substitution.
 *
 * Derivations:
 *
 * - `series` — passthrough of `response.data`, expected pre-sorted
 *   ascending by `date` (the mock factory pre-sorts; the composable does
 *   NOT re-sort here so a future LIVE source can supply pre-sorted data
 *   without redundant work).
 * - `uptimeBySurface` — per-surface arithmetic mean of `uptimePercent`
 *   over the days that have a probe entry for that surface. Per the
 *   §Missing-days exclusion lock, days with NO probe for a given
 *   surface are EXCLUDED from that surface's denominator — NOT
 *   zero-filled (would bias low), NOT 100-filled (would bias high).
 *   Surfaces with zero probes return `0`.
 * - `worstSurface` — the surface with the lowest mean uptime; ties
 *   broken by canonical `PUBLIC_SURFACES` order. Returns `null` for
 *   empty input (no probes at all across the range).
 * - `lastIncidentBySurface` — most-recent `lastIncidentTimestamp` per
 *   surface across the range; `null` if no incidents observed for that
 *   surface.
 */
export function usePublicSurfaceHealth(
  responseGetter: () => ServiceResponse<readonly UptimeProbe[]>,
): UsePublicSurfaceHealthReturn {
  const response = computed(() => responseGetter());

  const series = computed<readonly UptimeProbe[]>(() => response.value.data);

  // why: WP-204 §Composable Source Contract (extends D-19607 Shared Source
  // Contract) — widgets read freshness from the composable's `source` /
  // `updatedAt`, NOT directly from the service layer. This passthrough
  // is what makes the MOCK → LIVE swap in the paired server WP a
  // getter-only change; widget templates stay byte-identical pre/post
  // flip.
  const source = computed<ServiceResponse<unknown>['source']>(() => response.value.source);
  const updatedAt = computed<number>(() => response.value.updatedAt);

  const uptimeBySurface = computed<Readonly<Record<PublicSurfaceKey, number>>>(() => {
    const sumBySurface: Record<PublicSurfaceKey, number> = {
      marketing: 0,
      play: 0,
      cards: 0,
      api: 0,
    };
    const countBySurface: Record<PublicSurfaceKey, number> = {
      marketing: 0,
      play: 0,
      cards: 0,
      api: 0,
    };
    for (const entry of series.value) {
      sumBySurface[entry.surface] += entry.uptimePercent;
      countBySurface[entry.surface] += 1;
    }
    const result: Record<PublicSurfaceKey, number> = {
      marketing: 0,
      play: 0,
      cards: 0,
      api: 0,
    };
    // why: WP-204 §Determinism scope — iterate PUBLIC_SURFACES in
    // canonical array order so per-surface assembly is byte-identical
    // across JS runtimes. Object-key iteration on derived sums would
    // be observable-order-dependent and is forbidden.
    for (const surface of PUBLIC_SURFACES) {
      const probeCount = countBySurface[surface];
      // why: §Missing-days exclusion lock — the denominator is
      // "number of probes for this surface in range", NOT "number of
      // days in range". A surface with 3 probes at 99% over a 30-day
      // range reports mean = 99.0, NOT 9.9 (zero-fill) or ~99.9
      // (100-fill). Days with no probe are excluded entirely. Zero-
      // probe surfaces return 0 per D-19908 numeric-zero semantics
      // (zero is a meaningful "no data observed" sentinel here — the
      // widget's worst-surface tie-break treats it as the lowest
      // possible value, which is the operationally correct read).
      if (probeCount === 0) {
        result[surface] = 0;
        continue;
      }
      // why: §Uptime math invariants — mean rounded to 1 decimal at the
      // composable boundary so display layer receives the locked
      // precision. `Math.round(value * 10) / 10` is the asymmetric
      // half-up rounding used elsewhere in the dashboard (D-19601
      // family).
      result[surface] = Math.round((sumBySurface[surface] / probeCount) * 10) / 10;
    }
    return result;
  });

  const worstSurface = computed<WorstSurface | null>(() => {
    if (series.value.length === 0) {
      return null;
    }
    const meansBySurface = uptimeBySurface.value;
    let chosen: WorstSurface | null = null;
    // why: WP-204 §Determinism scope — iterate PUBLIC_SURFACES in
    // canonical order; ties on uptimePercent are broken by first-seen
    // canonical-order (the `<` strictly-less-than comparison below
    // means the first encountered surface at the minimum value wins,
    // matching "ties broken by canonical PUBLIC_SURFACES order").
    for (const surface of PUBLIC_SURFACES) {
      const candidate = meansBySurface[surface];
      if (chosen === null || candidate < chosen.uptimePercent) {
        chosen = { surface, uptimePercent: candidate };
      }
    }
    return chosen;
  });

  const lastIncidentBySurface = computed<Readonly<Record<PublicSurfaceKey, number | null>>>(() => {
    const result: Record<PublicSurfaceKey, number | null> = {
      marketing: null,
      play: null,
      cards: null,
      api: null,
    };
    for (const entry of series.value) {
      const incidentTs = entry.lastIncidentTimestamp;
      if (incidentTs === null) {
        continue;
      }
      const existing = result[entry.surface];
      if (existing === null || incidentTs > existing) {
        result[entry.surface] = incidentTs;
      }
    }
    return result;
  });

  return {
    series,
    uptimeBySurface,
    worstSurface,
    lastIncidentBySurface,
    source,
    updatedAt,
  };
}
