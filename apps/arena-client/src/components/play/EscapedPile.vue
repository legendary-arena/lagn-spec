<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Escaped Pile leaf — city row column 1 (far-left of Bridge per
 * `DESIGN-BOARD-LAYOUT.md §7.1`). Face-up destination for villains
 * pushed past the Bridge edge.
 *
 * SAFE-SKIP-WP128: `city.escapedPile` is `[]` until a future WP back-fills
 * `G.city.escapedPile`. Per WP-128 / D-12806 today only the counter
 * `G.counters[ESCAPED_VILLAINS]` increments; the card-identity-stable
 * pile is deferred. This leaf renders the empty count rather than stub
 * data.
 *
 * The aggregate count is also surfaced in `<TopHudBar>` via
 * `progress.escapedVillains`; this leaf shows the cell-local view used
 * by `<CityRow>` cell 0.
 *
 * @see WP-129 §Acceptance Criteria — Escaped Pile rendering
 * @see DESIGN-BOARD-LAYOUT.md §7.1 City row
 */
export default defineComponent({
  name: 'EscapedPile',
  props: {
    pile: {
      type: Array as PropType<readonly UIDisplayEntry[]>,
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
    class="escaped-pile"
    data-testid="play-escaped-pile"
    aria-label="Escaped Pile"
  >
    <header class="escaped-pile__header">Escaped</header>
    <p class="escaped-pile__count" data-testid="play-escaped-count">
      [{{ pile.length }}]
    </p>
    <p
      v-if="pile.length > 0"
      class="escaped-pile__top"
      data-testid="play-escaped-top"
    >
      {{ pile[pile.length - 1]!.display.name }}
    </p>
    <p v-else class="escaped-pile__empty" data-testid="play-escaped-empty">
      None escaped.
    </p>
  </section>
</template>

<style scoped>
.escaped-pile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--color-foreground, #999);
  min-width: 5rem;
}

.escaped-pile__header {
  font-weight: 600;
  font-size: 0.85rem;
}

.escaped-pile__count {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.escaped-pile__empty {
  margin: 0;
  font-style: italic;
  opacity: 0.7;
}
</style>
