<script setup lang="ts">
import type { ThemeDefinition } from "../lib/themeClient";
import { useResizable } from "../composables/useResizable";
import { useLightbox } from "../composables/useLightbox";

// ── Lightbox integration ─────────────────────────────────────────────────────
// why: clicking the cover image opens a full-screen viewer.
const { openLightbox } = useLightbox();

defineProps<{ theme: ThemeDefinition }>();
const emit = defineEmits<{
  close: [];
  navigateToCard: [slug: string, cardType: string];
}>();

// ── Resizable panel width (persisted) ───────────────────────────────────────
// why: theme detail panels tend to need more room than cards because of the
// setup intent badges and tag lists. Default is wider (360px) with independent
// storage key so card and theme panels remember their own widths.
const { width: panelWidth, startDrag, resetWidth } = useResizable({
  storageKey:   "themeDetailWidth",
  defaultWidth: 360,
  minWidth:     280,
  maxWidth:     720,
  direction:    "left",
});
</script>

<template>
  <aside class="detail" :style="{ width: panelWidth + 'px' }">
    <!-- why: resize handle keeps <div> — drag via pointerdown can't be expressed
         as a semantic <button>. ARIA fallback: role="button" + tabindex + Enter/Space
         reset parity so keyboard users can reset panel width (EC-103). -->
    <div
      class="resize-handle"
      role="button"
      tabindex="0"
      @pointerdown="startDrag"
      @dblclick="resetWidth"
      @keydown.enter.prevent="resetWidth"
      @keydown.space.prevent="resetWidth"
      title="Drag to resize · double-click to reset"
      aria-label="Resize theme detail panel (Enter or Space to reset)"
    ></div>
    <div class="detail-header">
      <h2>{{ theme.name }}</h2>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="detail-body">
      <!-- Cover image -->
      <!-- why: was <div @click>; converted to <button> for native keyboard + SR support (EC-103) -->
      <button
        v-if="theme.comicImageUrl"
        type="button"
        class="img-wrap"
        @click="openLightbox(theme.comicImageUrl, theme.name)"
        title="Click to view full size"
        :aria-label="`View ${theme.name} cover full size`"
      >
        <img :src="theme.comicImageUrl" :alt="theme.name + ' cover'" loading="lazy"
          @error="($event.target as HTMLImageElement).style.display = 'none'" />
      </button>

      <!-- Description -->
      <p class="description">{{ theme.description }}</p>

      <!-- Flavor text -->
      <p v-if="theme.flavorText" class="flavor">"{{ theme.flavorText }}"</p>

      <!-- Tips -->
      <div v-if="theme.tips.length" class="section">
        <div class="section-title">Tips</div>
        <p v-for="tip in theme.tips" :key="tip" class="tip">{{ tip }}</p>
      </div>

      <!-- Setup Intent -->
      <div class="section">
        <div class="section-title">Setup Intent</div>

        <div class="intent-group">
          <span class="intent-label">Mastermind</span>
          <button class="intent-link mastermind" @click="emit('navigateToCard', theme.setupIntent.mastermindId, 'mastermind')">
            {{ theme.setupIntent.mastermindId }}
          </button>
        </div>

        <div class="intent-group">
          <span class="intent-label">Scheme</span>
          <button class="intent-link scheme" @click="emit('navigateToCard', theme.setupIntent.schemeId, 'scheme')">
            {{ theme.setupIntent.schemeId }}
          </button>
        </div>

        <div class="intent-group">
          <span class="intent-label">Villain Groups</span>
          <div class="intent-badges">
            <button
              v-for="villainGroupId in theme.setupIntent.villainGroupIds"
              :key="villainGroupId"
              class="intent-link villain"
              @click="emit('navigateToCard', villainGroupId, 'villain')"
            >{{ villainGroupId }}</button>
          </div>
        </div>

        <div v-if="theme.setupIntent.henchmanGroupIds?.length" class="intent-group">
          <span class="intent-label">Henchmen</span>
          <div class="intent-badges">
            <button
              v-for="henchmanGroupId in theme.setupIntent.henchmanGroupIds"
              :key="henchmanGroupId"
              class="intent-link henchman"
              @click="emit('navigateToCard', henchmanGroupId, 'henchman')"
            >{{ henchmanGroupId }}</button>
          </div>
        </div>

        <div class="intent-group">
          <span class="intent-label">Hero Decks</span>
          <div class="intent-badges">
            <button
              v-for="heroDeckId in theme.setupIntent.heroDeckIds"
              :key="heroDeckId"
              class="intent-link hero"
              @click="emit('navigateToCard', heroDeckId, 'hero')"
            >{{ heroDeckId }}</button>
          </div>
        </div>

        <div v-if="theme.setupIntent.bystanderSetIds.length" class="intent-group">
          <span class="intent-label">Bystanders</span>
          <div class="intent-badges">
            <span
              v-for="setId in theme.setupIntent.bystanderSetIds"
              :key="setId"
              class="tag"
            >{{ setId }}</span>
          </div>
        </div>

        <div v-if="theme.setupIntent.woundSetIds.length" class="intent-group">
          <span class="intent-label">Wounds</span>
          <div class="intent-badges">
            <span
              v-for="setId in theme.setupIntent.woundSetIds"
              :key="setId"
              class="tag"
            >{{ setId }}</span>
          </div>
        </div>

        <div v-if="theme.setupIntent.sidekickCardIds.length" class="intent-group">
          <span class="intent-label">Sidekicks</span>
          <div class="intent-badges">
            <span
              v-for="cardId in theme.setupIntent.sidekickCardIds"
              :key="cardId"
              class="tag"
            >{{ cardId }}</span>
          </div>
        </div>

        <div v-if="theme.setupIntent.officerCardIds.length" class="intent-group">
          <span class="intent-label">Officers</span>
          <div class="intent-badges">
            <span
              v-for="cardId in theme.setupIntent.officerCardIds"
              :key="cardId"
              class="tag"
            >{{ cardId }}</span>
          </div>
        </div>
      </div>

      <!-- Player Count -->
      <div class="section">
        <div class="section-title">Player Count</div>
        <div class="stats">
          <div class="stat">
            <span class="stat-label">Range</span>
            <span class="stat-value">{{ theme.playerCount.min }}–{{ theme.playerCount.max }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Recommended</span>
            <span class="stat-value">{{ theme.playerCount.recommended.join(', ') }}</span>
          </div>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="theme.tags?.length" class="section">
        <div class="section-title">Tags</div>
        <div class="tag-list">
          <span v-for="tag in theme.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </div>

      <!-- References -->
      <div v-if="theme.references?.primaryStory" class="section">
        <div class="section-title">Comic Reference</div>
        <div class="stats">
          <div v-if="theme.references.primaryStory.issue" class="stat">
            <span class="stat-label">Issue</span>
            <span class="stat-value">{{ theme.references.primaryStory.issue }}</span>
          </div>
          <div v-if="theme.references.primaryStory.year" class="stat">
            <span class="stat-label">Year</span>
            <span class="stat-value">{{ theme.references.primaryStory.year }}</span>
          </div>
        </div>
        <div class="ref-links">
          <a
            v-if="theme.references.primaryStory.externalUrl"
            :href="theme.references.primaryStory.externalUrl"
            target="_blank"
            rel="noopener"
            class="ref-link"
          >🔗 Fandom Wiki</a>
          <a
            v-if="theme.references.primaryStory.marvelUnlimitedUrl"
            :href="theme.references.primaryStory.marvelUnlimitedUrl"
            target="_blank"
            rel="noopener"
            class="ref-link"
          >📖 Marvel</a>
          <a
            v-for="indexUrl in (theme.references.primaryStory.externalIndexUrls ?? [])"
            :key="indexUrl"
            :href="indexUrl"
            target="_blank"
            rel="noopener"
            class="ref-link"
          >📚 {{ indexUrl.includes('comicvine') ? 'Comic Vine' : 'Index' }}</a>
        </div>
      </div>

      <!-- Raw JSON -->
      <details class="raw-json">
        <summary>Raw JSON</summary>
        <pre>{{ JSON.stringify(theme, null, 2) }}</pre>
      </details>
    </div>
  </aside>
</template>

<style scoped>
/* ── Panel layout (matches CardDetail.vue) ─────────────────────────────── */
/* width is set inline via :style binding, driven by useResizable() */
.detail {
  flex-shrink: 0;
  background: #1a1a24;
  border-left: 1px solid #2e2e42;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ── Resize handle (6px splitter on the left edge) ──────────────────────── */
.resize-handle {
  position: absolute;
  top: 0;
  left: -2px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
}
.resize-handle:hover,
.resize-handle:active {
  background: rgba(112, 112, 224, 0.4);
}
.detail-header { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1rem; border-bottom: 1px solid #2e2e42; flex-shrink: 0; }
.detail-header h2 { margin: 0; font-size: 0.95rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.close-btn { background: none; border: none; color: #6666aa; font-size: 1.1rem; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; }
.close-btn:hover { background: #2a2a3a; color: #e8e8ee; }
.detail-body { overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }

/* ── Cover image ───────────────────────────────────────────────────────── */
/* why: .img-wrap became a <button> (EC-103). Reset native button styles to
   preserve visual identity; keep default focus outline. */
.img-wrap {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  display: block;
  width: 100%;
  text-align: left;
  border-radius: 8px;
  overflow: hidden;
  background: #12121a;
  cursor: zoom-in;
  transition: transform 0.15s, box-shadow 0.15s;
}
.img-wrap:hover {
  transform: scale(1.01);
  box-shadow: 0 4px 16px rgba(112, 112, 224, 0.3);
}
.img-wrap img { width: 100%; display: block; object-fit: cover; max-height: 200px; pointer-events: none; }

/* ── Description ───────────────────────────────────────────────────────── */
.description { margin: 0; font-size: 0.82rem; color: #c8c8e0; line-height: 1.6; }
.flavor { margin: 0; font-size: 0.78rem; color: #8888cc; font-style: italic; line-height: 1.5; }
.tip { margin: 0; font-size: 0.78rem; color: #b8b8d8; line-height: 1.6; }

/* ── Sections ──────────────────────────────────────────────────────────── */
.section { display: flex; flex-direction: column; gap: 0.5rem; }
.section-title { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6666aa; }

/* ── Stats grid (reused from CardDetail) ───────────────────────────────── */
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
.stat { background: #12121a; border-radius: 6px; padding: 0.4rem 0.55rem; }
.stat-label { display: block; font-size: 0.62rem; color: #6666aa; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { font-size: 0.82rem; font-weight: 600; color: #d8d8ee; }

/* ── Setup Intent ──────────────────────────────────────────────────────── */
.intent-group { display: flex; flex-direction: column; gap: 0.25rem; }
.intent-label { font-size: 0.62rem; color: #6666aa; text-transform: uppercase; letter-spacing: 0.05em; }
.intent-badges { display: flex; flex-wrap: wrap; gap: 0.3rem; }

.intent-link {
  background: #12121a;
  border: 1px solid #2e2e42;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.intent-link:hover { border-color: #5050a0; transform: translateY(-1px); }
.intent-link.mastermind { color: #f87171; }
.intent-link.scheme { color: #a78bfa; }
.intent-link.villain { color: #f59e0b; }
.intent-link.henchman { color: #94a3b8; }
.intent-link.hero { color: #60a5fa; }

/* ── Tags ──────────────────────────────────────────────────────────────── */
.tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.tag {
  font-size: 0.65rem;
  color: #8888cc;
  background: #1e1e2e;
  border: 1px solid #2e2e42;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
}

/* ── Reference links ───────────────────────────────────────────────────── */
.ref-links { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.25rem; }
.ref-link {
  font-size: 0.72rem;
  color: #60a5fa;
  background: #12121a;
  border: 1px solid #2e2e42;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.15s;
}
.ref-link:hover { background: #1e1e3a; border-color: #5050a0; }

/* ── Raw JSON ──────────────────────────────────────────────────────────── */
.raw-json summary { cursor: pointer; font-size: 0.8rem; color: #6666aa; padding: 0.3rem 0; }
.raw-json pre { background: #0f0f13; border: 1px solid #22222e; border-radius: 6px; padding: 0.6rem; font-size: 0.68rem; color: #9999bb; overflow-x: auto; max-height: 220px; overflow-y: auto; margin: 0.4rem 0 0; }
</style>
