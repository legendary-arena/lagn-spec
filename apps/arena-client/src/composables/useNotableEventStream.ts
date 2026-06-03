/**
 * Composable that consumes the structured `UIState.notableEvents` stream
 * shipped by WP-200 and surfaces one event at a time through a `currentEvent`
 * ref for the descriptive `NotableEventOverlay`.
 *
 * The engine is the single source of event truth (D-20002 + D-20105 — UI
 * does not interpret event semantics; this composable is a pure projection
 * consumer over the structured WP-200 stream).
 *
 * Contract (D-20104): FIFO queue of unseen events + consumption cursor.
 * No synthetic metadata (no client-side clocks, no client-generated IDs,
 * no wrapper interfaces). Event identity is the `notableEvents` array
 * index; the cursor advances on `dismiss()` or auto-dismiss.
 */

import { ref, watch, type Ref } from 'vue';
import type { UIState } from '@legendary-arena/game-engine';

/**
 * Structural alias for one notable game event variant from the WP-200
 * discriminated union (`fightResolved` / `ambushResolved` /
 * `schemeTwistResolved` / `mastermindStrikeResolved`). Derived from the
 * `UIState.notableEvents` array element type so the arena-client never
 * names the engine union directly — keeps the runtime-safe engine
 * surface (the `.` subpath) as the sole import surface and avoids a
 * fragile re-export contract from the engine barrel.
 */
export type NotableGameEvent = UIState['notableEvents'][number];

// why: 2.5s reading-room default — modestly longer than the pre-WP-201
// 2.0s window so players have time to read the engine-composed narrative
// without the overlay clearing mid-sentence. Locked per WP-201 §Scope
// (In) overlay durationMs default.
const AUTO_DISMISS_MS = 2500;

/**
 * Resolves the zone-instance ext_id for a notable game event by reading
 * the discriminator-appropriate id field.
 *
 * @param event - The notable event to resolve.
 * @returns The card ext_id carried by the event's variant-specific id field.
 */
// why: centralised per-variant id resolution (D-20104) — overlay template,
// tests, and any future consumer share one source of truth. Without this,
// inline ternaries (`event.cardId ?? event.revealedCardId ?? ...`) drift
// across the four sites that need the id. The overlay template grep gate
// asserts zero inline ternaries; this helper is the only authorised path.
export function eventCardId(event: NotableGameEvent): string {
  if (event.type === 'fightResolved') return event.cardId;
  if (event.type === 'ambushResolved') return event.revealedCardId;
  if (event.type === 'schemeTwistResolved') return event.twistCardId;
  return event.strikeCardId;
}

/**
 * Public composable return shape — exposed as a named interface so test
 * fixtures and the overlay consumer can spell the type without
 * `ReturnType<typeof useNotableEventStream>` ergonomics.
 */
export interface NotableEventStream {
  /** The notable event currently displayed, or `null` when idle. */
  currentEvent: Ref<NotableGameEvent | null>;
  /** Advances the queue past the current event immediately. */
  dismiss(): void;
}

/**
 * Watches a UIState snapshot ref and yields notable events one at a time
 * via a FIFO queue, advancing on auto-dismiss timer or manual `dismiss()`.
 *
 * Signature is LOCKED per WP-201 §Scope (In) — `(snapshot) => { currentEvent,
 * dismiss }`. No additional parameters, no `durationMs` argument.
 *
 * @param snapshot - The arena-client UIState snapshot ref.
 * @returns Reactive `currentEvent` plus the `dismiss()` queue advancer.
 */
export function useNotableEventStream(
  snapshot: Ref<UIState | null>,
): NotableEventStream {
  const currentEvent = ref<NotableGameEvent | null>(null);

  // why: FIFO queue + consumption cursor is the load-bearing re-emission
  // gate (D-20104). Length-diff alone is INSUFFICIENT — it fails on
  // component remount, snapshot reactivity reset, and wholesale snapshot
  // reference replacement. The cursor tracks the first `notableEvents`
  // array index this composable has not yet ingested; events with
  // `index < cursor` MUST NOT re-emit under any condition.
  let cursor = 0;
  let caughtUp = false;
  const queue: NotableGameEvent[] = [];
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timerHandle !== null) {
      clearTimeout(timerHandle);
      timerHandle = null;
    }
  }

  // why: single-timer invariant (D-20104). Mounting a new event MUST
  // clear any existing timer before starting a new one — never two
  // timers in flight, regardless of how the previous event ended
  // (manual dismiss or auto-fire). The clearTimer call is unconditional
  // so the next event always receives a full fresh AUTO_DISMISS_MS
  // window rather than the remainder of a prior timer.
  function startTimer(): void {
    clearTimer();
    timerHandle = setTimeout(() => {
      timerHandle = null;
      advance();
    }, AUTO_DISMISS_MS);
  }

  // why: dismiss() advance is immediate (queue progress invariant —
  // D-20104). Either the auto-dismiss timer fired or the consumer called
  // dismiss(); both routes funnel here so there is exactly one queue
  // progression code path.
  function advance(): void {
    clearTimer();
    const nextEvent = queue.shift();
    if (nextEvent !== undefined) {
      currentEvent.value = nextEvent;
      startTimer();
    } else {
      currentEvent.value = null;
    }
  }

  watch(
    snapshot,
    (next) => {
      // why: safe-skip on null snapshot OR undefined `notableEvents`.
      // Guards against the first-tick null frame (no match loaded yet)
      // AND an older engine bundle that predates WP-200's `notableEvents`
      // projection. No throw, no console warning, no internal state
      // change — `currentEvent.value` stays null and the cursor remains
      // un-caught-up so a subsequent valid frame can still initialise.
      if (next === null) return;
      const events = next.notableEvents;
      if (events === undefined) return;

      // why: catch up the cursor to the snapshot's current length on the
      // first valid frame. New composable instances mounted against an
      // already-populated snapshot MUST NOT replay consumed history (the
      // re-emission gate from D-20104 must survive component remount).
      // The engine's `notableEvents` array is strictly append-only
      // (D-20004), so cursor = current length is the safe high-water
      // mark for "everything previously visible has already been seen."
      if (!caughtUp) {
        cursor = events.length;
        caughtUp = true;
        return;
      }

      // why: sequential index-ordered enqueue across multi-event frames
      // AND snapshot gaps. When `notableEvents.length` grows by N (in
      // one frame or across skipped frames), all N unseen events MUST
      // enqueue in array order — no collapsing on chained reveals, no
      // dropping on snapshot gaps, no LIFO. The for-loop iterates
      // positionally to honour the engine's dispatch order (D-20003
      // appliedEffects ordering carries through here).
      for (let index = cursor; index < events.length; index += 1) {
        const nextEvent = events[index];
        if (nextEvent !== undefined) queue.push(nextEvent);
      }
      cursor = events.length;

      if (currentEvent.value === null && queue.length > 0) {
        advance();
      }
    },
    { immediate: true, deep: false },
  );

  function dismiss(): void {
    advance();
  }

  return { currentEvent, dismiss };
}
