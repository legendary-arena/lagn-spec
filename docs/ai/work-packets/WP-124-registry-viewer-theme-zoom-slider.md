# WP-124 — Registry Viewer: Theme Zoom Slider

**Status:** Draft (authored 2026-05-01; awaiting user review and lint-gate sign-off)
**Primary Layer:** Client UI (`apps/registry-viewer/`)
**Dependencies:**
- **Hard:** WP-121 (Card Zoom Slider — established the
  `useCardSize.ts` + `CardSizeSlider.vue` shape this packet duplicates
  line-for-line for the themes view; D-12101 locks the storage-key /
  CSS-variable / range-constants conventions this packet mirrors with
  theme-prefixed names).
- **Hard:** WP-066 (image-to-data view toggle — established the
  module-scoped + localStorage-persisted + self-healing composable
  pattern WP-121 codified and this packet inherits at one remove).
- **Soft:** WP-091 (themes-view filter bar — `App.vue:509–513` is the
  mount point; modified only by inserting a single component
  instance).
- **Compatible with (not dependent on):** any future viewer-side WP
  that touches `App.vue` outside the themes-view filter bar — merge
  order is not load-bearing.

---

## Session Context

The registry viewer at `cards.barefootbetters.com` shipped a Card Zoom
slider on the cards-view filter bar under WP-121 / EC-122 / D-12101.
That slider drives a single CSS variable (`--card-grid-min-width`) on
`CardGrid.vue`'s `.grid` element, persists to
`localStorage['cardGridSize']` via the module-scoped `useCardSize`
composable, and sits between the hero-class select and the count span
in the cards-view filter bar.

The themes view at the same surface has no analogous control. Theme
tiles render at a single fixed column min-width of `150px` (see
`apps/registry-viewer/src/components/ThemeGrid.vue:60` —
`grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))`). Users
who scan many themes want denser tiles; users reviewing comic art and
flavor text want larger tiles. The asymmetry between the cards view
(now zoomable) and the themes view (still fixed) is the narrow gap
this packet closes.

The pattern is locked. WP-121 D-12101 already settled storage-key
conventions (flat camelCase, no prefix), CSS variable naming (full
English, no abbreviations), range-constant naming
(`MIN_*_WIDTH_PX` / `MAX_*_WIDTH_PX` / `DEFAULT_*_WIDTH_PX` /
`*_WIDTH_STEP_PX`), composable public-API shape
(`{ size: Ref<number>, setSize: (next: number) => void }`), and
slider mount discipline (filter bar of the owning view; not
`header-actions`; not the other view's filter bar).

This packet intentionally duplicates `useCardSize` → `useThemeSize`.
Per `.claude/rules/code-style.md`, abstraction is deferred until a
third zoom control exists; two copies are the *canonical* state.
Subsequent sections refer to this as the *duplicate-first rule*
without re-justifying.

The lever is one CSS variable on `.grid` in `ThemeGrid.vue`. The
existing `aspect-ratio: 3/4` rule on `.img-wrap` already drives tile
height proportionally to width, so changing the column min-width
scales every theme tile uniformly without per-tile calculation,
without touching `applyThemeFilters()`, and without re-fetching any
theme data. The slider is scoped to the themes view only — the cards
view, loadout view, set pills, and type-bar are not in scope.

---

## Goal

> **Canonical decision (D-12401):**
> The Themes view uses a dedicated zoom slider that:
> - Persists to `localStorage['themeGridSize']`
> - Drives `--theme-grid-min-width`
> - Uses range 80–260, step 10, default 150
> - Is implemented as a second copy (not abstraction) of WP-121's pattern
>
> All references below inherit from this decision; restated values are
> for executor convenience only — D-12401 is the source of truth.

> **Testing note:** No tests are added in this WP. Per the locked
> viewer-side precedent (WP-066 / WP-094 / WP-096 / WP-114 / WP-121),
> the registry-viewer has no Vue component-test harness at baseline;
> verification is build + typecheck + manual smoke only. Test baseline
> preserved at `31 / 6 / 31 / 0`. Subsequent sections reference this
> note rather than restating the rationale.

After this session:

- A keyboard-accessible **Theme Size** slider exists in the themes-view
  filter bar of `apps/registry-viewer/`, immediately above the theme
  grid.
- Moving the slider changes the theme grid's column min-width in real
  time; flipping the slider does not re-fetch theme data, does not
  reset the search filter or selection, and does not change theme
  metadata loading.
- The user's chosen size is persisted to `localStorage` under the key
  `themeGridSize` and survives page reloads.
- Theme tile layout remains stable across the full slider range — no
  overlap, no clipping outside intentional `text-overflow: ellipsis`
  on the `.tile-name` / `.tile-mastermind` rows, no jitter, no
  console errors.
- Default value (`150`) matches the current production column
  min-width, so a zero-config first-run renders identically to the
  pre-packet baseline.
- The cards view, loadout view, sidebar (`ThemeDetail.vue`,
  `CardDetail.vue`), `ImageLightbox.vue`, the existing `useCardSize`
  composable, and the existing `useCardViewMode` toggle are
  unchanged.

---

## Assumes

- WP-121 complete:
  `apps/registry-viewer/src/composables/useCardSize.ts` exists and is
  the reference shape for the new `useThemeSize.ts` composable
  (module-scoped ref, narrowing, self-heal write-back, swallowed
  `setItem` failure);
  `apps/registry-viewer/src/components/CardSizeSlider.vue` exists and
  is the reference shape for the new `ThemeSizeSlider.vue` component;
  D-12101 records the locked range / default / storage-key /
  CSS-variable conventions this packet mirrors with theme-prefixed
  names.
- WP-091 complete:
  `apps/registry-viewer/src/components/ThemeGrid.vue` exists and
  renders themes in a CSS Grid via
  `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))`.
- `apps/registry-viewer/src/App.vue` has a themes-view filter bar at
  `:509–513` containing the search input and the count span; the
  themes-view body region at `:592–596` is unchanged by this packet.
- `pnpm --filter registry-viewer build` exits 0 on `main`
  pre-session.
- `pnpm --filter registry-viewer typecheck` exits 0 on `main`
  pre-session.
- `pnpm --filter registry-viewer test` reports the post-EC-125
  baseline `31 / 6 / 31 / 0` (locked at `main` HEAD `919703f`,
  2026-05-01).
- No Vue component-test harness exists at baseline for the
  registry-viewer; pattern per WP-066 / WP-094 / WP-096 / WP-114 /
  WP-121 is build + typecheck + manual smoke only. Subsequent
  sections inherit this; the "no tests" rationale is not restated
  per-section.

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  registry-viewer's allowed import surface and the prohibition on
  reaching into `game-engine`, `preplan`, `server`, or `pg`.
- `.claude/rules/architecture.md §Import Rules` — runtime enforcement
  view of the same rules; `apps/registry-viewer` row enumerates
  allowed and forbidden imports for both new files.
- `.claude/rules/code-style.md §Abstraction & Control Flow` — the
  *duplicate first, abstract only when a third copy appears* rule
  locking duplication of `useCardSize` → `useThemeSize` rather than
  parameterization.
- `apps/registry-viewer/CLAUDE.md` — viewer architecture (Vue 3 +
  Vite 5 + Zod), single-page tab switching, R2 data source.
- `apps/registry-viewer/src/composables/useCardSize.ts` — the
  reference composable. Read in full before drafting `useThemeSize.ts`;
  the new composable mirrors this file's structure (storage key
  constant, raw-read narrowing, self-heal persist, swallowed setItem,
  module-header JSDoc, public-API shape) line-for-line with
  theme-prefixed names.
