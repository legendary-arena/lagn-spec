# WP-179 — Card Traits Resolution & Superpower Condition Evaluation

## Goal

Wire the two placeholder condition evaluators (`heroClassMatch` and
`requiresTeam`) so hero superpowers actually fire based on play order.
Today both return `false` unconditionally because hero class and team
data are not resolved into `G` at runtime (D-2302). This WP:

1. Introduces `G.cardTraits` — a setup-time lookup table mapping
   `CardExtId` to categorical card attributes (hero class, team).
2. Adds `[team:X]` markup parsing to `heroAbility.setup.ts` (currently
   only `[hc:X]` is parsed; `[team:X]` appears 231 times across 37 sets).
3. Wires both `heroClassMatch` and `requiresTeam` evaluators to read
   from `G.cardTraits`.
4. Fixes self-card exclusion: a card's superpower should require
   *another* card of the matching class/team already in `inPlay`, not
   count itself.

After this WP, playing a Tech card then another Tech card with
`[hc:tech]: Draw a Card` will actually draw. Same for team-based
triggers like `[team:avengers]: +3 Attack for each other Avenger`.

## Assumes

- WP-021 / WP-022 / WP-023 — hero ability hooks, execution, and
  condition evaluation framework are complete and stable
- `G.heroAbilityHooks` is built at setup time and immutable at runtime
- `evaluateCondition()` dispatches on `condition.type` string
- `heroClassMatch` conditions are already emitted by `parseAbilityText()`
  from `[hc:X]` markup
- `requiresTeam` conditions exist as a switch case but no code currently
  emits conditions with `type: 'requiresTeam'`
- HeroSchema has `team: string` at the hero-group level (not per-card)
- HeroCardSchema has `hc: HeroClassSchema.optional()` per-card
- Card data uses `[team:X]` markup in ability text (231 occurrences,
  37 sets)
- `executeHeroEffects()` is called from `playCard` *after* the card is
  moved into `inPlay` (line 111 before line 122 in coreMoves.impl.ts)
- In the current ruleset, `inPlay` contains only hero/starter cards
  sourced from selected hero decks + starters; other card types
  (villains, bystanders, scheme twists) do not enter `inPlay`
- Superpower prerequisites are evaluated against
  `playerZones[playerID].inPlay` as the engine's canonical "played
  this turn" zone
- Baseline: `origin/main` at session start

## Context

The Legendary card game's central player-facing mechanic is the
superpower: a conditional ability that fires only when a prerequisite
card (matching hero class or team) has already been played this turn.
Play order is the primary tactical decision during a player's turn.

The engine already has the full plumbing — hooks, conditions, effects —
but the two most important condition types are stubbed. D-2302 explicitly
deferred them, noting that hero class and team data need to be resolved
into `G` before evaluation can work. This WP closes that gap.

### Why `G.cardTraits` instead of extending `CardStatEntry`

`G.cardStats` holds economy values (attack, recruit, cost, fightCost).
Mixing categorical attributes (hero class, team) into it conflates
two concerns. `G.cardTraits` follows the established sibling-snapshot
pattern:

| Snapshot | Resolves | Built by |
|----------|----------|----------|
| `G.cardStats` | Economy values | `buildCardStats()` |
| `G.cardDisplayData` | UI display data | `buildCardDisplayData()` |
| `G.cardKeywords` | Board keywords | `buildCardKeywords()` |
| `G.heroAbilityHooks` | Ability hooks | `buildHeroAbilityHooks()` |
| **`G.cardTraits`** | **Categorical attributes** | **`buildCardTraits()`** |

Each snapshot resolves a different slice of registry data at setup time.
`cardTraits` is extensible — future WPs can add `rarity`, `cost` tier,
or other categorical fields without touching economy types.

### ID Contract

Zones store `CardExtId` strings directly (`Zone = CardExtId[]` per
`zones.types.ts`). There is no separate instance-id layer. However,
hero cards with multiple copies use **copy-suffixed ext_ids**:
`core/black-widow/mission-accomplished#0` through `#4` (D-13702).

`G.cardTraits` is keyed by these same copy-suffixed `CardExtId` strings.
The builder must emit an entry for **every copy**, not just the base
ext_id. This is the same fan-out pattern used by `buildCardStats()`
and `buildCardDisplayData()`.

**Invariant:** for every `id` in `G.playerZones[playerID].inPlay`,
`G.cardTraits[id]` resolves to a defined `CardTraitEntry` (or the
evaluator safely returns `false` on `undefined`).

### Self-card exclusion

When `playCard` runs, the sequence is:
1. Move card from `hand` → `inPlay` (line 111)
2. Add base stats (line 117)
3. Call `executeHeroEffects()` (line 122)

