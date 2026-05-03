-- WP-104 / EC-128 — Owner profile data model: legendary.player_profiles + legendary.player_links
-- Created 2026-05-02 per WP-104 / EC-128.
--
-- This migration introduces the owner-edit half of the profile surface.
-- Two new tables in the legendary.* namespace:
--
--   * legendary.player_profiles — 1:1 with legendary.players, keyed on
--     player_id. Carries optional owner-editable fields (avatar_url,
--     about_me) plus three per-section privacy toggles
--     (avatar_visibility / about_me_visibility / links_visibility) and
--     an updated_at audit timestamp. ON DELETE CASCADE so WP-052's
--     deletePlayerData removes the child row automatically.
--
--   * legendary.player_links — many-to-1 with legendary.players, keyed
--     on link_id. Carries (provider, url, is_public, display_order)
--     for owner-curated profile links. Provider is constrained to a
--     small closed-set allowlist per D-10404 so the UI can render
--     predictable iconography without per-row provider-icon
--     configuration. ON DELETE CASCADE.
--
-- Idempotent: every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS,
-- mirroring the WP-052 / WP-101 migration precedent (004 / 005 / 006 /
-- 007 / 008). Re-running the migration runner against an already-
-- seeded database succeeds without error.
--
-- Authority: WP-104 §Scope (In) §A; EC-128 §0 + §2 (privacy default
-- most-private gate; FK ON DELETE CASCADE gate; (player_id) index
-- gate; no premature WP-109 schema creep gate); D-10401 (module path);
-- D-10402 (migration slot 009); D-10403 (per-section closed-set
-- privacy enum); D-10404 (player_links.provider closed-set
-- allowlist); D-10405 (HTTPS-only any-host URL CHECKs).

CREATE TABLE IF NOT EXISTS legendary.player_profiles (
  -- why: 1:1 with legendary.players. PK == FK so a player may have at
  -- most one profile row; the row is only created on the owner's first
  -- successful PATCH /api/me/profile via INSERT ... ON CONFLICT DO
  -- UPDATE in upsertOwnerProfile. The read path (getOwnerProfile)
  -- synthesizes a default view when the row is absent — first PATCH
  -- owns row creation, never the GET.
  player_id           bigint PRIMARY KEY REFERENCES legendary.players(player_id) ON DELETE CASCADE,

  -- why: avatar_url is nullable so a never-edited account synthesizes
  -- to null at the read boundary. The HTTPS-only CHECK is defense-in-
  -- depth per D-10405; the application-layer validateAvatarUrl in
  -- ownerProfile.logic.ts returns a typed Result.fail with code
  -- 'invalid_avatar_url' before any SQL fires, so a constraint
  -- violation here would indicate a bypass of the validator.
  avatar_url          text NULL CHECK (avatar_url IS NULL OR avatar_url ~ '^https://'),

  -- why: about_me is nullable so a never-edited account synthesizes
  -- to null at the read boundary. The 500-character cap matches the
  -- application-layer validateAboutMe limit; clients see a friendlier
  -- typed Result.fail before a constraint violation can fire.
  about_me            text NULL CHECK (about_me IS NULL OR char_length(about_me) <= 500),

  -- why: privacy defaults are the most-private value 'private' per
  -- D-10403 + Vision §3 fail-closed posture. A never-edited account
  -- leaks nothing to any future surface-integration WP that joins
  -- these toggles onto WP-102's PublicProfileView. The closed set
  -- '(private, public)' deliberately excludes 'friends' until a
  -- friend-graph WP lands; introducing the value without a consumer
  -- creates dead-code risk. Three columns rather than one
  -- profile-level toggle so users can hide their about_me while
  -- showing their avatar (a common preference pattern).
  avatar_visibility   text NOT NULL DEFAULT 'private' CHECK (avatar_visibility IN ('private', 'public')),
  about_me_visibility text NOT NULL DEFAULT 'private' CHECK (about_me_visibility IN ('private', 'public')),
  links_visibility    text NOT NULL DEFAULT 'private' CHECK (links_visibility IN ('private', 'public')),

  -- why: updated_at advances on every successful PATCH (the upsert
  -- SET clause appends `updated_at = now()` unconditionally). A
  -- never-edited account synthesizes to null at the read boundary;
  -- the row's actual updated_at column matches the row's created_at
  -- on first INSERT.
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legendary.player_links (
  -- why: bigserial PK so reordering is by mutation of display_order,
  -- not by row replacement. The replaceOwnerLinks helper always
  -- DELETE-then-INSERTs all rows in a single transaction so each
  -- PUT /api/me/links produces a fresh sequence of link_id values;
  -- the link_id is server-internal and never appears on
  -- OwnerProfileLink (the wire shape) per WP-104 §Scope (In) §B.
  link_id        bigserial PRIMARY KEY,

  -- why: many-to-1 with legendary.players via FK on player_id (the
  -- bigint PK on legendary.players, not the AccountId / ext_id text
  -- column). ON DELETE CASCADE so WP-052's deletePlayerData removes
  -- a player's links automatically.
  player_id      bigint NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE,

  -- why: provider is constrained to a small closed-set allowlist per
  -- D-10404. Six entries chosen for MVP scope — Twitter, GitHub,
  -- Twitch, Discord, YouTube, Website. Adding a provider requires a
  -- new migration + a DECISIONS.md entry; the closed set keeps the
  -- arena-client iconography predictable without per-row provider
  -- configuration.
  provider       text NOT NULL CHECK (provider IN ('twitter', 'github', 'twitch', 'discord', 'youtube', 'website')),

  -- why: HTTPS-only any-host CHECK per D-10405 + 2048-character cap
  -- so a malicious client cannot bloat the row beyond reasonable
  -- bounds. The application-layer validateLinkUrl in
  -- ownerProfile.logic.ts returns a typed Result.fail with code
  -- 'invalid_link_url' before any SQL fires.
  url            text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 2048),

  -- why: most-private default per D-10403 fail-closed posture.
  -- A link the owner just added defaults to non-public; the owner
  -- must explicitly flip it to public via a subsequent PUT.
  is_public      boolean NOT NULL DEFAULT false,

  -- why: display_order is the loop index sent by the client (0-based).
  -- replaceOwnerLinks transactionally DELETE-then-INSERTs all rows
  -- in a single BEGIN/COMMIT so display_order values are dense and
  -- stable per request.
  display_order  int NOT NULL DEFAULT 0,

  -- why: UNIQUE (player_id, display_order) so reordering is
  -- deterministic — the (player_id, display_order) UNIQUE constraint
  -- forbids two rows with the same display_order for one player.
  -- Required for the locked ORDER BY display_order ASC, link_id ASC
  -- read path; the ORDER BY's link_id tiebreaker should be a no-op
  -- given this UNIQUE constraint, but the SQL carries it explicitly
  -- as defense-in-depth against a future relaxation.
  CONSTRAINT player_links_player_order_unique UNIQUE (player_id, display_order)
);

-- why: every read path on legendary.player_links filters by player_id
-- first (getOwnerProfile, the post-write composition path inside
-- replaceOwnerLinks, and any future surface-integration WP that joins
-- these rows onto PublicProfileView). The (player_id, display_order)
-- UNIQUE index alone is sufficient for prefix lookups, but a dedicated
-- single-column index on player_id is the cheaper plan for the common
-- WHERE player_id = $1 ORDER BY display_order shape and is consistent
-- with the WP-052 / WP-101 single-column-FK indexing posture on
-- legendary.replay_ownership.
CREATE INDEX IF NOT EXISTS idx_player_links_player_id
  ON legendary.player_links(player_id);
