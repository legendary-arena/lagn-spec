# EC-268 — Pipeline Page Sweep Health Trend View (Execution Checklist)

**Source:** docs/ai/work-packets/WP-235-pipeline-sweep-trend-view.md
**Layer:** App (`apps/dashboard/**` only). No engine / server / registry / migration change. Amends one locked contract (D-20703) via a single narrow exception (D-23503).

> Use locked values from WP-235 verbatim. EC-268 is the operational order +
> gates + failure smells; if EC-268 and WP-235 conflict, WP-235 wins.

## Before Starting
- [ ] **WP-230 landed.** `useSweepHealth.recentRuns` (≤ 30, most-recent-first); `useAgentPipeline` computes `sweepHealthRate` (~line 513); `PipelinePage.vue` computes `sweepHealthPercent` (~line 145) + samples `Date.now()` once at the render boundary.
- [ ] **WP-209 read path.** `GET /api/sweep/latest` → `{ latest, recentRuns[] }`; `SweepRunSummary = { runId, submittedAt, startedAt, cellCount, anomalyCounts: Record<string,number> }` (opaque keys, D-20703).
- [ ] **WP-195 invariant confirmed.** Every cell → exactly one of the 4 classes; `sum(anomalyCounts) === cellCount` (sweep.analyze.ts:766–799). `endgame-reached` is the healthy class. (This is WHY the existing `(cellCount − Σ keys)/cellCount` health rate is degenerate ≡ 0.)
- [ ] **WP-234 runId grammar.** Weekly ends `-weekly-w<windowIndex>`; daily has no suffix.
- [ ] **Charting.** `BaseChart.vue` (`vue-echarts`/`echarts`) exists; no new dep.
- [ ] Read WP-235 §Goal, §Session Context, §Scope (In/Out), §Locked Contract Values, §Acceptance Criteria.
- [ ] **Record the baseline:** `pnpm --filter @legendary-arena/dashboard test`, `… typecheck` (`vue-tsc`), `… build` all exit 0; note the pre-existing case count AND any pre-existing `vue-tsc` errors (do NOT fix out of scope; add NO new ones).

