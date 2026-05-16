<script setup lang="ts">
import { useFetch } from '../../composables/useFetch.js';
import { useDataFreshness } from '../../composables/useDataFreshness.js';
import { fetchServerNodes } from '../../services/endpoints.js';
import { formatUptime } from '../../utils/format.js';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

const { data, loading, error, updatedAt, source } = useFetch(fetchServerNodes);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);
</script>

<template>
  <div class="system-page">
    <div class="page-header">
      <h1>System Health</h1>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">Updated {{ relativeTime }}</span>
      </span>
    </div>

    <div v-if="loading && !data" class="page-loading">
      <p>Loading server data...</p>
    </div>

    <div v-else-if="error" class="page-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="page-empty">
      <p>No server nodes found.</p>
    </div>

    <DataTable
      v-else
      :value="data"
      :loading="loading"
      :paginator="true"
      :rows="20"
      dataKey="id"
      filterDisplay="row"
      class="nodes-table"
    >
      <Column field="name" header="Node" :sortable="true" filter />
      <Column field="region" header="Region" :sortable="true" filter />
      <Column field="status" header="Status" :sortable="true" filter>
        <template #body="{ data: row }">
          <span :class="'node-status-' + row.status">{{ row.status }}</span>
        </template>
      </Column>
      <Column field="cpuPercent" header="CPU %" :sortable="true">
        <template #body="{ data: row }">
          {{ row.cpuPercent }}%
        </template>
      </Column>
      <Column field="memoryPercent" header="Memory %" :sortable="true">
        <template #body="{ data: row }">
          {{ row.memoryPercent }}%
        </template>
      </Column>
      <Column field="activeConnections" header="Connections" :sortable="true" />
      <Column field="uptime" header="Uptime" :sortable="true">
        <template #body="{ data: row }">
          {{ formatUptime(row.uptime) }}
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.system-page {
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

.page-loading, .page-error, .page-empty { padding: 2rem; text-align: center; }
.page-error { color: #dc2626; }
.page-empty { color: #94a3b8; }

.node-status-healthy { color: #16a34a; font-weight: 600; }
.node-status-degraded { color: #d97706; font-weight: 600; }
.node-status-down { color: #dc2626; font-weight: 600; }
</style>