- `apps/registry-viewer/src/components/CardSizeSlider.vue` — the
  reference component. Read in full before drafting
  `ThemeSizeSlider.vue`; the new component mirrors this file's
  structure (script-setup imports, event handler, template, scoped
  CSS) line-for-line with theme-prefixed names.
- `apps/registry-viewer/src/components/ThemeGrid.vue` — the file to
  be modified. Read template and `<style scoped>` block fully; only
  the `.grid` rule and the `.grid` element's bound style attribute
  change.
- `apps/registry-viewer/src/App.vue` — the file to be modified. Read
  the `.filter-bar` template region in the themes-view branch
  (`<template v-if="activeView === 'themes'">` at lines 509–513); the
  slider mounts inside that bar, after the search input and before
  the count span. The cards-view filter bar (line 519+) and the
  body region (line 593+) are not modified.
- `apps/registry-viewer/src/composables/useCardViewMode.ts` —
  ancestor pattern at one remove. Not directly mirrored (the new
  composable mirrors `useCardSize.ts`, which mirrors this file in
  turn), but read for terminology parity if any disambiguation is
  needed.
- `docs/ai/REFERENCE/00.6-code-style.md` — human-style code rules:
  Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11
  (full-sentence error messages).
- `docs/ai/DECISIONS.md` D-12101 — the locked WP-121 decision this
  packet mirrors. Scan also for any prior decision on a viewer
  themes-zoom control. There should be none; D-12401 is the new
  entry.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — all new files use `import` / `export`, never
  `require()`.
- `node:` prefix on Node.js built-in imports — not applicable in
  scope (browser code only); if any `node:` import appears, it is a
  scope violation.
- Test files use `.test.ts` extension — never `.test.mjs` (not
  applicable in scope; no tests added).
- Full file contents required for every new or modified file. Diffs,
  snippets, and partial output are forbidden.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (full
  English names, JSDoc on every function, no `.reduce()` for
  branching logic, comments explain WHY).
- No `Math.random()`, no `Date.now()`, no `performance.now()`, no
  `new Date(` — not applicable in scope (pure UI; static range
  constants).
- No new npm dependencies. `package.json` files are unchanged.

**Packet-specific:**
- **Production / UI files limited to four.** Two new
  (`useThemeSize.ts`, `ThemeSizeSlider.vue`) and two modified
  (`ThemeGrid.vue`, `App.vue`). No other files touched besides
  governance (STATUS, DECISIONS, WORK_INDEX, EC_INDEX, the WP and EC
  themselves).
- **Composable contract is locked at draft.**
  `useThemeSize` exports exactly
  `{ themeSize: Ref<number>; setThemeSize: (next: number) => void; }`.
  No `resetThemeSize`, no `clamp`, no `min` / `max` exports — adding
  unused API surface is forbidden by `.claude/rules/architecture.md`
  §"Prohibited AI Failure Patterns".
