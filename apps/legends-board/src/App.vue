<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
  fetchManifest,
  fetchAllBoards,
  pollManifest,
  getPollIntervalMs,
  boardDisplayName,
  type LegendsManifest,
  type LegendsSnapshotBoard,
} from "./snapshots/snapshotClient";
import { getKioskConfig, type KioskConfig } from "./attract/kioskMode";
import AttractCycler from "./attract/AttractCycler.vue";
import FreshnessBadge from "./freshness/FreshnessBadge.vue";
import OverallPanel from "./panels/OverallPanel.vue";
import WeeklyPanel from "./panels/WeeklyPanel.vue";
import BySchemePanel from "./panels/BySchemePanel.vue";
import RecentAchievementsPanel from "./panels/RecentAchievementsPanel.vue";
import NowPlayingPanel from "./panels/NowPlayingPanel.vue";
import VersionBadge from "./components/VersionBadge.vue";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const kioskConfig: KioskConfig = getKioskConfig();

const manifest = ref<LegendsManifest | null>(null);
const boards = ref<Map<string, LegendsSnapshotBoard>>(new Map());
const boardErrors = ref<Map<string, string>>(new Map());
const activeBoardName = ref<string | null>(null);

const loadError = ref<string | null>(null);
const isLoading = ref(true);
const manifestFetchError = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const boardNames = computed((): readonly string[] => {
  return manifest.value?.boards ?? [];
});

const activeBoard = computed((): LegendsSnapshotBoard | null => {
  if (!activeBoardName.value) {
    return null;
  }
  return boards.value.get(activeBoardName.value) ?? null;
});

const activeBoardError = computed((): string | null => {
  if (!activeBoardName.value) {
    return null;
  }
  return boardErrors.value.get(activeBoardName.value) ?? null;
});

const r2BaseUrl = computed((): string => {
  return import.meta.env.VITE_LEGENDS_R2_BASE_URL ?? "(not set)";
});

const activeBoardDisplayName = computed((): string => {
  if (!activeBoardName.value) {
    return "";
  }
  return boardDisplayName(activeBoardName.value);
});

// ---------------------------------------------------------------------------
// Panel component resolver
// ---------------------------------------------------------------------------

const panelComponents: Record<string, unknown> = {
  overall: OverallPanel,
  weekly: WeeklyPanel,
  "by-scheme": BySchemePanel,
  "recent-achievements": RecentAchievementsPanel,
  "now-playing": NowPlayingPanel,
};

