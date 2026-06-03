-- WP-205 / EC-233 — `legendary.analytics_events` table (acquisition / activation /
-- retention funnel capture).
--
-- Created 2026-06-03 per WP-205 §Locked contract values + EC-233 §Locked Values.
--
-- Schema is closed at 7 columns per D-20501. The `event_type` 9-value CHECK
-- constraint mirrors the TypeScript `AcquisitionEventType` union and the
-- canonical readonly array `ACQUISITION_EVENT_TYPES` byte-identical
-- (3-layer enforcement: union + canonical array + SQL CHECK; the route
-- validator is the 4th gate at request time). Adding a 10th value requires
-- updating all 4 sites in the same WP — the drift test in
-- `apps/server/src/analytics/analytics.types.test.ts` parses this file's
-- CHECK constraint text and asserts byte-equality.
--
-- The `user_id_hash` CHAR(64) format CHECK is defense-in-depth per D-20502:
-- if a future refactor accidentally bypasses the route's `hashUserId()` call
-- and binds raw `user_id` into the INSERT statement, the DB rejects it. The
-- column is NULL-allowed because anonymous visitor events (channel
-- attribution before signup) have no user id; the partial BTREE index
-- excludes the anonymous-event subset to keep the index sized for
-- authenticated-event queries only (cohort retention SQL).
--
-- Migration is forward-only per EC-233 §Execution scope; no rollback SQL.
--
-- Idempotent: every CREATE statement uses `IF NOT EXISTS`. Re-running the
-- migration runner against an already-created table succeeds without error.

-- why: D-20501 — `analytics_events` schema is closed at 7 columns. `id` is
-- UUID v4 via gen_random_uuid() for non-sequential public-ID enumeration
-- defense. `event_type` carries the 9-value closed union (3-layer
-- enforcement below). `user_id_hash` is the 64-char SHA-256 hex digest
-- (D-20502); NULL for anonymous events. `session_id` is the
-- client-supplied opaque session identifier (length-bound at the route
-- validator: 1-128 chars). `ts` is the CLIENT-supplied event time
-- (validator bounds it to [0, currentServerTime + 5min]); the server
-- clock is used ONLY as the upper-bound anchor at validator entry, not
-- as the INSERTed value. `properties` is JSONB carrying arbitrary
-- per-event-type metadata (depth/leaf-type bounds enforced at the route
-- validator per D-20501). `created_at` is the server-side ingest time
-- via NOW() default; the gap between `ts` and `created_at` surfaces
-- clock drift / delayed capture in future ops queries.
CREATE TABLE IF NOT EXISTS legendary.analytics_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  user_id_hash    CHAR(64) NULL,
  session_id      TEXT NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- why: D-20501 — closed-set `event_type` CHECK enforced at the DB
  -- layer as one of three independent enforcement gates (TypeScript
  -- union + canonical readonly array + route validator + this CHECK).
  -- An INSERT with `event_type = 'unknown'` fails with a CHECK
  -- violation error; a regression in the route validator (e.g., a
  -- future refactor that drops the closed-set check) is caught at the
  -- DB. The 9 values + order are load-bearing and mirror the
  -- `ACQUISITION_EVENT_TYPES` canonical array byte-identical. Drift
  -- test in `apps/server/src/analytics/analytics.types.test.ts` parses
  -- this CHECK text and asserts equality.
  CONSTRAINT analytics_events_event_type_check CHECK (
    event_type IN (
      'direct', 'search', 'referral', 'paid',
      'signup-start', 'signup-complete',
      'first-match-started', 'first-match-completed',
      'retention-return'
    )
  ),
  -- why: D-20502 — `user_id_hash` format CHECK enforces 64-char
  -- lowercase hex (or NULL for anonymous). Defense in depth: if a
  -- future refactor accidentally binds raw `user_id` into the INSERT
  -- statement, this CHECK rejects it loudly. SHA-256 hex digest is
  -- always 64 lowercase hex characters; anything else is a regression.
  CONSTRAINT analytics_events_user_id_hash_format CHECK (
    user_id_hash IS NULL OR user_id_hash ~ '^[0-9a-f]{64}$'
  )
);

-- why: D-20501 — index serves the per-channel + per-step + per-day
-- aggregation queries (`getTrafficSources`, `getActivationFunnel`).
-- These queries filter by `event_type IN (...)` and bucket by
-- `(ts AT TIME ZONE 'UTC')::date`, so the leading `event_type` column
-- is the natural filter key and `ts` resolves the date bucket. The
-- future ops-rollup WP (deferred per WP-205 §Out of Scope) will
-- pre-aggregate against this access pattern.
CREATE INDEX IF NOT EXISTS analytics_events_event_type_ts_idx
  ON legendary.analytics_events (event_type, ts);

-- why: D-20501 — partial index serves cohort retention queries
-- (`getRetentionCohorts`). These queries join on `user_id_hash` and
-- bucket by per-cohort `ts` ranges; the leading `user_id_hash` column
-- is the natural join key. The `WHERE user_id_hash IS NOT NULL`
-- predicate excludes the anonymous-event subset, keeping the index
-- sized for the authenticated-event subset only (cohort retention SQL
-- never touches NULL user_id_hash rows; anonymous events count toward
-- `visitorCount` via `COUNT(DISTINCT session_id)` from the other
-- index above).
CREATE INDEX IF NOT EXISTS analytics_events_user_id_hash_ts_idx
  ON legendary.analytics_events (user_id_hash, ts)
  WHERE user_id_hash IS NOT NULL;
