-- WP-232 / EC-264 — `legendary.finding_handoffs` table (the handoff lifecycle
-- store that makes each Inspector finding an addressable, claimable work-item).
--
-- Created 2026-06-10 per WP-232 §Locked contract values + EC-264 §Locked Values
-- + D-23201 (storage shape + contract lock + denormalization-snapshot posture).
--
-- Schema is closed at 14 columns per D-23201, ordered to match the WP-232
-- §Locked contract values literal sequence. `handoff_id` is the PRIMARY KEY of
-- form `<reportId>#<findingIndex>` (the `#` separator never appears in a
-- `reportId`, which is `<sweepRunId>-<generatedAtIsoCompact>`), so a sync of the
-- same report is idempotent via `INSERT ... ON CONFLICT (handoff_id) DO NOTHING`
-- (status-preserving — a `claimed` row stays `claimed`; D-23203). This is a
-- deliberate contrast with the inspection POST's no-UPSERT-409 posture: re-sync
-- is an expected nightly operation, not a duplicate-submission error.
--
-- The `severity` / `route` / `anomaly_class` / `cell_id` / `description` columns
-- are a point-in-time SNAPSHOT of the finding for cheap addressable reads; the
-- `inspection_reports` row stays authoritative for finding content, and the
-- handoff row is authoritative ONLY for lifecycle `status` + the `branch_ref` /
-- `amendment_request` references (D-23201). `anomaly_class` is stored as whatever
-- opaque string the inspection finding carries (no engine `SweepAnomalyClass`
-- coupling — D-23103 carry-forward); the CHECK constraints on `severity` /
-- `route` mirror the inspection schema and are defense-in-depth behind the
-- server validator.
--
-- `status` defaults to `'open'` and is server-authoritative: it changes only via
-- a transition the locked table permits (`open→claimed`;
-- `claimed→fix-proposed|escalated|wont-fix`; `fix-proposed→resolved|claimed`;
-- `escalated→claimed|resolved|wont-fix`; `resolved`/`wont-fix` terminal — D-23202).
-- The CHECK constraint is defense-in-depth behind that server enforcement.
--
-- `created_at` / `updated_at` default to `NOW()` and are OMITTED from every
-- INSERT column list per the D-20701 INSERT discipline carried forward
-- (positional inserts forbidden; lifecycle timestamps are set by the database,
-- never by client input). `updated_at = NOW()` is set explicitly on every
-- transition UPDATE.
--
-- `branch_ref` / `amendment_request` follow a write-on-enter rule: `branch_ref`
-- is written only on the `→ fix-proposed` transition and `amendment_request`
-- only on `→ escalated`; both are PRESERVED (never nulled) on every other
-- transition for auditability (D-23201). They are references the server STORES,
-- never actions it performs — the autonomous Builder/Architect execution is a
-- deferred, separately-gated surface (D-23202 plumbing-only lock).
--
-- Migration is forward-only per EC-264 §Files to Produce; no rollback SQL.
-- Idempotent: every CREATE statement uses `IF NOT EXISTS`. Re-running the
-- migration runner against an already-created table succeeds without error.

-- why: D-23201 — closed 14-column schema, columns ordered to match the WP-232
-- §Locked contract values literal sequence (`handoff_id, report_id,
-- sweep_run_id, finding_index, severity, route, anomaly_class, cell_id,
-- description, status, branch_ref, amendment_request, created_at, updated_at`).
-- `handoff_id` is the PRIMARY KEY (idempotent sync via the
-- `<reportId>#<findingIndex>` form). `cell_id` is nullable (a run-level finding
-- has no sweep cell). `branch_ref` / `amendment_request` are nullable
-- references written on enter and preserved thereafter. The `severity` / `route`
-- / `status` CHECK constraints are defense-in-depth behind the server validator.
CREATE TABLE IF NOT EXISTS legendary.finding_handoffs (
  handoff_id        TEXT PRIMARY KEY,
  report_id         TEXT NOT NULL,
  sweep_run_id      TEXT NOT NULL,
  finding_index     INT NOT NULL CHECK (finding_index >= 0),
  severity          TEXT NOT NULL CHECK (severity IN ('P0', 'P1', 'P2')),
  route             TEXT NOT NULL CHECK (route IN ('Builder', 'Architect')),
  anomaly_class     TEXT NOT NULL,
  cell_id           TEXT,
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'claimed', 'fix-proposed', 'escalated', 'resolved', 'wont-fix')),
  branch_ref        TEXT,
  amendment_request TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- why: D-23201 — BTREE index on `created_at DESC` serves the locked
-- "latest report" resolution path in `fetchLatestHandoffs`
-- (`ORDER BY created_at DESC, report_id DESC LIMIT 1` — greatest `created_at`,
-- tie-broken by lexicographically greatest `report_id`).
CREATE INDEX IF NOT EXISTS finding_handoffs_created_at_desc_idx
  ON legendary.finding_handoffs (created_at DESC);

-- why: D-23201 — BTREE index on `report_id` serves the per-report row fetch in
-- `fetchLatestHandoffs` (`WHERE report_id = $1 ORDER BY finding_index ASC,
-- handoff_id ASC LIMIT 500`) once the latest report has been resolved.
CREATE INDEX IF NOT EXISTS finding_handoffs_report_id_idx
  ON legendary.finding_handoffs (report_id);
