import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usePublicSurfaceHealth } from './usePublicSurfaceHealth.js';
import { mockUptimeProbes } from '../services/opsHealthMocks.js';
import {
  PUBLIC_SURFACES,
  type PublicSurfaceKey,
  type ServiceResponse,
  type UptimeProbe,
  type UptimeStatus,
} from '../types/index.js';

// ============================================================================
// WP-204 / EC-232 — Sub-task B test coverage for `usePublicSurfaceHealth`.
// Required ≥ 7 tests per WP-204 §Acceptance Criteria → Build / Test / Layer;
// this file contributes 8 (per-surface mean uptime; worst-surface with
// canonical-order tie-break; missing-days exclusion; last-incident map;
// empty input + zero/null semantics; source/updatedAt passthrough;
// series passthrough preserves ascending-by-date order from mock;
// mock determinism). Every test follows the locked
// `should_<behavior>_when_<condition>` naming pattern.
// ============================================================================

function wrap(
  data: readonly UptimeProbe[],
  overrides: Partial<Pick<ServiceResponse<readonly UptimeProbe[]>, 'source' | 'updatedAt'>> = {},
): ServiceResponse<readonly UptimeProbe[]> {
  return {
    data,
    source: 'MOCK',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function probe(
  surface: PublicSurfaceKey,
  date: string,
  uptimePercent: number,
  options: {
    status?: UptimeStatus;
    incidentCount?: number;
    lastIncidentTimestamp?: number | null;
  } = {},
): UptimeProbe {
  const incidentCount = options.incidentCount ?? 0;
  return {
    surface,
    date,
    status: options.status ?? (uptimePercent >= 99.9 ? 'up' : uptimePercent >= 99.0 ? 'degraded' : 'down'),
    uptimePercent,
    incidentCount,
    lastIncidentTimestamp: options.lastIncidentTimestamp ?? null,
  };
}

test('should_compute_arithmetic_mean_per_surface_when_series_has_multiple_days_per_surface', () => {
  const series: readonly UptimeProbe[] = [
    probe('marketing', '2026-06-01', 99.9),
    probe('marketing', '2026-06-02', 99.5),
    probe('play', '2026-06-01', 99.0),
    probe('play', '2026-06-02', 99.4),
    probe('cards', '2026-06-01', 99.8),
    probe('api', '2026-06-01', 98.0),
  ];
  const { uptimeBySurface } = usePublicSurfaceHealth(() => wrap(series));
  assert.equal(uptimeBySurface.value.marketing, 99.7);
  assert.equal(uptimeBySurface.value.play, 99.2);
  assert.equal(uptimeBySurface.value.cards, 99.8);
  assert.equal(uptimeBySurface.value.api, 98.0);
});

test('should_pick_worst_surface_by_canonical_order_when_two_surfaces_tie_on_uptime', () => {
  // why: ties broken by canonical PUBLIC_SURFACES order (marketing /
  // play / cards / api). The two-tie test below puts `play` and `api`
  // both at the same low value; `play` precedes `api` in the canonical
  // order so it wins the worst-surface label.
  const series: readonly UptimeProbe[] = [
    probe('marketing', '2026-06-01', 99.9),
    probe('play', '2026-06-01', 98.0),
    probe('cards', '2026-06-01', 99.5),
    probe('api', '2026-06-01', 98.0),
  ];
  const { worstSurface } = usePublicSurfaceHealth(() => wrap(series));
  const result = worstSurface.value;
  assert.notEqual(result, null);
  assert.equal(result?.surface, 'play');
  assert.equal(result?.uptimePercent, 98.0);
});

test('should_exclude_missing_days_from_mean_when_surface_has_sparse_probes_over_long_range', () => {
  // why: §Missing-days exclusion lock — denominator = probes-in-range,
  // NOT days-in-range. A 30-day range with 3 probes for `marketing` at
  // 99.5 reports mean = 99.5, NOT 9.95 (zero-fill) and NOT ~99.9
  // (100-fill). This test passes 3 sparse probes only for `marketing`
  // and asserts the arithmetic mean of those 3 — no denominator
  // inflation.
  const series: readonly UptimeProbe[] = [
    probe('marketing', '2026-06-01', 99.5),
    probe('marketing', '2026-06-10', 99.5),
    probe('marketing', '2026-06-25', 99.5),
  ];
  const { uptimeBySurface } = usePublicSurfaceHealth(() => wrap(series));
  // 3 probes at 99.5 → mean 99.5; if zero-fill the implementation would
  // produce ~9.95 (3 × 99.5 / 30); if 100-fill it would produce ~99.95.
  assert.equal(uptimeBySurface.value.marketing, 99.5);
  // play / cards / api had zero probes — return zero per D-19908.
  assert.equal(uptimeBySurface.value.play, 0);
  assert.equal(uptimeBySurface.value.cards, 0);
  assert.equal(uptimeBySurface.value.api, 0);
});

test('should_select_max_lastIncidentTimestamp_per_surface_when_multiple_incidents_observed', () => {
  const series: readonly UptimeProbe[] = [
    probe('marketing', '2026-06-01', 99.5, { lastIncidentTimestamp: 1_000 }),
    probe('marketing', '2026-06-02', 99.5, { lastIncidentTimestamp: 2_000 }),
    probe('marketing', '2026-06-03', 99.5, { lastIncidentTimestamp: null }),
    probe('play', '2026-06-01', 99.5, { lastIncidentTimestamp: null }),
    probe('cards', '2026-06-01', 99.5, { lastIncidentTimestamp: 500 }),
  ];
  const { lastIncidentBySurface } = usePublicSurfaceHealth(() => wrap(series));
  assert.equal(lastIncidentBySurface.value.marketing, 2_000);
  assert.equal(lastIncidentBySurface.value.play, null);
  assert.equal(lastIncidentBySurface.value.cards, 500);
  assert.equal(lastIncidentBySurface.value.api, null);
});

test('should_return_null_worstSurface_and_zero_mean_per_surface_when_series_is_empty', () => {
  // why: empty-state coverage — empty input returns the explicit
  // sentinels per D-19908 numeric-zero semantics. `worstSurface` is
  // `null` (absence is meaningful), per-surface means are `0` (zero
  // probes observed). No field is `NaN`.
  const { worstSurface, uptimeBySurface, lastIncidentBySurface } = usePublicSurfaceHealth(
    () => wrap([]),
  );
  assert.equal(worstSurface.value, null);
  for (const surface of PUBLIC_SURFACES) {
    assert.equal(uptimeBySurface.value[surface], 0);
    assert.equal(Number.isNaN(uptimeBySurface.value[surface]), false);
    assert.equal(lastIncidentBySurface.value[surface], null);
  }
});

test('should_passthrough_source_and_updatedAt_when_called_per_Composable_Source_Contract', () => {
  // why: WP-204 §Composable Source Contract — widgets read freshness
  // from the composable's `source` + `updatedAt`, NOT directly from
  // the service layer. This passthrough is the MOCK → LIVE flip seam.
  const { source, updatedAt } = usePublicSurfaceHealth(() =>
    wrap([], { source: 'LIVE', updatedAt: 1_800_000_000_000 }),
  );
  assert.equal(source.value, 'LIVE');
  assert.equal(updatedAt.value, 1_800_000_000_000);
});

test('should_preserve_ascending_by_date_order_when_series_is_passed_through_from_mock', () => {
  // why: §Aggregation rule — the mock factory pre-sorts ascending by
  // `date` under Unicode code-unit comparison; the composable passes
  // through without re-sorting. End-to-end ascending order assertion
  // proves the contract holds at both layers. Uses bare `<` not
  // `localeCompare` per D-19605 / D-19904.
  const response = mockUptimeProbes('14d', 1_750_000_000_000);
  const { series } = usePublicSurfaceHealth(() => response);
  const result = series.value;
  assert.ok(result.length > 0);
  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    const previous = result[i - 1];
    if (current === undefined || previous === undefined) {
      continue;
    }
    assert.ok(current.date >= previous.date, `Series not ascending by date at index ${i}: ${previous.date} → ${current.date}`);
  }
});

test('should_emit_byte_identical_output_when_mockUptimeProbes_called_twice_with_identical_inputs', () => {
  // why: §Determinism scope + D-19605 — same `(range, nowMs)` input
  // → byte-identical output across two consecutive calls. FNV-1a seed
  // via `hashRange`; canonical iteration via `PUBLIC_SURFACES`.
  const first = mockUptimeProbes('14d', 1_750_000_000_000);
  const second = mockUptimeProbes('14d', 1_750_000_000_000);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.source, 'MOCK');
  assert.equal(second.source, 'MOCK');
  assert.equal(first.updatedAt, 1_750_000_000_000);
  // §Mock value bounds: uptimePercent ∈ [95.0, 100.0] for every entry.
  for (const entry of first.data) {
    assert.ok(entry.uptimePercent >= 95.0, `uptimePercent ${entry.uptimePercent} below 95.0 bound at ${entry.surface}/${entry.date}`);
    assert.ok(entry.uptimePercent <= 100.0, `uptimePercent ${entry.uptimePercent} above 100.0 bound at ${entry.surface}/${entry.date}`);
  }
});
