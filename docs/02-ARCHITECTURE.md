# Legendary Arena -- Architecture Overview

> Human-facing summary of the system architecture.
> The **authoritative source** is [`docs/ai/ARCHITECTURE.md`](ai/ARCHITECTURE.md).
> If this file and the authoritative source conflict, the authoritative source wins.
>
> **Last updated:** 2026-04-29
>
> Recent updates since 2026-04-14:
> - Gameplay-client framework lock: Vue 3 + Vite + Pinia (WP-061)
> - First browser-to-engine live-match wiring shipped — Socket.IO transport (WP-090, 2026-04-24)
> - Hanko selected as authentication broker — governance only, implementation deferred (WP-099 / D-9901..D-9905, 2026-04-25)
> - `packages/preplan` promoted from "future" to shipped (WP-056..WP-058)
> - `packages/vue-sfc-loader` added as Shared Tooling layer (WP-065)

---

## System Layers

```
                    +-------------------------------+
                    |  Vue 3 SPAs                   |
                    |  arena-client (gameplay,      |
                    |    Socket.IO + HTTP)          |
                    |  registry-viewer (R2 only,    |
                    |    cards.barefootbetters.com) |
                    |  intents only                 |
                    +---------------+---------------+
                                    |
                    +---------------v---------------+   +----------------------+
                    |   apps/server/                |<--+  Hanko (broker)      |
                    |   Wiring layer only           |   |  passkey-first OIDC, |
                    |   boardgame.io Server()       |   |  self-hostable;      |
                    |   + apps/server/src/auth/     |   |  validates session,  |
                    |     hanko/ (chosen WP-099;    |   |  never owns identity |
                    |     impl deferred WP-112)     |   |  (D-9902)            |
                    +---------------+---------------+   +----------------------+
                                    |
              +---------------------+---------------------+
              |                                           |
  +-----------v-----------+              +----------------v--------+
  |  packages/game-engine |              |  packages/registry      |
  |  ALL game logic       |              |  Card data loading      |
  |  LegendaryGame        |              |  Zod validation         |
  |  boardgame.io ^0.50.0 |              |  Immutable CardRegistry |
  |  (LOCKED)             |              |  Themes (WP-055)        |
  +-----------+-----------+              +----------------+--------+
              |                                           |
              |  setup-time only                          |
              +-------------------------+-----------------+
                                        |
              +-------------------------+-------------------------+
              |                                                   |
  +-----------v---------+                          +--------------v----------+
  |   data/             |                          |  PostgreSQL             |
  |   Card JSON,        |                          |  legendary.* schema:    |
  |   metadata, seeds   |                          |  rules, players,        |
  |   R2 mirror         |                          |  replays, scores,       |
  +---------------------+                          |  badges                 |
                                                   +-------------------------+

  +-------------------------------+    +-------------------------------+
  |  packages/preplan (shipped)   |    |  packages/vue-sfc-loader      |
  |  Speculative per-client       |    |  Shared Tooling (orthogonal)  |
  |  planning; type-only imports; |    |  test-time SFC transform;     |
  |  reads engine state via       |    |  never in production runtime  |
  |  host-app projections;        |    |                               |
  |  non-authoritative            |    |                               |
  +-------------------------------+    +-------------------------------+

  +-------------------------------+
  |  apps/replay-producer         |
  |  CLI tool (cli-producer-app   |
  |  category, D-6301 / WP-063)   |
  |  consumes packages/game-engine|
  |  no DB, no network, no I/O    |
  +-------------------------------+
```

<!-- canonical phrasing per WP-119 / D-11901; if you edit the preplan paragraph below, sync the other two files: docs/ai/ARCHITECTURE.md, .claude/rules/architecture.md -->
Pre-planning's import / read posture: type-only imports at compile time; reads engine state via projections passed in by the host app. The engine has no awareness of pre-planning (no runtime edges into preplan). Shared Tooling is orthogonal — apps consume it only via `devDependencies` and test scripts. The `apps/replay-producer` CLI is an orthogonal consumer of `packages/game-engine` for replay snapshot production (no DB, no network, no I/O — see D-6301 / WP-063).

