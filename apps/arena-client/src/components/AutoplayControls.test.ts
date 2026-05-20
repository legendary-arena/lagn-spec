import '../testing/jsdom-setup';

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import type { UIState } from '@legendary-arena/game-engine';

import AutoplayControls from './AutoplayControls.vue';
import type { AutoplayControlResponse } from '../services/autoplayPlayback';
import { useUiStateStore } from '../stores/uiState';

interface StubbedCall {
  url: string;
  init: RequestInit | undefined;
}

let originalFetch: typeof globalThis.fetch | undefined;
let calls: StubbedCall[];

/**
 * Install a fetch stub that returns the envelope mapped to the request's
 * action segment (the last path segment), defaulting to `fallback`.
 */
function installControlStub(
  byAction: Record<string, AutoplayControlResponse>,
  fallback: AutoplayControlResponse,
): void {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const action = url.slice(url.lastIndexOf('/') + 1);
    const body = byAction[action] ?? fallback;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch;
  }
}

function status(
  overrides: Partial<AutoplayControlResponse> = {},
): AutoplayControlResponse {
  return {
    ok: true,
    paused: true,
    historyLength: 5,
    cursor: 4,
    mode: 'paused',
    ...overrides,
  };
}

function sampleUiState(): UIState {
  return {
    game: { phase: 'play', turn: 1, activePlayerId: 'a', currentStage: 'main' },
    players: [],
    city: { spaces: [], escapedPile: [] },
    hq: { slots: [] },
    mastermind: {
      id: 'core/loki',
      tacticsRemaining: 0,
      tacticsDefeated: 0,
      display: {
        extId: 'mastermind-loki',
        name: 'Loki',
        imageUrl: 'https://images.barefootbetters.com/loki.png',
        cost: 6,
      },
      attachedBystanders: [],
      strikePile: [],
    },
    scheme: { id: 'core/scheme', twistCount: 0, twistPile: [] },
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
    decks: { villainDeckCount: 0, heroDeckCount: 0 },
    piles: {
      bystandersCount: 0,
      woundsCount: 0,
      horrorsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    },
    koPile: { count: 0, topCard: null, cards: [] },
  };
}

function mountBar(
  initialStatus: AutoplayControlResponse,
  isGameOver = false,
): ReturnType<typeof mount> {
  return mount(AutoplayControls, {
    props: { matchId: 'match-1', initialStatus, isGameOver },
  });
}

describe('AutoplayControls (WP-164) — rendering + disabled matrix', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('renders the five control buttons + the pause/resume toggle', () => {
    const wrapper = mountBar(status());
    for (const testId of [
      'autoplay-restart',
      'autoplay-step-back',
      'autoplay-toggle',
      'autoplay-step-forward',
      'autoplay-go-to-end',
    ]) {
      assert.equal(
        wrapper.find(`[data-testid="${testId}"]`).exists(),
        true,
        `${testId} should render`,
      );
    }
  });

  test('paused at the live edge: step controls + restart enabled, go-to-end enabled', () => {
    const wrapper = mountBar(
      status({ paused: true, cursor: 4, historyLength: 5 }),
      false,
    );
    assert.equal(
      wrapper.find('[data-testid="autoplay-step-back"]').attributes('disabled'),
      undefined,
    );
    assert.equal(
      wrapper
        .find('[data-testid="autoplay-step-forward"]')
        .attributes('disabled'),
      undefined,
    );
    assert.equal(
      wrapper.find('[data-testid="autoplay-restart"]').attributes('disabled'),
      undefined,
    );
    assert.equal(
      wrapper.find('[data-testid="autoplay-go-to-end"]').attributes('disabled'),
      undefined,
    );
  });

  test('not paused (mode live): step-back, step-forward, restart are all disabled', () => {
    const wrapper = mountBar(
      status({ paused: false, mode: 'live', cursor: 4, historyLength: 5 }),
    );
    assert.notEqual(
      wrapper.find('[data-testid="autoplay-step-back"]').attributes('disabled'),
      undefined,
    );
    assert.notEqual(
      wrapper
        .find('[data-testid="autoplay-step-forward"]')
        .attributes('disabled'),
      undefined,
    );
    assert.notEqual(
      wrapper.find('[data-testid="autoplay-restart"]').attributes('disabled'),
      undefined,
    );
  });

  test('step-back is disabled at cursor 0 even when paused', () => {
    const wrapper = mountBar(status({ paused: true, cursor: 0, historyLength: 5 }));
    assert.notEqual(
      wrapper.find('[data-testid="autoplay-step-back"]').attributes('disabled'),
      undefined,
    );
  });

  test('restart is disabled when historyLength is 0 even when paused', () => {
    const wrapper = mountBar(
      status({ paused: true, cursor: 0, historyLength: 0 }),
    );
    assert.notEqual(
      wrapper.find('[data-testid="autoplay-restart"]').attributes('disabled'),
      undefined,
    );
  });

  test('go-to-end is disabled when the game is over (prop), enabled otherwise', () => {
    const over = mountBar(status(), true);
    assert.notEqual(
      over.find('[data-testid="autoplay-go-to-end"]').attributes('disabled'),
      undefined,
    );
    const live = mountBar(status(), false);
    assert.equal(
      live.find('[data-testid="autoplay-go-to-end"]').attributes('disabled'),
      undefined,
    );
  });

  test('toggle shows ▶ (resume) when paused and ⏸ (pause) when running; never disabled', () => {
    const pausedBar = mountBar(status({ paused: true }));
    const pausedToggle = pausedBar.find('[data-testid="autoplay-toggle"]');
    assert.match(pausedToggle.text(), /▶/);
    assert.equal(pausedToggle.attributes('disabled'), undefined);

    const liveBar = mountBar(status({ paused: false, mode: 'live' }));
    const liveToggle = liveBar.find('[data-testid="autoplay-toggle"]');
    assert.match(liveToggle.text(), /⏸/);
    assert.equal(liveToggle.attributes('disabled'), undefined);
  });
});

