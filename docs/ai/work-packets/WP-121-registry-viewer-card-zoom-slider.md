# WP-121 — Registry Viewer: Card Zoom Slider

**Status:** Draft (authored 2026-05-01; awaiting user review and lint-gate sign-off)
**Primary Layer:** Client UI (`apps/registry-viewer/`)
**Dependencies:**
- **Hard:** WP-066 (image-to-data view toggle — established the
  module-scoped + localStorage-persisted + self-healing composable
  pattern this packet mirrors line-for-line).
- **Hard:** WP-003 (CardRegistry + `FlatCard` — the data shape rendered
  in the grid; not modified, but the grid's `v-for` keying assumes it).
- **Soft:** WP-096 (sibling registry-viewer single-component grid
  behavior — pattern reference only; CSS column-track rule edited here
  is the same line WP-096 deliberately did not touch).
- **Compatible with (not dependent on):** WP-114 (URL-parameterized
  setup preview — touches different `App.vue` regions; merge order does
  not matter).

**Sequencing note (WP-120):** WP-120 (Loadout Preview Round-Trip Fix)
ships on the feature branch `wp-120-loadout-preview-roundtrip-fix`
(Commit A `05d5ded`, 2026-04-30) and has not merged to `main` as of
WP-121 drafting. WP-120 hoists `useLoadoutDraft(registry)` into
`App.vue` and adds an `onPreviewRequestEdit` handler. WP-121 touches
`App.vue` only to mount `<CardSizeSlider />` inside the cards-view
filter bar — a region WP-120 does not modify. Merge order is not
load-bearing, but the executor should verify at session start that the
cards-view filter bar still exists in the documented shape. If
WP-120 has merged first, the filter bar template region is unchanged;
WP-121 proceeds normally.

---

## Session Context

The registry viewer at `cards.barefootbetters.com` renders the card grid
at a single fixed column min-width of `130px` (see
`apps/registry-viewer/src/components/CardGrid.vue:107` —
`grid-template-columns: repeat(auto-fill, minmax(130px, 1fr))`). Users
on high-DPI monitors want denser scanning; users reviewing card art and
text want larger tiles. The viewer offers no user-controlled scaling
today, which forces unnecessary navigation into `CardDetail.vue` for
art inspection and limits the grid's usefulness as a reference tool.

WP-066 established the canonical pattern for client-local UI preferences
on this app: a module-scoped composable seeded from `localStorage`
with explicit narrowing, self-heal write-back, and a swallowed
`setItem` failure. WP-096 extended that pattern to a second consumer
(the grid) without changing the composable's public API. This packet
adds a third client-local preference following the exact same shape.

The lever is a single CSS variable on `.grid` in `CardGrid.vue`. The
existing `aspect-ratio: 3/4` rule on `.img-wrap` already drives tile
height proportionally to width, so changing the column min-width
scales every tile uniformly without per-card calculation, without
touching `applyFilters()` or `query()`, and without re-fetching any
registry data. The slider is scoped to the cards view only — the
themes view, loadout view, set pills, and type-bar are not in scope.

---

## Goal

After this session:

- A keyboard-accessible **Card Size** slider exists in the cards-view
  filter bar of `apps/registry-viewer/`, immediately above the card
  grid.
- Moving the slider changes the grid's column min-width in real time;
  flipping the slider does not re-fetch registry data, does not reset
  filters or selection, and does not change card metadata loading.
- The user's chosen size is persisted to `localStorage` under the key
  `cardGridSize` and survives page reloads.
- Card layout remains stable across the full slider range — no
  overlap, no clipping outside intentional `text-overflow: ellipsis`
  on the `.tile-name` row, no jitter, no console errors.
- Default value (`130`) matches the current production column
  min-width, so a zero-config first-run renders identically to the
  pre-packet baseline.
- The themes view, loadout view, sidebar (`CardDetail.vue`),
  `ImageLightbox.vue`, and the existing `useCardViewMode` toggle are
  unchanged.

---

## Assumes

- WP-066 complete: `apps/registry-viewer/src/composables/useCardViewMode.ts`
  exists and is the reference shape for the new `useCardSize.ts`
  composable (module-scoped ref, narrowing, self-heal write-back,
  swallowed `setItem` failure).
- WP-096 complete: `apps/registry-viewer/src/components/CardGrid.vue`
  exists and renders cards in a CSS Grid via
  `grid-template-columns: repeat(auto-fill, minmax(130px, 1fr))`.
- `apps/registry-viewer/src/App.vue` has a cards-view filter bar with a
  `.filter-bar` wrapper containing the search input, set select, hero
  class select, and the count span.
- `pnpm --filter registry-viewer build` exits 0 on `main` pre-session.
- `pnpm --filter registry-viewer typecheck` exits 0 on `main`
  pre-session.

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  registry-viewer's allowed import surface and the prohibition on
  reaching into `game-engine`, `preplan`, `server`, or `pg`.
- `.claude/rules/architecture.md §Layer Boundary` — the runtime
  enforcement view of the same rules.
- `apps/registry-viewer/CLAUDE.md` — viewer architecture (Vue 3 + Vite
  5 + Zod), single-page tab switching, R2 data source.
- `apps/registry-viewer/src/composables/useCardViewMode.ts` —
  module-scoped composable pattern. The new composable mirrors this
  file's structure (storage key constant, raw-read narrowing,
  self-heal persist, swallowed setItem). Read it in full before
  drafting `useCardSize.ts`.
