import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ref, nextTick } from 'vue';
import type { UIState } from '@legendary-arena/game-engine';
import {
  useNotableEventStream,
  eventCardId,
  type NotableGameEvent,
} from './useNotableEventStream';

/**
 * Fabricates a minimal UIState carrying the supplied `notableEvents`.
 * The composable only reads `next.notableEvents`; the remaining UIState
 * fields are unused at runtime and shaped via a focused cast so test
 * scaffolding stays compact.
 */
function uiStateWith(notableEvents: NotableGameEvent[]): UIState {
  return { notableEvents } as unknown as UIState;
}

function fightEvent(cardId: string, narrative = `Fought "${cardId}".`): NotableGameEvent {
  return {
    type: 'fightResolved',
    playerId: '0',
    cardId,
    citySpace: 0,
    bystandersRescued: 0,
    appliedEffects: [],
    narrative,
  };
}

function ambushEvent(revealedCardId: string): NotableGameEvent {
  return {
    type: 'ambushResolved',
    revealedCardId,
    citySpace: 1,
    appliedEffects: ['gainWoundCurrentPlayer'],
    narrative: `"${revealedCardId}" ambushed: the active player gained a wound.`,
  };
}

function twistEvent(twistCardId: string): NotableGameEvent {
  return {
    type: 'schemeTwistResolved',
    twistCardId,
    resolverKey: 'woundAll',
    narrative: `Scheme Twist "${twistCardId}": every player gained wounds.`,
  };
}

function strikeEvent(strikeCardId: string): NotableGameEvent {
  return {
    type: 'mastermindStrikeResolved',
    strikeCardId,
    narrative: `Master Strike: "${strikeCardId}" resolved.`,
  };
}

describe('eventCardId helper (WP-201 / D-20104)', () => {
  test('resolves cardId for fightResolved variant', () => {
    assert.equal(eventCardId(fightEvent('doom-bot')), 'doom-bot');
  });

  test('resolves revealedCardId for ambushResolved variant', () => {
    assert.equal(eventCardId(ambushEvent('hand-ninja')), 'hand-ninja');
  });

  test('resolves twistCardId for schemeTwistResolved variant', () => {
    assert.equal(eventCardId(twistEvent('scheme-twist-01')), 'scheme-twist-01');
  });

  test('resolves strikeCardId for mastermindStrikeResolved variant', () => {
    assert.equal(eventCardId(strikeEvent('master-strike-03')), 'master-strike-03');
  });
});

describe('useNotableEventStream — safe-skip branches (WP-201 §AC)', () => {
  test('null snapshot leaves currentEvent null with no throw', async () => {
    const snapshot = ref<UIState | null>(null);
    const { currentEvent } = useNotableEventStream(snapshot);
    await nextTick();
    assert.equal(currentEvent.value, null);
  });

  test('undefined notableEvents leaves currentEvent null with no throw', async () => {
    const snapshot = ref<UIState | null>(
      { notableEvents: undefined } as unknown as UIState,
    );
    const { currentEvent } = useNotableEventStream(snapshot);
    await nextTick();
    assert.equal(currentEvent.value, null);
  });
});

describe('useNotableEventStream — diff detection across frames (WP-201 §AC)', () => {
  test('a new event arriving after the initial caught-up frame is emitted', async () => {
    const snapshot = ref<UIState | null>(uiStateWith([]));
    const { currentEvent } = useNotableEventStream(snapshot);
    await nextTick();
    assert.equal(currentEvent.value, null);

    snapshot.value = uiStateWith([fightEvent('thug')]);
    await nextTick();
    assert.notEqual(currentEvent.value, null);
    // why: vue-tsc narrows .value to never after assert.equal(x, null) + assert.notEqual(x, null) assertion pair
    assert.equal((currentEvent.value as NotableGameEvent | null)?.type, 'fightResolved');
    assert.equal(eventCardId(currentEvent.value!), 'thug');
  });

  test('emits a single event when only one new event arrives', async () => {
    const snapshot = ref<UIState | null>(uiStateWith([]));
    const { currentEvent } = useNotableEventStream(snapshot);
    await nextTick();

    snapshot.value = uiStateWith([twistEvent('scheme-twist-aa')]);
    await nextTick();
    assert.equal(currentEvent.value?.type, 'schemeTwistResolved');
  });
});

