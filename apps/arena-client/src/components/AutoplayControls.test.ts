import '../testing/jsdom-setup';

import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import type { UIState } from '@legendary-arena/game-engine';

import AutoplayControls from './AutoplayControls.vue';
import {
  STALL_POLL_INTERVAL_MS,
  type AutoplayControlResponse,
} from '../services/autoplayPlayback';
import { useUiStateStore } from '../stores/uiState';

// why: the WP-262 stall poll arms a setInterval on mount; without this, every
// mounted-but-not-unmounted bar in the suites below would leak a live interval
// and keep the node:test event loop alive (hang). enableAutoUnmount unmounts
// each wrapper after its test, clearing the interval via onBeforeUnmount.
enableAutoUnmount(afterEach);

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
    speedMode: '1x',
    gameOver: false,
    aborted: false,
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
    notableEvents: [],
    villainAttachedHeroes: {},
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

  test('toggle shows ▶ (resume) when paused and ⏸ (pause) when running; not disabled unless game over', () => {
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

describe('AutoplayControls — Feature 1: keyboard shortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('Space key triggers pause/resume toggle', async () => {
    installControlStub(
      { resume: status({ paused: false, mode: 'live' }) },
      status(),
    );
    const wrapper = mountBar(status({ paused: true }));
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: ' ' });
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/resume$/);
  });

  test('ArrowLeft triggers step-back when paused', async () => {
    installControlStub({}, status({ paused: true, cursor: 3 }));
    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: 'ArrowLeft' });
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/step-back$/);
  });

  test('ArrowRight triggers step-forward when paused', async () => {
    installControlStub({}, status({ paused: true, cursor: 5 }));
    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/step-forward$/);
  });

  test('Home triggers restart when paused with history', async () => {
    installControlStub({}, status({ paused: true, cursor: 0 }));
    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: 'Home' });
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/restart$/);
  });

  test('End triggers go-to-end when not game over', async () => {
    installControlStub({}, status({ paused: false, mode: 'live' }));
    const wrapper = mountBar(status({ paused: true, cursor: 2, historyLength: 5 }));
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: 'End' });
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/go-to-end$/);
  });

  test('disabled action keys are no-ops — no fetch call', async () => {
    installControlStub({}, status());
    // Mount with paused=false (live mode) — step-back is disabled
    const wrapper = mountBar(status({ paused: false, mode: 'live', cursor: 4, historyLength: 5 }));
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: 'ArrowLeft' });
    await flushPromises();

    assert.equal(calls.length, 0);
  });

  test('Space is no-op when toggle is disabled (game over)', async () => {
    installControlStub({}, status());
    const wrapper = mountBar(status({ paused: true }), true);
    const bar = wrapper.find('[data-testid="autoplay-controls"]');

    await bar.trigger('keydown', { key: ' ' });
    await flushPromises();

    assert.equal(calls.length, 0);
  });
});

describe('AutoplayControls — Feature 2: position indicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('shows "Move N / M" when historyLength > 0', () => {
    const wrapper = mountBar(status({ cursor: 2, historyLength: 5 }));
    const position = wrapper.find('[data-testid="autoplay-position"]');
    assert.equal(position.exists(), true);
    assert.equal(position.text(), 'Move 3 / 5');
  });

  test('hidden when historyLength is 0', () => {
    const wrapper = mountBar(status({ cursor: 0, historyLength: 0 }));
    assert.equal(wrapper.find('[data-testid="autoplay-position"]').exists(), false);
  });

  test('updates after a control action', async () => {
    installControlStub(
      { 'step-back': status({ paused: true, cursor: 1, historyLength: 5 }) },
      status(),
    );
    const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
    assert.equal(wrapper.find('[data-testid="autoplay-position"]').text(), 'Move 5 / 5');

    await wrapper.find('[data-testid="autoplay-step-back"]').trigger('click');
    await flushPromises();

    assert.equal(wrapper.find('[data-testid="autoplay-position"]').text(), 'Move 2 / 5');
  });
});

