# EC-261 — Dashboard Agent Pipeline Page (Execution Checklist)

**Source:** docs/ai/work-packets/WP-229-dashboard-agent-pipeline-page.md
**Layer:** Dashboard — `apps/dashboard/src/composables/useAgentPipeline.{ts,test.ts}` (new) + `apps/dashboard/src/pages/pipeline/PipelinePage.vue` (new) + `apps/dashboard/src/router/index.ts` (modified) + `apps/dashboard/src/layouts/AppLayout.vue` (modified)

> Use locked values from WP-229 verbatim. EC-261 is the operational
> order + gates + failure smells; if EC-261 and WP-229 conflict, WP-229
> wins.

---

## Before Starting
- [ ] **WP-198 + WP-199 landed** — `apps/dashboard/src/composables/useGovernanceSnapshot.ts` exports `useGovernanceSnapshot(snapshotOverride?)`. Verify:
  `grep -n "export function useGovernanceSnapshot" apps/dashboard/src/composables/useGovernanceSnapshot.ts`
  returns ≥ 1.
- [ ] **Accessor surface present** (all required by lane derivation):
  `grep -nE "inFlight|blocked|nextExecutable|governanceKpis|commits|loadError" apps/dashboard/src/composables/useGovernanceSnapshot.ts`
  returns ≥ 5 distinct lines. If any accessor is absent, **STOP and ask** — do NOT modify `build-governance-snapshot.mjs` (follow-up WP scope).
- [ ] Read WP-229 §Goal, §Non-Negotiable Constraints, §Acceptance Criteria, §Scope (In/Out) — those sections are authoritative.
- [ ] Read `apps/dashboard/docs/code-checks-and-balances.md` §1–2 (the four-agent model this page visualizes).
- [ ] Read `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue` for the 4-state Widget Contract (`loading | empty | error | data`) to mirror in `PipelinePage.vue`.
- [ ] `pnpm --filter @legendary-arena/dashboard test` + `typecheck` + `build` exit 0 (anchor baseline test count).

## Locked Values (verbatim from WP-229 — do not re-derive)
- **Route:** `path: 'pipeline'`, `name: 'pipeline'`, `meta: { roles: ['admin', 'operator'] }`, lazy `component: () => import('../pages/pipeline/PipelinePage.vue')`.
- **Nav entry:** `{ to: '/pipeline', label: 'Pipeline', abbreviation: 'Pi' }` — appended to `NAV_ITEMS`; no other entry changes.
- **Lane order (left to right):** Architect, Builder, Inspector, Evaluator.
- **PipelineItem shape:** `{ id: string; label: string; meta?: string }` — `id` is a stable key (commit sha or synthetic string), `label` is the primary human-readable text, `meta` is optional supplemental context (e.g., commit kind, counts).
- **Lane data sources:**
  - Architect = `governanceKpis().openDrafts` + `commits(5)` where `kind === 'SPEC'`
  - Builder = `governanceKpis().wpsDoneThisWeek` + `inFlight()` + `commits(5)` where `kind === 'WP'`
  - Inspector = `nextExecutable(5)` + `blocked()`
  - Evaluator = single locked placeholder item only (exactly one item in `items`; `emptyMessage` not used)
- **`commits()` limit:** called with `5`; items rendered in returned order, no client-side sorting.
- **Locked Evaluator Placeholder** (byte-for-byte):
  `No acquisition-readiness evaluation recorded yet. Run the Evaluator quarterly per code-checks-and-balances.md §7.`
- **Composable signature:** `useAgentPipeline(snapshotOverride?)` returns `{ architect, builder, inspector, evaluator }`; each lane is `{ title: string; items: readonly PipelineItem[]; emptyMessage: string }`.
- **Import path:** `useGovernanceSnapshot` imported from `'./useGovernanceSnapshot.js'`.
- **Test naming:** `should_<behavior>_when_<condition>`; ≥ 7 cases.

