# WP-212 — Once-Per-Turn Villain Reveal Guard

**Status:** Ready
**Primary Layer:** Game Engine / Implementation
**Dependencies:** WP-015 (villain reveal move), WP-007A (TURN_STAGES), WP-158 (complete-game regression fixture), WP-182 (scheme-twist chained reveals)

---

## Session Context

> WP-015 split `revealVillainCard` (the boardgame.io move wrapper carrying the
> start-stage gate) from `performVillainReveal` (the shared draw→classify→route
> pipeline) precisely so rule handlers could chain extra reveals without
> re-asserting the gate; WP-182's scheme-twist resolvers (`schemeTwistResolvers.ts`)
> call `performVillainReveal` directly for that purpose. This packet adds a
> once-per-turn guard to the **wrapper only**, leaving the shared body — and
> therefore every chained reveal — unchanged.

---

## Goal

After this session, `@legendary-arena/game-engine` enforces the tabletop
"reveal the top villain card once at the start of your turn" rule in the engine
itself. A second player-initiated `revealVillainCard` move within the same turn
returns silently as a no-op instead of drawing another villain card into the
City. A new optional runtime field `G.villainRevealedThisTurn` tracks whether
the start-of-turn reveal has been consumed; it is set when the wrapper completes
a reveal and reset to `false` at the start of every player turn. Rule-handler
chained reveals (scheme twists that reveal additional cards via
`performVillainReveal`) are intentionally unaffected.

---

## Assumes

> Verify before writing a single line. If any item is false, this packet is
> **BLOCKED**.

- WP-015 complete. Specifically:
  - `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` exports
    `revealVillainCard(context)` (the move wrapper, stage-gated on
    `G.currentStage !== 'start'`) and `performVillainReveal(G, context, implementationMap)`
    (the shared pipeline body).
- WP-182 complete. Specifically:
  - `packages/game-engine/src/rules/schemeTwistResolvers.ts` calls
    `performVillainReveal(...)` directly (current call sites: lines 230 and 491)
    to chain additional reveals. These must continue to bypass the new guard.
- WP-007A complete. Specifically:
  - `packages/game-engine/src/turn/turnPhases.types.ts` exports `TURN_STAGES`
    with `TURN_STAGES[0] === 'start'`.
- WP-158 complete. Specifically:
  - `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
    exists and carries `expected.finalStateHash`, `expected.messages`, and
    `expected.outcome` oracle layers, and is executed by
    `packages/game-engine/src/test/fixtures/replayFixtures.test.ts` via
    `runFixture`.
- `packages/game-engine/src/game.ts` registers the play phase with a turn
  `onBegin` hook that already sets `G.currentStage = TURN_STAGES[0]!` and
  `G.turnEconomy = resetTurnEconomy()`.
- `packages/game-engine/src/types.ts` exports `interface LegendaryGameState`
  with `currentStage: TurnStage`.
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0
- `docs/ai/DECISIONS.md` and `docs/ai/ARCHITECTURE.md` exist

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §The Move Validation Contract` — read it. Moves
  validate args, check the stage gate, mutate `G` via helpers, return `void`,
  and **never throw**. The new guard is an additional early-return check that
  sits inside the existing validation order; it must not introduce a throw or a
  parallel error contract.
- `docs/ai/ARCHITECTURE.md §Phase & Turn Transitions` and
  `§The Turn Stage Cycle` — confirm that turn-scoped runtime state lives in `G`
  (e.g., `G.currentStage`, `G.turnEconomy`), reset by the play phase `onBegin`.
  The new field follows the identical lifecycle.
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — read it
  entirely. Note the deliberate split: `revealVillainCard` (wrapper, stage gate)
  vs `performVillainReveal` (shared body). The guard goes in the **wrapper**.
- `packages/game-engine/src/rules/schemeTwistResolvers.ts` — read the two
  `performVillainReveal(...)` call sites. They are the reason the guard must NOT
  live in the shared body. Do not modify this file.
- `packages/game-engine/src/game.ts` — read the play phase `onBegin` hook (it
  sets `G.currentStage` and `G.turnEconomy`). The reset line is added here.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — read the
  `baseState` literal. The initial `false` is added here, alongside the other
  turn-scoped initial values.
