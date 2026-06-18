# EC-294 — Parameterized Simulation Turn Cap (Execution Checklist)

**Source:** docs/ai/work-packets/WP-264-parameterized-simulation-turn-cap.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/**`)

## Before Starting
- [ ] WP-193 on `main` — `runPerTurnLoop` + `simulateOneGameAndCaptureMoves`; `MAX_TURNS_PER_GAME = 200` at `simulation.runner.ts` (the `while` head, the stuck break, `buildGameOutcome`'s effectiveTurns)
- [ ] WP-194 on `main` — `sweepSetupMatrix` (9-param, trailing optional `shouldSkipCell`)
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (records the baseline pass count; this run is the `finalStateHash` guard)

## Locked Values (do not re-derive)
- New param name is **exactly** `maxTurns`; type `number`; **default = `MAX_TURNS_PER_GAME` (200)** — the single source of the default value, kept **module-local (not exported)**. Added as a **trailing optional** param: after `shouldSkipCell` on `sweepSetupMatrix`, and after `onMoveDispatched?` on `runPerTurnLoop`.
- **Param order on `runPerTurnLoop`:** `maxTurns` goes **after** the existing optional `onMoveDispatched?`. The non-capturing `simulateOneGame` call must therefore pass `undefined` for the callback to reach it: `runPerTurnLoop(gameState, config.policies, numPlayers, gameIndex, nextRandom, undefined, maxTurns)`. Do NOT reorder the callback.
- Threaded through: `runPerTurnLoop`, `buildGameOutcome`, `simulateOneGame`, `simulateOneGameAndCaptureMoves`, `runSimulation`, `sweepSetupMatrix`.
- **Validity is caller-owned:** `maxTurns` is a positive integer; **no** runtime validation / clamp / coercion / `RangeError` is added (out-of-contract values degrade deterministically, matching the file's empty-seed / no-policy posture).
- **Default-equivalence invariant:** any call omitting `maxTurns` is **deep-equal** (`deepStrictEqual`) to the same call passing the literal `200`.
- The warm-up `simulateOneGame` calls inside `simulateOneGameAndCaptureMoves` use the **same** `maxTurns` as the captured game (PRNG-stream parity, D-19303).

## Guardrails
- **Behavior-preserving default** — every existing (omitting) call site is byte-identical; no current behavior changes.
- **No result-shape change** — `CapturedGameResult` / `SweepCellResult` / `CapturedOutcomeSummary` / `SimulationResult` untouched; `maxTurns` is a PARAM not a field, so the field-set drift guards stay green and are NOT edited.
- **Determinism** — no new `Math.random` / clock / IO / `G` mutation; capping is deterministic; warm-up uses the same cap.
- **`finalStateHash` unchanged** — replay-fixture-guarded (the engine suite); the default path is byte-identical; do NOT add a new hash fixture or invent a sentinel.
- **File-header invariants hold** — no `boardgame.io`, no `@legendary-arena/registry`, no `Math.random()`, no `.reduce()`, no IO added to either simulation file.
- **Minimal additive threading** — trailing optional param only; NO options-object refactor; NO reordering of existing params; `index.ts` byte-unchanged (no new export).
- **No new throw contract** — do NOT add `RangeError` / validation; `maxTurns` validity is caller-owned (degenerate values degrade deterministically, they do not throw).
- **`MAX_TURNS_PER_GAME` stays module-local** — do NOT export it merely to let a test reference it; the default-equivalence tests use the literal `200`.
- **Existing call sites stay source-unchanged** — none is edited just to pass `200` explicitly.
- **Boundary-based stops only** — stop only to change a result shape, cross a layer, or touch persistence/`data/cards`; ordinary threading details are decided in-line.

## Required `// why:` Comments
- The `maxTurns` default `= MAX_TURNS_PER_GAME` (behavior-preserving; existing call sites byte-identical)
- The warm-up using the same `maxTurns` as the captured game (PRNG-stream parity — a non-default cap must not desync the stream)

## Files to Produce
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — thread `maxTurns` (default 200) through the loop + outcome + the three entry points
- `packages/game-engine/src/simulation/sweep.runner.ts` — **modified** — `sweepSetupMatrix` trailing optional `maxTurns`, forwarded to the capture call
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **modified** — bound-respected + default-equivalence (omit ≡ 200) tests
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **modified** — sweep forwards the cap + default-equivalence

## After Completing
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 (the `finalStateHash` guard)
- [ ] `git diff --name-only -- data/cards/ packages/game-engine/src/index.ts` empty
- [ ] `git diff --name-only` = the 4 Files to Produce + governance only
- [ ] `docs/ai/DECISIONS.md` D-24040 → Active; `docs/ai/STATUS.md` records **infrastructure only — no user-observable change** (D-24026 N/A)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-264 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-294 Done; `docs/05-ROADMAP-MINDMAP.md` WP-264 node; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- A field-set drift test (`CapturedGameResult` / `SweepCellResult`) failing → a result field was added by mistake; `maxTurns` must be a PARAM only.
- `finalStateHash` / replay fixture failing → the default path was perturbed (default ≠ `MAX_TURNS_PER_GAME`, or the cap was applied even when omitted).
- A `simulation.captureMoves.test.ts` determinism/PRNG-parity test failing → the warm-up loop used a different `maxTurns` than the captured game (desync).
- A capture-path bound test asserting a `turnsElapsed` field → **phantom field**; `CapturedGameResult` exposes no turn count. Assert on `captured.moves.length` (capture) / `moveCount` (sweep) only.
- The small-cap test runs at `gameIndex = 0` only → warm-up forwarding is never exercised (the loop collapses to a no-op). Add a `gameIndex = 1` default-equivalence assertion.
- `maxTurns` appended **before** `onMoveDispatched?` on `runPerTurnLoop` (or before `shouldSkipCell` on `sweepSetupMatrix`) → param-order violation; it must be the last param, and the `simulateOneGame` call must pass `undefined` for the callback.
- An invalid `maxTurns` silently clamps or a `RangeError` is thrown → either is a contract violation; validity is caller-owned with **no** runtime handling.
- An existing non-test call site edited to pass `200` explicitly → unnecessary churn; the default must stay implicit.
- An `index.ts` entry in the diff → a new export was added; `maxTurns` is a param on already-exported functions only. (Likewise: do NOT export `MAX_TURNS_PER_GAME`.)
- A registry / `boardgame.io` import appears → file-header invariant broken; this change adds none.
