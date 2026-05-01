# EC-126 — Registry Viewer: Theme Zoom Slider (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-124-registry-viewer-theme-zoom-slider.md`
**Layer:** Client UI (`apps/registry-viewer/`)

> **Numbering note:** EC-126 is the next free EC slot after EC-125
> closed WP-123 on 2026-05-01 (Commit A `fbb5174`). EC-119 remains
> reserved for WP-115 (Public Leaderboard HTTP Endpoints — draft on
> disk); EC-121 was reserved for the unmerged WP-120 Loadout Preview
> branch per the EC-122 retarget breadcrumb. Per the locked precedent
> (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 →
> EC-122, EC-123, EC-124, EC-125), the WP-keyed EC retargets to the
> next free slot that does not shadow a known or imminent WP — EC-126.
> The WP number (WP-124) is unchanged.

## §0 — Scope Model (Read Once)

This EC enforces **two distinct scopes**. They are not the same; do not
conflate them.

### A) Runtime / implementation scope (STRICT — 4 files)

Only these four code files under `apps/` may change:

1. `apps/registry-viewer/src/composables/useThemeSize.ts` (new)
2. `apps/registry-viewer/src/components/ThemeSizeSlider.vue` (new)
3. `apps/registry-viewer/src/components/ThemeGrid.vue` (modified)
4. `apps/registry-viewer/src/App.vue` (modified)

Any other change under `apps/`, `packages/`, or `data/` is a **hard
abort** (see §Session Abort Conditions A).

### B) Total staged set (10 files at session close)

This execution closes WP-124 and records EC-126, so doc/ledger files
are also staged. The complete `git diff --name-only` output at session
end is expected to be exactly these **10** files — no more, no less:

1. `apps/registry-viewer/src/composables/useThemeSize.ts`
2. `apps/registry-viewer/src/components/ThemeSizeSlider.vue`
3. `apps/registry-viewer/src/components/ThemeGrid.vue`
4. `apps/registry-viewer/src/App.vue`
5. `docs/ai/work-packets/WP-124-registry-viewer-theme-zoom-slider.md`
6. `docs/ai/execution-checklists/EC-126-registry-viewer-theme-zoom-slider.checklist.md`
7. `docs/ai/work-packets/WORK_INDEX.md`
8. `docs/ai/execution-checklists/EC_INDEX.md`
9. `docs/ai/DECISIONS.md`
10. `docs/ai/STATUS.md`

An 11th file under `apps/`, `packages/`, or `data/` is a runtime-scope
violation (§Session Abort Conditions A). An 11th file under `docs/`
(beyond the 6 ledger / doc files above) is a doc-scope violation
(§Session Abort Conditions A).

> **Staging discipline (read this before any `git add`).**
> Stage by **exact file path only**. Never use `git add .`,
> `git add -A`, or `git add -u`. The repo currently has at least one
> unrelated untracked file
> (`docs/ai/execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md`,
> observed at WP-122 / WP-123 pre-flight 2026-05-01 and likely still
> untracked at WP-124 draft time) that an over-eager blanket-add
> would pull into this commit. Always pass each path explicitly to
> `git add`. The 10-file expected staged set in §0(B) is the sole
> authority on what may be staged. This is the single source of
> truth for staging discipline; §Guardrails references back here
> rather than restating. Placed early because over-eager staging is
> the most common execution failure mode.

> **Canonical decision (D-12401):**
> The Themes view uses a dedicated zoom slider that:
> - Persists to `localStorage['themeGridSize']`
> - Drives `--theme-grid-min-width`
> - Uses range 80–260, step 10, default 150
> - Is implemented as a second copy (not abstraction) of WP-121's
>   pattern — `useCardSize.ts` and `CardSizeSlider.vue` are
>   byte-identical pre- and post-execution
>
> All references below inherit from this decision; restated values
> are for executor convenience only — D-12401 is the source of
> truth.

> **Testing note:** No tests are added in EC-126. Per the locked
> viewer-side precedent (WP-066 / WP-094 / WP-096 / WP-114 / WP-121),
> the registry-viewer has no Vue component-test harness at baseline;
> verification is build + typecheck + manual smoke only. Test
> baseline preserved at `31 / 6 / 31 / 0`. Subsequent sections
> reference this note rather than restating the rationale.

