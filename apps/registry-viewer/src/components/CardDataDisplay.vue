<script setup lang="ts">
/**
 * CardDataDisplay.vue
 * Structured data view for a single FlatCard.
 *
 * Alternative presentation to the image branch in CardDetail.vue.
 * Renders FlatCard attributes in a labelled, printable table.
 *
 * Designer choice (per EC-066 §Locked Values "AND semantics"):
 *   Empty / null / absent fields are OMITTED entirely (not rendered
 *   as em-dash). This keeps the printable output clean on cards that
 *   only carry a subset of attributes (e.g., schemes have no cost /
 *   attack / recruit / team; bystanders have almost no stats).
 *
 * Locked display labels (per EC-066 §Locked Values — right-hand side
 * of each row is byte-exact, left-hand side maps to the nearest
 * FlatCard field where the names differ):
 *   name           -> "Name"                 (FlatCard.name)
 *   type           -> "Type"                 (FlatCard.cardType)
 *   edition        -> "Edition"              (FlatCard.setName)
 *   heroClass      -> "Class"                (FlatCard.hc)
 *   team           -> "Team"                 (FlatCard.team)
 *   cost           -> "Cost"                 (FlatCard.cost)
 *   attack         -> "Attack"               (FlatCard.attack)
 *   recruit        -> "Recruit"              (FlatCard.recruit)
 *   victoryPoints  -> "Victory Points"       (not on FlatCard today;
 *                                             omitted by AND-semantics)
 *   rarity         -> "Rarity"               (FlatCard.rarityLabel
 *                                             preferred for display,
 *                                             falls back to rarity)
 *   recruiterText  -> "Recruiting Effect"    (not on FlatCard today;
 *                                             omitted by AND-semantics)
 *   attackerText   -> "Attack Effect"        (not on FlatCard today;
 *                                             omitted by AND-semantics)
 *   abilityText    -> "Ability"              (FlatCard.abilities: string[])
 *
 * The three "not on FlatCard today" rows are contract-aware placeholders
 * that will auto-light-up if/when flattenSet() begins surfacing those
 * fields (a future registry WP). Until then they safely omit per the
 * non-null/non-empty rule — no runtime errors, no misleading labels.
 */

import type { FlatCard } from "../registry/browser";

defineProps<{ card: FlatCard }>();

/**
 * Returns true when the supplied ability line carries no useful text.
 * Guards against the literal string "[object Object]" that appears in
 * some set JSON where a structured ability accidentally serialized
 * through String() — the same guard already lives in CardDetail.vue.
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
  <section class="card-data" :aria-label="`Data view for ${card.name}`">
    <h3 class="card-data-title">{{ card.name }}</h3>

    <dl class="data-grid">
      <template v-if="card.name">
        <dt>Name</dt>
        <dd>{{ card.name }}</dd>
      </template>

      <template v-if="card.cardType">
        <dt>Type</dt>
        <dd class="capitalize">{{ card.cardType }}</dd>
      </template>

      <template v-if="card.setName">
        <dt>Edition</dt>
        <dd>
          {{ card.setName }}
          <small v-if="card.setAbbr" class="muted">({{ card.setAbbr }})</small>
        </dd>
      </template>

      <template v-if="card.hc">
        <dt>Class</dt>
        <dd class="capitalize">{{ card.hc }}</dd>
      </template>

      <template v-if="card.team">
        <dt>Team</dt>
        <dd>{{ card.team }}</dd>
      </template>

      <template v-if="card.heroName">
        <dt>Hero</dt>
        <dd>{{ card.heroName }}</dd>
      </template>

      <template v-if="card.cost !== undefined && card.cost !== null">
        <dt>Cost</dt>
        <dd>{{ card.cost }}</dd>
      </template>

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
      <template v-else-if="typeof card.rarity === 'number'">
        <dt>Rarity</dt>
        <dd>{{ card.rarity }}</dd>
      </template>

      <!-- why: WP-170 strict AND-semantics — Card Count row renders only when
           both count AND setTotal are defined. Same omission rule as the
           image-view stats grid in CardDetail.vue. Placed after Rarity per
           EC-188 §Required Comments + WP §Acceptance Criteria. -->
      <template v-if="card.count !== undefined && card.setTotal !== undefined">
        <dt>Card Count</dt>
        <dd>{{ card.count }} of {{ card.setTotal }}</dd>
      </template>

      <template v-if="typeof card.slot === 'number'">
        <dt>Slot</dt>
        <dd>{{ card.slot }}</dd>
      </template>
    </dl>

    <div v-if="card.abilities && card.abilities.some(hasAbilityText)" class="ability-block">
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
.card-data {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  background: #12121a;
  border: 1px solid #22222e;
  border-radius: 8px;
  padding: 0.9rem 1rem;
  color: #e8e8ee;
}

.card-data-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #f0f0ff;
  border-bottom: 1px solid #2a2a3a;
  padding-bottom: 0.5rem;
}

.data-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 0.9rem;
  row-gap: 0.3rem;
  margin: 0;
}

.data-grid dt {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6666aa;
  align-self: baseline;
}

.data-grid dd {
  margin: 0;
  font-size: 0.85rem;
  color: #d8d8ee;
  font-weight: 600;
  word-break: break-word;
}

.data-grid dd.capitalize {
  text-transform: capitalize;
}

.data-grid .muted {
  color: #6666aa;
  font-weight: 400;
  margin-left: 0.25rem;
}

.ability-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ability-block-title {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6666aa;
}

.ability-lines {
  margin: 0;
  padding-left: 1.1rem;
  list-style-type: disc;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ability-line {
  font-size: 0.82rem;
  color: #c8c8e0;
  line-height: 1.55;
}

/* Printable output — clean, high-contrast, no dark background. */
@media print {
  .card-data {
    background: #ffffff;
    color: #000000;
    border: 1px solid #888888;
  }

  .card-data-title {
    color: #000000;
    border-bottom-color: #888888;
  }

  .data-grid dt {
    color: #333333;
  }

  .data-grid dd {
    color: #000000;
  }

  .data-grid .muted {
    color: #555555;
  }

  .ability-block-title {
    color: #333333;
  }

  .ability-line {
    color: #000000;
  }
}
</style>
