<script setup lang="ts">
// why: WP-203 anti-premature-abstraction note (per EC-231 §Required
// `// why:`): "The strip reads 3 composables directly because its
// derivations are trivial (`.slice(0,3)` + sum); extracting a 4th
// `useAcquisitionStripSummary` composable would be premature per 00.6
// §16.1 (rule of three). If the strip later needs cross-composable
// joins, extract at that point — do not pre-extract." The 3 composables
// are `useTrafficSources` (visitor / signup totals + per-channel pills),
// `useActivationFunnel` (activation count from the funnel's last step),
// and `useRetentionCohorts` (day-1 return rate as the supplementary
// stickiness indicator below the 3 cards).

import { computed, ref, type Ref } from 'vue';
import { useTrafficSources } from '../composables/useTrafficSources.js';
import { useActivationFunnel } from '../composables/useActivationFunnel.js';
import { useRetentionCohorts } from '../composables/useRetentionCohorts.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import {
  fetchTrafficSources,
  fetchActivationFunnel,
  fetchRetentionCohorts,
} from '../services/mocks.js';
import {
  ACQUISITION_CHANNELS,
  type AcquisitionChannel,
  type DateRange,
} from '../types/index.js';

const STRIP_RANGE: DateRange = '14d';
const STRIP_COHORT_COUNT = 8;

// why: WP-203 §Determinism scope — `nowMs` captured ONCE at mount; the
// 3 mock factories receive a stable timestamp so per-card derivations
// are reactive-stable.
const nowMs = Date.now();

const trafficResponse = computed(() => fetchTrafficSources(STRIP_RANGE, nowMs));
const funnelResponse = computed(() => fetchActivationFunnel(STRIP_RANGE, nowMs));
const retentionResponse = computed(() =>
  fetchRetentionCohorts(STRIP_COHORT_COUNT, nowMs),
);

const traffic = useTrafficSources(() => trafficResponse.value);
const funnel = useActivationFunnel(() => funnelResponse.value);
const retention = useRetentionCohorts(() => retentionResponse.value);

const updatedAtRef: Ref<number | null> = computed(() => traffic.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(
  () => traffic.source.value,
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

const CHANNEL_LABEL: Readonly<Record<AcquisitionChannel, string>> = {
  direct: 'Direct',
  search: 'Search',
  referral: 'Referral',
  paid: 'Paid',
};

// why: WP-157 Widget Contract + D-19608 Widget State Gate Pattern +
// WP-203 §Widget Data Requirements — the strip enters `data` only when
// `totalVisitors > 0`. Below that, the strip renders the explicit `empty`
// arm; rendering zero-percent pills is forbidden per §Strip channel
// collapse + §Empty-state rule.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  if (traffic.totalVisitors.value === 0) {
    return 'empty';
  }
  return 'data';
});

interface ChannelPill {
  readonly channel: AcquisitionChannel;
  readonly label: string;
  readonly percent: number;
  readonly percentLabel: string;
}

const pills = computed<readonly ChannelPill[]>(() => {
  const totals = traffic.totalsByChannel.value;
  const paidTotal = totals.paid;
  // why: WP-203 §Strip channel collapse — if `paid` visitors summed = 0
  // across the 14-day window, exclude `paid` from the pill row entirely
  // AND rebalance the remaining 3 channels to sum to 100% over their
  // reduced denominator. NEVER render a zero-percent pill (visual noise).
  // If `paid` summed > 0, all 4 channels render at their actual share.
  const includePaid = paidTotal > 0;
  const channels: AcquisitionChannel[] = [];
  // why: WP-203 §Determinism scope — iterate ACQUISITION_CHANNELS in
  // canonical order so pill order is stable. `paid` is the last entry;
  // excluding it leaves the natural direct → search → referral order.
  for (const channel of ACQUISITION_CHANNELS) {
    if (channel === 'paid' && !includePaid) {
      continue;
    }
    channels.push(channel);
  }
  let denominator = 0;
  for (const channel of channels) {
    denominator += totals[channel];
  }
  const result: ChannelPill[] = [];
  for (const channel of channels) {
    // why: D-19908 — zero-denominator returns `0`, not `NaN`. The widget
    // empty arm catches the `totalVisitors === 0` case before this
    // executes; the guard here protects against single-channel-only
    // edge inputs (e.g. all direct, paid summed = 0, all others 0).
    const percent = denominator === 0 ? 0 : (totals[channel] / denominator) * 100;
    result.push({
      channel,
      label: CHANNEL_LABEL[channel],
      percent,
      percentLabel: `${percent.toFixed(1)}%`,
    });
  }
  return result;
});

