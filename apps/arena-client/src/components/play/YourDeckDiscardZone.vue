<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import type { UIDisplayEntry, UICardDisplay } from '@legendary-arena/game-engine';
import CardTile from './CardTile.vue';

/**
 * Your deck + discard zone — renders the active player's deck count
 * (face-down annotation; top card NEVER visible per `DESIGN-BOARD-LAYOUT.md
 * §7.1`) and the discard top card (face-up via `discardTopCard`). Per WP-243,
 * adds an expandable "View all (N)" toggle that lists full discard contents.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer so it MUST use `defineComponent({ setup() { return {...} } })`
 * per P6-30 / P6-46 / D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Your Deck/Discard zone
 * @see WP-243 §Scope (In) — expandable full-discard view
 * @see DESIGN-BOARD-LAYOUT.md §7.1 Your Deck face-down / Discard face-up
 */
export default defineComponent({
  name: 'YourDeckDiscardZone',
  components: { CardTile },
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
    /**
     * Full discard card ext_ids for the own player. Present when own player,
     * undefined when redacted for opponents/spectators (WP-243 / D-24010).
     */
    discardCards: {
      type: Array as PropType<string[] | undefined>,
      required: false,
      default: undefined,
    },
    /**
     * Per-discard-card display data, parallel-aligned with discardCards
     * (WP-243 / D-24010).
     */
    discardDisplay: {
      type: Array as PropType<UICardDisplay[] | undefined>,
      required: false,
      default: undefined,
    },
  },
  setup() {
    const isExpanded = ref(false);
    return { isExpanded };
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
      <div
        v-if="discardTopCard !== null && discardTopCard !== undefined"
        class="your-deck-discard__top"
        data-testid="play-your-discard-top"
      >
        <CardTile :display="discardTopCard.display" size="sm" :show-cost="false" />
        <span class="your-deck-discard__top-label">{{ discardTopCard.display.name }}</span>
      </div>
      <p
        v-else
        class="your-deck-discard__empty"
        data-testid="play-your-discard-empty"
      >
        Empty.
      </p>
      <button
        v-if="discardCards && discardCards.length > 0"
        type="button"
        class="your-deck-discard__expand-btn"
        data-testid="play-your-discard-expand"
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? 'Hide all' : `View all (${discardCount})` }}
      </button>
      <div
        v-if="isExpanded && discardCards && discardDisplay"
        class="your-deck-discard__all-cards"
        data-testid="play-your-discard-all"
      >
        <div v-for="(cardId, index) in discardCards" :key="index" class="your-deck-discard__card-item">
          <CardTile
            v-if="discardDisplay[index]"
            :display="discardDisplay[index]"
            size="xs"
            :show-cost="false"
          />
        </div>
      </div>
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

.your-deck-discard__top {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.your-deck-discard__top-label {
  font-size: 0.75rem;
  font-weight: 500;
}

.your-deck-discard__expand-btn {
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  background: var(--color-button-bg, #f5f5f5);
  border: 1px solid var(--color-border, #ddd);
  cursor: pointer;
}

.your-deck-discard__expand-btn:hover {
  background: var(--color-button-hover, #efefef);
}

.your-deck-discard__all-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.3rem;
}

.your-deck-discard__card-item {
  display: flex;
}
</style>
