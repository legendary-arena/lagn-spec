---
title: Turn System
type: System
tags:
  - layer-engine
  - phase
  - stage
  - state-machine
  - determinism
  - drift-detection
  - contract
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - rule-execution-pipeline.md
  - cardextid.md
  - card-type-taxonomy.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../.claude/rules/game-engine.md
  - ../.claude/rules/architecture.md
  - ../.claude/rules/code-style.md
  - ../packages/game-engine/src/turn/turnPhases.types.ts
  - ../packages/game-engine/src/turn/turnPhases.logic.ts
  - ../packages/game-engine/src/turn/turnLoop.ts
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-002-game-skeleton.md
  - ../docs/ai/work-packets/WP-007A-turn-structure-phases-contracts.md
  - ../docs/ai/work-packets/WP-007B-turn-loop-implementation.md
  - ../docs/ai/REFERENCE/00.2-data-requirements.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Turn System

## Summary

The Turn System is the engine's two-level temporal state machine: a
match-level lifecycle of four phases, and a per-turn cycle of three
stages within the `play` phase. Phases live on `ctx.phase`
(boardgame.io's responsibility); stages live on `G.currentStage`
(engine's responsibility). Both are governed by closed-set
canonical arrays, transition discipline rules, and drift-detection
tests. This page documents the state machine's structure and
transition contract — it does not document what happens *during*
any phase or stage.

## Mechanics

### Two distinct levels

The Turn System has two independent enums. Conflating them is the
most common source of phase / stage confusion.

| Level | Type | Values | Lives on | Authority |
|---|---|---|---|---|
| Match phase | `MatchPhase` | `'lobby'` · `'setup'` · `'play'` · `'end'` | `ctx.phase` | boardgame.io |
| Turn stage | `TurnStage` | `'start'` · `'main'` · `'cleanup'` | `G.currentStage` | the engine |

Stages exist *only inside* the `play` phase. Outside `play`,
`G.currentStage` is not consulted; phases like `lobby`, `setup`, and
`end` have no stage cycle.

### Canonical arrays (drift-detection invariants)

Both enums have a `readonly` canonical array as the single source of
truth in
[`turnPhases.types.ts`](../packages/game-engine/src/turn/turnPhases.types.ts):

```ts
export const MATCH_PHASES: readonly MatchPhase[] = [
  'lobby', 'setup', 'play', 'end',
] as const;

export const TURN_STAGES: readonly TurnStage[] = [
  'start', 'main', 'cleanup',
] as const;
```

Drift-detection tests assert each array exactly matches its union
type. Adding a phase or stage requires updating the union *and* the
array; one without the other is a build-breaking inconsistency. The
phase names are additionally locked by 00.2 §8.2 — they are
contract-level identifiers, not implementation details.

### Where state lives — and why

`G.currentStage` is in `G`, not `ctx`. The `// why:` comment in
[`turnLoop.ts`](../packages/game-engine/src/turn/turnLoop.ts)
spells out the reason: boardgame.io's `ctx` does not expose the
inner turn stage in a form move functions can read. Putting the
stage in `G` makes it observable to moves (which need it for stage
gating) and JSON-serializable (for replay and snapshots). Reading
`ctx.phase` is fine; storing the *stage* there is not.

The stage is reset to `'start'` at the beginning of each new turn
via the `play` phase's `onBegin` hook. Mid-turn, only
`advanceTurnStage` writes to `G.currentStage`.

### Stage ordering authority

`getNextTurnStage(current)` in
[`turnPhases.logic.ts`](../packages/game-engine/src/turn/turnPhases.logic.ts)
is the **sole authority** on stage ordering. It derives the next
stage from `TURN_STAGES.indexOf(current) + 1` — never a hardcoded
mapping. No other file may re-encode the stage order.

```ts
getNextTurnStage('start')   // → 'main'
getNextTurnStage('main')    // → 'cleanup'
getNextTurnStage('cleanup') // → null   ← signals turn end
```

A `null` return signals "the turn should end"; the caller is
responsible for invoking `ctx.events.endTurn()`. The function never
cycles back to `'start'` — turn restart is a distinct event managed
by the `play.onBegin` hook, not by stage advancement.

### Stage transition rules

Only forward-adjacent transitions are valid:

```
start  →  main  →  cleanup  →  (turn ends)
```

`isValidTurnStageTransition(from, to)` returns `true` only if
`to === getNextTurnStage(from)`. Backward, skip, and self
transitions are all invalid.

### Turn-loop advancement

`advanceTurnStage(G, ctx)` in
[`turnLoop.ts`](../packages/game-engine/src/turn/turnLoop.ts)
is the single helper that drives stage progression:

- If `getNextTurnStage` returns a non-null stage → write it to
  `G.currentStage`.
- If it returns `null` → call `ctx.events.endTurn()`. boardgame.io
  rotates the player and fires its own turn-end lifecycle. **Manual
  player index rotation is forbidden** per
  [`game-engine.md` "Turn Stage Cycle"](../.claude/rules/game-engine.md).

### Transition discipline

Two transition primitives exist, both restricted:

- **`ctx.events.setPhase()`** — the only way to change phases.
  Setting `ctx.phase` directly is forbidden.
- **`ctx.events.endTurn()`** — the only way to end a turn. Manual
  player rotation is forbidden.

Every call site of either must include a `// why:` comment per
[`code-style.md`](../.claude/rules/code-style.md) and
[`architecture.md`](../.claude/rules/architecture.md). The
comment is part of the contract, not a stylistic preference: it
documents the lifecycle reason for each transition so reviewers can
audit phase/turn flow without reconstructing intent.

The canonical lobby-to-setup transition is the lobby move
`startMatchIfReady`, which validates readiness and emits
`ctx.events.setPhase('setup')` with a `// why:` annotation.

### Type guards

Two narrow guards live alongside the canonical arrays for runtime
validation: `isValidMatchPhase(s)` and `isValidTurnStage(s)`. Both
delegate to `MATCH_PHASES.includes` / `TURN_STAGES.includes`, so
they can never drift from the canonical arrays.

## Interactions

- **[Rule Execution Pipeline](rule-execution-pipeline.md).** Two of
  the five canonical triggers — `onTurnStart` and `onTurnEnd` —
  fire from the turn lifecycle and carry `{ currentPlayerId }`
  payloads. The Turn System is the emission seam for these triggers
  in the same way [Villain Deck](villain-deck.md) is for the three
  reveal triggers.
- **Move stage gating.** The `MOVE_ALLOWED_STAGES` mapping (per
  [`game-engine.md` "Stage Gating"](../.claude/rules/game-engine.md))
  is the canonical contract that links each move to the
  `TurnStage[]` values it accepts. Stage gating is Step 2 of the
  Move Validation Contract — checked after argument validation,
  before any `G` mutation.
- **[Villain Deck](villain-deck.md).** `revealVillainCard` is
  stage-gated to `'start'` only — the move returns silently if
  called outside that stage. Stage gating is the mechanism; the
  move's pipeline is documented separately.
- **[Scheme](scheme.md) and Mastermind setup.** `Game.setup()` runs
  inside the `setup` phase and produces `G.hookRegistry`,
  `G.mastermind`, and other one-time runtime state. The Turn
  System's `setup` phase is the temporal boundary for this work; the
  setup *content* is each builder's responsibility.
- **Persistence.** `G.currentStage` is part of the persistable
  runtime state and is included in any JSON serialization of `G`.
  `ctx.phase` is owned by boardgame.io and not part of `G`.

## Edge Cases

- **Stage outside `play` is undefined.** `G.currentStage` is only
  meaningful while `ctx.phase === 'play'`. Other phases do not read
  or mutate the field; consumers must check the phase before
  consulting the stage if there is any doubt.
- **`getNextTurnStage('cleanup')` returns `null`, not `'start'`.**
  This is intentional. Turn restart is a distinct event that
  `play.onBegin` handles after `ctx.events.endTurn()` rotates the
  player. Wrapping the cycle inside `getNextTurnStage` would couple
  stage advancement to player rotation and remove boardgame.io
  from the loop.
- **Drift hazard.** Adding a phase or stage requires touching three
  sites: the union type, the canonical readonly array, and any
  switch/index logic that fans out on the value (e.g., the
  `MOVE_ALLOWED_STAGES` table for stages, or any phase-specific
  `onBegin` / `onEnd` configuration). Drift-detection tests catch
  the array-vs-union mismatch; the dispatch-site discipline is on
  the reviewer.
- **Skipping or reversing stages is unrepresentable.** There is no
  helper for `start → cleanup` (skip) or `cleanup → main`
  (reverse). Code that thinks it needs one is almost always
  expressing a different concern (e.g., "abort this turn" — handled
  by `ctx.events.endTurn`, not stage manipulation).
- **`// why:` comments on `setPhase` / `endTurn` are part of the
  contract.** A reviewer who sees a transition without a `// why:`
  comment is correct to block the change until one is added — the
  rule is enforced by review, not by tooling.
- **`ctx.phase` is not in `G`.** Don't try to read it from `G`, and
  don't try to write to it through `G`. The phase is boardgame.io's
  field; the engine influences it only via `ctx.events.setPhase()`.

## Code Touchpoints

- [`turnPhases.types.ts`](../packages/game-engine/src/turn/turnPhases.types.ts)
  — `MatchPhase`, `MATCH_PHASES`, `TurnStage`, `TURN_STAGES`,
  `TurnPhaseError`
- [`turnPhases.logic.ts`](../packages/game-engine/src/turn/turnPhases.logic.ts)
  — `getNextTurnStage`, `isValidTurnStageTransition`,
  `isValidMatchPhase`, `isValidTurnStage`
- [`turnLoop.ts`](../packages/game-engine/src/turn/turnLoop.ts)
  — `advanceTurnStage`, `TurnLoopContext`, `TurnLoopState`
- [`turnPhases.contracts.test.ts`](../packages/game-engine/src/turn/turnPhases.contracts.test.ts)
  — contract tests
- [`turnLoop.integration.test.ts`](../packages/game-engine/src/turn/turnLoop.integration.test.ts)
  — turn-loop integration tests
- [`turnPhases.validate.ts`](../packages/game-engine/src/turn/turnPhases.validate.ts)
  — validators

## History

- WP-002: Four phase names scaffolded (`lobby` / `setup` / `play` / `end`); locked at the contract level
- WP-007A: Turn-structure phase contracts formalized; `MATCH_PHASES`, `TURN_STAGES`, `MatchPhase`, `TurnStage` introduced as canonical arrays + unions
- WP-007B: Turn-loop implementation; `getNextTurnStage`, `advanceTurnStage`, `// why:` discipline on `setPhase` / `endTurn` enforced

## References

- [`.claude/rules/game-engine.md`](../.claude/rules/game-engine.md)
  — Phases (locked names); Turn Stage Cycle; Stage Gating; Move
  Validation Contract
- [`.claude/rules/architecture.md`](../.claude/rules/architecture.md)
  — Phase & Turn Transitions invariant (`// why:` requirement)
- [`.claude/rules/code-style.md`](../.claude/rules/code-style.md)
  — Drift Detection (canonical readonly arrays); `// why:` comment
  rule
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — WP-007A/B
  review notes; turn stage cycle
- [`docs/ai/REFERENCE/00.2-data-requirements.md`](../docs/ai/REFERENCE/00.2-data-requirements.md)
  §8.2 — match lifecycle (the four phase names locked at this layer)
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) — `MATCH_PHASES`,
  `TURN_STAGES`, `getNextTurnStage`, `advanceTurnStage`,
  `startMatchIfReady`, `G.currentStage`
- [WP-002](../docs/ai/work-packets/WP-002-game-skeleton.md),
  [WP-007A](../docs/ai/work-packets/WP-007A-turn-structure-phases-contracts.md),
  [WP-007B](../docs/ai/work-packets/WP-007B-turn-loop-implementation.md)
