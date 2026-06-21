<script setup lang="ts">
import { computed } from 'vue';
import { useGovernanceSnapshot } from '../../composables/useGovernanceSnapshot.js';
import {
  useAgentPipeline,
  laneItemCount,
  type PipelineLane,
  type PipelineItem,
  type PriorityRecommendation,
  type PipelineSweepData,
} from '../../composables/useAgentPipeline.js';
import {
  useSweepHealth,
  computeSweepHealthRate,
  type SweepHealthFetchState,
} from '../../composables/useSweepHealth.js';
import { useSweepTrend } from '../../composables/useSweepTrend.js';
import {
  useTriageStatus,
  type InspectionTriageFetchState,
  type HandoffChainFetchState,
} from '../../composables/useTriageStatus.js';
import { useCoverageLedger } from '../../composables/useCoverageLedger.js';
import { useArchitectGapIntake } from '../../composables/useArchitectGapIntake.js';
import { useDateRange } from '../../composables/useDateRange.js';
import {
  fetchSweepHealth,
  fetchInspectionTriage,
  fetchHandoffChain,
} from '../../services/mocks.js';
import SweepTrendChart from '../../components/charts/SweepTrendChart.vue';

const snapshot = useGovernanceSnapshot();

const { range } = useDateRange();

// why: Date.now() sampled once at render boundary per WP-204 carry-forward
// wall-clock discipline; passed to useSweepHealth as currentTimeMs.
const nowMs = Date.now();

const sweepFetchState = computed<SweepHealthFetchState>(() => {
  // MOCK-mode-first: the synchronous mock factory always resolves with data, so
  // `error` is null here. The future LIVE flip swaps `fetchSweepHealth` in
  // `mocks.ts` and may surface a real error through this same shape.
  return { response: fetchSweepHealth(range.value, nowMs), error: null };
});

const sweep = useSweepHealth(() => sweepFetchState.value, nowMs);

// Cadence-aware health-rate trend over the same `recentRuns` payload (no new
// fetch, no new `Date.now()` read). The composable owns the daily/weekly split.
const { series: sweepTrendSeries } = useSweepTrend(() => sweep.recentRuns.value);

// The composable consumes a plain projection of the sweep return value (not the
// composable itself), so the Pipeline composable stays testable without a fetch
// mock (D-23001). Sampled once, matching the once-call governance snapshot.
const sweepData: PipelineSweepData = {
  latestRun: sweep.latestRun.value,
  staleStatus: sweep.staleStatus.value,
  totalAnomalySparkline: sweep.totalAnomalySparkline.value,
};

// Triage surface (WP-239): two LIVE-capable fetchers feed the projection that
// injects inspection findings + handoff lifecycle into the Inspector lane.
// MOCK-mode-first — the synchronous mocks resolve with data, so `error` is null
// here; the LIVE flip swaps the fetchers in `mocks.ts` and may surface a real
// error through this same shape.
const inspectionFetchState = computed<InspectionTriageFetchState>(() => {
  return { response: fetchInspectionTriage(nowMs), error: null };
});
const handoffFetchState = computed<HandoffChainFetchState>(() => {
  return { response: fetchHandoffChain(nowMs), error: null };
});
const triage = useTriageStatus(
  () => inspectionFetchState.value,
  () => handoffFetchState.value,
  nowMs,
);

// Architect gap intake (WP-260): the runtime-confirmed hollow-effect overlay the
// Coverage page already exposes (`useCoverageLedger().runtimeObservedByMechanic`)
// is projected into draft-WP backlog candidates and folded into the Architect
// lane only. Same sample-once / dependency-injection shape as `sweepData` and
// `triage`; introduces no new fetch or data source. When the overlay carries no
// runtime-confirmed gaps (the committed zero-state), the projection is empty and
// the Architect lane renders its existing items unchanged.
const coverage = useCoverageLedger();
const architectGap = useArchitectGapIntake(coverage.runtimeObservedByMechanic);

// The projections are sampled once (like `sweepData`) and injected as the third
// and fourth arguments; the existing lane rendering consumes the `triage-`- and
// `architect-gap-`-prefixed items.
const pipeline = useAgentPipeline(undefined, sweepData, triage.value, architectGap.value);

const lanes = computed<readonly PipelineLane[]>(() => [
  pipeline.architect,
  pipeline.builder,
  pipeline.inspector,
  pipeline.evaluator,
]);

