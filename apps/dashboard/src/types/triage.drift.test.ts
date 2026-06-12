import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  HandoffRecord,
  HandoffStatus,
  HandoffStatusCounts,
  InspectionFinding,
  InspectionReportSummary,
} from './triage.js';

// ============================================================================
// WP-239 / EC-270 — Cross-App Triage Type Drift Test (Dashboard ↔ Server).
//
// The dashboard triage types (`apps/dashboard/src/types/triage.ts`) are
// hand-maintained mirrors of the authoritative server types in
// `apps/server/src/inspection/inspection.types.ts` (WP-231) and
// `apps/server/src/handoff/handoff.types.ts` (WP-232). The dashboard CANNOT
// import the server package (layer boundary), so the two sides are kept in
// lock-step by convention only. This test is the missing guard — it compares
// each dashboard mirror's runtime field set against a committed, server-derived
// field-set constant and fails loudly if either side drifts. It mirrors
// `types/sweep.drift.test.ts` (WP-211) exactly, extended to the three
// inspection/handoff record shapes plus the status union + counts keys.
// ============================================================================

// why: these constants are the committed, server-derived field/member sets.
// They are hand-copied from the authoritative server types (NOT imported — the
// layer boundary forbids the dashboard importing `apps/server`). The one
// intentional cross-app difference — D-20703, where the dashboard widens
// `anomalyClass` from the engine's closed union to opaque `string` — is a
// VALUE-TYPE difference, not a field-set difference, so it is deliberately out
// of scope for this field-set guard. When a server type's field set changes,
// the matching constant below must be re-derived by hand in the same commit.

const SERVER_DERIVED_INSPECTION_SUMMARY_FIELDS: readonly string[] = [
  'reportId',
  'sweepRunId',
  'submittedAt',
  'generatedAt',
  'verdict',
  'counts',
  'findings',
];

const SERVER_DERIVED_INSPECTION_FINDING_FIELDS: readonly string[] = [
  'severity',
  'anomalyClass',
  'cellId',
  'description',
  'route',
];

const SERVER_DERIVED_HANDOFF_RECORD_FIELDS: readonly string[] = [
  'handoffId',
  'reportId',
  'sweepRunId',
  'findingIndex',
  'severity',
  'route',
  'anomalyClass',
  'cellId',
  'description',
  'status',
  'branchRef',
  'amendmentRequest',
  'createdAt',
  'updatedAt',
];

const SERVER_DERIVED_HANDOFF_STATUS_MEMBERS: readonly string[] = [
  'open',
  'claimed',
  'fix-proposed',
  'escalated',
  'resolved',
  'wont-fix',
];

const SERVER_DERIVED_HANDOFF_COUNTS_KEYS: readonly string[] = [
  'open',
  'claimed',
  'fixProposed',
  'escalated',
  'resolved',
  'wontFix',
];

// Fully-typed literals capture each dashboard interface's runtime field set. A
// missing OR excess field fails `vue-tsc` (strict + exactOptionalPropertyTypes)
// before this test runs; the runtime key set is then derived from
// `Object.keys(sample)`, never a second hand-written list, so the dashboard
// side cannot silently drift from its own type.
const inspectionFindingSample: InspectionFinding = {
  severity: 'P0',
  anomalyClass: 'mock-anomaly',
  cellId: null,
  description: 'A finding.',
  route: 'Builder',
};

const inspectionSummarySample: InspectionReportSummary = {
  reportId: 'report-0',
  sweepRunId: 'sweep-0',
  submittedAt: '1970-01-01T00:00:00.000Z',
  generatedAt: '1970-01-01T00:00:00.000Z',
  verdict: 'FAIL',
  counts: { p0: 0, p1: 0, p2: 0 },
  findings: [inspectionFindingSample],
};

const handoffRecordSample: HandoffRecord = {
  handoffId: 'report-0#0',
  reportId: 'report-0',
  sweepRunId: 'sweep-0',
  findingIndex: 0,
  severity: 'P0',
  route: 'Builder',
  anomalyClass: 'mock-anomaly',
  cellId: null,
  description: 'A handoff.',
  status: 'open',
  branchRef: null,
  amendmentRequest: null,
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
};

const handoffCountsSample: HandoffStatusCounts = {
  open: 0,
  claimed: 0,
  fixProposed: 0,
  escalated: 0,
  resolved: 0,
  wontFix: 0,
};

