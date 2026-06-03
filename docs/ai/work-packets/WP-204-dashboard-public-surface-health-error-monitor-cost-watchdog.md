# WP-204 — Dashboard Public-Surface Health + Error Monitor + Cost Watchdog (Client / Mock-Mode-First)

## Goal

Surface three new ops widgets on the operator dashboard so the
operator can see **whether public surfaces are reachable, whether the
API is throwing errors, and whether infra spend is on track** — without
yet needing a server-side telemetry pipeline. Adds:

1. **`PublicSurfaceHealthWidget`** — per-surface uptime + status for the
   four canonical public surfaces (`marketing` / `play` / `cards` /
   `api`). Each row shows rolling 24h uptime %, current status
   (`up | degraded | down`), last incident timestamp, and a 30-day
   uptime sparkline.
2. **`ErrorRateMonitorWidget`** — generalised API error monitor (NOT
   billing-scoped — WP-196's `PaidActionErrorsWidget` already covers
   that). Shows current 1h 5xx rate + 24h 5xx rate + a 24h sparkline +
   a top-5 list of error signatures (truncated error message + count).
3. **`InfraCostWatchdogWidget`** — per-vendor month-to-date spend with
   end-of-month projection vs explicit per-vendor budget. Four closed
   vendors (`render` / `cloudflare` / `postgres` / `hanko`). Each card
   shows MTD spend + projected EOM spend + budget threshold + an
   `off-track` / `needs-attention` / `on-track` chip per the existing
   `computeKpiStatus()` helper (WP-198 carry-forward).

All three widgets ship in **mock-mode** (per WP-197 D-19702 deploy
posture — `MOCK` freshness badge). A compact `OpsAtAGlanceStripWidget`
also lands on `/overview` showing three top-line summaries
(worst-surface uptime / current 1h error rate / MTD cost as % of
monthly budget) + a "View system health →" link to `/system`.

This WP is **WP-D** of the operator-dashboard pre-mortem grouping
identified on 2026-05-31 (WP-196 §Future Work). It locks the
forward-looking `UptimeProbe` / `ErrorRateSnapshot` / `InfraCostEntry`
projection contracts that a future server-side telemetry WP will
produce; the widgets flip from MOCK to LIVE without contract churn
once that server WP lands. **WP-E** (TAM saturation + content
breadth) remains in the backlog, separately.

> **Invariant:** every value displayed by every widget in this WP is
> sourced from `services/opsHealthMocks.ts`. The widgets carry no
> production data and no production credentials; the `MOCK` freshness
> badge is a visible, non-removable signal until the paired server WP
> lands the real-data wire-up.

