# WP-196 — Dashboard Net Revenue + Paid-Action Errors Widgets

**Status:** Draft
**Primary Layer:** Client (`apps/dashboard`)
**Dependencies:** WP-157 (Dashboard Scaffold) — Done 2026-05-16; WP-162 (Dashboard Daily Execution + UI Polish) — refer to its precedent for Widget Contract and design tokens
**EC:** EC-225
**Baseline:** `origin/main` at time of execution

---

## Goal

After this packet, the dashboard's `/monetization` page surfaces two new
widgets that close the financial-visibility gap identified in the
pre-mortem dated 2026-05-31:

1. A **Net Revenue Trend** widget that derives **gross − royalty − Stripe
   fees − infra COGS** from the same data the existing
   `RevenueChartWidget.vue` consumes, and displays the four components
   stacked so the operator sees what is actually banked vs. what is
   gross-reported.

2. A **Paid-Action Errors** widget that surfaces two billing-side health
   signals: Stripe webhook fulfillment failure rate
   (`legendary.stripe_events.process_error IS NOT NULL` over a rolling
   window) and Checkout intent abandonment rate
   (`legendary.stripe_checkout_sessions.intent_status IN ('expired',
   'canceled')` over a rolling window).

All data remains mock for this WP. No server endpoints are added or
modified. The widgets follow the WP-157 Widget Contract (4-state
rendering + freshness badge) and the WP-162 design-token / theme-toggle
discipline. The future real-data wiring is explicitly deferred to a
follow-up server WP.

---

## Assumes

- WP-157 scaffold exists and builds cleanly (`pnpm -r build` exits 0).
- WP-162 UI polish has landed and the Aura dark-mode preset, widget
  card structure (`KpiCard.vue` header/body/footer), and design-token
  lock (`--p-surface-card`, `--p-text-color`, `--p-primary-color`,
  `--p-text-muted-color`, `--p-content-border-color`) are in effect.
- PrimeVue 4 Aura theme preset is the sole component library (D-15701).
- `apps/dashboard/.env` contains `VITE_USE_MOCKS=true`.
- The dashboard's `/monetization` page exists at
  `apps/dashboard/src/pages/monetization/MonetizationPage.vue` and is
  reachable behind the `admin` and `finance` role gates established by
  the WP-157 scaffold.
- No other dashboard WP is in progress (one-packet-per-session rule).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)`
- `.claude/rules/architecture.md` (Layer Boundary; Dependency Direction)
- `.claude/rules/code-style.md` (full file)
- `docs/01-VISION.md §Financial Sustainability` (royalty obligation
  to Upper Deck Entertainment and Marvel; NG-1 through NG-8
  monetization boundaries)
- `docs/ops/DASHBOARD-REQUIREMENTS.md §1 (What the Dashboard Is),
  §3 (Phased Rollout — Metrics Follow Data), §5 (Widget Contract),
  §11–§12 (UI Design Guidelines)`
- `docs/ai/REFERENCE/00.6-code-style.md`
- `docs/ai/work-packets/WP-157-dashboard-scaffold.md` (Widget Contract
  definition)
- `docs/ai/work-packets/WP-162-dashboard-daily-execution-ui-polish.md`
  (immediate UI / design-token precedent)
- `docs/ai/DECISIONS.md` — scan for D-157xx, D-162xx, D-13301..D-13307
  (Stripe wiring decisions that constrain what data shapes are real
  vs. mock)
- `data/migrations/012_create_stripe_events_and_checkout_sessions.sql`
  (read-only — informs the mock shape; this WP does not modify it)

---

## Scope (In)

### Net Revenue Trend widget

- New `apps/dashboard/src/widgets/NetRevenueChartWidget.vue`
- New `apps/dashboard/src/composables/useNetRevenueBreakdown.ts`
- New `apps/dashboard/src/composables/useNetRevenueBreakdown.test.ts`
- New `apps/dashboard/src/config/revenueDeductions.ts` (static
  deduction-percentage config — see Contract)

### Paid-Action Errors widget

- New `apps/dashboard/src/widgets/PaidActionErrorsWidget.vue`
- New `apps/dashboard/src/services/billingHealthMocks.ts` (mock data
  source for webhook failure rate + intent abandonment rate)
- New `apps/dashboard/src/services/hashRange.ts` (FNV-1a or
  equivalent single-source hash function for mock determinism per
  D-19605 ext.; imported by `billingHealthMocks.ts` and any future
  range-seeded mock)
- New `apps/dashboard/src/services/normalizeRange.ts` (DateRange
  normalization helper per D-19605 ext.; called at the entry of
  `fetchBillingHealth` and any other range-consuming service
  function)

### Service / type extensions

- Modified `apps/dashboard/src/services/endpoints.ts` — add
  `fetchBillingHealth(range)` following the same mock-toggle pattern
  as `fetchRevenueHistory`
- Modified `apps/dashboard/src/services/mocks.ts` — export new mock
  generator for billing-health data
- Modified `apps/dashboard/src/types/index.ts` — add `BillingHealth`
  type (see Contract)

### Wiring

- Modified `apps/dashboard/src/pages/monetization/MonetizationPage.vue`
  — add both widgets to the page layout below the existing revenue
  chart, preserving the existing grid structure

### Governance

- `docs/ai/DECISIONS.md` — D-19601 through D-19606
- `docs/ai/work-packets/WORK_INDEX.md` — add WP-196 row in the
  Phase 8+ (dashboard) section
- `docs/ai/execution-checklists/EC_INDEX.md` — add EC row when the
  EC is authored at execution time (handled by the EC authoring
  step, not by this WP draft)

## Out of Scope

- `apps/server/` — no backend endpoints, no SQL queries, no billing
  routes touched. The future server endpoint `/api/metrics/billing/health`
  is **not implemented** by this WP. The catalog row for it is
  introduced by the server-implementation follow-up WP, not here.
- `data/migrations/` — no schema changes. `legendary.stripe_events`
  and `legendary.stripe_checkout_sessions` are referenced only in
  prose (Goal section) to document the future data source.
- `packages/` — no engine, registry, or pre-planning changes.
- `apps/arena-client/` — untouched. This is operator surface only.
- Setting real royalty percentages — the deduction config ships with
  documented placeholder values flagged `MOCK`. Real percentages
  require finance review and a separate D-entry.
- KPI targets and RYG thresholds for either widget — requires real
  data to set meaningful baselines (matches WP-162's deferral pattern).
- Drilldown UI to per-transaction detail — out of scope; future WP
  once `/api/admin/billing/history` is wired to the dashboard.
- Alerts panel integration (firing an alert when webhook failure rate
  crosses a threshold) — deferred until real data exists.
- Player-facing surfaces of any kind. This WP touches admin/finance
  internal tooling only.

---

## Contract

### Revenue Deduction Config

A static `readonly` config file holds the four-bucket deduction model:

```ts
// apps/dashboard/src/config/revenueDeductions.ts
export interface RevenueDeductionConfig {
  readonly royaltyPercent: number;
  readonly stripeFeePercent: number;
  readonly stripeFeeFixedCents: number;
  readonly infraCogsPercent: number;
  readonly isMock: boolean;
}

export const REVENUE_DEDUCTIONS: RevenueDeductionConfig = {
  royaltyPercent: 0.20,
  stripeFeePercent: 0.029,
  stripeFeeFixedCents: 30,
  infraCogsPercent: 0.05,
  isMock: true,
};
```

- Percentages are expressed as decimal fractions (0.20 = 20%), never
  as integers
- `isMock: true` is the source of truth for the widget's freshness
  badge label
- The real values are set by a later WP after finance review; this
  WP only locks the **shape** of the config, not the values

### Net Revenue Breakdown Composable API

```ts
const breakdown = useNetRevenueBreakdown(grossSeries, deductions);

