import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LegendaryGame } from './game.js';
import type { MatchConfiguration } from './types.js';
import { makeMockCtx } from './test/mockCtx.js';

/**
 * Creates a valid mock MatchConfiguration for testing.
 *
 * All values are plausible ext_id strings and counts that satisfy the
 * MatchConfiguration interface. These are not real card ext_ids — they exist
 * only to exercise the setup contract.
 */
/**
 * @amended WP-113 PS-7: bare slug fixtures migrated to set-qualified
 *   form `'<setAbbr>/<slug>'` per the qualified-ID contract
 *   (per D-10014). Assertions below
 *   were updated to match.
 */
function createMockMatchConfiguration(): MatchConfiguration {
  return {
    schemeId: 'test/test-scheme-001',
    mastermindId: 'test/test-mastermind-001',
    villainGroupIds: ['test/test-villain-group-001', 'test/test-villain-group-002'],
    henchmanGroupIds: ['test/test-henchman-group-001'],
    heroDeckIds: ['test/test-hero-deck-001', 'test/test-hero-deck-002', 'test/test-hero-deck-003'],
    bystandersCount: 30,
    woundsCount: 30,
    officersCount: 30,
    sidekicksCount: 0,
  };
}

describe('LegendaryGame', () => {
  it('setup() returns a JSON-serializable game state', () => {
    const mockConfiguration = createMockMatchConfiguration();

    // why: boardgame.io 0.50.x setup receives (context, setupData) where
    // context includes { ctx, random, events, log }. makeMockCtx provides
    // the minimal shape needed by buildInitialGameState.
    const mockContext = makeMockCtx({ numPlayers: 2 });
    const gameState = LegendaryGame.setup!(
      mockContext as Parameters<NonNullable<typeof LegendaryGame.setup>>[0],
      mockConfiguration,
    );

    // G must be JSON-serializable at all times — no functions, classes, Maps,
    // Sets, Dates, or Symbols. If this throws, the game state contract is broken.
    const serialized = JSON.stringify(gameState);
    assert.ok(serialized, 'JSON.stringify(G) must produce a non-empty string');

    // Round-trip: parse the serialized state and verify it matches the original.
    const deserialized = JSON.parse(serialized);
    assert.deepStrictEqual(
      deserialized,
      gameState,
      'Game state must survive JSON round-trip without data loss',
    );
  });

  it('setup() includes all 9 MatchConfiguration fields in the returned state', () => {
    const mockConfiguration = createMockMatchConfiguration();

    const mockContext = makeMockCtx({ numPlayers: 2 });
    const gameState = LegendaryGame.setup!(
      mockContext as Parameters<NonNullable<typeof LegendaryGame.setup>>[0],
      mockConfiguration,
    );

    assert.equal(gameState.matchConfiguration.schemeId, 'test/test-scheme-001');
    assert.equal(gameState.matchConfiguration.mastermindId, 'test/test-mastermind-001');
    assert.deepStrictEqual(gameState.matchConfiguration.villainGroupIds, ['test/test-villain-group-001', 'test/test-villain-group-002']);
    assert.deepStrictEqual(gameState.matchConfiguration.henchmanGroupIds, ['test/test-henchman-group-001']);
    assert.deepStrictEqual(gameState.matchConfiguration.heroDeckIds, ['test/test-hero-deck-001', 'test/test-hero-deck-002', 'test/test-hero-deck-003']);
    assert.equal(gameState.matchConfiguration.bystandersCount, 30);
    assert.equal(gameState.matchConfiguration.woundsCount, 30);
    assert.equal(gameState.matchConfiguration.officersCount, 30);
    assert.equal(gameState.matchConfiguration.sidekicksCount, 0);
  });

  it('setup() throws when matchConfiguration is not provided', () => {
    const mockContext = makeMockCtx({ numPlayers: 2 });
    assert.throws(
      () => {
        LegendaryGame.setup!(
          mockContext as Parameters<NonNullable<typeof LegendaryGame.setup>>[0],
          undefined,
        );
      },
      {
        message: /requires a MatchConfiguration argument/,
      },
    );
  });

  it('defines exactly 4 phases: lobby, setup, play, end', () => {
    const phaseNames = Object.keys(LegendaryGame.phases ?? {});
    assert.deepStrictEqual(
      phaseNames.sort(),
      ['end', 'lobby', 'play', 'setup'],
      'LegendaryGame must define exactly 4 phases: lobby, setup, play, end',
    );
  });

  it('defines moves: advanceStage, drawCards, endTurn, fightMastermind, fightVillain, playCard, recruitHero, resolveHeroChoice, and revealVillainCard', () => {
    const moveNames = Object.keys(LegendaryGame.moves ?? {});
    assert.deepStrictEqual(
      moveNames.sort(),
      ['advanceStage', 'drawCards', 'endTurn', 'fightMastermind', 'fightVillain', 'playCard', 'recruitHero', 'resolveHeroChoice', 'revealVillainCard'],
      'LegendaryGame must define exactly 9 moves',
    );
  });

  it('configures lobby phase with activePlayers: { all: "lobbyReady" } + matching stages block per D-10007', () => {
    // why: drift-detection lock for the WP-100 fix-forward (D-10007). Without
    // this config, boardgame.io rejects setPlayerReady / startMatchIfReady
    // from any player other than ctx.currentPlayer with "player not active",
    // making lobby ready-up impossible for player 1+. The stage-name approach
    // (`{ all: 'lobbyReady' }` + empty `stages.lobbyReady: {}`) is the
    // type-clean equivalent of boardgame.io's ActivePlayers.ALL constant
    // (which uses `{ all: Stage.NULL }` where Stage.NULL: null at runtime,
    // but is typed as `any` in turn-order.d.ts). The bare-null literal is
    // rejected by `StageArg = StageName | object`; the named empty stage
    // satisfies the type without changing runtime semantics.
    const phases = LegendaryGame.phases as
      | Record<
          string,
          {
            turn?: {
              activePlayers?: unknown;
              stages?: Record<string, unknown>;
            };
          }
        >
      | undefined;
    const lobbyPhase = phases?.lobby;
    assert.notEqual(
      lobbyPhase,
      undefined,
      'lobby phase must be configured on LegendaryGame',
    );
    assert.deepStrictEqual(
      lobbyPhase?.turn?.activePlayers,
      { all: 'lobbyReady' },
      'lobby phase turn.activePlayers must be { all: "lobbyReady" } per D-10007 — without it, only the turn-holder can submit setPlayerReady/startMatchIfReady',
    );
    assert.deepStrictEqual(
      lobbyPhase?.turn?.stages,
      { lobbyReady: {} },
      'lobby phase turn.stages.lobbyReady must exist (empty config) per D-10007 — required by boardgame.io to validate the activePlayers stage reference',
    );
  });
});
