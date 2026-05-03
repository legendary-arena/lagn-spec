# WP-109 — Team Affiliation (Profile-Level Cooperative Cohorts)

**Status:** Draft (drafted 2026-04-26; review-pass amendment 2026-05-03
hardened captain invariant, default invalidity behavior, same-size
cohort exclusivity, read-time visibility, and timeline monotonicity;
**hard dependency on WP-104 satisfied 2026-05-02 at `cea9108`** when
WP-104 / EC-128 landed; pre-flight + copilot check completed 2026-05-03
in `docs/ai/invocations/preflight-wp109.md` with **CONFIRM** disposition
after fourteen scope-neutral amendments landed in this commit; user
pre-locked 2026-05-03 PS-3 = YES (extend `OwnerProfileView` 7 → 8
keys + modify `MyProfilePage.vue`) and OQ-4 = (a) (denormalize
`team_size` into `legendary.team_member_events`); session prompt
fully resolved at `docs/ai/invocations/session-wp109-team-affiliation.md`.
Lint-gate self-review **PASS** — see `## Lint Self-Review` at foot.
**Promoted from deferred placeholder; READY FOR EXECUTION** at any
EC-mode session.

**Primary Layer:** Server (persistence) + App (read surfaces on profile
page). No engine, registry, or pre-planning code.

**Dependencies:**
- **Hard:** WP-104 (Owner Profile Data Model & `/me` Edit) — landed
  **2026-05-02 at `cea9108`** (`EC-128:`). Created
  `legendary.player_profiles` (1:1 with `legendary.players`,
  `ON DELETE CASCADE`) + `legendary.player_links`, the
  `OwnerProfileView` / `OwnerProfileLink` / `OwnerProfileResult<T>`
  type contracts at `apps/server/src/profile/ownerProfile.types.ts`,
  three new HTTP routes under `/api/me/`, and migration slot 009.
  WP-109's migration is slot **010** (assigned at pre-flight 2026-05-03
  per PS-4). WP-109 extends WP-102's `PublicProfileView` with
  `teamAffiliations[]` (per PS-3 reframing, NOT WP-104's owner-edit
  surface — team membership is not owner-editable, requiring
  invitation + acceptance per §8.3 / §10).
- **Soft:** WP-102 (public profile page, landed 2026-04-28) — the
  read surface that exposes team affiliation on a player's profile
  reuses the WP-102 page composition pattern. WP-102's
  `PublicProfileView` (`apps/server/src/profile/profile.types.ts:54`,
  4 locked keys) is extended to 5 keys; the drift test at
  `profile.logic.test.ts:168–173` is updated in the same commit.
- **Soft:** WP-115 (long-lived `pg.Pool` lifecycle anchor + same-commit
  `register*Routes(...)` precedent, landed 2026-05-01) — WP-109 mirrors
  the `registerOwnerProfileRoutes(server.router, pool, deps)` shape as
  `registerTeamRoutes(...)`.

---

## 1. Problem Statement

Legendary Arena currently models players solely as individuals, with no
persistent way to represent long-term cooperative cohorts that choose
to play together over time.

This limits:

- Narrative continuity ("this group played the 2026 year together")
- Historical attribution of cooperative play
- Profile-level identity that reflects *who you play with*, not just
  what you achieved

The user-facing analogy is a bowling-league roster: a fixed group of
players who meet and play cooperatively across a fixed window. Unlike
bowling, Legendary's cooperative gameplay scales with player count
(3-handed, 4-handed, and 5-handed games are mechanically distinct
scenarios), so this WP treats team size as a declared gameplay
parameter rather than a fixed five. The ranking-style competition
between teams that a real bowling league implies is **explicitly out
of scope** (see §3 and §4 below).

---

## 2. Goals

- Add a **team affiliation construct** to player profiles
- Support **long-term (one-year, default) cooperative commitment**
- Support the three meaningful Legendary cooperative formats —
  3-player, 4-player, and 5-player — as distinct team sizes declared
  at creation
- Preserve Legendary Arena's **non-competitive, non-MMR, async-compatible**
  architecture
- Ensure **full auditability and historical integrity** of membership
  changes

---

## 3. Non-Goals / Explicit Constraints

- No team-based rankings, ratings, ladders, or MMR
- No rewards, unlocks, badges, or incentives tied to team membership
- No engine, rules, or gameplay logic changes
- No chat, scheduling, or real-time coordination systems
- No monetization pathways
- No inter-team competitive comparison surface (the bowling-league
  analogy ends at "fixed roster across a season"; it does not extend
  to "leaderboard between teams")
- No 1-player or 2-player team formats — solo and duo cooperative
  play exist as gameplay options but do not require a persistent team
  identity to support; the team construct starts at 3

Teams are identity and historical context only.

---

## 4. Vision Alignment (Required)

**Vision clauses touched:** §3 (Player Trust & Fairness), §4 (Faithful
Multiplayer Experience — cooperative), §23(b) (Asynchronous PvP
Comparison; no in-game player-vs-player), §25 (Skill Over Repetition).

**Conflict assertion:** No conflict — this WP preserves all touched
clauses by introducing no scoring, ranking, or comparison surface.

**Non-Goal proximity check:** None of NG-1..NG-8 are crossed. The
team construct introduces no purchase, reward, gacha, energy,
ad-surface, dark-pattern, or social-influence mechanic. Team
affiliation does not unlock content, advantage, or recognition.

**Determinism preservation:** N/A — this WP touches no engine,
scoring, replay, or RNG surface.

**Decision references:**

- **D-0005** (per [DESIGN-RANKING.md:14-20](../DESIGN-RANKING.md))
  — *Asynchronous PvP Comparison Authorized; Live PvP Combat
  Forbidden.* This WP introduces no comparison surface at all (let
  alone a synchronous one), so D-0005 is preserved trivially.
- **DESIGN-RANKING.md §12** ([line 644](../DESIGN-RANKING.md))
  explicitly lists *"Team, faction, or cooperative co-op rankings"*
  as out-of-scope future work. This WP is **narrower than that**: it
  introduces team identity without any ranking projection over team
  identity. No amendment to DESIGN-RANKING is required.

