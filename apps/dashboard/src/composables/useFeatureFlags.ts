import { computed } from 'vue';

interface UseFeatureFlagsReturn {
  isEnabled: (flag: string) => boolean;
  all: readonly string[];
}

function parseFlags(): string[] {
  const raw = import.meta.env.VITE_FEATURE_FLAGS ?? '';
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((token: string) => token.trim())
    .filter((token: string) => token.length > 0);
}

const resolvedFlags = parseFlags();

export function useFeatureFlags(): UseFeatureFlagsReturn {
  const all = computed(() => resolvedFlags);

  function isEnabled(flag: string): boolean {
    return resolvedFlags.includes(flag);
  }

  return { isEnabled, all: all.value };
}
