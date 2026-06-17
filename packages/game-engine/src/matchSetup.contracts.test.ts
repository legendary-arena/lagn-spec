/**
 * Match setup validation contract tests.
 *
 * @amended WP-113 PS-3 + PS-7: bare-slug fixtures migrated to
 *   set-qualified `<setAbbr>/<slug>` form per the qualified-ID
 *   contract. The mock registry now satisfies the widened
 *   `CardRegistryReader` interface (`listCards` + `listSets` + `getSet`)
 *   so the validator can build per-field qualified-ID sets via
 *   `buildKnown{Scheme,Mastermind,VillainGroup,HenchmanGroup,Hero}QualifiedIds`.
 *   New tests cover the 5 fields × 5 categories matrix
 *   (accept-qualified / reject-bare-slug / reject-display-name /
 *   reject-flat-card-key / reject-cross-set-collision) plus
 *   parse-error and set-not-loaded paths (per D-10014).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMatchSetup, parseQualifiedId } from './matchSetup.validate.js';
import type { CardRegistryReader } from './matchSetup.validate.js';
import type { MatchSetupConfig } from './matchSetup.types.js';
import type { MatchConfiguration } from './types.js';

/**
 * Mock set-data shape produced by `getSet()`. Only the fields the
 * validator's per-field helpers iterate are populated.
 */
interface MockSetData {
  abbr: string;
  schemes: Array<{ slug: string }>;
  masterminds: Array<{ slug: string }>;
  henchmen: Array<{ slug: string }>;
  villains: Array<{ slug: string }>;
}

/**
 * Creates a registry mock satisfying the widened CardRegistryReader
 * interface. The fixture exposes:
 * - Set "test" with the entities used by the existing tests.
 * - Set "core" with one collision-pair entity (`black-widow`) for the
 *   cross-set-collision test category.
 */
function createMockRegistry(): CardRegistryReader {
  const testSetData: MockSetData = {
    abbr: 'test',
    schemes: [{ slug: 'test-scheme-001' }],
    masterminds: [{ slug: 'test-mastermind-001' }],
    henchmen: [{ slug: 'test-henchman-group-001' }],
    villains: [
      { slug: 'test-villain-group-001' },
      { slug: 'test-villain-group-002' },
    ],
  };
  const coreSetData: MockSetData = {
    abbr: 'core',
    schemes: [{ slug: 'core-scheme-only' }],
    masterminds: [{ slug: 'core-mastermind-only' }],
    henchmen: [{ slug: 'core-henchman-only' }],
    villains: [{ slug: 'shared-villain-group' }],
  };
  const wwhkSetData: MockSetData = {
    abbr: 'wwhk',
    schemes: [{ slug: 'wwhk-scheme-only' }],
    masterminds: [{ slug: 'wwhk-mastermind-only' }],
    henchmen: [],
    villains: [{ slug: 'shared-villain-group' }],
  };

  return {
    listCards() {
      return [
        // why: hero flat-card keys feed buildKnownHeroQualifiedIds via
        // extractHeroSlug. Format: {setAbbr}-hero-{heroSlug}-{slot}.
        // The test fixture provides one hero per set plus a collision
        // pair (`black-widow` in both `test` and `core`).
        { key: 'test-hero-test-hero-001-1', cardType: 'hero', slug: '1', setAbbr: 'test', abilities: [] },
        { key: 'test-hero-test-hero-002-1', cardType: 'hero', slug: '1', setAbbr: 'test', abilities: [] },
        { key: 'test-hero-test-hero-003-1', cardType: 'hero', slug: '1', setAbbr: 'test', abilities: [] },
        { key: 'test-hero-black-widow-1', cardType: 'hero', slug: '1', setAbbr: 'test', abilities: [] },
        { key: 'core-hero-black-widow-1', cardType: 'hero', slug: '1', setAbbr: 'core', abilities: [] },
        // villain flat-card keys feed buildKnownVillainGroupQualifiedIds.
        // Format: {setAbbr}-villain-{groupSlug}-{cardSlug}.
        { key: 'test-villain-test-villain-group-001-card-a', cardType: 'villain', slug: 'card-a', setAbbr: 'test' },
        { key: 'test-villain-test-villain-group-002-card-a', cardType: 'villain', slug: 'card-a', setAbbr: 'test' },
        { key: 'core-villain-shared-villain-group-card-a', cardType: 'villain', slug: 'card-a', setAbbr: 'core' },
        { key: 'wwhk-villain-shared-villain-group-card-a', cardType: 'villain', slug: 'card-a', setAbbr: 'wwhk' },
      ] as Array<{ key: string }>;
    },
    listSets() {
      return [{ abbr: 'test' }, { abbr: 'core' }, { abbr: 'wwhk' }];
    },
    getSet(abbr: string) {
      if (abbr === 'test') return testSetData;
      if (abbr === 'core') return coreSetData;
      if (abbr === 'wwhk') return wwhkSetData;
      return undefined;
    },
  };
}

