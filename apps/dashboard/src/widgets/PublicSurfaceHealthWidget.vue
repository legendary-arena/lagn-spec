<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type Ref } from 'vue';
import { useDateRange } from '../composables/useDateRange.js';
import { usePublicSurfaceHealth } from '../composables/usePublicSurfaceHealth.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchUptimeProbes } from '../services/mocks.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';
import {
  PUBLIC_SURFACES,
  type PublicSurfaceKey,
  type UptimeProbe,
  type UptimeStatus,
} from '../types/index.js';

/**
 * Resolve a PrimeVue design-token value from the document root. ECharts
 * paints onto a canvas and cannot consume CSS custom properties directly,
 * so the resolved string is handed to the chart options.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

// why: WP-204 §Determinism scope — `nowMs` captured ONCE at widget
// construction so the mock factory's data shape stays a pure function
// of (range, nowMs) within this widget's lifetime. Re-sampling
// Date.now() on every reactive evaluation would let the data shape
// drift unobservably as the clock advances mid-render.
const nowMs = Date.now();

const response = computed(() => fetchUptimeProbes(range.value, nowMs));

const health = usePublicSurfaceHealth(() => response.value);

const updatedAtRef: Ref<number | null> = computed(() => health.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(
  () => health.source.value,
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

// why: D-19608 Widget State Gate Pattern — single `state` computed gates
// the entire render via a 4-arm v-if chain in the template. WP-204
// §Widget Data Requirements drops the widget to `empty` when no surface
// has any probe; rendering a flat-zeroed table is forbidden per
// §Empty-state rule.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (health.series.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

const SURFACE_LABEL: Readonly<Record<PublicSurfaceKey, string>> = {
  marketing: 'Marketing',
  play: 'Play',
  cards: 'Cards',
  api: 'API',
};

const STATUS_LABEL: Readonly<Record<UptimeStatus, string>> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
};

interface SurfaceRow {
  readonly surface: PublicSurfaceKey;
  readonly label: string;
  readonly status: UptimeStatus;
  readonly statusLabel: string;
  readonly uptimePercentLabel: string;
  readonly lastIncidentLabel: string;
}

/**
 * Format an epoch-ms incident timestamp as a relative "Nd ago" / "never"
 * string. Bare arithmetic against `nowMs` captured at mount; pure
 * function of inputs.
 */
