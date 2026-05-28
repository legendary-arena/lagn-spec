# DECISIONS_INDEX.md — Legendary Arena

## Purpose
This index maps **architectural and product decisions** to the **Work Packets (WPs)**
where they were introduced, justified, or locked in.

Use this file to:
- trace decision origins
- understand dependency chains
- evaluate impact before proposing changes

For full rationale, see `DECISIONS.md`.

---

## Meta‑Principles

| Decision ID | Summary | Introduced In |
|------------|---------|---------------|
| D‑0001 | Correctness over convenience | WP‑027 |
| D‑0002 | Determinism is non‑negotiable | WP‑027 |
| D‑0003 | Data outlives code | WP‑034 |
| D‑0004 | No post‑shuffle seed filtering or fairness gating | 2026‑04‑16 intake review |
| D‑0005 | Asynchronous PvP comparison authorized; live PvP combat forbidden | 2026‑04‑24 vision amendment |
| D‑0006 | Veteran recognition authorized; bot‑resistance is the discriminator (§25 amendment) | 2026‑04‑26 vision amendment |
| D‑0007 | Profile, identity, and recognition boundary‑freeze pass (§7a, §19a, §25, NG‑8 additions) | 2026‑04‑26 vision amendment |

---

## Engine & Core Architecture

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0101 | Engine is the sole authority | WP‑031 | WP‑032, WP‑041 |
| D‑0102 | Fail fast on invariant violations (not gameplay conditions) | WP‑031 | WP‑039, WP‑010–023 |
| D‑0103 | Engine has no UI/network knowledge | WP‑028 | WP‑041 |
| D‑0104 | Counters are numeric flags, never booleans | WP‑010 | WP‑015, WP‑019, WP‑024 |

---

## Determinism & Replay

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0201 | Replay is first‑class | WP‑027 | WP‑039 |
| D‑0202 | Deterministic state hashing | WP‑027 | WP‑032 |
| D-0203 | Canonical persisted artifact for move log / replay (**Open**) | `MOVE_LOG_FORMAT.md` 2026-04-18 | — |
| D-0204 | Privacy boundary for persisted logs (**Open**) | `MOVE_LOG_FORMAT.md` 2026-04-18 | — |
| D-0205 | RNG truth source for replay — harness scoped as determinism-only (**Active** 2026-04-18) | `MOVE_LOG_FORMAT.md` 2026-04-18 | — |

---

## UI & Presentation

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0301 | UI consumes projections only | WP‑028 | WP‑041 |
| D‑0302 | One UIState, many audiences | WP‑029 | WP‑042 |
| D‑18301 | Scheme twist filter ribbon gated to single active `scheme` cardType (parity with mechanical‑pattern ribbons) | WP‑183 | WP‑184 / EC‑211 |

---

## Network & Multiplayer

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0401 | Clients submit intents only | WP‑032 | WP‑041 |
| D‑0402 | Engine‑authoritative resync | WP‑032 | WP‑039 |

---

## Campaigns & Scenarios

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0501 | Campaigns are meta‑orchestration | WP‑030 | WP‑041 |
| D‑0502 | Campaign state lives outside engine | WP‑030 | WP‑034 |

---

## Content System

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0601 | Content is data, not code | WP‑033 | WP‑046 |
| D‑0602 | Invalid content blocked at load | WP‑033 | WP‑039 |
| D‑0603 | Representation before execution | WP‑021 | WP‑022, WP‑023, WP‑024 (D-2101, D-2104) |

---

## AI & Balance

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0701 | AI is tooling, not gameplay | WP‑036 | WP‑040 |
| D‑0702 | Balance requires simulation | WP‑036 | WP‑047 |
| D‑0703 | Difficulty declared before competition | WP‑049/050/051 | — |

---

## Versioning & Migration

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0801 | Explicit engine/data/content versions | WP‑034 | WP‑035 |
| D‑0802 | Incompatible data fails loudly | WP‑034 | WP‑039 |

---

## Live Ops

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑0901 | Deterministic metrics only | WP‑039 | — |
| D‑0902 | Rollback always available | WP‑035 | WP‑039 |

---

