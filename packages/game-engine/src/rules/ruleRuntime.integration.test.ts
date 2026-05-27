/**
 * End-to-end integration tests for the rule execution pipeline.
 *
 * Verifies that executeRuleHooks + applyRuleEffects produce the expected
 * observable changes in G.messages and G.counters when the scheme and
 * mastermind hooks fire on onSchemeTwistRevealed and
 * onMastermindStrikeRevealed triggers.
 *
 * No boardgame.io imports. Uses node:test and node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeRuleHooks } from './ruleRuntime.execute.js';
import { applyRuleEffects } from './ruleRuntime.effects.js';
import {
  DEFAULT_IMPLEMENTATION_MAP,
  buildDefaultHookDefinitions,
} from './ruleRuntime.impl.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';

/**
 * Creates a valid mock MatchSetupConfig for integration tests.
 *
 * @amended WP-113 PS-7: bare slug fixtures migrated to set-qualified
 *   form `'<setAbbr>/<slug>'` per the qualified-ID contract
 *   (per D-10014).
 */
function createTestConfig(): MatchSetupConfig {
  return {
    schemeId: 'test/test-scheme-001',
    mastermindId: 'test/test-mastermind-001',
    villainGroupIds: ['test/test-villain-group-001'],
    henchmanGroupIds: ['test/test-henchman-group-001'],
    heroDeckIds: ['test/test-hero-deck-001'],
    bystandersCount: 1,
    woundsCount: 1,
    officersCount: 1,
    sidekicksCount: 1,
  };
}

/**
 * Creates a minimal mock registry for integration tests that satisfies
 * all four orchestration-side registry-reader guards. Returns no actual
 * cards / sets / schemes — just exposes the full interface shape so
 * `buildInitialGameState` does not push any "skipped" diagnostics into
 * `G.messages`. The rule-execution tests below assume `G.messages`
 * starts empty.
 *
 * @amended WP-113 PS-4: registry-reader guards now run at the
 *   orchestration site (`buildInitialGameState`) and push diagnostics
 *   on incomplete-interface mocks. This mock implements all four guard
 *   surfaces so those diagnostics do not fire (per D-10014).
 */
function createMockRegistry() {
  return {
    listCards: () => [],
    listSets: () => [],
    getSet: (_abbr: string) => undefined,
  };
}

describe('rule execution pipeline — integration', () => {
  it('onSchemeTwistRevealed trigger produces scheme twist message in G.messages', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();
    const gameState = buildInitialGameState(config, registry, context);

    assert.deepStrictEqual(
      gameState.messages,
      [],
      'G.messages must start empty',
    );

    const effects = executeRuleHooks(
      gameState,
      {},
      'onSchemeTwistRevealed',
      { cardId: 'test-twist-001' },
      gameState.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );

    applyRuleEffects(gameState, {}, effects);

    assert.ok(
      gameState.messages.includes('Scheme twist revealed — twist count incremented.'),
      'G.messages must contain scheme twist message after onSchemeTwistRevealed',
    );
  });

  it('onMastermindStrikeRevealed trigger produces mastermind strike message in G.messages', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();
    const gameState = buildInitialGameState(config, registry, context);

    const effects = executeRuleHooks(
      gameState,
      {},
      'onMastermindStrikeRevealed',
      { cardId: 'test-strike-001' },
      gameState.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );

    applyRuleEffects(gameState, {}, effects);

    assert.ok(
      gameState.messages.includes('Mastermind strike revealed — strike count incremented.'),
      'G.messages must contain mastermind strike message after onMastermindStrikeRevealed',
    );
  });

  it('G remains JSON-serializable after all effects are applied', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();
    const gameState = buildInitialGameState(config, registry, context);

    // Fire onSchemeTwistRevealed
    const twistEffects = executeRuleHooks(
      gameState,
      {},
      'onSchemeTwistRevealed',
      { cardId: 'test-twist-001' },
      gameState.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );
    applyRuleEffects(gameState, {}, twistEffects);

    // Fire onMastermindStrikeRevealed
    const strikeEffects = executeRuleHooks(
      gameState,
      {},
      'onMastermindStrikeRevealed',
      { cardId: 'test-strike-001' },
      gameState.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );
    applyRuleEffects(gameState, {}, strikeEffects);

    const serialized = JSON.stringify(gameState);
    assert.ok(
      serialized,
      'JSON.stringify(G) must produce a non-empty string after all effects',
    );

    const deserialized = JSON.parse(serialized);
    assert.deepStrictEqual(
      deserialized.messages,
      gameState.messages,
      'Messages must survive JSON round-trip',
    );
  });

  it('executeRuleHooks does not modify G besides messages — calling twice produces the same G', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();
    const gameState = buildInitialGameState(config, registry, context);

    // why: the config-driven scheme twist dispatcher (WP-182) pushes a
    // diagnostic message for unconfigured schemes. Exclude messages from the
    // no-mutation check — messages are the intended mutation surface.
    const snapshotBefore = JSON.stringify({ ...gameState, messages: [] });

    executeRuleHooks(
      gameState,
      {},
      'onSchemeTwistRevealed',
      { cardId: 'test-twist-001' },
      gameState.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );

    const snapshotAfter = JSON.stringify({ ...gameState, messages: [] });

    assert.equal(
      snapshotBefore,
      snapshotAfter,
      'executeRuleHooks must not modify G besides messages — snapshots must be identical',
    );
  });

  it('modifyCounter effects update G.counters correctly', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();
    const gameState = buildInitialGameState(config, registry, context);

    const effects = executeRuleHooks(
      gameState,
      {},
      'onSchemeTwistRevealed',
      { cardId: 'test-twist-001' },
      gameState.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );

    applyRuleEffects(gameState, {}, effects);

    assert.equal(
      gameState.counters.schemeTwistCount,
      1,
      'schemeTwistCount must be 1 after scheme twist handler fires with delta: 1',
    );
  });

  it('unknown effect types push a warning to G.messages without throwing', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();
    const gameState = buildInitialGameState(config, registry, context);

    const unknownEffects = [
      { type: 'futureEffectType', data: 'something' } as unknown as import('./ruleHooks.types.js').RuleEffect,
    ];

    // Must not throw
    applyRuleEffects(gameState, {}, unknownEffects);

    assert.ok(
      gameState.messages.some((message) => message.includes('Unknown rule effect type')),
      'G.messages must contain a warning about the unknown effect type',
    );
  });
});
