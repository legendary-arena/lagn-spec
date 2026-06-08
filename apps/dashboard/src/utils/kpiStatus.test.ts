import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeKpiStatus } from './kpiStatus.js';
import { KPI_STATUSES, type KpiSnapshot, type KpiStatus } from '../types/index.js';

/**
 * Helper for assembling a KpiSnapshot with the four invariant fields filled
 * in. Tests override only the threshold-relevant fields to keep each case
 * focused.
 */
function snapshot(overrides: Partial<KpiSnapshot> = {}): KpiSnapshot {
  return {
    id: 'test-kpi',
    label: 'Test KPI',
    value: 100,
    previousValue: 90,
    unit: 'players',
    trend: 'up',
    ...overrides,
  };
}

// ============================================================================
// EC-224a §B — Sub-task B test coverage. The EC requires ≥7 tests; this file
// contributes 9 to cover the locked decision-order branches, both directions,
// the zero-tolerance edge case, and the KPI_STATUSES drift gate.
// ============================================================================

test('returns null when snapshot.target is undefined (opt-out signal)', () => {
  // why: the chip is opt-in per KPI; absence of target is the explicit
  // suppression signal so existing KPIs without thresholds continue to
  // render without a chip.
  assert.equal(computeKpiStatus(snapshot({ value: 100 })), null);
  assert.equal(
    computeKpiStatus(snapshot({ value: 100, tolerance: 10, direction: 'higher-is-better' })),
    null,
  );
});

test('returns null when target is set but tolerance or direction is missing', () => {
  // A half-specified configuration is treated as opt-out rather than a
  // confidently-wrong chip.
  assert.equal(
    computeKpiStatus(snapshot({ value: 100, target: 100, direction: 'higher-is-better' })),
    null,
  );
  assert.equal(computeKpiStatus(snapshot({ value: 100, target: 100, tolerance: 5 })), null);
});

test('returns on-track when value meets or exceeds target (higher-is-better)', () => {
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 100, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    ),
    'on-track',
  );
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 200, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    ),
    'on-track',
  );
});

test('returns on-track when value meets or falls below target (lower-is-better)', () => {
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 100, target: 100, tolerance: 5, direction: 'lower-is-better' }),
    ),
    'on-track',
  );
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 50, target: 100, tolerance: 5, direction: 'lower-is-better' }),
    ),
    'on-track',
  );
});

test('returns needs-attention when wrong side of target within tolerance band', () => {
  // higher-is-better, value just below target but within the tolerance band
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 96, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    ),
    'needs-attention',
  );
  // exactly at the band edge (|distance| === tolerance) is still needs-attention
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 95, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    ),
    'needs-attention',
  );
  // lower-is-better, value just above target within tolerance
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 104, target: 100, tolerance: 5, direction: 'lower-is-better' }),
    ),
    'needs-attention',
  );
});

test('returns off-track when wrong side of target beyond tolerance band', () => {
  // higher-is-better, value well below target
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 80, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    ),
    'off-track',
  );
  // lower-is-better, value well above target
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 200, target: 100, tolerance: 5, direction: 'lower-is-better' }),
    ),
    'off-track',
  );
});

test('zero-tolerance edge case: any wrong-side value is off-track (no needs-attention band)', () => {
  // With tolerance === 0, the needs-attention band collapses to empty.
  // Wrong-side values jump straight to off-track.
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 99, target: 100, tolerance: 0, direction: 'higher-is-better' }),
    ),
    'off-track',
  );
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 100, target: 100, tolerance: 0, direction: 'higher-is-better' }),
    ),
    'on-track',
  );
  assert.equal(
    computeKpiStatus(
      snapshot({ value: 101, target: 100, tolerance: 0, direction: 'higher-is-better' }),
    ),
    'on-track',
  );
});

test('result is always a member of KPI_STATUSES when non-null', () => {
  // Catches a future implementation that returns a fourth status without
  // updating the canonical array.
  const cases: KpiSnapshot[] = [
    snapshot({ value: 100, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    snapshot({ value: 96, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    snapshot({ value: 80, target: 100, tolerance: 5, direction: 'higher-is-better' }),
    snapshot({ value: 100, target: 100, tolerance: 5, direction: 'lower-is-better' }),
    snapshot({ value: 104, target: 100, tolerance: 5, direction: 'lower-is-better' }),
    snapshot({ value: 200, target: 100, tolerance: 5, direction: 'lower-is-better' }),
  ];
  for (const candidate of cases) {
    const status = computeKpiStatus(candidate);
    assert.notEqual(status, null);
    assert.ok(
      KPI_STATUSES.includes(status as KpiStatus),
      `computeKpiStatus returned a status (${String(status)}) absent from KPI_STATUSES — drift between union and canonical array.`,
    );
  }
});

test('KPI_STATUSES drift gate: array deep-equals locked union members in canonical order', () => {
  // why: mirrors MATCH_PHASES / TURN_STAGES canonical-array pattern from
  // `.claude/rules/code-style.md §Drift Detection`. Adding a 4th status to
  // KpiStatus without updating KPI_STATUSES (or vice versa) fails this
  // assertion loudly.
  assert.deepEqual(KPI_STATUSES, ['on-track', 'off-track', 'needs-attention']);
  assert.equal(KPI_STATUSES.length, 3);
  const unionCheck: ReadonlyArray<KpiStatus> = KPI_STATUSES;
  assert.equal(unionCheck.length, 3);
});
