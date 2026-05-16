<script setup lang="ts">
import { useFeatureFlags } from '../../composables/useFeatureFlags.js';
import { getWebSocketState } from '../../services/websocket.js';
import { version } from '../../../package.json';

const flags = useFeatureFlags();
const webSocketState = getWebSocketState();

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '(not set)';
const wsUrl = import.meta.env.VITE_WS_URL || '(not set)';
const useMocks = import.meta.env.VITE_USE_MOCKS || 'false';
const buildTimestamp = __BUILD_TIMESTAMP__;
</script>

<template>
  <div class="debug-page">
    <h1>Debug</h1>

    <div class="debug-section">
      <h2>Environment</h2>
      <table class="debug-table">
        <tbody>
          <tr>
            <td class="label">API Base URL</td>
            <td class="value">{{ apiBaseUrl }}</td>
          </tr>
          <tr>
            <td class="label">WebSocket URL</td>
            <td class="value">{{ wsUrl }}</td>
          </tr>
          <tr>
            <td class="label">Mock Mode</td>
            <td class="value">{{ useMocks }}</td>
          </tr>
          <tr>
            <td class="label">Build Timestamp</td>
            <td class="value">{{ buildTimestamp }}</td>
          </tr>
          <tr>
            <td class="label">App Version</td>
            <td class="value">{{ version }}</td>
          </tr>
          <tr>
            <td class="label">WebSocket State</td>
            <td class="value">{{ webSocketState }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="debug-section">
      <h2>Feature Flags</h2>
      <div v-if="flags.all.length === 0" class="no-flags">
        No feature flags enabled.
      </div>
      <ul v-else class="flags-list">
        <li v-for="flag in flags.all" :key="flag">{{ flag }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.debug-page {
  max-width: 700px;
}

.debug-page h1 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  color: #0f172a;
}

.debug-section {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.debug-section h2 {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: #334155;
}

.debug-table {
  width: 100%;
  border-collapse: collapse;
}

.debug-table td {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.85rem;
}

.debug-table .label {
  color: #64748b;
  width: 180px;
  font-weight: 500;
}

.debug-table .value {
  color: #0f172a;
  font-family: monospace;
}

.no-flags {
  color: #94a3b8;
  font-size: 0.85rem;
}

.flags-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.flags-list li {
  padding: 0.3rem 0.5rem;
  background: #f1f5f9;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
  display: inline-block;
  margin: 0.25rem 0.25rem 0.25rem 0;
}
</style>
