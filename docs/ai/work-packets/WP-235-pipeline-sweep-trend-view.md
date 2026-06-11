# WP-235 — Pipeline Page Sweep Health Trend View (Cadence-Aware Health-Rate Trends + Healthy-Class Constant)

**Status:** Draft
**Primary Layer:** App (`apps/dashboard/**` only). No Game Engine / Registry / Server / migration change — the sweep read endpoint (`GET /api/sweep/latest`), the `sweep_runs` store, and the engine taxonomy are reused unchanged. This WP **amends one locked architectural contract** (D-20703 opaque-anomaly-key posture) with a single narrow, documented exception (D-23503) — it does NOT import `SweepAnomalyClass` and keeps every other anomaly key opaque.
**Dependencies:** WP-230 (`useSweepHealth` + the Pipeline page sweep wiring + the `sweepHealthRate` Architect-lane input + `deriveTrendDirection`) ✅, WP-209 (`GET /api/sweep/latest` returning `{ latest, recentRuns[≤30] }`) ✅, WP-195 (the 4-class anomaly taxonomy — `endgame-reached` is the healthy class) ✅, WP-204 (the dashboard ECharts surface `BaseChart.vue`) ✅, WP-234 (the weekly full-corpus sweep + its `-weekly-w<windowIndex>` runId grammar) ✅. Parallel-safe with WP-231/232/233/236 (App-layer-only).

---

## Goal

After this session the dashboard's Pipeline page renders a **cadence-aware sweep health-rate trend**: a multi-run chart of the per-run **health rate** (`endgame-reached ÷ cellCount` — the fraction of swept cells that reached a clean endgame) across the last 30 sweep runs, with the **daily 2×2 smoke** runs and the **weekly full-corpus** runs (WP-234) plotted as distinct series. The trend reuses the existing `recentRuns` payload (`GET /api/sweep/latest` → `useSweepHealth`) — no new endpoint, server function, or migration.

To make a health rate computable at all, this WP introduces a **single documented healthy-class constant** in the dashboard (`SWEEP_HEALTHY_ANOMALY_KEY = 'endgame-reached'`) and a single `computeSweepHealthRate(run)` helper that is the **sole source of truth** for the sweep health rate. The same helper **repairs the two pre-existing degenerate health-rate computations** (the Pipeline health KPI and the Architect-lane `< 80%` trigger), which today evaluate to a structural `0%` on live data because they subtract the sum of **all** anomaly classes (which equals `cellCount` — see Context). Cadence is derived from the `-weekly-w<windowIndex>` runId suffix so the operator can read whether the deep weekly sweep's health is trending up or down across the rotation cycle, and which window each weekly run covered.

---

## Assumes

- WP-230 complete. `apps/dashboard/src/composables/useSweepHealth.ts` exposes `recentRuns: ComputedRef<readonly SweepRunSummary[]>` (≤ 30, most-recent-first) and is a pure function of `(fetchStateGetter, currentTimeMs)`; `apps/dashboard/src/composables/useAgentPipeline.ts` computes `sweepHealthRate` (currently `(cellCount - sumAllAnomalyKeys)/cellCount`, line ~513) feeding the Architect lane; `apps/dashboard/src/pages/pipeline/PipelinePage.vue` computes `sweepHealthPercent` (same formula, line ~145) feeding the health-color KPI, samples `Date.now()` once at the render boundary, and renders a sweep summary bar + sparkline.
- WP-209 complete. `GET /api/sweep/latest` (authenticated-session) returns `{ data: { latest, recentRuns } }`; `SweepRunSummary = { runId, submittedAt, startedAt, cellCount, anomalyCounts: Record<string, number> }` (keys widened to `string`, D-20703).
- WP-195 complete. `classifyManifestRecords` assigns **every** cell to exactly one of the 4-class taxonomy (`endgame-reached`, `not-endgame`, `escaped-villain-cap`, `fatal`); `summary.totalCells === records.length` and `sum(anomalyCounts) === totalCells` (verified at `packages/game-engine/src/simulation/sweep.analyze.ts:766–799`). The stored `cellCount === sum(anomalyCounts)`. `endgame-reached` is the clean-endgame (healthy) class.
- WP-234 complete. Weekly runIds end `-weekly-w<windowIndex>`; daily smoke runIds have no suffix.
- WP-204 complete. `apps/dashboard/src/components/charts/BaseChart.vue` wraps `vue-echarts`/`echarts` (already deps — no new dep).
- `apps/dashboard` has `test`, `typecheck` (`vue-tsc --noEmit`), and `build` scripts; the executor records the baseline (incl. any pre-existing `vue-tsc` errors) at session start.