> **Terminology convention.** "Public surface" = an externally-reachable
> domain owned by the operator (per `docs/ops/DOMAINS.md`).
> "Error monitor" = unscoped API error rate (5xx) from the game
> server; billing-specific errors are out of scope (already covered
> by WP-196). "Cost watchdog" = per-vendor monthly spend projection;
> royalty / Stripe-fee deductions are out of scope (covered by
> WP-196's revenue deduction config).

---

## Assumes

- **WP-157 ✅ (hard-dep — dashboard scaffold).** `apps/dashboard/`
  exists with the 4-state Widget Contract (loading / error / empty /
  data), the `ServiceResponse<T>` shape (`{ data, updatedAt, source }`),
  the `useDataFreshness` composable, and the EChart wrapper. No new
  charting dependency.
- **WP-162 ✅ (hard-dep — UI polish + Aura tokens).** PrimeVue + Aura
  tokens wired; hex colors forbidden in widget source.
- **WP-196 ✅ (hard-dep — widget patterns + DateRange normalization +
  forward-contract precedent).** Locked: `useDateRange` composable +
  `normalizeRange` service-boundary helper + `hashRange` FNV-1a
  determinism helper (D-19605). Forward-contract precedent — WP-204
  follows the same pattern for `UptimeProbe` / `ErrorRateSnapshot` /
  `InfraCostEntry` ahead of the paired server-side telemetry WP.
- **WP-197 ✅ (hard-dep — deploy posture + mock-mode-first).** Per
  D-19702, all v1 dashboard widgets ship mock-mode-first and flip to
  LIVE in a follow-up server WP. `VITE_USE_MOCKS=true` on CF Pages
  Production env; the `MOCK` freshness badge is the operator's signal
  that the data is not yet real.
- **WP-198 ✅ (hard-dep — drift-pinned canonical-array pattern +
  `computeKpiStatus()` helper).** `KPI_STATUSES` precedent for the
  three new drift-pinned arrays (`PUBLIC_SURFACES`,
  `INFRA_COST_VENDORS`, `UPTIME_STATUSES`). `computeKpiStatus()`
  reused verbatim for the cost-watchdog chip using the existing
  `KpiStatus = 'on-track' | 'needs-attention' | 'off-track'` enum
  (WP-198) — no new status taxonomy invented. Widget display copy
  MAY render the `'off-track'` cost case as "Over budget" in the
  chip text; that's a display string, not a fork of the enum.
- **WP-199 ✅ (hard-dep — composable naming + import patterns +
  numeric-zero semantics).** Existing composables sit at
  `apps/dashboard/src/composables/use*.{ts,test.ts}`; WP-204 follows
  the same layout. D-19908 (numeric `0` is meaningful, not
  null-sentinel) carries forward to cost / uptime / error-rate
  composables.
- **WP-203 ✅ (hard-dep — Composable Source Contract + mock-mode-first
  precedent for a multi-widget dashboard surface).** WP-203 established
  the `() => ServiceResponse<readonly T[]>` getter shape, the
  `fetchX` / `mockX` re-export aliasing convention in `mocks.ts`, and
  the §Aggregation rule / §Determinism scope / §Empty-state rule /
  §Widget Data Requirements section structure WP-204 re-uses verbatim.
  Reading WP-203 first is mandatory.
- **WP-196 §Future Work + §Specific Deferrals (read first).** WP-196
  bucketed cost watchdog + general error monitor + public-surface
  health together as WP-D. WP-204 implements that bucket; per-vendor
  budget values stay placeholder (mirrors WP-196's `revenueDeductions.ts`
  pattern — the WP locks the **shape** of the budget config, not the
  values, which require operator review).
- **Existing dashboard inventory (verified 2026-06-03 against `main
  @ a9c4696`):**
  - `apps/dashboard/src/widgets/`: 19 existing widgets (latest:
    `TrafficSourcesWidget`, `ActivationFunnelWidget`,
    `RetentionCohortsWidget`, `AcquisitionFunnelStripWidget`).
  - `apps/dashboard/src/composables/`: 12 existing composables (latest:
    `useTrafficSources`, `useActivationFunnel`, `useRetentionCohorts`).
  - `apps/dashboard/src/services/`: `mocks.ts` (re-exports + primary
    mocks), `analyticsMocks.ts`, `billingHealthMocks.ts`, `hashRange.ts`,
    `normalizeRange.ts`, `api.ts`, `endpoints.ts`, `websocket.ts`.
  - `apps/dashboard/src/pages/system/SystemHealthPage.vue` exists and
    currently renders a DataTable over `fetchServerNodes`. WP-204
    builds on it; the existing DataTable is preserved and the three
    new full widgets land **above** it.
  - `apps/dashboard/src/pages/dashboard/OverviewPage.vue` is the
    morning-glance page; WP-204 adds the compact strip after the
    existing `AcquisitionFunnelStripWidget` so all four
    pre-mortem-grouped strips (revenue trend, acquisition, ops) sit
    in a vertical run.
  - `apps/dashboard/src/types/index.ts` already exposes a `ServerNode`
    interface (line ~92). WP-204 does NOT modify it — `ServerNode` is
    per-node infrastructure detail; WP-204's `UptimeProbe` is per
    public-surface (domain-level). Two distinct shapes; both retained.
  - `apps/dashboard/src/widgets/AlertsPanel.vue` already exists and
    surfaces `AlertItem[]`. WP-204 does NOT modify it — the new
    `ErrorRateMonitorWidget` is a sibling concern (rate + top
    signatures), not a replacement for the alerts surface.
- **Repo posture.** Single-repo (`apps/dashboard/`); no marketing-repo
  crossing (`C:\www\legendary-arena-com\` not touched). No npm
  dependency additions (per WP-196 / WP-198 / WP-199 / WP-203
  no-new-deps gate).
- **Drafting baseline:** `origin/main @ a9c4696` (post-WP-203 close-out;
  clean working tree apart from the draft branch artifacts).

---

## Context (Read First)

> **Line-number references are advisory at drafting time.** Re-verify
> with `grep -n` if `main` has moved between draft and execute.

- **WP-203**
  (`docs/ai/work-packets/WP-203-dashboard-acquisition-activation-retention.md`)
  — **closest precedent**. Same shape: mock-mode-first dashboard
  surface, three full widgets + one Overview strip sharing a
  service / composable / types pattern, forward contract locked for
  a future server endpoint WP. Reuse the §Files Expected to Change
  shape, the §Acceptance Criteria grouping (Types/Drift —
  Behavior/Determinism — Data/Mock — Widgets/Layout — Build/Test/Layer),
  the Composable Source Contract, the Aggregation rule, the
  Empty-state rule, and the Anti-Patterns block. WP-203's §Future
  Work / §Out of Scope explicitly names WP-D as separate.
- **WP-196**
  (`docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md`)
  — origin of the placeholder-config pattern (`revenueDeductions.ts`
  ships with `isMock: true` flag). WP-204 mirrors this with
  `infraCostBudgets.ts`. Also originates the `useNetRevenueBreakdown`
  composable shape WP-204's three new composables follow.
- **WP-198** (governance snapshot + KPI strip) — `computeKpiStatus()`
  helper + `KPI_STATUSES` drift-pinned-array precedent. WP-204
  reuses `computeKpiStatus()` for the cost-watchdog status chip and
  mirrors `KPI_STATUSES` for `PUBLIC_SURFACES` / `INFRA_COST_VENDORS` /
  `UPTIME_STATUSES`.
- **WP-199** (status feed + governance KPIs) — composable-per-widget
  convention + numeric-zero semantics (D-19908).
- **WP-157** (dashboard scaffold) + **WP-162** (UI polish) — the
  ServiceResponse / 4-state Widget Contract / Aura-tokens-only base.
- `apps/dashboard/src/types/index.ts` — `ServiceResponse<T>`,
  `DateRange`, `KpiSnapshot`, `KPI_STATUSES`, `ServerNode`,
  `AlertItem`, `BillingHealth`, `NetRevenueSeries`, `AnalyticsEvent`,
  `TrafficSource`, `ActivationFunnelStep`, `RetentionCohort`,
  `ACQUISITION_CHANNELS`, `ACTIVATION_STEPS`. WP-204 appends 3 new
  interfaces (`UptimeProbe`, `ErrorRateSnapshot`, `InfraCostEntry`),
  3 new closed unions (`PublicSurfaceKey`, `UptimeStatus`,
  `InfraCostVendor`), and 3 new drift-pinned canonical arrays
  (`PUBLIC_SURFACES`, `UPTIME_STATUSES`, `INFRA_COST_VENDORS`).
- `apps/dashboard/src/services/analyticsMocks.ts` +
  `billingHealthMocks.ts` — precedent for the new `opsHealthMocks.ts`
  file shape (`wrapMock<T>` + per-domain factories + re-export from
  `mocks.ts` under both `mockX` and `fetchX` aliases per D-20302
  sub-rule).
- `apps/dashboard/src/composables/useNetRevenueBreakdown.ts` +
  `useTrafficSources.ts` + `useActivationFunnel.ts` — composable
  shape precedent. WP-204's 3 new composables follow the same
  return-object pattern.
- `apps/dashboard/src/widgets/NetRevenueChartWidget.vue` +
  `TrafficSourcesWidget.vue` + `ActivationFunnelWidget.vue` —
  4-state Widget Contract reference implementations.
- `apps/dashboard/src/widgets/GovernanceKpiStrip.vue` +
  `AcquisitionFunnelStripWidget.vue` — strip-widget reference. WP-204's
  `OpsAtAGlanceStripWidget` follows the same horizontal-strip pattern.
- `apps/dashboard/src/widgets/PaidActionErrorsWidget.vue` — closest
  shape precedent for `ErrorRateMonitorWidget` (rate + sparkline
  pattern). WP-204's error monitor is the **generalised** sibling
  (5xx across all routes); the billing-scoped variant remains owned
  by WP-196.
- `apps/dashboard/src/widgets/AlertsPanel.vue` — existing alerts
  surface; NOT modified by WP-204 (separate concern from rate /
  signature monitoring).
- `apps/dashboard/src/pages/system/SystemHealthPage.vue` — current
  state renders a single DataTable; WP-204 inserts the 3 new full
  widgets in vertical order ABOVE the existing DataTable so the
  per-node table remains the page's drill-down surface.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — the
  `OpsAtAGlanceStripWidget` lands immediately after the existing
  `AcquisitionFunnelStripWidget` (so the four pre-mortem-derived
  strips sit in a vertical run: revenue trend → acquisition →
  ops-at-a-glance).
- `apps/dashboard/src/utils/kpiStatus.ts` + `kpiStatus.test.ts` —
  `computeKpiStatus()` + `KPI_STATUSES` drift precedent. WP-204
  reuses the function verbatim (no re-derivation) and mirrors the
  drift-test pattern in a new `utils/opsTaxonomy.test.ts`.
- `apps/dashboard/src/config/revenueDeductions.ts` — placeholder-config
  pattern. WP-204 ships `config/infraCostBudgets.ts` with `isMock:
  true` and operator-supplied placeholder budget values flagged for
  finance review at a follow-up WP.
- `docs/ops/DOMAINS.md` + `docs/ops/domains.json` — authoritative
  list of public surfaces. `PUBLIC_SURFACES` membership is **derived
  from** this list (subset: 4 canonical externally-reachable
  surfaces — marketing, play, cards, api) — NOT every probe entry
  (eng wiki, dashboard, scoreboard remain operator-internal).
- `docs/ai/DECISIONS.md` — D-19601 (integer-cents discipline),
  D-19603 (forward server contract pattern), D-19605 (mock determinism
  + DateRange normalization + FNV-1a hash), D-19608 (Widget State
  Gate Pattern), D-19702 (mock-mode-first deploy posture), D-19802
  (KPI threshold optionality), D-19908 (numeric-zero semantics),
  D-20301 / D-20302 / D-20303 (forward-locked envelope + MOCK badge +
  PII posture — WP-203 precedent for the same pattern WP-204 follows).
- `docs/01-VISION.md` §3 (Trust & Fairness — operator-internal surface),
  §11 (Identity / accounts — N/A here), §17 (Accessibility —
  text-label-first chips), §20 (Funding surface — N/A here).
- `docs/ops/DASHBOARD-REQUIREMENTS.md` §3 Phase A (server uptime,
  error rate, latency — natively available from `apps/server`),
  §4 Page Purposes (System Health = "Infrastructure monitoring"),
  §5 Widget Behavior Contract.
- `docs/ai/ARCHITECTURE.md §Layer Boundary` — `apps/dashboard/` is
  client-only; no
  `@legendary-arena/{game-engine,registry,preplan,server}` imports.
- `.claude/rules/{architecture,code-style,work-packets}.md`.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical field
  names (no abbreviations).
- `docs/ai/REFERENCE/00.6-code-style.md` — engine-wide human-style
  code rules; cited verbatim in §Non-Negotiable Constraints.

---

## Why now

WP-196 shipped WP-A (Net Revenue + Paid-Action Errors); WP-203
shipped WP-B + WP-C (Acquisition + Activation + Retention). The
remaining gaps from the 2026-05-31 pre-mortem grouping are WP-D
(this packet — public-surface health + general error monitor + cost
watchdog) and WP-E (TAM saturation + content breadth — separately
backlogged). WP-D is the **operator-survival** surface: the operator
needs to see whether a Cloudflare Pages deploy broke the marketing
site, whether the Render server is throwing 5xx, and whether
infrastructure spend is about to blow past the monthly budget — before
revenue / acquisition / retention dashboards become moot. Shipping
in mock-mode-first per WP-197 D-19702 lets the operator iterate on
widget layout, surface list, vendor list, and budget thresholds
before the paired server WP sinks engineering effort into uptime
probe scheduling, vendor cost ingestion, and 5xx aggregation. The
forward-contract pattern (locked `UptimeProbe` / `ErrorRateSnapshot` /
`InfraCostEntry` shapes consumed verbatim by the future server WP)
matches the WP-196 ↔ `/metrics/billing/health` and WP-203 ↔
`AnalyticsEvent` precedents.

---

## Scope (In)

### Types contract (1 modified file)

- **Extend `apps/dashboard/src/types/index.ts`** with 3 new interfaces,
  3 new closed unions, and 3 drift-pinned canonical arrays:
  - `UptimeProbe` — per-surface daily uptime data: `readonly surface:
    PublicSurfaceKey`; `readonly date: string` (`YYYY-MM-DD`);
    `readonly status: UptimeStatus`; `readonly uptimePercent: number`
    (0-100, 1-decimal precision via `Math.round(value * 10) / 10`);
    `readonly incidentCount: number`; `readonly lastIncidentTimestamp:
    number | null` (epoch ms; `null` when no incidents in the window).
  - `ErrorRateSnapshot` — per-day API error data: `readonly date:
    string`; `readonly windowSeconds: number` (size of the bucket —
    locked at 3600 in v1 for the rolling-1h panel and 86400 for the
    daily aggregate; both shapes flow through this single interface);
    `readonly totalRequests: number`; `readonly errorCount: number`
    (5xx); `readonly errorRate: number` (0-1 decimal fraction;
    zero-denominator returns `0`, not `NaN`); `readonly
    topSignatures: readonly ErrorSignature[]` (truncated to top 5,
    sorted by `count` descending then `signature` ascending for
    deterministic tie-break).
  - `ErrorSignature` — sub-interface: `readonly signature: string`
    (UTF-16 first 80 code units — NOT JS chars, NOT bytes; mirrors
    WP-195 `errorSignature` precedent); `readonly count: number`;
    `readonly firstSeen: number` (epoch ms — earliest occurrence in
    window); `readonly lastSeen: number` (epoch ms — latest
    occurrence in window).
  - `InfraCostEntry` — per-vendor per-day cost: `readonly vendor:
    InfraCostVendor`; `readonly date: string` (`YYYY-MM-DD`);
    `readonly amountCents: number` (integer-cents discipline per
    D-19601 carry-forward); `readonly currency: 'USD'` (locked
    closed union; multi-currency is out of scope for v1).
  - `PublicSurfaceKey` closed union: `'marketing' | 'play' | 'cards'
    | 'api'`. **Justification for these 4 surfaces (locked):**
    `marketing` = `www.legendary-arena.com` (player on-ramp);
    `play` = `play.legendary-arena.com` (the game itself);
    `cards` = `cards.legendary-arena.com` (registry viewer — the
    canonical card reference); `api` = `api.legendary-arena.com` /
    `legendary-arena-server.onrender.com` (game server). The
    remaining surfaces in `docs/ops/DOMAINS.md` (`ewiki`, `wiki`,
    `legends`, `dashboard`, `images`) are operator-internal,
    pre-launch, or vendor-hosted; v1 tracks the four
    player-on-ramp / play / reference / api lanes only.
  - `UptimeStatus` closed union: `'up' | 'degraded' | 'down'`.
    Membership exactly matches the existing `ServerNode.status`
    union (lines ~96 of `types/index.ts`) so per-node and
    per-surface status renderings share a vocabulary; the two
    interfaces (`ServerNode` per-node + `UptimeProbe` per-surface)
    remain distinct.
  - `InfraCostVendor` closed union: `'render' | 'cloudflare' |
    'postgres' | 'hanko'`. v1 captures the four currently-billed
    vendors per `docs/ops/DOMAINS.md` + `docs/01-VISION.md`
    §Financial Sustainability. Future vendors (e.g., R2 split out
    from `cloudflare`, separate CDN, observability tooling) get
    added by extending both the union and `INFRA_COST_VENDORS` in
    the same edit — drift test catches asymmetric updates.
  - **Drift-pinned canonical arrays** mirroring `KPI_STATUSES`
    pattern: `PUBLIC_SURFACES: readonly PublicSurfaceKey[]` +
    `UPTIME_STATUSES: readonly UptimeStatus[]` +
    `INFRA_COST_VENDORS: readonly InfraCostVendor[]`. Drift test in
    a new `apps/dashboard/src/utils/opsTaxonomy.test.ts` asserts
    bidirectional parity with the three unions.

### Cost-budget config (1 new file)

- **`apps/dashboard/src/config/infraCostBudgets.ts`** — static
  `readonly` per-vendor monthly USD budget config, modelled on
  `config/revenueDeductions.ts`. Locked shape:

  ```typescript
  export interface InfraCostBudget {
    readonly vendor: InfraCostVendor;
    readonly monthlyBudgetCents: number;
    readonly toleranceRatio: number;
    readonly isMock: boolean;
  }

  export const INFRA_COST_BUDGETS: readonly InfraCostBudget[] = [
    { vendor: 'render',     monthlyBudgetCents: 10000, toleranceRatio: 0.20, isMock: true },
    { vendor: 'cloudflare', monthlyBudgetCents:  5000, toleranceRatio: 0.20, isMock: true },
    { vendor: 'postgres',   monthlyBudgetCents:  3000, toleranceRatio: 0.20, isMock: true },
    { vendor: 'hanko',      monthlyBudgetCents:  2500, toleranceRatio: 0.20, isMock: true },
  ];
  ```

  - Cents are integers per D-19601.
  - `isMock: true` is the source of truth for the widget's MOCK badge
    (mirrors WP-196 `revenueDeductions.ts` precedent).
  - `toleranceRatio` is a decimal fraction expressing the
    over-target band size as a fraction of `monthlyBudgetCents`. The
    composable converts to cents at call time
    (`tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`)
    and passes the resulting `KpiSnapshot` to `computeKpiStatus()`.
    With `direction: 'lower-is-better'` and `toleranceRatio = 0.20`:
    `mtd <= budget` → `'on-track'`; `budget < mtd <= budget * 1.20`
    → `'needs-attention'`; `mtd > budget * 1.20` → `'off-track'`.
    Uniform `toleranceRatio` across vendors in v1; per-vendor tuning
    deferred to a future finance-loop WP per D-20403.
  - The real budget values are set by a later WP after operator
    review; this WP locks the **shape** of the config, not the
    values.

### Mock data (1 new file + 1 modified file)

- **`apps/dashboard/src/services/opsHealthMocks.ts`** — new file
  mirroring `analyticsMocks.ts` shape. Exports
  `mockUptimeProbes(range: DateRange)` returning
  `ServiceResponse<readonly UptimeProbe[]>` (one entry per surface
  per day in range; iteration order = canonical
  `PUBLIC_SURFACES` × ascending `date`),
  `mockErrorRateSnapshots(range: DateRange)` returning
  `ServiceResponse<readonly ErrorRateSnapshot[]>` (one entry per
  day in range; iteration order = ascending `date`), and
  `mockInfraCostEntries(range: DateRange)` returning
  `ServiceResponse<readonly InfraCostEntry[]>` (one entry per vendor
  per day in range; iteration order = canonical
  `INFRA_COST_VENDORS` × ascending `date`). All three wrap results
  in `ServiceResponse<T>` with `source: 'MOCK'`. Mock determinism
  via shared `hashRange(range)` seed per D-19605 (the existing
  FNV-1a from `services/hashRange.ts`).
- **`apps/dashboard/src/services/mocks.ts`** — modified — re-export
  the 3 new mock factories twice (mirrors WP-203 D-20302 sub-rule):
  once under the `mockX` name (for tests), once under the `fetchX`
  name (for widgets — keeps widget source byte-identical pre/post
  MOCK→LIVE flip).

### Composables (3 new + tests = 6 files)

> **Composable Source Contract (hard — carry-forward from WP-203).**
> Every composable below accepts a getter of shape
> `() => ServiceResponse<readonly T[]>`. The composable reads `.data`
> internally for its derivations but MUST preserve `.source` and
> `.updatedAt` in its return object so widgets can surface the
> freshness badge without re-importing the service layer. This
> symmetry is what makes the MOCK → LIVE flip a getter-only change
> (widgets stay byte-identical).

- **`apps/dashboard/src/composables/usePublicSurfaceHealth.{ts,test.ts}`**
  — accepts `() => ServiceResponse<readonly UptimeProbe[]>`;
  returns `{ series: ComputedRef<readonly UptimeProbe[]>,
  uptimeBySurface: ComputedRef<Record<PublicSurfaceKey, number>>
  (mean uptime % over range, rounded to 1 decimal),
  worstSurface: ComputedRef<{ surface: PublicSurfaceKey; uptimePercent:
  number } | null> (lowest mean uptime; ties broken by canonical
  `PUBLIC_SURFACES` order; `null` for empty input),
  lastIncidentBySurface: ComputedRef<Record<PublicSurfaceKey, number |
  null>> (most-recent `lastIncidentTimestamp` per surface across the
  range; `null` if no incidents), source:
  ComputedRef<ServiceResponse<unknown>['source']>, updatedAt:
  ComputedRef<number> }`. Per-surface mean uptime uses arithmetic
  mean across daily probes (no weighting by window size — every day
  is equally weighted in v1). `series` is sorted ascending by `date`
  using Unicode code-unit comparison (per §Aggregation rule).
- **`apps/dashboard/src/composables/useErrorRateMonitor.{ts,test.ts}`**
  — accepts `() => ServiceResponse<readonly ErrorRateSnapshot[]>`;
  returns `{ series: ComputedRef<readonly ErrorRateSnapshot[]>,
  currentRate: ComputedRef<number> (errorRate of the most-recent
  entry by `date`; `0` for empty input — D-19908 numeric-zero
  carry-forward), rollingDailyRate: ComputedRef<number> (mean
  errorRate over the trailing 24h entries — equal-weighted), totals:
  ComputedRef<{ totalRequests: number; errorCount: number }> (sums
  across the range), topSignaturesAcrossRange:
  ComputedRef<readonly ErrorSignature[]> (top 5 by aggregate
  `count`; aggregation merges identical signature strings across
  per-day snapshots, summing counts and taking min `firstSeen` /
  max `lastSeen`), source: ComputedRef<...>, updatedAt:
  ComputedRef<number> }`. Zero-request snapshots return `errorRate
  = 0` (not `NaN`).
- **`apps/dashboard/src/composables/useInfraCostWatchdog.{ts,test.ts}`**
  — accepts `() => ServiceResponse<readonly InfraCostEntry[]>` PLUS
  a second arg `budgets: readonly InfraCostBudget[]` (imported by
  the caller from `config/infraCostBudgets.ts` — composable does NOT
  reach into the config module itself, preserves testability via
  injection); returns `{ mtdByVendor: ComputedRef<Record<InfraCostVendor,
  number>> (sum of `amountCents` per vendor for entries whose
  `date` is in the current calendar UTC month), projectedEomByVendor:
  ComputedRef<Record<InfraCostVendor, number>> (linear projection:
  `mtd * daysInMonth / dayOfMonth`; `0` for `dayOfMonth = 0` —
  shouldn't occur but D-19908 guard), statusByVendor:
  ComputedRef<Record<InfraCostVendor, KpiStatus>> where `KpiStatus =
  'on-track' | 'needs-attention' | 'off-track'` (the existing WP-198
  enum — verbatim, not forked); each vendor's status is derived by
  constructing a `KpiSnapshot` (`{ id: vendor, label, value: mtdCents,
  previousValue: 0, unit: 'cents', trend: 'flat', target:
  monthlyBudgetCents, tolerance: Math.round(monthlyBudgetCents *
  toleranceRatio), direction: 'lower-is-better' }`) and calling
  `computeKpiStatus(snapshot)` — WP-198 helper signature is
  `(snapshot: KpiSnapshot) => KpiStatus | null`; the composable
  treats a `null` return (target undefined / config gap) as a HARD
  FAIL because every vendor in `INFRA_COST_BUDGETS` has a target by
  construction. **Direction is `'lower-is-better'`** because lower
  cost = better outcome; the helper's tolerance-band semantics map
  the over-budget case to `'needs-attention'` (within tolerance of
  target) vs `'off-track'` (substantially over). totalMtdCents: ComputedRef<number>,
  totalMonthlyBudgetCents: ComputedRef<number>, totalBudgetUtilizationRatio:
  ComputedRef<number> (totalMtdCents / totalMonthlyBudgetCents;
  zero-denominator → `0`), source: ComputedRef<...>, updatedAt:
  ComputedRef<number> }`. **Date math caveat:** the composable
  derives `dayOfMonth` and `daysInMonth` from the most-recent entry's
  `date` string (NOT from `Date.now()`) so the composable is a pure
  function of (entries, budgets) — preserves determinism scope.

### Widgets (4 new)

- **`apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue`** —
  4-state Widget Contract. Data state renders a 4-row table (one
  row per surface, canonical `PUBLIC_SURFACES` order) showing:
  surface key, current status chip (`up` / `degraded` / `down` —
  text-label-first per Vision §17; color decorative), 24h uptime %,
  30-day uptime sparkline (EChart line), last incident relative
  timestamp (`"3d ago"` / `"never"`). Footer line: `"Worst surface:
  X (Y% uptime)"`. Required attributes: `data-testid=
  "public-surface-health-widget"`, `aria-label="Public surface
  health by domain"`.
- **`apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue`** —
  4-state Widget Contract. Data state renders: current 1h 5xx rate
  (large numeric — `X.XX%`); 24h rolling rate (subdued — `X.XX%`);
  24h sparkline; top-5 error signatures table (signature truncated
  + count + `firstSeen` / `lastSeen` relative). Footer line:
  `"Total: X errors / Y requests over selected range"`.
- **`apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue`** —
  4-state Widget Contract. Data state renders a 4-card grid (one
  per vendor, canonical `INFRA_COST_VENDORS` order) showing:
  vendor label, MTD spend (formatted USD), EOM projection
  (formatted USD), monthly budget (formatted USD), status chip
  (`on-track` / `needs-attention` / `off-track` via
  `computeKpiStatus()`; widget display copy MAY render
  `'off-track'` as "Over budget" in the chip text — that's a display
  string, not a fork of the enum). Footer line: `"Total MTD: $X.XX · Total
  budget: $Y.YY · Utilization: Z%"`.
- **`apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue`** —
  compact horizontal strip for Overview. 3 cards: `Worst-surface
  uptime`, `Current error rate (1h)`, `Cost utilization (MTD vs
  budget)`. Each card shows the headline number + a small status
  chip via `computeKpiStatus()`. Each card constructs a
  `KpiSnapshot` inline with locked `target` + `tolerance` +
  `direction` values:
  - **Worst-surface uptime card** (`direction: 'higher-is-better'`):
    `target: 99.0`, `tolerance: 4.0` → `value >= 99.0` ⇒
    `'on-track'`; `95.0 <= value < 99.0` ⇒ `'needs-attention'`;
    `value < 95.0` ⇒ `'off-track'`.
  - **Current 1h error rate card** (`direction: 'lower-is-better'`,
    value expressed as a percentage 0-100):
    `target: 1.0`, `tolerance: 4.0` → `value <= 1.0` ⇒ `'on-track'`;
    `1.0 < value <= 5.0` ⇒ `'needs-attention'`; `value > 5.0` ⇒
    `'off-track'`.
  - **Cost utilization card** (`direction: 'lower-is-better'`, value
    expressed as a percentage 0-100):
    `target: 80.0`, `tolerance: 20.0` → `value <= 80` ⇒
    `'on-track'`; `80 < value <= 100` ⇒ `'needs-attention'`;
    `value > 100` ⇒ `'off-track'`.

  These three `KpiSnapshot` literals are hardcoded inline in v1
  (the strip is the only consumer); future WPs MAY extract them
  to a shared config if a second consumer surfaces — do NOT
  pre-extract per 00.6 §16.1 rule-of-three. "View system health →"
  link at the right routes to `/system`.

### Widget Data Requirements (Locked)

> Each widget specifies the minimum data it requires to enter the
> `data` state of the 4-state Widget Contract (WP-157 / D-19608).
> Anything less drops the widget to `empty` state with the explicit
> empty-state UI per WP-157 contract — **NOT** a zeroed chart, NOT a
> degenerate axis. Mirrors WP-203 §Widget Data Requirements pattern.

#### Widget-local time windows (locked — composable-derived only)

Widgets often display a tighter window than the page-level
`DateRange` selection (sparklines specifically). Those tighter
windows MUST be derived from the composable's `series` — NOT by
fetching a different range, NOT by reading from a sibling
composable:

- **`PublicSurfaceHealthWidget` 30-day uptime sparkline** — uses
  the trailing 30 entries of `series` per surface, ordered by
  ascending `date`. If the selected page range is shorter than 30
  days, the sparkline displays whatever the composable returned
  (no zero-fill, no re-fetch).
- **`ErrorRateMonitorWidget` 24h sparkline** — uses the trailing
  24 entries of `series` whose `windowSeconds = 3600`, ordered by
  ascending `date`. If fewer than 24 hourly entries exist in the
  composable output, the sparkline displays whatever it has (no
  zero-fill, no re-fetch).
- **`InfraCostWatchdogWidget`** carries no sparkline in v1; the
  per-vendor cards display MTD + EOM projection numerics only.
  A trailing-30-day cost sparkline is a deliberate v2 extension
  (deferred to a future widget polish WP).
- **`OpsAtAGlanceStripWidget`** displays summary numerics from
  the same three composables that the full widgets use; no
  independent sparkline. Per §No cross-widget composable
  coupling below, the strip calls the same composables directly,
  NOT the full widgets' computed values.

#### No cross-widget composable coupling (locked)

Every widget derives its display state from its **own** composable
call(s). Widgets MUST NOT:

- Read computed values from another widget's component instance
  (e.g., `<PublicSurfaceHealthWidget ref="health" />` then
  `health.value.worstSurface`).
- Subscribe to another widget's emitted events for derivation
  (events are only acceptable for cross-cutting concerns like
  date-range changes via the existing `useDateRange` pattern).
- Re-import a composable result that another widget already
  computed; each widget calls the composable itself (with its own
  reactive input) — Vue's reactivity layer + the
  pure-function-of-input composable contract ensure cache hits
  where it matters.

This rule keeps the widget tree a forest, not a graph; future
refactors can move / remove / add widgets without unwinding
cross-widget reads.

- **`PublicSurfaceHealthWidget`** requires `series.length >= 1` AND
  at least one entry per `PUBLIC_SURFACES` key (composable
  normalizes — surfaces with zero probes default to empty rows; the
  widget enters `data` state if **any** surface has any probe).
- **`ErrorRateMonitorWidget`** requires `series.length >= 1`. Below
  that → empty state.
- **`InfraCostWatchdogWidget`** requires at least one entry per
  vendor in the current-month subset (composable computes
  `mtdByVendor` from current-month entries only). If the
  current-month subset is empty for all vendors → empty state
  (uninformative); if some vendors have current-month data and
  others don't, the empty vendors render `mtdCents: 0` (D-19908
  numeric-zero carry-forward — zero is a real meaningful state,
  not a null sentinel).
- **`OpsAtAGlanceStripWidget`** requires all three of:
  `usePublicSurfaceHealth().series.length > 0`,
  `useErrorRateMonitor().series.length > 0`,
  `useInfraCostWatchdog().mtdByVendor` has at least one non-zero
  vendor. Below all three → strip-level empty state (single line:
  `"No ops data captured in selected range"`); per-card zero values
  on partial data render as the explicit `"—"` placeholder, NOT
  `0%` / `$0`.

### Page wiring (2 modified)

- **`apps/dashboard/src/pages/system/SystemHealthPage.vue`** — wire
  the 3 new full widgets in a top-to-bottom layout ABOVE the
  existing `DataTable<ServerNode>`: `PublicSurfaceHealthWidget` →
  `ErrorRateMonitorWidget` → `InfraCostWatchdogWidget` → existing
  per-node DataTable (preserved byte-identical). Each new widget
  reads its own composable; the page uses the existing
  `useDateRange` for all three new widgets (`InfraCostWatchdogWidget`
  also imports `INFRA_COST_BUDGETS` from
  `config/infraCostBudgets.ts` and passes it to the composable).
- **`apps/dashboard/src/pages/dashboard/OverviewPage.vue`** —
  insert `OpsAtAGlanceStripWidget` immediately after the existing
  `AcquisitionFunnelStripWidget` mount point. No other Overview
  surface changed; existing flow (`VisionCard` → `GovernanceKpiStrip`
  → page-header → since-you-last-looked → mock-KPI-strip →
  `DailyExecutionPanel` → `GovernanceThroughputWidget` +
  `StatusFeedWidget` → `DauChartWidget` → `AcquisitionFunnelStripWidget`
  → `AlertsPanel`) preserved byte-identical apart from the single
  strip insertion.

### Governance (4 files)

- **`docs/ai/STATUS.md`** — `### WP-204 Executed` block per Definition of Done.
- **`docs/ai/DECISIONS.md`** — D-20401..D-20403 reserved at draft;
  landed Active at execution close (byte-identical to EC §DECISIONS.md
  verbatim block per PS-1 transcription convention established by
  WP-196 / WP-198 / WP-199 / WP-203).
- **`docs/ai/work-packets/WORK_INDEX.md`** — flip WP-204 row to `[x]`
  with completion date.
- **`docs/ai/execution-checklists/EC_INDEX.md`** — flip EC-232 row to `Done`.

## Out of Scope

- **Uptime probe scheduler / vendor cost ingestion / 5xx aggregator
  server endpoints / observability pipeline / migration / PII posture
  decision** — entire **paired server WP** scope (will land as a
  future WP — TBD; tentatively WP-206 if WP-205 stays reserved for
  WP-203's paired server work). WP-204 forward-locks the
  `UptimeProbe` / `ErrorRateSnapshot` / `InfraCostEntry` shapes (so
  that server WP has zero schema ambiguity) but ships no probe code,
  no server code, no real-data wire-up, no migration. The `MOCK`
  freshness badge is the operator's visible signal that this is not
  real data.
- **Per-node infrastructure surfacing** — `ServerNode` (CPU%, mem%,
  uptime seconds, active connections) is already surfaced by the
  existing `SystemHealthPage.vue` DataTable + `ServerStatusWidget.vue`.
  WP-204 does NOT modify those; per-surface uptime (this WP) is a
  distinct concern from per-node infrastructure detail.
- **Alerts panel changes** — `AlertsPanel.vue` already exists and
  surfaces `AlertItem[]`. WP-204 does NOT modify it. `ErrorRateMonitorWidget`
  is a sibling concern (rate + top signatures), not a replacement.
- **Latency / P50 / P95 percentiles** — distinct concern from error
  rate; per `docs/ops/DASHBOARD-REQUIREMENTS.md` Phase A this is its
  own metric. v1 of the WP-D bucket scopes to uptime + error rate +
  cost; latency widget is a future WP.
- **Real per-vendor budget values** — WP-204 ships placeholder
  values flagged `isMock: true` (mirrors WP-196's
  `revenueDeductions.ts` precedent). Setting real budgets requires
  operator review and a separate D-entry (deferred to a finance-loop
  follow-up WP).
- **Multi-currency cost reporting** — `InfraCostEntry.currency` is
  locked to `'USD'` in v1. EUR / GBP support is a future WP if a
  vendor bills in another currency.
- **Public-status-page generation** — the dashboard surfaces ops
  health internally; a public status page (e.g.,
  `status.legendary-arena.com`) is a separate concern not covered
  here.
- **Webhook-failure surfacing** — already owned by WP-196's
  `PaidActionErrorsWidget`. WP-204's `ErrorRateMonitorWidget` is the
  **generalised** sibling and explicitly excludes billing-route 5xx
  from its scope (the future server WP will tag billing-route errors
  separately so the two widgets remain non-overlapping).
- **Tournament-funding cost projection** — out of scope; the
  Tournament Funding Pool is governance-bounded by WP-097 and is not
  an operator-budget surface.
- **A/B test infrastructure / experiment-assignment metrics** —
  separate experimentation surface; not part of v1 ops dashboard.
- **TAM saturation / content-breadth** — WP-E grouping; separate WP.
- **Engine / registry / server / shared-tooling code** — none. Pure
  client-only WP.

---

## Files Expected to Change

### Types contract (1 modified)

1. `apps/dashboard/src/types/index.ts` — **modified** — append 3 new
   interfaces (`UptimeProbe`, `ErrorRateSnapshot` + sub-interface
   `ErrorSignature`, `InfraCostEntry`), 3 closed unions
   (`PublicSurfaceKey`, `UptimeStatus`, `InfraCostVendor`), and 3
   drift-pinned canonical readonly arrays (`PUBLIC_SURFACES`,
   `UPTIME_STATUSES`, `INFRA_COST_VENDORS`) per WP-198's
   `KPI_STATUSES` precedent.

### Cost-budget config (1 new)

2. `apps/dashboard/src/config/infraCostBudgets.ts` — **new** —
   exports `InfraCostBudget` interface + `INFRA_COST_BUDGETS:
   readonly InfraCostBudget[]` (4 entries, one per vendor; all
   `isMock: true`). Mirrors `config/revenueDeductions.ts` precedent.

### Mock service (1 new + 1 modified)

3. `apps/dashboard/src/services/opsHealthMocks.ts` — **new** —
   exports `mockUptimeProbes(range)`, `mockErrorRateSnapshots(range)`,
   `mockInfraCostEntries(range)`. All `ServiceResponse<T>` wrapped
   with `source: 'MOCK'`. Determinism via `hashRange(range)` seed
   per D-19605.
4. `apps/dashboard/src/services/mocks.ts` — **modified** — append
   re-exports of the 3 new mock factories TWICE per WP-203 D-20302
   sub-rule: once under `mockX` name (for tests) and once aliased
   to `fetchX` name (for widgets — preserves widget byte-identity
   across MOCK → LIVE flip).

### Composables (3 new + 3 tests = 6 new)

5. `apps/dashboard/src/composables/usePublicSurfaceHealth.ts` —
   **new** — per-surface uptime mean + worst-surface selection +
   last-incident timestamps.
6. `apps/dashboard/src/composables/usePublicSurfaceHealth.test.ts` —
   **new** — ≥ 7 tests (per-surface mean uptime; worst-surface
   selection w/ canonical-order tie-break; empty input returns null
   worst-surface; last-incident `null` when no incidents;
   **source/updatedAt passthrough per §Composable Source Contract**;
   **series sorted ascending by `date` via Unicode code-unit
   comparison per §Aggregation rule**; **mock-output-is-pure-function
   determinism** — call `mockUptimeProbes(range)` twice with
   identical input and assert deep equality).
7. `apps/dashboard/src/composables/useErrorRateMonitor.ts` — **new**
   — current rate + rolling rate + totals + cross-range top-5
   signature aggregation.
8. `apps/dashboard/src/composables/useErrorRateMonitor.test.ts` —
   **new** — ≥ 7 tests (current rate selection by latest `date`;
   rolling daily rate equal-weighted mean; zero-request safety
   returns `0` (NOT `NaN`); cross-range signature aggregation
   merges identical signatures; tie-break by signature ascending
   when counts equal; **source/updatedAt passthrough**;
   **deterministic top-5 selection across two runs**).
9. `apps/dashboard/src/composables/useInfraCostWatchdog.ts` — **new**
   — per-vendor MTD + EOM projection + status via
   `computeKpiStatus()`.
10. `apps/dashboard/src/composables/useInfraCostWatchdog.test.ts` —
    **new** — ≥ 7 tests (per-vendor MTD sum; EOM projection
    formula; status mapping via `computeKpiStatus()` matches WP-198
    helper semantics — direction `'lower-is-better'`; total utilization ratio;
    zero-mtd vendor renders as `0` (NOT null) per D-19908; date
    math from latest entry (NOT `Date.now()`) — assert the
    composable is a pure function of inputs by calling with
    identical args at two different wall-clock instants and
    asserting deep equality; **source/updatedAt passthrough**).

### Widgets (4 new)

11. `apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue` —
    **new** — 4-state Widget Contract; per-surface table +
    sparkline.
12. `apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue` —
    **new** — 4-state Widget Contract; current + 24h rate +
    sparkline + top-5 signature table.
13. `apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue` —
    **new** — 4-state Widget Contract; 4-card grid (one per
    vendor) + status chips.
14. `apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue` —
    **new** — compact horizontal strip; 3 cards + "View system
    health →" link to `/system`.

### Drift test (1 new)

15. `apps/dashboard/src/utils/opsTaxonomy.test.ts` — **new** —
    bidirectional drift assertions: `PUBLIC_SURFACES` ↔
    `PublicSurfaceKey` union; `UPTIME_STATUSES` ↔ `UptimeStatus`
    union; `INFRA_COST_VENDORS` ↔ `InfraCostVendor` union. Mirrors
    `apps/dashboard/src/utils/kpiStatus.test.ts` (WP-198 precedent)
    + `funnelTaxonomy.test.ts` (WP-203 precedent).

### Page wiring (2 modified)

16. `apps/dashboard/src/pages/system/SystemHealthPage.vue` —
    **modified** — insert the 3 new full widgets in vertical layout
    ABOVE the existing `DataTable<ServerNode>`. Use `useDateRange`
    for all three. Pass `INFRA_COST_BUDGETS` to `InfraCostWatchdogWidget`.
    Existing DataTable preserved byte-identical.
17. `apps/dashboard/src/pages/dashboard/OverviewPage.vue` —
    **modified** — insert `OpsAtAGlanceStripWidget` after the
    existing `AcquisitionFunnelStripWidget` mount point. No other
    layout change.

### Governance (4 modified)

18. `docs/ai/STATUS.md` — **modified** — `### WP-204 Executed` block.
19. `docs/ai/DECISIONS.md` — **modified** — D-20401..D-20403
    (proposed → Active at execution close per
    WP-196/198/199/203 verbatim-transcription PS-1 convention).
20. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-204
    row `[x]`.
21. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** —
    EC-232 row Done.

**Total: 21 files** (15 new + 2 modified source + 4 governance).

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
- No `Math.random()` in widget or composable source (mock data may
  use it inside `opsHealthMocks.ts` only — same scope rule as
  `services/mocks.ts`'s existing `randomBetween` and WP-203
  `analyticsMocks.ts` precedent).
- No `Date.now()` in widget or composable source apart from
  `ServiceResponse.updatedAt` population (already established
  pattern in `wrapMock`). `useInfraCostWatchdog` derives `dayOfMonth`
  / `daysInMonth` from the entries' `date` strings, NOT from the
  system clock.
- No `boardgame.io` import; no
  `@legendary-arena/{game-engine,registry,preplan,server}` import
  anywhere in `apps/dashboard/src/`.
- No new npm dependencies.
- No hex color literals in widget source — PrimeVue / Aura tokens
  only (WP-162 / WP-196 / WP-198 / WP-203 precedent).
- No `localeCompare` for ordering — Unicode code-unit comparator
  (per D-19605 + D-19904 + D-20301 carry-forward).

**Packet-specific:**

- **All v1 data is mock.** Every value displayed by every widget is
  sourced from `services/opsHealthMocks.ts`. Every widget carries
  `source: 'MOCK'` freshness badge. Any widget that fetches non-mock
  data is a scope violation and a HARD FAIL.
- **Forward-locked envelopes (D-20401).** The `UptimeProbe`
  (6 fields), `ErrorRateSnapshot` (6 fields), `ErrorSignature`
  (4 fields), and `InfraCostEntry` (4 fields) interface shapes are
  locked at WP-204 drafting time; the paired server WP consumes
  these shapes verbatim — no widening, no narrowing, no rename.
  Future per-surface / per-vendor / per-error metadata (e.g.,
  region, incident ticket id, vendor-internal SKU) rides on a
  follow-up extension WP if needed — the envelope shape is closed
  for v1.
- **Single-currency lock (D-20401).** `InfraCostEntry.currency` is
  locked to the literal `'USD'`. The widget renders amounts in USD;
  multi-currency display is a future WP.
- **Placeholder budget values flagged `isMock: true` (D-20403).**
  `INFRA_COST_BUDGETS` ships with operator-supplied placeholder
  monthly budgets per vendor. The `isMock: true` flag is the source
  of truth for the widget's MOCK badge label (mirrors WP-196
  `revenueDeductions.ts` precedent — setting real budgets requires
  finance review and a separate D-entry; deferred to a future WP).
  `toleranceRatio` (uniform `0.20` across vendors in v1) is locked
  at the WP-204 drafting time and DO NOT vary per vendor (per-vendor
  override is a future WP if operator-led tuning surfaces a need).
- **Composable Source Contract (hard — carry-forward from WP-203).**
  Every ops composable accepts a getter of shape
  `() => ServiceResponse<readonly T[]>` (extends D-19607 Shared
  Source Contract pattern). The composable is responsible for
  reading `.data` for its derivations but MUST preserve `.source`
  and `.updatedAt` in its returned object so the widget can wire
  freshness display via `useDataFreshness` without re-importing the
  service layer. The MOCK → LIVE swap is a pure getter substitution
  at the paired server WP — widget files stay byte-identical.
- **Aggregation rule (locked — mirrors WP-203 §Aggregation rule).**
  - `UptimeProbe[]`, `ErrorRateSnapshot[]`, and `InfraCostEntry[]`
    series are **per-day discrete entries** (NOT cumulative). Each
    `date` represents a closed daily UTC bucket via `normalizeRange`
    (D-19605 carry-forward).
  - Series MUST be sorted **ascending** by `date` using Unicode
    code-unit comparison (no `localeCompare`).
  - Composables MUST iterate `PUBLIC_SURFACES` / `INFRA_COST_VENDORS`
    in canonical-array order when assembling per-surface / per-vendor
    outputs (object-key insertion order is observable in Vue
    templates and downstream chart configs).
- **Cost math invariants (locked — extends D-19601 integer-cents
  discipline).**
  - All amounts are stored as integer cents in `InfraCostEntry.amountCents`
    and `InfraCostBudget.monthlyBudgetCents`.
  - Display formatting converts to USD via
    `(cents / 100).toFixed(2)` — applied at the widget render
    boundary, never inside the composable.
  - Utilization ratio = `mtdCents / monthlyBudgetCents`;
    zero-denominator returns `0`, never `NaN`.
  - EOM projection = `Math.round(mtdCents * daysInMonth / dayOfMonth)`
    (integer cents preserved; rounded to nearest cent — banker's
    rounding NOT required; standard `Math.round` is sufficient
    because cents are integers and `daysInMonth / dayOfMonth` is
    bounded between `[1, 31]`).
- **Latest-entry selection (locked shared pattern).**
  - The "latest" entry across any composable is defined as the
    entry with the lexicographically greatest `date` string
    (`YYYY-MM-DD`) under Unicode code-unit comparison.
  - No timestamp comparison is allowed for latest-entry selection
    — no `Date.now()`, no `Date.parse()`, no `new Date(str)`, no
    `performance.now()`. The closed sort is on the string only.
  - This pattern applies uniformly across `useErrorRateMonitor`
    (current snapshot), `useInfraCostWatchdog` (date-math anchor),
    and any future ops composable that needs an "as-of" reference.
- **Error rate math invariants (locked).**
  - `ErrorRateSnapshot.errorRate` is a decimal fraction (0.012 =
    1.2%), NOT a percentage; display formatting applies
    `Math.round(rate * 1000) / 10` for 1-decimal percentages (per
    D-19601 carry-forward) at the widget render boundary.
  - Zero-`totalRequests` snapshots return `errorRate = 0` (not
    `NaN`).
  - Top-5 signature ordering: primary key `count` descending;
    tiebreak `signature` ascending via Unicode code-unit comparison.
  - **"Current" snapshot selection (locked — closed window-size
    discipline).**
    - "Current 1h rate" is the `ErrorRateSnapshot` entry whose
      `windowSeconds = 3600` AND whose `date` is the
      lexicographically greatest entry among `windowSeconds = 3600`
      entries (per §Latest-entry selection).
    - "Rolling 24h rate" is computed ONLY from entries with
      `windowSeconds = 86400`.
    - **Mixed-window aggregation is forbidden.** A composable
      derivation that pulls both `3600` and `86400` rows into the
      same sum / mean / rate calculation is a HARD FAIL — the two
      bucket sizes are not commensurable without rescaling, and
      v1 does not rescale.
    - `series` returned to the widget is the full unfiltered list
      (both window sizes present); the composable provides
      pre-filtered derivations (`currentRate` filters to `3600`;
      `rollingDailyRate` filters to `86400`) so the widget never
      has to know the filter rule.
- **Uptime math invariants (locked).**
  - `UptimeProbe.uptimePercent` is a 0-100 value with 1-decimal
    precision (e.g., 99.7), NOT a 0-1 fraction.
  - Mean uptime across daily probes is `arithmeticMean(uptimePercents)`
    rounded to 1 decimal via `Math.round(value * 10) / 10` at the
    composable boundary.
  - **Missing-days exclusion (locked).** Days inside the selected
    range that have NO `UptimeProbe` entry for a given surface are
    **excluded** from that surface's mean calculation — they MUST
    NOT be treated as `uptimePercent: 0` and MUST NOT be treated
    as `uptimePercent: 100`. The mean denominator is "number of
    days with probes for this surface", not "number of days in
    the range". A surface with one probe at 99.5 over a 30-day
    range reports `mean = 99.5`, NOT `mean = 3.3` (zero-fill bias)
    NOT `mean = ~99.98` (perfect-fill bias).
  - Status `'down'` for a daily probe does NOT special-case the
    uptime value (a daily-rolled probe MAY have `status: 'down'`
    AND `uptimePercent: 92.0` if it spent some of the day down and
    some up).
- **Retention of pre-existing surface (hard).** WP-204 does NOT
  modify `ServerStatusWidget.vue`, `AlertsPanel.vue`,
  `MatchesRunningWidget.vue`, the existing `DataTable<ServerNode>`
  on `SystemHealthPage.vue`, or any of the WP-196 / WP-198 / WP-199 /
  WP-203 widgets. Additive-only on both Overview and SystemHealth.
- **Mock value bounds (locked — keeps mocks operationally
  plausible).** Even with deterministic seeding, the mock factories
  MUST emit values inside the locked ranges below so the operator's
  iteration on widget layout reflects realistic ops scenarios (not
  visual noise from out-of-band values):
  - `UptimeProbe.uptimePercent` ∈ `[95.0, 100.0]` for every
    surface on every day. (Real operator vendors typically stay
    above 99%; the floor at 95 lets the operator see what a
    degraded day looks like in the widget without exercising
    pathological cases.)
  - `ErrorRateSnapshot.errorRate` ∈ `[0, 0.05]` (0%-5%).
    `errorCount` and `totalRequests` are non-negative integers
    consistent with the rate.
  - `InfraCostEntry.amountCents` ≥ 0 (non-negative integer cents).
    Per-vendor monthly totals across the mock series MUST stay
    within `[0%, 200%]` of that vendor's `monthlyBudgetCents`
    (the upper bound lets the operator see an `'off-track'`
    status chip in mock output without exercising pathological
    blow-outs).
  - Bounds are invariants of the mock layer; widget / composable
    code MUST NOT clamp values to enforce these ranges. If a
    composable derivation produces an out-of-band value, the
    mock factory is wrong — fix the factory, not the consumer.
- **Mock determinism (D-19605 carries forward) + Determinism scope
  (hard — mirrors WP-203 §Determinism scope).** Same `DateRange`
  input → byte-identical mock output across two consecutive
  composable evaluations. `hashRange(range)` seeds the mock PRNG;
  FNV-1a per D-19605. No bare `Math.random` in composable or widget
  source.
  - **Mock outputs are a pure function of `DateRange`** for all
    three factories. No other external state (system clock, env
    vars, JS engine iteration order, ambient locale, ambient
    timezone) may influence output. `Date.now()` is allowed
    **only** in `wrapMock`'s `updatedAt` population — not in the
    data-shape decisions.
  - **Iteration order MUST be canonical** — assemble per-surface
    outputs by iterating `PUBLIC_SURFACES` in order; assemble
    per-vendor outputs by iterating `INFRA_COST_VENDORS` in order.
    Do NOT iterate `Object.keys()` of a derived object.
  - **`useInfraCostWatchdog` date math** uses the entries' `date`
    string (NOT `Date.now()`) — the composable is a pure function
    of `(entries, budgets)`. A drift test calls the composable with
    identical inputs at two different wall-clock instants and
    asserts deep equality.
- **Empty-state rule (carry-forward from WP-203).** Empty datasets
  MUST NOT render charts with zeroed series. Empty datasets MUST
  render the explicit `empty` arm of the 4-state Widget Contract.
  Per-widget thresholds locked in §Widget Data Requirements.
- **Drift-pinned canonical arrays.** `PUBLIC_SURFACES`,
  `UPTIME_STATUSES`, and `INFRA_COST_VENDORS` are `readonly` arrays
  whose membership is asserted bidirectional-equal to their union
  types in `apps/dashboard/src/utils/opsTaxonomy.test.ts`. Adding
  a 5th surface / 4th status / 5th vendor without updating BOTH the
  union and the array (or vice versa) fails the drift test loudly.
- **Closed-set integer-only rate math (per D-19601 carry-forward).**
  Rates are computed as `numerator / denominator`; the denominator
  is checked for zero BEFORE the division (zero-denominator returns
  `0`, not `NaN`). Display formatting applies `Math.round(rate *
  1000) / 10` for 1-decimal percentages at the widget boundary.
- **4-state Widget Contract enforced structurally.** Every widget
  has exactly one `state` computed + a 4-arm `v-if` template
  (loading / error / empty / data) per WP-196's Widget State Gate
  Pattern (D-19608). Grep gate asserts exactly 1 `v-if="state ===`
  per new widget file.
- **No widget displacement.** WP-204 does NOT remove or hide any
  existing widget on Overview or SystemHealth. Additive-only.
- **Layer boundary.** Zero
  `@legendary-arena/{game-engine,registry,preplan,server}` imports
  anywhere in `apps/dashboard/src/`. Verified by grep gate at close.
- **No new package dependency.** `apps/dashboard/package.json` +
  `pnpm-lock.yaml` zero diff. EChart wrapper, PrimeVue, Pinia — all
  pre-existing.
- **No server-side surface.** `apps/server/src/**` zero diff. No
  `docs/ai/REFERENCE/api-endpoints.md` edit (catalog update is the
  paired server WP's concern; WP-204 forward-locks the contract but
  adds no endpoint).
- **No `.session/` or `docs/ai/invocations/` commit.** Scratchpads
  stay gitignored.

**Session protocol:**

- If `apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue`
  layout conflicts with the existing OverviewPage flow (e.g., breaks
  responsive layout at common viewport widths after both the WP-203
  acquisition strip and the new ops strip are stacked), stop and
  report; do not silently truncate either strip.
- If a Vue 3 / PrimeVue API the WP needs is missing, document the
  gap and stop; do not invent a workaround mid-session.
- If a mock-data shape decision is ambiguous (e.g., should `cards`
  surface have higher or lower mock uptime than `play`), default to
  uniform mock uptime across surfaces (99.0%-99.9% range) and
  document the choice with a `// why:` comment. Real per-surface
  characterisation belongs in the paired server WP.

**Locked contract values:**

```typescript
// types/index.ts additions (verbatim — copy as-is)

export type PublicSurfaceKey = 'marketing' | 'play' | 'cards' | 'api';

export const PUBLIC_SURFACES: readonly PublicSurfaceKey[] = [
  'marketing',
  'play',
  'cards',
  'api',
];

export type UptimeStatus = 'up' | 'degraded' | 'down';

export const UPTIME_STATUSES: readonly UptimeStatus[] = [
  'up',
  'degraded',
  'down',
];

export type InfraCostVendor = 'render' | 'cloudflare' | 'postgres' | 'hanko';

export const INFRA_COST_VENDORS: readonly InfraCostVendor[] = [
  'render',
  'cloudflare',
  'postgres',
  'hanko',
];

export interface UptimeProbe {
  readonly surface: PublicSurfaceKey;
  readonly date: string;
  readonly status: UptimeStatus;
  readonly uptimePercent: number;
  readonly incidentCount: number;
  readonly lastIncidentTimestamp: number | null;
}

export interface ErrorSignature {
  readonly signature: string;
  readonly count: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

export interface ErrorRateSnapshot {
  readonly date: string;
  readonly windowSeconds: number;
  readonly totalRequests: number;
  readonly errorCount: number;
  readonly errorRate: number;
  readonly topSignatures: readonly ErrorSignature[];
}

export interface InfraCostEntry {
  readonly vendor: InfraCostVendor;
  readonly date: string;
  readonly amountCents: number;
  readonly currency: 'USD';
}
```

**Forward-contract governance clause (locked — D-20401):**

> `UptimeProbe` envelope is closed at 6 fields; `ErrorRateSnapshot`
> envelope is closed at 6 fields with a 4-field `ErrorSignature`
> sub-interface; `InfraCostEntry` envelope is closed at 4 fields with
> `currency` locked to `'USD'`. The paired server WP consumes these
> envelopes verbatim at server-side capture time.

---

## Acceptance Criteria

### Types / Drift

- [ ] `apps/dashboard/src/types/index.ts` carries 3 new interfaces +
  1 new sub-interface + 3 closed unions + 3 drift-pinned canonical
  arrays per §Locked contract values byte-for-byte.
- [ ] **MOCK → LIVE upgrade path verifiable.** The 4 widget files
  have ZERO direct `mockUptimeProbes` / `mockErrorRateSnapshots` /
  `mockInfraCostEntries` call sites — every widget consumes its
  composable, which consumes a getter-function source. When the
  paired server WP wires real endpoints, the getter changes from
  `() => fetchUptimeProbes(range).data` (currently a re-export of
  the mock) to a real `useFetch(...).data.value`; widget files
  are byte-identical pre/post flip. Verified by `grep -rE
  "mockUptimeProbes|mockErrorRateSnapshots|mockInfraCostEntries"
  apps/dashboard/src/widgets/{PublicSurfaceHealth,ErrorRateMonitor,InfraCostWatchdog,OpsAtAGlanceStrip}*.vue`
  returning zero matches.
- [ ] Drift-detection test
  `apps/dashboard/src/utils/opsTaxonomy.test.ts` asserts
  `PUBLIC_SURFACES` ↔ `PublicSurfaceKey` AND `UPTIME_STATUSES` ↔
  `UptimeStatus` AND `INFRA_COST_VENDORS` ↔ `InfraCostVendor`
  bidirectional equality.
- [ ] `InfraCostEntry.currency` field type is exactly `'USD'`
  (literal union, NOT `string`).
- [ ] `INFRA_COST_BUDGETS` has 4 entries, exactly one per vendor in
  canonical `INFRA_COST_VENDORS` order, all with `isMock: true`.

### Behavior / Determinism (composables)

- [ ] **Composable Source Contract.** All 3 composables accept
  `() => ServiceResponse<readonly T[]>` and surface `source` +
  `updatedAt` in their returned object. Verified by type-check +
  test-side assertion that `composable(...).source.value ===
  input.source` for at least one test per composable.
- [ ] **Empty-state test coverage (one per composable).** Each
  composable test suite includes ≥ 1 test named per the locked
  pattern `should_<behavior>_when_<condition>` that exercises
  empty input (`series` = `[]`) and asserts:
  - the composable returns its empty-shape sentinel (per WP-204
    §Scope (In) — Composables: `worstSurface = null` /
    `currentRate = 0` / `mtdByVendor` = empty record over
    canonical vendors with all-zero values / etc.);
  - no field is `NaN` (a dedicated `Number.isNaN(value) === false`
    assertion on every numeric field returned);
  - zero/null semantics match D-19908 carry-forward (numeric `0`
    where zero is meaningful — current rate / per-vendor MTD;
    `null` only where the absence is meaningful — best cohort /
    worst surface).
- [ ] `usePublicSurfaceHealth` `worstSurface` returns `null` for
  empty input; ties broken by canonical `PUBLIC_SURFACES` order.
- [ ] `usePublicSurfaceHealth` `series` is sorted ascending by
  `date` via Unicode code-unit comparison; per-surface assembly
  iterates `PUBLIC_SURFACES` in canonical order.
- [ ] `useErrorRateMonitor` `currentRate` selects the entry with
  the lexicographically-greatest `date` (most-recent under UTC
  `YYYY-MM-DD` lex sort).
- [ ] `useErrorRateMonitor` zero-`totalRequests` snapshots produce
  `errorRate = 0` (not `NaN`); top-5 signature aggregation is
  deterministic (tie-break by signature ascending).
- [ ] `useInfraCostWatchdog` EOM projection uses the formula `mtd *
  daysInMonth / dayOfMonth`; date math derives `dayOfMonth` /
  `daysInMonth` from the latest entry's `date` (NOT `Date.now()`).
  A test asserts the composable returns deep-equal output when
  called with identical inputs at two different wall-clock instants
  (proves no `Date.now()` dependency).
- [ ] `useInfraCostWatchdog` status mapping constructs a
  `KpiSnapshot` per vendor (`target = monthlyBudgetCents`,
  `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`,
  `direction = 'lower-is-better'`) and calls
  `computeKpiStatus(snapshot)` (WP-198 helper); the composable
  asserts that every vendor returns a non-null status (each
  `INFRA_COST_BUDGETS` entry has a target by construction; `null`
  → HARD FAIL). Zero-mtd vendors render with `mtdCents: 0`, not
  `null` (D-19908 numeric-zero carry-forward).
- [ ] **Window-size discipline (`useErrorRateMonitor`).**
  `currentRate` filters to `windowSeconds = 3600` only;
  `rollingDailyRate` filters to `windowSeconds = 86400` only;
  mixed-window aggregation produces a dedicated test failure (a
  synthetic input containing both window sizes asserts the two
  derivations operate on disjoint subsets).
- [ ] **Missing-days exclusion (`usePublicSurfaceHealth`).** A
  test passes a 30-day `DateRange` with only 3 probes for one
  surface and asserts that the mean over those 3 probes equals
  the arithmetic mean of their `uptimePercent` values (NOT a
  zero-filled denominator-30 mean and NOT a 100-filled
  denominator-30 mean).
- [ ] Mock determinism: each composable produces byte-identical
  output for the same `DateRange` input across two consecutive
  evaluations (FNV-1a seed via `hashRange`).
- [ ] **Mock value bounds enforced at the factory boundary.** A
  test inspecting `mockUptimeProbes` output asserts every
  `uptimePercent` ∈ `[95.0, 100.0]`; for `mockErrorRateSnapshots`,
  every `errorRate` ∈ `[0, 0.05]`; for `mockInfraCostEntries`,
  every `amountCents >= 0` AND the per-vendor monthly sum is
  ≤ 200% of the corresponding `monthlyBudgetCents` from
  `INFRA_COST_BUDGETS`.

### Data / Mock

- [ ] `opsHealthMocks.ts` exports exactly 3 factory functions, each
  returning `ServiceResponse<T>` with `source: 'MOCK'` and
  `updatedAt: Date.now()`.
- [ ] `services/mocks.ts` re-exports all 3 mock factories TWICE
  (once under `mockX` name, once under `fetchX` alias).
- [ ] No bare `Math.random` call site in any of the 3 composables
  or 4 widgets (grep gate; `Math.random` only allowed inside
  `opsHealthMocks.ts`).
- [ ] No production data accessed by any widget (every widget
  surfaces `MOCK` freshness badge).

### Widgets / Layout

- [ ] 4 new widgets each have exactly 1 `v-if="state ===` match
  (Widget State Gate Pattern; verified per file).
- [ ] Zero hex color literals (`#[0-9a-fA-F]{3,8}`) in any of the
  4 new widget files.
- [ ] `SystemHealthPage.vue` renders the 3 full widgets in vertical
  order ABOVE the existing `DataTable<ServerNode>`:
  PublicSurfaceHealth → ErrorRateMonitor → InfraCostWatchdog →
  DataTable. Existing DataTable JSX preserved byte-identical (grep
  shows `fetchServerNodes` call site unchanged).
- [ ] `OverviewPage.vue` renders `OpsAtAGlanceStripWidget` exactly
  once, positioned immediately after `AcquisitionFunnelStripWidget`.
- [ ] All 4 widgets carry required attributes: `data-testid=...`,
  `aria-label=...` (per Vision §17 accessibility).
- [ ] `OpsAtAGlanceStripWidget` "View system health →" link routes
  to `/system` via `useRouter().push('/system')` or `<router-link
  to="/system">` — verified by grep.
- [ ] `ServerStatusWidget.vue`, `AlertsPanel.vue`, and the existing
  `DataTable<ServerNode>` on `SystemHealthPage.vue` are not
  modified — `git diff` for those file paths is empty.

### Build / Test / Layer

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 with
  **≥ 21 net new tests** (≥ 7 per composable × 3 composables).
  Baseline per the post-WP-203 dashboard test count.
- [ ] **Test naming pattern.** Every net-new test name follows
  the locked pattern `should_<behavior>_when_<condition>` (e.g.,
  `should_return_zero_currentRate_when_series_is_empty`,
  `should_iterate_PUBLIC_SURFACES_in_canonical_order_when_assembling_uptime_map`).
  Improves audit readability + makes failures self-describing in
  CI output.
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
grep -nE "PublicSurfaceKey|PUBLIC_SURFACES|UptimeStatus|UPTIME_STATUSES|InfraCostVendor|INFRA_COST_VENDORS|UptimeProbe|ErrorRateSnapshot|ErrorSignature|InfraCostEntry" apps/dashboard/src/types/index.ts
# Expected: matches across the 3 interfaces + 1 sub-interface + 3 unions + 3 canonical arrays.

# Drift-test exists and asserts bidirectional
grep -nE "PUBLIC_SURFACES|UPTIME_STATUSES|INFRA_COST_VENDORS" apps/dashboard/src/utils/opsTaxonomy.test.ts
# Expected: all three arrays asserted; test passes.

# Budget config presence
grep -nE "INFRA_COST_BUDGETS|InfraCostBudget|isMock" apps/dashboard/src/config/infraCostBudgets.ts
# Expected: matches; all 4 entries flagged isMock: true.

# Mock determinism source
grep -nE "hashRange|wrapMock" apps/dashboard/src/services/opsHealthMocks.ts
# Expected: hashRange seeded mock; wrapMock used per factory.

# No bare Math.random in widgets or composables
grep -rnE "Math\.random" apps/dashboard/src/widgets/ apps/dashboard/src/composables/usePublicSurfaceHealth.ts apps/dashboard/src/composables/useErrorRateMonitor.ts apps/dashboard/src/composables/useInfraCostWatchdog.ts
# Expected: zero matches. (Math.random only allowed inside opsHealthMocks.ts — see D-20401.)

# Canonical iteration enforcement — forbid Object.keys over derived per-vendor / per-surface maps
grep -rnE "Object\.keys\(mtdByVendor|Object\.keys\(uptimeBySurface|Object\.keys\(statusByVendor|Object\.keys\(projectedEomByVendor|Object\.keys\(lastIncidentBySurface" apps/dashboard/src/
# Expected: zero matches. (Iterate PUBLIC_SURFACES / INFRA_COST_VENDORS in canonical order instead.)

# Latest-entry selection — forbid Date.parse / new Date(string) / Date.now()-based "latest" selection in composables
grep -rnE "Date\.parse|new Date\(|performance\.now|Date\.now" apps/dashboard/src/composables/usePublicSurfaceHealth.ts apps/dashboard/src/composables/useErrorRateMonitor.ts apps/dashboard/src/composables/useInfraCostWatchdog.ts
# Expected: zero matches. (Latest-entry selection sorts on YYYY-MM-DD string only; date math derives from latest entry's date string.)

# Widget State Gate Pattern — exactly 1 match per new widget
grep -cE 'v-if="state ===' apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue
# Expected: 1 per file.

# Zero hex colors in new widgets
grep -rnE '#[0-9a-fA-F]{3,8}' apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue
# Expected: zero matches.

# Layer boundary
grep -rnE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/
# Expected: zero matches.

# No-new-deps + no-server-edits + no-engine-edits gates
git diff --stat apps/dashboard/package.json pnpm-lock.yaml
git diff --name-only apps/server/ data/migrations/ docs/ai/REFERENCE/api-endpoints.md packages/
# Expected: all empty.

# Strip widget link routes to /system
grep -nE "'/system'|to=\"/system\"|push\('/system'\)" apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue
# Expected: at least 1 match.

# Pre-existing surfaces unchanged
git diff --name-only apps/dashboard/src/widgets/ServerStatusWidget.vue apps/dashboard/src/widgets/AlertsPanel.vue
# Expected: empty.

# Full monorepo build
pnpm -r build
```

Expected: every grep returns the documented count; type-contract
fields present byte-identical to §Locked contract values; drift
test passes; build + test exit 0.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-204 Executed` block (4 new
  widgets + 3 new composables + 1 new mock service + 1 new
  budget-config file + 1 new drift test + page wiring on both
  Overview and SystemHealth; forward-locked `UptimeProbe` /
  `ErrorRateSnapshot` / `InfraCostEntry` envelopes for the paired
  server WP; MOCK freshness badge on all 4 widgets per WP-197
  D-19702; placeholder budget values flagged `isMock: true` per
  D-20403; real per-vendor budget values deferred to a follow-up
  finance-loop WP).
- [ ] `docs/ai/DECISIONS.md` has D-20401..D-20403 (proposed):
  - **D-20401** — `UptimeProbe` (6 fields), `ErrorRateSnapshot` (6
    fields), `ErrorSignature` (4 fields), and `InfraCostEntry`
    (4 fields, `currency` locked to `'USD'`) envelopes locked at
    WP-204 drafting time; paired server WP consumes verbatim.
    Future per-surface / per-vendor / per-error metadata rides on a
    follow-up extension WP if needed; v1 envelope shape is closed.
  - **D-20402** — Mock-mode-first per WP-197 D-19702 carries forward
    to WP-204. All 4 widgets ship `MOCK` freshness badge; flip to
    `LIVE` when the paired server WP wires real-data endpoints (no
    widget-side change needed at flip time — `services/mocks.ts`
    swaps its `fetchX` re-exports behind the same `(range) =>
    ServiceResponse<readonly T[]>` signature).
  - **D-20403** — Per-vendor monthly budget values are placeholder
    in v1 (`isMock: true`); `toleranceRatio` (uniform `0.20` across
    vendors) is locked at WP-204 drafting time. With
    `direction: 'lower-is-better'`, this means: `mtd <= budget` →
    `'on-track'`; `budget < mtd <= budget * 1.20` →
    `'needs-attention'`; `mtd > budget * 1.20` → `'off-track'`.
    Setting real per-vendor budgets and tuning the tolerance band
    requires operator review and a separate follow-up WP (mirrors
    WP-196's `revenueDeductions.ts` deferral pattern). Status enum
    matches WP-198 `KpiStatus` verbatim — no fork.
- [ ] `WORK_INDEX.md`: WP-204 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-232 row Done.
- [ ] No **source** file outside the 21-file §Files Expected to Change
  list was modified. Toolchain-generated metadata (lockfiles, IDE
  caches) review-and-revert unless explicitly required.

---

## Vision Alignment

**Vision clauses touched:** §3 (Trust & Fairness — operator-internal
surface; no public-facing impact), §17 (Accessibility —
text-label-first chips on uptime / cost / error status; color
decorative), Financial Sustainability (per-vendor cost watchdog is
the operator's tool for keeping infra spend aligned with the
covenant's break-even discipline).

**Conflict assertion:** `No conflict: this WP preserves all touched
clauses.` Operator-internal surface; no public-facing affordance
modified; accessibility chips follow the WP-198 / WP-199 / WP-203
text-label-first precedent (color is decorative; the label / number
is the load-bearing display); cost watchdog directly supports the
Financial Sustainability covenant by surfacing infrastructure-spend
drift before it accumulates.

**Non-Goal proximity check:** `N/A — WP touches no monetization or
competitive surface.` Cost watchdog observes operator infrastructure
spend; it does NOT touch revenue, royalty, or any NG-1..7
monetization boundary. Public-surface health observes externally-
reachable domains; it does NOT add any public-facing affordance.

**Determinism preservation:** `N/A — WP touches no scoring, replay,
RNG, or simulation surface.` Mock data uses `hashRange`-seeded
deterministic PRNG (D-19605 carry-forward) so the same DateRange
produces the same mock series across renders — this is for operator
UX (no flicker on date-range change), not for game determinism.

---

## Funding Surface Gate

N/A — dashboard ops WP; no §20.1 trigger surface touched (no
navigation funding affordance, no registry-viewer surface, no
profile attribution, no user-visible donate copy). The dashboard is
single-operator per WP-197; not a public surface. The cost watchdog
observes per-vendor infrastructure spend (Render / Cloudflare /
Postgres / Hanko), NOT tournament funding pool deposits or
withdrawals — those are governed by WP-097 and are out of scope.

---

## API Catalog Update

N/A — no HTTP endpoints or `apps/server/src/**` library functions
added/modified/removed. The forward-locked `UptimeProbe` /
`ErrorRateSnapshot` / `InfraCostEntry` envelopes are type contracts
under `apps/dashboard/src/types/`, not HTTP endpoints. The paired
server WP (TBD; tentatively WP-206 unless WP-205 ordering shifts)
will add the actual uptime / error / cost telemetry endpoints and
update the catalog at that point.

---

## Anti-Patterns to Avoid

- Do NOT add `LIVE` data fetching in any widget — every widget reads
  from `opsHealthMocks.ts` via the `fetchX` aliases; flipping to
  `LIVE` is the paired server WP's concern.
- Do NOT compute uptime / error rate / cost utilization without
  zero-denominator guards (`NaN`% surfaces in the widget are a
  visible failure mode).
- Do NOT pull `Date.now()` inside `useInfraCostWatchdog` — derive
  `dayOfMonth` / `daysInMonth` from the latest entry's `date` so
  the composable is a pure function of inputs (determinism scope
  hard requirement).
- Do NOT extend `ServerNode.status` or merge it with `UptimeStatus`
  — they are distinct interfaces (per-node vs per-surface). Drift
  test catches mistaken bidirectional coupling.
- Do NOT add a server endpoint or SQL query "just to make it work"
  — WP-204 is mock-mode-first by contract.
- Do NOT add a new npm dependency for charting / table rendering —
  use the existing EChart wrapper + PrimeVue DataTable.
- Do NOT modify `ServerStatusWidget.vue` or `AlertsPanel.vue` —
  they are sibling surfaces. The new `ErrorRateMonitorWidget` and
  `PublicSurfaceHealthWidget` are additive.
- Do NOT use color as the sole signal in the uptime status chip or
  the cost-watchdog status — text-label-first per Vision §17.
- Do NOT introduce a 5th `PublicSurfaceKey` (e.g., `'wiki'`,
  `'legends'`) without updating both the union and `PUBLIC_SURFACES`
  in the same edit — drift test will fail loudly. Same for vendors
  and statuses.
- Do NOT recompute the same series in two places — if both Overview
  strip and SystemHealthPage need `UptimeProbe[]`, they both call
  `usePublicSurfaceHealth` (with their own `DateRange` ref); the
  composable is the single source of truth.
- Do NOT hard-code `INFRA_COST_BUDGETS` values inside the
  composable or widget — the budget config is injected via
  `config/infraCostBudgets.ts` so a future finance-review WP can
  flip the placeholder values without touching the composable or
  widget code.
- Do NOT pass a bare `() => readonly T[]` getter into the composables
  — the contract is `() => ServiceResponse<readonly T[]>` (per
  §Composable Source Contract). Stripping the `ServiceResponse`
  envelope at the composable boundary loses the `source` label and
  breaks the MOCK → LIVE swap symmetry that the paired server WP
  depends on.
- Do NOT iterate `Object.keys(mtdByVendor)` (or any derived object)
  when rendering per-vendor output — iterate the drift-pinned
  canonical array (`INFRA_COST_VENDORS`) instead. Object-key
  iteration order is observable in templates and varies across
  runtimes.
- Do NOT use `localeCompare` to sort the daily series by date — use
  Unicode code-unit comparison per §Aggregation rule.
- Do NOT add a new `InfraCostEntry.currency` value (e.g., `'EUR'`,
  `'GBP'`) — the literal-union lock to `'USD'` is intentional for
  v1 (D-20401). Multi-currency is a future WP.
- Do NOT split billing-route 5xx into the new
  `ErrorRateMonitorWidget` — that's WP-196's `PaidActionErrorsWidget`
  scope. The two widgets remain non-overlapping; the paired server
  WP will tag billing-route errors separately so the rate the
  general monitor reports excludes billing 5xx.
- Do NOT render zero-percent / zero-dollar values as `0%` / `$0` in
  the Overview strip when underlying data is empty — render `"—"`
  placeholder instead per §Widget Data Requirements
  `OpsAtAGlanceStripWidget` empty-partial rule.
- Do NOT render an empty chart with zeroed series or a degenerate
  axis when the underlying dataset is empty — drop the widget to
  the explicit `empty` arm of the 4-state Widget Contract per
  §Empty-state rule.
- Do NOT mix `windowSeconds = 3600` and `windowSeconds = 86400`
  entries inside the same sum / mean / rate calculation in
  `useErrorRateMonitor` — the two bucket sizes are not
  commensurable without rescaling, and v1 does not rescale.
  Filter to one window size per derivation per §"Current"
  snapshot selection lock.
- Do NOT zero-fill missing days when computing
  `usePublicSurfaceHealth` mean uptime — exclude missing days
  from the denominator per §Uptime math invariants Missing-days
  exclusion lock. Zero-fill biases mean uptime artificially low;
  100-fill biases it artificially high; both produce misleading
  operator displays under sparse-data conditions.
- Do NOT read another widget's computed state or sibling
  component instance for derivation — each widget calls its own
  composable per §No cross-widget composable coupling. Cross-widget
  reads turn the widget tree into a graph and make future
  refactors expensive.
- Do NOT clamp mock values inside the composable or widget to
  satisfy §Mock value bounds — bounds are an invariant of the
  mock factory only; if a derivation produces an out-of-band
  value, fix the factory, not the consumer.
- Do NOT iterate `Object.keys(mtdByVendor)` / `Object.keys(uptimeBySurface)`
  / `Object.keys(statusByVendor)` / `Object.keys(projectedEomByVendor)`
  / `Object.keys(lastIncidentBySurface)` in any composable or
  widget — iterate the canonical drift-pinned array
  (`INFRA_COST_VENDORS` / `PUBLIC_SURFACES`) instead. The
  Verification Step grep enforces this mechanically.
- Do NOT use `Date.parse(...)` / `new Date(dateString)` /
  `performance.now()` in any composable for latest-entry
  selection or date math — sort on the `YYYY-MM-DD` string under
  Unicode code-unit comparison per §Latest-entry selection.
  Parsing to `Date` objects re-introduces timezone / locale
  dependence the locked pattern is designed to eliminate.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph + user-visible outcome | ✅ (operator sees 3 ops widgets + 1 Overview strip) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-157/162/196/197/198/199/203 all ✅; 19 widgets + 12 composables verified against `main @ a9c4696`) |
| 3 | Context (Read First) specific (paths + section refs + D-entry refs) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ (Out of Scope enumerates 11 distinct deferrals) |
| 5 | Files Expected to Change matches contract | ✅ (21 files: 15 new + 2 modified source + 4 governance; WP-203 file-count precedent) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ (5-heading grouping per WP-203 precedent) |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — client-only; no engine/registry/server | ✅ (no `@legendary-arena/*` imports; grep gate at close) |
| 11 | Identity model — N/A (no auth surface touched) | N/A — operator-internal, no auth flow added |
| 12 | Test rules — `node:test`; ≥ 21 net-new tests; no boardgame.io import | ✅ |
| 13 | pnpm/node commands only; expected output shown | ✅ |
| 14 | Acceptance criteria binary + specific | ✅ (5-heading grouping; binary checks; specific tokens) |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/scope-bound | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing | ✅ |
| 17 | Vision Alignment present; clauses §3 / §17 / Financial Sustainability | ✅ |
| 18 | Prose-vs-grep: verification greps scoped to file/path/token; D-entries cited where forbidden tokens discussed | ✅ |
| 19 | Bridge-vs-HEAD staleness | N/A |
| 20 | Funding surface N/A with justification | ✅ (dashboard ops; cost watchdog observes infra vendors, not tournament funding; operator-only single-operator surface; no funding affordance) |
| 21 | API catalog N/A with justification | ✅ (no HTTP endpoint; forward-contract is a type contract; paired server WP will update the catalog at endpoint-add time) |

---

*Drafted: 2026-06-03. Baseline `origin/main @ a9c4696` (post-WP-203
close). WP-D of the operator-dashboard pre-mortem grouping (WP-196
§Future Work). Closest precedent: WP-203 (mock-mode-first dashboard
surface with forward server contract; 3 full + 1 strip widget
structure). Reserves D-20401 (UptimeProbe / ErrorRateSnapshot /
ErrorSignature / InfraCostEntry envelopes locked), D-20402
(mock-mode-first carries forward), D-20403 (placeholder budget
values flagged `isMock: true`; real values deferred to a future
finance-loop WP). Hard-deps: WP-157 ✅, WP-162 ✅, WP-196 ✅,
WP-197 ✅, WP-198 ✅, WP-199 ✅, WP-203 ✅ — all landed. Paired
server WP (TBD; tentatively WP-206 unless WP-205 ordering shifts —
WP-205 currently reserved for WP-203's `analytics_events` server
companion). WP-E (TAM saturation + content breadth) remains in the
backlog separately.*
