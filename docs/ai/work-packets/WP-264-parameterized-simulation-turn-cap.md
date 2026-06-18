# WP-264 — Parameterized Simulation Turn Cap (`maxTurns` option; WP-265 Enabler)

**Status:** Draft — pending review. Pre-flight READY; copilot CONFIRM; lint 21/21 (§Pre-Flight & Copilot Verdicts).
**Primary Layer:** Game Engine (`packages/game-engine/src/simulation/**`). Single layer, single package — a small additive parameterization.
**User-Visible Surface:** `none — infrastructure`. This adds an opt-in simulation parameter with a behavior-preserving default; a player cannot perceive it. D-24026 live-verification is **N/A** (STATUS records "No user-observable change — infrastructure only").
**Dependencies:** WP-193 ✅ (`simulateOneGameAndCaptureMoves` + the per-turn loop `runPerTurnLoop`). WP-194 ✅ (`sweepSetupMatrix`). WP-263 ✅ (the sibling-field sim projection this is co-located with; not a hard dep). WP-036 ✅ (`runSimulation` + the `MAX_TURNS_PER_GAME` cap this parameterizes).

---

## Goal

After this session, the engine's simulation entry points accept an optional `maxTurns` parameter that caps a game's per-turn loop, threaded through to the loop and the outcome builder, **defaulting to the existing `MAX_TURNS_PER_GAME` (200)** so every current call site is byte-identical. This lets a downstream sweep run **short, terminating** games (a bounded sweep) instead of every game grinding to the 200-turn cap. Today `MAX_TURNS_PER_GAME` is a hardcoded constant with no override, so a competent-play sweep over not-yet-implemented heroes either runs minute-scale games or never terminates (the cards do nothing → no progress → 200-turn spin). This packet is the **engine enabler for WP-265** (the real-signal runtime-observed-hollows cron), which needs fast, bounded, terminating heuristic games to be CI/cron-affordable.

## Assumes

