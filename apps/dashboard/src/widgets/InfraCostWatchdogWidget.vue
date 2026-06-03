<script setup lang="ts">
import { computed, type Ref } from 'vue';
import { useDateRange } from '../composables/useDateRange.js';
import { useInfraCostWatchdog } from '../composables/useInfraCostWatchdog.js';
import { useDataFreshness, type DataFreshnessSource } from '../composables/useDataFreshness.js';
import { fetchInfraCostEntries } from '../services/mocks.js';
import {
  INFRA_COST_VENDORS,
  type InfraCostVendor,
  type KpiStatus,
} from '../types/index.js';
import type { InfraCostBudget } from '../config/infraCostBudgets.js';

interface Props {
  /**
   * Per-vendor budget config injected by the page so the test suite can
   * exercise status-mapping edge cases with synthetic budgets per
   * D-20403. `SystemHealthPage.vue` passes `INFRA_COST_BUDGETS`.
   */
  readonly budgets: readonly InfraCostBudget[];
}

const props = defineProps<Props>();

const { range } = useDateRange();

// why: WP-204 §Determinism scope — capture nowMs ONCE at mount.
const nowMs = Date.now();

const response = computed(() => fetchInfraCostEntries(range.value, nowMs));

const watchdog = useInfraCostWatchdog(() => response.value, props.budgets);

const updatedAtRef: Ref<number | null> = computed(() => watchdog.updatedAt.value);
const sourceFreshnessRef: Ref<DataFreshnessSource | null> = computed(
  () => watchdog.source.value,
);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAtRef, sourceFreshnessRef);

// why: D-19608 Widget State Gate Pattern — single `state` computed gates
// the entire render via the 4-arm v-if chain. WP-204 §Widget Data
// Requirements: drop to `empty` when no vendor has current-month
// entries; rendering a 4-card grid with all `$0` is operationally
// indistinguishable from "missing data" and is forbidden per the
// §Empty-state rule.
const state = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
  const mtdMap = watchdog.mtdByVendor.value;
  let totalMtd = 0;
  for (const vendor of INFRA_COST_VENDORS) {
    totalMtd += mtdMap[vendor];
  }
  if (totalMtd === 0) {
    return 'empty';
  }
  return 'data';
});

const VENDOR_LABEL: Readonly<Record<InfraCostVendor, string>> = {
  render: 'Render',
  cloudflare: 'Cloudflare',
  postgres: 'Postgres',
  hanko: 'Hanko',
};

const STATUS_LABEL: Readonly<Record<KpiStatus, string>> = {
  'on-track': 'On track',
  'needs-attention': 'Needs attention',
  'off-track': 'Over budget',
};

/**
 * Format an integer cents value as a USD display string. Per §Cost math
 * invariants, the cents → USD boundary lives at the widget render
 * boundary only; the composable stays in integer-cents space.
 */
function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface VendorCard {
  readonly vendor: InfraCostVendor;
  readonly label: string;
  readonly mtdLabel: string;
  readonly projectedEomLabel: string;
  readonly budgetLabel: string;
  readonly status: KpiStatus;
  readonly statusLabel: string;
}

const vendorCards = computed<readonly VendorCard[]>(() => {
  const cards: VendorCard[] = [];
  const mtdMap = watchdog.mtdByVendor.value;
  const projectedMap = watchdog.projectedEomByVendor.value;
  const statusMap = watchdog.statusByVendor.value;
  // Build a per-vendor budget lookup so the loop doesn't repeatedly
  // scan props.budgets.
  const budgetByVendor: Record<InfraCostVendor, number> = {
    render: 0,
    cloudflare: 0,
    postgres: 0,
    hanko: 0,
  };
  for (const budget of props.budgets) {
    budgetByVendor[budget.vendor] = budget.monthlyBudgetCents;
  }
  // why: WP-204 §Determinism scope — iterate INFRA_COST_VENDORS in
  // canonical order so per-vendor card order is stable. Object-key
  // iteration on derived maps would be observation-order-dependent.
  for (const vendor of INFRA_COST_VENDORS) {
    const status: KpiStatus = statusMap[vendor];
    cards.push({
      vendor,
      label: VENDOR_LABEL[vendor],
      // why: §Cost math invariants — cents-to-display conversion at
      // the widget boundary only. The composable returns integer-
      // cents per D-19601; calling `formatUsd` here keeps composable
      // arithmetic locale-independent and test-friendly.
      mtdLabel: formatUsd(mtdMap[vendor]),
      projectedEomLabel: formatUsd(projectedMap[vendor]),
      budgetLabel: formatUsd(budgetByVendor[vendor]),
      status,
      // why: Widget display copy MAY render the 'off-track' cost case
      // as "Over budget" per WP-204 §Scope (In) — that's a display
      // string, NOT a fork of the enum.
      statusLabel: STATUS_LABEL[status],
    });
  }
  return cards;
});

const footerLabel = computed<string>(() => {
  const totalMtd = watchdog.totalMtdCents.value;
  const totalBudget = watchdog.totalMonthlyBudgetCents.value;
  const utilization = watchdog.totalBudgetUtilizationRatio.value;
  const utilizationPercent = `${(utilization * 100).toFixed(1)}%`;
  return `Total MTD: ${formatUsd(totalMtd)} · Total budget: ${formatUsd(totalBudget)} · Utilization: ${utilizationPercent}`;
});
</script>

<template>
  <div
    class="widget"
    data-testid="infra-cost-watchdog-widget"
    aria-label="Infrastructure cost watchdog by vendor"
  >
    <header class="widget-header">
      <h3>Infra Cost Watchdog</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>Cost data could not be loaded; please retry or check the dashboard status page.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <!-- why: WP-204 §Empty-state rule + §Widget Data Requirements —
           a 4-card grid with all `$0` MTD is operationally
           indistinguishable from "no cost data captured yet" and
           would mislead the operator into thinking the watchdog is
           working as intended. Explicit empty arm is the load-bearing
           UX signal. -->
      <p>No infrastructure cost entries captured for the selected range.</p>
    </div>

    <div v-else class="widget-data">
      <div class="card-grid">
        <article
          v-for="card in vendorCards"
          :key="card.vendor"
          class="vendor-card"
          :aria-label="`${card.label}: ${card.statusLabel}`"
        >
          <header class="card-header">
            <span class="vendor-label">{{ card.label }}</span>
            <!-- why: Vision §17 text-label-first accessibility — chip
                 text carries the load-bearing label; the per-status
                 class only varies color decoration. -->
            <span
              class="status-chip"
              :class="'status-' + card.status"
              :aria-label="`Cost status: ${card.statusLabel}`"
            >{{ card.statusLabel }}</span>
          </header>
          <dl class="card-amounts">
            <dt>MTD</dt>
            <dd class="amount-mtd">{{ card.mtdLabel }}</dd>
            <dt>EOM projection</dt>
            <dd>{{ card.projectedEomLabel }}</dd>
            <dt>Monthly budget</dt>
            <dd>{{ card.budgetLabel }}</dd>
          </dl>
        </article>
      </div>

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

.widget-loading .skeleton-row {
  height: 96px;
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

.card-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

@media (max-width: 999px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 599px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}

.vendor-card {
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vendor-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--p-text-color);
}

.status-chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-size: 0.65rem;
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

.card-amounts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.6rem;
  margin: 0;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.card-amounts dt {
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  font-size: 0.65rem;
  align-self: center;
}

.card-amounts dd {
  margin: 0;
  color: var(--p-text-color);
}

.amount-mtd {
  font-weight: 700;
  font-size: 1rem;
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
  font-variant-numeric: tabular-nums;
}
</style>
