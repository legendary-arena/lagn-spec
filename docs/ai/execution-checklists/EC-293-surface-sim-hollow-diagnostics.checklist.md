# EC-293 — Surface Simulation Hollow-Effect Diagnostics on the Capture/Sweep Projection (Execution Checklist)

**Source:** docs/ai/work-packets/WP-263-surface-sim-hollow-diagnostics.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/**`)

## Before Starting
- [ ] WP-257 on `main` — `G.diagnostics?: GameDiagnostics` (`{ hollowEffects: HollowEffectRecord[]; hollowEffectsDropped: number }`), lazily created by `recordHollowEffect`; `types.ts:807` `diagnostics?: GameDiagnostics`
- [ ] WP-193 on `main` — `simulateOneGameAndCaptureMoves(...): CapturedGameResult` (`{ moves, outcome, endgameReached }`); `CapturedOutcomeSummary = { winner, escapedVillains }`
- [ ] WP-194 on `main` — `sweepSetupMatrix` builds `SweepCellResult` from the cell's `CapturedGameResult`
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (records the baseline pass count; this run is the `finalStateHash` guard)

## Locked Values (do not re-derive)
- New fields are named **exactly** `hollowEffects` and `hollowEffectsDropped` (the canonical WP-257 / `GameDiagnostics` field names) — on `CapturedGameResult` and `SweepCellResult`, as **siblings** of `outcome`.
- They are **NOT** added to `CapturedOutcomeSummary` — that type stays exactly `{ winner, escapedVillains }` and its field-set drift assertion stays unchanged + green.
- Helper: `export function captureGameDiagnostics(gameState: LegendaryGameState): CapturedDiagnostics` where `CapturedDiagnostics = { readonly hollowEffects: readonly HollowEffectRecord[]; readonly hollowEffectsDropped: number }`. Reads `gameState.diagnostics?.hollowEffects ?? []` (returned as a **fresh shallow array copy**) + `gameState.diagnostics?.hollowEffectsDropped ?? 0`.
- `HollowEffectRecord` is the engine type from `../diagnostics/hollowEffect.types.js` — imported **type-only**, reused, never a parallel shape; `reason ∈ { no-handler, unsupported-keyword, parse-unrecognized }`.
- Both **degenerate early returns** in `simulateOneGameAndCaptureMoves` (empty seed / empty policies) return `hollowEffects: []` + `hollowEffectsDropped: 0`.
- `sweepSetupMatrix` per-cell projection: `hollowEffects: captured.hollowEffects`, `hollowEffectsDropped: captured.hollowEffectsDropped` (pass-through — no second copy).

## Guardrails
- **Read, never re-detect / never re-classify** — copy what the engine already recorded in `G.diagnostics`; do NOT re-implement hollow detection or re-derive reasons.
- **Engine never persists / never feeds gameplay** — the channel is runtime-only (D-24034); surfaced strictly as a derived RETURN value, never written back to `G`, never read as gameplay input.
- **Siblings, not nesting** — never add diagnostics to `CapturedOutcomeSummary`.
- **No WP-257 channel change** — `HollowEffectRecord` / `GameDiagnostics` / `HOLLOW_EFFECTS_CAP` / `recordHollowEffect` / executor write sites byte-unchanged; `index.ts` barrel byte-unchanged; `data/cards/**` byte-unchanged.
- **File-header invariants hold** — no `boardgame.io`, no `@legendary-arena/registry`, no `Math.random()`, no `.reduce()`, no IO added to either simulation file; the only new import is the `HollowEffectRecord` **type**.
- **`finalStateHash` unchanged** — guarded by the existing `replayFixtures.test.ts`; do NOT add a new hash fixture or invent a sentinel.
- **Both field-set drift assertions MUST be updated** in the same change (the field add deliberately trips them).
- **Boundary-based stops only** — stop only to change the WP-257 channel shape, cross a layer, or touch persistence; ordinary projection details are decided in-line.

## Required `// why:` Comments
- The fresh shallow copy in `captureGameDiagnostics` (the projection holds no reference into the discarded sim `gameState`; mirrors the `uiState.build.ts` posture)
- The runtime-only-derived-read posture (the engine emits the D-24034 channel; this READS it as a return projection — never persisted, never gameplay input)
- The siblings-not-`CapturedOutcomeSummary` rationale (the WP-193 "smallest seam" narrow type stays `{ winner, escapedVillains }`)

## Files to Produce
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — `captureGameDiagnostics` + `CapturedDiagnostics` + the two `CapturedGameResult` fields (main + both degenerate returns)
- `packages/game-engine/src/simulation/sweep.runner.ts` — **modified** — the two `SweepCellResult` fields, passed through from `captured`
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **modified** — `CapturedGameResult` drift update + shape/default + `captureGameDiagnostics` unit tests
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **modified** — `SweepCellResult` drift update + per-cell pass-through assertion

## After Completing
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 (the `finalStateHash` guard)
- [ ] `git diff --name-only -- data/cards/ packages/game-engine/src/diagnostics/ packages/game-engine/src/index.ts` empty
- [ ] `git diff --name-only` = the 4 Files to Produce + governance only
- [ ] `docs/ai/DECISIONS.md` D-24039 → Active; `docs/ai/STATUS.md` records **infrastructure only — no user-observable change** (D-24026 N/A)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-263 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-293 Done; `docs/05-ROADMAP-MINDMAP.md` WP-263 node; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- A `CapturedOutcomeSummary` key-set test failure → diagnostics were wrongly nested into the narrow type instead of added as siblings.
- `simulation.captureMoves.test.ts` / `sweep.runner.test.ts` field-set drift failing → the new fields were added but the drift assertion was not updated (update it in the same change).
- `finalStateHash` / replay fixture failing → something mutated `G` or perturbed the sim; this WP must touch neither (read-only projection).
- A `packages/game-engine/src/diagnostics/**` or `index.ts` entry in the diff → the WP-257 channel or barrel was edited; this packet only READS the channel.
- The returned `hollowEffects` array aliases `gameState.diagnostics.hollowEffects` → mutating the return mutates the source; return a fresh shallow copy.
- A registry / `boardgame.io` import appears in a simulation file → file-header invariant broken; the only new import is the `HollowEffectRecord` type.
