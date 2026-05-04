/**
 * Unit tests for buildHeroDeck (WP-135 / EC-138).
 *
 * Locks the rarity → copy-count map (D-13501; 5/3/3/3 = 14 cards per
 * hero), the slash-format hero card-instance ext_id (D-13502), the
 * single-shuffle determinism envelope, the soft-skip on incomplete
 * RegistryReader, and the Option A loud-fail throw on unknown
 * rarityLabel. Pure node:test + node:assert; no boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeroDeck,
  buildHeroDeckCards,
  shuffleHeroDeck,
  type RegistryReader,
} from './buildHeroDeck.js';
import { makeMockCtx } from '../test/mockCtx.js';

// ---------------------------------------------------------------------------
// Mock registry helpers
// ---------------------------------------------------------------------------

interface MockHeroCard {
  slug: string;
  rarityLabel: string;
}

interface MockHero {
  slug: string;
  cards: MockHeroCard[];
}

interface MockSetData {
  abbr: string;
  heroes: MockHero[];
}

/**
 * Builds a registry that satisfies RegistryReader and returns the supplied
 * setData when getSet is called with the matching abbr; undefined otherwise.
 */
function buildMockRegistry(setAbbr: string, heroes: MockHero[]): RegistryReader {
  const setData: MockSetData = { abbr: setAbbr, heroes };
  return {
    getSet: (abbr: string) => (abbr === setAbbr ? setData : undefined),
  };
}

/**
 * Builds a hero with the canonical four-label rarity set: one card per
 * label, slugs distinct.
 */
