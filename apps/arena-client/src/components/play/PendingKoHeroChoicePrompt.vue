<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import type { UIPendingKoHeroChoice } from '@legendary-arena/game-engine';
import type { SubmitMove } from './uiMoveName.types';

/**
 * Inline prompt for resolving a pending KO-a-Hero choice (WP-243).
 *
 * Renders iff `pendingKoHeroChoice !== undefined AND viewerPlayerId === playerID`.
 * Hidden for opponents and spectators. Displays eligible cards grouped by zone
 * (discard, hand, inPlay) in array index order.
 *
 * NOT a modal — the choice is game-blocking and cannot be dismissed.
 * NOT position:fixed. NOT <Teleport>. Renders in normal document flow.
 *
 * Per D-6512: uses `defineComponent({ setup() { return {...} } })`.
 *
 * @see WP-243 §Scope (In) — inline prompt spec
 * @see EC-274 Locked Values — move args, render formula, gate precedence
 * @see DECISIONS.md D-24010..D-24012
 */
export default defineComponent({
  name: 'PendingKoHeroChoicePrompt',
  props: {
    pendingKoHeroChoice: {
      type: Object as PropType<UIPendingKoHeroChoice | undefined>,
      required: false,
      default: undefined,
    },
    viewerPlayerId: {
      // why: null signals a spectator with no assigned playerId; prompt
      // must not render in that case.
      type: [String, null] as unknown as PropType<string | null>,
      required: true,
    },
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
  },
  setup(props) {
    const isSubmitting = ref(false);

    function shouldRender(): boolean {
      return (
        props.pendingKoHeroChoice !== undefined &&
        props.viewerPlayerId !== null &&
        props.viewerPlayerId === props.pendingKoHeroChoice.playerID
      );
    }

    function onSelectCard(zone: 'discard' | 'hand' | 'inPlay', cardId: string): void {
      if (isSubmitting.value) return;
      isSubmitting.value = true;
      props.submitMove('resolveKoHeroChoice', { zone, cardId });
    }

    function groupByZone() {
      if (!props.pendingKoHeroChoice) return {};
      const groups: Record<string, typeof props.pendingKoHeroChoice.eligible> = {};
      for (const entry of props.pendingKoHeroChoice.eligible) {
        if (!groups[entry.zone]) {
          groups[entry.zone] = [];
        }
        groups[entry.zone].push(entry);
      }
      return groups;
    }

    return {
      isSubmitting,
      shouldRender,
      onSelectCard,
      groupByZone,
    };
  },
});
</script>

<template>
  <div
    v-if="shouldRender()"
    class="pending-ko-hero-choice-prompt"
    data-testid="pending-ko-hero-choice-prompt"
    role="region"
    aria-label="KO hero choice"
  >
    <h3 class="pending-ko-hero-choice-prompt__heading">
      Choose a Hero to KO
      <span v-if="pendingKoHeroChoice!.remaining > 1" class="pending-ko-hero-choice-prompt__remaining">
        ({{ pendingKoHeroChoice!.remaining }} remaining)
      </span>
    </h3>
    <div class="pending-ko-hero-choice-prompt__zones">
      <div v-for="(zone, zoneKey) in groupByZone()" :key="zoneKey" class="pending-ko-hero-choice-prompt__zone">
        <h4 class="pending-ko-hero-choice-prompt__zone-label">
          From your {{ zoneKey }}
        </h4>
        <div class="pending-ko-hero-choice-prompt__cards">
          <button
            v-for="entry in zone"
            :key="`${entry.zone}:${entry.cardId}`"
            type="button"
            class="pending-ko-hero-choice-prompt__card-btn"
            :data-testid="`pending-ko-hero-choice-card-${entry.zone}-${entry.cardId}`"
            :disabled="isSubmitting"
            :aria-disabled="isSubmitting ? 'true' : undefined"
            :title="entry.display.name"
            @click="onSelectCard(entry.zone, entry.cardId)"
          >
            <span class="pending-ko-hero-choice-prompt__card-name">{{ entry.display.name }}</span>
            <img
              v-if="entry.display.imageUrl"
              :src="entry.display.imageUrl"
              :alt="entry.display.name"
              class="pending-ko-hero-choice-prompt__card-image"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pending-ko-hero-choice-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-foreground, #333);
  background: var(--color-background, #fff);
}

.pending-ko-hero-choice-prompt__heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.pending-ko-hero-choice-prompt__remaining {
  font-size: 0.85rem;
  font-weight: normal;
  color: var(--color-text-secondary, #666);
}

.pending-ko-hero-choice-prompt__zones {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.pending-ko-hero-choice-prompt__zone {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.pending-ko-hero-choice-prompt__zone-label {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 500;
  text-transform: capitalize;
}

.pending-ko-hero-choice-prompt__cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.pending-ko-hero-choice-prompt__card-btn {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.2rem;
  border: 1px solid var(--color-border, #ddd);
  background: var(--color-button-bg, #f5f5f5);
  cursor: pointer;
  align-items: flex-start;
}

.pending-ko-hero-choice-prompt__card-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pending-ko-hero-choice-prompt__card-name {
  font-size: 0.75rem;
  font-weight: 500;
  max-width: 60px;
}

.pending-ko-hero-choice-prompt__card-image {
  max-width: 60px;
  max-height: 60px;
  object-fit: contain;
}
</style>
