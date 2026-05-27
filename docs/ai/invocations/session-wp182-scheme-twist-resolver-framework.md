# Session Prompt — WP-182 / EC-209: Scheme Twist Resolver Framework

Draft WP-182 and EC-209, then execute. This WP replaces the per-scheme
`if/else` branching in `schemeHandlers.ts` with a data-driven resolver
framework so that new scheme twist behaviors can be added by configuration
rather than per-scheme functions. The WP also ships the first 4 reusable
parameterized resolvers covering the highest-frequency twist patterns
across all 40 Legendary sets (~191 schemes total).

---

## 1 — Problem

`schemeHandlers.ts` currently has one implemented scheme resolver (Midtown
Bank Robbery) and an implicit fallback for all others. 7 of 8 core-set
schemes and 183 of 191 total schemes have no twist behavior. The current
dispatch pattern is a growing `if/else` chain on
`gameState.selection.schemeId` — this won't scale to 191 schemes. We need
a data-driven framework.

## 2 — Design: SchemeTwistConfig + Resolver Registry

### 2a — SchemeTwistConfig type

Define a new `SchemeTwistConfig` interface in a new file
`packages/game-engine/src/rules/schemeTwistConfig.types.ts`:

```typescript
export interface SchemeTwistConfig {
  schemeId: string;               // e.g. 'core/legacy-virus-the'
  resolverId: SchemeTwistResolverId;  // e.g. 'reveal-or-punish'
  params: Record<string, unknown>;    // resolver-specific parameters
  lossThreshold?: number;         // override MVP_SCHEME_TWIST_THRESHOLD (default 7)
}
```

`SchemeTwistResolverId` is a union of the 4 resolver names shipped in
this WP (extensible by future WPs):

```typescript
export type SchemeTwistResolverId =
  | 'reveal-or-punish'
  | 'chained-reveals'
  | 'wound-all'
  | 'ko-from-hq';
```

### 2b — Resolver function signature

Each resolver is a pure function:

```typescript
type SchemeTwistResolver = (
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
  params: Record<string, unknown>,
) => void;
```

Resolvers mutate `G` directly (same pattern as existing
`resolveMidtownBankRobberyTwist`). They push messages to
`gameState.messages`. They do NOT return `RuleEffect[]` — the generic
counter-increment + loss-check effects are appended by the dispatcher
after the resolver runs (existing `buildGenericTwistEffects` pattern).

### 2c — Resolver registry

A simple `Record<SchemeTwistResolverId, SchemeTwistResolver>` in a new
file `packages/game-engine/src/rules/schemeTwistResolvers.ts`. No factory,
no class — just a plain map of resolver functions.

### 2d — Config registry

A `Map<string, SchemeTwistConfig>` or `Record<string, SchemeTwistConfig>`
in `packages/game-engine/src/rules/schemeTwistConfigs.ts`. Keyed by scheme
ext_id (e.g. `'core/legacy-virus-the'`). Contains entries for every
core-set scheme + any others the 4 resolvers can handle.

### 2e — Dispatcher rewrite

Rewrite `schemeTwistHandler` in `schemeHandlers.ts`:

1. Look up `SchemeTwistConfig` by `gameState.selection.schemeId`
2. If found, look up the resolver by `config.resolverId`, call it with
   `config.params`
3. If no config found, log a message (existing fallback behavior —
   counter increment only)
4. Call `buildGenericTwistEffects(gameState)` and return effects (unchanged)
5. Use `config.lossThreshold` if present, otherwise keep
   `MVP_SCHEME_TWIST_THRESHOLD` default

Midtown Bank Robbery migrates into this framework as well (either its own
resolver or inline — it's unique enough that keeping it as a special case
in the config is fine, but it should use the new dispatch path).

## 3 — The 4 Resolvers

### 3a — `reveal-or-punish`

**Pattern:** "Each player reveals a [heroClass/team] hero or [suffers
penalty]."

**Params:**

```typescript
{
  condition: { field: 'heroClass' | 'team'; value: string };
  penalty: 'gainWound' | 'discardHand';
}
```

**Implementation:**