type PageState = 'loading' | 'error' | 'empty' | 'data';

const state = computed<PageState>(() => {
  if (snapshot.loadError) {
    return 'error';
  }
  let totalItems = 0;
  for (const lane of lanes.value) {
    totalItems += laneItemCount(lane);
  }
  if (totalItems === 0) {
    return 'empty';
  }
  return 'data';
});

interface TemporalSection {
  readonly heading: string;
  readonly items: readonly PipelineItem[];
  readonly emptyMessage: string;
}

function sectionsForLane(lane: PipelineLane): readonly TemporalSection[] {
  return [
    { heading: 'To Do', items: lane.backlog, emptyMessage: lane.emptyBacklog },
    { heading: 'Active', items: lane.active, emptyMessage: lane.emptyActive },
    { heading: 'History', items: lane.history, emptyMessage: lane.emptyHistory },
  ];
}

const HORIZON_LABELS: Record<string, string> = {
  today: 'Today',
  'this-week': 'This Week',
  'this-month': 'This Month',
  'this-quarter': 'This Quarter',
};

function horizonLabel(horizon: string): string {
  return HORIZON_LABELS[horizon] ?? horizon;
}

/**
 * Format an ISO timestamp into the dashboard's standard human-readable form.
 * Returns 'Unknown' for a missing value and the raw string for an unparseable
 * one, mirroring `formattedGeneratedAt`.
 */
function formatTimestamp(raw: string | null): string {
  if (!raw) {
    return 'Unknown';
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const formattedGeneratedAt = computed<string>(() => formatTimestamp(snapshot.generatedAt));

// --- Sweep summary bar (hidden when no sweep data) ---
const hasSweepData = computed<boolean>(() => sweep.latestRun.value !== null);

const sweepLastRunDate = computed<string>(() =>
  formatTimestamp(sweep.latestRun.value?.submittedAt ?? null),
);

const sweepCellCount = computed<number>(() => sweep.latestRun.value?.cellCount ?? 0);

const sweepTotalAnomalies = computed<number>(() => {
  const latest = sweep.latestRun.value;
  if (latest === null) {
    return 0;
  }
  // why: sum across ALL keys generically (Object.values) — the page treats
  // anomaly keys as opaque and never selects "interesting" ones (D-20703).
  let total = 0;
  for (const count of Object.values(latest.anomalyCounts)) {
    total += count;
  }
  return total;
});

const sweepHealthPercent = computed<number | null>(() => {
  // why (D-23503): the single health-rate source of truth. `computeSweepHealthRate`
  // names the healthy class and returns null for a 0-cell run.
  // It SUPERSEDES the prior `(cellCount − Σ all keys)/cellCount` KPI formula, which
  // read a structural 0% on live data. `sweepTotalAnomalies` survives only as the
  // opaque all-keys summary stat (D-20703) — it is no longer the health-rate input.
  const latest = sweep.latestRun.value;
  const rate = latest === null ? null : computeSweepHealthRate(latest);
  return rate === null ? null : Math.round(rate * 100);
});

const sweepHealthColorClass = computed<string>(() => {
  const percent = sweepHealthPercent.value;
  if (percent === null) {
    return 'health-unknown';
  }
  if (percent >= 80) {
    return 'health-green';
  }
  if (percent >= 50) {
    return 'health-yellow';
  }
  return 'health-red';
});

const sweepFreshnessLabel = computed<string>(() =>
  sweep.staleStatus.value === 'stale' ? 'Stale' : 'Fresh',
);

const sweepFreshnessClass = computed<string>(() =>
  sweep.staleStatus.value === 'stale' ? 'freshness-stale' : 'freshness-fresh',
);

interface SparklineBar {
  readonly heightPercent: number;
}

const sweepSparklineBars = computed<readonly SparklineBar[]>(() => {
  const values = [...sweep.totalAnomalySparkline.value];
  if (values.length === 0) {
    return [];
  }
  // why: normalize against the window max (floored at 1) so a flat zero series
  // renders as empty bars rather than dividing by zero.
  const maxValue = Math.max(...values, 1);
  const bars: SparklineBar[] = [];
  // Render oldest → newest (left → right) by reversing the most-recent-first
  // series, so the indicator reads chronologically.
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index]!;
    bars.push({ heightPercent: Math.round((value / maxValue) * 100) });
  }
  return bars;
});
</script>