Baseline: `origin/main @ 41dcdce`.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Session Context

WP-230 wired sweep data into the Pipeline page and WP-234 added a **weekly full-corpus sweep** alongside the daily 2×2 smoke. Two facts from those sessions converge here:

**1. The current "health rate" is structurally degenerate.** The WP-195 classifier assigns every swept cell to exactly one of the 4 anomaly classes, so `sum(anomalyCounts) === cellCount` for every stored run. Both existing health-rate sites compute `(cellCount − Σ all anomaly keys) ÷ cellCount` — which is therefore **identically 0** on live data. It only *looks* plausible in MOCK mode because the mock fixtures don't satisfy the invariant. The root cause is the D-20703 opacity posture: the dashboard sums anomaly counts across **all** keys generically and, by contract, may not single out the healthy class. A meaningful health rate is **structurally impossible under pure opacity** — you cannot compute "fraction healthy" without naming the healthy class. (The current `totalAnomalySparkline`, locked by D-20703 as an opaque all-keys sum, is likewise `=== cellCount` per run; it is left unchanged — its repair/rename is out of scope here.)

**2. Two cadences now share `sweep_runs`.** Daily smoke = 4 cells; weekly full-corpus = ≤ 2,120 cells. A naive raw-count trend is a meaningless sawtooth. WP-234 deliberately made the weekly runId disjoint (`-weekly-w<N>`) so the cadences are distinguishable in `sweep_runs` ("an operator can audit the rotation from `sweep_runs` alone" — D-23402). WP-235 consumes that suffix to plot daily and weekly as distinct series; the health **rate** (a fraction ∈ [0,1]) is already magnitude-normalized, so it is comparable across the 4-cell and ~2,120-cell cadences.

**The fix (operator decision — option 2):** introduce a **single documented healthy-class constant** (`SWEEP_HEALTHY_ANOMALY_KEY = 'endgame-reached'`) — the narrowest possible exception to D-20703 (one string literal; no `SweepAnomalyClass` import; all other keys stay opaque and render verbatim) — and a single `computeSweepHealthRate(run)` helper that is the **sole source of truth**. The trend consumes it; the two degenerate sites are repaired to consume it; D-23503 records the exception and supersedes the degenerate formula. `endgame-reached` is the healthy class; the other three (including `escaped-villain-cap`) are treated as non-healthy (escaped-villain-cap is a deliberately-flagged anomaly class — WP-195). If the operator later wants `escaped-villain-cap` counted as healthy, that is a one-line constant change, noted in D-23503.

**Scope note (expanded from the original draft).** The WP-235 placeholder framed a "trend view" and the first draft scoped an aggregate anomaly-rate trend — which the metric review correctly exposed as degenerate. Option 2 expands the WP to also introduce the healthy-class constant and repair the two existing degenerate health-rate sites (so there is exactly one health-rate definition, no drift). This crosses no layer boundary (App only) but amends one contract and touches ~14 files. If execution finds the bundle too large, the healthy-class-constant + degenerate-site repair is cleanly separable as a prerequisite WP; it is drafted here as one cohesive packet per the operator's option-2 decision.

**Pre-existing dashboard typecheck drift (read before coding).** Dashboard `vue-tsc` errors have shipped to `main` because `typecheck` was not in prior WP DoDs. `typecheck` (`vue-tsc --noEmit`) is an **explicit DoD + Acceptance Criterion** here; the executor records the baseline at session start and must add no new error.

---

## Scope (In)

### A) Healthy-class constant + single health-rate source of truth (`apps/dashboard/src/composables/useSweepHealth.ts` — MODIFIED)

