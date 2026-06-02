# WP-198 — Dashboard "Ops Machine" Patterns (Cadence Horizons, On/Off-Track Chip, Vision Card, Governance Throughput, Recent Activity)

**Status:** Draft
**Primary Layer:** Client (`apps/dashboard`)
**Dependencies:** WP-157 (Dashboard Scaffold) — Done 2026-05-16; WP-162 (UI Polish + Daily Execution) — Done 2026-05-21
**EC:** Split into EC-224a (Sub-tasks A + B + C — UI: cadence horizons, status chip, vision card) + EC-224b (Sub-tasks D + E + F — build-time governance snapshot generator + throughput / activity widgets + shared support). EC-224a MUST land on `main` before EC-224b opens; `OverviewPage.vue` is touched by both ECs with non-overlapping inserts.
**Baseline:** `origin/main` at time of execution

---

## Scope-Tension Notice (Read Before Execution)

This WP bundles **five distinct improvements** mapped from
[`session-context-ops-machine-video.md`](../session-context/session-context-ops-machine-video.md)
suggestions 1–5. The file count (~14 code files + governance) is
past the lint checklist's "should be split" threshold of ~8 files
(`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §5`). Two viable
execution postures:

1. **Single-session execution.** Acceptable if the executor is
   confident about pace and the build-time governance snapshot
   pattern (Sub-task D + E) lands without surprises.
2. **Recommended execution split (chosen — see line 6).** Split at
   draft time into two ECs against this same WP file:
   - **EC-224a** — Sub-tasks A (cadence horizons) + B (on/off-track
     chip) + C (vision card). Client-only UI work, ~10 files.
   - **EC-224b** — Sub-tasks D (governance throughput widget) + E
     (recent activity feed) + F (shared `useDataFreshness` extension).
     Introduces the build-time governance snapshot generator, ~10
     files. **EC-224a MUST land on `main` before EC-224b opens** —
     `OverviewPage.vue` is touched by both ECs with non-overlapping
     inserts (VisionCard at top in EC-224a; two-column governance
     /activity grid below DailyExecutionPanel in EC-224b).

