<script setup lang="ts">
import type { LegendsSnapshotBoard } from "../snapshots/snapshotClient";

const props = defineProps<{
  board: LegendsSnapshotBoard | null;
  error: string | null;
}>();
</script>

<template>
  <div class="panel recent-achievements-panel">
    <h2 class="panel-title">Recent Achievements</h2>

    <div v-if="error" class="panel-error">
      <p>Data unavailable</p>
      <p class="error-detail">{{ error }}</p>
    </div>

    <div v-else-if="!board" class="panel-loading">
      <p>Loading achievements...</p>
    </div>

    <div v-else class="achievements-marquee">
      <div
        v-for="entry of board.entries"
        :key="`${entry.rank}-${entry.handle}`"
        class="achievement-card"
      >
        <span class="achievement-handle">{{ entry.handle }}</span>
        <span class="achievement-score">{{ entry.score.toLocaleString() }}</span>
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

.panel-loading {
  text-align: center;
  color: #888;
  padding: 2rem;
}

.achievements-marquee {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.achievement-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 215, 0, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: 8px;
}

.achievement-handle {
  font-weight: 600;
}

.achievement-score {
  font-variant-numeric: tabular-nums;
  color: #ffd700;
}
</style>
