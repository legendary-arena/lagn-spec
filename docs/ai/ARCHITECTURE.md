# Legendary Arena — System Architecture

> **This document is referenced by every Work Packet in `docs/ai/work-packets/`.**
> It is the authoritative source for package boundaries, data flow, persistence
> rules, and dependency constraints. If this document and a Work Packet conflict,
> this document wins.
>
> **Document override hierarchy** (updated by WP-041, 2026-04-23):
> 1. `.claude/CLAUDE.md` — highest authority; root coordination for Claude Code sessions
> 2. `docs/ai/ARCHITECTURE.md` (this file) — architectural decisions and boundaries
> 3. `docs/01-VISION.md` — vision goals; non-negotiable truths about what the game is
> 4. `.claude/rules/*.md` — enforcement rules derived from this file
> 5. `docs/ai/work-packets/WORK_INDEX.md` — execution spine: which WPs exist, in what order
> 6. Individual Work Packets (`docs/ai/work-packets/WP-NNN-*.md`)
> 7. Active conversation context — lowest authority
>
> Higher entries win in any conflict. ARCHITECTURE.md wins on conflict with
> `.claude/rules/*.md` — rules files enforce architecture, they do not redefine it.
> `docs/ai/DECISIONS.md` records the rationale for each architectural decision;
> ARCHITECTURE.md encodes the resulting constraint. If a Work Packet appears to
> conflict with this file, stop and re-read this document before proceeding.
>
> Created: WP-013 -- Persistence Boundaries & Snapshots
> Updated: WP-065 (2026-04-16) -- added Shared Tooling layer to the Layer
>   Boundary authoritative table so that `packages/vue-sfc-loader/` and any
>   future cross-cutting dev/test tooling has an explicit, non-runtime slot
>   in the layer graph
> Updated: WP-026 -- Phase 5 complete; scheme setup instructions, board keywords,
>   hero ability execution, conditional effects; D-2601 (RBE) formalized;
>   G.cardKeywords, G.schemeSetupInstructions, G.heroAbilityHooks documented
> Updated: WP-025 -- board keywords (Patrol, Ambush, Guard); G.cardKeywords field
> Updated: WP-021 -- hero ability hooks (data-only); G.heroAbilityHooks field
> Updated: WP-020 -- VP scoring; computeFinalScores, economy vs scoring separation
> Updated: WP-019 -- mastermind tactics; G.mastermind state
> Updated: WP-018 -- attack/recruit economy; G.cardStats, G.turnEconomy
> Updated: WP-017 -- KO, wounds, bystanders; G.ko, G.attachedBystanders
> Updated: WP-016 -- fightVillain, recruitHero moves
> Updated: WP-015 -- City/HQ zones; G.city, G.hq; pushVillainIntoCity, escape
> Updated: WP-014 review -- villain deck reveal pipeline and RevealedCardType conventions
> Updated: WP-014 -- Villain Deck & Reveal Pipeline
> Updated: WP-011 review -- Lobby phase flow and G.lobby observability pattern
> Updated: WP-010 review -- endIf contract and G.counters key conventions
> Updated: WP-009A/009B review -- rule execution pipeline and ImplementationMap pattern
> Updated: WP-008A/008B review -- move validation contract and zone mutation rules
> Updated: WP-007A/007B review -- turn stage cycle, lifecycle-to-phase mapping
> Updated: WP-006A/006B review -- zone/pile structure and initialization rules
> Updated: WP-005A/005B review -- setup validation contract and throwing convention
> Updated: WP-004 review -- server layer boundary and startup sequence
> Updated: WP-004 execution -- server bootstrap complete; LegendaryGame wired with
>   minPlayers/maxPlayers, validateSetupData; registry loaded via createRegistryFromLocalFiles;
>   createRequire bridge for boardgame.io CJS server bundle (D-1205, D-1206)
> Updated: WP-003 review -- registry metadata file shapes and card field data quality
> Updated: WP-002 review -- boardgame.io version lock and LegendaryGame contract
> Updated: WP-001 review -- override hierarchy and legendary.* namespace convention

Architecture Version: 1.0.0
Last Reviewed: 2026-04-23
Verified Against: WP-001 through WP-040

---

## Architectural Principles

### 1. Determinism Is Non‑Negotiable (D‑0002)

Every game must be fully reproducible from:
- initial seed
- setup configuration
- ordered list of player actions

There is no hidden state, no implicit randomness, and no time‑dependent behaviour.
All randomness uses `ctx.random.*` exclusively — never `Math.random()`.

### 2. The Engine Owns Truth

- The engine is the **sole source of truth** for all game state
- Clients submit **intents**, not outcomes
- UI consumes **read‑only projections** of engine state, never `G` or `ctx` directly
- Invalid or out-of-order actions are rejected deterministically engine-side

### 3. Data Outlives Code

All persisted artefacts (replays, saves, campaign state, snapshots) are:
- explicitly versioned
- migrated deterministically
- rejected loudly if incompatible with the current engine version

Live runtime state (`G`, `ctx`) is **never** persisted.

### 4. Growth Is Constrained, Not Free

Growth happens within explicit boundaries:
- immutable surfaces are protected by versioning
- change budgets control release velocity
- balance changes are validated via simulation before shipping

Success is allowed. Entropy is not.

---

## Section 1 — Monorepo Package Boundaries

The repository is a pnpm monorepo. Every package has a single, bounded responsibility.

```
C:\pcloud\BB\DEV\legendary-arena\
│
├── packages/
│   ├── game-engine/          @legendary-arena/game-engine
│   │   Responsibility: ALL game logic
│   │   Contains: boardgame.io Game() definition (LegendaryGame), phases, moves,
│   │             turn loop, rule hooks, endgame evaluator, lobby state,
│   │             villain deck, persistence types
│   │   boardgame.io version: ^0.50.0 (locked — do not upgrade without a
│   │             DECISIONS.md entry; the Game() API and ctx shape are
│   │             version-specific)
│   │   Must NOT import: server, registry, any app package, pg, axios
│   │
│   ├── registry/             @legendary-arena/registry
│   │   Responsibility: card data loading and validation ONLY
│   │   Contains: createRegistryFromHttp, createRegistryFromLocalFiles,
│   │             Zod schemas, CardRegistry interface
│   │   Must NOT import: game-engine, preplan, server, any app package, pg
│   │
│   ├── preplan/              @legendary-arena/preplan
│   │   Responsibility: speculative pre-planning state for waiting players
│   │   Contains: PrePlan types, sandbox creation, speculative operations,
│   │             disruption detection, invalidation, source restoration
│   │   Non-authoritative: never writes to G, ctx, or engine state
│   │   All randomness uses a client-local seedable PRNG, never ctx.random.*
│   │   Must NOT import: boardgame.io, game-engine runtime code, server,
│   │                    registry, any app package, pg
│   │   May import: game-engine type definitions only (e.g., CardExtId)
│   │   Design docs: docs/ai/DESIGN-CONSTRAINTS-PREPLANNING.md,
│   │                docs/ai/DESIGN-PREPLANNING.md
│   │
│   └── vue-sfc-loader/       @legendary-arena/vue-sfc-loader
│       Responsibility: test-only Vue SFC import support for node:test
│       Contains: compileVue (wraps @vue/compiler-sfc), Node 22 module.register
│                 loader hook, register entry point, test fixture
│       Layer: Shared Tooling (cross-cutting, test/build only)
│       Must NOT be imported by runtime app code — only consumed via
│                 NODE_OPTIONS=--import @legendary-arena/vue-sfc-loader/register
│                 in app test scripts
│       Must NOT import: game-engine, registry, preplan, server, any app
│                        package, pg
│       May import: @vue/compiler-sfc (peer dep), vue (peer dep), typescript
│                   (only if Preflight TS smoke test requires it), Node
│                   built-ins
│       Emits: JavaScript only — Node's loader chain does not re-transform
│              the string returned from load(), so compileVue must emit JS
│              even when <script lang="ts"> is present
│       Work Packet: WP-065
│
├── apps/
│   ├── server/
│   │   Responsibility: boardgame.io Server() runtime — wires packages together
│   │   Contains: server bootstrap (server.mjs), process entrypoint (index.mjs),
│   │             rules loader (rules/loader.mjs — loadRules/getRules from PostgreSQL),
│   │             backwards-compat re-export (game/legendary.mjs)
│   │   Must NOT: contain game logic, implement rules, or define moves —
│   │             the server is a wiring layer, not a logic layer
│   │   └── scripts/
│   │       Contains: CLI tools — create-match.mjs, list-matches.mjs,
│   │                 join-match.mjs (Node v22 built-in fetch, no axios)
│   │   Imports: @legendary-arena/game-engine, @legendary-arena/registry, pg
│   │   Must NOT import: UI packages, direct DOM/browser APIs
│   │
│   └── registry-viewer/
│       Responsibility: read-only card browser SPA
│       Imports: @legendary-arena/registry
│       Must NOT import: game-engine, server internals
│
├── data/
│   Contains: canonical metadata JSON, per-set card JSON, PostgreSQL schema,
│             seed SQL, migration files
│   This is NOT a package — it is raw data consumed by other packages
│   PostgreSQL tables: all in the `legendary.*` schema namespace
│     (e.g., legendary.rules, legendary.sets, legendary.cards)
│     PKs use bigserial; cross-service identifiers use ext_id text columns
│
└── docs/ai/
    Contains: coordination system, REFERENCE docs, Work Packets, this file
    REFERENCE/ — authoritative project memory (established in WP-001):
      00.1-master-coordination-prompt.md  — coordination system, override
                                            hierarchy, WP template, session
                                            protocol, drift detection (highest
                                            authority after this file)
      00.2-data-requirements.md           — canonical data contracts: field
                                            names, schema conventions, ext_id
                                            usage, image URL patterns
      00.3-prompt-lint-checklist.md       — 28-item Final Gate before execution
      00.4-connection-health-check.md     — environment / connectivity checks
      00.5-validation.md                  — data validation procedures
      00.6-code-style.md                  — Rules 1–15: ESM-only, no
                                            abbreviations, // why: comments,
                                            data contract alignment, etc.
```

### Package Import Rules (Hard Constraints)