- **Composable structure mirrors `useCardSize.ts` line-for-line.**
  Same module-scoped ref pattern, same narrowing block, same
  `clampToRange` helper, same `readStoredRawSafely` helper, same
  `persistSafely` helper with the same full-sentence swallow comment.
  Only the four range constants, the `STORAGE_KEY` value, the
  exported names, and the JSDoc clause-numbers (referencing WP-124 /
  EC-126 / D-12401 instead of WP-121 / EC-122 / D-12101) differ.
- **Component structure mirrors `CardSizeSlider.vue` line-for-line.**
  Same `<script setup lang="ts">` shape, same `handleSliderInput`
  helper, same template structure (label + slider-label span + input
  + slider-readout span), same scoped CSS shape (dark-theme tokens
  identical to `CardSizeSlider.vue`'s for visual consistency
  across the two filter bars). Only the imports, destructured names,
  bound constants, label text, and `aria-label` text differ.
- **localStorage key is verbatim `themeGridSize`.** Do not rename, do
  not abbreviate, do not prefix. The key parallels `cardGridSize`
  exactly; the two views maintain independent zoom state.
- **Range and default are locked** per Canonical decision (D-12401):
  min `80`, max `260`, step `10`, default `150`. The min / max mirror
  WP-121 for legibility and viewport-fit consistency; the default
  differs intentionally because `ThemeGrid.vue` historically shipped
  with a wider 150px baseline. The default `150` matches the existing
  production `minmax(150px, 1fr)` rule on `ThemeGrid.vue` exactly so
  a zero-config first run is visually identical to the pre-packet
  baseline. The cards / themes default asymmetry is intentional —
  do not "fix" it.
- **CSS variable name is verbatim `--theme-grid-min-width`.** Full
  English; no abbreviations per 00.6 Rule 4. Parallels
  `--card-grid-min-width` exactly.
- **`ThemeGrid.vue` column-track rule preserves the literal `150px`
  fallback.** The new rule reads
  `grid-template-columns: repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr));`.
  The fallback guarantees that if the inline style is dropped (e.g.,
  by a future server-render or test-harness shim), the grid still
  renders at the production min-width.
- **Slider mounts inside the themes-view filter bar.** It is not
  added to `header-actions`, not added to the cards-view filter
  bar, not added to the loadout view. The themes-view scope is
  deliberate — the cards grid uses a different column-track rule
  (driven by `useCardSize`) and is out of scope for this packet.
- **No prop plumbing.** `ThemeGrid.vue` reads `themeSize` from
  `useThemeSize()` directly; `ThemeSizeSlider.vue` reads and writes
  the same composable. `App.vue` does not pass `themeSize` as a
  prop to either.
- **`applyThemeFilters()` is not called.** Slider movement only
  changes a CSS variable; it does not re-query the theme list, does
  not clear `selectedTheme`, does not reset the theme search input.
- **No tests added.** The viewer has no Vue component-test harness
  at baseline; verification is build + typecheck + manual smoke.
  Test baseline preserved at `31 / 6 / 31 / 0`.
- **No layer leaks.** Allowed imports in either new file: Vue, the
  local composable. Disallowed: `@legendary-arena/game-engine`,
  `@legendary-arena/preplan`, `@legendary-arena/server`, `pg`,
  `boardgame.io`, any `node:` built-in, the Node-bearing
  `@legendary-arena/registry` barrel.
- **No `useCardSize` modifications.** The Card Zoom slider's
  composable is preserved byte-identical pre- and post-execution.
  The two composables are siblings, not extension points; future
  abstraction (if a third zoom slider arrives) is a separate
  decision per the *duplicate first* rule.
- **No `CardGrid.vue` / `CardSizeSlider.vue` modifications.** Both
  are preserved byte-identical pre- and post-execution.

**Required `// why:` comments:**
- `useThemeSize.ts` on the `STORAGE_KEY` constant — explain why the
  key is flat, camelCase, non-abbreviated, and unprefixed (matches
  the `cardGridSize` / `cardViewMode` / `cardDetailWidth`
  convention; single-origin SPA, no collision risk).
- `useThemeSize.ts` on the four range constants — explain that
  `MIN_THEME_WIDTH_PX = 80` keeps `.tile-name` and
  `.tile-mastermind` legible at the smallest tile (same
  legibility-floor analysis as WP-121 / D-12101 because the theme
  tile structure mirrors the card tile structure: same
  `aspect-ratio: 3/4` `img-wrap`, same ellipsis pattern on
  `.tile-name`, same per-tile metadata footer); that
  `MAX_THEME_WIDTH_PX = 260` fits a 1024px viewport without grid
  reflow; that `DEFAULT_THEME_WIDTH_PX = 150` matches the existing
  `ThemeGrid.vue` `minmax(150px, 1fr)` rule exactly so a
  zero-config first run is visually identical to the pre-packet
  baseline; and that `THEME_WIDTH_STEP_PX = 10` matches WP-121's
  step granularity for keyboard-arrow consistency across the two
  sliders.
