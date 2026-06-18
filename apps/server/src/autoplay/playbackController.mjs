/**
 * Playback controller — per-match, in-process state machine for the autoplay
 * "Watch Bot Play" media-player controls (WP-163).
 *
 * A controller holds a cursor-based history of derived snapshots and a pause
 * gate that the bot loop awaits between real moves. Rewinds move the cursor
 * over already-captured history and are visual only — they never mutate
 * authoritative game state, and the buffer is never persisted (Class 1
 * Runtime State, D-16306). This is a pure helper: no game-framework import,
 * no Math.random(), no I/O.
 *
 * Authority: WP-163, EC-180, D-16301..D-16309.
 */

/**
 * Maximum number of snapshots retained per match. Oldest entries are dropped
 * once the buffer is full.
 *
 * // why: D-16302 locks the history cap at 100 — enough for a viewer to scrub
 * a meaningful window without growing the per-match buffer without bound.
 */
const MAX_HISTORY = 100;

/**
 * Inter-move delay (milliseconds) used after a go-to-end fast-forward.
 *
 * // why: D-16307 — a viewer who fast-forwards wants the action to catch up
 * quickly; 10 ms drains the gap while still yielding to the event loop so the
 * Socket.IO broadcast keeps flowing. resume() restores the configured cadence.
 */
const PLAYBACK_DELAY_OVERRIDE = 10;

/**
 * @typedef {object} PlaybackStateSnapshot
 * @property {unknown} G - The engine game state at capture (runtime-only, never persisted).
 * @property {{ phase: string, turn: number, currentPlayer: string }} ctx - Minimal context for buildUIState.
 */

/**
 * @typedef {{ type: 'cursor', snapshot: PlaybackStateSnapshot } | { type: 'live-move' }} StepForwardResult
 */

/**
 * Creates a playback controller bound to a single autoplay match.
 *
 * @param {number} baseDelay - The match's configured inter-move delay (ms).
 * @returns {object} The controller with pause/step/accessor methods.
 */
