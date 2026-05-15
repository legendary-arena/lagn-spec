<script lang="ts">
import { defineComponent, onMounted, ref, type PropType } from 'vue';

import {
  fetchBillingHistory,
  fetchEntitlements,
  type BillingHistoryEntry,
  type EntitlementDisplay,
} from '../lib/api/billingApi';

// why: defineComponent({ setup() { return {...} } }) is required (NOT
// <script setup>) per D-6512 / P6-30 — the @legendary-arena/vue-sfc-loader
// separate-compile pipeline only reaches `_ctx` when explicitly returned
// from setup().

type PanelState = 'loading' | 'error' | 'empty' | 'ready';

function formatDate(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function formatEntitlementLabel(entitlementKey: string): string {
  return entitlementKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatSourceBadge(source: 'stripe' | 'admin_grant' | 'comp'): string {
  if (source === 'stripe') {
    return 'Purchased';
  }
  if (source === 'admin_grant') {
    return 'Granted';
  }
  return 'Complimentary';
}

function formatStatusBadge(
  intentStatus: 'open' | 'completed' | 'expired' | 'canceled',
): string {
  if (intentStatus === 'completed') {
    return 'Completed';
  }
  if (intentStatus === 'open') {
    return 'Open';
  }
  if (intentStatus === 'expired') {
    return 'Expired';
  }
  return 'Canceled';
}

export default defineComponent({
  name: 'BillingSection',
  props: {
    authToken: {
      type: [String, null] as unknown as PropType<string | null>,
      required: true,
    },
  },
  setup(props) {
    const benefitsState = ref<PanelState>('loading');
    const benefitsEntitlements = ref<EntitlementDisplay[]>([]);

    const historyState = ref<PanelState>('loading');
    const historyEntries = ref<BillingHistoryEntry[]>([]);

    async function loadBenefits(): Promise<void> {
      benefitsState.value = 'loading';
      const result = await fetchEntitlements(props.authToken);
      if (result.ok === true) {
        benefitsEntitlements.value = result.value;
        benefitsState.value = result.value.length === 0 ? 'empty' : 'ready';
        return;
      }
      benefitsState.value = 'error';
    }

    async function loadHistory(): Promise<void> {
      historyState.value = 'loading';
      const result = await fetchBillingHistory(props.authToken);
      if (result.ok === true) {
        historyEntries.value = result.value;
        historyState.value = result.value.length === 0 ? 'empty' : 'ready';
        return;
      }
      historyState.value = 'error';
    }

    onMounted(() => {
      void loadBenefits();
      void loadHistory();
    });

    return {
      benefitsState,
      benefitsEntitlements,
      historyState,
      historyEntries,
      formatDate,
      formatEntitlementLabel,
      formatSourceBadge,
      formatStatusBadge,
    };
  },
});
</script>

<template>
  <section class="billing-section">
    <h2>Billing &amp; Benefits</h2>

    <!-- Panel 1 — Active Benefits -->
    <div class="billing-panel">
      <h3>Active Benefits</h3>
      <p
        v-if="benefitsState === 'loading'"
        data-testid="billing-benefits-loading"
      >Loading benefits…</p>
      <p
        v-else-if="benefitsState === 'error'"
        class="billing-error"
        data-testid="billing-benefits-error"
      >Could not load benefits. Please try again later.</p>
      <p
        v-else-if="benefitsState === 'empty'"
        class="billing-empty"
        data-testid="billing-benefits-empty"
      >No active benefits. Visit the store to unlock cosmetics.</p>
      <ul
        v-else
        class="billing-list"
        data-testid="billing-benefits-ready"
      >
        <li
          v-for="(entitlement, index) in benefitsEntitlements"
          :key="index"
          class="billing-list-item"
        >
          <span class="billing-label">{{ formatEntitlementLabel(entitlement.entitlementKey) }}</span>
          <span class="billing-badge">{{ formatSourceBadge(entitlement.source) }}</span>
          <span class="billing-date">{{ formatDate(entitlement.grantedAt) }}</span>
        </li>
      </ul>
    </div>

    <!-- Panel 2 — Purchase History -->
    <div class="billing-panel">
      <h3>Purchase History</h3>
      <p
        v-if="historyState === 'loading'"
        data-testid="billing-history-loading"
      >Loading purchase history…</p>
      <p
        v-else-if="historyState === 'error'"
        class="billing-error"
        data-testid="billing-history-error"
      >Could not load purchase history. Please try again later.</p>
      <p
        v-else-if="historyState === 'empty'"
        class="billing-empty"
        data-testid="billing-history-empty"
      >No purchases yet.</p>
      <ul
        v-else
        class="billing-list"
        data-testid="billing-history-ready"
      >
        <li
          v-for="(entry, index) in historyEntries"
          :key="index"
          class="billing-list-item"
        >
          <span class="billing-label">{{ formatEntitlementLabel(entry.entitlementKey) }}</span>
          <span class="billing-badge">{{ formatStatusBadge(entry.intentStatus) }}</span>
          <span class="billing-date">{{ formatDate(entry.createdAt) }}</span>
        </li>
      </ul>
    </div>

    <!-- Panel 3 — Community Funding -->
    <div class="billing-panel" data-testid="billing-funding-panel">
      <h3>Community Funding</h3>
      <p class="billing-funding-blurb">
        Legendary Arena tournaments are community-funded and non-profit by
        design. Contributions cover incremental infrastructure costs only —
        hosting, bandwidth, and similar operational line items — never prizes,
        organizer income, or platform development. Contributions are
        reconciled against published costs at regular intervals on Open
        Collective. See TOURNAMENT-FUNDING.md for the full policy.
      </p>
      <p class="billing-funding-link">
        <a
          href="https://opencollective.com/legendary-arena"
          target="_blank"
          rel="noopener noreferrer"
        >View on Open Collective</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.billing-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.billing-section h2 {
  font-size: 1.125rem;
  margin: 0 0 0.5rem 0;
}

.billing-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.billing-panel h3 {
  font-size: 1rem;
  margin: 0;
}

.billing-error {
  color: #c0392b;
  font-size: 0.875rem;
}

.billing-empty {
  font-size: 0.875rem;
  opacity: 0.75;
}

.billing-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.billing-list-item {
  display: grid;
  grid-template-columns: 1fr 6rem 8rem;
  gap: 0.5rem;
  font-size: 0.875rem;
  align-items: baseline;
}

.billing-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: #e8e8e8;
  text-align: center;
}

.billing-date {
  color: rgba(0, 0, 0, 0.65);
}

.billing-funding-blurb {
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0;
}

.billing-funding-link {
  font-size: 0.875rem;
  margin: 0;
}

.billing-funding-link a {
  color: inherit;
  text-decoration: underline;
}
</style>
