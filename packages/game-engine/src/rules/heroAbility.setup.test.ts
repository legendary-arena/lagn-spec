/**
 * Tests for hero ability hook builder, keyword taxonomy, and timing taxonomy.
 *
 * WP-191 — hooks now key by the canonical-face slash instance ext_id
 * (`{setAbbr}/{heroSlug}/{cardSlug}#{copyIndex}`, D-18705) resolved via the
 * shared heroCardInstanceExtIds emitter, and ability text is read from the
 * hero entry's `cards[]` (canonical face = `physicalCards[].sides[0]`). The
 * mocks therefore expose `getSet` (hero entries with cards + physicalCards)
 * rather than a dash-keyed FlatCard `listCards` array.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 * No modifications to shared test helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroAbilityHooks } from '../setup/heroAbility.setup.js';
import { HERO_KEYWORDS, HERO_ABILITY_TIMINGS } from './heroKeywords.js';
import { HERO_COMPOSITION_MARKERS } from './heroCompositions.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';

// ---------------------------------------------------------------------------
// Mock registry (getSet-based — hero entries with cards + physicalCards)
// ---------------------------------------------------------------------------

interface MockHeroCard {
  slug: string;
  rarityLabel?: string;
  abilities: string[];
}

/**
 * Builds a registry exposing getSet (the source buildHeroAbilityHooks reads)
 * and a listCards stub (satisfies the isHeroAbilityRegistryReader guard,
 * which checks only that listCards is a function). Each hero card becomes a
 * single-copy physical card whose canonical face (sides[0]) is the card slug,
 * so hooks key by `{setAbbr}/{heroSlug}/{cardSlug}#0`.
 */
function makeHeroRegistry(
  setAbbr: string,
  heroSlug: string,
  cards: MockHeroCard[],
) {
  const physicalCards = cards.map((card, index) => ({
    id: `p${String(index)}`,
    count: 1,
    sides: [card.slug],
  }));
  const setData = {
    abbr: setAbbr,
    heroes: [{ slug: heroSlug, cards, physicalCards }],
    villains: [],
    henchmen: [],
    schemes: [],
    masterminds: [],
    bystanders: [],
    wounds: [],
    other: [],
  };
  return {
    listCards: () => [],
    listSets: () => [{ abbr: setAbbr }],
    getSet: (abbr: string) => (abbr === setAbbr ? setData : undefined),
  };
}

/**
 * Creates the canonical spider-man mock registry used by the core suite.
 */
function createMockRegistry() {
  return makeHeroRegistry('core', 'spider-man', [
    { slug: 'astonishing-strength', rarityLabel: 'Common 1', abilities: ['You get +1[icon:attack].'] },
    { slug: 'web-shooters', rarityLabel: 'Common 2', abilities: ['[hc:tech]: You get +2[icon:recruit].'] },
    { slug: 'spider-sense', rarityLabel: 'Uncommon', abilities: ['[keyword:rescue] a Bystander.'] },
    {
      slug: 'great-responsibility',
      rarityLabel: 'Rare',
      abilities: [
        '[icon:attack] for each hero you played.',
        '[icon:recruit] for each villain in the city.',
      ],
    },
  ]);
}

/**
 * Creates a valid mock MatchSetupConfig for tests.
 */