- Add the exported constant `SWEEP_HEALTHY_ANOMALY_KEY = 'endgame-reached'` and the exported pure helper `computeSweepHealthRate(run: SweepRunSummary): number | null` → `cellCount > 0 ? (healthyCount / cellCount) : null`, where `healthyCount = Number.isFinite(run.anomalyCounts[SWEEP_HEALTHY_ANOMALY_KEY]) && run.anomalyCounts[...] >= 0 ? run.anomalyCounts[...] : 0` (a missing/malformed healthy key reads 0; a 0-cell run yields `null`, not `NaN`). This is the **sole** health-rate definition in the dashboard.
- Expose `healthRate: ComputedRef<number | null>` (latest run) and `healthRateSparkline: ComputedRef<readonly (number | null)[]>` (per `recentRuns`, oldest-handling per the existing sparkline convention) from `useSweepHealth`, alongside the existing projections. The existing `totalAnomalySparkline` (opaque all-keys sum, D-20703) is **unchanged**.
- A `// why:` documents the D-23503 narrow exception (the dashboard names the single healthy-class key; it does NOT import `SweepAnomalyClass`; all other keys remain opaque) and the engine-coupling drift note (if the engine renames the healthy class, this one constant must update).

### B) Repair the two degenerate health-rate sites (MODIFIED)

- `apps/dashboard/src/composables/useAgentPipeline.ts` — replace the `(cellCount - sumAllAnomalyKeys)/cellCount` computation (line ~513) with `computeSweepHealthRate(latestSweepRun)`. The Architect-lane `< 0.8` trigger and `${healthPercent}%` label are otherwise unchanged.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — replace the `sweepHealthPercent` formula (line ~145) with the helper (× 100, rounded). The `sweepTotalAnomalies` computed (the opaque all-keys sum) may remain if still used by the existing sparkline, but it is **no longer** the health-rate input.

### C) Cadence + trend derivation (`apps/dashboard/src/composables/useSweepTrend.ts` — NEW)

