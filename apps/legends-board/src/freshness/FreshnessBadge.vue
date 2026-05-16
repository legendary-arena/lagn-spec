<script setup lang="ts">
import { computed } from "vue";

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

const props = defineProps<{
  generatedAt: string | null;
  fetchError: boolean;
}>();

const ageMs = computed((): number | null => {
  if (!props.generatedAt) {
    return null;
  }
  const generated = new Date(props.generatedAt).getTime();
  if (Number.isNaN(generated)) {
    return null;
  }
  return Date.now() - generated;
});

// why: 30-minute stale threshold per D-14303 — 6 missed publisher cycles
const isStale = computed((): boolean => {
  if (ageMs.value === null) {
    return false;
  }
  return ageMs.value > STALE_THRESHOLD_MS;
});

const displayText = computed((): string => {
  if (props.fetchError) {
    return "Unable to check freshness";
  }
  if (ageMs.value === null) {
    return "Freshness unknown";
  }

  const totalSeconds = Math.floor(ageMs.value / 1000);
  if (totalSeconds < 60) {
    return "Updated just now";
  }

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `Updated ${hours}h ago`;
  }
  return `Updated ${hours}h ${remainingMinutes}m ago`;
});
</script>

<template>
  <div
    class="freshness-badge"
    :class="{
      stale: isStale,
      error: fetchError,
    }"
    role="status"
    :aria-label="displayText"
  >
    <span class="freshness-dot" />
    <span class="freshness-text">{{ displayText }}</span>
  </div>
</template>

<style scoped>
.freshness-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #8c8;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  background: rgba(0, 200, 100, 0.1);
  border: 1px solid rgba(0, 200, 100, 0.2);
}

.freshness-badge.stale {
  color: #fc8;
  background: rgba(255, 180, 50, 0.1);
  border-color: rgba(255, 180, 50, 0.3);
}

.freshness-badge.error {
  color: #f88;
  background: rgba(255, 60, 60, 0.1);
  border-color: rgba(255, 60, 60, 0.3);
}

.freshness-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.freshness-text {
  white-space: nowrap;
}
</style>
