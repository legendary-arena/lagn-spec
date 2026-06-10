/**
 * Inspection Logic — Server Layer (WP-231 / EC-263)
 *
 * Pure SQL + result mapping for the `legendary.inspection_reports` surface,
 * plus the deterministic verdict helper. Exported functions:
 *
 *   1. `deriveVerdict(findings)` — the deterministic agent-inspector verdict
 *      rule (`FAIL` iff any finding is `P0` or `P1`, else `PASS`). Pure; no IO.
 *      Used by the route validator (D-23101 server-authoritative verdict) and
 *      mirrored fail-fast by `scripts/inspection-submit.mjs`.
 *   2. `insertInspectionReport(database, payload)` — single-row INSERT.
 *      RECOMPUTES `verdict` + the three counts from `payload.findings` and
 *      stores those (the client's `verdict` is never trusted — D-23101).
 *      Throws `InspectionReportDuplicateError` on PRIMARY KEY collision so the
 *      route layer maps it to 409. No UPSERT.
 *   3. `fetchLatestInspectionReport(database)` — the single row with the
 *      greatest `submitted_at`, or `null` when the table is empty.
 *   4. `fetchRecentInspectionReports(database)` — the last 30 rows ordered
 *      `submitted_at DESC` (literal). Backed by the BTREE index
 *      `inspection_reports_submitted_at_desc_idx`.
 *
 * Layer-boundary contract: imports only `./inspection.types.js` and `pg` (for
 * the `Pool` type). No `boardgame.io`, no `@legendary-arena/game-engine`, no
 * `apps/dashboard/**`. The INSERT enumerates target columns explicitly
 * (positional-bind form forbidden — D-20701 carry-forward); `submitted_at` is
 * omitted (column DEFAULT `NOW()` populates server-side). The `recentReports`
 * SQL is the literal `ORDER BY submitted_at DESC LIMIT 30`.
 *
 * Authority: WP-231 §Non-Negotiable Constraints + §Locked contract values;
 * EC-263 §Locked Values + §Guardrails + §Required `// why:` Comments; D-23101
 * (storage shape + derived-field authority); D-23102 (nondeterministic findings,
 * deterministic verdict).
 */

import type { Pool } from 'pg';

import type {
  InspectionFinding,
  InspectionReportPayload,
  InspectionReportSummary,
} from './inspection.types.js';

/**
 * Database client surface this module uses. Mirrors the WP-052 / WP-205 / WP-209
 * `DatabaseClient = Pool` re-export so the inspection module does not import
 * `pg` directly for value-mode usage. Production wiring passes the long-lived
 * `pg.Pool`; tests pass a recording fake satisfying the same `query()` shape.
 */
export type DatabaseClient = Pool;

/**
 * The server-recomputed derived fields stored alongside the raw findings.
 * Returned by `insertInspectionReport` so callers (and the logic test) can
 * assert the stored values without re-reading the row.
 */
export interface StoredDerivedFields {
  readonly verdict: 'PASS' | 'FAIL';
  readonly p0Count: number;
  readonly p1Count: number;
  readonly p2Count: number;
}

/**
 * Thrown by `insertInspectionReport` when the PRIMARY KEY constraint
 * `inspection_reports_pkey` fires. The route layer catches this and surfaces it
 * as 409 with `{ data: [], error: 'conflict' }`; the existing row remains
 * byte-identical (no UPSERT). A 409 means the EXACT `report_id` already exists
 * (a same-run retry or a bug) — re-triage across runs gets a fresh `generatedAt`
 * and therefore a fresh `report_id`, so it never collides.
 */
export class InspectionReportDuplicateError extends Error {
  public readonly reportId: string;

  public constructor(reportId: string) {
    super(
      `Inspection report with reportId "${reportId}" already exists in legendary.inspection_reports. ` +
        `Duplicate submissions return 409 Conflict and never overwrite the existing row.`,
    );
    this.name = 'InspectionReportDuplicateError';
    this.reportId = reportId;
  }
}

