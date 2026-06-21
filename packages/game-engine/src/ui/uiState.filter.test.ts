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
import type { HollowEffectRecord } from '../diagnostics/hollowEffect.types.js';

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

// ---------------------------------------------------------------------------
// WP-243 / EC-274 — discard + pendingKoHeroChoice redaction (D-24011)
// ---------------------------------------------------------------------------

/**
 * Builds a UIState where player '0' owes a KO choice with eligible cards
 * spanning their (private) hand + discard. The chooser's hand identities are
 * the leak vector — they must not appear in a non-chooser's UIState.
 */
function createKoChoiceUIState(): UIState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  const gameState = buildInitialGameState(config, registry, setupContext);

  gameState.playerZones['0']!.hand = ['ko-hand-secret-a', 'ko-hand-secret-b'];
  gameState.playerZones['0']!.discard = ['ko-disc-secret-c'];
  gameState.playerZones['1']!.hand = ['p1-card'];
  gameState.pendingKoHeroChoices = [{ choiceType: 'ko-hero', playerID: '0' }];

  return buildUIState(gameState, mockCtx);
}

describe('filterUIStateForAudience — discard redaction (WP-243)', () => {
  it('owner sees own discardCards / discardDisplay; opponent + spectator do not', () => {
    const uiState = createKoChoiceUIState();

    const owner = filterUIStateForAudience(uiState, PLAYER_0).players.find((p) => p.playerId === '0')!;
    assert.ok(owner.discardCards !== undefined, 'owner sees discardCards');
    assert.ok(owner.discardDisplay !== undefined, 'owner sees discardDisplay');

    const opponentView = filterUIStateForAudience(uiState, PLAYER_1).players.find((p) => p.playerId === '0')!;
    assert.equal(opponentView.discardCards, undefined, 'opponent does NOT see discardCards');
    assert.equal(opponentView.discardDisplay, undefined, 'opponent does NOT see discardDisplay');

    const spectatorView = filterUIStateForAudience(uiState, SPECTATOR).players.find((p) => p.playerId === '0')!;
    assert.equal(spectatorView.discardCards, undefined, 'spectator does NOT see discardCards');
    assert.equal(spectatorView.discardDisplay, undefined, 'spectator does NOT see discardDisplay');
  });
});

describe('filterUIStateForAudience — pendingKoHeroChoice redaction (D-24011)', () => {
  it('the chooser sees pendingKoHeroChoice with the full eligible list', () => {
    const uiState = createKoChoiceUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_0);
    assert.ok(result.pendingKoHeroChoice !== undefined, 'chooser sees the KO choice');
    assert.equal(result.pendingKoHeroChoice!.playerID, '0');
    assert.ok(result.pendingKoHeroChoice!.eligible.length >= 1, 'eligible list non-empty');
  });

  it('an opponent does NOT see pendingKoHeroChoice and none of the chooser hand ext_ids leak', () => {
    const uiState = createKoChoiceUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_1);
    assert.equal(result.pendingKoHeroChoice, undefined, 'opponent must not see the KO choice');
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('ko-hand-secret-a'), false, 'no chooser hand ext_id leaks');
    assert.equal(serialized.includes('ko-hand-secret-b'), false, 'no chooser hand ext_id leaks');
  });

  it('a spectator does NOT see pendingKoHeroChoice and none of the chooser hand ext_ids leak', () => {
    const uiState = createKoChoiceUIState();
    const result = filterUIStateForAudience(uiState, SPECTATOR);
    assert.equal(result.pendingKoHeroChoice, undefined, 'spectator must not see the KO choice');
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('ko-hand-secret-a'), false, 'no chooser hand ext_id leaks');
    assert.equal(serialized.includes('ko-hand-secret-b'), false, 'no chooser hand ext_id leaks');
  });

  it('does not mutate the input UIState (pendingKoHeroChoice still present on the source)', () => {
    const uiState = createKoChoiceUIState();
    filterUIStateForAudience(uiState, PLAYER_1);
    assert.ok(uiState.pendingKoHeroChoice !== undefined, 'source UIState unchanged');
  });
});

// ---------------------------------------------------------------------------
// WP-249 / EC-280 — pendingOptionalKoReward redaction (D-24020, D-24011 analog)
// ---------------------------------------------------------------------------