At step 3, the played card is already in `inPlay`. A superpower with
`[hc:tech]` means "if you've played *another* Tech card." If we check
`inPlay` as-is, the card counts itself — wrong. The evaluator must
exclude the triggering card's own `cardId`.

This requires threading `cardId` through `evaluateCondition` (or a
context object), which is a small contract extension to `HeroCondition`
evaluation. The alternative (requiring >= 2 matching cards) is fragile
because future mechanics might legitimately count self.

### Normalization Rules

Hero class and team values must be byte-for-byte consistent across
three sites: the `[hc:X]`/`[team:X]` markup parser, the
`CardTraitEntry` builder, and the condition evaluator.

**Normalization helper**: `normalizeTraitSlug(raw: string): string`
— `raw.trim().toLowerCase()`. No space-to-hyphen conversion needed
because the card data pipeline already uses hyphens. Defined once in
`packages/game-engine/src/state/traits.normalize.ts` and imported by
both the markup parser (`heroAbility.setup.ts`) and the trait builder
(`buildCardTraits.ts`). This prevents a future refactor from
accidentally producing two competing normalizers.

- **Hero class**: `hc` field on `HeroCardSchema` is validated by
  `HeroClassSchema = z.enum(["covert","instinct","ranged","strength","tech"])`.
  Pipeline-produced values are already lowercase, but both the
  parser and builder still apply `normalizeTraitSlug()` for
  defense-in-depth. A single authoring slip like `[hc:Tech]` would
  otherwise silently break superpowers.

- **Team**: `team` field on `HeroSchema` is a free-form `z.string()`.
  Card data uses hyphenated lowercase slugs (`"avengers"`,
  `"spider-friends"`, `"heroes-of-wakanda"`). The `[team:X]` markup
  in ability text uses the same slug form. Both the parser and the
  builder normalize via the shared helper.

  **Test cases**: `[team:Avengers]` -> `avengers`;
  `[team: spider-friends ]` -> `spider-friends`;
  `[hc:Tech]` -> `tech`.

## Scope (In)

### Engine — shared normalization helper

- `packages/game-engine/src/state/traits.normalize.ts` — **CREATE**.
  Exports `normalizeTraitSlug(raw: string): string`. Single source of
  truth, imported by both the markup parser and the trait builder.

### Engine — card traits resolution

- `packages/game-engine/src/state/cardTraits.types.ts` — **CREATE**.
  `CardTraitEntry` interface (`heroClass: string | null`,
  `team: string | null`).
- `packages/game-engine/src/setup/buildCardTraits.ts` — **CREATE**.
  Setup-time builder. Structural `CardTraitsRegistryReader` interface
  (same layer-boundary pattern as `CardStatsRegistryReader`). Must
  enumerate the same in-game `CardExtId` universe as `buildCardStats()`
  to guarantee coverage for all zone entries (single enumeration
  authority). Walks hero cards from selected hero decks; reads `hc`
  per card (normalized via `normalizeTraitSlug()`), `team` per hero
  group (also normalized). Non-hero cards (starters, villains,
  bystanders) get `{ heroClass: null, team: null }`. Must fan out per
  copy using the `#N` copy-suffix pattern (same as `buildCardStats`
  and `buildCardDisplayData`).
- `packages/game-engine/src/setup/buildCardTraits.test.ts` — **CREATE**.
- `packages/game-engine/src/types.ts` — **MODIFY**. Add `cardTraits`
  field to `LegendaryGameState`.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **MODIFY**.
  Call `buildCardTraits()` and assign to `G.cardTraits`.

### Engine — markup parsing (`[team:X]` + `[hc:X]` normalization)

- `packages/game-engine/src/setup/heroAbility.setup.ts` — **MODIFY**.
  Add `TEAM_PATTERN = /\[team:([^\]]+)\]/g` regex. Parse into
  `{ type: 'requiresTeam', value: normalizeTraitSlug(teamSlug) }`
  conditions. Same extraction pattern as `[hc:X]` -> `heroClassMatch`.
  Also apply `normalizeTraitSlug()` to existing `[hc:X]` captured
  values (defense-in-depth; pipeline already produces lowercase, but
  a single authoring slip like `[hc:Tech]` should not silently break).
  Import `normalizeTraitSlug` from `state/traits.normalize.ts`.
  Markup tokens removed from ability text after extraction (same as
  existing `[hc:X]` behavior).