- `apps/registry-viewer/src/components/CardGrid.vue` — the file to be
  modified. Read template and `<style scoped>` block fully; only the
  `.grid` rule and the `.grid` element's bound style attribute change.
- `apps/registry-viewer/src/App.vue` — the file to be modified. Read
  the `.filter-bar` template region in the cards-view branch
  (`<template v-if="activeView === 'cards'">`); the slider mounts
  inside that bar, not inside `header-actions`.
- `apps/registry-viewer/src/composables/useResizable.ts` — adjacent
  pattern for slider-driven persisted sizes; not reused (the new
  composable uses no pointer-event dragging — native range input
  drives state directly), but read for terminology parity.
- `docs/ai/REFERENCE/00.6-code-style.md` — human-style code rules:
  Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11
  (full-sentence error messages).
- `docs/ai/DECISIONS.md` — scan for `cardSize`, `cardGridSize`, and
  any prior decision on a viewer zoom control. There should be none;
  D-12101 is the new entry.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — all new files use `import`/`export`, never
  `require()`.
- `node:` prefix on Node.js built-in imports (not applicable in scope —
  browser code only; if any `node:` import appears, it is a scope
  violation).
- Test files use `.test.ts` extension — never `.test.mjs` (not
  applicable in scope — no tests added).
- Full file contents required for every new or modified file. Diffs,
  snippets, and partial output are forbidden.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (full
  English names, JSDoc on every function, no `.reduce()` for branching
  logic, comments explain WHY).
- No `Math.random()` and no `Date.now()` in any new or modified file.
- No new npm dependencies. `package.json` files are unchanged.

**Packet-specific:**
- **Production/UI files limited to four.** Two new
  (`useCardSize.ts`, `CardSizeSlider.vue`) and two modified
  (`CardGrid.vue`, `App.vue`). No other files touched besides
  governance (STATUS, DECISIONS, WORK_INDEX, EC_INDEX, the WP and EC
  themselves).
- **Composable contract is locked at draft.**
  `useCardSize` exports exactly
  `{ cardSize: Ref<number>; setCardSize: (next: number) => void; }`.
  No `resetCardSize`, no `clamp`, no `min`/`max` exports — adding
  unused API surface is forbidden by `.claude/rules/architecture.md`
  §"Prohibited AI Failure Patterns".
- **localStorage key is verbatim `cardGridSize`.** Do not rename, do
  not abbreviate, do not prefix.
- **Range and default are locked.** Min `80`, max `260`, step `10`,
  default `130`. Default matches the existing production
  `minmax(130px, 1fr)` exactly so a zero-config first run is visually
  identical to the pre-packet baseline.
