---
title: Board Keywords
type: Concept
tags:
  - layer-engine
  - keyword-board
  - city
  - villain-deck
  - drift-detection
  - data-shape
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - rule-execution-pipeline.md
  - turn-system.md
  - cardextid.md
  - card-type-taxonomy.md
  - scoring.md
status: canonical
source:
  - ../../.claude/rules/game-engine.md
  - ../../packages/game-engine/src/board/boardKeywords.types.ts
  - ../../packages/game-engine/src/board/boardKeywords.logic.ts
  - ../../packages/game-engine/src/villainDeck/villainDeck.reveal.ts
  - ../ai/ARCHITECTURE.md
  - ../ai/work-packets/WP-025-keywords-patrol-ambush-guard.md
  - ../10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Board Keywords

## Summary

Board keywords are the engine's **structural City rules** — closed-set
labels attached to City cards that modify combat eligibility, fight
cost, or wound flow on entry. They are distinct from hero abilities:
they fire automatically without player choice and route through
their own helper API, not through the hero ability system. The
closed union has three values; adding a fourth requires updating the
union, the canonical array, the helper API, and any inline
dispatchers that read the keyword.

## Mechanics

### The closed union

`BoardKeyword` in
[`boardKeywords.types.ts`](../../packages/game-engine/src/board/boardKeywords.types.ts)
is a three-value union with a canonical readonly array:

```ts
export type BoardKeyword = 'patrol' | 'ambush' | 'guard';

export const BOARD_KEYWORDS: readonly BoardKeyword[] = [
  'patrol', 'ambush', 'guard',
] as const;
```

Drift-detection tests assert the array exactly matches the union;
the same drift-hazard pattern documented for the
[Rule Execution Pipeline](rule-execution-pipeline.md) closed sets
applies here.

### Storage shape

Keywords are stored on `G` as `Record<CardExtId, BoardKeyword[]>`:

```ts
G.cardKeywords: Record<CardExtId, BoardKeyword[]>
```

Each card may carry zero or more keywords. The map is built at
**setup time** from registry ability text (per WP-025) and is not
modified at runtime — keywords don't accrue or fall off during
play. A card with no keywords has no entry in the map (or an empty
array, depending on the source); `getCardKeywords` normalizes to
`[]`.

### The helper API

[`boardKeywords.logic.ts`](../../packages/game-engine/src/board/boardKeywords.logic.ts)
exposes four pure helpers — none mutate state, none import
`boardgame.io`, none use `.reduce()`:

| Helper | Returns | Reads |
|---|---|---|
| `getCardKeywords(cardId, cardKeywords)` | `BoardKeyword[]` | the keyword map |
| `getPatrolModifier(cardId, cardKeywords)` | `0` or `1` (additive fight-cost delta) | the keyword map |
| `isGuardBlocking(city, targetIndex, cardKeywords)` | `boolean` (true if any Guard at a higher index blocks) | the City zone + keyword map |
| `hasAmbush(cardId, cardKeywords)` | `boolean` | the keyword map |

Each helper takes the keyword map as an argument rather than reading
`G` directly, so they remain composable and testable in isolation.

### Per-keyword behaviour (structural)

The three keywords differ in **what they modify** and **when**:

- **Patrol** — additive fight-cost modifier evaluated when a
  player initiates combat against a City card. Returns +1 from
  `getPatrolModifier`. Stacks on top of `G.cardStats[cardId].fightCost`
  (no replacement).
- **Guard** — combat-eligibility filter evaluated against the City
  zone. `isGuardBlocking(city, targetIndex, …)` walks indices
  `targetIndex + 1 … 4` (toward the escape edge) and returns `true`
  if any of those positions holds a card with the `'guard'` keyword.
  The Guard card itself is *not* blocked — fighting the Guard
  removes the blocker.
- **Ambush** — wound-flow trigger evaluated on City entry. Detected
  via `hasAmbush`; the wound application happens **inline** in
  `revealVillainCard` (see Edge Cases / D-2403). Each player gains
  one wound when an Ambush card enters the City.

### Why Ambush is inline (D-2403)

Ambush wound application does **not** route through the
[Rule Execution Pipeline](rule-execution-pipeline.md). The
`RuleEffectType` closed union — `queueMessage`, `modifyCounter`,
`drawCards`, `discardHand` — has no `gainWound` member. Adding one
would mean expanding the union, the drift-detection array, and the
applier dispatch in `applyRuleEffects`. The MVP took the
inline-effect path instead: `revealVillainCard` calls `gainWound`
directly when `hasAmbush` returns true, the same pattern used for
escape-induced wounds. See
[`boardKeywords.logic.ts`](../../packages/game-engine/src/board/boardKeywords.logic.ts)
`hasAmbush` for the engine-source citation; D-2403 records the
intent to migrate to a `gainWound` `RuleEffect` in a future WP.

## Interactions

- **[Villain Deck](villain-deck.md).** `revealVillainCard` is the
  only place Ambush fires — Step 4 (City routing) of the reveal
  pipeline calls `hasAmbush` after pushing a villain or henchman
  into the City.
- **City.** All three keywords apply only to cards in `G.city` (the
  fixed 5-tuple). Guard's blocking direction is from higher index
  toward lower (toward the entry edge); the Guard card is closer to
  the escape edge than the cards it protects.