- For each player (`Object.keys(gameState.playerZones)`):
  - Check if ANY card in hand matches the condition using
    `gameState.cardTraits[cardId]`
  - If match found: push message "[Scheme] Player X reveals [cardName]
    — condition met."
  - If no match: apply penalty
    - `'gainWound'`: call
      `gainWound(gameState.piles.wounds, playerZones.discard)` and apply
      results
    - `'discardHand'`: move all hand to discard (use `moveAllCards` from
      `zoneOps.ts`)

**Core schemes using this pattern:**

- `core/legacy-virus-the` — "Each player reveals a [Tech] hero or gains
  a Wound" →
  `{ condition: { field: 'heroClass', value: 'tech' }, penalty: 'gainWound' }`
- `core/secret-invasion-of-the-skrull-shapeshifters` — similar pattern
  (check card text for exact condition)

**Key G paths:**

- `gameState.cardTraits[cardId].heroClass` / `.team` — setup-time
  snapshot per card
- `gameState.playerZones[playerId].hand` — current hand cards
- `gameState.piles.wounds` — wound supply
- Helper: `gainWound()` from `board/wounds.logic.ts`
- Helper: `moveAllCards()` from `moves/zoneOps.ts`

### 3b — `chained-reveals`

**Pattern:** "Play the top N cards of the Villain Deck."

**Params:**

```typescript
{
  revealCount: number;  // e.g. 2
}
```

**Implementation:**

- Call `performVillainReveal(gameState, context, implementationMap)` N
  times in a loop
- Each call runs the full reveal pipeline (city routing, triggers,
  effects)
- Push message "[Scheme] Twist: revealing {N} cards from the villain
  deck."

**Core schemes:**

- `core/negative-zone-prison-breakout` — "Play two cards from the Villain
  Deck" → `{ revealCount: 2 }`

**Key import:**

- `performVillainReveal` from `villainDeck/villainDeck.reveal.ts`
  (already imported in schemeHandlers.ts)

### 3c — `wound-all`

**Pattern:** "Each player gains N Wound(s)."

**Params:**

```typescript
{
  woundCount: number;    // base wounds per player
  escalate?: boolean;    // if true, wound count = twistPile.length (escalating)
}
```

**Implementation:**

- For each player:
  - Determine actual wound count:
    `escalate ? gameState.scheme.twistPile.length : params.woundCount`
  - Call `gainWound()` that many times
  - Push message

**Core schemes:**

- `core/unleash-the-power-of-the-cosmic-cube` — "Each player gains a
  Wound" → `{ woundCount: 1 }`

**Key G paths:**

- `gameState.scheme.twistPile.length` for escalating count
- `gameState.piles.wounds` — wound supply
- Player iteration: `Object.keys(gameState.playerZones)`

### 3d — `ko-from-hq`

**Pattern:** "KO N hero(es) from the HQ."

**Params:**

```typescript
{
  koCount: number;  // e.g. 2
  costThreshold?: number;  // optional: "KO heroes with cost <= N"
}
```

**Implementation:**

- Scan `gameState.hq` (5-slot `(CardExtId | null)[]`)
- For each non-null slot (up to koCount):
  - If `costThreshold` set, check
    `gameState.cardStats[cardId].cost <= costThreshold`
  - Remove card from HQ slot (set to null)
  - Append to `gameState.ko` via `koCard()` from `board/ko.logic.ts`
  - Refill the slot via `refillHqSlot()` from `board/city.logic.ts`
  - Push message
- If fewer heroes available than koCount, KO what's there (deterministic
  partial)

**Core schemes:**

- `core/super-hero-civil-war` — "KO the two cheapest Heroes from the HQ"
  (needs cost sort + koCount=2)

**Key G paths:**

- `gameState.hq` — `(CardExtId | null)[]` 5-tuple
- `gameState.ko` — `CardExtId[]` (destination-only zone)
- `gameState.heroDeck` — `CardExtId[]` (for refill)
- `gameState.cardStats[cardId].cost` — card cost for threshold/sort
- Helper: `koCard()` from `board/ko.logic.ts`
- Helper: `refillHqSlot()` from `board/city.logic.ts`

## 4 — Midtown Bank Robbery Migration

Migrate the existing `resolveMidtownBankRobberyTwist` into the framework.
Options:

- Keep it as its own resolver (e.g. `'midtown-bank-robbery'`) since it's
  unique
- Or inline it as config + a `'capture-bystanders-and-reveal'` resolver
  if the pattern recurs

