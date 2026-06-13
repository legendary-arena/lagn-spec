/**
 * Contract enforcement tests for buildUIState (WP-028).
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
import { buildUIState, UNKNOWN_DISPLAY_PLACEHOLDER } from './uiState.build.js';
import { filterUIStateForAudience } from './uiState.filter.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { LegendaryGameState, CardExtId, PendingHeroChoice } from '../types.js';
import type { UICardDisplay } from './uiState.types.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';

/**
 * Creates a valid test MatchSetupConfig. Same pattern used in
 * buildInitialGameState.shape.test.ts.
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
 * Minimal mock registry for tests. Returns empty card list since
 * UIState tests do not require card validation.
 */
function createMockRegistry(): CardRegistryReader {
  return { listCards: () => [] };
}

/**
 * Inline mock for UIBuildContext. This is NOT makeMockCtx (which returns
 * SetupContext) — it matches the local UIBuildContext structural interface
 * that buildUIState expects.
 */
const mockCtx = {
  phase: 'play' as string | null,
  turn: 1,
  currentPlayer: '0',
};

/**
 * Constructs a valid LegendaryGameState for testing.
 */
function createTestGameState(): LegendaryGameState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  return buildInitialGameState(config, registry, setupContext);
}

describe('buildUIState', () => {
  it('returns a valid UIState for a standard game state', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    // why: verify all top-level keys from the locked UIState shape exist
    assert.ok('game' in result, 'UIState must have game key');
    assert.ok('players' in result, 'UIState must have players key');
    assert.ok('city' in result, 'UIState must have city key');
    assert.ok('hq' in result, 'UIState must have hq key');
    assert.ok('mastermind' in result, 'UIState must have mastermind key');
    assert.ok('scheme' in result, 'UIState must have scheme key');
    assert.ok('economy' in result, 'UIState must have economy key');
    assert.ok('log' in result, 'UIState must have log key');

    assert.equal(result.game.phase, 'play');
    assert.equal(result.game.turn, 1);
    assert.equal(result.game.activePlayerId, '0');
  });

  it('UIState is JSON-serializable (roundtrip)', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    assert.deepStrictEqual(parsed, result);
  });

  it('UIState does NOT contain hookRegistry', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    assert.ok(!('hookRegistry' in result), 'hookRegistry must not appear in UIState');

    // why: also check the serialized form to catch nested leakage
    const json = JSON.stringify(result);
    assert.ok(
      !json.includes('"hookRegistry"'),
      'hookRegistry must not appear anywhere in serialized UIState',
    );
  });

  it('UIState does NOT contain villainDeckCardTypes', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    assert.ok(
      !('villainDeckCardTypes' in result),
      'villainDeckCardTypes must not appear in UIState',
    );
  });

  it('UIState does NOT contain cardStats', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    assert.ok(!('cardStats' in result), 'cardStats must not appear in UIState');
  });

  it('player zones are projected as counts (not card arrays)', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    assert.ok(result.players.length > 0, 'Must have at least one player');

    const firstPlayer = result.players[0]!;
    assert.equal(typeof firstPlayer.deckCount, 'number', 'deckCount must be a number');
    assert.equal(typeof firstPlayer.handCount, 'number', 'handCount must be a number');
    assert.equal(typeof firstPlayer.discardCount, 'number', 'discardCount must be a number');
    assert.equal(typeof firstPlayer.inPlayCount, 'number', 'inPlayCount must be a number');
    assert.equal(typeof firstPlayer.victoryCount, 'number', 'victoryCount must be a number');
    assert.equal(typeof firstPlayer.woundCount, 'number', 'woundCount must be a number');
    assert.ok(!Array.isArray(firstPlayer.deckCount), 'deckCount must not be an array');
  });

  it('buildUIState does not mutate input G (deep equality check)', () => {
    const gameState = createTestGameState();
    const gBefore = JSON.stringify(gameState);

    buildUIState(gameState, mockCtx);

    const gAfter = JSON.stringify(gameState);
    assert.equal(gBefore, gAfter, 'G must not be mutated by buildUIState');
  });

  it('same G + ctx produces identical UIState (deterministic)', () => {
    const gameState = createTestGameState();

    const result1 = buildUIState(gameState, mockCtx);
    const result2 = buildUIState(gameState, mockCtx);

    assert.deepStrictEqual(result1, result2, 'UIState must be deterministic');
  });

  it('game-over state is projected when endgame result exists', () => {
    const gameState = createTestGameState();

    // why: set mastermindDefeated counter to trigger heroes-win endgame
    // via evaluateEndgame. Use ENDGAME_CONDITIONS constant, not raw string.
    gameState.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED] = 1;

    const result = buildUIState(gameState, mockCtx);

    assert.ok(result.gameOver !== undefined, 'gameOver must be present when endgame triggers');
    assert.equal(result.gameOver!.outcome, 'heroes-win');
    assert.ok(result.gameOver!.scores !== undefined, 'scores must be present in gameOver');
  });
});

