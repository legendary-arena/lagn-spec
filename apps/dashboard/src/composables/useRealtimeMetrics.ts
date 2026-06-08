import { ref, onUnmounted, type Ref } from 'vue';
import type { ServiceResponse, ApiError } from '../types/index.js';

const REALTIME_POLL_INTERVAL_MS = 10000;

interface UseRealtimeMetricsReturn<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<ApiError | null>;
  updatedAt: Ref<number | null>;
  source: Ref<ServiceResponse<T>['source'] | null>;
}

/**
 * A faster-polling variant of useFetch, intended for widgets that display
 * near-real-time data (active players, running matches). Polls every 10s
 * instead of the default 30s. Will be replaced by WebSocket push in WP-161.
 */
export function useRealtimeMetrics<T>(
  fetcher: () => Promise<ServiceResponse<T>>,
): UseRealtimeMetricsReturn<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<ApiError | null>(null);
  const updatedAt = ref<number | null>(null);
  const source = ref<ServiceResponse<T>['source'] | null>(null) as Ref<
    ServiceResponse<T>['source'] | null
  >;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isComponentMounted = true;

  async function refresh(): Promise<void> {
    if (!isComponentMounted) {
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const response = await fetcher();
      if (!isComponentMounted) {
        return;
      }
      data.value = response.data;
      updatedAt.value = response.updatedAt;
      source.value = response.source;
    } catch (caughtError: unknown) {
      if (!isComponentMounted) {
        return;
      }
      error.value = caughtError as ApiError;
    } finally {
      if (isComponentMounted) {
        loading.value = false;
      }
    }
  }

  refresh();

  intervalId = setInterval(() => {
    if (!document.hidden) {
      refresh();
    }
  }, REALTIME_POLL_INTERVAL_MS);

  onUnmounted(() => {
    isComponentMounted = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });

  return { data, loading, error, updatedAt, source };
}
