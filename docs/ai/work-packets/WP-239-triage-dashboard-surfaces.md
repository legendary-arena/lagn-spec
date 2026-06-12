# WP-239 — Triage Dashboard Surfaces (Inspection Findings + Handoff Lifecycle on the Pipeline Inspector Lane)

**Status:** Draft
**Primary Layer:** Dashboard (`apps/dashboard/**`) only. No server, engine, registry, or migration change; no new endpoint; no new npm dependency. Read-only consumption of two already-`Wired` GET endpoints.
**Dependencies:** WP-231 ✅ (`GET /api/inspection/latest` + `inspection_reports`), WP-232 ✅ (`GET /api/handoffs/latest` + `finding_handoffs`), WP-233 ✅ (closed-loop verify transitions recorded on `finding_handoffs`), WP-230 ✅ (Pipeline page + Inspector lane + sweep-item injection precedent), WP-206 ✅ (`isLiveModeEnabled` LIVE-fetch gate), WP-211 ✅ (layer-safe type drift-guard pattern). Parallel-safe with WP-238 (both reuse the WP-206 gate independently; this WP defines its own object-envelope fetchers).

---

## Goal

After this session the closed-loop triage produced by WP-231/232/233 is
**visible to a human operator on the `/pipeline` Inspector lane** — not just in
Postgres and JSON endpoints. The lane shows the latest inspection verdict
(PASS/FAIL) with P0/P1/P2 finding counts, the individual findings, and each
finding's handoff lifecycle status (open → claimed → fix-proposed →
escalated/resolved/wont-fix) with per-status totals. Data is LIVE-capable from
day one through the shared `isLiveModeEnabled()` gate (MOCK in local-dev/tests),
so this surface does not recreate the mock-only gap WP-238 closes for sweep.

## Assumes

- `GET /api/inspection/latest` returns `{ data: { latest: InspectionReportSummary | null, recentReports: readonly InspectionReportSummary[] } }` where `InspectionReportSummary = { reportId, sweepRunId, submittedAt, generatedAt, verdict: 'PASS' | 'FAIL', counts: { p0, p1, p2 }, findings: readonly InspectionFinding[] }` and `InspectionFinding = { severity: 'P0' | 'P1' | 'P2', anomalyClass: string, cellId: string | null, description: string, route: 'Builder' | 'Architect' }`; `authenticated-session-required`; `recentReports.length ≤ 30`, ordered `submitted_at DESC`.
- `GET /api/handoffs/latest` returns `{ data: { reportId: string | null, handoffs: readonly HandoffRecord[], counts: HandoffStatusCounts } }` where `HandoffRecord = { handoffId, reportId, sweepRunId, findingIndex, severity, route, anomalyClass, cellId, description, status, branchRef: string | null, amendmentRequest: string | null, createdAt, updatedAt }`, `status ∈ { 'open' | 'claimed' | 'fix-proposed' | 'escalated' | 'resolved' | 'wont-fix' }`, and `HandoffStatusCounts = { open, claimed, fixProposed, escalated, resolved, wontFix }`; `authenticated-session-required`; `handoffs` ordered `(findingIndex ASC, handoffId ASC)`, `≤ 500` rows.
- The dashboard currently has **zero** `inspection`/`handoff` references (no types, services, or composables) — verified by grep of `apps/dashboard/src/**`.
- `apps/dashboard/src/composables/useAgentPipeline.ts` builds the four lanes and already accepts an injected sweep projection as its second argument (`useAgentPipeline(undefined, sweepData)` in `PipelinePage.vue`), injecting `sweep-`-prefixed items into lane sections.
- `apps/dashboard/src/services/analyticsLiveFetchers.ts` exports `isLiveModeEnabled()` and the synchronous-getter + cached-`Ref` + fail-silent LIVE-fetch pattern.
- `apps/dashboard/src/types/sweep.drift.test.ts` exists and demonstrates the layer-safe drift guard (committed server-derived field-set constant + `Object.keys` deep-equal; no `apps/server` import).
- The shipped analytics LIVE fetchers authenticate successfully against the same `requireAuthenticatedSession` orchestrator (WP-112).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

## Session Context

WP-231/232/233 shipped the closed loop: a nightly Inspector session triages the
latest sweep into `inspection_reports`; each finding becomes a `finding_handoffs`
lifecycle row; the verify step transitions rows to `resolved` (anomaly gone) or
`claimed` (regressed). All three WPs **explicitly deferred their dashboard
surface** — so today the only human view is the session-gated JSON endpoints or
raw SQL. This WP builds the deferred surface.