The WP file itself remains one document. The split was chosen at
draft time (2026-06-01) per the lint checklist's "should be split"
threshold of ~8 files (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md
§5`); each EC inherits the constraints relevant to its sub-tasks.

---

## Goal

After this packet, the dashboard surfaces five additions inspired by
the Founder OS "Ops Machine" patterns documented in
`docs/ai/session-context/session-context-ops-machine-video.md` (P1–P7
transferable patterns; N1–N7 anti-patterns deliberately not
imported):

1. **Cadence horizons** in the DailyExecutionPanel — tab-style
   horizon selector (Today / This Week / This Month / This Quarter)
   so the operator can ladder checklist items by time horizon, not
   only by Content/Community/Growth category.
2. **On/off-track threshold chip** on KpiCard — every KPI with a
   target renders an explicit status chip
   (`on-track` | `off-track` | `needs-attention`) alongside the
   existing trend arrow, so the operator gets immediate "is this
   number good or bad" signal that trend alone doesn't convey.
3. **Vision card** pinned on Overview — a read-only card surfacing
   `docs/01-VISION.md` Primary Goals (#1–5) and the Financial
   Sustainability covenant, mirroring the Benioff "show every
   employee the mission/vision/goals on one card" pattern from the
   transcript.
4. **Governance Throughput widget** on Overview — surfaces
   WORK_INDEX.md status counts (Done / In-flight / Blocked /
   Drafted) over the operator's chosen horizon, fed by a new
   build-time governance-snapshot generator.
5. **Recent Activity feed** on Overview — a chronological feed of
   recent DECISIONS.md entries plus recent WP-completion commits
   from `git log`, also fed by the build-time snapshot generator.

Sub-tasks D and E share a new pattern: a **build-time governance
snapshot generator** (`apps/dashboard/scripts/build-governance-snapshot.mjs`)
that parses `docs/ai/work-packets/WORK_INDEX.md`,
`docs/ai/DECISIONS.md`, and `git log --oneline -50` at build time
and emits `apps/dashboard/src/data/governance-snapshot.json`. The
SPA reads this JSON at runtime; no server endpoint is added.

---

## Assumes

- WP-157 scaffold + WP-162 polish are live on `main`.
- `apps/dashboard/src/composables/useDailyChecklist.ts` exports the
  current `ChecklistCadence = 'daily' | 'weekly' | 'as-scheduled'`
  union (line 5). Verified 2026-06-01 against `origin/main`.
- `apps/dashboard/src/widgets/DailyExecutionPanel.vue` renders the
  checklist grouped by `CATEGORY_GROUPS` (Content / Community /
  Growth) without any cadence-aware grouping. Verified 2026-06-01.
- `apps/dashboard/src/types/index.ts` line 24 exports the
  `KpiSnapshot` interface with exactly these fields: `id`, `label`,
  `value`, `previousValue`, `unit`, `trend`. Verified 2026-06-01.
- `apps/dashboard/src/widgets/KpiCard.vue` renders trend arrow
  (line 27) and trend label (line 40) but no target / threshold
  chip. Verified 2026-06-01.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` exists and
  composes KpiCard + DailyExecutionPanel + DauChartWidget +
  RevenueChartWidget + AlertsPanel.
- `apps/dashboard/.env` sets `VITE_USE_MOCKS=true`.
- `docs/01-VISION.md` exists and contains Primary Goals #1–5 and a
  Financial Sustainability section. Verified 2026-06-01.
- `docs/ai/work-packets/WORK_INDEX.md` uses the row format
  `- [ ] WP-NNN — Title. **Status** YYYY-MM-DD. <body>.` and
  `- [x] WP-NNN — ...` for completed packets. Status values
  observed on `main`: `Draft`, `Done`, `Ready`, `Blocked`. Verified
  2026-06-01.
- `docs/ai/DECISIONS.md` uses the `D-NNNNN` ID format and contains
  entries datable to commits.
- `pnpm dash:build` resolves to `pnpm --filter @legendary-arena/dashboard build`
  (root `package.json` line confirmed at execution time).
- No other dashboard WP is in progress (one-packet-per-session
  rule; if executed as the split EC path above, both ECs ride the
  same WP file but execute in separate sessions).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — the
  dashboard is a Client layer; no engine, registry, preplan, or
  server imports.
- `.claude/rules/architecture.md` — Layer Boundary; Dependency
  Direction.
- `.claude/rules/code-style.md` — full file (this WP authors
  multiple new files and modifies several composables; style
  enforcement is the dominant risk).
- `docs/01-VISION.md` — read Primary Goals #1–5 and Financial
  Sustainability verbatim; the VisionCard component will render
  condensed text drawn from these clauses.
- `docs/ai/session-context/session-context-ops-machine-video.md` —
  the inspiration capture this WP implements; cite P1–P7 mappings
  in the WP body.
- `docs/ops/DASHBOARD-REQUIREMENTS.md §1, §5 (Widget Contract), §11–§12
  (UI Design Guidelines)` — Widget Contract is non-negotiable.
- `docs/ai/work-packets/WP-157-dashboard-scaffold.md §5 (Widget
  Contract)` — 4-state rendering + freshness badge.
- `docs/ai/work-packets/WP-162-dashboard-daily-execution-ui-polish.md`
  — Daily Execution Panel + design-token discipline (no hard-coded
  hex), theme-toggle event (`dashboard-theme-change`).
- `docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md`
  — closest dashboard-WP structural precedent. Same client-only,
  mock-mode, no-server-endpoint posture; mirror its Constraints +
  Acceptance Criteria style.
- `docs/ai/DECISIONS.md` — scan for D-15701..D-15707, D-16201..D-16203,
  D-19601..D-19603 (dashboard family); nothing here may contradict
  prior locked decisions.
- `apps/dashboard/src/composables/useDailyChecklist.ts` — read
  entirely before modifying; the storage-key, prune, and
  type-guard logic is contract-locked under D-16201 patterns and
  this WP must not break it.
- `apps/dashboard/src/widgets/DailyExecutionPanel.vue` — read
  entirely; the four-state contract + freshness badge wiring is
  WP-157's pattern.
- `apps/dashboard/src/widgets/KpiCard.vue` — read entirely; the
  status-chip insertion must compose with the existing trend
  rendering without re-flowing the card layout.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 1 (no premature
  abstraction), Rule 2 (one-screen functions), Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 7 (no
  `Array.reduce()` with branching), Rule 8 (no dynamic property
  access for known keys), Rule 11 (full-sentence error messages),
  Rule 13 (ESM only), Rule 14 (canonical field names).

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
  `@legendary-arena/server`.
- MUST NOT add a server endpoint or call `api.legendary-arena.com`.
  Sub-tasks D and E read repo files at **build time only**; the
  runtime SPA reads the generated snapshot JSON.
- MUST NOT add a new npm dependency beyond what WP-157 + WP-162 +
  WP-196 already installed. The build-time generator runs in
  Node and uses Node built-ins only (`node:fs/promises`,
  `node:child_process`, `node:path`).
- MUST NOT introduce hard-coded hex colors for any structural
  element; PrimeVue design tokens only (matches WP-162 +
  WP-196 discipline).
- MUST NOT mutate the input series passed to any composable
  (matches WP-196 referential-safety rule).
- MUST NOT break the existing `useDailyChecklist` localStorage
  contract — storage key shape (`la-dashboard-checklist-{userId}-{dateString}`),
  stale-key prune behavior, type guards on persisted entries — is
  WP-162 lock and remains byte-identical for `daily` items. New
  cadence values (`monthly`, `quarterly`) use a **separate storage
  key shape** (`la-dashboard-checklist-{userId}-{cadence}-{periodKey}`
  where `periodKey` is `YYYY-MM` for monthly and `YYYY-Q[1-4]` for
  quarterly) so the per-day prune logic is unaffected.
- MUST NOT commit the generated governance-snapshot JSON. Add to
  `.gitignore`; regenerate at build time; the SPA imports it via
  Vite's static-asset mechanism so a missing file at runtime
  surfaces as a build error, not a runtime error.
- MUST NOT include the operator's email or any PII in the
  governance-snapshot JSON. The snapshot is build-output that
  ships to the (Access-gated) CF Pages CDN; PII in build output
  is a leak vector even behind Access.
- MUST NOT use `Array.reduce()` with branching to parse
  WORK_INDEX.md or DECISIONS.md (00.6 Rule 7); use explicit
  `for...of` loops with descriptive variables.
- MUST NOT make the Vision card text editable in the UI; the
  source of truth is `docs/01-VISION.md` and the card's content
  is built from a curated condensed string defined in
  `apps/dashboard/src/widgets/VisionCard.vue` (see §C).
- MUST NOT add an in-app way to dismiss / hide the Vision card.
  The whole point of pinning is that it's always visible.

**Session protocol:**
- If the cadence-horizon UI conflicts with the existing
  Content/Community/Growth grouping on small screens (the panel
  needs to render two grouping dimensions simultaneously), STOP
  and ask. Do not invent a hybrid layout without operator review.
- If `docs/01-VISION.md` Primary Goals or Financial Sustainability
  text has changed since 2026-06-01, STOP and re-confirm the
  curated VisionCard text against the current source.
- If parsing WORK_INDEX.md or DECISIONS.md encounters formats not
  documented in `## Assumes`, STOP and ask. Do not invent a parser
  branch; the formats are governance-locked and any drift is a
  governance question, not a parser question.

**Locked contract values:**

| Item | Value |
|---|---|
| Cadence union (extended) | `'daily' \| 'weekly' \| 'monthly' \| 'quarterly' \| 'as-scheduled'` |
| Cadence horizon tab order (UI) | `Today` → `This Week` → `This Month` → `This Quarter` (left-to-right; `as-scheduled` items appear under `Today`) |
| Storage-key shape for new cadences | `la-dashboard-checklist-{userId}-{cadence}-{periodKey}` where `periodKey` is `YYYY-MM` (monthly) or `YYYY-Q[1-4]` (quarterly) |
| KpiSnapshot extended fields | `target?: number`, `tolerance?: number`, `direction?: 'higher-is-better' \| 'lower-is-better'` (all optional; KPIs without `target` render no status chip) |
| Status chip values | `'on-track' \| 'off-track' \| 'needs-attention'` |
| Status chip thresholds | `on-track` when value within `target ± tolerance`; `off-track` when value is on the wrong side of `target` beyond `tolerance`; `needs-attention` when value is on the wrong side of `target` but within `tolerance` |
| Status chip color tokens | `on-track` → `--p-green-500`; `off-track` → `--p-red-500`; `needs-attention` → `--p-yellow-500` (with text label so color is never sole indicator) |
| Vision card source | `docs/01-VISION.md` Primary Goals #1–5 + Financial Sustainability covenant |
| Vision card render mode | Static curated string in `VisionCard.vue`; no runtime file read |
| Governance snapshot path | `apps/dashboard/src/data/governance-snapshot.json` (gitignored) |
| Governance snapshot generator | `apps/dashboard/scripts/build-governance-snapshot.mjs` |
| Generator wiring | `apps/dashboard/package.json` `"build"` script becomes `"node scripts/build-governance-snapshot.mjs && vite build"` |
| Snapshot JSON shape | See §D Contract below |
| Snapshot refresh cadence | Every `pnpm dash:build` (build-time only — no live updates) |
| Activity feed source | DECISIONS.md entries newer than 30 days + WP-completion git commits (`git log --oneline -50` filtered to commits whose first line begins with `WP-NNN:` or `SPEC:`) |
| Vision card placement | Top of Overview, above the KPI grid |
| Governance throughput placement | Below the DailyExecutionPanel, left column of a new two-column grid |
| Activity feed placement | Right column of that same two-column grid |

---

## Scope (In)

### A) Cadence horizons in DailyExecutionPanel (Suggestion 1)

- **Modified:** `apps/dashboard/src/composables/useDailyChecklist.ts`
  - Extend `ChecklistCadence` to add `'monthly'` and `'quarterly'`.
  - Add `formatPeriodKey(date: Date, cadence: 'monthly' | 'quarterly'): string`
    helper returning `YYYY-MM` or `YYYY-Q[1-4]`.
  - Refactor `storageKey` derivation: for `daily` items, keep the
    existing `la-dashboard-checklist-{userId}-{dateString}` shape
    (byte-identical for backward compatibility). For
    `weekly` / `monthly` / `quarterly` items, use
    `la-dashboard-checklist-{userId}-{cadence}-{periodKey}`.
  - `pruneStaleKeys` continues to prune only the `daily` shape (30
    days). Add a separate prune branch for weekly / monthly /
    quarterly keys (90 days for weekly, 365 days for monthly,
    2 years for quarterly). Each branch is its own
    `for...of` loop — no shared dynamic-prefix logic.
  - Add three new `CHECKLIST_CONFIG` items as examples: one
    `monthly`, one `quarterly`, one `weekly`-newsletter item that
    already exists stays put. Examples are illustrative; the WP
    does not lock specific items beyond demonstrating the union.
- **Modified:** `apps/dashboard/src/composables/useDailyChecklist.test.ts`
  - Add tests for `formatPeriodKey`: month boundaries, quarter
    boundaries, year boundaries.
  - Add tests for storage-key shape per cadence (daily key shape
    unchanged; weekly/monthly/quarterly use the new shape).
  - Add tests for prune-by-cadence (each branch prunes its own
    keys and leaves other branches alone).
  - Existing 9 tests must continue to pass byte-identically.
- **Modified:** `apps/dashboard/src/widgets/DailyExecutionPanel.vue`
  - Add a horizon tab selector at the top of the panel
    (Today / This Week / This Month / This Quarter). Default tab
    is Today.
  - Within each tab, retain the existing Content/Community/Growth
    grouping for items whose cadence matches that horizon. Items
    with `as-scheduled` cadence appear under Today.
  - Tab selection lives in component-local state (no Pinia store);
    no persistence between sessions (the operator's per-session
    pick is ephemeral).
  - Tab UI uses PrimeVue Tab components or a button group with
    `role="tablist"` semantics; no third-party tab library.

### B) On/off-track status chip on KpiCard (Suggestion 2)

- **Modified:** `apps/dashboard/src/types/index.ts`
  - Extend `KpiSnapshot` with three optional fields: `target?: number`,
    `tolerance?: number`, `direction?: 'higher-is-better' | 'lower-is-better'`.
  - Add `KpiStatus = 'on-track' | 'off-track' | 'needs-attention'`
    union and a `KPI_STATUSES` readonly array (mirrors the canonical
    `MATCH_PHASES` / `TURN_STAGES` pattern from `.claude/rules/code-style.md
    §Drift Detection`).
- **New:** `apps/dashboard/src/utils/kpiStatus.ts`
  - Pure function `computeKpiStatus(snapshot: KpiSnapshot): KpiStatus | null`
    returning `null` when `target` is undefined (KPI has no
    threshold). The branching follows the Locked Contract Values
    table verbatim — explicit `if/else if/else` per 00.6 Rule 8;
    no nested ternaries.
- **New:** `apps/dashboard/src/utils/kpiStatus.test.ts`
  - Tests cover: no target → null; on-track (within tolerance);
    off-track (wrong direction beyond tolerance); needs-attention
    (wrong direction within tolerance); both directions
    (`higher-is-better` and `lower-is-better`); zero tolerance edge
    case; KPI_STATUSES drift test.
- **Modified:** `apps/dashboard/src/widgets/KpiCard.vue`
  - Below the existing trend row, render a status chip when
    `computeKpiStatus(kpi)` is non-null. Chip shows the status
    text label first (so color is never sole indicator) and a
    color-coded background using the locked color tokens.
  - Chip is `aria-label`'d so screen readers convey status.
- **Modified:** `apps/dashboard/src/services/mocks.ts`
  - Add `target`, `tolerance`, `direction` to at least two of the
    existing KPI mocks (e.g., `active-players` and `revenue-today`)
    so the chip is visible without further wiring.

### C) Vision card pinned on Overview (Suggestion 3)

- **New:** `apps/dashboard/src/widgets/VisionCard.vue`
  - Renders a curated condensed version of `docs/01-VISION.md`
    Primary Goals #1–5 and the Financial Sustainability covenant.
  - Static text in the component (no runtime file read; no
    build-time generator dependency). The curated string is
    explicitly versioned in a JSDoc header comment
    (`// why: condensed from docs/01-VISION.md as of 2026-06-01;
    re-verify against source on each WP that modifies VISION.md`).
  - Layout: header "Vision" / body two-column on ≥768px (Primary
    Goals left, Financial Sustainability right), single column
    below; subtle accent border using `--p-primary-color`.
  - No four-state contract (the data is in-bundle — no
    loading / error / empty states are reachable). The
    `## Non-Negotiable Constraints` permit this divergence for
    static-content widgets; document it inline.
- **Modified:** `apps/dashboard/src/pages/dashboard/OverviewPage.vue`
  - Add `<VisionCard />` as the first child of `.overview-page`,
    above the page header. The card renders above the date-range
    selector + KPI grid.

### D) Governance Throughput widget (Suggestion 4)

- **New:** `apps/dashboard/scripts/build-governance-snapshot.mjs`
  - Build-time generator. Reads:
    - `docs/ai/work-packets/WORK_INDEX.md` — parses rows matching
      `^- \[(x| )\] WP-(\d{3}) — (.+?)\. \*\*(Draft|Done|Ready|Blocked)\*\* (\d{4}-\d{2}-\d{2})?`
      (regex anchored to start-of-line). Counts per status and
      per ISO week / month / quarter. **Also extracts dependency
      lists** by scanning each row's body for `Hard-deps?: ([^.]+)`
      and parsing the matched segment for `WP-\d{3}` tokens. A WP
      is **executable now** when its status is `Ready` or `Draft`
      and every extracted dependency WP has status `Done`. Rows
      with no extractable `Hard-deps:` segment are treated as
      dependency-free (executable as long as their own status
      qualifies). Per D-19806.
    - `docs/ai/DECISIONS.md` — parses entries matching
      `^### D-(\d{5}) — (.+?)$` and the first paragraph after each
      heading (capped at 240 chars per entry); annotates with the
      file's git-log mtime per entry (via
      `git log -1 --format=%cI -- docs/ai/DECISIONS.md` — single
      file mtime is acceptable since DECISIONS.md is append-only).
    - `git log --oneline -50` — filtered to commits whose first
      line begins with `WP-NNN:` or `SPEC:`.
  - Emits JSON to `apps/dashboard/src/data/governance-snapshot.json`.
  - Shape: see §D Contract below.
  - Deterministic: same repo state → byte-identical JSON. Sort
    arrays and object keys explicitly.
  - Failure mode: if any required file is missing or `git log`
    fails, write a snapshot with `error: <message>` instead of
    throwing; the runtime widget then renders its error state
    cleanly. This is a build-time generator; throwing aborts the
    build and is worse than a runtime-visible error.
