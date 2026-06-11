/**
 * Tests for the WP-234 weekly full-corpus sweep helpers — WP-234 / EC-267.
 *
 * LOCATION (per EC-267 §Files to Produce): the CI scripts live at the repo-root
 * `scripts/` (mirroring `scripts/sweep-submit.mjs` + the root `sweep:*` npm
 * scripts the workflow runs). The server `test` npm script globs its
 * scripts-directory test files relative to `apps/server/`, so its glob resolves
 * under `apps/server/scripts/`, NOT the repo-root `scripts/`. This test lives at
 * `apps/server/scripts/` (the established home for server-suite-run script
 * tests — WP-231's `inspection-submit.test.ts` + WP-232's `handoffs-sync.test.ts`
 * precedent) and imports the helpers from the root `scripts/` via a relative
 * path.
 *
 * Covers the pure helpers across all four new/modified scripts:
 *   - `selectSchemeWindow`         (scripts/sweep-setup-matrix.mjs)
 *   - `computeWeeklyPlan` / `computeShardSlice` (scripts/sweep-weekly-plan.mjs)
 *   - `collectSortedUniqueExtIds`  (scripts/sweep-generate-full-axis.mjs)
 *   - `isWeeklySubmitEnvComplete` / `concatenateShardManifests` /
 *     `isWithinBodyCap` / `isExpectedShardCount` (scripts/sweep-weekly-submit.mjs)
 *
 * Authority: WP-234 §Acceptance Criteria #1/#4/#5/#6/#9/#10/#11/#12; EC-267
 * §After Completing.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { selectSchemeWindow } from '../../../scripts/sweep-setup-matrix.mjs';
import { computeShardSlice, computeWeeklyPlan } from '../../../scripts/sweep-weekly-plan.mjs';
import { collectSortedUniqueExtIds } from '../../../scripts/sweep-generate-full-axis.mjs';
import {
  concatenateShardManifests,
  isExpectedShardCount,
  isWeeklySubmitEnvComplete,
  isWithinBodyCap,
} from '../../../scripts/sweep-weekly-submit.mjs';

/** Builds a 191-entry stand-in scheme axis with stable ascending ids. */
function buildSchemeAxis(): string[] {
  const axis: string[] = [];
  for (let index = 0; index < 191; index = index + 1) {
    axis.push(`scheme-${String(index).padStart(3, '0')}`);
  }
  return axis;
}

/** Serializes one valid success-shape manifest line. */
function makeSuccessLine(schemeId: string, mastermindId: string): string {
  return JSON.stringify({
    cellIndex: 0,
    cellSeed: `weekly::cell:${schemeId}:${mastermindId}`,
    endgameReached: true,
    mastermindId,
    moveCount: 10,
    outcome: { escapedVillains: 0, winner: null },
    schemeId,
  });
}

describe('selectSchemeWindow (WP-234 / axis-slice math — AC #1, #10, #11)', () => {
  test('should_select_the_first_full_window', () => {
    assert.equal(selectSchemeWindow(buildSchemeAxis(), 0, 20).length, 20);
  });

  test('should_clamp_the_last_window_to_eleven_schemes', () => {
    // window index 9 → offset 180; [180, 200) clamps to [180, 191) = 11 schemes
    assert.equal(selectSchemeWindow(buildSchemeAxis(), 180, 20).length, 11);
  });

  test('should_yield_an_empty_slice_for_an_over_offset_window', () => {
    // window 9 shard 3 → offset 195 over a 191-axis → 0 cells (not an error)
    assert.deepEqual(selectSchemeWindow(buildSchemeAxis(), 195, 5), []);
  });

  test('should_yield_one_scheme_for_the_clamped_tail_shard', () => {
    // window 9 shard 2 → offset 190 → [190, 195) clamps to [190, 191) = 1 scheme
    assert.equal(selectSchemeWindow(buildSchemeAxis(), 190, 5).length, 1);
  });

  test('should_return_the_full_axis_when_limit_equals_axis_length', () => {
    const axis = buildSchemeAxis();
    assert.deepEqual(selectSchemeWindow(axis, 0, axis.length), axis);
  });
});

