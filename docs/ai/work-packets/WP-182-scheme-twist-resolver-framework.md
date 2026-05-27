# WP-182 — Scheme Twist Resolver Framework

## Goal

Replace the per-scheme `if/else` branching in `schemeHandlers.ts` with a
data-driven resolver framework so that new scheme twist behaviors can be added
by configuration rather than per-scheme functions. Ship the first 4 reusable
parameterized resolvers covering the highest-frequency twist patterns across
all 40 Legendary sets (~191 schemes total). Migrate the existing Midtown Bank
Robbery handler into the framework. After this WP, adding a new scheme twist
behavior is a config entry (data), not a code change.

## Assumes

- **WP-009B** (rule execution pipeline) — complete. `executeRuleHooks`,
  `applyRuleEffects`, `ImplementationMap`, `HookRegistry` all exist.
- **WP-153** (destination piles) — complete. `gameState.scheme.twistPile`
  exists as `CardExtId[]`.
- **WP-179** (card traits) — complete. `gameState.cardTraits` exists as
  `Record<CardExtId, CardTraitEntry>` with `heroClass` and `team` fields.
- `packages/game-engine/src/rules/schemeHandlers.ts` exists and exports
  `schemeTwistHandler` with the current `if/else` dispatch pattern.
- `packages/game-engine/src/rules/ruleHooks.types.ts` exports `RuleEffect`
  (4-variant tagged union: `queueMessage`, `modifyCounter`, `drawCards`,
  `discardHand`).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` exports
  `performVillainReveal` and `RevealContext`.
- `packages/game-engine/src/board/wounds.logic.ts` exports `gainWound`.
- `packages/game-engine/src/board/ko.logic.ts` exports `koCard`.
- `packages/game-engine/src/board/city.logic.ts` exports `refillHqSlot`.
- `packages/game-engine/src/moves/zoneOps.ts` exports `moveAllCards`.
- `packages/game-engine/src/state/cardTraits.types.ts` exports
  `CardTraitEntry { heroClass: string | null; team: string | null }`.
- `packages/game-engine/src/types.ts` exports `LegendaryGameState` with
  `playerZones`, `hq`, `ko`, `piles`, `scheme`, `cardTraits`, `cardStats`,
  `city`, `messages`, `counters`, `selection`, `attachedBystanders`.
- Baseline: `origin/main @ 199afeb` (2026-05-27).

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` — §Layer Boundary (Game Engine layer rules)
- `.claude/rules/architecture.md` — enforcement rules for engine layer
- `.claude/rules/code-style.md` — code style enforcement
- `docs/ai/REFERENCE/00.6-code-style.md` — human-style code rules
- `docs/ai/DECISIONS.md` — scan for D-009xx (rule execution pipeline),
  D-153xx (destination piles), D-179xx (card traits)
- `packages/game-engine/src/rules/schemeHandlers.ts` — current dispatcher
- `packages/game-engine/src/rules/ruleHooks.types.ts` — `RuleEffect` union
- `packages/game-engine/src/rules/ruleRuntime.execute.ts` —
  `ImplementationMap` type
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
  `performVillainReveal`, `RevealContext`

## Scope (In)

- **New type file:** `SchemeTwistConfig` interface + `SchemeTwistResolverId`
  union in `schemeTwistConfig.types.ts`
- **New resolver file:** 4 resolver functions + resolver registry map in
  `schemeTwistResolvers.ts`
- **New config file:** config entries for core-set schemes in
  `schemeTwistConfigs.ts`
- **Modified dispatcher:** rewrite `schemeTwistHandler` in
  `schemeHandlers.ts` to config-driven lookup
- **Midtown Bank Robbery migration:** move existing handler into the
  framework (its own resolver since the pattern is unique)
- **Tests:** unit tests for each resolver + drift test on config-resolver
  alignment
- **Governance:** D-18201 decision entry

## Out of Scope

- Master Strike resolvers (future WP)
- Villain fight-effect resolvers (future WP)
- Non-core-set scheme configs (future WPs — add configs as data, no code
  changes needed once framework exists)