- `packages/game-engine/src/setup/heroAbility.setup.test.ts` — **MODIFY**.
  Test `[team:avengers]` markup produces `requiresTeam` conditions.
  Test mixed markup `[hc:tech][team:avengers]` emits both conditions
  in stable order (hero class conditions first, then team conditions).
  Test mixed-case parsing: `[hc:Tech]` -> condition value `tech`;
  `[team: Avengers ]` -> condition value `avengers`.

### Engine — condition evaluation wiring

- `packages/game-engine/src/hero/heroConditions.evaluate.ts` —
  **MODIFY**. Replace both placeholders:
  - `heroClassMatch`: iterate `inPlay` excluding `triggeringCardId`,
    check `G.cardTraits[playedCardId]?.heroClass === condition.value`.
  - `requiresTeam`: iterate `inPlay` excluding `triggeringCardId`,
    check `G.cardTraits[playedCardId]?.team === condition.value`.
  - Add `triggeringCardId` parameter (the triggering card to exclude
    from self-check).
  - If `G.cardTraits` is undefined or missing for a card, return
    `false` (safe skip, same as WP-023 pattern).
- `packages/game-engine/src/hero/heroConditions.evaluate.test.ts` —
  **MODIFY**. Test both condition types with real `G.cardTraits` data.
  Test self-exclusion. Test undefined/missing trait entries.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **MODIFY**.
  Thread `cardId` through to `evaluateAllConditions`.

  **Call-site inventory for signature change:**
  - `heroEffects.execute.ts` `executeHeroEffects()` — passes `cardId`
  - `heroEffects.execute.test.ts` — update test calls
  - `heroConditions.evaluate.test.ts` — update test calls
  - `heroEffects.conditional.test.ts` — update test calls (if exists)
  - No other callers of `evaluateCondition` or `evaluateAllConditions`
    exist outside these files (verify with grep gate).

### Engine — UI projection (additive)

- `packages/game-engine/src/ui/uiState.types.ts` — **MODIFY**.
  Add optional `heroClass: string | null` and `team: string | null`
  to `UICardDisplay` (additive; existing consumers unaffected).
  Fields are typed optional (`?`) for backward compatibility with
  existing test fixtures that construct `UICardDisplay` objects.
- `packages/game-engine/src/ui/uiState.build.ts` — **MODIFY**.
  Populate `heroClass` and `team` on **every** `UICardDisplay`
  emitted at runtime — always assign both keys (string value or
  `null`), never omit. This guarantees a stable runtime shape
  despite the optional TS typing. If `G.cardTraits` lookup returns
  undefined, project `null`.

## Scope (Out)

- New `StagingArea.vue` UI component — separate client WP (depends
  on this WP landing `heroClass`/`team` on `UICardDisplay`)
- Class/team color indicators on `CardTile.vue` — separate client WP
- Dual-class hero cards (cards with two `[hc:X]` markups counting as
  both) — the evaluator already loops `inPlay`, so this works
  naturally for condition-checking; dual-class *on the card itself*
  (a card that *is* two classes) requires `CardTraitEntry` to support
  arrays; deferred. For now, if a card's registry `hc` has only one
  value (which is true for all current data), that value is stored.
  If multiple `hc` values were ever present, the first in registry
  order is stored (deterministic pick rule).
