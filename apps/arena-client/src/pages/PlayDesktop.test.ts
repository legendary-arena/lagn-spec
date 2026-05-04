import '../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { UIState } from '@legendary-arena/game-engine';
import PlayDesktop from './PlayDesktop.vue';
import { useUiStateStore } from '../stores/uiState';
import type { SubmitMove } from '../components/play/uiMoveName.types';

const noopSubmitMove: SubmitMove = () => undefined;

function snapshot(): UIState {
  return {
    game: {
      phase: 'play',
      turn: 4,
      activePlayerId: 'alice',
      currentStage: 'main',
    },
    players: [
      {
        playerId: 'alice',
        deckCount: 18,
        handCount: 5,
        discardCount: 6,
        inPlayCount: 0,
        victoryCount: 4,
        woundCount: 0,
        handCards: ['shield-officer', 'shield-officer', 'iron-man-tech'],
        handDisplay: [
          {
            extId: 'shield-officer',
            name: 'S.H.I.E.L.D. Officer',
            imageUrl: 'https://images.barefootbetters.com/shield-officer.png',
            cost: 1,
          },
          {
            extId: 'shield-officer',
            name: 'S.H.I.E.L.D. Officer',
            imageUrl: 'https://images.barefootbetters.com/shield-officer.png',
            cost: 1,
          },
          {
            extId: 'iron-man-tech',
            name: 'Iron Man Tech',
            imageUrl: 'https://images.barefootbetters.com/iron-man-tech.png',
            cost: 4,
          },
        ],
      },
      {
        playerId: 'bob',
        deckCount: 14,
        handCount: 5,
        discardCount: 8,
        inPlayCount: 0,
        victoryCount: 4,
        woundCount: 0,
      },
      {
        playerId: 'cara',
        deckCount: 11,
        handCount: 6,
        discardCount: 12,
        inPlayCount: 2,
        victoryCount: 3,
        woundCount: 0,
      },
    ],
    city: { spaces: [null, null, null, null, null], escapedPile: [] },
    hq: { slots: [null, null, null, null, null] },
    mastermind: {
      id: 'core/loki',
      tacticsRemaining: 3,
      tacticsDefeated: 1,
      display: {
        extId: 'mastermind-loki',
        name: 'Loki',
        imageUrl: 'https://images.barefootbetters.com/loki.png',
        cost: 6,
      },
      attachedBystanders: [],
      strikePile: [],
    },
    scheme: {
      id: 'core/capture-five-bystanders',
      twistCount: 2,
      twistPile: [],
    },
    economy: {
      attack: 3,
      recruit: 2,
      availableAttack: 3,
      availableRecruit: 2,
      piercing: 0,
      woundsDrawn: 0,
    },
    log: [],
    progress: { bystandersRescued: 1, escapedVillains: 3 },
    decks: { villainDeckCount: 14, heroDeckCount: 42 },
    piles: {
      bystandersCount: 12,
      woundsCount: 24,
      horrorsCount: 0,
      officersCount: 22,
      sidekicksCount: 13,
    },
    koPile: { count: 0, topCard: null, cards: [] },
  };
}

describe('PlayDesktop (WP-129)', () => {
  test('renders empty-match placeholder when snapshot is null', () => {
    setActivePinia(createPinia());
    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-empty-match"]').exists(), true);
  });

  test('renders the full board when phase is play and viewer is identified', () => {
    setActivePinia(createPinia());
    const store = useUiStateStore();
    store.setSnapshot(snapshot());
    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-top-hud-bar"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-mastermind-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-scheme-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-city-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-hq-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-shared-decks"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-ko-pile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-hand-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-economy-bar"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-your-deck-discard"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-your-victory-pile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-turn-action-bar"]').exists(), true);
  });

  test('renders one OpponentPanel per opponent (not the viewer)', () => {
    setActivePinia(createPinia());
    const store = useUiStateStore();
    store.setSnapshot(snapshot());
    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove },
    });
    const panels = wrapper.findAll('[data-testid="play-opponent-panel"]');
    assert.equal(panels.length, 2);
    const ids = panels.map((p) => p.attributes('data-player-id'));
    assert.deepEqual(ids.sort(), ['bob', 'cara']);
  });
});
