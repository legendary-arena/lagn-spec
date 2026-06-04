/**
 * Sweep Logic — Server Layer (WP-209 / EC-241)
 *
 * Pure SQL + result mapping for the `legendary.sweep_runs` surface. Three
 * exported library functions:
 *
 *   1. `insertSweepRun(database, payload)` — single-row INSERT. Throws
 *      `SweepRunDuplicateError` on PRIMARY KEY collision so the route layer
 *      maps it to 409. No UPSERT semantics; no silent-swallow-of-duplicate
 *      branch (the duplicate must be observable to the caller as 409) —
 *      D-20701 storage shape lock.
 *   2. `fetchLatestSweepRun(database)` — returns the single row with the
 *      greatest `submitted_at`, or `null` when the table is empty. The "latest"
 *      ordering dimension is greatest `submitted_at` (NOT `started_at`) so
 *      back-fills and out-of-order submissions sort by submission wall-clock.
 *   3. `fetchRecentSweepRuns(database)` — returns the last 30 rows ordered
 *      `submitted_at DESC` (literal). Backed by the BTREE index
 *      `sweep_runs_submitted_at_desc_idx`. The `latest` row equals
 *      `recentRuns[0]` when the table is non-empty — invariant enforced by
 *      the route handler building both from the same SQL result.
 *
 * Layer-boundary contract: this module imports only `./sweep.types.js` and
 * `pg` (for the `Pool` + `DatabaseError` types). No `boardgame.io`, no
 * `@legendary-arena/(registry|preplan)`, no `apps/dashboard/**`. All `INSERT`
 * statements enumerate target columns explicitly (positional-bind form
 * forbidden per D-20701); `submitted_at` is omitted from every INSERT column
 * list (column DEFAULT `NOW()` populates server-side). The `recentRuns` SQL is
 * the literal `ORDER BY submitted_at DESC LIMIT 30`.
 *
 * Authority: WP-209 §Non-Negotiable Constraints + §Locked contract values;
 * EC-241 §Locked Values + §Guardrails + §Required `// why:` Comments; D-20701
 * (storage shape lock); D-19502 (sweep anomaly 4-class closed taxonomy).
 */

import type { Pool } from 'pg';

import type {
  SweepAnomalyClass,
  SweepRunPayload,
  SweepRunSummary,
} from './sweep.types.js';

/**
 * Database client surface this module uses. Mirrors the WP-052
 * `DatabaseClient = Pool` re-export precedent so the sweep module does not
 * import `pg` directly for value-mode usage. Production wiring passes the
 * long-lived `pg.Pool` constructed at server startup; tests pass a recording
 * fake that satisfies the same `query()` shape.
 */
export type DatabaseClient = Pool;

/**
 * Thrown by `insertSweepRun` when the PRIMARY KEY constraint
 * `sweep_runs_pkey` fires. The route layer catches this error and surfaces
 * it to the caller as 409 with the locked envelope
 * `{ data: [], error: 'conflict' }`; the existing row remains byte-identical
 * pre/post the duplicate submission (no UPSERT semantics).
 */
export class SweepRunDuplicateError extends Error {
  public readonly runId: string;

  public constructor(runId: string) {
    super(
      `Sweep run with runId "${runId}" already exists in legendary.sweep_runs. ` +
        `Duplicate submissions return 409 Conflict and never overwrite the existing row per D-20701.`,
    );
    this.name = 'SweepRunDuplicateError';
    this.runId = runId;
  }
}

// why: postgres unique-violation SQLSTATE code; the canonical signal for
// "duplicate value violates unique constraint". The pg driver surfaces this on
// the thrown error's `code` property. Numeric SQLSTATE values are a stable
// PostgreSQL contract — pinned here as a named constant so the route handler's
// catch branch reads as `error.code === PG_UNIQUE_VIOLATION` rather than a
// bare magic string.
const PG_UNIQUE_VIOLATION = '23505';

/**
 * INSERTs a single row into `legendary.sweep_runs`. The caller has ALREADY
 * validated `payload` at the route layer per the WP-209 §Locked Type Contracts
 * validator failure-mode table — this function performs only the persistence
 * step. The INSERT statement enumerates target columns explicitly per the
 * D-20701 INSERT discipline; `submitted_at` is OMITTED from the column list
 * (column DEFAULT `NOW()` populates server-side, ensuring the submission
 * wall-clock anchor is set by the database — never by client input).
 *
 * Throws `SweepRunDuplicateError` on PRIMARY KEY collision so the route layer
 * surfaces 409 with the existing row UNCHANGED. Any other error propagates
 * up to the route's `catch` block where it maps to 500 with
 * `{ data: [], error: 'internal_error' }`.
 */
