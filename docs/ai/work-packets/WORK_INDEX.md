# Work Index — Legendary Arena

> **Authoritative execution order for all AI-assisted development sessions.**
> One Work Packet per Claude Code session. Update this file at the end of every
> session — check off completed packets, add new ones as they are defined.
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

All existing WPs through WP-060 are marked ✅ Reviewed. WP-048 through WP-054, WP-055, and WP-060 were audited during the 2026-04-15 Standardization Completeness Pass (no issues found). WP-061 through WP-064 were drafted 2026-04-16 as a UI-implementation chain and passed the lint-gate review (00.3) the same day: Vitest option removed in favor of `node:test`-only per §7/§12; verification code fences switched to `pwsh` and Windows paths per §9; forbidden-packages block added explicitly per §7; WP-063 determinism check now uses `Compare-Object` instead of Unix `diff`. WP-065 was added 2026-04-16 as a hard prerequisite for the UI chain: a shared `packages/vue-sfc-loader/` that makes `.vue` SFCs importable under `node:test` (the lint-forbidden Vitest escape hatch is replaced by this internal loader). WP-079 was added 2026-04-18 as a tiny doc-only decision-closure WP arising from the `docs/ai/MOVE_LOG_FORMAT.md` forensics report; passed the 00.3 lint-gate self-review the same day after two surgical patches (verification-command shell + acceptance-criteria count). Any future WPs must be reviewed before Claude Code executes them.

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

- [x] WP-001 — Foundation & Coordination System — Completed ✅ Reviewed
  Notes: Establishes the **repo-as-memory** AI coordination system — REFERENCE
  docs (not chat history) are the single authoritative project memory for all
  Claude Code sessions. Human-reviewed documentation pass only; no code
  generated, no commands run.

  **Override hierarchy** (locked here, documented in ARCHITECTURE.md header):
  `00.1-master-coordination-prompt.md` > `ARCHITECTURE.md` > Work Packets >
  conversation context. Higher entries always win in any conflict.

  **REFERENCE docs updated** (`docs/ai/REFERENCE/`):
  - `00.1` — coordination system, override hierarchy, WP template, session
    protocol, drift detection
  - `00.2` — `legendary.*` PostgreSQL namespace, `bigserial` PKs, `vp` field
    (not `strikeCount`), `ext_id text` cross-service identifiers, image URL
    patterns use hyphens not underscores
  - `00.3` — 28-item Final Gate, §16 code style coverage
  - `00.6` — Rules 13–15: ESM-only, data contract alignment, async error handling

  **Corrections locked into `00.2-data-requirements.md`** (critical for all
  future packets that reference schema or card data):
  - All PostgreSQL tables in `legendary.*` schema namespace
  - `ext_id text` as cross-service identifier type (not numeric FK)
  - `vp` field on masterminds (not `strikeCount`)
  - Image URLs in R2 use hyphens, not underscores

  WORK_INDEX created with Foundation Prompts table, phase structure, dependency
  chain, and procedure for adding new Work Packets.

- [x] WP-002 — boardgame.io Game Skeleton (Contracts Only) ✅ Reviewed — completed 2026-04-09
  Dependencies: WP-001, Foundation Prompts (01, 02)
  Notes: Creates `packages/game-engine/` from scratch using boardgame.io
  `^0.50.0` — this version is locked; do not upgrade without a DECISIONS.md
  entry (the `Game()` API, Immer mutation model, and `ctx` shape are
  version-specific);
  `LegendaryGame` (boardgame.io `Game()`) is the package's primary export and
  the single object through which ALL phases, moves, and hooks must be
  registered — never create parallel Game instances;
  `MatchConfiguration` interface — 9 fields from 00.2 §8.1 (initial type name;
  reconciled with `MatchSetupConfig` in WP-005A — both refer to the same
  9-field locked contract);
  `LegendaryGameState` — initial `G` type, empty at this stage, expanded by
  each successive packet that adds new state fields;
  4 phase names scaffolded here: `lobby`, `setup`, `play`, `end` (locked;
  WP-007A formalises via `MATCH_PHASES` array but does not change the names);
  `docs/ai/STATUS.md` and `docs/ai/DECISIONS.md` created (first entries);
  JSON-serializability test (`src/game.test.ts`, `node:test`) — the baseline
  test that every subsequent state change must not break;
  see ARCHITECTURE.md §Section 4 "The LegendaryGame Object" for version and
  mutation model details

- [x] WP-003 — Card Registry Verification & Defect Correction — Completed 2026-04-09 ✅ Reviewed
  Dependencies: WP-001
  Notes: `packages/registry/` already exists — fixes two confirmed defects and
  adds a smoke test. Does NOT create the registry from scratch.

  **Defect 1 — wrong fetch URL (silent failure):**
  `httpRegistry.ts` was fetching `metadata/card-types.json` instead of
  `metadata/sets.json`. The failure is silent because the two files have
  incompatible shapes — `card-types.json` entries `{ id, slug, name,
  displayName, prefix }` don't match `SetIndexEntrySchema`'s required
  `{ abbr, releaseDate }`, so Zod silently produces zero sets with no error
  thrown. Fix: fetch `metadata/sets.json` instead.

  **Defect 2 — `FlatCard.cost` typed too narrow:**
  Was `number | undefined`; must be `string | number | undefined` to match
  `HeroCardSchema.cost`. Real cards have star-cost strings like `"2*"` (e.g.,
  amwp Wasp). Same pattern applies to `attack`, `recruit`, and `vAttack` in
  later packets — see Convention "Hero card numeric fields are
  `string | number | undefined`".

  **Files NOT modified** (correct as-is; future packets must not alter them
  without strong reason): `schema.ts`, `shared.ts`, `localRegistry.ts`.

  **Smoke test** (`registry.smoke.test.ts`, `node:test`): confirms
  `listSets().length > 0`, `listCards().length > 0`, `validate().errors`
  non-blocking. This is the only `@legendary-arena/registry` test file.

  See ARCHITECTURE.md §Section 2 "Registry Metadata File Shapes" for the
  canonical shapes of `sets.json` vs `card-types.json` and why confusing
  them causes a silent failure.

- [x] WP-004 — Server Bootstrap (Game Engine + Registry Integration) ✅ Reviewed — completed 2026-04-09
  Dependencies: WP-002, WP-003
  Notes: Server is a **wiring layer only** — it must never contain game logic,
  implement rules, or define a boardgame.io `Game()` directly;
  replaces placeholder `game/legendary.mjs` with a thin re-export of
  `LegendaryGame` from `@legendary-arena/game-engine` (kept for backwards
  compatibility only);
  registry loaded at startup via `createRegistryFromLocalFiles` (local files —
  NOT the HTTP/R2 loader; see DECISIONS.md for why);
  `rules/loader.mjs` (`loadRules`/`getRules` from PostgreSQL) is from Foundation
  Prompt 01 and is **not modified** in this packet — two parallel startup tasks:
  registry load + rules load both complete before `Server()` accepts matches;
  creates `src/index.mjs` process entrypoint with SIGTERM graceful shutdown;
  updates `render.yaml` startCommand to `node apps/server/src/index.mjs`;
  see ARCHITECTURE.md §Section 1 for server layer constraints and
  §Section 2 "Server Startup Sequence" for the startup flow

- [x] WP-043 — Data Contracts Reference (Canonical Card & Metadata Shapes) ✅ Reviewed ✅ Completed (2026-04-10)
  Dependencies: WP-003
  Notes: Migrates legacy `00.2-data-requirements.md` into governed
  `docs/ai/REFERENCE/00.2-data-requirements.md`; documents card data shapes,
  metadata lookup shapes, image URL construction, ability text markup, and
  PostgreSQL table inventory; subordinate to `schema.ts` and ARCHITECTURE.md;
  excludes UI concerns (search/filter, preferences, feature flags) per Layer
  Boundary; does not modify any code — reference document only

- [x] WP-044 — Prompt Lint Governance Alignment ✅ Reviewed (2026-04-10)
  Dependencies: WP-001
  Notes: Updates governed `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`
  with subordination clause, Layer Boundary references in §4/§8/§16, and
  `.claude/rules/*.md` cross-references; no lint rules added or removed;
  the checklist remains a REFERENCE document (reusable pre-execution gate),
  distinct from `.claude/rules/*.md` (runtime enforcement); the legacy
  prompt version at `docs/prompts-legendary-area-game/00.3-*` is superseded
  but not deleted

- [x] WP-045 — Connection Health Check Governance Alignment ✅ Reviewed (2026-04-10)
  Dependencies: WP-001
  Notes: Updates governed `docs/ai/REFERENCE/00.4-connection-health-check.md`
  with subordination clause, Layer Boundary note (server/ops layer), and
  stop-on-failure semantics; distinguishes the health check gate (Foundation
  Prompt prerequisite) from the Lint Gate (per-WP gate in CLAUDE.md); no
  health checks added or removed; no script modifications; the legacy prompt
  version at `docs/prompts-legendary-area-game/00.4-*` is superseded

- [x] WP-046 — R2 Validation Governance Alignment ✅ Reviewed (2026-04-10)
  Dependencies: WP-001, WP-045
  Notes: Updates governed `docs/ai/REFERENCE/00.5-validation.md` with
  subordination clause, Layer Boundary note (registry/data layer), and
  stop-on-failure semantics; distinguishes from WP-042 (deployment
  checklists — operational procedures) vs 00.5 (reusable preflight script);
  no validation checks added or removed; no script modifications; the legacy
  prompt version at `docs/prompts-legendary-area-game/00.5-*` is superseded

- [x] WP-047 — Code Style Reference Governance Alignment ✅ Reviewed (2026-04-10)
  Dependencies: WP-001
  Notes: Updates governed `docs/ai/REFERENCE/00.6-code-style.md` header with
  subordination clause (ARCHITECTURE.md and `.claude/rules/code-style.md`),
  three-artifact relationship documentation (00.6 descriptive, rules/code-style.md
  enforcement, 00.3 §16 quality gate); no rules added, removed, or weakened;
  all 15 rules, code examples, enforcement mapping, and change policy preserved;
  no enforcement WP needed — `.claude/rules/code-style.md` already handles
  runtime enforcement

- [x] WP-055 — Theme Data Model (Mastermind / Scenario Themes v2) ✅ Reviewed — Executed 2026-04-20 at commit `dc7010e`
  Dependencies: WP-003, WP-005A
  Notes: Defines `ThemeDefinition` Zod schema as a registry-layer content
  primitive; `ThemeSetupIntentSchema` mirrors `MatchSetupConfig` ID fields
  exactly (`mastermindId`, `schemeId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`) but excludes count fields (themes describe composition, not
  pile sizing); `ThemePrimaryStoryReferenceSchema` includes editorial fields
  (`marvelUnlimitedUrl`, `externalIndexUrls`) — all optional, never
  authoritative; `content/themes/` directory with one JSON file per theme;
  `validateTheme` (sync) and `validateThemeFile` (async) with filename-to-
  themeId alignment check; `parDifficultyRating` excluded from v1 (PAR system
  does not exist yet); no engine imports, no runtime behavior, no loaders;
  theme loader, referential integrity, and MatchSetupConfig projection are
  deferred to consumer WPs as scope items — not standalone packets (design
  review decision 2026-04-12); parallel-safe with Phase 2+

- [x] WP-060 — Keyword & Rule Glossary Data Migration ✅ Reviewed — Executed 2026-04-20 at commit `412a31c`
  Dependencies: WP-003
  Notes: Migrated the hardcoded `KEYWORD_GLOSSARY` (113 entries) and
  `RULES_GLOSSARY` (20 entries) Maps from
  `apps/registry-viewer/src/composables/useRules.ts` into
  `data/metadata/keywords-full.json` + `data/metadata/rules-full.json`
  (alphabetical by `key`; token markup + smart quotes preserved verbatim);
  uploaded both files to `images.barefootbetters.com/metadata/` (verified
  HTTP 200); added new `apps/registry-viewer/src/lib/glossaryClient.ts`
  singleton fetcher mirroring `themeClient.ts` structure; `useRules.ts`
  retargeted to module-scope holders populated by a new exported
  `setGlossaries()` setter at `App.vue` mount, with `lookupKeyword` and
  `lookupRule` algorithmic bodies preserved byte-for-byte (exact /
  space-hyphen-stripped / prefix / suffix / substring matcher survived the
  retargeting — confirmed by modifier-keyword smoke 13c); `useGlossary.ts`
  gained reactive `allEntries` ref + exported `rebuildGlossaryEntries()`
  under viewer analog of 01.5 scope allowance; `App.vue` gained one
  glossary-load block inside existing `onMounted` try. `HERO_CLASS_GLOSSARY`
  (5 entries) stays hardcoded per D-6005. Display-only content — no Zod
  schema, no engine integration; non-blocking fetch (card view works if
  glossary load fails). Seven new DECISIONS.md entries (D-6001 through
  D-6007); `docs/03.1-DATA-SOURCES.md` §Registry Metadata updated.
  Baseline 588 / 0 preserved; engine 436 / 109 / 0 fail unchanged.
  Commit prefix `EC-106:` (seven-row EC-slot retargeting chain — original
  EC-060 consumed by 6a63b1c).

---

## Phase 1 — Game Setup Contracts & Determinism

These packets define *what* a match is before implementing *how* it plays.

- [x] WP-005A — Match Setup Contracts ✅ Reviewed ✅ Completed (2026-04-10)
  Dependencies: WP-002, WP-003
  Notes: Defines `MatchSetupConfig` (9 fields, locked names from 00.2 §8.1:
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`,
  `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`);
  `MatchSetupError { field, message }` and `ValidateMatchSetupResult` (discriminated
  union) — these are NOT `MoveResult`/`MoveError` which belong to WP-008A;
  `validateMatchSetup(input, registry)` checks BOTH shape AND registry ext_id
  existence — it is NOT shape-only (zone validators from WP-006A onward are
  shape-only); returns structured result, never throws;
  reconciles `MatchSetupConfig` with `MatchConfiguration` type from WP-002

- [x] WP-005B — Deterministic Setup Implementation — Completed 2026-04-10 ✅ Reviewed
  Dependencies: WP-005A
  Notes: `shuffleDeck(cards, ctx): string[]` returns a new array via
  `ctx.random.Shuffle` — never `Math.random()`, never mutates input;
  `makeMockCtx` reverses arrays (proves shuffle ran — identity shuffle would not);
  no boardgame.io import in `mockCtx.ts`;
  `buildInitialGameState(config, registry, ctx): LegendaryGameState` —
  full initial `G` with `selection`, `playerZones`, `bystanders`, `wounds`,
  `officers`, `sidekicks`;
  `Game.setup()` calls `validateMatchSetup` first, then throws `Error` on failure
  before building `G` — this is the ONLY place in the engine where throwing is
  correct (moves must never throw);
  `G` stores `ext_id` strings only — no full card objects;
  see ARCHITECTURE.md §Section 4 for the setup vs moves throwing distinction

- [x] WP-006A — Player State & Zones Contracts — Completed 2026-04-10 ✅ Reviewed
  Dependencies: WP-005B
  Notes: Locks `PlayerZones` (5 zones: `deck`, `hand`, `discard`, `inPlay`,
  `victory`), `GlobalPiles` (4 piles: `bystanders`, `wounds`, `officers`,
  `sidekicks`), `PlayerState`, and `CardExtId = string` (named type alias — not
  plain `string`); `ZoneValidationError { field, message }` — distinct from
  `MoveError { code, message, path }`: do NOT reuse `MoveError` for zone shape
  errors; `validateGameStateShape` and `validatePlayerStateShape` — structured
  results, never throw; validators check shape only, no registry ext_id existence;
  `zones.validate.ts` has no boardgame.io import (pure helper);
  see ARCHITECTURE.md §Section 2 for Zone & Pile Structure

- [x] WP-006B — Player State Initialization (Align to Zone Contracts) — Completed 2026-04-10 ✅ Reviewed
  Dependencies: WP-006A
  Notes: `buildPlayerState(playerId, startingDeck, ctx): PlayerState` — deck
  is shuffled starting deck, all other zones start `[]`; `// why:` comment
  required explaining that cards enter non-deck zones via moves, not setup;
  `buildGlobalPiles(config, ctx): GlobalPiles` — pile sizes come from
  `MatchSetupConfig` count fields (`bystandersCount`, `woundsCount`,
  `officersCount`, `sidekicksCount`);
  WP-006A contract files (`zones.types.ts`, `zones.validate.ts`) must not be
  modified in this packet;
  see ARCHITECTURE.md §Section 2 for Zone & Pile Structure and initialization rule

---

## Phase 2 — Core Turn Engine (Minimal Playable Loop)

These packets create the first playable (but incomplete) game loop.

- [x] WP-007A — Turn Structure & Phases Contracts ✅ Reviewed (completed 2026-04-10)
  Dependencies: WP-006B
  Notes: Locks the lifecycle-to-phase mapping from 00.2 §8.2 (Lobby→`lobby`,
  Setup→`setup`, In Progress→`play`, Completed→`end`) — do not invent alternate
  phase names; `MatchPhase` (4 values) and `TurnStage` (3 values: `start`,
  `main`, `cleanup`); `MATCH_PHASES` and `TURN_STAGES` are canonical `readonly`
  arrays — drift-detection test must assert these match their union types;
  `getNextTurnStage` returns `null` at `cleanup` (signals turn end — never cycles
  back); only two valid transitions: `start→main` and `main→cleanup`;
  `turnPhases.logic.ts` has no boardgame.io imports (pure helper);
  see ARCHITECTURE.md §Section 4 for The Turn Stage Cycle and Phase Sequence

- [x] WP-007B — Turn Loop Implementation ✅ Reviewed (completed 2026-04-10)
  Dependencies: WP-007A
  Notes: `currentStage: TurnStage` stored in `G` (not `ctx`) — boardgame.io's
  `ctx` does not expose inner stage to move functions; `// why:` comment required;
  `play` phase `onBegin` resets `G.currentStage = 'start'` on each new turn;
  `advanceTurnStage` calls `getNextTurnStage` from WP-007A — no duplicated
  stage ordering; no hardcoded stage strings in `turnLoop.ts` or `game.ts`;
  `ctx.events.endTurn()` called when `getNextTurnStage` returns `null`;
  integration test uses `makeMockCtx` — no live server, no `boardgame.io/testing`;
  WP-007A contract files must not be modified;
  see ARCHITECTURE.md §Section 4 for The Turn Stage Cycle

- [x] WP-008A — Core Moves Contracts (Draw, Play, End Turn) ✅ Reviewed — Completed 2026-04-10
  Dependencies: WP-007B
  Notes: `MoveResult`/`MoveError` are the **engine-wide result contract** —
  every move validator in every future packet must return `MoveResult` (imported
  from `coreMoves.types.ts`), not define a new parallel type;
  `PlayCardArgs.cardId` uses `CardExtId` not plain `string`;
  stage gating via `MOVE_ALLOWED_STAGES` (`drawCards`: start+main, `playCard`:
  main, `endTurn`: cleanup) — each assignment has a `// why:` comment;
  stage gating uses `TurnStage` constants — no hardcoded string literals;
  drift-detection test for `CORE_MOVE_NAMES`; all validators never throw;
  see ARCHITECTURE.md §Section 4 for The Move Validation Contract

- [x] WP-008B — Core Moves Implementation (Draw, Play, End Turn) ✅ Reviewed — Completed 2026-04-10
  Dependencies: WP-008A
  Notes: Three-step move ordering — validate args → check stage gate → mutate G;
  if either guard fails, return without mutation (never throw);
  `zoneOps.ts` helpers return new arrays — inputs never mutated, no boardgame.io
  import (`zoneOps.ts` is a pure helper);
  `endTurn` calls `ctx.events.endTurn()` with `// why:` — manual player index
  rotation is forbidden, boardgame.io manages turn order;
  reshuffle uses `shuffleDeck` from WP-005B — never `Math.random()`;
  WP-008A contract files (`coreMoves.types.ts`, `.validate.ts`, `.gating.ts`)
  must not be modified;
  see ARCHITECTURE.md §Section 4 for Zone Mutation Rules

---

## Phase 3 — MVP Multiplayer Infrastructure

These packets complete the minimum viable multiplayer loop.

- [x] WP-009A — Scheme & Mastermind Rule Hooks (Contracts) ✅ Reviewed — Completed 2026-04-11
  Dependencies: WP-008B
  Notes: Defines 5 trigger names (`onTurnStart`, `onTurnEnd`, `onCardRevealed`,
  `onSchemeTwistRevealed`, `onMastermindStrikeRevealed`) and 4 effect types
  (`queueMessage`, `modifyCounter`, `drawCards`, `discardHand`);
  `RULE_TRIGGER_NAMES` and `RULE_EFFECT_TYPES` are canonical `readonly` arrays —
  drift-detection tests must assert these match their union types;
  `HookDefinition` is data-only (5 fields: `id`, `kind`, `sourceId`, `triggers`,
  `priority`) — no handler functions, fully JSON-serializable;
  card references in all trigger payloads use `CardExtId`, not plain `string`;
  `MoveError` reused from WP-008A — no new error type;
  no `boardgame.io` import in any file under `src/rules/`;
  was previously incomplete — now complete
  Governance: Rule hooks consume validated, frozen composition (D-1244);
  hooks may read setup composition but must not modify it; no hook may
  infer missing setup fields or introduce defaults

- [x] WP-009B — Scheme & Mastermind Rule Execution (Minimal MVP) ✅ Reviewed (2026-04-11)
  Dependencies: WP-009A
  Notes: Introduces `ImplementationMap` (`Record<hookId, handler>`) — handler
  functions live outside `G`, never stored in state;
  `executeRuleHooks` returns `RuleEffect[]` without modifying `G` (Step 1);
  `applyRuleEffects` applies with `for...of`, never `.reduce()` (Step 2);
  unknown effect types push warning to `G.messages` — never throw;
  adds `G.messages: string[]`, `G.counters: Record<string, number>`,
  `G.hookRegistry: HookDefinition[]` to `LegendaryGameState`;
  `G.hookRegistry` built at setup from `matchData` (data-only) — not queried
  at runtime from registry;
  `buildDefaultHookDefinitions(matchSetupConfig)` builds hooks from `schemeId`
  and `mastermindId` in setup config;
  `onTurnStart`/`onTurnEnd` wired via `turn.onBegin`/`turn.onEnd`;
  WP-009A contract files (`ruleHooks.*.ts`) must not be modified;
  see ARCHITECTURE.md §Section 4 for the full pipeline explanation

- [x] WP-010 — Victory & Loss Conditions (Minimal MVP) ✅ Reviewed (2026-04-11)
  Dependencies: WP-009B
  Notes: Three conditions: `escapedVillains >= 8`, `schemeLoss >= 1`,
  `mastermindDefeated >= 1`; all read from `G.counters` using `ENDGAME_CONDITIONS`
  constants (not string literals — using wrong strings silently breaks the evaluator);
  `ESCAPE_LIMIT = 8` hardcoded MVP constant — will move to `MatchSetupConfig`
  when scheme-specific limits are added; loss before victory;
  `evaluateEndgame` pure function → wired into `endIf` (no inline counter
  logic in `endIf`); was previously truncated — now complete;
  see ARCHITECTURE.md §Section 4 for the full endIf contract

- [x] WP-011 — Match Creation & Lobby Flow (Minimal MVP) ✅ Reviewed (2026-04-11)
  Dependencies: WP-010
  Notes: Adds `G.lobby` (`LobbyState: { requiredPlayers, ready, started }`);
  `requiredPlayers` comes from `ctx.numPlayers` — not from `MatchSetupConfig`;
  lobby moves wired inside the `lobby` phase only — not top-level;
  `startMatchIfReady` calls `ctx.events.setPhase('setup')` — transitions to
  `setup` first, then `play` (not directly to `play`);
  `G.lobby.started` is a UI observability flag: set in `G` before the phase
  transition so the UI can detect "lobby completed" without inspecting `ctx.phase`;
  `create-match.mjs` CLI uses Node built-in `fetch`; `MoveResult`/`MoveError`
  reused from WP-008A; see ARCHITECTURE.md §Section 4 for the observability pattern

- [x] WP-012 — Match Listing, Join & Reconnect (Minimal MVP) ✅ Reviewed — **Complete 2026-04-11**
  Dependencies: WP-011
  Notes: Two CLI scripts (`list-matches.mjs`, `join-match.mjs`) using Node
  built-in `fetch` — no axios; unit tests stub `fetch` (no live server needed
  for tests); full end-to-end verified manually; no game logic changes

- [x] WP-013 — Persistence Boundaries & Snapshots ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-11)
  Dependencies: WP-012
  Notes: Creates `PERSISTENCE_CLASSES` constants, `MatchSnapshot` (zone counts
  only — no ext_id arrays), `PersistableMatchConfig`, `createSnapshot` (pure,
  frozen), `validateSnapshotShape`; ARCHITECTURE.md Section 3 already existed
  with three-class model and field table — no update needed; 130 tests pass

---

## Phase 4 — Core Gameplay Loop

These packets make the game play like Legendary for the first time.

- [x] WP-014A — Villain Reveal & Trigger Pipeline ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-11)
  Dependencies: WP-013
  Notes: Types (`RevealedCardType`, `VillainDeckState`, `REVEALED_CARD_TYPES`),
  `revealVillainCard` move (draw, classify, trigger, apply, discard), 12 new
  tests with mock deck fixtures, empty defaults in `buildInitialGameState`;
  `buildVillainDeck` deferred to WP-014B; discard routing temporary (WP-015
  changes to City)

- [x] WP-014B — Villain Deck Composition Rules & Registry Integration ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-11)
  Dependencies: WP-014A
  Notes: Implements `buildVillainDeck` using decisions D-1410 through D-1413;
  virtual card instancing for henchmen and scheme twists; ext_id conventions
  locked; composition counts are rules-driven (10 henchmen/group, 8 twists,
  1 bystander/player); defines `VillainDeckRegistryReader` interface;
  replaces empty defaults in `buildInitialGameState` with real data;
  D-1412 amended with bystander ext_id format

- [x] WP-015 — City & HQ Zones (Villain Movement + Escapes) ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-11)
  Dependencies: WP-014A
  Notes: `G.city` (5-tuple of `CardExtId | null`) and `G.hq` (5-tuple);
  `pushVillainIntoCity` is a pure helper (no boardgame.io import, no `.reduce()`);
  revealed villains/henchmen route to City instead of discard; cards pushed past
  space 4 escape and increment `G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS]`
  — must use the constant, not the string literal; bystander MVP handling:
  discard + message (WP-017 adds capture); HQ initialized empty (WP-016 populates);
  SharePoint links removed; test files use `.test.ts` not `.test.mjs`; normalized
  to PACKET-TEMPLATE structure

- [x] WP-015A — Reveal Safety Fixes (Stage Gate + No-Card-Drop) ✅ Reviewed ✅ Completed (2026-04-11)
  Dependencies: WP-015
  Notes: Patch packet. Adds internal stage gating to `revealVillainCard`
  (allowed in `start` stage only, per tabletop Legendary semantics and
  non-core move model from EC-014A). Fixes malformed city card-drop bug
  where deck removal occurred before city validation — card was silently
  lost. Defers deck removal until placement destination is confirmed.
  1 new test (stage gating); 1 updated test (malformed city deck assertion).

- [x] WP-016 — Fight First, Then Recruit (Minimal MVP) ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-11)
  Dependencies: WP-015
  Notes: Adds `fightVillain({ cityIndex })` and `recruitHero({ hqIndex })`
  moves, both `main` stage only, both follow three-step validation contract;
  fight-first is a **policy** (not a hard lockout) — documented in DECISIONS.md
  (D-1601 through D-1604); MVP: no attack/recruit point checking (WP-018),
  no card text effects (WP-022), no bystander rescue (WP-017); 14 new tests
  (7 per move); game.test.ts 01.5 wiring (5->7 moves)

- [x] WP-017 — KO, Wounds & Bystander Capture (Minimal MVP) ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-12)
  Dependencies: WP-016
  Notes: Adds `G.ko: CardExtId[]` and `G.attachedBystanders: Record<CardExtId,
  CardExtId[]>`; MVP: 1 bystander per villain entering City (simplified);
  escape causes current player to gain 1 wound (links WP-015 escapes to
  penalty); `koCard`, `gainWound`, `attachBystanderToVillain`,
  `awardAttachedBystanders`, `resolveEscapedBystanders` are pure helpers
  (no boardgame.io import, no `.reduce()`); modifies `fightVillain.ts` and
  `villainDeck.reveal.ts`; `city.logic.ts` NOT modified (pure helper
  boundary); 22 new tests; test files use `.test.ts`

- [x] WP-018 — Attack & Recruit Point Economy (Minimal MVP) ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-12)
  Dependencies: WP-017
  Notes: `G.turnEconomy` (attack/recruit/spentAttack/spentRecruit, reset per
  turn); `G.cardStats: Record<CardExtId, CardStatEntry>` built at setup time
  from registry — same pattern as `G.villainDeckCardTypes`; moves NEVER query
  registry (registry boundary enforced); deterministic parser strips `+`/`*`
  from `"2+"` → 2; `fightVillain` gated by available attack; `recruitHero`
  gated by available recruit; no conditional bonuses (WP-022); PowerBI links
  removed; test files `.test.ts`; normalized to PACKET-TEMPLATE

- [x] WP-019 — Mastermind Fight & Tactics (Minimal MVP) ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-12)
  Dependencies: WP-018
  Notes: `G.mastermind: MastermindState` with `id`, `baseCardId`,
  `tacticsDeck`, `tacticsDefeated`; `fightMastermind` move validates attack
  from `G.cardStats` (WP-018 pattern), defeats 1 tactic per fight (MVP),
  increments `G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED]` when all
  defeated — must use constant not string; `vAttack` parsed via WP-018's
  `parseCardStatValue` (no separate parser); no tactic text effects (WP-024);
  no VP scoring (WP-020); was truncated at 79 lines — normalized to full
  PACKET-TEMPLATE; SharePoint links removed

- [x] WP-020 — VP Scoring & Win Summary (Minimal MVP) ✅ Reviewed ✅ Reviewed ✅ Completed (2026-04-12)
  Dependencies: WP-019
  Notes: Pure `computeFinalScores(G): FinalScoreSummary` — read-only on G,
  never mutates, never triggers endgame (WP-010 owns that); MVP VP table
  locked as named constants (VP_VILLAIN=1, VP_HENCHMAN=1, VP_BYSTANDER=1,
  VP_TACTIC=5, VP_WOUND=-1); card classification via `G.villainDeckCardTypes`
  and `G.mastermind.tacticsDefeated` — no registry access; scores NOT stored
  in G during MVP (derived view); was truncated at 70 lines — normalized to
  full PACKET-TEMPLATE

---

## Phase 5 — Card Mechanics & Abilities

These packets make individual cards do things.

- [x] WP-021 — Hero Card Text & Keywords (Hooks Only) ✅ Reviewed ✅ Completed (2026-04-13)
  Dependencies: WP-020
  Notes: Hero ability hooks only — **no execution**; `HeroAbilityHook` is
  data-only, JSON-serializable (same pattern as `HookDefinition`);
  `HeroKeyword` closed canonical union with drift-detection; hooks built at
  setup time, immutable during gameplay; `G.heroAbilityHooks` stores hooks;
  rule engine can observe/query/filter hooks but no effects fire; execution
  deferred to WP-022+; was truncated at 56 lines — normalized to full
  PACKET-TEMPLATE; this packet is inert by design

- [x] WP-022 — Execute Hero Keywords (Minimal MVP) ✅ Reviewed ✅ Completed (2026-04-13)
  Dependencies: WP-021
  Notes: Executes 4 unconditional hero keywords only: `'draw'`, `'attack'`,
  `'recruit'`, `'ko'`; conditional effects safely skipped (no mutation);
  unsupported keywords safely ignored; uses zone-ops primitives for draw,
  addResources for economy, koCard helper for KO — no ad-hoc state writes;
  `'ko'` MVP targets the played card itself (no player choice); execution
  fires immediately after play in registration order; hero hook economy is
  additive to WP-018 base card stats; `ctx: unknown` avoids boardgame.io
  import; WP-021 contracts not modified; 11 new tests, 266 total passing

- [x] WP-023 — Conditional Hero Effects (Teams, Colors, Keywords) ✅ Reviewed ✅ Completed (2026-04-13)
  Dependencies: WP-022
  Notes: 4 MVP condition types: `heroClassMatch`, `requiresTeam`,
  `requiresKeyword`, `playedThisTurn`; conditions are checked not inferred
  (pure predicates, never mutate G); effects never inspect hidden information;
  ALL conditions must pass (AND logic); unsupported condition types safely
  skipped; `requiresKeyword` and `playedThisTurn` fully functional;
  `heroClassMatch` and `requiresTeam` are placeholders (return false) until
  team/class data is resolved into G; modifies WP-022 execution to integrate
  condition evaluation; WP-021 contracts not modified; condition type string
  is `heroClassMatch` (not `requiresColor` — pre-flight name drift fix);
  15 new tests, 281 total passing