---

## Package Boundaries

| Package | Responsibility | May Import | Must NOT Import |
|---------|---------------|------------|-----------------|
| `packages/game-engine` | All gameplay logic (phases, moves, rules, endgame) | Node built-ins only | registry, preplan, server, vue-sfc-loader, pg, any apps |
| `packages/registry` | Card data loading and Zod validation | Node built-ins, zod | game-engine, preplan, server, vue-sfc-loader, pg, any apps |
| `packages/preplan` | Speculative per-client planning (non-authoritative) | game-engine — **type-only imports at compile time; reads engine state via projections passed in by the host app**. Node built-ins. | game-engine runtime, registry, server, boardgame.io, pg, any apps |
| `packages/vue-sfc-loader` | Shared Tooling — Vue SFC transform for `node:test` | `@vue/compiler-sfc`, `vue`, Node built-ins | every other package; never in any app's runtime `dependencies` |
| `apps/server` | Wiring: registry + rules + (future) Hanko session validation, runs Server() | game-engine, registry, pg | preplan, vue-sfc-loader, UI packages, browser APIs |
| `apps/registry-viewer` | Read-only card browser SPA (public) | registry, Vue, vue-sfc-loader (devDep) | game-engine, preplan, server, pg, vue-sfc-loader at runtime |
| `apps/arena-client` | Live-match gameplay client (Vue 3 SPA) | UI framework, `@legendary-arena/preplan` (runtime, per D-5901), vue-sfc-loader (devDep) | game-engine runtime, registry runtime, server, pg, vue-sfc-loader at runtime |
| `apps/replay-producer` | CLI tool — replay snapshot production (cli-producer-app category, D-6301 / WP-063) | game-engine, Node built-ins | registry, preplan, server, pg, boardgame.io (engine bridges CJS internally), any UI package, any network or DB I/O |

**Violations are bugs.** Dependencies flow strictly downward; the Shared Tooling layer is
orthogonal and test-only. No layer may reach upward or sideways.

---

## Tech Stack at a Glance

| Concern | Choice | Version | Source |
|---|---|---|---|
| Runtime | Node.js | ≥22 (built-in `fetch`) | [package.json](../package.json) `engines.node` |
| Module system | ESM-only | -- | [.claude/rules/code-style.md](../.claude/rules/code-style.md) |
| Package manager | pnpm | 10.32.1 | [package.json](../package.json) `packageManager` |
| Language | TypeScript | 5.4.x | workspace devDeps |
| Game engine | boardgame.io | ^0.50.0 (LOCKED) | [packages/game-engine/package.json](../packages/game-engine/package.json) -- D-1206 for CJS bridge |
| Gameplay client | Vue 3 + Vite + Pinia | 3.4 / 5 / 2.1 | [apps/arena-client/package.json](../apps/arena-client/package.json) -- framework lock per WP-061 |
| Registry viewer | Vue 3 + Vite + Zod | 3.4 / 5 / 3.23 | [apps/registry-viewer/package.json](../apps/registry-viewer/package.json) -- public at `cards.barefootbetters.com` |
| Schema validation | Zod | 3.23 | registry + viewer |
| Database driver | `pg` (PostgreSQL) | ^8.13 | [apps/server/package.json](../apps/server/package.json) |
| Static asset host | Cloudflare R2 | -- | `https://images.barefootbetters.com/` |
| Real-time transport | Socket.IO (via boardgame.io/client) | 4.8.x | shipped WP-090 (2026-04-24) |
| Authentication | Hanko (broker only) | -- | WP-099 / D-9901 (impl deferred WP-112) |
| Test runner | `node:test` (built-in) | -- | `*.test.ts` files; never `.test.mjs` |
| Vue SFC test transform | `@legendary-arena/vue-sfc-loader` (in-house) | workspace | dev/test only -- Shared Tooling |

