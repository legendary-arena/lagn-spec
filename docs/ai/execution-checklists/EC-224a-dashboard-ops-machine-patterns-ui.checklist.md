# EC-224a — Dashboard Ops Machine Patterns (UI: Cadence Horizons + Status Chip + Vision Card)

**Source:** docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md (Sub-tasks A + B + C)
**Layer:** Client (`apps/dashboard/src/**`)
**Paired EC:** EC-224b (Sub-tasks D + E + F — build-time governance snapshot + widgets + shared support). EC-224a MUST execute before EC-224b; `OverviewPage.vue` is touched by both ECs with non-overlapping inserts (VisionCard at top in EC-224a; two-column governance/activity grid below DailyExecutionPanel in EC-224b).

## Pre-Session Actions (PS-1..PS-3) — Blocking

- [ ] **PS-1 — D-entries reserved.** `D-19801` (cadence union extension), `D-19802` (KpiSnapshot extension + pure-helper status chip), `D-19803` (VisionCard curated-string posture) appended to `docs/ai/DECISIONS.md` BYTE-IDENTICALLY to the WP §Decisions Introduced table. Paraphrased rationale is FAIL. D-19804 and D-19805 are reserved for EC-224b and MUST NOT be landed here.
- [ ] **PS-2 — Existing test count baseline captured.** Before any code change, record `pnpm --filter @legendary-arena/dashboard test` output line count and the 9 existing `useDailyChecklist` test names. After execution, the 9 existing tests MUST pass byte-identically (no rename, no skip, no signature change); new tests are additive.
- [ ] **PS-3 — VISION.md curated-string source captured.** Record the current SHA of `docs/01-VISION.md` and the verbatim text of Primary Goals #1–5 + the Financial Sustainability covenant section. The VisionCard's curated string MUST be condensed from this exact source and the JSDoc header MUST cite this SHA + capture date.

If any PS item is unsatisfied, the executor STOPS and reports `BLOCKED`.

## Before Starting

- [ ] WP-157 Done ✅; WP-162 Done ✅ (verified `bef03a8` + `54007cc`).
- [ ] `useDailyChecklist.ts` line 5 exports `ChecklistCadence = 'daily' | 'weekly' | 'as-scheduled'`; storage-key shape is `la-dashboard-checklist-{userId}-{dateString}`.
- [ ] `types/index.ts` line 24 exports `KpiSnapshot` with exactly `id`, `label`, `value`, `previousValue`, `unit`, `trend`. No `target` / `tolerance` / `direction` fields yet.
- [ ] `KpiCard.vue` renders trend arrow (line 27) + trend label (line 40); no chip yet.
- [ ] `OverviewPage.vue` composes `KpiCard + DailyExecutionPanel + DauChartWidget + RevenueChartWidget + AlertsPanel`; no VisionCard yet.
- [ ] `docs/01-VISION.md` Primary Goals #1–5 + Financial Sustainability section present (PS-3 captured this baseline).
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (baseline test count recorded per PS-2).

## Locked Values (do not re-derive)

### Cadence union (Sub-task A)
- **`ChecklistCadence`** extends to `'daily' | 'weekly' | 'monthly' | 'quarterly' | 'as-scheduled'` (exactly 5 values, in this order). Drift-pinned via a canonical-array test mirroring `MATCH_PHASES` / `TURN_STAGES` pattern.
- **Cadence horizon tab order (left-to-right):** `Today` → `This Week` → `This Month` → `This Quarter`. `as-scheduled` items appear under `Today`.
- **Storage-key shape:**
  - `daily` items → `la-dashboard-checklist-{userId}-{dateString}` (**byte-identical** to WP-162; do NOT modify).
  - `weekly` / `monthly` / `quarterly` items → `la-dashboard-checklist-{userId}-{cadence}-{periodKey}` where `periodKey` is `YYYY-MM` (monthly), `YYYY-Q[1-4]` (quarterly), or the existing ISO-week shape (weekly per WP-162 — verify against current code; do NOT change weekly shape).
- **`formatPeriodKey(date: Date, cadence: 'monthly' | 'quarterly'): string`** — returns `YYYY-MM` or `YYYY-Q[1-4]`. Pure function; no `Date.now()`.
- **Prune retention per cadence:** daily 30 days; weekly 90 days; monthly 365 days; quarterly 2 years (730 days). Each retention branch is its own `for...of` loop; no shared dynamic-prefix logic.