- Team-based magnitude scaling (e.g., "+3 Attack for each other
  Avenger") — requires a new effect type, not a condition change;
  separate WP
- `rarity`, `cost`, or other future `CardTraitEntry` fields — additive
  in a future WP
- Villain/henchman/mastermind traits — hero traits only in this WP;
  villain condition types are a separate concern
- Scheme / mastermind ability condition evaluation
- Content validation updates for `[team:X]` markup
- `buildCardDisplayData.ts` modification — traits are projected at
  UIState build time from `G.cardTraits`, not baked into display data
  at setup time (display data is presentation; traits are gameplay)

## Files Expected to Change

| File | Action |
|------|--------|
| `packages/game-engine/src/state/traits.normalize.ts` | CREATE |
| `packages/game-engine/src/state/cardTraits.types.ts` | CREATE |
| `packages/game-engine/src/setup/buildCardTraits.ts` | CREATE |
| `packages/game-engine/src/setup/buildCardTraits.test.ts` | CREATE |
| `packages/game-engine/src/types.ts` | MODIFY |
| `packages/game-engine/src/setup/buildInitialGameState.ts` | MODIFY |
| `packages/game-engine/src/setup/heroAbility.setup.ts` | MODIFY |
| `packages/game-engine/src/setup/heroAbility.setup.test.ts` | MODIFY |
| `packages/game-engine/src/hero/heroConditions.evaluate.ts` | MODIFY |
| `packages/game-engine/src/hero/heroConditions.evaluate.test.ts` | MODIFY |
| `packages/game-engine/src/hero/heroEffects.execute.ts` | MODIFY |
| `packages/game-engine/src/hero/heroEffects.execute.test.ts` | MODIFY |
| `packages/game-engine/src/hero/heroEffects.conditional.test.ts` | MODIFY (if exists) |
| `packages/game-engine/src/ui/uiState.types.ts` | MODIFY |
| `packages/game-engine/src/ui/uiState.types.drift.test.ts` | MODIFY (01.5 wiring cascade) |
| `packages/game-engine/src/ui/uiState.build.ts` | MODIFY |

## Contract

### CardTraitEntry (new type)

```ts
/** Categorical card attributes resolved at setup time from registry data. */
export interface CardTraitEntry {
  /** Hero class: "covert" | "instinct" | "ranged" | "strength" | "tech" | null. */
  heroClass: string | null;
  /** Hero team: "avengers" | "x-men" | "spider-friends" | ... | null. */
  team: string | null;
}
```

`G.cardTraits: Record<CardExtId, CardTraitEntry>` — built once at
setup, immutable at runtime. Keyed by the same copy-suffixed
`CardExtId` strings that appear in zones (e.g.,
`core/black-widow/mission-accomplished#0`). Cards without a class or
team get `null` for those fields.

### ID Contract

Zone entries are `CardExtId` strings. `G.cardTraits` keys are `CardExtId`
strings. Same type — direct lookup, no resolver needed. The builder
must emit entries for every copy-suffixed instance (fan-out pattern
from `buildCardStats` / `buildCardDisplayData`).

`triggeringCardId` is also a `CardExtId` — the same value that was in
`hand` before `playCard` moved it to `inPlay`.

### Normalization helper

```ts
// File: packages/game-engine/src/state/traits.normalize.ts
/** Single canonical normalization path for trait slugs. */
export function normalizeTraitSlug(raw: string): string {
  return raw.trim().toLowerCase();
}
```

Defined once in `state/traits.normalize.ts`. Imported by:
- `heroAbility.setup.ts` — normalizes both `[hc:X]` and `[team:X]`
  captured values at parse time
- `buildCardTraits.ts` — normalizes `hc` and `team` values read from
  the registry at build time

Both `[hc:X]` and `[team:X]` values are normalized for
defense-in-depth. Pipeline-produced hero class values are already
lowercase (validated by `HeroClassSchema` enum), but applying the
helper at both sites makes the engine resilient to minor content
drift.

### Condition evaluator signature change

```ts
// Before (WP-023):
evaluateCondition(G, playerID, condition): boolean
evaluateAllConditions(G, playerID, conditions): boolean

// After (WP-179):
evaluateCondition(G, playerID, condition, triggeringCardId?): boolean
evaluateAllConditions(G, playerID, conditions, triggeringCardId?): boolean
```

- `triggeringCardId` is the zone-entry `CardExtId` for the card whose
  superpower is being evaluated.
- If omitted, behavior matches WP-023 exactly (backward compatible).
- Only `heroClassMatch` and `requiresTeam` consult `triggeringCardId`;
  `requiresKeyword` and `playedThisTurn` ignore it.
- `evaluateAllConditions` forwards `triggeringCardId` to each
  `evaluateCondition` call.

### UICardDisplay additive fields

```ts
// Additive — existing consumers unaffected
interface UICardDisplay {
  // ... existing fields (extId, name, imageUrl, cost)
  heroClass?: string | null;  // NEW — null when card has no class
  team?: string | null;       // NEW — null when card has no team
}
```

Fields are typed optional (`?`) for backward compatibility with
existing test fixtures. At runtime, `uiState.build.ts` **always
assigns both keys** to every `UICardDisplay` it emits (string value
or `null`). The optional typing prevents compile errors in tests
that predate this WP; the runtime guarantee prevents `undefined`
from leaking to the UI.

## Definition of Done

- [ ] `G.cardTraits` is populated at setup time for all hero-deck cards
      (including all copy-suffixed instances)
- [ ] `normalizeTraitSlug` helper defined in `state/traits.normalize.ts`
      and imported by both the markup parser and the trait builder
- [ ] `normalizeTraitSlug` applied to both `[hc:X]` and `[team:X]`
      captured values (defense-in-depth)
- [ ] `[team:X]` markup in ability text produces `requiresTeam`
      conditions with normalized slug values
- [ ] Mixed-case parsing: `[hc:Tech]` -> `tech`,
      `[team: Avengers ]` -> `avengers`
- [ ] Mixed markup `[hc:tech][team:avengers]` emits both condition
      types in stable order
- [ ] Parser emits conditions in deterministic order independent of
      markup position in text: all `heroClassMatch` first, then
      `requiresTeam`
- [ ] `heroClassMatch` evaluator returns `true` when a matching-class
      card (other than self) is already in `inPlay`
- [ ] `heroClassMatch` evaluator returns `false` when no matching-class
      card is in `inPlay` (self doesn't count)
- [ ] `requiresTeam` evaluator returns `true` when a matching-team
      card (other than self) is already in `inPlay`
- [ ] `requiresTeam` evaluator returns `false` when no matching-team
      card is in `inPlay` (self doesn't count)
- [ ] Missing/undefined `G.cardTraits` entry returns `false` (safe skip)
- [ ] ID invariant proven: a test asserts that for every `id` in a
      populated `G.playerZones[playerID].inPlay`, trait lookup
      succeeds (returns a defined entry)
- [ ] Integration test: play a Tech card, then play another Tech card
      with `[hc:tech]: Draw a Card` — draw fires
- [ ] Integration test: play an Avengers card, then play another
      Avengers card with `[team:avengers]` condition — condition passes
- [ ] Integration tests assert both that the condition evaluated to
      `true` AND that the side effect occurred (not just one or other)
- [ ] `UICardDisplay` carries `heroClass` and `team` for client use
      (null when trait lookup fails, never undefined)
- [ ] Grep gate: `evaluateCondition` and `evaluateAllConditions` are
      called only from the inventoried call sites (no unpatched callers)
- [ ] All existing tests pass (no regression)
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` (game-engine) exits 0

## Hard Dependencies

- WP-021 — Hero Card Text & Keywords (hooks) ✅
- WP-022 — Execute Hero Keywords (MVP) ✅
- WP-023 — Conditional Hero Effects ✅
- WP-111 — UIState card display projection ✅

## Decisions Required

- **D-17901 — `G.cardTraits` sibling snapshot**: New `G` field following
  the `cardStats` / `cardDisplayData` / `cardKeywords` pattern. Contains
  categorical attributes only (hero class, team). Extensible for future
  attributes (rarity, cost tier). Does not duplicate economy data.
  Keyed by copy-suffixed `CardExtId` (same fan-out as sibling snapshots).

- **D-17902 — Self-card exclusion via `triggeringCardId` parameter**:
  `evaluateCondition` and `evaluateAllConditions` gain an optional
  trailing parameter. When provided, `heroClassMatch` and `requiresTeam`
  skip the triggering card in the `inPlay` scan. This matches the
  physical card game rule: superpowers require *another* card of the
  same class/team to have been played. Other condition types ignore it.

- **D-17903 — `[team:X]` parsed to `requiresTeam` condition type**:
  Mirrors the existing `[hc:X]` -> `heroClassMatch` pattern. The
  `requiresTeam` switch case already exists in `evaluateCondition`
  (WP-023); this WP adds the emission side and wires the evaluation
  side. Values normalized via `normalizeTraitSlug()`.

- **D-17904 — Normalization contract**: single `normalizeTraitSlug()`
  helper (trim + lowercase) defined in `state/traits.normalize.ts`,
  imported by both the markup parser and the trait builder. Applied
  to both `[hc:X]` and `[team:X]` values for defense-in-depth. Hero
  class values are additionally validated by `HeroClassSchema` enum.
  Team slugs are free-form strings from `HeroSchema.team`; the helper
  is the sole normalization gate.

## Risks

- **Dual-class cards**: Some cards have two `[hc:X]` markups (e.g.,
  `[hc:ranged][hc:covert]` — "Critical Hit" superpowers). The
  condition evaluator naturally handles these because each `[hc:X]`
  produces a separate `HeroCondition` entry, and `evaluateAllConditions`
  uses AND logic. However, `CardTraitEntry.heroClass` stores only one
  class. A card that *is* dual-class (not one that *requires* dual-
  class) would need `heroClass: string[]`. This WP stores only the
  first/primary class; if the registry `hc` field has a single value
  (true for all current data), that value is stored. Deterministic
  pick rule: first in registry order. A follow-up WP addresses
  dual-class identity if needed.

- **Team on hero group vs. card**: `team` lives on `HeroSchema` (the
  hero group level), not `HeroCardSchema` (individual card). All cards
  in a hero deck share the same team. This is correct for all currently
  known data. If future sets introduce per-card team overrides, the
  builder would need to check card-level data first.

- **Copy-suffix fan-out omission**: if `buildCardTraits` emits only
  the base ext_id without copy suffixes, every zone lookup will return
  `undefined` and superpowers will silently never fire. Mitigated by
  the ID invariant test in DoD.
