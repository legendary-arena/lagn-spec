# WP-105 — Player Badges Data Model & Display

**Status:** Done 2026-05-15 (this body backfilled into git on 2026-05-19 to close the WP-105 audit-trail gap — implementation shipped on 2026-05-15 but the design body was not committed alongside)
**Primary Layer:** Server / Competition + Profile
**Dependencies:** WP-104 (owner profile), WP-053 (competitive scoring), WP-102 (public profile page)

---

## Session Context

WP-053 landed the immutable `legendary.competitive_scores` table and
`ScoreBreakdown` projection; WP-104 landed the owner profile edit surface
with `legendary.player_profiles` and `legendary.player_links`; WP-102
landed the public profile page with a "Badges -- coming soon (WP-105)"
stub tab; this packet fills that stub with Tier 1 gameplay badges per
D-1004.

---

## Goal

After this session, the server can automatically issue Tier 1 gameplay
badges against immutable competitive-score rows and surface them on both
the public profile (`GET /api/players/:handle/profile`) and the owner
profile (`GET /api/me/profile`). The `legendary.player_badges` table
exists, the `issueTier1BadgesForSubmission` issuance hook is wired into
the competitive-submission pipeline, `getPlayerBadges` returns issued
badges for a player, and the arena-client badge tab renders live badge
data instead of the WP-102 placeholder stub.

---

## Assumes

- WP-104 complete. Specifically:
  - `apps/server/src/profile/profile.types.ts` exports `PublicProfileView` (WP-102) and `OwnerProfileView` (WP-104)
  - `apps/server/src/profile/profile.logic.ts` exports `getPublicProfileByHandle` and `getOwnerProfile`
  - `data/migrations/009_create_player_profiles_and_links.sql` exists
- WP-053 complete. Specifically:
  - `data/migrations/007_create_competitive_scores_table.sql` exists
  - `apps/server/src/competition/competition.logic.ts` exports `submitCompetitiveScoreImpl`
  - `packages/game-engine/src/scoring/parScoring.types.ts` exports `ScoreBreakdown`, `ScoringInputs`, `PenaltyEventType`
- WP-102 complete. Specifically:
  - `apps/arena-client/src/pages/PlayerProfilePage.vue` contains the badge tab stub
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm test` exits 0
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md` -- read §Layer Boundary (Authoritative).
  This packet adds server-layer code only; no engine or registry changes.
- `docs/ai/PROPOSAL-BADGES.md` -- the authoritative badge design. Read
  §2 (D-1004 decision text) and §3 (criteria sketch) in full. All
  predicates and storage contracts trace to this document.
- `docs/ai/PROPOSAL-VISION-25-AMENDMENT.md §5` -- the four veteran
  recognition badges (V-1..V-4) that complete the 10-badge Tier 1 set.
- `packages/game-engine/src/scoring/parScoring.types.ts` -- read
  `ScoreBreakdown`, `ScoringInputs`, `PenaltyEventType` union. Verify
  exact penalty event key spellings before coding predicates.
- `apps/server/src/competition/competition.logic.ts` -- read
  `submitCompetitiveScoreImpl` to identify the post-INSERT hook point
  where badge issuance is invoked.
- `apps/server/src/competition/competition.types.ts` -- read the
  `CompetitiveSubmissionRow` type for the shape returned by the INSERT.
- `apps/server/src/profile/profile.types.ts` -- read `PublicProfileView`
  and `OwnerProfileView`; badge data extends both.
- `apps/server/src/profile/profile.logic.ts` -- read
  `getPublicProfileByHandle` and `getOwnerProfile` to identify where
  badge loading is wired in.
- `apps/arena-client/src/pages/PlayerProfilePage.vue` -- read the badge
  tab stub (lines ~229-236) that this packet replaces.
- `data/migrations/007_create_competitive_scores_table.sql` -- read to
  confirm `submission_id bigserial PK` shape for `source_ref` FK.
- `docs/ai/REFERENCE/00.6-code-style.md` -- key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix),
  Rule 11 (full-sentence error messages), Rule 14 (field names match
  data contract).
- `docs/ai/REFERENCE/api-endpoints.md` -- catalog to update if any HTTP
  route changes (D-11804 obligation).

---

