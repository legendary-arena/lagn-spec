# EC-232 — Dashboard Public-Surface Health + Error Monitor + Cost Watchdog (Execution Checklist)

**Source:** docs/ai/work-packets/WP-204-dashboard-public-surface-health-error-monitor-cost-watchdog.md
**Layer:** Client — `apps/dashboard/` (no engine / registry / server / shared-tooling code; no migrations)

> **Use the locked values, constraints, and rationale from WP-204
> verbatim. EC-232 is the operational order + gates + failure smells;
> it does NOT supersede the WP. If EC-232 and WP-204 conflict on
> requirements, WP-204 wins.**

## Execution Order (Locked)

1. **Sub-task A — Types contract + budget config + drift test (foundation)**
   - Append the 3 interfaces (`UptimeProbe`, `ErrorRateSnapshot`,
     `InfraCostEntry`) + 1 sub-interface (`ErrorSignature`) + 3 closed
     unions (`PublicSurfaceKey`, `UptimeStatus`, `InfraCostVendor`) +
     3 canonical arrays (`PUBLIC_SURFACES`, `UPTIME_STATUSES`,
     `INFRA_COST_VENDORS`) to `types/index.ts` per WP-204 §Locked
     contract values byte-for-byte.
   - Add `config/infraCostBudgets.ts` with `InfraCostBudget` interface
     + `INFRA_COST_BUDGETS` readonly array (4 entries; all
     `isMock: true`) per WP-204 §Scope (In) → Cost-budget config.
   - Add `utils/opsTaxonomy.test.ts` with bidirectional drift
     assertions for all three union ↔ array pairs.
   - Gate: `pnpm --filter @legendary-arena/dashboard build` exits 0;
     drift test passes.

2. **Sub-task B — Mock service + composables**
   - New `services/opsHealthMocks.ts` (3 factories,
     `hashRange`-seeded determinism, `wrapMock<T>` per existing
     precedent).
   - Re-exports added to `services/mocks.ts` **TWICE per factory**
     per WP-204 §Files Expected to Change item 4: once under
     `mockX` name (for tests) and once under `fetchX` alias (for
     widgets — preserves widget byte-identity across MOCK → LIVE
     flip per D-20402 sub-rule carried forward from WP-203 D-20302).
   - 3 new composables (`usePublicSurfaceHealth`,
     `useErrorRateMonitor`, `useInfraCostWatchdog`) + 3 test files
     (≥ 7 tests each = ≥ 21 net-new tests). `useInfraCostWatchdog`
     additionally accepts a `budgets: readonly InfraCostBudget[]`
     argument (injected by the caller — does NOT reach into the
     config module itself) and reuses `computeKpiStatus()` (WP-198
     helper) **verbatim** for status mapping by constructing a
     `KpiSnapshot` per vendor (`direction: 'lower-is-better'`;
     `target = monthlyBudgetCents`;
     `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`).
     The helper's return type is `KpiStatus | null` (existing 3-set
     `'on-track' | 'needs-attention' | 'off-track'`); the composable
     asserts non-null for every vendor by construction.
   - Gate: build + test exit 0; mock determinism test passes; the
     `useInfraCostWatchdog` wall-clock-independence test passes
     (calls composable with identical inputs at two different
     wall-clock instants and asserts deep equality).

3. **Sub-task C — Widgets + page wiring**
   - 4 new widgets (3 full for `/system`; 1 strip for `/overview`).
   - 2 modified pages (`SystemHealthPage.vue` adds 3 widgets in
     vertical layout ABOVE the existing `DataTable<ServerNode>`
     which is preserved byte-identical; `OverviewPage.vue` inserts
     strip after the existing `AcquisitionFunnelStripWidget`).
   - Gate: build + test exit 0; Widget State Gate grep returns 1
     per new widget; zero-hex-color grep clean; layer-boundary grep
     clean; pre-existing-surface grep (`ServerStatusWidget`,
     `AlertsPanel`, `fetchServerNodes` call site) shows zero diff
     on those files.

A, B, C MAY land as one session-internal commit chain (`EC-232:`
prefix per `01.3`); a single combined commit per sub-task is also
acceptable per the WP-202 / WP-201 / WP-203 precedent. Governance
close commit follows with `SPEC:` prefix.

## Before Starting

- [ ] **WP-157 landed** ✅ — dashboard scaffold (`apps/dashboard/`,
  4-state Widget Contract, `ServiceResponse<T>`, EChart wrapper).
  Verify: `ls apps/dashboard/src/widgets/` returns ≥ 19 widgets
  (post-WP-203 baseline).
- [ ] **WP-162 landed** ✅ — UI polish + Aura tokens; hex colors
  forbidden in widget source.
- [ ] **WP-196 landed** ✅ — widget patterns (4-state contract,
  `useDateRange`, `normalizeRange`, `hashRange` FNV-1a, integer-cents
  discipline per D-19601). Verify: `grep -n "hashRange\|normalizeRange"
  apps/dashboard/src/services/` returns matches.
- [ ] **WP-197 landed** ✅ — deploy posture (mock-mode-first per
  D-19702; `VITE_USE_MOCKS=true` on CF Pages Production).
- [ ] **WP-198 landed** ✅ — drift-pinned canonical-array pattern
  (`KPI_STATUSES`); `computeKpiStatus()` helper; 4-state Widget
  Contract enforcement. Verify: `grep -n "computeKpiStatus\|KPI_STATUSES"
  apps/dashboard/src/utils/kpiStatus.ts apps/dashboard/src/utils/kpiStatus.test.ts`
  returns matches.
- [ ] **WP-199 landed** ✅ — composable naming + import pattern +
  numeric-zero semantics (D-19908).
- [ ] **WP-203 landed** ✅ — Composable Source Contract +
  mock-mode-first multi-widget surface precedent. Verify:
  `grep -rn "Composable Source Contract\|fetchTrafficSources"
  apps/dashboard/src/composables/ apps/dashboard/src/services/mocks.ts`
  returns matches.
- [ ] Read WP-204 §Goal, §Assumes, §Non-Negotiable Constraints,
  §Acceptance Criteria — those sections are authoritative.
- [ ] Read WP-196 + WP-198 + WP-199 + WP-203 for the dashboard
  patterns being mirrored; do NOT re-derive their locked values.
- [ ] Read `apps/dashboard/src/widgets/PaidActionErrorsWidget.vue`
  (closest shape precedent for `ErrorRateMonitorWidget`: rate +
  sparkline) + `apps/dashboard/src/widgets/NetRevenueChartWidget.vue`
  (4-state Widget Contract reference) +
  `apps/dashboard/src/widgets/AcquisitionFunnelStripWidget.vue`
  (strip-widget reference) before authoring the 4 new widgets.
- [ ] Read `apps/dashboard/src/utils/kpiStatus.ts` so the
  `useInfraCostWatchdog` integration reuses the helper verbatim
  (do NOT reimplement status thresholds).
- [ ] Read `apps/dashboard/src/config/revenueDeductions.ts` —
  precedent for the `isMock: true` placeholder-config pattern
  WP-204 mirrors with `infraCostBudgets.ts`.
- [ ] `pnpm --filter @legendary-arena/dashboard build` +
  `pnpm --filter @legendary-arena/dashboard test` exit 0 (anchor
  baseline test count).

## Locked Values (verbatim from WP-204)

> The full type definitions + closed unions + canonical arrays live
> in WP-204 §Non-Negotiable Constraints → Locked contract values.
> Copy them byte-identical into `types/index.ts`; do NOT re-derive
> or paraphrase. The condensed summary below is for session
> orientation only.

- 3 new interfaces: `UptimeProbe` (6 fields), `ErrorRateSnapshot`
  (6 fields), `InfraCostEntry` (4 fields).
- 1 sub-interface: `ErrorSignature` (4 fields).
- 3 closed unions: `PublicSurfaceKey` (4 values:
  `'marketing' | 'play' | 'cards' | 'api'`), `UptimeStatus`
  (3 values: `'up' | 'degraded' | 'down'`), `InfraCostVendor`
  (4 values: `'render' | 'cloudflare' | 'postgres' | 'hanko'`).
- 3 drift-pinned canonical arrays: `PUBLIC_SURFACES` (4 entries) +
  `UPTIME_STATUSES` (3 entries) + `INFRA_COST_VENDORS` (4 entries).
- `InfraCostEntry.currency` type: exactly literal `'USD'` (NOT
  `string`); multi-currency deferred to a future WP.
- `UptimeProbe.lastIncidentTimestamp` type: exactly `number | null`
  (`null` is the explicit "no incidents in window" sentinel; D-19908
  numeric-zero carry-forward — zero is NOT the null sentinel).
- Mock-mode-first: every widget carries `source: 'MOCK'` freshness
  badge per WP-197 D-19702 (D-20402).
- Forward-contract: `UptimeProbe` (6), `ErrorRateSnapshot` (6),
  `ErrorSignature` (4), `InfraCostEntry` (4) envelope shapes are
  closed; the paired server WP consumes verbatim (D-20401).
