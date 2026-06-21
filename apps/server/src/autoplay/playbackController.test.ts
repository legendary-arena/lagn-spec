/**
 * Tests for the autoplay playback controller (WP-163 / EC-180).
 *
 * Covers the controller state machine in isolation plus the controller-map
 * lifecycle invariant (D-16308) and the always-present `mode` envelope field
 * (D-16304) via the autoplay wiring layer's exported seams.
 *
 * Run by the server test runner: `node --import tsx --test src/**\/*.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlaybackController } from './playbackController.mjs';
import {
  autoplayControllers,
  withRegisteredController,
  buildResponse,
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

test('pushState appends, advances cursor to the live edge, and caps history at 100', () => {
  const controller = createPlaybackController(100);
  assert.equal(controller.getHistoryLength(), 0);
  assert.equal(controller.getCursor(), -1);

  controller.pushState(snap(0));
  controller.pushState(snap(1));
  assert.equal(controller.getHistoryLength(), 2);
  assert.equal(controller.getCursor(), 1);

  for (let i = 2; i < 150; i += 1) {
    controller.pushState(snap(i));
  }
  // why: D-16302 caps at 100; oldest entries are dropped, cursor stays at edge.
  assert.equal(controller.getHistoryLength(), 100);
  assert.equal(controller.getCursor(), 99);
});

test('pushState resets a rewound cursor back to the live edge (D-16301)', () => {
  const controller = createPlaybackController(100);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.stepBack();
  assert.equal(controller.getCursor(), 0);

  // A real-move boundary pushes new state and forces the cursor forward.
  controller.pushState(snap(2));
  assert.equal(controller.getCursor(), 2);
});

test('pause / resume toggle mode and gate waitIfPaused', async () => {
  const controller = createPlaybackController(100);
  assert.equal(controller.getMode(), 'live');

  // Not paused: waitIfPaused resolves immediately.
  await controller.waitIfPaused();

  controller.pause();
  assert.equal(controller.isPaused(), true);
  assert.equal(controller.getMode(), 'paused');

  let released = false;
  const gate = controller.waitIfPaused().then(() => {
    released = true;
  });
  assert.equal(released, false);

  controller.resume();
  await gate;
  assert.equal(released, true);
  assert.equal(controller.getMode(), 'live');
});

test('stepBack walks the cursor and returns null at the first state', () => {
  const controller = createPlaybackController(100);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.pushState(snap(2));

  const back1 = controller.stepBack();
  assert.deepEqual(back1, snap(1));
  assert.equal(controller.getCursor(), 1);

  const back2 = controller.stepBack();
  assert.deepEqual(back2, snap(0));
  assert.equal(controller.getCursor(), 0);

  // why: cursor-boundary — step-back at cursor 0 returns null (handler maps 409).
  const back3 = controller.stepBack();
  assert.equal(back3, null);
  assert.equal(controller.getCursor(), 0);
});

test('restart jumps to the first snapshot; null on empty history', () => {
  const empty = createPlaybackController(100);
  assert.equal(empty.restart(), null);

  const controller = createPlaybackController(100);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.stepBack();
  const first = controller.restart();
  assert.deepEqual(first, snap(0));
  assert.equal(controller.getCursor(), 0);
});

test('stepForward returns a cursor snapshot when behind the live edge', () => {
  const controller = createPlaybackController(100);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.stepBack();
  assert.equal(controller.getCursor(), 0);

  const result = controller.stepForward();
  assert.deepEqual(result, { type: 'cursor', snapshot: snap(1) });
  assert.equal(controller.getCursor(), 1);
});

test('stepForward releases the gate for one move when at the live edge (D-16302)', async () => {
  const controller = createPlaybackController(100);
  controller.pushState(snap(0));
  controller.pause();

  let released = false;
  const gate = controller.waitIfPaused().then(() => {
    released = true;
  });

  const result = controller.stepForward();
  assert.deepEqual(result, { type: 'live-move' });
  await gate;
  assert.equal(released, true);
  // why: live-move releases the gate but the controller stays paused so the
  // loop re-gates after exactly one move.
  assert.equal(controller.isPaused(), true);
});

test('goToEnd resumes and fast-forwards; resume restores base delay (D-16307)', () => {
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.pushState(snap(1));
  controller.pause();
  controller.stepBack();
  assert.equal(controller.getActiveDelay(), 800);

  controller.goToEnd();
  assert.equal(controller.getActiveDelay(), 10);
  assert.equal(controller.getCursor(), 1);
  assert.equal(controller.isPaused(), false);

  controller.pause();
  controller.resume();
  assert.equal(controller.getActiveDelay(), 800);
});

test('buildResponse always carries mode (D-16304) and uiState only when supplied', () => {
  const controller = createPlaybackController(100);
  controller.pushState(snap(0));

  const plain = buildResponse(controller);
  assert.equal(plain.ok, true);
  assert.ok('mode' in plain);
  assert.equal(plain.mode, 'live');
  assert.equal('uiState' in plain, false);

  controller.pause();
  const withView = buildResponse(controller, { uiState: { stub: true } });
  assert.equal(withView.mode, 'paused');
  assert.deepEqual(withView.uiState, { stub: true });
});

test('normal exit defers cleanup + marks game over; abnormal exit marks aborted + defers, never deletes immediately (D-24037 / D-16308)', async () => {
  // Normal exit: the controller stays for the review window, marked game-over.
  const normalKey = 'normal-review';
  await withRegisteredController(normalKey, 100, async (controller) => {
    assert.equal(autoplayControllers.has(normalKey), true);
    controller.pushState(snap(0));
  });
  assert.equal(autoplayControllers.has(normalKey), true);
  const normalController = autoplayControllers.get(normalKey);
  assert.equal(normalController.isGameOver(), true);
  assert.equal(normalController.isAborted(), false);
  assert.equal(normalController.isPaused(), true);
  autoplayControllers.delete(normalKey);

  // Abnormal exit: the controller is marked aborted with a PUBLIC-SAFE reason
  // and stays in the map (deferred cleanup), so the client sees an explicit
  // stopped state instead of a frozen board / 404.
  const abortKey = 'throw-review';
  const rawFault = 'RAW_FAULT_TOKEN_should_not_leak';
  await assert.rejects(
    withRegisteredController(abortKey, 100, async () => {
      throw new Error(rawFault);
    }),
  );
  // why: D-24037 — no silent immediate delete; the aborted controller remains
  // registered synchronously after the body throws.
  assert.equal(autoplayControllers.has(abortKey), true);
  const abortedController = autoplayControllers.get(abortKey);
  assert.equal(abortedController.isAborted(), true);
  assert.equal(abortedController.isGameOver(), false);
  assert.equal(abortedController.isPaused(), true);

  // The guest-visible reason is a public-safe sentence; the raw thrown-error
  // token never reaches the controller or the response envelope.
  const reason = abortedController.getAbortReason();
  assert.equal(reason, 'The bot loop stopped after an unexpected server error.');
  assert.equal(reason.includes(rawFault), false);
  const body = buildResponse(abortedController);
  assert.equal(JSON.stringify(body).includes(rawFault), false);
  assert.equal(body.aborted, true);
  assert.equal(body.abortReason, 'The bot loop stopped after an unexpected server error.');

  autoplayControllers.delete(abortKey);
});

test('setSpeedMode halves delay at 2x, quarters at 4x, floors at 10ms', () => {
  const controller = createPlaybackController(800);

  controller.setSpeedMode('2x');
  assert.equal(controller.getActiveDelay(), 400);
  assert.equal(controller.getSpeedMode(), '2x');

  controller.setSpeedMode('4x');
  assert.equal(controller.getActiveDelay(), 200);
  assert.equal(controller.getSpeedMode(), '4x');

  // Floor at 10ms: baseDelay 40 / 4 = 10
  const fastController = createPlaybackController(40);
  fastController.setSpeedMode('4x');
  assert.equal(fastController.getActiveDelay(), 10);
});

test('setMaxSpeed yields delay=10 and speedMode=max', () => {
  const controller = createPlaybackController(800);
  controller.setMaxSpeed();
  assert.equal(controller.getActiveDelay(), 10);
  assert.equal(controller.getSpeedMode(), 'max');
});

test('resume resets max speed back to 1x; preserves user-set speed modes', () => {
  const controller = createPlaybackController(800);

  controller.setSpeedMode('2x');
  controller.pause();
  controller.resume();
  assert.equal(controller.getSpeedMode(), '2x');
  assert.equal(controller.getActiveDelay(), 400);

  // After goToEnd (which sets max), resume resets to 1x
  controller.pause();
  controller.goToEnd();
  assert.equal(controller.getSpeedMode(), 'max');
  controller.pause();
  controller.resume();
  assert.equal(controller.getSpeedMode(), '1x');
  assert.equal(controller.getActiveDelay(), 800);
});

test('pause does NOT reset speed mode', () => {
  const controller = createPlaybackController(800);
  controller.setSpeedMode('4x');
  controller.pause();
  assert.equal(controller.getSpeedMode(), '4x');
});

test('invalid speed mode is a no-op', () => {
  const controller = createPlaybackController(800);
  controller.setSpeedMode('invalid' as any);
  assert.equal(controller.getSpeedMode(), '1x');
  assert.equal(controller.getActiveDelay(), 800);
});

test('markGameOver sets both isGameOverFlag and isPausedFlag', () => {
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  assert.equal(controller.isGameOver(), false);
  assert.equal(controller.isPaused(), false);

  controller.markGameOver();
  assert.equal(controller.isGameOver(), true);
  assert.equal(controller.isPaused(), true);
});

test('buildResponse includes speedMode and gameOver fields', () => {
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.setSpeedMode('2x');

  const response = buildResponse(controller);
  assert.equal(response.speedMode, '2x');
  assert.equal(response.gameOver, false);

  controller.markGameOver();
  const gameOverResponse = buildResponse(controller);
  assert.equal(gameOverResponse.speedMode, '2x');
  assert.equal(gameOverResponse.gameOver, true);
});

test('markAborted sets a distinct terminal flag, pauses, and is not a game over (D-24037)', () => {
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  assert.equal(controller.isAborted(), false);
  assert.equal(controller.getAbortReason(), null);
  assert.equal(controller.isGameOver(), false);

  controller.markAborted('The bot loop stopped after an unexpected server error.');
  assert.equal(controller.isAborted(), true);
  assert.equal(controller.getAbortReason(), 'The bot loop stopped after an unexpected server error.');
  // why: D-24037 — an abort pauses (for scrub consistency) but is NOT a game
  // over; the two terminal flags are independent.
  assert.equal(controller.isPaused(), true);
  assert.equal(controller.isGameOver(), false);
});

test('markAborted is terminal — the first reason wins; later calls are no-ops (D-24037)', () => {
  const controller = createPlaybackController(800);
  controller.markAborted('The bot loop stopped: the match state was no longer available.');
  controller.markAborted('The bot loop stopped after an unexpected server error.');
  // why: D-24037 — once aborted the controller is not re-marked, so the first
  // detected cause is preserved.
  assert.equal(controller.getAbortReason(), 'The bot loop stopped: the match state was no longer available.');
});

test('buildResponse always carries aborted; abortReason is an own key only when aborted (D-24037)', () => {
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));

  const healthy = buildResponse(controller);
  assert.equal(healthy.aborted, false);
  // why: abortReason must be ABSENT as an own key (not merely undefined) on a
  // healthy envelope, so clients can gate on the key's presence.
  assert.equal(Object.hasOwn(healthy, 'abortReason'), false);

  controller.markAborted('The bot loop stopped: the start stage did not advance.');
  const aborted = buildResponse(controller);
  assert.equal(aborted.aborted, true);
  assert.equal(aborted.abortReason, 'The bot loop stopped: the start stage did not advance.');
});

test('a natural game over reports gameOver true, aborted false, and no abortReason key (D-24037)', () => {
  const controller = createPlaybackController(800);
  controller.pushState(snap(0));
  controller.markGameOver();
  const response = buildResponse(controller);
  assert.equal(response.gameOver, true);
  assert.equal(response.aborted, false);
  assert.equal(Object.hasOwn(response, 'abortReason'), false);
});