// ---------------------------------------------------------------------------
// WP-111 / EC-118 — display projection coverage
// ---------------------------------------------------------------------------

/**
 * Helper: builds a synthetic G with populated cardDisplayData, hand, City,
 * HQ, and mastermind base card so projection tests can exercise the
 * display-resolution paths. The narrow mock registry used by
 * createTestGameState produces empty cardDisplayData; this helper
 * injects realistic fixture data on top.
 */
function makeGameStateWithDisplayData(): LegendaryGameState {
  const gameState = createTestGameState();

  const heroExtId = 'core/black-widow/strike#0' as CardExtId;
  const villainExtId = 'core-villain-brotherhood-magneto-00' as CardExtId;
  const henchmanExtId = 'henchman-doombot-legion-00' as CardExtId;
  const mastermindBaseExtId = 'core-mastermind-dr-doom-doctor-doom' as CardExtId;

  // why: inject realistic display data; narrow mock registry produced
  // an empty record at setup time. This is a test helper, not a
  // production code path.
  const injectedDisplay: Record<CardExtId, UICardDisplay> = {
    [heroExtId]: {
      extId: heroExtId,
      name: 'Mission Accomplished',
      imageUrl: 'https://images.barefootbetters.com/core/hero-black-widow-1.webp',
      cost: 2,
    },
    [villainExtId]: {
      extId: villainExtId,
      name: 'Magneto',
      imageUrl: 'https://images.barefootbetters.com/core/villain-magneto.webp',
      cost: 5,
    },
    [henchmanExtId]: {
      extId: henchmanExtId,
      name: 'Doombot Legion',
      imageUrl: 'https://images.barefootbetters.com/core/hm-doombot-legion.webp',
      cost: 3,
    },
    [mastermindBaseExtId]: {
      extId: mastermindBaseExtId,
      name: 'Dr. Doom',
      imageUrl: 'https://images.barefootbetters.com/core/mm-dr-doom.webp',
      cost: 9,
    },
  };
  (gameState as { cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>> }).cardDisplayData = injectedDisplay;

  // Populate hand with the hero card so handDisplay has non-empty content.
  const playerZones = gameState.playerZones['0']!;
  playerZones.hand = [heroExtId, heroExtId];

  // Populate City space 0 with the villain.
  gameState.city[0] = villainExtId;

  // Populate HQ slot 0 with the hero.
  gameState.hq[0] = heroExtId;
  gameState.hq[2] = henchmanExtId;

  // Wire the mastermind baseCardId so the projection lookup hits an
  // injected entry rather than the narrow-mock empty one.
  (gameState.mastermind as { baseCardId: CardExtId }).baseCardId =
    mastermindBaseExtId;

  return gameState;
}

