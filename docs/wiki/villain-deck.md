---
title: Villain Deck
type: System
tags:
  - layer-engine
  - villain-deck
  - phase-play
  - stage-start
  - trigger
related:
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - rule-execution-pipeline.md
  - turn-system.md
  - cardextid.md
  - card-type-taxonomy.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../../.claude/rules/game-engine.md
  - ../../packages/game-engine/src/villainDeck/villainDeck.types.ts
  - ../../packages/game-engine/src/villainDeck/villainDeck.reveal.ts
  - ../../packages/game-engine/src/villainDeck/villainDeck.setup.ts
  - ../ai/ARCHITECTURE.md
  - ../ai/work-packets/WP-014A-villain-reveal-pipeline.md
  - ../ai/work-packets/WP-014B-villain-deck-composition.md
  - ../ai/work-packets/WP-015-city-hq-zones-villain-movement.md
  - ../ai/work-packets/WP-015A-reveal-safety-fixes.md
  - ../10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Villain Deck

## Summary

The villain deck is the shared antagonist stack revealed once per turn
at the [`start`](turn-system.md) stage. Every reveal classifies the
drawn card into one of five card-type values and fires the
corresponding rule triggers; downstream mechanics —
[Master Strike](master-strike.md), [Scheme Twist](scheme-twist.md),
and Ambush / Patrol / Guard board keywords — all sit on top of this
pipeline.

## Mechanics

### State shape

`G.villainDeck` is a `VillainDeckState` with two
[`CardExtId`](cardextid.md) arrays:

```ts
interface VillainDeckState {
  deck: CardExtId[];     // top of deck = deck[0]
  discard: CardExtId[];  // revealed and resolved cards
}
```

A second field, `G.villainDeckCardTypes: Record<CardExtId, RevealedCardType>`,
holds the classification for every card in the deck. It is populated at
**setup time** by `buildVillainDeck` from registry data, then read in
O(1) at runtime — moves never query the registry. See
[`.claude/rules/game-engine.md`](../../.claude/rules/game-engine.md)
"Registry Boundary" for the rule.

### Classification: the 5-value closed set

`RevealedCardType` is a closed union (5 values, hyphens not underscores):

| Value | Routing on reveal |
|---|---|
| `villain` | Pushed into the City |
| `henchman` | Pushed into the City |
| `bystander` | Discarded into villain-deck discard |
| `scheme-twist` | Discarded; fires `onSchemeTwistRevealed` |
| `mastermind-strike` | Discarded; fires `onMastermindStrikeRevealed` |

The canonical array `REVEALED_CARD_TYPES` in
[`villainDeck.types.ts`](../../packages/game-engine/src/villainDeck/villainDeck.types.ts)
is the single source of truth and is asserted against the union by
drift-detection tests.

### The reveal pipeline

`revealVillainCard` in
[`villainDeck.reveal.ts`](../../packages/game-engine/src/villainDeck/villainDeck.reveal.ts)
is the only authority for drawing from the deck. Step numbering
mirrors the source comments exactly. The order is contractual — rule
hooks must observe post-placement board state, so City routing
happens before triggers fire:

- **Step 0 — Stage gate.** Return silently unless
  `G.currentStage === 'start'`.
- **Step 1 — Empty-deck handling.** If both deck and discard are
  empty, log and return. If deck is empty but discard has cards,
  reshuffle discard into deck via `shuffleDeck` (uses
  `ctx.random.Shuffle`).
- **Step 2 — Draw.** Read `deck[0]` (top of deck). Defer removal from
  the deck until placement is confirmed (see Edge Cases / WP-015A).
- **Step 3 — Classify.** Look up `G.villainDeckCardTypes[cardId]`. If
  missing, log and return without removal.
- **Step 4 — City routing.** For `villain` and `henchman`: validate
  `G.city`, push the card into the City, handle escape (counter +
  wound + bystander resolution), handle Ambush on entry, attach a
  bystander.
- **Step 5 — Collect rule effects.** Always emit `onCardRevealed`.
  Conditionally emit `onSchemeTwistRevealed` or
  `onMastermindStrikeRevealed`. Trigger evaluation is delegated to
  the rule-execution pipeline — the move contains no inline effect
  logic.
- **Step 6 — Apply effects.** `applyRuleEffects` mutates `G` from the
  collected `RuleEffect[]`.
- **Step 7 — Final destination.** `villain` and `henchman` are
  already in the City. `bystander`, `scheme-twist`, and
  `mastermind-strike` go to `G.villainDeck.discard`.

The full step contract is also documented inline in
[`game-engine.md` "Villain Deck & Reveal Pipeline"](../../.claude/rules/game-engine.md).

## Interactions

- **[Master Strike](master-strike.md)** — When the revealed card is
  classified `mastermind-strike`, the reveal pipeline fires
  `onMastermindStrikeRevealed`. Master Strike resolution lives in
  the rule-execution pipeline, not in the reveal move.
- **[Scheme Twist](scheme-twist.md)** — Sibling type-specific
  trigger, fired on `scheme-twist` reveals via
  `onSchemeTwistRevealed`. Unlike Master Strike, the default
  scheme-twist handler can drive an `ENDGAME_CONDITIONS.SCHEME_LOSS`
  counter increment when the twist count crosses an MVP threshold.
- **[Rule Execution Pipeline](rule-execution-pipeline.md).** All
  triggers route through `executeRuleHooks` → `applyRuleEffects`.
  The reveal move does not implement effects; it only collects them.
