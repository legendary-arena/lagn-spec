/**
 * Unit tests for economy logic helpers.
 *
 * Tests parseCardStatValue, addResources, and resetTurnEconomy.
 * Uses node:test and node:assert only. No boardgame.io imports.
 *
 * @amended WP-113 PS-7 mid-execution amendment: added regression tests
 *   for `buildCardStats` qualified-ID parsing (per D-10014). The
 *   mid-execution spec gap was that
 *   `buildCardStats` consumed bare slugs from `MatchSetupConfig`, which
 *   would silently produce empty stats once the WP-113 qualified-ID
 *   contract landed. The regression suite below locks the PS-7 fix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCardStatValue,
  addResources,
  resetTurnEconomy,
  buildCardStats,
} from './economy.logic.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';

describe('parseCardStatValue', () => {
  it('"2+" returns 2', () => {
    assert.strictEqual(parseCardStatValue('2+'), 2);
  });

  it('"0+" returns 0', () => {
    assert.strictEqual(parseCardStatValue('0+'), 0);
  });

  it('null returns 0', () => {
    assert.strictEqual(parseCardStatValue(null), 0);
  });

  it('"2*" returns 2', () => {
    assert.strictEqual(parseCardStatValue('2*'), 2);
  });

  it('integer 3 returns 3', () => {
    assert.strictEqual(parseCardStatValue(3), 3);
  });

  it('"garbage" returns 0', () => {
    assert.strictEqual(parseCardStatValue('garbage'), 0);
  });
});

describe('addResources', () => {
  it('returns new object with correct totals', () => {
    const before = { attack: 1, recruit: 2, spentAttack: 0, spentRecruit: 0 };
    const after = addResources(before, 3, 4);

    assert.strictEqual(after.attack, 4);
    assert.strictEqual(after.recruit, 6);
    assert.strictEqual(after.spentAttack, 0);
    assert.strictEqual(after.spentRecruit, 0);

    // Verify new object returned (input not mutated)
    assert.notStrictEqual(after, before);
    assert.strictEqual(before.attack, 1);
    assert.strictEqual(before.recruit, 2);
  });
});

describe('resetTurnEconomy', () => {
  it('returns all zeros', () => {
    const economy = resetTurnEconomy();

    assert.strictEqual(economy.attack, 0);
    assert.strictEqual(economy.recruit, 0);
    assert.strictEqual(economy.spentAttack, 0);
    assert.strictEqual(economy.spentRecruit, 0);
  });
});

// ===========================================================================
// WP-113 PS-7 mid-execution amendment — buildCardStats qualified-ID tests.
// ===========================================================================

/**
 * Builds a fixture registry exposing the heroes / villains / henchmen
 * that buildCardStats reads. Includes a cross-set collision pair
 * (`black-widow` in both `core` and `wwhk`) so the named-set filter
 * can be exercised.
 */
function buildBuildCardStatsFixture() {
  const coreSetData = {
    abbr: 'core',
    villains: [
      {
        slug: 'brotherhood',
        cards: [
          { slug: 'magneto', vAttack: '6' },
          { slug: 'mystique', vAttack: '4' },
        ],
      },
    ],
    henchmen: [{ slug: 'doombot-legion', vAttack: '3' }],
  };
  const wwhkSetData = {
    abbr: 'wwhk',
    villains: [
      {
        slug: 'brotherhood',
        cards: [{ slug: 'wwhk-magneto', vAttack: '8' }],
      },
    ],
    henchmen: [{ slug: 'wwhk-henchman', vAttack: '5' }],
  };

  return {
    listCards: () => [
      { key: 'core-hero-black-widow-1', cardType: 'hero', slug: '1', setAbbr: 'core', attack: '2', recruit: null, cost: 2 },
      { key: 'wwhk-hero-black-widow-1', cardType: 'hero', slug: '1', setAbbr: 'wwhk', attack: '4', recruit: null, cost: 5 },
      { key: 'core-villain-brotherhood-magneto', cardType: 'villain', slug: 'magneto', setAbbr: 'core' },
      { key: 'core-villain-brotherhood-mystique', cardType: 'villain', slug: 'mystique', setAbbr: 'core' },
      { key: 'wwhk-villain-brotherhood-wwhk-magneto', cardType: 'villain', slug: 'wwhk-magneto', setAbbr: 'wwhk' },
    ],
    listSets: () => [{ abbr: 'core' }, { abbr: 'wwhk' }],
    getSet: (abbr: string) => {
      if (abbr === 'core') return coreSetData;
      if (abbr === 'wwhk') return wwhkSetData;
      return undefined;
    },
  };
}

