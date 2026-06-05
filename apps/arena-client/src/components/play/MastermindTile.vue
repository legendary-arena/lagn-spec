<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type {
  UIMastermindState,
  UITurnEconomyState,
} from '@legendary-arena/game-engine';
import { useTurnActions } from '../../composables/useTurnActions';
import { useCardCostGating, type GatingResult } from '../../composables/useCardCostGating';
import CardTile from './CardTile.vue';
import type { SubmitMove } from './uiMoveName.types';

/**
 * Mastermind tile — renders the mastermind id + tactics-remaining counter
 * + WP-128 `attachedBystanders` array. Click fires `fightMastermind`.
 *
 * SAFE-SKIP-WP128: `mastermind.attachedBystanders` ships as `[]` per
 * WP-128 / D-12806 / D-12805 (Interpretation B locked). Per D-12805 these
 * are bystanders captured by the mastermind itself (Master Strike effects,
 * not city-villain captures); engine has no source today and the array is
 * empty. The tile renders the empty list rather than stub data; future
 * engine WP back-fill needs only fixture/test updates.
 *
 * Cost gating: the mastermind is fightable when `economy.availableAttack
 * >= mastermind.display.cost`. Disabled-state tooltip precedence locked at
 * EC-132 §3 (stage → resource → structural; "all tactics defeated" is the
 * structural lock).
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer that USES composables, so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Mastermind tile
 * @see DECISIONS.md D-12805 attachedBystanders semantics
 * @see DECISIONS.md D-12806 safe-skip resolution
 */
export default defineComponent({
  name: 'MastermindTile',
  components: { CardTile },
  props: {
    mastermind: {
      type: Object as PropType<UIMastermindState>,
      required: true,
    },
    currentStage: {
      type: String,
      required: true,
    },
    economy: {
      type: Object as PropType<UITurnEconomyState>,
      required: true,
    },
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
  },
  setup(props) {
    function gateForFight(): GatingResult {
      // why: disabled-state tooltip precedence per EC-132 §3 — stage →
      // resource → structural. Stage gate first; then cost gate (consumes
      // WP-128 economy.availableAttack); finally the structural-lock
      // "all tactics defeated" check.
      const stage = useTurnActions(props.currentStage).canFightMastermind();
      if (!stage.allowed) {
        return stage;
      }
      const cost = useCardCostGating(props.economy).canFight(props.mastermind.display);
      if (!cost.allowed) {
        return cost;
      }
      if (props.mastermind.tacticsRemaining === 0) {
        return {
          allowed: false,
          reason: 'All tactics defeated; mastermind already fallen.',
        };
      }
      return { allowed: true, reason: null };
    }

    function onFight(): void {
      // why: empty-object payload — fightMastermind takes no arguments by
      // engine design. The move always defeats the top tactic.
      props.submitMove('fightMastermind', {});
    }

    return { gateForFight, onFight };
  },
});
</script>

<template>
  <section
    class="mastermind-tile"
    data-testid="play-mastermind-tile"
    aria-label="Mastermind"
  >
    <button
      type="button"
      data-testid="play-mastermind-button"
      :data-mastermind-id="mastermind.id"
      :disabled="!gateForFight().allowed"
      :aria-disabled="!gateForFight().allowed ? 'true' : undefined"
      :title="gateForFight().reason ?? undefined"
      @click="onFight"
    >
      <!-- why: disabled-state tooltip precedence locked at EC-132 §3
           (stage → resource → structural). Reason text is bound from
           useTurnActions / useCardCostGating + the structural "all
           tactics defeated" override. -->
      <CardTile
        :display="mastermind.display"
        size="lg"
        :interactive="gateForFight().allowed"
        :show-label="true"
      />
      <span class="mastermind-status" data-testid="play-mastermind-tactics-remaining">
        Tactics remaining: {{ mastermind.tacticsRemaining }}
      </span>
    </button>
    <ul
      v-if="mastermind.gameText && mastermind.gameText.length > 0"
      class="mastermind-game-text"
      data-testid="play-mastermind-game-text"
    >
      <li
        v-for="(line, index) in mastermind.gameText"
        :key="index"
        class="mastermind-game-text__line"
      >
        {{ line }}
      </li>
    </ul>
    <section
      class="mastermind-bystanders"
      data-testid="play-mastermind-bystanders"
      aria-label="Mastermind captured bystanders"
    >
      <header>Captured bystanders</header>
      <ul
        v-if="mastermind.attachedBystanders.length > 0"
        data-testid="play-mastermind-bystanders-list"
      >
        <li
          v-for="entry in mastermind.attachedBystanders"
          :key="entry.extId"
          class="mastermind-bystander"
        >
          {{ entry.display.name }}
        </li>
      </ul>
      <p
        v-else
        class="mastermind-bystanders__empty"
        data-testid="play-mastermind-bystanders-empty"
      >
        None captured.
      </p>
    </section>
  </section>
</template>

<style scoped>
.mastermind-tile {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-foreground, #999);
}

.mastermind-tile button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
}

.mastermind-id {
  font-weight: 600;
}

.mastermind-cost,
.mastermind-status {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.mastermind-bystanders ul {
  margin: 0;
  padding-left: 1.25rem;
}

.mastermind-bystanders__empty {
  margin: 0;
  font-style: italic;
  opacity: 0.7;
}

.mastermind-game-text {
  margin: 0.25rem 0 0;
  padding-left: 0;
  list-style: none;
  font-size: 0.8rem;
  line-height: 1.35;
  opacity: 0.9;
}

.mastermind-game-text__line {
  margin-bottom: 0.15rem;
}
</style>
