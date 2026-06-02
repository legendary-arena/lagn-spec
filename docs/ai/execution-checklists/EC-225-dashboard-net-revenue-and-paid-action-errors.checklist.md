# EC-225 — Dashboard Net Revenue + Paid-Action Errors Widgets (Execution Checklist)

**Source:** docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md
**Layer:** Client (`apps/dashboard/`)

## Pre-Session Actions (PS-1..PS-3) — Blocking

> WP-196 is contract-heavy: six D-entries, a forward server contract, a determinism contract, and an aggregation rule. PS-1..PS-3 enforce verbatim transcription discipline at session start. Execution may NOT begin until these three actions resolve.

- [ ] **PS-1 — D-entries locked verbatim.** The six DECISIONS.md entries below MUST be transcribed into `docs/ai/DECISIONS.md` BYTE-IDENTICALLY to the strings in `§Locked Values — DECISIONS.md verbatim block` below. The executor MUST NOT paraphrase. Tightening D-entry wording requires a separate SPEC commit landing BEFORE the implementation session.
- [ ] **PS-2 — Index rows confirmed Pending.** `docs/ai/work-packets/WORK_INDEX.md` has a `[ ]` row for WP-196 with status `Draft` (with the harden-round-1 marker per the SPEC PR #178); `docs/ai/execution-checklists/EC_INDEX.md` has an EC-225 row with status `Draft`. (Both landed in the Phase 1 SPEC PR for EC-225.)
- [ ] **PS-3 — `// why:` comments cite the locked D-entries verbatim by number.** Every `// why:` comment mandated under `§Required // why: Comments` cites `D-19601`, `D-19602`, `D-19603`, `D-19604`, `D-19605`, or `D-19606` verbatim — paraphrased citations (e.g., "the four-bucket decomposition decision") are FAIL.

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
  `Math.round` is banker's rounding (documented in the `// why:` comment per PS-3). `netCents` is NEVER clamped to zero.
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
- **Required test count:** `useNetRevenueBreakdown.test.ts` ships **exactly 9 tests** matching the WP body's §Required Tests numbering (tests 1–7 from the original draft + tests 8 (aggregation consistency) and 9 (referential stability) from the harden pass).

### DECISIONS.md verbatim block (PS-1 source)

> Transcribe these six entries BYTE-IDENTICALLY into `docs/ai/DECISIONS.md` during the governance close commit. Do not paraphrase, reorder, or reflow. Status flips from `(proposed)` to `Active` at landing time.

**D-19601 — Net Revenue Four-Bucket Decomposition + Integer-Cents Discipline.** Net revenue is decomposed into four buckets: gross, royalty, Stripe fees, infra COGS. All arithmetic in integer cents; floating-point dollars are forbidden. Rationale: The royalty obligation to Upper Deck Entertainment and Marvel is a Vision-level non-negotiable (Financial Sustainability §). Gross revenue alone obscures the true unit economics. Stripe fees and infra COGS are the next-largest fixed deductions and round out the model. Integer cents avoids the rounding-drift class of bug that surfaces when monthly totals are summed from floating-point dailies.

**D-19602 — Royalty Deduction Placeholder Posture.** Royalty deduction percentage ships as a flagged-mock placeholder; real numbers require finance review and a follow-up D-entry. Rationale: The royalty contract terms are operationally sensitive and outside the scope of a client-only widget WP. Locking the shape and the display posture now lets the real numbers swap in by editing a single config file when finance signs off.

**D-19603 — Paid-Action Error Union + Forward Server Contract.** Paid-action error visibility is the union of two surfaces — Stripe webhook fulfillment failure rate (`stripe_events.process_error IS NOT NULL`) and Checkout intent abandonment rate (`stripe_checkout_sessions.intent_status IN ('expired', 'canceled')`). The future server endpoint path is `/metrics/billing/health`. The forward contract (response shape byte-compatible with `BillingHealth`; `0.0 ≤ rate ≤ 1.0`; `count = round(total × rate)`; `authenticated-session-required` + `finance`/`admin` role gate) is locked in this WP so the follow-up server WP has zero schema ambiguity. Rationale: Webhook failures are a silent revenue leak — Stripe collected the money, but our entitlements table didn't flip, so the customer feels cheated and the operator never knows unless surfaced. Intent abandonment is the leading indicator of checkout-UX friction. Naming the forward contract here prevents the classic dashboard ↔ server drift bug where the server returns a slightly different shape than the client expects.

**D-19604 — Aggregation Derivation Rule + Numerical Integrity Guard.** Aggregate values exposed by the composable (`totalGross`, `totalNet`, `netMarginRatio`) derive ONLY from summing already-rounded per-day arrays — never from recomputing against raw inputs or aggregated raw totals. Division is permitted only when producing a ratio for display, and ratios MUST NOT be re-multiplied into money. Rationale: Recompute-from-aggregate is the most common financial-dashboard correctness bug: chart totals, tooltip totals, and table totals diverge by a few cents at month boundaries and the operator can't tell which one is real. Locking the derivation direction (per-day rounded → summed) means all three displays trace to the same source. The numerical-integrity rider blocks the related class of bug where a developer notices a ratio is "close to" a percentage and feeds it back into a money calculation.

**D-19605 — Mock Determinism Contract.** Mock data on the dashboard is deterministic at the same standard as engine RNG: `seed = hash(range.start + '|' + range.end)`, pure, no `Math.random()` without a seeded wrapper. Identical `range` input produces byte-identical output across calls, reloads, and widgets. Rationale: The engine's determinism guarantees only carry value if the rest of the stack matches them. A flaky mock causes flaky tests, flaky screenshots, and operators second-guessing what they saw on Tuesday. Hashing the range string is the cheapest stable seed source available — no globals, no module-load-time reads, no implicit `Date.now()`. The contract is stricter than "stable within a session" because cross-reload stability is what makes "I saw X yesterday" debuggable.

**D-19606 — Operator Interpretation Hook + Negative-Net First-Class Signal.** The Net Revenue widget footer displays a single `"Net margin: X.X%"` label for the selected range — informational only, no RYG / threshold / alert hook in this WP. Negative-net days surface explicitly via tooltip label `"Negative net day"`; range-negative net margin renders `"Net margin: −X.X% (net loss)"`. Rationale: A dashboard widget that's purely descriptive forces the operator to do mental math under load; a single interpretive cue ("are we making money or not") collapses the decision. Deferring RYG to a future WP is deliberate — real percentages aren't known yet, so any threshold today would be meaningless and bake in the wrong defaults. Surfacing negative net explicitly (rather than just rendering a smaller bar) turns the highest-signal edge case into the most visible signal — exactly inverted from the common bug of clamping it away.

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

## Files to Produce

- `apps/dashboard/src/widgets/NetRevenueChartWidget.vue` — **new** — stacked-bar 4-bucket chart; tooltip with all four buckets + net margin %; theme-change subscription; operator interpretation footer; negative-net tooltip label.
- `apps/dashboard/src/widgets/PaidActionErrorsWidget.vue` — **new** — two metric rows (rate + count + 30-day sparkline) for webhook failures and intent abandonment; 4-state Widget Contract.
- `apps/dashboard/src/composables/useNetRevenueBreakdown.ts` — **new** — per-day formula + aggregation rule + numerical integrity guard + input-immutability.
- `apps/dashboard/src/composables/useNetRevenueBreakdown.test.ts` — **new** — 9 tests per the WP §Required Tests numbering.
- `apps/dashboard/src/config/revenueDeductions.ts` — **new** — `RevenueDeductionConfig` interface + `REVENUE_DEDUCTIONS` placeholder constant (`isMock: true`).
- `apps/dashboard/src/services/billingHealthMocks.ts` — **new** — seeded mock generator for `BillingHealth`; hash-of-range seed.
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
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (baseline + new file; `useNetRevenueBreakdown.test.ts` contributes exactly 9 tests).
- [ ] `useNetRevenueBreakdown.test.ts` passes all 9 numbered tests AND the test 8 assertion is `assert.deepStrictEqual(breakdown.totalNet.value, series.net.reduce((a, b) => a + b, 0))` (or equivalent integer-equal assertion); test 9 asserts structural equality across two composable calls with the same input.
- [ ] **Money arithmetic grep** — `grep -rn "parseFloat\|\.toFixed(" apps/dashboard/src/composables/useNetRevenueBreakdown.ts` returns zero matches.
- [ ] **Recompute-from-aggregate grep** — `grep -nE "totalGross\s*\*|totalNet\s*\*" apps/dashboard/src/composables/useNetRevenueBreakdown.ts` returns zero matches (no aggregate-times-percentage pattern).
- [ ] **Ratio-into-money grep** — `grep -nE "netMarginRatio\s*\*" apps/dashboard/src/` returns zero matches across the dashboard tree.
- [ ] **Mock determinism grep** — `grep -rn "Math\.random" apps/dashboard/src/services/ apps/dashboard/src/composables/` returns zero matches, OR every match is inside a documented seeded-PRNG wrapper file whose module-header `// why:` cites D-19605.
- [ ] **Negative-net label grep** — `grep -n "Negative net day" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥1 match.
- [ ] **Operator footer copy grep** — `grep -nE "Net margin:" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥1 match AND `grep -n "(net loss)" apps/dashboard/src/widgets/NetRevenueChartWidget.vue` returns ≥1 match (the `(net loss)` qualifier branch is present).
- [ ] **Field-set drift assertion (`BillingHealth`).** Test asserts `Object.keys(billingHealth).sort()` deep-equals the 8-key sorted array `['intentAbandonedCount','intentAbandonmentRate','intentTotalCount','webhookFailureCount','webhookFailureRate','webhookTotalCount','windowEnd','windowStart']`. A ninth field silently landing is FAIL.
- [ ] **Field-set drift assertion (`NetRevenueSeries`).** Test asserts `Object.keys(series).sort()` deep-equals `['dates','gross','infraCogs','net','royalty','stripeFees']`. Seventh field is FAIL.
- [ ] **No `netMarginPct` straggler** — `grep -rn "netMarginPct" apps/dashboard/` returns zero matches.
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
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` carries D-19601 through D-19606 **byte-identically to the §DECISIONS.md verbatim block above** (PS-1 enforcement — no paraphrase); `docs/ai/work-packets/WORK_INDEX.md` WP-196 row `[x]` with execution date; `docs/ai/execution-checklists/EC_INDEX.md` EC-225 row flipped to Done with execution summary.

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
