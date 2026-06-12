<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import { useTurnActions } from '../../composables/useTurnActions';
import type { SubmitMove } from './uiMoveName.types';

/**
 * Turn-actions panel — 3-step structure rewrite per
 * `DESIGN-BOARD-LAYOUT.md §5.1` and EC-132 §2 move table:
 *
 *   Step 1 (`play.start`)   → Reveal villain (revealVillainCard)
 *   Step 2 (`play.main`)    → Play / Recruit / Fight (handled by sibling
 *                              children HandRow / CityRow / HQRow /
 *                              MastermindTile via their own click
 *                              affordances; the panel exposes a
 *                              "Pass priority" affordance that fires
 *                              advanceStage to move to cleanup)
 *   Step 3 (`play.cleanup`) → End turn (endTurn) — discard hand + draw 6
 *
 * Pass-priority button fires `advanceStage` per D-10011 (canonical
 * stage-advance vocabulary; NOT a no-op). Per pre-flight PS-5 2026-05-04.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer that USES a composable, so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — 3-step turn structure
 * @see DESIGN-BOARD-LAYOUT.md §5.1
 * @see EC-132 §2 move table — Pass-priority → advanceStage
 * @see DECISIONS.md D-10011 advanceStage canonical
 */
export default defineComponent({
  name: 'TurnActionBar',
  props: {
    currentStage: {
      type: String,
      required: true,
    },
    isViewerTurn: {
      type: Boolean,
      required: false,
      default: true,
    },
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
    // why: D-22203 — derived from UIState.pendingHeroChoice !== undefined at
    // the page level; passed down so TurnActionBar can block end-turn and
    // pass-priority at cleanup while the player has an unresolved choice.
    hasPendingChoice: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup(props) {
    function activeStep(): 1 | 2 | 3 {
      return useTurnActions(props.currentStage, props.isViewerTurn, props.hasPendingChoice).activeStep;
    }

    function revealGate(): { allowed: boolean; reason: string | null } {
      return useTurnActions(props.currentStage, props.isViewerTurn, props.hasPendingChoice).canRevealVillain();
    }

    function passPriorityGate(): { allowed: boolean; reason: string | null } {
      return useTurnActions(props.currentStage, props.isViewerTurn, props.hasPendingChoice).canPassPriority();
    }

    function endTurnGate(): { allowed: boolean; reason: string | null } {
      return useTurnActions(props.currentStage, props.isViewerTurn, props.hasPendingChoice).canEndTurn();
    }

    function onReveal(): void {
      // why: empty-object payload — revealVillainCard takes no arguments
      // by engine design (see villainDeck.reveal.ts). Pops a card from
      // the villain deck into the City; gated to play.start.
      props.submitMove('revealVillainCard', {});
    }

    function onPassPriority(): void {
      // why: D-10011 — Pass-priority fires advanceStage, the canonical
      // stage-advance vocabulary. NOT a no-op. Cycles G.currentStage
      // through start → main → cleanup; from cleanup it advances and
      // ends the turn per turnLoop.ts.
      props.submitMove('advanceStage', {});
    }

    function onEndTurn(): void {
      // why: empty-object payload — EndTurnArgs is `Record<string, never>`
      // per coreMoves.types.ts:57. The move takes no arguments.
      props.submitMove('endTurn', {});
    }

    return {
      activeStep,
      revealGate,
      passPriorityGate,
      endTurnGate,
      onReveal,
      onPassPriority,
      onEndTurn,
    };
  },
});
</script>

<template>
  <section
    class="turn-action-bar"
    data-testid="play-turn-action-bar"
    aria-label="Turn actions"
    :data-active-step="activeStep()"
  >
    <ol class="turn-action-bar__steps">
      <li
        class="turn-action-bar__step"
        :class="{ 'turn-action-bar__step--active': activeStep() === 1 }"
        data-testid="play-turn-step-1"
      >
        <header>Step 1 — Reveal villain (play.start)</header>
        <button
          type="button"
          data-testid="play-action-reveal"
          :disabled="!revealGate().allowed"
          :aria-disabled="!revealGate().allowed ? 'true' : undefined"
          :title="revealGate().reason ?? undefined"
          @click="onReveal"
        >
          <!-- why: stage gating per D-10012 — revealVillainCard is gated
               to play.start. Disabled-tooltip precedence per EC-132 §3
               binds the reason from useTurnActions. The start-of-turn hand
               is drawn automatically by the engine onBegin (WP-236); the
               former "Draw to 6" scaffold button is retired. -->
          ▶ Reveal top of Villain Deck
        </button>
      </li>
      <li
        class="turn-action-bar__step"
        :class="{ 'turn-action-bar__step--active': activeStep() === 2 }"
        data-testid="play-turn-step-2"
      >
        <header>Step 2 — Play / Recruit / Fight (play.main)</header>
        <p class="turn-action-bar__hint">
          Tap a card in hand, a city villain, an HQ hero, or the mastermind tile.
        </p>
        <button
          type="button"
          data-testid="play-action-pass-priority"
          :disabled="!passPriorityGate().allowed"
          :aria-disabled="!passPriorityGate().allowed ? 'true' : undefined"
          :title="passPriorityGate().reason ?? undefined"
          @click="onPassPriority"
        >
          <!-- why: D-10011 — Pass-priority fires advanceStage, the
               canonical stage-advance vocabulary. Disabled-tooltip
               precedence per EC-132 §3 binds the reason from
               useTurnActions.canPassPriority (always allowed; the gate
               is here for the precedence-pattern uniformity). -->
          Pass priority
        </button>
      </li>
      <li
        class="turn-action-bar__step"
        :class="{ 'turn-action-bar__step--active': activeStep() === 3 }"
        data-testid="play-turn-step-3"
      >
        <header>Step 3 — End turn (play.cleanup)</header>
        <button
          type="button"
          data-testid="play-action-end-turn"
          :disabled="!endTurnGate().allowed"
          :aria-disabled="!endTurnGate().allowed ? 'true' : undefined"
          :title="endTurnGate().reason ?? undefined"
          @click="onEndTurn"
        >
          <!-- why: stage gating per WP-100 §Locked contract values —
               endTurn is gated to play.cleanup. Disabled-tooltip
               precedence per EC-132 §3 binds the reason from
               useTurnActions.canEndTurn. -->
          ✓ End turn — discard hand and draw 6
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.turn-action-bar {
  position: sticky;
  bottom: 0;
  z-index: 100;
  background: var(--color-background, #fff);
  border-top: 2px solid var(--color-foreground, #333);
  padding: 0.35rem 0.75rem;
  margin: 0 -0.75rem;
}

.turn-action-bar__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  align-items: flex-start;
}

.turn-action-bar__step {
  flex: 1;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-foreground, #999);
  opacity: 0.4;
  font-size: 0.8rem;
}

.turn-action-bar__step--active {
  opacity: 1;
  border-color: var(--color-foreground, #333);
}

.turn-action-bar__step header {
  font-weight: 600;
  font-size: 0.75rem;
  margin-bottom: 0.15rem;
}

.turn-action-bar__hint {
  margin: 0 0 0.25rem 0;
  font-style: italic;
  opacity: 0.85;
  font-size: 0.75rem;
}

.turn-action-bar__step button {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}
</style>
