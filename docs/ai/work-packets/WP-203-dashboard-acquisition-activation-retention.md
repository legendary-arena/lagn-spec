# WP-203 — Dashboard Acquisition + Activation + Retention Surfaces (Client / Mock-Mode-First)

## Goal

Surface three new analytics widgets on the operator dashboard so the
operator can see **where players come from, whether they activate, and
whether they come back** — without yet needing a server-side analytics
pipeline. Adds:

1. **`TrafficSourcesWidget`** — top-of-funnel attribution: landing-page
   visits bucketed by acquisition channel (direct / search / referral /
   paid) with a 14-day trend per channel.
2. **`ActivationFunnelWidget`** — signup-form starts → signup completions
   → first match started → first match completed; 4-step funnel with
   stage-to-stage conversion rates and a stacked trend.
3. **`RetentionCohortsWidget`** — weekly signup cohorts showing day-1 and
   day-7 return rates; defaults to the trailing 8 cohorts.

All three widgets ship in **mock-mode** (per WP-197 D-19702 deploy
posture — `MOCK` freshness badge). A compact `AcquisitionFunnelStripWidget`
also lands on `/overview` showing the three top-line counts + a
3-channel-percentage breakdown, with a "View full funnel →" link to
`/players`.

This WP is **WP-B** of the operator-dashboard pre-mortem grouping
identified on 2026-05-31 (WP-196 §Future Work). It locks the
forward-looking `AnalyticsEvent` projection contract that the paired
server WP (WP-205 — `analytics_events` migration + capture + endpoints,
deferred to a future session) will produce; the widgets flip from MOCK
to LIVE without contract churn once WP-205 lands. **WP-C** (Retention
cohorts + churn) is intentionally folded into this WP as the
`RetentionCohortsWidget` rather than spun out separately — the user's
2026-06-03 scope-shape decision merged the original WP-B+C pair into
a single dashboard surface.

> **Invariant:** every value displayed by every widget in this WP is
> sourced from `services/analyticsMocks.ts`. The widgets carry no
> production data and no production credentials; the `MOCK` freshness
> badge is a visible, non-removable signal until WP-205 lands the
> real-data wire-up.

> **Terminology convention.** "Acquisition" = visitor lands on the
> site for the first time. "Activation" = visitor completes signup AND
> finishes their first match. "Retention" = signed-up user returns N
> days after signup. The three terms are non-overlapping; each maps to
> exactly one widget.

---

## Assumes

- **WP-157 ✅ (hard-dep — dashboard scaffold).** `apps/dashboard/`
  exists with the 4-state Widget Contract (loading / error / empty /
  data), the `ServiceResponse<T>` shape (`{ data, updatedAt, source }`),
  the `useDataFreshness` composable (extended in WP-198 to accept the
  `'BUILD'` source label), and the EChart wrapper. No new charting
  dependency.
- **WP-162 ✅ (hard-dep — UI polish + Aura tokens).** PrimeVue + Aura
  tokens are wired; hex colors are forbidden in widget source.
- **WP-196 ✅ (hard-dep — widget patterns + DateRange normalization +
  forward-contract precedent).** Locked: `useDateRange` composable +
  `normalizeRange` service-boundary helper + `hashRange` FNV-1a
  determinism helper (D-19605). Forward-contract precedent
  (`/metrics/billing/health` locked in WP-196 §D-19603 ahead of the
  server WP) — WP-203 follows the same pattern for `AnalyticsEvent`
  ahead of WP-205.
- **WP-197 ✅ (hard-dep — deploy posture + mock-mode-first).** Per
  D-19702, all v1 dashboard widgets ship mock-mode-first and flip to
  LIVE in a follow-up server WP. `VITE_USE_MOCKS=true` on CF Pages
  Production env; the `MOCK` freshness badge is the operator's signal
  that the data is not yet real.
- **WP-198 ✅ (hard-dep — drift-pinned canonical-array pattern +
  `'BUILD'` freshness label + 4-state Widget Contract enforcement).**
  `KPI_STATUSES` precedent for `ACQUISITION_CHANNELS` /
  `ACTIVATION_STEPS` drift arrays; `BUILD` source label available
  (WP-203 uses `MOCK`, not `BUILD` — the data is mock-generated at
  runtime, not baked at build time).
- **WP-199 ✅ (hard-dep — composable naming + import patterns +
  schemaVersion convention).** Existing composables sit at
  `apps/dashboard/src/composables/use*.{ts,test.ts}`; WP-203 follows
  the same layout.
- **WP-196 §Future Work + §Specific deferrals (read first).** WP-196
  explicitly buckets per-user net-revenue (ARPU / LTV) under WP-B
  (this WP). WP-203 does NOT implement ARPU/LTV in v1 — that widget
  depends on the per-user revenue projection which itself depends on
  WP-205's event-stream wiring. WP-203 reserves the forward-contract
  hook (the `AnalyticsEvent` carries `user_id`) but defers the
  ARPU/LTV widget itself.
- **Existing dashboard inventory (verified 2026-06-03 against `main
  @ 5b85216`):**
  - `apps/dashboard/src/widgets/`: 16 existing widgets (latest:
    `StatusFeedWidget`, `VisionCard`, `NetRevenueChartWidget`,
    `PaidActionErrorsWidget`).
  - `apps/dashboard/src/composables/`: 9 existing composables (latest:
    `useGovernanceSnapshot`, `useLastVisit`, `useNetRevenueBreakdown`).
  - `apps/dashboard/src/services/`: `mocks.ts` (re-exports +
    primary mocks), `billingHealthMocks.ts` (WP-196 precedent for
    domain-specific mock files), `hashRange.ts`, `normalizeRange.ts`,
    `api.ts`, `endpoints.ts`, `websocket.ts`.
  - `apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue` exists
    but is currently minimal — WP-203 builds it out.
  - `apps/dashboard/src/pages/dashboard/OverviewPage.vue` is the
    morning-glance page; WP-203 adds the compact strip after
    `DauChartWidget` (the natural location given the strip surfaces
    acquisition velocity).
