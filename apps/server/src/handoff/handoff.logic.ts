/**
 * Handoff Logic — Server Layer (WP-232 / EC-264)
 *
 * Pure helpers + SQL + result mapping for the `legendary.finding_handoffs`
 * surface. Exported functions:
 *
 *   1. `deriveHandoffId(reportId, findingIndex)` — the deterministic PRIMARY KEY
 *      `<reportId>#<findingIndex>`. Pure; no IO.
 *   2. `isAllowedTransition(fromStatus, toStatus)` — the server-enforced lifecycle
 *      gate, an explicit object-map lookup against the locked transition table
 *      (an explicit loop, never an array fold; no dynamic access on an untrusted
 *      key). Pure.
 *   3. `countHandoffsByStatus(handoffs)` — per-status counts for the GET envelope.
 *      Pure; explicit `for...of` (no array fold).
 *   4. `syncHandoffsFromLatestReport(database)` — reads the latest inspection
 *      report THROUGH `fetchLatestInspectionReport` (no direct `inspection_reports`
 *      SQL in this module) and idempotently inserts one `open` row per finding via
 *      `INSERT ... ON CONFLICT (handoff_id) DO NOTHING`.
 *   5. `applyHandoffTransition(database, handoffId, payload)` — load → legality →
 *      guarded atomic UPDATE → 0-rows re-read. Concurrency-safe (no lost update).
 *   6. `fetchLatestHandoffs(database)` — the latest report's rows under the locked
 *      deterministic ordering.
 *   7. `mapRowToHandoff(row)` — snake_case row -> camelCase `HandoffRecord`.
 *   8. `isAnomalyResolved(handoff, report)` — true iff the handoff's snapshotted
 *      `(cellId, anomalyClass)` is ABSENT from the latest report's findings
 *      (existential, strict `===`, no coercion). Pure; no IO. (WP-233 / EC-265)
 *   9. `verifyFixProposedHandoffs(database)` — closes the sweep loop: diffs each
 *      `fix-proposed` handoff against the latest report (read via
 *      `fetchLatestInspectionReport` ONLY) and transitions newer-report matches
 *      `→ resolved` (anomaly gone) / `→ claimed` (anomaly present) through the
 *      EXISTING `applyHandoffTransition`; same-report handoffs are skipped; a
 *      concurrent advance is caught and excluded. Returns a `HandoffVerifySummary`.
 *      (WP-233 / EC-265)
 *
 * Plus `HandoffNotFoundError` (404) + `HandoffTransitionError` (409) the route
 * layer maps to status codes.
 *
 * Snapshot-vs-authority split (D-23201): the handoff SNAPSHOTS the finding's
 * severity / route / anomalyClass / cellId / description for cheap addressable
 * reads; the `inspection_reports` row stays authoritative for finding CONTENT;
 * the handoff row is authoritative ONLY for lifecycle `status` + the `branchRef`
 * / `amendmentRequest` references.
 *
 * Plumbing-only posture (D-23202): `branchRef` / `amendmentRequest` are
 * references this module STORES, never actions it performs.
 *
 * Layer-boundary contract: imports only `./handoff.types.js`,
 * `../inspection/inspection.logic.js` (the `fetchLatestInspectionReport`
 * accessor — one source of truth), `../inspection/inspection.types.js`
 * (type-only — `InspectionReportSummary`, the verify diff's report shape), and
 * `pg` (for the `Pool` type). No
 * `boardgame.io`, no `@legendary-arena/game-engine`, no `apps/dashboard/**`. The
 * INSERT / UPDATE statements enumerate columns explicitly (positional form
 * forbidden — D-20701 carry-forward); `created_at` is omitted on INSERT (column
 * DEFAULT `NOW()`), `updated_at = NOW()` is set explicitly on every transition.
 *
 * Authority: WP-232 §Non-Negotiable Constraints + §Locked contract values;
 * EC-264 §Locked Values + §Guardrails + §Required `// why:` Comments; D-23201
 * (storage shape + snapshot posture); D-23202 (lifecycle state machine + atomic
 * transition + plumbing-only lock); D-23203 (idempotent sync + source-of-truth
 * accessor). The additive closed-loop verify (`isAnomalyResolved` +
 * `verifyFixProposedHandoffs`) is authorized by WP-233 §Locked Type Contracts +
 * §Non-Negotiable Constraints; EC-265 §Locked Values + §Guardrails + §Required
 * `// why:` Comments; D-23301 (closed-loop verification posture: full-report
 * `(cellId, anomalyClass)` diff, newer-report-only guard, lifecycle reuse with no
 * new state, server-authoritative transitions, concurrent-miss catch).
 */

