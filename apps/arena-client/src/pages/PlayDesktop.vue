<script lang="ts">
import { computed, defineComponent, onMounted, ref, type PropType } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  UICardDisplay,
  UIDisplayEntry,
  UIPlayerState,
} from '@legendary-arena/game-engine';
import { useUiStateStore } from '../stores/uiState';
import { useNotableEventStream } from '../composables/useNotableEventStream';
import type { NotableEventCardLookup } from '../components/play/NotableEventOverlay.vue';
import {
  getStatus,
  resolveAutoplayGating,
  STATUS_RETRY_DELAY_MS,
  type AutoplayControlResponse,
} from '../services/autoplayPlayback';

import AutoplayControls from '../components/AutoplayControls.vue';
import EndgameSummary from '../components/hud/EndgameSummary.vue';
import TopHudBar from '../components/play/TopHudBar.vue';
import OpponentPanel from '../components/play/OpponentPanel.vue';
import MastermindTile from '../components/play/MastermindTile.vue';
import MasterStrikePile from '../components/play/MasterStrikePile.vue';
import SchemeTile from '../components/play/SchemeTile.vue';
import SchemeTwistPile from '../components/play/SchemeTwistPile.vue';
import CityRow from '../components/play/CityRow.vue';
import HQRow from '../components/play/HQRow.vue';
import SharedDecks from '../components/play/SharedDecks.vue';
import KOPile from '../components/play/KOPile.vue';
import HandRow from '../components/play/HandRow.vue';
import EconomyBar from '../components/play/EconomyBar.vue';
import YourDeckDiscardZone from '../components/play/YourDeckDiscardZone.vue';
import YourVictoryPile from '../components/play/YourVictoryPile.vue';
import TurnActionBar from '../components/play/TurnActionBar.vue';
import LobbyControls from '../components/play/LobbyControls.vue';
import NotableEventOverlay from '../components/play/NotableEventOverlay.vue';
import PileBrowseModal from '../components/play/PileBrowseModal.vue';
import type { SubmitMove } from '../components/play/uiMoveName.types';

interface ActivePile {
  pileLabel: string;
  cards: readonly UIDisplayEntry[];
}

/**
 * Desktop landscape page (1280×800 to 1920×1080) per
 * `DESIGN-BOARD-LAYOUT.md §3.1`. Mounts the full component tree against
 * the WP-128-extended UIState. Per D-12901 the Mastermind sits top-left;
 * per D-12902 opponents sit on the top edge for 3-4 player counts (the
 * default for MVP).
 *
 * Per the EC-132 §2 SFC authoring whitelist: this page is a tested
 * non-leaf composer that uses the Pinia store, has computed state, and
 * imports children whose templates need binding via _ctx — so it MUST
 * use `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46
 * / D-6512.
 *
 * @see WP-129 §Acceptance Criteria — desktop viewport
 * @see WP-171 §Acceptance Criteria — Pile Browse Modal page wiring
 * @see DESIGN-BOARD-LAYOUT.md §3.1
 */
