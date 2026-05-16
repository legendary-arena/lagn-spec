/**
 * Structural shape tests for zone and player state validators.
 *
 * These tests confirm that validateGameStateShape and validatePlayerStateShape
 * correctly distinguish valid shapes from invalid ones. They test structure
 * only — no card identity, gameplay rules, or registry lookups.
 *
 * No boardgame.io imports — pure unit tests using node:test and node:assert.
 */

import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { validateGameStateShape, validatePlayerStateShape } from './zones.validate.js';

describe('validateGameStateShape', () => {
  it('returns ok: true for a minimal valid game state shape', () => {
    const validGameState = {
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
        bystanders: ['pile-bystander'],
        wounds: ['pile-wound'],
        officers: ['pile-shield-officer'],
        sidekicks: ['pile-sidekick'],
        horrors: [],
      },
    };

    const result = validateGameStateShape(validGameState);

    deepStrictEqual(result, { ok: true });
  });

  it('returns ok: false when playerZones key is missing', () => {
    const missingPlayerZones = {
      piles: {
        bystanders: [],
        wounds: [],
        officers: [],
        sidekicks: [],
        horrors: [],
      },
    };

    const result = validateGameStateShape(missingPlayerZones);

    strictEqual(result.ok, false);
    if (!result.ok) {
      strictEqual(result.errors.length > 0, true);
      strictEqual(result.errors[0].field, 'playerZones');
    }
  });

  it('returns ok: false when piles key is missing', () => {
    const missingPiles = {
      playerZones: {
        '0': {
          deck: [],
          hand: [],
          discard: [],
          inPlay: [],
          victory: [],
        },
      },
    };

    const result = validateGameStateShape(missingPiles);

    strictEqual(result.ok, false);
    if (!result.ok) {
      strictEqual(result.errors.length > 0, true);
      strictEqual(result.errors[0].field, 'piles');
    }
  });
});

describe('validatePlayerStateShape', () => {
  it('returns ok: true for a minimal valid player state', () => {
    const validPlayerState = {
      playerId: '0',
      zones: {
        deck: ['card-a'],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    };

    const result = validatePlayerStateShape(validPlayerState);

    deepStrictEqual(result, { ok: true });
  });

  it('returns ok: false when a zone contains a non-string value', () => {
    const invalidPlayerState = {
      playerId: '0',
      zones: {
        deck: [42],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    };

    const result = validatePlayerStateShape(invalidPlayerState);

    strictEqual(result.ok, false);
    if (!result.ok) {
      strictEqual(result.errors.length > 0, true);
      strictEqual(result.errors[0].field, 'zones.deck[0]');
    }
  });

  it('returns ok: false when zones key is missing', () => {
    const missingZones = {
      playerId: '0',
    };

    const result = validatePlayerStateShape(missingZones);

    strictEqual(result.ok, false);
    if (!result.ok) {
      strictEqual(result.errors.length > 0, true);
      strictEqual(result.errors[0].field, 'zones');
    }
  });
});

describe('zone validators — no-throw contract', () => {
  it('validateGameStateShape never throws, even with null input', () => {
    const result = validateGameStateShape(null);

    strictEqual(result.ok, false);
  });

  it('validateGameStateShape never throws, even with undefined input', () => {
    const result = validateGameStateShape(undefined);

    strictEqual(result.ok, false);
  });

  it('validatePlayerStateShape never throws, even with a number input', () => {
    const result = validatePlayerStateShape(42);

    strictEqual(result.ok, false);
  });

  it('validatePlayerStateShape never throws, even with an array input', () => {
    const result = validatePlayerStateShape(['not', 'a', 'player']);

    strictEqual(result.ok, false);
  });
});