- **CSS variable name is verbatim `--card-grid-min-width`.** Full
  English; no abbreviations per 00.6 Rule 4.
- **`CardGrid.vue` column-track rule preserves the literal `130px`
  fallback.** The new rule reads
  `grid-template-columns: repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr));`.
  The fallback guarantees that if the inline style is dropped (e.g.,
  by a future server-render or test-harness shim), the grid still
  renders at the production min-width.
- **Slider mounts inside the cards-view filter bar.** It is not added
  to `header-actions`, not added to the themes-view filter bar, not
  added to the loadout view. The cards-view scope is deliberate —
  the themes grid uses a different column-track rule and is out of
  scope for this packet.
- **No prop plumbing.** `CardGrid.vue` reads `cardSize` from
  `useCardSize()` directly; `CardSizeSlider.vue` reads and writes the
  same composable. `App.vue` does not pass `cardSize` as a prop to
  either.
- **`applyFilters()` is not called.** Slider movement only changes a
  CSS variable; it does not re-query the registry, does not clear
  selection, does not reset search/set/HC filters.
- **No tests added.** The viewer has no Vue component-test harness at
  baseline; verification is build + typecheck + manual smoke.
- **No layer leaks.** Allowed imports in either new file: Vue, the
  local composable. Disallowed: `@legendary-arena/game-engine`,
  `@legendary-arena/preplan`, `@legendary-arena/server`, `pg`,
  `boardgame.io`, any `node:` built-in, the Node-bearing
  `@legendary-arena/registry` barrel.

**Required `// why:` comments:**
- `useCardSize.ts` on the `STORAGE_KEY` constant — explain why the
  key is flat, camelCase, non-abbreviated, and unprefixed (matches the
  `cardViewMode` / `cardDetailWidth` convention; single-origin SPA, no
  collision risk).
- `useCardSize.ts` on the narrowing block (`Number.parseInt` +
  range-clamp) — explain that `localStorage.getItem` returns
  `string | null`, that an out-of-range or `NaN` value would poison
  downstream CSS-variable bindings, and that anything that does not
  cleanly clamp into `[MIN_CARD_WIDTH_PX, MAX_CARD_WIDTH_PX]` defaults
  to `DEFAULT_CARD_WIDTH_PX`.
- `useCardSize.ts` on the self-heal `persistSafely(initialValue)` call
  — explain that writing the narrowed value back on first load
  guarantees the invariant holds across tabs and reloads.
- `useCardSize.ts` on the `persistSafely` `catch {}` — full-sentence
  swallow documentation per 00.6 Rule 11, identical in shape to
  `useCardViewMode.ts:88-96` (iOS Safari private mode, quota,
  group-policy restrictions; in-memory ref already updated; only
  cross-reload persistence lost).
- `CardGrid.vue` on the `useCardSize` import line — explain that the
  composable is the single source of truth and that the grid reads it
  directly to avoid prop plumbing through `App.vue`.
- `CardGrid.vue` on the `:style` binding for `--card-grid-min-width`
  — explain that scaling is CSS-driven (no per-card recalculation),
  that the existing `aspect-ratio: 3/4` rule on `.img-wrap` propagates
  width changes to height proportionally, and that the literal `130px`
  fallback in the `minmax(...)` call preserves pre-packet behavior if
  the inline style is ever dropped.
- `CardSizeSlider.vue` module-header JSDoc — explain that the slider
  drives a native `<input type="range">` (keyboard-accessible by
  default, no pointer-event handlers needed), that the displayed value
  is the column min-width in pixels (not a card count or a percentage),
  and that the locked range (`80`–`260`) was chosen so that
  `.tile-name` and `.tile-meta` remain legible at the minimum and the
  largest tile fits without grid reflow on a 1024px viewport.

**Session protocol:**
- If any of the following arises, STOP and ASK before proceeding:
  the slider seems to need to drive themes-view or loadout-view
  columns; the locked range seems too narrow for an obvious legibility
  failure at the minimum; a third storage key seems necessary to
  separate image-mode and data-mode sizes; any file outside §Files
  Expected to Change seems to need editing. Do not "helpfully" extend
  scope.

