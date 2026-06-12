import type { ServiceResponse } from '../types/index.js';
import type {
  HandoffLatestData,
  HandoffRecord,
  HandoffStatus,
  InspectionFinding,
  InspectionLatestData,
  InspectionReportSummary,
  InspectionSeverity,
  TriageRoute,
} from '../types/triage.js';

// ============================================================================
// WP-239 / EC-270 — Mock factories for the triage dashboard surface.
//
// Two deterministic factories produce the default MOCK-mode-first fixtures the
// Pipeline Inspector lane renders in local-dev + tests:
//   - `mockInspectionTriage(nowMs)` → a FAIL report with P0/P1/P2 findings
//   - `mockHandoffChain(nowMs)` → handoffs spanning ALL SIX lifecycle statuses
//
// The fixtures are COHERENT: `mockInspectionTriage(...).latest.reportId ===
// mockHandoffChain(...).reportId`, so the default dev render is
// `coherence: 'coherent'` (the skew / handoff-stale path is exercised by the
// composable test, not the default fixture). `counts` sums to `handoffs.length`.
//
// Anomaly keys are DELIBERATELY opaque mock strings distinct from the engine's
// WP-195 taxonomy — the dashboard treats `anomalyClass` as opaque (D-20703), so
// the mock proves the lane renders whatever string arrives without importing or
// branching on engine types. Mirrors the `sweepHealthMocks.ts` shape.
// ============================================================================

// The single coherent report id shared by both factories. Form is
// `<sweepRunId>-<generatedAtIsoCompact>` per the server `reportId` grammar.
const MOCK_SWEEP_RUN_ID = 'mock-sweep-0042';
const MOCK_REPORT_ID = `${MOCK_SWEEP_RUN_ID}-20260611T030000Z`;
const MOCK_GENERATED_AT = '2026-06-11T03:00:00.000Z';
const MOCK_SUBMITTED_AT = '2026-06-11T03:05:00.000Z';

/**
 * One fixture row driving both a finding and its handoff at the same index.
 * The six rows cover every lifecycle status and all three severities, so the
 * lane renders ≥ 1 item in each bucket (backlog / active / history).
 */
interface TriageFixtureRow {
  readonly status: HandoffStatus;
  readonly severity: InspectionSeverity;
  readonly route: TriageRoute;
  readonly anomalyClass: string;
  readonly cellId: string | null;
  readonly description: string;
  readonly branchRef: string | null;
  readonly amendmentRequest: string | null;
}

const TRIAGE_FIXTURES: readonly TriageFixtureRow[] = [
  {
    status: 'open',
    severity: 'P0',
    route: 'Builder',
    anomalyClass: 'mock-soft-lock',
    cellId: 'scheme-legacy-virus|mastermind-red-skull',
    description: 'Villain pursuit never resolves, soft-locking the turn loop.',
    branchRef: null,
    amendmentRequest: null,
  },
  {
    status: 'claimed',
    severity: 'P1',
    route: 'Builder',
    anomalyClass: 'mock-rule-divergence',
    cellId: 'scheme-secret-invasion|mastermind-loki',
    description: 'Recruit ring count diverges from the locked rule table.',
    branchRef: null,
    amendmentRequest: null,
  },
  {
    status: 'fix-proposed',
    severity: 'P2',
    route: 'Builder',
    anomalyClass: 'mock-display-glitch',
    cellId: 'scheme-negative-zone|mastermind-magneto',
    description: 'Wound pile count renders one ahead of the engine value.',
    branchRef: 'claude/fix-mock-0042-wound-count',
    amendmentRequest: null,
  },
  {
    status: 'escalated',
    severity: 'P0',
    route: 'Architect',
    anomalyClass: 'mock-spec-gap',
    cellId: null,
    description: 'Mastermind tactic ordering is unspecified for ties.',
    branchRef: null,
    amendmentRequest: 'Clarify mastermind tactic tie-break ordering in the scheme spec.',
  },
  {
    status: 'resolved',
    severity: 'P1',
    route: 'Builder',
    anomalyClass: 'mock-rule-divergence',
    cellId: 'scheme-midtown-bank|mastermind-dr-doom',
    description: 'Bystander rescue award was off by one; corrected and verified gone.',
    branchRef: 'claude/fix-mock-0042-bystander-award',
    amendmentRequest: null,
  },
  {
    status: 'wont-fix',
    severity: 'P2',
    route: 'Architect',
    anomalyClass: 'mock-cosmetic',
    cellId: 'scheme-legacy-virus|mastermind-apocalypse',
    description: 'Card art aspect ratio differs from print; deferred as cosmetic.',
    branchRef: null,
    amendmentRequest: null,
  },
];

