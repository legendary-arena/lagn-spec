# EC-270 — Triage Dashboard Surfaces (Execution Checklist)

**Source:** docs/ai/work-packets/WP-239-triage-dashboard-surfaces.md
**Layer:** Dashboard (`apps/dashboard/**`) only — no server/engine/registry/migration change; read-only consumption of two GET endpoints.

> Use locked values from WP-239 verbatim. EC-270 is the operational order +
> gates + failure smells; if EC-270 and WP-239 conflict, WP-239 wins.

## Before Starting

- [ ] WP-231/232/233 shipped: `GET /api/inspection/latest` + `GET /api/handoffs/latest` exist and return the locked envelopes; read `apps/server/src/inspection/inspection.types.ts` + `apps/server/src/handoff/handoff.types.ts` to copy the authoritative field sets (for the drift constants only — the dashboard does NOT import them).
- [ ] WP-206 shipped: `analyticsLiveFetchers.ts` exports `isLiveModeEnabled`; read it as the fetcher template. (WP-238 sweep-live, if landed, is a closer single-resource template — read `sweepLiveFetchers.ts` if present.)
- [ ] WP-211 shipped: read `types/sweep.drift.test.ts` as the layer-safe drift-guard template.
- [ ] WP-230 shipped: read `composables/useAgentPipeline.ts` + `pages/pipeline/PipelinePage.vue` to see the `sweepData?` injection mechanism the triage projection mirrors.
- [ ] **Baseline record (paste into the session log):** dashboard `test` pass/fail counts; `typecheck` (`vue-tsc --noEmit`) exit + any pre-existing errors; `build` exit.
- [ ] Confirm the shipped analytics LIVE fetchers' auth mechanism (cookie vs Authorization header) and replicate it EXACTLY.
- [ ] Read WP-239 §Goal, §Session Context, §Scope (In/Out), §Locked Contract Values, §Acceptance Criteria.

## Locked Values (verbatim from WP-239 — do not re-derive)

- LIVE-mode gate (D-20601, reused): `isLiveModeEnabled()` from `./analyticsLiveFetchers.js`; no second gate; `mocks.ts` free of `VITE_` literals.
- Inspection envelope: `{ data: { latest: InspectionReportSummary | null, recentReports: readonly InspectionReportSummary[] } }`.
- Handoff envelope: `{ data: { reportId: string | null, handoffs: readonly HandoffRecord[], counts: HandoffStatusCounts } }`.
- Verdict: `'PASS' | 'FAIL'`. Severity: `'P0' | 'P1' | 'P2'`. Route: `'Builder' | 'Architect'`.
- Handoff status (6): `'open' | 'claimed' | 'fix-proposed' | 'escalated' | 'resolved' | 'wont-fix'`.
- Counts keys (camelCase): `open, claimed, fixProposed, escalated, resolved, wontFix`.
- Item prefix `triage-`; meta tag `'Triage'`.
- Item ID grammar: `triage-summary-${reportId}` (one, backlog head), `triage-handoff-${handoffId}` (each lifecycle item; `handoffId = ${reportId}#${findingIndex}`), `triage-coherence-${reportId}` (handoff-stale marker). No other `triage-` id shapes.
- `anomalyClass` opacity (D-20703): opaque `string`; copy verbatim; no engine-union import.
- Fetch options: `{ credentials: 'include', headers: { Accept: 'application/json' } }`.
- Read-only: no `/transition` or `/verify` POST from the dashboard.
- Bucketing: open/claimed → backlog; fix-proposed/escalated → active; resolved/wont-fix → history.
- State precedence (mirrors `useSweepHealth.state`): error (either fetch failed) → loading (either unresolved) → empty (`inspection.latest === null` ONLY) → data. PASS report with 0 findings/handoffs = data, never empty.
- Coherence (D-23902): reportId skew = normal sync-lag (separate `inspection-submit` / `handoffs-sync` CI steps), NOT an error. `coherence` ∈ `{ 'coherent', 'handoff-stale' }`; skew (incl. `handoffs.reportId === null` with non-null latest) → `handoff-stale` + a `triage-coherence-` marker, lifecycle + distribution still rendered. Never `error`, never blank, on a skew.
- Ordering: handoffs consumed in server order `(findingIndex ASC, handoffId ASC)`; `useTriageStatus` never re-sorts them; the `useAgentPipeline` injection preserves projection order (no sweep fatal-first sort on triage items).
- Envelope-guard depth: structural only (object / array / nullable-key), per the shipped `isValidSweepEnvelope` posture; per-field + 6-key `counts` validation lives in the drift test, narrowed by the composable's defensive `?? 0`. No "partial counts → error" gate.
- `TriageProjection` is declared in `useAgentPipeline.ts` (with `PipelineItem`/`PipelineSweepData`); `useTriageStatus.ts` imports it + `PipelineItem` type-only — one-directional, no circular import. `types/triage.ts` stays wire-only (it must NOT import `PipelineItem`).

## Guardrails

