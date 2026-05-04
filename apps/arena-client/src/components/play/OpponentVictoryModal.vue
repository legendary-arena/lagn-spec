<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Opponent victory-pile drill-down modal.
 *
 * Vue 3 Teleport target keeps the modal above sticky zones in the mobile
 * portrait layout. Per D-12803 (WP-128) victory cards are public knowledge
 * and NOT redacted by the audience filter — the active player can browse
 * any opponent's full victory-pile contents at any time.
 *
 * Shown / hidden by parent state; this leaf is a pure presentational
 * component. Open / close events bubble through the parent's `@click`
 * binding on the Teleport-rendered backdrop.
 *
 * @see WP-129 §Acceptance Criteria — Opponent victory drill-down
 * @see DECISIONS.md D-12803 victoryCards visible to all audiences
 */
export default defineComponent({
  name: 'OpponentVictoryModal',
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    opponentLabel: {
      type: String,
      required: true,
    },
    victoryCards: {
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
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="opponent-victory-modal"
      data-testid="play-opponent-victory-modal"
      role="dialog"
      :aria-label="`${opponentLabel} victory pile`"
    >
      <div class="opponent-victory-modal__panel">
        <header class="opponent-victory-modal__header">
          <span>{{ opponentLabel }} — Victory Pile ({{ victoryCards.length }})</span>
        </header>
        <ul
          v-if="victoryCards.length > 0"
          class="opponent-victory-modal__list"
          data-testid="play-opponent-victory-list"
        >
          <li
            v-for="entry in victoryCards"
            :key="entry.extId"
            class="opponent-victory-modal__entry"
          >
            {{ entry.display.name }}
          </li>
        </ul>
        <p
          v-else
          class="opponent-victory-modal__empty"
          data-testid="play-opponent-victory-empty"
        >
          No victories yet.
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.opponent-victory-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.opponent-victory-modal__panel {
  background: var(--color-background, #fff);
  padding: 1rem 1.25rem;
  min-width: 18rem;
  max-width: 80vw;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--color-foreground, #999);
}

.opponent-victory-modal__list {
  list-style: none;
  margin: 0.5rem 0 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>
