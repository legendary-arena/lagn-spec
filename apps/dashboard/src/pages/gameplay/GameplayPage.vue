<script setup lang="ts">
import { useFetch } from '../../composables/useFetch.js';
import { useDataFreshness } from '../../composables/useDataFreshness.js';
import { fetchMatchRecords } from '../../services/endpoints.js';
import { formatDuration } from '../../utils/format.js';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

const { data, loading, error, updatedAt, source } = useFetch(fetchMatchRecords);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);
</script>

<template>
  <div class="gameplay-page">
    <div class="page-header">
      <h1>Gameplay</h1>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">Updated {{ relativeTime }}</span>
      </span>
    </div>

    <div v-if="loading && !data" class="page-loading">
      <p>Loading match data...</p>
    </div>

    <div v-else-if="error" class="page-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="page-empty">
      <p>No match records found.</p>
    </div>

    <DataTable
      v-else
      :value="data"
      :loading="loading"
      :paginator="true"
      :rows="20"
      dataKey="id"
      filterDisplay="row"
      class="match-table"
    >
      <Column field="startedAt" header="Started" :sortable="true">
        <template #body="{ data: row }">
          {{ new Date(row.startedAt).toLocaleString() }}
        </template>
      </Column>
      <Column field="scheme" header="Scheme" :sortable="true" filter />
      <Column field="mastermind" header="Mastermind" :sortable="true" filter />
      <Column field="playerCount" header="Players" :sortable="true" />
      <Column field="duration" header="Duration" :sortable="true">
        <template #body="{ data: row }">
          {{ formatDuration(row.duration) }}
        </template>
      </Column>
      <Column field="outcome" header="Outcome" :sortable="true" filter>
        <template #body="{ data: row }">
          <span :class="'outcome-' + row.outcome">
            {{ row.outcome.replace('_', ' ') }}
          </span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.gameplay-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}

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

.page-loading,
.page-error,
.page-empty {
  padding: 2rem;
  text-align: center;
}
.page-error {
  color: #dc2626;
}
.page-empty {
  color: #94a3b8;
}

.outcome-hero_wins {
  color: #16a34a;
  font-weight: 600;
}
.outcome-villain_wins {
  color: #dc2626;
  font-weight: 600;
}
.outcome-in_progress {
  color: #d97706;
}
</style>
