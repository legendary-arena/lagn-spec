# EC-225 — Dashboard Net Revenue + Paid-Action Errors Widgets (Execution Checklist)

**Source:** docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md
**Layer:** Client (`apps/dashboard/`)

## Pre-Session Actions (PS-1..PS-3) — Blocking

> WP-196 is contract-heavy: **eight** D-entries (D-19601..D-19606 plus the harden-round-2 D-19607 and D-19608), a forward server contract, a determinism contract with DateRange + hash extensions, an aggregation rule, a Shared Revenue Source Contract, and an ECharts Stacking Contract. PS-1..PS-3 enforce verbatim transcription discipline at session start. Execution may NOT begin until these three actions resolve.

- [ ] **PS-1 — D-entries locked verbatim.** The eight DECISIONS.md entries below MUST be transcribed into `docs/ai/DECISIONS.md` BYTE-IDENTICALLY to the strings in `§Locked Values — DECISIONS.md verbatim block` below. The executor MUST NOT paraphrase. Tightening D-entry wording requires a separate SPEC commit landing BEFORE the implementation session.
- [ ] **PS-2 — Index rows confirmed Pending.** `docs/ai/work-packets/WORK_INDEX.md` has a `[ ]` row for WP-196 with status `Draft` (with the harden-round-2 marker per its latest SPEC PR); `docs/ai/execution-checklists/EC_INDEX.md` has an EC-225 row with status `Draft`. (Both landed in the Phase 1 SPEC PR for EC-225 and its harden-round-2 follow-up.)
- [ ] **PS-3 — `// why:` comments cite the locked D-entries verbatim by number.** Every `// why:` comment mandated under `§Required // why: Comments` cites `D-19601`, `D-19602`, `D-19603`, `D-19604`, `D-19605`, `D-19606`, `D-19607`, or `D-19608` verbatim — paraphrased citations (e.g., "the four-bucket decomposition decision") are FAIL.

If any PS item is unsatisfied at session start, the executor STOPS and reports a `BLOCKED` disposition rather than attempting workarounds.

## Before Starting
- [ ] WP-157 complete ✅ — `apps/dashboard/` scaffold builds; `KpiCard.vue`, `BaseChart.vue`, the 4-state Widget Contract, and the design-token lock are in place.
- [ ] WP-162 complete ✅ — Aura dark-mode preset wired, `dashboard-theme-change` window event dispatches on theme toggle, the header/body/footer card structure is the default, and `RevenueChartWidget.vue` already subscribes to the theme event.
- [ ] `apps/dashboard/.env` contains `VITE_USE_MOCKS=true`; the `/monetization` page exists at `apps/dashboard/src/pages/monetization/MonetizationPage.vue` and is reachable behind the `admin` + `finance` role gates.
- [ ] `pnpm install` exits 0.
- [ ] `pnpm -r build` exits 0 (record baseline).
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (record baseline test count for the dashboard package).

## Locked Values (do not re-derive)

- **Money unit:** integer cents throughout the composable and mock generators. Floating-point dollar amounts are forbidden; the only floating-point in the composable is `netMarginRatio` (display ratio).
- **`REVENUE_DEDUCTIONS` placeholder shape (verbatim):**
  ```ts
  export const REVENUE_DEDUCTIONS: RevenueDeductionConfig = {
    royaltyPercent: 0.20,
    stripeFeePercent: 0.029,
    stripeFeeFixedCents: 30,
    infraCogsPercent: 0.05,
    isMock: true,
  };
  ```
  Percentages are decimal fractions (`0.20 = 20%`), never integers. `isMock: true` is the freshness-badge source of truth.
- **Per-day formula (verbatim, each day `i`):**
  ```
  royaltyCents    = Math.round(grossCents[i] * royaltyPercent)
  stripeFeesCents = Math.round(grossCents[i] * stripeFeePercent) + stripeFeeFixedCents
  infraCogsCents  = Math.round(grossCents[i] * infraCogsPercent)
  netCents        = grossCents[i] - royaltyCents - stripeFeesCents - infraCogsCents
  ```
  `Math.round` here is **round half toward +∞ / asymmetric half-up** — NOT banker's rounding / round-half-to-even (per the harden-round-2 wording fix). The composable's `// why:` comment cites this exact behavior. `netCents` is NEVER clamped to zero.
