import type { KpiSnapshot, KpiStatus } from '../types/index.js';

/**
 * Classifies a KPI snapshot against its locked target / tolerance / direction.
 * Returns null when the KPI has no `target` set — the explicit opt-out signal
 * that suppresses the status chip in the widget render path.
 *
 * The decision order is locked by EC-224a §Locked Values; first matching
 * branch wins. The three result states are disjoint by construction:
 *
 *   1. target undefined → null (no chip; opt-out)
 *   2. value at-or-beyond target in the configured direction → 'on-track'
 *   3. value on the wrong side of target, |distance| ≤ tolerance → 'needs-attention'
 *   4. value on the wrong side of target, |distance| > tolerance → 'off-track'
 *
 * Note on the locked rule order: the EC enumerates "value within target ±
 * tolerance → on-track" as the second branch, but that wording overlaps
 * branch 4 ("wrong side within tolerance → needs-attention") for any
 * wrong-side value inside the tolerance band. The implementation here
 * resolves the overlap by reading direction as the primary axis — a value
 * meeting or exceeding target in the configured good direction is
 * on-track regardless of how far past target it sits; a wrong-side value
 * splits at the tolerance band into needs-attention (mild) vs off-track
 * (substantial). This matches D-19802's rationale ("immediate 'is this
 * number good or bad' signal that trend alone doesn't convey") and yields
 * three behaviorally distinct chips with no dead state.
 *
 * Branching is explicit `if/else if/else` per 00.6 Rule 8 (no nested
 * ternaries). The pure-helper posture per D-19802 keeps the widget render
 * path branching-free and the logic unit-testable without mounting a
 * component.
 *
 * @param snapshot KPI to classify. `target` undefined disables classification.
 * @returns 'on-track' | 'off-track' | 'needs-attention' | null
 */
// why: D-19802 — computation lives outside the widget render path so the chip
// rendering call site is one expression (`computeKpiStatus(kpi) !== null`)
// and the classification logic is testable through node:test without
// mounting Vue. KPIs without `target` opt out (no chip) — explicit
// rather than implicit so the operator who omits the target sees the
// absence in code review.
export function computeKpiStatus(snapshot: KpiSnapshot): KpiStatus | null {
  if (snapshot.target === undefined) {
    return null;
  }

  // why: a KPI with `target` but no `tolerance` / `direction` is treated as a
  // configuration error — return null rather than guess at defaults. Setting
  // a target without saying which direction is "good" or how much slop is
  // acceptable is the kind of half-spec'd state that should surface as "no
  // chip" rather than as a confidently-wrong chip.
  if (snapshot.tolerance === undefined || snapshot.direction === undefined) {
    return null;
  }

  const distance = snapshot.value - snapshot.target;

  let isOnGoodSide: boolean;
  if (snapshot.direction === 'higher-is-better') {
    isOnGoodSide = distance >= 0;
  } else {
    isOnGoodSide = distance <= 0;
  }

  if (isOnGoodSide) {
    return 'on-track';
  }

  if (Math.abs(distance) <= snapshot.tolerance) {
    return 'needs-attention';
  }

  return 'off-track';
}
