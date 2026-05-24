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
  /** WP-172 / D-16802 — per-card copy count; absent ⇒ 1. */
  copies?: number;
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

// why: WP-172 fixture extensions — `other[]`, `bystanders[]`,
// `schemes[]` widened from the base WP-111 mock to exercise sections
// 5 (Master Strikes), 6 (Scheme Twists), and 7 (Villain-Deck
// Bystanders). All fields are `unknown[]` because the production
// schema (`packages/registry/src/schema.ts:332–336`) is
// `z.array(z.unknown())`, and the defensive parsing test deliberately
// passes malformed entries (null, primitives, missing fields) to
// prove the `typeof` guards work.

interface MockSetData {
  abbr: string;
  villains: { slug: string; cards: MockVillainCard[] }[];
  henchmen: MockHenchmanGroup[];
  masterminds: { slug: string; cards: MockMastermindCard[] }[];
  schemes?: unknown[];
  bystanders?: unknown[];
  other?: unknown[];
}

interface MockRegistry {
  listCards(): MockFlatCard[];
  /**
   * WP-172 — `listSets` is required by `VillainDeckRegistryReader`; the
   * cross-builder superset test (§Scope-C) passes this same mock into
   * `buildVillainDeck` to assert builder output and display map agree
   * on every ext_id.
   */
  listSets(): { abbr: string }[];
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
    // Villain card (single copy — exercises the WP-172 default-1 branch)
    {
      key: 'core-villain-brotherhood-magneto',
      cardType: 'villain',
      slug: 'magneto',
      setAbbr: 'core',
      name: 'Magneto',
      imageUrl: 'https://images.barefootbetters.com/core/core-villain-brotherhood-magneto.webp',
    },
    // why: WP-172 fixture — a 3-copy villain card exercises the
    // per-copy fan-out (D-16802) at indexes 00 / 01 / 02 and the
    // aliasing-isolation assertion.
    {
      key: 'core-villain-brotherhood-blob',
      cardType: 'villain',
      slug: 'blob',
      setAbbr: 'core',
      name: 'Blob',
      imageUrl: 'https://images.barefootbetters.com/core/core-villain-brotherhood-blob.webp',
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

  // Set A (`core`) — full art coverage. Doubles as the WP-172 tier-2
  // cross-set fallback fixture for sections 5 + 6 because the WP-172
  // tier-2 path always calls `registry.getSet('core')`.
  const setData: MockSetData = {
    abbr: 'core',
    villains: [
      {
        slug: 'brotherhood',
        cards: [
          { slug: 'magneto', vAttack: 5 },
          // why: WP-172 / D-16802 — `copies: 3` exercises the per-copy
          // fan-out at suffixed indices 00 / 01 / 02 and the per-copy
          // aliasing-isolation assertion.
          { slug: 'blob', vAttack: 3, copies: 3 },
        ],
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
    // why: WP-172 §Scope-B — `other[]` is `z.array(z.unknown())`; mirror
    // the production `core.json:2560-2575` shape verbatim (the canonical
    // tier-1 Master Strike + Scheme Twist art source AND the tier-2
    // cross-set fallback used by every other set in this fixture).
    other: [
      {
        name: 'Master Strike',
        slug: 'master-strike',
        cardType: 'mastermind-strike',
        imageUrl: 'https://images.legendary-arena.com/core/core-ms-master-strike.webp',
      },
      {
        name: 'Scheme Twist',
        slug: 'scheme-twist',
        cardType: 'scheme-twist',
        imageUrl: 'https://images.legendary-arena.com/core/core-st-scheme-twist.webp',
      },
    ],
    // why: WP-172 §Scope-B — tier-1 generic bystander (`slug: 'bystander'`).
    bystanders: [
      {
        name: 'Test Bystander A',
        slug: 'bystander',
        imageUrl: 'https://images.legendary-arena.com/core/core-by-bystander.webp',
      },
    ],
    // why: WP-172 §Scope-C — two schemes on Set A. `midtown-bombing`
    // carries explicit counts (twist 4, bystander 2); `legacy-virus`
    // carries neither (exercises the `8` + `numPlayers` fallbacks).
    schemes: [
      {
        name: 'Midtown Bombing',
        slug: 'midtown-bombing',
        imageUrl: 'https://images.legendary-arena.com/core/core-sch-midtown-bombing.webp',
        villainDeckTwistCount: 4,
        villainDeckBystanderCount: 2,
      },
      {
        name: 'Legacy Virus, The',
        slug: 'legacy-virus-the',
        imageUrl: 'https://images.legendary-arena.com/core/core-sch-legacy-virus-the.webp',
      },
    ],
  };

  // why: WP-172 §Scope-C Set B — empty `other[]` exercises the tier-2
  // `core`-set fallback (Master Strikes + Scheme Twists). `bystanders[]`
  // carries the generic `slug: 'bystander'` entry at index 1, NOT 0;
  // this is the load-bearing regression-guard for the "slug-match must
  // beat positional `bystanders[0]`" rule. Comic Shop Keeper at index 0
  // is what a naive positional read would have picked.
  const setDataB: MockSetData = {
    abbr: 'testset-named',
    villains: [],
    henchmen: [],
    masterminds: [
      {
        slug: 'test-mastermind-b',
        cards: [{ slug: 'test-mastermind-b-base', tactic: false, vAttack: 8 }],
      },
    ],
    other: [],
    bystanders: [
      {
        name: 'Comic Shop Keeper',
        slug: 'comic-shop-keeper',
        imageUrl: 'b.webp',
      },
      {
        name: 'Test Bystander B',
        slug: 'bystander',
        imageUrl: 'b-generic.webp',
      },
    ],
    schemes: [
      {
        name: 'Test Scheme B',
        slug: 'test-scheme-b',
        imageUrl: 'b-sch.webp',
      },
    ],
  };

  // why: WP-172 §Scope-C Set C — empty `other[]` AND
  // named-only `bystanders[]` (no `slug === 'bystander'` entry) exercises
  // the tier-2 acknowledged-imperfect named-character fallback for
  // section 7. Mirrors the cvwr / ssw2 / xmen real-set cases.
  const setDataC: MockSetData = {
    abbr: 'testset-orphan',
    villains: [],
    henchmen: [],
    masterminds: [],
    other: [],
    bystanders: [
      {
        name: 'Alligator Trapper',
        slug: 'alligator-trapper',
        imageUrl: 'c.webp',
      },
    ],
    schemes: [
      {
        name: 'Test Scheme C',
        slug: 'test-scheme-c',
        imageUrl: 'c-sch.webp',
      },
    ],
  };

  // why: WP-172 §Scope-C Set D — empty `bystanders[]` exercises the
  // tier-3 literal `{ name: 'Bystander', imageUrl: '' }` fallback for
  // section 7. Mirrors the dstr real-set case.
  const setDataD: MockSetData = {
    abbr: 'testset-empty-bystanders',
    villains: [],
    henchmen: [],
    masterminds: [],
    other: [],
    bystanders: [],
    schemes: [
      {
        name: 'Test Scheme D',
        slug: 'test-scheme-d',
        imageUrl: 'd-sch.webp',
      },
    ],
  };

  // why: WP-172 §Scope-C defensive parsing fixture — `other[]` mixes
  // malformed entries (`null`, primitive, missing `imageUrl`) with one
  // well-formed entry; the well-formed entry must win after the
  // malformed ones are silently skipped. Mirrors the EC-190 §Locked
  // Values defensive-read requirement.
  const setDataDefensive: MockSetData = {
    abbr: 'testset-defensive',
    villains: [],
    henchmen: [],
    masterminds: [
      {
        slug: 'test-mastermind-defensive',
        cards: [{ slug: 'test-mastermind-defensive-base', tactic: false, vAttack: 8 }],
      },
    ],
    other: [
      null,
      // missing imageUrl — must be skipped by `typeof === 'string'` guard
      { cardType: 'mastermind-strike', name: 'Skip-Me-No-Image' },
      'string-not-object',
      // first well-formed match wins
      {
        name: 'Defensive OK',
        slug: 'master-strike',
        cardType: 'mastermind-strike',
        imageUrl: 'defensive-ok.webp',
      },
    ],
    bystanders: [],
    schemes: [],
  };

  return {
    listCards: () => flatCards,
    listSets: () => [
      { abbr: 'core' },
      { abbr: 'testset-named' },
      { abbr: 'testset-orphan' },
      { abbr: 'testset-empty-bystanders' },
      { abbr: 'testset-defensive' },
    ],
    getSet: (abbr: string) => {
      if (abbr === 'core') return setData;
      if (abbr === 'testset-named') return setDataB;
      if (abbr === 'testset-orphan') return setDataC;
      if (abbr === 'testset-empty-bystanders') return setDataD;
      if (abbr === 'testset-defensive') return setDataDefensive;
      return undefined;
    },
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

    const result = buildCardDisplayData(registry, config, 2);

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

    const result = buildCardDisplayData(registry, config, 2);

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

    const result = buildCardDisplayData(registry, config, 2);

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

    const result = buildCardDisplayData(registry, config, 2);

    const heroCard = result['core-hero-black-widow-1'];
    assert.equal(heroCard?.cost, 2);
  });

  it('parses cost: star-cost "2*" yields 2', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    const starCard = result['core-hero-black-widow-3'];
    assert.equal(starCard?.cost, 2, 'star-cost "2*" must parse to 2');
  });

  it('parses cost: plus-modifier "2+" yields 2', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    const plusCard = result['core-hero-black-widow-4'];
    assert.equal(plusCard?.cost, 2, 'plus-modifier "2+" must parse to 2');
  });

