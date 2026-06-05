/**
 * Tests for resolveFightCost (WP-214).
 *
 * Covers static and dynamic fight cost resolution, edge cases, and
 * backward compatibility with pre-WP-214 static villains.
 *
 * Uses node:test only — no boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import { resolveFightCost } from './economy.resolve.js';

/**
 * Builds a minimal G suitable for resolveFightCost tests.
 */
function makeG(options: {
  cardStats?: Record<string, { fightCost: number; fightCostMode: 'static' | 'dynamic'; fightCostBase: number; cost?: number }>;
  villainAttachedHeroes?: Record<string, CardExtId[]>;
}): LegendaryGameState {
  return {
    cardStats: options.cardStats ?? {},
    villainAttachedHeroes: options.villainAttachedHeroes ?? {},
  } as unknown as LegendaryGameState;
}

// ---------------------------------------------------------------------------
// Static villains
// ---------------------------------------------------------------------------

describe('resolveFightCost — static villain', () => {
  it('returns fightCost directly for static villain', () => {
    const G = makeG({
      cardStats: {
        'villain-a': { fightCost: 7, fightCostMode: 'static', fightCostBase: 0 },
      },
    });
    assert.equal(resolveFightCost(G, 'villain-a' as CardExtId), 7);
  });

  it('returns 0 when cardStats entry is missing', () => {
    const G = makeG({ cardStats: {} });
    assert.equal(resolveFightCost(G, 'no-entry' as CardExtId), 0);
  });

  it('static villain is unaffected by any attached heroes (backward compat)', () => {
    const G = makeG({
      cardStats: {
        'villain-static': { fightCost: 5, fightCostMode: 'static', fightCostBase: 0, cost: 0 },
        'hero-1': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 4 },
      },
      villainAttachedHeroes: { 'villain-static': ['hero-1' as CardExtId] },
    });
    assert.equal(resolveFightCost(G, 'villain-static' as CardExtId), 5);
  });
});

// ---------------------------------------------------------------------------
// Dynamic villains — vAttack: "*"
// ---------------------------------------------------------------------------

describe('resolveFightCost — dynamic villain (vAttack: "*")', () => {
  it('returns captured hero recruit cost for vAttack "*" with one hero', () => {
    const G = makeG({
      cardStats: {
        'villain-skrull': { fightCost: 0, fightCostMode: 'dynamic', fightCostBase: 0, cost: 0 },
        'hero-spider-man': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 5 },
      },
      villainAttachedHeroes: { 'villain-skrull': ['hero-spider-man' as CardExtId] },
    });
    assert.equal(resolveFightCost(G, 'villain-skrull' as CardExtId), 5);
  });

  it('returns 0 for vAttack "*" with no captured heroes', () => {
    const G = makeG({
      cardStats: {
        'villain-skrull': { fightCost: 0, fightCostMode: 'dynamic', fightCostBase: 0, cost: 0 },
      },
      villainAttachedHeroes: {},
    });
    assert.equal(resolveFightCost(G, 'villain-skrull' as CardExtId), 0);
  });

  it('guards undefined villainAttachedHeroes entry (returns 0, not NaN)', () => {
    const G = makeG({
      cardStats: {
        'villain-skrull': { fightCost: 0, fightCostMode: 'dynamic', fightCostBase: 0, cost: 0 },
      },
      // villainAttachedHeroes has no entry for villain-skrull
    });
    const cost = resolveFightCost(G, 'villain-skrull' as CardExtId);
    assert.equal(cost, 0);
    assert.ok(Number.isFinite(cost));
  });
});

// ---------------------------------------------------------------------------
// Dynamic villains — vAttack: "N+"
// ---------------------------------------------------------------------------

describe('resolveFightCost — dynamic villain (vAttack: "N+")', () => {
  it('returns base + captured hero cost for vAttack "N+"', () => {
    const G = makeG({
      cardStats: {
        'villain-np': { fightCost: 4, fightCostMode: 'dynamic', fightCostBase: 4, cost: 0 },
        'hero-a': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 3 },
      },
      villainAttachedHeroes: { 'villain-np': ['hero-a' as CardExtId] },
    });
    assert.equal(resolveFightCost(G, 'villain-np' as CardExtId), 7);
  });

  it('returns base when no heroes captured (vAttack "N+" with empty)', () => {
    const G = makeG({
      cardStats: {
        'villain-np': { fightCost: 4, fightCostMode: 'dynamic', fightCostBase: 4, cost: 0 },
      },
    });
    assert.equal(resolveFightCost(G, 'villain-np' as CardExtId), 4);
  });
});

// ---------------------------------------------------------------------------
// Dynamic villains — multiple captured heroes
// ---------------------------------------------------------------------------

describe('resolveFightCost — multiple captured heroes', () => {
  it('sums recruit costs of all captured heroes', () => {
    const G = makeG({
      cardStats: {
        'villain-skrull': { fightCost: 0, fightCostMode: 'dynamic', fightCostBase: 0, cost: 0 },
        'hero-1': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 3 },
        'hero-2': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 5 },
        'hero-3': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 2 },
      },
      villainAttachedHeroes: {
        'villain-skrull': ['hero-1' as CardExtId, 'hero-2' as CardExtId, 'hero-3' as CardExtId],
      },
    });
    assert.equal(resolveFightCost(G, 'villain-skrull' as CardExtId), 10);
  });

  it('treats missing cardStats for a captured hero as 0 (no NaN)', () => {
    const G = makeG({
      cardStats: {
        'villain-skrull': { fightCost: 0, fightCostMode: 'dynamic', fightCostBase: 0, cost: 0 },
        'hero-known': { fightCost: 0, fightCostMode: 'static', fightCostBase: 0, cost: 4 },
        // hero-unknown has no entry
      },
      villainAttachedHeroes: {
        'villain-skrull': ['hero-known' as CardExtId, 'hero-unknown' as CardExtId],
      },
    });
    const cost = resolveFightCost(G, 'villain-skrull' as CardExtId);
    assert.equal(cost, 4);
    assert.ok(Number.isFinite(cost));
  });
});
