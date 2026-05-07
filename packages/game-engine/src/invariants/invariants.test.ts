/**
 * Tests for the WP-031 runtime invariant pipeline.
 *
 * Uses node:test + node:assert. No the game framework imports. No
 * the game framework/testing imports. Builds valid G fixtures via
 * buildInitialGameState + makeMockCtx; injects broken state via
 * test-only direct mutation AFTER construction (bypassing the move
 * system, which is the correct pattern for structural-corruption
 * testing per WP-028 precedent).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { LegendaryGameState, MatchConfiguration, SetupContext } from '../types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import {
  INVARIANT_CATEGORIES,
  type InvariantCheckContext,
} from './invariants.types.js';
import {
  assertInvariant,
  InvariantViolationError,
} from './assertInvariant.js';
import { runAllInvariantChecks } from './runAllChecks.js';
import { checkTurnCounterMonotonic } from './lifecycle.checks.js';
import { checkNoCardInMultipleZones } from './gameRules.checks.js';

/**
 * Builds a valid MatchConfiguration for invariant testing. Mirrors
 * the pattern used by game.test.ts so this test file does not invent
 * a new fixture shape.
 */
function buildValidConfig(): MatchConfiguration {
  return {
    schemeId: 'test-scheme-001',
    mastermindId: 'test-mastermind-001',
    villainGroupIds: ['test-villain-group-001', 'test-villain-group-002'],
    henchmanGroupIds: ['test-henchman-group-001'],
    heroDeckIds: ['test-hero-deck-001', 'test-hero-deck-002', 'test-hero-deck-003'],
    bystandersCount: 30,
    woundsCount: 30,
    officersCount: 30,
    sidekicksCount: 0,
  };
}

/**
 * Empty registry — same shape as game.ts EMPTY_REGISTRY. Used so the
 * narrow-mock branch of buildVillainDeck produces an empty deck and
 * the test does not depend on real registry data.
 */
const EMPTY_REGISTRY: CardRegistryReader = {
  listCards: () => [],
};

/**
 * Builds a fresh valid LegendaryGameState by routing through
 * buildInitialGameState directly (not LegendaryGame.setup, to avoid
 * recursively invoking the invariant pipeline during fixture build).
 */
function buildValidGameState(): LegendaryGameState {
  return buildInitialGameState(
    buildValidConfig(),
    EMPTY_REGISTRY,
    makeMockCtx({ numPlayers: 2 }),
  );
}

const SETUP_CONTEXT: InvariantCheckContext = { phase: 'play', turn: 1 };

describe('runtime invariants (WP-031)', () => {

test('canonical INVARIANT_CATEGORIES array matches InvariantCategory union AND valid G passes all invariant checks', () => {
  // Drift-detection: assert the canonical array matches the union exactly.
  assert.deepStrictEqual(
    INVARIANT_CATEGORIES,
    ['structural', 'gameRules', 'determinism', 'security', 'lifecycle'],
  );

  const G = buildValidGameState();
  assert.doesNotThrow(() => runAllInvariantChecks(G, SETUP_CONTEXT));
});

test('card in two zones simultaneously throws with gameRules category', () => {
  const G = buildValidGameState();

  // Per Amendment A-031-01, the injection must use a non-fungible
  // CardExtId. A synthetic unique villain id placed in two distinct
  // zones (villain deck and city space 0) triggers the cross-zone
  // duplicate check. A fungible token (e.g., 'starting-shield-agent')
  // would not trigger the check by design.
  const syntheticUniqueCard = 'test-injection-unique-villain-001';
  G.villainDeck.deck.push(syntheticUniqueCard);
  G.city[0] = syntheticUniqueCard;

  assert.throws(
    () => runAllInvariantChecks(G, SETUP_CONTEXT),
    (err: Error) =>
      err instanceof InvariantViolationError &&
      (err as InvariantViolationError).category === 'gameRules',
  );
});

test('function stored in G throws with determinism category', () => {
  const G = buildValidGameState();

  // why: type-bypass to inject a function into G.counters. The
  // structural check (checkCountersAreFinite) would catch this
  // first as a non-finite value, but checkNoFunctionsInG would
  // also catch it — we use a non-counter location to ensure the
  // determinism check is the one that throws.
  (G as unknown as { messages: unknown[] }).messages.push((() => 0) as unknown);

  assert.throws(
    () => runAllInvariantChecks(G, SETUP_CONTEXT),
    (err: Error) =>
      err instanceof InvariantViolationError &&
      (err as InvariantViolationError).category === 'determinism',
  );
});

test('non-finite counter value throws with structural category', () => {
  const G = buildValidGameState();

  G.counters.bogus = NaN;

  assert.throws(
    () => runAllInvariantChecks(G, SETUP_CONTEXT),
    (err: Error) =>
      err instanceof InvariantViolationError &&
      (err as InvariantViolationError).category === 'structural',
  );
});

test('invalid phase name throws with lifecycle category and turn-counter helper rejects regression', () => {
  const G = buildValidGameState();

  assert.throws(
    () => runAllInvariantChecks(G, { phase: 'not-a-phase', turn: 1 }),
    (err: Error) =>
      err instanceof InvariantViolationError &&
      (err as InvariantViolationError).category === 'lifecycle',
  );

  // Also exercise checkTurnCounterMonotonic directly because the
  // orchestrator does not call it (D-3102 setup-only scope: there
  // is no previous-turn reference at setup time). The helper is
  // exported for future per-turn wiring.
  assert.throws(
    () => checkTurnCounterMonotonic(2, 5),
    (err: Error) =>
      err instanceof InvariantViolationError &&
      (err as InvariantViolationError).category === 'lifecycle',
  );
});

test('assertInvariant(true, ...) does not throw', () => {
  assert.doesNotThrow(() =>
    assertInvariant(true, 'structural', 'should not throw'),
  );
});

test('assertInvariant(false, ...) throws with full-sentence message and category', () => {
  assert.throws(
    () =>
      assertInvariant(
        false,
        'gameRules',
        'Full sentence error message identifying the failure and where to inspect.',
      ),
    (err: Error) => {
      return (
        err instanceof InvariantViolationError &&
        (err as InvariantViolationError).category === 'gameRules' &&
        err.message ===
          'Full sentence error message identifying the failure and where to inspect.'
      );
    },
  );
});

test('serialization roundtrip passes for valid G', () => {
  const G = buildValidGameState();
  assert.doesNotThrow(() => runAllInvariantChecks(G, SETUP_CONTEXT));
});

test('insufficient attack points does NOT trigger any invariant', () => {
  // why: insufficient attack is a gameplay condition handled by
  // fightVillain returning void. assertInvariant must not flag it.
  // Contract enforcement test per WP-028 precedent — do not weaken.
  const G = buildValidGameState();

  G.turnEconomy.attackPoints = 0;
  // Inject a synthetic villain into city space 0 with a positive
  // fight cost. This is a normal mid-play state, not corruption.
  G.city[0] = 'test-injection-unique-villain-fight-001';
  G.cardStats['test-injection-unique-villain-fight-001'] = {
    attack: 0,
    recruit: 0,
    cost: 0,
    fightCost: 5,
  };

  assert.doesNotThrow(() => runAllInvariantChecks(G, SETUP_CONTEXT));
});

test('empty wounds pile does NOT trigger any invariant', () => {
  // why: empty wounds pile is a normal game state — when the supply
  // is exhausted, gainWound returns void instead of corrupting state.
  // assertInvariant must not flag it. Contract enforcement test per
  // WP-028 precedent — do not weaken.
  const G = buildValidGameState();

  G.piles.wounds = [];

  assert.doesNotThrow(() => runAllInvariantChecks(G, SETUP_CONTEXT));
});

});