## Growth Governance

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑1001 | Growth requires change budgets | WP‑040 | — |
| D‑1002 | Immutable surfaces protected | WP‑040 | WP‑041 |
| D‑1003 | Content & UI are growth vectors | WP‑040 | WP‑042 |
| D‑1004 | Badge issuer model is tiered; gameplay badges ship first | 2026‑04‑26 (informs WP‑105) | — |

---

## Onboarding

| Decision ID | Summary | Introduced In | Reinforced In |
|------------|---------|---------------|--------------|
| D‑1101 | Tutorials use real rules | WP‑042 | — |
| D‑1102 | Onboarding is UI‑only | WP‑042 | WP‑041 |

---

## Registry & Data Contracts

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1201 | `game_sessions` uses ext_id text references, not bigint FKs | FP-02 |
| D-1202 | MatchConfiguration uses ext_id string references, not numeric IDs | WP-002 |
| D-1203 | `sets.json` and `card-types.json` are incompatible shapes | WP-003 |
| D-1204 | `FlatCard.cost` must be `string \| number \| undefined` | WP-003 |
| D-1227 | FlatCard hero-only optional fields include explicit `undefined` | INFRA |
| D-1228 | `shared.ts` hero card defaults for name and abilities | INFRA |

---

## Server & Infrastructure

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1205 | Server uses `createRegistryFromLocalFiles` at startup | WP-004 |
| D-1206 | boardgame.io server import uses `createRequire` bridge | WP-004 |
| D-1241 | CLI scripts use boardgame.io built-in lobby endpoints | WP-012 |
| D-1242 | Unit tests stub `fetch` rather than spinning up a test server | WP-012 |
| D-1243 | Credentials printed to stdout, never stored to disk | WP-012 |

---

## Match Setup Contracts

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1207 | `MatchSetupConfig` is canonical; `MatchConfiguration` is an alias | WP-005A |
| D-1208 | `MatchSetupError` uses `{ field, message }`, not `MoveError` | WP-005A |
| D-1209 | `CardRegistryReader` interface preserves layer boundary | WP-005A |
| D-1244 | Match setup composition maps 1:1 to `MatchSetupConfig` | Schema audit |
| D-1245 | Match setup `playerCount` maximum aligned to engine `maxPlayers` | Schema audit |
| D-1246 | Match setup uses `additionalProperties:false` | Schema audit |
| D-1247 | Match setup two-layer structure: envelope and composition | Schema audit |
| D-1248 | Match setup seed is an archival identifier until PRNG wiring exists | Schema audit |

---

## Player State & Zones

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1210 | Player starting decks use ext_id strings in G, not full card objects | WP-005B |
| D-1211 | `makeMockCtx` reverses arrays instead of identity shuffle | WP-005B |
| D-1212 | Global piles use `G.piles` container, not flat top-level keys | WP-005B |
| D-1213 | `Game.setup()` uses module-level registry holder pattern | WP-005B |
| D-1214 | Zones store ext_id strings, not full card objects | WP-006A |
| D-1215 | `ZoneValidationError` uses `{ field, message }`, not `MoveError` | WP-006A |
| D-1216 | `LegendaryGameState` consolidated with canonical zone types | WP-006A |
| D-1217 | `buildPlayerState` and `buildGlobalPiles` extracted from `buildInitialGameState` | WP-006B |
| D-1218 | Global piles use token ext_ids rather than registry ext_ids | WP-006B |

---

## Turn & Phase System

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1219 | `TurnStage` defined separately from boardgame.io's stage concept | WP-007A |
| D-1220 | `getNextTurnStage` returns null after cleanup instead of cycling | WP-007A |
| D-1221 | `G.currentStage` stored in G, not ctx | WP-007B |
| D-1222 | Integration tests call functions directly, not `boardgame.io/testing` | WP-007B |

---

## Move System

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1223 | `MOVE_ALLOWED_STAGES` stage assignments for core moves | WP-008A |
| D-1224 | `MoveResult`/`MoveError` is the engine-wide result contract | WP-008A |
| D-1225 | `zoneOps.ts` helpers return new arrays rather than mutating G directly | WP-008B |
| D-1226 | Moves return `void` on validation failure rather than throwing | WP-008B |

---

