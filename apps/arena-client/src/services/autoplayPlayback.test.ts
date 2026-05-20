import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import type { UIState } from '@legendary-arena/game-engine';

import {
  getStatus,
  pause,
  resume,
  stepForward,
  stepBack,
  restart,
  goToEnd,
  resolveAutoplayGating,
  type AutoplayControlResponse,
} from './autoplayPlayback';
import { useUiStateStore } from '../stores/uiState';
import { apiBaseUrl } from '../lib/api/apiBaseUrl';

interface StubbedCall {
  url: string;
  init: RequestInit | undefined;
}

let originalFetch: typeof globalThis.fetch | undefined;
let calls: StubbedCall[];

function installFetchStub(
  responder: (url: string, init: RequestInit | undefined) => Response,
): void {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof globalThis.fetch;
}

function installRejectingFetch(): void {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function envelope(
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

// why: a minimal but structurally valid UIState; the service stores it by
// reference, so the tests assert identity (===), not deep shape.
function sampleUiState(): UIState {
  return {
    game: { phase: 'play', turn: 3, activePlayerId: 'alice', currentStage: 'main' },
    players: [],
    city: { spaces: [], escapedPile: [] },
    hq: { slots: [] },
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

describe('autoplayPlayback service (WP-164) — getStatus resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    restoreFetch();
  });

  test('getStatus resolves the parsed envelope on HTTP 200 and GETs the status path', async () => {
    installFetchStub(() => jsonResponse(200, envelope({ mode: 'live', cursor: 4 })));

    const result = await getStatus('match-abc');

    assert.notEqual(result, null);
    assert.equal(result!.mode, 'live');
    assert.equal(result!.cursor, 4);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      `${apiBaseUrl}/api/match/autoplay/match-abc/status`,
    );
    // GET — no method (or an explicit GET) is fine; assert it is not a POST.
    assert.notEqual(calls[0]!.init?.method, 'POST');
  });

  test('getStatus resolves null on HTTP 404 (not an autoplay match)', async () => {
    installFetchStub(() => jsonResponse(404, { ok: false, error: 'not found' }));

    const result = await getStatus('match-pvp');
    assert.equal(result, null);
  });

  test('getStatus throws on HTTP 500 — a non-404 fault is NOT coerced to null', async () => {
    installFetchStub(() => jsonResponse(500, { ok: false }));

    await assert.rejects(
      () => getStatus('match-boom'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /HTTP 500/);
        assert.match(error.message, /not be treated as "not autoplay"/);
        return true;
      },
    );
  });

  test('getStatus throws on a network failure (not coerced to null)', async () => {
    installRejectingFetch();

    await assert.rejects(
      () => getStatus('match-net'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /network request to .* did not complete/);
        return true;
      },
    );
  });
});

describe('autoplayPlayback service (WP-164) — control endpoints', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    restoreFetch();
  });

  const controlCases: ReadonlyArray<{
    name: string;
    call: (matchId: string) => Promise<AutoplayControlResponse>;
    path: string;
  }> = [
    { name: 'pause', call: pause, path: 'pause' },
    { name: 'resume', call: resume, path: 'resume' },
    { name: 'stepForward', call: stepForward, path: 'step-forward' },
    { name: 'stepBack', call: stepBack, path: 'step-back' },
    { name: 'restart', call: restart, path: 'restart' },
    { name: 'goToEnd', call: goToEnd, path: 'go-to-end' },
  ];

  for (const controlCase of controlCases) {
    test(`${controlCase.name} POSTs the ${controlCase.path} path via buildApiUrl`, async () => {
      installFetchStub(() => jsonResponse(200, envelope()));

      await controlCase.call('match-xyz');

      assert.equal(calls.length, 1);
      assert.equal(
        calls[0]!.url,
        `${apiBaseUrl}/api/match/autoplay/match-xyz/${controlCase.path}`,
      );
      assert.equal(calls[0]!.init?.method, 'POST');
    });
  }

  test('a control response carrying uiState calls setSnapshot with that value EXACTLY', async () => {
    const injected = sampleUiState();
    installFetchStub(() => jsonResponse(200, envelope({ uiState: injected })));

    const store = useUiStateStore();
    let snapshotArg: UIState | null | undefined;
    let callCount = 0;
    store.setSnapshot = (next: UIState | null): void => {
      callCount += 1;
      snapshotArg = next;
    };

    await stepBack('match-xyz');

    assert.equal(callCount, 1);
    // Identity: the injected value is passed through unchanged (no clone/merge).
    assert.deepEqual(snapshotArg, injected);
  });

  test('a control response WITHOUT uiState does NOT call setSnapshot', async () => {
    installFetchStub(() => jsonResponse(200, envelope()));

    const store = useUiStateStore();
    let callCount = 0;
    store.setSnapshot = (): void => {
      callCount += 1;
    };

    await resume('match-xyz');

    assert.equal(callCount, 0);
  });

  test('mode is passed through unchanged from the response envelope', async () => {
    installFetchStub(() => jsonResponse(200, envelope({ mode: 'live' })));

    const result = await goToEnd('match-xyz');
    assert.equal(result.mode, 'live');
  });

  test('a later setSnapshot (live broadcast) overwrites an injected rewind frame — no merge', async () => {
    // why: Pinia wraps stored state in a reactive proxy, so identity (===) on
    // the raw object does not hold; the frames are distinguished by a field
    // value (game.turn) to prove the second write fully replaced the first.
    const rewoundFrame = sampleUiState();
    rewoundFrame.game.turn = 2;
    installFetchStub(() => jsonResponse(200, envelope({ uiState: rewoundFrame })));

    const store = useUiStateStore();
    await stepBack('match-xyz');
    assert.equal(store.snapshot?.game.turn, 2);

    // Simulate the existing client/bgioClient.ts per-broadcast write (D-16301):
    // the next live frame unconditionally replaces the injected one.
    const liveFrame = sampleUiState();
    liveFrame.game.turn = 9;
    store.setSnapshot(liveFrame);
    assert.equal(store.snapshot?.game.turn, 9);
  });
});

