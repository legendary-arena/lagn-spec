-- WP-109 / EC-115 — Team affiliation: legendary.teams + legendary.team_member_events + legendary.team_audit_log
-- Created 2026-05-03 per WP-109 / EC-115.
--
-- This migration introduces the team-affiliation surface (server-side
-- persistence layer only — no engine, registry, or pre-planning code
-- consumes these tables). Three new tables in the legendary.* namespace:
--
--   * legendary.teams — one row per cooperative cohort. Carries the
--     immutable team_size literal (3 | 4 | 5), the immutable
--     captain_player_id FK (the captain MUST be a current member; the
--     application validator enforces this — SQL has no self-referential
--     constraint), the closed-set status / visibility enums, the
--     start_date / end_date window, and the cohort_label string. The
--     team_id is a UUID v4 string PK (server-generated; mirrors the
--     WP-102 replay_hash text-PK precedent).
--
--   * legendary.team_member_events — append-only audit row per
--     membership change. Carries the denormalized team_size column per
--     OQ-4 = (a) user pre-lock 2026-05-03 (D-10906 — INSERT-time copied
--     from legendary.teams.team_size; structurally immutable
--     post-INSERT). The denormalization unlocks the simple-form UNIQUE
--     partial index (player_id, team_size) WHERE left_at IS NULL for
--     same-size cohort exclusivity defense in depth (PostgreSQL
--     prohibits subqueries inside CREATE INDEX expressions).
--
--   * legendary.team_audit_log — append-only operator + captain audit
--     trail. Distinguishes operator-driven mutations (is_operator=true,
--     reason text required) from captain-driven mutations
--     (is_operator=false, reason nullable) per EC-115 Guardrail 5.
--     payload jsonb carries free-form per-action context (old/new
--     values for rename, old/new captain for reassign, etc.).
--
-- Idempotent: every CREATE TABLE / CREATE INDEX uses IF NOT EXISTS,
-- mirroring the WP-052 / WP-101 / WP-104 migration precedent (004 / 005 /
-- 006 / 007 / 008 / 009). Re-running the migration runner against an
-- already-seeded database succeeds without error.
--
-- Authority: WP-109 §Scope (In); EC-115 §Locked Values; D-10905
-- (apps/server/src/teams/ server-layer classification); D-10906
-- (migration slot 010 + idempotency + OQ-4 = (a) denormalization);
-- D-10907 (single-transaction multi-row create-team); D-10908 (TeamId
-- branded type at the TS layer).

CREATE TABLE IF NOT EXISTS legendary.teams (
  -- why: text PK rather than bigserial. team_id is server-generated as
  -- a UUID v4 string (cast to TeamId at the TS layer per D-10908,
  -- mirroring the AccountId brand from WP-052 D-5201). The brand exists
  -- only at the TypeScript layer; the SQL column is text. Mirrors the
  -- WP-102 replay_hash text-PK precedent rather than the bigserial
  -- shape of legendary.player_profiles (1:1 with players, so it borrowed
  -- player_id as PK).
  team_id              text PRIMARY KEY,

  -- why: human-readable team name; 100-character cap so the row stays
  -- compact. The application-layer validateTeamName guards before
  -- INSERT; this CHECK is defense in depth.
  name                 text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),

  -- why: cohort_label is the calendar-window identifier ("2026 Cohort").
  -- The intentional rename per DESIGN-RANKING.md §2 avoids the
  -- terminology collision with the bound ranking-window concept;
  -- the alternative form documented in EC-115 Common Failure Smells
  -- is rejected. 50-character cap matches the locked validator
  -- limit.
  cohort_label         text NOT NULL CHECK (char_length(cohort_label) BETWEEN 1 AND 50),

  -- why: team_size is declared at creation and immutable for the
  -- team's lifetime per WP-109 §6 + EC-115 Guardrail 9. Legendary's
  -- cooperative gameplay scales with player count (3 / 4 / 5-handed
  -- formats are mechanically distinct), so a team that drifted between
  -- formats would not be a coherent cohort. Resizing requires
  -- retire+recreate. The verification grep in the session prompt
  -- §Verification Steps confirms zero matches across migrations and
  -- server code.
  team_size            int NOT NULL CHECK (team_size IN (3, 4, 5)),

  -- why: start_date / end_date are calendar-window markers per WP-109
  -- §10 Lifecycle (default one-year cohort). The CHECK end_date >=
  -- start_date is the natural ordering invariant; no other date math.
  start_date           date NOT NULL,
  end_date             date NOT NULL CHECK (end_date >= start_date),

  -- why: closed-set status enum per WP-109 §10. 'active' is the
  -- starting state; 'completed' is a natural terminal end (cohort
  -- finished its planned arc); 'retired' is a premature / administrative
  -- terminal end. Both terminal states make the roster read-only.
  -- Guardrail 14 forbids adding a 'paused' / recovery state without a
  -- DECISIONS.md override.
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'retired')),

  -- why: captain_player_id FK to legendary.players. The captain MUST
  -- be a current member (role 'member', leftAt unset) per WP-109 §6 +
  -- EC-115 Guardrail 11 — enforced by validateCaptainInvariant in
  -- team.logic.ts (SQL has no self-referential constraint because the
  -- captain → member relationship cannot be expressed as a CHECK
  -- referencing another table). ON DELETE CASCADE so a deleted player
  -- account cascades through every team they captained, then through
  -- team_member_events + team_audit_log via team_id FK below.
  captain_player_id    bigint NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE,

  -- why: closed-set visibility enum. 'private' is the most-private
  -- fail-closed default mirroring WP-104 D-10403 (the privacy-default
  -- precedent for any new owner-curated surface). 'friends' currently
  -- collapses to 'private' server-side at read time per WP-109 §11 +
  -- EC-115 Guardrail 6 (no friend-graph surface yet); a future WP that
  -- introduces the friend graph removes the fallback in a follow-up
  -- edit without modifying this column shape.
  visibility           text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'friends', 'private')),

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- why: every read-by-captain path (operator audit, "teams I captain"
-- listing) and every legendary.players cascade-delete touches this
-- column; a single-column index keeps those plans cheap. Mirrors the
-- WP-104 idx_player_links_player_id single-column-FK indexing posture.
CREATE INDEX IF NOT EXISTS idx_teams_captain_player_id
  ON legendary.teams(captain_player_id);

