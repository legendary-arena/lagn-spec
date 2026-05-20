import '../testing/jsdom-setup';

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
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

  // why: a spectator / rewound-autoplay frame is audience-filtered (D-16303),
  // so NO player exposes handCards and `viewer` resolves to null. The shared
  // board MUST still render (the rewind blank-screen bug); only the personal
  // "your" zone is hidden.
  test('renders the shared board (no personal zone) for a viewer-less spectator frame', () => {
    setActivePinia(createPinia());
    const spectatorFrame = snapshot();
    for (const player of spectatorFrame.players) {
      delete player.handCards;
      delete player.handDisplay;
    }
    const store = useUiStateStore();
    store.setSnapshot(spectatorFrame);
    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove },
    });

    // Shared board renders.
    assert.equal(wrapper.find('[data-testid="play-top-hud-bar"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-mastermind-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-scheme-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-city-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-hq-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-shared-decks"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-ko-pile"]').exists(), true);
    // All three players appear as opponent panels (no viewer to exclude).
    assert.equal(wrapper.findAll('[data-testid="play-opponent-panel"]').length, 3);

    // Personal "your" zone is hidden (no viewer).
    assert.equal(wrapper.find('[data-testid="play-hand-row"]').exists(), false);
    assert.equal(wrapper.find('[data-testid="play-turn-action-bar"]').exists(), false);
    assert.equal(wrapper.find('[data-testid="play-your-deck-discard"]').exists(), false);
    assert.equal(wrapper.find('[data-testid="play-your-victory-pile"]').exists(), false);
  });
});

describe('PlayDesktop autoplay-bar gating (WP-164)', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  afterEach(() => {
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
      originalFetch = undefined;
    }
  });

  test('absent matchId: getStatus is not called and the bar is not rendered', async () => {
    setActivePinia(createPinia());
    let fetchCalls = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;

    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove, matchId: '' },
    });
    await flushPromises();

    assert.equal(fetchCalls, 0);
    assert.equal(
      wrapper.find('[data-testid="autoplay-controls"]').exists(),
      false,
    );
  });

  test('present matchId + status 200: the bar renders (autoplay match)', async () => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          paused: true,
          historyLength: 5,
          cursor: 4,
          mode: 'paused',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof globalThis.fetch;

    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove, matchId: 'match-auto' },
    });
    await flushPromises();

    assert.equal(
      wrapper.find('[data-testid="autoplay-controls"]').exists(),
      true,
    );
  });

  // why: the persistent-404 path (null → retry → null ⇒ bar hidden) and the
  // transient-404 recovery (null → retry → 200 ⇒ bar shown) are covered
  // deterministically in autoplayPlayback.test.ts against resolveAutoplayGating
  // with an injected (timer-free) retry delay; mounting the page for those
  // would require a real STATUS_RETRY_DELAY_MS timer (flaky / slow).
});