- Per-player-count variable twist thresholds (WP-169 carve-out; future
  schema+engine WP requiring a richer threshold representation)
- UI changes (none needed — messages already flow through `G.messages` →
  UIState `log`)
- New `RuleEffect` types — resolvers mutate G directly; they are pre-effect.
  Only the generic counter/loss-check runs through the effect pipeline.
- Changes to `ruleHooks.types.ts`, `ruleRuntime.effects.ts`,
  `ruleRuntime.impl.ts`, `ruleRuntime.execute.ts`, `villainDeck.reveal.ts`,
  `board/wounds.logic.ts`, `board/ko.logic.ts`, `board/city.logic.ts`,
  `moves/zoneOps.ts`, `state/cardTraits.types.ts`, `types.ts`

## Files Expected to Change

All paths relative to `packages/game-engine/`.

- `src/rules/schemeTwistConfig.types.ts` — **new** — `SchemeTwistConfig`
  interface, `SchemeTwistResolverId` union type, `SchemeTwistResolver`
  function type
- `src/rules/schemeTwistResolvers.ts` — **new** — 4 resolver functions
  (`revealOrPunish`, `chainedReveals`, `woundAll`, `koFromHq`) + the
  migrated Midtown Bank Robbery resolver + `SCHEME_TWIST_RESOLVERS`
  registry map
- `src/rules/schemeTwistConfigs.ts` — **new** — `SCHEME_TWIST_CONFIGS`
  map with entries for core-set schemes that match the 4 resolvers +
  Midtown Bank Robbery
- `src/rules/schemeHandlers.ts` — **modified** — rewrite dispatcher to
  config-driven lookup; remove inline Midtown Bank Robbery handler;
  remove per-scheme constants
- `src/rules/schemeTwistResolvers.test.ts` — **new** — unit tests for each
  resolver function
- `src/rules/schemeTwistConfigs.test.ts` — **new** — drift tests: (A) every
  config's `resolverId` exists in the resolver registry, (B) every config
  map key equals its `config.schemeId`

## Non-Negotiable Constraints

### Engine-wide (always apply)

- ESM only, Node v22+
- Every new or modified file must be produced in full — no diffs, no
  snippets, no "show only the changed section"
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- All randomness uses `ctx.random.*` — never `Math.random()`
- `G` is JSON-serializable (no class instances, no functions)
- Moves never throw; only `Game.setup()` may throw
- All zones store `CardExtId` strings only
- No `.reduce()` in zone operations or effect application
- No `boardgame.io` imports in new files (the existing `schemeHandlers.ts`
  already has none)
- No registry imports in game-engine files
- Every `ctx.events.setPhase()` and `ctx.events.endTurn()` call needs a
  `// why:` comment

### Packet-specific

- Resolvers mutate `G` directly (same pattern as existing
  `resolveMidtownBankRobberyTwist`). They push messages to
  `gameState.messages`. They do NOT return `RuleEffect[]`.
- The generic counter-increment + loss-check effects are appended by the
  dispatcher after the resolver runs. `buildGenericTwistEffects` logic is
  unchanged (still counter increment + loss-check), but the dispatcher
  computes the effective threshold (`config.lossThreshold ??
  MVP_SCHEME_TWIST_THRESHOLD`) and passes it as a parameter. This is the
  only signature change to `buildGenericTwistEffects`.
- New `RuleEffect` types must NOT be added. Resolvers are pre-effect.
- `SchemeTwistConfig.lossThreshold` overrides `MVP_SCHEME_TWIST_THRESHOLD`
  when present; otherwise the default of 7 applies.
- **Resolvers never throw on invalid config.** If a resolver receives
  missing or malformed params, it pushes a full-sentence message to
  `gameState.messages` explaining the problem and returns. Generic effects
  still apply. This preserves the "moves never throw" invariant.
- The resolver registry is a plain `Record<SchemeTwistResolverId,
  SchemeTwistResolver>` — no factory, no class, no dynamic registration.
