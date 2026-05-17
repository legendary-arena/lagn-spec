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
        await delay(delayMs);
      }

      await submitMove({
        ...moveParams,
        playerId: currentPlayer,
        moveName: 'revealVillainCard',
        moveArgs: undefined,
      });
      await delay(delayMs);

      // Check for gameover after reveal (villains may have escaped)
      ({ state } = await db.fetch(matchId, { state: true }));
      if (!state || state.ctx.gameover !== undefined) continue;

      await submitMove({
        ...moveParams,
        playerId: currentPlayer,
        moveName: 'advanceStage',
        moveArgs: undefined,
      });
      await delay(delayMs);
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
        await delay(delayMs);
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
          await delay(delayMs);
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
        await delay(delayMs);
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
      await delay(delayMs);
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
