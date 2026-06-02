<script setup lang="ts">
// why: D-19902 — this strip is ADDITIVE. The existing 4-card mock KPI strip
// (`active-players` / `matches-running` / `revenue-today` / `server-health`)
// stays as a forward-looking placeholder for player-side metrics that
// arrive in WP-B (acquisition + funnel). Replacing it would force a UX
// decision about player KPIs ahead of the WP-B PII / data-source posture.
// The real-data strip rendering here makes the first thing the operator
// sees real ("WPs Done This Week"), the second thing seen honestly-labeled
// placeholder.

import { computed, ref } from 'vue';
import { useGovernanceSnapshot } from '../composables/useGovernanceSnapshot.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import { computeKpiStatus } from '../utils/kpiStatus.js';
import type { GovernanceKpis, KpiSnapshot, KpiStatus } from '../types/index.js';

interface GovernanceKpiCard {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly target: number;
  readonly tolerance: number;
  readonly direction: 'higher-is-better' | 'lower-is-better';
}

const governance = useGovernanceSnapshot();

const generatedAtMillis = ref<number | null>(null);
if (governance.generatedAt !== '') {
  const parsedMillis = Date.parse(governance.generatedAt);
  generatedAtMillis.value = Number.isNaN(parsedMillis) ? null : parsedMillis;
}
const sourceRef = ref<'BUILD'>('BUILD');
const { relativeTime, sourceLabel } = useDataFreshness(generatedAtMillis, sourceRef);

const kpis = computed<GovernanceKpis | null>(() => governance.governanceKpis());

const cards = computed<readonly GovernanceKpiCard[]>(() => {
  const current = kpis.value;
  if (current === null) {
    return [];
  }
  // why: D-19902 placeholder targets — operator-tunable in a follow-up. Locked
  // here in source-controlled config (no UI editor), per WP-199 §Out of
  // Scope. wps-done-this-week is higher-is-better (more shipped = better);
  // the other two are lower-is-better (fewer days idle, fewer stuck drafts).
  return [
    {
      id: 'wps-done-this-week',
      label: 'WPs Done This Week',
      value: current.wpsDoneThisWeek,
      target: 3,
      tolerance: 2,
      direction: 'higher-is-better',
    },
    {
      id: 'days-since-last-done-flip',
      label: 'Days Since Last Done Flip',
      value: current.daysSinceLastDoneFlip,
      target: 2,
      tolerance: 3,
      direction: 'lower-is-better',
    },
    {
      id: 'open-drafts',
      label: 'Open Drafts',
      value: current.openDrafts,
      target: 5,
      tolerance: 5,
      direction: 'lower-is-better',
    },
  ];
});

const STATUS_LABELS: Readonly<Record<KpiStatus, string>> = {
  'on-track': 'On track',
  'off-track': 'Off track',
  'needs-attention': 'Needs attention',
};

function toKpiSnapshot(card: GovernanceKpiCard): KpiSnapshot {
  return {
    id: card.id,
    label: card.label,
    value: card.value,
    previousValue: card.value,
    unit: 'count',
    trend: 'flat',
    target: card.target,
    tolerance: card.tolerance,
    direction: card.direction,
  };
}

function statusFor(card: GovernanceKpiCard): KpiStatus | null {
  return computeKpiStatus(toKpiSnapshot(card));
}

function statusLabelFor(card: GovernanceKpiCard): string {
  const status = statusFor(card);
  if (status === null) {
    return '';
  }
  return STATUS_LABELS[status];
}

type WidgetState = 'loading' | 'error' | 'empty' | 'data';
const state = computed<WidgetState>(() => {
  if (governance.loadError) {
    return 'error';
  }
  if (kpis.value === null) {
    return 'empty';
  }
  return 'data';
});
</script>

<template>
  <div class="widget governance-kpi-strip">
    <header class="widget-header">
      <h3>Governance KPIs</h3>
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
      <p>The governance snapshot could not be loaded; please re-run pnpm dash:build or inspect the script logs for the underlying cause.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <p>No governance KPIs available; the build-time snapshot is missing its governanceKpis field.</p>
    </div>

    <div v-else class="kpi-strip-grid">
      <article
        v-for="card in cards"
        :key="card.id"
        class="governance-kpi-card"
        :aria-label="card.label"
      >
        <span class="kpi-label">{{ card.label }}</span>
        <span class="kpi-value">{{ card.value }}</span>
        <span
          v-if="statusFor(card)"
          class="kpi-status-chip"
          :class="`status-${statusFor(card)}`"
          :aria-label="`Status: ${statusLabelFor(card)}`"
        >
          <span class="status-label">{{ statusLabelFor(card) }}</span>
        </span>
      </article>
    </div>
  </div>
</template>

<style scoped>
.widget {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
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

.kpi-strip-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

@media (max-width: 899px) {
  .kpi-strip-grid {
    grid-template-columns: 1fr;
  }
}

.governance-kpi-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 6px;
}

.kpi-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.kpi-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--p-text-color);
  line-height: 1;
}

.kpi-status-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 12%, transparent);
  align-self: flex-start;
}

.kpi-status-chip.status-on-track { color: var(--p-green-500); }
.kpi-status-chip.status-off-track { color: var(--p-red-500); }
.kpi-status-chip.status-needs-attention { color: var(--p-yellow-500); }
</style>
