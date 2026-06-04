# EC-242 — `SweepHealthWidget` Dashboard Surface (Execution Checklist)

**Source:** docs/ai/work-packets/WP-210-sweep-health-dashboard-widget.md
**Layer:** Client (`apps/dashboard/`)

## Before Starting
- [ ] WP-209 landed on `main`; `GET /api/sweep/latest` returns the locked envelope
- [ ] `apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue` + `apps/dashboard/src/composables/usePublicSurfaceHealth.ts` reachable as the pattern to mirror
- [ ] `apps/dashboard/src/services/mocks.ts` carries the `mockX` + `fetchX` re-export pattern
- [ ] `apps/dashboard/src/pages/system/SystemHealthPage.vue` hosts WP-204's three widgets
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (baseline)
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- `STALE_THRESHOLD_HOURS = 36`
- `STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000`
- `STALE_TOLERANCE_MS = 6 * 60 * 60 * 1000`
- `SPARKLINE_RUN_COUNT = 30`
- `MOCK_RECENT_RUN_COUNT = 30`
- KpiSnapshot construction:
  ```ts
  { direction: 'lower-is-better', target: STALE_THRESHOLD_MS, tolerance: STALE_TOLERANCE_MS, value: lastRunAgeMs }
  ```
- Source label: `'MOCK'` (per D-20402 carry-forward; LIVE flip is a future single-file WP)
- Empty-state copy (verbatim):
  - h4: `"No sweeps recorded yet"`
  - subtitle: `"Sweeps run nightly at 07:00 UTC"`
- Widget header (verbatim):
  - h3: `"Engine Sweep Health"`
  - subtitle: `"Nightly QA-sweep classification summary"`
- `SweepHealthSnapshot` shape: `{ latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] }`
- `SweepRunSummary` shape: `{ runId: string, startedAt: string, submittedAt: string, cellCount: number, anomalyCounts: Record<string, number> }`
- Mock value bounds: `cellCount ∈ [50, 500]`; per-class anomaly count ∈ [0, 50]; mock `submittedAt` always within last 36h
- `anomalyCounts` display order: lex-asc by key (Unicode code-unit comparison)
- D-20703 reservation

## Guardrails
- ZERO imports of `@legendary-arena/game-engine` / `registry` / `preplan` / `server` in any new file — verified by grep gate
- `anomalyCounts` keys treated as opaque strings client-side (no `SweepAnomalyClass` import); display renders keys verbatim with humanize-on-display helper only
- 4-state Widget Contract enforced structurally — exactly 1 `v-if="state ===` per widget (Widget State Gate Pattern per WP-196)
- `computeKpiStatus()` (WP-198) is the SOLE source of the 3-status taxonomy — never re-implemented in the composable
- `useDataFreshness` (WP-197) is the SOLE source of the freshness badge — never re-implemented
- `wrapMock<T>` (per D-19605) is the SOLE source of the `MOCK` source-label tag
- WP-204 widgets (`PublicSurfaceHealthWidget`, `ErrorRateMonitorWidget`, `InfraCostWatchdogWidget`) preserved byte-identical — `git diff` empty after the page wire
- `useSweepHealth` is a pure function of `(fetchedSnapshot, currentTimeMs)` — `Date.now()` is NOT called inside the composable; `currentTimeMs` is passed in by the widget caller (mirrors `useInfraCostWatchdog` wall-clock-independence invariant)
- `recentRuns` cap = 30 at composable layer; widget consumes the truncated array; never re-truncates
- Empty-state render path: `latestRun === null` triggers the `empty` arm; do not conflate with `error` or `loading`
- Tests use `node:test` + `node:assert`; `should_<behavior>_when_<condition>` naming

## Required `// why:` Comments
- `apps/dashboard/src/composables/useSweepHealth.ts` at the `STALE_THRESHOLD_HOURS = 36` constant: `// why (D-20703): 36 hours = 1.5× nightly cadence (24h) — buffer for time-zone drift + GitHub Actions scheduling jitter. Anything >= this threshold surfaces operator-actionable Stale chip.`
- `apps/dashboard/src/composables/useSweepHealth.ts` at the KpiSnapshot construction site: `// why (WP-198 reuse): computeKpiStatus() is the canonical KPI status taxonomy helper; constructing a KpiSnapshot here preserves single-implementation discipline so the Fresh/Stale chip stays consistent with WP-198 / WP-204 surface chips.`
- `apps/dashboard/src/composables/useSweepHealth.ts` at the `currentTimeMs` parameter declaration: `// why (D-19608 carry-forward + WP-204 invariant): pure-function discipline — composable is a pure function of (fetchedSnapshot, currentTimeMs); Date.now() is called ONCE at the widget render boundary and passed in. Wall-clock-independence test enforces.`
- `apps/dashboard/src/widgets/SweepHealthWidget.vue` at the `Date.now()` call site (widget render boundary): `// why (WP-204 carry-forward): single Date.now() call at render boundary keeps the composable a pure function; composable + widget split preserves testability.`
- `apps/dashboard/src/services/sweepHealthMocks.ts` at the `hashRange()` consumption: `// why (D-19605): hashRange-seeded mock determinism — same range input yields byte-identical mock output across runs, preserving Snapshot/visual-regression test stability.`

