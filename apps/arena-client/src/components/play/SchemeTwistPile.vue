<script lang="ts">
import { defineComponent, toRaw, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Scheme Twist Pile leaf — face-up destination for resolved Scheme Twist
 * cards. Sits to the right of the Scheme tile per
 * `DESIGN-BOARD-LAYOUT.md §3.1`. WP-153 populated `G.scheme.twistPile` so
 * the array is no longer a constant safe-skip.
 *
 * Renders the count + the top-card display + a click-to-browse affordance.
 * The browse modal itself is owned by the parent page-level SFC; this leaf
 * emits `open` carrying `{ pileLabel, cards }` that the page stores in its
 * `activePile` ref and feeds to a single `<PileBrowseModal>` mount.
 *
 * @see WP-129 §Acceptance Criteria — Scheme Twist Pile rendering
 * @see WP-171 §Acceptance Criteria — Pile Browse Modal (browse button + emit)
 * @see DESIGN-BOARD-LAYOUT.md §3.1 (desktop) and §3.2 (mobile)
 * @see DECISIONS.md D-12805 UIDisplayEntry shape, D-16502 type-only engine import
 */
export default defineComponent({
  name: 'SchemeTwistPile',
  props: {
    pile: {
      type: Array as PropType<readonly UIDisplayEntry[]>,
      required: true,
    },
  },
  emits: ['open'],
  setup(props, { emit }) {
    function onBrowse(): void {
      // why: WP-171 / EC-189 — emit the source `pile` array by JS reference
      // (no `.slice()`, no spread, no `Array.from`). Vue 3 wraps props in
      // a deep-readonly proxy, so `props.pile` is a proxy view of the
      // engine's array, not the array itself. `toRaw()` is the documented
      // Vue API for revealing the underlying reference — it is NOT a
      // clone; the engine's original array travels through the emit
      // byte-stable, preserving the order-preservation +
      // referential-identity ACs.
      emit('open', {
        pileLabel: 'Scheme Twist Pile',
        cards: toRaw(props.pile),
      });
    }
    return { onBrowse };
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
    <!-- why: WP-171 / EC-189 — browse button is rendered only when the pile
         has at least one card (`pile.length > 0`); the affordance is
         meaningless for an empty pile, so hiding it prevents a useless
         click target. `type="button"` defends against future form-wrapping
         that would otherwise convert the click into a submit. -->
    <button
      v-if="pile.length > 0"
      type="button"
      class="scheme-twist-pile__browse"
      data-testid="play-scheme-twist-browse"
      @click="onBrowse"
    >
      View all ▼
    </button>
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

.scheme-twist-pile__browse {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
}
</style>