// why: a `Record<HandoffStatus, true>` forces EVERY union member to be present
// as a key — adding a member to the `HandoffStatus` union without adding it
// here fails `vue-tsc`, and removing one here fails too. `Object.keys` then
// derives the runtime member set with no second hand-written list.
const handoffStatusPresence: Record<HandoffStatus, true> = {
  open: true,
  claimed: true,
  'fix-proposed': true,
  escalated: true,
  resolved: true,
  'wont-fix': true,
};

test('should_deep_equal_server_derived_field_set_when_dashboard_InspectionReportSummary_keys_are_inspected', () => {
  assert.deepEqual(
    Object.keys(inspectionSummarySample).sort(),
    [...SERVER_DERIVED_INSPECTION_SUMMARY_FIELDS].sort(),
  );
  assert.equal(Object.keys(inspectionSummarySample).length, 7);
  assert.equal(SERVER_DERIVED_INSPECTION_SUMMARY_FIELDS.length, 7);
});

test('should_deep_equal_server_derived_field_set_when_dashboard_InspectionFinding_keys_are_inspected', () => {
  assert.deepEqual(
    Object.keys(inspectionFindingSample).sort(),
    [...SERVER_DERIVED_INSPECTION_FINDING_FIELDS].sort(),
  );
  assert.equal(Object.keys(inspectionFindingSample).length, 5);
  assert.equal(SERVER_DERIVED_INSPECTION_FINDING_FIELDS.length, 5);
});

test('should_deep_equal_server_derived_field_set_when_dashboard_HandoffRecord_keys_are_inspected', () => {
  assert.deepEqual(
    Object.keys(handoffRecordSample).sort(),
    [...SERVER_DERIVED_HANDOFF_RECORD_FIELDS].sort(),
  );
  assert.equal(Object.keys(handoffRecordSample).length, 14);
  assert.equal(SERVER_DERIVED_HANDOFF_RECORD_FIELDS.length, 14);
});

test('should_deep_equal_server_derived_members_when_dashboard_HandoffStatus_union_is_inspected', () => {
  assert.deepEqual(
    Object.keys(handoffStatusPresence).sort(),
    [...SERVER_DERIVED_HANDOFF_STATUS_MEMBERS].sort(),
  );
  assert.equal(Object.keys(handoffStatusPresence).length, 6);
});

test('should_deep_equal_server_derived_keys_when_dashboard_HandoffStatusCounts_keys_are_inspected', () => {
  assert.deepEqual(
    Object.keys(handoffCountsSample).sort(),
    [...SERVER_DERIVED_HANDOFF_COUNTS_KEYS].sort(),
  );
  assert.equal(Object.keys(handoffCountsSample).length, 6);
});

test('should_include_every_server_derived_field_when_checking_each_dashboard_triage_shape', () => {
  const cases: ReadonlyArray<readonly [string, readonly string[], readonly string[]]> = [
    [
      'InspectionReportSummary',
      Object.keys(inspectionSummarySample),
      SERVER_DERIVED_INSPECTION_SUMMARY_FIELDS,
    ],
    [
      'InspectionFinding',
      Object.keys(inspectionFindingSample),
      SERVER_DERIVED_INSPECTION_FINDING_FIELDS,
    ],
    ['HandoffRecord', Object.keys(handoffRecordSample), SERVER_DERIVED_HANDOFF_RECORD_FIELDS],
    ['HandoffStatusCounts', Object.keys(handoffCountsSample), SERVER_DERIVED_HANDOFF_COUNTS_KEYS],
  ];
  for (const [shapeName, dashboardKeys, serverDerivedFields] of cases) {
    for (const expectedField of serverDerivedFields) {
      assert.ok(
        dashboardKeys.includes(expectedField),
        `Server-derived ${shapeName} field "${expectedField}" is missing from the dashboard mirror in apps/dashboard/src/types/triage.ts — reconcile it against the authoritative server type in apps/server/src/inspection/inspection.types.ts or apps/server/src/handoff/handoff.types.ts before shipping.`,
      );
    }
    for (const dashboardField of dashboardKeys) {
      assert.ok(
        serverDerivedFields.includes(dashboardField),
        `Dashboard ${shapeName} field "${dashboardField}" in apps/dashboard/src/types/triage.ts is not present in the committed server-derived field set — reconcile both files before shipping.`,
      );
    }
  }
});
