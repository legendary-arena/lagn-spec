/**
 * Integration tests for the live mutation middleware wired in bgioClient.ts.
 *
 * Exercises the full path: UIState transition → detectPlayerAffectingMutations →
 * executeDisruptionPipeline → applyDisruptionToStore.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 * Uses setClientFactoryForTesting for test isolation.
 */

import '../testing/jsdom-setup';

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';

import {
  createLiveClient,
  setClientFactoryForTesting,
  resetLiveClientCallLog,
  type BgioClientLike,
  type BgioClientFactory,
} from '../client/bgioClient';
import { useUiStateStore } from '../stores/uiState';
import { usePreplanStore } from '../stores/preplan';
import type { UIState } from '@legendary-arena/game-engine';
import type { PrePlan } from '@legendary-arena/preplan';

interface StubSubscriber {
  callback: (state: { G?: unknown } | null | undefined) => void;
}

interface StubClient extends BgioClientLike {
  _subscribers: StubSubscriber[];
}

function makeStubFactory(): {
  factory: BgioClientFactory;
  lastClient: () => StubClient | null;
} {
  let captured: StubClient | null = null;

  const factory: BgioClientFactory = () => {
    const stub: StubClient = {
      _subscribers: [],
      moves: {},
      start: () => {},
      stop: () => {},
      subscribe: (listener) => {
        stub._subscribers.push({ callback: listener });
        return () => {};
      },
    };
    captured = stub;
    return stub;
  };

  return { factory, lastClient: () => captured };
}

/**
 * Build a minimal UIState fixture.
 */
