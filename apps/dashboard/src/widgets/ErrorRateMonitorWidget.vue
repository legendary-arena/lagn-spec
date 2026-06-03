<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type Ref } from 'vue';
import { useDateRange } from '../composables/useDateRange.js';
import { useErrorRateMonitor } from '../composables/useErrorRateMonitor.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchErrorRateSnapshots } from '../services/mocks.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';
import type { ErrorRateSnapshot } from '../types/index.js';

/**
 * Resolve a PrimeVue design-token value from the document root. ECharts
 * paints onto a canvas and cannot consume CSS custom properties directly,
 * so the resolved string is handed to the chart options.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const HOURLY_WINDOW_SECONDS = 3600;
const SPARKLINE_LIMIT = 24;

const { range } = useDateRange();

// why: WP-204 §Determinism scope — capture nowMs ONCE at mount.
const nowMs = Date.now();

const response = computed(() => fetchErrorRateSnapshots(range.value, nowMs));

const monitor = useErrorRateMonitor(() => response.value);

const updatedAtRef: Ref<number | null> = computed(() => monitor.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(
  () => monitor.source.value,
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

// why: D-19608 Widget State Gate Pattern — single `state` computed gates
// the entire render via the 4-arm v-if chain. Empty state when no
// snapshots exist; per §Empty-state rule, NEVER render a flat-zeroed
// sparkline or a `NaN%` numeric.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (monitor.series.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

/**
 * Format a 0-1 decimal-fraction errorRate as a 1-decimal percentage
 * (e.g., 0.0123 → "1.2%"). Per §Error rate math invariants, display
 * formatting lives at the widget render boundary; the composable
 * keeps errorRate in the 0-1 fraction shape.
 */
function formatRatePercent(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toFixed(1)}%`;
}

const currentRateLabel = computed<string>(() => formatRatePercent(monitor.currentRate.value));
const rollingDailyRateLabel = computed<string>(() => formatRatePercent(monitor.rollingDailyRate.value));

/**
 * Format an epoch-ms timestamp as a relative "Nm ago" / "Nd ago" string.
 * Pure function against `nowMs` captured at mount.
 */
function formatRelativeTimestamp(ms: number): string {
  const diffMs = nowMs - ms;
  if (diffMs < 0) {
    return 'just now';
  }
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface SignatureRow {
  readonly signature: string;
  readonly truncatedSignature: string;
  readonly count: number;
  readonly firstSeenLabel: string;
  readonly lastSeenLabel: string;
}

const signatureRows = computed<readonly SignatureRow[]>(() => {
  const rows: SignatureRow[] = [];
  for (const signature of monitor.topSignaturesAcrossRange.value) {
    rows.push({
      signature: signature.signature,
      truncatedSignature: signature.signature.length > 60
        ? signature.signature.slice(0, 60) + '…'
        : signature.signature,
      count: signature.count,
      firstSeenLabel: formatRelativeTimestamp(signature.firstSeen),
      lastSeenLabel: formatRelativeTimestamp(signature.lastSeen),
    });
  }
  return rows;
});

const totalsLabel = computed<string>(() => {
  const totals = monitor.totals.value;
  return `Total: ${totals.errorCount.toLocaleString()} errors / ${totals.totalRequests.toLocaleString()} requests over selected range`;
});

/**
 * 24h sparkline data — trailing entries with `windowSeconds = 3600`
 * sliced from the composable's `series`. Per §Widget-local time
 * windows the slice is from `series`, never re-fetched; if fewer than
 * 24 hourly entries exist, the sparkline renders whatever it has.
 */
const sparklineValues = computed<readonly number[]>(() => {
  // why: §Widget-local time windows — filter to 3600 entries only;
  // mixed-window slicing would corrupt the visualization (1h vs 24h
  // buckets are not commensurable). Slice from composable `series`,
  // NOT from a re-fetch.
  const hourlyEntries: ErrorRateSnapshot[] = [];
  for (const entry of monitor.series.value) {
    if (entry.windowSeconds === HOURLY_WINDOW_SECONDS) {
      hourlyEntries.push(entry);
    }
  }
  const sliceStart = Math.max(0, hourlyEntries.length - SPARKLINE_LIMIT);
  const values: number[] = [];
  for (let i = sliceStart; i < hourlyEntries.length; i++) {
    const item = hourlyEntries[i];
    if (item === undefined) {
      continue;
    }
    values.push(item.errorRate);
  }
  return values;
});

const sparklineOption = computed<EChartsOption>(() => {
  void themeVersion.value;
  if (state.value !== 'data') {
    return {};
  }
  const lineColor = readThemeColor('--p-primary-color');
  const values = sparklineValues.value;
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: { type: 'category', show: false, data: values.map((_, index) => String(index)) },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }
        const first = params[0] as { data: number };
        return formatRatePercent(first.data);
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: lineColor, width: 1.5 },
        areaStyle: { color: lineColor, opacity: 0.15 },
        data: [...values],
      },
    ],
  };
});

</script>

<template>
  <div
    class="widget"
    data-testid="error-rate-monitor-widget"
    aria-label="API error rate monitor"
  >
    <header class="widget-header">
      <h3>Error Rate Monitor</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>Error rate data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-204 §Empty-state rule — no snapshots → explicit empty
           arm; rendering 0.00% with a flat sparkline would be visually
           indistinguishable from "the system is perfectly healthy",
           which is misleading. -->
      <p>No error-rate snapshots captured for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <div class="rate-row">
        <div class="metric-text">
          <span class="metric-label">Current 1h error rate</span>
          <span class="metric-rate" aria-label="Current 1 hour error rate">{{ currentRateLabel }}</span>
          <span class="metric-subdued">24h rolling: {{ rollingDailyRateLabel }}</span>
        </div>
        <div class="metric-sparkline">
          <BaseChart :option="sparklineOption" height="48px" />
        </div>
      </div>

      <table class="signature-table" aria-label="Top 5 error signatures over selected range">
        <thead>
          <tr>
            <th scope="col">Error signature</th>
            <th scope="col">Count</th>
            <th scope="col">First seen</th>
            <th scope="col">Last seen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in signatureRows" :key="row.signature">
            <td class="signature-cell" :title="row.signature">{{ row.truncatedSignature }}</td>
            <td class="count-cell">{{ row.count }}</td>
            <td class="time-cell">{{ row.firstSeenLabel }}</td>
            <td class="time-cell">{{ row.lastSeenLabel }}</td>
          </tr>
          <tr v-if="signatureRows.length === 0">
            <td colspan="4" class="empty-signature-row">No error signatures captured.</td>
          </tr>
        </tbody>
      </table>

      <footer class="widget-footer">
        <span class="operator-summary">{{ totalsLabel }}</span>
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
  gap: 0.5rem;
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
  gap: 0.75rem;
}

.rate-row {
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
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.metric-rate {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--p-text-color);
  font-variant-numeric: tabular-nums;
}

.metric-subdued {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.metric-sparkline {
  min-width: 0;
}

.signature-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.signature-table th,
.signature-table td {
  text-align: left;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.signature-table th[scope="col"] {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.signature-cell {
  font-family: monospace;
  color: var(--p-text-color);
}

.count-cell,
.time-cell {
  font-variant-numeric: tabular-nums;
}

.time-cell {
  color: var(--p-text-muted-color);
}

.empty-signature-row {
  text-align: center;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.widget-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
  border-top: 1px solid var(--p-content-border-color);
}

.operator-summary {
  font-size: 0.8rem;
  color: var(--p-text-color);
}
</style>
