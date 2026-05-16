<script setup lang="ts">
import type { LegendsSnapshotBoard } from "../snapshots/snapshotClient";

const props = defineProps<{
  board: LegendsSnapshotBoard | null;
  error: string | null;
}>();
</script>

<template>
  <div class="panel now-playing-panel">
    <h2 class="panel-title">Now Playing</h2>

    <div v-if="error" class="panel-error">
      <p>Data unavailable</p>
      <p class="error-detail">{{ error }}</p>
    </div>

    <div v-else-if="!board" class="panel-loading">
      <p>Loading active games...</p>
    </div>

    <div v-else-if="board.entries.length === 0" class="panel-empty">
      <p>No active games right now</p>
    </div>

    <div v-else class="now-playing-list">
      <div
        v-for="entry of board.entries"
        :key="`${entry.rank}-${entry.handle}`"
        class="now-playing-card"
      >
        <div class="player-info">
          <span class="player-handle">{{ entry.handle }}</span>
          <span
            v-if="'scenarioKey' in entry"
            class="player-scenario"
          >
            {{ entry.scenarioKey }}
          </span>
        </div>
        <span class="player-score">{{ entry.score.toLocaleString() }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  padding: 1.5rem;
}

.panel-title {
  font-size: 1.5rem;
  margin: 0 0 1rem;
  color: #ffd700;
}

.panel-error {
  padding: 1rem;
  background: rgba(255, 60, 60, 0.1);
  border: 1px solid rgba(255, 60, 60, 0.3);
  border-radius: 8px;
  text-align: center;
}

.error-detail {
  font-size: 0.85rem;
  color: #888;
  margin-top: 0.5rem;
}

.panel-loading,
.panel-empty {
  text-align: center;
  color: #888;
  padding: 2rem;
}

.now-playing-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.now-playing-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(0, 200, 100, 0.05);
  border: 1px solid rgba(0, 200, 100, 0.2);
  border-radius: 8px;
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.player-handle {
  font-weight: 600;
}

.player-scenario {
  font-size: 0.85rem;
  color: #888;
}

.player-score {
  font-variant-numeric: tabular-nums;
  color: #ffd700;
}
</style>
