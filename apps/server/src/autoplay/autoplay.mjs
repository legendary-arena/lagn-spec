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
  };
  if (options.uiState !== undefined) {
    response.uiState = options.uiState;
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
 * Projects a captured snapshot into a spectator-filtered UIState for a rewind
 * response.
 *
 * // why: D-16303 — rewind frames must be audience-filtered (spectator) or they
 * leak hidden information (hands, decks) that the live spectator view hides.
 *
 * @param {{ G: unknown, ctx: { phase: string, turn: number, currentPlayer: string } }} snapshot
 * @returns {object} The spectator-filtered UIState.
 */
function rewindUIState(snapshot) {
  const fullUIState = buildUIState(snapshot.G, {
    phase: snapshot.ctx.phase,
    turn: snapshot.ctx.turn,
    currentPlayer: snapshot.ctx.currentPlayer,
  });
  return filterUIStateForAudience(fullUIState, { kind: 'spectator' });
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

  router.post('/api/match/autoplay/:matchId/resume', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      controller.resume();
      koaContext.body = buildResponse(controller);
    });
  });

  router.post('/api/match/autoplay/:matchId/step-forward', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      const result = controller.stepForward();
      // why: D-16304/D-16302 — uiState is returned only on the 'cursor' branch;
      // the 'live-move' branch released the gate and the client awaits the live
      // broadcast rather than a rewind overlay.
      if (result.type === 'cursor') {
        koaContext.body = buildResponse(controller, { uiState: rewindUIState(result.snapshot) });
      } else {
        koaContext.body = buildResponse(controller);
      }
    });
  });

  router.post('/api/match/autoplay/:matchId/step-back', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      const snapshot = controller.stepBack();
      if (snapshot === null) {
        koaContext.status = 409;
        koaContext.body = errorEnvelope(controller, 'Cannot step back: already at the first captured state.');
        return;
      }
      koaContext.body = buildResponse(controller, { uiState: rewindUIState(snapshot) });
    });
  });

  router.post('/api/match/autoplay/:matchId/restart', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      const snapshot = controller.restart();
      if (snapshot === null) {
        koaContext.status = 409;
        koaContext.body = errorEnvelope(controller, 'Cannot restart: no playback history has been captured yet.');
        return;
      }
      koaContext.body = buildResponse(controller, { uiState: rewindUIState(snapshot) });
    });
  });

  router.post('/api/match/autoplay/:matchId/go-to-end', async (koaContext) => {
    await handlePlaybackRequest(koaContext, (controller) => {
      controller.goToEnd();
      koaContext.body = buildResponse(controller);
    });
  });
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
  } finally {
    // why: D-16308 — release the controller on every exit path (normal,
    // break/return, or throw) so the map never leaks one entry per match.
    autoplayControllers.delete(matchId);
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
 * Runs the full bot match loop: lobby ready-up, then play phase until game over.
 *
 * @param {object} params - All parameters for the bot match, plus the controller.
 */
async function runBotMatchLoop({ matchId, playerCount, credentials, db, transport, auth, processedGame, policyName, seed, controller }) {
  const moveParams = { processedGame, db, transport, auth, matchId, credentials };

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
  // Each turn: reveal villain (start) → advance to main → policy decisions → end turn.
  // The policy is only consulted for main-stage decisions (play/recruit/fight).
  let turnCount = 0;
  const maxTurns = 400;

  while (turnCount < maxTurns) {
    let { state } = await db.fetch(matchId, { state: true });
    if (!state) {
      console.error(`[autoplay] match ${matchId} not found in storage.`);
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

    const currentPlayer = state.ctx.currentPlayer;

    // --- Start stage: draw hand, reveal one villain card, then advance ---
    if (state.G.currentStage === 'start') {
      // Draw cards if hand is empty (start of game or after previous cleanup)
      const playerZones = state.G.playerZones[currentPlayer];
      if (playerZones && playerZones.hand.length === 0) {
        await submitMove({
          ...moveParams,
          playerId: currentPlayer,
          moveName: 'drawCards',
          moveArgs: { count: 6 },
        });
        await recordAndPace(controller, db, matchId);
      }

      await submitMove({
        ...moveParams,
        playerId: currentPlayer,
        moveName: 'revealVillainCard',
        moveArgs: undefined,
      });
      await recordAndPace(controller, db, matchId);

      // Check for gameover after reveal (villains may have escaped)
      ({ state } = await db.fetch(matchId, { state: true }));
      if (!state || state.ctx.gameover !== undefined) continue;

      await submitMove({
        ...moveParams,
        playerId: currentPlayer,
        moveName: 'advanceStage',
        moveArgs: undefined,
      });
      await recordAndPace(controller, db, matchId);
    }

    // --- Main stage: play cards, then recruit/fight, then advance ---
    ({ state } = await db.fetch(matchId, { state: true }));
    if (!state || state.ctx.gameover !== undefined) continue;

    if (state.G.currentStage === 'main') {
      const player = state.ctx.currentPlayer;

      // Step 1: Play all cards from hand (generates attack/recruit)
      let playAttempts = 0;
      while (playAttempts < 30) {
        ({ state } = await db.fetch(matchId, { state: true }));
        if (!state || state.ctx.gameover !== undefined) break;
        const hand = state.G.playerZones[player]?.hand ?? [];
        if (hand.length === 0) break;

        const prevStateId = state._stateID;
        await submitMove({
          ...moveParams,
          playerId: player,
          moveName: 'playCard',
          moveArgs: { cardId: hand[0] },
        });

        // Detect silent rejection — if stateID didn't change, the move failed
        const afterFetch = await db.fetch(matchId, { state: true });
        if (afterFetch.state && afterFetch.state._stateID === prevStateId) {
          console.error(`[autoplay] match ${matchId} playCard silently rejected for card ${hand[0]}`);
          break;
        }

        playAttempts++;
        await recordAndPace(controller, db, matchId);
      }

      // Log economy after playing cards
      ({ state } = await db.fetch(matchId, { state: true }));
      if (state) {
        const economy = state.G.turnEconomy;
        console.log(`[autoplay] match ${matchId} turn ${turnCount} player ${player}: played ${playAttempts} cards, economy: attack=${economy.attack} recruit=${economy.recruit}`);
      }

      // Step 2: Spend resources — recruit heroes and fight villains
      let spendAttempts = 0;
      while (spendAttempts < 20) {
        ({ state } = await db.fetch(matchId, { state: true }));
        if (!state || state.ctx.gameover !== undefined) break;
        if (state.G.currentStage !== 'main') break;

        const lifecycleContext = {
          phase: state.ctx.phase,
          turn: state.ctx.turn,
          currentPlayer: player,
          numPlayers: state.ctx.numPlayers,
        };

        const legalMoves = getLegalMoves(state.G, lifecycleContext);
        // Filter to only spend moves (recruit/fight) and advanceStage
        const spendMoves = legalMoves.filter(
          (m) => m.name === 'recruitHero' || m.name === 'fightVillain' ||
                 m.name === 'fightMastermind' || m.name === 'advanceStage'
        );

        if (spendMoves.length === 0) break;

        // If only advanceStage remains, advance and exit
        if (spendMoves.length === 1 && spendMoves[0].name === 'advanceStage') {
          await submitMove({
            ...moveParams,
            playerId: player,
            moveName: 'advanceStage',
            moveArgs: undefined,
          });
          await recordAndPace(controller, db, matchId);
          break;
        }

        const uiBuildContext = {
          phase: state.ctx.phase,
          turn: state.ctx.turn,
          currentPlayer: player,
        };
        const fullUIState = buildUIState(state.G, uiBuildContext);
        const filteredView = filterUIStateForAudience(fullUIState, {
          kind: 'player',
          playerId: player,
        });

        const intent = policy.decideTurn(filteredView, spendMoves);
        console.log(`[autoplay] match ${matchId} turn ${turnCount}: spending → ${intent.move.name} ${JSON.stringify(intent.move.args)}`);

        await submitMove({
          ...moveParams,
          playerId: player,
          moveName: intent.move.name,
          moveArgs: intent.move.args,
        });
        spendAttempts++;
        await recordAndPace(controller, db, matchId);
      }
    }

    // --- Cleanup stage: end the turn ---
    ({ state } = await db.fetch(matchId, { state: true }));
    if (!state || state.ctx.gameover !== undefined) continue;

    if (state.G.currentStage === 'cleanup') {
      await submitMove({
        ...moveParams,
        playerId: state.ctx.currentPlayer,
        moveName: 'endTurn',
        moveArgs: undefined,
      });
      await recordAndPace(controller, db, matchId);
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