- **New:** `apps/dashboard/src/data/governance-snapshot.json` —
  the build-output JSON. **Gitignored** — never committed.
- **Modified:** `apps/dashboard/.gitignore` — add
  `src/data/governance-snapshot.json` (and, if the `src/data/`
  directory is empty otherwise, add a tracked
  `src/data/.gitkeep`).
- **Modified:** `apps/dashboard/package.json`
  - Change the `"build"` script from `"vite build"` to
    `"node scripts/build-governance-snapshot.mjs && vite build"`.
  - Add a `"prebuild:snapshot"` script for ad-hoc regeneration:
    `"node scripts/build-governance-snapshot.mjs"`.
- **New:** `apps/dashboard/src/composables/useGovernanceSnapshot.ts`
  - Pure composable importing the snapshot via
    `import snapshot from '../data/governance-snapshot.json'`.
  - Exposes typed accessors: `throughput(horizon: 'week' | 'month' | 'quarter')`,
    `nextExecutable(limit: number)` (returns up to `limit` WPRefs
    whose status is `Ready` or `Draft` and whose dependencies are
    all `Done`), `decisions(limit: number)`, `commits(limit: number)`,
    and `loadError: boolean` (true if the snapshot has the
    `error` field).
- **New:** `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts`
  - Tests with mock JSON inputs: throughput counts per horizon;
    decisions sorted by mtime descending; commits sorted by
    commit order; error-state propagation.