The rendering target is the existing Pipeline **Inspector lane** (WP-229/230),
which already injects `sweep-`-prefixed items into its backlog/active/history
sections via a projection passed into `useAgentPipeline`. We mirror that exact
mechanism with a `triage-` prefix (Option A — integrate into the Inspector lane,
not a new panel), because findings + their handoff lifecycle ARE the Inspector's
work, and a separate fifth card would break the four-lane symmetry. The dashboard
re-declares the two server envelopes locally (layer boundary forbids importing
`apps/server`), guarded by drift tests modelled on `types/sweep.drift.test.ts`.

This surface is **read-only**: it never calls `POST /api/handoffs/transition` or
`POST /api/handoffs/verify` (those stay CI/operator-API concerns).

## Scope (In)

**A) Triage envelope types — `apps/dashboard/src/types/triage.ts` (NEW)**
Layer-safe local mirrors of both server envelopes: `InspectionReportSummary`,
`InspectionFinding`, `InspectionVerdict = 'PASS' | 'FAIL'`,
`InspectionSeverity = 'P0' | 'P1' | 'P2'`, `TriageRoute = 'Builder' | 'Architect'`,
`InspectionLatestData = { latest, recentReports }`; and `HandoffRecord`,
`HandoffStatus` (6-member union), `HandoffStatusCounts`,
`HandoffLatestData = { reportId, handoffs, counts }`. `anomalyClass` is opaque
`string` (carry-forward of D-20703/D-23103) — never the engine's closed union. No
`apps/server`/engine import.

**B) Drift guard — `apps/dashboard/src/types/triage.drift.test.ts` (NEW)**
Mirror `types/sweep.drift.test.ts`: committed server-derived field-set constants
for `InspectionReportSummary`, `InspectionFinding`, and `HandoffRecord`, plus the
`HandoffStatus` member set and `HandoffStatusCounts` keys; fully-typed sample
literals; `Object.keys(sample).sort()` deep-equal + count assertions; loud
per-field reconcile messages naming the authoritative server file. No
`apps/server` import.

**C) Mock factories — `apps/dashboard/src/services/triageMocks.ts` (NEW)**
`mockInspectionTriage(nowMs: number): ServiceResponse<InspectionLatestData>` and
`mockHandoffChain(nowMs: number): ServiceResponse<HandoffLatestData>`, both
`source: 'MOCK'`. The default fixtures MUST be **coherent and exercise every
render path**:
- a **FAIL** report with at least one finding of **each severity** (P0, P1, P2);
- handoffs spanning **all six** lifecycle statuses so **every** lane bucket
  (backlog / active / history) renders ≥ 1 item in dev;
- `mockInspectionTriage.latest.reportId === mockHandoffChain.reportId` (the
  default MOCK render is `coherence: 'coherent'` — the skew path is exercised by
  the composable test (I), not the default fixture);
- `counts` consistent with the handoff statuses (sums to `handoffs.length`).

**D) LIVE fetchers — `apps/dashboard/src/services/triageLiveFetchers.ts` (NEW)**
`fetchInspectionTriageLive` + `fetchHandoffChainLive`, mirroring the WP-238
sweep-live pattern: synchronous getter returning cached-or-LIVE-sentinel,
fire-and-forget populate, shared `isLiveModeEnabled()` (re-imported, not
re-derived), `FETCH_OPTIONS` with `credentials: 'include'` matching the shipped
analytics fetchers, object-envelope shape guards, fail-silent with prior-state
preservation, `__testHooks`. URLs `…/api/inspection/latest` and
`…/api/handoffs/latest`.

Each guard validates **its own object envelope at structural depth** —
matching the deliberately lightweight `isValidSweepEnvelope` posture
(`sweepLiveFetchers.ts`: *"per-field schema validation is the drift test's job,
not this guard's"*), not a per-field schema:
- **Inspection guard:** value is a non-null object; `value.data` is a non-null
  object; `data.latest` is `null` OR a non-null object; `data.recentReports` is
  an array.
- **Handoff guard:** value is a non-null object; `value.data` is a non-null
  object; the `data.reportId` key is present and is `string | null`;
  `data.handoffs` is an array; `data.counts` is a non-null object.

The six camelCase `counts` keys and the per-record field sets are asserted by
the **drift test (B)** + narrowed by the composable's defensive `?? 0` reads —
NOT by a hard "partial counts → error" gate (which would blank the whole
surface on one missing key). A malformed envelope is fail-silent: the guard
returns false, the prior cache state is preserved, no throw reaches the page.

**E) Pipeline projection composable — `apps/dashboard/src/composables/useTriageStatus.ts` (NEW)**
Pure function of `(inspectionFetchState, handoffFetchState, currentTimeMs)`
(Date.now sampled once at the page render boundary, passed in — WP-204
wall-clock discipline). Returns a `TriageProjection` for the Inspector lane.

