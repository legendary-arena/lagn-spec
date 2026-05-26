# Work Index — Legendary Arena (Slim Edition)

> **Slim build of WORK_INDEX.md** — collapsed completed WPs to one-liners;
> full entries preserved only for incomplete or deferred WPs.
> The full version lives in the git history on main.
>
> **Location note:** This file lives at `docs/ai/work-packets/WORK_INDEX.md`.
> All references in the coordination system (00.1, CLAUDE.md) point here.

---

## Format

```
- [ ] WP-NNN — Short Title — [pending | in-progress | blocked: reason]
- [x] WP-NNN — Short Title — Completed YYYY-MM-DD
```

**Rules:**
- One Work Packet per Claude Code session — never combine two packets in one session
- Packets must be executed in dependency order unless explicitly noted as parallel
- A packet may not be executed until all listed dependencies are complete
- Status is updated only when the packet's `## Definition of Done` is fully met


---

## Review Status Legend

| Mark | Meaning |
|------|---------|
| ✅ Reviewed | Packet has been audited: SharePoint links removed, all required sections present, verified against conventions |
| ⚠️ Needs review | Packet has NOT been audited — likely contains SharePoint links, missing Definition of Done, `.mjs` test paths |

All existing WPs through WP-060 are marked ✅ Reviewed. WP-061 through WP-065 were drafted 2026-04-16 and passed lint-gate review. Any future WPs must be reviewed before Claude Code executes them.

---

## Foundation Prompts (run once before Work Packets begin)

These are execution prompts, not Work Packets. They establish the deployment
environment that all Work Packets build on top of. Run them in the order shown.

| Prompt | Description | Status |
|--------|-------------|--------|
| `00.4` | Connection & environment health check | ✅ complete 2026-04-09 |
| `00.5` | R2 data & image validation | ✅ complete 2026-04-09 |
| `01` | Render.com backend — server, schema, `render.yaml` | ✅ complete 2026-04-09 |
| `02` | Database migration runner + `data/migrations/` | ✅ complete 2026-04-09 |

Run `00.4` first. Fix any failures before proceeding. Then run `00.5`, `01`, `02`
in that order. When all four pass, WP-002 is unblocked.


---

## Phase 0 — Coordination & Contracts (Foundational)

These packets establish the repo-as-memory system and lock contracts before code.


- [x] WP-001 — Foundation & Coordination System — Done
- [x] WP-002 — boardgame.io Game Skeleton (Contracts Only) — Done 2026-04-09
- [x] WP-003 — Card Registry Verification & Defect Correction — Done 2026-04-09
- [x] WP-004 — Server Bootstrap (Game Engine + Registry Integration) — Done 2026-04-09
- [x] WP-043 — Data Contracts Reference (Canonical Card & Metadata Shapes) — Done 2026-04-10
- [x] WP-044 — Prompt Lint Governance Alignment — Done 2026-04-10
- [x] WP-045 — Connection Health Check Governance Alignment — Done 2026-04-10
- [x] WP-046 — R2 Validation Governance Alignment — Done 2026-04-10
- [x] WP-047 — Code Style Reference Governance Alignment — Done 2026-04-10
- [x] WP-055 — Theme Data Model (Mastermind / Scenario Themes v2) — Done 2026-04-20 (commit `dc7010e`)
- [x] WP-060 — Keyword & Rule Glossary Data Migration — Done 2026-04-20 (commit `412a31c`)

---

## Phase 1 — Game Setup Contracts & Determinism

These packets define *what* a match is before implementing *how* it plays.


- [x] WP-005A — Match Setup Contracts — Done 2026-04-10
- [x] WP-005B — Deterministic Setup Implementation — Done 2026-04-10
- [x] WP-006A — Player State & Zones Contracts — Done 2026-04-10
- [x] WP-006B — Player State Initialization (Align to Zone Contracts) — Done 2026-04-10

---

## Phase 2 — Core Turn Engine (Minimal Playable Loop)

These packets create the first playable (but incomplete) game loop.


- [x] WP-007A — Turn Structure & Phases Contracts — Done 2026-04-10
- [x] WP-007B — Turn Loop Implementation — Done 2026-04-10
- [x] WP-008A — Core Moves Contracts (Draw, Play, End Turn) — Done 2026-04-10
- [x] WP-008B — Core Moves Implementation (Draw, Play, End Turn) — Done 2026-04-10

---

## Phase 3 — MVP Multiplayer Infrastructure

These packets complete the minimum viable multiplayer loop.


- [x] WP-009A — Scheme & Mastermind Rule Hooks (Contracts) — Done 2026-04-11
- [x] WP-009B — Scheme & Mastermind Rule Execution (Minimal MVP) — Done 2026-04-11
- [x] WP-010 — Victory & Loss Conditions (Minimal MVP) — Done 2026-04-11
- [x] WP-011 — Match Creation & Lobby Flow (Minimal MVP) — Done 2026-04-11
- [x] WP-012 — Match Listing, Join & Reconnect (Minimal MVP) — Done 2026-04-11
- [x] WP-013 — Persistence Boundaries & Snapshots — Done 2026-04-11

---

## Phase 4 — Core Gameplay Loop

These packets make the game play like Legendary for the first time.


- [x] WP-014A — Villain Reveal & Trigger Pipeline — Done 2026-04-11
- [x] WP-014B — Villain Deck Composition Rules & Registry Integration — Done 2026-04-11
- [x] WP-015 — City & HQ Zones (Villain Movement + Escapes) — Done 2026-04-11
- [x] WP-015A — Reveal Safety Fixes (Stage Gate + No-Card-Drop) — Done 2026-04-11
- [x] WP-016 — Fight First, Then Recruit (Minimal MVP) — Done 2026-04-11
- [x] WP-017 — KO, Wounds & Bystander Capture (Minimal MVP) — Done 2026-04-12
- [x] WP-018 — Attack & Recruit Point Economy (Minimal MVP) — Done 2026-04-12
- [x] WP-019 — Mastermind Fight & Tactics (Minimal MVP) — Done 2026-04-12
- [x] WP-020 — VP Scoring & Win Summary (Minimal MVP) — Done 2026-04-12

---

## Phase 5 — Card Mechanics & Abilities

These packets make individual cards do things.


- [x] WP-021 — Hero Card Text & Keywords (Hooks Only) — Done 2026-04-13
- [x] WP-022 — Execute Hero Keywords (Minimal MVP) — Done 2026-04-13
- [x] WP-023 — Conditional Hero Effects (Teams, Colors, Keywords) — Done 2026-04-13
- [x] WP-024 — Scheme & Mastermind Ability Execution — Done 2026-04-13
- [x] WP-025 — Keywords: Patrol, Ambush, Guard — Done 2026-04-13
- [x] WP-026 — Scheme Setup Instructions & City Modifiers — Done 2026-04-14
- [x] WP-179 — Card Traits Resolution & Superpower Condition Evaluation — Done 2026-05-25. Introduces `G.cardTraits` setup-time snapshot (hero class + team per `CardExtId`), adds `[team:X]` markup parsing (231 occurrences across 37 sets), wires `heroClassMatch` and `requiresTeam` condition evaluators with self-card exclusion, projects `heroClass`/`team` onto `UICardDisplay`. Closes the D-2302 placeholder gap so superpowers fire based on play order. D-17901..D-17904. EC-203.

---

## Phase 6 — Verification, UI & Production

These packets make the game safe to ship.


- [x] WP-027 — Determinism & Replay Verification Harness — Done 2026-04-14
- [x] WP-028 — UI State Contract (Authoritative View Model) — Done 2026-04-14
- [x] WP-029 — Spectator & Permissions View Models — Done 2026-04-14
- [x] WP-030 — Campaign / Scenario Framework — Done 2026-04-14
- [x] WP-031 — Production Hardening & Engine Invariants — Done 2026-04-15
- [x] WP-032 — Network Sync & Turn Validation — Done 2026-04-15
- [x] WP-033 — Content Authoring Toolkit — Done 2026-04-16
- [x] WP-034 — Versioning & Save Migration Strategy — Done 2026-04-19 (commit `c587f74`)
- [x] WP-035 — Release, Deployment & Ops Playbook — Done 2026-04-19 (commit `d5935b5`)
- [x] WP-042 — Deployment Checklists (Data, Database & Infrastructure) — Done 2026-04-19 (commit `c964cf4`)
- [ ] WP-042.1 — Deployment Checklists: Deferred PostgreSQL Seeding Sections. **Blocked** on Foundation Prompt 03 revival (seed runner + migrations). Authors four checklist sections deferred by WP-042 per D-4201: §B.3/B.4/B.5/B.8 (lookup seeding, entity seeding, card seeding, re-seeding).

- [x] WP-048 — PAR Scenario Scoring & Leaderboards — Done 2026-04-17
- [x] WP-065 — Vue SFC Test Transform Pipeline — Done 2026-04-16
- [x] WP-061 — Gameplay Client Bootstrap — Done 2026-04-16
- [x] WP-062 — Arena HUD & Scoreboard (Client Projection View) — Done 2026-04-16
- [x] WP-063 — Replay Snapshot Producer — Done 2026-04-16 (commit `97560b1`)
- [x] WP-064 — Game Log & Replay Inspector — Done 2026-04-16 (commit `76beddc`)
- [x] WP-079 — Label Engine Replay Harness as Determinism-Only — Done 2026-04-19 (commit `1e6de0b`)
- [x] WP-080 — Replay Harness Step-Level API for Downstream Snapshot / Replay Tools — Done 2026-04-18 (commit `dd0e2fd`)
- [x] WP-066 — Registry Viewer: Card Image-to-Data Toggle — Done 2026-04-22
- [x] WP-067 — UIState Projection of PAR Scoring & Progress Counters — Done 2026-04-17 (commit `2587bbb`)
- [x] WP-081 — Registry Build Pipeline Cleanup — Done 2026-04-20 (commit `ea5cfdd`)
- [x] WP-082 — Keyword & Rule Glossary Schema, Labels, and Rulebook Deep-Links — Done 2026-04-21 (commit `3da6ac3`)
- [x] WP-083 — Fetch-Time Schema Validation for Registry-Viewer Clients — Done 2026-04-21 (commit `601d6fc`)
- [x] WP-084 — Delete Unused Auxiliary Metadata Schemas and Files — Done 2026-04-21 (commit `b250bf1`)

---

## Phase 7 — Beta, Launch & Live Ops

These packets ship the game and keep it running.

