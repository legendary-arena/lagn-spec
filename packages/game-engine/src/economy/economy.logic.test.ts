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

describe('buildCardStats — WP-135 hero card-instance walk (slash-format ext_id)', () => {
  it('emits a stats entry per hero card instance keyed by <setAbbr>/<heroSlug>/<cardSlug>', () => {
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

    assert.ok(stats['core/spider-man/mission-accomplished'], 'Slash-format mission-accomplished entry must be present');
    assert.ok(stats['core/spider-man/astonishing-strength'], 'Slash-format astonishing-strength entry must be present');
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

    const missionStats = stats['core/spider-man/mission-accomplished']!;
    assert.equal(missionStats.cost, 2);
    assert.equal(missionStats.attack, 0, 'null attack parses to 0');
    assert.equal(missionStats.recruit, 2);
    assert.equal(missionStats.fightCost, 0, 'Heroes are never fought; fightCost is always 0');

    const astonishStats = stats['core/spider-man/astonishing-strength']!;
    assert.equal(astonishStats.cost, 6);
    assert.equal(astonishStats.attack, 4);
    assert.equal(astonishStats.recruit, 0, 'null recruit parses to 0');
    assert.equal(astonishStats.fightCost, 0);
  });
});
