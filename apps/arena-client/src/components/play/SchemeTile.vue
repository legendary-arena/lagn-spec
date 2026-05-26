<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UISchemeState, UICardDisplay } from '@legendary-arena/game-engine';
import CardTile from './CardTile.vue';

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
  components: { CardTile },
  props: {
    scheme: {
      type: Object as PropType<UISchemeState>,
      required: true,
    },
    /**
     * Optional display data for the scheme card. When present and has a
     * truthy imageUrl, CardTile renders the scheme art. When absent or
     * imageUrl is empty, CardTile renders in fallback text mode.
     */
    schemeDisplay: {
      type: Object as PropType<UICardDisplay | null>,
      required: false,
      default: null,
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
  setup(props) {
    function schemeCardDisplay(): UICardDisplay {
      if (props.scheme.display !== undefined && props.scheme.display !== null) {
        return props.scheme.display;
      }
      if (props.schemeDisplay !== null) {
        return props.schemeDisplay;
      }
      // why: fallback synthesizes a UICardDisplay with empty imageUrl so
      // CardTile renders in text mode — no broken image placeholders
      return {
        extId: props.scheme.id,
        name: props.scheme.id.replace(/-/g, ' '),
        imageUrl: '',
        cost: null,
      };
    }

    return { schemeCardDisplay };
  },
});
</script>

<template>
  <section
    class="scheme-tile"
    data-testid="play-scheme-tile"
    aria-label="Scheme"
  >
    <CardTile :display="schemeCardDisplay()" size="lg" :show-cost="false" />
    <p class="scheme-tile__progress" data-testid="play-scheme-twist-progress">
      Twists: {{ scheme.twistCount }}/{{ twistThreshold }}
    </p>
    <ul
      v-if="scheme.gameText && scheme.gameText.length > 0"
      class="scheme-tile__game-text"
      data-testid="play-scheme-game-text"
    >
      <li
        v-for="(line, index) in scheme.gameText"
        :key="index"
        class="scheme-tile__game-text-line"
      >
        {{ line }}
      </li>
    </ul>
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

.scheme-tile__game-text {
  margin: 0.25rem 0 0;
  padding-left: 0;
  list-style: none;
  font-size: 0.8rem;
  line-height: 1.35;
  opacity: 0.9;
}

.scheme-tile__game-text-line {
  margin-bottom: 0.15rem;
}
</style>
