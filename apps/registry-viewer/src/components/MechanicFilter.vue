<script setup lang="ts">
/**
 * MechanicFilter — Chip-toggle ribbon for the registry viewer's hero-mechanic
 * taxonomy (WP-270 / EC-301), fed by `card-mechanics.json` (WP-269).
 *
 * Purely presentational: the mechanics flow in via the `mechanics` prop, the
 * selection flows out via `update:selectedMechanicSlugs` (v-model). The
 * component performs no fetching of its own and imports no client.
 *
 * Hidden-by-default policy: only mechanics where `hidden !== true` render as
 * chips. An omitted/undefined `hidden` is visible; only an explicit
 * `hidden: true` suppresses a chip (the producer marks diagnostic-only
 * mechanics hidden). This realizes AC-7 at the UI layer.
 *
 * Degraded-mode invisibility: when no mechanic is visible (empty feed, the
 * missing/invalid-feed fallback, or every mechanic hidden) the outer wrapper
 * is omitted via `v-if`; the ribbon never renders an empty shell.
 *
 * Chip badge counts display each mechanic's session-wide `cardCount` from the
 * feed — intentionally independent of other active filters so the badge is
 * stable as the user narrows other filters.
 */
import { computed } from "vue";
import type { CardMechanicEntry } from "@legendary-arena/registry/schema";

const props = defineProps<{
  mechanics: readonly CardMechanicEntry[];
}>();

const selectedMechanicSlugs = defineModel<Set<string>>("selectedMechanicSlugs", {
  required: true,
});

// why: render only mechanics where `hidden !== true` — an omitted/undefined
// `hidden` is visible; only an explicit `hidden: true` is suppressed (the
// producer's hidden-by-default diagnostics policy, D-24046). Sorted by label
// for a stable, scannable ribbon (the feed carries no display-order field).
const visibleMechanics = computed(() =>
  props.mechanics
    .filter((mechanic) => mechanic.hidden !== true)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label)),
);

function isSelected(slug: string): boolean {
  return selectedMechanicSlugs.value.has(slug);
}

function toggleChip(slug: string): void {
  const next = new Set(selectedMechanicSlugs.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  selectedMechanicSlugs.value = next;
}
</script>

<template>
  <div v-if="visibleMechanics.length > 0" class="mechanic-bar">
    <span class="mechanic-bar-label">Mechanics:</span>
    <button
      v-for="mechanic in visibleMechanics"
      :key="mechanic.slug"
      type="button"
      class="mechanic-chip"
      :class="{ active: isSelected(mechanic.slug) }"
      :aria-pressed="isSelected(mechanic.slug)"
      :aria-label="`Toggle ${mechanic.label} mechanic filter`"
      @click="toggleChip(mechanic.slug)"
    >
      <span class="mechanic-label">{{ mechanic.label }}</span>
      <span class="mechanic-count">{{ mechanic.cardCount }}</span>
    </button>
  </div>
</template>

<style scoped>
.mechanic-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  background: #12121a;
  border-bottom: 1px solid #22222e;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.mechanic-bar-label {
  font-size: 0.65rem;
  color: #44445a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.mechanic-chip {
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
.mechanic-chip:hover {
  background: #2a2a3e;
  color: #c8c8ee;
  border-color: #5555aa;
}
.mechanic-chip.active {
  background: #2a2a5a;
  border-color: #7070e0;
  color: #c0c0ff;
  font-weight: 700;
}
.mechanic-label {
  line-height: 1;
}
.mechanic-count {
  background: #0f0f13;
  border: 1px solid #2a2a38;
  color: #66669a;
  border-radius: 10px;
  padding: 0.05rem 0.4rem;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.2;
}
.mechanic-chip.active .mechanic-count {
  background: #1a1a3a;
  border-color: #5555aa;
  color: #9999ff;
}
</style>
