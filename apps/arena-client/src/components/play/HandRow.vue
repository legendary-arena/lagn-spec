<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UICardDisplay } from '@legendary-arena/game-engine';
import { useTurnActions } from '../../composables/useTurnActions';
import CardTile from './CardTile.vue';
import type { SubmitMove } from './uiMoveName.types';

/**
 * Active player's hand row — renders one button per CardExtId in
 * `players[ownIndex].handCards`. WP-129 extends the WP-100 scaffold with
 * `handDisplay` integration (display name + image lookup) and binds the
 * stage-gating reason from {@link useTurnActions} per EC-132 §3 disabled-
 * state tooltip precedence.
 *
 * Cost gating does NOT apply to playCard — every hand card may be played
 * during the main step regardless of economy state. Only stage gating
 * applies here.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this is a tested non-leaf
 * composer that USES a composable, so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — Click-to-play handCards
 * @see EC-132 §2 move table — Hand card → playCard at play.main
 * @see EC-132 §3 disabled-state tooltip precedence
 */
export default defineComponent({
  name: 'HandRow',
  components: { CardTile },
  props: {
    handCards: {
      type: Array as PropType<readonly string[]>,
      required: true,
    },
    /**
     * Parallel display payload for `handCards`; populated by WP-128's
     * `players[ownIndex].handDisplay`. Length must match `handCards`
     * exactly when present. Undefined when redacted (other audiences) —
     * but for the active-player surface the field is always present.
     */
    handDisplay: {
      type: Array as PropType<readonly UICardDisplay[] | undefined>,
      required: false,
      default: undefined,
    },
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
  },
  setup(props) {
    function onPlay(cardId: string): void {
      props.submitMove('playCard', { cardId });
    }

    function buttonReason(): string | null {
      // why: per EC-132 §3 disabled-state tooltip precedence — stage →
      // resource → structural. playCard has no resource cost (any hand
      // card may be played); only the stage gate applies.
      const gate = useTurnActions(props.currentStage, props.isViewerTurn).canPlayCard();
      return gate.allowed ? null : gate.reason;
    }

    function buttonDisabled(): boolean {
      return !useTurnActions(props.currentStage, props.isViewerTurn).canPlayCard().allowed;
    }

    function humanizeCardId(cardId: string): string {
      // why: produce a readable label from a CardExtId when the engine's
      // cardDisplayData lookup misses (returns the WP-111
      // UNKNOWN_DISPLAY_PLACEHOLDER with name '<unknown>'). The starter
      // cards `'starting-shield-agent'` / `'starting-shield-trooper'`
      // are engine-synthetic and not in the registry, so
      // buildCardDisplayData does not populate entries for them — a
      // future engine WP will close the gap. This fallback is
      // formatting-only (replace dashes with spaces); no engine
      // knowledge of canonical card names lives client-side.
      return cardId.replace(/-/g, ' ');
    }

    function displayName(cardId: string, index: number): string {
      if (props.handDisplay !== undefined && index < props.handDisplay.length) {
        const candidate = props.handDisplay[index]!.name;
        // why: detect the WP-111 UNKNOWN_DISPLAY_PLACEHOLDER shape and
        // fall back to a humanized cardId. The placeholder ships with
        // name '<unknown>' and imageUrl '' (per
        // packages/game-engine/src/ui/uiState.build.ts:73-78). Either
        // signal indicates the engine has no display data for this
        // ext_id; the cardId itself is informative enough as a fallback
        // until the engine gap is closed.
        if (candidate !== '<unknown>') {
          return candidate;
        }
      }
      return humanizeCardId(cardId);
    }

    function displayForIndex(index: number): UICardDisplay | null {
      if (props.handDisplay !== undefined && index < props.handDisplay.length) {
        const entry = props.handDisplay[index]!;
        if (entry.name !== '<unknown>') {
          return entry;
        }
      }
      return null;
    }

    function resolveDisplay(cardId: string, index: number): UICardDisplay {
      const existing = displayForIndex(index);
      if (existing !== null) {
        return existing;
      }
      return {
        extId: cardId,
        name: humanizeCardId(cardId),
        imageUrl: '',
        cost: null,
      };
    }

    return { onPlay, buttonReason, buttonDisabled, displayName, displayForIndex, resolveDisplay };
  },
});
</script>

<template>
  <section
    class="hand-row"
    data-testid="play-hand-row"
    aria-label="Hand"
  >
    <p
      v-if="handCards.length === 0"
      class="hand-empty"
      data-testid="play-hand-empty"
    >
      Hand is empty.
    </p>
    <ul v-else class="hand-cards">
      <li
        v-for="(cardId, index) in handCards"
        :key="`${cardId}-${index}`"
        class="hand-card"
      >
        <button
          type="button"
          data-testid="play-hand-card"
          :data-card-id="cardId"
          :disabled="buttonDisabled()"
          :aria-disabled="buttonDisabled() ? 'true' : undefined"
          :title="buttonReason() ?? undefined"
          @click="onPlay(cardId)"
        >
          <!-- why: disabled-state tooltip precedence locked at EC-132 §3
               (stage → resource → structural). The reason text is bound
               from useTurnActions().canPlayCard() rather than composed
               ad-hoc. -->
          <CardTile
            :display="resolveDisplay(cardId, index)"
            size="md"
            :interactive="!buttonDisabled()"
            :show-label="true"
          />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.hand-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.hand-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.hand-card button {
  padding: 0.5rem 0.75rem;
  font-variant-numeric: tabular-nums;
}
</style>