## Non-Negotiable Constraints

**Engine-wide (always apply -- do not remove):**
- Never use `Math.random()` -- all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions -- return void on invalid input
- Never persist `G`, `ctx`, or any runtime state -- see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times -- no class instances, Maps, Sets, or functions
- ESM only, Node v22+ -- all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension -- never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output -- no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- `legendary.player_badges` is append-only -- no UPDATE or DELETE paths
  (mirrors D-5302 immutability precedent)
- Only `tier = 1` rows may be inserted -- enforce via CHECK constraint and
  application-layer guard
- Only `source_kind IN ('competitive_score', 'competitive_history')`
  accepted in this packet (`competitive_score` for per-run badges,
  `competitive_history` for veteran badges)
- Per-run badge predicates are pure functions of `ScoreBreakdown` --
  no I/O, no clock reads. History-evaluated badges (multiverse-mastery,
  all veteran badges) require a DB query for aggregate player history
  but their threshold predicates are still pure functions of the
  queried count.
- `UNIQUE (player_id, badge_key, source_ref)` prevents duplicate issuance
- No HTTP routes under `/badges/*` -- badges are read via the existing
  profile endpoints only
- No export-format DTOs (Open Badges, Credly JSON, etc.)
- No Tier 2 or Tier 3 issuance code
- No cross-platform sharing or public canonical badge URLs
- `apps/server/src/competition/competition.logic.ts` -- the issuance hook
  is added AFTER the existing step-15 INSERT; it must not alter the
  existing submission flow's return shape or error handling
- Profile types modifications must be additive (column-additive on
  `PublicProfileView` and `OwnerProfileView`) with drift-test updates

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human
  before proceeding -- never guess or invent field names, type shapes, or file
  paths

**Locked contract values:**

- **PenaltyEventType union** (verified against `parScoring.types.ts`):
  `'villainEscaped'` | `'bystanderLost'` | `'schemeTwistNegative'` |
  `'mastermindTacticUntaken'` | `'scenarioSpecificPenalty'`

- **ScoreBreakdown key fields used by predicates:**
  `finalScore`, `penaltyBreakdown` (keyed by `PenaltyEventType`),
  `inputs.bystandersRescued`, `inputs.escapes`, `scoringConfigVersion`

- **Migration slot:** `013` (`data/migrations/013_create_player_badges.sql`)

- **legendary.\* namespace:** All tables in the `legendary.*` schema.
  PKs use `bigserial`. Cross-service IDs use `ext_id text`.

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection. Logging, breakpoints, or "printf debugging"
are not acceptable debugging strategies.

The following requirements are mandatory:

- Per-run badge eligibility is a deterministic function of
  `ScoreBreakdown`. History-evaluated badge eligibility is a
  deterministic function of the player's competitive-score history
  at query time. A given set of immutable competitive-score rows
  produces the same eligibility set on every evaluation.

- Issuance is idempotent: re-running `issueTier1BadgesForSubmission` on
  the same submission produces no duplicate rows (UNIQUE constraint).

- Badge rows are immutable once written. No UPDATE path exists.

- Veteran badges MUST exist at most once per player per badge key.
  Re-evaluation MUST NOT create additional rows -- the partial unique
  index `(player_id, badge_key) WHERE source_ref IS NULL` enforces
  this at the database level; `ON CONFLICT DO NOTHING` at the
  application level.

- The following invariants must always hold after execution:
  - All rows in `legendary.player_badges` MUST have `tier = 1`
  - `source_kind` is `'competitive_score'` or `'competitive_history'`
  - Per-run rows: `source_ref` MUST be non-null and reference a valid
    `competitive_scores.submission_id`
  - Veteran/history rows: `source_ref` MUST be NULL
  - No duplicate `(player_id, badge_key, source_ref)` tuples for
    per-run badges
  - No duplicate `(player_id, badge_key)` for veteran badges

- Failures are localizable via:
  - Violation of declared invariants (tier/source_kind CHECK)
  - UNIQUE constraint violation on duplicate issuance attempt
  - Query against `player_badges` joined to `competitive_scores`

---

## Scope (In)

### A) Migration: `legendary.player_badges` table

