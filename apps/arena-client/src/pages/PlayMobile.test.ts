import '../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { UIState } from '@legendary-arena/game-engine';
import PlayMobile from './PlayMobile.vue';
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
        handCount: 0,
        discardCount: 6,
        inPlayCount: 0,
        victoryCount: 0,
        woundCount: 0,
        handCards: [],
        handDisplay: [],
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
      twistCount: 0,
      twistPile: [],
    },
    economy: {
      attack: 0,
      recruit: 0,
      availableAttack: 0,
      availableRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
    log: [],
    progress: { bystandersRescued: 0, escapedVillains: 0 },
    decks: { villainDeckCount: 14, heroDeckCount: 42 },
    piles: {
      bystandersCount: 12,
      woundsCount: 24,
      horrorsCount: 0,
      officersCount: 22,
      sidekicksCount: 13,
    },
    koPile: { count: 0, topCard: null, cards: [] },
    notableEvents: [],
    villainAttachedHeroes: {},
  };
}

describe('PlayMobile (WP-129)', () => {
  test('renders empty-match placeholder when snapshot is null', () => {
    setActivePinia(createPinia());
    const wrapper = mount(PlayMobile, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-empty-match"]').exists(), true);
  });

  test('renders the sticky top + sticky bottom bands during play phase', () => {
    setActivePinia(createPinia());
    const store = useUiStateStore();
    store.setSnapshot(snapshot());
    const wrapper = mount(PlayMobile, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-mobile-sticky-top"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-mobile-sticky-bottom"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-top-hud-bar"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-turn-action-bar"]').exists(), true);
  });

  test('renders all eight wireframe zones present in §3.2', () => {
    setActivePinia(createPinia());
    const store = useUiStateStore();
    store.setSnapshot(snapshot());
    const wrapper = mount(PlayMobile, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-mastermind-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-scheme-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-city-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-hq-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-shared-decks"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-ko-pile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-economy-bar"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-hand-row"]').exists(), true);
  });

  test('WP-243: with both pending choices for the viewer, the KO prompt renders ABOVE the hero prompt, both ABOVE TurnActionBar', () => {
    setActivePinia(createPinia());
    const frame = snapshot();
    frame.game.currentStage = 'cleanup';
    frame.pendingHeroChoice = {
      choiceType: 'discard-or-return',
      cardId: 'rev-card',
      playerID: 'alice',
      display: { extId: 'rev-card', name: 'Revealed Card', imageUrl: '', cost: 2 },
    };
    frame.pendingKoHeroChoice = {
      choiceType: 'ko-hero',
      playerID: 'alice',
      remaining: 1,
      eligible: [
        { zone: 'hand', cardId: 'ko-a', display: { extId: 'ko-a', name: 'KO A', imageUrl: '', cost: 1 } },
        { zone: 'discard', cardId: 'ko-b', display: { extId: 'ko-b', name: 'KO B', imageUrl: '', cost: 2 } },
      ],
    };
    const store = useUiStateStore();
    store.setSnapshot(frame);
    const wrapper = mount(PlayMobile, { props: { submitMove: noopSubmitMove } });

    const html = wrapper.html();
    const koIndex = html.indexOf('pending-ko-hero-choice-prompt');
    const heroIndex = html.indexOf('pending-hero-choice-prompt');
    const barIndex = html.indexOf('play-turn-action-bar');

    assert.ok(koIndex >= 0, 'KO prompt renders for the chooser');
    assert.ok(heroIndex >= 0, 'hero prompt renders for the chooser');
    assert.ok(barIndex >= 0, 'turn-action bar renders');
    assert.ok(koIndex < heroIndex, 'KO prompt is above the hero prompt in DOM order');
    assert.ok(heroIndex < barIndex, 'both prompts are above the TurnActionBar in DOM order');
  });
});
