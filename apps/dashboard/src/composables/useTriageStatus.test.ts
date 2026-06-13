import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  useTriageStatus,
  type HandoffChainFetchState,
  type InspectionTriageFetchState,
} from './useTriageStatus.js';
import { mockInspectionTriage, mockHandoffChain } from '../services/triageMocks.js';
import type { ApiError } from '../types/index.js';
import type {
  HandoffLatestData,
  HandoffRecord,
  HandoffStatusCounts,
  InspectionLatestData,
  InspectionReportSummary,
  InspectionVerdict,
} from '../types/triage.js';

// ============================================================================
// WP-239 / EC-270 — useTriageStatus projection tests.
//
// Covers the four state arms, verdict/count surfacing, lifecycle bucketing,
// the cross-source coherence gate (coherent + handoff-stale + marker), the
// empty-vs-PASS-clean precedence, handoff order preservation, the defensive
// counts read, and wall-clock independence. `node:test`/`node:assert` only;
// no network, no boardgame.io.
// ============================================================================

const ZERO_COUNTS: HandoffStatusCounts = {
  open: 0,
  claimed: 0,
  fixProposed: 0,
  escalated: 0,
  resolved: 0,
  wontFix: 0,
};

function report(
  reportId: string,
  verdict: InspectionVerdict,
  counts: { p0: number; p1: number; p2: number },
): InspectionReportSummary {
  return {
    reportId,
    sweepRunId: 'sweep-0',
    submittedAt: '2026-06-11T00:00:00.000Z',
    generatedAt: '2026-06-11T00:00:00.000Z',
    verdict,
    counts,
    findings: [],
  };
}

function handoff(
  handoffId: string,
  reportId: string,
  status: HandoffRecord['status'],
): HandoffRecord {
  return {
    handoffId,
    reportId,
    sweepRunId: 'sweep-0',
    findingIndex: 0,
    severity: 'P0',
    route: 'Builder',
    anomalyClass: 'x',
    cellId: null,
    description: 'A finding description.',
    status,
    branchRef: null,
    amendmentRequest: null,
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  };
}

function inspState(
  data: InspectionLatestData | null,
  error: ApiError | null = null,
): InspectionTriageFetchState {
  return { response: data === null ? null : { data, updatedAt: 0, source: 'MOCK' }, error };
}

function handState(
  data: HandoffLatestData | null,
  error: ApiError | null = null,
): HandoffChainFetchState {
  return { response: data === null ? null : { data, updatedAt: 0, source: 'MOCK' }, error };
}

function project(
  inspection: InspectionTriageFetchState,
  handoffs: HandoffChainFetchState,
  currentTimeMs = 1_000,
) {
  return useTriageStatus(
    () => inspection,
    () => handoffs,
    currentTimeMs,
  ).value;
}

// ----------------------------------------------------------------------------
// State arms (precedence: error → loading → empty → data)
// ----------------------------------------------------------------------------

test('1. inspection fetch error → state "error"', () => {
  const p = project(
    inspState(null, { message: 'boom' }),
    handState({ reportId: null, handoffs: [], counts: ZERO_COUNTS }),
  );
  assert.equal(p.state, 'error');
});

test('2. handoff fetch error → state "error"', () => {
  const p = project(
    inspState({ latest: null, recentReports: [] }),
    handState(null, { message: 'boom' }),
  );
  assert.equal(p.state, 'error');
});

test('3. inspection response unresolved → state "loading"', () => {
  const p = project(
    inspState(null),
    handState({ reportId: null, handoffs: [], counts: ZERO_COUNTS }),
  );
  assert.equal(p.state, 'loading');
});

test('4. handoff response unresolved → state "loading"', () => {
  const p = project(inspState({ latest: null, recentReports: [] }), handState(null));
  assert.equal(p.state, 'loading');
});

test('5. inspection.latest === null → state "empty" (even with handoffs present)', () => {
  const p = project(
    inspState({ latest: null, recentReports: [] }),
    handState({
      reportId: 'r0',
      handoffs: [handoff('r0#0', 'r0', 'open')],
      counts: { ...ZERO_COUNTS, open: 1 },
    }),
  );
  assert.equal(p.state, 'empty');
  assert.equal(p.summary, null);
  assert.equal(p.backlog.length, 0);
});

// ----------------------------------------------------------------------------
// Data arm via the coherent mocks
// ----------------------------------------------------------------------------

test('6. coherent mocks → state "data", coherence "coherent", FAIL summary with P0/P1/P2 counts', () => {
  const inspection = mockInspectionTriage(0).data;
  const handoffs = mockHandoffChain(0).data;
  const p = project(inspState(inspection), handState(handoffs));
  assert.equal(p.state, 'data');
  assert.equal(p.coherence, 'coherent');
  assert.deepEqual(p.summary, { verdict: 'FAIL', counts: { p0: 2, p1: 2, p2: 2 } });
});

test('7. summary item leads the backlog with a triage-summary- id', () => {
  const p = project(inspState(mockInspectionTriage(0).data), handState(mockHandoffChain(0).data));
  assert.ok(p.backlog[0]?.id.startsWith('triage-summary-'));
  assert.equal(p.backlog[0]?.meta, 'Triage');
});

test('8. bucketing — open/claimed→backlog, fix-proposed/escalated→active, resolved/wont-fix→history', () => {
  // The coherent mock has one handoff per status, in lifecycle order.
  const p = project(inspState(mockInspectionTriage(0).data), handState(mockHandoffChain(0).data));
  // backlog = summary + open + claimed
  assert.equal(p.backlog.length, 3);
  // active = fix-proposed + escalated
  assert.equal(p.active.length, 2);
  // history = resolved + wont-fix
  assert.equal(p.history.length, 2);
});

