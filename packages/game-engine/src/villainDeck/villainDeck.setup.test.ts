/**
 * Villain deck composition tests for WP-014B + WP-168.
 *
 * Verifies that buildVillainDeck instances villain copies, generates virtual
 * henchman/scheme-twist/bystander cards, adds generic Master Strikes,
 * classifies all cards, and produces a deterministically shuffled deck.
 *
 * Uses node:test and node:assert only. Uses makeMockCtx. No boardgame.io
 * imports. Mock registry satisfies VillainDeckRegistryReader structurally.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVillainDeck,
  villainCardInstanceExtIds,
  readVillainCopyCount,
} from './villainDeck.setup.js';
import type { VillainDeckRegistryReader, VillainDeckFlatCard } from './villainDeck.setup.js';
import { REVEALED_CARD_TYPES } from './villainDeck.types.js';
import type { RevealedCardType } from './villainDeck.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { BuildVillainDeckResult } from './villainDeck.setup.js';
import { makeMockCtx } from '../test/mockCtx.js';

// ---------------------------------------------------------------------------
// Mock registry
// ---------------------------------------------------------------------------

/**
 * Creates a mock registry satisfying VillainDeckRegistryReader with
 * one set containing test data for all card types.
 */
function createMockRegistry(): VillainDeckRegistryReader {
  const testSetAbbr = 'test';

  const villainFlatCards: VillainDeckFlatCard[] = [
    { key: 'test-villain-test-group-alpha-card-a', cardType: 'villain', slug: 'card-a', setAbbr: testSetAbbr },
    { key: 'test-villain-test-group-alpha-card-b', cardType: 'villain', slug: 'card-b', setAbbr: testSetAbbr },
    { key: 'test-villain-test-group-beta-card-c', cardType: 'villain', slug: 'card-c', setAbbr: testSetAbbr },
  ];

  const mastermindFlatCards: VillainDeckFlatCard[] = [
    { key: 'test-mastermind-test-mm-main', cardType: 'mastermind', slug: 'main', setAbbr: testSetAbbr },
    { key: 'test-mastermind-test-mm-epic', cardType: 'mastermind', slug: 'epic', setAbbr: testSetAbbr },
    { key: 'test-mastermind-test-mm-tactic-one', cardType: 'mastermind', slug: 'tactic-one', setAbbr: testSetAbbr },
  ];

  const schemeFlatCards: VillainDeckFlatCard[] = [
    { key: 'test-scheme-test-scheme', cardType: 'scheme', slug: 'test-scheme', setAbbr: testSetAbbr },
  ];

  const allFlatCards = [...villainFlatCards, ...mastermindFlatCards, ...schemeFlatCards];

  const testSetData = {
    abbr: testSetAbbr,
    henchmen: [
      { id: 1, slug: 'test-henchman-group', name: 'Test Henchman', imageUrl: 'https://example.com/h.webp', abilities: [] },
    ],
    masterminds: [
      {
        id: 1,
        slug: 'test-mm',
        name: 'Test Mastermind',
        alwaysLeads: [],
        vp: 5,
        cards: [
          { name: 'Main', slug: 'main', tactic: false, vAttack: 8, imageUrl: 'https://example.com/m1.webp', abilities: [] },
          { name: 'Epic', slug: 'epic', vAttack: 10, imageUrl: 'https://example.com/m2.webp', abilities: [] },
          { name: 'Tactic One', slug: 'tactic-one', tactic: true, vAttack: 3, imageUrl: 'https://example.com/t1.webp', abilities: [] },
          { name: 'Tactic Two', slug: 'tactic-two', tactic: true, vAttack: 4, imageUrl: 'https://example.com/t2.webp', abilities: [] },
        ],
      },
    ],
    villains: [
      {
        id: 1, slug: 'test-group-alpha', name: 'Test Group Alpha', ledBy: [],
        cards: [
          { name: 'Card A', slug: 'card-a', vp: 1, vAttack: 2, imageUrl: 'https://example.com/a.webp', abilities: [] },
          { name: 'Card B', slug: 'card-b', vp: 1, vAttack: 3, imageUrl: 'https://example.com/b.webp', abilities: [] },
        ],
      },
      {
        id: 2, slug: 'test-group-beta', name: 'Test Group Beta', ledBy: [],
        cards: [
          { name: 'Card C', slug: 'card-c', vp: 2, vAttack: 4, imageUrl: 'https://example.com/c.webp', abilities: [] },
        ],
      },
    ],
    schemes: [
      { id: 1, slug: 'test-scheme', name: 'Test Scheme', imageUrl: 'https://example.com/s.webp', cards: [] },
    ],
    heroes: [],
    bystanders: [],
    wounds: [],
    other: [],
  };

  return {
    listCards: () => [...allFlatCards],
    listSets: () => [{ abbr: testSetAbbr }],
    getSet: (abbr: string) => (abbr === testSetAbbr ? testSetData : undefined),
  };
}

