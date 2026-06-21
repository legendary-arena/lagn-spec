# EC-290 — Runtime-Observed Hollow-Effect Coverage Overlay (Execution Checklist)

**Source:** docs/ai/work-packets/WP-259-runtime-observed-coverage-overlay.md
**Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs` + the committed artifact) + Dashboard (`apps/dashboard`)

## Before Starting
- [ ] WP-257 is on `main` (`G.diagnostics.hollowEffects` + `HollowEffectRecord` + `HOLLOW_EFFECTS_CAP = 256` exist; D-24033/D-24034)
- [ ] **WP-263 ✅ on `main` (D-24039)** — surfaces the runtime-only diagnostics as additive sibling fields `cell.hollowEffects` / `cell.hollowEffectsDropped` on `SweepCellResult`; the harness reads those off the `onCellComplete` callback, NOT a finished `G`. **Folded-inline amendment (2026-06-18):** committed artifact = fast random-policy recorded **zero-state** gated per-PR by `sim:runtime-observed:check`; the heavier competent-play sweep is deferred to a scheduled cron (the D-24035 CI-affordability fallback). Locked values: `runSeed = 'wp259-runtime-observed-v1'`, `policy = random`, 1 game over `core/legacy-virus-the` + `core/dr-doom` + `core/brotherhood` + `core/savage-land-mutates` + five `wwhk` heroes.
- [ ] `sweep.runner.ts` exports `sweepSetupMatrix` (the bounded deterministic sweep driver)
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 (**baseline — check this is green BEFORE coding**; the WP-229/230 vue-tsc drift)

## Locked Values (do not re-derive)
- Artifact path: `docs/ai/coverage/runtime-observed-hollows.json`; `schemaVersion: 1`; keys in `byMechanic` **sorted deterministically**; `examples[]` sorted then bounded per mechanic.
- **Engine import = compiled dist, never source:** import `sweepSetupMatrix` from `../packages/game-engine/dist/simulation/sweep.runner.js` (verified exported) after `pnpm -r build`, exactly as `hero-effect-coverage.mjs` / `hero-mechanic-ledger.mjs` import `../packages/game-engine/dist/**`. Do NOT import `packages/**/*.ts` under plain `node`; do NOT edit `packages/**` to make an import resolve. Real signature is the 9-arg form `(baseSetupConfig, playerCount, schemeIds, mastermindIds, registry, buildPolicies, runSeed, onCellComplete, shouldSkipCell)` — read it off the dist; it is NOT `(seed, axes, callback)`.
- JSON serialization is locked: two-space indentation, one trailing newline, sorted `byMechanic` keys, **closed-order** `byReason` keys (`no-handler`, `unsupported-keyword`, `parse-unrecognized`), sorted/bounded `examples`, and no generated timestamp / path / locale value / `Math.random` / clock.
- Shape: `{ schemaVersion, generatedFrom: { runSeed, gamesPlayed, matrixDescription }, summary: { distinctMechanics, totalObservations, hollowEffectsDropped, byReason }, byMechanic: { <mechanic>: { hitCount, lastSeenTurn, byReason, examples: [{ cardId, cardType, timing, reason }] } } }`. `byReason` always carries all three closed keys (even at `0`).
- `summary.hollowEffectsDropped` = aggregate of `G.diagnostics?.hollowEffectsDropped ?? 0`. Per-PR `:check` gate requires it to be `0`; non-zero ⇒ undercount ⇒ adjust bound/matrix or use the cron fallback.
- `reason` is the closed WP-257 hollow set: `'no-handler' | 'unsupported-keyword' | 'parse-unrecognized'` — the harness COUNTS records the engine already classified; it never re-classifies.
- `HollowEffectRecord` is the engine type (cardId, cardType `'hero'|'villain'|'henchman'`, timing, mechanic, reason, turn) — reused, NOT a parallel shape.
- npm scripts: `sim:runtime-observed` (`node scripts/runtime-observed-hollows.mjs`) + `sim:runtime-observed:check` (`… --check`), in the `sim:coverage` / `ledger:heroes:check` style.
- `runSeed` / `gamesPlayed` / `matrixDescription` are **execution-time** values: SET them, RECORD them in `generatedFrom`, and **scaffold-confirm by an observed run**. The EC locks the requirement (deterministic, bounded, committed, `:check`-gated, CI-affordable), NOT the literals.
- Dashboard build-time copy: gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` (mirrors `coverage-ledger.json`); copied by `build-coverage-ledger.mjs`.

## Guardrails
- **Engine never writes the artifact** — the ledger/overlay is derived strictly downstream from `G.diagnostics.hollowEffects` (§6.2 / §9). `packages/**` diff is **empty**; no engine/registry edit; no new move/rule.
- **Import = engine dist, not `.ts` source** — `../packages/game-engine/dist/simulation/sweep.runner.js` after `pnpm -r build`; never `packages/**/*.ts` under plain `node`, never an edit to `packages/**` to force resolution. If `sweepSetupMatrix` is absent from a clean dist, STOP (boundary issue), do not work around it.
- **Determinism is load-bearing** — fixed `runSeed` + bounded sweep ⇒ **byte-identical** artifact ⇒ `--check` (exit 1 when a clean re-run produces non-byte-identical JSON, mirroring `hero-effect-coverage`). NO `Math.random` / clock / network / timestamp in the harness (randomness lives in the engine via `ctx.random.*`); one locked serializer path (sorted keys, closed-order reasons, sorted/bounded examples, two-space indent, one trailing newline).
- **Harness reads, never re-detects** — read `G.diagnostics?.hollowEffects ?? []` **and** `G.diagnostics?.hollowEffectsDropped ?? 0` off each finished game; do NOT re-implement hollow classification.
- **Minimum signal + no undercount** — pick the smallest deterministic, CI-affordable matrix that surfaces a meaningful runtime signal (preferably ≥1 `byMechanic`); a true zero-state is recorded in `matrixDescription` + STATUS, not forced away by inflating the matrix. `summary.hollowEffectsDropped` MUST be `0` in the committed per-PR artifact.
- **Boundary-based stops only** — make the smallest deterministic choice for ordinary implementation details; STOP only for a boundary change (edit `packages/**`, touch `data/cards/**`, add `/api/coverage` or any endpoint, add a dep, change the WP-257 shape, widen the contract, import engine/registry/server into the dashboard, or a CI strategy that fails affordability+freshness — where the cron fallback is the resolution, not a stop).
- **Dashboard reads JSON only** — no `@legendary-arena/game-engine` / `registry` / `server` / `pg` import; **NO `/api/coverage`** (static-bundle / mock-mode-first).
- **Overlay is visually distinct** from the static `executable / unsupported / unmarked / deferred` status, with a per-mechanic "not observed in play" empty state.
- **`vue-tsc --noEmit` green** — the dashboard-typecheck-drift recurrence (only the explicit `typecheck` script type-checks; `vite build` + `node:test` do not).
- **CI-affordability fallback** — if a per-PR `:check` running games is too heavy, wire a scheduled cron instead (the D-24002 `roadmap-counts.yml` / `sweep-weekly.yml` precedent). Record which + why.
- **No `.reduce()` with branching** in the aggregation — explicit `for...of`.

## Required `// why:` Comments
- The fixed `runSeed` (why this seed; why determinism ⇒ a stable diffable artifact)
- The deterministic key-sort (stable diff for `--check`)
- The engine **dist** import path (why dist not `.ts` source — plain `node` can't resolve `.ts`; importing the build output preserves the `packages/**` empty-diff boundary, the `hero-effect-coverage.mjs` precedent)
- The `hollowEffectsDropped` aggregation (why dropped records would make hit counts a lower bound rather than exact)
- The harness reads-not-writes posture (the engine emits; tooling consumes — the §6.2 / §9 boundary)
- The `--check` exit-1-on-drift contract (mirrors `hero-effect-coverage`)

## Files to Produce
- `scripts/runtime-observed-hollows.mjs` — **new** — fixed-seed bounded sim-harvest → aggregate → write artifact; `--check` / `--update-baseline`
- `docs/ai/coverage/runtime-observed-hollows.json` — **new** — canonical committed artifact (`schemaVersion: 1`)
- `package.json` (root) — **modified** — add `sim:runtime-observed` + `sim:runtime-observed:check`
- `.github/workflows/ci.yml` — **modified** — freshness `:check` step in the `hero-effect-coverage` job (or new job / scheduled cron per the fallback)
- `apps/dashboard/src/types/coverage.ts` — **modified** — `RuntimeObservedEntry` + summary types
- `apps/dashboard/src/composables/useCoverageLedger.ts` — **modified** — load + expose `runtimeObservedByMechanic`
- `apps/dashboard/src/composables/useCoverageLedger.test.ts` — **modified** — overlay join (present / absent / by-key)
- `apps/dashboard/src/pages/coverage/CoveragePage.vue` — **modified** — render the overlay, visually distinct, with per-mechanic empty state
- `apps/dashboard/scripts/build-coverage-ledger.mjs` — **modified** — also copy the new artifact into `src/data`
- `apps/dashboard/src/data/runtime-observed-hollows.json` — **new, gitignored** — build-time copy (absent from the commit — correct)
- `apps/dashboard/.gitignore` — **modified** — ignore the new data file
- `apps/dashboard/package.json` — **modified ONLY** under the §C Alternative (a new prebuild step); unchanged if `build-coverage-ledger.mjs` is extended (Primary)
- `apps/dashboard/src/types/coverage.drift.test.ts` — **modified ONLY IF** a closed array is added to `types/coverage.ts`

## Closure Gates
**Pre-merge:**
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes the artifact; `pnpm sim:runtime-observed:check` 0 (re-run byte-identical); dashboard `test` 0; dashboard `typecheck` 0
- [ ] `git diff --name-only -- data/cards/ packages/` empty; the artifact committed with `generatedFrom` (seed/games/matrix), `summary.hollowEffectsDropped: 0`, closed-order `byReason`; the harness imports the engine **dist**, not `.ts` source
- [ ] No `/api/coverage`; no engine/registry/server import into the dashboard; gitignored `src/data/runtime-observed-hollows.json` absent from the commit
- [ ] Freshness gate wired (CI `:check` step/job OR scheduled cron) — record which + why
- [ ] `docs/ai/DECISIONS.md` D-24035 → Active; `docs/ai/STATUS.md` records **D-24026 pending deploy verification** (PR/SHA candidate)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-259 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-290 Done; `docs/05-ROADMAP-MINDMAP.md` WP-259 node; `node scripts/roadmap-counts.mjs --check` passes

**Post-deploy (D-24026 — only after the deploy lands):**
- [ ] On dashboard.legendary-arena.com `/coverage`, the runtime-observed overlay renders, visually distinct from the static status, for ≥1 sweep-encountered hollow mechanic — OR, if the artifact is a recorded zero-state, the visually distinct "not observed in play" empty state renders
- [ ] `docs/ai/STATUS.md` updated with the **deployed SHA + evidence** (only now is D-24026 satisfied)

## Common Failure Smells
- The harness imports `packages/game-engine/src/**/*.ts` under plain `node` and fails with ESM/extension errors → import the compiled dist (`dist/simulation/sweep.runner.js`) after `pnpm -r build`; do NOT edit `packages/**` to make the import work.
- The harness call to `sweepSetupMatrix` uses a 3-arg `(seed, axes, callback)` shape → wrong; it is the 9-arg form — read the real signature off the dist.
- `summary.hollowEffectsDropped > 0` in the committed artifact → undercount; reduce the bound / adjust the matrix / move the heavier sweep to the cron fallback.
- `byReason` omits zero-count reason keys → unstable schema/type shape; always emit all three closed WP-257 reasons.
- `examples[]` differs between clean re-runs → example sorting/truncation is nondeterministic (sort deterministically *before* bounding).
- `sim:runtime-observed:check` fails on a clean re-run → a non-deterministic source crept in (unsorted keys, unbounded `examples`, a clock/`Math.random`/timestamp), or the seed isn't actually fixed.
- A `packages/**` entry appears in the diff → the harness tried to write from the engine, or the channel/`HollowEffectRecord` was edited; the engine must only EMIT.
- `vue-tsc` errors after the change → a closed array was added to `types/coverage.ts` without updating `coverage.drift.test.ts`, or a type was widened.
- The overlay looks identical to static status → "visually distinct" not satisfied; the runtime-observed signal must be its own badge/column.
- A `/api/coverage` fetch appears → the static-bundle convention was broken; the dashboard reads the committed JSON via build-time copy only.
- STATUS.md claims D-24026 live-verified before the deploy landed → pre-merge close must say "pending deploy verification."