breakdown.series        // ComputedRef<NetRevenueSeries>
breakdown.totalGross    // ComputedRef<number>  (in cents)
breakdown.totalNet      // ComputedRef<number>  (in cents)
breakdown.netMarginRatio  // ComputedRef<number>  (0.0 - 1.0)
```

```ts
interface NetRevenueSeries {
  readonly dates: readonly string[];
  readonly gross: readonly number[];        // cents
  readonly royalty: readonly number[];      // cents
  readonly stripeFees: readonly number[];   // cents
  readonly infraCogs: readonly number[];    // cents
  readonly net: readonly number[];          // cents
}
```

All money values are stored and computed in **integer cents**. The
widget formats to display dollars at the rendering boundary only.
Floating-point arithmetic on dollar amounts is forbidden — the
fractional cent rounding produces incorrect totals when summed over
months.

### Per-Day Deduction Formula

For each `grossCents[i]` day:

```
royaltyCents     = round(grossCents[i] * royaltyPercent)
stripeFeesCents  = round(grossCents[i] * stripeFeePercent) + stripeFeeFixedCents
infraCogsCents   = round(grossCents[i] * infraCogsPercent)
netCents         = grossCents[i] - royaltyCents - stripeFeesCents - infraCogsCents
```

- `round` here is `Math.round` (round half toward +∞ / "asymmetric
  half-up"; the composable's `// why:` comment cites this exact
  behavior — **not** banker's rounding / round-half-to-even). The
  asymmetric behavior is documented to fix a wording drift from
  the original draft. Per-day rounding direction is the only
  rounding in the composable; aggregates derive from integer
  sums and require no further rounding.
- If `netCents` is negative for a given day (gross too small to cover
  the fixed Stripe fee), the widget still displays the value as-is —
  it is not clamped to zero. A negative net day is a real signal
  (you lost money on that day after deductions) and must not be hidden.

### Tooltip Margin Definition (D-19606 extension)

For each day `i`, the per-day margin shown in the chart tooltip
MUST be computed from that day's values only:

```
dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]
```

The tooltip displays the **per-day** ratio for the hovered day.
The aggregate `netMarginRatio` exposed by the composable is a
**separate** number used only for the operator interpretation
footer (D-19606 base). Confusing the two — showing aggregate
margin on a per-day hover, or vice versa — tells the operator
the wrong number for the surface they're reading. Both numbers
exist; they answer different questions.

### Aggregation Rule (Non-Negotiable, D-19604)

All aggregate values exposed by the composable (`totalGross`,
`totalNet`, `netMarginRatio`) MUST be derived as the sum of the
**already-rounded per-day bucket values**, never by recomputing from
aggregated raw inputs or by feeding percentages back into money.

```
totalGross     = sum(series.gross[])           // already integer cents per day
totalNet       = sum(series.net[])              // already integer cents per day
netMarginRatio = totalGross === 0 ? 0 : totalNet / totalGross
```

- MUST NOT compute `totalRoyalty = round(totalGross × royaltyPercent)`
  (recomputing-from-aggregate is a different result than summing
  per-day rounded values, and divergence accumulates with series length)
- MUST NOT recompute `totalNet` from `totalGross × (1 − royaltyPercent − …)`
  for the same reason
- Per-day arrays are the **single source of truth**; aggregates are
  derived from them by simple summation

This rule prevents the most common financial-dashboard correctness
bug: chart totals, table totals, and tooltip totals disagreeing by
a few cents at month boundaries. Per-period rounding drift is
permanently eliminated when aggregates derive only from per-day
rounded values.

### Numerical Integrity Guard (Non-Negotiable, D-19604)

- All intermediate money computations MUST remain integer cents
  throughout the composable. No `parseFloat`, no implicit float
  coercion, no `.toFixed()` mid-computation.
- Division is permitted **only** when producing a ratio
  (`netMarginRatio`). The result of a division MUST NOT be
  re-multiplied back into a money value — a ratio is a display
  quantity, never a money input.
- Percentages from `REVENUE_DEDUCTIONS` are inputs to the per-day
  formula only. They MUST NOT be applied to aggregate values to
  produce aggregate bucket totals.

### Billing Health Type

```ts
// apps/dashboard/src/types/index.ts (extend)
export interface BillingHealth {
  readonly windowStart: string;       // ISO date
  readonly windowEnd: string;         // ISO date
  readonly webhookFailureRate: number;       // 0.0 - 1.0
  readonly webhookFailureCount: number;
  readonly webhookTotalCount: number;
  readonly intentAbandonmentRate: number;    // 0.0 - 1.0
  readonly intentAbandonedCount: number;
  readonly intentTotalCount: number;
}
```

### Billing Health Mock Generator

The mock generator MUST produce realistic but obviously-mock values.

- `webhookFailureRate`: in `[0.00, 0.05]`
- `intentAbandonmentRate`: in `[0.10, 0.35]`
- Counts derived AFTER rate is chosen: `count = round(total × rate)`
  then `rate = count / total` is re-displayed from the same source
  pair (no independent draws — rate and count would visually disagree
  otherwise)

### Billing Health Window Definition (D-19603 extension)

- Default window for `BillingHealth` queries = last 30 days
  derived from `range.end - 30` (exclusive) to `range.end`
  (inclusive). The `range.start` value the operator picked is
  ignored for the window computation — webhook health is a
  trailing-window metric, not a date-range metric.
- The 30-day window applies uniformly to BOTH the webhook
  failure and intent abandonment surfaces. Both sparklines plot
  exactly **30 daily data points** (one per day in the window).
- The sparkline series MUST contain exactly `30` entries; fewer
  is FAIL. The operator's eye calibrates to a fixed visual
  cadence across widget refreshes; a 22-point sparkline next to
  a 30-point one reads as a different metric.

### Rate-Division Safety Guard (D-19603 extension)

If `webhookTotalCount === 0` (no webhook deliveries in the
window), `webhookFailureRate` MUST be `0` exactly — NOT `NaN`,
NOT `undefined`, NOT `1`. Same rule for `intentAbandonmentRate`
when `intentTotalCount === 0`. The display-side branch reads:

```ts
const displayRate = totalCount === 0 ? 0 : failureCount / totalCount;
```

Zero-denominator producing `NaN` is the most common production
bug in dashboards that ship with sparsely-populated metrics.
Guarding at the composable / mock-generator boundary means every
downstream surface (sparkline, KPI card, future alerts widget)
gets the clean `0` without a per-renderer band-aid.

### Mock Determinism Contract (Non-Negotiable, D-19605)

Mock data on the dashboard is **deterministic** at the same standard
as engine RNG: identical inputs always produce identical outputs,
across calls, across reloads, across widgets. The reason is the
same one the engine layer cares about — once any consumer can't
reproduce a value, every downstream behavior (tests, screenshots,
operator review) becomes flaky.

Rules:

- The mock generator MUST be seeded from a stable hash of the
  requested range: `seed = hash(range.start + '|' + range.end)`.
  The hash function lives next to the generator and is pure (no
  globals, no `Date.now()`, no `Math.random()` reads at module
  load).
- The same `range` input MUST produce the **byte-identical**
  output across:
  - multiple calls within the same session
  - page reloads (no in-memory state preservation required —
    determinism comes from the seed, not from caching)
  - different widgets consuming the same range
- `Math.random()` is forbidden unless wrapped in a seeded PRNG. The
  composable / mock files MUST NOT contain a bare `Math.random()`
  call.
- Non-determinism in a mock generator is treated as a **test
  failure**, not a UX nit — a flaky widget makes every downstream
  acceptance check unreliable.

Same rule applies to `mockRevenueHistory` if it is touched by this
WP (it should not be — the mock surface is already in place — but
if any tightening occurs, the determinism contract applies
uniformly).

### DateRange Normalization Contract (Non-Negotiable, D-19605 extension)

The seed input `range.start + '|' + range.end` is meaningful only
if `range.start` and `range.end` have a single canonical form.
Without normalization, `'2026-06-01'` and `'2026-06-01T00:00:00Z'`
seed differently and break every cross-widget consistency check
the harden round just locked.

Normalization rules:

- `range.start` and `range.end` are ISO date strings in `YYYY-MM-DD`
  format. No time component, no timezone offset, no fractional
  seconds, no `Z` suffix.
- The range is **inclusive on both ends** — `start === end`
  represents a 1-day window with one data point.
- If `start > end` (lexical comparison, which matches
  chronological for zero-padded `YYYY-MM-DD`), the entry point
  MUST throw a full-sentence error naming both offending values.
- Normalization happens at the **service boundary**
  (`fetchBillingHealth` and the revenue-history mock entry point),
  NOT inside widgets. Widgets receive an already-normalized range.

The hash input is constructed from the normalized values only;
upstream callers who pass non-normalized ranges trigger the
boundary validation and never reach the seed.

### Hash Function Contract (D-19605 extension)

The hash function backing the seed has its own pure-function
contract because dashboards have shipped before with
`Math.random()`-seeded "deterministic" mocks; the discipline only
holds if the hash is locked too:

