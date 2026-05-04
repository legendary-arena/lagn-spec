<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Master Strike Pile leaf — face-up destination for resolved Master
 * Strike cards. Sits to the right of the Mastermind tile per
 * `DESIGN-BOARD-LAYOUT.md §3.1`.
 *
 * SAFE-SKIP-WP128: `mastermind.strikePile` is `[]` until a future WP
 * back-fills `G.mastermind.strikePile` so resolved Master Strike cards
 * are preserved for replay (today they live in `G.villainDeck.discard`).
 * Per WP-128 / D-12806 the field ships as a constant empty array — this
 * leaf renders the empty count rather than stub data.
 *
 * @see WP-129 §Acceptance Criteria — Master Strike Pile rendering
 * @see DESIGN-BOARD-LAYOUT.md §3.1 (desktop) and §3.2 (mobile)
 */
export default defineComponent({
  name: 'MasterStrikePile',
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
    class="master-strike-pile"
    data-testid="play-master-strike-pile"
    aria-label="Master Strike Pile"
  >
    <header class="master-strike-pile__header">Master Strike Pile</header>
    <p class="master-strike-pile__count" data-testid="play-master-strike-count">
      [{{ pile.length }}]
    </p>
    <p
      v-if="pile.length > 0"
      class="master-strike-pile__top"
      data-testid="play-master-strike-top"
    >
      Top: {{ pile[pile.length - 1]!.display.name }}
    </p>
    <p v-else class="master-strike-pile__empty" data-testid="play-master-strike-empty">
      No strikes yet.
    </p>
  </section>
</template>

<style scoped>
.master-strike-pile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
  min-width: 6rem;
}

.master-strike-pile__header {
  font-weight: 600;
}

.master-strike-pile__count {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.master-strike-pile__empty {
  margin: 0;
  font-style: italic;
  opacity: 0.7;
}
</style>
