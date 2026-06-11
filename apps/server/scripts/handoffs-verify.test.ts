/**
 * Tests for the handoffs-verify CI script's pure helpers — WP-233 / EC-265.
 *
 * LOCATION (per EC-265 §Files to Produce): the CI script lives at the repo-root
 * `scripts/handoffs-verify.mjs` (mirroring `scripts/handoffs-sync.mjs` + the root
 * `handoffs:verify` npm script the workflow runs). The server `test` npm script
 * globs test files relative to `apps/server/`, so its scripts-directory glob
 * resolves under `apps/server/scripts/`, NOT the repo-root `scripts/`. This test
 * lives at `apps/server/scripts/` (the established home for server-suite-run
 * script tests — WP-231/WP-232 precedent) and imports the helpers from the root
 * `scripts/` via a relative path.
 *
 * Authority: WP-233 §Acceptance Criteria #14; §Script Exit Codes; EC-265 §After
 * Completing.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyVerifyStatus,
  isHandoffVerifyEnvComplete,
  isValidHandoffVerifySummaryShape,
} from '../../../scripts/handoffs-verify.mjs';

describe('isHandoffVerifyEnvComplete (WP-233 / env guard, exit 1 surface)', () => {
  test('should_return_true_when_both_env_vars_are_present', () => {
    assert.equal(
      isHandoffVerifyEnvComplete({ HANDOFF_SUBMIT_TOKEN: 'tok', API_BASE_URL: 'https://api.example.com' }),
      true,
    );
  });

  test('should_return_false_when_HANDOFF_SUBMIT_TOKEN_is_missing', () => {
    assert.equal(isHandoffVerifyEnvComplete({ API_BASE_URL: 'https://api.example.com' }), false);
  });

  test('should_return_false_when_API_BASE_URL_is_empty', () => {
    assert.equal(isHandoffVerifyEnvComplete({ HANDOFF_SUBMIT_TOKEN: 'tok', API_BASE_URL: '' }), false);
  });
});

describe('classifyVerifyStatus (WP-233 / exit-code mapping)', () => {
  test('should_return_0_for_a_200_response', () => {
    assert.equal(classifyVerifyStatus(200), 0);
  });

  test('should_return_2_for_a_non_200_response_including_other_2xx', () => {
    // why: success is keyed on HTTP 200, NOT a 2xx range — a 201 / 204 is exit 2,
    // verbatim with handoffs-sync.mjs.
    assert.equal(classifyVerifyStatus(500), 2);
    assert.equal(classifyVerifyStatus(401), 2);
    assert.equal(classifyVerifyStatus(204), 2);
  });
});

describe('isValidHandoffVerifySummaryShape (WP-233 / response-shape acceptance)', () => {
  test('should_accept_a_well_formed_summary_with_a_string_reportId', () => {
    assert.equal(
      isValidHandoffVerifySummaryShape({ reportId: 'report-new', verified: 2, regressed: 1, skipped: 3 }),
      true,
    );
  });

  test('should_accept_the_null_report_summary', () => {
    assert.equal(
      isValidHandoffVerifySummaryShape({ reportId: null, verified: 0, regressed: 0, skipped: 0 }),
      true,
    );
  });

  test('should_reject_a_summary_with_a_negative_or_non_integer_counter', () => {
    assert.equal(
      isValidHandoffVerifySummaryShape({ reportId: 'report-new', verified: -1, regressed: 0, skipped: 0 }),
      false,
    );
    assert.equal(
      isValidHandoffVerifySummaryShape({ reportId: 'report-new', verified: 1.5, regressed: 0, skipped: 0 }),
      false,
    );
  });

  test('should_reject_a_non_object', () => {
    assert.equal(isValidHandoffVerifySummaryShape(null), false);
    assert.equal(isValidHandoffVerifySummaryShape('nope'), false);
  });

  test('should_keep_exit_0_on_a_200_with_a_bad_body_shape_being_log_only', () => {
    // why (AC #14): the shape check gates only the success LOG line; a 200 with an
    // unexpected body still classifies as exit 0 (the two are decoupled — a shape
    // miss must NOT promote to exit 2).
    assert.equal(isValidHandoffVerifySummaryShape({ wrong: 'shape' }), false);
    assert.equal(classifyVerifyStatus(200), 0);
  });
});