- Deterministic and pure — same input string produces the same
  output on every call, every browser, every architecture.
- Output is a stable 32-bit integer suitable as the PRNG seed.
  **Recommended:** FNV-1a (32-bit) or an equivalent simple
  non-cryptographic hash. SHA-* and crypto-grade hashes are
  overkill for mock-seed purposes and add bundle weight.
- MUST NOT depend on JS-engine-specific behavior (e.g., legacy
  `String.prototype.hashCode` analogues, which differ across
  engines historically).
- Lives in a single file alongside the mock generators with a
  `// why:` comment citing **D-19605**; widgets and composables
  import the function rather than re-implementing it.
- Collision expectation: 32-bit FNV-1a has ~2^16 birthday-attack
  collisions over the range-string universe. Acceptable for mock
  seeding because (a) the practical input universe is small (a
  few dozen date ranges per operator session) and (b) collisions
  produce identical mock data — harmless, not incorrect.

### Service Function

```ts
// apps/dashboard/src/services/endpoints.ts (extend)
export async function fetchBillingHealth(
  range: DateRange,
): Promise<ServiceResponse<BillingHealth>>;
```

The function follows the established `fetchRevenueHistory` pattern
exactly: if `VITE_USE_MOCKS === 'true'`, call the mock generator;
otherwise, `apiClient.get('/metrics/billing/health', { params: { range } })`.
The future server endpoint path `/metrics/billing/health` is named
here as the **client-side target**, not as a server-side promise.
Implementing the server endpoint is a separate WP.

### Shared Revenue Source Contract (Non-Negotiable, D-19607)

The harden-round-1 acceptance criterion "Cross-widget consistency:
sum of NetRevenueChartWidget gross series exactly equals
RevenueChartWidget total" is prose-level — auditable manually but
not structurally. This contract converts it to an enforceable
single-source rule.

`NetRevenueChartWidget` and `RevenueChartWidget` MUST consume the
SAME `fetchRevenueHistory(range)` call path:

- No widget may call `mockRevenueHistory` (or any other lower-level
  mock generator) directly — the only entry point is the
  `fetchRevenueHistory(range)` service function exported by
  `apps/dashboard/src/services/endpoints.ts`.
- No widget may construct its own revenue series in-component
  (e.g., synthesizing dates from `Date.now()`, deriving from a
  cached KPI snapshot, etc.).
- Both widgets MUST be passed the SAME `range` reference. The
  page-level date-range composable (`useDateRange`, established
  by WP-157) provides the canonical reactive `range`; both
  widgets `import { useDateRange } from '...'` and consume it.
- A single `useFetch` invocation (or equivalent) feeds both
  widgets so the mock generator is called once per range change,
  not once per widget. Two independent fetches against the same
  range with the same seed will return identical data — but
  duplicating the call doubles network/mock work and creates two
  reactive update paths the operator can observe out of sync
  during a transition.

The contract is structurally auditable:

```bash
grep -rn "fetchRevenueHistory\|mockRevenueHistory" apps/dashboard/src/widgets/
```

The output MUST show exactly two call sites for `fetchRevenueHistory`
(one in each widget that consumes revenue) AND zero call sites for
`mockRevenueHistory` (it is a service-internal mock, not a widget
import). Any other shape is a FAIL against cross-widget
consistency.

### Widget Contract (per WP-157 §5 + WP-162 Card Structure)

Both new widgets MUST:

- Render four states (`loading` / `error` / `empty` / `data`) per
  the Widget Contract
- Display the freshness badge in the right of the header showing
  `MOCK` (since both widgets are mock-sourced in this WP)
- Follow the header/body/footer card structure
- Use only PrimeVue design tokens for structural styling (no
  hard-coded hex)
- Subscribe to the `dashboard-theme-change` window event the same
  way `RevenueChartWidget.vue:32` does, so the echarts canvas
  re-resolves color tokens on theme toggle

### Widget State Semantics (cites WP-157 §5 Widget Contract)

The four states in the Widget Contract are enforced by trigger
condition and required render, not just listed:

| State | Trigger | Required render |
|---|---|---|
| `loading` | Service call in-flight; no prior response in scope | Skeleton placeholder or spinner (never a blank card) |
| `error` | Service call rejected or threw | Full-sentence error message (per `00.6` Rule 11); no chart |
| `empty` | Service call resolved successfully but the series has zero data points | Plain message — never a chart with zero bars |
| `data` | Service call resolved with a non-empty series | The chart / metric rows specified for the widget |

- `loading` MUST NOT render a blank card. The skeleton or spinner
  exists so the operator distinguishes "waiting" from "broken."
- `error` MUST NOT render a chart even with a stale series in
  scope. A chart shown alongside an error message is a footgun for
  the operator — they read the chart and miss the error.
- `empty` MUST NOT render a chart with zero values (that visually
  reads as "we made $0 today," which is a different signal from
  "we have no data for today").
- `data` is the normal case and the only state in which the
  widget's chart / metric rows render.

A widget that fails to disambiguate these four states is in
contract breach against WP-157, and any downstream visual test
that depends on the four-state semantics will produce false
positives.

### Widget State Gate Pattern (Non-Negotiable, structural enforcement)

Excellent semantics are still violable without structure. The
four states MUST be enforced through a single `state` computed
in the widget's `<script setup>` block:

```ts
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (loading.value && !data.value) return 'loading';
  if (error.value) return 'error';
  if (!data.value || data.value.length === 0) return 'empty';
  return 'data';
});
```

The widget's `<template>` MUST branch exclusively on this single
`state` ref. The Vue template structure is locked to a four-arm
`v-if` / `v-else-if` chain:

```html
<div v-if="state === 'loading'">...skeleton...</div>
<div v-else-if="state === 'error'">...full-sentence message...</div>
<div v-else-if="state === 'empty'">...empty message...</div>
<BaseChart v-else :option="chartOption" />
```

A chart MUST NOT appear under any condition outside the `'data'`
branch. The gate makes the four-state contract auditable in the
diff:

```bash
grep -n 'v-if="state' apps/dashboard/src/widgets/NetRevenueChartWidget.vue
grep -n 'v-if="state' apps/dashboard/src/widgets/PaidActionErrorsWidget.vue
```

Each widget MUST return exactly one `v-if="state === 'loading'"`
plus matching `v-else-if` branches; anything else fails the
state-gate AC.

### Net Revenue Chart Specifics

- Chart type: **stacked bar chart** showing gross broken into the
  four buckets (net, royalty, Stripe fees, infra COGS) bottom-to-top
- Net is the bottom band (the eye reads bottom-up as "what we keep first")
- Tooltip on each day shows all four bucket values plus net margin %
- Colors come from PrimeVue Aura design tokens, not custom hex
  (these are surface/text tokens — true severity tokens are
  reserved for RYG status indicators which this WP does not
  introduce):
  - net → `--p-primary-color`
  - royalty → `--p-text-muted-color`
  - Stripe fees → `--p-content-border-color` (Aura token used by
    the existing `RevenueChartWidget.vue` for grid lines; in the
    broader Aura set, even though WP-162's locked subset focuses
    on the surface/border/text quartet)
  - infra COGS → `--p-surface-border`
- No pie chart variant (per DASHBOARD-REQUIREMENTS.md §12 and WP-162
  precedent)
- **Empty state trigger:** the Net Revenue widget renders the
  `empty` state when `series.dates.length === 0` (after the
  service call has resolved). A zero-length series is distinct
  from a series of zero-value days; the latter is `data` state
  with a visually flat chart.

### ECharts Stacking Contract (Non-Negotiable, D-19608)

ECharts handles stacked bars with mixed-sign values via a `stack`
identifier on each series. Without an explicit lock, a developer
may set per-series stack keys, omit the key on the negative-value
series "to avoid weird rendering", or rely on ECharts default
behavior — all three break the visual contract on negative-net
days.

- All four series MUST share the **identical** stack identifier
  string `'total'`. The literal `stack: 'total'` is locked across
  all four series objects.
- Series array order MUST match the band order bottom-to-top:
  net (index 0, bottom band), royalty (index 1), stripeFees
  (index 2), infraCogs (index 3, top band). ECharts paints stacks
  in array order, so this is also the render order.
- Negative values use the **same** stack key — ECharts handles
  the negative band positioning natively (below the zero axis).
  Do NOT introduce a separate stack for negative buckets; doing
  so detaches the negative bar from the positive stack and the
  operator reads it as a different metric.
