<script setup lang="ts">
import { useMockModeIndicator } from '../composables/useMockModeIndicator.js';

// Presentational only: visibility and copy come entirely from the composable;
// this component reads no env, performs no fetch, and runs no router logic.
const { isMockData, message } = useMockModeIndicator();
</script>

<template>
  <div v-if="isMockData" class="mock-mode-banner" role="status">
    {{ message }}
  </div>
</template>

<style scoped>
.mock-mode-banner {
  padding: 0.6rem 1.25rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.4;
  color: #4d3800;
  background: #ffd54f;
  border-bottom: 1px solid #e0a800;
}
</style>
