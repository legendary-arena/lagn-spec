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
  it('contains exactly the 8 canonical keyword values', () => {
    const expectedKeywords = [
      'draw',
      'attack',
      'recruit',
      'ko',
      'rescue',
      'wound',
      'reveal',
      'conditional',
    ];

    assert.equal(
      HERO_KEYWORDS.length,
      8,
      'HERO_KEYWORDS must have exactly 8 entries',
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
