---
title: Scheme Twist
type: Mechanic
tags:
  - layer-engine
  - scheme
  - villain-deck
  - trigger
  - endgame
  - loss-condition
  - phase-play
  - stage-start
related:
  - villain-deck.md
  - master-strike.md
  - scheme.md
  - rule-execution-pipeline.md
  - turn-system.md
  - cardextid.md
  - card-type-taxonomy.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../.claude/rules/game-engine.md
  - ../packages/game-engine/src/rules/schemeHandlers.ts
  - ../packages/game-engine/src/villainDeck/villainDeck.reveal.ts
  - ../packages/game-engine/src/scheme/schemeSetup.types.ts
  - ../packages/game-engine/src/endgame/endgame.types.ts
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-009B-rule-execution-minimal-mvp.md
  - ../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md
  - ../docs/ai/work-packets/WP-024-scheme-mastermind-ability-execution.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Scheme Twist

## Summary

Scheme Twist is the mechanic fired when a `scheme-twist` card is
revealed from the villain deck. Unlike its sibling
[Master Strike](master-strike.md), it actively drives a loss
condition: every twist increments a counter, and once the count
crosses an MVP threshold the handler emits the
`ENDGAME_CONDITIONS.SCHEME_LOSS` counter that pushes the match toward
a `scheme-wins` outcome.

## Mechanics

### Trigger emission

`onSchemeTwistRevealed` is one of two type-specific triggers emitted
by `revealVillainCard` (see [Villain Deck](villain-deck.md) Step 5).
It fires when the drawn card's classification in
`G.villainDeckCardTypes` is `'scheme-twist'`. Trigger payload is
`{ cardId }`. Effects are collected alongside the always-emitted
`onCardRevealed` trigger and applied together.

### Default handler behaviour

`schemeTwistHandler` in
[`rules/schemeHandlers.ts`](../packages/game-engine/src/rules/schemeHandlers.ts)
is the registered `ImplementationMap` entry. Every fire produces two
effects unconditionally:

```ts
{ type: 'modifyCounter', counter: 'schemeTwistCount', delta: 1 }
{ type: 'queueMessage',  message: 'Scheme twist revealed — twist count incremented.' }
```

Then, if the predicted post-increment twist count reaches the MVP
threshold, the handler appends two more effects to the same returned
array:

```ts
{ type: 'modifyCounter', counter: ENDGAME_CONDITIONS.SCHEME_LOSS, delta: 1 }
{ type: 'queueMessage',  message: 'Scheme loss triggered — twist threshold reached.' }
```

The MVP threshold is the constant `MVP_SCHEME_TWIST_THRESHOLD = 7`,
hardcoded in the handler. Per the source comment, this matches the
most common standard-Legendary scheme; per-scheme thresholds (resolved
from registry data at setup) are pending a future Work Packet.

### The predict-post-effect pattern

The handler cannot read `G` after applying its own effects — handlers
run before `applyRuleEffects` mutates state (see
[Rule Execution Pipeline](rule-execution-pipeline.md) for the
two-phase contract). To check the threshold against the
*post-increment* count, it predicts the post-effect value locally:

```ts
const predictedTwistCount = (gameState.counters.schemeTwistCount ?? 0) + 1;
if (predictedTwistCount >= MVP_SCHEME_TWIST_THRESHOLD) { /* append loss effects */ }
```

This keeps the handler purely functional (no `G` mutation) while
still allowing it to gate a conditional second effect on the post-
effect state. All four effects land atomically in a single
`applyRuleEffects` call.

### Counter inventory

Two distinct counters are involved, used differently:

| Counter | Constant? | Role |
|---|---|---|
| `'schemeTwistCount'` | string literal, not in `ENDGAME_CONDITIONS` | per-match twist tally; observability only |
| `'schemeLoss'` (via `ENDGAME_CONDITIONS.SCHEME_LOSS`) | constant | endgame counter; consumed by `evaluateEndgame` |

A value `>= 1` on `schemeLoss` is sufficient for the loss to register;
the handler increments by exactly 1 on threshold cross.

## Interactions

- **Villain Deck.** `scheme-twist` is one of five `RevealedCardType`
  values. The reveal pipeline routes the twist card to
  `G.villainDeck.discard` after triggers fire.
- **[Master Strike](master-strike.md).** Sibling trigger fired by
  the same `revealVillainCard` step. Both write a string-literal
  counter; only Scheme Twist additionally writes an
  `ENDGAME_CONDITIONS` counter. Master Strike's `masterStrikeCount`
  is observability-only; Scheme Twist's `schemeLoss` actually drives
  endgame.
- **Endgame.** `evaluateEndgame` reads `G.counters` via
  `ENDGAME_CONDITIONS` keys; `SCHEME_LOSS >= 1` short-circuits to the
  `scheme-wins` outcome (loss conditions are evaluated before
  victory). The `MASTERMIND_DEFEATED` victory path is unrelated to
  twist counts.
