<script lang="ts">
import { defineComponent, watch, ref, type PropType } from 'vue';
import type { RevealEvent } from '../../composables/useRevealDetector';

/**
 * Brief card reveal notification overlay. Shows the revealed card name
 * and destination for a short duration, then auto-dismisses.
 *
 * Positioned near the villain deck area. Uses CSS transitions for
 * fade-in/fade-out.
 */
export default defineComponent({
  name: 'RevealOverlay',
  props: {
    reveal: {
      type: Object as PropType<RevealEvent | null>,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 2000,
    },
  },
  emits: ['dismiss'],
  setup(props, { emit }) {
    const visible = ref(false);
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    watch(() => props.reveal, (next) => {
      if (next === null) {
        visible.value = false;
        return;
      }
      visible.value = true;

      if (dismissTimer !== null) {
        clearTimeout(dismissTimer);
      }
      dismissTimer = setTimeout(() => {
        visible.value = false;
        emit('dismiss');
        dismissTimer = null;
      }, props.durationMs);
    });

    function destinationLabel(destination: string): string {
      if (destination === 'city') return 'Enters the City';
      if (destination === 'scheme-twist') return 'Scheme Twist!';
      if (destination === 'mastermind-strike') return 'Master Strike!';
      if (destination === 'bystander') return 'Bystander captured';
      return '';
    }

    return { visible, destinationLabel };
  },
});
</script>

<template>
  <Transition name="reveal-fade">
    <div
      v-if="visible && reveal !== null"
      class="reveal-overlay"
      data-testid="play-reveal-overlay"
      :data-destination="reveal.destination"
      aria-live="polite"
      role="status"
    >
      <p class="reveal-overlay__card-name">{{ reveal.cardName }}</p>
      <p class="reveal-overlay__destination">{{ destinationLabel(reveal.destination) }}</p>
    </div>
  </Transition>
</template>

<style scoped>
.reveal-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  text-align: center;
  pointer-events: none;
  background: var(--color-reveal-bg, rgba(0, 0, 0, 0.85));
  color: var(--color-reveal-fg, #fff);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

.reveal-overlay__card-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.reveal-overlay__destination {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.reveal-overlay[data-destination="scheme-twist"] {
  border: 2px solid var(--color-scheme-twist, #e6a817);
}

.reveal-overlay[data-destination="mastermind-strike"] {
  border: 2px solid var(--color-master-strike, #c62828);
}

.reveal-overlay[data-destination="city"] {
  border: 2px solid var(--color-villain, #7b1fa2);
}

.reveal-overlay[data-destination="bystander"] {
  border: 2px solid var(--color-bystander, #1565c0);
}

.reveal-fade-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.reveal-fade-leave-active {
  transition: opacity 0.4s ease-in;
}

.reveal-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9);
}

.reveal-fade-leave-to {
  opacity: 0;
}
</style>
