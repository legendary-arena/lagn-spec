<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import type { UIPlayerState } from '@legendary-arena/game-engine';
import OpponentVictoryModal from './OpponentVictoryModal.vue';

/**
 * Per-opponent panel — renders one entry from `players[i]` for
 * `i !== ownIndex`. Counts only (per WP-029 audience filter); click
 * `Victory: N ▼` opens `<OpponentVictoryModal>` revealing the
 * opponent's full victory pile (per D-12803 victory cards are public).
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer with computed state (modal open/close) so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Opponent panel rendering
 * @see DESIGN-BOARD-LAYOUT.md §3.1 OPPONENT PANELS (desktop)
 * @see DECISIONS.md D-12803 victoryCards public knowledge
 */
export default defineComponent({
  name: 'OpponentPanel',
  components: { OpponentVictoryModal },
  props: {
    player: {
      type: Object as PropType<UIPlayerState>,
      required: true,
    },
  },
  setup() {
    const isModalOpen = ref<boolean>(false);

    function openModal(): void {
      isModalOpen.value = true;
    }

    function closeModal(): void {
      isModalOpen.value = false;
    }

    return { isModalOpen, openModal, closeModal };
  },
});
</script>

<template>
  <article
    class="opponent-panel"
    data-testid="play-opponent-panel"
    :data-player-id="player.playerId"
  >
    <header class="opponent-panel__header">{{ player.playerId }}</header>
    <p class="opponent-panel__counts">
      <span data-testid="play-opponent-hand">Hand: {{ player.handCount }}</span>
      <span data-testid="play-opponent-deck">Deck: {{ player.deckCount }}</span>
      <span data-testid="play-opponent-discard">Discard: {{ player.discardCount }}</span>
      <span data-testid="play-opponent-in-play">In-play: {{ player.inPlayCount }}</span>
    </p>
    <button
      type="button"
      class="opponent-panel__victory-button"
      data-testid="play-opponent-victory-button"
      @click="openModal"
    >
      Victory: {{ player.victoryCount }} ▼
      <span v-if="player.victoryVP !== undefined" class="opponent-panel__vp">
        ({{ player.victoryVP }} VP)
      </span>
    </button>
    <button
      v-if="isModalOpen"
      type="button"
      class="opponent-panel__close-backdrop"
      data-testid="play-opponent-victory-close"
      aria-label="Close victory pile"
      @click="closeModal"
    >
      Close
    </button>
    <OpponentVictoryModal
      :is-open="isModalOpen"
      :opponent-label="player.playerId"
      :victory-cards="player.victoryCards ?? []"
    />
  </article>
</template>

<style scoped>
.opponent-panel {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
  min-width: 12rem;
}

.opponent-panel__header {
  font-weight: 600;
}

.opponent-panel__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
  margin: 0;
}

.opponent-panel__victory-button {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
}
</style>