- `useThemeSize.ts` on the narrowing block — explain that
  `localStorage.getItem` returns `string | null`, that an
  out-of-range or `NaN` value would poison downstream
  `--theme-grid-min-width` CSS-variable bindings, and that anything
  that does not cleanly clamp into
  `[MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX]` defaults to
  `DEFAULT_THEME_WIDTH_PX`.
- `useThemeSize.ts` on the self-heal `persistSafely(initialSize)`
  call — explain that writing the narrowed value back on first load
  guarantees the invariant holds across tabs and reloads.
- `useThemeSize.ts` on the `persistSafely` `catch {}` —
  full-sentence swallow documentation per 00.6 Rule 11, identical
  in shape to `useCardSize.ts:131–141` (iOS Safari private mode,
  quota, group-policy restrictions; in-memory ref already updated;
  only cross-reload persistence lost).
- `ThemeGrid.vue` on the `useThemeSize` import line — explain that
  the composable is the single source of truth and that the grid
  reads it directly to avoid prop plumbing through `App.vue`
  (parallels the `useCardSize` precedent at `CardGrid.vue`).
- `ThemeGrid.vue` on the `:style` binding for
  `--theme-grid-min-width` — explain that scaling is CSS-driven (no
  per-tile recalculation), that the existing `aspect-ratio: 3/4`
  rule on `.img-wrap` propagates width changes to height
  proportionally, and that the literal `150px` fallback in the
  `minmax(...)` call preserves pre-packet behavior if the inline
  style is ever dropped.
- `ThemeSizeSlider.vue` module-header JSDoc — explain that the
  slider drives a native `<input type="range">`
  (keyboard-accessible by default, no pointer-event handlers
  needed), that the displayed value is the column min-width in
  pixels (not a tile count or a percentage), that the locked range
  (`80`–`260`) was chosen so that `.tile-name` and `.tile-meta`
  remain legible at the minimum and the largest tile fits without
  grid reflow on a 1024px viewport, and that the slider is a
  duplicate of `CardSizeSlider.vue` per the *duplicate first*
  rule (D-12401 cites the rule and the two-copy threshold).

**Session protocol:**
- If any of the following arises, STOP and ASK before proceeding:
  - The pre-session test baseline does not match the locked
    post-EC-125 baseline `31 / 6 / 31 / 0`.
  - The themes-view filter bar at `App.vue:509–513` does not match
    the documented shape (e.g., a parallel session inserted a
    different control there).
  - `ThemeGrid.vue:60` does not read
    `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));`
    (e.g., a parallel session widened it).
  - `useCardSize.ts` or `CardSizeSlider.vue` shows up in
    `git diff --name-only` — they are byte-identical
    pre- and post-execution.
  - The locked range seems too narrow for an obvious legibility
    failure on theme tiles at the minimum (the legibility floor
    analysis from WP-121 was for cards; theme tiles share the
    structure but if a font-size change in `ThemeGrid.vue:83–87`
    has shifted the floor, escalate rather than relaxing the range
    silently).
  - A third storage key seems necessary to separate any other
    themes-view affordance.
  - Any file outside §Files Expected to Change seems to need
    editing.
  Do not "helpfully" extend scope.

**Locked contract values (inline — do not paraphrase or re-derive):**
- **localStorage key (verbatim):** `'themeGridSize'`.
- **CSS variable (verbatim):** `--theme-grid-min-width`.
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
- **CSS column-track rule on `.grid` in `ThemeGrid.vue` (verbatim):**
  `grid-template-columns: repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr));`
- **Slider label text (verbatim):** `Theme Size`.
- **Slider `aria-label` (verbatim):** `Theme grid size in pixels`.
- **Pre-session test baseline (verbatim):**
  `tests 31 / suites 6 / pass 31 / fail 0` (locked post-EC-125 at
  `main` HEAD `919703f`, 2026-05-01).
- **Post-session test baseline (verbatim):**
  `tests 31 / suites 6 / pass 31 / fail 0` (UNCHANGED — no tests
  added; the viewer has no component-test harness).

---

## Vision Alignment

**Vision clauses touched:** §10a (Registry Viewer public surface —
search and browse quality on `cards.barefootbetters.com`).

**Conflict assertion:** No conflict. This WP improves browse-quality
on the public reference surface for the themes view; it adds no
monetization, no persuasive surface, no competitive ranking
implication, no change to user-visible copy beyond the slider label
`Theme Size` itself.

**Non-Goal proximity check:** None of NG-1..NG-7 is crossed. The
slider is a client-local UI affordance with no game-state coupling.

**Determinism preservation:** N/A — no scoring, replay, RNG, or
simulation surfaces are touched. The slider value is a UI-only
client-local preference read from `localStorage`.

---

## Funding Surface Gate

**§20 — N/A.** This WP touches no §20.1 trigger surface: no global
nav funding affordance, no registry-viewer funding affordance, no
profile-level funding attribution, no tournament-funding integration,
and no user-visible copy referencing donate / support / tournament
funding. The slider label `Theme Size` and the pixel readout are the
only new user-visible strings; neither references funding channels.
Justification per §20.1 N/A discipline: "registry-viewer themes-view
zoom slider; no funding-adjacent UI, no payment surface, no donation
prompt, no storefront cross-link."

---

## §21 API Catalog — N/A

