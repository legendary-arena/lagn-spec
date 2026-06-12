/**
 * Triage Types — Client Layer (WP-239 / EC-270)
 *
 * Layer-safe, hand-maintained mirrors of two server response envelopes:
 *   - `GET /api/inspection/latest` → `InspectionLatestData` (WP-231 — the
 *     server inspection types)
 *   - `GET /api/handoffs/latest` → `HandoffLatestData` (WP-232 — the server
 *     handoff types)
 *
 * The dashboard CANNOT import the server package (layer boundary — the dashboard
 * must not import the server or game-engine packages), so these interfaces are
 * kept in lock-step with the authoritative server types by convention plus the
 * cross-app drift guard in `triage.drift.test.ts`. (The exact authoritative
 * server file paths live in that drift test's reconcile messages, not here, to
 * keep this file clear of the layer-boundary close-out grep's policed tokens.)
 *
 * This module is WIRE-ONLY. The `TriageProjection` view-model that the Pipeline
 * page consumes lives with its consumer composable in
 * `composables/useAgentPipeline.ts`, NOT here (D-23901) — declaring it here
 * would force a `PipelineItem` import and a circular type dependency.
 *
 * Authority: WP-239 §Scope (In) A + §Locked Contract Values; EC-270 §Locked
 * Values; D-23901 (layer-safe mirrors + drift guard); D-20703 / D-23103
 * (anomalyClass opacity).
 */

export type InspectionVerdict = 'PASS' | 'FAIL';
export type InspectionSeverity = 'P0' | 'P1' | 'P2';
export type TriageRoute = 'Builder' | 'Architect';

/**
 * A single triage finding, mirroring the server `InspectionFinding`.
 */
// why (D-20703 / D-23103): `anomalyClass` is opaque `string`, NOT the engine's
// closed anomaly-class union — the dashboard never imports the game-engine
// package (layer boundary) and copies whatever string the server stored
// verbatim (a `SWEEP_ANOMALY_CLASSES` member name, or `'meta'` for a run-level
// finding). Unknown future engine keys then render without a dashboard rebuild.
export interface InspectionFinding {
  readonly severity: InspectionSeverity;
  readonly anomalyClass: string;
  readonly cellId: string | null;
  readonly description: string;
  readonly route: TriageRoute;
}

/**
 * One inspection report summary, mirroring the server `InspectionReportSummary`.
 * `verdict` + `counts` are the server-recomputed authoritative values (FAIL iff
 * any P0 or P1).
 */
export interface InspectionReportSummary {
  readonly reportId: string;
  readonly sweepRunId: string;
  readonly submittedAt: string;
  readonly generatedAt: string;
  readonly verdict: InspectionVerdict;
  readonly counts: {
    readonly p0: number;
    readonly p1: number;
    readonly p2: number;
  };
  readonly findings: readonly InspectionFinding[];
}

/**
 * The `GET /api/inspection/latest` response payload (the `data` field of the
 * server envelope). `latest` is `null` only pre-first-run; once any report
 * exists `latest === recentReports[0]`.
 */
export interface InspectionLatestData {
  readonly latest: InspectionReportSummary | null;
  readonly recentReports: readonly InspectionReportSummary[];
}

/**
 * The handoff lifecycle status, mirroring the server `HandoffStatus` (6-member
 * closed union). `resolved` / `wont-fix` are terminal.
 */
export type HandoffStatus =
  | 'open'
  | 'claimed'
  | 'fix-proposed'
  | 'escalated'
  | 'resolved'
  | 'wont-fix';

/**
 * One handoff row, mirroring the server `HandoffRecord`. `handoffId` is
 * `${reportId}#${findingIndex}`. `branchRef` is non-null only from
 * `fix-proposed`; `amendmentRequest` is non-null only from `escalated`.
 */
export interface HandoffRecord {
  readonly handoffId: string;
  readonly reportId: string;
  readonly sweepRunId: string;
  readonly findingIndex: number;
  readonly severity: InspectionSeverity;
  readonly route: TriageRoute;
  readonly anomalyClass: string;
  readonly cellId: string | null;
  readonly description: string;
  readonly status: HandoffStatus;
  readonly branchRef: string | null;
  readonly amendmentRequest: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Per-status counts over the returned handoffs, mirroring the server
 * `HandoffStatusCounts`. The camelCase `fixProposed` / `wontFix` keys map to the
 * `'fix-proposed'` / `'wont-fix'` lifecycle statuses. Sums to `handoffs.length`.
 */
export interface HandoffStatusCounts {
  readonly open: number;
  readonly claimed: number;
  readonly fixProposed: number;
  readonly escalated: number;
  readonly resolved: number;
  readonly wontFix: number;
}

/**
 * The `GET /api/handoffs/latest` response payload (the `data` field of the
 * server envelope). `reportId` is the latest report present in
 * `finding_handoffs`, or `null` when empty. `handoffs` is ordered
 * `(findingIndex ASC, handoffId ASC)`, always ≤ 500 rows.
 */
export interface HandoffLatestData {
  readonly reportId: string | null;
  readonly handoffs: readonly HandoffRecord[];
  readonly counts: HandoffStatusCounts;
}