If a future WP proposes to project team identity into a ranking or
comparison surface, that is a distinct design delta requiring its own
Vision review and DECISIONS.md entry — not an extension of this WP.

---

## 5. Architectural Placement

- **Ownership:** Server-side persistence layer
- **Explicitly excluded from:**
  - Game engine (`G`, `ctx`)
  - Match resolution and turn-flow
  - Deterministic replay logic
  - Registry layer
  - Pre-planning layer
- **Data classification:** observational, not rule-bearing. A failure
  in this layer can never affect run correctness, replay verification,
  or any scoring surface.
- Mirrors the same layer-boundary model as ranking aggregation (see
  [DESIGN-RANKING.md §4.1](../DESIGN-RANKING.md)).

---

## 6. Concept Definition

### Team (Cohort)

A **Team** represents a named, time-bounded cooperative cohort that
plays a specific Legendary format together.

- **Team size**: declared at creation as one of `3 | 4 | 5`. Immutable
  for the lifetime of the team — a team cannot be resized after
  creation. Resizing requires retiring the team and creating a new
  one.
- **Members**: exactly `teamSize` core members at full roster.
- **Substitutes**: up to `min(2, teamSize − 2)` substitutes (1 for
  3-player teams, 2 for 4- and 5-player teams).
- **Captain**: exactly one `captainPlayerId` exists per team at all
  times. The captain MUST be a current `member` (role `'member'`) —
  never a `substitute`. Captain reassignment under §9 must select a
  current member.
- **Fixed duration**: default one calendar year.

Teams are independent of individual runs or scenarios. A team's
existence neither requires nor implies any specific number of
cooperative runs played together.

> **Why size is declared and immutable:** Legendary's cooperative
> gameplay scales with player count — villain row width, attack
> values, and several scenario constraints are sized to the table.
> A "team" that drifts between 3-handed and 5-handed play is not a
> coherent cohort in the gameplay sense. Locking size at creation
> keeps the team identity tied to a specific format.

---

## 7. Data Model (Authoritative)

### Team Entity

```ts
Team {
  teamId: string                       // immutable
  name: string
  cohortLabel: string                  // e.g. "2026 Cohort"
  teamSize: 3 | 4 | 5                  // immutable; declared at creation
  startDate: ISODate
  endDate: ISODate
  status: 'active' | 'completed' | 'retired'

  captainPlayerId: string

  members: {
    playerId: string
    role: 'member' | 'substitute'
    joinedAt: ISODate
    leftAt?: ISODate
  }[]

  visibility: 'public' | 'friends' | 'private'
}
```

> **Why `cohortLabel` and not `seasonLabel`:** the term "Season" is
> already a bound concept in
> [DESIGN-RANKING.md §2](../DESIGN-RANKING.md) (a fixed Jan 1 – Dec 31
> ranking window). Two parallel "season" concepts will diverge. A
> team's window is calendar-aligned by default but conceptually
> independent of the ranking season; `cohortLabel` is the
> non-colliding name.

### Player Profile Extension (via WP-104)

```ts
teamAffiliations: {
  teamId: string
  teamSize: 3 | 4 | 5                  // denormalized for display
  role: 'member' | 'substitute'
  joinedAt: ISODate
  leftAt?: ISODate
}[]
```

This field extends WP-102's `PublicProfileView`
([`apps/server/src/profile/profile.types.ts:54`](../../apps/server/src/profile/profile.types.ts))
column-additively (locked 4-key set → 5-key set; the drift test at
[`apps/server/src/profile/profile.logic.test.ts:168–173`](../../apps/server/src/profile/profile.logic.test.ts)
is updated in the same commit per pre-flight PS-6). Team-side data
(`name`, `cohortLabel`, etc.) is composed at read time via a join
through the new team tables, with the per-team `visibility` filter
applied server-side per §11 (`friends` falls back to `private` when
no friend-graph surface exists).

The denormalization (including `teamSize`) on the player-side
projection is intentional: it makes "show this player's teams" a
single-row read on the profile, with team-side details fetched only
for visible affiliations.

The owner's [`MyProfilePage.vue`](../../apps/arena-client/src/pages/MyProfilePage.vue)
(WP-104) optionally surfaces a read-only "your teams" block reusing
the same composer; under that default (recommended YES — one
read-only listing on the owner-edit page), `OwnerProfileView`
([`apps/server/src/profile/ownerProfile.types.ts:129`](../../apps/server/src/profile/ownerProfile.types.ts))
gains the field column-additively (7 → 8 keys) and the drift test at
[`apps/server/src/profile/ownerProfile.logic.test.ts:146–155`](../../apps/server/src/profile/ownerProfile.logic.test.ts)
is updated likewise. **Team membership is NOT owner-editable**: a
player cannot unilaterally add themselves to a team — invitation +
acceptance per §8.3 / §10 Creation is required. The owner-side
listing is read-only; mutation flows always go through the
team-side `/api/teams/...` endpoints.

> **Authoritative source note:** All membership mutations are recorded
> as immutable, timestamped, attributed events. `Team.members[]`
> reflects the current view derived from those events. No mutation
> path updates historical records in place — corrections follow the
> amendment pattern (new record, original preserved) per §10 and
> [DESIGN-RANKING.md §10.2](../DESIGN-RANKING.md). This invariant is
> mirrored in EC-115 Guardrail 3.

---

## 8. Membership Semantics

### 8.1 Roster constraints (parameterized by `teamSize`)

| `teamSize` | Members at full roster | Max substitutes |
|------------|------------------------|-----------------|
| 3          | 3                      | 1               |
| 4          | 4                      | 2               |
| 5          | 5                      | 2               |

### 8.2 Validity rule (generalized)

A team is **valid** (eligible to remain in `active` status) if:

- `liveMembers ≥ teamSize − 2`, AND
- `liveMembers + liveSubs ≥ teamSize − 1`