- Pure helper `classifyRunCadence(runId)` → `{ cadence: 'weekly' | 'daily', windowIndex: number | null }`: a runId matching `/-weekly-w(\d+)$/` is `weekly` with the parsed `windowIndex`; otherwise `daily` (`windowIndex = null`). Operates on the runId **string grammar only** (WP-209 + WP-234 contract) — never the anomaly taxonomy or `cellCount` magnitude.
- Pure helper `deriveSweepTrendPoints(recentRuns)` → `readonly SweepTrendPoint[]` ordered **oldest → newest** (reversing the server's most-recent-first order; equal-timestamp ties preserve input order, stable). `SweepTrendPoint = { runId, submittedAt, submittedAtMs, cadence, windowIndex, cellCount, healthRate }` where `submittedAtMs = Date.parse(submittedAt)` (a pure deterministic parse — NOT a wall-clock read) and `healthRate = computeSweepHealthRate(run)`.
- Pure helper `deriveSweepTrendSeries(points)` → `{ daily: readonly SweepTrendPoint[], weekly: readonly SweepTrendPoint[] }` (explicit `for...of` partition by cadence). The **composable owns the cadence split**; the chart never re-derives it.
- A thin `useSweepTrend(recentRunsGetter)` composable wrapping the helpers into `ComputedRef`s, mirroring `useSweepHealth`'s purity (no internal `Date.now()`).
- No `.reduce()`; explicit `for...of`/`.map`/`.filter`; `// why:` on the cadence-from-runId derivation (D-23502).

### D) Trend chart component (`apps/dashboard/src/components/charts/SweepTrendChart.vue` — NEW)

- Consumes the `{ daily, weekly }` series (props), assembles a declarative `EChartsOption`, renders via `BaseChart.vue`. Plots `healthRate` over the `submittedAtMs` time axis with **daily** and **weekly** as two distinct series. **Locked chart behavior:** y-axis bounded `[0, 1]` (true health-rate semantics); `connectNulls: false` (no interpolation bridging gaps); the time axis is consumed as a consistent monotonic `submittedAtMs` (no reformatting beyond display labels). Tooltip surfaces, in locked order: `[timestamp, cadence, windowIndex?, healthRate%, cellCount]`. Weekly points may render with a larger `symbolSize` (recommendation, not locked).
- **Empty state (locked):** when both series are empty (`points.length === 0`), the component renders no chart container (returns null) — the page owns empty/loading/error messaging.
- No hardcoded anomaly-taxonomy key other than the single `SWEEP_HEALTHY_ANOMALY_KEY` (imported from `useSweepHealth`, not re-declared).

### E) Pipeline page wiring (`apps/dashboard/src/pages/pipeline/PipelinePage.vue` — MODIFIED, with B)

- Inline-render `SweepTrendChart` in the existing sweep section (below the summary bar), gated on `hasSweepData`. Derive the series via `useSweepTrend` from the existing `recentRuns` (no new fetch, no new `Date.now()` read).

### F) Mock cadence mix (`apps/dashboard/src/services/sweepHealthMocks.ts` — MODIFIED)

- The 30 deterministic mock runs become a daily + weekly mix: **every 6th run is a weekly run** with a `-weekly-w<N>` runId (`N` cycling 0–9) and `cellCount` ~2,000; the rest are daily-style (small `cellCount`, no suffix). Each run's `anomalyCounts` **includes the `endgame-reached` key** with a realistic value so the health rate is meaningful and varied in MOCK mode. Deterministic seeding + 36h-freshness spacing preserved.

### G) Tests (NEW `useSweepTrend.test.ts` + MODIFIED `useSweepHealth.test.ts`, `useAgentPipeline.test.ts` as needed)

- `node:test` cases (≥ 10): `classifyRunCadence` weekly/daily/edge; `deriveSweepTrendPoints` oldest→newest ordering, `submittedAtMs` parse, `healthRate` computation, the 0-cell `null` guard, **stable order under identical timestamps**, a mixed daily+weekly input, an empty input; `deriveSweepTrendSeries` partition; `computeSweepHealthRate` (healthy fraction, missing-key→0, **non-numeric `anomalyCounts` entry ignored**, 0-cell→null); a mock-data assertion that `sweepHealthMocks` contains both cadences and the `endgame-reached` key. Update `useSweepHealth.test.ts` for the new `healthRate`/`healthRateSparkline` projections and `useAgentPipeline.test.ts` if the `sweepHealthRate` computation site moved.

### H) Decisions

- Reserve **D-23501** (trend view is a client-side projection over the existing 30-run `recentRuns`; reuses `GET /api/sweep/latest` + `useSweepHealth` + `BaseChart.vue`; inline; no new endpoint/server/migration/dep), **D-23502** (cadence segmentation from the `-weekly-w<N>` runId suffix grammar; the trend metric is the per-run **health rate** ∈ [0,1], daily/weekly as distinct series, y-axis `[0,1]`, `connectNulls:false`), and **D-23503** (the narrow D-20703 exception: a single healthy-class constant `'endgame-reached'` + the `computeSweepHealthRate` sole-source-of-truth helper, superseding the degenerate `(cellCount − Σ all keys)/cellCount` formula at both sites; no `SweepAnomalyClass` import; all other keys remain opaque).

---

## Out of Scope

- **Renaming / repairing `totalAnomalySparkline`** — it stays the D-20703-locked opaque all-keys sum (which `=== cellCount`); its misleading "anomaly" semantics are a separate cleanup, not this WP.
- **A per-anomaly-class composition breakdown** (one series per opaque key) — deferred (§Future Work); v1 plots the single health-rate line per cadence.
- **New-vs-resolved-per-run + Builder-velocity analytics** — deferred (§Future Work).
- **A dedicated Trends tab / route** — render inline in the existing sweep section.
- **Any new HTTP endpoint, server function, `sweep_runs` column, or migration** — pure client projection over the existing `recentRuns`.
- **A new charting dependency** — reuse `echarts`/`vue-echarts` via `BaseChart.vue`.
- **Importing `SweepAnomalyClass` or widening the D-20703 exception beyond the single healthy key** — exactly one string literal is named; everything else stays opaque.
- **Counting `escaped-villain-cap` as healthy** — v1 healthy = `endgame-reached` only (one-line change if revisited; noted in D-23503).
- **Changing the 30-run LIMIT**; **parsing the `manifestBlob`** (dashboard read path is blob-free).
- Engine / Registry / Server / Pre-Plan changes; cross-repo work.

---

## Files Expected to Change

- `apps/dashboard/src/composables/useSweepHealth.ts` — modified (`SWEEP_HEALTHY_ANOMALY_KEY` + `computeSweepHealthRate` SoT + `healthRate`/`healthRateSparkline`; `totalAnomalySparkline` unchanged; D-23503 `// why:`)
- `apps/dashboard/src/composables/useSweepHealth.test.ts` — modified (health-rate + healthy-key cases)
- `apps/dashboard/src/composables/useSweepTrend.ts` — new (`classifyRunCadence`, `deriveSweepTrendPoints`, `deriveSweepTrendSeries`, `useSweepTrend`; no `.reduce()`)
- `apps/dashboard/src/composables/useSweepTrend.test.ts` — new (≥ 10 `node:test` cases)
- `apps/dashboard/src/composables/useAgentPipeline.ts` — modified (`sweepHealthRate` uses `computeSweepHealthRate`)
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — modified if the health-rate computation site moved (otherwise unchanged — its tests inject `sweepHealthRate` directly)
- `apps/dashboard/src/components/charts/SweepTrendChart.vue` — new (ECharts health-rate trend via `BaseChart.vue`; daily/weekly series; y `[0,1]`; `connectNulls:false`)
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — modified (`sweepHealthPercent` uses the helper + inline-render the trend chart)
- `apps/dashboard/src/services/sweepHealthMocks.ts` — modified (daily/weekly cadence mix + `endgame-reached` key present)
- `docs/ai/DECISIONS.md` — modified (D-23501 + D-23502 + D-23503 reserved → Active at close; D-20703 amendment note)
- `docs/ai/STATUS.md` — modified (Done entry, at close)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-235 → Done, at close)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-268 → Done, at close)
- `docs/05-ROADMAP-MINDMAP.md` — modified (WP-235 📝 → ✅, at close)

