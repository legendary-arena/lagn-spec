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
- `anomalyClass` opacity (D-20703): opaque `string`; copy verbatim; no engine-union import.
- Fetch options: `{ credentials: 'include', headers: { Accept: 'application/json' } }`.
- Read-only: no `/transition` or `/verify` POST from the dashboard.
- Bucketing: open/claimed → backlog; fix-proposed/escalated → active; resolved/wont-fix → history.

## Guardrails

- **App layer only.** Touch only `apps/dashboard/src/{types,services,composables,pages}/**` + the 5 governance files.
- **Re-declare, never import.** The dashboard mirrors the inspection/handoff envelopes locally; it MUST NOT import `apps/server` or `@legendary-arena/game-engine`. Drift constants are hand-copied + guarded by the drift test.
- **No second env gate.** Import `isLiveModeEnabled`; no `import.meta.env.VITE_USE_MOCKS` in `mocks.ts`. Fetchers may read `VITE_API_BASE_URL` for the URL only.
- **Read-only surface.** No `POST /api/handoffs/transition` or `/verify` anywhere in the dashboard. Display only.
- **Option A.** Inject into the existing Inspector lane via `triageData?` on `useAgentPipeline` — do NOT add a fifth lane/panel. Leave the other three lanes byte-identical in behaviour.
- **Synchronous getters, fail-silent.** Same as the sweep-live pattern: cached-or-sentinel return, fire-and-forget populate, no throw to the page, prior-state preservation on error.
- **Object-envelope guards.** Each fetcher validates its own `{ data: {…} }` object shape — not an array shape.
- **Pure composable.** `useTriageStatus` takes `currentTimeMs` as a parameter; never call `Date.now()` inside it (wall-clock-independence test enforces).
- **No `.reduce()`** for item bucketing — explicit `for…of` with descriptive names.
- **`typecheck` is a DoD gate.** Run `vue-tsc --noEmit` explicitly.

## Required `// why:` Comments

- `types/triage.ts` (D-20703) — why `anomalyClass` is opaque `string`, not the engine union.
- `types/triage.drift.test.ts` — why the field-set constants are hand-copied from the server types and not imported (layer boundary).
- `triageLiveFetchers.ts` (D-20601) — why `isLiveModeEnabled` is imported, not re-derived.
- `triageLiveFetchers.ts` — why `credentials: 'include'` (forward the WP-112 session).
- `useTriageStatus.ts` — why `currentTimeMs` is a parameter (wall-clock independence).
- `useAgentPipeline.ts` (D-23902) — why triage items inject only into the Inspector lane.
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
- [ ] `Select-String useTriageStatus.ts -Pattern "triage-"` → ≥ 1.
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

## DECISIONS.md Entries (D-23901..D-23903)

Reserved in docs/ai/DECISIONS.md (Reserved (proposed) at draft → Active at close):
**D-23901** — Dashboard triage types are hand-maintained, layer-safe mirrors of the WP-231 inspection + WP-232 handoff server envelopes (`anomalyClass` opaque `string` per D-20703/D-23103), drift-guarded by committed server-derived field-set tests modelled on the WP-211 sweep drift guard; no `apps/server`/engine import.
**D-23902** — Inspection findings + handoff lifecycle render INTO the existing Pipeline Inspector lane (Option A) via `triage-`-prefixed items injected through a `triageData?` projection parameter on `useAgentPipeline` (mirrors the `sweepData?` injection), not a new panel/lane; the surface is read-only (no `/transition` or `/verify` from the client).
**D-23903** — Triage fetchers ship LIVE-capable from day one using the WP-238 sweep-live pattern (shared `isLiveModeEnabled` gate, object-envelope shape guard, `credentials:'include'` session parity), so the surface does not recreate the mock-only gap; MOCK stays the local-dev/test default.
