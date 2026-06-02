/**
 * Fight villain move tests for WP-016.
 *
 * Verifies fightVillain follows the three-step validation contract,
 * gates to main stage, removes villains from City to victory pile,
 * and handles invalid inputs gracefully.
 *
 * Uses node:test and node:assert only. Uses makeMockCtx. No boardgame.io
 * imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fightVillain } from './fightVillain.js';
import type { LegendaryGameState } from '../types.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { TURN_STAGES } from '../turn/turnPhases.types.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';

// ---------------------------------------------------------------------------
// Mock G factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for fight tests.
 * City has a villain at the specified index. Player 0 has empty zones.
 */
function createMockGameState(options?: {
  city?: LegendaryGameState['city'];
  currentStage?: LegendaryGameState['currentStage'];
}): LegendaryGameState {
  const config = {
    schemeId: 'test-scheme',
    mastermindId: 'test-mastermind',
    villainGroupIds: ['test-villain-group'],
    henchmanGroupIds: ['test-henchman-group'],
    heroDeckIds: ['test-hero-deck'],
    bystandersCount: 1,
    woundsCount: 1,
    officersCount: 1,
    sidekicksCount: 1,
  };

  return {
    matchConfiguration: config,
    selection: {
      schemeId: config.schemeId,
      mastermindId: config.mastermindId,
      villainGroupIds: [...config.villainGroupIds],
      henchmanGroupIds: [...config.henchmanGroupIds],
      heroDeckIds: [...config.heroDeckIds],
    },
    currentStage: options?.currentStage ?? 'main',
    playerZones: {
      '0': {
        deck: [],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    },
    piles: {
      bystanders: [],
      wounds: [],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: buildDefaultHookDefinitions(config),
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    turnEconomy: { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    cardStats: {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
    },
    city: options?.city ?? initializeCity(),
    hq: initializeHq(),
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
    // why: WP-200 — fightVillain pushes one `fightResolved` event to
    // `G.notableEvents` after the message push. Field initialised here so
    // the emission does not throw on missing-field; required by D-20003.
    notableEvents: [],
  };
}

/**
 * Creates a mock MoveContext for fightVillain.
 */
function createMockMoveContext(gameState: LegendaryGameState) {
  const mockCtx = makeMockCtx({ numPlayers: 1 });
  return {
    G: gameState,
    ctx: {
      ...mockCtx.ctx,
      currentPlayer: '0',
      phase: 'play',
      turn: 1,
      numMoves: 0,
      playOrder: ['0'],
      playOrderPos: 0,
      activePlayers: null,
    },
    random: mockCtx.random,
    events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
    playerID: '0' as string,
    log: { setMetadata: () => {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fightVillain', () => {
  it('removes card from G.city[cityIndex]', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, 'villain-c', null, null],
    });

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 0 });

    assert.equal(
      moveContext.G.city[0],
      null,
      'City space 0 must be null after fight',
    );
  });

  it('removed card appears in player victory zone', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
    });

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 0 });

    assert.ok(
      moveContext.G.playerZones['0']!.victory.includes('villain-a'),
      'villain-a must be in player 0 victory zone',
    );
  });

  it('invalid cityIndex (out of range): no mutation', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
    });

    const moveContext = createMockMoveContext(gameState);
    const cityBefore = [...moveContext.G.city];

    fightVillain(moveContext, { cityIndex: 5 });
    assert.deepStrictEqual(moveContext.G.city, cityBefore, 'City unchanged for index 5');

    fightVillain(moveContext, { cityIndex: -1 });
    assert.deepStrictEqual(moveContext.G.city, cityBefore, 'City unchanged for index -1');

    fightVillain(moveContext, { cityIndex: 2.5 });
    assert.deepStrictEqual(moveContext.G.city, cityBefore, 'City unchanged for non-integer');

    fightVillain(moveContext, { cityIndex: NaN });
    assert.deepStrictEqual(moveContext.G.city, cityBefore, 'City unchanged for NaN');
  });

  it('empty city space (null): no mutation', () => {
    const gameState = createMockGameState({
      city: [null, null, null, null, null],
    });

    const moveContext = createMockMoveContext(gameState);
    const victoryBefore = moveContext.G.playerZones['0']!.victory.length;

    fightVillain(moveContext, { cityIndex: 2 });

    assert.equal(
      moveContext.G.playerZones['0']!.victory.length,
      victoryBefore,
      'Victory zone must not change when fighting empty space',
    );
  });

  it('wrong stage (start): no mutation', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
      currentStage: 'start',
    });

    const moveContext = createMockMoveContext(gameState);
    const cityBefore = [...moveContext.G.city];
    const messagesBefore = moveContext.G.messages.length;

    fightVillain(moveContext, { cityIndex: 0 });

    assert.deepStrictEqual(
      moveContext.G.city,
      cityBefore,
      'City must not change when stage is not main',
    );
    assert.equal(
      moveContext.G.messages.length,
      messagesBefore,
      'No messages when stage gate blocks',
    );
  });

  it('JSON.stringify(G) succeeds after fight', () => {
    const gameState = createMockGameState({
      city: ['villain-a', 'villain-b', null, null, null],
    });

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 1 });

    const serialized = JSON.stringify(moveContext.G);
    assert.ok(serialized, 'JSON.stringify(G) must produce a non-empty string');
  });

  it('idempotence: second call on same index is no-op', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
    });

    const moveContext = createMockMoveContext(gameState);
    fightVillain(moveContext, { cityIndex: 0 });

    assert.equal(moveContext.G.playerZones['0']!.victory.length, 1, 'One card in victory after first fight');

    fightVillain(moveContext, { cityIndex: 0 });

    assert.equal(
      moveContext.G.playerZones['0']!.victory.length,
      1,
      'Victory unchanged after second fight on same (now null) space',
    );
  });

  // -------------------------------------------------------------------------
  // WP-200 — fightResolved emission
  // -------------------------------------------------------------------------

  it('WP-200: pushes exactly one fightResolved event with correct payload', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
    });
    const moveContext = createMockMoveContext(gameState);

    fightVillain(moveContext, { cityIndex: 0 });

    assert.equal(
      moveContext.G.notableEvents.length,
      1,
      'exactly one fightResolved event must be emitted',
    );
    const event = moveContext.G.notableEvents[0]!;
    assert.equal(event.type, 'fightResolved');
    if (event.type === 'fightResolved') {
      assert.equal(event.playerId, '0');
      assert.equal(event.cardId, 'villain-a');
      assert.equal(event.citySpace, 0);
      assert.equal(event.bystandersRescued, 0);
      assert.deepStrictEqual(
        event.appliedEffects,
        [],
        'no villain ability hooks in this test G → appliedEffects empty',
      );
      assert.ok(
        event.narrative.length > 0 && event.narrative.includes('villain-a'),
        'narrative is non-empty and names the card',
      );
    }
  });

  it('WP-200: fightResolved event is NOT pushed when the move short-circuits', () => {
    const gameState = createMockGameState({
      city: ['villain-a', null, null, null, null],
      currentStage: 'start',
    });
    const moveContext = createMockMoveContext(gameState);

    fightVillain(moveContext, { cityIndex: 0 });

    assert.equal(
      moveContext.G.notableEvents.length,
      0,
      'stage-gated short-circuit must not push an event',
    );
  });
});