<template>
  <div class="pipeline-page">
    <header class="pipeline-header">
      <h2>Pipeline</h2>
      <p class="pipeline-subtitle">Architect → Builder → Inspector → Evaluator</p>
    </header>

    <section class="pipeline-summary">
      <p>
        The four agent skills (<code>/agent-architect</code>, <code>/agent-builder</code>,
        <code>/agent-inspector</code>, <code>/agent-evaluator</code>) are Claude Code slash commands
        invoked in separate sessions to walk through each role in the checks-and-balances pipeline.
        Each lane below shows three temporal views: <strong>To Do</strong> (upcoming work),
        <strong>Active</strong> (current status), and <strong>History</strong> (past activity and
        revisions).
      </p>
      <p>
        After any session completes, running <code>pnpm dash:build</code> regenerates the snapshot
        from the repo's git log and WORK_INDEX state, and this page reflects the updated lanes
        automatically.
      </p>
    </section>

    <div class="pipeline-refresh-bar">
      <span class="refresh-timestamp">
        Last refreshed: <strong>{{ formattedGeneratedAt }}</strong>
      </span>
      <span class="refresh-steps">
        To update: <code>pnpm dash:build</code> → <code>pnpm dash:preview</code>
        (or deploy to Cloudflare Pages)
      </span>
    </div>

    <div v-if="hasSweepData" class="sweep-summary-bar" aria-label="Latest nightly sweep summary">
      <div class="sweep-stat">
        <span class="sweep-stat-label">Last sweep</span>
        <span class="sweep-stat-value">{{ sweepLastRunDate }}</span>
      </div>
      <div class="sweep-stat">
        <span class="sweep-stat-label">Cells run</span>
        <span class="sweep-stat-value">{{ sweepCellCount }}</span>
      </div>
      <div class="sweep-stat">
        <span class="sweep-stat-label">Total anomalies</span>
        <span class="sweep-stat-value">{{ sweepTotalAnomalies }}</span>
      </div>
      <div class="sweep-stat">
        <span class="sweep-stat-label">Health rate</span>
        <span class="sweep-health-value" :class="sweepHealthColorClass">
          {{ sweepHealthPercent === null ? '—' : `${sweepHealthPercent}%` }}
        </span>
      </div>
      <span
        class="sweep-freshness-chip"
        :class="sweepFreshnessClass"
        :aria-label="`Sweep freshness: ${sweepFreshnessLabel}`"
        >{{ sweepFreshnessLabel }}</span
      >
      <div class="sweep-trend" aria-label="Total anomalies trend across recent runs">
        <span class="sweep-trend-label">Trend</span>
        <span class="sweep-sparkline">
          <span
            v-for="(bar, index) in sweepSparklineBars"
            :key="index"
            class="sweep-sparkline-bar"
            :style="{ height: `${bar.heightPercent}%` }"
          ></span>
        </span>
      </div>
    </div>

    <section
      v-if="hasSweepData"
      class="sweep-trend-section"
      aria-label="Sweep health-rate trend across recent runs"
    >
      <h3 class="sweep-trend-heading">Sweep health-rate trend</h3>
      <SweepTrendChart :daily="sweepTrendSeries.daily" :weekly="sweepTrendSeries.weekly" />
    </section>

    <div v-if="state === 'loading'" class="pipeline-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="pipeline-error" role="alert">
      <p>
        The governance snapshot could not be loaded. Re-run
        <code>pnpm dash:build</code> or inspect the build logs for the underlying cause.
      </p>
    </div>

    <div v-else-if="state === 'empty'" class="pipeline-empty">
      <p>No pipeline activity to display.</p>
    </div>

    <div v-else class="pipeline-lanes">
      <article
        v-for="lane in lanes"
        :key="lane.title"
        class="lane-card"
        :aria-label="`${lane.title} lane`"
      >
        <h3 class="lane-title">{{ lane.title }}</h3>

        <div v-if="lane.priorities.length > 0" class="priority-strip">
          <h4 class="priority-heading">Top Priority</h4>
          <ul class="priority-list">
            <li
              v-for="priority in lane.priorities"
              :key="priority.horizon"
              class="priority-item"
              :class="`urgency-${priority.urgency}`"
            >
              <span class="priority-horizon">{{ horizonLabel(priority.horizon) }}</span>
              <span class="priority-label">{{ priority.label }}</span>
            </li>
          </ul>
        </div>

        <div v-for="section in sectionsForLane(lane)" :key="section.heading" class="lane-section">
          <h4 class="section-heading">{{ section.heading }}</h4>

          <ul v-if="section.items.length > 0" class="lane-items">
            <li v-for="item in section.items" :key="item.id" class="lane-item">
              <span class="item-label">{{ item.label }}</span>
              <span v-if="item.meta" class="item-meta">{{ item.meta }}</span>
            </li>
          </ul>

          <p v-else class="section-empty">{{ section.emptyMessage }}</p>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.pipeline-page {
  max-width: 1400px;
}

