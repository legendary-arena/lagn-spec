/**
 * Autoplay — server-side bot loop for "Watch Bot Play" feature.
 *
 * Creates a match with all bot players, runs them through the lobby phase,
 * then drives the play phase using the engine's AI policies. Real UI clients
 * connect via Socket.IO as normal and receive state broadcasts.
 *
 * This file is a wiring layer: it dispatches moves using the engine's
 * existing AI policies and legal-move enumeration. It contains no game logic.
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LegendaryGame,
  getLegalMoves,
  createRandomPolicy,
  createCompetentHeuristicPolicy,
  buildUIState,
  filterUIStateForAudience,
} from '@legendary-arena/game-engine';
import { createPlaybackController } from './playbackController.mjs';
import {
  findPendingChoiceMove,
  hasProgressed,
  classifyDispatch,
  buildAbortReason,
} from './botLoopProgress.mjs';

/**
 * Per-match playback controllers, keyed by match id. A controller is
 * registered while its bot loop runs and removed on every exit path.
 *
 * // why: D-16306 — this buffer is Class 1 Runtime State; it lives only in
 * this in-process map and is never persisted to any store.
 */
export const autoplayControllers = new Map();

// why: boardgame.io v0.50 only ships CJS bundles for /master and /internal.
// createRequire bridges ESM → CJS for these subpackage imports.
const require = createRequire(import.meta.url);
const { Master } = require('boardgame.io/master');
const { ProcessGameConfig } = require('boardgame.io/internal');
const koaBody = require('koa-body');

const MAKE_MOVE = 'MAKE_MOVE';

/**
 * The post-exit review window (milliseconds) a controller stays registered
 * after the bot loop ends — on a natural game over OR an abort — so a viewer
 * can scrub the completed/stopped match before cleanup removes it.
 *
 * // why: D-16308 / D-24037 — both exit paths defer removal by the SAME window,
 * so the abort path reaches parity with the game-over review window instead of
 * deleting immediately. Defined once and reused; never duplicated per path.
 */
const REVIEW_WINDOW_MS = 5 * 60 * 1000;

/**
 * Loads the default loadout JSON used when no custom loadout is provided.
 *
 * @returns {Promise<object>} The composition block from the sample loadout.
 */
async function loadDefaultLoadout() {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const loadoutPath = join(thisDir, '..', '..', '..', 'arena-client', 'public', 'loadout-test.json');
  const raw = await readFile(loadoutPath, 'utf-8');
  const envelope = JSON.parse(raw);
  return envelope.composition;
}

/**
 * Resolves the playback controller for a request's :matchId path parameter.
 *
 * @param {object} koaContext - The koa request context.
 * @returns {object | null} The controller, or null when no match is running.
 */
function getController(koaContext) {
  const matchId = koaContext.params.matchId;
  return autoplayControllers.get(matchId) ?? null;
}

/**
 * Builds the standardized AutoplayControlResponse success envelope.
 *
 * // why: D-16304 — `mode` is always read from `controller.getMode()`; handlers
 * never recompute the live/paused predicate inline, so the client never has to
 * derive playback state from a combination of fields.
 *
 * @param {object} controller - The playback controller.
 * @param {{ uiState?: object }} [options] - Optional rewind projection.
 * @returns {object} The response envelope.
 */
export function buildResponse(controller, options = {}) {
  const response = {
    ok: true,
    paused: controller.isPaused(),
    historyLength: controller.getHistoryLength(),
    cursor: controller.getCursor(),
    mode: controller.getMode(),
    speedMode: controller.getSpeedMode(),
    gameOver: controller.isGameOver(),
    aborted: controller.isAborted(),
  };
  if (options.uiState !== undefined) {
    response.uiState = options.uiState;
  }
  // why: D-24037 — abortReason is added as an OWN key ONLY when aborted, so a
  // healthy or game-over envelope carries no abortReason key at all. Clients
  // gate on `aborted` first; the key's mere presence implies an abort.
  if (controller.isAborted()) {
    response.abortReason = controller.getAbortReason();
  }
  return response;
}

/**
 * Builds a non-200 envelope carrying the same fields as the success envelope.
 *
 * @param {object} controller - The playback controller.
 * @param {string} message - A full-sentence error message.
 * @returns {object} The error envelope.
 */
function errorEnvelope(controller, message) {
  return {
    ok: false,
    paused: controller.isPaused(),
    historyLength: controller.getHistoryLength(),
    cursor: controller.getCursor(),
    mode: controller.getMode(),
    error: message,
  };
}