- `packages/game-engine/src/types.ts §interface LegendaryGameState` — read the
  `currentStage` field and its `// why:` block. The new field is declared
  immediately after it.
- `packages/game-engine/src/test/fixtures/hashGameState.ts` — read it. The
  canonical-JSON sha256 omits `undefined` but serializes any present value;
  adding an always-present `false` to the final state shifts the
  `finalStateHash` of any fixture that reaches a turn (this is the same
  behaviour-neutral hash shift WP-200 documented when it added `notableEvents`).
- `docs/ai/DECISIONS.md` — scan for D-15xx (turn loop), D-200xx (WP-200 hash
  re-pin precedent), and the villain-reveal D-entries (D-2403, D-18504) for
  context on the reveal pipeline. This packet reserves D-20901..D-20903.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable
  constraints: no DB queries in move functions; all moves deterministic;
  `ctx.random.*` is the only permitted randomness source.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations),
  Rule 6 (`// why:` comments), Rule 9 (`node:` prefix), Rule 13 (ESM only).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Persistence Boundaries
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new code uses `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- The once-per-turn guard lives in the `revealVillainCard` **wrapper only**.
  `performVillainReveal` (the shared body) MUST NOT read or write
  `G.villainRevealedThisTurn` — chained reveals from `schemeTwistResolvers.ts`
  depend on bypassing the guard.
- `G.villainRevealedThisTurn` is declared **optional** (`?: boolean`) on
  `LegendaryGameState`. Do NOT make it required — a required field would force
  every full-`LegendaryGameState` literal across the test suite (21 files) to be
  edited, which is out of scope. Absent is treated as `false`.
- The guard reads truthiness (`if (G.villainRevealedThisTurn) return;`) so an
  absent (`undefined`) field correctly permits the first reveal.
- The flag is set to `true` **after** `performVillainReveal(...)` returns in the
  wrapper — once the player's single start-of-turn reveal action is consumed.
- The flag is reset to `false` in the play phase turn `onBegin`, adjacent to the
  existing `G.currentStage` / `G.turnEconomy` resets. A missing reset would
  permanently block reveals from turn 2 onward.
- `packages/game-engine/src/rules/schemeTwistResolvers.ts` MUST NOT be modified.
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` `performVillainReveal`
  body (the draw→classify→route pipeline, steps 1–7) MUST NOT change behaviour.
- The `sentinel-core-doom-2p.replay.json` re-pin is a **single-field** change:
  only `expected.finalStateHash` may change. `expected.messages` and
  `expected.outcome` MUST remain byte-identical (proof the guard does not alter
  legitimate single-reveal behaviour). If either of those two layers changes,
  STOP — the guard is wrong.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human
  before proceeding — never guess or invent field names, type shapes, or file paths.

**Locked contract values (inline — do not re-derive):**
- **TurnStage values:** `'start'` | `'main'` | `'cleanup'`
- **Start stage:** `TURN_STAGES[0] === 'start'` — the only stage in which
  `revealVillainCard` proceeds.
- **New field name:** `villainRevealedThisTurn` (camelCase, boolean, optional).
  Do not abbreviate or rename.

---

## Debuggability & Diagnostics

- The guard's effect is deterministically reproducible: given identical setup,
  seed, and an ordered move list containing two consecutive
  `revealVillainCard` moves in a single `start` stage, the second is always a
  no-op and `G.villainRevealedThisTurn === true` after the first.
- The behaviour is externally observable via `G.villainRevealedThisTurn`
  (true/false) and via the City contents (unchanged after the blocked second
  reveal).
- Runtime state remains JSON-serializable after the new field is written
  (boolean only).
- No `G.messages` entry is required for the blocked reveal: a silently-ignored
  invalid move is the standard Move Validation Contract behaviour (the same
  pattern as the existing `G.currentStage !== 'start'` early return, which emits
  no message). Do not add a message for the guard early-return.

---

## Scope (In)

### A) Declare the runtime field — `src/types.ts` (modified)
- In `interface LegendaryGameState`, immediately after the `currentStage`
  field, declare:
  - `villainRevealedThisTurn?: boolean`
