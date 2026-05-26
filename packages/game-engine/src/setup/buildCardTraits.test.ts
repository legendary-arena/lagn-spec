/**
 * Unit tests for buildCardTraits — card trait resolution at setup time.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardTraits } from './buildCardTraits.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardExtId } from '../state/zones.types.js';

function makeConfig(heroDeckIds: string[]): MatchSetupConfig {
  return {
    schemeId: 'core/test-scheme',
    mastermindId: 'core/test-mm',
    villainGroupIds: ['core/v'],
    henchmanGroupIds: ['core/h'],
    heroDeckIds,
    bystandersCount: 1,
    woundsCount: 1,
    officersCount: 1,
    sidekicksCount: 1,
  };
}

function makeRegistry(heroes: Array<{
  slug: string;
  team?: string;
  cards: Array<{ slug: string; hc?: string }>;
  physicalCards?: Array<{ count: number; sides: string[] }>;
}>) {
  return {
    listSets: () => [{ abbr: 'core' }],
    getSet: (abbr: string) => abbr === 'core' ? { heroes } : undefined,
  };
}

describe('buildCardTraits', () => {
  it('produces correct CardTraitEntry for a hero card with hc and team', () => {
    const registry = makeRegistry([
      {
        slug: 'black-widow',
        team: 'avengers',
        cards: [{ slug: 'mission-accomplished', hc: 'covert' }],
        physicalCards: [{ count: 5, sides: ['mission-accomplished'] }],
      },
    ]);
    const config = makeConfig(['core/black-widow']);
    const traits = buildCardTraits(registry, config);

    const entry = traits['core/black-widow/mission-accomplished#0' as CardExtId];
    assert.ok(entry !== undefined, 'entry must exist');
    assert.equal(entry.heroClass, 'covert');
    assert.equal(entry.team, 'avengers');
  });

  it('non-hero cards (when no hero matches) produce empty result', () => {
    const registry = makeRegistry([]);
    const config = makeConfig(['core/nonexistent']);
    const traits = buildCardTraits(registry, config);

    assert.deepStrictEqual(traits, {});
  });

  it('copy-suffix fan-out: each copy gets its own entry', () => {
    const registry = makeRegistry([
      {
        slug: 'iron-man',
        team: 'avengers',
        cards: [{ slug: 'repulsor-ray', hc: 'tech' }],
        physicalCards: [{ count: 3, sides: ['repulsor-ray'] }],
      },
    ]);
    const config = makeConfig(['core/iron-man']);
    const traits = buildCardTraits(registry, config);

    assert.ok(traits['core/iron-man/repulsor-ray#0' as CardExtId] !== undefined);
    assert.ok(traits['core/iron-man/repulsor-ray#1' as CardExtId] !== undefined);
    assert.ok(traits['core/iron-man/repulsor-ray#2' as CardExtId] !== undefined);
    assert.equal(traits['core/iron-man/repulsor-ray#0' as CardExtId]!.heroClass, 'tech');
    assert.equal(traits['core/iron-man/repulsor-ray#2' as CardExtId]!.team, 'avengers');
  });

  it('ID invariant: every id in a populated inPlay resolves to a defined CardTraitEntry', () => {
    const registry = makeRegistry([
      {
        slug: 'spider-man',
        team: 'spider-friends',
        cards: [
          { slug: 'web-shooters', hc: 'tech' },
          { slug: 'spider-sense', hc: 'instinct' },
        ],
        physicalCards: [
          { count: 5, sides: ['web-shooters'] },
          { count: 3, sides: ['spider-sense'] },
        ],
      },
    ]);
    const config = makeConfig(['core/spider-man']);
    const traits = buildCardTraits(registry, config);

    const simulatedInPlay: CardExtId[] = [
      'core/spider-man/web-shooters#0' as CardExtId,
      'core/spider-man/web-shooters#3' as CardExtId,
      'core/spider-man/spider-sense#1' as CardExtId,
    ];

    for (const id of simulatedInPlay) {
      assert.ok(
        traits[id] !== undefined,
        `ID invariant violated: ${id} has no CardTraitEntry`,
      );
    }
  });

  it('missing hc on a hero card produces heroClass: null', () => {
    const registry = makeRegistry([
      {
        slug: 'hulk',
        team: 'avengers',
        cards: [{ slug: 'smash' }],
        physicalCards: [{ count: 2, sides: ['smash'] }],
      },
    ]);
    const config = makeConfig(['core/hulk']);
    const traits = buildCardTraits(registry, config);

    const entry = traits['core/hulk/smash#0' as CardExtId];
    assert.ok(entry !== undefined);
    assert.equal(entry.heroClass, null);
    assert.equal(entry.team, 'avengers');
  });

  it('missing team on a hero group produces team: null', () => {
    const registry = makeRegistry([
      {
        slug: 'deadpool',
        cards: [{ slug: 'katana-rama', hc: 'covert' }],
        physicalCards: [{ count: 2, sides: ['katana-rama'] }],
      },
    ]);
    const config = makeConfig(['core/deadpool']);
    const traits = buildCardTraits(registry, config);

    const entry = traits['core/deadpool/katana-rama#0' as CardExtId];
    assert.ok(entry !== undefined);
    assert.equal(entry.heroClass, 'covert');
    assert.equal(entry.team, null);
  });

  it('normalization: uppercase hero class is lowercased', () => {
    const registry = makeRegistry([
      {
        slug: 'storm',
        team: 'X-Men',
        cards: [{ slug: 'lightning', hc: 'Ranged' }],
        physicalCards: [{ count: 1, sides: ['lightning'] }],
      },
    ]);
    const config = makeConfig(['core/storm']);
    const traits = buildCardTraits(registry, config);

    const entry = traits['core/storm/lightning#0' as CardExtId];
    assert.ok(entry !== undefined);
    assert.equal(entry.heroClass, 'ranged');
    assert.equal(entry.team, 'x-men');
  });

  it('normalization: whitespace-padded team is trimmed and lowercased', () => {
    const registry = makeRegistry([
      {
        slug: 'cap',
        team: '  Avengers  ',
        cards: [{ slug: 'shield-throw', hc: '  Strength ' }],
        physicalCards: [{ count: 1, sides: ['shield-throw'] }],
      },
    ]);
    const config = makeConfig(['core/cap']);
    const traits = buildCardTraits(registry, config);

    const entry = traits['core/cap/shield-throw#0' as CardExtId];
    assert.ok(entry !== undefined);
    assert.equal(entry.heroClass, 'strength');
    assert.equal(entry.team, 'avengers');
  });

  it('returns empty record when registry does not satisfy interface', () => {
    const registry = { listCards: () => [] };
    const config = makeConfig(['core/any']);
    const traits = buildCardTraits(registry, config);

    assert.deepStrictEqual(traits, {});
  });
});
