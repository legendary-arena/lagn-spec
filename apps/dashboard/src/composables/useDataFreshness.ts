import { computed, ref, onUnmounted, type Ref, type ComputedRef } from 'vue';
import type { ServiceResponse } from '../types/index.js';

// why: D-19804 — the 'BUILD' label is additive over the fetched-data labels
// owned by ServiceResponse.source (LIVE/CACHED/MOCK). Build-time-baked data
// has a different freshness semantic than runtime-fetched data (no auto-
// refresh, no retry), so the operator must see which axis a widget rode at
// build time. The widening is local to useDataFreshness — ServiceResponse
// stays untouched so fetched-data callsites keep their narrower contract.
export type DataFreshnessSource = ServiceResponse<unknown>['source'] | 'BUILD';

interface UseDataFreshnessReturn {
  relativeTime: ComputedRef<string>;
  sourceLabel: ComputedRef<string>;
}

export function useDataFreshness(
  updatedAt: Ref<number | null>,
  source: Ref<DataFreshnessSource | null>,
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