function buildCompliantHero(slug: string): MockHero {
  return {
    slug,
    cards: [
      { slug: `${slug}-card-c1`, rarityLabel: 'Common 1' },
      { slug: `${slug}-card-c2`, rarityLabel: 'Common 2' },
      { slug: `${slug}-card-uncommon`, rarityLabel: 'Uncommon' },
      { slug: `${slug}-card-rare`, rarityLabel: 'Rare' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildHeroDeckCards — D-13501 rarity map (5/3/3/3 = 14 per hero)', () => {
  it('emits exactly 14 cards per hero across the four-label rarity set', () => {
    const hero = buildCompliantHero('test-hero');
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/test-hero'], registry);

    assert.equal(
      cards.length,
      14,
      'A single hero with the four-label rarity set must produce 14 cards (5+3+3+3)',
    );
  });

  it('emits 5 copies for Common 1, 3 each for Common 2 / Uncommon / Rare', () => {
    const hero = buildCompliantHero('test-hero');
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/test-hero'], registry);

    const counts: Record<string, number> = {};
    for (const card of cards) {
      counts[card] = (counts[card] ?? 0) + 1;
    }
    assert.equal(counts['core/test-hero/test-hero-card-c1'], 5, 'Common 1 must produce 5 copies');
    assert.equal(counts['core/test-hero/test-hero-card-c2'], 3, 'Common 2 must produce 3 copies');
    assert.equal(counts['core/test-hero/test-hero-card-uncommon'], 3, 'Uncommon must produce 3 copies');
    assert.equal(counts['core/test-hero/test-hero-card-rare'], 3, 'Rare must produce 3 copies');
  });

  it('total cards = 14 × heroDeckIds.length for multi-hero loadouts', () => {
    const heroes = [
      buildCompliantHero('hero-a'),
      buildCompliantHero('hero-b'),
      buildCompliantHero('hero-c'),
    ];
    const registry = buildMockRegistry('core', heroes);

    const cards = buildHeroDeckCards(
      ['core/hero-a', 'core/hero-b', 'core/hero-c'],
      registry,
    );

    assert.equal(
      cards.length,
      42,
      'Three heroes must produce 14 × 3 = 42 cards',
    );
  });
});

describe('buildHeroDeckCards — D-13502 ext_id format', () => {
  it('emits ext_ids in the locked <setAbbr>/<heroSlug>/<cardSlug> format', () => {
    const hero: MockHero = {
      slug: 'spider-man',
      cards: [{ slug: 'astonishing-strength', rarityLabel: 'Common 1' }],
    };
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/spider-man'], registry);

    assert.equal(cards.length, 5, 'Common 1 must produce 5 copies');
    for (const card of cards) {
      assert.equal(
        card,
        'core/spider-man/astonishing-strength',
        'ext_id must follow <setAbbr>/<heroSlug>/<cardSlug> format with slash separators',
      );
    }
  });

  it('every emitted ext_id has exactly two slash separators', () => {
    const hero = buildCompliantHero('hero-x');
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/hero-x'], registry);

    for (const card of cards) {
      const slashCount = (card.match(/\//g) ?? []).length;
      assert.equal(
        slashCount,
        2,
        `ext_id '${card}' must have exactly two slash separators`,
      );
    }
  });
});

describe('buildHeroDeckCards — D-13501 Option A loud-fail on unknown rarityLabel', () => {
  it('throws on rarityLabel "Common 3" with full-sentence Error naming hero / label / supported set', () => {
    const hero: MockHero = {
      slug: 'ant-man',
      cards: [{ slug: 'shrink', rarityLabel: 'Common 3' }],
    };
    const registry = buildMockRegistry('amwp', [hero]);

    assert.throws(
      () => buildHeroDeckCards(['amwp/ant-man'], registry),
      (error: unknown): error is Error => {
        if (!(error instanceof Error)) return false;
        const message = error.message;
        // Hero ext_id named in the message
        if (!message.includes('amwp/ant-man')) return false;
        // Card slug named
        if (!message.includes('shrink')) return false;
        // Unrecognized label named
        if (!message.includes('Common 3')) return false;
        // All four supported labels named
        if (!message.includes('Common 1')) return false;
        if (!message.includes('Common 2')) return false;
        if (!message.includes('Uncommon')) return false;
        if (!message.includes('Rare')) return false;
        return true;
      },
      'buildHeroDeckCards must throw a full-sentence Error naming the offending hero, the unrecognized label, and the supported four-label set',
    );
  });

  it('throws on rarityLabel "Uncommon 2" for any hero that uses it', () => {
    const hero: MockHero = {
      slug: 'wasp',
      cards: [
        { slug: 'sting', rarityLabel: 'Common 1' },
        { slug: 'fly', rarityLabel: 'Uncommon 2' },
      ],
    };
    const registry = buildMockRegistry('amwp', [hero]);

    assert.throws(
      () => buildHeroDeckCards(['amwp/wasp'], registry),
      /Uncommon 2/,
      'buildHeroDeckCards must throw when any card carries an unrecognized rarityLabel like "Uncommon 2"',
    );
  });

  it('throws on the first unrecognized rarityLabel encountered (does not silently skip the hero)', () => {
    const hero: MockHero = {
      slug: 'jentorra',
      cards: [
        { slug: 'first-card', rarityLabel: 'Common 1' },
        { slug: 'oddball-card', rarityLabel: 'Common 3' },
      ],
    };
    const registry = buildMockRegistry('amwp', [hero]);

    assert.throws(
      () => buildHeroDeckCards(['amwp/jentorra'], registry),
      /Common 3/,
    );
  });
});

describe('buildHeroDeckCards — registry walk edge cases', () => {
  it('returns empty array when heroDeckIds is empty', () => {
    const registry = buildMockRegistry('core', [buildCompliantHero('hero-a')]);
    const cards = buildHeroDeckCards([], registry);
    assert.deepStrictEqual(cards, []);
  });

  it('soft-skips a heroDeckId whose set is not loaded (returns undefined from getSet)', () => {
    const registry = buildMockRegistry('core', [buildCompliantHero('hero-a')]);
    const cards = buildHeroDeckCards(['unknown-set/hero-a'], registry);
    assert.deepStrictEqual(cards, [], 'Missing set must not throw — soft-skip per sibling pattern');
  });

  it('soft-skips a heroDeckId whose hero is not present in the named set', () => {
    const registry = buildMockRegistry('core', [buildCompliantHero('hero-a')]);
    const cards = buildHeroDeckCards(['core/missing-hero'], registry);
    assert.deepStrictEqual(cards, []);
  });

  it('soft-skips a malformed qualified ID (no slash, empty parts, etc.)', () => {
    const registry = buildMockRegistry('core', [buildCompliantHero('hero-a')]);
    const cards = buildHeroDeckCards(['no-slash-here'], registry);
    assert.deepStrictEqual(cards, []);
  });

  it('preserves heroDeckIds order — heroes contribute cards in the order they appear in the input', () => {
    const heroes = [
      buildCompliantHero('hero-a'),
      buildCompliantHero('hero-b'),
    ];
    const registry = buildMockRegistry('core', heroes);

    const cards = buildHeroDeckCards(['core/hero-b', 'core/hero-a'], registry);

    // First 14 must be hero-b cards; next 14 must be hero-a cards.
    for (let i = 0; i < 14; i++) {
      assert.ok(
        cards[i]!.startsWith('core/hero-b/'),
        `Card ${i} must come from hero-b (input order)`,
      );
    }
    for (let i = 14; i < 28; i++) {
      assert.ok(
        cards[i]!.startsWith('core/hero-a/'),
        `Card ${i} must come from hero-a (input order)`,
      );
    }
  });

  it('preserves card order — Common 1 copies appear before Common 2 / Uncommon / Rare copies', () => {
    const hero = buildCompliantHero('hero-a');
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/hero-a'], registry);

    // Card-array iteration order is preserved (cards[] order in the registry),
    // and within each card the rarity-driven copies append contiguously.
    const firstSlug = cards[0]!;
    const lastSlug = cards[cards.length - 1]!;
    assert.equal(
      firstSlug,
      'core/hero-a/hero-a-card-c1',
      'First card must be the Common 1 (registry cards[0]) copy',
    );
    assert.equal(
      lastSlug,
      'core/hero-a/hero-a-card-rare',
      'Last card must be the Rare (registry cards[3]) copy',
    );
  });
});

describe('shuffleHeroDeck — single ctx.random.Shuffle call site', () => {
  it('returns a new array (does not mutate the input)', () => {
    const input = ['core/hero-a/c1', 'core/hero-a/c2', 'core/hero-a/c3', 'core/hero-a/c4'];
    const snapshot = [...input];
    const context = makeMockCtx();

    const shuffled = shuffleHeroDeck(input, context);

    assert.notEqual(shuffled, input, 'shuffleHeroDeck must return a new array reference');
    assert.deepStrictEqual(input, snapshot, 'Input array must be unchanged after shuffle');
  });

  it('preserves the multiset (all and only the same cards, possibly in different order)', () => {
    const input = ['core/hero-a/c1', 'core/hero-a/c2', 'core/hero-a/c3'];
    const context = makeMockCtx();

    const shuffled = shuffleHeroDeck(input, context);

    assert.equal(shuffled.length, input.length);
    for (const card of input) {
      assert.equal(
        shuffled.filter((c) => c === card).length,
        input.filter((c) => c === card).length,
        `Card '${card}' count must be preserved`,
      );
    }
  });
});

describe('buildHeroDeck — canonical entry point', () => {
  it('soft-skips when registry does not satisfy RegistryReader (narrow test mock)', () => {
    const narrowRegistry = { listCards: () => [] };
    const context = makeMockCtx();

    const result = buildHeroDeck(['core/hero-a'], narrowRegistry, context);

    assert.deepStrictEqual(result, [], 'Narrow registry must produce an empty hero deck');
  });

  it('builds the full reservoir for a real-shape registry — 1 hero × 14 cards', () => {
    const hero = buildCompliantHero('hero-a');
    const registry = buildMockRegistry('core', [hero]);
    const context = makeMockCtx();

    const result = buildHeroDeck(['core/hero-a'], registry, context);

    assert.equal(result.length, 14, 'One hero with the four-label rarity set must produce 14 cards');
  });

  it('JSON.stringify(result) succeeds (CardExtId-strings-only invariant)', () => {
    const hero = buildCompliantHero('hero-a');
    const registry = buildMockRegistry('core', [hero]);
    const context = makeMockCtx();

    const result = buildHeroDeck(['core/hero-a'], registry, context);

    const serialized = JSON.stringify(result);
    assert.ok(serialized);
    const parsed = JSON.parse(serialized) as unknown;
    assert.deepStrictEqual(parsed, result, 'Serialization round-trip must preserve content');
  });

  it('determinism — two calls with the same inputs produce identical output (same shuffle seed)', () => {
    const hero = buildCompliantHero('hero-a');
    const registry = buildMockRegistry('core', [hero]);

    // why: makeMockCtx reverses arrays — using two fresh contexts produces
    // identical shuffles because the mock is stateless.
    const firstResult = buildHeroDeck(['core/hero-a'], registry, makeMockCtx());
    const secondResult = buildHeroDeck(['core/hero-a'], registry, makeMockCtx());

    assert.deepStrictEqual(
      firstResult,
      secondResult,
      'Identical inputs must produce identical hero deck shuffles',
    );
  });

  it('throws (Option A loud-fail) when any hero card carries an unrecognized rarityLabel', () => {
    const hero: MockHero = {
      slug: 'ant-man',
      cards: [{ slug: 'shrink', rarityLabel: 'Common 3' }],
    };
    const registry = buildMockRegistry('amwp', [hero]);
    const context = makeMockCtx();

    assert.throws(
      () => buildHeroDeck(['amwp/ant-man'], registry, context),
      /Common 3/,
      'buildHeroDeck must propagate the buildHeroDeckCards throw on unknown rarityLabel',
    );
  });
});
