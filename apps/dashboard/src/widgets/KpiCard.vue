<script setup lang="ts">
import { computed } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { fetchKpiSnapshots } from '../services/endpoints.js';
import { formatNumber, formatCurrency } from '../utils/format.js';
import { computeKpiStatus } from '../utils/kpiStatus.js';
import type { KpiSnapshot, KpiStatus } from '../types/index.js';

const props = defineProps<{
  kpiId: string;
}>();

const emit = defineEmits<{
  click: [kpi: KpiSnapshot];
}>();

const { data, loading, error, updatedAt, source } = useFetch(fetchKpiSnapshots);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);

const kpi = computed<KpiSnapshot | null>(() => {
  if (!data.value) {
    return null;
  }
  return data.value.find((snapshot) => snapshot.id === props.kpiId) ?? null;
});

const trendSymbol = computed(() => {
  if (!kpi.value) {
    return '';
  }
  if (kpi.value.trend === 'up') {
    return '↑';
  }
  if (kpi.value.trend === 'down') {
    return '↓';
  }
  return '→';
});

const trendLabel = computed(() => {
  if (!kpi.value) {
    return '';
  }
  return `${kpi.value.trend} vs previous`;
});

const kpiStatus = computed<KpiStatus | null>(() => {
  if (!kpi.value) {
    return null;
  }
  return computeKpiStatus(kpi.value);
});

const STATUS_LABELS: Readonly<Record<KpiStatus, string>> = {
  'on-track': 'On track',
  'off-track': 'Off track',
  'needs-attention': 'Needs attention',
};

const statusLabel = computed(() => (kpiStatus.value ? STATUS_LABELS[kpiStatus.value] : ''));

function formatValue(snapshot: KpiSnapshot): string {
  if (snapshot.unit === 'USD') {
    return formatCurrency(snapshot.value);
  }
  if (snapshot.unit === '%') {
    return `${snapshot.value}%`;
  }
  return formatNumber(snapshot.value);
}

function handleClick(): void {
  if (kpi.value) {
    emit('click', kpi.value);
  }
}
</script>

<template>
  <div class="kpi-card widget" @click="handleClick">
    <header class="card-header">
      <span class="kpi-label">{{ kpi?.label ?? 'KPI' }}</span>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div class="card-body">
      <div v-if="loading && !kpi" class="kpi-skeleton">
        <div class="skeleton-value"></div>
      </div>

      <div v-else-if="error" class="kpi-error">
        <p>{{ error.message }}</p>
      </div>

      <div v-else-if="!kpi" class="kpi-empty">
        <p>No data available</p>
      </div>

      <span v-else class="kpi-value">{{ formatValue(kpi) }}</span>
    </div>

    <footer v-if="kpi" class="card-footer">
      <span class="kpi-trend" :class="kpi.trend">
        <span class="trend-symbol" aria-hidden="true">{{ trendSymbol }}</span>
        <span class="trend-label">{{ trendLabel }}</span>
      </span>
      <!-- why: D-19802 — chip renders only when computeKpiStatus is non-null.
           Text label renders FIRST so color is never the sole indicator;
           aria-label carries the status text so screen readers convey it. -->
      <span
        v-if="kpiStatus"
        class="kpi-status-chip"
        :class="`status-${kpiStatus}`"
        :aria-label="`Status: ${statusLabel}`"
      >
        <span class="status-label">{{ statusLabel }}</span>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.kpi-card {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.kpi-card:hover {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--p-text-color) 12%, transparent);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.kpi-label {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

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

.card-body {
  min-height: 2.2rem;
  display: flex;
  align-items: center;
}

.kpi-skeleton .skeleton-value {
  height: 28px;
  width: 120px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.kpi-error { color: var(--p-text-color); font-size: 0.85rem; }
.kpi-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }

.kpi-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.kpi-trend {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.trend-symbol { font-size: 0.9rem; }

.kpi-trend.up { color: var(--p-green-500); }
.kpi-trend.down { color: var(--p-red-500); }
.kpi-trend.flat { color: var(--p-text-muted-color); }

.kpi-status-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.kpi-status-chip.status-on-track { color: var(--p-green-500); }
.kpi-status-chip.status-off-track { color: var(--p-red-500); }
.kpi-status-chip.status-needs-attention { color: var(--p-yellow-500); }
</style>
