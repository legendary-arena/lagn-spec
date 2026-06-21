# WP-266 — Simulation onBegin Parity (Auto-Draw + Reveal Gate; WP-265 Unblocker)

**Status:** Draft — pending review. Pre-flight READY; copilot CONFIRM; lint 21/21 (§Pre-Flight & Copilot Verdicts).
**Primary Layer:** Game Engine (`packages/game-engine/src/simulation/**` + the replay-fixture harness `packages/game-engine/src/test/fixtures/runFixture.ts`). Single layer, single package. The CI freshness artifact it regenerates (`docs/ai/coverage/runtime-observed-hollows.json` + its generator `scripts/runtime-observed-hollows.mjs`) is a forced consistency byproduct (see §Context), not a second layer.
**User-Visible Surface:** `none — infrastructure`. This is an observation-only harness fix; a player cannot perceive it. The payoff is named in §User-Visible Impact. D-24026 live-verification is **N/A** (STATUS records "No user-observable change — infrastructure only").
**Hard Dependencies:** WP-193 ✅ (`runPerTurnLoop` in `simulation.runner.ts`). WP-194 ✅ (`sweepSetupMatrix`). WP-195 ✅ (the PAR aggregator `par.aggregator.ts` per-game loop). WP-212 ✅ (the once-per-turn `villainRevealedThisTurn` guard + reset, mirrored here). WP-236 ✅ (the play-phase `onBegin` auto-draw this mirrors into the harnesses). WP-263 ✅ (the `cell.hollowEffects` sweep projection the scaffold reads). WP-259 ✅ (`runtime-observed-hollows.mjs` + the committed artifact this regenerates; the per-PR `sim:runtime-observed:check` gate).
**Related (not a hard dep):** WP-264 ✅ (`maxTurns`) — already on `main`; the bounded sweep WP-265 will use. WP-265 (Draft) — the downstream consumer this unblocks; it adds no engine code.

> **Executor lock:** WP-266 makes the three non-framework per-turn loops mirror the play-phase `onBegin` they currently skip — reset the two once-per-turn flags and auto-draw the active player's hand to `HAND_SIZE` — by extracting ONE shared pure helper (`applyOnBeginParity`) and routing the simulation runner, the PAR aggregator, and the replay-fixture harness through it; plus a one-shot reveal gate in `ai.legalMoves.ts`. Do **not** add a new move/rule/phase, mutate any NEW field in `G`, draw any new randomness source, fire rule hooks (`onTurnStart` stays deferred — D-0205), or change any result shape / export. Game-determinism is load-bearing: the replay suite (`replayFixtures.test.ts`) is the gate and MUST stay green; `finalStateHash` is unchanged. The committed `runtime-observed-hollows.json` MUST be regenerated (the random policy now draws + plays) and its now-false "zero-state / passive" prose corrected — that is the only reason its generator script is touched.

---

## Goal

After this session, the engine's three observation-only per-turn loops — the simulation runner (`runPerTurnLoop`), the PAR aggregator (`simulateOneGame` in `par.aggregator.ts`), and the replay-fixture harness (`rotateToNextTurn` in `runFixture.ts`) — all mirror the play-phase `onBegin` lifecycle at every turn start by calling one shared pure helper, `applyOnBeginParity`, which resets `villainRevealedThisTurn` + `hasDrawnThisTurn` and auto-draws the active player's hand up to `HAND_SIZE`. Paired with a one-shot reveal gate in `getLegalMoves` (`revealVillainCard` is offered only while `!villainRevealedThisTurn`), this makes a bot policy actually progress past turn 1 and play hero cards — so declared-but-unhandled hero abilities finally execute and surface real `G.diagnostics.hollowEffects` records in a simulated game. Today the simulation runner and PAR aggregator never run `onBegin`, so the bot's hand is empty forever, `playCard` is never legal, and no hero effect (hollow or otherwise) can fire — the entire balance-sim framework has been running hand-empty degenerate games since WP-236 moved the opening draw into `onBegin`. This packet is the **engine unblocker for WP-265** (the real-signal runtime-observed-hollows cron), which cannot surface a single hero hollow until the sim can drive a competent game to completion.

## Assumes