## Locked Values (verbatim from WP-235 — do not re-derive)
- **Healthy-class constant (D-23503):** `SWEEP_HEALTHY_ANOMALY_KEY = 'endgame-reached'`. Exactly one named string literal; NO `SweepAnomalyClass` import; all other keys opaque + rendered verbatim.
- **Health rate (SoT):** `computeSweepHealthRate(run) = cellCount > 0 ? healthyCount / cellCount : null`; `healthyCount = Number.isFinite(anomalyCounts['endgame-reached']) && anomalyCounts['endgame-reached'] >= 0 ? anomalyCounts['endgame-reached'] : 0`. ∈ [0,1] or `null` (0-cell), never `NaN`. The SOLE health-rate definition — consumed by the trend, the Pipeline KPI, and the Architect lane.
- **Cadence grammar:** `classifyRunCadence(runId)` → `/-weekly-w(\d+)$/` ⇒ `{cadence:'weekly', windowIndex:<int>}`; else `{cadence:'daily', windowIndex:null}`. runId STRING only — never `cellCount` or the taxonomy.
- **Series partition:** `deriveSweepTrendSeries(points)` → `{daily, weekly}`; the UI MUST NOT re-derive the split.
- **Trend point:** `{ runId, submittedAt, submittedAtMs, cadence, windowIndex, cellCount, healthRate }`; `submittedAtMs = Date.parse(submittedAt)` (pure, deterministic — `submittedAt` is the server's ISO-8601 `toISOString()` string; not a clock read).
- **Ordering:** oldest → newest via a **stable ascending sort on `submittedAtMs`** (NOT a bare `.reverse()`, which inverts ties); identical `submittedAtMs` ties keep the `recentRuns` most-recent-first input order.
- **Chart:** y-axis bounded `[0,1]`; `connectNulls = false`; monotonic `submittedAtMs` time axis (no reformatting beyond labels); tooltip order `[timestamp, cadence, windowIndex?, healthRate%, cellCount]`; empty points ⇒ render no container (page owns messaging).
- **Mock cadence:** every 6th run is weekly (`-weekly-w<N>`, N cycles 0–9, `cellCount` ~2,000); ALL runs carry the `endgame-reached` key.
- **Data source:** existing `recentRuns` (≤ 30); NO new fetch/endpoint/store/migration; 30-run LIMIT unchanged. Charting via `BaseChart.vue`; no new dep; no new route.
- **Purity:** `useSweepTrend` + helpers pure functions of inputs — no internal `Date.now()`.

## Guardrails
- **App layer only.** Touch only `apps/dashboard/**`. No `apps/server/**`, `packages/**`, `data/migrations/**`, `render.yaml`, `.env.example`. No `@legendary-arena/game-engine` import.
- **Narrow D-20703 exception.** Name EXACTLY ONE taxonomy literal (`'endgame-reached'`), declared ONCE in `useSweepHealth.ts`. Never name `not-endgame`/`escaped-villain-cap`/`fatal`; never import `SweepAnomalyClass`; never widen the exception.
- **Single health-rate SoT.** Repair BOTH degenerate sites (`useAgentPipeline.ts` + `PipelinePage.vue`) to call `computeSweepHealthRate`; leave NO surviving `(cellCount − Σ keys)/cellCount` health formula. `totalAnomalySparkline` stays the D-20703 opaque all-keys sum (unchanged).
- **Cadence from the runId suffix ONLY** — never `cellCount` magnitude or the anomaly taxonomy.
- **Rate, not counts.** Plot the health RATE (∈[0,1]); raw counts make the daily/weekly mix a sawtooth.
- **No `.reduce()`** in `classifyRunCadence`/`deriveSweepTrendPoints`/`deriveSweepTrendSeries`/`computeSweepHealthRate` — explicit `for...of`/`.map`/`.filter`.
- **`typecheck` is a DoD gate.** `vue-tsc --noEmit` exits 0 with no NEW error vs baseline.
- **Purity.** No new `Date.now()`; helpers are functions of `recentRuns` only (`Date.parse` of a fixed string is allowed — deterministic).
- **No new dep / endpoint / route / migration.** Pure client projection; `BaseChart.vue` reused.

## Required `// why:` Comments
- `useSweepHealth.ts` (D-23503 exception) — the dashboard names the single healthy-class key `'endgame-reached'` for the health rate because a meaningful rate is structurally impossible under pure opacity (every cell is classified, so `sum(anomalyCounts) === cellCount`); it still does NOT import `SweepAnomalyClass` and all other keys stay opaque. Engine-coupling drift note: if the engine renames the healthy class this one constant must update.
- `useSweepHealth.ts` (rate guard) — `cellCount > 0` ⇒ `null` (not `NaN`) for a 0-cell run; a missing/non-finite healthy key reads 0.
- `useSweepTrend.ts` (cadence source) — cadence derives from the `-weekly-w<N>` runId suffix grammar (WP-209 + WP-234 contract), NOT from `cellCount` or the opaque taxonomy (D-23502).
- `SweepTrendChart.vue` (two series + [0,1]) — daily and weekly are distinct sweep cadences sharing one `sweep_runs` table; the health rate is magnitude-normalized so their y-values are comparable on a `[0,1]` axis (D-23501/D-23502).

## Files to Produce
- `apps/dashboard/src/composables/useSweepHealth.ts` — **modified** (`SWEEP_HEALTHY_ANOMALY_KEY` + `computeSweepHealthRate` SoT + `healthRate`/`healthRateSparkline`; `totalAnomalySparkline` unchanged).
- `apps/dashboard/src/composables/useSweepHealth.test.ts` — **modified** (health-rate + healthy-key cases).
- `apps/dashboard/src/composables/useSweepTrend.ts` — **new** (`classifyRunCadence`, `deriveSweepTrendPoints`, `deriveSweepTrendSeries`, `useSweepTrend`).
- `apps/dashboard/src/composables/useSweepTrend.test.ts` — **new** (≥ 10 `node:test` cases).
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** (`sweepHealthRate` ← `computeSweepHealthRate`).
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — **modified** only if the computation site moved (its tests inject `sweepHealthRate` directly).
- `apps/dashboard/src/components/charts/SweepTrendChart.vue` — **new** (health-rate trend via `BaseChart.vue`; daily/weekly; y `[0,1]`; `connectNulls:false`).
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified** (`sweepHealthPercent` ← helper + inline trend chart).
- `apps/dashboard/src/services/sweepHealthMocks.ts` — **modified** (cadence mix + `endgame-reached` key).
- `docs/ai/DECISIONS.md` — **modified** (D-23501/02/03 Active + D-20703 amendment note at close).
- `docs/ai/STATUS.md` — **modified** (at close).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** (WP-235 `[x]` at close).
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** (EC-268 → Done at close).
- `docs/05-ROADMAP-MINDMAP.md` — **modified** (WP-235 📝 → ✅ at close).

**Total: ~14 files** (9 App-layer source/test + 5 governance). Optional additive `types/sweep.ts` `SweepTrendPoint` export permitted.

## After Completing
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; ≥ 10 net-new cases (health-rate incl. missing-key/non-numeric/0-cell; cadence weekly/daily/edge; ordering incl. stable-tie; series partition; empty input; mock-mix); NO pre-existing case regresses.
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 — no NEW `vue-tsc` error vs baseline.
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] Health-rate SoT: `grep -nE "SWEEP_HEALTHY_ANOMALY_KEY|computeSweepHealthRate" useSweepHealth.ts` ≥ 2; both sites repaired (no `(cellCount - …)/cellCount` health formula in `useAgentPipeline.ts`/`PipelinePage.vue`).
- [ ] Narrow exception: `grep -rn "SweepAnomalyClass" apps/dashboard/src` = 0; `'endgame-reached'` named once (`useSweepHealth.ts`); no `'not-endgame'|'escaped-villain-cap'|'fatal'` literal anywhere in `apps/dashboard/src`.
- [ ] Trend helpers: `grep -nE "classifyRunCadence|deriveSweepTrendPoints|deriveSweepTrendSeries|-weekly-w|submittedAtMs" useSweepTrend.ts` ≥ 5; `.reduce(` = 0; `for (const … of` ≥ 1.
- [ ] Chart: `BaseChart` + `connectNulls` + `[0,1]` axis present in `SweepTrendChart.vue`; `git diff package.json apps/dashboard/package.json` empty.
- [ ] Mock mix: `grep -n "weekly-w" sweepHealthMocks.ts` ≥ 1; `endgame-reached` present.
- [ ] Scope: `git diff --name-only` lists only the Files-to-Produce; no `apps/server/**`, `packages/**`, `data/migrations/**`, `render.yaml`, `.env.example`; no new dep.
- [ ] `STATUS.md`, `DECISIONS.md` (D-23501/02/03 Active + D-20703 note), `WORK_INDEX.md` (WP-235 `[x]`), `EC_INDEX.md` (EC-268 Done), `05-ROADMAP-MINDMAP.md` (WP-235 ✅) updated.

