<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Scheme Twist Pile leaf — face-up destination for resolved Scheme Twist
 * cards. Sits to the right of the Scheme tile per
 * `DESIGN-BOARD-LAYOUT.md §3.1`.
 *
 * SAFE-SKIP-WP128: `scheme.twistPile` is `[]` until a future WP back-fills
 * `G.scheme.twistPile` so resolved Scheme Twist cards are preserved for
 * replay (today the count alone is derived from `villainDeck.discard`).
 * Per WP-128 / D-12806 the field ships as a constant empty array — this
 * leaf renders the empty count rather than stub data.
 *
 * @see WP-129 §Acceptance Criteria — Scheme Twist Pile rendering
 * @see DESIGN-BOARD-LAYOUT.md §3.1 (desktop) and §3.2 (mobile)
 */
export default defineComponent({
  name: 'SchemeTwistPile',
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
    class="scheme-twist-pile"
    data-testid="play-scheme-twist-pile"
    aria-label="Scheme Twist Pile"
  >
    <header class="scheme-twist-pile__header">Scheme Twist Pile</header>
    <p class="scheme-twist-pile__count" data-testid="play-scheme-twist-count">
      [{{ pile.length }}]
    </p>
    <p
      v-if="pile.length > 0"
      class="scheme-twist-pile__top"
      data-testid="play-scheme-twist-top"
    >
      Top: {{ pile[pile.length - 1]!.display.name }}
    </p>
    <p v-else class="scheme-twist-pile__empty" data-testid="play-scheme-twist-empty">
      No twists resolved.
    </p>
  </section>
</template>

<style scoped>
.scheme-twist-pile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
  min-width: 6rem;
}

.scheme-twist-pile__header {
  font-weight: 600;
}

.scheme-twist-pile__count {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.scheme-twist-pile__empty {
  margin: 0;
  font-style: italic;
  opacity: 0.7;
}
</style>