- **Aggregation rule (D-19604):** `totalGross = sum(series.gross[])`, `totalNet = sum(series.net[])`, `netMarginRatio = totalGross === 0 ? 0 : totalNet / totalGross`. NEVER recompute from raw gross (`totalRoyalty = round(totalGross * royaltyPercent)` is FAIL). Aggregates derive only from the already-rounded per-day arrays.
- **Numerical integrity (D-19604):** division permitted only when producing a ratio for display. Ratios MUST NOT be re-multiplied into money values.
- **Mock determinism seed (D-19605):** `seed = hash(range.start + '|' + range.end)`. Hash function is pure (no globals, no `Date.now()`, no module-load reads). Identical `range` input produces byte-identical output across calls, reloads, and widgets.
- **Mock generator output ranges (D-19605):** `webhookFailureRate ∈ [0.00, 0.05]`, `intentAbandonmentRate ∈ [0.10, 0.35]`. Counts derived AFTER rate is chosen: `count = round(total × rate)`; never independent draws.
- **`BillingHealth` type fields (exactly 8, all readonly):** `windowStart`, `windowEnd`, `webhookFailureRate`, `webhookFailureCount`, `webhookTotalCount`, `intentAbandonmentRate`, `intentAbandonedCount`, `intentTotalCount`. `windowStart` / `windowEnd` are ISO-8601 date strings (no time component, no timezone offset).
- **`NetRevenueSeries` fields (exactly 6, all `readonly` arrays):** `dates`, `gross`, `royalty`, `stripeFees`, `infraCogs`, `net`. Money arrays are integer cents; `dates` is `readonly string[]`.
- **Composable API (verbatim):** `useNetRevenueBreakdown(grossSeries, deductions)` returns `{ series, totalGross, totalNet, netMarginRatio }` — all `ComputedRef`. **No `netMarginPct`** (the rename to `netMarginRatio` is locked; the value is `0.0–1.0`, not `0–100`).
- **Future server endpoint path (D-19603):** `/metrics/billing/health`. Service function `fetchBillingHealth(range)` follows the `fetchRevenueHistory` mock-toggle pattern exactly.
- **Forward server contract (D-19603 extension):** response shape byte-compatible with `BillingHealth`; `0.0 ≤ webhookFailureRate ≤ 1.0`; `0.0 ≤ intentAbandonmentRate ≤ 1.0`; `webhookFailureCount = round(webhookTotalCount × webhookFailureRate)`; `intentAbandonedCount = round(intentTotalCount × intentAbandonmentRate)`; auth posture `authenticated-session-required` + `finance`/`admin` role gate.
- **Widget Contract states (per WP-157 + WP-196 §Widget State Semantics):** `loading` → skeleton or spinner (never a blank card); `error` → full-sentence message + NO chart; `empty` → message + NO chart; `data` → the chart/metric rows.
- **Freshness badge content:** literal string `MOCK` in the header right of both new widgets (the `RevenueChartWidget.vue:32` event-listener pattern is mirrored).
- **Net Revenue chart specifics:** stacked bar chart; band order bottom-to-top is `net → royalty → Stripe fees → infra COGS` (net at the bottom — "what we keep first"); colors `net → --p-primary-color`, `royalty → --p-text-muted-color`, `stripeFees → --p-content-border-color`, `infraCogs → --p-surface-border`. NO pie chart variant anywhere.
- **Operator interpretation footer copy (D-19606):** `"Net margin: X.X%"` for a non-negative range margin; `"Net margin: −X.X% (net loss)"` for a negative range margin (unicode minus `−` OR plain hyphen-minus `-` acceptable; the `(net loss)` qualifier IS mandatory).
- **Negative-net tooltip label (D-19606):** literal string `"Negative net day"` MUST appear in the tooltip for every day where `net < 0`. Informational only — no RYG color, no threshold, no alert hook anywhere in this WP.
- **Required test count:** `useNetRevenueBreakdown.test.ts` ships **exactly 12 tests** matching the WP body's §Required Tests numbering (tests 1–7 from the original draft + tests 8 (aggregation consistency) and 9 (referential stability) from harden-round-1 + tests 10 (DateRange normalization), 11 (hash determinism), and 12 (rate-zero safety guard) from harden-round-2).
- **DateRange normalization (D-19605 ext.):** `range.start` and `range.end` MUST be ISO `YYYY-MM-DD` strings (no time, no timezone, no `Z`). Range is inclusive both ends. `start > end` (lexical) at the service boundary MUST throw a full-sentence error naming both values. Normalization happens at the service boundary (`fetchBillingHealth`, `normalizeRange.ts`), NOT inside widgets.
- **Hash function (D-19605 ext.):** the seed hash is FNV-1a 32-bit (or equivalent simple non-crypto hash) defined in `apps/dashboard/src/services/hashRange.ts` with a `// why:` citing D-19605. Pure function; same input string → byte-identical integer output on every platform. Widgets and other mocks import this single function — no inline reimplementations.
- **Per-day tooltip margin formula (D-19606 ext.):** `dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]`. Tooltip uses per-day value; aggregate `netMarginRatio` is footer-only.
- **Billing health window (D-19603 ext.):** trailing 30 days from `range.end` (inclusive); both sparklines in `PaidActionErrorsWidget` plot exactly 30 daily data points.
- **Rate-zero safety guard (D-19603 ext.):** `displayRate = totalCount === 0 ? 0 : failureCount / totalCount`. `NaN` reaching the renderer is FAIL. Both `webhookFailureRate` and `intentAbandonmentRate` get the guard.
- **Shared Revenue Source Contract (D-19607):** widgets consume revenue history exclusively via `fetchRevenueHistory(range)` from `apps/dashboard/src/services/endpoints.ts`. Both revenue widgets share the same page-level `useDateRange` reference. Grep `apps/dashboard/src/widgets/` for `fetchRevenueHistory` returns exactly 2 hits; for `mockRevenueHistory` returns 0.
- **ECharts Stacking Contract (D-19608):** all four Net Revenue series share the literal stack identifier `'total'`. Series array order is fixed: `[net, royalty, stripeFees, infraCogs]` (index 0 = bottom band). Negative-net values use the same stack key (no separate negative-only stack).
- **Widget State Gate Pattern (structural enforcement of WP-157):** every widget has a single `state` computed in `<script setup>` returning `'loading' | 'error' | 'empty' | 'data'`. The `<template>` branches on it via a 4-arm `v-if` / `v-else-if` / `v-else` chain. `BaseChart` appears only inside the `v-else` (data) arm. Grep `v-if="state` returns exactly 1 hit per widget; the chart component appears below the `v-else`.

