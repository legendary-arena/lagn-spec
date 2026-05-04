<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UISchemeState } from '@legendary-arena/game-engine';

/**
 * Scheme tile leaf — renders the scheme id + twist progress bar.
 *
 * Implements `DESIGN-BOARD-LAYOUT.md §3.1` Scheme zone (desktop) and
 * `§3.2` Scheme band (mobile). The Scheme Twist Pile sits to the right
 * (desktop) or as a separate band (mobile) and is rendered by
 * `<SchemeTwistPile>` — this tile only shows the scheme identity and the
 * twist progress fraction.
 *
 * @see WP-129 §Acceptance Criteria — Scheme tile rendering
 */
export default defineComponent({
  name: 'SchemeTile',
  props: {
    scheme: {
      type: Object as PropType<UISchemeState>,
      required: true,
    },
    /**
     * Total twist threshold for the scheme (e.g., 8 in "Capture Five
     * Bystanders" with 8 twist cards). Owned by the scenario; passed in
     * by the parent which knows the active scenario.
     */
    twistThreshold: {
      type: Number,
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
    class="scheme-tile"
    data-testid="play-scheme-tile"
    aria-label="Scheme"
  >
    <header class="scheme-tile__header">
      <span class="scheme-tile__id">{{ scheme.id }}</span>
    </header>
    <p class="scheme-tile__progress" data-testid="play-scheme-twist-progress">
      Twists: {{ scheme.twistCount }}/{{ twistThreshold }}
    </p>
  </section>
</template>

<style scoped>
.scheme-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
}

.scheme-tile__id {
  font-weight: 600;
}

.scheme-tile__progress {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
</style>
