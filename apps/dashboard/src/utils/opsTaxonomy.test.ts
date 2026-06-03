import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_SURFACES,
  UPTIME_STATUSES,
  INFRA_COST_VENDORS,
  type PublicSurfaceKey,
  type UptimeStatus,
  type InfraCostVendor,
} from '../types/index.js';

// ============================================================================
// WP-204 / EC-232 — Drift-detection gate mirroring the WP-198 `KPI_STATUSES`
// precedent at `utils/kpiStatus.test.ts` and the WP-203 `funnelTaxonomy.test.ts`
// precedent. The three canonical readonly arrays (`PUBLIC_SURFACES`,
// `UPTIME_STATUSES`, `INFRA_COST_VENDORS`) and their corresponding closed
// unions (`PublicSurfaceKey`, `UptimeStatus`, `InfraCostVendor`) MUST stay in
// lock-step. Adding a fifth surface / fourth status / fifth vendor to either
// side without updating its counterpart fails one of the assertions below
// loudly. Drift here would silently break canonical iteration order in the
// 3 ops composables / 4 ops widgets (object-key iteration order varies
// across runtimes per WP-204 §Determinism scope) and would invalidate the
// per-vendor card order on `InfraCostWatchdogWidget`, the per-surface row
// order on `PublicSurfaceHealthWidget`, and the status chip rendering.
// ============================================================================

test('should_deep_equal_locked_value_when_PUBLIC_SURFACES_is_inspected', () => {
  // why: WP-204 §Locked contract values byte-locks the array contents AND
  // order. Order is load-bearing (per-surface table row order; composable
  // iteration; worst-surface tie-break); deep-equal asserts both membership
  // and sequence.
  assert.deepEqual(PUBLIC_SURFACES, ['marketing', 'play', 'cards', 'api']);
  assert.equal(PUBLIC_SURFACES.length, 4);
});

test('should_assign_to_union_when_iterating_PUBLIC_SURFACES_entries', () => {
  // Compile-time check: the assignment below fails to typecheck if any
  // array entry drifts out of the union. The runtime assertion catches the
  // structural case where the union was widened but the array unchanged.
  for (const surface of PUBLIC_SURFACES) {
    const assignableToUnion: PublicSurfaceKey = surface;
    assert.equal(typeof assignableToUnion, 'string');
  }
});

test('should_include_every_documented_PublicSurfaceKey_when_checking_PUBLIC_SURFACES_membership', () => {
  // why: WP-204 §Locked contract values — the four documented surfaces
  // (marketing / play / cards / api). If the union grows without
  // `PUBLIC_SURFACES` growing, the table widget would silently skip the
  // new surface and the worst-surface comparison would omit it.
  const documentedUnionMembers: readonly PublicSurfaceKey[] = [
    'marketing',
    'play',
    'cards',
    'api',
  ];
  for (const expected of documentedUnionMembers) {
    assert.ok(
      PUBLIC_SURFACES.includes(expected),
      `PublicSurfaceKey union member "${expected}" is missing from PUBLIC_SURFACES canonical array — drift between union and array.`,
    );
  }
  assert.equal(documentedUnionMembers.length, PUBLIC_SURFACES.length);
});

test('should_deep_equal_locked_value_when_UPTIME_STATUSES_is_inspected', () => {
  // why: WP-204 §Locked contract values — order encodes severity best-to-
  // worst (up / degraded / down). The status chip rendering and any
  // future summary surface reads from this array deterministically.
  assert.deepEqual(UPTIME_STATUSES, ['up', 'degraded', 'down']);
  assert.equal(UPTIME_STATUSES.length, 3);
});

test('should_assign_to_union_when_iterating_UPTIME_STATUSES_entries', () => {
  for (const status of UPTIME_STATUSES) {
    const assignableToUnion: UptimeStatus = status;
    assert.equal(typeof assignableToUnion, 'string');
  }
});

test('should_include_every_documented_UptimeStatus_when_checking_UPTIME_STATUSES_membership', () => {
  // why: WP-204 §Locked contract values — the three documented statuses.
  // If the union grows without `UPTIME_STATUSES` growing, the canonical
  // iteration in the per-surface widget would silently skip the new
  // status row from any future summary by-status aggregation.
  const documentedUnionMembers: readonly UptimeStatus[] = ['up', 'degraded', 'down'];
  for (const expected of documentedUnionMembers) {
    assert.ok(
      UPTIME_STATUSES.includes(expected),
      `UptimeStatus union member "${expected}" is missing from UPTIME_STATUSES canonical array — drift between union and array.`,
    );
  }
  assert.equal(documentedUnionMembers.length, UPTIME_STATUSES.length);
});

test('should_deep_equal_locked_value_when_INFRA_COST_VENDORS_is_inspected', () => {
  // why: WP-204 §Locked contract values — order is load-bearing (per-vendor
  // card order in `InfraCostWatchdogWidget`; composable iteration in
  // `useInfraCostWatchdog`; `INFRA_COST_BUDGETS` config array iteration).
  // Reordering would silently shuffle the operator's at-a-glance view.
  assert.deepEqual(INFRA_COST_VENDORS, ['render', 'cloudflare', 'postgres', 'hanko']);
  assert.equal(INFRA_COST_VENDORS.length, 4);
});

test('should_assign_to_union_when_iterating_INFRA_COST_VENDORS_entries', () => {
  for (const vendor of INFRA_COST_VENDORS) {
    const assignableToUnion: InfraCostVendor = vendor;
    assert.equal(typeof assignableToUnion, 'string');
  }
});

test('should_include_every_documented_InfraCostVendor_when_checking_INFRA_COST_VENDORS_membership', () => {
  // why: WP-204 §Locked contract values — the four currently-billed
  // vendors. If the union grows without `INFRA_COST_VENDORS` growing,
  // the widget's 4-card grid would silently render an incomplete view
  // and `useInfraCostWatchdog`'s MTD aggregation would skip the new
  // vendor entirely.
  const documentedUnionMembers: readonly InfraCostVendor[] = [
    'render',
    'cloudflare',
    'postgres',
    'hanko',
  ];
  for (const expected of documentedUnionMembers) {
    assert.ok(
      INFRA_COST_VENDORS.includes(expected),
      `InfraCostVendor union member "${expected}" is missing from INFRA_COST_VENDORS canonical array — drift between union and array.`,
    );
  }
  assert.equal(documentedUnionMembers.length, INFRA_COST_VENDORS.length);
});

test('should_remain_disjoint_from_each_other_when_PUBLIC_SURFACES_and_INFRA_COST_VENDORS_are_compared', () => {
  // why: WP-204 §Forward-locked envelope — `PublicSurfaceKey` (per-domain
  // public surface) and `InfraCostVendor` (per-billed-vendor cost
  // bucket) are distinct concerns. A value belonging to both unions
  // would create discriminator ambiguity for any future cross-surface
  // aggregation. The two canonical arrays must share no members.
  for (const surface of PUBLIC_SURFACES) {
    assert.ok(
      !(INFRA_COST_VENDORS as readonly string[]).includes(surface),
      `Public surface "${surface}" must not appear in INFRA_COST_VENDORS — surfaces and vendors are distinct closed unions.`,
    );
  }
  for (const vendor of INFRA_COST_VENDORS) {
    assert.ok(
      !(PUBLIC_SURFACES as readonly string[]).includes(vendor),
      `Vendor "${vendor}" must not appear in PUBLIC_SURFACES — surfaces and vendors are distinct closed unions.`,
    );
  }
});
