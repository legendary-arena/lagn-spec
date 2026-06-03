import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACQUISITION_CHANNELS,
  ACTIVATION_STEPS,
  type AcquisitionChannel,
  type ActivationStep,
} from '../types/index.js';

// ============================================================================
// WP-203 / EC-231 — Drift-detection gate mirroring the WP-198 `KPI_STATUSES`
// precedent at `utils/kpiStatus.test.ts`. The two canonical readonly arrays
// (`ACQUISITION_CHANNELS`, `ACTIVATION_STEPS`) and their corresponding
// closed unions (`AcquisitionChannel`, `ActivationStep`) MUST stay in lock-
// step. Adding a fifth channel or step to either side without updating its
// counterpart fails one of the assertions below loudly. Drift here would
// silently break canonical iteration order in composables / widgets
// (object-key iteration order varies across runtimes per WP-203
// §Determinism scope) and would invalidate the stacked-bar legend order in
// `TrafficSourcesWidget` + the funnel stage order in `ActivationFunnelWidget`.
// ============================================================================

test('ACQUISITION_CHANNELS canonical array deep-equals locked WP-203 §Locked contract value', () => {
  // why: WP-203 §Locked contract values byte-locks the array contents AND
  // order. Order is load-bearing (stacked-bar legend; strip pill row;
  // composable iteration); deep-equal asserts both membership and sequence.
  assert.deepEqual(ACQUISITION_CHANNELS, ['direct', 'search', 'referral', 'paid']);
  assert.equal(ACQUISITION_CHANNELS.length, 4);
});

test('every ACQUISITION_CHANNELS entry is a valid AcquisitionChannel union member (array → union direction)', () => {
  // Compile-time check: the assignment below fails to typecheck if any array
  // entry drifts out of the union. The runtime assertion catches the
  // structural case where the union was widened but the array unchanged.
  for (const channel of ACQUISITION_CHANNELS) {
    const assignableToUnion: AcquisitionChannel = channel;
    assert.equal(typeof assignableToUnion, 'string');
  }
});

test('every documented AcquisitionChannel union member appears in ACQUISITION_CHANNELS (union → array direction)', () => {
  // why: WP-203 §Locked contract values — the four documented channels
  // (direct / search / referral / paid). If the union grows without
  // ACQUISITION_CHANNELS growing, the strip widget would silently skip the
  // new channel from its pill row and the stacked-bar legend would omit it.
  const documentedUnionMembers: readonly AcquisitionChannel[] = [
    'direct',
    'search',
    'referral',
    'paid',
  ];
  for (const expected of documentedUnionMembers) {
    assert.ok(
      ACQUISITION_CHANNELS.includes(expected),
      `AcquisitionChannel union member "${expected}" is missing from ACQUISITION_CHANNELS canonical array — drift between union and array.`,
    );
  }
  assert.equal(documentedUnionMembers.length, ACQUISITION_CHANNELS.length);
});

test('ACTIVATION_STEPS canonical array deep-equals locked WP-203 §Locked contract value', () => {
  // why: WP-203 §Locked contract values — order encodes the funnel stage
  // sequence (signup-start → signup-complete → first-match-started →
  // first-match-completed). Reordering would silently invert step-to-step
  // conversion in `useActivationFunnel`; deep-equal asserts the sequence.
  assert.deepEqual(ACTIVATION_STEPS, [
    'signup-start',
    'signup-complete',
    'first-match-started',
    'first-match-completed',
  ]);
  assert.equal(ACTIVATION_STEPS.length, 4);
});

test('every ACTIVATION_STEPS entry is a valid ActivationStep union member (array → union direction)', () => {
  for (const step of ACTIVATION_STEPS) {
    const assignableToUnion: ActivationStep = step;
    assert.equal(typeof assignableToUnion, 'string');
  }
});

test('every documented ActivationStep union member appears in ACTIVATION_STEPS (union → array direction)', () => {
  // why: WP-203 §Conversion invariants — the funnel widget's overall
  // conversion reads `stepCounts['first-match-completed'] /
  // stepCounts['signup-start']`. If the union grows without
  // ACTIVATION_STEPS growing, the composable's all-4-step normalization
  // would silently drop the new step and the widget would render an
  // incomplete funnel.
  const documentedUnionMembers: readonly ActivationStep[] = [
    'signup-start',
    'signup-complete',
    'first-match-started',
    'first-match-completed',
  ];
  for (const expected of documentedUnionMembers) {
    assert.ok(
      ACTIVATION_STEPS.includes(expected),
      `ActivationStep union member "${expected}" is missing from ACTIVATION_STEPS canonical array — drift between union and array.`,
    );
  }
  assert.equal(documentedUnionMembers.length, ACTIVATION_STEPS.length);
});

test('ACQUISITION_CHANNELS and ACTIVATION_STEPS are disjoint (semantic separation)', () => {
  // why: WP-203 §Forward-locked envelope — `AcquisitionChannel` (top-of-
  // funnel attribution) and `ActivationStep` (funnel-stage progression) are
  // distinct concerns. A value belonging to both unions would create
  // discriminator ambiguity for `AcquisitionEventType`. The two canonical
  // arrays must share no members; the `'paid'` channel is NOT a step, and
  // `'signup-start'` is NOT a channel.
  for (const channel of ACQUISITION_CHANNELS) {
    assert.ok(
      !(ACTIVATION_STEPS as readonly string[]).includes(channel),
      `Channel "${channel}" must not appear in ACTIVATION_STEPS — channels and steps are distinct closed unions.`,
    );
  }
  for (const step of ACTIVATION_STEPS) {
    assert.ok(
      !(ACQUISITION_CHANNELS as readonly string[]).includes(step),
      `Step "${step}" must not appear in ACQUISITION_CHANNELS — channels and steps are distinct closed unions.`,
    );
  }
});