| Package | May import | Must NOT import |
|---|---|---|
| `game-engine` | Node built-ins only | `registry`, `preplan`, `server`, `vue-sfc-loader`, any `apps/*`, `pg` |
| `registry` | Node built-ins, `zod` | `game-engine`, `preplan`, `server`, `vue-sfc-loader`, any `apps/*`, `pg` |
| `preplan` | `game-engine` — type-only imports at compile time; reads engine state via projections passed in by the host app. Node built-ins. | `game-engine` (runtime), `registry`, `server`, `vue-sfc-loader`, any `apps/*`, `pg`, `boardgame.io` |
| `vue-sfc-loader` (WP-065) | `@vue/compiler-sfc` (peer), `vue` (peer), `typescript` (optional, test-only), Node built-ins | `game-engine`, `registry`, `preplan`, `server`, any `apps/*`, `pg`, `boardgame.io`, any runtime UI code |
| `apps/server` | `game-engine`, `registry`, `pg`, Node built-ins | `preplan`, `vue-sfc-loader`, UI packages, browser APIs |
| `apps/registry-viewer` | `registry`, UI framework, `vue-sfc-loader` (devDep only, test scripts) | `game-engine`, `preplan`, `server`, `pg`, `vue-sfc-loader` at runtime |
| `apps/arena-client` (WP-061+) | UI framework, `vue-sfc-loader` (devDep only, test scripts), `@legendary-arena/preplan` (runtime — per D-5901) | `game-engine` (runtime), `registry` (runtime), `server`, `pg`, `vue-sfc-loader` at runtime |

As of WP-059 (D-5901), `apps/arena-client` may runtime-import
`@legendary-arena/preplan`. This exception is confined to the arena client;
no other app or package may runtime-import preplan. The preplan package
itself remains non-authoritative — its import / read posture is **type-only
imports at compile time; reads engine state via projections passed in by
the host app** (see `## Layer Boundary (Authoritative) → Pre-Planning Layer`).

Violations of these rules are bugs. The TypeScript build should catch them via
`"paths"` restrictions in `tsconfig.json`. The `vue-sfc-loader` row is
additionally enforced at packaging time: it appears only in apps'
`devDependencies` and their `test` scripts' `NODE_OPTIONS`, never in their
production bundles. Any app listing `vue-sfc-loader` in `dependencies` is a
layer violation.

### Layer Boundary (Authoritative)

Legendary Arena is structured as a **strictly layered system**. Each layer
has a single responsibility and hard boundaries that must not be crossed.
Violations of these boundaries are **architectural bugs**, even if the code
compiles or appears to "work".

This section is the **canonical reference** for layer responsibility and
ownership. Enforcement of these boundaries is implemented in the
corresponding `.claude/rules/*.md` files.

#### Layer Overview

| Layer | Package / Path | Role | Claude Enforcement |
|---|---|---|---|
| Registry | `packages/registry/**` | Card data loading & validation | `.claude/rules/registry.md` |
| Game Engine | `packages/game-engine/**` | Gameplay rules & state transitions | `.claude/rules/game-engine.md` |
| Pre-Planning | `packages/preplan/**` | Speculative planning for waiting players (non-authoritative) | `DESIGN-PREPLANNING.md` |
| Server | `apps/server/**` | Wiring, startup, networking | `.claude/rules/server.md` |
| Shared Tooling (cross-cutting, test/build only) | `packages/vue-sfc-loader/**` (and future test/build packages) | Dev- and test-time transforms consumed only by `apps/*` test scripts or local tooling; never imported by production code | (enforcement follows the rules in this section; a dedicated `.claude/rules/shared-tooling.md` may be added later when a second tooling package lands) |
| Persistence (cross-cutting) | engine / app boundary | Data lifecycle & storage rules | `.claude/rules/persistence.md` |

Each layer depends **only downward**. No layer may reach upward or sideways.
The Shared Tooling layer is **orthogonal** to the main dependency chain —
it is a cross-cutting concern consumed only by `apps/*` at test or build
time, never imported by runtime code in any other layer.

#### Registry Layer (Data Input)

- Load and validate card and metadata JSON; expose an immutable `CardRegistry`.
- May read local files or R2 via loaders; validate data via Zod schemas.
- Must NEVER contain gameplay logic, import `packages/game-engine` or
  `apps/server`, query PostgreSQL, or mutate runtime game state.
- Direction: Registry feeds the Game Engine at setup-time **only**.

#### Game Engine Layer (Gameplay Authority)

- Define the `Game()` object; own all gameplay logic (phases, moves, rule
  hooks, turn flow, endgame); mutate `G` deterministically.
- May receive registry data via `Game.setup()`; use `ctx.random.*`;
  maintain derived runtime state in `G`; export pure helpers and types.
- Must NEVER import from `apps/server/**`, query PostgreSQL/HTTP/
  filesystem/environment, contain startup or networking logic, treat `G`
  as persistent storage, or load registry data after setup time.
- Direction: Game Engine wires into `Server()`.

<!-- canonical phrasing per WP-119 / D-11901; if you edit this section, sync the other two files: docs/02-ARCHITECTURE.md, .claude/rules/architecture.md -->
#### Pre-Planning Layer (Non-Authoritative, Per-Client)

- Provide speculative turn planning for waiting players; track speculative
  reveals for deterministic rewind; detect disruptions and produce
  invalidation events.
- **Import / read posture:** type-only imports at compile time; reads engine
  state via projections passed in by the host app.
- May import engine type definitions (`import type` only); read engine
  state via projections passed in by the host app; use a client-local
  seedable PRNG.
- Must NEVER write to `G`, `ctx`, or any authoritative game state; import
  engine runtime code, registry, server, or `boardgame.io`; persist state.
- Direction: Game Engine supplies type-only imports at compile time to
  Pre-Planning, which reads engine state via projections passed in by the
  host app. The engine does not know pre-planning exists.

#### Server Layer (Wiring Only)

- Load immutable inputs at startup; wire `LegendaryGame` into `Server()`;
  expose network and CLI entrypoints; manage process lifecycle.
- Must NEVER implement game logic, define moves/rules/effects, mutate or
  interpret `G`, or re-implement turn or phase logic.
- Direction: Server connects pieces — it does not decide what happens in
  the game.

#### Shared Tooling Layer (Cross-Cutting, Test/Build Only)

- Provide reusable dev- and test-time transforms, loaders, or build
  utilities consumed by `apps/*` test scripts or local tooling. Examples:
  `packages/vue-sfc-loader/` (SFC transform for `node:test`). Any future
  cross-cutting dev/test package that serves multiple apps belongs here.
- May import third-party dev/test packages (e.g., `@vue/compiler-sfc`,
  `jsdom`, `@vue/test-utils`) and Node built-ins.
- Must NEVER import from `packages/game-engine/**`, `packages/registry/**`,
  `packages/preplan/**`, or `apps/server/**`. Must NEVER be imported at
  runtime by any production code path — Shared Tooling exists only in
  `devDependencies` or test scripts.
- Must NEVER contain gameplay logic, persist state, query a database,
  access the network at runtime, or use `ctx.random.*` (it has no `ctx`).
- Must be deterministic wherever applicable (same input → same output) so
  that test-infrastructure failures are reproducible.
- Direction: consumed only **upward** by `apps/*` at test or build time.
  The Shared Tooling layer is **orthogonal** to the Registry → Engine →
  Server chain — it has no runtime edges into that chain and no layer on
  that chain may import from it.

#### Dependency Direction (Non-Negotiable)

```
Registry -> Game Engine -> Server -> Client / CLI
                    |
                    └-> Pre-Planning (type-only imports; reads engine state via host-app projections)

Shared Tooling (orthogonal):
  packages/vue-sfc-loader/ -> apps/* (test scripts only, never runtime)
```

#### Persistence Boundary (Cross-Layer)

- `G` and `ctx` are **runtime-only**.
- Only the server/application layer may persist data.
- Snapshots are **derived records**, never live state.
- No layer may treat snapshots as save-games.

#### Enforcement Rule

If unsure where code belongs: **If it decides gameplay** → Game Engine.
**If it loads or validates data** → Registry. **If it speculatively plans
a future turn** → Pre-Planning. **If it wires components or handles
process concerns** → Server. **If it is a dev- or test-time transform
consumed only by `apps/*`** → Shared Tooling. **If it stores anything** →
re-check Persistence rules. If a change touches more than one layer,
**stop and re-evaluate**.

**Registry provides data. Engine decides outcomes. Pre-planning speculates
privately. Server connects pieces. Shared Tooling supports builds and
tests without ever running in production.** If a layer starts doing
another layer's job, the architecture is already broken.

---

## Section 2 — Data Flow

### Server Startup Sequence

Before any match can be created, the server must complete two independent startup
tasks. Both must succeed before `Server()` begins accepting requests.

```
Task 1 — Card registry (from local files or R2):
  createRegistryFromLocalFiles({ metadataDir: 'data/metadata', cardsDir: 'data/cards' })
  → Loads data/metadata/sets.json          (set index — see Registry Metadata File Shapes)
  → Loads data/cards/[set-abbr].json       (per-set card records)
  → Validates all files against Zod schemas (packages/registry/src/schema.ts)
  → Returns immutable CardRegistry
  → Logged: "[server] registry loaded: X sets, Y heroes, Z cards"

Task 2 — Rules text (from PostgreSQL):
  loadRules()  ← apps/server/src/rules/loader.mjs (established by Foundation Prompt 01)
  → Reads from legendary.rules table in PostgreSQL
  → Returns in-memory rules accessible via getRules()
  → Logged: "[server] rules loaded: N rules"
  Note: rules/loader.mjs is NOT touched by game-engine Work Packets —
        it belongs to the server layer only

Both tasks complete → Server() starts → process entrypoint (index.mjs) signals ready
```

**Why two separate tasks?** Card data (registry) and rules text (PostgreSQL) are
different data sources with different update cadences. The registry is immutable
release data. The rules text is seeded at deploy time. Neither is `G` — they are
read-only inputs to the engine, not game state.

Deployment prerequisites for both startup tasks are verified by the checklists in
[`docs/ai/deployment/`](deployment/) before any environment promotion.

### Registry Metadata File Shapes

**`data/metadata/sets.json`** — the **set index**:

```
{ id: string, abbr: string, pkgId: string, slug: string,
  name: string, releaseDate: string, type: string }
```

This is what `SetIndexEntrySchema` validates. It lists which card sets exist and
provides the `abbr` used to locate per-set card files (e.g., `mdns.json`).
**This is the file `createRegistryFromLocalFiles` and `createRegistryFromHttp`
must fetch to enumerate sets.**

**Silent failure mode (historical counter-example):** if a loader fetches a
metadata file whose shape does not carry `abbr` and `releaseDate` where
`sets.json` is expected, the Zod parse produces **zero sets with no error
thrown** — every entry fails `SetIndexEntrySchema` silently and is dropped,
so the registry appears to load successfully but contains no data. The
canonical example was `data/metadata/card-types.json` (the card-type
taxonomy); that file was the WP-003 Defect 1 consumer in `httpRegistry.ts`
and has since been deleted by WP-084 (2026-04-21). D-1203 retains the full
narrative for auditability. The silent-failure pattern still applies to any
future metadata file that shares a similar shape — guard the fetch site
explicitly.

**`packages/registry/src/schema.ts`** is the authoritative source for all field
shapes and nullable/optional constraints. Read it before writing any
registry-related code. The comments inside document real data quirks that drove
schema permissiveness decisions.