> **Vision Alignment instrument:** Audit scaffold landed (INFRA `24996a9`)
> under `scripts/audit/vision/`. Calibrated baseline on main: 6 critical
> (DET-001 documentation-only baseline exceptions), 4 warning (legitimate
> snapshot timestamps). WP-085 queued to codify governance using
> calibration as `## Acceptance Criteria` source (see D-8501). The §17
> Vision Alignment gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`,
> commit `0689406`) applies to every Phase 7 WP listed below.


- [x] WP-049 — PAR Simulation Engine — Done 2026-04-23 (commit `021555e`)
- [x] WP-051 — PAR Publication & Server Gate Contract — Done 2026-04-23 (commit `ce3bffb`)
- [x] WP-052 — Player Identity, Replay Ownership & Access Control — Done 2026-04-25 (commit `fd769f1`)
- [x] WP-053a — PAR Artifact Carries Full ScenarioScoringConfig — Done 2026-04-25 (commit `e5b9d15`)
- [x] WP-053 — Competitive Score Submission & Verification — Done 2026-04-26 (commit `56e8134`)
- [x] WP-054 — Public Leaderboards & Read-Only Web Access — Done 2026-05-01 (commit `f34e917`)
- [x] WP-050 — PAR Artifact Storage & Indexing — Done 2026-04-23 (commit `ccdf44e`)
- [x] WP-036 — AI Playtesting & Balance Simulation — Done 2026-04-21 (commit `4e340fd`)
- [x] WP-037 — Public Beta Strategy — Done 2026-04-22 (commit `a4f5574`)
- [x] WP-038 — Launch Readiness & Go-Live Checklist — Done 2026-04-22 (commit `2134f33`)
- [x] WP-039 — Post-Launch Metrics & Live Ops — Done 2026-04-23 (commit `4b1cf5c`)
- [x] WP-040 — Growth Governance & Change Budget — Done 2026-04-23 (commit `6faaf3b`)
- [x] WP-041 — System Architecture Definition & Authority Model — Done 2026-04-23 (commit `0e8e8b1`)
- [x] WP-085 — Vision Alignment Audit (Detection, Classification & Gating) — Done 2026-04-22 (commit `c836b29`)
- [x] WP-087 — Engine Type Hardening: `PlayerId` Alias + Setup-Only Array `readonly` — Done 2026-04-23 (commit `73aeada`)
- [x] WP-088 — Setup Module Hardening: `buildCardKeywords` Runtime Guards, Villain Pre-Index, Output Ordering — Done 2026-04-23 (commit `d183991`)
- [x] WP-089 — Engine PlayerView Wiring — Done 2026-04-24
- [x] WP-090 — Live Match Client Wiring — Done 2026-04-24 (commit `54b266a`)
- [x] WP-091 — Loadout Builder in Registry Viewer — Done 2026-04-24
- [x] WP-092 — Lobby Loadout Intake (JSON → Create Match) — Done 2026-04-24
- [x] WP-093 — Match-Setup Rule-Mode Envelope Field (Governance) — Done 2026-04-24
- [x] WP-094 — Viewer Hero FlatCard Key Uniqueness — Done 2026-04-24 (commit `eac678c`)
- [x] WP-096 — Registry Viewer: Grid Data View Mode — Done 2026-04-25 (commit `4fe8382`)
- [x] WP-100 — Interactive Gameplay Surface (Click-to-Play UI Scaffold, revised) — Done 2026-04-27 (commit `5f9cdd4`)
- [x] WP-097 — Tournament Funding Policy (Governance) — Done 2026-04-27 (commit `7260403`)
- [x] WP-098 — Funding Surface Gate Trigger (00.3 §20) — Done 2026-04-27 (commit `545c37f`)
- [x] WP-099 — Auth Provider Selection (Governance) — Done 2026-04-27 (commit `f6cd591`)
- [x] WP-101 — Handle Claim Flow & Global Uniqueness — Done 2026-04-28 (commit `fb1ca2b`)
- [x] WP-102 — Public Player Profile Page (Read-Only) — Done 2026-04-28 (commit `369c0a4`)
- [x] WP-104 — Owner Profile Data Model & `/me` Edit — Done 2026-05-02
- [x] WP-105 — Player Badges Data Model & Display — Done 2026-05-15. Tier 1 gameplay badges (7 keys); migration 013; append-only `legendary.player_badges`; predicates/veteran/issuance/read modules; fire-and-forget hook in competition pipeline; profile integration (public + owner); D-10501.
- [x] WP-106 — Avatar Upload Pipeline (R2 + MIME/size validation + closed-origin allowlist) — Done 2026-05-16. EC-171. D-10601, D-10602.
- [x] WP-107 — Profile Integrity / Anti-Cheat Surface. **Done** 2026-05-24. Server-only addition shipping three admin-only endpoints under `/api/admin/players/:handle/` (`GET /integrity`, `POST /suspend`, `POST /unsuspend`) plus the shared `requireUnsuspendedAccount(database, accountId): Result<void>` intake helper at `apps/server/src/auth/requireUnsuspendedAccount.ts` (ships `Library-only` — first caller deferred to the future score-submission request-handler WP per RS-1 Option A scope-out 2026-05-23; the score-submission HTTP route does not exist at HEAD per api-endpoints.md:193). Migration 015 adds `is_suspended BOOLEAN NOT NULL DEFAULT FALSE` to `legendary.players` + creates `legendary.admin_actions` append-only audit table with DB-level `CHECK (action_type IN ('suspend','unsuspend'))`, `CHECK (length(reason) BETWEEN 1 AND 500)`, FKs to `legendary.players(ext_id) ON DELETE RESTRICT` on both account-id columns, + composite index `admin_actions_target_idx (target_account_id, created_at DESC, action_id DESC)`. Transaction ownership locked in `adminProfile.logic.ts` (route handlers contain zero transaction-control literals — grep-verified); every successful mutation executes `BEGIN -> UPDATE legendary.players -> INSERT legendary.admin_actions RETURNING action_id -> COMMIT` with the audit INSERT completing BEFORE COMMIT; injected-fault tests prove any step's failure rolls back BOTH writes. Race-safe unconditional `UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2` (NOT read-modify-write — concurrent duplicate writes acceptable; idempotency DB-enforced). `GET /integrity` composes profile + audit-log reads inside one `BEGIN ISOLATION LEVEL REPEATABLE READ ... COMMIT` so the response cannot show stale suspension state alongside fresh audit rows. Audit-log tail bound `LIMIT 100`, `ORDER BY created_at DESC, action_id DESC` (action_id tiebreaker resolves same-millisecond collisions deterministically). `AdminProfileResponse` locked to 4 admin-only fields (`accountId`, `handle`, `isSuspended`, `recentAuditLog`); `AuditLogEntry` 5 fields; `AdminActionRequest` 1 field (`reason`); `AdminActionResponse` 2 fields (`ok: true`, `actionId: string`). Closed-union `AdminPlayerActionType = 'suspend' | 'unsuspend'`; closed-union error codes `'unauthorized' | 'forbidden' | 'not_found' | 'invalid_request' | 'internal_error'`. Self-action forbidden at the route layer (`actingAccountId === targetAccountId` after handle -> ext_id resolution returns 400 `{ code: 'invalid_request', reason: 'Admins cannot suspend their own account.' }` with **zero audit rows written** — verified by test). Reason `.trim()`-normalized BEFORE validation; trimmed length 1-500 chars; whitespace-only rejected at the application boundary (DB CHECK is defense-in-depth). `requireUnsuspendedAccount` HTTP error mapping locked as caller-contract for the future score-submission request-handler WP: `'suspended'` -> 403 `{ code: 'forbidden', reason: 'Account is suspended.' }`; `'lookup_failed'` -> 500 `{ code: 'internal_error' }`. WP-107 is the FIRST caller of `requireAdminSession` (WP-159's helper, shipped 2026-05-17). Bidirectional drift-detection tests on `ADMIN_PROFILE_ERROR_CODES` + `ADMIN_PLAYER_ACTION_TYPES` + `REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES`. Locked contract files byte-identical pre/post: `adminSession.ts` (WP-159), `adminGate.ts` (WP-110), `sessionToken.{logic,types}.ts` (WP-112), `auth/hanko/**` (WP-126); no touch to `apps/server/src/{competition,leaderboards,par}/` (Option A scope-out — `git diff --name-only` empty for those paths). Pre-existing `join-match.test.ts` failure (1 fail, unrelated to WP-107 scope) carried forward — same disposition as WP-159 / WP-163. Server test baseline 397/330/1/66 -> 441/374/1/66 (+44 new: 8 requireUnsuspendedAccount + 19 logic + 17 routes). `pnpm -r build` exits 0. Catalog updated per §21 + D-11804: 3 new `Wired` rows + 1 new `Library-only` row (replace-whole-row semantics). All 6 Open Questions LOCKED per RS-1/RS-2 (2026-05-23): Q1 N/A under Option A; Q2 NO public-read-block; Q3 STAY historical scores; Q4 NO auto-leave teams; Q5 indefinite retention; Q6 single WP. 01.5 NOT INVOKED (no engine surface). 01.6 post-mortem authored (first admin-mutation surface; audit-log primitive becomes a new code category). Hard-deps: WP-052, WP-101, WP-102, WP-104, WP-112, WP-126, WP-131, WP-053, WP-105, **WP-159** — all ✅. D-10701 (account-level scope), D-10702 (audit log append-only single-table), D-10703 (handle in URL, not accountId). 11 files (post-Option-A). See [WP-107](WP-107-profile-integrity-anti-cheat-surface.md) + [EC-195](../execution-checklists/EC-195-profile-integrity-anti-cheat-surface.checklist.md) + [01.6 post-mortem](../post-mortems/01.6-WP-107-profile-integrity-anti-cheat-surface.md).
- [x] WP-174 — First-Sign-In Auto-Provisioning (Read-or-Create Account Resolver). **Done** 2026-05-24. Server-only. `productionAccountResolver` extended to read-or-create: on no-match from `findAccountByAuthProviderSub`, provisions a new `legendary.players` row using Hanko JWT claims (`email`, `displayName`). `VerifiedSessionClaim` extended with additive optional `email?: string` and `displayName?: string`. New `provisionPlayerAccount` helper in `accountProvisioning.logic.ts` uses `INSERT ... ON CONFLICT (auth_provider, auth_provider_id) DO NOTHING` + re-SELECT for race-safety and idempotency. Migration 016 adds `UNIQUE INDEX players_auth_provider_sub_unique ON legendary.players (auth_provider, auth_provider_id)`. Email validation gate: defined + non-empty after trim + contains `@`. Display name fallback: `email.split('@')[0].slice(0, 64)`. Duplicate-email (different provider) returns `Result.ok(null)` (account linking intentionally deferred). Locked files unchanged: `identity.logic.ts`, `identity.types.ts`, `accountLookup.logic.ts`, `sessionToken.logic.ts`. D-16006 superseded by D-17401. D-17401..D-17406 landed (Active). Pre-existing `join-match.test.ts` failure (1 fail, unrelated) carried forward. `pnpm -r build` exits 0. See [WP-174](WP-174-first-signin-auto-provisioning.md) + [EC-196](../execution-checklists/EC-196-first-signin-auto-provisioning.checklist.md).
- [x] WP-175 — Arena Client Auth-Aware Navigation Surface. **Done** 2026-05-25. Client-only. Adds auth-aware nav element to `BrandHeader.vue`: signed-out → "Sign in" link (`?route=login`); signed-in → display label + "My profile" (`?route=me`) + "Sign out"; bootstrapping → `"..."` placeholder. New `useAuthNav` composable at `composables/useAuthNav.ts`. `isAuthBootstrapping` delivered via provide/inject from `App.vue` (D-17501). Pinia auth store byte-identical. Amendment 1: display name fetch deferred — `GET /api/me/profile` does not return `handle`/`displayName`/`email` (spec-vs-reality gap in D-17502); display label is always `"My account"` until a follow-up WP adds identity fields to the server response. Sign-out byte-identical to `MyProfilePage.vue` (D-17503). Broker confinement maintained (F-2). `defineComponent` SFC pattern (D-6512). Arena-client tests 389 → 406. `pnpm -r build` exits 0. D-17501..D-17506 landed (Active; D-17502 amended). Hard-deps: WP-160, WP-174, WP-161 — all ✅. See [WP-175](WP-175-arena-client-auth-nav.md) + [EC-197](../execution-checklists/EC-197-arena-client-auth-nav.checklist.md).
- [x] WP-176 — Admin Billing Auth Cutover (requireAdminSecret → requireAdminSession). **Done** 2026-05-24. Server-only. Cut over `GET /api/admin/billing/history` from WP-110's shared-secret gate (`requireAdminSecret` / `X-Admin-Secret`) to WP-159's session-based gate (`requireAdminSession`). Deleted `adminGate.ts` + `adminGate.test.ts` (no remaining callers). Auth Taxonomy reduced from 5 to 4 values (`admin-secret` removed per D-17602). Status-code domain expanded from `{200, 401, 500}` to `{200, 401, 403, 500}`. `server.mjs` wiring changed from two-arg to three-arg call (byte-identical deps bundle to `registerAdminProfileRoutes`). D-17601..D-17603 landed (Active). Pre-existing `join-match.test.ts` failure (1 fail, unrelated) carried forward. `pnpm -r build` exits 0. See [WP-176](WP-176-admin-billing-auth-cutover.md) + [EC-198](../execution-checklists/EC-198-admin-billing-auth-cutover.checklist.md).

- [x] WP-108 — Profile Billing & Funding History UI — Done 2026-05-15. Three-panel BillingSection (benefits, purchase history, community funding) inside MyProfilePage.vue; `GET /api/me/billing/history` endpoint; D-10801, D-10802.

- [x] WP-109 — Team Affiliation (Profile-Level Cooperative Cohorts) — Done 2026-05-03 (commit `cea9108`)
- [x] WP-110 — Admin Billing Visibility (Read-Only Backoffice Surface) — Done 2026-05-15. Admin-gated read-only surface over `stripe_checkout_sessions`. Ships minimal shared-secret admin gate (`adminGate.ts`) pending future RBAC WP. EC-163. D-11001, D-11002.
- [x] WP-152 — Wire Public Profile Route in server.mjs — Done 2026-05-15. Closes D-10202 + D-11505. Wires `registerProfileRoutes(server.router, pool)` in `server.mjs`; graduates catalog row to `Wired`. D-15201.
- [x] WP-112 — Session Token Validation Middleware — Done 2026-05-02
- [x] WP-126 — External Authentication Integration (Hanko Session Verifier) — Done 2026-05-03 (commit `e35dd00`)
- [x] WP-128 — UIState Projection Extensions for Board Layout — Done 2026-05-04 (commit `c44f539`)
- [x] WP-129 — Board Layout (Desktop Landscape + Mobile Portrait) — Done 2026-05-04 (commit `fb2bf95`)
- [x] WP-130 — Re-skin / Playmat Selector — Done 2026-05-04 (commit `b6651ed`)
- [x] WP-131 — Authenticated Routes Production Wiring (Hanko Verifier + Account Resolver) — Done 2026-05-04
- [x] WP-132 — Entitlements Data Model & `/me/entitlements` Read API — Done 2026-05-05
- [x] WP-133 — Stripe Checkout Session Creation & Webhook Ingestion (No Fulfillment) — Done 2026-05-05
- [x] WP-134 — Webhook → Entitlement Fulfillment Processor — Done 2026-05-07 (commit `b281744`)
- [x] WP-135 — HQ Population & Hero Deck Reservoir — Done 2026-05-04 (commit `5417c54`)
- [x] WP-136 — JSDOM Opaque-Origin Storage Fix in arena-client Test Harness — Done 2026-05-04 (commit `28284b3`)
- [x] WP-137 — Hero Card-Instance Distinctness + Data-Driven cardCounts — Done 2026-05-07 (commit `aa6ee70`)
- [x] **(deferred placeholder closed by WP-137 / D-13703 — 2026-05-07)** AMWP-class rarity-map extension → superseded by data-driven `HeroSchema.cardCounts` (D-13701) + ext_id grammar extension `<setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>` (D-13702). See WP-137 row above and DECISIONS.md §D-13703 for closure rationale.
- [x] WP-148 — `legendary-arena.com` + `www` Cutover Prep — Done 2026-05-11 (commit `6a4276c`)
- [x] WP-150 — Leaderboard Theme + Global Aggregation Endpoints — Done 2026-05-11 (commit `3ab2451`)
- [x] WP-149 — Public Leaderboard — Marketing-Site Hugo Page — Done 2026-05-14 (commit `3471e0d`)

- [x] WP-147 — PhysicalCard `companionSlug` + Physical-Side Order — Done 2026-05-10 (commit `adf62db`)


- [x] WP-138 — Physical Card Abstraction Layer (Split-Side Hero Cards) — Done 2026-05-08 (commit `763f84b`)
- [x] WP-144 — Arena-Client Production Bundle Isolation — Done 2026-05-09 (commit `bb0493c`)
- [x] WP-146 — `cards.legendary-arena.com` Cutover Prep — Done 2026-05-10 (commit `5999d10`)
- [x] WP-145 — Architecture Inventory ↔ Engineering Wiki Integration — Done 2026-05-10 (commit `b73f18f`)
- [x] WP-140 — Physical Card Phase 1b — Done 2026-05-09 (commit `d51a7ac`)

- [x] WP-141 — Physical Card Phase 2 — Done 2026-05-14
- [x] WP-151 — Physical Card Phase 3 — Done 2026-05-15 (EC-162). Removed `imageUrl` from `HeroCardSchema`; both `flattenSet()` use `sideToImageUrl` from `physicalCards[]`; all 40 JSONs regenerated; R2 rename mapping script produced (39 targets). D-15101, D-15102. See [WP-151](WP-151-physical-card-phase-3-imageurl-removal.md). Baselines: registry 53/0/0, engine 705/0/0, viewer 33/0/0.

- [x] WP-142 — Legends Snapshot Publisher. Done 2026-05-14. Closes EC-157. Background publisher writes public JSON snapshots to R2 at `legends/v1/*` on 5-min cadence. D-14201..D-14207. See [WP-142](WP-142-legends-snapshot-publisher.md).
- [x] WP-143 — Legends Attract Board (public scoreboard SPA). Done 2026-05-15. Closes EC-164 (`EC-164:` commit `e15ba0d`). Vue 3 + Vite SPA at `legends.legendary-arena.com` (Cloudflare Pages). Reads snapshots from R2 directly. Kiosk mode for big-screen / Twitch. D-14301..D-14306. See [WP-143](WP-143-legends-attract-board.md).

- [x] **(deferred placeholder closed by WP-153..WP-156 scoping session — 2026-05-15)** G-state extensions for board layout — resolves 7 remaining WP-128 safe-skip sites (D-12806). Decomposed into four independently executable sub-WPs below. Hard-dep: WP-128. WP-135 is the template for each sub-WP.

- [x] WP-153 — Destination Piles: Strike, Twist, and Escaped Villain. Graduates 3 safe-skip sites (`mastermind.strikePile`, `scheme.twistPile`, `city.escapedPile`). Adds `CardExtId[]` piles to G; diverts resolved cards from villain-deck discard. 01.5 IS INVOKED. Hard-dep: WP-128. Parallel-safe with WP-154, WP-155, WP-156. Done 2026-05-16. See [WP-153](WP-153-destination-piles-strike-twist-escaped.md).
- [x] WP-154 — Mastermind Attached Bystanders. Graduates 1 safe-skip site (`mastermind.attachedBystanders`). Adds `CardExtId[]` to `MastermindState`; wires Master Strike bystander capture per D-12805 Interpretation B. 01.5 IS INVOKED. Hard-dep: WP-128. Parallel-safe with WP-153, WP-155, WP-156. Done 2026-05-16. See [WP-154](WP-154-mastermind-attached-bystanders.md).
- [x] WP-155 — Turn Economy Extensions: Piercing and Wounds Drawn. Graduates 2 safe-skip sites (`economy.piercing`, `economy.woundsDrawn`). Adds `piercing` and `woundsDrawn` to `TurnEconomy`; wires wound-draw tracking. Piercing has no producer in MVP. 01.5 IS INVOKED. Hard-dep: WP-128. Parallel-safe with WP-153, WP-154, WP-156. Done 2026-05-16. See [WP-155](WP-155-turn-economy-piercing-and-wounds-drawn.md).
- [x] WP-156 — Horrors Pile. Graduates 1 safe-skip site (`piles.horrorsCount`). Adds `horrors: Zone` to `GlobalPiles`; MVP empty (no scheme populates it yet). 01.5 IS INVOKED. Hard-dep: WP-128. Parallel-safe with WP-153, WP-154, WP-155. Done 2026-05-16. See [WP-156](WP-156-horrors-pile.md).

- [x] WP-157 — Dashboard Scaffold: Monorepo Integration + PrimeVue. Done 2026-05-16. Closes EC-168 (`EC-168:` commit `fc325bc`). New `apps/dashboard/` SPA (Vue 3 + PrimeVue 4 + Pinia + Axios + ECharts). Deploys to `dashboard.legendary-arena.com` (Cloudflare Pages). 5 pages + debug, mock data, 4-state widgets, service envelope, polling composable, role guards, URL-state date range, feature flags. No engine/server/registry imports. No deps (parallel-safe). D-15701..D-15707. See [WP-157](WP-157-dashboard-scaffold.md).
- [x] WP-162 — Dashboard Daily Execution Panel + UI Polish. **Done** 2026-05-21 (executed under EC-176, `EC-176:` commit `44c83f3`; baseline `70fa2e1`; dashboard test baseline 0 → 9). **Drafted** 2026-05-19 (PR #89, commit `48ce7ab`); index rows backfilled + audit-tightening SPEC pass 2026-05-21. Client-only (`apps/dashboard/`) follow-up to the WP-157 scaffold. Adds a manually-operated **Daily Execution Panel** on Overview — a 9-item checklist (4 content + 3 community + 2 growth) grouped Content→Community→Growth, completion badge `"Daily: N/M complete"`, persisted in `localStorage` per-user-per-day (key `la-dashboard-checklist-{userId}-{dateString}`; `dateString` built from local date parts — never `toISOString()`; stale keys >30 days pruned on init via exact `la-dashboard-checklist-` prefix; new day = fresh unchecked list; explicit writes in `toggle()`/`resetAll()`, no deep watchers) via a `useDailyChecklist({ now? })` composable (optional injected date provider for deterministic tests; 9 `node:test` tests). State restoration merges persisted value onto the static config (missing→unchecked; unknown persisted ids ignored). Plus a **UI polish pass**: PrimeVue Aura dark/light theme toggle (default dark, `la-dashboard-theme`, resolved synchronously in `main.ts` before `createApp().mount()`); header/body/footer card structure + PrimeVue surface tokens (no custom hex); responsive sidebar (full ≥1200 / collapsed 768–1199 / hidden <768; resize throttled 100–200ms, reassign only on boundary crossing); DataTable striped rows + sticky header; accessibility baseline (real checkbox+label, keyboard-operable, alert severity text+icon, color never sole indicator); `resetAll()` confirm dialog; no pie charts. All data mock; zero `@legendary-arena/*` imports; no server endpoints. Hard-dep: WP-157 ✅. D-16201..D-16203 (reserved; land at execution). See [WP-162](WP-162-dashboard-daily-execution-ui-polish.md) + [EC-176](../execution-checklists/EC-176-dashboard-daily-execution-ui-polish.checklist.md).

- [x] WP-158 — Complete-Game Regression Tests (Seed-Faithful Fixture Harness). Engine-only regression net under `packages/game-engine/src/test/fixtures/`. Adds a seed-faithful mulberry32 fixture harness (driver, hash helper, schema), a CLI recorder at `scripts/record-game-fixture.mjs`, one sentinel fixture proving the pipeline, and operator docs at `docs/ai/REFERENCE/complete-game-tests.md`. Does NOT modify `packages/game-engine/src/replay/**` (D-0205 stands) or `packages/game-engine/src/simulation/**` (WP-036 Scope Lock — mulberry32 + MOVE_MAP precedent mirrored locally). Three-tier oracles: `outcome` → `messages` → `finalStateHash`. Hard-deps: WP-013 (snapshots), WP-027 (replay primitives), WP-036 (simulation precedent), WP-079 (D-0205 narrowing), WP-080 (`applyReplayStep` precedent) — all complete. 01.5 NOT INVOKED. Parallel-safe with every other Phase 7 WP. Recorder `--policy` mode deferred to follow-up WP (fold-inline scope amendment; sentinel uses `--input` mode). Engine test baseline 748 → 749 (driver adds 1 test). D-15801. Done 2026-05-17. See [WP-158](WP-158-complete-game-regression-tests.md).

- [x] WP-167 — Villain Deck Composition Data (Registry + Card Data Pipeline). **Done** 2026-05-20 (executed under EC-185; registry build + test green, 53 → 65 tests; all 40 `data/cards/*.json` regenerated, idempotent second regen = zero diff; loud-fail probes verified). **Drafted** 2026-05-20. Adds optional `copies` to `VillainCardSchema` and optional `villainDeckTwistCount` / `villainDeckBystanderCount` to `SchemeSchema` (all additive — every set file validates unchanged). The values are **converter-produced**, not hand-edited: `convert-cards-v15.mjs` writes `copies` on every villain card (default **2** per villain — common 4-villain × 2 = 8-card group; outliers in a new `inputs/villain-card-counts.json`), sources `mastermind.alwaysLeads[]` / `villainGroup.ledBy[]` from the existing `inputs/leads.json` (today hardcoded `[]` at ~line 542/569 — `core → magneto → brotherhood` already in `leads.json` but never emitted), and applies scheme villain-deck counts from a new `inputs/scheme-deck-counts.json` (Midtown `8`/`12`); all 40 `data/cards/*.json` regenerated. Henchmen unchanged (10 per group is an engine constant, D-1410). Documents new fields in `00.2 §1.4/§1.5`. No engine/server/UI changes. Hard-deps: WP-013+ ✅. Paired with WP-168 (engine), which hard-deps WP-167. D-16701, D-16702 (supersede the count *source* in D-1411/D-1412; fallbacks retained), D-16703 (converter populates copies + leads). See [WP-167](WP-167-villain-deck-composition-data.md).
- [x] WP-168 — Villain Deck Composition Logic (Engine). **Done** 2026-05-22 (executed under EC-186, `EC-186:` commit `e72971b`; baseline `cd85198`; engine test baseline 749 → 755 / 162 suites / 0 fail). **Allowlist amended at execution** (operator-approved) to add two dependency-driven replay-guard cascade re-baselines: `replay/replay.execute.test.ts` value-only `PRE_WP080_HASH` `6228d103`→`35fbe2fc` (empty mock registry now yields the 5 data-independent Master Strikes), and `test/fixtures/games/sentinel-core-doom-2p.replay.json` regenerated via `scripts/record-game-fixture.mjs` (`outcome.counters {}`→`{masterStrikeCount:2}` — correct new behavior under D-16801; meta unchanged). **Drafted** 2026-05-20; ready for execution (WP-167 landed 2026-05-20; WP-169 count curation landed 2026-05-22). Rewires `packages/game-engine/src/villainDeck/villainDeck.setup.ts`: instances each villain card `copies` times with suffixed ext_id `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}`; reads the scheme's `villainDeckTwistCount` (fallback 8) and `villainDeckBystanderCount` (fallback `numPlayers`); adds `MASTER_STRIKE_COUNT = 5` generic virtual `master-strike-{NN}` cards (type `mastermind-strike`); removes the mastermind-card-as-strike branch. Fixes the "watch bot play" deck (Midtown / Magneto / Brotherhood / Hand Ninjas) from 24 cards to the correct total. Lexical sort + `ctx.random.Shuffle` preserved (determinism); golden composition test locks per-type counts. No registry/UI changes (the instanced-villain display-resolution follow-up is flagged, not done here). Hard-deps: WP-167 ✅, WP-014B, WP-113. D-16801, D-16802 (supersede D-1413's villain-deck inclusion rule). See [WP-168](WP-168-villain-deck-composition-logic.md).
- [x] WP-169 — Scheme Villain-Deck Twist & Bystander Count Curation (Pipeline Data). **Done** 2026-05-22 (registry tests 65 → 112 / 0 fail; build exits 0; 105 curated entries across 35 of 40 sets; 21 carve-outs landed in D-16804). **Drafted** 2026-05-20; draft baseline `84331f2`. Curates `scripts/convert-cards/inputs/scheme-deck-counts.json` so registry data matches the printed scheme Setup text: a `villainDeckTwistCount` for every scheme printing a single fixed twist count ≠ 8 (~two-thirds of schemes deviate from the locked-8 default; e.g. `core.portals-to-the-dark-dimension` → 7), and a `villainDeckBystanderCount` for every scheme printing an explicit villain-deck bystander count incl. the explicit-zero case (`chmp.hypnotize-every-human` → 0; `numPlayers` is correct almost everywhere else). Two same-layer pipeline fixes WP-167 left latent: (A) `applySchemeDeckCounts` assigns each count **independently** (omitted ⇒ engine default; no `undefined` key written) so twist-only entries are first-class; (B) `apply-card-counts.mjs` gains the same scheme-deck-count overlay + exact-slug loud-fail for the 4 outlier sets (`2099`/`amwp`/`wpnx`/`wtif`), which otherwise silently ignore any entry (corrects a false `_note` claim). All 40 `data/cards/*.json` regenerated; only scheme twist/bystander deltas; idempotent. **Carve-out:** player-count-dependent / additive-per-player / non-constant twist counts (e.g. Civil War 2–3p:8 / 4–5p:5; `dstr` 2p:9 / 1·4p:10 / 3·5p:11) are NOT encoded — a single int can't represent them and WP-168 reads a single int; they keep the 8 fallback pending a future per-player-mapping schema+engine WP. No schema change (fields exist, D-16702), no engine change (WP-168 consumes). Hard-dep: WP-167 ✅. Independent of WP-168. New `schema.schemeDeckCounts.test.ts`. D-16803 (independent counts + outlier-applier parity; relaxes the WP-167 "both required" note), D-16804 (conditional-twist carve-out; finalized list landed at execution). See [WP-169](WP-169-scheme-villain-deck-count-curation.md) + [EC-187](../execution-checklists/EC-187-scheme-villain-deck-count-curation.checklist.md).

- [x] WP-170 — Registry Viewer: Card Count Display (`apps/registry-viewer/src/**`). **Done** 2026-05-22 (registry-viewer tests 33 → 39 / 0 fail; build exits 0; typecheck clean). **Drafted** 2026-05-22; baseline `855e90d`; EC commit `8903c6e`. Wires villain `copies` + hero `cardCounts` through the viewer's parse boundary (`SetDataSchema.safeParse` now preserves both fields), `flattenSet()` (precomputes `villainGroupTotal` / `heroDeckTotal` once per group/hero before the per-card loop; per-card iteration only assigns), `FlatCard` (new optional `count?` / `setTotal?`), `CardDetail.vue` stats grid (Card Count row after Type), and `CardDataDisplay.vue` data grid (Card Count row after Rarity). Strict AND-semantics: the row renders only when **both** `count` and `setTotal` are defined; SHIELD Officers, alt-art heroes, and any data-drift cases omit cleanly. Live-verified at localhost:5173: Silent Sniper (Black Widow rare, core) "1 of 14", Blob (Brotherhood villain, core) "2 of 8", Dum Dum Dugan (SHIELD hero) row absent in both views. **Inline amendment (fold-inline, single drift correction):** Original WP/EC §Hero Count Mapping Rule prescribed `cardCounts[card.rarity]` (rarity-key lookup); verified 2026-05-22 against live R2 `core.json` that `cardCounts` is keyed by card display name (e.g. `{"Mission Accomplished": 5, ...}`), not rarity. Corrected to `cardCounts[card.name]`; no fuzzy matching, no fallback heuristics; absent key still yields `count = undefined` ⇒ row omits per AND-semantics. Spec amendments landed in this commit (WP §Amendments, EC §Locked Values). No game-engine imports introduced (`grep ^import.*game-engine apps/registry-viewer/` returns 0). Hard-deps: WP-151 ✅, WP-167 ✅, WP-169 ✅. See [WP-170](WP-170-registry-viewer-card-count-display.md) + [EC-188](../execution-checklists/EC-188-registry-viewer-card-count-display.checklist.md).

- [x] WP-173 — Well-Known Ext_id Display Data Coverage (`packages/game-engine/src/setup/buildCardDisplayData.ts`). **Done** 2026-05-23 (executed under EC-191; engine baseline 773 → 787 tests / 169 suites / 0 fail; arena-client 384 / 47 suites / 0 fail; `pnpm -r build` exits 0; no `@legendary-arena/registry` or `boardgame.io` import in `buildCardDisplayData.ts`; `pilesInit.ts` + `buildInitialGameState.ts` + `uiState.build.ts` + `HandRow.vue` byte-identical pre- and post-execution). **Allowlist amended at execution** (operator-approved, mirrors WP-172 / EC-190 and WP-168 / EC-186 precedent verbatim) to add two cascade re-baselines for replay-fixture final-state hashes that depend on `G` content: `replay/replay.execute.test.ts` `PRE_WP080_HASH` `17c60ea9` → `b3240d6a`, and `test/fixtures/games/sentinel-core-doom-2p.replay.json` `expected.finalStateHash` regenerated via `scripts/record-game-fixture.mjs` (input.moves byte-identical; only the hash differs). **Drafted** 2026-05-23 on PR #136 (squash-merged); **tightened** 2026-05-23 after external review (6 of 7 suggestions integrated + 3 micro-tightenings; helper-rename skipped — existing asymmetry is intentional given parameter-shape differences). Tightening summary: (1) constants-import surface rewritten to inline literals at the emission site with test-side drift-detection (avoids a circular import path against `buildInitialGameState.ts`); (2) explicit no-shadow contract — Section 8 emissions are authoritative for the six `pile-*` / `starting-shield-*` keys, with value-shape assertion in the Coverage Invariant test; (3) terminal-augmentation-pass ordering lock; (5) partial-malformed (object present, field wrong type) test added; (6) HandRow audit framing — fixture refresh not behavior change; (7) Sidekick single-set future-proofing. Plus three micro `// why:` verbatim phrases locked. File allowlist unchanged at 7 files. Baseline `origin/main @ 19871c9` (post-WP-172). Direct surface continuation of WP-172. Production verification of WP-172 against `play.legendary-arena.com` match `WT_9sGMLmdG` (2026-05-23) surfaced a second class of `<unknown>` cards: well-known generic game-component ext_ids (`pile-bystander`, `pile-wound`, `pile-shield-officer`, `pile-sidekick`, `starting-shield-agent`, `starting-shield-trooper`) that exist independent of any registry set and were never registered in `G.cardDisplayData` since `G.cardDisplayData` was introduced (WP-111 / EC-118). Adds Section 8 (Well-Known Generic Cards) to `buildCardDisplayData.ts` AFTER the existing WP-172 sections 5–7. **Tiered display resolution per D-17301 (proposed)** mirrors WP-172 / D-17201: tier-1 per-ext_id registry lookup against the canonical source set (5 from `core` — `bystanders[]`, `wounds[]`, `heroes[].physicalCards[0]` for agent/trooper/officer; 1 from `ssw1.other[]` for sidekick) → tier-2 literal printed-card-name fallback (`'Bystander'`, `'Wound'`, `'S.H.I.E.L.D. Officer'`, `'Sidekick'`, `'S.H.I.E.L.D. Agent'`, `'S.H.I.E.L.D. Trooper'` — periods in the acronym are intentional, verbatim from the printed cards). All six entries carry `cost: null` (no printed cost on the physical token / starter cards; SHIELD Officer's recruit-cost-3 lives in `G.cardStats` — separate surface). Three new defensive-read helpers (`findHeroByExactSlug`, `findBystanderArrayEntry`, `findWoundArrayEntry`); no consolidation with WP-172 helpers per Rule §16.1 (2-call-site abstraction forbidden). New **Well-Known Coverage Invariant test (D-17301)** asserts every entry in the locked six-element ext_id set is defined in `G.cardDisplayData` with non-empty `name` — parallel to WP-172's cross-builder superset invariant (different builder pair: `pilesInit` + `buildInitialGameState` constants vs `buildCardDisplayData` output). `pilesInit.ts` + `buildInitialGameState.ts` + `uiState.build.ts` + `HandRow.vue` NOT modified (4 locked surfaces). `HandRow.test.ts` fixture refresh (2 `<unknown>` literal expectations → `'S.H.I.E.L.D. Agent'` / `'S.H.I.E.L.D. Trooper'`); humanize-fallback regression test on synthesized unknown extId stays for defense-in-depth. No `@legendary-arena/registry` or `boardgame.io` import added. Vision Alignment §1 / §10 (tabletop faithfulness; verbatim printed names); §20 N/A (engine-only; no SFC change beyond test fixtures); §21 N/A (no `apps/server/**`). Hard-deps: WP-172 ✅, WP-111 / EC-118 ✅. D-17301 (proposed). 7 files (1 modified engine src + 1 modified engine test + 1 modified client test + 4 governance). Lint gate self-review: PASS (38 items, 33 ✅, 5 N/A justified, 0 ❌). See [WP-173](WP-173-well-known-ext-id-display-data.md) + [EC-191](../execution-checklists/EC-191-well-known-ext-id-display-data.checklist.md).

- [x] WP-172 — Villain-Deck Display Data Coverage (`packages/game-engine/src/setup/buildCardDisplayData.ts`). **Done** 2026-05-23 (executed under EC-190; engine baseline 755 → 773 tests / 168 suites / 0 fail; `pnpm -r build` exits 0; no `@legendary-arena/registry` or `boardgame.io` import in `buildCardDisplayData.ts`; `villainDeck.setup.ts` + `uiState.build.ts` byte-identical pre- and post-execution). **Allowlist amended at execution** (operator-approved, mirrors WP-168 / EC-186 precedent verbatim) to add two cascade re-baselines for replay-fixture final-state hashes that depend on `G` content: `replay/replay.execute.test.ts` `PRE_WP080_HASH` `35fbe2fc` → `17c60ea9`, and `test/fixtures/games/sentinel-core-doom-2p.replay.json` `expected.finalStateHash` regenerated via `scripts/record-game-fixture.mjs` (input.moves byte-identical; only the hash differs). **Drafted** 2026-05-23, **revised** 2026-05-23 after external-session review (5 issues — 3 real correctness, 2 framing — all addressed). Plugs the four ext_id grammars WP-168 introduced (villain copies `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` per D-16802; generic Master Strikes `master-strike-{NN}` per D-16801) and the two pre-WP-168 grammars that were never registered (`scheme-twist-{schemeSlug}-{NN}`, `bystander-villain-deck-{NN}`) into `G.cardDisplayData` so the UIState projection's `resolveDisplay` no longer falls through to `UNKNOWN_DISPLAY_PLACEHOLDER` (the literal `<unknown>` name surfaced by the RevealOverlay popup on every Master Strike / Scheme Twist / city-villain reveal in production at `play.legendary-arena.com`). Per-copy villain fan-out mirrors the WP-135 / D-14102 hero-card-instance pattern already in `buildCardDisplayData.ts`; per-copy fresh object literals prevent aliasing (D-2802 / D-13502). **Tiered display resolution per D-17201 (empirically only 5/40 sets carry `mastermind-strike` and only 4/40 carry `scheme-twist` in `other[]`):** Master Strike + Scheme Twist use tier-1 mastermind/scheme-set art, tier-2 `core`-set art (the canonical Marvel Legendary visual default), tier-3 literal `''` fallback. Bystander uses two-tier lookup that **prefers `slug === 'bystander'` over positional `bystanders[0]`** (msp1 / vill / wtif carry the generic entry at non-zero positions; cvwr / ssw2 / xmen carry only named characters — tier-2 picks `bystanders[0]` as the acknowledged-imperfect fallback for those sets; dstr has empty array → tier-3 literal). No `core`-set fallback for bystanders (identity is per-scheme). New 3rd parameter `numPlayers: number` on `buildCardDisplayData` for the bystander-count fallback per D-1412 (`MatchSetupConfig` does not carry `numPlayers`; mirrors `villainDeck.setup.ts`'s `context.ctx.numPlayers` read; explicit `// why:` calls out that `matchConfig.bystandersCount` is a DIFFERENT concept — rescue-pile supply, not villain-deck virtual cards); single call-site update in `buildInitialGameState.ts`. New cross-builder superset invariant test (`Object.keys(G.cardDisplayData)` ⊇ `[...villainDeck.deck, ...villainDeck.discard]`) — the regression guard that would have caught the original WP-168 gap. Out of scope: `villainDeck.setup.ts` (locked WP-168 contract), `uiState.build.ts` (placeholder behavior unchanged), `UICardDisplay` shape, registry schema, **SW1's 30-card Master Strike deck (collapsed to 5 generic strikes per D-16801 — engine constraint, not WP-172 omission)**, registry data backfill (per-set `other[]` art + generic-bystander entries — separate pipeline WP). Vision Alignment §1 / §10 with explicit D-16801 honesty caveat (SW1 simplification disclosed, not papered over); §20 N/A (engine-only); §21 N/A (no `apps/server/**`). Hard-deps: WP-111 / EC-118 ✅, WP-167 ✅, WP-168 ✅. D-17201 (proposed — tiered display resolution + `core`-set cross-set fallback rationale). 7 files (1 modified src + 1 modified test + 1 modified call site + 4 governance). Lint gate self-review: PASS. See [WP-172](WP-172-villain-deck-display-data-coverage.md) + [EC-190](../execution-checklists/EC-190-villain-deck-display-data-coverage.checklist.md).

- [x] WP-171 — Pile Browse Modal (Click-to-View Card Piles) (`apps/arena-client/src/components/play/**`, `apps/arena-client/src/pages/**`). **Done** 2026-05-22 (arena-client tests 362 → 384 / 0 fail; typecheck 0; build 0; grep gates all pass). **Drafted** 2026-05-22 on branch `claude/wp171-pile-browse-modal`. Adds a single generic leaf `<PileBrowseModal>` (Teleport-to-body, ESC + backdrop close, ARIA dialog, text-only card list) and wires `View all ▼` affordances on `KOPile.vue`, `MasterStrikePile.vue`, and `SchemeTwistPile.vue`; page-level modal state lives on `PlayDesktop.vue` + `PlayMobile.vue` (one `<PileBrowseModal>` instance each, no Pinia, mirrors `OpponentPanel.vue:30-43`). Backed by the live `UIDisplayEntry[]` arrays WP-153 graduated from safe-skip 2026-05-16; no engine / registry / server runtime import (type-only `UIDisplayEntry` per D-16502 — grep gate confirms `from '@legendary-arena/game-engine'` matches only on `import type`). Pile leaves use `toRaw(props.koPile).cards` / `toRaw(props.pile)` to bypass Vue 3's deep-readonly props proxy and emit the engine's original array by reference (NOT a clone) — `payload.cards === koPile.cards` end-to-end. Header locked at `${pileLabel} (${cards.length} cards)` (never pluralized); empty state `"Pile is empty."` (verbatim). Out of scope: `EscapedPile.vue` (CityRow-nested; defer), `YourVictoryPile.vue` (renders inline; defer), `UIPlayerState.discardCards` (not in UIState — separate contracts WP), `OpponentVictoryModal.vue` deprecation (defer), card-image rendering, animations, scroll-snap / wheel-remap. Hard-deps: WP-128 ✅, WP-153 ✅, WP-166 ✅. Lint gate self-review: PASS (all 38 items, 0 carve-outs). No new D-entry (consumes D-12803, D-12805, D-12806, D-12909, D-16502 by citation). See [WP-171](WP-171-pile-browse-modal.md) + [EC-189](../execution-checklists/EC-189-pile-browse-modal.checklist.md).

- [x] WP-166 — Restore arena-client `vue-tsc` Green + CI Typecheck Gate — **Done 2026-05-19** (drafted 2026-05-19, draft baseline `267ea0c`, executed against `fcd2855`; EC-184). Cross-layer cleanup of ~40 pre-existing `vue-tsc` errors in `apps/arena-client` that were invisible because nothing on the green path type-checks the client (Vite=esbuild, tests=tsx, CI gated only `registry-viewer`). Four buckets, one root cause each: (A) the engine public barrel `index.ts` never re-exported the six WP-128 `UIState` projection sub-types (`UICardDisplay`/`UIHQCard`/`UIDisplayEntry`/`UIDecksState`/`UISharedPilesState`/`UIKoPileState`) — the UI block was last touched by WP-067; the sub-types are declared in `uiState.types.ts` but unpublished; (B) three `UIState` test fixtures + `SharedScoreboard` test literals predate the WP-128 `decks`/`piles`/`koPile` + `twistPile` + mastermind `display`/`attachedBystanders`/`strikePile` shape; (C) one `OpponentPanel.test.ts` call passes explicit `undefined` under repo-wide `exactOptionalPropertyTypes`; (D) `PlayMobile.vue` reads `viewer.handCount` in a footer guarded only on `isPlayPhase` while the `<main>` guards `viewer !== null` — a pure type-safety gap (mobile gets no rewind frame, D-16501; EC-183 scoped mobile out, so the fix is the minimal `TurnActionBar` guard, NOT the desktop board-ungating). Plus (F) wire `pnpm --filter @legendary-arena/arena-client typecheck` into `ci.yml` so it can't silently re-drift. No `UIState` field renamed/added; `uiState.types.ts` untouched (locked contract); `exactOptionalPropertyTypes` not relaxed. arena-client baseline 362/0/0 preserved; `pnpm -r build` 0; typecheck 0. Hard-deps: WP-128, WP-067, WP-090, EC-183 — all ✅. D-16502 Active (engine barrel publishes the WP-128 sub-types; additive, type-only). **Two execution reconciliations folded inline** (both from the draft being written against the short-circuited `vue-tsc` output, which only surfaced the first missing-prop layer): (R1) the three `UIState` fixtures live in `fixtures/uiState/{mid-turn,endgame-win,endgame-loss}.json`, not the `index.ts`/`typed.ts` wrappers the draft's §Files listed — edits landed in the JSON, the `.ts` wrappers are byte-unchanged; (R2) reaching green required the **full** WP-128 shape (`city.escapedPile` + `city.spaces[].display`, `mastermind.{display,attachedBystanders,strikePile}`, `scheme.twistPile`, `economy.{piercing,woundsDrawn}`), not only the itemized `decks`/`piles`/`koPile` — this matches the WP Goal §B ("up to the current WP-128 shape"); the type was never bent to a fixture. CI gate landed as its own `typecheck-arena-client` job (the §F "step or job" allowance) because `build-viewer` doesn't build the engine/preplan deps arena-client resolves against. 8 source + governance. See [WP-166](WP-166-arena-client-typecheck-restoration.md) + [EC-184](../execution-checklists/EC-184-arena-client-typecheck-restoration.checklist.md).

- [x] WP-163 — Autoplay Playback Controls (Server). Done 2026-05-19 (EC-180). Drafted + executed 2026-05-19, baseline `7b0f944`; pre-flight READY, copilot PASS. Server half of media-player playback for "Watch Bot Play": new pure helper `apps/server/src/autoplay/playbackController.mjs` (cursor-based snapshot history, `maxHistory=100`, single-consumer pause gate) + six bodyless REST endpoints `POST /api/match/autoplay/:matchId/{pause,resume,step-forward,step-back,restart,go-to-end}` returning a standardized `{ ok, paused, historyLength, cursor, mode, uiState?, error? }` envelope + `runBotMatch` integration (initial + per-move `pushState`, `waitIfPaused()` gate, `getActiveDelay()` substitution, exit-path cleanup). Rewind is REST-only and visual-only — no `boardgame.io` mutation, no persistence (buffer = Class 1 Runtime State per D-16306). Six new whole API-catalog rows (D-11804, `Status: Wired`, `Auth: guest`). Paired with WP-164 (client), which hard-deps these endpoints landing on `main` first. Hard-deps: WP-090, WP-118 — both ✅. D-16301..D-16309 Active. New pure helper `playbackController.mjs` + `playbackController.test.ts` (10 tests) + `autoplay.mjs` integration (controller map, `withRegisteredController` try/finally cleanup, `recordAndPace` per-move push+gate+delay-substitution, six bodyless endpoints). Server test baseline 313/1/66 → 323/1/66 (+10; the 1 fail is the pre-existing `join-match.test.ts` "missing --name flag" carried since WP-106). RS-1 → `{ kind: 'spectator' }` audience; RS-2 → `koaContext.params.matchId`. Three execution amendments folded inline (A1 `.test.mjs`→`.test.ts` per CLAUDE.md + the `src/**/*.test.ts` runner; A2 D-16301 cursor-invariant reword — cursor is controller-private, `pushState` is the forward reconciler, grep retargeted to "zero cursor writes in `autoplay.mjs`"; A3 `server build`→`pnpm -r build` since the server runs via tsx with no build script). 3 source + API catalog (6 whole rows, `Wired`/`guest`) + governance (DECISIONS/WORK_INDEX/EC_INDEX/STATUS/ROADMAP-MINDMAP + WP/EC amendment notes). 01.5 NOT INVOKED (autoplay-only; no engine-surface wiring). 01.6 SKIPPED (no new long-lived cross-layer abstraction; the controller is a self-contained in-process state machine). See [WP-163](WP-163-autoplay-playback-server.md) + [EC-180](../execution-checklists/EC-180-autoplay-playback-server.checklist.md).

- [x] WP-165 — Autoplay Status Endpoint (Server). Done 2026-05-19 (EC-182). Drafted + executed 2026-05-19, baseline pre `0f4873b` / post at merge; pre-flight READY, copilot PASS. Adds one side-effect-free read endpoint `GET /api/match/autoplay/:matchId/status` so the WP-164 client can tell an autoplay match (200) from a normal live match (404) without a URL marker. New exported handler `handleAutoplayStatusRequest` + `router.get('/api/match/autoplay/:matchId/status', …)` registration in `autoplay.mjs`; reuses WP-163's `getController` + `buildResponse` + `handlePlaybackRequest` (no duplicated 404/500 logic); `200` → `{ ok, paused, historyLength, cursor, mode }` (no `uiState` — metadata only); `404` → the not-found envelope; strictly read-only (no controller mutation). New `autoplayStatus.test.ts` (7 tests: 200 envelope w/ mode + no `uiState`, 404, no-mutation invariant across cursor/paused/historyLength/getActiveDelay/mode, pause/stepBack-rewound/resume reflections, match-end lifecycle 404). One new API-catalog row (D-11804, `Wired`/`guest`). Six WP-163 POST routes unchanged (grep = 6). Server test baseline 323/1/66 → 330/1/66 (+7; the 1 fail is the pre-existing `join-match.test.ts` "missing --name flag"). No amendments; no `01.5` wiring (autoplay-only); `01.6` SKIPPED (thin read-only composition of existing tested helpers — no new abstraction). D-16501 Active. Hard-dep: WP-163 ✅. Paired with WP-164 (now unblocked). 1 modified + 1 new test source + governance. See [WP-165](WP-165-autoplay-status-endpoint-server.md) + [EC-182](../execution-checklists/EC-182-autoplay-status-endpoint-server.checklist.md).

- [x] WP-177 — Autoplay Rewind Requester Audience (Server). Done 2026-05-25 (EC-199). Server-only. Scopes D-16303 so rewind `uiState` is filtered for the requester's audience (player when identity headers are valid; spectator otherwise). New `resolveRequesterAudience` helper validates optional `X-Player-ID` / `X-Credentials` headers against boardgame.io match metadata; parameterizes `rewindUIState` with audience; threads audience through 3 rewind call sites. No engine change (`filterUIStateForAudience` already supports player audiences). Paired with a future client WP (sends headers from `autoplayPlayback.ts`). Hard-deps: WP-163, WP-164, WP-165 — all ✅. D-17701 Active (scopes D-16303). Server test baseline 385/0/66 → 393/0/66 (+8 new in `rewindAudience.test.ts`). API catalog 3 rows updated (step-forward, step-back, restart). `playbackController.mjs` byte-identical; status/pause/resume/go-to-end byte-identical. 01.5 NOT INVOKED (no engine surface). 01.6 SKIPPED (thin audience-derivation helper consuming existing tested contracts — no new abstraction). See [WP-177](WP-177-autoplay-rewind-requester-audience.md) + [EC-199](../execution-checklists/EC-199-autoplay-rewind-requester-audience.checklist.md).

- [x] WP-178 — Card Image Rendering on Play Surface (`apps/arena-client/src/components/play/**`). **Done** 2026-05-25 (EC-201). Client-only. New reusable `<CardTile>` component rendering card images (image mode with lazy loading + cost badge) or text fallback (fallback mode); wired into HandRow, CityRow, HQRow, MastermindTile, YourDeckDiscardZone, SchemeTile. Single rendering surface enforced (no `<img>` in parent components). Arena-client baseline 427 → 444 tests / 0 fail. Build + typecheck green. All grep gates pass. No engine/registry/server changes. No new dependencies. Hard-deps: WP-111, WP-172, WP-173, WP-100, WP-129 — all ✅. See [WP-178](WP-178-card-image-rendering.md) + [EC-201](../execution-checklists/EC-201-card-image-rendering.checklist.md).

- [x] WP-180 — Build-Time Version Stamping (Cross-App). **Done** 2026-05-25 (EC-204). Injects `__APP_VERSION__` + `__BUILD_TIMESTAMP__` + `__GIT_SHA__` into every Vite app via `vite.config.ts` `define` (git SHA with try/catch fallback to `'unknown'`); adds a fixed-position `<VersionBadge>` footer component (byte-identical template+style across all four apps) to arena-client, registry-viewer, dashboard, legends-board; adds `GET /api/version` endpoint to server (process-start timestamp, not build time — D-18001). Per-app component over shared `packages/ui` package (D-18002). Build + typecheck green. All grep gates pass. No engine/registry/preplan changes. D-18001, D-18002. See [WP-180](WP-180-build-version-stamping.md) + [EC-204](../execution-checklists/EC-204-build-version-stamping.checklist.md).

- [x] WP-164 — Autoplay Playback Controls (Client). Done 2026-05-19 (EC-181). Drafted + executed 2026-05-19, baseline pre `ed301c2` / post at merge; pre-flight READY, copilot PASS. Client half of media-player playback for "Watch Bot Play": new service `autoplayPlayback.ts` (`getStatus` + six controls via `buildApiUrl`, D-16101 — 7 `buildApiUrl` sites; `getStatus` resolves the envelope on 200 / `null` on 404 / **throws** on any other fault, never coerced to `null`; injects `setSnapshot` iff `uiState` truthy — sole new non-test caller; also exports the pure `resolveAutoplayGating` mount/gating helper + `STATUS_RETRY_DELAY_MS = 1000`), new `AutoplayControls.vue` (5 buttons + pause/resume toggle, glyphs `⏮ ⏪ ⏸/▶ ⏩ ⏭`; disabled matrix; REWIND affordance keyed on `isRewound = cursor < historyLength - 1`, not the nonexistent `mode === 'rewind'`; no `fetch`, no store import — game-over via the `isGameOver` prop) + matched `.test.ts`. `PlayDesktop.vue` gains a `matchId` prop, probes `getStatus` on mount with one bounded retry (absorbs the WP-165 transient-init 404), and mounts the bar only when the probe resolves non-null (D-16501; gates out normal PvP). `matchId` prop-drilled `App.vue` (additive `:match-id` bind, no `parseQuery` / route change) → `PlayViewport.vue` (forwarded to `<PlayDesktop>` only) → `PlayDesktop.vue`. `mode` read directly (D-16304); live broadcast wins (D-16301); no debounce (D-16309); no `game-engine/setup` import (D-14401); `uiState.ts`/`client/bgioClient.ts`/`LobbyView.vue` untouched. Consumes existing decisions — no new D-entries. Hard-deps: WP-163 ✅, WP-165 ✅, WP-161 ✅, WP-061 ✅. arena-client test baseline 326/0/0 → 361/0/0 (+35: 19 service + 14 component + 2 page-gating); `pnpm -r build` exits 0. 5 source (2 new + 3 mod: `PlayDesktop.vue`, `PlayViewport.vue`, `App.vue` additive prop) + 2 tests + governance. No amendments; 01.5 NOT INVOKED (`apps/arena-client/src/**` only); 01.6 SKIPPED (UI consumer of existing tested contracts; no new abstraction). See [WP-164](WP-164-autoplay-playback-client.md) + [EC-181](../execution-checklists/EC-181-autoplay-playback-client.checklist.md).

- [x] WP-161 — Arena Client API Base URL Surfacing. Done 2026-05-18. Adds new build-time client env var `VITE_API_BASE_URL` consumed via a new helper `apps/arena-client/src/lib/api/apiBaseUrl.ts` (exports `apiBaseUrl` + `buildApiUrl(path)`); rewrites all 7 fetch sites across the 4 API client files (`ownerProfileApi.ts` ×3, `billingApi.ts` ×2, `adminBillingApi.ts` ×1, `profileApi.ts` ×1) to prefix paths via `buildApiUrl(...)` instead of issuing relative `/api/*` URLs. Surfaced during WP-160 smoke verification: the SPA on `legendary-arena-play.pages.dev` was issuing `fetch('/api/me/profile', …)` which resolved to `pages.dev/api/me/profile` (SPA fallback returned HTML), causing `await response.json()` to throw and `MyProfilePage` to hang on "Loading…". The 4 API client files were inherited from WP-104 / WP-108 / WP-110 / WP-102; the relative-URL pattern had never been exercised end-to-end on production because no client had a sign-in flow until WP-160. Mirrors the `VITE_SERVER_URL` precedent (consumed at `lobby/lobbyApi.ts:21`); local-dev fallback is `http://localhost:8000` (loud-failure-by-default if production env var is missing). Rejected alternative: CF Pages `_redirects` proxy (per D-16101 — hardcoded API hostname in SPA repo; doesn't generalize across environments; env-var-per-environment is the right shape). No wire-shape change; no test count change (baseline 326 preserved); no new dep; no `apps/server/src/**` / `packages/**` / `data/**` / `api-endpoints.md` touch. 01.5 NOT INVOKED. 01.6 SKIPPED (mechanical URL-prefix change; no long-lived abstraction; helper is 5 lines). Operator post-merge: set `VITE_API_BASE_URL=https://api.legendary-arena.com` in CF Pages Production scope → retry deployment → smoke-retest (the WP-160 smoke this WP unblocks). Hard-deps: WP-104, WP-106, WP-108, WP-110, WP-132, WP-133, WP-160 — all ✅. D-16101. 10 files (1 new + 5 modified source + 4 governance). See [WP-161](WP-161-arena-client-api-base-url.md) + [EC-175](../execution-checklists/EC-175-arena-client-api-base-url.checklist.md).

- [x] WP-160 — Hanko Client UI (Production Sign-In Surface for arena-client). Done 2026-05-18. Client-only WP shipping the production sign-in flow on `apps/arena-client/`: new Pinia auth store at `src/stores/auth.ts` (Composition-API `defineStore('auth', () => …)` with closed state `{ token, accountId, isAuthenticated computed }` + 3 actions `setSession` / `clearSession` / `bootstrapFromCachedToken`); broker SDK wrapper at `src/auth/hankoClient.ts` (single-file broker-confined per F-2 extended to client; 9 exports — 4 functions + 4 interfaces + 1 typed error class; `__hankoFactory` test seam per caller-injected-provider precedent; dynamic `import('@teamhanko/hanko-elements')` inside the production factory keeps the broker bundle out of the node:test runner); new `LoginPage.vue` at the new `?route=login` route discriminator (closed-set state `'initializing' | 'ready' | 'unavailable' | 'signing-out'`; verbatim banner copy locked); extended App.vue with route-guard logic for `me` + `admin-billing` (one-shot setup-time mutation gated by `isAuthBootstrapping` ref); MyProfilePage.vue cutover `readAuthToken()` from `localStorage.getItem('authToken')` placeholder to `useAuthStore().token`; new "Sign out" button + handler invoking `signOutCurrentSession` → `clearSession` → navigate to lobby (fail-safe — broker-logout rejection is silenced). New env var `VITE_HANKO_TENANT_BASE_URL` (mirrors server `HANKO_TENANT_BASE_URL`). Closes the WP-099 → WP-112 → WP-126 → WP-131 stack at the client boundary; first end-to-end authenticated path on production. Unblocks WP-101 / WP-104 / WP-106 / WP-108 / WP-132 / WP-133 + the future WP-159/WP-107 admin-session client cutover. SDK API drift folded inline at execution time: WP body referenced `hanko.user.logout()` but `user` is `private readonly` on the SDK's `Hanko` class — public method is `hanko.logout()` directly (verified against 2.4.0 and 2.6.0 dist `.d.ts`); D-16004 Decision text updated to reflect reality. Hard-deps: WP-099, WP-101, WP-104, WP-106, WP-108, WP-112, WP-126, WP-131, WP-132, WP-133, WP-052, WP-090 — all ✅. 01.5 NOT INVOKED (no engine surface). 01.6 post-mortem authored (new long-lived client-side auth seam; broker abstraction held with one caveat — `HankoLike` test-seam interface mirrors the SDK shape structurally). main.ts byte-identical (Pinia auth store lazy-initializes on first `useAuthStore()` call). All grep gates pass: F-1 (zero `'hanko'` quoted strings), F-2 (zero static `@teamhanko/` imports outside `auth/hankoClient.ts`), zero `localStorage.getItem('authToken')` matches, zero `hanko|@teamhanko` substrings in `stores/auth.ts`, zero clock/RNG reads in auth code. D-14401 still green (broker bundle in own 167 kB lazy chunk; no `node:*` leakage). arena-client test baseline 311 → 326 pass (+15: 8 wrapper + 7 store), 0 fail, 0 skipped, 0 todo. D-16001..D-16011 Active. 13 files (10 source — `main.ts` byte-identical so not in diff — + `pnpm-lock.yaml` mechanical + governance). See [WP-160](WP-160-hanko-client-ui.md) + [EC-174](../execution-checklists/EC-174-hanko-client-ui.checklist.md) + [01.6 post-mortem](../post-mortems/01.6-WP-160-hanko-client-ui.md).

- [x] WP-159 — Admin Session Gate (Session-Based Admin Authentication). Done 2026-05-17. Server-only library addition shipping `requireAdminSession(request, options): Promise<AdminSessionResult>` at `apps/server/src/auth/adminSession.ts` — composes WP-112's `requireAuthenticatedSession` orchestrator with a new boolean admin authorization flag on `legendary.players` (migration 014, additive `ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE` + `COMMENT ON COLUMN` documenting the operator-granted semantics and the locked read path). Closed-union error surface `'unauthorized' | 'forbidden' | 'lookup_failed'` with 5 canonical static `reason` strings (exact-string asserted in tests). Strict triple-equals on the admin flag (no truthy coercion); row-schema typeof guard precedes the boolean check (non-boolean → `lookup_failed`); multi-row → `lookup_failed` (data-integrity fault, fail-closed despite UNIQUE constraint making it unreachable); zero rows → `lookup_failed`; DB throw → `lookup_failed`; no caching, no memoization, no fallback path. Bidirectional Set drift test (test 9). Repo-wide grep gate enforces `adminSession.ts` is the ONLY file issuing `SELECT ... is_admin` (load-bearing seam for future role/permission migration). Adds `admin-session-required` to the `api-endpoints.md` Auth taxonomy (taxonomy now 5 values) + new Library-only row for `requireAdminSession`. Deliberately does NOT cut over WP-110's `/api/admin/billing/history` route (separate follow-up swap WP); WP-110's `adminGate.ts` byte-identical pre/post. Unblocks WP-107 (the first caller; now flipped to "ready for execution"). Hard-deps: WP-052, WP-101, WP-112, WP-126, WP-131 — all ✅. 01.5 NOT INVOKED (no engine surface touched). 01.6 post-mortem authored (new long-lived auth seam). Pre-existing `join-match.test.ts` failure (1 fail, unrelated to WP-159 scope) carried forward — see STATUS.md WP-106 entry for context. PS-1 (first-admin UUID grant) deferred to operator-mediated SQL post-merge. Server test baseline 304 → 313 pass (+9 new), 1 pre-existing fail, 66 skipped, 0 todo. D-15901, D-15902. 7 files. See [WP-159](WP-159-admin-session-gate.md) + [EC-173](../execution-checklists/EC-173-admin-session-gate.checklist.md).

- [x] **(deferred)** Fix CLI credentials field drift in `apps/server/scripts/join-match.mjs` (D-9001). Missing `playerID` + wrong `result.credentials` field name. CLI-only; no deps. Done 2026-05-16.

- [x] **(deferred placeholder closed by WP-139 / D-13807 — 2026-05-08)** Classify `apps/registry-viewer/` in `docs/ai/REFERENCE/02-CODE-CATEGORIES.md` → resolved by D-13807, which defines a new `docs-app` category covering both `apps/registry-viewer/` and `apps/wiki-viewer/` (introduced by WP-139). The new category is documented in `02-CODE-CATEGORIES.md` Category Summary table + Definitions section; D-13807 is appended to `DECISIONS.md`. Closure happened in the same governance pass that drafted WP-139 to avoid re-inheriting the gap a fourth time.
- [x] WP-139 — Engineering Wiki Viewer (Hugo, Build-Time Projection). **Executed 2026-05-08 — Done 2026-05-08 (commit `5a47da2`)
- [x] WP-127 — Registry Viewer: Grid Tile Team & Ability Text (Threshold-Gated) — Done 2026-05-02 (commit `1323266`)
- [x] WP-125 — Registry Viewer: Card Abilities Effect-Tag Filter — Done 2026-05-01 (commit `47154b2`)
- [x] WP-124 — Registry Viewer: Theme Zoom Slider — Done 2026-05-01 (commit `078e234`)
- [x] WP-123 — Viewer cardType Widening and `set.other[]` Dispatch — Done 2026-05-01 (commit `fbb5174`)
- [x] WP-122 — Viewer Henchman flattenSet Emission Fix — Done 2026-05-01 (commit `a5c1653`)
- [x] WP-121 — Registry Viewer: Card Zoom Slider — Done 2026-05-01 (commit `e3c6af7`)
- [x] WP-113 — Engine-Server Registry Wiring + Match-Setup Validator / Builder ID Alignment — Done 2026-04-27
- [x] WP-111 — UIState Card Display Projection (Engine-Side) — Done 2026-04-29 (commit `f842f71`)
- [x] WP-086 — Registry Viewer Card-Types Upgrade — Done 2026-04-29 (commit `ccc6d0e`)
- [x] WP-115 — Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap — Done 2026-05-01
- [x] WP-114 — Registry Viewer URL-Parameterized Setup Preview ("Game of the Week") — Done 2026-04-30 (commit `c059199`)
- [x] WP-103 — Server-Side Replay Storage & Loader — Done 2026-04-25 (commit `fe7db3e`)
- [x] WP-116 — Disconnect & Reconnect Semantics (Architecture) — Done 2026-04-30 (commit `cddfa3f`)
- [x] WP-117 — Client Routing Strategy (Architecture) — Done 2026-04-30 (commit `23872a3`)
- [x] WP-118 — HTTP API Surface Catalog (Architecture) — Done 2026-04-30
- [x] WP-119 — Architecture Doc Hygiene — Done 2026-04-30

---

## Pre-Planning System (Parallel-Safe with Phase 4+)

Reduces multiplayer downtime by providing a sandboxed speculative planning
system for waiting players. Design constraints in
`docs/ai/DESIGN-CONSTRAINTS-PREPLANNING.md`, architecture in
`docs/ai/DESIGN-PREPLANNING.md`.

All pre-planning code lives in `packages/preplan/` — outside the game engine.
The preplan package may import engine type definitions only (never runtime
code, never `boardgame.io`).


- [x] WP-056 — Pre-Planning State Model & Lifecycle — Done 2026-04-20 (commit `eade2d0`)
- [x] WP-057 — Pre-Plan Sandbox Execution — Done 2026-04-20 (commit `8a324f0`)
- [x] WP-058 — Pre-Plan Disruption Pipeline — Done 2026-04-20 (commit `bae70e7`)
- [x] WP-059 — Pre-Plan UI Integration (Store, Notification, Step Display) — Done 2026-04-26 (commit `5c5fc1e`)
- [x] WP-070 — Live Mutation Middleware (Pre-Plan ↔ Engine Disruption Wiring) — Done 2026-05-15 (commit `a15490d`). EC-161.


---

## Dependency Chain (Quick Reference)

```
Foundation Prompts: 00.4 → 00.5 → 01 → 02
                                        │
WP-001 (coordination — complete)        │
                                        ▼
                    WP-002 ──────────── WP-003
                       │                  │
                       └────── WP-004 ────┘
                                  │
                    WP-005A → WP-005B → WP-006A → WP-006B
                                                      │
                    WP-007A → WP-007B → WP-008A → WP-008B
                                                      │
                    WP-009A → WP-009B → WP-010 → WP-011 → WP-012 → WP-013
                                                                        │
                    WP-014 → WP-015 → WP-016 → WP-017 → WP-018 → WP-019 → WP-020
                                                                              │
                    WP-021 → WP-022 → WP-023 → WP-024 → WP-025 → WP-026
                                                                        │
                    WP-027 → WP-028 → WP-029 → WP-030
                       │                            │
                       └──── WP-048 (+ WP-020) ─────┘
                                            │
                    WP-031 → WP-032 → WP-033 → WP-034 → WP-035
                                                              │
                    WP-036 ──────────→ WP-049 (+ WP-048) → WP-050 → WP-051
                                                                        │
                    WP-052 (+ WP-004, WP-027) ←─────────────────────────┘
                       │
                    WP-053 (+ WP-048, WP-027) ←── WP-052
                       │
                    WP-054 lib (Library-only, cherry-picked) ←── WP-053
                       │
                    WP-115 HTTP routes (+ WP-054 lib + pg.Pool bootstrap)
                    
                    WP-036 → WP-037 → WP-038 → WP-039 → WP-040

                    Pre-Planning (parallel with Phase 4+):
                    WP-006A + WP-008B → WP-056 → WP-057 → WP-058
                                                            │
                    WP-059 → WP-070 (live-mutation middleware, deferred placeholder)

                    UI Implementation Chain (Phase 6, parallel with Phase 7 where deps allow):
                    WP-065 (Vue SFC Test Transform — prerequisite for all UI test packets)
                       │
                    WP-028 + WP-065 → WP-061 → WP-062 (+ WP-029, WP-048)
                                        │          │
                                        │          └── future spectator HUD WP (+ WP-029)
                                        │          └── WP-090 (+ WP-011, WP-032, WP-061, WP-089)
                                        │          └── future card-tooltip WP (+ registry client access)
                                        │
                                        └── WP-064 (+ WP-028, WP-027)
                                              ▲
                                              │
                    WP-027 + WP-028 → WP-063 ─┘
                    (WP-063 defines ReplaySnapshotSequence consumed by WP-064)

                    Engine→Client Projection Wiring (prerequisite for WP-090):
                    WP-028 + WP-029 → WP-089 (LegendaryGame.playerView)

                    Loadout Authoring + Intake (Registry Viewer → Lobby):
                    WP-093 (governance: heroSelectionMode envelope field)
                       │
                       ├→ WP-091 (+ WP-003, WP-005A, WP-055) — loadout builder in registry-viewer
                       │
                       └→ WP-092 (+ WP-011, WP-090, WP-091) — lobby JSON intake
                    (WP-093 is a hard prerequisite for both despite higher
                     number — governance-first ordering, not numeric)

                    Auth Stack (Landed 2026-04-27..2026-05-03):
                    WP-099 (Hanko broker selection — D-9901..D-9905; F-1..F-7 gates)
                       │
                       ├→ WP-112 (broker-agnostic orchestrator + SessionVerifier interface
                       │           + findAccountByAuthProviderSub lookup; D-11201 sibling-WP
                       │           architectural choice; D-11202..D-11204)
                       │     │
                       │     └→ WP-126 (Hanko session verifier — apps/server/src/auth/hanko/
                       │              under D-9904 module-path lock; built-ins-only RS256
                       │              via node:crypto per D-12601; per-instance JWKS cache
                       │              per D-12603; closed-set amr lookup per D-12604;
                       │              D-11201 status flips Active → Resolved at this close)
                       │           │
                       │           └→ WP-131 (production request-handler wiring;
                       │              configureSessionValidation({ verifier:
                       │              createHankoSessionVerifier(config), accountResolver:
                       │              productionAccountResolver, database }) at startup;
                       │              D-13101..D-13104)
                       │                   │
                       │                   └→ WP-160 (client sign-in surface;
                       │                      apps/arena-client/src/auth/hankoClient.ts
                       │                      single-file broker confinement extending F-2
                       │                      to client; Pinia store stores/auth.ts holds
                       │                      bearer token; LoginPage.vue at ?route=login;
                       │                      MyProfilePage.vue cutover from localStorage
                       │                      placeholder; D-16001..D-16011 — DRAFTED)
                       │
                       └→ WP-052 authProvider enum unchanged at 'email'|'google'|'discord'
                          (the broker-name value 'hanko' MUST NOT appear; F-1 lock —
                          extended to client by WP-160's broker-invisibility discipline)

                    Profile Surface (Landed 2026-04-28..2026-05-03):
                    WP-052 (identity model + replay ownership)
                       │
                       └→ WP-101 (handle claim flow + 008_add_handle_to_players.sql)
                                │
                                ├→ WP-102 (public profile page — read-only;
                                │           PublicProfileView 4 fields; 404 on no-match)
                                │     │
                                │     └→ WP-104 (owner profile + /me edit;
                                │              009_create_player_profiles_and_links.sql;
                                │              D-10401..D-10408 — sparse PATCH per RFC 7396,
                                │              replace-all-by-list PUT, per-section privacy
                                │              enum defaulting to 'private', HTTPS-only URL,
                                │              6-entry provider allowlist)
                                │           │
                                │           └→ WP-109 (team affiliation; team_id branded type;
                                │                    legendary.teams + team_member_events +
                                │                    team_audit_log; column-additive
                                │                    teamAffiliations[] projection on both
                                │                    PublicProfileView (4→5 keys) and
                                │                    OwnerProfileView (7→8 keys);
                                │                    D-10901..D-10908)
                                │           │
                                │           └→ WP-105..108 (badges / avatar upload /
                                │              integrity admin / funding surface — placeholders)

                    Engine + Server Wiring (Landed 2026-04-27..2026-05-01):
                    WP-100 surfaced silent-empty-deck failure
                       │
                       └→ WP-113 (registry wiring + match-setup ID format lock —
                                <setAbbr>/<slug> qualified format LOCKED on all five
                                entity-ID fields per D-10014; bare slugs / display names
                                / flat-card keys rejected; parseQualifiedId() helper)

                    Registry Viewer Enhancements (Landed 2026-05-01..2026-05-02):
                    WP-066 (image/data toggle) → WP-096 (grid data view; D-9601 setAbbr divergence)
                                                    │
                                                    └→ WP-127 (threshold-gated Team row +
                                                       Ability block at cardSize >= 190px;
                                                       D-9601 amended in place)
                    WP-114 (URL-parameterized setup preview — composable-ownership lock; D-11401..D-11404)
                    WP-121 (card zoom slider — useCardSize composable; D-12101)
                    WP-122 (henchman flattenSet emission fix — flat treatment; D-12201)
                    WP-123 (cardType widening + set.other[] dispatch; D-12301)
                    WP-124 (theme zoom slider — useThemeSize mirrors useCardSize; D-12401)
                    WP-125 (card abilities effect-tag filter — chip ribbon; D-12501)

                    Engine UIState Card Display Projection (Landed 2026-04-29):
                    WP-100 surfaced D-10004 deferral
                       │
                       └→ WP-111 (G.cardDisplayData sibling snapshot + projection-time
                                  display fields on UICityCard / UIMastermindState +
                                  optional parallel arrays on UIHQState.slotDisplay? and
                                  UIPlayerState.handDisplay?; aliasing-defended via
                                  per-entry shallow copies; D-11101..D-11106;
                                  engine 570/126/0 → 604/132/0)
```

**Parallel-safe packets** (no dependency on each other):
- WP-003 (Card Registry) can run alongside WP-002 (Game Skeleton)
- WP-005A and WP-005B have no dependency on WP-004
- WP-030 (Campaign) is parallel to WP-031 (Production Hardening)
- WP-056/057/058 (Pre-Planning) are parallel with Phase 4+ (depend only on WP-006A + WP-008B from Phase 2)
- WP-061 (Client Bootstrap) and WP-063 (Replay Snapshot Producer) are parallel — WP-061 touches only `apps/arena-client/` and WP-063 touches `packages/game-engine/` + new `apps/replay-producer/`; WP-064 joins both chains so it waits for both
- WP-065 (Vue SFC Test Transform) is parallel with every other WP — it touches only `packages/vue-sfc-loader/`; it blocks WP-061, WP-062, WP-064 on the test-harness side only
- WP-099 (Hanko broker governance, docs-only) is parallel with WP-052..WP-103 — it modifies only `00.3-prompt-lint-checklist.md` §7 and DECISIONS.md
- WP-101 (handle claim) and WP-103 (replay storage) are parallel — both extend `apps/server/src/identity/` and `apps/server/src/replay/` respectively; both depend only on WP-052
- WP-114 (registry viewer URL preview) is parallel with WP-091/092 (loadout builder + lobby intake) — depends only on WP-091 (`packages/registry/src/setupContract/` zod schema)
- WP-121 / WP-122 / WP-123 / WP-124 / WP-125 (registry viewer enhancements) are sibling-parallel — each touches only `apps/registry-viewer/`; only WP-127's `cardTileThresholds.ts` consumes WP-121's `useCardSize.ts` composable (sequential)
- WP-126 (Hanko session verifier) consumes only WP-099 (broker selection) and WP-112 (`SessionVerifier` interface + orchestrator); does NOT depend on WP-052 / WP-101 / WP-102 / WP-104 / WP-109 / WP-111 — those WPs all consume the WP-112 caller-injected provider pattern with `verifier: undefined` fail-closed defaults


---

## Conventions Established Across WPs

These decisions were made during packet review and apply to all future packets.
Sessions must not relitigate settled choices without updating DECISIONS.md first.

| Convention | Established in | Rule |
|---|---|---|
| Zones contain `CardExtId` strings only — no card objects | WP-005B, WP-006A | 00.2 §7.1 |
| `makeMockCtx` reverses arrays (not identity shuffle) | WP-005B | 00.3 §12 |
| `Game.setup()` throws `Error` on invalid `MatchSetupConfig`; moves never throw — return void on failure | WP-005B | ARCHITECTURE.md §Section 4 |
| Hero card numeric fields (`cost`, `attack`, `recruit`, `vAttack`) are `string \| number \| undefined` — modifier strings like `"2*"` and `"2+"` exist in real data; strip the modifier and parse integer base; return 0 on unexpected input | WP-003 (`cost`), WP-018 (`attack`/`recruit`), WP-019 (`vAttack`) | ARCHITECTURE.md §Section 2 "Card Field Data Quality" |
| No `boardgame.io` imports in pure helper or rules files | WP-007A, WP-008A, WP-009A | 00.1 non-negotiables |
| Test files use `.test.ts` — not `.test.mjs` | WP-002 onward | project convention |
| Prior packet contract files must not be modified by B packets | WP-006B onward | drift prevention |
| `ZoneValidationError` uses `{ field, message }` — distinct from `MoveError { code, message, path }`; never reuse `MoveError` for zone shape errors | WP-006A | ARCHITECTURE.md §Section 4 |
| Zones other than `deck` start empty at setup — cards enter via moves, not initialization | WP-006B | ARCHITECTURE.md §Section 2 |
| Phase names locked to 00.2 §8.2 mapping — `lobby`, `setup`, `play`, `end`; no alternates | WP-007A | ARCHITECTURE.md §Section 4 |
| `MATCH_PHASES` and `TURN_STAGES` are canonical arrays — drift-detection tests must assert they match their union types | WP-007A | same pattern as `RULE_TRIGGER_NAMES` |
| `G.currentStage` stored in `G`, not `ctx` — inner stage must be observable to moves and JSON-serializable | WP-007B | ARCHITECTURE.md §Section 4 |
| `ctx.events.endTurn()` requires a `// why:` comment | WP-007B, WP-008B | 00.6 Rule 6 |
| `ctx.events.setPhase()` requires a `// why:` comment | WP-011 | 00.6 Rule 6 |
| `MoveResult`/`MoveError` from `coreMoves.types.ts` are the engine-wide result contract — never redefine | WP-008A | single error contract |
| Every move: validate args → check stage gate → mutate G — never mutate before both pass | WP-008B | ARCHITECTURE.md §Section 4 |
| `zoneOps.ts` helpers return new arrays — inputs are never mutated | WP-008B | ARCHITECTURE.md §Section 4 |
| Card references in trigger payloads use `CardExtId`, not `string` | WP-009A | 00.2 §7.1 |
| `RULE_TRIGGER_NAMES` and `RULE_EFFECT_TYPES` arrays must match their union types | WP-009A | drift-detection pattern |
| `HookDefinition` is data-only — no functions | WP-009A | 00.2 §8.2 JSON-serializable |
| `ImplementationMap` handler functions live outside `G` — never stored in state | WP-009B | ARCHITECTURE.md §Section 4 |
| `executeRuleHooks` returns effects; `applyRuleEffects` applies them | WP-009B | separation of concerns |
| `applyRuleEffects` uses `for...of` — never `.reduce()` | WP-009B | 00.6 Rule 8 |
| Unknown effect types push warning to `G.messages` — never throw | WP-009B | graceful degradation |
| Boolean game events stored as numeric counters (`>= 1` for true) | WP-010 | `G.counters` is `Record<string, number>` |
| Loss conditions evaluated before victory when both trigger simultaneously | WP-010 | Legendary rulebook precedence |
| `endIf` delegates to `evaluateEndgame` — no inline counter logic | WP-010 | single source of truth |
| Endgame counters incremented via `ENDGAME_CONDITIONS` constants — never string literals | WP-010 | ARCHITECTURE.md §Section 4 |
| Phase-gated moves live inside the phase's `moves` block — not top-level | WP-011 | boardgame.io phase isolation |
| Phase exit observability: store flag in `G` before `ctx.events.setPhase()` | WP-011 | ARCHITECTURE.md §Section 4 |
| CLI scripts use Node built-in `fetch` — no axios, no node-fetch | WP-011, WP-012 | 00.1 Node v22+ |
| Unit tests for HTTP scripts stub `fetch` — no live server for tests | WP-012 | test isolation |
| Snapshots use zone counts only — no `ext_id` arrays | WP-013 | `MatchSnapshot` is not a copy of `G` |
| Card type classification stored in `G` at setup — moves never import registry | WP-014 | ARCHITECTURE.md §Section 5 |
| `REVEALED_CARD_TYPES` is a canonical array — drift-detection test required; slugs use hyphens not underscores | WP-014 | same drift-detection pattern |
| Pre-planning state lives in `packages/preplan/` — never in `packages/game-engine/` (non-authoritative, per-client) | WP-056 | DESIGN-PREPLANNING.md §3 |
| Reveal ledger is sole authority for rewind — sandbox inspection during rewind is invalid | WP-056 | DESIGN-CONSTRAINTS-PREPLANNING.md #3 |
| Full rewind to clean hand is the baseline — partial plan survival is a future optimization | WP-056 | DESIGN-CONSTRAINTS-PREPLANNING.md #3 |
| Speculative PRNG uses seedable LCG, never `ctx.random.*`; `Date.now()` acceptable for seed entropy | WP-057 | DESIGN-PREPLANNING.md §3 |
| Disruption pipeline is one cohesive workflow (detect → invalidate → rewind → notify) — never split into separate WPs | WP-058 | DESIGN-PREPLANNING.md §11 |
| `AccountId` is a TypeScript branded type (`string & { readonly __brand: 'AccountId' }`); deliberately distinct from engine `PlayerId`; minted once at signup via `node:crypto.randomUUID()`; never reused, never derived from broker `sub` | WP-052 | D-5201 + D-8701 |
| Single-parameter `Result<T>` shape — `\| { ok: true; value: T } \| { ok: false; reason: string; code: IdentityErrorCode }`; the failure-payload `code` field is structurally typed `IdentityErrorCode` but consuming layers emit their own closed-union strings into it via `as never`; the consuming switch translates back via `as <ClosedUnion>` cast at exactly one site | WP-052 / WP-112 | D-5201 + the orchestrator translation site at `sessionToken.logic.ts:191-193` |
| Server-side broker is invisible at rest — the literal string `'hanko'` MUST NOT appear as an `auth_provider` enum value, fixture, seed, or quoted string anywhere under `apps/`, `packages/`, or `data/migrations/`; the federated-IdP claim mapping outputs only `'email' \| 'google' \| 'discord'` (the WP-052 enum verbatim) | WP-099 | D-9901 + D-9902 + F-1 |
| Hanko-specific code is confined to `apps/server/src/auth/hanko/` — every `@teamhanko/*` import, every `hanko.io` URL, and every Hanko-specific type lives only under that directory; `render.yaml` and `.env.example` exempt by design (they declare env vars, not import broker code); the F-2 grep gate enforces this at every commit | WP-099 / WP-126 | D-9904 + F-2 |
| Migration slot numbers are sequential and non-recyclable — once a slot is used (e.g., `004_create_players_table.sql`), it stays used; future WPs claim the next free slot and document the slot number in their §Locked Values | WP-052 onward | D-5202 (identity slot) + WP-101 (slot 008) + WP-104 (slot 009) + WP-109 (slot 010) precedent |
| Set-qualified `<setAbbr>/<slug>` ID format is LOCKED on all five entity-ID fields of `MatchSetupConfig` (`schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`); bare slugs / display names / flat-card keys are rejected; `parseQualifiedId(input)` rejects malformed shapes; validator + builder agree on the single source of truth | WP-113 | D-10014 |
| HTTP API catalog at `docs/ai/REFERENCE/api-endpoints.md` is the **authoritative network contract** — any WP that adds, modifies, removes, or changes the status of an HTTP endpoint OR a `Library-only` function reachable via direct import from `apps/server/src/**` MUST update this file in the same commit; closed-set Status taxonomy `{ Wired, Shipped-but-unwired, Library-only, Pending }`; closed-set Auth taxonomy `{ guest, handle-required, authenticated-session-required }`; replace-whole-row merge semantics (no partial-column updates) | WP-118 | D-11804 |
| Caller-injected provider pattern is the default architectural seam for fallible dependencies (`SessionVerifier`, `AccountResolver`, `JwksFetcher`, `LeaderboardDependencies.checkParPublished`) — production wiring binds the seam at startup; tests inject fakes at construction time; no global `fetch` stubbing, no module-level singletons, no parallel typed surfaces | WP-053 / WP-054 / WP-112 / WP-126 | D-5306 + D-11201 + D-12603 |
| Sibling-WP architectural choice for broker-specific surfaces — the broker-agnostic orchestrator + interface ships in one WP (e.g., WP-112), the broker-specific implementation ships in a sibling WP (e.g., WP-126); zero broker-specific imports in the orchestrator's files; the `[DECISION REQUIRED]` block for broker SDK selection lives in the sibling WP, never the orchestrator | WP-112 / WP-126 | D-11201 (Active at WP-112 close → Resolved at WP-126 close) |
| Per-instance state for caller-injected provider seams — every factory call constructs an independent state container (e.g., per-instance JWKS cache, per-instance fetcher binding); no module-level singleton; tests assert independence by constructing two factories and verifying cross-cache misses | WP-126 | D-12603 |
| Closed-set object-literal lookup for federated-IdP mapping — the lookup table `HANKO_IDP_TO_AUTH_PROVIDER: Readonly<Record<string, AuthProvider>>` enumerates every accepted federation/native key; no string-prefix check (`startsWith('ext:')` forbidden); no regex; unknown values resolve to `Result.fail({ code: 'unknown_provider' })` | WP-126 | D-12604 |
| JWKS cache aliasing defense at insertion — `Object.freeze({ ...key })` at refresh time so a caller mutating the returned key either no-ops (sloppy mode) or throws (strict mode); the cache's stored shape is preserved across subsequent `getKey(kid)` calls (alternative: defensive shallow copy at return; insertion-time freeze is cheaper) | WP-126 | D-12603 + copilot Issue #17 |
| Single-site default substitution for optional config fields — when an optional field is `undefined`, the default substitutes at exactly one site (typically the verifier factory body, NOT the cache); downstream code always sees a concrete value; two substitution sites invite drift if the default needs to change | WP-126 | D-12603 + PS-3 |
| Tests fail loudly on missing test database — `hasTestDatabase ? {} : { skip: 'requires test database' }` inline conditional skip pattern at the `test()` call; never a `beforeEach` row-purge (the §2 SQL-write gate forbids it in scope); per-test uniqueness via per-suite-run identifier prefix avoids `UNIQUE`-constraint conflicts across runs | WP-052 / WP-101 / WP-102 / WP-104 / WP-109 / WP-112 | D-5201 §3.1 |
| `01.5 NOT INVOKED` is the default declaration on every WP §Definition of Done that does not modify `LegendaryGameState`, `buildInitialGameState`, `LegendaryGame.moves`, or any phase hook; engine surface change requires explicit `01.5 IS INVOKED` declaration with replay-hash literal updates as 01.5-cascade allowlist additions | WP-013 onward; WP-111 IS INVOKED | D-1320 + the WP-111 §Locked Values cascade |
| Catalog-update obligation lands in the same commit as the WP that touches the network/library surface — never as a separate `SPEC:` follow-up commit (per D-11804 single-row-graduation semantics); pre-flight verifies the catalog row before `git commit` | WP-118 onward | D-11804 |


---

## Cross-Cutting Governance Decisions

Decisions that affect multiple phases or span the full pipeline.
Full details are in `DECISIONS.md`; this section provides searchable summaries.

### Match Setup Schema and Validation Alignment (2026-04-11)

Formal audit and correction of the Match Setup schema and validation model
to ensure 1:1 alignment with the engine's authoritative `MatchSetupConfig`.

**Outcomes:**
- Composition schema corrected to match engine contract (9 required fields;
  `heroDeckIds` not `heroIds`; added `henchmanGroupIds` and all 4 count fields)
- `playerCount` constrained to engine limit (1-5, per `game.ts` maxPlayers)
- Redundant `not/anyOf` exclusions removed; fail-closed via `additionalProperties: false`
- Identifier format aligned to content registry (kebab-case `^[a-z0-9-]+$`)
- Two-layer structure documented: envelope (server) vs composition (engine setupData)
- Seed-to-PRNG integration gap documented as future task (D-1248)

**Artifacts:**
- `docs/ai/REFERENCE/MATCH-SETUP-JSON-SCHEMA.json`
- `docs/ai/REFERENCE/MATCH-SETUP-SCHEMA.md`
- `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md`
- `DECISIONS.md` entries D-1244 through D-1248

**Impact:** Locks Match Setup as a deterministic, engine-aligned, governance-enforced
configuration boundary for game creation, replays, simulation, and competitive integrity.

### Customer-Safe Configuration Knobs (2026-04-11)

Defines which match setup fields may be adjusted in response to customer
feedback without requiring engine changes, and which surfaces are explicitly
non-configurable.

**Artifact:** `docs/ai/REFERENCE/SAFE-KNOBS.md`

**Key policy:** Safe knobs are data-only configuration parameters expressible
in match setup or its envelope. Runtime switches, conditional logic, and
rule modifications are not safe knobs. Knobs are tiered by risk (Tier 1
fully safe, Tier 2 guarded, Tier 3 gated/future). No knob may move to a
higher tier without a documented decision.


### Auth Stack — Broker-Agnostic Orchestrator + Hanko-Specific Verifier (2026-04-27..2026-05-03)

Three WPs ship the full auth stack with F-1..F-7 replacement-safety gates:
WP-099 (governance, `f6cd591`) selects Hanko as broker; WP-112 (broker-agnostic, `d0fefa3`)
ships the orchestrator + `SessionVerifier` interface; WP-126 (broker-specific, `2aa7690`)
ships `createHankoSessionVerifier` with built-ins-only RS256 + per-instance JWKS cache.
D-11201 flips Active → Resolved at WP-126 close. Future request-handler WP wires
`configureSessionValidation()` at server startup. Decisions: D-9901..D-9905 (WP-099);
D-11201..D-11204 (WP-112); D-12601..D-12604 (WP-126).

---

## Adding a New Work Packet

1. Create `docs/ai/work-packets/WP-NNN-<topic>.md` using the required template
   in `docs/ai/REFERENCE/00.1-master-coordination-prompt.md`
2. Add a line to the appropriate phase section in this file **before** executing it
3. Run the lint checklist (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`)
   against the new packet — it must pass before Claude Code touches it
4. On completion, update the line to `[x]` with the completion date


---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[x]` | Complete — Definition of Done met |
| `BLOCKED` | Cannot proceed — see `docs/ai/STATUS.md` for details |
| ✅ Reviewed | Packet audited and ready for Claude Code |
| ⚠️ Needs review | Packet must be reviewed before execution |

---

*Last updated: this coordination review session (see git log for date)*
*Updated by: the Claude Code session at the close of each Work Packet (Step 6 of the Session Execution Protocol in 00.1)*
