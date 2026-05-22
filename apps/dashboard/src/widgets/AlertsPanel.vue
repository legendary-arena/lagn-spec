<script setup lang="ts">
import { watch } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { useFeatureFlags } from '../composables/useFeatureFlags.js';
import { fetchAlerts } from '../services/endpoints.js';
import { useAlertsStore } from '../stores/alerts.js';
import type { AlertItem } from '../types/index.js';

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

const SEVERITY_SYMBOLS: Record<AlertItem['severity'], string> = {
  critical: '!!',
  error: '!',
  warning: '△',
  info: 'i',
};

function severityClass(severity: AlertItem['severity']): string {
  return `severity-${severity}`;
}

function severitySymbol(severity: AlertItem['severity']): string {
  return SEVERITY_SYMBOLS[severity];
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
</script>

<template>
  <div v-if="isAlertsEnabled" class="widget alerts-widget">
    <header class="widget-header">
      <h3>Alerts</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="loading && !data" class="widget-loading">
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </div>

    <div v-else-if="error" class="widget-error" role="alert">
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
        <span class="severity-chip" :class="severityClass(alert.severity)">
          <span class="severity-symbol" aria-hidden="true">{{ severitySymbol(alert.severity) }}</span>
          <span class="severity-text">{{ alert.severity.toUpperCase() }}</span>
        </span>
        <span class="alert-message">{{ alert.message }}</span>
        <span class="alert-time">{{ formatTimestamp(alert.timestamp) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.widget {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.widget-header h3 { margin: 0; font-size: 0.9rem; color: var(--p-text-color); }

.freshness-badge {
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
  display: flex;
  gap: 0.35rem;
}

.freshness-badge .source {
  background: var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-color);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-weight: 600;
}

.widget-loading .skeleton-block {
  height: 40px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
  margin-bottom: 0.5rem;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: var(--p-text-color); font-size: 0.85rem; }
.widget-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }

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
  background: color-mix(in srgb, var(--p-content-border-color) 35%, transparent);
}

.alert-item.acknowledged { opacity: 0.6; }

.alert-item.severity-critical { border-left-color: var(--p-red-500); }
.alert-item.severity-error { border-left-color: var(--p-orange-500); }
.alert-item.severity-warning { border-left-color: var(--p-yellow-500); }
.alert-item.severity-info { border-left-color: var(--p-blue-500); }

/* why: severity is conveyed by the text label first; the colored chip and
   symbol are secondary cues so status never depends on color alone. */
.severity-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  white-space: nowrap;
  color: var(--p-primary-contrast-color);
}

.severity-symbol {
  font-weight: 800;
  line-height: 1;
}

.severity-chip.severity-critical { background: var(--p-red-500); }
.severity-chip.severity-error { background: var(--p-orange-500); }
.severity-chip.severity-warning { background: var(--p-yellow-500); color: var(--p-surface-950); }
.severity-chip.severity-info { background: var(--p-blue-500); }

.alert-message { flex: 1; color: var(--p-text-color); }
.alert-time { font-size: 0.7rem; color: var(--p-text-muted-color); white-space: nowrap; }
</style>