- **WP-193 ✅ on `main`** — `runPerTurnLoop(gameState, policies, numPlayers, gameIndex, nextRandom, onMoveDispatched?)` is the single per-turn loop (`simulation.runner.ts`); it caps at the module constant `MAX_TURNS_PER_GAME = 200` (the `while (turnsElapsed < MAX_TURNS_PER_GAME)` head, the stuck-game `turnsElapsed = MAX_TURNS_PER_GAME` break, and `buildGameOutcome`'s `turnsElapsed >= MAX_TURNS_PER_GAME ? MAX_TURNS_PER_GAME : turnsElapsed`). `simulateOneGame`, `simulateOneGameAndCaptureMoves`, and `runSimulation` all drive it.
- **WP-194 ✅ on `main`** — `sweepSetupMatrix(...)` calls `simulateOneGameAndCaptureMoves` per cell (a 9-parameter signature ending in the optional `shouldSkipCell`).
- **`MAX_TURNS_PER_GAME` is a behavior-only safety cap, not a gameplay rule** — its header comment already says "Not a gameplay rule." Lowering it for a specific sweep is a tooling choice, not a rules change; the default keeps every existing path identical.
- **Baseline:** drafted against `origin/main` @ `0a60968b` (`git rev-parse origin/main`).

## Context (Read First)

- `packages/game-engine/src/simulation/simulation.runner.ts` — `MAX_TURNS_PER_GAME` (line ~58), `runPerTurnLoop` (the cap at lines ~334 / ~407), `buildGameOutcome` (line ~542), `simulateOneGame`, `simulateOneGameAndCaptureMoves`, `runSimulation`. The file-header invariants: **No `boardgame.io` imports. No `@legendary-arena/registry` imports. No `Math.random()`. No `.reduce()`. No IO.**
- `packages/game-engine/src/simulation/sweep.runner.ts` — `sweepSetupMatrix` (the cell dispatcher).
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` + `sweep.runner.test.ts` — the existing determinism / PRNG-parity / field-set drift tests (the field-set drift guards pin RESULT shape; `maxTurns` is a PARAM, not a result field, so they are **unaffected** — this WP adds no result field).
- **Why now:** WP-265 (the real-signal cron) is blocked on a way to run bounded, terminating heuristic games. The competent policy is multi-minute per game at 200 turns and all-hollow-hero decks never reach a win/loss; a turn cap of ~30–50 makes games fast + terminating while still exercising the early-game recruit/play/fight where hollow abilities fire. The split-on-layer-boundary discipline (this is the **engine** half; WP-265 is the tooling/CI half) keeps each packet focused.

## Non-Negotiable Constraints

**Engine-wide:** Full file contents for every modified file — no diffs, no snippets. ESM only, Node v22+. Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`. `node:test`; `.test.ts` only. `pnpm`, not `npm`; `pwsh`, not bash. The simulation files keep their header invariants verbatim (no `boardgame.io` / `registry` / `Math.random` / `.reduce` / IO — this change adds none of those).

**Additive + behavior-preserving default:** `maxTurns` is an **optional** parameter on each entry point, defaulting to `MAX_TURNS_PER_GAME` (200). Every existing call site (which omits it) is **byte-identical**. The change adds no new move/rule/phase, mutates nothing new in `G`, and draws no new randomness.

**Determinism (load-bearing):** the per-turn loop stays deterministic — capping at `maxTurns` instead of 200 yields a deterministically-shorter game (the captured trace truncates at the bound). The sentinel `finalStateHash` is replay-fixture-guarded and uses the **default** path (no `maxTurns`), so it is **unchanged** (the engine replay suite is the gate; **do NOT add a new hash fixture or invent a sentinel**). The PRNG-stream-parity invariant (D-19303 seat seeds; the WP-193 warm-up) holds: the warm-up games in `simulateOneGameAndCaptureMoves` use the **same** `maxTurns` as the captured game, so a non-default cap does not desync the stream (the recorder/harness always pass `gameIndex = 0`, collapsing the warm-up to a no-op regardless).

**Minimal threading, no signature churn beyond additive:** `maxTurns` is added as a **trailing optional parameter** on each function (`runPerTurnLoop`, `simulateOneGame`, `buildGameOutcome`, `simulateOneGameAndCaptureMoves`, `runSimulation`, and `sweepSetupMatrix`). `sweepSetupMatrix` already ends in an optional `shouldSkipCell`; `maxTurns` follows it (a 10th optional param — a noted ergonomic smell, but the minimal additive change; an options-object refactor is explicitly OUT of scope). `MAX_TURNS_PER_GAME` stays the single source of the default value.

**No result-shape change:** `CapturedGameResult` / `SweepCellResult` / `CapturedOutcomeSummary` / `SimulationResult` are **unchanged** (this is a param, not a field) — the field-set drift guards stay green untouched.

## Scope (In)

### A) Thread `maxTurns` through the per-turn loop + outcome
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified**:
  - `runPerTurnLoop(...)` gains a trailing `maxTurns: number = MAX_TURNS_PER_GAME`; the `while (turnsElapsed < maxTurns)` head + the stuck-game `turnsElapsed = maxTurns` break use it.
  - `buildGameOutcome(...)` gains a trailing `maxTurns: number = MAX_TURNS_PER_GAME`; the `effectiveTurns` cap uses it.
  - `simulateOneGame(config, registry, gameIndex, nextRandom, maxTurns = MAX_TURNS_PER_GAME)` passes it to `runPerTurnLoop` + `buildGameOutcome`.
  - `simulateOneGameAndCaptureMoves(setupConfig, registry, policies, seed, gameIndex, maxTurns = MAX_TURNS_PER_GAME)` passes it to the warm-up `simulateOneGame` calls, `runPerTurnLoop`, and `buildGameOutcome`.
  - `runSimulation(config, registry, maxTurns = MAX_TURNS_PER_GAME)` passes it to `simulateOneGame`.

### B) Thread `maxTurns` through the sweep dispatcher
- `packages/game-engine/src/simulation/sweep.runner.ts` — **modified**: `sweepSetupMatrix(...)` gains a trailing optional `maxTurns?: number` (after `shouldSkipCell?`); it is forwarded to `simulateOneGameAndCaptureMoves` (omit ⇒ the function default 200 applies).

### C) Tests
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **modified**: a `simulateOneGameAndCaptureMoves(..., maxTurns)` call with a small cap (e.g. 5) yields a game whose `moves`/turn count respects the bound (≤ the cap's worth of turns); a call **omitting** `maxTurns` is **deep-equal** to the same call with `maxTurns = 200` (default-equivalence / byte-identity).
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **modified**: `sweepSetupMatrix(..., maxTurns)` forwards the cap (a small-cap cell's `moveCount` ≤ the unbounded cell's) and omitting it is deep-equal to passing 200.

## Out of Scope
- **WP-265 (the real-signal cron + harness `--deep` mode)** — the consumer of this param; it adds no engine code.
- **An options-object refactor of `sweepSetupMatrix` / the sim entry points** — the additive trailing param is the minimal change; the 10-arg signature smell is noted, not fixed here.
- **Changing the default cap (200) or making it a gameplay rule** — the default is unchanged; `maxTurns` is a tooling override only.
- **`CapturedGameResult` / `SweepCellResult` shape** (WP-263) — untouched; this adds a param, not a field.
- **Any new move/rule/phase, persistence, registry read, or `data/cards/**` change.**

## Files Expected to Change
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — thread `maxTurns` (default `MAX_TURNS_PER_GAME`) through the loop, outcome builder, and the three entry points.
- `packages/game-engine/src/simulation/sweep.runner.ts` — **modified** — `sweepSetupMatrix` trailing optional `maxTurns`, forwarded to the capture call.
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **modified** — bound-respected + default-equivalence tests.
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **modified** — sweep forwards the cap + default-equivalence.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-264 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-294 Done), `docs/ai/DECISIONS.md` (D-24040 → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-264 node + `node scripts/roadmap-counts.mjs --check`).

No other files modified. `data/cards/**` byte-unchanged; `packages/game-engine/src/index.ts` byte-unchanged (no new export — `maxTurns` is a param on already-exported functions).

## Contract

- `maxTurns: number` — optional trailing parameter on `runPerTurnLoop`, `simulateOneGame`, `buildGameOutcome`, `simulateOneGameAndCaptureMoves`, `runSimulation`, and `sweepSetupMatrix`; **default = `MAX_TURNS_PER_GAME` (200)**. When supplied, the per-turn loop runs at most `maxTurns` turns and `buildGameOutcome` caps `effectiveTurns` at `maxTurns`.
- **Default-equivalence invariant:** any call that omits `maxTurns` is byte-identical to the same call passing `maxTurns = MAX_TURNS_PER_GAME`. This is the load-bearing guarantee the tests pin.
- `MAX_TURNS_PER_GAME` remains the single source of the default (exported or module-local as today; no new export required).

## Acceptance Criteria
- [ ] `maxTurns` is an optional trailing param (default `MAX_TURNS_PER_GAME`) on `runPerTurnLoop`, `simulateOneGame`, `buildGameOutcome`, `simulateOneGameAndCaptureMoves`, `runSimulation`, and `sweepSetupMatrix`; supplying a small cap bounds the per-turn loop + the captured trace.
- [ ] **Default-equivalence:** omitting `maxTurns` is deep-equal to passing `200` on both `simulateOneGameAndCaptureMoves` and `sweepSetupMatrix` (asserted in the two tests).
- [ ] No result-shape change — `CapturedGameResult` / `SweepCellResult` / `CapturedOutcomeSummary` / `SimulationResult` unchanged; the field-set drift guards stay green untouched.
- [ ] Determinism: no new randomness / clock / IO / `G` mutation; the warm-up uses the same `maxTurns` as the captured game; sentinel `finalStateHash` unchanged (replay-fixture-guarded; no new sentinel).
- [ ] No `boardgame.io` / `@legendary-arena/registry` / `Math.random()` / `.reduce()` / IO added to either simulation file; `data/cards/**` byte-unchanged; `index.ts` byte-unchanged.
- [ ] `git diff --name-only` shows only the four Files Expected to Change + governance.

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0
pnpm --filter @legendary-arena/game-engine test        # all pass, 0 fail (guards finalStateHash via replayFixtures.test.ts)
git diff --name-only -- data/cards/ packages/game-engine/src/index.ts   # empty
```

`User-Visible Surface = none — infrastructure`, so there is **no** D-24026 live-on-surface gate — STATUS.md records "No user-observable change — infrastructure only".

## Vision Alignment

**Vision clauses touched:** §20–§26 (scoring / PAR / **simulation** — an opt-in sim turn cap). **No conflict.** **Determinism preservation:** additive opt-in param with a behavior-preserving default; no randomness/clock/IO/`G` mutation; the default path is byte-identical and `finalStateHash` is unchanged (replay-guarded). **Non-Goal proximity:** infrastructure for the diagnostics sim; not paid, persuasive, or competitive — none of NG-1..7 crossed.

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6:** PASS — 00.1 order; canonical names (`MAX_TURNS_PER_GAME`, `runPerTurnLoop`, `simulateOneGameAndCaptureMoves`, `sweepSetupMatrix`, `runSimulation`) match WP-036/193/194; `## Out of Scope` lists ≥2 excluded items; 4 files, single layer, additive.
- **§2 Constraints:** PASS — engine-wide block + the additive/behavior-preserving-default + determinism (default byte-identical, warm-up parity, `finalStateHash` replay-guarded) + the no-result-shape-change guard + boundary-based stops.
- **§7 deps / §8 architecture:** PASS — no new npm deps; single engine layer; no `boardgame.io`/registry/IO/`Math.random` added; no upward/sideways import; no result-shape/contract change.
- **§9 Windows:** PASS — `pnpm`+`pwsh`. **§10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — bound-respected + default-equivalence (deep-equal) tests; `node:test`; no `boardgame.io`/registry import; deterministic.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands + empty-diff guards; binary criteria; DoD all pre-merge (infrastructure — no post-deploy split).
- **§16 code style:** PASS — small additive change; full English words; `// why:` on the `maxTurns` default (= `MAX_TURNS_PER_GAME`, behavior-preserving) + the warm-up-uses-same-cap parity note; no `.reduce()`.
- **§17 Vision:** Triggered (simulation) → `## Vision Alignment` present + determinism line. No conflict.
- **§18 prose-vs-grep / §19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A — no count-grep gate, no repo-summary artifact, no funding surface, no HTTP endpoint / `apps/server` library function.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (baseline `0a60968b`).** **Class:** Infrastructure & Verification (an additive sim param; no gameplay mutation, no move/phase). **Deps on `main`:** WP-193 (`runPerTurnLoop`/`simulateOneGameAndCaptureMoves` + the `MAX_TURNS_PER_GAME` cap, verified at `simulation.runner.ts:58/334/407/542`), WP-194 (`sweepSetupMatrix`). **Contract fidelity:** `maxTurns` is a param, not a result field → the field-set drift guards (which pin RESULT shape) are untouched; the warm-up-parity + default-equivalence invariants are the two real risks, both pinned by the tests. **Empirical Scaffold (`01.4 §Validation-Tightening`): N/A** — additive param, not a narrowed input path. **Recurrence traps:** none — no app-package typecheck (engine build is its typecheck), no result-shape change (no drift-test edit), no barrel export. **Risks resolved + locked.**
- **Copilot (`01.7`): PASS / CONFIRM.** **Cat-1 (Boundaries):** single engine layer; no new import; no result-shape change. **Cat-2 (Determinism):** behavior-preserving default (byte-identical); warm-up uses the same cap (no PRNG desync); `finalStateHash` replay-guarded. **Cat-4 (Type Safety):** optional trailing param with a typed default; no widening of any exported result type. **Cat-6 (Testing):** default-equivalence (deep-equal) + bound-respected tests. **Cat-8 (Extensibility):** the engine enabler WP-265 consumes; no other consumer perturbed. No RISK rises to a scope change → CONFIRM.

> **Drafting status (per 01.0a):** WP + EC-294 written; pre-flight READY; copilot CONFIRM; lint 21/21; D-24040 reserved; session prompt written. **Sequencing:** WP-264 must land before WP-265 executes (WP-265's `--deep` sweep passes `maxTurns`).

## Definition of Done

### Pre-merge Done (no post-deploy split — `User-Visible Surface = none — infrastructure`)
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 (the `finalStateHash` guard)
- [ ] `maxTurns` threaded with a `MAX_TURNS_PER_GAME` default on all six functions; default-equivalence asserted; no result-shape change; no new sentinel
- [ ] `data/cards/**` byte-unchanged; `index.ts` byte-unchanged; no registry/`boardgame.io`/IO/`Math.random` added; no `G` mutation
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-264 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-294 Done; `docs/05-ROADMAP-MINDMAP.md` WP-264 node added; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/DECISIONS.md` D-24040 flipped to Active
- [ ] `docs/ai/STATUS.md` records the change as **infrastructure only — no user-observable change** (D-24026 N/A)