The `TriageProjection` view-model interface is **declared in
`useAgentPipeline.ts`** (Scope G), alongside the existing `PipelineItem` +
`PipelineSweepData` types — projection/lane types live with the consumer
composable that injects them, exactly as `PipelineSweepData` does today.
`useTriageStatus.ts` imports `TriageProjection` + `PipelineItem` **type-only**
from `./useAgentPipeline.js` and returns a `TriageProjection`. This keeps the
dependency one-directional (`useTriageStatus` → `useAgentPipeline`) with **no
circular type import**, and `types/triage.ts` stays wire-only (it must NOT
import `PipelineItem`, which would re-introduce the cycle). Shape:

```ts
export interface TriageProjection {
  readonly state: 'loading' | 'empty' | 'error' | 'data';
  // why: cross-source coherence is ORTHOGONAL to the fetch state machine —
  // `error` stays reserved for fetch failures (sweep-state-machine parity).
  // Meaningful only when state === 'data'; 'coherent' otherwise.
  readonly coherence: 'coherent' | 'handoff-stale';
  readonly summary: { readonly verdict: InspectionVerdict; readonly counts: { readonly p0: number; readonly p1: number; readonly p2: number } } | null;
  readonly backlog: readonly PipelineItem[];   // PipelineItem imported from ./useAgentPipeline.js
  readonly active: readonly PipelineItem[];
  readonly history: readonly PipelineItem[];
  readonly distribution: HandoffStatusCounts | null;
}
```

Derivations:
- **State machine (single precedence, mirrors `useSweepHealth.state`):**
  `error` when either fetch failed → `loading` when either response is still
  unresolved → `empty` ONLY when `inspection.latest === null` (no report yet) →
  `data` otherwise. A PASS report with zero findings / zero handoffs is `data`
  (green verdict, empty buckets), **never** `empty` — do not hide a passing
  verdict. `error` is reserved for fetch failures; a reportId skew is NOT an
  error (see coherence below).
- **Summary item:** when `state === 'data'`, emit exactly one summary item
  (id `triage-summary-${reportId}`, meta `'Triage'`) at the **head of the
  Inspector backlog**, carrying the verdict + P0/P1/P2 counts from
  `inspection.latest`. The structured `summary` field mirrors it for tests.
- **Cross-source coherence gate (D-23902):** `inspection.latest.reportId` is fed
  by `inspection-submit`; `handoffs.reportId` by the separate `handoffs-sync`
  step — so a skew is the **normal nightly sync-lag window**, not corruption.
  When `inspection.latest !== null` and (`handoffs.reportId === null` OR
  `handoffs.reportId !== inspection.latest.reportId`): set
  `coherence = 'handoff-stale'`, emit a `triage-coherence-${reportId}` marker
  item (second backlog item, naming the skew: showing report X, lifecycle last
  synced for report Y) and KEEP rendering the lifecycle + distribution. Never
  blank the surface and never enter `error` on a skew — that would hide a
  freshly-submitted report's findings during a routine sync lag. When the
  reportIds match: `coherence = 'coherent'`, no marker.
- **Lifecycle items (from `handoffs`, in server order):** open/claimed →
  backlog; fix-proposed/escalated → active (with `branchRef` / `amendmentRequest`
  shown); resolved/wont-fix → history. Each item id is
  `triage-handoff-${handoffId}`, meta `'Triage'`, severity-tagged. Handoffs
  arrive pre-ordered `(findingIndex ASC, handoffId ASC)`; this composable
  **preserves that order and never re-orders the rows** (no `.sort` on the
  handoff array — determinism + Vue-key stability).
- **Distribution:** the `HandoffStatusCounts` object, read defensively — each of
  the six camelCase keys via `?? 0` so a partial counts object from a stale
  server deploy renders 0, never `undefined` (mirrors `computeSweepHealthRate`'s
  defensive `typeof === 'number'` reads). `null` only outside the `data` arm.