describe('buildUIState — display projection (WP-111 / EC-118)', () => {
  it('every CardExtId has display with non-empty name and imageUrl', () => {
    const gameState = makeGameStateWithDisplayData();

    const ui = buildUIState(gameState, mockCtx);

    // City space 0 has the injected villain
    const citySpace0 = ui.city.spaces[0];
    assert.ok(citySpace0 !== null, 'City space 0 must be populated');
    assert.ok(citySpace0!.display.name.length > 0, 'City display name non-empty');
    assert.ok(citySpace0!.display.imageUrl.length > 0, 'City display imageUrl non-empty');
    assert.equal(citySpace0!.display.cost, 5);

    // HQ slot 0 has the injected hero
    const hqSlot0 = ui.hq.slotDisplay![0];
    assert.ok(hqSlot0 !== null, 'HQ slot 0 must be populated');
    assert.equal(hqSlot0!.display.name, 'Mission Accomplished');
    assert.equal(hqSlot0!.display.cost, 2);

    // Hand display populated for player 0
    const handDisplay = ui.players[0]!.handDisplay;
    assert.ok(handDisplay !== undefined, 'handDisplay must be populated');
    assert.equal(handDisplay!.length, 2);
    assert.equal(handDisplay![0]!.name, 'Mission Accomplished');

    // Mastermind display populated via baseCardId lookup
    assert.equal(ui.mastermind.display.name, 'Dr. Doom');
    assert.equal(ui.mastermind.display.cost, 9);
  });

  it('opponent handCards redaction also redacts handDisplay', () => {
    // why: privacy symmetry — leaking display data is identical to
    // leaking the CardExtId for opponent privacy purposes.
    const gameState = makeGameStateWithDisplayData();
    const fullUI = buildUIState(gameState, mockCtx);

    const filtered = filterUIStateForAudience(fullUI, {
      kind: 'player',
      playerId: '1',
    });

    // Player 0 (the opponent) should have BOTH handCards and handDisplay omitted
    const player0Filtered = filtered.players.find((p) => p.playerId === '0');
    assert.ok(player0Filtered, 'player 0 must be present');
    assert.equal(player0Filtered!.handCards, undefined, 'opponent handCards redacted');
    assert.equal(
      player0Filtered!.handDisplay,
      undefined,
      'opponent handDisplay redacted alongside handCards (privacy symmetry)',
    );
  });

  it('viewing player keeps own handDisplay alongside handCards', () => {
    const gameState = makeGameStateWithDisplayData();
    const fullUI = buildUIState(gameState, mockCtx);

    const filtered = filterUIStateForAudience(fullUI, {
      kind: 'player',
      playerId: '0',
    });

    const player0Filtered = filtered.players.find((p) => p.playerId === '0');
    assert.ok(player0Filtered, 'player 0 must be present');
    assert.ok(player0Filtered!.handCards !== undefined, 'own handCards preserved');
    assert.ok(player0Filtered!.handDisplay !== undefined, 'own handDisplay preserved');
    assert.equal(
      player0Filtered!.handCards!.length,
      player0Filtered!.handDisplay!.length,
      'parallel-array length invariant',
    );
  });

  it('public display fields (City / HQ / Mastermind) are NOT redacted', () => {
    const gameState = makeGameStateWithDisplayData();
    const fullUI = buildUIState(gameState, mockCtx);

    // Filter for spectator (most restrictive) — public display data must still flow.
    const filtered = filterUIStateForAudience(fullUI, { kind: 'spectator' });

    const citySpace0 = filtered.city.spaces[0];
    assert.ok(citySpace0 !== null);
    assert.equal(citySpace0!.display.name, 'Magneto');

    const hqSlot0 = filtered.hq.slotDisplay![0];
    assert.ok(hqSlot0 !== null);
    assert.equal(hqSlot0!.display.name, 'Mission Accomplished');

    assert.equal(filtered.mastermind.display.name, 'Dr. Doom');
  });

  it('HQ length-equality invariant: slots.length === slotDisplay.length AND null positions align', () => {
    const gameState = makeGameStateWithDisplayData();
    const ui = buildUIState(gameState, mockCtx);

    assert.equal(
      ui.hq.slots.length,
      ui.hq.slotDisplay!.length,
      'parallel-array length invariant',
    );

    for (let i = 0; i < ui.hq.slots.length; i++) {
      const slotIsNull = ui.hq.slots[i] === null;
      const displayIsNull = ui.hq.slotDisplay![i] === null;
      assert.equal(
        slotIsNull,
        displayIsNull,
        `slots[${String(i)}] === null must match slotDisplay[${String(i)}] === null`,
      );
    }
  });

  it('handDisplay length matches handCards exactly', () => {
    const gameState = makeGameStateWithDisplayData();
    const ui = buildUIState(gameState, mockCtx);

    const player0 = ui.players[0]!;
    assert.equal(
      player0.handCards!.length,
      player0.handDisplay!.length,
      'parallel-array length invariant',
    );
  });

  it('setup-time determinism: identical G produces deeply-equal display projection', () => {
    const gameState = makeGameStateWithDisplayData();

    const ui1 = buildUIState(gameState, mockCtx);
    const ui2 = buildUIState(gameState, mockCtx);

    assert.deepStrictEqual(ui1.players[0]!.handDisplay, ui2.players[0]!.handDisplay);
    assert.deepStrictEqual(ui1.city.spaces, ui2.city.spaces);
    assert.deepStrictEqual(ui1.hq.slotDisplay, ui2.hq.slotDisplay);
    assert.deepStrictEqual(ui1.mastermind.display, ui2.mastermind.display);
  });
});

