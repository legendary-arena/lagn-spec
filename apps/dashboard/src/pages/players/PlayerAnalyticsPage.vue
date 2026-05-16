<script setup lang="ts">
import { useFetch } from '../../composables/useFetch.js';
import { useDataFreshness } from '../../composables/useDataFreshness.js';
import { fetchPlayerRecords } from '../../services/endpoints.js';
import { formatPercent } from '../../utils/format.js';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

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
          <span :class="'status-' + row.status">{{ row.status }}</span>
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

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 { margin: 0; font-size: 1.5rem; color: #0f172a; }

.freshness-badge {
  font-size: 0.75rem;
  color: #94a3b8;
  display: flex;
  gap: 0.5rem;
}

.freshness-badge .source {
  background: #f1f5f9;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
}

.page-loading, .page-error, .page-empty {
  padding: 2rem;
  text-align: center;
}

.page-error { color: #dc2626; }
.page-empty { color: #94a3b8; }

.status-active { color: #16a34a; font-weight: 600; }
.status-inactive { color: #94a3b8; }
.status-banned { color: #dc2626; font-weight: 600; }
</style>