function createTestConfig(): MatchSetupConfig {
  return {
    schemeId: 'test/test-scheme-001',
    mastermindId: 'test/test-mastermind-001',
    villainGroupIds: ['test/test-villain-group-001'],
    henchmanGroupIds: ['test/test-henchman-group-001'],
    heroDeckIds: ['core/spider-man'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks', () => {
  it('produces a non-empty array for valid hero decks', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const hooks = buildHeroAbilityHooks(registry, config);

    assert.ok(Array.isArray(hooks), 'result must be an array');
    assert.ok(hooks.length > 0, 'result must be non-empty for valid hero decks');
  });

  it('every hook has a slash-format instance cardId (D-18705)', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const hooks = buildHeroAbilityHooks(registry, config);

    for (const hook of hooks) {
      assert.equal(typeof hook.cardId, 'string', 'cardId must be a string');
      assert.ok(hook.cardId.length > 0, 'cardId must be non-empty');
      // why: WP-191 — hooks key by the canonical-face slash instance id
      // `{setAbbr}/{heroSlug}/{cardSlug}#{copyIndex}` (contains both '/' and
      // '#'), never the dash/slot FlatCard key.
      assert.ok(hook.cardId.includes('/'), `cardId '${hook.cardId}' must contain a slash`);
      assert.ok(hook.cardId.includes('#'), `cardId '${hook.cardId}' must contain a '#' copy suffix`);
      assert.ok(
        !hook.cardId.includes('-hero-'),
        `cardId '${hook.cardId}' must not be a dash/slot FlatCard key`,
      );
    }
  });

  it('every hook has a valid timing value from HERO_ABILITY_TIMINGS', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const hooks = buildHeroAbilityHooks(registry, config);

    const validTimings = new Set(HERO_ABILITY_TIMINGS);
    for (const hook of hooks) {
      assert.ok(
        validTimings.has(hook.timing),
        `timing "${hook.timing}" must be a member of HERO_ABILITY_TIMINGS`,
      );
    }
  });

  it('every hook keyword is from the HeroKeyword union', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const hooks = buildHeroAbilityHooks(registry, config);

    const validKeywords = new Set(HERO_KEYWORDS);
    for (const hook of hooks) {
      for (const keyword of hook.keywords) {
        assert.ok(
          validKeywords.has(keyword),
          `keyword "${keyword}" must be a member of HERO_KEYWORDS`,
        );
      }
    }
  });

  it('JSON.stringify succeeds for all hooks (fully serializable)', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const hooks = buildHeroAbilityHooks(registry, config);

    const serialized = JSON.stringify(hooks);
    assert.ok(serialized, 'JSON.stringify(hooks) must produce a non-empty string');
    assert.ok(serialized.length > 2, 'serialized output must contain data');
  });

  it('resolves ability text from the canonical face (sides[0]) only', () => {
    // why: WP-191 / D-18705 — for a split physical card, only the canonical
    // face (sides[0]) is keyed; the back side's ability text is out of scope
    // (safe-skip). Here the back side 'venom-symbiote' carries an ability, but
    // no hook is emitted for it because it is never a canonical face.
    const setData = {
      abbr: 'core',
      heroes: [
        {
          slug: 'spider-man',
          cards: [
            { slug: 'front-face', rarityLabel: 'Common 1', abilities: ['You get +1[icon:attack].'] },
            { slug: 'venom-symbiote', rarityLabel: 'Common 1', abilities: ['[keyword:ko] this card.'] },
          ],
          physicalCards: [{ id: 'p0', count: 2, sides: ['front-face', 'venom-symbiote'] }],
        },
      ],
      villains: [],
      henchmen: [],
      schemes: [],
      masterminds: [],
    };
    const registry = {
      listCards: () => [],
      listSets: () => [{ abbr: 'core' }],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/spider-man'] };

    const hooks = buildHeroAbilityHooks(registry, config);

    for (const hook of hooks) {
      assert.ok(
        hook.cardId.startsWith('core/spider-man/front-face#'),
        `only the canonical face is keyed; got '${hook.cardId}'`,
      );
    }
    // Two physical copies of the canonical face → two hooks (one per copy).
    assert.equal(hooks.length, 2, 'both copies of the canonical face are keyed');
  });

  it('returns an empty array when the registry exposes no getSet (narrow mock)', () => {
    // why: WP-191 — hook keys derive from hero entries read via getSet. A
    // narrow listCards-only mock satisfies the isHeroAbilityRegistryReader
    // guard but cannot supply hero entries, so no hooks are built (no throw).
    const narrowRegistry = { listCards: () => [] };
    const hooks = buildHeroAbilityHooks(narrowRegistry, createTestConfig());
    assert.deepStrictEqual(hooks, []);
  });
});

describe('HERO_KEYWORDS drift-detection', () => {
  // why: prevents union/array divergence — same pattern as
  // REVEALED_CARD_TYPES drift detection
  it('contains exactly the 17 canonical keyword values', () => {
    const expectedKeywords = [
      'draw',
      'attack',
      'recruit',
      'ko',
      'rescue',
      'wound',
      'reveal',
      'reveal-ko',
      'reveal-min',
      'reveal-ko-or-draw',
      'reveal-cost-attack',
      'reveal-odd-draw',
      'reveal-attack-choose',
      'reveal-ko-attack',
      'attack-per-count',
      'optional-ko-reward',
      'conditional',
    ];

    assert.equal(
      HERO_KEYWORDS.length,
      17,
      'HERO_KEYWORDS must have exactly 17 entries',
    );

    assert.deepStrictEqual(
      [...HERO_KEYWORDS],
      expectedKeywords,
      'HERO_KEYWORDS must match the canonical keyword values in order',
    );

    // Verify no duplicates
    const uniqueKeywords = new Set(HERO_KEYWORDS);
    assert.equal(
      uniqueKeywords.size,
      HERO_KEYWORDS.length,
      'HERO_KEYWORDS must have no duplicates',
    );
  });
});

