<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';

import {
  fetchAdminBillingHistory,
  type AdminBillingEntry,
} from '../lib/api/adminBillingApi';

// why: defineComponent({ setup() { return {...} } }) is required (NOT
// <script setup>) because the template references non-prop bindings
// — the `state`, `entries`, and `errorMessage` values — that under
// the @legendary-arena/vue-sfc-loader separate-compile pipeline only
// reach `_ctx` when explicitly returned from setup() (D-6512 / P6-30;
// precedent matches App.vue, ArenaHud, PlayerProfilePage).

type PageState = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Format an ISO timestamp for display. Returns the raw string if
 * parsing fails so the UI never blanks a row.
 */
function formatTimestamp(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleString();
}

export default defineComponent({
  name: 'AdminBillingPage',
  setup() {
    const state = ref<PageState>('loading');
    const entries = ref<AdminBillingEntry[]>([]);
    const errorMessage = ref('');

    onMounted(async () => {
      const storedSecret = localStorage.getItem('adminSecret');
      if (storedSecret === null || storedSecret.length === 0) {
        const prompted = prompt('Enter admin secret:');
        if (prompted === null || prompted.length === 0) {
          state.value = 'error';
          errorMessage.value = 'Admin secret is required to view this page.';
          return;
        }
        localStorage.setItem('adminSecret', prompted);
      }

      const adminSecret = localStorage.getItem('adminSecret') ?? '';
      const result = await fetchAdminBillingHistory(adminSecret);

      if (result.ok === false) {
        if (result.status === 401) {
          localStorage.removeItem('adminSecret');
          state.value = 'error';
          errorMessage.value = 'Unauthorized. Check your admin secret and reload.';
          return;
        }
        state.value = 'error';
        errorMessage.value = `Failed to load billing history (HTTP ${result.status}).`;
        return;
      }

      if (result.value.length === 0) {
        state.value = 'empty';
        return;
      }

      entries.value = result.value;
      state.value = 'ready';
    });

    return {
      state,
      entries,
      errorMessage,
      formatTimestamp,
    };
  },
});
</script>

<template>
  <div class="admin-billing-page">
    <h1>Admin Billing History</h1>

    <div v-if="state === 'loading'" data-testid="admin-billing-loading">
      Loading billing records...
    </div>

    <div v-else-if="state === 'error'" data-testid="admin-billing-error">
      {{ errorMessage }}
    </div>

    <div v-else-if="state === 'empty'" data-testid="admin-billing-empty">
      No billing records found.
    </div>

    <table v-else data-testid="admin-billing-table" class="admin-billing-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Session</th>
          <th>Entitlement</th>
          <th>Status</th>
          <th>Created</th>
          <th>Completed</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.sessionId">
          <td>{{ entry.accountId }}</td>
          <td>{{ entry.sessionId }}</td>
          <td>{{ entry.entitlementKey }}</td>
          <td>{{ entry.intentStatus }}</td>
          <td>{{ formatTimestamp(entry.createdAt) }}</td>
          <td>{{ entry.completedAt !== null ? formatTimestamp(entry.completedAt) : '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.admin-billing-page {
  padding: 1.5rem;
  max-width: 72rem;
  margin: 0 auto;
}

.admin-billing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.admin-billing-table th,
.admin-billing-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #333);
}

.admin-billing-table th {
  font-weight: 600;
  white-space: nowrap;
}

.admin-billing-table td {
  font-family: monospace;
  word-break: break-all;
}
</style>