- **New:** `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue`
  - Four-state widget contract (loading / error / empty / data).
  - "data" state shows four cards. The first is a
    **Now: next executable WP** card — title of the next
    unblocked WP (`Ready` or `Draft` status, all deps `Done`)
    with a small "+N more queued" subtitle if `nextExecutable()`
    returned more than one. The remaining three are count cards:
    Done / In-flight (Draft + Ready) / Blocked. The "Now" card
    is the operator's primary actionable signal; the count cards
    are passive context. Per D-19806.
  - Horizon selector at top: This Week / This Month / This
    Quarter. Default This Week. (The "Now" card is horizon-
    independent — there is always exactly one "next" regardless
    of the selected horizon. The count cards re-scope to the
    selected horizon.)
  - Freshness badge in the header shows the snapshot's
    `generatedAt` ISO timestamp (build-time, not runtime), with a
    `BUILD` source label (new source-label constant added to
    `useDataFreshness` — see §F).

### E) Recent Activity feed widget (Suggestion 5)

- **New:** `apps/dashboard/src/widgets/RecentActivityWidget.vue`
  - Four-state widget contract.
  - "data" state shows a unified chronological feed of:
    - DECISIONS.md entries (badge `DECISION`)
    - WP-completion commits (badge `WP`)
    - SPEC commits (badge `SPEC`)
  - Each item: timestamp (relative + ISO on hover), badge, title,
    short body (240-char cap).
  - Default 10 items; "Show more" button reveals up to 50.
  - Same snapshot composable as §D — both widgets consume the
    same `governance-snapshot.json`.

### F) Shared support changes

- **Modified:** `apps/dashboard/src/composables/useDataFreshness.ts`
  - Extend the source-label union with `'BUILD'` (in addition to
    the existing `'MOCK'` and other source labels). `BUILD` means
    "data was baked into the bundle at build time"; the widget
    renders `BUILD` + the build-time ISO timestamp.
- **Modified:** `apps/dashboard/src/pages/dashboard/OverviewPage.vue`
  - Add a new two-column grid below the existing
    `DailyExecutionPanel`:
    - Left: `<GovernanceThroughputWidget />`
    - Right: `<RecentActivityWidget />`
  - Existing charts grid (`DauChartWidget` + `RevenueChartWidget`)
    stays in place below this new row.

### G) Decisions

Five D-entries appended to `docs/ai/DECISIONS.md`:

- **D-19801** — Cadence union extended with `monthly` and
  `quarterly`; new cadences use a distinct storage-key shape so
  the existing daily-prune logic is byte-identical.
- **D-19802** — KpiSnapshot gains optional `target`, `tolerance`,
  `direction`; status chip computation lives in a pure helper to
  keep the widget render path branching-free.
- **D-19803** — Vision card renders a curated condensed string in
  the component; no runtime file read, no build-time generator
  dependency. Curated text is versioned in a JSDoc header and
  re-verified against `docs/01-VISION.md` on each WP touching
  VISION.md.
- **D-19804** — Governance snapshot is a build-time JSON
  generated by `apps/dashboard/scripts/build-governance-snapshot.mjs`,
  not a server endpoint. Gitignored; regenerated every
  `pnpm dash:build`.
- **D-19805** — Snapshot generator failure writes
  `{ error: <message> }` to the JSON instead of throwing, so the
  widget renders its error state cleanly and the build does not
  abort on a transient parse problem.

### H) Governance index updates

- `docs/ai/work-packets/WORK_INDEX.md` — add WP-198 row in the
  Phase 8+ (dashboard) section. **Deferred to a follow-up SPEC
  commit** if WP-195 is executing in parallel and may touch
  WORK_INDEX.md in its own session (matches WP-197's same
  posture and the WP-196 precedent).
- `docs/ai/STATUS.md` — note the five new operator-dashboard
  capabilities that ship with this packet.

---

## D Contract — Governance Snapshot JSON Shape