## Guardrails
- **Single data source.** `useAgentPipeline.ts` MUST NOT import the baked snapshot JSON directly and MUST NOT contain `import.meta.env`. All lane data flows through `useGovernanceSnapshot`. Direct file import = HARD FAIL.
- **Exactly one route, one nav entry.** One `/pipeline` child route in `router/index.ts`; one `NAV_ITEMS` entry in `AppLayout.vue`. Duplicates = HARD FAIL.
- **4-state Widget Contract.** `PipelinePage.vue` MUST implement all four states: (1) loading indicator before snapshot resolution; (2) if `loadError` is non-null, a single unified error message renders — zero lane content; (3) per-lane `emptyMessage` when a lane has no items; (4) data state with four lane-cards. Missing loading or error state = HARD FAIL.
- **Evaluator = single item only.** Evaluator lane returns exactly one item in `items` containing the Locked Evaluator Placeholder byte-for-byte; `emptyMessage` MUST NOT be used for this lane. No fabricated score or status.
- **Null KPI guard.** If `governanceKpis()` returns `null`, KPI-derived items are omitted — never fabricated. Only commit/state items remain; if none, fall back to `emptyMessage`.
- **No cross-lane leakage.** No item (commit or otherwise) may appear in more than one lane in a single evaluation pass.
- **Builder classifier dependency.** Builder assumes `kind === 'WP'` covers execution commits per the generator's classifier; if this changes, a follow-up WP is required.
- **Additive only.** `GovernanceThroughputWidget`, `StatusFeedWidget`, `GovernanceKpiStrip`, and every other existing page/widget are untouched. Only the nine `## Files to Produce` paths appear in `git diff --name-only`.
- **No new npm deps; no `Math.random`; no `@legendary-arena/(game-engine|registry|preplan|server)` imports.**
- **Full file contents** for every new/modified file — diffs/snippets forbidden.

## Required `// why:` Comments
- `useAgentPipeline.ts` — `// why:` the composable accepts `snapshotOverride` and passes it to `useGovernanceSnapshot` so tests can inject deterministic fixtures without touching the baked snapshot file (D-22901 snapshot-only posture).
- `useAgentPipeline.ts` — `// why:` the Evaluator lane is a static placeholder — no acquisition-readiness data source exists in v1; enrichment is deferred to a follow-up WP per `code-checks-and-balances.md §7`.

> `AppLayout.vue` and `router/index.ts` carry **no** `// why:` comment by
> design — their contracts are minimal targeted additions whose rationale
> lives in D-22901 and the WP, not inline. Do not add comments to either
> file beyond the required code changes.

## Files to Produce
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **new** — four-lane view-model derived from `useGovernanceSnapshot`; no other data source.
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — **new** — ≥ 7 `node:test` cases: Architect (SPEC filtering + `openDrafts`), Builder (WP filtering + `inFlight`), Inspector (`nextExecutable(5)` + `blocked()`), Evaluator (`items.length === 1` + exact placeholder string), `loadError` (all lanes suppressed), null KPIs (no fabricated KPI items), `PipelineItem` shape conformance.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **new** — four lane-cards in Architect→Builder→Inspector→Evaluator order; 4-state Widget Contract.
- `apps/dashboard/src/router/index.ts` — **modified** — add one `/pipeline` child route.
- `apps/dashboard/src/layouts/AppLayout.vue` — **modified** — append one `NAV_ITEMS` entry; no other line changes.
- `docs/ai/STATUS.md` — **modified** — `### WP-229 / EC-261 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-22901 Active (Pipeline-page posture).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-229 `[x]` with DoD summary.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip EC-261 Pending → Done.

**Total: 9 files** (3 new + 2 modified source + 4 governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`).

## After Completing
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; suite includes ≥ 7 net-new `useAgentPipeline` cases; no prior test regresses.
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] Single-data-source grep (snapshot JSON + env access — both must return 0):
  `grep -rn "import.meta.env" apps/dashboard/src/composables/useAgentPipeline.ts`