- **`data/migrations/013_create_player_badges.sql`** -- **new**:
  - `badge_id bigserial PRIMARY KEY`
  - `player_id bigint NOT NULL REFERENCES legendary.players(player_id)`
  - `badge_key text NOT NULL` (stable slug, e.g., `gameplay.sub-par-run`)
  - `tier int NOT NULL CHECK (tier IN (1, 2, 3))` -- only `1` inserted
    by this packet
  - `source_kind text NOT NULL CHECK (source_kind IN
    ('competitive_score', 'competitive_history'))` -- only
    `'competitive_score'` for per-run badges; `'competitive_history'`
    for veteran badges
  - `source_ref bigint NULL` -- the originating
    `competitive_scores.submission_id` for per-run badges; NULL for
    veteran (per-history) badges
  - `awarded_at timestamptz NOT NULL DEFAULT now()`
  - `awarded_under_config_version int NOT NULL`
  - `is_revoked boolean NOT NULL DEFAULT false`
  - `UNIQUE (player_id, badge_key, source_ref)` -- prevents duplicate
    per-run issuance. For veteran badges where `source_ref IS NULL`,
    uniqueness is `UNIQUE (player_id, badge_key)` via a partial unique
    index: `CREATE UNIQUE INDEX ... ON legendary.player_badges
    (player_id, badge_key) WHERE source_ref IS NULL`
  - `CREATE INDEX IF NOT EXISTS idx_player_badges_player_awarded_at
    ON legendary.player_badges (player_id, awarded_at DESC)` --
    read performance for profile badge loading
  - Add `-- why:` comment in the migration header explaining the
    append-only contract per D-1004 / D-5302
  - Time source is database clock (Postgres `now()`), not application
    time -- `awarded_at` is server-clock metadata only

### B) Badge definitions and predicates

- **`apps/server/src/badges/badge.types.ts`** -- **new**:
  - `PlayerBadge` interface: `{ badgeId: number; badgeKey: string;
    tier: number; sourceKind: string; sourceRef: number | null;
    awardedAt: string; awardedUnderConfigVersion: number;
    isRevoked: boolean }`
  - `BadgeDefinition` interface: `{ badgeKey: string; tier: 1;
    sourceKind: 'competitive_score' | 'competitive_history';
    label: string; description: string }`
  - `TIER_1_BADGE_KEYS` canonical readonly array of badge key strings
  - `TIER_1_BADGE_DEFINITIONS` readonly array of `BadgeDefinition`
    objects for all shipping badges

- **`apps/server/src/badges/badge.predicates.ts`** -- **new**:
  - Pure predicate functions, one per badge. Each takes a
    `ScoreBreakdown` (imported as a type from `@legendary-arena/game-engine`)
    and returns `boolean`.
  - `isEligibleSubParRun(breakdown): boolean` --
    `breakdown.finalScore < 0`
  - `isEligiblePristineDefense(breakdown): boolean` --
    `breakdown.penaltyBreakdown.villainEscaped === 0`
  - `evaluatePerRunBadges(breakdown): string[]` -- returns badge keys
    earned by this single submission (per-run only: `sub-par-run`,
    `pristine-defense`)
  - **Deferred badges (not shipped, predicate stubs only with `// why:` comments):**
    - `gameplay.master-strike-ironwall` -- **DEFERRED**: no
      `PenaltyEventType` tracks Master Strike resolution count.
      `mastermindTacticUntaken` tracks untaken mastermind tactics, not
      Master Strikes. Shipping this badge requires either (a) adding a
      `masterStrikeResolved` penalty event to the engine scoring
      pipeline, or (b) sourcing the count from replay event log. Either
      path is out of scope for this packet.
    - `gameplay.bystander-guardian` -- **DEFERRED**: predicate requires
      total bystanders available per scenario, which is not stored in
      `ScoreBreakdown` or `competitive_scores`. Shipping requires a
      deterministic per-`ScenarioKey` lookup of available bystander
      count (likely from PAR config or match setup). Approximation is
      not acceptable per D-1004.
    - `gameplay.steady-crew` -- **DEFERRED** per PROPOSAL-BADGES.md:
      depends on a registered-party concept that does not exist on the
      platform.

### C) Veteran badge evaluation