/** Returns the panel component for a board name, falling back to OverallPanel. */
function getPanelComponent(boardName: string | null): unknown {
  if (!boardName) {
    return OverallPanel;
  }
  return panelComponents[boardName] ?? OverallPanel;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/** Initial load: fetch manifest, then all boards. */
async function loadData(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  manifestFetchError.value = false;

  try {
    const loadedManifest = await fetchManifest();
    manifest.value = loadedManifest;

    if (loadedManifest.boards.length === 0) {
      isLoading.value = false;
      return;
    }

    const loadedBoards = await fetchAllBoards(loadedManifest);
    boards.value = loadedBoards;

    for (const boardName of loadedManifest.boards) {
      if (!loadedBoards.has(boardName)) {
        boardErrors.value.set(boardName, "Failed to load board data");
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error loading scoreboard data";
    loadError.value = message;
    manifestFetchError.value = true;
    console.error("[legends] Initial load failed:", error);
  } finally {
    isLoading.value = false;
  }
}

/** Poll handler: re-fetch manifest and reload boards if it changed. */
async function handlePoll(): Promise<void> {
  try {
    const previousGeneratedAt = manifest.value?.generatedAt ?? null;
    const newManifest = await pollManifest();
    manifest.value = newManifest;
    manifestFetchError.value = false;

    if (
      previousGeneratedAt !== null &&
      newManifest.generatedAt !== previousGeneratedAt
    ) {
      const loadedBoards = await fetchAllBoards(newManifest);
      boards.value = loadedBoards;
      boardErrors.value.clear();

      for (const boardName of newManifest.boards) {
        if (!loadedBoards.has(boardName)) {
          boardErrors.value.set(boardName, "Failed to load board data");
        }
      }
    }
  } catch (error) {
    console.error("[legends] Poll failed:", error);
    manifestFetchError.value = true;
  }
}

/** Retry handler for full-page error state. */
async function handleRetry(): Promise<void> {
  await loadData();
}

/** Handler for attract cycler board changes. */
function handleBoardChange(boardName: string): void {
  activeBoardName.value = boardName;
}

/** Force refresh for debug mode. */
async function handleForceRefresh(): Promise<void> {
  boards.value = new Map();
  boardErrors.value.clear();
  await loadData();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  await loadData();

  const pollIntervalMs = getPollIntervalMs();
  pollTimer = setInterval(handlePoll, pollIntervalMs);
  console.log(
    `[legends] Manifest poll started (every ${pollIntervalMs / 1000}s)`,
  );
});

onUnmounted(() => {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div class="legends-app" :class="{ kiosk: kioskConfig.isKiosk }">
    <!-- Header (hidden in kiosk mode) -->
    <header v-if="!kioskConfig.isKiosk" class="app-header">
      <h1 class="app-title">Hall of Legends</h1>
      <FreshnessBadge
        :generated-at="manifest?.generatedAt ?? null"
        :fetch-error="manifestFetchError"
      />
    </header>

    <!-- Full-page error -->
    <div v-if="loadError && !isLoading" class="full-page-error">
      <div class="error-content">
        <h2>Unable to load scoreboard data</h2>
        <p class="error-message">{{ loadError }}</p>
        <button class="retry-button" @click="handleRetry">Retry</button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else-if="isLoading" class="loading-state">
      <p>Loading Hall of Legends...</p>
    </div>

    <!-- Empty boards -->
    <div
      v-else-if="boardNames.length === 0"
      class="empty-state"
    >
      <h2>No boards available</h2>
      <p>The scoreboard publisher may still be initializing. Check back shortly.</p>
    </div>

    <!-- Main attract board -->
    <main v-else class="board-content">
      <AttractCycler
        :board-names="boardNames"
        :config="kioskConfig"
        @board-change="handleBoardChange"
      >
        <template #default="{ currentBoardName }">
          <div class="active-panel">
            <h2 v-if="kioskConfig.isKiosk" class="kiosk-board-title">
              {{ activeBoardDisplayName }}
            </h2>

            <!-- Kiosk freshness badge -->
            <div v-if="kioskConfig.isKiosk" class="kiosk-freshness">
              <FreshnessBadge
                :generated-at="manifest?.generatedAt ?? null"
                :fetch-error="manifestFetchError"
              />
            </div>

            <component
              :is="getPanelComponent(currentBoardName)"
              :board="activeBoard"
              :error="activeBoardError"
            />
          </div>
        </template>
      </AttractCycler>
    </main>

    <VersionBadge />

    <!-- Debug footer -->
    <footer v-if="kioskConfig.isDebug" class="debug-footer">
      <div class="debug-info">
        <span>R2 Base: {{ r2BaseUrl }}</span>
        <span>Manifest generatedAt: {{ manifest?.generatedAt ?? '(none)' }}</span>
        <span>Active panel: {{ activeBoardName ?? '(none)' }}</span>
        <span>Boards: {{ boardNames.join(', ') || '(none)' }}</span>
        <span>Kiosk: {{ kioskConfig.isKiosk }}</span>
        <button class="debug-refresh" @click="handleForceRefresh">Force Refresh</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.legends-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0a0a0f;
  color: #e0e0e0;
}

.legends-app.kiosk {
  cursor: none;
  user-select: none;
}

/* Header */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  border-bottom: 1px solid #1a1a2e;
}

.app-title {
  font-size: 1.8rem;
  margin: 0;
  background: linear-gradient(135deg, #ffd700, #ff8c00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* States */
.full-page-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
}

.error-content h2 {
  color: #f88;
  margin-bottom: 0.5rem;
}

.error-message {
  color: #888;
  margin-bottom: 1rem;
  max-width: 500px;
}

.retry-button {
  padding: 0.5rem 1.5rem;
  background: rgba(255, 215, 0, 0.15);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}

.retry-button:hover {
  background: rgba(255, 215, 0, 0.25);
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #888;
  padding: 2rem;
}

.empty-state h2 {
  color: #aaa;
  margin-bottom: 0.5rem;
}

/* Board content */
.board-content {
  flex: 1;
  padding: 0 1rem;
}

.active-panel {
  max-width: 900px;
  margin: 0 auto;
}

.kiosk-board-title {
  text-align: center;
  font-size: 2rem;
  color: #ffd700;
  margin: 1.5rem 0 0.5rem;
}

.kiosk-freshness {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

/* Debug footer */
.debug-footer {
  border-top: 1px solid #333;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.5);
}

.debug-info {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.75rem;
  color: #888;
  font-family: monospace;
}

.debug-refresh {
  padding: 0.2rem 0.5rem;
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}
</style>
