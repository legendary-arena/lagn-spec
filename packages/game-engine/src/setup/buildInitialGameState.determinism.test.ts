/**
 * Determinism tests for buildInitialGameState.
 *
 * Verifies that identical inputs produce identical outputs. A failure here
 * indicates a replay-breaking change — the engine must produce the exact
 * same initial state given the same config, registry, and RNG.
 *
 * Uses makeMockCtx from src/test/mockCtx.ts — no boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialGameState } from './buildInitialGameState.js';
import { shuffleDeck } from './shuffle.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';

/**
 * Creates a valid mock MatchSetupConfig for determinism tests.
 */
function createTestConfig(): MatchSetupConfig {
  return {
    schemeId: 'test-scheme-det',
    mastermindId: 'test-mastermind-det',
    villainGroupIds: ['test-villain-det-001', 'test-villain-det-002'],
    henchmanGroupIds: ['test-henchman-det-001'],
    heroDeckIds: ['test-hero-det-001', 'test-hero-det-002', 'test-hero-det-003'],
    bystandersCount: 20,
    woundsCount: 15,
    officersCount: 10,
    sidekicksCount: 5,
  };
}

/**
 * Creates a minimal mock registry that satisfies CardRegistryReader.
 */
function createMockRegistry(): CardRegistryReader {
  return {
    listCards: () => [],
  };
}

