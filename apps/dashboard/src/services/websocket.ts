import { ref } from 'vue';
import type { WebSocketState } from '../types/index.js';

const connectionState = ref<WebSocketState>('disabled');

export function getWebSocketState() {
  return connectionState;
}

/**
 * Placeholder for future WebSocket connection (WP-161).
 * Currently only exposes connection state for the debug page.
 */
export function initializeWebSocket(): void {
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (!wsUrl) {
    connectionState.value = 'disabled';
    return;
  }
  connectionState.value = 'disconnected';
}