### KpiCard status chip (Sub-task B)
- **`KpiSnapshot` extension** — three OPTIONAL fields: `target?: number`, `tolerance?: number`, `direction?: 'higher-is-better' | 'lower-is-better'`. All three optional; KPIs without `target` render no chip.
- **`KpiStatus` union** — `'on-track' | 'off-track' | 'needs-attention'` (exactly 3 values, in this order).
- **`KPI_STATUSES`** = `['on-track', 'off-track', 'needs-attention']` (canonical readonly array; drift-pinned to `KpiStatus` union via a `node:test` assertion mirroring `.claude/rules/code-style.md §Drift Detection`).
- **`computeKpiStatus(snapshot: KpiSnapshot): KpiStatus | null`** rules (decided in this order; first match wins):
  - `snapshot.target === undefined` → `null` (no chip).
  - Value within `target ± tolerance` → `'on-track'`.
  - Value on the wrong side of `target` (relative to `direction`) beyond `tolerance` → `'off-track'`.
  - Value on the wrong side of `target` (relative to `direction`) within `tolerance` → `'needs-attention'`.
  - Branching is explicit `if/else if/else` per 00.6 Rule 8; no nested ternaries.
- **Status chip color tokens** — `on-track` → `--p-green-500`; `off-track` → `--p-red-500`; `needs-attention` → `--p-yellow-500`. Text label rendered FIRST so color is never the sole indicator.
- **Chip accessibility** — `aria-label` carries the status text so screen readers convey it.

### VisionCard (Sub-task C)
- **Source** — `docs/01-VISION.md` Primary Goals #1–5 + Financial Sustainability covenant (PS-3 baseline).
- **Render mode** — static curated string in `VisionCard.vue`. NO runtime file read; NO build-time generator dependency; NO Vite asset import for VISION.md.
- **Versioning** — JSDoc header MUST name the source file path AND the verbatim PS-3 capture date (e.g., `// why: condensed from docs/01-VISION.md @ <SHA> as of 2026-06-01`).
- **Placement** — first child of `.overview-page` in `OverviewPage.vue`, above the page header (above the date-range selector + KPI grid).
- **Layout** — header "Vision" / body two-column on ≥768px (Primary Goals left, Financial Sustainability right), single column below; accent border via `--p-primary-color`.
- **Four-state contract exemption** — VisionCard is static-in-bundle; loading/error/empty states are unreachable. Document the exemption inline with a `// why:` comment citing the source WP §C clause that permits this.
- **No edit affordance** — no in-UI edit, no dismiss, no hide. Always visible.

### D-entries to append (this EC)
- `D-19801` (cadence union extension), `D-19802` (KpiSnapshot extension + pure-helper status chip), `D-19803` (VisionCard curated-string render posture). Verbatim from WP-198 §Decisions Introduced.
- `D-19804`, `D-19805` are reserved for EC-224b. DO NOT land them here.

## Guardrails

- **MUST NOT modify the `daily` storage-key shape** — byte-identical to WP-162's `la-dashboard-checklist-{userId}-{dateString}` (D-19801). Operator-persisted state must migrate silently.
- **MUST NOT modify the 9 existing `useDailyChecklist` tests** — additive only. Rename / skip / signature change is FAIL.
- **MUST NOT compute `KpiStatus` inline in the KpiCard render path** — logic lives in `kpiStatus.ts`; the widget render call site is one expression (D-19802).
- **MUST NOT use `Array.reduce()` with branching** — explicit `for...of` loops with descriptive variables (00.6 Rule 7). Applies to cadence prune branches and any classification.
- **MUST NOT use nested ternaries** — `if/else if/else` blocks (00.6 Rule 8). Applies to `computeKpiStatus`.
- **MUST NOT add a runtime file read or build-time generator dependency for VisionCard** — static in-bundle string only (D-19803).
- **MUST NOT add an edit / dismiss / hide affordance to VisionCard** — always visible.
- **MUST NOT introduce hard-coded hex colors** for any structural element — PrimeVue design tokens only.
- **MUST NOT import** `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, or `@legendary-arena/server` in any file.
- **MUST NOT add a new npm dependency** — `pnpm-lock.yaml` byte-identical to `HEAD`.
- **MUST NOT make color the sole indicator of status** — chip text label renders FIRST; `aria-label` carries the status text.
- **MUST NOT widen `ChecklistCadence` or `KpiStatus` without updating the canonical readonly array** — drift tests are the load-bearing assertion.

## Required `// why:` Comments

