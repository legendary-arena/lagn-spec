# EC-129 — Registry Viewer: Grid Tile Team & Ability Text (Threshold-Gated) (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-127-registry-viewer-grid-tile-team-and-ability-text.md`
**Layer:** Client UI (`apps/registry-viewer/`)

> **Provenance breadcrumb (per EC_INDEX.md numbering rule):** WP-127's
> WP-keyed slot (EC-127) was already taken by WP-125 (Registry Viewer
> Card Abilities Effect Filter, drafted 2026-05-01). EC-128 was taken
> by WP-104 (Owner Profile Data Model & `/me` Edit, drafted 2026-05-02).
> Per the locked precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 →
> EC-115, EC-121 → EC-122, EC-123 → EC-127, EC-104 → EC-128), the
> WP-keyed EC retargets to the next free slot. EC-129 is that slot.
> The WP number (WP-127) is unchanged.

## Before Starting

- [ ] WP-096 merged to `main`: `apps/registry-viewer/src/components/CardDataTile.vue` exists with the seven labelled rows (`Type`, `Set`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`), AND-semantics guards, and `@media print` block.
- [ ] WP-121 merged to `main`: `apps/registry-viewer/src/composables/useCardSize.ts` exists with `MIN_CARD_WIDTH_PX = 80`, `MAX_CARD_WIDTH_PX = 260`, `DEFAULT_CARD_WIDTH_PX = 130`, the locked composable surface, and the `--card-grid-min-width` CSS-variable binding on `.grid` in `CardGrid.vue`.
- [ ] `apps/registry-viewer/src/components/CardGrid.vue` line 68 reads `<div class="img-wrap">` (the binding target for the new class) and line 128 reads `.img-wrap { position: relative; width: 100%; aspect-ratio: 3/4; background: #12121a; overflow: hidden; }` (the rule the new class extends).
- [ ] `pnpm --filter registry-viewer build` exits 0 on `main`.
- [ ] `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` exits 0 on `main`.

## Execution Invariants (Non-Negotiable)

- `ABILITY_THRESHOLD_PX` is the **only** numeric authority for tile expansion behavior — the literal `190` appears nowhere else in the codebase.
- Below threshold (`cardSize.value < 190`): grid tiles are byte-identical to the WP-096 baseline.
- Above threshold (`cardSize.value >= 190`) **and** `viewMode === 'data'`:
  - `Team` row may render iff `card.team` is truthy.
  - `Ability` block may render iff `card.abilities.some(hasAbilityText)` returns true.
  - `.img-wrap` drops the 3:4 aspect-ratio lock (via the new `.data-expanded` class rule).
- Image mode is **never affected**, regardless of slider value — the `data-expanded` class never fires when `viewMode === 'image'`.
- No existing composable surfaces are modified — D-12101 (`useCardSize.ts` exports) is preserved verbatim.

## Locked Values (do not re-derive)

- Production files (three only):
  1. `apps/registry-viewer/src/composables/cardTileThresholds.ts` (new)
  2. `apps/registry-viewer/src/components/CardDataTile.vue` (modified)
  3. `apps/registry-viewer/src/components/CardGrid.vue` (modified)
- Threshold constant name (verbatim): `ABILITY_THRESHOLD_PX`.
- Threshold value (verbatim): `190`.
- `cardTileThresholds.ts` exports **exactly one** named symbol: `ABILITY_THRESHOLD_PX`. No default export. No imports. No additional named exports.
- Import path in `CardDataTile.vue` (verbatim): `from "../composables/cardTileThresholds"`.
- Import path in `CardGrid.vue` (verbatim): `from "../composables/cardTileThresholds"`.
- `useCardSize` import path in `CardDataTile.vue` (verbatim): `from "../composables/useCardSize"`.
- `computed` import in `CardDataTile.vue` (verbatim): `import { computed } from "vue";`.
- `useCardSize` destructure in `CardDataTile.vue` (verbatim): `const { cardSize } = useCardSize();`.
- `showAbilityRow` derivation in `CardDataTile.vue` (verbatim): `const showAbilityRow = computed(() => cardSize.value >= ABILITY_THRESHOLD_PX);`
- `Team` row guard form (verbatim): `<template v-if="showAbilityRow && card.team">`. Body: `<dt>Team</dt><dd>{{ card.team }}</dd>`.
- `Team` row placement: between the existing `Class` row and the `Cost` row in the `<dl>` (mirrors sidebar ordering at `CardDataDisplay.vue:90`).
- `Ability` block guard form (verbatim): `<div v-if="showAbilityRow && card.abilities && card.abilities.some(hasAbilityText)" class="ability-block">`.
- `Ability` block placement: beneath the existing `</dl>`, not inside it.
- `hasAbilityText` helper body: byte-identical to `CardDataDisplay.vue:53–59`.
- Class binding on `.img-wrap` in `CardGrid.vue` (verbatim): `:class="{ 'data-expanded': viewMode === 'data' && cardSize >= ABILITY_THRESHOLD_PX }"`.
- Aspect-ratio reset rule in `CardGrid.vue` (verbatim): `.img-wrap.data-expanded { aspect-ratio: auto; }`. Placement: after the existing `.img-wrap` rule (line 128 of WP-121 baseline).

## Guardrails

- No edits to: `useCardSize.ts`, `CardSizeSlider.vue`, `useCardViewMode.ts`, `ViewModeToggle.vue`, `CardDataDisplay.vue`, `CardDetail.vue`, `App.vue`, `ThemeGrid.vue`, `LoadoutBuilder.vue`, `LoadoutPreview.vue`, `useResizable.ts`, `lib/theme.ts`, `registry-config.json`, any `.test.ts`, any `package.json`, `pnpm-lock.yaml`.
- No new npm dependencies.
- No tests added; no test config change; no `.test.ts` file created.
- No imports from `boardgame.io`, `@legendary-arena/{game-engine,preplan,server}`, `pg`, the Node-bearing `@legendary-arena/registry` barrel, or any `node:` built-in.
- The literal `190` does NOT appear in `CardDataTile.vue` or `CardGrid.vue` — both files import `ABILITY_THRESHOLD_PX` and reference it by name.
- The seven existing labelled rows in `CardDataTile.vue` (`Type`, `Set`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`), their guard forms, their CSS, and the existing `@media print` block remain byte-identical to the WP-096 baseline.
- The existing `.img-wrap` rule in `CardGrid.vue` (line 128 of the WP-121 baseline) is byte-identical. Only a new sibling rule `.img-wrap.data-expanded { aspect-ratio: auto; }` is added beneath it.
- The class binding on `.img-wrap` requires BOTH conditions: `viewMode === 'data'` AND `cardSize >= ABILITY_THRESHOLD_PX`. Image-mode tiles never receive the class. Below-threshold data tiles never receive the class.
- The grid column track, the type-badge rule, the tile-info rule, and all `.tile-*` rules are byte-identical.
- No tokenization (keyword / rule / icon / hc / team) of tile ability text — plain-text bullet items only. Tokenization remains a `CardDetail.vue` (image-mode sidebar) concern.

## Required `// why:` Comments

- `cardTileThresholds.ts` module-header JSDoc: explains threshold's purpose (gates `Team` row + ability-block reveal on the tile), why `190` was selected (the threshold above which ability lines render with adequate horizontal width without aggressive wrapping or overflow), and why this constant intentionally lives **outside** `useCardSize.ts` to preserve D-12101's locked composable surface and avoid cross-feature coupling between zoom-range constants and tile-content gating.
- `CardDataTile.vue` `useCardSize` import: cousin of `CardGrid.vue`'s composable-direct consumption pattern; threshold-gated content reveal; D-12101 surface preserved.
- `CardDataTile.vue` `showAbilityRow` `computed`: single source of truth across the two new template guards (`Team` row, `Ability` block); threshold value defined in `cardTileThresholds.ts`.
- `CardDataTile.vue` module-header JSDoc update: documents the new threshold-gated rows, cites D-9601 amendment + WP-127.
- `CardGrid.vue` class binding: above-threshold data tiles drop the 3:4 aspect-ratio so the ability block can grow the tile vertically; image-mode tiles and below-threshold data tiles retain 3:4. Cites D-9601 amendment + WP-127.

## Files to Produce

- `apps/registry-viewer/src/composables/cardTileThresholds.ts` — **new** — single-export module for `ABILITY_THRESHOLD_PX = 190`.
- `apps/registry-viewer/src/components/CardDataTile.vue` — **modified** — threshold-gated `Team` row + ability block + scoped CSS + print rules + JSDoc + 3 `// why:` comments.
- `apps/registry-viewer/src/components/CardGrid.vue` — **modified** — class binding on `.img-wrap` + one new `.img-wrap.data-expanded` CSS rule + 1 `// why:` comment.

## After Completing

- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` exits 0.
- [ ] `Select-String -Path "apps\registry-viewer\src" -Pattern "ABILITY_THRESHOLD_PX\s*=\s*190" -Recurse` returns exactly one match (in `cardTileThresholds.ts`).
- [ ] `Select-String -Path "apps\registry-viewer\src\components\CardDataTile.vue" -Pattern "\b190\b"` returns no matches.
- [ ] `Select-String -Path "apps\registry-viewer\src\components\CardGrid.vue" -Pattern "\b190\b"` returns no matches.
- [ ] `git diff -- apps/registry-viewer/src/composables/useCardSize.ts` returns no output.
- [ ] `git diff --name-only` shows only the three production files plus governance (`STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`, WP-127, EC-129).
- [ ] Manual smoke: 8-step sequence from WP-127 §Verification Steps passes (image-mode unchanged at all sizes; data-mode below 190 unchanged from WP-096 baseline; data-mode at 190+ shows `Team` row when present + ability bullets when present + drops 3:4; toggling slider crosses the threshold cleanly without console errors; print at 200 renders white-background palette).
- [ ] `docs/ai/STATUS.md` updated — registry viewer grid-tile data view now reveals `Team` + ability text above `cardSize.value >= 190`.
- [ ] `docs/ai/DECISIONS.md` D-9601 amendment block landed (no new D-NNN entry; appended to the existing D-9601 section, dated 2026-05-02, citing WP-127 + EC-129).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-127 row checked off with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-129 row set to `Done <date>` with the EC-127 / EC-128 collision breadcrumb preserved.

## Audit Shortcuts (Reviewer QoL)

- Threshold authority (single source):
  `rg "ABILITY_THRESHOLD_PX" apps/registry-viewer/src` — expect 1 definition + 2 imports + 2 references.
- No leaked literals in consumers:
  `rg "\b190\b" apps/registry-viewer/src/components` — expect no matches.
- Aspect-ratio reset rule present:
  `rg "img-wrap\.data-expanded" apps/registry-viewer/src/components/CardGrid.vue` — expect 1 match.
- `useCardSize.ts` untouched:
  `git diff -- apps/registry-viewer/src/composables/useCardSize.ts` — expect no output.
- `Team` row order in template: visually verify it appears between `Class` and `Cost` in the `<dl>` (no automated check; mirrors `CardDataDisplay.vue:90`).

## Common Failure Smells

- Tile grows tall at slider 130 → class binding is missing the `cardSize >= ABILITY_THRESHOLD_PX` clause and is firing on `viewMode === 'data'` alone.
- Tile stays 3:4 at slider 200 → class binding is missing the `viewMode === 'data'` clause, OR the `.img-wrap.data-expanded` rule is missing / mis-spelled, OR `aspect-ratio: auto` was dropped from the new rule.
- Below-threshold tile grew an extra row → the `Team` row's outer `v-if` is missing the `showAbilityRow` clause and renders unconditionally on `card.team`.
- Ability text appears for empty arrays → the `Ability` block's `v-if` dropped the `.some(hasAbilityText)` filter, OR the `[object Object]` literal-string check inside `hasAbilityText` was lost.
- Cards with no team get a blank `Team` row → the `Team` row's `v-if` is missing the `card.team` clause (showing the row without a body).
- Image-mode tile grew tall → the class binding is missing the `viewMode === 'data'` clause and is firing in image mode.
- Slider value 189.9 reveals abilities → the comparison is `>` instead of `>=`, OR `cardSize` is being rounded somewhere it shouldn't be (slider step is 10, so this should not happen, but worth confirming the `>=` exact form).
- Two `190` literals appear in the codebase → one of the consumer files is inlining the literal instead of importing `ABILITY_THRESHOLD_PX`.
- Abilities never reveal at any slider size → `ABILITY_THRESHOLD_PX` imported from the wrong relative path, shadowed by a local identifier, or the `computed` import was dropped from the `vue` import line (silent runtime failure when `computed` is undefined).
- Ability text renders the literal string `"[object Object]"` → `hasAbilityText` helper is not byte-identical to `CardDataDisplay.vue:53–59`, OR the `[object Object]` string-coercion guard inside the helper was altered or removed.