### DECISIONS.md verbatim block (PS-1 source)

> Transcribe these six entries BYTE-IDENTICALLY into `docs/ai/DECISIONS.md` during the governance close commit. Do not paraphrase, reorder, or reflow. Status flips from `(proposed)` to `Active` at landing time.

**D-19601 — Net Revenue Four-Bucket Decomposition + Integer-Cents Discipline.** Net revenue is decomposed into four buckets: gross, royalty, Stripe fees, infra COGS. All arithmetic in integer cents; floating-point dollars are forbidden. Rationale: The royalty obligation to Upper Deck Entertainment and Marvel is a Vision-level non-negotiable (Financial Sustainability §). Gross revenue alone obscures the true unit economics. Stripe fees and infra COGS are the next-largest fixed deductions and round out the model. Integer cents avoids the rounding-drift class of bug that surfaces when monthly totals are summed from floating-point dailies.

**D-19602 — Royalty Deduction Placeholder Posture.** Royalty deduction percentage ships as a flagged-mock placeholder; real numbers require finance review and a follow-up D-entry. Rationale: The royalty contract terms are operationally sensitive and outside the scope of a client-only widget WP. Locking the shape and the display posture now lets the real numbers swap in by editing a single config file when finance signs off.

**D-19603 — Paid-Action Error Union + Forward Server Contract + Window + Rate-Zero Guard.** Paid-action error visibility is the union of two surfaces — Stripe webhook fulfillment failure rate (`stripe_events.process_error IS NOT NULL`) and Checkout intent abandonment rate (`stripe_checkout_sessions.intent_status IN ('expired', 'canceled')`). The future server endpoint path is `/metrics/billing/health`. The forward contract (response shape byte-compatible with `BillingHealth`; `0.0 ≤ rate ≤ 1.0`; `count = round(total × rate)`; `authenticated-session-required` + `finance`/`admin` role gate) is locked in this WP so the follow-up server WP has zero schema ambiguity. **Harden-round-2 extensions:** the billing-health window is a trailing 30 days from `range.end` (inclusive); both sparklines plot exactly 30 daily data points; `displayRate = totalCount === 0 ? 0 : failureCount / totalCount` (NaN never reaches the renderer). Rationale: Webhook failures are a silent revenue leak — Stripe collected the money, but our entitlements table didn't flip, so the customer feels cheated and the operator never knows unless surfaced. Intent abandonment is the leading indicator of checkout-UX friction. Naming the forward contract here prevents the classic dashboard ↔ server drift bug where the server returns a slightly different shape than the client expects. The window + rate-zero extensions close the two most common sparkline/KPI bugs: variable point counts (operator's eye loses calibration) and zero-denominator producing NaN.

**D-19604 — Aggregation Derivation Rule + Numerical Integrity Guard.** Aggregate values exposed by the composable (`totalGross`, `totalNet`, `netMarginRatio`) derive ONLY from summing already-rounded per-day arrays — never from recomputing against raw inputs or aggregated raw totals. Division is permitted only when producing a ratio for display, and ratios MUST NOT be re-multiplied into money. Rationale: Recompute-from-aggregate is the most common financial-dashboard correctness bug: chart totals, tooltip totals, and table totals diverge by a few cents at month boundaries and the operator can't tell which one is real. Locking the derivation direction (per-day rounded → summed) means all three displays trace to the same source. The numerical-integrity rider blocks the related class of bug where a developer notices a ratio is "close to" a percentage and feeds it back into a money calculation.

**D-19605 — Mock Determinism Contract + DateRange Normalization + Hash Function.** Mock data on the dashboard is deterministic at the same standard as engine RNG: `seed = hash(range.start + '|' + range.end)`, pure, no `Math.random()` without a seeded wrapper. Identical `range` input produces byte-identical output across calls, reloads, and widgets. **Harden-round-2 extensions:** (1) **DateRange normalization** — `range.start` and `range.end` MUST be `YYYY-MM-DD` ISO strings (no time, no timezone, no `Z`); range is inclusive both ends; `start > end` (lexical) at the service boundary throws a full-sentence error naming both values; normalization happens at the service boundary (`fetchBillingHealth`, `normalizeRange.ts`), NOT inside widgets. (2) **Hash function contract** — the hash is FNV-1a 32-bit (or equivalent simple non-crypto hash) defined in `apps/dashboard/src/services/hashRange.ts` with a `// why:` citing D-19605; pure function, same input string → byte-identical integer output on every platform; widgets and mocks import this single function rather than re-implementing. Rationale: The engine's determinism guarantees only carry value if the rest of the stack matches them. A flaky mock causes flaky tests, flaky screenshots, and operators second-guessing what they saw on Tuesday. Hashing the range string is the cheapest stable seed source available — no globals, no module-load-time reads, no implicit `Date.now()`. The contract is stricter than "stable within a session" because cross-reload stability is what makes "I saw X yesterday" debuggable. The normalization and hash extensions close the two cross-machine drift sources: variable input formats (`'2026-06-01'` vs `'2026-06-01T00:00:00Z'` seed differently) and engine-specific string-hash conventions.

