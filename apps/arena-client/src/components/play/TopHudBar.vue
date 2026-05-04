<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIState } from '@legendary-arena/game-engine';

/**
 * Top HUD bar for the WP-129 board layout.
 *
 * Renders `game.{phase, turn, activePlayerId, currentStage}` plus
 * `progress.{bystandersRescued, escapedVillains}` plus scheme/mastermind
 * progress. Reserves the skin-selector slot per D-12907 (populated by
 * WP-130 — this WP only declares the slot, no interactive behavior).
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer with computed state (twist progress, mastermind progress) so
 * it MUST use `defineComponent({ setup() { return {...} } })` per
 * P6-30 / P6-46 / D-6512 (vue-sfc-loader separate-compile rule). The
 * template references non-prop bindings (twist progress text, mastermind
 * progress text, active-player display) that only reach `_ctx` when
 * explicitly returned from setup().
 *
 * @see WP-129 §Acceptance Criteria — Top HUD bar
 * @see DESIGN-BOARD-LAYOUT.md §3.1 Top HUD bar (desktop)
 * @see DESIGN-BOARD-LAYOUT.md §3.2 Sticky Top HUD (mobile)
 * @see DECISIONS.md D-12907 skin-selector slot reserved (WP-130)
 */
export default defineComponent({
  name: 'TopHudBar',
  props: {
    snapshot: {
      type: Object as PropType<UIState>,
      required: true,
    },
    /**
     * Mastermind tactic threshold (e.g., 4 strike cards = 4 tactics
     * remaining at match start). Owned by the scenario; passed in by
     * the parent which knows the active scenario.
     */
    mastermindTacticsTotal: {
      type: Number,
      required: true,
    },
    /**
     * Scheme twist threshold (e.g., 8 in "Capture Five Bystanders" with
     * 8 twist cards). Owned by the scenario; passed in by the parent.
     */
    schemeTwistThreshold: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    function activePlayerLabel(): string {
      const id = props.snapshot.game.activePlayerId;
      return id === '' ? 'pending' : id;
    }

    function twistProgressLabel(): string {
      return `${props.snapshot.scheme.twistCount}/${props.schemeTwistThreshold}`;
    }

    function mastermindProgressLabel(): string {
      const defeated = props.snapshot.mastermind.tacticsDefeated;
      return `${defeated}/${props.mastermindTacticsTotal}`;
    }

    return {
      activePlayerLabel,
      twistProgressLabel,
      mastermindProgressLabel,
    };
  },
});
</script>

<template>
  <header
    class="top-hud-bar"
    data-testid="play-top-hud-bar"
    aria-label="Top HUD"
  >
    <div class="top-hud-bar__row">
      <span data-testid="play-hud-phase">Phase: {{ snapshot.game.phase }}</span>
      <span data-testid="play-hud-turn">Turn {{ snapshot.game.turn }}</span>
      <span data-testid="play-hud-active">Active: {{ activePlayerLabel() }}</span>
      <span data-testid="play-hud-stage">Stage: {{ snapshot.game.currentStage }}</span>
    </div>
    <div class="top-hud-bar__row">
      <span data-testid="play-hud-twists">Twists: {{ twistProgressLabel() }}</span>
      <span data-testid="play-hud-strikes">Strikes: {{ mastermindProgressLabel() }}</span>
      <span data-testid="play-hud-bystanders">
        Bystanders rescued: {{ snapshot.progress.bystandersRescued }}
      </span>
      <span data-testid="play-hud-escaped">
        Escaped: {{ snapshot.progress.escapedVillains }}
      </span>
    </div>
    <div class="top-hud-bar__row">
      <!-- why: D-12907 reserves the skin-selector slot for WP-130; this WP
           only renders a placeholder label and emits no interactive event.
           Future WP-130 swaps in the actual selector. -->
      <slot name="skin-selector">
        <span data-testid="play-hud-skin-placeholder" class="top-hud-bar__skin-placeholder">
          🎨 Skin: Classic
        </span>
      </slot>
    </div>
  </header>
</template>

<style scoped>
.top-hud-bar {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-foreground, #999);
}

.top-hud-bar__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.top-hud-bar__skin-placeholder {
  opacity: 0.7;
  font-style: italic;
}
</style>