**Locked contract values (inline — do not paraphrase or re-derive):**

- **localStorage key (verbatim):** `'cardGridSize'`.
- **CSS variable (verbatim):** `--card-grid-min-width`.
- **Range constants (verbatim):**
  `MIN_CARD_WIDTH_PX = 80`,
  `MAX_CARD_WIDTH_PX = 260`,
  `DEFAULT_CARD_WIDTH_PX = 130`,
  `CARD_WIDTH_STEP_PX = 10`.
- **Composable public API (verbatim):**
  `{ cardSize: Ref<number>; setCardSize: (next: number) => void; }`.
- **Composable destructure in `CardSizeSlider.vue` (verbatim):**
  `const { cardSize, setCardSize } = useCardSize();`
- **Composable destructure in `CardGrid.vue` (verbatim):**
  `const { cardSize } = useCardSize();`
- **Composable import path (verbatim):**
  `from "../composables/useCardSize"`.
- **`CardSizeSlider` import path in `App.vue` (verbatim):**
  `from "./components/CardSizeSlider.vue"`.
- **CSS column-track rule on `.grid` (verbatim):**
  `grid-template-columns: repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr));`
- **Slider label text (verbatim):** `Card Size`.

---

## Vision Alignment

**Vision clauses touched:** §10a (Registry Viewer public surface —
search and browse quality on `cards.barefootbetters.com`).

**Conflict assertion:** No conflict. This WP improves browse-quality
on the public reference surface; it adds no monetization, no
persuasive surface, no competitive ranking implication.

**Non-Goal proximity check:** None of NG-1..NG-7 is crossed. The
slider is a client-local UI affordance with no game-state coupling.

**Determinism preservation:** N/A — no scoring, replay, RNG, or
simulation surfaces are touched. The slider value is a UI-only
client-local preference read from `localStorage`.

**§20 Funding Surface Gate:** N/A with explicit justification — the
registry viewer is free public reference tooling; this packet adds no
funding-adjacent UI, no payment surface, no donation prompt, no
storefront cross-link.

---

## Debuggability & Diagnostics

This packet is UI-only and introduces no game state, no RNG, and no
mutation of `G` / `ctx`. The applicable subset of the template's
diagnostics clauses:

- **Deterministic reproduction:** the grid's column min-width is
  fully determined by `localStorage['cardGridSize']` (or the default
  if absent / malformed). Identical storage value + identical card
  list = identical render.
- **External observability:** the slider's value is visible in the
  DOM as an inline `style="--card-grid-min-width: Npx"` on the
  `.grid` element and as the `value` attribute of the slider input.
  No hidden side effects.
- **State mutation surface:** the only state read is the
  module-scoped `cardSize` ref inside `useCardSize`. The only state
  written is the same ref via `setCardSize`. No new state introduced.
- **Failure localization:** any visible regression in grid sizing
  must trace to one of the four files in §Files Expected to Change;
  if it does not, the packet's scope was violated.
- **`G.messages` usage:** N/A — this packet does not touch `G`.

---

## Scope (In)

### A) `apps/registry-viewer/src/composables/useCardSize.ts` — new

- ESM-only, `<script>` Vue 3 composition API.
- Module-header JSDoc explaining: shared state for the card-grid
  zoom slider; module-scoped ref so all consumers see the same value;
  persisted to `localStorage['cardGridSize']`; range and default
  locked in WP-121 / EC-122; mirrors `useCardViewMode.ts` shape
  line-for-line with a `number` payload instead of a string-literal
  union.
- Exports the four range constants
  (`MIN_CARD_WIDTH_PX`, `MAX_CARD_WIDTH_PX`,
  `DEFAULT_CARD_WIDTH_PX`, `CARD_WIDTH_STEP_PX`) for consumption by
  `CardSizeSlider.vue`. Exports `useCardSize()` returning
  `{ cardSize, setCardSize }`.
