# EC-231 — Dashboard Acquisition + Activation + Retention Surfaces (Execution Checklist)

**Source:** docs/ai/work-packets/WP-203-dashboard-acquisition-activation-retention.md
**Layer:** Client — `apps/dashboard/` (no engine / registry / server / shared-tooling code; no migrations)

> **Use the locked values, constraints, and rationale from WP-203
> verbatim. EC-231 is the operational order + gates + failure smells;
> it does NOT supersede the WP. If EC-231 and WP-203 conflict on
> requirements, WP-203 wins.**

## Execution Order (Locked)

1. **Sub-task A — Types contract + drift test (foundation)**
   - Append the 4 interfaces / 3 closed unions / 2 canonical arrays to `types/index.ts` per WP-203 §Locked contract values byte-for-byte.
   - Add `utils/funnelTaxonomy.test.ts` with bidirectional drift assertions.
   - Engine gate: `pnpm --filter @legendary-arena/dashboard build` exits 0; drift test passes.
2. **Sub-task B — Mock service + composables**
   - New `services/analyticsMocks.ts` (3 factories, `hashRange`-seeded determinism, `wrapMock<T>` per existing precedent).
   - Re-exports added to `services/mocks.ts`.
   - 3 new composables (`useTrafficSources`, `useActivationFunnel`, `useRetentionCohorts`) + 3 test files (≥ 7 tests each = ≥ 21 net-new tests; the bump from 5 → 7 reflects the locked Composable Source Contract passthrough test + 1-2 new invariant tests per composable from WP-203 §Behavior / Determinism).
   - Gate: build + test exit 0; mock determinism test passes.
3. **Sub-task C — Widgets + page wiring**
   - 4 new widgets (3 full for `/players`; 1 strip for `/overview`).
   - 2 modified pages (`PlayerAnalyticsPage.vue` adds 3 widgets in vertical layout; `OverviewPage.vue` inserts strip after `DauChartWidget`).
   - Gate: build + test exit 0; Widget State Gate grep returns 1 per new widget; zero-hex-color grep clean; layer-boundary grep clean.

A, B, C MAY land as one session-internal commit chain (`EC-231:` prefix per `01.3`); a single combined commit per sub-task is also acceptable per the WP-202 / WP-201 precedent. Governance close commit follows with `SPEC:` prefix.

## Before Starting

- [ ] **WP-157 landed** ✅ — dashboard scaffold (`apps/dashboard/`, 4-state Widget Contract, `ServiceResponse<T>`, EChart wrapper). Verify: `ls apps/dashboard/src/widgets/` returns ≥ 16 widgets.
- [ ] **WP-162 landed** ✅ — UI polish + Aura tokens; hex colors forbidden in widget source.
- [ ] **WP-196 landed** ✅ — widget patterns (4-state contract, `useDateRange`, `normalizeRange`, `hashRange` FNV-1a, ECharts Stacking Contract). Verify: `grep -n "hashRange\|normalizeRange" apps/dashboard/src/services/` returns matches.
- [ ] **WP-197 landed** ✅ — deploy posture (mock-mode-first per D-19702; `VITE_USE_MOCKS=true` on CF Pages Production).
- [ ] **WP-198 landed** ✅ — drift-pinned canonical-array pattern (`KPI_STATUSES`); 4-state Widget Contract enforcement. Verify: `grep -n "KPI_STATUSES" apps/dashboard/src/types/index.ts apps/dashboard/src/utils/kpiStatus.test.ts` returns matches.
- [ ] **WP-199 landed** ✅ — composable naming + import pattern + numeric-zero semantics (D-19908).
- [ ] Read WP-203 §Goal, §Assumes (especially the audit-scope clarifier), §Non-Negotiable Constraints, §Acceptance Criteria — those sections are authoritative.
- [ ] Read WP-196 + WP-198 + WP-199 for the dashboard patterns being mirrored; do NOT re-derive their locked values.
- [ ] Read `apps/dashboard/src/widgets/NetRevenueChartWidget.vue` + `PaidActionErrorsWidget.vue` (4-state Widget Contract reference implementations) + `GovernanceKpiStrip.vue` (strip-widget reference) before authoring the 4 new widgets.
- [ ] `pnpm --filter @legendary-arena/dashboard build` + `pnpm --filter @legendary-arena/dashboard test` exit 0 (anchor baseline test count).

