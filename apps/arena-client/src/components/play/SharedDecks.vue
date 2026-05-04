<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UISharedPilesState } from '@legendary-arena/game-engine';

/**
 * Shared Decks leaf — renders the 5 face-down deck cells per
 * `DESIGN-BOARD-LAYOUT.md §7.1` locked column order:
 *   `Wounds | Horrors | Bystanders | S.H.I.E.L.D. Officers | Sidekicks`.
 *
 * All five deck cells render as count-with-deck-icon per D-12905
 * (number-with-deck-icon at MVP; theme-overridable per WP-130). Top
 * cards are NEVER visible — these are face-down source pools.
 *
 * @see WP-129 §Acceptance Criteria — Shared Decks 5-cell row
 * @see DESIGN-BOARD-LAYOUT.md §7.1 Shared Decks
 * @see DECISIONS.md D-12905 card-back representation
 */
export default defineComponent({
  name: 'SharedDecks',
  props: {
    piles: {
      type: Object as PropType<UISharedPilesState>,
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
    class="shared-decks"
    data-testid="play-shared-decks"
    aria-label="Shared Decks"
  >
    <ol class="shared-decks__row">
      <li class="shared-decks__cell" data-testid="play-shared-deck-wounds">
        <span class="shared-decks__name">Wounds</span>
        <span class="shared-decks__count">[{{ piles.woundsCount }}]</span>
      </li>
      <li class="shared-decks__cell" data-testid="play-shared-deck-horrors">
        <span class="shared-decks__name">Horrors</span>
        <span class="shared-decks__count">[{{ piles.horrorsCount }}]</span>
      </li>
      <li class="shared-decks__cell" data-testid="play-shared-deck-bystanders">
        <span class="shared-decks__name">Bystanders</span>
        <span class="shared-decks__count">[{{ piles.bystandersCount }}]</span>
      </li>
      <li class="shared-decks__cell" data-testid="play-shared-deck-officers">
        <span class="shared-decks__name">S.H.I.E.L.D. Officers</span>
        <span class="shared-decks__count">[{{ piles.officersCount }}]</span>
      </li>
      <li class="shared-decks__cell" data-testid="play-shared-deck-sidekicks">
        <span class="shared-decks__name">Sidekicks</span>
        <span class="shared-decks__count">[{{ piles.sidekicksCount }}]</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.shared-decks__row {
  display: flex;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.shared-decks__cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
  min-width: 5rem;
}

.shared-decks__name {
  font-size: 0.85rem;
}

.shared-decks__count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
