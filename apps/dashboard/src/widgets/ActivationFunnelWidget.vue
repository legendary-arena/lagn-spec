<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type Ref } from 'vue';
import { useDateRange } from '../composables/useDateRange.js';
import { useActivationFunnel } from '../composables/useActivationFunnel.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchActivationFunnel } from '../services/mocks.js';
import BaseChart from '../components/charts/BaseChart.vue';
import type { EChartsOption } from 'echarts';
import { ACTIVATION_STEPS, type ActivationStep } from '../types/index.js';

/**
 * Resolve a PrimeVue design-token value from the document root for the
 * sparkline canvases on theme toggle. Mirrors the resolver pattern in
 * `NetRevenueChartWidget.vue` / `DauChartWidget.vue`.
 */
function readThemeColor(tokenName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

const { range } = useDateRange();

// why: WP-203 §Determinism scope — `nowMs` captured ONCE at widget mount
// so the funnel mock's data shape stays a pure function of (range, nowMs)
// over the widget's lifetime.
const nowMs = Date.now();

const response = computed(() => fetchActivationFunnel(range.value, nowMs));

const funnel = useActivationFunnel(() => response.value);

const updatedAtRef: Ref<number | null> = computed(() => funnel.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(
  () => funnel.source.value,
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

const themeVersion = ref(0);
function handleThemeChange(): void {
  themeVersion.value += 1;
}
onMounted(() => window.addEventListener('dashboard-theme-change', handleThemeChange));
onUnmounted(() => window.removeEventListener('dashboard-theme-change', handleThemeChange));

const STEP_LABEL: Readonly<Record<ActivationStep, string>> = {
  'signup-start': 'Signup started',
  'signup-complete': 'Signup completed',
  'first-match-started': 'First match started',
  'first-match-completed': 'First match completed',
};

// why: WP-157 Widget Contract + D-19608 Widget State Gate Pattern + WP-203
// §Widget Data Requirements — the widget enters `data` only when at least
// one `signup-start` count exists across the window. A funnel with zero
// entries at the top is uninformative; the empty arm renders instead
// (§Empty-state rule forbids rendering a zeroed-everywhere funnel).
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (funnel.stepCounts.value['signup-start'] === 0) {
    return 'empty';
  }
  return 'data';
});

function formatPercent(ratio: number): string {
  // why: D-19908 — `0%` not `NaN%` for zero-denominator branches.
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Per-step sparkline option. Each step gets its own small line chart
 * showing daily count over the range. Powered by the per-day series
 * filtered to the relevant step.
 */
function sparklineOption(step: ActivationStep): EChartsOption {
  void themeVersion.value;
  const lineColor = readThemeColor('--p-primary-color');
  const dataPoints: { date: string; count: number }[] = [];
  for (const entry of response.value.data) {
    if (entry.step === step) {
      dataPoints.push({ date: entry.date, count: entry.count });
    }
  }
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: {
      type: 'category',
      show: false,
      data: dataPoints.map((point) => point.date),
    },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }
        const first = params[0] as { axisValue: string; data: number };
        return `${first.axisValue}<br/>${first.data.toLocaleString()}`;
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color: lineColor, width: 1.5 },
        areaStyle: { color: lineColor, opacity: 0.15 },
        data: dataPoints.map((point) => point.count),
      },
    ],
  };
}

interface FunnelStageDisplay {
  readonly step: ActivationStep;
  readonly label: string;
  readonly count: number;
  readonly toNextConversionLabel: string;
  readonly isLastStep: boolean;
}

// why: WP-203 §Determinism scope — iterate ACTIVATION_STEPS in canonical
// order to render the funnel top-to-bottom. The last step has no outgoing
// conversion (no next stage to compare against); its `toNextConversionLabel`
// is the literal end-to-end ratio so the operator sees overall conversion
// rendered against the final stage.
const stages = computed<readonly FunnelStageDisplay[]>(() => {
  const result: FunnelStageDisplay[] = [];
  for (let stepIndex = 0; stepIndex < ACTIVATION_STEPS.length; stepIndex++) {
    const step = ACTIVATION_STEPS[stepIndex];
    if (step === undefined) {
      continue;
    }
    const isLastStep = stepIndex === ACTIVATION_STEPS.length - 1;
    const count = funnel.stepCounts.value[step];
    const conversionLabel = isLastStep
      ? formatPercent(funnel.overallConversion.value)
      : formatPercent(funnel.stepToStepConversion.value[step]);
    result.push({
      step,
      label: STEP_LABEL[step],
      count,
      toNextConversionLabel: conversionLabel,
      isLastStep,
    });
  }
  return result;
});

const footerLabel = computed<string>(() =>
  `Overall: ${formatPercent(funnel.overallConversion.value)} (signup-start → first-match-completed)`,
);
</script>

<template>
  <div
    class="widget"
    data-testid="activation-funnel-widget"
    aria-label="Activation funnel"
  >
    <header class="widget-header">
      <h3>Activation Funnel</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>Activation funnel data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-203 §Empty-state rule + §Widget Data Requirements —
           with zero signup-start counts the funnel is uninformative; the
           empty arm replaces rendering a zeroed funnel diagram. -->
      <p>No activation data captured for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <ol class="funnel-stages">
        <li
          v-for="stage in stages"
          :key="stage.step"
          class="funnel-stage"
        >
          <div class="stage-summary">
            <span class="stage-label">{{ stage.label }}</span>
            <span class="stage-count" :aria-label="`${stage.label} count`">
              {{ stage.count.toLocaleString() }}
            </span>
            <span
              v-if="!stage.isLastStep"
              class="stage-conversion"
              :aria-label="`Conversion to next stage`"
            >
              → {{ stage.toNextConversionLabel }}
            </span>
            <span
              v-else
              class="stage-conversion stage-conversion--final"
              aria-label="Overall conversion"
            >
              {{ stage.toNextConversionLabel }} overall
            </span>
          </div>
          <div class="stage-sparkline">
            <BaseChart :option="sparklineOption(stage.step)" height="36px" />
          </div>
        </li>
      </ol>
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
  gap: 0.75rem;
}

.funnel-stages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.funnel-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(100px, 30%);
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 6px;
}

.stage-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.stage-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
  flex: 1 1 100%;
}

.stage-count {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.stage-conversion {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.stage-conversion--final {
  color: var(--p-text-color);
}

.stage-sparkline {
  min-width: 0;
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