### Card Field Data Quality

Hero card numeric fields are **not** clean integers in the raw data. Any code
that reads or parses these fields must treat them as `string | number | undefined`:

| Field | Real data examples | Why |
|---|---|---|
| `cost` | `0`, `3`, `"2*"` | Star-cost modifier (established in WP-003) |
| `attack` | `0`, `3`, `"2+"` | Plus-modifier for conditional bonuses |
| `recruit` | `0`, `2`, `"1+"` | Plus-modifier for conditional bonuses |
| `vAttack` (mastermind) | `8`, `"8+"` | Mastermind fight values use the same pattern |

**Parsing rule:** Strip trailing `+` or `*` and parse the integer base. On
unexpected input, return `0` and emit a deterministic warning — never throw.
This parser is implemented in WP-018 (`economy.logic.ts`). All packets from
WP-018 onward must use it rather than assume integers.

### Match Lifecycle: From Config to Game State

```
1. Caller (CLI script or UI) constructs a MatchSetupConfig:
   {
     schemeId, mastermindId, villainGroupIds, henchmanGroupIds,
     heroDeckIds, bystandersCount, woundsCount, officersCount, sidekicksCount
   }
   These are the 9 canonical field names from 00.2 §8.1. They are locked.
   Do not rename, abbreviate, or add fields.

2. Caller POSTs to boardgame.io default endpoint:
   POST /games/legendary-arena/create
   Body: { numPlayers: N, setupData: <MatchSetupConfig> }
   → Returns { matchID }

3. boardgame.io stores the match and calls:
   Game.setup(ctx, matchData)
   → validateMatchSetup(matchData, registry)
       — checks BOTH shape AND registry ext_id existence (not shape-only)
       — throws Error with failing field name if invalid
       — this is the ONLY place in the engine where throwing is correct;
         moves must never throw (see Section 4, The Move Validation Contract)
   → buildInitialGameState(matchData, registry, ctx) — calls helpers:
       buildPlayerState(playerId, startingDeck, ctx) per player
         → G.playerZones[id].deck = shuffled starting deck (CardExtId[])
           (shuffling uses ctx.random.Shuffle — never Math.random())
         → G.playerZones[id].hand/discard/inPlay/victory = [] (empty)
       buildGlobalPiles(matchData, ctx)
         → G.piles.bystanders/wounds/officers/sidekicks sized from config counts
   → buildVillainDeck(matchData, registry, ctx) — constructs villain deck + type index
   → buildDefaultHookDefinitions(matchData) — constructs HookDefinition[] from schemeId/mastermindId
   → G.hookRegistry populated with HookDefinition[] (data-only, JSON-serializable)
   → G.lobby is initialised: { requiredPlayers: ctx.numPlayers, ready: {}, started: false }
   → G.messages = [], G.counters = {}
   → G is stored in boardgame.io's in-memory match store
   (ImplementationMap handler functions are NOT stored in G)

4. Players join via:
   POST /games/legendary-arena/<matchID>/join
   → Each player receives { playerID, credentials }
   → Match begins in the lobby phase

4b. Each player signals readiness (lobby phase only):
   setPlayerReady({ ready: true })
   → Sets G.lobby.ready[ctx.currentPlayer] = true
   → Move is phase-gated: only callable in the lobby phase

4c. Any player triggers the start check:
   startMatchIfReady()
   → validateCanStartMatch(G.lobby) checks all seats are ready
   → If valid: sets G.lobby.started = true, calls ctx.events.setPhase('setup')
   → Transitions: lobby → setup → play

5. Players submit moves in the play phase (each turn cycles start → main → cleanup):
   → boardgame.io calls the move function with (G, ctx, args)
   → Move function: validate args → check stage gate → mutate G
   → boardgame.io stores the new G

5b. On each turn boundary, boardgame.io fires lifecycle hooks:
   turn.onBegin → G.currentStage reset to 'start'
               → executeRuleHooks(G, ctx, 'onTurnStart', payload, G.hookRegistry, implementationMap)
               → applyRuleEffects(G, ctx, effects)
   turn.onEnd  → executeRuleHooks(G, ctx, 'onTurnEnd', payload, G.hookRegistry, implementationMap)
               → applyRuleEffects(G, ctx, effects)

6. After every move, boardgame.io calls:
   endIf(G, ctx)
   → Delegates to evaluateEndgame(G)
   → evaluateEndgame reads G.counters using ENDGAME_CONDITIONS key constants
   → Returns EndgameResult if a condition is met, undefined to continue

7. When game ends:
   → boardgame.io marks match as gameover
   → Final G is accessible but not persisted by the engine
```

### Card Data Flow: Registry into Game Engine

```
See "Server Startup Sequence" above for how the registry reaches the server.
See "Registry Metadata File Shapes" above for the shape of each metadata file.

Game.setup() receives the registry as part of matchData
  → validateMatchSetup checks all ext_ids against registry (throws on failure)
  → Resolves ext_id strings from MatchSetupConfig against registry
  → Builds G with ext_id string arrays (not full card objects)
  → Builds G.villainDeckCardTypes: Record<CardExtId, RevealedCardType>
    — maps each villain deck card to its type ('villain', 'henchman', etc.)
    — stored in G so moves can classify cards without registry access
  → G never stores imageUrl, ability text, or display data

At runtime, moves operate on ext_id strings in G.
Card display data is resolved by the UI via the registry separately.
Card type classification uses G.villainDeckCardTypes — no registry in moves.
```

### Zone & Pile Structure

`CardExtId = string` is the canonical type for all zone contents. Every zone in
`G` stores `CardExtId` strings exclusively — never full card objects, display
names, or database IDs. Types are defined in `src/state/zones.types.ts`.

**`PlayerZones`** — 5 zones per player:

| Zone | Contents at setup | How cards enter |
|---|---|---|
| `deck` | Shuffled starting deck (`CardExtId[]`) | `buildPlayerState` at setup |
| `hand` | `[]` — empty | `drawCards` move |
| `discard` | `[]` — empty | `endTurn` move (from inPlay/hand) |
| `inPlay` | `[]` — empty | `playCard` move |
| `victory` | `[]` — empty | `fightVillain` and similar defeat moves |

**`GlobalPiles`** — 4 shared piles sized from `MatchSetupConfig` count fields:

| Pile | Size | Config field |
|---|---|---|
| `bystanders` | `bystandersCount` | `MatchSetupConfig.bystandersCount` |
| `wounds` | `woundsCount` | `MatchSetupConfig.woundsCount` |
| `officers` | `officersCount` | `MatchSetupConfig.officersCount` |
| `sidekicks` | `sidekicksCount` | `MatchSetupConfig.sidekicksCount` |

**Initialization rule:** Zones other than `deck` start empty at setup. Cards
enter non-deck zones **exclusively through game moves** — never through setup
initialization. Pre-populating a non-deck zone at setup would bypass the move
validation contract and break replay determinism.

**Shape validators** (`validateGameStateShape`, `validatePlayerStateShape` from
`src/state/zones.validate.ts`) check structural shape only — they confirm zone
arrays exist and contain strings. They do **not** verify that ext_ids correspond
to real cards in the registry. Registry ext_id existence is validated by
`validateMatchSetup` at match creation time, not at move time.

### What Lives Where

| Data | Location | Mutable |
|---|---|---|
| Card metadata and images | R2 (Cloudflare) / `data/` local | No (immutable releases) |
| Match setup config | boardgame.io matchData | No (input) |
| Live game state (G) | boardgame.io in-memory | Yes — via moves only |
| boardgame.io metadata (ctx) | boardgame.io in-memory | Yes — by boardgame.io internals |
| Match credentials | boardgame.io in-memory | No |
| Snapshots | Application layer (future) | No (immutable records) |
| Rules text (seeded) | PostgreSQL (`legendary.rules`) | No (seeded at deploy) |
| Rules text (runtime) | Server in-memory via `getRules()` | No — read-only after load |
| Card registry | Server in-memory via `CardRegistry` | No — read-only after load |
| ImplementationMap handler functions | Runtime memory (NOT in G) | No — built at startup |

---

## Section 3 — Persistence Boundaries

This is the most important section. Every engineer must know it before writing
any storage code. Serialization invariants enforced by: D-0002 (determinism),
D-1214 (zones store ext_id strings only), D-1229 (HookDefinition is data-only),
D-1232 (ImplementationMap outside G), D-1310 through D-1313 (data classes).

### The Three Data Classes

#### Class 1 — Runtime State (NEVER PERSIST)

These objects exist **only in boardgame.io's in-memory process** while a match
is running. They must never be written to PostgreSQL, Redis, files, or any store.

| Object | Why it must not be persisted |
|---|---|
| `G` (entire object) | Managed by boardgame.io; re-hydrating from DB would bypass boardgame.io's state integrity guarantees |
| `ctx` | boardgame.io internal metadata; no public contract |
| `matchState` / `stateID` | boardgame.io internals; format may change across versions |
| In-flight `RuleEffect[]` | Transient execution artifact; valid only within a single move |
| `ImplementationMap` | Contains handler functions; functions cannot be serialised |
| Socket / session data | Network layer; not part of game state |
| `G.hookRegistry` | Derived from setup; reconstructed each match from `matchData` |

If you feel the urge to persist any of these, stop and re-read this section.

#### Class 2 — Configuration State (SAFE TO PERSIST)

These are deterministic **inputs** to a match. They may be stored before and
after a match runs, as they have no dependency on boardgame.io runtime.

| Object | Notes |
|---|---|
| `MatchSetupConfig` | The 9-field setup payload (see 00.2 §8.1) |
| Player names and seat assignments | Created at join time |
| Match creation timestamp | ISO 8601 string |
| Scheme / mastermind / hero selections | Already encoded in MatchSetupConfig |

These map to the `PersistableMatchConfig` type in `src/persistence/persistence.types.ts`.

#### Class 3 — Snapshot State (SAFE TO PERSIST AS IMMUTABLE RECORDS)

These are **derived, read-only views** of match state at a point in time.
They may be stored for debugging, auditing, and replay reconstruction — but
with strict constraints:

- A snapshot **must never** be re-hydrated into a live boardgame.io match
- A snapshot **must never** replace `G` as the source of truth
- A snapshot **must** use zone counts, not zone contents (no `ext_id` arrays)
- Snapshots are safe to delete at any time without affecting game integrity

The canonical shape is `MatchSnapshot` in `src/persistence/persistence.types.ts`.

### Field Classification Reference

The Class column indicates the authoritative class first; annotations like "Snapshot (as copy)" or "Snapshot → count only" describe how a runtime value may appear in a snapshot without changing the field's own class. All 20 G-class Runtime fields remain Class 1 (Runtime) regardless of snapshot-handling annotation.

