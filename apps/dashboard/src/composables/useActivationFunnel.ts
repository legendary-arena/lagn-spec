import { computed, type ComputedRef } from 'vue';
import {
  ACTIVATION_STEPS,
  type ActivationFunnelStep,
  type ActivationStep,
  type ServiceResponse,
} from '../types/index.js';

export interface UseActivationFunnelReturn {
  stepCounts: ComputedRef<Readonly<Record<ActivationStep, number>>>;
  stepToStepConversion: ComputedRef<Readonly<Record<ActivationStep, number>>>;
  overallConversion: ComputedRef<number>;
  source: ComputedRef<ServiceResponse<unknown>['source']>;
  updatedAt: ComputedRef<number>;
}

/**
 * Derive funnel aggregates from an `ActivationFunnelStep[]` response. Per
 * WP-203 §Composable Source Contract, the composable accepts the FULL
 * `ServiceResponse<readonly ActivationFunnelStep[]>` envelope.
 *
 * Derivations:
 *
 * - `stepCounts` — per-step sum of `count` across the full series window.
 *   Always includes all 4 entries of `ACTIVATION_STEPS` (missing steps
 *   default to `0`); the canonical array is the iteration source per
 *   §Determinism scope.
 * - `stepToStepConversion` — per-step `nextCount / currentCount` ratio.
 *   The last step (`first-match-completed`) has no next step; its entry
 *   is `0` (no outgoing conversion). Zero-denominator returns `0` (NOT
 *   `NaN`) per §Conversion invariants.
 * - `overallConversion` — the LITERAL end-to-end ratio
 *   `stepCounts['first-match-completed'] / stepCounts['signup-start']`.
 *   NOT the product of step-to-step ratios — product silently diverges
 *   under integer rounding (see test for the synthetic divergence case).
 */
export function useActivationFunnel(
  responseGetter: () => ServiceResponse<readonly ActivationFunnelStep[]>,
): UseActivationFunnelReturn {
  const response = computed(() => responseGetter());

  // why: WP-203 §Composable Source Contract — widgets read freshness from
  // the composable's `source` / `updatedAt`, NOT directly from the
  // service layer. MOCK → LIVE flip in WP-205 is a getter-only change.
  const source = computed<ServiceResponse<unknown>['source']>(() => response.value.source);
  const updatedAt = computed<number>(() => response.value.updatedAt);

  const stepCounts = computed<Readonly<Record<ActivationStep, number>>>(() => {
    // why: WP-203 §Aggregation rule + §Determinism scope — initialize all
    // 4 steps to `0` first so widgets can render the full funnel shape
    // even when input omits a step (missing step → 0, not undefined).
    // Canonical array iteration prevents object-key-order surprises.
    const accumulator: Record<ActivationStep, number> = {
      'signup-start': 0,
      'signup-complete': 0,
      'first-match-started': 0,
      'first-match-completed': 0,
    };
    for (const entry of response.value.data) {
      accumulator[entry.step] += entry.count;
    }
    return accumulator;
  });

  const stepToStepConversion = computed<Readonly<Record<ActivationStep, number>>>(() => {
    const counts = stepCounts.value;
    const conversion: Record<ActivationStep, number> = {
      'signup-start': 0,
      'signup-complete': 0,
      'first-match-started': 0,
      'first-match-completed': 0,
    };
    // why: WP-203 §Conversion invariants — step-to-step conversion =
    // stepCounts[ACTIVATION_STEPS[n+1]] / stepCounts[ACTIVATION_STEPS[n]].
    // Walk indices 0..len-2; the last step has no next step so its
    // conversion entry stays at `0`. Zero-denominator returns `0` (NOT
    // `NaN`) per D-19908.
    for (let stepIndex = 0; stepIndex < ACTIVATION_STEPS.length - 1; stepIndex++) {
      const currentStep = ACTIVATION_STEPS[stepIndex];
      const nextStep = ACTIVATION_STEPS[stepIndex + 1];
      if (currentStep === undefined || nextStep === undefined) {
        continue;
      }
      const currentCount = counts[currentStep];
      conversion[currentStep] = currentCount === 0 ? 0 : counts[nextStep] / currentCount;
    }
    return conversion;
  });

  const overallConversion = computed<number>(() => {
    // why: WP-203 §Conversion invariants — overall conversion is the
    // LITERAL end-to-end ratio stepCounts['first-match-completed'] /
    // stepCounts['signup-start']. NOT the product of step-to-step
    // conversions. Product-of-ratios silently diverges from the literal
    // ratio under integer-count rounding and would cause the funnel
    // widget's footer to disagree with the per-stage tooltip. The
    // dedicated test asserts divergence under a synthetic rounding case.
    const counts = stepCounts.value;
    const start = counts['signup-start'];
    if (start === 0) {
      // why: D-19908 — zero-start returns `0`, not `NaN`. The widget
      // empty-state arm drops in before this evaluates in display but
      // the composable's contract still owns the safe return value.
      return 0;
    }
    return counts['first-match-completed'] / start;
  });

  return {
    stepCounts,
    stepToStepConversion,
    overallConversion,
    source,
    updatedAt,
  };
}
