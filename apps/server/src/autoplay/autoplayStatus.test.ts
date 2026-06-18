/**
 * Tests for the autoplay status endpoint handler (WP-165 / EC-182).
 *
 * Covers the read-only `GET /api/match/autoplay/:matchId/status` handler:
 * the 200 metadata envelope (no `uiState`), the 404 not-found envelope on an
 * unknown match id, the no-mutation invariant (a status call never changes
 * controller state), the pause/step-back/resume reflections, and the
 * match-end lifecycle (a controller removed from the map returns 404).
 *
 * Run by the server test runner: `node --import tsx --test src/**\/*.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlaybackController } from './playbackController.mjs';
import {
  autoplayControllers,
  handleAutoplayStatusRequest,
} from './autoplay.mjs';

/**
 * Builds a marker snapshot for a given turn index.
 */
function snap(turnIndex: number) {
  return {
    G: { marker: turnIndex },
    ctx: { phase: 'play', turn: turnIndex, currentPlayer: '0' },
  };
}

/**
 * Builds a minimal fake koa request context carrying only the fields the
 * status handler reads (`params.matchId`) and writes (`status`, `body`).
 */
function makeContext(matchId: string) {
  return {
    params: { matchId },
    status: undefined as number | undefined,
    body: undefined as unknown,
  };
}

test('200 returns the metadata envelope with mode and no uiState', async () => {
  const matchId = 'status-200';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  autoplayControllers.set(matchId, controller);

  const koaContext = makeContext(matchId);
  await handleAutoplayStatusRequest(koaContext);

  const body = koaContext.body as Record<string, unknown>;
  // why: handlePlaybackRequest leaves status unset on the success path, so koa
  // defaults to 200; only the 404/500 branches assign an explicit status.
  assert.equal(koaContext.status, undefined);
  assert.equal(body.ok, true);
  assert.equal(body.paused, false);
  assert.equal(body.historyLength, 1);
  assert.equal(body.cursor, 0);
  assert.equal(body.mode, 'live');
  assert.equal('uiState' in body, false);

  autoplayControllers.delete(matchId);
});

test('404 returns the not-found envelope on an unknown match id', async () => {
  const koaContext = makeContext('does-not-exist');
  await handleAutoplayStatusRequest(koaContext);

  assert.equal(koaContext.status, 404);
  assert.deepEqual(koaContext.body, {
    ok: false,
    paused: false,
    historyLength: 0,
    cursor: -1,
    mode: 'live',
    speedMode: '1x',
    gameOver: false,
    aborted: false,
    error: 'No autoplay match is running for the requested match id.',
  });
});

test('a status call never mutates controller state', async () => {
  const matchId = 'status-readonly';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.pause();
  controller.stepBack();
  autoplayControllers.set(matchId, controller);

  const before = {
    cursor: controller.getCursor(),
    paused: controller.isPaused(),
    historyLength: controller.getHistoryLength(),
    activeDelay: controller.getActiveDelay(),
    mode: controller.getMode(),
  };

  await handleAutoplayStatusRequest(makeContext(matchId));

  assert.equal(controller.getCursor(), before.cursor);
  assert.equal(controller.isPaused(), before.paused);
  assert.equal(controller.getHistoryLength(), before.historyLength);
  assert.equal(controller.getActiveDelay(), before.activeDelay);
  assert.equal(controller.getMode(), before.mode);

  autoplayControllers.delete(matchId);
});

test('status reflects a paused controller', async () => {
  const matchId = 'status-paused';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.pause();
  autoplayControllers.set(matchId, controller);

  const koaContext = makeContext(matchId);
  await handleAutoplayStatusRequest(koaContext);

  const body = koaContext.body as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.paused, true);
  assert.equal(body.mode, 'paused');

  autoplayControllers.delete(matchId);
});

test('status after stepBack reports a rewound, paused cursor', async () => {
  const matchId = 'status-rewound';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.pushState(snap(2));
  controller.pause();
  controller.stepBack();
  autoplayControllers.set(matchId, controller);

  const koaContext = makeContext(matchId);
  await handleAutoplayStatusRequest(koaContext);

  const body = koaContext.body as Record<string, number | boolean>;
  assert.equal(body.paused, true);
  // why: rewound-ness is the client-derived predicate cursor < historyLength-1
  // (WP-164); the server only reports the cursor / historyLength it observed.
  assert.equal((body.cursor as number) < (body.historyLength as number) - 1, true);

  autoplayControllers.delete(matchId);
});

test('status after resume reports live mode', async () => {
  const matchId = 'status-resumed';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.pause();
  controller.resume();
  autoplayControllers.set(matchId, controller);

  const koaContext = makeContext(matchId);
  await handleAutoplayStatusRequest(koaContext);

  const body = koaContext.body as Record<string, unknown>;
  assert.equal(body.paused, false);
  assert.equal(body.mode, 'live');

  autoplayControllers.delete(matchId);
});

test('a controller removed at match end returns 404 (D-16308)', async () => {
  const matchId = 'status-lifecycle';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  autoplayControllers.set(matchId, controller);

  const live = makeContext(matchId);
  await handleAutoplayStatusRequest(live);
  assert.equal((live.body as Record<string, unknown>).ok, true);

  // Match end tears the controller down (D-16308); status now 404s.
  autoplayControllers.delete(matchId);

  const ended = makeContext(matchId);
  await handleAutoplayStatusRequest(ended);
  assert.equal(ended.status, 404);
  assert.equal((ended.body as Record<string, unknown>).ok, false);
});

test('a healthy status envelope carries aborted:false and no abortReason key (D-24037)', async () => {
  const matchId = 'status-healthy-abort-field';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  autoplayControllers.set(matchId, controller);

  const koaContext = makeContext(matchId);
  await handleAutoplayStatusRequest(koaContext);

  const body = koaContext.body as Record<string, unknown>;
  assert.equal(body.aborted, false);
  // why: abortReason is an own key only when aborted; healthy envelopes omit it.
  assert.equal(Object.hasOwn(body, 'abortReason'), false);

  autoplayControllers.delete(matchId);
});

test('an aborted-but-registered controller returns 200 with aborted:true + abortReason, not 404 (D-24037)', async () => {
  const matchId = 'status-aborted';
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  // The bot loop marked the match aborted (e.g., the match state vanished); the
  // controller stays registered for the review window instead of being deleted.
  controller.markAborted('The bot loop stopped: the match state was no longer available.');
  autoplayControllers.set(matchId, controller);

  const koaContext = makeContext(matchId);
  await handleAutoplayStatusRequest(koaContext);

  // why: D-24037 — the whole point of the WP: a stopped bot match is OBSERVABLE
  // (200 + aborted) instead of a silent 404 / frozen board.
  assert.equal(koaContext.status, undefined);
  const body = koaContext.body as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.aborted, true);
  assert.equal(body.abortReason, 'The bot loop stopped: the match state was no longer available.');
  assert.equal(body.gameOver, false);

  autoplayControllers.delete(matchId);
});
