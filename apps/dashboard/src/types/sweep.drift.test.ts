import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SweepRunSummary } from './sweep.js';

// ============================================================================
// WP-211 / EC-245 — Cross-App Sweep Type Drift Test (Dashboard ↔ Server).
//
// The dashboard `SweepRunSummary` (`apps/dashboard/src/types/sweep.ts`, WP-210)
// is a hand-maintained mirror of the authoritative server `SweepRunSummary`
// (`apps/server/src/sweep/sweep.types.ts`, WP-209). The dashboard CANNOT import
// the server package (layer boundary — `apps/dashboard` must not import
// `apps/server` or `@legendary-arena/game-engine`), so the two interfaces are
// kept in lock-step by convention only: there is no compile-time link between
// them. This test is the missing guard. It compares the dashboard type's
// runtime field set against a committed, server-derived field-set constant and
// fails loudly if either side adds, removes, or renames a summary field.
//
// It mirrors the within-app drift guards already in the dashboard tree
// (`utils/opsTaxonomy.test.ts`, `utils/funnelTaxonomy.test.ts`,
// `utils/kpiStatus.test.ts`): a canonical expected-shape constant + a
// deep-equal assertion. The cross-app twist is that the "expected shape" is a
// committed constant (data captured at authoring time) rather than a live
// import.
// ============================================================================

// why: This array is the committed, server-derived field set for
// `SweepRunSummary`. It is hand-derived from the authoritative server type at
// `apps/server/src/sweep/sweep.types.ts` (`SweepRunSummary`), baseline commit
// 8fb8f69, NOT imported (the layer boundary forbids the dashboard importing the
// server package). The ONE intentional cross-app difference — D-20703, where
// the dashboard widens `anomalyCounts`'s value type from the engine's closed
// `SweepAnomalyClass` key union to opaque `string` — is a VALUE-TYPE difference,
// not a field-set difference, so it is deliberately out of scope for this
// field-set guard. When the server `SweepRunSummary` field set changes, this
// constant must be re-derived by hand in the same commit, same as the existing
// within-app drift guards.
const SERVER_DERIVED_SUMMARY_FIELDS: readonly string[] = [
  'runId',
  'submittedAt',
  'startedAt',
  'cellCount',
  'anomalyCounts',
];

// The dashboard `SweepRunSummary` runtime field set, captured via a fully-typed
// literal. This is the compile-time half of the guard: a missing OR excess
// field fails `vue-tsc` typecheck under the dashboard's `strict` +
// `exactOptionalPropertyTypes` config before this test ever runs. The runtime
// key set is then derived from `Object.keys(sample)` — never a second
// hand-written key list, so the dashboard side cannot silently drift from its
// own type.
const sample: SweepRunSummary = {
  runId: 'sweep-0000000-1970-01-01T00:00:00.000Z',
  submittedAt: '1970-01-01T00:00:00.000Z',
  startedAt: '1970-01-01T00:00:00.000Z',
  cellCount: 0,
  anomalyCounts: {},
};

test('should_deep_equal_server_derived_field_set_when_dashboard_SweepRunSummary_keys_are_inspected', () => {
  // why: WP-211 §Scope (In) #3 — the sorted dashboard runtime key set must
  // deep-equal the sorted committed server-derived field set. The test sorts
  // both sides before comparing so source declaration order is not load-bearing;
  // only membership (the field SET) is guarded.
  assert.deepEqual(
    Object.keys(sample).sort(),
    [...SERVER_DERIVED_SUMMARY_FIELDS].sort(),
  );
});

test('should_carry_exactly_five_fields_when_dashboard_SweepRunSummary_is_counted', () => {
  // why: WP-211 §Locked contract values — the summary field count is exactly 5.
  // Asserting the count separately catches the case where both sides drifted by
  // the same number of fields (which a pure deep-equal could mask if the
  // committed constant were edited in the same drift).
  assert.equal(Object.keys(sample).length, 5);
  assert.equal(SERVER_DERIVED_SUMMARY_FIELDS.length, 5);
});

test('should_include_every_server_derived_field_when_checking_dashboard_SweepRunSummary_membership', () => {
  const dashboardKeys: readonly string[] = Object.keys(sample);
  for (const expectedField of SERVER_DERIVED_SUMMARY_FIELDS) {
    assert.ok(
      dashboardKeys.includes(expectedField),
      `Server-derived SweepRunSummary field "${expectedField}" is missing from the dashboard SweepRunSummary in apps/dashboard/src/types/sweep.ts — reconcile it against the authoritative server type in apps/server/src/sweep/sweep.types.ts before shipping.`,
    );
  }
  for (const dashboardField of dashboardKeys) {
    assert.ok(
      SERVER_DERIVED_SUMMARY_FIELDS.includes(dashboardField),
      `Dashboard SweepRunSummary field "${dashboardField}" in apps/dashboard/src/types/sweep.ts is not present in the committed server-derived field set from apps/server/src/sweep/sweep.types.ts — reconcile both files before shipping.`,
    );
  }
});

test('should_exclude_manifestBlob_when_dashboard_SweepRunSummary_keys_are_inspected', () => {
  // why: WP-211 §Scope (In) #4 — the server's `SweepRunPayload` carries
  // `manifestBlob` (forensic-only), but `SweepRunSummary` deliberately excludes
  // it from the dashboard read path. Assert the exclusion survives on the
  // dashboard side so a future copy-paste from the payload type cannot silently
  // pull the blob onto the operator dashboard.
  assert.ok(
    !Object.keys(sample).includes('manifestBlob'),
    'The dashboard SweepRunSummary in apps/dashboard/src/types/sweep.ts must NOT include "manifestBlob" — it is forensic-only and excluded from both the server SweepRunSummary in apps/server/src/sweep/sweep.types.ts and the dashboard read path.',
  );
});
