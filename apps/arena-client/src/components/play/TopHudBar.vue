<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UIState } from '@legendary-arena/game-engine';
import SkinSelector from './SkinSelector.vue';

/**
 * Top HUD bar for the WP-129 board layout.
 *
 * Renders `game.{phase, turn, activePlayerId, currentStage}` plus
 * `progress.{bystandersRescued, escapedVillains}` plus scheme/mastermind
 * progress. Mounts the WP-130 `<SkinSelector>` in the slot reserved by
 * D-12907.
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
  components: { SkinSelector },
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

    function schemeName(): string {
      const display = props.snapshot.scheme.display;
      if (display !== undefined && display.name !== '<unknown>') {
        return display.name;
      }
      return props.snapshot.scheme.id.replace(/^scheme-/i, '').replace(/-/g, ' ');
    }

    function mastermindName(): string {
      const display = props.snapshot.mastermind.display;
      if (display.name !== '<unknown>') {
        return display.name;
      }
      return props.snapshot.mastermind.id.replace(/-/g, ' ');
    }

    return {
      activePlayerLabel,
      twistProgressLabel,
      mastermindProgressLabel,
      schemeName,
      mastermindName,
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
    <div class="top-hud-bar__row top-hud-bar__setup">
      <span data-testid="play-hud-mastermind-name">
        <strong>Mastermind:</strong> {{ mastermindName() }}
      </span>
      <span data-testid="play-hud-scheme-name">
        <strong>Scheme:</strong> {{ schemeName() }}
      </span>
    </div>
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
      <!-- why: D-12907 reserves the skin-selector slot for WP-130; the
           WP-130 `<SkinSelector>` mounts here as the default slot
           content. Parents that want to override (test fixtures, future
           replay-spectator surface) can still pass alternative slot
           content; the slot itself is preserved. -->
      <slot name="skin-selector">
        <SkinSelector />
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

.top-hud-bar__setup {
  font-size: 0.95rem;
  text-transform: capitalize;
}

.top-hud-bar__skin-placeholder {
  opacity: 0.7;
  font-style: italic;
}
</style>
