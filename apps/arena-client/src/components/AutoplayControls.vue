<script lang="ts">
import { computed, defineComponent, ref, type PropType } from 'vue';
import {
  pause,
  resume,
  stepForward,
  stepBack,
  restart,
  goToEnd,
  type AutoplayControlResponse,
} from '../services/autoplayPlayback';

/**
 * Media-player-style control bar for a spectator watching an autoplay
 * ("Watch Bot Play") match (WP-164). Five buttons — restart (⏮), step-back
 * (⏪), a pause/resume toggle (⏸/▶), step-forward (⏩), go-to-end (⏭) — drive
 * WP-163's six REST control endpoints via the autoplayPlayback service.
 *
 * The component owns the playback state (`paused` / `cursor` / `historyLength`
 * / `mode`), seeded from the `initialStatus` probe and fully replaced by each
 * control response (no partial merge; last-write-wins per D-16309). It calls
 * NO `fetch` directly and does NOT import the UI store — the service is the
 * sole snapshot-injection site (single ingestion path, D-16301).
 *
 * Per the vue-sfc-loader separate-compile pipeline (D-6512 / P6-30) this SFC
 * uses `defineComponent({ setup() { return {...} } })` so the template's
 * non-prop bindings reach `_ctx`.
 *
 * @see WP-164 §Contract; EC-181 §Locked Values
 */
export default defineComponent({
  name: 'AutoplayControls',
  props: {
    matchId: {
      type: String,
      required: true,
    },
    initialStatus: {
      type: Object as PropType<AutoplayControlResponse>,
      required: true,
    },
    // why: game-over is engine truth read PASSIVELY by the page from the live
    // UI-state snapshot and drilled in as a prop. This component never computes
    // or infers it (and never imports the store); duplicating the engine's
    // definition here would create a drift-prone second source.
    isGameOver: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const paused = ref<boolean>(props.initialStatus.paused);
    const cursor = ref<number>(props.initialStatus.cursor);
    const historyLength = ref<number>(props.initialStatus.historyLength);
    const mode = ref<'live' | 'paused'>(props.initialStatus.mode);

    // why: REWIND keys on cursor position (the spectator is viewing a frame
    // behind the live edge), NOT on `mode`. `isRewound` and `mode` are
    // independent axes — a paused bar can be at the live edge, and a live bar
    // can be transiently rewound until the next broadcast resets the cursor.
    const isRewound = computed<boolean>(
      () => cursor.value < historyLength.value - 1,
    );

    const isStepBackDisabled = computed<boolean>(
      () => cursor.value === 0 || paused.value === false,
    );
    const isStepForwardDisabled = computed<boolean>(
      () => paused.value === false,
    );
    const isRestartDisabled = computed<boolean>(
      () => paused.value === false || historyLength.value === 0,
    );
    const isGoToEndDisabled = computed<boolean>(() => props.isGameOver === true);

    /**
     * Fully replace the local playback state from a control response. No
     * partial update, no merge — combined with the no-debounce posture, the
     * bar always reflects the latest response received (D-16309).
     */
    function applyResponse(response: AutoplayControlResponse): void {
      paused.value = response.paused;
      cursor.value = response.cursor;
      historyLength.value = response.historyLength;
      mode.value = response.mode;
    }

    /**
     * Run a control request and apply its response to local state. A failed
     * request is surfaced and leaves the local state unchanged.
     * @param control The service control function for the clicked button.
     */
    async function runControl(
      control: (matchId: string) => Promise<AutoplayControlResponse>,
    ): Promise<void> {
      try {
        applyResponse(await control(props.matchId));
      } catch (controlError) {
        // why: a failed control must not desync local state; surface the fault
        // and leave the bar as-is (the next successful control re-syncs it).
        console.error('Autoplay control request failed.', controlError);
      }
    }

    function onToggle(): void {
      void runControl(paused.value === true ? resume : pause);
    }
    function onStepBack(): void {
      void runControl(stepBack);
    }
    function onStepForward(): void {
      void runControl(stepForward);
    }
    function onRestart(): void {
      void runControl(restart);
    }
    function onGoToEnd(): void {
      void runControl(goToEnd);
    }

    return {
      paused,
      mode,
      isRewound,
      isStepBackDisabled,
      isStepForwardDisabled,
      isRestartDisabled,
      isGoToEndDisabled,
      onToggle,
      onStepBack,
      onStepForward,
      onRestart,
      onGoToEnd,
    };
  },
});
</script>

<template>
  <section
    class="autoplay-controls"
    data-testid="autoplay-controls"
    aria-label="Autoplay playback controls"
  >
    <button
      type="button"
      data-testid="autoplay-restart"
      aria-label="Restart playback"
      :disabled="isRestartDisabled"
      @click="onRestart"
    >
      ⏮
    </button>
    <button
      type="button"
      data-testid="autoplay-step-back"
      aria-label="Step back"
      :disabled="isStepBackDisabled"
      @click="onStepBack"
    >
      ⏪
    </button>
    <button
      type="button"
      data-testid="autoplay-toggle"
      :aria-label="paused ? 'Resume' : 'Pause'"
      @click="onToggle"
    >
      {{ paused ? '▶' : '⏸' }}
    </button>
    <button
      type="button"
      data-testid="autoplay-step-forward"
      aria-label="Step forward"
      :disabled="isStepForwardDisabled"
      @click="onStepForward"
    >
      ⏩
    </button>
    <button
      type="button"
      data-testid="autoplay-go-to-end"
      aria-label="Go to live edge"
      :disabled="isGoToEndDisabled"
      @click="onGoToEnd"
    >
      ⏭
    </button>
    <span
      v-if="isRewound"
      class="autoplay-controls__rewind"
      data-testid="autoplay-rewind-indicator"
    >
      REWIND
    </span>
  </section>
</template>

<style scoped>
.autoplay-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.autoplay-controls button {
  padding: 0.25rem 0.6rem;
  font-size: 1rem;
}

.autoplay-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.autoplay-controls__rewind {
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-background, #fff);
  background: var(--color-warning, #c0392b);
  border-radius: 0.2rem;
}
</style>