// why: postgres unique-violation SQLSTATE code; the canonical signal for
// "duplicate value violates unique constraint". The pg driver surfaces this on
// the thrown error's `code` property. Numeric SQLSTATE values are a stable
// PostgreSQL contract — pinned as a named constant so the route handler's catch
// branch reads as `error.code === PG_UNIQUE_VIOLATION` rather than a bare
// magic string. (Same value as the sweep module's pin — duplicated rather than
// shared because the two modules stay layer-independent per 00.6.)
const PG_UNIQUE_VIOLATION = '23505';

/**
 * The deterministic agent-inspector verdict rule: `FAIL` iff any finding is
 * `P0` or `P1`, else `PASS`. Pure — no IO, no randomness, fully reproducible
 * from the stored `findings`. This is the ONE determinism-bearing output of an
 * otherwise nondeterministic LLM triage (D-23102): the server recomputes it at
 * insert time and stores it, ignoring whatever `verdict` the client sent.
 */
export function deriveVerdict(findings: readonly InspectionFinding[]): 'PASS' | 'FAIL' {
  for (const finding of findings) {
    if (finding.severity === 'P0' || finding.severity === 'P1') {
      return 'FAIL';
    }
  }
  return 'PASS';
}

/**
 * Counts findings by severity. Used to recompute the denormalized
 * `p0_count` / `p1_count` / `p2_count` columns at insert time from the raw
 * `findings` array — never trusts any client-supplied count fields (D-23101).
 */
function countFindingsBySeverity(
  findings: readonly InspectionFinding[],
): { p0: number; p1: number; p2: number } {
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  for (const finding of findings) {
    if (finding.severity === 'P0') {
      p0 = p0 + 1;
    } else if (finding.severity === 'P1') {
      p1 = p1 + 1;
    } else {
      p2 = p2 + 1;
    }
  }
  return { p0, p1, p2 };
}

/**
 * INSERTs a single row into `legendary.inspection_reports`. The caller has
 * ALREADY validated `payload` shape at the route layer; this function performs
 * the persistence step AND the server-authoritative derivation: it recomputes
 * `verdict` via `deriveVerdict(findings)` and the three counts via
 * `countFindingsBySeverity(findings)`, storing THOSE (never the client's
 * `verdict` or any client count fields — D-23101).
 *
 * The INSERT enumerates the 8 non-default columns explicitly per the D-20701
 * INSERT discipline carried forward; `submitted_at` is OMITTED (column DEFAULT
 * `NOW()` populates server-side). Returns the recomputed derived fields.
 *
 * Throws `InspectionReportDuplicateError` on PRIMARY KEY collision so the route
 * layer surfaces 409 with the existing row UNCHANGED. Any other error
 * propagates to the route's `catch` block (mapped to 500).
 */
