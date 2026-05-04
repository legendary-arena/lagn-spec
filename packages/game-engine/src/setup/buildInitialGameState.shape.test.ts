/**
 * Shape tests for buildInitialGameState.
 *
 * Verifies the structural shape of the initial LegendaryGameState (G)
 * produced by buildInitialGameState. These tests confirm that all required
 * top-level keys exist, per-player zones have the correct structure, and
 * global pile sizes match config count fields.
 *
 * Uses makeMockCtx from src/test/mockCtx.ts — no boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialGameState,
  SHIELD_AGENT_EXT_ID,
  SHIELD_TROOPER_EXT_ID,
} from './buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';

/**
 * Creates a valid mock MatchSetupConfig for shape tests.
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
 * Creates a minimal mock registry that satisfies CardRegistryReader.
 */
function createMockRegistry(): CardRegistryReader {
  return {
    listCards: () => [],
  };
}

describe('buildInitialGameState — shape', () => {
  it('G has all required top-level keys', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.ok(
      gameState.matchConfiguration !== undefined,
      'G must have matchConfiguration',
    );
    assert.ok(
      gameState.selection !== undefined,
      'G must have selection',
    );
    assert.ok(
      gameState.playerZones !== undefined,
      'G must have playerZones',
    );
    assert.ok(
      gameState.piles !== undefined,
      'G must have piles',
    );
    assert.ok(
      Array.isArray(gameState.ko),
      'G must have ko array',
    );
    assert.ok(
      gameState.attachedBystanders !== undefined,
      'G must have attachedBystanders',
    );
    assert.ok(
      Array.isArray(gameState.heroDeck),
      'G must have heroDeck array (WP-135)',
    );
  });

  it('G.heroDeck is empty when registry mock is narrow (WP-135 soft-skip)', () => {
    // why: WP-135 — the narrow CardRegistryReader (listCards-only) does
    // not satisfy buildHeroDeck's RegistryReader (requires getSet); the
    // builder soft-skips per the sibling pattern (mirrors
    // buildVillainDeck) and returns []. With heroDeck === [], HQ stays
    // all nulls — same as the pre-WP-135 initializeHq() result.
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.deepStrictEqual(gameState.heroDeck, []);
    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      assert.equal(
        gameState.hq[slotIndex],
        null,
        `Slot ${slotIndex} must be null when heroDeck is empty (narrow registry)`,
      );
    }
  });

  it('G.playerZones has one entry per player with all 5 zone arrays', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 3 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    const playerIds = Object.keys(gameState.playerZones);
    assert.equal(
      playerIds.length,
      3,
      'G.playerZones must have one entry per player',
    );

    for (const playerId of playerIds) {
      const zones = gameState.playerZones[playerId];
      assert.ok(Array.isArray(zones.deck), `Player ${playerId} must have a deck array`);
      assert.ok(Array.isArray(zones.hand), `Player ${playerId} must have a hand array`);
      assert.ok(Array.isArray(zones.discard), `Player ${playerId} must have a discard array`);
      assert.ok(Array.isArray(zones.inPlay), `Player ${playerId} must have an inPlay array`);
      assert.ok(Array.isArray(zones.victory), `Player ${playerId} must have a victory array`);
    }
  });

  it('only deck is non-empty after setup; hand, discard, inPlay, victory are empty', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    for (const playerId of Object.keys(gameState.playerZones)) {
      const zones = gameState.playerZones[playerId];
      assert.ok(zones.deck.length > 0, `Player ${playerId} deck must be non-empty`);
      assert.equal(zones.hand.length, 0, `Player ${playerId} hand must be empty`);
      assert.equal(zones.discard.length, 0, `Player ${playerId} discard must be empty`);
      assert.equal(zones.inPlay.length, 0, `Player ${playerId} inPlay must be empty`);
      assert.equal(zones.victory.length, 0, `Player ${playerId} victory must be empty`);
    }
  });

  it('each player starting deck has 12 cards (8 agents + 4 troopers)', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    for (const playerId of Object.keys(gameState.playerZones)) {
      assert.equal(
        gameState.playerZones[playerId].deck.length,
        12,
        `Player ${playerId} starting deck must have 12 cards`,
      );
    }
  });

  it('G.piles.bystanders.length equals config.bystandersCount', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      gameState.piles.bystanders.length,
      config.bystandersCount,
      'Bystanders pile size must match config.bystandersCount',
    );
  });

  it('G.piles.wounds.length equals config.woundsCount', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      gameState.piles.wounds.length,
      config.woundsCount,
      'Wounds pile size must match config.woundsCount',
    );
  });

  it('G.piles.officers.length equals config.officersCount', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      gameState.piles.officers.length,
      config.officersCount,
      'Officers pile size must match config.officersCount',
    );
  });

  it('G.piles.sidekicks.length equals config.sidekicksCount', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      gameState.piles.sidekicks.length,
      config.sidekicksCount,
      'Sidekicks pile size must match config.sidekicksCount',
    );
  });

  it('all zone and pile contents are strings (CardExtId)', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    // Check player zones
    for (const playerId of Object.keys(gameState.playerZones)) {
      const zones = gameState.playerZones[playerId];
      for (const card of zones.deck) {
        assert.equal(typeof card, 'string', `Player ${playerId} deck entry must be a string`);
      }
    }

    // Check global piles
    for (const card of gameState.piles.bystanders) {
      assert.equal(typeof card, 'string', 'Bystander pile entry must be a string');
    }
    for (const card of gameState.piles.wounds) {
      assert.equal(typeof card, 'string', 'Wound pile entry must be a string');
    }
    for (const card of gameState.piles.officers) {
      assert.equal(typeof card, 'string', 'Officer pile entry must be a string');
    }
    for (const card of gameState.piles.sidekicks) {
      assert.equal(typeof card, 'string', 'Sidekick pile entry must be a string');
    }
  });

  it('G.selection contains the correct IDs from config', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(gameState.selection.schemeId, 'test-scheme-001');
    assert.equal(gameState.selection.mastermindId, 'test-mastermind-001');
    assert.deepStrictEqual(
      gameState.selection.villainGroupIds,
      ['test-villain-group-001'],
    );
    assert.deepStrictEqual(
      gameState.selection.henchmanGroupIds,
      ['test-henchman-group-001'],
    );
    assert.deepStrictEqual(
      gameState.selection.heroDeckIds,
      ['test-hero-deck-001', 'test-hero-deck-002'],
    );
  });

  it('JSON.stringify(G) does not throw', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    const serialized = JSON.stringify(gameState);
    assert.ok(serialized, 'JSON.stringify(G) must produce a non-empty string');
  });

  it('works with 1 player (solo mode)', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 1 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      Object.keys(gameState.playerZones).length,
      1,
      'Solo mode must produce exactly 1 player zone entry',
    );
  });

  it('works with 5 players (maximum)', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 5 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      Object.keys(gameState.playerZones).length,
      5,
      'Max player mode must produce exactly 5 player zone entries',
    );
  });

  it('starting deck contains exactly 8 agents and 4 troopers', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    for (const playerId of Object.keys(gameState.playerZones)) {
      const deck = gameState.playerZones[playerId].deck;
      let agentCount = 0;
      let trooperCount = 0;

      for (const cardId of deck) {
        if (cardId === SHIELD_AGENT_EXT_ID) {
          agentCount++;
        } else if (cardId === SHIELD_TROOPER_EXT_ID) {
          trooperCount++;
        }
      }

      assert.equal(
        agentCount,
        8,
        `Player ${playerId} starting deck must contain exactly 8 S.H.I.E.L.D. Agents`,
      );
      assert.equal(
        trooperCount,
        4,
        `Player ${playerId} starting deck must contain exactly 4 S.H.I.E.L.D. Troopers`,
      );
    }
  });

  it('selection fields match matchConfiguration (invariant: never diverge)', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      gameState.selection.schemeId,
      gameState.matchConfiguration.schemeId,
      'selection.schemeId must equal matchConfiguration.schemeId',
    );
    assert.equal(
      gameState.selection.mastermindId,
      gameState.matchConfiguration.mastermindId,
      'selection.mastermindId must equal matchConfiguration.mastermindId',
    );
    assert.deepStrictEqual(
      [...gameState.selection.villainGroupIds],
      [...gameState.matchConfiguration.villainGroupIds],
      'selection.villainGroupIds must equal matchConfiguration.villainGroupIds',
    );
    assert.deepStrictEqual(
      [...gameState.selection.henchmanGroupIds],
      [...gameState.matchConfiguration.henchmanGroupIds],
      'selection.henchmanGroupIds must equal matchConfiguration.henchmanGroupIds',
    );
    assert.deepStrictEqual(
      [...gameState.selection.heroDeckIds],
      [...gameState.matchConfiguration.heroDeckIds],
      'selection.heroDeckIds must equal matchConfiguration.heroDeckIds',
    );
  });

  // why: WP-135 — full-registry shape assertions. Inline fixture mirrors
  // buildLoadoutFixtureRegistry in loadout.test (intentional duplication
  // per code-style Rule 1: duplicate first, abstract on third copy).
  function buildShapeFixtureRegistry() {
    const setData = {
      abbr: 'core',
      schemes: [{ slug: 'midtown-bank-robbery' }],
      masterminds: [
        {
          slug: 'dr-doom',
          cards: [
            { slug: 'doom-base', tactic: false, vAttack: '8' },
            { slug: 'doom-tactic-a', tactic: true, vAttack: '4' },
          ],
        },
      ],
      henchmen: [{ slug: 'doombot-legion', vAttack: '3' }],
      villains: [
        {
          slug: 'brotherhood',
          cards: [{ slug: 'magneto', vAttack: '6' }],
        },
      ],
      heroes: [
        {
          slug: 'black-widow',
          cards: [
            { slug: 'mission-accomplished', rarityLabel: 'Common 1', name: 'Mission', imageUrl: '', cost: 2 },
            { slug: 'silent-takedown', rarityLabel: 'Common 2', name: 'Silent', imageUrl: '', cost: 3 },
            { slug: 'covert-operation', rarityLabel: 'Uncommon', name: 'Covert', imageUrl: '', cost: 4 },
            { slug: 'taskmaster', rarityLabel: 'Rare', name: 'Taskmaster', imageUrl: '', cost: 6 },
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

  function buildShapeFixtureConfig(): MatchSetupConfig {
    return {
      schemeId: 'core/midtown-bank-robbery',
      mastermindId: 'core/dr-doom',
      villainGroupIds: ['core/brotherhood'],
      henchmanGroupIds: ['core/doombot-legion'],
      heroDeckIds: ['core/black-widow'],
      bystandersCount: 5,
      woundsCount: 5,
      officersCount: 5,
      sidekicksCount: 5,
    };
  }

  it('G.heroDeck.length === total hero cards built minus 5 in HQ (WP-135 — 1 hero × 14 - 5 = 9)', () => {
    const registry = buildShapeFixtureRegistry();
    const config = buildShapeFixtureConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const gameState = buildInitialGameState(config, registry, context);

    assert.equal(
      gameState.heroDeck.length,
      9,
      '14 hero cards (1 hero × 5/3/3/3) minus 5 in HQ = 9 in G.heroDeck',
    );
  });

  it('G.hq has exactly 5 non-null slots when heroDeck is large enough (WP-135)', () => {
    const registry = buildShapeFixtureRegistry();
    const config = buildShapeFixtureConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const gameState = buildInitialGameState(config, registry, context);

    const filledCount = gameState.hq.filter((slot) => slot !== null).length;
    assert.equal(filledCount, 5, 'All 5 HQ slots must be populated from the hero deck front');
  });

  it('JSON.stringify(G) succeeds when G.heroDeck is populated (WP-135 — serialization invariant)', () => {
    const registry = buildShapeFixtureRegistry();
    const config = buildShapeFixtureConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const gameState = buildInitialGameState(config, registry, context);

    const serialized = JSON.stringify(gameState);
    assert.ok(serialized, 'JSON.stringify(G) must succeed with a populated G.heroDeck');
    const parsed = JSON.parse(serialized) as { heroDeck: unknown };
    assert.deepStrictEqual(parsed.heroDeck, gameState.heroDeck);
  });

  it('selection arrays are copies, not shared references with matchConfiguration', () => {
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });
    const registry = createMockRegistry();

    const gameState = buildInitialGameState(config, registry, context);

    // why: buildMatchSelection spreads config arrays to create independent
    // copies. If the spread is removed, mutating selection would corrupt
    // matchConfiguration (or vice versa). Reference inequality proves isolation.
    assert.notEqual(
      gameState.selection.villainGroupIds,
      gameState.matchConfiguration.villainGroupIds,
      'selection.villainGroupIds must not be the same reference as matchConfiguration.villainGroupIds',
    );
    assert.notEqual(
      gameState.selection.henchmanGroupIds,
      gameState.matchConfiguration.henchmanGroupIds,
      'selection.henchmanGroupIds must not be the same reference as matchConfiguration.henchmanGroupIds',
    );
    assert.notEqual(
      gameState.selection.heroDeckIds,
      gameState.matchConfiguration.heroDeckIds,
      'selection.heroDeckIds must not be the same reference as matchConfiguration.heroDeckIds',
    );
  });
});
