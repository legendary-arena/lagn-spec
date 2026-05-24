-- WP-107 — Profile Integrity / Anti-Cheat Surface
-- Created 2026-05-24 per WP-107 / EC-195 / D-10701 / D-10702 / D-10703.
--
-- Two purely additive changes:
--   1. ALTER legendary.players ADD COLUMN is_suspended BOOLEAN.
--   2. CREATE TABLE legendary.admin_actions (append-only audit log).
--
-- Idempotent: every statement uses IF NOT EXISTS so the migration runner
-- can replay over a partially-applied state without error. Mirrors the
-- WP-101 / migration 008 and WP-159 / migration 014 additive-ALTER
-- precedent.
--
-- Append-only contract: no mutate-after-insert statements target
-- legendary.admin_actions anywhere in the codebase (grep-verified per
-- WP-107 §Verification Steps). DB-level enforcement of the closed
-- action_type union, the reason length cap, and referential integrity
-- to legendary.players(ext_id) is defense-in-depth — application-layer
-- validation runs first; the constraints below catch any bypass.

-- why: is_suspended is the binary suspension flag the future score-
-- submission request-handler WP will gate on via requireUnsuspendedAccount.
-- BOOLEAN NOT NULL DEFAULT FALSE mirrors migration 014's is_admin shape;
-- ADD COLUMN IF NOT EXISTS keeps the migration idempotent over re-apply.
ALTER TABLE legendary.players
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;

-- why: schema introspection tools surface COMMENT ON COLUMN, keeping the
-- WP authority and the suspension semantics attached to the data rather
-- than buried in migration history. Mirrors migration 014's documentation
-- pattern for is_admin.
COMMENT ON COLUMN legendary.players.is_suspended IS
    'WP-107: account suspension flag. Default FALSE. Toggled by /api/admin/players/:handle/{suspend,unsuspend} (admin-session-required). Gates score submission and any future write surface via apps/server/src/auth/requireUnsuspendedAccount.ts. Suspension is forward-only; historical leaderboard scores remain (per WP-107 §Open Questions Q3 LOCK = STAY).';

-- why: admin_actions is the append-only audit log capturing every
-- suspend / unsuspend mutation. action_id is bigserial so the table can
-- carry arbitrarily many rows without integer-PK exhaustion concerns;
-- both acting_account_id and target_account_id are FK to
-- legendary.players(ext_id) (NOT player_id) per D-5201 — AccountId is
-- the application-layer identifier and matches the column ext_id is
-- declared UNIQUE in migration 004 (UNIQUE columns are valid FK targets
-- in PostgreSQL). ON DELETE RESTRICT prevents accidental deletion of any
-- legendary.players row that appears in the audit log; the audit log is
-- the authoritative record of admin actions and must outlive any single
-- account row. CHECK (action_type IN ('suspend', 'unsuspend')) is the
-- DB-level enforcement of the closed AdminPlayerActionType union;
-- CHECK (length(reason) BETWEEN 1 AND 500) is the DB-level enforcement
-- of the reason cap (application layer also trims + validates before
-- INSERT — this is defense-in-depth).
CREATE TABLE IF NOT EXISTS legendary.admin_actions (
    action_id            bigserial    PRIMARY KEY,
    acting_account_id    text         NOT NULL REFERENCES legendary.players(ext_id) ON DELETE RESTRICT,
    target_account_id    text         NOT NULL REFERENCES legendary.players(ext_id) ON DELETE RESTRICT,
    action_type          text         NOT NULL CHECK (action_type IN ('suspend', 'unsuspend')),
    reason               text         NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    created_at           timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE legendary.admin_actions IS
    'WP-107: append-only admin action audit log. One row per successful suspend/unsuspend. Written transactionally with the legendary.players column update inside adminProfile.logic.ts (BEGIN -> UPDATE players -> INSERT admin_actions -> COMMIT). Zero UPDATE/DELETE writers anywhere in the codebase (grep-verified). Retention is indefinite per WP-107 §Open Questions Q5 LOCK.';

-- why: query pattern from getAdminActionsForPlayer is
-- "WHERE target_account_id = $1 ORDER BY created_at DESC, action_id DESC
-- LIMIT 100". The composite index supports both the equality predicate
-- and the secondary sort with a single index scan; action_id DESC is the
-- locked deterministic tiebreaker for same-millisecond created_at
-- collisions (the bigserial PRIMARY KEY ensures monotonic action_id
-- ordering within a single connection's insertion sequence). IF NOT
-- EXISTS keeps the index creation idempotent.
CREATE INDEX IF NOT EXISTS admin_actions_target_idx
    ON legendary.admin_actions (target_account_id, created_at DESC, action_id DESC);
