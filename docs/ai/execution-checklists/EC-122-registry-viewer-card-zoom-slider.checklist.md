# EC-122 — Registry Viewer: Card Zoom Slider (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-121-registry-viewer-card-zoom-slider.md`
**Layer:** Client UI (`apps/registry-viewer/`)

> **Provenance breadcrumb (per EC_INDEX.md numbering rule):** WP-121's
> WP-keyed slot (EC-121) was already taken by the unmerged WP-120
> Loadout Preview Round-Trip Fix branch (`wp-120-loadout-preview-roundtrip-fix`,
> Commit A `05d5ded`, 2026-04-30). EC-120 is also taken (ad-hoc viewer
> a11y EC `EC-120-loadout-builder-a11y-label-association`). Per the
> locked precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115),
> the WP-keyed EC retargets to the next free slot that does not shadow
> a known or imminent WP. EC-122 is that slot. The WP number (WP-121)
> is unchanged.

## Before Starting

- [ ] WP-066 merged to `main`: `apps/registry-viewer/src/composables/useCardViewMode.ts` exists with `STORAGE_KEY = "cardViewMode"`, module-scoped ref pattern, narrowing, self-heal `persistSafely`, and swallowed `setItem` failure.
- [ ] WP-096 merged to `main`: `apps/registry-viewer/src/components/CardGrid.vue` renders the cards via CSS Grid with `grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));`.
- [ ] `apps/registry-viewer/src/App.vue` has a cards-view filter bar (`<template v-if="activeView === 'cards'">` → `<div class="filter-bar">`) containing the search input, set select, hero-class select, and count span. (If WP-120 has merged in the interim, the filter bar template region remains unchanged — WP-120 modifies elsewhere in `App.vue`. Verify at session start.)
- [ ] `pnpm --filter registry-viewer build` exits 0 on `main`.
- [ ] `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` exits 0 on `main`.

## Locked Values (do not re-derive)

- Production files (four only):
  1. `apps/registry-viewer/src/composables/useCardSize.ts` (new)
  2. `apps/registry-viewer/src/components/CardSizeSlider.vue` (new)
  3. `apps/registry-viewer/src/components/CardGrid.vue` (modified)
  4. `apps/registry-viewer/src/App.vue` (modified)
- localStorage key (verbatim): `'cardGridSize'`.
- CSS variable name (verbatim): `--card-grid-min-width`.
- Range constants (verbatim): `MIN_CARD_WIDTH_PX = 80`, `MAX_CARD_WIDTH_PX = 260`, `DEFAULT_CARD_WIDTH_PX = 130`, `CARD_WIDTH_STEP_PX = 10`.
- Composable public API (verbatim): `{ cardSize: Ref<number>; setCardSize: (next: number) => void; }`.
- Composable destructure in `CardSizeSlider.vue` (verbatim): `const { cardSize, setCardSize } = useCardSize();`
- Composable destructure in `CardGrid.vue` (verbatim): `const { cardSize } = useCardSize();`
- Composable import path (verbatim): `from "../composables/useCardSize"`.
- `CardSizeSlider` import path in `App.vue` (verbatim): `from "./components/CardSizeSlider.vue"`.
- `.grid` column-track rule (verbatim): `grid-template-columns: repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr));`
- Slider label text (verbatim): `Card Size`.
- Slider mount point: cards-view `.filter-bar`, between the hero-class `<select>` and the `<span class="count">`.

## Guardrails

- No edits to: `useCardViewMode.ts`, `ViewModeToggle.vue`, `CardDataDisplay.vue`, `CardDataTile.vue`, `CardDetail.vue`, `ThemeGrid.vue`, `LoadoutBuilder.vue`, `LoadoutPreview.vue`, `useResizable.ts`, `lib/theme.ts`, `registry-config.json`.
- No new npm dependencies; no `package.json` change in any workspace.
- No tests added; no test config change; no `.test.ts` file created.
- No imports from `boardgame.io`, `@legendary-arena/{game-engine,preplan,server}`, `pg`, the Node-bearing `@legendary-arena/registry` barrel, or any `node:` built-in.
- The `.grid` CSS rule's `130px` literal fallback inside `minmax(...)` is preserved — the rule reads the CSS variable, but the literal fallback guarantees pre-packet behavior if the inline style is dropped.
- `applyFilters()` is not called from the slider's `@input` handler — slider movement only changes a CSS variable.
- The slider mounts in the cards-view filter bar only — not in `header-actions`, not in the themes-view filter bar, not in the loadout view.
- Composable exports exactly two names plus the four range constants — no `resetCardSize`, no `clamp`, no `min`/`max` accessor.

