<script lang="ts">
import { defineComponent, toRaw, type PropType } from 'vue';
import type { UIKoPileState } from '@legendary-arena/game-engine';

/**
 * Shared KO Pile leaf — face-up; cards KO'd by any player or card effect.
 * Single global pile (NOT per-player) per `DESIGN-BOARD-LAYOUT.md §7.1`.
 *
 * Renders the count + the top-card display + a click-to-browse affordance.
 * The browse modal itself is owned by the parent page-level SFC; this leaf
 * emits `open` carrying a payload of `{ pileLabel, cards }` that the page
 * stores in its `activePile` ref and feeds to a single `<PileBrowseModal>`
 * mount.
 *
 * @see WP-129 §Acceptance Criteria — Shared KO Pile rendering
 * @see WP-171 §Acceptance Criteria — Pile Browse Modal (browse button + emit)
 * @see DECISIONS.md D-12804 KO pile fully projected, D-12805 UIDisplayEntry,
 *      D-16502 type-only engine import
 */
export default defineComponent({
  name: 'KOPile',
  props: {
    koPile: {
      type: Object as PropType<UIKoPileState>,
      required: true,
    },
  },
  emits: ['open'],
  setup(props, { emit }) {
    function onBrowse(): void {
      // why: WP-171 / EC-189 — emit the source `koPile.cards` array by JS
      // reference (no `.slice()`, no spread, no `Array.from`). Vue 3
      // wraps props in a deep-readonly proxy, so `props.koPile.cards`
      // is a proxy view of the engine's array, not the array itself.
      // `toRaw()` is the documented Vue API for revealing the underlying
      // reference — it is NOT a clone; the engine's original array
      // travels through the emit byte-stable, preserving the
      // order-preservation + referential-identity ACs.
      emit('open', {
        pileLabel: 'KO Pile',
        cards: toRaw(props.koPile).cards,
      });
    }
    return { onBrowse };
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
    <!-- why: WP-171 / EC-189 — browse button is rendered only when the pile
         has at least one card (`koPile.count > 0`); the affordance is
         meaningless for an empty pile, so hiding it prevents a useless
         click target. `type="button"` defends against future form-wrapping
         that would otherwise convert the click into a submit. -->
    <button
      v-if="koPile.count > 0"
      type="button"
      class="ko-pile__browse"
      data-testid="play-ko-browse"
      @click="onBrowse"
    >
      View all ▼
    </button>
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

.ko-pile__browse {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
}
</style>
