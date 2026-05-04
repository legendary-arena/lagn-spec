/**
 * Contract enforcement tests for filterUIStateForAudience (WP-029).
 *
 * These tests are contract enforcement tests. They are not examples,
 * not smoke tests, and not illustrative. If tests fail, the implementation
 * is incorrect by definition. Do NOT weaken assertions to make tests pass —
 * fix the implementation instead.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterUIStateForAudience } from './uiState.filter.js';
import { buildUIState } from './uiState.build.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { UIState } from './uiState.types.js';
import type { UIAudience } from './uiAudience.types.js';

/** Audience constants for test readability. */
const PLAYER_0: UIAudience = { kind: 'player', playerId: '0' };
const PLAYER_1: UIAudience = { kind: 'player', playerId: '1' };
const SPECTATOR: UIAudience = { kind: 'spectator' };

/**
 * Creates a valid test MatchSetupConfig.
 */
function createTestConfig(): MatchSetupConfig {
  return {
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
}

/**
 * Minimal mock registry for tests.
 */
function createMockRegistry(): CardRegistryReader {
  return { listCards: () => [] };
}

/**
 * Inline mock for UIBuildContext.
 */
const mockCtx = {
  phase: 'play' as string | null,
  turn: 1,
  currentPlayer: '0',
};

/**
 * Constructs a UIState with known hand cards for testing filter behavior.
 *
 * Player '0' gets hand cards ['hero-card-001', 'hero-card-002'].
 * Player '1' gets hand card ['hero-card-003'].
 */
function createTestUIState(): UIState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  const gameState = buildInitialGameState(config, registry, setupContext);

  // why: populate hand with known cards so we can verify filter behavior.
  // After setup, hands are empty — manually add cards for testing.
  gameState.playerZones['0']!.hand.push('hero-card-001', 'hero-card-002');
  gameState.playerZones['1']!.hand.push('hero-card-003');

  return buildUIState(gameState, mockCtx);
}

