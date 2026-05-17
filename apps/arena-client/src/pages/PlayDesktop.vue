<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import { storeToRefs } from 'pinia';
import type { UIPlayerState } from '@legendary-arena/game-engine';
import { useUiStateStore } from '../stores/uiState';
import { useRevealDetector } from '../composables/useRevealDetector';

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
import RevealOverlay from '../components/play/RevealOverlay.vue';
import type { SubmitMove } from '../components/play/uiMoveName.types';

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
 * @see DESIGN-BOARD-LAYOUT.md §3.1
 */
export default defineComponent({
  name: 'PlayDesktop',
  components: {
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
    RevealOverlay,
  },
  props: {
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
  },
  setup() {
    const store = useUiStateStore();
    const { snapshot } = storeToRefs(store);
    const { currentReveal, dismiss: dismissReveal } = useRevealDetector(snapshot);

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

    return { snapshot, viewer, opponents, isLobbyPhase, isPlayPhase, currentReveal, dismissReveal };
  },
});
</script>

<template>
  <div class="play-desktop" data-testid="play-desktop">
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
      <LobbyControls v-if="isLobbyPhase" :submit-move="submitMove" />
      <template v-if="isPlayPhase && viewer !== null">
        <RevealOverlay
          :reveal="currentReveal"
          :duration-ms="2000"
          @dismiss="dismissReveal"
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
            <MasterStrikePile :pile="snapshot.mastermind.strikePile" />
          </div>
          <div class="play-desktop__scheme-zone">
            <SchemeTile :scheme="snapshot.scheme" :twist-threshold="8" />
            <SchemeTwistPile :pile="snapshot.scheme.twistPile" />
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
        <KOPile :ko-pile="snapshot.koPile" />
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
        <!-- why: D-12908 — pre-plan affordance slot reserved for WP-059;
             this page declares the slot only. WP-059 owns the integration
             shape. -->
        <slot name="preplan-affordance" />
      </template>
    </template>
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
