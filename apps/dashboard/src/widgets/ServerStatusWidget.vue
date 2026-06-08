<script setup lang="ts">
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { fetchKpiSnapshots } from '../services/endpoints.js';
import { computed } from 'vue';

const { data, loading, error, updatedAt, source } = useFetch(fetchKpiSnapshots);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);

const serverHealth = computed(() => {
  if (!data.value) {
    return null;
  }
  return data.value.find((snapshot) => snapshot.id === 'server-health') ?? null;
});
</script>

<template>
  <div class="widget">
    <div class="widget-header">
      <h3>Server Health</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </div>

    <div v-if="loading && !serverHealth" class="widget-loading">
      <div class="skeleton-block"></div>
    </div>

    <div v-else-if="error" class="widget-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!serverHealth" class="widget-empty">
      <p>No server health data available.</p>
    </div>

    <div v-else class="widget-data">
      <span class="metric-value">{{ serverHealth.value }}%</span>
      <span class="metric-label">overall health</span>
    </div>
  </div>
</template>

<style scoped>
.widget {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.widget-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
}

.freshness-badge {
  font-size: 0.65rem;
  color: #94a3b8;
  display: flex;
  gap: 0.35rem;
}

.freshness-badge .source {
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-weight: 600;
}

.widget-loading .skeleton-block {
  height: 48px;
  background: #e2e8f0;
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.widget-error {
  color: #dc2626;
  font-size: 0.85rem;
}
.widget-empty {
  color: #94a3b8;
  font-size: 0.85rem;
}
.widget-data {
  display: flex;
  flex-direction: column;
}
.metric-value {
  font-size: 2rem;
  font-weight: 700;
  color: #0f172a;
}
.metric-label {
  font-size: 0.8rem;
  color: #64748b;
}
</style>