  it('parses cost: undefined yields null (registry says no cost)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

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

    const result = buildCardDisplayData(registry, config, 2);

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

    const result = buildCardDisplayData(registry, config, 2);

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

    const result = buildCardDisplayData(registry, config, 2);

    for (const [key, entry] of Object.entries(result)) {
      assert.equal(entry.extId, key, `extId must match map key for ${key}`);
    }
  });

  it('returns deeply-equal output across two identical calls (determinism)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const first = buildCardDisplayData(registry, config, 2);
    const second = buildCardDisplayData(registry, config, 2);

    assert.deepStrictEqual(first, second);
  });

  it('JSON.stringify round-trips byte-equal', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);
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

    const result = buildCardDisplayData(narrowRegistry, config, 2);

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

describe('buildCardDisplayData — WP-135 / WP-137 hero card-instance walk (slash-format ext_id with #copyIndex)', () => {
  it('emits one display entry per copy keyed by <setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>', () => {
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

    const result = buildCardDisplayData(registry, config, 2);

    // why: WP-137 D-13702 — fan-out per copy. Common 1 emits 5 copies
    // (#0-#4); Rare emits 3 copies (#0-#2). Each per-copy ext_id is its
    // own key in G.cardDisplayData with identical display payload.
    for (let copyIndex = 0; copyIndex < 5; copyIndex++) {
      const mission = result[`core/black-widow/mission-accomplished#${copyIndex}`];
      assert.ok(mission, `Slash-format mission-accomplished#${copyIndex} entry must be present`);
      assert.equal(mission!.name, 'Mission Accomplished');
      assert.equal(
        mission!.imageUrl,
        'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
      );
      assert.equal(mission!.cost, 2);
    }

    for (let copyIndex = 0; copyIndex < 3; copyIndex++) {
      const taskmaster = result[`core/black-widow/taskmaster#${copyIndex}`];
      assert.ok(taskmaster, `Slash-format taskmaster#${copyIndex} entry must be present`);
      assert.equal(taskmaster!.name, 'Taskmaster');
      assert.equal(taskmaster!.cost, 6);
    }
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

    const result = buildCardDisplayData(registry, config, 2);

    // why: WP-137 D-13702 — Common 1 emits 5 copies (#0-#4); each copy
    // carries identical display payload including cost === null.
    for (let copyIndex = 0; copyIndex < 5; copyIndex++) {
      const freeCard = result[`core/no-cost-hero/free-card#${copyIndex}`];
      assert.ok(freeCard, `Slash-format entry must be present at #${copyIndex}`);
      assert.equal(freeCard!.cost, null, 'Missing cost must project as null (preserves the "no cost shown" UX distinction)');
    }
  });

  // why: WP-137 D-13702 — per-copy parity. Every #N entry must carry
  // identical display payload (name, imageUrl, cost). Appended as
  // it() inside the existing describe() block for suite delta +0.
  it('per-copy parity: every #N display entry carries identical name / imageUrl / cost across copies', () => {
    const setData = {
      abbr: 'core',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'parity-hero',
          cards: [
            {
              slug: 'shared-card',
              rarityLabel: 'Common 1',
              name: 'Shared Card',
              imageUrl: 'https://images.barefootbetters.com/parity/shared-card.webp',
              cost: 4,
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
      heroDeckIds: ['core/parity-hero'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    for (let copyIndex = 0; copyIndex < 5; copyIndex++) {
      const entry = result[`core/parity-hero/shared-card#${copyIndex}`]!;
      assert.equal(entry.name, 'Shared Card', `shared-card#${copyIndex} name parity`);
      assert.equal(
        entry.imageUrl,
        'https://images.barefootbetters.com/parity/shared-card.webp',
        `shared-card#${copyIndex} imageUrl parity`,
      );
      assert.equal(entry.cost, 4, `shared-card#${copyIndex} cost parity`);
    }
  });
});

// ===========================================================================
// D-14102 / D-14103 — physicalCards migration tests
// ===========================================================================

describe('buildCardDisplayData — physicalCards (D-14102 / D-14103)', () => {
  it('split hero: uses physicalCard.imageUrl and sides[0] as canonical slug', () => {
    const setData = {
      abbr: 'bkwd',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'falcon-winter-soldier',
          cards: [
            { slug: 'attune', name: 'Attune', rarityLabel: 'Common 1', cost: 2 },
            { slug: 'atone', name: 'Atone', rarityLabel: 'Common 1', cost: 3 },
            { slug: 'solo-card', name: 'Solo Card', rarityLabel: 'Rare', cost: 6 },
          ],
          physicalCards: [
            { id: 'p1', count: 5, imageUrl: 'https://img/attune-atone.webp', sides: ['attune', 'atone'] },
            { id: 'p2', count: 1, imageUrl: 'https://img/solo-card.webp', sides: ['solo-card'] },
          ],
        },
      ],
    };

    const registry = {
      listCards: () => [],
      getSet: (abbr: string) => (abbr === 'bkwd' ? setData : undefined),
    };

    const config: MatchSetupConfig = {
      schemeId: 'bkwd/s',
      mastermindId: 'bkwd/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['bkwd/falcon-winter-soldier'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    // why: D-14103 — imageUrl comes from physicalCard, not card entry
    const entry0 = result['bkwd/falcon-winter-soldier/attune#0'];
    assert.ok(entry0, 'attune#0 must exist');
    assert.equal(entry0.imageUrl, 'https://img/attune-atone.webp', 'imageUrl from physicalCard');
    assert.equal(entry0.name, 'Attune', 'name from card entry via sides[0] lookup');
    assert.equal(entry0.cost, 2, 'cost from card entry via sides[0] lookup');

    // why: 5 copies of p1 + 1 copy of p2 = 6 total
    const allKeys = Object.keys(result).filter((k) => k.startsWith('bkwd/falcon-winter-soldier/'));
    assert.equal(allKeys.length, 6, 'split hero: 5 attune + 1 solo-card = 6 entries');

    const soloEntry = result['bkwd/falcon-winter-soldier/solo-card#0'];
    assert.ok(soloEntry, 'solo-card#0 must exist');
    assert.equal(soloEntry.imageUrl, 'https://img/solo-card.webp', 'solo imageUrl from physicalCard');
  });

  it('falls back to card.imageUrl when physicalCards is absent', () => {
    const setData = {
      abbr: 'core',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'test-hero',
          cards: [
            { slug: 'card-c1', name: 'Card C1', rarityLabel: 'Common 1', imageUrl: 'https://img/fallback.webp', cost: 2 },
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
      heroDeckIds: ['core/test-hero'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const entry = result['core/test-hero/card-c1#0'];
    assert.ok(entry, 'card-c1#0 must exist via fallback path');
    assert.equal(entry.imageUrl, 'https://img/fallback.webp', 'imageUrl from card entry fallback');
  });
});

// ===========================================================================
// WP-172 — Villain-Deck Display Data Coverage (per-copy villains,
// Master Strikes, Scheme Twists, Villain-Deck Bystanders)
// ===========================================================================

// why: import `buildVillainDeck` only here so the cross-builder superset
// invariant test (§Scope-C) can assert the regression-guard the original
// WP-168 gap was missing. `MockRegistry` already satisfies
// `VillainDeckRegistryReader` after the `listSets` widening above.
import { buildVillainDeck } from '../villainDeck/villainDeck.setup.js';
import { makeMockCtx } from '../test/mockCtx.js';

describe('buildCardDisplayData — WP-172 villain per-copy fan-out (D-16802)', () => {
  it('default 1: single-copy villain emits exactly one suffixed entry (-00)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    const magnetoCopy0 = result['core-villain-brotherhood-magneto-00'];
    assert.ok(magnetoCopy0, 'magneto-00 must be present (default copies = 1)');
    assert.equal(magnetoCopy0.name, 'Magneto');
    assert.equal(
      magnetoCopy0.imageUrl,
      'https://images.barefootbetters.com/core/core-villain-brotherhood-magneto.webp',
    );
    assert.equal(
      result['core-villain-brotherhood-magneto-01'],
      undefined,
      'no -01 entry for a single-copy villain',
    );
  });

  it('explicit copies: 3 villain emits exactly three suffixed entries (-00/-01/-02)', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    for (let copyIndex = 0; copyIndex < 3; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const extId = `core-villain-brotherhood-blob-${paddedIndex}`;
      const entry = result[extId];
      assert.ok(entry, `blob copy ${extId} must be present`);
      assert.equal(entry.extId, extId);
      assert.equal(entry.name, 'Blob');
      assert.equal(
        entry.imageUrl,
        'https://images.barefootbetters.com/core/core-villain-brotherhood-blob.webp',
      );
      assert.equal(entry.cost, 3, 'cost mirrors villainCard.vAttack');
    }

    // 4th copy must NOT exist
    assert.equal(
      result['core-villain-brotherhood-blob-03'],
      undefined,
      'no -03 entry for copies:3 villain',
    );
  });

  it('base FlatCard-keyed villain entry is KEPT as defensive alias', () => {
    // why: the existing test at line 217-230 asserts the base entry
    // shape. This test guards against accidental removal of the base
    // entry while adding per-copy entries (a known mistake mode noted
    // in EC-190 §Common Failure Smells).
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    const baseEntry = result['core-villain-brotherhood-magneto'];
    assert.ok(baseEntry, 'base FlatCard-keyed villain entry must still exist');
    assert.equal(baseEntry.name, 'Magneto');
  });

  it('per-copy entries do not alias each other (mutation isolation)', () => {
    // why: D-2802 / D-13502 / D-14102 — aliasing-prevention pattern.
    // Mutating one per-copy entry must not change a sibling.
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2) as Record<
      string,
      { extId: string; name: string; imageUrl: string; cost: number | null }
    >;
    result['core-villain-brotherhood-blob-00'].name = 'Mutated';

    assert.equal(
      result['core-villain-brotherhood-blob-01'].name,
      'Blob',
      'mutation to copy-00 must not leak to copy-01',
    );
    assert.equal(
      result['core-villain-brotherhood-blob-02'].name,
      'Blob',
      'mutation to copy-00 must not leak to copy-02',
    );
  });
});

describe('buildCardDisplayData — WP-172 Master Strikes (D-16801 / D-17201)', () => {
  it('tier-1: mastermind set carries entry — 5 strikes use set art', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    for (let strikeIndex = 0; strikeIndex < 5; strikeIndex++) {
      const paddedIndex = String(strikeIndex).padStart(2, '0');
      const extId = `master-strike-${paddedIndex}`;
      const entry = result[extId];
      assert.ok(entry, `master-strike-${paddedIndex} must be present`);
      assert.equal(entry.extId, extId);
      assert.equal(entry.name, 'Master Strike');
      assert.equal(
        entry.imageUrl,
        'https://images.legendary-arena.com/core/core-ms-master-strike.webp',
      );
      assert.equal(entry.cost, null, 'Master Strikes have cost: null');
    }
    assert.equal(
      result['master-strike-05'],
      undefined,
      'exactly 5 strikes; no -05 entry',
    );
  });

  it('tier-2 (D-17201): mastermind set has no entry — falls back to core', () => {
    // why: Set B has empty `other[]`; the tier-2 path must call
    // `getSet('core')` and read its mastermind-strike entry. Mirrors
    // the empirical 35/40-sets-need-this-fallback case.
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'core/midtown-bombing',
      mastermindId: 'testset-named/test-mastermind-b',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const strike0 = result['master-strike-00'];
    assert.ok(strike0, 'tier-2 fallback must still emit master-strike-00');
    assert.equal(strike0.name, 'Master Strike');
    assert.equal(
      strike0.imageUrl,
      'https://images.legendary-arena.com/core/core-ms-master-strike.webp',
      'tier-2 imageUrl comes from core set',
    );
  });

  it('tier-3: core unloaded AND mastermind set empty — literal fallback', () => {
    // why: defense-in-depth for narrow test mocks where `getSet('core')`
    // returns undefined. Build a registry without `core`.
    const registry = {
      listCards: () => [],
      listSets: () => [{ abbr: 'testset-isolated' }],
      getSet: (abbr: string) =>
        abbr === 'testset-isolated'
          ? {
              abbr: 'testset-isolated',
              villains: [],
              henchmen: [],
              masterminds: [
                {
                  slug: 'lonely-mm',
                  cards: [{ slug: 'lonely-mm-base', tactic: false, vAttack: 8 }],
                },
              ],
              other: [],
              bystanders: [],
              schemes: [],
            }
          : undefined,
    };
    const config: MatchSetupConfig = {
      schemeId: 'testset-isolated/no-scheme',
      mastermindId: 'testset-isolated/lonely-mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const strike0 = result['master-strike-00'];
    assert.ok(strike0, 'tier-3 still emits master-strike-00');
    assert.equal(strike0.name, 'Master Strike', 'tier-3 literal name');
    assert.equal(strike0.imageUrl, '', 'tier-3 literal empty imageUrl');
    assert.equal(strike0.cost, null);
  });
});

describe('buildCardDisplayData — WP-172 Scheme Twists (D-16702 / D-1411 / D-17201)', () => {
  it('tier-1 + explicit count 4: emits exactly 4 entries with scheme-set art', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 2);

    for (let twistIndex = 0; twistIndex < 4; twistIndex++) {
      const paddedIndex = String(twistIndex).padStart(2, '0');
      const extId = `scheme-twist-midtown-bombing-${paddedIndex}`;
      const entry = result[extId];
      assert.ok(entry, `${extId} must be present`);
      assert.equal(entry.extId, extId);
      assert.equal(entry.name, 'Scheme Twist', 'name is always the literal');
      assert.equal(
        entry.imageUrl,
        'https://images.legendary-arena.com/core/core-st-scheme-twist.webp',
      );
      assert.equal(entry.cost, null);
    }
    assert.equal(
      result['scheme-twist-midtown-bombing-04'],
      undefined,
      'explicit count 4 — no -04 entry',
    );
  });

  it('fallback count: scheme without villainDeckTwistCount yields 8 entries', () => {
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'core/legacy-virus-the',
      mastermindId: 'core/dr-doom',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    for (let twistIndex = 0; twistIndex < 8; twistIndex++) {
      const paddedIndex = String(twistIndex).padStart(2, '0');
      assert.ok(
        result[`scheme-twist-legacy-virus-the-${paddedIndex}`],
        `legacy-virus-the twist ${paddedIndex} must exist`,
      );
    }
    assert.equal(
      result['scheme-twist-legacy-virus-the-08'],
      undefined,
      'default 8 — no -08 entry',
    );
  });

  it('tier-2 (D-17201): scheme set has no entry — falls back to core', () => {
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'testset-named/test-scheme-b',
      mastermindId: 'core/dr-doom',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const twist0 = result['scheme-twist-test-scheme-b-00'];
    assert.ok(twist0, 'tier-2 fallback emits twist-00');
    assert.equal(twist0.name, 'Scheme Twist');
    assert.equal(
      twist0.imageUrl,
      'https://images.legendary-arena.com/core/core-st-scheme-twist.webp',
      'tier-2 imageUrl comes from core set',
    );
  });

  it('tier-3: core unloaded AND scheme set has no entry — literal fallback', () => {
    const registry = {
      listCards: () => [],
      listSets: () => [{ abbr: 'testset-isolated' }],
      getSet: (abbr: string) =>
        abbr === 'testset-isolated'
          ? {
              abbr: 'testset-isolated',
              villains: [],
              henchmen: [],
              masterminds: [],
              other: [],
              bystanders: [],
              schemes: [
                { slug: 'isolated-scheme', name: 'Isolated', imageUrl: 'i.webp' },
              ],
            }
          : undefined,
    };
    const config: MatchSetupConfig = {
      schemeId: 'testset-isolated/isolated-scheme',
      mastermindId: 'testset-isolated/no-mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const twist0 = result['scheme-twist-isolated-scheme-00'];
    assert.ok(twist0, 'tier-3 emits twist-00 with literal fallback');
    assert.equal(twist0.name, 'Scheme Twist');
    assert.equal(twist0.imageUrl, '', 'tier-3 literal empty imageUrl');
  });
});

describe('buildCardDisplayData — WP-172 Villain-Deck Bystanders (D-1412)', () => {
  it('tier-1 slug-match beats positional `bystanders[0]` (Set B at index 1)', () => {
    // why: the load-bearing regression-guard for the slug-match-vs-position
    // rule. Set B's `bystanders[0]` is `comic-shop-keeper`; the generic
    // `slug === 'bystander'` entry sits at index 1. A naive
    // `bystanders[0]` read would surface 'Comic Shop Keeper' — the test
    // asserts the slug-match wins.
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'testset-named/test-scheme-b',
      mastermindId: 'core/dr-doom',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const bystander0 = result['bystander-villain-deck-00'];
    assert.ok(bystander0, 'bystander-villain-deck-00 must be present');
    assert.equal(
      bystander0.name,
      'Test Bystander B',
      'slug-match must win (NOT "Comic Shop Keeper")',
    );
    assert.equal(
      bystander0.imageUrl,
      'b-generic.webp',
      'imageUrl from the slug-matched entry, NOT bystanders[0]',
    );
  });

  it('tier-2 (named-character fallback): Set C produces named-only art', () => {
    // why: mirrors the cvwr / ssw2 / xmen real-set cases — no
    // `slug === 'bystander'` entry; bystanders[0] is the only choice.
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'testset-orphan/test-scheme-c',
      mastermindId: 'core/dr-doom',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const bystander0 = result['bystander-villain-deck-00'];
    assert.ok(bystander0, 'bystander-villain-deck-00 must be present');
    assert.equal(bystander0.name, 'Alligator Trapper');
    assert.equal(bystander0.imageUrl, 'c.webp');
  });

  it('tier-3 (literal fallback for empty bystanders): Set D yields literals', () => {
    // why: mirrors the dstr real-set case — empty bystanders array.
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'testset-empty-bystanders/test-scheme-d',
      mastermindId: 'core/dr-doom',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const bystander0 = result['bystander-villain-deck-00'];
    assert.ok(bystander0, 'tier-3 emits bystander-villain-deck-00');
    assert.equal(bystander0.name, 'Bystander');
    assert.equal(bystander0.imageUrl, '');
  });

  it('explicit count 2: Set A midtown-bombing emits exactly 2 entries', () => {
    const registry = buildFixtureRegistry();
    const config = buildFixtureConfig();

    const result = buildCardDisplayData(registry, config, 5);

    assert.ok(result['bystander-villain-deck-00']);
    assert.ok(result['bystander-villain-deck-01']);
    assert.equal(
      result['bystander-villain-deck-02'],
      undefined,
      'explicit count 2 — no -02 entry (numPlayers=5 must be ignored)',
    );
  });

  it('numPlayers fallback: scheme without explicit count uses numPlayers', () => {
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'core/legacy-virus-the',
      mastermindId: 'core/dr-doom',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 3);

    assert.ok(result['bystander-villain-deck-00']);
    assert.ok(result['bystander-villain-deck-01']);
    assert.ok(result['bystander-villain-deck-02']);
    assert.equal(
      result['bystander-villain-deck-03'],
      undefined,
      'numPlayers=3 — no -03 entry',
    );
  });
});

describe('buildCardDisplayData — WP-172 defensive parsing (`typeof` guards)', () => {
  it('skips null / primitive / missing-field `other[]` entries; first well-formed wins', () => {
    // why: EC-190 §Locked Values defensive-read requirement —
    // `other[]: [null, { missing imageUrl }, 'string', { OK }]` resolves
    // to the 4th entry. Proves the `typeof entry === 'object' && entry !== null`
    // gate AND the `typeof === 'string'` field guards work.
    const registry = buildFixtureRegistry();
    const config: MatchSetupConfig = {
      schemeId: 'core/midtown-bombing',
      mastermindId: 'testset-defensive/test-mastermind-defensive',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const result = buildCardDisplayData(registry, config, 2);

    const strike0 = result['master-strike-00'];
    assert.ok(strike0, 'defensive parsing still emits strike-00');
    assert.equal(
      strike0.name,
      'Defensive OK',
      'first well-formed entry wins after malformed ones are skipped',
    );
    assert.equal(strike0.imageUrl, 'defensive-ok.webp');
  });
});

describe('buildCardDisplayData — WP-172 cross-builder superset invariant (D-17201)', () => {
  it('Object.keys(displayMap) ⊇ [...villainDeck.deck, ...villainDeck.discard]', () => {
    // why: the load-bearing test — would have caught the original WP-168
    // gap that motivated WP-172. Runs both builders on the SAME config /
    // registry / numPlayers and asserts every ext_id that `buildVillainDeck`
    // emits has a display entry. Indirectly proves grammar byte-identity
    // for all four villain-deck grammars (villain copies / master strikes
    // / scheme twists / villain-deck bystanders); drift in any grammar
    // would produce a missing ext_id and fail this superset assertion.
    const registry = buildFixtureRegistry();
    // why: use a config that exercises ALL four grammars. The base
    // `buildFixtureConfig` covers villains (magneto + blob) and the
    // existing henchman group; we additionally need the scheme to
    // produce twists and bystanders, and the mastermind for strikes.
    const config = buildFixtureConfig();
    const numPlayers = 2;

    const displayData = buildCardDisplayData(registry, config, numPlayers);
    const villainDeckResult = buildVillainDeck(
      config,
      registry,
      makeMockCtx({ numPlayers }),
    );

    const allBuilderExtIds = [
      ...villainDeckResult.state.deck,
      ...villainDeckResult.state.discard,
    ];
    const displayKeys = new Set(Object.keys(displayData));
    const missingFromDisplay = allBuilderExtIds.filter(
      (extId) => !displayKeys.has(extId),
    );

    assert.deepStrictEqual(
      missingFromDisplay,
      [],
      `Display-Coverage Invariant (D-17201) violated — buildVillainDeck emitted ext_ids missing from G.cardDisplayData: ${missingFromDisplay.join(', ')}. The most likely cause is grammar drift in one of the four villain-deck sections of buildCardDisplayData.ts; re-verify byte-identity against villainDeck.setup.ts lines 203 (villain), 247 (scheme-twist), 266 (bystander), 279 (master-strike).`,
    );
  });
});