```ts
interface GovernanceSnapshot {
  readonly generatedAt: string;        // ISO timestamp (build-time)
  readonly schemaVersion: 1;           // bump on breaking shape change
  readonly error?: string;             // present only on generator failure
  readonly throughput: {
    readonly byWeek: ReadonlyArray<HorizonCount>;
    readonly byMonth: ReadonlyArray<HorizonCount>;
    readonly byQuarter: ReadonlyArray<HorizonCount>;
    readonly inFlight: ReadonlyArray<WpRef>;     // Draft + Ready
    readonly blocked: ReadonlyArray<WpRef>;
    readonly now: ReadonlyArray<WpRef>;          // Ready/Draft AND all deps Done; ordered by WP number ascending
  };
  readonly decisions: ReadonlyArray<DecisionEntry>;   // up to 50, mtime descending
  readonly commits: ReadonlyArray<CommitEntry>;       // up to 50, commit-order descending
}

interface HorizonCount {
  readonly key: string;                // 'YYYY-Www' | 'YYYY-MM' | 'YYYY-Qn'
  readonly done: number;
  readonly drafted: number;
}

interface WpRef {
  readonly number: number;             // 196
  readonly title: string;
  readonly status: 'Draft' | 'Ready' | 'Done' | 'Blocked';
  readonly dependencies: ReadonlyArray<number>;  // WP numbers extracted from row's Hard-deps: segment; empty if none
}

interface DecisionEntry {
  readonly id: string;                 // 'D-19601'
  readonly title: string;
  readonly body: string;               // first paragraph, 240-char cap
  readonly mtime: string;              // ISO timestamp from DECISIONS.md git history
}

interface CommitEntry {
  readonly sha: string;                // short SHA
  readonly kind: 'WP' | 'SPEC';
  readonly title: string;
}
```

All arrays sorted explicitly (lexicographic by `key` / `id`, or
chronologic descending). All object keys sorted alphabetically in
the emitted JSON (deterministic byte-identical output).

---

## Out of Scope

- `apps/server/src/**` — no server endpoint added; no API call to
  `api.legendary-arena.com`. The build-time snapshot replaces a
  server endpoint for this WP's purposes.
- `packages/` — no engine, registry, or pre-planning changes.
- `apps/arena-client/` — untouched.
- Real-data wiring of any widget — mocks (or build-time
  snapshots) only.
- Replacing the existing per-day persistence with a server-side
  store — local-storage is intentional (offline-tolerant, no
  server round-trip per toggle).
- Auto-populating the DailyExecutionPanel from the activity feed
  (e.g., "you committed WP-X today, check it off") — explicitly
  not bundled; operator owns checklist state.
- Web-socket-style live updates of the governance snapshot — the
  snapshot is build-time only. A "refresh" button that re-runs
  the generator at runtime would require an HTTP endpoint and is
  deferred.
- Drag-to-reorder on any widget (the Founder OS L10 "IDS" drag-
  to-prioritize) — N1 in the session-context artifact; explicitly
  not imported.
- Mentor / advisor capture pipeline (P6 in the artifact) — out of
  scope; a candidate WP-G in the inspiration capture but not in
  this WP.
- Strategy / flywheel diagram (P5) — out of scope; no funnel
  data yet.
- Public exposure of governance snapshot — the snapshot is built
  into the (Access-gated, per WP-197) dashboard bundle and is
  never exposed to the public surface.
- Modifying the existing 9 `useDailyChecklist` tests — they must
  continue to pass byte-identically; new tests are additive.
- Backwards-incompatible changes to the existing storage-key
  shape — the `daily` shape stays byte-identical so existing
  persisted state migrates silently.
- Pinia store changes — composables + service functions only,
  matching the WP-196 pattern.

---

## Files Expected to Change

**Sub-task A — Cadence horizons:**
- `apps/dashboard/src/composables/useDailyChecklist.ts` — **modified** — cadence union + storage-key shape for new cadences + prune branches
- `apps/dashboard/src/composables/useDailyChecklist.test.ts` — **modified** — additive tests; existing 9 unchanged
- `apps/dashboard/src/widgets/DailyExecutionPanel.vue` — **modified** — horizon tab UI

**Sub-task B — On/off-track status chip:**
- `apps/dashboard/src/types/index.ts` — **modified** — KpiSnapshot extension + KpiStatus union + KPI_STATUSES array
- `apps/dashboard/src/utils/kpiStatus.ts` — **new** — pure helper
- `apps/dashboard/src/utils/kpiStatus.test.ts` — **new** — 7-test suite
- `apps/dashboard/src/widgets/KpiCard.vue` — **modified** — render status chip
- `apps/dashboard/src/services/mocks.ts` — **modified** — add targets to two KPI mocks

**Sub-task C — Vision card:**
- `apps/dashboard/src/widgets/VisionCard.vue` — **new** — static curated card
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — **modified** — render VisionCard above page header (and add new row for §D + §E widgets below DailyExecutionPanel)

**Sub-task D — Governance throughput widget:**
- `apps/dashboard/scripts/build-governance-snapshot.mjs` — **new** — build-time generator
- `apps/dashboard/src/data/.gitkeep` — **new** — keep `src/data/` directory tracked while ignoring the snapshot
- `apps/dashboard/.gitignore` — **modified** — ignore `src/data/governance-snapshot.json`
- `apps/dashboard/package.json` — **modified** — `build` and `prebuild:snapshot` scripts
- `apps/dashboard/src/composables/useGovernanceSnapshot.ts` — **new** — composable
- `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts` — **new** — composable tests
- `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue` — **new** — widget

**Sub-task E — Recent Activity feed:**
- `apps/dashboard/src/widgets/RecentActivityWidget.vue` — **new** — widget (shares composable from §D)

**Sub-task F — Shared support:**
- `apps/dashboard/src/composables/useDataFreshness.ts` — **modified** — extend source-label union with `'BUILD'`

**Governance (§G + §H):**
- `docs/ai/DECISIONS.md` — **modified** — append D-19801..D-19805
- `docs/ai/STATUS.md` — **modified** — note new dashboard capabilities
- `docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md` — **new** — this file
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-198 row (deferred if WP-195 mid-execution; see §H)

Total: 17 file touches (14 code + governance). Past the lint
checklist's ~8-file threshold; see the Scope-Tension Notice at the
top.

---

## Acceptance Criteria

### A) Cadence horizons
- [ ] `ChecklistCadence` union exports exactly 5 values: `daily`, `weekly`, `monthly`, `quarterly`, `as-scheduled`.
- [ ] Storage key for an item with `cadence === 'daily'` is byte-identical to the WP-162 shape (`la-dashboard-checklist-{userId}-{dateString}`).
- [ ] Storage key for an item with `cadence !== 'daily'` follows the new shape (`la-dashboard-checklist-{userId}-{cadence}-{periodKey}`).
- [ ] DailyExecutionPanel renders 4 horizon tabs (Today / This Week / This Month / This Quarter) in left-to-right order.
- [ ] Selecting a horizon shows only items whose cadence matches that horizon, grouped by Content/Community/Growth.
- [ ] `as-scheduled` items appear under the Today tab.
- [ ] The 9 existing `useDailyChecklist` tests pass byte-identically.
- [ ] At least one new test per cadence branch and one prune-branch test pass.