- **Repo posture.** Single-repo (`apps/dashboard/`); no marketing-repo
  crossing (`C:\www\legendary-arena-com\` not touched). No npm
  dependency additions (per WP-196 Anti-Patterns + WP-199 No-new-deps
  gate).
- **Drafting baseline:** `origin/main @ 5b85216` (post-WP-202 close-out;
  clean working tree apart from the draft branch artifacts).

---

## Context (Read First)

> **Line-number references are advisory at drafting time.** Re-verify
> with `grep -n` if `main` has moved between draft and execute.

- **WP-196**
  (`docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md`)
  — closest precedent. Same shape: mock-mode-first dashboard surface,
  multiple widgets sharing a service/composable/types pattern, forward
  contract locked for a future server endpoint WP. Reuse the §Files
  Expected to Change shape, the §Acceptance Criteria grouping (Vocab /
  Behavior / Data / Build), the locked-values pattern, and the
  Anti-Patterns block. WP-196's §Future Work explicitly names WP-203
  as WP-B.
- **WP-198** (governance snapshot + KPI strip + throughput / activity
  widgets) — established the drift-pinned canonical-array pattern
  (`KPI_STATUSES`) that WP-203's `ACQUISITION_CHANNELS` and
  `ACTIVATION_STEPS` mirror.
- **WP-199** (status feed + governance KPIs) — established the
  composable-per-widget convention + the
  `{ kpiStatus, ECharts wrapper, useDataFreshness }` triad WP-203
  follows.
- **WP-157** (dashboard scaffold) + **WP-162** (UI polish) — the
  ServiceResponse / 4-state Widget Contract / Aura-tokens-only base.
- `apps/dashboard/src/types/index.ts` — `ServiceResponse<T>`,
  `DateRange`, `KpiSnapshot`, `KPI_STATUSES`, `BillingHealth`,
  `NetRevenueSeries`, `StatusEntry`, `GovernanceKpis`. WP-203
  appends 4 new interfaces (`AnalyticsEvent`, `TrafficSource`,
  `ActivationFunnelStep`, `RetentionCohort`) and 2 new drift-pinned
  canonical arrays (`ACQUISITION_CHANNELS`, `ACTIVATION_STEPS`).
- `apps/dashboard/src/services/mocks.ts` + `billingHealthMocks.ts` —
  precedent for the new `analyticsMocks.ts` file shape (`wrapMock<T>`
  + per-domain mock factories + re-export from `mocks.ts`).
- `apps/dashboard/src/composables/useNetRevenueBreakdown.ts` +
  `useDateRange.ts` + `useDataFreshness.ts` — composable shape
  precedent. WP-203's 3 new composables follow the same return-object
  pattern (`{ data: ComputedRef<T>, ... }`).
- `apps/dashboard/src/widgets/NetRevenueChartWidget.vue` +
  `PaidActionErrorsWidget.vue` — 4-state Widget Contract reference
  implementations. WP-203's 3 full widgets follow the same
  loading/error/empty/data template structure.
- `apps/dashboard/src/widgets/GovernanceKpiStrip.vue` — strip-widget
  reference. WP-203's `AcquisitionFunnelStripWidget` follows the same
  horizontal-strip pattern.
- `apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue` — current
  state is minimal; WP-203 builds it out with the 3 new full widgets.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — the
  AcquisitionFunnelStripWidget lands after `DauChartWidget` in the
  existing flow.
- `docs/ai/DECISIONS.md` — D-19601 (integer-cents discipline),
  D-19603 (forward server contract pattern), D-19605 (mock determinism
  + DateRange normalization + FNV-1a hash), D-19606 (negative-signal
  preservation), D-19607 (Shared Source Contract pattern), D-19608
  (ECharts Stacking Contract), D-19702 (mock-mode-first deploy
  posture), D-19802 (KPI threshold optionality), D-19804 (BUILD
  freshness label), D-19908 (numeric-zero semantics).
- `docs/01-VISION.md` §3 (Trust & Fairness — PII posture), §11
  (Identity / accounts), §17 (Accessibility — text-label-first chips),
  §20 (Funding surface — N/A here), NG-1 (No pay-to-win — N/A).
- `docs/ai/ARCHITECTURE.md §Layer Boundary` — `apps/dashboard/` is
  client-only; no `@legendary-arena/{game-engine,registry,preplan,server}`
  imports.
- `.claude/rules/{architecture,code-style,work-packets}.md`.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical field
  names (no abbreviations; no rename of `accountId` / `handle`).

---

## Why now

WP-196 shipped WP-A (Net Revenue + Paid-Action Errors); WP-A's §Future
Work explicitly named WP-B (acquisition + funnel) as the next link in
the operator-dashboard pre-mortem grouping. The dashboard is currently
operator-blind on the most load-bearing business question — *"are
visitors becoming players, and are players coming back?"* — even though
acquisition data is what tells the operator whether the rest of the
dashboard is worth building. WP-203 ships the surface in mock-mode
(per WP-197 D-19702 deploy posture) so the operator can iterate on
widget layout, channel definitions, funnel-step granularity, and
cohort granularity before WP-205 sinks engineering effort into the
server-side capture pipeline. The forward-contract pattern (locked
`AnalyticsEvent` shape consumed by future-WP-205-emitted real data)
matches the WP-196 ↔ `/metrics/billing/health` precedent — the
contract surface is settled at WP-203 drafting time so WP-205 has
zero schema ambiguity at execution time.

---

## Scope (In)

### Types contract (1 modified file)

- **Extend `apps/dashboard/src/types/index.ts`** with 4 new interfaces
  and 2 drift-pinned canonical arrays:
  - `AnalyticsEvent` — forward-contract envelope for future WP-205
    capture. Locked fields: `readonly event_type: AcquisitionEventType`
    (closed union); `readonly user_id: string | null` (null for
    pre-signup visitors); `readonly session_id: string`;
    `readonly timestamp: number` (epoch ms); `readonly properties:
    Readonly<Record<string, string | number | boolean | null>>`. PII
    posture deferred to WP-205 (D-20303).
  - `TrafficSource` — per-channel daily count: `readonly channel:
    AcquisitionChannel`; `readonly date: string` (`YYYY-MM-DD`);
    `readonly visitorCount: number`; `readonly signupCount: number`.
  - `ActivationFunnelStep` — `readonly step: ActivationStep`;
    `readonly date: string`; `readonly count: number`.
  - `RetentionCohort` — `readonly cohortWeek: string` (`YYYY-Www`);
    `readonly cohortSize: number`; `readonly day1ReturnCount: number`;
    `readonly day7ReturnCount: number`.
  - `AcquisitionChannel` closed union: `'direct' | 'search' |
    'referral' | 'paid'`.
  - `ActivationStep` closed union: `'signup-start' | 'signup-complete'
    | 'first-match-started' | 'first-match-completed'`.
  - `AcquisitionEventType` closed union: every value in
    `AcquisitionChannel` ∪ `ActivationStep` ∪ `'retention-return'`.
  - **Drift-pinned canonical arrays** mirroring `KPI_STATUSES`
    pattern: `ACQUISITION_CHANNELS: readonly AcquisitionChannel[]` +
    `ACTIVATION_STEPS: readonly ActivationStep[]`. Drift test in a
    new `apps/dashboard/src/utils/funnelTaxonomy.test.ts` asserts
    bidirectional parity with the unions.

### Mock data (1 new file)

- **`apps/dashboard/src/services/analyticsMocks.ts`** — new file
  mirroring `billingHealthMocks.ts` shape. Exports
  `mockTrafficSources(range: DateRange)`, `mockActivationFunnel(range)`,
  `mockRetentionCohorts(cohortCount: number)`. All three wrap their
  results in `ServiceResponse<T>` with `source: 'MOCK'`. Mock
  determinism via shared `hashRange(range)` seed per D-19605
  (the existing FNV-1a from `services/hashRange.ts`).
- **`apps/dashboard/src/services/mocks.ts`** — modified — re-export
  the 3 new mock factories per the `billingHealthMocks` precedent
  (`export { mockTrafficSources, mockActivationFunnel,
  mockRetentionCohorts } from './analyticsMocks.js';`).

### Composables (3 new + tests = 6 files)

> **Composable Source Contract (hard — see §Non-Negotiable
> Constraints).** Every composable below accepts a getter of shape
> `() => ServiceResponse<readonly T[]>`. The composable reads `.data`
> internally for its derivations but MUST preserve `.source` and
> `.updatedAt` in its return object so widgets can surface the
> freshness badge without re-importing the service layer. This
> symmetry is what makes the MOCK → LIVE flip in WP-205 a
> getter-only change (widgets stay byte-identical).

- **`apps/dashboard/src/composables/useTrafficSources.{ts,test.ts}`**
  — accepts `() => ServiceResponse<readonly TrafficSource[]>`;
  returns `{ series: ComputedRef<readonly TrafficSource[]>,
  totalsByChannel: ComputedRef<Record<AcquisitionChannel, number>>,
  totalVisitors: ComputedRef<number>, totalSignups:
  ComputedRef<number>, signupConversionByChannel:
  ComputedRef<Record<AcquisitionChannel, number>>, source:
  ComputedRef<ServiceResponse<unknown>['source']>, updatedAt:
  ComputedRef<number> }`. Per-channel signup conversion =
  `signupCount / visitorCount`; zero-visitor channels return `0`
  (NOT `NaN`). `series` is sorted ascending by `date` using
  Unicode code-unit comparison (per §Aggregation rule).
- **`apps/dashboard/src/composables/useActivationFunnel.{ts,test.ts}`**
  — accepts `() => ServiceResponse<readonly ActivationFunnelStep[]>`;
  returns `{ stepCounts: ComputedRef<Record<ActivationStep, number>>,
  stepToStepConversion: ComputedRef<Record<ActivationStep, number>>,
  overallConversion: ComputedRef<number>, source:
  ComputedRef<ServiceResponse<unknown>['source']>, updatedAt:
  ComputedRef<number> }`. Step-to-step conversion = next-step-count /
  current-step-count; zero-count steps return `0`. `overallConversion`
  is the literal ratio `stepCounts['first-match-completed'] /
  stepCounts['signup-start']`, NOT the product of step-to-step
  conversions (see §Conversion invariants).
- **`apps/dashboard/src/composables/useRetentionCohorts.{ts,test.ts}`**
  — accepts `() => ServiceResponse<readonly RetentionCohort[]>`;
  returns `{ cohorts: ComputedRef<readonly RetentionCohort[]>,
  averageDay1Rate: ComputedRef<number>, averageDay7Rate:
  ComputedRef<number>, cohortWithHighestDay7:
  ComputedRef<RetentionCohort | null>, source:
  ComputedRef<ServiceResponse<unknown>['source']>, updatedAt:
  ComputedRef<number> }`. Empty input returns averages of `0` and a
  null `cohortWithHighestDay7`.

### Widgets (4 new)

- **`apps/dashboard/src/widgets/TrafficSourcesWidget.vue`** —
  4-state Widget Contract. Data state renders a stacked-bar
  EChart (one bar per day, segments per channel) + a tooltip
  showing per-channel daily counts. Footer line: `"Total
  visitors: X · Signups: Y · Overall conversion: Z%"`.
  Required attributes per `00.6-code-style.md` accessibility
  precedent: `data-testid="traffic-sources-widget"`,
  `aria-label="Traffic sources by channel"`.
- **`apps/dashboard/src/widgets/ActivationFunnelWidget.vue`** —
  4-state Widget Contract. Data state renders a 4-step funnel:
  each step shows count + step-to-step conversion rate + a small
  EChart sparkline. Footer: `"Overall: X% (signup-start →
  first-match-completed)"`.
- **`apps/dashboard/src/widgets/RetentionCohortsWidget.vue`** —
  4-state Widget Contract. Data state renders a heatmap-style
  table (cohorts as rows; D1 / D7 as columns; cell shading by
  rate, but text-label-first per Vision §17 accessibility — the
  numeric rate is always visible, the cell shading is decorative).
  Footer: `"Avg D1: X% · Avg D7: Y% · Best D7 cohort: <week>
  (Z%)"`.
- **`apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue`**
  — compact horizontal strip for Overview. 3 cards: `Visitors
  (14d)`, `Signups (14d)`, `Activations (14d)`. Each card shows
  count + day-over-day delta + a 3-channel-percentage breakdown
  pill row (direct / search / referral). **`paid` collapse rule
  (locked):** if `paid` `visitorCount` summed over the date range
  is `0`, the `paid` channel is excluded from the percentage pills
  entirely (no zero-pill rendered), AND the remaining percentages
  are recomputed over `direct + search + referral` so they still
  sum to 100%. If `paid` summed > 0, all 4 channels render their
  pill at their actual percentage. "View full funnel →" link at the
  right routes to `/players`.

### Widget Data Requirements (Locked)

> Each widget specifies the minimum data it requires to enter the
> `data` state of the 4-state Widget Contract (WP-157 / D-19608).
> Anything less drops the widget to `empty` state with the explicit
> empty-state UI per WP-157 contract — **NOT** a zeroed chart, NOT a
> degenerate axis. See §Non-Negotiable Constraints → Empty-state
> rule.

- **`TrafficSourcesWidget`** requires `series.length >= 1` (≥ 1 day
  of data across the range). Below that → empty state. Stacked-bar
  legend order is `ACQUISITION_CHANNELS` (canonical iteration order
  per §Determinism scope).
- **`ActivationFunnelWidget`** requires all 4 entries of
  `ACTIVATION_STEPS` present in `stepCounts` (missing steps default
  to `count: 0` at the composable layer; the composable normalizes
  partial input). The widget enters `data` state whenever at least
  `signup-start` count > 0; if `signup-start` is `0`, the widget
  enters `empty` state (a funnel with zero entries at the top is
  uninformative).
- **`RetentionCohortsWidget`** requires `cohorts.length >= 1`. Below
  that → empty state.
- **`AcquisitionFunnelStripWidget`** requires `totalVisitors > 0`
  across the 14-day window. Below that → empty state (single line
  copy: "No traffic captured in the last 14 days"); pill row is
  hidden entirely in empty state (do NOT render zero-percent pills).

### Page wiring (2 modified)

- **`apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue`** —
  wire the 3 new full widgets in a top-to-bottom layout:
  `TrafficSourcesWidget` → `ActivationFunnelWidget` →
  `RetentionCohortsWidget`. Each widget reads its own composable;
  the page uses the existing `useDateRange` for the
  TrafficSources + ActivationFunnel widgets (the RetentionCohorts
  widget uses a `cohortCount` ref defaulting to 8).
- **`apps/dashboard/src/pages/dashboard/OverviewPage.vue`** —
  insert `AcquisitionFunnelStripWidget` immediately after the
  existing `DauChartWidget` mount point. No other Overview
  surface changed; existing flow (`VisionCard` → `GovernanceKpiStrip`
  → page-header → since-you-last-looked → mock-KPI-strip →
  `DailyExecutionPanel` → `GovernanceThroughputWidget` +
  `StatusFeedWidget` → charts → `AlertsPanel`) preserved
  byte-identical apart from the single strip insertion.

### Governance (4 files)

- **`docs/ai/STATUS.md`** — `### WP-203 Executed` block per Definition of Done.
- **`docs/ai/DECISIONS.md`** — D-20301..D-20303 reserved at draft;
  landed Active at execution close (byte-identical to EC §DECISIONS.md
  verbatim block per PS-1 transcription convention WP-196/198/199
  established).
- **`docs/ai/work-packets/WORK_INDEX.md`** — flip WP-203 row to `[x]`
  with completion date.
- **`docs/ai/execution-checklists/EC_INDEX.md`** — flip EC-231 row to `Done`.

## Out of Scope

- **`analytics_events` migration / server-side capture / endpoints / PII
  posture decision** — entire WP-205 scope. WP-203 forward-locks the
  `AnalyticsEvent` envelope shape (so WP-205 has zero schema ambiguity)
  but ships no migration, no server code, no real-data wire-up. The
  `MOCK` freshness badge is the operator's visible signal that this is
  not real data.
- **Per-user ARPU / LTV widget** — explicitly deferred under WP-203 per
  WP-196 §Specific Deferrals row. ARPU/LTV needs the per-user revenue
  projection which itself needs WP-205's event stream. The
  `AnalyticsEvent.user_id` field is the forward-contract hook; the
  widget itself is a future WP.
- **Churn / cancellation surface** — distinct concern from retention
  (churn = "they came back N times then stopped"; retention = "they came
  back at all after signup"). Original WP-196 grouping had a separate
  WP-C for this; the user's 2026-06-03 scope decision folded RETENTION
  into WP-203 but churn stays separate. Future WP.
- **A/B test infrastructure / experiment-assignment widget** — separate
  experimentation surface; not part of the v1 analytics dashboard.
- **Engagement-depth metrics (DAU/MAU, sessions-per-week)** —
  `DauChartWidget` already exists for daily-active; per-week + per-month
  depth is a future widget if the operator wants it.
- **Public-surface health / cost watchdog** — WP-D grouping; separate WP.
- **TAM saturation / content-breadth** — WP-E grouping; separate WP.
- **Pricing / conversion experiment widgets** — out of v1 analytics
  scope; pricing surface is owned by the WP-196 / WP-205 revenue
  pipeline, not the WP-203 / WP-205 acquisition pipeline.
- **`/api/admin/billing/history` drill-down from any of the 3 new
  widgets** — WP-196 §Specific Deferrals row; needs the per-transaction
  detail wire-up which is its own server WP.
- **Stripe customer-portal links from any widget** — WP-196 §Specific
  Deferrals row; needs per-environment URL config.
- **Multi-operator / multi-role visibility** — dashboard is single-operator
  per WP-197 deploy posture. RBAC widening to per-role visibility is a
  future WP.
- **Real-time updates / WebSocket push** — out of v1 scope. The 3
  widgets use the existing `useFetch` polling model (or static-mock
  for v1) — no WebSocket subscription added.
- **Engine / registry / server / shared-tooling code** — none. Pure
  client-only WP.

---

## Files Expected to Change

### Types contract (1 modified)

1. `apps/dashboard/src/types/index.ts` — **modified** — append 4 new
   interfaces (`AnalyticsEvent`, `TrafficSource`, `ActivationFunnelStep`,
   `RetentionCohort`), 3 closed unions (`AcquisitionChannel`,
   `ActivationStep`, `AcquisitionEventType`), and 2 drift-pinned
   canonical readonly arrays (`ACQUISITION_CHANNELS`, `ACTIVATION_STEPS`)
   per WP-198's `KPI_STATUSES` precedent.

### Mock service (1 new + 1 modified)

2. `apps/dashboard/src/services/analyticsMocks.ts` — **new** —
   exports `mockTrafficSources(range)`, `mockActivationFunnel(range)`,
   `mockRetentionCohorts(cohortCount)`. All `ServiceResponse<T>`
   wrapped with `source: 'MOCK'`. Determinism via `hashRange(range)`
   seed per D-19605.
3. `apps/dashboard/src/services/mocks.ts` — **modified** — append
   re-exports of the 3 new mock factories per the `billingHealthMocks`
   precedent (`export { ... } from './analyticsMocks.js';`).

### Composables (3 new + 3 tests = 6 new)

4. `apps/dashboard/src/composables/useTrafficSources.ts` — **new** —
   per-channel totals + signup conversion derivations.
5. `apps/dashboard/src/composables/useTrafficSources.test.ts` — **new**
   — ≥ 7 tests (totals; per-channel conversion; zero-visitor channel;
   empty input; referential stability; **source/updatedAt passthrough
   per §Composable Source Contract**; **series sorted ascending by
   `date` via Unicode code-unit comparison per §Aggregation rule**).
6. `apps/dashboard/src/composables/useActivationFunnel.ts` — **new** —
   step-to-step conversion + overall conversion.
7. `apps/dashboard/src/composables/useActivationFunnel.test.ts` —
   **new** — ≥ 7 tests (step counts; step-to-step conversion;
   zero-count step safety; empty input; overall conversion = literal
   `stepCounts['first-match-completed'] / stepCounts['signup-start']`
   AND assert it diverges from product-of-stages under a synthetic
   case with rounded intermediate counts per §Conversion invariants;
   **source/updatedAt passthrough per §Composable Source Contract**;
   **`stepCounts` includes all 4 `ACTIVATION_STEPS` even when input
   omits some steps**).
8. `apps/dashboard/src/composables/useRetentionCohorts.ts` — **new** —
   per-cohort returns + cross-cohort averages + best-D7-cohort
   selection.
9. `apps/dashboard/src/composables/useRetentionCohorts.test.ts` —
   **new** — ≥ 7 tests (averages; best-cohort selection; empty input
   returns null `cohortWithHighestDay7`; single-cohort edge case;
   ties broken deterministically by `cohortWeek` lexical descending;
   **source/updatedAt passthrough per §Composable Source Contract**;
   **mock-output-is-pure-function-of-`cohortCount` per §Determinism
   scope** — call `mockRetentionCohorts(8)` twice and assert deep
   equality across the two calls).

### Widgets (4 new)

10. `apps/dashboard/src/widgets/TrafficSourcesWidget.vue` — **new** —
    4-state Widget Contract; stacked-bar EChart; footer line.
11. `apps/dashboard/src/widgets/ActivationFunnelWidget.vue` — **new** —
    4-state Widget Contract; 4-step funnel with sparklines.
12. `apps/dashboard/src/widgets/RetentionCohortsWidget.vue` — **new** —
    4-state Widget Contract; heatmap-style table (text-label-first
    per Vision §17 accessibility).
13. `apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue` —
    **new** — compact horizontal strip; 3 cards + 3-channel-percentage
    pill row + "View full funnel →" link to `/players`.

### Drift test (1 new)

14. `apps/dashboard/src/utils/funnelTaxonomy.test.ts` — **new** —
    bidirectional drift assertion: `ACQUISITION_CHANNELS` ↔
    `AcquisitionChannel` union; `ACTIVATION_STEPS` ↔ `ActivationStep`
    union. Mirrors `apps/dashboard/src/utils/kpiStatus.test.ts`
    (WP-198 precedent).

### Page wiring (2 modified)

15. `apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue` —
    **modified** — wire the 3 full widgets in vertical layout; use
    `useDateRange` for the two trend widgets; use a local
    `cohortCount` ref defaulting to 8 for the cohorts widget.
16. `apps/dashboard/src/pages/dashboard/OverviewPage.vue` —
    **modified** — insert `AcquisitionFunnelStripWidget` after the
    existing `DauChartWidget` mount point. No other layout change.

### Governance (4 modified)

17. `docs/ai/STATUS.md` — **modified** — `### WP-203 Executed` block.
18. `docs/ai/DECISIONS.md` — **modified** — D-20301..D-20303 (proposed
    → Active at execution close per WP-196/198/199 verbatim-transcription
    PS-1 convention).
19. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-203 row `[x]`.
20. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-231 row Done.

**Total: 22 files** (14 new + 4 modified source + 4 governance).

No engine / registry / server / shared-tooling / migration files
changed — pure client-only WP.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. **No diffs. No
  snippets.** Output that omits unchanged sections is rejected.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — full
  English names, JSDoc on every function, `// why:` on non-obvious
  decisions, no `.reduce()` with branching, explicit `for...of`.
- No `Math.random()` in widget source (mock data may use it inside
  `analyticsMocks.ts` only — same scope rule as `services/mocks.ts`'s
  existing `randomBetween`).
- No `Date.now()` in widget source apart from `ServiceResponse.updatedAt`
  population (already established pattern in `wrapMock`).
- No `boardgame.io` import; no `@legendary-arena/{game-engine,registry,preplan,server}`
  import in `apps/dashboard/src/`.
- No new npm dependencies.
- No hex color literals in widget source — PrimeVue / Aura tokens
  only (WP-162 / WP-196 / WP-198 precedent).
- No `localCompare` for ordering — Unicode code-unit comparator
  (per D-19605 + D-19904 precedent).

**Packet-specific:**

- **All v1 data is mock.** Every value displayed by every widget is
  sourced from `services/analyticsMocks.ts`. Every widget carries
  `source: 'MOCK'` freshness badge. Any widget that fetches non-mock
  data is a scope violation and a HARD FAIL.
- **Forward-locked `AnalyticsEvent` envelope (D-20301).** The
  `AnalyticsEvent` interface shape is locked at WP-203 drafting
  time; WP-205 (server-side capture) consumes this shape verbatim
  — no widening, no narrowing, no rename. Future per-event-type
  property schemas (e.g., `referrer` for `direct` channel; `query`
  for `search`) ride on the `properties` field's open
  `Record<string, string | number | boolean | null>` shape — but
  the envelope shape (event_type, user_id, session_id, timestamp,
  properties) is closed. **`AcquisitionEventType` union is reserved
  for funnel events only** (channels ∪ steps ∪ `'retention-return'`);
  future non-funnel event types (e.g., billing, error, governance)
  MUST NOT be added to this union — create a separate union
  alongside `AcquisitionEventType` and a sibling envelope or
  discriminator, do not bloat the funnel taxonomy.
- **PII posture deferred to WP-205 (D-20303).** WP-203 mocks assume
  `user_id` is an anonymized opaque string (no email, no handle, no
  IP, no fingerprint). WP-205's drafter decides the actual posture
  at server-side capture time (raw user_id vs hash vs auth-gated).
  WP-203 widgets MUST NOT display any field that resembles email,
  handle, IP, or other identifying info — only counts, rates, and
  channel/step labels.
- **Composable Source Contract (hard).** Every analytics composable
  accepts a getter of shape
  `() => ServiceResponse<readonly T[]>` (extends D-19607 Shared
  Source Contract pattern). The composable is responsible for
  reading `.data` for its derivations but MUST preserve `.source`
  and `.updatedAt` in its returned object so the widget can wire
  freshness display via `useDataFreshness` without re-importing
  the service layer. This contract makes the MOCK → LIVE swap a
  pure getter substitution in WP-205 — the widget files stay
  byte-identical pre/post flip.
- **Aggregation rule (locked).**
  - `TrafficSource[]` and `ActivationFunnelStep[]` series are
    **per-day discrete counts** (NOT cumulative). Each `date` entry
    represents a closed daily bucket UTC-normalized via
    `normalizeRange` (D-19605 carry-forward).
  - Series MUST be sorted **ascending** by `date` using Unicode
    code-unit comparison (no `localeCompare`; see D-19605 / D-19904
    carry-forward).
  - Composables MUST iterate `ACQUISITION_CHANNELS` /
    `ACTIVATION_STEPS` in canonical-array order when assembling
    per-channel / per-step outputs (see §Determinism scope) —
    object-key insertion order is observable in Vue templates and
    downstream chart configs.
- **Conversion invariants (locked).**
  - **Step-to-step conversion** = `stepCounts[ACTIVATION_STEPS[n+1]] /
    stepCounts[ACTIVATION_STEPS[n]]` (zero-denominator returns `0`,
    not `NaN`).
  - **Overall conversion** = `stepCounts['first-match-completed'] /
    stepCounts['signup-start']` (the literal end-to-end ratio).
  - **Overall conversion MUST NOT be computed as the product of
    step-to-step conversions.** Product-of-ratios diverges from
    the literal end-to-end ratio whenever any intermediate count is
    rounded; both the widget footer and the composable's
    `overallConversion` field follow the literal ratio.
- **Retention definition (v1 mock contract).**
  - A "return" is any event with the same `user_id` occurring
    **after** the user's signup event (event of `event_type
    === 'signup-complete'`).
  - **Day-N return** is counted if at least one event exists for
    that `user_id` on that UTC day (N days after signup).
  - **No deduplication beyond existence**: per-user-per-day return
    is a boolean (multiple returns on the same day still count as
    one). `day1ReturnCount` is the count of distinct `user_id`s
    in the cohort with day-1 return == true; same for day-7.
  - This contract holds for the mock data; WP-205 implements the
    same semantic when wiring real data (no operator-visible
    behavior change at MOCK → LIVE flip).
- **Mock determinism (D-19605 carries forward) + Determinism scope
  (hard).** Same `DateRange` input → byte-identical mock output
  across two consecutive composable evaluations. `hashRange(range)`
  seeds the mock PRNG; FNV-1a per D-19605. No bare `Math.random` in
  composable or widget source.
  - **Mock outputs are a pure function of:** `DateRange` (for
    `mockTrafficSources` and `mockActivationFunnel`) and
    `cohortCount: number` (for `mockRetentionCohorts`).
  - **No other external state** (system clock, environment
    variables, JS engine iteration order, ambient locale, ambient
    timezone) may influence output. `Date.now()` is allowed
    **only** in `wrapMock`'s `updatedAt` population (existing
    pattern) — not in the data-shape decisions.
  - **Iteration order MUST be canonical** — assemble per-channel
    outputs by iterating `ACQUISITION_CHANNELS` in order; assemble
    per-step outputs by iterating `ACTIVATION_STEPS` in order. Do
    NOT iterate `Object.keys()` of a derived object, do NOT iterate
    a `Map` populated in non-canonical order. Drift across runtimes
    is prevented by sourcing iteration from the canonical
    drift-pinned arrays.
- **Empty-state rule.** Empty datasets MUST NOT render charts with
  zeroed series (no flat-line chart, no degenerate axis, no
  empty-funnel diagram with all stages showing 0). Empty datasets
  MUST render the explicit `empty` arm of the 4-state Widget
  Contract per the WP-157 / D-19608 reference implementations. See
  §Widget Data Requirements for the per-widget thresholds.
- **Drift-pinned canonical arrays.** `ACQUISITION_CHANNELS` and
  `ACTIVATION_STEPS` are `readonly` arrays whose membership is
  asserted bidirectional-equal to their union types in
  `apps/dashboard/src/utils/funnelTaxonomy.test.ts`. Adding a 5th
  channel without updating BOTH the union and the array (or vice
  versa) fails the drift test loudly. Mirrors `KPI_STATUSES` precedent.
- **Closed-set integer-only rate math (per D-19601 carry-forward).**
  Rates are computed as `numerator / denominator`; the denominator
  is checked for zero BEFORE the division (zero-denominator returns
  `0`, not `NaN`). Display formatting applies `Math.round(rate * 1000) / 10`
  for 1-decimal-place percentages.
- **4-state Widget Contract enforced structurally.** Every widget
  has exactly one `state` computed + a 4-arm `v-if` template
  (loading / error / empty / data) per WP-196's Widget State Gate
  Pattern (D-19608 — adapted to non-chart widgets). Grep gate
  asserts exactly 1 `v-if="state ===` per new widget file.
- **No `RecentActivityWidget`-style displacement.** WP-203 does NOT
  remove or hide any existing Overview widget (it adds one strip;
  it does not displace any).
- **Layer boundary.** Zero `@legendary-arena/{game-engine,registry,preplan,server}`
  imports anywhere in `apps/dashboard/src/`. Verified by grep gate
  at close.
- **No new package dependency.** `apps/dashboard/package.json` +
  `pnpm-lock.yaml` zero diff. EChart wrapper, PrimeVue, Pinia — all
  pre-existing.
- **No server-side surface.** `apps/server/src/**` zero diff. No
  `docs/ai/REFERENCE/api-endpoints.md` edit (catalog update is a
  WP-205 concern; WP-203 forward-locks the contract but adds no
  endpoint).
- **No `.session/` or `docs/ai/invocations/` commit.** Scratchpads
  stay gitignored.

**Session protocol:**

- If `apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue`
  layout conflicts with the existing OverviewPage flow (e.g., breaks
  responsive layout at common viewport widths), stop and report; do
  not silently truncate the strip's pill row.
- If a Vue 3 / PrimeVue API the WP needs is missing, document the
  gap and stop; do not invent a workaround mid-session.
- If a mock-data shape decision is ambiguous (e.g., what channel
  should a `query=signup` URL get bucketed into), default to
  `'direct'` and document the choice with a `// why:` comment.

**Locked contract values:**

```typescript
// types/index.ts additions (verbatim — copy as-is)

export type AcquisitionChannel = 'direct' | 'search' | 'referral' | 'paid';

export const ACQUISITION_CHANNELS: readonly AcquisitionChannel[] = [
  'direct',
  'search',
  'referral',
  'paid',
];

export type ActivationStep =
  | 'signup-start'
  | 'signup-complete'
  | 'first-match-started'
  | 'first-match-completed';

export const ACTIVATION_STEPS: readonly ActivationStep[] = [
  'signup-start',
  'signup-complete',
  'first-match-started',
  'first-match-completed',
];

export type AcquisitionEventType =
  | AcquisitionChannel
  | ActivationStep
  | 'retention-return';

export interface AnalyticsEvent {
  readonly event_type: AcquisitionEventType;
  readonly user_id: string | null;
  readonly session_id: string;
  readonly timestamp: number;
  readonly properties: Readonly<Record<string, string | number | boolean | null>>;
}

export interface TrafficSource {
  readonly channel: AcquisitionChannel;
  readonly date: string;
  readonly visitorCount: number;
  readonly signupCount: number;
}

export interface ActivationFunnelStep {
  readonly step: ActivationStep;
  readonly date: string;
  readonly count: number;
}

export interface RetentionCohort {
  readonly cohortWeek: string;
  readonly cohortSize: number;
  readonly day1ReturnCount: number;
  readonly day7ReturnCount: number;
}
```

**Forward-contract governance clause (locked — D-20301):**

> `AnalyticsEvent` envelope is closed at 5 fields (event_type,
> user_id, session_id, timestamp, properties); future per-event-type
> property schemas ride on the open `properties` field. WP-205
> consumes this envelope verbatim at server-side capture time.

---

## Acceptance Criteria

### Types / Drift

- [ ] `apps/dashboard/src/types/index.ts` carries 4 new interfaces +
  3 closed unions + 2 drift-pinned canonical arrays per §Locked
  contract values byte-for-byte.
- [ ] **MOCK → LIVE upgrade path verifiable.** The 4 widget files
  have ZERO direct `mockTrafficSources` / `mockActivationFunnel` /
  `mockRetentionCohorts` call sites — every widget consumes its
  composable, which consumes a getter-function source. When WP-205
  wires real endpoints, the getter changes from
  `() => mockTrafficSources(range).data` to
  `() => useFetch(...).data.value`; the widget files are byte-identical
  pre/post flip. Verified by `grep -rE "mockTrafficSources|mockActivationFunnel|mockRetentionCohorts" apps/dashboard/src/widgets/{Traffic,Activation,Retention,AcquisitionFunnel}*.vue` returning zero matches.
- [ ] Drift-detection test `apps/dashboard/src/utils/funnelTaxonomy.test.ts`
  asserts `ACQUISITION_CHANNELS` ↔ `AcquisitionChannel` union
  bidirectional equality AND `ACTIVATION_STEPS` ↔ `ActivationStep`
  union bidirectional equality.
- [ ] `AnalyticsEvent.user_id` field type is exactly `string | null`
  (no other identifying fields; PII posture deferred to WP-205 per
  D-20303).

### Behavior / Determinism (composables)

- [ ] **Composable Source Contract.** All 3 composables accept
  `() => ServiceResponse<readonly T[]>` and surface `source` +
  `updatedAt` in their returned object (per §Composable Source
  Contract). Verified by type-check + test-side assertion that
  `composable(...).source.value === input.source` for at least one
  test per composable.
- [ ] `useTrafficSources` per-channel `signupConversionByChannel`
  returns `0` (not `NaN`) for zero-visitor channels.
- [ ] `useTrafficSources` `series` is sorted ascending by `date` via
  Unicode code-unit comparison (per §Aggregation rule); per-channel
  totals iterate `ACQUISITION_CHANNELS` in canonical order.
- [ ] `useActivationFunnel` step-to-step conversion returns `0` (not
  `NaN`) for zero-count steps; `overallConversion` is the literal
  ratio `stepCounts['first-match-completed'] /
  stepCounts['signup-start']` per §Conversion invariants. A dedicated
  test asserts `overallConversion !== product(stepToStepConversion)`
  for a synthetic input where the two would diverge under rounding
  (proves the implementation uses the literal ratio, not the
  product).
- [ ] `useActivationFunnel` `stepCounts` includes all 4 entries of
  `ACTIVATION_STEPS` regardless of input (missing steps default to
  `0` at the composable layer).
- [ ] `useRetentionCohorts` empty input returns `averageDay1Rate = 0`,
  `averageDay7Rate = 0`, `cohortWithHighestDay7 = null`.
- [ ] `useRetentionCohorts` ties on `day7ReturnCount` broken by
  `cohortWeek` lexical descending (deterministic).
- [ ] Mock determinism: each composable produces byte-identical
  output for the same `DateRange` input across two consecutive
  evaluations (FNV-1a seed via `hashRange`). A test asserts mock
  output depends ONLY on the documented inputs (`DateRange` for
  traffic/funnel; `cohortCount` for retention) — call the factory
  twice with identical inputs and assert deep equality.

### Data / Mock

- [ ] `analyticsMocks.ts` exports exactly 3 factory functions, each
  returning `ServiceResponse<T>` with `source: 'MOCK'` and
  `updatedAt: Date.now()`.
- [ ] `services/mocks.ts` re-exports all 3 mock factories.
- [ ] No bare `Math.random` call site in any of the 3 composables
  or 4 widgets (grep gate; `Math.random` only allowed inside
  `analyticsMocks.ts`).
- [ ] No production data accessed by any widget (every widget
  surfaces `MOCK` freshness badge).

### Widgets / Layout

- [ ] 4 new widgets each have exactly 1 `v-if="state ===` match
  (Widget State Gate Pattern; verified per file).
- [ ] Zero hex color literals (`#[0-9a-fA-F]{3,8}`) in any of the
  4 new widget files.
- [ ] `PlayerAnalyticsPage.vue` renders the 3 full widgets in
  vertical order: TrafficSources → ActivationFunnel →
  RetentionCohorts.
- [ ] `OverviewPage.vue` renders `AcquisitionFunnelStripWidget`
  exactly once, positioned immediately after `DauChartWidget`.
- [ ] All 4 widgets carry required attributes: `data-testid=...`,
  `aria-label=...` (per Vision §17 accessibility).
- [ ] `AcquisitionFunnelStripWidget` "View full funnel →" link
  routes to `/players` via `useRouter().push('/players')` or
  `<router-link to="/players">` — verified by grep.

### Build / Test / Layer

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 with
  **≥ 21 net new tests** (≥ 7 per composable × 3 composables:
  original 5 + the new Source-Contract passthrough test + 1-2 new
  invariant tests per the locked §Behavior / Determinism criteria;
  drift-test additions are non-counted unit assertions). Baseline
  per the post-WP-199 dashboard test count.
- [ ] Layer-boundary grep: zero
  `@legendary-arena/(game-engine|registry|preplan|server)` matches
  anywhere in `apps/dashboard/src/`.
- [ ] No-new-deps gate: `git diff --stat apps/dashboard/package.json
  pnpm-lock.yaml` empty.
- [ ] No-server-edits gate: `git diff --name-only apps/server/
  data/migrations/ docs/ai/REFERENCE/api-endpoints.md` empty.
- [ ] No-engine-edits gate: `git diff --name-only packages/` empty.
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Build + test the dashboard
pnpm --filter @legendary-arena/dashboard build
pnpm --filter @legendary-arena/dashboard test

# Type-contract presence
grep -nE "AcquisitionChannel|ACQUISITION_CHANNELS|ActivationStep|ACTIVATION_STEPS|AnalyticsEvent|TrafficSource|ActivationFunnelStep|RetentionCohort" apps/dashboard/src/types/index.ts
# Expected: matches across the 4 interfaces, 3 unions, 2 canonical arrays.

# Drift-test exists and asserts bidirectional
grep -nE "ACQUISITION_CHANNELS|ACTIVATION_STEPS" apps/dashboard/src/utils/funnelTaxonomy.test.ts
# Expected: both arrays asserted; test passes.

# Mock determinism source
grep -nE "hashRange|wrapMock" apps/dashboard/src/services/analyticsMocks.ts
# Expected: hashRange seeded mock; wrapMock used per factory.

# No bare Math.random in widgets or composables
grep -rnE "Math\.random" apps/dashboard/src/widgets/ apps/dashboard/src/composables/
# Expected: zero matches. (Math.random only allowed inside analyticsMocks.ts.)

# Widget State Gate Pattern — exactly 1 match per new widget
grep -cE 'v-if="state ===' apps/dashboard/src/widgets/TrafficSourcesWidget.vue apps/dashboard/src/widgets/ActivationFunnelWidget.vue apps/dashboard/src/widgets/RetentionCohortsWidget.vue apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue
# Expected: 1 per file.

# Zero hex colors in new widgets
grep -rnE '#[0-9a-fA-F]{3,8}' apps/dashboard/src/widgets/TrafficSourcesWidget.vue apps/dashboard/src/widgets/ActivationFunnelWidget.vue apps/dashboard/src/widgets/RetentionCohortsWidget.vue apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue
# Expected: zero matches.

# Layer boundary
grep -rnE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/
# Expected: zero matches.

# No-new-deps + no-server-edits + no-engine-edits gates
git diff --stat apps/dashboard/package.json pnpm-lock.yaml
git diff --name-only apps/server/ data/migrations/ docs/ai/REFERENCE/api-endpoints.md packages/
# Expected: all empty.

# Strip widget link routes to /players
grep -nE "'/players'|to=\"/players\"|push\('/players'\)" apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue
# Expected: at least 1 match.

# Full monorepo build
pnpm -r build
```

Expected: every grep returns the documented count; type-contract
fields present byte-identical to §Locked contract values; drift
test passes; build + test exit 0.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-203 Executed` block (4 new
  widgets + 3 new composables + 1 new mock service + 1 new drift
  test + page wiring on both Overview and PlayerAnalyticsPage;
  forward-locked `AnalyticsEvent` envelope for WP-205; MOCK
  freshness badge on all 4 widgets per WP-197 D-19702; PII posture
  deferred to WP-205 per D-20303; per-user ARPU/LTV deferred per
  WP-196 §Specific Deferrals).
- [ ] `docs/ai/DECISIONS.md` has D-20301..D-20303 (proposed):
  - **D-20301** — `AnalyticsEvent` envelope locked at 5 fields
    (event_type, user_id, session_id, timestamp, properties); WP-205
    consumes verbatim. Per-event-type property schemas ride on the
    open `properties` field; the envelope shape is closed.
  - **D-20302** — Mock-mode-first per WP-197 D-19702 carries forward
    to WP-203. All 4 widgets ship `MOCK` freshness badge; flip to
    `LIVE` when WP-205 wires real-data endpoints (no widget-side
    change needed at flip time — the `useFetch` / `ServiceResponse`
    surface owns the source label).
  - **D-20303** — PII posture deferred to WP-205 drafting time. WP-203
    mocks assume `user_id` is an anonymized opaque string; no email,
    no handle, no IP, no fingerprint surfaces. The decision (raw
    user_id vs hash vs auth-gated) belongs in WP-205 with finance /
    legal consult.
- [ ] `WORK_INDEX.md`: WP-203 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-231 row Done.
- [ ] No **source** file outside the 22-file §Files Expected to Change
  list was modified. Toolchain-generated metadata (lockfiles, IDE
  caches) review-and-revert unless explicitly required.

---

## Vision Alignment

**Vision clauses touched:** §3 (Trust & Fairness — PII posture
deferral named explicitly), §11 (Identity / accounts —
`AnalyticsEvent.user_id` shape locked forward), §17 (Accessibility —
text-label-first chips + 4-arm widget state contract), §20 (Funding
surface — N/A: no funding affordance touched).

**Conflict assertion:** `No conflict: this WP preserves all touched
clauses.` PII posture is named and deferred (not bypassed); the
forward contract reserves `user_id: string | null` so the WP-205
drafter can pick raw / hashed / auth-gated without re-shaping
WP-203's widgets. Accessibility-first chip rendering follows the
WP-198 / WP-199 text-label-first precedent (color is decorative; the
label / number is the load-bearing display).

**Non-Goal proximity check:** `N/A — WP touches no monetization or
competitive surface.` Acquisition analytics are operator-only
(per WP-197 single-operator allow); no public surface; no scoring;
no leaderboard.

**Determinism preservation:** `N/A — WP touches no scoring, replay,
RNG, or simulation surface.` Mock data uses `hashRange`-seeded
deterministic PRNG (D-19605 carry-forward) so the same DateRange
produces the same mock series across renders — this is for operator
UX (no flicker on date-range change) not for game determinism.

---

## Funding Surface Gate

N/A — dashboard analytics WP; no §20.1 trigger surface touched (no
navigation funding affordance, no registry-viewer surface, no profile
attribution, no user-visible donate copy). The dashboard is
single-operator per WP-197; not a public surface.

---

## API Catalog Update

N/A — no HTTP endpoints or `apps/server/src/**` library functions
added/modified/removed. The forward-locked `AnalyticsEvent` envelope
is a type contract under `apps/dashboard/src/types/`, not an HTTP
endpoint. WP-205 will add the actual `POST /api/analytics/events`
(or equivalent) endpoint and update the catalog at that point.

---

## Anti-Patterns to Avoid

- Do NOT add `LIVE` data fetching in any widget — every widget reads
  from `analyticsMocks.ts`; flipping to `LIVE` is WP-205's concern.
- Do NOT compute conversion rates as floating-point ratios and
  display without zero-denominator guard (`NaN`% surfaces in the
  widget are a visible failure mode).
- Do NOT bake email / handle / IP / fingerprint into the mock data —
  the PII posture is explicitly deferred; mocks must stay
  anonymized.
- Do NOT use a pie chart for the channel breakdown — stacked bar
  per the WP-196 §Anti-Patterns precedent.
- Do NOT add a server endpoint or SQL query "just to make it work" —
  WP-203 is mock-mode-first by contract.
- Do NOT add a new npm dependency for charting / table rendering —
  use the existing EChart wrapper + PrimeVue DataTable.
- Do NOT add `RecentActivityWidget`-style displacement; WP-203 is
  purely additive on both Overview and PlayerAnalyticsPage.
- Do NOT use color as the sole signal in the retention heatmap —
  text-label-first per Vision §17.
- Do NOT introduce a 5th `AcquisitionChannel` (e.g., `'email'`,
  `'social'`) without updating both the union and `ACQUISITION_CHANNELS`
  in the same edit — drift test will fail loudly.
- Do NOT recompute the same series in two places — if both Overview
  strip and PlayerAnalyticsPage need `TrafficSource[]`, they both
  call `useTrafficSources` (with their own `DateRange` ref); the
  composable is the single source of truth.
- Do NOT compute `overallConversion` as the product of step-to-step
  ratios — use the literal `stepCounts['first-match-completed'] /
  stepCounts['signup-start']` ratio per §Conversion invariants
  (product-of-ratios silently diverges under rounding and creates a
  display mismatch between the footer and the per-stage tooltip).
- Do NOT pass a bare `() => readonly T[]` getter into the composables
  — the contract is `() => ServiceResponse<readonly T[]>` (per
  §Composable Source Contract). Stripping the `ServiceResponse`
  envelope at the composable boundary loses the `source` label and
  breaks the MOCK → LIVE swap symmetry that WP-205 depends on.
- Do NOT iterate `Object.keys(stepCounts)` (or any derived object)
  when rendering per-step / per-channel output — iterate the
  drift-pinned canonical array (`ACQUISITION_CHANNELS` /
  `ACTIVATION_STEPS`) instead. Object-key iteration order is
  observable in templates and varies across runtimes.
- Do NOT use `localeCompare` to sort the daily series by date — use
  Unicode code-unit comparison per §Aggregation rule. `YYYY-MM-DD`
  strings sort correctly under code-unit comparison; `localeCompare`
  introduces ambient-locale dependence.
- Do NOT add a new `event_type` value for a non-funnel event (e.g.,
  billing, error, governance) to the `AcquisitionEventType` union —
  create a separate union per §Forward-locked envelope. The funnel
  taxonomy stays narrow.
- Do NOT render zero-percent pills in `AcquisitionFunnelStripWidget`
  when `paid` summed = 0 — exclude `paid` entirely and recompute
  the remaining percentages over `direct + search + referral` so
  they still sum to 100% (per §Strip widget collapse rule).
- Do NOT render an empty chart with zeroed series or a degenerate
  axis when the underlying dataset is empty — drop the widget to
  the explicit `empty` arm of the 4-state Widget Contract per
  §Empty-state rule.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph + user-visible outcome | ✅ (operator sees 3 funnel widgets + 1 Overview strip) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-157/162/196/197/198/199 all ✅; 9 composables + 16 widgets verified against `main @ 5b85216`) |
| 3 | Context (Read First) specific (paths + section refs + D-entry refs) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ (Out of Scope enumerates 11 distinct deferrals) |
| 5 | Files Expected to Change matches contract | ✅ (22 files: 14 new + 4 modified source + 4 governance; WP-200/201 file-count precedent) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ (4-heading grouping per WP-202 precedent) |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — client-only; no engine/registry/server | ✅ (no `@legendary-arena/*` imports; grep gate at close) |
| 11 | Identity model — PII posture deferred to WP-205; locked here | ✅ (D-20303 reserved) |
| 12 | Test rules — `node:test`; ≥21 net-new tests (bumped from 15 by Composable Source Contract + locked invariant tests); no boardgame.io import | ✅ |
| 13 | pnpm/node commands only; expected output shown | ✅ |
| 14 | Acceptance criteria binary + specific | ✅ (4-heading grouping; binary checks; specific tokens) |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/scope-bound | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing | ✅ |
| 17 | Vision Alignment present; clauses §3 / §11 / §17 / §20 | ✅ |
| 18 | Prose-vs-grep: verification greps scoped to file/path/token; D-entries cited where forbidden tokens discussed | ✅ |
| 19 | Bridge-vs-HEAD staleness | N/A |
| 20 | Funding surface N/A with justification | ✅ (dashboard analytics; operator-only single-operator surface; no funding affordance) |
| 21 | API catalog N/A with justification | ✅ (no HTTP endpoint; forward-contract is a type contract; WP-205 will update the catalog at endpoint-add time) |

---

*Drafted: 2026-06-03. Baseline `origin/main @ 5b85216` (post-WP-202
close). WP-B of the operator-dashboard pre-mortem grouping (WP-196
§Future Work). Closest precedent: WP-196 (mock-mode-first dashboard
surface with forward server contract). Folds the original WP-B
(acquisition + funnel) + WP-C (retention cohorts) pair into a single
client-side surface per operator scope decision 2026-06-03; WP-205
(server-side capture + `analytics_events` migration + endpoints + PII
posture decision) deferred to a future session. Reserves D-20301
(AnalyticsEvent envelope lock), D-20302 (mock-mode-first carries
forward), D-20303 (PII posture deferral). Hard-deps: WP-157 ✅,
WP-162 ✅, WP-196 ✅, WP-197 ✅, WP-198 ✅, WP-199 ✅ — all landed.*

*Refined: 2026-06-03 (second pass, pre-execution audit-grade tightening).
Folded 5 required + 3 recommended refinements into §Non-Negotiable
Constraints + §Widget Data Requirements: Composable Source Contract
(getters now `() => ServiceResponse<readonly T[]>`; extends D-19607);
Aggregation rule (daily discrete UTC buckets sorted ascending via
Unicode code-unit comparison; canonical iteration); Conversion
invariants (overall = literal `step[3] / step[0]`, NOT product of
stages); Retention definition (return = any event w/ same `user_id`
after signup; per-user-per-day boolean); Determinism scope (mock
output is a pure function of `DateRange` + `cohortCount`; no system
clock / env / iteration-order dependence); Widget Data Requirements
(per-widget minimum-data thresholds); Empty-state rule (drop to
explicit `empty` arm — not flat charts); Strip channel-collapse
clarification (paid summed = 0 → exclude paid, rebalance to 100%).
Net-new-test gate bumped from `15` to `≥ 21` (≥ 7 per composable × 3).
Locked contract values (4 interfaces, 3 unions, 2 canonical arrays)
unchanged — refinements are tightening, not contract churn. No new
D-entries needed (all refinements derive from existing D-entries:
D-19605, D-19607, D-19608, D-19908, D-20301..03). Hard-deps and file
count unchanged.*
