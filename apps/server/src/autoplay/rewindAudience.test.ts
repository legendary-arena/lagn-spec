/**
 * Tests for autoplay rewind requester audience derivation (WP-177 / EC-199).
 *
 * Covers resolveRequesterAudience (6 edge cases) and rewindUIState audience
 * parameter threading (spectator vs player).
 *
 * Run by the server test runner: `node --import tsx --test src/**\/*.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInitialGameState,
} from '@legendary-arena/game-engine';

import {
  resolveRequesterAudience,
  rewindUIState,
} from './autoplay.mjs';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal fake koa request context with optional identity headers.
 *
 * @param matchId - The match id for `params.matchId`.
 * @param headers - Optional header map; `.get()` returns '' for missing keys.
 */
function makeContext(matchId: string, headers: Record<string, string> = {}) {
  return {
    params: { matchId },
    status: undefined as number | undefined,
    body: undefined as unknown,
    get(headerName: string) {
      return headers[headerName] ?? '';
    },
  };
}

/**
 * Builds a mock db that returns the given metadata for any fetch call.
 */
function makeDb(metadata: unknown = null) {
  return {
    async fetch(_matchId: string, _options: unknown) {
      return { metadata };
    },
  };
}

/**
 * Builds a mock auth whose authenticateCredentials always returns `isAuthentic`.
 */
function makeAuth(isAuthentic: boolean = false) {
  return {
    authenticateCredentials(_args: unknown) {
      return isAuthentic;
    },
  };
}

/**
 * Builds a real LegendaryGameState via the engine's setup path, injects hand
 * cards for player 0, and wraps it in a snapshot object suitable for
 * rewindUIState.
 */
function createTestSnapshot() {
  const config = {
    schemeId: 'test-scheme-001',
    mastermindId: 'test-mastermind-001',
    villainGroupIds: ['test-villain-group-001'],
    henchmanGroupIds: ['test-henchman-group-001'],
    heroDeckIds: ['test-hero-deck-001', 'test-hero-deck-002'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  };
  const registry = { listCards: () => [] };
  const setupContext = {
    ctx: { numPlayers: 1 },
    random: { Shuffle: <T>(deck: T[]): T[] => [...deck].reverse() },
  };
  const gameState = buildInitialGameState(
    config as never,
    registry as never,
    setupContext as never,
  );

  // Inject hand cards so the audience filter has something to differentiate
  const playerZones = (gameState as { playerZones: Record<string, { hand: string[] }> }).playerZones;
  playerZones['0'].hand = ['hero-card-a', 'hero-card-b', 'hero-card-c'];

  return {
    G: gameState,
    ctx: { phase: 'play' as string, turn: 1, currentPlayer: '0' },
  };
}

// ---------------------------------------------------------------------------
// resolveRequesterAudience tests
// ---------------------------------------------------------------------------

test('resolveRequesterAudience returns spectator when no headers are present', async () => {
  const koaContext = makeContext('match-1');
  const result = await resolveRequesterAudience(koaContext, makeDb(), makeAuth(), 'match-1');
  assert.deepStrictEqual(result, { kind: 'spectator' });
});

test('resolveRequesterAudience returns spectator when X-Player-ID present but X-Credentials missing', async () => {
  const koaContext = makeContext('match-1', { 'X-Player-ID': '0' });
  const result = await resolveRequesterAudience(koaContext, makeDb(), makeAuth(), 'match-1');
  assert.deepStrictEqual(result, { kind: 'spectator' });
});

test('resolveRequesterAudience returns spectator when credentials fail validation', async () => {
  const metadata = { players: { '0': { id: 0, credentials: 'real-secret' } } };
  const koaContext = makeContext('match-1', {
    'X-Player-ID': '0',
    'X-Credentials': 'wrong-secret',
  });
  const result = await resolveRequesterAudience(koaContext, makeDb(metadata), makeAuth(false), 'match-1');
  assert.deepStrictEqual(result, { kind: 'spectator' });
});

test('resolveRequesterAudience returns player audience when credentials are valid', async () => {
  const metadata = { players: { '0': { id: 0, credentials: 'valid-secret' } } };
  const koaContext = makeContext('match-1', {
    'X-Player-ID': '0',
    'X-Credentials': 'valid-secret',
  });
  const result = await resolveRequesterAudience(koaContext, makeDb(metadata), makeAuth(true), 'match-1');
  assert.deepStrictEqual(result, { kind: 'player', playerId: '0' });
});

test('resolveRequesterAudience returns spectator when metadata fetch returns null', async () => {
  const koaContext = makeContext('match-1', {
    'X-Player-ID': '0',
    'X-Credentials': 'some-secret',
  });
  const result = await resolveRequesterAudience(koaContext, makeDb(null), makeAuth(true), 'match-1');
  assert.deepStrictEqual(result, { kind: 'spectator' });
});

test('resolveRequesterAudience returns spectator when metadata fetch throws', async () => {
  const throwingDb = {
    async fetch() {
      throw new Error('Database connection lost.');
    },
  };
  const koaContext = makeContext('match-1', {
    'X-Player-ID': '0',
    'X-Credentials': 'some-secret',
  });
  const result = await resolveRequesterAudience(koaContext, throwingDb, makeAuth(true), 'match-1');
  assert.deepStrictEqual(result, { kind: 'spectator' });
});

// ---------------------------------------------------------------------------
// rewindUIState audience parameter tests
// ---------------------------------------------------------------------------

test('rewindUIState with spectator audience hides hand cards', () => {
  const snapshot = createTestSnapshot();
  const uiState = rewindUIState(snapshot, { kind: 'spectator' });

  const player0 = uiState.players.find(
    (player: { playerId: string }) => player.playerId === '0',
  );
  assert.ok(player0, 'Player 0 should exist in the UIState players array.');
  assert.equal(player0.handCards, undefined, 'Spectator must not see hand card ext_ids.');
  assert.equal(player0.handCount, 3, 'Spectator should see the correct hand count.');
});

test('rewindUIState with player audience includes hand cards for that player', () => {
  const snapshot = createTestSnapshot();
  const uiState = rewindUIState(snapshot, { kind: 'player', playerId: '0' });

  const player0 = uiState.players.find(
    (player: { playerId: string }) => player.playerId === '0',
  );
  assert.ok(player0, 'Player 0 should exist in the UIState players array.');
  assert.ok(Array.isArray(player0.handCards), 'Player audience should see hand card ext_ids.');
  assert.equal(player0.handCards.length, 3, 'Player should see all 3 hand cards.');
});