### B) On/off-track status chip
- [ ] `KpiSnapshot` interface adds exactly 3 optional fields: `target`, `tolerance`, `direction`.
- [ ] `KpiStatus` union exports exactly 3 values: `on-track`, `off-track`, `needs-attention`.
- [ ] `KPI_STATUSES` readonly array contains those 3 values in that order; drift test enforces it.
- [ ] `computeKpiStatus()` returns `null` when `snapshot.target` is undefined.
- [ ] `computeKpiStatus()` returns `'on-track'` when value is within `target ± tolerance`.
- [ ] `computeKpiStatus()` returns `'off-track'` when value is on the wrong side of `target` beyond `tolerance` (covers both `higher-is-better` and `lower-is-better`).
- [ ] `computeKpiStatus()` returns `'needs-attention'` when value is on the wrong side within `tolerance`.
- [ ] KpiCard renders the status chip only when `computeKpiStatus(kpi)` is non-null; chip carries the text label first (color is never sole indicator).
- [ ] Two mocks in `services/mocks.ts` (e.g., `active-players`, `revenue-today`) include `target` / `tolerance` / `direction` so the chip is visible in dev without further wiring.

### C) Vision card
- [ ] `VisionCard.vue` renders condensed Primary Goals #1–5 and the Financial Sustainability covenant text.
- [ ] Curated string has a JSDoc header naming the source file and version date.
- [ ] OverviewPage renders the card above the page header (first child of `.overview-page`).
- [ ] No runtime file read; no build-time generator dependency for the card.

### D) Governance Throughput widget
- [ ] `apps/dashboard/scripts/build-governance-snapshot.mjs` runs cleanly via `pnpm --filter @legendary-arena/dashboard prebuild:snapshot` and writes `apps/dashboard/src/data/governance-snapshot.json`.
- [ ] Generator output is byte-identical across two runs against the same repo state (deterministic).
- [ ] Snapshot JSON conforms to the §D Contract shape (schemaVersion = 1; throughput/decisions/commits keys present).
- [ ] On simulated parse failure (e.g., missing WORK_INDEX.md), generator writes `{ error: <message>, schemaVersion: 1, generatedAt: <iso> }` instead of throwing.
- [ ] `.gitignore` contains `src/data/governance-snapshot.json`.
- [ ] `package.json` `"build"` is `"node scripts/build-governance-snapshot.mjs && vite build"`.
- [ ] `useGovernanceSnapshot` composable exposes typed `throughput()`, `decisions()`, `commits()`, `loadError` accessors.
- [ ] GovernanceThroughputWidget renders 4 cards in the data state: a **Now: next executable WP** card (primary, showing the lowest-numbered `Ready`/`Draft` WP whose deps are all `Done`, with "+N more queued" subtitle if more than one) plus three count cards (Done / In-flight / Blocked) scoped to the selected horizon.
- [ ] Snapshot generator extracts a `dependencies: number[]` array on each WpRef by parsing `Hard-deps?:` segments in WORK_INDEX row bodies; rows with no matching segment carry an empty array.
- [ ] `useGovernanceSnapshot.nextExecutable(limit)` returns up to `limit` WpRefs whose status is `Ready` or `Draft` AND whose every `dependencies` entry resolves to a WpRef with status `Done`.
- [ ] Widget freshness badge shows `BUILD` + the snapshot's `generatedAt` timestamp.

### E) Recent Activity feed
- [ ] RecentActivityWidget renders a unified chronological feed with badge (DECISION / WP / SPEC), timestamp, title, capped body.
- [ ] Default item count is 10; "Show more" reveals up to 50.
- [ ] Widget consumes the same `useGovernanceSnapshot` composable as §D (no duplicate snapshot import).

### F) Shared support
- [ ] `useDataFreshness` source-label union accepts `'BUILD'`.
- [ ] OverviewPage renders the two new widgets in a two-column grid below the DailyExecutionPanel.

### Engine-wide
- [ ] `pnpm install && pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (all existing + new tests pass).
- [ ] Zero imports from `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, `@legendary-arena/server` in any dashboard file.
- [ ] Zero hard-coded hex colors in any new widget file (PrimeVue tokens only).
- [ ] No new npm dependencies added to `apps/dashboard/package.json`.
- [ ] `docs/ai/REFERENCE/api-endpoints.md` is **unchanged** by this WP (no server endpoint touched).

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] `pnpm-lock.yaml` byte-identical to HEAD.

---

## Verification Steps

```pwsh
# Step 1 — install + build (build runs the snapshot generator first)
pnpm install
pnpm --filter @legendary-arena/dashboard build
# Expected: snapshot generator writes apps/dashboard/src/data/governance-snapshot.json;
#           vite build then exits 0.

# Step 2 — generator is deterministic
pnpm --filter @legendary-arena/dashboard prebuild:snapshot
$first = Get-FileHash apps\dashboard\src\data\governance-snapshot.json
pnpm --filter @legendary-arena/dashboard prebuild:snapshot
$second = Get-FileHash apps\dashboard\src\data\governance-snapshot.json
$first.Hash -eq $second.Hash
# Expected: True

# Step 3 — generator failure mode writes error JSON, does not throw
# (manual: rename WORK_INDEX.md temporarily, re-run, confirm JSON has `error` key,
#  exit code is still 0; restore WORK_INDEX.md)

# Step 4 — full repo build
pnpm -r build
# Expected: exits 0

# Step 5 — dashboard tests (existing + new)
pnpm --filter @legendary-arena/dashboard test
# Expected: TAP output — all tests passing, 0 failing

# Step 6 — dev server + manual UI verification
pnpm dash:dev
#   Open http://localhost:5173, sign in as admin.
#   Confirm:
#   - VisionCard appears above the page header.
#   - KPI cards show on/off-track status chip for the KPIs with targets.
#   - DailyExecutionPanel shows Today/Week/Month/Quarter tabs.
#   - GovernanceThroughputWidget shows the "Now: next executable WP" card + 3 count cards + horizon selector.
#   - RecentActivityWidget shows mixed feed (DECISION / WP / SPEC badges).
#   - All widgets display BUILD or MOCK freshness badge correctly.

# Step 7 — grep for forbidden workspace imports
Select-String -Path apps\dashboard\src -Pattern "@legendary-arena/(game-engine|registry|preplan|server)" -Recurse
# Expected: zero output

# Step 8 — grep for hard-coded hex colors in new widget files
$newFiles = @(
  'apps\dashboard\src\widgets\VisionCard.vue',
  'apps\dashboard\src\widgets\GovernanceThroughputWidget.vue',
  'apps\dashboard\src\widgets\RecentActivityWidget.vue'
)
Select-String -Path $newFiles -Pattern "#[0-9A-Fa-f]{3,8}"
# Expected: zero matches (PrimeVue tokens only)

# Step 9 — confirm api-endpoints.md untouched
git diff --name-only origin/main -- docs\ai\REFERENCE\api-endpoints.md
# Expected: empty output

# Step 10 — confirm pnpm-lock.yaml unchanged
git diff --stat pnpm-lock.yaml
# Expected: no output

# Step 11 — confirm generator output is gitignored
git status apps\dashboard\src\data\governance-snapshot.json
# Expected: no output (ignored)

# Step 12 — confirm KPI_STATUSES drift test passes
pnpm --filter @legendary-arena/dashboard test -- --test-name-pattern "KPI_STATUSES"
# Expected: passing test confirming KPI_STATUSES contains exactly the 3 union values
```

