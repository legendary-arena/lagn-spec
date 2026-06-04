# WP-210 — `SweepHealthWidget` Dashboard Surface (Client / Mock-Mode-First Mirroring WP-204 Pattern)

**Status:** Ready
**Primary Layer:** Client (`apps/dashboard/`)
**Dependencies:** WP-209 (sweep_runs server) ✅ — landed prior; this WP consumes its GET endpoint. WP-204 (dashboard ops widgets pattern) ✅, WP-198 (KPI status helper) ✅, WP-197 (freshness badge + source label union) ✅, WP-118 (D-9905 auth taxonomy) ✅

---

## Session Context

Paired client-side follow-up to WP-209. WP-209 landed `legendary.sweep_runs` table + POST/GET endpoints + nightly GitHub Actions invocation; the QA loop is now durable at the server side. This WP adds the operator-visible surface: a `SweepHealthWidget` on `/system` (alongside WP-204's four existing widgets) that consumes `GET /api/sweep/latest`, displays the latest run's summary + a 30-run sparkline of total anomalies, and surfaces a stale-run indicator if `submitted_at` is older than the expected nightly cadence. The widget follows the established MOCK-first pattern (per WP-204 D-20402 carry-forward of WP-197 D-19702) — initial commit ships MOCK; a future single-file LIVE flip in `mocks.ts` activates production data with widget bytes byte-identical pre/post.

---

## Goal

After this session, `dashboard.legendary-arena.com/system` displays a `SweepHealthWidget` below the existing WP-204 widget row. The widget renders the 4-state Widget Contract (`loading | empty | error | data`), displays cells run / soft-locks / crashes / anomaly summary by kind / last-run age / 30-run sparkline of total anomalies, and surfaces a `Stale` status chip if `latest.submittedAt` is older than 36 hours (1.5× the nightly cadence — buffer for time-zone drift + workflow scheduling jitter). All four widget arms render structurally per the WP-196 Widget State Gate Pattern (exactly 1 `v-if="state ===` per widget). Source label = `MOCK` initially; flips to `LIVE` via a one-line `mocks.ts` re-export swap in a future WP.

---

## Assumes

- WP-209 complete on `main`. Specifically:
  - `legendary.sweep_runs` table exists with the 6-column schema locked in WP-209 D-20701
  - `GET /api/sweep/latest` returns `{ data: { latest: SweepRunSummary, recentRuns: readonly SweepRunSummary[] } }` with `recentRuns.length <= 30`
  - `SweepRunSummary` shape: `{ runId: string, startedAt: string (ISO-8601), submittedAt: string (ISO-8601), cellCount: number, anomalyCounts: Record<string, number> }`
  - API catalog row for `GET /api/sweep/latest` is `Wired` per D-11804
- WP-204 complete. Specifically:
  - `apps/dashboard/src/pages/system/SystemHealthPage.vue` exists and hosts `PublicSurfaceHealthWidget`, `ErrorRateMonitorWidget`, `InfraCostWatchdogWidget`
  - `apps/dashboard/src/services/mocks.ts` carries the `fetchX` / `mockX` re-export seam pattern
  - `apps/dashboard/src/services/opsHealthMocks.ts` carries the `wrapMock<T>` + `hashRange`-seeded determinism pattern (per D-19605)
- WP-197 complete. `useDataFreshness` consumes the `'LIVE' | 'CACHED' | 'MOCK' | 'BUILD'` source-label union
- WP-198 complete. `computeKpiStatus()` is the canonical KPI status taxonomy helper (returns `'on-track' | 'needs-attention' | 'off-track'`)
- WP-196 complete. The 4-state Widget Contract (`loading | empty | error | data`) + Widget State Gate Pattern (exactly 1 `v-if="state ===` per widget) is locked
- `docs/ai/DECISIONS.md` + `docs/ai/ARCHITECTURE.md` exist

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms `apps/dashboard` must not import from `@legendary-arena/game-engine` / `@legendary-arena/registry` / `apps/server`. `anomalyCounts` keys are treated as opaque strings; the dashboard does NOT consume `SweepAnomalyClass` directly.
- `apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue` — read entirely. Models the 4-state Widget Contract, sparkline placement, `useDataFreshness` integration, and `computeKpiStatus()` chip-status pattern this widget mirrors.
- `apps/dashboard/src/composables/usePublicSurfaceHealth.ts` — read entirely. Models the composable shape this widget's composable mirrors.
- `apps/dashboard/src/services/opsHealthMocks.ts` — read entirely. Models the `wrapMock<T>` + `hashRange` mock-determinism pattern.
- `apps/dashboard/src/services/mocks.ts` — read entirely. Models the dual `mockX` (test) + `fetchX` (widget) re-export pattern preserving MOCK→LIVE upgrade-path byte-identity.
- `apps/dashboard/src/pages/system/SystemHealthPage.vue` — read entirely. Confirms current widget order and the insertion point for `SweepHealthWidget` (below the existing three).
- `docs/ai/work-packets/WP-209-sweep-runs-server-storage-and-submission.md §Goal §Response Envelope` — confirm the GET endpoint envelope shape exactly; this WP's forward-locked `SweepHealthSnapshot` type MUST match byte-for-byte (D-20703 enforcement).
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4 / 6 / 11 / 14 apply.

---

## Scope (In)

- New `apps/dashboard/src/types/sweep.ts` — forward-locked `SweepRunSummary` + `SweepHealthSnapshot` envelopes (matches WP-209 GET endpoint response shape byte-identical per D-20703)
- New `apps/dashboard/src/services/sweepHealthMocks.ts` — `wrapMock<SweepHealthSnapshot>` factory + `mockSweepHealth(range)` + `fetchSweepHealth(range)` re-exports + `hashRange`-seeded determinism per D-19605 + `MOCK_RECENT_RUN_COUNT = 30` literal
- Modified `apps/dashboard/src/services/mocks.ts` — add `mockSweepHealth` + `fetchSweepHealth` re-exports (preserves MOCK→LIVE byte-identity per D-20402 carry-forward)
- New `apps/dashboard/src/composables/useSweepHealth.ts` — composable returning `{ state, latestRun, recentRuns, totalAnomalySparkline, lastRunAgeMs, staleStatus, kpiStatus, source, updatedAt }` with 4-state semantics
- New `apps/dashboard/src/composables/useSweepHealth.test.ts` — ≥ 7 tests covering happy-path data state, empty-state sentinel (no runs yet), error-state surface, stale-status threshold (< 36h = fresh, ≥ 36h = stale), 30-run cap on sparkline, opaque-anomaly-keys handling, KpiStatus mapping
- New `apps/dashboard/src/widgets/SweepHealthWidget.vue` — 4-state widget rendering cells / soft-locks / crashes / anomaly-by-kind table / last-run age / 30-run sparkline / Fresh|Stale chip via `computeKpiStatus()` taxonomy
- Modified `apps/dashboard/src/pages/system/SystemHealthPage.vue` — insert `<SweepHealthWidget />` below the existing three widget rows; existing widgets preserved byte-identical
- Reserve D-20703 (sweep-health widget envelope shape lock + opaque-anomaly-key client posture)

## Out of Scope

- The server-side endpoints + table + nightly invocation — WP-209 scope (already landed)
- LIVE flip — initial commit ships MOCK per WP-204 D-20402 carry-forward; LIVE flip is a future single-file `mocks.ts` swap WP (mirrors WP-206 ↔ WP-204 relationship)
- Anomaly-class display labels keyed to the engine's `SweepAnomalyClass` union — the dashboard treats `anomalyCounts` keys as opaque strings (layer-boundary preservation; no engine import allowed). Display layer renders keys verbatim with a humanize-on-display helper for cosmetics only
- A `/debug` route — operator decision per WP-209 scoping: `/system` is the v1 home
- Per-run drill-down (clicking a run shows full classification) — future hardening WP
- Alert thresholds + regression detection on the anomaly sparkline — v1 surfaces the raw data only
- Widget-side polling / auto-refresh — page-load fetch only; manual refresh via page reload
- Multi-widget composable coupling — `SweepHealthWidget` is the sole consumer of `useSweepHealth` (no strip variant on `/overview` in v1)

---

## Files Expected to Change

- `apps/dashboard/src/types/sweep.ts` — new (forward-locked envelopes)
- `apps/dashboard/src/services/sweepHealthMocks.ts` — new (mock factory + re-export pair)
- `apps/dashboard/src/services/mocks.ts` — modified (2 line additions: `mockSweepHealth` + `fetchSweepHealth` re-exports)
- `apps/dashboard/src/composables/useSweepHealth.ts` — new (composable)
- `apps/dashboard/src/composables/useSweepHealth.test.ts` — new (≥ 7 tests)
- `apps/dashboard/src/widgets/SweepHealthWidget.vue` — new (4-state widget)
- `apps/dashboard/src/pages/system/SystemHealthPage.vue` — modified (insert `<SweepHealthWidget />` below existing row; existing widgets byte-identical)
- `docs/ai/DECISIONS.md` — modified (D-20703 reserved)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (Ready → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (Ready → Done)

11 files total (6 new + 1 modified source + 1 modified page + 3 governance + 1 modified DECISIONS).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — mock determinism flows through `hashRange()` per D-19605
- Never throw inside boardgame.io move functions — N/A (no moves)
- Never persist `G`, `ctx` — N/A
- ESM only, Node v22+
- `node:` prefix on Node built-in imports (in `.test.ts` files)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents required for every new or modified file

**Packet-specific:**
- ZERO imports of `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, `@legendary-arena/server` in any new file — verified by grep gate
- `anomalyCounts` keys are opaque strings client-side (no `SweepAnomalyClass` import); display layer renders unknown keys verbatim with humanize-on-display only
- `SweepHealthSnapshot` envelope matches WP-209 GET response shape byte-identical per D-20703 — drift between the two is detectable only via WP-209's API catalog row; any future shape change requires a paired-WP migration
- 4-state Widget Contract enforced structurally — exactly 1 `v-if="state ===` per widget (verified by `grep -nE "v-if=\"state ===" apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returning 1; Widget State Gate Pattern per WP-196)
- Source label = `'MOCK'` initially; the `wrapMock<T>` factory applies the source-label tag per WP-197 D-19702
- `useDataFreshness` consumed verbatim from WP-197; no re-implementation
- `computeKpiStatus()` consumed verbatim from WP-198 for the Fresh/Stale chip — KpiSnapshot constructed with `direction: 'lower-is-better'`, `target: STALE_THRESHOLD_MS` (defined as `36 * 60 * 60 * 1000` = 36 hours), `tolerance: 6 * 60 * 60 * 1000` (6 hours buffer), `value: lastRunAgeMs`. Returns existing `'on-track' | 'needs-attention' | 'off-track'` enum.
- Stale threshold: 36 hours (1.5× nightly cadence; buffer for time-zone drift + GitHub Actions scheduling jitter); locked as `STALE_THRESHOLD_HOURS = 36` in `useSweepHealth.ts`
- Recent-runs sparkline cap: 30 (mirrors WP-204 30-day sparkline convention); locked as `SPARKLINE_RUN_COUNT = 30`
- `anomalyCounts` display order: lex-asc by key (Unicode code-unit comparison); NOT a fixed engine-keyed order (layer-boundary preservation — dashboard does not know which keys are "important")
- Mock value bounds: `cellCount` ∈ [50, 500]; per-class anomaly count ∈ [0, 50]; `submittedAt` always < 36 hours ago (mock always-fresh; stale-state test mocks via composable input override, not via mock factory)
- Cents → USD formatting: N/A (no monetary values)
- `Date.now()` / `performance.now()` use: ONLY at widget render boundary for `lastRunAgeMs` derivation; composable is a pure function of `(fetchedSnapshot, currentTimeMs)` where `currentTimeMs` is passed in as a parameter (mirrors `useInfraCostWatchdog`'s wall-clock-independence test invariant per WP-204)
- No barrel re-exports / `import *` per Rule 6
- Empty-state test required: when `latestRun` is null (no runs ever submitted), widget renders `empty` arm with "No sweeps recorded yet" message + "Sweeps run nightly at 07:00 UTC" hint copy

**Session protocol:**
- If WP-209 GET response shape has shifted from `{ data: { latest, recentRuns } }`: STOP and report (forward-contract drift)
- If `SystemHealthPage.vue` has been refactored since this WP was drafted: read the new shape and insert below the existing row at the appropriate insertion point; preserve existing widgets byte-identical
- If `computeKpiStatus()` signature has changed since WP-198: read and adapt
- If `useDataFreshness` source-label union has changed: read and adapt
- If `wrapMock<T>` factory shape has changed since WP-204: read and adapt

**Locked contract values:**
- `STALE_THRESHOLD_HOURS = 36`
- `STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000`
- `STALE_TOLERANCE_MS = 6 * 60 * 60 * 1000`
- `SPARKLINE_RUN_COUNT = 30`
- `MOCK_RECENT_RUN_COUNT = 30`
- KpiSnapshot construction: `{ direction: 'lower-is-better', target: STALE_THRESHOLD_MS, tolerance: STALE_TOLERANCE_MS, value: lastRunAgeMs }`
- Empty-state copy: `"No sweeps recorded yet"` (h4) + `"Sweeps run nightly at 07:00 UTC"` (subtitle)
- Source label: `'MOCK'` initially per D-20402 carry-forward
- Widget header: `"Engine Sweep Health"` (h3) + `"Nightly QA-sweep classification summary"` (subtitle)
- Layer-boundary grep gate: `grep -rE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/{types,services,composables,widgets}/sweep* apps/dashboard/src/composables/useSweepHealth.* apps/dashboard/src/widgets/SweepHealthWidget.* | wc -l` returns 0
- D-20703 reservation

---

## Acceptance Criteria

1. `apps/dashboard/src/types/sweep.ts` exports `SweepRunSummary` and `SweepHealthSnapshot` interfaces with field shapes byte-identical to WP-209's GET response envelope per D-20703
2. `apps/dashboard/src/services/sweepHealthMocks.ts` exports `mockSweepHealth(range)` and `fetchSweepHealth(range)` via the dual re-export pattern; both use `wrapMock<SweepHealthSnapshot>` and `hashRange()` for determinism per D-19605
3. `apps/dashboard/src/services/mocks.ts` exports `mockSweepHealth` and `fetchSweepHealth` (2 new lines; existing exports preserved byte-identical)
4. `useSweepHealth` composable returns the 9-field shape: `{ state, latestRun, recentRuns, totalAnomalySparkline, lastRunAgeMs, staleStatus, kpiStatus, source, updatedAt }` with `state ∈ {'loading', 'empty', 'error', 'data'}`
5. `useSweepHealth` is a pure function of `(fetchedSnapshot, currentTimeMs)` — wall-clock-independence test passes (mirrors `useInfraCostWatchdog` invariant)
6. `SweepHealthWidget.vue` contains exactly 1 occurrence of `v-if="state ===` (Widget State Gate Pattern per WP-196) — verified by `grep -nE "v-if=\"state ===" apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l` returning 1
7. Stale-status threshold: `lastRunAgeMs < STALE_THRESHOLD_MS` → `staleStatus: 'fresh'`; `>= STALE_THRESHOLD_MS` → `'stale'`; verified by 2 boundary tests at `36h - 1ms` and `36h + 1ms`
8. `kpiStatus` derived from `computeKpiStatus()` (WP-198 verbatim) with the locked KpiSnapshot construction; never re-implements the 3-status taxonomy
9. `recentRuns` sparkline cap: `recentRuns.length <= SPARKLINE_RUN_COUNT (30)` — verified by 35-run mock input being truncated to 30 in composable output
10. Empty-state render: when `latestRun` is null, widget renders `empty` arm with `"No sweeps recorded yet"` heading and `"Sweeps run nightly at 07:00 UTC"` subtitle copy
11. Layer-boundary grep gate returns 0 matches (zero engine/registry/preplan/server imports in any new sweep file)
12. `git diff --stat apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue` returns empty (WP-204 widgets preserved byte-identical)
13. `SystemHealthPage.vue` carries `<SweepHealthWidget />` exactly once; existing per-node `DataTable<ServerNode>` + `ServerStatusWidget` + `AlertsPanel` + the three WP-204 widgets all preserved byte-identical pre/post
14. `pnpm --filter @legendary-arena/dashboard build` exits 0
15. `pnpm --filter @legendary-arena/dashboard test` exits 0 with ≥ 7 net-new tests in `useSweepHealth.test.ts`

---

## Verification Steps

```bash
# 1. Build + tests
pnpm --filter @legendary-arena/dashboard build && pnpm --filter @legendary-arena/dashboard test 2>&1 | tail -3
# Expected: build exit 0; ≥ 7 net-new tests green

# 2. Widget State Gate Pattern enforced
grep -nE "v-if=\"state ===" apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l
# Expected: 1

# 3. Layer-boundary gate
grep -rE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/types/sweep.ts apps/dashboard/src/services/sweepHealthMocks.ts apps/dashboard/src/composables/useSweepHealth.ts apps/dashboard/src/widgets/SweepHealthWidget.vue | wc -l
# Expected: 0

# 4. Re-export seam
grep -nE "mockSweepHealth|fetchSweepHealth" apps/dashboard/src/services/mocks.ts
# Expected: 2 lines (one each)

# 5. WP-204 widgets byte-identical
git diff --stat apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue
# Expected: empty output

# 6. Single new widget reference on the page
grep -nE "SweepHealthWidget" apps/dashboard/src/pages/system/SystemHealthPage.vue | wc -l
# Expected: 2 (one import, one template usage)

# 7. Locked constant present
grep -nE "STALE_THRESHOLD_HOURS\s*=\s*36" apps/dashboard/src/composables/useSweepHealth.ts
# Expected: 1 line

# 8. computeKpiStatus consumed (not re-implemented)
grep -nE "computeKpiStatus" apps/dashboard/src/composables/useSweepHealth.ts
# Expected: ≥ 1 line; zero matches for `'on-track' | 'needs-attention' | 'off-track'` redefinition

# 9. Visual verification (manual)
# pnpm --filter @legendary-arena/dashboard dev → /system → SweepHealthWidget renders below WP-204 widgets;
# MOCK freshness badge present; data arm renders cellCount + anomalyCounts table + sparkline + Fresh chip
```

---

## Definition of Done

- [ ] All 15 Acceptance Criteria pass
- [ ] All 9 Verification Steps produce the expected output
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-210 + the widget surface + the consumed endpoint)
- [ ] `docs/ai/DECISIONS.md` updated with D-20703
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] Commit message uses `EC-242:` prefix

---

## Vision Alignment

**N/A.** This WP lands an operator-only dashboard widget consuming an internal QA endpoint. It touches no §17.1 trigger surface: no scoring, no replays, no player identity, no multiplayer sync, no determinism guarantees the engine doesn't already enforce, no card data, no monetization, no live ops UX, no accessibility surface, no Registry Viewer public surface. The widget is operator-only behind CF Access + `authenticated-session-required`, never user-visible. Per §17.3 ("It does not require vision citations for purely structural WPs (e.g., test harness wiring, build infrastructure)") this is internal QA infrastructure.

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. Internal QA dashboard widget; no user-visible surface.

---

## API Catalog Update

**N/A.** This WP touches no HTTP endpoint, no `apps/server/src/**` library function, no route registration, no catalog row. WP-209 added the two sweep endpoints with API catalog rows at that landing; this WP is a client consumer with no server-side change.