| Field / Object | Class | Notes |
|---|---|---|
| `G` | Runtime | Never persist |
| `G.counters` | Snapshot (as copy) | Read-only record; key names governed by `ENDGAME_CONDITIONS` |
| `G.messages` | Snapshot (as copy) | Read-only record; deterministic log of rule effects applied |
| `G.hookRegistry` | Runtime | `HookDefinition[]` — data-only, reconstructed from `matchData` at setup |
| `G.playerZones[*].*` | Snapshot → count only | All 5 zones (deck/hand/discard/inPlay/victory) — zone contents are Runtime; see Zone & Pile Structure |
| `G.piles.*` | Snapshot → count only | All 4 piles (bystanders/wounds/officers/sidekicks) — pile contents are Runtime |
| `G.lobby` | Runtime | Transient phase state; see Section 4 |
| `G.lobby.started` | Runtime | UI observability flag; not a persistence record |
| `G.currentStage` | Runtime | Game engine's inner stage (`start`/`main`/`cleanup`) — in `G`, not `ctx`; reset to `'start'` on each turn |
| `G.villainDeck.deck` | Snapshot → count only | Ordered stack; reveal logic assumes correct composition but does not validate it; zone contents are Runtime |
| `G.villainDeck.discard` | Snapshot → count only | Revealed cards after pipeline resolution; zone contents are Runtime |
| `G.villainDeckCardTypes` | Runtime | `Record<CardExtId, RevealedCardType>`; populated at setup, consumed by reveal moves; exists specifically to prevent runtime registry access |
| `G.selection` | Runtime | Match setup selection state; introduced WP-005B |
| `G.city` | Runtime | 5-tuple of `CardExtId \| null`; villain movement zone; introduced WP-015 |
| `G.hq` | Runtime | 5-tuple of `CardExtId \| null`; hero recruitment zone; introduced WP-015 |
| `G.ko` | Runtime | `CardExtId[]`; knocked-out cards zone; introduced WP-017 |
| `G.attachedBystanders` | Runtime | `Record<CardExtId, CardExtId[]>`; bystanders attached to villains; introduced WP-017 |
| `G.turnEconomy` | Runtime | Attack/recruit/spent tracking; reset per turn; introduced WP-018 |
| `G.cardStats` | Runtime | `Record<CardExtId, CardStatEntry>`; built at setup from registry; introduced WP-018 |
| `G.mastermind` | Runtime | `MastermindState` with tactics deck; introduced WP-019 |
| `G.heroAbilityHooks` | Runtime | `HeroAbilityHook[]`; hero ability hook declarations (data-only, immutable); built at setup; introduced WP-021 |
| `G.cardKeywords` | Runtime | `Record<CardExtId, BoardKeyword[]>`; built at setup from registry; introduced WP-025 |
| `G.schemeSetupInstructions` | Runtime | `SchemeSetupInstruction[]`; stored for replay observability; introduced WP-026 |
| `ImplementationMap` | Runtime | Handler functions — must never enter `G` |
| `ctx` | Runtime | Never persist |
| `MatchSetupConfig` | Configuration | Safe to store |
| Player names | Configuration | Safe to store |
| `MatchSnapshot` | Snapshot | Immutable, read-only |
| `EndgameResult` | Snapshot (as copy) | Embed in snapshot |

---

## Section 4 — boardgame.io Runtime Model

### The LegendaryGame Object

`LegendaryGame` is the single boardgame.io `Game()` object that defines the
entire game. It is created in `packages/game-engine/src/game.ts` (WP-002) and
is the package's primary export. Every phase, move, lifecycle hook, and endgame
condition must be registered through this object — never through parallel or
alternative Game instances.

**boardgame.io version: `^0.50.0`** (locked in `packages/game-engine/package.json`).
Do not upgrade this dependency without a `DECISIONS.md` entry explaining the
impact. The `Game()` API, Immer-based `G` mutation model, `ctx` shape, and
`Server()` integration are all version-specific. An unintentional upgrade would
silently break all move functions, phase hooks, and test utilities.

### What `G` Is

`G` is the **game state object** managed entirely by boardgame.io. It is:
- JSON-serializable at all times (no class instances, Maps, Sets, or functions)
- The single source of truth for all gameplay data during a match
- Passed into every move function and lifecycle hook as a parameter
- Mutated via Immer (boardgame.io 0.50.x) — move functions receive a draft and
  mutate it directly; they return void, not a new `G`
- Never stored in a database

`G` is NOT a database row, a Redux store, or a plain JavaScript object that the
application owns. boardgame.io owns `G`.

`LegendaryGameState` is the TypeScript type for `G` (defined in
`packages/game-engine/src/types.ts`, first created in WP-002). It is expanded
by each successive Work Packet that adds new state fields. The canonical initial
shape is empty — `G` gains fields as packets are completed.

### What `ctx` Is

`ctx` is boardgame.io's **match metadata** — the information boardgame.io tracks
to manage turn order, phases, and player rotation. It includes:

| Field | Meaning |
|---|---|
| `ctx.currentPlayer` | Player ID whose turn it is |
| `ctx.turn` | Current turn number |
| `ctx.phase` | Current phase name (`lobby`, `setup`, `play`, `end`) |
| `ctx.numPlayers` | Total number of players in the match |
| `ctx.random.*` | Seeded random number functions — the **only** permitted randomness source |
| `ctx.events.*` | Phase/turn transition functions (`endTurn`, `setPhase`, etc.) |

`ctx` is **never** to be persisted or serialised outside of boardgame.io's own
internal mechanisms.

### Phase Sequence and Lifecycle Mapping

Legendary Arena has four phases. These phase names are locked — they were
scaffolded in WP-002 and the mapping to lifecycle concepts was formalised in
WP-007A. The names must never be changed without updating both `LegendaryGame`
and `MATCH_PHASES`.

| Lifecycle concept (00.2 §8.2) | boardgame.io phase name | Notes |
|---|---|---|
| Lobby | `lobby` | Players join and ready up |
| Setup | `setup` | Deterministic deck construction |
| In Progress | `play` | Active gameplay; each turn cycles through three stages |
| Completed | `end` | Terminal; final scoring |

Do not invent alternate phase names. The mapping is locked.

```
lobby  →  setup  →  play  →  end
```

| Phase | Entry condition | Key activity | Exit mechanism |
|---|---|---|---|
| `lobby` | Match created | Players join and signal readiness | `startMatchIfReady()` calls `ctx.events.setPhase('setup')` |
| `setup` | All players ready | Deterministic deck construction | Automatic on setup completion |
| `play` | Setup complete | Turns cycle: `start → main → cleanup` per player | `evaluateEndgame(G)` returns truthy via `endIf` |
| `end` | Game over | Final scoring, outcome display | Terminal — no further transitions |

`ctx.phase` is managed by boardgame.io. **Never set it directly** — always use
`ctx.events.setPhase()` from within a move, with a `// why:` comment.

`MATCH_PHASES` and `TURN_STAGES` are the canonical arrays for their respective
union types (exported from `src/turn/turnPhases.types.ts`). Drift-detection tests
must assert these arrays exactly match their union types — any code adding a new
phase or stage must update both the type and the array simultaneously.

### The Turn Stage Cycle

Within the `play` phase, each player's turn passes through three stages in order:

```
start  →  main  →  cleanup  →  (turn ends)
```

**`TurnStage`** values (`'start' | 'main' | 'cleanup'`) are defined in
`src/turn/turnPhases.types.ts`. This is separate from boardgame.io's own
stage/step concept — `TurnStage` belongs entirely to the game engine.

**Why is `G.currentStage` stored in `G` and not `ctx`?**
boardgame.io's `ctx` does not expose the inner stage in a form that moves can
read. Move functions receive `(G, ctx, args)` and must be able to check which
stage they are in to enforce gating. Storing `currentStage` in `G` makes it:
- Observable to moves (`isMoveAllowedInStage(moveName, G.currentStage)`)
- JSON-serializable (replay and snapshot support)
- Resettable on each turn (`play` phase `onBegin` sets `G.currentStage = 'start'`)

This is a hard rule: **stage tracking belongs in `G`, never in `ctx`** (D-1221).

**The advancement flow:**

```
advanceTurnStage(G, ctx):
  next = getNextTurnStage(G.currentStage)
  if next is not null:
    G.currentStage = next
    return updated G
  else (currentStage was 'cleanup'):
    ctx.events.endTurn()  // why: boardgame.io manages player rotation
    return G unchanged
```

`getNextTurnStage` is the only authority on stage ordering — it is defined once
in `src/turn/turnPhases.logic.ts` and called everywhere else. No code outside
that file may hardcode the ordering `'start' → 'main' → 'cleanup'`.

**Valid stage transitions:**
- `start → main` ✓
- `main → cleanup` ✓
- Any other transition ✗ — enforced by `isValidTurnStageTransition`

**Turn start:** On every `play` phase `onBegin`, `G.currentStage` is reset to
`'start'`. The rule pipeline fires `onTurnStart` at this point.

**Turn end:** When `advanceTurnStage` is called with `currentStage = 'cleanup'`,
`ctx.events.endTurn()` is called. boardgame.io advances to the next player and
fires `onTurnEnd` triggers. Manual player index rotation is **not permitted**.

### The Move Validation Contract

Every boardgame.io move function in the engine must follow this exact ordering
before touching `G`. There are no exceptions.

```
moveFunction(G, ctx, args):
  Step 1 — Validate args
    call validateXxxArgs(args)
    if ok: false → log structured error, return (no G mutation)

  Step 2 — Check stage gate
    call isMoveAllowedInStage(moveName, G.currentStage)
    if blocked → return (no G mutation)

  Step 3 — Mutate G
    use zoneOps.ts helpers to move cards between zones
    return void (boardgame.io 0.50.x uses Immer — mutate the draft, return void)
```

**Why this ordering?**
- Args validation comes first so malformed inputs are caught before any state check.
- Stage gating comes second so a valid-but-wrong-stage call is rejected without
  touching `G`. Both failures are silent returns — boardgame.io move functions
  **never throw**; exceptions would crash the server process.
- `G` is only mutated once both guards pass.

**`MoveResult` and `MoveError` are the engine-wide result contract** (defined in
`src/moves/coreMoves.types.ts`):

```ts
interface MoveError  { code: string; message: string; path: string }
type     MoveResult  = { ok: true } | { ok: false; errors: MoveError[] }
```

Every validator in every packet — lobby moves, rule hooks, endgame evaluators,
villain deck functions — must return `MoveResult`. No packet may define a new
parallel error type.

**Exception:** `ZoneValidationError` (from `src/state/zones.validate.ts`) uses
`{ field: string; message: string }` — a narrower shape for structural zone
checks that report which field failed. Zone shape validators are distinct from
move validators and use this simpler type; they do not return `MoveResult`.