- **`apps/server/src/badges/badge.veteran.ts`** -- **new**:
  - `evaluateHistoryBadges(playerId, database): string[]`
  - Canonical history query:
    `SELECT COUNT(DISTINCT scenario_key) FROM legendary.competitive_scores
    WHERE player_id = $1 AND final_score < 0`
  - `gameplay.multiverse-mastery` -- sub-PAR completions on >= 5
    distinct scenario keys (history-evaluated, NOT per-run -- depends
    on aggregate player history, not a single ScoreBreakdown)
  - Four veteran badges per D-0006 / PROPOSAL-VISION-25-AMENDMENT.md:
    - `gameplay.veteran.seasoned-defender` -- sub-PAR completions on
      >= 10 distinct scenario keys
    - `gameplay.veteran.decade-legend` -- sub-PAR completions on
      >= 25 distinct scenario keys
    - `gameplay.veteran.hall-of-sustained-mastery` -- sub-PAR
      completions on >= 50 distinct scenario keys
    - `gameplay.veteran.crossroads-of-multiverse` -- sub-PAR
      completions on >= 100 distinct scenario keys
  - All thresholds are stored as named constants, not magic numbers
  - History-evaluated badges (multiverse-mastery + all veteran badges)
    use `source_kind = 'competitive_history'` and `source_ref = NULL`
  - `// why:` comment explaining these are breadth-gated (distinct
    scenarios), not volume-gated (total submissions) per D-0005
  - Veteran evaluation intentionally runs on every submission due to
    low-frequency submission pattern and simplicity tradeoff; the
    query is a single `COUNT(DISTINCT scenario_key)` aggregate

### D) Issuance hook

- **`apps/server/src/badges/badge.issuance.ts`** -- **new**:
  - `issueTier1BadgesForSubmission(submissionId, playerId,
    scoringConfigVersion, database): Promise<number[]>`
  - Reads the immutable `competitive_scores` row by `submissionId`
  - Deserializes `score_breakdown` jsonb to `ScoreBreakdown` with
    structural validation: `finalScore` is number,
    `penaltyBreakdown` contains all `PenaltyEventType` keys. Invalid
    shape MUST throw before badge evaluation.
  - Calls `evaluatePerRunBadges(breakdown)` for per-run badges
  - Calls `evaluateHistoryBadges(playerId, database)` for
    history-evaluated badges (multiverse-mastery + veteran badges;
    re-evaluated on every submission since new submissions can cross
    thresholds)
  - `issueTier1BadgesForSubmission` MUST execute within the caller's
    transaction context. It MUST NOT open its own transaction. The
    `database` parameter is the caller's transaction-scoped client.
  - INSERT statements MUST rely on constraint inference (no explicit
    conflict target) for `ON CONFLICT DO NOTHING` to allow both UNIQUE
    constraints to suppress duplicates
  - Issuance SHOULD use a single multi-row INSERT statement rather
    than per-badge inserts
  - Partial failure (some badges inserted, some failed) is acceptable.
    No retry mechanism exists in this packet.
  - Returns array of newly created `badge_id` values (empty if all
    already existed)

- **`apps/server/src/competition/competition.logic.ts`** -- **modified**:
  - After the step-15 INSERT (or race-recovery retrieval), call
    `issueTier1BadgesForSubmission(submissionId, playerId,
    scoringConfigVersion, database)`
  - Badge issuance failure must NOT fail the competitive submission --
    wrap in try/catch with warning log. The submission is the
    authoritative record; badges are derived.
  - Add `// why:` comment explaining badge issuance is fire-and-forget
    relative to the submission pipeline

### E) Read surface

- **`apps/server/src/badges/badge.read.ts`** -- **new**:
  - `getPlayerBadges(playerId, database): Promise<PlayerBadge[]>`
  - Reads from `legendary.player_badges WHERE player_id = $1 AND
    is_revoked = false ORDER BY awarded_at DESC`
  - Returns `PlayerBadge[]` (empty array if no badges)
  - Read layer functions MUST be side-effect free
  - No caching layer is introduced in this packet; all reads are
    direct from DB

### F) Profile integration

- **`apps/server/src/profile/profile.types.ts`** -- **modified**:
  - Add `readonly badges: PlayerBadgeSummary[]` to `PublicProfileView`
    (5 -> 6 keys) and to `OwnerProfileView` (field count +1)
  - `PlayerBadgeSummary` interface: `{ badgeKey: string; label: string;
    description: string; awardedAt: string }`
  - Update drift tests for both view types