- Tooltip series-list ordering MUST match the series-array
  order. Operators read the tooltip top-to-bottom and expect
  net at the top of the list, infra COGS at the bottom (the
  inverse of the visual band order, which is conventional for
  stacked-chart tooltips).

### Operator Interpretation Hook (Non-Negotiable, D-19606)

The widget footer MUST display a single interpretive line so the
operator gets one decision cue without scanning bars:

- `netMarginRatio` for the selected range, formatted as a percentage
  with one decimal place (`"Net margin: 12.4%"`)
- The label sits in the card footer (per the WP-162 header/body/
  footer card structure) and is the only summary number — no other
  derived metrics in the footer

The label is **informational only** in this WP — no RYG color, no
threshold comparison, no alert hook. RYG thresholds are deferred
(see Out of Scope) because the real deduction percentages are not
yet known and any threshold set today would be meaningless. The
footer's existence is the structural decision; the threshold layer
slots in later without changing the widget's HTML.

This turns the widget from descriptive ("here are stacked bars") to
interpretive-by-default ("are we making money or not"). The
operator should not have to do math by eye to answer that question.

### Negative Net Signal (Non-Negotiable, D-19606)

Negative-net days are preserved (per the per-day formula above) AND
surfaced explicitly:

- The chart tooltip on a day with `net < 0` MUST include the label
  `"Negative net day"` alongside the bucket breakdown
- The footer's net-margin label, when the **range** total is
  negative, MUST render `"Net margin: −X.X% (net loss)"` (negative
  sign and `(net loss)` qualifier present; the unicode minus
  `−` is acceptable but a plain hyphen-minus `-` is also OK)
- No clamping, no hiding, no smoothing anywhere in the render path

A negative day or negative-range margin is the highest-signal piece
of information the widget can produce. The earlier WP body already
forbids clamping; this section additionally requires that the
condition is **labeled**, not just rendered as a smaller bar.

### Paid Action Errors Specifics

- Layout: two horizontal "metric rows" side by side, each showing
  rate (large number) + count fraction (small number) + a 30-day
  sparkline using the WP-157 BaseChart component (or equivalent
  small-chart wrapper)
- The widget DOES NOT compute its own thresholds for RYG coloring
  in this WP — thresholds are deferred (see Out of Scope). Both
  metric rows render in the neutral `--p-text-color` for now.
- An accessibility label (text) sits beside each rate so color is
  never the sole status indicator

### Required Tests (`useNetRevenueBreakdown.test.ts`)

1. Single-day input with all-zero deductions returns `net === gross`
2. Royalty-only deduction (20% royalty, all other percents 0)
   subtracts exactly 20% rounded to cents
3. Stripe fee combines percentage and fixed-cents components per
   the formula above
4. A day with gross too small to cover the fixed Stripe fee
   produces a negative `net` value, which is preserved (not clamped)
5. `totalGross`, `totalNet`, and `netMarginRatio` aggregate correctly
   over a 30-day input series
6. Empty input series returns `totalGross === 0`,
   `totalNet === 0`, and `netMarginRatio === 0` (the zero-denominator
   branch is explicit and tested)
7. The composable does not mutate its input series (referential
   safety — the mock store is shared across widgets)
8. **Aggregation consistency (D-19604):** for a 30-day series, the
   composable's `totalNet` exactly equals `sum(series.net[])`, and
   `totalGross` exactly equals `sum(series.gross[])`. The test
   computes the sum independently from the series arrays and
   asserts byte-equal integer match — proves no recompute-from-aggregate
   drift snuck in.
9. **Referential stability (D-19605):** calling the composable twice
   with the same input series produces structurally identical
   output (same dates array, same per-day values, same totals).
   This is the composable-level guarantee that the mock determinism
   contract is end-to-end honored.
10. **DateRange normalization (D-19605 extension):** the service
    boundary throws a full-sentence error when `range.start >
    range.end` (lexically), and the error message names both
    offending values. An already-normalized `YYYY-MM-DD` pair
    passes through unchanged and is reused byte-identically as the
    hash input.
11. **Hash determinism (D-19605 extension):** the hash function
    invoked twice with the same input string returns the
    byte-identical integer output; with two different input
    strings, returns two different integer outputs (smoke check,
    not exhaustive collision testing — collisions are accepted per
    the §Hash Function Contract).
12. **Rate-zero safety guard (D-19603 extension):** invoking the
    billing-health mock with a window that produces zero total
    counts (either `webhookTotalCount` or `intentTotalCount`)
    returns the corresponding rate as exactly `0` — NOT `NaN`,
    NOT `undefined`, NOT `1`. Both rates have independent
    coverage.

Tests use `node:test` and `node:assert`. No `boardgame.io` imports.
No network or database access.

---

## Vision Alignment

**Vision clauses touched:** `Financial Sustainability` (royalty
obligation framing), `§13 Live Ops`, `NG-1` through `NG-8`
(monetization boundary check).

**Conflict assertion:** No conflict. This WP preserves all touched
clauses. The widgets surface internal financial visibility only;
no player-facing surface is created or modified. The royalty
percentage is displayed as a deduction in the operator's view,
which is **descriptive of**, not **a change to**, the Vision's
Upper Deck / Marvel royalty obligation.

**Non-Goal proximity check (NG-1..NG-8):** None crossed. The
widgets are internal ops surfaces visible only to `admin` and
`finance` roles. No persuasive, pay-to-win, gacha, energy, ad,
or social-influence mechanic is introduced. No copy is added to a
player-facing surface.

**Determinism preservation:** N/A — no engine, RNG, replay, or
simulation code touched.

---

## Funding Surface Gate

**N/A.** Justification per §20.1: this WP touches no global
navigation funding affordance, no registry-viewer funding
affordance, no profile / account funding-attribution surface, no
tournament funding channel integration, and no user-visible
funding copy as part of a proposed or implemented user interaction.
The "revenue" surfaces added by this WP are internal admin/finance
operator widgets, not user-facing donation, tournament-funding, or
supporter-tier UI. The §20.1 carve-out for analytical / retrospective
mention applies — the widget surfaces revenue *as financial-reporting
data*, not as a *user-facing funding affordance*.

Authority chain for §20: `WP-097`, `D-9701`, `D-9801` (cited; not
triggered).

---

## API Catalog (§21)

**N/A.** Justification: this WP does not add, modify, remove, or
change the status of any HTTP endpoint in `apps/server`, nor of
any `apps/server/src/**` library function recorded in
`docs/ai/REFERENCE/api-endpoints.md` as `Library-only`. The
client-side reference to `/metrics/billing/health` in
`apps/dashboard/src/services/endpoints.ts` is a *future target* for
a server WP that has not been written yet — it follows the
established pattern in `endpoints.ts` where `fetchRevenueHistory`
and `fetchDauHistory` already name future server endpoint paths
that are not yet implemented (see lines 87-96 of
`apps/dashboard/src/services/endpoints.ts`). The catalog row for
`/metrics/billing/health` will be added by the server-implementation
follow-up WP per §21.1 trigger #1.

### Forward Contract for `/metrics/billing/health` (D-19603 extension)

WP-196 names the endpoint path and the response shape so the
server-implementation follow-up WP has zero naming or schema
ambiguity. The server WP MUST implement the endpoint such that:

- The response shape is byte-compatible with the `BillingHealth`
  type defined in this WP (`apps/dashboard/src/types/index.ts`).
  Adding fields is permitted (additive); removing or renaming
  fields breaks the client.
- The invariants hold on every response: `0.0 ≤ webhookFailureRate
  ≤ 1.0`, `0.0 ≤ intentAbandonmentRate ≤ 1.0`, `webhookFailureCount
  = round(webhookTotalCount × webhookFailureRate)`, and
  `intentAbandonedCount = round(intentTotalCount × intentAbandonmentRate)`.
- The auth posture is `authenticated-session-required` with a
  `finance`-or-`admin` role gate (matches `/api/admin/billing/history`
  precedent from WP-110 / WP-176).
- `windowStart` and `windowEnd` are ISO-8601 date strings (no
  time component, no timezone offset — the operator picks a date
  range, not a moment).

The client MUST NOT:
- Recalculate rates from counts (the server's rate is the source
  of truth; the client just displays it).