/**
 * A valid MatchSetupConfig input with all 9 fields, qualified-ID form.
 */
function createValidInput(): Record<string, unknown> {
  return {
    schemeId: 'test/test-scheme-001',
    mastermindId: 'test/test-mastermind-001',
    villainGroupIds: ['test/test-villain-group-001', 'test/test-villain-group-002'],
    henchmanGroupIds: ['test/test-henchman-group-001'],
    heroDeckIds: ['test/test-hero-001', 'test/test-hero-002', 'test/test-hero-003'],
    bystandersCount: 30,
    woundsCount: 30,
    officersCount: 30,
    sidekicksCount: 0,
  };
}

describe('validateMatchSetup', () => {
  it('returns ok: true for a valid config with all qualified IDs in the registry', () => {
    const registry = createMockRegistry();
    const input = createValidInput();

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.schemeId, 'test/test-scheme-001');
      assert.equal(result.value.mastermindId, 'test/test-mastermind-001');
      assert.deepEqual(result.value.villainGroupIds, ['test/test-villain-group-001', 'test/test-villain-group-002']);
      assert.deepEqual(result.value.henchmanGroupIds, ['test/test-henchman-group-001']);
      assert.deepEqual(result.value.heroDeckIds, ['test/test-hero-001', 'test/test-hero-002', 'test/test-hero-003']);
      assert.equal(result.value.bystandersCount, 30);
      assert.equal(result.value.woundsCount, 30);
      assert.equal(result.value.officersCount, 30);
      assert.equal(result.value.sidekicksCount, 0);
    }
  });

  it('returns ok: false with correct field name when a required field is missing', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    delete input.schemeId;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const schemeError = result.errors.find((error) => error.field === 'schemeId');
      assert.ok(schemeError, 'Expected an error for the schemeId field.');
      assert.ok(
        schemeError.message.length > 10,
        'Error message should be a full sentence.',
      );
    }
  });

  it('returns ok: false when a count field is invalid (negative number)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.bystandersCount = -1;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const countError = result.errors.find((error) => error.field === 'bystandersCount');
      assert.ok(countError, 'Expected an error for the bystandersCount field.');
      assert.ok(
        countError.message.length > 10,
        'Error message should be a full sentence.',
      );
    }
  });

  it('returns ok: false with correct field name when a qualified ID is unknown in the loaded set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.mastermindId = 'test/unknown-mastermind';

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const mastermindError = result.errors.find((error) => error.field === 'mastermindId');
      assert.ok(mastermindError, 'Expected an error for the mastermindId field.');
      assert.ok(
        mastermindError.message.includes('unknown-mastermind'),
        'Error message should include the unknown slug.',
      );
    }
  });
});

describe('validateMatchSetup — supply-pile minimums (D-24032)', () => {
  it('rejects bystandersCount below the floor of 30', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.bystandersCount = 29;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const countError = result.errors.find((error) => error.field === 'bystandersCount');
      assert.ok(countError, 'Expected a minimum-floor error for bystandersCount.');
      assert.ok(
        countError.message.includes('at least 30'),
        'Error message should name the minimum floor.',
      );
    }
  });

  it('rejects woundsCount and officersCount below the floor of 30', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.woundsCount = 0;
    input.officersCount = 12;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.find((error) => error.field === 'woundsCount'),
        'Expected a minimum-floor error for woundsCount.',
      );
      assert.ok(
        result.errors.find((error) => error.field === 'officersCount'),
        'Expected a minimum-floor error for officersCount.',
      );
    }
  });

  it('accepts a sub-30 sidekicksCount (its floor is 0 — a match may use no sidekicks)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.sidekicksCount = 5;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, true, 'A sub-30 sidekicksCount must not trip the supply floor.');
  });

  it('reports the non-negative-integer error (not the floor) for a negative count', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.bystandersCount = -1;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const countError = result.errors.find((error) => error.field === 'bystandersCount');
      assert.ok(countError, 'Expected an error for bystandersCount.');
      assert.ok(
        countError.message.includes('non-negative integer'),
        'A negative value should report the type error, not the floor.',
      );
    }
  });

  it('accepts the exact floor of 30 (>= not >)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.bystandersCount = 30;
    input.woundsCount = 30;
    input.officersCount = 30;

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, true, 'Exactly 30 must satisfy the floor.');
  });
});