- Add a `// why:` comment block explaining: tracks whether the once-per-turn
  start-of-turn villain reveal has been consumed; optional so existing full-`G`
  literals need no edit (absent ⇒ not yet revealed); set by the
  `revealVillainCard` wrapper, reset each turn by the play phase `onBegin`.

### B) Initialize at setup — `src/setup/buildInitialGameState.ts` (modified)
- In the `baseState` object literal, add `villainRevealedThisTurn: false`
  adjacent to the `currentStage` / `turnEconomy` initializers.
- Add a `// why:` comment: the start-of-turn reveal has not occurred at setup
  time; the play phase `onBegin` resets this on every turn including turn 1.

### C) Reset each turn — `src/game.ts` (modified)
- In the play phase turn `onBegin` hook, after the existing
  `G.currentStage = TURN_STAGES[0]!` and `G.turnEconomy = resetTurnEconomy()`
  lines, add:
  - `G.villainRevealedThisTurn = false;`
- Add a `// why:` comment: the once-per-turn villain reveal allowance refreshes
  at the start of every player turn; without this reset the wrapper guard would
  permanently block reveals after turn 1.

### D) Add the wrapper guard — `src/villainDeck/villainDeck.reveal.ts` (modified)
- In `revealVillainCard`, after the existing stage gate
  (`if (G.currentStage !== 'start') return;`) and before the
  `performVillainReveal(...)` call, add:
  - `if (G.villainRevealedThisTurn) return;` with a `// why:` comment: the
    start-of-turn reveal is once per turn; scheme/card effects that chain extra
    reveals call `performVillainReveal` directly and intentionally bypass this
    guard.
- After `performVillainReveal(...)` returns, add:
  - `G.villainRevealedThisTurn = true;` with a `// why:` comment: the player's
    single start-of-turn reveal action is now consumed.
- `performVillainReveal` and its draw→classify→route pipeline (steps 1–7) are
  **unchanged**.

### E) Tests — `src/villainDeck/villainDeck.reveal.test.ts` (modified)
Add `node:test` cases (using the existing mock-G factory and `makeMockCtx`):
- **Second reveal in the same start stage is a no-op:** build G with ≥ 2
  classifiable villain cards in `villainDeck.deck`, `currentStage === 'start'`,
  `villainRevealedThisTurn` absent. Call `revealVillainCard` once → assert one
  card moved into the City and `G.villainRevealedThisTurn === true`. Capture the
  City and deck state, call `revealVillainCard` again → assert the City and
  `villainDeck.deck` are unchanged from the post-first-reveal snapshot.
- **An already-set flag blocks the reveal:** build G with `currentStage ===
  'start'`, `villainRevealedThisTurn === true`, a non-empty deck. Call
  `revealVillainCard` → assert `villainDeck.deck` is unchanged (no draw).
- **The shared body ignores the flag (chained-reveal path preserved):** build G
  with `villainRevealedThisTurn === true` and a non-empty deck. Call
  `performVillainReveal(G, context, DEFAULT_IMPLEMENTATION_MAP)` directly →
  assert a card was revealed (deck shrank by one / City or discard changed).
  Add a `// why:` comment: proves scheme-twist chained reveals are unaffected by
  the wrapper guard.
- **Serializability:** assert `JSON.stringify(G)` succeeds after a reveal
  (boolean field is JSON-safe).

### F) Re-pin the complete-game fixture — `src/test/fixtures/games/sentinel-core-doom-2p.replay.json` (modified)
- Run the fixture; the `finalStateHash` oracle now differs because
  `villainRevealedThisTurn` is serialized into the final state. Replace
  `expected.finalStateHash` with the new actual value reported by
  `replayFixtures.test.ts`.