/**
 * Builds a UIState where player '0' owes an optional-KO-reward choice with
 * eligible cards spanning their (private) hand + discard. Both the hand and
 * discard identities are leak vectors — they must not appear in a non-chooser's
 * UIState.
 */
function createOptionalRewardUIState(): UIState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  const gameState = buildInitialGameState(config, registry, setupContext);

  // why: the discard TOP card (last index) is PUBLIC via discardTopCard (D-12803,
  // face-up at the table), so the leak assertions target the non-top index-0
  // discard card, which is private (exposed only via the redacted discardCards
  // and the chooser-only eligible list). Hand identities are fully private.
  gameState.playerZones['0']!.hand = ['okr-hand-secret-a', 'okr-hand-secret-b'];
  gameState.playerZones['0']!.discard = ['okr-disc-secret-bottom', 'okr-disc-public-top'];
  gameState.playerZones['1']!.hand = ['p1-card'];
  gameState.pendingOptionalKoRewards = [
    { playerID: '0', rewardType: 'rescue', rewardMagnitude: 1, sourceCardId: 'okr-src' },
  ];

  return buildUIState(gameState, mockCtx);
}

describe('filterUIStateForAudience — pendingOptionalKoReward redaction (D-24020)', () => {
  it('the chooser sees pendingOptionalKoReward with the full eligible hand + discard', () => {
    const uiState = createOptionalRewardUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_0);
    assert.ok(result.pendingOptionalKoReward !== undefined, 'chooser sees the optional-KO-reward choice');
    assert.equal(result.pendingOptionalKoReward!.playerID, '0');
    assert.equal(result.pendingOptionalKoReward!.rewardLabel, 'Rescue a Bystander');
    assert.equal(result.pendingOptionalKoReward!.eligibleHand.length, 2, 'eligibleHand projected for the chooser');
    assert.equal(result.pendingOptionalKoReward!.eligibleDiscard.length, 2, 'eligibleDiscard projected for the chooser');
  });

  it('an opponent does NOT see pendingOptionalKoReward and none of the chooser private hand/discard ext_ids leak', () => {
    const uiState = createOptionalRewardUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_1);
    assert.equal(result.pendingOptionalKoReward, undefined, 'opponent must not see the optional-KO-reward choice');
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('okr-hand-secret-a'), false, 'no chooser hand ext_id leaks');
    assert.equal(serialized.includes('okr-hand-secret-b'), false, 'no chooser hand ext_id leaks');
    assert.equal(serialized.includes('okr-disc-secret-bottom'), false, 'no chooser non-top discard ext_id leaks');
  });

  it('a spectator does NOT see pendingOptionalKoReward and none of the chooser private hand/discard ext_ids leak', () => {
    const uiState = createOptionalRewardUIState();
    const result = filterUIStateForAudience(uiState, SPECTATOR);
    assert.equal(result.pendingOptionalKoReward, undefined, 'spectator must not see the optional-KO-reward choice');
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('okr-hand-secret-a'), false, 'no chooser hand ext_id leaks');
    assert.equal(serialized.includes('okr-hand-secret-b'), false, 'no chooser hand ext_id leaks');
    assert.equal(serialized.includes('okr-disc-secret-bottom'), false, 'no chooser non-top discard ext_id leaks');
  });

  it('per-entry display is a defensive copy — mutating the chooser result does not affect the source', () => {
    const uiState = createOptionalRewardUIState();
    const result = filterUIStateForAudience(uiState, PLAYER_0);
    result.pendingOptionalKoReward!.eligibleHand[0]!.display.name = 'mutated';
    assert.notEqual(
      uiState.pendingOptionalKoReward!.eligibleHand[0]!.display.name,
      'mutated',
      'source UIState eligible display untouched',
    );
  });

  it('does not mutate the input UIState (pendingOptionalKoReward still present on the source)', () => {
    const uiState = createOptionalRewardUIState();
    filterUIStateForAudience(uiState, PLAYER_1);
    assert.ok(uiState.pendingOptionalKoReward !== undefined, 'source UIState unchanged');
  });
});

// ---------------------------------------------------------------------------
// WP-258 / EC-289 — hollowEffects public value-preserving pass-through (D-12803)
// ---------------------------------------------------------------------------

/**
 * Builds two sample HollowEffectRecord values for the pass-through tests.
 */
