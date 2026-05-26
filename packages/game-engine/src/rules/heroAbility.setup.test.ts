/**
 * Tests for hero ability hook builder, keyword taxonomy, and timing taxonomy.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 * No modifications to shared test helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroAbilityHooks } from '../setup/heroAbility.setup.js';
import type { HeroAbilityFlatCard } from '../setup/heroAbility.setup.js';
import { HERO_KEYWORDS, HERO_ABILITY_TIMINGS } from './heroKeywords.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';

// ---------------------------------------------------------------------------
// Mock registry
// ---------------------------------------------------------------------------

/**
 * Creates mock hero cards with structured ability markup.
 *
 * Only provides the three allowed registry fields: cardId/key,
 * abilities: string[], and deck membership (via setAbbr + cardType).
 */
function createMockHeroCards(): HeroAbilityFlatCard[] {
  return [
    {
      key: 'core-hero-spider-man-1',
      cardType: 'hero',
      setAbbr: 'core',
      abilities: ['You get +1[icon:attack].'],
    },
    {
      key: 'core-hero-spider-man-2',
      cardType: 'hero',
      setAbbr: 'core',
      abilities: ['[hc:tech]: You get +2[icon:recruit].'],
    },
    {
      key: 'core-hero-spider-man-3',
      cardType: 'hero',
      setAbbr: 'core',
      abilities: ['[keyword:rescue] a Bystander.'],
    },
    {
      key: 'core-hero-spider-man-4',
      cardType: 'hero',
      setAbbr: 'core',
      abilities: [
        '[icon:attack] for each hero you played.',
        '[icon:recruit] for each villain in the city.',
      ],
    },
    // Non-hero card — should be excluded
    {
      key: 'core-villain-green-goblin-1',
      cardType: 'villain',
      setAbbr: 'core',
      abilities: ['Ambush: Capture a Bystander.'],
    },
  ];
}

/**
 * Creates a mock registry that returns hero cards with abilities.
 */
function createMockRegistry(): { listCards(): HeroAbilityFlatCard[] } {
  return {
    listCards: () => createMockHeroCards(),
  };
}

/**
 * Creates a valid mock MatchSetupConfig for tests.
 *
 * @amended WP-113 PS-7: bare slug fixtures migrated to set-qualified
 *   form `'<setAbbr>/<slug>'` per the qualified-ID contract
 *   (per D-10014). The hero card mock
 *   uses `setAbbr: 'core'` and slug `'spider-man'`, so the qualified ID
 *   is `'core/spider-man'`. Other entity fixtures use `'test'` since
 *   they only flow through the validator (which is bypassed) and the
 *   builders here only consume `heroDeckIds`.
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

  it('every hook has a valid cardId (non-empty CardExtId string)', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();

    const hooks = buildHeroAbilityHooks(registry, config);

    for (const hook of hooks) {
      assert.equal(typeof hook.cardId, 'string', 'cardId must be a string');
      assert.ok(hook.cardId.length > 0, 'cardId must be non-empty');
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
    const registry = {
      listCards: (): HeroAbilityFlatCard[] => [
        {
          key: 'core-hero-cap-1',
          cardType: 'hero',
          setAbbr: 'core',
          abilities: ['[team:avengers]: +2[icon:attack].'],
        },
      ],
    };
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
    const registry = {
      listCards: (): HeroAbilityFlatCard[] => [
        {
          key: 'core-hero-iron-man-1',
          cardType: 'hero',
          setAbbr: 'core',
          abilities: ['[hc:tech][team:avengers]: Draw 2 cards.'],
        },
      ],
    };
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
    const registry = {
      listCards: (): HeroAbilityFlatCard[] => [
        {
          key: 'core-hero-hero-x-1',
          cardType: 'hero',
          setAbbr: 'core',
          abilities: ['[hc:Tech]: You get +1[icon:attack].'],
        },
      ],
    };
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
    const registry = {
      listCards: (): HeroAbilityFlatCard[] => [
        {
          key: 'core-hero-cap-1',
          cardType: 'hero',
          setAbbr: 'core',
          abilities: ['[team: Avengers ]: +3 attack.'],
        },
      ],
    };
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
    const registry = {
      listCards: (): HeroAbilityFlatCard[] => [
        {
          key: 'core-hero-cap-1',
          cardType: 'hero',
          setAbbr: 'core',
          abilities: ['[team:avengers]: You get +2[icon:attack].'],
        },
      ],
    };
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