export default defineComponent({
  name: 'PlayDesktop',
  components: {
    AutoplayControls,
    EndgameSummary,
    TopHudBar,
    OpponentPanel,
    MastermindTile,
    MasterStrikePile,
    SchemeTile,
    SchemeTwistPile,
    CityRow,
    HQRow,
    SharedDecks,
    KOPile,
    HandRow,
    EconomyBar,
    YourDeckDiscardZone,
    YourVictoryPile,
    TurnActionBar,
    LobbyControls,
    NotableEventOverlay,
    PileBrowseModal,
  },
  props: {
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
    // why: matchId is prop-drilled App.vue → PlayViewport.vue → here (no store
    // carries it); it gates the autoplay status probe (D-16501). Defaults to ''
    // so non-live mounts (fixtures, tests) probe nothing and render no bar.
    matchId: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const store = useUiStateStore();
    const { snapshot } = storeToRefs(store);
    const { currentEvent: notableEvent, dismiss: dismissNotableEvent } =
      useNotableEventStream(snapshot);

    // why: the engine's `cardDisplayData` lives on G and is NOT projected as
    // a top-level UIState field (pre-flight inspection of `uiState.types.ts`
    // on `main @ 52d64e2`); it surfaces only through per-zone embedded
    // `display: UICardDisplay` entries. The overlay needs an ext_id → name
    // lookup for the notable-event card; this computed walks every visible
    // display-bearing projection in the snapshot and folds them into a
    // single keyed map. Cards that have already left every visible zone
    // (e.g., a defeated villain pre-rendered into the active player's
    // victory pile) still resolve through the same map. Cards that the
    // viewer cannot see fall back to the raw ext_id per the WP-201
    // §Scope (In) overlay fallback rule.
    const notableEventCardLookup = computed<NotableEventCardLookup>(() => {
      const result: Record<string, UICardDisplay> = {};
      const current = snapshot.value;
      if (current === null) return result;

      function store(extId: string | undefined, value: UICardDisplay | undefined): void {
        if (extId === undefined || value === undefined) return;
        if (result[extId] === undefined) result[extId] = value;
      }

      for (const spaceCard of current.city.spaces) {
        if (spaceCard !== null) store(spaceCard.extId, spaceCard.display);
      }
      for (const entry of current.city.escapedPile) {
        store(entry.extId, entry.display);
      }
      store(current.mastermind.display?.extId, current.mastermind.display);
      for (const entry of current.mastermind.attachedBystanders) {
        store(entry.extId, entry.display);
      }
      for (const entry of current.mastermind.strikePile) {
        store(entry.extId, entry.display);
      }
      if (current.scheme.display !== undefined) {
        store(current.scheme.display.extId, current.scheme.display);
      }
      for (const entry of current.scheme.twistPile) {
        store(entry.extId, entry.display);
      }
      const slotDisplay = current.hq.slotDisplay;
      if (slotDisplay !== undefined) {
        for (const slot of slotDisplay) {
          if (slot !== null) store(slot.extId, slot.display);
        }
      }
      for (const player of current.players) {
        const handDisplay = player.handDisplay;
        const handCards = player.handCards;
        if (handDisplay !== undefined && handCards !== undefined) {
          for (let index = 0; index < handDisplay.length; index += 1) {
            store(handCards[index], handDisplay[index]);
          }
        }
        const inPlayDisplay = player.inPlayDisplay;
        const inPlayCards = player.inPlayCards;
        if (inPlayDisplay !== undefined && inPlayCards !== undefined) {
          for (let index = 0; index < inPlayDisplay.length; index += 1) {
            store(inPlayCards[index], inPlayDisplay[index]);
          }
        }
        const discardTop = player.discardTopCard;
        if (discardTop !== null && discardTop !== undefined) {
          store(discardTop.extId, discardTop.display);
        }
        if (player.victoryCards !== undefined) {
          for (const entry of player.victoryCards) {
            store(entry.extId, entry.display);
          }
        }
      }
      for (const entry of current.koPile.cards) {
        store(entry.extId, entry.display);
      }
      const koTop = current.koPile.topCard;
      if (koTop !== null) store(koTop.extId, koTop.display);

      return result;
    });

    // why: the autoplay control bar renders ONLY when the WP-165 status probe
    // confirms an autoplay match (D-16501); a normal PvP match returns 404 and
    // leaves this null so the bar stays hidden.
    const autoplayStatus = ref<AutoplayControlResponse | null>(null);

    // why: WP-171 / EC-189 — single page-level modal-state ref mirrors the
    // `OpponentPanel.vue:30-43` precedent (local ref, no Pinia, no composable).
    // The discriminator is `null` (not an optional field) so the modal's
    // `isOpen` binding is a clean `activePile !== null` boolean check.
    const activePile = ref<ActivePile | null>(null);

    function onPileOpen(payload: ActivePile): void {
      activePile.value = payload;
    }

    function onPileClose(): void {
      activePile.value = null;
    }

    // why: game-over is engine truth, read PASSIVELY from the live snapshot and
    // passed to the control bar as a prop; never computed/inferred here.
    const isGameOver = computed<boolean>(
      () => snapshot.value?.gameOver !== undefined,
    );

    onMounted(() => {
      // why: bounded single retry — an initial 404 may be the WP-165
      // transient-init race (controller momentarily unregistered after
      // autoplay-create); one retry after STATUS_RETRY_DELAY_MS absorbs it, a
      // second null is final (no loop). A thrown non-404 fault is surfaced and
      // leaves the bar hidden — it is never read as "not an autoplay match".
      void (async () => {
        try {
          const resolved = await resolveAutoplayGating(
            props.matchId,
            getStatus,
            () =>
              new Promise<void>((resolve) => {
                setTimeout(resolve, STATUS_RETRY_DELAY_MS);
              }),
          );
          if (resolved !== null) {
            autoplayStatus.value = resolved;
          }
        } catch (statusError) {
          console.error('Autoplay status probe failed; bar stays hidden.', statusError);
        }
      })();
    });

    const viewer = computed<UIPlayerState | null>(() => {
      const current = snapshot.value;
      if (current === null) {
        return null;
      }
      for (const player of current.players) {
        if (player.handCards !== undefined) {
          return player;
        }
      }
      return null;
    });

    const opponents = computed<UIPlayerState[]>(() => {
      const current = snapshot.value;
      if (current === null) {
        return [];
      }
      const own = viewer.value;
      if (own === null) {
        return [...current.players];
      }
      return current.players.filter((player) => player.playerId !== own.playerId);
    });

    const isLobbyPhase = computed<boolean>(
      () => snapshot.value?.game.phase === 'lobby',
    );

    const isPlayPhase = computed<boolean>(
      () => snapshot.value?.game.phase === 'play',
    );

    // why: gameover transitions `phase` from 'play' → 'end' (or in some
    // boardgame.io v0.50 codepaths nulls it out), which would collapse the
    // shared board if we kept the outer template gated on `isPlayPhase`
    // alone — leaving an autoplay viewer stranded on TopHudBar with no way
    // to click the opponents' `Victory: N ▼` buttons to inspect final
    // piles. `boardVisible` extends the EC-183 spectator-frame fix to the
    // post-game frame: render the same shared board (mastermind, scheme,
    // city, HQ, shared decks, KO, opponent panels) so the final state is
    // inspectable. The personal `viewer !== null` gate inside still hides
    // the "your" zone for spectator / autoplay frames; this gate only
    // controls whether the board renders AT ALL.
    const boardVisible = computed<boolean>(
      () => isPlayPhase.value || isGameOver.value,
    );

    return {
      snapshot,
      viewer,
      opponents,
      isLobbyPhase,
      isPlayPhase,
      boardVisible,
      notableEvent,
      dismissNotableEvent,
      notableEventCardLookup,
      matchId: props.matchId,
      autoplayStatus,
      isGameOver,
      activePile,
      onPileOpen,
      onPileClose,
    };
  },
});
</script>