No `.reduce()` for the item-building; explicit `for…of`.

**F) Gate the fetchers — `apps/dashboard/src/services/mocks.ts` (MODIFIED)**
Add, mirroring the analytics/sweep blocks: re-export `mockInspectionTriage` /
`mockHandoffChain` for tests, and
`export const fetchInspectionTriage = liveMode ? fetchInspectionTriageLive : mockInspectionTriage;`
(and the handoff equivalent), reusing the existing `liveMode`. No new env-var
literal.

**G) Inspector-lane injection — `apps/dashboard/src/composables/useAgentPipeline.ts` (MODIFIED)**
Declare the `TriageProjection` interface here (next to `PipelineItem` +
`PipelineSweepData`; §Scope E gives the shape), accept an optional third
argument `triageData?: TriageProjection` (mirroring the existing `sweepData?`
parameter), and inject the `triage-`-prefixed items into the Inspector lane
backlog/active/history alongside the existing sweep + WP-status items, **in the
order the projection supplies them**. The triage items MUST NOT
be run through the existing sweep fatal-first `.sort()` (that sort applies only
to `sweepAnomaliesWithCount`); triage order is already fixed upstream by the
server + the composable. No change to the other three lanes.

**H) Page wiring — `apps/dashboard/src/pages/pipeline/PipelinePage.vue` (MODIFIED)**
Build the two fetch states from `fetchInspectionTriage` / `fetchHandoffChain`
(via `mocks.js`), pass them + `nowMs` into `useTriageStatus`, and pass the
resulting projection as the new third argument to `useAgentPipeline`. Reuse the
existing lane rendering (no new template structure).

**I) Composable + fetcher tests — `apps/dashboard/src/composables/useTriageStatus.test.ts` (NEW) and `apps/dashboard/src/services/triageLiveFetchers.test.ts` (NEW)**
Composable tests: the four state arms; verdict/count surfacing; correct
backlog/active/history bucketing per status; **`inspection.latest === null` →
`empty`**; **PASS report with zero handoffs → `data` (not `empty`), summary
present, buckets empty**; error handling; **reportId skew → `coherence:
'handoff-stale'` + a `triage-coherence-` marker, state still `data`, lifecycle
still rendered**; **matching reportId → `coherence: 'coherent'`, no marker**;
**handoff order preserved (a server array given in `(findingIndex, handoffId)`
order produces items in that exact order — no re-sort)**; wall-clock
independence. Fetcher tests: gate truth table; both object-envelope guards
(including **a malformed / array-shaped envelope → guard returns false, prior
state preserved, no state mutation**, and **a partial `counts` object passes the
lightweight guard but the composable reads missing keys as 0**); sentinel
behaviour; cache dedupe; error non-regression; `credentials: 'include'`
presence. `node:test`/`node:assert` only; no network; no boardgame.io.

## Out of Scope

- **Server-side changes** — the three triage WPs' routes, types, logic, and
  tables are untouched; this WP only consumes `GET /api/inspection/latest` and
  `GET /api/handoffs/latest`.
- **Write actions from the dashboard** — no `POST /api/handoffs/transition`, no
  `POST /api/handoffs/verify`; the surface is strictly read-only.
- **New lane or new page** — Option B (a separate "Triage" panel/fifth card) is
  rejected; integrate into the existing Inspector lane (Option A).
- **The other three lanes** (Architect, Builder, Evaluator) — unchanged.
- **Sweep panels / `useSweepHealth` / `useSweepTrend`** — untouched; that surface
  is WP-238's concern.
- **`recentReports` history rendering beyond the latest report** — v1 renders the
  latest inspection report + the current handoff snapshot; a multi-report trend
  is deferred (§Future Work).
- **Engine anomaly-class semantics** — `anomalyClass` stays an opaque `string`;
  no per-class branching, no engine union import (D-20703).
- **A bespoke fetch/caching framework** — reuse the WP-238 sweep-live shape; no
  SWR/polling/retry.

## Files Expected to Change