export async function insertInspectionReport(
  database: DatabaseClient,
  payload: InspectionReportPayload,
): Promise<StoredDerivedFields> {
  const verdict = deriveVerdict(payload.findings);
  const counts = countFindingsBySeverity(payload.findings);
  try {
    // why (D-23101): explicit column list defends against future migration
    // column-order drift; positional inserts are forbidden. `submitted_at` is
    // omitted so the column DEFAULT `NOW()` populates server-side — the
    // submission wall-clock anchor must be set by the database, never by client
    // input. `verdict` + counts are the server-recomputed values, NOT anything
    // the client sent.
    await database.query(
      `INSERT INTO legendary.inspection_reports (report_id, sweep_run_id, generated_at, verdict, p0_count, p1_count, p2_count, findings) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        payload.reportId,
        payload.sweepRunId,
        payload.generatedAt,
        verdict,
        counts.p0,
        counts.p1,
        counts.p2,
        JSON.stringify(payload.findings),
      ],
    );
  } catch (caughtError) {
    if (
      caughtError !== null &&
      typeof caughtError === 'object' &&
      'code' in caughtError &&
      (caughtError as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      throw new InspectionReportDuplicateError(payload.reportId);
    }
    throw caughtError;
  }
  return {
    verdict,
    p0Count: counts.p0,
    p1Count: counts.p1,
    p2Count: counts.p2,
  };
}

/**
 * Returns the single inspection report with the greatest `submitted_at`, or
 * `null` when the table is empty.
 *
 * The "latest" ordering dimension is greatest `submitted_at` (NOT
 * `generated_at`) so a re-triage filed later sorts ahead. This function exists
 * as a separate library entry point so the logic-layer test can exercise the
 * empty-table branch directly; the route handler derives `latest` from the
 * `fetchRecentInspectionReports` result (latest === recentReports[0] when
 * non-empty) so the two cannot drift.
 */
export async function fetchLatestInspectionReport(
  database: DatabaseClient,
): Promise<InspectionReportSummary | null> {
  // why (D-23101): "latest" is greatest submitted_at, NOT generated_at — a
  // re-triage filed later sorts ahead so the dashboard answers "what's the most
  // recent triage we know about?".
  const result = await database.query(
    `SELECT
       report_id,
       sweep_run_id,
       submitted_at,
       generated_at,
       verdict,
       p0_count,
       p1_count,
       p2_count,
       findings
     FROM legendary.inspection_reports
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRowToSummary(result.rows[0] as Record<string, unknown>);
}

/**
 * Returns up to 30 inspection report summaries ordered by `submitted_at DESC`.
 * Backed by the BTREE index `inspection_reports_submitted_at_desc_idx`. The
 * literal `ORDER BY submitted_at DESC LIMIT 30` is grep-pinned by EC-263; any
 * drift from this literal fails the grep gate. v1 has no pagination.
 */
export async function fetchRecentInspectionReports(
  database: DatabaseClient,
): Promise<readonly InspectionReportSummary[]> {
  // why (D-23101): "latest" is greatest submitted_at, NOT generated_at. The
  // literal `LIMIT 30` matches the WP-209 sweep `recentRuns` cap.
  const result = await database.query(
    `SELECT
       report_id,
       sweep_run_id,
       submitted_at,
       generated_at,
       verdict,
       p0_count,
       p1_count,
       p2_count,
       findings
     FROM legendary.inspection_reports
     ORDER BY submitted_at DESC LIMIT 30`,
    [],
  );
  const rows: InspectionReportSummary[] = [];
  for (const dbRow of result.rows) {
    rows.push(mapRowToSummary(dbRow as Record<string, unknown>));
  }
  return rows;
}

/**
 * Maps a single DB row (snake_case columns) to an `InspectionReportSummary`
 * (camelCase). The `findings` column is JSONB; the pg driver auto-parses JSONB
 * to a JS value, so no `JSON.parse` is needed. `submitted_at` / `generated_at`
 * are TIMESTAMPTZ; the pg driver returns them as `Date` instances — converted
 * to ISO-8601 strings here so the wire shape is timezone-anchored and stable.
 * The three count columns are read back into the nested `counts` object.
 */
function mapRowToSummary(dbRow: Record<string, unknown>): InspectionReportSummary {
  const submittedAtValue = dbRow.submitted_at;
  const generatedAtValue = dbRow.generated_at;
  const verdictValue = dbRow.verdict === 'FAIL' ? 'FAIL' : 'PASS';
  return {
    reportId: String(dbRow.report_id),
    sweepRunId: String(dbRow.sweep_run_id),
    submittedAt:
      submittedAtValue instanceof Date
        ? submittedAtValue.toISOString()
        : String(submittedAtValue),
    generatedAt:
      generatedAtValue instanceof Date
        ? generatedAtValue.toISOString()
        : String(generatedAtValue),
    verdict: verdictValue,
    counts: {
      p0: Number(dbRow.p0_count ?? 0),
      p1: Number(dbRow.p1_count ?? 0),
      p2: Number(dbRow.p2_count ?? 0),
    },
    findings: (dbRow.findings ?? []) as readonly InspectionFinding[],
  };
}