---

## Server Startup (implemented in WP-004)

Two independent tasks must both succeed before the server accepts requests:

1. **Card Registry** -- `createRegistryFromLocalFiles({ metadataDir, cardsDir })`
   - Loads `data/metadata/sets.json` + `data/cards/*.json`
   - Validates against Zod schemas
   - Returns immutable `CardRegistry`
   - Log: `[server] registry loaded: 40 sets, 288 heroes, 2620 cards`

2. **Rules Text** -- `loadRules()` from `apps/server/src/rules/loader.mjs`
   - Reads from PostgreSQL `legendary.rules` table
   - Caches in memory via `getRules()`
   - Log: `[server] rules loaded: N rules`

If either fails, the server exits. The server uses `createRequire` to bridge boardgame.io's CJS-only server bundle (D-1206).

A future Hanko session-validation middleware will run on identity-bearing endpoints (replay
submission, profile reads). Game-creation and match-state endpoints accept guest sessions
unconditionally (D-9905). The decision is locked by WP-099 / D-9901..D-9905; the
implementation is deferred to WP-112 (`requireAuthenticatedSession`) and a future
Hanko-wiring WP. No Hanko code lives in the repo as of 2026-04-29.

---

## Transport

| Channel | Protocol | Used For |
|---|---|---|
| Match state sync | Socket.IO 4.8.x (via boardgame.io/client) | Live moves, state diffs, multi-player sync (shipped WP-090) |
| Match lifecycle | HTTP `POST` | `POST /games/legendary-arena/create`, `POST /games/legendary-arena/{matchID}/join` |
| Server CLI scripts | HTTP via Node 22 built-in `fetch` | `create-match.mjs`, `list-matches.mjs`, `join-match.mjs` (no axios, no node-fetch) |
| Static card / theme / glossary data | HTTPS to R2 | `https://images.barefootbetters.com/` (registry-viewer + arena-client) |
| Hanko OIDC verification (future) | HTTPS / JWKS | Server-side only; the arena-client carries an opaque session credential and never inspects claims (D-9904) |

---

## Authentication & Identity

Authentication and identity are **deliberately separated** per Vision §7a and D-9901..D-9905.

| Concern | Owner | Notes |
|---|---|---|
| Authentication broker | Hanko (passkey-first, OIDC-compliant, self-hostable) | Confined to `apps/server/src/auth/hanko/` (D-9904); never in the engine, registry, or any UI package |
| Federated IdPs | Google, Discord, direct email + passkey | Recorded under the federated claim, not under `'hanko'` |
| `legendary.players.auth_provider` enum | `'email' \| 'google' \| 'discord'` | Hanko itself never appears in the data model (D-9902) |
| `AccountId` (primary identity) | **Server-generated** UUID v4 via `node:crypto.randomUUID()` | Per WP-052 D-5201 -- Hanko's `sub` becomes `authProviderId` only |
| Replay ownership | Keyed on `AccountId`, not on broker `sub` | Survives broker rotation or replacement |
| Guest play | Permitted without authentication (D-9905) | Hanko never gates gameplay; identity-bearing surfaces (replays, leaderboards) require a session |
| Replacement-safety | Swapping Hanko for another OIDC broker (or rolling our own with `jsonwebtoken`) requires zero data migrations | Structural, not aspirational -- enforced by the module-path lock |

**Forbidden:** Auth0, Clerk, Passport, password storage. The Hanko carve-out is specific
(D-9903) -- additional brokers require their own WP and `DECISIONS.md` entry.

---

## Architectural Principles

1. **Determinism is non-negotiable** -- all randomness via `ctx.random.*`, never `Math.random()`
2. **Engine owns truth** -- clients send intents, never outcomes
3. **Data outlives code** -- persisted data is versioned and migrated explicitly
4. **Growth is constrained** -- immutable surfaces protected by versioning