**`Game.setup()` is the only place where throwing is correct.** `validateMatchSetup`
(called from `Game.setup()`) throws an `Error` if the `MatchSetupConfig` is invalid.
This is initialization — not a move. boardgame.io propagates a setup failure as
a match creation error before any player has joined. Everywhere else in the engine
(moves, validators, effect applicators) **must never throw**. The asymmetry is
intentional:

| Context | On invalid input | Reason |
|---|---|---|
| `Game.setup()` | Throws `Error` | Match creation must abort before `G` is built |
| Moves | Returns void silently | boardgame.io would crash if a move threw |
| `validateMatchSetup` | Returns `ValidateMatchSetupResult` | Pure validator — caller decides to throw |
| Zone / move validators | Returns `MoveResult` or `ZoneValidationError` | Structured results, never throw |

**Stage gating is driven by `MOVE_ALLOWED_STAGES`** (defined in
`src/moves/coreMoves.gating.ts`). The canonical stage assignments are:

| Move | Allowed stages | Why |
|---|---|---|
| `drawCards` | `start`, `main` | Cards drawn before and during action; not after cleanup |
| `playCard` | `main` | Cards played only during the action window |
| `endTurn` | `cleanup` | Turn ends only after all actions are resolved |

Any deviation from these assignments must be recorded in `DECISIONS.md`. Stage
gating uses `TurnStage` constants — never hardcoded string literals.

`MOVE_ALLOWED_STAGES` applies only to **CoreMoveName** moves (the original
three core moves). Non-core moves (e.g., `revealVillainCard`, `fightVillain`,
`recruitHero`) must enforce gating internally by checking `G.currentStage`
directly within the move body. This pattern was established by WP-014A and
confirmed by WP-016 (D-1601). Non-core moves must not expand `CoreMoveName`,
`CORE_MOVE_NAMES`, or `MOVE_ALLOWED_STAGES`.

### Zone Mutation Rules

All zone operations go through `zoneOps.ts` pure helpers. These rules apply to
every packet that moves cards between zones.

**`moveCardFromZone`** — moves one card from a source zone to a destination zone:
```ts
moveCardFromZone(
  fromZone: CardExtId[],
  toZone:   CardExtId[],
  cardId:   CardExtId
): { from: CardExtId[]; to: CardExtId[]; found: boolean }
```

**`moveAllCards`** — moves all cards from one zone to another:
```ts
moveAllCards(
  fromZone: CardExtId[],
  toZone:   CardExtId[]
): { from: CardExtId[]; to: CardExtId[] }
```

**Hard rules:**
1. **Helpers return new arrays — they never mutate their inputs.**
2. **Zones contain only `CardExtId` strings** — never full card objects.
3. **`zoneOps.ts` has no `boardgame.io` import** — pure, independently testable.
4. **No `.reduce()` in zone operations** — use `for` or `for...of` loops.

**Why pure helpers?** Extracting zone operations into `zoneOps.ts` keeps each
move function under 30 lines and makes the operations independently testable.

### The Rule Execution Pipeline

This is the most architecturally significant subsystem in the game engine. Every
Work Packet from WP-015 onward that touches game events must understand it.

**The core problem:** Game rules (scheme twists, mastermind strikes, hero
abilities) are different for every match. The handler logic must be swappable,
but `G` must remain JSON-serializable. Functions cannot live in `G`.

**The solution — two separate registries:**

```
G.hookRegistry: HookDefinition[]          ← lives IN G (JSON-serializable)
ImplementationMap                         ← lives OUTSIDE G (contains functions)
```

`HookDefinition` is **data-only** — no handler functions, no closures, no
class instances. It declares what a rule responds to:

```ts
interface HookDefinition {
  id:       string           // stable unique identifier
  kind:     'scheme' | 'mastermind'
  sourceId: string           // ext_id of the scheme or mastermind
  triggers: RuleTriggerName[]
  priority: number           // lower fires first; ties broken by id lexically
}
```

`ImplementationMap` contains the handler functions, keyed by `hookDefinition.id`:

```ts
type ImplementationMap = Record<
  string,
  (G: LegendaryGameState, ctx: Ctx, payload: unknown) => RuleEffect[]
>
```

**The two-step execution pipeline:**

```
Step 1 — Collect effects (executeRuleHooks):
  getHooksForTrigger(G.hookRegistry, triggerName)
  → sorted HookDefinition[] (priority asc, then id lexically)
  → for each definition: look up handler in ImplementationMap by definition.id
  → call handler(G, ctx, payload) → RuleEffect[]
  → accumulate all effects
  → return flat RuleEffect[] (G is NOT modified here)

Step 2 — Apply effects (applyRuleEffects):
  for...of effects:
    queueMessage    → G.messages.push(message)
    modifyCounter   → G.counters[key] = (G.counters[key] ?? 0) + delta
    drawCards       → shared draw helper from coreMoves.impl.ts
    discardHand     → moveAllCards from zoneOps.ts
    unknown type    → push warning to G.messages (never throw)
  → returns updated G
```

**Key invariants:**
- `ImplementationMap` handler functions are **never stored in `G`**
- `executeRuleHooks` **never modifies `G`** — it only reads it
- `applyRuleEffects` uses `for...of` — never `.reduce()`
- Unknown effect types push a warning to `G.messages` and continue — never throw
- Hook execution order is deterministic: priority ascending, then `id` lexically
  for ties. Given the same `G.hookRegistry`, identical trigger sequences always
  produce identical effects. This is required for replay correctness.
- `RULE_TRIGGER_NAMES` and `RULE_EFFECT_TYPES` are the canonical arrays — any
  code adding a new trigger or effect type must update these arrays, confirmed
  by drift-detection tests

### The endIf Contract

`endIf` is boardgame.io's mechanism for ending a match. In Legendary Arena it is
wired in the `play` phase as:

```ts
endIf: (G, ctx) => evaluateEndgame(G) ?? undefined
```

**Hard rules that must never be violated:**

1. **`endIf` must be a pure function** — no I/O, no events, no side effects.
2. **`endIf` must delegate entirely to `evaluateEndgame`** — no inline counter
   logic inside `endIf`.
3. **`evaluateEndgame` reads only `G.counters`** via `ENDGAME_CONDITIONS` constants.
4. **Loss before victory** when both conditions trigger simultaneously.

### G.counters Key Conventions

`G.counters` is `Record<string, number>`. Canonical endgame counter names are
defined in `ENDGAME_CONDITIONS` (exported from `src/endgame/endgame.types.ts`):

| Constant | Counter key string | Meaning |
|---|---|---|
| `ENDGAME_CONDITIONS.ESCAPED_VILLAINS` | `'escapedVillains'` | Villains past the City — checked against `ESCAPE_LIMIT` |
| `ENDGAME_CONDITIONS.SCHEME_LOSS` | `'schemeLoss'` | Scheme triggered — `>= 1` means loss |
| `ENDGAME_CONDITIONS.MASTERMIND_DEFEATED` | `'mastermindDefeated'` | All tactics defeated — `>= 1` means victory |

Any code incrementing these counters must import and use these constants — never
string literals. `ESCAPE_LIMIT = 8` is a hardcoded MVP constant; import it, do
not re-hardcode the value.

### RevealedCardType Conventions

`G.villainDeckCardTypes` is `Record<CardExtId, RevealedCardType>`. Canonical card
type strings are defined in `REVEALED_CARD_TYPES` (exported from
`src/villainDeck/villainDeck.types.ts`):

| Index | Type string | Trigger emitted on reveal |
|---|---|---|
| 0 | `'villain'` | `onCardRevealed` only (WP-015 routes to City) |
| 1 | `'henchman'` | `onCardRevealed` only (WP-015 routes to City) |
| 2 | `'bystander'` | `onCardRevealed` only |
| 3 | `'scheme-twist'` | `onCardRevealed` + `onSchemeTwistRevealed` |
| 4 | `'mastermind-strike'` | `onCardRevealed` + `onMastermindStrikeRevealed` |

Slugs use **hyphens not underscores** — established by the historical
`data/metadata/card-types.json` taxonomy (deleted by WP-084 on 2026-04-21;
the hyphen convention remains locked by `REVEALED_CARD_TYPES` and the
per-set JSON). A mismatch (e.g., `'scheme_twist'`) silently prevents the
correct trigger from firing because the type lookup in `revealVillainCard`
will not match the string literal in the conditional branch.

Any code that reads `G.villainDeckCardTypes` or defines a `RevealedCardType`
value must use `REVEALED_CARD_TYPES` constants — never inline string literals.
A drift-detection test in `villainDeck.setup.test.ts` guards this: failure means
a type string was added to the `RevealedCardType` union but not the canonical
array, or vice versa.

### Villain Deck Authority Boundary

The villain deck is governed by two strictly separate concerns:

1. **Deck Construction (Setup-Time Authority)**
   - Defines *what cards exist* in the villain deck
   - Defines *how many copies* of each card exist
   - Defines *CardExtId conventions* (virtual instancing)
   - May access registry data via function argument
   - Executes only during `Game.setup()`

2. **Reveal & Runtime Behaviour (Move-Time Authority)**
   - Defines *how cards are revealed*
   - Defines *which rule triggers fire*
   - Defines *where cards are routed after reveal*
   - Must not access registry data
   - Operates only on data stored in `G`

These concerns must never be combined in the same function or module.

#### Registry Access Rule (Non-Negotiable)

- Registry data may be accessed **only** during setup-time composition
  (e.g., villain deck construction in `buildVillainDeck`).
- Registry data must **never** be accessed during move execution
  (reveal, fight, recruit, escape, scoring).

Violation of this rule breaks determinism, replay safety, and offline
simulation.

#### Reveal Independence Invariant

Reveal logic must remain correct even if the villain deck is empty or
malformed. It must not attempt to repair, infer, or construct deck contents.

Related Work Packets:
- WP-014A — Villain Reveal & Trigger Pipeline
- WP-014B — Villain Deck Composition Rules & Registry Integration
- WP-015 — City & HQ Zones

#### Deck Composition Contract (WP-014B)

The villain deck is composed at setup time by `buildVillainDeck` using these
conventions (D-1410 through D-1413):

| Card Type | Source | ext_id Format | Count |
|---|---|---|---|
| Villain | `listCards()` FlatCard keys | `{setAbbr}-villain-{groupSlug}-{cardSlug}` | All cards in selected groups |
| Henchman | Virtual instancing from `SetData.henchmen[].slug` | `henchman-{groupSlug}-{index}` (zero-padded) | 10 per group |
| Scheme Twist | Virtual, scheme-scoped | `scheme-twist-{schemeSlug}-{index}` (zero-padded) | 8 per scheme |
| Bystander | Virtual, player-count derived | `bystander-villain-deck-{index}` (zero-padded) | 1 per player |
| Mastermind Strike | `SetData.masterminds[].cards` where `tactic !== true` | `{setAbbr}-mastermind-{mmSlug}-{cardSlug}` | From mastermind data |