describe('AutoplayControls — Feature 3: speed control', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('speed button renders with initial label 1×', () => {
    const wrapper = mountBar(status({ speedMode: '1x' }));
    const speedBtn = wrapper.find('[data-testid="autoplay-speed"]');
    assert.equal(speedBtn.exists(), true);
    assert.equal(speedBtn.text(), '1×');
  });

  test('cycling speed: 1×→2×→4×→1×', async () => {
    installControlStub({}, status({ paused: true }));
    const wrapper = mountBar(status({ paused: true, speedMode: '1x' }));
    const speedBtn = wrapper.find('[data-testid="autoplay-speed"]');

    await speedBtn.trigger('click');
    assert.equal(speedBtn.text(), '2×');

    await speedBtn.trigger('click');
    assert.equal(speedBtn.text(), '4×');

    await speedBtn.trigger('click');
    assert.equal(speedBtn.text(), '1×');
  });

  test('cycling while playing sends resume with speedMode body', async () => {
    installControlStub({}, status({ paused: false, mode: 'live', speedMode: '2x' }));
    const wrapper = mountBar(status({ paused: false, mode: 'live', speedMode: '1x' }));
    const speedBtn = wrapper.find('[data-testid="autoplay-speed"]');

    await speedBtn.trigger('click');
    await flushPromises();

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/resume$/);
    const body = JSON.parse(calls[0]!.init?.body as string);
    assert.equal(body.speedMode, '2x');
  });

  test('speed persists across pause/resume (no reset)', async () => {
    installControlStub(
      { pause: status({ paused: true, speedMode: '4x' }) },
      status({ paused: false, mode: 'live', speedMode: '4x' }),
    );
    const wrapper = mountBar(status({ paused: false, mode: 'live', speedMode: '4x' }));

    // Pause
    await wrapper.find('[data-testid="autoplay-toggle"]').trigger('click');
    await flushPromises();

    // Speed label still shows 4×
    assert.equal(wrapper.find('[data-testid="autoplay-speed"]').text(), '4×');
  });

  test('go-to-end forces display "Max" from response speedMode', async () => {
    installControlStub(
      { 'go-to-end': status({ paused: false, mode: 'live', speedMode: 'max' }) },
      status(),
    );
    const wrapper = mountBar(status({ paused: true, cursor: 2, historyLength: 5 }));
    await wrapper.find('[data-testid="autoplay-go-to-end"]').trigger('click');
    await flushPromises();

    assert.equal(wrapper.find('[data-testid="autoplay-speed"]').text(), 'Max');
  });
});

describe('AutoplayControls — Feature 4: game-over review state', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('toggle shows 🏁 when game over and is disabled', () => {
    const wrapper = mountBar(status({ paused: true }), true);
    const toggle = wrapper.find('[data-testid="autoplay-toggle"]');
    assert.match(toggle.text(), /🏁/);
    assert.notEqual(toggle.attributes('disabled'), undefined);
  });

  test('step-back and restart are enabled when game over (not gated on paused)', () => {
    const wrapper = mountBar(
      status({ paused: true, cursor: 3, historyLength: 5 }),
      true,
    );
    assert.equal(
      wrapper.find('[data-testid="autoplay-step-back"]').attributes('disabled'),
      undefined,
    );
    assert.equal(
      wrapper.find('[data-testid="autoplay-restart"]').attributes('disabled'),
      undefined,
    );
  });

  test('step-forward is enabled when game over', () => {
    const wrapper = mountBar(
      status({ paused: true, cursor: 2, historyLength: 5 }),
      true,
    );
    assert.equal(
      wrapper.find('[data-testid="autoplay-step-forward"]').attributes('disabled'),
      undefined,
    );
  });

  test('watcher sets paused=true when isGameOver transitions to true', async () => {
    const wrapper = mount(AutoplayControls, {
      props: {
        matchId: 'match-1',
        initialStatus: status({ paused: false, mode: 'live' }),
        isGameOver: false,
      },
    });
    const toggle = wrapper.find('[data-testid="autoplay-toggle"]');
    assert.match(toggle.text(), /⏸/);

    await wrapper.setProps({ isGameOver: true });
    assert.match(
      wrapper.find('[data-testid="autoplay-toggle"]').text(),
      /🏁/,
    );
  });

  test('expired state disables all controls after 404 in game-over mode', async () => {
    const originalFetchRef = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response('', { status: 404, statusText: 'Not Found' });
    }) as typeof globalThis.fetch;

    const wrapper = mountBar(status({ paused: true, cursor: 3, historyLength: 5 }), true);
    await wrapper.find('[data-testid="autoplay-step-back"]').trigger('click');
    await flushPromises();

    assert.equal(
      wrapper.find('[data-testid="autoplay-expired"]').exists(),
      true,
    );

    globalThis.fetch = originalFetchRef;
  });
});

