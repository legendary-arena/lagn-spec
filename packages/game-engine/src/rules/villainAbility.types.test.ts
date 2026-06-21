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
  VILLAIN_EFFECT_PRIMITIVES,
  LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR,
  descriptorToLegacyKeyword,
  getVillainHooksForCard,
} from './villainAbility.types.js';
import type {
  VillainAbilityHook,
  VillainAbilityTiming,
  VillainEffectKeyword,
  VillainEffectPrimitive,
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
      effects: [{ primitive: 'capture-bystander' }],
    },
    {
      cardId: 'core-villain-skrulls-super-skrull' as CardExtId,
      timing: 'onFight',
      keywords: ['koHeroCurrentPlayer'],
      effects: [{ primitive: 'ko-hero', target: 'current' }],
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
    assert.deepStrictEqual(matched[0]!.keywords, ['koHeroCurrentPlayer']);
    assert.deepStrictEqual(matched[0]!.effects, [
      { primitive: 'ko-hero', target: 'current' },
    ]);
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
      effects: [{ primitive: 'capture-bystander' }],
    };

    const serialized = JSON.stringify(sample);
    assert.ok(serialized.length > 2, 'serialized output must contain data');

    const deserialized = JSON.parse(serialized) as VillainAbilityHook;
    assert.deepStrictEqual(deserialized, sample, 'hook must survive JSON round-trip');
  });
});

describe('VILLAIN_EFFECT_PRIMITIVES drift-detection', () => {
  // why: VILLAIN_EFFECT_PRIMITIVES is the canonical readonly array for the
  // parameterized vocabulary (WP-252 / D-24023). Per code-style §Drift
  // Detection a canonical array must assert it matches its union exactly —
  // adding a primitive to the union but not the array (or vice versa) would
  // silently break dispatch. The 5 primitives collapse the 10 frozen keywords.
  it('contains exactly the 5 canonical primitives in order', () => {
    const expectedPrimitives: VillainEffectPrimitive[] = [
      'ko-hero',
      'gain-wound',
      'capture-hq-hero',
      'hero-deck-top-to-escape',
      'capture-bystander',
    ];
    assert.equal(
      VILLAIN_EFFECT_PRIMITIVES.length,
      5,
      'VILLAIN_EFFECT_PRIMITIVES must have exactly 5 entries',
    );
    assert.deepStrictEqual(
      [...VILLAIN_EFFECT_PRIMITIVES],
      expectedPrimitives,
      'VILLAIN_EFFECT_PRIMITIVES must match the canonical primitives in order',
    );
    const uniquePrimitives = new Set(VILLAIN_EFFECT_PRIMITIVES);
    assert.equal(
      uniquePrimitives.size,
      VILLAIN_EFFECT_PRIMITIVES.length,
      'VILLAIN_EFFECT_PRIMITIVES must have no duplicates',
    );
  });
});

describe('legacy-keyword ↔ descriptor translation (WP-252 / D-24023)', () => {
  // why: the parser translates every legacy [effect:<keyword>] marker through
  // LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR, and the executor reverse-maps each
  // dispatched descriptor back to a keyword for the applied-effects
  // accumulator. The table must be total (every keyword) with valid primitives;
  // the reverse-map must round-trip (so notableEvents / EFFECT_KEYWORD_LABELS /
  // the replay hash stay keyword-identical) and be injective (10 distinct
  // descriptors — no two keywords collapse to one descriptor).
  it('maps every legacy keyword to a descriptor with a valid primitive', () => {
    const primitiveSet = new Set<string>(VILLAIN_EFFECT_PRIMITIVES);
    for (const keyword of VILLAIN_EFFECT_KEYWORDS) {
      const descriptor = LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR[keyword];
      assert.ok(descriptor, `LEGACY table must have an entry for "${keyword}"`);
      assert.ok(
        primitiveSet.has(descriptor.primitive),
        `descriptor for "${keyword}" must use a canonical primitive`,
      );
    }
  });

  it('reverse-maps every legacy descriptor back to its keyword (round-trip, all 10)', () => {
    for (const keyword of VILLAIN_EFFECT_KEYWORDS) {
      const descriptor = LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR[keyword];
      assert.equal(
        descriptorToLegacyKeyword(descriptor),
        keyword,
        `descriptorToLegacyKeyword must round-trip "${keyword}"`,
      );
    }
  });

  it('is injective — the 10 legacy descriptors are distinct', () => {
    const seen = new Set<string>();
    for (const keyword of VILLAIN_EFFECT_KEYWORDS) {
      const descriptor = LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR[keyword];
      const descriptorKey = JSON.stringify([
        descriptor.primitive,
        descriptor.target ?? '',
        descriptor.magnitude ?? '',
        descriptor.selector ?? '',
      ]);
      assert.ok(
        !seen.has(descriptorKey),
        `descriptor for "${keyword}" must be unique (injective inverse)`,
      );
      seen.add(descriptorKey);
    }
    assert.equal(
      seen.size,
      VILLAIN_EFFECT_KEYWORDS.length,
      'all 10 legacy descriptors must be distinct',
    );
  });
});