- Strip widget link: `OpsAtAGlanceStripWidget`'s "View system health →"
  routes to `/system`.
- Composable Source Contract (carry-forward from WP-203): all 3
  composables accept `() => ServiceResponse<readonly T[]>` and
  surface `source` + `updatedAt` in their returns.
- Aggregation rule: daily discrete entries (NOT cumulative);
  UTC-normalized; series sorted ascending via Unicode code-unit
  comparison; canonical iteration order.
- Cost math invariants: integer cents (D-19601 carry-forward);
  utilization = `mtdCents / monthlyBudgetCents` with zero-denominator
  guard returning `0`; EOM projection = `Math.round(mtdCents *
  daysInMonth / dayOfMonth)`; display formatting (cents → USD)
  applied ONLY at the widget render boundary, NEVER in the
  composable.
- Error rate math invariants: `errorRate` is a 0-1 decimal fraction;
  display percentage = `Math.round(rate * 1000) / 10` at the widget
  boundary; top-5 signature ordering = `count` desc, tiebreak
  `signature` asc via Unicode code-unit comparison.
- **"Current" snapshot selection (locked window discipline).**
  "Current 1h rate" = `ErrorRateSnapshot` entry with
  `windowSeconds = 3600` AND lex-greatest `date` among those
  entries. "Rolling 24h rate" = computed only over entries with
  `windowSeconds = 86400`. **Mixed-window aggregation is forbidden**
  (3600 + 86400 rows are not commensurable without rescaling; v1
  does not rescale). The composable's `series` return is the full
  unfiltered list; per-derivation filtering happens inside the
  composable, not the widget.
- **Latest-entry selection (locked shared pattern).** "Latest" =
  the entry with the lex-greatest `date` string (`YYYY-MM-DD`)
  under Unicode code-unit comparison. No `Date.parse()`, no
  `new Date(str)`, no `Date.now()`, no `performance.now()`. Same
  pattern applies across `useErrorRateMonitor` (current 1h
  snapshot), `useInfraCostWatchdog` (date-math anchor for
  `dayOfMonth` / `daysInMonth`), and any future ops composable.
- Uptime math invariants: `uptimePercent` is a 0-100 value with
  1-decimal precision; mean across daily probes is
  `arithmeticMean(uptimePercents)` rounded to 1 decimal at the
  composable boundary; `status: 'down'` does NOT special-case the
  `uptimePercent` value.
- **Missing-days exclusion (locked, `usePublicSurfaceHealth`).**
  Days inside the selected range with no probe for a given
  surface are EXCLUDED from that surface's mean denominator. They
  MUST NOT be treated as `uptimePercent: 0` (depresses mean) and
  MUST NOT be treated as `uptimePercent: 100` (inflates mean).
- **Mock value bounds (locked).** Even with deterministic seeding,
  the mock factories MUST emit values within:
  - `UptimeProbe.uptimePercent` ∈ `[95.0, 100.0]`
  - `ErrorRateSnapshot.errorRate` ∈ `[0, 0.05]`
  - `InfraCostEntry.amountCents` ≥ 0 AND per-vendor monthly sum
    ≤ 200% of that vendor's `monthlyBudgetCents`.
  Bounds belong to the mock layer only — composables / widgets
  MUST NOT clamp values to enforce these ranges; if a derivation
  emits out-of-band values, fix the factory not the consumer.
- **Widget-local time windows (locked — composable-derived only).**
  `PublicSurfaceHealthWidget` 30-day sparkline = trailing 30
  entries of `series` per surface (ascending `date`).
  `ErrorRateMonitorWidget` 24h sparkline = trailing 24 entries
  of `series` with `windowSeconds = 3600` (ascending `date`).
  `InfraCostWatchdogWidget` carries no v1 sparkline.
  `OpsAtAGlanceStripWidget` calls the same composables directly
  for its summary numerics — NOT another widget's computed state.
  No widget fetches its own data slice independently.
- **No cross-widget composable coupling (locked).** Each widget
  calls its own composable(s). Widgets MUST NOT read computed
  values from another widget's component instance, subscribe to
  another widget's emitted events for derivation, or re-import a
  composable result another widget already computed. Vue
  reactivity + the pure-function-of-input composable contract
  ensure cache reuse where it matters; cross-widget reads create
  graph dependencies the v1 widget tree cannot afford.
- Determinism scope: mock output is a pure function of `DateRange`
  for all three factories; iteration order is canonical via
  `PUBLIC_SURFACES` / `INFRA_COST_VENDORS`.
- **`useInfraCostWatchdog` date math invariant (HARD):** `dayOfMonth`
  and `daysInMonth` are derived from the **latest entry's `date`
  string** (NOT `Date.now()`) so the composable is a pure function
  of `(entries, budgets)`.
- Empty-state rule: empty datasets drop to the explicit `empty` arm
  of the 4-state Widget Contract; per-widget thresholds in WP-204
  §Widget Data Requirements. `OpsAtAGlanceStripWidget` renders
  `"—"` placeholder (NOT `0%` / `$0`) for per-card partial-data
  values.
- `useInfraCostWatchdog` status mapping reuses `computeKpiStatus()`
  (WP-198) verbatim by constructing a `KpiSnapshot` per vendor with
  `direction: 'lower-is-better'` (lower cost = better outcome);
  `target = monthlyBudgetCents`;
  `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`
  (`toleranceRatio` uniform at `0.20` across vendors in v1 per
  D-20403). Helper return enum is the existing 3-set
  `'on-track' | 'needs-attention' | 'off-track'` (matches
  `KPI_STATUSES`); the composable asserts non-null for every vendor
  by construction. Widget display copy MAY render the `'off-track'`
  cost case as "Over budget" in the chip text — that's a display
  string, not a fork of the enum.
- Placeholder budgets flagged `isMock: true` per D-20403; real
  values deferred to a future finance-loop WP (mirrors WP-196
  `revenueDeductions.ts` deferral pattern).

## Guardrails

### Semantic (the lines you must not cross)

- **All v1 data is mock.** Every widget reads from `opsHealthMocks.ts`
  via the `fetchX` aliases. Any production-data fetch in a widget =
  HARD FAIL.
- **No PII / secrets surfaces.** No vendor API keys, no environment
  variables, no IP addresses, no operator email/handle in any
  mock, composable, or widget. Mock data carries only the closed
  vocabulary defined in the WP-204 types (surface keys, vendor
  keys, status enums, integer cents, count integers, signature
  strings derived synthetically).
- **Forward-locked envelopes (D-20401).** The 6 + 6 + 4 + 4 field
  shapes are closed; future per-surface / per-vendor / per-error
  metadata rides on a follow-up extension WP. Widening / narrowing
  any envelope here is OUT OF SCOPE (belongs in the paired server
  WP — tentatively WP-206 unless WP-205 ordering shifts).
- **Single-currency lock (D-20401).** `InfraCostEntry.currency` is
  literal `'USD'`. Adding `'EUR'` / `'GBP'` / any other value
  without flipping the literal union to a broader closed set
  fails the type-check loudly. Multi-currency is a future WP.
- **Composable Source Contract (hard, carry-forward from WP-203).**
  All 3 composables accept `() => ServiceResponse<readonly T[]>`
  (NOT `() => readonly T[]`). The composable reads `.data`
  internally; it MUST preserve `.source` and `.updatedAt` in its
  returned object. Stripping `ServiceResponse` at the composable
  boundary = HARD FAIL (breaks the MOCK → LIVE swap symmetry the
  paired server WP depends on).
- **`useInfraCostWatchdog` date math invariant (HARD).** Derive
  `dayOfMonth` / `daysInMonth` from the **latest entry's `date`
  string** (sort entries ascending by `date` via Unicode code-unit
  comparison; the last entry is the latest). DO NOT pull
  `Date.now()` / `new Date()` / `performance.now()` anywhere in
  this composable. The wall-clock-independence test (call composable
  with identical inputs at two different system-clock instants;
  assert deep equality) is the load-bearing gate.
