/**
 * Contract enforcement tests for zone shape validators (WP-156).
 *
 * Covers validateGameStateShape with the 5-field GlobalPiles shape
 * (bystanders, wounds, officers, sidekicks, horrors).
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGameStateShape, validatePlayerStateShape } from './zones.validate.js';

/**
 * Creates a minimal valid GameStateShape fixture for validation tests.
 */
function createValidGameStateShape(): unknown {
  return {
    playerZones: {
      '0': {
        deck: ['card-a', 'card-b'],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    },
    piles: {
      bystanders: ['pile-bystander', 'pile-bystander'],
      wounds: ['pile-wound'],
      officers: ['pile-shield-officer'],
      sidekicks: ['pile-sidekick'],
      horrors: [],
    },
  };
}

describe('validateGameStateShape', () => {
  it('passes for a valid game state shape with all 5 pile fields', () => {
    const input = createValidGameStateShape();
    const result = validateGameStateShape(input);

    assert.deepStrictEqual(result, { ok: true });
  });

  it('fails when horrors field is missing from piles', () => {
    const input = createValidGameStateShape() as Record<string, unknown>;
    const piles = input['piles'] as Record<string, unknown>;
    delete piles['horrors'];

    const result = validateGameStateShape(input);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const horrorError = result.errors.find((error) =>
        error.field.includes('horrors'),
      );
      assert.ok(
        horrorError !== undefined,
        'must report an error for missing horrors field',
      );
    }
  });

  it('fails when horrors contains non-string entries', () => {
    const input = createValidGameStateShape() as Record<string, unknown>;
    const piles = input['piles'] as Record<string, unknown>;
    piles['horrors'] = [42, null];

    const result = validateGameStateShape(input);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const horrorError = result.errors.find((error) =>
        error.field.includes('horrors'),
      );
      assert.ok(
        horrorError !== undefined,
        'must report an error for non-string entries in horrors',
      );
    }
  });

  it('fails when horrors is not an array', () => {
    const input = createValidGameStateShape() as Record<string, unknown>;
    const piles = input['piles'] as Record<string, unknown>;
    piles['horrors'] = 'not-an-array';

    const result = validateGameStateShape(input);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const horrorError = result.errors.find((error) =>
        error.field === 'piles.horrors',
      );
      assert.ok(
        horrorError !== undefined,
        'must report an error when horrors is not an array',
      );
    }
  });

  it('passes when horrors contains valid CardExtId strings', () => {
    const input = createValidGameStateShape() as Record<string, unknown>;
    const piles = input['piles'] as Record<string, unknown>;
    piles['horrors'] = ['horror-card-001', 'horror-card-002'];

    const result = validateGameStateShape(input);

    assert.deepStrictEqual(result, { ok: true });
  });

  it('fails for non-object input', () => {
    const result = validateGameStateShape(null);

    assert.equal(result.ok, false);
  });
});

describe('validatePlayerStateShape', () => {
  it('passes for a valid player state', () => {
    const input = {
      playerId: '0',
      zones: {
        deck: ['card-a'],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    };

    const result = validatePlayerStateShape(input);

    assert.deepStrictEqual(result, { ok: true });
  });

  it('fails when playerId is not a string', () => {
    const input = {
      playerId: 42,
      zones: {
        deck: [],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    };

    const result = validatePlayerStateShape(input);

    assert.equal(result.ok, false);
  });
});
