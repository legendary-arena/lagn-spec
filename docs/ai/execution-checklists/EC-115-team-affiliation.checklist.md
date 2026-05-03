# EC-115 — Team Affiliation (Execution Checklist)

**Source:** [docs/ai/work-packets/WP-109-team-affiliation.md](../work-packets/WP-109-team-affiliation.md)
**Layer:** Server (persistence) + App (read surfaces on profile page)
**Status:** DRAFT — executable upon resolution of the fourteen
pre-flight + copilot-check amendments documented in
`docs/ai/invocations/preflight-wp109.md` (2026-05-03; HOLD
disposition). **Hard dependency on WP-104 satisfied 2026-05-02 at
`cea9108`** (WP-104 / EC-128 landed; `legendary.player_profiles` +
`legendary.player_links` + migration 009 + the `OwnerProfileView`
type contracts are now present in `main`). WP-109's lint-gate
self-review reports **PASS** (see WP-109 §"Lint Self-Review" at
the foot of that file). Only the fourteen amendments and the
remaining `## Open Questions` items in `## Before Starting` below
stand between this EC and executable status.

> *Renumbered from EC-109 to EC-115 on 2026-04-27 per filename collision
> with the older `EC-109-delete-unused-auxiliary-metadata.checklist.md`
> (executed 2026-04-21, cited as introducing packet by 8 immutable
> DECISIONS.md entries: D-8401, D-8402, A-084-01 amendments, D-8304
> cross-reference). Follows the EC-103 → EC-111 retarget precedent.
> WP number unchanged (still WP-109); only the EC slot moved.*

> **Authority reminder:** This EC is the execution contract once WP-109
> is promoted to executable. Until then, both files are design artifacts.
> If the EC and WP conflict on design, the **WP wins**. ECs are
> subordinate to `docs/ai/ARCHITECTURE.md` and `.claude/rules/*.md`.

---

## Before Starting

- [ ] WP-109 lint-gate self-review confirmed **PASS** at execution
      time (currently PASS at draft per WP-109 §"Lint Self-Review",
      with 12 Acceptance Criteria — at the upper bound of the 6–12
      range). Re-confirm at session start in case any §17 Open
      Question resolved between pre-flight (2026-05-03) and execution
      introduced new ACs.
- [ ] WP-109 row in `docs/ai/work-packets/WORK_INDEX.md` reflects the
      post-WP-104 ready state (PS-2 amendment applied 2026-05-03).
- [x] WP-104 (Owner Profile Data Model & `/me` Edit) — **LANDED
      2026-05-02 at `cea9108`** (`EC-128:`). Migration 009 +
      `legendary.player_profiles` + `legendary.player_links` +
      `OwnerProfileView` / `OwnerProfileLink` / `OwnerProfileResult<T>`
      type contracts are present in `main`. Re-verify at session
      start with `git show cea9108 --stat` if any doubt arises.
- [ ] **Test baseline lock (per pre-flight PS-9):** capture server
      test baseline at session start —
      `pnpm --filter @legendary-arena/server test` should report
      **`pass 82 / fail 0 / skipped 42`** (post-WP-104). Engine
      test baseline: **`pass 604 / fail 0`**. If observed counts
      differ, surface as a pre-flight finding before continuing.
- [ ] **Fourteen pre-flight amendments** (PS-1..PS-14) verified in
      place across WP-109, EC-115, and WORK_INDEX.md per
      `docs/ai/invocations/preflight-wp109.md` §"Summary of Required
      Fixes" table. (Applied 2026-05-03 in the same commit; verify
      at session start in case of merge conflict.)
