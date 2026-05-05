-- WP-133 / EC-136 — Stripe checkout-session creation + webhook ingestion
-- (no fulfillment): legendary.stripe_events + legendary.stripe_checkout_sessions
-- Created 2026-05-05 per WP-133 v1.0 / EC-136 / D-13301 / D-13302.
--
-- This migration introduces the Stripe wiring substrate (server-side
-- persistence layer only — no engine, registry, or pre-planning code
-- consumes either table). Two new tables in the legendary.* namespace:
--
--   * legendary.stripe_events — one row per signature-verified Stripe
--     event delivered to POST /api/billing/webhook/stripe. UNIQUE on
--     event_id so Stripe's at-least-once retry contract collapses to a
--     single row via ON CONFLICT (event_id) DO NOTHING (per D-13306).
--     processed_at + process_error are populated by WP-134's fulfillment
--     processor; WP-133 inserts NULL into both.
--
--   * legendary.stripe_checkout_sessions — one row per Stripe Checkout
--     Session created by POST /api/billing/checkout-session. UNIQUE on
--     session_id (Stripe Checkout Session IDs are globally unique).
--     Carries the account_id (FK to legendary.players(ext_id) per
--     D-13302 Option A — the UNIQUE text alternate key on
--     legendary.players; the column-name account_id maps semantically
--     to the application-layer AccountId brand), the price_id, the
--     denormalized entitlement_key (avoids a JOIN in WP-134 fulfillment),
--     and the closed-set intent_status. WP-133 INSERTs intent_status
--     = 'open' only; all transitions are owned by WP-134 by
--     architectural lock.
--
-- WP-133 is fulfillment-blind by construction. The webhook handler
-- INSERTs into legendary.stripe_events and returns 200; it never writes
-- to legendary.entitlements and never updates intent_status. WP-134
-- (the next WP) reads unprocessed events via stripe_events_unprocessed_idx
-- and is the sole writer of fulfillment outcomes.
--
-- Idempotent: every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS,
-- mirroring the WP-052 / WP-101 / WP-104 / WP-109 / WP-132 migration
-- precedent (004 / 005 / 006 / 007 / 008 / 009 / 010 / 011). Re-running
-- the migration runner against an already-seeded database succeeds
-- without error.
--
-- Authority: WP-133 §Scope (In) §A; EC-136 §0 + §2 (FK-bug correction
-- gate; closed-set intent_status gate; idempotency-via-UNIQUE gate;
-- no premature WP-134 INSERT creep gate); D-13301 (module path);
-- D-13302 (migration slot 012 + FK form Option A); D-13306 (idempotency
-- via event_id UNIQUE); D-13307 (one-time payment posture); D-11804
-- (catalog update obligation, paired with the api-endpoints.md update
-- in the same commit).

CREATE TABLE IF NOT EXISTS legendary.stripe_events (
    -- why: bigserial PK so each ingested event is uniquely identifiable
    -- for forensic queries even when the same event_id is delivered
    -- multiple times by Stripe (the second delivery is a no-op via the
    -- ON CONFLICT clause; the first delivery's id remains the audit
    -- handle). The PK is never surfaced on the wire form.
    id              bigserial    PRIMARY KEY,

    -- why: D-13306 — Stripe documents event.id as unique per event
    -- delivery; UNIQUE here is the single defense against duplicate
    -- ingestion of a retried event. Combined with ON CONFLICT (event_id)
    -- DO NOTHING in the INSERT (recordStripeEvent in billing.logic.ts),
    -- a Stripe retry collapses to a no-op without an application-level
    -- deduplication lock. WP-134 reads via WHERE processed_at IS NULL
    -- (see partial index below) and is the sole writer of processed_at.
    event_id        text         NOT NULL UNIQUE,

    event_type      text         NOT NULL,

    -- why: payload stores the FULL Stripe event envelope as returned by
    -- stripe.webhooks.constructEvent (rawBody, sig, secret), serialized
    -- via JSON.stringify(event). The full envelope preserves
    -- api_version (the forensic signal for Stripe-side API version
    -- drift), id, type, data.object, data.previous_attributes, livemode,
    -- pending_webhooks, and request — all of which WP-134's fulfillment
    -- parser may need. Storing only event.data.object would lose
    -- api_version and break WP-134's drift detection.
    payload         jsonb        NOT NULL,

    received_at     timestamptz  NOT NULL DEFAULT now(),

    -- why: processed_at + process_error are introduced by WP-133 but
    -- NEVER written by WP-133. WP-134's fulfillment processor flips
    -- processed_at from NULL to now() on successful fulfillment and
    -- writes a full-sentence diagnostic into process_error on processing
    -- failure. Any non-NULL value in either column written by WP-133
    -- code is a scope-creep violation.
    processed_at    timestamptz  NULL,
    process_error   text         NULL
);