- [ ] One route: `grep -cn "name: 'pipeline'" apps/dashboard/src/router/index.ts` → 1.
- [ ] One nav entry: `grep -cn "to: '/pipeline'" apps/dashboard/src/layouts/AppLayout.vue` → 1.
- [ ] Evaluator placeholder verbatim:
  `grep -n "No acquisition-readiness evaluation recorded yet" apps/dashboard/src/composables/useAgentPipeline.ts`
  returns exactly 1 match.
- [ ] Additive scope: `git diff --name-only` lists exactly the 9 `## Files to Produce` paths — no more, no less.
- [ ] `git diff -- apps/dashboard/src/widgets/` returns empty (zero changes inside existing widget files).
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-22901 Active; `WORK_INDEX.md` WP-229 `[x]`; `EC_INDEX.md` EC-261 → Done.

## Common Failure Smells
- `import.meta.env` in `useAgentPipeline.ts` → single-data-source HARD FAIL.
- Direct import of the baked snapshot JSON in `useAgentPipeline.ts` → single-data-source HARD FAIL.
- Evaluator lane with a fabricated readiness score or status indicator → placeholder violation.
- More than one `name: 'pipeline'` route in `router/index.ts` → duplicate route HARD FAIL.
- Any file outside the nine-path allowlist in `git diff --name-only` → additive-only violation; `GovernanceThroughputWidget.vue`, `StatusFeedWidget.vue`, or `GovernanceKpiStrip.vue` especially.
- Snapshot accessor absent from `useGovernanceSnapshot` (e.g., `nextExecutable` not exported) → STOP; do not patch the generator (follow-up WP scope).
- `loadError` non-null but individual lanes still render → error propagation violation (unified error, zero lane content).
- `governanceKpis()` returns `null` but KPI items appear → null-KPI guard violation; fabricated data.
- Evaluator lane has `items.length !== 1` or `emptyMessage` rendered → single-item invariant violated.
- Same commit sha appears in Architect AND Builder lanes → cross-lane leakage.

---

## DECISIONS.md Verbatim Block (D-22901)

> Per PS-1 convention (mirrors WP-226 / EC-258 precedent in this dashboard
> family): the D-22901 entry lands in `docs/ai/DECISIONS.md` at the
> execution-close governance commit byte-identical to the block below.
> Status flips from `Reserved (proposed)` at draft time to `Active` at
> landing; no other field changes.

### D-22901 — Dashboard Pipeline Page: Single-Page Four-Lane Layout, Snapshot-Only Data, Evaluator Placeholder v1, Lane-to-Accessor Mapping

**Decision:**
The operator dashboard's Pipeline page (`/pipeline`) presents the
Architect → Builder → Inspector → Evaluator separation-of-duties model as
one page with four lane-cards, not four separate routes. The four roles form
a handoff sequence whose relationships must be seen together; Inspector and
Evaluator have insufficient standalone data to justify their own pages in v1.

All lane data derives exclusively from `useGovernanceSnapshot` (the build-time
governance snapshot). `build-governance-snapshot.mjs` is not modified by this
WP; the Pipeline page consumes only the current accessor surface. Lane-to-accessor
mapping:
- Architect: `governanceKpis().openDrafts` + `commits(5)` where `kind === 'SPEC'`
- Builder: `governanceKpis().wpsDoneThisWeek` + `inFlight()` + `commits(5)` where `kind === 'WP'`
- Inspector: `nextExecutable(5)` + `blocked()` (best-available proxy; structured review-status deferred)
- Evaluator: static placeholder only (no acquisition-readiness data source exists in v1)

The Evaluator lane renders a single locked placeholder string byte-for-byte; no
score or readiness indicator is fabricated. Inspector enrichment (structured
`Needs review` / `Reviewed` status) and Evaluator data plumbing (acquisition-
readiness scoring, report storage) are both deferred to a follow-up WP that will
extend the snapshot generator. The Pipeline page is an internal operator-only
surface; it is a separate nav item from the revenue Overview per the
`dashboard-operating-system.md` audit (Overview is already governance-heavy).

**Packet:** WP-229 (EC-261).

**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close — flips to Active).
**Status:** Reserved (proposed)