## Rule Pipeline

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1229 | `HookDefinition` is data-only with no handler functions | WP-009A |
| D-1230 | Rule effects are a tagged data union, not callback functions | WP-009A |
| D-1231 | Hook execution order: priority ascending, then ID lexically | WP-009A |
| D-1232 | `ImplementationMap` pattern: handler functions separate from `HookDefinition` | WP-009B |
| D-1233 | Two-step execute/apply pipeline for rule effects | WP-009B |
| D-1234 | Unknown effect types handled gracefully, not thrown | WP-009B |

---

## Endgame & Lobby

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1235 | Loss evaluated before victory | WP-010 |
| D-1236 | Numeric counters instead of boolean fields | WP-010 |
| D-1237 | `ESCAPE_LIMIT` as hardcoded MVP constant | WP-010 |
| D-1238 | `G.lobby.started` as a boolean flag in G | WP-011 |
| D-1239 | `startMatchIfReady` transitions to setup, not directly to play | WP-011 |
| D-1240 | `ctx.currentPlayer` as the lobby ready-map key | WP-011 |

---

## Persistence & Snapshots (Phase 3)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1310 | Snapshots use zone counts, not `CardExtId` arrays | WP-013 |
| D-1311 | `createSnapshot` is a pure function, not an async DB write | WP-013 |
| D-1312 | `PersistableMatchConfig` excludes G and ctx | WP-013 |
| D-1313 | Endgame outcome derived via `evaluateEndgame`, not stored on G | WP-013 |
| D-1320 | Phase 3 exit approved | Phase 3 gate review |

---

## Phase 3 Governance

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1301 | Legacy 00.2 sections 7/9/10/11/12 excluded from governed document | WP-043 |
| D-1302 | 00.2 is a human-readable reference subordinate to `schema.ts` | WP-043 |
| D-1401 | Prompt lint checklist remains a REFERENCE document | WP-044 |
| D-1402 | Connection health check remains a REFERENCE document | WP-045 |
| D-1403 | R2 validation gate remains a REFERENCE document | WP-046 |
| D-1404 | Code style: reference is descriptive; `.claude/rules/` is enforcement | WP-047 |

---

## WP-014 — Villain Deck Architecture

### WP-014A — Reveal Pipeline Guarantees

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1405 | Classification stored in `G.villainDeckCardTypes` at setup | WP-014A |
| D-1406 | Reveal pipeline independent of deck construction | WP-014A |
| D-1407 | Fail-closed behaviour for missing card classification | WP-014A |
| D-1408 | Discard routing is correct and temporary (pre-City) | WP-014A |
| D-1409 | Canonical `RevealedCardType` set is closed and drift-checked | WP-014A |

### WP-014B — Deck Composition Rules (Unlocking Decisions)

| Decision ID | Summary | Unlocks | Introduced In |
|---|---|---|---|
| D-1410 | Henchmen are virtual, instanced cards | `buildVillainDeck` | WP-014B |
| D-1411 | Scheme twists are virtual, scheme-scoped cards | `buildVillainDeck` | WP-014B |
| D-1412 | Deck composition counts come from rules, not config | `buildVillainDeck` | WP-014B |
| D-1413 | Mastermind strikes identified by `tactic` field | `buildVillainDeck` | WP-014B |

---

## Hero Ability Hooks (WP-021)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2101 | `HeroAbilityHook` is data-only (same pattern as `HookDefinition`) | WP-021 |
| D-2102 | `HeroKeyword` union is closed; requires DECISIONS.md entry to extend | WP-021 |
| D-2103 | `HeroAbilityTiming` union is closed; defaults to `'onPlay'`, no NL inference | WP-021 |
| D-2104 | Hero ability execution deferred to WP-022+ | WP-021 |
| D-2105 | `buildHeroAbilityHooks` uses `CardRegistryReader`, consumes only key/abilities/deck | WP-021 |

---

## VP Scoring (WP-020)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2001 | MVP VP table values locked as named constants | WP-020 |
| D-2002 | Wounds identified by `WOUND_EXT_ID` constant | WP-020 |
| D-2003 | Tactic VP awarded to all players (no per-player attribution) | WP-020 |
| D-2004 | Scores not stored in `G` during MVP | WP-020 |
| D-2005 | `game.ts` not modified for scoring | WP-020 |
| D-2006 | Bystander VP uses dual-source check | WP-020 |

---

