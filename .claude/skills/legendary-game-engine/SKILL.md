---
name: legendary-game-engine
description: Authoritative enforcement rules for the Game Engine layer. Apply when editing packages/game-engine/**, defining moves/phases/turn-stages/rule-hooks, mutating G, using ctx.random, or questions about determinism, zone ops, or the move validation contract.
---
---
paths:
  - "packages/game-engine/**"
---

# Game Engine Rules — Claude Enforcement

This file defines **non-negotiable rules for modifying the game engine**
(`packages/game-engine/**`) during AI-assisted development.

This file enforces the **Game Engine** responsibilities defined in
**`docs/ai/ARCHITECTURE.md` -- "Layer Boundary (Authoritative)"**.

If engine rules conflict with server, registry, or persistence behavior,
the Layer Boundary section is authoritative.

It enforces architectural invariants defined in:
- `docs/ai/ARCHITECTURE.md` (authoritative)
- `docs/ai/REFERENCE/00.6-code-style.md` (style baseline)
- `docs/ai/work-packets/WORK_INDEX.md` (execution order & contracts)
- `.claude/rules/server.md` (server boundary enforcement)

---

## Scope

Applies ONLY to:
- `packages/game-engine/**`

Does NOT apply to:
- `apps/server/**` (see `.claude/rules/server.md`)
- `packages/registry/**`
- UI or client-side code

---

## Server Boundary (Critical Cross-Reference)

The game engine and server have a **hard architectural boundary**.

### The game engine:
- Owns **all gameplay logic**
- Defines phases, moves, rules, hooks, and endgame evaluation
- Mutates game state (`G`) deterministically via boardgame.io

### The server:
- Is a **wiring layer only**
- Loads registry data and rules text
- Wires `LegendaryGame` into `Server()`
- Exposes network and CLI entrypoints

**The engine must NEVER:**
- Import anything from `apps/server/**`
- Call `loadRules()` or `getRules()` from the server layer
- Know about PostgreSQL, HTTP, or process lifecycle
- Contain startup logic, logging conventions, or CLI concerns

**The server must NEVER:**
- Implement or modify gameplay logic
- Define moves, rules, or effects
- Inspect or mutate `G` beyond routing

Enforcement: `.claude/rules/server.md`

---

## boardgame.io Version [Invariant]

- **boardgame.io ^0.50.0 -- LOCKED**
- Do not upgrade without a `DECISIONS.md` entry
- The Game() API, Immer mutation model, `ctx` shape, and Server() integration
  are version-specific

Any accidental upgrade is a critical bug.

---

## LegendaryGame [Invariant]

- Exactly **one** `Game()` object: `LegendaryGame`
- Defined in `packages/game-engine/src/game.ts`
- Package's primary export
- ALL phases, moves, hooks, and endgame logic registered through it
- Never create parallel or experimental `Game()` instances

---

## Game State -- G [Invariant]

- Always JSON-serializable
  - No functions, classes, Maps, Sets, Dates, or Symbols
- Mutated via Immer drafts (boardgame.io 0.50.x)
  - Move functions mutate directly and return `void`
- Type: `LegendaryGameState` in `src/types.ts`
  - Expanded only by approved Work Packets
- **Never persisted** to any database, file, cache, or external store

G is runtime state, not application storage.

### Key G Fields

| Field | Type | Built at | Purpose |
|---|---|---|---|
| `playerZones` | `Record<string, PlayerZones>` | setup | Per-player card zones (deck/hand/discard/inPlay/victory) |
| `piles` | `GlobalPiles` | setup | Shared piles (bystanders/wounds/officers/sidekicks) |
| `villainDeck` | `VillainDeckState` | setup | `{ deck: CardExtId[], discard: CardExtId[] }` |
| `villainDeckCardTypes` | `Record<CardExtId, RevealedCardType>` | setup | Card type classification for O(1) lookup in moves |
| `hookRegistry` | `HookDefinition[]` | setup | Data-only rule definitions (no functions) |
| `currentStage` | `TurnStage` | turn start | `'start'` / `'main'` / `'cleanup'` |
| `lobby` | `LobbyState` | setup | `{ requiredPlayers, ready, started }` |
| `messages` | `string[]` | setup | Deterministic log of rule effects |
| `counters` | `Record<string, number>` | setup | Endgame condition counters |

All zone/pile fields store `CardExtId` strings only.

---

## Phases (Locked Names)

```
lobby -> setup -> play -> end
```

- `lobby` -- players join and ready up
- `setup` -- deterministic deck and state construction
- `play` -- active gameplay
- `end` -- terminal phase, final outcome

Rules:
- Never invent alternate phase names
- Never set `ctx.phase` directly
- Always use `ctx.events.setPhase()` with a `// why:` comment

---

## Turn Stage Cycle (Play Phase Only)

```
start -> main -> cleanup -> (turn ends)
```

- Current stage stored in `G.currentStage` (not `ctx`)
- Reset to `'start'` on each new turn (`play` phase `onBegin`)
- `getNextTurnStage()` in `src/turn/turnPhases.logic.ts`
  is the **only authority** on ordering
- `ctx.events.endTurn()` is the **only** way to end a turn
  - Never manually rotate players
  - Requires a `// why:` comment

---

## Move Validation Contract [Invariant]

Every move MUST follow this exact sequence:

1. **Validate args**
   - Call validator
   - If invalid: return `void`
   - Never throw
2. **Check stage gate**
   - Use canonical gating rules
   - If blocked: return `void`
3. **Mutate G**
   - Use helpers (e.g., `zoneOps.ts`)
   - Return `void`

Rules:
- Moves never throw
- All validators return `MoveResult`
- `MoveResult` / `MoveError`
  from `src/moves/coreMoves.types.ts` is the engine-wide contract
- Never define parallel error types

**Exception:**
- `ZoneValidationError { field, message }`
  - Used ONLY for structural zone validation
  - Never reused for moves

---

## Stage Gating (Canonical)

| Move | Allowed stages | Why |
|---|---|---|
| drawCards | start, main | Cards drawn before and during action |
| playCard | main | Actions only during action window |
| revealVillainCard | start | Villain reveal occurs at start of turn (tabletop Legendary semantics) |
| endTurn | cleanup | Turn ends only after cleanup |

Rules:
- Uses `TurnStage` constants
- Never hardcode string literals

---

## Registry Boundary [Invariant]

The card registry is available at **setup time only**. Moves never have access
to it.

- `buildVillainDeck` (and similar setup functions) receive the registry as a
  **function argument** -- this is correct
- Move files and type files under `src/villainDeck/`, `src/moves/`, etc. must
  **never import** `@legendary-arena/registry`
- Card type classification is stored in `G.villainDeckCardTypes` at setup so
  moves can look up card types in O(1) without registry access
- Card display data is resolved by the UI via the registry separately

This is the foundational boundary: **setup resolves, moves operate on resolved data**.

---

## Villain Deck & Reveal Pipeline [Invariant]

### Structure
- `G.villainDeck.deck`: `CardExtId[]` -- cards to be revealed
- `G.villainDeck.discard`: `CardExtId[]` -- revealed cards (WP-015 routes
  villain/henchman to City instead)
- `G.villainDeckCardTypes`: `Record<CardExtId, RevealedCardType>` -- built at
  setup from registry, never modified at runtime

### RevealedCardType Conventions
- Canonical type strings (hyphens, NOT underscores):
  `'villain'` | `'henchman'` | `'bystander'` | `'scheme-twist'` | `'mastermind-strike'`
- `REVEALED_CARD_TYPES` is the canonical readonly array
- Drift-detection test required: array must match union type exactly
- A slug mismatch (e.g., `'scheme_twist'`) silently prevents triggers from firing

### Reveal Pipeline (`revealVillainCard`)
1. If deck empty + discard has cards: reshuffle discard into deck via `shuffleDeck`
2. If both empty: return G unchanged, log to `G.messages`
3. Draw top card (`deck[0]`), remove from deck (new array)
4. Look up type via `G.villainDeckCardTypes[cardId]`
5. Emit `'onCardRevealed'` with payload `{ cardId, cardTypeSlug }`
6. If `'scheme-twist'`: additionally emit `'onSchemeTwistRevealed'` with `{ cardId }`
7. If `'mastermind-strike'`: additionally emit `'onMastermindStrikeRevealed'` with `{ cardId }`
8. Apply all collected effects via `applyRuleEffects`
9. Place card in discard

Trigger emission uses `executeRuleHooks` from the rule pipeline -- no inline
effect logic inside the move.

---

## Zone Mutation Rules [Invariant]

- All zone mutations go through `zoneOps.ts`
- Helpers:
  - Return new arrays
  - Never mutate inputs
- Zones contain **CardExtId strings only**
  - Never card objects, metadata, or DB IDs
- `zoneOps.ts` has no `boardgame.io` imports
- **No `.reduce()`** -- use `for` or `for...of`

---

## Rule Execution Pipeline [Invariant]

To support swappable logic and serializable state:

### Two Registries
- `G.hookRegistry: HookDefinition[]`
  - Lives IN G
  - Data-only, JSON-serializable
- `ImplementationMap`
  - Lives OUTSIDE G
  - Contains handler functions

### Execution Steps
1. `executeRuleHooks`
   - Reads G
   - Returns `RuleEffect[]`
   - NEVER mutates G
2. `applyRuleEffects`
   - Applies effects using `for...of`
   - NEVER `.reduce()`
   - Unknown effect: warning in `G.messages`, continue (never throw)

Rules:
- Hook execution order is deterministic:
  priority (asc), then id (lexical)
- The server does not participate in rule execution
  (see `.claude/rules/server.md`)

---

## Endgame (endIf Contract)

- `endIf` is pure
  - No I/O
  - No events
  - No side effects
- Delegates entirely to `evaluateEndgame(G)`
- Reads only `G.counters` via `ENDGAME_CONDITIONS` constants
- Never inline counter logic in `endIf`
- Loss conditions evaluated before victory
- `ESCAPE_LIMIT = 8` is an MVP constant
  - Import it
  - Do not re-hardcode

---

## G.counters Keys (Canonical)

| Constant | Key | Meaning |
|---|---|---|
| ENDGAME_CONDITIONS.ESCAPED_VILLAINS | escapedVillains | Villains that escaped the City |
| ENDGAME_CONDITIONS.SCHEME_LOSS | schemeLoss | Scheme-triggered loss |
| ENDGAME_CONDITIONS.MASTERMIND_DEFEATED | mastermindDefeated | All tactics defeated = victory |

Rules:
- Always use constants
- Never hardcode strings

---

## Throwing Convention [Invariant]

| Context | Behavior | Why |
|---|---|---|
| Game.setup() | Throws Error | Match creation must abort early |
| Moves | Return void | Throws can crash boardgame.io server |
| Validators | Structured return | Caller decides next action |

Only `Game.setup()` may throw.

---

## Prohibited Behaviors (Absolute)

Claude must never:
- Import server code (`apps/server/**`) into the engine
- Import `@legendary-arena/registry` into move or type files
- Query the registry at move time -- use `G.villainDeckCardTypes` instead
- Depend on server startup state or `loadRules()`/`getRules()`
- Add persistence logic to the engine
- Persist or snapshot `G` directly
- Store functions inside `G`
- Bypass the rule pipeline (no inline effect logic in moves)
- Hardcode phase, stage, trigger, counter, or card type strings -- use constants
- Use underscores in card type slugs (`'scheme_twist'` is WRONG, `'scheme-twist'` is correct)
- Add logic that depends on UI behavior
- Introduce nondeterminism (time, randomness, I/O)

---

## Debuggability & Diagnostics [Invariant]

All engine behavior must be debuggable via deterministic reproduction and
state inspection -- not logging, breakpoints, or printf debugging.

- All behavior must be fully reproducible given identical setup config,
  identical RNG seed, and identical ordered moves
- Execution must be externally observable via deterministic state changes --
  invisible or implicit side effects are forbidden
- No state mutation may be introduced that cannot be inspected post-execution
  or validated via tests or replay analysis
- After execution, runtime state must remain JSON-serializable, zones/counters
  must contain no invalid entries, and no cross-module state may be mutated
  outside declared scope
- Failures must be localizable via invariant violation or unexpected state
  mutation
- When execution performs non-obvious behavior, a human-readable entry SHOULD
  be appended to `G.messages` to support replay inspection

---

## When Unsure -- STOP

If a change appears to:
- Modify a core contract
- Add a phase, stage, trigger, or effect
- Alter turn or phase flow
- Touch persistence boundaries
- Affect server startup or blur engine vs server responsibilities

STOP and consult:
- `.claude/rules/server.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/work-packets/WORK_INDEX.md`
- `DECISIONS.md`

Do not guess.