import type { Pool } from 'pg';

import { fetchLatestInspectionReport } from '../inspection/inspection.logic.js';
import type { InspectionReportSummary } from '../inspection/inspection.types.js';
import type {
  HandoffRecord,
  HandoffStatus,
  HandoffStatusCounts,
  HandoffSyncSummary,
  HandoffTransitionPayload,
  HandoffVerifySummary,
  InspectionRoute,
  InspectionSeverity,
} from './handoff.types.js';

/**
 * Database client surface this module uses. Mirrors the WP-205 / WP-209 / WP-231
 * `DatabaseClient = Pool` re-export so the handoff module does not import `pg`
 * directly for value-mode usage. Production wiring passes the long-lived
 * `pg.Pool`; tests pass a recording fake satisfying the same `query()` shape.
 */
export type DatabaseClient = Pool;

// why: the explicit column list shared by the row-shaped SELECT / RETURNING
// clauses. Enumerating the 14 columns once (in schema order) keeps the
// statements positional-insert-free per D-20701 and the mapper aligned with the
// migration without re-typing the list at every call site.
const HANDOFF_ROW_COLUMNS =
  'handoff_id, report_id, sweep_run_id, finding_index, severity, route, anomaly_class, cell_id, description, status, branch_ref, amendment_request, created_at, updated_at';

// why: the locked transition table as an explicit `from -> readonly to[]` object
// map (D-23202). `isAllowedTransition` reads it by the loaded row's status (a
// trusted, CHECK-constrained `HandoffStatus`), never by the client's raw input —
// the route layer has already gated `toStatus` into `HANDOFF_STATUSES` before any
// legality check. `resolved` / `wont-fix` are terminal (empty target lists).
const ALLOWED_TRANSITIONS: Readonly<Record<HandoffStatus, readonly HandoffStatus[]>> = {
  open: ['claimed'],
  claimed: ['fix-proposed', 'escalated', 'wont-fix'],
  'fix-proposed': ['resolved', 'claimed'],
  escalated: ['claimed', 'resolved', 'wont-fix'],
  resolved: [],
  'wont-fix': [],
};

/**
 * Thrown by `applyHandoffTransition` when the target `handoffId` does not exist
 * (the initial load returns no row, OR the post-0-rows re-read finds the row
 * gone). The route layer maps this to 404 with `{ data: [], error: 'not_found' }`.
 */
export class HandoffNotFoundError extends Error {
  public readonly handoffId: string;

  public constructor(handoffId: string) {
    super(
      `Handoff with handoffId "${handoffId}" does not exist in legendary.finding_handoffs. ` +
        `An unknown handoffId returns 404 Not Found.`,
    );
    this.name = 'HandoffNotFoundError';
    this.handoffId = handoffId;
  }
}

/**
 * Thrown by `applyHandoffTransition` when the requested `(fromStatus, toStatus)`
 * pair is not in the locked transition table, OR when a concurrent transition
 * advanced the row between the load and the guarded UPDATE (the 0-rows re-read
 * found a different status). The route layer maps this to 409 with
 * `{ data: [], error: 'conflict' }`; the row's status is left UNCHANGED.
 */
