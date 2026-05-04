# Legendary Arena -- Repository Folder Structure

> This document maps the actual repository layout as of 2026-05-03
> (Phase 6 + Phase 7 + Beta-Launch Pillar + Auth Stack all shipped;
> engine `604/0`, server `124/0/54` after WP-126 landed at `2aa7690`).
> It describes what each directory and key file does, who owns it,
> and what governance rules apply.
>
> **Authoritative for:** folder purposes and ownership.
> **Subordinate to:** `docs/ai/ARCHITECTURE.md` for architectural decisions.

---

## Top-Level Layout

```
legendary-arena/
│
├── .claude/                    # Claude Code coordination (AI governance)
├── .githooks/                  # EC-mode commit hygiene hooks
├── .github/                    # GitHub Actions workflows
│
├── apps/                       # Deployable applications
├── packages/                   # Shared library packages
├── data/                       # Raw card data, metadata, SQL schema, migrations
├── scripts/                    # Standalone CLI tools and diagnostics
├── docs/                       # All documentation
│
├── .env.example                # Definitive environment variable reference (9 vars)
├── .gitignore
├── .gitattributes
├── package.json                # Monorepo root -- workspace scripts
├── pnpm-workspace.yaml         # pnpm workspace configuration
├── pnpm-lock.yaml
├── render.yaml                 # Render.com infrastructure-as-code
└── README.md
```

---

## `.claude/` -- AI Coordination System

The governance layer for AI-assisted development. Loaded automatically
by Claude Code at the start of every session.

```
.claude/
├── CLAUDE.md                   # Root coordination -- EC mode, lint gate, governance set
├── settings.local.json         # Local Claude Code settings (not committed)
└── rules/                      # Per-layer enforcement rules (7 files)
    ├── architecture.md         # Authority hierarchy, layer boundaries
    ├── code-style.md           # Naming, functions, comments, ESM-only
    ├── game-engine.md          # boardgame.io, G, moves, phases, rules pipeline
    ├── persistence.md          # 3 data classes, snapshot rules, what never persists
    ├── registry.md             # Card data loading, schema authority, metadata distinction
    ├── server.md               # Server as wiring-only layer, startup sequence
    └── work-packets.md         # One WP per session, dependency discipline, status rules
```

**Ownership:** Human-authored, Claude-enforced.
**Rule:** Claude must not create new rules files without human approval.

---

## `.githooks/` -- Commit Hygiene (EC Mode)

Repo-local Git hooks enforcing commit message format and staged-file checks.
Installed via `pwsh scripts/git/install-ec-hooks.ps1`.

```
.githooks/
├── pre-commit                  # No secrets, no .test.mjs, no dist/, no node_modules
└── commit-msg                  # EC-###/SPEC/INFRA prefix, forbidden words, EC validation
```

**Commit prefixes enforced:**
- `EC-###: <summary>` -- code changes (requires matching EC file)
- `SPEC: <summary>` -- specification corrections
- `INFRA: <summary>` -- infrastructure and tooling

---

## `.github/workflows/` -- CI

```
.github/workflows/
├── ci.yml                      # Build -> Validate -> Deploy pipeline (registry + viewer)
└── commit-hygiene.yml          # PR mirror of commit hooks (3 parallel jobs)
```

---

## `apps/` -- Deployable Applications