---

## Game State (`G`) -- `LegendaryGameState`

- JSON-serializable at all times (no functions, Maps, Sets, classes)
- Mutated via Immer drafts (boardgame.io 0.50.x) -- moves return void
- **Never persisted** to any database, file, or cache
- Managed entirely by boardgame.io in memory

Key fields (21 total):

| Field | Purpose | Built at |
|-------|---------|----------|
| `matchConfiguration` | Immutable match config (9 fields) | setup |
| `playerZones` | Per-player deck/hand/discard/inPlay/victory | setup |
| `piles` | Shared bystanders/wounds/officers/sidekicks | setup |
| `villainDeck` | Deck + discard for villain reveals | setup |
| `villainDeckCardTypes` | Card type classification (O(1) lookup) | setup |
| `city` | 5-space villain zone (fixed tuple) | setup |
| `hq` | 5-slot hero recruit zone | setup |
| `mastermind` | Tactics deck + defeated list | setup |
| `cardStats` | Attack/recruit/cost per card | setup |
| `cardKeywords` | Board keywords (Patrol/Ambush/Guard) per card | setup |
| `heroAbilityHooks` | Hero ability declarations (data-only) | setup |
| `schemeSetupInstructions` | Scheme setup instructions (empty at MVP) | setup |
| `hookRegistry` | Rule hook definitions (data-only) | setup |
| `turnEconomy` | Per-turn attack/recruit tracking | turn start |
| `currentStage` | Turn stage: start/main/cleanup | turn start |
| `counters` | Named endgame counters | runtime |
| `messages` | Deterministic event log | runtime |
| `ko` | Knocked-out cards | runtime |
| `attachedBystanders` | Bystanders attached to villains | runtime |
| `lobby` | Player readiness + match start flag | setup |
| `selection` | Selected scheme/mastermind/group IDs | setup |

---

## Persistence Classes

| Class | Examples | Persist? |
|-------|----------|----------|
| **Runtime** (never persist) | `G`, `ctx`, `ImplementationMap`, socket data | No |
| **Configuration** (safe) | `MatchSetupConfig`, player names, timestamps | Yes |
| **Snapshot** (immutable records) | `MatchSnapshot` (zone counts only, never contents) | Yes |

---

## Phases and Turn Stages

```
Phases:   lobby -> setup -> play -> end     (locked names)
Stages:   start -> main -> cleanup          (within play phase only)
```

- Phase transitions via `ctx.events.setPhase()` only (with `// why:` comment)
- Turn transitions via `ctx.events.endTurn()` only (with `// why:` comment)
- `G.currentStage` tracks turn stage in `G`, not `ctx`

---

## Move Contract

Every move follows this exact sequence:
1. **Validate args** -- return void if invalid (never throw)
2. **Check stage gate** -- return void if blocked
3. **Mutate G** -- via `zoneOps.ts` helpers, return void

Only `Game.setup()` may throw. Moves never throw.

---

## Moves (8 total)

| Move | Stage | What It Does |
|------|-------|--------------|
| `drawCards` | start, main | Draw N cards from deck to hand |
| `playCard` | main | Move card from hand to inPlay, trigger hero effects |
| `revealVillainCard` | start | Draw from villain deck, route by card type, City placement |
| `fightVillain` | main | Fight a City villain (Patrol cost, Guard blocking) |
| `fightMastermind` | main | Fight mastermind, defeat tactic, check victory |
| `recruitHero` | main | Recruit from HQ, spend recruit points |
| `advanceStage` | any | Advance turn stage (start -> main -> cleanup) |
| `endTurn` | cleanup | Discard hand + inPlay, end turn |

All moves follow the three-step contract: validate args, check stage gate, mutate G.

---

## Rule Execution Pipeline

Two-step declarative + deterministic execution (D-2601):