## Locked Values (verbatim from WP-203)

> The full type definitions + closed unions + canonical arrays live in
> WP-203 §Non-Negotiable Constraints → Locked contract values. Copy them
> byte-identical into `types/index.ts`; do NOT re-derive or paraphrase.
> The condensed summary below is for session orientation only.

- 4 new interfaces: `AnalyticsEvent` (5 fields), `TrafficSource` (4 fields), `ActivationFunnelStep` (3 fields), `RetentionCohort` (4 fields).
- 3 closed unions: `AcquisitionChannel` (4 values), `ActivationStep` (4 values), `AcquisitionEventType` (= `AcquisitionChannel` ∪ `ActivationStep` ∪ `'retention-return'` = 9 values).
- 2 drift-pinned canonical arrays: `ACQUISITION_CHANNELS` (4 entries) + `ACTIVATION_STEPS` (4 entries).
- `AnalyticsEvent.user_id` type: exactly `string | null` (PII posture deferred to WP-205 per D-20303 — no email, no handle, no IP, no fingerprint surfaces in v1).
- Mock-mode-first: every widget carries `source: 'MOCK'` freshness badge per WP-197 D-19702 (D-20302).
- Forward-contract: `AnalyticsEvent` envelope shape is closed at 5 fields; WP-205 consumes verbatim (D-20301).
- Strip widget link: `AcquisitionFunnelStripWidget`'s "View full funnel →" routes to `/players`.
- Composable Source Contract: all 3 composables accept `() => ServiceResponse<readonly T[]>` and surface `source` + `updatedAt` in their returns.
- Aggregation rule: daily discrete counts (NOT cumulative); UTC-normalized; series sorted ascending via Unicode code-unit comparison; canonical iteration order.
- Conversion invariants: step-to-step = `step[n+1] / step[n]`; overall = `step[3] / step[0]`; overall ≠ product of step-to-step.
- Retention definition: "return" = any event with same `user_id` after signup; Day-N counted if ≥ 1 event exists that UTC day; per-user-per-day return is a boolean.
- Determinism scope: mock output is a pure function of `DateRange` (traffic / funnel) and `cohortCount` (retention); iteration order is canonical via `ACQUISITION_CHANNELS` / `ACTIVATION_STEPS`.
- Empty-state rule: empty datasets drop to the explicit `empty` arm of the 4-state Widget Contract; per-widget thresholds in WP-203 §Widget Data Requirements.
- Strip `paid` collapse: if `paid` summed = 0 across the window, exclude `paid` from the pill row and rebalance remaining pills to sum to 100%.

## Guardrails

### Semantic (the lines you must not cross)

