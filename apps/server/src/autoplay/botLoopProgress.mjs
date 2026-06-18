/**
 * botLoopProgress — pure decision helpers for the autoplay bot loop's
 * abort / progress detection (WP-261 / EC-292).
 *
 * Extracted from autoplay.mjs so the loop's testable decisions — find the
 * parked choice to drain, decide whether a dispatch advanced the match, and
 * select the public-safe abort reason — can be unit-tested without the engine's
 * Master harness or any game-framework import. Pure: deterministic,
 * side-effect-free, no I/O, no randomness, no game-state mutation.
 *
 * Mirrors the EC-180 split that keeps playbackController.mjs framework-free.
 *
 * Authority: WP-261, EC-292, D-24037, D-24038.
 */

/**
 * Move names the engine's getLegalMoves returns as a parked-choice
 * short-circuit. When a KO-a-Hero (D-24009) or optional-KO-reward (D-24019)
 * choice is pending, the engine freezes every other move and returns EXACTLY
 * one of these — with its deterministic default-target args already filled —
 * regardless of the current turn stage. The bot loop must dispatch that resolve
 * move before any stage-specific fallback, in any stage.
 *
 * // why: closed set mirrored read-only from ai.legalMoves.ts; the engine owns
 * the parked-choice contract, so this is the consumer's view of it, not a
 * second source of truth.
 */
const PENDING_CHOICE_MOVE_NAMES = ['resolveKoHeroChoice', 'resolveOptionalKoReward'];

/**
 * The public-safe abort reasons surfaced on the guest-accessible playback
 * envelope. Full sentences (code-style rule); a closed set (EC-292 Locked
 * Values). Raw exception detail NEVER enters this set — it stays in the
 * server's console.error logging only.
 *
 * // why: the autoplay endpoints are Auth: guest, so abortReason must never
 * leak raw error.message, stack text, serialized errors, database errors,
 * request URLs, secrets, internal IDs, or infrastructure paths. These four
 * vetted sentences are the only values that may reach buildResponse (D-24037).
 */
export const ABORT_REASONS = Object.freeze({
  unexpectedError: 'The bot loop stopped after an unexpected server error.',
  matchStateUnavailable: 'The bot loop stopped: the match state was no longer available.',
  stageDidNotAdvance: 'The bot loop stopped: the start stage did not advance.',
  noLegalMove: 'The bot loop stopped: no legal move was available for the current stage.',
});

/**
 * Finds the parked-choice short-circuit move in a getLegalMoves result.
 *
 * Returns the resolve move (name plus its pre-filled default-target args) when
 * the legal-move list is a parked-choice short-circuit, so the loop can
 * dispatch it directly in any stage. Returns null when no parked choice is
 * present and the loop should fall back to its stage-specific move selection.
 *
 * @param {ReadonlyArray<{ name: string, args?: unknown }>} legalMoves - The
 *   getLegalMoves(G, ctx) result for the active player.
 * @returns {{ name: string, args?: unknown } | null} The parked resolve move,
 *   or null when none is pending.
 */
export function findPendingChoiceMove(legalMoves) {
  if (!Array.isArray(legalMoves)) {
    return null;
  }
  for (const legalMove of legalMoves) {
    if (legalMove !== null && legalMove !== undefined && PENDING_CHOICE_MOVE_NAMES.includes(legalMove.name)) {
      return legalMove;
    }
  }
  return null;
}

/**
 * Reports whether a stage-advancing dispatch made progress by comparing the
 * engine's _stateID before and after the dispatch. The bot loop captures the
 * pre-dispatch _stateID, re-fetches after dispatching a move expected to
 * advance, and aborts (rather than re-dispatching to the turn cap) when this
 * returns false.
 *
 * The vanished-match case (a missing or null post-dispatch state) and the
 * natural game-over case are classified by the loop before this is consulted;
 * this helper only answers the changed-vs-unchanged question for two
 * known-present states.
 *
 * @param {number | string} previousStateId - The _stateID before the dispatch.
 * @param {number | string} nextStateId - The _stateID after the dispatch.
 * @returns {boolean} true when the state advanced; false when it is unchanged.
 */
export function hasProgressed(previousStateId, nextStateId) {
  return previousStateId !== nextStateId;
}

/**
 * Classifies the outcome of a dispatch expected to advance the loop by
 * comparing the pre-dispatch _stateID with the re-fetched post-dispatch state.
 * Pure decision — the caller performs the I/O (dispatch + re-fetch) and the
 * abort / exit actions; this only decides which of the four outcomes occurred.
 *
 * - 'vanished' — the post-dispatch state is missing/null (the match store was
 *   wiped); the caller aborts with the match-state-unavailable reason.
 * - 'game-over' — a natural terminal state; the caller exits through the normal
 *   game-over path, NOT an abort.
 * - 'stalled' — the _stateID did not change; the caller aborts with the
 *   stage-did-not-advance reason rather than re-dispatching to the turn cap.
 * - 'progressed' — the _stateID advanced; the caller continues.
 *
 * @param {number | string} previousStateId - The _stateID before the dispatch.
 * @param {{ ctx: { gameover?: unknown }, _stateID: number | string } | null | undefined} afterState
 *   - The re-fetched state after the dispatch, or null/undefined when the match
 *     vanished from storage.
 * @returns {'progressed' | 'game-over' | 'vanished' | 'stalled'}
 */
export function classifyDispatch(previousStateId, afterState) {
  if (afterState === null || afterState === undefined) {
    return 'vanished';
  }
  if (afterState.ctx.gameover !== undefined) {
    return 'game-over';
  }
  if (!hasProgressed(previousStateId, afterState._stateID)) {
    return 'stalled';
  }
  return 'progressed';
}

/**
 * Selects the public-safe abort reason for a given abort category. This is the
 * single site that maps an internal abort cause to one of the four vetted,
 * guest-safe sentences in ABORT_REASONS; the catch site and the loop's stall
 * sites pass only a category, never raw fault detail.
 *
 * @param {'unexpected-error' | 'match-state-unavailable' | 'stage-did-not-advance' | 'no-legal-move'} category
 *   - The abort cause.
 * @returns {string} A public-safe full-sentence abort reason.
 */
export function buildAbortReason(category) {
  switch (category) {
    case 'unexpected-error':
      return ABORT_REASONS.unexpectedError;
    case 'match-state-unavailable':
      return ABORT_REASONS.matchStateUnavailable;
    case 'stage-did-not-advance':
      return ABORT_REASONS.stageDidNotAdvance;
    case 'no-legal-move':
      return ABORT_REASONS.noLegalMove;
    default:
      // why: any unrecognized category falls back to the generic server-error
      // sentence so an unexpected caller can never surface raw detail through
      // the guest envelope.
      return ABORT_REASONS.unexpectedError;
  }
}
