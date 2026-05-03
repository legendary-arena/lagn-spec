<script setup lang="ts">
/**
 * CardDataTile.vue
 * Tile-sized structured-data view for a single FlatCard.
 *
 * why: this is the grid-tile cousin of CardDataDisplay.vue (the sidebar
 * data view). The field set rendered here is locked at WP-096 / EC-096
 * ratification — see docs/ai/work-packets/WP-096-registry-viewer-grid-
 * data-view.md §Locked Values and docs/ai/DECISIONS.md D-9601. Six of
 * the seven labelled rows ("Type", "Class", "Cost", "Attack", "Recruit",
 * "Rarity") are byte-identical to the labels at CardDataDisplay.vue:73,
 * 86, 101, 106, 111, 116. The seventh row deliberately diverges: this
 * tile uses the compact label "Set" rendering FlatCard.setAbbr, while
 * the sidebar at CardDataDisplay.vue:78 uses "Edition" rendering
 * FlatCard.setName with setAbbr parenthesized. The divergence is a
 * tile-compaction choice — the 130px-min `.img-wrap` box (3:4 aspect)
 * cannot accommodate full set names like "Marvel Studios: What If…?"
 * without ellipsis defenses or grid-column reflow.
 *
 * why (WP-127 / EC-129 / D-9601 amendments 2026-05-02 + 2026-05-03):
 * the locked tile vocabulary is now eight labelled rows — `Team` joins
 * unconditionally between `Class` and `Cost` (mirroring the sidebar's
 * row ordering at CardDataDisplay.vue:90 byte-for-byte with the same
 * AND-semantics `v-if="card.team"` guard, no threshold prefix). The
 * 2026-05-02 amendment originally gated `Team` behind the threshold
 * for parity with the `Ability` block, but manual smoke surfaced that
 * `team` values are short single-line strings ("Avengers", "X-Men",
 * "S.H.I.E.L.D.") that fit at every tile width — the existing `<dd>`
 * cell CSS (`word-break: break-word; overflow: hidden; text-overflow:
 * ellipsis;`) defends against unusually long values. The 2026-05-03
 * amendment-2 decoupled `Team` from `showAbilityRow`. The `Ability`
 * block remains threshold-gated (only renders when `cardSize.value >=
 * ABILITY_THRESHOLD_PX`) because ability strings are token-heavy and
 * variable-length; sub-threshold widths genuinely overflow.
 * `cardTileThresholds.ts` holds the threshold to preserve D-12101's
 * locked `useCardSize.ts` surface. The seven WP-096 rows + their CSS +
 * the existing `@media print` block are byte-identical pre- and
 * post-amendments; the `Team` row's `<dd>` is covered by the existing
 * `.data-grid dd` print rule (no new print rule required for it).
 *
 * AND-semantics: empty / null / undefined / empty-string fields are
 * omitted entirely (no em-dash, no "—", no placeholder). Guard forms
 * mirror CardDataDisplay.vue exactly for the six common rows; the new
 * `Team` row mirrors CardDataDisplay.vue:90–93 with an additional
 * `showAbilityRow` threshold prefix; the new `Ability` block mirrors
 * CardDataDisplay.vue:130–141 with the same threshold prefix.
 */

import { computed } from "vue";
import type { FlatCard } from "../registry/browser";
// why: useCardSize is the cousin of CardGrid.vue's composable-direct
// consumption pattern (lines 14–19 in that file). Reading cardSize here
// keeps the threshold-gated reveal a pure derivation from the same
// module-scoped ref the slider writes — no prop plumbing, no second
// source of truth. D-12101's locked composable surface is preserved
// verbatim: this file is read-only against `cardSize` and adds zero
// exports to `useCardSize.ts`.
import { useCardSize } from "../composables/useCardSize";
// why: the threshold lives in a sibling single-export module rather
// than `useCardSize.ts` to preserve D-12101's locked composable surface
// (exactly two names plus the four range constants). See
// `cardTileThresholds.ts` module-header JSDoc for the full rationale.
import { ABILITY_THRESHOLD_PX } from "../composables/cardTileThresholds";

defineProps<{ card: FlatCard }>();

const { cardSize } = useCardSize();

// why: gates the `Ability` block reveal only (per D-9601 amendment-2,
// 2026-05-03). `Team` joins the tile vocabulary unconditionally and
// uses a plain `card.team` guard mirroring CardDataDisplay.vue:90.
// The threshold value is defined exactly once in
// `cardTileThresholds.ts` as `ABILITY_THRESHOLD_PX`; this file imports
// it by name and never inlines the numeric literal. Below threshold,
// the `Ability` block guard short-circuits and the WP-096 seven-row
// baseline + the unconditional `Team` row render byte-identically to
// the post-amendment-2 spec.
const showAbilityRow = computed(() => cardSize.value >= ABILITY_THRESHOLD_PX);

