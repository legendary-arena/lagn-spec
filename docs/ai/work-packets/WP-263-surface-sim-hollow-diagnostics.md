# WP-263 — Surface Simulation Hollow-Effect Diagnostics on the Capture/Sweep Projection (Engine; WP-259 Predecessor)

**Status:** Draft — pending review. Pre-flight READY; copilot CONFIRM; lint 21/21 (§Pre-Flight & Copilot Verdicts).
**Primary Layer:** Game Engine (`packages/game-engine/src/simulation/**`). Single layer, single package — a small additive projection widening.
**User-Visible Surface:** `none — infrastructure`. This widens an engine simulation **return projection**; a player cannot perceive it. D-24026 live-verification is **N/A** (STATUS records "No user-observable change — infrastructure only").
**Dependencies:** WP-257 ✅ (the engine `G.diagnostics.hollowEffects` + `hollowEffectsDropped` channel + `HollowEffectRecord` / `GameDiagnostics`; D-24033/D-24034 — the runtime-only channel this reads). WP-193 ✅ (`simulateOneGameAndCaptureMoves` + the `CapturedGameResult` projection this extends). WP-194 ✅ (`sweepSetupMatrix` + the `SweepCellResult` projection this extends).

---

## Goal

After this session, a finished simulated game's hollow-effect diagnostics are readable off the engine's simulation **capture/sweep projection**: `simulateOneGameAndCaptureMoves` returns the finished game's `hollowEffects` + `hollowEffectsDropped`, and `sweepSetupMatrix`'s per-cell `SweepCellResult` carries the same — populated from each finished game's runtime-only `G.diagnostics` channel via a small exported pure helper. Today both projections discard the finished `G` and surface only `{ winner, escapedVillains }` (plus `moves` / `endgameReached` / `moveCount`), so a downstream sim-harvest harness has **no exported way** to read the channel WP-257 emits. This packet adds that read — additive, deterministic, projection-only — so **WP-259** (the runtime-observed `/coverage` overlay, surface 3 of 3) can read each finished game's hollow effects off the locked `sweepSetupMatrix` driver without re-implementing a simulation loop, reconstructing hollows from `G.messages`, or importing engine internals.

## Assumes

- **WP-257 ✅ on `main`** — `G.diagnostics?: GameDiagnostics` where `GameDiagnostics = { hollowEffects: HollowEffectRecord[]; hollowEffectsDropped: number }` (`packages/game-engine/src/diagnostics/hollowEffect.types.ts`, re-exported via `types.ts:807`). The channel is **lazily created** by `recordHollowEffect` on the first hollow event; a game with no hollow effects leaves `G.diagnostics === undefined` (≡ empty). This packet **reads** that channel off the finished sim `gameState`; it does not change the channel, the record shape, the cap, or the writer.
- **WP-193 ✅ on `main`** — `simulateOneGameAndCaptureMoves(setupConfig, registry, policies, seed, gameIndex): CapturedGameResult`, where `CapturedGameResult = { moves, outcome: CapturedOutcomeSummary, endgameReached }` and `CapturedOutcomeSummary = { winner, escapedVillains }` (the deliberately-narrow "smallest seam" type). The finished `gameState` is local to this function and currently discarded after `buildGameOutcome`.
- **WP-194 ✅ on `main`** — `sweepSetupMatrix(...)` builds each `SweepCellResult` from the `CapturedGameResult` that `simulateOneGameAndCaptureMoves` returns, then invokes `onCellComplete(cell)`. `SweepCellResult` currently = `{ cellIndex, schemeId, mastermindId, cellSeed, outcome, endgameReached, moveCount }`.
- **Two field-set drift guards exist and WILL trip** — `simulation.captureMoves.test.ts` pins `CapturedGameResult` to **exactly** `{ endgameReached, moves, outcome }`; `sweep.runner.test.ts` pins `SweepCellResult` to its exact key set. Adding fields is a deliberate trip of both; updating them is in-scope (the canonical readonly-field-set drift discipline). The `CapturedOutcomeSummary`-exactly-`{escapedVillains, winner}` assertion is **NOT** touched — diagnostics ride as siblings, never nested into that narrow type.
- **Baseline:** drafted against `origin/main` @ `cfb1fafd` (`git rev-parse origin/main`).

## Context (Read First)