/**
 * Projects a captured snapshot into an audience-filtered UIState for a rewind
 * response.
 *
 * // why: D-17701 — scopes D-16303; audience defaults to spectator for back-compat
 *
 * @param {{ G: unknown, ctx: { phase: string, turn: number, currentPlayer: string } }} snapshot
 * @param {{ kind: 'player', playerId: string } | { kind: 'spectator' }} [audience={ kind: 'spectator' }]
 * @returns {object} The audience-filtered UIState.
 */
export function rewindUIState(snapshot, audience = { kind: 'spectator' }) {
  const fullUIState = buildUIState(snapshot.G, {
    phase: snapshot.ctx.phase,
    turn: snapshot.ctx.turn,
    currentPlayer: snapshot.ctx.currentPlayer,
  });
  return filterUIStateForAudience(fullUIState, audience);
}

/**
 * Derives the requester's viewing audience from optional identity headers.
 *
 * When the caller supplies valid X-Player-ID and X-Credentials headers whose
 * credentials pass boardgame.io's match-level auth check, the returned
 * audience is `{ kind: 'player', playerId }` — giving that viewer their own
 * hand in rewind frames. Every other case (missing headers, invalid
 * credentials, missing metadata) falls back to the spectator audience that
 * D-16303 originally mandated.
 *
 * @param {object} koaContext - The koa request context.
 * @param {object} db - boardgame.io storage backend.
 * @param {object} auth - boardgame.io Auth instance.
 * @param {string} matchId - The match id to validate credentials against.
 * @returns {Promise<{ kind: 'player', playerId: string } | { kind: 'spectator' }>}
 */
export async function resolveRequesterAudience(koaContext, db, auth, matchId) {
  const playerID = koaContext.get('X-Player-ID');
  const credentials = koaContext.get('X-Credentials');

  if (playerID && credentials) {
    try {
      const { metadata } = await db.fetch(matchId, { metadata: true });
      if (metadata) {
        const isAuthentic = auth.authenticateCredentials({
          playerID,
          credentials,
          metadata,
        });
        if (isAuthentic) {
          return { kind: 'player', playerId: playerID };
        }
      }
    } catch {
      // why: metadata fetch failure is non-fatal — falls through to spectator default
    }
  }

  // why: D-17701 — safe-by-default; absent or invalid identity yields the same spectator view D-16303 mandated
  return { kind: 'spectator' };
}

/**
 * Resolves the controller, runs a playback action, and maps faults to the
 * standardized envelope: 404 when no match is running, 500 on unexpected error.
 *
 * @param {object} koaContext - The koa request context.
 * @param {(controller: object) => void} core - The per-endpoint action.
 * @returns {Promise<void>}
 */
async function handlePlaybackRequest(koaContext, core) {
  const controller = getController(koaContext);
  if (controller === null) {
    koaContext.status = 404;
    // why: no controller exists for this match id, so the envelope falls back
    // to neutral defaults; mode is 'live' because there is no gated loop.
    koaContext.body = {
      ok: false,
      paused: false,
      historyLength: 0,
      cursor: -1,
      mode: 'live',
      speedMode: '1x',
      gameOver: false,
      aborted: false,
      error: 'No autoplay match is running for the requested match id.',
    };
    return;
  }
  try {
    core(controller);
  } catch (playbackError) {
    koaContext.status = 500;
    koaContext.body = errorEnvelope(
      controller,
      `The playback control failed unexpectedly: ${playbackError.message}`,
    );
  }
}

/**
 * Reports the current playback envelope for an autoplay match, or a 404
 * not-found envelope when no controller is registered for the match id.
 *
 * // why: read-only status probe (D-16501) — it reuses the POST handlers'
 * 404/500 wrapper for an identical not-found envelope but performs no mutation;
 * the WP-164 client probes this once to tell an autoplay match (200) from a
 * normal live match (404) without a side-effectful POST or a URL marker.
 *
 * @param {object} koaContext - The koa request context.
 * @returns {Promise<void>}
 */
export async function handleAutoplayStatusRequest(koaContext) {
  await handlePlaybackRequest(koaContext, (controller) => {
    koaContext.body = buildResponse(controller);
  });
}

/**
 * Registers the POST /api/match/autoplay route plus the six playback controls.
 *
 * @param {import('@koa/router')} router - The boardgame.io server's koa router.
 * @param {object} context - Server context for bot operation.
 * @param {object} context.db - boardgame.io storage backend.
 * @param {object} context.transport - boardgame.io SocketIO transport instance.
 * @param {object} context.auth - boardgame.io Auth instance.
 * @param {string} context.serverUrl - Base URL for internal lobby API calls.
 */
