# WP-127 — Registry Viewer: Grid Tile Team & Ability Text (Threshold-Gated)

**Status:** Draft (authored 2026-05-02; awaiting user review and lint-gate sign-off)
**Primary Layer:** Client UI (`apps/registry-viewer/`)
**Dependencies:**
- **Hard:** WP-096 (locked the grid-tile data view at `CardDataTile.vue` under D-9601 — the field set, AND-semantics guards, ability-text omission, and `.img-wrap`-internal `viewMode` branch are all sourced from that decision; this packet amends D-9601 in place rather than supersedes it).
- **Hard:** WP-121 (locked the `useCardSize` composable and the `--card-grid-min-width` CSS variable on `.grid` — this packet reads `cardSize.value` from the same composable to gate tile-content reveal at the locked threshold).
- **Soft:** WP-066 (image-vs-data toggle — tile content gating only fires inside the `viewMode === 'data'` branch; image mode is unchanged).

---

## Session Context

WP-096 / D-9601 locked the grid-tile data view (`CardDataTile.vue`) to a seven-row field set and explicitly forbade `team` and ability text on the tile. The lock cited a specific technical reason: at the original 130px-min tile, ability strings (some 200+ chars with token-encoded keywords) would either truncate aggressively or overflow the 3:4 aspect-ratio box. WP-121 then introduced user-controlled tile sizing (`cardSize` ∈ [80, 260] px), which means the constraint that drove D-9601's omission is no longer uniform across all tile sizes. This packet amends D-9601 to admit `team` and ability text **only above a locked threshold** of `cardSize.value >= 190px`, leaves the small-tile (sub-190) layout byte-identical, and drops the `aspect-ratio: 3/4` rule on `.img-wrap` only inside the data branch and only above the threshold (so above-threshold tiles grow tall to fit the ability block; below-threshold tiles remain compact and uniform).

---

## Goal

After this session:

- `apps/registry-viewer/src/components/CardDataTile.vue` renders, **only when `cardSize.value >= 190px`**:
  - A `Team` row (label `Team`, AND-semantics omission when `card.team` is empty / null / undefined), placed between the existing `Class` and `Cost` rows to mirror sidebar ordering.
  - An `Ability` block beneath the data grid, populated from `card.abilities` as plain-text bullet items, AND-semantics-omitted when the array is empty / contains only `[object Object]` literals.
