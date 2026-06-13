/**
 * Tests for the count-source resolver and the HERO_COUNT_SOURCES drift parity
 * (WP-247 / D-24016).
 *
 * Covers: drift parity (union ↔ canonical array), the victory-bystanders count
 * across both ext_id forms (pile-bystander + bystander-villain-deck-NN), the
 * exclusion of non-bystander victory-pile cards, the empty / missing-player
 * zero cases, and the unknown-source defensive zero.
 *
 * No boardgame.io imports. Uses node:test and node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCountSource } from './heroCountSource.resolve.js';
import { HERO_COUNT_SOURCES } from '../rules/heroCountSource.js';
import type { HeroCountSource } from '../rules/heroCountSource.js';
import { BYSTANDER_EXT_ID } from '../setup/pilesInit.js';
import type { LegendaryGameState } from '../types.js';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Builds a minimal LegendaryGameState whose only meaningful content is player
 * "0"'s victory pile. resolveCountSource reads only G.playerZones[playerID].victory.
 *
 * @param victory - The victory-pile ext_id entries for player "0".
 * @returns A minimal game state cast to LegendaryGameState.
 */
function makeStateWithVictory(victory: string[]): LegendaryGameState {
  return {
    playerZones: {
      '0': { deck: [], hand: [], discard: [], inPlay: [], victory },
    },
  } as unknown as LegendaryGameState;
}

// ---------------------------------------------------------------------------
// Drift parity
// ---------------------------------------------------------------------------

describe('HERO_COUNT_SOURCES drift-detection', () => {
  // why: prevents union/array divergence — same pattern as HERO_KEYWORDS drift
  // detection. A new HeroCountSource must update BOTH the union and this array.
  it('contains exactly the 1 canonical count-source value', () => {
    const expectedSources = ['victory-bystanders'];

    assert.equal(
      HERO_COUNT_SOURCES.length,
      1,
      'HERO_COUNT_SOURCES must have exactly 1 entry',
    );

    assert.deepStrictEqual(
      [...HERO_COUNT_SOURCES],
      expectedSources,
      'HERO_COUNT_SOURCES must match the canonical count-source values in order',
    );

    const uniqueSources = new Set(HERO_COUNT_SOURCES);
    assert.equal(
      uniqueSources.size,
      HERO_COUNT_SOURCES.length,
      'HERO_COUNT_SOURCES must have no duplicates',
    );
  });
});

// ---------------------------------------------------------------------------
// victory-bystanders resolver
// ---------------------------------------------------------------------------

describe('resolveCountSource victory-bystanders', () => {
  it('counts N victory-pile bystanders across both ext_id forms', () => {
    // 3 bystanders: 2 pile-bystander + 1 villain-deck form → 3.
    const gameState = makeStateWithVictory([
      BYSTANDER_EXT_ID,
      'bystander-villain-deck-03',
      BYSTANDER_EXT_ID,
    ]);

    assert.equal(
      resolveCountSource(gameState, '0', 'victory-bystanders'),
      3,
      'all three bystanders (both ext_id forms) must be counted',
    );
  });

  it('returns 0 when the victory pile holds no bystanders', () => {
    const gameState = makeStateWithVictory([]);

    assert.equal(
      resolveCountSource(gameState, '0', 'victory-bystanders'),
      0,
      'an empty victory pile must resolve to 0',
    );
  });

  it('excludes villain, henchman, and tactic victory-pile cards', () => {
    // Mixed victory pile: 2 bystanders + 3 non-bystander VP cards → 2.
    const gameState = makeStateWithVictory([
      BYSTANDER_EXT_ID,
      'core/villain/hydra/agent#0',
      'bystander-villain-deck-07',
      'core/henchman/doombot#1',
      'core/mastermind/red-skull/tactic-1#0',
    ]);

    assert.equal(
      resolveCountSource(gameState, '0', 'victory-bystanders'),
      2,
      'only the two bystanders count; villain/henchman/tactic VP cards are excluded',
    );
  });

  it('returns 0 when the player has no zones (defensive)', () => {
    const gameState = makeStateWithVictory([]);

    assert.equal(
      resolveCountSource(gameState, '99', 'victory-bystanders'),
      0,
      'a player with no zones must resolve to 0 (no throw)',
    );
  });
});

// ---------------------------------------------------------------------------
// unknown source (defensive totality)
// ---------------------------------------------------------------------------

describe('resolveCountSource unknown source', () => {
  it('returns 0 for an unrecognized source (defensive)', () => {
    const gameState = makeStateWithVictory([BYSTANDER_EXT_ID, BYSTANDER_EXT_ID]);

    // why: the union is closed, but a malformed hook could carry an unknown
    // source string; the resolver must be total and return 0 (no throw).
    const unknownSource = 'made-up-source' as HeroCountSource;

    assert.equal(
      resolveCountSource(gameState, '0', unknownSource),
      0,
      'an unknown source must resolve to 0',
    );
  });
});