---

## Vision Alignment

**Vision clauses touched:** `§13 Live Ops` (the dashboard is the
operator surface for live-ops decisions; adding cadence horizons,
status chips, and governance throughput sharpens that surface);
`Primary Goals #1–5` and `Financial Sustainability` (rendered
verbatim — well, condensed — in the VisionCard, which surfaces the
goals every operator session).

**Conflict assertion:** No conflict. This WP preserves all touched
clauses. VisionCard is read-only and surfaces the canonical
`docs/01-VISION.md` text; it does not redefine or paraphrase
goals in a way that could drift from the source.

**Non-Goal proximity check (NG-1..NG-7):** None crossed. All
additions are internal operator surfaces; no player-facing surface
modified. No monetization, persuasion, gacha, energy, or
social-influence mechanic introduced.

**Determinism preservation:** N/A — no engine, RNG, replay, or
simulation code touched.

---

## Funding Surface Gate

**N/A.** Justification per §20.1: this WP touches no global
navigation funding affordance, no registry-viewer funding affordance,
no profile / account funding-attribution surface, no tournament
funding channel integration, and no user-visible funding copy as
part of a proposed or implemented user interaction. The VisionCard
renders the Financial Sustainability covenant text, but that is the
analytical / retrospective mention carve-out (§20.1 second bullet)
— it surfaces the canonical Vision clause as governance reference,
not as a funding affordance. Authority chain for §20: `WP-097`,
`D-9701`, `D-9801` (cited; not triggered).

---

## API Catalog (§21)

**N/A.** Justification: this WP does not add, modify, remove, or
change the status of any HTTP endpoint in `apps/server`, nor of any
`apps/server/src/**` library function recorded in
`docs/ai/REFERENCE/api-endpoints.md` as `Library-only`. The
governance snapshot is build-time output baked into the SPA bundle,
not a server endpoint. The snapshot generator reads repo files
directly; no HTTP call.

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-19801 | Cadence union extended to `daily \| weekly \| monthly \| quarterly \| as-scheduled`. New cadences use storage-key shape `la-dashboard-checklist-{userId}-{cadence}-{periodKey}` separate from the daily shape; per-cadence prune branches with cadence-appropriate retention (30d/90d/365d/2y). | The video's strongest single pattern is laddering goals across time horizons (P3 in `session-context-ops-machine-video.md`). The existing checklist composable already knows about `cadence`; surfacing the dimension in the UI requires only a union extension and a tabbed render. Keeping the daily storage-key shape byte-identical preserves operator-persisted state across the WP boundary; the new-cadence keys ride a separate shape so the per-day prune logic doesn't have to learn about them. |
| D-19802 | `KpiSnapshot` gains optional `target`, `tolerance`, `direction`. Status computation lives in a pure helper (`computeKpiStatus`) so the widget render path stays branching-free and the logic is testable without component mount. KPIs without `target` render no chip — the chip is opt-in per KPI. | Trend arrow alone doesn't tell the operator whether a number is *good* (P2 in the inspiration artifact). Threshold-based chips force target-setting discipline (you can't ship a chip without a target), which is the actual value. Making target optional avoids retroactively requiring every existing KPI to be re-justified. |
| D-19803 | VisionCard renders a curated condensed string in the component; no runtime file read, no build-time generator. The string is JSDoc-versioned against `docs/01-VISION.md` and re-verified on every WP that modifies VISION.md. | The Benioff pattern from the video (P4) is *pinning* the vision, not *displaying* a live file. A curated condensed string fits the operator's at-a-glance need; a full VISION.md render would dilute the signal. Static text avoids both runtime file IO (browser-impossible) and build-time generator coupling (over-engineering for a one-paragraph card). The versioning rule prevents the curated string from silently drifting from the source. |
| D-19804 | Governance snapshot is a build-time JSON generated by `apps/dashboard/scripts/build-governance-snapshot.mjs` from `WORK_INDEX.md`, `DECISIONS.md`, and `git log`. Gitignored. The SPA imports it via Vite's static-asset mechanism. | A server endpoint would mean a new `/api/admin/governance/*` route, a query path against the DB or filesystem, and a CORS + auth posture decision — too much new surface for a widget that re-renders only when the operator triggers a build. The build-time path keeps the dashboard's client-only posture intact and is consistent with the legends-board WP-142/WP-143 R2-snapshot pattern (decouple presentation from runtime data source when the data is build-cadence). Gitignoring the JSON keeps the repo from churning on every commit. |
| D-19805 | Snapshot generator failure mode writes `{ error: <message>, schemaVersion: 1, generatedAt: <iso> }` to the JSON; never throws. The widget surfaces the error state cleanly; the build does not abort. | Throwing aborts the entire dashboard build, which is worse for the operator than seeing a "governance snapshot unavailable" widget error. The Widget Contract (WP-157 §5) already mandates an error state — leveraging it for build-time failures preserves the contract and keeps the operator's other widgets reachable. |
| D-19806 | GovernanceThroughputWidget's primary card is **Now: next executable WP** (lowest-numbered `Ready`/`Draft` WP whose deps are all `Done`) rather than a passive count card. Snapshot generator extracts dependency lists from each WORK_INDEX row's `Hard-deps?:` segment to compute it. | The original four-count framing (Done / In-flight / Blocked / This-week-shipped) told the operator state but not next action. For a solo operator running a strict dependency-ordered execution model (per `.claude/rules/work-packets.md`), the highest-value glance is "what can I execute next?" — not "how many landed this week?" The dependency extraction is a small regex extension to the parser. Added 2026-06-01 after an external dashboard-design critique correctly identified this as a sharper operator framing. |

---

## Future Work (Explicitly Deferred)

- **Live governance snapshot** (re-generate on a button click, no
  rebuild) — requires a server endpoint; deferred to a follow-up
  WP if the build-time cadence proves too coarse in practice.
- **Conversation-capture pipeline** (P6 in the inspiration
  artifact; the bidirectional Fathom→Claude→dashboard pattern) —
  candidate WP-G; out of scope here.
- **Strategy / flywheel one-pager** (P5) — defer until acquisition
  funnel data exists (WP-B in the pre-mortem grouping).
- **Drag-to-reorder on activity feed** — N1 anti-pattern from the
  inspiration artifact; intentionally not imported.
- **Auto-completion of checklist items from git activity** —
  explicitly out of scope; operator owns checklist state.