- `useDailyChecklist.ts` — daily storage-key shape preserved byte-identical: cite **D-19801**; operator-persisted state migrates silently across the WP boundary.
- `useDailyChecklist.ts` — prune-branch per cadence: cite **D-19801**; per-cadence retention without shared dynamic-prefix logic prevents accidental cross-cadence prune.
- `kpiStatus.ts` — pure-helper posture: cite **D-19802**; computation lives outside the widget render path to keep the chip rendering branching-free and unit-testable.
- `kpiStatus.ts` — `null` return when `target` is undefined: explicit opt-in posture; KPIs without targets render no chip.
- `KpiCard.vue` — chip text-label-first rendering: color is never the sole indicator (a11y + colorblind operator support).
- `VisionCard.vue` — JSDoc header citing `docs/01-VISION.md` SHA + PS-3 capture date: cite **D-19803**; curated string MUST be re-verified against source on every WP that modifies VISION.md.
- `VisionCard.vue` — four-state contract exemption: cite **D-19803** and WP-198 §C; static-in-bundle data has no loading / error / empty state.

## Files to Produce (Diff Contracts)

Additions only; scoped per file. Edits to any unrelated line are FAIL.

- `apps/dashboard/src/composables/useDailyChecklist.ts` — **modified** — `ChecklistCadence` union extended; `formatPeriodKey` added; `storageKey` derivation branches on cadence (daily byte-identical); `pruneStaleKeys` gains per-cadence retention branches. Daily-cadence code paths byte-identical.
- `apps/dashboard/src/composables/useDailyChecklist.test.ts` — **modified** — **additive only**. 9 existing tests untouched (rename / skip / signature change is FAIL). New tests: `formatPeriodKey` boundaries (month / quarter / year), per-cadence storage-key shapes, per-cadence prune branches.
- `apps/dashboard/src/widgets/DailyExecutionPanel.vue` — **modified** — 4-tab horizon selector at top (Today / This Week / This Month / This Quarter, default Today); existing Content/Community/Growth grouping retained within each tab; tab state component-local (no Pinia, no persistence); `role="tablist"` semantics; no third-party tab library.
- `apps/dashboard/src/types/index.ts` — **modified** — `KpiSnapshot` gains exactly 3 optional fields; `KpiStatus` union + `KPI_STATUSES` array added. No other type touched.
- `apps/dashboard/src/utils/kpiStatus.ts` — **new** — pure helper exporting `computeKpiStatus(snapshot: KpiSnapshot): KpiStatus | null` per the §Locked Values rules. No I/O; no imports beyond the type from `../types`.
- `apps/dashboard/src/utils/kpiStatus.test.ts` — **new** — `node:test` coverage: no-target → null; on-track (within tolerance); off-track (both directions, beyond tolerance); needs-attention (both directions, within tolerance); zero-tolerance edge case; `KPI_STATUSES` drift test. ≥7 tests.
- `apps/dashboard/src/widgets/KpiCard.vue` — **modified** — render chip below trend row IF `computeKpiStatus(kpi) !== null`. Text-label-first; color from locked token; `aria-label`. No other render path touched.
- `apps/dashboard/src/services/mocks.ts` — **modified** — add `target` / `tolerance` / `direction` to EXACTLY 2 KPI mocks (`active-players` + `revenue-today`) so the chip is visible in dev. No other mock touched.
- `apps/dashboard/src/widgets/VisionCard.vue` — **new** — static curated card per §Locked Values §VisionCard. JSDoc header cites VISION.md SHA + PS-3 capture date.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — **modified** — EXACTLY one new child added: `<VisionCard />` as the first child of `.overview-page`, above the page header. **Do not add the two-column governance/activity grid here** — that lands in EC-224b §F.
- `docs/ai/DECISIONS.md` — **modified** — EXACTLY 3 new entries appended: `D-19801`, `D-19802`, `D-19803`. Verbatim per WP §Decisions Introduced. `D-19804` and `D-19805` are reserved for EC-224b — DO NOT append them here.
- `docs/ai/STATUS.md` — **modified** — EXACTLY one new status block: WP-198 Sub-tasks A + B + C executed; cadence horizons, status chip, vision card shipped.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EXACTLY one row state flip (EC-224a → Done).

