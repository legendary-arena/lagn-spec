<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import type { KioskConfig } from "./kioskMode";

const props = defineProps<{
  boardNames: readonly string[];
  config: KioskConfig;
}>();

const emit = defineEmits<{
  (event: "board-change", boardName: string): void;
}>();

const currentIndex = ref(0);
const isPaused = ref(false);
let cycleTimer: ReturnType<typeof setInterval> | null = null;

const currentBoardName = computed(() => {
  if (props.boardNames.length === 0) {
    return null;
  }
  return props.boardNames[currentIndex.value] ?? null;
});

const prefersReducedMotion = ref(false);

/** Advances to the next panel in the cycle. */
function advancePanel(): void {
  if (props.boardNames.length === 0) {
    return;
  }
  currentIndex.value = (currentIndex.value + 1) % props.boardNames.length;
  const boardName = props.boardNames[currentIndex.value];
  if (boardName) {
    emit("board-change", boardName);
  }
}

/** Starts the auto-cycle timer. */
function startCycling(): void {
  stopCycling();
  if (prefersReducedMotion.value) {
    return;
  }
  cycleTimer = setInterval(() => {
    if (!isPaused.value) {
      advancePanel();
    }
  }, props.config.cycleIntervalMs);
}

/** Stops the auto-cycle timer. */
function stopCycling(): void {
  if (cycleTimer !== null) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
}

/** Handles mouse enter — pauses cycling in non-kiosk mode. */
function handleMouseEnter(): void {
  if (!props.config.isKiosk) {
    isPaused.value = true;
  }
}

/** Handles mouse leave — resumes cycling in non-kiosk mode. */
function handleMouseLeave(): void {
  if (!props.config.isKiosk) {
    isPaused.value = false;
  }
}

/** Switches to a specific panel by index. */
function goToPanel(index: number): void {
  if (index >= 0 && index < props.boardNames.length) {
    currentIndex.value = index;
    const boardName = props.boardNames[index];
    if (boardName) {
      emit("board-change", boardName);
    }
  }
}

onMounted(() => {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion.value = motionQuery.matches;
  motionQuery.addEventListener("change", (event) => {
    prefersReducedMotion.value = event.matches;
    if (event.matches) {
      stopCycling();
    } else {
      startCycling();
    }
  });

  if (props.boardNames.length > 0) {
    const firstBoard = props.boardNames[0];
    if (firstBoard) {
      emit("board-change", firstBoard);
    }
    startCycling();
  }
});

onUnmounted(() => {
  stopCycling();
});

defineExpose({ currentIndex, currentBoardName, goToPanel });
</script>

<template>
  <div
    class="attract-cycler"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <slot :current-index="currentIndex" :current-board-name="currentBoardName" />

    <div v-if="!config.isKiosk && boardNames.length > 1" class="panel-nav">
      <button
        v-for="(boardName, index) of boardNames"
        :key="boardName"
        class="nav-dot"
        :class="{ active: index === currentIndex }"
        :aria-label="`Go to ${boardName} panel`"
        @click="goToPanel(index)"
      />
    </div>

    <div
      v-if="isPaused && !config.isKiosk"
      class="pause-indicator"
      aria-live="polite"
    >
      Paused
    </div>
  </div>
</template>

<style scoped>
.attract-cycler {
  position: relative;
  width: 100%;
  min-height: 300px;
}

.panel-nav {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
}

.nav-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #555;
  background: transparent;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s;
}

.nav-dot.active {
  background: #ffd700;
  border-color: #ffd700;
}

.nav-dot:hover {
  border-color: #ffd700;
}

.pause-indicator {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.75rem;
  color: #888;
  background: rgba(0, 0, 0, 0.6);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}
</style>
