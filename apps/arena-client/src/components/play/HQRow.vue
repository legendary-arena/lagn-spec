<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type {
  UIDecksState,
  UIHQState,
  UITurnEconomyState,
} from '@legendary-arena/game-engine';
import { useHqRow, type HqCell } from '../../composables/useHqRow';
import { useCardCostGating, type GatingResult } from '../../composables/useCardCostGating';
import { useTurnActions } from '../../composables/useTurnActions';
import type { SubmitMove } from './uiMoveName.types';

/**
 * HQ row — 6-cell visual rewrite per `DESIGN-BOARD-LAYOUT.md §7.1`
 * column order: `Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck`.
 * Per D-12903 the count gracefully extends to 7 cells when a 6-slot
 * scenario projects.
 *
 * Cost gating: heroes in HQ render disabled when
 * `economy.availableRecruit < hero.cost` per WP-128 economy projection.
 * Disabled-state tooltip precedence locked at EC-132 §3 (stage → resource
 * → structural).
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer that USES composables, so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — HQ row 6 cells
 * @see DESIGN-BOARD-LAYOUT.md §7.1 HQ row
 * @see EC-132 §2 HQ visual column order
 */
export default defineComponent({
  name: 'HQRow',
  props: {
    hq: {
      type: Object as PropType<UIHQState>,
      required: true,
    },
    decks: {
      type: Object as PropType<UIDecksState>,
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
    function buildCells(): HqCell[] {
      return useHqRow(props.hq, props.decks).cells;
    }

    function gateForCell(cell: HqCell): GatingResult {
      // why: disabled-state tooltip precedence per EC-132 §3 — stage →
      // resource → structural. When display payload is missing (engine
      // hasn't projected slotDisplay yet), we fall back to stage-only
      // gating so the surface remains usable.
      if (cell.kind !== 'hero' || cell.cardId === null) {
        return { allowed: true, reason: null };
      }
      const stage = useTurnActions(props.currentStage).canRecruitHero();
      if (!stage.allowed) {
        return stage;
      }
      if (cell.display === null) {
        return stage;
      }
      return useCardCostGating(props.economy).canRecruit(cell.display);
    }

    function onRecruit(hqIndex: number): void {
      props.submitMove('recruitHero', { hqIndex });
    }

    return { buildCells, gateForCell, onRecruit };
  },
});
</script>

<template>
  <section
    class="hq-row"
    data-testid="play-hq-row"
    aria-label="HQ"
  >
    <ol class="hq-slots">
      <!-- why: 6-cell visual layout locked per EC-132 §2:
           Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck.
           Per D-12903, 6-slot scenarios extend gracefully to 7 cells. -->
      <li
        v-for="(cell, position) in buildCells()"
        :key="position"
        class="hq-slot"
      >
        <template v-if="cell.kind === 'hero'">
          <button
            v-if="cell.cardId !== null"
            type="button"
            data-testid="play-hq-hero"
            :data-hq-index="cell.hqIndex"
            :data-card-id="cell.cardId"
            :disabled="!gateForCell(cell).allowed"
            :aria-disabled="!gateForCell(cell).allowed ? 'true' : undefined"
            :title="gateForCell(cell).reason ?? undefined"
            @click="onRecruit(cell.hqIndex)"
          >
            <!-- why: disabled-state tooltip precedence locked at EC-132 §3
                 (stage → resource → structural). Reason text is bound from
                 useTurnActions / useCardCostGating. Cost gate consumes
                 WP-128 economy.availableRecruit + UICardDisplay.cost. -->
            <span class="hq-slot__name">
              {{ cell.display !== null ? cell.display.name : cell.cardId }}
            </span>
            <span
              v-if="cell.display !== null && cell.display.cost !== null"
              class="hq-slot__cost"
            >
              ${{ cell.display.cost }} rec
            </span>
          </button>
          <div
            v-else
            class="hq-slot-empty"
            data-testid="play-hq-empty"
            :data-hq-index="cell.hqIndex"
          >
            Empty slot
          </div>
        </template>
        <template v-else>
          <div class="hq-slot-deck" data-testid="play-hq-hero-deck">
            <header>Hero Deck</header>
            <p>[{{ cell.count }}]</p>
          </div>
        </template>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.hq-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.hq-slots {
  display: flex;
  gap: 0.25rem;
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-x: auto;
}

.hq-slot {
  min-width: 6rem;
}

.hq-slot-empty {
  padding: 0.5rem 0.75rem;
  border: 1px dashed var(--color-foreground, #666);
  opacity: 0.5;
}

.hq-slot-deck {
  padding: 0.5rem;
  border: 1px solid var(--color-foreground, #999);
  font-variant-numeric: tabular-nums;
}

.hq-slot-deck p,
.hq-slot__cost {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.hq-slot__name {
  display: block;
  font-weight: 600;
}
</style>