describe('buildInitialGameState — determinism', () => {
  // why: A failure in this test means that the same inputs no longer produce
  // identical outputs. This is a replay-breaking change — any code that
  // relies on deterministic setup (replay systems, testing, debugging) would
  // produce different results. This test must always pass.
  it('two calls with the same inputs produce identical G', () => {
    const config = createTestConfig();
    const registry = createMockRegistry();

    // why: Using the same makeMockCtx() instance for both calls ensures that
    // the RNG behavior is identical. makeMockCtx's Shuffle reverses arrays
    // deterministically, so both calls should produce the exact same state.
    const context = makeMockCtx({ numPlayers: 3 });

    const firstState = buildInitialGameState(config, registry, context);
    const secondState = buildInitialGameState(config, registry, context);

    assert.deepStrictEqual(
      firstState,
      secondState,
      'Two calls with identical inputs must produce identical game state. ' +
      'A mismatch here indicates a replay-breaking change in the setup logic.',
    );
  });

  it('serialized G is identical between two calls', () => {
    const config = createTestConfig();
    const registry = createMockRegistry();
    const context = makeMockCtx({ numPlayers: 2 });

    const firstSerialized = JSON.stringify(
      buildInitialGameState(config, registry, context),
    );
    const secondSerialized = JSON.stringify(
      buildInitialGameState(config, registry, context),
    );

    assert.equal(
      firstSerialized,
      secondSerialized,
      'Serialized game state must be byte-for-byte identical between two ' +
      'calls with the same inputs. A mismatch indicates non-determinism.',
    );
  });

  it('different player counts produce different state', () => {
    const config = createTestConfig();
    const registry = createMockRegistry();

    const twoPlayerState = buildInitialGameState(
      config,
      registry,
      makeMockCtx({ numPlayers: 2 }),
    );
    const threePlayerState = buildInitialGameState(
      config,
      registry,
      makeMockCtx({ numPlayers: 3 }),
    );

    assert.notDeepStrictEqual(
      twoPlayerState.playerZones,
      threePlayerState.playerZones,
      'Different player counts must produce different playerZones',
    );
  });

  it('shuffleDeck was called (deck order differs from unshuffled)', () => {
    const config = createTestConfig();
    const registry = createMockRegistry();
    const context = makeMockCtx({ numPlayers: 1 });

    const gameState = buildInitialGameState(config, registry, context);
    const deck = gameState.playerZones['0'].deck;

    // why: makeMockCtx reverses arrays during shuffle. The unshuffled starting
    // deck is [agent x8, trooper x4]. After reversal, the deck should start
    // with troopers and end with agents. If the deck matches the unshuffled
    // order, the shuffle was skipped.
    const firstCard = deck[0];
    const lastCard = deck[deck.length - 1];

    // After reversal: troopers at front, agents at back
    assert.ok(
      firstCard.includes('trooper'),
      'After mock shuffle (reverse), the first card should be a trooper. ' +
      'If this fails, shuffleDeck may not be calling context.random.Shuffle.',
    );
    assert.ok(
      lastCard.includes('agent'),
      'After mock shuffle (reverse), the last card should be an agent. ' +
      'If this fails, shuffleDeck may not be calling context.random.Shuffle.',
    );
  });

  // why: WP-135 — full-registry determinism assertions. Inline fixture
  // mirrors buildLoadoutFixtureRegistry in loadout.test and
  // buildShapeFixtureRegistry in shape.test (intentional duplication per
  // code-style Rule 1: duplicate first, abstract on third copy — the
  // third copy is here, but the abstraction would couple three unrelated
  // test files; better to keep them self-contained).
  function buildDeterminismFixtureRegistry() {
    const setData = {
      abbr: 'core',
      schemes: [{ slug: 's1' }],
      masterminds: [{ slug: 'mm', cards: [{ slug: 'mm-base', tactic: false }] }],
      henchmen: [{ slug: 'henchies' }],
      villains: [{ slug: 'vg', cards: [{ slug: 'v1', vAttack: '4' }] }],
      heroes: [
        {
          slug: 'hero-x',
          cards: [
            { slug: 'card-c1', rarityLabel: 'Common 1' },
            { slug: 'card-c2', rarityLabel: 'Common 2' },
            { slug: 'card-uncommon', rarityLabel: 'Uncommon' },
            { slug: 'card-rare', rarityLabel: 'Rare' },
          ],
        },
      ],
    };
    return {
      listCards: () => [],
      listSets: () => [{ abbr: 'core' }],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };
  }

  function buildDeterminismFixtureConfig(): MatchSetupConfig {
    return {
      schemeId: 'core/s1',
      mastermindId: 'core/mm',
      villainGroupIds: ['core/vg'],
      henchmanGroupIds: ['core/henchies'],
      heroDeckIds: ['core/hero-x'],
      bystandersCount: 1,
      woundsCount: 1,
      officersCount: 1,
      sidekicksCount: 1,
    };
  }

  it('G.heroDeck deep-equals expectedShuffledDeck.slice(5) — same shuffle order, HQ-prefix popped (WP-135)', () => {
    // why: WP-135 §C acceptance criterion — the orchestrator's hero deck
    // is the front-pop of buildHeroDeck's shuffle output. Reproducing the
    // shuffle externally with the same ShuffleProvider mock should yield
    // a sequence whose .slice(5) matches G.heroDeck (and whose [0..4]
    // matches G.hq).
    const registry = buildDeterminismFixtureRegistry();
    const config = buildDeterminismFixtureConfig();

    // Build the expected shuffled deck the same way the orchestrator does:
    // 5+3+3+3 = 14 cards in the hero-card-instance order they're emitted,
    // then run through the same ShuffleProvider mock (which reverses).
    const unshuffled: string[] = [];
    for (let i = 0; i < 5; i++) unshuffled.push('core/hero-x/card-c1');
    for (let i = 0; i < 3; i++) unshuffled.push('core/hero-x/card-c2');
    for (let i = 0; i < 3; i++) unshuffled.push('core/hero-x/card-uncommon');
    for (let i = 0; i < 3; i++) unshuffled.push('core/hero-x/card-rare');

    const externalContext = makeMockCtx({ numPlayers: 1 });
    const expectedShuffledDeck = shuffleDeck(unshuffled, externalContext);

    // Build the engine state with a fresh (but identically-behaving) context.
    const engineContext = makeMockCtx({ numPlayers: 1 });
    const gameState = buildInitialGameState(config, registry, engineContext);

    assert.deepStrictEqual(
      gameState.heroDeck,
      expectedShuffledDeck.slice(5),
      'G.heroDeck must equal the shuffled hero deck minus its first 5 cards (HQ prefix)',
    );
  });

  it('HQ index-0 first-fill: hq[0] is non-null whenever heroDeck has at least 1 card (WP-135)', () => {
    const registry = buildDeterminismFixtureRegistry();
    const config = buildDeterminismFixtureConfig();
    const context = makeMockCtx({ numPlayers: 1 });

    const gameState = buildInitialGameState(config, registry, context);

    // 14 cards built; hq[0] must be the deck top.
    assert.ok(
      gameState.hq[0] !== null,
      'When heroDeck.length >= 1, hq[0] must be non-null (deck top → slot 0)',
    );
  });

  it('HQ index-0..4 are all non-null (deck-front order) when heroDeck has at least 5 cards (WP-135)', () => {
    const registry = buildDeterminismFixtureRegistry();
    const config = buildDeterminismFixtureConfig();
    const context = makeMockCtx({ numPlayers: 1 });

    const gameState = buildInitialGameState(config, registry, context);

    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      assert.ok(
        gameState.hq[slotIndex] !== null,
        `When heroDeck.length >= 5, hq[${slotIndex}] must be non-null`,
      );
    }
  });

  it('shuffleDeck does not mutate the input array', () => {
    const original = ['card-a', 'card-b', 'card-c', 'card-d'];
    const snapshot = [...original];
    const context = makeMockCtx();

    shuffleDeck(original, context);

    // why: shuffleDeck passes [...cards] to context.random.Shuffle to
    // guarantee the caller's array is never mutated. If the defensive copy
    // is removed, this test will fail because makeMockCtx's Shuffle reverses
    // in-place via the spread, but the original would also be passed by
    // reference to Shuffle which could mutate it.
    assert.deepStrictEqual(
      original,
      snapshot,
      'shuffleDeck must not mutate the input array. The defensive copy ' +
      'inside shuffleDeck protects callers from side effects.',
    );
  });
});
