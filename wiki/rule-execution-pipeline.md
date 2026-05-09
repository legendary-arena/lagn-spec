---
title: Rule Execution Pipeline
type: System
tags:
  - layer-engine
  - rule-pipeline
  - trigger
  - effect
  - determinism
  - drift-detection
  - contract
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - turn-system.md
  - cardextid.md
  - card-type-taxonomy.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../.claude/rules/game-engine.md
  - ../packages/game-engine/src/rules/ruleHooks.types.ts
  - ../packages/game-engine/src/rules/ruleRuntime.execute.ts
  - ../packages/game-engine/src/rules/ruleRuntime.effects.ts
  - ../packages/game-engine/src/rules/ruleRuntime.impl.ts
  - ../packages/game-engine/src/rules/ruleHooks.registry.ts
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-009A-scheme-mastermind-rule-hooks-contracts.md
  - ../docs/ai/work-packets/WP-009B-rule-execution-minimal-mvp.md
  - ../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md
  - ../docs/ai/work-packets/WP-024-scheme-mastermind-ability-execution.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Rule Execution Pipeline

## Summary

The rule execution pipeline is the engine's mechanism for translating
game events into deterministic state changes. It enforces a
two-registry, two-phase contract: data-only hook definitions live in
`G`, handler functions live outside `G`, and execution is split into
a pure-collection phase and a pure-application phase. Specific
mechanics ([Master Strike](master-strike.md),
[Scheme Twist](scheme-twist.md), and others) are participants — this
page documents the mechanism, not the participants.

## Mechanics

### The two-registry separation

The pipeline rests on a hard split between data and functions:

| Registry | Lives in | Type | Lifecycle |
|---|---|---|---|
| `G.hookRegistry` | `G` (persistable) | `HookDefinition[]` | Built at setup; immutable during play |
| `ImplementationMap` | Outside `G` | `Record<string, handler>` | Built once at startup; passed in by lifecycle hooks; never stored on `G` |

`HookDefinition` is data-only and JSON-serializable; functions cannot
live in `G`. The `ImplementationMap` keys handler functions by the
same `id` as `HookDefinition.id`, so a hook in `G` can be matched to
its handler at execution time without `G` ever holding a function
reference. Both ends are required: a hook with no handler is a
no-op; a handler with no hook is unreachable.

### `HookDefinition` shape

```ts
interface HookDefinition {
  id: string;                          // stable unique identifier
  kind: 'scheme' | 'mastermind';       // closed two-value union
  sourceId: string;                    // scheme or mastermind CardExtId
  triggers: RuleTriggerName[];         // which triggers this hook subscribes to
  priority: number;                    // lower fires first; ties → id lexically
}
```

The `sourceId` field carries a [`CardExtId`](cardextid.md) value;
the alias is structural (string) but documents the registry
resolution intent.

A single hook may subscribe to multiple triggers (the `triggers`
field is an array). Hooks are constructed at setup from the chosen
[Scheme](scheme.md) and Mastermind and are not modified during play.

### Two-phase execution

The pipeline never collects and applies in one pass. The split is
contractual:

**Phase 1 — `executeRuleHooks`** in
[`ruleRuntime.execute.ts`](../packages/game-engine/src/rules/ruleRuntime.execute.ts).
Reads `G` and the registry; looks up each hook's handler in the
`ImplementationMap` by `id`; calls handlers in deterministic order;
concatenates the returned `RuleEffect[]` into a single flat array.
**This phase never mutates `G`.** Tests can call it to assert what
*would* happen without committing the changes.

**Phase 2 — `applyRuleEffects`** in
[`ruleRuntime.effects.ts`](../packages/game-engine/src/rules/ruleRuntime.effects.ts).
Iterates the collected effects with `for...of` and applies each via
a dedicated per-effect-type applier. **This phase never throws and
never uses `.reduce()`** (per
[`game-engine.md` "Rule Execution Pipeline"](../.claude/rules/game-engine.md)).

The split is what makes the pipeline replayable, testable, and safe
to invoke from any move that emits a trigger.

### Determinism guarantees