/**
 * Creates a valid test MatchSetupConfig targeting the mock registry data.
 *
 * @amended WP-113 PS-7: bare slug fixtures (`'test-scheme'`,
 *   `'test-mm'`, `'test-group-alpha'`, `'test-henchman-group'`,
 *   `'test-hero-deck'`) migrated to set-qualified form
 *   `'<testSetAbbr>/<slug>'` per the qualified-ID contract
 *   (per D-10014).
 */
function createTestConfig(): MatchSetupConfig {
  return {
    schemeId: 'test/test-scheme',
    mastermindId: 'test/test-mm',
    villainGroupIds: ['test/test-group-alpha'],
    henchmanGroupIds: ['test/test-henchman-group'],
    heroDeckIds: ['test/test-hero-deck'],
    bystandersCount: 5,
    woundsCount: 5,
    officersCount: 5,
    sidekicksCount: 5,
  };
}

/**
 * Creates a mock registry mirroring the "watch bot play" core.json loadout:
 * Brotherhood (4 villains, each `copies: 2`), Hand Ninjas henchmen, Magneto
 * mastermind, and Midtown Bank Robbery (twist=8, bystander=12).
 */
function createMidtownMockRegistry(): VillainDeckRegistryReader {
  const setAbbr = 'core';

  const coreSetData = {
    abbr: setAbbr,
    henchmen: [
      { id: 1, slug: 'hand-ninjas', name: 'Hand Ninjas', imageUrl: 'https://example.com/hn.webp', abilities: [] },
    ],
    masterminds: [
      {
        id: 1, slug: 'magneto', name: 'Magneto', alwaysLeads: ['brotherhood'], vp: 12,
        cards: [
          { name: 'Magneto', slug: 'magneto', vAttack: 11, imageUrl: 'https://example.com/mag.webp', abilities: [] },
          { name: 'Tactic A', slug: 'tactic-a', tactic: true, vAttack: 7, imageUrl: 'https://example.com/ta.webp', abilities: [] },
        ],
      },
    ],
    villains: [
      {
        id: 1, slug: 'brotherhood', name: 'Brotherhood', ledBy: ['magneto'],
        cards: [
          { name: 'Blob', slug: 'blob', copies: 2, vp: 3, vAttack: 6, imageUrl: 'https://example.com/blob.webp', abilities: [] },
          { name: 'Juggernaut', slug: 'juggernaut', copies: 2, vp: 3, vAttack: 7, imageUrl: 'https://example.com/jug.webp', abilities: [] },
          { name: 'Mystique', slug: 'mystique', copies: 2, vp: 3, vAttack: 5, imageUrl: 'https://example.com/mys.webp', abilities: [] },
          { name: 'Quicksilver', slug: 'quicksilver', copies: 2, vp: 3, vAttack: 6, imageUrl: 'https://example.com/qs.webp', abilities: [] },
        ],
      },
    ],
    schemes: [
      {
        id: 1, slug: 'midtown-bank-robbery', name: 'Midtown Bank Robbery',
        villainDeckTwistCount: 8, villainDeckBystanderCount: 12,
        imageUrl: 'https://example.com/midtown.webp', cards: [],
      },
    ],
    heroes: [],
    bystanders: [],
    wounds: [],
    other: [],
  };

  return {
    listCards: () => [],
    listSets: () => [{ abbr: setAbbr }],
    getSet: (abbr: string) => (abbr === setAbbr ? coreSetData : undefined),
  };
}

/**
 * Creates the Midtown Bank Robbery / Magneto / Brotherhood / Hand Ninjas
 * loadout config for the golden composition test.
 */
