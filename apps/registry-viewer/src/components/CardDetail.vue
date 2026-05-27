<script setup lang="ts">
import { computed } from "vue";
import type { FlatCard } from "../registry/browser";
import { parseAbilityText, lookupKeyword, lookupRule, lookupHeroClass } from "../composables/useRules";
import type { AbilityToken } from "../composables/useRules";
import { useGlossary } from "../composables/useGlossary";
import { useResizable } from "../composables/useResizable";
import { useLightbox } from "../composables/useLightbox";
import { TYPE_COLOR, HC_COLOR, RARITY_LABEL } from "../lib/theme";
import CardDataDisplay from "./CardDataDisplay.vue";

import type { SchemeTwistPattern, CardPattern } from "@legendary-arena/registry/schema";

const props = defineProps<{
  card: FlatCard;
  viewMode: "image" | "data";
  twistPatterns?: readonly SchemeTwistPattern[];
  heroPatterns?: readonly CardPattern[];
  villainPatterns?: readonly CardPattern[];
  henchmanPatterns?: readonly CardPattern[];
  mastermindPatterns?: readonly CardPattern[];
}>();
const emit = defineEmits<{ close: [] }>();

// ── Resizable panel width (persisted) ───────────────────────────────────────
// why: users with wide screens want a bigger detail panel; users on small
// laptops want more grid space. Drag the left edge to resize, double-click
// to reset. Width is stored in localStorage under cardDetailWidth.
const { width: panelWidth, startDrag, resetWidth } = useResizable({
  storageKey:   "cardDetailWidth",
  defaultWidth: 320,
  minWidth:     240,
  maxWidth:     720,
  direction:    "left",
});

// ── Glossary integration ─────────────────────────────────────────────────────
// why: clicking a keyword or rule token opens the persistent Rules Glossary
// panel and scrolls to the matching entry. Complements the native browser
// tooltip shown on hover with a click-for-full-context experience.
const { openToKeyword, openToRule } = useGlossary();

// ── Lightbox integration ─────────────────────────────────────────────────────
// why: clicking the card image opens a full-screen viewer where the user
// can inspect the card art closely and toggle 2x zoom.
const { openLightbox } = useLightbox();

function handleTokenClick(token: AbilityToken) {
  if (token.type === "keyword" && lookupKeyword(token.value)) {
    openToKeyword(token.value);
  } else if (token.type === "rule" && lookupRule(token.value)) {
    openToRule(token.value);
  }
}

// ── Tooltip title ─────────────────────────────────────────────────────────────
// Uses the native browser title attribute — reliable across all browsers,
// no stacking context issues, no positioning math needed.
function tooltipTitle(token: AbilityToken): string {
  if (token.type === "keyword") {
    const definition = lookupKeyword(token.value);
    return definition ? `${token.value}: ${definition}` : "";
  }
  if (token.type === "rule") {
    const entry = lookupRule(token.value);
    return entry ? `${entry.label}: ${entry.summary}` : "";
  }
  if (token.type === "hc") {
    const definition = lookupHeroClass(token.value);
    return definition ?? "";
  }
  return "";
}

// ── Token display ─────────────────────────────────────────────────────────────

function tokenClass(token: AbilityToken): string {
  if (token.type === "keyword") {
    return lookupKeyword(token.value) ? "token-keyword has-tooltip" : "token-keyword";
  }
  if (token.type === "rule") {
    return lookupRule(token.value) ? "token-rule has-tooltip" : "token-rule";
  }
  if (token.type === "icon") return `token-icon token-icon-${token.value}`;
  if (token.type === "hc")   return lookupHeroClass(token.value) ? `token-hc token-hc-${token.value} has-tooltip` : `token-hc token-hc-${token.value}`;
  if (token.type === "team") return "token-team";
  return "";
}

function tokenLabel(token: AbilityToken): string {
  if (token.type === "icon") {
    const ICON_LABEL: Record<string, string> = {
      attack: "⚔", recruit: "★", cost: "◆", vp: "🏆",
      focus: "◎", piercing: "↯", token: "🃏",
    };
    return ICON_LABEL[token.value] ?? token.value;
  }
  if (token.type === "hc") {
    const HC_LABEL: Record<string, string> = {
      covert: "Covert", instinct: "Instinct", ranged: "Ranged",
      strength: "Strength", tech: "Tech",
    };
    return HC_LABEL[token.value] ?? token.value;
  }
  return token.value;
}