- **[Scheme](scheme.md).** The scenario-level entity. Scheme Twist
  is the runtime side of scheme behaviour; the Scheme page documents
  the configuration field, setup-time mutator, and registry
  classification. The Scheme entity itself is not read at runtime —
  the threshold and counter wiring live in this handler, not in the
  scheme.
- **Scheme setup instructions.** A *separate* scheme-related
  mechanism: `SchemeSetupInstruction` (closed union of 4 types in
  [`schemeSetup.types.ts`](../packages/game-engine/src/scheme/schemeSetup.types.ts))
  applies declarative changes at setup time per D-2601 (Representation
  Before Execution). These instructions never participate in the
  twist trigger and are not consulted by `schemeTwistHandler`. See
  [Scheme](scheme.md) Layer 2 for the full setup-instruction model.
- **[Scoring](scoring.md).** Scheme-twist outcomes feed the
  `schemeTwistNegative` penalty event, one of five
  `PenaltyEventType` values consumed by `buildScoreBreakdown`.
  Scheme-loss outcomes are additionally penalised per VISION §21;
  the formula and weights live in
  [`12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md).

## Edge Cases

- **Slug must be hyphenated.** The classification value is
  `'scheme-twist'` (hyphen). An underscore variant silently fails to
  match the union and prevents the trigger from firing.
- **Threshold is fixed in MVP.** Tabletop Marvel Legendary uses
  per-scheme loss conditions (varying twist counts; some schemes use
  entirely different conditions like bystander captures or scheme
  deck depletion). MVP applies the single fixed threshold of 7
  uniformly. Per-scheme threshold dispatch is a known future
  expansion seam.
- **Threshold check is *predicted*, not observed.** The handler
  evaluates the threshold against `currentCount + 1`, not against a
  post-effect read of `G`. If two scheme-twist effects ever land in
  the same `applyRuleEffects` batch from a single trigger, the
  prediction would under-count by 1. In practice the reveal pipeline
  produces exactly one twist increment per reveal, so the prediction
  is correct.
- **Twist counter is not a scheme-loss counter.** `schemeTwistCount`
  is incremented every twist; `schemeLoss` is incremented at most
  once (when the threshold is crossed). They are separate counters
  with different semantics.
- **Pipeline ordering inside one reveal.** The twist trigger fires
  *after* `onCardRevealed` in the same `revealVillainCard` call.
  Effects from both triggers are collected first, then applied
  together — there is no intermediate "twist-before-card-revealed"
  state.
- **Twist card destination.** The twist card moves to
  `G.villainDeck.discard` after triggers resolve. It does not enter
  the City and never attaches a bystander.

## Code Touchpoints

- [`packages/game-engine/src/rules/schemeHandlers.ts`](../packages/game-engine/src/rules/schemeHandlers.ts)
  — `schemeTwistHandler` and `MVP_SCHEME_TWIST_THRESHOLD`
- [`packages/game-engine/src/rules/schemeHandlers.test.ts`](../packages/game-engine/src/rules/schemeHandlers.test.ts)
  — handler tests
- [`packages/game-engine/src/villainDeck/villainDeck.reveal.ts`](../packages/game-engine/src/villainDeck/villainDeck.reveal.ts)
  — twist trigger emission point (Step 5)
- [`packages/game-engine/src/endgame/endgame.types.ts`](../packages/game-engine/src/endgame/endgame.types.ts)
  — `ENDGAME_CONDITIONS.SCHEME_LOSS` constant
- [`packages/game-engine/src/scheme/schemeSetup.types.ts`](../packages/game-engine/src/scheme/schemeSetup.types.ts)
  — `SchemeSetupInstruction` (separate scheme mechanism — listed for
  disambiguation, not because it participates in twist behaviour)

## History

- WP-009B: Rule pipeline and `onSchemeTwistRevealed` handler stub introduced (no real effects)
- WP-014A: Reveal pipeline added; `onSchemeTwistRevealed` actually emitted on `scheme-twist` reveals
- WP-024: WP-009B stubs replaced with real handlers; threshold + loss-counter logic landed via EC-024

## References

- [`.claude/rules/game-engine.md`](../.claude/rules/game-engine.md)
  — Villain Deck & Reveal Pipeline (twist trigger emission contract);
  `G.counters` keys (`SCHEME_LOSS` constant)
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — WP-014, WP-024
  review notes; rule execution pipeline contract
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) — `RuleTriggerName`,
  `RuleEffectType`, `RevealedCardType`, `ENDGAME_CONDITIONS`,
  `evaluateEndgame`
- [`docs/12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md) —
  scheme-loss penalty in scoring formula
- [`docs/legendary-universal-rules-v23.md`](../docs/legendary-universal-rules-v23.md)
  — tabletop semantics for Scheme Twist cards and per-scheme loss
  conditions
- [WP-009B](../docs/ai/work-packets/WP-009B-rule-execution-minimal-mvp.md),
  [WP-014A](../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md),
  [WP-024](../docs/ai/work-packets/WP-024-scheme-mastermind-ability-execution.md)