.pipeline-header {
  margin-bottom: 1.5rem;
}

.pipeline-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--p-text-color);
}

.pipeline-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.pipeline-summary {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--p-text-muted-color);
}

.pipeline-summary p {
  margin: 0;
}

.pipeline-summary p + p {
  margin-top: 0.6rem;
}

.pipeline-summary code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  background: var(--p-content-border-color);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  color: var(--p-text-color);
}

.pipeline-refresh-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 0.6rem 1rem;
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.pipeline-refresh-bar code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.7rem;
  background: var(--p-content-border-color);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  color: var(--p-text-color);
}

.refresh-timestamp strong {
  color: var(--p-text-color);
}

.sweep-summary-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 6px;
}

.sweep-trend-section {
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 6px;
}

.sweep-trend-heading {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--p-text-color);
}

.sweep-stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.sweep-stat-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.sweep-stat-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-text-color);
  font-variant-numeric: tabular-nums;
}

.sweep-health-value {
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.health-green {
  color: #22c55e;
}

.health-yellow {
  color: #eab308;
}

.health-red {
  color: #ef4444;
}

.health-unknown {
  color: var(--p-text-muted-color);
}

.sweep-freshness-chip {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--p-content-border-color);
}

.freshness-fresh {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.freshness-stale {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.sweep-trend {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-left: auto;
}

.sweep-trend-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.sweep-sparkline {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 24px;
  width: 120px;
}

.sweep-sparkline-bar {
  flex: 1;
  min-height: 1px;
  background: var(--p-primary-color, #6366f1);
  border-radius: 1px;
  opacity: 0.7;
}

.pipeline-loading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pipeline-loading .skeleton-row {
  height: 120px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
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

.pipeline-error {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
  color: var(--p-text-color);
  font-size: 0.85rem;
}

.pipeline-error code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  background: var(--p-content-border-color);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}

.pipeline-empty {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.pipeline-lanes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

@media (max-width: 1099px) {
  .pipeline-lanes {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 599px) {
  .pipeline-lanes {
    grid-template-columns: 1fr;
  }
}

.lane-card {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.lane-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.priority-strip {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-bottom: 0.6rem;
  border-bottom: 2px solid var(--p-primary-color, #6366f1);
}

.priority-heading {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-primary-color, #6366f1);
}

.priority-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.priority-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 5px;
  font-size: 0.72rem;
  line-height: 1.35;
  border-left: 3px solid transparent;
}

.priority-item.urgency-critical {
  background: rgba(239, 68, 68, 0.08);
  border-left-color: #ef4444;
}

.priority-item.urgency-high {
  background: rgba(249, 115, 22, 0.08);
  border-left-color: #f97316;
}

.priority-item.urgency-moderate {
  background: rgba(234, 179, 8, 0.08);
  border-left-color: #eab308;
}

.priority-item.urgency-strategic {
  background: rgba(34, 197, 94, 0.08);
  border-left-color: #22c55e;
}

.priority-horizon {
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  white-space: nowrap;
  min-width: 5rem;
  text-align: center;
}

.urgency-critical .priority-horizon {
  background: #ef4444;
  color: #fff;
}

.urgency-high .priority-horizon {
  background: #f97316;
  color: #fff;
}

.urgency-moderate .priority-horizon {
  background: #eab308;
  color: #1a1a1a;
}

.urgency-strategic .priority-horizon {
  background: #22c55e;
  color: #fff;
}

.priority-label {
  flex: 1;
  color: var(--p-text-color);
  word-break: break-word;
}

.lane-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.lane-section + .lane-section {
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-content-border-color, var(--p-surface-border));
}

.section-heading {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  opacity: 0.7;
}

.lane-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.lane-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 5px;
  font-size: 0.75rem;
  color: var(--p-text-color);
  line-height: 1.35;
}

.item-label {
  flex: 1;
  word-break: break-word;
}

.item-meta {
  flex-shrink: 0;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  background: var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.section-empty {
  margin: 0;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
