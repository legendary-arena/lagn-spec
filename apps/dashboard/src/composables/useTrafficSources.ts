import { computed, type ComputedRef } from 'vue';
import {
  ACQUISITION_CHANNELS,
  type AcquisitionChannel,
  type ServiceResponse,
  type TrafficSource,
} from '../types/index.js';

export interface UseTrafficSourcesReturn {
  series: ComputedRef<readonly TrafficSource[]>;
  totalsByChannel: ComputedRef<Readonly<Record<AcquisitionChannel, number>>>;
  totalVisitors: ComputedRef<number>;
  totalSignups: ComputedRef<number>;
  signupConversionByChannel: ComputedRef<Readonly<Record<AcquisitionChannel, number>>>;
  source: ComputedRef<ServiceResponse<unknown>['source']>;
  updatedAt: ComputedRef<number>;
}

/**
 * Derive operator-facing aggregates from a `TrafficSource[]` response. Per
 * WP-203 §Composable Source Contract, the composable accepts a getter
 * returning the FULL `ServiceResponse` envelope (not the bare array) so
 * widgets read freshness from the composable's returned `source` /
 * `updatedAt` rather than from the service layer. This is what makes the
 * MOCK → LIVE flip in WP-205 a pure getter substitution; the composable
 * and the widget files stay byte-identical pre/post flip.
 *
 * Derivations:
 *
 * - `series` — passthrough of `response.data`, sorted ascending by `date`
 *   per the §Aggregation rule (the mock factory already sorts; the
 *   composable does NOT re-sort here so a future LIVE source can supply
 *   pre-sorted data without redundant work).
 * - `totalsByChannel` — sum of `visitorCount` for each `AcquisitionChannel`
 *   across the full series window; iteration is over `ACQUISITION_CHANNELS`
 *   canonical array (not over object keys) per §Determinism scope.
 * - `totalVisitors` — sum of `visitorCount` across every entry.
 * - `totalSignups` — sum of `signupCount` across every entry.
 * - `signupConversionByChannel` — per-channel `signups / visitors` ratio.
 *   Zero-visitor channels return `0` (NOT `NaN`) per D-19908 numeric-zero
 *   semantics + WP-203 §Conversion invariants zero-denominator guard.
 */
export function useTrafficSources(
  responseGetter: () => ServiceResponse<readonly TrafficSource[]>,
): UseTrafficSourcesReturn {
  const response = computed(() => responseGetter());

  const series = computed<readonly TrafficSource[]>(() => response.value.data);

  // why: WP-203 §Composable Source Contract (extends D-19607 Shared Source
  // Contract) — widgets read freshness from the composable's `source` /
  // `updatedAt`, NOT directly from the service layer. This passthrough is
  // what makes the MOCK → LIVE swap in WP-205 a getter-only change; the
  // widget templates stay byte-identical pre/post flip.
  const source = computed<ServiceResponse<unknown>['source']>(() => response.value.source);
  const updatedAt = computed<number>(() => response.value.updatedAt);

  const totalsByChannel = computed<Readonly<Record<AcquisitionChannel, number>>>(() => {
    const accumulator: Record<AcquisitionChannel, number> = {
      direct: 0,
      search: 0,
      referral: 0,
      paid: 0,
    };
    for (const entry of series.value) {
      accumulator[entry.channel] += entry.visitorCount;
    }
    return accumulator;
  });

  const totalVisitors = computed<number>(() => {
    let sum = 0;
    for (const entry of series.value) {
      sum += entry.visitorCount;
    }
    return sum;
  });

  const totalSignups = computed<number>(() => {
    let sum = 0;
    for (const entry of series.value) {
      sum += entry.signupCount;
    }
    return sum;
  });

  const signupConversionByChannel = computed<Readonly<Record<AcquisitionChannel, number>>>(() => {
    const visitorByChannel: Record<AcquisitionChannel, number> = {
      direct: 0,
      search: 0,
      referral: 0,
      paid: 0,
    };
    const signupByChannel: Record<AcquisitionChannel, number> = {
      direct: 0,
      search: 0,
      referral: 0,
      paid: 0,
    };
    for (const entry of series.value) {
      visitorByChannel[entry.channel] += entry.visitorCount;
      signupByChannel[entry.channel] += entry.signupCount;
    }
    const conversion: Record<AcquisitionChannel, number> = {
      direct: 0,
      search: 0,
      referral: 0,
      paid: 0,
    };
    // why: WP-203 §Determinism scope — iterate ACQUISITION_CHANNELS in
    // canonical array order. Object-key iteration order on derived
    // accumulators would be observable-order-dependent across runtimes.
    for (const channel of ACQUISITION_CHANNELS) {
      const visitors = visitorByChannel[channel];
      // why: D-19908 numeric-zero semantics + WP-203 §Conversion invariants
      // zero-denominator guard — zero-visitor channels return `0`, never
      // `NaN`. `NaN%` rendering in a widget is a top-listed Pre-Commit
      // Failure Smell in EC-231.
      conversion[channel] = visitors === 0 ? 0 : signupByChannel[channel] / visitors;
    }
    return conversion;
  });

  return {
    series,
    totalsByChannel,
    totalVisitors,
    totalSignups,
    signupConversionByChannel,
    source,
    updatedAt,
  };
}