function buildBuildCardStatsConfig(overrides?: Partial<MatchSetupConfig>): MatchSetupConfig {
  return {
    schemeId: 'core/some-scheme',
    mastermindId: 'core/some-mastermind',
    villainGroupIds: ['core/brotherhood'],
    henchmanGroupIds: ['core/doombot-legion'],
    heroDeckIds: ['core/black-widow'],
    bystandersCount: 5,
    woundsCount: 5,
    officersCount: 5,
    sidekicksCount: 5,
    ...overrides,
  };
}

describe('buildCardStats — qualified ID parsing (WP-113 PS-7 amendment)', () => {
  it('populates stats for set-qualified hero / villain / henchman IDs', () => {
    const registry = buildBuildCardStatsFixture();
    const config = buildBuildCardStatsConfig();

    const stats = buildCardStats(registry, config);

    assert.ok(stats['core-hero-black-widow-1'], 'core/black-widow hero stat must be present');
    assert.ok(stats['core-villain-brotherhood-magneto'], 'core/brotherhood magneto villain stat must be present');
    assert.ok(stats['core-villain-brotherhood-mystique'], 'core/brotherhood mystique villain stat must be present');
    assert.ok(stats['henchman-doombot-legion-00'], 'henchman virtual copy 00 must be present');
    assert.ok(stats['henchman-doombot-legion-09'], 'henchman virtual copy 09 must be present');
  });

  it('produces no stats when given bare-slug IDs (silent-skip — validator is the format-error reporter)', () => {
    const registry = buildBuildCardStatsFixture();
    const config = buildBuildCardStatsConfig({
      heroDeckIds: ['black-widow'],
      villainGroupIds: ['brotherhood'],
      henchmanGroupIds: ['doombot-legion'],
    });

    const stats = buildCardStats(registry, config);

    assert.equal(
      stats['core-hero-black-widow-1'],
      undefined,
      'Bare-slug hero must not match any FlatCard via the qualified-ID filter',
    );
    assert.equal(
      stats['core-villain-brotherhood-magneto'],
      undefined,
      'Bare-slug villain group must not match any FlatCard via the qualified-ID filter',
    );
    assert.equal(
      stats['henchman-doombot-legion-00'],
      undefined,
      'Bare-slug henchman group must not produce virtual copies via the qualified-ID filter',
    );
  });

  it('filters by setAbbr first to avoid cross-set hero-slug collisions', () => {
    const registry = buildBuildCardStatsFixture();
    // why: `black-widow` exists in BOTH `core` and `wwhk`. Choosing
    // `wwhk/black-widow` must populate ONLY the wwhk hero stat, never
    // the core one. Pre-amendment behaviour silently matched both
    // (or arbitrarily one) because slug semantics were ambiguous.
    const config = buildBuildCardStatsConfig({
      heroDeckIds: ['wwhk/black-widow'],
      villainGroupIds: ['wwhk/brotherhood'],
      henchmanGroupIds: ['wwhk/wwhk-henchman'],
    });

    const stats = buildCardStats(registry, config);

    assert.ok(stats['wwhk-hero-black-widow-1'], 'wwhk hero stat must be present');
    assert.equal(
      stats['core-hero-black-widow-1'],
      undefined,
      'core hero stat must NOT be present when wwhk/black-widow was chosen — cross-set filter is mandatory',
    );
    assert.ok(
      stats['wwhk-villain-brotherhood-wwhk-magneto'],
      'wwhk villain stat must be present',
    );
    assert.equal(
      stats['core-villain-brotherhood-magneto'],
      undefined,
      'core villain stat must NOT be present when wwhk/brotherhood was chosen',
    );
  });
});

// ===========================================================================
// WP-135 — buildCardStats hero card-instance walk (slash-format ext_id)
// ===========================================================================

/**
 * Builds a fixture registry with a hero `cards: []` array exposing the
 * per-card slug + cost / attack / recruit fields. Drives the WP-135
 * hero card-instance walk that emits slash-format ext_id entries
 * (D-13502) into G.cardStats.
 */
