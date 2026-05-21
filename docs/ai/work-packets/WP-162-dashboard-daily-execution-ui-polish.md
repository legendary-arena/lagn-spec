# WP-162 — Dashboard Daily Execution Panel + UI Polish

**Status:** Draft
**Primary Layer:** Client (`apps/dashboard`)
**Dependencies:** WP-157 (Dashboard Scaffold) — Done 2026-05-16
**EC:** EC-176
**Baseline:** `origin/main` at time of execution

---

## Goal

After this packet, the dashboard at `dashboard.legendary-arena.com`
has two new capabilities:

1. A **Daily Execution Panel** on the Overview page — a manually
   operated checklist of recurring content, community, and growth
   tasks that resets daily. State persists in `localStorage`.

2. A **UI polish pass** that upgrades the scaffold's minimal CSS into
   the visual language defined in `docs/ops/DASHBOARD-REQUIREMENTS.md
   §12 (UI Design Guidelines)`: dark sidebar already exists; this WP
   adds PrimeVue Aura dark-mode theme toggle, consistent card
   structure across widgets, responsive grid breakpoints, and
   accessibility baseline.

All data remains mock. No backend endpoints are added or modified.

---

## Assumes

- WP-157 scaffold exists and builds cleanly (`pnpm -r build` exits 0).
- PrimeVue 4 Aura theme preset is the sole component library (D-15701).
- `apps/dashboard/.env` contains `VITE_USE_MOCKS=true`.
- No other dashboard WP is in progress (one-packet-per-session rule).

If any of the above is false, this packet is **BLOCKED**.

---

## Context

WP-157 shipped a functional scaffold with minimal styling — plain CSS,
hard-coded light-mode colors, no consistent card structure, and no
daily-execution tracking. The dashboard requirements doc
(`docs/ops/DASHBOARD-REQUIREMENTS.md §11-12`) now specifies a daily
checklist and UI design guidelines that the scaffold does not yet
satisfy.

This WP closes both gaps in a single client-layer pass. No engine,
server, registry, or cross-layer contract changes are involved.

**Authority chain (read order at execution):**
- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)`
- `.claude/rules/code-style.md`
- `docs/ops/DASHBOARD-REQUIREMENTS.md` (§5 Widget Contract, §11
  Daily Checklist, §12 UI Design)
- This WP (WP-162)
- EC (assigned at execution time)
- `docs/ai/REFERENCE/00.6-code-style.md`

---

## Scope (In)

### Daily Execution Panel

- New `apps/dashboard/src/widgets/DailyExecutionPanel.vue`
- New `apps/dashboard/src/composables/useDailyChecklist.ts`
- New `apps/dashboard/src/types/checklist.ts` (or extend
  `types/index.ts`)
- Modified `apps/dashboard/src/pages/dashboard/OverviewPage.vue`
  (add panel below KPI row)

### UI Polish

- Modified `apps/dashboard/src/main.ts` (Aura dark-mode preset
  configuration)
- Modified `apps/dashboard/src/layouts/AppLayout.vue` (responsive
  sidebar collapse, theme toggle, role badge, consistent structure)
- Modified `apps/dashboard/src/widgets/KpiCard.vue` (consistent card
  structure: header/body/footer per §11)
- Modified `apps/dashboard/src/widgets/AlertsPanel.vue` (severity
  colors per §11)
- Modified `apps/dashboard/src/widgets/DauChartWidget.vue` (chart
  styling per §11)
- Modified `apps/dashboard/src/widgets/RevenueChartWidget.vue` (chart
  styling per §11)
- Modified `apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue`
  (DataTable styling: striped rows, sticky header, visible filter row)
- Modified page files only where required to achieve responsive grid
  (no unrelated refactors permitted)
- New `apps/dashboard/src/composables/useDailyChecklist.test.ts`

### Governance

- `docs/ai/DECISIONS.md` — D-16201 through D-16203
- `docs/ai/work-packets/WORK_INDEX.md` — add WP-162 row
- `docs/ai/execution-checklists/EC_INDEX.md` — add EC row

## Scope (Out)

- `packages/` — no packages created or modified
- `apps/server/` — no backend endpoints
- `apps/arena-client/` — untouched
- `packages/game-engine/` — untouched
- `data/migrations/` — no schema changes
- `docs/ai/REFERENCE/api-endpoints.md` — no new endpoint rows
- KPI targets and RYG thresholds (requires real data; deferred)
- Playbook links to ewiki (requires wiki playbook pages; deferred)
- Server-side checklist persistence (deferred until team > 3 people)
- Real data endpoints (separate WP per Phase A/B/C/D)

---

## Contract

### Daily Checklist Data Model

```ts
interface DailyChecklistItem {
  id: string;
  label: string;
  category: 'content' | 'community' | 'growth';
  cadence: 'daily' | 'weekly' | 'as-scheduled';
  completed: boolean;
  completedAt: number | null;
}
```

### Checklist Configuration

Items are defined in a static `readonly` array in the composable file.
The initial set matches `DASHBOARD-REQUIREMENTS.md §11`:

**Content (Acquisition):**
- `youtube-video` — "YouTube video published" (daily)
- `youtube-short` — "YouTube Short posted" (daily)
- `facebook-post` — "Facebook post published" (daily)
- `newsletter` — "Newsletter drafted / scheduled" (weekly)

**Community (Retention):**
- `discord-response-sla` — "Discord response time < 4h" (daily)
- `discord-unanswered` — "Unanswered Discord threads < 5" (daily)
- `player-acknowledgment` — "Top active players acknowledged" (daily)

**Growth Operations:**
- `tournament-promotion` — "Tournament announced / promoted"
  (as-scheduled)
- `strategy-content` — "Strategy/deck content posted" (as-scheduled)

### Checklist Composable API

```ts
const checklist = useDailyChecklist();
// or, for tests: useDailyChecklist({ now: () => new Date(2026, 4, 21) });