function createMidtownConfig(): MatchSetupConfig {
  return {
    schemeId: 'core/midtown-bank-robbery',
    mastermindId: 'core/magneto',
    villainGroupIds: ['core/brotherhood'],
    henchmanGroupIds: ['core/hand-ninjas'],
    heroDeckIds: ['core/spider-man'],
    bystandersCount: 5,
    woundsCount: 5,
    officersCount: 5,
    sidekicksCount: 5,
  };
}

/**
 * Counts deck entries classified as the given RevealedCardType.
 */
function countByType(result: BuildVillainDeckResult, cardType: RevealedCardType): number {
  return result.state.deck.filter((id) => result.cardTypes[id] === cardType).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildVillainDeck', () => {
  it('produces a non-empty deck for a valid config', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    assert.ok(
      result.state.deck.length > 0,
      'Deck must be non-empty for a valid config',
    );
    assert.deepStrictEqual(
      result.state.discard,
      [],
      'Discard must be empty after setup',
    );
  });

  it('every card in the deck has an entry in cardTypes', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    for (const cardId of result.state.deck) {
      assert.ok(
        cardId in result.cardTypes,
        `Card "${cardId}" must have an entry in cardTypes`,
      );
    }
  });

  it('deck is shuffled (order differs from sorted insertion order)', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    // makeMockCtx reverses arrays, so shuffled order differs from sorted order
    const sorted = [...result.state.deck].sort();
    const isIdentical = result.state.deck.every(
      (card, index) => card === sorted[index],
    );
    assert.ok(
      !isIdentical,
      'Deck order must differ from sorted order after shuffle (proves shuffle ran)',
    );
  });

  it('cardTypes keys are a subset of unique deck IDs and vice versa', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    const uniqueDeckIds = new Set(result.state.deck);
    const cardTypeKeys = new Set(Object.keys(result.cardTypes));

    // Every unique deck ID must have a cardTypes entry
    for (const deckId of uniqueDeckIds) {
      assert.ok(
        cardTypeKeys.has(deckId),
        `Deck card "${deckId}" must have a cardTypes entry`,
      );
    }

    // Every cardTypes key must be in the deck
    for (const key of cardTypeKeys) {
      assert.ok(
        uniqueDeckIds.has(key),
        `cardTypes key "${key}" must appear in the deck`,
      );
    }
  });

  it('henchman copies: correct count per group and correct ext_id format', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    const henchmanCards = result.state.deck.filter((id) =>
      id.startsWith('henchman-'),
    );
    assert.equal(
      henchmanCards.length,
      10,
      'Must have exactly 10 henchman copies for one group',
    );

    // Verify ext_id format: henchman-{groupSlug}-{00..09}
    for (let i = 0; i < 10; i++) {
      const paddedIndex = String(i).padStart(2, '0');
      const expectedId = `henchman-test-henchman-group-${paddedIndex}`;
      assert.ok(
        result.state.deck.includes(expectedId),
        `Deck must contain "${expectedId}"`,
      );
      assert.equal(
        result.cardTypes[expectedId],
        'henchman',
        `"${expectedId}" must be classified as henchman`,
      );
    }
  });

  it('scheme twist copies: correct count and correct ext_id format', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    const twistCards = result.state.deck.filter((id) =>
      id.startsWith('scheme-twist-'),
    );
    assert.equal(
      twistCards.length,
      8,
      'Must have exactly 8 scheme twist copies',
    );

    // Verify ext_id format: scheme-twist-{schemeSlug}-{00..07}
    for (let i = 0; i < 8; i++) {
      const paddedIndex = String(i).padStart(2, '0');
      const expectedId = `scheme-twist-test-scheme-${paddedIndex}`;
      assert.ok(
        result.state.deck.includes(expectedId),
        `Deck must contain "${expectedId}"`,
      );
      assert.equal(
        result.cardTypes[expectedId],
        'scheme-twist',
        `"${expectedId}" must be classified as scheme-twist`,
      );
    }
  });

  it('bystander copies: count matches numPlayers', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const numPlayers = 3;
    const context = makeMockCtx({ numPlayers });

    const result = buildVillainDeck(config, registry, context);

    const bystanderCards = result.state.deck.filter((id) =>
      id.startsWith('bystander-villain-deck-'),
    );
    assert.equal(
      bystanderCards.length,
      numPlayers,
      `Must have exactly ${numPlayers} bystander copies (1 per player)`,
    );

    // Verify ext_id format
    for (let i = 0; i < numPlayers; i++) {
      const paddedIndex = String(i).padStart(2, '0');
      const expectedId = `bystander-villain-deck-${paddedIndex}`;
      assert.ok(
        result.state.deck.includes(expectedId),
        `Deck must contain "${expectedId}"`,
      );
      assert.equal(
        result.cardTypes[expectedId],
        'bystander',
        `"${expectedId}" must be classified as bystander`,
      );
    }
  });

  it('villain copies: cards with no copies field yield exactly one instance', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    // test-group-alpha has card-a and card-b, neither declaring `copies`.
    const villainCards = result.state.deck.filter((id) =>
      result.cardTypes[id] === 'villain',
    );
    assert.equal(
      villainCards.length,
      2,
      'Two villain cards with no copies field must yield exactly two instances',
    );
    assert.ok(
      result.state.deck.includes('test-villain-test-group-alpha-card-a-00'),
      'Deck must contain the zero-based copy-0 instance of card-a',
    );
    assert.ok(
      !result.state.deck.includes('test-villain-test-group-alpha-card-a-01'),
      'A card with no copies field must not produce a copy-1 instance',
    );
  });

  it('Master Strikes: exactly MASTER_STRIKE_COUNT generic master-strike-{NN} cards', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    const strikeCards = result.state.deck.filter((id) =>
      result.cardTypes[id] === 'mastermind-strike',
    );
    assert.equal(
      strikeCards.length,
      5,
      'Must have exactly 5 generic Master Strikes',
    );

    // Verify ext_id format: master-strike-{00..04}, zero-based.
    for (let i = 0; i < 5; i++) {
      const paddedIndex = String(i).padStart(2, '0');
      const expectedId = `master-strike-${paddedIndex}`;
      assert.ok(
        result.state.deck.includes(expectedId),
        `Deck must contain "${expectedId}"`,
      );
      assert.equal(
        result.cardTypes[expectedId],
        'mastermind-strike',
        `"${expectedId}" must be classified as mastermind-strike`,
      );
    }
  });

  it('no mastermind card appears in the deck (D-16801)', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    // The removed branch would have pushed {setAbbr}-mastermind-{slug}-... cards.
    const mastermindCard = result.state.deck.find((id) =>
      id.startsWith('test-mastermind-'),
    );
    assert.equal(
      mastermindCard,
      undefined,
      'No {setAbbr}-mastermind-... card may appear in the villain deck',
    );

    // Every 'mastermind-strike'-typed entry must be a generic Master Strike;
    // this proves the removed mastermind-card branch cannot reappear under the
    // same type via a different ext_id.
    for (const id of result.state.deck) {
      if (result.cardTypes[id] === 'mastermind-strike') {
        assert.ok(
          id.startsWith('master-strike-'),
          `mastermind-strike entry "${id}" must have a master-strike- prefix`,
        );
      }
    }
  });

  it('twist fallback: a scheme with no villainDeckTwistCount yields 8 twists', () => {
    // test-scheme declares no villainDeckTwistCount, so the SCHEME_TWIST_COUNT
    // default (8) applies.
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    assert.equal(
      countByType(result, 'scheme-twist'),
      8,
      'Absent villainDeckTwistCount must fall back to 8 twists',
    );
  });

  it('bystander fallback: a scheme with no villainDeckBystanderCount yields numPlayers bystanders', () => {
    // test-scheme declares no villainDeckBystanderCount, so the count falls
    // back to numPlayers.
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 4 });

    const result = buildVillainDeck(config, registry, context);

    assert.equal(
      countByType(result, 'bystander'),
      4,
      'Absent villainDeckBystanderCount must fall back to numPlayers',
    );
  });

  it('golden composition (Midtown loadout): exact per-type counts and total', () => {
    // why: this golden test locks the per-type counts and the whole-deck total
    // for the watch-bot-play loadout. A failure here means a replay-breaking
    // change to villain-deck composition.
    const registry = createMidtownMockRegistry();
    const config = createMidtownConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    assert.equal(countByType(result, 'scheme-twist'), 8, 'scheme-twist count');
    assert.equal(countByType(result, 'bystander'), 12, 'bystander count');
    assert.equal(countByType(result, 'mastermind-strike'), 5, 'master-strike count');
    assert.equal(countByType(result, 'henchman'), 10, 'henchman count');
    // Brotherhood: 4 villains × copies: 2 = 8 instances.
    assert.equal(countByType(result, 'villain'), 8, 'villain count (4 × copies:2)');
    assert.equal(result.state.deck.length, 43, 'total deck size must be 43');
  });

  it('determinism: two builds with an identical mock ctx produce identical decks', () => {
    const config = createMidtownConfig();

    const first = buildVillainDeck(
      config,
      createMidtownMockRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );
    const second = buildVillainDeck(
      config,
      createMidtownMockRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );

    assert.deepStrictEqual(
      second.state.deck,
      first.state.deck,
      'Identical setup + identical seed must produce identical decks',
    );
    assert.deepStrictEqual(
      second.cardTypes,
      first.cardTypes,
      'Identical setup + identical seed must produce identical cardTypes',
    );
  });

  it('JSON.stringify succeeds for the result (serialization proof)', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    const serialized = JSON.stringify(result);
    assert.ok(
      serialized,
      'JSON.stringify must produce a non-empty string',
    );

    const deserialized = JSON.parse(serialized);
    assert.deepStrictEqual(
      deserialized.state.discard,
      [],
      'Discard must survive JSON round-trip as empty array',
    );
  });

  it('all cardTypes values are valid REVEALED_CARD_TYPES members', () => {
    const registry = createMockRegistry();
    const config = createTestConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);

    const validTypes = new Set(REVEALED_CARD_TYPES);
    for (const [cardId, cardType] of Object.entries(result.cardTypes)) {
      assert.ok(
        validTypes.has(cardType),
        `Card "${cardId}" has invalid type "${cardType}" — must be a REVEALED_CARD_TYPES member`,
      );
    }
  });
});