/**
 * Wrap a value into a `ServiceResponse<T>` with the `MOCK` source label.
 * `updatedAt` is the caller-supplied `nowMs` so this file carries no bare
 * `Date.now()` call site. Mirrors `sweepHealthMocks.ts`.
 */
function wrapMock<T>(data: T, nowMs: number): ServiceResponse<T> {
  return {
    data,
    updatedAt: nowMs,
    source: 'MOCK',
  };
}

/**
 * Build the inspection finding for fixture row `index`. Each finding is the
 * pre-handoff form of the same row that `mockHandoffChain` snapshots.
 */
function buildMockFinding(fixture: TriageFixtureRow): InspectionFinding {
  return {
    severity: fixture.severity,
    anomalyClass: fixture.anomalyClass,
    cellId: fixture.cellId,
    description: fixture.description,
    route: fixture.route,
  };
}

/**
 * Build the handoff row for fixture `index`. `handoffId` is
 * `${reportId}#${findingIndex}` per the server grammar; timestamps are fixed so
 * the fixture is byte-identical across reloads.
 */
function buildMockHandoff(fixture: TriageFixtureRow, index: number): HandoffRecord {
  return {
    handoffId: `${MOCK_REPORT_ID}#${index}`,
    reportId: MOCK_REPORT_ID,
    sweepRunId: MOCK_SWEEP_RUN_ID,
    findingIndex: index,
    severity: fixture.severity,
    route: fixture.route,
    anomalyClass: fixture.anomalyClass,
    cellId: fixture.cellId,
    description: fixture.description,
    status: fixture.status,
    branchRef: fixture.branchRef,
    amendmentRequest: fixture.amendmentRequest,
    createdAt: MOCK_GENERATED_AT,
    updatedAt: MOCK_SUBMITTED_AT,
  };
}

/**
 * Deterministic mock for `GET /api/inspection/latest`. Returns a single FAIL
 * report (two findings each of P0/P1/P2) as `latest`, with the same report in
 * `recentReports`. The endpoint ignores all query params, so there is no range
 * input. `nowMs` controls only the `ServiceResponse.updatedAt` timestamp.
 */
export function mockInspectionTriage(nowMs: number): ServiceResponse<InspectionLatestData> {
  const findings: InspectionFinding[] = [];
  for (const fixture of TRIAGE_FIXTURES) {
    findings.push(buildMockFinding(fixture));
  }

  const summary: InspectionReportSummary = {
    reportId: MOCK_REPORT_ID,
    sweepRunId: MOCK_SWEEP_RUN_ID,
    submittedAt: MOCK_SUBMITTED_AT,
    generatedAt: MOCK_GENERATED_AT,
    // why: verdict is FAIL because the fixture carries P0 + P1 findings — the
    // server recomputes FAIL iff any P0 or P1, and the mock matches that rule so
    // the lane renders a representative FAIL summary in dev.
    verdict: 'FAIL',
    counts: { p0: 2, p1: 2, p2: 2 },
    findings,
  };

  const data: InspectionLatestData = {
    latest: summary,
    recentReports: [summary],
  };
  return wrapMock(data, nowMs);
}

/**
 * Deterministic mock for `GET /api/handoffs/latest`. Returns one handoff per
 * fixture row (all six lifecycle statuses) under the SAME `reportId` as
 * `mockInspectionTriage`, so the default render is coherent. `counts` sums to
 * `handoffs.length` (6). `nowMs` controls only the `updatedAt` timestamp.
 */
export function mockHandoffChain(nowMs: number): ServiceResponse<HandoffLatestData> {
  const handoffs: HandoffRecord[] = [];
  for (let index = 0; index < TRIAGE_FIXTURES.length; index++) {
    handoffs.push(buildMockHandoff(TRIAGE_FIXTURES[index]!, index));
  }

  const data: HandoffLatestData = {
    reportId: MOCK_REPORT_ID,
    handoffs,
    // One handoff per status, so every count is 1 and the sum is 6.
    counts: {
      open: 1,
      claimed: 1,
      fixProposed: 1,
      escalated: 1,
      resolved: 1,
      wontFix: 1,
    },
  };
  return wrapMock(data, nowMs);
}