test('9. lifecycle items carry triage-handoff- ids', () => {
  const p = project(inspState(mockInspectionTriage(0).data), handState(mockHandoffChain(0).data));
  assert.ok(p.backlog[1]?.id.startsWith('triage-handoff-'));
  assert.ok(p.active[0]?.id.startsWith('triage-handoff-'));
  assert.ok(p.history[0]?.id.startsWith('triage-handoff-'));
});

test('10. distribution surfaces the handoff counts', () => {
  const p = project(inspState(mockInspectionTriage(0).data), handState(mockHandoffChain(0).data));
  assert.deepEqual(p.distribution, {
    open: 1,
    claimed: 1,
    fixProposed: 1,
    escalated: 1,
    resolved: 1,
    wontFix: 1,
  });
});

// ----------------------------------------------------------------------------
// Cross-source coherence gate
// ----------------------------------------------------------------------------

test('11. reportId skew → coherence "handoff-stale", marker emitted, state still "data", lifecycle still rendered', () => {
  const latest = report('report-NEW', 'FAIL', { p0: 1, p1: 0, p2: 0 });
  const handoffs: HandoffLatestData = {
    reportId: 'report-OLD',
    handoffs: [handoff('report-OLD#0', 'report-OLD', 'open')],
    counts: { ...ZERO_COUNTS, open: 1 },
  };
  const p = project(inspState({ latest, recentReports: [latest] }), handState(handoffs));
  assert.equal(p.state, 'data');
  assert.equal(p.coherence, 'handoff-stale');
  // backlog = summary, coherence marker, then the (stale) open handoff
  assert.ok(p.backlog[0]?.id.startsWith('triage-summary-'));
  assert.ok(p.backlog[1]?.id.startsWith('triage-coherence-report-NEW'));
  assert.ok(p.backlog[2]?.id.startsWith('triage-handoff-'));
});

test('12. handoffs.reportId null with a non-null latest → coherence "handoff-stale"', () => {
  const latest = report('report-NEW', 'PASS', { p0: 0, p1: 0, p2: 0 });
  const p = project(
    inspState({ latest, recentReports: [latest] }),
    handState({ reportId: null, handoffs: [], counts: ZERO_COUNTS }),
  );
  assert.equal(p.coherence, 'handoff-stale');
  assert.ok(p.backlog.some((item) => item.id.startsWith('triage-coherence-')));
});

test('13. coherent reportIds → no coherence marker', () => {
  const p = project(inspState(mockInspectionTriage(0).data), handState(mockHandoffChain(0).data));
  assert.equal(
    p.backlog.some((item) => item.id.startsWith('triage-coherence-')),
    false,
  );
});

// ----------------------------------------------------------------------------
// Empty vs PASS-clean precedence
// ----------------------------------------------------------------------------

test('14. PASS report with zero handoffs → state "data" (NOT empty), summary present, buckets empty', () => {
  const latest = report('report-PASS', 'PASS', { p0: 0, p1: 0, p2: 0 });
  const p = project(
    inspState({ latest, recentReports: [latest] }),
    handState({ reportId: 'report-PASS', handoffs: [], counts: ZERO_COUNTS }),
  );
  assert.equal(p.state, 'data');
  assert.deepEqual(p.summary, { verdict: 'PASS', counts: { p0: 0, p1: 0, p2: 0 } });
  assert.equal(p.backlog.length, 1); // just the summary
  assert.equal(p.active.length, 0);
  assert.equal(p.history.length, 0);
});

// ----------------------------------------------------------------------------
// Ordering preservation + defensive distribution + wall-clock independence
// ----------------------------------------------------------------------------

test('15. handoff order is preserved (no re-sort) in the backlog', () => {
  const latest = report('r0', 'FAIL', { p0: 1, p1: 1, p2: 0 });
  const handoffs: HandoffLatestData = {
    reportId: 'r0',
    handoffs: [
      handoff('r0#2', 'r0', 'open'),
      handoff('r0#0', 'r0', 'open'),
      handoff('r0#1', 'r0', 'claimed'),
    ],
    counts: { ...ZERO_COUNTS, open: 2, claimed: 1 },
  };
  const p = project(inspState({ latest, recentReports: [latest] }), handState(handoffs));
  // backlog = [summary, r0#2, r0#0, r0#1] — received order preserved, not sorted.
  assert.equal(p.backlog[1]?.id, 'triage-handoff-r0#2');
  assert.equal(p.backlog[2]?.id, 'triage-handoff-r0#0');
  assert.equal(p.backlog[3]?.id, 'triage-handoff-r0#1');
});

test('16. distribution reads a partial counts object defensively (missing keys → 0)', () => {
  const latest = report('r0', 'FAIL', { p0: 1, p1: 0, p2: 0 });
  // A malformed live response: counts missing five keys (passes the structural
  // guard, narrowed here). Cast models the runtime-but-not-type shape.
  const partialCounts = { open: 5 } as unknown as HandoffStatusCounts;
  const handoffs: HandoffLatestData = { reportId: 'r0', handoffs: [], counts: partialCounts };
  const p = project(inspState({ latest, recentReports: [latest] }), handState(handoffs));
  assert.deepEqual(p.distribution, {
    open: 5,
    claimed: 0,
    fixProposed: 0,
    escalated: 0,
    resolved: 0,
    wontFix: 0,
  });
});

test('17. wall-clock independence — different currentTimeMs yields an identical projection', () => {
  const inspection = inspState(mockInspectionTriage(0).data);
  const handoffs = handState(mockHandoffChain(0).data);
  const early = project(inspection, handoffs, 1_000);
  const late = project(inspection, handoffs, 9_999_999);
  assert.deepEqual(early, late);
});
