-- WP-174 — UNIQUE constraint on (auth_provider, auth_provider_id)
-- Created 2026-05-24 per WP-174 §D / EC-196.
--
-- Eliminates the TOCTOU race between SELECT and INSERT during
-- first-sign-in auto-provisioning. Combined with ON CONFLICT in the
-- INSERT (WP-174 §E), concurrent first calls resolve deterministically.
--
-- Idempotent: CREATE UNIQUE INDEX uses IF NOT EXISTS. Re-running the
-- migration runner against an already-indexed database succeeds
-- without error.
--
-- Rollback note: safe to leave index in place on rollback; it enforces
-- a correctness invariant that is independently valid regardless of
-- whether the provisioning code is deployed.

CREATE UNIQUE INDEX IF NOT EXISTS players_auth_provider_sub_unique
  ON legendary.players (auth_provider, auth_provider_id);
