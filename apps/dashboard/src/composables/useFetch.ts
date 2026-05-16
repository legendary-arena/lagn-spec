import { ref, onUnmounted, type Ref } from 'vue';
import type { ServiceResponse, ApiError } from '../types/index.js';

const DEFAULT_POLL_INTERVAL_MS = 30000;

interface UseFetchOptions {
  pollIntervalMs?: number;
  immediate?: boolean;
}

interface UseFetchReturn<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<ApiError | null>;
  updatedAt: Ref<number | null>;
  source: Ref<ServiceResponse<T>['source'] | null>;
  refresh: () => Promise<void>;
}

export function useFetch<T>(
  fetcher: () => Promise<ServiceResponse<T>>,
  options: UseFetchOptions = {},
): UseFetchReturn<T> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const immediate = options.immediate ?? true;

  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<ApiError | null>(null);
  const updatedAt = ref<number | null>(null);
  const source = ref<ServiceResponse<T>['source'] | null>(null) as Ref<ServiceResponse<T>['source'] | null>;

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

  function startPolling(): void {
    stopPolling();
    intervalId = setInterval(() => {
      if (!document.hidden) {
        refresh();
      }
    }, pollIntervalMs);
  }

  function stopPolling(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function handleVisibilityChange(): void {
    if (!document.hidden && isComponentMounted) {
      refresh();
    }
  }

  if (immediate) {
    refresh();
  }

  startPolling();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  onUnmounted(() => {
    isComponentMounted = false;
    stopPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return { data, loading, error, updatedAt, source, refresh };
}