Pre-shuffle lexical sort of the combined deck is mandatory — registry list
ordering may vary. Virtual cards have no intrinsic metadata; all behaviour
derives from rule triggers and game context.

### Canonical Reveal → Fight → Side-Effect Ordering (WP-015 / WP-016 / WP-017)

```text
┌────────────────────────────────────────────────────────────────────┐
│                        TURN-LEVEL FLOW (CANONICAL)                 │
└────────────────────────────────────────────────────────────────────┘

A) Villain Reveal (Engine-Driven)
─────────────────────────────────────────────────────────────────────
revealVillainCard
  │
  │ 1. Identify revealed CardExtId + RevealedCardType
  │
  │ 2. If type = 'villain' | 'henchman'
  │     ┌──────────────────────────────────────────────────────────┐
  │     │ City placement (WP-015)                                   │
  │     │ - insert at City[0]                                       │
  │     │ - shift toward City[4]                                   │
  │     │ - if City[4] overflows → escapedCard                     │
  │     └──────────────────────────────────────────────────────────┘
  │
  │     If escapedCard != null:
  │       - increment ENDGAME_CONDITIONS.ESCAPED_VILLAINS   (WP-015)
  │       - apply escape penalty (gainWound)               (WP-017)
  │       - resolve attached bystanders on escape          (WP-017)
  │
  │     - attach 1 bystander (if available) to this card  (WP-017)
  │
  │ 3. Emit reveal triggers / rule hooks                  (WP-014A)
  │
  │ 4. For non-City cards:
  │     - scheme-twist → trigger only
  │     - mastermind-strike → trigger only
  │     - bystander → discard (MVP; WP-017)
  │
  ▼

B) Player Action Phase — Fight (Player-Driven)
─────────────────────────────────────────────────────────────────────
fightVillain
  │
  │ 1. Validate args + stage gate                     (WP-016)
  │
  │ 2. Remove villain from City                       (WP-016)
  │
  │ 3. Place villain card in player.victory           (WP-016)
  │
  │ 4. Award attached bystanders to player.victory    (WP-017)
  │
  │ 5. Remove attachedBystanders entry for that card  (WP-017)
  │
  │ 6. Push informational message
  │
  ▼

C) Player Action Phase — Recruit (Player-Driven)
─────────────────────────────────────────────────────────────────────
recruitHero
  │
  │ 1. Validate args + stage gate                     (WP-016)
  │
  │ 2. Remove hero from HQ                            (WP-016)
  │
  │ 3. Place hero card in player.discard              (WP-016)
  │
  │ 4. Push informational message
  │
  ▼

─────────────────────────────────────────────────────────────────────
Boundary Rules (Non-Negotiable)
─────────────────────────────────────────────────────────────────────
- City placement ALWAYS occurs before trigger emission.
- WP-016 does not inspect or clean up attached state.
- WP-017 does not decide when fights occur.
- Escape penalties are reveal-time only.
- Attached bystanders are resolved exactly once:
    • on fight defeat, or
    • on escape (per MVP rule).
- Within the main stage, the player may choose to fight or recruit in
  any order. The engine does not impose an action sequence constraint
  (D-1602).
```

**Why this diagram exists**

This diagram is the authoritative ordering contract for villain reveal,
player combat, and secondary side-effects across WP-015, WP-016, and
WP-017.

It exists to prevent:
- duplicate application of escape penalties,
- premature or repeated awarding of bystanders,
- helper functions mutating `G` outside their layer,
- future packets re-ordering reveal, fight, and side-effect logic.

Any change to this ordering requires a new DECISIONS.md entry. Related
decisions: D-1405 through D-1409 (reveal pipeline), D-1601 (non-core
gating), D-1602 (player-controlled fight/recruit ordering).

### The `G.lobby.started` Observability Pattern

`G.lobby.started` is a boolean flag set to `true` by `startMatchIfReady()` before
calling `ctx.events.setPhase('setup')`. Without it, the UI cannot detect "lobby
completed" without fragile phase inference.

**Pattern:** When a phase transition has UI significance, store an explicit flag
in `G` before calling `ctx.events.setPhase()`. The flag lives in `G` — the source
of truth — not in `ctx.phase`.

### How Moves Work

```
Player submits move →
  boardgame.io validates it is the correct player's turn →
  boardgame.io calls moveFunction(G, ctx, args) →
  Move function (see "The Move Validation Contract" above):
    1. Validates args — if invalid: return void (no throw, no G mutation)
    2. Checks stage gate — if blocked: return void (no G mutation)
    3. Mutates G via zoneOps.ts helpers (see "Zone Mutation Rules" above) →
  boardgame.io stores the new G →
  boardgame.io calls endIf(G, ctx) →
    endIf delegates to evaluateEndgame(G) →
    If truthy: match ends
    If falsy: continue
```

Moves **never throw**. If a move threw, boardgame.io would catch it as an
unhandled exception and potentially crash the server process. Invalid input
is always silently discarded via `return` — after logging a structured error.

### How Phase Transitions Work

Phase transitions happen from inside moves via `ctx.events.setPhase('phaseName')`.
This is the **only** way to change phases — never by setting `ctx.phase` directly.

Every call to `ctx.events.setPhase()` must have a `// why:` comment explaining
the transition.

### How Turn Transitions Work

Within the `play` phase, turn transitions are driven by `advanceTurnStage`:

```
advanceTurnStage called with G.currentStage = 'start'
  → getNextTurnStage('start') returns 'main'
  → G.currentStage = 'main'; return G

advanceTurnStage called with G.currentStage = 'main'
  → getNextTurnStage('main') returns 'cleanup'
  → G.currentStage = 'cleanup'; return G

advanceTurnStage called with G.currentStage = 'cleanup'
  → getNextTurnStage('cleanup') returns null
  → ctx.events.endTurn()  // boardgame.io advances to next player
  → return G unchanged
```

`ctx.events.endTurn()` is the **only** mechanism for ending a turn and advancing
to the next player. Manual player index rotation is not permitted — boardgame.io
manages turn order.

Every call to `ctx.events.endTurn()` must have a `// why:` comment.

`getNextTurnStage` is the single authority on stage ordering — defined once in
`src/turn/turnPhases.logic.ts`, imported everywhere else. No other file may
encode the `start → main → cleanup` ordering.

### Why `G` Must Never Be Persisted

1. **Integrity**: boardgame.io tracks `G` as part of a versioned state chain.
2. **Determinism**: A match can always be reconstructed from setup config and
   ordered moves. Storing `G` mid-match is redundant.
3. **Correctness**: `G` contains derived data (`hookRegistry`, `villainDeckCardTypes`,
   `currentStage`) that must be reconstructed or reset at the right lifecycle
   points — not loaded from a snapshot.

---

### Execution Mode

Execution Checklists (ECs) are active. For any Work Packet with a
corresponding EC, the EC is the authoritative execution contract.

No code changes may be made unless an EC exists and all EC clauses
are satisfied.

---

## MVP Gameplay Invariants (WP-010–WP-026)

These invariants are locked by the Work Packets that established the MVP
gameplay loop. They apply to all current and future packets. Violating any
invariant below is an architectural bug, even if the code compiles.

### Endgame & Counters

- `evaluateEndgame(G)` is the **only** authority for match termination.
- All endgame triggers are mediated through `G.counters`.
- Endgame counters are **numeric flags**: a value >= 1 is truthy. Counters
  must never be boolean fields.
- Loss conditions are always evaluated **before** victory.
- All code that affects endgame state must use `ENDGAME_CONDITIONS` constants
  — never string literals.

### Registry & Runtime Boundary (D-1405)

- The registry is available **only during `Game.setup()`**.
- No move, rule hook, or scorer may query the registry at runtime.
- All card metadata required at runtime must be **resolved at setup time** and
  stored in `G` as plain data structures (e.g., `G.cardStats`,
  `G.villainDeckCardTypes`, `G.heroAbilityHooks`, `G.cardKeywords`,
  `G.schemeSetupInstructions`).
- Runtime logic operates exclusively on `CardExtId` strings and deterministic
  state derived from setup.

### Zones, State & Serialization

- All runtime state (`G`) must remain **JSON-serializable at all times**.
- Zones and piles store **`CardExtId` strings only**.
- No Maps, Sets, classes, functions, or closures are permitted in `G`.
- All zone mutations must be performed via **pure helper functions** that
  return new arrays and never mutate inputs.

### Moves & Determinism

- All boardgame.io moves follow the three-step contract: validate arguments,
  check stage gating, mutate `G`.
- Moves return `void`, never throw, and perform no I/O.
- All randomness must flow through `ctx.random.*` — never `Math.random()`.

### Economy vs Scoring

- The attack/recruit economy (`G.turnEconomy`) determines **what actions are
  allowed** during play. It resets each turn.
- VP scoring (`computeFinalScores`) determines **final results only**.
- Final score computation is a **pure function**: it must never mutate `G`,
  never trigger endgame logic, and never query the registry.
- Endgame detection (WP-010) and VP scoring (WP-020) are strictly separate
  concerns.

### Hero Abilities & Board Keywords (WP-021–WP-025)

- Hero ability hooks (`G.heroAbilityHooks`) are **data-only** declarations
  built at setup time. They contain no functions or closures.
- Hero keyword effects (draw, attack, recruit, ko) fire after `playCard`
  via `executeHeroEffects`. Execution respects conditions (AND logic).
- Unsupported keywords and unmet conditions produce **no mutation** — safe
  skip, not failure.
- Board keywords (`G.cardKeywords`) are **structural City rules**, separate
  from hero abilities. They fire automatically without player choice (D-2501).
- Patrol: additive fight cost modifier. Guard: blocks lower-index targets.
  Ambush: wound on City entry (inline `gainWound`, D-2503).
- `G.cardKeywords` and `G.heroAbilityHooks` are immutable during gameplay.

### Scheme Setup (WP-026)

- Scheme setup instructions (`G.schemeSetupInstructions`) are declarative,
  data-only contracts following D-2601 (Representation Before Execution).
- Instructions execute **once** during setup, before the first turn. They
  are never re-executed during moves.
- `SchemeSetupType` is a **closed union** — new types require a DECISIONS.md
  entry.
- Unknown instruction types log a warning and skip — never throw (D-1234).
- `modifyCitySize` is warn + no-op at MVP while `CityZone` is a fixed
  tuple (D-2602).
- Scheme **setup** (board config, WP-026) is formally separate from scheme
  **twist** (event reaction, WP-024). These must not be mixed (D-2601).
- Builder returns `[]` at MVP — no structured registry metadata yet (D-2504).