export class HandoffTransitionError extends Error {
  public readonly handoffId: string;
  public readonly fromStatus: HandoffStatus;
  public readonly toStatus: HandoffStatus;

  public constructor(handoffId: string, fromStatus: HandoffStatus, toStatus: HandoffStatus) {
    super(
      `Handoff "${handoffId}" cannot transition from "${fromStatus}" to "${toStatus}"; ` +
        `that pair is not in the locked transition table (or a concurrent transition already moved the row). ` +
        `An off-table transition returns 409 Conflict with the row's status unchanged.`,
    );
    this.name = 'HandoffTransitionError';
    this.handoffId = handoffId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

/**
 * Builds the deterministic handoff PRIMARY KEY for one finding: the report id,
 * the literal `#` separator (which never appears in a `reportId`), and the
 * 0-based finding index. Pure — the same `(reportId, findingIndex)` always yields
 * the same id, which is what makes a re-sync idempotent via the PRIMARY KEY.
 */
export function deriveHandoffId(reportId: string, findingIndex: number): string {
  return `${reportId}#${findingIndex}`;
}

/**
 * Returns `true` iff `(fromStatus -> toStatus)` is in the locked transition table.
 * An explicit object-map lookup + `for...of` over the target list — never an
 * array fold, no dynamic property access on an untrusted key (`fromStatus` is the
 * DB-loaded, CHECK-constrained status; `toStatus` is already `HANDOFF_STATUSES`-
 * gated by the route validator). `resolved` / `wont-fix` are terminal so every
 * transition out of them returns `false`.
 */
export function isAllowedTransition(fromStatus: HandoffStatus, toStatus: HandoffStatus): boolean {
  const allowedTargets = ALLOWED_TRANSITIONS[fromStatus];
  for (const candidate of allowedTargets) {
    if (candidate === toStatus) {
      return true;
    }
  }
  return false;
}

/**
 * Counts handoffs by lifecycle status for the `GET /api/handoffs/latest`
 * envelope. Explicit `for...of` with one accumulator per status (never an array
 * fold, no dynamic key access). The returned object sums to `handoffs.length`.
 */
export function countHandoffsByStatus(
  handoffs: readonly HandoffRecord[],
): HandoffStatusCounts {
  let open = 0;
  let claimed = 0;
  let fixProposed = 0;
  let escalated = 0;
  let resolved = 0;
  let wontFix = 0;
  for (const handoff of handoffs) {
    if (handoff.status === 'open') {
      open = open + 1;
    } else if (handoff.status === 'claimed') {
      claimed = claimed + 1;
    } else if (handoff.status === 'fix-proposed') {
      fixProposed = fixProposed + 1;
    } else if (handoff.status === 'escalated') {
      escalated = escalated + 1;
    } else if (handoff.status === 'resolved') {
      resolved = resolved + 1;
    } else {
      wontFix = wontFix + 1;
    }
  }
  return { open, claimed, fixProposed, escalated, resolved, wontFix };
}

/**
 * Materializes one `open` handoff row per finding of the LATEST inspection
 * report. Idempotent and non-destructive.
 *
 * The report is obtained through the inspection library accessor
 * (`fetchLatestInspectionReport`) — this module issues NO direct SQL against the
 * inspection-reports table, so there is one source of truth and no duplicate
 * query logic to drift (D-23203). Returns the null-report summary when the
 * inspection table is empty.
 *
 * Each finding is inserted with an explicit column list (positional form
 * forbidden — D-20701); `created_at` / `updated_at` are omitted (column DEFAULT
 * `NOW()`). `RETURNING handoff_id` lets the caller count newly-created rows: a
 * conflict (the id already exists) returns no row, so `created` counts only fresh
 * inserts and `unchanged = findingCount - created`.
 */
export async function syncHandoffsFromLatestReport(
  database: DatabaseClient,
): Promise<HandoffSyncSummary> {
  const latestReport = await fetchLatestInspectionReport(database);
  if (latestReport === null) {
    return { reportId: null, findingCount: 0, created: 0, unchanged: 0 };
  }
  const findings = latestReport.findings;
  let created = 0;
  for (let findingIndex = 0; findingIndex < findings.length; findingIndex = findingIndex + 1) {
    const finding = findings[findingIndex]!;
    const handoffId = deriveHandoffId(latestReport.reportId, findingIndex);
    // why (D-23203): the idempotent conflict-skip insert preserves each existing
    // row's lifecycle status, so a nightly re-sync of the same report is a normal
    // no-op (a `claimed` row stays `claimed`) — the deliberate opposite of the
    // inspection POST's duplicate-is-an-error (409) posture. `RETURNING
    // handoff_id` yields a row ONLY on a fresh insert, so the returned-row count
    // is exactly the newly-created count. The snapshot columns (severity / route
    // / anomaly_class / cell_id / description) are a point-in-time copy of the
    // finding for addressable reads; the inspection report stays authoritative for
    // finding content, and the handoff is authoritative only for lifecycle status
    // (D-23201).
    const insertResult = await database.query(
      `INSERT INTO legendary.finding_handoffs (handoff_id, report_id, sweep_run_id, finding_index, severity, route, anomaly_class, cell_id, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
       ON CONFLICT (handoff_id) DO NOTHING
       RETURNING handoff_id`,
      [
        handoffId,
        latestReport.reportId,
        latestReport.sweepRunId,
        findingIndex,
        finding.severity,
        finding.route,
        finding.anomalyClass,
        finding.cellId,
        finding.description,
      ],
    );
    if (insertResult.rows.length === 1) {
      created = created + 1;
    }
  }
  const findingCount = findings.length;
  return {
    reportId: latestReport.reportId,
    findingCount,
    created,
    unchanged: findingCount - created,
  };
}

/**
 * Applies one server-validated lifecycle transition to a single handoff.
 * Concurrency-safe: two transitions racing from the same starting state cannot
 * both succeed.
 *
 * Steps (the route layer has already validated auth / body / shape /
 * conditional-required fields before this is called):
 *   5. Load the row by `handoffId` (the `expectedStatus` read). Absent -> 404.
 *   6. `(row.status, toStatus)` legality vs the locked table. Off-table -> 409.
 *   7. A single guarded `UPDATE ... WHERE handoff_id = $1 AND status = $expected`.
 *
 * `branch_ref` is written ONLY when `toStatus === 'fix-proposed'` and
 * `amendment_request` ONLY when `toStatus === 'escalated'`; on every other
 * transition both are PRESERVED from the loaded row (write-on-enter, never
 * cleared — D-23201). `updated_at = NOW()` is set explicitly.
 */
export async function applyHandoffTransition(
  database: DatabaseClient,
  handoffId: string,
  payload: HandoffTransitionPayload,
): Promise<HandoffRecord> {
  const loadResult = await database.query(
    `SELECT ${HANDOFF_ROW_COLUMNS} FROM legendary.finding_handoffs WHERE handoff_id = $1`,
    [handoffId],
  );
  if (loadResult.rows.length === 0) {
    throw new HandoffNotFoundError(handoffId);
  }
  const currentRow = mapRowToHandoff(loadResult.rows[0] as Record<string, unknown>);
  const expectedStatus = currentRow.status;
  if (isAllowedTransition(expectedStatus, payload.toStatus) === false) {
    throw new HandoffTransitionError(handoffId, expectedStatus, payload.toStatus);
  }
  // Field persistence (write-on-enter, never cleared — D-23201): only the
  // entered-state reference is overwritten; the other is carried from the loaded
  // row so the fix-branch reference + escalation payload survive the rest of the
  // lifecycle for auditability. `?? null` keeps a wire-optional value `string |
  // null`, never `undefined`, at the DB boundary.
  const branchRefForUpdate =
    payload.toStatus === 'fix-proposed' ? payload.branchRef ?? null : currentRow.branchRef;
  const amendmentRequestForUpdate =
    payload.toStatus === 'escalated' ? payload.amendmentRequest ?? null : currentRow.amendmentRequest;
  // why (D-23202): the status-equality predicate on the UPDATE is the
  // optimistic-concurrency guard — if a parallel transition advanced the row
  // between the load above and this write, the UPDATE matches 0 rows (a no-op)
  // instead of silently clobbering the other transition's result (no lost
  // update). On 0 rows the handler re-reads once and disambiguates 404 (gone) vs
  // 409 (status moved). No `FOR UPDATE` / advisory lock / multi-statement
  // transaction — the `AND status =` predicate IS the concurrency control.
  const updateResult = await database.query(
    `UPDATE legendary.finding_handoffs
       SET status = $2, branch_ref = $3, amendment_request = $4, updated_at = NOW()
       WHERE handoff_id = $1 AND status = $5
       RETURNING ${HANDOFF_ROW_COLUMNS}`,
    [handoffId, payload.toStatus, branchRefForUpdate, amendmentRequestForUpdate, expectedStatus],
  );
  if (updateResult.rows.length === 0) {
    const reReadResult = await database.query(
      `SELECT ${HANDOFF_ROW_COLUMNS} FROM legendary.finding_handoffs WHERE handoff_id = $1`,
      [handoffId],
    );
    if (reReadResult.rows.length === 0) {
      throw new HandoffNotFoundError(handoffId);
    }
    const movedRow = mapRowToHandoff(reReadResult.rows[0] as Record<string, unknown>);
    throw new HandoffTransitionError(handoffId, movedRow.status, payload.toStatus);
  }
  return mapRowToHandoff(updateResult.rows[0] as Record<string, unknown>);
}

/**
 * Returns `true` iff the handoff's snapshotted anomaly is GONE from the latest
 * inspection report — NO finding in `report.findings` matches BOTH the handoff's
 * `cellId` and its `anomalyClass`. Existential, NOT a count: a single match is
 * enough to declare the anomaly still PRESENT, so a future engineer must never
 * weight, score, or tie-break on the number of matches. Pure — no IO.
 *
 * Matching is strict `===` on each field with NO coercion. A run-level
 * finding/handoff carries `cellId: null`; `null === null` is a valid run-level
 * match, and a `string` cellId never matches `null`. Both `mapRowToHandoff` and
 * `InspectionFinding` already supply `cellId: string | null`, so the two sides
 * arrive pre-normalized and are compared raw (never `String()` / `?? ''` /
 * `"null"`). `anomalyClass` is the opaque string compared as-is (no engine union
 * import — D-23103 carry-forward); the LLM-nondeterministic finding `description`
 * is never read.
 */
export function isAnomalyResolved(
  handoff: HandoffRecord,
  report: InspectionReportSummary,
): boolean {
  for (const finding of report.findings) {
    if (finding.cellId === handoff.cellId && finding.anomalyClass === handoff.anomalyClass) {
      return false;
    }
  }
  return true;
}

/**
 * Closes the sweep loop: verifies every `fix-proposed` handoff against the latest
 * (re-sweep) inspection report and transitions it through the EXISTING WP-232
 * lifecycle (no new state). Returns a `HandoffVerifySummary`.
 *
 * The latest report is obtained through the inspection library accessor
 * (`fetchLatestInspectionReport`) — see the source-of-truth `// why:` below; the
 * `fix-proposed` rows are loaded with a single `WHERE status = 'fix-proposed'`
 * SELECT against this module's own `finding_handoffs` table. For each handoff:
 *
 *   1. `R` null (empty `inspection_reports`) → no-op; all-zero, `reportId: null`.
 *   2. `H.reportId === R.reportId` → `skipped` (no re-sweep has run since the fix).
 *   3. else `isAnomalyResolved(H, R)` → gone ⇒ `resolved` (verified); present ⇒
 *      `claimed` (regressed) — both through the existing `applyHandoffTransition`.
 *
 * Explicit `for...of`, never an array fold. Each handoff is diffed independently
 * against the SAME immutable report, so processing order is outcome-irrelevant.
 * `verified + regressed + skipped <= ` the initial `fix-proposed` count — the
 * delta is the concurrent misses the per-transition catch excludes.
 */
export async function verifyFixProposedHandoffs(
  database: DatabaseClient,
): Promise<HandoffVerifySummary> {
  const latestReport = await fetchLatestInspectionReport(database);
  if (latestReport === null) {
    return { reportId: null, verified: 0, regressed: 0, skipped: 0 };
  }
  // why (D-23203, source of truth): the latest report arrives ONLY through the
  // inspection library accessor above — this module issues NO direct query
  // against the inspection-reports table (Verification step 4 counts that policed
  // literal at 0 here). The `fix-proposed` rows below come from this module's OWN
  // handoff table, which it is free to read directly.
  const fixProposedResult = await database.query(
    `SELECT ${HANDOFF_ROW_COLUMNS} FROM legendary.finding_handoffs WHERE status = $1`,
    ['fix-proposed'],
  );
  let verified = 0;
  let regressed = 0;
  let skipped = 0;
  for (const dbRow of fixProposedResult.rows) {
    const handoff = mapRowToHandoff(dbRow as Record<string, unknown>);
    // why (D-23301, newer-report guard): a `fix-proposed` handoff is verified ONLY
    // against a report NEWER than its origin (the `reportId` differs). When the
    // latest report IS the handoff's origin report, no re-sweep has run since the
    // fix was recorded, so the still-pre-fix report is not evidence — diffing
    // against it would falsely regress the fix. Same-report handoffs are skipped.
    if (handoff.reportId === latestReport.reportId) {
      skipped = skipped + 1;
      continue;
    }
    // why (D-23301, reuse-not-new-state): verification reuses the existing
    // lifecycle — anomaly gone ⇒ `resolved`, anomaly present ⇒ `claimed` (the
    // re-open edge WP-232 reserved); NO `verified` state is added (operator
    // decision). Transitioning through `applyHandoffTransition` inherits its
    // guarded UPDATE so the diff is server-authoritative and concurrency-safe.
    const isResolved = isAnomalyResolved(handoff, latestReport);
    const toStatus: HandoffStatus = isResolved === true ? 'resolved' : 'claimed';
    try {
      await applyHandoffTransition(database, handoff.handoffId, {
        handoffId: handoff.handoffId,
        toStatus,
      });
      if (isResolved === true) {
        verified = verified + 1;
      } else {
        regressed = regressed + 1;
      }
    } catch (concurrentAdvanceError) {
      if (
        concurrentAdvanceError instanceof HandoffTransitionError ||
        concurrentAdvanceError instanceof HandoffNotFoundError
      ) {
        // why (D-23301, concurrent-miss catch): `applyHandoffTransition` THROWS
        // when a concurrent writer advanced this row out of `fix-proposed`
        // between the load above and its guarded UPDATE — a `HandoffTransitionError`
        // (its legality re-check or its 0-rows re-read) or a `HandoffNotFoundError`
        // (the row was deleted mid-run). That handoff was already acted on by the
        // other writer, so it is intentionally skipped — NOT retried, counted in
        // NO bucket — and the loop continues with the rest. Swallowing the throw
        // here is safe and deliberate (00.6 swallowed-error rule): the opposite of
        // an unhandled abort that would 500 with the remaining handoffs
        // unprocessed. A non-concurrency fault is NOT swallowed — it re-throws to
        // the route's 500.
        void concurrentAdvanceError;
      } else {
        throw concurrentAdvanceError;
      }
    }
  }
  return { reportId: latestReport.reportId, verified, regressed, skipped };
}

/**
 * Returns the latest report's handoff rows under the locked deterministic
 * ordering, or an empty result when `finding_handoffs` is empty.
 *
 * "Latest report" is resolved by `ORDER BY created_at DESC, report_id DESC LIMIT
 * 1` — greatest `created_at`, tie-broken by the lexicographically greatest
 * `report_id` (a total order even under identical timestamps or batch inserts).
 * That report's rows are then selected `ORDER BY finding_index ASC, handoff_id
 * ASC` with a query-level `LIMIT 500` (enforced even if the upstream findings cap
 * changes).
 */
export async function fetchLatestHandoffs(
  database: DatabaseClient,
): Promise<{ reportId: string | null; handoffs: readonly HandoffRecord[] }> {
  // why (D-23201): the `report_id DESC` tie-break makes "latest report" a
  // deterministic total order even when two reports share a `created_at` — the
  // lexicographically greatest `report_id` wins, never a nondeterministic pick.
  const latestResult = await database.query(
    `SELECT report_id FROM legendary.finding_handoffs ORDER BY created_at DESC, report_id DESC LIMIT 1`,
    [],
  );
  if (latestResult.rows.length === 0) {
    return { reportId: null, handoffs: [] };
  }
  const latestReportId = String((latestResult.rows[0] as Record<string, unknown>).report_id);
  const rowsResult = await database.query(
    `SELECT ${HANDOFF_ROW_COLUMNS}
       FROM legendary.finding_handoffs
       WHERE report_id = $1
       ORDER BY finding_index ASC, handoff_id ASC
       LIMIT 500`,
    [latestReportId],
  );
  const handoffs: HandoffRecord[] = [];
  for (const dbRow of rowsResult.rows) {
    handoffs.push(mapRowToHandoff(dbRow as Record<string, unknown>));
  }
  return { reportId: latestReportId, handoffs };
}

/**
 * Maps a single DB row (snake_case columns) to a `HandoffRecord` (camelCase).
 * `created_at` / `updated_at` are TIMESTAMPTZ; the pg driver returns them as
 * `Date` instances — converted to ISO-8601 strings here so the wire shape is
 * timezone-anchored and stable. The nullable `cell_id` / `branch_ref` /
 * `amendment_request` columns map to `string | null` (never `undefined`).
 * `severity` / `route` / `status` are read back through their union types (the DB
 * CHECK constraints guarantee membership).
 */
export function mapRowToHandoff(dbRow: Record<string, unknown>): HandoffRecord {
  const createdAtValue = dbRow.created_at;
  const updatedAtValue = dbRow.updated_at;
  const cellIdValue = dbRow.cell_id;
  const branchRefValue = dbRow.branch_ref;
  const amendmentRequestValue = dbRow.amendment_request;
  return {
    handoffId: String(dbRow.handoff_id),
    reportId: String(dbRow.report_id),
    sweepRunId: String(dbRow.sweep_run_id),
    findingIndex: Number(dbRow.finding_index),
    severity: dbRow.severity as InspectionSeverity,
    route: dbRow.route as InspectionRoute,
    anomalyClass: String(dbRow.anomaly_class),
    cellId: cellIdValue === null || cellIdValue === undefined ? null : String(cellIdValue),
    description: String(dbRow.description),
    status: dbRow.status as HandoffStatus,
    branchRef: branchRefValue === null || branchRefValue === undefined ? null : String(branchRefValue),
    amendmentRequest:
      amendmentRequestValue === null || amendmentRequestValue === undefined
        ? null
        : String(amendmentRequestValue),
    createdAt: createdAtValue instanceof Date ? createdAtValue.toISOString() : String(createdAtValue),
    updatedAt: updatedAtValue instanceof Date ? updatedAtValue.toISOString() : String(updatedAtValue),
  };
}