## Required `// why:` Comments

- `useCardSize.ts` on the `STORAGE_KEY` constant: explains the flat camelCase non-abbreviated unprefixed convention, mirroring `useCardViewMode.ts` and `useResizable.ts` (`cardDetailWidth`).
- `useCardSize.ts` on the narrowing block: `localStorage.getItem` returns `string | null`; `Number.parseInt` may yield `NaN`; out-of-range values would poison the CSS-variable binding; clamp + default protect downstream readers.
- `useCardSize.ts` on the self-heal `persistSafely(initialValue)` call: writing the narrowed value back on first load guarantees the invariant holds across tabs and reloads.
- `useCardSize.ts` on the `persistSafely` `catch {}`: full-sentence swallow per 00.6 Rule 11 (iOS Safari private mode, quota, group-policy restrictions; in-memory ref already updated; only cross-reload persistence lost).
- `CardGrid.vue` on the `useCardSize` import: composable is single source of truth; grid reads it directly to avoid prop plumbing through `App.vue`.
- `CardGrid.vue` on the `:style` binding for `--card-grid-min-width`: scaling is CSS-driven; `.img-wrap`'s `aspect-ratio: 3/4` propagates width to height proportionally; the `130px` fallback in `minmax(...)` preserves pre-packet behavior if the inline style is dropped.
- `CardSizeSlider.vue` module-header JSDoc: native `<input type="range">` is keyboard-accessible by default; the displayed value is the column min-width in pixels; the locked range was chosen so `.tile-name` and `.tile-meta` remain legible at the minimum and the largest tile fits without grid reflow on a 1024px viewport.

## Files to Produce

- `apps/registry-viewer/src/composables/useCardSize.ts` — **new** — module-scoped composable; range constants + `useCardSize()`.
- `apps/registry-viewer/src/components/CardSizeSlider.vue` — **new** — native range input bound to the composable; cards-view filter-bar control.
- `apps/registry-viewer/src/components/CardGrid.vue` — **modified** — bind `--card-grid-min-width` on `.grid`; update column-track rule with `130px` fallback.
- `apps/registry-viewer/src/App.vue` — **modified** — import and mount `<CardSizeSlider />` inside the cards-view filter bar.

## After Completing

- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` exits 0.
- [ ] `git diff --name-only` shows only the four production files plus governance (`STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`, WP-121, EC-122).
- [ ] Manual smoke: slider visible in cards-view filter bar; movement scales tiles in real time; reload preserves chosen size; no console errors; image / data toggle preserves slider value; filter / search / selection preserved across slider movement.
- [ ] `docs/ai/STATUS.md` updated — registry viewer cards-view now exposes a Card Size slider persisted as `cardGridSize`.
- [ ] `docs/ai/DECISIONS.md` updated — D-12101 (locked range, default, storage key, CSS variable name).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-121 row checked off with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-122 row set to `Done <date>` with the EC-120 / EC-121 collision breadcrumb preserved.

## Common Failure Smells

- Tile-info text becomes unreadable at min slider value → `MIN_CARD_WIDTH_PX` was lowered below `80`; restore the locked value.
- Slider movement triggers a re-fetch / spinner → an `applyFilters()` call leaked into the `@input` handler; the handler must only call `setCardSize`.
- Reload renders tiles at the wrong size → narrowing block's clamp range is wrong, or `Number.parseInt` was replaced with `Number(...)` (which accepts `'80px'` literally and returns `NaN`).
- Grid layout breaks when CSS variable is unset (e.g., during initial paint) → the `minmax(...)` literal `130px` fallback was dropped from the rewritten rule.
- Themes view tiles change size with the slider → the slider's CSS variable was applied to a parent of both grids instead of `CardGrid.vue`'s `.grid` only.
- Selection clears on slider movement → `selectedCard` is being mutated somewhere in the slider chain; verify the `@input` handler calls `setCardSize` only.