---

## Before Starting

> **STOP** if any checkbox below is false.

- [ ] WP-121 merged: `apps/registry-viewer/src/composables/useCardSize.ts`
      exists with `STORAGE_KEY = "cardGridSize"`, module-scoped ref
      pattern, narrowing, self-heal `persistSafely`, swallowed `setItem`
      failure; `apps/registry-viewer/src/components/CardSizeSlider.vue`
      exists; D-12101 records the locked WP-121 conventions this packet
      mirrors.
- [ ] WP-091 merged: `apps/registry-viewer/src/components/ThemeGrid.vue`
      renders the themes via CSS Grid with
      `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));`
      at line 60.
- [ ] `apps/registry-viewer/src/App.vue` has a themes-view filter bar
      (`<template v-if="activeView === 'themes'">` →
      `<div class="filter-bar">` at lines 509–513) containing the
      themes search `<input>` (`v-model="themeSearchText"`) and the
      `<span class="count">{{ filteredThemes.length }} themes</span>`
      span. No other filter-bar control exists between them at session
      start.
- [ ] Baseline captured:
      `pnpm --filter registry-viewer build` exits 0,
      `pnpm --filter registry-viewer typecheck` exits 0, and
      `pnpm --filter registry-viewer test` reports
      `tests 31 / suites 6 / pass 31 / fail 0` (locked post-EC-125
      baseline at `main` HEAD `919703f`, 2026-05-01). Post-session
      expectation: **UNCHANGED** at `31 / 6 / 31 / 0` (no tests
      added; the viewer has no Vue component-test harness at
      baseline).
- [ ] `useCardSize.ts` and `CardSizeSlider.vue` are not edited by any
      parallel session (the cards-side composable + component are
      byte-identical pre- and post-execution per §Guardrails).
- [ ] No parallel session is editing
      `apps/registry-viewer/src/components/{ThemeGrid,ThemeSizeSlider}.vue`
      or `apps/registry-viewer/src/App.vue`'s themes-view region.

## Session Abort Conditions

Immediately ABORT (do not continue coding) if any condition below is
observed during execution.

### A) Scope violations (mechanical — checkable via `git diff --name-only`)

- Any edit is proposed to
  `apps/registry-viewer/src/composables/useCardSize.ts` or
  `apps/registry-viewer/src/components/CardSizeSlider.vue` (the
  cards-side reference files; byte-identical lock).
- Any edit is proposed to
  `apps/registry-viewer/src/components/CardGrid.vue` (cards-side
  consumer; out-of-scope).
- Any edit is proposed under `packages/registry/**`,
  `packages/game-engine/**`, `packages/preplan/**`, `apps/server/**`,
  `apps/arena-client/**`, or `data/**`.
- Any other `.vue` file is edited beyond `ThemeGrid.vue`,
  `ThemeSizeSlider.vue`, and `App.vue` (e.g., `ThemeDetail.vue`,
  `LoadoutBuilder.vue`, `LoadoutPreview.vue`, `CardDetail.vue`,
  `HealthPanel.vue`, `GlossaryPanel.vue` — all out-of-scope).
- Any edit is proposed to
  `apps/registry-viewer/src/composables/useResizable.ts` or
  `apps/registry-viewer/src/composables/useCardViewMode.ts`
  (adjacent composables; out-of-scope).
- Any additional file under `apps/`, `packages/`, or `data/` appears
  in `git diff --name-only` beyond the four files permitted in §0(A).
- Any additional doc file appears in `git diff --name-only` beyond
  the six ledger / doc files in §0(B) (positions 5–10).

### B) Semantic violations

- The composable's public API is anything other than the locked
  shape `{ themeSize: Ref<number>; setThemeSize: (next: number) => void; }`.
  Adding `resetThemeSize`, `clamp`, `minThemeSize` / `maxThemeSize`
  accessors, or any other export beyond the four range constants is
  a FAIL.
