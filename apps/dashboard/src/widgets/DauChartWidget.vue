<script setup lang="ts">
import { computed } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { useDateRange } from '../composables/useDateRange.js';
import { fetchDauHistory } from '../services/endpoints.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';

const { range } = useDateRange();

const { data, loading, error, updatedAt, source } = useFetch(
  () => fetchDauHistory(range.value),
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);

const chartOption = computed<EChartsOption>(() => {
  if (!data.value) {
    return {};
  }
  return {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.value.map((point) => point.date),
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'DAU',
        type: 'line',
        data: data.value.map((point) => point.value),
        smooth: true,
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: '#3b82f6' },
      },
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  };
});
</script>

<template>
  <div class="widget">
    <div class="widget-header">
      <h3>Daily Active Users</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </div>

    <div v-if="loading && !data" class="widget-loading">
      <div class="skeleton-chart"></div>
    </div>

    <div v-else-if="error" class="widget-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="widget-empty">
      <p>No DAU data available for the selected range.</p>
    </div>

    <BaseChart v-else :option="chartOption" height="250px" :loading="loading" />
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

.widget-loading .skeleton-chart {
  height: 250px;
  background: #e2e8f0;
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: #dc2626; font-size: 0.85rem; }
.widget-empty { color: #94a3b8; font-size: 0.85rem; }
</style>
