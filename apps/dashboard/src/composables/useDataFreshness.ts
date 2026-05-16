import { computed, ref, onUnmounted, type Ref, type ComputedRef } from 'vue';
import type { ServiceResponse } from '../types/index.js';

interface UseDataFreshnessReturn {
  relativeTime: ComputedRef<string>;
  sourceLabel: ComputedRef<string>;
}

export function useDataFreshness(
  updatedAt: Ref<number | null>,
  source: Ref<ServiceResponse<unknown>['source'] | null>,
): UseDataFreshnessReturn {
  const now = ref(Date.now());

  const tickInterval = setInterval(() => {
    now.value = Date.now();
  }, 5000);

  onUnmounted(() => {
    clearInterval(tickInterval);
  });

  const relativeTime = computed(() => {
    if (updatedAt.value === null) {
      return 'Never';
    }
    const diffMs = now.value - updatedAt.value;
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 5) {
      return 'Just now';
    }
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  });

  const sourceLabel = computed(() => {
    if (source.value === null) {
      return '';
    }
    return source.value;
  });

  return { relativeTime, sourceLabel };
}