- `apps/dashboard/src/types/triage.ts` — **new** — local mirrors of the inspection + handoff envelopes; `anomalyClass` opaque `string`.
- `apps/dashboard/src/types/triage.drift.test.ts` — **new** — layer-safe field-set drift guards for both summaries + the status union/counts.
- `apps/dashboard/src/services/triageMocks.ts` — **new** — `mockInspectionTriage` + `mockHandoffChain` (`source: 'MOCK'`).
- `apps/dashboard/src/services/triageLiveFetchers.ts` — **new** — `fetchInspectionTriageLive` + `fetchHandoffChainLive` (object-envelope guards, shared gate, credentials parity).
- `apps/dashboard/src/services/triageLiveFetchers.test.ts` — **new** — fetcher unit tests.
- `apps/dashboard/src/composables/useTriageStatus.ts` — **new** — pure projection composable feeding the Inspector lane.
- `apps/dashboard/src/composables/useTriageStatus.test.ts` — **new** — composable unit tests.
- `apps/dashboard/src/services/mocks.ts` — **modified** — gate `fetchInspectionTriage`/`fetchHandoffChain`; re-export the mock factories; no new env-var literal.
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** — accept `triageData?` and inject `triage-`-prefixed items into the Inspector lane.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified** — fetch + `useTriageStatus` + pass projection to `useAgentPipeline`.
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-239.
- `docs/ai/DECISIONS.md` — **modified** — D-23901, D-23902, D-23903 (Active at close).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-239 checked off with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-270 status flipped to Done.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — WP-239 node flipped to Done.

~15 files: 10 App source/test + 5 governance. Exceeds the lint §5 ~8-file
guideline — operator-authorised (one cohesive triage surface; the two endpoints
share the lane and the live-fetch plumbing; mirrors the 15-file footprint of the
WP-235 dashboard WP). **May be split** into WP-239a (inspection findings) +
WP-239b (handoff lifecycle) if smaller execution sessions are preferred; the
type/drift files would then be shared by 239a.

## Locked Contract Values

- **LIVE-mode gate (D-20601, reused):** `isLiveModeEnabled()` from `./analyticsLiveFetchers.js`; no second gate; `mocks.ts` stays free of `VITE_`-prefixed literals.
- **Inspection envelope:** `{ data: { latest: InspectionReportSummary | null, recentReports: readonly InspectionReportSummary[] } }`.
- **Handoff envelope:** `{ data: { reportId: string | null, handoffs: readonly HandoffRecord[], counts: HandoffStatusCounts } }`.
- **Verdict union:** `'PASS' | 'FAIL'` (server-recomputed; FAIL iff any P0 or P1).
- **Severity union:** `'P0' | 'P1' | 'P2'`. **Route union:** `'Builder' | 'Architect'`.
- **Handoff status union (6):** `'open' | 'claimed' | 'fix-proposed' | 'escalated' | 'resolved' | 'wont-fix'`.
- **Counts keys (camelCase):** `open, claimed, fixProposed, escalated, resolved, wontFix` (`fix-proposed`→`fixProposed`, `wont-fix`→`wontFix`).
- **Item prefix / tag:** every injected lane item ID starts `triage-`; meta tag `'Triage'`.
- **Item ID grammar:** `triage-summary-${reportId}` (the one verdict/counts summary item, backlog head); `triage-handoff-${handoffId}` (each lifecycle item; `handoffId` is `${reportId}#${findingIndex}`); `triage-coherence-${reportId}` (the handoff-stale marker). No other `triage-` id shapes.
- **`anomalyClass` opacity (D-20703):** opaque `string`; copy verbatim; no engine-union import.
- **Fetch options:** `{ credentials: 'include', headers: { Accept: 'application/json' } }`.
- **Read-only:** no `POST /api/handoffs/transition` / `/verify` from the dashboard.
- **Lane bucketing:** open/claimed → backlog; fix-proposed/escalated → active; resolved/wont-fix → history.
- **State precedence (mirrors `useSweepHealth.state`):** `error` (either fetch failed) → `loading` (either unresolved) → `empty` (`inspection.latest === null` only) → `data`. A PASS report with zero findings/handoffs is `data`, never `empty`.
- **Cross-source coherence (D-23902):** a reportId skew between the two endpoints is normal sync-lag (separate `inspection-submit` vs `handoffs-sync` CI steps), NOT an error. `coherence` ∈ `{ 'coherent', 'handoff-stale' }`: equal reportIds → `coherent`; `inspection.latest.reportId !== handoffs.reportId` (incl. `handoffs.reportId === null` with a non-null latest) → `handoff-stale` + a `triage-coherence-` marker, **lifecycle + distribution still rendered**. `error` is reserved for fetch failures; a skew never blanks the surface.
- **Deterministic ordering:** handoffs are consumed in their server order `(findingIndex ASC, handoffId ASC)`; `useTriageStatus` MUST NOT re-order them (no `.sort` on the handoff array), and the `useAgentPipeline` injection preserves projection order (no sweep fatal-first sort applied to triage items).
- **Envelope-guard depth:** structural only (object / array / nullable-key checks), matching the shipped `isValidSweepEnvelope` posture; per-field + 6-key `counts` validation lives in the drift test (B), narrowed at read time by the composable's defensive `?? 0`. No hard "partial counts → error" gate.
- **`TriageProjection` shape** (declared in `useAgentPipeline.ts` with `PipelineItem`/`PipelineSweepData`; imported type-only by `useTriageStatus.ts` — no circular import; `types/triage.ts` stays wire-only): `{ state, coherence, summary, backlog, active, history, distribution }` per §Scope E.