## Files to Produce
- `apps/dashboard/src/types/sweep.ts` — **new** — `SweepRunSummary` + `SweepHealthSnapshot` interfaces
- `apps/dashboard/src/services/sweepHealthMocks.ts` — **new** — `wrapMock` factory + `mockSweepHealth` + `fetchSweepHealth` exports
- `apps/dashboard/src/services/mocks.ts` — **modified** — 2 line additions
- `apps/dashboard/src/composables/useSweepHealth.ts` — **new** — composable
- `apps/dashboard/src/composables/useSweepHealth.test.ts` — **new** — ≥ 7 tests
- `apps/dashboard/src/widgets/SweepHealthWidget.vue` — **new** — 4-state widget
- `apps/dashboard/src/pages/system/SystemHealthPage.vue` — **modified** — insert `<SweepHealthWidget />` below existing row
- `docs/ai/DECISIONS.md` — **modified** — D-20703 reserved (verbatim block below)
- `docs/ai/STATUS.md` — **modified** — Done entry
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; ≥ 7 net-new in `useSweepHealth.test.ts`
- [ ] `grep -nE "v-if=\"state ===" apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returns 1
- [ ] `grep -rE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/types/sweep.ts apps/dashboard/src/services/sweepHealthMocks.ts apps/dashboard/src/composables/useSweepHealth.ts apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returns 0
- [ ] `grep -nE "mockSweepHealth|fetchSweepHealth" apps/dashboard/src/services/mocks.ts` returns 2 matches
- [ ] `git diff --stat apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue` empty
- [ ] `grep -nE "SweepHealthWidget" apps/dashboard/src/pages/system/SystemHealthPage.vue | wc -l` returns 2
- [ ] `grep -nE "STALE_THRESHOLD_HOURS\s*=\s*36" apps/dashboard/src/composables/useSweepHealth.ts` returns 1
- [ ] `grep -nE "'on-track'\s*\|\s*'needs-attention'\s*\|\s*'off-track'" apps/dashboard/src/composables/useSweepHealth.ts` returns 0 (no taxonomy redefinition)
- [ ] D-20703 active in DECISIONS.md byte-identical to verbatim block below
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-242:`

## Common Failure Smells
- Engine type imported in `sweep.types.ts` → layer-boundary breach; client must treat `anomalyCounts` keys as opaque
- `Date.now()` inside composable → wall-clock-independence test fails; move to widget render boundary
- 2+ `v-if="state ===` in widget → Widget State Gate Pattern broken; collapse to single computed `state` + 4-arm template
- 3-status taxonomy redefined → cross-implementation drift; call `computeKpiStatus()` instead
- `recentRuns` truncated at widget layer → composable layer is the truncation boundary; widget consumes whatever the composable gives
- Empty-state copy paraphrased → drift signal; match the locked strings byte-for-byte
- WP-204 widgets show in `git diff` → file accidentally touched; revert
- LIVE flip wired in this WP → out-of-scope; initial commit is MOCK, LIVE is a separate future single-file `mocks.ts` swap WP
- `/debug` route added → scope decision is `/system` for v1; do not create new routes

## DECISIONS.md Verbatim Block (PS-1 transcription convention)

### D-20703 — `SweepHealthWidget` Envelope Shape Lock + Opaque-Anomaly-Key Client Posture

**D-20703 — `SweepHealthWidget` envelope shape lock + opaque-anomaly-key client posture.** The dashboard's `SweepHealthSnapshot` envelope is forward-locked to match WP-209's `GET /api/sweep/latest` response shape byte-identical: `{ latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] }`, where `SweepRunSummary` carries `{ runId, startedAt, submittedAt, cellCount, anomalyCounts: Record<string, number> }`. The dashboard treats `anomalyCounts` keys as opaque strings — NO import of `SweepAnomalyClass` from `@legendary-arena/game-engine` (layer-boundary preservation per ARCHITECTURE.md §Layer Boundary). Display layer renders keys verbatim with a humanize-on-display helper for cosmetics only; unknown future keys (if the engine's `SWEEP_ANOMALY_CLASSES` expands beyond the WP-195 D-19502 4-class taxonomy) render automatically without dashboard rebuild. Stale threshold: 36 hours = 1.5× nightly cadence (24h), buffering time-zone drift + GitHub Actions scheduling jitter; `computeKpiStatus()` (WP-198) is the SOLE source of the 3-status taxonomy (`'on-track' | 'needs-attention' | 'off-track'`); never re-implemented. Sparkline cap: 30 runs (matches WP-204 30-day sparkline convention). Source label `'MOCK'` initially per WP-204 D-20402 carry-forward; LIVE flip is a future single-file `mocks.ts` re-export swap WP (mirrors WP-206 ↔ WP-204 relationship). `useSweepHealth` is a pure function of `(fetchedSnapshot, currentTimeMs)`; `Date.now()` called ONCE at the widget render boundary (mirrors `useInfraCostWatchdog` wall-clock-independence invariant per WP-204).
