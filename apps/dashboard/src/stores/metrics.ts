import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { KpiSnapshot, DailyMetric } from '../types/index.js';

export const useMetricsStore = defineStore('metrics', () => {
  const kpiSnapshots = ref<KpiSnapshot[]>([]);
  const dauHistory = ref<DailyMetric[]>([]);
  const revenueHistory = ref<DailyMetric[]>([]);

  function setKpiSnapshots(snapshots: KpiSnapshot[]): void {
    kpiSnapshots.value = snapshots;
  }

  function setDauHistory(history: DailyMetric[]): void {
    dauHistory.value = history;
  }

  function setRevenueHistory(history: DailyMetric[]): void {
    revenueHistory.value = history;
  }

  return {
    kpiSnapshots,
    dauHistory,
    revenueHistory,
    setKpiSnapshots,
    setDauHistory,
    setRevenueHistory,
  };
});