Where `liveMembers` and `liveSubs` count members and substitutes whose
`leftAt` is unset.

Concrete expansion:

| `teamSize` | Validity (equivalent statements)                         |
|------------|----------------------------------------------------------|
| 5          | ≥4 members, OR ≥3 members + ≥1 substitute                |
| 4          | ≥3 members, OR ≥2 members + ≥1 substitute                |
| 3          | ≥2 members, OR ≥1 member + ≥1 substitute                 |

The 3-player case allows a thinner roster (1 member + 1 sub) by
design; 3-player teams have less roster headroom and the grace-of-one
rule preserves continuity through a single departure.

**Default enforcement behavior:** unless overridden at pre-flight and
recorded in `DECISIONS.md`, a mutation that would leave a team in an
invalid state **MUST FAIL** with a full-sentence error message. No
implicit transition to a `paused` or recovery status occurs by default.
A future alternative is tracked in §17.

### 8.3 Promotion semantics

- **Promotion is explicit only.** Two events are required:
  1. Departing member's `leftAt` is set
  2. A substitute's `role` updates from `'substitute'` to `'member'`
     in a separate event record
- No implicit or automatic promotion on departure. The captain (or an
  operator under §9) must take the action.

### 8.4 Acceptance constraint

- Initial creation requires explicit acceptance by every initial
  member (§10 Creation). No silent enrollment.

### 8.5 Active cohort exclusivity

- By default, a player may belong to **at most one `active` team per
  `teamSize` value**.
- Belonging to multiple `active` teams of *different* `teamSize` values
  is permitted, since each represents a distinct gameplay format
  (e.g., a 3-player cohort that meets on weeknights and a 5-player
  cohort that meets on weekends).
- Within a single `teamSize`, a player's cooperative cohort identity
  is singular while any of their teams remain `active`.

Whether this same-size exclusivity should ever be loosened is tracked
in §17. Until that question is reopened with an explicit DECISIONS.md
entry, the rule is enforced.

---

## 9. Authority & Overrides

- The **captain** may:
  - Rename the team
  - Change the team `visibility`
  - Initiate invitations
  - Record membership changes (joins, departures, role promotions)
  - Initiate transition to `completed` before `endDate`
- **Operator override** (admin) may:
  - Reassign the captain (e.g., when a captain becomes inactive)
  - Force-retire a team
  - Correct clerical errors in membership records via amendment
    (mirrors [DESIGN-RANKING.md §10.2](../DESIGN-RANKING.md) archive
    amendment pattern: new record with new identifier, never in-place
    edit)
- Every override action requires a recorded `reason` text and operator
  identity, preserved on the event log.

This prevents deadlock if a captain becomes inactive mid-cohort while
keeping all mutations attributable.

---

## 10. Lifecycle

### Creation

- Initiated by captain
- Captain declares `teamSize` at creation; the field is immutable for
  the team's lifetime
- Requires explicit acceptance by every initial member (no
  silent enrollment)
- Team enters `active` status

### Active Changes

- Membership changes require explicit events (timestamped, attributed,
  optional `reason`)
- Historical entries are preserved verbatim — no in-place edits
- `teamSize` is **not** an active-change target. A captain who wants
  to play a different format must retire the current team and create
  a new one.

### Completion

- Semantic meaning: **natural end** of a cohort.
- At `endDate`, status auto-transitions to `completed`. A captain may
  also transition early (e.g., the cohort finished its planned arc
  ahead of schedule).
- Roster becomes read-only.

### Retirement

- Semantic meaning: **premature or administrative termination** —
  abandoned, dissolved, or operator-force-retired cohorts.
- Manual terminal state, captain-initiated or operator-initiated
  under §9.
- Data remains visible based on `visibility`.

The `completed` / `retired` distinction is observational and exists
to give admin tooling and historical narrative a clean signal. Both
are terminal states; neither permits further roster edits.

---

## 11. Visibility Rules

`visibility` is a three-state enum on the Team entity:

- `public` — visible to all
- `friends` — visible to mutual connections of any current member
- `private` — visible only to current and historical members

No ACL matrices, no per-field permissions. The historical "friends-of"
graph is not part of this WP — `friends` semantics depend on a
friend-graph surface that does not yet exist; if WP-109 lands before
that surface, `friends` collapses to `private` until the graph exists.
That fallback is an implementation detail to confirm at execution-time
pre-flight.

Visibility is evaluated **at read time**, not cached or persisted per
viewer. There is no historical visibility ledger — a profile read
returns whatever the team's *current* `visibility` value permits for
the requesting viewer. This keeps the surface honest (no stale or
"replayed" visibility states) and prevents future drift into
per-viewer ACL caches.

---

## 12. Team-Play Attribution (Deferred but Intentional)

This WP defines *who is affiliated with whom*, not how cooperative
play is attributed.

To fulfill the broader goal of **tracking team play**, a follow-on
projection is anticipated but not in scope here:

