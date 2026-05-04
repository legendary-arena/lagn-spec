<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';
import { useVictoryPileComposition } from '../../composables/useVictoryPileComposition';

/**
 * Your victory pile — renders the active player's
 * `players[ownIndex].{victoryCards, victoryVP}` plus composition counters
 * derived via {@link useVictoryPileComposition} per D-12906.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer that USES a composable, so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Your Victory Pile composition
 * @see DESIGN-BOARD-LAYOUT.md §3.1 YOUR VICTORY PILE
 * @see DECISIONS.md D-12906 composition counter discovery
 */
export default defineComponent({
  name: 'YourVictoryPile',
  props: {
    victoryCards: {
      type: Array as PropType<readonly UIDisplayEntry[]>,
      required: false,
      default: () => [],
    },
    victoryVP: {
      type: Number,
      required: false,
      default: 0,
    },
  },
  setup(props) {
    function buildComposition(): ReturnType<typeof useVictoryPileComposition> {
      // why: D-12906 — derive from card effects in the loaded scenario
      // via the prefix-heuristic in `useVictoryPileComposition`. The
      // composable's contract is stable; only its internals graduate
      // to a metadata file when WP-130 lands.
      return useVictoryPileComposition([...props.victoryCards]);
    }

    return { buildComposition };
  },
});
</script>

<template>
  <section
    class="your-victory-pile"
    data-testid="play-your-victory-pile"
    aria-label="Your Victory Pile"
  >
    <header class="your-victory-pile__header">
      Your Victory Pile —
      <span data-testid="play-your-victory-count">{{ victoryCards.length }} cards</span> /
      <span data-testid="play-your-victory-vp">{{ victoryVP }} VP</span>
    </header>
    <ol
      v-if="victoryCards.length > 0"
      class="your-victory-pile__list"
      data-testid="play-your-victory-list"
    >
      <li
        v-for="entry in victoryCards"
        :key="entry.extId"
        class="your-victory-pile__entry"
      >
        {{ entry.display.name }}
      </li>
    </ol>
    <p v-else class="your-victory-pile__empty" data-testid="play-your-victory-empty">
      No victories yet.
    </p>
    <dl class="your-victory-pile__composition" data-testid="play-your-victory-composition">
      <div>
        <dt>Bystanders rescued</dt>
        <dd data-testid="play-victory-bystanders">{{ buildComposition().bystandersRescued }}</dd>
      </div>
      <div>
        <dt>Villains defeated</dt>
        <dd data-testid="play-victory-villains">{{ buildComposition().villainsDefeated }}</dd>
      </div>
      <div>
        <dt>Henchmen defeated</dt>
        <dd data-testid="play-victory-henchmen">{{ buildComposition().henchmenDefeated }}</dd>
      </div>
      <div>
        <dt>Mastermind cards</dt>
        <dd data-testid="play-victory-mastermind">{{ buildComposition().mastermindCards }}</dd>
      </div>
      <div>
        <dt>Wounds in pile</dt>
        <dd data-testid="play-victory-wounds">{{ buildComposition().woundsInPile }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.your-victory-pile {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
}

.your-victory-pile__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.your-victory-pile__composition {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.your-victory-pile__composition div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.your-victory-pile__composition dt,
.your-victory-pile__composition dd {
  margin: 0;
}
</style>