- **All v1 data is mock.** Every widget reads from `analyticsMocks.ts`. Any production-data fetch in a widget = HARD FAIL.
- **No PII surfaces.** No email / handle / IP / fingerprint in any mock, composable, or widget. `user_id` is an anonymized opaque string.
- **Forward-locked envelope (D-20301).** The 5-field `AnalyticsEvent` shape is closed; future per-event-type properties ride on the open `properties` field. Widening / narrowing the envelope here is OUT OF SCOPE (belongs in WP-205). **`AcquisitionEventType` union is reserved for funnel events only** (channels ∪ steps ∪ `'retention-return'`); non-funnel event types get a separate union, not bloat on this one.
- **Composable Source Contract (hard).** All 3 composables accept `() => ServiceResponse<readonly T[]>` (NOT `() => readonly T[]`). The composable reads `.data` internally; it MUST preserve `.source` and `.updatedAt` in its returned object. Stripping `ServiceResponse` at the composable boundary = HARD FAIL (breaks the MOCK → LIVE swap symmetry WP-205 depends on).
- **Aggregation rule (locked).** `TrafficSource[]` and `ActivationFunnelStep[]` are **per-day discrete counts (NOT cumulative)**; each `date` is a closed daily UTC bucket via `normalizeRange`. Series MUST be sorted ascending by `date` via Unicode code-unit comparison (no `localeCompare`). Per-channel / per-step assembly MUST iterate the canonical drift-pinned array — NOT `Object.keys()` of a derived map.
- **Conversion invariants (locked).** Step-to-step = `stepCounts[ACTIVATION_STEPS[n+1]] / stepCounts[ACTIVATION_STEPS[n]]`. Overall = `stepCounts['first-match-completed'] / stepCounts['signup-start']` (the literal end-to-end ratio). Overall MUST NOT be computed as the product of step-to-step ratios — that silently diverges under rounding and creates a display mismatch.
- **Retention definition (locked).** A "return" is any event with the same `user_id` occurring **after** signup (`event_type === 'signup-complete'`). Day-N return is counted if at least one event exists for that `user_id` on that UTC day. No deduplication beyond existence (per-user-per-day return is a boolean). `day1ReturnCount` and `day7ReturnCount` count distinct `user_id`s in the cohort with the corresponding boolean true.
- **Determinism scope (hard).** Mock outputs are a pure function of: `DateRange` (traffic / funnel) and `cohortCount` (retention). No other external state (system clock, env vars, JS iteration order, ambient locale / timezone) may influence output. `Date.now()` is allowed ONLY in `wrapMock`'s `updatedAt`. Iteration order MUST be canonical via `ACQUISITION_CHANNELS` / `ACTIVATION_STEPS`.
- **Empty-state rule.** Empty datasets MUST drop the widget to the explicit `empty` arm of the 4-state Widget Contract — NOT a flat-line chart, NOT a degenerate axis, NOT a funnel diagram with all stages = 0. Per-widget thresholds locked in WP-203 §Widget Data Requirements. `AcquisitionFunnelStripWidget` MUST hide its pill row entirely in empty state (do NOT render zero-percent pills).
- **Strip channel collapse (locked).** If `paid` `visitorCount` summed across the 14-day window is `0`, `AcquisitionFunnelStripWidget` excludes `paid` from the pill row entirely AND recomputes the remaining percentages over `direct + search + referral` so they still sum to 100%. If `paid` summed > 0, all 4 pills render at their actual percentage.
- **Each-channel ≠ each-step (semantic separation).** `AcquisitionChannel` (4 values) and `ActivationStep` (4 values) are distinct closed unions. Do NOT collapse them into a single union.
- **Drift-pinned arrays.** Adding a 5th channel without updating BOTH `ACQUISITION_CHANNELS` array AND `AcquisitionChannel` union = FAIL (drift test catches it).
- **Zero-denominator guard.** All rate computations check the denominator BEFORE division; zero returns `0`, never `NaN`.
- **Text-label-first accessibility.** Retention heatmap cell color is decorative; numeric rate text is the load-bearing display (Vision §17 carry-forward).
- **No `RecentActivityWidget`-style displacement.** Overview gets ONE new strip widget; no existing widget is hidden, removed, or relocated.

### Execution (the things you must not touch)

- **Layer boundary:** zero `@legendary-arena/(game-engine|registry|preplan|server)` imports anywhere in `apps/dashboard/src/`. Verified by grep at close.
- **No new npm dependencies:** `apps/dashboard/package.json` + `pnpm-lock.yaml` zero diff. Use existing EChart wrapper + PrimeVue + Pinia.
- **No server-side surface:** `apps/server/src/**`, `data/migrations/`, `docs/ai/REFERENCE/api-endpoints.md` all zero diff. WP-205 owns those.
- **No engine surface:** `packages/` zero diff.
- **Hex color ban:** zero `#[0-9a-fA-F]{3,8}` matches in the 4 new widget files.
- **Math.random scope:** allowed only inside `analyticsMocks.ts` (mock data generation per existing `randomBetween` precedent); forbidden in composables and widgets.
- **`Date.now()` scope:** allowed only inside `wrapMock()`'s `updatedAt` population (existing pattern); forbidden elsewhere in new code.
- **`localeCompare` ban:** Unicode code-unit comparator only for ordering (D-19605 / D-19904 carry-forward).
- **Widget State Gate:** exactly 1 `v-if="state ===` per new widget file. No nested ternaries; no inline state derivations in the template.
- **Mock determinism:** every mock factory accepts a `DateRange` (or `cohortCount` for retention) and seeds its PRNG via `hashRange(range)` per D-19605. No bare `Math.random()` call site.
- **Required attributes:** every widget root carries `data-testid=...` + `aria-label=...`.