### Data Representation Before Execution (D-2601)

- Gameplay text (hero abilities, keywords, conditions, scheme setup) is
  represented in the engine **before it is executed**.
- Representation layers (contracts, hooks, taxonomies) must be in place before
  execution layers are introduced.
- Execution of represented data must never require refactoring existing
  state contracts.
- All gameplay behavior follows the Representation Before Execution (RBE)
  pattern: data-only contracts first, deterministic execution via pure
  helpers. Proven across `HookDefinition` (WP-009A), `HeroAbilityHook`
  (WP-021), `HeroEffectDescriptor` (WP-022), and `SchemeSetupInstruction`
  (WP-026).
- Setup-time builders use `registry: unknown` with local structural
  interfaces to respect the layer boundary — no `@legendary-arena/registry`
  imports in engine code.
- When data sources are incomplete, the safe-skip pattern applies: implement
  the full structure, return safe defaults for blocked types, document the
  gap with `// why:` comments (D-2302, D-2504).

### Debuggability & Diagnostics

- All engine behavior must be debuggable via **deterministic reproduction and
  state inspection** — not logging, breakpoints, or printf debugging.
- Behavior must be fully reproducible given identical setup configuration,
  identical RNG seed, and identical ordered moves.
- No state mutation may be introduced that cannot be inspected post-execution
  or validated via tests or replay analysis.
- After any operation, runtime state must remain JSON-serializable, packet-owned
  zones/counters must contain no invalid entries, and no cross-module state
  may be mutated outside declared scope.
- Failures must be localizable via invariant violation or unexpected state
  mutation.

#### Runtime Invariant Checks (WP-031)

`packages/game-engine/src/invariants/` hosts the runtime invariant
pipeline that formalizes these diagnostics as fail-fast checks. The
pipeline is structured as:

- **`InvariantCategory`** — closed 5-value union (`structural`,
  `gameRules`, `determinism`, `security`, `lifecycle`) with a canonical
  `INVARIANT_CATEGORIES` readonly array (drift-pinned by Test 1).
- **`assertInvariant(condition, category, message)`** — throwing
  assertion utility. Throws `InvariantViolationError` on violation.
  Contained to `Game.setup()` return path per D-3102 (setup-only
  wiring at MVP). No new throwing-convention exception introduced.
- **`runAllInvariantChecks(G, invariantContext)`** — orchestrator
  running every check in fixed category order (structural → gameRules
  → determinism → lifecycle), fail-fast on first violation.
- **11 pure check functions** across 4 implemented categories.
  Security/Visibility category is reserved (no checks at MVP).
- All check functions are pure, deterministic, have no I/O, no
  registry queries, no `boardgame.io` imports. They read `G` and
  either return `void` or throw via `assertInvariant`.

Per D-3102, per-move wiring is deferred to a follow-up WP. The setup
return path is the single observation point for MVP invariants.

Per D-3103, `checkNoCardInMultipleZones` uses fungible-token
exclusion semantics because `CardExtId` is a card-type identifier,
not a per-instance identifier, and the setup builders reuse six
well-known token strings inside piles and starting decks.

---

## Section 5 — Package Dependency Rules

### Rule Summary

```
packages/game-engine  ←── (no game-engine imports from here)
packages/registry     ←── (no registry imports from game-engine)
packages/preplan      ──→ game-engine (types only)
apps/server           ──→ game-engine, registry
apps/registry-viewer  ──→ registry
```

### Detailed Rules

**`packages/game-engine` may NOT import:**
- `@legendary-arena/registry` — card type classification data
  (`G.villainDeckCardTypes`) is built at setup time from the registry passed in
  as `matchData`. Move functions use this stored index — never the registry directly.
  Exception: `Game.setup()` receives the registry as `matchData` — this is
  correct and intentional. The prohibition is on importing the registry package
  at module scope, not on receiving it as a function parameter.
- `pg` or any database driver — no DB queries inside moves (ever)
- `boardgame.io` in pure helper files — these files must be independently
  testable without a boardgame.io instance. This prohibition covers:
  - `src/turn/turnPhases.logic.ts` — turn stage helpers
  - `src/state/zones.validate.ts` — zone shape validators
  - `src/rules/ruleHooks.*.ts` — trigger/effect contracts and registry
  - `src/rules/ruleRuntime.*.ts` — execution pipeline and effect applicator
  - `src/endgame/endgame.evaluate.ts` — endgame condition evaluator
  - `src/moves/zoneOps.ts` — zone mutation helpers
  - `src/villainDeck/villainDeck.types.ts` — card type definitions
  - `src/villainDeck/villainDeck.setup.ts` — deck construction helper
  - Any other pure logic file that does not need boardgame.io lifecycle hooks
- Any `apps/*` package

**`packages/registry` may NOT import:**
- `@legendary-arena/game-engine` — the registry knows nothing about game rules
- `@legendary-arena/preplan` — the registry knows nothing about planning
- `pg` — the registry reads from R2/filesystem, not PostgreSQL
- Any `apps/*` package

**`packages/preplan` may NOT import:**
- `@legendary-arena/game-engine` at runtime — type-only imports (`import type`)
  are permitted for shared types like `CardExtId`. Runtime imports (functions,
  classes, constants) are prohibited.
- `boardgame.io` — the preplan package is not part of the boardgame.io lifecycle
- `@legendary-arena/registry` — pre-planning does not load or validate card data
- `pg` or any database driver — pre-planning is client-side, non-persistent
- Any `apps/*` package

**`packages/preplan` is non-authoritative:**
- It never writes to `G`, `ctx`, or any engine state
- It operates on read-only snapshots of player state
- All randomness uses a client-local seedable PRNG (never `ctx.random.*`)
- Speculative state is disposable and may be destroyed at any time
- Design docs: `docs/ai/DESIGN-CONSTRAINTS-PREPLANNING.md`,
  `docs/ai/DESIGN-PREPLANNING.md`

**`apps/server` may NOT:**
- Implement game logic, rules, or gameplay — the server is a wiring layer only
- Import browser or DOM APIs
- Import UI frameworks (Vue, React)
- Import Direct R2 SDK for card data (use `@legendary-arena/registry`)
- Define a boardgame.io `Game()` directly — `LegendaryGame` comes from
  `@legendary-arena/game-engine`; `apps/server/src/game/legendary.mjs` is a
  backwards-compat thin re-export only

**`apps/server/scripts/` CLI scripts:**
- Use Node v22 built-in `fetch` exclusively — no axios, no node-fetch
- Exit 1 on failure with a full-sentence message to stderr
- Are ESM modules (`.mjs` extension or `"type": "module"`)
- Do not store credentials to disk

**Test files may NOT import:**
- `boardgame.io` directly — use `makeMockCtx` from
  `packages/game-engine/src/test/mockCtx.ts` instead
- `boardgame.io/testing` — the engine is tested by calling functions directly
  with mock contexts, not by running a match server

### Why These Rules Exist

The goal is **layered testability**: each package can be built, linted, and
tested independently without running the other packages.

The `G.villainDeckCardTypes` and `G.currentStage` patterns both follow the same
principle: data that move functions need at runtime is built or reset at the right
lifecycle point (setup, turn start) and stored in `G`. Zone shape validators
follow the same principle for testability: pure functions, no boardgame.io import,
callable in isolation.

These constraints are enforced by:
1. TypeScript `"paths"` configuration in each package's `tsconfig.json`
2. `pnpm` workspace dependency declarations in `package.json`
3. The lint checklist in `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`

---

## High‑Level System Diagram

```text
+------------------+
|   Client (UI)    |
|------------------|
| - Input          |
| - Rendering      |
| - Spectating     |
+---------+--------+
          |
          | intents (ClientTurnIntent)
          v
+------------------+
| Network Boundary |  apps/server
|------------------|
| - Wires packages |  ← NO game logic here
| - Turn intents   |
| - Validation     |
| - Ordering       |
| - CLI scripts    |
+---------+--------+
          |
          | move functions
          v
+------------------+
| Game Engine      |  packages/game-engine
|------------------|
| - LegendaryGame  |  ← single Game() object (boardgame.io ^0.50.0)
| - Lobby phase    |
| - Turn loop      |  ← start → main → cleanup cycle
| - Rule pipeline  |  ← HookDefinition + ImplementationMap
| - Keywords       |
| - City logic     |
| - Villain deck   |
| - Endgame eval   |
| - Invariants     |
+---------+--------+
          |
          | reads ext_id strings resolved at startup
          v
+------------------+
| Card Registry    |  packages/registry
|------------------|
| - Set metadata   |
| - Card schemas   |
| - Zod validation |
+---------+--------+
          |
          | R2 / local files (read-only at startup)
          v
+------------------+
| Determinism &    |
| Replay Layer     |
|------------------|
| - State hashing  |
| - Replay inputs  |
| - Snapshots      |
+---------+--------+
          |
          v
+------------------+
| Analytics & Ops  |
|------------------|
| - Metrics        |
| - Balance sim    |
| - Live Ops       |
+------------------+
```

---

## HTTP API Surface

The authoritative catalog of HTTP endpoints exposed (or coded but not yet exposed) by `apps/server` lives at [`docs/ai/REFERENCE/api-endpoints.md`](REFERENCE/api-endpoints.md). Every endpoint carries one of four `Status` values — `Wired | Shipped-but-unwired | Library-only | Pending` — and uses canonical field names from [`docs/ai/REFERENCE/00.2-data-requirements.md`](REFERENCE/00.2-data-requirements.md). Auth posture per endpoint is one of three values — `guest | handle-required | authenticated-session-required` — per `D-9905`. Update obligations on future API-touching WPs are locked by `D-11804` plus lint §21 (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) plus a one-line rule in `.claude/rules/work-packets.md` (replace-whole-row merge semantics — partial-update is FAIL). The catalog is descriptive, not prescriptive: this section adds a cross-link without re-describing the existing summary text in §"Match Lifecycle: From Config to Game State" or any other prose elsewhere in this file.

`apps/server`'s HTTP routes attach to a Koa router (`@koa/router` 10.x on top of `koa` 2.x) bundled by `boardgame.io`'s server entrypoint — both reach the server transitively via `boardgame.io`, not as direct workspace dependencies. Route registrars follow the `registerXyzRoutes(server.router, database, deps)` pattern: each adapter receives the same router instance handed to it by `Server({...})`, so HTTP framework choice is locked to whatever `boardgame.io` ships. A future swap of either the Koa version or the underlying framework is gated on a `boardgame.io` upgrade or replacement, not on a server-layer decision.

<!-- why: top-level cross-link section per WP-118 §6.1 file 2; placement chosen ahead of `## Internationalization` so the catalog appears as a top-level architectural surface alongside other cross-cutting governance docs. The Koa-router paragraph was added 2026-05-03 to close a gap surfaced by `scripts/architecture-inventory.mjs` (Application stacks section): every routes file in `apps/server/src/**` attached to `server.router`, but no doc said what `server.router` was. -->


