<script setup lang="ts">
import { useFetch } from '../../composables/useFetch.js';
import { useDataFreshness } from '../../composables/useDataFreshness.js';
import { fetchPlayerRecords } from '../../services/endpoints.js';
import { formatPercent } from '../../utils/format.js';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import TrafficSourcesWidget from '../../widgets/TrafficSourcesWidget.vue';
import ActivationFunnelWidget from '../../widgets/ActivationFunnelWidget.vue';
import RetentionCohortsWidget from '../../widgets/RetentionCohortsWidget.vue';

const { data, loading, error, updatedAt, source } = useFetch(fetchPlayerRecords);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);
</script>

<template>
  <div class="players-page">
    <div class="page-header">
      <h1>Player Analytics</h1>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">Updated {{ relativeTime }}</span>
      </span>
    </div>

    <!-- why: WP-203 §Scope (In) Page wiring — the 3 full analytics
         widgets land in vertical layout: TrafficSources →
         ActivationFunnel → RetentionCohorts. Each widget reads its own
         composable (the page does not duplicate or pre-fetch state);
         the trend widgets pick up `useDateRange` from the route query
         automatically, and the cohorts widget defaults to 8 cohorts. -->
    <section class="analytics-stack" aria-label="Player analytics widgets">
      <TrafficSourcesWidget />
      <ActivationFunnelWidget />
      <RetentionCohortsWidget />
    </section>

    <div v-if="loading && !data" class="page-loading">
      <p>Loading player data...</p>
    </div>

    <div v-else-if="error" class="page-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="page-empty">
      <p>No player records found.</p>
    </div>

    <DataTable
      v-else
      :value="data"
      :loading="loading"
      :paginator="true"
      :rows="20"
      dataKey="id"
      filterDisplay="row"
      :globalFilterFields="['name', 'email', 'status']"
      :stripedRows="true"
      scrollable
      scrollHeight="60vh"
      class="player-table"
    >
      <Column field="name" header="Name" :sortable="true" filter />
      <Column field="email" header="Email" :sortable="true" filter />
      <Column field="matchesPlayed" header="Matches" :sortable="true" />
      <Column field="winRate" header="Win Rate" :sortable="true">
        <template #body="{ data: row }">
          {{ formatPercent(row.winRate) }}
        </template>
      </Column>
      <Column field="status" header="Status" :sortable="true" filter>
        <template #body="{ data: row }">
          <span class="status-badge" :class="'status-' + row.status">{{ row.status }}</span>
        </template>
      </Column>
      <Column field="lastActive" header="Last Active" :sortable="true">
        <template #body="{ data: row }">
          {{ new Date(row.lastActive).toLocaleDateString() }}
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.players-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.analytics-stack {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 { margin: 0; font-size: 1.5rem; color: var(--p-text-color); }

.freshness-badge {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  display: flex;
  gap: 0.5rem;
}

.freshness-badge .source {
  background: var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-color);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
}

.page-loading, .page-error, .page-empty {
  padding: 2rem;
  text-align: center;
}

.page-error { color: var(--p-text-color); }
.page-empty { color: var(--p-text-muted-color); }

/* why: status is shown as a labelled badge so it never relies on color alone;
   the text label is always present alongside the color cue. */
.status-badge {
  font-weight: 600;
  font-size: 0.8rem;
}

.status-active { color: var(--p-green-500); }
.status-inactive { color: var(--p-text-muted-color); }
.status-banned { color: var(--p-red-500); }
</style>