describe('computeWeeklyPlan (WP-234 / rotation — AC #12)', () => {
  test('should_map_week_zero_to_window_zero_offset_zero', () => {
    assert.deepEqual(computeWeeklyPlan(0, 191), { windowIndex: 0, schemeOffset: 0 });
  });

  test('should_map_the_last_window_to_offset_one_eighty', () => {
    assert.deepEqual(computeWeeklyPlan(9, 191), { windowIndex: 9, schemeOffset: 180 });
  });

  test('should_wrap_via_isoWeek_mod_ten', () => {
    assert.deepEqual(computeWeeklyPlan(10, 191), { windowIndex: 0, schemeOffset: 0 });
    assert.deepEqual(computeWeeklyPlan(19, 191), { windowIndex: 9, schemeOffset: 180 });
    assert.deepEqual(computeWeeklyPlan(53, 191), { windowIndex: 3, schemeOffset: 60 });
  });

  test('should_throw_on_a_negative_iso_week', () => {
    assert.throws(() => computeWeeklyPlan(-1, 191), /non-negative integer/);
  });
});

describe('computeShardSlice (WP-234 / per-shard offsets — AC #12)', () => {
  test('should_return_the_four_shard_offsets_for_the_last_window', () => {
    assert.deepEqual(computeShardSlice(180, 0), { schemeOffset: 180, schemeLimit: 5 });
    assert.deepEqual(computeShardSlice(180, 1), { schemeOffset: 185, schemeLimit: 5 });
    assert.deepEqual(computeShardSlice(180, 2), { schemeOffset: 190, schemeLimit: 5 });
    assert.deepEqual(computeShardSlice(180, 3), { schemeOffset: 195, schemeLimit: 5 });
  });

  test('should_throw_on_a_shard_index_outside_the_matrix', () => {
    assert.throws(() => computeShardSlice(0, 4), /\[0, 4\)/);
  });
});

describe('collectSortedUniqueExtIds (WP-234 / fixture composition — AC #4)', () => {
  test('should_compose_sorted_deduped_ext_ids_from_abbr_and_slug', () => {
    const sets = [
      { abbr: 'core', schemes: [{ slug: 'b' }, { slug: 'a' }] },
      { abbr: 'aaa', schemes: [{ slug: 'z' }, { slug: 'a' }] },
    ];
    assert.deepEqual(collectSortedUniqueExtIds(sets, 'schemes'), [
      'aaa/a',
      'aaa/z',
      'core/a',
      'core/b',
    ]);
  });

  test('should_collapse_duplicate_ext_ids', () => {
    const sets = [{ abbr: 'core', masterminds: [{ slug: 'dr-doom' }, { slug: 'dr-doom' }] }];
    assert.deepEqual(collectSortedUniqueExtIds(sets, 'masterminds'), ['core/dr-doom']);
  });

  test('should_skip_a_set_missing_the_requested_category', () => {
    const sets = [{ abbr: 'core', schemes: [{ slug: 'a' }] }, { abbr: 'two' }];
    assert.deepEqual(collectSortedUniqueExtIds(sets, 'schemes'), ['core/a']);
  });
});

describe('isWeeklySubmitEnvComplete (WP-234 / env guard, exit-2 surface — AC #6)', () => {
  test('should_return_true_when_both_env_vars_are_present', () => {
    assert.equal(
      isWeeklySubmitEnvComplete({ SWEEP_SUBMIT_TOKEN: 'tok', API_BASE_URL: 'https://api.example.com' }),
      true,
    );
  });

  test('should_return_false_when_the_token_is_missing', () => {
    assert.equal(isWeeklySubmitEnvComplete({ API_BASE_URL: 'https://api.example.com' }), false);
  });

  test('should_return_false_when_the_base_url_is_empty', () => {
    assert.equal(isWeeklySubmitEnvComplete({ SWEEP_SUBMIT_TOKEN: 'tok', API_BASE_URL: '' }), false);
  });
});

