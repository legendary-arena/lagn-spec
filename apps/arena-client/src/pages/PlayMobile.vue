<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import { storeToRefs } from 'pinia';
import type { UIPlayerState } from '@legendary-arena/game-engine';
import { useUiStateStore } from '../stores/uiState';

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
import type { SubmitMove } from '../components/play/uiMoveName.types';

/**
 * Mobile portrait page (375×667 to 414×896) per
 * `DESIGN-BOARD-LAYOUT.md §3.2`. Vertically stacked. Sticky top HUD +
 * sticky bottom turn-actions panel; the middle scrolls vertically; wide
 * rows (city, HQ, hand) scroll horizontally within their zone.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this page is a tested
 * non-leaf composer that uses the Pinia store, has computed state, and
 * imports children whose templates need binding via _ctx — so it MUST
 * use `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46
 * / D-6512.
 *
 * @see WP-129 §Acceptance Criteria — mobile portrait viewport
 * @see DESIGN-BOARD-LAYOUT.md §3.2
 */
export default defineComponent({
  name: 'PlayMobile',
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

    return { snapshot, viewer, opponents, isLobbyPhase, isPlayPhase };
  },
});
</script>

<template>
  <div class="play-mobile" data-testid="play-mobile">
    <p
      v-if="snapshot === null"
      class="play-empty-match"
      data-testid="play-empty-match"
    >
      No match is currently loaded.
    </p>
    <template v-else>
      <header class="play-mobile__sticky-top" data-testid="play-mobile-sticky-top">
        <TopHudBar
          :snapshot="snapshot"
          :mastermind-tactics-total="4"
          :scheme-twist-threshold="8"
        />
      </header>
      <LobbyControls v-if="isLobbyPhase" :submit-move="submitMove" />
      <main v-if="isPlayPhase && viewer !== null" class="play-mobile__scroll">
        <section class="play-mobile__band">
          <MastermindTile
            :mastermind="snapshot.mastermind"
            :current-stage="snapshot.game.currentStage"
            :economy="snapshot.economy"
            :submit-move="submitMove"
          />
          <MasterStrikePile :pile="snapshot.mastermind.strikePile" />
        </section>
        <section class="play-mobile__band">
          <SchemeTile :scheme="snapshot.scheme" :twist-threshold="8" />
          <SchemeTwistPile :pile="snapshot.scheme.twistPile" />
        </section>
        <section class="play-mobile__band play-mobile__band--scroll-x">
          <CityRow
            :city="snapshot.city"
            :decks="snapshot.decks"
            :current-stage="snapshot.game.currentStage"
            :economy="snapshot.economy"
            :submit-move="submitMove"
          />
        </section>
        <section class="play-mobile__band play-mobile__band--scroll-x">
          <HQRow
            :hq="snapshot.hq"
            :decks="snapshot.decks"
            :current-stage="snapshot.game.currentStage"
            :economy="snapshot.economy"
            :submit-move="submitMove"
          />
        </section>
        <SharedDecks :piles="snapshot.piles" />
        <KOPile :ko-pile="snapshot.koPile" />
        <section
          class="play-mobile__band"
          data-testid="play-mobile-opponents"
        >
          <OpponentPanel
            v-for="opponent in opponents"
            :key="opponent.playerId"
            :player="opponent"
          />
        </section>
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
        <section class="play-mobile__band play-mobile__band--scroll-x">
          <HandRow
            :hand-cards="viewer.handCards ?? []"
            :hand-display="viewer.handDisplay"
            :current-stage="snapshot.game.currentStage"
            :submit-move="submitMove"
          />
        </section>
      </main>
      <footer
        v-if="isPlayPhase"
        class="play-mobile__sticky-bottom"
        data-testid="play-mobile-sticky-bottom"
      >
        <TurnActionBar
          :current-stage="snapshot.game.currentStage"
          :submit-move="submitMove"
        />
        <!-- why: D-12908 — pre-plan affordance slot reserved for WP-059
             at the bottom-edge zone. WP-059 owns the integration shape. -->
        <slot name="preplan-affordance" />
      </footer>
    </template>
  </div>
</template>

<style scoped>
.play-mobile {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.play-mobile__sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-background, #fff);
}

.play-mobile__sticky-bottom {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: var(--color-background, #fff);
  border-top: 1px solid var(--color-foreground, #999);
}

.play-mobile__scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
}

.play-mobile__band {
  display: flex;
  gap: 0.5rem;
}

.play-mobile__band--scroll-x {
  overflow-x: auto;
}

.play-empty-match {
  padding: 0.75rem 1rem;
  border: 1px dashed var(--color-foreground, #666);
}
</style>
