-- WP-159 — Add is_admin column to legendary.players
-- Created 2026-05-17 per WP-159 / EC-173 / D-15901 / D-15902.
--
-- Purely additive. All existing rows default to is_admin = FALSE. The first
-- admin is set via direct SQL by the operator
-- (UPDATE legendary.players SET is_admin = TRUE WHERE ext_id = '<uuid>';);
-- subsequent grants come from a future admin-CLI WP.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-running succeeds without error.
-- Mirrors the WP-101 / migration 008 additive-ALTER precedent.

ALTER TABLE legendary.players
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- why: COMMENT ON COLUMN documents the WP authority and the
-- operator-granted semantics inline with the column. Schema introspection
-- tools (psql \d+, pgAdmin, automated catalog dumps) surface the comment,
-- keeping the authorization story attached to the data, not buried in
-- migration history.
COMMENT ON COLUMN legendary.players.is_admin IS
    'WP-159: admin authorization flag. Default FALSE. Operator-granted via direct SQL. Read exclusively through apps/server/src/auth/adminSession.ts::requireAdminSession.';
