# WP-230 — Pipeline Page Sweep Integration (Agent Lanes Consume Nightly Sweep Findings)

**Status:** Draft
**Primary Layer:** Dashboard (composable + UI only)
**Dependencies:** WP-209 (sweep runs server), WP-210 (SweepHealthWidget), WP-229 (Pipeline page)

---

## Session Context

WP-209 built the nightly sweep infrastructure: `legendary.sweep_runs`
storage, `POST /api/sweep/runs` submission, `GET /api/sweep/latest`
retrieval, and the GitHub Actions nightly cron (2×2 smoke, 07:00 UTC).
WP-210 built `SweepHealthWidget` on `/system` with anomaly table,
30-run sparkline, and stale chip via `useSweepHealth`. WP-229 built the
Pipeline page with four agent lanes (Architect → Builder → Inspector →
Evaluator) showing generic KPI-derived priority recommendations. This
packet connects the sweep data to the Pipeline page so each agent lane
shows actionable findings from the nightly sweep, not just abstract
counts.

---

## Goal

After this packet, the Pipeline page at `/pipeline` consumes
`useSweepHealth` (the same composable that powers `SweepHealthWidget`
on `/system`) and populates each agent lane with sweep-derived items:

- **Inspector**: fatal crash count + stuck-game count as To Do items
  to triage; anomaly breakdown in Active
- **Builder**: top fatal error signatures (from `anomalyCounts.fatal`)
  as To Do items to fix
- **Architect**: health rate (healthy cells / total cells) as a spec
  coverage signal; low health rate triggers a priority recommendation
- **Evaluator**: sweep freshness (last run age) and trend direction
  (sparkline slope) as acquisition-readiness signals

Priority recommendations incorporate sweep signals: fatals → critical
urgency, stuck games → high, stale sweep → high, low health rate → high.
The generic placeholder recommendations become concrete when sweep data
exists.

---

## Assumes

- WP-209 complete. Specifically:
  - `GET /api/sweep/latest` returns `SweepHealthSnapshot` with
    `latest: SweepRunSummary | null` and `recentRuns: SweepRunSummary[]`
  - `SweepRunSummary` has `anomalyCounts: Record<string, number>`
  - Nightly cron runs at 07:00 UTC
- WP-210 complete. Specifically:
  - `apps/dashboard/src/composables/useSweepHealth.ts` exports
    `useSweepHealth` returning `UseSweepHealthReturn`
  - `apps/dashboard/src/types/sweep.ts` exports `SweepRunSummary`
    and `SweepHealthSnapshot`
  - `apps/dashboard/src/services/sweepHealthMocks.ts` provides mock data
- WP-229 complete. Specifically:
  - `apps/dashboard/src/composables/useAgentPipeline.ts` exports
    `useAgentPipeline` with `PipelineLane`, `PriorityRecommendation`
  - `apps/dashboard/src/pages/pipeline/PipelinePage.vue` renders
    four lanes with priority strip + three temporal columns