describe('buildHeroAbilityHooks determinism', () => {
  // why: protects replay, snapshot tests, and leaderboards
  it('identical input produces identical output', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const result1 = buildHeroAbilityHooks(registry, config);
    const result2 = buildHeroAbilityHooks(registry, config);

    assert.equal(
      JSON.stringify(result1),
      JSON.stringify(result2),
      'two calls with same input must produce JSON-identical output',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-215 — [keyword:X:N] magnitude extraction tests (AC-9, AC-10, AC-11)
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks [keyword:X:N] magnitude extraction (WP-215)', () => {
  it('[keyword:rescue:1] produces effects[0] with magnitude 1 (AC-9)', () => {
    const registry = makeHeroRegistry('core', 'spider-man', [
      { slug: 'web-shooters', rarityLabel: 'Uncommon', abilities: ['Rescue a Bystander. [keyword:rescue:1]'] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/spider-man'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(Array.isArray(hook.effects) && hook.effects!.length > 0, 'effects must be present');
    const rescueEffect = hook.effects!.find(e => e.type === 'rescue');
    assert.ok(rescueEffect !== undefined, 'rescue effect must be present');
    assert.equal(rescueEffect!.magnitude, 1, 'rescue magnitude must be 1');
  });

  it('[keyword:rescue] without suffix produces rescue effect with no magnitude (AC-10)', () => {
    const registry = makeHeroRegistry('core', 'spider-man', [
      { slug: 'web-shooters', rarityLabel: 'Uncommon', abilities: ['[keyword:rescue] a Bystander.'] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/spider-man'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(Array.isArray(hook.effects) && hook.effects!.length > 0, 'effects must be present');
    const rescueEffect = hook.effects!.find(e => e.type === 'rescue');
    assert.ok(rescueEffect !== undefined, 'rescue effect must be present');
    assert.equal(rescueEffect!.magnitude, undefined, 'rescue effect must have no magnitude');
  });

  it('[keyword:reveal] with VP-cost pattern translates to a cost-lte branch-list (AC-11)', () => {
    const registry = makeHeroRegistry('core', 'spider-man', [
      {
        slug: 'web-shooters',
        rarityLabel: 'Uncommon',
        abilities: ['Reveal the top card of your deck. If that card costs 2[icon:vp] or less, draw it. [keyword:reveal]'],
      },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/spider-man'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(Array.isArray(hook.effects) && hook.effects!.length > 0, 'effects must be present');
    const revealEffect = hook.effects!.find(e => e.type === 'reveal');
    assert.ok(revealEffect !== undefined, 'reveal effect must be present');
    // why: WP-253 / D-24024 — the top-level magnitude is dropped for the collapsed
    // reveal; the VP-cost threshold (2) now lives in the cost-lte predicate of the
    // translated branch-list.
    assert.equal(revealEffect!.magnitude, undefined, 'top-level magnitude is dropped for the collapsed reveal');
    assert.equal(revealEffect!.revealCount, 1, 'a translated legacy reveal carries revealCount 1');
    assert.deepStrictEqual(
      revealEffect!.revealRules,
      [{ predicate: { kind: 'cost-lte', threshold: 2 }, actions: [{ kind: 'draw' }] }],
      'the VP-cost threshold 2 lives in the cost-lte predicate of the reveal branch-list',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-215 — icon-adjacent magnitude extraction tests (AC-12)
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks icon-adjacent magnitude extraction (WP-215)', () => {
  it('+2[icon:attack] sets attack effect magnitude to 2 (AC-12)', () => {
    const registry = makeHeroRegistry('core', 'hero-a', [
      { slug: 'power-fist', rarityLabel: 'Common 1', abilities: ['You get +2[icon:attack].'] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/hero-a'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(Array.isArray(hook.effects) && hook.effects!.length > 0, 'effects must be present');
    const attackEffect = hook.effects!.find(e => e.type === 'attack');
    assert.ok(attackEffect !== undefined, 'attack effect must be present');
    assert.equal(attackEffect!.magnitude, 2, 'attack magnitude must be 2 from icon-adjacent extraction');
  });

  it('+3[icon:recruit] sets recruit effect magnitude to 3 (AC-12)', () => {
    const registry = makeHeroRegistry('core', 'hero-b', [
      { slug: 'rally', rarityLabel: 'Common 1', abilities: ['You get +3[icon:recruit].'] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/hero-b'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(Array.isArray(hook.effects) && hook.effects!.length > 0, 'effects must be present');
    const recruitEffect = hook.effects!.find(e => e.type === 'recruit');
    assert.ok(recruitEffect !== undefined, 'recruit effect must be present');
    assert.equal(recruitEffect!.magnitude, 3, 'recruit magnitude must be 3 from icon-adjacent extraction');
  });

  it('bare N[icon:vp] without "or less" does not extract reveal magnitude', () => {
    // why: VP icon is used for both cost-threshold (with "or less") and
    // victory-points values (bare). Pattern must not match bare usage.
    const registry = makeHeroRegistry('core', 'hero-c', [
      { slug: 'victory', rarityLabel: 'Common 1', abilities: ['Gain 2[icon:vp]. [keyword:reveal]'] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/hero-c'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(Array.isArray(hook.effects) && hook.effects!.length > 0, 'effects must be present');
    const revealEffect = hook.effects!.find(e => e.type === 'reveal');
    assert.ok(revealEffect !== undefined, 'reveal effect must be present');
    // why: WP-253 / D-24024 — a bare VP icon yields no reveal threshold, so the
    // legacy translation produces empty revealRules (a no-op reveal), reproducing the
    // old undefined-magnitude skip while still emitting one effect.
    assert.equal(revealEffect!.magnitude, undefined, 'top-level magnitude is dropped for the collapsed reveal');
    assert.deepStrictEqual(revealEffect!.revealRules, [], 'a bare VP icon yields empty reveal rules (no draw threshold)');
  });
});

// ---------------------------------------------------------------------------
// WP-247 — count-scaled attack parse + icon-suppression (D-24016)
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks count-scaled attack (WP-247)', () => {
  it('marked covert-operation line yields one attack-per-count effect and suppresses the attack icon', () => {
    // why: the printed "+1[icon:attack]" would otherwise emit a flat 'attack'
    // effect AND the count-scaled effect (double-count); the parser must drop the
    // plain 'attack' keyword on a line carrying an 'attack-per-count' effect.
    const registry = makeHeroRegistry('core', 'black-widow', [
      {
        slug: 'covert-operation',
        rarityLabel: 'Uncommon',
        abilities: [
          'You get +1[icon:attack] for each Bystander in your Victory Pile. [keyword:attack-per-count:victory-bystanders:1]',
        ],
      },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/black-widow'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');

    // Keywords EXCLUDE the plain 'attack' icon (icon-suppression proven).
    assert.ok(
      !hook.keywords.includes('attack'),
      'the plain attack keyword must be suppressed on a count-scaled line',
    );
    assert.ok(
      hook.keywords.includes('attack-per-count'),
      'the count-scaled keyword must be present',
    );

    // Exactly one effect, fully specified.
    assert.ok(Array.isArray(hook.effects), 'effects must be present');
    assert.equal(hook.effects!.length, 1, 'exactly one effect must be emitted (no flat attack)');
    assert.deepStrictEqual(
      hook.effects![0],
      { type: 'attack-per-count', magnitude: 1, countSource: 'victory-bystanders' },
      'the single effect must be the count-scaled attack with magnitude 1 and victory-bystanders',
    );
  });

  it('ignores a count-scaled token with an unrecognized source (no attack-per-count effect)', () => {
    // why: only sources in HERO_COUNT_SOURCES emit an effect; an unknown source
    // produces no 'attack-per-count' effect, so the icon-suppression does not fire.
    const registry = makeHeroRegistry('core', 'black-widow', [
      {
        slug: 'covert-operation',
        rarityLabel: 'Uncommon',
        abilities: ['You get +1[icon:attack]. [keyword:attack-per-count:made-up-source:1]'],
      },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/black-widow'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(
      !hook.keywords.includes('attack-per-count'),
      'an unrecognized source must not emit a count-scaled keyword',
    );
    // The printed attack icon is NOT suppressed (no count-scaled effect present).
    const attackEffect = (hook.effects ?? []).find((effect) => effect.type === 'attack');
    assert.ok(attackEffect !== undefined, 'the plain attack effect remains when no count-scaled effect is emitted');
    assert.equal(attackEffect!.magnitude, 1, 'the plain attack magnitude is the icon-adjacent value');
  });
});

// ---------------------------------------------------------------------------
// WP-248 — optional-KO-reward parse (D-24019)
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks optional-KO-reward (WP-248)', () => {
  it('marked dangerous-rescue line yields one optional-ko-reward effect plus the conditional keyword (AC-3)', () => {
    // why: the parser must emit exactly { type:'optional-ko-reward',
    // rewardType:'rescue', magnitude:1 } from the three-segment token, plus the
    // 'conditional' keyword from the [hc:covert] condition.
    const registry = makeHeroRegistry('core', 'black-widow', [
      {
        slug: 'dangerous-rescue',
        rarityLabel: 'Common 2',
        abilities: [
          '[hc:covert]: You may KO a card from your hand or discard pile. If you do, rescue a Bystander. [keyword:optional-ko-reward:rescue:1]',
        ],
      },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/black-widow'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');

    assert.ok(
      hook.keywords.includes('optional-ko-reward'),
      'the optional-ko-reward keyword must be present',
    );
    assert.ok(
      hook.keywords.includes('conditional'),
      'the [hc:covert] condition adds the conditional keyword',
    );

    // Exactly one effect (the conditional keyword never becomes an effect).
    assert.ok(Array.isArray(hook.effects), 'effects must be present');
    assert.equal(hook.effects!.length, 1, 'exactly one effect must be emitted');
    assert.deepStrictEqual(
      hook.effects![0],
      { type: 'optional-ko-reward', magnitude: 1, rewardType: 'rescue' },
      'the single effect must carry rewardType rescue and magnitude 1',
    );
  });

  it('ignores an optional-ko-reward token with an unseeded reward (no effect emitted)', () => {
    // why: only the seeded reward set (rescue/draw/attack/recruit) is dispatchable;
    // an unseeded reward (e.g. a not-yet-built gain-shard) emits no descriptor, so
    // such a marker can never reach the pending queue.
    const registry = makeHeroRegistry('core', 'black-widow', [
      {
        slug: 'dangerous-rescue',
        rarityLabel: 'Common 2',
        abilities: ['You may KO a card. [keyword:optional-ko-reward:gain-shard:1]'],
      },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/black-widow'] };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined, 'hook must be built');
    assert.ok(
      !hook.keywords.includes('optional-ko-reward'),
      'an unseeded reward must not emit an optional-ko-reward keyword',
    );
    assert.equal(
      (hook.effects ?? []).length,
      0,
      'no effect is emitted for an unseeded reward',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-253 — reveal token parsing → collapsed branch-list (D-24024)
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks reveal collapse parsing (WP-253)', () => {
  /** Builds a single-ability reveal hook and returns its hook + reveal effect. */
  function revealEffectFor(abilityText: string) {
    const registry = makeHeroRegistry('core', 'reveal-hero', [
      { slug: 'reveal-card', rarityLabel: 'Common 1', abilities: [abilityText] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/reveal-hero'] };
    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0]!;
    return { hook, effect: hook.effects?.find((e) => e.type === 'reveal') };
  }

  it('a legacy [keyword:reveal-ko] token translates to cost-zero→ko and keeps the keyword on the hook', () => {
    const { hook, effect } = revealEffectFor('KO the revealed cost-0 card. [keyword:reveal-ko]');
    assert.ok(effect !== undefined, 'a reveal effect must be emitted');
    assert.equal(effect!.type, 'reveal', 'the effect is the collapsed reveal type');
    assert.equal(effect!.revealCount, 1, 'a legacy reveal carries revealCount 1');
    assert.deepStrictEqual(
      effect!.revealRules,
      [{ predicate: { kind: 'cost-zero' }, actions: [{ kind: 'ko' }] }],
      'reveal-ko translates to cost-zero → ko',
    );
    // why: D-24024 — narrative identity, no reverse-map: the LEGACY keyword stays on
    // hook.keywords even though the effect collapsed to type 'reveal'.
    assert.ok(hook.keywords.includes('reveal-ko'), 'the legacy reveal-ko keyword stays on hook.keywords');
    assert.ok(!hook.keywords.includes('reveal'), 'a legacy token does not also record the base reveal keyword');
  });

  it('a legacy [keyword:reveal-ko-attack:2] token translates to an atomic ko + attack-fixed(2) rule', () => {
    const { effect } = revealEffectFor('Reveal the top card. [keyword:reveal-ko-attack:2]');
    assert.deepStrictEqual(
      effect!.revealRules,
      [{ predicate: { kind: 'cost-zero' }, actions: [{ kind: 'ko' }, { kind: 'attack-fixed', amount: 2 }] }],
      'reveal-ko-attack:2 translates to cost-zero → [ko, attack-fixed 2]',
    );
  });

  it('a parameterized [keyword:reveal:cost-zero:ko] token parses to the same descriptor as legacy reveal-ko (dual-grammar)', () => {
    const legacy = revealEffectFor('[keyword:reveal-ko]');
    const parameterized = revealEffectFor('[keyword:reveal:cost-zero:ko]');
    assert.ok(parameterized.effect !== undefined, 'the parameterized token must emit a reveal effect');
    assert.deepStrictEqual(
      parameterized.effect!.revealRules,
      legacy.effect!.revealRules,
      'the parameterized form and its legacy equivalent yield identical reveal rules',
    );
    assert.equal(parameterized.effect!.revealCount, legacy.effect!.revealCount, 'both carry revealCount 1');
    // why: the parameterized grammar records the base 'reveal' keyword (forward-compat).
    assert.ok(parameterized.hook.keywords.includes('reveal'), 'the parameterized token records the base reveal keyword');
  });

  it('a parameterized reveal token parses a threshold predicate, action, and continue flag', () => {
    const { effect } = revealEffectFor('[keyword:reveal:cost-lte-3:attack-by-cost:continue]');
    assert.deepStrictEqual(
      effect!.revealRules,
      [{ predicate: { kind: 'cost-lte', threshold: 3 }, actions: [{ kind: 'attack-by-cost' }], continue: true }],
      'the predicate threshold, action, and continue flag all parse from one token',
    );
  });

  it('two parameterized reveal tokens accumulate into one descriptor in source order (reveal-attack-choose shape)', () => {
    const { effect } = revealEffectFor(
      '[keyword:reveal:cost-lte-4:attack-by-cost:continue][keyword:reveal:always:choose-discard-or-return]',
    );
    assert.deepStrictEqual(
      effect!.revealRules,
      [
        { predicate: { kind: 'cost-lte', threshold: 4 }, actions: [{ kind: 'attack-by-cost' }], continue: true },
        { predicate: { kind: 'always' }, actions: [{ kind: 'choose-discard-or-return' }] },
      ],
      'two reveal-rule tokens build the reveal-attack-choose branch-list directly',
    );
  });

  it('a malformed parameterized reveal token is safe-skipped (no reveal effect, no throw)', () => {
    const { hook, effect } = revealEffectFor('[keyword:reveal:bogus-predicate:draw]');
    assert.equal(effect, undefined, 'a malformed predicate voids the rule, so no reveal effect is emitted');
    assert.ok(!hook.keywords.includes('reveal'), 'no reveal keyword is recorded for a fully-malformed reveal token');
  });

  // -------------------------------------------------------------------------
  // WP-255 / D-24027 — reveal-count modifier marker
  // -------------------------------------------------------------------------

  it('a [keyword:reveal-count:3] modifier sets revealCount 3 on the reveal descriptor (D-24027)', () => {
    const { effect } = revealEffectFor('[keyword:reveal:cost-lte-2:draw][keyword:reveal-count:3]');
    assert.ok(effect !== undefined, 'a reveal effect must be emitted');
    assert.equal(effect!.revealCount, 3, 'the reveal-count modifier sets revealCount on the descriptor');
    assert.deepStrictEqual(
      effect!.revealRules,
      [{ predicate: { kind: 'cost-lte', threshold: 2 }, actions: [{ kind: 'draw' }] }],
      'the parameterized reveal rule is unaffected by the reveal-count modifier',
    );
  });

  it('an absent reveal-count modifier leaves the WP-253 default revealCount 1', () => {
    const { effect } = revealEffectFor('[keyword:reveal:cost-lte-2:draw]');
    assert.ok(effect !== undefined, 'a reveal effect must be emitted');
    assert.equal(effect!.revealCount, 1, 'no reveal-count marker ⇒ the descriptor keeps revealCount 1');
  });

  it('the "The Amazing Spider-Man"-shaped line parses to revealCount 3 + cost-lte 2 → draw (WP-255)', () => {
    const { hook, effect } = revealEffectFor(
      'Reveal the top three cards of your deck. Put any that cost 2[icon:vp] or less into your hand. Put the rest back in any order. [keyword:reveal:cost-lte-2:draw][keyword:reveal-count:3]',
    );
    assert.ok(effect !== undefined, 'the marked Spider-Man line emits a reveal effect');
    assert.equal(effect!.type, 'reveal', 'the effect is the collapsed reveal type');
    assert.equal(effect!.revealCount, 3, 'reveal-count 3 → the handler peeks the top three cards');
    assert.deepStrictEqual(
      effect!.revealRules,
      [{ predicate: { kind: 'cost-lte', threshold: 2 }, actions: [{ kind: 'draw' }] }],
      'the parameterized [keyword:reveal:cost-lte-2:draw] marker builds a single cost-lte 2 → draw rule',
    );
    assert.equal(effect!.magnitude, undefined, 'the top-level magnitude is dropped for the collapsed reveal');
    assert.ok(hook.keywords.includes('reveal'), 'the parameterized reveal records the base reveal keyword');
    // why: D-24027 — reveal-count is a modifier marker, never a HeroKeyword (so it never
    // lands on hook.keywords and the 17-entry HERO_KEYWORDS drift test stays untouched).
    assert.ok(!(hook.keywords as string[]).includes('reveal-count'),
      'reveal-count is a modifier, never recorded as a keyword');
  });
});

describe('buildHeroAbilityHooks composition-marker parsing (WP-256 / D-24031)', () => {
  /** Builds a single-ability hook from one Berserk-bearing ability line. */
  function berserkHookFor(abilityText: string) {
    const registry = makeHeroRegistry('core', 'berserk-hero', [
      { slug: 'berserk-card', rarityLabel: 'Common 1', abilities: [abilityText] },
    ]);
    const config: MatchSetupConfig = { ...createTestConfig(), heroDeckIds: ['core/berserk-hero'] };
    const hooks = buildHeroAbilityHooks(registry, config);
    return hooks[0]!;
  }

  it('a [keyword:Berserk] token attaches the Berserk composition to hook.primitiveEffects', () => {
    const hook = berserkHookFor(
      'Discard the top card of your deck. You get +Attack equal to its printed Attack. [keyword:Berserk]',
    );
    assert.ok(hook.primitiveEffects !== undefined, 'primitiveEffects must be present for a Berserk line');
    assert.equal(hook.primitiveEffects!.length, 1, 'exactly one composition attaches');
    assert.deepStrictEqual(
      hook.primitiveEffects![0],
      HERO_COMPOSITION_MARKERS['berserk'],
      'the attached AST equals the seeded Berserk composition',
    );
  });

  it('berserk attaches to primitiveEffects, NEVER to hook.keywords (it is not a HeroKeyword)', () => {
    const hook = berserkHookFor('[keyword:Berserk]');
    // why: D-24031 — berserk is a composition marker, never a HeroKeyword, so the parser
    // records no keyword for it (the 17-entry HERO_KEYWORDS drift test stays untouched).
    assert.ok(!(hook.keywords as string[]).includes('berserk'), 'berserk must not appear on hook.keywords');
    assert.equal(hook.keywords.length, 0, 'a Berserk-only line records no hero keywords');
  });

  it('the parsed hook owns a DEEP COPY — mutating it does not mutate the shared registry const', () => {
    const before = JSON.stringify(HERO_COMPOSITION_MARKERS['berserk']);
    const hook = berserkHookFor('[keyword:Berserk]');
    // Mutate the parsed hook's primitive AST in place.
    (hook.primitiveEffects![0] as { type: string }).type = 'mutated';
    (hook.primitiveEffects![0] as { steps?: unknown[] }).steps = [];
    assert.equal(
      JSON.stringify(HERO_COMPOSITION_MARKERS['berserk']),
      before,
      'mutating a parsed hook primitive effect must not mutate HERO_COMPOSITION_MARKERS[berserk]',
    );
  });

  it('an ability line with no composition marker leaves primitiveEffects absent', () => {
    const hook = berserkHookFor('You get +1[icon:attack].');
    assert.equal(hook.primitiveEffects, undefined, 'no composition marker ⇒ primitiveEffects is not assigned');
  });
});

describe('HERO_ABILITY_TIMINGS drift-detection', () => {
  // why: same pattern as HERO_KEYWORDS drift detection
  it('contains exactly the 5 canonical timing values', () => {
    const expectedTimings = [
      'onPlay',
      'onFight',
      'onRecruit',
      'onKO',
      'onReveal',
    ];

    assert.equal(
      HERO_ABILITY_TIMINGS.length,
      5,
      'HERO_ABILITY_TIMINGS must have exactly 5 entries',
    );

    assert.deepStrictEqual(
      [...HERO_ABILITY_TIMINGS],
      expectedTimings,
      'HERO_ABILITY_TIMINGS must match the canonical timing values in order',
    );

    // Verify no duplicates
    const uniqueTimings = new Set(HERO_ABILITY_TIMINGS);
    assert.equal(
      uniqueTimings.size,
      HERO_ABILITY_TIMINGS.length,
      'HERO_ABILITY_TIMINGS must have no duplicates',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-179 — [team:X] markup parsing tests
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks [team:X] markup (WP-179)', () => {
  it('[team:avengers] markup produces requiresTeam condition with value avengers', () => {
    const registry = makeHeroRegistry('core', 'cap', [
      { slug: 'shield-bash', rarityLabel: 'Common 1', abilities: ['[team:avengers]: +2[icon:attack].'] },
    ]);
    const config: MatchSetupConfig = {
      ...createTestConfig(),
      heroDeckIds: ['core/cap'],
    };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined);
    assert.ok(hook.conditions !== undefined);

    let foundTeamCondition = false;
    for (const condition of hook.conditions!) {
      if (condition.type === 'requiresTeam') {
        assert.equal(condition.value, 'avengers');
        foundTeamCondition = true;
      }
    }
    assert.ok(foundTeamCondition, 'requiresTeam condition must be present');
  });

  it('mixed markup [hc:tech][team:avengers] emits both in stable order (heroClassMatch first)', () => {
    const registry = makeHeroRegistry('core', 'iron-man', [
      { slug: 'repulsor', rarityLabel: 'Common 1', abilities: ['[hc:tech][team:avengers]: Draw 2 cards.'] },
    ]);
    const config: MatchSetupConfig = {
      ...createTestConfig(),
      heroDeckIds: ['core/iron-man'],
    };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined);
    assert.ok(hook.conditions !== undefined);
    assert.equal(hook.conditions!.length, 2);
    assert.equal(hook.conditions![0]!.type, 'heroClassMatch');
    assert.equal(hook.conditions![0]!.value, 'tech');
    assert.equal(hook.conditions![1]!.type, 'requiresTeam');
    assert.equal(hook.conditions![1]!.value, 'avengers');
  });

  it('mixed-case parsing: [hc:Tech] normalizes to condition value tech', () => {
    const registry = makeHeroRegistry('core', 'hero-x', [
      { slug: 'tech-card', rarityLabel: 'Common 1', abilities: ['[hc:Tech]: You get +1[icon:attack].'] },
    ]);
    const config: MatchSetupConfig = {
      ...createTestConfig(),
      heroDeckIds: ['core/hero-x'],
    };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined);
    assert.ok(hook.conditions !== undefined);
    assert.equal(hook.conditions![0]!.value, 'tech');
  });

  it('whitespace parsing: [team: Avengers ] normalizes to condition value avengers', () => {
    const registry = makeHeroRegistry('core', 'cap', [
      { slug: 'shield-throw', rarityLabel: 'Common 1', abilities: ['[team: Avengers ]: +3 attack.'] },
    ]);
    const config: MatchSetupConfig = {
      ...createTestConfig(),
      heroDeckIds: ['core/cap'],
    };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined);
    assert.ok(hook.conditions !== undefined);
    assert.equal(hook.conditions![0]!.value, 'avengers');
  });

  it('team markup tokens are removed from ability text after extraction (conditional keyword added)', () => {
    const registry = makeHeroRegistry('core', 'cap', [
      { slug: 'rally', rarityLabel: 'Common 1', abilities: ['[team:avengers]: You get +2[icon:attack].'] },
    ]);
    const config: MatchSetupConfig = {
      ...createTestConfig(),
      heroDeckIds: ['core/cap'],
    };

    const hooks = buildHeroAbilityHooks(registry, config);
    const hook = hooks[0];
    assert.ok(hook !== undefined);
    let hasConditional = false;
    for (const keyword of hook.keywords) {
      if (keyword === 'conditional') {
        hasConditional = true;
      }
    }
    assert.ok(hasConditional, 'conditional keyword should be added when team conditions are present');
  });
});

// ---------------------------------------------------------------------------
// WP-257 — unresolved-marker surfacing (D-24034)
//
// The parser records a `[keyword:X]` token that resolves to no keyword,
// composition, or recognized modifier onto hook.unresolvedMarkers, so the
// runtime hollow detector can flag `parse-unrecognized` — while a pure
// flavor-text line (no marker token) surfaces an empty/absent field.
// ---------------------------------------------------------------------------

describe('buildHeroAbilityHooks — unresolved markers (WP-257)', () => {
  /** Builds a single-hero, single-ability registry + matching config. */
  function buildSingleAbility(abilityText: string) {
    const registry = makeHeroRegistry('core', 'spider-man', [
      { slug: 'astonishing-strength', rarityLabel: 'Common 1', abilities: [abilityText] },
    ]);
    const config = createTestConfig();
    return buildHeroAbilityHooks(registry, config);
  }

  it('surfaces an unrecognized [keyword:X] token on hook.unresolvedMarkers', () => {
    const hooks = buildSingleAbility('[keyword:mind-swap] a card.');
    assert.equal(hooks.length, 1);
    assert.deepStrictEqual(hooks[0]!.unresolvedMarkers, ['mind-swap']);
  });

  it('a pure flavor-text line surfaces NO unresolvedMarkers (absent or empty)', () => {
    const hooks = buildSingleAbility('Spider-Man swings into action.');
    assert.equal(hooks.length, 1);
    // why: absent field is the encoding for "no unresolved marker" — flavor text
    // must not flag hollow at runtime.
    assert.equal(hooks[0]!.unresolvedMarkers, undefined);
  });

  it('a recognized reveal-count modifier does NOT flag as an unresolved marker', () => {
    // why: `reveal-count` is a recognized modifier consumed by REVEAL_COUNT_PATTERN
    // but its bare-word form also matches KEYWORD_PATTERN; it must be excluded from
    // the unresolved-marker scan (RECOGNIZED_NON_KEYWORD_MARKERS).
    const hooks = buildSingleAbility('[keyword:reveal:always:draw][keyword:reveal-count:2]');
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0]!.unresolvedMarkers, undefined, 'reveal-count is not unresolved');
  });

  it('a valid keyword does NOT flag as an unresolved marker', () => {
    const hooks = buildSingleAbility('[keyword:rescue] a Bystander.');
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0]!.unresolvedMarkers, undefined, 'a valid keyword is not unresolved');
  });

  it('a composition marker (berserk) does NOT flag as an unresolved marker', () => {
    const hooks = buildSingleAbility('[keyword:berserk]');
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0]!.unresolvedMarkers, undefined, 'a composition marker is not unresolved');
  });
});