describe('validateMatchSetup — no-throw contract', () => {
  it('never throws, even with null input', () => {
    const registry = createMockRegistry();
    const result = validateMatchSetup(null, registry);
    assert.equal(result.ok, false);
    assert.ok(Array.isArray((result as { ok: false; errors: unknown[] }).errors));
  });

  it('never throws, even with undefined input', () => {
    const registry = createMockRegistry();
    const result = validateMatchSetup(undefined, registry);
    assert.equal(result.ok, false);
  });

  it('never throws, even with a number input', () => {
    const registry = createMockRegistry();
    const result = validateMatchSetup(42, registry);
    assert.equal(result.ok, false);
  });

  it('never throws, even with an array input', () => {
    const registry = createMockRegistry();
    const result = validateMatchSetup([1, 2, 3], registry);
    assert.equal(result.ok, false);
  });

  it('always returns an object with an ok property', () => {
    const registry = createMockRegistry();

    const validResult = validateMatchSetup(createValidInput(), registry);
    assert.equal(typeof validResult.ok, 'boolean');

    const invalidResult = validateMatchSetup({}, registry);
    assert.equal(typeof invalidResult.ok, 'boolean');
  });
});

describe('MatchConfiguration / MatchSetupConfig compatibility', () => {
  it('MatchConfiguration is assignable from MatchSetupConfig and vice versa', () => {
    const config: MatchSetupConfig = {
      schemeId: 'test/test-scheme',
      mastermindId: 'test/test-mastermind',
      villainGroupIds: ['test/vg-1'],
      henchmanGroupIds: ['test/hg-1'],
      heroDeckIds: ['test/hd-1'],
      bystandersCount: 10,
      woundsCount: 10,
      officersCount: 10,
      sidekicksCount: 0,
    };

    const asMatchConfiguration: MatchConfiguration = config;
    const asMatchSetupConfig: MatchSetupConfig = asMatchConfiguration;

    assert.equal(asMatchSetupConfig.schemeId, config.schemeId);
    assert.deepEqual(
      Object.keys(config).sort(),
      [
        'bystandersCount',
        'henchmanGroupIds',
        'heroDeckIds',
        'mastermindId',
        'officersCount',
        'schemeId',
        'sidekicksCount',
        'villainGroupIds',
        'woundsCount',
      ],
      'MatchSetupConfig must have exactly 9 fields with the locked names.',
    );
  });
});

describe('validateMatchSetup — CardRegistryReader boundary', () => {
  it('works with a minimal in-memory CardRegistryReader (no registry import)', () => {
    const fakeRegistry: CardRegistryReader = {
      listCards() {
        return [];
      },
      listSets() {
        return [{ abbr: 'fake' }];
      },
      getSet(abbr: string) {
        if (abbr === 'fake') {
          return {
            abbr: 'fake',
            schemes: [{ slug: 'scheme-001' }],
            masterminds: [{ slug: 'mastermind-001' }],
            henchmen: [{ slug: 'henchman-001' }],
            villains: [{ slug: 'villain-001' }],
          };
        }
        return undefined;
      },
    };

    const input = {
      schemeId: 'fake/scheme-001',
      mastermindId: 'fake/mastermind-001',
      // why: villain qualified IDs are derived from villain flat-card keys
      // (Class A decoder); a registry without those keys cannot produce
      // matches for villain groups, so this fixture omits villainGroupIds
      // existence — uses an in-set entry that has no flat cards. Test
      // verifies the boundary, not full data resolution.
      villainGroupIds: ['fake/villain-001'],
      henchmanGroupIds: ['fake/henchman-001'],
      heroDeckIds: ['fake/hero-001'],
      // why: at/above the D-24032 supply floor so this test isolates the
      // registry-existence boundary it targets (villain group + hero have no
      // flat-card keys in the minimal mock) rather than also tripping the
      // count floor.
      bystandersCount: 30,
      woundsCount: 30,
      officersCount: 30,
      sidekicksCount: 0,
    };

    const result = validateMatchSetup(input, fakeRegistry);
    // why: villain group + hero have no flat-card keys in this minimal
    // mock, so buildKnownVillainGroupQualifiedIds and
    // buildKnownHeroQualifiedIds yield empty sets; expect existence
    // errors for those fields. The test asserts no THROW and structured
    // errors — boundary integrity, not full success.
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.length > 0, 'Expected structured errors when minimal registry has no flat cards.');
    }
  });
});

