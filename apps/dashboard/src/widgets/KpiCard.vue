<script setup lang="ts">
import { computed } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { fetchKpiSnapshots } from '../services/endpoints.js';
import { formatNumber, formatCurrency } from '../utils/format.js';
import type { KpiSnapshot } from '../types/index.js';

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
  <div class="kpi-card" @click="handleClick">
    <!-- Loading state -->
    <div v-if="loading && !kpi" class="kpi-skeleton">
      <div class="skeleton-label"></div>
      <div class="skeleton-value"></div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="kpi-error">
      <span class="error-icon">⚠</span>
      <p>{{ error.message }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!kpi" class="kpi-empty">
      <p>No data available</p>
    </div>

    <!-- Data state -->
    <div v-else class="kpi-data">
      <span class="kpi-label">{{ kpi.label }}</span>
      <span class="kpi-value">{{ formatValue(kpi) }}</span>
      <span class="kpi-trend" :class="kpi.trend">
        {{ kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→' }}
      </span>
    </div>

    <!-- Freshness badge -->
    <div v-if="sourceLabel" class="freshness-badge">
      <span class="source">{{ sourceLabel }}</span>
      <span class="timestamp">{{ relativeTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.kpi-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: box-shadow 0.15s;
  position: relative;
}

.kpi-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.kpi-skeleton .skeleton-label,
.kpi-skeleton .skeleton-value {
  background: #e2e8f0;
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

.skeleton-label {
  height: 14px;
  width: 80px;
  margin-bottom: 0.5rem;
}

.skeleton-value {
  height: 28px;
  width: 120px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.kpi-error {
  color: #dc2626;
  font-size: 0.85rem;
}

.kpi-empty {
  color: #94a3b8;
  font-size: 0.85rem;
}

.kpi-data {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.kpi-label {
  font-size: 0.8rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.kpi-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #0f172a;
}

.kpi-trend {
  font-size: 0.9rem;
  font-weight: 600;
}

.kpi-trend.up { color: #16a34a; }
.kpi-trend.down { color: #dc2626; }
.kpi-trend.flat { color: #64748b; }

.freshness-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
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
</style>
