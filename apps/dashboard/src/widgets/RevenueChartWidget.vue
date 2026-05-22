<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { useDateRange } from '../composables/useDateRange.js';
import { fetchRevenueHistory } from '../services/endpoints.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';

/**
 * Reads a PrimeVue design-token value from the document root. echarts draws on
 * a canvas and cannot consume CSS custom properties directly, so the resolved
 * string is handed to the chart options.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

const { data, loading, error, updatedAt, source } = useFetch(
  () => fetchRevenueHistory(range.value),
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);

// why: chart colors are resolved from PrimeVue tokens in JS (canvas cannot read
// CSS variables) and recomputed when the theme toggle dispatches its event.
const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

const chartOption = computed<EChartsOption>(() => {
  void themeVersion.value;
  if (!data.value) {
    return {};
  }
  const barColor = readThemeColor('--p-primary-color');
  const axisColor = readThemeColor('--p-text-muted-color');
  const splitColor = readThemeColor('--p-content-border-color');
  return {
    tooltip: { trigger: 'axis' },
    textStyle: { color: axisColor },
    xAxis: {
      type: 'category',
      data: data.value.map((point) => point.date),
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: axisColor },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: 'Revenue',
        type: 'bar',
        data: data.value.map((point) => point.value),
        itemStyle: { color: barColor },
      },
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  };
});
</script>

<template>
  <div class="widget">
    <header class="widget-header">
      <h3>Revenue Trend</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="loading && !data" class="widget-loading">
      <div class="skeleton-chart"></div>
    </div>

    <div v-else-if="error" class="widget-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="widget-empty">
      <p>No revenue data available for the selected range.</p>
    </div>

    <BaseChart v-else :option="chartOption" height="250px" :loading="loading" />
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

.widget-loading .skeleton-chart {
  height: 250px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: var(--p-text-color); font-size: 0.85rem; }
.widget-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }
</style>
