---
title: Master Strike
type: Mechanic
tags:
  - layer-engine
  - mastermind
  - villain-deck
  - trigger
  - phase-play
  - stage-start
related:
  - villain-deck.md
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
  - ../.claude/rules/game-engine.md
  - ../packages/game-engine/src/rules/mastermindHandlers.ts
  - ../packages/game-engine/src/villainDeck/villainDeck.reveal.ts
  - ../packages/game-engine/src/mastermind/mastermind.types.ts
  - ../packages/game-engine/src/mastermind/mastermind.logic.ts
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md
  - ../docs/ai/work-packets/WP-019-mastermind-tactics-boss-fight-minimal-mvp.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Master Strike

## Summary

Master Strike is the mechanic fired when a `mastermind-strike` card is
revealed from the villain deck. The trigger fires at stage `start` as
part of the reveal pipeline; in MVP it increments a counter and queues
a deterministic log entry, leaving full per-mastermind tactic
resolution to a future Work Packet.

## Mechanics

### Trigger emission

`onMastermindStrikeRevealed` is one of two type-specific triggers
emitted by `revealVillainCard` (see [Villain Deck](villain-deck.md)).
It fires when the drawn card's classification in
`G.villainDeckCardTypes` is `'mastermind-strike'`. The trigger payload
is `{ cardId }`. Effects are collected alongside the always-emitted
`onCardRevealed` trigger and applied together via the
[Rule Execution Pipeline](rule-execution-pipeline.md).

### Default handler behaviour

`mastermindStrikeHandler` in
[`rules/mastermindHandlers.ts`](../packages/game-engine/src/rules/mastermindHandlers.ts)
is the registered `ImplementationMap` entry for the trigger. It
returns two `RuleEffect` entries on every fire:

```ts
{ type: 'modifyCounter', counter: 'masterStrikeCount', delta: 1 }
{ type: 'queueMessage',  message: 'Mastermind strike revealed — strike count incremented.' }
```

The handler does not read or mutate `G`, does not consult the
registry, and does not branch on `cardId`. It is per-mastermind
agnostic in MVP.

### Mastermind state context

`G.mastermind` is built at setup with the chosen mastermind's tactics
deck and base card id (`MastermindState` in
[`mastermind.types.ts`](../packages/game-engine/src/mastermind/mastermind.types.ts)).
Master Strike resolution **does not consume tactics** — tactic defeat
is a combat path through `defeatTopTactic` in
[`mastermind.logic.ts`](../packages/game-engine/src/mastermind/mastermind.logic.ts),
fired during a successful fight against the mastermind. The strike
trigger and the combat-side tactic defeat are separate mechanics that
share the same Mastermind entity.

## Interactions

- **Villain Deck.** `mastermind-strike` is one of five
  `RevealedCardType` values. The reveal pipeline routes the strike
  card to `G.villainDeck.discard` after triggers fire. The trigger
  emission step is documented in [Villain Deck](villain-deck.md) as
  Step 5 of `revealVillainCard`.
- **[Scheme Twist](scheme-twist.md).** Sibling type-specific
  trigger, fired by the same reveal step. Both write a string-literal
  observability counter; only Scheme Twist additionally writes an
  `ENDGAME_CONDITIONS` counter (`SCHEME_LOSS`). Master Strike's
  `masterStrikeCount` does not feed `evaluateEndgame`.
- **Mastermind state.** `G.mastermind.tacticsDeck` and
  `G.mastermind.tacticsDefeated` are read at setup and during combat
  resolution; the strike handler does not modify either.
- **Combat (defeat tactic).** The combat-side path —
  `defeatTopTactic` — is unrelated to the strike trigger. It runs
  when a player successfully fights the Mastermind, drawing the top
  tactic from `tacticsDeck` and appending it to `tacticsDefeated`.
- **Endgame.** The strike handler writes to
  `G.counters.masterStrikeCount`. This key is **not** in
  `ENDGAME_CONDITIONS` and is not consumed by `evaluateEndgame`.
  Victory still resolves through
  `ENDGAME_CONDITIONS.MASTERMIND_DEFEATED`, which becomes truthy
  when `areAllTacticsDefeated` returns true.