- [ ] WP-109 `## Open Questions` resolved (or explicitly deferred with
      DECISIONS.md entries). After the 2026-05-03 review-pass amendment,
      several previously-open questions are now defaults locked into
      the WP body — only the truly open items below need pre-flight
      resolution:
      - friend-graph existence at execution time (governs `friends`
        visibility fallback per WP-109 §11)
      - substitute auto-promotion ergonomics (default: explicit only;
        confirm before schema lock)
      - cohort rollover (default: explicit creation only)

      The following are now **defaults locked in the WP** and need
      pre-flight resolution **only if the executor wants to deviate**
      (deviation requires a DECISIONS.md entry):
      - **Cross-size cohort overlap:** permitted (WP-109 §8.5)
      - **Same-size cohort exclusivity:** at most one active team per
        `teamSize` per player (WP-109 §8.5; AC #12)
      - **Invalidity recovery state:** mutation fails with a
        full-sentence error (WP-109 §8.2; AC #7)
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0

---

## Locked Values (do not re-derive)

**Field names — verbatim:**

- `cohortLabel` (NOT `seasonLabel` — collides with DESIGN-RANKING §2 Season)
- `teamId` (immutable identifier; never reused after retirement;
  branded type per pre-flight PS-14 — see "TeamId branded-type"
  block below)
- `teamSize` (immutable post-creation; literal type `3 | 4 | 5`)
- `captainPlayerId`
- `teamAffiliations` (the profile-side projection added by WP-109 to
  WP-102's `PublicProfileView` and — per pre-flight PS-3 default
  YES — to WP-104's `OwnerProfileView`; carries `teamSize` for
  display; ordering invariant locked below)

**`TeamId` branded type (per pre-flight PS-14):**

- Declared in `apps/server/src/teams/team.types.ts`:
  `type TeamId = string & { readonly __brand: 'TeamId' }`.
- Mirrors the `AccountId` brand from
  `apps/server/src/identity/identity.types.ts` per the WP-052
  D-5201 precedent.
- Every API boundary that handles team identifiers (route
  parameters, JSON bodies, validator inputs, SQL parameters)
  uses `TeamId` — never bare `string`. A constructor function
  `toTeamId(raw: string): TeamId` does runtime validation
  (UUID v4 shape) and casts; the validator rejects malformed
  inputs with `code: 'invalid_request'`.

**`teamAffiliations[]` ordering invariant (per pre-flight PS-13):**

- Server-authoritative ordering: ascending by `joinedAt`, with
  `teamId` as tiebreaker.
- Locked SQL clause in `composeTeamAffiliationsForProfile`:
  `ORDER BY joined_at ASC, team_id ASC`.
- Drift test in `team.logic.test.ts` asserts ascending `joinedAt`
  on every populated-array fixture; clients MUST NOT defensively
  re-sort. Mirrors the WP-104 D-10407 `OwnerProfileView.links`
  ordering precedent.

**Enum values — verbatim:**

- `Team.teamSize`: `3 | 4 | 5` (no other values; no 1/2/6+)
- `Team.status`: `'active' | 'completed' | 'retired'`
- `Team.visibility`: `'public' | 'friends' | 'private'`
- `Team.members[].role`: `'member' | 'substitute'`

**Roster constraints (parameterized by `teamSize`):**

| `teamSize` | Members at full roster | Max substitutes |
|------------|------------------------|-----------------|
| 3          | 3                      | 1               |
| 4          | 4                      | 2               |
| 5          | 5                      | 2               |

Substitute cap formula: `min(2, teamSize − 2)`.

**Validity rule (generalized, do not re-derive):**

- `liveMembers ≥ teamSize − 2`, AND
- `liveMembers + liveSubs ≥ teamSize − 1`

Concrete expansion (for grep / sanity check):

| `teamSize` | Equivalent statement                                 |
|------------|------------------------------------------------------|
| 5          | ≥4 members, OR ≥3 members + ≥1 substitute            |
| 4          | ≥3 members, OR ≥2 members + ≥1 substitute            |
| 3          | ≥2 members, OR ≥1 member + ≥1 substitute             |

Where `liveMembers` and `liveSubs` count records whose `leftAt` is unset.

**Validity-violation default behavior (per WP-109 §8.2):**

- A mutation that would leave a team invalid **MUST FAIL** with a
  full-sentence error message. No implicit transition to a `paused`
  or recovery status.
- A future alternative recovery state requires an explicit
  DECISIONS.md entry and EC update before the override is honored;
  do not preemptively implement one.

**Captain invariant (per WP-109 §6, §9):**

- Exactly **one** `captainPlayerId` per team at all times.
- Captain MUST be a current `member` (role `'member'`) — never a
  `substitute`, never a former member with `leftAt` set.
- Captain reassignment under §9 must select a current member.

**Active cohort exclusivity (per WP-109 §8.5):**

- A player may belong to **at most one `active` team per `teamSize`
  value** at any moment.
- Multiple `active` teams across **different** `teamSize` values is
  permitted (different gameplay formats).
- **Storage strategy locked by user 2026-05-03 (OQ-4 = (a); folded
  into D-10906):** denormalize `team_size int NOT NULL CHECK
  (team_size IN (3, 4, 5))` into `legendary.team_member_events`,
  INSERT-time copied from `legendary.teams.team_size`. The UNIQUE
  partial index becomes the simple
  `(player_id, team_size) WHERE left_at IS NULL` form. The denormalized
  column is structurally immutable post-INSERT — no UPDATE path in
  `team.logic.ts` may touch it.

**Membership timeline monotonicity (per WP-109 §15 AC #11):**

- For every membership record: `joinedAt ≤ leftAt` (when `leftAt`
  is set).
- Backdated `leftAt` predating `joinedAt` is rejected at write time.
- Once `leftAt` is recorded, `joinedAt` cannot be rewritten.

**Vision citations — verbatim:**

- §3 (Player Trust & Fairness)
- §4 (Faithful Multiplayer Experience)
- §23(b) (Asynchronous PvP Comparison; no in-game player-vs-player)
- §25 (Skill Over Repetition)

**Decision references — verbatim:**

- D-0005: *"Asynchronous PvP Comparison Authorized; Live PvP Combat
  Forbidden"* (per [DESIGN-RANKING.md:14-20](../DESIGN-RANKING.md))
- DESIGN-RANKING.md §12: *"Team, faction, or cooperative co-op
  rankings"* listed as out-of-scope future work

---

## Guardrails

1. **No engine touch.** No file under `packages/game-engine/`,
   `packages/registry/`, or `packages/preplan/` may import or
   reference team data shapes. Verified by grep at acceptance time.
2. **No comparison surface.** No code path may project team
   membership into a ranking, leaderboard, score, or other
   inter-team comparison. This is the load-bearing Vision-alignment
   guarantee — violating it converts WP-109 into a DESIGN-RANKING §12
   amendment, which it is not.
3. **No in-place edit of historical records.** Clerical corrections
   follow the [DESIGN-RANKING.md §10.2](../DESIGN-RANKING.md) archive
   amendment pattern: new record with new identifier, original
   preserved. The data model must make in-place mutation
   *impossible*, not merely *discouraged*.
4. **Promotion is explicit.** A substitute does not auto-promote when
   a member's `leftAt` is set. Promotion requires a separate event
   (departing member's `leftAt` AND substitute's `role` change to
   `'member'`). Two events, two records.
5. **Operator override requires a `reason` text and operator
   identity.** No anonymous or reasonless override path exists.
   Captain-driven mutations are distinguishable from operator-driven
   mutations in the audit log.
6. **`friends` visibility falls back to `private`** at read time when
   no friend-graph surface exists. The fallback is enforced server-side
   on the read path, not by relying on the client to behave.
7. **No team attribution written to run records.** WP-109 §12 defers
   team-play attribution to a separate WP and constrains it to be
   query-derived, never authoritative state on the run record.
   Adding any `teamId` field to a run / match / replay record in this
   WP is a scope violation.
8. **No competitive vocabulary in user-facing copy.** No "match,"
   "opponent," "win/loss," "standings between teams," "league table."
   Hero-vs-villain "vs" framing remains fine
   (see project memory `feedback_pvp_terminology_scope`).
9. **`teamSize` is immutable post-creation.** No code path may
   `UPDATE` the `team_size` column on an existing team row. A
   captain who wants to change formats must retire the team and
   create a new one. Verified by grep for `UPDATE.*team_size`
   returning zero matches across migrations and server code.
10. **`teamSize` validation rejects out-of-range values.** Zod
    validators reject any `teamSize` not in `{3, 4, 5}` at creation
    AND on any subsequent attempted update (defense in depth — even
    if the route layer never exposes update, the validator does
    not permit it).
11. **Captain must be a current member.** Validation rejects any
    captain assignment (creation or §9 reassignment) where the
    target `playerId` is not currently in `role: 'member'` with
    `leftAt` unset. Exactly one `captainPlayerId` per team — there
    is no "co-captain" or null-captain state.
12. **Same-size cohort exclusivity.** Adding a player to a team
    whose `status='active'` and `teamSize=N` is rejected if that
    player already belongs to another `active` team with the same
    `teamSize=N`. Cross-`teamSize` overlap remains permitted.
13. **Monotonic membership timeline.** Validation rejects any
    membership write where `leftAt < joinedAt`, and rejects any
    attempt to UPDATE `joinedAt` once `leftAt` has been recorded
    on the same membership record. Verified by an invariant test
    that constructs the bad case and asserts it fails.
14. **Validity-violation default is fail.** When a mutation would
    leave a team in an invalid state per the rule above, the
    mutation fails with a full-sentence error. Do not implement a
    `paused` / recovery status path unless pre-flight produced an
    explicit DECISIONS.md override.
15. **Multi-row create-team writes are wrapped in a single
    transaction (per pre-flight PS-11).** The `createTeam` path
    must execute the team-row INSERT, every initial member-event
    INSERT, the audit-log INSERT, and every initial-acceptance
    event INSERT inside one PostgreSQL `BEGIN/COMMIT` transaction,
    mirroring the WP-104 D-10407 replace-all-by-list transaction
    wrapping precedent. Mid-write failure must roll back the
    entire create operation; partial team state (e.g., a team
    row visible without its captain's member event) is
    structurally impossible. Verified by an invariant test that
    injects a write failure on the second row and asserts no
    rows are visible post-rollback. Single-statement reads
    (`getTeam`, `composeTeamAffiliationsForProfile`) are not
    required to use an explicit transaction.

---

## Required `// why:` Comments

- **Server: `cohortLabel` field declaration** — explain the rename
  from `seasonLabel` and link to DESIGN-RANKING.md §2 Season collision.
- **Server: `teamSize` field declaration** — explain why size is
  declared at creation and immutable; cite WP-109 §6 (Legendary's
  cooperative gameplay scales with player count, so a "team" that
  drifts between 3-handed and 5-handed play is not coherent).
- **Server: parameterized validity check** — explain the
  `liveMembers ≥ teamSize − 2 AND liveMembers + liveSubs ≥ teamSize − 1`
  formula; cite WP-109 §8.2 and note the grace-of-one design
  (a single departure does not invalidate the team).
- **Server: `friends` visibility fallback branch** — explain the
  fallback to `private` when no friend-graph surface exists; cite
  WP-109 §11.
- **Server: amendment-record creation path** — explain the "new
  record, original preserved" pattern; cite DESIGN-RANKING.md §10.2
  precedent.
- **Server: validity check (`≥4 members OR ≥3 members + ≥1 sub`)** —
  explain the asymmetry (a sub counts as one of the four minimum
  but not as a primary, mirroring bowling-league grace rules).
- **Server: any place team membership is read in a non-team context**
  — explain why (e.g., profile composition for WP-102 reuse) and
  confirm no scoring or ranking layer is the consumer.
- **Server: captain-must-be-member validator** — explain why a
  substitute or former member cannot be captain; cite WP-109 §6
  (captain invariant) and §9 (captain authority — operator override
  reassignment must select a current member).
- **Server: same-size active-cohort exclusivity check** — explain
  the rule (one active team per `teamSize` per player) and cite
  WP-109 §8.5; note that cross-`teamSize` overlap is permitted by
  design.
- **Server: validity-violation failure path** — explain that the
  mutation fails (default per WP-109 §8.2) rather than transitioning
  the team to a recovery state; note that an override would require
  a DECISIONS.md entry.

---

## Files to Produce

> **Reminder:** WP-109 includes a `## Files Expected to Change`
> section (expanded under pre-flight PS-4..PS-8 / PS-10 on
> 2026-05-03). The list below mirrors that section verbatim. If
> the two ever diverge, **the WP wins** per the authority
> reminder at the top of this file.

- `apps/server/src/teams/team.types.ts` — **new** — `Team`,
  `TeamMember`, audit-event shapes; `TeamId` branded type
  (PS-14); `TeamErrorCode` closed union + `TEAM_ERROR_CODES`
  canonical readonly array; `TeamResult<T>` declared locally;
  Zod validators.
- `apps/server/src/teams/team.logic.ts` — **new** — create /
  invite / accept / member-add / member-leave / role-change /
  rename / visibility-change / status-change / captain-change /
  operator-override paths; captain-must-be-member validator
  (Guardrail 11); same-size cohort exclusivity check
  (Guardrail 12); monotonic-timeline check (Guardrail 13);
  multi-row create-team writes wrapped in a single
  `BEGIN/COMMIT` transaction (Guardrail 15);
  `composeTeamAffiliationsForProfile(playerId, viewerContext)`
  read helper.
- `apps/server/src/teams/team.routes.ts` — **new** — HTTP routes
  for captain and operator surfaces; read endpoint(s) for
  profile-page composition. Recommended default prefix
  `/api/teams`; 8-endpoint set enumerated in pre-flight Scope
  Lock.
- `apps/server/src/teams/team.logic.test.ts` — **new** — drift
  tests + invariant tests covering the §Guardrails list
  (validity rules, captain invariant, same-size exclusivity,
  monotonic timeline, two-event promotion, friends fallback,
  audit completeness, single-transaction rollback on partial
  create-team failure, pre/post migration row-count parity).
- `data/migrations/010_create_teams_and_membership.sql` —
  **new (slot 010 per PS-4)** — schema for team table, member
  events table, audit log table; idempotent
  (`CREATE TABLE IF NOT EXISTS`); SQL CHECK
  `(left_at IS NULL OR left_at >= joined_at)` for monotonic
  timeline defense in depth; UNIQUE partial index on
  `(player_id, team_size) WHERE status='active' AND left_at IS NULL`
  for same-size exclusivity defense in depth; `ON DELETE
  CASCADE` chain through `legendary.players`.
- `apps/server/src/profile/profile.types.ts` — **modified** —
  extend WP-102's `PublicProfileView` (4 → 5 keys) with
  `teamAffiliations: TeamAffiliation[]`.
- `apps/server/src/profile/profile.logic.ts` — **modified** —
  `getPublicProfileByHandle` composes `teamAffiliations[]` via
  `composeTeamAffiliationsForProfile` from `team.logic.ts` with
  read-time visibility filter and the
  `ORDER BY joined_at ASC, team_id ASC` invariant.
- `apps/server/src/profile/profile.logic.test.ts` — **modified
  (per PS-6)** — extend the 4-key drift test at lines 168–173
  to 5 keys (`teamAffiliations` added); add an empty-array
  fixture and a populated-array fixture covering the read-time
  visibility filter.
- `apps/server/src/profile/ownerProfile.types.ts` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** — extend
  `OwnerProfileView` (7 → 8 keys) with
  `teamAffiliations: TeamAffiliation[]`.
- `apps/server/src/profile/ownerProfile.logic.ts` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** —
  `getOwnerProfile` composes `teamAffiliations[]` via the same
  composer scoped to the owner viewer.
- `apps/server/src/profile/ownerProfile.logic.test.ts` —
  **modified (per PS-3 = YES user pre-lock 2026-05-03)** —
  extend the 7-key drift test at lines 146–155 to 8 keys.
- `apps/server/src/server.mjs` — **modified** — register the
  new team routes via
  `registerTeamRoutes(server.router, pool, deps)` per the
  WP-104 D-10408 same-commit-wiring precedent.
- `apps/arena-client/src/pages/PlayerProfilePage.vue` —
  **modified (corrected path per PS-5; the original draft
  cited a non-existent `PublicProfile.vue`)** — render team
  affiliation block (read-only, no competitive copy).
- `apps/arena-client/src/pages/MyProfilePage.vue` — **modified
  (per PS-3 = YES user pre-lock 2026-05-03)** — render
  read-only "your teams" block in a new region using the
  existing `defineComponent({ setup() {...} })` wrapper (no
  `<script setup>` switch per D-6512 / P6-30); no edit
  affordance; mutation flows via `/api/teams/...` only.
- `docs/ai/REFERENCE/api-endpoints.md` — **modified per PS-7** —
  add 8 new `Wired` rows per D-11804 for the new
  `/api/teams/...` endpoints.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified
  per PS-8** — add 3 new rows to §4.1 Table Inventory for
  `legendary.teams`, `legendary.team_member_events`,
  `legendary.team_audit_log`.

A new `D-NNNN` entry classifying `apps/server/src/teams/` as a
server-layer directory (mirrors D-5202 for `identity/`, D-10301
for `replay/`, D-10201 for `profile/`) is added to
`docs/ai/DECISIONS.md` at execution time per pre-flight PS-10;
the D-NNNN number is assigned when the entry is written. The
exact route prefix (recommended default `/api/teams`) is also
a pre-flight item resolved before session prompt generation.

---

## After Completing

- [ ] All 12 WP-109 Acceptance Criteria pass (within the 6–12 lint
      range; expanded 2026-05-03 to lock captain invariant,
      monotonic-timeline check, and same-size exclusivity).
- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0; new
      `apps/server/src/teams/` tests listed in output; baseline
      `pass 82 / fail 0 / skipped 42` advanced by the projected
      16–24 new tests + 1–2 modified tests in
      `profile.logic.test.ts` (and `ownerProfile.logic.test.ts`
      if PS-3 = YES).
- [ ] Engine baseline `pass 604 / fail 0` UNCHANGED (no engine
      touch).
- [ ] `pnpm -r build` exits 0 (full monorepo build).
- [ ] No file under `packages/game-engine/`, `packages/registry/`,
      or `packages/preplan/` was touched (verified by
      `git diff --name-only`).
- [ ] No reference to `Team`, `teamId`, `cohortLabel`, or
      `teamAffiliations` exists in any ranking-aggregation,
      scoring, or leaderboard source (verified by grep).
- [ ] No `UPDATE.*team_size` matches across migrations and server
      code (Guardrail 9 verification).
- [ ] No `seasonLabel` matches across `apps/server/src/teams/*.ts`
      and `apps/server/src/profile/*.ts` (locked-value verification).
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated with 8 new
      `Wired` rows per D-11804 (PS-7).
- [ ] `docs/ai/REFERENCE/00.2-data-requirements.md §4.1 Table
      Inventory` updated with 3 new rows (PS-8).
- [ ] `docs/ai/STATUS.md` updated with what landed.
- [ ] `docs/ai/DECISIONS.md` updated with the new `D-NNNN` entry
      classifying `apps/server/src/teams/` as server-layer (PS-10),
      plus any Open Question resolved during execution recorded as
      its own D-entry (per WP-109 §"Definition of Done").
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-109 row checked off
      with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-115 row updated.
- [ ] No files outside the `## Files to Produce` list were modified
      (verified by `git diff --name-only`).

---

## Common Failure Smells

- **A `teamId` field appears on a run / match / replay record** —
  Guardrail 7 violated; team-play attribution leaked into this WP's
  scope. Remove and defer to the future attribution WP.
- **A migration includes `ALTER TABLE teams ... team_size` or any
  `UPDATE` against `team_size`** — Guardrail 9 violated. `teamSize`
  is immutable post-creation; format changes require retire+recreate,
  never in-place mutation.
- **A `teamSize` value of 1, 2, or 6+ is accepted somewhere** —
  Guardrail 10 violated. The validator must reject every non-`{3,4,5}`
  value at every entry point, not just the HTTP route.
- **A migration uses `UPDATE` to correct a member-event record** —
  Guardrail 3 violated. The amendment pattern requires a new
  record with a new identifier; in-place `UPDATE` is structurally
  forbidden, not merely discouraged.
- **A test passes when a sub auto-promotes on member departure** —
  Guardrail 4 violated. Two events are required (member's `leftAt`
  AND sub's `role` change). Auto-promotion is a UX decision deferred
  to the WP-109 §17 Open Question; do not pre-decide it.
- **A `friends`-visibility profile read returns team data when no
  friend-graph surface exists** — Guardrail 6 violated. The
  fallback to `private` must be enforced server-side on the read
  path; the client must not be the gate.
- **Field renamed to `seasonLabel` "for consistency with the ranking
  system"** — locked-value violation. The rename to `cohortLabel`
  is intentional (DESIGN-RANKING.md §2 collision); paraphrasing it
  back is the exact failure mode this EC exists to prevent.
- **Operator-override audit row has the same shape as a captain-
  driven row** — Guardrail 5 partially violated. Operator overrides
  must be distinguishable in the audit log (operator identity field
  populated; `reason` text required).
- **A `# why:` comment cites WP-109 generically without naming the
  specific section (e.g., "per WP-109" instead of "per WP-109 §11
  friends fallback")** — minor lint / drift smell. WP sections evolve;
  comments should pin the specific clause.
- **A captain is assigned where the target `playerId` is in
  `role: 'substitute'` or has `leftAt` set** — Guardrail 11
  violated. Captain is a current-member-only role; reassign or
  reject.
- **A team has zero captains, or two captains, in any non-transient
  state** — Guardrail 11 violated. Exactly one `captainPlayerId`
  per team at all times; transitions must be atomic (old captain
  reassignment + new captain set in the same event).
- **A player ends up on two `active` teams with the same `teamSize`
  simultaneously** — Guardrail 12 violated. Same-size exclusivity
  is enforced at write time; the test that adds a player to a
  conflicting team must assert the write fails.
- **A membership record where `leftAt < joinedAt`, or a `joinedAt`
  rewritten after `leftAt` is set** — Guardrail 13 violated.
  Monotonicity is checked on write; the invariant test must
  construct both bad cases and assert rejection.
- **A team transitions to a `paused` / recovery status when a
  membership mutation would invalidate it, instead of failing the
  mutation** — Guardrail 14 violated absent a pre-flight DECISIONS.md
  override. The default is mutation failure; recovery state is an
  opt-in future amendment, not a default.
- **`completed` and `retired` states are used interchangeably in
  user-facing copy or admin tooling** — minor drift smell. Per
  WP-109 §10, `completed` is a *natural end* and `retired` is a
  *premature/administrative termination*. Both are terminal but
  carry different historical narrative; preserve the distinction.
- **Migration 010 omits the denormalized `team_size` column on
  `legendary.team_member_events`** — locked-value violation
  (OQ-4 = (a) user pre-lock 2026-05-03 / D-10906). The column is
  required for the simple-form UNIQUE partial index that enforces
  same-size exclusivity in PostgreSQL.
- **The same-size partial index uses a subquery in its
  expression** (`ON ... (player_id, (SELECT team_size FROM legendary.teams ...))`)
  — locked-value violation. PostgreSQL prohibits subqueries in
  CREATE INDEX expressions; the only acceptable form is
  `(player_id, team_size) WHERE left_at IS NULL` against the
  denormalized column. If the executor encounters any other shape,
  return to OQ-4 = (a) lock.
- **An `INSERT INTO legendary.team_member_events` omits the
  `team_size` column** — invariant violation. Every member event
  row MUST carry the team's size at INSERT time, copied from
  `legendary.teams.team_size`. The denormalization invariant is
  load-bearing for the partial UNIQUE index.
- **An `UPDATE legendary.team_member_events SET team_size = ...`
  appears anywhere** — STOP (D-10906 immutability invariant; format
  change requires retire+recreate, not in-place mutation, mirroring
  Guardrail 9 for `legendary.teams.team_size`).

---

## Notes on Format

This EC condenses the design-form draft proposal (10 numbered
sections, ~70 sub-bullets) into the project's compact EC template
([EC-TEMPLATE.md](EC-TEMPLATE.md)). What was condensed:

- §0 Pre-Flight Gates → `## Before Starting` (post-pre-flight
  2026-05-03: includes test-baseline lock per PS-9 and confirmation
  that PS-1..PS-14 amendments are in place)
- §1 Data Shapes → `## Locked Values` (field/enum/citation strings,
  validity-violation default, captain invariant, same-size
  exclusivity, timeline monotonicity, `TeamId` branded type per
  PS-14, `teamAffiliations[]` ordering invariant per PS-13)
- §§2–8 invariants and exclusions → `## Guardrails` (15
  load-bearing rules; expanded 2026-05-03 to lock captain invariant,
  same-size exclusivity, monotonic timeline, validity-violation
  default behavior, and single-transaction multi-row create-team
  per PS-11)
- §9 Verification Steps → deferred to WP-109's `## Verification
  Steps` section (now present in the WP), as the EC must not invent
  commands the WP does not authorize
- §10 Definition of Done → `## After Completing` (post-pre-flight
  2026-05-03: expanded to enumerate the api-endpoints / 00.2
  catalog updates per PS-7 / PS-8)

Nothing was dropped; everything compressed. If the executor wants
the full sub-bulleted version during a session, it can be
regenerated from this EC + the WP without loss of fidelity.