- **`apps/server/src/profile/profile.logic.ts`** -- **modified**:
  - In `getPublicProfileByHandle`: after loading team affiliations,
    call `getPlayerBadges(playerId, database)` and map to
    `PlayerBadgeSummary[]` using an in-memory `Map<string, BadgeDefinition>`
    keyed by `badgeKey` (MUST NOT iterate arrays per badge)
  - In `getOwnerProfile`: same badge loading
  - Badges with unrecognized `badge_key` (from future tiers) are
    silently omitted from the summary -- forward-compatible; unknown
    keys MUST NOT cause errors in profile rendering
  - Mapping from DB rows to summaries MUST NOT reorder rows;
    transformation is 1:1 preserving index order (most recent first,
    by `awarded_at DESC`)

### G) Client badge tab

- **`apps/arena-client/src/pages/PlayerProfilePage.vue`** -- **modified**:
  - Replace the "Badges -- coming soon (WP-105)" stub with a list
    rendering `badges` from the profile API response
  - Each badge displays: `label`, `description`, `awardedAt` (rendered
    as a locale-aware date string, no time component)
  - Empty state: "No badges earned yet."
  - No new routes, no new API calls -- badges arrive as part of the
    existing profile fetch

### H) Tests

Add `node:test` tests:

- **`apps/server/src/badges/badge.predicates.test.ts`** -- **new**:
  - `isEligibleSubParRun` returns true when `finalScore < 0`, false
    when `>= 0`
  - `isEligiblePristineDefense` returns true when
    `penaltyBreakdown.villainEscaped === 0`, false otherwise
  - `evaluatePerRunBadges` returns correct badge keys for various
    `ScoreBreakdown` combinations (only `sub-par-run` and
    `pristine-defense`)
  - `evaluateHistoryBadges` threshold tests: multiverse-mastery at
    count 5, veteran badges at 10/25/50/100
  - `TIER_1_BADGE_KEYS` drift test: array contains exactly the
    expected badge key strings
  - No `boardgame.io` imports

- **`apps/server/src/badges/badge.issuance.test.ts`** -- **new**:
  - Integration tests (conditional on test database availability per
    D-5201 §3.1 skip pattern)
  - Issuance creates correct badge rows for a qualifying submission
  - Re-issuance on the same submission is a no-op (idempotent)
  - Non-qualifying submission produces zero badge rows
  - Veteran badge evaluation crosses thresholds correctly

- **`apps/server/src/badges/badge.read.test.ts`** -- **new**:
  - `getPlayerBadges` returns badges ordered by `awarded_at DESC`
  - Returns empty array for player with no badges
  - Revoked badges (`is_revoked = true`) are excluded

---

## Out of Scope

- No `gameplay.master-strike-ironwall` badge issuance -- DEFERRED:
  `PenaltyEventType` does not track Master Strike resolution count.
  Requires engine scoring pipeline changes (future WP).
- No `gameplay.bystander-guardian` badge issuance -- DEFERRED: total
  available bystanders per scenario is not in `ScoreBreakdown` or
  `competitive_scores`. Requires deterministic per-`ScenarioKey`
  bystander-count lookup (future WP).
- No `gameplay.steady-crew` badge -- DEFERRED per PROPOSAL-BADGES.md:
  depends on registered-party concept (no WP exists).
- No HTTP routes under `/badges/*` -- badges are read via profile
  endpoints only
- No Tier 2 (admin-attested) or Tier 3 (external-system-attested)
  badge issuance
- No public canonical badge URLs (`legendary-arena.dev/badges/<slug>`)
- No cross-platform mirroring (LinkedIn, Steam, Credly, Open Badges)
- No card-tie-in verification or flavor text -- deferred to a content
  pass after registry cross-check script runs
- No avatar / cosmetic side effects of badges (display borders, flair)
- No game engine changes
- No registry changes
- Refactors, cleanups, or "while I'm here" improvements are **out of
  scope** unless explicitly listed in Scope (In) above.

---

## Vision Alignment

