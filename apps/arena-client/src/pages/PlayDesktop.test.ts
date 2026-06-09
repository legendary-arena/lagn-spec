import '../testing/jsdom-setup';

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { UIState } from '@legendary-arena/game-engine';
import PlayDesktop from './PlayDesktop.vue';
import { useUiStateStore } from '../stores/uiState';
import type { SubmitMove } from '../components/play/uiMoveName.types';
import type { NotableGameEvent } from '../composables/useNotableEventStream';

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
    notableEvents: [],
    villainAttachedHeroes: {},
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

  // why: regression guard for the autoplay post-game blank-board bug — when
  // the engine flips `phase` to 'end' and sets `gameOver`, the shared board
  // (especially the opponent panels with the `Victory: N ▼` buttons) MUST
  // still render so a viewer who watched a bot match through to completion
  // can read the final piles. Mirrors the EC-183 spectator-frame contract
  // but for the gameover frame.
  test('renders the shared board for a gameover frame (phase=end with gameOver set)', () => {
    setActivePinia(createPinia());
    const endgameFrame = snapshot();
    endgameFrame.game.phase = 'end';
    // Autoplay viewer is a spectator — strip handCards from every player so
    // `viewer` resolves to null (matches the production audience-filter posture).
    for (const player of endgameFrame.players) {
      delete player.handCards;
      delete player.handDisplay;
    }
    endgameFrame.gameOver = {
      outcome: 'heroes-win',
      reason: 'Mastermind defeated.',
      scores: {
        players: [
          {
            playerId: 'alice',
            villainVP: 6,
            henchmanVP: 0,
            bystanderVP: 2,
            tacticVP: 5,
            woundVP: 0,
            totalVP: 13,
          },
        ],
        winner: 'alice',
      },
    };
    const store = useUiStateStore();
    store.setSnapshot(endgameFrame);
    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove },
    });

    // Shared board renders (the bug: this was empty after game-end).
    assert.equal(wrapper.find('[data-testid="play-top-hud-bar"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-mastermind-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-scheme-tile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-city-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-hq-row"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-shared-decks"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-ko-pile"]').exists(), true);
    // All three players appear as opponent panels — the inspection surface for
    // reading the final victory pile by clicking each `Victory: N ▼` button.
    assert.equal(wrapper.findAll('[data-testid="play-opponent-panel"]').length, 3);

    // Personal "your" zone stays hidden — viewer is null on a spectator frame.
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

describe('PlayDesktop notable-event overlay integration (WP-201)', () => {
  // why: the composable catches up to `notableEvents.length` on its first
  // valid frame to prevent re-emission across remount (D-20104). Mounting
  // with empty `notableEvents`, then pushing a frame carrying the test event,
  // exercises the steady-state path where a new engine emission propagates
  // through `UIState.notableEvents` to the overlay.
  async function mountThenPush(event: NotableGameEvent) {
    setActivePinia(createPinia());
    const store = useUiStateStore();
    store.setSnapshot(snapshot());
    const wrapper = mount(PlayDesktop, {
      props: { submitMove: noopSubmitMove },
    });
    await flushPromises();

    const nextFrame = snapshot();
    nextFrame.notableEvents = [event];
    store.setSnapshot(nextFrame);
    await nextTick();
    await nextTick();

    return wrapper;
  }

  test('fightResolved event mounts the overlay with data-event-type="fightResolved"', async () => {
    const wrapper = await mountThenPush({
      type: 'fightResolved',
      playerId: 'alice',
      cardId: 'doom-bot',
      citySpace: 0,
      bystandersRescued: 1,
      appliedEffects: [],
      narrative: 'Fought "doom-bot" and rescued 1 bystander(s).',
    });
    const overlay = wrapper.find('[data-testid="play-notable-event-overlay"]');
    assert.equal(overlay.exists(), true);
    assert.equal(overlay.attributes('data-event-type'), 'fightResolved');
  });

  test('ambushResolved event mounts the overlay with data-event-type="ambushResolved"', async () => {
    const wrapper = await mountThenPush({
      type: 'ambushResolved',
      revealedCardId: 'hand-ninja',
      citySpace: 2,
      appliedEffects: ['gainWoundCurrentPlayer'],
      narrative: '"hand-ninja" ambushed: the active player gained a wound.',
    });
    const overlay = wrapper.find('[data-testid="play-notable-event-overlay"]');
    assert.equal(overlay.exists(), true);
    assert.equal(overlay.attributes('data-event-type'), 'ambushResolved');
  });

  test('schemeTwistResolved event mounts the overlay with data-event-type="schemeTwistResolved"', async () => {
    const wrapper = await mountThenPush({
      type: 'schemeTwistResolved',
      twistCardId: 'scheme-twist-aa',
      resolverKey: 'woundAll',
      narrative: 'Scheme Twist "scheme-twist-aa": every player gained wounds.',
    });
    const overlay = wrapper.find('[data-testid="play-notable-event-overlay"]');
    assert.equal(overlay.exists(), true);
    assert.equal(overlay.attributes('data-event-type'), 'schemeTwistResolved');
  });

  test('mastermindStrikeResolved event mounts the overlay with data-event-type="mastermindStrikeResolved"', async () => {
    const wrapper = await mountThenPush({
      type: 'mastermindStrikeResolved',
      strikeCardId: 'master-strike-03',
      narrative: 'Master Strike: "master-strike-03" resolved.',
    });
    const overlay = wrapper.find('[data-testid="play-notable-event-overlay"]');
    assert.equal(overlay.exists(), true);
    assert.equal(overlay.attributes('data-event-type'), 'mastermindStrikeResolved');
  });
});
