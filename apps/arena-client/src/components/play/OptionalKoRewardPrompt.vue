<script lang="ts">
import { defineComponent, ref, watch, type PropType } from "vue";
import type { UIPendingOptionalKoReward } from "@legendary-arena/game-engine";
import type { SubmitMove } from "./uiMoveName.types";

/**
 * Inline prompt for resolving a pending optional-KO-then-reward choice
 * (WP-249 / D-24020).
 *
 * Renders iff `pendingOptionalKoReward !== undefined AND viewerPlayerId === playerID`.
 * Hidden for opponents and spectators. Shows the derived reward label, then the
 * eligible hand and discard cards (zone-labeled, in projection order) plus a
 * first-class **Decline** button.
 *
 * Selecting a card submits `resolveOptionalKoReward({ zone, cardId })`; Decline
 * submits `resolveOptionalKoReward({ decline: true })`.
 *
 * // why: D-24020 — NON-DISMISSIBLE while the choice is pending. The choice is
 * game-blocking (WP-248's block-all guard freezes turn-end until it resolves);
 * the only exits are KOing a card or pressing Decline. NOT a modal, NOT
 * position:fixed, NOT <Teleport> — renders in normal document flow above
 * TurnActionBar, mirroring PendingKoHeroChoicePrompt.
 *
 * Per D-6512: uses `defineComponent({ setup() { return {...} } })`.
 *
 * @see WP-249 §Scope (In) — inline prompt spec
 * @see EC-280 Locked Values — move args, round-trip rule, double-submit guard
 * @see DECISIONS.md D-24020
 */