**D-19606 — Operator Interpretation Hook + Negative-Net First-Class Signal.** The Net Revenue widget footer displays a single `"Net margin: X.X%"` label for the selected range — informational only, no RYG / threshold / alert hook in this WP. Negative-net days surface explicitly via tooltip label `"Negative net day"`; range-negative net margin renders `"Net margin: −X.X% (net loss)"`. The harden-round-2 extension locks the chart tooltip margin formula as **per-day** (`dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]`), distinct from the aggregate `netMarginRatio` used in the footer — both numbers exist; they answer different questions. Rationale: A dashboard widget that's purely descriptive forces the operator to do mental math under load; a single interpretive cue ("are we making money or not") collapses the decision. Deferring RYG to a future WP is deliberate — real percentages aren't known yet, so any threshold today would be meaningless and bake in the wrong defaults. Surfacing negative net explicitly (rather than just rendering a smaller bar) turns the highest-signal edge case into the most visible signal — exactly inverted from the common bug of clamping it away. The per-day vs aggregate margin split prevents the related bug where the tooltip shows the range average on every hover, telling the operator the wrong number for the surface they're reading.

**D-19607 — Shared Revenue Source Contract.** `NetRevenueChartWidget` and `RevenueChartWidget` MUST consume the same `fetchRevenueHistory(range)` call path. Direct calls to `mockRevenueHistory` (or any lower-level mock generator) from widget code are forbidden. Both widgets MUST be passed the SAME `range` reference sourced from the page-level `useDateRange` composable. A single fetch invocation feeds both widgets so the mock generator is called once per range change, not once per widget. Rationale: The harden-round-1 acceptance criterion "Cross-widget consistency: sum of NetRevenueChartWidget gross series exactly equals RevenueChartWidget total" was prose-level only — auditable manually but not structurally enforced. Without this contract, a developer adding a third revenue widget could legitimately construct its own series and watch the cross-widget totals drift by mock-determinism distance. Locking the call path means the grep is the audit: exactly 2 `fetchRevenueHistory` widget call sites, zero `mockRevenueHistory` widget call sites.

**D-19608 — ECharts Stacking Contract.** All four Net Revenue series share the literal stack identifier `'total'`. Series array order is fixed bottom-to-top: net (index 0), royalty (index 1), stripeFees (index 2), infraCogs (index 3). Negative values use the same stack key — ECharts handles mixed-sign stacked bars correctly on a single stack key. Tooltip series-list ordering matches series-array order. Rationale: ECharts handles mixed-sign stacked bars correctly only when every series shares the stack key. A well-meaning developer might think the negative band "looks wrong" and assign the net series a separate stack for negative days — which detaches the negative bar from the positive stack and visually reads as a different metric. Locking the contract structurally prevents this class of "fix" from ever being merged.

## Guardrails

- **No floating-point dollars anywhere in the composable or mock generators.** All money arithmetic in integer cents. `parseFloat` and `.toFixed()` are FAIL inside the composable (formatting at the render boundary is OK).
- **No recompute-from-aggregate (D-19604).** `totalGross`, `totalNet`, and per-bucket totals derive ONLY from `sum(series.<bucket>[])`. Computing `round(totalGross * royaltyPercent)` to get a bucket total is FAIL.
- **No ratio-into-money (D-19604).** `netMarginRatio` (or any computed ratio) MUST NOT be re-multiplied into a cents value downstream.
- **No bare `Math.random()` in `apps/dashboard/src/services/` or `apps/dashboard/src/composables/`** (D-19605). All randomness routed through a seeded PRNG wrapper whose seed derives from `hash(range.start + '|' + range.end)`.
- **No clamping or hiding negative net** (D-19606). Negative-net days render as-is in the chart AND carry the `"Negative net day"` tooltip label. Range-negative footers render the `(net loss)` qualifier.
- **No RYG color, threshold, or alert hook on the operator footer** (D-19606 deliberate deferral). The footer is informational only in this WP.
- **No `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, or `@legendary-arena/server` imports** anywhere in `apps/dashboard/`.
- **No hard-coded hex colors for structural elements** (cards, borders, text). PrimeVue design tokens only. Severity status uses PrimeVue severity classes, not hex.
- **No pie chart variant** for any visualization in this WP.
- **No new npm dependencies.** ECharts wrapper + PrimeVue + composable pattern are the only tools used.
- **No `apps/server/` files modified.** No SQL queries, no new HTTP endpoints, no migration changes.
- **No `docs/ai/REFERENCE/api-endpoints.md` edits.** The future `/metrics/billing/health` row is the server-implementation follow-up WP's responsibility.
- **`MonetizationPage.vue` non-overlap with parallel WPs.** This WP adds two widgets BELOW the existing `RevenueChartWidget`; do not modify the existing widget, do not relocate it. If a parallel WP touches the same page (e.g., WP-198's VisionCard / two-column grid), the merge order discipline is set by whichever WP lands first on `main`; this EC's executor confirms `git status` shows no conflicting `MonetizationPage.vue` edits at session start.
- **No Pinia store for billing health.** Composable + service-function pattern only.
- **The future server endpoint path is named exactly `/metrics/billing/health`** — locked here so the follow-up server WP has zero naming ambiguity.
- **DateRange normalization at the service boundary** (D-19605 ext.). `range.start` / `range.end` arrive as `YYYY-MM-DD` ISO strings; `fetchBillingHealth` and any other range-consuming service function call `normalizeRange()` BEFORE hashing or generating mock data. `start > end` throws a full-sentence error. Widgets never see un-normalized ranges.
- **Hash function single source** (D-19605 ext.). All range-hashing for mock seeds goes through `apps/dashboard/src/services/hashRange.ts` (FNV-1a or equivalent). No inline reimplementations in widgets, composables, or other mock files.
- **Shared revenue source** (D-19607). Widget files MUST NOT call `mockRevenueHistory` directly; the only entry point is `fetchRevenueHistory(range)`. Both revenue widgets share the same `useDateRange` reference; a single `useFetch` invocation feeds both.
- **ECharts stack key** (D-19608). All four Net Revenue series carry `stack: 'total'` literal. No separate stack for negative values. Series array order = `[net, royalty, stripeFees, infraCogs]`.
- **Widget state gate** (structural). Single `state` computed in `<script setup>`; 4-arm `v-if` / `v-else-if` / `v-else` template; `BaseChart` only inside the `v-else` (data) arm.
- **Per-day tooltip margin** (D-19606 ext.). Chart tooltip formatter computes `dayMarginRatio` from per-day values; never reads the composable's aggregate `netMarginRatio`.
- **Billing health window = 30 days exact** (D-19603 ext.). Both `PaidActionErrorsWidget` sparklines plot exactly 30 daily data points; fewer is FAIL.
- **Rate-zero guard** (D-19603 ext.). `displayRate = totalCount === 0 ? 0 : failureCount / totalCount`. No `NaN` reaches the renderer.
- **No "banker's rounding" wording** (harden-round-2 wording fix). `Math.round` is round-half-toward-+∞ / asymmetric half-up. The `// why:` comment on the per-day formula site cites this exact behavior.

