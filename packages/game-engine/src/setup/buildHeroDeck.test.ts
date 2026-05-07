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
  buildCardCountsNameLookup,
  resolveHeroCardCopyCount,
  SUPPORTED_RARITY_LABELS,
  type RegistryReader,
} from './buildHeroDeck.js';
import { makeMockCtx } from '../test/mockCtx.js';

// ---------------------------------------------------------------------------
// Mock registry helpers
// ---------------------------------------------------------------------------

interface MockHeroCard {
  slug: string;
  rarityLabel: string;
  name?: string;
}

interface MockHero {
  slug: string;
  cards: MockHeroCard[];
  cardCounts?: Record<string, number> | null;
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

    // why: WP-137 D-13702 — each physical copy now carries a distinct
    // `#<copyIndex>` suffix; counting copies-per-card means counting
    // distinct ext_ids that share the same `<setAbbr>/<heroSlug>/<cardSlug>`
    // base prefix. The 5/3/3/3 split is preserved.
    const countsByBase: Record<string, number> = {};
    for (const card of cards) {
      const hashIndex = card.indexOf('#');
      const base = hashIndex === -1 ? card : card.slice(0, hashIndex);
      countsByBase[base] = (countsByBase[base] ?? 0) + 1;
    }
    assert.equal(countsByBase['core/test-hero/test-hero-card-c1'], 5, 'Common 1 must produce 5 copies');
    assert.equal(countsByBase['core/test-hero/test-hero-card-c2'], 3, 'Common 2 must produce 3 copies');
    assert.equal(countsByBase['core/test-hero/test-hero-card-uncommon'], 3, 'Uncommon must produce 3 copies');
    assert.equal(countsByBase['core/test-hero/test-hero-card-rare'], 3, 'Rare must produce 3 copies');
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

describe('buildHeroDeckCards — D-13502 ext_id format (extended by D-13702)', () => {
  it('emits ext_ids in the locked <setAbbr>/<heroSlug>/<cardSlug>#<copyIndex> format', () => {
    const hero: MockHero = {
      slug: 'spider-man',
      cards: [{ slug: 'astonishing-strength', rarityLabel: 'Common 1' }],
    };
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/spider-man'], registry);

    assert.equal(cards.length, 5, 'Common 1 must produce 5 copies');
    // why: WP-137 D-13702 — ext_id grammar extended with `#<copyIndex>`
    // suffix; copies are zero-indexed contiguous (#0 through #4 for
    // Common 1's 5-copy emission).
    for (let copyIndex = 0; copyIndex < cards.length; copyIndex++) {
      assert.equal(
        cards[copyIndex],
        `core/spider-man/astonishing-strength#${copyIndex}`,
        'ext_id must follow <setAbbr>/<heroSlug>/<cardSlug>#<copyIndex> format',
      );
    }
  });

  it('every emitted ext_id has exactly two slash separators and a single # suffix', () => {
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
      const hashCount = (card.match(/#/g) ?? []).length;
      assert.equal(
        hashCount,
        1,
        `ext_id '${card}' must have exactly one # separator (D-13702)`,
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
    // and within each card the per-copy `#<copyIndex>` emissions append
    // contiguously. First emission is Common 1 #0; last is Rare #2 (Rare
    // ships 3 copies, indexed 0..2 per D-13702).
    const firstSlug = cards[0]!;
    const lastSlug = cards[cards.length - 1]!;
    assert.equal(
      firstSlug,
      'core/hero-a/hero-a-card-c1#0',
      'First card must be the Common 1 (registry cards[0]) copy at #0',
    );
    assert.equal(
      lastSlug,
      'core/hero-a/hero-a-card-rare#2',
      'Last card must be the Rare (registry cards[3]) copy at #2',
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

// ===========================================================================
// WP-137 — cardCounts resolution + per-copy distinctness
// ===========================================================================

describe('buildHeroDeck — WP-137 cardCounts resolution + per-copy distinctness', () => {
  it('per-copy distinctness invariant: every emitted ext_id is unique within the reservoir', () => {
    // why: WP-137 D-13702 — every physical copy receives a distinct ext_id
    // via the `#<copyIndex>` suffix, so `new Set(out).size === out.length`.
    // This invariant is what the post-setup checkNoCardInMultipleZones
    // assertion needs to satisfy deterministically across all RNG seeds.
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
      new Set(cards).size,
      cards.length,
      'Per-copy distinctness invariant: every emitted ext_id must be unique',
    );
  });

  it('cardCounts authority: well-formed map overrides rarity-map default', () => {
    // why: WP-137 D-13701 — when cardCounts populates a positive integer
    // for a card display name, that value supersedes the rarity-map
    // default. Here the Common 1 card normally yields 5; cardCounts
    // bumps it to 7.
    const hero: MockHero = {
      slug: 'override-hero',
      cards: [
        { slug: 'overridden', rarityLabel: 'Common 1', name: 'Overridden Card' },
        { slug: 'normal', rarityLabel: 'Rare', name: 'Normal Card' },
      ],
      cardCounts: { 'Overridden Card': 7, 'Normal Card': 2 },
    };
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/override-hero'], registry);

    const overriddenCount = cards.filter((c) => c.startsWith('core/override-hero/overridden#')).length;
    const normalCount = cards.filter((c) => c.startsWith('core/override-hero/normal#')).length;
    assert.equal(overriddenCount, 7, 'cardCounts must override rarity-map: 7 copies, not 5');
    assert.equal(normalCount, 2, 'cardCounts must override rarity-map: 2 copies, not 3');
  });

  it('rarity-map fallback: cardCounts === null falls through to D-13501 rarity map', () => {
    // why: WP-137 D-13701 — when cardCounts is null, the resolution
    // cascade falls through to the locked D-13501 rarity-map defaults
    // (5/3/3/3 across the four-label set).
    const hero: MockHero = {
      ...buildCompliantHero('fallback-hero'),
      cardCounts: null,
    };
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/fallback-hero'], registry);

    assert.equal(cards.length, 14, 'Rarity-map fallback must yield 14 cards (5+3+3+3)');
  });

  it('orphan cardCounts entry ignored: keys not matching any cards[].name fall through silently', () => {
    // why: WP-137 D-13701 — cardCounts entries whose keys do not match
    // any cards[].name are silently dropped (the lookup returns undefined
    // and the caller falls through). The hero still emits its rarity-map
    // default since no card name matched.
    const hero: MockHero = {
      slug: 'orphan-hero',
      cards: [
        { slug: 'real-card', rarityLabel: 'Common 1', name: 'Real Card' },
      ],
      cardCounts: { 'Phantom Card That Does Not Exist': 99 },
    };
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/orphan-hero'], registry);

    assert.equal(
      cards.length,
      5,
      'Orphan cardCounts key must be ignored; rarity-map fallback yields 5 (Common 1)',
    );
  });

  it('missing card.name fallback: card without `name` falls through to rarity map', () => {
    // why: WP-137 D-13701 — HeroCardSchema.name is .optional() per the
    // registry schema; when a card lacks `name`, nameLookup.get(undefined)
    // yields undefined and the resolution falls through to the rarity-map
    // branch. Strict subset of the orphan-key case but exercised
    // explicitly because the absence is a different code path.
    const hero: MockHero = {
      slug: 'unnamed-hero',
      cards: [
        { slug: 'no-name-card', rarityLabel: 'Rare' },
      ],
      cardCounts: { 'Some Other Card': 42 },
    };
    const registry = buildMockRegistry('core', [hero]);

    const cards = buildHeroDeckCards(['core/unnamed-hero'], registry);

    assert.equal(cards.length, 3, 'Missing card.name must fall through to rarity map (Rare → 3)');
  });

  it('both-sources-fail throw: cardCounts has no entry AND rarityLabel is unrecognized → loud-fail', () => {
    // why: WP-137 D-13701 — softens D-13501 Option A. The throw now
    // fires only when BOTH copy-count sources fail simultaneously. The
    // error message must enumerate both attempted paths (the missing
    // card display name and the unrecognized rarity label).
    const hero: MockHero = {
      slug: 'broken-hero',
      cards: [
        { slug: 'broken-card', rarityLabel: 'Common 3', name: 'Broken Card' },
      ],
      cardCounts: { 'Some Other Card': 5 },
    };
    const registry = buildMockRegistry('amwp', [hero]);

    assert.throws(
      () => buildHeroDeckCards(['amwp/broken-hero'], registry),
      (error: unknown): error is Error => {
        if (!(error instanceof Error)) return false;
        const message = error.message;
        if (!message.includes('Broken Card')) return false;
        if (!message.includes('Common 3')) return false;
        if (!message.includes('Common 1')) return false;
        if (!message.includes('Rare')) return false;
        return true;
      },
      'Both-sources-fail throw must enumerate the missing card display name and the unrecognized rarity label alongside the supported set',
    );
  });

  it('rarity-map drift: RARITY_COPY_COUNT keys and SUPPORTED_RARITY_LABELS agree exactly', () => {
    // why: WP-137 — the RARITY_COPY_COUNT map literal and the
    // SUPPORTED_RARITY_LABELS array are the canonical sources of the
    // four-label rarity set. Drift between them would silently break
    // the loud-fail throw error message or the rarity-map fallback
    // coverage. The test exercises a single hero per rarity to confirm
    // that every supported label resolves through the rarity-map
    // branch and yields a positive integer copy count via the helper.
    const nameLookup = new Map<string, number>();
    for (const label of SUPPORTED_RARITY_LABELS) {
      const resolved = resolveHeroCardCopyCount({ rarityLabel: label }, nameLookup);
      assert.ok(
        resolved !== null,
        `Rarity-map drift: SUPPORTED_RARITY_LABELS includes '${label}' but resolveHeroCardCopyCount returned null for it`,
      );
      assert.equal(typeof resolved, 'number');
      assert.ok(resolved! >= 1, `Rarity '${label}' must resolve to a positive integer`);
    }
  });

  it('buildCardCountsNameLookup: rejects malformed values per the three-predicate gate', () => {
    // why: WP-137 D-13701 — a value is valid only when typeof === 'number'
    // AND Number.isInteger(v) AND v >= 1. Other shapes are silently
    // dropped (NOT rewritten) so the caller falls through cleanly.
    const lookup = buildCardCountsNameLookup({
      'good': 3,
      'zero': 0,
      'negative': -2,
      'float': 2.5,
      'nan': Number.NaN,
      'string-five': '5' as unknown as number,
      'object': {} as unknown as number,
      'null-value': null as unknown as number,
    });
    assert.equal(lookup.get('good'), 3, 'Positive integer must populate');
    assert.equal(lookup.get('zero'), undefined, 'Zero must be silently dropped');
    assert.equal(lookup.get('negative'), undefined, 'Negative must be silently dropped');
    assert.equal(lookup.get('float'), undefined, 'Non-integer must be silently dropped');
    assert.equal(lookup.get('nan'), undefined, 'NaN must be silently dropped');
    assert.equal(lookup.get('string-five'), undefined, 'String must be silently dropped');
    assert.equal(lookup.get('object'), undefined, 'Object must be silently dropped');
    assert.equal(lookup.get('null-value'), undefined, 'null must be silently dropped');
  });

  it('buildCardCountsNameLookup: returns empty Map when cardCounts is absent / null / not-an-object', () => {
    assert.equal(buildCardCountsNameLookup(undefined).size, 0);
    assert.equal(buildCardCountsNameLookup(null).size, 0);
    assert.equal(buildCardCountsNameLookup('not an object').size, 0);
    assert.equal(buildCardCountsNameLookup(42).size, 0);
  });
});
