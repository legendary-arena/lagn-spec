-- WP-231 / EC-263 — `legendary.inspection_reports` table (durable record for
-- the nightly Inspector triage: a headless Claude agent applies the
-- agent-inspector P0/P1/P2 rubric to each nightly sweep run and files a
-- structured InspectionReport).
--
-- Created 2026-06-09 per WP-231 §Locked contract values + EC-263 §Locked Values
-- + D-23101 (storage shape + report contract lock).
--
-- Schema is closed at 9 columns per D-23101. `report_id` is the PRIMARY KEY of
-- form `<sweepRunId>-<generatedAtIsoCompact>`: the `sweepRunId` already embeds
-- the sweep's own timestamp (WP-209), so a re-triage of the same sweep run gets
-- a fresh `generated_at` -> a distinct `report_id` -> a distinct row (no 409).
-- A duplicate POST of the EXACT same `report_id` surfaces as 409 Conflict at
-- the route layer and the existing row stays byte-identical (no UPSERT). The
-- single BTREE index on `submitted_at DESC` serves the GET `/api/inspection/latest`
-- query path (`ORDER BY submitted_at DESC LIMIT 30`).
--
-- `verdict` and the three count columns are DERIVED FROM `findings` at insert
-- time and recomputed server-side — the server is the sole authority for all
-- derived fields (D-23101). Any client-supplied derived values are ignored, not
-- stored. The count columns are denormalized for cheap dashboard reads; a logic
-- test asserts they equal the per-severity counts of `findings`. The CHECK
-- constraints (`verdict IN ('PASS','FAIL')`, counts `>= 0`) are defense-in-depth
-- backstops behind the server recompute.
--
-- `submitted_at` defaults to `NOW()` and is OMITTED from every INSERT column
-- list per the D-20701 INSERT discipline carried forward (positional inserts
-- forbidden; the submission wall-clock anchor is set by the database, never by
-- client input). `generated_at` is the agent-supplied triage wall-clock.
--
-- `findings` is the raw `InspectionFinding[]` JSON the agent produced. The
-- finding TEXT is LLM-generated and intentionally nondeterministic (D-23102) —
-- only the derived `verdict`/counts are deterministic. `anomalyClass` inside a
-- finding is stored as whatever opaque string the agent emits (the server does
-- not import the engine `SweepAnomalyClass` union — D-23103).
--
-- Migration is forward-only per EC-263 §Files to Produce; no rollback SQL.
-- Idempotent: every CREATE statement uses `IF NOT EXISTS`. Re-running the
-- migration runner against an already-created table succeeds without error.

-- why: D-23101 — closed 9-column schema, columns ordered to match the WP-231
-- §Locked contract values literal sequence (`report_id, sweep_run_id,
-- submitted_at, generated_at, verdict, p0_count, p1_count, p2_count, findings`).
-- `report_id` is the PRIMARY KEY (idempotent submission via the
-- `<sweepRunId>-<generatedAtIsoCompact>` form). `submitted_at` defaults to
-- `NOW()` and is server-populated; `generated_at` is the agent-supplied triage
-- wall-clock. `verdict` + the three count columns are recomputed server-side
-- from `findings` (the CHECK constraints are defense-in-depth behind the
-- recompute). `findings` JSONB holds the raw `InspectionFinding[]` the agent
-- produced (finding text is LLM-nondeterministic per D-23102; anomalyClass kept
-- as an opaque string per D-23103).
CREATE TABLE IF NOT EXISTS legendary.inspection_reports (
  report_id     TEXT PRIMARY KEY,
  sweep_run_id  TEXT NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_at  TIMESTAMPTZ NOT NULL,
  verdict       TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL')),
  p0_count      INT NOT NULL CHECK (p0_count >= 0),
  p1_count      INT NOT NULL CHECK (p1_count >= 0),
  p2_count      INT NOT NULL CHECK (p2_count >= 0),
  findings      JSONB NOT NULL
);

-- why: D-23101 — single BTREE index on `submitted_at DESC` serves the locked
-- `recentReports` query path (`ORDER BY submitted_at DESC LIMIT 30` literal in
-- `inspection.logic.ts`). The "latest" ordering dimension is greatest
-- `submitted_at` (NOT `generated_at`) so a re-triage filed later sorts ahead —
-- answers the operator question "what's the most recent triage the dashboard
-- knows about?".
CREATE INDEX IF NOT EXISTS inspection_reports_submitted_at_desc_idx
  ON legendary.inspection_reports (submitted_at DESC);
