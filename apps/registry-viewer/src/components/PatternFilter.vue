<script setup lang="ts">
/**
 * PatternFilter — Generic chip-toggle ribbon for the four mechanical pattern
 * taxonomies introduced in WP-184 (hero / villain / henchman / mastermind).
 *
 * Generalizes SchemeTwistFilter.vue (WP-183) — same shape but parameterized
 * by taxonomy label and target cardType so a single component renders any
 * of the four ribbons. Patterns flow in via prop, selection flows out via
 * v-model. Badge counts show how many cards of the target cardType match
 * each pattern across the full dataset (stable as other filters change).
 */
import { computed } from "vue";
import type { CardPattern } from "@legendary-arena/registry/schema";
import type { FlatCard } from "../registry/types/types-index";

const props = defineProps<{
  taxonomyLabel: string;
  targetCardType: string;
  patterns: readonly CardPattern[];
  allCards: readonly FlatCard[];
}>();

const selectedPatternSlugs = defineModel<Set<string>>("selectedPatternSlugs", {
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
    if (card.cardType !== props.targetCardType || !card.mechanicalPattern) continue;
    const prior = counts.get(card.mechanicalPattern);
    if (prior !== undefined) counts.set(card.mechanicalPattern, prior + 1);
  }
  return counts;
});

function isSelected(slug: string): boolean {
  return selectedPatternSlugs.value.has(slug);
}

function toggleChip(slug: string): void {
  const next = new Set(selectedPatternSlugs.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  selectedPatternSlugs.value = next;
}
</script>

<template>
  <div v-if="patterns.length > 0" class="pattern-bar">
    <span class="pattern-bar-label">{{ taxonomyLabel }}:</span>
    <button
      v-for="pattern in sortedPatterns"
      :key="pattern.slug"
      type="button"
      class="pattern-chip"
      :class="{ active: isSelected(pattern.slug) }"
      :aria-pressed="isSelected(pattern.slug)"
      :aria-label="`Toggle ${pattern.label} ${taxonomyLabel} filter`"
      :title="pattern.description"
      @click="toggleChip(pattern.slug)"
    >
      <span v-if="pattern.emoji" class="pattern-emoji">{{ pattern.emoji }}</span>
      <span class="pattern-label">{{ pattern.label }}</span>
      <span
        v-if="patternCounts.get(pattern.slug) !== undefined"
        class="pattern-count"
      >{{ patternCounts.get(pattern.slug) }}</span>
    </button>
  </div>
</template>

<style scoped>
/* why: avoids hidden patterns on smaller screens */
.pattern-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  background: #12121a;
  border-bottom: 1px solid #22222e;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.pattern-bar-label {
  font-size: 0.65rem;
  color: #44445a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.pattern-chip {
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
.pattern-chip:hover {
  background: #2a2a3e;
  color: #c8c8ee;
  border-color: #5555aa;
}
.pattern-chip.active {
  background: #2a2a5a;
  border-color: #7070e0;
  color: #c0c0ff;
  font-weight: 700;
}
.pattern-emoji {
  font-size: 0.9rem;
  line-height: 1;
}
.pattern-label {
  line-height: 1;
}
.pattern-count {
  background: #0f0f13;
  border: 1px solid #2a2a38;
  color: #66669a;
  border-radius: 10px;
  padding: 0.05rem 0.4rem;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.2;
}
.pattern-chip.active .pattern-count {
  background: #1a1a3a;
  border-color: #5555aa;
  color: #9999ff;
}
</style>