describe('validateMatchSetup — determinism', () => {
  it('returns identical validated config on repeated calls with the same input', () => {
    const registry = createMockRegistry();
    const input1 = createValidInput();
    const input2 = createValidInput();

    const result1 = validateMatchSetup(input1, registry);
    const result2 = validateMatchSetup(input2, registry);

    assert.equal(result1.ok, true);
    assert.equal(result2.ok, true);
    if (result1.ok && result2.ok) {
      assert.deepEqual(result1.value, result2.value,
        'Expected deterministic validated output on repeated calls.');
    }
  });
});

describe('validateMatchSetup — empty string fields', () => {
  it('returns ok: false when a string field is an empty string', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = '';

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      const schemeError = result.errors.find((error) => error.field === 'schemeId');
      assert.ok(schemeError, 'Expected an error for the schemeId field.');
    }
  });
});

describe('validateMatchSetup — extra fields on input', () => {
  it('ignores extra fields on the input object (JSON Schema enforces additionalProperties)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    (input as Record<string, unknown>).parOverride = 123;
    (input as Record<string, unknown>).ruleOverrides = { something: true };

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, true,
      'Engine validator accepts extra fields — JSON Schema rejects them at the server layer.');
  });
});

describe('validateMatchSetup — error accumulation', () => {
  it('accumulates multiple shape errors instead of failing on the first one', () => {
    const registry = createMockRegistry();

    const input = {
      schemeId: 123,
      mastermindId: null,
      villainGroupIds: [],
      henchmanGroupIds: 'not-an-array',
      heroDeckIds: [42],
      bystandersCount: -1,
      woundsCount: 3.5,
      officersCount: 'ten',
      sidekicksCount: -99,
    };

    const result = validateMatchSetup(input, registry);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.length, 9,
        'Expected exactly 9 errors — one for each invalid field.');

      const errorFields = result.errors.map((error) => error.field).sort();
      assert.deepEqual(errorFields, [
        'bystandersCount',
        'henchmanGroupIds',
        'heroDeckIds',
        'mastermindId',
        'officersCount',
        'schemeId',
        'sidekicksCount',
        'villainGroupIds',
        'woundsCount',
      ]);
    }
  });
});

// ===========================================================================
// WP-113 §6 step 9 — qualified-ID validation tests (≥30 new tests).
//
// 5 fields × 5 categories = 25 tests:
//   - accept-qualified
//   - reject-bare-slug
//   - reject-display-name
//   - reject-flat-card-key
//   - reject-cross-set-collision (verifies the validator distinguishes
//     `core/X` from `wwhk/X` rather than accepting whichever set was
//     hit first)
// ≥5 parse-error tests cover empty / no-slash / multiple-slash /
// empty-setAbbr / empty-slug / leading-whitespace.
// 1 set-not-loaded test verifies the "set X not loaded" error fires
// before the "slug not in set" error.
// ===========================================================================

describe('validateMatchSetup — qualified ID grammar (parseQualifiedId)', () => {
  it('parses a well-formed <setAbbr>/<slug>', () => {
    const parsed = parseQualifiedId('core/black-widow');
    assert.deepEqual(parsed, { setAbbr: 'core', slug: 'black-widow' });
  });

  it('rejects empty input', () => {
    assert.equal(parseQualifiedId(''), null);
  });

  it('rejects input with no slash', () => {
    assert.equal(parseQualifiedId('black-widow'), null);
  });

  it('rejects input with multiple slashes', () => {
    assert.equal(parseQualifiedId('core/sub/black-widow'), null);
  });

  it('rejects input with empty setAbbr', () => {
    assert.equal(parseQualifiedId('/black-widow'), null);
  });

  it('rejects input with empty slug', () => {
    assert.equal(parseQualifiedId('core/'), null);
  });

  it('rejects input with leading whitespace', () => {
    assert.equal(parseQualifiedId(' core/black-widow'), null);
  });

  it('rejects input with trailing whitespace', () => {
    assert.equal(parseQualifiedId('core/black-widow '), null);
  });
});

describe('validateMatchSetup — schemeId qualified-ID validation', () => {
  it('accepts a qualified scheme ID present in the loaded set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = 'test/test-scheme-001';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, true);
  });

  it('rejects a bare scheme slug (no setAbbr/ prefix)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = 'test-scheme-001';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const error = result.errors.find((e) => e.field === 'schemeId');
      assert.ok(error?.message.includes('locked qualified form'));
    }
  });

  it('rejects a scheme display name (capitals, spaces)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = 'Test Scheme One';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a scheme flat-card key (test-scheme-test-scheme-001 form)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = 'test-scheme-test-scheme-001';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a scheme slug that exists only in a different set (cross-set collision)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    // why: `core-scheme-only` exists in set "core" but not in set "test".
    // Format is qualified — but the slug doesn't exist in the named set.
    input.schemeId = 'test/core-scheme-only';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const error = result.errors.find((e) => e.field === 'schemeId');
      assert.ok(error?.message.includes('does not match any known scheme in set "test"'));
    }
  });
});