This WP touches no §21.1 trigger surface: no HTTP endpoint added,
modified, removed, or status-changed in `apps/server`; no
`apps/server/src/**` library function added or modified.
Justification per §21.4: "viewer-only UI affordance; no
`apps/server` files touched, no HTTP surface affected."

---

## Debuggability & Diagnostics

This packet is UI-only and introduces no game state, no RNG, and no
mutation of `G` / `ctx`. The applicable subset of the template's
diagnostics clauses:

- **Deterministic reproduction:** the theme grid's column min-width
  is fully determined by `localStorage['themeGridSize']` (or the
  default if absent / malformed). Identical storage value +
  identical theme list = identical render.
- **External observability:** the slider's value is visible in the
  DOM as an inline `style="--theme-grid-min-width: Npx"` on the
  themes `.grid` element and as the `value` attribute of the slider
  input. No hidden side effects.
- **State mutation surface:** the only state read is the
  module-scoped `themeSize` ref inside `useThemeSize`. The only
  state written is the same ref via `setThemeSize`. No new state
  introduced beyond the localStorage entry.
- **Failure localization:** any visible regression in theme grid
  sizing must trace to one of the four files in §Files Expected to
  Change; if it does not, the packet's scope was violated.
- **`G.messages` usage:** N/A — this packet does not touch `G`.

---

## Scope (In)

### A) `apps/registry-viewer/src/composables/useThemeSize.ts` — new