- **WP-193 ✅ on `main`** — `runPerTurnLoop(gameState, policies, numPlayers, gameIndex, nextRandom, onMoveDispatched?, maxTurns?)` in `packages/game-engine/src/simulation/simulation.runner.ts` is the single simulation per-turn loop; its turn-transition block resets `currentStage` + `turnEconomy` only (NOT the flags, NOT a draw). `simulateOneGame`, `simulateOneGameAndCaptureMoves`, and `runSimulation` all drive it. The file exposes a local `shuffleWithPrng(deck, nextRandom)` Fisher-Yates helper used to build the move-context `random.Shuffle`.
- **WP-195 ✅ on `main`** — `simulateOneGame(...)` in `packages/game-engine/src/simulation/par.aggregator.ts` is the PAR per-game loop; same turn-transition shape, same local `shuffleWithPrng`. It already has a `MAX_MOVES_PER_GAME` move-level stall trap (so it would not infinite-loop, but it still runs hand-empty).
- **WP-212 ✅ on `main`** — `villainRevealedThisTurn` is the once-per-turn reveal allowance; the move-level guard at `villainDeck.reveal.ts` early-returns when it is set and sets it true after the attempt. `runFixture.ts` already resets it at each turn start (the WP-212 harness-mirror).
- **WP-236 ✅ on `main`** — the play-phase `onBegin` (`game.ts`) resets `villainRevealedThisTurn` + `hasDrawnThisTurn` and auto-draws to `HAND_SIZE` via `drawCardsIntoHand` from `moves/drawCards.logic.js`; `buildInitialGameState` defers the opening draw to `onBegin`. `runFixture.ts:rotateToNextTurn` already mirrors BOTH (the WP-236 harness-mirror) — it is the third, pre-existing inline copy this WP unifies.
- **WP-263 ✅ on `main`** — `sweepSetupMatrix` surfaces each finished game's hollow diagnostics as `cell.hollowEffects` / `cell.hollowEffectsDropped`; the WP-266 scaffold reads these.
- **WP-259 ✅ on `main`** — `scripts/runtime-observed-hollows.mjs` drives the sweep with the random policy and commits `docs/ai/coverage/runtime-observed-hollows.json` (a RECORDED ZERO-STATE); the per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` CI job diffs a fresh regen against it.
- **`drawCardsIntoHand(playerZones, count, shuffleContext)` + `HAND_SIZE`** are exported from `packages/game-engine/src/moves/drawCards.logic.js`; `ShuffleProvider` (`{ random: { Shuffle } }`) is exported from `packages/game-engine/src/setup/shuffle.js`. These are the single sanctioned draw primitive + shuffle-context shape; WP-266 adds none of its own.
- **Baseline:** drafted against `origin/main` @ `78d278d5`. The executor must re-baseline against current `origin/main` at execution time (`git fetch origin main --prune && git rev-parse origin/main`).

## Context (Read First)

- `packages/game-engine/src/game.ts` — the play-phase `onBegin` hook (the reset-both-flags + auto-draw-to-`HAND_SIZE` sequence this WP mirrors). `onTurnStart` rule-hook firing inside `onBegin` is intentionally NOT mirrored (the three harnesses are observation-only; D-0205).
- `packages/game-engine/src/simulation/simulation.runner.ts` — `runPerTurnLoop` (the turn-1 entry before the loop + the `if (endTurnFlag.triggered)` transition block); `shuffleWithPrng`. File-header invariants: no `boardgame.io`, no `@legendary-arena/registry`, no wall-clock/randomness/IO (the full forbidden-surface list is D-3701).
- `packages/game-engine/src/simulation/par.aggregator.ts` — `simulateOneGame` (its turn-1 entry + transition block); `shuffleWithPrng`. Same header invariants.
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — `getLegalMoves`; item 5 is the unconditional `revealVillainCard` push at `stage === 'start'` (the loop's root cause: a policy scoring reveal highly re-picks it forever).
- `packages/game-engine/src/test/fixtures/runFixture.ts` — `rotateToNextTurn` (the pre-existing inline onBegin-mirror this WP replaces with the shared helper); `shuffleWithPrng`. The replay suite `replayFixtures.test.ts` is the `finalStateHash` / replay-determinism gate.
- `packages/game-engine/src/moves/drawCards.logic.ts` — `HAND_SIZE`, `drawCardsIntoHand`. `packages/game-engine/src/setup/shuffle.ts` — `ShuffleProvider`.
- `scripts/runtime-observed-hollows.mjs` + `docs/ai/coverage/runtime-observed-hollows.json` (WP-259) — the freshness gate the engine change perturbs; see §Context note below.
- `docs/ai/DECISIONS.md` — D-0205 (observation-only harnesses defer rule hooks), D-19303 (seat-seed PRNG parity), D-24034 (hollow channel is runtime-only), D-24035 (runtime-observed CI-affordability), D-24043 (this WP).
- **Why now:** WP-265 (the real-signal cron) is blocked. Its premise — "WP-264's `maxTurns` lets a competent game terminate affordably" — was proven FALSE at execution: the competent policy infinite-loops on turn 1 (`revealVillainCard` re-offered unconditionally), and even past that the bot hand is empty forever (no `onBegin` draw), so `playCard` is never legal and zero hero hollows can surface. The fix is two coupled corrections in the engine harnesses: gate the reveal one-shot, and mirror `onBegin`'s auto-draw. Splitting on the layer boundary (this is the **engine** half; WP-265 is the tooling/cron half) keeps each packet focused.
- **§Context note — the forced artifact byproduct:** the engine change alters what the *random* policy does in `runtime-observed-hollows.mjs` (it now draws a hand and can pick `playCard`), so the committed RECORDED-ZERO-STATE artifact no longer matches a fresh regen and `sim:runtime-observed:check` (a per-PR CI step) turns RED. WP-266 therefore MUST regenerate `runtime-observed-hollows.json` and correct the now-false "zero-state / passive random policy" sentence in the generator's `matrixDescription`, in the same PR, to keep its own CI green. This is a consistency byproduct of the engine change — not a redesign of the WP-259 harness (the policy stays `random`; switching to the competent cron remains WP-265's job).

## Non-Negotiable Constraints

**Engine-wide:** Full file contents for every new or modified file — no diffs, no snippets. ESM only, Node v22+. Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`. `node:test`; `.test.ts` only. `pnpm`, not `npm`; `pwsh`, not `bash`. The three simulation/harness files keep their header invariants verbatim (the forbidden-surface list is D-3701 — this change adds none of them).