## Architectural Invariants (cross-WP)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1249 | boardgame.io version locked at ^0.50.0 | WP-002 |
| D-1250 | Phase names locked to lobby/setup/play/end | WP-007A |
| D-1251 | Package import matrix is an architectural invariant | WP-002 |

---

## City & HQ (WP-015)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1501 | City and HQ use fixed 5-tuples | WP-015 |
| D-1502 | City push inserts at space 0 | WP-015 |
| D-1503 | Bystander MVP: discard, not capture | WP-015 |

---

## Core Move Expansion (WP-016)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1601 | CoreMoveName and MOVE_ALLOWED_STAGES are a closed set | WP-016 |
| D-1602 | Fight and recruit ordering is player-controlled | WP-016 |
| D-1603 | MVP fight and recruit have no resource checking | WP-016 |
| D-1604 | Recruited heroes go to player discard, not hand | WP-016 |

---

## KO, Wounds & Bystanders (WP-017)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1701 | MVP attaches exactly 1 bystander per villain entering city | WP-017 |
| D-1702 | Escape causes wound (MVP player penalty) | WP-017 |
| D-1703 | G.attachedBystanders is a plain Record, not a Map | WP-017 |
| D-1704 | Escaped bystanders return to supply pile, not KO | WP-017 |
| D-1705 | Supply pile pile[0] is top-of-pile convention | WP-017 |

---

## Economy (WP-018)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1801 | Economy and scoring are separate concerns | WP-018 |
| D-1802 | Debuggability via deterministic reproduction only | WP-018 |
| D-1803 | G.cardStats stores parsed card stats at setup time (registry boundary) | WP-018 |
| D-1804 | "2+" parses to base 2 only (conditional bonuses deferred) | WP-018 |
| D-1805 | CardStatEntry.fightCost is semantically distinct from attack | WP-018 |
| D-1806 | Starting cards contribute 0/0 in MVP (fail-closed) | WP-018 |
| D-1807 | HQ refill after recruit is not in WP-018 | WP-018 |

---

## Mastermind (WP-019)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-1901 | MVP defeats exactly 1 tactic per successful fight | WP-019 |
| D-1902 | Mastermind vAttack stored as fightCost via buildMastermindState | WP-019 |
| D-1903 | No tactic text effects in MVP | WP-019 |
| D-1904 | buildMastermindState adds mastermind base card to cardStats separately | WP-019 |

---

## Hero Ability Execution (WP-022)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2201 | Only 4 keywords execute in WP-022 MVP | WP-022 |
| D-2202 | KO targets the played card only (MVP) | WP-022 |
| D-2203 | Hero hook economy is additive to base card stats | WP-022 |
| D-2204 | executeHeroEffects uses ctx: unknown to avoid boardgame.io import | WP-022 |
| D-2205 | Draw logic extracted, not drawCards move called | WP-022 |
| D-2206 | DataProvenance type deferred (not yet useful) | WP-022 |

---

## Conditional Hero Effects (WP-023)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2301 | Condition evaluation uses AND logic | WP-023 |
| D-2302 | 4 MVP condition types (2 functional, 2 placeholder) | WP-023 |
| D-2303 | Condition evaluators are pure functions (never mutate G) | WP-023 |
| D-2304 | Condition type string is heroClassMatch (not requiresColor) | WP-023 |
| D-2305 | HeroCondition.value is always string; numeric parse for playedThisTurn | WP-023 |

---

## Scheme & Mastermind Execution (WP-024)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2401 | Scheme and mastermind use same hook pipeline as heroes | WP-024 |
| D-2402 | MVP scheme twist threshold is fixed at 7 | WP-024 |
| D-2403 | MVP mastermind strike uses counter + message only | WP-024 |
| D-2404 | WP-009B stub handlers replaced with real handlers | WP-024 |
| D-2405 | WP-024 file path correction (pre-flight finding) | WP-024 |

---

## Board Keywords (WP-025)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2501 | Board keywords separate from hero ability hooks | WP-025 |
| D-2502 | MVP board keyword values | WP-025 |
| D-2503 | Ambush wound gain is inline (not RuleEffect pipeline) | WP-025 |
| D-2504 | Board keyword data availability (safe-skip) | WP-025 |

---

