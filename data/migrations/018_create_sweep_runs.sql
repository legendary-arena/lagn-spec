-- WP-209 / EC-241 — `legendary.sweep_runs` table (durable record for sweep
-- classification summaries produced by WP-194 setup-matrix runner + WP-195
-- manifest anomaly oracle).
--
-- Created 2026-06-04 per WP-209 §Locked contract values + EC-241 §Locked Values
-- + D-20701 (storage shape lock) + D-20704 (sweep nightly axis cardinality lock).
--
-- Schema is closed at 6 columns per D-20701. `run_id` is the PRIMARY KEY enforcing
-- idempotent submission: a duplicate POST surfaces as 409 Conflict at the route
-- layer and the existing row is BYTE-IDENTICAL pre/post (no UPSERT, no DO NOTHING
-- — the duplicate must be observable to the caller). The single BTREE index on
-- `submitted_at DESC` serves the GET `/api/sweep/latest` query path
-- (`ORDER BY submitted_at DESC LIMIT 30`).
--
-- `cell_count` carries a CHECK constraint `(cell_count >= 0 AND cell_count <= 10000)`
-- as defense-in-depth — the route validator rejects with 413 BEFORE the INSERT, but
-- a regression that bypasses the validator still trips the DB-side guard. The
-- `anomaly_counts` JSONB column carries no SQL-level CHECK on key membership (pure
-- SQL cannot enforce JSONB key sets); the route validator is the sole enforcement
-- layer for the closed `SWEEP_ANOMALY_CLASSES` taxonomy (WP-195 D-19502), pinned
-- by a drift-detection test that asserts validator behavior matches the engine
-- canonical array byte-identical.
--
-- `submitted_at` defaults to `NOW()` and is OMITTED from every INSERT column list
-- per D-20701 INSERT discipline (positional inserts forbidden; the `submitted_at`
-- server-clock semantics are non-negotiable). `started_at` is the CLIENT-supplied
-- sweep wall-clock start; the validator enforces ISO-8601 parseability.
--
-- `manifest_blob` is the raw `ManifestClassification` JSON (the analyzer's full
-- classification including `ParsedManifestRecord[]` per-cell parse results +
-- malformedLines passthrough) — operator-only forensic retention. Nullable in v1
-- so smaller submissions may omit the blob; nightly runs include it.
--
-- Migration is forward-only per EC-241 §Execution scope; no rollback SQL.
-- Idempotent: every CREATE statement uses `IF NOT EXISTS`. Re-running the migration
-- runner against an already-created table succeeds without error.

-- why: D-20701 — closed 6-column schema. `run_id` is the PRIMARY KEY (idempotent
-- submission per the locked `<shortSha>-<isoTimestampUtc>` format from
-- `scripts/sweep-submit.mjs`); legitimate same-commit re-runs produce distinct
-- runIds via the timestamp suffix and avoid 409s. `submitted_at` defaults to
-- `NOW()` and is server-populated; `started_at` is the client-supplied sweep
-- wall-clock. `cell_count` CHECK caps at 10000 (defense-in-depth against
-- malformed payloads; route validator rejects 413 earlier). `anomaly_counts`
-- JSONB holds `Record<SweepAnomalyClass, number>` per WP-195 D-19502 closed
-- 4-class taxonomy (keys enforced at the route validator with a drift test).
-- `manifest_blob` is nullable JSONB for operator forensic re-analyze; columns
-- ordered to match the WP §Locked contract values literal sequence
-- (`run_id, submitted_at, started_at, cell_count, anomaly_counts, manifest_blob`).
CREATE TABLE IF NOT EXISTS legendary.sweep_runs (
  run_id          TEXT PRIMARY KEY,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ NOT NULL,
  cell_count      INT NOT NULL CHECK (cell_count >= 0 AND cell_count <= 10000),
  anomaly_counts  JSONB NOT NULL,
  manifest_blob   JSONB NULL
);

-- why: D-20701 — single BTREE index on `submitted_at DESC` serves the locked
-- `recentRuns` query path (`ORDER BY submitted_at DESC LIMIT 30` literal in
-- `sweep.logic.ts`). The "latest" ordering dimension is greatest `submitted_at`
-- (NOT `started_at`) so back-fills and out-of-order submissions sort by
-- submission wall-clock — answers the operator question "what's the most recent
-- thing the dashboard knows about?".
CREATE INDEX IF NOT EXISTS sweep_runs_submitted_at_desc_idx
  ON legendary.sweep_runs (submitted_at DESC);
