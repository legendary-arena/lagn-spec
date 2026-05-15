-- WP-105 / EC-160 — Player Badges Table
-- Created 2026-05-15 per D-1004 (Badge Issuer Model Is Tiered;
-- Gameplay Badges Ship First) and D-5302 (immutability precedent).
--
-- why: legendary.player_badges is append-only per D-1004 / D-5302.
-- Badge rows are write-once; no UPDATE or DELETE path exists in the
-- application layer. Revocation is recorded via the is_revoked boolean
-- flag (future revocation mechanism); the original row's other columns
-- never change.
--
-- Idempotent: CREATE TABLE and CREATE INDEX use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS legendary.player_badges (
    badge_id                    bigserial    PRIMARY KEY,

    player_id                   bigint       NOT NULL REFERENCES legendary.players(player_id),

    badge_key                   text         NOT NULL,

    tier                        int          NOT NULL CHECK (tier IN (1, 2, 3)),

    source_kind                 text         NOT NULL CHECK (source_kind IN ('competitive_score', 'competitive_history')),

    -- why: source_ref is the originating competitive_scores.submission_id
    -- for per-run badges (source_kind = 'competitive_score'). NULL for
    -- history-evaluated and veteran badges (source_kind = 'competitive_history')
    -- where no single submission is the sole source.
    source_ref                  bigint       NULL,

    awarded_at                  timestamptz  NOT NULL DEFAULT now(),

    awarded_under_config_version int         NOT NULL,

    is_revoked                  boolean      NOT NULL DEFAULT false,

    -- why: composite UNIQUE prevents duplicate per-run issuance for the
    -- same (player, badge, submission) triple. For per-run badges where
    -- source_ref IS NOT NULL, this constraint is the primary idempotency
    -- guard. For veteran badges where source_ref IS NULL, the partial
    -- unique index below is the guard instead (PostgreSQL treats NULL as
    -- distinct in standard UNIQUE constraints).
    UNIQUE (player_id, badge_key, source_ref)
);

-- why: partial unique index enforces one-per-player veteran badge
-- uniqueness. Standard UNIQUE constraints treat NULL as distinct, so
-- the composite UNIQUE above cannot prevent duplicate veteran rows
-- (where source_ref IS NULL). This partial index fills that gap.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_badges_veteran_unique
    ON legendary.player_badges (player_id, badge_key)
    WHERE source_ref IS NULL;

-- why: read performance index for profile badge loading — ordered by
-- awarded_at DESC so the most recent badges appear first without a
-- filesort on the common read path.
CREATE INDEX IF NOT EXISTS idx_player_badges_player_awarded_at
    ON legendary.player_badges (player_id, awarded_at DESC);