- **Vision clauses touched:** §3 (Trust & Fairness — badge issuance
  from immutable competitive records), §22 (Deterministic Eval — per-run
  predicates are pure functions of `ScoreBreakdown`; history-evaluated
  badges are deterministic functions of immutable rows at query time),
  §25 (Veteran Recognition — breadth-gated thresholds per D-0005 /
  D-0006), NG-1, NG-3, NG-6
- **Conflict assertion:** No conflict: this WP preserves all touched
  clauses.
- **Non-Goal proximity:** NG-1 (badges are gameplay-earned only, no
  purchase path), NG-3 (veteran badges reward distinct-scenario breadth,
  not repetition volume), NG-6 (no scarcity pressure or dark patterns).
  None crossed.
- **Determinism preservation:** Per-run badge predicates are pure
  functions of `ScoreBreakdown`. History-evaluated badges are
  deterministic functions of immutable `competitive_scores` rows at
  query time. A given set of immutable rows produces the same
  eligibility set on every evaluation.

---

## Files Expected to Change

- `data/migrations/013_create_player_badges.sql` -- **new** -- badge table + indexes
- `apps/server/src/badges/badge.types.ts` -- **new** -- `PlayerBadge`, `BadgeDefinition`, canonical arrays
- `apps/server/src/badges/badge.predicates.ts` -- **new** -- pure eligibility predicates
- `apps/server/src/badges/badge.veteran.ts` -- **new** -- veteran badge evaluation
- `apps/server/src/badges/badge.issuance.ts` -- **new** -- issuance hook
- `apps/server/src/badges/badge.read.ts` -- **new** -- read surface
- `apps/server/src/badges/badge.predicates.test.ts` -- **new** -- predicate unit tests
- `apps/server/src/badges/badge.issuance.test.ts` -- **new** -- issuance integration tests
- `apps/server/src/badges/badge.read.test.ts` -- **new** -- read unit tests
- `apps/server/src/competition/competition.logic.ts` -- **modified** -- add badge issuance hook after step-15
- `apps/server/src/profile/profile.types.ts` -- **modified** -- add `badges` field to views + `PlayerBadgeSummary`
- `apps/server/src/profile/profile.logic.ts` -- **modified** -- wire badge loading into profile reads
- `apps/arena-client/src/pages/PlayerProfilePage.vue` -- **modified** -- replace badge stub with live list

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A) Migration
- [ ] `data/migrations/013_create_player_badges.sql` creates
      `legendary.player_badges` with all columns per §Scope A
- [ ] `tier` CHECK constraint accepts `(1, 2, 3)`
- [ ] `source_kind` CHECK constraint accepts
      `('competitive_score', 'competitive_history')`
- [ ] `UNIQUE (player_id, badge_key, source_ref)` constraint exists
- [ ] Partial unique index on `(player_id, badge_key) WHERE source_ref
      IS NULL` exists
- [ ] Migration is idempotent (`IF NOT EXISTS`)

### B) Badge definitions
- [ ] `TIER_1_BADGE_KEYS` contains exactly 7 keys (2 per-run shipping +
      1 history-evaluated + 4 veteran)
- [ ] Per-run shipping keys: `gameplay.sub-par-run`,
      `gameplay.pristine-defense`
- [ ] History-evaluated key: `gameplay.multiverse-mastery`
- [ ] Veteran keys: `gameplay.veteran.seasoned-defender`,
      `gameplay.veteran.decade-legend`,
      `gameplay.veteran.hall-of-sustained-mastery`,
      `gameplay.veteran.crossroads-of-multiverse`
- [ ] Every key in `TIER_1_BADGE_KEYS` has a matching entry in
      `TIER_1_BADGE_DEFINITIONS`
- [ ] Deferred keys are documented in comments only, not in any
      runtime array
- [ ] All `badge_key` values follow `gameplay.<category>.<slug>`
      format: lowercase, kebab-case subkey, no spaces

### C) Predicates
- [ ] `isEligibleSubParRun` returns `true` iff `finalScore < 0`
- [ ] `isEligiblePristineDefense` returns `true` iff
      `penaltyBreakdown.villainEscaped === 0`
- [ ] `evaluatePerRunBadges` returns only `sub-par-run` and
      `pristine-defense` keys -- NOT `multiverse-mastery`