- Narrowing: `Number.parseInt(raw, 10)` then a clamp into
  `[MIN_CARD_WIDTH_PX, MAX_CARD_WIDTH_PX]`; `NaN` and out-of-range
  values fall back to `DEFAULT_CARD_WIDTH_PX`.
- Self-heal: write the narrowed value back via `persistSafely` on
  first load.
- `setCardSize(next)` clamps `next` to the valid range, updates the
  in-memory ref before persisting, and calls `persistSafely`.
- `persistSafely` swallows `setItem` failures with the same
  full-sentence comment shape as `useCardViewMode.ts`.

### B) `apps/registry-viewer/src/components/CardSizeSlider.vue` — new

- Vue 3 SFC, `<script setup lang="ts">`, scoped CSS.
- Module-header JSDoc per §Required `// why:` comments.
- Imports `useCardSize` and the four range constants from the new
  composable.
- Renders a `<label>` wrapping a `<span class="slider-label">Card
  Size</span>` and an `<input type="range">` bound to `cardSize` with
  `min`, `max`, `step` set from the imported constants.
- `@input` handler calls `setCardSize(Number.parseInt(target.value, 10))`.
- Optional value readout (`{{ cardSize }}px`) rendered to the right
  of the slider for keyboard / accessibility feedback. Styled in the
  same dark-theme literal color tokens as adjacent filter-bar
  controls (`#22222e` / `#33334a` / `#c8c8e0` family).
- No emits, no props.

### C) `apps/registry-viewer/src/components/CardGrid.vue` — modified

- Add `import { useCardSize } from "../composables/useCardSize";`
  immediately after the `useCardViewMode` import, with a `// why:`
  comment matching §Required `// why:` Comments.
- Destructure `cardSize` only (slider lives elsewhere; grid is
  read-only).
- Bind `:style="{ '--card-grid-min-width': cardSize + 'px' }"` on the
  `.grid` element with a `// why:` comment per §Required `// why:`
  Comments.
- Change the scoped CSS rule on `.grid` from
  `grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));`
  to
  `grid-template-columns: repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr));`.
  No other CSS rule on `CardGrid.vue` changes.
- Tile-info, image, type-badge, hover, selected, and clear-filters
  rules are unchanged.

### D) `apps/registry-viewer/src/App.vue` — modified

- Add `import CardSizeSlider from "./components/CardSizeSlider.vue";`
  in the existing `import` block (alphabetical position next to
  `CardGrid` is fine; ordering is not load-bearing).
- Mount `<CardSizeSlider />` inside the cards-view filter-bar
  (`<template v-if="activeView === 'cards'">` →
  `<div class="filter-bar">`), positioned after the hero-class
  `<select>` and before the `<span class="count">`. No other
  `App.vue` template region changes.
- No state changes, no method changes, no `<style>` changes.

---

## Out of Scope

- **Themes-view grid columns.** `ThemeGrid.vue` uses its own
  `grid-template-columns` rule and is not driven by the same
  composable. A future packet may extend it; this one does not.
- **Loadout-view grid columns.** `LoadoutBuilder.vue` /
  `LoadoutPreview.vue` are not modified.
- **Per-view-mode size.** A single `cardGridSize` value drives both
  `viewMode === 'image'` and `viewMode === 'data'` renderings. A
  future packet may split if user feedback warrants.
- **Mobile gestures.** No pinch-zoom, no two-finger-spread handling.
  The native range input is keyboard- and touch-accessible by default.
- **Slider in `header-actions`.** The slider is cards-only; placing it
  next to `ViewModeToggle` would imply global scope.
- **Resetting selection on slider movement.** `selectedCard` is
  preserved; the user's chosen card remains highlighted at any size.
- **Adjusting `gap`, `padding`, or border-radius.** Tile chrome is
  unchanged; only the column min-width is parameterized.
- **Schema or registry data changes.** No `package.json`, no
  `registry-config.json`, no R2 fetcher, no Zod schema touched.

---

## Files Expected to Change

