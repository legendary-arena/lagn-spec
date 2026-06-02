<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { useDateRange } from '../composables/useDateRange.js';
import { fetchBillingHealth, fetchBillingHealthSparklines } from '../services/endpoints.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';

/**
 * Resolve a PrimeVue design-token value from the document root for the
 * sparkline canvases on theme toggle, matching the existing
 * `RevenueChartWidget.vue:32` pattern.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

const summaryFetch = useFetch(() => fetchBillingHealth(range.value));
const sparklinesFetch = useFetch(() => fetchBillingHealthSparklines(range.value));

const data = summaryFetch.data;
const loading = computed(() => summaryFetch.loading.value || sparklinesFetch.loading.value);
const error = computed(() => summaryFetch.error.value ?? sparklinesFetch.error.value);
const sourceLabelRef = ref<'MOCK'>('MOCK');
const { relativeTime } = useDataFreshness(summaryFetch.updatedAt, sourceLabelRef);

const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

// why: WP-157 Widget Contract + WP-196 Widget State Gate Pattern — the
// single `state` computed gates rendering. The `error` and `empty` arms
// MUST NOT render the sparkline; ambiguity here is contract breach
// against the Widget State Semantics table in WP-196.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (loading.value && !data.value) {
    return 'loading';
  }
  if (error.value) {
    return 'error';
  }
  if (!data.value || !sparklinesFetch.data.value) {
    return 'empty';
  }
  return 'data';
});

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function formatCountFraction(count: number, total: number): string {
  return `${count.toLocaleString()} / ${total.toLocaleString()}`;
}

function sparklineOption(points: readonly { date: string; rate: number }[]): EChartsOption {
  void themeVersion.value;
  const lineColor = readThemeColor('--p-primary-color');
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: {
      type: 'category',
      show: false,
      data: points.map((point) => point.date),
    },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }
        const first = params[0] as { axisValue: string; data: number };
        return `${first.axisValue}<br/>${(first.data * 100).toFixed(2)}%`;
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: lineColor, width: 1.5 },
        areaStyle: { color: lineColor, opacity: 0.15 },
        data: points.map((point) => point.rate),
      },
    ],
  };
}

const webhookSparkline = computed<EChartsOption>(() => {
  if (state.value !== 'data' || !sparklinesFetch.data.value) {
    return {};
  }
  return sparklineOption(sparklinesFetch.data.value.webhook);
});

const intentSparkline = computed<EChartsOption>(() => {
  if (state.value !== 'data' || !sparklinesFetch.data.value) {
    return {};
  }
  return sparklineOption(sparklinesFetch.data.value.intent);
});
</script>

<template>
  <div class="widget">
    <header class="widget-header">
      <h3>Paid-Action Errors</h3>
      <span class="freshness-badge">
        <span class="source">MOCK</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error">
      <p>Paid-action error data could not be loaded; please retry or check the dashboard status page. ({{ error?.message ?? 'unknown error' }})</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <p>No paid-action error data available for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <div class="metric-row">
        <div class="metric-text">
          <span class="metric-label">Stripe webhook failure rate</span>
          <span class="metric-rate" aria-label="Webhook failure rate">{{ formatRate(data!.webhookFailureRate) }}</span>
          <span class="metric-fraction">{{ formatCountFraction(data!.webhookFailureCount, data!.webhookTotalCount) }} (last 30 days)</span>
        </div>
        <div class="metric-sparkline">
          <BaseChart :option="webhookSparkline" height="48px" />
        </div>
      </div>

      <div class="metric-row">
        <div class="metric-text">
          <span class="metric-label">Checkout intent abandonment rate</span>
          <span class="metric-rate" aria-label="Intent abandonment rate">{{ formatRate(data!.intentAbandonmentRate) }}</span>
          <span class="metric-fraction">{{ formatCountFraction(data!.intentAbandonedCount, data!.intentTotalCount) }} (last 30 days)</span>
        </div>
        <div class="metric-sparkline">
          <BaseChart :option="intentSparkline" height="48px" />
        </div>
      </div>
    </div>
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

.widget-loading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.widget-loading .skeleton-row {
  height: 48px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: var(--p-text-color); font-size: 0.85rem; }
.widget-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }

.widget-data {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.metric-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 30%);
  align-items: center;
  gap: 1rem;
}

.metric-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.metric-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.metric-rate {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.metric-fraction {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.metric-sparkline {
  min-width: 0;
}
</style>
