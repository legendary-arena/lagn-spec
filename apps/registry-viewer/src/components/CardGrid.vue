<script setup lang="ts">
import { watch, nextTick } from "vue";
import type { FlatCard } from "../registry/browser";
import { TYPE_COLOR, HC_COLOR, RARITY_DOT } from "../lib/theme";
import { devLog } from "../lib/devLog";
// why: useCardViewMode is the module-scoped single source of truth for
// the image-vs-data toggle established in WP-066. The sidebar consumes
// it via prop flow from App.vue, but the grid reads it directly here to
// avoid threading a `view-mode` prop through App.vue → CardGrid.vue.
// Direct consumption preserves WP-066's "global toggle" intent: a single
// click on ViewModeToggle.vue now flips both the sidebar and every grid
// tile in lockstep, with no prop plumbing.
import { useCardViewMode } from "../composables/useCardViewMode";
// why: useCardSize is the module-scoped single source of truth for the
// card-grid zoom slider. CardGrid.vue reads cardSize directly to avoid
// prop plumbing through App.vue — the same pattern the line above uses
// for viewMode. The slider component (CardSizeSlider.vue) writes the
// same composable; this file is read-only against it.
import { useCardSize } from "../composables/useCardSize";
// why: ABILITY_THRESHOLD_PX lives in a sibling single-export module
// rather than `useCardSize.ts` to preserve D-12101's locked composable
// surface. See `cardTileThresholds.ts` module-header JSDoc for the full
// rationale; this file imports the constant by name and never inlines
// the numeric literal.
import { ABILITY_THRESHOLD_PX } from "../composables/cardTileThresholds";
import CardDataTile from "./CardDataTile.vue";

const props = defineProps<{ cards: FlatCard[]; selectedKey?: string }>();
const emit = defineEmits<{ select: [card: FlatCard]; clearFilters: [] }>();

const { viewMode } = useCardViewMode();
const { cardSize } = useCardSize();