~14 files at execution: 9 App-layer source/test + 5 governance. No engine/server/registry/migration change, no new endpoint, no new dependency. (An additive `apps/dashboard/src/types/sweep.ts` `SweepTrendPoint` export is permitted — same layer.)

---

## Locked Contract Values

- **Healthy-class constant (locked, D-23503):** `SWEEP_HEALTHY_ANOMALY_KEY = 'endgame-reached'`. Exactly one named string literal; NO `SweepAnomalyClass` import; all other anomaly keys remain opaque and render verbatim.
- **Health rate (locked):** `computeSweepHealthRate(run) = cellCount > 0 ? healthyCount / cellCount : null`, `healthyCount = (Number.isFinite(anomalyCounts['endgame-reached']) && anomalyCounts['endgame-reached'] >= 0) ? anomalyCounts['endgame-reached'] : 0`. ∈ [0,1] (or `null` for a 0-cell run — never `NaN`). This single helper is the SoT consumed by the trend, the Pipeline health KPI, and the Architect-lane trigger.
- **Cadence grammar (locked):** `classifyRunCadence(runId)` matches `/-weekly-w(\d+)$/` → `{ cadence:'weekly', windowIndex:<int> }`; else `{ cadence:'daily', windowIndex:null }`. runId string only; never `cellCount` magnitude or the taxonomy.
- **Series partition (locked):** `useSweepTrend` provides cadence-separated series (`daily`, `weekly`); the UI MUST NOT re-derive the cadence split.
- **Ordering (locked):** `deriveSweepTrendPoints` returns points oldest → newest; identical `submittedAt` ties preserve input order (stable).
- **Time axis (locked):** `submittedAtMs = Date.parse(submittedAt)` (pure, deterministic); the chart consumes a consistent monotonic time axis; no reformatting beyond display labels.
- **Series continuity (locked):** `connectNulls = false`; no interpolation across gaps.
- **Y-axis (locked):** the health-rate axis is bounded `[0, 1]` (true rate semantics).
- **Empty state (locked):** zero points renders no chart container (page owns messaging).
- **Tooltip (locked order):** `[timestamp, cadence, windowIndex?, healthRate%, cellCount]`.
- **Mock cadence (locked):** every 6th run is a weekly run (`-weekly-w<N>`, `N` cycles 0–9, `cellCount` ~2,000); all runs carry the `endgame-reached` key.
- **Data source (locked):** the existing `recentRuns` (≤ 30) from `useSweepHealth`/`GET /api/sweep/latest`; no new fetch/endpoint/store/migration; 30-run LIMIT unchanged.
- **Charting (locked):** reuse `BaseChart.vue` (ECharts); inline; no new dependency; no new route.
- **Purity (locked):** `useSweepTrend` + helpers are pure functions of inputs — no internal `Date.now()`.