describe('validateMatchSetup — mastermindId qualified-ID validation', () => {
  it('accepts a qualified mastermind ID present in the loaded set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.mastermindId = 'test/test-mastermind-001';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, true);
  });

  it('rejects a bare mastermind slug', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.mastermindId = 'test-mastermind-001';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a mastermind display name', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.mastermindId = 'Test Mastermind 001';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a mastermind flat-card key', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.mastermindId = 'test-mastermind-test-mastermind-001-base';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a mastermind slug present only in a different set (cross-set collision)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.mastermindId = 'test/core-mastermind-only';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });
});

describe('validateMatchSetup — villainGroupIds qualified-ID validation', () => {
  it('accepts qualified villain group IDs present in the loaded set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.villainGroupIds = ['test/test-villain-group-001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, true);
  });

  it('rejects a bare villain group slug', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.villainGroupIds = ['test-villain-group-001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a villain group display name', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.villainGroupIds = ['Test Villain Group 001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a villain flat-card key', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.villainGroupIds = ['test-villain-test-villain-group-001-card-a'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a villain group slug that collides across sets (named set wins)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    // why: `shared-villain-group` exists in both `core` and `wwhk`.
    // The qualified form `core/shared-villain-group` resolves to the
    // core entry; `test/shared-villain-group` does NOT exist in `test`.
    input.villainGroupIds = ['test/shared-villain-group'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const error = result.errors.find((e) => e.field === 'villainGroupIds');
      assert.ok(error?.message.includes('villain group'));
    }
  });
});

describe('validateMatchSetup — henchmanGroupIds qualified-ID validation', () => {
  it('accepts qualified henchman group IDs present in the loaded set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.henchmanGroupIds = ['test/test-henchman-group-001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, true);
  });

  it('rejects a bare henchman group slug', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.henchmanGroupIds = ['test-henchman-group-001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a henchman group display name', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.henchmanGroupIds = ['Test Henchman Group 001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a henchman flat-card key (none exist in the data, but format-detection still applies)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.henchmanGroupIds = ['test-henchman-test-henchman-group-001-card-a'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a henchman group slug present only in a different set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.henchmanGroupIds = ['test/core-henchman-only'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });
});

describe('validateMatchSetup — heroDeckIds qualified-ID validation', () => {
  it('accepts qualified hero IDs present in the loaded set', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.heroDeckIds = ['test/test-hero-001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, true);
  });

  it('rejects a bare hero slug', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.heroDeckIds = ['test-hero-001'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a hero display name', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.heroDeckIds = ['Black Widow'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('rejects a hero flat-card key', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.heroDeckIds = ['test-hero-test-hero-001-1'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
  });

  it('distinguishes hero slugs across sets (cross-set collision)', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    // why: `black-widow` exists as a hero key in both `test` and `core`.
    // Both qualified forms must be acceptable; bare `black-widow` must
    // not match either.
    input.heroDeckIds = ['core/black-widow'];
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, true);

    const input2 = createValidInput();
    input2.heroDeckIds = ['test/black-widow'];
    const result2 = validateMatchSetup(input2, registry);
    assert.equal(result2.ok, true);

    const input3 = createValidInput();
    input3.heroDeckIds = ['black-widow'];
    const result3 = validateMatchSetup(input3, registry);
    assert.equal(result3.ok, false);
  });
});

describe('validateMatchSetup — set-not-loaded vs slug-not-in-set distinction', () => {
  it('returns "set not loaded" when the setAbbr is not in listSets', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = 'unloaded/some-scheme';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const error = result.errors.find((e) => e.field === 'schemeId');
      assert.ok(error?.message.includes('which is not loaded'));
      assert.ok(!error?.message.includes('does not match any known'));
    }
  });

  it('returns "slug not in set" when the setAbbr loads but the slug is missing', () => {
    const registry = createMockRegistry();
    const input = createValidInput();
    input.schemeId = 'test/no-such-scheme';
    const result = validateMatchSetup(input, registry);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const error = result.errors.find((e) => e.field === 'schemeId');
      assert.ok(error?.message.includes('does not match any known scheme'));
      assert.ok(!error?.message.includes('is not loaded'));
    }
  });
});