## Acceptance Criteria

1. `types/triage.ts` declares both envelopes + all four closed unions locally with `anomalyClass: string`, and imports nothing from `apps/server`/engine.
2. `types/triage.drift.test.ts` asserts the dashboard `InspectionReportSummary`, `InspectionFinding`, and `HandoffRecord` field sets and the `HandoffStatus` member set against committed server-derived constants, with loud reconcile messages — and passes.
3. `triageLiveFetchers.ts` exports `fetchInspectionTriageLive` + `fetchHandoffChainLive` as synchronous getters using the shared `isLiveModeEnabled()`, object-envelope guards, and `credentials: 'include'`; no second env gate.
4. `triageMocks.ts` exports `mockInspectionTriage`/`mockHandoffChain` returning `source: 'MOCK'` with findings spanning P0/P1/P2 and handoffs spanning all six statuses.
5. `mocks.ts` exports `fetchInspectionTriage`/`fetchHandoffChain` gated as `liveMode ? …Live : mock…`, re-exports both mock factories, and contains zero `VITE_`-prefixed literals.
6. `useTriageStatus.ts` is a pure function of `(inspectionFetchState, handoffFetchState, currentTimeMs)` (no internal `Date.now()`), declares the `TriageProjection` interface, exposes the four state arms with `empty` keyed on `inspection.latest === null` only, emits one `triage-summary-${reportId}` item at the backlog head when `data`, and buckets lifecycle items open/claimed→backlog, fix-proposed/escalated→active, resolved/wont-fix→history, all `triage-`-prefixed.
7. `useAgentPipeline.ts` accepts `triageData?` as its third argument and injects the triage items only into the Inspector lane; the other three lanes are unchanged.
8. `PipelinePage.vue` builds both fetch states via `mocks.js`, calls `useTriageStatus`, and passes the projection to `useAgentPipeline`; no new template structure.
9. The dashboard issues no triage write request — grep finds no `transition`/`verify` POST in the new files.
10. `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 with no new error vs the baseline recorded at session start.
11. `pnpm --filter @legendary-arena/dashboard test` exits 0 with net-new triage tests added and the pre-existing suite green.
12. `pnpm --filter @legendary-arena/dashboard build` exits 0.
13. `useTriageStatus` applies the cross-source coherence gate: equal reportIds → `coherence: 'coherent'` (no marker); a skew (incl. `handoffs.reportId === null` with a non-null `inspection.latest`) → `coherence: 'handoff-stale'` with a `triage-coherence-${reportId}` marker, `state` still `data`, and the lifecycle + distribution still rendered — never `error`, never a blank surface.
14. `useTriageStatus` preserves the server handoff order `(findingIndex ASC, handoffId ASC)` with no re-sort, and the `useAgentPipeline` injection preserves projection order — both proven by an order-asserting unit test; `Select-String useTriageStatus.ts -Pattern "sort\("` → 0.
15. The four-arm state precedence matches `useSweepHealth.state` (error→loading→empty→data), `empty` fires only on `inspection.latest === null`, and a PASS report with zero findings/handoffs resolves to `data` (summary present, buckets empty) — proven by unit tests.

## Verification Steps

```pwsh
# 1. Local-only envelope mirrors (no server/engine import in triage files)
(Select-String -Path "apps/dashboard/src/types/triage.ts","apps/dashboard/src/services/triageLiveFetchers.ts" -Pattern "@legendary-arena/game-engine","apps/server").Count
# Expected: 0

# 2. Closed unions + opacity present in the type mirror
Select-String -Path "apps/dashboard/src/types/triage.ts" -Pattern "'fix-proposed'","'wont-fix'","anomalyClass: string"
# Expected: all three match

