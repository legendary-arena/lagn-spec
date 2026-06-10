/**
 * Inspection Types — Server Layer (WP-231 / EC-263)
 *
 * Locked payload + summary + envelope contracts for the
 * `legendary.inspection_reports` server surface (POST `/api/inspection/reports`
 * submission + GET `/api/inspection/latest` operator query). These shapes are
 * the byte-identical contract between `scripts/inspection-submit.mjs` (the CI
 * submitter), the route handlers, and the future dashboard consumer — author
 * them here once, consume verbatim everywhere else.
 *
 * Mirrors the WP-205 analytics-types / WP-209 sweep-types module shape: closed
 * union + canonical-array + envelope-interface contracts, with one deliberate
 * difference from sweep — the anomaly-class union is NOT imported here.
 * `anomalyClass` is a plain `string` (see the `// why:` below): the triage
 * prompt is the only place the engine's class names appear, and the server
 * stores whatever string the agent emits.
 *
 * Layer-boundary contract: this module imports NOTHING (no `boardgame.io`, no
 * `pg`, no `@legendary-arena/game-engine`, no `apps/dashboard/**`). The two
 * closed unions (`InspectionSeverity`, `InspectionRoute`) are defined locally
 * with matching canonical readonly arrays + a bidirectional drift test in
 * `inspection.logic.test.ts` per `00.6 §Drift Detection`.
 *
 * Authority: WP-231 §Locked Type Contracts + §Non-Negotiable Constraints +
 * §Locked contract values; EC-263 §Locked Values + §Guardrails + §Required
 * `// why:` Comments; D-23101 (storage shape + report contract lock); D-23103
 * (anomalyClass opacity — carry-forward of D-20703's dashboard-layer posture to
 * the inspection layer).
 */

// why: `anomalyClass` is a plain string (NOT the engine's closed anomaly-class
// union) to keep the inspection surface free of an engine import — the triage
// prompt is the only place the class names appear, and the server stores
// whatever opaque string the agent emits (it may be a member of the engine's
// canonical anomaly array, or `'meta'` for a run-level finding). D-23103
// carries forward D-20703's opacity posture from the dashboard layer to the
// inspection layer.

/**
 * Severity tag on a single triage finding. Closed union per the agent-inspector
 * rubric: P0 / P1 are merge-blocking; P2 is optional. The deterministic verdict
 * rule (`deriveVerdict`) keys off these: any P0 or P1 -> FAIL.
 */
export type InspectionSeverity = 'P0' | 'P1' | 'P2';

/**
 * Routing tag on a single triage finding — who owns the fix. Closed union per
 * the agent-inspector issue-attribution rule: spec-incorrect / ambiguous ->
 * Architect; code-incorrect-against-clear-spec -> Builder.
 */
export type InspectionRoute = 'Builder' | 'Architect';

// why: canonical readonly arrays paired with each closed union per
// `00.6 §Drift Detection`. The drift test in `inspection.logic.test.ts` asserts
// forward + backward inclusion against the union; the route validator builds
// its membership Set from these arrays so a union change forces both the array
// and the validator gate to update in lockstep.
/**
 * Canonical readonly array mirroring `InspectionSeverity`.
 */
export const INSPECTION_SEVERITIES: readonly InspectionSeverity[] = [
  'P0',
  'P1',
  'P2',
] as const;

/**
 * Canonical readonly array mirroring `InspectionRoute`.
 */
export const INSPECTION_ROUTES: readonly InspectionRoute[] = [
  'Builder',
  'Architect',
] as const;

/**
 * A single triage finding. Locked per WP-231 §Locked Type Contracts.
 *
 * `anomalyClass` is an opaque string (a `SWEEP_ANOMALY_CLASSES` member name, OR
 * `'meta'` for a run-level finding — the server never imports the engine union).
 * `cellId` is the sweep cell id (scheme x mastermind), or `null` for a
 * run-level finding. `description` is a full-sentence finding (validated
 * non-empty, <= 1000 chars). The finding TEXT is LLM-generated and
 * intentionally nondeterministic (D-23102) — only shape is validated, never
 * content.
 */
export interface InspectionFinding {
  readonly severity: InspectionSeverity;
  readonly anomalyClass: string;
  readonly cellId: string | null;
  readonly description: string;
  readonly route: InspectionRoute;
}

/**
 * Request body shape for `POST /api/inspection/reports`.
 *
 * Locked per WP-231 §Locked Type Contracts. `reportId` is the PRIMARY KEY of
 * form `<sweepRunId>-<generatedAtIsoCompact>` (a re-triage of the same sweep
 * run gets a fresh `generatedAt` -> a fresh id -> a distinct row, no 409).
 *
 * `verdict` is the agent's SELF-applied verdict; the SERVER IGNORES it and
 * recomputes (D-23101). The submit script checks agreement as a fail-fast gate
 * (exit 3) before POSTing; the server never trusts, compares, or stores the
 * client value. The stored `p0/p1/p2` counts are likewise recomputed from
 * `findings` — any client-supplied count fields are ignored.
 */
export interface InspectionReportPayload {
  readonly reportId: string;
  readonly sweepRunId: string;
  readonly generatedAt: string;
  readonly verdict: 'PASS' | 'FAIL';
  readonly findings: readonly InspectionFinding[];
}

/**
 * Response row shape for `GET /api/inspection/latest`.
 *
 * Locked per WP-231 §Locked Type Contracts. Field names are camelCase per the
 * WP-205 / WP-209 server-side convention; the underlying DB columns are
 * snake_case (`report_id`, `sweep_run_id`, `submitted_at`, `generated_at`,
 * `verdict`, `p0_count`, `p1_count`, `p2_count`, `findings`) and mapped
 * explicitly in `inspection.logic.ts`'s row mapper. `counts` + `verdict` are
 * the server-recomputed authoritative derived values read back from storage.
 */
export interface InspectionReportSummary {
  readonly reportId: string;
  readonly sweepRunId: string;
  readonly submittedAt: string;
  readonly generatedAt: string;
  readonly verdict: 'PASS' | 'FAIL';
  readonly counts: {
    readonly p0: number;
    readonly p1: number;
    readonly p2: number;
  };
  readonly findings: readonly InspectionFinding[];
}

/**
 * Response envelope for `GET /api/inspection/latest`.
 *
 * Intentional deviation from the WP-205 `{ data: readonly T[] }` envelope —
 * `data` is an OBJECT (not a readonly array) because the endpoint serves two
 * semantically distinct payloads in one response: `latest` (the single
 * greatest-`submitted_at` report, or `null` pre-first-run) AND `recentReports`
 * (the last <= 30 reports ordered `submitted_at DESC`). The same deviation
 * WP-209's `GET /api/sweep/latest` justified. When the table is non-empty,
 * `latest === recentReports[0]` is invariant; the route handler builds both
 * from the same SQL result so the two cannot drift.
 */
export interface InspectionLatestEnvelope {
  readonly data: {
    readonly latest: InspectionReportSummary | null;
    readonly recentReports: readonly InspectionReportSummary[];
  };
}
