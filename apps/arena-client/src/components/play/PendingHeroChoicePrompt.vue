<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import type { UIPendingHeroChoice } from '@legendary-arena/game-engine';
import type { SubmitMove } from './uiMoveName.types';

/**
 * Inline prompt for resolving a pending hero reveal choice (WP-222).
 *
 * Renders iff `pendingHeroChoice !== undefined AND viewerPlayerId === playerID`.
 * Hidden for opponents and spectators.
 *
 * NOT a modal — the choice is game-blocking and cannot be dismissed.
 * NOT position:fixed. NOT <Teleport>. Renders in normal document flow.
 *
 * Per the EC-254 SFC authoring rule: this is a tested non-leaf component
 * that uses local state — MUST use `defineComponent({ setup() { return {...} } })`
 * per D-6512.
 *
 * @see WP-222 §Scope (In) — inline prompt spec
 * @see EC-254 Locked Values — button text, move args, rendering formula
 * @see DECISIONS.md D-22201..D-22203
 */
export default defineComponent({
  name: 'PendingHeroChoicePrompt',
  props: {
    pendingHeroChoice: {
      type: Object as PropType<UIPendingHeroChoice | undefined>,
      required: false,
      default: undefined,
    },
    viewerPlayerId: {
      // why: null signals a spectator or rewound-autoplay viewer with no
      // assigned playerId; the prompt must not render in that case.
      type: [String, null] as unknown as PropType<string | null>,
      required: true,
    },
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
  },
  setup(props) {
    // why: double-submit prevention — set true on first button click; both
    // buttons remain disabled until the component unmounts (the engine clears
    // pendingHeroChoice on the next server frame, unmounting the prompt).
    // Only one resolveHeroChoice move per prompt instance (EC-254).
    const isSubmitting = ref(false);

    function shouldRender(): boolean {
      return (
        props.pendingHeroChoice !== undefined &&
        props.viewerPlayerId !== null &&
        props.viewerPlayerId === props.pendingHeroChoice.playerID
      );
    }

    function onDiscard(): void {
      if (isSubmitting.value) return;
      isSubmitting.value = true;
      // why: WP-220 — resolution 'discard' moves the revealed card from
      // deck[0] to the player's discard pile. resolveHeroChoice is
      // client:false (server-only); submitMove forwards the move name and
      // args to boardgame.io which delivers it to the server.
      props.submitMove('resolveHeroChoice', { resolution: 'discard' });
    }

    function onPutItBack(): void {
      if (isSubmitting.value) return;
      isSubmitting.value = true;
      // why: WP-220 — resolution 'return' moves the revealed card back to
      // the bottom of the hero deck. resolveHeroChoice is client:false
      // (server-only); submitMove forwards the move name and args to
      // boardgame.io which delivers it to the server.
      props.submitMove('resolveHeroChoice', { resolution: 'return' });
    }

    return {
      isSubmitting,
      shouldRender,
      onDiscard,
      onPutItBack,
    };
  },
});
</script>

<template>
  <div
    v-if="shouldRender()"
    class="pending-hero-choice-prompt"
    data-testid="pending-hero-choice-prompt"
    role="region"
    aria-label="Hero reveal choice"
  >
    <p class="pending-hero-choice-prompt__card-name" data-testid="pending-hero-choice-card-name">
      {{ pendingHeroChoice!.display.name }}
    </p>
    <img
      v-if="pendingHeroChoice!.display.imageUrl"
      class="pending-hero-choice-prompt__card-image"
      :src="pendingHeroChoice!.display.imageUrl"
      :alt="pendingHeroChoice!.display.name"
      data-testid="pending-hero-choice-card-image"
    />
    <div class="pending-hero-choice-prompt__buttons">
      <button
        type="button"
        class="pending-hero-choice-prompt__btn"
        data-testid="pending-hero-choice-discard"
        :disabled="isSubmitting"
        :aria-disabled="isSubmitting ? 'true' : undefined"
        :title="isSubmitting ? 'Choice already submitted.' : undefined"
        @click="onDiscard"
      >
        Discard
      </button>
      <button
        type="button"
        class="pending-hero-choice-prompt__btn"
        data-testid="pending-hero-choice-return"
        :disabled="isSubmitting"
        :aria-disabled="isSubmitting ? 'true' : undefined"
        :title="isSubmitting ? 'Choice already submitted.' : undefined"
        @click="onPutItBack"
      >
        Put it back
      </button>
    </div>
  </div>
</template>

<style scoped>
.pending-hero-choice-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-foreground, #333);
  background: var(--color-background, #fff);
}

.pending-hero-choice-prompt__card-name {
  margin: 0;
  font-weight: 600;
}

.pending-hero-choice-prompt__card-image {
  max-height: 80px;
  object-fit: contain;
  align-self: flex-start;
}

.pending-hero-choice-prompt__buttons {
  display: flex;
  gap: 0.5rem;
}

.pending-hero-choice-prompt__btn {
  padding: 0.3rem 0.75rem;
  font-size: 0.85rem;
}
</style>