-- why: status is the closed-set filter on every "active teams"
-- listing path (operator dashboards, captain dashboards). Single-
-- column index is the cheaper plan for the common WHERE status =
-- 'active' shape than scanning a composite (captain_player_id,
-- status) index from the wrong side.
CREATE INDEX IF NOT EXISTS idx_teams_status
  ON legendary.teams(status);

CREATE TABLE IF NOT EXISTS legendary.team_member_events (
  -- why: bigserial PK — events are append-only and never reordered;
  -- the event_id is server-internal and never appears on the wire
  -- (Team.members[] is composed from the latest event per
  -- (team_id, player_id) by the application layer).
  event_id             bigserial PRIMARY KEY,

  -- why: team_id FK to legendary.teams; ON DELETE CASCADE so deleting
  -- a team row removes all its member-event rows automatically.
  team_id              text NOT NULL REFERENCES legendary.teams(team_id) ON DELETE CASCADE,

  -- why: player_id FK to legendary.players; ON DELETE CASCADE so a
  -- deleted player account removes all their membership events
  -- (GDPR-style erasure cascade through legendary.players ->
  -- legendary.team_member_events).
  player_id            bigint NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE,

  -- why: same-size cohort exclusivity defense in depth per OQ-4 = (a)
  -- user pre-lock 2026-05-03 (folded into D-10906). team_size is
  -- INSERT-time copied from legendary.teams.team_size and is
  -- structurally immutable post-INSERT — no UPDATE path in
  -- team.logic.ts touches the column. The denormalization avoids the
  -- PostgreSQL prohibition on subqueries inside CREATE INDEX
  -- expressions while keeping the defense-in-depth posture: the
  -- validator at the application layer is the primary gate; the
  -- UNIQUE partial index below ensures concurrent inserts cannot
  -- bypass the rule.
  team_size            int NOT NULL CHECK (team_size IN (3, 4, 5)),

  -- why: closed-set role enum. 'member' is the primary role;
  -- 'substitute' is the bench. Promotion is two events per WP-109
  -- §8.3 + EC-115 Guardrail 4 (departing member's leftAt + the
  -- substitute's role change as separate event records).
  role                 text NOT NULL CHECK (role IN ('member', 'substitute')),

  -- why: monotonic timeline per WP-109 AC #11 + EC-115 Guardrail 13.
  -- joined_at is the membership-event timestamp; left_at is null
  -- while the member is live and gets set on departure. The CHECK
  -- (left_at IS NULL OR left_at >= joined_at) is the SQL defense-
  -- in-depth gate; the validator at team.logic.ts is the primary
  -- gate. Once left_at is set, the application layer rejects any
  -- attempt to rewrite joined_at on the same row (corrections
  -- follow the amendment pattern: new event row, original
  -- preserved).
  joined_at            timestamptz NOT NULL,
  left_at              timestamptz NULL,

  -- why: actor_id is the player who performed the mutation (the
  -- captain in routine flows; the operator in override flows).
  -- ON DELETE CASCADE so a deleted player's audit trail cascades
  -- through their actor_id rows too.
  actor_id             bigint NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE,

  -- why: is_operator distinguishes operator-override events from
  -- routine captain events per WP-109 §9 + EC-115 Guardrail 5.
  -- Defaults false; operator paths set true and require non-null
  -- reason (validated at the application layer).
  is_operator          boolean NOT NULL DEFAULT false,

  -- why: reason text — required for operator overrides (validator
  -- rejects null when is_operator=true), nullable for routine
  -- captain mutations. 500-character cap matches the WP-104
  -- about_me cap precedent.
  reason               text NULL CHECK (reason IS NULL OR char_length(reason) <= 500),

  created_at           timestamptz NOT NULL DEFAULT now(),

  -- why: monotonic timeline defense in depth per EC-115 Guardrail
  -- 13 + AC #11. Mirrors the application validator
  -- validateMonotonicTimeline; both layers fail loudly.
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

-- why: every read path (composeTeamAffiliationsForProfile, captain
-- dashboards, team detail) filters by team_id first; the single-
-- column index keeps the plan cheap. Mirrors the WP-104 single-
-- column-FK indexing posture.
CREATE INDEX IF NOT EXISTS idx_team_member_events_team_id
  ON legendary.team_member_events(team_id);

-- why: every player-side read (a player's teamAffiliations[] on
-- their profile, validateSameSizeExclusivity's lookup) filters by
-- player_id first; single-column index keeps the plan cheap.
CREATE INDEX IF NOT EXISTS idx_team_member_events_player_id
  ON legendary.team_member_events(player_id);

-- why: same-size cohort exclusivity defense in depth per OQ-4 = (a)
-- user pre-lock 2026-05-03 (D-10906). The simple-form partial UNIQUE
-- index (player_id, team_size) WHERE left_at IS NULL leverages the
-- denormalized team_size column above. The validator at
-- team.logic.ts:validateSameSizeExclusivity is the primary gate; this
-- index is the concurrency-safe backstop (PostgreSQL serializes
-- concurrent INSERTs through the UNIQUE constraint). The subquery
-- form (e.g. WHERE ... (SELECT team_size FROM legendary.teams ...))
-- is prohibited by PostgreSQL inside CREATE INDEX expressions — the
-- denormalization makes this simple form possible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_member_events_active_size
  ON legendary.team_member_events(player_id, team_size)
  WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS legendary.team_audit_log (
  -- why: bigserial PK; rows are append-only and never reordered.
  audit_id             bigserial PRIMARY KEY,

  -- why: team_id FK to legendary.teams with ON DELETE CASCADE so
  -- deleting a team row removes its audit trail.
  team_id              text NOT NULL REFERENCES legendary.teams(team_id) ON DELETE CASCADE,

  -- why: closed-set action enum per EC-115 Guardrails 4 / 5 / 11.
  -- The values enumerate every mutation surface in team.logic.ts;
  -- adding a value requires both this CHECK and the application
  -- layer's dispatch sites to be updated together.
  action               text NOT NULL CHECK (action IN (
    'create', 'rename', 'visibility_change', 'status_change',
    'captain_reassign', 'member_add', 'member_leave', 'role_change',
    'operator_override'
  )),

  -- why: actor_id is the player who performed the action; ON DELETE
  -- CASCADE so a deleted account erases its audit trail.
  actor_id             bigint NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE,

  -- why: distinguishes operator-driven from captain-driven actions
  -- per WP-109 §9 + EC-115 Guardrail 5.
  is_operator          boolean NOT NULL DEFAULT false,

  -- why: reason text — required for operator overrides (validated
  -- at the application layer); 500-character cap.
  reason               text NULL CHECK (reason IS NULL OR char_length(reason) <= 500),

  -- why: payload is free-form per-action context (old/new values for
  -- rename, old/new captain for reassign, etc.). Never accessed in
  -- moves, scoring, or any ranking path per EC-115 Guardrail 7;
  -- treated as opaque audit text by every consumer.
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- why: every audit-trail read (operator dashboards, "this team's
-- history") filters by team_id first; single-column index keeps the
-- plan cheap.
CREATE INDEX IF NOT EXISTS idx_team_audit_log_team_id
  ON legendary.team_audit_log(team_id);

-- why: actor-side reads ("operator override history", "captain action
-- history") filter by actor_id; single-column index supports both.
CREATE INDEX IF NOT EXISTS idx_team_audit_log_actor_id
  ON legendary.team_audit_log(actor_id);
