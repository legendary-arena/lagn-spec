-- WP-132 / EC-135 — Entitlements data model: legendary.entitlements
-- Created 2026-05-05 per WP-132 v1.0 / EC-135 / D-13201 / D-13202.
--
-- This migration introduces the entitlements substrate (server-side
-- persistence layer only — no engine, registry, or pre-planning code
-- consumes this table). One new table in the legendary.* namespace:
--
--   * legendary.entitlements — one row per (player_id, entitlement_key)
--     active grant. Carries the closed-set entitlement_key (D-13203 —
--     six cosmetic-only members; year-suffix discipline on time-boxed
--     supporter SKUs), the closed-set source (D-13204 — 'stripe' |
--     'admin_grant' | 'comp'), the optional source_ref (per-source
--     semantics review-locked rather than CHECK-encoded — see the
--     `source_ref` column comment below), the granted_at audit
--     timestamp, and the revoked_at column whose NULL state marks the
--     row active. ON DELETE CASCADE so a future deletePlayerData
--     analogue automatically removes a player's entitlements.
--
-- WP-132 ships ZERO write path against this table — getEntitlementsForAccount
-- in entitlements.logic.ts is read-only by construction; WP-134
-- (Stripe webhook + fulfillment) owns the row-creation site. Revocation
-- is a future-WP responsibility.
--
-- Idempotent: every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS,
-- mirroring the WP-052 / WP-101 / WP-104 / WP-109 migration precedent
-- (004 / 005 / 006 / 007 / 008 / 009 / 010). Re-running the migration
-- runner against an already-seeded database succeeds without error.
--
-- Authority: WP-132 §Scope (In) §A; EC-135 §0 + §2 (FK on player_id
-- bigint gate; partial-unique-index idempotency gate; closed-set source
-- gate; closed-set entitlement_key gate; no premature WP-134 INSERT
-- creep gate); D-13201 (module path); D-13202 (migration slot 011);
-- D-13203 (EntitlementKey closed set); D-13204 (source closed set);
-- D-13205 (route-wiring posture); D-13206 (drift-detection posture).

CREATE TABLE IF NOT EXISTS legendary.entitlements (
    -- why: bigserial PK so each grant is uniquely identifiable for
    -- forensic queries even when the same (player_id, entitlement_key)
    -- pair is granted, revoked, and re-granted across time. The PK is
    -- never surfaced on the wire form.
    id              bigserial    PRIMARY KEY,

    -- why: bigint FK on legendary.players(player_id) per WP-104 D-10402
    -- + WP-109 D-10906 + D-5201 — legendary.players(player_id) is the
    -- bigint PK FK target for every per-account table. The application
    -- layer maps AccountId (= ext_id text) to player_id via the
    -- standard two-query pattern (mirrors apps/server/src/profile/
    -- ownerProfile.logic.ts:123). legendary.players has NO account_id
    -- column — its PK is player_id bigserial and its UNIQUE alternate
    -- key is ext_id text. ON DELETE CASCADE so a future deletePlayerData
    -- analogue removes a player's entitlements automatically without
    -- orphan-row leakage.
    player_id       bigint       NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE,

    -- why: closed-set CHECK per D-13203. Six cosmetic-only members at
    -- WP-132 close — supporter_tier_basic_2026 carries the year-suffix
    -- because supporter SKUs are time-boxed (renewal ships a NEW key
    -- like _2027); cosmetic keys are NOT year-suffixed because cosmetics
    -- are evergreen. NG-1 protection is structural via the Layer
    -- Boundary (engine cannot import from apps/server/src/entitlements/),
    -- and the closed-set lock at the schema layer is defense-in-depth.
    -- Adding a key requires a new migration + a DECISIONS.md entry +
    -- byte-identical TS-side update to ENTITLEMENT_KEYS (review-enforced
    -- per WP-132 §Debuggability & Diagnostics).
    entitlement_key text         NOT NULL CHECK (entitlement_key IN (
        'supporter_tier_basic_2026',
        'cosmetic_playmat_classic',
        'cosmetic_playmat_comic',
        'cosmetic_playmat_minimal',
        'cosmetic_cardback_default_plus',
        'cosmetic_avatar_frame_supporter'
    )),

    -- why: closed-set CHECK per D-13204. Three values — 'stripe' for
    -- WP-134 webhook-driven grants; 'admin_grant' for a future admin
    -- tooling path with audit logs; 'comp' for database-direct
    -- interventions with a DECISIONS.md citation. 'comp' is
    -- operationally distinct from 'admin_grant' so forensic queries
    -- can separate routine ops from one-off interventions.
    source          text         NOT NULL CHECK (source IN ('stripe', 'admin_grant', 'comp')),

    -- why: source_ref per-source semantics are review-locked rather
    -- than CHECK-encoded (per WP-132 §Locked contract values + the
    -- D-13204 source closed-set lock rationale): 'stripe' rows MUST
    -- carry the Checkout Session ID
    -- (cs_*) or Payment Intent ID (pi_*) — WP-134 owns the writer and
    -- enforces this via the application-layer fulfillment flow.
    -- 'admin_grant' rows MAY carry an audit ref (future admin tool).
    -- 'comp' rows MUST cite a D-NNNNN DECISIONS.md entry — the policy
    -- applies to direct-SQL interventions where review discipline is
    -- the control. WP-132 ships ZERO writer for any of the three
    -- values; the policy is enforced at the future-writer / review
    -- boundary, not at the schema boundary. A `source = 'comp' ->
    -- source_ref NOT NULL` CHECK is a candidate refinement if 'comp'
    -- rows become frequent (deferred to a future WP).
    source_ref      text         NULL,

    granted_at      timestamptz  NOT NULL DEFAULT now(),
    revoked_at      timestamptz  NULL
);

-- why: enforces idempotency for entitlement grants. WP-134's webhook
-- fulfillment processor creates entitlement rows in response to
-- checkout.session.completed events; Stripe's at-least-once delivery
-- contract means the same event may arrive multiple times. A retry or
-- duplicate fulfillment attempting to grant an already-active
-- entitlement results in a no-op (matching the conflict-do-nothing
-- clause WP-134 will pair with this index) rather than a second row.
-- The partial predicate `WHERE revoked_at IS NULL` scopes uniqueness to
-- active grants — a previously-revoked entitlement may be re-granted as
-- a new row without colliding with the historical row.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_active_unique
    ON legendary.entitlements (player_id, entitlement_key)
    WHERE revoked_at IS NULL;

-- why: secondary lookup index for the GET /api/me/entitlements read
-- path. The two-query helper's Step 2 SELECT filters on
-- (player_id, revoked_at IS NULL); the partial predicate matches the
-- active-only read posture. Index name follows the WP-104
-- idx_player_links_player_id + WP-109 idx_team_member_events_player_id
-- idx_<table>_<column> convention.
CREATE INDEX IF NOT EXISTS idx_entitlements_player_id
    ON legendary.entitlements (player_id)
    WHERE revoked_at IS NULL;