export async function insertSweepRun(
  database: DatabaseClient,
  payload: SweepRunPayload,
): Promise<void> {
  const manifestBlobJson =
    payload.manifestBlob === undefined ? null : JSON.stringify(payload.manifestBlob);
  try {
    // why (D-20701): explicit column list defends against future migration
    // column-order drift; positional inserts are forbidden by the WP
    // constraint. `submitted_at` is omitted so the column DEFAULT `NOW()`
    // populates server-side — the submission wall-clock anchor must be set by
    // the database, never by client input.
    await database.query(
      `INSERT INTO legendary.sweep_runs (run_id, started_at, cell_count, anomaly_counts, manifest_blob) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        payload.runId,
        payload.startedAt,
        payload.cellCount,
        JSON.stringify(payload.anomalyCounts),
        manifestBlobJson,
      ],
    );
  } catch (caughtError) {
    if (
      caughtError !== null &&
      typeof caughtError === 'object' &&
      'code' in caughtError &&
      (caughtError as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      throw new SweepRunDuplicateError(payload.runId);
    }
    throw caughtError;
  }
}

/**
 * Returns the single sweep run with the greatest `submitted_at` timestamp,
 * or `null` when the table is empty.
 *
 * The "latest" ordering dimension is greatest `submitted_at` (NOT `started_at`)
 * so back-fills and out-of-order submissions sort by submission wall-clock —
 * answers the operator question "what's the most recent thing the dashboard
 * knows about?". The route handler reuses the same `fetchRecentSweepRuns`
 * result to derive `latest` (latest === recentRuns[0] when non-empty); this
 * function exists as a separate library entry point so the logic-layer test
 * surface can exercise the empty-table branch directly without seeding
 * fixtures.
 */
export async function fetchLatestSweepRun(
  database: DatabaseClient,
): Promise<SweepRunSummary | null> {
  // why (D-20701): "latest" is defined as greatest submitted_at, NOT
  // started_at — back-fills and out-of-order submissions sort by submission
  // wall-clock so the dashboard answers "what's the most recent thing we know
  // about?".
  const result = await database.query(
    `SELECT
       run_id,
       submitted_at,
       started_at,
       cell_count,
       anomaly_counts
     FROM legendary.sweep_runs
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
 * Returns up to 30 sweep run summaries ordered by `submitted_at DESC`. Backed
 * by the BTREE index `sweep_runs_submitted_at_desc_idx`. The literal
 * `ORDER BY submitted_at DESC LIMIT 30` is grep-pinned by EC-241 §After
 * Completing; any drift from this literal fails the grep gate.
 *
 * When the table holds more than 30 rows the result is the 30 most-recent by
 * submission wall-clock; older rows are excluded. v1 has no pagination —
 * richer paging is a future hardening WP per WP-209 §Out of Scope.
 */
export async function fetchRecentSweepRuns(
  database: DatabaseClient,
): Promise<readonly SweepRunSummary[]> {
  // why (D-20701): "latest" is defined as greatest submitted_at, NOT
  // started_at — back-fills and out-of-order submissions sort by submission
  // wall-clock so the dashboard answers "what's the most recent thing we know
  // about?". The literal `LIMIT 30` matches the WP-204 sparkline convention
  // and is grep-pinned by EC-241 §After Completing.
  const result = await database.query(
    `SELECT
       run_id,
       submitted_at,
       started_at,
       cell_count,
       anomaly_counts
     FROM legendary.sweep_runs
     ORDER BY submitted_at DESC LIMIT 30`,
    [],
  );
  const rows: SweepRunSummary[] = [];
  for (const dbRow of result.rows) {
    rows.push(mapRowToSummary(dbRow as Record<string, unknown>));
  }
  return rows;
}

/**
 * Maps a single DB row (snake_case columns) to a `SweepRunSummary`
 * (camelCase). The `anomaly_counts` column is JSONB; the pg driver
 * auto-parses JSONB to a JS object, so no `JSON.parse` is needed. The
 * `submitted_at` and `started_at` columns are TIMESTAMPTZ; the pg driver
 * returns them as `Date` instances — converted to ISO-8601 strings here so
 * the wire shape is timezone-anchored and stable.
 *
 * The `anomalyCounts` value is cast to the locked
 * `Record<SweepAnomalyClass, number>` shape; the route validator enforces
 * key membership at write time so reads can trust the shape. A row whose
 * persisted `anomaly_counts` has unexpected keys would surface here without
 * coercion (the cast is structural); a future hardening WP may add a
 * read-side defensive filter.
 */
function mapRowToSummary(dbRow: Record<string, unknown>): SweepRunSummary {
  const submittedAtValue = dbRow.submitted_at;
  const startedAtValue = dbRow.started_at;
  return {
    runId: String(dbRow.run_id),
    submittedAt:
      submittedAtValue instanceof Date
        ? submittedAtValue.toISOString()
        : String(submittedAtValue),
    startedAt:
      startedAtValue instanceof Date
        ? startedAtValue.toISOString()
        : String(startedAtValue),
    cellCount: Number(dbRow.cell_count ?? 0),
    anomalyCounts: dbRow.anomaly_counts as Readonly<
      Record<SweepAnomalyClass, number>
    >,
  };
}