- **Behaviour-neutrality is mandatory:** `expected.messages` and
  `expected.outcome` MUST remain byte-identical. The fixture reveals exactly
  once per turn (moves 3 and 10), so the guard changes nothing observable; only
  the serialized presence of the new field shifts the hash (same class of
  re-pin as WP-200's `notableEvents` addition). If `messages` or `outcome`
  changes, STOP and investigate — the guard is altering a legitimate reveal.

---

## Out of Scope

- No client / UI changes. The arena-client reveal-button affordance
  (`useTurnActions.canRevealVillain`, `TurnActionBar`) continues to gate on
  stage only; disabling the button after a reveal (which requires projecting the
  flag through `UIState`) is a **deferred follow-up WP**, not part of this
  packet. After this packet, a second client click is a silent engine no-op —
  the gameplay bug (multiple villains revealed) is fixed; the button merely
  appears active.
- No `UIState` projection of `villainRevealedThisTurn` — that belongs to the
  deferred client follow-up above.
- No modification to `performVillainReveal`'s pipeline behaviour (steps 1–7).
- No modification to `schemeTwistResolvers.ts` or any chained-reveal path.
- No new `G.messages` entry for the blocked reveal.
- No database, network, or filesystem access in any helper.
- Refactors, cleanups, or "while I'm here" improvements are out of scope unless
  explicitly listed in Scope (In).

---

## Files Expected to Change

- `packages/game-engine/src/types.ts` — **modified** — declare optional
  `villainRevealedThisTurn?: boolean` on `LegendaryGameState`.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  initialize `villainRevealedThisTurn: false` in `baseState`.
- `packages/game-engine/src/game.ts` — **modified** — reset
  `G.villainRevealedThisTurn = false` in the play phase turn `onBegin`.
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** —
  add the once-per-turn wrapper guard + set-flag-after-reveal.
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` —
  **modified** — add the four guard tests.
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
  — **modified** — re-pin `expected.finalStateHash` (behaviour-neutral).
- `docs/ai/STATUS.md` — **modified** — record the once-per-turn reveal fix.
- `docs/ai/DECISIONS.md` — **modified** — add D-20901..D-20903.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-212.

No other files may be modified. (9 files: 6 source/fixture + 3 governance. The
fixture re-pin pushes one over the ~8 guidance; it is mechanically forced by the
field addition and cannot be split off — same justification class as WP-200.)

---

## Acceptance Criteria

### A) Field declaration
- [ ] `interface LegendaryGameState` in `src/types.ts` declares
      `villainRevealedThisTurn?: boolean` (optional), immediately after
      `currentStage`, with a `// why:` comment.

### B) Setup initialization
- [ ] `baseState` in `buildInitialGameState.ts` sets
      `villainRevealedThisTurn: false` with a `// why:` comment.

### C) Turn reset
- [ ] The play phase turn `onBegin` in `game.ts` sets
      `G.villainRevealedThisTurn = false` with a `// why:` comment, adjacent to
      the `currentStage` / `turnEconomy` resets.

### D) Wrapper guard
- [ ] `revealVillainCard` returns early (no `performVillainReveal` call) when
      `G.villainRevealedThisTurn` is truthy, after the stage gate.
- [ ] `revealVillainCard` sets `G.villainRevealedThisTurn = true` after a
      completed `performVillainReveal(...)` call.
- [ ] Both new lines carry `// why:` comments.
- [ ] `performVillainReveal` contains no reference to `villainRevealedThisTurn`
      (confirmed with `Select-String`).
- [ ] No `throw` added to `villainDeck.reveal.ts` (confirmed with `Select-String`).

### E) Tests
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (all test files).
- [ ] A test proves a second `revealVillainCard` in the same start stage leaves
      the City and `villainDeck.deck` unchanged.
- [ ] A test proves `performVillainReveal` still reveals when
      `villainRevealedThisTurn === true` (chained-reveal path preserved).
- [ ] A test asserts `JSON.stringify(G)` succeeds after a reveal.
- [ ] The test file imports no `boardgame.io` and uses `makeMockCtx`.

### F) Fixture re-pin
- [ ] `sentinel-core-doom-2p.replay.json` `expected.finalStateHash` updated to
      the new actual value and `replayFixtures.test.ts` passes.
- [ ] `expected.messages` and `expected.outcome` in that fixture are
      byte-identical to their pre-change values (confirmed with `git diff` —
      only the `finalStateHash` line changes).

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed
      with `git diff --name-only`).