- The config registry is a `Map<string, SchemeTwistConfig>` keyed by
  scheme ext_id.
- All zone mutations go through helpers (`gainWound`, `koCard`,
  `refillHqSlot`, `moveAllCards`, `attachBystanderToVillain`).
- Every resolver function gets its own JSDoc.
- Push descriptive messages to `gameState.messages` for every significant
  action.
- Read-only files (use but do not modify): `ruleHooks.types.ts`,
  `ruleRuntime.effects.ts`, `ruleRuntime.impl.ts`, `ruleRuntime.execute.ts`,
  `villainDeck.reveal.ts`, `board/wounds.logic.ts`, `board/ko.logic.ts`,
  `board/city.logic.ts`, `moves/zoneOps.ts`, `state/cardTraits.types.ts`,
  `types.ts`.

### Session protocol

- Stop and ask on unclear items
- Do not guess mechanics or card text — consult the session prompt for
  exact twist text

### Locked contract values

- `MVP_SCHEME_TWIST_THRESHOLD = 7` (existing constant, preserved)
- `BANK_CITY_INDEX = 1` (migrated from schemeHandlers.ts into the Midtown
  resolver)
- `MIDTOWN_BYSTANDERS_PER_TWIST = 2` (migrated)
- `SchemeTwistResolverId` union: `'reveal-or-punish' | 'chained-reveals' |
  'wound-all' | 'ko-from-hq'` (4 resolvers) plus
  `'midtown-bank-robbery'` (migrated)
- Resolver function signature:
  `(gameState: LegendaryGameState, context: RevealContext,
  implementationMap: ImplementationMap, params: Record<string, unknown>)
  => void`

## Contract

### SchemeTwistConfig

```typescript
export interface SchemeTwistConfig {
  schemeId: string;
  resolverId: SchemeTwistResolverId;
  params: Record<string, unknown>;
  lossThreshold?: number;
}
```

### SchemeTwistResolverId

```typescript
export type SchemeTwistResolverId =
  | 'reveal-or-punish'
  | 'chained-reveals'
  | 'wound-all'
  | 'ko-from-hq'
  | 'midtown-bank-robbery';
```

### SchemeTwistResolver function type

```typescript
export type SchemeTwistResolver = (
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
  params: Record<string, unknown>,
) => void;
```

### Dispatcher contract (updated schemeTwistHandler)

1. Look up `SchemeTwistConfig` by `gameState.selection.schemeId`
2. If found, look up the resolver by `config.resolverId`, call it with
   `config.params`
3. If no config found, push a message (existing fallback — counter
   increment only)
4. Compute threshold: `config?.lossThreshold ?? MVP_SCHEME_TWIST_THRESHOLD`
5. Call `buildGenericTwistEffects(gameState, threshold)` and return effects
   (logic unchanged: counter increment + loss-check; only the threshold
   source changes from hardcoded to parameterized)

### Resolver summaries

| Resolver ID | Pattern | Key params |
|---|---|---|
| `reveal-or-punish` | Each player reveals a hero matching condition or suffers penalty | `condition: { field, value }`, `penalty` |
| `chained-reveals` | Play top N cards of villain deck | `revealCount` |
| `wound-all` | Each player gains N wounds | `woundCount` |
| `ko-from-hq` | KO N heroes from the HQ | `koCount`, `costThreshold?` |
| `midtown-bank-robbery` | Villain in Bank captures bystanders + chain reveal | (none — self-contained) |

### Per-Resolver Param Expectations (v1)

Resolvers validate params at entry. Missing or malformed params push a
message and return (never throw). Generic effects still apply.

**`reveal-or-punish`**
- Required: `condition: { field: 'heroClass' | 'team', value: string }`
- Required: `penalty: 'gainWound' | 'discardHand'`
- Player iteration order: canonical `Object.keys(gameState.playerZones)`.
- Condition check: `gameState.cardTraits[cardId]` field equals value.