## Edge Cases

- **Slug must be hyphenated.** The classification value is
  `'mastermind-strike'` (hyphen). An underscore variant silently
  fails to match the union and prevents the trigger from firing.
  Drift-detection tests against `REVEALED_CARD_TYPES` exist to catch
  this. See
  [`game-engine.md` "RevealedCardType Conventions"](../.claude/rules/game-engine.md).
- **Tabletop tactic effects do not fire in MVP.** Marvel Legendary's
  printed rules specify that the Mastermind plays its current tactic
  on a Strike (e.g., "Each player gains a Wound"). The MVP handler
  does **not** interpret tactic text — the `RuleEffectType` closed
  union (`queueMessage` / `modifyCounter` / `drawCards` /
  `discardHand`) does not yet include a per-player `gainWound` or
  per-mastermind tactic effect. Players see the counter increment
  and the log entry, but no wound or discard derived from the
  Mastermind's tactic. A future WP will add the necessary effect
  types and wire per-mastermind tactic dispatch.
- **Pipeline ordering inside one reveal.** The strike trigger fires
  *after* `onCardRevealed` in the same `revealVillainCard` call.
  Effects from both are collected first, then applied together —
  there is no "strike-before-card-revealed" intermediate state.
- **Strike card destination.** The strike card moves to
  `G.villainDeck.discard` after triggers resolve. It does not enter
  the City and never attaches a bystander.
- **Counter key is a string literal.** `'masterStrikeCount'` is
  written directly by the handler and is not exported as a constant
  in `ENDGAME_CONDITIONS`. Any code that wants to read this counter
  must use the literal key.

## Code Touchpoints

- [`packages/game-engine/src/rules/mastermindHandlers.ts`](../packages/game-engine/src/rules/mastermindHandlers.ts)
  — `mastermindStrikeHandler` (MVP default for the trigger)
- [`packages/game-engine/src/rules/mastermindHandlers.test.ts`](../packages/game-engine/src/rules/mastermindHandlers.test.ts)
  — handler tests
- [`packages/game-engine/src/villainDeck/villainDeck.reveal.ts`](../packages/game-engine/src/villainDeck/villainDeck.reveal.ts)
  — strike trigger emission point (Step 5)
- [`packages/game-engine/src/mastermind/mastermind.types.ts`](../packages/game-engine/src/mastermind/mastermind.types.ts)
  — `MastermindState` interface
- [`packages/game-engine/src/mastermind/mastermind.logic.ts`](../packages/game-engine/src/mastermind/mastermind.logic.ts)
  — `defeatTopTactic`, `areAllTacticsDefeated` (combat path; unrelated
  to the strike trigger but shares the Mastermind entity)

## History

- WP-014A: `onMastermindStrikeRevealed` trigger introduced; emitted from the villain-deck reveal pipeline on `mastermind-strike` classification
- WP-019: `MastermindState` added to `G`; tactics deck and combat-side tactic defeat introduced (separate path from the strike trigger)

## References

- [`.claude/rules/game-engine.md`](../.claude/rules/game-engine.md)
  — Villain Deck & Reveal Pipeline (strike trigger emission contract);
  `G.counters` keys (`MASTERMIND_DEFEATED` victory counter, distinct
  from strike count)
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — WP-014 / WP-019
  review notes
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) — `RuleTriggerName`
  (5-trigger union), `RuleEffectType` (4-effect union),
  `RevealedCardType` (5-classification union),
  `ENDGAME_CONDITIONS.MASTERMIND_DEFEATED`
- [`docs/legendary-universal-rules-v23.md`](../docs/legendary-universal-rules-v23.md)
  — tabletop semantics for Mastermind Strike cards and per-tactic
  resolution
- [WP-014A](../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md),
  [WP-019](../docs/ai/work-packets/WP-019-mastermind-tactics-boss-fight-minimal-mvp.md)
