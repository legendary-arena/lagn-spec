/**
 * Tests for mastermind strike handler (WP-024, WP-154).
 *
 * Verifies bystander capture on strike, empty-supply logging,
 * negative assertions on city-villain attachedBystanders, and
 * serialization.
 *
 * No boardgame.io imports. Uses node:test and node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mastermindStrikeHandler } from './mastermindHandlers.js';
import type { LegendaryGameState } from '../types.js';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for mastermind handler testing.
 *
 * @returns A minimal LegendaryGameState with populated bystander supply.
 */
function makeTestState(): LegendaryGameState {
  return {
    matchConfiguration: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    },
    selection: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
    },
    currentStage: 'main' as LegendaryGameState['currentStage'],
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
      bystanders: ['bystander-001', 'bystander-002', 'bystander-003'],
      wounds: [],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: [],
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    turnEconomy: {
      attack: 0,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
    },
    cardStats: {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    },
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
    heroAbilityHooks: [],
    // why: WP-200 — mastermindStrikeHandler pushes one
    // `mastermindStrikeResolved` event to G.notableEvents at its terminal
    // point. Initialised here so the emission does not throw on a missing
    // field; required by D-20003.
    notableEvents: [],
  };
}

describe('mastermindStrikeHandler', () => {
  // -------------------------------------------------------------------------
  // Test 1: handler returns non-empty RuleEffect[]
  // -------------------------------------------------------------------------
  it('returns non-empty RuleEffect[]', () => {
    const gameState = makeTestState();
    const effects = mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.ok(Array.isArray(effects), 'result must be an array');
    assert.ok(effects.length > 0, 'result must not be empty');
  });

  // -------------------------------------------------------------------------
  // Test 2: produces counter increment effect
  // -------------------------------------------------------------------------
  it('produces modifyCounter effect for masterStrikeCount', () => {
    const gameState = makeTestState();
    const effects = mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    const counterEffect = effects.find(
      (effect) =>
        effect.type === 'modifyCounter' &&
        'counter' in effect &&
        (effect as { counter: string }).counter === 'masterStrikeCount',
    );

    assert.ok(counterEffect, 'must contain modifyCounter for masterStrikeCount');
    assert.equal(
      (counterEffect as { delta: number }).delta,
      1,
      'delta must be 1',
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: captures top bystander (index 0) from non-empty supply
  // -------------------------------------------------------------------------
  it('captures top bystander from supply onto mastermind.attachedBystanders', () => {
    const gameState = makeTestState();
    const originalBystanderCount = gameState.piles.bystanders.length;
    const topBystander = gameState.piles.bystanders[0];

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      1,
      'mastermind.attachedBystanders must have exactly 1 entry after capture',
    );
    assert.equal(
      gameState.mastermind.attachedBystanders[0],
      topBystander,
      'captured bystander must be the former index-0 card',
    );
    assert.equal(
      gameState.piles.bystanders.length,
      originalBystanderCount - 1,
      'bystander pile must shrink by exactly 1',
    );
    assert.equal(
      gameState.piles.bystanders[0],
      'bystander-002',
      'new top of pile must be the former index-1 card',
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: empty supply — no capture, message appended
  // -------------------------------------------------------------------------
  it('skips capture and appends message when bystander supply is empty', () => {
    const gameState = makeTestState();
    gameState.piles.bystanders = [];
    const messagesBefore = gameState.messages.length;

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      0,
      'no bystander captured when supply is empty',
    );
    assert.equal(
      gameState.messages.length,
      messagesBefore + 1,
      'exactly one message appended on empty supply',
    );
    assert.ok(
      gameState.messages[gameState.messages.length - 1]!.startsWith('[Master Strike]'),
      'empty-supply message must begin with [Master Strike] prefix',
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: city-villain attachedBystanders unchanged (negative assertion)
  // -------------------------------------------------------------------------
  it('does not modify G.attachedBystanders (city-villain captures)', () => {
    const gameState = makeTestState();
    const cityBystandersBefore = JSON.parse(JSON.stringify(gameState.attachedBystanders));

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.deepStrictEqual(
      gameState.attachedBystanders,
      cityBystandersBefore,
      'G.attachedBystanders (city-villain) must not be modified by mastermind strike',
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: bystander pile length unchanged when supply is empty
  // -------------------------------------------------------------------------
  it('bystander pile length remains 0 when supply is already empty', () => {
    const gameState = makeTestState();
    gameState.piles.bystanders = [];

    mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    assert.equal(
      gameState.piles.bystanders.length,
      0,
      'empty pile must remain at length 0',
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: effects are JSON-serializable
  // -------------------------------------------------------------------------
  it('effects are JSON-serializable', () => {
    const gameState = makeTestState();
    const effects = mastermindStrikeHandler(gameState, {}, { cardId: 'test-strike' });

    const serialized = JSON.stringify(effects);
    assert.ok(serialized, 'JSON.stringify(effects) must produce a non-empty string');
  });
});

// ---------------------------------------------------------------------------
// Magneto Master Strike dispatcher tests
// ---------------------------------------------------------------------------

describe('mastermindStrikeHandler — Magneto Master Strike', () => {
  /**
   * Creates a Magneto-shaped state with configurable hand sizes per player.
   * `hands` is keyed by player id; each value is an array of CardExtId
   * strings representing the player's hand from top (index 0) to bottom.
   */
  function makeMagnetoState(hands: Record<string, string[]>): LegendaryGameState {
    const gameState = makeTestState();
    gameState.selection = {
      ...gameState.selection,
      mastermindId: 'core/magneto',
    };
    gameState.playerZones = {};
    for (const [playerId, hand] of Object.entries(hands)) {
      gameState.playerZones[playerId] = {
        deck: [],
        hand: [...hand],
        discard: [],
        inPlay: [],
        victory: [],
      };
    }
    return gameState;
  }

  it('discards a 7-card hand down to 4', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'],
    });

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    assert.equal(
      gameState.playerZones['0']!.hand.length,
      4,
      'Hand must shrink to 4 cards after Magneto strike',
    );
    assert.equal(
      gameState.playerZones['0']!.discard.length,
      3,
      'Discarded cards must be appended to the discard pile',
    );
    // why: the kept cards are the bottom 4 (most recently drawn) so
    // discarded cards are h1..h3 from the top.
    assert.deepStrictEqual(
      gameState.playerZones['0']!.discard,
      ['h1', 'h2', 'h3'],
      'Top-of-hand cards must be discarded first',
    );
    assert.deepStrictEqual(
      gameState.playerZones['0']!.hand,
      ['h4', 'h5', 'h6', 'h7'],
      'Bottom-of-hand cards must remain',
    );
  });

  it('leaves a 4-card hand untouched', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2', 'h3', 'h4'],
    });

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    assert.equal(
      gameState.playerZones['0']!.hand.length,
      4,
      'Hand size already at the limit must not change',
    );
    assert.equal(
      gameState.playerZones['0']!.discard.length,
      0,
      'No cards discarded when hand size <= 4',
    );
  });

  it('leaves a hand smaller than 4 untouched', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2'],
    });

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    assert.deepStrictEqual(
      gameState.playerZones['0']!.hand,
      ['h1', 'h2'],
      'A 2-card hand must remain at 2 cards',
    );
    assert.equal(gameState.playerZones['0']!.discard.length, 0);
  });

  it('applies the discard rule to every player independently', () => {
    const gameState = makeMagnetoState({
      '0': ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
      '1': ['b1', 'b2', 'b3'],
      '2': ['c1', 'c2', 'c3', 'c4', 'c5'],
    });

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    assert.equal(gameState.playerZones['0']!.hand.length, 4, 'Player 0: 6 → 4');
    assert.equal(gameState.playerZones['0']!.discard.length, 2);

    assert.equal(gameState.playerZones['1']!.hand.length, 3, 'Player 1: 3 → 3 (no change)');
    assert.equal(gameState.playerZones['1']!.discard.length, 0);

    assert.equal(gameState.playerZones['2']!.hand.length, 4, 'Player 2: 5 → 4');
    assert.equal(gameState.playerZones['2']!.discard.length, 1);
  });

  it('still captures one bystander onto the mastermind (generic strike effect)', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2', 'h3', 'h4', 'h5'],
    });
    gameState.piles.bystanders = ['bystander-001', 'bystander-002'];

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      1,
      'Generic D-15401 bystander capture must still run on the Magneto path',
    );
    assert.equal(gameState.piles.bystanders.length, 1);
  });

  it('still returns the generic masterStrikeCount counter effect', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2', 'h3', 'h4', 'h5'],
    });

    const effects = mastermindStrikeHandler(
      gameState,
      {},
      { cardId: 'strike-card' },
      {},
    );

    const counterEffect = effects.find(
      (effect) =>
        effect.type === 'modifyCounter' &&
        'counter' in effect &&
        (effect as { counter: string }).counter === 'masterStrikeCount',
    );
    assert.ok(counterEffect, 'Magneto dispatch must still return masterStrikeCount');
  });

  it('logs a per-player message for both discard and no-discard outcomes', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2', 'h3', 'h4', 'h5'],
      '1': ['x1'],
    });

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    const player0Message = gameState.messages.find(
      (message) => message.includes('Magneto') && message.includes('Player 0'),
    );
    const player1Message = gameState.messages.find(
      (message) => message.includes('Magneto') && message.includes('Player 1'),
    );

    assert.ok(player0Message, 'Player 0 (discarded) must have a Magneto log line');
    assert.ok(player1Message, 'Player 1 (no discard) must have a Magneto log line');
  });

  it('does NOT run the Magneto branch for a non-Magneto mastermind', () => {
    const gameState = makeMagnetoState({
      '0': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    });
    gameState.selection = { ...gameState.selection, mastermindId: 'core/other-boss' };
    gameState.piles.bystanders = ['bystander-001'];

    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-card' }, {});

    assert.equal(
      gameState.playerZones['0']!.hand.length,
      6,
      'Non-Magneto mastermind must not trigger the hand-discard effect',
    );
    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      1,
      'Generic bystander capture still runs for any mastermind',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-200 — mastermindStrikeResolved emission
// ---------------------------------------------------------------------------

describe('mastermindStrikeHandler — WP-200 mastermindStrikeResolved emission', () => {
  it('pushes exactly one mastermindStrikeResolved event per strike resolution', () => {
    const gameState = makeTestState();
    mastermindStrikeHandler(gameState, {}, { cardId: 'master-strike-00' }, {});

    assert.equal(
      gameState.notableEvents.length,
      1,
      'exactly one mastermindStrikeResolved event must be emitted',
    );
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'mastermindStrikeResolved');
    if (event.type === 'mastermindStrikeResolved') {
      assert.equal(event.strikeCardId, 'master-strike-00');
      assert.ok(
        event.narrative.length > 0 && event.narrative.includes('master-strike-00'),
        'narrative is non-empty and names the strike card',
      );
    }
  });

  it('falls back to empty strikeCardId when payload is malformed (no throw)', () => {
    // why: WP-200 + architecture rules — moves never throw. Defensive
    // payload narrowing yields '' when the trigger payload is missing /
    // not an object / missing cardId. Production dispatch always supplies
    // `{ cardId: string }`; this guard only matters for the malformed-
    // payload code path that is reachable only via misuse / test stubs.
    const gameState = makeTestState();
    mastermindStrikeHandler(gameState, {}, null, {});
    assert.equal(gameState.notableEvents.length, 1);
    const event = gameState.notableEvents[0]!;
    if (event.type === 'mastermindStrikeResolved') {
      assert.equal(event.strikeCardId, '');
    }
  });
});
