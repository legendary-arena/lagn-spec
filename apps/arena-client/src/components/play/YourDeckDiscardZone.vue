<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Your deck + discard zone — renders the active player's deck count
 * (face-down annotation; top card NEVER visible per `DESIGN-BOARD-LAYOUT.md
 * §7.1`) and the discard top card (face-up via `discardTopCard`).
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer so it MUST use `defineComponent({ setup() { return {...} } })`
 * per P6-30 / P6-46 / D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Your Deck/Discard zone
 * @see DESIGN-BOARD-LAYOUT.md §7.1 Your Deck face-down / Discard face-up
 */
export default defineComponent({
  name: 'YourDeckDiscardZone',
  props: {
    deckCount: {
      type: Number,
      required: true,
    },
    discardCount: {
      type: Number,
      required: true,
    },
    /**
     * Top of this player's discard pile. `null` when discardCount === 0;
     * `undefined` when redacted by the audience filter (rare for the
     * own-player surface but the type is shipped that way per WP-128).
     */
    discardTopCard: {
      type: Object as PropType<UIDisplayEntry | null | undefined>,
      required: false,
      default: null,
    },
  },
  setup() {
    return {};
  },
});
</script>

<template>
  <section
    class="your-deck-discard"
    data-testid="play-your-deck-discard"
    aria-label="Your Deck and Discard"
  >
    <div class="your-deck-discard__deck" data-testid="play-your-deck">
      <header>Your Deck</header>
      <p class="your-deck-discard__count">[{{ deckCount }} — face-down]</p>
      <p class="your-deck-discard__note">
        Top card NEVER visible to any audience.
      </p>
    </div>
    <div class="your-deck-discard__discard" data-testid="play-your-discard">
      <header>Your Discard</header>
      <p class="your-deck-discard__count">[{{ discardCount }} — face-up]</p>
      <p
        v-if="discardTopCard !== null && discardTopCard !== undefined"
        class="your-deck-discard__top"
        data-testid="play-your-discard-top"
      >
        Top: {{ discardTopCard.display.name }}
      </p>
      <p
        v-else
        class="your-deck-discard__empty"
        data-testid="play-your-discard-empty"
      >
        Empty.
      </p>
    </div>
  </section>
</template>

<style scoped>
.your-deck-discard {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
}

.your-deck-discard__deck,
.your-deck-discard__discard {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.your-deck-discard__count {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.your-deck-discard__note,
.your-deck-discard__empty {
  margin: 0;
  font-style: italic;
  opacity: 0.7;
  font-size: 0.85rem;
}
</style>