describe('isExpectedShardCount (WP-234 / shard-count assert, exit-3 surface — AC #9)', () => {
  test('should_accept_exactly_four_manifests', () => {
    assert.equal(isExpectedShardCount(4), true);
  });

  test('should_reject_fewer_than_four_manifests', () => {
    assert.equal(isExpectedShardCount(3), false);
    assert.equal(isExpectedShardCount(0), false);
  });

  test('should_reject_more_than_four_manifests', () => {
    assert.equal(isExpectedShardCount(5), false);
  });
});

describe('concatenateShardManifests (WP-234 / fan-in concat — AC #5, #10)', () => {
  test('should_union_records_without_loss_or_double_count', () => {
    const shardOne = `${makeSuccessLine('core/b', 'core/x')}\n${makeSuccessLine('core/a', 'core/y')}`;
    const shardTwo = makeSuccessLine('core/a', 'core/x');
    const emptyShard = '';
    const { records, malformedLines } = concatenateShardManifests([shardOne, shardTwo, emptyShard]);
    assert.equal(records.length, 3);
    assert.equal(malformedLines.length, 0);
  });

  test('should_emit_records_sorted_by_scheme_then_mastermind', () => {
    const shardOne = `${makeSuccessLine('core/b', 'core/x')}\n${makeSuccessLine('core/a', 'core/y')}`;
    const shardTwo = makeSuccessLine('core/a', 'core/x');
    const { records } = concatenateShardManifests([shardOne, shardTwo, '']);
    const order = records.map((record) => `${record.schemeId}|${record.mastermindId}`);
    assert.deepEqual(order, ['core/a|core/x', 'core/a|core/y', 'core/b|core/x']);
  });

  test('should_be_independent_of_shard_input_order', () => {
    const shardOne = `${makeSuccessLine('core/b', 'core/x')}\n${makeSuccessLine('core/a', 'core/y')}`;
    const shardTwo = makeSuccessLine('core/a', 'core/x');
    const forward = concatenateShardManifests([shardOne, shardTwo, '']).records;
    const reversed = concatenateShardManifests(['', shardTwo, shardOne]).records;
    assert.deepEqual(forward, reversed);
  });

  test('should_track_a_malformed_line_without_dropping_valid_records', () => {
    const shard = `${makeSuccessLine('core/a', 'core/x')}\nnot-json`;
    const { records, malformedLines } = concatenateShardManifests([shard]);
    assert.equal(records.length, 1);
    assert.equal(malformedLines.length, 1);
  });
});

describe('isWithinBodyCap (WP-234 / pre-POST 5 MB guard, exit-4 surface — AC #6)', () => {
  test('should_accept_an_under_cap_payload', () => {
    const payload = {
      runId: 'sha-20260610T080000Z-weekly-w3',
      startedAt: '2026-06-10T08:00:00.000Z',
      cellCount: 4,
      anomalyCounts: { 'endgame-reached': 4 },
      manifestBlob: { cells: [], summary: {}, malformedLines: [] },
    };
    assert.equal(isWithinBodyCap(payload), true);
  });

  test('should_reject_an_over_cap_payload', () => {
    const payload = {
      runId: 'sha-20260610T080000Z-weekly-w3',
      startedAt: '2026-06-10T08:00:00.000Z',
      cellCount: 0,
      anomalyCounts: {},
      // why: 5 MB + a margin of filler pushes JSON.stringify(payload).length
      // past the locked BODY_CAP_BYTES so the guard rejects it.
      manifestBlob: { filler: 'a'.repeat(5 * 1024 * 1024 + 100) },
    };
    assert.equal(isWithinBodyCap(payload), false);
  });
});
