import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AlertItem } from '../types/index.js';

export const useAlertsStore = defineStore('alerts', () => {
  const alerts = ref<AlertItem[]>([]);

  const unacknowledgedCount = computed(
    () => alerts.value.filter((alert) => !alert.acknowledged).length,
  );

  function setAlerts(newAlerts: AlertItem[]): void {
    alerts.value = newAlerts;
  }

  function acknowledge(alertId: string): void {
    const alert = alerts.value.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  return { alerts, unacknowledgedCount, setAlerts, acknowledge };
});