## Scheme Setup (WP-026)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2601 | Representation before execution (RBE) and scheme setup separation | WP-026 |
| D-2602 | City size modification deferred (fixed tuple MVP) | WP-026 |
| D-2603 | Scheme setup builder location (src/setup/) | WP-026 |

---

## Theme Data Model (WP-055)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-5501 | Themes are data, not behavior | WP-055 |
| D-5502 | Theme schema is engine-agnostic (registry layer only) | WP-055 |
| D-5503 | Theme IDs are immutable once published | WP-055 |
| D-5504 | Schema evolution via versioning only | WP-055 |
| D-5505 | External comic references are editorial only | WP-055 |
| D-5506 | comicImageUrl is editorial, not hosted | WP-055 |
| D-5507 | Referential integrity validation deferred | WP-055 |
| D-5508 | PAR difficulty rating excluded from v1 | WP-055 |

---

## Replay & Determinism Verification (WP-027)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2701 | Canonical state hashing: sorted-key JSON + djb2 | WP-027 |
| D-2702 | Replay harness uses makeMockCtx, not boardgame.io/testing | WP-027 |
| D-2703 | ReplayInput is Class 2 (Configuration) data | WP-027 |
| D-2704 | MVP replay uses deterministic mock shuffle, not seed-faithful | WP-027 |
| D-2705 | advanceStage replicated via advanceTurnStage in replay | WP-027 |
| D-2706 | Replay directory classified as engine code category | WP-027 |

---

## UI State Contract (WP-028)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2801 | UI projection directory classified as engine code category | WP-028 |
| D-2802 | Zone projection strategy (counts, not card arrays) | WP-028 |
| D-2803 | UIState hides engine internals | WP-028 |
| D-2804 | Card display resolution is a separate UI concern | WP-028 |

---

## Audience-Filtered Views (WP-029)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-2901 | Audience filter operates on UIState, not G | WP-029 |
| D-2902 | Hand visibility approach (handCards optional field) | WP-029 |
| D-2903 | Economy visibility (zeroed for non-active and spectators) | WP-029 |

---

## Campaign / Scenario Framework (WP-030)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-3001 | Campaign directory classified as engine code category | WP-030 |
| D-3002 | Campaign state external to G (MVP implementation) | WP-030 |
| D-3003 | Scenarios produce MatchSetupConfig, not modified G | WP-030 |
| D-3004 | Campaign replay as sequence of ReplayInputs | WP-030 |

---

## Replay Snapshot Producer (WP-063)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-6301 | `apps/replay-producer/` classified as `cli-producer-app` code category (new top-level category) | WP-063 |
| D-6302 | `ReplaySnapshotSequence` JSON sorting: top-level keys sorted; nested objects inherit engine-produced order | WP-063 |
| D-6303 | `ReplaySnapshotSequence` version bump policy: additive-at-v1, breaking-to-v2, consumer-must-assert | WP-063 |
| D-6305 | `ReplayInputsFile` reconciled with WP-027 canonical `ReplayMove`; `buildSnapshotSequence` requires explicit `playerOrder` + `registry` params | WP-063 |

---

## Game Log & Replay Inspector (WP-064)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-6401 | Keyboard focus pattern for stepper-style interactive components: `tabindex="0"` root + listeners-on-root + clamp-not-wrap; first repo precedent | WP-064 |

---

## Versioning & Save Migration Strategy (WP-034)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-3401 | `packages/game-engine/src/versioning/` classified as engine code category; `new Date().toISOString()` exception documented for `versioning.stamp.ts` `savedAt` metadata only | WP-034 |

---

## Release, Deployment & Ops Playbook (WP-035)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-3501 | `packages/game-engine/src/ops/` classified as engine code category (eighth engine-subdirectory precedent); ships pure type definitions only — no runtime `OpsCounters` instance anywhere in the engine (RS-1 option (a)); no wall-clock / RNG / I/O / `.reduce()` carve-outs | WP-035 |
| D-3502 | Four deployment environments locked at `dev` → `test` → `staging` → `prod` in sequential promotion order; fifth environment requires a new D-entry + coordinated update to the `DeploymentEnvironment` typed union and `docs/ops/DEPLOYMENT_FLOW.md`; rationale: each environment covers a distinct testable aspect, four is the minimum sufficient covering | WP-035 |
| D-3503 | No hot-patching in production — only versioned artifact deployments; enforces D-1002 (Immutable Surfaces Are Protected) at the deployment boundary; load-bearing for rollback determinism (D-0902), audit trail (release notes), and staging-parity identity; only valid responses to urgent production change are D-0902 rollback or a fast-track versioned-artifact release | WP-035 |
| D-3504 | Release-time validation gates (`docs/ops/RELEASE_CHECKLIST.md`) and runtime invariant checks (`packages/game-engine/src/invariants/`, WP-031) are complementary not redundant; gates catch pre-promotion defects, invariants catch live-match anomalies; each defends the other's blind spot; a runtime invariant firing in production is evidence a release gate missed something and triggers P0 rollback | WP-035 |