**One shared helper (the "abstract on the third copy" rule):** the onBegin-mirror logic exists once today (inline in `runFixture.rotateToNextTurn`) and WOULD be a second and third copy in the runner + aggregator. Instead, extract ONE pure helper `applyOnBeginParity(gameState, playerId, shuffleProvider)` into `packages/game-engine/src/simulation/onBeginParity.ts` and have all three call it. Do NOT ship duplicated inline copies (that is a §16.1 violation at exactly the third use). The helper accepts a `ShuffleProvider` so it needs no Fisher-Yates of its own; each caller passes `{ random: { Shuffle: <T>(deck) => shuffleWithPrng(deck, nextRandom) } }` built from its existing local `shuffleWithPrng` + `nextRandom`. Consolidating `shuffleWithPrng` itself is OUT of scope.

**Mirror onBegin exactly, no more:** the helper resets `villainRevealedThisTurn = false`, then `hasDrawnThisTurn = false`, then draws `Math.max(0, HAND_SIZE - hand.length)` cards via `drawCardsIntoHand`, then sets `hasDrawnThisTurn = true` — the same sequence `onBegin` and the existing `runFixture` inline copy perform. It does NOT fire `onTurnStart` rule hooks (the three harnesses are observation-only — D-0205), does NOT reset `currentStage` / `turnEconomy` (the callers already do that), and adds no new `G` field.

**Call at every turn start, including turn 1:** `onBegin` runs at the start of every turn. The runner and aggregator must call the helper ONCE before their `while` loop (turn 1, whose opening draw `buildInitialGameState` defers) AND inside their `if (endTurnFlag.triggered)` transition block for the incoming player (after `currentPlayer` is advanced and stage/economy reset). `runFixture.rotateToNextTurn` already runs once per turn boundary — it simply swaps its inline block for the helper call (turn-1 in the fixture harness is handled by its existing setup path; do not add a redundant call).

