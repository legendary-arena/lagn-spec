<script setup lang="ts">
import { useFetch } from '../../composables/useFetch.js';
import { useDataFreshness } from '../../composables/useDataFreshness.js';
import { fetchRevenueRecords } from '../../services/endpoints.js';
import { formatCurrency } from '../../utils/format.js';
import RevenueChartWidget from '../../widgets/RevenueChartWidget.vue';
import NetRevenueChartWidget from '../../widgets/NetRevenueChartWidget.vue';
import PaidActionErrorsWidget from '../../widgets/PaidActionErrorsWidget.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

// why: D-19607 (Shared Revenue Source Contract) — the existing
// `RevenueChartWidget` and the new `NetRevenueChartWidget` consume revenue
// history exclusively through `fetchRevenueHistory(range)` and share the
// page-level `useDateRange()` reference. Mock determinism (D-19605) gives
// both widgets byte-identical revenue series for the same range, so
// `RevenueChartWidget`'s total equals `sum(NetRevenueChartWidget.series.gross)`
// without an explicit prop bridge.
const { data, loading, error, updatedAt, source } = useFetch(fetchRevenueRecords);
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);
</script>

<template>
  <div class="monetization-page">
    <div class="page-header">
      <h1>Monetization</h1>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">Updated {{ relativeTime }}</span>
      </span>
    </div>

    <RevenueChartWidget />

    <div class="widget-grid">
      <NetRevenueChartWidget />
      <PaidActionErrorsWidget />
    </div>

    <div v-if="loading && !data" class="page-loading">
      <p>Loading revenue data...</p>
    </div>

    <div v-else-if="error" class="page-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="!data || data.length === 0" class="page-empty">
      <p>No revenue records found.</p>
    </div>

    <DataTable
      v-else
      :value="data"
      :loading="loading"
      :paginator="true"
      :rows="20"
      dataKey="id"
      filterDisplay="row"
      class="revenue-table"
    >
      <Column field="date" header="Date" :sortable="true" filter />
      <Column field="amount" header="Amount" :sortable="true">
        <template #body="{ data: row }">
          {{ formatCurrency(row.amount, row.currency) }}
        </template>
      </Column>
      <Column field="source" header="Source" :sortable="true" filter />
      <Column field="currency" header="Currency" :sortable="true" />
    </DataTable>
  </div>
</template>

<style scoped>
.monetization-page {
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

.widget-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .widget-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
