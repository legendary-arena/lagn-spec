/**
 * Tests for the handoffs-sync CI script's pure helpers — WP-232 / EC-264.
 *
 * LOCATION (per EC-264 §Files to Produce): the CI script lives at the repo-root
 * `scripts/handoffs-sync.mjs` (mirroring `scripts/inspection-submit.mjs` + the
 * root `handoffs:sync` npm script the workflow runs). The server `test` npm
 * script globs test files relative to `apps/server/`, so its scripts-directory
 * glob resolves under `apps/server/scripts/`, NOT the repo-root `scripts/`. This
 * test lives at `apps/server/scripts/` (the established home for server-suite-run
 * script tests — WP-231's `inspection-submit.test.ts` precedent) and imports the
 * helpers from the root `scripts/` via a relative path.
 *
 * Authority: WP-232 §Acceptance Criteria #18; §Script Exit Codes; EC-264 §After
 * Completing.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySyncStatus,
  isHandoffSyncEnvComplete,
  isValidHandoffSyncSummaryShape,
} from '../../../scripts/handoffs-sync.mjs';

describe('isHandoffSyncEnvComplete (WP-232 / env guard, exit 1 surface)', () => {
  test('should_return_true_when_both_env_vars_are_present', () => {
    assert.equal(
      isHandoffSyncEnvComplete({ HANDOFF_SUBMIT_TOKEN: 'tok', API_BASE_URL: 'https://api.example.com' }),
      true,
    );
  });

  test('should_return_false_when_HANDOFF_SUBMIT_TOKEN_is_missing', () => {
    assert.equal(isHandoffSyncEnvComplete({ API_BASE_URL: 'https://api.example.com' }), false);
  });

  test('should_return_false_when_API_BASE_URL_is_empty', () => {
    assert.equal(isHandoffSyncEnvComplete({ HANDOFF_SUBMIT_TOKEN: 'tok', API_BASE_URL: '' }), false);
  });
});

describe('classifySyncStatus (WP-232 / exit-code mapping)', () => {
  test('should_return_0_for_a_200_response', () => {
    assert.equal(classifySyncStatus(200), 0);
  });

  test('should_return_2_for_a_non_200_response', () => {
    assert.equal(classifySyncStatus(500), 2);
    assert.equal(classifySyncStatus(401), 2);
    assert.equal(classifySyncStatus(204), 2);
  });
});

describe('isValidHandoffSyncSummaryShape (WP-232 / response-shape acceptance)', () => {
  test('should_accept_a_well_formed_summary_with_a_string_reportId', () => {
    assert.equal(
      isValidHandoffSyncSummaryShape({ reportId: 'r1', findingCount: 3, created: 1, unchanged: 2 }),
      true,
    );
  });

  test('should_accept_the_null_report_summary', () => {
    assert.equal(
      isValidHandoffSyncSummaryShape({ reportId: null, findingCount: 0, created: 0, unchanged: 0 }),
      true,
    );
  });

  test('should_reject_a_summary_whose_created_plus_unchanged_disagrees_with_findingCount', () => {
    assert.equal(
      isValidHandoffSyncSummaryShape({ reportId: 'r1', findingCount: 3, created: 1, unchanged: 1 }),
      false,
    );
  });

  test('should_reject_a_non_object', () => {
    assert.equal(isValidHandoffSyncSummaryShape(null), false);
    assert.equal(isValidHandoffSyncSummaryShape('nope'), false);
  });
});
