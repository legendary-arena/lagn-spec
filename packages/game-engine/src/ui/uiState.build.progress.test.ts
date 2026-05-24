/**
 * Contract enforcement tests for UIState.progress (WP-067).
 *
 * `UIState.progress` is required on every UIState (no lobby-phase exception).
 * `bystandersRescued` aggregates each player's `victory` zone only — every
 * other zone is explicitly excluded. `escapedVillains` reads
 * G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS], lazily defaulting to 0 when
 * the counter has not been initialised.
 *
 * These tests are contract enforcement tests. They are not examples, not
 * smoke tests, and not illustrative. If a test fails, the implementation is
 * incorrect by definition. Do NOT weaken assertions to make tests pass — fix
 * the implementation instead.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUIState } from './uiState.build.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { LegendaryGameState } from '../types.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';
import { BYSTANDER_EXT_ID } from '../setup/buildInitialGameState.js';

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
 * Minimal mock registry. Returns no card data — these tests construct
 * bystander entries manually via G.villainDeckCardTypes overrides.
 */
function createMockRegistry(): CardRegistryReader {
  return { listCards: () => [] };
}

/**
 * Inline UIBuildContext mock matching the local interface in uiState.build.ts.
 */
const mockCtx = {
  phase: 'play' as string | null,
  turn: 1,
  currentPlayer: '0',
};

/**
 * Constructs a baseline LegendaryGameState for progress tests.
 */
function createTestGameState(): LegendaryGameState {
  const config = createTestConfig();
  const registry = createMockRegistry();
  const setupContext = makeMockCtx();
  return buildInitialGameState(config, registry, setupContext);
}

describe('UIState progress counters (WP-067)', () => {
  it('progress is present and zeroed on a freshly constructed state', () => {
    const gameState = createTestGameState();
    const result = buildUIState(gameState, mockCtx);

    assert.ok('progress' in result, 'UIState must expose top-level progress');
    assert.equal(result.progress.bystandersRescued, 0);
    assert.equal(result.progress.escapedVillains, 0);
  });

  it('bystandersRescued counts bystanders sitting in a single player\'s victory zone', () => {
    const gameState = createTestGameState();
    // why: install a known bystander into player 0's victory zone via the
    // setup-time card-type map. The slug `bystander` matches the canonical
    // RevealedCardType value used by the projection helper.
    gameState.villainDeckCardTypes['bystander-civilian-1'] = 'bystander';
    gameState.playerZones['0']!.victory.push('bystander-civilian-1');

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.bystandersRescued, 1);
  });

  it('bystandersRescued aggregates across every player', () => {
    const gameState = createTestGameState();
    gameState.villainDeckCardTypes['bystander-a'] = 'bystander';
    gameState.villainDeckCardTypes['bystander-b'] = 'bystander';
    gameState.villainDeckCardTypes['bystander-c'] = 'bystander';
    gameState.playerZones['0']!.victory.push('bystander-a', 'bystander-b');
    gameState.playerZones['1']!.victory.push('bystander-c');

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.bystandersRescued, 3);
  });

  it('bystandersRescued counts supply-pile bystanders (BYSTANDER_EXT_ID) without a villainDeckCardTypes entry', () => {
    const gameState = createTestGameState();
    // why: supply-pile bystander tokens (BYSTANDER_EXT_ID = 'pile-bystander')
    // land in victory via attached-bystander awards on villain defeat and via
    // hero-ability rescues. They are NOT registered in villainDeckCardTypes
    // — the engine must count them by literal ext_id equality, mirroring
    // scoring.logic.ts:computeFinalScores. Regression guard for the
    // production "Bystanders rescued = 1 with 2 bystanders in pile" bug.
    assert.equal(
      gameState.villainDeckCardTypes[BYSTANDER_EXT_ID],
      undefined,
      'BYSTANDER_EXT_ID must not be registered in villainDeckCardTypes — that is the precondition for this bug',
    );
    gameState.playerZones['0']!.victory.push(BYSTANDER_EXT_ID);
    gameState.playerZones['0']!.victory.push(BYSTANDER_EXT_ID);

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.bystandersRescued, 2);
  });

  it('bystandersRescued counts a mixed pile of villain-deck and supply-pile bystanders together', () => {
    const gameState = createTestGameState();
    gameState.villainDeckCardTypes['bystander-villain-deck-00'] = 'bystander';
    gameState.playerZones['0']!.victory.push('bystander-villain-deck-00');
    gameState.playerZones['0']!.victory.push(BYSTANDER_EXT_ID);

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.bystandersRescued, 2);
  });

  it('bystandersRescued excludes bystanders sitting outside the victory zone', () => {
    const gameState = createTestGameState();
    gameState.villainDeckCardTypes['bystander-hand'] = 'bystander';
    gameState.villainDeckCardTypes['bystander-deck'] = 'bystander';
    gameState.villainDeckCardTypes['bystander-discard'] = 'bystander';
    gameState.villainDeckCardTypes['bystander-inplay'] = 'bystander';
    // why: deliberately seed a bystander into every non-victory zone — none
    // should count as rescued.
    gameState.playerZones['0']!.hand.push('bystander-hand');
    gameState.playerZones['0']!.deck.push('bystander-deck');
    gameState.playerZones['0']!.discard.push('bystander-discard');
    gameState.playerZones['0']!.inPlay.push('bystander-inplay');

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.bystandersRescued, 0);
  });

  it('escapedVillains projects 0 when the counter is not yet initialised', () => {
    const gameState = createTestGameState();
    // why: confirm the counter starts unset on a fresh state — the lazy-init
    // contract relies on the absence path returning 0.
    assert.equal(
      gameState.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS],
      undefined,
    );

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.escapedVillains, 0);
  });

  it('escapedVillains projects the exact counter value when present', () => {
    const gameState = createTestGameState();
    gameState.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] = 5;

    const result = buildUIState(gameState, mockCtx);

    assert.equal(result.progress.escapedVillains, 5);
  });

  it('progress projection is deterministic for identical inputs', () => {
    const gameState = createTestGameState();
    gameState.villainDeckCardTypes['bystander-x'] = 'bystander';
    gameState.playerZones['1']!.victory.push('bystander-x');
    gameState.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] = 2;

    const first = buildUIState(gameState, mockCtx);
    const second = buildUIState(gameState, mockCtx);

    assert.deepStrictEqual(first.progress, second.progress);
  });
});
