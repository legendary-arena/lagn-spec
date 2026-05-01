<script setup lang="ts">
/**
 * ThemeSizeSlider.vue
 * Theme-grid zoom control mounted in the themes-view filter bar.
 *
 * Renders a native <input type="range"> bound to the module-scoped
 * useThemeSize composable. The native range input is keyboard-accessible
 * by default (Tab to focus, Left / Right arrows to step by
 * THEME_WIDTH_STEP_PX, Home / End for range bounds) — no pointer-event
 * handlers needed.
 *
 * The displayed value is the column min-width in pixels (not a tile
 * count, not a percentage). The locked range (80–260) was chosen so that
 * .tile-name and .tile-mastermind remain legible at the minimum and the
 * largest tile fits without grid reflow on a 1024px viewport. See
 * useThemeSize.ts for the canonical range constants and rationale.
 *
 * Mounted in App.vue's themes-view filter bar between the themes search
 * <input> and the count <span>. Reads and writes the same composable
 * that ThemeGrid.vue reads to drive the --theme-grid-min-width CSS
 * variable on .grid. No props, no emits.
 *
 * This file is a duplicate of CardSizeSlider.vue per the *duplicate first*
 * rule (.claude/rules/code-style.md §"Abstraction & Control Flow"). With
 * two copies in the codebase post-WP-124, any future abstraction is
 * deferred to a third zoom-slider WP per D-12401.
 *
 * Locked under WP-124 / EC-126 / D-12401.
 */

import {
  useThemeSize,
  MIN_THEME_WIDTH_PX,
  MAX_THEME_WIDTH_PX,
  THEME_WIDTH_STEP_PX,
} from "../composables/useThemeSize";

const { themeSize, setThemeSize } = useThemeSize();

/**
 * Forwards the range input's @input event to the composable. Reads the
 * new value as a decimal integer; setThemeSize clamps and persists.
 *
 * @param event - The input event from the native range control.
 */
function handleSliderInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  setThemeSize(Number.parseInt(target.value, 10));
}
</script>

<template>
  <label class="theme-size-slider">
    <span class="slider-label">Theme Size</span>
    <input
      type="range"
      :min="MIN_THEME_WIDTH_PX"
      :max="MAX_THEME_WIDTH_PX"
      :step="THEME_WIDTH_STEP_PX"
      :value="themeSize"
      aria-label="Theme grid size in pixels"
      @input="handleSliderInput"
    />
    <span class="slider-readout">{{ themeSize }}px</span>
  </label>
</template>

<style scoped>
.theme-size-slider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #c8c8e0;
  white-space: nowrap;
  cursor: pointer;
}

.slider-label {
  font-size: 0.78rem;
  color: #8888aa;
}

.theme-size-slider input[type="range"] {
  width: 120px;
  cursor: pointer;
}

.slider-readout {
  font-size: 0.75rem;
  color: #6666aa;
  font-variant-numeric: tabular-nums;
  min-width: 3.2rem;
  text-align: right;
}
</style>