WORK_INDEX.md update is deferred to EC-224b's governance commit (WP-198 lands a single `[x]` row when BOTH sub-task groups complete; partial-completion `[~]` style is not in the index format).

## After Completing

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (baseline + new tests).
- [ ] The 9 existing `useDailyChecklist` tests pass byte-identically (compare names + assertion shapes to PS-2 baseline).
- [ ] `KPI_STATUSES` drift test passes (array deep-equals `['on-track', 'off-track', 'needs-attention']`; canonical-array-vs-union pattern catches divergence).
- [ ] **Daily storage-key drift gate** — A `cadence === 'daily'` item with `userId = 'u1'` and `dateString = '2026-06-01'` MUST produce storage key `'la-dashboard-checklist-u1-2026-06-01'` byte-identical to a manually-constructed reference string. A test asserts this.
- [ ] **Cadence union drift gate** — A `node:test` assertion deep-equals the runtime `ChecklistCadence` literals array to the union extracted via TypeScript's type-narrowing test pattern. Adding a 6th cadence without updating both sides fails the test loudly.
- [ ] `VisionCard.vue` JSDoc header cites `docs/01-VISION.md` and the PS-3 capture date verbatim.
- [ ] `OverviewPage.vue` carries EXACTLY one new `<VisionCard />` element as the first child of `.overview-page`; the new two-column governance/activity grid is NOT present (that's EC-224b's responsibility).
- [ ] `git diff --name-only` matches the §Files to Produce list exactly (no out-of-scope edits).
- [ ] `git diff --stat pnpm-lock.yaml` empty.
- [ ] `Select-String -Path apps\dashboard\src -Pattern "@legendary-arena/(game-engine|registry|preplan|server)" -Recurse` returns zero matches.
- [ ] `Select-String -Path apps\dashboard\src\widgets\VisionCard.vue -Pattern "#[0-9A-Fa-f]{3,8}"` returns zero matches (hex colors forbidden).
- [ ] `docs/ai/DECISIONS.md` contains `D-19801`, `D-19802`, `D-19803` (and ONLY those three from this WP; `D-19804`/`D-19805` NOT present until EC-224b lands).
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/execution-checklists/EC_INDEX.md` EC-224a row flipped to Done.

## Common Failure Smells

- 9 existing `useDailyChecklist` tests modified (rename / skip / removed assertion) → PS-2 violation. Fix: revert; add new tests below the existing block, never inside.
- Daily storage-key shape drifted (e.g., separator order, missing dash) → operator-persisted state is silently invalidated. Fix: revert; the daily branch MUST emit the WP-162 shape byte-identical.
- `KpiSnapshot` gains a non-optional `target` field → backward-incompatible; existing KPI mocks fail to type-check. Fix: all 3 new fields MUST be optional.
- `computeKpiStatus` returns `'off-track'` for a KPI without a target → `null`-return rule violation. Fix: explicit `if (snapshot.target === undefined) return null;` FIRST.
- `KpiCard` renders chip when `computeKpiStatus` returns `null` → guard missing in the render path. Fix: chip is conditional on truthiness AND non-null.
- Chip rendered with color but no text label → a11y / colorblind regression. Fix: text label renders FIRST; color is decoration.
- VisionCard reads `docs/01-VISION.md` via Vite raw import → D-19803 violation. Fix: curated string is literal in `VisionCard.vue`; no asset import.
- VisionCard JSDoc header omits the source SHA or date → versioning rule violation. Fix: cite both verbatim.
- VisionCard added an in-UI dismiss / hide / edit affordance → constraint violation. Fix: remove the affordance.
- `OverviewPage.vue` modified beyond the single VisionCard insert (e.g., the EC-224b grid landed here too) → scope violation. Fix: revert; EC-224b owns the grid.
- New tab UI uses a third-party tab library → constraint violation. Fix: PrimeVue Tab components or a button-group with `role="tablist"`.
- `D-19804` or `D-19805` landed in DECISIONS.md → cross-EC reservation violation. Fix: revert; reserve those numbers for EC-224b's governance commit.
- WORK_INDEX.md row flipped to `[x]` here → premature. Fix: revert; WP-198's `[x]` lands with EC-224b's governance commit when sub-tasks D+E+F complete.
- `pnpm-lock.yaml` changed → unauthorized dependency edit; revert.