---

## Acceptance Criteria

1. `computeSweepHealthRate({ cellCount: 100, anomalyCounts: { 'endgame-reached': 80, 'not-endgame': 20 } })` → `0.8`; a 0-cell run → `null`; a missing `endgame-reached` key → `0`; a non-numeric `endgame-reached` value → treated as `0` (no `NaN`) — verified by unit tests.
2. `computeSweepHealthRate` is the SOLE health-rate definition: the Pipeline health KPI (`sweepHealthPercent`) and the Architect-lane `sweepHealthRate` both call it; grep finds no surviving `(cellCount - …)/cellCount` health-rate formula in `PipelinePage.vue` / `useAgentPipeline.ts`.
3. `classifyRunCadence('abc-…Z-weekly-w7')` → `{ cadence:'weekly', windowIndex:7 }`; `classifyRunCadence('abc-…Z')` → `{ cadence:'daily', windowIndex:null }` — verified by unit tests (incl. a non-matching edge runId).
4. `deriveSweepTrendPoints(recentRuns)` returns points oldest → newest with `submittedAtMs`, `cadence`, `windowIndex`, `cellCount`, `healthRate`; identical timestamps preserve input order — verified by unit tests (incl. the stable-order case).
5. `deriveSweepTrendSeries(points)` partitions into `{ daily, weekly }` with no loss and no cross-contamination — verified by a unit test over a mixed input.
6. The chart plots `healthRate` over `submittedAtMs` with daily + weekly as distinct series, y-axis bounded `[0,1]`, `connectNulls:false`, tooltip in the locked order — verified by the assembled `EChartsOption` (series count = 2 keyed by cadence; `yAxis.min===0`, `yAxis.max===1`; `connectNulls===false`).
7. Empty `recentRuns` → `deriveSweepTrendPoints` returns `[]` and the chart renders no container — verified by unit test + a `points.length===0` gating assertion.
8. MOCK mode shows a daily + weekly mix (runIds with and without `-weekly-w<N>`, weekly `cellCount` larger) and every run carries `endgame-reached` so the health rate varies — verified by a mock-data assertion test.
9. D-20703 exception is narrow: no `SweepAnomalyClass` import in `apps/dashboard`; the ONLY named taxonomy literal is `SWEEP_HEALTHY_ANOMALY_KEY = 'endgame-reached'` (declared once); cadence derives from the runId suffix — verified by grep.
10. No new npm dependency; no `apps/server/**`, `packages/**`, `data/migrations/**`, `render.yaml`, `.env.example` change; `GET /api/sweep/latest` reused unchanged — verified by `git diff --name-only` + `git diff package.json apps/dashboard/package.json` (empty).
11. `pnpm --filter @legendary-arena/dashboard test` exits 0 with ≥ 10 net-new cases (all pre-existing green); `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 with NO new error vs baseline; `pnpm --filter @legendary-arena/dashboard build` exits 0.

---

## Verification Steps

```pwsh
# 1. Health-rate SoT + healthy-class constant
Select-String -Path "apps\dashboard\src\composables\useSweepHealth.ts" -Pattern "SWEEP_HEALTHY_ANOMALY_KEY|computeSweepHealthRate|endgame-reached"
# Expected: >= 3 lines
# Degenerate formula gone from both sites:
Select-String -Path "apps\dashboard\src\composables\useAgentPipeline.ts","apps\dashboard\src\pages\pipeline\PipelinePage.vue" -Pattern "cellCount - sweepTotalAnomal|cellCount - .*Anomal.*/ .*cellCount"
# Expected: no output