export default defineComponent({
  name: "OptionalKoRewardPrompt",
  props: {
    pendingOptionalKoReward: {
      type: Object as PropType<UIPendingOptionalKoReward | undefined>,
      required: false,
      default: undefined,
    },
    viewerPlayerId: {
      // why: null signals a spectator with no assigned playerId; the prompt
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
    // why: isSubmitting debounces the controls after a submit so the prompt
    // never fires resolveOptionalKoReward twice for one choice. It must clear on
    // every new server frame: the parent page keeps this component mounted for
    // the whole match (only the inner v-if content toggles), so a persistent
    // latch would freeze the controls for the rest of the match. Each server
    // frame delivers a fresh pendingOptionalKoReward object; resetting on its
    // identity change re-enables the controls for the next choice and recovers
    // from a no-op resubmit. (A stale resubmit is engine-no-op'd, but the client
    // must not fire it twice.)
    const isSubmitting = ref(false);
    watch(
      () => props.pendingOptionalKoReward,
      () => {
        isSubmitting.value = false;
      },
    );

    function shouldRender(): boolean {
      return (
        props.pendingOptionalKoReward !== undefined &&
        props.viewerPlayerId !== null &&
        props.viewerPlayerId === props.pendingOptionalKoReward.playerID
      );
    }

    function onSelectCard(zone: "discard" | "hand" | "inPlay", cardId: string): void {
      if (isSubmitting.value) return;
      isSubmitting.value = true;
      props.submitMove("resolveOptionalKoReward", { zone, cardId });
    }

    function onDecline(): void {
      if (isSubmitting.value) return;
      isSubmitting.value = true;
      props.submitMove("resolveOptionalKoReward", { decline: true });
    }

    return {
      isSubmitting,
      shouldRender,
      onSelectCard,
      onDecline,
    };
  },
});
</script>

<template>
  <div
    v-if="shouldRender()"
    class="optional-ko-reward-prompt"
    data-testid="optional-ko-reward-prompt"
    role="region"
    aria-label="Optional KO for reward choice"
  >
    <h3 class="optional-ko-reward-prompt__heading">
      KO a card for a reward
      <span class="optional-ko-reward-prompt__reward">
        ({{ pendingOptionalKoReward!.rewardLabel }})
      </span>
    </h3>
    <div
      v-if="pendingOptionalKoReward!.eligibleHand.length > 0"
      class="optional-ko-reward-prompt__zone"
    >
      <h4 class="optional-ko-reward-prompt__zone-label">From your hand</h4>
      <div class="optional-ko-reward-prompt__cards">
        <button
          v-for="entry in pendingOptionalKoReward!.eligibleHand"
          :key="`${entry.zone}:${entry.cardId}`"
          type="button"
          class="optional-ko-reward-prompt__card-btn"
          :data-testid="`optional-ko-reward-card-${entry.zone}-${entry.cardId}`"
          :disabled="isSubmitting"
          :aria-disabled="isSubmitting ? 'true' : undefined"
          :title="entry.display.name"
          @click="onSelectCard(entry.zone, entry.cardId)"
        >
          <span class="optional-ko-reward-prompt__card-name">{{
            entry.display.name
          }}</span>
          <img
            v-if="entry.display.imageUrl"
            :src="entry.display.imageUrl"
            :alt="entry.display.name"
            class="optional-ko-reward-prompt__card-image"
          />
        </button>
      </div>
    </div>
    <div
      v-if="pendingOptionalKoReward!.eligibleDiscard.length > 0"
      class="optional-ko-reward-prompt__zone"
    >
      <h4 class="optional-ko-reward-prompt__zone-label">From your discard</h4>
      <div class="optional-ko-reward-prompt__cards">
        <button
          v-for="entry in pendingOptionalKoReward!.eligibleDiscard"
          :key="`${entry.zone}:${entry.cardId}`"
          type="button"
          class="optional-ko-reward-prompt__card-btn"
          :data-testid="`optional-ko-reward-card-${entry.zone}-${entry.cardId}`"
          :disabled="isSubmitting"
          :aria-disabled="isSubmitting ? 'true' : undefined"
          :title="entry.display.name"
          @click="onSelectCard(entry.zone, entry.cardId)"
        >
          <span class="optional-ko-reward-prompt__card-name">{{
            entry.display.name
          }}</span>
          <img
            v-if="entry.display.imageUrl"
            :src="entry.display.imageUrl"
            :alt="entry.display.name"
            class="optional-ko-reward-prompt__card-image"
          />
        </button>
      </div>
    </div>
    <button
      type="button"
      class="optional-ko-reward-prompt__decline-btn"
      data-testid="optional-ko-reward-decline"
      :disabled="isSubmitting"
      :aria-disabled="isSubmitting ? 'true' : undefined"
      @click="onDecline"
    >
      Decline
    </button>
  </div>
</template>

<style scoped>
.optional-ko-reward-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-foreground, #333);
  background: var(--color-background, #fff);
}

.optional-ko-reward-prompt__heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.optional-ko-reward-prompt__reward {
  font-size: 0.85rem;
  font-weight: normal;
  color: var(--color-text-secondary, #666);
}

.optional-ko-reward-prompt__zone {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.optional-ko-reward-prompt__zone-label {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 500;
  text-transform: capitalize;
}

.optional-ko-reward-prompt__cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.optional-ko-reward-prompt__card-btn {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.2rem;
  border: 1px solid var(--color-border, #ddd);
  background: var(--color-button-bg, #f5f5f5);
  cursor: pointer;
  align-items: flex-start;
}

.optional-ko-reward-prompt__card-btn:disabled,
.optional-ko-reward-prompt__decline-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.optional-ko-reward-prompt__card-name {
  font-size: 0.75rem;
  font-weight: 500;
  max-width: 60px;
}

.optional-ko-reward-prompt__card-image {
  max-width: 60px;
  max-height: 60px;
  object-fit: contain;
}

.optional-ko-reward-prompt__decline-btn {
  align-self: flex-start;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--color-border, #ddd);
  background: var(--color-button-bg, #f5f5f5);
  cursor: pointer;
  font-size: 0.8rem;
}
</style>
