<script setup lang="ts">
/**
 * SchemeTwistFilter — Chip-toggle ribbon for scheme twist pattern filtering.
 *
 * Purely presentational: patterns flow in via prop, selection flows out via
 * v-model. Badge counts show how many scheme cards match each pattern across
 * the full dataset (stable as other filters change).
 */
import { computed } from "vue";
import type { SchemeTwistPattern } from "@legendary-arena/registry/schema";
import type { FlatCard } from "../registry/types/types-index";

const props = defineProps<{
  patterns: readonly SchemeTwistPattern[];
  allCards: readonly FlatCard[];
}>();

const selectedTwistSlugs = defineModel<Set<string>>("selectedTwistSlugs", {
  required: true,
});

// why: sort by order ascending, never by array insertion position
const sortedPatterns = computed(() =>
  [...props.patterns].sort((a, b) => a.order - b.order),
);

const patternCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const pattern of sortedPatterns.value) {
    counts.set(pattern.slug, 0);
  }
  for (const card of props.allCards) {
    if (card.cardType !== "scheme" || !card.twistPattern) continue;
    const prior = counts.get(card.twistPattern);
    if (prior !== undefined) counts.set(card.twistPattern, prior + 1);
  }
  return counts;
});

function isSelected(slug: string): boolean {
  return selectedTwistSlugs.value.has(slug);
}

function toggleChip(slug: string): void {
  const next = new Set(selectedTwistSlugs.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  selectedTwistSlugs.value = next;
}
</script>

<template>
  <div v-if="patterns.length > 0" class="twist-bar">
    <span class="twist-bar-label">Twist Pattern:</span>
    <button
      v-for="pattern in sortedPatterns"
      :key="pattern.slug"
      type="button"
      class="twist-chip"
      :class="{ active: isSelected(pattern.slug) }"
      :aria-pressed="isSelected(pattern.slug)"
      :aria-label="`Toggle ${pattern.label} twist pattern filter`"
      :title="pattern.description"
      @click="toggleChip(pattern.slug)"
    >
      <span v-if="pattern.emoji" class="twist-emoji">{{ pattern.emoji }}</span>
      <span class="twist-label">{{ pattern.label }}</span>
      <span
        v-if="patternCounts.get(pattern.slug) !== undefined"
        class="twist-count"
      >{{ patternCounts.get(pattern.slug) }}</span>
    </button>
  </div>
</template>

<style scoped>
.twist-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  background: #12121a;
  border-bottom: 1px solid #22222e;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.twist-bar-label {
  font-size: 0.65rem;
  color: #44445a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.twist-chip {
  background: #1e1e2e;
  border: 1.5px solid #33334a;
  color: #8888cc;
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.twist-chip:hover {
  background: #2a2a3e;
  color: #c8c8ee;
  border-color: #5555aa;
}
.twist-chip.active {
  background: #2a2a5a;
  border-color: #7070e0;
  color: #c0c0ff;
  font-weight: 700;
}
.twist-emoji {
  font-size: 0.9rem;
  line-height: 1;
}
.twist-label {
  line-height: 1;
}
.twist-count {
  background: #0f0f13;
  border: 1px solid #2a2a38;
  color: #66669a;
  border-radius: 10px;
  padding: 0.05rem 0.4rem;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.2;
}
.twist-chip.active .twist-count {
  background: #1a1a3a;
  border-color: #5555aa;
  color: #9999ff;
}
</style>