## Required `// why:` Comments

- `useNetRevenueBreakdown.ts` — banker's-rounding choice on the per-day formula: cite **D-19601**; explain why `Math.round` is acceptable here and why integer cents are mandatory.
- `useNetRevenueBreakdown.ts` — aggregation site (`totalGross = sum(...)`): cite **D-19604**; explain the recompute-from-aggregate failure mode this guards against.
- `useNetRevenueBreakdown.ts` — `netMarginRatio` computation: cite **D-19604**; explain why this is the only division in the composable and why the ratio must never be re-multiplied into a money value.
- `useNetRevenueBreakdown.ts` — input-immutability site: explain why the gross series passed in is treated as `readonly` and never mutated (mock store is shared across widgets — referential safety).
- `billingHealthMocks.ts` (or wherever the seed lives) — `seed = hash(range.start + '|' + range.end)` derivation: cite **D-19605**; explain the cross-call / cross-reload / cross-widget stability requirement.
- `billingHealthMocks.ts` — `count = round(total × rate)` derivation: cite **D-19603**; explain why count is derived AFTER rate (not independently drawn) so the displayed pair never visually disagrees.
- `revenueDeductions.ts` — `isMock: true` flag: cite **D-19602**; explain that the placeholder percentages require finance review before the flag flips.
- `endpoints.ts` near `fetchBillingHealth`: cite **D-19603**; explain that `/metrics/billing/health` is a future server-target path; the follow-up server WP owns the catalog row.
- `NetRevenueChartWidget.vue` — operator interpretation footer: cite **D-19606**; explain why the footer is informational only (no RYG/threshold/alert in this WP) and what the future WP will layer on top.
- `NetRevenueChartWidget.vue` — negative-net tooltip-label branch: cite **D-19606**; explain why a separate label is mandatory (negative day is the highest-signal edge case; visual smaller-bar alone is insufficient).
- `NetRevenueChartWidget.vue` — `dashboard-theme-change` listener: cite the `RevenueChartWidget.vue:32` precedent; explain that the canvas re-resolves PrimeVue tokens because echarts cannot consume CSS custom properties directly.
- `PaidActionErrorsWidget.vue` — Widget State Semantics enforcement site: cite **WP-157 Widget Contract + WP-196 §Widget State Semantics**; explain that `error`/`empty` MUST NOT render the sparkline (state ambiguity is contract breach).
- `apps/dashboard/src/services/hashRange.ts` — module-header `// why:`: cite **D-19605** (mock determinism contract + hash function extension); explain why FNV-1a is the chosen algorithm (pure, cross-platform stable, no engine-specific behavior) and why it must live in exactly one file.
- `apps/dashboard/src/services/normalizeRange.ts` — module-header `// why:`: cite **D-19605** (DateRange normalization extension); explain the `YYYY-MM-DD`-only contract, the inclusive-both-ends rule, and why normalization happens at the service boundary rather than inside widgets (single canonical form before hashing).
- `endpoints.ts` near `fetchBillingHealth` — boundary normalization call: cite **D-19605**; explain why the call to `normalizeRange(range)` precedes the mock invocation (widgets pass `range` through reactive refs that may carry stale formats during transitions).
- `NetRevenueChartWidget.vue` — ECharts stack key on all four series: cite **D-19608**; explain that the literal `'total'` is the same across all series so ECharts can position mixed-sign bars correctly.
- `NetRevenueChartWidget.vue` — tooltip formatter (per-day margin): cite **D-19606**; explain why this uses per-day `dayMarginRatio = grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]` and NOT the composable's aggregate `netMarginRatio`.
- `NetRevenueChartWidget.vue` AND `PaidActionErrorsWidget.vue` — `state` computed declaration: cite **WP-157 Widget Contract + WP-196 §Widget State Gate Pattern**; explain the four-arm gate.
- `MonetizationPage.vue` (or wherever the shared `useFetch` invocation lives) — single shared-fetch call: cite **D-19607**; explain why both revenue widgets consume the SAME fetch result (cross-widget consistency is structural, not best-effort).

