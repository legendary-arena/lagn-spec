<script setup lang="ts">
/**
 * AbilityEffectFilter — Chip-toggle ribbon for the registry viewer's
 * card-abilities effect-tag taxonomy (WP-125 / EC-127).
 *
 * Purely presentational: the taxonomy flows in via the `taxonomy` prop, the
 * selection flows out via `update:selectedEffectSlugs` (v-model), and the
 * tag index is consulted only to render per-chip badge counts. The
 * component performs no fetching of its own and imports no client.
 *
 * Degraded-mode invisibility: when `taxonomy.length === 0` the outer
 * wrapper is omitted via `v-if`; the ribbon never renders an empty shell.
 * App.vue's parent guard (`v-if="abilitiesTaxonomy.length > 0"`) is
 * redundant with this component-internal guard but kept as a defensive
 * outer shield mirroring the cards-view filter region's other elements.
 *
 * Chip badge counts (when `tagIndex` is non-null) display the global
 * count of cards tagged with each effect across the session-wide ability
 * tag index — intentionally independent of other active filters (set,
 * hero class, card type, search) so the badge is stable as the user
 * narrows other filters. When `tagIndex` is null the badge is hidden.
 */
import { computed } from "vue";
import type { CardAbilityEntry } from "@legendary-arena/registry/schema";

const props = defineProps<{
  taxonomy: readonly CardAbilityEntry[];
  tagIndex?: Map<string, Set<string>> | null;
}>();

const selectedEffectSlugs = defineModel<Set<string>>("selectedEffectSlugs", {
  required: true,
});

const sortedTaxonomy = computed(() =>
  [...props.taxonomy].sort((a, b) => a.order - b.order),
);

const tagCounts = computed(() => {
  const counts = new Map<string, number>();
  if (!props.tagIndex) return counts;
  for (const slug of sortedTaxonomy.value.map((entry) => entry.slug)) {
    counts.set(slug, 0);
  }
  for (const tags of props.tagIndex.values()) {
    for (const slug of tags) {
      const prior = counts.get(slug);
      if (prior !== undefined) counts.set(slug, prior + 1);
    }
  }
  return counts;
});

function isSelected(slug: string): boolean {
  return selectedEffectSlugs.value.has(slug);
}

function toggleChip(slug: string): void {
  const next = new Set(selectedEffectSlugs.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  selectedEffectSlugs.value = next;
}
</script>

<template>
  <div v-if="taxonomy.length > 0" class="effect-bar">
    <span class="effect-bar-label">Effects:</span>
    <button
      v-for="entry in sortedTaxonomy"
      :key="entry.slug"
      type="button"
      class="effect-chip"
      :class="{ active: isSelected(entry.slug) }"
      :aria-pressed="isSelected(entry.slug)"
      :aria-label="`Toggle ${entry.label} effect filter`"
      @click="toggleChip(entry.slug)"
    >
      <span v-if="entry.emoji" class="effect-emoji">{{ entry.emoji }}</span>
      <span class="effect-label">{{ entry.label }}</span>
      <span
        v-if="tagIndex && tagCounts.get(entry.slug) !== undefined"
        class="effect-count"
      >{{ tagCounts.get(entry.slug) }}</span>
    </button>
  </div>
</template>

<style scoped>
.effect-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  background: #12121a;
  border-bottom: 1px solid #22222e;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.effect-bar-label {
  font-size: 0.65rem;
  color: #44445a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.effect-chip {
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
.effect-chip:hover {
  background: #2a2a3e;
  color: #c8c8ee;
  border-color: #5555aa;
}
.effect-chip.active {
  background: #2a2a5a;
  border-color: #7070e0;
  color: #c0c0ff;
  font-weight: 700;
}
.effect-emoji {
  font-size: 0.9rem;
  line-height: 1;
}
.effect-label {
  line-height: 1;
}
.effect-count {
  background: #0f0f13;
  border: 1px solid #2a2a38;
  color: #66669a;
  border-radius: 10px;
  padding: 0.05rem 0.4rem;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.2;
}
.effect-chip.active .effect-count {
  background: #1a1a3a;
  border-color: #5555aa;
  color: #9999ff;
}
</style>
