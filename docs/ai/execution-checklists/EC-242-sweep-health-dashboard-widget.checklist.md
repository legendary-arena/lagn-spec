# EC-242 — `SweepHealthWidget` Dashboard Surface (Execution Checklist)

**Source:** docs/ai/work-packets/WP-210-sweep-health-dashboard-widget.md
**Layer:** Client (`apps/dashboard/`)

## Source of Truth
All contract values, type shapes, and constants below are **transcribed from WP-210** for quick reference. EC-242 does NOT redefine them. If this checklist and WP-210 disagree on any locked value, **WP-210 wins** and the EC is the stale copy — fix the EC. The authoritative wire contract is WP-209's `apps/server/src/sweep/sweep.types.ts` (`SweepRunSummary` / `SweepLatestEnvelope`); WP-210's dashboard mirror is structurally identical to it except for the documented `anomalyCounts` key-widening (`SweepAnomalyClass` → `string`) for layer-boundary opacity.

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
- `SweepRunSummary` shape (server field order per `apps/server/src/sweep/sweep.types.ts`): `{ runId: string, submittedAt: string, startedAt: string, cellCount: number, anomalyCounts: Readonly<Record<string, number>> }` — keys widened to `string` client-side (no `SweepAnomalyClass` import)
- `recentRuns` ordering: `submitted_at DESC` (most-recent-first); `recentRuns[0]` === `latest` when non-empty
- `totalAnomalySparkline`: `readonly number[]`; `length === min(recentRuns.length, SPARKLINE_RUN_COUNT)`; `[i] === sum(Object.values(recentRuns[i].anomalyCounts))`; index 0 = most-recent run; truncation = `recentRuns.slice(0, 30)` (retain most-recent 30, never last 30, never reversed)
- `staleStatus`: literal union `'fresh' | 'stale'`; `lastRunAgeMs >= STALE_THRESHOLD_MS ? 'stale' : 'fresh'`; defaults to `'fresh'` when `latestRun === null`
- Anomaly-key humanize-on-display (locked transform): replace each `-`/`_` with a space, Title-Case each word (e.g. `some-anomaly-key` → `Some Anomaly Key`); render-only, never mutate or branch on the key
- Mock value bounds: `cellCount ∈ [50, 500]`; per-class anomaly count ∈ [0, 50]; mock `submittedAt` always within last 36h
- `anomalyCounts` display order: lex-asc by key (Unicode code-unit comparison via raw `<`, NOT `localeCompare`)
- D-20703 reservation