function buildHeroCardInstanceFixture() {
  const setData = {
    abbr: 'core',
    villains: [],
    henchmen: [],
    heroes: [
      {
        slug: 'spider-man',
        cards: [
          { slug: 'mission-accomplished', rarityLabel: 'Common 1', cost: 2, attack: null, recruit: '2' },
          { slug: 'astonishing-strength', rarityLabel: 'Rare', cost: 6, attack: '4', recruit: null },
        ],
      },
    ],
  };
  return {
    listCards: () => [],
    listSets: () => [{ abbr: 'core' }],
    getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
  };
}

describe('buildCardStats — WP-135 / WP-137 hero card-instance walk (slash-format ext_id with #copyIndex)', () => {
  it('emits one stats entry per copy keyed by <setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>', () => {
    const registry = buildHeroCardInstanceFixture();
    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/spider-man'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const stats = buildCardStats(registry, config);

    // why: WP-137 D-13702 — fan-out per copy. Common 1 emits 5 copies
    // (#0-#4); Rare emits 3 copies (#0-#2). Each per-copy ext_id is its
    // own key in G.cardStats.
    for (let copyIndex = 0; copyIndex < 5; copyIndex++) {
      assert.ok(
        stats[`core/spider-man/mission-accomplished#${copyIndex}`],
        `Slash-format mission-accomplished#${copyIndex} entry must be present`,
      );
    }
    for (let copyIndex = 0; copyIndex < 3; copyIndex++) {
      assert.ok(
        stats[`core/spider-man/astonishing-strength#${copyIndex}`],
        `Slash-format astonishing-strength#${copyIndex} entry must be present`,
      );
    }
  });

  it('parses cost / attack / recruit into the locked CardStatEntry shape (fightCost is always 0 for heroes)', () => {
    const registry = buildHeroCardInstanceFixture();
    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/spider-man'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const stats = buildCardStats(registry, config);

    // why: WP-137 D-13702 — assert numerics on the first copy of each
    // card; per-copy parity is enforced separately (see WP-137-appended
    // tests in this file).
    const missionStats = stats['core/spider-man/mission-accomplished#0']!;
    assert.equal(missionStats.cost, 2);
    assert.equal(missionStats.attack, 0, 'null attack parses to 0');
    assert.equal(missionStats.recruit, 2);
    assert.equal(missionStats.fightCost, 0, 'Heroes are never fought; fightCost is always 0');

    const astonishStats = stats['core/spider-man/astonishing-strength#0']!;
    assert.equal(astonishStats.cost, 6);
    assert.equal(astonishStats.attack, 4);
    assert.equal(astonishStats.recruit, 0, 'null recruit parses to 0');
    assert.equal(astonishStats.fightCost, 0);
  });

  // why: WP-137 D-13702 — per-copy parity. Every #N entry must carry
  // identical numerics; divergence between copies indicates a fan-out
  // bug. Extends the prior single-key assertion to the full per-copy
  // key set. Appended as test() inside the existing describe() block
  // for suite delta +0 (per RS-3).
  it('per-copy parity: every #N stats entry carries identical numerics across copies', () => {
    const registry = buildHeroCardInstanceFixture();
    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/spider-man'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const stats = buildCardStats(registry, config);

    // Common 1: 5 copies must all share { cost:2, attack:0, recruit:2, fightCost:0 }.
    for (let copyIndex = 0; copyIndex < 5; copyIndex++) {
      const entry = stats[`core/spider-man/mission-accomplished#${copyIndex}`]!;
      assert.equal(entry.cost, 2, `mission-accomplished#${copyIndex} cost parity`);
      assert.equal(entry.attack, 0, `mission-accomplished#${copyIndex} attack parity`);
      assert.equal(entry.recruit, 2, `mission-accomplished#${copyIndex} recruit parity`);
      assert.equal(entry.fightCost, 0, `mission-accomplished#${copyIndex} fightCost parity`);
    }

    // Rare: 3 copies must all share { cost:6, attack:4, recruit:0, fightCost:0 }.
    for (let copyIndex = 0; copyIndex < 3; copyIndex++) {
      const entry = stats[`core/spider-man/astonishing-strength#${copyIndex}`]!;
      assert.equal(entry.cost, 6, `astonishing-strength#${copyIndex} cost parity`);
      assert.equal(entry.attack, 4, `astonishing-strength#${copyIndex} attack parity`);
      assert.equal(entry.recruit, 0, `astonishing-strength#${copyIndex} recruit parity`);
      assert.equal(entry.fightCost, 0, `astonishing-strength#${copyIndex} fightCost parity`);
    }
  });

  it('G.cardStats keys form a superset of the hero deck reservoir for the chosen heroDeckIds', () => {
    // why: WP-137 D-13702 — fan-out parity guard. Every CardExtId in
    // the unshuffled hero deck reservoir built by buildHeroDeckCards
    // must have a corresponding entry in G.cardStats. Divergence
    // (e.g., a fan-out site computing a different copyCount than the
    // canonical emitter) would surface here as a missing key.
    const registry = buildHeroCardInstanceFixture();
    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: ['core/spider-man'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const stats = buildCardStats(registry, config);

    // Common 1 (5) + Rare (3) = 8 expected slash-format keys.
    const expectedKeys: string[] = [];
    for (let i = 0; i < 5; i++) expectedKeys.push(`core/spider-man/mission-accomplished#${i}`);
    for (let i = 0; i < 3; i++) expectedKeys.push(`core/spider-man/astonishing-strength#${i}`);

    for (const key of expectedKeys) {
      assert.ok(stats[key], `cardStats must include reservoir key ${key} (fan-out parity)`);
    }
  });
});

// ===========================================================================
// D-14102 — physicalCards migration tests
// ===========================================================================

describe('buildCardStats — physicalCards (D-14102)', () => {
  it('split hero: cardStats entry count matches sum(physicalCards[].count)', () => {
    const setData = {
      abbr: 'bkwd',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'falcon-winter-soldier',
          cards: [
            { slug: 'attune', name: 'Attune', rarityLabel: 'Common 1', attack: 2, recruit: 0, cost: 2 },
            { slug: 'atone', name: 'Atone', rarityLabel: 'Common 1', attack: 0, recruit: 2, cost: 3 },
            { slug: 'solo-card', name: 'Solo Card', rarityLabel: 'Rare', attack: 4, recruit: 0, cost: 6 },
          ],
          physicalCards: [
            { id: 'p1', count: 5, sides: ['attune', 'atone'] },
            { id: 'p2', count: 1, sides: ['solo-card'] },
          ],
        },
      ],
    };

    const registry = {
      listCards: () => [],
      listSets: () => [],
      getSet: (abbr: string) => (abbr === 'bkwd' ? setData : undefined),
    };

    const config = {
      schemeId: 'bkwd/s',
      mastermindId: 'bkwd/mm',
      villainGroupIds: [] as string[],
      henchmanGroupIds: [] as string[],
      heroDeckIds: ['bkwd/falcon-winter-soldier'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const stats = buildCardStats(registry, config);

    // why: D-14102 — 5 copies of p1 (attune) + 1 copy of p2 (solo-card) = 6
    const slashKeys = Object.keys(stats).filter((k) => k.startsWith('bkwd/falcon-winter-soldier/'));
    assert.equal(slashKeys.length, 6, 'split hero: 5 attune + 1 solo-card = 6 cardStats entries');

    // why: stat values come from card entry for sides[0]
    const attuneEntry = stats['bkwd/falcon-winter-soldier/attune#0'];
    assert.ok(attuneEntry, 'attune#0 must exist');
    assert.equal(attuneEntry.attack, 2, 'attack from card entry for sides[0]');
    assert.equal(attuneEntry.cost, 2, 'cost from card entry for sides[0]');
  });

  it('falls back to rarity map when physicalCards is absent', () => {
    const setData = {
      abbr: 'core',
      villains: [],
      henchmen: [],
      masterminds: [],
      heroes: [
        {
          slug: 'test-hero',
          cards: [
            { slug: 'card-c1', name: 'Card C1', rarityLabel: 'Common 1', attack: 1, recruit: 0, cost: 2 },
            { slug: 'card-rare', name: 'Card Rare', rarityLabel: 'Rare', attack: 3, recruit: 0, cost: 5 },
          ],
        },
      ],
    };

    const registry = {
      listCards: () => [],
      listSets: () => [],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };

    const config = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: [] as string[],
      henchmanGroupIds: [] as string[],
      heroDeckIds: ['core/test-hero'],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    };

    const stats = buildCardStats(registry, config);

    // Common 1 (5) + Rare (3) = 8 via rarity fallback
    const slashKeys = Object.keys(stats).filter((k) => k.startsWith('core/test-hero/'));
    assert.equal(slashKeys.length, 8, 'fallback: 5 c1 + 3 rare = 8 entries');
  });
});