# 2. Cadence + trend helpers; explicit for...of (no hidden reduce)
Select-String -Path "apps\dashboard\src\composables\useSweepTrend.ts" -Pattern "classifyRunCadence|deriveSweepTrendPoints|deriveSweepTrendSeries|-weekly-w|submittedAtMs"
# Expected: >= 5 lines
(Select-String -Path "apps\dashboard\src\composables\useSweepTrend.ts" -Pattern "\.reduce\(").Count   # Expected: 0
(Select-String -Path "apps\dashboard\src\composables\useSweepTrend.ts" -Pattern "for \(const .* of ").Count   # Expected: >= 1

# 3. Opacity exception is narrow — no engine union import, single literal
Select-String -Path "apps\dashboard\src" -Pattern "SweepAnomalyClass" -Recurse
# Expected: no output
Select-String -Path "apps\dashboard\src" -Pattern "'not-endgame'|'escaped-villain-cap'|'fatal'" -Recurse
# Expected: no output (only 'endgame-reached' is named, once, in useSweepHealth.ts)

# 4. Chart reuses BaseChart; y-axis + continuity locks
Select-String -Path "apps\dashboard\src\components\charts\SweepTrendChart.vue" -Pattern "BaseChart|connectNulls|max: 1|min: 0"
# Expected: >= 3 lines
git diff apps/dashboard/package.json package.json   # Expected: no output

# 5. Mock cadence mix
Select-String -Path "apps\dashboard\src\services\sweepHealthMocks.ts" -Pattern "weekly-w|endgame-reached"
# Expected: >= 2 lines

# 6. Scope boundary — dashboard only
git diff --name-only apps/server/ packages/ data/migrations/ render.yaml .env.example   # Expected: no output

# 7. Tests + typecheck + build
pnpm --filter @legendary-arena/dashboard test 2>&1 | Select-Object -Last 3
pnpm --filter @legendary-arena/dashboard typecheck
pnpm --filter @legendary-arena/dashboard build
```

---

## Definition of Done

- [ ] All 11 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (≥ 10 net-new; pre-existing green)
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 — NO new error vs the baseline recorded at session start
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] `computeSweepHealthRate` is the sole health-rate definition (both degenerate sites repaired; no surviving `(cellCount − Σ keys)/cellCount` health formula)
- [ ] D-20703 exception is narrow: no `SweepAnomalyClass` import; only `'endgame-reached'` named, once
- [ ] No files outside `## Files Expected to Change`; no `apps/server/**`, `packages/**`, `data/migrations/**`, `render.yaml`, `.env.example`; no new dependency
- [ ] `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-23501/02/03 Active + D-20703 amendment note), `docs/ai/work-packets/WORK_INDEX.md` (WP-235 `[x]`), `docs/ai/execution-checklists/EC_INDEX.md` (EC-268 Done), `docs/05-ROADMAP-MINDMAP.md` (WP-235 ✅) updated

---

## Vision Alignment

**Vision clauses touched:** §20-26 (scoring/PAR/simulation — the sweep is QA simulation; this WP visualizes + correctly measures its health), §22 (determinism/replay).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.` Operator-only dashboard read surface. No game logic, RNG sourcing, scoring math, or replay storage changes. No new wall-clock read (helpers are pure functions of `recentRuns`; `Date.parse` over a fixed string is deterministic). The D-20703 exception is an App-layer display-semantics narrowing, not an engine/layer-boundary change (no engine import).

**Non-Goal proximity check:** none of NG-1..7 crossed — operator dashboard only.

**Determinism preservation:** engine + per-cell sweep determinism untouched (§22); the trend + health rate are read-only projections of already-classified `sweep_runs` summaries.

---

## Funding Surface Gate

**N/A — operator dashboard surface only; no global navigation, Registry Viewer, profile/account, or tournament funding affordances; no user-visible monetization copy.** No §20.1 trigger surfaces.