// ===========================================================================
// WP-137 — 100-seed regression for per-copy distinctness
// ===========================================================================

describe('WP-137 — checkNoCardInMultipleZones holds across 100 RNG orderings for multi-copy hero loadouts', () => {
  test('100 distinct shuffle orderings of a multi-copy hero loadout all pass checkNoCardInMultipleZones', () => {
    // why: WP-137 D-13702 — per-copy distinctness fix. Pre-WP-137,
    // every physical copy of a hero card was emitted under the same
    // ext_id string; under specific RNG orderings the deck shuffle
    // distributed copies across HQ + heroDeck, which trips the
    // checkNoCardInMultipleZones invariant. Post-WP-137, every copy
    // carries a distinct `#<copyIndex>` suffix so no shuffle ordering
    // can produce duplicates. The test exercises 100 distinct shuffle
    // orderings via a seedable Fisher-Yates Shuffle (no boardgame.io
    // import; no boardgame.io/testing import).
    //
    // Loadout: a single compliant hero with 4 cards across the four
    // locked rarity labels (5/3/3/3 = 14 cards). The Common 1 card
    // alone produces 5 copies, which is the minimum needed to exercise
    // the cross-zone fan-out — pre-WP-137 this loadout would trip the
    // invariant on at least some seeds.

    // Build a registry that produces a full multi-copy hero.
    const setData = {
      abbr: 'core',
      heroes: [
        {
          slug: 'multi-copy-hero',
          cards: [
            { slug: 'card-c1', rarityLabel: 'Common 1', name: 'C1' },
            { slug: 'card-c2', rarityLabel: 'Common 2', name: 'C2' },
            { slug: 'card-uncommon', rarityLabel: 'Uncommon', name: 'UC' },
            { slug: 'card-rare', rarityLabel: 'Rare', name: 'R' },
          ],
        },
      ],
      villains: [],
      henchmen: [],
      masterminds: [],
      schemes: [],
    };
    const registry: CardRegistryReader = {
      listCards: () => [],
      listSets: () => [{ abbr: 'core' }],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };

    const config: MatchConfiguration = {
      schemeId: 'core/test-scheme',
      mastermindId: 'core/test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/multi-copy-hero'],
      bystandersCount: 30,
      woundsCount: 30,
      officersCount: 30,
      sidekicksCount: 0,
    };

    for (let seed = 1; seed <= 100; seed++) {
      // why: per-iteration seedable mock — Fisher-Yates with a Linear
      // Congruential Generator (LCG) using the seed as state. Different
      // seeds produce different shuffle outputs; no Math.random, no
      // wall-clock reads, deterministic per seed.
      let rngState = seed;
      const nextInt = (max: number): number => {
        // LCG constants from Numerical Recipes (cycle 2^31).
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState % max;
      };
      const seededContext: SetupContext = {
        ctx: { numPlayers: 2 },
        random: {
          Shuffle: <T>(deck: T[]): T[] => {
            const out = [...deck];
            for (let i = out.length - 1; i > 0; i--) {
              const j = nextInt(i + 1);
              const tmp = out[i]!;
              out[i] = out[j]!;
              out[j] = tmp;
            }
            return out;
          },
        },
      };

      const G = buildInitialGameState(config, registry, seededContext);

      // The 100-seed assertion: per-copy distinctness must hold under
      // every RNG ordering.
      assert.doesNotThrow(
        () => checkNoCardInMultipleZones(G),
        `Seed ${seed}: checkNoCardInMultipleZones must pass for the multi-copy hero loadout under every RNG ordering`,
      );
    }
  });
});