// why: when a card is selected (either by clicking or via cross-link from
// themes view), scroll it into view so the user can see which tile is active
// without hunting through a long grid.
watch(() => props.selectedKey, (newKey) => {
  if (!newKey) return;
  nextTick(() => {
    const element = document.getElementById(`card-${newKey}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
});
</script>

<template>
  <div class="grid-wrapper">
    <div v-if="!cards.length" class="empty">
      <div class="empty-icon">🔍</div>
      <p>No cards match your filters.</p>
      <button class="clear-filters-btn" @click="emit('clearFilters')">Clear all filters</button>
    </div>
    <!--
      why: scaling is CSS-driven (no per-card recalculation). The
      existing `aspect-ratio: 3/4` rule on .img-wrap propagates width
      changes to height proportionally, so a single CSS variable on
      .grid drives every tile's size uniformly. The .grid rule below
      reads --card-grid-min-width with a literal `130px` fallback inside
      `minmax(...)`, so the grid still renders at the production
      baseline if this inline binding is ever dropped (e.g. by a future
      server-render shim or a test harness that omits the prop).
    -->
    <div class="grid" :style="{ '--card-grid-min-width': cardSize + 'px' }">
      <button
        v-for="card in cards"
        :key="card.key"
        :id="'card-' + card.key"
        class="card-tile"
        :class="{ selected: card.key === selectedKey }"
        @click="emit('select', card)"
      >
        <!--
          why: above-threshold data tiles drop the 3:4 aspect-ratio lock
          (via the new `.img-wrap.data-expanded` rule below) so the
          newly-revealed `Ability` block can grow the tile vertically
          without overflow. Both AND-clauses are required: image-mode
          tiles never receive the class (image tiles stay 3:4 at every
          slider value), and below-threshold data tiles never receive
          the class (the WP-096 baseline tile renders byte-identically).
          Cites D-9601 amendment 2026-05-02 + WP-127.
        -->
        <div class="img-wrap" :class="{ 'data-expanded': viewMode === 'data' && cardSize >= ABILITY_THRESHOLD_PX }">
          <template v-if="viewMode === 'image'">
            <img :src="card.imageUrl" :alt="card.name" loading="lazy"
              @error="($event.target as HTMLImageElement).style.opacity = '0.2'; devLog('render', 'image load failed', { card: card.name, url: card.imageUrl })" />
            <span class="type-badge" :style="{ background: TYPE_COLOR[card.cardType] + '22', color: TYPE_COLOR[card.cardType] }">
              {{ card.cardType }}
            </span>
          </template>
          <!--
            why: the viewMode swap is confined to the inside of .img-wrap
            (the 3:4 aspect-ratio box). .img-wrap itself remains in the
            DOM in both modes, so its sizing rule (`aspect-ratio: 3/4`)
            and any background / overflow / position rules attached to
            it continue to apply identically. The .tile-info footer
            below renders unconditionally in both branches, and the grid
            column track (`minmax(130px, 1fr)`) is unchanged. Net effect:
            outer tile dimensions and grid layout are byte-identical
            between image and data modes — only the inside-tile content
            differs.
          -->
          <template v-else>
            <CardDataTile :card="card" />
          </template>
        </div>
        <div class="tile-info">
          <span class="tile-name">{{ card.name }}</span>
          <span v-if="card.heroName && card.heroName !== card.name" class="tile-hero">{{ card.heroName }}</span>
          <div class="tile-meta">
            <!--
              why: surface the set abbr on every tile (image and data modes
              alike) so users can identify a card's source set without
              flipping to data mode or opening the detail panel. The :title
              binding renders the full set name from sets.json on hover via
              the browser's native tooltip — no JS, no tooltip library, no
              new dependency. setAbbr / setName both flow through FlatCard
              already (populated by `flattenSet` from `sets.json`); this
              binding consumes existing data.
            -->
            <span v-if="card.setAbbr" class="set-tag" :title="card.setName || card.setAbbr">{{ card.setAbbr }}</span>
            <span v-if="card.hc" class="hc-tag" :style="{ color: HC_COLOR[card.hc] }">{{ card.hc }}</span>
            <span v-if="card.cost !== undefined" class="cost">⚡{{ card.cost }}</span>
            <span v-if="card.rarity" class="rarity-dot" :style="{ background: RARITY_DOT[card.rarity] }"></span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid-wrapper { flex: 1; overflow-y: auto; padding: 1rem; background: #0f0f13; }
.empty { text-align: center; color: #55556a; padding: 3rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
.empty-icon { font-size: 2.5rem; opacity: 0.4; }
.empty p { margin: 0; font-size: 0.9rem; }
.clear-filters-btn {
  background: #2a2a5a;
  border: 1px solid #5050a0;
  color: #c0c0ff;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.clear-filters-btn:hover { background: #3a3a7a; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr)); gap: 0.75rem; }
.card-tile { background: #1a1a24; border: 2px solid #2e2e42; border-radius: 8px; cursor: pointer; transition: border-color 0.15s, transform 0.1s; overflow: hidden; display: flex; flex-direction: column; text-align: left; padding: 0; }
.card-tile:hover { border-color: #5050a0; transform: translateY(-2px); }
.card-tile.selected { border-color: #7070e0; box-shadow: 0 0 12px rgba(112, 112, 224, 0.35); }
.img-wrap { position: relative; width: 100%; aspect-ratio: 3/4; background: #12121a; overflow: hidden; }
.img-wrap.data-expanded { aspect-ratio: auto; }
.img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.type-badge { position: absolute; bottom: 4px; left: 4px; font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 3px; font-weight: 600; text-transform: capitalize; }
.tile-info { padding: 0.4rem 0.5rem 0.5rem; display: flex; flex-direction: column; gap: 0.15rem; }
.tile-name { font-size: 0.72rem; font-weight: 600; color: #d8d8ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-hero { font-size: 0.62rem; color: #7777aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-meta { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
.set-tag { font-size: 0.6rem; color: #8a8aa8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; cursor: help; }
.hc-tag { font-size: 0.6rem; text-transform: capitalize; }
.cost { font-size: 0.65rem; color: #fbbf24; }
.rarity-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-left: auto; }
</style>