- The localStorage key is anything other than `'themeGridSize'`
  (no rename, no prefix, no abbreviation).
- The CSS variable is anything other than `--theme-grid-min-width`
  (no abbreviation, no prefix).
- The range constants are anything other than the locked values:
  `MIN_THEME_WIDTH_PX = 80`, `MAX_THEME_WIDTH_PX = 260`,
  `DEFAULT_THEME_WIDTH_PX = 150`, `THEME_WIDTH_STEP_PX = 10`.
- The default is set to `130` (cards' default) instead of `150`
  (themes' default per the existing `ThemeGrid.vue:60`
  `minmax(150px, 1fr)` rule). **This is a FAIL.** The cards /
  themes default asymmetry is intentional and locked per Canonical
  decision (D-12401).
- The column-track rule on `.grid` in `ThemeGrid.vue` is anything
  other than the locked
  `grid-template-columns: repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr));`.
  Splitting the rule, dropping the `150px` literal fallback, or
  pointing the variable at a different rule is a FAIL.
- `useCardSize.ts` or `CardSizeSlider.vue` is parameterized,
  refactored into a shared base, or otherwise modified — the
  *duplicate first* lock is preserved byte-identical.
- The slider mounts anywhere other than the themes-view filter bar
  between the search input and the count span (e.g., in
  `header-actions`, in the cards-view filter bar, in the body
  region, inside `ThemeGrid.vue` itself).
- `applyThemeFilters()` or `applyFilters()` is called from the
  slider's `@input` handler. The handler must only call
  `setThemeSize`.
- Any other CSS rule on `ThemeGrid.vue` is modified (`.theme-tile`,
  `.img-wrap`, `.tile-info`, `.tile-name`, `.tile-mastermind`,
  `.tile-meta`, `.tile-players`, `.tile-heroes`, `.type-badge`,
  `.grid-wrapper`, `.empty` rules are byte-identical pre- and
  post-execution).
- Test count is anything other than `31 / 6 / 31 / 0`. No tests
  added; baseline is preserved.

## Locked Values (do not re-derive)

- **Production files modified (verbatim):**
  - `apps/registry-viewer/src/composables/useThemeSize.ts` (new)
  - `apps/registry-viewer/src/components/ThemeSizeSlider.vue` (new)
  - `apps/registry-viewer/src/components/ThemeGrid.vue` (modified)
  - `apps/registry-viewer/src/App.vue` (modified)
- **localStorage key (verbatim):** `'themeGridSize'`.
- **CSS variable name (verbatim):** `--theme-grid-min-width`.
- **Range constants (verbatim):**
  `MIN_THEME_WIDTH_PX = 80`,
  `MAX_THEME_WIDTH_PX = 260`,
  `DEFAULT_THEME_WIDTH_PX = 150`,
  `THEME_WIDTH_STEP_PX = 10`.
- **Composable public API (verbatim):**
  `{ themeSize: Ref<number>; setThemeSize: (next: number) => void; }`.
- **Composable destructure in `ThemeSizeSlider.vue` (verbatim):**
  `const { themeSize, setThemeSize } = useThemeSize();`
- **Composable destructure in `ThemeGrid.vue` (verbatim):**
  `const { themeSize } = useThemeSize();`
- **Composable import path (verbatim):**
  `from "../composables/useThemeSize";`
- **`ThemeSizeSlider` import path in `App.vue` (verbatim):**
  `from "./components/ThemeSizeSlider.vue";`
- **`.grid` column-track rule on `ThemeGrid.vue` (verbatim):**
  `grid-template-columns: repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr));`
- **`.grid` `:style` binding on `ThemeGrid.vue` (verbatim):**
  `:style="{ '--theme-grid-min-width': themeSize + 'px' }"`
- **Slider label text (verbatim):** `Theme Size`.
- **Slider `aria-label` (verbatim):** `Theme grid size in pixels`.
- **Slider mount point:** themes-view `.filter-bar`, between the
  themes search `<input>` and the `<span class="count">` (after the
  search input, before the count span).
- **Pre-session test baseline (verbatim):**
  `tests 31 / suites 6 / pass 31 / fail 0` (locked post-EC-125 at
  `main` HEAD `919703f`, 2026-05-01).
- **Post-session test baseline (verbatim):** UNCHANGED at
  `tests 31 / suites 6 / pass 31 / fail 0` — no tests added.

## Guardrails

- **Four-file production scope.** Only the four files in §0(A) are
  edited. Any other file outside that set (governance ledgers
  excluded — see §0(B)) is a scope violation.
- **Stage by exact file path only.** See the staging-discipline
  callout immediately after §0 Scope Model — that callout is the
  single source of truth for staging discipline; do not re-derive.
  (Do not restate here; that callout is authoritative.)
- **Duplicate, do not abstract.** `useThemeSize.ts` is structurally
  a copy of `useCardSize.ts` with theme-prefixed names — same
  module-scoped ref pattern, same narrowing block, same
  `clampToRange` / `readStoredRawSafely` / `persistSafely` helpers,
  same full-sentence swallow comment shape. Only the four range
  constants, `STORAGE_KEY` value, exported names, and JSDoc
  clause-numbers (referencing WP-124 / EC-126 / D-12401 instead of
  WP-121 / EC-122 / D-12101) differ. **No `useCardSize` imports
  from `useThemeSize` and vice versa.** No shared base file. No
  helper extraction.
- **`ThemeSizeSlider.vue` is a duplicate of `CardSizeSlider.vue`.**
  Same `<script setup lang="ts">` shape, same `handleSliderInput`
  helper, same template structure (label + slider-label span + input
  + slider-readout span), same scoped CSS shape with the same
  dark-theme color tokens (`#22222e` / `#33334a` / `#c8c8e0` /
  `#8888aa` / `#6666aa` family). Only the imports, destructured
  names, bound constants, label text, and `aria-label` text differ.
- **No edits to:** `useCardSize.ts`, `CardSizeSlider.vue`,
  `CardGrid.vue`, `useCardViewMode.ts`, `ViewModeToggle.vue`,
  `CardDataDisplay.vue`, `CardDataTile.vue`, `CardDetail.vue`,
  `ThemeDetail.vue`, `LoadoutBuilder.vue`, `LoadoutPreview.vue`,
  `useResizable.ts`, `lib/theme.ts`, `lib/themeClient.ts`,
  `registry-config.json`, any `.test.ts` file.
- **No new npm dependencies; no `package.json` change in any
  workspace.**
- **No tests added; no test config change; no `.test.ts` file
  created.** Test baseline preserved at `31 / 6 / 31 / 0`.
- **No imports from** `boardgame.io`,
  `@legendary-arena/{game-engine,preplan,server}`, `pg`, the
  Node-bearing `@legendary-arena/registry` barrel, or any `node:`
  built-in.
- **The `.grid` CSS rule's `150px` literal fallback inside
  `minmax(...)` is preserved** — the rule reads the CSS variable,
  but the literal fallback guarantees pre-packet behavior if the
  inline style is dropped.
- **`applyThemeFilters()` is not called** from the slider's
  `@input` handler — slider movement only changes a CSS variable.
- **The slider mounts in the themes-view filter bar only** — not
  in `header-actions`, not in the cards-view filter bar, not in the
  loadout view, not in the body region, not inside `ThemeGrid.vue`
  itself.
- **Composable exports exactly two names plus the four range
  constants** — no `resetThemeSize`, no `clamp`, no `min` / `max`
  accessor.
- **Cards / themes default asymmetry is intentional** per Canonical
  decision (D-12401): cards default to `130px` (D-12101); themes
  default to `150px` (D-12401). Each default matches its
  view's pre-packet `minmax(...)` literal so a zero-config first
  run is visually identical to the pre-packet baseline.
- **No refactor or formatting churn** outside the four files in §0(A)
  or the governance ledgers in §0(B). The themes-view filter bar's
  search `<input>` and `<span class="count">` are byte-identical
  pre- and post-execution; only a single new `<ThemeSizeSlider />`
  element is inserted between them.
- **No `// why:` churn** outside the new files and the two new
  insertion points in `ThemeGrid.vue` (the `useThemeSize` import +
  the `:style` bind on `.grid`).

## Required `// why:` Comments

All eight clauses below are mandatory. Missing any clause is an EC
fail.

- **`useThemeSize.ts` on `STORAGE_KEY`:** flat camelCase
  non-abbreviated unprefixed convention; mirrors `useCardViewMode.ts`
  (`'cardViewMode'`), `useResizable.ts` (`'cardDetailWidth'`), and
  `useCardSize.ts` (`'cardGridSize'`); single-origin SPA, no
  collision risk.
- **`useThemeSize.ts` on the four range constants:**
  `MIN_THEME_WIDTH_PX = 80` keeps `.tile-name` and
  `.tile-mastermind` legible at the smallest tile (same legibility
  floor as cards because the theme tile structure mirrors the card
  tile structure: same `aspect-ratio: 3/4` `img-wrap`, same ellipsis
  pattern on `.tile-name`); `MAX_THEME_WIDTH_PX = 260` fits a
  1024px viewport without grid reflow; `DEFAULT_THEME_WIDTH_PX = 150`
  matches the existing `ThemeGrid.vue` `minmax(150px, 1fr)` rule
  exactly so a zero-config first run is visually identical to the
  pre-packet baseline; `THEME_WIDTH_STEP_PX = 10` matches WP-121's
  step granularity for keyboard-arrow consistency across the two
  sliders.
- **`useThemeSize.ts` on the narrowing block:**
  `localStorage.getItem` returns `string | null`;
  `Number.parseInt` may yield `NaN`; out-of-range values would
  poison the downstream `--theme-grid-min-width` CSS-variable
  binding; anything that does not cleanly clamp into
  `[MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX]` defaults to
  `DEFAULT_THEME_WIDTH_PX`.
- **`useThemeSize.ts` on the self-heal `persistSafely(initialSize)`
  call:** writing the narrowed value back on first load guarantees
  the invariant holds across tabs and reloads.
- **`useThemeSize.ts` on the `persistSafely` `catch {}`:**
  full-sentence swallow per 00.6 Rule 11 (iOS Safari private mode,
  quota, group-policy restrictions; in-memory ref already updated;
  only cross-reload persistence lost). Identical in shape to
  `useCardSize.ts:131–141`.
- **`ThemeGrid.vue` on the `useThemeSize` import:** composable is
  the single source of truth; the grid reads it directly to avoid
  prop plumbing through `App.vue` (parallels the `useCardSize`
  precedent at `CardGrid.vue`).
- **`ThemeGrid.vue` on the `:style` binding for
  `--theme-grid-min-width`:** scaling is CSS-driven (no per-tile
  recalculation); `.img-wrap`'s `aspect-ratio: 3/4` propagates
  width to height proportionally; the literal `150px` fallback in
  the `minmax(...)` call preserves pre-packet behavior if the
  inline style is dropped.
- **`ThemeSizeSlider.vue` module-header JSDoc:** native
  `<input type="range">` is keyboard-accessible by default (Tab to
  focus, Left / Right arrows for step, Home / End for bounds); the
  displayed value is the column min-width in pixels (not a tile
  count or a percentage); the locked range was chosen so
  `.tile-name` and `.tile-mastermind` remain legible at the minimum
  and the largest tile fits without grid reflow on a 1024px
  viewport; the file is a duplicate of `CardSizeSlider.vue` per the
  *duplicate first* rule (D-12401 cites the rule and the two-copy
  threshold).

## Files to Produce

- `apps/registry-viewer/src/composables/useThemeSize.ts` — **new** —
  module-scoped composable mirroring `useCardSize.ts`; exports the
  four range constants and `useThemeSize()`.
- `apps/registry-viewer/src/components/ThemeSizeSlider.vue` —
  **new** — native range input bound to the composable; themes-view
  filter-bar control.
- `apps/registry-viewer/src/components/ThemeGrid.vue` — **modified**
  — bind `--theme-grid-min-width` on `.grid`; update column-track
  rule with `150px` fallback; one new import + one new destructure
  in `<script setup>`.
- `apps/registry-viewer/src/App.vue` — **modified** — import and
  mount `<ThemeSizeSlider />` inside the themes-view filter bar.
- Governance at session close (positions 5–10 of the §0(B) staged
  set, not counted against §0(A)'s 4-file runtime scope):
  `STATUS.md` block; `DECISIONS.md` D-12401 entry; `WORK_INDEX.md`
  WP-124 `[ ]` → `[x]`; `EC_INDEX.md` EC-126 Draft → Done; the WP
  and EC files themselves.

## After Completing

- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter registry-viewer test` reports
      `tests 31 / suites 6 / pass 31 / fail 0` (UNCHANGED). Any
      change in test count, suite count, or fail count is a FAILED
      criterion.
- [ ] `git diff apps/registry-viewer/src/composables/useCardSize.ts` →
      no output.
- [ ] `git diff apps/registry-viewer/src/components/CardSizeSlider.vue` →
      no output.
- [ ] `git diff apps/registry-viewer/src/components/CardGrid.vue` →
      no output.
- [ ] `git diff apps/registry-viewer/package.json` → no output.
- [ ] `git diff packages/registry/` → no output (entire directory
      unchanged).
- [ ] `git diff --name-only` lists exactly the 10 files in §0(B), no
      more, no less. Any additional file under `apps/`, `packages/`,
      or `data/` is a §0(A) runtime-scope violation; any additional
      file under `docs/` is a §0(B) doc-scope violation. Both are
      FAILED criteria — see §Session Abort Conditions A.
- [ ] `Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern 'STORAGE_KEY = "themeGridSize"'`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "MIN_THEME_WIDTH_PX = 80"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "MAX_THEME_WIDTH_PX = 260"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "DEFAULT_THEME_WIDTH_PX = 150"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "THEME_WIDTH_STEP_PX = 10"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "export function useThemeSize"`
      returns exactly one match.
- [ ] `Select-String -Path "apps\registry-viewer\src\components\ThemeGrid.vue" -Pattern 'minmax\(var\(--theme-grid-min-width, 150px\), 1fr\)'`
      returns exactly one match. Confirms the new column-track rule
      emits at the right place (and not just in comments).
- [ ] `Select-String -Path "apps\registry-viewer\src\components\ThemeGrid.vue" -Pattern 'minmax\(150px, 1fr\)'`
      returns zero matches outside the new rule. Confirms the bare
      literal-150px rule was rewritten.
- [ ] `Select-String -Path "apps\registry-viewer\src\components\ThemeGrid.vue" -Pattern "useThemeSize"`
      returns at least one match (import + destructure).
- [ ] `Select-String -Path "apps\registry-viewer\src\components\ThemeSizeSlider.vue" -Pattern "Theme Size"`
      returns at least one match (the slider label).
- [ ] `Select-String -Path "apps\registry-viewer\src\components\ThemeSizeSlider.vue" -Pattern "Theme grid size in pixels"`
      returns exactly one match (the `aria-label`).
- [ ] `Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "<ThemeSizeSlider"`
      returns exactly one match (the template instance).
- [ ] `Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "import ThemeSizeSlider"`
      returns exactly one match (the import statement).
- [ ] Manual smoke (optional, not gated) on
      `pnpm --filter registry-viewer dev`:
      slider visible in themes-view filter bar between the search
      input and the count span; movement scales theme tiles in real
      time; reload preserves chosen size; switching to the Cards tab
      shows the Card Size slider with its own independent value;
      Theme search + selected theme preserved across slider movement;
      no console errors; no Vue warnings about duplicate `v-for`
      keys; image / data view toggle (cards-side) still works
      independently.
- [ ] `docs/ai/STATUS.md` updated — registry viewer themes-view now
      exposes a Theme Size slider persisted as `themeGridSize`;
      cards-view Card Size slider unchanged (independent state);
      test baseline UNCHANGED.
- [ ] `docs/ai/DECISIONS.md` updated — D-12401 (locked range,
      default `150`, storage key `themeGridSize`, CSS variable
      `--theme-grid-min-width`, composable name `useThemeSize`,
      *duplicate first* citation, explicit deferral of any future
      abstraction to a third-zoom-slider WP).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-124 row checked off
      with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-126 row set to
      `Done <date>`.

## Common Failure Smells

- **Symptom:** Tile-info text becomes unreadable at min slider value
  → `MIN_THEME_WIDTH_PX` was lowered below `80`; restore the locked
  value. If the legibility floor genuinely fails because a font-size
  change in `ThemeGrid.vue` shifted it (unlikely — `.tile-name` is
  `0.72rem`, identical to `CardGrid.vue`), STOP and escalate per
  §Session Protocol — do not silently relax the range.
- **Symptom:** Slider movement triggers a re-fetch / spinner →
  `applyThemeFilters()` leaked into the `@input` handler; the
  handler must call only `setThemeSize`.
- **Symptom:** Reload renders tiles at the wrong size → the
  narrowing block's clamp range is wrong, or `Number.parseInt` was
  replaced with `Number(...)` (which would accept `'150px'` literally
  but also turn a stored `'150'` into `NaN` on whitespace
  irregularities). Restore the locked
  `Number.parseInt(raw, 10)` + `clampToRange` shape.
- **Symptom:** Slider jumps instead of moving smoothly →
  `step` attribute is not bound to `THEME_WIDTH_STEP_PX`; restore the
  locked step of 10.
- **Symptom:** Grid layout breaks when CSS variable is unset (e.g.,
  during initial paint) → the `minmax(...)` literal `150px` fallback
  was dropped from the rewritten rule. Restore the locked
  `minmax(var(--theme-grid-min-width, 150px), 1fr)` shape.
- **Symptom:** Cards-view tiles change size with the Theme Size
  slider → the slider's CSS variable was applied to a parent of both
  grids instead of `ThemeGrid.vue`'s `.grid` only. The `:style` bind
  must be on `ThemeGrid.vue`'s `.grid` element, not on
  `App.vue`'s `.body` or any shared ancestor.
- **Symptom:** Theme Size slider value resets when switching tabs →
  the composable was incorrectly scoped per-component instead of
  module-scoped. The `cardSize` ref must be declared at module top
  level (outside `useThemeSize()`), exactly as `useCardSize.ts:63`
  does.
- **Symptom:** Selection clears on slider movement →
  `selectedTheme` is being mutated somewhere in the slider chain;
  verify the `@input` handler calls `setThemeSize` only.
- **Symptom:** Both sliders share state → the new composable is
  using `STORAGE_KEY = "cardGridSize"` (copy-paste error) instead of
  `"themeGridSize"`. Verify the verbatim locked value.
- **Symptom:** Test count changes → tests were added against the
  Guardrail. Revert the test-file changes; verification for this WP
  is build + typecheck + manual smoke per the WP-066 / WP-094 /
  WP-096 / WP-114 / WP-121 viewer-side precedent.
- **Symptom:** TypeScript reports "Cannot find module" on
  `useThemeSize` import → the file was saved with `.tsx` extension or
  in the wrong directory. The file is
  `apps/registry-viewer/src/composables/useThemeSize.ts` exactly
  (matches `useCardSize.ts` location).
- **Symptom:** An 11th file appears in `git diff --name-only` →
  Session Abort Condition A. The four-file production lock is
  intentional. Re-read §0(A) (runtime / implementation scope) vs
  §0(B) (total staged set) to identify which scope was violated.
  Common cause: an over-eager `git add -A` or `git add .`
  (forbidden — see §Guardrails staging discipline).
- **Symptom:** `git diff apps/registry-viewer/src/composables/useCardSize.ts`
  shows changes → the cards-side composable was edited (likely an
  attempt to refactor into a shared base). Revert. The
  *duplicate first* lock is preserved byte-identical until a third
  zoom slider arrives.
- **Symptom:** `git diff apps/registry-viewer/src/components/CardSizeSlider.vue`
  shows changes → the cards-side component was edited (likely a
  parallel-edit drift from styling the new slider to match). The
  two components share scoped CSS shape but each owns its own copy;
  do not modify `CardSizeSlider.vue`.
- **Symptom:** The `// why:` block has fewer than eight required
  clauses → re-read §Required `// why:` Comments; all eight are
  mandatory.