- `apps/registry-viewer/src/composables/useCardSize.ts` — **new** —
  module-scoped composable mirroring `useCardViewMode.ts` shape;
  exposes `{ cardSize, setCardSize }` plus the four range constants.
- `apps/registry-viewer/src/components/CardSizeSlider.vue` — **new** —
  native range input bound to `useCardSize`; mounted in the cards-view
  filter bar.
- `apps/registry-viewer/src/components/CardGrid.vue` — **modified** —
  binds `--card-grid-min-width` on `.grid`; updates the column-track
  rule to read the variable with a `130px` literal fallback.
- `apps/registry-viewer/src/App.vue` — **modified** — imports and
  mounts `CardSizeSlider` inside the cards-view filter bar.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — adds the
  WP-121 row.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — adds the
  EC-122 row with the EC-120 / EC-121 collision provenance breadcrumb.
- `docs/ai/DECISIONS.md` — **modified** — adds D-12101.
- `docs/ai/STATUS.md` — **modified** — adds the WP-121 execution
  entry at the top of `## Current State`.
- `docs/ai/work-packets/WP-121-registry-viewer-card-zoom-slider.md` —
  **new** — this file.
- `docs/ai/execution-checklists/EC-122-registry-viewer-card-zoom-slider.checklist.md` —
  **new** — companion EC.

---

## Acceptance Criteria

- [ ] A visible slider labelled `Card Size` exists in the cards-view
  filter bar between the hero-class select and the count span.
- [ ] Moving the slider visibly increases or decreases card image
  size in real time.
- [ ] Card layout remains stable at all slider positions — no overlap,
  no clipping outside intentional `.tile-name` ellipsis, no jitter.
- [ ] The slider value persists across reloads via
  `localStorage['cardGridSize']`.
- [ ] First-run with no stored value renders at the production
  baseline (column min-width `130px`).
- [ ] Existing filters (search, set, hero class, type group) and
  selection (`selectedCard`) are not reset by slider movement.
- [ ] Toggling between image and data view modes does not reset the
  slider value.
- [ ] No console errors or warnings introduced; no re-fetching of
  registry data triggered by slider movement.
- [ ] The slider is keyboard-accessible (Tab to focus, Left/Right
  arrows to adjust by `step`).
- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit`
  exits 0 (or equivalent; matches the pre-session baseline).

---

## Verification Steps

```bash
# 1. Build cleanly
pnpm --filter registry-viewer build
# Expected: exits 0, dist/ regenerated, no Vite warnings beyond baseline.

# 2. Type-check
pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit
# Expected: exits 0.

# 3. Dev server smoke
pnpm --filter registry-viewer dev
# Expected: opens at http://localhost:5173 with the slider visible
# in the cards filter bar.

# 4. localStorage round-trip
#   - Move slider to ~200px; confirm tiles enlarge.
#   - Reload page; tiles render at ~200px.
#   - Open DevTools → Application → Local Storage → confirm
#     'cardGridSize' = '200' (or the closest step).

# 5. Filter preservation
#   - Search "spider"; move slider; confirm search results are
#     unchanged (same count, same cards, same selection).

# 6. View-mode independence
#   - Toggle image → data; confirm tiles re-render in data mode at
#     the same size.
#   - Toggle back; confirm slider value unchanged.

# 7. Keyboard accessibility
#   - Tab to slider; press Left/Right; confirm cardSize changes by 10.
```

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] All Verification Steps pass.
- [ ] `git diff --name-only` shows only the ten files in §Files
  Expected to Change.
- [ ] D-12101 added to `docs/ai/DECISIONS.md` (locked range, default,
  storage key, CSS variable name).
- [ ] `docs/ai/STATUS.md` updated with the WP-121 execution entry.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-121 row checked off
  with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-122 row set to
  `Done <date>` with the EC-120 / EC-121 collision breadcrumb
  preserved.
- [ ] No new npm dependencies added; `package.json` unchanged across
  all workspaces.
- [ ] Manual smoke at the slider extremes (`80` and `260`)
  performed; legibility of `.tile-name` at min and grid reflow at
  max both observed and acceptable.