- `docs/ai/DESIGN-HOLLOW-EFFECT-DETECTION.md` §6.2 (the `/coverage` overlay WP-259 builds), §9 (boundaries — the engine emits the signal; tooling/UI consume it strictly downstream). This packet is the engine-side **read accessor** that the §6.2 consumer needs and that WP-259's locked `sweepSetupMatrix` import cannot provide as the channel is currently discarded.
- `packages/game-engine/src/simulation/simulation.runner.ts` (`simulateOneGameAndCaptureMoves`, `CapturedGameResult`, `CapturedOutcomeSummary`) + `simulation.captureMoves.test.ts` (the `CapturedGameResult` field-set drift gate at the `field-set drift` test).
- `packages/game-engine/src/simulation/sweep.runner.ts` (`sweepSetupMatrix`, `SweepCellResult`, the per-cell projection) + `sweep.runner.test.ts` (the `SweepCellResult field-set drift assertion` test).
- `packages/game-engine/src/diagnostics/hollowEffect.types.ts` (`HollowEffectRecord`, `GameDiagnostics`) + `hollowEffect.record.ts` / `hollowEffect.test.ts` (the `recordHollowEffect` lazy-init + the "minimal `G` cast through unknown" test precedent the helper unit test mirrors).
- `packages/game-engine/src/ui/uiState.build.ts` (lines ~813–828) — the established "projection holds **no reference** into `G.diagnostics` (fresh copy)" posture the helper mirrors.

**Why a predecessor WP (not folded into WP-259):** WP-259 is **Shared Tooling + Dashboard** and locks `packages/**` diff **empty**. Surfacing the channel out of the simulation projection is an **engine** change — a different layer with its own contract surface (the two field-set drift gates) and a durable persistence-boundary clarification (D-24039). Folding it into WP-259 would make that packet 3-layer and break its central stated invariant. This packet lands the engine read first; WP-259 then consumes it and stays projection-and-report only. (Discovered at WP-259 execution: the locked `sweepSetupMatrix` driver discards the finished `G`, so the channel was unreadable — a boundary stop, resolved by this predecessor.)

## Non-Negotiable Constraints