function formatRelativeIncident(timestamp: number | null): string {
  if (timestamp === null) {
    return 'never';
  }
  const diffMs = nowMs - timestamp;
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

/**
 * Most-recent `UptimeProbe` per surface, used to drive the per-surface
 * status chip in the table. Iterates the composable's `series` once;
 * status reflects the rollup of the latest day per surface.
 */
const latestProbeBySurface = computed<Readonly<Record<PublicSurfaceKey, UptimeProbe | null>>>(() => {
  const result: Record<PublicSurfaceKey, UptimeProbe | null> = {
    marketing: null,
    play: null,
    cards: null,
    api: null,
  };
  for (const entry of health.series.value) {
    const existing = result[entry.surface];
    if (existing === null || entry.date > existing.date) {
      result[entry.surface] = entry;
    }
  }
  return result;
});

const surfaceRows = computed<readonly SurfaceRow[]>(() => {
  const rows: SurfaceRow[] = [];
  const means = health.uptimeBySurface.value;
  const incidents = health.lastIncidentBySurface.value;
  const latestProbes = latestProbeBySurface.value;
  // why: WP-204 §Determinism scope — iterate PUBLIC_SURFACES in
  // canonical order so the table row order is stable. Object-key
  // iteration on derived maps would be observation-order-dependent.
  for (const surface of PUBLIC_SURFACES) {
    const latestProbe = latestProbes[surface];
    const status: UptimeStatus = latestProbe?.status ?? 'up';
    rows.push({
      surface,
      label: SURFACE_LABEL[surface],
      status,
      statusLabel: STATUS_LABEL[status],
      uptimePercentLabel: `${means[surface].toFixed(1)}%`,
      lastIncidentLabel: formatRelativeIncident(incidents[surface]),
    });
  }
  return rows;
});

const worstSurfaceLabel = computed<string>(() => {
  const worst = health.worstSurface.value;
  if (worst === null) {
    return '—';
  }
  return `${SURFACE_LABEL[worst.surface]} (${worst.uptimePercent.toFixed(1)}% uptime)`;
});

/**
 * 30-day sparkline data per surface. §Widget-local time windows lock
 * the slice to the trailing 30 entries from the composable's `series`
 * per surface — NOT re-fetched, NOT zero-filled. If the composable
 * has fewer than 30 days for a given surface, the sparkline displays
 * whatever it has.
 */
function sparklineForSurface(surface: PublicSurfaceKey): readonly number[] {
  // why: §Widget-local time windows — slice from composable `series`
  // only; NO independent fetch, NO zero-fill. The composable's
  // ascending-by-date sort means the trailing-30 slice is the most
  // recent 30 days available for that surface.
  const surfaceEntries: UptimeProbe[] = [];
  for (const entry of health.series.value) {
    if (entry.surface === surface) {
      surfaceEntries.push(entry);
    }
  }
  const sliceStart = Math.max(0, surfaceEntries.length - 30);
  const result: number[] = [];
  for (let i = sliceStart; i < surfaceEntries.length; i++) {
    const item = surfaceEntries[i];
    if (item === undefined) {
      continue;
    }
    result.push(item.uptimePercent);
  }
  return result;
}

function sparklineOptionFor(surface: PublicSurfaceKey): EChartsOption {
  void themeVersion.value;
  const values = sparklineForSurface(surface);
  const lineColor = readThemeColor('--p-primary-color');
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: { type: 'category', show: false, data: values.map((_, index) => String(index)) },
    yAxis: { type: 'value', show: false, min: 95, max: 100 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }
        const first = params[0] as { data: number };
        return `${first.data.toFixed(1)}%`;
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
}
</script>

<template>
  <div
    class="widget"
    data-testid="public-surface-health-widget"
    aria-label="Public surface health by domain"
  >
    <header class="widget-header">
      <h3>Public Surface Health</h3>
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
      <!-- why: §Empty-state rule — error arm renders text-only, NOT a
           degenerate table. -->
      <p>Public surface health data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-204 §Empty-state rule + §Widget Data Requirements —
           empty datasets drop to the explicit `empty` arm; rendering a
           4-row table with all 0% / "never" is forbidden because it
           is operationally indistinguishable from "all surfaces up". -->
      <p>No uptime probes captured for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <table class="surface-table" aria-label="Per-surface uptime and status">
        <thead>
          <tr>
            <th scope="col">Surface</th>
            <th scope="col">Status</th>
            <th scope="col">Uptime</th>
            <th scope="col">30-day trend</th>
            <th scope="col">Last incident</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in surfaceRows" :key="row.surface">
            <th scope="row">{{ row.label }}</th>
            <td>
              <!-- why: Vision §17 text-label-first accessibility — chip text
                   is load-bearing; the per-status class only varies the
                   color decoration. The label remains visible even if the
                   chip color is suppressed (high-contrast modes / monochrome
                   printers). -->
              <span
                class="status-chip"
                :class="'status-' + row.status"
                :aria-label="`Status: ${row.statusLabel}`"
              >{{ row.statusLabel }}</span>
            </td>
            <td class="uptime-cell">{{ row.uptimePercentLabel }}</td>
            <td class="sparkline-cell">
              <BaseChart :option="sparklineOptionFor(row.surface)" height="32px" />
            </td>
            <td class="incident-cell">{{ row.lastIncidentLabel }}</td>
          </tr>
        </tbody>
      </table>
      <footer class="widget-footer">
        <span class="operator-summary">Worst surface: {{ worstSurfaceLabel }}</span>
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
  height: 32px;
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
  gap: 0.5rem;
}

.surface-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.surface-table th,
.surface-table td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.surface-table th[scope="col"] {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.surface-table th[scope="row"] {
  font-weight: 600;
  color: var(--p-text-color);
}

.uptime-cell { font-variant-numeric: tabular-nums; }
.incident-cell { color: var(--p-text-muted-color); }
.sparkline-cell { width: 30%; min-width: 80px; }

.status-chip {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid var(--p-content-border-color);
}

.status-up {
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
  color: var(--p-primary-color);
}

.status-degraded {
  background: color-mix(in srgb, var(--p-text-muted-color) 12%, transparent);
  color: var(--p-text-color);
}

.status-down {
  background: color-mix(in srgb, var(--p-text-color) 12%, transparent);
  color: var(--p-text-color);
}

.widget-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
  border-top: 1px solid var(--p-content-border-color);
}

.operator-summary {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-text-color);
}
</style>
