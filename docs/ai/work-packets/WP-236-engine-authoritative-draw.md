# WP-236 — Engine-Authoritative Start-of-Turn Draw (Auto-Draw + Once-Per-Turn Guard, Retire Draw Scaffold)

**Status:** Draft
**Primary Layer:** Game Engine / Implementation (cross-layer: Server autoplay + Arena-Client play surface)
**Dependencies:** WP-007A (TURN_STAGES + drift arrays), WP-008A (core move validation + stage gating), WP-009B (rule-effect pipeline incl. `drawCards` effect), WP-100 (click-to-play surface + Draw scaffold), WP-158 (complete-game regression fixture), WP-212 (once-per-turn guard precedent for `revealVillainCard`)

---

## Session Context

> This packet fixes a **live bug on `play.legendary-arena.com`**: a player can
> draw cards more than once per turn. Root cause is documented, not a mystery —
> the engine `drawCards` move has no once-per-turn guard and no hand-size cap
> (D-10003), and the only thing capping draws today is a **UI scaffold button**
> (`TurnActionBar` "Draw to 6", D-10013) that computes `count = max(0, 6 - handCount)`
> from the last server frame. Because moves are `client: false` /
> server-authoritative, `handCount` is stale between a click and the next frame,
> so rapid clicks (or any move submitted over the wire outside the button) draw
> past six. The UI cap cannot be race-proof; only the authoritative engine can.
>
> D-10003 / D-10013 (and the sibling D-10011 / D-10012) explicitly name the fix:
> *"A consolidated engine WP that adds `turn.onBegin` auto-mechanics … would
> retire \[the\] scaffold button\[s]."* This packet does exactly that for the
> **draw** mechanic: the engine draws the start-of-turn hand automatically at
> `turn.onBegin`, a once-per-turn guard makes the `drawCards` move idempotent
> server-side, and the Draw scaffold button is deleted. The villain-reveal
> sibling already shipped this pattern (WP-212 / EC-243); this packet mirrors it
> and additionally retires the scaffold (WP-212 deferred its button deletion).
>
> **Scope decision (operator, 2026-06-10):** the consolidated "one WP, full
> auto-draw + scaffold retirement" option was chosen over a surgical
> guard-only fix. The trade — a wider blast radius and a **regenerated** replay
> fixture (auto-draw is a behavioural change, unlike WP-212's behaviour-neutral
> guard) — was accepted. This packet exceeds the lint §5 ~8-file split guideline;
> the deviation is operator-authorised and recorded here. Reveal-button and
> Advance-button retirement (D-10011 / D-10012) remain **out of scope** — this
> packet retires the **draw** scaffold only.

---

## Goal

After this session, `@legendary-arena/game-engine` owns the start-of-turn draw.
At the start of every player turn, the play phase `turn.onBegin` hook fills the
active player's hand to a canonical `HAND_SIZE` (6) by drawing from their deck
(reshuffling the discard when the deck is exhausted), before the `onTurnStart`
rule hooks fire. A new optional runtime field `G.hasDrawnThisTurn` tracks whether
the start-of-turn draw has been consumed; it is set when a draw is consumed and
reset to `false` at the start of every turn. The `drawCards` **move** keeps its
place in the engine move vocabulary but gains a once-per-turn guard (mirroring
`revealVillainCard`) and a `HAND_SIZE` cap, so a second `drawCards` submission in
the same turn — from any source, including a raw socket message — is a silent
no-op with zero state mutation. The bot/simulation path (`ai.legalMoves`) and the
server autoplay loop (`autoplay.mjs`) stop emitting the now-redundant `drawCards`
move. The arena-client `TurnActionBar` "Draw to 6" scaffold button and its
`handCount` prop are deleted from the desktop and mobile play surfaces. The
production over-draw bug is fixed at the only place it can be fixed race-free:
the engine.

---

## Assumes

> Verify before writing a single line. If any item is false, this packet is
> **BLOCKED**.

- WP-008A complete. Specifically:
  - `packages/game-engine/src/moves/coreMoves.impl.ts` exports `drawCards(context, args)`
    following the three-step move contract (validate args → stage gate → mutate `G`),
    with an inline `for` loop that draws `args.count` cards deck→hand and reshuffles
    the discard when the deck is exhausted.
  - `packages/game-engine/src/moves/coreMoves.gating.ts` maps `drawCards: ['start', 'main']`
    in `MOVE_ALLOWED_STAGES`.
  - `packages/game-engine/src/moves/coreMoves.types.ts` exports `CORE_MOVE_NAMES`
    (`['drawCards', 'playCard', 'endTurn']`) and the `CoreMoveName` union.
- WP-009B complete. Specifically:
  - `packages/game-engine/src/rules/ruleRuntime.effects.ts` contains the internal
    `applyDrawCards(gameState, effect, ctx)` applier (the rule-pipeline draw path
    used by the hero `draw` keyword), with its own deck→hand+reshuffle loop.
- WP-100 complete. Specifically:
  - `apps/arena-client/src/components/play/TurnActionBar.vue` renders the "Draw to 6"
    scaffold button (`onDraw`, `drawGate`) and declares a `handCount` prop
    (D-10003 / D-10013).
  - `apps/arena-client/src/pages/PlayDesktop.vue` and `.../PlayMobile.vue` render
    `<TurnActionBar :hand-count="viewer.handCount" … />`.
  - `apps/arena-client/src/components/play/uiMoveName.types.ts` exports the
    `UiMoveName` union including `'drawCards'`.
- WP-007A complete. Specifically:
  - `packages/game-engine/src/turn/turnPhases.types.ts` exports `TURN_STAGES`
    with `TURN_STAGES[0] === 'start'`.