**Engine-wide:** Full file contents for every modified file — no diffs, no snippets. ESM only, Node v22+. Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`. `node:test`; `.test.ts` only. `pnpm`, not `npm`; `pwsh`, not bash. The simulation files keep their file-header invariants verbatim: **No `boardgame.io` imports. No `@legendary-arena/registry` imports. No `Math.random()`. No `.reduce()`. No IO.** This change adds only a **type** import of `HollowEffectRecord` (an engine-internal diagnostics type) and a read of `gameState.diagnostics` — none of the banned categories.

**Additive + projection-only:** the change widens two **return** projections and adds one exported pure helper. It adds **no** new move, rule, phase, gameplay logic, or PRNG draw; it mutates **nothing** in `G`; it changes **no** existing field's value. `simulateOneGameAndCaptureMoves`'s `outcome`/`moves`/`endgameReached` and `sweepSetupMatrix`'s existing per-cell fields are byte-unchanged. The simulation remains byte-identical run-to-run.

**Determinism + persistence (load-bearing):** the diagnostics channel is **runtime-only** (D-24034) and is here surfaced strictly as a **derived read-only RETURN value** — never persisted, never written back to `G`, never consumed as gameplay input. The sentinel `finalStateHash` is computed over canonical game **state**, not the capture return, so it is **unchanged** (guarded by the existing engine replay fixture test; **do NOT add a new hash fixture or invent a sentinel**). The helper returns a **fresh shallow copy** of the records array (the records are immutable plain objects) so the projection holds no reference into the sim `gameState` — mirroring the `uiState.build.ts` no-reference-into-`G` posture.

**Siblings, not nesting:** `hollowEffects` + `hollowEffectsDropped` are added as **sibling** fields on `CapturedGameResult` and `SweepCellResult` — they are **NOT** added to `CapturedOutcomeSummary` (the WP-193 "smallest seam" narrow type stays exactly `{ winner, escapedVillains }`, and its drift assertion stays green).

**No WP-257 channel change:** `HollowEffectRecord`, `GameDiagnostics`, `HOLLOW_EFFECTS_CAP`, `recordHollowEffect`, and the executors' write sites are **untouched**. This packet only **reads** the channel. `data/cards/**` byte-unchanged. No engine barrel (`index.ts`) change is required — WP-259's harness deep-imports `dist/simulation/sweep.runner.js`, and `HollowEffectRecord` is already barrel-exported (WP-258).

## Scope (In)

### A) Single-game capture projection
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified**:
  - Add `import type { HollowEffectRecord } from '../diagnostics/hollowEffect.types.js';`.
  - Add an exported pure helper `captureGameDiagnostics(gameState: LegendaryGameState): CapturedDiagnostics` returning `{ hollowEffects: [...(gameState.diagnostics?.hollowEffects ?? [])], hollowEffectsDropped: gameState.diagnostics?.hollowEffectsDropped ?? 0 }` (fresh shallow array copy; absent channel ⇒ `[]` / `0`), plus a small `CapturedDiagnostics` interface (`readonly hollowEffects: readonly HollowEffectRecord[]; readonly hollowEffectsDropped: number`).
  - Add `hollowEffects` + `hollowEffectsDropped` (the two `CapturedDiagnostics` fields) to the `CapturedGameResult` interface, as **siblings** of `outcome`.
  - Populate them in `simulateOneGameAndCaptureMoves`: the main return reads `captureGameDiagnostics(gameState)`; the **two degenerate early returns** (empty seed / empty policies) return `hollowEffects: []` + `hollowEffectsDropped: 0`.

### B) Sweep per-cell projection
- `packages/game-engine/src/simulation/sweep.runner.ts` — **modified**:
  - Add `import type { HollowEffectRecord } from '../diagnostics/hollowEffect.types.js';`.
  - Add `hollowEffects` + `hollowEffectsDropped` to the `SweepCellResult` interface, as siblings of `outcome`.
  - Populate them in the per-cell projection from the `captured` (`CapturedGameResult`) the dispatcher already has: `hollowEffects: captured.hollowEffects`, `hollowEffectsDropped: captured.hollowEffectsDropped` (no further copy — `captured.hollowEffects` is already the helper's fresh copy).

### C) Tests
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **modified**:
  - Update the `CapturedGameResult` field-set drift assertion to the new exact set `['endgameReached', 'hollowEffects', 'hollowEffectsDropped', 'moves', 'outcome']` (the `CapturedOutcomeSummary`-exactly-`{escapedVillains, winner}` assertion stays unchanged).
  - Add a shape/default assertion: with the existing mock (empty) registry, `captured.hollowEffects` deep-equals `[]` and `captured.hollowEffectsDropped === 0` (the additive fields exist + default; both degenerate early returns covered).
  - Add `captureGameDiagnostics` unit tests on a hand-built `LegendaryGameState` (the `recordHollowEffect` "minimal `G` cast through unknown" precedent): a populated `diagnostics` channel ⇒ the helper returns those exact records + dropped count; an absent channel ⇒ `[]` / `0`; the returned array is a copy (mutating it does not touch the source).
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **modified**:
  - Update the `SweepCellResult` field-set drift assertion to include `hollowEffects` + `hollowEffectsDropped` in the exact key set.
  - Assert each collected cell carries `hollowEffects` (deep-equal `[]` under the mock registry) + `hollowEffectsDropped === 0` (the sweep passes the capture's diagnostics through).

## Out of Scope
- **WP-259 (`/coverage` runtime overlay)** — the downstream consumer this unblocks; it reads the new fields, it does not define them. The WP-259/EC-290 amendment that re-points its data-read onto this surface is a **separate** follow-up SPEC (noted in WP-259's body), not this packet.
- **Changing the WP-257 channel** — `HollowEffectRecord` / `GameDiagnostics` / `HOLLOW_EFFECTS_CAP` / `recordHollowEffect` / the executor write sites stay byte-unchanged; this packet only **reads** the channel.
- **`runSimulation`'s aggregate (`SimulationResult`)** — not widened; WP-259 uses the sweep/capture path, not the aggregate. Adding diagnostics there is unneeded surface.
- **`CapturedOutcomeSummary`** — the narrow `{ winner, escapedVillains }` type is untouched (diagnostics ride as siblings).
- **The engine barrel (`index.ts`)** — no re-export change; the harness deep-imports the dist and `HollowEffectRecord` is already exported (WP-258).
- **Any new gameplay, move, rule, persistence, registry read, or `data/cards/**` change.**

## Files Expected to Change
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — `captureGameDiagnostics` helper + `CapturedDiagnostics` + the two `CapturedGameResult` fields, populated (main + both degenerate returns).
- `packages/game-engine/src/simulation/sweep.runner.ts` — **modified** — the two `SweepCellResult` fields, passed through from `captured`.
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **modified** — `CapturedGameResult` drift update + shape/default + `captureGameDiagnostics` unit tests.
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **modified** — `SweepCellResult` drift update + per-cell diagnostics pass-through assertion.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-263 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-293 Done), `docs/ai/DECISIONS.md` (D-24039 → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-263 node + `node scripts/roadmap-counts.mjs --check`).

No other files modified. `data/cards/**` byte-unchanged; the WP-257 diagnostics files byte-unchanged; `index.ts` byte-unchanged.

## Contract

**`CapturedDiagnostics`** (new, `simulation.runner.ts`):
```ts
export interface CapturedDiagnostics {
  readonly hollowEffects: readonly HollowEffectRecord[];
  readonly hollowEffectsDropped: number;
}
export function captureGameDiagnostics(gameState: LegendaryGameState): CapturedDiagnostics;
```
- Reads `gameState.diagnostics?.hollowEffects ?? []` (returned as a **fresh shallow copy**) and `gameState.diagnostics?.hollowEffectsDropped ?? 0`. Pure; deterministic; no mutation of `gameState`.

**`CapturedGameResult`** (extended, `simulation.runner.ts`) — adds the two `CapturedDiagnostics` fields as siblings:
```ts
export interface CapturedGameResult {
  readonly moves: readonly ReplayMove[];
  readonly outcome: CapturedOutcomeSummary;          // unchanged: { winner, escapedVillains }
  readonly endgameReached: boolean;
  readonly hollowEffects: readonly HollowEffectRecord[];
  readonly hollowEffectsDropped: number;
}
```

**`SweepCellResult`** (extended, `sweep.runner.ts`) — adds the same two sibling fields, passed through from the cell's `CapturedGameResult`.

- The values mirror the WP-257 channel exactly: `hollowEffects` carries `HollowEffectRecord`s already classified hollow by the engine (`reason ∈ { no-handler, unsupported-keyword, parse-unrecognized }`); `hollowEffectsDropped` is the engine's post-cap drop count. The projection **never re-classifies** and **never re-detects** — it copies what the engine recorded.

## Acceptance Criteria

### A) Single-game projection
- [ ] `captureGameDiagnostics(gameState)` returns `{ hollowEffects, hollowEffectsDropped }` read from `gameState.diagnostics`, with an **absent channel ⇒ `[]` / `0`**, a populated channel ⇒ the exact records + dropped count, and the returned array a **copy** (mutating it leaves the source untouched). Pure; no `gameState` mutation.
- [ ] `simulateOneGameAndCaptureMoves` returns `hollowEffects` + `hollowEffectsDropped` as siblings of `outcome`, populated via the helper on the main path and `[]` / `0` on both degenerate early returns. `outcome` / `moves` / `endgameReached` are byte-unchanged.
- [ ] The `CapturedGameResult` field-set drift assertion is updated to the exact set including the two new fields; the `CapturedOutcomeSummary` exact-`{escapedVillains, winner}` assertion is **unchanged and green**.

### B) Sweep projection
- [ ] `SweepCellResult` carries `hollowEffects` + `hollowEffectsDropped`, passed through from the cell's `CapturedGameResult`; the field-set drift assertion is updated; all existing per-cell fields are byte-unchanged.

### C) Boundaries / determinism
- [ ] No `boardgame.io` / `@legendary-arena/registry` / `Math.random()` / `.reduce()` / IO introduced into either simulation file (the file-header invariants hold); the only new import is the `HollowEffectRecord` **type**.
- [ ] No `G` mutation; no new move/rule/phase; `data/cards/**` byte-unchanged; the WP-257 diagnostics files + `index.ts` byte-unchanged.
- [ ] Sentinel/replay `finalStateHash` unchanged — guarded by the existing engine replay test (`packages/game-engine/src/test/fixtures/replayFixtures.test.ts`, part of `pnpm --filter @legendary-arena/game-engine test`); **no new hash fixture / sentinel invented**.
- [ ] `git diff --name-only` shows only the four Files Expected to Change + governance.

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0 (also produces the dist WP-259's harness will import)
pnpm --filter @legendary-arena/game-engine test        # all pass, 0 fail (this run guards finalStateHash via replayFixtures.test.ts)
git diff --name-only -- data/cards/                     # empty
git diff --name-only -- packages/game-engine/src/diagnostics/ packages/game-engine/src/index.ts   # empty (WP-257 channel + barrel untouched)
```

The engine test run above is the `finalStateHash` gate (the replay fixtures assert the hash). `User-Visible Surface = none — infrastructure`, so there is **no** live-on-surface (D-24026) gate — STATUS.md records "No user-observable change — infrastructure only".

## Vision Alignment

**Vision clauses touched:** §20–§26 (scoring / PAR / **simulation** — this widens a simulation projection). **No conflict.** **Determinism preservation:** the change adds a read-only derived RETURN projection; it introduces no randomness, clock, network, or `G` mutation; the sim is byte-identical run-to-run and `finalStateHash` is unchanged (replay-test-guarded) — the artifact is a pure function of the finished `gameState`. **Persistence boundary preserved (D-24034):** the runtime-only diagnostics channel is surfaced as a derived return value, never persisted and never read as gameplay input. **Non-Goal proximity:** infrastructure for an internal diagnostics surface; not paid, persuasive, or competitive — none of NG-1..7 crossed.

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6 (structure / constraints / prereqs / context / output / naming):** PASS — 00.1 section order; canonical names (`HollowEffectRecord`, `GameDiagnostics`, `hollowEffects`, `hollowEffectsDropped`, `CapturedGameResult`, `SweepCellResult`, `CapturedOutcomeSummary`) match WP-257/WP-193/WP-194 + `00.2`; `## Out of Scope` lists ≥2 related-but-excluded items; 4 files, single layer, additive.
- **§2 Non-Negotiable Constraints:** PASS — engine-wide block (full file contents, ESM/Node v22+, `00.6`); packet-specific (additive projection, siblings-not-nesting, runtime-only-derived-read, no WP-257 channel change, `finalStateHash` bound to the existing replay test with a no-new-sentinel rule); boundary-based session protocol (stop only for a channel/contract change or a layer crossing).
- **§7 deps:** PASS — no new npm deps; only an engine-internal **type** import.
- **§8 architecture:** PASS — single engine layer; reads the runtime-only channel and returns a derived projection; no `boardgame.io`/registry/IO/`Math.random` added; no `G` mutation; no upward/sideways import. Persistence boundary preserved (derived return, not persistence).
- **§9 Windows:** PASS — `pnpm` + `pwsh`. **§10 env / §11 auth:** N/A (no env, no auth surface).
- **§12 test quality:** PASS — `captureGameDiagnostics` unit tests (populated / absent / copy-not-reference), both field-set drift updates, mock-registry shape/default; `node:test`; no `boardgame.io`/registry import; deterministic.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands incl. the empty-diff guards for `data/cards/` + the WP-257 channel + `index.ts`; binary acceptance criteria; DoD all pre-merge (infrastructure — no post-deploy split).
- **§16 code style:** PASS — small exported pure helper with JSDoc; full English words; `for...of` if any iteration (no `.reduce()` branching); `// why:` on the fresh-copy-no-reference-into-`G` posture, the runtime-only-derived-read persistence note, and the siblings-not-`CapturedOutcomeSummary` rationale.
- **§17 Vision:** Triggered (touches the simulation surface) → `## Vision Alignment` present with clause numbers + the determinism/persistence-preservation lines. No conflict.
- **§18 prose-vs-grep:** PASS — no count-bounded grep gate on a policed literal.
- **§19 bridge-vs-HEAD:** N/A. **§20 funding:** N/A. **§21 API catalog:** N/A — no HTTP endpoint and no `apps/server/src/**` library function added/modified (engine-internal simulation surface).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-17, baseline `cfb1fafd`).** **Work Packet Class:** Infrastructure & Verification (an additive engine return-projection widening; no gameplay mutation, no `game.ts` wiring, no move/phase). **Dependencies on `main`:** WP-257 (`G.diagnostics` channel + `HollowEffectRecord`/`GameDiagnostics`, verified at `hollowEffect.types.ts` + `types.ts:807` `diagnostics?: GameDiagnostics`), WP-193 (`simulateOneGameAndCaptureMoves`/`CapturedGameResult`/`CapturedOutcomeSummary`, verified in `simulation.runner.ts`), WP-194 (`sweepSetupMatrix`/`SweepCellResult`, verified in `sweep.runner.ts`). **Contract fidelity verified against source:** the two field-set drift gates exist (`simulation.captureMoves.test.ts` `field-set drift`; `sweep.runner.test.ts` `SweepCellResult field-set drift assertion`) and are correctly in the allowlist; `LegendaryGameState.diagnostics?` is typed optional so the `?? []` read typechecks; the channel is lazily created so the absent-channel default is real (not theoretical). **Empirical Scaffold (`01.4 §Validation-Tightening`): N/A** — this adds a new read projection; it does **not** narrow an existing input path, so no previously-valid input becomes rejected (the WP-254 scaffold-first class does not apply). **Recurrence traps pre-cleared:** both field-set drift tests are allowlisted **up front** (the move-registration-drift / field-set-drift recurrence — a new field on a drift-guarded projection requires updating its assertion in the same change); the engine build IS its typecheck (no separate `vue-tsc` gate — not an app package). **Architectural-boundary confidence high** (single engine layer; reads a runtime-only channel; returns a derived projection; no persistence, no registry, no `boardgame.io`). **Risks resolved + locked.**
- **Copilot (`01.7`): PASS / CONFIRM (2026-06-17).** 30-issue lens, Infrastructure & Verification class. **Cat-1 (Boundaries, #1/#16/#29):** single engine layer; reads the channel and returns a projection; the WP-257 emitter + `index.ts` barrel are untouched; one-directional (tooling will consume, the engine does not know it). **Cat-2 (Determinism, #2/#8/#23):** no randomness/clock/network/`G` mutation added; the sim is byte-identical; `finalStateHash` replay-test-guarded; the helper returns a fresh copy (no shared reference into the discarded sim `G`). **Cat-4 (Type Safety, #10/#27):** `hollowEffects` reuses the closed `HollowEffectRecord` shape (no stringly-typed re-classification); siblings on `CapturedGameResult`/`SweepCellResult`, never nested into the narrow `CapturedOutcomeSummary`; both field-set drift assertions updated so a future silent field add still trips. **Cat-5 (Persistence, #7/#19/#24):** reads the runtime-only D-24034 channel and surfaces it as a derived return value — never persisted, never gameplay input (D-24039 locks this). **Cat-6 (Testing, #11):** direct helper unit tests (populated / absent / copy-not-reference) + the two drift updates + mock-registry shape/default. **Cat-8 (Extensibility):** the read accessor the WP-259 consumer needs; the engine emits (WP-257), this exposes, WP-259 reports. No RISK rises to a scope change → CONFIRM.

> **Drafting status (per 01.0a):** WP + EC-293 written; pre-flight READY; copilot CONFIRM; lint 21/21; D-24039 reserved; session prompt written. Ready for execution against the locked contract. **Sequencing:** this packet must land before WP-259's execution session opens (WP-259 then consumes the new fields via a SPEC amendment to its data-read).

## Definition of Done

### Pre-merge Done (no post-deploy split — `User-Visible Surface = none — infrastructure`)
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 (the `finalStateHash` guard)
- [ ] `captureGameDiagnostics` is exported + pure; `CapturedGameResult` + `SweepCellResult` each carry `hollowEffects` + `hollowEffectsDropped` as siblings of `outcome`; `CapturedOutcomeSummary` is unchanged
- [ ] Both field-set drift assertions updated; no new hash fixture / sentinel invented; `finalStateHash` unchanged
- [ ] `data/cards/**` byte-unchanged; the WP-257 diagnostics files + `index.ts` byte-unchanged; no `G` mutation; no registry/`boardgame.io`/IO/`Math.random` added
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-263 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-293 Done; `docs/05-ROADMAP-MINDMAP.md` WP-263 node added; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/DECISIONS.md` D-24039 flipped to Active
- [ ] `docs/ai/STATUS.md` records the change as **infrastructure only — no user-observable change** (D-24026 N/A)
