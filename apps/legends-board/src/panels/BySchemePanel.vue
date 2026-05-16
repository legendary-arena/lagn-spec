<script setup lang="ts">
import type { LegendsSnapshotBoard } from "../snapshots/snapshotClient";

const props = defineProps<{
  board: LegendsSnapshotBoard | null;
  error: string | null;
}>();
</script>

<template>
  <div class="panel by-scheme-panel">
    <h2 class="panel-title">By Scheme</h2>

    <div v-if="error" class="panel-error">
      <p>Data unavailable</p>
      <p class="error-detail">{{ error }}</p>
    </div>

    <div v-else-if="!board" class="panel-loading">
      <p>Loading scheme rankings...</p>
    </div>

    <table v-else class="leaderboard-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th class="col-handle">Player</th>
          <th class="col-score">Score</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry of board.entries"
          :key="`${entry.rank}-${entry.handle}`"
          class="leaderboard-row"
        >
          <td class="col-rank">{{ entry.rank }}</td>
          <td class="col-handle">{{ entry.handle }}</td>
          <td class="col-score">{{ entry.score.toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
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

.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
}

.leaderboard-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid #333;
  color: #aaa;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.leaderboard-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #1a1a2e;
}

.leaderboard-row:hover {
  background: rgba(255, 215, 0, 0.05);
}

.col-rank {
  width: 3rem;
  text-align: center;
  color: #888;
}

.col-score {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #ffd700;
}
</style>
