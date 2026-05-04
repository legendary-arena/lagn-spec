/**
 * Contract enforcement tests for buildCardDisplayData (WP-111 / EC-118).
 *
 * Walks the four projected card types (hero / villain / henchman /
 * mastermind base) using a structural mock that satisfies
 * CardDisplayDataRegistryReader. No @legendary-arena/registry import.
 * No boardgame.io import. node:test + node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCardDisplayData,
  isCardDisplayDataRegistryReader,
} from './buildCardDisplayData.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';

// ---------------------------------------------------------------------------
// Structural mock fixtures
// ---------------------------------------------------------------------------

// why: mocks satisfy the local CardDisplayDataRegistryReader interface
// only — no import from @legendary-arena/registry. Mirrors the
// buildCardKeywords / buildCardStats test pattern.

interface MockFlatCard {
  key: string;
  cardType: string;
  slug: string;
  setAbbr: string;
  name: string;
  imageUrl: string;
  cost?: string | number | undefined;
}

interface MockVillainCard {
  slug: string;
  vAttack: string | number | null;
}

interface MockMastermindCard {
  slug: string;
  tactic?: boolean;
  vAttack?: string | number | null;
}

interface MockHenchmanGroup {
  slug: string;
  name: string;
  imageUrl: string;
  vAttack: string | number | null;
}

interface MockSetData {
  abbr: string;
  villains: { slug: string; cards: MockVillainCard[] }[];
  henchmen: MockHenchmanGroup[];
  masterminds: { slug: string; cards: MockMastermindCard[] }[];
}

interface MockRegistry {
  listCards(): MockFlatCard[];
  getSet(abbr: string): MockSetData | undefined;
}

function buildFixtureRegistry(): MockRegistry {
  // why: synthesize one set with one hero deck, one villain group, one
  // henchman group, and one mastermind (with a base card and one
  // tactic). All four card types are exercised by a single setup config.
  const flatCards: MockFlatCard[] = [
    // Hero: black-widow with two cards
    {
      key: 'core-hero-black-widow-1',
      cardType: 'hero',
      slug: 'mission-accomplished',
      setAbbr: 'core',
      name: 'Mission Accomplished',
      imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
      cost: 2,
    },
    {
      key: 'core-hero-black-widow-2',
      cardType: 'hero',
      slug: 'silent-takedown',
      setAbbr: 'core',
      name: 'Silent Takedown',
      imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-2.webp',
      cost: 0,
    },
    // Hero with star-cost (e.g., amwp Wasp)
    {
      key: 'core-hero-black-widow-3',
      cardType: 'hero',
      slug: 'star-card',
      setAbbr: 'core',
      name: 'Star Card',
      imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-3.webp',
      cost: '2*',
    },
    // Hero with plus-modifier cost
    {
      key: 'core-hero-black-widow-4',
      cardType: 'hero',
      slug: 'plus-card',
      setAbbr: 'core',
      name: 'Plus Card',
      imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-4.webp',
      cost: '2+',
    },
    // Hero with no cost field (undefined)
    {
      key: 'core-hero-black-widow-5',
      cardType: 'hero',
      slug: 'no-cost-card',
      setAbbr: 'core',
      name: 'No-Cost Card',
      imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-5.webp',
    },
    // Villain card
    {
      key: 'core-villain-brotherhood-magneto',
      cardType: 'villain',
      slug: 'magneto',
      setAbbr: 'core',
      name: 'Magneto',
      imageUrl: 'https://images.barefootbetters.com/core/core-villain-brotherhood-magneto.webp',
    },
    // Mastermind base card + tactic
    {
      key: 'core-mastermind-dr-doom-doctor-doom',
      cardType: 'mastermind',
      slug: 'doctor-doom',
      setAbbr: 'core',
      name: 'Dr. Doom',
      imageUrl: 'https://images.barefootbetters.com/core/core-mastermind-dr-doom-doctor-doom.webp',
    },
    {
      key: 'core-mastermind-dr-doom-secret-of-time-travel',
      cardType: 'mastermind',
      slug: 'secret-of-time-travel',
      setAbbr: 'core',
      name: 'Secret of Time Travel',
      imageUrl:
        'https://images.barefootbetters.com/core/core-mastermind-dr-doom-secret-of-time-travel.webp',
    },
  ];

  const setData: MockSetData = {
    abbr: 'core',
    villains: [
      {
        slug: 'brotherhood',
        cards: [{ slug: 'magneto', vAttack: 5 }],
      },
    ],
    henchmen: [
      {
        slug: 'doombot-legion',
        name: 'Doombot Legion',
        imageUrl: 'https://images.barefootbetters.com/core/core-hm-doombot-legion.webp',
        vAttack: '3',
      },
    ],
    masterminds: [
      {
        slug: 'dr-doom',
        cards: [
          { slug: 'doctor-doom', tactic: false, vAttack: 9 },
          { slug: 'secret-of-time-travel', tactic: true, vAttack: 7 },
        ],
      },
    ],
  };

  return {
    listCards: () => flatCards,
    getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
  };
}

function buildFixtureConfig(): MatchSetupConfig {
  return {
    schemeId: 'core/midtown-bombing',
    mastermindId: 'core/dr-doom',
    villainGroupIds: ['core/brotherhood'],
    henchmanGroupIds: ['core/doombot-legion'],
    heroDeckIds: ['core/black-widow'],
    bystandersCount: 2,
    woundsCount: 30,
    officersCount: 30,
    sidekicksCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCardDisplayData', () => {
  it('emits one entry per hero card with name / imageUrl / cost', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const blackWidow1 = result['core-hero-black-widow-1'];
    assert.ok(blackWidow1, 'hero card 1 must be present');
    assert.equal(blackWidow1.extId, 'core-hero-black-widow-1');
    assert.equal(blackWidow1.name, 'Mission Accomplished');
    assert.equal(
      blackWidow1.imageUrl,
      'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
    );
    assert.equal(blackWidow1.cost, 2);
  });

  it('preserves string fields verbatim from the registry', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const villain = result['core-villain-brotherhood-magneto'];
    assert.ok(villain, 'villain entry must be present');
    assert.equal(villain.name, 'Magneto');
    assert.equal(
      villain.imageUrl,
      'https://images.barefootbetters.com/core/core-villain-brotherhood-magneto.webp',
    );
  });

  it('parses cost: integer 0 stays 0 (preserved, distinct from null)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const zeroCostCard = result['core-hero-black-widow-2'];
    assert.ok(zeroCostCard, 'zero-cost hero card must be present');
    assert.equal(
      zeroCostCard.cost,
      0,
      'cost: 0 must be preserved, NOT mapped to null',
    );
  });

  it('parses cost: integer 3 stays 3', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const heroCard = result['core-hero-black-widow-1'];
    assert.equal(heroCard?.cost, 2);
  });

  it('parses cost: star-cost "2*" yields 2', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const starCard = result['core-hero-black-widow-3'];
    assert.equal(starCard?.cost, 2, 'star-cost "2*" must parse to 2');
  });

  it('parses cost: plus-modifier "2+" yields 2', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const plusCard = result['core-hero-black-widow-4'];
    assert.equal(plusCard?.cost, 2, 'plus-modifier "2+" must parse to 2');
  });

  it('parses cost: undefined yields null (registry says no cost)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const noCostCard = result['core-hero-black-widow-5'];
    assert.ok(noCostCard, 'no-cost card must be present');
    assert.equal(
      noCostCard.cost,
      null,
      'undefined cost must yield null, NOT 0',
    );
  });

  it('emits exactly 10 henchman virtual copies sharing group-level fields', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    for (let copyIndex = 0; copyIndex < 10; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const extId = `henchman-doombot-legion-${paddedIndex}`;
      const entry = result[extId];
      assert.ok(entry, `henchman copy ${extId} must be present`);
      assert.equal(entry.extId, extId);
      assert.equal(entry.name, 'Doombot Legion');
      assert.equal(
        entry.imageUrl,
        'https://images.barefootbetters.com/core/core-hm-doombot-legion.webp',
      );
      assert.equal(entry.cost, 3);
    }

    // 11th copy must NOT exist
    assert.equal(
      result['henchman-doombot-legion-10'],
      undefined,
      'no 11th henchman copy',
    );
  });

  it('emits exactly one mastermind base card entry; no tactic cards', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    const baseCard = result['core-mastermind-dr-doom-doctor-doom'];
    assert.ok(baseCard, 'mastermind base card must be present');
    assert.equal(baseCard.name, 'Dr. Doom');
    assert.equal(baseCard.cost, 9);

    // Tactic card must NOT be present
    assert.equal(
      result['core-mastermind-dr-doom-secret-of-time-travel'],
      undefined,
      'tactic card must NOT appear in cardDisplayData',
    );
  });

  it('drift sanity: every entry extId equals its map key', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);

    for (const [key, entry] of Object.entries(result)) {
      assert.equal(entry.extId, key, `extId must match map key for ${key}`);
    }
  });

  it('returns deeply-equal output across two identical calls (determinism)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const first = buildCardDisplayData(registry, config);
    const second = buildCardDisplayData(registry, config);

    assert.deepStrictEqual(first, second);
  });

  it('JSON.stringify round-trips byte-equal', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    assert.deepStrictEqual(parsed, result);
  });

  it('layer-boundary guard: narrow registry yields empty record without throwing', () => {
    // why: a registry mock missing getSet (CardRegistryReader-only) must
    // trigger isCardDisplayDataRegistryReader === false and return {} —
    // matches the buildCardStats:170–172 graceful-skip precedent.
    const narrowRegistry = {
      listCards: () => [],
    };
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(narrowRegistry, config);

    assert.deepStrictEqual(result, {}, 'narrow mock must yield empty record');
  });

  it('isCardDisplayDataRegistryReader rejects narrow mocks', () => {
    assert.equal(isCardDisplayDataRegistryReader(null), false);
    assert.equal(isCardDisplayDataRegistryReader(undefined), false);
    assert.equal(isCardDisplayDataRegistryReader({}), false);
    assert.equal(
      isCardDisplayDataRegistryReader({ listCards: () => [] }),
      false,
      'listCards-only mock must fail (getSet missing)',
    );
    assert.equal(
      isCardDisplayDataRegistryReader({
        listCards: () => [],
        getSet: () => undefined,
      }),
      true,
      'full reader must pass',
    );
  });
});

// ===========================================================================
// WP-135 — hero card-instance walk (slash-format ext_id)
// ===========================================================================

describe('buildCardDisplayData — WP-135 hero card-instance walk (slash-format ext_id)', () => {
  it('emits one display entry per hero card instance keyed by <setAbbr>/<heroSlug>/<cardSlug>', () => {
    const setData = {
      abbr: 'core',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'black-widow',
          cards: [
            {
              slug: 'mission-accomplished',
              rarityLabel: 'Common 1',
              name: 'Mission Accomplished',
              imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
              cost: 2,
            },
            {
              slug: 'taskmaster',
              rarityLabel: 'Rare',
              name: 'Taskmaster',
              imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-4.webp',
              cost: 6,
            },
          ],
        },
      ],
    };

    const registry = {
      listCards: () => [],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };

    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/black-widow'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config);

    const mission = result['core/black-widow/mission-accomplished'];
    assert.ok(mission, 'Slash-format mission-accomplished entry must be present');
    assert.equal(mission!.name, 'Mission Accomplished');
    assert.equal(
      mission!.imageUrl,
      'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
    );
    assert.equal(mission!.cost, 2);

    const taskmaster = result['core/black-widow/taskmaster'];
    assert.ok(taskmaster, 'Slash-format taskmaster entry must be present');
    assert.equal(taskmaster!.name, 'Taskmaster');
    assert.equal(taskmaster!.cost, 6);
  });

  it('emits cost === null when registry has no cost field on the card', () => {
    const setData = {
      abbr: 'core',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'no-cost-hero',
          cards: [
            {
              slug: 'free-card',
              rarityLabel: 'Common 1',
              name: 'Free Card',
              imageUrl: '',
              // cost intentionally omitted
            },
          ],
        },
      ],
    };

    const registry = {
      listCards: () => [],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };

    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/no-cost-hero'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config);

    const freeCard = result['core/no-cost-hero/free-card'];
    assert.ok(freeCard, 'Slash-format entry must be present');
    assert.equal(freeCard!.cost, null, 'Missing cost must project as null (preserves the "no cost shown" UX distinction)');
  });
});