- **Public exposure of governance snapshot** — the snapshot stays
  behind the Access-gated dashboard surface (WP-197).
- **Team / recruiting / customer-success tabs** from the video —
  N2/N3/N4 anti-patterns; not applicable to a solo operator.
- **Per-operator vision card customization** — single curated
  string for now; revisit if/when a second operator joins.

---

## Anti-Patterns to Avoid

- Do NOT use `.reduce()` with branching to parse WORK_INDEX.md or
  DECISIONS.md — use explicit `for...of` loops.
- Do NOT compute KpiStatus inline in the KpiCard render path —
  it lives in `kpiStatus.ts` so it's pure-testable and the chip
  render stays a one-liner.
- Do NOT silently widen the cadence union without updating
  `KPI_STATUSES`-style drift tests — the union and the runtime
  array must stay in lock-step.
- Do NOT commit `governance-snapshot.json` — it's build-output and
  would churn on every WP/decision/commit.
- Do NOT add a "refresh snapshot" button that calls a server
  endpoint — that turns this WP into a server-layer WP and
  violates the one-packet-per-session rule.
- Do NOT make the VisionCard text editable — the source of truth
  is the file, not the dashboard.
- Do NOT add hard-coded hex colors to the new widgets — PrimeVue
  tokens only.
- Do NOT throw from the build-time snapshot generator — write the
  error to the JSON and let the widget render its error state.
- Do NOT bundle in chart-library extensions for the throughput
  widget — count cards + existing echarts wrapper is sufficient.
- Do NOT auto-complete checklist items from git activity (the
  obvious-but-wrong cross-section between §A and §E).

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Build fails with "Cannot find module '../data/governance-snapshot.json'" | `pnpm dash:build` ran without the snapshot generator step; check `package.json` `build` script wiring. |
| Governance widget shows error state on a fresh checkout | Generator not run yet; `.gitkeep` is present but the JSON is gitignored. Run `pnpm --filter @legendary-arena/dashboard prebuild:snapshot`. |
| Snapshot byte-identical check fails | Generator is non-deterministic — likely cause: object-key insertion order in the emitted JSON, or `git log` includes a timestamp field. Sort keys explicitly; never include wall-clock data outside `generatedAt`. |
| KpiCard renders status chip but the color and text disagree | `computeKpiStatus` returned one status but the chip CSS class is keyed off a different field (e.g., trend). Re-check the chip's `:class` binding. |
| Daily checklist resets unexpectedly after this WP lands | Storage-key shape changed for daily items by accident — daily key shape must remain byte-identical per D-19801. Roll back the storage-key change and re-verify with the existing 9 tests. |
| VisionCard text drifts from VISION.md | Operator updated `docs/01-VISION.md` without re-running the VisionCard's JSDoc-versioned curated string update. Re-verify against source. |
| Recent Activity feed shows a wall of `SPEC:` commits and no DECISIONS | DECISIONS.md mtime resolution is per-file, not per-entry; all entries inherit the same mtime, and many SPEC commits ride independent timestamps. Document this in the widget tooltip; do not try to fix in this WP. |

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | All required WP sections present | PASS |
| 2 | Non-Negotiable Constraints (engine-wide + packet-specific + session protocol + locked values) | PASS |
| 3 | `## Assumes` lists all file and state dependencies with exports/shapes | PASS — composable cadence union, KpiSnapshot field list, OverviewPage children, VISION.md sections, WORK_INDEX row format, DECISIONS ID format, build script name |
| 4 | `## Context (Read First)` cites specific docs and sections | PASS — VISION + DASHBOARD-REQUIREMENTS + WP-157/162/196 + session-context artifact + code-style rules cited with section numbers |
| 5 | `## Files Expected to Change` complete and bounded | **PARTIAL** — 17 file touches; past the ~8-file threshold. Mitigation: Scope-Tension Notice at top recommends executor split into EC-198a (A+B+C, ~6 files) + EC-198b (D+E+F, ~8 files). Acceptable per lint guidance ("should be split") rather than ❌ FAIL ("must be split"); flagged transparently. |
| 6 | Naming consistency | PASS — KpiSnapshot / KpiStatus / KPI_STATUSES follow `MATCH_PHASES` / `TURN_STAGES` precedent; `ChecklistCadence` extension uses the existing union name; storage-key shape preserves WP-162's prefix. |
| 7 | Dependency discipline — no new npm packages | PASS — generator uses Node built-ins only; no `axios`/`node-fetch`/ORM. |
| 8 | Architectural boundary — Client layer only | PASS — no engine/registry/preplan/server imports; build-time generator runs in Node but emits a static asset, not a server endpoint. |
| 9 | Windows / PowerShell compatibility | PASS — Verification Steps use `pnpm` + `Select-String` + `Get-FileHash` + `git`; no Unix-only commands. |
| 10 | Environment variable hygiene | PASS — no new env vars; existing `VITE_USE_MOCKS` unchanged. |
| 11 | Auth posture | N/A — page-level role gates from WP-157 unchanged; no new auth surface. |
| 12 | Tests — `node:test` only | PASS — new test files (`useDailyChecklist`, `kpiStatus`, `useGovernanceSnapshot`) use `node:test` + `node:assert`; no `boardgame.io` imports. |
| 13 | Verification steps — pnpm + pwsh, expected output | PASS — every step exact; expected output named. |
| 14 | Acceptance criteria binary and observable | PASS — sub-tasks A–F each have explicit binary checks; engine-wide and scope-enforcement groups close the loop. |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX | PASS — §G + §H cover all three. |
| 16 | Code style (00.6) | PASS — constraints block enforces no `.reduce()` with branching, full-sentence error messages, `// why:` on non-obvious code (generator failure-mode branch, daily storage-key preservation, VisionCard curated-text JSDoc), no abbreviations, JSDoc on every function in new files. |
| 17 | Vision Alignment | PASS — §13 Live Ops + Primary Goals #1–5 + Financial Sustainability cited; conflict assertion = no conflict; non-goal proximity = none crossed; determinism preservation = N/A documented. |
| 18 | Prose-vs-grep discipline | PASS — Verification Steps' grep patterns (`@legendary-arena/(...)`, hex colors) are positively scoped to imports / hex literals; adjacent prose names the patterns by role ("forbidden workspace imports", "hard-coded hex colors") without enumerating verbatim strings that would create grep false-positives. |
| 19 | Bridge-vs-HEAD staleness | N/A — this packet authors no repo-state-summarizing artifact. |
| 20 | Funding Surface Gate | N/A with justification — VisionCard surfaces Financial Sustainability as governance reference, not as a funding affordance; analytical / retrospective mention carve-out applies. |
| 21 | API Catalog (D-11804) | N/A with justification — no `apps/server` HTTP endpoint or library function added/modified/status-changed; build-time snapshot replaces a server endpoint, not adds one. |
