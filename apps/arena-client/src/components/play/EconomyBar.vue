<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UITurnEconomyState } from '@legendary-arena/game-engine';

/**
 * Economy bar — renders `economy.{attack, recruit, availableAttack,
 * availableRecruit, piercing, woundsDrawn}`.
 *
 * SAFE-SKIP-WP128: `economy.piercing` and `economy.woundsDrawn` ship as
 * constant `0` per WP-128 / D-12806 until future engine WPs add
 * `G.turnEconomy.piercing` (and the move logic that increments it) and
 * `G.turnEconomy.woundsDrawn` (and the wound-draw tracking it requires).
 * This bar renders the zero-state until those WPs land — no behavioral
 * change is required when they do, only fixture/test updates.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer, so it MUST use `defineComponent({ setup() { return {...} } })`
 * per P6-30 / P6-46 / D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Economy bar
 * @see DESIGN-BOARD-LAYOUT.md §3.1 ECONOMY row
 */
export default defineComponent({
  name: 'EconomyBar',
  props: {
    economy: {
      type: Object as PropType<UITurnEconomyState>,
      required: true,
    },
  },
  setup() {
    return {};
  },
});
</script>

<template>
  <section
    class="economy-bar"
    data-testid="play-economy-bar"
    aria-label="Economy"
  >
    <span data-testid="play-economy-attack">
      Attack: {{ economy.availableAttack }}/{{ economy.attack }}
    </span>
    <span data-testid="play-economy-recruit">
      Recruit: {{ economy.availableRecruit }}/{{ economy.recruit }}
    </span>
    <span data-testid="play-economy-piercing">
      Pierce: {{ economy.piercing }}
    </span>
    <span data-testid="play-economy-wounds-drawn">
      Wounds drawn: {{ economy.woundsDrawn }}
    </span>
  </section>
</template>

<style scoped>
.economy-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--color-foreground, #999);
}
</style>