checklist.items        // Ref<DailyChecklistItem[]>
checklist.completedCount  // ComputedRef<number>
checklist.totalCount      // ComputedRef<number>
checklist.toggle(id)      // (id: string) => void
checklist.resetAll()      // () => void
```

The composable accepts a single optional options object with a `now`
date provider:

```ts
interface UseDailyChecklistOptions {
  now?: () => Date; // defaults to () => new Date()
}
```

The `now` provider is the **only** source of the current date inside
the composable. All date-string construction and stale-key pruning read
from `now()`, never from `new Date()` directly. This allows tests to
inject a deterministic date without globally mocking `Date`.

The dashboard `tsconfig` runs `exactOptionalPropertyTypes: true`, so the
options object must be resolved with a default and never internally typed
as `(() => Date) | undefined`:

```ts
const now = options?.now ?? (() => new Date());
```

Callers must not pass an explicit `{ now: undefined }` — omit the key
instead. The internal `now` is always a defined `() => Date`.

### resetAll Confirmation

`resetAll()` clears all completion state for the current day. Because it
is destructive, the UI control that invokes it MUST first request user
confirmation (a simple `confirm()` dialog is sufficient — no custom modal
required). `resetAll()` itself does not prompt; the confirmation lives in
the panel's click handler so the composable stays free of UI concerns.

### Checklist Ordering

- Categories render in fixed order: Content, Community, Growth
- Items within each category render in the exact order defined in
  the static configuration array
- No runtime sorting or reordering

### localStorage Persistence

- Key: `la-dashboard-checklist-{userId}-{dateString}`
  where `dateString` is `YYYY-MM-DD` in browser local time
- `userId` source: if mock auth is active, use `mock-user`;
  if real auth exists, use the authenticated user ID from the
  auth store. Must not fall back to random UUIDs (breaks
  persistence across sessions).
- Value: JSON object mapping item `id` to
  `{ completed: boolean, completedAt: number | null }`
- New day = new key = automatic reset (previous day's data remains
  for history but is not displayed)
- Date boundary: browser local midnight (00:00). No server time
  synchronization. The checklist resets on first load after the
  local date changes.
- Persistence writes occur explicitly inside `toggle()` and
  `resetAll()` — not via deep watchers on checklist state.

### Date String Construction (mandatory)

`dateString` MUST be built from **local** date parts taken from the
injected `now()` provider — never from `toISOString()` (which is
UTC-based and drifts across the local-midnight boundary), and never
from locale-dependent formatters:

```ts
const today = now();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const dateString = `${year}-${month}-${day}`; // stable YYYY-MM-DD, local time
```

- MUST NOT use `toISOString()` or `toLocaleDateString()`
- MUST produce a zero-padded `YYYY-MM-DD` string
- The same construction is reused for both the storage key and the
  stale-key pruning comparison so the two never disagree

### State Restoration Rules

On initialization, the persisted value is **merged onto the static
config**, never the reverse:

- Iterate the static checklist array as the sole source of which items
  exist
- For each static item: if a persisted entry exists for its `id`, apply
  the persisted `completed` / `completedAt`; if none exists, initialize
  it as unchecked (`completed: false`, `completedAt: null`)
- A persisted entry is applied only if it is **shape-valid** — `completed`
  is a `boolean` and `completedAt` is a `number | null`. The value read
  back from `JSON.parse` is untrusted (`exactOptionalPropertyTypes` makes
  this a real widening boundary): narrow each entry before applying. A
  malformed or wrong-typed entry is treated as unchecked, never coerced
  and never applied as-is. (This is distinct from a `JSON.parse` throw,
  which routes to the panel's `error` state.)
- Persisted entries whose `id` is **not** present in the static config
  MUST be ignored (forward-compatibility when the config changes); they
  are never rendered and never re-written
- The rendered item count therefore always equals the static array
  length, regardless of what is in `localStorage`

### Stale Key Pruning

- On composable initialization, enumerate `localStorage` keys and
  consider **only** those matching the exact prefix
  `la-dashboard-checklist-` (use `key.startsWith('la-dashboard-checklist-')`)
- Keys that do not match the prefix MUST NOT be parsed, inspected, or
  deleted — pruning never touches the theme key or any unrelated key
- For matching keys, parse the trailing `dateString` and delete any
  whose date is more than 30 days older than today (`now()`-derived)
- Runs once per session (lazy init pattern acceptable)

### Completion Badge

- Appears in the Daily Execution Panel header, right-aligned
- Format: `"Daily: N/M complete"`
- Updates reactively on every `toggle()` call

### Theme Toggle

- Theme switching uses PrimeVue theme preset swapping (Aura light
  ↔ Aura dark). Must not implement theme via manual CSS class
  toggles or custom overrides.
- Preference stored in `localStorage` key `la-dashboard-theme`
- Default: `dark` (ops tools benefit from dark mode for extended use)
- Toggle button in the AppLayout header bar
- Theme MUST be resolved **synchronously in `main.ts` before
  `createApp(...).mount(...)`** so the correct preset is applied on the
  very first paint and there is no light→dark flash:

  ```ts
  const theme = localStorage.getItem('la-dashboard-theme') ?? 'dark';
  // apply `theme` to the PrimeVue preset config here …
  createApp(App).use(/* PrimeVue with resolved preset */).mount('#app');
  ```

  The Vue app MUST NOT mount before the stored theme has been applied.
  Resolving the theme inside a component lifecycle hook (e.g. `onMounted`)
  is forbidden — by then the flash has already occurred.

### Responsive Breakpoints

| Viewport | Sidebar | Content grid |
|---|---|---|
| >= 1200px | Full (240px, labels + icons) | Multi-column |
| 768-1199px | Collapsed (60px, icons only) | Single column |
| < 768px | Hidden (hamburger toggle) | Single column |

### Card Structure (all widget cards)

Every widget card follows:

```
┌─────────────────────────────┐
│ Header: metric name  [MOCK] │  ← freshness badge right-aligned
│─────────────────────────────│
│ Body: value / chart / table │
│                             │
│─────────────────────────────│
│ Footer: trend or action     │  ← optional; omit if no action
└─────────────────────────────┘
```

### DailyExecutionPanel Widget States

The panel conforms to the WP-157 Widget Contract. For checklist data the
four states resolve as:

| State | Condition | Render |
|---|---|---|
| `loading` | initial render before the composable has resolved persisted state | skeleton / spinner placeholder |
| `error` | `localStorage` read or `JSON.parse` failure | fallback message (full sentence), no crash; treat checklist as empty-but-recoverable |
| `empty` | static checklist array length === 0 (should not occur with the locked 9-item set, but the branch must exist) | "No checklist items configured." |
| `data` | normal case | the 9 items grouped by category |

A `localStorage` read failure must be caught and surfaced as the `error`
state — it must never throw out of the composable or blank the page.

### Freshness Badge Behavior

- Right-aligned in each widget card header
- Shows `MOCK` while data is mock-sourced (current state of this WP)
- A future real-data WP will swap this to `Updated {relative time}`
  when the widget consumes live data; that behavior is out of scope here
  and must not be pre-built

### Accessibility Baseline (mandatory)

- Each checklist item MUST render a real checkbox input paired with a
  visible text label (PrimeVue `Checkbox` + label), and MUST be operable
  by keyboard (tab to focus, space/enter to toggle)
- Completed items MAY use a muted text style but MUST remain visible —
  never collapsed or hidden
- Every alert MUST carry a text severity label **and** a PrimeVue
  severity icon — color is never the sole status indicator
- This baseline restates and tightens the engine-wide "color never sole
  status indicator" constraint for this WP's surfaces

### Design Token Lock

All widgets must use the following PrimeVue CSS custom properties
for structural styling:

| Purpose | Token |
|---|---|
| Card background | `--p-surface-card` |
| Card/widget border | `--p-surface-border` |
| Primary text | `--p-text-color` |
| Secondary/muted text | `--p-text-muted-color` |
| Accent (non-status) | `--p-primary-color` |

Status colors (RYG, alert severity) must use PrimeVue severity
classes or semantic tokens — not hard-coded hex values.
Hard-coded hex colors are forbidden for any structural element
(backgrounds, borders, text). Temporary debug colors must be
removed before commit.

### Sidebar State

Sidebar responsive behavior is controlled by reactive state in
`AppLayout.vue`:

- `isCollapsed: boolean` — true when viewport is 768-1199px
- `isHidden: boolean` — true when viewport is < 768px

Breakpoint transitions are driven by a `resize` event listener
or a `useBreakpoints` composable — not by CSS media queries on `body`
or `html`. To prevent flicker:

- The `resize` handler MUST be throttled (100–200ms)
- `isCollapsed` / `isHidden` MUST only be reassigned when a breakpoint
  boundary (768px / 1200px) is actually crossed — not on every resize
  tick. Compute the target state from the current width and write it
  only if it differs from the present state.
- Any `resize` listener added in `onMounted` MUST be removed in
  `onUnmounted`.

### Required Tests (`useDailyChecklist.test.ts`)

The composable must have the following test coverage:

1. Initializes with 9 items in 3 categories
2. `toggle(id)` flips `completed` state and sets/clears `completedAt`
3. `completedCount` updates correctly after multiple toggles
4. State persists to `localStorage` and restores on re-init
5. New date (via injected `now`) produces a fresh (unchecked) checklist
6. Keys older than 30 days are pruned on initialization (drive the date
   via the injected `now` provider)
7. Unknown item IDs passed to `toggle()` are silently ignored
8. A persisted entry whose `id` is not in the static config is ignored
   on restore, and a static item missing from the persisted value is
   initialized as unchecked (State Restoration Rules)
9. A shape-invalid persisted entry (e.g. `completed` not a boolean, or a
   non-object value) restores as unchecked without throwing — the
   parsed-but-malformed case, distinct from a `JSON.parse` throw

Tests must not mock `Date` globally. Date control is provided through
the composable's `now` option (`useDailyChecklist({ now })`), never by
overwriting the global `Date`.

---

## Locked Contract Values

| Item | Value | Decision |
|---|---|---|
| Checklist storage | localStorage per user per day | D-16201 |
| Default theme | Dark (Aura dark preset) | D-16202 |
| Responsive sidebar collapse | 768px breakpoint | D-16203 |
| Checklist item set | 9 items (4 content + 3 community + 2 growth) | DASHBOARD-REQUIREMENTS.md §11 |
| Card structure | Header/body/footer pattern | DASHBOARD-REQUIREMENTS.md §12 |

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- ESM only, Node v22+
- Human-style code (00.6)
- Full file contents for new/modified files
- Test files `.test.ts`
- Full-sentence error messages
- pnpm workspace

**Packet-specific:**
- MUST NOT import `@legendary-arena/game-engine`, `registry`,
  `preplan`, or `server`
- MUST NOT call real backend URLs; all data from mocks
- PrimeVue 4 is the sole component library
- Every widget MUST conform to the Widget Contract (4-state +
  freshness) per WP-157
- No new npm dependencies beyond what WP-157 already installed
  (unless PrimeVue's theme toggle requires `@primevue/themes`
  sub-import — document in decisions if so)
- Chart styling uses PrimeVue design tokens, not custom hex colors
- Accessibility: color never sole status indicator (pair with
  text/icon)

---

## Acceptance Criteria

- [ ] Overview page shows Daily Execution Panel with 9 checklist items
      grouped by category
- [ ] Checking an item persists across page navigation (same session)
- [ ] Refreshing the browser preserves checklist state (localStorage)
- [ ] Visiting the dashboard the next calendar day shows a fresh
      (unchecked) checklist
- [ ] Overview page shows completion summary badge ("Daily: N/M
      complete")
- [ ] Theme toggle switches between dark and light mode
- [ ] Theme preference persists across page reloads
- [ ] Default theme is dark on first visit
- [ ] Sidebar collapses to icon-only below 1200px viewport width
- [ ] Sidebar hides completely below 768px with a toggle button
- [ ] All KPI cards follow header/body/footer structure with PrimeVue
      surface tokens
- [ ] Alert severity colors match §11 (green/yellow/red) and each
      alert has a text severity label (not color-only)
- [ ] Charts use consistent colors from PrimeVue theme tokens
- [ ] No pie charts anywhere
- [ ] DataTable on Players page has striped rows and sticky header
- [ ] DailyExecutionPanel conforms to Widget Contract (4-state
      rendering + freshness badge) per WP-157
- [ ] `useDailyChecklist.test.ts` passes all 9 required tests
- [ ] `pnpm -r build` exits 0
- [ ] Zero imports from `@legendary-arena/*` workspace packages

---

## Verification Steps

```bash
# 1. Build
pnpm install && pnpm -r build

# 2. Run dev server
pnpm dash:dev

# 3. Login → Overview
#    → 4 KPI cards + 2 charts + alerts + Daily Execution Panel visible

# 4. Check 3 items in the panel
#    → Summary badge updates ("Daily: 3/9 complete")
#    → Navigate to /players and back to /overview
#    → Checked items still checked

# 5. Refresh browser
#    → Checklist state preserved

# 6. Toggle theme (dark ↔ light)
#    → Colors switch; preference survives reload

# 7. Resize browser to 900px width
#    → Sidebar collapses to icons

# 8. Resize browser to 600px width
#    → Sidebar hidden; hamburger menu visible

# 9. Navigate to /players
#    → DataTable has striped rows, sticky header, visible filter row

# 10. Run checklist composable tests
pnpm --filter @legendary-arena/dashboard test
#    → 9 tests pass

# 11. Grep for forbidden imports
rg "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/
#    → Zero matches

# 12. Full monorepo build
pnpm -r build
#    → Exits 0
```

---

## Definition of Done

1. `pnpm -r build` exits 0
2. `pnpm --filter @legendary-arena/dashboard build` exits 0
3. Daily Execution Panel renders on Overview with 9 items in 3
   categories
4. Checklist state persists in localStorage per user per day
5. Checklist resets on new calendar day
6. Completion summary badge visible on Overview
7. Theme toggle works (dark/light) with localStorage persistence
8. Responsive sidebar: full at 1200+, collapsed at 768-1199, hidden
   at <768
9. All widget cards use consistent header/body/footer structure
10. PrimeVue design tokens used for colors (no custom hex for
    structural elements)
11. Alert severity paired with text label (not color-only)
12. No pie charts
13. DataTable: striped rows, sticky header, visible filter row
14. DailyExecutionPanel conforms to Widget Contract (4-state +
    freshness)
15. `useDailyChecklist.test.ts` passes all 9 required tests
16. Zero imports from `@legendary-arena/*` workspace packages
17. `docs/ai/DECISIONS.md` updated (D-16201 through D-16203)
18. `docs/ai/work-packets/WORK_INDEX.md` updated with WP-162 row

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-16201 | Daily checklist persists in localStorage per user per day; no server-side storage | Team is 1-3 people; server persistence adds API endpoints and migration for negligible benefit. Revisit if team grows beyond 3. |
| D-16202 | Default dashboard theme is dark (Aura dark preset) | Ops tools used for extended periods benefit from reduced eye strain. Light mode available via toggle. |
| D-16203 | Sidebar collapses at 768px; hides at <768px | Matches common dashboard responsive patterns. Dashboard is not mobile-optimized (§11 of requirements doc). |

---

## Future Work (Explicitly Deferred)

| Topic | Why Deferred |
|---|---|
| KPI targets + RYG thresholds | Requires real data to set meaningful baselines |
| Playbook links from red KPIs to ewiki | Requires wiki playbook pages to exist |
| Server-side checklist persistence | Not needed until team > 3 people |
| Phase A real data endpoints | Separate WP; depends on server telemetry design |
| North Star KPI (WPCP or equivalent) | Requires player accounts + subscription system |

---

## Anti-Patterns to Avoid

- Do NOT fetch checklist configuration from an API — it is a static
  array in source code
- Do NOT use custom hex colors for card backgrounds, borders, or
  text — use PrimeVue design tokens
- Do NOT add pie charts for any data visualization
- Do NOT make the sidebar responsive via media queries on `body` —
  use the layout component's own reactive state
- Do NOT introduce a new state management pattern for the checklist —
  use a composable with `ref` + `localStorage`, not a Pinia store
  (this data is per-browser, not shared)
- Do NOT add `@legendary-arena/*` imports to the dashboard
- Do NOT use deep watchers on checklist state for persistence —
  writes occur explicitly inside `toggle()` and `resetAll()` only
- Do NOT implement theme switching via CSS class toggles or manual
  overrides — use PrimeVue's theme preset API

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Checklist does not reset on new day | Date boundary logic not comparing local date strings correctly |
| Theme flashes light→dark on page load | `localStorage` read occurs after first mount instead of before |
| Sidebar flickers on browser resize | Resize handler not throttled; rapid state toggling |
| Checklist state lost between sessions | `userId` in storage key is undefined or randomly generated |
| Stale keys accumulating in localStorage | Pruning logic not running on composable init |

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | Single WP per session | PASS |
| 2 | Dependency discipline | PASS — WP-157 complete |
| 3 | Review gate | N/A — draft, not execution |
| 4 | Layer boundary | PASS — Client layer only |
| 5 | File count | PASS — ~3 new + ~8 modified; single-layer UI work |
| 6 | Contract stability | PASS — no existing contracts modified; extends widget set |
| 7 | Auth posture | N/A — mock auth unchanged |
| 8 | Determinism | N/A — no engine code |
| 9 | Persistence boundary | PASS — localStorage only; no DB |
| 10 | Test coverage | PASS — composable testable via node:test |
| 11 | Error handling | N/A — no new service endpoints |
| 12 | Code style (00.6) | PASS — ESM, full words, no abbreviations |
| 13 | Module system | PASS — ESM only |
| 14 | Naming | PASS — descriptive names |
| 15 | Comments | N/A — no engine state transitions |
| 16 | Drift detection | N/A — no canonical arrays |
| 17 | Vision alignment | PASS — internal ops tool; no player-facing surface |
| 18 | Pre-planning | N/A |
| 19 | Replay safety | N/A |
| 20 | Funding surface gate | N/A — no money-flow surface |
| 21 | API catalog (D-11804) | N/A — no server endpoints added |
