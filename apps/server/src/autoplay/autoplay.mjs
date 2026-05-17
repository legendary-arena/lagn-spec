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
 * Registers the POST /api/match/autoplay route.
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
 * Runs the full bot match: lobby ready-up, then play phase until game over.
 *
 * @param {object} params - All parameters for the bot match.
 */
async function runBotMatch({ matchId, playerCount, credentials, db, transport, auth, processedGame, policyName, delayMs, seed }) {
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
  await delay(delayMs);

  // Create AI policy
  const policy = policyName === 'random'
    ? createRandomPolicy(seed)
    : createCompetentHeuristicPolicy(seed);

  // Play phase: loop until game over
  let stuckCounter = 0;
  const maxStuckMoves = 2000;

  while (stuckCounter < maxStuckMoves) {
    const { state } = await db.fetch(matchId, { state: true });
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
    const lifecycleContext = {
      phase: state.ctx.phase,
      turn: state.ctx.turn,
      currentPlayer,
      numPlayers: state.ctx.numPlayers,
    };

    const legalMoves = getLegalMoves(state.G, lifecycleContext);
    if (legalMoves.length === 0) {
      console.error(`[autoplay] match ${matchId} stuck — no legal moves for player ${currentPlayer}.`);
      break;
    }

    // Build filtered UIState for the policy
    const uiBuildContext = {
      phase: state.ctx.phase,
      turn: state.ctx.turn,
      currentPlayer,
    };
    const fullUIState = buildUIState(state.G, uiBuildContext);
    const filteredView = filterUIStateForAudience(fullUIState, {
      kind: 'player',
      playerId: currentPlayer,
    });

    // Run AI policy
    const intent = policy.decideTurn(filteredView, legalMoves);

    // Submit the chosen move
    const result = await submitMove({
      ...moveParams,
      playerId: currentPlayer,
      moveName: intent.move.name,
      moveArgs: intent.move.args,
    });

    if (result && result.error) {
      console.error(`[autoplay] match ${matchId} move rejected: ${result.error}`);
      stuckCounter++;
      continue;
    }

    stuckCounter++;
    await delay(delayMs);
  }

  if (stuckCounter >= maxStuckMoves) {
    console.warn(`[autoplay] match ${matchId} hit move limit (${maxStuckMoves}).`);
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