describe('autoplayPlayback service (WP-164) — resolveAutoplayGating', () => {
  test('an absent matchId does NOT probe and resolves null', async () => {
    let probeCalls = 0;
    const probe = async (): Promise<AutoplayControlResponse | null> => {
      probeCalls += 1;
      return null;
    };
    const noDelay = async (): Promise<void> => undefined;

    assert.equal(await resolveAutoplayGating('', probe, noDelay), null);
    assert.equal(await resolveAutoplayGating(undefined, probe, noDelay), null);
    assert.equal(await resolveAutoplayGating(null, probe, noDelay), null);
    assert.equal(probeCalls, 0);
  });

  test('a first-probe 200 resolves the envelope without a retry', async () => {
    let probeCalls = 0;
    let delayCalls = 0;
    const probe = async (): Promise<AutoplayControlResponse | null> => {
      probeCalls += 1;
      return envelope({ mode: 'live' });
    };
    const delay = async (): Promise<void> => {
      delayCalls += 1;
    };

    const result = await resolveAutoplayGating('match-1', probe, delay);
    assert.notEqual(result, null);
    assert.equal(probeCalls, 1);
    assert.equal(delayCalls, 0);
  });

  test('first null then a second 200 resolves the envelope after exactly one retry', async () => {
    const results: Array<AutoplayControlResponse | null> = [null, envelope()];
    let probeCalls = 0;
    let delayCalls = 0;
    const probe = async (): Promise<AutoplayControlResponse | null> => {
      const value = results[probeCalls] ?? null;
      probeCalls += 1;
      return value;
    };
    const delay = async (): Promise<void> => {
      delayCalls += 1;
    };

    const result = await resolveAutoplayGating('match-1', probe, delay);
    assert.notEqual(result, null);
    assert.equal(probeCalls, 2);
    assert.equal(delayCalls, 1);
  });

  test('first null then a second null resolves null with NO third attempt', async () => {
    let probeCalls = 0;
    const probe = async (): Promise<AutoplayControlResponse | null> => {
      probeCalls += 1;
      return null;
    };
    const delay = async (): Promise<void> => undefined;

    const result = await resolveAutoplayGating('match-1', probe, delay);
    assert.equal(result, null);
    assert.equal(probeCalls, 2);
  });

  test('a first-probe throw propagates (NOT swallowed into null) with no retry', async () => {
    let probeCalls = 0;
    const probe = async (): Promise<AutoplayControlResponse | null> => {
      probeCalls += 1;
      throw new Error('HTTP 500 fault');
    };
    const delay = async (): Promise<void> => undefined;

    await assert.rejects(() => resolveAutoplayGating('match-1', probe, delay), {
      message: /HTTP 500 fault/,
    });
    assert.equal(probeCalls, 1);
  });
});