export function registerAutoplayRoutes(router, context) {
  const { db, transport, auth, serverUrl } = context;

  const processedGame = ProcessGameConfig(LegendaryGame);

  router.post('/api/match/autoplay', koaBody(), async (koaContext) => {
    const body = koaContext.request.body ?? {};
    const playerCount = Math.max(1, Math.min(5, Number(body.playerCount) || 1));
    const policyName = body.policy === 'random' ? 'random' : 'competent';
    const delayMs = Math.max(100, Math.min(5000, Number(body.delayMs) || 800));
    const seed = typeof body.seed === 'string' ? body.seed : String(Date.now());

    let setupData;
    try {
      setupData = body.setupData ?? await loadDefaultLoadout();
    } catch (loadError) {
      koaContext.status = 500;
      koaContext.body = { error: 'Failed to load default game configuration.' };
      return;
    }

    // Step 1: Create match via lobby API
    let matchId;
    try {
      const createResponse = await fetch(`${serverUrl}/games/legendary-arena/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numPlayers: playerCount, setupData }),
      });
      if (!createResponse.ok) {
        const errorBody = await createResponse.text();
        koaContext.status = createResponse.status;
        koaContext.body = { error: `Match creation failed: ${errorBody}` };
        return;
      }
      const createResult = await createResponse.json();
      matchId = createResult.matchID;
    } catch (networkError) {
      koaContext.status = 502;
      koaContext.body = { error: 'Network error creating match.' };
      return;
    }

    // Step 2: Join all bot players
    const credentials = {};
    try {
      for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
        const joinResponse = await fetch(
          `${serverUrl}/games/legendary-arena/${matchId}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerID: String(playerIndex),
              playerName: `Bot ${playerIndex}`,
            }),
          },
        );
        if (!joinResponse.ok) {
          const errorBody = await joinResponse.text();
          koaContext.status = joinResponse.status;
          koaContext.body = { error: `Failed to join player ${playerIndex}: ${errorBody}` };
          return;
        }
        const joinResult = await joinResponse.json();
        credentials[String(playerIndex)] = joinResult.playerCredentials;
      }
    } catch (networkError) {
      koaContext.status = 502;
      koaContext.body = { error: 'Network error joining bot players.' };
      return;
    }

    // Step 3: Start the bot loop (non-blocking)
    runBotMatch({
      matchId,
      playerCount,
      credentials,
      db,
      transport,
      auth,
      processedGame,
      policyName,
      delayMs,
      seed,
    });

    // Step 4: Return match info so the client can connect as spectator
    koaContext.body = {
      matchId,
      playerCount,
      credentials,
    };
  });

  // Playback controls (WP-163). All six are bodyless — no koaBody() — and
  // return the standardized AutoplayControlResponse envelope (D-16304).
  router.post('/api/match/autoplay/:matchId/pause', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      controller.pause();
      koaContext.body = buildResponse(controller);
    });
  });

  router.post('/api/match/autoplay/:matchId/resume', koaBody(), async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      controller.resume();
      const requestedSpeed = koaContext.request.body?.speedMode;
      if (requestedSpeed && requestedSpeed !== 'max') {
        controller.setSpeedMode(requestedSpeed);
      }
      koaContext.body = buildResponse(controller);
    });
  });

  router.post('/api/match/autoplay/:matchId/step-forward', async (koaContext) => {
    const matchId = koaContext.params.matchId;
    const audience = await resolveRequesterAudience(koaContext, db, auth, matchId); // why: D-17701
    await handlePlaybackRequest(koaContext, (controller) => {
      const result = controller.stepForward();
      // why: D-16304/D-16302 — uiState is returned only on the 'cursor' branch;
      // the 'live-move' branch released the gate and the client awaits the live
      // broadcast rather than a rewind overlay.
      if (result.type === 'cursor') {
        koaContext.body = buildResponse(controller, { uiState: rewindUIState(result.snapshot, audience) });
      } else {
        koaContext.body = buildResponse(controller);
      }
    });
  });

  router.post('/api/match/autoplay/:matchId/step-back', async (koaContext) => {
    const matchId = koaContext.params.matchId;
    const audience = await resolveRequesterAudience(koaContext, db, auth, matchId); // why: D-17701
    await handlePlaybackRequest(koaContext, (controller) => {
      const snapshot = controller.stepBack();
      if (snapshot === null) {
        koaContext.status = 409;
        koaContext.body = errorEnvelope(controller, 'Cannot step back: already at the first captured state.');
        return;
      }
      koaContext.body = buildResponse(controller, { uiState: rewindUIState(snapshot, audience) });
    });
  });

  router.post('/api/match/autoplay/:matchId/restart', async (koaContext) => {
    const matchId = koaContext.params.matchId;
    const audience = await resolveRequesterAudience(koaContext, db, auth, matchId); // why: D-17701
    await handlePlaybackRequest(koaContext, (controller) => {
      const snapshot = controller.restart();
      if (snapshot === null) {
        koaContext.status = 409;
        koaContext.body = errorEnvelope(controller, 'Cannot restart: no playback history has been captured yet.');
        return;
      }
      koaContext.body = buildResponse(controller, { uiState: rewindUIState(snapshot, audience) });
    });
  });

  router.post('/api/match/autoplay/:matchId/go-to-end', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      controller.goToEnd();
      koaContext.body = buildResponse(controller);
    });
  });

  // Status probe (WP-165). GET, bodyless — no koaBody() — and strictly
  // read-only: 200 with the metadata envelope (no uiState) when a controller is
  // registered, 404 otherwise (D-16501).
  router.get('/api/match/autoplay/:matchId/status', handleAutoplayStatusRequest);
}

