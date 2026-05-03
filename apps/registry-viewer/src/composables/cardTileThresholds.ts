/**
 * cardTileThresholds.ts
 * Tile-content reveal thresholds for the registry-viewer grid tile.
 *
 * why: this constant gates the conditional reveal of the `Team` row and
 * the `Ability` block on `CardDataTile.vue`. Below the threshold, the
 * tile renders the byte-identical seven-row WP-096 baseline (no `Team`
 * row, no `Ability` block, 3:4 aspect-ratio lock). At or above the
 * threshold and only inside the data branch (`viewMode === 'data'`), the
 * tile reveals the two additional surfaces and `CardGrid.vue` drops the
 * 3:4 aspect-ratio lock on `.img-wrap` so the ability text can grow the
 * tile vertically without overflow.
 *
 * why 190: at the locked tile-width range [80, 260] under D-12101, 190px
 * is the threshold above which ability lines render with adequate
 * horizontal width for two-to-three plain-text bullet lines without
 * aggressive wrapping or overflow. Below 190px the box is too narrow to
 * accommodate token-heavy ability strings without truncation defenses
 * that produce unhelpful renderings; above 190px the box is wide enough
 * to fit the ability palette established on the sidebar at the locked
 * tile-scaled font sizes (0.55rem block title / 0.6rem ability line).
 *
 * why this module (not useCardSize.ts): D-12101 locks the public surface
 * of `useCardSize.ts` to exactly two names (`useCardSize`, `setCardSize`)
 * plus the four range constants (`MIN_CARD_WIDTH_PX`,
 * `MAX_CARD_WIDTH_PX`, `DEFAULT_CARD_WIDTH_PX`, `CARD_WIDTH_STEP_PX`).
 * Adding a fifth named export to that file would expand the locked
 * surface and require superseding D-12101. The threshold is also a
 * tile-content-gating concern (per-component reveal logic), not a
 * zoom-range concern (composable state), so coupling the two in one
 * module would conflate two unrelated decisions. A sibling single-export
 * module preserves D-12101 verbatim and keeps the threshold's purpose
 * narrowly scoped to tile-content gating.
 *
 * Citation: WP-127 + EC-129; D-9601 amendment (2026-05-02); D-12101
 * (locked `useCardSize.ts` surface, preserved verbatim).
 */

export const ABILITY_THRESHOLD_PX = 190;