- [ ] `schemeTwistResolvers.ts` is unchanged (confirmed with `git diff`).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all tests
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing
#   (includes the four new reveal guard tests and the re-pinned fixture)

# Step 3 — confirm the shared body never references the flag
Select-String -Path "packages\game-engine\src\villainDeck\villainDeck.reveal.ts" -Pattern "villainRevealedThisTurn"
# Expected: matches ONLY inside revealVillainCard (the wrapper) — two lines:
#   the `if (G.villainRevealedThisTurn) return;` guard and the
#   `G.villainRevealedThisTurn = true;` set. No match inside performVillainReveal.

# Step 4 — confirm no throw was added to the move file
Select-String -Path "packages\game-engine\src\villainDeck\villainDeck.reveal.ts" -Pattern "throw "
# Expected: no output

# Step 5 — confirm the chained-reveal resolver was not touched
git diff --name-only -- packages/game-engine/src/rules/schemeTwistResolvers.ts
# Expected: no output

# Step 6 — confirm the fixture changed ONLY on the finalStateHash line
git diff -- packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json
# Expected: exactly one changed line — the finalStateHash value.
#   No change to expected.messages or expected.outcome.

# Step 7 — confirm no files outside scope were changed
git diff --name-only
# Expected: only the 9 files in ## Files Expected to Change
```

---

## Vision Alignment

**Vision clauses touched:** §3 (determinism / engine authority), §8 (RNG
sourcing — touched only insofar as the guard sits in the reveal move that
consumes `ctx.random` on reshuffle; the guard adds no randomness), §22 (replay
fidelity — a pinned replay-fixture `finalStateHash` is re-pinned).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.`
The guard makes the engine enforce an existing tabletop rule the engine
previously failed to enforce; it strengthens engine-owns-truth (§3) rather than
weakening it.

**Non-Goal proximity check:** None of NG-1..7 are crossed. This is a
rules-correctness fix with no user-facing, paid, persuasive, or competitive
surface; NG-1 (no pay-to-win) is untouched.

**Determinism preservation:** The change is deterministic and replay-faithful.
The new field is a pure function of the move history (set on reveal, reset on
turn begin). The `sentinel-core-doom-2p` fixture re-pin is behaviour-neutral:
the fixture reveals exactly once per turn, so the message-log and outcome oracle
layers are byte-identical; only the serialized presence of
`villainRevealedThisTurn` shifts the `finalStateHash` (the same class of
behaviour-neutral re-pin WP-200 applied when it added `notableEvents`).

## Funding Surface Gate

N/A — engine turn-loop rules-correctness fix. No global-nav / registry-viewer /
profile funding affordances are touched, no user-visible funding copy is added
or changed, and no funding-channel integration is involved.

## API Catalog

N/A — engine-only change. No HTTP endpoint on `apps/server` is added, modified,
removed, or status-changed, and no `apps/server/src/**` library function
recorded in the catalog is touched.

---

## Definition of Done

> Claude Code must execute every command in `## Verification Steps` before
> checking any item below. Reading the code is not sufficient — run the commands.

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (all test files)
- [ ] `villainRevealedThisTurn` appears in `villainDeck.reveal.ts` only inside
      the `revealVillainCard` wrapper (confirmed with `Select-String`)
- [ ] No `throw` added to `villainDeck.reveal.ts` (confirmed with `Select-String`)
- [ ] `schemeTwistResolvers.ts` unchanged (confirmed with `git diff`)
- [ ] `sentinel-core-doom-2p.replay.json` changed only on the `finalStateHash`
      line (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified (confirmed
      with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — records that the engine now enforces
      once-per-turn villain reveal; a second player-initiated reveal is a no-op
- [ ] `docs/ai/DECISIONS.md` updated — D-20901 (once-per-turn reveal guard via
      optional `G.villainRevealedThisTurn`, wrapper-only), D-20902 (optional
      field chosen over required to avoid churning 21 full-`G` literals;
      absent ⇒ false), D-20903 (behaviour-neutral `finalStateHash` re-pin of the
      complete-game fixture, WP-200 precedent)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-212 checked off with today's date