describe('AutoplayControls (WP-164) — button → service + REWIND', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('clicking a button POSTs the matching hyphenated control route', async () => {
    installControlStub({}, status());
    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));

    await wrapper.find('[data-testid="autoplay-step-back"]').trigger('click');
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/api\/match\/autoplay\/match-1\/step-back$/);
    assert.equal(calls[0]!.init?.method, 'POST');
  });

  test('the toggle posts resume when paused and pause when running', async () => {
    installControlStub({}, status());

    const pausedBar = mountBar(status({ paused: true }));
    await pausedBar.find('[data-testid="autoplay-toggle"]').trigger('click');
    await flushPromises();
    assert.match(calls[0]!.url, /\/resume$/);

    const liveBar = mountBar(status({ paused: false, mode: 'live' }));
    await liveBar.find('[data-testid="autoplay-toggle"]').trigger('click');
    await flushPromises();
    assert.match(calls[1]!.url, /\/pause$/);
  });

  test('a control response fully replaces local paused/cursor/historyLength/mode', async () => {
    // Mount paused at the live edge (no REWIND); the step-back response moves
    // the cursor back and shrinks historyLength — the bar must reflect ALL of
    // the new fields, not a partial merge.
    installControlStub(
      { 'step-back': status({ paused: true, cursor: 2, historyLength: 6, mode: 'paused' }) },
      status(),
    );
    const wrapper = mountBar(
      status({ paused: true, cursor: 5, historyLength: 6, mode: 'paused' }),
    );
    // Live edge initially (cursor 5 of 6) → not rewound.
    assert.equal(
      wrapper.find('[data-testid="autoplay-rewind-indicator"]').exists(),
      false,
    );

    await wrapper.find('[data-testid="autoplay-step-back"]').trigger('click');
    await flushPromises();

    // Replaced from the response: cursor 2 of 6 → REWIND shown.
    assert.equal(
      wrapper.find('[data-testid="autoplay-rewind-indicator"]').exists(),
      true,
    );
    // step-back still enabled (cursor 2 > 0, still paused) — full state present.
    assert.equal(
      wrapper.find('[data-testid="autoplay-step-back"]').attributes('disabled'),
      undefined,
    );
  });

  test('REWIND appears after stepping back and clears after stepping forward to the live edge', async () => {
    installControlStub(
      {
        'step-back': status({ paused: true, cursor: 2, historyLength: 5 }),
        'step-forward': status({ paused: true, cursor: 4, historyLength: 5 }),
      },
      status(),
    );
    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));

    // Live edge initially: cursor 4 of 5 → not rewound.
    assert.equal(
      wrapper.find('[data-testid="autoplay-rewind-indicator"]').exists(),
      false,
    );

    await wrapper.find('[data-testid="autoplay-step-back"]').trigger('click');
    await flushPromises();
    assert.equal(
      wrapper.find('[data-testid="autoplay-rewind-indicator"]').exists(),
      true,
    );

    await wrapper.find('[data-testid="autoplay-step-forward"]').trigger('click');
    await flushPromises();
    assert.equal(
      wrapper.find('[data-testid="autoplay-rewind-indicator"]').exists(),
      false,
    );
  });

  test('pause while rewound still indicates REWIND (paused AND cursor behind the edge)', () => {
    // The (paused, isRewound) combination is valid and must still show REWIND —
    // REWIND keys on cursor position, never on `mode`.
    const wrapper = mountBar(status({ paused: true, cursor: 1, historyLength: 5 }));
    assert.equal(
      wrapper.find('[data-testid="autoplay-rewind-indicator"]').exists(),
      true,
    );
    assert.match(wrapper.find('[data-testid="autoplay-toggle"]').text(), /▶/);
  });

  test('the component never double-injects setSnapshot — the service is the sole caller', async () => {
    const injected = sampleUiState();
    installControlStub(
      { 'step-back': status({ paused: true, cursor: 2, historyLength: 5, uiState: injected }) },
      status(),
    );
    const store = useUiStateStore();
    let callCount = 0;
    store.setSnapshot = (): void => {
      callCount += 1;
    };

    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
    await wrapper.find('[data-testid="autoplay-step-back"]').trigger('click');
    await flushPromises();

    // Exactly one call (from the service). If the component also called it, this
    // would be 2.
    assert.equal(callCount, 1);
  });

  test('a control response WITHOUT uiState triggers no setSnapshot at all', async () => {
    installControlStub({}, status({ paused: true, cursor: 3, historyLength: 5 }));
    const store = useUiStateStore();
    let callCount = 0;
    store.setSnapshot = (): void => {
      callCount += 1;
    };

    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
    await wrapper.find('[data-testid="autoplay-step-forward"]').trigger('click');
    await flushPromises();

    assert.equal(callCount, 0);
  });
});