**`chained-reveals`**
- Required: `revealCount: number` (integer >= 1)
- Calls `performVillainReveal` exactly `revealCount` times unless the
  villain deck is exhausted, in which case stop early and push a message.

**`wound-all`**
- Required: `woundCount: number` (integer >= 1)
- Each player gains exactly `woundCount` wounds via `gainWound`. If the
  wound supply is exhausted mid-loop, stop early and push a message.

**`ko-from-hq`**
- Required: `koCount: number` (integer >= 1)
- Optional: `costThreshold: number`
- Selection: if `costThreshold` provided, eligible = HQ heroes with
  `cost <= costThreshold`. Otherwise all non-null HQ slots are eligible.
- Tie-break: sort eligible by `gameState.cardStats[cardId].cost`
  ascending; ties broken by HQ slot index (left-to-right, i.e., lower
  index first). This is deterministic and matches the physical game's
  left-to-right convention.
- KO up to `koCount` eligible cards. If fewer exist, KO all eligible and
  push a message.
- Each KO'd slot is refilled via `refillHqSlot`.

**`midtown-bank-robbery`**
- No params. Self-contained with locked constants (`BANK_CITY_INDEX`,
  `MIDTOWN_BYSTANDERS_PER_TWIST`). Behavior is identical to the existing
  `resolveMidtownBankRobberyTwist`.

### Core-Set Scheme Coverage

8 schemes in `core` set. 6 are covered by the 5 resolvers in v1:

| Scheme ext_id | Resolver | Params |
|---|---|---|
| `core/midtown-bank-robbery` | `midtown-bank-robbery` | (none) |
| `core/legacy-virus-the` | `reveal-or-punish` | `condition: { field: 'heroClass', value: 'tech' }, penalty: 'gainWound'` |
| `core/secret-invasion-of-the-skrull-shapeshifters` | `reveal-or-punish` | (verify card text for exact condition) |
| `core/negative-zone-prison-breakout` | `chained-reveals` | `revealCount: 2` |
| `core/unleash-the-power-of-the-cosmic-cube` | `wound-all` | `woundCount: 1` |
| `core/super-hero-civil-war` | `ko-from-hq` | `koCount: 2` (cheapest first) |

**Not covered in v1** (require new resolvers in future WPs):
- `core/portals-to-the-dark-dimension` — unique mechanic (dark dimension pile)
- `core/replace-earths-leaders-with-killbots` — unique mechanic (leader replacement)

## Acceptance Criteria

1. `schemeTwistConfig.types.ts` exports `SchemeTwistConfig`,
   `SchemeTwistResolverId`, and `SchemeTwistResolver` with exact shapes
   above.
2. `schemeTwistResolvers.ts` exports `SCHEME_TWIST_RESOLVERS` containing
   all 5 resolver functions keyed by their `SchemeTwistResolverId`.
3. `schemeTwistConfigs.ts` exports `SCHEME_TWIST_CONFIGS` as a
   `Map<string, SchemeTwistConfig>` with entries for every core-set scheme
   that matches one of the 5 resolvers.
4. `schemeHandlers.ts` dispatcher uses config-driven lookup — no `if/else`
   on `schemeId` (except the config-present/absent branch).
5. Midtown Bank Robbery behavior is identical before and after migration
   (existing tests pass without modification).
6. Each resolver pushes descriptive messages to `gameState.messages` for
   every significant action and for invalid/missing config params (never
   throws).
7. `buildGenericTwistEffects` logic is unchanged (counter increment +
   loss-check), but it accepts an explicit threshold parameter computed
   by the dispatcher (`config.lossThreshold ?? MVP_SCHEME_TWIST_THRESHOLD`).
8. Drift test A: every `resolverId` in `SCHEME_TWIST_CONFIGS` exists as a
   key in `SCHEME_TWIST_RESOLVERS`.
9. Drift test B: every config entry's map key equals its `config.schemeId`
   (prevents key/schemeId mismatch bugs).