- WP-158 complete. Specifically:
  - `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
    exists and carries `expected.finalStateHash`, `expected.messages`, and
    `expected.outcome` oracle layers, executed by `replayFixtures.test.ts` via
    `runFixture`.
  - `packages/game-engine/src/test/fixtures/runFixture.ts` independently
    reimplements the play-phase turn reset (`rotateToNextTurn` resets
    `currentStage`, `turnEconomy`, and `villainRevealedThisTurn`).
- WP-212 complete. Specifically:
  - `packages/game-engine/src/types.ts` `interface LegendaryGameState` declares
    the optional turn-scoped field `villainRevealedThisTurn?: boolean` immediately
    after `currentStage`; `game.ts` play phase `onBegin` resets it; the
    `revealVillainCard` wrapper sets it. This is the structural precedent the
    new `hasDrawnThisTurn` field mirrors.
  - `packages/game-engine/src/replay/replay.execute.test.ts` carries a pinned
    `PRE_WP080_HASH` regression hash.
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0
- `pnpm --filter @legendary-arena/arena-client build` and `… test` exit 0
- `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`, `docs/ai/STATUS.md` exist

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §The Move Validation Contract` — the `drawCards` move
  guard is an additional early-return inside the existing validation order; it
  must not throw or add a parallel error contract.
- `docs/ai/ARCHITECTURE.md §Phase & Turn Transitions` and `§The Turn Stage Cycle`
  — turn-scoped runtime state lives in `G` (`G.currentStage`, `G.turnEconomy`,
  `G.villainRevealedThisTurn`), reset by the play phase `onBegin`. The new field
  follows the identical lifecycle.
- `docs/ai/ARCHITECTURE.md §The Rule Execution Pipeline` — the hero `draw`
  keyword draws via the rule-effect applier (`applyDrawCards`), **not** the
  `drawCards` move. Confirm this before consolidating: the once-per-turn guard
  must never touch card-effect draws (exactly as WP-212's guard never touched
  scheme-twist chained reveals).
- `docs/ai/work-packets/WP-212-villain-reveal-once-per-turn-guard.md` +
  `docs/ai/execution-checklists/EC-243-…` — the sibling fix. Read both. The
  optional-field rationale, the `onBegin` reset, the `runFixture` harness mirror,
  and the pinned-hash re-pin are all reused here (scaled up because auto-draw is
  a behavioural change).
- `packages/game-engine/src/moves/coreMoves.impl.ts` — read `drawCards` entirely.
  Its inline draw loop becomes the body of the new `drawCardsIntoHand` helper.
- `packages/game-engine/src/rules/ruleRuntime.effects.ts §applyDrawCards` — read
  the rule-pipeline draw loop. It is consolidated onto the same helper
  (behaviour-neutral) so there is one draw primitive.
- `packages/game-engine/src/game.ts` — read the play phase `turn.onBegin` hook
  (sets `currentStage`, `turnEconomy`, `villainRevealedThisTurn`, then runs
  `onTurnStart` hooks). The auto-draw is inserted here, **before** the
  `executeRuleHooks('onTurnStart', …)` call.
- `packages/game-engine/src/rules/mastermindHandlers.ts` — read the Magneto
  hand-size handler (`MAGNETO_HAND_SIZE_LIMIT`). It is the reason auto-draw must
  run **before** `onTurnStart` hooks: a turn-start hook that reads or trims the
  hand must see the freshly-drawn hand.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — the `baseState`
  literal; the initial `hasDrawnThisTurn: false` is added alongside
  `villainRevealedThisTurn: false`.
- `packages/game-engine/src/test/fixtures/runFixture.ts §rotateToNextTurn` — the
  harness independently reimplements the `onBegin` resets. It must mirror **both**
  the new flag reset **and** the auto-draw, or replayed games diverge from real
  play (this is the WP-212 D-20903 lesson, scaled to include the draw).
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — read the `drawCards`
  legal-move emission (section 6). It is removed.
- `apps/server/src/autoplay/autoplay.mjs` — read the start-stage bot step that
  submits `drawCards`. It is removed.
- `apps/arena-client/src/components/play/TurnActionBar.vue` — read the Draw button,
  `onDraw`, `drawGate`, and the `handCount` prop block (the D-10003 / D-10013
  scaffold-artifact comments mark exactly what to delete).
- `apps/arena-client/src/pages/PlayDesktop.vue` + `PlayMobile.vue` — the
  `<TurnActionBar … :hand-count="viewer.handCount" … />` render sites.
- `docs/ai/DECISIONS.md` — scan D-10003, D-10013 (Draw scaffold), D-10011, D-10012
  (sibling scaffolds), D-20901..D-20903 (WP-212 reveal guard + harness mirror +
  hash re-pin), D-200xx (WP-200 hash-shift precedent). This packet reserves
  D-23601..D-23605.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 1 (duplicate before abstracting;
  the helper has 4 call sites so abstraction is warranted), Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 8 (no `.reduce()` in zone
  ops), Rule 9 (`node:` prefix), Rule 13 (ESM only).