## Files to Produce

- `apps/dashboard/src/widgets/NetRevenueChartWidget.vue` — **new** — stacked-bar 4-bucket chart; tooltip with all four buckets + net margin %; theme-change subscription; operator interpretation footer; negative-net tooltip label.
- `apps/dashboard/src/widgets/PaidActionErrorsWidget.vue` — **new** — two metric rows (rate + count + 30-day sparkline) for webhook failures and intent abandonment; 4-state Widget Contract.
- `apps/dashboard/src/composables/useNetRevenueBreakdown.ts` — **new** — per-day formula + aggregation rule + numerical integrity guard + input-immutability.
- `apps/dashboard/src/composables/useNetRevenueBreakdown.test.ts` — **new** — 9 tests per the WP §Required Tests numbering.
- `apps/dashboard/src/config/revenueDeductions.ts` — **new** — `RevenueDeductionConfig` interface + `REVENUE_DEDUCTIONS` placeholder constant (`isMock: true`).
- `apps/dashboard/src/services/billingHealthMocks.ts` — **new** — seeded mock generator for `BillingHealth`; hash-of-range seed (imports `hashRange`); imports `normalizeRange` at entry; applies the 30-day trailing window + rate-zero guard.
- `apps/dashboard/src/services/hashRange.ts` — **new** — pure FNV-1a 32-bit hash function with D-19605 `// why:`; single source for all range-seeded mocks.
- `apps/dashboard/src/services/normalizeRange.ts` — **new** — `range.start` / `range.end` → `YYYY-MM-DD` normalization; throws on `start > end`; D-19605 ext. `// why:`.
- `apps/dashboard/src/services/endpoints.ts` — **modified** — add `fetchBillingHealth(range)` following the `fetchRevenueHistory` mock-toggle pattern.
- `apps/dashboard/src/services/mocks.ts` — **modified** — export the new billing-health mock generator.
- `apps/dashboard/src/types/index.ts` — **modified** — add `BillingHealth` interface (8 readonly fields).
- `apps/dashboard/src/pages/monetization/MonetizationPage.vue` — **modified** — add both widgets below the existing `RevenueChartWidget`; preserve existing grid structure.
- `docs/ai/STATUS.md` — **modified** — `### WP-196 / EC-225 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — append D-19601 through D-19606 BYTE-IDENTICALLY to the §DECISIONS.md verbatim block above.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-196 row `[x]` with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-225 row flipped to Done.

## After Completing

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (baseline + new file; `useNetRevenueBreakdown.test.ts` contributes exactly 12 tests).
- [ ] `useNetRevenueBreakdown.test.ts` passes all 12 numbered tests AND: (a) test 8 assertion is `assert.deepStrictEqual(breakdown.totalNet.value, series.net.reduce((a, b) => a + b, 0))` or equivalent integer-equal; (b) test 9 asserts structural equality across two composable calls with the same input; (c) test 10 asserts `normalizeRange({ start: '2026-06-02', end: '2026-06-01' })` throws a full-sentence error mentioning both dates; (d) test 11 asserts `hashRange('a') === hashRange('a')` and `hashRange('a') !== hashRange('b')` (smoke); (e) test 12 asserts billing-health mock returns `webhookFailureRate === 0` when `webhookTotalCount === 0`.
- [ ] **Money arithmetic grep** — `grep -rn "parseFloat\|\.toFixed(" apps/dashboard/src/composables/useNetRevenueBreakdown.ts` returns zero matches.
- [ ] **Recompute-from-aggregate grep** — `grep -nE "totalGross\s*\*|totalNet\s*\*" apps/dashboard/src/composables/useNetRevenueBreakdown.ts` returns zero matches (no aggregate-times-percentage pattern).
- [ ] **Ratio-into-money grep** — `grep -nE "netMarginRatio\s*\*" apps/dashboard/src/` returns zero matches across the dashboard tree.
- [ ] **Mock determinism grep** — `grep -rn "Math\.random" apps/dashboard/src/services/ apps/dashboard/src/composables/` returns zero matches, OR every match is inside a documented seeded-PRNG wrapper file whose module-header `// why:` cites D-19605.
- [ ] **Negative-net label grep** — `grep -n "Negative net day" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥1 match.
- [ ] **Operator footer copy grep** — `grep -nE "Net margin:" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥1 match AND `grep -n "(net loss)" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥1 match (the `(net loss)` qualifier branch is present).
- [ ] **Field-set drift assertion (`BillingHealth`).** Test asserts `Object.keys(billingHealth).sort()` deep-equals the 8-key sorted array `['intentAbandonedCount','intentAbandonmentRate','intentTotalCount','webhookFailureCount','webhookFailureRate','webhookTotalCount','windowEnd','windowStart']`. A ninth field silently landing is FAIL.
- [ ] **Field-set drift assertion (`NetRevenueSeries`).** Test asserts `Object.keys(series).sort()` deep-equals `['dates','gross','infraCogs','net','royalty','stripeFees']`. Seventh field is FAIL.
- [ ] **No `netMarginPct` straggler** — `grep -rn "netMarginPct" apps/dashboard/` returns zero matches.
- [ ] **No "banker's rounding" wording** — `grep -rni "banker.s rounding" apps/dashboard/src/composables/` returns zero matches (the wording fix per harden-round-2).
- [ ] **Shared revenue source — widget calls (D-19607).** `grep -rn "fetchRevenueHistory" apps/dashboard/src/widgets/` returns exactly **2 matches** (one in `RevenueChartWidget.vue`, one in `NetRevenueChartWidget.vue`). `grep -rn "mockRevenueHistory" apps/dashboard/src/widgets/` returns **zero matches**.
- [ ] **Single `useDateRange` source (D-19607).** `grep -rn "useDateRange" apps/dashboard/src/widgets/NetRevenueChartWidget.vue apps/dashboard/src/widgets/RevenueChartWidget.vue` returns the same import path in both files; no widget defines its own range ref.
- [ ] **ECharts stack key (D-19608).** `grep -n "stack: 'total'" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥ 4 matches (one per series in the chart option).
- [ ] **Widget state gate (structural).** For each new widget: `grep -n "v-if=\"state ===" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` AND `grep -n "v-if=\"state ===" apps/dashboard/src/widgets/PaidActionErrorsWidget.vue` each return exactly 1 hit (the `'loading'` arm); plus matching `v-else-if` for `'error'` and `'empty'` and a single `v-else` for the chart/data render.
- [ ] **Hash function single source (D-19605 ext.).** `grep -rn "fnv\|FNV\|hashRange" apps/dashboard/src/` shows the implementation appears in exactly ONE source file (`hashRange.ts`); all other matches are imports of that function.
- [ ] **DateRange normalization at boundary (D-19605 ext.).** `grep -n "normalizeRange" apps/dashboard/src/services/endpoints.ts` returns ≥ 1 match (called by `fetchBillingHealth` at entry); `grep -rn "normalizeRange" apps/dashboard/src/widgets/` returns zero matches (widgets never call normalization directly).
- [ ] **Billing health window literal (D-19603 ext.).** `grep -n "30" apps/dashboard/src/services/billingHealthMocks.ts` returns ≥ 1 match in context of the trailing window (the literal `30` for the day count is present with a `// why:` reference to D-19603).
- [ ] **Rate-zero guard (D-19603 ext.).** `grep -n "totalCount === 0" apps/dashboard/src/services/billingHealthMocks.ts` returns ≥ 1 match; absence of the guard is FAIL.
- [ ] **Per-day tooltip margin (D-19606 ext.).** `grep -n "dayMarginRatio\|netCents\[.*\] *\/ *grossCents" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥ 1 match (per-day computation inside the tooltip formatter); `grep -n "netMarginRatio" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns matches only in the footer-label site, never inside the tooltip formatter.
- [ ] **Layer-boundary grep** — `grep -rn "@legendary-arena/\(game-engine\|registry\|preplan\|server\)" apps/dashboard/` returns zero matches.
- [ ] **Hex-color grep** — `grep -rnE "#[0-9A-Fa-f]{3,8}" apps/dashboard/src/widgets/NetRevenueChartWidget.vue apps/dashboard/src/widgets/PaidActionErrorsWidget.vue` returns zero matches.
- [ ] **Pie chart drift** — `grep -rni "pie" apps/dashboard/src/widgets/NetRevenueChartWidget.vue apps/dashboard/src/widgets/PaidActionErrorsWidget.vue` returns zero matches.
- [ ] **No new npm deps** — `git diff --name-only origin/main -- package.json apps/dashboard/package.json pnpm-lock.yaml` shows zero changes.
- [ ] **No server-side edits** — `git diff --name-only origin/main -- apps/server/ data/migrations/` produces empty output.
- [ ] **api-endpoints.md untouched** — `git diff --name-only origin/main -- docs/ai/REFERENCE/api-endpoints.md` produces empty output.
- [ ] **Widget Contract states** — manual verification on `/monetization`: throttle network to force `loading` (skeleton renders, not blank); break the mock to force `error` (full-sentence text + NO chart); pass empty array to force `empty` (message + NO chart); normal path renders `data`.
- [ ] **Cross-widget consistency (manual)** — on `/monetization` with a fixed range, `sum(NetRevenueChartWidget.series.gross)` exactly equals `RevenueChartWidget` total. Any divergence indicates duplicate-mock-source drift.
- [ ] **Mock determinism (manual)** — open `/monetization`, note webhook failure rate; reload the page; the same range MUST show the byte-identical rate. Switch to a different range and back; original rate returns.
- [ ] **Operator footer behavior (manual)** — synthesize a gross series small enough to force net loss for the range; footer renders `"Net margin: −X.X% (net loss)"`. Restore normal series; footer renders `"Net margin: X.X%"` without `(net loss)`.
- [ ] **Negative-net tooltip (manual)** — hover a day with `net < 0` on the chart; tooltip shows `"Negative net day"` alongside the bucket breakdown.
- [ ] `git diff --name-only` matches the §Files to Produce list exactly (no out-of-scope edits).
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` carries D-19601 through D-19608 **byte-identically to the §DECISIONS.md verbatim block above** (PS-1 enforcement — no paraphrase; D-19603 and D-19605 and D-19606 each carry their harden-round-2 extension sentences verbatim); `docs/ai/work-packets/WORK_INDEX.md` WP-196 row `[x]` with execution date; `docs/ai/execution-checklists/EC_INDEX.md` EC-225 row flipped to Done with execution summary.

## Common Failure Smells

- Monthly net total disagrees with daily-sum by a few cents → recompute-from-aggregate snuck in (`totalRoyalty = round(totalGross * royaltyPercent)` or equivalent); D-19604 violation. Fix: derive every aggregate from `sum(series.<bucket>[])`.
- Two reloads with the same range show different mock webhook rates → mock seeded from `Date.now()` or `Math.random()` instead of `hash(range.start + '|' + range.end)`; D-19605 violation. Fix: rebuild the generator on the hash-of-range seed.
- `netMarginRatio` re-multiplied into a cents value somewhere downstream → D-19604 numerical-integrity violation. Fix: ratios are display-only; never round-trip them through the money pipeline.
- `netMarginPct` still appears anywhere in `apps/dashboard/` → harden-round rename incomplete. Fix: `grep -rn netMarginPct apps/dashboard/` must return zero.
- Tooltip on a negative-net day shows only bucket values (no label) → D-19606 violation. Fix: branch the tooltip formatter on `net < 0` and inject the `"Negative net day"` label.
- Range total is negative but footer omits `(net loss)` → D-19606 violation. Fix: branch the footer label on `netMarginRatio < 0`.
- Operator footer renders an RYG color or has a threshold comparison → premature future-WP behavior. Fix: footer is informational-only in this WP; RYG is deferred.
- `error` state renders both the error message AND the chart → Widget State Semantics violation. Fix: `error` MUST render NO chart, only the full-sentence message.
- `loading` state renders a blank card → Widget State Semantics violation. Fix: skeleton or spinner is mandatory; blank card is FAIL.
- DECISIONS.md entry for D-19601..D-19606 deviates from the EC's §DECISIONS.md verbatim block → PS-1 violation. The transcription must be byte-identical; a single reworded sentence is FAIL.
- `// why:` comment cites "the four-bucket decomposition decision" or paraphrases D-19601..D-19606 → PS-3 violation. The comment MUST cite the D-number verbatim.
- New `apps/dashboard/package.json` dependency line → guardrail violation (no new npm deps). Fix: reuse the existing echarts + PrimeVue stack.
- `git diff` shows a touched file under `apps/server/` or `data/migrations/` → scope-creep violation. Fix: revert; the server endpoint is a separate WP.
- Net Revenue and Revenue Trend widgets show different gross totals for the same range → Shared Revenue Source Contract violated. Fix: grep `apps/dashboard/src/widgets/` must show exactly 2 `fetchRevenueHistory` call sites and zero `mockRevenueHistory` call sites (D-19607).
- Two browser reloads of the same range show different mock values → DateRange normalization missed somewhere (e.g., `range.start` arrived with a `T00:00:00.000Z` suffix in one path, plain `YYYY-MM-DD` in another). Fix: normalize at the service boundary (D-19605 ext.); widgets see only normalized strings.
- Operator on a different machine sees different mock values for the same range → hash function depends on engine-specific behavior, or was re-implemented in a second file. Fix: import from `hashRange.ts`; verify FNV-1a output via the cross-platform smoke test (D-19605 ext.).
- Negative-net day bar visually detached from the positive stack → a series was assigned a different `stack` key for negative values. Fix: every series uses literal `stack: 'total'` (D-19608).
- Chart tooltip shows the same margin percentage on every day → tooltip formatter is reading the composable's aggregate `netMarginRatio` instead of computing per-day. Fix: compute per-day `dayMarginRatio` inside the tooltip formatter (D-19606 ext.).
- Sparkline shows 22 points on one render and 30 on another → window definition not enforced. Fix: trailing 30 days from `range.end`, exactly 30 daily points (D-19603 ext.).
- Rate displays as `NaN%` in the operator UI → zero-denominator slipped past the guard. Fix: branch on `totalCount === 0` upstream of the renderer (D-19603 ext.).
- Widget renders chart AND a transient error message simultaneously → render branching used independent `v-if`s on `loading` / `error` instead of the single `state` gate. Fix: rewrite the template to the 4-arm chain on a single `state` computed (Widget State Gate Pattern).
- `// why:` comment on the per-day formula still calls `Math.round` "banker's rounding" → harden-round-2 wording fix not applied. Fix: cite "round half toward +∞ / asymmetric half-up" instead (and confirm with the grep gate above).
