<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type Ref } from 'vue';
import { useDateRange } from '../composables/useDateRange.js';
import { useTrafficSources } from '../composables/useTrafficSources.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchTrafficSources } from '../services/mocks.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';
import {
  ACQUISITION_CHANNELS,
  type AcquisitionChannel,
  type TrafficSource,
} from '../types/index.js';

/**
 * Resolve a PrimeVue design-token value from the document root. ECharts
 * paints onto a canvas and cannot consume CSS custom properties directly,
 * so the resolved string is handed to the chart options. Mirrors the
 * pattern locked in `NetRevenueChartWidget.vue` + `DauChartWidget.vue`.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

// why: WP-203 §Determinism scope — `nowMs` is captured ONCE at widget
// construction so the mock factory's data shape stays a pure function of
// (range, nowMs) within this widget's lifetime. Re-sampling Date.now() on
// every reactive evaluation would let the data shape drift unobservably
// as the clock advances mid-render.
const nowMs = Date.now();

const response = computed(() => fetchTrafficSources(range.value, nowMs));

const breakdown = useTrafficSources(() => response.value);

const updatedAtRef: Ref<number | null> = computed(() => breakdown.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(() => breakdown.source.value);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

// why: WP-157 Widget Contract + D-19608 Widget State Gate Pattern — single
// `state` computed gates the entire render via a 4-arm v-if chain in the
// template. WP-203 §Widget Data Requirements drops the widget to `empty`
// when no day of data exists across the range; rendering a flat-zeroed
// stacked bar is forbidden per §Empty-state rule.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (breakdown.series.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

/**
 * Distinct UTC dates appearing in the series, in ascending order. Powers
 * the x-axis category labels. The series is pre-sorted by the mock
 * factory per §Aggregation rule so we collect first-seen dates in
 * iteration order without a re-sort.
 */
const uniqueDates = computed<readonly string[]>(() => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const entry of breakdown.series.value) {
    if (!seen.has(entry.date)) {
      seen.add(entry.date);
      ordered.push(entry.date);
    }
  }
  return ordered;
});

/**
 * Per-channel daily visitor counts, indexed by date. Used to populate the
 * stacked-bar series array — one series per channel, value per day.
 */
function visitorCountsForChannel(channel: AcquisitionChannel): number[] {
  const byDate: Record<string, number> = {};
  for (const entry of breakdown.series.value) {
    if (entry.channel === channel) {
      byDate[entry.date] = (byDate[entry.date] ?? 0) + entry.visitorCount;
    }
  }
  const counts: number[] = [];
  for (const date of uniqueDates.value) {
    counts.push(byDate[date] ?? 0);
  }
  return counts;
}

const overallConversionPercentLabel = computed<string>(() => {
  const visitors = breakdown.totalVisitors.value;
  // why: D-19908 numeric-zero — display `0.0%` rather than `NaN%` when
  // there are no visitors. Empty state catches this before render but
  // the guard keeps the label safe under any reactive edge.
  if (visitors === 0) {
    return '0.0%';
  }
  const ratio = breakdown.totalSignups.value / visitors;
  return `${(ratio * 100).toFixed(1)}%`;
});

const chartOption = computed<EChartsOption>(() => {
  void themeVersion.value;
  if (state.value !== 'data') {
    return {};
  }
  const directColor = readThemeColor('--p-primary-color');
  const searchColor = readThemeColor('--p-text-muted-color');
  const referralColor = readThemeColor('--p-content-border-color');
  const paidColor = readThemeColor('--p-surface-border');
  const axisColor = readThemeColor('--p-text-muted-color');
  const splitColor = readThemeColor('--p-content-border-color');
  const channelColor: Readonly<Record<AcquisitionChannel, string>> = {
    direct: directColor,
    search: searchColor,
    referral: referralColor,
    paid: paidColor,
  };
  const channelLabel: Readonly<Record<AcquisitionChannel, string>> = {
    direct: 'Direct',
    search: 'Search',
    referral: 'Referral',
    paid: 'Paid',
  };
  // why: WP-203 §Determinism scope — iterate ACQUISITION_CHANNELS in
  // canonical order so the stacked-bar segment stacking order is stable
  // across runtimes. Object-key iteration on `channelColor` would be
  // observation-order-dependent.
  const seriesEntries = ACQUISITION_CHANNELS.map((channel) => ({
    name: channelLabel[channel],
    type: 'bar' as const,
    stack: 'total',
    data: visitorCountsForChannel(channel),
    itemStyle: { color: channelColor[channel] },
  }));
  return {
    tooltip: { trigger: 'axis' },
    textStyle: { color: axisColor },
    // why: ECharts `LegendComponent` is not registered globally in
    // `main.ts` (only `GridComponent` + `TooltipComponent` are loaded),
    // so the legend lives in the tooltip per-series breakdown rather
    // than as a chart-level legend. Adding `LegendComponent` to
    // `main.ts` would expand WP-203's footprint outside its 22-file
    // allowlist; the per-channel name + color is already visible via
    // the axis tooltip hover.
    xAxis: {
      type: 'category',
      data: [...uniqueDates.value],
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: axisColor },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: seriesEntries,
    grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
  };
});
</script>

<template>
  <div class="widget" data-testid="traffic-sources-widget" aria-label="Traffic sources by channel">
    <header class="widget-header">
      <h3>Traffic Sources</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-chart"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>
        Traffic source data could not be loaded; please retry or check the dashboard status page.
      </p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-203 §Empty-state rule + §Widget Data Requirements —
           empty datasets drop to the explicit `empty` arm; rendering a
           flat stacked-bar chart with zeroed segments is forbidden. -->
      <p>No traffic captured for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <BaseChart :option="chartOption" height="280px" />
      <footer class="widget-footer">
        <span class="operator-summary">
          Total visitors: {{ breakdown.totalVisitors.value.toLocaleString() }} · Signups:
          {{ breakdown.totalSignups.value.toLocaleString() }} · Overall conversion:
          {{ overallConversionPercentLabel }}
        </span>
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

.operator-summary {
  font-size: 0.85rem;
  color: var(--p-text-color);
}
</style>