---

## Client Routing

Both Vue 3 SPAs (`apps/arena-client`, `apps/registry-viewer`) ship with **no client router** today. Per-app view-state lives in app-local mechanisms preserved as the locked posture under `D-11701` (arena-client) and `D-11702` (registry-viewer):

- **`apps/arena-client`** discriminates the active view via a `selectRoute(parseQuery(window.location.search))` helper at `apps/arena-client/src/App.vue:84`, returning one of `'profile' | 'fixture' | 'live' | 'lobby'`. Deep-linking via `?profile=` / `?fixture=` / `?match=` + `?player=` + `?credentials=` is shipped and load-bearing for WP-061 fixture replay and WP-102 public profile (`/?profile=alice`). The Pinia store `useUiStateStore` (`apps/arena-client/src/stores/uiState.ts`) holds the `UIState` projection snapshot only — never view/tab/route state.
- **`apps/registry-viewer`** discriminates via a local `const activeView = ref<ActiveView>("cards")` at `apps/registry-viewer/src/App.vue:77`, switching across `'cards' | 'themes' | 'loadout'`. The WP-114 `setupUrlParams` query-string handling (`apps/registry-viewer/src/lib/setupUrlParams.ts` + `useSetupFromUrl.ts` + `LoadoutPreview.vue`) carries the loadout-preview URL surface.

History mode (`D-11703`) is **N/A** — `createWebHistory()` vs `createWebHashHistory()` is irrelevant when no client router is adopted in either app. A future WP that supersedes `D-11701` or `D-11702` with formal `vue-router@4.x` adoption owns the `D-11703` decision under its own scope.

The shareable replay URL format (`D-11704`) is **deferred** to whichever WP first exposes a replay UI surface. Likely candidate: a future `WP-NNN: Replay Viewer` or a client-side extension to WP-115's leaderboard `GET /api/leaderboards/scores/:replayHash` endpoint when its UI lands. Locking the format absent a concrete consumer would foreclose future format choices (short-IDs, signed-URL variants) without justification.

**Forbidden until a future supersession WP lands:** adopting any router other than `vue-router@4.x` (per `00.3 §7` forbidden-packages discipline); wiring `<router-view>` into either `App.vue` without superseding `D-11701` or `D-11702`; routing-driven SSR (Vue SPAs remain client-rendered); promoting either `selectRoute()` or `activeView` into a formal in-house router abstraction (Option C is bikeshed bait per WP-117 §Decision Points).

<!-- why: top-level cross-link section per WP-117 §6.1 file 1; placement after `## HTTP API Surface` and before `## Internationalization` so the routing posture appears alongside other cross-cutting governance surfaces. -->

---

## Internationalization

The MVP is English-only. Internationalization (i18n) is deferred. No `i18n` library is adopted; user-visible strings live where they are used (Vue templates, server prose, error messages, lobby UI text, etc.) and are NOT abstracted into a translation layer.

**Vision §17 scoping note.** Vision §17 (Accessibility & Inclusivity) covers keyboard navigation, screen-reader support, high-contrast modes, and color-blind-friendly indicators — it does **not** address internationalization. The `00.3 §17.1 #9` lint trigger surface groups accessibility and i18n together for governance review purposes, but Vision itself is silent on i18n. This section fills the vision-level i18n gap at the architecture-doc level until a future Vision-amendment WP closes the gap at the vision level (out of scope for WP-119).

**Future i18n adoption requires a dedicated WP and a `DECISIONS.md` entry.** Until that WP lands, the following are forbidden across all of `apps/arena-client`, `apps/registry-viewer`, `apps/server`, and any future user-visible surface:

- Adopting any i18n library (`vue-i18n`, `@formatjs/intl`, `react-intl`, etc.)
- Adding a `/locales/` directory or per-language string catalogs
- Introducing `t('...')` translation wrappers or equivalent helpers around user-visible strings
- Premature key extraction — moving inline strings to a key-based catalog "in preparation for i18n later"
- Any other ad-hoc string abstraction that creates a partial translation surface without a governance anchor

A future i18n WP triggering full Vision Alignment under §17 is required if the WP touches accessibility surfaces (e.g., RTL layout that affects screen-reader order). The controlling decision is `D-11901` in `docs/ai/DECISIONS.md`.

## Disconnect & Reconnect Semantics

Multiplayer match traffic flows over Socket.IO 4.8.x via `boardgame.io/client` (transport row in [`docs/02-ARCHITECTURE.md §Transport`](../02-ARCHITECTURE.md#transport); shipped under WP-090 2026-04-24). The application-level policy on top of that transport is locked under D-11601..D-11605 (with D-11606 deferred). The future implementation WP that wires reconnect handlers MUST cite WP-116 + the corresponding D-entries; no implementation may rely on boardgame.io's built-in defaults without an explicit DECISIONS supersession.

**Disconnect tracking does not mutate `G`.** Disconnect tracking, if added later, lives in `boardgame.io` framework state or in server-side session storage — never in `G`. The deterministic message log (`G.messages: string[]` per `packages/game-engine/src/types.ts:442`) MAY carry one-line disconnect / reconnect entries for replay inspection; that is a recording surface, not a state surface.

**Disconnect / reconnect events do not advance RNG state, auto-resolve randomness, or implicitly execute turn logic.** Any advancement of turn order, phase boundaries, or stage progression triggered by a disconnect or reconnect MUST be the explicit, deterministic consequence of a policy choice recorded in a `D-116NN` entry, with a `// why:` comment in the implementation citing the corresponding D-entry. Specifically: a disconnect handler MAY NOT call `ctx.events.endTurn()` or `ctx.events.setPhase()` as a side effect of the disconnect itself.

### Phase × event matrix

Outcomes per phase × event combination. Concrete timer magnitudes (grace windows, hard timeouts) are intentionally NOT locked here. Only the policy class per cell is governed in this WP; a future implementation WP gathers telemetry and locks numbers under its own DECISIONS entry.

| Phase \ Event | `disconnect` | `reconnect` | `timeout` |
|---|---|---|---|
| `lobby` | Player's `G.lobby.ready[playerId]` flag is cleared per **D-11603 = B**. Phase remains `lobby`. Other players continue to ready / unready independently. The lobby-class grace window from **D-11601 = B** starts. | Player rejoins the lobby as **not-ready** (re-confirmation required per **D-11603 = B**). State sync via boardgame.io standard sync. | Past the lobby-class grace window without rejoin, the player slot remains open until host action or until the **D-11604 = A** hard-timeout abandonment threshold accumulates (the lobby-class threshold may differ from the play-class threshold; the future implementation WP locks magnitudes). The lobby itself does not auto-cancel. |
| `setup` | Setup is server-driven and deterministic — no player input is solicited during `setup`, so a client disconnect during this phase does not pause setup execution. The setup-class grace window from **D-11601 = B** starts. | Player resumes whatever phase the engine is in (likely `play` if setup completed during the disconnect window). State sync via boardgame.io standard sync. | Past the setup-class grace window without rejoin, if the engine has advanced to `play`, the **D-11604 = A** play-class abandonment threshold begins accumulating from the start of `play`. The setup-class grace itself does not trigger abandonment. |
| `play` | Match is **paused** per **D-11602 = B**: no moves accepted from any player; `ctx.events.endTurn()` and `ctx.events.setPhase()` not fired as side effects of the disconnect. Read-only actions (viewing current `G` projection; chat if implemented) MAY remain available. The socket connection is NOT frozen — clients continue receiving heartbeats. The play-class grace window from **D-11601 = B** (longest of all phase classes) starts. A deterministic disconnect-event entry is appended to `G.messages`. | Pause is released; turn order resumes from where it was suspended; the dropped player rejoins their seat with full move authority. State sync via boardgame.io standard sync. A deterministic reconnect-event entry is appended to `G.messages`. | Past the play-class grace window without rejoin, the **D-11604 = A** hard-timeout window starts. If the player has not rejoined by hard-timeout expiry, the match forcibly ends; a deterministic replay is emitted with `endReason: 'abandoned'` per **D-11605 = A**. |
| `end` | Match is already terminated; disconnect from `end` is a UI close-out event. No state mutation triggered; no replay re-emission. | Rejoin to `end` is a read-only re-attachment — the player can view the final `G` projection but cannot mutate state (the engine treats post-`end` moves as no-ops per the existing move-validation contract). | N/A — `end` is terminal; no further timeout window applies. |

**Turn-stage adjacency in `play.main`.** A disconnect during `play.main` (the action window between `play.start` and `play.cleanup`) follows the `play` row above: pause begins; the play-class grace window starts; the dropped player's main-phase action authority is preserved across the pause. A disconnect during `play.start` or `play.cleanup` follows the same rule — pause is uniform across turn stages within `play`. The disconnect handler MUST NOT advance `G.currentStage` as a side effect of the disconnect; stage progression resumes only when the dropped player rejoins (or fails to rejoin and the abandonment threshold fires per **D-11604 = A**).

### Decision references

- **D-11601** — Rejoin grace window: phase-aware (Option B); concrete magnitudes deferred to future implementation WP.
- **D-11602** — Turn-handover during `play.main`: pause match (Option B); pause definition is structural (no `ctx.events.*` calls fire on disconnect; no moves accepted; read-only actions remain available; heartbeats continue).
- **D-11603** — Lobby ready-state on rejoin: cleared on disconnect (Option B); rejoining player must explicitly re-ready.
- **D-11604** — Mid-match abandonment threshold: hard timeout (Option A); match forcibly ends; replay emitted with `endReason: 'abandoned'`.
- **D-11605** — Replay-on-abort behavior: replay always emitted, with explicit `endReason` discriminator (Option A); partial replays under abandonment must be byte-replayable from recorded inputs up to the abandonment point per Vision §22.
- **D-11606** — Spectator behavior on player drop: deferred (Option A default); spectator-disconnect handling is undefined and forbidden from being inferred by implementation WPs until a future spectator-focused WP supersedes D-11606 with Option B.

The full closed set of `endReason` values is locked at the future implementation WP that wires the policy; D-11604 commits only that the field is required and that `'abandoned'` is one valid value. This mirrors the WP-118 D-11804 status-enum closed-set pattern.

---

*Last updated: WP-041 — formal architecture certification pass; version stamp 1.0.0; authority chain locks 01-VISION.md between ARCHITECTURE.md and .claude/rules; Field Classification table verified complete for all 20 G-class Runtime fields (WP-005B through WP-026); WP-119 — added `## Internationalization` section, aligned preplan import-rule wording across the four surface sites in this file*
*Maintained by: human developer — update this file when package boundaries or
data flow decisions change. Do not let a Work Packet change what this file says
without also updating this file.*
