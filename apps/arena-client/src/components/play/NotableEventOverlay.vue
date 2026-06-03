<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import type { UICardDisplay } from '@legendary-arena/game-engine';
import {
  eventCardId,
  type NotableGameEvent,
} from '../../composables/useNotableEventStream';

/**
 * Lookup contract for resolving an event's card ext_id to its display
 * name. Keyed by ext_id, values are the engine-projected UICardDisplay.
 *
 * The spec wording in WP-201 §Scope (In) references
 * `UIState.cardDisplayData` — that field does not exist as a top-level
 * UIState projection (per pre-flight inspection of `uiState.types.ts`
 * on `main @ 52d64e2`; `cardDisplayData` lives on G and surfaces only
 * through per-zone embedded `display` fields). The consumer
 * (PlayDesktop) constructs this map from the snapshot's visible zones
 * and passes it in. When a card is not in the map (e.g., a freshly-
 * defeated villain that has already moved to the active player's
 * victory pile), the overlay falls back to the raw ext_id per the
 * locked fallback rule.
 */
export type NotableEventCardLookup = Readonly<Record<string, UICardDisplay>>;

/**
 * Descriptive notable-event overlay surfacing the engine-composed
 * `NotableGameEvent` stream from WP-200 over four locked event types:
 * Fight, Ambush, Scheme Twist, Master Strike. Renders a chip + card name
 * + engine-composed narrative + applied-effect badges layout.
 *
 * Per D-20002 the narrative is rendered verbatim (engine-authoritative
 * composition). Per D-20105 the UI does not interpret event semantics —
 * the only permitted branching is per-event-type styling (border + chip
 * label) and presence/absence of the `appliedEffects` badge row.
 *
 * Per D-20104 the overlay reaches the discriminator-appropriate ext_id
 * solely through the `eventCardId(event)` pure helper exported from the
 * composable module — no inline per-variant ternaries over the per-variant
 * id fields. Grep gate in EC-228 enforces this contract literally.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this component is a tested
 * non-leaf composer (Pinia-adjacent via the consuming page, has computed
 * state, renders child markup that needs binding via _ctx) so it MUST
 * use `defineComponent({ setup() { return {...} } })` per D-6512.
 */

// why: locked humanised effect-label map (D-20102). Total over
// `VILLAIN_EFFECT_KEYWORDS` as locked at WP-185 ship-time (5 entries);
// adding a sixth tracks with the engine's keyword union. Unknown keywords
// render the raw keyword string verbatim via the fallback path —
// silent-skip is forbidden because it would hide real data when the
// engine expands its vocabulary ahead of an arena-client bundle.
const EFFECT_LABELS: Readonly<Record<string, string>> = {
  gainWoundEachPlayer: 'Each player gains a Wound',
  gainWoundCurrentPlayer: 'You gain a Wound',
  koHeroCurrentPlayer: 'KO a Hero',
  heroDeckTopToEscape: 'Hero deck top escapes',
  captureBystander: 'Captures a Bystander',
};

// why: locked chip labels per WP-201 §Scope (In) — four entries matching
// `NotableGameEventType` exactly. The labels are user-facing English
// (engine-side type names use camelCase suffixes).
const CHIP_LABELS: Readonly<Record<string, string>> = {
  fightResolved: 'Fought',
  ambushResolved: 'Ambush!',
  schemeTwistResolved: 'Scheme Twist!',
  mastermindStrikeResolved: 'Master Strike!',
};

function chipLabel(type: string): string {
  return CHIP_LABELS[type] ?? type;
}

function effectLabel(keyword: string): string {
  // why: totality fallback (D-20102) — raw keyword verbatim when the
  // engine's `VillainEffectKeyword` union has expanded past the
  // arena-client's locked map. Silent-skip is forbidden; the raw string
  // surfaces the data so operators see "something new happened" rather
  // than a swallowed effect.
  return EFFECT_LABELS[keyword] ?? keyword;
}