describe('buildUIState — projection-purity contract (PS-8 / WP-028 D-2801)', () => {
  it('does NOT mutate G.messages even when display entries are missing', () => {
    // why: critical PS-8 / D-2801 guard — the diagnostic surface for
    // missing display entries lives at SETUP TIME (mirrors WP-113
    // D-10014), not at projection time. buildUIState must remain pure.
    const gameState = makeGameStateWithDisplayData();

    // Inject a hand card that has NO entry in cardDisplayData — projection
    // must fall back to UNKNOWN_DISPLAY_PLACEHOLDER without touching G.
    const orphanExtId = 'orphan-no-display' as CardExtId;
    gameState.playerZones['0']!.hand = [orphanExtId];

    const messagesBefore = JSON.stringify(gameState.messages);

    const ui = buildUIState(gameState, mockCtx);

    const messagesAfter = JSON.stringify(gameState.messages);
    assert.equal(
      messagesBefore,
      messagesAfter,
      'G.messages MUST NOT be mutated by buildUIState',
    );

    // Projection still yields placeholder fallback for the orphan
    const handDisplay = ui.players[0]!.handDisplay!;
    assert.equal(handDisplay.length, 1);
    assert.equal(
      handDisplay[0]!.name,
      UNKNOWN_DISPLAY_PLACEHOLDER.name,
      'orphan ext_id falls back to placeholder name',
    );
    assert.equal(
      handDisplay[0]!.extId,
      orphanExtId,
      'placeholder copies the actual extId in, NOT the placeholder constant extId field',
    );
  });

  it('valid setups produce no UNKNOWN_DISPLAY_PLACEHOLDER entries', () => {
    // why: CI-visible regression target — placeholder must NEVER fire
    // for a setup whose cardDisplayData is complete.
    const gameState = makeGameStateWithDisplayData();
    const ui = buildUIState(gameState, mockCtx);

    for (const space of ui.city.spaces) {
      if (space === null) continue;
      assert.notEqual(
        space.display.name,
        UNKNOWN_DISPLAY_PLACEHOLDER.name,
        'valid setup must not emit placeholder for City',
      );
    }

    for (const slot of ui.hq.slotDisplay!) {
      if (slot === null) continue;
      assert.notEqual(
        slot.display.name,
        UNKNOWN_DISPLAY_PLACEHOLDER.name,
        'valid setup must not emit placeholder for HQ',
      );
    }

    for (const display of ui.players[0]!.handDisplay!) {
      assert.notEqual(
        display.name,
        UNKNOWN_DISPLAY_PLACEHOLDER.name,
        'valid setup must not emit placeholder for hand',
      );
    }

    assert.notEqual(
      ui.mastermind.display.name,
      UNKNOWN_DISPLAY_PLACEHOLDER.name,
      'valid setup must not emit placeholder for Mastermind',
    );
  });
});

describe('buildUIState — aliasing prevention (WP-028 cardKeywords precedent)', () => {
  it('mutating returned UICardDisplay does NOT mutate G.cardDisplayData', () => {
    // why: standard tests cannot detect aliasing; this explicit
    // contract asserts that every projection-time read of
    // G.cardDisplayData[extId] produces a fresh shallow copy.
    const gameState = makeGameStateWithDisplayData();
    const heroExtId = 'core/black-widow/strike#0' as CardExtId;
    const originalName = gameState.cardDisplayData[heroExtId]!.name;

    const ui = buildUIState(gameState, mockCtx);

    // Mutate the returned hand display
    ui.players[0]!.handDisplay![0]!.name = 'mutated-hand';
    // Mutate the returned HQ slotDisplay
    ui.hq.slotDisplay![0]!.display.name = 'mutated-hq';
    // Mutate the returned mastermind display
    ui.mastermind.display.name = 'mutated-mm';

    // G.cardDisplayData[heroExtId] must be untouched
    assert.equal(
      gameState.cardDisplayData[heroExtId]!.name,
      originalName,
      'G.cardDisplayData must NOT be aliased by the returned UIState',
    );
  });

  it('filterUIStateForAudience returns shallow-copied display objects', () => {
    // why: filter boundary must also break aliasing — mutating a
    // filtered result must not mutate the source UIState's display
    // objects.
    const gameState = makeGameStateWithDisplayData();
    const fullUI = buildUIState(gameState, mockCtx);

    const filtered = filterUIStateForAudience(fullUI, { kind: 'spectator' });

    const fullUiCity0 = fullUI.city.spaces[0]!;
    const filteredCity0 = filtered.city.spaces[0]!;

    filteredCity0.display.name = 'mutated';

    assert.notEqual(
      fullUiCity0.display.name,
      'mutated',
      'filter must not alias the input UIState display objects',
    );
  });
});