- **App layer only.** Touch only `apps/dashboard/src/{types,services,composables,pages}/**` + the 5 governance files.
- **Re-declare, never import.** The dashboard mirrors the inspection/handoff envelopes locally; it MUST NOT import `apps/server` or `@legendary-arena/game-engine`. Drift constants are hand-copied + guarded by the drift test.
- **No second env gate.** Import `isLiveModeEnabled`; no `import.meta.env.VITE_USE_MOCKS` in `mocks.ts`. Fetchers may read `VITE_API_BASE_URL` for the URL only.
- **Read-only surface.** No `POST /api/handoffs/transition` or `/verify` anywhere in the dashboard. Display only.
- **Option A.** Inject into the existing Inspector lane via `triageData?` on `useAgentPipeline` — do NOT add a fifth lane/panel. Leave the other three lanes byte-identical in behaviour.
- **Synchronous getters, fail-silent.** Same as the sweep-live pattern: cached-or-sentinel return, fire-and-forget populate, no throw to the page, prior-state preservation on error. (Locked Values carry the guard-depth / coherence / empty-precedence / ordering rules in full.)
- **Pure composable.** `useTriageStatus` takes `currentTimeMs` as a parameter; never call `Date.now()` inside it (wall-clock-independence test enforces).
- **No `.reduce()`** for item bucketing — explicit `for…of` with descriptive names.
- **`typecheck` is a DoD gate.** Run `vue-tsc --noEmit` explicitly.

## Required `// why:` Comments