```
apps/
├── arena-client/               # Gameplay client SPA (Vue 3 + Pinia + Vite, WP-061+)
│   ├── src/
│   │   ├── App.vue             # Root component + route discriminator
│   │   ├── components/
│   │   │   ├── hud/            # Arena HUD subtree (WP-062)
│   │   │   ├── log/            # GameLogPanel (WP-064)
│   │   │   ├── play/           # Interactive play surface (WP-100)
│   │   │   └── replay/         # ReplayInspector + ReplayFileLoader (WP-064)
│   │   ├── lib/
│   │   │   └── api/            # Server API wrappers (profileApi, ownerProfileApi, ...)
│   │   ├── lobby/              # LiveMatchView, lobby UI (WP-090, WP-092, WP-100)
│   │   ├── pages/              # PlayerProfilePage (WP-102), MyProfilePage (WP-104)
│   │   ├── replay/             # parseReplayJson + replay loaders (WP-064)
│   │   ├── stores/             # Pinia stores (useUiStateStore, etc.)
│   │   └── fixtures/           # UIState fixtures + replay/three-turn-sample (WP-064)
│   ├── public/                 # Static assets
│   └── dist/                   # Build output (not committed)
│
├── registry-viewer/            # Read-only card browser SPA (Vue 3 + Vite)
│   │                           # cards.barefootbetters.com
│   ├── src/
│   │   ├── components/         # CardGrid, CardDetail, CardDataTile (WP-096),
│   │   │                       # CardSizeSlider (WP-121), AbilityEffectFilter (WP-125),
│   │   │                       # ThemeSizeSlider (WP-124), GlossaryPanel, etc.
│   │   ├── composables/        # useCardSize (WP-121), useThemeSize (WP-124),
│   │   │                       # useCardViewMode, useSetupFromUrl (WP-114),
│   │   │                       # cardTileThresholds (WP-127)
│   │   ├── lib/                # cardTypesClient, cardAbilitiesClient (WP-125),
│   │   │                       # registryClient, themeClient, glossaryClient,
│   │   │                       # devLog, debugMode
│   │   ├── prefs/              # Pinia preferences subsystem (WP-068)
│   │   └── registry/           # Registry client (types + impl, viewer-local)
│   ├── public/                 # Static assets
│   └── dist/                   # Build output (not committed)
│
├── replay-producer/            # CLI tool — produce-replay (WP-063)
│   └── src/                    # First cli-producer-app per D-6301
│
└── server/                     # @legendary-arena/server -- boardgame.io runtime
    ├── src/
    │   ├── index.mjs           # Process entrypoint (SIGTERM, lifecycle)
    │   ├── server.mjs          # Server config (registry + rules + routes, Server())
    │   ├── auth/               # Session-token validation (WP-112)
    │   │   ├── sessionToken.{types,logic,logic.test}.ts  # Broker-agnostic orchestrator
    │   │   ├── accountLookup.{logic,logic.test}.ts        # findAccountByAuthProviderSub
    │   │   └── hanko/          # Hanko-specific verifier (WP-126, D-9904 module-path lock)
    │   │       ├── hankoVerifier.{types,logic,logic.test}.ts  # createHankoSessionVerifier factory + 8-step verify(token)
    │   │       └── jwksCache.{logic,logic.test}.ts            # Per-instance JWKS cache + single-flight + Object.freeze at insertion
    │   ├── competition/        # submitCompetitiveScore + 16-step locked flow (WP-053)
    │   ├── db/                 # Long-lived pg.Pool lifecycle anchor (WP-115)
    │   ├── game/
    │   │   └── legendary.mjs   # Thin re-export of LegendaryGame from game-engine
    │   ├── identity/           # AccountId branded type, players + replay_ownership (WP-052)
    │   │   ├── identity.{types,logic}.ts  # AccountId, GuestIdentity, replay ownership
    │   │   ├── handle.{types,logic}.ts    # claimHandle, findAccountByHandle (WP-101)
    │   │   └── replayOwnership.{types,logic}.ts
    │   ├── leaderboards/       # Public leaderboards library (WP-054) + HTTP routes (WP-115)
    │   ├── par/                # PAR gate consumer (parGate.mjs)
    │   ├── profile/            # Public profile (WP-102) + owner profile + /me edit (WP-104)
    │   │   ├── profile.{types,logic,routes}.ts                # Public profile (read-only)
    │   │   └── ownerProfile.{types,logic,routes}.ts           # Owner profile (authenticated writes)
    │   ├── replay/             # storeReplay + loadReplay (WP-103)
    │   ├── rules/
    │   │   └── loader.mjs      # PostgreSQL rules loader (loadRules, getRules)
    │   └── teams/              # Team affiliation — cooperative cohorts (WP-109)
    │       ├── team.{types,logic,routes,logic.test}.ts        # createTeam, member events, audit log
    │       └── ...
    ├── scripts/                # CLI: create-match.mjs, list-matches.mjs, join-match.mjs
    └── package.json            # Workspace deps: game-engine, registry, boardgame.io, pg
```