---

## API Catalog Update

**N/A — no HTTP endpoint added, modified, removed, or status-changed.** Reuses `GET /api/sweep/latest` (WP-209, catalogued) with no contract change. §21.1 not triggered.

---

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-10:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections; Out of Scope lists ≥ 8 exclusions (totalAnomalySparkline rename, per-class breakdown, new-vs-resolved/velocity, dedicated tab, new endpoint/dep, SweepAnomalyClass import, escaped-villain-cap-as-healthy, 30-run-LIMIT/blob) |
| 2 | PASS | Locked values explicit: healthy-key constant, health-rate formula + null guard, cadence grammar, series partition, ordering, time axis, continuity, y-axis [0,1], empty state, tooltip order, mock cadence |
| 3 | PASS | WP-230/209/195/204/234 deps with exact reused surfaces + the engine invariant citation (sweep.analyze.ts:766–799) |
| 4 | PASS | useSweepHealth / useAgentPipeline / PipelinePage / sweepHealthMocks / BaseChart / D-20703 / WP-234 runId grammar all cited with line numbers |
| 5 | PASS | ~14 files with disposition; App-layer-only; the contract amendment + degenerate-site repair scope stated; optional `types/sweep.ts` pre-noted |
| 6 | PASS | New names full-word camelCase (`computeSweepHealthRate`, `classifyRunCadence`, `deriveSweepTrendPoints`, `deriveSweepTrendSeries`, `SWEEP_HEALTHY_ANOMALY_KEY`, `submittedAtMs`); `runId`/`cellCount`/`anomalyCounts`/`submittedAt` reused verbatim |
| 7 | PASS | No new npm dep; reuses `echarts`/`vue-echarts` via `BaseChart.vue` |
| 8 | PASS | App layer only; no `@legendary-arena/game-engine` import; the D-20703 exception names ONE string literal, not the engine union (layer boundary preserved) |
| 9 | PASS | PowerShell verification; Vue SFC + TS; `node:test` |
| 10 | PASS | No secrets; reuses the authenticated read endpoint |
| 11 | PASS | Operator-only; `## Out of Scope` is the limitations note |
| 12 | PASS | `node:test`; no boardgame.io; LLM-nondeterministic finding text never asserted (only health-rate math, cadence parse, ordering, mock shape) |
| 13 | PASS | 7 exact verification commands with expected output |
| 14 | PASS | 11 binary, observable acceptance criteria |
| 15 | PASS | DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/ROADMAP + scope-boundary + the SoT-health-rate gate + the explicit `typecheck` gate |
| 16 | PASS | Single-source health-rate helper (no duplicate definitions); reuses `useSweepHealth`/`BaseChart.vue`; explicit `for...of` (no reduce); `// why:` on the D-23503 exception |
| 17 | PASS | `## Vision Alignment` present with clause numbers + no-conflict + determinism-preservation |
| 18 | PASS | Verification greps target literal tokens and a forbidden-token grep scoped to `apps/dashboard/src` (no whole-file token grep a legitimate identifier could self-trip); the `'endgame-reached'` literal is the one allowed named key |
| 19 | N/A | No repo-state-summarizing artifact authored |
| 20 | N/A | Operator dashboard only |
| 21 | N/A | No HTTP endpoint change — `GET /api/sweep/latest` reused |

---

## Future Work Packets (Scoped From This Foundation)

- **Repair / rename `totalAnomalySparkline`** — it is the D-20703 opaque all-keys sum (`=== cellCount`), misleadingly named "anomalies"; a follow-up could replace it with a true anomaly (non-healthy) count using the same healthy-class constant.
- **Per-anomaly-class composition breakdown** — a 100%-stacked trend, one series per opaque key (the healthy key plus the opaque rest), for operators who want the full class composition over time.
- **New-vs-resolved anomaly diff per run** + **Builder-velocity overlay** — cross-run deltas joining `sweep_runs` trends with the WP-232/233 `finding_handoffs` lifecycle.
- **Rotation-coverage view** — use the `-w<windowIndex>` suffix to show which of the 10 weekly windows have run in the current cycle.