/**
 * Submits a single move via boardgame.io's Master class.
 *
 * @param {object} params - Move parameters.
 * @returns {Promise<void>}
 */
async function submitMove({ processedGame, db, transport, auth, matchId, playerId, credentials, moveName, moveArgs }) {
  const { state } = await db.fetch(matchId, { state: true });
  if (!state) {
    return { error: 'match not found' };
  }

  const action = {
    type: MAKE_MOVE,
    payload: {
      type: moveName,
      args: moveArgs !== undefined ? [moveArgs] : [],
      credentials: credentials[playerId],
      playerID: playerId,
    },
  };

  const transportAPI = {
    send() {},
    sendAll(payload) {
      transport.pubSub.publish(`MATCH-${matchId}`, payload);
    },
  };

  const master = new Master(processedGame, db, transportAPI, auth);
  return master.onUpdate(action, state._stateID, matchId, playerId);
}

/**
 * Registers a playback controller for the duration of `body`, then removes it.
 *
 * @param {string} matchId - The match id key.
 * @param {number} baseDelay - The match's configured inter-move delay (ms).
 * @param {(controller: object) => Promise<void>} body - The work to run.
 * @returns {Promise<void>}
 */
export async function withRegisteredController(matchId, baseDelay, body) {
  const controller = createPlaybackController(baseDelay);
  autoplayControllers.set(matchId, controller);
  try {
    await body(controller);
    // why: D-24037 — normal exit means game over, BUT guard with !isAborted()
    // so a loop-detected stall the body already recorded (markAborted) is never
    // overwritten with gameOver. Either way, defer cleanup by the review window
    // so the viewer can scrub the completed/stopped match.
    if (!controller.isAborted()) {
      controller.markGameOver();
    }
    setTimeout(() => autoplayControllers.delete(matchId), REVIEW_WINDOW_MS);
  } catch (error) {
    // why: D-24037 — no silent immediate delete on an abnormal exit. Mark the
    // controller aborted with a PUBLIC-SAFE reason (the raw fault stays in the
    // existing runBotMatch console.error path, never the guest envelope) and
    // defer removal by the same review window as the normal path, so spectators
    // see an explicit "stopped" state instead of a frozen board. Refines the
    // error half of D-16308 (eventual removal preserved). Rethrow is safe — the
    // runBotMatch launcher already catches it, so no new unhandled rejection.
    controller.markAborted(buildAbortReason('unexpected-error'));
    setTimeout(() => autoplayControllers.delete(matchId), REVIEW_WINDOW_MS);
    throw error;
  }
}

/**
 * Captures the current match state, gates on pause, then waits the active
 * inter-move delay. Replaces the bare per-move delay so a viewer can pause or
 * step at each move boundary.
 *
 * // why: pushState runs before waitIfPaused, so history length is >= 1 before
 * the first gate can block (D-16302 corollary). The delay reads
 * getActiveDelay() so go-to-end's fast-forward (D-16307) takes effect.
 *
 * @param {object} controller - The playback controller.
 * @param {object} db - boardgame.io storage backend.
 * @param {string} matchId - The match id.
 * @returns {Promise<void>}
 */