## Guardrails
- ZERO imports of `@legendary-arena/game-engine` / `registry` / `preplan` / `server` in any new file — verified by grep gate
- `anomalyCounts` keys treated as opaque strings client-side: no `SweepAnomalyClass` import, no `switch`/`if`/ternary keyed on a specific anomaly-key value, and no WP-195 D-19502 anomaly-key string literal (the set enumerated in the opacity grep gate under §After Completing) appears anywhere in the sweep client files. Keys are iterated generically (`Object.keys`/`Object.values`) and rendered via the locked humanize transform only
- 4-state Widget Contract enforced structurally — exactly 1 `v-if="state ===` per widget (Widget State Gate Pattern per WP-196)
- `computeKpiStatus()` (WP-198) is the SOLE source of the 3-status taxonomy — never re-implemented in the composable
- `useDataFreshness` (WP-197) is the SOLE source of the freshness badge — never re-implemented
- `wrapMock<T>` (per D-19605) is the SOLE source of the `MOCK` source-label tag
- WP-204 widgets (`PublicSurfaceHealthWidget`, `ErrorRateMonitorWidget`, `InfraCostWatchdogWidget`) preserved byte-identical — `git diff` empty after the page wire
- `useSweepHealth` is a pure function of `(fetchedSnapshot, currentTimeMs)` — `Date.now()` is NOT called inside the composable; `currentTimeMs` is passed in by the widget caller (mirrors `useInfraCostWatchdog` wall-clock-independence invariant)
- `recentRuns` cap = 30 at composable layer; widget consumes the truncated array; never re-truncates
- Empty-state vs error-state are mutually exclusive: `state === 'empty'` ONLY when `latestRun === null` AND no fetch error occurred; a fetch error yields `state === 'error'` and the error arm must NOT render the empty-state copy (prevents "quiet failure looks like no data")
- `totalAnomalySparkline` is derived in the composable, not the widget: opaque per-run sum across ALL keys (`sum(Object.values(...))`), index 0 = most-recent; widget consumes it as-is and never re-sums or re-truncates
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
- `apps/dashboard/src/composables/useSweepHealth.test.ts` — **new** — ≥ 9 tests
- `apps/dashboard/src/widgets/SweepHealthWidget.vue` — **new** — 4-state widget
- `apps/dashboard/src/pages/system/SystemHealthPage.vue` — **modified** — insert `<SweepHealthWidget />` below existing row
- `docs/ai/DECISIONS.md` — **modified** — D-20703 reserved (verbatim block below)
- `docs/ai/STATUS.md` — **modified** — Done entry
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; ≥ 9 net-new in `useSweepHealth.test.ts` (includes sparkline-aggregation, unknown-key, and empty-vs-error tests)
- [ ] `grep -nE "v-if=\"state ===" apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returns 1
- [ ] `grep -rE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/types/sweep.ts apps/dashboard/src/services/sweepHealthMocks.ts apps/dashboard/src/composables/useSweepHealth.ts apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returns 0
- [ ] `grep -rnE "SweepAnomalyClass|endgame-reached|not-endgame|escaped-villain-cap|fatal" apps/dashboard/src/types/sweep.ts apps/dashboard/src/services/sweepHealthMocks.ts apps/dashboard/src/composables/useSweepHealth.ts apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returns 0 (anomaly-key opacity gate)
- [ ] `grep -nE "totalAnomalySparkline" apps/dashboard/src/composables/useSweepHealth.test.ts | wc -l` returns ≥ 1 (sparkline aggregation + cap asserted)
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
- Sparkline reversed or taking the LAST 30 → must be `recentRuns.slice(0, 30)`, index 0 = most-recent; reversing inverts the trend chart
- Sparkline summing only "interesting" keys → must sum ALL keys via `Object.values`; key-selective summing is a covert opacity breach
- Anomaly-key literal hardcoded in a client file → opacity gate breach; iterate keys generically and never branch on a key value
- Humanize transform improvised per-dev (e.g. only stripping `-`, or sentence-case) → drift; apply the single locked transform (strip `-`/`_` → space, Title-Case each word)
- Error arm rendering "No sweeps recorded yet" → empty vs error conflated; error state must surface an error message, not the empty copy
- Empty-state copy paraphrased → drift signal; match the locked strings byte-for-byte
- WP-204 widgets show in `git diff` → file accidentally touched; revert
- LIVE flip wired in this WP → out-of-scope; initial commit is MOCK, LIVE is a separate future single-file `mocks.ts` swap WP
- `/debug` route added → scope decision is `/system` for v1; do not create new routes

## DECISIONS.md Verbatim Block (PS-1 transcription convention)

### D-20703 — `SweepHealthWidget` Envelope Shape Lock + Opaque-Anomaly-Key Client Posture

**D-20703 — `SweepHealthWidget` envelope shape lock + opaque-anomaly-key client posture.** The dashboard's `SweepHealthSnapshot` envelope is forward-locked to match WP-209's `GET /api/sweep/latest` response shape byte-identical: `{ latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] }`, where `SweepRunSummary` carries `{ runId, startedAt, submittedAt, cellCount, anomalyCounts: Record<string, number> }`. The dashboard treats `anomalyCounts` keys as opaque strings — NO import of `SweepAnomalyClass` from `@legendary-arena/game-engine` (layer-boundary preservation per ARCHITECTURE.md §Layer Boundary). Display layer renders keys verbatim with a humanize-on-display helper for cosmetics only; unknown future keys (if the engine's `SWEEP_ANOMALY_CLASSES` expands beyond the WP-195 D-19502 4-class taxonomy) render automatically without dashboard rebuild. Stale threshold: 36 hours = 1.5× nightly cadence (24h), buffering time-zone drift + GitHub Actions scheduling jitter; `computeKpiStatus()` (WP-198) is the SOLE source of the 3-status taxonomy (`'on-track' | 'needs-attention' | 'off-track'`); never re-implemented. Sparkline cap: 30 runs (matches WP-204 30-day sparkline convention). Source label `'MOCK'` initially per WP-204 D-20402 carry-forward; LIVE flip is a future single-file `mocks.ts` re-export swap WP (mirrors WP-206 ↔ WP-204 relationship). `useSweepHealth` is a pure function of `(fetchedSnapshot, currentTimeMs)`; `Date.now()` called ONCE at the widget render boundary (mirrors `useInfraCostWatchdog` wall-clock-independence invariant per WP-204). Client-derived projections are locked: `totalAnomalySparkline` is `readonly number[]` where `[i] === sum(Object.values(recentRuns[i].anomalyCounts))` (opaque sum over all keys), index 0 = most-recent run (`recentRuns[0]`; endpoint orders `submitted_at DESC`), `length === min(recentRuns.length, 30)`, truncation = `recentRuns.slice(0, 30)` (most-recent 30, never reversed); `staleStatus` is the literal union `'fresh' | 'stale'` (`lastRunAgeMs >= STALE_THRESHOLD_MS ? 'stale' : 'fresh'`, `'fresh'` default when no run). Empty-state (`state === 'empty'`) is reached ONLY when `latestRun === null` AND no fetch error; the error arm never renders empty-state copy. The dashboard's `SweepRunSummary` mirror is structurally identical to the server type with `anomalyCounts` keys widened from `SweepAnomalyClass` to `string` for opacity — the one documented deviation from byte-identity.