interface TopLineCard {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly valueLabel: string;
}

const cards = computed<readonly TopLineCard[]>(() => {
  const activationCount = funnel.stepCounts.value['first-match-completed'];
  return [
    {
      id: 'visitors',
      label: 'Visitors (14d)',
      value: traffic.totalVisitors.value,
      valueLabel: traffic.totalVisitors.value.toLocaleString(),
    },
    {
      id: 'signups',
      label: 'Signups (14d)',
      value: traffic.totalSignups.value,
      valueLabel: traffic.totalSignups.value.toLocaleString(),
    },
    {
      id: 'activations',
      label: 'Activations (14d)',
      value: activationCount,
      valueLabel: activationCount.toLocaleString(),
    },
  ];
});

const day1RetentionLabel = computed<string>(() => {
  // why: D-19908 — `0.0%` not `NaN%`; the composable already returns 0
  // for empty cohorts but the label format guard mirrors the contract.
  const rate = retention.averageDay1Rate.value;
  return `${(rate * 100).toFixed(1)}%`;
});
</script>

<template>
  <div
    class="widget acquisition-strip"
    data-testid="acquisition-funnel-strip-widget"
    aria-label="Acquisition funnel summary"
  >
    <header class="widget-header">
      <h3>Acquisition (14 days)</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>Acquisition data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-203 §Empty-state rule + §Widget Data Requirements —
           with zero visitors across the 14-day window the pill row is
           hidden entirely (zero-percent pills are visual noise). -->
      <p>No traffic captured in the last 14 days.</p>
    </div>

    <div v-else class="widget-data">
      <div class="card-row">
        <article
          v-for="card in cards"
          :key="card.id"
          class="strip-card"
          :aria-label="card.label"
        >
          <span class="card-label">{{ card.label }}</span>
          <span class="card-value">{{ card.valueLabel }}</span>
        </article>
      </div>

      <div class="pill-row" aria-label="Channel share of visitors">
        <span
          v-for="pill in pills"
          :key="pill.channel"
          class="channel-pill"
          :aria-label="`${pill.label}: ${pill.percentLabel}`"
        >
          <span class="pill-label">{{ pill.label }}</span>
          <span class="pill-value">{{ pill.percentLabel }}</span>
        </span>
      </div>

      <footer class="widget-footer">
        <span class="day1-retention">Day-1 retention: {{ day1RetentionLabel }}</span>
        <!-- why: depth-on-demand UX — the strip is a glance surface on
             Overview; the full funnel widgets live on `/players`. The
             link gives the operator a single click to drill into the
             complete breakdown. -->
        <router-link to="/players" class="full-funnel-link">View full funnel →</router-link>
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
  gap: 0.75rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  height: 56px;
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

.card-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

@media (max-width: 899px) {
  .card-row {
    grid-template-columns: 1fr;
  }
}

.strip-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.6rem 0.9rem;
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 6px;
}

.card-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.card-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--p-text-color);
  line-height: 1;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.channel-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
  color: var(--p-text-color);
}

.pill-label {
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.pill-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.widget-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.4rem;
  border-top: 1px solid var(--p-content-border-color);
  font-size: 0.8rem;
}

.day1-retention {
  color: var(--p-text-muted-color);
  font-weight: 600;
}

.full-funnel-link {
  color: var(--p-primary-color);
  font-weight: 600;
  text-decoration: none;
}

.full-funnel-link:hover,
.full-funnel-link:focus-visible {
  text-decoration: underline;
}
</style>
