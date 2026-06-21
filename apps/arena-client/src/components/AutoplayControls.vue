<script lang="ts">
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from 'vue';
import {
  pause,
  resume,
  stepForward,
  stepBack,
  restart,
  goToEnd,
  getStatus,
  interpretStallProbe,
  STALL_POLL_INTERVAL_MS,
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
    const barRef = ref<HTMLElement | null>(null);
    const paused = ref<boolean>(props.initialStatus.paused);
    const cursor = ref<number>(props.initialStatus.cursor);
    const historyLength = ref<number>(props.initialStatus.historyLength);
    const mode = ref<'live' | 'paused'>(props.initialStatus.mode);
    const speedMode = ref<string>(props.initialStatus.speedMode ?? '1x');
    const expired = ref<boolean>(false);

    // why: seed abort state from the mount-time probe so a spectator who loads
    // the page while the controller is already aborted sees the banner
    // immediately (the common review-window case) — the poll then never starts
    // (startStallPoll guard below). `abortReason` is the server's public-safe
    // sentence (D-24037), read directly off the envelope, never recomputed.
    const aborted = ref<boolean>(props.initialStatus.aborted === true);
    const abortReason = ref<string | undefined>(props.initialStatus.abortReason);

    // why: REWIND keys on cursor position (the spectator is viewing a frame
    // behind the live edge), NOT on `mode`. `isRewound` and `mode` are
    // independent axes — a paused bar can be at the live edge, and a live bar
    // can be transiently rewound until the next broadcast resets the cursor.
    const isRewound = computed<boolean>(
      () => cursor.value < historyLength.value - 1,
    );

    // why: an aborted match is terminal for the live bot loop, just like a game
    // over — the loop will not advance again. So `aborted` disables the
    // live-advancing controls (toggle, step-forward, go-to-end) on the same
    // footing as `isGameOver`, while the rewind controls (step-back, restart)
    // stay enabled while history exists so the spectator can review the
    // captured run during the server's 5-minute review window. `isReviewMode`
    // captures the "terminal, rewind-allowed" axis shared by abort and game
    // over; it removes the paused-gate that exists only to stop a spectator
    // rewinding a still-advancing live match.
    const isReviewMode = computed<boolean>(
      () => props.isGameOver || aborted.value,
    );

    const isStepBackDisabled = computed<boolean>(
      () => cursor.value === 0 || (!isReviewMode.value && paused.value === false),
    );
    const isStepForwardDisabled = computed<boolean>(
      () => aborted.value || (!props.isGameOver && paused.value === false),
    );
    const isRestartDisabled = computed<boolean>(
      () => (!isReviewMode.value && paused.value === false) || historyLength.value === 0,
    );
    const positionLabel = computed<string>(() =>
      historyLength.value > 0
        ? `Move ${cursor.value + 1} / ${historyLength.value}`
        : '',
    );
    const speedLabel = computed<string>(() => {
      const labels: Record<string, string> = { '1x': '1×', '2x': '2×', '4x': '4×', 'max': 'Max' };
      return labels[speedMode.value] ?? '1×';
    });
    const isToggleDisabled = computed<boolean>(
      () => props.isGameOver || aborted.value,
    );
    const isGoToEndDisabled = computed<boolean>(
      () => props.isGameOver === true || aborted.value,
    );

    const abortBannerText = computed<string>(() => {
      if (abortReason.value === undefined || abortReason.value === '') {
        return 'Bot match stopped.';
      }
      return `Bot match stopped: ${abortReason.value}`;
    });

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
      speedMode.value = response.speedMode;
    }

    /**
     * Run a control request and apply its response to local state. A failed
     * request is surfaced and leaves the local state unchanged.
     * @param control The service control function for the clicked button.
     */
    async function runControl(
      control: (matchId: string) => Promise<AutoplayControlResponse>,
    ): Promise<void> {
      if (expired.value) return;
      try {
        applyResponse(await control(props.matchId));
      } catch (controlError) {
        if (props.isGameOver && controlError instanceof Error && controlError.message.includes('404')) {
          expired.value = true;
        }
        console.error('Autoplay control request failed.', controlError);
      }
    }

    function onToggle(): void {
      if (paused.value === true) {
        const currentSpeed = speedMode.value;
        if (currentSpeed !== '1x' && currentSpeed !== 'max') {
          void runControl((matchId) => resume(matchId, { speedMode: currentSpeed as '2x' | '4x' }));
        } else {
          void runControl(resume);
        }
      } else {
        void runControl(pause);
      }
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

    function onCycleSpeed(): void {
      const cycle: Record<string, string> = { '1x': '2x', '2x': '4x', '4x': '1x' };
      const next = cycle[speedMode.value] ?? '1x';
      speedMode.value = next;
      if (!paused.value) {
        void runControl((matchId) => resume(matchId, { speedMode: next as '1x' | '2x' | '4x' }));
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (!isToggleDisabled.value) onToggle();
          return;
        case 'ArrowLeft':
          event.preventDefault();
          if (!isStepBackDisabled.value) onStepBack();
          return;
        case 'ArrowRight':
          event.preventDefault();
          if (!isStepForwardDisabled.value) onStepForward();
          return;
        case 'Home':
          event.preventDefault();
          if (!isRestartDisabled.value) onRestart();
          return;
        case 'End':
          event.preventDefault();
          if (!isGoToEndDisabled.value) onGoToEnd();
          return;
        default:
          return;
      }
    }

    watch(() => props.isGameOver, (isOver) => {
      if (isOver) paused.value = true;
    });

    // Stall-detection poll (WP-262 / D-24042). The bar learns playback state
    // from the mount probe and control responses; neither fires while the
    // spectator merely watches, so an abort mid-playback (a crash, a stall, a
    // dropped match) would otherwise leave a silent frozen board. The poll is
    // the out-of-band signal the Socket.IO live transport cannot provide.
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let isProbeInFlight = false;
    let isDisposed = false;

    function stopStallPoll(): void {
      if (pollHandle !== null) {
        clearInterval(pollHandle);
        pollHandle = null;
      }
    }

    /**
     * One stall-detection probe: re-read the status envelope and react to a
     * settled outcome. Overlapping probes are forbidden, and a probe that
     * resolves after the bar is gone must not mutate state.
     */
    async function runStallProbe(): Promise<void> {
      // why: one probe in flight at a time — if the previous getStatus has not
      // settled when the next interval fires, skip this tick so a slow or
      // stalled server never accrues a backlog of overlapping status probes.
      if (isProbeInFlight) return;
      isProbeInFlight = true;
      const probedMatchId = props.matchId;
      let probeResult: AutoplayControlResponse | null;
      try {
        probeResult = await getStatus(probedMatchId);
      } catch (probeFault) {
        // why: a thrown probe fault is transient (a network blip or a 5xx) — it
        // is logged and polling continues; only a settled 'aborted'/'stopped'
        // result changes state, so a transient fault never raises the banner.
        console.error(
          'Autoplay stall probe failed; will retry on the next interval.',
          probeFault,
        );
        isProbeInFlight = false;
        return;
      }
      isProbeInFlight = false;
      // why: a probe that resolves after the bar has unmounted or after the
      // active match changed must NOT mutate component state — no post-unmount
      // Vue warnings, and no abort banner for a disposed / superseded match.
      if (isDisposed || probedMatchId !== props.matchId) return;
      const outcome = interpretStallProbe(probeResult);
      if (outcome === 'continue') return;
      if (outcome === 'aborted') {
        // why: the stall poll updates abort state ONLY. cursor / mode /
        // historyLength / paused stay owned by the control responses and the
        // live broadcast (D-16301 / D-16309); a rewound spectator must never be
        // yanked to the live edge by a background status probe, so this path
        // never calls applyResponse and never injects a uiState snapshot.
        aborted.value = true;
        abortReason.value = probeResult?.abortReason;
        stopStallPoll();
        return;
      }
      // outcome === 'stopped' — game over, or the controller is no longer
      // observable (404 / torn down). Stop the poll; render no abort banner.
      stopStallPoll();
    }

    function startStallPoll(): void {
      // why: nothing to detect once the match is already terminal — an
      // already-aborted envelope has seeded the banner, and a game over
      // (envelope or prop) means the loop will not advance again — so the poll
      // never starts in those cases.
      if (
        aborted.value ||
        props.isGameOver ||
        props.initialStatus.gameOver === true
      ) {
        return;
      }
      pollHandle = setInterval(() => {
        void runStallProbe();
      }, STALL_POLL_INTERVAL_MS);
    }

    onMounted(() => {
      barRef.value?.focus();
      startStallPoll();
    });

    onBeforeUnmount(() => {
      // why: clear the interval on teardown so no probe fires after the bar is
      // gone (a leaked interval keeps the test runner / event loop alive);
      // isDisposed also gates any in-flight probe from mutating a torn-down
      // component when it later resolves.
      isDisposed = true;
      stopStallPoll();
    });

    return {
      barRef,
      paused,
      mode,
      isRewound,
      positionLabel,
      speedLabel,
      expired,
      aborted,
      abortBannerText,
      isToggleDisabled,
      isStepBackDisabled,
      isStepForwardDisabled,
      isRestartDisabled,
      isGoToEndDisabled,
      onToggle,
      onStepBack,
      onStepForward,
      onRestart,
      onGoToEnd,
      onCycleSpeed,
      onKeyDown,
    };
  },
});
</script>

