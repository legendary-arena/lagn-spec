-- WP-103 — Replay Storage (legendary.replay_blobs)
-- Created 2026-04-25 per WP-103 v1.0 / EC-111 / D-10301 / D-10302 / D-10303.
--
-- This table stores ReplayInput blobs keyed by their cryptographic
-- replay_hash from WP-027's computeStateHash. The hash IS the natural
-- key; no separate internal bigint identifier exists.
--
-- Idempotent: CREATE TABLE uses IF NOT EXISTS. Re-running the
-- migration runner against an already-seeded database succeeds
-- without error.

-- why: legendary.* namespace per docs/ai/REFERENCE/00.2-data-requirements.md §1.
-- Server-layer persistence sits under the same PostgreSQL schema as
-- the WP-052 player and ownership tables (legendary.players,
-- legendary.replay_ownership) so future cross-table queries (WP-053
-- submission, WP-054 leaderboards) stay in one search_path.

CREATE TABLE IF NOT EXISTS legendary.replay_blobs (
    -- why: replay_hash is the cryptographic hash from WP-027's
    -- computeStateHash. PK choice diverges from WP-052's
    -- bigserial player_id + ext_id text UNIQUE pattern (D-5202)
    -- because replays are content-addressed by hash with no use
    -- case for a separate internal bigint identifier; using
    -- replay_hash directly as the PK avoids the ext_id ↔ player_id
    -- mapping complexity that WP-052 needed for cross-service
    -- identity. Locked by D-10302.
    replay_hash   text         PRIMARY KEY,

    -- why: replay_input is jsonb (not bytea, text, or json).
    -- ReplayInput is JSON-serializable by contract (Class 2
    -- Configuration per .claude/skills/legendary-persistence/SKILL.md); jsonb
    -- preserves shape queryability for future audit / analytics
    -- use cases without manual parsing overhead. bytea would lose
    -- shape; text would require a manual deserialization call on
    -- every read; json (without the binary 'b') would not preserve
    -- query-time indexability. Locked by D-10303.
    replay_input  jsonb        NOT NULL,

    -- why: created_at is server-clock metadata local to the row,
    -- not a determinism-bearing field consumed by the engine. The
    -- engine's deterministic replay execution (WP-027) does not
    -- read this column; it exists for operator-facing observability
    -- (which row landed when) and future retention bookkeeping.
    created_at    timestamptz  NOT NULL DEFAULT now()
);

-- why: this table is content-addressed and therefore immutable. No
-- row-modification timestamp column exists by design — mutating a
-- stored blob would change its canonical replay_hash identifier, and
-- no migration path exists that would rewrite a stored blob.
-- WP-103's storeReplay uses ON CONFLICT (replay_hash) DO NOTHING
-- semantics; the alternative update-on-conflict pattern is
-- explicitly forbidden for this table.

-- why: no foreign key from legendary.replay_ownership.replay_hash
-- to legendary.replay_blobs.replay_hash. WP-052's replay_ownership
-- is a locked contract; introducing an FK retroactively would
-- modify it. Application logic in WP-053 ensures storeReplay
-- precedes assignReplayOwnership on the submission path.