// ===========================================================================
// WP-191 — villainCardInstanceExtIds / readVillainCopyCount shared emitter
// ===========================================================================

describe('readVillainCopyCount (WP-191)', () => {
  it('defaults to 1 when copies is absent', () => {
    assert.equal(readVillainCopyCount({}), 1);
  });

  it('returns the declared copies when >= 1', () => {
    assert.equal(readVillainCopyCount({ copies: 3 }), 3);
  });

  it('falls back to 1 for a copies value below 1', () => {
    assert.equal(readVillainCopyCount({ copies: 0 }), 1);
  });
});

describe('villainCardInstanceExtIds (WP-191)', () => {
  it('emits copy-indexed instance ext_ids in ascending order', () => {
    const ids = villainCardInstanceExtIds('core', 'brotherhood', 'magneto', { copies: 2 });
    assert.deepStrictEqual(ids, [
      'core-villain-brotherhood-magneto-00',
      'core-villain-brotherhood-magneto-01',
    ]);
  });

  it('emits a single -00 instance when copies is absent', () => {
    const ids = villainCardInstanceExtIds('core', 'brotherhood', 'mystique', {});
    assert.deepStrictEqual(ids, ['core-villain-brotherhood-mystique-00']);
  });

  it('drives the deck builder: emitter ids match the villain instances in the deck', () => {
    // why: buildVillainDeck delegates section 1 to the emitter, so every
    // villain id in the deck must be reproducible from the emitter (single
    // instance-id home — keys can never drift from the zone grammar).
    const registry = createMidtownMockRegistry();
    const config = createMidtownConfig();
    const context = makeMockCtx({ numPlayers: 2 });

    const result = buildVillainDeck(config, registry, context);
    const deckVillains = result.state.deck
      .filter((id) => result.cardTypes[id] === 'villain')
      .sort();

    // Brotherhood: blob/juggernaut/mystique/quicksilver, each copies:2.
    const expected: string[] = [];
    for (const slug of ['blob', 'juggernaut', 'mystique', 'quicksilver']) {
      for (const id of villainCardInstanceExtIds('core', 'brotherhood', slug, { copies: 2 })) {
        expected.push(id);
      }
    }
    expected.sort();

    assert.deepStrictEqual(deckVillains, expected, 'deck villain ids must equal emitter output');
  });
});