describe('AutoplayControls — Feature 5: abort banner + stall poll (WP-262)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  afterEach(() => {
    restoreFetch();
  });

  test('an initial aborted status renders the banner immediately and does NOT start the poll', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      installControlStub({}, status());
      const wrapper = mountBar(
        status({
          aborted: true,
          abortReason: 'The bot loop stopped after an unexpected server error.',
        }),
      );

      const banner = wrapper.find('[data-testid="autoplay-aborted"]');
      assert.equal(banner.exists(), true);
      assert.match(banner.text(), /unexpected server error/);

      // No poll started: ticking past several intervals issues no status probe.
      mock.timers.tick(STALL_POLL_INTERVAL_MS * 3);
      await flushPromises();
      assert.equal(calls.filter((c) => c.url.endsWith('/status')).length, 0);
    } finally {
      mock.timers.reset();
    }
  });

  test('a poll tick observing an aborted envelope shows the banner, disables live controls, keeps rewind, leaves the cursor put, and stops polling', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      installControlStub(
        {
          // Live-edge values the poll MUST NOT apply (proves abort-state-only).
          status: status({
            aborted: true,
            abortReason: 'The bot loop stopped: the start stage did not advance.',
            paused: false,
            mode: 'live',
            cursor: 9,
            historyLength: 10,
          }),
        },
        status(),
      );
      // Mount paused + rewound (cursor 1 of 5) so a wrongful applyResponse would
      // visibly jump the position label.
      const wrapper = mountBar(
        status({ paused: true, cursor: 1, historyLength: 5, mode: 'paused' }),
      );
      assert.equal(wrapper.find('[data-testid="autoplay-aborted"]').exists(), false);
      assert.equal(
        wrapper.find('[data-testid="autoplay-position"]').text(),
        'Move 2 / 5',
      );

      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();

      const banner = wrapper.find('[data-testid="autoplay-aborted"]');
      assert.equal(banner.exists(), true);
      assert.match(banner.text(), /start stage did not advance/);

      // Live-advancing controls disabled.
      assert.notEqual(
        wrapper.find('[data-testid="autoplay-toggle"]').attributes('disabled'),
        undefined,
      );
      assert.notEqual(
        wrapper.find('[data-testid="autoplay-step-forward"]').attributes('disabled'),
        undefined,
      );
      assert.notEqual(
        wrapper.find('[data-testid="autoplay-go-to-end"]').attributes('disabled'),
        undefined,
      );
      // Rewind controls stay enabled (history present, cursor 1 > 0).
      assert.equal(
        wrapper.find('[data-testid="autoplay-step-back"]').attributes('disabled'),
        undefined,
      );
      assert.equal(
        wrapper.find('[data-testid="autoplay-restart"]').attributes('disabled'),
        undefined,
      );
      // Cursor / position UNCHANGED — abort-state-only update.
      assert.equal(
        wrapper.find('[data-testid="autoplay-position"]').text(),
        'Move 2 / 5',
      );

      // Poll stopped: no further /status probes after more intervals.
      const probesAtAbort = calls.filter((c) => c.url.endsWith('/status')).length;
      mock.timers.tick(STALL_POLL_INTERVAL_MS * 2);
      await flushPromises();
      assert.equal(
        calls.filter((c) => c.url.endsWith('/status')).length,
        probesAtAbort,
      );
    } finally {
      mock.timers.reset();
    }
  });

  test('a poll tick observing a game-over envelope stops the poll and shows no abort banner', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      installControlStub({ status: status({ gameOver: true }) }, status());
      const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));

      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();

      assert.equal(wrapper.find('[data-testid="autoplay-aborted"]').exists(), false);
      const probesAtStop = calls.filter((c) => c.url.endsWith('/status')).length;
      assert.equal(probesAtStop, 1);
      mock.timers.tick(STALL_POLL_INTERVAL_MS * 2);
      await flushPromises();
      assert.equal(
        calls.filter((c) => c.url.endsWith('/status')).length,
        probesAtStop,
      );
    } finally {
      mock.timers.reset();
    }
  });

  test('a poll tick that 404s (controller torn down) stops the poll without an abort banner', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      calls = [];
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({ url, init: undefined });
        return new Response('', { status: 404 });
      }) as typeof globalThis.fetch;

      const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();

      assert.equal(wrapper.find('[data-testid="autoplay-aborted"]').exists(), false);
      const probesAtStop = calls.length;
      assert.equal(probesAtStop, 1);
      mock.timers.tick(STALL_POLL_INTERVAL_MS * 2);
      await flushPromises();
      assert.equal(calls.length, probesAtStop);
    } finally {
      mock.timers.reset();
    }
  });

  test('a thrown probe fault is logged and the poll keeps running without raising the banner', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    const originalConsoleError = console.error;
    let probeCount = 0;
    // why: silence the expected per-fault console.error so the suite output is
    // not polluted; the poll-continues assertion is what proves the behavior.
    console.error = (): void => {};
    try {
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        probeCount += 1;
        // A 500 makes getStatus throw (a non-404 fault is never coerced to null).
        return new Response('{}', { status: 500 });
      }) as typeof globalThis.fetch;

      const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));

      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();
      assert.equal(wrapper.find('[data-testid="autoplay-aborted"]').exists(), false);
      assert.equal(probeCount, 1);

      // The poll continues after a transient fault — the next tick probes again.
      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();
      assert.equal(probeCount, 2);
      assert.equal(wrapper.find('[data-testid="autoplay-aborted"]').exists(), false);
    } finally {
      console.error = originalConsoleError;
      mock.timers.reset();
    }
  });

  test('overlapping probes are skipped — a tick while a probe is in flight issues no new request', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      let probeCount = 0;
      // why: initialised to a no-op (not null) so vue-tsc keeps it callable —
      // a closure-assigned `let` plus a null guard otherwise narrows to `never`.
      let resolvePending: (value: Response) => void = () => undefined;
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        probeCount += 1;
        return new Promise<Response>((resolve) => {
          resolvePending = resolve;
        });
      }) as typeof globalThis.fetch;

      const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));

      // Tick 1: a probe is issued and stays in flight (the promise is pending).
      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();
      assert.equal(probeCount, 1);

      // Tick 2: the in-flight guard skips this tick — no second request.
      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();
      assert.equal(probeCount, 1);

      // Settle the first probe with a normal live envelope → 'continue'.
      resolvePending(
        new Response(JSON.stringify(status({ paused: false, mode: 'live' })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await flushPromises();

      // With the guard released, the next tick issues a fresh probe.
      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();
      assert.equal(probeCount, 2);
      assert.equal(wrapper.find('[data-testid="autoplay-aborted"]').exists(), false);
    } finally {
      mock.timers.reset();
    }
  });

  test('a probe that resolves after unmount does not mutate state or emit warnings', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    const warnings: string[] = [];
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    console.warn = (...messageParts: unknown[]): void => {
      warnings.push(String(messageParts[0]));
    };
    console.error = (...messageParts: unknown[]): void => {
      warnings.push(String(messageParts[0]));
    };
    try {
      // why: initialised to a no-op (not null) so vue-tsc keeps it callable —
      // a closure-assigned `let` plus a null guard otherwise narrows to `never`.
      let resolvePending: (value: Response) => void = () => undefined;
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Promise<Response>((resolve) => {
          resolvePending = resolve;
        })) as typeof globalThis.fetch;

      const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));
      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();

      // Tear the bar down while the probe is still in flight.
      wrapper.unmount();

      // The probe resolves AFTER unmount with an aborted envelope; the disposal
      // guard must drop it — no banner mutation, no post-unmount Vue warning.
      resolvePending(
        new Response(
          JSON.stringify(
            status({ aborted: true, abortReason: 'resolved after unmount' }),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      await flushPromises();

      assert.deepEqual(
        warnings,
        [],
        `expected no post-unmount warnings, got: ${warnings.join(' | ')}`,
      );
    } finally {
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
      mock.timers.reset();
    }
  });

  test('the poll stops on unmount — no further status probes after the bar is destroyed', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      installControlStub({}, status());
      const wrapper = mountBar(status({ paused: true, cursor: 4, historyLength: 5 }));

      mock.timers.tick(STALL_POLL_INTERVAL_MS);
      await flushPromises();
      const probesBeforeUnmount = calls.filter((c) =>
        c.url.endsWith('/status'),
      ).length;
      assert.equal(probesBeforeUnmount, 1);

      wrapper.unmount();
      mock.timers.tick(STALL_POLL_INTERVAL_MS * 3);
      await flushPromises();
      assert.equal(
        calls.filter((c) => c.url.endsWith('/status')).length,
        probesBeforeUnmount,
      );
    } finally {
      mock.timers.reset();
    }
  });
});
