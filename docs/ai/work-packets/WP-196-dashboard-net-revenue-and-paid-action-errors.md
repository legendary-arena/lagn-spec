# WP-196 — Dashboard Net Revenue + Paid-Action Errors Widgets

**Status:** Draft
**Primary Layer:** Client (`apps/dashboard`)
**Dependencies:** WP-157 (Dashboard Scaffold) — Done 2026-05-16; WP-162 (Dashboard Daily Execution + UI Polish) — refer to its precedent for Widget Contract and design tokens
**EC:** To be assigned at execution time
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

- `docs/ai/DECISIONS.md` — D-19601 through D-19603
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
breakdown.netMarginPct  // ComputedRef<number>  (0.0 - 1.0)
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

- `round` is banker's rounding (`Math.round` is acceptable; the
  composable must document this choice in a `// why:` comment)
- If `netCents` is negative for a given day (gross too small to cover
  the fixed Stripe fee), the widget still displays the value as-is —
  it is not clamped to zero. A negative net day is a real signal
  (you lost money on that day after deductions) and must not be hidden.

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

The mock generator MUST produce realistic but obviously-mock values
on each call. It MUST NOT vary between calls in the same session (so
the operator sees stable values during testing); seeded
deterministically off the requested range string.

- `webhookFailureRate`: in `[0.00, 0.05]`
- `intentAbandonmentRate`: in `[0.10, 0.35]`
- Counts: chosen so that `count / total = rate` exactly (no
  rounding drift between displayed rate and displayed count)

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

### Net Revenue Chart Specifics

- Chart type: **stacked bar chart** showing gross broken into the
  four buckets (net, royalty, Stripe fees, infra COGS) bottom-to-top
- Net is the bottom band (the eye reads bottom-up as "what we keep first")
- Tooltip on each day shows all four bucket values plus net margin %
- Colors come from PrimeVue severity tokens, not custom hex:
  - net → `--p-primary-color`
  - royalty → `--p-text-muted-color`
  - Stripe fees → `--p-content-border-color`
  - infra COGS → `--p-surface-border`
- No pie chart variant (per DASHBOARD-REQUIREMENTS.md §12 and WP-162
  precedent)

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
5. `totalGross`, `totalNet`, and `netMarginPct` aggregate correctly
   over a 30-day input series
6. Empty input series returns `totalGross === 0`,
   `totalNet === 0`, and `netMarginPct === 0` (the zero-denominator
   branch is explicit and tested)
7. The composable does not mutate its input series (referential
   safety — the mock store is shared across widgets)

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
- [ ] `useNetRevenueBreakdown.test.ts` passes all 7 required tests
- [ ] All money arithmetic in the composable uses integer cents
      (no `parseFloat`, no `.toFixed()` mid-computation)
- [ ] A day whose gross is too small to cover the fixed Stripe fee
      renders a negative net value, not zero
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
#    → useNetRevenueBreakdown.test.ts passes all 7 tests
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

# 10. Confirm api-endpoints.md untouched
git diff --name-only origin/main -- docs/ai/REFERENCE/api-endpoints.md
#    → empty output

# 11. Full monorepo build
pnpm -r build
#    → exits 0
```

---

## Definition of Done

1. `pnpm -r build` exits 0
2. `pnpm --filter @legendary-arena/dashboard build` exits 0
3. `pnpm --filter @legendary-arena/dashboard test` exits 0 and
   `useNetRevenueBreakdown.test.ts` passes all 7 required tests
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
17. `docs/ai/work-packets/WORK_INDEX.md` row added/checked off for WP-196
18. No files outside `## Files Expected to Change` are modified

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-19601 | Net revenue is decomposed into four buckets: gross, royalty, Stripe fees, infra COGS. All arithmetic in integer cents; floating-point dollars are forbidden. | The royalty obligation to Upper Deck Entertainment and Marvel is a Vision-level non-negotiable (Financial Sustainability §). Gross revenue alone obscures the true unit economics. Stripe fees and infra COGS are the next-largest fixed deductions and round out the model. Integer cents avoids the rounding-drift class of bug that surfaces when monthly totals are summed from floating-point dailies. |
| D-19602 | Royalty deduction percentage ships as a flagged-mock placeholder; real numbers require finance review and a follow-up D-entry. | The royalty contract terms are operationally sensitive and outside the scope of a client-only widget WP. Locking the shape and the display posture now lets the real numbers swap in by editing a single config file when finance signs off. |
| D-19603 | Paid-action error visibility is the union of two surfaces — Stripe webhook fulfillment failure rate (`stripe_events.process_error IS NOT NULL`) and Checkout intent abandonment rate (`stripe_checkout_sessions.intent_status IN ('expired', 'canceled')`). The future server endpoint path is `/metrics/billing/health`. | Webhook failures are a silent revenue leak — Stripe collected the money, but our entitlements table didn't flip, so the customer feels cheated and the operator never knows unless surfaced. Intent abandonment is the leading indicator of checkout-UX friction. Bundling both into a single widget (rather than two separate ones) reflects that they are a single class of "paid-action did not land" health signal. |

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

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Monthly net total disagrees with daily sum by a few cents | Floating-point arithmetic crept in somewhere; replace with integer-cents math |
| Negative net day rendered as zero | The clamp guard was added defensively; remove it (see Acceptance Criteria) |
| Theme toggle leaves the net revenue chart in stale colors | `dashboard-theme-change` listener missing or `themeVersion` ref not declared in computed |
| Tooltip on net-revenue chart omits the net-margin percentage | Missing tooltip-formatter override; echarts default joins series names but does not compute derived margin |
| Webhook failure rate and count visually disagree | Mock generator chose count and rate independently; rebuild so `count = round(total × rate)` then `rate = count / total` for display consistency |

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
| 14 | Acceptance criteria binary and observable | PASS — 14 criteria, each pass/fail and observable without running the full system |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX | PASS — items 15-17 |
| 16 | Code style (00.6) — no abbreviations, no nested ternaries, no `.reduce()` with branching, JSDoc on functions, `// why:` on non-obvious code, full-sentence error messages | PASS — constraints block and anti-patterns enforce |
| 17 | Vision Alignment | PASS — §Financial Sustainability, NG-1..NG-8 cited; conflict assertion = no conflict; non-goal proximity = none crossed; determinism preservation = N/A documented |
| 18 | Prose-vs-grep discipline | PASS — verification greps target `@legendary-arena/*` and hex-color patterns; no forbidden-token enumeration in adjacent prose |
| 19 | Bridge-vs-HEAD staleness | N/A — this WP authors no repo-state-summarizing artifact |
| 20 | Funding Surface Gate | N/A with justification — internal admin/finance operator widgets, not user-facing funding affordances; analytical / retrospective mention carve-out applies |
| 21 | API Catalog (D-11804) | N/A with justification — no `apps/server` HTTP endpoint or library function added, modified, or status-changed; client-side reference to future `/metrics/billing/health` follows the existing `fetchRevenueHistory` precedent; catalog row is the next WP's responsibility |
