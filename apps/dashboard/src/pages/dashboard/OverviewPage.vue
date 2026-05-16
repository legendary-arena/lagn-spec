<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useDateRange } from '../../composables/useDateRange.js';
import KpiCard from '../../widgets/KpiCard.vue';
import DauChartWidget from '../../widgets/DauChartWidget.vue';
import RevenueChartWidget from '../../widgets/RevenueChartWidget.vue';
import AlertsPanel from '../../widgets/AlertsPanel.vue';
import type { KpiSnapshot } from '../../types/index.js';

const router = useRouter();
const { range, setRange, validRanges } = useDateRange();

function handleKpiClick(kpi: KpiSnapshot): void {
  if (kpi.id === 'active-players') {
    router.push({ name: 'players' });
  } else if (kpi.id === 'revenue-today') {
    router.push({ name: 'monetization' });
  } else if (kpi.id === 'matches-running') {
    router.push({ name: 'gameplay' });
  } else if (kpi.id === 'server-health') {
    router.push({ name: 'system' });
  }
}
</script>

<template>
  <div class="overview-page">
    <div class="page-header">
      <h1>Overview</h1>
      <div class="range-selector">
        <button
          v-for="rangeOption in validRanges"
          :key="rangeOption"
          :class="{ active: range === rangeOption }"
          @click="setRange(rangeOption)"
        >
          {{ rangeOption }}
        </button>
      </div>
    </div>

    <div class="kpi-grid">
      <KpiCard kpi-id="active-players" @click="handleKpiClick" />
      <KpiCard kpi-id="matches-running" @click="handleKpiClick" />
      <KpiCard kpi-id="revenue-today" @click="handleKpiClick" />
      <KpiCard kpi-id="server-health" @click="handleKpiClick" />
    </div>

    <div class="charts-grid">
      <DauChartWidget />
      <RevenueChartWidget />
    </div>

    <AlertsPanel />
  </div>
</template>

<style scoped>
.overview-page {
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

.range-selector {
  display: flex;
  gap: 0.25rem;
  background: #e2e8f0;
  border-radius: 6px;
  padding: 0.2rem;
}

.range-selector button {
  padding: 0.4rem 0.75rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 0.8rem;
  cursor: pointer;
  color: #475569;
}

.range-selector button.active {
  background: #ffffff;
  color: #0f172a;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1rem;
}
</style>