Either way it must use the new dispatch path — no special-case `if` in
the dispatcher.

## 5 — File Plan

| File | Action |
|---|---|
| `src/rules/schemeTwistConfig.types.ts` | **New** — `SchemeTwistConfig`, `SchemeTwistResolverId` |
| `src/rules/schemeTwistResolvers.ts` | **New** — 4 resolver functions + resolver registry map |
| `src/rules/schemeTwistConfigs.ts` | **New** — config entries for core-set schemes |
| `src/rules/schemeHandlers.ts` | **Modify** — rewrite dispatcher to config-driven lookup |
| `src/rules/schemeTwistResolvers.test.ts` | **New** — unit tests for each resolver |
| `src/rules/schemeTwistConfigs.test.ts` | **New** — drift test: every config's resolverId exists in the resolver registry |

All paths are relative to `packages/game-engine/`.

## 6 — Existing Infrastructure (Do Not Modify)

These files are **read-only context** — use them, don't change them:

- `ruleHooks.types.ts` — `RuleEffect` tagged union (4 types:
  `queueMessage`, `modifyCounter`, `drawCards`, `discardHand`)
- `ruleRuntime.effects.ts` — `applyRuleEffects()` executor
- `ruleRuntime.impl.ts` — `DEFAULT_IMPLEMENTATION_MAP`,
  `buildDefaultHookDefinitions()`
- `villainDeck.reveal.ts` — `performVillainReveal()` (already imported
  in schemeHandlers.ts)
- `board/wounds.logic.ts` — `gainWound(woundsPile, playerDiscard):
  GainWoundResult`
- `board/ko.logic.ts` — `koCard(koPile, cardId): CardExtId[]`
- `board/city.logic.ts` — `refillHqSlot(hq, hqIndex, heroDeck):
  RefillHqSlotResult`
- `moves/zoneOps.ts` — `moveAllCards()`, `moveCardFromZone()`
- `state/cardTraits.types.ts` — `CardTraitEntry { heroClass: string |
  null; team: string | null }`
- `types.ts` — `LegendaryGameState` (see G paths in §3 above)

**New RuleEffect types:** If a resolver needs an effect type that doesn't
exist (e.g. `gainWound`), do NOT add it to `RuleEffect`. Resolvers mutate
G directly — they're pre-effect. Only the generic counter/loss-check runs
through the effect pipeline.

## 7 — Constraints

- No `.reduce()` for multi-step operations — use `for...of`
- No `boardgame.io` imports in the new files (except `schemeHandlers.ts`
  which already has none)
- No `Math.random()` — determinism through `ctx.random.*` only
- All zone mutations through helpers (`gainWound`, `koCard`,
  `refillHqSlot`, `moveAllCards`)
- `// why:` comments on every non-obvious constant and control flow
  decision
- Test runner: `node:test` with `.test.ts` extension
- Full English variable names — no abbreviations
- Each resolver function gets its own JSDoc
- Push descriptive messages to `gameState.messages` for every significant
  action
- `pnpm --filter game-engine test` must pass (819+ tests, 0 fail)
- `pnpm -r build` must exit 0

## 8 — Governance

- WP number: **WP-182**
- EC number: **EC-209**
- Hard-deps: WP-009B (rule execution pipeline) ✅, WP-153 (destination
  piles — `scheme.twistPile`) ✅, WP-179 (cardTraits) ✅
- Register WP-182 in `WORK_INDEX.md` and EC-209 in `EC_INDEX.md` before
  executing
- Commit prefix: `EC-209:` for code changes, `SPEC:` for governance files
- Add a `DECISIONS.md` entry for the data-driven resolver pattern (e.g.
  D-18201)
- Read `docs/ai/REFERENCE/01.1-how-to-use-ecs-while-coding.md` before
  starting
- Read `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` and satisfy the
  lint gate on the WP draft

## 9 — Out of Scope

- Master Strike resolvers (future WP-B)
- Villain fight-effect resolvers (future WP-C)
- Non-core-set scheme configs (future WPs — add configs as data, no code
  changes needed once framework exists)
- Per-player-count variable twist thresholds (WP-169 carve-out; future
  schema+engine WP)
- UI changes (none needed — messages already flow through `G.messages` →
  UIState `log`)
