<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import BaseChart from './BaseChart.vue';
import type { EChartsOption } from 'echarts';
import type { SweepTrendPoint } from '../../types/sweep.js';

/**
 * The cadence-separated trend series, supplied by the page via `useSweepTrend`.
 * The chart NEVER re-derives the daily/weekly split — it consumes what the
 * composable owns (D-23502).
 */
const props = defineProps<{
  daily: readonly SweepTrendPoint[];
  weekly: readonly SweepTrendPoint[];
}>();

// why (empty state lock): when both cadences are empty the component renders no
// container at all — the Pipeline page owns the empty / loading / error
// messaging for the sweep section.
const hasPoints = computed<boolean>(() => props.daily.length + props.weekly.length > 0);

/**
 * Resolve a PrimeVue design-token value from the document root. ECharts paints
 * onto a canvas and cannot read CSS custom properties directly, so the resolved
 * string is handed to the chart options — mirrors `NetRevenueChartWidget.vue`.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

// Chart colors are resolved from PrimeVue tokens in JS and recomputed when the
// theme toggle dispatches its event — mirrors the dashboard chart-widget
// convention.
const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

/**
 * One ECharts line-series datum. `value` is the `[submittedAtMs, healthRate]`
 * pair the time axis plots; the remaining fields ride along so the tooltip can
 * render the locked field order without a second lookup.
 */
interface SweepTrendDatum {
  // Mutable tuple (not `readonly`): ECharts series `data` items type `value` as
  // a mutable `OptionDataValue[]`, so a readonly tuple is rejected.
  readonly value: [number, number | null];
  readonly cadence: 'daily' | 'weekly';
  readonly windowIndex: number | null;
  readonly cellCount: number;
  readonly submittedAt: string;
}

function toSeriesData(points: readonly SweepTrendPoint[]): SweepTrendDatum[] {
  return points.map((point) => ({
    value: [point.submittedAtMs, point.healthRate],
    cadence: point.cadence,
    windowIndex: point.windowIndex,
    cellCount: point.cellCount,
    submittedAt: point.submittedAt,
  }));
}

/**
 * Render the locked tooltip field order: `[timestamp, cadence, windowIndex?,
 * healthRate%, cellCount]`. Typed `unknown` and cast internally, matching the
 * dashboard chart-widget formatter convention.
 */
function formatTrendTooltip(params: unknown): string {
  // `trigger: 'item'` yields a single hovered point; defend against the array
  // form ECharts uses for axis triggers.
  const hovered = Array.isArray(params) ? params[0] : params;
  const datum = (hovered as { data?: SweepTrendDatum }).data;
  if (datum === undefined) {
    return '';
  }
  const healthRate = datum.value[1];
  const healthLabel = healthRate === null ? '—' : `${Math.round(healthRate * 100)}%`;
  const lines: string[] = [];
  lines.push(`<strong>${datum.submittedAt}</strong>`);
  lines.push(`Cadence: ${datum.cadence}`);
  if (datum.windowIndex !== null) {
    lines.push(`Window: w${datum.windowIndex}`);
  }
  lines.push(`Health rate: ${healthLabel}`);
  lines.push(`Cells: ${datum.cellCount}`);
  return lines.join('<br/>');
}

const chartOption = computed<EChartsOption>(() => {
  void themeVersion.value;
  const dailyColor = readThemeColor('--p-primary-color');
  const weeklyColor = readThemeColor('--p-text-muted-color');
  const axisColor = readThemeColor('--p-text-muted-color');
  const splitColor = readThemeColor('--p-content-border-color');
  // why (D-23501/D-23502): daily smoke and weekly full-corpus are distinct
  // sweep cadences sharing one `sweep_runs` table; the health RATE is
  // magnitude-normalized, so a daily 4-cell run and a weekly ~2,000-cell run
  // are directly comparable on a single `[0, 1]` axis. Two series keep the
  // cadences visually separable; the rate keeps them numerically comparable.
  return {
    tooltip: { trigger: 'item', formatter: formatTrendTooltip },
    legend: { data: ['Daily smoke', 'Weekly full-corpus'], textStyle: { color: axisColor } },
    textStyle: { color: axisColor },
    xAxis: {
      // A time axis consumes the monotonic `submittedAtMs` directly; ECharts
      // formats only the display labels (no value reformatting).
      type: 'time',
      axisLabel: { color: axisColor },
      axisLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      // The health rate is a true fraction, so the axis is bounded [0, 1].
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { color: axisColor },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: 'Daily smoke',
        type: 'line',
        // No interpolation bridging gaps: a 0-cell run's null health rate stays
        // a gap rather than a drawn-through line.
        connectNulls: false,
        data: toSeriesData(props.daily),
        itemStyle: { color: dailyColor },
        lineStyle: { color: dailyColor },
      },
      {
        name: 'Weekly full-corpus',
        type: 'line',
        connectNulls: false,
        // Weekly points render larger so the rarer deep sweep reads at a glance
        // (recommendation, not a locked value).
        symbolSize: 9,
        data: toSeriesData(props.weekly),
        itemStyle: { color: weeklyColor },
        lineStyle: { color: weeklyColor },
      },
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  };
});
</script>

<template>
  <BaseChart v-if="hasPoints" :option="chartOption" height="260px" />
</template>