- [x] WP-024 — Scheme & Mastermind Ability Execution ✅ Reviewed ✅ Completed (2026-04-13)
  Dependencies: WP-023
  Notes: Scheme twist and mastermind strike handlers use the same
  `executeRuleHooks` -> `applyRuleEffects` pipeline — no new execution engine;
  `schemeTwistHandler` fires on `onSchemeTwistRevealed`,
  `mastermindStrikeHandler` fires on `onMastermindStrikeRevealed`; scheme-loss
  increments `G.counters[ENDGAME_CONDITIONS.SCHEME_LOSS]` at threshold (7);
  MVP mastermind strike uses counter + message only (wound card effects
  deferred); WP-009B stubs replaced; 10 new tests, 291 total passing

- [x] WP-025 — Keywords: Patrol, Ambush, Guard ✅ Reviewed ✅ Completed (2026-04-13)
  Dependencies: WP-024
  Notes: `BoardKeyword` closed union (`'patrol'` | `'ambush'` | `'guard'`)
  with drift-detection; `G.cardKeywords` built at setup (registry boundary);
  Patrol: +1 fight cost; Ambush: wound on City entry; Guard: blocks targeting
  lower-index cards; board keywords are **structural City rules**, NOT hero
  abilities — automatic, no player choice, separate from hero hook system;
  was truncated at 63 lines — normalized to full PACKET-TEMPLATE

- [x] WP-026 — Scheme Setup Instructions & City Modifiers ✅ Reviewed ✅ Completed (2026-04-14)
  Dependencies: WP-025
  Notes: `SchemeSetupInstruction` data-only contract (D-0603 pattern);
  4 MVP instruction types: `modifyCitySize`, `addCityKeyword`,
  `addSchemeCounter`, `initialCityState`; instructions execute once during
  `setup` phase before first turn; persistent modifiers stored in G; no
  hard-coded scheme logic — all data-driven from registry at setup; scheme
  setup (board config) is separate from scheme twist (event reaction, WP-024);
  `G.schemeSetupInstructions` stored for replay observability; was truncated
  at 64 lines — normalized to full PACKET-TEMPLATE; final Phase 5 packet

---

## Phase 6 — Verification, UI & Production

These packets make the game safe to ship.

- [x] WP-027 — Determinism & Replay Verification Harness ✅ Reviewed (2026-04-14)
  Dependencies: WP-026
  Notes: `ReplayInput` canonical contract (seed + setupConfig + playerOrder +
  moves); `replayGame` pure function reconstructs game from inputs;
  `verifyDeterminism` runs replay twice and compares canonical state hashes;
  `computeStateHash` uses deterministic serialization (sorted keys);
  implements D-0201 (Replay as First-Class Feature); `ReplayInput` is
  Class 2 (Configuration) data — safe to persist; harness uses `makeMockCtx`
  not `boardgame.io/testing`; does NOT modify gameplay; was truncated at
  63 lines — normalized to full PACKET-TEMPLATE
  Governance: Replay correctness assumes match setup is engine-aligned,
  immutable, and fully validated before match creation (D-1244, D-1247);
  (match setup + move log) is the complete deterministic input set;
  replays referencing invalid setups must be rejected; no replay path
  may re-interpret or normalize setup data; seed wiring gap documented
  in D-1248

- [x] WP-028 — UI State Contract (Authoritative View Model) ✅ Reviewed (2026-04-14)
  Dependencies: WP-027
  Notes: `UIState` is the **only** state the UI consumes — derived, read-only,
  JSON-serializable; `buildUIState(G, ctx)` is a pure function (no mutation,
  no I/O); hides all engine internals (hookRegistry, cardStats,
  villainDeckCardTypes, heroAbilityHooks, ImplementationMap); player zones
  projected as counts not card arrays; implements D-0301; card display
  resolution is a separate UI concern (not in buildUIState); spectator views
  deferred to WP-029; was truncated at 80 lines — normalized to full
  PACKET-TEMPLATE

- [x] WP-029 — Spectator & Permissions View Models ✅ Reviewed (2026-04-14)
  Dependencies: WP-028
  Notes: `UIAudience` type (`player` + `spectator`);
  `filterUIStateForAudience` is a pure post-processing filter on UIState
  (never touches G); active player sees own hand ext_ids, others see counts
  only; spectators see all public zones + hand counts; deck order never
  revealed; implements D-0302 (Single UIState, Multiple Audiences); replay
  viewers use spectator audience; no alternate game states — one UIState,
  filtered views; was truncated at 57 lines — normalized to full
  PACKET-TEMPLATE

- [x] WP-030 — Campaign / Scenario Framework ✅ Reviewed ✅ Completed 2026-04-14
  Dependencies: WP-029
  Notes: `ScenarioDefinition` + `CampaignDefinition` + `CampaignState` — all
  data-only, JSON-serializable, external to engine (D-0501, D-0502);
  `applyScenarioOverrides` produces valid `MatchSetupConfig` — engine never
  knows about campaigns; `CampaignState` is Class 2 (Configuration), NOT part
  of `LegendaryGameState`; campaign replay = sequence of `ReplayInput` objects;
  no engine modifications; `ScenarioOutcome` named union shared between
  evaluator return and advance parameter (pre-flight tightening);
  `evaluateScenarioOutcome` takes separate victory/failure condition arrays
  to express loss-before-victory order (pre-flight shape refinement);
  `src/campaign/` classified as engine code category (D-3001, follows D-2706
  and D-2801 precedent); 8 new tests, 348 total; 01.5 runtime-wiring allowance
  NOT invoked — WP is purely additive; was truncated at 68 lines — normalized
  to full PACKET-TEMPLATE

- [x] WP-031 — Production Hardening & Engine Invariants ✅ Reviewed ✅ Completed 2026-04-15
  Dependencies: WP-029
  Notes: Five non-overlapping invariant categories: structural, gameRules,
  determinism, security (deferred), lifecycle. Canonical
  `INVARIANT_CATEGORIES` readonly array with Test 1 drift-detection
  assertion. `assertInvariant` throws `InvariantViolationError` on
  violation (D-0102 fail fast); invariant checks are pure helpers, no
  boardgame.io import, no registry import, no `.reduce()`, no
  `Math.random()`. Critical distinction enforced by Tests 9/10: invariant
  violations (structural corruption) fail fast; gameplay conditions
  (insufficient attack, empty pile) remain safe no-ops per D-0102
  clarification. Wiring scope: setup-only per D-3102 / Option B
  (per-move wiring deferred to a follow-up WP) — `runAllInvariantChecks`
  called from `Game.setup()` return path only, throwing covered by the
  existing `Game.setup() may throw` row in `.claude/rules/game-engine.md
  §Throwing Convention` (no new rule exception). 01.5 runtime-wiring
  allowance INVOKED with three minimal additive edits: `game.ts` (1
  import + 4-line setup-return wrap), `types.ts` (additive re-export
  block), `index.ts` (additive export block). 10 new tests in
  `invariants.test.ts`; 358 total tests, 94 suites, 0 failures (348
  baseline + 10 new); no existing test modified. Implements D-0001
  (Correctness Over Convenience) and D-0102 (Fail Fast on Invariant
  Violations). Mid-execution amendment: WP §D
  `checkNoCardInMultipleZones` semantics narrowed to
  fungible-token exclusion per A-031-01 / D-3103 because CardExtIds
  are card-type IDs (not per-instance) — the literal "no CardExtId in
  multiple zones" check would have thrown on every valid G. Six
  fungible token strings (starting-shield-agent, starting-shield-trooper,
  pile-bystander, pile-wound, pile-shield-officer, pile-sidekick) are
  excluded; cross-zone duplication of all other CardExtIds still fires
  the invariant. A-031-02 fixes a `victoryPile` → `victory` field-name
  drift in the WP draft. A-031-03 widens
  `checkValidPhase`/`checkTurnCounterMonotonic` parameter types to
  `| undefined` for mock-context test compatibility. Pre-flight RS-9 /
  RS-10 / RS-11 + PS-3 and copilot Findings #31 / #32 / #33 capture
  the discovery and resolution; both audit trails re-confirm. New
  decisions: D-3101 (invariants directory engine classification),
  D-3102 (setup-only wiring scope), D-3103 (card uniqueness fungible
  exclusion).

- [x] WP-032 — Network Sync & Turn Validation ✅ Reviewed (2026-04-15)
  Dependencies: WP-031
  Notes: `ClientTurnIntent` canonical submission format; engine-side
  `validateIntent` checks player, turn, move name, args — returns structured
  rejections (never throws); 5 rejection codes: WRONG_PLAYER, WRONG_TURN,
  INVALID_MOVE, MALFORMED_ARGS, DESYNC_DETECTED; desync detection via
  `computeStateHash` (WP-027) — engine state always wins (D-0402);
  transport-agnostic (works with boardgame.io or any future transport);
  implements D-0401, D-0402; was truncated at 66 lines — normalized to
  full PACKET-TEMPLATE

- [x] WP-033 — Content Authoring Toolkit ✅ Reviewed ✅ Complete 2026-04-16
  Dependencies: WP-031
  Notes: Author-facing JSON schemas for hero, villain, mastermind, scheme,
  scenario; `validateContent` + `validateContentBatch` — structural, enum,
  cross-reference, and hook consistency checks; returns structured results
  (never throws); schemas reference canonical unions (HERO_KEYWORDS,
  BOARD_KEYWORDS); content validation is pre-engine gate — invalid content
  never reaches Game.setup(); does NOT modify registry Zod schemas; implements
  D-0601, D-0602; was truncated at 78 lines — normalized to full
  PACKET-TEMPLATE

- [x] WP-034 — Versioning & Save Migration Strategy ✅ Reviewed (2026-04-19 pre-flight READY TO EXECUTE; SPEC pre-flight commit `c587f74` landed D-3401 + 02-CODE-CATEGORIES.md update + session prompt before execution) — Completed 2026-04-19 at commit `5139817` under EC-034 (see [session-wp034-versioning-save-migration.md](../invocations/session-wp034-versioning-save-migration.md))
  Dependencies: WP-033
  Execution Checklist: `docs/ai/execution-checklists/EC-034-versioning.checklist.md` (Done)
  Notes: Three independent version axes: `EngineVersion` (semver),
  `DataVersion` (integer), `ContentVersion` (integer); `VersionedArtifact<T>`
  embeds all stamps at save time; `checkCompatibility` returns structured
  result (compatible/migratable/incompatible) with five locked
  full-sentence message templates; migrations forward-only, pure,
  deterministic; incompatible + unmigratable = fail loud (D-0802 wins
  over D-1234 at the load boundary); engine never guesses old data
  meaning. Five new files under `packages/game-engine/src/versioning/`
  (D-3401 engine code category, seventh instance of the established
  pattern after replay/ui/campaign/invariants/network/content);
  additive re-exports in `types.ts` and `index.ts` only — no
  `LegendaryGameState` shape change, no other engine subdirectory
  touched. `migrateArtifact` MAY throw — load-boundary exception
  identical to `Game.setup()`'s throw rationale per D-0802
  fail-loud. `stampArtifact` is the single permitted wall-clock
  read in the versioning subtree (`new Date().toISOString()` for
  `savedAt` metadata, structurally distinct from the forbidden
  `Date.now` static helper per D-3401 sub-rule). MVP migration
  registry is `Object.freeze({})` — long-lived seam for future
  format changes. Engine tests 427 → 436 (+9 in one
  `describe('versioning (WP-034)')` block per P6-19 / P6-25);
  repo-wide tests 517 → 526. `pnpm-lock.yaml` absent (no new
  dep). Engine, registry, vue-sfc-loader, server, replay-producer,
  registry-viewer, arena-client all untouched. 01.5 NOT INVOKED.
  01.6 post-mortem MANDATORY (new long-lived abstraction
  `VersionedArtifact<T>` + new code-category directory D-3401) —
  delivered in-session at
  `docs/ai/post-mortems/01.6-WP-034-versioning-save-migration-strategy.md`;
  verdict WP COMPLETE. Zero in-allowlist refinements applied during
  post-mortem. Meta-finding: P6-43 (JSDoc + grep collision precedent
  authored from WP-064 execution and committed at `0c741c6`) caught
  six initial JSDoc-vs-grep collisions at the first verification
  gate run; all fixed via paraphrase form before re-test. First
  empirical demonstration that the precedent log is load-bearing
  across sessions. Three commits on this branch: `c587f74` SPEC
  (pre-flight), `5139817` EC-034 (code + post-mortem), `<this
  commit>` SPEC (governance close). Pre-commit review ran in a
  separate gatekeeper session per P6-35 default; no P6-42
  deviation.

- [x] WP-035 — Release, Deployment & Ops Playbook ✅ Reviewed
  Executed 2026-04-19 at commit `d5935b5` per session prompt
  `docs/ai/invocations/session-wp035-release-deployment-ops-playbook.md`.
  Dependencies: WP-034 (complete at `5139817`)
  Notes: Release artifacts (engine build + content bundle + migration bundle +
  validation report) — immutable once published; 4 environments: dev -> test ->
  staging -> prod with sequential promotion; mandatory release checklist gates
  every release (blocked if any fails); rollback strategy: revert engine +
  content together, no data loss (D-0902); incident response P0-P3; OpsCounters
  type for passive monitoring; produces `docs/ops/` documentation; WP-042
  provides specific deployment checklists on top of this framework; was 166
  lines but missing template sections — normalized to full PACKET-TEMPLATE.
  Execution shipped exactly the six expected files (3 new docs under
  `docs/ops/` + 1 new engine file at `packages/game-engine/src/ops/ops.types.ts`
  + 2 modified re-exports in `types.ts` / `index.ts`) plus the MANDATORY 01.6
  post-mortem. Engine count UNCHANGED at **436 / 109 / 0 fail** (RS-2 lock —
  zero new tests); repo-wide 526 / 0 fail. D-3501 landed in SPEC pre-flight
  commit `4b6b60b` classifying `packages/game-engine/src/ops/` as engine code
  category (eighth precedent after D-2706 / D-2801 / D-3001 / D-3101 / D-3201
  / D-3301 / D-3401). RS-1 option (a) locked at pre-flight: `OpsCounters` is a
  pure type with no runtime instance anywhere in the engine. Verification
  (16 of 16 pass): build exits 0; engine + repo test baselines unchanged; no
  framework / registry / server imports in new subtree; no wall-clock / RNG /
  timing helpers; no `.reduce()`; no I/O; no new npm deps; all other engine
  subdirectories untouched; both retained stashes intact (neither popped);
  EC-069 `<pending — gatekeeper session>` placeholder NOT backfilled (owned
  by separate SPEC session). 01.5 NOT INVOKED. 01.6 post-mortem MANDATORY
  (new long-lived abstraction `OpsCounters` + new code-category directory
  D-3501) — delivered in-session at
  `docs/ai/post-mortems/01.6-WP-035-release-deployment-ops-playbook.md`;
  verdict WP COMPLETE with zero mid-execution fixes. Three commits on this
  branch: `4b6b60b` SPEC (pre-flight), `d5935b5` EC-035 (code + post-mortem),
  `<this commit>` SPEC (governance close). Pre-commit review handoff per
  P6-35 default to a separate gatekeeper session. **Unblocks WP-042**
  (Deployment Checklists); WP-036 (AI Playtesting) dependency also green.

- [x] WP-042 — Deployment Checklists (Data, Database & Infrastructure) ✅ Reviewed (2026-04-19 pre-flight READY TO EXECUTE + copilot 30/30 CONFIRM; Commit A `c964cf4`) — Completed 2026-04-19 (see [session-wp042-deployment-checklists.md](../invocations/session-wp042-deployment-checklists.md))
  Dependencies: WP-035
  Notes: Converts legacy `00.2b-deployment-checklists.md` into governed
  verification procedures under `docs/ai/deployment/`. Ships scope-reduced
  per **D-4201**: R2 checklist full (§A.1 validation script usage with the
  six real env vars from `validate.ts` — `METADATA_DIR`, `SETS_DIR`,
  `HEALTH_OUT`, `R2_BASE_URL`, `SKIP_IMAGES`, `IMAGE_DELAY_MS`; §A.2 through
  §A.7 per spec); PostgreSQL checklist scope-reduced to §B.1 / §B.2 / §B.6 /
  §B.7 with explicit "deferred sections" pointer citing D-4201 for §B.3 /
  §B.4 / §B.5 / §B.8 awaiting WP-042.1. Three real migrations from
  Foundation Prompt 02 (`001_server_schema.sql`, `002_seed_rules.sql`,
  `003_game_sessions.sql`) documented; `scripts/seed-from-r2.mjs` references
  absent from both produced checklists (the script does not exist).
  D-4202 (P6-51 form-(2) back-pointer for legacy §C UI-rendering-layer
  exclusion) + D-4203 (P6-51 form-(1) Documentation-class invariant for
  WP-042) land in the EC-042 commit alongside the seven-file allowlist.
  Zero new runtime code, zero new scripts, zero `package.json` edits, zero
  new npm dependencies, zero new tests; engine baseline UNCHANGED at
  436 / 109 / 0 fail; repo-wide 526 / 0 fail. Paraphrase discipline per
  P6-50 — forbidden-token greps (`Konva`, `canvas`, `boardLayout`,
  `CARD_TINT`, `game-engine`, framework name, `LegendaryGame`,
  framework-context) all zero across the two produced checklists.
  01.5 NOT INVOKED (no types, no moves, no phase hooks added). 01.6
  post-mortem MANDATORY (new long-lived abstractions: two canonical
  deployment-pillar checklist surfaces + first concrete consumer of
  WP-035's `RELEASE_CHECKLIST.md` back-pointer pattern) — verdict WP
  COMPLETE. Post-mortem §8 flags three reality-reconciliation findings
  (env var list, `EXPECTED_DB_NAME` not in runner, §B.7 table coverage
  restricted to what the three shipped migrations actually create) as
  lessons-learned input for future pre-flights. Three commits: `cbb6476`
  SPEC pre-flight (D-4201 + WP-042 amendments + EC-042 amendments +
  session prompt); `c964cf4` EC-042 code + D-4202 + D-4203 + post-mortem;
  `<this commit>` SPEC governance close. **Unblocks WP-042.1** (deferred
  PostgreSQL seeding checklist sections).

- [ ] WP-042.1 — Deployment Checklists: Deferred PostgreSQL Seeding Sections
  Dependencies: WP-042, Foundation Prompt 03 revival
  Notes: Authors the four PostgreSQL checklist sections deferred by WP-042
  per **D-4201**: §B.3 (Lookup table seeding), §B.4 (Group and entity
  seeding), §B.5 (Card record seeding), §B.8 (Re-seeding procedure). All
  four depend on a seed runner (tentatively `scripts/seed-from-r2.mjs`),
  a corresponding `"seed"` entry in root `package.json`, and any
  additional `legendary.*` lookup-table migrations the seed runner
  requires (e.g., `004_upsert_indexes.sql` with `UNIQUE` constraints on
  `slug` columns per Foundation Prompt 03 deliverable 3). WP-042.1 is
  **blocked** until Foundation Prompt 03 is revived as a predecessor WP
  that delivers the seed runner + its `package.json` wiring +
  complementary migrations. Once that land, WP-042.1 extends the
  existing `docs/ai/deployment/postgresql-checklist.md` in place by
  converting the top-of-file "deferred sections" pointer into four full
  sections using the §B.1 / §B.2 / §B.6 / §B.7 structure established by
  WP-042, and adds the row-count verification queries (`legendary.sets`
  = 40, `legendary.card_types` = 37, `legendary.teams` = 25,
  `legendary.hero_classes` = 5, `legendary.icons` = 7,
  `legendary.rarities` = 3) that WP-042's §B.7 intentionally omits.
  Layer: Server / Operations. Class: Documentation (should preserve
  D-4203 discipline) unless the predecessor WP subsumes the seed-runner
  authoring into WP-042.1 directly, in which case the class changes to
  Code + Docs and a new DECISIONS.md entry is required to lift the
  D-4203 documentation-only invariant for WP-042.1 specifically.

- [x] WP-048 — PAR Scenario Scoring & Leaderboards ✅ Reviewed (2026-04-17 pre-flight READY TO EXECUTE + copilot 30/30 CONFIRM; commit c5f7ca4) — Completed 2026-04-17 (see [session-wp048-par-scenario-scoring.md](../invocations/session-wp048-par-scenario-scoring.md))
  Dependencies: WP-020, WP-027, WP-030
  Notes: Extends VP scoring (WP-020) into PAR-based scenario scoring per
  `docs/12-SCORING-REFERENCE.md`; `ScenarioKey` and `TeamKey` stable identity
  strings; `ScenarioScoringConfig` versioned per-scenario weights, caps, PAR
  baseline, penalty event mappings; `deriveScoringInputs(replayResult,
  gameState)` (D-4801) reads G directly, no `GameMessage` type introduced;
  non-villainEscaped penalty producers safe-skip to 0 per D-4801; integer
  arithmetic (centesimal) for determinism; monotonicity invariant enforced
  by config validation; self-contained configs per D-4805 (every
  `PenaltyEventType` key must be present in `penaltyEventWeights`);
  team-aggregate MVP per D-4803; end-of-match only per D-4804;
  `G.activeScoringConfig` field deferred to WP-067 per D-4802;
  `ScoreBreakdown` and `LeaderboardEntry` JSON-roundtrip tested per D-4806;
  `LeaderboardEntry` contract defined in engine, storage is server-only;
  anti-exploit controls (bystander cap, VP cap, round cost, per-event
  penalty weights); does NOT modify WP-020 or WP-027 contracts; implements
  Vision goals 20-25. 16 logic tests + 4 key tests; game-engine suite
  396/98, repo-wide 429. Note: session prompt quoted 392/425 for test
  counts (arithmetic error); authoritative counts are 396/429 from 20 new
  tests.

- [x] WP-065 — Vue SFC Test Transform Pipeline ✅ Reviewed (2026-04-16 lint-gate pass) — Completed 2026-04-17 (see [session-wp065-vue-sfc-loader.md](../invocations/session-wp065-vue-sfc-loader.md))
  Dependencies: none
  Notes: Creates `packages/vue-sfc-loader/` as a shared internal private
  package (`@legendary-arena/vue-sfc-loader`) that makes `.vue` SFCs
  importable under `node:test`. Lint §7 and §12 forbid Vitest / Jest /
  Mocha; `node:test` is mandatory project-wide, but Node cannot import
  `.vue` files without a compilation step. This package wraps
  `@vue/compiler-sfc` in a Node 22 `module.register()` loader hook
  exposed via the subpath `@legendary-arena/vue-sfc-loader/register`;
  consumers opt in by setting `NODE_OPTIONS=--import
  @legendary-arena/vue-sfc-loader/register` in their `test` script.
  Scoped to **tests only** — runtime SFC handling in Vite is unchanged.
  `<style>` blocks are stripped at test time (jsdom ignores CSS;
  component tests assert on text + a11y, not styles). Sourcemaps are
  emitted so stack traces point at `.vue` line numbers. Pure
  `compileVue` helper + deterministic output verified by tests.
  Hard prerequisite for WP-061, WP-062, WP-064 and every future UI WP
  that tests `.vue` components. If `apps/registry-viewer/` already had
  a home-rolled SFC shim, this packet consolidates it — DECISIONS.md
  records the consolidation outcome.

- [x] WP-061 — Gameplay Client Bootstrap ✅ Reviewed (2026-04-16 lint-gate pass) — Completed 2026-04-17 under commit prefix `EC-067:` (see [session-wp061-gameplay-client-bootstrap.md](../invocations/session-wp061-gameplay-client-bootstrap.md))
  Dependencies: WP-028, WP-065
  Notes: Creates `apps/arena-client/` as a new Vue 3 + Vite + Pinia + TypeScript
  SPA — the first gameplay client in the repo (distinct from `apps/registry-viewer/`,
  which is a card browser); exposes `useUiStateStore()` with a single slot
  `snapshot: UIState | null` and one mutation `setSnapshot`; fixture loader
  reads committed JSON `UIState` artifacts (`mid-turn`, `endgame-win`,
  `endgame-loss`) for deterministic rendering; ships `<BootstrapProbe />` as
  a wiring smoke test only — no HUD, no routing beyond a placeholder, no
  networking, no auth; engine import is type-only (no `@legendary-arena/game-engine`
  runtime import anywhere in `apps/arena-client/`); unblocks WP-062 and WP-064;
  test runner and router choice deferred to "match `apps/registry-viewer/`
  precedent" to avoid drift; accessibility baseline (WCAG AA contrast, focus
  rings) established in base CSS for all future UI packets to inherit.
  Layer rule: client apps consume engine types only; this WP enforces that
  boundary at repo setup time so it cannot regress later.

- [x] WP-062 — Arena HUD & Scoreboard (Client Projection View) ✅ Reviewed (2026-04-16 lint-gate pass) — Completed 2026-04-18 under EC-069 (see [session-wp062-arena-hud-scoreboard.md](../invocations/session-wp062-arena-hud-scoreboard.md))
  Dependencies: WP-061, WP-028, WP-029, WP-048, WP-067
  Notes: First on-screen presentation of `UIState`; fixed (non-floating) HUD
  comprising `<TurnPhaseBanner />`, `<SharedScoreboard />`, `<ParDeltaReadout />`,
  `<PlayerPanelList />`, `<EndgameSummary />`; five shared counters
  (bystandersRescued, escapedVillains, twistCount, tacticsRemaining,
  tacticsDefeated) rendered unconditionally from the required
  `UIState.progress` field (no phase gating — lobby renders zeros);
  `<ParDeltaReadout />` reads `gameOver.par.finalScore` when `'par' in gameOver`
  and renders em-dash otherwise (D-6701 dominant path); zero is a valid engine
  value rendered as `0`, not em-dash; bystanders-rescued counter carries
  `data-emphasis="primary"` exactly once per Vision §Heroic Values in Scoring;
  no client-side arithmetic on game values; `team` vocabulary forbidden;
  color-blind-safe Okabe-Ito palette with mandatory icon differentiation
  (color is never the sole signal); five new base.css tokens with numeric
  contrast-ratio comments under both light and dark `prefers-color-scheme`
  blocks; container/presenter split enforced (only `ArenaHud.vue` imports
  `useUiStateStore`); `ArenaHud.vue`, `PlayerPanel.vue`, `PlayerPanelList.vue`,
  `ParDeltaReadout.vue`, `EndgameSummary.vue` use the `defineComponent`
  authoring form per D-6512 / P6-30 (template-scope bindings beyond props
  require setup-returned surfacing under vue-sfc-loader's separate-compile
  pipeline); `TurnPhaseBanner.vue` + `SharedScoreboard.vue` remain in
  `<script setup>` form (props-only templates). Repo suite: 464 tests passing
  (engine 409/101, arena-client +22 tests / 6 new test files, registry 3,
  vue-sfc-loader 11, server 6); no engine or registry changes.

