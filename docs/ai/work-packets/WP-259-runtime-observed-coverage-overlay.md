# WP-259 — Runtime-Observed Hollow-Effect Coverage Overlay (Tooling + Dashboard `/coverage`; Reporting Loop, Surface 3 of 3)

**Status:** Draft — pending review. Pre-flight READY; copilot PASS; lint 21/21 (§Pre-Flight & Copilot Verdicts).
**Primary Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs` — a dev/CI sim-harvest harness) **+** Dashboard (`apps/dashboard/src/**`). Two layers, one WP — the standard generator-tooling / dashboard-renders pattern the existing `hero-mechanic-ledger.mjs` + `/coverage` page already use (D-24026 sibling WP-258 used the engine-projects / client-renders form of the same single-deliverable rationale).
**User-Visible Surface:** `dashboard.legendary-arena.com` — the existing `/coverage` page gains a **runtime-observed** overlay distinguishing mechanics actually encountered-hollow during deterministic simulation play from the static `executable / unsupported / unmarked / deferred` status. (D-24026 live-verification applies, post-deploy.)
**Dependencies:** WP-257 ✅ (the engine `G.diagnostics.hollowEffects` channel + `HollowEffectRecord` + `HOLLOW_EFFECTS_CAP = 256`, D-24033/D-24034 — the runtime signal this harvests). WP-250 ✅ / D-24021 (the `hero-effect-coverage` static gate + committed baseline this drift-mirrors). The mechanic-ledger generator `scripts/hero-mechanic-ledger.mjs` → `docs/ai/coverage/hero-mechanic-ledger.json` + the `/coverage` page that renders it (the build-time-copy convention this reuses). `packages/game-engine/src/simulation/sweep.runner.ts` exporting `sweepSetupMatrix` (the bounded deterministic sweep this drives). The `DESIGN-HOLLOW-EFFECT-DETECTION.md §6.2` `/coverage`-overlay guidance + §8 WP-259 acceptance criteria + §10 D-24035.

---

## Goal

After this session, the dashboard `/coverage` page surfaces a **runtime-observed** overlay: per mechanic, how often a declared-but-unreachable handler was actually hit during a fixed-seed, bounded deterministic simulation sweep — with example cards — rendered visually distinct from the existing static coverage status. Static coverage answers *"is this mechanic unsupported in theory?"*; the overlay answers *"did it actually bite a player in play?"* The data is produced by a new deterministic tooling harness (`scripts/runtime-observed-hollows.mjs`) that runs the sweep, reads each finished game's `G.diagnostics.hollowEffects`, aggregates per mechanic, and writes a committed canonical artifact (`docs/ai/coverage/runtime-observed-hollows.json`) that a freshness gate keeps fresh — mirroring the existing `hero-effect-coverage` static gate. This is the reporting loop's third and final consumer (`DESIGN-HOLLOW-EFFECT-DETECTION.md §6`): WP-258 ✅ shipped the arena-client `/debug` surface (surface 1); WP-257 ✅ is the engine emitter; WP-259 reads the same channel to make runtime-confirmed gaps loud on `/coverage`.

## Assumes

- **WP-257 ✅ on `main`** — the engine emits `G.diagnostics.hollowEffects: HollowEffectRecord[]` (+ `hollowEffectsDropped: number`), where `HollowEffectRecord = { cardId; cardType: 'hero'|'villain'|'henchman'; timing; mechanic; reason: 'parse-unrecognized'|'no-handler'|'unsupported-keyword'; turn }`, capped at `HOLLOW_EFFECTS_CAP = 256`, runtime-only, never gameplay input (D-24033/D-24034). The harness reads this channel off finished-game `G`; it does not re-derive it.
- **`packages/game-engine/src/simulation/sweep.runner.ts` exports `sweepSetupMatrix(...)`** (line 219) — the bounded deterministic sweep driver. `simulation.runner.ts` is its single-game companion. The harness drives one of these to produce finished `G` states; it does not add a new simulation engine.
- **WP-250 ✅ / D-24021 on `main`** — `scripts/hero-effect-coverage.mjs` + `scripts/coverage/hero-effect-coverage.baseline.json` + the `hero-effect-coverage` CI job (`.github/workflows/ci.yml:141`, which runs `pnpm -r build` then `pnpm sim:coverage --check` then `pnpm ledger:heroes:check`). The new freshness gate mirrors this pattern.
- **`scripts/hero-mechanic-ledger.mjs` → `docs/ai/coverage/hero-mechanic-ledger.json`** exists and is the canonical-committed → build-time-copy precedent. `apps/dashboard/scripts/build-coverage-ledger.mjs` reads `docs/ai/coverage/hero-mechanic-ledger.json` and writes gitignored `apps/dashboard/src/data/coverage-ledger.json`; the dashboard `build` script (`apps/dashboard/package.json:9`) already chains it.
- **The dashboard `/coverage` page exists** — `apps/dashboard/src/pages/coverage/CoveragePage.vue`, `apps/dashboard/src/composables/useCoverageLedger.ts` (+ `.test.ts`), `apps/dashboard/src/types/coverage.ts` (+ `coverage.drift.test.ts`). The overlay extends these; it does not create a new page.
- **`apps/dashboard/.gitignore`** already ignores `src/data/governance-snapshot.json` + `src/data/coverage-ledger.json` (the build-time-copy convention). The new data file joins them.
- **Baseline:** drafted against `origin/main` @ `edaecdbd` (the drafting baseline; `git rev-parse origin/main`).

## Context (Read First)

- `docs/ai/DESIGN-HOLLOW-EFFECT-DETECTION.md` §6.2 (`/coverage` overlay + the `runtimeObserved` shape), §8 WP-259 acceptance criteria, §9 boundaries, §10 D-24035 — the spec spine.
- `docs/ai/ARCHITECTURE.md` §Layer Boundary (Authoritative) + `.claude/rules/architecture.md` §Layer Boundary — the Shared Tooling row (dev/test-only; never a runtime edge into the Registry→Engine→Server chain) and the dashboard import rules (the dashboard reads committed JSON; it does NOT import the engine).
- `docs/ai/DECISIONS.md` — scan D-24033/D-24034 (the channel this harvests), D-24021 (the static gate this mirrors), D-24002 (the `roadmap-counts` weekly-cron precedent for the CI-affordability fallback), D-24026 (the live-verification gate).
- `scripts/hero-effect-coverage.mjs` + `scripts/coverage/hero-effect-coverage.baseline.json` + `.github/workflows/ci.yml` (the `hero-effect-coverage` job) — the drift-gate pattern to mirror.
- `scripts/hero-mechanic-ledger.mjs` + `apps/dashboard/scripts/build-coverage-ledger.mjs` — the canonical-committed → build-time-copy delivery to reuse.
- `packages/game-engine/src/simulation/sweep.runner.ts` (`sweepSetupMatrix`) + `simulation.runner.ts` — the bounded deterministic sweep driver.

## Non-Negotiable Constraints

**Engine-wide:** Full file contents for every new or modified file — no diffs, no snippets. ESM only, Node v22+. Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`. The native `node:test` runner; `.test.ts` only. `pnpm`, not `npm`; `pwsh`, not bash.

**Tooling (`scripts/runtime-observed-hollows.mjs`):** a standalone `.mjs` dev/CI harness — **Shared Tooling**, NOT a package on the Registry→Engine→Server chain. It MAY import the engine's simulation surface to RUN the sweep (it is a dev/test consumer, the same posture `hero-effect-coverage.mjs` has driving the parser); it MUST NOT be imported by any runtime production code, and it never writes to the dashboard except via the committed artifact. **Determinism is load-bearing:** a fixed `runSeed` + a bounded sweep ⇒ a byte-identical artifact every run ⇒ `--check` regenerates + diffs (exit 1 on drift), exactly mirroring `hero-effect-coverage`. The harness reads `G.diagnostics?.hollowEffects ?? []` off each finished game — it NEVER re-implements hollow detection. Keys are sorted deterministically; `examples` are bounded per mechanic for a stable diff. **The engine never writes the artifact** (the §6.2 / §9 boundary): the ledger/overlay is derived strictly downstream from `G.diagnostics.hollowEffects`.

**Dashboard (`apps/dashboard`):** additive — the overlay extends the existing `/coverage` page, composable, and types; the dashboard reads the committed artifact via the build-time-copy convention (a gitignored `src/data/runtime-observed-hollows.json`). The dashboard MUST NOT import `@legendary-arena/game-engine` / `registry` / `server` / `pg` — it consumes the JSON only. **There is NO `/api/coverage`** — the dashboard is mock-mode-first / static-bundle; do NOT add a server endpoint. `vue-tsc --noEmit` must stay green (the dashboard-typecheck-drift recurrence — `vite build` + `node:test` under tsx neither type-check; only the explicit `typecheck` script does); **check the `vue-tsc` baseline is green before coding** (it has shipped red silently before — WP-229/WP-230). If new closed arrays are added to `types/coverage.ts`, the `coverage.drift.test.ts` drift assertions must be updated in the same change.

**Locked values (the requirement, not the literals):** the exact `runSeed`, sweep axes, and `gamesPlayed` cap are **execution-time locked values** the executor SETS, RECORDS in the artifact's `generatedFrom`, and **scaffold-confirms by an observed run** — they cannot be known without running the sweep (that is execution). The WP/EC lock the *requirement* (deterministic, bounded, committed, `:check`-gated, CI-affordable), not the literal numbers. The artifact's `schemaVersion` is `1`.

**Session protocol:** stop and ask on any unclear item; do not guess. If the sweep cannot be made CI-affordable at a bound that still surfaces meaningful runtime hollows, fall back to a scheduled cron (the D-24002 `roadmap-counts` weekly-cron precedent; `sweep-weekly.yml` is the heavier-sweep analog) instead of a per-PR gate — present `:check`-in-CI as primary with the cron fallback noted.

**No new gameplay / no engine edit:** projection-and-report only. The `packages/**` diff is **empty** at execution. `data/cards/**` byte-unchanged.

## Scope (In)

### A) Tooling — the deterministic sim-harvest harness
- `scripts/runtime-observed-hollows.mjs` — **new**. Runs a fixed-`runSeed`, bounded deterministic sweep via the engine's `sweepSetupMatrix(runSeed, axes, callback)` (`packages/game-engine/src/simulation/sweep.runner.ts`); for each finished game reads `G.diagnostics?.hollowEffects ?? []`; aggregates per mechanic (hitCount, lastSeenTurn, byReason breakdown, a bounded `examples[]`); writes the canonical artifact with deterministically-sorted keys. Supports `--check` (regenerate to a temp buffer + diff the committed artifact; exit 1 on drift, mirroring `hero-effect-coverage`'s per-set hard-fail) and `--update-baseline` (write the artifact). Pure Node + the engine sim import; no `Math.random` (the determinism comes from the fixed seed through `ctx.random.*` inside the engine), no clock, no network.
- `docs/ai/coverage/runtime-observed-hollows.json` — **new**. The canonical committed artifact (shape under §Contract).
- `package.json` (root) — **modified**. Add `sim:runtime-observed` (`node scripts/runtime-observed-hollows.mjs`) + `sim:runtime-observed:check` (`… --check`), in the style of `sim:coverage` / `ledger:heroes:check` (lines 54–56).
- `.github/workflows/ci.yml` — **modified**. Add a freshness `:check` step to the existing `hero-effect-coverage` job (which already runs `pnpm -r build` first — line 155), OR a new job if the sweep's wall-clock warrants isolation. **CI-affordability fallback:** if the bound that surfaces meaningful runtime hollows is too heavy for a per-PR gate, wire a scheduled cron instead (the D-24002 `roadmap-counts.yml` / `sweep-weekly.yml` precedent). Primary = `:check`-in-CI; the executor records which it chose + why.

### B) Dashboard — the runtime-observed overlay
- `apps/dashboard/src/types/coverage.ts` — **modified**. Add a `RuntimeObservedEntry` type (per-mechanic: hitCount, lastSeenTurn?, byReason, examples[]) + the file-summary type, matching the artifact shape. If a closed array is introduced, update `coverage.drift.test.ts`.
- `apps/dashboard/src/composables/useCoverageLedger.ts` — **modified**. Load the build-time-copied `src/data/runtime-observed-hollows.json` and expose a `runtimeObservedByMechanic` lookup the page joins onto each ledger row.
- `apps/dashboard/src/composables/useCoverageLedger.test.ts` — **modified**. Overlay/join unit test: a mechanic present in the artifact reads its runtime-observed entry; a mechanic absent reads as none; the join is by mechanic key.
- `apps/dashboard/src/pages/coverage/CoveragePage.vue` — **modified**. Render the runtime-observed overlay per row, **visually distinct** from the static `executable / unsupported / unmarked / deferred` status (e.g. a distinct badge/column showing hitCount + reason), with an explicit "not observed in play" empty state per mechanic.
- `apps/dashboard/scripts/build-coverage-ledger.mjs` — **modified**. Also copy `docs/ai/coverage/runtime-observed-hollows.json` → gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` (the existing dashboard `build` step already invokes this script — reusing it means `apps/dashboard/package.json` need NOT change; see C).
- `apps/dashboard/src/data/runtime-observed-hollows.json` — **new, gitignored** — the build-time copy (never committed; mirrors `coverage-ledger.json`).
- `apps/dashboard/.gitignore` — **modified**. Add `src/data/runtime-observed-hollows.json`.

### C) Wiring choice (executor records which)
- **Primary:** extend the existing `build-coverage-ledger.mjs` to copy both artifacts — the dashboard `build` script already calls it, so `apps/dashboard/package.json` is **unchanged**.
- **Alternative:** add a dedicated prebuild step — then `apps/dashboard/package.json` is **modified** (a new `prebuild:*` + chained into `build`). The executor picks one and records it; the allowlist permits `apps/dashboard/package.json` MODIFIED only under the alternative.

### D) Tests
- Tooling: the harness is deterministic — the committed artifact + `sim:runtime-observed:check` IS its regression gate (a re-run that drifts fails `--check`, mirroring `hero-effect-coverage`'s baseline gate). No separate `.test.ts` for the `.mjs` harness is required (the static gate has none either); the executor MAY add one if a pure aggregation helper is extracted.
- Dashboard: `useCoverageLedger.test.ts` — the overlay join (present / absent / by-key). (`vue-tsc` green.)

## Out of Scope

- **WP-260 (architect-lane intake) and WP-257 (engine detector) / WP-258 (arena-client `/debug` surface)** — the other reporting consumers / the emitter. WP-259 reads the channel; it does not change it.
- **Changing the engine detector / the `G.diagnostics` channel / `HollowEffectRecord` shape** (WP-257 contract, D-24033/D-24034) — `packages/**` diff is empty.
- **Any `/api/coverage` or server telemetry/persistence pipeline** — the dashboard is static-bundle / mock-mode-first; the overlay reads a committed artifact via build-time copy, NOT a live endpoint.
- **Live in-match telemetry ingestion** (real-player hollow events streamed to the dashboard) — the overlay is fed by the deterministic SIM sweep, not by production matches. A production-telemetry feed is a separate later multi-layer packet.
- **Implementing any missing mechanic** — this WP makes runtime gaps loud, it does not fill them (that is the downstream Architect-lane work WP-260 generates; `DESIGN-HOLLOW-EFFECT-DETECTION.md §9`).
- **`data/cards/**`, the registry, the static `hero-effect-coverage` baseline, the `hero-mechanic-ledger` artifact** — untouched; the runtime artifact is a new, separate file.

## Files Expected to Change
- `scripts/runtime-observed-hollows.mjs` — **new** — fixed-seed bounded sim-harvest of `G.diagnostics.hollowEffects` → aggregate → write canonical artifact; `--check` / `--update-baseline`.
- `docs/ai/coverage/runtime-observed-hollows.json` — **new** — the canonical committed artifact (`schemaVersion: 1`; shape under §Contract).
- `package.json` (root) — **modified** — add `sim:runtime-observed` + `sim:runtime-observed:check`.
- `.github/workflows/ci.yml` — **modified** — freshness `:check` step in the `hero-effect-coverage` job (or a new job / scheduled cron per the CI-affordability fallback).
- `apps/dashboard/src/types/coverage.ts` — **modified** — `RuntimeObservedEntry` + summary types (update `coverage.drift.test.ts` if a closed array is added).
- `apps/dashboard/src/composables/useCoverageLedger.ts` — **modified** — load + expose `runtimeObservedByMechanic`.
- `apps/dashboard/src/composables/useCoverageLedger.test.ts` — **modified** — overlay/join unit test (present / absent / by-key).
- `apps/dashboard/src/pages/coverage/CoveragePage.vue` — **modified** — render the overlay, visually distinct, with a per-mechanic empty state.
- `apps/dashboard/scripts/build-coverage-ledger.mjs` — **modified** — also copy the new artifact into `src/data`.
- `apps/dashboard/src/data/runtime-observed-hollows.json` — **new, gitignored** — build-time copy (absent from `git status`/the commit, which is correct).
- `apps/dashboard/.gitignore` — **modified** — ignore the new data file.
- `apps/dashboard/package.json` — **modified ONLY under the §C Alternative** (a new prebuild step); unchanged if the executor extends the existing `build-coverage-ledger.mjs` (the §C Primary).
- `apps/dashboard/src/types/coverage.drift.test.ts` — **modified ONLY IF** a closed array is added to `types/coverage.ts`.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-259 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-290 Done), `docs/ai/DECISIONS.md` (D-24035 → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-259 node + `node scripts/roadmap-counts.mjs --check`).

No other files modified. `data/cards/**` byte-unchanged; `packages/**` diff empty.

## Contract

**Canonical artifact — `docs/ai/coverage/runtime-observed-hollows.json`** (extends `DESIGN-HOLLOW-EFFECT-DETECTION.md §6.2`'s per-mechanic `runtimeObserved`):

```json
{
  "schemaVersion": 1,
  "generatedFrom": { "runSeed": <number>, "gamesPlayed": <number>, "matrixDescription": "<string>" },
  "summary": {
    "distinctMechanics": <number>,
    "totalObservations": <number>,
    "byReason": { "no-handler": <number>, "unsupported-keyword": <number>, "parse-unrecognized": <number> }
  },
  "byMechanic": {
    "<mechanic>": {
      "hitCount": <number>,
      "lastSeenTurn": <number>,
      "byReason": { "no-handler": <number>, "unsupported-keyword": <number>, "parse-unrecognized": <number> },
      "examples": [ { "cardId": "<string>", "cardType": "<string>", "timing": "<string>", "reason": "<string>" } ]
    }
  }
}
```

- `reason` values are the closed WP-257 set: `'no-handler' | 'unsupported-keyword' | 'parse-unrecognized'` (the three hollow-flagging reasons of D-24033 — the harness counts only records the engine already classified as hollow; it never re-classifies).
- `byMechanic` keys are sorted deterministically; `examples` are bounded per mechanic (a small cap) for a stable diff.
- `runSeed` / `gamesPlayed` / `matrixDescription` are the execution-time locked values, recorded so the artifact is reproducible.

**Drift-gate direction (mirrors the static gate):** a mechanic newly appearing in `byMechanic`, or a `hitCount` rise, is the meaningful regression signal (a runtime gap got worse / newly bit a player). A mechanic LEAVING `byMechanic` (its handler got implemented downstream) is progress, absorbed via `--update-baseline`. `--check` regenerates and diffs the committed artifact; drift ⇒ exit 1.

## Acceptance Criteria

### A) Tooling
- [ ] `scripts/runtime-observed-hollows.mjs` runs a fixed-`runSeed`, bounded deterministic sweep via the engine's `sweepSetupMatrix`, reads `G.diagnostics?.hollowEffects ?? []` off each finished game, and writes `docs/ai/coverage/runtime-observed-hollows.json` matching the §Contract shape (`schemaVersion: 1`, sorted keys, bounded `examples`).
- [ ] Two runs with the same seed produce a **byte-identical** artifact; `pnpm sim:runtime-observed:check` exits 0 on the committed artifact and exits 1 when the artifact drifts (the determinism + freshness gate, mirroring `hero-effect-coverage`).
- [ ] The harness reads the engine channel; it does NOT re-implement hollow detection, and the engine does NOT write the artifact (`packages/**` diff empty).
- [ ] `runSeed`, `gamesPlayed`, and `matrixDescription` are recorded in `generatedFrom` (reproducibility).

### B) Dashboard overlay
- [ ] `/coverage` renders the runtime-observed data per mechanic, **visually distinct** from the static `executable / unsupported / unmarked / deferred` status, with an explicit per-mechanic "not observed in play" empty state.
- [ ] `useCoverageLedger` exposes `runtimeObservedByMechanic`; the overlay join is by mechanic key (present reads the entry; absent reads none) — asserted in `useCoverageLedger.test.ts`.
- [ ] The dashboard reads the build-time-copied artifact (gitignored `src/data/runtime-observed-hollows.json`); no `@legendary-arena/*` engine/registry/server import; no `/api/coverage` added.
- [ ] `apps/dashboard` `vue-tsc --noEmit` is green; the dashboard `test` suite passes.

### C) Boundaries / determinism
- [ ] No engine edit (`packages/**` diff empty); `data/cards/**` byte-unchanged; no new move/rule.
- [ ] The tooling harness is Shared Tooling — not imported by any runtime production code; the dashboard does not appear in any engine import path.
- [ ] `git diff --name-only` shows only Files Expected to Change + governance (the gitignored `src/data/runtime-observed-hollows.json` is correctly absent).

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0
pnpm sim:runtime-observed                              # writes docs/ai/coverage/runtime-observed-hollows.json
pnpm sim:runtime-observed:check                        # exits 0 (committed artifact fresh); a re-run is byte-identical
pnpm --filter @legendary-arena/dashboard test          # all pass, 0 fail
pnpm --filter @legendary-arena/dashboard typecheck     # vue-tsc --noEmit, 0 errors (check this baseline is green BEFORE coding)
git diff --name-only -- data/cards/ packages/          # empty (no card-data, no engine change)
```

Live (D-24026, **post-deploy only**): on dashboard.legendary-arena.com `/coverage`, confirm the runtime-observed overlay renders, visually distinct from the static status, for at least one mechanic the sweep encountered hollow.

## Vision Alignment

**Vision clauses touched:** §20–§26 (scoring / PAR / **simulation** — the overlay is fed by a deterministic sim sweep), §10 (card content semantics — it reports per-mechanic coverage). **No conflict: this WP preserves all touched clauses.** **Determinism preservation:** the sweep is fixed-seed and bounded ⇒ the artifact is reproducible and replay-faithful (Vision §22); the harness reads the engine's deterministic `G.diagnostics.hollowEffects` channel and never introduces randomness, clock, or network — the artifact is a pure function of (seed, axes, engine dist). **Non-Goal proximity:** the overlay is an internal operator/diagnostics surface on the dashboard; it is not paid, persuasive, or competitive — none of NG-1..7 are crossed.

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6 (structure / constraints / prereqs / context / output / naming):** PASS — all required sections present with canonical names; `## Out of Scope` lists ≥2 related-but-excluded items; ~11–12 files across tooling+dashboard (the generator-tooling / dashboard-renders precedent the existing ledger+`/coverage` already use), additive; canonical names (`HollowEffectRecord`, `cardId`, `mechanic`, `reason`, `turn`) match WP-257 / `00.2`.
- **§2 Non-Negotiable Constraints:** PASS — engine-wide block (full file contents, no diffs/snippets, ESM/Node v22+, cites `00.6-code-style.md`); packet-specific (determinism, no `/api`, no engine write, `vue-tsc` gate); session protocol (stop-and-ask; CI-affordability cron fallback); locked-value posture (the requirement is locked, the literals are execution-time scaffold-confirmed).
- **§7 deps:** PASS — no new npm deps; the harness is plain Node + the engine sim import.
- **§8 architecture:** PASS — Shared Tooling harness (dev/CI only; not a runtime edge); dashboard reads committed JSON (no engine/registry/server/`pg` import, no `/api`); the engine never writes the artifact (the §6.2 / §9 boundary). No upward/sideways import.
- **§9 Windows:** PASS — `pnpm` + `pwsh` verification; the `.mjs` harness is cross-platform Node. **§10 env / §11 auth:** N/A (no env vars; no auth surface — static dashboard bundle).
- **§12 test quality:** PASS — dashboard overlay-join test under `node:test` (tsx); no `boardgame.io` import; no network/DB. The deterministic artifact + `:check` is the tooling's regression gate (the `hero-effect-coverage` precedent).
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands incl. `dashboard typecheck` (the recurrence gate) + the `:check` freshness gate + the `packages/` empty-diff guard; binary criteria; DoD split pre-merge / post-deploy.
- **§16 code style:** PASS — explicit `for...of` aggregation (no `.reduce()` branching), full English words, `// why:` on the fixed-seed determinism, the deterministic key-sort, and the engine-reads-not-writes posture; small functions with JSDoc.
- **§17 Vision:** Triggered (touches simulation + card-content coverage) → `## Vision Alignment` present with clause numbers + the determinism-preservation line. No conflict.
- **§18 prose-vs-grep:** PASS — no count-bounded grep gate on a policed literal.
- **§19 bridge-vs-HEAD:** N/A (no repo-state-summarizing artifact). **§20 funding:** N/A — docs/tooling/dashboard-diagnostics WP; no funding affordance, copy, or channel. **§21 API catalog:** N/A — no HTTP endpoint added/modified and no `apps/server/src/**` library function touched (the dashboard reads a committed JSON via build-time copy; there is deliberately NO `/api/coverage`).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-17, baseline `edaecdbd`).** **Work Packet Class:** Infrastructure & Verification (a sim-harvest harness + a dashboard render; runtime logic that does NOT mutate gameplay `G`, does NOT wire into `game.ts`, adds no move/phase). **Dependencies on `main`:** WP-257 (the `G.diagnostics.hollowEffects` channel + `HollowEffectRecord` + `HOLLOW_EFFECTS_CAP`), WP-250/D-24021 (the static gate + baseline + CI job to mirror), `sweep.runner.ts` `sweepSetupMatrix` (verified exported, line 219), `hero-mechanic-ledger.mjs` + `build-coverage-ledger.mjs` (the canonical-committed → build-time-copy delivery, verified — `build-coverage-ledger.mjs` reads `docs/ai/coverage/hero-mechanic-ledger.json` → writes gitignored `src/data/coverage-ledger.json`; the dashboard `build` chains it at `package.json:9`). **Contract fidelity verified against source:** `HollowEffectRecord`'s three hollow reasons are the closed WP-257 set; the `/coverage` page + composable + types exist; `.gitignore` already lists the two build-time-copy data files. **Recurrence traps pre-cleared:** the dashboard `typecheck` (`vue-tsc`) gate is in BOTH `Before Starting` and `After Completing` (the WP-229/230 dashboard-typecheck-drift recurrence) with an explicit "check the baseline is green before coding" note; `coverage.drift.test.ts` is allowlisted conditionally (if a closed array is added). **Empirical Scaffold (`01.4 §Validation-Tightening`): N/A as a validation-tightening change** (this does not narrow an existing input path — it adds a new artifact + overlay). The one genuinely execution-only unknown — the exact `runSeed` / axes / `gamesPlayed` that make the sweep both meaningful and CI-affordable — is **explicitly deferred to an observed scaffold run at execution time** (the WP/EC lock the requirement, not the literals); this is the honest reason READY does not pre-fill those numbers. **Architectural-boundary confidence high** (Shared Tooling harness; dashboard reads committed JSON; engine never writes the artifact; no `/api`). **Risks resolved + locked.**
- **Copilot (`01.7`): PASS / CONFIRM (2026-06-17).** 30-issue lens, Infrastructure & Verification class. **Cat-1 (Boundaries, #1/#16/#29):** the harness is Shared Tooling (no runtime edge); the dashboard reads JSON, never imports the engine; the engine never writes the ledger — one-directional knowledge, explicit in §Constraints. **Cat-2 (Determinism, #2/#8/#23):** fixed `runSeed` + bounded sweep ⇒ byte-identical artifact ⇒ `:check`; the harness has no `Math.random`/clock/network (randomness lives in the engine via `ctx.random.*`); deterministic key-sort for stable diffs. **Cat-4 (Type Safety, #10/#27):** `reason` is the closed WP-257 union (no stringly-typed re-classification); `RuntimeObservedEntry` is a narrow typed shape; canonical field names reused. **Cat-5 (Persistence, #7/#19/#24):** reads the runtime-only channel; the artifact is a derived committed record (the ledger precedent), JSON-only, never live `G`. **Cat-6 (Testing, #11):** the deterministic artifact + `:check` is the invariant gate (the `hero-effect-coverage` precedent); the dashboard overlay-join test pins the present/absent/by-key behavior. **Cat-8 (Extensibility):** third of three consumers; reads the same channel WP-257 emits and WP-258 already rendered. The one open judgment — CI-affordability of running games per-PR — is pre-resolved with the documented cron fallback (D-24002 precedent), so no RISK rises to a scope change → CONFIRM.

> **Drafting status (per 01.0a):** WP + EC-290 written; pre-flight READY; copilot CONFIRM; lint 21/21; D-24035 reserved; session prompt written. Ready for execution against the locked requirement (the executor scaffold-confirms the seed/axes/cap and records them).

## Definition of Done

### Pre-merge Done
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes the artifact; `pnpm sim:runtime-observed:check` 0 (and a re-run is byte-identical); dashboard `test` 0; dashboard `typecheck` (`vue-tsc`) 0
- [ ] `docs/ai/coverage/runtime-observed-hollows.json` committed (`schemaVersion: 1`, sorted keys, `generatedFrom` recording seed/games/matrix)
- [ ] `packages/**` diff empty; `data/cards/**` byte-unchanged; no `/api/coverage`; no engine/registry/server import into the dashboard
- [ ] The freshness gate is wired (CI `:check` step/job, OR the scheduled-cron fallback) — the executor records which + why
- [ ] No files outside `## Files Expected to Change` modified (the gitignored `src/data/runtime-observed-hollows.json` correctly absent from the commit)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-259 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-290 Done; `docs/05-ROADMAP-MINDMAP.md` WP-259 node added; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/DECISIONS.md` D-24035 flipped to Active
- [ ] `docs/ai/STATUS.md` records the change with **D-24026 pending deploy verification** (PR/SHA candidate noted)

### Post-deploy Done (D-24026)
- [ ] On dashboard.legendary-arena.com `/coverage` (post-deploy): the runtime-observed overlay renders, visually distinct from the static status, for ≥1 mechanic the sweep encountered hollow
- [ ] `docs/ai/STATUS.md` updated with the **deployed SHA + evidence** (only now is D-24026 satisfied)
