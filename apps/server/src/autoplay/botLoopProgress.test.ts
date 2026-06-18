/**
 * Tests for the autoplay bot-loop progress helpers (WP-261 / EC-292).
 *
 * Covers the pure decision helpers in isolation: parked-choice detection,
 * the state-advanced predicate, and the public-safe abort-reason builder.
 * This suite must NOT pull a game-framework import into its graph — the
 * helpers are pure (no engine, no Master harness), and EC-292 verifies that
 * `botLoopProgress.mjs` carries no game-framework token.
 *
 * Run by the server test runner: `node --import tsx --test src/**\/*.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ABORT_REASONS,
  findPendingChoiceMove,
  hasProgressed,
  classifyDispatch,
  buildAbortReason,
} from './botLoopProgress.mjs';

test('findPendingChoiceMove returns the resolveKoHeroChoice short-circuit', () => {
  const parked = [{ name: 'resolveKoHeroChoice', args: { zone: 'discard', index: 0 } }];
  const found = findPendingChoiceMove(parked);
  assert.deepEqual(found, { name: 'resolveKoHeroChoice', args: { zone: 'discard', index: 0 } });
});

test('findPendingChoiceMove returns the resolveOptionalKoReward short-circuit', () => {
  const parked = [{ name: 'resolveOptionalKoReward', args: { zone: 'hand', index: 2 } }];
  const found = findPendingChoiceMove(parked);
  assert.deepEqual(found, { name: 'resolveOptionalKoReward', args: { zone: 'hand', index: 2 } });
});

test('findPendingChoiceMove returns null when no parked choice is present', () => {
  const normalMain = [
    { name: 'playCard', args: { cardId: 'core-shield-agent' } },
    { name: 'recruitHero', args: { hqIndex: 0 } },
    { name: 'advanceStage', args: {} },
  ];
  assert.equal(findPendingChoiceMove(normalMain), null);
});

test('findPendingChoiceMove returns null on an empty legal-move list', () => {
  assert.equal(findPendingChoiceMove([]), null);
});

test('findPendingChoiceMove tolerates a non-array input', () => {
  // why: defensive — getLegalMoves always returns an array, but the pure
  // helper must not throw if handed a degenerate value.
  assert.equal(findPendingChoiceMove(undefined as unknown as []), null);
  assert.equal(findPendingChoiceMove(null as unknown as []), null);
});

test('hasProgressed is false when the _stateID is unchanged', () => {
  assert.equal(hasProgressed(7, 7), false);
  assert.equal(hasProgressed('abc', 'abc'), false);
});

test('hasProgressed is true when the _stateID changed', () => {
  assert.equal(hasProgressed(7, 8), true);
  assert.equal(hasProgressed('abc', 'abd'), true);
});

test('buildAbortReason maps each category to its locked public-safe sentence', () => {
  assert.equal(buildAbortReason('unexpected-error'), ABORT_REASONS.unexpectedError);
  assert.equal(buildAbortReason('match-state-unavailable'), ABORT_REASONS.matchStateUnavailable);
  assert.equal(buildAbortReason('stage-did-not-advance'), ABORT_REASONS.stageDidNotAdvance);
  assert.equal(buildAbortReason('no-legal-move'), ABORT_REASONS.noLegalMove);
});

test('buildAbortReason emits full sentences for every category', () => {
  for (const category of [
    'unexpected-error',
    'match-state-unavailable',
    'stage-did-not-advance',
    'no-legal-move',
  ] as const) {
    const reason = buildAbortReason(category);
    // why: code-style rule — abort reasons are full sentences (capitalized,
    // terminal period), so the client banner reads cleanly.
    assert.match(reason, /^[A-Z].*\.$/);
  }
});

test('buildAbortReason falls back to the generic server-error sentence', () => {
  // why: an unrecognized category must never surface raw detail through the
  // guest envelope; it collapses to the vetted unexpected-error sentence.
  assert.equal(buildAbortReason('totally-unknown' as never), ABORT_REASONS.unexpectedError);
});

test('classifyDispatch reports vanished when the post-dispatch state is missing', () => {
  // why: D-24038 — a missing/null post-dispatch state (the match store was
  // wiped) must abort, NOT be treated as a clean break.
  assert.equal(classifyDispatch(5, null), 'vanished');
  assert.equal(classifyDispatch(5, undefined), 'vanished');
});

test('classifyDispatch reports game-over on a natural terminal state', () => {
  // why: a natural game over exits through the normal path, never an abort.
  const ended = { ctx: { gameover: { winner: 'players' } }, _stateID: 6 };
  assert.equal(classifyDispatch(5, ended), 'game-over');
});

test('classifyDispatch reports stalled when the _stateID did not change', () => {
  const unchanged = { ctx: {}, _stateID: 5 };
  assert.equal(classifyDispatch(5, unchanged), 'stalled');
});

test('classifyDispatch reports progressed when the _stateID advanced', () => {
  const advanced = { ctx: {}, _stateID: 6 };
  assert.equal(classifyDispatch(5, advanced), 'progressed');
});

test('classifyDispatch prefers game-over over a coincidentally-unchanged _stateID', () => {
  // why: gameover is checked before the progress comparison, so a terminal
  // state is never mislabeled stalled.
  const endedUnchanged = { ctx: { gameover: { winner: 'mastermind' } }, _stateID: 5 };
  assert.equal(classifyDispatch(5, endedUnchanged), 'game-over');
});

test('the public-safe abort reasons leak no raw exception detail', () => {
  // why: guest endpoint — assert the closed set carries no stack/error/path
  // markers that would indicate raw fault detail leaked into the envelope.
  for (const reason of Object.values(ABORT_REASONS)) {
    assert.doesNotMatch(reason, /Error:|stack|\/|\\|at\s|undefined|null/);
  }
});
