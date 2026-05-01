<script setup lang="ts">
import type { ThemeDefinition } from "../lib/themeClient";
import { TAG_COLOR } from "../lib/theme";
// why: composable is the single source of truth for theme grid size; the
// grid reads it directly to avoid prop plumbing through App.vue, parallel
// to the useCardSize precedent at CardGrid.vue.
import { useThemeSize } from "../composables/useThemeSize";

defineProps<{ themes: ThemeDefinition[]; selectedId?: string }>();
const emit = defineEmits<{ select: [theme: ThemeDefinition] }>();

const { themeSize } = useThemeSize();

function primaryTag(theme: ThemeDefinition): string {
  return (theme.tags ?? [])[0] ?? "";
}

function tagColor(theme: ThemeDefinition): string {
  for (const tag of theme.tags ?? []) {
    if (TAG_COLOR[tag]) return TAG_COLOR[tag];
  }
  return "#6666aa";
}
</script>

<template>
  <div class="grid-wrapper">
    <div v-if="!themes.length" class="empty">No themes match your filters.</div>
    <!-- why: scaling is CSS-driven (no per-tile recalculation); .img-wrap's
         aspect-ratio: 3/4 propagates width to height proportionally; the
         literal 150px fallback in the minmax(...) call preserves pre-packet
         behavior if the inline style is dropped. -->
    <div class="grid" :style="{ '--theme-grid-min-width': themeSize + 'px' }">
      <button
        v-for="theme in themes"
        :key="theme.themeId"
        class="theme-tile"
        :class="{ selected: theme.themeId === selectedId }"
        @click="emit('select', theme)"
      >
        <div class="img-wrap">
          <img
            v-if="theme.comicImageUrl"
            :src="theme.comicImageUrl"
            :alt="theme.name"
            loading="lazy"
            @error="($event.target as HTMLImageElement).style.opacity = '0.1'"
          />
          <div v-else class="img-placeholder">🎭</div>
          <span class="type-badge" :style="{ background: tagColor(theme) + '22', color: tagColor(theme) }">
            {{ primaryTag(theme) }}
          </span>
        </div>
        <div class="tile-info">
          <span class="tile-name">{{ theme.name }}</span>
          <span class="tile-mastermind">{{ theme.setupIntent.mastermindId }}</span>
          <div class="tile-meta">
            <span class="tile-players">{{ theme.playerCount.min }}–{{ theme.playerCount.max }}p</span>
            <span class="tile-heroes">{{ theme.setupIntent.heroDeckIds.length }} heroes</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid-wrapper { flex: 1; overflow-y: auto; padding: 1rem; background: #0f0f13; }
.empty { text-align: center; color: #55556a; padding: 3rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr)); gap: 0.75rem; }

.theme-tile {
  background: #1a1a24;
  border: 2px solid #2e2e42;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0;
}
.theme-tile:hover { border-color: #5050a0; transform: translateY(-2px); }
.theme-tile.selected { border-color: #7070e0; box-shadow: 0 0 12px rgba(112, 112, 224, 0.35); }

.img-wrap { position: relative; width: 100%; aspect-ratio: 3/4; background: #12121a; overflow: hidden; }
.img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.img-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; opacity: 0.2; }
.type-badge { position: absolute; bottom: 4px; left: 4px; font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 3px; font-weight: 600; text-transform: capitalize; }

.tile-info { padding: 0.4rem 0.5rem 0.5rem; display: flex; flex-direction: column; gap: 0.15rem; }
.tile-name { font-size: 0.72rem; font-weight: 600; color: #d8d8ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-mastermind { font-size: 0.62rem; color: #f87171; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-meta { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
.tile-players { font-size: 0.6rem; color: #6666aa; }
.tile-heroes { font-size: 0.6rem; color: #34d399; margin-left: auto; }
</style>