describe('buildInitialGameState — setup-time completeness diagnostic (PS-8)', () => {
  it('emits a single diagnostic into G.messages when buildCardDisplayData under-emits', () => {
    // why: the narrow CardRegistryReader mock (only `listCards()`) fails
    // the isCardDisplayDataRegistryReader guard at setup, producing an
    // empty cardDisplayData. The orchestration-side guard message AND
    // the completeness sweep BOTH fire in this scenario:
    //   1. The reader-guard message ("buildCardDisplayData skipped: ...")
    //      because listCards-only mocks cannot satisfy the listCards/getSet
    //      pair.
    //   2. The completeness-sweep message ("buildCardDisplayData
    //      under-emitted: ...") IF cardStats has entries — but with the
    //      same narrow mock, cardStats is also empty (its guard fails too),
    //      so the completeness sweep returns null and only the reader-guard
    //      message lands. Either way, the messages count grows by exactly
    //      one for buildCardDisplayData; no per-card noise.
    const config = createTestConfig();
    const registry = createMockRegistry();
    const setupContext = makeMockCtx();

    const gameState = buildInitialGameState(config, registry, setupContext);

    const cardDisplayDataMessages = gameState.messages.filter((m) =>
      m.includes('buildCardDisplayData'),
    );
    assert.equal(
      cardDisplayDataMessages.length,
      1,
      'exactly one buildCardDisplayData diagnostic at setup time, never per-card',
    );
  });

  it('no diagnostic when cardStats and cardDisplayData are both empty (no expected keys to miss)', () => {
    // why: with the narrow mock, both builders produce {}; the
    // completeness sweep walks `Object.keys(cardStats)` (empty) and
    // returns null. Only the reader-guard message lands. This test
    // documents the expected interaction: `under-emitted: 0` is never
    // logged.
    const config = createTestConfig();
    const registry = createMockRegistry();
    const setupContext = makeMockCtx();

    const gameState = buildInitialGameState(config, registry, setupContext);

    const underEmittedMessages = gameState.messages.filter((m) =>
      m.includes('under-emitted'),
    );
    assert.equal(
      underEmittedMessages.length,
      0,
      'completeness sweep must NOT emit a message when cardStats is empty',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-128 / EC-131 — board-layout projection contract
// ---------------------------------------------------------------------------

describe('buildUIState — WP-128 board-layout projections', () => {
  it('per-player victoryCards aliasing: mutating returned entry does NOT mutate G', () => {
    // why: WP-111 D-11105 aliasing-defense — every projected
    // UIDisplayEntry in victoryCards must be a fresh object with a
    // shallow-cloned display payload. Mutating the returned entry must
    // not propagate into G.cardDisplayData. Standard tests cannot
    // detect aliasing; this explicit contract is the contract.
    const gameState = createTestGameState();

    const heroExtId = 'hero-victory-001' as CardExtId;
    (gameState as { cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>> }).cardDisplayData = {
      [heroExtId]: {
        extId: heroExtId,
        name: 'Victory Hero',
        imageUrl: '',
        cost: 2,
      },
    };
    gameState.playerZones['0']!.victory.push(heroExtId);

    const originalName = gameState.cardDisplayData[heroExtId]!.name;
    const ui = buildUIState(gameState, mockCtx);

    const player0VictoryCards = ui.players[0]!.victoryCards;
    assert.ok(player0VictoryCards !== undefined, 'victoryCards must be present');
    assert.ok(player0VictoryCards.length > 0, 'victoryCards must be non-empty');
    player0VictoryCards[0]!.display.name = 'mutated-by-test';

    assert.equal(
      gameState.cardDisplayData[heroExtId]!.name,
      originalName,
      'G.cardDisplayData must not be aliased by victoryCards entries',
    );
  });

  it('discardTopCard projects null when discardCount === 0', () => {
    // why: D-12803 distinguishes "redacted" (undefined) from
    // "visible-but-empty" (null). Empty discard projects null with the
    // optional present.
    const gameState = createTestGameState();
    const ui = buildUIState(gameState, mockCtx);

    const player0 = ui.players[0]!;
    assert.equal(player0.discardCount, 0);
    assert.equal(
      player0.discardTopCard,
      null,
      'discardTopCard must be null (not undefined) when discard is empty',
    );
  });

  it('victoryVP projects from computeFinalScores().players[i].totalVP (uppercase VP)', () => {
    // why: D-12801 — engine projects victoryVP via computeFinalScores;
    // canonical casing is `totalVP` per scoring.types.ts:53. Empty
    // victory pile + no tactics defeated yields 0 for every player.
    const gameState = createTestGameState();
    const ui = buildUIState(gameState, mockCtx);

    for (const player of ui.players) {
      assert.equal(typeof player.victoryVP, 'number');
      assert.equal(player.victoryVP, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// WP-154 / EC-167 — mastermind attached bystanders projection
// ---------------------------------------------------------------------------

describe('buildUIState — mastermind.attachedBystanders projection (WP-154)', () => {
  it('projects mastermind.attachedBystanders with correct length and extId values', () => {
    const gameState = makeGameStateWithDisplayData();
    const bystanderExtId = 'core/black-widow/strike#0' as CardExtId;
    gameState.mastermind.attachedBystanders = [bystanderExtId, bystanderExtId];

    const ui = buildUIState(gameState, mockCtx);

    assert.equal(
      ui.mastermind.attachedBystanders.length,
      2,
      'projected array length must match source',
    );
    assert.equal(
      ui.mastermind.attachedBystanders[0]!.extId,
      bystanderExtId,
      'first entry extId must match source index 0',
    );
    assert.equal(
      ui.mastermind.attachedBystanders[1]!.extId,
      bystanderExtId,
      'second entry extId must match source index 1',
    );
  });

  it('projected array is aliasing-safe (new array, new entry objects)', () => {
    const gameState = makeGameStateWithDisplayData();
    const bystanderExtId = 'core/black-widow/strike#0' as CardExtId;
    gameState.mastermind.attachedBystanders = [bystanderExtId];

    const ui = buildUIState(gameState, mockCtx);

    assert.notStrictEqual(
      ui.mastermind.attachedBystanders,
      gameState.mastermind.attachedBystanders,
      'projected array must not be the same reference as G source',
    );
  });

  it('empty attachedBystanders projects as empty array', () => {
    const gameState = makeGameStateWithDisplayData();
    gameState.mastermind.attachedBystanders = [];

    const ui = buildUIState(gameState, mockCtx);

    assert.equal(
      ui.mastermind.attachedBystanders.length,
      0,
      'empty source must project as empty array',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-156 — piles.horrorsCount projection
// ---------------------------------------------------------------------------

describe('buildUIState — piles.horrorsCount projection (WP-156)', () => {
  it('projects horrorsCount as 0 for empty horrors pile', () => {
    const gameState = createTestGameState();
    const ui = buildUIState(gameState, mockCtx);

    assert.equal(
      ui.piles.horrorsCount,
      0,
      'horrorsCount must be 0 when piles.horrors is empty',
    );
  });

  it('projects horrorsCount from gameState.piles.horrors.length', () => {
    const gameState = createTestGameState();
    gameState.piles.horrors = ['horror-card-001', 'horror-card-002'];

    const ui = buildUIState(gameState, mockCtx);

    assert.equal(
      ui.piles.horrorsCount,
      2,
      'horrorsCount must equal piles.horrors.length',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-222 / EC-254 — pendingHeroChoice projection contract
// ---------------------------------------------------------------------------

describe('buildUIState — pendingHeroChoice projection (WP-222 / EC-254)', () => {
  it('pendingHeroChoice is undefined when G.pendingHeroChoice is absent', () => {
    // why: absent G field must project as absent UIState field — the client
    // renders the prompt iff pendingHeroChoice !== undefined (D-22201).
    const gameState = createTestGameState();
    assert.equal(gameState.pendingHeroChoice, undefined);

    const ui = buildUIState(gameState, mockCtx);

    assert.equal(
      ui.pendingHeroChoice,
      undefined,
      'pendingHeroChoice must be absent from UIState when G has no pending choice',
    );
  });

  it('pendingHeroChoice projects all 4 locked fields when G.pendingHeroChoice is set', () => {
    // why: strict 4-field contract per EC-254 — choiceType, cardId, playerID
    // verbatim from G; display resolved via resolveDisplay() (D-22201).
    const gameState = makeGameStateWithDisplayData();
    const cardId = 'core/black-widow/strike#0' as CardExtId;
    const pendingChoice: PendingHeroChoice = {
      choiceType: 'discard-or-return',
      cardId,
      playerID: '0',
    };
    gameState.pendingHeroChoice = pendingChoice;

    const ui = buildUIState(gameState, mockCtx);

    assert.ok(
      ui.pendingHeroChoice !== undefined,
      'pendingHeroChoice must be present when G.pendingHeroChoice is set',
    );
    assert.equal(ui.pendingHeroChoice!.choiceType, 'discard-or-return');
    assert.equal(ui.pendingHeroChoice!.cardId, cardId);
    assert.equal(ui.pendingHeroChoice!.playerID, '0');
    assert.ok(
      typeof ui.pendingHeroChoice!.display === 'object',
      'display must be an object',
    );
    assert.ok(
      ui.pendingHeroChoice!.display.name.length > 0,
      'display.name must be non-empty for a known cardId',
    );
  });

  it('pendingHeroChoice display falls back to placeholder for unknown cardId', () => {
    // why: resolveDisplay() returns UNKNOWN_DISPLAY_PLACEHOLDER spread for
    // a cardId with no matching entry in G.cardDisplayData (projection-purity
    // contract per D-2801 — no G mutation, no throw).
    const gameState = createTestGameState();
    const unknownCardId = 'unknown-card-no-display-entry' as CardExtId;
    const pendingChoice: PendingHeroChoice = {
      choiceType: 'discard-or-return',
      cardId: unknownCardId,
      playerID: '1',
    };
    gameState.pendingHeroChoice = pendingChoice;

    const ui = buildUIState(gameState, mockCtx);

    assert.ok(ui.pendingHeroChoice !== undefined, 'pendingHeroChoice must be projected');
    assert.equal(ui.pendingHeroChoice!.cardId, unknownCardId);
    assert.equal(
      ui.pendingHeroChoice!.display.name,
      UNKNOWN_DISPLAY_PLACEHOLDER.name,
      'unknown cardId must fall back to placeholder name',
    );
    assert.equal(
      ui.pendingHeroChoice!.display.extId,
      unknownCardId,
      'placeholder extId must be the actual cardId, not the empty placeholder constant',
    );
  });

  it('pendingHeroChoice display is not aliased into G.cardDisplayData (aliasing defense)', () => {
    // why: EC-254 aliasing defense — the display reference MUST be !== any
    // object in G.cardDisplayData (guaranteed by resolveDisplay() spread per
    // WP-111 D-11105). Mutating the returned display must not affect G.
    const gameState = makeGameStateWithDisplayData();
    const cardId = 'core/black-widow/strike#0' as CardExtId;
    const pendingChoice: PendingHeroChoice = {
      choiceType: 'discard-or-return',
      cardId,
      playerID: '0',
    };
    gameState.pendingHeroChoice = pendingChoice;

    const originalName = gameState.cardDisplayData[cardId]!.name;
    const ui = buildUIState(gameState, mockCtx);

    // Mutate the projected display — G.cardDisplayData must be untouched.
    ui.pendingHeroChoice!.display.name = 'mutated-by-aliasing-test';

    assert.equal(
      gameState.cardDisplayData[cardId]!.name,
      originalName,
      'G.cardDisplayData must NOT be aliased by the pendingHeroChoice display reference',
    );
    assert.notStrictEqual(
      ui.pendingHeroChoice!.display,
      gameState.cardDisplayData[cardId],
      'display reference must not be the same object as G.cardDisplayData entry',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-243 / EC-274 — discard projection + pendingKoHeroChoice projection
// ---------------------------------------------------------------------------

const WOUND = 'pile-wound' as CardExtId;

describe('buildUIState — discardCards / discardDisplay projection (WP-243)', () => {
  it('projects the own player full discard contents, length-matched', () => {
    const gameState = createTestGameState();
    gameState.playerZones['0']!.discard = ['hero-a' as CardExtId, 'hero-b' as CardExtId, 'hero-a' as CardExtId];

    const ui = buildUIState(gameState, mockCtx);
    const player0 = ui.players.find((p) => p.playerId === '0')!;

    assert.deepStrictEqual(player0.discardCards, ['hero-a', 'hero-b', 'hero-a'], 'verbatim discard ext_ids');
    assert.ok(player0.discardDisplay !== undefined, 'discardDisplay present');
    assert.equal(
      player0.discardDisplay!.length,
      player0.discardCards!.length,
      'discardDisplay length matches discardCards',
    );
  });

  it('discardCards is present iff discardDisplay is present (symmetry)', () => {
    const gameState = createTestGameState();
    gameState.playerZones['0']!.discard = [];
    const ui = buildUIState(gameState, mockCtx);
    const player0 = ui.players.find((p) => p.playerId === '0')!;
    assert.equal(player0.discardCards !== undefined, player0.discardDisplay !== undefined, 'both present or both absent');
    assert.deepStrictEqual(player0.discardCards, [], 'empty discard projects an empty array');
  });

  it('discardCards is a defensive copy — mutating it does not affect G', () => {
    const gameState = createTestGameState();
    gameState.playerZones['0']!.discard = ['hero-a' as CardExtId];
    const ui = buildUIState(gameState, mockCtx);
    const player0 = ui.players.find((p) => p.playerId === '0')!;
    player0.discardCards!.push('injected' as string);
    assert.deepStrictEqual(gameState.playerZones['0']!.discard, ['hero-a'], 'G discard untouched');
  });

  it('mutating a projected discardDisplay entry does not affect G (defensive copy)', () => {
    const gameState = makeGameStateWithDisplayData();
    const cardId = 'core/black-widow/strike#0' as CardExtId;
    gameState.playerZones['0']!.discard = [cardId];
    const originalName = gameState.cardDisplayData[cardId]!.name;
    const ui = buildUIState(gameState, mockCtx);
    const player0 = ui.players.find((p) => p.playerId === '0')!;
    player0.discardDisplay![0]!.name = 'mutated';
    assert.equal(gameState.cardDisplayData[cardId]!.name, originalName, 'G display untouched');
  });
});

describe('buildUIState — pendingKoHeroChoice projection (WP-243 / D-24010)', () => {
  function withKoChoice(): LegendaryGameState {
    const gameState = makeGameStateWithDisplayData();
    // why: reset the helper's hand so the eligible-order assertions are precise.
    gameState.playerZones['0']!.discard = ['hero-d1' as CardExtId, WOUND, 'hero-d2' as CardExtId];
    gameState.playerZones['0']!.hand = ['hero-h1' as CardExtId];
    gameState.playerZones['0']!.inPlay = ['hero-p1' as CardExtId];
    gameState.pendingKoHeroChoices = [{ choiceType: 'ko-hero', playerID: '0' }];
    return gameState;
  }

  it('is undefined when the engine queue is empty', () => {
    const gameState = createTestGameState();
    assert.equal(gameState.pendingKoHeroChoices, undefined);
    const ui = buildUIState(gameState, mockCtx);
    assert.equal(ui.pendingKoHeroChoice, undefined, 'absent when no pending KO choice');
  });

  it('projects the FRONT entry with eligible spanning discard → hand → inPlay (wounds excluded)', () => {
    const ui = buildUIState(withKoChoice(), mockCtx);
    assert.ok(ui.pendingKoHeroChoice !== undefined, 'present when queue non-empty');
    assert.equal(ui.pendingKoHeroChoice!.choiceType, 'ko-hero');
    assert.equal(ui.pendingKoHeroChoice!.playerID, '0');
    assert.deepStrictEqual(
      ui.pendingKoHeroChoice!.eligible.map((e) => ({ zone: e.zone, cardId: e.cardId })),
      [
        { zone: 'discard', cardId: 'hero-d1' },
        { zone: 'discard', cardId: 'hero-d2' },
        { zone: 'hand', cardId: 'hero-h1' },
        { zone: 'inPlay', cardId: 'hero-p1' },
      ],
      'eligible scanned in discard → hand → inPlay array index order, wounds excluded',
    );
  });

  it('remaining equals the queue length', () => {
    const gameState = withKoChoice();
    gameState.pendingKoHeroChoices = [
      { choiceType: 'ko-hero', playerID: '0' },
      { choiceType: 'ko-hero', playerID: '0' },
    ];
    const ui = buildUIState(gameState, mockCtx);
    assert.equal(ui.pendingKoHeroChoice!.remaining, 2, 'remaining = queue length');
  });

  it('eligible order is byte-identical across repeated calls on the same G', () => {
    const gameState = withKoChoice();
    const a = buildUIState(gameState, mockCtx);
    const b = buildUIState(gameState, mockCtx);
    assert.deepStrictEqual(a.pendingKoHeroChoice!.eligible, b.pendingKoHeroChoice!.eligible);
  });

  it('eligible order is derived from array index, not Object.keys (reversed-array pin)', () => {
    const gameState = withKoChoice();
    // Reverse each zone array; eligible must follow the NEW index order exactly.
    gameState.playerZones['0']!.discard = [...gameState.playerZones['0']!.discard].reverse();
    const ui = buildUIState(gameState, mockCtx);
    assert.deepStrictEqual(
      ui.pendingKoHeroChoice!.eligible
        .filter((e) => e.zone === 'discard')
        .map((e) => e.cardId),
      ['hero-d2', 'hero-d1'],
      'discard eligible follows the reversed array index order',
    );
  });

  it('within-zone dedupe: same ext_id twice in one zone → one entry; same ext_id in two zones → two entries', () => {
    const gameState = makeGameStateWithDisplayData();
    gameState.playerZones['0']!.discard = ['dup' as CardExtId, 'dup' as CardExtId];
    gameState.playerZones['0']!.hand = ['dup' as CardExtId];
    gameState.playerZones['0']!.inPlay = [];
    gameState.pendingKoHeroChoices = [{ choiceType: 'ko-hero', playerID: '0' }];
    const ui = buildUIState(gameState, mockCtx);
    assert.deepStrictEqual(
      ui.pendingKoHeroChoice!.eligible.map((e) => ({ zone: e.zone, cardId: e.cardId })),
      [
        { zone: 'discard', cardId: 'dup' },
        { zone: 'hand', cardId: 'dup' },
      ],
    );
  });

  it('mutating a projected eligible display does not affect G (defensive copy)', () => {
    const gameState = makeGameStateWithDisplayData();
    const cardId = 'core/black-widow/strike#0' as CardExtId;
    gameState.playerZones['0']!.discard = [cardId, 'other' as CardExtId];
    gameState.playerZones['0']!.hand = [];
    gameState.playerZones['0']!.inPlay = [];
    gameState.pendingKoHeroChoices = [{ choiceType: 'ko-hero', playerID: '0' }];
    const originalName = gameState.cardDisplayData[cardId]!.name;
    const ui = buildUIState(gameState, mockCtx);
    const entry = ui.pendingKoHeroChoice!.eligible.find((e) => e.cardId === cardId)!;
    entry.display.name = 'mutated';
    assert.equal(gameState.cardDisplayData[cardId]!.name, originalName, 'G display untouched');
  });

  it('buildUIState does not mutate G (purity)', () => {
    const gameState = withKoChoice();
    const before = JSON.stringify(gameState);
    buildUIState(gameState, mockCtx);
    assert.equal(JSON.stringify(gameState), before, 'G byte-identical after projection');
  });
});