**Import rules:**
- `server` may import: `@legendary-arena/game-engine`, `@legendary-arena/registry`, `pg`, Node built-ins
- `server` must NOT import: UI packages, browser APIs
- `arena-client` may import: `@legendary-arena/registry` (type-only), UI framework
- `arena-client` must NOT import: `game-engine` (runtime), `server`, `pg`
- `registry-viewer` may import: `@legendary-arena/registry`, UI framework
- `registry-viewer` must NOT import: `game-engine`, `server`, `pg`
- `replay-producer` may import: `@legendary-arena/game-engine` (type + runtime), `@legendary-arena/registry`, Node built-ins

**WP-126 / D-9904 module-path lock:** every `@teamhanko/*` import (none under D-12601's built-ins-only path), every `hanko.io` URL, and every Hanko-specific type lives **only** under `apps/server/src/auth/hanko/`. The F-2 grep gate (per WP-099 §B) enforces this boundary at every commit.

---

## `packages/` -- Shared Libraries

```
packages/
├── game-engine/                # @legendary-arena/game-engine (604 tests, 132 suites)
│   ├── src/
│   │   ├── index.ts            # Public exports (types, builders, executors, helpers)
│   │   ├── game.ts             # boardgame.io Game() -- phases, moves, validateSetupData
│   │   ├── types.ts            # MatchConfiguration (9 fields), LegendaryGameState
│   │   │                       # (extended via 01.5: cardDisplayData per WP-111)
│   │   ├── matchSetup.types.ts # MatchSetupConfig Zod schema
│   │   ├── matchSetup.validate.ts # Setup validation + CardRegistryReader (WP-113 lock)
│   │   │
│   │   ├── beta/               # BetaFeedback / BetaCohort / FeedbackCategory (WP-037)
│   │   ├── board/              # City, HQ, KO, wounds, bystanders, board keywords
│   │   ├── economy/            # TurnEconomy, cardStats, resource gating
│   │   ├── endgame/            # evaluateEndgame, ENDGAME_CONDITIONS
│   │   ├── governance/         # ChangeCategory / ChangeBudget / ChangeClassification (WP-040)
│   │   ├── hero/               # Hero effect execution, conditional evaluation
│   │   ├── lobby/              # LobbyState, setPlayerReady, startMatchIfReady
│   │   ├── mastermind/         # MastermindState, tactics, fightMastermind setup
│   │   ├── moves/              # Core moves, fight, recruit, zoneOps
│   │   ├── ops/                # OpsCounters / IncidentSeverity / DeploymentEnvironment (WP-035)
│   │   ├── persistence/        # PERSISTENCE_CLASSES, MatchSnapshot, createSnapshot
│   │   ├── replay/             # replayGame, applyReplayStep (WP-080), verifyDeterminism
│   │   ├── rules/              # Hook definitions, execution pipeline, scheme/mastermind handlers
│   │   ├── scheme/             # SchemeSetupInstruction types + executor (WP-026)
│   │   ├── scoring/            # PAR-aware scoring + ScenarioScoringConfig loaders (WP-053a)
│   │   ├── setup/              # buildInitialGameState + buildCardDisplayData (WP-111)
│   │   ├── simulation/         # AI playtesting framework (WP-036)
│   │   ├── state/              # Zone types (CardExtId, PlayerZones, GlobalPiles), validators
│   │   ├── test/               # makeMockCtx (shared test helper)
│   │   ├── turn/               # Turn stages, phase loop, advanceTurnStage
│   │   ├── ui/                 # UIState contract (WP-028) + buildUIState (WP-067, WP-111)
│   │   ├── versioning/         # EngineVersion / VersionedArtifact + checkCompatibility (WP-034)
│   │   └── villainDeck/        # Deck composition, reveal pipeline, card type classification
│   └── dist/                   # Build output (not committed)
│
├── preplan/                    # @legendary-arena/preplan (WP-056..058)
│   ├── src/
│   │   ├── preplan.types.ts    # PrePlan, PrePlanSandboxState, RevealRecord, PrePlanStep (WP-056)
│   │   ├── speculativePrng.ts  # Client-local Fisher-Yates PRNG (WP-057)
│   │   ├── preplanSandbox.ts   # Sandbox factory (WP-057)
│   │   ├── speculativeOperations.ts  # Five speculative ops (WP-057)
│   │   ├── preplanStatus.ts    # PREPLAN_STATUS_VALUES canonical readonly array (WP-057)
│   │   ├── disruption.types.ts                 # Disruption types (WP-058)
│   │   ├── disruptionDetection.ts              # isPrePlanDisrupted (WP-058)
│   │   ├── disruptionPipeline.ts               # executeDisruptionPipeline (WP-058)
│   │   └── preplanEffectTypes.ts               # PREPLAN_EFFECT_TYPES canonical (WP-058)
│   └── dist/                   # Build output (not committed)
│
├── registry/                   # @legendary-arena/registry
│   ├── src/
│   │   ├── schema.ts           # Zod schemas (authoritative field shapes)
│   │   │                       # — extended additively by WP-082, WP-083, WP-091, WP-125
│   │   ├── shared.ts           # flattenSet(), applyQuery(), buildHealthReport()
│   │   ├── setupContract/      # WP-091 — MatchSetupDocument zod schema + validateMatchSetupDocument
│   │   ├── impl/
│   │   │   ├── localRegistry.ts  # Local file loader (uses sets.json)
│   │   │   └── httpRegistry.ts   # HTTP/R2 loader (for browser clients)
│   │   ├── types/              # TypeScript type definitions (RegistryInfo, CardRegistry, etc.)
│   │   └── registry.smoke.test.ts  # Smoke test (node:test) -- loads 40 sets
│   └── dist/                   # Build output (not committed)
│
└── vue-sfc-loader/             # @legendary-arena/vue-sfc-loader (Shared Tooling, WP-065)
    ├── src/                    # @vue/compiler-sfc wrapped in Node 22 module.register() loader hook
    └── dist/                   # Build output (not committed)
```

**Import rules:**
- `game-engine` may import: Node built-ins only
- `game-engine` must NOT import: `registry`, `preplan`, `server`, any `apps/*`, `pg`, `vue-sfc-loader`
- `registry` may import: Node built-ins, `zod`
- `registry` must NOT import: `game-engine`, `preplan`, `server`, any `apps/*`, `pg`
- `preplan` may import: `game-engine` (type-only at compile time, never at runtime)
- `preplan` must NOT import: `boardgame.io`, `registry`, `server`, any `apps/*`, `pg`, `vue-sfc-loader`
- `vue-sfc-loader` is **Shared Tooling** — orthogonal to the main dependency chain; consumed only by `apps/*` test scripts at dev/test time, never at runtime; never appears in any app's runtime `dependencies`

---

## `data/` -- Raw Card Data & Database

Card JSON, metadata lookup files, PostgreSQL schema, and migrations.
This is NOT a package -- it is raw data consumed by other packages.

```
data/
├── cards/                      # Per-set card JSON (40 files: core.json, mdns.json, etc.)
│   ├── core.json
│   ├── dkcy.json
│   ├── mdns.json
│   └── ... (40 total)
│
├── metadata/                   # Lookup tables and glossaries
│   ├── sets.json               # Set index -- THE registry manifest (40 entries)
│   ├── keywords-full.json      # Keyword glossary (123 entries, WP-082)
│   ├── rules-full.json         # Rule glossary (20 entries, WP-082)
│   ├── card-types.json         # Card-types taxonomy (WP-086)
│   └── card-abilities.json     # Card abilities taxonomy (WP-125, EC-127)
│
├── scoring-configs/            # Per-scenario ScenarioScoringConfig (WP-053a, D-5306a)
│   └── <scenario_key>.json
│
├── migrations/                 # PostgreSQL migrations (applied by scripts/migrate.mjs)
│   ├── 001_server_schema.sql   # Rules-engine DDL (legendary.* namespace)
│   ├── 002_seed_rules.sql      # Rules index + rule_docs glossary
│   ├── 003_game_sessions.sql   # Match tracking table (public.game_sessions)
│   ├── 004_create_players_table.sql              # AccountId + auth_provider (WP-052)
│   ├── 005_create_replay_ownership_table.sql     # Replay ownership + visibility (WP-052)
│   ├── 006_create_replay_blobs_table.sql         # Content-addressed replay storage (WP-103)
│   ├── 007_create_competitive_scores_table.sql   # Competitive submissions (WP-053)
│   ├── 008_add_handle_to_players.sql             # Globally unique handle (WP-101)
│   ├── 009_create_player_profiles_and_links.sql  # Owner profile + links (WP-104)
│   └── 010_create_teams_and_membership.sql       # Cooperative cohorts (WP-109)
│
├── schema-server.sql           # Rules-engine DDL (included by 001 migration)
├── seed-server.sql             # Galactus example seed data
├── seed_rules.sql              # Rules text seed data (included by 002 migration)
├── legendary_library_schema.sql  # Full card library schema
└── load_legendary_data.mjs     # Seed/load pipeline
```

**Key distinction:**
- `metadata/sets.json` = set index (abbr, releaseDate) -- used by loaders
- The historical `card-types.json` counter-example (D-1203 silent-failure
  precedent) was deleted by WP-084 (2026-04-21). D-1203 retains the
  narrative for auditability.

---

## `scripts/` -- CLI Tools & Diagnostics

```
scripts/
├── check-connections.mjs       # Node.js ESM -- connection health check (pnpm check)
├── Check-Env.ps1               # PowerShell -- environment/tooling check (pnpm check:env)
├── validate-r2.mjs             # Node.js ESM -- R2 data validation (pnpm validate)
├── migrate.mjs                 # Node.js ESM -- PostgreSQL migration runner (pnpm migrate)
├── Validate-R2-old.ps1         # Legacy PowerShell validator (superseded)
├── ec/                         # EC-mode tooling
│   ├── EC-INDEX.md             # EC status tracking (duplicate of docs/ai)
│   └── health-check.ec.mjs     # EC health check script
└── git/
    ├── install-ec-hooks.ps1    # One-time hook installation
    └── ec-commit.ps1           # Safe commit helper with -Check dry-run mode
```

**Package.json script entries:**

| Command | Script | Purpose |
|---|---|---|
| `pnpm check` | `check-connections.mjs` | Verify all external service connections |
| `pnpm check:env` | `Check-Env.ps1` | Verify local tools (no network needed) |
| `pnpm validate` | `validate-r2.mjs` | Validate R2 card data (4 phases, 40 sets) |
| `pnpm migrate` | `migrate.mjs` | Apply pending PostgreSQL migrations |

---

## `docs/` -- Documentation

### Human-facing docs

```
docs/
├── 00-INDEX.md                 # Table of contents
├── 01-REPO-FOLDER-STRUCTURE.md # This document
├── 01-VISION.md                # Product vision
├── 02-ARCHITECTURE.md          # High-level architecture overview
├── 03-DATA-PIPELINE.md         # R2 -> metadata -> validation flow
├── 03.1-DATA-SOURCES.md        # Authoritative input data inventory
├── 04-DEVELOPMENT-SETUP.md     # Local development guide
├── 05-ROADMAP.md               # Development roadmap (table format)
├── 05-ROADMAP-MINDMAP.md       # Development roadmap (mermaid mindmap)
├── 06-TESTING.md               # Test philosophy, conventions, inventory
├── 07-CLI-REFERENCE.md         # CLI tools reference
├── 08-DEPLOYMENT.md            # Deployment guide
├── 09-CHANGELOG.md             # Changelog
├── 10-GLOSSARY.md              # Term definitions
├── 11-TROUBLESHOOTING.md       # Common issues
├── 12-SCORING-REFERENCE.md     # PAR scoring formula & leaderboard rules
├── 12.1-PAR-ARTIFACT-INTEGRITY.md # PAR artifact hashing rationale
├── 13-REPLAYS-REFERENCE.md     # Replay & game saving system
│
├── devlog/                     # Weekly development journal
├── screenshots/                # UI and validation screenshots
├── prompts-registry-viewer/    # Registry viewer prompts (active)
└── archive prompts-legendary-area-game/  # Legacy prompts (superseded by docs/ai/)
```

### AI coordination system (`docs/ai/`)

```
docs/ai/
├── ARCHITECTURE.md             # Authoritative system architecture (wins over WPs)
├── DECISIONS.md                # 133+ permanent architectural decisions
├── DECISIONS_INDEX.md          # Decision-to-WP traceability index
├── STATUS.md                   # Current project state after each session
│
├── REFERENCE/                  # Authoritative project memory (21 files)
│   ├── 00.1-master-coordination-prompt.md  # Override hierarchy, session protocol
│   ├── 00.2-data-requirements.md           # Canonical data contracts
│   ├── 00.3-prompt-lint-checklist.md       # 28-item quality gate
│   ├── 00.4-connection-health-check.md     # Environment check prompt
│   ├── 00.5-validation.md                  # R2 validation prompt
│   ├── 00.6-code-style.md                  # 15 code style rules
│   ├── 01-render-infrastructure.md         # Server setup prompt
│   ├── 01.1-how-to-use-ecs-while-coding.md # EC workflow
│   ├── 01.2-bug-handling-under-ec-mode.md  # Clause-driven debugging
│   ├── 01.3-commit-hygiene-under-ec-mode.md # Commit format and hooks
│   ├── 01.4-pre-flight-invocation.md       # WP readiness gate template
│   ├── 01.5-runtime-wiring-allowance.md    # Allowlist for structural wiring
│   ├── 02-CODE-CATEGORIES.md               # Code category boundaries
│   ├── 02-database-migrations.md           # Migration runner prompt
│   ├── 03A-PHASE-3-MULTIPLAYER-READINESS.md # Phase 3 exit gate (closed)
│   └── ... (schema refs, safe knobs, phase gates)
│
├── work-packets/               # 66 Work Packets (design authority)
│   ├── WORK_INDEX.md           # Execution order and status tracking
│   ├── PACKET-TEMPLATE.md      # Mandatory WP structure
│   └── WP-001 through WP-060
│
├── execution-checklists/       # 63 Execution Checklists (execution authority)
│   ├── EC-TEMPLATE.md          # EC structure and rules
│   ├── EC_INDEX.md             # EC status tracking
│   └── EC-001 through EC-060 + R-EC-01..03
│
├── prompts/                    # Reusable tooling prompts
│   ├── PRE-COMMIT-REVIEW.template.md       # WP commit gatekeeper
│   ├── PHASE-COMMIT-REVIEW.template.md     # Phase integration checkpoint
│   ├── generate-execution-checklist.prompt.md
│   └── ... (standardization, auto-tighten)
│
└── invocations/                # 62 session invocation records
    ├── session-wp002 through session-wp026
    └── session-fp01, session-fp02
```

---

## Authority Hierarchy

Files are listed from highest to lowest authority. Higher entries win
in any conflict.

```
1. .claude/CLAUDE.md                          <- root coordination
2. docs/ai/ARCHITECTURE.md                    <- architectural decisions
3. .claude/rules/*.md                         <- per-layer enforcement
4. docs/ai/work-packets/WORK_INDEX.md         <- execution order
5. docs/ai/execution-checklists/EC-*.md       <- execution contracts
6. docs/ai/work-packets/WP-*.md              <- design documents
7. Active conversation context                <- lowest authority
```

---

## What Does NOT Exist Yet

All previously-planned directories have shipped. Pending work tracked in
`docs/ai/work-packets/WORK_INDEX.md` — see WP-097/098 (funding policy +
lint-gate trigger; will add prose to `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`),
WP-105..108 (player badges + avatar upload + integrity admin + funding
surface), and the future authenticated request-handler WP that will wire
`configureSessionValidation({ verifier: createHankoSessionVerifier(config),
accountResolver, database })` exactly once at server startup.

| Created surface | Created by | Purpose |
|---|---|---|
| `docs/ops/` | WP-035 | Operational playbooks (RELEASE_CHECKLIST, DEPLOYMENT_FLOW, INCIDENT_RESPONSE, LIVE_OPS_FRAMEWORK, LAUNCH_READINESS, LAUNCH_DAY) |
| `docs/beta/` | WP-037 | Beta strategy documents (BETA_STRATEGY, BETA_EXIT_CRITERIA) |
| `docs/governance/` | WP-040 | Growth governance documents (CHANGE_GOVERNANCE) |
| `docs/audits/` | WP-085 | Vision-alignment audit reports (`vision-alignment-{YYYY-MM-DD}.md`) |
| `docs/ai/post-mortems/` | WP-053+ | 01.6 post-mortems for WPs that meet the trigger criteria |
| `apps/arena-client/` | WP-061 | Gameplay client SPA (Vue 3 + Pinia + Vite) |
| `apps/replay-producer/` | WP-063 | First cli-producer-app per D-6301 |
| `apps/server/src/auth/` | WP-112 | Session-token validation orchestrator + Hanko adapter (WP-126) |
| `apps/server/src/auth/hanko/` | WP-126 | Hanko-specific session verifier + JWKS cache (D-9904 module-path lock) |
| `apps/server/src/competition/` | WP-053 | Competitive score submission |
| `apps/server/src/db/` | WP-115 | Long-lived pg.Pool lifecycle anchor |
| `apps/server/src/identity/` | WP-052 / WP-101 | AccountId, players, replay ownership, handle claim |
| `apps/server/src/leaderboards/` | WP-054 / WP-115 | Leaderboard library + HTTP routes |
| `apps/server/src/par/` | WP-051 | PAR gate consumer |
| `apps/server/src/profile/` | WP-102 / WP-104 | Public profile + owner profile + /me edit |
| `apps/server/src/replay/` | WP-103 | Server-side replay storage & loader |
| `apps/server/src/teams/` | WP-109 | Team affiliation — cooperative cohorts |
| `packages/preplan/` | WP-056 | Pre-planning types + sandbox + disruption pipeline |
| `packages/vue-sfc-loader/` | WP-065 | Shared tooling — `@vue/compiler-sfc` registered for `node:test` |

---

*Last updated: 2026-05-03 (Phase 6 + Phase 7 + Beta-Launch + Auth Stack all shipped — engine 604/0, server 124/0/54 after WP-126)*
*To regenerate: compare against `git ls-tree HEAD -d --name-only -r | sort` and `find . -type d -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' | sort`*