/**
 * Returns true when the supplied ability line carries no useful text.
 * Guards against the literal string "[object Object]" that appears in
 * some set JSON where a structured ability accidentally serialized
 * through String() — the same guard already lives in CardDataDisplay.vue
 * and CardDetail.vue.
 */
function hasAbilityText(line: string): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === "[object Object]") return false;
  return true;
}
</script>

<template>
  <section class="card-data-tile" :aria-label="`Data view for ${card.name}`">
    <h3 v-if="card.name" class="card-data-tile-title">{{ card.name }}</h3>

    <dl class="data-grid">
      <template v-if="card.cardType">
        <dt>Type</dt>
        <dd class="capitalize">{{ card.cardType }}</dd>
      </template>

      <template v-if="card.setAbbr">
        <dt>Set</dt>
        <dd :title="card.setName || card.setAbbr">{{ card.setAbbr }}</dd>
      </template>

      <template v-if="card.hc">
        <dt>Class</dt>
        <dd class="capitalize">{{ card.hc }}</dd>
      </template>

      <template v-if="card.team">
        <dt>Team</dt>
        <dd>{{ card.team }}</dd>
      </template>

      <!--
        why: the cost guard uses an explicit `!== undefined && !== null`
        check rather than truthiness (`v-if="card.cost"`). A zero-cost
        card is legitimate and present in the source data — truthiness
        would hide every legitimate zero-cost card, breaking AND-semantics
        and silently dropping a real attribute.
      -->
      <template v-if="card.cost !== undefined && card.cost !== null">
        <dt>Cost</dt>
        <dd>{{ card.cost }}</dd>
      </template>

      <!--
        why: the attack and recruit fields are typed `string | null` on
        FlatCard, but real card JSON sometimes carries the empty string
        "" in lieu of null for these fields. The empty-string clause is
        required to keep AND-semantics: omit the row entirely when the
        card has no fight or recruit value, regardless of which empty
        sentinel the source data used.
      -->
      <template v-if="card.attack !== undefined && card.attack !== null && card.attack !== ''">
        <dt>Attack</dt>
        <dd>{{ card.attack }}</dd>
      </template>

      <template v-if="card.recruit !== undefined && card.recruit !== null && card.recruit !== ''">
        <dt>Recruit</dt>
        <dd>{{ card.recruit }}</dd>
      </template>

      <template v-if="card.rarityLabel">
        <dt>Rarity</dt>
        <dd>{{ card.rarityLabel }}</dd>
      </template>
      <template v-else-if="card.rarity !== undefined && card.rarity !== null">
        <dt>Rarity</dt>
        <dd>{{ card.rarity }}</dd>
      </template>
    </dl>

    <div v-if="showAbilityRow && card.abilities && card.abilities.some(hasAbilityText)" class="ability-block">
      <div class="ability-block-title">Ability</div>
      <ul class="ability-lines">
        <li
          v-for="(abilityLine, lineIndex) in card.abilities"
          :key="lineIndex"
          class="ability-line"
        >
          <template v-if="hasAbilityText(abilityLine)">{{ abilityLine }}</template>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.card-data-tile {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: #12121a;
  color: #d8d8ee;
  padding: 0.45rem 0.5rem;
  overflow: hidden;
  box-sizing: border-box;
}

.card-data-tile-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #f0f0ff;
  border-bottom: 1px solid #2a2a3a;
  padding-bottom: 0.3rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 0.45rem;
  row-gap: 0.18rem;
  margin: 0;
  overflow: hidden;
}

.data-grid dt {
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6666aa;
  align-self: baseline;
}

.data-grid dd {
  margin: 0;
  font-size: 0.65rem;
  color: #d8d8ee;
  font-weight: 600;
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-grid dd.capitalize {
  text-transform: capitalize;
}

.ability-block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.3rem;
}

.ability-block-title {
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6666aa;
}

.ability-lines {
  margin: 0;
  padding-left: 0.9rem;
  list-style-type: disc;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ability-line {
  font-size: 0.6rem;
  color: #c8c8e0;
  line-height: 1.45;
}

@media print {
  .card-data-tile {
    background: #ffffff;
    color: #000000;
    border: 1px solid #888888;
  }

  .card-data-tile-title {
    color: #000000;
    border-bottom-color: #888888;
  }

  .data-grid dt {
    color: #333333;
  }

  .data-grid dd {
    color: #000000;
  }

  .ability-block-title {
    color: #333333;
  }

  .ability-line {
    color: #000000;
  }
}
</style>