## Common Failure Smells
- Computing health as `(cellCount − Σ all anomaly keys)/cellCount` → identically 0 on live data (every cell is classified; `sum === cellCount`). Use `endgame-reached / cellCount`.
- Leaving one of the two degenerate sites unrepaired → two health-rate definitions drift.
- Importing `SweepAnomalyClass` or naming more than the one healthy key → widens the D-20703 exception beyond the lock.
- Inferring cadence from `cellCount` magnitude instead of the `-weekly-w<N>` suffix → misclassifies a clamped weekly tail / a future cardinality change.
- Plotting raw counts instead of the health rate → daily/weekly sawtooth.
- Divide-by-zero on a 0-cell run (no guard) → `NaN` corrupts the axis; return `null`.
- Re-deriving the cadence split in the chart instead of consuming `deriveSweepTrendSeries` → duplicate logic.
- Ordering oldest→newest with a bare `.reverse()` instead of a stable ascending sort on `submittedAtMs` → inverts equal-timestamp tie order and fails the stable-tie test.
- A `Date.now()` read in the composable → breaks WP-204 purity (`Date.parse` of a fixed string is fine).
- Shipping a new `vue-tsc` error (typecheck not run) → it is a DoD gate.
- A dedicated Trends tab/route or a new charting dep → out of scope; inline + `BaseChart.vue`.
- Touching `totalAnomalySparkline` → it stays the D-20703 opaque all-keys sum (unchanged).

---

## DECISIONS.md Entries (D-23501..D-23503)

Reserved verbatim in `docs/ai/DECISIONS.md` (`Reserved (proposed)` at draft → `Active`
at close): **D-23501** — trend view is a client-side projection over the existing
30-run `recentRuns` (reuses `GET /api/sweep/latest` + `useSweepHealth` +
`BaseChart.vue`; inline; no new endpoint/server/migration/dep). **D-23502** —
cadence from the `-weekly-w<N>` runId suffix; the trend metric is the per-run
**health rate** ∈ [0,1], daily/weekly as distinct series, y-axis `[0,1]`,
`connectNulls:false`. **D-23503** — narrow D-20703 exception: a single
healthy-class constant `'endgame-reached'` + the `computeSweepHealthRate` sole-
source-of-truth helper, superseding the degenerate `(cellCount − Σ all keys)/cellCount`
formula at both sites; no `SweepAnomalyClass` import; all other keys remain opaque.