- **Combat (fight resolution).** Patrol's `+1` modifier and Guard's
  blocking check are read by combat resolution code — separate
  page; this entry is the keyword definition surface.
- **[Scheme](scheme.md).** The `addCityKeyword` scheme setup
  instruction (one of the four `SchemeSetupType` values, currently
  unstubbed at MVP returning `[]`) writes into `G.cardKeywords` at
  setup time. A future per-scheme instruction list could attach
  Patrol or Guard to specific City spaces as part of a scheme's
  initial board state.
- **[CardExtId](cardextid.md).** The keyword map is keyed by
  `CardExtId` and stores no card content — same engine-storage
  invariant as every other zone-adjacent map.
- **[Rule Execution Pipeline](rule-execution-pipeline.md).** Board
  keywords deliberately bypass the pipeline. They are documented
  here in part to make that boundary explicit: a future contributor
  who looks for "the Ambush rule hook" will not find one, by design.

## Edge Cases

- **Adding a fourth keyword is a four-site change.** Union, canonical
  array, helper API (a new `getX` / `hasX` predicate), and any
  inline dispatcher that reads the keyword (e.g.,
  `revealVillainCard` for entry-time effects, combat resolution for
  fight-time effects). Drift-detection tests catch the
  array-vs-union mismatch; the helper and dispatcher coverage is on
  the reviewer.
- **Slug case is significant.** Keywords are lowercase string
  literals — `'patrol'`, not `'Patrol'`. Builders that derive
  keywords from registry ability text must normalize before
  insertion or the helper checks (`keyword === 'patrol'`) will
  silently return zero.
- **Patrol is `0` or `1` only.** `getPatrolModifier` returns `1` if
  the card has Patrol, `0` otherwise — never `2` for a card with
  two `'patrol'` entries. The implementation returns on first match
  and does not accumulate. If multi-stack Patrol is ever needed, the
  helper signature must change.
- **Guard scan stops at index 4.** The City zone is a fixed 5-tuple;
  `isGuardBlocking` walks `targetIndex + 1 … 4` inclusive. The loop
  bound is hardcoded to `4` (the escape edge). If `CityZone` is
  ever converted to a dynamic array (the same migration that would
  unstub `modifyCitySize` on [Scheme](scheme.md)), this helper must
  be updated to read the city length rather than the literal `4`.
- **Ambush gates on wound-pile supply.** `revealVillainCard`'s
  inline application checks `G.piles.wounds.length > 0` before
  calling `gainWound`; once the wound supply is exhausted, Ambush
  degrades silently for remaining players. Not a keyword-helper
  concern, but a real edge case readers should expect.
- **Keyword text in registry data is not normative here.** The
  authoritative keyword *behaviour* lives in the engine helpers and
  inline dispatchers; registry ability text is the *source* from
  which keywords are derived at setup. Changing ability text after
  build time has no effect on `G.cardKeywords` for an already-
  running match.

## Code Touchpoints

- [`packages/game-engine/src/board/boardKeywords.types.ts`](../../packages/game-engine/src/board/boardKeywords.types.ts)
  — `BoardKeyword` union, `BOARD_KEYWORDS` array
- [`packages/game-engine/src/board/boardKeywords.logic.ts`](../../packages/game-engine/src/board/boardKeywords.logic.ts)
  — `getCardKeywords`, `getPatrolModifier`, `isGuardBlocking`,
  `hasAmbush`
- [`packages/game-engine/src/board/boardKeywords.logic.test.ts`](../../packages/game-engine/src/board/boardKeywords.logic.test.ts)
  — helper tests
- [`packages/game-engine/src/board/boardKeywords.integration.test.ts`](../../packages/game-engine/src/board/boardKeywords.integration.test.ts)
  — integration tests
- [`packages/game-engine/src/villainDeck/villainDeck.reveal.ts`](../../packages/game-engine/src/villainDeck/villainDeck.reveal.ts)
  — Ambush inline dispatcher (Step 4 of the reveal pipeline)
- [`packages/game-engine/src/setup/buildCardKeywords.ts`](../../packages/game-engine/src/setup/buildCardKeywords.ts)
  — setup-time builder that populates `G.cardKeywords`

## History

- WP-025: `BoardKeyword` union, `BOARD_KEYWORDS` canonical array, `G.cardKeywords` field, four pure helpers, and inline Ambush dispatch in the villain reveal pipeline introduced (D-2403 records the future-migration intent for Ambush)

## References

- [`.claude/rules/game-engine.md`](../../.claude/rules/game-engine.md)
  — Rule Execution Pipeline (clarifies why Ambush is inline rather
  than effect-routed); Zone Mutation Rules
- [`docs/ai/ARCHITECTURE.md`](../ai/ARCHITECTURE.md) — WP-025 review
  notes; `G.cardKeywords` field
- [`docs/10-GLOSSARY.md`](../10-GLOSSARY.md) — `BoardKeyword`,
  `BOARD_KEYWORDS`, `Patrol`, `Guard`, `Ambush`, `G.cardKeywords`
- [`docs/legendary-universal-rules-v23.md`](../legendary-universal-rules-v23.md)
  — tabletop semantics for Patrol, Guard, and Ambush
- [WP-025](../ai/work-packets/WP-025-keywords-patrol-ambush-guard.md)