export function createPlaybackController(baseDelay) {
  /** @type {PlaybackStateSnapshot[]} */
  const stateHistory = [];
  let cursor = -1;
  let isPausedFlag = false;
  /** @type {null | (() => void)} */
  let resumeResolver = null;
  let activeDelay = baseDelay;
  let speedMode = '1x';
  let isGameOverFlag = false;
  let isAbortedFlag = false;
  /** @type {string | null} */
  let abortReason = null;

  const SPEED_FACTORS = { '1x': 1, '2x': 2, '4x': 4 };

  /**
   * Releases the bot loop's pending pause gate, if one is waiting.
   *
   * @returns {void}
   */
  function releasePending() {
    if (resumeResolver !== null) {
      const resolve = resumeResolver;
      resumeResolver = null;
      resolve();
    }
  }

  return {
    /**
     * Appends a snapshot and resets the cursor to the live edge.
     *
     * // why: D-16302 caps history at MAX_HISTORY. D-16301 — every real-move
     * boundary calls pushState, which forces the cursor back to the live edge,
     * so a stale rewound cursor can never persist across a real move (the live
     * broadcast always wins). Rewind methods move the cursor backward; this is
     * the one site that drives it forward to the live edge.
     *
     * @param {PlaybackStateSnapshot} snapshot - The snapshot to record.
     * @returns {void}
     */
    pushState(snapshot) {
      stateHistory.push(snapshot);
      if (stateHistory.length > MAX_HISTORY) {
        stateHistory.shift();
      }
      cursor = stateHistory.length - 1;
    },

    /**
     * Resolves immediately when not paused; otherwise returns a Promise that
     * resolves when the loop is resumed or single-stepped.
     *
     * // why: D-16309 — single-consumer / last-write-wins. The bot loop is the
     * only caller, so at most one resolver is ever outstanding; a second
     * concurrent call simply overwrites the resolver (last-write-wins) rather
     * than queueing. No mutex is needed for a single-writer loop.
     *
     * @returns {Promise<void>}
     */
    waitIfPaused() {
      if (!isPausedFlag) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        resumeResolver = resolve;
      });
    },

    /**
     * Gates the bot loop at the next move boundary.
     *
     * @returns {void}
     */
    pause() {
      isPausedFlag = true;
    },

    /**
     * Releases the gate, restores speed-appropriate cadence, and lets the loop run.
     *
     * @returns {void}
     */
    resume() {
      isPausedFlag = false;
      // why: 'max' is transient (go-to-end only); resume always restores the
      // user's chosen speed mode. If speed was 'max', reset to '1x'.
      if (speedMode === 'max') {
        speedMode = '1x';
      }
      const factor = SPEED_FACTORS[speedMode] ?? 1;
      activeDelay = Math.max(10, Math.round(baseDelay / factor));
      releasePending();
    },

    /**
     * Advances one step. When the cursor is behind the live edge, advances the
     * cursor and returns that snapshot. When the cursor is at the live edge,
     * releases the gate for exactly one real move.
     *
     * // why: D-16302 — the discriminated union separates "advance the view
     * over captured history" from "let the bot make one real move." The
     * 'live-move' branch only releases the gate; it never calls submitMove
     * itself (the bot loop does that when it unblocks). The controller stays
     * paused after a live-move, so the loop re-gates after one move.
     *
     * @returns {StepForwardResult}
     */
    stepForward() {
      if (cursor < stateHistory.length - 1) {
        cursor += 1;
        return { type: 'cursor', snapshot: stateHistory[cursor] };
      }
      releasePending();
      return { type: 'live-move' };
    },

    /**
     * Moves the cursor back one snapshot.
     *
     * @returns {PlaybackStateSnapshot | null} The snapshot at the new cursor,
     *   or null when already at the first captured state.
     */
    stepBack() {
      if (cursor <= 0) {
        return null;
      }
      cursor -= 1;
      return stateHistory[cursor];
    },

    /**
     * Jumps the cursor to the first captured snapshot.
     *
     * @returns {PlaybackStateSnapshot | null} The first snapshot, or null when
     *   history is empty.
     */
    restart() {
      if (stateHistory.length === 0) {
        return null;
      }
      cursor = 0;
      return stateHistory[cursor];
    },

    /**
     * Jumps the cursor to the live edge, resumes the loop, and switches to the
     * fast-forward delay.
     *
     * // why: D-16307 — go-to-end resumes playback at PLAYBACK_DELAY_OVERRIDE
     * so a viewer who scrubbed back catches up to the live action quickly.
     *
     * @returns {void}
     */
    goToEnd() {
      cursor = stateHistory.length - 1;
      speedMode = 'max';
      activeDelay = PLAYBACK_DELAY_OVERRIDE;
      isPausedFlag = false;
      releasePending();
    },

    /**
     * @returns {number} The current cursor index (-1 when history is empty).
     */
    getCursor() {
      return cursor;
    },

    /**
     * @returns {'live' | 'paused'} The playback mode.
     */
    getMode() {
      return isPausedFlag ? 'paused' : 'live';
    },

    /**
     * @returns {number} The number of captured snapshots.
     */
    getHistoryLength() {
      return stateHistory.length;
    },

    /**
     * @returns {boolean} Whether the loop is currently gated.
     */
    isPaused() {
      return isPausedFlag;
    },

    /**
     * @returns {number} The delay (ms) the bot loop should wait between moves.
     */
    getActiveDelay() {
      return activeDelay;
    },

    /**
     * Sets the playback speed mode and adjusts activeDelay accordingly.
     *
     * @param {'1x' | '2x' | '4x'} mode
     * @returns {void}
     */
    setSpeedMode(mode) {
      const factor = SPEED_FACTORS[mode];
      if (factor === undefined) return;
      speedMode = mode;
      activeDelay = Math.max(10, Math.round(baseDelay / factor));
    },

    /**
     * Forces maximum speed (used by goToEnd).
     *
     * @returns {void}
     */
    setMaxSpeed() {
      speedMode = 'max';
      activeDelay = PLAYBACK_DELAY_OVERRIDE;
    },

    /**
     * @returns {'1x' | '2x' | '4x' | 'max'} The stored speed mode.
     */
    getSpeedMode() {
      return speedMode;
    },

    /**
     * Marks the match as complete. Pauses the controller so scrub operations work.
     *
     * @returns {void}
     */
    markGameOver() {
      isGameOverFlag = true;
      isPausedFlag = true;
    },

    /**
     * @returns {boolean} Whether the match has ended.
     */
    isGameOver() {
      return isGameOverFlag;
    },

    /**
     * Marks the match as abnormally stopped (a crash, a vanished match store,
     * or a non-advancing stage) with a public-safe reason. Pauses the
     * controller so scrub operations keep working during the review window.
     *
     * // why: D-24037 — an abort is NOT a natural game over; it is a distinct
     * terminal flag carrying its own public-safe reason, so a frozen bot match
     * surfaces observably instead of silently. It pauses (like markGameOver)
     * for scrub consistency, but never sets isGameOverFlag. Terminal: once
     * aborted the controller is not re-marked, so the first detected cause wins.
     *
     * @param {string} reason - A public-safe full-sentence abort reason.
     * @returns {void}
     */
    markAborted(reason) {
      if (isAbortedFlag) {
        return;
      }
      isAbortedFlag = true;
      abortReason = reason;
      isPausedFlag = true;
    },

    /**
     * @returns {boolean} Whether the match stopped abnormally.
     */
    isAborted() {
      return isAbortedFlag;
    },

    /**
     * @returns {string | null} The public-safe abort reason, or null when the
     *   match has not aborted.
     */
    getAbortReason() {
      return abortReason;
    },
  };
}