describe('filterUIStateForAudience', () => {
  it('active player sees own hand card ext_ids', () => {
    const uiState = createTestUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_0);

    // why: player '0' is the active player and should see their own hand
    const player0 = result.players.find((player) => player.playerId === '0');
    assert.ok(player0 !== undefined, 'Player 0 must exist in filtered result');
    assert.ok(player0.handCards !== undefined, 'Active player must see own handCards');
    assert.ok(player0.handCards.includes('hero-card-001'), 'handCards must contain hero-card-001');
    assert.ok(player0.handCards.includes('hero-card-002'), 'handCards must contain hero-card-002');
    assert.equal(player0.handCount, 2, 'handCount must be 2');
  });

  it('active player does NOT see other player hand cards', () => {
    const uiState = createTestUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_0);

    // why: other players' hand contents are hidden — count only
    const player1 = result.players.find((player) => player.playerId === '1');
    assert.ok(player1 !== undefined, 'Player 1 must exist in filtered result');
    assert.equal(player1.handCards, undefined, 'Other player handCards must be undefined');
    assert.equal(player1.handCount, 1, 'Other player handCount must still be visible');
  });

  it('spectator sees hand counts for all players (no ext_ids)', () => {
    const uiState = createTestUIState();
    const result = filterUIStateForAudience(uiState, SPECTATOR);

    // why: spectators see hand counts only — no hand card ext_ids
    for (const player of result.players) {
      assert.equal(
        player.handCards,
        undefined,
        `Spectator must not see handCards for player ${player.playerId}`,
      );
      assert.equal(
        typeof player.handCount,
        'number',
        `handCount must be a number for player ${player.playerId}`,
      );
    }
  });

  it('spectator does NOT see any player hand cards', () => {
    const uiState = createTestUIState();
    const result = filterUIStateForAudience(uiState, SPECTATOR);

    // why: verify via serialization that no hand card ext_ids leak
    const json = JSON.stringify(result);
    assert.ok(!json.includes('hero-card-001'), 'hero-card-001 must not appear in spectator view');
    assert.ok(!json.includes('hero-card-002'), 'hero-card-002 must not appear in spectator view');
    assert.ok(!json.includes('hero-card-003'), 'hero-card-003 must not appear in spectator view');
  });

  it('deck order is never present in any audience view', () => {
    const uiState = createTestUIState();

    // why: deck contents/order are already hidden by buildUIState (WP-028)
    // — only deckCount exists, never a deck array
    for (const audience of [PLAYER_0, PLAYER_1, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      for (const player of result.players) {
        assert.ok(
          !('deckCards' in player),
          `deckCards must not exist for player ${player.playerId} in ${audience.kind} view`,
        );
        assert.ok(
          !('deck' in player),
          `deck must not exist for player ${player.playerId} in ${audience.kind} view`,
        );
        assert.equal(
          typeof player.deckCount,
          'number',
          `deckCount must be a number for player ${player.playerId}`,
        );
      }
    }
  });

  it('city and HQ are visible to all audiences', () => {
    const uiState = createTestUIState();

    for (const audience of [PLAYER_0, PLAYER_1, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      assert.ok(
        Array.isArray(result.city.spaces),
        `city.spaces must be an array in ${audience.kind} view`,
      );
      assert.ok(
        Array.isArray(result.hq.slots),
        `hq.slots must be an array in ${audience.kind} view`,
      );
    }
  });

  it('game log is visible to all audiences', () => {
    const uiState = createTestUIState();

    for (const audience of [PLAYER_0, PLAYER_1, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      assert.ok(
        Array.isArray(result.log),
        `log must be an array in ${audience.kind} view`,
      );
    }
  });

  it('filter does not mutate input UIState (deep equality check)', () => {
    const uiState = createTestUIState();
    const before = JSON.stringify(uiState);

    filterUIStateForAudience(uiState, PLAYER_0);
    filterUIStateForAudience(uiState, SPECTATOR);

    const after = JSON.stringify(uiState);
    assert.equal(before, after, 'Input UIState must not be mutated by filter');
  });

  it('filtered UIState is JSON-serializable', () => {
    const uiState = createTestUIState();

    for (const audience of [PLAYER_0, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json);
      assert.deepStrictEqual(
        parsed,
        result,
        `Filtered UIState must survive JSON roundtrip for ${audience.kind} view`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// WP-128 / EC-131 — audience-filter redaction matrix for new fields
// ---------------------------------------------------------------------------

/**
 * Builds a UIState with known in-play cards, victory cards, and
 * discard-top entries for the WP-128 redaction matrix tests.
 */
function createWp128TestUIState(): UIState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  const gameState = buildInitialGameState(config, registry, setupContext);

  // why: populate per-player zones with known cards so filter behavior
  // can be observed at the field level.
  gameState.playerZones['0']!.inPlay.push('inplay-0-001', 'inplay-0-002');
  gameState.playerZones['0']!.discard.push('discard-0-bottom', 'discard-0-top');
  gameState.playerZones['0']!.victory.push('victory-0-001');

  gameState.playerZones['1']!.inPlay.push('inplay-1-001');
  gameState.playerZones['1']!.discard.push('discard-1-top');
  gameState.playerZones['1']!.victory.push('victory-1-001', 'victory-1-002');

  return buildUIState(gameState, mockCtx);
}

describe('filterUIStateForAudience — WP-128 redaction matrix', () => {
  it('opponent audience: inPlayCards AND inPlayDisplay redacted (=== undefined)', () => {
    // why: D-12803 — non-self audiences see counts only for in-play
    // cards. Both fields omitted, mirroring handCards / handDisplay
    // privacy posture. EC-131 §5 verifies redaction via `=== undefined`
    // assertion.
    const uiState = createWp128TestUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_1);

    const player0 = result.players.find((p) => p.playerId === '0');
    assert.ok(player0 !== undefined);
    assert.equal(player0.inPlayCards, undefined, 'opponent inPlayCards must be undefined');
    assert.equal(player0.inPlayDisplay, undefined, 'opponent inPlayDisplay must be undefined');
    assert.equal(player0.inPlayCount, 2, 'inPlayCount must remain visible');
  });

  it('spectator audience: inPlayCards/inPlayDisplay AND handCards/handDisplay all redacted', () => {
    // why: D-12803 — spectators see counts only for both hand and
    // in-play. Same omit-don't-assign pattern; verified via
    // `=== undefined` assertion.
    const uiState = createWp128TestUIState();
    const result = filterUIStateForAudience(uiState, SPECTATOR);

    for (const player of result.players) {
      assert.equal(player.handCards, undefined, `spectator handCards must be undefined for ${player.playerId}`);
      assert.equal(player.handDisplay, undefined, `spectator handDisplay must be undefined for ${player.playerId}`);
      assert.equal(player.inPlayCards, undefined, `spectator inPlayCards must be undefined for ${player.playerId}`);
      assert.equal(player.inPlayDisplay, undefined, `spectator inPlayDisplay must be undefined for ${player.playerId}`);
    }
  });

  it('own player keeps inPlayCards / inPlayDisplay parallel arrays', () => {
    // why: D-12803 — viewing player sees own in-play array for gameplay.
    // Length-equality invariant with inPlayCount.
    const uiState = createWp128TestUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_0);

    const player0 = result.players.find((p) => p.playerId === '0');
    assert.ok(player0 !== undefined);
    assert.ok(player0.inPlayCards !== undefined, 'own inPlayCards must be present');
    assert.ok(player0.inPlayDisplay !== undefined, 'own inPlayDisplay must be present');
    assert.equal(player0.inPlayCards.length, 2);
    assert.equal(player0.inPlayCards.length, player0.inPlayDisplay.length);
  });

  it('discardTopCard / victoryCards / victoryVP visible to ALL audiences (public)', () => {
    // why: D-12803 — these are public fields. Verify each audience
    // (own / opponent / spectator) sees them. EC-131 §5 verifies
    // public-fields-not-redacted.
    const uiState = createWp128TestUIState();

    for (const audience of [PLAYER_0, PLAYER_1, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      for (const player of result.players) {
        assert.ok(
          player.discardTopCard !== undefined,
          `discardTopCard must be present for ${player.playerId} in ${audience.kind} view`,
        );
        assert.ok(
          player.victoryCards !== undefined,
          `victoryCards must be present for ${player.playerId} in ${audience.kind} view`,
        );
        assert.equal(
          typeof player.victoryVP,
          'number',
          `victoryVP must be a number for ${player.playerId} in ${audience.kind} view`,
        );
      }
    }
  });

  it('shared-board fields (decks/piles/koPile/mastermind/scheme/city) pass through every audience', () => {
    // why: D-12806 — shared-board projections are public. Filter must
    // produce per-entry shallow copies (no aliasing) but never redact.
    const uiState = createWp128TestUIState();

    for (const audience of [PLAYER_0, PLAYER_1, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      assert.equal(typeof result.decks.villainDeckCount, 'number');
      assert.equal(typeof result.piles.bystandersCount, 'number');
      assert.equal(typeof result.koPile.count, 'number');
      assert.ok(Array.isArray(result.mastermind.attachedBystanders));
      assert.ok(Array.isArray(result.mastermind.strikePile));
      assert.ok(Array.isArray(result.scheme.twistPile));
      assert.ok(Array.isArray(result.city.escapedPile));
    }
  });

});