- [x] WP-063 — Replay Snapshot Producer ✅ Reviewed (2026-04-16 lint-gate pass) — Completed 2026-04-19 at commit `97560b1` under EC-071 (see [session-wp063-replay-snapshot-producer.md](../invocations/session-wp063-replay-snapshot-producer.md))
  Dependencies: WP-027, WP-028, WP-005B, WP-080 (step-level API —
  amended 2026-04-18 after WP-063 / EC-071 stopped at Pre-Session
  Gate #4; resumes after WP-080 / EC-072 lands)
  Notes: Two-part packet crossing engine + new CLI app; engine adds type
  `ReplaySnapshotSequence` (version: 1 literal, `readonly snapshots:
  readonly UIState[]`) and pure helper `buildSnapshotSequence({ setupConfig,
  seed, inputs })` that wraps WP-027's harness and calls `buildUIState`
  (WP-028) at each step, returning a frozen sequence; helper is pure (no I/O,
  no `console.*`, no wall clock, no RNG); new CLI app `apps/replay-producer/`
  wraps the helper with file I/O, exposing `produce-replay --in <file>
  --out <file> --produced-at <iso>`; `--produced-at` override required for
  byte-identical determinism tests across machines; exit codes documented
  (0/1/2/3/4); sorted top-level JSON keys for stable diffs; committed golden
  sample (`three-turn-sample`) demonstrates round-trip; consumed by WP-064;
  no change to `G`, `UIState`, `buildUIState`, WP-027 harness surface, or
  any existing engine move/phase; `apps/arena-client/`, `apps/registry-viewer/`,
  `apps/server/`, `packages/registry/`, `packages/preplan/` untouched.

- [x] WP-064 — Game Log & Replay Inspector ✅ Reviewed (2026-04-16 lint-gate pass) — Completed 2026-04-19 at commit `76beddc` under EC-074 (see [session-wp064-log-replay-inspector.md](../invocations/session-wp064-log-replay-inspector.md))
  Dependencies: WP-061, WP-063, WP-028, WP-027
  Execution Checklist: `docs/ai/execution-checklists/EC-074-log-replay-inspector.checklist.md` (Done)
  Notes: First post-match inspection UI; `<GameLogPanel />` renders
  `UIState.log` verbatim with `aria-live="polite"` and a `role="status"`
  empty state (no reformatting, no filtering — engine authors log entries,
  client renders them); `<ReplayInspector />` consumes a
  `ReplaySnapshotSequence` (imported as a type from WP-063) and drives
  the Pinia store via `setSnapshot` on index changes — client NEVER
  regenerates `UIState` from moves (Layer Boundary); keyboard operation
  (`←`/`→` step, `Home`/`End` jump) on the inspector root with
  `tabindex="0"` + listeners-on-root pattern locked as **D-6401** (first
  repo stepper precedent); `<ReplayFileLoader />` uses the browser `File`
  API to accept a JSON replay (no `fetch`, no network);
  `parseReplayJson(raw, source?)` carries the consumer-side D-6303
  `version === 1` assertion with three locked full-sentence error
  templates mirroring the WP-063 CLI wording. Fixture
  (`apps/arena-client/src/fixtures/replay/three-turn-sample.{json,
  inputs.json,cmd.txt}`) is 8 snapshots produced by the committed WP-063
  CLI from a hand-authored inputs file mixing `advanceStage` moves
  (visible `currentStage` transitions) with unknown-move records (log
  growth via `applyReplayStep`'s warning-and-skip) — phases unreachable
  per D-0205, fixture re-scoped to stage-and-log per the WP-064
  amendment 2026-04-19; byte-identical regeneration confirmed twice.
  Clamping (no wrap) at both step boundaries. `enableAutoPlay` is a
  forward-compat prop (default `false`, no implementation in this
  packet — autoplay deferred to keep scope to one session). `src/stores/`
  + `src/main.ts` + `src/fixtures/uiState/` + `src/components/hud/` +
  `apps/arena-client/package.json` untouched. `pnpm-lock.yaml` absent
  from diff (P6-44 pass — no new devDep). Engine, registry,
  vue-sfc-loader, server, replay-producer, registry-viewer all
  untouched. arena-client tests 35 → 66 (+31); repo-wide tests 486 → 517.
  01.5 NOT INVOKED. 01.6 post-mortem MANDATORY (new long-lived abstraction
  `parseReplayJson` + new keyboard focus precedent D-6401) — delivered
  in-session at `docs/ai/post-mortems/01.6-WP-064-log-replay-inspector.md`;
  verdict WP COMPLETE. One in-allowlist refinement applied during
  post-mortem (`currentLog` spread-copy in `<ReplayInspector />` —
  WP-028 / D-2802 aliasing-prevention pattern). Pre-commit review ran
  in a separate gatekeeper session per P6-35 default; no P6-42
  deviation. Two commits on this branch: `76beddc` EC-074 (code +
  fixture + post-mortem) and `<this commit>` SPEC (governance close).

- [x] WP-079 — Label Engine Replay Harness as Determinism-Only ✅ Completed 2026-04-19 at commit `1e6de0b` under EC-073 (Reviewed 2026-04-18 lint-gate pass; 00.3 self-lint clean after two surgical patches)
  Dependencies: WP-027, D-0205
  Execution Checklist: `docs/ai/execution-checklists/EC-073-label-replay-harness-determinism-only.checklist.md` (Done)
  Notes: Doc-only decision-closure WP carrying out D-0205's single
  follow-up action. Modifies two source files (doc-only content
  edit; zero runtime behavior change): `packages/game-engine/src/replay/replay.execute.ts`
  gains a module-header notice + wholesale `replayGame()` JSDoc
  rewrite; `packages/game-engine/src/replay/replay.verify.ts`
  gains a module-header sentence + wholesale `verifyDeterminism()`
  JSDoc rewrite. Forbidden phrases ("replays live matches",
  "replays a specific match", "reproduces live-match outcomes")
  must grep to zero; required phrases ("determinism-only" ≥ 2 in
  execute / ≥ 1 in verify; D-0205 xref in both; `MOVE_LOG_FORMAT.md`
  Gap #4 xref in execute). No signature changes. No export changes.
  No type changes. No test changes — test count IDENTICAL to
  starting commit. No new files. Hard upstream for WP-080 (both
  packets touch `replay.execute.ts`; WP-079 lands first, WP-080
  inherits the JSDoc narrowing verbatim). Commit prefix `EC-073:`
  at execution (NEVER `WP-079:` per P6-36). NO 01.6 post-mortem
  required (doc-only; no new abstraction; no new code category).

- [x] WP-080 — Replay Harness Step-Level API for Downstream Snapshot / Replay Tools ✅ Reviewed (2026-04-18 lint-gate pass — drafted to unblock WP-063 / EC-071 Pre-Session Gate #4) — Executed 2026-04-19 at commit `dd0e2fd`
  Dependencies: WP-027, WP-079, D-6304
  Execution Checklist: `docs/ai/execution-checklists/EC-072-replay-harness-step-level-api.checklist.md` (Done)
  Notes: Additive refactor to `packages/game-engine/src/replay/replay.execute.ts`:
  adds named export `applyReplayStep(gameState, move, numPlayers):
  LegendaryGameState` (Q1 = Option A — single function, minimum surface),
  mutate-and-return-same-reference contract (Q2 = Option A), and refactors
  `replayGame`'s internal loop to delegate each iteration to the new
  export (Q3 = Option A — single source of truth for dispatch).
  `MOVE_MAP` and `buildMoveContext` remain file-local; `ReplayMoveContext`
  remains a file-local structural interface (Q4 — not exported). One new
  export line added under the WP-027 block in `packages/game-engine/src/index.ts`.
  New test file `replay.execute.test.ts` adds three cases: identity
  (same inputs → same output state), `replayGame` regression guard
  (byte-identical `stateHash` on existing `verifyDeterminism` fixture
  pre- and post-refactor), and unknown-move warning-and-skip routing.
  `ReplayInputsFile` is OUT OF SCOPE (Q5 — WP-063's concern). RNG
  semantics unchanged; D-0205 remains in force (step function inherits
  reverse-shuffle determinism-only semantics). WP-079 is a hard upstream —
  both packets touch `replay.execute.ts`; WP-079 lands first with JSDoc
  narrowing, WP-080 inherits it verbatim. If WP-079 has no EC at WP-080
  execution time, drafting WP-079's EC is a transitive prerequisite.
  Commit prefix `EC-072:` at execution (never `WP-080:` per P6-36).
  Unblocks WP-063 Pre-Session Gate #4 once executed.

- [x] WP-066 — Registry Viewer: Card Image-to-Data Toggle (Done 2026-04-22, commit 8c5f28f; pre-flight: docs/ai/invocations/preflight-wp066.md; post-mortem: docs/ai/post-mortems/01.6-WP-066-registry-viewer-data-toggle.md)
  Dependencies: None (registry viewer is independent)
  Notes: Adds a global view-mode toggle to `apps/registry-viewer/` allowing
  users to switch between image view (current behavior) and a structured
  data view mirroring www.master-strike.com layout. Toggle state persisted
  in `localStorage` under key `cardViewMode` (`'image'` | `'data'`, default
  `'image'`). New components: `ViewModeToggle.vue` (button/switch), 
  `CardDataDisplay.vue` (structured card attributes table). Modified components:
  `App.vue` (manages global viewMode state), `CardDetail.vue` (conditional
  render image or data based on viewMode). Display attributes organized by
  section (cost, attack, recruit, abilities, metadata); both modes use same
  underlying `FlatCard` data; printable in data mode. Toggling view does not
  reset selected card or filters. No TypeScript errors. Follows
  `docs/ai/REFERENCE/00.6-code-style.md` conventions.

- [x] WP-067 — UIState Projection of PAR Scoring & Progress Counters ✅ Reviewed (2026-04-17 lint-gate pass) — Completed 2026-04-17 under EC-068 (see [session-wp067-uistate-par-projection-and-progress-counters.md](../invocations/session-wp067-uistate-par-projection-and-progress-counters.md))
  Dependencies: WP-028, WP-048
  Execution Checklist: `docs/ai/execution-checklists/EC-068-uistate-par-projection-and-progress-counters.checklist.md`
  Commit prefix: `EC-068:` (EC-066 / EC-067 taken; EC-068 is the next free slot)
  Lint-gate outcome: 1 fix applied (added explicit `00.6-code-style.md` citation
  to Non-Negotiable Constraints per §2). 1 scope amendment applied during
  lint-gate (adds 3 WP-061 fixture type-conformance edits to §Files Expected
  to Change — the new non-optional `UIState.progress` field forces
  `satisfies UIState` updates in the three committed fixtures; leaving them
  unchanged would break `pnpm -r test`). 2 non-blocking observations noted:
  (a) §5 file count is now 11 unconditional + 2 conditional + 3 governance;
  the 2 conditional files under §C (`types.ts`, `buildInitialGameState.ts`)
  are **highly likely to trigger** because WP-048 did NOT add
  `G.activeScoringConfig` (D-4802 explicitly deferred it to WP-067;
  confirmed post-commit against `2587bbb`). WP-067 therefore owns both
  the design decision (optional 3rd param to `buildInitialGameState`
  vs. server-layer population vs. 9-field `MatchSetupConfig` amend — see
  `session-context-wp067.md`) and the implementation; realistic file
  count is ≤ 16 not ≤ 14. (b) §14 Acceptance Criteria has 18 items vs
  the 6–12 advisory band, each binary / observable / specific across six
  concern subsections — consolidation would reduce traceability. Both
  observations non-blocking per 00.3 Final Gate (neither matches a
  ❌ FAIL condition).
  Notes: Engine-side bridge between WP-048 (PAR scoring types) and WP-062
  (Arena HUD). Adds `UIProgressCounters { bystandersRescued, escapedVillains }`
  and optional `UIGameOverState.par: UIParBreakdown { rawScore, parScore,
  finalScore, scoringConfigVersion }` to `UIState`. Extends `buildUIState`
  with two pure helpers: aggregates bystanders by scanning each player's
  victory pile via `G.villainDeckCardTypes`; reads `escapedVillains` from
  `G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0`; projects WP-048's
  `ScoreBreakdown` into `UIGameOverState.par` only when
  `G.activeScoringConfig` is defined and `phase === 'end'`. Adds drift
  tests asserting field-name stability. Purely additive — no existing
  `UIState` sub-type contract changes; no UI code modified; no new G
  counter introduced (bystanders aggregated at projection time per
  DECISIONS.md rationale). Discovered 2026-04-17 during WP-061 execution
  audit of WP-062 (see `session-context-wp062.md` §IMPORTANT and 01.4
  Precedent Log P6-30/31/32 context).
  Unblocks: WP-062 pre-flight blockers #1–#3 (dependency, no-UI, field
  names). WP-062 pre-flight blocker #4 (base.css allowlist) is
  independent.

- [x] WP-081 — Registry Build Pipeline Cleanup (Done, 2026-04-20, commit `ea5cfdd`; PS-2 amendment `9fae043`, PS-3 amendment `aab002f`)
  Dependencies: WP-003 (current `SetDataSchema` + `FlatCard` shape is
  load-bearing; pre-WP-003 symbols `CardSchema` / `CardIDSchema` /
  `CANONICAL_ID_REGEX` / `CardTypeSchema` are gone)
  Execution Checklist: `docs/ai/execution-checklists/EC-081-registry-build-pipeline-cleanup.checklist.md` (Draft)
  Commit prefix: `EC-081:` at execution (never `WP-081:` per P6-36)
  Notes: Subtractive cleanup packet. Deletes three broken operator
  scripts under `packages/registry/scripts/` that have been failing
  since WP-003 changed the registry schema shape (`normalize-cards.ts`,
  `build-dist.mjs`, `standardize-images.ts`). Trims
  `packages/registry/package.json` `scripts.build` to
  `"tsc -p tsconfig.build.json"` only, removes `scripts.normalize` and
  `scripts.standardize-img`. Deletes the redundant and misleadingly
  commented "Normalize cards" step from `.github/workflows/ci.yml`
  job `build` (job 1 already runs `pnpm registry:validate`; the
  duplicate in job 2 fails because the deleted `build-dist.mjs` cannot
  find `dist/cards.json`). Replaces the `README.md` pipeline diagram
  at lines 62-64 and acceptance items at lines 204-205 with accurate
  prose describing the current tsc-only build. Registers **D-8101**
  (delete-not-rewrite rationale: zero monorepo consumers of the old
  JSON artifacts `dist/cards.json` / `dist/index.json` / `dist/sets.json` /
  `dist/keywords.json` / `dist/registry-info.json`; runtime path is
  `metadata/sets.json` + `metadata/{abbr}.json` fetched directly from
  R2 by `httpRegistry.ts` / `localRegistry.ts`) and **D-8102**
  (`registry:validate` is the single CI validation step; merging build
  and validate responsibilities rejected). `packages/registry/src/**`
  untouched (WP-003 immutable files `schema.ts` / `shared.ts` /
  `impl/localRegistry.ts` unchanged); `validate.ts` and `upload-r2.ts`
  out of scope; no new tests, no new dependencies, no version bump;
  `pnpm-lock.yaml` unchanged. Test baseline UNCHANGED (engine
  `436 / 109 / 0 fail`; repo-wide `536 / 0 fail`). Discovered during
  WP-055 execution and flagged in `docs/ai/post-mortems/01.6-WP-055-theme-data-model.md`
  §8 item 3. After WP-081 lands, `pnpm --filter
  @legendary-arena/registry build` and `pnpm -r build` both exit 0 for
  the first time since WP-003.

- [x] WP-082 — Keyword & Rule Glossary Schema, Labels, and Rulebook Deep-Links ✅ Reviewed (2026-04-21 pre-flight READY TO EXECUTE with copilot-check 30/30 PASS after HOLD → CONFIRM cycle resolving PS-1..PS-4 + RISK FIX #1..#4; SPEC pre-flight bundle A0 lands session-context-wp082 + WORK_INDEX row + EC_INDEX row + EC-107 checklist + pre-flight + session prompt before execution) — Completed 2026-04-21 at commit `3da6ac3` under EC-107 (RS-3 diff gate STOP + path-1 quarantine of out-of-scope `rules-full.json` summary rewrite to `stash@{0}`; A-082-01 formalizes three beyond-allowlist Vite-resolution additions — viewer `"@legendary-arena/registry": "workspace:*"` dep, registry `"./schema"` subpath export, 3-line `pnpm-lock.yaml` workspace-link delta; A-082-02 records the RS-3 quarantine; A-082-03 records the R2 operator sequence including the initial `.md`-instead-of-`.pdf` upload iteration that was resolved before Commit B; cross-browser smoke 24/25 passed; 123 keywords / 118 with `pdfPage` / 5 omitted for lack of confirmable source; 20 rules / 19 with `pdfPage` / 1 (`asterisk`) omitted; 596 / 0 test baseline preserved)
  Dependencies: WP-060 (glossary data migrated to R2 — `412a31c`); WP-003 (registry schema authority + `zod` import in `schema.ts`); WP-055 (`themeClient.ts` singleton pattern reused by `glossaryClient.ts` per EC-106 precedent)
  Execution Checklist: `docs/ai/execution-checklists/EC-107-keyword-rule-glossary-schema-and-labels.checklist.md` (Draft at A0; flipped to Done at Commit B)
  Commit prefix: `EC-107:` at execution (never `WP-082:` per P6-36)
  Notes: Registry + registry-viewer + content/data WP. Adds `KeywordGlossaryEntrySchema`, `KeywordGlossarySchema`, `RuleGlossaryEntrySchema`, `RuleGlossarySchema` + inferred types `KeywordGlossaryEntry` / `RuleGlossaryEntry` to `packages/registry/src/schema.ts` — **first use of `.strict()` in the file** (author-facing-strict vs loader-permissive pattern per WP-033 / D-3303). Re-exports the four schemas + two types from `packages/registry/src/index.ts`. Backfills **required `label`** + **optional `pdfPage`** on all 123 entries in `data/metadata/keywords-full.json` (count drifted from 113 at WP-060 close to 123 at authoring time; 10 new keys `chooseavillaingroup` / `defeat` / `galactusconsumestheearth` / `greyheroes` / `halfpoints` / `locations` / `poisonvillains` / `reveal` / `shards` / `wound` present in working-tree awaiting label/pdfPage). Backfills optional `pdfPage` on `data/metadata/rules-full.json` 20 entries (RS-3 gate: first action of Commit A is `git diff data/metadata/rules-full.json` — whitespace → revert + re-apply; content → STOP). Uploads `docs/Marvel Legendary Universal Rules v23 (hyperlinks).pdf` (44 MB) to R2 at `images.barefootbetters.com/docs/legendary-universal-rules-v23.pdf` with `Content-Type: application/pdf` + `Cache-Control: max-age=31536000, immutable`. Adds `rulebookPdfUrl` field to `apps/registry-viewer/public/registry-config.json`. Rewrites `apps/registry-viewer/src/lib/glossaryClient.ts` to `.safeParse(...)` at the fetch boundary with full-sentence `console.warn` + empty-Map fallback (`.parse(...)` forbidden); widens the keyword Map value shape to `{ label: string; description: string }` per locked option (α). Adds parallel `Map<string, number>` for keyword `pdfPage` owned by `glossaryClient.ts` with a new `getKeywordPdfPageMap()` export in `useRules.ts` — **option (β) widening the keyword Map value past `{ label, description }` is forbidden without a new DECISIONS.md entry**. Widens `setGlossaries` / `getKeywordGlossaryMap` / `lookupKeyword` signatures in `useRules.ts`; `lookupKeyword` algorithmic body preserved byte-for-byte except three identifier-only `.description` suffix adds at lines 160 / 164 / 198 (exact / space-hyphen-stripped / prefix / suffix / substring branching intact). Widens `RuleEntry` with `pdfPage?: number`. Adds new exported `HERO_CLASS_LABELS: Map<string, string>` constant with 5 entries (`Covert`, `Instinct`, `Ranged`, `Strength`, `Tech`) — **no string-transformation helper under any name**. `HERO_CLASS_GLOSSARY` preserved verbatim. Deletes `titleCase()` function + both call sites in `apps/registry-viewer/src/composables/useGlossary.ts` (lines 89–100 body; call sites at lines 60 and 71) plus the dedup block at lines 52–55. `titleCase()` broke canonical rulebook capitalization in five confirmed WP-060 cases: `chooseavillaingroup`→`Chooseavillaingroup`, `shieldclearance`→`Shieldclearance`, `greyheroes`→`Greyheroes`, `halfpoints`→`Half-points`, and any punctuation-bearing name (`S.H.I.E.L.D. Clearance`). Extends `GlossaryEntry` interface with `pdfPage?: number`; `buildAllEntries()` consults `getKeywordPdfPageMap()` for keywords and reads `ruleEntry.pdfPage` for rules. Renders conditional `<a>` anchor in `apps/registry-viewer/src/components/GlossaryPanel.vue` after the `<div class="entry-description">` at line 140 with **mandatory** `@click.stop` (prevents parent `<li @click>` firing `scrollToEntry`), `target="_blank"`, `rel="noopener"` (security: prevents `window.opener` leakage); `v-if="entry.pdfPage !== undefined && rulebookPdfUrl"`; href `${rulebookPdfUrl}#page=${entry.pdfPage}` (RFC 3778 §3 open-parameter syntax). `apps/registry-viewer/src/App.vue` gains exactly one `ref<string | null>(null)` for `rulebookPdfUrl` populated from `config.rulebookPdfUrl ?? null` inside existing `onMounted` try, plus exactly one `:rulebook-pdf-url="rulebookPdfUrl"` prop on `<GlossaryPanel />` at line 424 — no other App.vue edit. Prepends **Authority Notice** blockquote to `docs/legendary-universal-rules-v23.md` (5262 lines of `pdftotext -layout` output from `docs/Marvel Legendary Universal Rules v23.txt` already authored); markdown extract is the authoritative `pdfPage` source ("Page numbers must not be inferred from the PDF alone"). Updates `apps/registry-viewer/CLAUDE.md` with verbatim sentence "Do not infer labels from keys under any circumstance." and Zod / label / pdfPage deep-link content. Updates `docs/03.1-DATA-SOURCES.md` §Registry Metadata (113 → 123 + schema-reference notes + new rulebook PDF row). Six new DECISIONS.md entries in Commit B, including drift-detection note ("`.strict()` + governed-extension path enforces drift for open-ended editorial metadata rather than canonical-array parity per WP-033 / D-3303") and D-6001 symmetric supersession back-pointers ("Supersedes D-6001 partial — Zod schema clause only; display-only clause remains"). `rulebookPdfUrl` absence is a **supported configuration** — silent anchor omission, no fallback UI, no warning/banner/console message. Browser-native `#page=N` PDF viewer only — no PDF.js bundle. Test baseline UNCHANGED at **596 passing / 0 failing** (registry 13 / vue-sfc-loader 11 / game-engine 444 / replay-producer 4 / server 6 / preplan 52 / arena-client 66; registry-viewer has no test script). No new tests required. No new dependencies (`zod` already in `packages/registry`); `pnpm-lock.yaml` unchanged. 01.5 engine clause NOT INVOKED (no `LegendaryGameState` field, no `buildInitialGameState` change, no `LegendaryGame.moves` entry, no phase hook); viewer analog is invoked (explicit authorization) per WP-060 / D-6007 for 5 viewer files. 01.6 post-mortem NOT TRIGGERED (new schemas are instances of existing abstraction; no new code category; zero engine touch). Three-commit topology: A0 `SPEC:` (governance bundle — WORK_INDEX row + EC_INDEX row + session-context + WP + EC + pre-flight with CONFIRM block + session prompt) → A `EC-107:` (code + JSON + viewer + docs) → B `SPEC:` (STATUS/WORK_INDEX flip + EC_INDEX flip + DECISIONS). R2 PDF upload + JSON republish are separate operator steps between A and B. Staging discipline: exact-filename only per P6-27 / P6-44 / P6-50; inherited dirty tree has 5 in-scope items (two modified JSONs + three doc files including EC-107 itself) plus ~22 quarantined out-of-scope items (listed in session-context-wp082 §2.3).

- [x] WP-083 — Fetch-Time Schema Validation for Registry-Viewer Clients ✅ Completed 2026-04-21 at commit `601d6fc` under EC-108 (pre-flight v2 READY TO EXECUTE after PS-1/2/3 resolution + A-083-04 amendment; copilot-check v2 CONFIRM 30/30 PASS; verification steps 1–22 + 7.1 + 7.2 + 7.3 all pass; baseline preserved 596/0 failing; offline schema smokes 23d–23h + bonus regex all behave as locked; dev server happy path + production preview bundle both serve HTTP 200 with retrofit strings present and zero `__vite-browser-external` leaks; 69 shipped themes validate against `ThemeDefinitionSchema` with fail = 0; five governance entries D-8301..D-8305 land at Commit B)
  Dependencies: WP-060 (glossary data migrated to R2 — `412a31c`); WP-082 / EC-107 complete (`3da6ac3` 2026-04-21) — landed the `./schema` subpath precedent (A-082-01) that A-083-04 mirrors for `./theme.schema`. Independent of WP-082 content-wise; `ViewerConfigSchema.rulebookPdfUrl` is optional so either order is safe.
  Execution Checklist: `docs/ai/execution-checklists/EC-108-fetch-time-schema-validation.checklist.md` (Draft at A0; flipped to Done at Commit B)
  Commit prefix: `EC-108:` at execution (never `WP-083:` per P6-36)
  Notes: Registry + registry-viewer retrofit WP. Adds `ViewerConfigSchema` + `ThemeIndexSchema` + inferred types `ViewerConfig` / `ThemeIndex` to `packages/registry/src/schema.ts` — both `.strict()` where applicable (`ViewerConfigSchema` only; `ThemeIndexSchema` is an array). `RegistryConfigSchema` body preserved byte-for-byte; only the adjacent comment updated to disambiguate from `ViewerConfigSchema` (D-8302 locks the naming distinction). `packages/registry/src/index.ts` general-schema re-export block extended; theme-schema re-export block at lines ~47–57 **not modified**. `packages/registry/package.json` gains `"./theme.schema"` subpath entry per **amendment A-083-04** (mirrors A-082-01 `./schema` precedent — barrel imports break the viewer's Vite/Rollup build per `glossaryClient.ts:20–28`). `apps/registry-viewer/src/lib/registryClient.ts` retrofitted to `.safeParse(...)` at the fetch boundary with full-sentence `[RegistryConfig] Rejected ...` throw; imports `ViewerConfigSchema` + `ViewerConfig` from `@legendary-arena/registry/schema` subpath (barrel forbidden). `apps/registry-viewer/src/lib/themeClient.ts` retrofitted with split-subpath imports: `ThemeIndexSchema` from `@legendary-arena/registry/schema` AND `ThemeDefinitionSchema` + `ThemeDefinition` from new `@legendary-arena/registry/theme.schema` subpath; four inline interfaces (`ThemeSetupIntent` / `ThemePlayerCount` / `ThemePrimaryStoryReference` / `ThemeDefinition`) at lines ~12–47 deleted; index validation throws on failure; individual-theme validation warns + skips (`Promise.allSettled` + null-filter + sort-by-name tail preserved byte-for-byte). `ThemeDefinition` type shift is strict widening for optional fields (`musicTheme`, `musicAIPrompt`, `musicAssets`, `tags.default([])`, `references.primaryStory.externalIndexUrls`) AND narrowing of `themeSchemaVersion` from `number` to `z.literal(2)` — RS-5 / Verification Step 7.1 grep-gate for `themeSchemaVersion` in `apps/registry-viewer/src/` confirms zero read-consumers outside the deleted interface (safe because viewer only reads the field). Error rendering locked to first-Zod-issue `path.join('.') + ' — ' + message` with `[RegistryConfig]` / `[Themes]` category tag; `.format()` dumps and multi-issue arrays forbidden. `.parse(...)` forbidden at fetch boundaries (`.safeParse(...)` only — `.parse`-throws are unpredictable; `.safeParse` returns a discriminated union). **Severity policy (D-8303):** throw for hard dependencies (viewer config + theme index); warn + skip for isolated batch entries (individual theme files). Auxiliary metadata schemas (`CardTypeEntrySchema`, `HeroClassEntrySchema`, `HeroTeamEntrySchema`, `IconEntrySchema`, `LeadsEntrySchema`) remain offline-only per D-8304 — future runtime fetcher requires its own WP. Viewer's local `src/registry/schema.ts` duplicate is a known architectural smell (out of scope per EC-108 §Out of Scope). `apps/registry-viewer/CLAUDE.md` updated to note fetch-boundary Zod validation on all four R2 fetchers (registry config, themes, keywords, rules — fourth was WP-082 / EC-107). `docs/03.1-DATA-SOURCES.md` update is optional (doc does not currently list viewer public config or themes as source rows). 5 new DECISIONS.md entries at Commit B: D-8301 (viewer fetches validate at boundary) / D-8302 (`ViewerConfigSchema` vs `RegistryConfigSchema` naming lock) / D-8303 (severity policy) / D-8304 (auxiliary schemas offline-only) / D-8305 (`./theme.schema` subpath export precedent, introduced by A-083-04). Test baseline UNCHANGED at **596 passing / 0 failing** (same baseline as WP-082/EC-107 close; optional `packages/registry/src/schema.test.ts` schema-parse tests authorized by executor judgment with one `describe()` per schema per copilot-check Finding #11 — if authored, adds +3 tests / +2 suites to baseline and must be re-declared in session prompt before Commit A). No new dependencies (`zod` already in both packages); `pnpm-lock.yaml` unchanged (additive `exports` entry only, workspace link already exists from A-082-01). 01.5 engine clause NOT INVOKED (no `LegendaryGameState` field, no `buildInitialGameState` change, no `LegendaryGame.moves` entry, no phase hook); viewer analog NOT INVOKED (retrofit is within already-allowlisted files; no new viewer wiring). 01.6 post-mortem NOT TRIGGERED (new schemas are instances of existing abstraction per WP-082 precedent; `./theme.schema` subpath is a new instance of the A-082-01 `./schema` abstraction; no new code category; zero engine touch). Three-commit topology: A0 `SPEC:` (governance bundle — WORK_INDEX row + EC_INDEX row + session-context + WP-083 A-083-01 through A-083-04 amendments + EC-108 + pre-flight v2 + copilot-check v2 + session prompt) → A `EC-108:` (code + package.json + viewer + docs) → B `SPEC:` (STATUS/WORK_INDEX flip + EC_INDEX flip + DECISIONS). No R2 JSON republish needed (validation-retrofit only; data unchanged). Staging discipline: exact-filename only per P6-27 / P6-44; session-context-wp083 §2 enumerates ~25 inherited dirty-tree items as out-of-scope (WP-084 drafts, WP-067 drafts, WP-048 drafts, `content/themes/heroes/black-widow.json`, `data/cards/bkpt.json`, root `package.json`, `.claude/worktrees/`, forensics artifacts, etc.); none may be staged in any of the three commits.

- [x] WP-084 — Delete Unused Auxiliary Metadata Schemas and Files ✅ Completed 2026-04-21 at commit `b250bf1` under EC-109 (A-084-01 amendment landed in A0 SPEC bundle 2026-04-21 expanding scope with viewer dead-code deletion, 00.2-data-requirements rewrite, current-state docs sweep, legacy `Validate-R2-old.ps1` deletion, and registry JSDoc cleanup; six pre-flight STOP gates re-run clean in execution session; verification steps 1–24 all pass; baseline preserved 596/0 failing; seven DECISIONS.md governance entries D-8401..D-8407 + D-6002 historical-neighbor note land at Commit B)
  Dependencies: None. Independent of WP-082 and WP-083 (may execute
  first, last, or sandwiched between them).
  Execution Checklist: `docs/ai/execution-checklists/EC-109-delete-unused-auxiliary-metadata.checklist.md` (Done)
  Commit prefix: `EC-109:` at execution (never `WP-084:` per P6-36)
  Notes: Delete-only subtractive packet. Removes five unused auxiliary
  metadata Zod schemas (`CardTypeEntrySchema`, `HeroClassEntrySchema`,
  `HeroTeamEntrySchema`, `IconEntrySchema`, `LeadsEntrySchema`), the
  five corresponding JSON files under `data/metadata/`
  (`card-types.json`, `hero-classes.json`, `hero-teams.json`,
  `icons-meta.json`, `leads.json`), the orphan
  `data/metadata/card-types-old.json`, and the Phase 2 metadata
  validation block in `packages/registry/scripts/validate.ts`
  (renumbers former Phases 3/4/5 → 2/3/4 sequentially). Zero runtime
  consumers per 2026-04-21 audit — not the server
  (`createRegistryFromLocalFiles`), the viewer
  (`createRegistryFromHttp` / `themeClient` / `glossaryClient`), the
  game engine, or the pre-plan package; sole consumer is `validate.ts`
  Phase 2, which is opt-in and not wired to `pnpm build` / `pnpm test`
  / CI. The four surviving metadata files (`keywords-full.json`,
  `rules-full.json`, `sets.json`) and all surviving schemas are LOCKED
  byte-for-byte. No engine, server, viewer-runtime, pre-plan, or R2
  mutations. Governance-driven: five DECISIONS.md entries planned to
  lock the deletion and forbid reintroduction without a runtime
  consumer (derived-from-per-set-data OR wired-in-same-WP pattern).
  Six pre-flight STOP gates defined in EC-109 (branch/baseline;
  usage-audit greps; contract/doc sanity including `00.2` active vs
  historical mention; `validate.ts` phase-number safety; git-file
  health; deletion-intent confirmation) must all pass before execution.
  A0 SPEC pre-flight bundle scaffolded 2026-04-21; executor-fillable
  placeholders in `docs/ai/session-context/session-context-wp084.md`
  and `docs/ai/invocations/preflight-wp084.md`. Schema removal ≠ data
  removal is deliberate — retaining inert JSON without a consumer is
  treated as technical debt, not documentation.

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

- [x] WP-049 — PAR Simulation Engine ✅ Reviewed ✅ Completed 2026-04-23 (Commit A `021555e`)
  Dependencies: WP-036, WP-048
  Notes: Implements T2 Competent Heuristic AI policy (5 behavioral heuristics
  modeling experienced human play) and PAR aggregation pipeline (55th percentile
  of simulated Raw Scores); `generateScenarioPar` orchestrates simulation ->
  scoring -> PAR for any scenario; AI policy tier taxonomy (T0-T4) documented
  with T2 as sole PAR authority; minimum 500 simulated games per scenario;
  deterministic, replayable, versioned; does NOT modify engine, WP-036, or
  WP-048 contracts; implements Phase 2 of PAR derivation pipeline per
  `docs/12-SCORING-REFERENCE.md`
  Governance: PAR simulations consume match setup as their sole configuration
  input (D-1244); must reject invalid setups rather than correcting them;
  no simulation may derive or mutate setup composition; seed-to-PRNG wiring
  limitations documented in D-1248 and must not be masked

- [x] WP-051 — PAR Publication & Server Gate Contract ✅ Reviewed — Done 2026-04-23 (Commit A `ce3bffb`)
  Dependencies: WP-050, WP-004
  Notes: Server-layer enforcement of the pre-release PAR gate; loads PAR
  index at startup (non-blocking — casual play continues without PAR);
  `checkParPublished` is index-only lookup (no filesystem probing);
  competitive submissions rejected when PAR is missing (fail closed);
  server is read-only for PAR data; does NOT implement leaderboard endpoint
  (future work); does NOT modify engine or WP-050 contracts; server files
  use `.mjs` extension per WP-004; closes the chain from simulation →
  artifact → enforcement. Executed 2026-04-23: two new files under
  `apps/server/src/par/` (`parGate.mjs`, `parGate.test.ts` with 13 tests);
  two surgical modifications (`server.mjs` Promise.all extension +
  `package.json` test glob expansion). Server baseline 6/2/0 → 19/3/0;
  repo-wide 658/126/0 → 671/127/0; engine 506/113/0 unchanged (A1
  amendment already in A0-engine commit `5e468a7`). Zero `node:fs`
  imports in `parGate.mjs`; all PAR file IO delegated to engine
  `loadParIndex` per D-5001 line 8937. D-5101 (dual-index in-memory
  load with sim-over-seed precedence) + D-5102 (`PAR_VERSION` env var
  with `?? 'v1'` fallback) + D-5103 (existence-based trust) landed
  in A0-governance `db83d9a`. 01.6 post-mortem at
  `docs/ai/post-mortems/01.6-WP-051-par-publication-server-gate.md`
  covers 8 mandatory checks including the pnpm-on-Windows + cmd.exe
  test-glob quoting refinement (quoted form from Locked Values was
  silently matching zero files; unquoted form matches proven
  pre-WP-051 precedent). Commits use `EC-051:` on code; `SPEC:` on
  pre-flight and governance close; `WP-051:` never used (P6-36).

- [x] WP-052 — Player Identity, Replay Ownership & Access Control ✅ Reviewed — Done 2026-04-25 (Commit A `fd769f1`)
  Dependencies: WP-051, WP-004, WP-027
  Notes: Introduces `AccountId` (branded string per D-5201; renamed
  from draft-time `PlayerId` to avoid collision with the engine
  `PlayerId` per D-8701; UUID v4 from `node:crypto.randomUUID()` with
  injectable test stub), `PlayerAccount` (7 readonly fields),
  `GuestIdentity` (3 readonly fields with `isGuest: true` discriminant),
  `PlayerIdentity` discriminated union, `Result<T>` + `IdentityErrorCode`
  structured error shape; `ReplayOwnershipRecord` (7 readonly fields,
  `expiresAt: string | null`) with `ReplayVisibility` (`private` |
  `link` | `public`) defaulting to `private`; `DEFAULT_RETENTION_POLICY`
  (`{minimumDays: 30, defaultDays: 90, extendedDays: null}`); guest
  players play and export replays without an account — core gameplay
  never gated; account players unlock server-side replay persistence,
  leaderboard submission, and shareable links; PostgreSQL tables
  `legendary.players` (UNIQUE email + ext_id; idempotent CREATE TABLE)
  and `legendary.replay_ownership` (UNIQUE (player_id, replay_hash) for
  race-safe idempotency via the locked `INSERT … ON CONFLICT DO UPDATE
  … RETURNING` pattern per PS-6); identity affects access and visibility
  only — never gameplay, RNG, scoring, or engine execution; all eight
  identity files live under `apps/server/src/identity/` per D-5202 —
  zero `boardgame.io` / `@legendary-arena/game-engine` imports
  (grep-verified); GDPR `deletePlayerData` runs in a single
  BEGIN/COMMIT transaction and returns audit counts only — no queue,
  no scheduler, no blob purge (PS-12 / D-5207-pending). Email
  canonicalized (trim + lowercase) on every insert AND every lookup
  per PS-9; `displayName` validated for length 1-64 and control-character
  rejection per PS-10. Server baseline `19/3/0` → `31/5/0` (with 6
  skipped when `TEST_DATABASE_URL` unset; locked `{ skip: 'requires
  test database' }` reason); engine baseline `513/115/0` unchanged.
  Three-commit topology: A0 SPEC `17604ca` (WP-052 v1.3 + EC-052
  rewrite + DECISIONS D-5201/5202/5203); A `EC-052:` `fd769f1`
  (8 files: 4 `.ts` source + 2 `.test.ts` + 2 `.sql` migrations);
  B SPEC governance close (this commit: STATUS.md + WORK_INDEX.md
  WP-052 `[ ]` → `[x]` + EC_INDEX.md EC-052 row + 01.6 post-mortem).
  01.5 NOT INVOKED (zero `LegendaryGameState` field, zero
  `buildInitialGameState` shape change, zero new moves, zero new phase
  hooks). 01.6 post-mortem MANDATORY per four triggers (new long-lived
  abstractions, new contract consumed by future WPs, new canonical
  readonly arrays `AUTH_PROVIDERS` + `REPLAY_VISIBILITY_VALUES`, new
  persistence surface) — delivered at
  `docs/ai/post-mortems/01.6-WP-052-player-identity-replay-ownership.md`
  covering all 12 mandatory checks. Vision trailer on Commit A:
  `Vision: §3, §11, §18, §19, §22, §24, NG-1, NG-3, Financial
  Sustainability`. Commits use `EC-052:` on code; `SPEC:` on
  pre-flight and governance close (`WP-052:` forbidden per P6-36).

- [x] WP-053a — PAR Artifact Carries Full ScenarioScoringConfig — Done 2026-04-25 at Commit A `e5b9d15` (`EC-053a:` prefix). Engine baseline `522/116/0`, server baseline `38/6/0` (with skips), all PS-5 locks honored. INFRA hook fix `fbbedb5` landed pre-Commit-A to accept lowercase letter suffix in EC-### prefix. Post-mortem at `docs/ai/post-mortems/01.6-WP-053a-par-artifact-scoring-config.md` (mandatory per 01.6 — three triggers).
  Dependencies: WP-048, WP-049, WP-050, WP-051
  Notes: Predecessor packet for WP-053 per D-5306 (Option A). Extends
  the PAR artifact format end-to-end (artifact shape + index +
  aggregator + validator + server gate) so that
  `ScenarioScoringConfig` flows from publication through to
  `checkParPublished` as a single authoritative source. Eliminates
  the config / PAR drift surface that Option B would have caught
  only at WP-053 flow step 12. Scope: ~10 files (3 new, 7 modified)
  spanning `data/scoring-configs/`, `packages/game-engine/src/scoring/`,
  `packages/game-engine/src/simulation/`, and `apps/server/src/par/`.
  Engine baseline shifts `513/115/0` → **`522/116/0`** (+9 tests / +1
  suite — pre-flight committed to the fresh top-level
  `describe('scoringConfigLoader (WP-053a)', …)` block outcome per
  the post-WP-031 wrap-in-describe convention; PS-5). Server baseline
  shifts `36/6/0` → `38/6/0` (+2 tests). New tests:
  `scoringConfigLoader.test.ts` (4 tests, new file); extensions to
  `par.storage.test.ts` (+3), `par.aggregator.test.ts` (+2),
  `parGate.test.ts` (+2) — total +11 across 4 files. Mechanical
  fixture updates to existing `parGate.test.ts` and `par.storage.test.ts`
  tests do not change pass/fail counts. Vision clauses touched: §3, §22, §24
  (NG-1..7 not crossed). 01.5 NOT INVOKED. 01.6 post-mortem
  MANDATORY (new long-lived abstraction `scoringConfigLoader`; new
  contract surface consumed by WP-053; new on-disk authoring source
  `data/scoring-configs/`). Deferred placeholders: D-5306c
  (collapse `SeedParArtifact.parBaseline` one cycle after WP-053a)
  + D-5306d (audit-redundancy review of `par_version` /
  `scoring_config_version` columns in a future analytics WP).
  See [WP-053a-par-artifact-scoring-config.md](WP-053a-par-artifact-scoring-config.md)
  + EC-053a (drafted by WP-053a pre-flight session; not yet authored).

- [x] WP-053 — Competitive Score Submission & Verification ✅ Reviewed ✅ Completed 2026-04-26 at Commit A `56e8134` (A0 SPEC v1.5 at `27d3004`; `EC-053:` prefix). Server baseline `38/6/0` → `47/7/0` (with 16 skipped if no test DB: 10 inherited + 6 new); engine `522/116/0` unchanged. Post-mortem at `docs/ai/post-mortems/01.6-WP-053-competitive-score-submission-verification.md`.
  Dependencies: WP-048, WP-051, WP-052, WP-027, WP-004, WP-103, WP-053a
  Notes: Keystone trust surface for competition — every competitive score is
  replay-verified; server re-executes replays via `replayGame`, recomputes
  scores via WP-048 engine contracts (`deriveScoringInputs`, `computeRawScore`,
  `computeFinalScore`, `buildScoreBreakdown`); `ScenarioScoringConfig`
  sourced from `checkParPublished(scenarioKey).scoringConfig` per D-5306
  (Option A landed via WP-053a); flow step 12
  (`computeParScore(config) === parValue`) becomes defense-in-depth
  rather than a primary safety net — drift is structurally impossible
  under Option A; client-reported values never
  trusted; PAR publication enforced via `checkParPublished`; `CompetitiveScoreRecord`
  is immutable once created; idempotent via `UNIQUE (player_id, replay_hash)`;
  retains both `par_version` and `scoring_config_version` columns as
  audit redundancy per D-5306d (no CHECK constraint enforcing
  equality — preserves forensic visibility if the invariant ever
  broke); guest identities cannot submit competitively; private
  replays not eligible until visibility changed; server is enforcer,
  not calculator — delegates scoring to engine; PostgreSQL table
  `legendary.competitive_scores`; does NOT modify WP-048, WP-051,
  WP-052, WP-027, WP-103, or WP-053a contracts

- [ ] WP-054 — Public Leaderboards & Read-Only Web Access ✅ Reviewed
  Dependencies: WP-053, WP-052, WP-051, WP-004
  Notes: Read-only public access to verified competitive results;
  scenario-scoped leaderboards sorted by `finalScore` ascending,
  `createdAt` ascending tie-break; only scores with `visibility IN
  ('link', 'public')` included — private replays never exposed; PAR-missing
  scenarios return empty results (fail closed); no authentication required
  for public queries; `PublicLeaderboardEntry` strips sensitive fields
  (`playerId`, `email`, `replayHash`, `stateHash`, `scoreBreakdown`);
  no new database tables — query projections of existing tables; no SQL
  write operations; no engine imports; no scoring logic; does NOT modify
  WP-053 or WP-052 contracts

- [x] WP-050 — PAR Artifact Storage & Indexing ✅ Reviewed ✅ Completed 2026-04-23 (Commit A `ccdf44e`)
  Dependencies: WP-049, WP-048
  Notes: Defines how PAR simulation results are stored, indexed, versioned,
  and accessed as immutable file-based artifacts; content-addressed by
  ScenarioKey with sharded directory layout; deterministic sorted-key JSON
  serialization for bit-for-bit reproducibility; `index.json` manifest for
  fast existence checks (server pre-release gate); PAR version directories
  (`v1/`, `v2/`) immutable once published; calibration updates create new
  versions, never in-place edits; scales to 10k-100k scenarios; works on
  local filesystem, R2/S3, or CDN; does NOT modify engine, WP-049, or WP-048

- [x] WP-036 — AI Playtesting & Balance Simulation ✅ Reviewed (2026-04-21 pre-flight READY TO EXECUTE with copilot-check 30/30 PASS after FIX cycle resolving RS-13 + RS-14 + RS-15; SPEC pre-flight commit `4e340fd` landed D-3601 + 02-CODE-CATEGORIES.md update + WP-036 §Amendments A-036-01 + EC-036 amendment note + session prompt + session-context bridge before execution) — Completed 2026-04-21 at commit `04c53c0` under EC-036 (see [session-wp036-ai-playtesting-balance-simulation.md](../invocations/session-wp036-ai-playtesting-balance-simulation.md))
  Dependencies: WP-035 (complete at `d5935b5`)
  Notes: `AIPolicy` pluggable interface receives filtered UIState + legal moves,
  returns `ClientTurnIntent`; `createRandomPolicy` MVP baseline (mulberry32 PRNG
  keyed via djb2); `runSimulation` executes N games with aggregate stats (win
  rate, turns, scores, escaped villains average, wounds average); AI uses same
  pipeline as humans — no special engine access (D-0701 + D-3602); AI cannot
  inspect hidden state (receives filterUIStateForAudience player view);
  decisions deterministic and reproducible (D-3604 two-domain PRNG — run-level
  shuffle + policy-level decision PRNG never share state); balance changes
  require simulation (D-0702). Four new files under
  `packages/game-engine/src/simulation/` (D-3601 engine code category — ninth
  precedent in the D-2706 / D-2801 / D-3001 / D-3101 / D-3201 / D-3301 /
  D-3401 / D-3501 chain): `ai.types.ts` (pure type contracts), `ai.random.ts`
  (createRandomPolicy + file-local mulberry32 + djb2; neither exported),
  `ai.legalMoves.ts` (getLegalMoves + 8-entry SIMULATION_MOVE_NAMES tuple +
  RS-13 enumeration order lock), `simulation.runner.ts` (runSimulation +
  static 8-entry MOVE_MAP per D-2705 + local SimulationMoveContext structural
  interface per D-2801 + 200-turn safety cap RS-7 + Fisher-Yates shuffle
  driven by mulberry32 RS-1 + post-endgame stats sourced from
  UIState.progress.escapedVillains + sum of UIPlayerState.woundCount per
  RS-12). `simulation.test.ts` ships exactly 8 tests in one
  `describe('simulation framework (WP-036)')` block using `node:test` +
  `node:assert` only; test #7 uses canonical RS-14 assertion pattern
  `assert.equal(player1.handCards, undefined, ...)`. Two modified files:
  `types.ts` (re-export four simulation types) + `index.ts` (public API for
  four types + three functions + one helper type). Engine baseline shift
  `436 / 109 / 0 → 444 / 110 / 0 fail` (+8 tests / +1 suite); repo-wide
  `588 / 0 → 596 / 0`. Zero engine gameplay files modified (targeted
  `git diff --name-only` against `moves/`, `rules/`, `setup/`, `turn/`,
  `ui/`, `scoring/`, `endgame/`, `villainDeck/`, `network/`, `replay/`,
  `game.ts`). `package.json` / `pnpm-lock.yaml` untouched (P6-44). All 13
  verification greps pass: zero `boardgame.io` / `@legendary-arena/registry`
  / `Math.random(` / `.reduce(` / `require(` hits in simulation files. DECISIONS.md
  adds four entries: D-3601 (Simulation Code Category; landed in A0), D-3602
  (AI Uses the Same Pipeline as Humans; landed in A), D-3603 (Random Policy
  Is the MVP Balance Baseline; landed in A), D-3604 (Simulation Seed
  Reproducibility: Two Independent PRNG Domains — run-level shuffle domain
  + policy-level decision domain never share state; djb2 + mulberry32
  duplicated across ai.random.ts + simulation.runner.ts per WP-036
  Scope Lock's 4-file cap; landed in A). Amendments: A-036-01 landed in A0
  (PS-2: CardRegistry → CardRegistryReader signature correction per
  WP-025/026 D-2504 precedent); A-036-02 lands in B (session-prompt
  pseudocode used flat ClientTurnIntent field names but the authoritative
  shape in `network/intent.types.ts:35` is nested — implementation
  follows the session prompt's binding "Copy WP-032's shape verbatim"
  instruction; scope-neutral reconciliation). 01.5 NOT INVOKED (four
  criteria all absent — no LegendaryGameState field added, no
  buildInitialGameState shape change, no new LegendaryGame.moves entry,
  no new phase hook). 01.6 post-mortem MANDATORY (four triggers fire: new
  long-lived abstraction `AIPolicy` + new code-category directory D-3601 +
  new contract consumed by future WPs + D-2704 capability-gap pattern
  documented) — verdict WP COMPLETE. Commits use `EC-036:` prefix on
  code-changing commits (never `WP-036:` per P6-36 — commit-msg hook
  rejects); `SPEC:` on governance / pre-flight / governance-close
  commits. Three-commit topology: A0 `4e340fd` (SPEC pre-flight bundle) →
  A `04c53c0` (EC-036 execution: 5 new files + 3 modified + D-3602/3/4) →
  B (this commit, SPEC governance close: STATUS + WORK_INDEX + EC_INDEX +
  A-036-02 + 01.6 post-mortem). Staging by exact filename only — never
  `git add .` / `git add -A` / `git add -u` (P6-27 / P6-44). Inherited
  dirty-tree items (untracked files + `.claude/worktrees/` + one modified
  `session-wp079-*.md`) untouched and never staged; quarantine stashes
  `stash@{0..2}` intact and never popped. See
  `EC-036-ai-playtesting.checklist.md` +
  `docs/ai/invocations/preflight-wp036-ai-playtesting-balance-simulation.md`
  + `docs/ai/session-context/session-context-wp036.md` +
  `docs/ai/post-mortems/01.6-WP-036-ai-playtesting-balance-simulation.md`.

- [x] WP-037 — Public Beta Strategy ✅ Reviewed (2026-04-22, EC-037 at 160d9b9)
  Dependencies: WP-036
  Notes: Strategy docs + type definitions only — no engine modifications;
  invitation-only, hard user cap, unique build ID; three cohorts (expert
  tabletop, general strategy, passive observers); `BetaFeedback` type tied
  to build version with optional replay reference; binary exit criteria per
  category (rules, UX, balance, stability); no "beta mode" in engine — beta
  runs same deterministic engine as production; uses same release gates as
  prod (WP-035); was truncated at 114 lines — normalized to full
  PACKET-TEMPLATE. Executed as Contract-Only + Documentation bundle:
  `packages/game-engine/src/beta/beta.types.ts` (new, D-3701), additive
  re-export blocks in `types.ts` / `index.ts`, `docs/beta/BETA_STRATEGY.md`
  + `docs/beta/BETA_EXIT_CRITERIA.md`, and the mandatory 01.6 post-mortem.
  Test baseline unchanged (444/110/0 engine; 596/0 repo-wide — RS-2
  zero-new-tests lock honored). Session prompt:
  `docs/ai/invocations/session-wp037-public-beta-strategy.md`. Pre-flight:
  Commit A0 SPEC bundle at `a4f5574` (D-3701 + 02-CODE-CATEGORIES.md).
  Post-mortem: `docs/ai/post-mortems/01.6-WP-037-public-beta-strategy.md`.

- [x] WP-038 — Launch Readiness & Go-Live Checklist ✅ Completed 2026-04-22 at commit `2134f33` under EC-038
  Dependencies: WP-037 (complete at `160d9b9`)
  Notes: Documentation only — no engine modifications; 4 readiness gate
  categories (engine/determinism, content/balance, beta exit, ops/deployment);
  all gates binary pass/fail — single failure = NO-GO; single launch authority
  (one owner, not consensus, three non-override clauses); launch day: build
  verification, soft launch window with PAUSE-vs-ROLLBACK distinction,
  go-live signal; 72h post-launch change freeze with Freeze Exception
  Record's 5 required fields; rollback triggers verbatim: invariant
  violation spike, replay hash divergence, migration failure, client desync.
  Three-commit topology: A0 SPEC pre-flight bundle (`9ecbe70`) →
  A EC-038 content + 01.6 post-mortem (`2134f33`) → B SPEC governance close
  (this session). Test baseline UNCHANGED at engine 444/110/0 + repo-wide
  596/0 (zero new tests). Three new DECISIONS.md entries land at Commit B:
  D-3801 (single launch authority — accountability, not consensus),
  D-3802 (72h freeze — stability observation window with bugfix criteria
  deterministic + backward compatible + roll-forward safe), D-3803 (launch
  gates inherit from beta exit gates via D-3704 — single-source-of-truth
  consumption of `BETA_EXIT_CRITERIA.md`). 01.5 NOT INVOKED. 01.6 MANDATORY
  (two new long-lived abstraction documents `LAUNCH_READINESS.md` and
  `LAUNCH_DAY.md` under `docs/ops/`). Post-mortem:
  `docs/ai/post-mortems/01.6-WP-038-launch-readiness-go-live.md`.
  Commit prefix: `EC-038:` at execution; `SPEC:` for the bundle and the
  governance close (never `WP-038:` per P6-36 — commit-msg hook rejects).

- [x] WP-039 — Post-Launch Metrics & Live Ops ✅ Completed 2026-04-23 at commit `4b1cf5c` under EC-039
  Dependencies: WP-038 (complete at `2134f33`)
  Notes: Documentation only — one new strategy document under `docs/ops/`
  (`LIVE_OPS_FRAMEWORK.md`); zero TypeScript, zero new types, zero
  re-exports, zero new tests. Path A (reuse `IncidentSeverity` and
  `OpsCounters` from `ops.types.ts`; cross-link severity semantics to
  `INCIDENT_RESPONSE.md` rather than restating) resolved all three v1
  pre-flight blockers by construction: (1) `MetricPriority` would have
  duplicated landed `IncidentSeverity`; (2) "same-version replay hash =
  P0" contradicted `INCIDENT_RESPONSE.md:33` (replay desync = P1);
  (3) `MetricEntry` would have created a parallel container for the
  four counters already modeled by `OpsCounters`. Framework doc has 11
  top-level sections (§1 Purpose — §11 Summary) with 8 foundational
  constraints, 6 data collection rules, 6 success criteria, and 9
  explicit non-goals. §5 metric labels (System Health / Gameplay
  Stability / Balance Signals / UX Friction) are organizational prose
  only — not a typed union. Live-ops cadence locked: daily
  `OpsCounters` review, weekly baseline comparison vs WP-036/WP-037,
  monthly balance evaluation; out-of-cadence review permitted only for
  P0/P1. Change management locked: validated content OK (WP-033);
  AI-simulation-validated balance tweaks OK (D-0702); UI updates that
  preserve gameplay semantics OK (D-1002); rule changes without version
  increment, unversioned hot-patches, silent behavior changes,
  changes-justified-solely-by-live-metrics, auto-heal, parallel
  severity taxonomy, and parallel counter container all forbidden.
  Three-commit topology: A0 SPEC pre-flight bundle (`9e7d9bd`) →
  A EC-039 content + 01.6 post-mortem (`4b1cf5c`) → B SPEC governance
  close (this session). Test baseline UNCHANGED at engine 444/110/0 +
  repo-wide 596/0 (zero new tests). One new DECISIONS.md entry lands at
  Commit B documenting the Path A decision — live ops reuses
  `IncidentSeverity` and `OpsCounters` rather than defining parallel
  types, with the v1 drift as precedent. 01.5 NOT INVOKED (all four
  trigger criteria absent). 01.6 MANDATORY (one new long-lived
  abstraction document `LIVE_OPS_FRAMEWORK.md` under `docs/ops/`).
  Post-mortem: `docs/ai/post-mortems/01.6-WP-039-post-launch-metrics-live-ops.md`.
  Commit prefix: `EC-039:` at execution; `SPEC:` for the bundle and the
  governance close (never `WP-039:` per P6-36 — commit-msg hook rejects).

- [x] WP-040 — Growth Governance & Change Budget ✅ Completed 2026-04-23 at commit `6faaf3b` under EC-040
  Dependencies: WP-039
  Notes: Documentation + type definitions only; five change categories
  (ENGINE | RULES | CONTENT | UI | OPS) — classification mandatory before
  shipping; immutable surfaces (replay, RNG, scoring, invariants, endgame)
  require major version to change (D-1002); per-release change budgets
  declared before development; primary growth vectors: CONTENT + UI (D-1003);
  ENGINE changes restricted, require architecture review; implements D-1001,
  D-1002, D-1003; Path A reuses `EngineVersion` / `DataVersion` /
  `ContentVersion` (D-0801) and `IncidentSeverity` / `OpsCounters` (D-3501)
  via cross-link rather than parallel types; four-commit topology: A0a SPEC
  precedent-land (`a6be850`) → A0 SPEC pre-flight bundle + D-4001
  (`5e1a0fa`) → A `EC-040:` content + 01.6 post-mortem (`6faaf3b`) → B SPEC
  governance close. D-4002 / D-4003 / D-4004 back-pointer DECISIONS.md
  entries landed at Commit B per P6-51 form (2). Test baseline UNCHANGED
  at engine 444/110/0 + repo-wide 596/0 (zero new tests).
  Post-mortem: `docs/ai/post-mortems/01.6-WP-040-growth-governance-change-budget.md`.
  Commit prefix: `EC-040:` at execution; `SPEC:` for the bundle and the
  governance close (never `WP-040:` per P6-36 — commit-msg hook rejects).

- [x] WP-041 — System Architecture Definition & Authority Model ✅ Completed 2026-04-23 at commit `0e8e8b1` under EC-041
  Dependencies: WP-040
  Notes: Formal architecture certification pass — NOT new design; verified
  ARCHITECTURE.md Field Classification table has all 20 G-class Runtime
  fields from WP-005B through WP-026 (selection / playerZones / piles /
  villainDeck / villainDeckCardTypes / hookRegistry / currentStage / lobby
  / messages / counters / city / hq / ko / attachedBystanders / turnEconomy
  / cardStats / mastermind / heroAbilityHooks / cardKeywords /
  schemeSetupInstructions); added `Architecture Version: 1.0.0 / Last
  Reviewed: 2026-04-23 / Verified Against: WP-001 through WP-040` stamp at
  top of file; updated Document override hierarchy block to authoritative
  7-entry chain locking 01-VISION.md between ARCHITECTURE.md and
  .claude/rules (CLAUDE.md → ARCHITECTURE.md → 01-VISION.md →
  .claude/rules/*.md → WORK_INDEX.md → WPs → conversation); inserted single
  clarifying sentence above Field Classification Reference table body
  disambiguating Class column ("Snapshot (as copy)" / "Snapshot → count
  only" annotations describe snapshot handling, not class reassignment);
  refreshed stale `*Last updated: WP-014 review*` footer to reference
  WP-041 certification; logged drift between ARCHITECTURE.md and
  `.claude/rules/architecture.md` as D-4102 (Rules-Architecture Drift Log)
  without modifying rules files per WP-041 §Out of Scope; no engine
  modifications; no apps modifications; no rules-file modifications; no
  new layers, boundaries, or invariants introduced. Pre-flight (PS-1
  EC count → 20, PS-2 Assumes range → D-4004) and copilot check (PS-4
  ordering lock at introduction-order with `selection` at #1) caught
  governance drift before execution. DECISIONS.md adds two entries: D-4101
  (Resolved Transcription Inconsistency for footer refresh) and D-4102
  (Rules-Architecture Drift Log consolidating three drift items). Test
  baseline UNCHANGED at engine 444/110/0 + repo-wide 596/0 (zero new
  tests; documentation-only). Three-commit topology: A0 SPEC pre-flight
  bundle (`6cc2541`) → A `EC-041:` content + 01.6 post-mortem (`0e8e8b1`)
  → B SPEC governance close (this commit: STATUS + WORK_INDEX WP-041
  `[ ]` → `[x]` + EC_INDEX EC-041 Draft → Done; D-4101 / D-4102 already
  landed at Commit A per session-prompt §Commit topology). Staging by
  exact filename only — never `git add .` / `git add -A` / `git add -u`
  (P6-27 / P6-44). Inherited `.claude/worktrees/` untouched and never
  staged. Commits use `EC-041:` prefix on content commit; `SPEC:` on
  pre-flight bundle and governance close (never `WP-041:` per P6-36 —
  commit-msg hook rejects).
  Post-mortem: `docs/ai/post-mortems/01.6-WP-041-architecture-audit.md`.
  Commit prefix: `EC-041:` at execution; `SPEC:` for the bundle and the
  governance close (never `WP-041:` per P6-36 — commit-msg hook rejects).

- [x] WP-085 — Vision Alignment Audit (Detection, Classification & Gating) ✅ Reviewed — Executed 2026-04-22 at commit `c836b29`
  Dependencies: None (builds on the audit scaffold landed at INFRA `24996a9`
  and the §17 gate landed at SPEC `0689406`; independent of all Phase 7
  gameplay WPs)
  Notes: Governance + audit-tooling WP — no engine modifications, no
  gameplay logic, no runtime behavior. Codifies the §17 Vision Alignment
  gate's enforcement instrument as an executable PASS/FAIL orchestrator
  (`scripts/audit/vision/run-all.mjs`) over the four domain greps
  (determinism, monetization, registry, engine-boundary). Two-channel
  DET-001 model — script-channel executable detection (comment-aware
  filter in `determinism.greps.mjs`) + orchestrator-channel baseline-
  exception verification against an exact six-file allowlist (see AC-2 /
  AC-3). DET-007 remains single-channel by design (see AC-4). Calibrated
  baseline (6 DET-001 / 4 DET-007 / 0 / 0 / 0) captured at INFRA
  `24996a9` is consumed as a locked contract per Scope (In) §D —
  constants `EXPECTED_DET_001`, `EXPECTED_DET_007`, `EXPECTED_MONETIZATION`,
  `EXPECTED_REGISTRY`, `EXPECTED_ENGINE_BOUNDARY`. Three-file Commit-A
  budget (`run-all.mjs` + comment-aware filter + first audit report
  under `docs/audits/`) plus three-file Commit-B governance close
  (STATUS.md + WORK_INDEX.md checkbox + DECISIONS.md entries for the
  two-channel model and operational §17 enforcement). Same-day re-run
  refusal (audit-history immutability). Vision trailer
  `§3, §13, §14, §22, §24`; self-compliant `## Vision Alignment` block
  present. Queued-instrument governance decision landed as D-8501
  pre-execution. See
  [WP-085-vision-alignment-audit.md](WP-085-vision-alignment-audit.md).

- [x] WP-087 — Engine Type Hardening: `PlayerId` Alias + Setup-Only Array `readonly` ✅ Done 2026-04-23 (Commit A `73aeada`; scope-narrowed — `readonly` deferred per D-8702)
  Dependencies: WP-049 (PAR Simulation Engine — merged to main as `956306c`)
  Notes: Engine-only type-contract tightening. Zero runtime behavior change.
  Adds `export type PlayerId = string;` to `packages/game-engine/src/types.ts`
  as a non-branded alias for boardgame.io's `"0" | "1" | …` player index
  strings. Applies `readonly` to three provably setup-only
  `LegendaryGameState` array fields (`hookRegistry`,
  `schemeSetupInstructions`, `heroAbilityHooks`). Swaps `Record<string, …>`
  → `Record<PlayerId, …>` in exactly three canonical sites
  (`LegendaryGameState.playerZones` in `types.ts`, `GameStateShape.playerZones`
  in `state/zones.types.ts`, `MatchSnapshot.playerNames` in
  `persistence/persistence.types.ts`). Moves the sole non-setup
  `hookRegistry` assignment (`rules/ruleRuntime.ordering.test.ts:56`) into
  factory-time construction to satisfy the strengthened immutability
  contract. Out of scope: branded `PlayerId`, any other `readonly`
  propagation, `MatchSetupConfig` types (pre-engine, pre-player-instantiation;
  `heroDeckIds` is communal pool, not per-seat), `types.ts` file split,
  move/phase/endgame/setup/effect logic, serialization / replay /
  snapshot shape. `pnpm -r build` + `pnpm test` identical counts to
  pre-change baseline. DECISIONS.md entry will record: non-branded
  rationale, three-array-only scope, `MatchSetupConfig` non-applicability,
  `heroDeckIds` communal-pool semantic. Lint trailer: §3, §11;
  self-compliant `## Vision Alignment` block. See
  [WP-087-engine-type-hardening.md](WP-087-engine-type-hardening.md) +
  [EC-087](../execution-checklists/EC-087-engine-type-hardening.checklist.md).

- [x] WP-088 — Setup Module Hardening: `buildCardKeywords` Runtime Guards, Villain Pre-Index, Output Ordering ✅ Completed 2026-04-23 (Commit A `d183991`; A0 SPEC bundle `88580a9`; adjusted test baseline `507 / 114 / 0` engine, `672 / 128 / 0` repo-wide — rebased from invocation's pre-drift `506 / 113 / 0` + `671 / 127 / 0` per post-WP-087 A1 amendment `d5880d2`)
  Dependencies: WP-025 (originating packet — `buildCardKeywords` + `BoardKeyword` / `BOARD_KEYWORDS`), WP-050 (merged to `main` 2026-04-23 at `ccdf44e` — clears §Assumes gate), WP-087 (`readonly` deferral per D-8702 — bounds WP-088's type surface)
  Notes: Single-file internal-hardening pass on
  `packages/game-engine/src/setup/buildCardKeywords.ts` — seven numbered
  in-file edits, zero caller touches, zero new tests, byte-identical
  output for well-formed registry data. Adds private `isKeywordSetData`
  type guard + per-iteration `typeof` / `Array.isArray` guards with
  `continue` on mismatch (no `try/catch`; fail-closed). Replaces the
  `findFlatCardForVillainCard` O(V·F) rescan with a local
  `Set<string>` pre-index built once before the `listSets()` loop
  (O(V+F)); `Set` is strictly function-local per **D-8802** — never
  placed in `G`, returned, or exported (JSON-serializability invariant).
  Replaces the push-and-break ordering with local boolean flags +
  canonical emission order `['patrol', 'ambush', 'guard']` —
  byte-identical to `BOARD_KEYWORDS` per **D-8801** so the engine
  carries one canonical order, not two; each `result[extId]` is a
  freshly-constructed `BoardKeyword[]` per D-8802 (WP-028 `cardKeywords`
  aliasing precedent). Deletes `KeywordSetData.abbr` and
  `KeywordSetData.henchmen` (unused); preserves the four other
  structural interfaces verbatim. Tightens `buildCardKeywords` JSDoc's
  return-contract sentence to stop asserting caller behavior.
  Whitespace-tolerance deferral (no `trimStart()`) locked by
  **D-8803** with explicit reversal conditions. No `boardgame.io` or
  `@legendary-arena/registry` imports; no `.reduce(`; no `try/catch`.
  Function signature byte-identical pre/post; caller at
  `buildInitialGameState.ts:173` untouched. Test baseline locked:
  engine `506 / 113 / 0` + repo-wide `671 / 127 / 0` at `ce3bffb`;
  no test count change permitted. Self-compliant `## Vision Alignment`
  block cites `§1, §2` with explicit "No conflict" /
  byte-identical-for-well-formed-data assertion. See
  [WP-088-build-card-keywords-hardening.md](WP-088-build-card-keywords-hardening.md) +
  [EC-088](../execution-checklists/EC-088-build-card-keywords-hardening.checklist.md) +
  D-8801 / D-8802 / D-8803.

- [x] WP-089 — Engine PlayerView Wiring ✅ Done 2026-04-24 (drafted 2026-04-23; lint-gate PASS; executed EC-089 bundled commit)
  Dependencies: WP-028 (UIState + buildUIState), WP-029 (filterUIStateForAudience)
  Notes: Engine-only. Wires `LegendaryGame.playerView = buildPlayerView` so
  every state frame boardgame.io pushes to a connected client is an
  audience-filtered `UIState` instead of raw `LegendaryGameState`. New
  top-level `buildPlayerView(G, ctx, playerID)` in `game.ts` is pure,
  never-throwing, and composes `buildUIState` + `filterUIStateForAudience`;
  `null` / `undefined` `playerID` map to `{ kind: 'spectator' }`. No change
  to `buildUIState`, `filterUIStateForAudience`, or any other engine
  subsystem. Prerequisite for WP-090 (arena-client cannot receive
  `UIState`-shaped state frames without this). Lint trailer: §3, §4;
  self-compliant `## Vision Alignment` block. See
  [WP-089-engine-playerview-wiring.md](WP-089-engine-playerview-wiring.md).

- [x] WP-090 — Live Match Client Wiring ✅ Done 2026-04-24 (drafted 2026-04-23; lint-gate PASS; pre-flight bundle registered 2026-04-24; executed at `54b266a`)
  Dependencies: WP-011 (lobby HTTP endpoints), WP-032 (ClientTurnIntent +
  `validateIntent`), WP-061 (arena-client skeleton + `useUiStateStore`),
  WP-089 (engine `playerView` wiring — clients receive `UIState`, not
  raw G)
  Notes: First browser gameplay client to connect to the boardgame.io
  game server. `apps/arena-client/` gains a lobby view listing open
  matches with "Create match" / "Join match" affordances hitting the
  boardgame.io lobby HTTP API, a `boardgame.io/client` `Client({ game:
  LegendaryGame, multiplayer: SocketIO(...) })` wiring that subscribes
  to state frames via `client.subscribe()` and writes `state.G` (already
  `UIState` per WP-089's `playerView`) into `useUiStateStore()` via
  `setSnapshot`, and query-string routing (`?match=&player=&credentials=`)
  between a lobby view, a live-match branch (renders `<ArenaHud />`
  unchanged under live state), and the existing fixture path
  (`?fixture=<name>` preserved as a zero-network regression guard per
  WP-061). Player actions submit via `client.moves[name](args)` — never
  raw WebSocket messages, never client-side `UIState` derivation. No
  auth / identity / reconnect UI / spectator toggle / lobby chat /
  rematch / replay playback — pure wiring. Single runtime engine-import
  site (`src/client/bgioClient.ts`); every other file stays
  `import type` only. Credentials live in URL for MVP (WP-052 defers
  durable identity). Session protocol resolves the pre-existing CLI
  `credentials` vs `playerCredentials` field drift by verifying against
  the running server before the client `joinMatch` helper is written;
  buggy CLI fix deferred to a follow-up WP placeholder in WORK_INDEX.
  Nine `MatchSetupConfig` fields render verbatim in the create-match
  form. Vision clauses touched: §3, §4; self-compliant `## Vision
  Alignment` block. See
  [WP-090-live-match-client-wiring.md](WP-090-live-match-client-wiring.md).

- [x] WP-091 — Loadout Builder in Registry Viewer ✅ Done 2026-04-24 (drafted 2026-04-24; 00.3 lint-gate PASS; pre-flight bundle registered 2026-04-24; executed 2026-04-24 with D-9101 landed and 18 new setupContract tests bringing packages/registry baseline to 31/3/0)
  Dependencies: WP-003 (CardRegistry), WP-005A (`MatchSetupConfig` 9-field
  contract), WP-055 (theme data model — `setupIntent`), WP-065
  (vue-sfc-loader — test-tooling context only, not runtime), WP-093
  (Match-Setup Rule-Mode Envelope Field — prerequisite even though its
  number is higher). Compatible with (not dependent on) WP-086 and
  WP-090. Prerequisite for WP-092.
  Notes: Two-half packet — registry contract + registry-viewer UI.
  Contract half creates `packages/registry/src/setupContract/` (zod
  schema + types + pure `validateMatchSetupDocument()` mirroring
  `MATCH-SETUP-JSON-SCHEMA.json` byte-for-byte; registry-side ext_id
  lookups via the existing `CardRegistryReader` surface; drift-
  detection test asserts the 9 composition field names match
  `00.2 §8.1` and the engine's `MatchSetupConfig`). UI half adds a
  third "Loadout" tab to `apps/registry-viewer` alongside Cards and
  Themes (no router per existing convention); two-column builder with
  card-browse picker panels; download a schema-valid MATCH-SETUP JSON
  (emits `heroSelectionMode: "GROUP_STANDARD"` explicitly per WP-093
  for auditability — never relies on the absent-default); upload/
  paste JSON to rehydrate a draft; "Start from theme" pre-fills five
  `setupIntent` fields from cached theme data. Validator upgrades
  zod's enum rejection into the WP-093 verbatim error-message
  template; absent `heroSelectionMode` normalizes to
  `"GROUP_STANDARD"` on validator output so downstream code never
  handles `undefined`. Seed uses `crypto.randomUUID()` (Web Crypto).
  No new npm dependencies (zod already present in both touched
  packages); no `@legendary-arena/game-engine` imports in
  `apps/registry-viewer/**` or `packages/registry/**`; no
  persistence / auth / user-profile / saved-loadout library — JSON
  download/upload is the MVP bridge, forward-compatible with a future
  profile system. Vision clauses touched: §3, §10a, §22, NG-1..7 (all
  preserved); self-compliant `## Vision Alignment` block. See
  [WP-091-loadout-builder-registry-viewer.md](WP-091-loadout-builder-registry-viewer.md).

- [x] WP-092 — Lobby Loadout Intake (JSON → Create Match) ✅ Done 2026-04-24 (drafted 2026-04-24; 00.3 lint-gate PASS; pre-flight bundle registered 2026-04-24; executed 2026-04-24 with D-9201 landed; arena-client baseline 77 / 3 / 0 → 109 / 5 / 0 (+32 tests / +2 suites); WP-090 manual form preserved byte-for-byte under "Fill in manually (advanced)" `<details>` collapse)
  Dependencies: WP-011 (lobby HTTP endpoints — `POST
  /games/legendary-arena/create`), WP-090 (arena-client lobby view
  + 9-field create-match form), WP-091 (registry-viewer loadout
  builder producing MATCH-SETUP JSON documents), WP-093 (Match-Setup
  Rule-Mode Envelope Field — transitive prerequisite via WP-091)
  Notes: Arena-client-only packet — no server, no engine, no
  registry changes. Adds `parseLoadoutJson()` pure shape-guard
  parser (never throws, accumulates typed errors) plus a "Create
  match from loadout JSON (recommended)" affordance above WP-090's
  manual form (which stays but collapses into a "Fill in manually
  (advanced)" `<details>` block; all WP-090 form field IDs,
  bindings, and submission logic preserved byte-for-byte). Parser
  hand-rolls type predicates rather than importing
  `@legendary-arena/registry` at runtime (layer rule — arena-client
  may not import registry at runtime per the Layer Boundary table).
  Shape guard rejects unrecognized `heroSelectionMode` with WP-093's
  verbatim error-message template byte-for-byte (including
  non-string values); absent `heroSelectionMode` normalizes to
  `"GROUP_STANDARD"` per WP-093 backward-compat semantics so
  `ParsedLoadout.heroSelectionMode` is always set. Composition block
  forwarded verbatim as `setupData` to the existing create endpoint;
  envelope `playerCount` maps to `numPlayers` at the call site with
  a `// why:` comment. Other envelope fields (`setupId`, `seed`,
  `createdAt`, `createdBy`, `themeId`, `expansions`) dropped on
  submission — envelope archival deferred to a future WP alongside
  user profiles. Server-side Stage 1 envelope validation is not
  implemented (remains a future server-layer WP per
  `MATCH-SETUP-VALIDATION.md`). No new npm dependencies;
  authoritative validation remains server-side via
  `matchSetup.validate.ts`. Vision clauses touched: §3, §4, NG-1..7
  (all preserved); self-compliant `## Vision Alignment` block. See
  [WP-092-lobby-loadout-intake.md](WP-092-lobby-loadout-intake.md).

- [x] WP-093 — Match-Setup Rule-Mode Envelope Field (Governance) ✅ Done 2026-04-24 (drafted 2026-04-24; 00.3 lint-gate PASS; planning alias "WP-090.5"; pre-flight bundle registered 2026-04-24; executed 2026-04-24 with D-9301 landed and consumer byte-for-byte strings canonicalized for WP-091 / WP-092)
  Dependencies: None (governance-only prerequisite). Consumed by
  WP-091 (registry-viewer loadout builder) and WP-092 (lobby loadout
  intake) — dependency ordering, not numeric ordering.
  Notes: Governance-only packet — **zero code changes**. Adds
  optional `heroSelectionMode` to the MATCH-SETUP envelope with v1
  enum `["GROUP_STANDARD"]`; defaults to `"GROUP_STANDARD"` when
  absent; reserves `"HERO_DRAFT"` in prose for a future WP (not in
  the allowed enum in v1). Preserves the 9-field composition lock
  verbatim — composition is untouched; the clarification added to
  `.claude/rules/code-style.md` is additive (scope-narrows the lock
  to composition), not a rescission. No `schemaVersion` bump
  (additive + backward compatible per `MATCH-SETUP-SCHEMA.md
  §Extensibility Rules`). Canonicalizes the error code
  `"unsupported_hero_selection_mode"` and full-sentence error-message
  template consumed verbatim by WP-091's validator and WP-092's
  shape guard. New D-9300-range DECISIONS entry documents the
  rationale, schemaVersion non-bump analysis, consumer list, and
  SCREAMING_SNAKE_CASE convention for rule-mode tokens (contrast
  with the `^[a-z0-9-]+$` ext_id pattern for content identifiers).
  Touches: `docs/ai/REFERENCE/MATCH-SETUP-SCHEMA.md`,
  `docs/ai/REFERENCE/MATCH-SETUP-JSON-SCHEMA.json`,
  `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md`,
  `docs/ai/REFERENCE/00.2-data-requirements.md` (envelope section
  only — the 9-field composition table is unchanged),
  `.claude/rules/code-style.md`, `docs/ai/DECISIONS.md`,
  `docs/ai/work-packets/WORK_INDEX.md`. No `packages/` or `apps/`
  changes. Lint-gate self-pass on §1–§17; §18 N/A; §19 N/A
  (not a state-summary artifact). Vision clauses touched: §3, §22,
  §10a (indirect via WP-091), NG-1..7 (all preserved). See
  [WP-093-match-setup-rule-mode-envelope-field.md](WP-093-match-setup-rule-mode-envelope-field.md).

- [x] WP-094 — Viewer Hero FlatCard Key Uniqueness ✅ Reviewed — Executed 2026-04-24 at commit `eac678c`
  Dependencies: WP-003 (CardRegistry + `FlatCard` type). Compatible
  with (not dependent on) WP-086 and WP-091.
  Notes: Single-file bug fix in `apps/registry-viewer/src/registry/shared.ts`.
  Three heroes in `wwhk` (Caiera, Miek The Unhived, Rick Jones) have
  two cards sharing the same `slot` because one Transforms into the
  other; the viewer's `flattenSet` keyed each hero `FlatCard` on
  `${abbr}-hero-${hero.slug}-${card.slot}`, producing duplicate Vue
  `v-for` keys and stranded DOM nodes that survived filter updates —
  the symptom was "these cards appear in every search result on
  cards.barefootbetters.com". Fix changes the viewer-side key suffix
  from `card.slot` to `card.slug`. Scope deliberately excludes
  `packages/registry/src/shared.ts`: its engine consumer
  `extractHeroSlug` in `packages/game-engine/src/economy/economy.logic.ts`
  parses the slot suffix via last-dash and would break under the new
  format. Harmonizing the two `flattenSet` copies is tracked as a
  future follow-up, not this packet. No new npm deps. No test-file
  additions (viewer has no Vue component-test harness). Vision
  clauses touched: §10a (Registry Viewer public surface). NG-1..7
  all preserved. See
  [WP-094-viewer-hero-flatcard-key-uniqueness.md](WP-094-viewer-hero-flatcard-key-uniqueness.md).

- [x] WP-096 — Registry Viewer: Grid Data View Mode ✅ Done 2026-04-25 (drafted 2026-04-25; 00.3 lint-gate PASS; pre-flight + 01.7 copilot check 30/30 PASS post PS-1..PS-3 + FIX 4 resolution; executed 2026-04-25 at commit `4fe8382`)
  Dependencies: WP-066 (image-to-data view toggle — established `useCardViewMode`,
  `ViewModeToggle.vue`, `CardDataDisplay.vue`, and the `localStorage`
  `cardViewMode` key that this packet extends to a second consumer),
  WP-003 (CardRegistry + `FlatCard` type — the data shape rendered in
  tile-mode). Soft-dep WP-094 (sibling registry-viewer single-component
  fix — pattern reference only). Compatible with (not dependent on)
  WP-086 (queued registry viewer card-types upgrade — same component
  surface on a different axis; merge order does not matter).
  Notes: Corrective follow-up to WP-066. WP-066 deliberately scoped
  the toggle to the sidebar (per EC-066 §Guardrails "CardGrid.vue NOT
  modified — do NOT touch unless necessary") but the public-facing
  "Data view" / "Image view" labels implied coverage of the main grid;
  user reported the gap on 2026-04-24. WP-096 wires `CardGrid.vue` to
  the existing `useCardViewMode` composable directly (no prop plumbing
  through `App.vue`) and introduces `CardDataTile.vue` as the
  tile-sized cousin of `CardDataDisplay.vue`. Eight locked fields
  rendered in order under AND-semantics: `name` (heading) + seven
  labelled rows `Type` / `Set` / `Class` / `Cost` / `Attack` /
  `Recruit` / `Rarity`. Six labels byte-identical to `CardDataDisplay.vue`;
  the `Set` / `setAbbr` row is the deliberate tile-compaction
  divergence from sidebar `Edition` / `setName` — the 130px-min
  `.img-wrap` 3:4 box cannot accommodate full set names without
  ellipsis defenses or grid reflow (D-9601). Ability text intentionally
  omitted from the tile (sidebar remains the place for full ability
  text). Conditional placement inside `.img-wrap` preserves grid
  column track (`minmax(130px, 1fr)`) and 3:4 swap-area dimensions
  byte-for-byte; `.tile-info` footer renders unconditionally; `.selected`
  border glow remains on the outer `.card-tile`. Five required `// why:`
  comments across the two files. Verification: `pnpm --filter
  registry-viewer typecheck` 0 errors; `build` 0 errors / 78 modules
  (baseline 75; +3 from new SFC); `lint` 11 errors / 227 warnings —
  all 11 errors pre-existing on `main` from EC-091 in `LoadoutBuilder.vue`
  (off-allowlist), no new errors introduced. Calibrated baseline at
  HEAD `26e4584` was 11 / 221; +6 warnings stylistic on `CardDataTile.vue`
  consistent with codebase pattern. Manual smoke a–h **user-verified
  passed 2026-04-25** against the post-Commit-A branch at `4fe8382`
  (toggle flips entire grid, selection persists, reload preserves,
  filter survives, console clean, print preview parity).
  Forbidden-imports greps (`game-engine`, `preplan`, `server`,
  registry barrel, `boardgame.io`, `node:`, `pg`, `Math.random`,
  `Date.now`) all zero against the two scope files. No new npm deps;
  no test-file additions (viewer has no Vue component-test harness).
  Vision clauses touched: §10a (Registry Viewer public surface — completes
  WP-066's "global toggle" intent). NG-1..7 all preserved. 01.5 NOT
  INVOKED — all four triggers absent. See
  [WP-096-registry-viewer-grid-data-view.md](WP-096-registry-viewer-grid-data-view.md)
  + [EC-096-registry-viewer-grid-data-view.checklist.md](../execution-checklists/EC-096-registry-viewer-grid-data-view.checklist.md)
  + D-9601.

- [x] WP-100 — Interactive Gameplay Surface (Click-to-Play UI Scaffold, revised) — ✅ Done 2026-04-27 at revised Commit A `5f9cdd4` (preceded by governance-prep `7ff4006` on 2026-04-26 + reverts `541d67c` + `19d1f66` on 2026-04-27 + the revision SPEC commit landing this row, the WP-100.md spec body, and four D-100xx entries). **Original execution 2026-04-26** (Commits A `378729a` + B `1dffb3a`) was reverted on 2026-04-27 after manual smoke testing surfaced a lobby/setup phase-transition gap the original scope did not cover — the engine's lobby phase has `setPlayerReady` + `startMatchIfReady` moves but the locked six-name UI vocabulary did not surface them, and `startMatchIfReady` retargeted to the empty `setup` phase which has no exit. **Revised execution 2026-04-27** added `LobbyControls.vue` + tests (§Scope I) plus a one-line surgical engine retarget in `lobby.moves.ts:72` (`events.setPhase('setup')` → `events.setPhase('play')`, paired test fixture flipped at `lobby.moves.test.ts:110`; §Scope J + D-10006). UiMoveName union extended 6 → 8 names. Test baseline `143 / 10 / 0` → **`176 / 17 / 0`** (+33 tests / +7 suites). Engine baseline `522 / 116 / 0` unchanged. Single runtime engine-import discipline preserved (`bgioClient.ts:16` remains the sole importer). Stage-only gating throughout. PlayView phase-branches lobby (`<LobbyControls>`) vs play (five interactive children) vs other (`<ArenaHud />` only). `LiveMatchView.vue` does not exist; the live-route holder is `apps/arena-client/src/App.vue` per WP-100 §Scope G's "or the equivalent file" clause. 01.5 NOT INVOKED on both the original and revised scope. 01.6 post-mortem MANDATORY at `docs/ai/post-mortems/01.6-WP-100-interactive-gameplay-surface.md` (four triggers: new long-lived abstraction, new code subdirectory, first interactive intent-emitting surface in arena-client beyond the lobby, engine surgical patch with documented evolution path). Four D-100xx entries landed at the revision governance close: D-10003 (drawCards `count: 6` scaffold-artifact rationale), D-10004 (CardExtId-as-label decision; registry projection deferred to WP-111), D-10005 (prop-drilled submitMove vs provide / inject — testability rationale), **D-10006** (startMatchIfReady setPhase retarget rationale + two evolution paths for future deck-construction WP). Drafted 2026-04-26; 00.3 lint-gate self-review PASS; engine-source pre-review 2026-04-26; engine draw-mechanics pre-review 2026-04-26; revision pre-flight + copilot check verdicts both READY TO EXECUTE / CONFIRM 2026-04-27.
  Dependencies: WP-089 (engine `playerView` wiring — UIState
  `handCards` / `city` / `hq` / `mastermind` fields consumed verbatim);
  WP-090 (live match client wiring — `LiveClientHandle.submitMove`
  factory; arena-client's single sanctioned runtime engine import
  remains in `bgioClient.ts`); WP-062 (arena HUD scaffolds —
  `ArenaHud.vue`, `PlayerPanel.vue`, et al. compose with new play
  surface, not replaced by it); WP-092 (lobby loadout intake — match
  creation entry path remains unchanged). Soft-coexists with EC-059
  pre-plan UI surface (commit `5c5fc1e`) — pre-plan files under
  `apps/arena-client/src/{stores,preplan,components/preplan,fixtures/preplan}/`
  are explicitly out of scope; live-flow wiring is queued as WP-070.
  Notes: First interactive gameplay surface for arena-client. Adds
  six new components under `apps/arena-client/src/components/play/`:
  `HandRow.vue` (iterates `UIPlayerState.handCards`, emits
  `submitMove('playCard', { cardId })`), `CityRow.vue` (iterates
  `UICityState.spaces` by positional index 0–4 with empty-slot
  placeholders, emits `submitMove('fightVillain', { cityIndex })`),
  `HQRow.vue` (iterates `UIHQState.slots` by positional index,
  emits `submitMove('recruitHero', { hqIndex })`), `MastermindTile.vue`
  (single button, emits `submitMove('fightMastermind', {})`),
  `TurnActionBar.vue` (Draw → `submitMove('drawCards', { count: 6 })`,
  End Turn → `submitMove('endTurn', {})`), and `PlayView.vue` (composer
  reading `useUiStateStore()`, prop-drilling `submitMove`, suppressing
  interactive children when `uiState.game.phase !== 'play'`). One
  modified file: `apps/arena-client/src/lobby/LiveMatchView.vue` —
  prop-pass only, no logic changes. Locks the prop-drilled
  `submitMove` pattern for all future gameplay UI WPs (no `provide` /
  `inject` seam, no direct `bgioClient.ts` import in components — keeps
  components pure, prop-driven, and stub-testable). Card display
  fidelity scaffolded with `CardExtId` strings; the engine-side
  card-display projection is drafted as WP-111 (sibling, deferred); a
  trivial follow-up UI WP binds component labels to `display.name` /
  `display.imageUrl` once WP-111 lands. Draw button is a scaffold
  artifact pending a future engine WP that adds `turn.onBegin`
  auto-draw to a canonical `HAND_SIZE`. Cost-based affordability
  gating is deferred — `UICityCard`, `UIHQState.slots`, and
  `UIMastermindState` carry no cost field today; components apply
  stage-only gating (Q4 a11y also deferred to a follow-up WP). Vision
  clauses touched: §3 (Player Trust & Fairness), §4 (Faithful
  Multiplayer Experience), §8 (Deterministic Game Engine), §10
  (Content as Data), §11 (Stateless Client Philosophy), §17
  (Accessibility & Inclusivity — explicit deferral with named
  follow-up). NG-1..7 all preserved. 13 files projected (above ~8
  soft limit; inline justification block in WP body — natural split
  boundary at A–E vs F–G if reviewer disagrees at pre-flight); ~29 AC
  items (above 6–12 soft limit; inline justification block — count
  reflects 6 deliverables × ~3 binary checks each, preserves
  per-component fault isolation). See
  [WP-100-interactive-gameplay-surface.md](WP-100-interactive-gameplay-surface.md).

- [x] WP-097 — Tournament Funding Policy (Governance) — **Done 2026-04-27.** Drafted 2026-04-25; lint-gate self-review PASS; EC-097 drafted 2026-04-26 (≤60 content lines per EC-TEMPLATE; two-commit topology per EC-085 precedent); pre-flight READY TO EXECUTE 2026-04-27; copilot check CONFIRM 2026-04-27. Executed 2026-04-27 with three EC-097 commits — Commit A `7260403` (funding-doc reconciliation, four surgical insertions: `## Scope` between `## Authority` and `## Definitions`, tightened `## Definitions` "Infrastructure" entry with "incremental tournament-specific" scope, Vision peer-authority citation in `## Authority`, D-9701 anchor in `## Governance and Amendments`); Commit A.1 `8b73b9f` (one-character lowercase fix-up so AC-1's case-sensitive `incremental tournament-specific` grep matches); Commit B (SPEC governance close — D-9701 inserted immediately before `## Final Note` with both anchors + slogan-collision note byte-identical to WP-097 NCC slogan item; STATUS block; this row; EC_INDEX row). Slogan "No margin, no mission" absent from funding doc throughout (verified zero matches). 01.5 NOT INVOKED (all four triggers absent — engine entirely untouched). 01.6 post-mortem OPTIONAL per WP-085 / WP-093 governance-WP precedent (not authored in this session).
  Dependencies: None. `docs/01-VISION.md §Financial Sustainability` and `§Non-Goals: Exploitative Monetization` (NG-1..NG-7) must already exist (they do). Can land standalone.
  Notes: Retrospective governance for `docs/TOURNAMENT-FUNDING.md` — the
  funding contract was authored during a 2026-04-25 conversation outside
  the WP system. WP-097 reconciles the doc against Vision §Financial
  Sustainability (which uses "No margin, no mission" in the standard
  nonprofit-margin sense) by adding a `## Scope` section explicitly
  distinguishing **tournament-level community funding** (organizer-side,
  no-margin, infrastructure-only — governed by this doc) from
  **platform-level revenue** (supporter subscriptions, cosmetics,
  organized-play licensing, IP royalties — governed by Vision). Tightens
  the "Infrastructure" definition to "incremental tournament-specific
  costs" so it doesn't overlap the platform's always-on infrastructure.
  Anchors the contract to **D-9701** (lands at execution time per the
  WP's Definition of Done). Forbids the slogan "No margin, no mission"
  in the funding doc to prevent semantic collision with Vision (the
  funding doc uses "no organizer margin" instead). Five files in scope
  at execution time: `docs/TOURNAMENT-FUNDING.md` (modified),
  `docs/ai/DECISIONS.md` (D-9701 added), `docs/ai/STATUS.md` (entry
  added), `WORK_INDEX.md` (this row flipped to `[x]`), and
  `WP-097-tournament-funding-policy.md` (the WP file itself, already
  created at draft time). No engine, registry, server, app, Vision,
  Architecture, or rules files touched. Vision clauses touched:
  §Financial Sustainability (peer-authority, no conflict — see WP's
  `## Vision Alignment` block); NG-1, NG-2, NG-3, NG-5, NG-6, NG-7 all
  preserved. NG-4 (energy systems / friction) N/A. Determinism N/A
  (engine untouched). 01.5 not invoked (no `LegendaryGameState` field,
  no `buildInitialGameState` change, no new `LegendaryGame.moves`, no
  new phase hooks). Also authorizes (without implementing) three
  future user-facing funding surfaces under a forbidden-semantics
  fence cross-referencing NG-1/NG-3/NG-6/NG-7: §A Global Navigation
  Donate / Support button (top-right region permitted; non-intrusive,
  Open-Collective-default); §B Registry Viewer affordance
  (discovery-only, never per-card or modal); §C Account / Profile
  attribution (presentation-only, never in comparison contexts,
  opt-in for public visibility). Future UI WPs implementing any of
  these must cite WP-097 + D-9701 in their Authority block and stand
  alone as scoped UI WPs; D-9701 timing caveat — those WPs are
  blocked from passing §17 Vision Alignment until WP-097 executes and
  D-9701 lands. §F Funding Surface Gate adds a seven-item pre-merge
  checklist (G-1 label discipline, G-2 no-subscription framing, G-3
  no entitlement, G-4 no registry gating / no per-content donor
  attribution, G-5 no dark patterns, G-6 platform/tournament scope
  clarity, G-7 attribution informational only) that downstream UI
  WPs MUST satisfy and map per-surface in their `## Vision Alignment`
  or dedicated `## Funding Surface Gate` block; deviations require a
  Vision amendment or a new D-entry carve-out, never silent
  exceptions. See
  [WP-097-tournament-funding-policy.md](WP-097-tournament-funding-policy.md)
  + [EC-097-tournament-funding-policy.checklist.md](../execution-checklists/EC-097-tournament-funding-policy.checklist.md).

- [x] WP-098 — Funding Surface Gate Trigger (00.3 §20) — **Done 2026-04-27.** Drafted 2026-04-26; lint-gate self-review PASS; EC-098 drafted 2026-04-26 (≤60 content lines per EC-TEMPLATE; two-commit topology per EC-085 / EC-097 precedent); pre-flight READY TO EXECUTE 2026-04-27; copilot check CONFIRM 2026-04-27. Executed 2026-04-27 with two EC-098 commits — Commit A `545c37f` (single file: `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — `## §20 — Funding Surface Gate Trigger` inserted between §19 and `## Final Gate`, structurally parallel to §17 with the load-bearing "no new policy and no new constraints" preempt sentence in the §20 header, the five trigger surfaces in §20.1 with the user-interaction qualifier on the user-visible-copy bullet, the strengthened N/A justification bar rejecting tautological placeholders, the Governance-doc exclusion + Analytical / retrospective non-trigger sub-bullets, the four required-content items in §20.2 including the "Partial mapping is a FAIL" enforcement clause on the G-1..G-7 disposition item, the five boundary clarifications in §20.3 including the automation-not-implied clarification; Final Gate gains five new §20-attributed rows (34..38); §17 / §18 / §19 and the §19 commit-time-discipline note preserved byte-for-byte); Commit B (SPEC governance close — D-9801 inserted immediately before `## Final Note` distinguishing scope from D-9701 with the decision-ID-range breadcrumb; STATUS block; this row; EC_INDEX row). 01.5 NOT INVOKED (all four triggers absent — engine entirely untouched). 01.6 post-mortem OPTIONAL per WP-085 / WP-097 governance-WP precedent (not authored in this session).
  Dependencies: **Hard dep on WP-097 execution** — D-9701 must exist in
  `docs/ai/DECISIONS.md` before §20 can cite it. WP-098 cannot execute
  until WP-097 has landed. No other deps.
  Notes: Closes the gap where WP-097 §F's Funding Surface Gate
  (G-1..G-7) is self-described in the WP but not auto-applied at
  lint-gate time. WP-098 adds `## §20 — Funding Surface Gate Trigger`
  to `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, structurally
  parallel to §17 Vision Alignment: §20.1 trigger conditions
  (touches WP-097 §A / §B / §C surfaces, tournament funding-channel
  integrations, or user-visible "donate" / "support tournaments"
  copy); §20.2 required content (surface inventory + G-1..G-7
  disposition + copy-deferral declaration + authority citation);
  §20.3 boundary (does not redefine §F, does not replace §17, does
  not apply to non-trigger WPs, does not apply retroactively). At
  least four new fail-condition rows added to the Final Gate table.
  §20 cites WP-097 §F G-1..G-7 by ID — never duplicates the gate
  items (single-source-of-truth principle locked at AC-2). New
  decision **D-9801** anchors §20 itself, distinct from D-9701:
  D-9701 = "what the policy is"; D-9801 = "how the lint gate enforces
  it." Seven files in scope at execution time:
  `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (modified;
  Commit A); `docs/ai/DECISIONS.md` (D-9801 added; Commit B);
  `docs/ai/STATUS.md` (entry; Commit B); `WORK_INDEX.md` (this row
  flipped to `[x]`; Commit B); `EC_INDEX.md` (EC-098 row flipped
  Draft → Done; Commit B); `WP-098-funding-surface-gate-trigger.md`
  (the WP file itself, already created at draft time);
  `EC-098-funding-surface-gate-trigger.checklist.md` (the EC, already
  created at draft time). No engine, registry, server, app, Vision,
  Architecture, `.claude/`, WP-097, or funding-doc files touched.
  Vision clauses touched: §Financial Sustainability (peer-authority
  boundary preserved by extension of WP-097 §F enforcement); NG-1,
  NG-3, NG-5, NG-6, NG-7 (gate items §20 enforces all cross-reference
  these). NG-2 / NG-4 N/A. Determinism N/A (engine untouched). 01.5
  not invoked. Self-application: WP-098 itself contains a `## Funding
  Surface Gate` declaration marked **N/A with justification**
  ("WP-098 codifies the §20 trigger; it implements no UI surface")
  per WP-097 §F "Applicability is declared, never inferred" —
  proof-of-concept demonstration that §20 self-applies cleanly. See
  [WP-098-funding-surface-gate-trigger.md](WP-098-funding-surface-gate-trigger.md)
  + [EC-098-funding-surface-gate-trigger.checklist.md](../execution-checklists/EC-098-funding-surface-gate-trigger.checklist.md).

- [x] WP-099 — Auth Provider Selection (Governance) — **Done 2026-04-27.** Drafted 2026-04-25; lint-gate self-review PASS; EC-099 drafted 2026-04-25 (≤60 content lines per EC-TEMPLATE — 50 content lines; two-commit topology per EC-097 / EC-098 precedent); pre-flight READY TO EXECUTE 2026-04-27; copilot check CONFIRM 2026-04-27. Executed 2026-04-27 with two EC-099 commits — Commit A `f6cd591` (single file: `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — Hanko carve-out bullet appended at line 169 immediately after the existing `No Passport / Auth0 / Clerk — use \`jsonwebtoken\` or credentials-only` bullet at line 168; the four sibling forbidden-package bullets at lines 165–168 byte-identical INCLUDING inline backticks; new bullet cites WP-099 + D-9901..D-9905, locks `apps/server/src/auth/hanko/` module path, forbids `'hanko'` literal as `auth_provider` value, requires server-generated `AccountId`, reaffirms Auth0 / Clerk / Passport remain forbidden); Commit B (SPEC governance close — `D-9901..D-9905` inserted as a contiguous numeric-order block immediately before `## Final Note`, after D-9801, per the now-three-precedent chronological-tail convention WP-097 / D-9701 + WP-098 / D-9801 + WP-099 / D-9901..D-9905; STATUS block at top of `## Current State`; this row; EC_INDEX row). Decision IDs landed: D-9901 (Hanko selected; replacement-safety structural; module path locked at D-9904), D-9902 (`AccountId` server-generated via `node:crypto.randomUUID()` per WP-052 D-5201; Hanko `sub` is `authProviderId` only, never primary identity), D-9903 (`00.3 §7` Hanko carve-out — Hanko-specific, not category-wide; Auth0 / Clerk / Passport remain forbidden), D-9904 (Hanko code confined to `apps/server/src/auth/hanko/` — sibling to `identity/`; `apps/server/src/identity/`, `packages/game-engine/`, `packages/registry/`, `apps/registry-viewer/`, `apps/arena-client/` remain Hanko-free; F-2 gate enforces), D-9905 (guest policy preserved; `13-REPLAYS-REFERENCE.md §Account and Guest Policy` reaffirmed; F-4 gate verifies). 01.5 NOT INVOKED (all four triggers absent — engine entirely untouched; no `LegendaryGameState` field, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks). 01.6 post-mortem OPTIONAL per WP-093 / WP-097 / WP-098 governance-WP precedent (not authored in this session).
  Dependencies: WP-052 (identity model exists; provider-agnostic envelope established). No hard dep on WP-097 / WP-098. Can land standalone.
  Notes: Selects **Hanko** as the project's authentication broker
  (open-source, self-hostable, OIDC-compliant, passkey-first). Locks
  the integration boundary so Hanko is **invisible at rest**: the
  `legendary.players.auth_provider` enum stays at WP-052's
  `'email' | 'google' | 'discord'` (unchanged); Hanko-mediated users
  are recorded under the federated IdP claim Hanko exposes (Google →
  `'google'`, Discord → `'discord'`, email+passkey direct →
  `'email'`); the broker never appears as an `auth_provider` value.
  `AccountId` remains server-generated via `node:crypto.randomUUID()`
  per WP-052 D-5201 — Hanko's `sub` becomes `authProviderId` only,
  never primary identity. Hanko-specific code is confined to a
  locked module path `apps/server/src/auth/hanko/` (sibling to
  `identity/`, never under it) so swapping brokers later requires
  zero `legendary.players` migration. Auth0 / Clerk / Passport
  remain forbidden under `00.3 §7`; the §7 amendment landed by this
  WP is a **Hanko-specific carve-out**, not a category-wide
  permission for managed-credential providers. Guests are never
  gated — core gameplay and immediate local replay export remain
  unconditional per WP-052 / `13-REPLAYS-REFERENCE.md` §Account and
  Guest Policy. Scope: docs-only (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md
  §7` surgical append + `docs/ai/DECISIONS.md` `D-9901..D-9905` +
  `docs/ai/STATUS.md` block + `docs/ai/work-packets/WORK_INDEX.md`
  row flip + `docs/ai/execution-checklists/EC_INDEX.md` row flip).
  No code changes; no new npm dependencies; no migrations; no
  WP-052 contract files modified. Two-commit topology at execution:
  A `EC-099:` (single file — `00.3 §7` amendment); B `SPEC:`
  (DECISIONS.md `D-9901..D-9905` + STATUS.md `### WP-099 / EC-099
  Executed` block + WORK_INDEX.md WP-099 row `[ ]` → `[x]` +
  EC_INDEX.md EC-099 row `Draft` → `Done`). Vision clauses touched:
  §3 (Player Trust & Fairness), §11 (Stateless Client Philosophy),
  §14 (Explicit Decisions, No Silent Drift), §15 (Built for
  Contributors); NG-1, NG-3, NG-6 not crossed. 01.5 NOT INVOKED
  (engine entirely untouched). 01.6 post-mortem OPTIONAL per the
  WP-093 / WP-097 governance-WP precedent (no executable code; no
  long-lived abstraction beyond the decision record itself).
  Authorizes future surfaces (policy-only, NOT implemented here):
  WP-112 (session token validation; the
  `requireAuthenticatedSession` provider referenced by WP-101 —
  renumbered from "WP-100" per D-10002) and
  a future implementation WP (Hanko SDK wiring + JWT validation +
  claim extraction; locked module path
  `apps/server/src/auth/hanko/`); both must satisfy the §C
  Future-Auth Gate F-1..F-7 in WP-099. Decision IDs landed at
  execution: D-9901 (Hanko selected; replacement-safety structural),
  D-9902 (`AccountId` server-generated, Hanko `sub` is
  `authProviderId` only), D-9903 (`00.3 §7` Hanko carve-out),
  D-9904 (Hanko code confined to `apps/server/src/auth/hanko/`),
  D-9905 (guest policy preserved). See
  [WP-099-auth-provider-selection.md](WP-099-auth-provider-selection.md)
  + [EC-099-auth-provider-selection.checklist.md](../execution-checklists/EC-099-auth-provider-selection.checklist.md).

- [x] WP-101 — Handle Claim Flow & Global Uniqueness — Done 2026-04-28 (Commit A `fb1ca2b` `EC-114:`). Drafted 2026-04-25; lint-gate self-review PASS; EC-114 drafted 2026-04-25 (originally EC-101; retargeted EC-101 → EC-114 on 2026-04-27 per filename collision with viewer-series `EC-101-viewer-ci-hardening.checklist.md`); staleness sweep 2026-04-27 (migration slot `007` → `008` after EC-053 consumed `007`; baselines updated to post-WP-113 floor); executed 2026-04-28 — server `51 / 8 / 0` → `63 / 9 / 0` (+12 / +1); engine `570 / 126 / 0` unchanged; 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-101-handle-claim-flow.md`.
  Dependencies: WP-052 (identity model exists); WP-103 (migration `006_create_replay_blobs_table.sql` landed at `fe7db3e`); WP-053 (migration `007_create_competitive_scores_table.sql` landed at `56e8134`) — WP-101 uses migration slot **`008`**, not `006` or `007`. Soft-dep on WP-112 (session token validation; renumbered from "WP-100" per D-10002) for the runtime caller, but WP-101 does not require WP-112 to land first — uses caller-injected `requireAuthenticatedSession(req): Promise<AccountId>` contract with stubbed test fixtures (mirrors WP-052 `DatabaseClient` injection precedent).
  Notes: Server-only packet adding immutable, globally unique,
  URL-safe `handle` to `legendary.players` via migration `008`. Three
  new columns: `handle_canonical text` (nullable until claim; partial
  UNIQUE index on `WHERE handle_canonical IS NOT NULL` permits
  multiple pre-claim NULLs while enforcing global uniqueness once
  any handle is claimed); `display_handle text` (case-preserved for
  presentation); `handle_locked_at timestamptz` (set to `now()` at
  first successful claim; never updated thereafter). Application-layer
  canonicalization (`trim().toLowerCase()`) per WP-052 email
  precedent — no `citext`, no extension privilege required. Locked
  format regex `^[a-z][a-z0-9_]{2,23}$` (3–24 chars, lowercase
  alphanumeric + underscore, no leading digit, no leading
  underscore, no consecutive underscores via separate substring
  check). Locked 15-entry alphabetical reserved set: `admin`,
  `administrator`, `anonymous`, `api`, `arena`, `guest`, `legendary`,
  `mod`, `moderator`, `null`, `root`, `staff`, `support`, `system`,
  `undefined`. Reserved-set check runs **before** uniqueness check;
  reserved hits return `code: 'reserved_handle'` regardless of DB
  state. Four exports under new `apps/server/src/identity/`:
  `handle.types.ts` (`HandleClaim` 4-field interface;
  `HandleErrorCode` 5-value union; `HANDLE_ERROR_CODES`,
  `RESERVED_HANDLES`, `HANDLE_REGEX` canonical readonly arrays /
  RegExp; `Result<T>` re-imported from `identity.types.ts`, never
  redeclared); `handle.logic.ts` (`validateHandleFormat` pure;
  `claimHandle` returns `Result<HandleClaim>` via locked idempotent
  UPDATE pattern + `findPlayerByAccountId` disambiguation;
  `findAccountByHandle` and `getHandleForAccount` read-only).
  Locked idempotent SQL: `UPDATE legendary.players SET handle_canonical
  = $2, display_handle = $3, handle_locked_at = now() WHERE ext_id =
  $1 AND handle_canonical IS NULL RETURNING …`; `'23505'` on
  `handle_canonical` UNIQUE → `code: 'handle_taken'`; empty
  `RETURNING` + `findPlayerByAccountId` disambiguates `unknown_account`
  vs `handle_already_locked` vs idempotent re-claim. Handle is
  permanently locked at first successful claim — no rename, no admin
  override, no GDPR-motivated rename. Account deletion (WP-052
  `deletePlayerData`) deletes the row entirely; **no tombstone table
  preserves the canonical value**, so a deleted handle naturally
  vanishes from the partial UNIQUE index and is technically
  re-claimable by a different account. Anti-impersonation reservation
  is **out of scope** for this packet and requires a future WP +
  `DECISIONS.md` entry. Two complementary public-surface invariants
  published for downstream WPs (WP-102 etc.) to honor: (1) per
  `DESIGN-RANKING.md` lines 485–487, rankings use `AccountId` (stable
  player ID), never the handle; (2) per WP-101 itself, public surfaces
  (`/players/{handle}`, replay attribution, leaderboard displays,
  shareable replay links per `13-REPLAYS-REFERENCE.md` line 248) MUST
  use `AccountId` as the authoritative identity and treat handle as
  a presentation alias that may be reused after deletion. Terminology
  disambiguation locked: `DESIGN-RANKING.md` lines 145, 205 use
  "replay handle" to mean `replayHash`; WP-101's `handle` / `Handle*`
  symbols always refer to the user-facing account identifier — no
  symbol introduced here is named with "replay" as a prefix. 12 new
  tests in one `describe('handle logic (WP-101)', …)` block (3 drift
  + 6 pure validation + 3 DB-dependent claim-flow); tests 10–12 use
  the locked WP-052 `hasTestDatabase ? {} : { skip: 'requires test
  database' }` non-silent skip. Server baseline shifts post-WP-113
  `51/8/0` → **`63/9/0`** (+12 tests / +1 suite); engine baseline
  `570/126/0` (post-WP-113) unchanged. Two-commit topology at
  execution: A `EC-114:` (4 files: `handle.types.ts`, `handle.logic.ts`,
  `handle.logic.test.ts`, `008_add_handle_to_players.sql`); B `SPEC:`
  (STATUS.md `### WP-101 / EC-114 Executed` block + WORK_INDEX.md
  WP-101 row `[ ]` → `[x]` + EC_INDEX.md EC-114 row `Draft` → `Done`;
  optional `D-101NN` decision recording the no-tombstone policy if
  the executor judges it worth a DECISIONS.md anchor). WP-052
  contract files (`identity.types.ts`, `identity.logic.ts`) NOT
  modified; WP-052 migrations `004` and `005` NOT modified; WP-103
  migration `006_create_replay_blobs_table.sql` NOT modified;
  WP-053 migration `007_create_competitive_scores_table.sql` NOT
  modified; `packages/game-engine/src/types.ts` NOT modified. Vision clauses
  touched: §3 (Player Trust & Fairness), §11 (Stateless Client
  Philosophy), §14 (Explicit Decisions, No Silent Drift), §25 (Skill
  Over Repetition — Non-Ranking Telemetry Carve-Out); NG-1..7 not
  crossed. 01.5 NOT INVOKED (engine entirely untouched). 01.6
  post-mortem MANDATORY at execution per at least two triggers (new
  long-lived abstraction `claimHandle` consumed by future
  request-handler / profile-page WPs; new contract surface for
  handle uniqueness; new persistence-column extension on
  `legendary.players`). See
  [WP-101-handle-claim-flow.md](WP-101-handle-claim-flow.md) +
  [EC-114-handle-claim-flow.checklist.md](../execution-checklists/EC-114-handle-claim-flow.checklist.md).

- [x] WP-102 — Public Player Profile Page (Read-Only) — **Done 2026-04-28** (Commit A `369c0a4`; EC-117). 7 of 8 specified files shipped; route registration in `apps/server/src/server.mjs` deferred per D-10202 (cite D-3103 mid-execution + WP-053 shipped-but-unwired precedent) to the future request-handler WP that owns long-lived `pg.Pool` lifecycle. Server baseline `63/9/0` → `71/10/0` achieved (+8 tests / +1 suite / 0 fail). Engine `570/126/0` unchanged. arena-client builds cleanly with `PlayerProfilePage` lazy-loaded as a separate chunk. Drafted 2026-04-25; lint-gate self-review PASS; staleness sweep 2026-04-28 (post-WP-101 baselines + migration slot `007` → `008` for the WP-101 handle migration + WP-053 contract-immutability rule added; EC slot retarget `EC-102` → `EC-117` per the viewer-series collision precedent).
  Dependencies: WP-052 (identity model + `legendary.replay_ownership`); WP-101 (handle claim + `findAccountByHandle` + the public-surface invariants in WP-101 §"Public surfaces must not treat handle as a stable identity key"; **landed 2026-04-28 at Commit B `7b92734`**). Soft-dep on WP-112 (session token validation; renumbered from "WP-100" per D-10002) — **not required**, because this packet's only endpoint is unauthenticated.
  Notes: First WP to expose handles in HTTP and first profile
  surface in the Vue SPA. Scope intentionally narrow: a public
  read-only `/players/:handle` page that composes
  `PublicProfileView` (4 fields: `handleCanonical`,
  `displayHandle`, `displayName`, `publicReplays`) from
  `legendary.players` (via WP-101 `findAccountByHandle`) +
  `legendary.replay_ownership` (locked SQL filter:
  `visibility IN ('public', 'link') AND (expires_at IS NULL OR
  expires_at > now())`). Single new HTTP route
  `GET /api/players/:handle/profile` returns 200 with the view or
  404 with body `{ "error": "player_not_found" }` (no information
  leak distinguishing unclaimed vs deleted handles). Six locked
  empty-state tabs anchored to future WPs (`Rank — coming soon
  (WP-054 / WP-055)`, `Badges — WP-105`, `Tournaments`,
  `Comments`, `Integrity — WP-107+`, `Support — WP-108+`); the
  six tab sections must contain zero `fetch` / XHR / WebSocket
  references (verified). Vue route at `/players/:handle` lazy-loads
  `PlayerProfilePage.vue`; typed `fetchPublicProfile(handle)`
  wrapper in `apps/arena-client/src/lib/api/profileApi.ts`.
  **Critical invariant** (locked verbatim from WP-101):
  every server code path dereferences handle → `AccountId` once
  per request via `findAccountByHandle`; no `(handle, content)`
  cache beyond request scope. Per WP-101's no-tombstone policy, a
  reclaimed handle MUST NOT serve the prior account's content
  under any code path introduced here. Per `DESIGN-RANKING.md`
  lines 485–487, rankings use `AccountId`, never the handle —
  the "Rank" empty-state stub displays nothing rankings-shaped.
  Read-only against `legendary.players` and
  `legendary.replay_ownership`: no `INSERT`/`UPDATE`/`DELETE`
  permitted under `apps/server/src/profile/` (verified via grep);
  no new tables; no new migrations; no new npm dependencies.
  No authenticated endpoint; no `requireAuthenticatedSession`
  import; no Hanko reference (per WP-099 D-9904, Hanko code lives
  only under `apps/server/src/auth/hanko/`, not yet created).
  `PublicProfileView` excludes `email`, `auth_provider`,
  `auth_provider_id`, `accountId`, `createdAt` — handle is the
  public identifier on this surface. `PublicReplaySummary`
  excludes `expiresAt` (server filters before return) and types
  `visibility` as `'public' | 'link'` (no `'private'` at the type
  level — server-side filter expressed in the type). 8 new tests
  in one `describe('public profile logic (WP-102)', …)` block (3
  pure drift tests + 5 DB-dependent: 404, empty, visibility filter,
  expiration filter, case-insensitive lookup); DB tests use the
  locked WP-052 `hasTestDatabase ? {} : { skip: 'requires test
  database' }` pattern. Server baseline shifts post-WP-101
  `63/9/0` → **`71/10/0`** (+8 tests / +1 suite; with skips when
  `TEST_DATABASE_URL` unset). Engine baseline **`570/126/0`**
  (post-WP-113) unchanged. WP-052 contract files NOT modified;
  WP-101 contract files NOT modified (including migration `008`);
  WP-053 contract files NOT modified (including migration `007`);
  WP-103 contract files NOT modified (including migration `006`);
  `packages/game-engine/src/types.ts` NOT modified.
  Vision clauses touched: §3 (Player Trust & Fairness), §11
  (Stateless Client Philosophy), §14 (Explicit Decisions), §18
  (Replayability & Spectation), §22 (Replay determinism — N/A by
  construction; metadata-only display), §24 (Replay-Verified
  Competitive Integrity), §25 (Non-Ranking Telemetry Carve-Out
  — handle display is non-ranking telemetry); NG-1, NG-3, NG-6
  preserved. Funding Surface Gate (WP-098 §20, drafted): **N/A
  declared** with explicit justification — "Support" tab is inert
  (no fetch, no schema, no donation/subscription/tournament-
  funding affordance), renders only "Coming soon — see WP-108".
  01.5 NOT INVOKED (engine entirely untouched). 01.6 post-mortem
  MANDATORY at execution per at least two triggers (new
  long-lived abstraction `getPublicProfileByHandle` consumed by
  future profile WPs; new HTTP-surface contract; first arena-client
  page outside the live-match flow). Pre-flight item: a new
  D-entry is required at execution to classify
  `apps/server/src/profile/` as a server-layer directory (mirrors
  D-5202 for `identity/` and D-10301 for `replay/`); the D-NNNN
  number is assigned at execution time. See
  [WP-102-public-profile-page.md](WP-102-public-profile-page.md).

- [ ] **(deferred placeholder)** WP-104 — Owner Profile Data Model
  & `/me` Edit. Splits the owner-edit half of the original
  WP-PLAYER-PROFILE proposal into its own scoped packet.
  Dependencies: **WP-102 must land first** (establishes profile
  module + page conventions); WP-112 (session token validation —
  for `requireAuthenticatedSession` on `PATCH /api/me/profile`;
  renumbered from "WP-100" per D-10002).
  Scope (target ≤8 files): new `legendary.player_profiles` table
  (`avatar_url text NULL`, `about_me text NULL`, privacy toggles,
  `updated_at`); new `legendary.player_links` table (provider,
  url, `is_public`); owner-only `GET /api/me/profile`,
  `PATCH /api/me/profile`, `PUT /api/me/links` endpoints; Vue
  `MyProfilePage.vue` at `/me` with edit forms.
  Out-of-scope (deferred to dedicated WPs): avatar **upload**
  (URL-only here — WP-106 owns R2 pipeline); badges (WP-105);
  integrity admin (WP-107+); payments (WP-108+).
  Will draft when WP-102 has landed and the arena-client
  framework conventions referenced by WP-102 are confirmed.

- [ ] **(deferred placeholder)** WP-105 — Player Badges Data Model
  & Display. Dependencies: WP-104 (owner profile surface to
  display badges on). Issuer model resolved by D-1004 (tiered:
  WP-105 ships Tier 1 / rule-driven gameplay badges only).
  Anti-volume / veteran-recognition rules resolved by §25 (revised
  2026-04-26) and D-0006. Criteria sketch and bot-resistance
  analysis live in `docs/ai/PROPOSAL-BADGES.md` §3.
  Scope (target ≤7 files per D-1004): new
  `legendary.player_badges` table (locked column set per D-1004
  implementation notes; includes `qualifying_window_start
  timestamptz NOT NULL` per D-0006); engine/server issuance hook
  invoked after `submitCompetitiveScoreImpl` step-15 INSERT;
  `getPlayerBadges` read function; live list replacing the
  empty-state stub on WP-102 / WP-104.
  Tier 1 first slice: 6 per-run gameplay badges + 4 veteran
  recognition badges (per `PROPOSAL-BADGES.md` §3 + `PROPOSAL-
  VISION-25-AMENDMENT.md` §5). Public canonical badge URLs and
  cross-platform mirroring (LinkedIn / Steam / Credly) explicitly
  out of scope per D-1004 (deferred pending Marvel-IP review).
  Tier 2 (admin-attested) and Tier 3 (external-attested) deferred
  to future WPs; D-1004 forbids any `tier IN (2, 3)` row in WP-105.
  **Ready to draft** once WP-104 lands and the arena-client
  framework conventions are confirmed.

- [ ] **(deferred placeholder)** WP-106 — Avatar Upload Pipeline
  (R2 + MIME / size validation). Dependencies: WP-104 (avatar URL
  field in `legendary.player_profiles`); existing R2 storage
  policy.
  Scope (target ≤8 files): server-side presigned-URL endpoint;
  MIME / size validation; client-side upload widget on
  `/me` profile editor; image deletion on overwrite.
  Out-of-scope: image moderation (separate concern), CDN
  caching policy. **Will not draft until** WP-104 has landed and
  R2 storage governance for user-uploaded content is recorded
  in a new `D-NNNN` entry.

- [ ] **(deferred placeholder)** WP-107 — Profile Integrity /
  Anti-Cheat Surface (Public Status + Admin Review). Dependencies:
  **a future admin-auth WP must exist first** — no admin RBAC
  mechanism is currently defined; introducing
  `/api/admin/players/:accountId/integrity` here would fabricate
  the admin-auth surface.
  Scope (target ≤8 files when ready): new
  `legendary.player_integrity_reviews` table (status enum, public
  short note, admin-only notes); coarse public status surfaced on
  WP-102 / WP-104; admin endpoints under `/api/admin/...` gated
  by the admin-auth contract. **Will not draft until** the
  admin-auth WP exists and a `D-NNNN` decision records the RBAC
  shape. Security-review-required at draft time.

- [ ] **(deferred placeholder)** WP-108 — Profile Funding Surface
  (Subscriptions / Donations / Tournament Funding History).
  Dependencies: **WP-097 must land** (D-9701 anchors the funding
  policy and the §F Funding Surface Gate); **WP-098 must land**
  (the §20 Funding Surface Gate Trigger in `00.3` must exist for
  this WP to declare applicability without a §17 lint FAIL); a
  payment-integration WP must exist (PayPal / Stripe / OpenCollective
  webhook ingestion is its own governance surface and is not yet
  scoped). Scope (target ≤8 files when ready): new
  `legendary.player_payments` table storing references and
  amounts only (never card / bank instruments); owner-only view
  surface on `/me`; never gates gameplay (NG-1 / D-9905 invariant).
  **Will not draft until** WP-097 + WP-098 land and a
  payment-integration WP is queued. The §F gate F-1..F-7 (or
  whatever it lands as) MUST be applicable-declared in the WP
  body at draft time.

- [ ] WP-109 — Team Affiliation (Profile-Level Cooperative Cohorts) — Drafted 2026-04-26; lint-gate self-review **PASS**; EC-115 drafted 2026-04-26 (originally EC-109; retargeted EC-109 → EC-115 on 2026-04-27 per filename collision with executed viewer-series `EC-109-delete-unused-auxiliary-metadata.checklist.md`); **BLOCKED on WP-104** (hard dependency — extends WP-104's profile schema and shares the same migration / table family).
  Dependencies: **WP-104 must land first** (deferred placeholder above; profile schema + `legendary.player_profiles` table + `apps/server/src/profile/` module are extension targets); WP-052 (identity model); WP-101 (handle claim flow); WP-102 (public profile page — soft-dep, reuse target for the read surface).
  Notes: Adds a Server-layer team-identity surface (Team entity + member event log + audit log + profile extension `teamAffiliations[]`) plus a read-only block on the public profile page. Variable team size declared at creation as `teamSize: 3 | 4 | 5` (immutable post-creation; maps to Legendary's three meaningful cooperative formats — 3-handed, 4-handed, 5-handed). Substitute cap = `min(2, teamSize − 2)` (1 / 2 / 2). Validity rule generalized: `liveMembers ≥ teamSize − 2 AND liveMembers + liveSubs ≥ teamSize − 1`. Vision-aligned per §3 / §4 / §23(b) / §25; D-0005 preserved trivially (no comparison surface introduced); DESIGN-RANKING.md §12 deferral honored (no team rankings, no inter-team comparison, no rewards, no MMR — identity and history only). Team-play attribution onto run records explicitly out of scope and deferred to a future WP (provisionally WP-110+). `cohortLabel` field name avoids collision with DESIGN-RANKING §2 Season. `friends` visibility falls back to `private` server-side until a friend-graph surface exists. Operator-override paths exist in code but HTTP exposure is gated behind a future admin-auth WP. Eight files projected (within ≤8 cap): `apps/server/src/teams/{team.types.ts, team.logic.ts, team.routes.ts, team.logic.test.ts}`, `data/migrations/NNN-team-affiliation.sql`, `apps/server/src/profile/{profile.types.ts, profile.logic.ts}` (modified), `apps/arena-client/src/pages/PublicProfile.vue` (modified). New D-entry required at execution to classify `apps/server/src/teams/` as a server-layer directory (mirrors D-5202 for `identity/` and D-10301 for `replay/`); D-NNNN number assigned at execution. Migration slot, route prefix, and several §17 Open Questions (friend-graph existence at execution time, cohort overlap rules, invalidity recovery state) are pre-flight items. See [WP-109-team-affiliation.md](WP-109-team-affiliation.md) and [EC-115-team-affiliation.checklist.md](../execution-checklists/EC-115-team-affiliation.checklist.md).

- [ ] **(deferred placeholder)** WP-112 — Session Token Validation Middleware. Implements the `requireAuthenticatedSession(req): Promise<AccountId>` provider that WP-101 / WP-102 / WP-104 cite as a soft-dep. Renumbered from "WP-100" by D-10002 (the WP-100 slot was reassigned to Interactive Gameplay Surface on 2026-04-26). Authorizing contract: WP-099 §A "Session Validation Middleware" (F-1..F-7 Future-Auth Gates locked there); WP-099 D-9904 (Hanko code confined to `apps/server/src/auth/hanko/`). Scope (target ≤8 files): the middleware itself plus its tests; resolves the verified caller to an `AccountId` via the WP-052 identity model (one of the F-gates dictates which path — Hanko-token-direct or post-auth session token); MUST NOT modify WP-052 contract files; MUST NOT modify WP-099 governance artifacts. Hanko SDK wiring + JWT validation + claim extraction may live in a separate sibling implementation WP per WP-099 (WP-112 is permitted to either inline that wiring or call into a sibling — choice locked at draft time). Dependencies: WP-099 (policy contract); WP-052 (identity model). Soft-consumers (none of which require WP-112 to land first because all use the caller-injected provider pattern): WP-101, WP-102, WP-104. **Not yet drafted** — this row exists to reserve the WP-112 slot and pin the contract origin so future readers do not re-derive the renumber. See D-10002 in `DECISIONS.md`.

- [ ] **(deferred placeholder)** Fix CLI credentials field drift in `apps/server/scripts/join-match.mjs` — D-9001 identifies the buggy script. Two issues: (1) the script omits `playerID` from its POST body; the server auto-assigns a seat which is functionally OK but inconsistent with `create-match.mjs`'s shape; (2) the script reads `result.credentials` after the join response, but the canonical field name is `result.playerCredentials` — meaning the script's printed `credentials:` value is always `undefined`. Scope is CLI-only — no engine, no client, no server logic touched. A future packet may either fix the two bugs in place (preferred — matches `create-match.mjs` shape) or delete the script outright if the lobby UI obsoletes its use case. No dependencies; can land standalone.

- [ ] **(deferred placeholder)** Classify `apps/registry-viewer/` in `docs/ai/REFERENCE/02-CODE-CATEGORIES.md` — pre-existing governance gap surfaced as WP-066 copilot finding #13, inherited silently by WP-094 and WP-096 (third inheritance pass; flagged in WP-096 pre-flight RS-3 + copilot check finding #13). Two acceptable resolutions: (a) extend the existing `client-app` row (D-6511) to cover both `apps/arena-client/` and `apps/registry-viewer/`; (b) add a new `client-app-viewer` row with its own DECISIONS.md entry. Either path needs an authorising D-entry plus updates to the table at `02-CODE-CATEGORIES.md:36-49` and the per-category prose at `:234-270`. Scope is docs-only — no engine, registry, server, or app code touched. No dependencies; can land standalone. The next viewer-touching WP should arrive with the classification already landed rather than inheriting the gap a fourth time.

- [x] WP-125 — Registry Viewer: Card Abilities Effect-Tag Filter — **Done 2026-05-01 (`EC-127:`).** Drafted 2026-05-01 (commit `47154b2` carries the WP + EC drafts); lint-gate self-review PASS; EC-127 is the next free EC slot after EC-126 reserved WP-124 on 2026-05-01 (per the locked precedent EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122, EC-123, EC-124, EC-125, EC-126 — the WP-keyed EC retargets to EC-127; WP number unchanged). Adds a curated effect-tag chip ribbon to the cards-view filter bar of the registry viewer at `cards.barefootbetters.com`, mounted between the existing card-type ribbon and the set-pills. Ten initial chips: Draw a card / KO from hand / KO from discard / KO from hand or discard / Rescue a Bystander / Gain Attack / Gain Recruit / Gain Piercing / Gain a Wound / Defeat a Villain. Each chip displays a global badge count of cards tagged with that effect across the session-wide ability tag index (independent of other active filters; computed once at startup). Multi-select ORs within the abilities filter; combined with set / hero class / card type / search, all filters AND together. **Locked under D-12501.** Taxonomy at `data/metadata/card-abilities.json` (R2 path `metadata/card-abilities.json`); schema additions at `packages/registry/src/schema.ts` after the existing card-types block — `CardAbilityMatcherSchema` (`type: z.literal("regex")` single-literal lock, `pattern: z.string().min(1)`, optional `flags`), `CardAbilityEntrySchema` (slug regex `/^[a-z][a-z0-9-]*$/`, `label`, optional `emoji`, nonneg-int `order`, `matchers: z.array(...).min(1)`), `CardAbilitiesIndexSchema = z.array(...)`, all `.strict()` mirroring `CardTypeEntrySchema:213–219` exactly; inferred type aliases `CardAbilityMatcher` / `CardAbilityEntry` / `CardAbilitiesIndex` exported alongside. Schema imports use the narrow `@legendary-arena/registry/schema` subpath (D-8601 binding), never the barrel. **Pre-execution scope amendment (2026-05-01):** EC-127 §0 was amended pre-execution to expand the runtime scope from 5 production files to 6 (adding `apps/registry-viewer/src/lib/devLog.ts`) and the total staged set from 11 to 12. The amendment was driven by a mechanical dependency the original draft missed: `cardAbilitiesClient.ts` calls `devLog("cardAbilities", …)` per the *duplicate first* mirror of `cardTypesClient.ts`, but the closed `Category` union in `devLog.ts` lacked the `"cardAbilities"` member, so the client did not compile under `vue-tsc`. WP-086 (commit `ccc6d0e`) hit the identical situation when `"cardTypes"` was added; it shipped as an audit-trail-after-the-fact extension. EC-127 chose the cleaner option-2 path — amend the contract before execution rather than retro-document — so the §0 numbers mechanically match the actual diff at session close. The amendment is recorded inline in EC-127 §0, mirrored in WP-125, and locked under D-12501. **Six production files (three new + three modified):** `data/metadata/card-abilities.json` (new — ten starter entries with kebab-case slugs and case-insensitive default flags; uploaded to R2 prior to execution), `packages/registry/src/schema.ts` (modified — additions only after the card-types block; existing exports byte-identical), `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` (new — singleton `getCardAbilities` fetcher mirroring `cardTypesClient.ts` line-for-line plus pure `buildAbilityTagIndex` helper that compiles each matcher's regex once and returns `Map<card.key, Set<effectSlug>>`), `apps/registry-viewer/src/components/AbilityEffectFilter.vue` (new — chip-toggle ribbon SFC with locked prop / v-model / event contract; `v-if="taxonomy.length > 0"` on the outer wrapper enforces degraded-mode invisibility; scoped CSS uses the same dark-theme tokens as `.type-group-btn`), `apps/registry-viewer/src/App.vue` (modified — three new imports, three new top-level refs, one new `getCardAbilities` await + `buildAbilityTagIndex` call inside `onMounted`, one modified `applyFilters()` body that applies the abilities filter as a post-step on the `applyQuery()` result with OR semantics, one extended `clearAllFilters()` that resets `selectedEffectSlugs`, one new `<AbilityEffectFilter>` mount between the type-bar and set-pills with `@update:selectedEffectSlugs="applyFilters"`), `apps/registry-viewer/src/lib/devLog.ts` (modified under the §0 amendment — single `"cardAbilities"` member appended to the closed `Category` union; mechanical dependency of `cardAbilitiesClient.ts`; WP-086 commit `ccc6d0e` is the precedent for the parallel `"cardTypes"` extension; one `// why:` clause cites the §0 amendment + D-12501). Plus six governance files: `WP-125-*.md`, `EC-127-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12501, `STATUS.md` (this entry). Total staged set: exactly 12 files (EC-127 §0(B) compliance, post-amendment). **Duplicate-first lock (extended):** `cardAbilitiesClient.ts` is structurally a copy of `cardTypesClient.ts` — same singleton + `devLog` start / failed / complete events, same HTTP `!response.ok` empty-array fallback, same `safeParse` with dot-joined-path warning, same terminal `try/catch` swallow, same `[CardAbilities] Rejected …` warning shape. Differences: ability-prefixed names, the post-parse duplicate-slug filter (parallel to cardTypes' orphan-parentType filter), and the additional `buildAbilityTagIndex` pure helper (justified by per-card derived form not present in card-types). **`cardTypesClient.ts` is byte-identical pre- and post-WP-125.** With two parallel taxonomy fetchers in the codebase, any future abstraction is deferred to a third taxonomy fetcher per D-12501. All twelve required `// why:` clauses present (schema-block header; six in `cardAbilitiesClient.ts`: module-header / schema-subpath import / matcher-flags default / regex-compilation site / duplicate-slug post-parse filter / `try/catch` swallow; one in `AbilityEffectFilter.vue` module header; three in `App.vue`: `getCardAbilities` call site / `buildAbilityTagIndex` call site / post-`applyQuery()` filter step; one in `devLog.ts` covering the Category-union extension under the §0 amendment). **Verification.** `pnpm --filter registry-viewer build` exits 0 (96 modules, 213.03 kB JS / 40.35 kB CSS, gzip 64.70 kB / 6.97 kB; pre-packet baseline 92 modules / 208.45 kB / 39.21 kB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter @legendary-arena/registry test` 31/3/0 — green. `pnpm --filter registry-viewer test` reports `tests 31 / suites 6 / pass 31 / fail 0` — UNCHANGED from pre-session baseline (no tests added per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 viewer-side precedent — the registry-viewer has no Vue component-test harness at baseline; verification is build + typecheck + manual smoke). All §After Completing verification gates pass: exactly one match each for `CardAbilityMatcherSchema = z.object`, `CardAbilityEntrySchema = z.object`, `CardAbilitiesIndexSchema = z.array`, `z.literal("regex")`, `CardTypeEntrySchema = z.object` (existing schema byte-identical), `export function getCardAbilities`, `export function buildAbilityTagIndex`, `<AbilityEffectFilter`, `import AbilityEffectFilter`, `import { getCardAbilities, buildAbilityTagIndex }`, `buildAbilityTagIndex(`; at least one match for `@legendary-arena/registry/schema` in `cardAbilitiesClient.ts`, `v-if="taxonomy.length > 0"` in `AbilityEffectFilter.vue`, `"cardAbilities"` in `devLog.ts`; exactly one match for each of the ten starter slugs in `card-abilities.json`. One-shot schema-parse `node -e` smoke exits 0 with stdout `OK: 10 entries, all slugs unique, all matchers valid regex`. `git diff` against `cardTypesClient.ts`, `data/metadata/card-types.json`, `keywords-full.json`, `rules-full.json`, `sets.json`, `apps/registry-viewer/src/registry/`, `packages/registry/src/shared.ts`, `packages/registry/src/impl/`, `packages/registry/src/registry.smoke.test.ts`, both `package.json` files all empty. Manual smoke confirmed 2026-05-01 on local dev server: ten chips visible between type-bar and set-pills with badge counts (Draw 285, KO from hand 47, KO from discard 14, KO from hand or discard 46, Rescue Bystander 92, Gain Attack 560, Gain Recruit 186, Gain Piercing 4, Gain Wound 51, Defeat Villain 56); selecting "Draw a card" narrows 2875 → 285; adding "KO from hand" widens to 326 (OR within abilities filter, with overlap); changing the hero-class select to `tech` narrows to 63 (AND with other filters); clearing chips restores 2875; no Vue warnings, no console errors. One DECISIONS entry: D-12501 (locked taxonomy file path, schema names, matcher single-literal lock, slug regex `/^[a-z][a-z0-9-]*$/`, initial ten-entry baseline, `.strict()` discipline, narrow-subpath import binding, `devLog.ts` Category-union extension under the §0 pre-execution amendment; cites WP-086 D-8601 / D-1203 and *duplicate first* as precedents). 01.5 NOT INVOKED (zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hook). 01.6 post-mortem OPTIONAL per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 viewer-side precedent — not authored this session (no new contract surface beyond the registry schema additions, no new long-lived abstraction, no new code subdirectory). §17 Vision Alignment: §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved and advanced; NG-1..NG-7 not crossed. §20 Funding Surface Gate: N/A — registry-viewer abilities filter; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected; R2 is a static file host, not an `apps/server` route). Pre-merge R2 upload precondition: `data/metadata/card-abilities.json` was uploaded to `https://images.barefootbetters.com/metadata/card-abilities.json` prior to execution; the dev server fetched it successfully and the chip ribbon rendered all ten chips with non-trivial badge counts. Dependencies: WP-086 / D-8601 (card-types taxonomy reintroduction shape — hard); WP-082 / WP-083 (singleton + `safeParse`-at-the-boundary precedent at one remove — soft); WP-122 / WP-123 (per-FlatCard `abilities: string[]` invariant — soft); compatible with WP-124 (themes-view zoom slider; disjoint surfaces). Commit prefix `EC-127:` at execution (never `WP-125:` per `01.3-commit-hygiene-under-ec-mode.md`). See [WP-125-registry-viewer-card-abilities-effect-filter.md](WP-125-registry-viewer-card-abilities-effect-filter.md) + [EC-127-registry-viewer-card-abilities-effect-filter.checklist.md](../execution-checklists/EC-127-registry-viewer-card-abilities-effect-filter.checklist.md).

- [x] WP-124 — Registry Viewer: Theme Zoom Slider — **Done 2026-05-01 (Commit A `078e234` `EC-126:`).** Drafted 2026-05-01; lint-gate self-review PASS; EC-126 drafted (next free EC slot after EC-125 closed WP-123 on 2026-05-01; EC-119 reserved for WP-115; per the locked precedent — EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122, EC-123, EC-124, EC-125 — the WP-keyed EC retargets to EC-126; WP number unchanged). Adds a keyboard-accessible "Theme Size" slider to the themes-view filter bar of the registry viewer at `cards.barefootbetters.com`, parallel to WP-121's cards-side Card Size slider. Slider value (column min-width in px, range 80–260, default **150**, step 10) drives a single `--theme-grid-min-width` CSS variable on `ThemeGrid.vue`'s `.grid` element; the existing `aspect-ratio: 3/4` rule on `.img-wrap` propagates width changes to height proportionally, so no per-tile recalculation is needed. Persisted to `localStorage['themeGridSize']` via a new module-scoped `useThemeSize` composable that mirrors `useCardSize.ts` (WP-121 / D-12101) line-for-line with theme-prefixed names. **Default asymmetry (intentional, locked under D-12401):** cards default to `130` (D-12101); themes default to `150` (D-12401) — each default matches its view's pre-packet `minmax(...)` literal (`CardGrid.vue` ships `130`, `ThemeGrid.vue` ships `150`) so a zero-config first run is visually identical to the pre-packet baseline on either view. **Four production files (two new + two modified):** `apps/registry-viewer/src/composables/useThemeSize.ts` (new — exposes `{ themeSize, setThemeSize }` plus the four locked range constants `MIN_THEME_WIDTH_PX = 80`, `MAX_THEME_WIDTH_PX = 260`, `DEFAULT_THEME_WIDTH_PX = 150`, `THEME_WIDTH_STEP_PX = 10`), `apps/registry-viewer/src/components/ThemeSizeSlider.vue` (new — native `<input type="range">` mounted in the themes-view filter bar between the search input and the count span), `apps/registry-viewer/src/components/ThemeGrid.vue` (modified — binds `--theme-grid-min-width` on `.grid`; column-track rule rewritten to `repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr))` with literal `150px` fallback preserving pre-packet behavior if the inline style is dropped), `apps/registry-viewer/src/App.vue` (modified — imports `ThemeSizeSlider`, mounts it inside the themes-view filter bar between the search `<input>` and the count `<span>`). Plus six governance files: `WP-124-*.md`, `EC-126-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12401, `STATUS.md` (this entry). Total staged set across both commits: exactly 10 files (EC-126 §0(B) compliance). **Duplicate-first lock:** `apps/registry-viewer/src/composables/useCardSize.ts` and `apps/registry-viewer/src/components/CardSizeSlider.vue` are byte-identical pre- and post-WP-124 — per `.claude/rules/code-style.md §"Abstraction & Control Flow"` the cards-side files are NOT parameterized, NOT refactored into a shared base, NOT altered. Two copies in the codebase post-WP-124; any future abstraction is deferred to a third zoom-slider WP per D-12401. All eight required `// why:` clauses present (storage-key convention, range constants legibility-floor / viewport-reflow / default / step rationale, narrowing block, self-heal write-back, swallowed `setItem` failure, `useThemeSize` import grid-side, `:style` binding CSS-driven scaling rationale, `ThemeSizeSlider.vue` module-header JSDoc). **Verification.** `pnpm --filter registry-viewer build` exits 0 (92 modules, 208.45 kB JS / 39.21 kB CSS, gzip 63.37 kB / 6.85 kB; pre-packet: 88 modules / 207.44 kB / 38.77 kB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` reports `tests 31 / suites 6 / pass 31 / fail 0` — UNCHANGED from pre-session baseline (no tests added per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 viewer-side precedent — the registry-viewer has no Vue component-test harness at baseline; verification is build + typecheck + manual smoke). All §10 verification gates pass. `git diff apps/registry-viewer/src/composables/useCardSize.ts`, `git diff apps/registry-viewer/src/components/CardSizeSlider.vue`, `git diff apps/registry-viewer/src/components/CardGrid.vue`, `git diff apps/registry-viewer/package.json`, `git diff packages/registry/`, `git diff packages/game-engine/`, `git diff apps/server/`, `git diff apps/arena-client/`, `git diff data/` all empty. Manual smoke confirmed 2026-05-01 on the local dev server: slider visible in the themes-view filter bar between the search input and the count span; movement at all values 80 / 150 / 220 / 260 scales theme tiles in real time (computed first-tile width 86 / 183 / 220 / 260 px respectively, 68 tiles stable at every position); reload preserves chosen size (180 → reload → 180); `localStorage['themeGridSize']` and `localStorage['cardGridSize']` are independent (cards-side untouched at 130 throughout); theme search filter (`marvel` → 6 results) preserved across slider movement at value 120; no Vue warnings, no console errors, no duplicate-key warnings during slider movement or tab switching. One DECISIONS entry: D-12401 (locked range, default `150`, storage key `themeGridSize`, CSS variable `--theme-grid-min-width`, composable name `useThemeSize`, *duplicate first* citation, explicit deferral of any future abstraction to a third-zoom-slider WP, explicit acknowledgment of the cards-vs-themes default asymmetry). 01.5 NOT INVOKED (no engine state — zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hook). 01.6 post-mortem OPTIONAL per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 viewer-side precedent — not authored this session (no new contract surface, no new long-lived abstraction, no new code subdirectory, no new projection seam). §17 Vision Alignment: §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved; NG-1..NG-7 not crossed. §20 Funding Surface Gate: N/A — registry-viewer UI affordance; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected). Dependencies: WP-121 / D-12101 (composable + slider shape — hard); WP-091 (`ThemeGrid.vue` `minmax(150px, 1fr)` baseline — hard); WP-066 (composable narrowing + self-heal + swallow precedent — soft). Commit prefix `EC-126:` at execution. See [WP-124-registry-viewer-theme-zoom-slider.md](WP-124-registry-viewer-theme-zoom-slider.md) + [EC-126-registry-viewer-theme-zoom-slider.checklist.md](../execution-checklists/EC-126-registry-viewer-theme-zoom-slider.checklist.md).

- [x] WP-123 — Viewer cardType Widening and `set.other[]` Dispatch — **Done 2026-05-01 (Commit A `fbb5174` `EC-125:`).** Drafted 2026-05-01; lint-gate self-review PASS (§1–§21 audited; §10 / §11 / §19 / §20 / §21 marked N/A with explicit justifications); EC-125 drafted (next free EC slot after EC-124 was claimed by the ad-hoc viewer henchman per-card emission work; EC-119 reserved for WP-115; EC-121 reserved for the unmerged WP-120 Loadout Preview branch per the EC-122 retarget breadcrumb; per the locked precedent EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122, EC-123, EC-124, the WP-keyed EC retargets to EC-125 — WP number unchanged). Closes the Phase 1 type-projection drift surfaced by WP-086 and wires the viewer-local `flattenSet()` `// Other` block to dispatch on `entry.cardType`. Two coupled changes at the type/contract layer: `FlatCard.cardType` widened from the 9-value string union to plain `string` at `apps/registry-viewer/src/registry/types/types-index.ts:37` (the derived `FlatCardType = FlatCard["cardType"]` alias resolves to `string` automatically); `CardQuerySchema.cardType` and `.cardTypes` widened from `z.enum([...])` to `z.string().optional()` and `z.array(z.string()).optional()` at `apps/registry-viewer/src/registry/schema.ts:123–124` (mirroring the data-side per-card `cardType` widening already shipped by WP-086 at `packages/registry/src/schema.ts:174`). The `// Other` block in `apps/registry-viewer/src/registry/shared.ts` is rewritten wholesale to read each `set.other[]` entry's `cardType` field (with an `"other"` fallback when absent) and use it for both the FlatCard's `cardType` value and the locked key shape `${abbr}-${cardType}-${slug}`. Required five-clause `// why:` block (a)–(e) sits immediately above the rewritten loop, documenting dispatch rationale, fallback-to-`"other"` byte-identity for legacy entries, WP-086 §Out of Scope Phase 2 wire-through citation, D-12301 citation, and scope reference WP-123 / EC-125. Three `as unknown as FlatCardType[]` casts removed from `apps/registry-viewer/src/registry/shared.test.ts` lines 54 / 60 / 73 (no longer needed once `FlatCardType` widens to `string`); explanatory `// why:` comment block at lines 49–53 removed; test bodies and `assert.equal(result.length, 0)` outcomes preserved verbatim because the underlying fixture has no `set.other[]` entries with Phase 2 cardTypes. New `describe("flattenSet other-block cardType dispatch (WP-123)", …)` block appended after the existing `flattenSet henchman emission (WP-122)` describe block with the mandatory three `it` cases plus the recommended optional fourth (empty-array regression baseline). **Four production files (three modified production + one modified test):** `apps/registry-viewer/src/registry/types/types-index.ts` (modified — single-line widening at line 37; JSDoc at line 35 preserved), `apps/registry-viewer/src/registry/schema.ts` (modified — two-line widening at lines 123–124), `apps/registry-viewer/src/registry/shared.ts` (modified — `// Other` block rewritten with five-clause `// why:` block; all other blocks byte-identical pre- and post-execution), `apps/registry-viewer/src/registry/shared.test.ts` (modified — cast removal + new describe block; the `flattenSet henchman emission (WP-122)` describe block including the EC-124 fifth case is byte-identical pre- and post-execution). Plus six governance files: `WP-123-*.md`, `EC-125-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12301, `STATUS.md` (this entry). Total staged set across both commits: exactly 10 files (EC-125 §0(B) compliance). `packages/registry/src/shared.ts` is **unchanged** — that copy does not iterate `set.other[]` at all (it emits only `hero` / `mastermind` / `villain` / `scheme` literals — narrow subsets of the widened type) and needs no parallel fix; this is a viewer-local divergence, intentional and isolated. `packages/registry/src/types/index.ts:57` (engine-side legacy `FlatCard.cardType` 4-value union) and `apps/registry-viewer/src/registry/types/index.ts:37` (viewer-side legacy `FlatCard.cardType` 4-value union, unused at runtime, EC-102 inheritance) are intentionally NOT widened — see D-12301 paragraph documenting the three-FlatCard-types-coexist state and deferring legacy-type cleanup to a future EC-102-style consolidation WP. The forward-pointing `// why:` comment at `App.vue:113–118` and the cast at `App.vue:348` are preserved verbatim per RS-1 — they go loosely stale post-WP-123 but remain internally consistent as forward-pointing narrative; full cleanup deferred to the same future WP. **Verification.** `pnpm --filter registry-viewer build` exits 0 (88 modules, ~207.44 kB JS / 38.77 kB CSS, gzip 63.15 kB / 6.81 kB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` 27/5/0 → **31/6/0** (+4 tests / +1 suite / 0 fail; recommended optional fourth case included). All §10 verification gates pass: zero `for (const o of set\.other)` matches, exactly one `for (const entry of set\.other)` match, exactly one `${abbr}-${cardType}-${slug}` match, zero hardcoded `cardType: "other"` matches, exactly one `cardType:  string;` match in `types-index.ts`, zero `"hero" | "mastermind"` matches there, exactly one `cardType: z.string().optional()` and one `cardTypes: z.array(z.string()).optional()` match in `schema.ts`, zero `as unknown as FlatCardType[]` matches in `shared.test.ts`, at least one match for the new describe block title. `git diff packages/registry/src/shared.ts`, `git diff packages/registry/src/schema.ts`, `git diff packages/registry/src/types/index.ts`, `git diff apps/registry-viewer/src/registry/types/index.ts`, `git diff apps/registry-viewer/src/App.vue`, `git diff apps/registry-viewer/src/components/LoadoutBuilder.vue`, `git diff apps/registry-viewer/package.json` all empty. One DECISIONS entry: D-12301 (locked widening direction `string`, locked key shape `${abbr}-${cardType}-${slug}`, locked fallback string `"other"`, divergence rationale from `packages/registry/src/shared.ts`, citation of WP-086 §Out of Scope Phase 2 deferral, plus a paragraph documenting the three-FlatCard-types-coexist state). 01.5 NOT INVOKED (zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hook). 01.6 post-mortem OPTIONAL per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 viewer-side precedent — not authored this session (no new contract surface, no new long-lived abstraction, no new code subdirectory, no new projection seam — the dispatch IS the existing `// Other` projection seam, refined). §17 Vision Alignment: §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved; NG-1..NG-7 not crossed. §20 Funding Surface Gate: N/A — registry-viewer type-projection alignment + dispatch wire-through; no UI surfaces added, no user-visible copy added, no funding channels referenced. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected). Manual smoke optional (not gated) — `set.other[]` is empty across all 40 sets so the dispatch emits zero records under current data; pills Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer / shield-trooper / Other still produce zero cards (no upstream data yet — expected). Phase 2 data authoring (separate operator/upstream task) is the long-pole; this WP makes it possible without further viewer changes. Dependencies: WP-086 (Phase 1 — taxonomy + per-card schema widening + ribbon — hard); WP-003 (`FlatCard` type — hard); WP-122 (viewer-local divergent copy of `flattenSet` precedent — soft). Commit prefix `EC-125:` at execution. See [WP-123-viewer-cardtype-widening-and-other-dispatch.md](WP-123-viewer-cardtype-widening-and-other-dispatch.md) + [EC-125-viewer-cardtype-widening-and-other-dispatch.checklist.md](../execution-checklists/EC-125-viewer-cardtype-widening-and-other-dispatch.checklist.md).

- [x] WP-122 — Viewer Henchman flattenSet Emission Fix — **Done 2026-05-01 (Commit A `a5c1653` `EC-123:`).** Drafted 2026-05-01; lint-gate self-review PASS (§1–§21 audited; §10 / §11 / §18 / §19 / §20 / §21 marked N/A with explicit justifications); EC-123 drafted (EC-121 → EC-122 collision precedent preserved per the EC numbering history — EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122; WP-122 retargets to EC-123 as the next free slot); manual smoke confirmed 2026-05-01 (Henchman ribbon pill on the local dev server now surfaces 46 henchman cards across the eagerly-loaded sets — was 0 pre-fix; the +44 floor is the conservative production minimum). Replaces a silent-zero-emission bug in the viewer-local `flattenSet()` at `apps/registry-viewer/src/registry/shared.ts`. The prior implementation expected a nested `cards` sub-array per henchman group and iterated it, but the actual data shape across all 40 sets in `data/cards/*.json` is a flat object per henchman group (`{ id, name, slug, imageUrl, abilities, vAttack, vp }` with no `cards` array — verified 2026-05-01: 44 henchman entries, zero with nested `cards`). The inner loop iterated zero times, dropping all 44 henchmen from the registry-viewer search index and leaving the `Henchman` ribbon pill empty after WP-086 made the bug user-visible. Replaces the broken nested iteration with a flat treatment that mirrors the bystanders/wounds blocks already present in the same file: one `FlatCard` per henchman group, locked key shape `${abbr}-henchman-${slug}` (one segment after `henchman-`, matching bystanders/wounds), `cardType: "henchman"` literal, only the flat `imageUrl` field surfaced (class-keyed image map carried by `amwp/tardigrade` and `wtif/ultron-sentries` is intentionally ignored — surfacing it requires `FlatCard` widening + paired UI changes, deferred to a future WP per D-12201). Required seven-clause `// why:` block (a–g) immediately above the rewritten loop documents the data-shape mismatch, parallel-to-bystanders/wounds rationale, divergence-from-`packages/registry` rationale, D-12201 citation, scope reference, one-record-per-group rationale, and class-keyed-art deferral. **Two production files (one modified + one modified test):** `apps/registry-viewer/src/registry/shared.ts` (modified — henchmen block rewritten wholesale; all other blocks byte-identical pre- and post-execution), `apps/registry-viewer/src/registry/shared.test.ts` (modified — appends a `flattenSet henchman emission (WP-122)` describe block with four `it` cases — the mandatory three plus the recommended optional fourth pinning the flat-`imageUrl`-only projection contract by test). Plus six governance files: `WP-122-*.md`, `EC-123-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12201, `STATUS.md` (this entry). Total staged set across both commits: exactly 8 files (EC-123 §0(B) compliance). `packages/registry/src/shared.ts` is **unchanged** — that copy does not iterate henchmen at all (it emits only hero / mastermind / villain / scheme cards) and needs no parallel fix; this is a viewer-local divergence, intentional and isolated. **Verification.** `pnpm --filter registry-viewer build` exits 0 (88 modules, 207 KB JS / 38.77 KB CSS, gzip 63.11 KB / 6.81 KB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` 22/4/0 → **26/5/0** (+4 tests / +1 suite / 0 fail). All §10 verification gates pass: zero `for (const card of hmCards)` matches, exactly one `for (const henchman of set.henchmen)` match, zero `imageUrlByClass` matches in `shared.ts` (clause (g) reworded to refer to "the class-keyed image map" without naming the literal field — the deferral rationale is preserved without the gate-tripping token), at least one `-henchman-` match (proves the new key shape emits at the push site). `git diff packages/registry/src/shared.ts` empty; `git diff packages/registry/src/schema.ts` empty; `git diff apps/registry-viewer/src/registry/schema.ts` empty; `git diff apps/registry-viewer/package.json` empty. One DECISIONS entry: D-12201 (locked key format `${abbr}-henchman-${slug}`, locked test minimum `N ≥ 3` with recommended fourth, divergence rationale from `packages/registry/src/shared.ts`, `imageUrlByClass` deferred to a future `FlatCard`-widening WP). 01.5 NOT INVOKED (zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hook). 01.6 post-mortem OPTIONAL per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 viewer-side bug-fix precedent — not authored this session (no new contract surface, no new long-lived abstraction, no new code subdirectory). §17 Vision Alignment: §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) restored; NG-1..NG-7 not crossed. §20 Funding Surface Gate: N/A — registry-viewer correctness fix; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected). Dependencies: WP-003 (FlatCard type — hard); WP-086 (viewer `node:test` runner + `tsx` devDep + first describe block — hard); WP-094 (viewer-local divergent copy of `flattenSet` precedent — soft). Commit prefix `EC-123:` at execution. See [WP-122-viewer-henchman-flattenset-emission-fix.md](WP-122-viewer-henchman-flattenset-emission-fix.md) + [EC-123-viewer-henchman-flattenset-emission-fix.checklist.md](../execution-checklists/EC-123-viewer-henchman-flattenset-emission-fix.checklist.md).

- [x] WP-121 — Registry Viewer: Card Zoom Slider — **Done 2026-05-01 (Commit A `e3c6af7` `EC-122:`).** Drafted 2026-05-01; lint-gate self-review PASS (§1–§21 audited; §10 / §11 / §12 / §18 / §19 / §21 marked N/A with explicit justifications); EC-122 drafted (EC-120 / EC-121 collision breadcrumb preserved per the EC numbering precedent — EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115); manual smoke confirmed 2026-05-01. Adds a keyboard-accessible "Card Size" slider to the cards-view filter bar of the registry viewer at `cards.barefootbetters.com`. Slider value (column min-width in px, range 80–260, default 130, step 10) drives a single `--card-grid-min-width` CSS variable on `CardGrid.vue`'s `.grid` element; the existing `aspect-ratio: 3/4` rule on `.img-wrap` propagates width changes to height proportionally, so no per-card recalculation is needed. Persisted to `localStorage['cardGridSize']` via a new module-scoped `useCardSize` composable that mirrors the WP-066 `useCardViewMode` shape line-for-line (storage key constant + narrowing + self-heal write-back + swallowed `setItem` failure). Four production files (two new + two modified): `apps/registry-viewer/src/composables/useCardSize.ts` (new — exposes `{ cardSize, setCardSize }` plus the four locked range constants), `apps/registry-viewer/src/components/CardSizeSlider.vue` (new — native `<input type="range">` mounted in the cards-view filter bar between the hero-class select and the count span), `apps/registry-viewer/src/components/CardGrid.vue` (modified — binds `--card-grid-min-width` on `.grid`; column-track rule rewritten to `repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr))` with literal `130px` fallback preserving pre-packet behavior if the inline style is dropped), `apps/registry-viewer/src/App.vue` (modified — imports `CardSizeSlider`, mounts it inside the cards-view filter bar). Default value matches the existing production `minmax(130px, 1fr)` exactly so a zero-config first run is visually identical to the pre-packet baseline. Sequencing note: WP-120 (Loadout Preview Round-Trip Fix on branch `wp-120-loadout-preview-roundtrip-fix`, Commit A `05d5ded`) also touches `App.vue` but in a different region (hoisted `useLoadoutDraft` + `onPreviewRequestEdit` handler); merge order is not load-bearing. **Verification.** `pnpm --filter registry-viewer build` exits 0; `pnpm --filter registry-viewer typecheck` exits 0; `pnpm --filter registry-viewer test` 22/4/0 unchanged; `pnpm --filter registry-viewer lint` 0 errors / 263 warnings (vs 260 baseline; +3 stylistic warnings, of which one is a `<input>` self-closing on `CardSizeSlider.vue:50` matching the pattern accepted on `GlossaryPanel.vue:111` and `App.vue:511`). One DECISIONS entry: D-12101 (locked range, default, storage key, CSS variable name). 01.5 NOT INVOKED (no engine state). 01.6 post-mortem OPTIONAL per WP-066 / WP-094 / WP-096 / WP-114 viewer-side precedent. §17 Vision Alignment: §10a (Registry Viewer public surface) — preserved; NG-1..NG-7 not crossed. §20 Funding Surface Gate: N/A — no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link. §21 API Catalog: N/A (no HTTP endpoint touched). Dependencies: WP-066 (composable shape), WP-003 (FlatCard), WP-096 (sibling grid behavior — soft-dep), WP-114 (compatible — sibling). Commit prefix `EC-122:` at execution. See [WP-121-registry-viewer-card-zoom-slider.md](WP-121-registry-viewer-card-zoom-slider.md) + [EC-122-registry-viewer-card-zoom-slider.checklist.md](../execution-checklists/EC-122-registry-viewer-card-zoom-slider.checklist.md).

- [x] WP-113 — Engine-Server Registry Wiring + Match-Setup Validator / Builder ID Alignment — **Done 2026-04-27.** Drafted + EC-113 + pre-flight READY TO EXECUTE 2026-04-27; copilot check CONFIRM 2026-04-27. Closes the WP-100 smoke-test gap surfaced 2026-04-27 (silent empty-deck failure traced to missing `setRegistryForSetup` call in server startup, compounded by validator/builder ID-format mismatch). Two coupled root causes; one cohesive fix. Mid-execution amendment per D-3103 precedent: PS-7 internal-iterator update set extended to include `economy/economy.logic.ts` `buildCardStats()`; hard-cap raised 16 → 17 inline (the WP §Mid-Execution Amendment block enumerates the fact). D-10014 entry created at Commit B governance close. **Set-qualified ID format LOCKED:** all five entity-ID fields on `MatchSetupConfig` use `<setAbbr>/<slug>`; bare slugs, display names, and flat-card keys ALL rejected. Engine `524 / 116 / 0 → 570 / 126 / 0` (+46 tests, +10 suites — exceeds the +35 floor); server `47 / 7 / 0 → 51 / 8 / 0` (+4 tests, +1 suite — wiring-ordering invariant + import contract); arena-client `182 / 17 / 0` UNCHANGED. PS-8 collision-probe re-measurement at session start: hero **51/307 instances collide** (279 unique slugs), mastermind **6/106** (103 unique), villain group **4/126** (124 unique), scheme **4/191** (189 unique), henchman group **0/44** (no collisions). The hero collision count alone makes bare-slug ambiguity non-hypothetical. 01.5 NOT INVOKED (no new `LegendaryGameState` field, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hook). 01.6 post-mortem mandatory at `docs/ai/post-mortems/01.6-WP-113-engine-server-registry-wiring-and-validator-alignment.md` (three triggers: new contract surface — slug-set helpers + Class A/B + `CardRegistryReader` widening; new code seam — server registry wiring; new long-lived abstraction — orchestration-side setup-diagnostic surfacing pattern). See [WP-113-engine-server-registry-wiring-and-validator-alignment.md](WP-113-engine-server-registry-wiring-and-validator-alignment.md) + [EC-113-engine-server-registry-wiring-and-validator-alignment.checklist.md](../execution-checklists/EC-113-engine-server-registry-wiring-and-validator-alignment.checklist.md) + D-10014.

- [x] WP-111 — UIState Card Display Projection (Engine-Side) — **Done 2026-04-29** (Commit A `f842f71` `EC-118:`). Drafted 2026-04-26; pre-flight 2026-04-29 verdict `DO NOT EXECUTE YET` first pass → `READY TO EXECUTE` re-verdict after PS-1..PS-10 + PS-12 landed in WP-111 + EC-118 in-place; copilot-check disposition `CONFIRM`. Closes WP-100 D-10004 deferral. Engine-side projection of card display data (`name`, `imageUrl`, `cost: number | null`) into UIState as additive `display` fields on `UICityCard` / `UIMastermindState`, optional parallel `slotDisplay?` on `UIHQState` (PS-6 fallback per Q3 written audit — `slots: (string | null)[]` preserved verbatim), and optional parallel `handDisplay?` on `UIPlayerState`. Sibling snapshot to `G.cardStats` / `G.villainDeckCardTypes` / `G.cardKeywords`; `G.cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>` is built once at setup, read only by `uiState.build.ts`, never read by gameplay (presentation-vs-gameplay separation lock, grep-enforced). Engine baseline `570 / 126 / 0` → **`604 / 132 / 0`** (+34 tests / +6 suites / 0 fail). Full monorepo `pnpm -r build` exits 0. No off-engine package modified. **9-file allowlist held + 1 file under 01.5** (`replay/replay.execute.test.ts:PRE_WP080_HASH` literal updated `'ba921e90'` → `'46f7863c'` because adding `cardDisplayData` to `LegendaryGameState` legitimately changes the JSON-encoded structure hash; value-only literal update with `// why:` comment citing 01.5 §Allowed Modifications and pre-flight authorization; no new behavior). 01.5 IS INVOKED (additive G-shape change). 01.6 post-mortem MANDATORY at `docs/ai/post-mortems/01.6-WP-111-uistate-card-display-projection.md` (three triggers: new long-lived abstraction `G.cardDisplayData`; new contract surface `UICardDisplay` / `UIHQCard`; new projection seam fields). Six new D-NNNN entries land at Commit B: D-11101 (sibling-snapshot rationale), D-11102 (`handDisplay` parallel-array), D-11103 (`slotDisplay` parallel-array + Q3 audit), D-11104 (`parseCostNullable` guard not parser, PS-4), D-11105 (`UNKNOWN_DISPLAY_PLACEHOLDER` setup-time-diagnostic + projection-purity citing D-2801, PS-8), D-11106 (deferred-card-types scope). PS-8 critical correction relocated the missing-display-entry diagnostic from projection time to setup time, preserving WP-028 D-2801 projection-purity contract (`buildUIState` MUST NOT mutate `G.messages`); the `auditCardDisplayDataCompleteness` helper at `buildInitialGameState.ts` mirrors WP-113 D-10014 single-detection-seam pattern. PS-4 locked `parseCostNullable` as a single-line guard around the canonical `parseCardStatValue` (NOT a parallel parser) — preserves the `null/undefined → null` ("registry says no cost") vs `0 → 0` ("free") UX distinction. PS-5 locked the mastermind display join to `gameState.mastermind.baseCardId`. PS-6 fallback locked `UIHQState.slots` shape preservation after Q3 written consumer audit. Vision trailer on Commit A: `Vision: §1, §2, §3, §10, §11, §22`. Hard-deps: WP-089 (engine playerView wiring); WP-018 (`G.cardStats` precedent + `parseCardStatValue` canonical parser); WP-014A/B (`G.villainDeckCardTypes` precedent); WP-100 (D-10004 deferral closer); WP-113 (set-qualified `<setAbbr>/<slug>` ID format). See [WP-111-uistate-card-display-projection.md](WP-111-uistate-card-display-projection.md) + [EC-118-uistate-card-display-projection.checklist.md](../execution-checklists/EC-118-uistate-card-display-projection.checklist.md) + [01.6-WP-111-uistate-card-display-projection.md](../post-mortems/01.6-WP-111-uistate-card-display-projection.md) + D-11101 + D-11102 + D-11103 + D-11104 + D-11105 + D-11106.

- [x] WP-086 — Registry Viewer Card-Types Upgrade — **Done 2026-04-29** (Commit A `ccc6d0e` `EC-086:`). Drafted 2026-04-28; lint-gate self-review **PASS**; EC-086 drafted; pre-flight + 01.7 copilot check at `docs/ai/invocations/preflight-wp086.md`. Re-adds `data/metadata/card-types.json` (deleted under WP-084 at `b250bf1` 2026-04-21) with a runtime consumer (ribbon button generator + per-card `cardType` validation), satisfying WP-084's deletion constraint per the deletion-then-readd narrative. **Phase 1 of a two-phase rollout:** ships the schema + viewer wiring + taxonomy file; Phase 2 (a follow-up WP) updates the upstream `modern-master-strike` generator to emit `cardType` per card and regenerates all 40 sets. Adds `Sidekick` and `S.H.I.E.L.D.` (with Agent / Officer / Trooper sub-chips) to the ribbon; removes the orphan `Location` button. Engine `packages/game-engine/**` untouched (Interpretation A — container shape preserved; Interpretation B "flatten containers" rejected per the locked design memo `project_wp086_queued.md` 2026-04-21). Eight-file scope (was seven; expanded under PS-2 Option B per `docs/ai/invocations/preflight-wp086.md` 2026-04-29): `data/metadata/card-types.json` (new, 13 entries) + `packages/registry/src/{schema,index}.ts` (modified — `CardTypeEntrySchema` `.strict()` + `CardType = string` alias + per-card `cardType` widened to `z.string().optional()`) + `apps/registry-viewer/src/lib/cardTypesClient.{ts,test.ts}` (new — singleton `.safeParse()` non-blocking fetcher mirroring `glossaryClient.ts`) + `apps/registry-viewer/src/App.vue` (modified — taxonomy-driven ribbon with `LEGACY_TYPE_GROUPS` fallback) + `apps/registry-viewer/src/registry/shared.test.ts` (new — Phase 1 zero-card invariant) + `apps/registry-viewer/package.json` (modified — adds `"test": "node --import tsx --test src/**/*.test.ts"` script + `"tsx": "^4.15.7"` devDep, byte-identical to `packages/registry/package.json` precedent; wires the first viewer-side `node:test` runner). One R2 operator step: upload `card-types.json` to `images.barefootbetters.com/metadata/`. No production-runtime npm dependency added (only the test-time `tsx` devDep). No persistence. No engine, server, arena-client, or pre-plan changes. Nine DECISIONS entries landed at Commit B (D-8601 re-add citing WP-084 deletion; D-8602 Interpretation A vs B; D-8603 per-card widening; D-8604 SHIELD parent-type modeling; D-8605 fallback preservation; D-8606 orphan `Location` removal; D-8607 viewer `node:test` harness via `tsx` mirroring registry precedent — PS-2 Option B; D-8608 mid-execution scope amendment for `devLog.ts` Category union widening + `debugMode.ts` node:test runtime safety — both required to make the EC's mandated code paths compile and load under the new test runner; D-8609 Option-C governance-close scope covering rules / 00.2 / `httpRegistry.ts` comment / `apps/registry-viewer/CLAUDE.md` doc-staleness sync). Unblocks WP-114.
  Dependencies: WP-084 (deletion baseline at `b250bf1`), WP-082 (`.strict()` schema + `.safeParse()` non-blocking precedent), WP-066 (`devLog` categorical signature + R2 publish workflow), WP-091 (`LoadoutBuilder.vue` stable on the same component tree).
  Execution Checklist: `docs/ai/execution-checklists/EC-086-registry-viewer-card-types-upgrade.checklist.md` (READY)
  Commit prefix: `EC-086:` at execution (never `WP-086:` per P6-36)
  See [WP-086-registry-viewer-card-types-upgrade.md](WP-086-registry-viewer-card-types-upgrade.md) + [EC-086-registry-viewer-card-types-upgrade.checklist.md](../execution-checklists/EC-086-registry-viewer-card-types-upgrade.checklist.md).

- [ ] WP-115 — Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap — **DRAFT v1.1 (2026-05-01).** Drafted 2026-04-29 (commit `bfdefe1`); refreshed 2026-05-01 with reviewer Patches 1–9 + two scope-neutral copilot-check follow-ups (PS-3 `02-CODE-CATEGORIES.md` clarification + Pool-log-message verbatim lock). Pre-flight + copilot check at `docs/ai/invocations/preflight-wp115.md` + `docs/ai/invocations/copilot-check-wp115.md` (gitignored scratchpads): pre-flight verdict initially **DO NOT EXECUTE YET** pending PS-1 (WP-054 merge) + PS-2 (this WORK_INDEX row); copilot-check disposition initially **SUSPEND** with two RISK fixes (Issue 13 unclassified directory + adjacent Pool-log message); resolution path is to land PS-1 (WP-054 cherry-pick from `wp-054-public-leaderboards-read-only` tip `f34e917`) + PS-2 (this row) + PS-3 + log-msg lock, then re-confirm pre-flight READY without full re-run. Adds three public, anonymous, read-only HTTP endpoints under `/api/leaderboards/*` (scenarios index, per-scenario score list, single-score detail) on the existing boardgame.io Koa router; introduces the long-lived `pg.Pool` singleton at `apps/server/src/db/database.ts` that future request-handler WPs (including the deferred WP-102 profile route per D-10202) require. **Six production files (three new + three modified) plus four governance ledgers — total 10 files at session close** per EC-119 v1.1 §After Completing scope lock. Hard-deps: WP-054 (library — must be cherry-picked first per the merge-state blocker), WP-051 (parGate), WP-053 / WP-053a / WP-052 / WP-103 / WP-004 / WP-118 (HTTP API Catalog — D-11804 update obligation triggered). **Locked under D-115NN at execution Commit B:** Pool location at `apps/server/src/db/`, Pool sizing (max 10 / idle 30s / connect 5s), rate-limit deferral, `Cache-Control: no-store` on every response (including 400/404/500 error paths per Patch 8), profile-route wiring still deferred (D-10202 reaffirmation), D-11804 replace-whole-row catalog semantics applied (transition 3 WP-054 `Library-only` rows → `Wired`; delete 3 `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows; net catalog delta −3 Pending / −3 Library-only / +3 Wired), Pool-construction log message verbatim lock (`'[server] pg.Pool constructed (max=10)'`). **v1.1 reviewer patches (2026-05-01) folded:** Patch 1 (Promise.all narrative — Pool construction is synchronous, not a parallel task), Patch 2 (engine baseline refresh `570/126/0` → `604/132/0`), Patch 3 (optional `leaderboardLogic?` test injection seam — sidesteps SQL-shape mocking), Patch 4 (path-param 400 validation for missing `:scenarioKey` / `:replayHash`), Patch 5 (array-value query policy — Koa `string[]` length===1 OK, else 400), Patch 6 (loosened suite-count locks to `pass/fail/skipped` only), Patch 7 (catalog row interpretation locked — single-row graduation), Patch 8 (Cache-Control on every response including error paths), Patch 9 (Pool-log enforceability downgrade + location lock + verbatim message text). 01.5 NOT INVOKED (no `LegendaryGameState` field, no `buildInitialGameState` shape change, no `LegendaryGame.moves` entry, no phase hook). 01.6 post-mortem MANDATORY (three triggers: new long-lived abstraction = `pg.Pool` singleton; new code seam = `apps/server/src/db/`; new contract surface = `LeaderboardLogic` injection seam). §17 Vision Alignment: §3 / §11 / §18 / §20 / §22 / §23 / §24 / §25 cited; NG-1..NG-7 not crossed (read-only over a non-monetized competitive surface; anonymous access; no time-pressure / FOMO / advertising / dark-pattern). §20 Funding Surface Gate: N/A — read-only transport adapter over a non-monetized competitive surface; no payment / donation / subscription / supporter-tier / tournament-funding surface introduced. §21 API Catalog: TRIGGERED (3 endpoints + 3 library-function status transitions per D-11804). Test expectation post-WP-054 cherry-pick `pass 56 / fail 0 / skipped 24`; post-WP-115 expected `pass 64 / fail 0 / skipped 24` (+8 tests / +1 suite delta is the load-bearing invariant; suite count informational per Patch 6). Commit prefix `EC-119:` at execution (never `WP-115:` per `01.3-commit-hygiene-under-ec-mode.md`). See [WP-115-public-leaderboard-http-endpoints.md](WP-115-public-leaderboard-http-endpoints.md) + [EC-119-public-leaderboard-http-endpoints.checklist.md](../execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md).

- [x] WP-114 — Registry Viewer URL-Parameterized Setup Preview ("Game of the Week") — **Done 2026-04-30** (Commit A `c059199` `EC-116:`). Drafted 2026-04-28; lint-gate self-review **PASS**; EC-116 executed; pre-flight + 01.7 copilot check at `docs/ai/invocations/preflight-wp114.md` resolved through PS-1/2/3 amendments landed pre-execution at `49e07ec` (PS-1 additive `export` of six `DEFAULT_*` constants in `useLoadoutDraft.ts`; PS-2 extended 16-mutator forbidden-mutator gate; PS-3 `pnpm --filter` package-name fix). **WP-086 hard-sequencing prerequisite satisfied 2026-04-29 at `ccc6d0e` (Commit A `EC-086:`)** — same component tree (`LoadoutBuilder.vue`, `App.vue`) was stable on `main` at execution start.
  Dependencies: WP-086 (hard sequencing — same component tree), WP-091 (`@legendary-arena/registry/setupContract` + `useLoadoutDraft.ts` defaults), WP-093 (`heroSelectionMode` envelope field, v1 enum `["GROUP_STANDARD"]`), WP-113 (set-qualified `<setAbbr>/<slug>` ID format LOCKED per D-10014).
  Notes: Adds a read-only URL-driven setup-preview surface to the public registry viewer so a curated MATCH-SETUP can be shared as a single link. Five composition fields are URL-bound using the canonical 9-field names verbatim (`schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`); the four count fields and all envelope fields are deliberately default-only (sourced from `useLoadoutDraft.ts` constants — no re-declaration). Reuses `validateMatchSetupDocument()` against the loaded `CardRegistry`; unknown ext_ids surface as non-fatal "Unknown ext_id: <value>" lines. New component `LoadoutPreview.vue` is read-only (imports only `loadFromJson` out of the 16-mutator `useLoadoutDraft` API, invoked exactly once on user-initiated "Edit this loadout" click). New "Copy Setup Link" button on `LoadoutBuilder.vue` serializes `draft.value.composition` back into the same URL shape with a clipboard-fallback `<input readonly>` reveal. App.vue auto-switches to the Loadout tab on first mount when URL params are present (one-shot — does not re-fire on subsequent user tab navigation). **Eight files landed (7 Commit A + the PS-1 pre-execution amendment in `49e07ec`):** Commit A `c059199` — `apps/registry-viewer/src/lib/setupUrlParams.ts` (new) + `.test.ts` (new, 9 tests), `apps/registry-viewer/src/composables/useSetupFromUrl.ts` (new) + `.test.ts` (new, 5 tests), `apps/registry-viewer/src/components/LoadoutPreview.vue` (new), `apps/registry-viewer/src/components/LoadoutBuilder.vue` (modified — Copy Setup Link button only), `apps/registry-viewer/src/App.vue` (modified — single `useSetupFromUrl(reg)` instantiation deferred to `onMounted`, mounts `<LoadoutPreview>` above `<LoadoutBuilder>`, applies one-shot auto-switch). PS-1 amendment at `49e07ec` (separate, pre-execution): additive `export` keyword on six `DEFAULT_*` constants in `useLoadoutDraft.ts` (no logic change, no signature change). No persistence (no `localStorage`, no `sessionStorage`, no IndexedDB, no cookies); no engine handoff; no server contact; no router library; no new npm dependency. URLSearchParams only. **Verification.** Registry test baseline `31 / 3 / 0` UNCHANGED. Viewer test count `8 / 2 / 0` → **`22 / 4 / 0`** (+9 setupUrlParams + +5 useSetupFromUrl). Viewer build / typecheck / lint all 0 errors (lint warnings 227 → 260, all stylistic in same vue/singleline-html-element + vue/attributes-order categories already accepted across the codebase). All §12.1 forbidden-import / forbidden-token greps return zero output. §12.2 composable-ownership greps: App.vue=1 `useSetupFromUrl(` match, LoadoutPreview.vue=0. §12.3 positive existence greps: "Loaded from URL"=1, "Copy Setup Link"=1 (button only), 6 PS-1 `^export const DEFAULT_*` matches, 17 canonical-key occurrences in setupUrlParams.ts. `git diff` against `packages/game-engine/`, `packages/preplan/`, `apps/server/`, `apps/arena-client/`, `packages/registry/` all empty. `useLoadoutDraft.ts` not re-modified in this session (PS-1 already at `49e07ec`). Manual smokes §14.1 (clipboard fallback) + §14.2 (one-shot auto-switch) both **PASS** (operator-recorded 2026-04-30). 01.5 NOT INVOKED (no `LegendaryGameState` field, no `buildInitialGameState` shape change, no `LegendaryGame.moves` entry, no phase hook). 01.6 post-mortem OPTIONAL per WP-066 / WP-094 / WP-096 / EC-103 viewer-side precedent — not authored this session. §17 Vision Alignment: §10a (Registry Viewer public surface) — preserved; NG-1..NG-7 proximity check confirms no monetization, no PvP framing, no scoring/leaderboards crossed. §20 Funding Surface Gate: N/A — no funding affordances added or modified. Four D-114XX entries land at Commit B: D-11401 canonical URL keys; D-11402 count/envelope-not-URL-bound; D-11403 one-shot auto-switch; D-11404 PS-1 additive `export` of six `DEFAULT_*` constants. **UX caveat (worth a follow-up WP, not a blocker):** because `useLoadoutDraft` is non-singleton (PS-1 immutable lock forbids signature changes), `LoadoutPreview`'s "Edit this loadout" button calls `loadFromJson` on the component's own draft instance rather than the visible `LoadoutBuilder`'s draft. Literal spec is satisfied (only `loadFromJson` invoked, exactly once per click) but visible editor doesn't update. Resolving this needs either a singleton composable or a draft-API prop into `LoadoutBuilder` — both off-allowlist for WP-114. See [WP-114-registry-viewer-url-parameterized-setup-preview.md](WP-114-registry-viewer-url-parameterized-setup-preview.md) + [EC-116-registry-viewer-url-parameterized-setup-preview.checklist.md](../execution-checklists/EC-116-registry-viewer-url-parameterized-setup-preview.checklist.md) + D-11401 + D-11402 + D-11403 + D-11404.

- [x] WP-103 — Server-Side Replay Storage & Loader — **Done 2026-04-25 (Commit A `fe7db3e`).** Drafted 2026-04-25; lint-gate self-review PASS; pre-flight READY TO EXECUTE; A0 SPEC bundle landed at `d150704`; Commit A landed at `fe7db3e`; Commit B (governance close) lands D-10302 + D-10303 + STATUS block + 01.6 post-mortem.
  Dependencies: WP-027, WP-052, WP-004
  Notes: Predecessor packet for WP-053. WP-053's EC-053 §Before
  Starting line 21 requires "an existing replay loader by
  `replayHash`" with no mocks accepted; WP-103 lands that loader
  so WP-053 can open against a green Before Starting checklist.
  Scope: 4 new files — `apps/server/src/replay/replay.types.ts`
  (re-exports `ReplayInput` from `@legendary-arena/game-engine` +
  `DatabaseClient` from `../identity/identity.types.js`),
  `apps/server/src/replay/replay.logic.ts` (`storeReplay`
  idempotent insert via `ON CONFLICT (replay_hash) DO NOTHING` +
  `loadReplay` returning `Promise<ReplayInput | null>`),
  `apps/server/src/replay/replay.logic.test.ts` (5 tests / 1
  suite — 1 pure + 4 DB-dependent using the locked WP-052
  `hasTestDatabase ? {} : { skip: 'requires test database' }`
  pattern), and `data/migrations/006_create_replay_blobs_table.sql`
  (idempotent `CREATE TABLE IF NOT EXISTS legendary.replay_blobs`
  with three locked columns: `replay_hash text PRIMARY KEY`,
  `replay_input jsonb NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`;
  no `updated_at`, no FK from existing tables — content-addressed
  rows are immutable). PK is `text` (the hash itself), diverging
  from WP-052's `bigserial player_id` + `ext_id text UNIQUE`
  pattern because replays are content-addressed with no use case
  for a separate internal bigint. `jsonb` chosen over `bytea` /
  `text` / `json` for shape queryability + storage efficiency.
  Storage backend is PostgreSQL `jsonb`; preserves the option of
  migrating to R2 / object storage later behind the same
  `loadReplay` interface. No `Result<T>` wrapper on either function
  — `storeReplay` returns `Promise<void>` and `loadReplay` returns
  `Promise<ReplayInput | null>`; infra failures propagate via
  thrown exceptions. No FK from `legendary.replay_ownership.replay_hash`
  → `legendary.replay_blobs.replay_hash` because WP-052 is a locked
  contract; application logic in WP-053 ensures `storeReplay`
  precedes `assignReplayOwnership` on the submission path. Server
  baseline shifts post-WP-052 `31/5/0` → **`36/6/0`** (+5 tests /
  +1 suite; with 10 skipped if no test DB). Engine baseline
  `513/115/0` unchanged. Two-commit topology at execution: A
  `EC-111:` (4 files: types, logic, test, migration); B `SPEC:`
  governance close (STATUS.md + WORK_INDEX WP-103 `[ ]` → `[x]`
  + EC_INDEX EC-111 Draft → Done + 01.6 post-mortem; mandatory per
  three triggers — new long-lived abstraction `storeReplay` /
  `loadReplay` consumed by WP-053 + new contract consumed by
  future WPs + new persistence surface `legendary.replay_blobs`).
  D-10301 (directory classification for `apps/server/src/replay/`)
  landed via PS-2 pre-flight resolution on 2026-04-25 (mirrors
  D-5202). Optional A0 SPEC for D-10302 (text PK divergence
  rationale) + D-10303 (jsonb choice + immutability rationale) if
  landing the decisions before Commit A is preferred over inline
  DECISIONS updates at Commit B. Out-of-scope (explicit): no replay write-back
  from `apps/replay-producer/`, no HTTP endpoints, no FK additions
  to WP-052's `replay_ownership`, no replay-blob deletion / retention
  / GDPR purge integration (deferred per PS-12 / D-5207-pending),
  no replay-content validation (`storeReplay` does not verify
  `computeStateHash(replayGame(input).finalState) === replayHash`
  — that is WP-053's caller-side responsibility), no bulk
  operations. Vision clauses touched: §3, §18, §19, §22, §24
  (NG-1..7 not crossed). 01.5 NOT INVOKED (zero `LegendaryGameState`
  field, zero `buildInitialGameState` shape change, zero new moves,
  zero new phase hooks — engine package entirely untouched). 01.6
  post-mortem MANDATORY. **EC retargeted EC-103 → EC-111 on
  2026-04-25 (PS-1 resolution) to resolve filename collision with
  `EC-103-viewer-a11y-and-ci-gating.checklist.md` (Done; ad-hoc
  viewer EC); WP-103 ↔ EC-111 mismatch matches WP-068 ↔ EC-070 /
  WP-082 ↔ EC-107 precedents.** See [WP-103-replay-storage-loader.md](WP-103-replay-storage-loader.md)
  + [EC-111-replay-storage-loader.checklist.md](../execution-checklists/EC-111-replay-storage-loader.checklist.md).

- [ ] WP-116 — Disconnect & Reconnect Semantics (Architecture) — **STUB DRAFT 2026-04-29** (pre-lint, pre-pre-flight; governance-only WP, no code). Locks application-layer policy on top of WP-090's Socket.IO transport: rejoin grace window, turn-handover-on-drop during `play.main`, lobby ready-state on rejoin, mid-match abandonment threshold, replay-on-abort behavior. Five `[DECISION REQUIRED]` blocks unresolved (D-NNN01..D-NNN05) — must be resolved before lint-gate self-review. §17 Vision Alignment triggered (§17.1 #4 multiplayer reconnection); §20 Funding Surface Gate N/A. Dependencies: WP-090. See [WP-116-disconnect-reconnect-semantics.md](WP-116-disconnect-reconnect-semantics.md).

- [x] WP-117 — Client Routing Strategy (Architecture) ✅ Reviewed (2026-04-30 pre-flight: 5 BLOCKING + 5 RECOMMENDED PS items, all 10 resolved in prep commit `23872a3`; copilot-check re-run PASS post-resolution) — **Completed 2026-04-30** (governance-only WP, single `SPEC:` commit, no EC per D-10001 + 2026-04-26 Amendment). Locks per-app router posture for `apps/arena-client` and `apps/registry-viewer` ahead of further URL-bearing feature WPs relitigating the choice. **Both apps → no router today** (`D-11701` arena-client preserves `selectRoute()` query-string discriminator at `App.vue:84` carrying WP-061 fixture-replay + WP-102 public-profile deep-linking; `D-11702` registry-viewer preserves local `activeView` ref at `App.vue:77` + WP-114 `setupUrlParams` query-string handling). `D-11703` history mode = N/A (no router adopted in either app). `D-11704` replay URL format deferred to future Replay Viewer WP or WP-115 leaderboard score-detail client-side extension. No `vue-router` dependency added to either app's `package.json`; no `.claude/rules/architecture.md` import-rules row modified; no `<router-view>` wiring; no EC stub. The existing `selectRoute()` is the migration starting point per D-11701 de-facto Option C note — future WP that supersedes either D-11701 or D-11702 with Option A treats it as the starting point, not as legacy scaffolding. §17 N/A under D-11704 = B (no replay format locked); §20 N/A (no funding surface). NG-1..NG-7 not crossed. No code touched. No tests added or removed. `pnpm -r test` baseline unchanged. 5 files modified per the resolved scope-lock. Pre-flight artifact: [`docs/ai/invocations/preflight-wp117.md`](../invocations/preflight-wp117.md) (gitignored scratchpad). Dependencies: WP-061. See [WP-117-client-routing-strategy.md](WP-117-client-routing-strategy.md).

- [x] WP-118 — HTTP API Surface Catalog (Architecture) ✅ Reviewed (2026-04-30 pre-flight: 6 BLOCKING + 5 RECOMMENDED PS items, all 11 resolved; copilot-check re-run PASS post-HOLD-class FIX #6/A/B) — **Completed 2026-04-30** (governance-only WP, single `SPEC:` commit, no EC per D-10001 + 2026-04-26 Amendment). Creates `docs/ai/REFERENCE/api-endpoints.md` as the authoritative catalog of every HTTP endpoint exposed (or coded but not yet exposed) by `apps/server` plus every library function reachable via direct import from `apps/server/src/**`. Four-value `Status` closed set (`Wired | Shipped-but-unwired | Library-only | Pending`) and three-value `Auth` closed set (`guest | handle-required | authenticated-session-required` per D-9905) enforced by lint §21 + the new `.claude/rules/work-packets.md` rule with replace-whole-row merge semantics (partial-update is FAIL). Backfills the live HTTP surface (`/health` + boardgame.io built-ins) plus the shipped-but-unwired profile route (deferred per D-10202) plus the `Library-only` helpers (WP-101 handle, WP-103 replay — route-less by design per WP-103 §Out of Scope, WP-053 competition — fail-closed unwired) plus the WP-115 leaderboard `Pending: WP-115 (STUB DRAFT 2026-04-29)` forward-link. Four DECISIONS entries land: **D-11801** catalog format = Markdown table (Option A); **D-11802** error response shape = boardgame.io for game endpoints + project-specific `{ code, message, requestId? }` for project endpoints (Option C); **D-11803** versioning policy = no versioning, catalog is the contract (Option B); **D-11804** update-obligation enforcement = lint §21 + work-packets rule with replace-whole-row merge semantics (Option C). §17 cited per `00.3 §17.1` trigger #3 (player identity — `accountId` and `handle` field names referenced by canonical spelling); §20 N/A (no UI surfaces, no user-visible copy, no funding channels). NG-1..NG-7 not crossed. No code touched. No tests added or removed. `pnpm -r test` baseline unchanged. 8 files modified per the D-11804 = C scope-lock. Pre-flight artifact: [`docs/ai/invocations/preflight-wp118.md`](../invocations/preflight-wp118.md) (gitignored scratchpad). Dependencies: WP-011, WP-012, WP-101, WP-102, WP-103, WP-115. See [WP-118-http-api-surface-catalog.md](WP-118-http-api-surface-catalog.md).

- [x] WP-119 — Architecture Doc Hygiene ✅ Reviewed (2026-04-30 pre-flight: 3 BLOCKING + 3 RECOMMENDED PS items, all resolved) — **Completed 2026-04-30** (governance-only WP, single `SPEC:` commit). Three drift fixes shipped: (1) `apps/replay-producer` (D-6301 / WP-063 shipped 2026-04-19) added to System Layers diagram + Package Boundaries table in `docs/02-ARCHITECTURE.md`; (2) preplan import-rule wording aligned across 11 surfaces (4 in `docs/ai/ARCHITECTURE.md`, 3 in `docs/02-ARCHITECTURE.md`, 4 in `.claude/rules/architecture.md`) using canonical phrasing **"type-only imports at compile time; reads engine state via projections passed in by the host app"**; (3) `## Internationalization` section added to `docs/ai/ARCHITECTURE.md` (deferred-i18n posture, English-only MVP, no library, ad-hoc string abstraction prohibited, future adoption requires dedicated WP + DECISIONS entry) with one-line summary in `docs/02-ARCHITECTURE.md`. `D-11901` entry in `DECISIONS.md` is the controlling i18n decision. §17 cited as lint-trigger anchor only (Vision §17 covers accessibility, not i18n — gap-fill at architecture-doc level until future Vision-amendment WP). §20 N/A — pure documentation cleanup; no UI surfaces, no user-visible copy, no funding channels. No code touched. No dependencies. HTML cross-reference comments added at each Pre-Planning Layer subsection header (drift-prevention mechanism). Pre-flight surfaced + corrected: Vision §17 over-citation, Session Context preplan-attribution error, preplan-wording landscape (3 coexisting phrasings, not 2). See [WP-119-architecture-doc-hygiene.md](WP-119-architecture-doc-hygiene.md) + [preflight-wp119.md](../invocations/preflight-wp119.md).

---

## Pre-Planning System (Parallel-Safe with Phase 4+)

Reduces multiplayer downtime by providing a sandboxed speculative planning
system for waiting players. Design constraints in
`docs/ai/DESIGN-CONSTRAINTS-PREPLANNING.md`, architecture in
`docs/ai/DESIGN-PREPLANNING.md`.

All pre-planning code lives in `packages/preplan/` — outside the game engine.
The preplan package may import engine type definitions only (never runtime
code, never `boardgame.io`).

- [x] WP-056 — Pre-Planning State Model & Lifecycle ✅ Reviewed — Executed 2026-04-20 at commit `eade2d0`
  Dependencies: WP-006A, WP-008B
  Notes: Types-only WP — no runtime-executable code; creates
  `packages/preplan/` package with `PrePlan`, `PrePlanSandboxState`,
  `RevealRecord`, `PrePlanStep` types; `PrePlan` includes `prePlanId`
  (unique identity), `revision` (monotonic version), `status` ('active' |
  'invalidated' | 'consumed'), `baseStateFingerprint` (divergence hint,
  not correctness guarantee), `invalidationReason` with machine-stable
  `effectType` discriminator ('discard' | 'ko' | 'gain' | 'other') and
  optional `affectedCardExtId`; all zones use `CardExtId[]`; counters use
  `Record<string, number>` (engine convention); reveal ledger elevated to
  INVARIANT status (sole authority for rewind — sandbox inspection is
  invalid); lifecycle states encoded in data; null semantics documented
  (missing plan = "no plan", empty planSteps = "planning started");
  sandbox counters must not encode conditional state or rule flags;
  architectural boundary enforced via grep checks (no boardgame.io, no
  engine runtime imports)

- [x] WP-057 — Pre-Plan Sandbox Execution — ✅ Reviewed — Executed 2026-04-20 at commit `8a324f0`
  Dependencies: WP-056, WP-006A, WP-008B
  Notes: First runtime code in `packages/preplan/`; client-local seedable
  PRNG (LCG or equivalent — deterministic per seed, never `ctx.random.*`,
  algorithm changes require snapshot test updates); `createPrePlan` builds
  sandbox from `PlayerStateSnapshot` with shuffled deck copy; speculative
  operations: `speculativeDraw` (deck → hand + ledger), `speculativePlay`
  (hand → inPlay), `updateSpeculativeCounter`, `addPlanStep` (isValid
  initialized true, never mutated in this WP), `speculativeSharedDraw`
  (caller must verify card visibility); all functions are pure, guard on
  `status === 'active'`, increment `revision`, return new PrePlan (no
  mutation); failure signaling via `null` (never throw for expected
  conditions); zero-op plans explicitly valid; 3 test files

- [x] WP-058 — Pre-Plan Disruption Pipeline — Executed 2026-04-20 at commit `bae70e7` ✅ Reviewed
  Dependencies: WP-057, WP-056, WP-008B
  Notes: Full disruption workflow as single cohesive pipeline (detect →
  invalidate → rewind → notify — not separable); `PlayerAffectingMutation`
  with `sourcePlayerId` (who caused it) and `affectedPlayerId` (who was
  disrupted) plus `effectType` discriminator; binary per-player detection
  (no plan-step or sandbox inspection); `invalidatePrePlan` transitions
  active → invalidated with causal reason; `computeSourceRestoration`
  derives returns from reveal ledger exclusively (INVARIANT); deck returns
  must be reshuffled, shared source returns restore membership only;
  `buildDisruptionNotification` produces structured causal message
  (`effectDescription` is canonical, `message` is derived rendering);
  `executeDisruptionPipeline` orchestrates all steps, returns
  `DisruptionPipelineResult` with `requiresImmediateNotification: true`
  (Constraint #7 encoded in data); multiple mutations per move handled
  mechanically by status guard (first invalidates, subsequent return null);
  terminal state invariant: invalidated plans must never be passed to
  speculative operations; all functions pure; acceptance scenario test
  required (create → plan → disrupt → verify); 2 test files

  **Deferral lifted 2026-04-24** — WP-028 (UI State Contract) shipped
  2026-04-14, and the UI-framework decision was made by WP-061
  (Vue 3 + Vite + Pinia, executed 2026-04-17 at `2e68530`). Integration
  guidance in `docs/ai/DESIGN-PREPLANNING.md` Section 11 remains
  authoritative for the WP-059 implementation.

- [x] WP-059 — Pre-Plan UI Integration (Store, Notification, Step Display) — Executed 2026-04-26 at commit `5c5fc1e`
  Dependencies: WP-028 ✅, WP-056 ✅, WP-057 ✅, WP-058 ✅, WP-061 ✅, WP-065 ✅
  Notes: Client-side wiring of `@legendary-arena/preplan` into
  `apps/arena-client/`. Adds a second Pinia store (`usePreplanStore()`)
  for client-local speculative state, a pure lifecycle adapter
  (`preplanLifecycle.ts`) wrapping `createPrePlan` + status transitions,
  two Vue 3 components (`<PrePlanNotification />` with `aria-live`
  region + `<PrePlanStepList />` passive reference list), and fixture
  module for deterministic component tests. Live boardgame.io client
  middleware that triggers `executeDisruptionPipeline` on real mutation
  is **out of scope** here — depends on the live-match transport
  landing in WP-090 (now done; future follow-up WP can wire it). New
  D-5901 (tentative) records the runtime-import carve-out permitting
  `apps/arena-client` to import `@legendary-arena/preplan`. WP file +
  EC drafted 2026-04-24; awaiting Prompt Lint Gate (00.3) and
  pre-flight bundle before execution. See
  [WP-059-preplan-ui-integration.md](WP-059-preplan-ui-integration.md).

- [ ] **(deferred placeholder)** WP-070 — Live Mutation Middleware
  (Pre-Plan ↔ Engine Disruption Wiring). Dependencies: **WP-059
  ✅** (frozen contract surface: `usePreplanStore` shape +
  `applyDisruptionToStore` lifecycle adapter signature); **WP-090
  ✅** (live-match transport providing the boardgame.io client +
  state-update stream).
  Scope (target ≤6 files under `apps/arena-client/src/preplan/`
  and `apps/arena-client/src/client/`): a new middleware module
  that subscribes to the boardgame.io client's state-update
  stream (via the WP-090 `bgioClient.ts` carve-out, not a second
  runtime engine import); a mutation-detection helper that
  diffs `current G` vs `new G` per-player to construct
  `PlayerAffectingMutation` envelopes (binary per-player
  semantics per DESIGN-CONSTRAINT #4 — never inspects plan steps
  or sandbox contents); the wiring that calls
  `executeDisruptionPipeline(currentPlan, mutation)` and forwards
  the result through `applyDisruptionToStore`; co-located tests
  exercising the subscribe → diff → pipeline → store path against
  fixture state-update streams (no live server). Ships the first
  runtime invocation of `executeDisruptionPipeline` from the arena
  client.
  Out of scope (deferred to a separate follow-up): speculative
  draw / play / recruit gestures (require a private-projection
  contract — per-player deck / hand / HQ / shared piles — that
  does not yet exist; WP-059 §Out of Scope captures the blocker);
  cross-turn plan regeneration auto-flow; turn-start
  auto-consumption watcher tied to `UIState.game.activePlayerId`
  changes.
  Read first when authoring: WP-059 §Out of Scope, WP-059 §Scope
  (In) §C (lifecycle adapter contract), WP-058 §D
  (`executeDisruptionPipeline` signature), DESIGN-PREPLANNING §11
  (notification delivery timing + invalidated-plan interaction
  gate), and the WP-059 01.6 post-mortem §13 forward-safety notes
  for the consumer expectations. WP file + EC not yet drafted;
  pre-flight + lint-gate pending.

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
                    WP-054 (+ WP-052, WP-051) ←── WP-053
                    
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
```

**Parallel-safe packets** (no dependency on each other):
- WP-003 (Card Registry) can run alongside WP-002 (Game Skeleton)
- WP-005A and WP-005B have no dependency on WP-004
- WP-030 (Campaign) is parallel to WP-031 (Production Hardening)
- WP-056/057/058 (Pre-Planning) are parallel with Phase 4+ (depend only on WP-006A + WP-008B from Phase 2)
- WP-061 (Client Bootstrap) and WP-063 (Replay Snapshot Producer) are parallel — WP-061 touches only `apps/arena-client/` and WP-063 touches `packages/game-engine/` + new `apps/replay-producer/`; WP-064 joins both chains so it waits for both
- WP-065 (Vue SFC Test Transform) is parallel with every other WP — it touches only `packages/vue-sfc-loader/`; it blocks WP-061, WP-062, WP-064 on the test-harness side only

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
