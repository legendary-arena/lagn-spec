<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useFetch } from '../composables/useFetch.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { useDateRange } from '../composables/useDateRange.js';
import {
  useNetRevenueBreakdown,
  type GrossDailyInput,
} from '../composables/useNetRevenueBreakdown.js';
import { fetchRevenueHistory } from '../services/endpoints.js';
import { REVENUE_DEDUCTIONS } from '../config/revenueDeductions.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';

/**
 * Resolve a PrimeVue design-token value from the document root. ECharts
 * paints onto a canvas and cannot consume CSS custom properties directly,
 * so the resolved string is handed to the chart options.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

const { data, loading, error, updatedAt } = useFetch(() => fetchRevenueHistory(range.value));
// why: D-19602 (Royalty Deduction Placeholder Posture) — the freshness
// badge label sources from `REVENUE_DEDUCTIONS.isMock`; the mock placeholder
// percentages are operator-visible and require finance review before the
// flag flips. Once it does, the badge updates without any widget change.
const freshnessLabel = computed(() => (REVENUE_DEDUCTIONS.isMock ? 'MOCK' : 'LIVE'));
const sourceLabelRef = ref<'MOCK'>('MOCK');
const { relativeTime } = useDataFreshness(updatedAt, sourceLabelRef);

const grossSeries = computed<GrossDailyInput[]>(() => {
  if (!data.value) {
    return [];
  }
  return data.value.map((point) => ({ date: point.date, grossCents: point.value }));
});

const breakdown = useNetRevenueBreakdown(
  () => grossSeries.value,
  () => REVENUE_DEDUCTIONS,
);

// why: D-19606 (Operator Interpretation Hook) — the footer displays a
// single interpretive line so the operator gets one decision cue without
// scanning bars. Range-negative net margin gets the `(net loss)` qualifier
// so the highest-signal edge case never reads as a regular small bar.
// Informational only in this WP: no RYG color, no threshold comparison, no
// alert hook. A future WP layers thresholds on top without changing the
// footer's HTML.
const operatorFooterLabel = computed(() => {
  const ratio = breakdown.netMarginRatio.value;
  if (ratio < 0) {
    const absolutePercent = (Math.abs(ratio) * 100).toFixed(1);
    return `Net margin: −${absolutePercent}% (net loss)`;
  }
  const percent = (ratio * 100).toFixed(1);
  return `Net margin: ${percent}%`;
});

// why: D-19608 (ECharts Stacking Contract) — all four series share the
// literal `stack: 'total'` identifier so ECharts positions mixed-sign
// stacked bars correctly. Series array order is locked bottom-to-top
// as net (index 0), royalty (index 1), stripeFees (index 2), infraCogs
// (index 3). Negative-net days use the same stack key — assigning a
// separate stack for negatives would detach the negative band from the
// positive stack and read as a different metric.
// why: chart colors are resolved from PrimeVue tokens in JS (canvas
// cannot read CSS variables) and recomputed when the theme toggle
// dispatches its event — mirrors `RevenueChartWidget.vue:32–33`.
const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

// why: WP-157 Widget Contract + WP-196 Widget State Gate Pattern — the
// single `state` computed gates the entire render via a 4-arm v-if chain
// in the template. A widget that branches on multiple booleans
// (`v-if="loading" v-else-if="error"`) violates the structural lock.
// `BaseChart` appears only inside the `'data'` arm.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (loading.value && !data.value) {
    return 'loading';
  }
  if (error.value) {
    return 'error';
  }
  if (!data.value || data.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

const chartOption = computed<EChartsOption>(() => {
  void themeVersion.value;
  if (state.value !== 'data') {
    return {};
  }
  const series = breakdown.series.value;
  const netColor = readThemeColor('--p-primary-color');
  const royaltyColor = readThemeColor('--p-text-muted-color');
  const stripeFeesColor = readThemeColor('--p-content-border-color');
  const infraCogsColor = readThemeColor('--p-surface-border');
  const axisColor = readThemeColor('--p-text-muted-color');
  const splitColor = readThemeColor('--p-content-border-color');
  const grossCents = series.gross;
  const netCents = series.net;
  return {
    tooltip: {
      trigger: 'axis',
      // why: D-19606 ext. (per-day tooltip margin) — `dayMarginRatio =
      // grossCents[i] === 0 ? 0 : netCents[i] / grossCents[i]` is
      // computed from the hovered day's values. The aggregate
      // `breakdown.netMarginRatio` is footer-only; using it here would
      // tell the operator the wrong number for the surface they are
      // reading. The `"Negative net day"` label is added inside this
      // formatter when the hovered day's net is below zero (D-19606
      // — negative-net first-class signal).
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }
        const first = params[0] as { dataIndex: number; axisValue: string };
        const dataIndex = first.dataIndex;
        const grossForDay = grossCents[dataIndex] ?? 0;
        const netForDay = netCents[dataIndex] ?? 0;
        const dayMarginRatio = grossForDay === 0 ? 0 : netForDay / grossForDay;
        const dayMarginPercent = (dayMarginRatio * 100).toFixed(1);
        const lines: string[] = [];
        lines.push(`<strong>${first.axisValue}</strong>`);
        for (const entry of params as { seriesName: string; value: number; color: string }[]) {
          const cents = entry.value;
          const dollars = (cents / 100).toFixed(2);
          lines.push(
            `<span style="color:${entry.color}">●</span> ${entry.seriesName}: $${dollars}`,
          );
        }
        lines.push(`Day margin: ${dayMarginPercent}%`);
        if (netForDay < 0) {
          lines.push('Negative net day');
        }
        return lines.join('<br/>');
      },
    },
    textStyle: { color: axisColor },
    xAxis: {
      type: 'category',
      data: [...series.dates],
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
        name: 'Net',
        type: 'bar',
        stack: 'total',
        data: [...series.net],
        itemStyle: { color: netColor },
      },
      {
        name: 'Royalty',
        type: 'bar',
        stack: 'total',
        data: [...series.royalty],
        itemStyle: { color: royaltyColor },
      },
      {
        name: 'Stripe Fees',
        type: 'bar',
        stack: 'total',
        data: [...series.stripeFees],
        itemStyle: { color: stripeFeesColor },
      },
      {
        name: 'Infra COGS',
        type: 'bar',
        stack: 'total',
        data: [...series.infraCogs],
        itemStyle: { color: infraCogsColor },
      },
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  };
});
</script>

<template>
  <div class="widget">
    <header class="widget-header">
      <h3>Net Revenue</h3>
      <span class="freshness-badge">
        <span class="source">{{ freshnessLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading">
      <div class="skeleton-chart"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error">
      <p>
        Net revenue data could not be loaded; please retry or check the dashboard status page. ({{
          error?.message ?? 'unknown error'
        }})
      </p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <p>No net revenue data available for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <BaseChart :option="chartOption" height="280px" :loading="loading" />
      <footer class="widget-footer">
        <span class="operator-interpretation">{{ operatorFooterLabel }}</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.widget {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.widget-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--p-text-color);
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

.widget-loading .skeleton-chart {
  height: 280px;
  background: var(--p-surface-border, var(--p-content-border-color));
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
  color: var(--p-text-color);
  font-size: 0.85rem;
}
.widget-empty {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.widget-data {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.widget-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
  border-top: 1px solid var(--p-content-border-color);
}

.operator-interpretation {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-text-color);
}
</style>