- `pnpm -r build` exits 0
- `pnpm --filter @legendary-arena/dashboard test` exits 0

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary` — the dashboard must NOT
  import from `packages/game-engine`. Anomaly keys are treated as opaque
  strings per D-20703.
- `apps/dashboard/src/composables/useSweepHealth.ts` — read the full
  file; this is the data source. The composable is a pure function of
  `(fetchState, currentTimeMs)` per D-19608.
- `apps/dashboard/src/types/sweep.ts` — read for `SweepRunSummary` and
  `SweepHealthSnapshot` shapes (D-20703 envelope lock).
- `apps/dashboard/src/composables/useAgentPipeline.ts` — read the full
  file; this packet modifies it to consume sweep data.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — read the full
  file; this packet adds sweep awareness to the template.
- `apps/dashboard/src/widgets/SweepHealthWidget.vue` — read for the
  display pattern precedent (how `/system` renders sweep data).
- `apps/dashboard/src/services/sweepHealthMocks.ts` — read for mock
  data shape (Pipeline page must work in mock mode).
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix),
  Rule 11 (full-sentence error messages), Rule 13 (ESM only)

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- Anomaly count keys are OPAQUE strings — never import or reference the
  engine's `SweepAnomalyClass` type (D-20703 layer-boundary preservation)
- `useSweepHealth` is the sole data source for sweep data on the Pipeline
  page — do not create a second fetch path or a second composable
- `Date.now()` must be called ONCE at the render boundary and passed
  through, same as `SweepHealthWidget` (D-19608 wall-clock discipline)
- The Pipeline page must render correctly when sweep data is unavailable
  (`latest === null` / empty state / error state) — all sweep-derived
  items gracefully disappear
- No engine files may be modified by this packet
- No server files may be modified by this packet
- `useSweepHealth.ts` and `sweep.ts` types must NOT be modified — this
  packet is a consumer, not an extender

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human
  before proceeding — never guess or invent field names, type shapes, or file
  paths

---

## Debuggability & Diagnostics

- Sweep-derived lane items are deterministic given identical
  `SweepHealthSnapshot` input + identical `currentTimeMs`
- The composable logs no warnings or errors — absence of sweep data is a
  normal state (pre-first-run), not an error
- All sweep-derived `PipelineItem` IDs are prefixed `sweep-` for easy
  identification in the accessibility tree and test assertions

---

## Scope (In)

### A) Pipeline composable — sweep data integration

- **`apps/dashboard/src/composables/useAgentPipeline.ts`** — **modified**:
  - Accept an optional `sweepData` parameter: `{ latestRun:
    SweepRunSummary | null; staleStatus: 'fresh' | 'stale';
    totalAnomalySparkline: readonly number[] }` (a projection of
    `UseSweepHealthReturn`, not the full composable — the Pipeline page
    extracts these fields and passes them in so the composable stays
    testable without wiring a fetch mock)
  - When `sweepData.latestRun` is non-null:
    - **Inspector lane backlog**: add item per anomaly key where
      count > 0, formatted as `"${count} ${key} anomaly(s) — triage"`
      with meta `'Sweep'`. Fatal anomalies sort first.
    - **Builder lane backlog**: add item for each anomaly key with
      count > 0 where key contains `'fatal'`, formatted as
      `"${count} fatal crash(es) — investigate error signatures"`
      with meta `'Sweep'`
    - **Architect lane backlog**: compute health rate as
      `(endgameReached / totalCells)` — if < 0.8, add item
      `"${percent}% of sweep setups unhealthy — review spec coverage"`
      with meta `'Sweep'`
    - **Evaluator lane active**: when sweep data exists, add item
      showing last run age and freshness status; replace the static
      placeholder text
  - **Priority recommendations**: incorporate sweep signals into the
    four `derive*Priorities` functions:
    - Inspector today: if fatals > 0 → critical (override generic)
    - Builder today: if fatals > 0 → critical (override generic)
    - Architect this-week: if healthRate < 0.8 → high
    - Evaluator today: if staleStatus === 'stale' → high
  - When `sweepData` is undefined or `latestRun` is null: all
    sweep-derived items are absent; existing KPI-derived items and
    recommendations remain as-is (backward compatible)

### B) Pipeline page — wire sweep data

- **`apps/dashboard/src/pages/pipeline/PipelinePage.vue`** — **modified**:
  - Import and call `useSweepHealth` with the same fetch-state +
    `Date.now()` pattern used by `SweepHealthWidget.vue`
  - Extract `latestRun`, `staleStatus`, `totalAnomalySparkline` from
    the return value
  - Pass the sweep projection to `useAgentPipeline(snapshotOverride,
    sweepData)`
  - Add a sweep summary bar (below the refresh bar, above the lanes)
    showing: last sweep date, cell count, total anomaly count,
    freshness chip. Hidden when no sweep data.
  - Health rate color: green ≥ 80%, yellow ≥ 50%, red < 50%

### C) Tests

- **`apps/dashboard/src/composables/useAgentPipeline.test.ts`** — **modified**:
  - Test: sweep fatals appear in Inspector lane backlog with `'Sweep'` meta
  - Test: sweep fatals appear in Builder lane backlog
  - Test: low healthRate appears in Architect lane backlog
  - Test: sweep data replaces Evaluator placeholder when present
  - Test: null/undefined sweepData produces no sweep items (graceful)
  - Test: priority urgency escalates to critical when sweep has fatals
  - Test: priority urgency escalates to high when sweep is stale
  - Test: anomaly keys are treated as opaque (no hardcoded key names
    in assertions beyond format checking)

---

## Out of Scope

- No engine changes — simulation, sweep, and analysis are built
  (WP-036, WP-193, WP-194, WP-195)
- No server changes — sweep storage and API are built (WP-209)
- No modifications to `useSweepHealth.ts` or `sweep.ts` — this packet
  consumes, does not extend
- No modifications to `SweepHealthWidget.vue` — it continues to live
  on `/system` independently
- No scheduled Claude Code sessions — that is WP-231 (see below)
- No agent handoff chain — that is WP-232 (see below)
- No trend-over-time comparison or historical sweep analysis
- No per-error-signature detail view (would require `manifestBlob`
  access, which is forensic-only per WP-209)
- Refactors, cleanups, or "while I'm here" improvements are **out of scope**

---

## Files Expected to Change

- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** — accepts sweep data, adds sweep-derived lane items and priority signals
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — **modified** — new sweep integration test cases
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified** — wires `useSweepHealth`, passes sweep data to composable, adds sweep summary bar
- `docs/ai/STATUS.md` — **modified** — completion entry
- `docs/ai/DECISIONS.md` — **modified** — D-23001+ entries
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-230 checked off

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Sweep data in lanes
- [ ] Inspector lane backlog shows anomaly items when sweep has anomalies > 0
- [ ] Inspector lane backlog shows no sweep items when `latestRun` is null
- [ ] Builder lane backlog shows fatal-class anomaly items when fatal count > 0
- [ ] Architect lane backlog shows health rate warning when healthRate < 0.8
- [ ] Evaluator lane active shows sweep freshness when data present
- [ ] All sweep-derived `PipelineItem` IDs start with `sweep-`
- [ ] All sweep-derived `PipelineItem` meta fields equal `'Sweep'`
- [ ] No anomaly key string is hardcoded — keys read from `anomalyCounts` dynamically (D-20703)

### Priority recommendations
- [ ] Inspector today urgency is `'critical'` when sweep has fatal anomalies
- [ ] Builder today urgency is `'critical'` when sweep has fatal anomalies
- [ ] Architect this-week urgency is `'high'` when healthRate < 0.8
- [ ] Evaluator today urgency is `'high'` when staleStatus is `'stale'`
- [ ] All four lanes retain their existing recommendations when sweep data is absent

### Pipeline page
- [ ] Sweep summary bar visible when sweep data present
- [ ] Sweep summary bar hidden when sweep data is null
- [ ] Health rate displays with correct color class (green/yellow/red)
- [ ] Page renders correctly in mock mode (using `sweepHealthMocks.ts`)

### Tests
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (all test files)
- [ ] At least 8 new sweep-specific test cases pass
- [ ] No test imports from `boardgame.io` or `packages/game-engine`
- [ ] Tests use `node:test` and `node:assert` only

### Scope enforcement
- [ ] No files in `packages/game-engine/` were modified (confirmed with `git diff --name-only`)
- [ ] No files in `apps/server/` were modified (confirmed with `git diff --name-only`)
- [ ] `useSweepHealth.ts` and `types/sweep.ts` were NOT modified (confirmed with `git diff --name-only`)
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all dashboard tests
pnpm --filter @legendary-arena/dashboard test
# Expected: all tests pass, 0 failing

# Step 3 — confirm no engine files modified
git diff --name-only packages/game-engine/
# Expected: no output

# Step 4 — confirm no server files modified
git diff --name-only apps/server/
# Expected: no output

# Step 5 — confirm sweep types not modified
git diff --name-only apps/dashboard/src/composables/useSweepHealth.ts apps/dashboard/src/types/sweep.ts
# Expected: no output

# Step 6 — confirm no anomaly key hardcoding (D-20703 opacity)
Select-String -Path "apps\dashboard\src\composables\useAgentPipeline.ts" -Pattern "endgame-reached|not-endgame|escaped-villain-cap"
# Expected: no output (keys are opaque)

# Step 7 — confirm no files outside scope
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (all test files)
- [ ] Pipeline page renders sweep-derived items in agent lanes when sweep data exists (confirmed visually)
- [ ] Pipeline page renders gracefully when no sweep data exists (confirmed visually)
- [ ] No files in `packages/game-engine/` or `apps/server/` were modified (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — Pipeline page agent lanes now consume nightly sweep findings; Inspector sees anomalies to triage, Builder sees fatals to fix, Architect sees health rate gaps, Evaluator sees freshness signals
- [ ] `docs/ai/DECISIONS.md` updated — at minimum: D-23001 (Pipeline composable accepts sweep data as optional parameter; backward compatible), D-23002 (anomaly key opacity preserved on Pipeline page per D-20703), D-23003 (sweep-derived items use `sweep-` ID prefix convention)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-230 checked off with today's date

---

## Future Work Packets (Scoped From This Foundation)

### WP-231 — Scheduled Agent Triage Sessions (Inspector Reads Sweep → Files Findings)

**Concept:** A scheduled Claude Code session (daily, after the 07:00 UTC
nightly sweep) that:
1. Reads `GET /api/sweep/latest` to get the latest sweep results
2. Runs `/agent-inspector` against the anomaly data
3. Classifies each anomaly into P0/P1/P2 per the Inspector SKILL.md
   severity tags
4. Writes a structured `inspection-report.json` to a known path
5. The dashboard reads this report and shows triage status per finding

**Key decisions needed:**
- Where does the inspection report live? (R2 bucket? Repo artifact?
  Server endpoint?)
- How does the scheduled session authenticate to the sweep API?
- What triggers the session — cron, GitHub Actions, or Claude Code
  `/schedule`?

**Depends on:** WP-230

### WP-232 — Agent Handoff Chain (Inspector → Builder → Architect)

**Concept:** Structured JSON contracts between agent sessions so findings
flow through the pipeline automatically:
1. Inspector writes `inspection-report.json` with triaged findings
2. Builder session reads the report, picks up P0/P1 findings, attempts
   fixes on a branch
3. If the Builder identifies a spec gap, it writes a
   `spec-amendment-request.json` for the Architect
4. Architect session reads the request and amends the relevant WP spec
5. Each handoff writes to a known path; the dashboard shows the status
   of each finding through the chain

**Key decisions needed:**
- JSON contract shapes for each handoff
- Branch naming convention for Builder fix branches
- How does the Architect session know which WP spec to amend?
- Verification: does the Builder's fix actually resolve the sweep anomaly?

**Depends on:** WP-230, WP-231

### WP-233 — Closed-Loop Sweep Verification (Builder Fix → Re-Sweep → Inspector Verify)

**Concept:** After the Builder pushes a fix branch:
1. A targeted sweep re-runs only the cells that previously failed
2. The Inspector verifies the anomaly is resolved
3. The dashboard shows the full lifecycle: found → triaged → fixed →
   verified
4. If the re-sweep still fails, the finding cycles back to the Builder

**Key decisions needed:**
- How to run a targeted sweep (subset of cells, not full matrix)?
- Does the re-sweep run on the fix branch or after merge?
- How to handle regressions (fix one anomaly, introduce another)?

**Depends on:** WP-231, WP-232

### WP-234 — Full-Corpus Sweep Expansion (Beyond 2×2 Smoke)

**Concept:** Expand the nightly sweep from the current 2×2 smoke
(4 cells: 2 schemes × 2 masterminds, per D-20704) to the full corpus:
- All schemes × all masterminds (~32×32 = ~1024 cells)
- Multiple policy tiers (random + heuristic)
- Weekend full-sweep vs. weekday smoke-sweep schedule
- Anomaly regression detection across runs

**Key decisions needed:**
- Runtime budget (full sweep may take 30+ minutes)
- GitHub Actions minutes cost at full scale
- Whether to run on self-hosted runner vs. GitHub-hosted
- Manifest storage growth (1024 cells × daily = ~30k records/month)

**Depends on:** WP-209 (already done), can run in parallel with WP-231

### WP-235 — Pipeline Page Trend View (Multi-Run Anomaly Trends)

**Concept:** Extend the Pipeline page to show trends across sweep runs:
- Health rate over time (last 30 runs, same sparkline as `/system`)
- Anomaly class breakdown over time (stacked area chart)
- New-vs-resolved anomaly count per run
- Builder velocity: how quickly do sweep-found bugs get fixed?

**Key decisions needed:**
- Chart library (reuse whatever `/system` sparklines use, or upgrade?)
- Data source: `recentRuns` from `useSweepHealth` (already has 30 runs)
- Whether to add a dedicated "Trends" tab vs. inline in Pipeline page

**Depends on:** WP-230
