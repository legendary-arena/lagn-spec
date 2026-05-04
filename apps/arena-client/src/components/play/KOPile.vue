<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIKoPileState } from '@legendary-arena/game-engine';

/**
 * Shared KO Pile leaf — face-up; cards KO'd by any player or card effect.
 * Single global pile (NOT per-player) per `DESIGN-BOARD-LAYOUT.md §7.1`.
 *
 * Renders the count + the top-card display + a click-to-browse affordance.
 * The browse modal itself is owned by the parent page-level SFC; this leaf
 * exposes a `data-testid` on the browse button so the parent's click
 * handler can intercept.
 *
 * @see WP-129 §Acceptance Criteria — Shared KO Pile rendering
 * @see DECISIONS.md D-12804 KO pile fully projected
 */
export default defineComponent({
  name: 'KOPile',
  props: {
    koPile: {
      type: Object as PropType<UIKoPileState>,
      required: true,
    },
  },
  setup() {
    return {};
  },
});
</script>

<template>
  <section
    class="ko-pile"
    data-testid="play-ko-pile"
    aria-label="KO Pile"
  >
    <header class="ko-pile__header">KO Pile</header>
    <p class="ko-pile__count" data-testid="play-ko-count">
      [{{ koPile.count }}]
    </p>
    <p
      v-if="koPile.topCard !== null"
      class="ko-pile__top"
      data-testid="play-ko-top"
    >
      Top: {{ koPile.topCard.display.name }}
    </p>
    <p v-else class="ko-pile__empty" data-testid="play-ko-empty">
      Empty.
    </p>
  </section>
</template>

<style scoped>
.ko-pile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
  min-width: 6rem;
}

.ko-pile__header {
  font-weight: 600;
}

.ko-pile__count {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.ko-pile__empty {
  margin: 0;
  font-style: italic;
  opacity: 0.7;
}
</style>
