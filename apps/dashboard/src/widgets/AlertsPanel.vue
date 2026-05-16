<script setup lang="ts">
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { useFeatureFlags } from '../composables/useFeatureFlags.js';
import { fetchAlerts } from '../services/endpoints.js';
import { useAlertsStore } from '../stores/alerts.js';
import { watch } from 'vue';

const flags = useFeatureFlags();
const isAlertsEnabled = flags.isEnabled('alerts');

const alertsStore = useAlertsStore();
const { data, loading, error, updatedAt, source } = useFetch(fetchAlerts);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);

watch(data, (newAlerts) => {
  if (newAlerts) {
    alertsStore.setAlerts(newAlerts);
  }
});

function severityClass(severity: string): string {
  return `severity-${severity}`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
</script>

<template>
  <div v-if="isAlertsEnabled" class="widget">
    <div class="widget-header">
      <h3>Alerts</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </div>

    <div v-if="loading && !data" class="widget-loading">
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </div>

    <div v-else-if="error" class="widget-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="widget-empty">
      <p>No active alerts.</p>
    </div>

    <ul v-else class="alerts-list">
      <li
        v-for="alert in data"
        :key="alert.id"
        class="alert-item"
        :class="[severityClass(alert.severity), { acknowledged: alert.acknowledged }]"
      >
        <span class="alert-severity">{{ alert.severity.toUpperCase() }}</span>
        <span class="alert-message">{{ alert.message }}</span>
        <span class="alert-time">{{ formatTimestamp(alert.timestamp) }}</span>
      </li>
    </ul>
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

.widget-header h3 { margin: 0; font-size: 0.9rem; color: #475569; }

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
  height: 40px;
  background: #e2e8f0;
  border-radius: 4px;
  animation: pulse 1.5s infinite;
  margin-bottom: 0.5rem;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: #dc2626; font-size: 0.85rem; }
.widget-empty { color: #94a3b8; font-size: 0.85rem; }

.alerts-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  border-left: 3px solid;
  font-size: 0.85rem;
}

.alert-item.acknowledged { opacity: 0.6; }

.severity-critical { border-color: #dc2626; background: #fef2f2; }
.severity-error { border-color: #ea580c; background: #fff7ed; }
.severity-warning { border-color: #d97706; background: #fffbeb; }
.severity-info { border-color: #2563eb; background: #eff6ff; }

.alert-severity {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
  white-space: nowrap;
}

.alert-message { flex: 1; color: #1e293b; }
.alert-time { font-size: 0.7rem; color: #94a3b8; white-space: nowrap; }
</style>