async function recordAndPace(controller, db, matchId) {
  const { state: pacedState } = await db.fetch(matchId, { state: true });
  if (pacedState) {
    controller.pushState({
      G: pacedState.G,
      ctx: {
        phase: pacedState.ctx.phase,
        turn: pacedState.ctx.turn,
        currentPlayer: pacedState.ctx.currentPlayer,
      },
    });
  }
  await controller.waitIfPaused();
  await delay(controller.getActiveDelay());
}

/**
 * Runs a bot match under a registered playback controller.
 *
 * @param {object} params - All parameters for the bot match.
 * @returns {Promise<void>}
 */
async function runBotMatch(params) {
  try {
    await withRegisteredController(params.matchId, params.delayMs, (controller) =>
      runBotMatchLoop({ ...params, controller }),
    );
  } catch (botMatchError) {
    console.error(`[autoplay] match ${params.matchId} bot loop failed: ${botMatchError.message}`);
  }
}

/**
 * Builds the minimal lifecycle context getLegalMoves needs from a fetched
 * match state (phase, turn, current player, player count).
 *
 * @param {object} state - The fetched boardgame.io match state.
 * @returns {{ phase: string, turn: number, currentPlayer: string, numPlayers: number }}
 */
function lifecycleContextFor(state) {
  return {
    phase: state.ctx.phase,
    turn: state.ctx.turn,
    currentPlayer: state.ctx.currentPlayer,
    numPlayers: state.ctx.numPlayers,
  };
}

/**
 * Fetches the current match state, returning null when the match has vanished
 * from storage (e.g., the in-memory match store was wiped by a redeploy).
 *
 * @param {object} db - boardgame.io storage backend.
 * @param {string} matchId - The match id.
 * @returns {Promise<object | null>}
 */
async function fetchMatchState(db, matchId) {
  const { state } = await db.fetch(matchId, { state: true });
  return state ?? null;
}

/**
 * Reports whether a move of the given name is present in a legal-move list.
 *
 * @param {ReadonlyArray<{ name: string }>} legalMoves - The getLegalMoves result.
 * @param {string} moveName - The move name to look for.
 * @returns {boolean} true when the move is legal in the current state.
 */