- ESM-only, Vue 3 composition API.
- Module-header JSDoc explaining: shared state for the theme-grid
  zoom slider; module-scoped ref so all consumers see the same
  value; persisted to `localStorage['themeGridSize']`; range and
  default locked in WP-124 / EC-126 / D-12401; mirrors
  `useCardSize.ts` shape line-for-line per the *duplicate first*
  rule (`.claude/rules/code-style.md` §"Abstraction & Control
  Flow").
- Exports the four range constants
  (`MIN_THEME_WIDTH_PX`, `MAX_THEME_WIDTH_PX`,
  `DEFAULT_THEME_WIDTH_PX`, `THEME_WIDTH_STEP_PX`) for consumption
  by `ThemeSizeSlider.vue`. Exports `useThemeSize()` returning
  `{ themeSize, setThemeSize }`.
- Narrowing: `Number.parseInt(raw, 10)` then a clamp into
  `[MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX]`; `NaN` and
  out-of-range values fall back to `DEFAULT_THEME_WIDTH_PX`.
- Self-heal: write the narrowed value back via `persistSafely` on
  first load.
- `setThemeSize(next)` clamps `next` to the valid range, updates
  the in-memory ref before persisting, and calls `persistSafely`.
- `persistSafely` swallows `setItem` failures with the same
  full-sentence comment shape as `useCardSize.ts:131–141`.
- All helper-function names mirror `useCardSize.ts` verbatim:
  `clampToRange`, `readStoredRawSafely`, `persistSafely`. They are
  module-scoped, not exported.

### B) `apps/registry-viewer/src/components/ThemeSizeSlider.vue` — new

- Vue 3 SFC, `<script setup lang="ts">`, scoped CSS.
- Module-header JSDoc per §Required `// why:` comments.
- Imports `useThemeSize` and the three slider-relevant range
  constants (`MIN_THEME_WIDTH_PX`, `MAX_THEME_WIDTH_PX`,
  `THEME_WIDTH_STEP_PX`) from the new composable.
  `DEFAULT_THEME_WIDTH_PX` is not imported here — the composable
  seeds the ref with the default; the slider only needs min / max /
  step / current value.
- Renders a `<label class="theme-size-slider">` wrapping a
  `<span class="slider-label">Theme Size</span>`, an
  `<input type="range">` bound to `themeSize` with `min`, `max`,
  `step` set from the imported constants, and a
  `<span class="slider-readout">{{ themeSize }}px</span>` value
  readout.
- `aria-label="Theme grid size in pixels"` on the `<input>` for
  screen-reader accessibility (mirrors
  `CardSizeSlider.vue:56`'s pattern).
- `@input` handler `handleSliderInput` calls
  `setThemeSize(Number.parseInt(target.value, 10))`.
- Scoped CSS uses the same dark-theme literal color tokens as
  `CardSizeSlider.vue` (`#22222e` / `#33334a` / `#c8c8e0` family,
  `#8888aa` / `#6666aa` for label / readout) so the two filter bars
  read identically.
- No emits, no props.

### C) `apps/registry-viewer/src/components/ThemeGrid.vue` — modified

- Add `<script setup lang="ts">` import:
  `import { useThemeSize } from "../composables/useThemeSize";`
  (the file currently has only `import type { ThemeDefinition }` and
  `import { TAG_COLOR }`; insert the new import alongside, with a
  `// why:` comment matching §Required `// why:` Comments).
- Destructure `themeSize` only inside `<script setup>` (slider
  lives in `ThemeSizeSlider.vue`; this file is read-only on the
  composable):
  `const { themeSize } = useThemeSize();`
- Bind `:style="{ '--theme-grid-min-width': themeSize + 'px' }"` on
  the `.grid` element with a `// why:` comment per §Required
  `// why:` Comments. The current `<div class="grid">` at
  `ThemeGrid.vue:23` becomes
  `<div class="grid" :style="{ '--theme-grid-min-width': themeSize + 'px' }">`.
- Change the scoped CSS rule on `.grid` from
  `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));`
  (line 60) to
  `grid-template-columns: repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr));`.
  No other CSS rule on `ThemeGrid.vue` changes; the
  `.grid-wrapper`, `.empty`, `.theme-tile`, `.img-wrap`,
  `.tile-info`, `.tile-name`, `.tile-mastermind`, `.tile-meta`,
  `.tile-players`, `.tile-heroes`, `.type-badge` rules are
  preserved byte-identical.
- The template's `<button>` per-theme block, the `primaryTag` and
  `tagColor` helpers, the `defineProps` / `defineEmits` shape are
  preserved byte-identical.

### D) `apps/registry-viewer/src/App.vue` — modified

- Add `import ThemeSizeSlider from "./components/ThemeSizeSlider.vue";`
  in the existing `<script setup>` import block (alphabetical
  position next to `ThemeGrid` is fine; ordering is not
  load-bearing).
- Mount `<ThemeSizeSlider />` inside the themes-view filter-bar
  (`<template v-if="activeView === 'themes'">` →
  `<div class="filter-bar">` at lines 509–513), positioned after
  the search `<input>` and before the `<span class="count">`. The
  resulting filter bar reads:
  ```
  <input v-model="themeSearchText" class="search" placeholder="…" @input="applyThemeFilters" />
  <ThemeSizeSlider />
  <span class="count">{{ filteredThemes.length }} themes</span>
  ```
- No other `App.vue` template region changes. The cards-view filter
  bar (line 519+), the body region (line 593+), the loadout region,
  the header, and all `<style>` blocks are byte-identical.
- No state changes, no method changes, no new refs, no new computed
  properties.

---

## Out of Scope

- **Cards-view grid columns.** `CardGrid.vue` is driven by
  `useCardSize` (WP-121); not touched here.
- **`useCardSize` parameterization or abstraction.** The
  *duplicate first, abstract only when a third copy appears* rule
  locks duplication for this packet. If a third zoom slider arrives
  later, that WP owns the abstraction decision; not WP-124.
- **Loadout-view grid columns.** `LoadoutBuilder.vue` /
  `LoadoutPreview.vue` are not modified.
- **Cross-view slider sync.** Moving the Card Size slider does NOT
  affect the Theme Size slider, and vice versa. The two views
  maintain independent zoom state under separate localStorage keys.
- **Mobile gestures.** No pinch-zoom, no two-finger-spread handling.
  The native range input is keyboard- and touch-accessible by
  default.
- **Slider in `header-actions`.** The slider is scoped to the themes
  view only; placing it next to the view tabs would imply global
  scope.
- **Resetting selection on slider movement.** `selectedTheme` is
  preserved; the user's chosen theme remains highlighted at any
  size.
- **Adjusting `gap`, `padding`, or border-radius.** Tile chrome is
  unchanged; only the column min-width is parameterized.
- **Schema or registry data changes.** No `package.json`, no
  `registry-config.json`, no R2 fetcher, no Zod schema touched.
- **Tests.** No component-test harness exists at baseline;
  verification is build + typecheck + manual smoke.

---

## Files Expected to Change

- `apps/registry-viewer/src/composables/useThemeSize.ts` — **new** —
  module-scoped composable mirroring `useCardSize.ts` shape;
  exposes `{ themeSize, setThemeSize }` plus the four range
  constants.
- `apps/registry-viewer/src/components/ThemeSizeSlider.vue` —
  **new** — native range input bound to `useThemeSize`; mounted in
  the themes-view filter bar.
- `apps/registry-viewer/src/components/ThemeGrid.vue` —
  **modified** — binds `--theme-grid-min-width` on `.grid`; updates
  the column-track rule to read the variable with a `150px`
  literal fallback; one new import and one new destructure in
  `<script setup>`.
- `apps/registry-viewer/src/App.vue` — **modified** — imports and
  mounts `ThemeSizeSlider` inside the themes-view filter bar.
- `docs/ai/work-packets/WP-124-registry-viewer-theme-zoom-slider.md` —
  **new** — this file.
- `docs/ai/execution-checklists/EC-126-registry-viewer-theme-zoom-slider.checklist.md` —
  **new** — companion EC (drafted in a follow-up authoring step;
  EC slot to be picked at draft time per the EC numbering
  precedent — EC-126 is the next free slot after EC-125 closed
  WP-123 on 2026-05-01).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — adds the
  WP-124 row at Commit B.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — adds
  the EC-126 row at Commit B.
- `docs/ai/DECISIONS.md` — **modified** — adds D-12401 (locked
  range, default, storage key, CSS variable name, `themeSize`
  composable name; cites the *duplicate first* rule and explicitly
  defers any future abstraction to a third-zoom-slider WP).
- `docs/ai/STATUS.md` — **modified** — adds the WP-124 execution
  entry at the top of `## Current State`.

---

## Acceptance Criteria

- [ ] A visible slider labelled `Theme Size` exists in the
  themes-view filter bar between the theme search input and the
  themes count span.
- [ ] Moving the slider visibly increases or decreases theme tile
  size in real time.
- [ ] Theme tile layout remains stable at all slider positions —
  no overlap, no clipping outside intentional `.tile-name` /
  `.tile-mastermind` ellipsis, no jitter.
- [ ] The slider value persists across reloads via
  `localStorage['themeGridSize']`.
- [ ] First-run with no stored value renders at the production
  baseline (column min-width `150px`).
- [ ] The themes search filter (`themeSearchText`) and selected
  theme (`selectedTheme`) are not reset by slider movement.
- [ ] Toggling between the Cards / Themes / Loadout views does not
  reset the Theme Size slider value, and the Theme Size slider
  does not affect the Cards view grid (independent state under
  separate localStorage keys verified).
- [ ] No console errors or warnings introduced; no re-fetching of
  theme data triggered by slider movement.
- [ ] The slider is keyboard-accessible (Tab to focus, Left / Right
  arrows to adjust by `THEME_WIDTH_STEP_PX = 10`).
- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter registry-viewer typecheck` exits 0.
- [ ] `pnpm --filter registry-viewer test` reports exactly
  `tests 31 / suites 6 / pass 31 / fail 0` (UNCHANGED from the
  pre-session baseline).

---

## Verification Steps

```pwsh
# 1. Build cleanly
pnpm --filter registry-viewer build
# Expected: exits 0, dist/ regenerated, no Vite warnings beyond baseline.

# 2. Type-check
pnpm --filter registry-viewer typecheck
# Expected: exits 0.

# 3. Test baseline preserved
pnpm --filter registry-viewer test
# Expected: tests 31 / suites 6 / pass 31 / fail 0 (UNCHANGED).

# 4. Off-scope diff verification
git diff apps/registry-viewer/src/composables/useCardSize.ts
# Expected: no output.
git diff apps/registry-viewer/src/components/CardSizeSlider.vue
# Expected: no output.
git diff apps/registry-viewer/src/components/CardGrid.vue
# Expected: no output.
git diff apps/registry-viewer/package.json
# Expected: no output.
git diff packages/registry/
# Expected: no output (entire directory unchanged).

# 5. New-composable verification
Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "STORAGE_KEY = ""themeGridSize"""
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "MIN_THEME_WIDTH_PX = 80"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "MAX_THEME_WIDTH_PX = 260"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "DEFAULT_THEME_WIDTH_PX = 150"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "THEME_WIDTH_STEP_PX = 10"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\composables\useThemeSize.ts" -Pattern "export function useThemeSize"
# Expected: exactly one match.

# 6. Grid-rule verification
Select-String -Path "apps\registry-viewer\src\components\ThemeGrid.vue" -Pattern "minmax\(var\(--theme-grid-min-width, 150px\), 1fr\)"
# Expected: exactly one match.
Select-String -Path "apps\registry-viewer\src\components\ThemeGrid.vue" -Pattern "minmax\(150px, 1fr\)"
# Expected: zero matches (the bare literal-150px rule was rewritten).
Select-String -Path "apps\registry-viewer\src\components\ThemeGrid.vue" -Pattern "useThemeSize"
# Expected: at least one match (import + destructure).

# 7. Slider mount verification
Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "<ThemeSizeSlider"
# Expected: exactly one match (the template instance).
Select-String -Path "apps\registry-viewer\src\App.vue" -Pattern "import ThemeSizeSlider"
# Expected: exactly one match (the import statement).

# 8. Manual smoke (not gated)
pnpm --filter registry-viewer dev
# Open http://localhost:5173, click the Themes tab. Verify:
#   1. The Theme Size slider is visible between the search input and the
#      themes count.
#   2. Moving the slider scales the theme tiles in real time; tile
#      layout remains stable; no jitter; no console errors.
#   3. Reload the page; the slider value persists.
#   4. Open DevTools → Application → Local Storage; confirm
#      'themeGridSize' = '<chosen value>'.
#   5. Switch to the Cards tab; the Card Size slider value is
#      independent (changing one does not change the other).
#   6. Tab to the slider; press Left / Right; confirm value changes by
#      10. Press Home / End; confirm bounds.
#   7. Search "marvel" in themes; move slider; confirm search results
#      are unchanged (same filtered count, same selected theme).
```

If any verification step fails, STOP and escalate. Do not patch
around a failing gate.

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] All Verification Steps pass.
- [ ] `git diff --name-only` shows only the ten files in §Files
  Expected to Change.
- [ ] D-12401 added to `docs/ai/DECISIONS.md` (locked range, default,
  storage key, CSS variable name, composable name; *duplicate first*
  citation; explicit deferral of any future abstraction to a third
  zoom-slider WP).
- [ ] `docs/ai/STATUS.md` updated with the WP-124 execution entry.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-124 row checked off
  with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-126 row set to
  `Done <date>`.
- [ ] No new npm dependencies added; `package.json` unchanged across
  all workspaces.
- [ ] Commit prefix `EC-126:` per
  `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md` (never
  `WP-124:`).
- [ ] Manual smoke at the slider extremes (`80` and `260`)
  performed; legibility of `.tile-name` / `.tile-mastermind` at
  the minimum and grid reflow at the maximum both observed and
  acceptable.

---

## Lint-Gate Self-Review (per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`)

| §  | Topic                          | Disposition |
|----|--------------------------------|-------------|
| 1  | WP structure                   | PASS — all required sections present (Status, Dependencies, Session Context, Goal, Assumes, Context, Non-Negotiable Constraints, Vision Alignment, Funding Surface Gate, §21 API Catalog, Debuggability, Scope, Out of Scope, Files Expected to Change, Acceptance Criteria, Verification Steps, Definition of Done, Lint-Gate Self-Review). |
| 2  | Non-Negotiable Constraints     | PASS — engine-wide block intact (ESM only, full file contents required, partial output forbidden, references `00.6-code-style.md`, no new npm dependencies); packet-specific block names sole files modified, locked contract values inline, session-protocol stop-and-ask clauses, required `// why:` comments. |
| 3  | `## Assumes`                   | PASS — lists WP-121 / WP-066 / WP-091 deps + file-line assumptions + pre-session build / typecheck / test baselines. |
| 4  | `## Context (Read First)`      | PASS — specific files cited with line ranges where relevant; ARCHITECTURE.md §Layer Boundary cited; `00.6-code-style.md` cited; `.claude/rules/code-style.md` §"Abstraction & Control Flow" cited (the *duplicate first* rule that drives the duplication-vs-abstraction choice); DECISIONS.md scan instruction included. |
| 5  | `## Files Expected to Change`  | PASS — ten files listed (four production, two governance new, four ledger), each with `— new` / `— modified` and a one-line description. Bounded (≤ 10 within reasonable ceiling, mirrors WP-121 / WP-123 file-count). |
| 6  | Naming consistency             | PASS — `themeSize` / `setThemeSize` / `MIN_THEME_WIDTH_PX` / etc. mirror WP-121's `cardSize` / `setCardSize` / `MIN_CARD_WIDTH_PX` shape with consistent theme-prefixed substitution; storage key `themeGridSize` parallels `cardGridSize`; CSS variable `--theme-grid-min-width` parallels `--card-grid-min-width`. No abbreviations (`themeSize`, `themeRecord` n/a — no record narrowing in this packet). |
| 7  | Dependency discipline          | PASS — no new npm dependency. Forbidden packages not introduced. |
| 8  | Architectural boundaries       | PASS — viewer-only UI affordance; layer boundary preserved (no `game-engine`, `preplan`, `server`, `pg`, or `boardgame.io` imports added). |
| 9  | Windows compatibility          | PASS — Verification Steps use `pwsh`-style `Select-String`; paths use `\` separators in shell snippets; bash subset used only where pwsh + bash share syntax (`pnpm --filter`, `git diff`). |
| 10 | Environment variable hygiene   | N/A — no env vars added or referenced. Justification: viewer correctness fix; no new env required. |
| 11 | Authentication clarity         | N/A — no auth surface touched. Justification: viewer UI affordance; no JWT, no session, no protected endpoint. |
| 12 | Test quality                   | N/A — no tests added. Justification: viewer has no Vue component-test harness at baseline (locked under WP-066 / WP-094 / WP-096 / WP-114 / WP-121 viewer-side precedent — manual smoke is the verification mechanism for component-level behavior). Test baseline preserved at `31 / 6 / 31 / 0`. |
| 13 | Commands and verification      | PASS — every Verification Step is exact `pnpm` invocation, `git diff` against named paths, or `Select-String` with expected output. |
| 14 | Acceptance criteria quality    | PASS — 12 binary, observable, specific items (within the 6–12 cap). |
| 15 | Definition of Done             | PASS — includes STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md, and scope-boundary check (`git diff --name-only` shows only the ten files). |
| 16 | Code style                     | PASS — full English names (`themeSize`, `setThemeSize`, `clampToRange`, `readStoredRawSafely`, `persistSafely`); JSDoc required on every function in the new composable + module-header JSDoc on the new component; `// why:` comments enumerated for every non-obvious decision; no `.reduce()`, no `import *`, no terse error messages (no errors thrown in scope). |
| 17 | Vision Alignment               | PASS — §10a (Registry Viewer) cited; no NG-1..NG-7 crossed; determinism N/A with explicit justification. |
| 18 | Prose-vs-grep discipline       | PASS — Verification Steps grep targets are intended new code (`STORAGE_KEY = "themeGridSize"`, `MIN_THEME_WIDTH_PX = 80`, `minmax(var(--theme-grid-min-width, 150px), 1fr)`, `<ThemeSizeSlider`, `import ThemeSizeSlider`) and removed legacy patterns (`minmax(150px, 1fr)`). No grep targets a forbidden token (`Math.random`, etc.). |
| 19 | Bridge-vs-HEAD staleness       | N/A — this WP is not a repo-state-summarizing artifact (no commit-history snapshot, no "Recent commits" enumeration, no STATUS-block draft). Reconciliation discipline applies at execution-commit time per the standard process, not at draft time. |
| 20 | Funding Surface Gate           | N/A — explicit one-line justification provided in §Funding Surface Gate above ("registry-viewer themes-view zoom slider; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link"). |
| 21 | API Catalog Update             | N/A — explicit justification provided in §§21 API Catalog above ("viewer-only UI affordance; no `apps/server` files touched, no HTTP surface affected"). |

**Final gate:** PASS. Ready for user review and execution scheduling.