-- why: WP-134's fulfillment processor reads unprocessed events via
-- SELECT ... FROM legendary.stripe_events WHERE processed_at IS NULL
-- ORDER BY received_at. The partial predicate `WHERE processed_at IS
-- NULL` scopes the index to the working set only — once an event is
-- processed, the row leaves the index and the read cost stays bounded
-- by the unprocessed backlog rather than total event history. Index
-- name follows the WP-104 idx_player_links_player_id + WP-132
-- entitlements_active_unique convention.
CREATE INDEX IF NOT EXISTS stripe_events_unprocessed_idx
    ON legendary.stripe_events (received_at)
    WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS legendary.stripe_checkout_sessions (
    -- why: bigserial PK so each created Checkout Session is uniquely
    -- identifiable even when Stripe regenerates the same session_id is
    -- impossible per Stripe's contract — but the PK keeps row identity
    -- decoupled from the externally-controlled session_id for joins
    -- and forensic queries.
    id              bigserial    PRIMARY KEY,

    -- why: Stripe documents Checkout Session IDs (cs_*) as globally
    -- unique across all Stripe accounts; UNIQUE here is the idempotency
    -- guard if a future retry or duplicate creation path occurs. The
    -- application layer never reuses a session_id; this constraint is
    -- defense-in-depth against unknown future code paths.
    session_id      text         NOT NULL UNIQUE,

    -- why: D-13302 Option A — FK targets legendary.players(ext_id), the
    -- UNIQUE text alternate key. The application-layer AccountId brand
    -- maps to ext_id at the identity boundary (per D-5201). The
    -- column-name account_id is preserved (semantic — this row "belongs"
    -- to an account) even though the FK technically points at the
    -- ext_id column rather than a hypothetical players.account_id
    -- column. legendary.players has NO account_id column; the FK-bug
    -- fix per EC-136 §0 #FK-BUG was to confirm ext_id is the correct
    -- target. ON DELETE CASCADE so a future deletePlayerData analogue
    -- removes a player's checkout-session history without orphan-row
    -- leakage. The WP-104 / WP-132 alternative pattern (player_id bigint
    -- FK on legendary.players(player_id)) was rejected at execution
    -- time per D-13302; future per-account tables on the billing
    -- surface should re-evaluate the trade-off.
    account_id      text         NOT NULL REFERENCES legendary.players(ext_id) ON DELETE CASCADE,

    price_id        text         NOT NULL,

    -- why: entitlement_key is denormalized — the canonical mapping
    -- (price_id -> entitlement_key) lives in the env-driven
    -- STRIPE_PRICE_ALLOWLIST loaded at startup (per D-13305) and could
    -- be re-derived at fulfillment time. Storing it on the row anyway
    -- avoids an extra environment lookup in WP-134's fulfillment query
    -- (the fulfillment processor needs to know which entitlement to
    -- grant; reading it directly off the row is one fewer source of
    -- truth to keep in sync). Trade-off accepted: a price_id that is
    -- removed from the allowlist after a session is created still has
    -- the original entitlement_key recorded on the row, which is the
    -- correct semantics — the user paid for that entitlement.
    entitlement_key text         NOT NULL,

    -- why: closed-set CHECK locks the four-value lifecycle. WP-133
    -- INSERTs 'open' on every row creation and NEVER transitions the
    -- value. WP-134 owns all transitions ('open' -> 'completed' on
    -- checkout.session.completed; 'open' -> 'expired' on
    -- checkout.session.expired; 'open' -> 'canceled' on
    -- checkout.session.async_payment_failed or analogous Stripe events).
    -- A future engineer adding intent_status transitions in
    -- apps/server/src/billing/ would be wrong — the deferral is
    -- intentional; rejecting their PR is the correct response.
    intent_status   text         NOT NULL CHECK (intent_status IN ('open', 'completed', 'expired', 'canceled')),

    created_at      timestamptz  NOT NULL DEFAULT now(),

    -- why: completed_at is introduced by WP-133 but NEVER written by
    -- WP-133. WP-134's fulfillment processor flips this from NULL to
    -- now() in the same transaction that updates intent_status to
    -- 'completed'. Any non-NULL value written by WP-133 code is a
    -- scope-creep violation.
    completed_at    timestamptz  NULL
);

-- why: secondary lookup index on account_id for WP-134's fulfillment
-- and any future per-account checkout-session reads (e.g., a future
-- Customer Portal WP that lists a user's purchase history). Index name
-- follows the WP-104 idx_player_links_player_id + WP-109
-- idx_team_member_events_player_id idx_<table>_<column> convention.
CREATE INDEX IF NOT EXISTS stripe_checkout_sessions_account_idx
    ON legendary.stripe_checkout_sessions (account_id);
