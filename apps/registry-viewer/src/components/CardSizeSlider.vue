<script setup lang="ts">
/**
 * CardSizeSlider.vue
 * Card-grid zoom control mounted in the cards-view filter bar.
 *
 * Renders a native <input type="range"> bound to the module-scoped
 * useCardSize composable. The native range input is keyboard-accessible
 * by default (Tab to focus, Left / Right arrows to step by
 * CARD_WIDTH_STEP_PX, Home / End for range bounds) — no pointer-event
 * handlers needed.
 *
 * The displayed value is the column min-width in pixels (not a card
 * count, not a percentage). The locked range (80–260) was chosen so that
 * .tile-name and .tile-meta remain legible at the minimum and the
 * largest tile fits without grid reflow on a 1024px viewport. See
 * useCardSize.ts for the canonical range constants and rationale.
 *
 * Mounted in App.vue's cards-view filter bar between the hero-class
 * <select> and the count <span>. Reads and writes the same composable
 * that CardGrid.vue reads to drive the --card-grid-min-width CSS
 * variable on .grid. No props, no emits.
 *
 * Locked under WP-121 / EC-122 / D-12101.
 */

import {
  useCardSize,
  MIN_CARD_WIDTH_PX,
  MAX_CARD_WIDTH_PX,
  CARD_WIDTH_STEP_PX,
} from "../composables/useCardSize";

const { cardSize, setCardSize } = useCardSize();

/**
 * Forwards the range input's @input event to the composable. Reads the
 * new value as a decimal integer; setCardSize clamps and persists.
 *
 * @param event - The input event from the native range control.
 */
function handleSliderInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  setCardSize(Number.parseInt(target.value, 10));
}
</script>

<template>
  <label class="card-size-slider">
    <span class="slider-label">Card Size</span>
    <input
      type="range"
      :min="MIN_CARD_WIDTH_PX"
      :max="MAX_CARD_WIDTH_PX"
      :step="CARD_WIDTH_STEP_PX"
      :value="cardSize"
      aria-label="Card grid size in pixels"
      @input="handleSliderInput"
    />
    <span class="slider-readout">{{ cardSize }}px</span>
  </label>
</template>

<style scoped>
.card-size-slider {
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

.card-size-slider input[type="range"] {
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