- `docs/ai/REFERENCE/00.2-data-requirements.md` — confirm `HAND_SIZE` value (6)
  and the hand/deck/discard zone semantics are consistent with the canonical
  data requirements before locking the constant.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (the
  auto-draw's reshuffle uses the same deterministic shuffle as the existing move).
- Never throw inside boardgame.io move functions or phase/turn hooks — return
  void / early-return on invalid input. (`Game.setup()` remains the only throw site.)
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Persistence Boundaries.
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports.
- Test files use `.test.ts` — never `.test.mjs`.
- No database, network, or filesystem access inside move functions, turn hooks, or pure helpers.
- No `.reduce()` in zone operations or the draw loop — use explicit `for` / `while`.
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- **`HAND_SIZE` is the single source of truth** for the start-of-turn hand size,
  defined once in `drawCards.logic.ts` as `HAND_SIZE = 6`. No file may hardcode
  the literal `6` for hand size. (Magneto's `MAGNETO_HAND_SIZE_LIMIT = 4` is a
  separate mastermind cap and is **not** touched.)
- **`drawCardsIntoHand` is a pure helper** in `drawCards.logic.ts` — no
  `boardgame.io` import, no I/O, deterministic given its shuffle context. It owns
  the deck→hand fill-with-reshuffle loop and is the sole draw primitive used by:
  (1) the `drawCards` move, (2) the rule-effect applier `applyDrawCards`, (3) the
  play phase `onBegin` auto-draw, (4) the `runFixture` harness turn rotation. The
  consolidation of (1) and (2) onto the helper MUST be **behaviour-neutral** —
  the only behavioural change in this packet is the new `onBegin` auto-draw and
  the move guard.
- **Auto-draw runs before `onTurnStart` hooks.** In `onBegin`, the order is
  locked: reset `currentStage` → reset `turnEconomy` → reset
  `villainRevealedThisTurn` → reset `hasDrawnThisTurn = false` → **auto-draw to
  `HAND_SIZE`** (sets `hasDrawnThisTurn = true`) → `executeRuleHooks('onTurnStart', …)`
  → `applyRuleEffects`. Rationale: a turn-start hook that reads or trims the hand
  (e.g., Magneto) must observe the freshly-drawn hand.
- **Auto-draw fills to `HAND_SIZE`**: `count = max(0, HAND_SIZE - hand.length)`
  for `ctx.currentPlayer` only. It never draws when the hand is already at or
  above `HAND_SIZE`.
- **`G.hasDrawnThisTurn` is declared optional** (`?: boolean`) on
  `LegendaryGameState`. Do NOT make it required — a required field forces edits
  to every full-`LegendaryGameState` literal across the test suite (the WP-212
  21-file lesson). Absent is treated as `false`. It is a **turn-scoped boolean
  flag only** — never a counter, enum, or timestamp.
- **The flag is internal `G` state, NOT projected to `UIState`.** Do NOT add it
  to `uiState.types.ts` / `uiState.build.ts` / any UIState fixture. The deleted
  button removes the only UI consumer; the new hand simply appears via the normal
  UIState push. (This is why the WP-166/207/227 arena-client UIState fixture
  backfill recurrence does **not** apply to this packet.)
- **The `drawCards` move is kept, not removed.** `CORE_MOVE_NAMES`, the
  `CoreMoveName` union, `MOVE_ALLOWED_STAGES`, and `coreMoves.validate.ts` are
  **unchanged** (no drift-array churn). The move gains the guard + cap and
  delegates its draw to the helper; it remains registered in `LegendaryGame.moves`
  as defensive, engine-authoritative protection against any direct submission.
- **The `drawCards` move guard mirrors `revealVillainCard` exactly.** Order in
  the move body: (1) validate args (existing) → (2) stage gate (existing) → (3)
  `if (G.hasDrawnThisTurn) return;` (new guard) → (4) resolve `playerZones`
  (existing) → (5) draw `min(args.count, HAND_SIZE - hand.length)` via
  `drawCardsIntoHand` → (6) `G.hasDrawnThisTurn = true;` (new, unconditional —
  consumed on the attempt, not the draw success).
- **`'drawCards'` stays in `UiMoveName`.** The engine move still exists, so the
  union (documented as a strict subset of the engine move bag) need not change.
  This deliberately avoids churning `bgioClient.test.ts`, which uses `'drawCards'`
  as a transport example. Removing the name is out of scope.
- **Only the `TurnActionBar` `handCount` PROP is deleted.** The `UIState`
  `player.handCount` display field (rendered by `PlayerPanel.vue`,
  `OpponentPanel.vue`, and UIState fixtures) is a different field and MUST NOT be
  touched.
- **The sentinel replay fixture is REGENERATED, not re-pinned.** Auto-draw moves
  the draw off explicit moves and into `onBegin`, so `expected.finalStateHash`,
  `expected.messages`, AND `expected.outcome` all legitimately change. The WP-212
  "messages/outcome must stay byte-identical" guard does **NOT** apply here.
  Instead the executor regenerates the fixture via the capture mechanism and
  validates that the new replay represents a **coherent game** (same winner /
  endgame-condition class, comparable turn count) — see §Debuggability.

**Session protocol:**
- If any contract, field name, constant value, or file path is unclear, stop and
  ask the human before proceeding — never guess or invent field names, type
  shapes, the `HAND_SIZE` value, or file paths.

**Locked contract values (inline — do not re-derive):**
- **`HAND_SIZE`**: `6` (defined once in `drawCards.logic.ts`).
- **New field name:** `hasDrawnThisTurn` (camelCase, boolean, optional). Do not
  abbreviate or rename.
- **Helper name:** `drawCardsIntoHand`. **Helper module:** `packages/game-engine/src/moves/drawCards.logic.ts`.
- **TurnStage values:** `'start'` | `'main'` | `'cleanup'`; `TURN_STAGES[0] === 'start'`.
- **`onBegin` order (exact):** currentStage → turnEconomy → villainRevealedThisTurn → hasDrawnThisTurn(false) → auto-draw → onTurnStart hooks.

---

## Debuggability & Diagnostics

- The auto-draw is deterministic and replay-faithful: given identical setup,
  seed, and move list, every turn's `onBegin` fills the active player's hand to
  `HAND_SIZE` identically (the reshuffle uses the engine's existing deterministic
  shuffle; no new randomness source is introduced).
- The move guard's effect is observable via `G.hasDrawnThisTurn` and via
  whole-state equality: a blocked `drawCards` leaves `G` `deepStrictEqual` to its
  pre-call `structuredClone` snapshot (zero observable mutation anywhere in `G`),
  exactly like the WP-212 reveal guard.
- The flag is set on the draw *attempt*, not the draw *count*: even an
  exhausted-deck-and-empty-discard player consumes the allowance (`hasDrawnThisTurn
  === true`), foreclosing an empty-deck retry loop.
- Runtime state remains JSON-serializable after the new field is written (boolean).
- No `G.messages` entry is added for a blocked `drawCards` (silent no-op per the
  Move Validation Contract — same as the existing stage-gate early return).
- **Fixture-regeneration sanity check (replaces WP-212's byte-identity guard):**
  after regenerating `sentinel-core-doom-2p.replay.json`, the executor confirms
  the new `expected.outcome` reports the **same endgame-condition class** as
  before (the game still ends the same way) and a comparable turn count. A
  *different* winner or endgame condition is a STOP signal — the auto-draw is
  altering game flow beyond the intended draw-timing shift. The `finalStateHash`,
  `messages`, and `outcome` are all expected to change; the *shape* of the
  outcome is what is validated.

---

## Scope (In)

### A) New draw primitive — `src/moves/drawCards.logic.ts` (new)
- Export `const HAND_SIZE = 6;` with a `// why:` comment: canonical
  start-of-turn hand size; single source of truth; cross-check against
  `00.2-data-requirements.md`.
- Export a pure helper `drawCardsIntoHand(playerZones, count, shuffleContext)`
  that moves up to `count` cards from `playerZones.deck` to `playerZones.hand`,
  reshuffling `playerZones.discard` into the deck (via the existing deterministic
  `shuffleDeck`) when the deck is exhausted mid-draw, and stopping early when no
  cards remain anywhere. Mutates the passed zones (matching the existing move /
  effect mutation style) and contains **no `boardgame.io` import** and **no
  `.reduce()`**. JSDoc documents params, return, and the reshuffle behaviour.
- This is the exact deck→hand+reshuffle logic currently duplicated in
  `coreMoves.impl.ts` (`drawCards`) and `ruleRuntime.effects.ts` (`applyDrawCards`);
  the helper is their single source.

### B) Declare the runtime field — `src/types.ts` (modified)
- In `interface LegendaryGameState`, immediately after `villainRevealedThisTurn?: boolean`,
  declare `hasDrawnThisTurn?: boolean` with a `// why:` comment: tracks whether
  the start-of-turn draw has been consumed this turn; optional so existing
  full-`G` literals need no edit (absent ⇒ not yet drawn); set by `onBegin`
  auto-draw and by the `drawCards` move; reset each turn by `onBegin`. Internal
  `G` state — not projected to `UIState`.

### C) Initialize at setup — `src/setup/buildInitialGameState.ts` (modified)
- In `baseState`, add `hasDrawnThisTurn: false` adjacent to
  `villainRevealedThisTurn: false`, with a `// why:` comment: no draw has occurred
  at setup; `onBegin` resets it and performs the turn-1 auto-draw.

### D) Reset + auto-draw in `onBegin` — `src/game.ts` (modified)
- In the play phase `turn.onBegin`, after the existing `currentStage` /
  `turnEconomy` / `villainRevealedThisTurn` resets, add:
  - `G.hasDrawnThisTurn = false;` with a `// why:` comment (allowance refreshes
    each turn; without it the move guard would block from turn 2).
  - Auto-draw: resolve the current player's zones, compute
    `count = max(0, HAND_SIZE - hand.length)`, call `drawCardsIntoHand(...)` with
    the hook's shuffle context, then set `G.hasDrawnThisTurn = true;`. Add a
    `// why:` comment: the engine draws the start-of-turn hand (engine owns the
    draw rule; the former UI scaffold is retired); runs before `onTurnStart` so
    hand-reading hooks (e.g., Magneto) see the drawn hand.
- The auto-draw block must sit **before** the existing
  `executeRuleHooks('onTurnStart', …)` / `applyRuleEffects(...)` calls. Add the
  `random`/shuffle context to the hook's destructured params as needed (boardgame.io
  passes the full context to `onBegin`).

### E) Guard + cap + delegate the move — `src/moves/coreMoves.impl.ts` (modified)
- In `drawCards`, after the existing stage gate and before resolving `playerZones`,
  add `if (G.hasDrawnThisTurn) return;` with a `// why:` comment (once-per-turn;
  card-effect draws use the rule-effect path and bypass this).
- Replace the inline draw `for` loop with a call to `drawCardsIntoHand(playerZones,
  Math.min(args.count, Math.max(0, HAND_SIZE - playerZones.hand.length)), context)`.
- After the draw, add `G.hasDrawnThisTurn = true;` **unconditionally** with a
  `// why:` comment (the attempt is consumed regardless of how many cards were drawn).
- `import { HAND_SIZE, drawCardsIntoHand } from './drawCards.logic.js';`

### F) Consolidate the rule-effect applier — `src/rules/ruleRuntime.effects.ts` (modified)
- Replace the inline `while` draw loop in `applyDrawCards` with a call to
  `drawCardsIntoHand(playerZones, effect.count, ctx)`. Keep the existing
  player-not-found `messages.push(...)` guard at the call site (the helper draws;
  the caller owns not-found handling). This consolidation is **behaviour-neutral**.

### G) Mirror the harness — `src/test/fixtures/runFixture.ts` (modified)
- In `rotateToNextTurn`, after the existing `villainRevealedThisTurn = false`
  mirror, add `gameState.hasDrawnThisTurn = false;` and then the **same auto-draw**
  the real `onBegin` performs (fill the new current player's hand to `HAND_SIZE`
  via `drawCardsIntoHand`, set `hasDrawnThisTurn = true`). Add a `// why:` comment:
  the harness reimplements `onBegin`; without mirroring the auto-draw, replayed
  games never draw and diverge from real play (the WP-212 D-20903 lesson, extended
  to the draw).

### H) Stop the bot/sweep emitting the move — `src/simulation/ai.legalMoves.ts` (modified)
- Delete the section-6 `drawCards` legal-move push (the `if (stage === 'start' ||
  stage === 'main') { legalMoves.push({ name: 'drawCards', … }); }` block) and
  renumber the trailing comment(s). Add a `// why:` comment at the removal point:
  the start-of-turn hand is now drawn automatically at `onBegin`; emitting
  `drawCards` would only produce a guarded no-op and waste a bot move choice.

### I) Stop autoplay emitting the move — `apps/server/src/autoplay/autoplay.mjs` (modified)
- Remove the start-stage bot step that submits `drawCards` (the "draw hand,
  reveal one villain card, then advance" step). Adjust the surrounding comment to
  reflect that the engine auto-draws. Do not change reveal/advance behaviour.

### J) Delete the Draw scaffold — `apps/arena-client/src/components/play/TurnActionBar.vue` (modified)
- Delete the "Draw to 6" button (template), the `onDraw` handler, the `drawGate`
  predicate, and the `handCount` prop declaration (the D-10003 / D-10013
  scaffold-artifact block). Remove `onDraw` / `drawGate` from the component's
  returned bindings. Update the Step-1 header comment that referenced "draw
  starting hand" to reflect that draw is now automatic. Do **not** touch the
  Reveal or Advance affordances.

### K) Drop the prop bindings — `PlayDesktop.vue` + `PlayMobile.vue` (modified)
- In both `apps/arena-client/src/pages/PlayDesktop.vue` and `.../PlayMobile.vue`,
  remove the `:hand-count="viewer.handCount"` attribute from the `<TurnActionBar>`
  render. Leave every other `<TurnActionBar>` prop intact. Do not remove
  `viewer.handCount` itself (it remains a valid UIState field used elsewhere).

### L) Update the button tests — `TurnActionBar.test.ts` (modified)
- Delete the Draw-button tests (the `'Draw click emits drawCards …'` case and any
  D-10003 / D-10013 idempotency/disable cases). Remove `handCount` from the
  test's prop fixtures. Add one test asserting the rendered `TurnActionBar` no
  longer exposes a `[data-testid="play-action-draw"]` element (proves the scaffold
  is gone). Leave Reveal / Advance / End-Turn tests untouched.

### M) Engine tests for the new behaviour
- `src/moves/drawCards.logic.test.ts` (new) — `node:test` cases for the helper:
  draws `count` cards deck→hand; reshuffles discard into deck when the deck is
  exhausted mid-draw (deterministic order via `makeMockCtx` reverse-shuffle);
  stops early when deck and discard are both empty; `JSON.stringify` of the zones
  succeeds. No `boardgame.io` import.
- `src/moves/coreMoves.integration.test.ts` (modified) — update/extend the
  `drawCards` move cases: (a) a first `drawCards` is capped at `HAND_SIZE`
  (a `count` above the cap fills only to 6 and sets `hasDrawnThisTurn`); (b) a
  second `drawCards` in the same turn leaves `G` `deepStrictEqual` to a
  `structuredClone` snapshot (blocked, zero mutation); (c) an empty-deck attempt
  still sets `hasDrawnThisTurn === true`.
- `src/game.test.ts` (modified) — add a play-phase `onBegin` test: a turn begins
  with an empty hand → after `onBegin` the active player's hand length equals
  `HAND_SIZE` and `G.hasDrawnThisTurn === true`; a turn-start hook observes the
  drawn hand (ordering proof).

### N) Regenerate the complete-game fixture — `sentinel-core-doom-2p.replay.json` (modified)
- After all engine changes, regenerate the fixture via its capture mechanism so
  `expected.finalStateHash`, `expected.messages`, and `expected.outcome` reflect
  auto-draw. Apply the §Debuggability coherent-game sanity check before accepting
  the regenerated oracles.

### O) Re-pin the replay regression hash — `src/replay/replay.execute.test.ts` (modified)
- Re-pin `PRE_WP080_HASH` to the new actual value (use the file's existing
  `__CAPTURE_ME__` capture path). The shift is expected (auto-draw changes the
  replayed final state); it is not behaviour-neutral, unlike the WP-212 re-pin.

---

## Out of Scope

- **Reveal-button and Advance-button retirement (D-10011 / D-10012).** This
  packet retires the **Draw** scaffold only. The Reveal button (already
  engine-guarded by WP-212) and the Advance button stay.
- **Removing `'drawCards'` from `UiMoveName`** or any change to
  `uiMoveName.types.ts` / `bgioClient.test.ts`. The engine move persists, so the
  permitted-name stays; removal is unnecessary churn.
- **The `UIState` `player.handCount` field** and its consumers (`PlayerPanel.vue`,
  `OpponentPanel.vue`, `PlayerPanelList`, UIState fixtures). Untouched.
- **Projecting `hasDrawnThisTurn` through `UIState`.** It is internal `G` state.
- **Removing or renaming the `drawCards` move**, or any change to
  `CORE_MOVE_NAMES`, the `CoreMoveName` union, `MOVE_ALLOWED_STAGES`, or
  `coreMoves.validate.ts`.
- **The hero `draw` keyword / card-effect draw semantics.** `applyDrawCards` is
  consolidated onto the helper behaviour-neutrally; its draw *count* and trigger
  semantics are unchanged.
- **`endTurn` draw behaviour.** `endTurn` continues to discard only; the new-hand
  draw is owned by the next turn's `onBegin`. No change to `endTurn`.
- **Magneto / `MAGNETO_HAND_SIZE_LIMIT`** or any mastermind hand-trim logic.
- Refactors, cleanups, or "while I'm here" improvements not listed in Scope (In).

---

## Files Expected to Change

**Game engine (`packages/game-engine/src/`):**
- `moves/drawCards.logic.ts` — **new** — `HAND_SIZE` constant + `drawCardsIntoHand` pure helper.
- `moves/drawCards.logic.test.ts` — **new** — helper unit tests (`node:test`, no boardgame.io).
- `moves/coreMoves.impl.ts` — **modified** — `drawCards` guard + `HAND_SIZE` cap + delegate to helper.
- `types.ts` — **modified** — declare optional `hasDrawnThisTurn?: boolean` after `villainRevealedThisTurn`.
- `setup/buildInitialGameState.ts` — **modified** — init `hasDrawnThisTurn: false`.
- `game.ts` — **modified** — `onBegin` flag reset + auto-draw to `HAND_SIZE` before `onTurnStart` hooks.
- `rules/ruleRuntime.effects.ts` — **modified** — `applyDrawCards` delegates to the helper (behaviour-neutral).
- `simulation/ai.legalMoves.ts` — **modified** — remove the `drawCards` legal-move emission.
- `test/fixtures/runFixture.ts` — **modified** — mirror the `onBegin` flag reset + auto-draw in `rotateToNextTurn`.
- `test/fixtures/games/sentinel-core-doom-2p.replay.json` — **modified** — regenerate all three oracle layers.
- `replay/replay.execute.test.ts` — **modified** — re-pin `PRE_WP080_HASH`.
- `moves/coreMoves.integration.test.ts` — **modified** — guard + cap + blocked-second-draw tests.
- `game.test.ts` — **modified** — `onBegin` auto-draw test.

**Server (`apps/server/`):**
- `src/autoplay/autoplay.mjs` — **modified** — remove the bot start-stage `drawCards` step.

**Arena client (`apps/arena-client/src/`):**
- `components/play/TurnActionBar.vue` — **modified** — delete Draw button, `onDraw`, `drawGate`, `handCount` prop.
- `components/play/TurnActionBar.test.ts` — **modified** — delete Draw/D-10003/D-10013 tests; assert the Draw control is gone.
- `pages/PlayDesktop.vue` — **modified** — drop `:hand-count` binding on `<TurnActionBar>`.
- `pages/PlayMobile.vue` — **modified** — drop `:hand-count` binding on `<TurnActionBar>`.

**Governance (`docs/ai/`):**
- `STATUS.md` — **modified** — record the engine-authoritative draw + scaffold retirement.
- `DECISIONS.md` — **modified** — add D-23601..D-23605.
- `work-packets/WORK_INDEX.md` — **modified** — check off WP-236 with today's date.

No other files may be modified. (Drafted as 21 files — 18 source/test/fixture/server/client
+ 3 governance. Per the WP-212 precedent, the field addition + harness mirror may
surface one or two additional mechanically-forced test/fixture files at execution;
if so, fold them in and log the amendment, mirroring D-20903.)

---

## Acceptance Criteria

### A) Draw primitive
- [ ] `src/moves/drawCards.logic.ts` exports `HAND_SIZE === 6` and a
      `drawCardsIntoHand` helper with **no** `boardgame.io` import and **no**
      `.reduce()` (confirmed by reading + `Select-String`).

### B) Field + setup + reset
- [ ] `interface LegendaryGameState` declares `hasDrawnThisTurn?: boolean`
      (optional) immediately after `villainRevealedThisTurn`, with a `// why:`.
- [ ] `baseState` sets `hasDrawnThisTurn: false`.
- [ ] The play phase `onBegin` resets `G.hasDrawnThisTurn = false` and auto-draws
      to `HAND_SIZE` **before** `executeRuleHooks('onTurnStart', …)`, with `// why:` comments.

### C) Move guard + cap
- [ ] `drawCards` returns early (no draw, no flag set beyond what the guard reads)
      when `G.hasDrawnThisTurn` is truthy, after the stage gate.
- [ ] A blocked second `drawCards` leaves `G` `deepStrictEqual` to its
      `structuredClone` snapshot (zero mutation anywhere in `G`).
- [ ] A first `drawCards` with `count` above the cap fills the hand to exactly
      `HAND_SIZE` and sets `G.hasDrawnThisTurn === true`.
- [ ] An empty-deck-and-empty-discard `drawCards` attempt still sets
      `G.hasDrawnThisTurn === true`.
- [ ] `drawCards` and `applyDrawCards` both call `drawCardsIntoHand` (single draw
      primitive; confirmed by reading).

### D) onBegin auto-draw
- [ ] A `game.test.ts` test proves a turn begins with the active player's hand at
      `HAND_SIZE` after `onBegin`, with `G.hasDrawnThisTurn === true`, and that the
      auto-draw precedes the `onTurnStart` hooks.

### E) Scaffold retirement
- [ ] `ai.legalMoves.ts` no longer emits `{ name: 'drawCards', … }` (confirmed with `Select-String`).
- [ ] `autoplay.mjs` no longer submits `drawCards` (confirmed with `Select-String`).
- [ ] `TurnActionBar.vue` has no Draw button, `onDraw`, `drawGate`, or `handCount`
      prop (confirmed with `Select-String` for `play-action-draw` and `handCount`).
- [ ] `PlayDesktop.vue` and `PlayMobile.vue` no longer bind `:hand-count` on
      `<TurnActionBar>` (confirmed with `Select-String`).
- [ ] `CORE_MOVE_NAMES`, `CoreMoveName`, `MOVE_ALLOWED_STAGES`, and `UiMoveName`
      are unchanged (confirmed with `git diff` — the move and the UI vocabulary stay).

### F) Fixture regeneration
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with the
      regenerated `sentinel-core-doom-2p.replay.json` and re-pinned `PRE_WP080_HASH`.
- [ ] The regenerated `expected.outcome` reports the **same endgame-condition
      class** and a comparable turn count as the pre-change fixture (coherent-game
      sanity check; a different winner/condition is a STOP).

### G) Builds + scope
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0.
- [ ] `pnpm --filter @legendary-arena/arena-client build` + `test` exit 0.
- [ ] `pnpm --filter @legendary-arena/server` build/test (as configured) pass; autoplay change is type-clean.
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — engine build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — engine tests (incl. new helper tests, move guard tests, onBegin test,
#          regenerated fixture, re-pinned PRE_WP080_HASH)
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP — all passing, 0 failing

# Step 3 — the helper is a pure module (no game-framework import)
# why: import-scoped pattern (`from '<framework>`) so the grep matches only the
# import statement, never JSDoc/comment prose — avoids the §18 grep-gate self-trip.
Select-String -Path "packages\game-engine\src\moves\drawCards.logic.ts" -Pattern "from 'boardgame"
# Expected: no output. (The module JSDoc MUST paraphrase — e.g. "pure helper, no
# game-framework import" — and MUST NOT contain the literal token the grep would
# match, per §18 / the grep-gate-comment self-trip pattern.)

# Step 4 — single draw primitive (move + effect both delegate)
Select-String -Path "packages\game-engine\src\moves\coreMoves.impl.ts","packages\game-engine\src\rules\ruleRuntime.effects.ts" -Pattern "drawCardsIntoHand"
# Expected: a match in each file

# Step 5 — bot/sweep no longer emits drawCards
Select-String -Path "packages\game-engine\src\simulation\ai.legalMoves.ts" -Pattern "name: 'drawCards'"
# Expected: no output

# Step 6 — autoplay no longer submits drawCards
Select-String -Path "apps\server\src\autoplay\autoplay.mjs" -Pattern "drawCards"
# Expected: no output

# Step 7 — the Draw scaffold is gone
Select-String -Path "apps\arena-client\src\components\play\TurnActionBar.vue" -Pattern "play-action-draw|handCount|onDraw|drawGate"
# Expected: no output

# Step 8 — prop bindings dropped
Select-String -Path "apps\arena-client\src\pages\PlayDesktop.vue","apps\arena-client\src\pages\PlayMobile.vue" -Pattern "hand-count"
# Expected: no output

# Step 9 — engine move + UI vocabulary contracts unchanged
git diff -- packages/game-engine/src/moves/coreMoves.types.ts packages/game-engine/src/moves/coreMoves.gating.ts packages/game-engine/src/moves/coreMoves.validate.ts apps/arena-client/src/components/play/uiMoveName.types.ts
# Expected: no output

# Step 10 — client build + tests
pnpm --filter @legendary-arena/arena-client build
pnpm --filter @legendary-arena/arena-client test
# Expected: exits 0; all passing

# Step 11 — scope boundary
git diff --name-only
# Expected: only the files in ## Files Expected to Change
```

---

## Vision Alignment

**Vision clauses touched:** §3 (determinism / engine authority), §8 (RNG
sourcing — the auto-draw's reshuffle consumes the engine's existing deterministic
shuffle; no new randomness source), §22 (replay fidelity — the pinned replay
fixture + `PRE_WP080_HASH` are regenerated/re-pinned).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.`
The change moves an existing tabletop rule ("draw your hand once at the start of
your turn") from a fragile UI scaffold into the engine, strengthening
engine-owns-truth (§3).

**Non-Goal proximity check:** None of NG-1..7 are crossed. This is a
rules-correctness fix and a scaffold retirement; no paid, persuasive, or
competitive surface is added. NG-1 (no pay-to-win) is untouched.

**Determinism preservation:** The auto-draw is deterministic and replay-faithful
— a pure function of setup, seed, and move history (the hand is filled to
`HAND_SIZE` at each `onBegin` using `ctx.random`-seeded reshuffle). Unlike the
WP-212 reveal re-pin (behaviour-neutral), the sentinel fixture is **regenerated**
because draw timing genuinely changes; the coherent-game sanity check (same
endgame-condition class) replaces byte-identity as the determinism guard.

## Funding Surface Gate

N/A — engine turn-loop rules-correctness fix plus deletion of a play-surface
scaffold button. No global-nav / registry-viewer / profile funding affordances
are touched, no user-visible funding copy is added or changed, and no
funding-channel integration is involved. (Justification per lint §20: none of the
§20.1 trigger surfaces — nav/registry/profile funding affordances, tournament
funding channels, or donate/support copy — are present; the only UI change is
removing a Draw button.)

## API Catalog

N/A — no HTTP endpoint on `apps/server` is added, modified, removed, or
status-changed, and no `apps/server/src/**` library function recorded in
`api-endpoints.md` is touched. (`autoplay.mjs` is an internal bot script, not a
cataloged endpoint or `Library-only` function.)

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-11:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists 8 exclusions (Reveal/Advance scaffolds, `UiMoveName`/`bgioClient`, `UIState.handCount`, flag-not-projected, move/`CORE_MOVE_NAMES`, hero `draw` keyword, `endTurn`, Magneto) |
| 2 | PASS | Non-Negotiable Constraints explicit: `ctx.random.*` only, never throw in move/hook, JSON-serializable `G`, ESM/`node:`, no `.reduce()` in the draw loop, full-file output |
| 3 | PASS | `## Assumes` lists every dep WP + exact files/symbols/exports; BLOCKED clause present |
| 4 | PASS | `## Context (Read First)` cites ARCHITECTURE §Move-Contract/§Phase-Turn/§Rule-Pipeline, WP-212/EC-243, every engine file, DECISIONS D-10003/10011-13/20901-03, 00.6, 00.2 |
| 5 | CONDITIONAL PASS | ~21 files (>~8 guideline) — operator-authorised 2026-06-10 (consolidated engine WP per D-10012); each file has a disposition; amendment clause for mechanically-forced extras |
| 6 | PASS | `HAND_SIZE`/`hasDrawnThisTurn`/`drawCardsIntoHand`/`villainRevealedThisTurn`/`CORE_MOVE_NAMES`/`MOVE_ALLOWED_STAGES`/`PRE_WP080_HASH`/`MAGNETO_HAND_SIZE_LIMIT` match engine source exactly (verified against current main) |
| 7 | PASS | No new npm dependency; reuses the existing deterministic `shuffleDeck` + `ctx.random` |
| 8 | PASS | Cross-layer but each change respects ownership: engine owns the rule, client deletes a button, server stops emitting; `drawCards.logic.ts` is a pure helper (no `boardgame.io`) |
| 9 | PASS | PowerShell `Select-String` greps + Windows paths; import-scoped purity grep |
| 10 | PASS | No new env var; no secret in output |
| 11 | N/A | No auth surface touched |
| 12 | PASS | `node:test` + `makeMockCtx` reverse-shuffle; no `boardgame.io/testing`; new helper + integration + `game.test` + regenerated fixture cases |
| 13 | PASS | Exact `pnpm --filter` commands with expected output (11 verification steps) |
| 14 | PASS | A–G binary, observable acceptance criteria aligned to deliverables |
| 15 | PASS | DoD includes engine+client build/test + STATUS/DECISIONS/WORK_INDEX + `git diff --name-only` scope check (EC_INDEX `Pending`→Done folds in under the §Files amendment clause) |
| 16 | PASS | Human-style: helper abstraction warranted (4 call sites, 00.6 Rule 1), explicit `for`/`while` (no `.reduce()`), JSDoc, `// why:` on every non-obvious site |
| 17 | PASS | Touches §3/§8/§22 (determinism/RNG/replay) — `## Vision Alignment` block present with clause citations + determinism-preservation + the fixture-regeneration rationale (coherent-game sanity check replaces byte-identity) |
| 18 | PASS | Verification Step 3 uses the import-scoped `from 'boardgame` grep with an explicit JSDoc-paraphrase note — no forbidden-token enumeration in prose (grep-gate-comment self-trip pre-empted) |
| 19 | N/A | Not a repo-state-summarizing artifact |
| 20 | N/A | No funding surface (see Funding Surface Gate) |
| 21 | N/A | No endpoint/library-function surface touched (see API Catalog) |

Reserved decisions (Active at close): **D-23601** auto-draw at `onBegin` to `HAND_SIZE` before `onTurnStart` + once-per-turn guard on the kept `drawCards` move; **D-23602** optional internal-`G` `hasDrawnThisTurn?: boolean` (absent ⇒ false; not UIState-projected); **D-23603** Draw scaffold retirement (button + prop + bot/sweep emission removed; move + `UiMoveName` kept); **D-23604** sentinel replay regenerated (behavioural change; coherent-game sanity check replaces byte-identity; `PRE_WP080_HASH` re-pinned); **D-23605** `drawCardsIntoHand` + `HAND_SIZE` consolidation (single draw primitive; behaviour-neutral).

---

## Definition of Done

> Claude Code must execute every command in `## Verification Steps` before
> checking any item below. Reading the code is not sufficient — run the commands.

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (all test files)
- [ ] `pnpm --filter @legendary-arena/arena-client build` + `test` exit 0
- [ ] `drawCardsIntoHand` is the sole draw primitive (move + effect + onBegin + harness all delegate)
- [ ] No `boardgame.io` import in `drawCards.logic.ts`; no `.reduce()` in the draw loop
- [ ] The Draw scaffold (button + `onDraw` + `drawGate` + `handCount` prop + `:hand-count` bindings) is fully removed
- [ ] `CORE_MOVE_NAMES` / `CoreMoveName` / `MOVE_ALLOWED_STAGES` / `UiMoveName` unchanged (confirmed with `git diff`)
- [ ] `UIState` `player.handCount` field and its consumers untouched
- [ ] The regenerated sentinel fixture passes the coherent-game sanity check
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — records the engine now auto-draws the start-of-turn hand and the once-per-turn guard makes `drawCards` idempotent; Draw scaffold retired
- [ ] `docs/ai/DECISIONS.md` updated — D-23601 (auto-draw at `onBegin` to `HAND_SIZE` before `onTurnStart` hooks + once-per-turn guard on the kept `drawCards` move), D-23602 (optional `hasDrawnThisTurn?: boolean` rationale; absent ⇒ false; internal-G, not UIState-projected), D-23603 (Draw scaffold retirement: button + prop + bot/sweep emission removed; move + `UiMoveName` kept), D-23604 (sentinel replay **regenerated** — behavioural change, not behaviour-neutral; coherent-game sanity check replaces byte-identity; `PRE_WP080_HASH` re-pinned), D-23605 (`drawCardsIntoHand` + `HAND_SIZE` consolidation — single draw primitive across move/effect/onBegin/harness; behaviour-neutral)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-236 checked off with today's date