10. No `boardgame.io` imports in any new file.
11. No `@legendary-arena/registry` imports in any file.
12. `pnpm --filter @legendary-arena/game-engine test` passes (819+ tests,
    0 fail).

## Verification Steps

```bash
# Build
pnpm -r build
# Expected: exits 0

# Tests
pnpm --filter @legendary-arena/game-engine test
# Expected: 819+ tests, 0 failures

# No boardgame.io imports in new files
grep -r "from 'boardgame.io" packages/game-engine/src/rules/schemeTwistConfig.types.ts packages/game-engine/src/rules/schemeTwistResolvers.ts packages/game-engine/src/rules/schemeTwistConfigs.ts
# Expected: 0 matches

# No registry imports
grep -r "@legendary-arena/registry" packages/game-engine/src/rules/schemeTwist*.ts
# Expected: 0 matches

# Dispatcher has no if/else on schemeId (only config lookup)
grep -c "schemeId ===" packages/game-engine/src/rules/schemeHandlers.ts
# Expected: 0

# All resolver IDs in config map exist in resolver map (covered by drift test)
```

## Definition of Done

- [ ] All 12 acceptance criteria pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` passes (0 failures)
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] `docs/ai/DECISIONS.md` updated with D-18201
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-182 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-209 status updated

## Vision Alignment

**Vision clauses touched:** §1 (tabletop faithfulness — scheme twist text
must match printed card behavior), §8 (determinism — resolvers use
`ctx.random.*` only when randomness is needed; the 4 shipped resolvers are
fully deterministic).

**Conflict assertion:** No conflict: this WP preserves all touched clauses.
The framework encodes printed scheme twist text faithfully. Resolvers are
deterministic pure functions that mutate G through established helpers.

**Determinism preservation:** All 5 resolvers are deterministic. None
introduce randomness. The `chained-reveals` resolver delegates to
`performVillainReveal` which uses `ctx.random.*` for shuffling (existing
deterministic path). No `Math.random()`, no wall-clock reads, no I/O.

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---|---|
| §1 | PASS | All required sections present |
| §2 | PASS | Engine-wide + packet-specific + session protocol + locked values |
| §3 | PASS | All dependencies listed with exports/shapes |
| §4 | PASS | Specific docs and sections listed |
| §5 | PASS | All 6 files listed with new/modified + descriptions |
| §6 | PASS | All names match 00.2 / prior packets (`schemeId`, `ext_id`, etc.) |
| §7 | N/A | No new npm dependencies |
| §8 | PASS | Engine-only; no server/registry/DB/WebSocket; all randomness via ctx.random.* |
| §9 | N/A | No shell scripts; engine-only TypeScript |
| §10 | N/A | No environment variables |
| §11 | N/A | No authentication surface |
| §12 | PASS | Tests use `node:test`; no boardgame.io imports; no network/DB |
| §13 | PASS | Exact pnpm commands with expected output |
| §14 | PASS | 12 binary, observable, specific acceptance criteria |
| §15 | PASS | Definition of Done includes STATUS.md via WORK_INDEX, DECISIONS.md, scope check |
| §16.1 | PASS | Resolver registry is used by dispatcher + all configs (>3 call sites) |
| §16.2 | PASS | No nested ternaries; no complex reduce; for...of loops |
| §16.3 | PASS | Full English names; descriptive loop variables |
| §16.4 | PASS | Each resolver ~10-25 lines; JSDoc on all functions |
| §16.5 | PASS | `// why:` on constants, thresholds, city indices |
| §16.6 | PASS | Named imports only; no barrel re-exports |
| §16.7 | PASS | Error messages are full sentences |
| §17 | PASS | Vision Alignment section present with clause citations |
| §18 | N/A | No literal-string-scoped grep gates that conflict with prose |
| §19 | N/A | No repo-state-summarizing artifacts |
| §20 | N/A | Engine-only; no UI surfaces, no user-visible copy, no funding channels |
| §21 | N/A | Engine-only; no HTTP endpoints, no `apps/server/src/**` library functions |
