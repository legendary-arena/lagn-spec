<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type Ref } from 'vue';
import { useDateRange } from '../composables/useDateRange.js';
import { useSweepHealth, type SweepHealthFetchState } from '../composables/useSweepHealth.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchSweepHealth } from '../services/mocks.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';

/**
 * Resolve a PrimeVue design-token value from the document root. ECharts paints
 * onto a canvas and cannot consume CSS custom properties directly, so the
 * resolved string is handed to the chart options.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

// why (WP-204 carry-forward): single Date.now() call at render boundary keeps
// the composable a pure function; composable + widget split preserves
// testability.
const nowMs = Date.now();

const fetchState = computed<SweepHealthFetchState>(() => {
  // MOCK-mode-first: the synchronous mock factory always resolves with data,
  // so `error` is null here. The future LIVE flip swaps `fetchSweepHealth` in
  // `mocks.ts` and may surface a real error through this same shape.
  return { response: fetchSweepHealth(range.value, nowMs), error: null };
});

const sweep = useSweepHealth(() => fetchState.value, nowMs);

const updatedAtRef: Ref<number | null> = computed(() => sweep.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(() => sweep.source.value);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

// why: D-19608 Widget State Gate Pattern — single `state` computed gates the
// entire render via a 4-arm v-if chain in the template. The composable owns
// the empty/error/loading/data decision; the widget never re-derives it.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => sweep.state.value);

const STATUS_LABEL: Readonly<Record<'fresh' | 'stale', string>> = {
  fresh: 'Fresh',
  stale: 'Stale',
};

/**
 * Humanize an opaque anomaly key for display ONLY (the stored key is never
 * mutated, never used as a branch condition). Locked transform per EC-242:
 * replace every `-` / `_` with a single space, then upper-case the first
 * character of each whitespace-delimited word (Title Case). Example:
 * `some-anomaly-key` → `Some Anomaly Key`.
 */
function humanizeAnomalyKey(key: string): string {
  const spaced = key.replace(/[-_]/g, ' ');
  const words = spaced.split(' ');
  const titleCased: string[] = [];
  for (const word of words) {
    if (word.length === 0) {
      titleCased.push(word);
      continue;
    }
    titleCased.push(word.charAt(0).toUpperCase() + word.slice(1));
  }
  return titleCased.join(' ');
}

/**
 * Format a millisecond age as a coarse "Xh ago" / "Xm ago" / "Xs ago" string
 * for the last-run line. Pure arithmetic over the composable's `lastRunAgeMs`.
 */
function formatAge(ageMs: number | null): string {
  if (ageMs === null) {
    return '—';
  }
  if (ageMs < 0) {
    return 'just now';
  }
  const diffSeconds = Math.floor(ageMs / 1000);
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

const chipLabel = computed<string>(() => STATUS_LABEL[sweep.staleStatus.value]);

// why: WP-198 single-implementation discipline — the chip COLOR derives from
// the composable's `kpiStatus` (the 3-status taxonomy from computeKpiStatus);
// the chip TEXT is the Fresh/Stale literal. Both consume the locked helpers; no
// taxonomy is re-derived here. Falls back to 'on-track' decoration when the
// status is null (it is non-null in the data arm by construction).
const chipStatusClass = computed<string>(() => 'status-' + (sweep.kpiStatus.value ?? 'on-track'));

const cellCountLabel = computed<string>(() => {
  const latest = sweep.latestRun.value;
  if (latest === null) {
    return '—';
  }
  return String(latest.cellCount);
});

const lastRunAgeLabel = computed<string>(() => formatAge(sweep.lastRunAgeMs.value));

const recentRunCount = computed<number>(() => sweep.recentRuns.value.length);

interface AnomalyRow {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

const anomalyRows = computed<readonly AnomalyRow[]>(() => {
  const latest = sweep.latestRun.value;
  if (latest === null) {
    return [];
  }
  // why: §Non-Negotiable Constraints — anomaly keys are displayed lex-asc by
  // raw `<` comparison (NOT localeCompare; NOT a fixed engine-keyed order).
  // The dashboard does not know which keys are "important"; it sorts opaquely.
  const sortedKeys = Object.keys(latest.anomalyCounts).sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
  const rows: AnomalyRow[] = [];
  for (const key of sortedKeys) {
    rows.push({
      key,
      label: humanizeAnomalyKey(key),
      count: latest.anomalyCounts[key] ?? 0,
    });
  }
  return rows;
});

const sparklineOption = computed<EChartsOption>(() => {
  void themeVersion.value;
  const values = [...sweep.totalAnomalySparkline.value];
  const lineColor = readThemeColor('--p-primary-color');
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: { type: 'category', show: false, data: values.map((_, index) => String(index)) },
    yAxis: { type: 'value', show: false },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }
        const first = params[0] as { data: number };
        return `${first.data} anomalies`;
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: lineColor, width: 1.5 },
        areaStyle: { color: lineColor, opacity: 0.15 },
        data: values,
      },
    ],
  };
});
</script>