- **`useInfraCostWatchdog` reuses `computeKpiStatus()` verbatim.**
  Do NOT reimplement status thresholds in the composable. Construct
  a `KpiSnapshot` per vendor inline and call
  `computeKpiStatus(snapshot)`; the snapshot's `target =
  monthlyBudgetCents`, `tolerance = Math.round(monthlyBudgetCents *
  toleranceRatio)`, `direction = 'lower-is-better'`. The status
  taxonomy is the existing closed 3-set
  `'on-track' | 'needs-attention' | 'off-track'` (matching
  `KPI_STATUSES`). No new status union invented for cost —
  single-implementation discipline.
- **Aggregation rule (locked, carry-forward from WP-203).**
  `UptimeProbe[]`, `ErrorRateSnapshot[]`, and `InfraCostEntry[]`
  are **per-day discrete entries (NOT cumulative)**; each `date`
  is a closed daily UTC bucket via `normalizeRange`. Series MUST
  be sorted ascending by `date` via Unicode code-unit comparison
  (no `localeCompare`). Per-surface / per-vendor assembly MUST
  iterate the canonical drift-pinned array — NOT `Object.keys()`
  of a derived map.
- **Cost math invariants (locked).** Integer cents discipline per
  D-19601 carry-forward: `InfraCostEntry.amountCents` and
  `InfraCostBudget.monthlyBudgetCents` are integers; arithmetic on
  cents stays in integer space. Utilization ratio =
  `mtdCents / monthlyBudgetCents`; zero-denominator returns `0`
  (D-19908 carry-forward). EOM projection = `Math.round(mtdCents *
  daysInMonth / dayOfMonth)`. Display formatting (cents → USD via
  `(cents / 100).toFixed(2)`) lives at the widget render boundary
  only — NEVER inside the composable (preserves test ergonomics +
  the integer-cents discipline).
- **Error rate math invariants (locked).** `errorRate` is a 0-1
  decimal fraction; display percentage = `Math.round(rate * 1000)
  / 10` at the widget boundary. Zero-`totalRequests` snapshots
  produce `errorRate = 0` (NOT `NaN`). Top-5 signature ordering:
  primary key `count` descending; tiebreak `signature` ascending
  via Unicode code-unit comparison. Cross-range aggregation merges
  identical `signature` strings (summing counts; taking `min(firstSeen)`
  and `max(lastSeen)`); identical-string merge is the load-bearing
  invariant — if two daily snapshots have different `signature`
  strings that look similar but differ by even one character, they
  remain separate signatures (the closed-union-per-magnitude pattern
  from WP-202 D-20201 carries forward in spirit).
- **Uptime math invariants (locked).** `uptimePercent` is a 0-100
  value with 1-decimal precision (e.g., 99.7), NOT a 0-1 fraction.
  Mean across daily probes is `arithmeticMean(uptimePercents)`
  rounded to 1 decimal via `Math.round(value * 10) / 10` at the
  composable boundary. `status: 'down'` does NOT force `uptimePercent
  = 0` (a daily-rolled probe MAY have `status: 'down'` AND
  `uptimePercent: 92.0` if it spent some of the day down and some
  up — the status reflects the rollup, the percent reflects the
  ratio).
- **Missing-days exclusion (locked, `usePublicSurfaceHealth`).**
  Days inside the selected range with no `UptimeProbe` entry for
  a given surface are EXCLUDED from that surface's mean
  denominator. Zero-fill biases the mean artificially low;
  100-fill biases it artificially high; both produce misleading
  operator displays under sparse-data conditions. The mean
  denominator is "number of probes for this surface in range",
  NOT "number of days in range".
- **"Current" snapshot selection (locked window discipline).**
  `useErrorRateMonitor.currentRate` filters to
  `windowSeconds = 3600` entries only and selects the lex-greatest
  `date` among them. `useErrorRateMonitor.rollingDailyRate`
  filters to `windowSeconds = 86400` entries only.
  **Mixed-window aggregation is a HARD FAIL** — a derivation that
  pulls both 3600 and 86400 rows into the same sum / mean / rate
  is mathematically incoherent (the two bucket sizes are not
  commensurable without rescaling, and v1 does not rescale). The
  composable returns the full unfiltered `series` to the widget;
  per-derivation filtering happens inside the composable, never
  in the widget template.
- **Latest-entry selection (locked shared pattern).** "Latest" =
  the entry with the lex-greatest `date` string (`YYYY-MM-DD`)
  under Unicode code-unit comparison. Forbidden: `Date.parse()`,
  `new Date(str)`, `Date.now()`, `performance.now()` — any of
  these in a latest-entry-selection path re-introduces the
  timezone / locale / wall-clock dependence the locked pattern is
  designed to eliminate. Same pattern across
  `useErrorRateMonitor.currentRate` selection,
  `useInfraCostWatchdog` date-math anchor, and any future ops
  composable.
- **Mock value bounds (locked, factory-side invariant).** Mock
  factories MUST emit values within:
  - `UptimeProbe.uptimePercent` ∈ `[95.0, 100.0]`
  - `ErrorRateSnapshot.errorRate` ∈ `[0, 0.05]`
  - `InfraCostEntry.amountCents` ≥ 0 AND per-vendor monthly sum
    ≤ 200% of `INFRA_COST_BUDGETS[v].monthlyBudgetCents`.
  Composables and widgets MUST NOT clamp values to enforce these
  bounds — clamping inside the consumer hides factory bugs; if a
  consumer observes an out-of-band value, the factory is wrong
  and must be fixed.
- **Widget-local time windows (locked, composable-derived only).**
  `PublicSurfaceHealthWidget` 30-day sparkline = trailing 30
  entries of `series` per surface; `ErrorRateMonitorWidget` 24h
  sparkline = trailing 24 entries of `series` with
  `windowSeconds = 3600`. Both sparklines slice from the
  composable's `series` — NOT by fetching a different range,
  NOT by reading a sibling composable's data. If fewer than the
  expected entries exist, the sparkline renders whatever the
  composable returned (no zero-fill, no re-fetch).
- **No cross-widget composable coupling (locked).** Every widget
  derives its display state from its own composable call(s).
  Widgets MUST NOT read computed values from another widget's
  component instance (`<X ref="x" />` then `x.value.derived`),
  subscribe to another widget's emitted events for derivation,
  or re-import a composable result computed elsewhere. The
  `OpsAtAGlanceStripWidget` calls the same composables that the
  three full widgets use — directly, with its own reactive
  inputs — NOT by reading the full widgets' state.
- **Determinism scope (hard, carry-forward from WP-203).** Mock
  outputs are a pure function of `DateRange`. No other external
  state (system clock, env vars, JS iteration order, ambient
  locale / timezone) may influence output. `Date.now()` is allowed
  ONLY in `wrapMock`'s `updatedAt` population. `Math.random()` is
  allowed ONLY inside `opsHealthMocks.ts` and ONLY seeded via
  `hashRange`. Iteration order MUST be canonical via `PUBLIC_SURFACES`
  / `INFRA_COST_VENDORS`.
- **Empty-state rule (carry-forward from WP-203).** Empty datasets
  MUST drop the widget to the explicit `empty` arm of the 4-state
  Widget Contract — NOT a flat-line chart, NOT a degenerate axis,
  NOT an all-zero cost grid. Per-widget thresholds locked in
  WP-204 §Widget Data Requirements. `OpsAtAGlanceStripWidget`
  renders the literal `"—"` placeholder (NOT `0%` / `$0`) for
  per-card partial-data values; full empty (no data anywhere) drops
  to a strip-level empty arm.
- **Surface ≠ node (semantic separation).** `UptimeProbe`
  (per-surface, domain-level) and the existing `ServerNode`
  (per-node, infrastructure-level) are distinct interfaces. Do NOT
  merge them. Do NOT extend `ServerNode.status` with
  `UptimeProbe.status` members (the unions happen to share string
  values but the interfaces describe different observable units).
- **Drift-pinned arrays.** Adding a 5th surface / 4th status / 5th
  vendor without updating BOTH the union AND the canonical array =
  FAIL (drift test catches it).
- **Zero-denominator guard.** All rate computations check the
  denominator BEFORE division; zero returns `0`, never `NaN`. This
  applies to: per-channel signup conversion (carry-forward),
  per-vendor utilization ratio, total utilization ratio, per-day
  error rate, EOM projection's `daysInMonth / dayOfMonth` ratio.
- **Text-label-first accessibility.** Uptime status chip + cost
  watchdog status chip + error rate severity color are decorative;
  numeric / text labels are the load-bearing display (Vision §17
  carry-forward from WP-198 / WP-199 / WP-203).
- **No widget displacement.** WP-204 is purely additive on both
  Overview and SystemHealth. `ServerStatusWidget.vue`,
  `AlertsPanel.vue`, the existing `DataTable<ServerNode>`, and
  every WP-196 / WP-198 / WP-199 / WP-203 widget remain byte-identical.

### Execution (the things you must not touch)

- **Layer boundary:** zero
  `@legendary-arena/(game-engine|registry|preplan|server)` imports
  anywhere in `apps/dashboard/src/`. Verified by grep at close.
- **No new npm dependencies:** `apps/dashboard/package.json` +
  `pnpm-lock.yaml` zero diff. Use existing EChart wrapper +
  PrimeVue + Pinia.
- **No server-side surface:** `apps/server/src/**`,
  `data/migrations/`, `docs/ai/REFERENCE/api-endpoints.md` all zero
  diff. The paired server WP (TBD) owns those.
- **No engine surface:** `packages/` zero diff.
- **Hex color ban:** zero `#[0-9a-fA-F]{3,8}` matches in the 4 new
  widget files.
- **`Math.random` scope:** allowed only inside `opsHealthMocks.ts`
  (mock data generation, seeded via `hashRange`); forbidden in
  composables and widgets.
- **`Date.now()` scope:** allowed only inside `wrapMock()`'s
  `updatedAt` population (existing pattern); forbidden elsewhere
  in new code. `useInfraCostWatchdog` derives date math from the
  latest entry's `date` string — NOT from the system clock.
- **`localeCompare` ban:** Unicode code-unit comparator only for
  ordering (D-19605 / D-19904 / D-20301 carry-forward).
- **Widget State Gate:** exactly 1 `v-if="state ===` per new widget
  file. No nested ternaries; no inline state derivations in the
  template.
- **Mock determinism:** every mock factory accepts a `DateRange`
  and seeds its PRNG via `hashRange(range)` per D-19605. No bare
  `Math.random()` call site.
- **Required attributes:** every widget root carries
  `data-testid=...` + `aria-label=...`.
- **Pre-existing surface preservation (grep gate at close):**
  `git diff --name-only apps/dashboard/src/widgets/ServerStatusWidget.vue
  apps/dashboard/src/widgets/AlertsPanel.vue` returns empty;
  `SystemHealthPage.vue` retains its `fetchServerNodes` call site
  byte-identical (grep -n returns the same line number pre/post).

## Required `// why:` Comments

- `types/index.ts` — at each new interface and closed union, a
  `// why:` line explaining the contract's role and citing the
  relevant D-entry (D-20401 for the four envelopes; D-20402 for
  the MOCK-badge sub-rule; D-20403 for the placeholder budget
  deferral note).
- `PUBLIC_SURFACES` / `UPTIME_STATUSES` / `INFRA_COST_VENDORS`
  canonical arrays — `// why:` citing WP-198's `KPI_STATUSES`
  drift-detection precedent and pointing at
  `utils/opsTaxonomy.test.ts` as the enforcement site.
- `InfraCostEntry.currency` literal `'USD'` field — `// why:`
  citing D-20401 single-currency lock + note that multi-currency
  is a future WP.
- `UptimeProbe.lastIncidentTimestamp: number | null` — `// why:`
  citing D-19908 numeric-zero semantics carry-forward: zero is a
  meaningful epoch timestamp (1970-01-01 UTC), NOT the
  no-incidents sentinel; the explicit `null` is the sentinel.
- `config/infraCostBudgets.ts` — file-level `// why:` citing WP-196
  `revenueDeductions.ts` precedent (the WP locks the SHAPE of the
  config, not the values; the `isMock: true` flag is the source of
  truth for the widget's MOCK badge until a finance-review WP
  flips it). Per-vendor `// why:` lines explaining the placeholder
  rationale (the values reflect rough order-of-magnitude estimates
  for v1 budget guard-rails; real values require operator review
  per D-20403).
- `opsHealthMocks.ts` per-factory function — `// why:` citing
  D-19605 (hashRange-seeded determinism) and D-20402 (mock-mode-first
  per WP-197 D-19702).
- Each composable's zero-denominator guard — `// why:` explaining
  that `0` (not `NaN`) is the meaningful empty-data return per
  D-19908 numeric-zero semantics carry-forward.
- Each composable's `source` / `updatedAt` passthrough — `// why:`
  citing WP-204 §Composable Source Contract (extends WP-203 /
  D-19607 Shared Source Contract pattern): widgets read freshness
  from the composable's returned `source` / `updatedAt`, not from
  the service layer directly; this is what makes the MOCK → LIVE
  swap a getter-only change in the paired server WP.
- `usePublicSurfaceHealth` ascending-by-date sort — `// why:`
  citing §Aggregation rule: `YYYY-MM-DD` strings sort correctly
  under Unicode code-unit comparison; `localeCompare` is forbidden
  per D-19605 / D-19904 because it introduces ambient-locale
  dependence.
- `useInfraCostWatchdog` `dayOfMonth` / `daysInMonth` derivation
  from latest entry's `date` — `// why:` citing §Determinism scope
  HARD invariant: deriving from the system clock via `Date.now()`
  / `new Date()` would let the composable's output depend on
  wall-clock time, which a pure function of `(entries, budgets)`
  must not. The latest entry's `date` is the canonical "as-of"
  moment for projection math. Cross-reference: the
  wall-clock-independence test in `useInfraCostWatchdog.test.ts`
  is the enforcement gate.
- `useInfraCostWatchdog` `computeKpiStatus()` call — `// why:`
  citing WP-198 single-implementation discipline: reuse the helper
  with `direction: 'lower-is-better'` (lower cost = better outcome)
  so the dashboard's status taxonomy
  (`'on-track' | 'needs-attention' | 'off-track'`) stays unified across
  governance KPIs and cost KPIs. A bespoke per-vendor threshold
  comparator would duplicate WP-198 logic AND fork the status
  vocabulary — both anti-patterns.
- `useErrorRateMonitor` top-5 signature aggregation — `// why:`
  explaining the merge invariant (identical `signature` strings
  merge by sum-of-counts + min-firstSeen + max-lastSeen; different
  signatures stay separate) and the tie-break ordering (primary
  `count` descending; tiebreak `signature` ascending via Unicode
  code-unit comparison) for deterministic top-5 selection across
  runs.
- `useErrorRateMonitor.currentRate` selection by latest `date` —
  `// why:` explaining that "current" = the lex-greatest `date`
  among entries WITH `windowSeconds === 3600` (NOT across the
  whole series — `currentRate` is a 1h-window metric, mixing
  86400 rows would be mathematically incoherent per §"Current"
  snapshot selection lock). Cross-reference: §Latest-entry
  selection shared pattern + the mixed-window-aggregation test
  in `useErrorRateMonitor.test.ts` is the enforcement gate.
- `useErrorRateMonitor.rollingDailyRate` filter to
  `windowSeconds === 86400` — `// why:` citing §"Current"
  snapshot selection lock: the daily rate is the equal-weighted
  mean over daily-bucket entries only. Pulling in 1h-bucket rows
  would silently corrupt the rate (a 1h bucket with 100 errors
  / 10,000 requests reports the same `errorRate` as a 24h bucket
  with 2,400 errors / 240,000 requests, but the operator's
  interpretation of "rolling 24h" is the daily-bucket aggregate).
- `usePublicSurfaceHealth` missing-days exclusion branch —
  `// why:` citing §Missing-days exclusion lock: zero-fill biases
  the mean low (a 95% sparse-probe surface would appear as ~3%
  if zero-filled over a 30-day range), 100-fill biases it high
  (the same surface would appear as ~99.83%). Excluding missing
  days keeps the reported mean honest about the data actually
  observed.
- Every composable's latest-entry / sort-by-date code path —
  `// why:` citing §Latest-entry selection: sort on the
  `YYYY-MM-DD` string under Unicode code-unit comparison only;
  `Date.parse()` / `new Date(str)` are forbidden because they
  reintroduce timezone / locale / wall-clock dependence (the
  whole point of the locked pattern is to keep ordering purely
  string-based).
- `opsHealthMocks.ts` value-bounds enforcement — `// why:` citing
  §Mock value bounds lock: bounds belong to the factory, not the
  consumer. Inline `// why:` at each clamp / generation step that
  produces a bounded value, explaining the bound's range and
  intent (e.g., "uptime floor at 95.0 so the operator sees a
  degraded-day rendering in the widget without exercising
  pathological cases").
- `opsHealthMocks.ts` per-factory canonical iteration — `// why:`
  citing §Determinism scope: iterate `PUBLIC_SURFACES` /
  `INFRA_COST_VENDORS` in canonical array order (NOT `Object.keys()`
  of a derived map) so the output is byte-identical across JS
  runtimes regardless of object-key insertion-order behavior.
- Each widget's empty-state arm — `// why:` citing §Empty-state
  rule + §Widget Data Requirements: per-widget data-requirement
  threshold drops the widget to the explicit `empty` arm (NOT a
  flat chart, NOT a degenerate axis); the WP-157 reference
  implementations are the visual contract.
- `OpsAtAGlanceStripWidget` `"—"` placeholder branch — `// why:`
  citing §Widget Data Requirements: per-card partial-data values
  render as `"—"` (NOT `0%` / `$0`) because rendering literal
  zeros for missing-data states would be operationally misleading
  (a `$0` cost card cannot be distinguished from "we have no cost
  data for this vendor yet" without the explicit placeholder).
- Each widget's `v-if="state ===` block — `// why:` referencing
  WP-196 Widget State Gate Pattern (D-19608 adapted for non-chart
  widgets).
- `OpsAtAGlanceStripWidget` router-link — `// why:` explaining
  why the strip links to `/system` (depth on demand; the full ops
  widgets live there).
- `InfraCostWatchdogWidget` cents → USD display formatting —
  `// why:` citing §Cost math invariants: the cents-to-display
  boundary lives at the widget, not the composable, so the
  composable stays in integer-cents space (preserves test
  ergonomics + D-19601 integer-cents discipline).
- `OpsAtAGlanceStripWidget` per-card `KpiSnapshot` literals —
  `// why:` enumerating the locked `target` + `tolerance` +
  `direction` values verbatim per WP-204 §Scope (In) → Widgets.
  Each card constructs an inline `KpiSnapshot` and calls
  `computeKpiStatus()`:
  - **Worst-surface uptime card** — `target: 99.0`, `tolerance:
    4.0`, `direction: 'higher-is-better'` → `value >= 99.0` ⇒
    `'on-track'`; `95.0 <= value < 99.0` ⇒ `'needs-attention'`;
    `value < 95.0` ⇒ `'off-track'`.
  - **Current 1h error rate card** (value expressed as percentage
    0-100) — `target: 1.0`, `tolerance: 4.0`, `direction:
    'lower-is-better'` → `value <= 1.0` ⇒ `'on-track'`;
    `1.0 < value <= 5.0` ⇒ `'needs-attention'`; `value > 5.0` ⇒
    `'off-track'`.
  - **Cost utilization card** (value expressed as percentage 0-100)
    — `target: 80.0`, `tolerance: 20.0`, `direction:
    'lower-is-better'` → `value <= 80` ⇒ `'on-track'`;
    `80 < value <= 100` ⇒ `'needs-attention'`; `value > 100` ⇒
    `'off-track'`.

  Drift on any of these = a single-edit fix at the widget; future
  per-vendor / per-surface threshold tuning is deferred (D-20403).

## Files to Produce

### Sub-task A — Types + Config + Drift (3 files)

- `apps/dashboard/src/types/index.ts` — **modified** — append 3
  interfaces (`UptimeProbe`, `ErrorRateSnapshot`, `InfraCostEntry`)
  + 1 sub-interface (`ErrorSignature`) + 3 closed unions
  (`PublicSurfaceKey`, `UptimeStatus`, `InfraCostVendor`) + 3
  drift-pinned canonical arrays (`PUBLIC_SURFACES`,
  `UPTIME_STATUSES`, `INFRA_COST_VENDORS`) per WP-204 §Locked
  contract values.
- `apps/dashboard/src/config/infraCostBudgets.ts` — **new** —
  `InfraCostBudget` interface + `INFRA_COST_BUDGETS` readonly
  array (4 entries; all `isMock: true`; thresholds uniform per
  D-20403). Mirrors `config/revenueDeductions.ts` precedent.
- `apps/dashboard/src/utils/opsTaxonomy.test.ts` — **new** —
  bidirectional drift assertions for all three union ↔ array pairs
  (`PUBLIC_SURFACES` ↔ `PublicSurfaceKey`, `UPTIME_STATUSES` ↔
  `UptimeStatus`, `INFRA_COST_VENDORS` ↔ `InfraCostVendor`).

### Sub-task B — Mock service + Composables (8 files)

- `apps/dashboard/src/services/opsHealthMocks.ts` — **new** — 3
  factories (`mockUptimeProbes`, `mockErrorRateSnapshots`,
  `mockInfraCostEntries`); `hashRange`-seeded; `wrapMock<T>`;
  `source: 'MOCK'`.
- `apps/dashboard/src/services/mocks.ts` — **modified** — re-export
  the 3 new factories **TWICE per factory** per WP-204 §Files
  Expected to Change item 4: once under `mockX` name (for tests)
  and once under `fetchX` alias (for widgets — preserves widget
  byte-identity across MOCK → LIVE flip per D-20402).
- `apps/dashboard/src/composables/usePublicSurfaceHealth.ts` +
  `.test.ts` — **new** — per-surface mean uptime + worst-surface
  selection w/ canonical-order tie-break + last-incident timestamps
  + `source` / `updatedAt` passthrough; accepts
  `() => ServiceResponse<readonly UptimeProbe[]>`; ≥ 7 tests.
- `apps/dashboard/src/composables/useErrorRateMonitor.ts` +
  `.test.ts` — **new** — current rate by latest `date` + rolling
  daily rate (equal-weighted) + totals + cross-range top-5
  signature aggregation w/ deterministic tie-break + `source` /
  `updatedAt` passthrough; accepts
  `() => ServiceResponse<readonly ErrorRateSnapshot[]>`; ≥ 7 tests.
- `apps/dashboard/src/composables/useInfraCostWatchdog.ts` +
  `.test.ts` — **new** — per-vendor MTD + EOM projection (date
  math from latest entry's `date`, NOT `Date.now()`) + status via
  `computeKpiStatus()` (`KpiSnapshot` constructed per vendor with
  `direction: 'lower-is-better'`, `target = monthlyBudgetCents`,
  `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`) + total
  utilization ratio + `source` / `updatedAt` passthrough; accepts
  `() => ServiceResponse<readonly InfraCostEntry[]>` PLUS
  `budgets: readonly InfraCostBudget[]`; ≥ 7 tests including the
  wall-clock-independence test (call with identical inputs at two
  different system-clock instants; assert deep equality).

### Sub-task C — Widgets + Page Wiring (6 files)

- `apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue` —
  **new** — per-surface table (canonical `PUBLIC_SURFACES` order)
  + status chip (text-label-first) + 30-day uptime sparkline +
  last-incident relative; 4-state contract.
- `apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue` —
  **new** — current 1h rate + 24h rolling rate + 24h sparkline +
  top-5 signature table; 4-state contract.
- `apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue` —
  **new** — 4-card grid (canonical `INFRA_COST_VENDORS` order)
  with MTD spend + EOM projection + monthly budget + status chip
  via `computeKpiStatus()`; cents → USD formatting at the widget
  boundary only; 4-state contract.
- `apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue` —
  **new** — 3-card horizontal strip with locked per-card
  thresholds; `"—"` placeholder for per-card partial-data values;
  "View system health →" link to `/system`.
- `apps/dashboard/src/pages/system/SystemHealthPage.vue` —
  **modified** — insert the 3 new full widgets in vertical layout
  ABOVE the existing `DataTable<ServerNode>`. Use `useDateRange`
  for all three. Pass `INFRA_COST_BUDGETS` to
  `InfraCostWatchdogWidget`. Existing DataTable +
  `fetchServerNodes` call site preserved byte-identical.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` —
  **modified** — insert `OpsAtAGlanceStripWidget` immediately
  after the existing `AcquisitionFunnelStripWidget` mount point.
  No other layout change.

### Governance (4 files)

- `docs/ai/STATUS.md` — **modified** — `### WP-204 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-20401..D-20403
  (reserved → Active byte-identical to EC §DECISIONS.md verbatim
  block per PS-1 convention).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-204
  row `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** —
  EC-232 row Done.

**Total: 21 files** (15 new + 2 modified source + 4 governance).

## After Completing

### Sub-task A close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] Drift test passes: `pnpm --filter @legendary-arena/dashboard
  test -- opsTaxonomy` runs the new test and asserts bidirectional
  parity on all three unions/arrays.
- [ ] Grep: 3 new interfaces + 1 sub-interface + 3 closed unions +
  3 canonical arrays present in `types/index.ts` byte-identical to
  WP-204 §Locked contract values.
- [ ] Grep: `INFRA_COST_BUDGETS` exports 4 entries in canonical
  `INFRA_COST_VENDORS` order with `isMock: true` on every entry:
  `grep -cE "isMock: true" apps/dashboard/src/config/infraCostBudgets.ts`
  returns exactly 4.

### Sub-task B close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 with
  baseline + **≥ 21 new tests** (≥ 7 per composable × 3 composables).
- [ ] Mock determinism: each composable produces byte-identical
  output for the same `DateRange` input across two consecutive
  evaluations.
- [ ] **Wall-clock-independence test for `useInfraCostWatchdog`
  passes** — composable called with identical inputs at two
  different system-clock instants returns deep-equal output (this
  is the load-bearing gate proving `Date.now()` is NOT in the
  composable's data path).
- [ ] **Empty-state test per composable** — each composable's
  test suite carries ≥ 1 empty-input test named
  `should_<behavior>_when_series_is_empty` (or equivalent) that
  asserts: empty-shape sentinel returned (`worstSurface = null` /
  `currentRate = 0` / `mtdByVendor` empty-record-over-canonical-vendors-with-zeros);
  NO numeric field is `NaN` (explicit `Number.isNaN(value) === false`
  assertion per numeric field); zero/null semantics match D-19908.
- [ ] **Mixed-window aggregation test in `useErrorRateMonitor`** —
  synthetic input contains both `windowSeconds = 3600` and
  `windowSeconds = 86400` entries; test asserts `currentRate` is
  computed from the 3600 subset only and `rollingDailyRate` is
  computed from the 86400 subset only (mixed-window aggregation
  produces a dedicated test failure if the implementation
  regresses).
- [ ] **Missing-days exclusion test in `usePublicSurfaceHealth`**
  — synthetic input: 30-day `DateRange` with 3 probes for one
  surface; test asserts the surface's mean = arithmetic mean of
  the 3 probe values (NOT zero-filled to denominator-30, NOT
  100-filled to denominator-30).
- [ ] **Mock value bounds asserted at the factory boundary** — a
  dedicated test in `opsHealthMocks.test.ts` (or a `bounds`
  describe-block inside `usePublicSurfaceHealth.test.ts` /
  `useErrorRateMonitor.test.ts` / `useInfraCostWatchdog.test.ts`)
  inspects factory output and asserts: every `uptimePercent` ∈
  `[95.0, 100.0]`; every `errorRate` ∈ `[0, 0.05]`; every
  `amountCents >= 0` AND the per-vendor monthly sum ≤ 200% of the
  matching `INFRA_COST_BUDGETS[v].monthlyBudgetCents`.
- [ ] **Test naming pattern enforced** — every net-new test name
  matches the pattern `should_<behavior>_when_<condition>`. Grep
  in CI: `grep -rnE "(test|it)\(['\"](?!should_)" apps/dashboard/src/composables/use{PublicSurfaceHealth,ErrorRateMonitor,InfraCostWatchdog}.test.ts`
  returns zero matches outside the empty-state line allowance
  (Vue ecosystem test helpers may need a small allowlist; default
  zero).
- [ ] Grep: 3 new mock factories exported from `opsHealthMocks.ts`
  AND re-exported TWICE from `mocks.ts` (`mockX` + `fetchX`
  aliases per D-20402 sub-rule):
  `grep -cE "fetchUptimeProbes|fetchErrorRateSnapshots|fetchInfraCostEntries"
  apps/dashboard/src/services/mocks.ts` returns ≥ 3;
  `grep -cE "mockUptimeProbes|mockErrorRateSnapshots|mockInfraCostEntries"
  apps/dashboard/src/services/mocks.ts` returns ≥ 3.
- [ ] Grep: `computeKpiStatus` called from `useInfraCostWatchdog.ts`:
  `grep -nE "computeKpiStatus" apps/dashboard/src/composables/useInfraCostWatchdog.ts`
  returns ≥ 1 match.

### Sub-task C close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] **Widget State Gate grep:** `grep -cE 'v-if="state ==='
  apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue
  apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue
  apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue
  apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue` returns
  exactly **1 per file**.
- [ ] **Zero hex colors:** `grep -rnE '#[0-9a-fA-F]{3,8}'
  apps/dashboard/src/widgets/{PublicSurfaceHealth,ErrorRateMonitor,InfraCostWatchdog,OpsAtAGlanceStrip}*.vue`
  returns zero matches.
- [ ] **Strip routes correctly:** `grep -nE "'/system'|to=\"/system\"|push\('/system'\)"
  apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue` returns
  ≥ 1 match.
- [ ] **Required attributes per widget:** `grep -cE 'data-testid="[^"]+"'
  apps/dashboard/src/widgets/{PublicSurfaceHealth,ErrorRateMonitor,InfraCostWatchdog,OpsAtAGlanceStrip}*.vue`
  returns ≥ 1 per file; same for `aria-label`.
- [ ] **SystemHealthPage wires 3 widgets:** `grep -cE
  "PublicSurfaceHealthWidget|ErrorRateMonitorWidget|InfraCostWatchdogWidget"
  apps/dashboard/src/pages/system/SystemHealthPage.vue` returns
  ≥ 3 matches.
- [ ] **SystemHealthPage preserves existing DataTable:** `grep -nE
  "fetchServerNodes|DataTable"
  apps/dashboard/src/pages/system/SystemHealthPage.vue` returns
  the same number of matches pre/post the WP edit (existing
  per-node DataTable is preserved byte-identical).
- [ ] **OverviewPage wires strip exactly once:** `grep -cE
  "OpsAtAGlanceStripWidget"
  apps/dashboard/src/pages/dashboard/OverviewPage.vue` returns
  exactly 1.
- [ ] **OverviewPage preserves existing strip:** `grep -nE
  "AcquisitionFunnelStripWidget"
  apps/dashboard/src/pages/dashboard/OverviewPage.vue` returns ≥ 1
  match (WP-203's strip preserved).

### Cross-cutting close

- [ ] **Layer-boundary grep:** `grep -rnE
  "@legendary-arena/(game-engine|registry|preplan|server)"
  apps/dashboard/src/` returns zero matches.
- [ ] **No-new-deps gate:** `git diff --stat
  apps/dashboard/package.json pnpm-lock.yaml` empty.
- [ ] **No-server-edits gate:** `git diff --name-only apps/server/
  data/migrations/ docs/ai/REFERENCE/api-endpoints.md` empty.
- [ ] **No-engine-edits gate:** `git diff --name-only packages/`
  empty.
- [ ] **No-Math.random outside mocks:** `grep -rnE "Math\.random"
  apps/dashboard/src/widgets/PublicSurfaceHealthWidget.vue
  apps/dashboard/src/widgets/ErrorRateMonitorWidget.vue
  apps/dashboard/src/widgets/InfraCostWatchdogWidget.vue
  apps/dashboard/src/widgets/OpsAtAGlanceStripWidget.vue
  apps/dashboard/src/composables/usePublicSurfaceHealth.ts
  apps/dashboard/src/composables/useErrorRateMonitor.ts
  apps/dashboard/src/composables/useInfraCostWatchdog.ts` returns
  zero matches.
- [ ] **No-`Date.now`-in-cost-watchdog:** `grep -nE
  "Date\.now|new Date|performance\.now"
  apps/dashboard/src/composables/useInfraCostWatchdog.ts` returns
  zero matches (the load-bearing determinism gate for the cost
  composable).
- [ ] **No timestamp parsing in any ops composable** (extends the
  cost-watchdog gate to all three composables per §Latest-entry
  selection lock): `grep -rnE "Date\.parse|new Date\(|performance\.now|Date\.now"
  apps/dashboard/src/composables/usePublicSurfaceHealth.ts
  apps/dashboard/src/composables/useErrorRateMonitor.ts
  apps/dashboard/src/composables/useInfraCostWatchdog.ts` returns
  zero matches.
- [ ] **No `Object.keys()` iteration over derived per-vendor /
  per-surface maps** (canonical iteration enforcement per
  §Aggregation rule): `grep -rnE "Object\.keys\(mtdByVendor|Object\.keys\(uptimeBySurface|Object\.keys\(statusByVendor|Object\.keys\(projectedEomByVendor|Object\.keys\(lastIncidentBySurface"
  apps/dashboard/src/` returns zero matches.
- [ ] **Pre-existing-surface preservation:** `git diff --name-only
  apps/dashboard/src/widgets/ServerStatusWidget.vue
  apps/dashboard/src/widgets/AlertsPanel.vue
  apps/dashboard/src/widgets/MatchesRunningWidget.vue` returns
  empty (no incidental edits to sibling surfaces).
- [ ] **Manual UI verification on `/overview`:** strip renders
  between `AcquisitionFunnelStripWidget` and the next existing
  widget; 3 cards visible; status chips render; "View system
  health →" link present and routes to `/system` on click.
- [ ] **Manual UI verification on `/system`:** 3 widgets render in
  vertical order above the existing per-node DataTable
  (PublicSurfaceHealth → ErrorRateMonitor → InfraCostWatchdog →
  DataTable); each shows `MOCK` freshness badge; each in `data`
  state (4-state contract is exercised but not visible in happy
  path); per-node DataTable renders identically to pre-WP state.
- [ ] `pnpm -r build` exits 0.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md`
  D-20401..D-20403 landed Active byte-identical to this EC's
  §DECISIONS.md verbatim block; `WORK_INDEX.md` WP-204 `[x]`;
  `EC_INDEX.md` EC-232 Done.

## Pre-Commit Failure Smells (Must Review Before Commit)

- **Real-data fetch in any widget** → mock-mode-first scope
  violation. The widget MUST source from `opsHealthMocks.ts` via
  the `fetchX` aliases until the paired server WP wires endpoints.
- **PII / secrets / vendor API keys in any mock / composable / widget**
  → security violation. Mock data carries only synthetic counts,
  cents, and signature strings — no real account data, no real
  vendor identifiers, no real error messages from production logs.
- **5th `PublicSurfaceKey` / 4th `UptimeStatus` / 5th `InfraCostVendor`
  added without updating both union AND canonical array** → drift
  test fires loudly.
- **`NaN%` / `NaN` visible in any widget** → zero-denominator
  guard missing; the rate / utilization / projection computation
  divided by zero without the explicit `denom === 0 ? 0 :
  numerator / denom` guard.
- **`v-if="state ===` count ≠ 1 per new widget** → Widget State
  Gate Pattern violation (multiple state arms, or template
  branching outside the state machine).
- **Hex color literal in widget source** → hex-color ban violation;
  PrimeVue / Aura tokens only.
- **`@legendary-arena/(game-engine|registry|preplan|server)` import
  anywhere in `apps/dashboard/src/`** → layer boundary violation;
  `apps/dashboard` is client-only.
- **`apps/dashboard/package.json` or `pnpm-lock.yaml` diff** →
  new-dep violation; the WP-204 widgets must use the existing
  EChart wrapper + PrimeVue + Pinia.
- **`apps/server/src/**` or `data/migrations/` diff** → server-side
  scope creep; the paired server WP owns those.
- **`docs/ai/REFERENCE/api-endpoints.md` diff** → catalog update
  is the paired server WP's concern; WP-204 forward-locks the
  type contract but adds no endpoint.
- **`packages/` diff** → engine scope creep; WP-204 is client-only.
- **`Math.random` call site in any composable or widget** → mock
  determinism violation; `Math.random` is allowed only inside
  `opsHealthMocks.ts` per the existing `randomBetween` /
  `analyticsMocks.ts` precedent.
- **`localeCompare` call site in any new code** → ordering-contract
  violation (D-19605 / D-19904 / D-20301 carry-forward); use
  Unicode code-unit comparator.
- **`Date.now()` / `new Date()` / `performance.now()` call site
  in `useInfraCostWatchdog.ts`** → §Determinism scope HARD
  violation; the wall-clock-independence test will fail. Derive
  `dayOfMonth` / `daysInMonth` from the latest entry's `date`
  string instead.
- **`UptimeProbe` / `ErrorRateSnapshot` / `ErrorSignature` /
  `InfraCostEntry` envelope widened beyond the locked field
  count** → D-20401 violation; future per-surface / per-vendor /
  per-error metadata rides on a follow-up extension WP.
- **`InfraCostEntry.currency` set to anything other than literal
  `'USD'`** → D-20401 single-currency lock violation. Multi-currency
  is a future WP.
- **`useInfraCostWatchdog` reimplements status thresholds in the
  composable** → WP-198 single-implementation discipline violation.
  Reuse `computeKpiStatus()` verbatim by constructing a
  `KpiSnapshot` per vendor with `direction: 'lower-is-better'`,
  `target = monthlyBudgetCents`,
  `tolerance = Math.round(monthlyBudgetCents * toleranceRatio)`;
  do NOT fork the status taxonomy.
- **`useInfraCostWatchdog` invokes a bespoke status comparator that
  yields a 4th status value** (e.g., `'cancel'`, `'pending'`) → forks
  `KPI_STATUSES` taxonomy; HARD FAIL. The 3-set `'on-track' |
  'needs-attention' | 'off-track'` is the closed status vocabulary
  across the entire dashboard.
- **Composable accepts bare `() => readonly T[]` instead of `() =>
  ServiceResponse<readonly T[]>`** → Composable Source Contract
  violation; strips `source` / `updatedAt` at the composable
  boundary and breaks the MOCK → LIVE swap symmetry. Re-add the
  `ServiceResponse` envelope.
- **Widget reads `source` / `updatedAt` from the service layer
  directly instead of from the composable** → same Source Contract
  violation seen from the widget side; widgets MUST source
  freshness from the composable's returned `source` / `updatedAt`,
  NOT by re-importing `opsHealthMocks` / `wrapMock` / `services/api`.
- **Time series unsorted, or sorted via `localeCompare`** →
  §Aggregation rule violation; `YYYY-MM-DD` must be sorted ascending
  via Unicode code-unit comparison so the output is locale-independent
  (D-19605 / D-19904 carry-forward).
- **Cumulative counts in `UptimeProbe[]` / `ErrorRateSnapshot[]` /
  `InfraCostEntry[]` series** → §Aggregation rule violation; daily
  entries MUST be discrete (the value for `2026-06-03` is that
  day's standalone figure, not a running total).
- **Per-surface / per-vendor output assembled via `Object.keys()`
  of a derived map instead of canonical-array iteration** →
  §Determinism scope violation; iterate `PUBLIC_SURFACES` /
  `INFRA_COST_VENDORS` instead. Object-key iteration order is
  observable in templates and varies across runtimes.
- **`Date.now()` or `Math.random()` influencing mock data shape**
  → §Determinism scope violation; mock output is a pure function
  of `DateRange`. `Date.now()` is allowed ONLY in `wrapMock`'s
  `updatedAt`; `Math.random()` is allowed ONLY inside
  `opsHealthMocks.ts` and ONLY seeded via `hashRange`.
- **`OpsAtAGlanceStripWidget` renders zero-percent / zero-dollar
  literal values for partial-data cards** → §Widget Data
  Requirements violation; per-card partial-data MUST render the
  literal `"—"` placeholder. `$0` is operationally indistinguishable
  from "no data captured yet for this vendor"; the placeholder is
  the load-bearing UX signal.
- **Widget renders a flat-line chart / degenerate axis / all-zero
  4-card grid when the underlying dataset is empty** → §Empty-state
  rule violation; the widget MUST drop to the explicit `empty` arm
  of the 4-state Widget Contract.
- **`InfraCostWatchdogWidget` enters `data` state with zero entries
  for every vendor in the current month** → §Widget Data
  Requirements violation; the widget must render the empty state
  instead (a 4-card grid with all `$0` MTD values is uninformative
  and indistinguishable from a missing-data state).
- **`ServerStatusWidget.vue` / `AlertsPanel.vue` /
  `MatchesRunningWidget.vue` or any pre-existing widget diff** →
  scope violation; WP-204 is purely additive (3 new widgets on
  `/system` ABOVE the existing surface, 1 new strip on `/overview`
  AFTER the existing acquisition strip, zero edits to siblings).
- **`SystemHealthPage.vue` `fetchServerNodes` call site removed or
  altered, or existing per-node DataTable visibly changed** →
  same additive-only violation; the existing per-node surface is
  the page's drill-down for the new domain-level widgets.
- **Strip widget link points anywhere other than `/system`** →
  page-routing contract violation; "View system health" implies
  the operator goes to the full ops page.
- **Cents displayed without `(cents / 100).toFixed(2)` conversion**
  → display formatting violation; raw integer cents in the UI
  (e.g., `$10000`) is a readability failure mode and a D-19601
  integer-cents discipline violation (cents are storage; USD is
  display).
- **EOM projection computed as anything other than `Math.round(mtd *
  daysInMonth / dayOfMonth)`** → §Cost math invariants violation.
  A linear projection of MTD to EOM is the v1 formula; alternative
  projection models (e.g., exponential smoothing, day-of-week
  weighting) require a future WP and a new D-entry.
- **`useErrorRateMonitor` top-5 selection orders by anything other
  than `count` descending with `signature` ascending tiebreak**
  → §Error rate math invariants violation; the determinism test
  will fail. Bake the tie-break ordering at the composable
  boundary so the widget's top-5 list is stable across two
  identical-input runs.
- **`UptimeProbe.uptimePercent` rendered as a 0-1 fraction (e.g.,
  `0.997`) instead of a 0-100 value (e.g., `99.7`)** → §Uptime
  math invariants violation; the type is locked at 0-100 with
  1-decimal precision. A composable that returns 0.997 to a widget
  that displays `0.997%` is a 100× display error.
- **`UptimeProbe` with `status: 'down'` forced to `uptimePercent
  = 0` at the composable / widget layer** → §Uptime math invariants
  violation; the status reflects the rollup (was the surface down
  at any point this day?), the percent reflects the ratio (what
  fraction of the day was it up?). A "down some of the day"
  surface MAY have `status: 'down'` AND `uptimePercent: 92.0`.
- **`useInfraCostWatchdog` reaches into `INFRA_COST_BUDGETS`
  directly instead of accepting `budgets` as an injected argument**
  → testability violation; the test suite cannot exercise
  status-mapping edge cases without injection. Pass `budgets` as
  the second arg.
- **`useErrorRateMonitor` derivation sums / means over a mixed
  set of `windowSeconds = 3600` AND `windowSeconds = 86400`
  entries** → §"Current" snapshot selection HARD violation. The
  two bucket sizes are not commensurable without rescaling; v1
  does not rescale. Filter inside the composable per derivation
  (`currentRate` ← 3600 subset; `rollingDailyRate` ← 86400
  subset).
- **`usePublicSurfaceHealth` mean uptime denominator includes
  days with no probe (as zero-fill or 100-fill)** → §Missing-days
  exclusion HARD violation. The denominator is "number of probes
  for this surface in range"; missing days are excluded entirely.
  A sparse-probe surface with 3 probes at 99% in a 30-day range
  reports `mean = 99.0`, NOT `mean = 9.9` (zero-fill) and NOT
  `mean = ~99.9` (100-fill).
- **Latest-entry selection in any composable parses dates via
  `Date.parse()` / `new Date(str)` / `performance.now()` /
  `Date.now()`** → §Latest-entry selection HARD violation. Sort
  on the `YYYY-MM-DD` string under Unicode code-unit comparison
  only — string-only ordering is the load-bearing invariant.
- **Mock factories emit `uptimePercent < 95.0` or `> 100.0`, or
  `errorRate > 0.05`, or `amountCents < 0`, or per-vendor monthly
  sum > 200% of `monthlyBudgetCents`** → §Mock value bounds
  violation. Fix the factory (do NOT clamp inside the consumer);
  the bounds are factory-side invariants.
- **Composable or widget clamps a value to satisfy a mock bound**
  → same violation seen from the consumer side. If the consumer
  observes an out-of-band value, the factory is wrong; consumer
  clamping hides factory bugs and breaks operator observability
  ("why does the dashboard show 95% when the factory emitted
  87%?").
- **Widget reads computed state from another widget's component
  instance, sibling ref, or emitted event** → §No cross-widget
  composable coupling HARD violation. Each widget calls its own
  composable directly with its own reactive input;
  `OpsAtAGlanceStripWidget` reads from the same three
  composables that the full widgets use, NOT from the full
  widgets themselves.
- **`PublicSurfaceHealthWidget` 30-day sparkline fetched
  separately (instead of sliced from composable `series`)** →
  §Widget-local time windows violation. Sparkline slices come
  from the composable's `series` only; widget MUST NOT fetch a
  different range, MUST NOT zero-fill missing trailing days,
  MUST NOT pad to a fixed length of 30 entries.
- **`ErrorRateMonitorWidget` 24h sparkline mixes 3600 + 86400
  entries** → §"Current" snapshot selection violation seen from
  the widget side. Slice ONLY entries with `windowSeconds = 3600`
  from the composable's `series` (the composable returns the
  full unfiltered list; the widget filters by `windowSeconds`).
- **`Object.keys(mtdByVendor)` / `Object.keys(uptimeBySurface)`
  / `Object.keys(statusByVendor)` / `Object.keys(projectedEomByVendor)`
  / `Object.keys(lastIncidentBySurface)` call site anywhere in
  `apps/dashboard/src/`** → §Determinism scope HARD violation.
  Iterate the canonical drift-pinned array
  (`INFRA_COST_VENDORS` / `PUBLIC_SURFACES`) instead. The
  Verification Step grep enforces this mechanically.
- **Test name does not follow the `should_<behavior>_when_<condition>`
  pattern** → §Test naming pattern violation. Improves audit
  readability and makes CI failure output self-describing; the
  grep gate in After Completing enforces it.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> Per PS-1 convention (WP-196 / WP-198 / WP-199 / WP-203 precedent):
> the D-20401..D-20403 entries land in `docs/ai/DECISIONS.md` at the
> execution-close governance commit byte-identical to the block
> below. Status flips from `Reserved (proposed)` at draft time to
> `Active` at landing time; no other field changes.

### D-20401 — Forward-Locked Ops Telemetry Envelopes (`UptimeProbe` / `ErrorRateSnapshot` / `ErrorSignature` / `InfraCostEntry`)

**Decision:**
The WP-204 type contracts are locked at drafting time. `UptimeProbe`
carries exactly 6 fields (`surface`, `date`, `status`,
`uptimePercent`, `incidentCount`, `lastIncidentTimestamp`).
`ErrorRateSnapshot` carries exactly 6 fields (`date`,
`windowSeconds`, `totalRequests`, `errorCount`, `errorRate`,
`topSignatures`). `ErrorSignature` carries exactly 4 fields
(`signature`, `count`, `firstSeen`, `lastSeen`). `InfraCostEntry`
carries exactly 4 fields (`vendor`, `date`, `amountCents`,
`currency`) with `currency` locked to the literal `'USD'`. The
paired server WP (TBD; tentatively WP-206 unless WP-205 ordering
shifts — WP-205 currently reserved for WP-203's `analytics_events`
server companion) consumes these envelopes verbatim at server-side
capture time.

**Rationale:**
Mirrors the WP-196 ↔ `/metrics/billing/health` and WP-203 ↔
`AnalyticsEvent` forward-contract precedents. Locking the envelope
shape at the dashboard side BEFORE the server WP starts implementation
means the server WP has zero schema ambiguity: the data structures
it produces are exactly what the dashboard already consumes.
Per-surface / per-vendor / per-error metadata that the v1 envelopes
cannot represent (e.g., per-incident ticket id, per-error stack
trace, per-vendor SKU-level cost breakdown) is intentionally
deferred to a follow-up extension WP rather than retro-fit into
the v1 envelopes — closed-set discipline preserves the type-check
gate that catches schema drift loudly.

The single-currency lock (`currency: 'USD'`) is intentional: the
operator's vendor stack is currently 100% USD-billed (Render,
Cloudflare, Postgres, Hanko all bill the operator's USD-denominated
account). Multi-currency support is real engineering scope (currency
conversion, FX timestamp, base-currency display semantics) that the
v1 dashboard does not need.

**Implementation locations:**
- `apps/dashboard/src/types/index.ts` — 3 interfaces +
  1 sub-interface byte-identical to WP-204 §Locked contract values.
- `apps/dashboard/src/utils/opsTaxonomy.test.ts` — bidirectional
  drift assertions enforce the closed unions.

**Packet:** WP-204 (EC-232).

**Drafted:** 2026-06-03 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---

### D-20402 — Mock-Mode-First Deploy Posture Carries Forward to WP-204; All Four Widgets Ship `MOCK` Freshness Badge

**Decision:**
The WP-197 D-19702 mock-mode-first deploy posture carries forward
to WP-204. All four new widgets (`PublicSurfaceHealthWidget`,
`ErrorRateMonitorWidget`, `InfraCostWatchdogWidget`,
`OpsAtAGlanceStripWidget`) read from
`apps/dashboard/src/services/opsHealthMocks.ts` (the three new mock
factories) and surface the `MOCK` source label via the composable's
`source` passthrough on the freshness badge. Flip to `LIVE` is the
paired server WP's concern (uptime probe scheduler + 5xx aggregator
+ vendor cost ingestion + real-data endpoints); when that WP lands,
the widget files stay byte-identical pre/post flip because
`services/mocks.ts` swaps its `fetchX` re-exports behind the same
`(range) => ServiceResponse<readonly T[]>` signature.

**Sub-rule (verifiable upgrade path):** widget files have ZERO
literal `mockUptimeProbes` / `mockErrorRateSnapshots` /
`mockInfraCostEntries` tokens — widgets import `fetchX`-prefixed
aliases. Verified at close-out by `grep -rE`.

**Rationale:**
Mirrors WP-197's deploy-posture decision (mock-mode-first on CF
Pages Production via `VITE_USE_MOCKS=true`) + WP-203's D-20302
carry-forward. The MOCK badge is the operator's visible,
non-removable signal that the surface is not yet real data;
iteration on widget layout / surface list / vendor list / budget
thresholds is cheap (mock data costs nothing) and lets the operator
settle the surface BEFORE the paired server WP sinks engineering
effort into probe scheduling, log aggregation, and vendor billing
ingestion. The widget-files-stay-byte-identical invariant is what
makes the MOCK → LIVE flip a zero-risk change at the server-WP
time.

**Implementation locations:**
- `apps/dashboard/src/services/opsHealthMocks.ts` — 3 factories,
  every output wrapped via `wrapMock<T>` with `source: 'MOCK'`.
- `apps/dashboard/src/services/mocks.ts` — re-exports the 3
  factories under both `mockX` (for tests) and `fetchX` (for
  widgets) aliases.
- 4 new widget files — each imports `fetchX` (NOT `mockX`);
  freshness badge sources from the composable's `.source`
  passthrough.

**Packet:** WP-204 (EC-232).

**Drafted:** 2026-06-03 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---

### D-20403 — Per-Vendor Monthly Budget Values and Threshold Ratios Are Placeholder in v1; Real Values Deferred to a Future Finance-Loop WP

**Decision:**
`INFRA_COST_BUDGETS` ships with operator-supplied placeholder
monthly budget values (`render: $100`, `cloudflare: $50`,
`postgres: $30`, `hanko: $25`) and a uniform `toleranceRatio: 0.20`
(20% over-budget band before `'off-track'` fires) across all four
vendors. Every entry carries `isMock: true`. The `isMock: true`
flag is the source of truth for the widget's MOCK badge label.

Real per-vendor budget values, per-vendor `toleranceRatio` tuning
(e.g., tighter band on the highest-spend vendor; per-vendor
seasonal adjustments), and any expansion of the threshold model
(e.g., monthly-vs-quarterly horizon, soft-cap vs hard-cap) require
operator review and a separate follow-up WP. This deferral mirrors
WP-196's `revenueDeductions.ts` precedent: the WP locks the SHAPE
of the config, not the values.

**Rationale:**
Setting real budget values prematurely at WP-204 drafting time
would lock the operator into thresholds without finance + ops
context (current vendor invoices, projected scale, seasonality,
risk tolerance). Locking the SHAPE of the config (per-vendor
`monthlyBudgetCents` + `toleranceRatio` + `isMock` flag) gives the
future finance-loop WP zero schema ambiguity — it changes 4 numbers
and 1 ratio, flips 4 booleans, no composable or widget edit needed.

Uniform `toleranceRatio: 0.20` across vendors is the v1 default
because per-vendor tuning is a tuning problem, not a contract
problem: the closed `'on-track' | 'needs-attention' | 'off-track'`
taxonomy (matching the existing WP-198 `KpiStatus` enum verbatim)
is sufficient for v1 operator visibility; operator feedback on
which vendor merits a tighter `'needs-attention'` band arrives only
after real spend data flows.

**Implementation locations:**
- `apps/dashboard/src/config/infraCostBudgets.ts` — `INFRA_COST_BUDGETS`
  with `isMock: true` per entry; values flagged for finance review
  in inline `// why:` comments.
- `apps/dashboard/src/composables/useInfraCostWatchdog.ts` —
  accepts `budgets` as an injected argument (NOT reached into the
  config module directly) so a future finance-loop WP can swap the
  config without touching the composable.

**Packet:** WP-204 (EC-232).

**Drafted:** 2026-06-03 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---