# 3. Fetchers use the shared gate + credentials, define their own guards
Select-String -Path "apps/dashboard/src/services/triageLiveFetchers.ts" -Pattern "isLiveModeEnabled","credentials: 'include'","fetchInspectionTriageLive","fetchHandoffChainLive"
# Expected: all four match

# 4. mocks.ts gates both triage fetchers; no env-var literal
Select-String -Path "apps/dashboard/src/services/mocks.ts" -Pattern "fetchInspectionTriage = liveMode","fetchHandoffChain = liveMode"
(Select-String -Path "apps/dashboard/src/services/mocks.ts" -Pattern "VITE_").Count
# Expected: 2 ternary matches; 0 env-var matches

# 5. Read-only: no write endpoints from the dashboard
(Select-String -Path "apps/dashboard/src/services/triageLiveFetchers.ts","apps/dashboard/src/services/triageMocks.ts" -Pattern "/transition","/verify").Count
# Expected: 0

# 6. Triage items injected with the locked prefix + ID grammar
Select-String -Path "apps/dashboard/src/composables/useTriageStatus.ts" -Pattern "triage-summary-","triage-handoff-","triage-coherence-"
# Expected: all three id shapes present

# 7. No client-side handoff re-sort in the composable.
#    SCOPED to useTriageStatus.ts ONLY — useAgentPipeline.ts legitimately calls
#    `.sort()` (sweep fatal-first, line ~635), so do NOT grep that file for it.
#    Keep the literal token `sort(` out of comments in this file too (self-trip).
(Select-String -Path "apps/dashboard/src/composables/useTriageStatus.ts" -Pattern "sort\(").Count
# Expected: 0
# (Cross-source coherence + injection order-preservation are behavioral —
#  proven by the AC-13/AC-14 unit tests, not by grep.)

# 8. Build / test / typecheck
pnpm --filter @legendary-arena/dashboard typecheck   # Expected: exit 0, no new error vs baseline
pnpm --filter @legendary-arena/dashboard test        # Expected: exit 0, triage tests added, pre-existing green
pnpm --filter @legendary-arena/dashboard build       # Expected: exit 0
```

## Definition of Done

- [ ] All 15 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (net-new triage tests; pre-existing green)
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 — NO new error vs the baseline recorded at session start
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] Triage files import nothing from `apps/server`/engine; drift guards pass
- [ ] `mocks.ts` contains zero `VITE_`-prefixed literals and gates both triage fetchers via the existing `liveMode`
- [ ] The dashboard issues no triage write request (no `/transition`, `/verify`)
- [ ] Governance updated: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-23901, D-23902, D-23903 Active), `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`, `docs/05-ROADMAP-MINDMAP.md`
- [ ] No files outside `## Files Expected to Change` were modified

## Vision Alignment

**N/A.** This WP lands an operator-only internal triage surface: it renders
already-persisted inspection findings + handoff lifecycle on the admin/operator
Pipeline page. It touches no §17.1 trigger surface — no scoring/PAR/leaderboard,
no replay storage, no RNG sourcing or determinism guarantee, no card data, no
monetization, no public surface (the dashboard is auth-gated to admin/operator
roles). The underlying triage data is produced by WP-231/232/233 and is unchanged
here. Per the WP-235 precedent (also an operator-only sweep-derived surface,
marked N/A), no clause list is required.

## Funding Surface Gate

**N/A.** No global-nav funding affordance, no Registry-viewer funding surface, no
account funding attribution, no user-visible funding copy (WP-097 G-1..G-7 all
untouched). Operator-only dashboard.

## API Catalog Update