export default defineComponent({
  name: 'NotableEventOverlay',
  props: {
    event: {
      type: Object as PropType<NotableGameEvent | null>,
      default: null,
    },
    cardDisplayData: {
      type: Object as PropType<NotableEventCardLookup>,
      default: undefined,
    },
    durationMs: {
      type: Number,
      default: 2500,
    },
  },
  emits: ['dismiss'],
  setup(props) {
    const cardId = computed<string | null>(() => {
      if (props.event === null) return null;
      return eventCardId(props.event);
    });

    const cardName = computed<string | null>(() => {
      const id = cardId.value;
      if (id === null) return null;
      // why: defensive fallback to the raw ext_id when display data is
      // absent. The engine emits events even when a card's display entry
      // is missing (D-20002 — narrative composition is robust to that
      // case); the overlay mirrors the same defensive posture rather than
      // throwing or hiding the event.
      const entry = props.cardDisplayData?.[id];
      if (entry !== undefined && typeof entry.name === 'string') {
        return entry.name;
      }
      return id;
    });

    const chipText = computed<string>(() => {
      if (props.event === null) return '';
      return chipLabel(props.event.type);
    });

    // why: D-20105 — branch SOLELY on per-event-type styling (chip + border
    // + appliedEffects presence). NEVER on event semantics. The Fight/Ambush
    // discriminator check below narrows the union to the two variants that
    // carry `appliedEffects` (D-20005 — Scheme Twist + Master Strike do not).
    const appliedEffects = computed<readonly string[]>(() => {
      const event = props.event;
      if (event === null) return [];
      if (event.type !== 'fightResolved' && event.type !== 'ambushResolved') {
        return [];
      }
      return event.appliedEffects;
    });

    const showEffectBadges = computed<boolean>(
      () => appliedEffects.value.length > 0,
    );

    const rootStyle = computed<Record<string, string>>(() => ({
      '--notable-event-overlay-duration-ms': `${props.durationMs}ms`,
    }));

    return {
      cardName,
      chipText,
      showEffectBadges,
      appliedEffects,
      rootStyle,
      effectLabel,
    };
  },
});
</script>

<template>
  <Transition name="notable-event-fade">
    <div
      v-if="event !== null"
      class="notable-event-overlay"
      data-testid="play-notable-event-overlay"
      :data-event-type="event.type"
      :style="rootStyle"
      aria-live="polite"
      role="status"
      aria-atomic="true"
    >
      <span class="notable-event-overlay__chip">{{ chipText }}</span>
      <p class="notable-event-overlay__card-name">{{ cardName }}</p>
      <p class="notable-event-overlay__narrative">{{ event.narrative }}</p>
      <ul
        v-if="showEffectBadges"
        class="notable-event-overlay__effects"
        data-testid="play-notable-event-overlay-effects"
      >
        <li
          v-for="(keyword, index) in appliedEffects"
          :key="`${keyword}-${index}`"
          class="notable-event-overlay__effect-badge"
          :data-effect-keyword="keyword"
        >
          {{ effectLabel(keyword) }}
        </li>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
.notable-event-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  text-align: center;
  pointer-events: none;
  background: var(--color-notable-event-bg, rgba(0, 0, 0, 0.85));
  color: var(--color-notable-event-fg, #fff);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  max-width: 28rem;
}

.notable-event-overlay[data-event-type="fightResolved"],
.notable-event-overlay[data-event-type="ambushResolved"] {
  border-color: var(--color-villain, #7b1fa2);
}

.notable-event-overlay[data-event-type="schemeTwistResolved"] {
  border-color: var(--color-scheme-twist, #e6a817);
}

.notable-event-overlay[data-event-type="mastermindStrikeResolved"] {
  border-color: var(--color-master-strike, #c62828);
}

.notable-event-overlay__chip {
  display: inline-block;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.12);
}

.notable-event-overlay__card-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.notable-event-overlay__narrative {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.35;
  opacity: 0.92;
}

.notable-event-overlay__effects {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  justify-content: center;
}

.notable-event-overlay__effect-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.16);
}

.notable-event-fade-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.notable-event-fade-leave-active {
  transition: opacity 0.4s ease-in;
}

.notable-event-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9);
}

.notable-event-fade-leave-to {
  opacity: 0;
}
</style>