> When ≥2 active members of the same team appear in a cooperative
> run **of the team's declared `teamSize`**, that run may optionally
> be attributed to the team for observational statistics (e.g., "this
> team played 14 cooperative runs together in their 2026 cohort").

Constraints any such follow-on must satisfy:

- Attribution is **format-aware**: a 5-player team's run is attributed
  only when the run is itself 5-handed; it is not attributed to a
  3-handed run that happens to involve some of its members.
- Attribution does **not** affect scoring, ranking, or any comparison
  surface (preserves §4 Vision Alignment and DESIGN-RANKING §12)
- Attribution is **query-derived** from existing run records joined
  against team membership at run time, not authoritative state stored
  on the run
- Attribution is **opt-in or default-on at the team level**, never
  forced individually
- Attribution will be scoped as a **separate WP** (provisionally
  WP-110 or later) dependent on WP-109 landing first

This deferral is intentional: the identity layer can be designed,
validated, and shipped without committing to the attribution
question, and the attribution question can be answered with live data
once teams exist.

---

## 13. Migration & Compatibility

- Existing player profiles receive empty `teamAffiliations: []`
- No backfill, no inferred memberships from co-play history
- No retroactive team creation from past cooperative runs
- Historical integrity preserved — pre-WP-109 runs carry no team
  attribution and never will

---

## 14. Risks & Mitigations

| Risk                                  | Mitigation                                                        |
| ------------------------------------- | ----------------------------------------------------------------- |
| Drift into guild-like systems         | Explicit non-goals (§3) and layer boundary (§5)                   |
| Season-semantics collision            | `cohortLabel` avoids the DESIGN-RANKING.md §2 Season entity       |
| Captain-abandonment deadlock          | Operator override defined (§9)                                    |
| Silent attribution drift into ranking | §12 explicit deferral; any future projection requires its own WP  |
| Friend-graph dependency               | `friends` visibility falls back to `private` until graph exists   |
| Format drift within a single team     | `teamSize` immutable post-creation (§6, §10)                      |

---

## 15. Acceptance Criteria

1. Team affiliation visible on player profiles, with `teamSize` shown
   alongside the team name (read surface).
2. Historical memberships preserved verbatim after team `completed`
   or `retired`.
3. No engine, registry, ranking, or gameplay code references the team
   data model (verified by grep against `packages/game-engine/`,
   `packages/registry/`, and any ranking-aggregation source).
4. All team mutations (create, member-add, member-leave, role-change,
   rename, status-change, captain-change) produce auditable event
   records with timestamp + actor + optional reason.
5. No competitive framing introduced in any user-facing copy
   (no "match," "opponent," "win/loss," "standings between teams").
6. The `teamSize` field is rejected by validation if set to any value
   other than `3`, `4`, or `5` at creation, and is rejected on any
   subsequent update attempt.
7. The validity rule (§8.2) is enforced at creation and on every
   membership mutation; transitions that would leave a team invalid
   **fail with a full-sentence error message** (default per §8.2).
   Any alternative recovery-state behavior requires an explicit
   DECISIONS.md entry and EC update before the override is honored.
8. Operator-override audit rows are distinguishable from
   captain-driven rows in the audit log (operator identity field
   populated; `reason` text non-empty).
9. Migration leaves every pre-existing profile row with
   `teamAffiliations: []` (verified by SQL count comparison
   pre/post migration).
10. The captain is always a current `member` of the team and exactly
    one `captainPlayerId` exists per team at all times. Attempts to
    set a captain who is not currently in `role: 'member'` (e.g., a
    substitute, a former member, or a non-member) fail validation.
11. No team-membership record exists where `joinedAt > leftAt`. All
    membership timelines are monotonic and validated at write time
    (rejects backdated `leftAt` predating `joinedAt`, and rejects
    rewriting `joinedAt` after a `leftAt` has been recorded).
12. A player has **at most one `active` team per `teamSize` value**
    at any moment (§8.5). Attempts to add a player to a second
    `active` team of the same `teamSize` fail validation.

---

## 16. Execution Checklist (Separate File)

Tracked in:
[`docs/ai/execution-checklists/EC-115-team-affiliation.checklist.md`](../execution-checklists/EC-115-team-affiliation.checklist.md)

The EC extracts the most drift-prone elements (locked field names,
the `cohortLabel`-not-`seasonLabel` rename, the `teamSize` enum,
the parameterized validity rule, the visibility enum values, the §9
operator-override authority statement) into a quick-reference format
per [`docs/ai/REFERENCE/01.1-how-to-use-ecs-while-coding.md`](../REFERENCE/01.1-how-to-use-ecs-while-coding.md).

---

## 17. Open Questions (Tracked, Not Blocking)

- **Friend-graph dependency:** does a friend-graph surface exist by
  the time WP-109 executes, or does `friends` visibility collapse to
  `private`? Resolvable at pre-flight.
- **Auto-promotion of substitute on member departure:** §8.3 currently
  requires explicit promotion. Confirm this is the desired UX before
  schema lock — a one-event "departure-triggers-promotion" flow may
  be preferable for captains' day-to-day ergonomics.
- **Cohort overlap rule (cross-size):** **resolved by default in §8.5**
  — different `teamSize` values represent different gameplay formats
  and are not mutually exclusive, so a player may belong to multiple
  `active` teams when their `teamSize` values differ. Preserved here
  only to track whether the rule should ever be tightened (e.g., to
  cap total active-team count) in a future WP; tightening requires
  an explicit DECISIONS.md entry.
- **Cohort overlap rule (same-size):** **resolved by default in §8.5**
  — a player may belong to at most one `active` team per `teamSize`.
  This question is preserved here only to track whether the rule
  should ever be loosened in a future WP; reopening requires an
  explicit DECISIONS.md entry.
- **Cohort rollover:** does an `active` team automatically create a
  successor team for the next `cohortLabel`, or must each cohort be
  initiated explicitly? Default reading: explicit creation only.
- **Invalidity recovery state:** **resolved by default in §8.2** —
  mutations that would leave a team invalid fail with a full-sentence
  error. A future alternative (`paused` status or similar recovery
  state) is defensible but requires an explicit DECISIONS.md entry
  and EC update before the override is honored.

---

## Verdict

This document is Vision-safe, layer-correct, and governance-aligned.
It properly distinguishes:

- **Roster definition (this WP)** — identity, history, audit trail
- **Team-play attribution (future projection)** — observational
  statistics derived from existing run records, scoped as a separate
  WP that depends on this one

Variable team size (3 / 4 / 5) is supported as an immutable
declaration at creation, mapping to Legendary's three meaningful
cooperative formats.

---

# Lint-Required Sections

> **Purpose of this block:** the design content above (§1–§17) is the
> authoritative narrative. The sections below satisfy the structural
> requirements of
> [`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`](../REFERENCE/00.3-prompt-lint-checklist.md)
> §1 by name and cross-reference the design content. Where a lint
> section duplicates a design section, the design section wins on
> conflict; the lint section exists for grep-discoverability and
> structural completeness.

## Goal

After this session, the Server persistence layer exposes a
team-affiliation data model (Team entity + audit log + profile
extension), the migration adds the supporting tables idempotently,
and a player's public profile page composes their team affiliations
into a read-only display block. Captains can create, edit, and
complete teams via authenticated HTTP routes; operators can perform
overrides via admin routes (gated by a future admin-auth WP — until
that lands, override paths exist in code but are not exposed by HTTP).
No engine, registry, or pre-planning code is touched. No ranking,
scoring, comparison, or rewards surface is introduced.

## Assumes

- **WP-104 complete.** Specifically:
  - `legendary.player_profiles` table exists with WP-104's locked
    column set
  - `apps/server/src/profile/` module exists and exports the
    profile-composition function reused by WP-102
  - The `PlayerProfile` shape is extensible (the `teamAffiliations[]`
    field is additive)
- **WP-052 complete** (player identity + `legendary.players`).
- **WP-101 complete** (handle claim flow; `findAccountByHandle` available).
- **WP-102 landed** — the profile page component (Vue) exists and is
  the reuse target for the team-affiliation read surface.
- **No friend-graph surface yet.** WP-109 ships with `friends`
  visibility falling back to `private` at read time. A future WP that
  introduces the friend graph removes the fallback in a follow-up edit.
- **No admin-auth surface yet.** Operator-override code paths exist
  but are not HTTP-exposed until the admin-auth WP lands.
- **`pnpm -r build` exits 0** post-WP-104 baseline.
- **`pnpm test` baseline** must be captured at pre-flight (depends on
  the exact test counts WP-104 leaves behind).

If any of the above is false, this packet is **BLOCKED** and must
not proceed.

## Context (Read First)

- [`docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"`](../ARCHITECTURE.md)
  — server/persistence layer rules; no engine/registry/preplan touch.
- [`docs/ai/ARCHITECTURE.md §"Persistence Boundaries"`](../ARCHITECTURE.md)
  — `G`/`ctx` are runtime-only; team data is server-layer state only.
- [`.claude/rules/architecture.md §"Layer Boundary"`](../../.claude/rules/architecture.md)
  — runtime enforcement of the above.
- [`.claude/rules/work-packets.md`](../../.claude/rules/work-packets.md)
  — one packet per session, dependency discipline.
- [`docs/01-VISION.md §3, §4, §23(b), §25`](../../01-VISION.md)
  — Vision clauses cited in §4 of this WP.
- [`docs/ai/DESIGN-RANKING.md §2, §4.1, §10.2, §12`](../DESIGN-RANKING.md)
  — Season terminology collision (§2), layer ownership precedent
  (§4.1), amendment pattern (§10.2), team-rankings deferral (§12).
- [`docs/ai/work-packets/WP-104-*.md`](.) (when drafted) — profile
  schema and migration this WP extends.
- [`docs/ai/work-packets/WP-102-public-profile-page.md`](WP-102-public-profile-page.md)
  — page-composition pattern reused for the read surface.
- [`docs/ai/REFERENCE/00.6-code-style.md`](../REFERENCE/00.6-code-style.md)
  — full English words, JSDoc on every function, named imports only,
  full-sentence error messages, no `.reduce()` for branching.
- [`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`](../REFERENCE/00.3-prompt-lint-checklist.md)
  — Vision Alignment block requirement (satisfied by §4 above).
- [`docs/ai/DECISIONS.md`](../DECISIONS.md) — scan for D-0005,
  D-9701..D-9905, and any team/profile-related entries that landed
  between draft and execution.

## Scope (In)

- New server module: `apps/server/src/teams/` (types, logic, routes,
  tests). Module exports include `TeamId` branded type per pre-flight
  PS-14.
- New migration: `data/migrations/010_create_teams_and_membership.sql`
  (slot 010 assigned per pre-flight PS-4; team table + member events
  table + audit log table; idempotent; `ON DELETE CASCADE` chain
  through `legendary.players`; `legendary.team_member_events` carries
  a denormalized `team_size int NOT NULL CHECK (team_size IN
  (3, 4, 5))` column per OQ-4 = (a) user pre-lock 2026-05-03,
  enabling the simple `(player_id, team_size) WHERE left_at IS NULL`
  UNIQUE partial index for same-size exclusivity defense in depth).
- Public Profile DTO extension: `apps/server/src/profile/profile.types.ts`
  and `apps/server/src/profile/profile.logic.ts` updated to compose
  `teamAffiliations[]` into WP-102's `PublicProfileView` (4 → 5 keys).
  Co-located drift test at `profile.logic.test.ts:168–173` updated in
  the same commit per pre-flight PS-6.
- Owner Profile DTO extension (per PS-3 = YES user pre-lock
  2026-05-03): `apps/server/src/profile/ownerProfile.types.ts` and
  `apps/server/src/profile/ownerProfile.logic.ts` updated to compose
  `teamAffiliations[]` into WP-104's `OwnerProfileView` (7 → 8 keys),
  read-only. Co-located drift test at
  `ownerProfile.logic.test.ts:146–155` updated likewise.
- Owner-side read-only "your teams" block (per PS-3 = YES user
  pre-lock 2026-05-03): `apps/arena-client/src/pages/MyProfilePage.vue`
  modified to render the listing in a new region using the existing
  `defineComponent({ setup() {...} })` wrapper (no `<script setup>`
  switch per D-6512 / P6-30).
- Same-commit route wiring: `apps/server/src/server.mjs` updated to
  call `registerTeamRoutes(server.router, pool, deps)` per the
  WP-104 D-10408 precedent.
- Public profile page: `apps/arena-client/src/pages/PlayerProfilePage.vue`
  (corrected path per pre-flight PS-5; `PublicProfile.vue` does not
  exist) renders a read-only team-affiliation block.
- D-11804 catalog update: `docs/ai/REFERENCE/api-endpoints.md` gains
  8 new `Wired` rows for the new `/api/teams/...` endpoints (per
  pre-flight PS-7).
- Canonical-name registry update:
  `docs/ai/REFERENCE/00.2-data-requirements.md §4.1 Table Inventory`
  gains 3 new rows for `legendary.teams`, `legendary.team_member_events`,
  `legendary.team_audit_log` (per pre-flight PS-8).
- New D-entry classifying `apps/server/src/teams/` as a server-layer
  directory (mirrors D-5202 / D-10301 / D-10201; D-NNNN assigned at
  execution per pre-flight PS-10).

## Out of Scope

(Cross-references §3 Non-Goals; restated here for lint §1
discoverability.)

- Team scoring, rankings, ladders, MMR.
- Rewards, unlocks, badges tied to team membership.
- Engine, registry, or pre-planning code changes.
- Real-time chat, scheduling, or coordination features.
- Monetization or paid surfaces.
- Inter-team comparison or league standings.
- 1-player or 2-player team formats.
- Team-play attribution onto run records (deferred to a future WP per
  §12).
- Avatar upload, badges, integrity admin, payments — all deferred to
  WP-105..WP-108 per their existing placeholders.
- Admin-auth surface (operator-override HTTP exposure) — depends on
  the future admin-auth WP.

## Files Expected to Change

- `apps/server/src/teams/team.types.ts` — **new** — `Team`,
  `TeamMember`, audit-event shapes; `TeamId` branded-type
  (`type TeamId = string & { readonly __brand: 'TeamId' }`,
  mirroring the `AccountId` precedent per pre-flight PS-14);
  `TeamErrorCode` closed union + `TEAM_ERROR_CODES` canonical
  readonly array (drift test in `team.logic.test.ts`); `TeamResult<T>`
  declared locally per the WP-102 / WP-104 PS-5 precedent; Zod
  validators including the `teamSize: 3 | 4 | 5` constraint.
- `apps/server/src/teams/team.logic.ts` — **new** — create / invite /
  accept / member-add / member-leave / role-change / rename /
  visibility-change / status-change / captain-change /
  operator-override paths; parameterized validity rule (§8.2);
  captain-must-be-member validator (§6 / EC-115 Guardrail 11);
  same-size cohort exclusivity check (§8.5 / EC-115 Guardrail 12);
  monotonic-timeline check (AC #11 / EC-115 Guardrail 13);
  multi-row create-team writes wrapped in a single PostgreSQL
  `BEGIN/COMMIT` transaction per the WP-104 D-10407 precedent
  (EC-115 Guardrail 15 per pre-flight PS-11);
  `composeTeamAffiliationsForProfile(playerId, viewerContext)` read
  helper consumed by both `profile.logic.ts` and (per PS-3 default
  YES) `ownerProfile.logic.ts`.
- `apps/server/src/teams/team.routes.ts` — **new** — HTTP routes for
  captain-driven actions; admin-route stubs deferred to admin-auth WP.
- `apps/server/src/teams/team.logic.test.ts` — **new** — drift tests
  (`Team` field-key set, `TEAM_ERROR_CODES` ↔ `TeamErrorCode`) plus
  invariant tests covering the EC-115 Guardrails list (validity
  rules across all three `teamSize` values, captain invariant,
  same-size exclusivity, monotonic timeline, two-event promotion,
  operator-override audit shape, friends-fallback-to-private,
  single-transaction rollback on partial create-team failure,
  pre/post migration row-count parity).
- `data/migrations/010_create_teams_and_membership.sql` — **new** —
  team table, member events table, audit log table; idempotent
  (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`); SQL
  CHECK `(left_at IS NULL OR left_at >= joined_at)` for monotonic
  timeline defense in depth (validator is the primary gate per
  RS-17); UNIQUE partial index on
  `(player_id, team_size) WHERE status='active' AND left_at IS NULL`
  for same-size exclusivity defense in depth (RS-18); `ON DELETE
  CASCADE` chain through `legendary.players`. Migration slot 010
  assigned at pre-flight 2026-05-03 (slot 009 taken by WP-104).
- `apps/server/src/profile/profile.types.ts` — **modified** — extend
  WP-102's `PublicProfileView` with
  `teamAffiliations: TeamAffiliation[]` (4 → 5 keys; column-additive).
- `apps/server/src/profile/profile.logic.ts` — **modified** —
  `getPublicProfileByHandle` composes `teamAffiliations[]` via
  `composeTeamAffiliationsForProfile` from `team.logic.ts` with
  read-time visibility filter; ordering invariant
  `ORDER BY joined_at ASC, team_id ASC` per EC-115 Locked Values
  (pre-flight PS-13).
- `apps/server/src/profile/profile.logic.test.ts` — **modified** —
  extend the 4-key drift test at lines 168–173 to 5 keys
  (`teamAffiliations` added); add an empty-array fixture and a
  populated-array fixture covering the read-time visibility filter
  (per pre-flight PS-6).
- `apps/server/src/profile/ownerProfile.types.ts` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** — extend
  `OwnerProfileView` with `teamAffiliations: TeamAffiliation[]`
  (7 → 8 keys; column-additive, read-only on the owner-edit
  surface).
- `apps/server/src/profile/ownerProfile.logic.ts` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** — `getOwnerProfile`
  composes `teamAffiliations[]` via the same
  `composeTeamAffiliationsForProfile` helper, scoped to the owner
  viewer (always sees own affiliations).
- `apps/server/src/profile/ownerProfile.logic.test.ts` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** — extend the 7-key
  drift test at lines 146–155 to 8 keys (`teamAffiliations` added).
- `apps/server/src/server.mjs` — **modified** — register the new
  team routes via `registerTeamRoutes(server.router, pool, deps)`,
  mirroring the `registerOwnerProfileRoutes(...)` shape per the
  WP-104 D-10408 same-commit-wiring precedent.
- `apps/arena-client/src/pages/PlayerProfilePage.vue` — **modified
  (corrected path per pre-flight PS-5; the original draft cited a
  non-existent `PublicProfile.vue`)** — render team-affiliation
  block (read-only, no competitive copy).
- `apps/arena-client/src/pages/MyProfilePage.vue` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** — render read-only
  "your teams" block in a new region beneath the existing profile
  / links regions; uses the existing
  `defineComponent({ setup() {...} })` wrapper (no `<script setup>`
  switch per D-6512 / P6-30); no edit affordance, no captain-promote
  button, no team-creation CTA (those flow through
  `/api/teams/...` mutations, not through `MyProfilePage.vue`).
- `docs/ai/REFERENCE/api-endpoints.md` — **modified per pre-flight
  PS-7** — add 8 new `Wired` rows per D-11804 for the new
  `/api/teams/...` endpoints. Auth: `handle-required` for the read
  endpoints and `authenticated-session-required` for captain-driven
  mutations; admin operator-override paths are `Library-only` until
  the admin-auth WP exposes them.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified per
  pre-flight PS-8** — add 3 new rows to §4.1 Table Inventory for
  `legendary.teams`, `legendary.team_member_events`,
  `legendary.team_audit_log`. Field-naming convention follows the
  WP-104 precedent: camelCase wire ↔ snake_case SQL.

A new `D-NNNN` entry classifying `apps/server/src/teams/` as a
server-layer directory is added to `docs/ai/DECISIONS.md` at
execution time (mirrors D-5202 for `identity/`, D-10301 for
`replay/`, D-10201 for `profile/`); the D-NNNN number is assigned
when the entry is written. The exact route prefix (recommended
default: `/api/teams`) and the route count (recommended default:
8 endpoints, enumerated in pre-flight Scope Lock) are also
pre-flight items resolved before session prompt generation.

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Never use `Math.random()` — engine randomness uses `ctx.random.*`.
  **N/A here** (no engine touch); preserved for template completeness.
- Never throw inside boardgame.io move functions. **N/A here**.
- Never persist `G`, `ctx`, or any runtime engine state. **N/A here**.
- `G` must be JSON-serializable at all times. **N/A here**.
- `.reduce()` is forbidden in zone operations and effect application;
  in this WP specifically, `.reduce()` must NOT be used to compose
  the team-affiliation list — use explicit `for...of`.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node built-in imports.
- Test files use `.test.ts` extension — never `.test.mjs`.
- Full file contents required for every new or modified file in the
  output — no diffs, no snippets.
- Human-style code per [`docs/ai/REFERENCE/00.6-code-style.md`](../REFERENCE/00.6-code-style.md).

**Packet-specific:**

- **`teamSize` is immutable post-creation.** No code path may UPDATE
  the `team_size` column on an existing team row. Verified by grep
  for `UPDATE.*team_size` returning zero matches.
- **`cohortLabel` is the field name.** Not `seasonLabel`. The rename
  is intentional (DESIGN-RANKING §2 collision) and not negotiable.
- **No in-place edit of historical records.** Clerical corrections
  follow the [DESIGN-RANKING.md §10.2](../DESIGN-RANKING.md)
  amendment pattern — new record with new identifier, original
  preserved.
- **Promotion is two events, not one.** A substitute does not
  auto-promote when a member's `leftAt` is set; the captain (or
  operator) must record both events.
- **`friends` visibility falls back to `private`** server-side when
  no friend-graph surface exists. The fallback is enforced on the
  read path, not by relying on the client.
- **No team attribution written to run records.** No file under
  `apps/server/src/teams/` (or anywhere else this WP touches) may
  add a `teamId` field, column, or join key to any run / match /
  replay record.
- **No competitive vocabulary in user-facing copy.** No "match,"
  "opponent," "win/loss," "standings between teams," "league table."
  Hero-vs-villain "vs" framing remains fine
  (project memory: `feedback_pvp_terminology_scope`).
- **No engine import.** No file under `apps/server/src/teams/` or
  `apps/arena-client/src/pages/PlayerProfilePage.vue` may import
  `boardgame.io`, `@legendary-arena/game-engine`, or
  `@legendary-arena/registry`.
- **No pre-planning import.** `packages/preplan/**` is not imported
  from any WP-109 file.
- **Lifecycle prohibition (locked, mirrors WP-102 / WP-104 RISK #16
  per pre-flight PS-12).** The exported team-logic functions
  (`createTeam`, `recordMembershipChange`, `promoteSubstitute`,
  `reassignCaptain`, `transitionTeamStatus`, `applyOperatorOverride`,
  `composeTeamAffiliationsForProfile`, `registerTeamRoutes`) MUST
  NOT be called from `game.ts`, any `LegendaryGame.moves` entry,
  any phase hook (`onBegin` / `onEnd` / `endIf`), any file under
  `packages/`, any file under `apps/replay-producer/` or
  `apps/registry-viewer/`, or any sibling-server-domain file under
  `apps/server/src/{identity,replay,competition,par,rules,game}/`.
  They are consumed only by their own test file, by `team.routes.ts`
  (route adapter), by `apps/server/src/server.mjs` (one-line
  `registerTeamRoutes(...)` call), by
  `apps/server/src/profile/profile.logic.ts`
  (`composeTeamAffiliationsForProfile` only — for the public-profile
  read surface), and (per PS-3 default YES) by
  `apps/server/src/profile/ownerProfile.logic.ts` (same composer
  helper, scoped to the owner viewer). The arena-client
  `PlayerProfilePage.vue` consumes the data via the
  `PublicProfileView.teamAffiliations[]` projection, never via direct
  team-logic import.

**Session protocol:**

- WP-104 has landed (2026-05-02 at `cea9108`); the previous BLOCK
  on WP-104 is resolved. The remaining gating items are the fourteen
  pre-flight + copilot-check amendments documented in
  `docs/ai/invocations/preflight-wp109.md` (PS-1..PS-14, applied at
  this commit) and the §17 Open Questions resolution at session
  start.
- If pre-flight reveals that the route prefix or D-entry number
  must be assigned ad hoc beyond the pre-flight defaults
  (`/api/teams`, D-NNNN at execution), **stop and ask** rather
  than guessing. Migration slot 010 is locked per pre-flight PS-4.
- If the friend-graph surface has landed since pre-flight (2026-05-03),
  **stop and ask** whether to remove the `friends → private` fallback
  in this same WP or defer to a follow-up.

**Locked contract values:**

- `Team.teamSize`: `3 | 4 | 5` (no other values)
- `Team.status`: `'active' | 'completed' | 'retired'`
- `Team.visibility`: `'public' | 'friends' | 'private'`
- `Team.members[].role`: `'member' | 'substitute'`
- Substitute cap: `min(2, teamSize − 2)` → 1 / 2 / 2
- Validity: `liveMembers ≥ teamSize − 2` AND
  `liveMembers + liveSubs ≥ teamSize − 1`

## Verification Steps

> **Pre-flight note:** the exact `pnpm` filter targets depend on
> WP-104's final package layout. The commands below assume the
> precedent of WP-102 (`@legendary-arena/server` filter). Pre-flight
> reconciles if WP-104 introduced a different filter.

1. `pnpm -r build` exits 0.
2. `pnpm --filter @legendary-arena/server build` exits 0.
3. `pnpm --filter @legendary-arena/server test` exits 0; new tests
   under `apps/server/src/teams/` are listed in the output.
4. `git diff --name-only` shows only files in `## Files Expected to
   Change`.
5. Grep for engine-import leaks (PowerShell):
   `Select-String -Path apps/server/src/teams/*.ts -Pattern '(boardgame\.io|@legendary-arena/game-engine|@legendary-arena/registry)'`
   returns **zero** matches.
6. Grep for ranking-system leaks:
   `Select-String -Path apps/server/src/teams/*.ts -Pattern '(ranking|leaderboard|standings|MMR)'`
   returns **zero** matches.
7. Grep for `seasonLabel` (the forbidden alias):
   `Select-String -Path apps/server/src/teams/*.ts,apps/server/src/profile/*.ts -Pattern 'seasonLabel'`
   returns **zero** matches.
8. Grep for in-place team-size mutation:
   `Select-String -Path data/migrations/*team*.sql,apps/server/src/teams/*.ts -Pattern 'UPDATE.*team_size'`
   returns **zero** matches.
9. Pre-migration profile row count = post-migration profile row count
   (no row loss); every row has `team_affiliations = '[]'::jsonb` (or
   the project's chosen empty representation).

## Definition of Done

- [ ] All §15 Acceptance Criteria pass.
- [ ] All `## Verification Steps` pass with the expected outputs.
- [ ] [`docs/ai/STATUS.md`](../STATUS.md) updated with what landed in
      this session.
- [ ] [`docs/ai/DECISIONS.md`](../DECISIONS.md) updated with the new
      D-entry classifying `apps/server/src/teams/` as a server-layer
      directory; any §17 Open Question resolved during execution
      recorded as its own D-entry.
- [ ] [`docs/ai/work-packets/WORK_INDEX.md`](WORK_INDEX.md) WP-109
      row updated from `(deferred placeholder)` to `[x] Completed
      YYYY-MM-DD`.
- [ ] No files outside `## Files Expected to Change` were modified
      (verified by `git diff --name-only`).
- [ ] EC-115 satisfied — every checkbox under
      [`EC-115-team-affiliation.checklist.md`](../execution-checklists/EC-115-team-affiliation.checklist.md)
      is checked or has a documented exception.

---

## Lint Self-Review

Self-reviewed against
[`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`](../REFERENCE/00.3-prompt-lint-checklist.md)
on 2026-04-26:

- §1 (structure): all required sections present (`Goal`, `Assumes`,
  `Context (Read First)`, `Scope (In)`, `Out of Scope`, `Files
  Expected to Change`, `Non-Negotiable Constraints`, `Acceptance
  Criteria`, `Verification Steps`, `Definition of Done`). **PASS**
- §2 (constraints block): engine-wide + packet-specific + session
  protocol + locked contract values all present; references
  `00.6-code-style.md`. **PASS**
- §3 (Assumes): WP-104, WP-052, WP-101, WP-102 listed; build/test
  baseline noted as pre-flight. **PASS**
- §4 (Context): specific docs and sections cited. **PASS**
- §5 (Files Expected to Change): 8 files listed with new/modified
  markers, each with one-line description. Within the ≤8 cap. **PASS**
- §6 (naming): `cohortLabel`, `teamSize`, `teamAffiliations`,
  `Team.status`, `Team.visibility` consistent throughout. **PASS**
- §7 (dependencies): no new npm dependencies introduced; forbidden
  packages not used. **PASS**
- §8 (architectural): server-layer only; engine/registry/preplan
  forbidden by Non-Negotiable Constraints. **PASS**
- §9 (Windows): verification steps use PowerShell `Select-String`.
  **PASS**
- §10 (env vars): no new env vars introduced. **N/A**
- §11 (auth): admin-route HTTP exposure deferred to future admin-auth
  WP; captain-driven HTTP routes use the same auth model as WP-104.
  **PASS** (no auth-model ambiguity).
- §12 (tests): tests use `node:test`; no boardgame.io import. **PASS**
- §13 (verification commands): exact `pnpm` and PowerShell commands
  given. **PASS**
- §14 (acceptance criteria): 12 binary observable items. **PASS**
  (at upper bound of 6–12 range; expanded 2026-05-03 to lock captain
  invariant, monotonic-timeline check, and same-size exclusivity that
  were previously implicit)
- §15 (Definition of Done): includes STATUS / DECISIONS /
  WORK_INDEX updates and scope-boundary check. **PASS**
- §16 (code style): WP body references `00.6-code-style.md`; no
  abbreviations or magic identifiers in the WP itself. **PASS**
- §17 (Vision Alignment): §4 above provides the required block with
  clause numbers, conflict assertion, non-goal proximity check, and
  determinism preservation note. **PASS**
- §18 (prose-vs-grep): verification step 7 greps for `seasonLabel`;
  prose mentions `seasonLabel` in §7 with the rationale rather than
  enumerating it as a forbidden token list. Cite-by-clause discipline
  preserved. **PASS**
- §19 (bridge-vs-HEAD): N/A at draft time; applies at commit time.

**Overall: PASS.** Ready for promotion to executable when WP-104
lands and pre-flight items are resolved.