## Required `// why:` Comments

- `types/index.ts` — at each new interface and closed union, a `// why:` line explaining the contract's role and citing the relevant D-entry (D-20301 for `AnalyticsEvent`; D-20303 for `user_id: string | null` PII deferral note).
- `ACQUISITION_CHANNELS` + `ACTIVATION_STEPS` canonical arrays — `// why:` citing WP-198's `KPI_STATUSES` drift-detection precedent and pointing at `utils/funnelTaxonomy.test.ts` as the enforcement site.
- `analyticsMocks.ts` per-factory function — `// why:` citing D-19605 (hashRange-seeded determinism) and D-20302 (mock-mode-first per WP-197 D-19702).
- Each composable's zero-denominator guard — `// why:` explaining that `0` (not `NaN`) is the meaningful empty-data return per D-19908 numeric-zero semantics carry-forward.
- Each composable's `source` / `updatedAt` passthrough — `// why:` citing WP-203 §Composable Source Contract (extends D-19607 Shared Source Contract pattern): widgets read freshness from the composable's returned `source` / `updatedAt`, not from the service layer directly; this is what makes the MOCK → LIVE swap a getter-only change in WP-205.
- `useTrafficSources` ascending-by-date sort — `// why:` citing §Aggregation rule: `YYYY-MM-DD` strings sort correctly under Unicode code-unit comparison; `localeCompare` is forbidden per D-19605 / D-19904 because it introduces ambient-locale dependence.
- `useActivationFunnel.overallConversion` literal-ratio computation — `// why:` citing §Conversion invariants: product-of-step-ratios silently diverges from the literal end-to-end ratio under rounding, which would cause the funnel footer to disagree with the per-stage tooltip; the literal `stepCounts['first-match-completed'] / stepCounts['signup-start']` is the load-bearing formula.
- `analyticsMocks.ts` per-factory canonical iteration — `// why:` citing §Determinism scope: iterate `ACQUISITION_CHANNELS` / `ACTIVATION_STEPS` in canonical array order (NOT `Object.keys()` of a derived map) so the output is byte-identical across JS runtimes regardless of object-key insertion-order behavior.
- `AcquisitionFunnelStripWidget` `paid`-collapse branch — `// why:` citing §Strip channel collapse: when summed `paid` visitors = 0, the pill row excludes `paid` entirely and rebalances `direct + search + referral` to sum to 100% — never render a zero-percent pill (it's visual noise).
- Each widget's empty-state arm — `// why:` citing §Empty-state rule + §Widget Data Requirements: per-widget data-requirement threshold drops the widget to the explicit `empty` arm (NOT a flat chart, NOT a degenerate axis); the WP-157 reference implementations are the visual contract.
- `useRetentionCohorts` tie-break logic — `// why:` explaining the deterministic lexical-descending tie-break on `cohortWeek` (mirrors D-18902 lexical-iteration discipline pattern).
- Each widget's `v-if="state ===` block — `// why:` referencing WP-196 Widget State Gate Pattern (D-19608 adapted for non-chart widgets).
- `AcquisitionFunnelStripWidget` router-link — `// why:` explaining why the strip links to `/players` (depth on demand; the full funnel widgets live there).
- `AcquisitionFunnelStripWidget` template-script — `// why:` **anti-premature-abstraction note:** *"The strip reads 3 composables directly because its derivations are trivial (`.slice(0,3)` + sum); extracting a 4th `useAcquisitionStripSummary` composable would be premature per 00.6 §16.1 (rule of three). If the strip later needs cross-composable joins, extract at that point — do not pre-extract."*

## Files to Produce

### Sub-task A — Types + Drift (2 files)

- `apps/dashboard/src/types/index.ts` — **modified** — append 4 interfaces + 3 closed unions + 2 drift-pinned canonical arrays per WP-203 §Locked contract values.
- `apps/dashboard/src/utils/funnelTaxonomy.test.ts` — **new** — bidirectional drift assertions on both arrays + unions.

### Sub-task B — Mock service + Composables (8 files)

- `apps/dashboard/src/services/analyticsMocks.ts` — **new** — 3 factories (`mockTrafficSources`, `mockActivationFunnel`, `mockRetentionCohorts`); `hashRange`-seeded; `wrapMock<T>`; `source: 'MOCK'`.
- `apps/dashboard/src/services/mocks.ts` — **modified** — re-export the 3 new factories per `billingHealthMocks` precedent.
- `apps/dashboard/src/composables/useTrafficSources.ts` + `.test.ts` — **new** — per-channel totals + signup conversion derivations + ascending-by-date series sort (Unicode code-unit) + `source` / `updatedAt` passthrough; accepts `() => ServiceResponse<readonly TrafficSource[]>`; ≥ 7 tests.
- `apps/dashboard/src/composables/useActivationFunnel.ts` + `.test.ts` — **new** — step-to-step + literal-end-to-end overall conversion (NOT product of stages) + all-4-steps normalization + `source` / `updatedAt` passthrough; accepts `() => ServiceResponse<readonly ActivationFunnelStep[]>`; ≥ 7 tests.
- `apps/dashboard/src/composables/useRetentionCohorts.ts` + `.test.ts` — **new** — per-cohort + averages + best-cohort selection with deterministic tie-break + `source` / `updatedAt` passthrough + mock-output-is-pure-function-of-`cohortCount` assertion; accepts `() => ServiceResponse<readonly RetentionCohort[]>`; ≥ 7 tests.

### Sub-task C — Widgets + Page Wiring (6 files)

- `apps/dashboard/src/widgets/TrafficSourcesWidget.vue` — **new** — stacked-bar EChart; 4-state contract.
- `apps/dashboard/src/widgets/ActivationFunnelWidget.vue` — **new** — 4-step funnel with sparklines; 4-state contract.
- `apps/dashboard/src/widgets/RetentionCohortsWidget.vue` — **new** — heatmap-style table; text-label-first; 4-state contract.
- `apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue` — **new** — 3-card horizontal strip; 3-channel-percentage pill row; "View full funnel →" link to `/players`.
- `apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue` — **modified** — wire the 3 full widgets vertically.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — **modified** — insert `AcquisitionFunnelStripWidget` immediately after `DauChartWidget`.

### Governance (4 files)

- `docs/ai/STATUS.md` — **modified** — `### WP-203 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-20301..D-20303 (reserved → Active byte-identical to EC §DECISIONS.md verbatim block per PS-1 convention).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-203 row `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-231 row Done.

**Total: 22 files** (14 new + 4 modified source + 4 governance).

## After Completing

### Sub-task A close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] Drift test passes: `pnpm --filter @legendary-arena/dashboard test -- funnelTaxonomy` runs the new test and asserts bidirectional parity on both unions/arrays.
- [ ] Grep: 4 new interfaces + 3 closed unions + 2 canonical arrays present in `types/index.ts` byte-identical to WP-203 §Locked contract values.

### Sub-task B close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 with baseline + **≥ 21 new tests** (≥ 7 per composable × 3 composables, matching WP-203 §Acceptance Criteria enumerated case count; the bump from the original 15 reflects the Source-Contract passthrough test + locked invariant tests; mirrors WP-189 / WP-202 minimum-pin precedent).
- [ ] Mock determinism: each composable produces byte-identical output for the same `DateRange` input across two consecutive evaluations.
- [ ] Grep: 3 new mock factories exported from `analyticsMocks.ts` AND re-exported from `mocks.ts`.

### Sub-task C close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] **Widget State Gate grep:** `grep -cE 'v-if="state ===' apps/dashboard/src/widgets/TrafficSourcesWidget.vue apps/dashboard/src/widgets/ActivationFunnelWidget.vue apps/dashboard/src/widgets/RetentionCohortsWidget.vue apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue` returns exactly **1 per file**.
- [ ] **Zero hex colors:** `grep -rnE '#[0-9a-fA-F]{3,8}' apps/dashboard/src/widgets/{Traffic,Activation,Retention,AcquisitionFunnel}*.vue` returns zero matches.
- [ ] **Strip routes correctly:** `grep -nE "'/players'|to=\"/players\"|push\('/players'\)" apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue` returns ≥ 1 match.
- [ ] **Required attributes per widget:** `grep -cE 'data-testid="[^"]+"' apps/dashboard/src/widgets/{Traffic,Activation,Retention,AcquisitionFunnel}*.vue` returns ≥ 1 per file; same for `aria-label`.
- [ ] **PlayerAnalyticsPage wires 3 widgets:** `grep -cE "TrafficSourcesWidget|ActivationFunnelWidget|RetentionCohortsWidget" apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue` returns ≥ 3 matches.
- [ ] **OverviewPage wires strip exactly once:** `grep -cE "AcquisitionFunnelStripWidget" apps/dashboard/src/pages/dashboard/OverviewPage.vue` returns exactly 1.

### Cross-cutting close

- [ ] **Layer-boundary grep:** `grep -rnE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/` returns zero matches.
- [ ] **No-new-deps gate:** `git diff --stat apps/dashboard/package.json pnpm-lock.yaml` empty.
- [ ] **No-server-edits gate:** `git diff --name-only apps/server/ data/migrations/ docs/ai/REFERENCE/api-endpoints.md` empty.
- [ ] **No-engine-edits gate:** `git diff --name-only packages/` empty.
- [ ] **No-Math.random outside mocks:** `grep -rnE "Math\.random" apps/dashboard/src/widgets/ apps/dashboard/src/composables/` returns zero matches.
- [ ] **Manual UI verification on `/overview`:** strip renders between `DauChartWidget` and the next existing widget; 3 cards visible; pill row renders; "View full funnel →" link present and routes to `/players` on click.
- [ ] **Manual UI verification on `/players`:** 3 widgets render in vertical order (TrafficSources → ActivationFunnel → RetentionCohorts); each shows `MOCK` freshness badge; each in `data` state (4-state contract is exercised but not visible in happy path).
- [ ] `pnpm -r build` exits 0.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-20301..D-20303 landed Active; `WORK_INDEX.md` WP-203 `[x]`; `EC_INDEX.md` EC-231 Done.

## Pre-Commit Failure Smells (Must Review Before Commit)

- **Real-data fetch in any widget** → mock-mode-first scope violation. The widget MUST source from `analyticsMocks.ts` until WP-205 wires endpoints.
- **PII surface in any mock / composable / widget** (email, handle, IP, fingerprint) → D-20303 violation; PII posture is deferred to WP-205.
- **5th `AcquisitionChannel` (e.g., `'email'`, `'social'`) added without updating both union AND `ACQUISITION_CHANNELS` array** → drift test fires loudly.
- **`NaN%` visible in any widget** → zero-denominator guard missing; the rate computation divided by zero without the explicit `count === 0 ? 0 : numerator / count` guard.
- **`v-if="state ===` count ≠ 1 per new widget** → Widget State Gate Pattern violation (multiple state arms, or template branching outside the state machine).
- **Hex color literal in widget source** → hex-color ban violation; PrimeVue / Aura tokens only.
- **`@legendary-arena/(game-engine|registry|preplan|server)` import anywhere in `apps/dashboard/src/`** → layer boundary violation; `apps/dashboard` is client-only.
- **`apps/dashboard/package.json` or `pnpm-lock.yaml` diff** → new-dep violation; the WP-203 widgets must use the existing EChart wrapper + PrimeVue + Pinia.
- **`apps/server/src/**` or `data/migrations/` diff** → server-side scope creep; WP-205 owns those.
- **`docs/ai/REFERENCE/api-endpoints.md` diff** → catalog update is WP-205's concern; WP-203 forward-locks the type contract but adds no endpoint.
- **`packages/` diff** → engine scope creep; WP-203 is client-only.
- **`Math.random` call site in any composable or widget** → mock determinism violation; `Math.random` is allowed only inside `analyticsMocks.ts` per the existing `randomBetween` precedent.
- **`localeCompare` call site in any new code** → ordering-contract violation (D-19605 / D-19904 carry-forward); use Unicode code-unit comparator.
- **`AnalyticsEvent` envelope widened beyond 5 fields** → D-20301 violation; per-event-type properties ride on the open `properties` field, not on new envelope fields.
- **Retention heatmap color-only signal** (numeric rate hidden, only shading visible) → Vision §17 accessibility violation; text-label-first is mandatory.
- **`RecentActivityWidget`-style displacement on Overview** → scope violation; WP-203 is purely additive (one strip insertion, zero removals).
- **Strip widget link points anywhere other than `/players`** → page-routing contract violation; "View full funnel" implies the operator goes to the full-funnel page.
- **Step-to-step conversion computed as product of stage ratios instead of literal end-to-end ratio** → divergence between displays (the funnel widget's overall conversion footer would disagree with the sum-of-stages tooltip); use the literal `count[3] / count[0]` formula per WP-203 §Acceptance Criteria.
- **Composable accepts bare `() => readonly T[]` instead of `() => ServiceResponse<readonly T[]>`** → Composable Source Contract violation; strips `source` / `updatedAt` at the composable boundary and breaks the MOCK → LIVE swap symmetry that WP-205 depends on. Re-add the `ServiceResponse` envelope.
- **Widget reads `source` / `updatedAt` from the service layer directly instead of from the composable** → same Source Contract violation seen from the widget side; widgets MUST source freshness from the composable's returned `source` / `updatedAt`, NOT by re-importing `analyticsMocks` / `wrapMock` / `services/api`.
- **Time series unsorted, or sorted via `localeCompare`** → §Aggregation rule violation; `YYYY-MM-DD` must be sorted ascending via Unicode code-unit comparison so the output is locale-independent (D-19605 / D-19904 carry-forward).
- **Cumulative counts in `TrafficSource[]` or `ActivationFunnelStep[]` series** → §Aggregation rule violation; daily counts MUST be discrete (the value for `2026-06-03` is that day's count, not the running total up to that day). Mixing cumulative + discrete will produce wildly wrong stacked-bar visuals.
- **Per-channel / per-step output assembled via `Object.keys()` of a derived map instead of canonical-array iteration** → §Determinism scope violation; iterate `ACQUISITION_CHANNELS` / `ACTIVATION_STEPS` instead. Object-key iteration order is observable in templates and varies across runtimes.
- **`Date.now()` or `Math.random()` influencing mock data shape** → §Determinism scope violation; mock output is a pure function of `DateRange` (traffic / funnel) and `cohortCount` (retention). `Date.now()` is allowed ONLY in `wrapMock`'s `updatedAt`; `Math.random()` is allowed ONLY inside `analyticsMocks.ts` and ONLY seeded via `hashRange`.
- **`AcquisitionFunnelStripWidget` renders zero-percent pills** (e.g., `paid: 0%` when paid summed = 0) → §Strip channel collapse violation; the `paid` pill must be excluded entirely and the remaining pills rebalanced to sum to 100%.
- **Widget renders a flat-line chart / degenerate axis / all-zero funnel when the underlying dataset is empty** → §Empty-state rule violation; the widget MUST drop to the explicit `empty` arm of the 4-state Widget Contract.
- **`ActivationFunnelWidget` enters `data` state with `signup-start` = 0** → §Widget Data Requirements violation; a funnel with zero entries at the top is uninformative and must render the empty state instead.
- **`AcquisitionEventType` union widened to include a non-funnel event type** (e.g., `'billing-charge'`, `'governance-event'`) → §Forward-locked envelope violation; the funnel taxonomy is reserved for channels ∪ steps ∪ `'retention-return'`. Non-funnel event types get a separate union.
- **Retention "return" counted multiple times per user per day** → §Retention definition violation; per-user-per-day return is a boolean (no deduplication beyond existence). `day1ReturnCount` / `day7ReturnCount` count distinct `user_id`s, not raw event counts.