- Infer or backfill missing fields (a malformed response surfaces
  via the widget's `error` state per the Widget State Semantics).

This forward contract makes the dashboard ↔ server boundary
auditable in one direction *before* the server WP exists. When the
server WP drafts, its lint gate will mechanically reference this
block.

---

## Locked Contract Values

| Item | Value | Decision |
|---|---|---|
| Net revenue composition | `gross − royalty − Stripe fees − infra COGS` (4 buckets) | D-19601 |
| Royalty deduction display posture | Operator-visible deduction band; placeholder percentage flagged `MOCK` | D-19602 |
| Paid-action error surfaces | Stripe webhook failure rate + Checkout intent abandonment rate | D-19603 |
| Money unit | Integer cents throughout composable; format at render boundary only | D-19601 |
| Future server endpoint path | `/metrics/billing/health` (client target; server WP separate) | D-19603 |
| Widget mock flag source | `REVENUE_DEDUCTIONS.isMock` and `fetchBillingHealth` mock toggle | D-19601, D-19603 |
| Aggregation derivation | `totalGross` / `totalNet` = sum of already-rounded per-day values; ratios derive only from those totals | D-19604 |
| Numerical integrity | Division permitted only for ratio display; ratios MUST NOT be re-multiplied into money | D-19604 |
| Mock determinism seed | `seed = hash(range.start + '\|' + range.end)` — pure, no globals, byte-identical output for identical input | D-19605 |
| Operator interpretation footer | `"Net margin: X.X%"` label; informational only, no RYG in this WP | D-19606 |
| Negative-net surfacing | Tooltip label `"Negative net day"` on `net < 0` days; range footer adds `(net loss)` qualifier when range total is negative | D-19606 |
| Forward server contract | Response shape byte-compatible with `BillingHealth`; rate-count invariants; `authenticated-session-required` + `finance`/`admin` role gate | D-19603 |
| Billing health window | Trailing 30 days from `range.end` (inclusive); 30 sparkline points exactly | D-19603 ext. |
| Rate-zero safety guard | `displayRate = totalCount === 0 ? 0 : failureCount / totalCount`; never `NaN` | D-19603 ext. |
| DateRange normalization | `YYYY-MM-DD` ISO strings, inclusive both ends, error on `start > end`, normalize at service boundary | D-19605 ext. |
| Hash function | FNV-1a (32-bit) or equivalent pure non-crypto hash; single file with D-19605 `// why:` | D-19605 ext. |
| Per-day tooltip margin | `dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]` (per-day, NOT aggregate) | D-19606 ext. |
| Shared revenue source | Both NetRevenue + Revenue widgets consume `fetchRevenueHistory(range)`; never `mockRevenueHistory` directly; single `useDateRange` source | D-19607 |
| ECharts stacking key | All four series share `stack: 'total'`; series array order = net, royalty, stripeFees, infraCogs; negative values use the same stack key | D-19608 |
| Widget state gate | Single `state` computed in `<script setup>`; 4-arm `v-if`/`v-else-if` template; chart only inside `'data'` arm | Structural (WP-157) |

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file (no diffs, no
  snippets, no "show only the changed section")
- Test files use `.test.ts` extension and `node:test` + `node:assert`
- Full-sentence error messages
- pnpm workspace commands only

**Packet-specific:**
- MUST NOT import `@legendary-arena/game-engine`,
  `@legendary-arena/registry`, `@legendary-arena/preplan`, or
  `@legendary-arena/server`
- MUST NOT call real backend URLs; all data comes from the existing
  mock-toggle pattern
- MUST NOT add, modify, or remove any server endpoint or any SQL query
- MUST NOT add a new npm dependency beyond what WP-157 and WP-162
  already installed
- MUST NOT introduce hard-coded hex colors for any structural element;
  PrimeVue design tokens only
- MUST NOT use a pie chart for any visualization
- MUST NOT clamp negative net-revenue values to zero (the negative
  signal is intentional and informative)
- MUST NOT use floating-point dollars for arithmetic; compute in
  integer cents and format at the render boundary only
- MUST NOT mutate the input series passed to the breakdown composable
- MUST NOT recompute `totalGross`, `totalNet`, or per-bucket totals
  from aggregated raw inputs — aggregates derive only from sums of
  already-rounded per-day values (D-19604)
- MUST NOT re-multiply `netMarginRatio` (or any ratio) into a money
  value (D-19604 Numerical Integrity Guard)
- MUST NOT contain a bare `Math.random()` call in the mock files or
  composable; mock generation MUST be seeded from
  `hash(range.start + '|' + range.end)` (D-19605)
- MUST surface every `net < 0` day with the tooltip label
  `"Negative net day"`, and every negative-range net margin with the
  footer `(net loss)` qualifier (D-19606)
- MUST render the operator interpretation footer
  (`"Net margin: X.X%"`) — informational only, no RYG, no threshold
  hook (D-19606)
- MUST normalize `range.start` / `range.end` to `YYYY-MM-DD` ISO
  strings at the service boundary; MUST throw a full-sentence
  error when `start > end` lexically (D-19605 ext.)
- MUST use a single hash function for mock seeding (FNV-1a or
  equivalent), defined in one file with a `// why:` citing
  D-19605; no inline hash math in widgets or composables
  (D-19605 ext.)
- MUST consume revenue history exclusively via
  `fetchRevenueHistory(range)` in widget code; MUST NOT call
  `mockRevenueHistory` from any file under `apps/dashboard/src/widgets/`
  (D-19607)
- MUST pass identical `range` references (sourced from
  `useDateRange`) to both revenue widgets (D-19607)
- MUST set `stack: 'total'` literal on all four Net Revenue series
  in the echarts config; MUST NOT introduce a separate stack key
  for negative values (D-19608)
- MUST gate widget render exclusively through a single `state`
  computed and a 4-arm `v-if`/`v-else-if` template; chart appears
  only in the `'data'` arm (Widget State Gate Pattern)
- MUST compute the chart tooltip per-day margin via
  `dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]`;
  MUST NOT use the aggregate `netMarginRatio` for per-day tooltip
  display (D-19606 ext.)
- MUST plot exactly 30 daily data points in both `PaidActionErrorsWidget`
  sparklines (D-19603 ext.)
- MUST display rate as `0` when the corresponding `totalCount` is
  `0`; `NaN` reaching the renderer is FAIL (D-19603 ext.)

**Session protocol:**
- If any ambiguity arises about the deduction percentages, STOP and
  ask. Do not pick numbers from web search, intuition, or analogous
  SaaS benchmarks. The numbers are placeholders by design; finance
  review owns the real values.
- If WP-162's design-token names have changed at execution time, STOP
  and reconcile against the current `KpiCard.vue` / `RevenueChartWidget.vue`
  before introducing the new widgets.

---

## Acceptance Criteria

- [ ] `MonetizationPage.vue` shows the existing `RevenueChartWidget`
      plus the two new widgets in a consistent grid layout
- [ ] `NetRevenueChartWidget.vue` renders a stacked bar chart with
      four bands (net bottom, then royalty, Stripe fees, infra COGS)
- [ ] Tooltip on the net-revenue chart shows all four bucket values
      plus net margin percentage
- [ ] `PaidActionErrorsWidget.vue` renders two metric rows
      (webhook failure rate, intent abandonment rate) with rate +
      count fraction + sparkline
- [ ] Both new widgets display the `MOCK` freshness badge in the
      header right
- [ ] Both new widgets conform to the WP-157 Widget Contract
      (4-state rendering: loading / error / empty / data)
- [ ] Both new widgets respond to the `dashboard-theme-change`
      event and re-resolve their chart colors on theme toggle
- [ ] `useNetRevenueBreakdown.test.ts` passes all 12 required tests
      (the original 7 + the harden-round-1 aggregation-consistency
      and referential-stability + the harden-round-2 DateRange
      normalization, hash determinism, and rate-zero safety guard)
- [ ] All money arithmetic in the composable uses integer cents
      (no `parseFloat`, no `.toFixed()` mid-computation)
- [ ] A day whose gross is too small to cover the fixed Stripe fee
      renders a negative net value, not zero, AND the tooltip on that
      day shows the label `"Negative net day"`
- [ ] When the range total net margin is negative, the footer label
      reads `"Net margin: −X.X% (net loss)"` (the `(net loss)` qualifier present)
- [ ] The Net Revenue widget footer renders the operator interpretation
      label `"Net margin: X.X%"` for the selected range — informational
      only, no RYG color or threshold hook
- [ ] **Cross-widget consistency:** for the same date range, the sum of
      `NetRevenueChartWidget`'s `gross` series exactly equals
      `RevenueChartWidget`'s total — both widgets share the mock source
      and must not diverge by even a cent
- [ ] **Aggregation rule (D-19604):** the composable's `totalGross`
      and `totalNet` are derived from summing the per-day rounded
      arrays, never by recomputing from raw inputs (proven by the
      test 8 assertion)
- [ ] **Mock determinism (D-19605):** repeated `fetchBillingHealth`
      calls with the same `range` return byte-identical responses;
      `grep -n "Math.random" apps/dashboard/src/services/ apps/dashboard/src/composables/`
      returns zero hits (or all hits are inside a documented seeded-PRNG wrapper)
- [ ] **Widget state semantics (WP-157):** the `loading` state renders
      a skeleton or spinner (never a blank card); the `error` state
      renders a full-sentence message and NO chart; the `empty` state
      renders a message and NO chart
- [ ] **Widget state gate structural lock:** both widgets have a
      single `state` computed in `<script setup>` returning the
      4-state union, AND their `<template>` branches on it via a
      4-arm `v-if` / `v-else-if` / `v-else` chain with `BaseChart`
      only inside the `v-else` (data) arm
- [ ] **ECharts stacking contract (D-19608):** the Net Revenue
      widget's chart option declares `stack: 'total'` on all four
      series; series array order is `net, royalty, stripeFees, infraCogs`;
      no separate stack key for negative values
- [ ] **DateRange normalization (D-19605 ext.):** the service
      boundary rejects `range.start > range.end` with a
      full-sentence error naming both values; normalized
      `YYYY-MM-DD` pairs pass through unchanged
- [ ] **Shared revenue source (D-19607):** zero widget-level calls
      to `mockRevenueHistory`; both revenue widgets call
      `fetchRevenueHistory(range)` against the same
      `useDateRange`-sourced reference
- [ ] **Billing health window (D-19603 ext.):** both
      `PaidActionErrorsWidget` sparklines render exactly 30 daily
      data points
- [ ] **Rate-zero safety guard (D-19603 ext.):** when
      `webhookTotalCount === 0` or `intentTotalCount === 0`, the
      corresponding displayed rate is `0` exactly, never `NaN`
- [ ] **Per-day tooltip margin (D-19606 ext.):** chart tooltip
      shows `dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]`,
      computed from the hovered day's values only — NOT the
      aggregate `netMarginRatio`
- [ ] **Hash function single source (D-19605 ext.):** the hash
      function (e.g., FNV-1a) lives in exactly one file with a
      `// why:` citing D-19605; widgets and composables import it
      rather than re-implementing
- [ ] No file in `apps/dashboard/` imports from
      `@legendary-arena/game-engine`, `@legendary-arena/registry`,
      `@legendary-arena/preplan`, or `@legendary-arena/server`
- [ ] No file in `apps/dashboard/` uses a hard-coded hex color for a
      structural element
- [ ] `docs/ai/REFERENCE/api-endpoints.md` is **unchanged** by this
      WP (the future server endpoint is the next WP's responsibility)
- [ ] `pnpm -r build` exits 0

---

## Verification Steps

```bash
# 1. Install + build
pnpm install && pnpm -r build
#    → exits 0

# 2. Run dashboard tests
pnpm --filter @legendary-arena/dashboard test
#    → useNetRevenueBreakdown.test.ts passes all 12 tests
#    → no other test regressions

# 3. Run dev server
pnpm dash:dev
#    → dashboard reachable at http://localhost:5173

# 4. Login → /monetization
#    → existing RevenueChartWidget visible (unchanged)
#    → NetRevenueChartWidget visible below it with 4 stacked bands
#    → PaidActionErrorsWidget visible with 2 metric rows + sparklines
#    → all three widgets show MOCK freshness badge

# 5. Hover over a net-revenue chart bar
#    → tooltip shows gross, royalty, Stripe fees, infra COGS, net, margin %

# 6. Toggle theme (dark ↔ light) via AppLayout header
#    → both new widgets re-resolve chart colors on the next paint
#    → no flash, no broken colors, no console errors

# 7. Resize browser to 768px width
#    → widgets reflow to single column per WP-162 responsive grid

# 8. Grep for forbidden imports
rg "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/
#    → zero matches

# 9. Grep for hard-coded hex colors in the new files
rg "#[0-9A-Fa-f]{3,8}" apps/dashboard/src/widgets/NetRevenueChartWidget.vue apps/dashboard/src/widgets/PaidActionErrorsWidget.vue
#    → zero matches (PrimeVue tokens only)

# 10. Mock-determinism grep (D-19605) — no bare RNG in services or composables
rg -n "Math\.random" apps/dashboard/src/services/ apps/dashboard/src/composables/
#    → zero hits, OR all hits are inside a documented seeded-PRNG wrapper
#      file with a // why: comment citing D-19605

# 11. Cross-widget consistency check — run the dev server, open /monetization
#     with the same date range selected; the sum of the Net Revenue
#     widget's gross series must equal the existing Revenue Trend widget's
#     total. Both pull from the same mock; any divergence indicates a
#     duplicated mock source or unseeded variation.

# 12. Confirm api-endpoints.md untouched
git diff --name-only origin/main -- docs/ai/REFERENCE/api-endpoints.md
#    → empty output

# 13. Full monorepo build
pnpm -r build
#    → exits 0
```

---

## Definition of Done

1. `pnpm -r build` exits 0
2. `pnpm --filter @legendary-arena/dashboard build` exits 0
3. `pnpm --filter @legendary-arena/dashboard test` exits 0 and
   `useNetRevenueBreakdown.test.ts` passes all 12 required tests
4. `MonetizationPage.vue` renders the three widgets
   (existing revenue + new net revenue + new paid-action errors)
5. Net revenue widget shows stacked-bar four-band layout with
   tooltip covering all buckets + net margin
6. Paid-action errors widget shows two metric rows with rate +
   count + sparkline
7. Both new widgets show `MOCK` freshness badge
8. Both new widgets conform to the WP-157 Widget Contract (4-state)
9. Both new widgets re-resolve colors on `dashboard-theme-change`
10. All money math runs in integer cents
11. Negative-net days are preserved, not clamped
12. Zero imports from `@legendary-arena/*` workspace packages
13. Zero hard-coded hex colors in new widget files
14. `docs/ai/REFERENCE/api-endpoints.md` is unchanged by the commit
15. `docs/ai/STATUS.md` updated with what changed
16. `docs/ai/DECISIONS.md` updated with D-19601, D-19602, D-19603
    (incl. forward server contract + window + rate-zero
    extensions), D-19604 (aggregation + numerical integrity),
    D-19605 (mock determinism, incl. DateRange normalization +
    hash function extensions), D-19606 (operator interpretation
    hook + negative net signal, incl. per-day tooltip margin
    extension), D-19607 (Shared Revenue Source Contract), D-19608
    (ECharts Stacking Contract)
17. `docs/ai/work-packets/WORK_INDEX.md` row added/checked off for WP-196
18. No files outside `## Files Expected to Change` are modified

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-19601 | Net revenue is decomposed into four buckets: gross, royalty, Stripe fees, infra COGS. All arithmetic in integer cents; floating-point dollars are forbidden. | The royalty obligation to Upper Deck Entertainment and Marvel is a Vision-level non-negotiable (Financial Sustainability §). Gross revenue alone obscures the true unit economics. Stripe fees and infra COGS are the next-largest fixed deductions and round out the model. Integer cents avoids the rounding-drift class of bug that surfaces when monthly totals are summed from floating-point dailies. |
| D-19602 | Royalty deduction percentage ships as a flagged-mock placeholder; real numbers require finance review and a follow-up D-entry. | The royalty contract terms are operationally sensitive and outside the scope of a client-only widget WP. Locking the shape and the display posture now lets the real numbers swap in by editing a single config file when finance signs off. |
| D-19603 | Paid-action error visibility is the union of two surfaces — Stripe webhook fulfillment failure rate (`stripe_events.process_error IS NOT NULL`) and Checkout intent abandonment rate (`stripe_checkout_sessions.intent_status IN ('expired', 'canceled')`). The future server endpoint path is `/metrics/billing/health`. The forward contract (response shape byte-compatible with `BillingHealth`; `0.0 ≤ rate ≤ 1.0`; `count = round(total × rate)`; `authenticated-session-required` + `finance`/`admin` role gate) is locked in this WP so the follow-up server WP has zero schema ambiguity. | Webhook failures are a silent revenue leak — Stripe collected the money, but our entitlements table didn't flip, so the customer feels cheated and the operator never knows unless surfaced. Intent abandonment is the leading indicator of checkout-UX friction. Bundling both into a single widget (rather than two separate ones) reflects that they are a single class of "paid-action did not land" health signal. Naming the forward contract here prevents the classic dashboard ↔ server drift bug where the server returns a slightly different shape than the client expects. |
| D-19604 | Aggregate values exposed by the composable (`totalGross`, `totalNet`, `netMarginRatio`) derive ONLY from summing already-rounded per-day arrays — never from recomputing against raw inputs or aggregated raw totals. Division is permitted only when producing a ratio for display, and ratios MUST NOT be re-multiplied into money. | Recompute-from-aggregate is the most common financial-dashboard correctness bug: chart totals, tooltip totals, and table totals diverge by a few cents at month boundaries and the operator can't tell which one is real. Locking the derivation direction (per-day rounded → summed) means all three displays trace to the same source. The numerical-integrity rider blocks the related class of bug where a developer notices a ratio is "close to" a percentage and feeds it back into a money calculation. |
| D-19605 | Mock data on the dashboard is deterministic at the same standard as engine RNG: `seed = hash(range.start + '\|' + range.end)`, pure, no `Math.random()` without a seeded wrapper. Identical `range` input produces byte-identical output across calls, reloads, and widgets. | The engine's determinism guarantees only carry value if the rest of the stack matches them. A flaky mock causes flaky tests, flaky screenshots, and operators second-guessing what they saw on Tuesday. Hashing the range string is the cheapest stable seed source available — no globals, no module-load-time reads, no implicit `Date.now()`. The contract is stricter than "stable within a session" because cross-reload stability is what makes "I saw X yesterday" debuggable. |
| D-19606 | Operator interpretation hook: the Net Revenue widget footer displays a single `"Net margin: X.X%"` label for the selected range — informational only, no RYG / threshold / alert hook in this WP. Negative-net days surface explicitly via tooltip label `"Negative net day"`; range-negative net margin renders `"Net margin: −X.X% (net loss)"`. The harden-round-2 extension locks the tooltip-margin formula as **per-day** (`dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]`), distinct from the aggregate `netMarginRatio` used in the footer — both numbers exist; they answer different questions. | A dashboard widget that's purely descriptive forces the operator to do mental math under load; a single interpretive cue ("are we making money or not") collapses the decision. Deferring RYG to a future WP is deliberate — real percentages aren't known yet, so any threshold today would be meaningless and bake in the wrong defaults. Surfacing negative net explicitly (rather than just rendering a smaller bar) turns the highest-signal edge case into the most visible signal — exactly inverted from the common bug of clamping it away. The per-day vs aggregate margin split prevents the related bug where the tooltip shows the range average on every hover, telling the operator the wrong number for the surface they're reading. |
| D-19607 | Shared Revenue Source Contract: `NetRevenueChartWidget` and `RevenueChartWidget` MUST consume the same `fetchRevenueHistory(range)` call path, the same `useDateRange` reference, and a single shared fetch invocation. Direct calls to `mockRevenueHistory` from widget code are forbidden. | The harden-round-1 acceptance criterion "Cross-widget consistency: sum of NetRevenueChartWidget gross series exactly equals RevenueChartWidget total" was prose-level only — auditable manually but not structurally enforced. Without this contract, a developer adding a third revenue widget could legitimately construct its own series and watch the cross-widget totals drift by mock-determinism distance. Locking the call path means the grep is the audit. |
| D-19608 | ECharts Stacking Contract: all four Net Revenue series share the literal stack identifier `'total'`; series array order is fixed as `net, royalty, stripeFees, infraCogs` (bottom-to-top render); negative values use the same stack key; tooltip series order matches series-array order. | ECharts handles mixed-sign stacked bars correctly only when every series shares the stack key. A well-meaning developer might think the negative band "looks wrong" and assign the net series a separate stack for negative days — which detaches the negative bar from the positive stack and visually reads as a different metric. Locking the contract structurally prevents this class of "fix" from ever being merged. |

---

## Future Work (Explicitly Deferred)

This WP is **WP-A** of the operator-dashboard pre-mortem grouping
identified on 2026-05-31. The companion grouping (drafted in
discussion but not yet WP-papered) is:

- **WP-B** — Acquisition + funnel instrumentation (signup-source
  attribution, first-session funnel). Needs an `analytics_events`
  table and server-side capture; PII-posture decision required.
- **WP-C** — Retention cohort + churn surface. Needs cohort
  materialization (nightly job); composes on WP-B's event stream.
- **WP-D** — Public-surface health + general error/alert monitor
  (server 5xx, client uncaught) + cost-per-request watchdog.
- **WP-E** — TAM-saturation indicator + content-breadth widget
  (which card sets are actually played).

Specific deferrals out of WP-A:

| Topic | Why Deferred |
|---|---|
| Server endpoint `/metrics/billing/health` implementation | Server-layer WP; depends on settling the rolling-window definition and the auth posture (likely `authenticated-session-required` with `finance` role gate). Separate WP per one-WP-per-session rule. |
| Real royalty / fees / COGS percentages in `revenueDeductions.ts` | Requires finance review and a D-entry locking the values. |
| RYG thresholds and alert-panel integration for paid-action errors | Requires real data to set meaningful thresholds (matches WP-162 §Future Work pattern). |
| Drilldown from net-revenue widget to per-transaction detail | Needs `/api/admin/billing/history` wired into the dashboard; separate WP. |
| Customer-portal links from the operator widget to the Stripe dashboard | Needs Stripe dashboard URL config and a per-environment URL discriminator; separate WP. |
| **Per-user net-revenue metrics (ARPU, LTV) computed on the same four-bucket deductions** | The current `fetchRevenueHistory` surface returns daily totals only; per-user ARPU/LTV requires a per-account revenue projection that does not exist in `legendary.entitlements` / `legendary.stripe_checkout_sessions` aggregations today. Adding a per-user widget to this WP would expand scope past one-session-per-WP. Belongs in WP-B (acquisition / per-user analytics) or its own follow-up once the per-user revenue projection is defined. |
| General server-side error and alert monitoring (5xx rate, client uncaught exceptions) | Distinct concern from paid-action errors. Belongs in WP-D (public-surface health + cost watchdog) per the pre-mortem grouping. Conflating it here would blur the widget's "paid-action specifically" framing. |

---

## Anti-Patterns to Avoid

- Do NOT compute deductions in floating-point dollars and round at
  the end — round per-day per-bucket in integer cents
- Do NOT clamp negative net days to zero; a negative day is a real
  signal
- Do NOT add a server endpoint or SQL query "just to make it work"
- Do NOT add a new npm dependency for charting; use the existing
  echarts wrapper from WP-157
- Do NOT use a pie chart for the four-bucket breakdown — stacked
  bar only
- Do NOT introduce hard-coded hex colors for structural elements
- Do NOT make the deduction percentages user-editable in the UI;
  they live in source-controlled config only
- Do NOT mutate the gross series passed into the breakdown composable
- Do NOT introduce a Pinia store for billing health; use the
  composable + service-function pattern already established
- Do NOT name the future server endpoint anything other than
  `/metrics/billing/health` — the path is locked here so the
  follow-up server WP has no naming ambiguity
- Do NOT recompute `totalGross`, `totalNet`, or any per-bucket total
  from aggregated raw inputs — aggregates derive only from sums of
  already-rounded per-day arrays (D-19604)
- Do NOT feed `netMarginRatio` (or any ratio) back into a money
  calculation downstream — ratios are display-only (D-19604)
- Do NOT call `Math.random()` in the mock or composable files
  without wrapping in a seeded PRNG and citing D-19605 in a
  `// why:` comment
- Do NOT clamp, smooth, or hide negative net days — they are the
  most visible operational signal the widget produces (D-19606)
- Do NOT add RYG colors, threshold comparisons, or alert hooks to
  the operator interpretation footer in this WP — they are
  deliberately deferred until real percentages exist (D-19606)
- Do NOT call `mockRevenueHistory` (or any lower-level mock) from
  widget code — only `fetchRevenueHistory(range)` may appear in
  widget files (D-19607)
- Do NOT introduce a second `useDateRange` or independent reactive
  `range` ref alongside the page-level one — both revenue widgets
  share the page-level reference (D-19607)
- Do NOT assign a different `stack` key (e.g., `'positive'`,
  `'negative'`) to any series in the Net Revenue chart "to fix"
  negative-day rendering — ECharts handles mixed signs on a
  single stack key by design (D-19608)
- Do NOT re-implement the hash function inline in a widget,
  composable, or mock generator — import from the single source
  file with the D-19605 `// why:` (D-19605 ext.)
- Do NOT accept timestamped or timezoned values for `range.start`
  / `range.end` at any boundary — `YYYY-MM-DD` only; the service
  boundary normalizes (D-19605 ext.)
- Do NOT compute the chart tooltip margin from the aggregate
  `netMarginRatio` — per-day tooltip uses per-day values
  (D-19606 ext.)
- Do NOT branch the widget render on multiple booleans (e.g.,
  `v-if="loading" v-else-if="error"`) — use the single `state`
  computed and the locked 4-arm `v-if` chain (Widget State Gate)
- Do NOT call the term "banker's rounding" anywhere; `Math.round`
  is round-half-toward-+∞, not banker's (round-half-to-even) —
  the wording fix is part of the harden-round-2 contract
- Do NOT let `NaN` reach the renderer for any rate — branch on
  `totalCount === 0` upstream (D-19603 ext.)

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Monthly net total disagrees with daily sum by a few cents | Floating-point arithmetic crept in somewhere; replace with integer-cents math |
| Negative net day rendered as zero | The clamp guard was added defensively; remove it (see Acceptance Criteria) |
| Theme toggle leaves the net revenue chart in stale colors | `dashboard-theme-change` listener missing or `themeVersion` ref not declared in computed |
| Tooltip on net-revenue chart omits the net-margin percentage | Missing tooltip-formatter override; echarts default joins series names but does not compute derived margin |
| Webhook failure rate and count visually disagree | Mock generator chose count and rate independently; rebuild so `count = round(total × rate)` then `rate = count / total` for display consistency |
| Chart total disagrees with tooltip total by a few cents | Recompute-from-aggregate snuck in somewhere (`totalRoyalty = round(totalGross × royaltyPercent)`); replace with `sum(series.royalty[])` per D-19604 |
| Net Revenue widget shows different gross than Revenue Trend widget for the same range | One of the widgets is calling `mockRevenueHistory` with a different seed or a different range argument; trace to the shared service function and confirm both pass identical `range` |
| Two widget reloads on the same range show different mock values | Mock seeded from `Date.now()` or `Math.random()` instead of `hash(range.start + '\|' + range.end)`; rebuild generator per D-19605 |
| Negative net day rendered without a tooltip label | Tooltip formatter forgot to branch on `net < 0`; add the `"Negative net day"` label inside the tooltip formatter, not on the chart series |
| Operator interpretation footer missing or RYG-colored | Footer dropped during widget refactor, or a future-WP threshold hook was added prematurely; the footer is mandatory and must remain informational-only in this WP |
| Net Revenue and Revenue Trend widgets show different gross totals for the same range | Shared Revenue Source Contract violated — one widget bypassed `fetchRevenueHistory` or sourced a different `range` reference; D-19607 violation. Fix: grep should show exactly 2 `fetchRevenueHistory` widget call sites and 0 `mockRevenueHistory` widget call sites |
| Two browser reloads show different mock values for the same operator-picked range | DateRange normalization missed somewhere (e.g., `range.start` arrived with a `T00:00:00.000Z` suffix in one path, plain `YYYY-MM-DD` in another); D-19605 ext. violation. Fix: normalize at the service boundary; widgets see only normalized strings |
| Chart tooltip shows the same margin percentage on every day | Tooltip formatter is reading `breakdown.netMarginRatio.value` (aggregate) instead of per-day values; D-19606 ext. violation. Fix: compute per-day `dayMarginRatio` inside the tooltip formatter |
| Negative-net day bar visually detached from the positive stack | A series was assigned a different `stack` key for negative values; D-19608 violation. Fix: every series uses `stack: 'total'` literal |
| Sparkline shows 22 points one render and 30 the next | Window definition not enforced; D-19603 ext. violation. Fix: window is trailing 30 days from `range.end`, exactly 30 points |
| Rate displays as `NaN%` in the operator UI | Zero-denominator slipped past the guard; D-19603 ext. violation. Fix: branch on `totalCount === 0` upstream of the renderer |
| Widget renders chart AND a transient error message at the same time | Render branching used independent `v-if`s on `loading`/`error` instead of the single `state` gate; Widget State Gate violation. Fix: rewrite the template to the 4-arm chain |
| Operator on a different machine sees different mock values | Hash function depends on JS-engine-specific behavior or wasn't sourced from the single locked file; D-19605 ext. violation. Fix: use the FNV-1a implementation from the single source file; verify with a cross-platform smoke test |

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | All required WP sections present | PASS |
| 2 | Non-Negotiable Constraints present (engine-wide + packet-specific + session protocol + locked values) | PASS |
| 3 | `## Assumes` lists all dependencies | PASS — WP-157 + WP-162 + file/state preconditions enumerated |
| 4 | `## Context (Read First)` cites specific docs and sections | PASS — VISION §Financial Sustainability + NG-1..NG-8, DASHBOARD-REQUIREMENTS §1/§3/§5/§11-12, ARCHITECTURE Layer Boundary, code-style.md |
| 5 | `## Files Expected to Change` complete and bounded | PASS — ~5 new + ~4 modified; single-layer client WP |
| 6 | Naming consistency with 00.2 and prior packets | PASS — `RevenueDeductionConfig`, `BillingHealth`, `fetchBillingHealth` follow `fetchRevenueHistory`/`DailyMetric` precedent |
| 7 | Dependency discipline — no new npm packages | PASS — uses existing echarts + PrimeVue + composable pattern |
| 8 | Architectural boundary — client layer only | PASS — Layer Boundary respected; no engine, registry, server, or pre-planning imports |
| 9 | Windows / PowerShell compatibility | PASS — verification uses `pnpm`, no shell-specific syntax |
| 10 | Environment variable hygiene | PASS — `VITE_USE_MOCKS` is existing and unchanged; no new env vars introduced |
| 11 | Auth posture | N/A — page-level role gates (`admin`, `finance`) are inherited from WP-157, not modified here |
| 12 | Tests — `node:test` only | PASS — 7-test suite specified; no boardgame.io or DB access |
| 13 | Verification steps — pnpm, expected output | PASS — every step is exact |
| 14 | Acceptance criteria binary and observable | PASS — 29 criteria after harden-round-2 (was 14 → 20 in round 1 → 29 now). Far above the §14 6–12 soft guidance; every item remains binary, observable, and specific per §14's actual FAIL conditions; precedent: WP-107 / WP-162 / EC-218 land with extended criteria sets when contract-heavy. No subjective or vague items. Every criterion references a file, function, value, or D-entry. The round-2 expansion locks the eight previously-implicit contracts (DateRange normalization, hash function, shared revenue source, ECharts stacking, widget state gate, per-day tooltip margin, billing-health window, rate-zero guard) into explicit AC items. |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX | PASS — items 15-17 |
| 16 | Code style (00.6) — no abbreviations, no nested ternaries, no `.reduce()` with branching, JSDoc on functions, `// why:` on non-obvious code, full-sentence error messages | PASS — constraints block and anti-patterns enforce |
| 17 | Vision Alignment | PASS — §Financial Sustainability, NG-1..NG-8 cited; conflict assertion = no conflict; non-goal proximity = none crossed; determinism preservation = N/A documented |
| 18 | Prose-vs-grep discipline | PASS — verification greps target `@legendary-arena/*` and hex-color patterns; no forbidden-token enumeration in adjacent prose |
| 19 | Bridge-vs-HEAD staleness | N/A — this WP authors no repo-state-summarizing artifact |
| 20 | Funding Surface Gate | N/A with justification — internal admin/finance operator widgets, not user-facing funding affordances; analytical / retrospective mention carve-out applies |
| 21 | API Catalog (D-11804) | N/A with justification — no `apps/server` HTTP endpoint or library function added, modified, or status-changed; client-side reference to future `/metrics/billing/health` follows the existing `fetchRevenueHistory` precedent; catalog row is the next WP's responsibility |