function sampleHollowEffectRecords(): HollowEffectRecord[] {
  return [
    {
      cardId: 'core/black-widow/covert-operation#0',
      cardType: 'hero',
      timing: 'onPlay',
      mechanic: 'covert-operation',
      reason: 'no-handler',
      turn: 3,
    },
    {
      cardId: 'core/doombot-legion#1',
      cardType: 'villain',
      timing: 'onAmbush',
      mechanic: 'ambush-discard',
      reason: 'unsupported-keyword',
      turn: 5,
    },
  ];
}

/**
 * Builds a UIState carrying a populated G.diagnostics.hollowEffects channel.
 */
function createHollowEffectsUIState(): UIState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  const gameState = buildInitialGameState(config, registry, setupContext);
  gameState.diagnostics = {
    hollowEffects: sampleHollowEffectRecords(),
    hollowEffectsDropped: 0,
  };
  return buildUIState(gameState, mockCtx);
}

describe('filterUIStateForAudience — hollowEffects public pass-through (D-12803)', () => {
  it('own-player filtered hollowEffects deep-equals the source records', () => {
    // why: D-12803 — hollowEffects is public card/mechanic data; the filter must
    // pass it through value-unchanged for the own-player audience.
    const uiState = createHollowEffectsUIState();
    const source = uiState.hollowEffects;

    const result = filterUIStateForAudience(uiState, PLAYER_0);

    assert.ok(result.hollowEffects !== undefined, 'own-player must see hollowEffects');
    assert.deepStrictEqual(
      result.hollowEffects,
      source,
      'own-player hollowEffects must deep-equal the source records',
    );
  });

  it('other-player filtered hollowEffects deep-equals the SAME source records', () => {
    // why: D-12803 — the filter redacts NOTHING for hollowEffects; an opponent
    // sees the identical record values (no redact / reorder / rewrite / drop).
    const uiState = createHollowEffectsUIState();
    const source = uiState.hollowEffects;

    const result = filterUIStateForAudience(uiState, PLAYER_1);

    assert.ok(result.hollowEffects !== undefined, 'other-player must see hollowEffects');
    assert.deepStrictEqual(
      result.hollowEffects,
      source,
      'other-player hollowEffects must deep-equal the same source records',
    );
  });

  it('spectator filtered hollowEffects deep-equals the SAME source records', () => {
    // why: D-12803 — spectators are a non-owner public audience; same value-
    // preserving pass-through as the other-player case.
    const uiState = createHollowEffectsUIState();
    const source = uiState.hollowEffects;

    const result = filterUIStateForAudience(uiState, SPECTATOR);

    assert.ok(result.hollowEffects !== undefined, 'spectator must see hollowEffects');
    assert.deepStrictEqual(result.hollowEffects, source);
  });

  it('passes through value-equal but NOT array-identical (per-record fresh copy)', () => {
    // why: aliasing defense — value equality is required, array identity is NOT
    // (a shallow/per-record copy is allowed/preferred so the filtered view does
    // not alias the input). Mutating the filtered copy must not touch the source.
    const uiState = createHollowEffectsUIState();

    const result = filterUIStateForAudience(uiState, PLAYER_0);

    assert.notStrictEqual(
      result.hollowEffects,
      uiState.hollowEffects,
      'filtered hollowEffects must be a fresh array, not the same reference',
    );
    result.hollowEffects![0]!.mechanic = 'mutated';
    assert.notEqual(
      uiState.hollowEffects![0]!.mechanic,
      'mutated',
      'source UIState hollowEffects untouched by mutating the filtered copy',
    );
  });

  it('omits hollowEffects for all audiences when the source has none', () => {
    // why: optional field — an absent source omits it for every audience (no
    // empty-array injection).
    const config = createTestConfig();
    const registry = createMockRegistry();
    const setupContext = makeMockCtx();
    const gameState = buildInitialGameState(config, registry, setupContext);
    const uiState = buildUIState(gameState, mockCtx);
    assert.equal(uiState.hollowEffects, undefined);

    for (const audience of [PLAYER_0, PLAYER_1, SPECTATOR]) {
      const result = filterUIStateForAudience(uiState, audience);
      assert.equal(result.hollowEffects, undefined);
      assert.equal('hollowEffects' in result, false);
    }
  });
});