<template>
  <div class="play-desktop" data-testid="play-desktop">
    <!-- why: D-16501 — the bar mounts only after the getStatus probe confirms
         an autoplay match (autoplayStatus non-null); a normal PvP match never
         renders it. -->
    <AutoplayControls
      v-if="autoplayStatus !== null"
      :match-id="matchId"
      :initial-status="autoplayStatus"
      :is-game-over="isGameOver"
    />
    <p
      v-if="snapshot === null"
      class="play-empty-match"
      data-testid="play-empty-match"
    >
      No match is currently loaded. Wait for the server to push a frame, or
      return to the lobby.
    </p>
    <template v-else>
      <TopHudBar
        :snapshot="snapshot"
        :mastermind-tactics-total="4"
        :scheme-twist-threshold="8"
      />
      <EndgameSummary
        v-if="isGameOver && snapshot.gameOver"
        :game-over="snapshot.gameOver"
      />
      <LobbyControls v-if="isLobbyPhase" :submit-move="submitMove" />
      <!-- why: the shared board renders for the whole play phase regardless of
           viewer. A spectator or rewound-autoplay frame is audience-filtered
           (D-16303) and exposes no own hand, so `viewer` is null; gating the
           board on `viewer !== null` (the prior behavior) blanked the screen on
           rewind (WP-163/164, EC-183). Only the personal "your" zone below
           depends on a viewer.
           why: `boardVisible` extends the gate to include gameover so the
           final frame still renders the opponent panels (with the
           `Victory: N ▼` button) for post-match inspection — without this,
           a viewer who watched an autoplay match to completion lost the
           board the moment `phase` flipped to 'end' and had no way to read
           the final piles. -->
      <template v-if="boardVisible">
        <NotableEventOverlay
          :event="notableEvent"
          :card-display-data="notableEventCardLookup"
          :duration-ms="2500"
          @dismiss="dismissNotableEvent"
        />
        <section class="play-desktop__opponents" data-testid="play-desktop-opponents">
          <OpponentPanel
            v-for="opponent in opponents"
            :key="opponent.playerId"
            :player="opponent"
          />
        </section>
        <section class="play-desktop__top-row">
          <div class="play-desktop__mastermind-zone">
            <!-- why: D-12901 — Mastermind sits top-left of the board. -->
            <MastermindTile
              :mastermind="snapshot.mastermind"
              :current-stage="snapshot.game.currentStage"
              :economy="snapshot.economy"
              :submit-move="submitMove"
            />
            <MasterStrikePile
              :pile="snapshot.mastermind.strikePile"
              @open="onPileOpen"
            />
          </div>
          <div class="play-desktop__scheme-zone">
            <SchemeTile :scheme="snapshot.scheme" :twist-threshold="8" />
            <SchemeTwistPile
              :pile="snapshot.scheme.twistPile"
              @open="onPileOpen"
            />
          </div>
        </section>
        <CityRow
          :city="snapshot.city"
          :decks="snapshot.decks"
          :current-stage="snapshot.game.currentStage"
          :economy="snapshot.economy"
          :submit-move="submitMove"
        />
        <HQRow
          :hq="snapshot.hq"
          :decks="snapshot.decks"
          :current-stage="snapshot.game.currentStage"
          :economy="snapshot.economy"
          :submit-move="submitMove"
        />
        <SharedDecks :piles="snapshot.piles" />
        <KOPile :ko-pile="snapshot.koPile" @open="onPileOpen" />
        <!-- why: the personal zone (own hand / economy / deck / victory) and the
             turn-action bar require an identified viewer. They are hidden for a
             spectator or rewound-autoplay frame (viewer null) while the shared
             board above stays visible. -->
        <template v-if="viewer !== null">
          <section class="play-desktop__player-zone">
            <HandRow
              :hand-cards="viewer.handCards ?? []"
              :hand-display="viewer.handDisplay"
              :current-stage="snapshot.game.currentStage"
              :submit-move="submitMove"
            />
            <EconomyBar :economy="snapshot.economy" />
            <YourDeckDiscardZone
              :deck-count="viewer.deckCount"
              :discard-count="viewer.discardCount"
              :discard-top-card="viewer.discardTopCard"
            />
            <YourVictoryPile
              :victory-cards="viewer.victoryCards ?? []"
              :victory-vp="viewer.victoryVP ?? 0"
            />
          </section>
          <TurnActionBar
            :current-stage="snapshot.game.currentStage"
            :hand-count="viewer.handCount"
            :submit-move="submitMove"
          />
        </template>
        <!-- why: D-12908 — pre-plan affordance slot reserved for WP-059;
             this page declares the slot only. WP-059 owns the integration
             shape. -->
        <slot name="preplan-affordance" />
      </template>
    </template>
    <!-- why: WP-171 / EC-189 — exactly one pile-browse-modal instance per
         page; the page-level `activePile` ref discriminates which pile is
         currently open. The modal teleports under `document.body` so it
         escapes the sticky board zones; ESC keydown + backdrop click clear
         `activePile` via the page's `onPileClose` handler. -->
    <PileBrowseModal
      :is-open="activePile !== null"
      :pile-label="activePile?.pileLabel ?? ''"
      :cards="activePile?.cards ?? []"
      @close="onPileClose"
    />
  </div>
</template>

<style scoped>
.play-desktop {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
}

.play-desktop__opponents {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.play-desktop__top-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.play-desktop__mastermind-zone,
.play-desktop__scheme-zone {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-width: 18rem;
}

.play-desktop__player-zone {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-top: 1px solid var(--color-foreground, #999);
  padding-top: 0.5rem;
}

.play-empty-match {
  padding: 0.75rem 1rem;
  border: 1px dashed var(--color-foreground, #666);
}
</style>