- `types/triage.ts` (D-20703) — why `anomalyClass` is opaque `string`, not the engine union.
- `types/triage.drift.test.ts` — why the field-set constants are hand-copied from the server types and not imported (layer boundary).
- `triageLiveFetchers.ts` (D-20601) — why `isLiveModeEnabled` is imported, not re-derived.
- `triageLiveFetchers.ts` — why `credentials: 'include'` (forward the WP-112 session).
- `useTriageStatus.ts` — why `currentTimeMs` is a parameter (wall-clock independence).
- `useTriageStatus.ts` (D-23902) — why a reportId skew degrades to `coherence: 'handoff-stale'` (separate `inspection-submit` / `handoffs-sync` CI steps make a skew normal sync-lag), not a fetch `error`.
- `useTriageStatus.ts` — why the handoff array is consumed in received order (server already orders `(findingIndex ASC, handoffId ASC)`; client preserves it for determinism + Vue keys). **Do NOT write the literal token `sort(` in this comment or anywhere in the file — the close-out grep expects zero matches (grep-gate self-trip).**
- `useTriageStatus.ts` — why the six `counts` keys are read with `?? 0` (a partial counts object renders 0, never `undefined`; matches `computeSweepHealthRate`'s defensive reads).
- `useAgentPipeline.ts` (D-23902) — why triage items inject only into the Inspector lane, in projection order (not through the sweep fatal-first sort).
- `mocks.ts` (D-23903) — why both triage fetchers are gated through the existing `liveMode`.

## Files to Produce

- `apps/dashboard/src/types/triage.ts` — **new** — inspection + handoff envelope mirrors.
- `apps/dashboard/src/types/triage.drift.test.ts` — **new** — layer-safe field-set drift guards.
- `apps/dashboard/src/services/triageMocks.ts` — **new** — `mockInspectionTriage` + `mockHandoffChain`.
- `apps/dashboard/src/services/triageLiveFetchers.ts` — **new** — `fetchInspectionTriageLive` + `fetchHandoffChainLive`.
- `apps/dashboard/src/services/triageLiveFetchers.test.ts` — **new** — fetcher unit tests.
- `apps/dashboard/src/composables/useTriageStatus.ts` — **new** — pure Inspector-lane projection.
- `apps/dashboard/src/composables/useTriageStatus.test.ts` — **new** — composable unit tests.
- `apps/dashboard/src/services/mocks.ts` — **modified** — gate both triage fetchers; re-export mock factories.
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** — `triageData?` param + Inspector-lane injection.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified** — fetch + `useTriageStatus` + pass projection.
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-239.
- `docs/ai/DECISIONS.md` — **modified** — D-23901, D-23902, D-23903 (Active).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-239 checked off + date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-270 → Done.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — WP-239 node → Done.

~15 files: 10 App source/test + 5 governance. (Operator-authorised >~8; may split into WP-239a/b — see WP-239 §Files Expected to Change.)

## After Completing

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; net-new triage tests added; pre-existing green vs baseline; drift guards pass.
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0; no new error vs baseline.
- [ ] `(Select-String triage.ts,triageLiveFetchers.ts -Pattern "@legendary-arena/game-engine","apps/server").Count` → 0.
- [ ] `Select-String triage.ts -Pattern "'fix-proposed'","'wont-fix'","anomalyClass: string"` → all match.
- [ ] `Select-String triageLiveFetchers.ts -Pattern "isLiveModeEnabled","credentials: 'include'"` → both match.
- [ ] `Select-String mocks.ts -Pattern "fetchInspectionTriage = liveMode","fetchHandoffChain = liveMode"` → 2 matches; `(Select-String mocks.ts -Pattern "VITE_").Count` → 0.
- [ ] `(Select-String triageLiveFetchers.ts,triageMocks.ts -Pattern "/transition","/verify").Count` → 0.
- [ ] `Select-String useTriageStatus.ts -Pattern "triage-summary-","triage-handoff-","triage-coherence-"` → all three id shapes present.
- [ ] `(Select-String useTriageStatus.ts -Pattern "sort\(").Count` → 0. **Scope this grep to `useTriageStatus.ts` ONLY** — `useAgentPipeline.ts` legitimately calls `.sort()` (sweep fatal-first, ~line 635); grepping it would false-trip. Coherence + injection-order behavior is proven by the AC-13/AC-14 unit tests, not by grep.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` updated (D-23901, D-23902, D-23903 Active).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-270 → Done.
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-239 → Done.

## Common Failure Smells

- Importing `apps/server` inspection/handoff types "to stay in sync" → layer violation. Re-declare locally; guard with the drift test.
- Naming the engine's closed anomaly-class union in `triage.ts` → widens D-20703. `anomalyClass` is opaque `string`.
- Adding a fifth lane/panel for triage → breaks four-lane symmetry. Inject into the Inspector lane (Option A).
- Wiring a `/transition` or `/verify` POST so an operator can "act" → out of scope; this surface is read-only. Defer to the §Future Work write-path WP.
- Calling `Date.now()` inside `useTriageStatus` → fails the wall-clock-independence test. Pass `currentTimeMs` in.
- `.reduce()` for status bucketing → use explicit `for…of`.
- Copy-pasting an array-envelope guard → both triage envelopes are objects (`{latest,recentReports}` and `{reportId,handoffs,counts}`).
- `fixProposed`/`wontFix` mis-cased back to `fix-proposed`/`wont-fix` in the counts object → drift test + typecheck fail. Status STRINGS are hyphenated; COUNTS keys are camelCase.
- Erroring / blanking the surface on a reportId skew → hides a freshly-submitted report's findings during the normal `inspection-submit` → `handoffs-sync` lag. Degrade to a `coherence: 'handoff-stale'` marker and keep rendering; `error` is for fetch failures only.
- Treating a PASS report with zero handoffs as `empty` → hides a green verdict. `empty` fires only on `inspection.latest === null`; PASS-clean is `data`.
- Re-sorting handoffs in `useTriageStatus` (or running triage items through `useAgentPipeline`'s sweep fatal-first sort) → breaks the locked `(findingIndex, handoffId)` order. Consume in received order; scope the `sort\(` grep to `useTriageStatus.ts` only (`useAgentPipeline.ts` ~line 635 sorts sweep legitimately) and keep the literal `sort(` out of its comments.
- Hard-gating a partial `counts` object to `error` → blanks the surface on one missing key. Keep the guard structural; read counts with `?? 0`; the 6-key assertion is the drift test's job.
- Declaring `TriageProjection` in `useTriageStatus.ts` (or in `types/triage.ts`) → circular type import, because the projection holds `PipelineItem[]` and `useAgentPipeline` consumes `TriageProjection`. Declare it in `useAgentPipeline.ts`; import it type-only into the composable.

## DECISIONS.md Entries (D-23901..D-23903)

Reserved in docs/ai/DECISIONS.md (Reserved (proposed) at draft → Active at close):
**D-23901** — Dashboard triage types are hand-maintained, layer-safe mirrors of the WP-231 inspection + WP-232 handoff server envelopes (`anomalyClass` opaque `string` per D-20703/D-23103), drift-guarded by committed server-derived field-set tests modelled on the WP-211 sweep drift guard; no `apps/server`/engine import. The `TriageProjection` view-model is declared in `useAgentPipeline.ts` alongside `PipelineItem`/`PipelineSweepData` (projection types live with the consumer composable) and imported type-only by `useTriageStatus.ts` — one-directional, no circular type import; `types/triage.ts` stays wire-only.
**D-23902** — Inspection findings + handoff lifecycle render INTO the existing Pipeline Inspector lane (Option A) via `triage-`-prefixed items injected through a `triageData?` projection parameter on `useAgentPipeline` (mirrors the `sweepData?` injection), not a new panel/lane; the surface is read-only (no `/transition` or `/verify` from the client). The projection carries a cross-source coherence gate: the inspection and handoff endpoints are fed by separate CI steps (`inspection-submit` vs `handoffs-sync`), so a reportId skew is normal sync-lag and degrades to a `coherence: 'handoff-stale'` marker with the surface still rendered — NOT a fetch `error`, never a blanked surface. Handoff rows render in their server order `(findingIndex ASC, handoffId ASC)` with no client re-sort.
**D-23903** — Triage fetchers ship LIVE-capable from day one using the WP-238 sweep-live pattern (shared `isLiveModeEnabled` gate, object-envelope shape guard, `credentials:'include'` session parity), so the surface does not recreate the mock-only gap; MOCK stays the local-dev/test default.