---

## Growth Governance & Change Budget (WP-040)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-4001 | `packages/game-engine/src/governance/` classified as engine code category (ninth engine-subdirectory precedent after D-2706 / D-2801 / D-3001 / D-3101 / D-3201 / D-3301 / D-3401 / D-3501); ships pure type definitions only — `ChangeCategory`, `ChangeBudget`, `ChangeClassification` — used as out-of-band governance metadata, never stored in `LegendaryGameState`, never persisted to any database, never transmitted in replay logs, never used to branch runtime gameplay; no wall-clock / RNG / I/O / `.reduce()` / `boardgame.io` / registry / server imports | WP-040 |
| D-4002 | P6-51 form (2) back-pointer to `docs/governance/CHANGE_GOVERNANCE.md §Change Classification`; five change categories (`ENGINE` / `RULES` / `CONTENT` / `UI` / `OPS`) map one-to-one to the `ARCHITECTURE.md §Layer Boundary (Authoritative)` partition; classification is mandatory and exclusive (no hybrids, no "miscellaneous", no split ownership); category determines review surface, target version axis, and whether the change touches an immutable surface (D-4004); adding a sixth category requires a new D-entry + fresh D-3901 reuse-verification | WP-040 |
| D-4003 | P6-51 form (2) back-pointer to `docs/governance/CHANGE_GOVERNANCE.md §Growth Vectors`; per D-1003, `CONTENT` and `UI` are primary growth vectors (uncapped budgets, lightest review); `RULES` is secondary (at-most-1 per release under simulation validation per D-0702 / WP-036); `ENGINE` is restricted (default budget 0, architecture review + DECISIONS.md entry + full replay verification); immutable-surface changes (D-4004) are forbidden under non-major versions | WP-040 |
| D-4004 | P6-51 form (2) back-pointer to `docs/governance/CHANGE_GOVERNANCE.md §Immutable Surfaces`; per D-1002, five surfaces are immutable under non-major versions — replay semantics, RNG behavior (`ctx.random.*`), scoring rules (`computeFinalScores`), engine invariants (WP-031), endgame conditions (`evaluateEndgame`); any change requires major version bump + migration path + DECISIONS.md entry; `ChangeClassification.immutableSurface` is the type-level encoding (omit-don't-undefined under `exactOptionalPropertyTypes`); adding a sixth surface requires fresh D-3901 reuse-verification | WP-040 |

---

## Architecture Certification & Audit (WP-041)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-4101 | Resolved Transcription Inconsistency: `docs/ai/ARCHITECTURE.md` `*Last updated:*` footer refreshed from stale `WP-014 review` reference to `WP-041` certification; new `Architecture Version: 1.0.0 / Last Reviewed: 2026-04-23 / Verified Against: WP-001 through WP-040` stamp at top of file is now the authoritative recency marker per WP-041 §Goal §1 | WP-041 |
| D-4102 | Rules-Architecture Drift Log: `.claude/rules/architecture.md` lags `docs/ai/ARCHITECTURE.md` on three consolidated points — (1) Layer Overview missing the Shared Tooling layer (WP-065), (2) Import Rules table missing rows for `vue-sfc-loader` and `apps/arena-client (WP-061+)`, (3) Authority Hierarchy section retains stale `00.1-master-coordination-prompt.md` at #2 and omits `01-VISION.md` and `WORK_INDEX.md`; logged for future rules-correction pass per WP-041 §Out of Scope (`.claude/rules/*.md` files are NOT modified in this packet) | WP-041 |

---

## Deployment Checklists — Scope Reduction (WP-042)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-4201 | WP-042 scope reduced from 8 PostgreSQL checklist sections to 4 (§B.1, §B.2, §B.6, §B.7 ship; §B.3, §B.4, §B.5, §B.8 deferred to future WP-042.1); reason: `scripts/seed-from-r2.mjs` has never existed (Foundation Prompt 03 never executed); pulling script creation into WP-042 scope would change class from Documentation to Code+Docs, violate RS-2 test-count lock, and change commit topology; scope reduction preserves invariants and ships real R2 + schema-structure value today | WP-042 |
| D-4202 | Legacy `00.2b` §C UI-rendering-layer verification explicitly excluded from the WP-042 deployment checklist suite; P6-51 form-(2) back-pointer — authoritative prose lives in `docs/ai/deployment/r2-data-checklist.md` §Scope ("Explicitly out of scope") citing this D-entry by number; rationale: Layer Boundary discipline (UI is a separate layer from Server / Ops), UI-implementation volatility (rendering libraries evolve faster than infrastructure checklists), `RELEASE_CHECKLIST.md` Gate 5 already covers UI contract correctness at release time | WP-042 |
| D-4203 | WP-042 classified as Documentation-class under Server / Operations layer as a load-bearing invariant; prohibits new runtime code, new `scripts/` files, new `package.json` entries, new migrations, and new tests within WP-042's scope; preserves test-baseline invariance (436 engine / 526 repo-wide / 0 failing), three-commit topology (`SPEC:` pre-flight / `EC-042:` execution / `SPEC:` governance close), and Server/Ops Layer Boundary stability; future deployment-pillar Documentation WPs may cite as precedent and adjust file list to their own scope | WP-042 |

---

## Production Hardening & Invariants (WP-031)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-3101 | Invariants directory classified as engine code category | WP-031 |
| D-3102 | Runtime invariant check wiring scope (setup-only at MVP) | WP-031 |
| D-3103 | Card uniqueness invariant scope (fungible token exclusion) | WP-031 |
| D-3201 | Network directory classified as engine code category | WP-032 |
| D-3202 | Intent validation is engine-side, not server-side | WP-032 |
| D-3203 | Intent validation adds to boardgame.io turn order, not replaces | WP-032 |

---

## Pre-Planning State Model & Lifecycle (WP-056)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-5601 | `packages/preplan/` classified as a new top-level `preplan` code category (non-authoritative, per-client, speculative); follows the top-level-category pattern of D-6301 (`cli-producer-app`) and D-6511 (`client-app`), not the engine-subdirectory pattern of D-2706/D-2801/D-3001/D-3101/D-3201/D-3301/D-3401/D-3501; type-only import from `@legendary-arena/game-engine` permitted, no runtime engine imports, no `boardgame.io`, no registry, no server, no `apps/*`, no `pg`, no writes to `G` or `ctx`, no persistence to any storage, no wiring into `game.ts` or lifecycle hooks | WP-056 |

---

## Registry Build Pipeline Cleanup (WP-081)

| Decision ID | Summary | Introduced In |
|---|---|---|
| D-8101 | Dead registry build pipeline (`normalize-cards.ts` → `build-dist.mjs` → `standardize-images.ts`) deleted rather than rewritten because no monorepo consumer reads `dist/cards.json`, `dist/index.json`, `dist/sets.json`, `dist/keywords.json`, `dist/registry-info.json`, or `dist/image-manifest.json`; runtime path is `metadata/sets.json` + `metadata/{abbr}.json` fetched directly from R2 via `httpRegistry.ts` / `localRegistry.ts`; registry build is now tsc-only | WP-081 |
| D-8102 | `registry:validate` is the single CI validation step; redundant second invocation formerly in the `build` job under step `"Normalize cards"` is removed; build and validate responsibilities remain separate, not merged | WP-081 |

---

## Usage Rules

- Before changing behaviour, locate related Decision IDs here
- Review all referenced WPs
- Add a new decision entry if behaviour meaningfully changes
- Never alter an “Immutable” decision without a major version bump

---

## Relationship to Other Docs
- `DECISIONS.md` — authoritative narrative
- `WORK_INDEX.md` — execution order
- `ARCHITECTURE.md` / WP-041 — structural reference

This index exists to keep growth **intelligent and intentional**.