describe('useNotableEventStream — multi-event index-order invariant (WP-201 §AC)', () => {
  test('3 events pushed in a single frame display in notableEvents array order', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const { currentEvent, dismiss } = useNotableEventStream(snapshot);
      await nextTick();

      const events: NotableGameEvent[] = [
        fightEvent('alpha'),
        ambushEvent('beta'),
        twistEvent('gamma'),
      ];
      snapshot.value = uiStateWith(events);
      await nextTick();

      // First event in array order is now current.
      assert.equal(currentEvent.value?.type, 'fightResolved');
      assert.equal(eventCardId(currentEvent.value!), 'alpha');

      // Advance via the auto-dismiss timer.
      mock.timers.tick(2500);
      assert.equal(currentEvent.value?.type, 'ambushResolved');
      assert.equal(eventCardId(currentEvent.value!), 'beta');

      // Auto-dismiss timer again advances to the third event.
      mock.timers.tick(2500);
      // why: vue-tsc narrows .value?.type to never after sequential assert.equal assertion signatures compound
      assert.equal((currentEvent.value as NotableGameEvent | null)?.type, 'schemeTwistResolved');
      assert.equal(eventCardId(currentEvent.value!), 'gamma');

      // Final timer fire empties the queue.
      mock.timers.tick(2500);
      assert.equal(currentEvent.value, null);

      // dismiss() on an empty queue is a no-op (covers idempotency).
      dismiss();
      assert.equal(currentEvent.value, null);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('useNotableEventStream — snapshot-gap recovery (WP-201 §AC)', () => {
  test('frame 1 → frame 3 with the intermediate frame skipped enqueues every unseen event', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const { currentEvent } = useNotableEventStream(snapshot);
      await nextTick();

      // Frame 2 (skipped — composable never sees this length=1 reference).
      // Frame 3: length jumps to 2; composable observes only this transition.
      snapshot.value = uiStateWith([fightEvent('frame-2-event'), ambushEvent('frame-3-event')]);
      await nextTick();

      // Both events MUST be enqueued in array order; gap loses nothing.
      assert.equal(eventCardId(currentEvent.value!), 'frame-2-event');
      mock.timers.tick(2500);
      assert.equal(eventCardId(currentEvent.value!), 'frame-3-event');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('useNotableEventStream — no re-emission after consume (WP-201 §AC)', () => {
  test('a new composable instance against the same snapshot ref does not re-emit consumed events', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const first = useNotableEventStream(snapshot);
      await nextTick();

      snapshot.value = uiStateWith([fightEvent('consumed-by-first')]);
      await nextTick();
      assert.equal(eventCardId(first.currentEvent.value!), 'consumed-by-first');

      // Consume the event — cursor advances past index 0.
      first.dismiss();
      assert.equal(first.currentEvent.value, null);

      // Simulate component remount: a fresh composable instance against the
      // same snapshot ref whose `notableEvents` still carries index 0.
      const second = useNotableEventStream(snapshot);
      await nextTick();
      assert.equal(
        second.currentEvent.value,
        null,
        'remounted composable must NOT re-emit a consumed event',
      );

      // A genuinely new event after the remount IS emitted by the second
      // instance (index >= the caught-up cursor of the remount).
      snapshot.value = uiStateWith([
        fightEvent('consumed-by-first'),
        ambushEvent('seen-by-second'),
      ]);
      await nextTick();
      assert.equal(eventCardId(second.currentEvent.value!), 'seen-by-second');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('useNotableEventStream — dismiss() advances queue (WP-201 §AC)', () => {
  test('dismiss() immediately advances to the next queued event', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const { currentEvent, dismiss } = useNotableEventStream(snapshot);
      await nextTick();

      snapshot.value = uiStateWith([fightEvent('first'), fightEvent('second')]);
      await nextTick();
      assert.equal(eventCardId(currentEvent.value!), 'first');

      dismiss();
      assert.equal(eventCardId(currentEvent.value!), 'second');
    } finally {
      mock.timers.reset();
    }
  });

  test('dismiss() on the final event sets currentEvent to null', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const { currentEvent, dismiss } = useNotableEventStream(snapshot);
      await nextTick();

      snapshot.value = uiStateWith([strikeEvent('master-strike-01')]);
      await nextTick();

      dismiss();
      assert.equal(currentEvent.value, null);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('useNotableEventStream — single-timer invariant (WP-201 §AC)', () => {
  test('manual dismiss() mid-timer yields a full fresh duration for the next event', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const { currentEvent, dismiss } = useNotableEventStream(snapshot);
      await nextTick();

      snapshot.value = uiStateWith([fightEvent('first'), fightEvent('second')]);
      await nextTick();
      assert.equal(eventCardId(currentEvent.value!), 'first');

      // Burn part of the auto-dismiss budget on the first event, then
      // manually advance. The second event MUST receive a full fresh
      // AUTO_DISMISS_MS window (2500ms) — not the 500ms remainder.
      mock.timers.tick(2000);
      dismiss();
      assert.equal(eventCardId(currentEvent.value!), 'second');

      // After 2000ms (the would-be remainder), the second event is still
      // current — the timer was reset to the full 2500ms.
      mock.timers.tick(2000);
      assert.equal(eventCardId(currentEvent.value!), 'second');

      // The remaining 500ms of the fresh timer fires now.
      mock.timers.tick(500);
      assert.equal(currentEvent.value, null);
    } finally {
      mock.timers.reset();
    }
  });

  test('rapid back-to-back dismiss() calls advance one event per call without overlapping timers', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const snapshot = ref<UIState | null>(uiStateWith([]));
      const { currentEvent, dismiss } = useNotableEventStream(snapshot);
      await nextTick();

      snapshot.value = uiStateWith([
        fightEvent('a'),
        fightEvent('b'),
        fightEvent('c'),
      ]);
      await nextTick();
      assert.equal(eventCardId(currentEvent.value!), 'a');

      dismiss();
      assert.equal(eventCardId(currentEvent.value!), 'b');
      dismiss();
      assert.equal(eventCardId(currentEvent.value!), 'c');
      dismiss();
      assert.equal(currentEvent.value, null);

      // No stale timer can fire after the queue drains.
      mock.timers.tick(10000);
      assert.equal(currentEvent.value, null);
    } finally {
      mock.timers.reset();
    }
  });
});