function isLegalMove(legalMoves, moveName) {
  for (const legalMove of legalMoves) {
    if (legalMove.name === moveName) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the active player's audience-filtered view and asks the policy which
 * spend move to make. Wiring over the engine's UIState projection + policy.
 *
 * @param {object} state - The current match state.
 * @param {ReadonlyArray<object>} spendMoves - The legal spend moves to choose among.
 * @param {object} policy - The AI policy.
 * @param {number} turnCount - The current turn index (for logging).
 * @param {string} matchId - The match id (for logging).
 * @returns {{ move: { name: string, args: unknown } }} The chosen intent.
 */
function decideSpendIntent(state, spendMoves, policy, turnCount, matchId) {
  const player = state.ctx.currentPlayer;
  const fullUIState = buildUIState(state.G, {
    phase: state.ctx.phase,
    turn: state.ctx.turn,
    currentPlayer: player,
  });
  const filteredView = filterUIStateForAudience(fullUIState, { kind: 'player', playerId: player });
  const intent = policy.decideTurn(filteredView, spendMoves);
  console.log(`[autoplay] match ${matchId} turn ${turnCount}: spending → ${intent.move.name} ${JSON.stringify(intent.move.args)}`);
  return intent;
}

/**
 * Dispatches one move expected to advance the loop, paces playback, then
 * re-fetches and classifies the outcome against the pre-dispatch _stateID.
 *
 * // why: D-24038 — every stage-advancing dispatch is verified to make
 * progress, so a move that should advance but silently doesn't aborts the loop
 * rather than being re-dispatched to the turn cap (the ~10-minute "freeze").
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {string} playerId - The dispatching player.
 * @param {string} moveName - The move to dispatch.
 * @param {unknown} moveArgs - The move arguments (undefined for arg-less moves).
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string }>}
 */
async function dispatchAdvancingMove(loop, playerId, moveName, moveArgs) {
  const before = await fetchMatchState(loop.db, loop.matchId);
  if (before === null) {
    return { kind: 'abort', reason: buildAbortReason('match-state-unavailable') };
  }
  const previousStateId = before._stateID;
  await submitMove({ ...loop.moveParams, playerId, moveName, moveArgs });
  await recordAndPace(loop.controller, loop.db, loop.matchId);
  const after = await fetchMatchState(loop.db, loop.matchId);
  const outcome = classifyDispatch(previousStateId, after);
  if (outcome === 'vanished') {
    return { kind: 'abort', reason: buildAbortReason('match-state-unavailable') };
  }
  if (outcome === 'stalled') {
    return { kind: 'abort', reason: buildAbortReason('stage-did-not-advance') };
  }
  if (outcome === 'game-over') {
    return { kind: 'game-over', state: after };
  }
  return { kind: 'progressed', state: after };
}

/**
 * Drains every parked player-choice (resolveKoHeroChoice /
 * resolveOptionalKoReward) the engine has short-circuited getLegalMoves to, in
 * any stage, dispatching each via dispatchAdvancingMove. A parked choice
 * freezes the board, so it must resolve before any stage-specific move.
 *
 * // why: D-24038 — the old loop only consulted getLegalMoves in the main spend
 * step and filtered the resolve short-circuit OUT, so a choice parked in start
 * (or mid-main by a fight) spun the loop to the turn cap. Draining it in EVERY
 * stage via getLegalMoves closes that path.
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {object} state - The current fetched match state.
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string }>}
 */
async function drainPendingChoices(loop, state) {
  let current = state;
  while (true) {
    const legalMoves = getLegalMoves(current.G, lifecycleContextFor(current));
    const pendingChoice = findPendingChoiceMove(legalMoves);
    if (pendingChoice === null) {
      return { kind: 'progressed', state: current };
    }
    const result = await dispatchAdvancingMove(loop, current.ctx.currentPlayer, pendingChoice.name, pendingChoice.args);
    if (result.kind !== 'progressed') {
      return result;
    }
    current = result.state;
  }
}

/**
 * Plays cards from the active player's hand until the hand is empty or a play
 * is silently rejected. Card plays generate the turn's attack/recruit economy;
 * they are NOT stage-advancing, so a rejected play stops the play step (the
 * existing _stateID silent-rejection guard) rather than aborting the match.
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {object} state - The current match state (currentStage === 'main').
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string, playedCount: number }>}
 */
async function playHandCards(loop, state) {
  const player = state.ctx.currentPlayer;
  let playedCount = 0;
  while (playedCount < 30) {
    const current = await fetchMatchState(loop.db, loop.matchId);
    if (current === null) {
      return { kind: 'abort', reason: buildAbortReason('match-state-unavailable'), playedCount };
    }
    if (current.ctx.gameover !== undefined) {
      return { kind: 'game-over', state: current, playedCount };
    }
    const hand = current.G.playerZones[player]?.hand ?? [];
    if (hand.length === 0) {
      return { kind: 'progressed', state: current, playedCount };
    }
    const previousStateId = current._stateID;
    await submitMove({ ...loop.moveParams, playerId: player, moveName: 'playCard', moveArgs: { cardId: hand[0] } });
    const after = await fetchMatchState(loop.db, loop.matchId);
    if (after !== null && !hasProgressed(previousStateId, after._stateID)) {
      // why: playCard is not stage-advancing; an unchanged _stateID means the
      // card cannot be played now, so stop the play step rather than aborting
      // the whole match (preserves the existing silent-rejection guard).
      console.error(`[autoplay] match ${loop.matchId} playCard silently rejected for card ${hand[0]}`);
      return { kind: 'progressed', state: after, playedCount };
    }
    playedCount += 1;
    await recordAndPace(loop.controller, loop.db, loop.matchId);
  }
  const finalState = await fetchMatchState(loop.db, loop.matchId);
  return { kind: 'progressed', state: finalState ?? state, playedCount };
}

/**
 * Spends the turn's economy in the main stage: drains any parked choice first,
 * then lets the policy pick recruit/fight moves until only advanceStage remains,
 * then advances out of main. The spend filter PRESERVES the parked-choice
 * short-circuit (it is drained first) instead of dropping it (D-24038); the
 * advanceStage dispatch is progress-checked.
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {object} state - The current match state (currentStage === 'main').
 * @param {object} policy - The AI policy.
 * @param {number} turnCount - The current turn index (for logging).
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string }>}
 */
async function spendResources(loop, state, policy, turnCount) {
  let attempts = 0;
  while (attempts < 20) {
    const fetched = await fetchMatchState(loop.db, loop.matchId);
    if (fetched === null) {
      return { kind: 'abort', reason: buildAbortReason('match-state-unavailable') };
    }
    if (fetched.ctx.gameover !== undefined) {
      return { kind: 'game-over', state: fetched };
    }
    if (fetched.G.currentStage !== 'main') {
      return { kind: 'progressed', state: fetched };
    }
    const drainResult = await drainPendingChoices(loop, fetched);
    if (drainResult.kind !== 'progressed') {
      return drainResult;
    }
    const current = drainResult.state;
    const player = current.ctx.currentPlayer;
    const legalMoves = getLegalMoves(current.G, lifecycleContextFor(current));
    const spendMoves = legalMoves.filter(
      (legalMove) =>
        legalMove.name === 'recruitHero' ||
        legalMove.name === 'fightVillain' ||
        legalMove.name === 'fightMastermind' ||
        legalMove.name === 'advanceStage',
    );
    if (spendMoves.length === 0) {
      return { kind: 'progressed', state: current };
    }
    // why: D-24038 — advanceStage is the only stage-advancing spend move, so it
    // routes through the progress-checked dispatch; recruit/fight are bounded
    // by the attempt cap and the shrinking economy.
    if (spendMoves.length === 1 && spendMoves[0].name === 'advanceStage') {
      return dispatchAdvancingMove(loop, player, 'advanceStage', undefined);
    }
    const intent = decideSpendIntent(current, spendMoves, policy, turnCount, loop.matchId);
    await submitMove({ ...loop.moveParams, playerId: player, moveName: intent.move.name, moveArgs: intent.move.args });
    attempts += 1;
    await recordAndPace(loop.controller, loop.db, loop.matchId);
  }
  const finalState = await fetchMatchState(loop.db, loop.matchId);
  return { kind: 'progressed', state: finalState ?? state };
}

/**
 * Drives the start stage: reveal one villain card (if legal), drain any choice
 * the reveal parks, then advance into the main stage (if legal). Each dispatch
 * is progress-checked; a start stage that cannot advance aborts rather than
 * spinning. The engine auto-draws the start-of-turn hand at onBegin (WP-236),
 * so the bot no longer submits a start-of-turn draw move.
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {object} state - The current match state (currentStage === 'start').
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string }>}
 */
async function runStartStage(loop, state) {
  let current = state;
  const revealLegal = getLegalMoves(current.G, lifecycleContextFor(current));
  if (isLegalMove(revealLegal, 'revealVillainCard')) {
    const revealResult = await dispatchAdvancingMove(loop, current.ctx.currentPlayer, 'revealVillainCard', undefined);
    if (revealResult.kind !== 'progressed') {
      return revealResult;
    }
    const drainResult = await drainPendingChoices(loop, revealResult.state);
    if (drainResult.kind !== 'progressed') {
      return drainResult;
    }
    current = drainResult.state;
  }
  if (current.G.currentStage !== 'start') {
    return { kind: 'progressed', state: current };
  }
  const advanceLegal = getLegalMoves(current.G, lifecycleContextFor(current));
  if (!isLegalMove(advanceLegal, 'advanceStage')) {
    // why: D-24038 — start stage cannot progress (no legal reveal, no legal
    // advance, no parked choice already drained); abort rather than re-enter
    // the same stuck stage to the turn cap.
    return { kind: 'abort', reason: buildAbortReason('no-legal-move') };
  }
  return dispatchAdvancingMove(loop, current.ctx.currentPlayer, 'advanceStage', undefined);
}

/**
 * Drives the main stage: play hand cards (economy generation), log the economy,
 * then spend it via the policy.
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {object} state - The current match state (currentStage === 'main').
 * @param {object} policy - The AI policy.
 * @param {number} turnCount - The current turn index.
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string }>}
 */
async function runMainStage(loop, state, policy, turnCount) {
  const player = state.ctx.currentPlayer;
  const playResult = await playHandCards(loop, state);
  if (playResult.kind !== 'progressed') {
    return playResult;
  }
  const afterPlay = playResult.state;
  if (afterPlay) {
    const economy = afterPlay.G.turnEconomy;
    console.log(`[autoplay] match ${loop.matchId} turn ${turnCount} player ${player}: played ${playResult.playedCount} cards, economy: attack=${economy.attack} recruit=${economy.recruit}`);
  }
  if (!afterPlay || afterPlay.ctx.gameover !== undefined || afterPlay.G.currentStage !== 'main') {
    return { kind: 'progressed', state: afterPlay ?? state };
  }
  return spendResources(loop, afterPlay, policy, turnCount);
}

/**
 * Drives the cleanup stage: end the turn (if legal), progress-checked.
 *
 * @param {{ moveParams: object, controller: object, db: object, matchId: string }} loop - Loop context.
 * @param {object} state - The current match state (currentStage === 'cleanup').
 * @returns {Promise<{ kind: 'progressed' | 'game-over' | 'abort', state?: object, reason?: string }>}
 */
async function runCleanupStage(loop, state) {
  const legalMoves = getLegalMoves(state.G, lifecycleContextFor(state));
  if (!isLegalMove(legalMoves, 'endTurn')) {
    // why: D-24038 — cleanup with no legal endTurn (and no parked choice,
    // drained earlier) cannot progress; abort rather than spin to the turn cap.
    return { kind: 'abort', reason: buildAbortReason('no-legal-move') };
  }
  return dispatchAdvancingMove(loop, state.ctx.currentPlayer, 'endTurn', undefined);
}

/**
 * Runs the full bot match loop: lobby ready-up, then play phase until game over
 * or an observable abort. Each turn drives the start → main → cleanup stage
 * cycle; every stage drains parked player-choices via getLegalMoves and
 * progress-checks its stage-advancing dispatches so the loop fails loud and
 * bounded instead of freezing silently or spinning to the turn cap.
 *
 * @param {object} params - All parameters for the bot match, plus the controller.
 */
async function runBotMatchLoop({ matchId, playerCount, credentials, db, transport, auth, processedGame, policyName, seed, controller }) {
  const moveParams = { processedGame, db, transport, auth, matchId, credentials };
  const loop = { moveParams, controller, db, matchId };

  // Lobby phase: mark all players ready, then start
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    await submitMove({
      ...moveParams,
      playerId: String(playerIndex),
      moveName: 'setPlayerReady',
      moveArgs: { ready: true },
    });
  }

  await submitMove({
    ...moveParams,
    playerId: '0',
    moveName: 'startMatchIfReady',
    moveArgs: undefined,
  });

  // Brief pause to let the client connect before play begins
  await recordAndPace(controller, db, matchId);

  // Create AI policy
  const policy = policyName === 'random'
    ? createRandomPolicy(seed)
    : createCompetentHeuristicPolicy(seed);

  // Play phase: drive the turn stage cycle explicitly.
  let turnCount = 0;
  const maxTurns = 400;

  while (turnCount < maxTurns) {
    const state = await fetchMatchState(db, matchId);
    if (state === null) {
      // why: D-24038 — the match vanished from storage (deploy-wipe / eviction);
      // mark the controller aborted so the client sees an explicit "stopped"
      // state instead of the old silent break + frozen board.
      controller.markAborted(buildAbortReason('match-state-unavailable'));
      break;
    }
    if (state.ctx.gameover !== undefined) {
      console.log(`[autoplay] match ${matchId} ended: ${JSON.stringify(state.ctx.gameover)}`);
      break;
    }
    if (state.ctx.phase !== 'play') {
      console.log(`[autoplay] match ${matchId} in unexpected phase: ${state.ctx.phase}`);
      break;
    }

    // why: D-24038 — drain any parked player-choice at turn entry in ANY stage
    // before stage-specific moves, so a KO-a-Hero / optional-KO ambush never
    // spins the loop to maxTurns.
    const entryDrain = await drainPendingChoices(loop, state);
    if (entryDrain.kind === 'game-over') {
      console.log(`[autoplay] match ${matchId} ended during pending-choice resolution.`);
      break;
    }
    if (entryDrain.kind === 'abort') {
      controller.markAborted(entryDrain.reason);
      break;
    }
    let current = entryDrain.state;

    if (current.G.currentStage === 'start') {
      const startResult = await runStartStage(loop, current);
      if (startResult.kind === 'game-over') break;
      if (startResult.kind === 'abort') {
        controller.markAborted(startResult.reason);
        break;
      }
      current = startResult.state;
    }

    if (current.G.currentStage === 'main') {
      const mainResult = await runMainStage(loop, current, policy, turnCount);
      if (mainResult.kind === 'game-over') break;
      if (mainResult.kind === 'abort') {
        controller.markAborted(mainResult.reason);
        break;
      }
      current = mainResult.state;
    }

    if (current.G.currentStage === 'cleanup') {
      const cleanupResult = await runCleanupStage(loop, current);
      if (cleanupResult.kind === 'game-over') break;
      if (cleanupResult.kind === 'abort') {
        controller.markAborted(cleanupResult.reason);
        break;
      }
      current = cleanupResult.state;
    }

    turnCount++;
  }

  if (turnCount >= maxTurns) {
    console.warn(`[autoplay] match ${matchId} hit turn limit (${maxTurns}).`);
  }
}

/**
 * Waits for the specified number of milliseconds.
 *
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
