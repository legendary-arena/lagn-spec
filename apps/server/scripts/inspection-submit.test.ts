/**
 * Tests for the inspection CI scripts' pure helpers — WP-231 / EC-263.
 *
 * NOTE ON LOCATION (amendment to EC-263 §Files to Produce): the CI scripts live
 * at the repo-root `scripts/` (mirroring `scripts/sweep-submit.mjs` + the
 * `inspection:fetch` / `inspection:submit` root npm scripts the workflow runs).
 * The server `test` npm script globs test files relative to `apps/server/`, so
 * its scripts-directory glob resolves under `apps/server/scripts/`, NOT the
 * repo-root `scripts/`. A test placed at the repo-root `scripts/` would
 * therefore NEVER run under `pnpm --filter @legendary-arena/server test`. This
 * test lives at `apps/server/scripts/` (the established home for
 * server-suite-run script tests — `join-match.test.ts`, `list-matches.test.ts`)
 * and imports the helpers from the root `scripts/` via a relative path. WP-231
 * AC-22 / Verification Step 2 (the inspection-submit cases present in the server
 * run) are satisfied by this placement.
 *
 * Authority: WP-231 §Acceptance Criteria #16 + #17 + #24 + #25; §Script Exit
 * Codes; EC-263 §After Completing.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyAgentReport,
  computeVerdictFromFindings,
  isValidInspectionReportShape,
} from '../../../scripts/inspection-submit.mjs';
import { isTriageableSweepInput } from '../../../scripts/inspection-fetch.mjs';

function makeFinding(overrides = {}) {
  return {
    severity: 'P2',
    anomalyClass: 'not-endgame',
    cellId: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    route: 'Builder',
    ...overrides,
  };
}

function makeReport(overrides = {}) {
  return {
    reportId: 'a1b2c3d4-20260610T071500Z-20260610T071530Z',
    sweepRunId: 'a1b2c3d4-20260610T071500Z',
    generatedAt: '2026-06-10T07:15:30.000Z',
    verdict: 'PASS',
    findings: [makeFinding()],
    ...overrides,
  };
}

describe('computeVerdictFromFindings (WP-231 / D-23102 deterministic rule)', () => {
  test('should_return_PASS_for_no_findings', () => {
    assert.equal(computeVerdictFromFindings([]), 'PASS');
  });

  test('should_return_PASS_when_only_P2', () => {
    assert.equal(computeVerdictFromFindings([makeFinding({ severity: 'P2' })]), 'PASS');
  });

  test('should_return_FAIL_when_any_P1', () => {
    assert.equal(computeVerdictFromFindings([makeFinding({ severity: 'P1' })]), 'FAIL');
  });

  test('should_return_FAIL_when_any_P0', () => {
    assert.equal(computeVerdictFromFindings([makeFinding({ severity: 'P0' })]), 'FAIL');
  });
});

describe('isValidInspectionReportShape (WP-231 / shape gate)', () => {
  test('should_accept_a_well_formed_report', () => {
    assert.equal(isValidInspectionReportShape(makeReport()), true);
  });

  test('should_reject_a_missing_reportId', () => {
    const report = makeReport();
    delete report.reportId;
    assert.equal(isValidInspectionReportShape(report), false);
  });

  test('should_reject_an_out_of_set_severity', () => {
    assert.equal(isValidInspectionReportShape(makeReport({ findings: [makeFinding({ severity: 'P3' })] })), false);
  });

  test('should_reject_an_out_of_set_verdict', () => {
    assert.equal(isValidInspectionReportShape(makeReport({ verdict: 'MAYBE' })), false);
  });
});

describe('classifyAgentReport (WP-231 / AC #24 strict JSON + AC #17 exit map)', () => {
  test('should_exit_2_for_markdown_fenced_JSON', () => {
    // why (AC #24): a bare JSON.parse rejects fenced output — no fence-stripping.
    const fenced = '```json\n' + JSON.stringify(makeReport()) + '\n```';
    assert.equal(classifyAgentReport(fenced).exitCode, 2);
  });

  test('should_exit_2_for_non_JSON_garbage', () => {
    assert.equal(classifyAgentReport('not json at all').exitCode, 2);
  });

  test('should_exit_2_for_valid_JSON_failing_the_shape_check', () => {
    assert.equal(classifyAgentReport(JSON.stringify({ reportId: 'x' })).exitCode, 2);
  });

  test('should_exit_3_when_verdict_disagrees_with_findings', () => {
    // verdict PASS but a P0 finding present -> computed FAIL -> mismatch -> exit 3.
    const report = makeReport({ verdict: 'PASS', findings: [makeFinding({ severity: 'P0' })] });
    assert.equal(classifyAgentReport(JSON.stringify(report)).exitCode, 3);
  });

  test('should_exit_0_and_return_the_report_when_valid_and_self_consistent', () => {
    const report = makeReport({ verdict: 'FAIL', findings: [makeFinding({ severity: 'P0' })] });
    const result = classifyAgentReport(JSON.stringify(report));
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.reportId, report.reportId);
  });
});

describe('isTriageableSweepInput (WP-231 / AC #25 forensic blob required)', () => {
  test('should_return_false_for_a_null_run', () => {
    assert.equal(isTriageableSweepInput(null), false);
  });

  test('should_return_false_for_a_run_with_a_null_manifestBlob', () => {
    assert.equal(isTriageableSweepInput({ runId: 'r', manifestBlob: null }), false);
  });

  test('should_return_true_for_a_run_with_a_present_manifestBlob', () => {
    assert.equal(isTriageableSweepInput({ runId: 'r', manifestBlob: { cells: [] } }), true);
  });
});