The pipeline meets the engine's determinism invariants
([ARCHITECTURE.md](../docs/ai/ARCHITECTURE.md) Architectural Principles
#1) by construction:

- **Hook execution order is deterministic.** `getHooksForTrigger`
  in
  [`ruleHooks.registry.ts`](../packages/game-engine/src/rules/ruleHooks.registry.ts)
  is the sole authority on ordering: `priority` ascending, then `id`
  lexically. `executeRuleHooks` does not call `.sort()` itself —
  ordering is enforced upstream.
- **No randomness inside execution.** Handlers receive `G` for read
  and a `ctx` parameter typed `unknown` (to keep the `rules/`
  directory free of `boardgame.io` imports). Default handlers do
  not use `ctx`. Per-effect appliers that need randomness (e.g.,
  the deck-reshuffle path inside the `drawCards` applier) consume
  `ctx.random.Shuffle` only — never `Math.random`.
- **No `.reduce()`** in either phase. Effects are accumulated with
  `for…of` and `array.push` per
  [code-style.md](../.claude/rules/code-style.md) "Patterns to
  Avoid".
- **Handlers are pure.** They take `(gameState, ctx, payload)` and
  return `RuleEffect[]`. They must not mutate `G` or `ctx`.
  `executeRuleHooks` does not mutate `G` between handler calls, so
  every handler in a single trigger fire sees the same pre-effect
  state.

### Closed sets (drift-detection invariants)

Two closed sets define the pipeline's surface area. Both are
canonical readonly arrays asserted against their TypeScript unions
by drift-detection tests; adding a value to one without updating
the other is a build-breaking inconsistency.

**Triggers (5):** `RULE_TRIGGER_NAMES` in
[`ruleHooks.types.ts`](../packages/game-engine/src/rules/ruleHooks.types.ts):

```
onTurnStart · onTurnEnd · onCardRevealed
onSchemeTwistRevealed · onMastermindStrikeRevealed
```

Each trigger has a typed payload via the `TriggerPayloadMap`
mapping. Trigger emission is the responsibility of the move or
lifecycle hook that produces the event — see
[Villain Deck](villain-deck.md) for the three reveal triggers and
[Turn System](turn-system.md) for the two turn-lifecycle triggers.

**Effect types (4):** `RULE_EFFECT_TYPES` in
[`ruleHooks.types.ts`](../packages/game-engine/src/rules/ruleHooks.types.ts):

```
queueMessage · modifyCounter · drawCards · discardHand
```

This is the complete catalog of state changes the pipeline can
apply. Mechanics that need a state change outside this catalog
either route the change through one of the four types
(`modifyCounter` is the most common escape hatch — see
[Master Strike](master-strike.md) and
[Scheme Twist](scheme-twist.md) for examples) or apply the change
inline in the originating move (see Villain Deck's Ambush handling
for the inline pattern).

### Default implementation map

`DEFAULT_IMPLEMENTATION_MAP` in
[`ruleRuntime.impl.ts`](../packages/game-engine/src/rules/ruleRuntime.impl.ts)
is the canonical map passed by `revealVillainCard` and other
trigger emitters. It binds the engine's default scheme and
mastermind handlers to their hook ids. The map is constructed once
and lives outside `G`; downstream callers receive it via lifecycle
plumbing.

## Interactions

- **[Villain Deck](villain-deck.md).** The reveal move is one of the
  pipeline's emission seams. It calls `executeRuleHooks` once per
  trigger and a single `applyRuleEffects` for the full collected
  batch.
- **[Turn System](turn-system.md).** The other emission seam.
  `onTurnStart` and `onTurnEnd` fire from the turn lifecycle — not
  from a move — and carry `{ currentPlayerId }` payloads. The
  pipeline contract is identical regardless of which seam emitted
  the trigger.
- **[Master Strike](master-strike.md).** Registered handler for
  `onMastermindStrikeRevealed`. Returns effects only — does not
  read or mutate `G`.
- **[Scheme Twist](scheme-twist.md).** Registered handler for
  `onSchemeTwistRevealed`. Demonstrates the predict-post-effect
  pattern — handlers can gate conditional effects on a *predicted*
  post-effect read of `G` because they run before
  `applyRuleEffects`.
- **[Scheme](scheme.md) and Mastermind.** `HookDefinition.kind` is
  the closed two-value union that identifies the hook's owning
  entity; `sourceId` references the entity's ext_id. The pipeline
  does not read scheme or mastermind state directly.
- **Persistence.** `G.hookRegistry` is JSON-serializable and is part
  of the persistable runtime state; the `ImplementationMap` is not
  serializable and is reconstructed at every server start. A future
  Work Packet that adds replay or hot-reload must rebuild the
  implementation map from a versioned source, not deserialize it.
- **Server.** The server does not participate in rule execution
  ([`game-engine.md` Server Boundary](../.claude/rules/game-engine.md)).
  All hook execution happens inside the game engine, on the
  authoritative `G`.

## Edge Cases

- **Missing handler for a registered hook id.** Silently skipped —
  the loop in `executeRuleHooks` `continue`s past the hook with no
  message and no effect. This permits incremental landing of new
  hooks ahead of their handlers without crashing matches.
- **Unknown effect type at apply time.** A warning is pushed to
  `G.messages` and the loop continues. Old runtimes encountering
  effect types added by newer engine versions degrade gracefully
  rather than throwing.
- **Empty hook registry.** `executeRuleHooks` returns `[]`. No
  effects are collected; `applyRuleEffects` is a no-op.
- **Empty effect array.** `applyRuleEffects` is a no-op and returns
  the input `gameState` reference unchanged.
- **`drawCards` reshuffle path.** When a player's deck empties
  mid-draw and the discard pile has cards, the applier reshuffles
  via `shuffleDeck` using `ctx.random.Shuffle`. This is the only
  applier path that consumes randomness; the others are pure
  state transformations.
- **`discardHand` / `drawCards` skip on missing player.** If the
  effect's `playerId` is not in `G.playerZones`, the applier pushes
  a deterministic skip message and returns. Same fail-closed pattern
  the reveal pipeline uses for missing classifications.
- **Drift hazard.** Adding a trigger or effect requires touching
  *three* sites: the union type, the canonical readonly array, and
  the corresponding handler/applier dispatch. Drift-detection tests
  catch the array-vs-union mismatch; the dispatch site is on the
  reviewer.

## Code Touchpoints

- [`ruleHooks.types.ts`](../packages/game-engine/src/rules/ruleHooks.types.ts)
  — `RuleTriggerName`, `RULE_TRIGGER_NAMES`, `TriggerPayloadMap`,
  `RuleEffect`, `RULE_EFFECT_TYPES`, `HookDefinition`, `HookRegistry`
- [`ruleRuntime.execute.ts`](../packages/game-engine/src/rules/ruleRuntime.execute.ts)
  — `executeRuleHooks` and the `ImplementationMap` type
- [`ruleRuntime.effects.ts`](../packages/game-engine/src/rules/ruleRuntime.effects.ts)
  — `applyRuleEffects` and the four per-effect appliers
- [`ruleRuntime.impl.ts`](../packages/game-engine/src/rules/ruleRuntime.impl.ts)
  — `DEFAULT_IMPLEMENTATION_MAP`
- [`ruleHooks.registry.ts`](../packages/game-engine/src/rules/ruleHooks.registry.ts)
  — `getHooksForTrigger` (sort + filter authority)
- [`ruleRuntime.ordering.test.ts`](../packages/game-engine/src/rules/ruleRuntime.ordering.test.ts)
  — ordering tests
- [`ruleRuntime.integration.test.ts`](../packages/game-engine/src/rules/ruleRuntime.integration.test.ts)
  — integration tests
- [`ruleHooks.contracts.test.ts`](../packages/game-engine/src/rules/ruleHooks.contracts.test.ts)
  — contract tests

## History

- WP-009A: Rule hook contracts defined; 5-trigger union, 4-effect tagged union, `HookDefinition` interface, drift-detection arrays
- WP-009B: Two-phase execution pipeline implemented; `ImplementationMap` separation; default scheme/mastermind hooks (stubs)
- WP-014A: Trigger emission added at `revealVillainCard` (`onCardRevealed` always; `onSchemeTwistRevealed` and `onMastermindStrikeRevealed` conditional on classification)
- WP-024: WP-009B stubs replaced with real scheme/mastermind handlers via EC-024

## References

- [`.claude/rules/game-engine.md`](../.claude/rules/game-engine.md)
  — Rule Execution Pipeline (the canonical invariant statement);
  Move Validation Contract; Throwing Convention
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — Architectural
  Principles #1 (determinism); WP-009A/B review notes
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) —
  `HookDefinition`, `ImplementationMap`, `executeRuleHooks`,
  `applyRuleEffects`, `RuleTriggerName`, `RuleEffectType`,
  `G.hookRegistry`
- [`.claude/rules/code-style.md`](../.claude/rules/code-style.md)
  — Patterns to Avoid (no `.reduce()` in zone or effect application)
- [WP-009A](../docs/ai/work-packets/WP-009A-scheme-mastermind-rule-hooks-contracts.md),
  [WP-009B](../docs/ai/work-packets/WP-009B-rule-execution-minimal-mvp.md),
  [WP-014A](../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md),
  [WP-024](../docs/ai/work-packets/WP-024-scheme-mastermind-ability-execution.md)