1. **`executeRuleHooks(G, trigger, payload)`** -- reads G + hookRegistry, returns `RuleEffect[]`, never mutates G
2. **`applyRuleEffects(G, effects)`** -- applies effects via `for...of`, unknown types warn and skip

Triggers: `onCardRevealed`, `onSchemeTwistRevealed`, `onMastermindStrikeRevealed`, `onTurnStart`, `onTurnEnd`

Effect types: `queueMessage`, `modifyCounter`, `drawCards`, `discardHand`

Hero effects use a parallel path: `executeHeroEffects` fires keyword-based effects (draw, attack, recruit, ko) with optional conditions (requiresKeyword, playedThisTurn, heroClassMatch, requiresTeam).

---

## Setup-Time Resolution Pattern

The engine resolves all registry data during `Game.setup()` and stores results in G. Moves never access the registry.

| Builder | Source | G Field | WP |
|---------|--------|---------|-----|
| `buildVillainDeck` | Registry villain/henchman data | `villainDeck`, `villainDeckCardTypes` | WP-014B |
| `buildCardStats` | Registry card stat fields | `cardStats` | WP-018 |
| `buildMastermindState` | Registry mastermind data | `mastermind` | WP-019 |
| `buildHeroAbilityHooks` | Registry hero ability text | `heroAbilityHooks` | WP-021 |
| `buildCardKeywords` | Registry villain ability text | `cardKeywords` | WP-025 |
| `buildSchemeSetupInstructions` | Registry scheme data (MVP: `[]`) | `schemeSetupInstructions` | WP-026 |

All builders use `registry: unknown` with local structural interfaces to respect the layer boundary.

---

## Key Data Locations

| Data | Location | Mutable |
|------|----------|---------|
| Card metadata & images | R2 / `data/` local files | No |
| Live game state (`G`) | boardgame.io in-memory | Yes (moves only) |
| Rules text | PostgreSQL `legendary.rules` | No (seeded at deploy) |
| Card registry | Server in-memory | No (read-only after load) |
| Match setup config | boardgame.io matchData | No (input) |

---

## Internationalization

MVP is English-only. i18n is deferred. No `i18n` library is adopted; user-visible strings live where they are used. Future adoption requires a dedicated WP + `DECISIONS.md` entry. Vision §17 covers accessibility (keyboard nav, screen-reader support, high-contrast modes, color-blind indicators), not internationalization. **Authoritative version:** [`docs/ai/ARCHITECTURE.md §Internationalization`](ai/ARCHITECTURE.md#internationalization). **Controlling decision:** D-11901.

---

## For Full Details

- **Authoritative architecture:** [`docs/ai/ARCHITECTURE.md`](ai/ARCHITECTURE.md)
- **Vision (identity boundary §7a, scoring §20-§26, non-goals NG-1..NG-8):** [`docs/01-VISION.md`](01-VISION.md)
- **Layer enforcement rules:** `.claude/rules/*.md` (7 files)
- **Decisions log:** [`docs/ai/DECISIONS.md`](ai/DECISIONS.md) -- auth selection D-9901..D-9905, AccountId D-5201, boardgame.io CJS bridge D-1206
- **Data contracts:** [`docs/ai/REFERENCE/00.2-data-requirements.md`](ai/REFERENCE/00.2-data-requirements.md)
- **Code categories:** [`docs/ai/REFERENCE/02-CODE-CATEGORIES.md`](ai/REFERENCE/02-CODE-CATEGORIES.md)
- **Auth governance:** [`docs/ai/work-packets/WP-099-auth-provider-selection.md`](ai/work-packets/WP-099-auth-provider-selection.md)
- **Registry-viewer details:** [`apps/registry-viewer/CLAUDE.md`](../apps/registry-viewer/CLAUDE.md) (public at `cards.barefootbetters.com`)
- **Testing:** [`docs/06-TESTING.md`](06-TESTING.md) (314 engine tests, 10 drift-detection arrays)

*Last updated: 2026-04-29*