- **City** — `villain` and `henchman` reveals push into `G.city` via
  `pushVillainIntoCity`. A push that overflows the city escapes the
  card at index 4, increments `ENDGAME_CONDITIONS.ESCAPED_VILLAINS`,
  triggers a wound for the current player, and releases attached
  bystanders back to the supply.
- **[Board Keywords](board-keywords.md) (Ambush).** Cards entering
  the City with the Ambush keyword cause every player to gain a
  wound on entry. Ambush evaluation happens inline in the reveal
  move — the effect-type catalog has no `gainWound` member, so
  structural city rules execute directly.
- **[Card Type Taxonomy](card-type-taxonomy.md).** `RevealedCardType`
  is a strict subset of the broader registry-side taxonomy. Only the
  five values listed above ever appear in `G.villainDeckCardTypes`;
  the wider taxonomy (13 entries in
  [`data/metadata/card-types.json`](../../data/metadata/card-types.json))
  also includes hero, sidekick, S.H.I.E.L.D., and other types that
  never enter the villain deck.
- **Endgame.** Escapes increment a counter consumed by
  `evaluateEndgame`; sustained escapes drive a scheme-wins outcome
  (default `ESCAPE_LIMIT = 8` in MVP).

## Edge Cases

- **Slug mismatch is a silent failure.** A card whose classification
  is stored as `'scheme_twist'` (underscore) instead of
  `'scheme-twist'` (hyphen) will not match the union and will silently
  prevent the trigger from firing. Drift-detection tests against
  `REVEALED_CARD_TYPES` exist specifically to catch this. See
  [`game-engine.md` "RevealedCardType Conventions"](../../.claude/rules/game-engine.md).
- **Deferred deck removal (WP-015A).** Earlier versions of the move
  removed the drawn card before validating City placement. If the
  city was malformed, the card was lost permanently. The current
  pipeline keeps the card on top of the deck until placement
  succeeds, then removes it. See
  [WP-015A](../ai/work-packets/WP-015A-reveal-safety-fixes.md).
- **Missing classification fails closed.** If
  `G.villainDeckCardTypes[cardId]` is undefined, the move logs a
  message and returns without modifying state — no removal, no
  trigger. This protects against partially-built decks at setup.
- **Reshuffle from discard is deterministic.** When the deck empties
  with a non-empty discard, the discard is shuffled into the deck via
  `shuffleDeck` using `ctx.random.Shuffle`. No `Math.random()`
  ever participates.
- **Ambush gates on supply.** Ambush wound application is gated on
  `G.piles.wounds.length > 0` — once the wound supply is exhausted,
  Ambush degrades silently for the remaining players. Same gating
  applies to escape-induced wounds.
- **Reveal is start-stage only.** Calling `revealVillainCard` outside
  `G.currentStage === 'start'` returns silently — never throws.
  Moves never throw per
  [`game-engine.md` "Move Validation Contract"](../../.claude/rules/game-engine.md).

## Code Touchpoints

- [`packages/game-engine/src/villainDeck/villainDeck.types.ts`](../../packages/game-engine/src/villainDeck/villainDeck.types.ts)
  — `RevealedCardType` union, `REVEALED_CARD_TYPES` array,
  `VillainDeckState` interface
- [`packages/game-engine/src/villainDeck/villainDeck.setup.ts`](../../packages/game-engine/src/villainDeck/villainDeck.setup.ts)
  — `buildVillainDeck` (setup-time composition + classification map)
- [`packages/game-engine/src/villainDeck/villainDeck.reveal.ts`](../../packages/game-engine/src/villainDeck/villainDeck.reveal.ts)
  — `revealVillainCard` move (the 8-step pipeline)
- [`packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts`](../../packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts)
  — reveal pipeline tests
- [`packages/game-engine/src/villainDeck/villainDeck.city.integration.test.ts`](../../packages/game-engine/src/villainDeck/villainDeck.city.integration.test.ts)
  — integration with city push / escape
- [`packages/game-engine/src/villainDeck/villainDeck.types.test.ts`](../../packages/game-engine/src/villainDeck/villainDeck.types.test.ts)
  — drift-detection: array-vs-union assertion

## History

- WP-014A: Reveal pipeline established with classify-then-trigger contract and 5-value `RevealedCardType` union
- WP-014B: Villain deck composition; setup-time `G.villainDeckCardTypes` registry resolution
- WP-015: City routing added for `villain` and `henchman`; escape counter tracking
- WP-015A: Deferred deck removal until placement confirmation; closed silent-loss path on malformed city

## References

- [`.claude/rules/game-engine.md` "Villain Deck & Reveal Pipeline"](../../.claude/rules/game-engine.md)
- [`docs/ai/ARCHITECTURE.md`](../ai/ARCHITECTURE.md) — WP-014 review
  notes; villain-deck classification stored at setup
- [`docs/10-GLOSSARY.md`](../10-GLOSSARY.md) — `RevealedCardType`,
  `G.villainDeckCardTypes`, `REVEALED_CARD_TYPES`
- [`docs/legendary-universal-rules-v23.md`](../legendary-universal-rules-v23.md)
  — tabletop semantics for villain reveal, escape, and bystander capture
- [WP-014A](../ai/work-packets/WP-014A-villain-reveal-pipeline.md),
  [WP-014B](../ai/work-packets/WP-014B-villain-deck-composition.md),
  [WP-015](../ai/work-packets/WP-015-city-hq-zones-villain-movement.md),
  [WP-015A](../ai/work-packets/WP-015A-reveal-safety-fixes.md)
