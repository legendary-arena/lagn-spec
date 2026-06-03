<script setup lang="ts">
import { computed, ref, type Ref } from 'vue';
import { useRetentionCohorts } from '../composables/useRetentionCohorts.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchRetentionCohorts } from '../services/mocks.js';
import type { RetentionCohort } from '../types/index.js';

const DEFAULT_COHORT_COUNT = 8;

const cohortCount = ref<number>(DEFAULT_COHORT_COUNT);

// why: WP-203 §Determinism scope — `nowMs` captured ONCE at widget mount.
// The mock factory's data shape stays a pure function of (cohortCount,
// nowMs) over the widget's lifetime.
const nowMs = Date.now();

const response = computed(() => fetchRetentionCohorts(cohortCount.value, nowMs));

const retention = useRetentionCohorts(() => response.value);

const updatedAtRef: Ref<number | null> = computed(() => retention.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(
  () => retention.source.value,
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

// why: WP-157 Widget Contract + D-19608 Widget State Gate Pattern — single
// `state` computed. WP-203 §Widget Data Requirements drops to `empty`
// when zero cohorts are present (the heatmap rows would all be missing).
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (retention.cohorts.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

function formatPercent(ratio: number): string {
  // why: D-19908 — `0.0%` not `NaN%` for zero-denominator branches.
  return `${(ratio * 100).toFixed(1)}%`;
}

interface CohortDisplayRow {
  readonly cohortWeek: string;
  readonly cohortSize: number;
  readonly day1Rate: number;
  readonly day7Rate: number;
  readonly day1Label: string;
  readonly day7Label: string;
}

const cohortRows = computed<readonly CohortDisplayRow[]>(() => {
  const rows: CohortDisplayRow[] = [];
  for (const cohort of retention.cohorts.value) {
    // why: D-19908 zero-denominator guard — per-cohort zero-size returns
    // `0`, not `NaN`. Same semantics as the composable's average path.
    const day1Rate = cohort.cohortSize === 0 ? 0 : cohort.day1ReturnCount / cohort.cohortSize;
    const day7Rate = cohort.cohortSize === 0 ? 0 : cohort.day7ReturnCount / cohort.cohortSize;
    rows.push({
      cohortWeek: cohort.cohortWeek,
      cohortSize: cohort.cohortSize,
      day1Rate,
      day7Rate,
      day1Label: formatPercent(day1Rate),
      day7Label: formatPercent(day7Rate),
    });
  }
  return rows;
});

/**
 * Intensity bucket for a cell, used to drive the decorative shading
 * class. Per Vision §17 (text-label-first accessibility), the numeric
 * rate text is the load-bearing display; the color shade is decorative
 * and never the sole signal. Five buckets (`q0`..`q4`) keep contrast
 * readable in both light + dark Aura themes.
 */
function intensityClass(rate: number): string {
  if (rate >= 0.6) {
    return 'cell-intensity-q4';
  }
  if (rate >= 0.4) {
    return 'cell-intensity-q3';
  }
  if (rate >= 0.25) {
    return 'cell-intensity-q2';
  }
  if (rate > 0) {
    return 'cell-intensity-q1';
  }
  return 'cell-intensity-q0';
}

const footerLabel = computed<string>(() => {
  const avg1 = formatPercent(retention.averageDay1Rate.value);
  const avg7 = formatPercent(retention.averageDay7Rate.value);
  const best: RetentionCohort | null = retention.cohortWithHighestDay7.value;
  if (best === null) {
    return `Avg D1: ${avg1} · Avg D7: ${avg7}`;
  }
  const bestRate = best.cohortSize === 0 ? 0 : best.day7ReturnCount / best.cohortSize;
  return `Avg D1: ${avg1} · Avg D7: ${avg7} · Best D7 cohort: ${best.cohortWeek} (${formatPercent(bestRate)})`;
});
</script>

<template>
  <div
    class="widget"
    data-testid="retention-cohorts-widget"
    aria-label="Retention cohorts"
  >
    <header class="widget-header">
      <h3>Retention Cohorts</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>Retention cohort data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-203 §Empty-state rule + §Widget Data Requirements — no
           cohorts → drop to empty arm; a heatmap with zero rows is not
           rendered. -->
      <p>No retention cohorts captured yet.</p>
    </div>

    <div v-else class="widget-data">
      <table class="cohort-table">
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Size</th>
            <th scope="col">D1 return</th>
            <th scope="col">D7 return</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in cohortRows" :key="row.cohortWeek">
            <th scope="row" class="cohort-week">{{ row.cohortWeek }}</th>
            <td class="cohort-size">{{ row.cohortSize.toLocaleString() }}</td>
            <!-- why: Vision §17 text-label-first accessibility — the
                 numeric rate text is the load-bearing display; the
                 intensity class only adds decorative shading. The
                 numeric label is ALWAYS visible regardless of color. -->
            <td :class="['cohort-cell', intensityClass(row.day1Rate)]">
              <span class="cell-label">{{ row.day1Label }}</span>
            </td>
            <td :class="['cohort-cell', intensityClass(row.day7Rate)]">
              <span class="cell-label">{{ row.day7Label }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <footer class="widget-footer">
        <span class="operator-summary">{{ footerLabel }}</span>
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
  height: 36px;
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
  gap: 0.6rem;
}

.cohort-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.cohort-table thead th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--p-content-border-color);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.cohort-table tbody th,
.cohort-table tbody td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.cohort-week {
  text-align: left;
  font-weight: 600;
  color: var(--p-text-color);
}

.cohort-size {
  color: var(--p-text-color);
}

.cohort-cell {
  text-align: right;
  color: var(--p-text-color);
}

.cell-label {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* why: Vision §17 — decorative intensity shading; numeric rate text in
   .cell-label is the load-bearing display. Color alone never the sole
   signal. Intensity buckets use `color-mix` over the primary token so
   they track theme toggles without hex literals. */
.cell-intensity-q0 {
  background: var(--p-content-background, var(--p-surface-card));
}
.cell-intensity-q1 {
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
}
.cell-intensity-q2 {
  background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
}
.cell-intensity-q3 {
  background: color-mix(in srgb, var(--p-primary-color) 32%, transparent);
}
.cell-intensity-q4 {
  background: color-mix(in srgb, var(--p-primary-color) 48%, transparent);
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