<template>
  <section
    ref="barRef"
    class="autoplay-controls"
    data-testid="autoplay-controls"
    role="toolbar"
    aria-label="Autoplay playback controls"
    tabindex="0"
    @keydown="onKeyDown"
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
      :aria-label="isToggleDisabled ? 'Game over' : (paused ? 'Resume' : 'Pause')"
      :disabled="isToggleDisabled"
      @click="onToggle"
    >
      {{ isToggleDisabled ? '🏁' : (paused ? '▶' : '⏸') }}
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
    <button
      type="button"
      data-testid="autoplay-speed"
      aria-label="Playback speed"
      @click="onCycleSpeed"
    >
      {{ speedLabel }}
    </button>
    <span
      v-if="positionLabel !== ''"
      class="autoplay-controls__position"
      data-testid="autoplay-position"
    >
      {{ positionLabel }}
    </span>
    <span
      v-if="expired"
      class="autoplay-controls__expired"
      data-testid="autoplay-expired"
    >
      Session expired
    </span>
    <span
      v-if="aborted"
      class="autoplay-controls__aborted"
      data-testid="autoplay-aborted"
      role="status"
    >
      {{ abortBannerText }}
    </span>
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

.autoplay-controls__position {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  font-size: 0.8rem;
  opacity: 0.7;
  min-width: 8.5rem;
  text-align: center;
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

.autoplay-controls__expired {
  font-size: 0.75rem;
  opacity: 0.6;
  font-style: italic;
}

.autoplay-controls__aborted {
  padding: 0.15rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-background, #fff);
  background: var(--color-warning, #c0392b);
  border-radius: 0.2rem;
}
</style>