**N/A.** No HTTP endpoint and no `apps/server/src/**` library function is added,
modified, removed, or status-changed. `GET /api/inspection/latest` and
`GET /api/handoffs/latest` are already catalogued `Wired` /
`authenticated-session-required`; this WP only makes the client consume them.
Per §21.4, this is the N/A path with justification.

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-11:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present and non-empty; Out of Scope lists 8 exclusions (server, write actions, new lane/page, other lanes, sweep panels, multi-report history, anomaly semantics, bespoke fetch framework) |
| 2 | PASS | Engine-wide + packet-specific constraints via the standard preamble; locked values explicit; ESM/Node v22/`node:`/full-file/human-style per 00.6 apply |
| 3 | PASS | `## Assumes` lists both endpoint envelopes with exact field sets + the zero-existing-references fact; BLOCKED clause present |
| 4 | PASS | Context cites the two endpoints, the Inspector-lane injection precedent, the drift-guard pattern, D-20703, ARCHITECTURE Layer Boundary |
| 5 | CONDITIONAL PASS | ~15 files (>~8 guideline) — operator-authorised, cohesive single surface; split option documented (WP-239a/b). Every file has a disposition |
| 6 | PASS | Envelope field names (`fixProposed`/`wontFix`, `anomalyClass`, `verdict`, severity/route/status unions) match the WP-231/232 server contracts exactly |
| 7 | PASS | No new npm dependency; built-in `fetch` only |
| 8 | PASS | Dashboard-only; re-declares server envelopes locally (no `apps/server`/engine import); no DB/WebSocket; read-only |
| 9 | PASS | PowerShell `Select-String` greps; no Unix assumptions |
| 10 | PASS | No new env var (reuses the shared gate); no secret in output |
| 11 | N/A | No new auth model; reuses the shipped WP-112 session via `credentials: 'include'` parity |
| 12 | PASS | `node:test`/`node:assert` only; no boardgame.io; no network/DB in tests; composable tests cover wall-clock independence, the coherence skew/`handoff-stale` marker, empty-vs-PASS-clean precedence, and handoff order-preservation; fetcher tests cover malformed/array envelope + partial-`counts` defensive read |
| 13 | PASS | Exact `pnpm --filter` commands with expected output |
| 14 | PASS | 15 binary, observable acceptance criteria aligned to deliverables (12 base + 13 coherence gate, 14 ordering, 15 state precedence) |
| 15 | PASS | DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/ROADMAP + scope-boundary check |
| 16 | PASS | Human-style: no premature abstraction, explicit `for…of` bucketing (no `.reduce()`), JSDoc, descriptive names, `// why:` on non-obvious choices |
| 17 | N/A | No scoring/replay/RNG/card-data/monetization/public surface (see Vision Alignment) |
| 18 | PASS | Greps target presence patterns, not forbidden-token enumerations |
| 19 | N/A | Not a repo-state-summarizing artifact |
| 20 | N/A | No funding surface (see Funding Surface Gate) |
| 21 | N/A | No endpoint/library-function surface touched (see API Catalog Update) |

Reserved decisions (Active at close): **D-23901** — dashboard triage types are
hand-maintained, layer-safe mirrors of the WP-231/232 server envelopes
(`anomalyClass` opaque `string` per D-20703/D-23103), drift-guarded by committed
server-derived field-set tests; no `apps/server`/engine import; the
`TriageProjection` view-model is declared in `useAgentPipeline.ts` alongside
`PipelineItem`/`PipelineSweepData` (projection types live with the consumer
composable) and imported type-only by `useTriageStatus.ts` — one-directional,
no circular type import; `types/triage.ts` stays wire-only.
**D-23902** — inspection findings + handoff lifecycle render INTO the existing
Inspector lane (Option A) via `triage-`-prefixed items injected through a
`triageData?` projection param on `useAgentPipeline` (mirrors the `sweepData?`
injection), not a new panel; the surface is read-only (no `/transition` or
`/verify` from the client). The projection carries a cross-source coherence gate:
because the inspection and handoff endpoints are fed by separate CI steps
(`inspection-submit` vs `handoffs-sync`), a reportId skew is normal sync-lag and
degrades to a `coherence: 'handoff-stale'` marker with the surface still
rendered — NOT a fetch `error` and never a blanked surface; handoff rows are
rendered in their server order `(findingIndex ASC, handoffId ASC)` with no
client re-sort. **D-23903** — triage fetchers ship LIVE-capable from day one using the
WP-238 sweep-live pattern (shared `isLiveModeEnabled` gate, object-envelope
guard, `credentials:'include'`), so the surface does not recreate the mock-only
gap; MOCK stays the local-dev/test default.

## Future Work Packets

### WP — Triage multi-report trend + handoff aging
**Concept:** render the last-30 `recentReports` as a verdict/finding-count trend
and surface handoff aging (time-in-status) once v1 lands.
**Depends on:** WP-239.

### WP — Operator handoff actions (write path)
**Concept:** allow an operator to drive `POST /api/handoffs/transition` from the
lane (claim / mark wont-fix) behind a confirmation. Out of scope here because it
crosses from read-only display into authenticated mutation + needs a UX +
optimistic-update contract.
**Depends on:** WP-239, plus an auth/mutation design decision.
