/**
 * Type contract tests for the villain ability hook subsystem.
 *
 * Verifies drift-detection for VILLAIN_ABILITY_TIMINGS and
 * VILLAIN_EFFECT_KEYWORDS against their unions, getVillainHooksForCard
 * query behavior, and JSON-serializability of VillainAbilityHook.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VILLAIN_ABILITY_TIMINGS,
  VILLAIN_EFFECT_KEYWORDS,
  getVillainHooksForCard,
} from './villainAbility.types.js';
import type {
  VillainAbilityHook,
  VillainAbilityTiming,
  VillainEffectKeyword,
} from './villainAbility.types.js';
import type { CardExtId } from '../state/zones.types.js';

describe('VILLAIN_ABILITY_TIMINGS drift-detection', () => {
  // why: failure means union/array mismatch — a timing added to the union but
  // not the array (or vice versa) would silently break hook dispatch for the
  // missing timing. Same pattern as HERO_ABILITY_TIMINGS / REVEALED_CARD_TYPES.
  // WP-186 added 'onEscape' as the third entry (D-18601); the array length is
  // now 3 and the canonical order is locked.
  it('contains exactly the 3 canonical timing values in order', () => {
    const expectedTimings: VillainAbilityTiming[] = [
      'onAmbush',
      'onFight',
      'onEscape',
    ];

    assert.equal(
      VILLAIN_ABILITY_TIMINGS.length,
      3,
      'VILLAIN_ABILITY_TIMINGS must have exactly 3 entries',
    );

    assert.deepStrictEqual(
      [...VILLAIN_ABILITY_TIMINGS],
      expectedTimings,
      'VILLAIN_ABILITY_TIMINGS must match the canonical timing values in order',
    );

    const uniqueTimings = new Set(VILLAIN_ABILITY_TIMINGS);
    assert.equal(
      uniqueTimings.size,
      VILLAIN_ABILITY_TIMINGS.length,
      'VILLAIN_ABILITY_TIMINGS must have no duplicates',
    );
  });

  // why: `Overrun:` is a v1 synonym of `Escape:` and emits `onEscape` at
  // parse time (D-18602). `'onOverrun'` must never appear in the timing
  // union or canonical array — distinct overrun semantics are deferred to a
  // future scheme-text WP. This guard prevents accidental reintroduction.
  it("does not contain 'onOverrun' (D-18602 synonym lock)", () => {
    assert.equal(
      VILLAIN_ABILITY_TIMINGS.includes('onOverrun' as VillainAbilityTiming),
      false,
      "VILLAIN_ABILITY_TIMINGS must not include 'onOverrun' — Overrun: emits onEscape (D-18602)",
    );
  });
});

describe('VILLAIN_EFFECT_KEYWORDS drift-detection', () => {
  // why: failure means the locked vocabulary drifted from the union. WP-189
  // appended 'koHeroEachPlayer' at position 6 (D-18901; the incremental-
  // expansion governance clause). WP-202 appended 'koHeroEachPlayerMag2'
  // at position 7 (D-20201; closed-union-per-magnitude). WP-214 appended
  // captureHqHero* at positions 8-10 (D-21401). Positions 1-5 stay
  // byte-identical to the WP-185 array — WP-187's executed markers +
  // the apply-effect-markers.mjs local copy depend on the first-five
  // ordering. Any further addition requires a new WP + DECISIONS.md entry.
  it('contains exactly the 10 canonical effect keyword values in order', () => {
    const expectedKeywords: VillainEffectKeyword[] = [
      'gainWoundEachPlayer',
      'gainWoundCurrentPlayer',
      'koHeroCurrentPlayer',
      'heroDeckTopToEscape',
      'captureBystander',
      'koHeroEachPlayer',
      'koHeroEachPlayerMag2',
      'captureHqHeroRightmost',
      'captureHqHeroHighestCost',
      'captureHqHeroLowestCost',
    ];

    assert.equal(
      VILLAIN_EFFECT_KEYWORDS.length,
      10,
      'VILLAIN_EFFECT_KEYWORDS must have exactly 10 entries',
    );

    assert.deepStrictEqual(
      [...VILLAIN_EFFECT_KEYWORDS],
      expectedKeywords,
      'VILLAIN_EFFECT_KEYWORDS must match the canonical keyword values in order',
    );

    const uniqueKeywords = new Set(VILLAIN_EFFECT_KEYWORDS);
    assert.equal(
      uniqueKeywords.size,
      VILLAIN_EFFECT_KEYWORDS.length,
      'VILLAIN_EFFECT_KEYWORDS must have no duplicates',
    );
  });

  // why: WP-189 appended at position 6; WP-202 appended at position 7;
  // WP-214 appended at positions 8, 9, 10.
  // WP-187's executed markers + the overlay script's local copy are keyed
  // on positions 0-5 being byte-identical to the post-WP-189 array; an
  // insertion mid-array would silently break them. This guard pins
  // positions 0-5 byte-identical and asserts position 6 is the WP-202
  // append slot.
  it('preserves the post-WP-189 first-six entries at positions 0-5 (append-only invariant)', () => {
    const firstSix: VillainEffectKeyword[] = [
      'gainWoundEachPlayer',
      'gainWoundCurrentPlayer',
      'koHeroCurrentPlayer',
      'heroDeckTopToEscape',
      'captureBystander',
      'koHeroEachPlayer',
    ];
    assert.deepStrictEqual(
      VILLAIN_EFFECT_KEYWORDS.slice(0, 6),
      firstSix,
      'VILLAIN_EFFECT_KEYWORDS positions 0-5 must be byte-identical to the post-WP-189 array (WP-187/WP-190 marker compatibility)',
    );
    assert.equal(
      VILLAIN_EFFECT_KEYWORDS[6],
      'koHeroEachPlayerMag2',
      "'koHeroEachPlayerMag2' must be at position 6 (the appended slot for WP-202)",
    );
  });
});

describe('getVillainHooksForCard', () => {
  const hooks: VillainAbilityHook[] = [
    {
      cardId: 'core-villain-skrulls-super-skrull' as CardExtId,
      timing: 'onAmbush',
      keywords: ['captureBystander'],
      effects: ['captureBystander'],
    },
    {
      cardId: 'core-villain-skrulls-super-skrull' as CardExtId,
      timing: 'onFight',
      keywords: ['koHeroCurrentPlayer'],
      effects: ['koHeroCurrentPlayer'],
    },
    {
      cardId: 'henchman-doombot-legion-00' as CardExtId,
      timing: 'onFight',
      keywords: [],
      effects: [],
    },
  ];

  it('returns only hooks matching both cardId and timing', () => {
    const matched = getVillainHooksForCard(
      hooks,
      'core-villain-skrulls-super-skrull' as CardExtId,
      'onFight',
    );
    assert.equal(matched.length, 1, 'exactly one onFight hook for that card');
    assert.deepStrictEqual(matched[0]!.effects, ['koHeroCurrentPlayer']);
  });

  it('returns an empty array when cardId is absent', () => {
    const matched = getVillainHooksForCard(
      hooks,
      'core-villain-unknown-nobody' as CardExtId,
      'onFight',
    );
    assert.deepStrictEqual(matched, []);
  });

  it('returns an empty array when the timing does not match', () => {
    const matched = getVillainHooksForCard(
      hooks,
      'henchman-doombot-legion-00' as CardExtId,
      'onAmbush',
    );
    assert.deepStrictEqual(matched, []);
  });

  it('does not return the input array reference (fresh result)', () => {
    const matched = getVillainHooksForCard(
      hooks,
      'core-villain-skrulls-super-skrull' as CardExtId,
      'onAmbush',
    );
    assert.notEqual(matched, hooks, 'result must be a fresh array');
    assert.equal(matched.length, 1);
  });
});

describe('VillainAbilityHook serialization', () => {
  it('JSON round-trips a sample hook', () => {
    const sample: VillainAbilityHook = {
      cardId: 'core-villain-hood-the-hood' as CardExtId,
      timing: 'onAmbush',
      keywords: ['captureBystander'],
      effects: ['captureBystander'],
    };

    const serialized = JSON.stringify(sample);
    assert.ok(serialized.length > 2, 'serialized output must contain data');

    const deserialized = JSON.parse(serialized) as VillainAbilityHook;
    assert.deepStrictEqual(deserialized, sample, 'hook must survive JSON round-trip');
  });
});