const matchedTwistPattern = computed(() => {
  if (!props.card.twistPattern || !props.twistPatterns) return null;
  return props.twistPatterns.find((p) => p.slug === props.card.twistPattern) ?? null;
});

// why: WP-184 — the mechanical pattern badge resolves the per-cardType
// taxonomy and looks up the pattern definition by slug. Returns null when
// the card has no assigned pattern OR its cardType has no corresponding
// taxonomy (e.g. scheme cards use twistPattern instead, bystander/wound
// have no mechanical pattern at all).
const matchedMechanicalPattern = computed(() => {
  if (!props.card.mechanicalPattern) return null;
  let taxonomy: readonly CardPattern[] | undefined;
  if (props.card.cardType === "hero")            taxonomy = props.heroPatterns;
  else if (props.card.cardType === "villain")    taxonomy = props.villainPatterns;
  else if (props.card.cardType === "henchman")   taxonomy = props.henchmanPatterns;
  else if (props.card.cardType === "mastermind") taxonomy = props.mastermindPatterns;
  if (!taxonomy) return null;
  return taxonomy.find((p) => p.slug === props.card.mechanicalPattern) ?? null;
});

// why: TYPE_COLOR, HC_COLOR, RARITY_LABEL imported from src/lib/theme.ts
// (single source of truth for all color constants across the viewer)
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
      aria-label="Resize card detail panel (Enter or Space to reset)"
    ></div>
    <div class="detail-header">
      <div class="detail-header-title">
        <h2>{{ card.name }}</h2>
        <span
          v-if="matchedTwistPattern"
          class="twist-badge"
          :title="matchedTwistPattern.description"
        >{{ matchedTwistPattern.emoji }} {{ matchedTwistPattern.label }}</span>
        <span
          v-if="matchedMechanicalPattern"
          class="pattern-badge"
          :title="matchedMechanicalPattern.description"
        >{{ matchedMechanicalPattern.emoji }} {{ matchedMechanicalPattern.label }}</span>
      </div>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="detail-body">
      <!-- Data view: structured FlatCard attributes (printable). -->
      <CardDataDisplay v-if="viewMode === 'data'" :card="card" />

      <!-- Image view: card art + stats + abilities (current default). -->
      <!-- why: was <div @click>; converted to <button> for native keyboard + SR support (EC-103) -->
      <button
        v-if="viewMode === 'image'"
        type="button"
        class="img-wrap"
        @click="openLightbox(card.physicalCardImageUrl ?? card.imageUrl, card.name)"
        title="Click to view full size"
        :aria-label="`View ${card.name} full size`"
      >
        <img :src="card.physicalCardImageUrl ?? card.imageUrl" :alt="card.name" />
      </button>

      <template v-if="viewMode === 'image'">
        <!-- Stats -->
        <div class="stats">
          <div class="stat">
            <span class="stat-label">Type</span>
            <span class="stat-value" :style="{ color: TYPE_COLOR[card.cardType] }">{{ card.cardType }}</span>
          </div>
          <!-- why: WP-170 strict AND-semantics — render Card Count ONLY when
               both count AND setTotal are defined. Partial values must never
               render (e.g. setTotal computed but rarity-key missing ⇒ omit).
               Placed after Type and before Rarity per WP §Acceptance Criteria. -->
          <div v-if="card.count !== undefined && card.setTotal !== undefined" class="stat">
            <span class="stat-label">Card Count</span>
            <span class="stat-value">{{ card.count }} of {{ card.setTotal }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Set</span>
            <span class="stat-value">{{ card.setName }} <small>({{ card.setAbbr }})</small></span>
          </div>
          <div v-if="card.heroName" class="stat">
            <span class="stat-label">Hero</span>
            <span class="stat-value">{{ card.heroName }}</span>
          </div>
          <div v-if="card.team" class="stat">
            <span class="stat-label">Team</span>
            <span class="stat-value">{{ card.team }}</span>
          </div>
          <div v-if="card.hc" class="stat">
            <span class="stat-label">Class</span>
            <span class="stat-value" :style="{ color: HC_COLOR[card.hc] }">{{ card.hc }}</span>
          </div>
          <div v-if="card.cost !== undefined" class="stat">
            <span class="stat-label">Cost</span>
            <span class="stat-value">{{ card.cost }}</span>
          </div>
          <div v-if="card.attack" class="stat">
            <span class="stat-label">Attack</span>
            <span class="stat-value">{{ card.attack }}</span>
          </div>
          <div v-if="card.recruit" class="stat">
            <span class="stat-label">Recruit</span>
            <span class="stat-value">{{ card.recruit }}</span>
          </div>
          <div v-if="card.rarity" class="stat">
            <span class="stat-label">Rarity</span>
            <span class="stat-value">{{ RARITY_LABEL[card.rarity] }}</span>
          </div>
          <div v-if="card.slot" class="stat">
            <span class="stat-label">Slot</span>
            <span class="stat-value">{{ card.slot }}</span>
          </div>
        </div>

        <!-- Abilities with rich token rendering -->
        <div v-if="card.abilities.length" class="section">
          <div class="section-title">
            Abilities
            <span class="tooltip-hint">hover gold text for rules</span>
          </div>
          <ul class="ability-list">
            <li
              v-for="(abilityLine, lineIndex) in card.abilities"
              :key="lineIndex"
              class="ability-line"
            >
              <template v-if="abilityLine !== '[object Object]'">
                <template
                  v-for="(token, tokenIndex) in parseAbilityText(abilityLine)"
                  :key="tokenIndex"
                >
                  <!-- Plain text -->
                  <span v-if="token.type === 'text'" class="token-text">{{ token.value }}</span>

                  <!-- Keyword — gold, underlined, click opens glossary panel -->
                  <!-- why: was <span @click>; converted to <button> for native keyboard + SR support (EC-103) -->
                  <button
                    v-else-if="token.type === 'keyword'"
                    type="button"
                    :class="['token-btn', tokenClass(token)]"
                    :title="tooltipTitle(token)"
                    @click="handleTokenClick(token)"
                  >{{ tokenLabel(token) }}</button>

                  <!-- Rule reference — purple, click opens glossary panel -->
                  <!-- why: was <span @click>; converted to <button> for native keyboard + SR support (EC-103) -->
                  <button
                    v-else-if="token.type === 'rule'"
                    type="button"
                    :class="['token-btn', tokenClass(token)]"
                    :title="tooltipTitle(token)"
                    @click="handleTokenClick(token)"
                  >{{ tokenLabel(token) }}</button>

                  <!-- Icon token — colored symbol -->
                  <span
                    v-else-if="token.type === 'icon'"
                    :class="tokenClass(token)"
                  >{{ tokenLabel(token) }}</span>

                  <!-- Hero class token — colored label with superpower tooltip -->
                  <span
                    v-else-if="token.type === 'hc'"
                    :class="tokenClass(token)"
                    :style="{ color: HC_COLOR[token.value] }"
                    :title="tooltipTitle(token)"
                  >{{ tokenLabel(token) }}</span>

                  <!-- Team token — teal label -->
                  <span
                    v-else-if="token.type === 'team'"
                    class="token-team"
                  >{{ tokenLabel(token) }}</span>
                </template>
              </template>
            </li>
          </ul>
        </div>

        <!-- Raw JSON -->
        <details class="raw-json">
          <summary>Raw JSON</summary>
          <pre>{{ JSON.stringify(card, null, 2) }}</pre>
        </details>
      </template>
    </div>
  </aside>
</template>

<style scoped>
/* ── Panel layout ────────────────────────────────────────────────────────── */
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

/* ── Resize handle (4px splitter on the left edge) ──────────────────────── */
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
.detail-header { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1rem; border-bottom: 1px solid #2e2e42; flex-shrink: 0; gap: 0.5rem; }
.detail-header-title { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; flex: 1; }
.detail-header h2 { margin: 0; font-size: 0.95rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.twist-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #2a2a5a;
  border: 1px solid #5555aa;
  color: #c0c0ff;
  padding: 0.15rem 0.55rem;
  border-radius: 12px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
  width: fit-content;
  cursor: help;
}
.pattern-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #2a4a5a;
  border: 1px solid #55aacc;
  color: #c0e0ff;
  padding: 0.15rem 0.55rem;
  border-radius: 12px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
  width: fit-content;
  cursor: help;
}
.close-btn { background: none; border: none; color: #6666aa; font-size: 1.1rem; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; }
.close-btn:hover { background: #2a2a3a; color: #e8e8ee; }
.detail-body { overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }

/* ── Card image ──────────────────────────────────────────────────────────── */
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
.img-wrap img { width: 100%; display: block; object-fit: cover; pointer-events: none; }

/* ── Stats grid ──────────────────────────────────────────────────────────── */
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
.stat { background: #12121a; border-radius: 6px; padding: 0.4rem 0.55rem; }
.stat-label { display: block; font-size: 0.62rem; color: #6666aa; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { font-size: 0.82rem; font-weight: 600; color: #d8d8ee; text-transform: capitalize; }
.stat-value small { color: #6666aa; font-weight: 400; }

/* ── Abilities section ───────────────────────────────────────────────────── */
.section { display: flex; flex-direction: column; gap: 0.4rem; }
.section-title { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: #6666aa; display: flex; align-items: center; gap: 0.5rem; }
.tooltip-hint { font-size: 0.6rem; color: #44445a; text-transform: none; letter-spacing: 0; font-style: italic; }

.ability-list { margin: 0; padding-left: 1.1rem; list-style-type: disc; display: flex; flex-direction: column; gap: 0.4rem; }
.ability-line { font-size: 0.8rem; color: #c8c8e0; line-height: 1.7; }

/* ── Inline tokens ───────────────────────────────────────────────────────── */

/* why: keyword/rule tokens became <button> (EC-103). Reset native button styles
   so they render identically to the previous inline <span>; keep default focus
   outline for keyboard users. */
.token-btn {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  line-height: inherit;
  text-align: inherit;
  cursor: pointer;
}

/* Keyword: gold, dotted underline when definition exists */
.token-keyword {
  color: #f0c040;
  font-weight: 600;
}
.token-keyword.has-tooltip {
  text-decoration: underline dotted #f0c040;
  cursor: pointer;
}
.token-keyword.has-tooltip:hover {
  color: #f8d060;
  text-decoration-color: #f8d060;
}

/* Rule reference: purple */
.token-rule {
  color: #c084fc;
  font-weight: 600;
}
.token-rule.has-tooltip {
  text-decoration: underline dotted #c084fc;
  cursor: pointer;
}
.token-rule.has-tooltip:hover {
  color: #d8a8ff;
  text-decoration-color: #d8a8ff;
}

/* Icon tokens */
.token-icon       { font-size: 0.85em; font-weight: 700; padding: 0 1px; }
.token-icon-attack   { color: #f87171; }
.token-icon-recruit  { color: #60a5fa; }
.token-icon-cost     { color: #fbbf24; }
.token-icon-vp       { color: #34d399; }
.token-icon-focus    { color: #c084fc; }
.token-icon-piercing { color: #f472b6; }
.token-icon-token    { color: #94a3b8; }

/* Hero class tokens */
.token-hc {
  font-size: 0.75em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
}
.token-hc.has-tooltip {
  text-decoration: underline dotted;
  cursor: help;
}

/* Team tokens */
.token-team {
  color: #2dd4bf;
  font-size: 0.8em;
  font-weight: 600;
}

/* ── Raw JSON ────────────────────────────────────────────────────────────── */
.raw-json summary { cursor: pointer; font-size: 0.8rem; color: #6666aa; padding: 0.3rem 0; }
.raw-json pre { background: #0f0f13; border: 1px solid #22222e; border-radius: 6px; padding: 0.6rem; font-size: 0.68rem; color: #9999bb; overflow-x: auto; max-height: 220px; overflow-y: auto; margin: 0.4rem 0 0; }
</style>