<template>
  <div class="widget" data-testid="sweep-health-widget" aria-label="Engine sweep health summary">
    <header class="widget-header">
      <div class="header-titles">
        <h3>Engine Sweep Health</h3>
        <p class="header-subtitle">Nightly QA-sweep classification summary</p>
      </div>
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
      <!-- why: empty vs error are mutually exclusive — the error arm renders an
           error message, NEVER the empty-state copy. -->
      <p>Sweep health data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: §Locked contract values — empty arm renders ONLY when no sweep
           has ever been recorded. Copy is locked byte-for-byte. -->
      <h4>No sweeps recorded yet</h4>
      <p class="empty-hint">Sweeps run nightly at 07:00 UTC</p>
    </div>

    <div v-else class="widget-data">
      <div class="summary-row">
        <div class="summary-stat">
          <span class="stat-label">Cells run</span>
          <span class="stat-value">{{ cellCountLabel }}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Last run</span>
          <span class="stat-value">{{ lastRunAgeLabel }}</span>
        </div>
        <!-- why: Vision §17 text-label-first accessibility — chip text
             ("Fresh" / "Stale") is load-bearing; the per-status class only
             varies color decoration. -->
        <span
          class="status-chip"
          :class="chipStatusClass"
          :aria-label="`Freshness: ${chipLabel}`"
          >{{ chipLabel }}</span
        >
      </div>

      <table class="anomaly-table" aria-label="Latest-run anomalies by kind">
        <thead>
          <tr>
            <th scope="col">Anomaly kind</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in anomalyRows" :key="row.key">
            <th scope="row">{{ row.label }}</th>
            <td class="count-cell">{{ row.count }}</td>
          </tr>
        </tbody>
      </table>

      <div class="sparkline-block">
        <span class="sparkline-label">Total anomalies — last {{ recentRunCount }} runs</span>
        <BaseChart :option="sparklineOption" height="40px" />
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
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.widget-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--p-text-color);
}
.header-subtitle {
  margin: 0;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
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

.widget-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.widget-loading .skeleton-row {
  height: 32px;
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
.widget-empty h4 {
  margin: 0 0 0.25rem;
  color: var(--p-text-color);
  font-size: 0.9rem;
}
.empty-hint {
  margin: 0;
}

.widget-data {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--p-text-color);
  font-variant-numeric: tabular-nums;
}

.status-chip {
  display: inline-block;
  margin-left: auto;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  border: 1px solid var(--p-content-border-color);
}

.status-on-track {
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
  color: var(--p-primary-color);
}

.status-needs-attention {
  background: color-mix(in srgb, var(--p-text-muted-color) 12%, transparent);
  color: var(--p-text-color);
}

.status-off-track {
  background: color-mix(in srgb, var(--p-text-color) 12%, transparent);
  color: var(--p-text-color);
}

.anomaly-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.anomaly-table th,
.anomaly-table td {
  text-align: left;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.anomaly-table th[scope='col'] {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.anomaly-table th[scope='row'] {
  font-weight: 600;
  color: var(--p-text-color);
}

.count-cell {
  font-variant-numeric: tabular-nums;
  color: var(--p-text-color);
}

.sparkline-block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sparkline-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}
</style>