**Reveal gate (one-shot):** `ai.legalMoves.ts` item 5 changes from `if (stage === 'start')` to `if (stage === 'start' && !gameState.villainRevealedThisTurn)`. This mirrors the move-level guard (`villainDeck.reveal.ts`) so a policy cannot re-pick a guaranteed no-op reveal every move-step. The legal-move ordering is otherwise unchanged.

**Determinism (load-bearing) — game determinism preserved, sim trajectories deliberately change:** the helper draws from the caller's existing seeded PRNG stream (`nextRandom` via `shuffleWithPrng`), introducing NO new randomness source. The replay harness (`runFixture`) routed through the shared helper MUST be byte-behavior-identical to its current inline copy — the replay suite (`replayFixtures.test.ts`, the `finalStateHash` gate) is the proof and MUST stay green. The simulation runner + PAR aggregator DO now produce different (longer, card-playing) games — that is the entire point — but every assertion in the engine suite is structural (shape, finiteness, drift-guards, capture↔replay agreement), not a pinned seeded outcome, so the suite stays green (scaffold-confirmed; see §Pre-Flight). No `finalStateHash` change, no new sentinel, no new hash fixture.

**No result-shape / export change:** `CapturedGameResult`, `SweepCellResult`, `CapturedOutcomeSummary`, `SimulationResult`, and `LegendaryGameState` are unchanged — the helper mutates only existing fields (`villainRevealedThisTurn`, `hasDrawnThisTurn`, the active player's `hand`/`deck`/`discard`). `packages/game-engine/src/index.ts` is byte-unchanged (the helper is internal to the simulation/harness files; it is NOT a new public export).

**Session protocol:** stop and ask only on a boundary event — a needed result-shape change, a layer crossing, a new contract file, or any scope-classification ambiguity. Ordinary threading details are decided in-line.

## Scope (In)

### A) The shared helper
- `packages/game-engine/src/simulation/onBeginParity.ts` — **new**: a pure module exporting `applyOnBeginParity(gameState: LegendaryGameState, playerId: string, shuffleProvider: ShuffleProvider): void`. Resets both once-per-turn flags and auto-draws to `HAND_SIZE` via `drawCardsIntoHand`. No `boardgame.io` import, no IO, no randomness of its own. JSDoc documents the onBegin-mirror intent and the D-0205 hook-deferral.

### B) Route the three loops through it
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified**: import `applyOnBeginParity`; call it once before the `while` loop (turn 1) and once in the `if (endTurnFlag.triggered)` transition block (after `currentPlayer` advance + stage/economy reset). No local helper.
- `packages/game-engine/src/simulation/par.aggregator.ts` — **modified**: same two call sites in `simulateOneGame`.
- `packages/game-engine/src/test/fixtures/runFixture.ts` — **modified**: `rotateToNextTurn` swaps its inline flag-reset + auto-draw block (the WP-212 + WP-236 mirror) for one `applyOnBeginParity` call; drop the now-unused `HAND_SIZE` / `drawCardsIntoHand` import (keep `shuffleWithPrng` — still used by `buildMoveContext`); add the `applyOnBeginParity` import.

### C) The reveal gate
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — **modified**: item 5 gains `&& !gameState.villainRevealedThisTurn`.

### D) Tests
- `packages/game-engine/src/simulation/onBeginParity.test.ts` — **new**: the helper resets `villainRevealedThisTurn` → false and leaves `hasDrawnThisTurn` → true; draws the hand up to `HAND_SIZE`; draws fewer than the gap (and never throws) when deck + discard are exhausted; is deterministic under a fixed `ShuffleProvider`. `node:test`, mock registry via `makeMockCtx` + `buildInitialGameState`, no `boardgame.io` import.
- `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — **modified**: add the reveal-gate coverage that is absent today — `revealVillainCard` IS offered at `stage === 'start'` when `villainRevealedThisTurn` is false, and is NOT offered when it is true.

### E) The forced freshness-artifact regen (consistency byproduct — see §Context note)
- `scripts/runtime-observed-hollows.mjs` — **modified**: correct only the now-false editorial sentence in `matrixDescription` (the random policy is no longer passive / zero-state post-WP-266 — it draws + plays and surfaces hollows). The policy stays `random`; no harness logic change.
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified**: regenerated via `pnpm sim:runtime-observed` so `sim:runtime-observed:check` is green on this PR.

## Out of Scope
- **WP-265 (the real-signal cron, the competent-policy `--deep` sweep, retiring the per-PR `:check`, the weekly refresh workflow)** — the downstream consumer; it adds no engine code. WP-266 leaves the harness policy as `random`.
- **Consolidating the three `shuffleWithPrng` copies** (runner / aggregator / runFixture) into one shared helper — a separate dedup; WP-266 reuses each file's existing copy and does not touch them.
- **Firing `onTurnStart` (or any) rule hooks in the harness loops** — the harnesses stay observation-only (D-0205); the helper deliberately does not mirror that part of `onBegin`.
- **A within-turn move-step cap in `runPerTurnLoop`** — the reveal gate removes the only known turn-1 spin, so no move-step cap is added (the aggregator's existing `MAX_MOVES_PER_GAME` is untouched).
- **Any result-shape / export change, new move/rule/phase, persistence, registry read, `data/cards/**` change, or a new `index.ts` export.**

## Files Expected to Change
- `packages/game-engine/src/simulation/onBeginParity.ts` — **new** — the shared `applyOnBeginParity` helper.
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — import + two call sites in `runPerTurnLoop`.
- `packages/game-engine/src/simulation/par.aggregator.ts` — **modified** — import + two call sites in `simulateOneGame`.
- `packages/game-engine/src/test/fixtures/runFixture.ts` — **modified** — route `rotateToNextTurn` through the helper; swap the now-unused import.
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — **modified** — one-shot reveal gate (item 5).
- `packages/game-engine/src/simulation/onBeginParity.test.ts` — **new** — helper unit tests.
- `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — **modified** — reveal-gate coverage.
- `scripts/runtime-observed-hollows.mjs` — **modified** — correct the now-false zero-state prose in `matrixDescription`.
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified** — regenerated (the random policy now surfaces hollows).

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-266 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-297 Done), `docs/ai/DECISIONS.md` (D-24043 → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-266 node + `node scripts/roadmap-counts.mjs --check`).

No other files modified. `packages/game-engine/src/index.ts` byte-unchanged (no new export); `data/cards/**` byte-unchanged.

## Contract

- `applyOnBeginParity(gameState: LegendaryGameState, playerId: string, shuffleProvider: ShuffleProvider): void` — resets `gameState.villainRevealedThisTurn = false` and `gameState.hasDrawnThisTurn = false`, then (when the player's zones exist) draws `Math.max(0, HAND_SIZE - hand.length)` cards via `drawCardsIntoHand(zones, count, shuffleProvider)` and sets `gameState.hasDrawnThisTurn = true`. Mutates the passed `gameState` in place. Mirrors the play-phase `onBegin` reset+draw and is byte-behavior-identical to the inline copy `runFixture.rotateToNextTurn` performs today. It does NOT fire rule hooks, reset stage/economy, or add any `G` field.
- **Reveal gate:** `getLegalMoves` offers `revealVillainCard` iff `stage === 'start' && !gameState.villainRevealedThisTurn`. Legal-move ordering is otherwise byte-unchanged.
- **Game-determinism invariant:** the replay path (`runFixture`) is byte-behavior-identical (replay suite green; `finalStateHash` unchanged). The helper draws only from the caller-supplied seeded `ShuffleProvider`; no new randomness, clock, or IO.
- **No result-shape / export change:** `CapturedGameResult` / `SweepCellResult` / `CapturedOutcomeSummary` / `SimulationResult` / `LegendaryGameState` unchanged; `index.ts` byte-unchanged.

## Acceptance Criteria
- [ ] `applyOnBeginParity` exists in `simulation/onBeginParity.ts` as a pure helper (no `boardgame.io` import, no IO, no own randomness) and is the single implementation called by `simulation.runner.ts`, `par.aggregator.ts`, and `runFixture.ts` — no duplicated inline onBegin-mirror copy remains.
- [ ] `runPerTurnLoop` and `par.aggregator`'s `simulateOneGame` each call the helper once before their loop (turn 1) and once in their `endTurnFlag.triggered` transition block; `runFixture.rotateToNextTurn` calls it in place of its former inline block.
- [ ] `getLegalMoves` offers `revealVillainCard` only when `stage === 'start' && !villainRevealedThisTurn`; the reveal-gate test asserts both the offered and the suppressed case.
- [ ] `runFixture` no longer imports `HAND_SIZE` / `drawCardsIntoHand` (now unused) and the engine builds with no unused-import error; `shuffleWithPrng` is retained.
- [ ] `pnpm --filter @legendary-arena/game-engine test` passes with 0 failures, including `replayFixtures.test.ts` (the `finalStateHash` / replay-determinism gate proves the `runFixture` routing is behavior-identical) and the existing `simulation` / `par.aggregator` / `simulation.captureMoves` / `sweep.runner` tests (no seeded-outcome re-baseline needed).
- [ ] `onBeginParity.test.ts` asserts: both flags end in the correct state, the hand fills to `HAND_SIZE`, an exhausted deck+discard draws fewer without throwing, and the result is deterministic under a fixed `ShuffleProvider`.
- [ ] Determinism: no new randomness / clock / IO / `index.ts` export / new `G` field; `finalStateHash` unchanged (replay-fixture-guarded; no new sentinel).
- [ ] `docs/ai/coverage/runtime-observed-hollows.json` is regenerated and `node scripts/runtime-observed-hollows.mjs --check` exits 0; its `matrixDescription` no longer claims the random policy is passive / surfaces no hollows.
- [ ] `node scripts/hero-effect-coverage.mjs --check` and `node scripts/hero-mechanic-ledger.mjs --check` stay green (the parser/hook + ledger probes are not perturbed — WP-266 touches neither the parser nor the hook shape).
- [ ] `git diff --name-only` shows only the nine Files Expected to Change + the listed governance files; `data/cards/**` and `index.ts` byte-unchanged.

## Verification Steps

```pwsh
pnpm -r build                                                       # exits 0 (engine build is its typecheck; no unused-import error)
pnpm --filter @legendary-arena/game-engine test                     # all pass, 0 fail (incl. replayFixtures.test.ts = the finalStateHash guard)
node scripts/runtime-observed-hollows.mjs --check                   # exits 0 (artifact regenerated this PR)
node scripts/hero-effect-coverage.mjs --check                       # exits 0 (parser/hook probe unperturbed)
node scripts/hero-mechanic-ledger.mjs --check                       # exits 0 (ledger unperturbed)
git diff --name-only -- data/cards/ packages/game-engine/src/index.ts   # empty
git diff --name-only                                                # only the 9 files + the listed governance files
node scripts/roadmap-counts.mjs --check                             # exits 0 (WP-266 node present)
```

`User-Visible Surface = none — infrastructure`, so there is **no** D-24026 live-on-surface gate — STATUS.md records "No user-observable change — infrastructure only."

## User-Visible Impact

`none — infrastructure`. No player-facing or operator-facing surface is added or redesigned. **Payoff:** this unblocks WP-265 (the real-signal runtime-observed-hollows cron) — with the sim finally able to drive a competent game to completion and play hero cards, declared-but-unhandled abilities surface as real `hollowEffects`, which the dashboard `/coverage` overlay and the architect lane (WP-260) consume to drive the effect-implementation backlog. The regenerated `runtime-observed-hollows.json` shifting off the zero-state is the committed empirical proof that the sim now plays cards.

## Vision Alignment

**Vision clauses touched:** §20–§26 (scoring / PAR / **simulation** — the balance-sim harnesses), §18/§22/§24 (**replay** — `runFixture` is routed through the shared helper), §3/§8 (**determinism / RNG sourcing**). **Conflict assertion:** `No conflict: this WP preserves all touched clauses.` **Determinism preservation:** the change is deterministic and replay-faithful (Vision §22) — the helper draws only from the caller's existing seeded PRNG stream (no new randomness source, no clock, no IO); the replay path is byte-behavior-identical and `finalStateHash` is unchanged (replay-fixture-guarded). The simulation/PAR trajectories deliberately change (the bot now plays cards), but each remains deterministic per seed, and no gameplay rule, move, phase, or persisted state is altered. **Non-Goal proximity:** infrastructure for the diagnostics sim; not paid, persuasive, or competitive — none of NG-1..7 crossed.

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1 structure:** PASS — all required sections present (Goal, Assumes, Context, Scope In/Out, Files, Non-Negotiable Constraints, Acceptance, Verification, Definition of Done); `## Out of Scope` lists 5 excluded items.
- **§2 constraints:** PASS — engine-wide block (full files, ESM, Node v22+, references `00.6-code-style.md`) + packet-specific (one shared helper, mirror-onBegin-no-more, call-at-every-turn-start, reveal gate, determinism, no result-shape change) + session protocol (boundary-based stops) + locked contract values.
- **§3 Assumes:** PASS — WP-193/195/212/236/263/259 with the exact exports/shapes; `drawCardsIntoHand`/`HAND_SIZE`/`ShuffleProvider` sources; baseline `78d278d5`.
- **§4 Context:** PASS — specific files + sections; DECISIONS entries (D-0205, D-19303, D-24034, D-24035, D-24043) cited by ID.
- **§5 Files:** PASS — 9 files each marked new/modified with a one-line change; no ambiguous "update this section" language. Count note: 9 is at the ~8 split-guidance threshold but is one coherent change — 5 source + 2 tests in a single engine package, plus 2 files (script prose + artifact) that are a FORCED CI-consistency byproduct of the engine change (splitting them out would land WP-266 with red CI). Single layer; no split warranted.
- **§6 naming:** PASS — canonical names (`villainRevealedThisTurn`, `hasDrawnThisTurn`, `HAND_SIZE`, `drawCardsIntoHand`, `ShuffleProvider`, `runPerTurnLoop`, `sweepSetupMatrix`, `getLegalMoves`) match WP-193/195/212/236; no `ext_id`/setup-payload fields touched.
- **§7 deps:** PASS — no new npm dependency; no forbidden package.
- **§8 architecture:** PASS — single Game Engine layer; helper is a pure intra-package module; no upward/sideways import; no `boardgame.io`/registry/IO/randomness added (D-3701 surfaces untouched); `G` stays JSON-serializable (no new field, no function/Map/Set).
- **§9 Windows:** PASS — `pnpm` + `pwsh`. **§10 env / §11 auth:** N/A — no env var, no authentication surface.
- **§12 test quality:** PASS — `node:test` + `node:assert`; `makeMockCtx` (deterministic reversing shuffle) + `buildInitialGameState`; no `boardgame.io` import; no network/DB; the new helper test is deterministic under a fixed `ShuffleProvider`.
- **§13 commands:** PASS — exact `pnpm` / `node scripts/*` commands with expected output + empty-diff guards.
- **§14 acceptance:** PASS — 9 binary, observable, file/function-specific criteria aligned to the deliverables.
- **§15 DoD:** PASS — STATUS.md / DECISIONS.md / WORK_INDEX.md updates + scope-boundary check; `**User-Visible Surface:** none — infrastructure` declared with `## User-Visible Impact` (payoff named) → DoD requires STATUS "No user-observable change — infrastructure only"; no live-on-surface item (correctly, per §15.1 infrastructure path).
- **§16 code style:** PASS — §16.1 the shared helper is created at exactly the THIRD use (runFixture inline + runner + aggregator), which the rule sanctions (FAIL is "fewer than 3"); full English words; small single-purpose helper with JSDoc; `// why:` on every onBegin-mirror call site + inside the helper; no `.reduce()`, no nested ternary, no dynamic known-key access.
- **§17 Vision:** Triggered (simulation + replay + determinism/RNG) → `## Vision Alignment` present with clause numbers + the determinism-preservation line. No conflict.
- **§18 prose-vs-grep:** PASS — the Verification Steps greps target paths/names, not forbidden tokens; forbidden-surface prose cites D-3701 by ID rather than enumerating tokens verbatim.
- **§19 bridge-vs-HEAD:** N/A — no repo-state-summarizing artifact (no session-context bridge / STATUS snapshot authored here; the SPEC commit reconciles indices at landing).
- **§20 funding:** N/A — engine/harness infrastructure; no funding navigation, registry-viewer, profile, tournament-channel, or user-visible donate copy surface is touched.
- **§21 API catalog:** N/A — no HTTP endpoint added/modified/removed in `apps/server`, and no `apps/server/src/**` `Library-only` function added or modified; this is engine + tooling only.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (baseline `78d278d5`; re-baseline against current `origin/main` at execution).** **Class:** Infrastructure & Verification (the simulation + replay harnesses; no gameplay move/rule/phase, no persisted-state mutation). **Deps on `main`:** WP-193 (`runPerTurnLoop`), WP-195 (`par.aggregator` loop), WP-212 (`villainRevealedThisTurn`), WP-236 (`onBegin` auto-draw + `drawCardsIntoHand`), WP-263 (`cell.hollowEffects`), WP-259 (`runtime-observed-hollows.mjs` + the `:check` gate) — all verified present. **Empirical Scaffold (the load-bearing evidence, run twice off `78d278d5`):** the actual extraction shape (shared helper + all three callers routed + reveal gate) was prototyped and the full engine suite run: **1454/1454 pass, 0 fail, including `replayFixtures.test.ts`** (replay determinism preserved under the `runFixture` routing — the one real risk, cleared); a competent-policy sweep over the wwhk board surfaced **≥1 hero hollow** (`outwit` on `wwhk/bruce-banner/solve-the-impossible`) with the game terminating in ~17 ms; `sim:runtime-observed:check` turned RED (the artifact re-baseline this WP performs) while `hero-effect-coverage` + `hero-mechanic-ledger` stayed green. So the "0 seeded-test re-baseline" and "replay-faithful" claims are OBSERVED, not reasoned (the WP-254 trap is avoided). **Recurrence traps:** no app-package typecheck (engine build is its typecheck); no result-shape change (drift guards untouched); no barrel export (`index.ts` unchanged); the new client-importable-type trap is N/A (the helper is engine-internal). **Risks resolved + locked.**
- **Copilot (`01.7`): PASS / CONFIRM.** **Cat-1 (Boundaries):** single engine layer; pure intra-package helper; no new cross-package import. **Cat-2 (Determinism):** draws only from the caller's seeded PRNG; replay byte-behavior-identical (suite green); `finalStateHash` unchanged; sim-trajectory changes are deterministic per seed and intended. **Cat-3 (Mutation):** the helper mutates only existing fields via the sanctioned `drawCardsIntoHand`; no new `G` field; `G` stays serializable. **Cat-4 (Type Safety):** typed `ShuffleProvider` param; no widened/exported result type. **Cat-6 (Testing):** the absent reveal-gate coverage is added; the helper has a dedicated deterministic unit test; the artifact regen is the committed integration proof. **Cat-7 (Scope):** 9 files, one coherent change; the artifact/script byproduct is justified (CI consistency) not scope creep. **Cat-8 (Extensibility):** unblocks WP-265 with no other consumer perturbed. No RISK rises to a scope change → CONFIRM.

> **Drafting status (per 01.0a):** WP + EC-297 written; pre-flight READY; copilot CONFIRM; lint 21/21; D-24043 reserved; session prompt written. **Sequencing:** WP-266 must land before WP-265 executes (WP-265's competent sweep + cron depend on this onBegin parity); WP-264 (`maxTurns`) is already on `main`.

## Definition of Done

### Pre-merge Done (no post-deploy split — `User-Visible Surface = none — infrastructure`)
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 (the `finalStateHash` / replay gate)
- [ ] `applyOnBeginParity` is the single shared helper; all three loops route through it; no duplicated inline onBegin-mirror remains; reveal gate in place
- [ ] `node scripts/runtime-observed-hollows.mjs --check` 0 (artifact regenerated; prose corrected); `hero-effect-coverage --check` + `hero-mechanic-ledger --check` 0
- [ ] No new randomness / clock / IO / `G` field / `index.ts` export; `finalStateHash` unchanged (no new sentinel); `data/cards/**` + `index.ts` byte-unchanged
- [ ] Only the nine Files Expected to Change plus the listed governance files are modified (nothing else)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-266 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-297 Done; `docs/05-ROADMAP-MINDMAP.md` WP-266 node added; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/DECISIONS.md` D-24043 flipped to Active
- [ ] `docs/ai/STATUS.md` records the change as **infrastructure only — no user-observable change** (D-24026 N/A)