function makeUIState(overrides?: Partial<UIState>): UIState {
  return {
    game: {
      phase: 'play',
      turn: 1,
      activePlayerId: '1',
      currentStage: 'main',
    },
    players: [
      {
        playerId: '0',
        deckCount: 10,
        handCount: 5,
        discardCount: 0,
        inPlayCount: 0,
        victoryCount: 0,
        woundCount: 0,
      },
      {
        playerId: '1',
        deckCount: 10,
        handCount: 5,
        discardCount: 0,
        inPlayCount: 0,
        victoryCount: 0,
        woundCount: 0,
      },
    ],
    city: {
      spaces: [null, null, null, null, null],
      escapedPile: [],
    },
    hq: {
      slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-e'],
    },
    mastermind: {
      id: 'core/dr-doom',
      tacticsRemaining: 4,
      tacticsDefeated: 0,
      display: { extId: 'core/dr-doom', name: 'Dr. Doom', imageUrl: '', cost: null },
      attachedBystanders: [],
      strikePile: [],
    },
    scheme: {
      id: 'core/midtown-bank-robbery',
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
    progress: {
      bystandersRescued: 0,
      escapedVillains: 0,
    },
    decks: {
      villainDeckCount: 20,
      heroDeckCount: 15,
    },
    piles: {
      bystandersCount: 10,
      woundsCount: 15,
      horrorsCount: 0,
      officersCount: 5,
      sidekicksCount: 4,
    },
    koPile: {
      count: 0,
      topCard: null,
      cards: [],
    },
    ...overrides,
  };
}

/**
 * Build a minimal active PrePlan fixture.
 */
function makeActivePrePlan(): PrePlan {
  return {
    prePlanId: 'plan-1',
    revision: 1,
    playerId: '0',
    appliesToTurn: 2,
    status: 'active',
    baseStateFingerprint: 'test-fingerprint',
    sandboxState: {
      hand: ['hero-a', 'hero-b'],
      deck: ['hero-c'],
      discard: [],
      inPlay: [],
      counters: {},
    },
    revealLedger: [],
    planSteps: [],
  };
}

describe('mutation middleware integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetLiveClientCallLog();
  });

  afterEach(() => {
    setClientFactoryForTesting(null);
    resetLiveClientCallLog();
  });

  test('UIState transition with active pre-plan triggers disruption pipeline and applies to store', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-1',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const preplanStore = usePreplanStore();
    preplanStore.startPlan(makeActivePrePlan());

    const firstFrame = makeUIState();
    stub._subscribers[0]!.callback({ G: firstFrame });

    assert.equal(preplanStore.current!.status, 'active');

    const secondFrame = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
    });
    stub._subscribers[0]!.callback({ G: secondFrame });

    assert.equal(preplanStore.current!.status, 'invalidated');
    assert.ok(preplanStore.lastNotification !== null);
  });

  test('first-disruption-wins: multiple mutations but only one pipeline result applied', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-2',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const preplanStore = usePreplanStore();
    preplanStore.startPlan(makeActivePrePlan());

    const firstFrame = makeUIState();
    stub._subscribers[0]!.callback({ G: firstFrame });

    const secondFrame = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
      piles: {
        bystandersCount: 9,
        woundsCount: 15,
        horrorsCount: 0,
        officersCount: 5,
        sidekicksCount: 4,
      },
      mastermind: {
        id: 'core/dr-doom',
        tacticsRemaining: 3,
        tacticsDefeated: 1,
        display: { extId: 'core/dr-doom', name: 'Dr. Doom', imageUrl: '', cost: null },
        attachedBystanders: [],
        strikePile: [],
      },
    });
    stub._subscribers[0]!.callback({ G: secondFrame });

    assert.equal(preplanStore.current!.status, 'invalidated');
    assert.ok(preplanStore.lastNotification !== null);
  });

  test('no active pre-plan: UIState transition does not invoke pipeline', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-3',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const preplanStore = usePreplanStore();

    const firstFrame = makeUIState();
    stub._subscribers[0]!.callback({ G: firstFrame });

    const secondFrame = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
    });
    stub._subscribers[0]!.callback({ G: secondFrame });

    assert.equal(preplanStore.current, null);
    assert.equal(preplanStore.lastNotification, null);
  });

  test('first frame sets previousUIState and skips detection', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-4',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const preplanStore = usePreplanStore();
    preplanStore.startPlan(makeActivePrePlan());

    const firstFrame = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
    });
    stub._subscribers[0]!.callback({ G: firstFrame });

    assert.equal(preplanStore.current!.status, 'active');
    assert.equal(preplanStore.lastNotification, null);
  });

  test('reference-equal frames skip detection entirely', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-5',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const preplanStore = usePreplanStore();
    preplanStore.startPlan(makeActivePrePlan());

    const frame = makeUIState();
    stub._subscribers[0]!.callback({ G: frame });
    stub._subscribers[0]!.callback({ G: frame });

    assert.equal(preplanStore.current!.status, 'active');
    assert.equal(preplanStore.lastNotification, null);
  });

  test('null UIState frame does not crash and previousUIState stays unchanged', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-6',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const preplanStore = usePreplanStore();
    preplanStore.startPlan(makeActivePrePlan());

    const firstFrame = makeUIState();
    stub._subscribers[0]!.callback({ G: firstFrame });

    stub._subscribers[0]!.callback(null);
    stub._subscribers[0]!.callback({ G: undefined });

    assert.equal(preplanStore.current!.status, 'active');

    const secondFrame = makeUIState({
      hq: {
        slots: ['hero-a', 'hero-b', 'hero-c', 'hero-d', 'hero-f'],
      },
    });
    stub._subscribers[0]!.callback({ G: secondFrame });

    assert.equal(preplanStore.current!.status, 'invalidated');
  });

  test('undefined UIState frame does not crash', () => {
    const { factory, lastClient } = makeStubFactory();
    setClientFactoryForTesting(factory);

    createLiveClient({
      matchID: 'match-mid-7',
      playerID: '0',
      credentials: 'secret',
      serverUrl: 'http://localhost:8000',
      viewerPlayerId: '0',
    });

    const stub = lastClient()!;
    const uiStore = useUiStateStore();

    stub._subscribers[0]!.callback({ G: undefined });
    assert.equal(uiStore.snapshot, null);
  });
});