- [ ] Per-run predicates are pure functions with no I/O
- [ ] `evaluateHistoryBadges` evaluates `multiverse-mastery` (count
      >= 5 distinct sub-PAR scenarios) alongside veteran thresholds
- [ ] `score_breakdown` jsonb deserialization validates structure:
      `finalScore` is number, `penaltyBreakdown` contains all
      `PenaltyEventType` keys -- invalid shape throws before evaluation

### D) Issuance
- [ ] `issueTier1BadgesForSubmission` reads immutable competitive row
      and issues correct badges
- [ ] Re-issuance is a no-op (ON CONFLICT DO NOTHING)
- [ ] Badge issuance failure does not fail the competitive submission
- [ ] History-evaluated badges (multiverse-mastery + veteran) are
      re-evaluated on every submission

### E) Read surface
- [ ] `getPlayerBadges` returns non-revoked badges ordered by
      `awarded_at DESC`

### F) Profile integration
- [ ] `PublicProfileView` includes `badges: PlayerBadgeSummary[]`
- [ ] `OwnerProfileView` includes `badges: PlayerBadgeSummary[]`
- [ ] Drift tests updated for both views

### G) Client
- [ ] Badge tab in `PlayerProfilePage.vue` renders live badge data
- [ ] Empty state shows "No badges earned yet."

### Tests
- [ ] `pnpm test` exits 0 (all test files)
- [ ] Drift test: `TIER_1_BADGE_KEYS` contains exactly 7 expected values
- [ ] Predicate tests cover true/false branches for each badge
- [ ] Integration tests confirm idempotent issuance
- [ ] Test files do not import from `boardgame.io`
- [ ] Test files use `node:test` and `node:assert` only

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 -- build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 -- run all tests
pnpm test
# Expected: TAP output -- all tests passing, 0 failing

# Step 3 -- confirm no engine files were modified
git diff --name-only -- packages/game-engine/
# Expected: no output

# Step 4 -- confirm no registry files were modified
git diff --name-only -- packages/registry/
# Expected: no output

# Step 5 -- confirm no Math.random in new files
Select-String -Path "apps\server\src\badges" -Pattern "Math.random" -Recurse
# Expected: no output

# Step 6 -- confirm no UPDATE or DELETE in badge code
Select-String -Path "apps\server\src\badges" -Pattern "UPDATE|DELETE" -Recurse
# Expected: no output (no mutation paths)

# Step 7 -- confirm migration uses IF NOT EXISTS
Select-String -Path "data\migrations\013_create_player_badges.sql" -Pattern "IF NOT EXISTS"
# Expected: at least one match

# Step 8 -- confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0 (all test files)
- [ ] No UPDATE or DELETE paths in `apps/server/src/badges/` (confirmed
      with `Select-String`)
- [ ] No `Math.random` in any new or modified file (confirmed with
      `Select-String`)
- [ ] No engine files modified (confirmed with
      `git diff --name-only -- packages/game-engine/`)
- [ ] No registry files modified (confirmed with
      `git diff --name-only -- packages/registry/`)
- [ ] WP-104 outputs (`profile.types.ts`, `profile.logic.ts`) were only
      additively modified -- no existing fields removed or renamed
      (confirmed with `git diff`)
- [ ] WP-053 outputs (`competition.logic.ts`) existing submission flow
      return shape unchanged (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` verified -- no new HTTP
      routes added (badges read via existing profile endpoints; catalog
      rows for profile endpoints unchanged). If profile response shape
      change warrants a catalog note, add it.
- [ ] `docs/ai/STATUS.md` updated -- badge issuance is now live for
      Tier 1 per-run and veteran gameplay badges; three per-run badges
      deferred pending engine scoring data gaps
- [ ] `docs/ai/DECISIONS.md` updated -- at minimum: D-10501 documenting
      the three deferred badges and their blocking data gaps
      (master-strike-ironwall lacks PenaltyEventType;
      bystander-guardian lacks per-scenario bystander count;
      steady-crew lacks party registration)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-105 checked off with today's date
- [ ] `01.5 NOT INVOKED` -- this packet does not modify
      `LegendaryGameState`, `buildInitialGameState`, `LegendaryGame.moves`,
      or any phase hook