- When `cardSize.value < 190px`, `CardDataTile.vue` renders the byte-identical seven-row tile from the WP-096 baseline — no `Team` row, no `Ability` block. (Below threshold: zero behavior change.)
- `apps/registry-viewer/src/components/CardGrid.vue` binds a `data-expanded` class on `.img-wrap` when `viewMode === 'data' && cardSize.value >= 190`. A new CSS rule on `.img-wrap.data-expanded` resets `aspect-ratio: auto` so above-threshold data tiles grow tall enough to fit the ability block. Image-mode tiles remain 3:4 at all sizes; below-threshold data tiles remain 3:4.
- A new module `apps/registry-viewer/src/composables/cardTileThresholds.ts` exports a single named constant `ABILITY_THRESHOLD_PX = 190`. Both `CardDataTile.vue` and `CardGrid.vue` import it; `useCardSize.ts` is **not** modified (D-12101's locked composable surface is preserved).
- `docs/ai/DECISIONS.md` D-9601 is amended in place by appending a new amendment block at the bottom of the existing entry (no new D-NNN number) documenting the threshold value, the conditional aspect-ratio rule, the field-set extension, and the constraint that all five locks below the threshold remain in force.

The themes view, loadout view, sidebar (`CardDataDisplay.vue`), `CardDetail.vue`, `useCardSize.ts`, `useCardViewMode.ts`, and the slider component (`CardSizeSlider.vue`) are unchanged.

---

## Assumes

- WP-096 complete: `apps/registry-viewer/src/components/CardDataTile.vue` exists with the seven labelled rows (`Type`, `Set`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`), the AND-semantics guard forms, and the `@media print` block. `CardGrid.vue` renders `<CardDataTile :card="card" />` inside `.img-wrap` when `viewMode === 'data'`.
- WP-121 complete: `apps/registry-viewer/src/composables/useCardSize.ts` exists, exports `useCardSize()` returning `{ cardSize: Ref<number>; setCardSize: (next: number) => void; }` plus the four range constants. `CardGrid.vue` already imports `useCardSize` and binds `--card-grid-min-width` on `.grid`.
- `pnpm --filter registry-viewer build` exits 0 on `main` pre-session.
- `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` exits 0 on `main` pre-session.
- `FlatCard` populates `team?: string` (set on hero cards only — line 45 of `apps/registry-viewer/src/registry/types/types-index.ts`) and `abilities: string[]` (always present, possibly empty — line 53).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — registry-viewer's allowed import surface and the prohibition on reaching into `game-engine`, `preplan`, `server`, or `pg`.
- `.claude/rules/architecture.md §Layer Boundary` — runtime enforcement view.
- `apps/registry-viewer/CLAUDE.md` — viewer architecture (Vue 3 + Vite 5 + Zod), single-page tab switching, R2 data source.
- `docs/ai/DECISIONS.md §D-9601` — the full lock being amended. Read in full. The five-rule structure, the "ability text intentionally omitted" rationale, and the "Status: Immutable for the v1 grid-tile data view" line all govern what this amendment may and may not relax.
- `docs/ai/DECISIONS.md §D-12101` — the locked `useCardSize` composable surface. This packet does **not** modify that surface; the threshold constant lives in a new module instead.
- `apps/registry-viewer/src/components/CardDataTile.vue` — read in full. The seven existing rows, their guard forms, the `@media print` block, and the JSDoc are all preserved byte-for-byte; the new `Team` row inserts between `Class` and `Cost`, and the new `Ability` block appends beneath the existing `<dl>`. Both new sections are wrapped in a `v-if="showAbilityRow"` (or equivalent) guard tied to the threshold.
- `apps/registry-viewer/src/components/CardDataDisplay.vue` — sidebar reference for byte-identical label vocabulary. The tile's new `Team` row label and guard form match the sidebar's lines 90–93 exactly; the new `Ability` block label and guard form match lines 130–141 exactly.
- `apps/registry-viewer/src/components/CardGrid.vue` — read in full. The packet adds (a) a class binding on `.img-wrap` and (b) one new scoped CSS rule for `.img-wrap.data-expanded`. No other CSS rules are touched. The grid column track, the existing `aspect-ratio: 3/4` rule on `.img-wrap`, the `--card-grid-min-width` binding, the type-badge rule, the tile-info rule, and all `.tile-*` rules are unchanged byte-for-byte.
- `apps/registry-viewer/src/composables/useCardSize.ts` — read for the `cardSize` ref shape and to confirm no edits are required here.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error messages), Rule 14 (field names match data contract).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — N/A here (no engine touch).
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`.
- `node:` prefix on Node.js built-in imports — N/A here (no Node imports in viewer code).
- Test files use `.test.ts` extension — no tests added in this packet (manual smoke per WP-096 / WP-121 precedent).
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- `useCardSize.ts` is NOT modified. The locked composable surface from D-12101 is preserved verbatim. The threshold constant lives in a new sibling module, not in `useCardSize.ts`.
- `CardSizeSlider.vue`, `useCardViewMode.ts`, `ViewModeToggle.vue`, `CardDataDisplay.vue`, `CardDetail.vue`, `App.vue`, `ThemeGrid.vue`, `LoadoutBuilder.vue`, `LoadoutPreview.vue`, `useResizable.ts`, `lib/theme.ts`, `registry-config.json` are NOT modified.
- The threshold value is `190` (px), defined exactly once in `cardTileThresholds.ts`. Both `CardDataTile.vue` and `CardGrid.vue` import the constant; neither file inlines the literal `190`.
- The seven existing labelled rows in `CardDataTile.vue` (`Type`, `Set`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`), their AND-semantics guards, and the `@media print` palette remain byte-identical to the WP-096 baseline.
- The `Team` row guard form is byte-identical to `CardDataDisplay.vue:90–93` (`<template v-if="card.team">`). The `Ability` block guard form mirrors `CardDataDisplay.vue:130–141` (`v-if="card.abilities && card.abilities.some(hasAbilityText)"`), including the `[object Object]` literal-string filter.
- The `Team` row is placed between the existing `Class` and `Cost` rows (matching sidebar ordering at `CardDataDisplay.vue:90`), not at the bottom and not before `Type`.
- The `Ability` block lives **beneath** the existing `<dl>`, not inside it. It uses an `<ul>` of `<li>` items with plain-text content. No tokenization (keyword/rule/icon/hc/team) — that is `CardDetail.vue`'s image-mode surface and remains a sidebar-only enhancement.
- The `.img-wrap.data-expanded` rule resets `aspect-ratio` to `auto` only. Width, background, overflow, and position rules on `.img-wrap` are unchanged.
- The class binding on `.img-wrap` only sets `data-expanded` when **both** conditions hold: `viewMode === 'data'` AND `cardSize.value >= ABILITY_THRESHOLD_PX`. Image-mode tiles never get the class. Below-threshold data tiles never get the class.
- No imports from `boardgame.io`, `@legendary-arena/{game-engine,preplan,server}`, `pg`, the Node-bearing `@legendary-arena/registry` barrel, or any `node:` built-in.
- No new npm dependencies; no `package.json` change in any workspace.
- No tests added; no test config change; no `.test.ts` file created (per WP-096 / WP-121 precedent — viewer has no Vue component-test harness; verification is `typecheck` + `build` + manual smoke).

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human before proceeding — never guess or invent field names, type shapes, or file paths.

**Locked values (verbatim — do not paraphrase or re-derive from memory):**

- **Threshold constant name:** `ABILITY_THRESHOLD_PX` (uppercase snake; matches `MIN_CARD_WIDTH_PX` style from `useCardSize.ts`).
- **Threshold value:** `190` (pixels).
- **Threshold module path:** `apps/registry-viewer/src/composables/cardTileThresholds.ts`.
- **Class name on `.img-wrap`:** `data-expanded` (kebab-case, matches existing `.tile-info` / `.tile-name` style).
- **Team row label (verbatim):** `Team` (matches `CardDataDisplay.vue:91`).
- **Ability block title (verbatim):** `Ability` (matches `CardDataDisplay.vue:131`).
- **Aspect-ratio reset rule (verbatim):** `.img-wrap.data-expanded { aspect-ratio: auto; }`.

---

## Debuggability & Diagnostics

- All behavior introduced by this packet is observable via DOM inspection: above-threshold data tiles carry the `data-expanded` class on `.img-wrap`, render the `Team` row when `card.team` is present, and render the `Ability` block when `card.abilities` contains usable text. Below-threshold data tiles carry no extra class and render the WP-096 baseline.
- No state mutations introduced. No persistence. No new localStorage keys. No new composable refs. The threshold check is a pure derivation from `cardSize.value`.
- Failure modes (smoke checklist):
  - Tile grows tall at any slider value → class binding is missing the `cardSize.value >= ABILITY_THRESHOLD_PX` clause and is firing on `viewMode === 'data'` alone.
  - Tile stays 3:4 at slider 200+ → class binding is missing the `viewMode === 'data'` clause, OR the `.img-wrap.data-expanded` rule is missing / mis-spelled, OR `aspect-ratio: auto` was dropped from the new rule.
  - Below-threshold tile grew an extra row → the `Team` row's outer `v-if` is missing the threshold guard and renders unconditionally.
  - Ability text appears for empty arrays → the `Ability` block's `v-if` dropped the `.some(hasAbilityText)` filter or the `[object Object]` literal-string check.

---

## Scope (In)

### A) New module: `apps/registry-viewer/src/composables/cardTileThresholds.ts`

- **`apps/registry-viewer/src/composables/cardTileThresholds.ts`** — **new**:
  - Exports **exactly one** named symbol: `export const ABILITY_THRESHOLD_PX = 190;`
  - No default export. No imports. No additional named exports. No functions, types, or re-exports.
  - Module-header JSDoc explains: (a) the constant gates `Team` row + ability-block reveal on `CardDataTile.vue`; (b) `190` was selected as the threshold above which ability lines render with adequate horizontal width without aggressive wrapping or overflow at the locked tile width range; (c) this constant intentionally lives **outside** `useCardSize.ts` to preserve D-12101's locked composable surface and avoid cross-feature coupling between zoom-range constants and tile-content gating.

### B) Modified: `apps/registry-viewer/src/components/CardDataTile.vue`

- **`apps/registry-viewer/src/components/CardDataTile.vue`** — **modified**:
  - Add an import: `import { useCardSize } from "../composables/useCardSize";`
  - Add an import: `import { ABILITY_THRESHOLD_PX } from "../composables/cardTileThresholds";`
  - Inside `<script setup>`, after `defineProps<{ card: FlatCard }>();`, add a `const { cardSize } = useCardSize();` line and a derived `const showAbilityRow = computed(() => cardSize.value >= ABILITY_THRESHOLD_PX);` (import `computed` from `vue`).
  - Add a `hasAbilityText(line: string): boolean` helper (byte-identical to `CardDataDisplay.vue:53–59`): returns `false` for empty / whitespace-only / `'[object Object]'` strings.
  - In the template, insert a new `Team` row between the existing `Class` row (lines 50–53 of the WP-096 baseline) and the `Cost` row (lines 62–65). The new row is wrapped in `<template v-if="showAbilityRow && card.team">` so it appears only above threshold AND only when the card carries a team. Label is `Team`. Body is `{{ card.team }}`. Guard form mirrors `CardDataDisplay.vue:90–93`.
  - Beneath the existing `</dl>`, add a new `<div v-if="showAbilityRow && card.abilities && card.abilities.some(hasAbilityText)" class="ability-block">` containing an `<ul class="ability-lines">` of `<li class="ability-line">{{ abilityLine }}</li>` items keyed by `lineIndex`. Each `<li>` body is wrapped in `<template v-if="hasAbilityText(abilityLine)">{{ abilityLine }}</template>`. The block title is a `<div class="ability-block-title">Ability</div>`. Block structure is byte-identical to `CardDataDisplay.vue:130–141`.
  - Add new scoped CSS rules for `.ability-block`, `.ability-block-title`, `.ability-lines`, `.ability-line`. Palette matches the sidebar rules at `CardDataDisplay.vue:200–227` exactly (font sizes scaled for the tile: `0.55rem` for the block title, `0.6rem` for `.ability-line`).
  - Extend the `@media print` block with print rules for the four new CSS classes (mirror sidebar print rules at `CardDataDisplay.vue:253–259`).
  - Update the module-header JSDoc to document the new threshold-gated rows. Add a `// why:` reference to D-9601 amendment + WP-127.
  - Add a `// why:` comment on the `useCardSize` import (cousin of `CardGrid.vue` line 13–19; threshold-gated content reveal; D-12101's locked composable surface preserved).
  - Add a `// why:` comment on the `showAbilityRow` `computed` (single source of truth across the two new template guards; threshold value `190` documented in `cardTileThresholds.ts`).

### C) Modified: `apps/registry-viewer/src/components/CardGrid.vue`

- **`apps/registry-viewer/src/components/CardGrid.vue`** — **modified**:
  - Add an import: `import { ABILITY_THRESHOLD_PX } from "../composables/cardTileThresholds";`
  - Update the `<div class="img-wrap">` element (line 68 of the WP-121 baseline) to bind a class:
    `<div class="img-wrap" :class="{ 'data-expanded': viewMode === 'data' && cardSize >= ABILITY_THRESHOLD_PX }">`
  - Add one new scoped CSS rule beneath the existing `.img-wrap` rule (after line 128 of the WP-121 baseline):
    `.img-wrap.data-expanded { aspect-ratio: auto; }`
  - Add a `// why:` comment on the new class binding: above-threshold data tiles drop the 3:4 aspect-ratio so the ability block can grow the tile vertically; image-mode tiles and below-threshold data tiles retain 3:4. Matches D-9601 amendment + WP-127.
  - All other CSS rules, the grid column track, the type-badge rule, the tile-info rule, the `.tile-*` rules, and the existing `.img-wrap` rule are untouched.

### D) Governance: `docs/ai/DECISIONS.md`

- **`docs/ai/DECISIONS.md`** — **modified**:
  - Append an amendment block to the existing D-9601 entry (no new D-NNN number). The amendment documents:
    1. The threshold-gated relaxation: `team` row and ability block are now permitted on `CardDataTile.vue` only when `cardSize.value >= ABILITY_THRESHOLD_PX` (= 190px).
    2. The conditional aspect-ratio rule: `.img-wrap.data-expanded` resets `aspect-ratio: auto`; this class is bound only when `viewMode === 'data' && cardSize.value >= ABILITY_THRESHOLD_PX`.
    3. The field-set extension: above-threshold tiles render an additional `Team` row (between `Class` and `Cost`) and an `Ability` block (beneath the `<dl>`). The seven existing rows, their guard forms, the `Set` / `setAbbr` divergence, and the `@media print` palette remain byte-identical to the WP-096 baseline.
    4. The threshold module: `ABILITY_THRESHOLD_PX = 190` is defined in `apps/registry-viewer/src/composables/cardTileThresholds.ts`. `useCardSize.ts` is not modified — D-12101's locked composable surface is preserved.
    5. Five locks below threshold are unchanged: composable-direct consumption, AND-semantics parity (six rows byte-identical), tile-compaction divergence (`Set` / `setAbbr`), `.img-wrap`-internal placement, `@media print` parity. Future field-set additions (e.g., `victoryPoints`, `recruiterText`, `attackerText`, `heroName`, `slot`) still require amending D-9601 first.
  - The amendment is dated `2026-05-02` and cites WP-127 + EC-129.

### E) Tests

No tests added. Per WP-096 / WP-121 precedent, the viewer has no Vue component-test harness; verification is `typecheck` + `build` + manual smoke. A test harness is a separate future WP.

---

## Out of Scope

- No tokenization (keyword / rule / icon / hc / team) of tile ability text — that is `CardDetail.vue`'s image-mode surface and remains a sidebar / detail-panel enhancement. A future WP may extend `CardDataDisplay.vue` (the sidebar data view) with tokenization; this packet does not.
- No glossary tooltip integration on the tile.
- No keyboard-shortcut binding for above-threshold reveal (the slider is the user's lever).
- No new fields on `FlatCard`. The contract-aware placeholders documented in `CardDataDisplay.vue` JSDoc (`victoryPoints`, `recruiterText`, `attackerText`) remain absent on the tile.
- No changes to the grid column track, the `aspect-ratio: 3/4` rule on image-mode tiles, the `.img-wrap` width / background / overflow / position rules, or any `.card-tile` / `.tile-info` / `.tile-meta` rule.
- No changes to `useCardSize.ts`, `useCardViewMode.ts`, `CardSizeSlider.vue`, `ViewModeToggle.vue`, `CardDataDisplay.vue`, `CardDetail.vue`, `App.vue`, or any other component / composable / utility / theme module.
- No localStorage key for the threshold (the threshold is a hard-coded constant; the user's lever is the slider).
- No changes to the slider's range, default, step, or persistence key.
- Refactors, cleanups, or "while I'm here" improvements are **out of scope** unless explicitly listed in Scope (In) above.

---

## Vision Alignment

**Vision clauses touched:** §10a (Registry Viewer public surface —
search and browse quality on `cards.barefootbetters.com`).

**Conflict assertion:** No conflict. This WP improves browse-quality
on the public reference surface by exposing two additional `FlatCard`
fields (`team`, `abilities`) at user-controlled larger tile sizes;
sub-190 tile layout is byte-identical to the WP-096 baseline (zero
change for users at default zoom). It adds no monetization, no
persuasive surface, no competitive ranking implication.

**Non-Goal proximity check:** None of NG-1..NG-7 is crossed. The
threshold-gated reveal is a client-local UI affordance with no
game-state coupling, no leaderboard surface, and no payment surface.

**Determinism preservation:** N/A — no scoring, replay, RNG,
simulation, or PAR surfaces are touched. The threshold check is a
pure derivation from `cardSize.value` (an existing UI-only
client-local preference read from `localStorage` under D-12101).

**§20 Funding Surface Gate:** N/A with explicit justification — the
registry viewer is free public reference tooling; this packet adds no
funding-adjacent UI, no payment surface, no donation prompt, no
storefront cross-link.

---

## Files Expected to Change

- `apps/registry-viewer/src/composables/cardTileThresholds.ts` — **new** — single-export module for `ABILITY_THRESHOLD_PX = 190`.
- `apps/registry-viewer/src/components/CardDataTile.vue` — **modified** — threshold-gated `Team` row + ability block + scoped CSS + print rules + JSDoc.
- `apps/registry-viewer/src/components/CardGrid.vue` — **modified** — class binding on `.img-wrap` + one new `.img-wrap.data-expanded` CSS rule + `// why:` comment.
- `docs/ai/DECISIONS.md` — **modified** — D-9601 amendment block.
- `docs/ai/STATUS.md` — **modified** — note that the registry viewer's grid-tile data view now reveals `Team` + ability text above 190px.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-127 row checked off with date + commit hash at execution.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-129 row set to `Done <date>` at execution.

No other files may be modified.

---

## Acceptance Criteria

### A) Threshold module

- [ ] `apps/registry-viewer/src/composables/cardTileThresholds.ts` exists.
- [ ] The file exports exactly one named constant: `ABILITY_THRESHOLD_PX = 190`.
- [ ] No other named exports, no default export, no imports.
- [ ] Module-header JSDoc explains the threshold's purpose and cites WP-127 + D-9601 amendment.

### B) `CardDataTile.vue`

- [ ] `useCardSize` and `ABILITY_THRESHOLD_PX` are imported (verbatim paths: `../composables/useCardSize` and `../composables/cardTileThresholds`).
- [ ] `computed` is imported from `vue`.
- [ ] `const { cardSize } = useCardSize();` and `const showAbilityRow = computed(() => cardSize.value >= ABILITY_THRESHOLD_PX);` exist in `<script setup>`.
- [ ] `hasAbilityText(line: string): boolean` helper exists; body matches `CardDataDisplay.vue:53–59` byte-for-byte.
- [ ] A `Team` row is present in the template, wrapped in `<template v-if="showAbilityRow && card.team">`, label `Team`, body `{{ card.team }}`.
- [ ] The `Team` row is placed between the existing `Class` row and the `Cost` row.
- [ ] An `Ability` block is present beneath the `</dl>`, wrapped in `<div v-if="showAbilityRow && card.abilities && card.abilities.some(hasAbilityText)" class="ability-block">`, with title `Ability` and a `<ul class="ability-lines">` of `<li class="ability-line">` items.
- [ ] Each `<li>` body uses `<template v-if="hasAbilityText(abilityLine)">{{ abilityLine }}</template>`.
- [ ] Scoped CSS rules for `.ability-block`, `.ability-block-title`, `.ability-lines`, `.ability-line` exist with the documented palette.
- [ ] The `@media print` block is extended with rules for the four new classes.
- [ ] The seven existing labelled rows (`Type`, `Set`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`), their guard forms, and their existing CSS are byte-identical to the WP-096 baseline.

### C) `CardGrid.vue`

- [ ] `ABILITY_THRESHOLD_PX` is imported (verbatim path: `../composables/cardTileThresholds`).
- [ ] `<div class="img-wrap">` is bound with `:class="{ 'data-expanded': viewMode === 'data' && cardSize >= ABILITY_THRESHOLD_PX }"`.
- [ ] A new scoped CSS rule `.img-wrap.data-expanded { aspect-ratio: auto; }` exists, placed after the existing `.img-wrap` rule (line 128 of the WP-121 baseline).
- [ ] The existing `.img-wrap` rule (`position: relative; width: 100%; aspect-ratio: 3/4; background: #12121a; overflow: hidden;`) is byte-identical.
- [ ] The grid column track rule, the type-badge rule, the tile-info rule, and all `.tile-*` rules are byte-identical.

### D) Governance

- [ ] `docs/ai/DECISIONS.md` D-9601 entry has an amendment block appended (not a new D-NNN entry), dated `2026-05-02`, citing WP-127 + EC-129.
- [ ] The amendment documents the five points in §Scope (In) §D verbatim.

### Scope Enforcement

- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).
- [ ] No imports from `boardgame.io`, `@legendary-arena/{game-engine,preplan,server}`, `pg`, or `node:` built-ins in any new or modified file (confirmed with `Select-String`).
- [ ] No new npm dependencies; `pnpm-lock.yaml` is unchanged.

---

## Verification Steps

```pwsh
# Step 1 — typecheck after all changes
pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit
# Expected: exits 0, no TypeScript errors

# Step 2 — build
pnpm --filter registry-viewer build
# Expected: exits 0, no Vite errors

# Step 3 — confirm threshold constant defined exactly once
Select-String -Path "apps\registry-viewer\src" -Pattern "ABILITY_THRESHOLD_PX\s*=\s*190" -Recurse
# Expected: exactly one match, in cardTileThresholds.ts

# Step 4 — confirm no inline literal 190 in the threshold's consumer files
Select-String -Path "apps\registry-viewer\src\components\CardDataTile.vue" -Pattern "\b190\b"
Select-String -Path "apps\registry-viewer\src\components\CardGrid.vue" -Pattern "\b190\b"
# Expected: no output (both files import the constant, never inline the literal)

# Step 5 — confirm useCardSize.ts is unchanged
git diff -- apps/registry-viewer/src/composables/useCardSize.ts
# Expected: no output

# Step 6 — confirm forbidden imports are absent
Select-String -Path "apps\registry-viewer\src\composables\cardTileThresholds.ts" -Pattern "boardgame.io|@legendary-arena/(game-engine|preplan|server)|node:|pg"
Select-String -Path "apps\registry-viewer\src\components\CardDataTile.vue" -Pattern "boardgame.io|@legendary-arena/(game-engine|preplan|server)|node:|pg"
# Expected: no output (both files)

# Step 7 — confirm only expected files changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

**Manual smoke (all required, in order):**
1. Open the viewer in cards view, image mode, default zoom (130px). Tile layout is byte-identical to baseline.
2. Toggle to data mode at 130px. Tile layout is byte-identical to WP-096 baseline (seven rows, no team, no abilities, 3:4 aspect).
3. Drag the slider to 180px. Tile is still seven-row, no team, no abilities (below threshold).
4. Drag to 190px. Above-threshold tiles for cards with a team show the `Team` row; tiles with non-empty abilities show the `Ability` block. Tile height grows to fit content; tiles without ability text stay roughly 3:4.
5. Drag back to 180px. Team row + ability block disappear immediately. Tile reverts to 3:4 aspect.
6. Toggle to image mode at any slider value ≥ 190. Image tiles are 3:4 (no `data-expanded` class fires in image mode).
7. Reload page at slider 200. Tile state is preserved (slider persistence is WP-121's responsibility; this packet is read-only against `cardSize`).
8. Print preview at slider 200. White background, dark text, hairline border. `Team` row and ability bullets render in print palette.

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass.
- [ ] `pnpm --filter registry-viewer build` exits 0.
- [ ] `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` exits 0.
- [ ] All eight manual smoke steps pass.
- [ ] No `useCardSize.ts` modification (confirmed with `git diff`).
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).
- [ ] `docs/ai/STATUS.md` updated — registry viewer grid-tile data view now reveals `Team` + ability text above `cardSize.value >= 190`.
- [ ] `docs/ai/DECISIONS.md` D-9601 amendment block landed.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-127 row checked off with today's date and commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-129 row set to `Done <date>`.
