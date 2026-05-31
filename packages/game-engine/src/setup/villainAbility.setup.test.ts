/**
 * Setup-parser tests for buildVillainAbilityHooks.
 *
 * Covers Ambush/Fight prefix detection (case + whitespace variants),
 * henchman group-level onFight fan-out, henchman onAmbush deferral (D-18507),
 * [effect:] marker extraction + validation, keywords/effects parity,
 * deterministic emission order, and gate-consistency with buildCardKeywords.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVillainAbilityHooks } from './villainAbility.setup.js';
import { buildCardKeywords } from './buildCardKeywords.js';
import { hasAmbush } from '../board/boardKeywords.logic.js';
import { VILLAIN_ABILITY_TIMINGS } from '../rules/villainAbility.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardExtId } from '../state/zones.types.js';

// ---------------------------------------------------------------------------
// Mock registry builder
// ---------------------------------------------------------------------------

interface MockVillainCard {
  slug: string;
  abilities: string[];
}
interface MockVillainGroup {
  slug: string;
  cards: MockVillainCard[];
}
interface MockHenchmanGroup {
  slug: string;
  abilities: string[];
}

/**
 * Builds a registry mock exposing getSet (for buildVillainAbilityHooks) and
 * listSets / listCards / getSet (for buildCardKeywords). Villain flat cards
 * are derived from the villain groups so buildCardKeywords can match them.
 */
function makeRegistry(
  setAbbr: string,
  villains: MockVillainGroup[],
  henchmen: MockHenchmanGroup[],
) {
  const setData = {
    abbr: setAbbr,
    villains,
    henchmen,
    schemes: [],
    masterminds: [],
    heroes: [],
    bystanders: [],
    wounds: [],
    other: [],
  };

  const flatCards: Array<{
    key: string;
    cardType: string;
    slug: string;
    setAbbr: string;
    abilities: string[];
  }> = [];
  for (const group of villains) {
    for (const card of group.cards) {
      flatCards.push({
        key: `${setAbbr}-villain-${group.slug}-${card.slug}`,
        cardType: 'villain',
        slug: card.slug,
        setAbbr,
        abilities: card.abilities,
      });
    }
  }

  return {
    listCards: () => flatCards,
    listSets: () => [{ abbr: setAbbr }],
    getSet: (abbr: string) => (abbr === setAbbr ? setData : undefined),
  };
}

/**
 * Builds a minimal MatchSetupConfig selecting the given villain/henchman groups.
 */
function makeConfig(
  villainGroupIds: string[],
  henchmanGroupIds: string[],
): MatchSetupConfig {
  return {
    schemeId: 'core/midtown-bank-robbery',
    mastermindId: 'core/dr-doom',
    villainGroupIds,
    henchmanGroupIds,
    heroDeckIds: [],
    bystandersCount: 5,
    woundsCount: 5,
    officersCount: 5,
    sidekicksCount: 5,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildVillainAbilityHooks — timing prefix detection', () => {
  it('detects Ambush: and Fight: case-insensitively with leading whitespace trimmed', () => {
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'variants',
          cards: [
            { slug: 'caps', abilities: ['AMBUSH: foo [effect:captureBystander]'] },
            { slug: 'spaced', abilities: ['   Fight: bar [effect:koHeroCurrentPlayer]'] },
            { slug: 'emdash', abilities: ['Ambush — no colon here'] },
            { slug: 'spacedcolon', abilities: ['Ambush : spaced colon'] },
            { slug: 'passive', abilities: ['This is passive text with no timing.'] },
          ],
        },
      ],
      [],
    );
    const config = makeConfig(['core/variants'], []);
    const hooks = buildVillainAbilityHooks(registry, config);

    // why: WP-191 — villain hooks now key by the copy-indexed instance ext_id.
    // The fixture cards declare no `copies`, so each yields a single -00 instance.
    const byCard = (slug: string) =>
      hooks.filter((h) => h.cardId === `core-villain-variants-${slug}-00`);

    assert.equal(byCard('caps').length, 1, 'AMBUSH: matches case-insensitively');
    assert.equal(byCard('caps')[0]!.timing, 'onAmbush');
    assert.equal(byCard('spaced').length, 1, 'leading whitespace is trimmed');
    assert.equal(byCard('spaced')[0]!.timing, 'onFight');
    assert.equal(byCard('emdash').length, 0, 'em-dash variant is not matched');
    assert.equal(byCard('spacedcolon').length, 0, 'spaced-colon variant is not matched');
    assert.equal(byCard('passive').length, 0, 'lines with no timing prefix yield no hook');
  });
});

describe('buildVillainAbilityHooks — [effect:] marker extraction', () => {
  const registry = makeRegistry(
    'core',
    [
      {
        slug: 'mix',
        cards: [
          {
            slug: 'real',
            abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
          },
          {
            slug: 'bogus',
            abilities: [
              'Fight: do a thing [effect:notARealKeyword] [keyword:Dominates] [icon:attack]',
            ],
          },
          {
            slug: 'freetext',
            abilities: ['Fight: Each player gains a Wound.'],
          },
        ],
      },
    ],
    [],
  );
  const hooks = buildVillainAbilityHooks(registry, makeConfig(['core/mix'], []));
  // why: WP-191 — villain hooks key by the -00 copy instance (no `copies` field).
  const effectsFor = (slug: string) =>
    hooks.find((h) => h.cardId === `core-villain-mix-${slug}-00`)!.effects;

  it('extracts a valid [effect:] marker', () => {
    assert.deepStrictEqual(effectsFor('real'), ['koHeroCurrentPlayer']);
  });

  it('ignores unknown [effect:] values and never reads [keyword:]/[icon:]', () => {
    assert.deepStrictEqual(effectsFor('bogus'), []);
  });

  it('never parses free-text English into effects', () => {
    assert.deepStrictEqual(effectsFor('freetext'), []);
  });

  it('still emits a hook (timing preserved) for a matched line with no recognized marker', () => {
    const freetextHook = hooks.find((h) => h.cardId === 'core-villain-mix-freetext-00');
    assert.ok(freetextHook, 'a matched Fight: line yields a hook even with empty effects');
    assert.equal(freetextHook!.timing, 'onFight');
  });
});

describe('buildVillainAbilityHooks — keywords/effects parity', () => {
  it('keywords and effects are the same array on every hook', () => {
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'skrulls',
          cards: [
            {
              slug: 'super-skrull',
              abilities: ['Ambush: This captures a Bystander. [effect:captureBystander]'],
            },
          ],
        },
      ],
      [{ slug: 'doombot-legion', abilities: ['Fight: Reveal the top card.'] }],
    );
    const hooks = buildVillainAbilityHooks(
      registry,
      makeConfig(['core/skrulls'], ['core/doombot-legion']),
    );
    assert.ok(hooks.length > 0);
    for (const hook of hooks) {
      assert.equal(hook.keywords, hook.effects, 'keywords === effects (same array) in v1');
    }
  });
});

describe('buildVillainAbilityHooks — henchman group-level fan-out', () => {
  const registry = makeRegistry(
    'core',
    [],
    [{ slug: 'doombot-legion', abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'] }],
  );
  const hooks = buildVillainAbilityHooks(registry, makeConfig([], ['core/doombot-legion']));

  it('emits one onFight hook per virtual copy ext_id (00-09)', () => {
    const henchHooks = hooks.filter((h) => h.cardId.startsWith('henchman-doombot-legion-'));
    assert.equal(henchHooks.length, 10, '10 henchman copies → 10 hooks');
    for (let copyIndex = 0; copyIndex < 10; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const match = henchHooks.find(
        (h) => h.cardId === `henchman-doombot-legion-${paddedIndex}`,
      );
      assert.ok(match, `hook for henchman-doombot-legion-${paddedIndex} must exist`);
      assert.equal(match!.timing, 'onFight');
      assert.deepStrictEqual(match!.effects, ['koHeroCurrentPlayer']);
    }
  });

  it('does not alias the effects array across copies (D-13502)', () => {
    const henchHooks = hooks.filter((h) => h.cardId.startsWith('henchman-doombot-legion-'));
    assert.notEqual(
      henchHooks[0]!.effects,
      henchHooks[1]!.effects,
      'each copy must own a freshly-constructed effects array',
    );
  });
});

describe('buildVillainAbilityHooks — henchman onAmbush deferral (D-18507)', () => {
  it('emits no hook for a henchman Ambush: line', () => {
    // why: spider-infected (ssw2) is a real henchman whose Ambush line carries
    // [effect:captureBystander], but buildCardKeywords never tags henchmen, so a
    // henchman onAmbush hook would be unreachable — it must not be emitted.
    const registry = makeRegistry(
      'core',
      [],
      [
        {
          slug: 'spider-infected',
          abilities: ['Ambush: This captures a Bystander. [effect:captureBystander]'],
        },
      ],
    );
    const hooks = buildVillainAbilityHooks(
      registry,
      makeConfig([], ['core/spider-infected']),
    );
    const henchHooks = hooks.filter((h) => h.cardId.startsWith('henchman-spider-infected-'));
    assert.equal(henchHooks.length, 0, 'henchman Ambush lines yield zero hooks in v1');
  });
});

describe('buildVillainAbilityHooks — deterministic emission order', () => {
  const registry = makeRegistry(
    'core',
    [
      {
        slug: 'hood',
        cards: [
          {
            slug: 'the-hood',
            abilities: [
              'Ambush: Put the top Hero Deck card into the Escape Pile. [effect:heroDeckTopToEscape]',
              'Fight: Each player gains a Wound.',
            ],
          },
        ],
      },
      {
        slug: 'skrulls',
        cards: [
          {
            slug: 'super-skrull',
            abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
          },
        ],
      },
    ],
    [{ slug: 'doombot-legion', abilities: ['Fight: Reveal the top card.'] }],
  );
  const config = makeConfig(['core/hood', 'core/skrulls'], ['core/doombot-legion']);

  it('produces JSON-identical output across two builds', () => {
    const first = buildVillainAbilityHooks(registry, config);
    const second = buildVillainAbilityHooks(registry, config);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it('orders hooks by cardId lexical, then timing, then ability-line index', () => {
    const hooks = buildVillainAbilityHooks(registry, config);
    for (let i = 1; i < hooks.length; i++) {
      const prev = hooks[i - 1]!;
      const cur = hooks[i]!;
      if (prev.cardId !== cur.cardId) {
        assert.ok(prev.cardId < cur.cardId, `cardId order violated at index ${i}`);
        continue;
      }
      const prevRank = VILLAIN_ABILITY_TIMINGS.indexOf(prev.timing);
      const curRank = VILLAIN_ABILITY_TIMINGS.indexOf(cur.timing);
      assert.ok(prevRank <= curRank, `timing order violated at index ${i}`);
    }
  });
});

describe('buildVillainAbilityHooks — gate-consistency with buildCardKeywords', () => {
  it('every onAmbush hook satisfies hasAmbush(cardId, cardKeywords)', () => {
    // why: standard-cased "Ambush:" villains only — both detectors (the parser's
    // case-insensitive prefix and buildCardKeywords' case-sensitive
    // startsWith('Ambush')) agree on real data, so the gate cannot drop a
    // compiled onAmbush hook (reachability / gate-drift guard).
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'skrulls',
          cards: [
            {
              slug: 'super-skrull',
              abilities: ['Ambush: This captures a Bystander. [effect:captureBystander]'],
            },
            {
              slug: 'skrull-soldier',
              abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
            },
          ],
        },
        {
          slug: 'hood',
          cards: [
            {
              slug: 'the-hood',
              abilities: [
                'Ambush: Put the top Hero Deck card into the Escape Pile. [effect:heroDeckTopToEscape]',
              ],
            },
          ],
        },
      ],
      [{ slug: 'doombot-legion', abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'] }],
    );
    const config = makeConfig(['core/skrulls', 'core/hood'], ['core/doombot-legion']);

    const hooks = buildVillainAbilityHooks(registry, config);
    const cardKeywords = buildCardKeywords(registry, config);

    const ambushHooks = hooks.filter((h) => h.timing === 'onAmbush');
    assert.ok(ambushHooks.length >= 2, 'fixture must produce onAmbush hooks to exercise the guard');
    for (const hook of ambushHooks) {
      assert.equal(
        hasAmbush(hook.cardId as CardExtId, cardKeywords),
        true,
        `onAmbush hook for ${hook.cardId} must satisfy hasAmbush (gate-consistency)`,
      );
    }
  });
});

describe('buildVillainAbilityHooks — Escape: / Overrun: prefix detection (WP-186)', () => {
  it('detects Escape: case-insensitively with leading whitespace trimmed (villain per-card)', () => {
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'variants',
          cards: [
            {
              slug: 'caps',
              abilities: ['ESCAPE: each player loses a wound [effect:gainWoundEachPlayer]'],
            },
            {
              slug: 'spaced',
              abilities: ['   Escape: bar [effect:gainWoundCurrentPlayer]'],
            },
            {
              slug: 'emdash',
              abilities: ['Escape — no colon here'],
            },
            {
              slug: 'spacedcolon',
              abilities: ['Escape : spaced colon'],
            },
          ],
        },
      ],
      [],
    );
    const config = makeConfig(['core/variants'], []);
    const hooks = buildVillainAbilityHooks(registry, config);

    // why: WP-191 — villain hooks key by the -00 copy instance (no `copies` field).
    const byCard = (slug: string) =>
      hooks.filter((h) => h.cardId === `core-villain-variants-${slug}-00`);

    assert.equal(byCard('caps').length, 1, 'ESCAPE: matches case-insensitively');
    assert.equal(byCard('caps')[0]!.timing, 'onEscape');
    assert.deepStrictEqual(byCard('caps')[0]!.effects, ['gainWoundEachPlayer']);
    assert.equal(byCard('spaced').length, 1, 'leading whitespace is trimmed');
    assert.equal(byCard('spaced')[0]!.timing, 'onEscape');
    assert.deepStrictEqual(byCard('spaced')[0]!.effects, ['gainWoundCurrentPlayer']);
    assert.equal(byCard('emdash').length, 0, 'em-dash variant is not matched');
    assert.equal(byCard('spacedcolon').length, 0, 'spaced-colon variant is not matched');
  });

  it('detects Overrun: as a v1 synonym of Escape: (D-18602 — both emit onEscape)', () => {
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'siege',
          cards: [
            {
              slug: 'overrun-card',
              abilities: ['Overrun: Each player gains a Wound. [effect:gainWoundEachPlayer]'],
            },
            {
              slug: 'overrun-caps',
              abilities: ['OVERRUN: bar [effect:gainWoundCurrentPlayer]'],
            },
          ],
        },
      ],
      [],
    );
    const config = makeConfig(['core/siege'], []);
    const hooks = buildVillainAbilityHooks(registry, config);

    const overrunHook = hooks.find(
      (h) => h.cardId === 'core-villain-siege-overrun-card-00',
    );
    assert.ok(overrunHook, 'Overrun: line yields a hook');
    assert.equal(
      overrunHook!.timing,
      'onEscape',
      "Overrun: emits onEscape — 'onOverrun' is not a timing in v1 (D-18602)",
    );
    assert.deepStrictEqual(overrunHook!.effects, ['gainWoundEachPlayer']);

    const overrunCapsHook = hooks.find(
      (h) => h.cardId === 'core-villain-siege-overrun-caps-00',
    );
    assert.ok(overrunCapsHook, 'OVERRUN: matches case-insensitively');
    assert.equal(overrunCapsHook!.timing, 'onEscape');
  });

  it('emits an onEscape hook with empty effects when the matched line carries no [effect:] marker (safe-skip)', () => {
    // why: real escape lines outside the MVP vocabulary (e.g. the each-player-KO
    // pattern; D-18802) are left marker-free by WP-188 and must still produce
    // a hook with effects:[] — the executor then no-ops. This proves the
    // prefix-detection-only contract: timing is set from the prefix, effects
    // come only from [effect:] markers.
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'mix',
          cards: [
            {
              slug: 'unmarked',
              abilities: ['Escape: Each player KOs a Hero from their hand.'],
            },
            {
              slug: 'unmarked-overrun',
              abilities: ['Overrun: Each player KOs a Hero from their hand.'],
            },
          ],
        },
      ],
      [],
    );
    const config = makeConfig(['core/mix'], []);
    const hooks = buildVillainAbilityHooks(registry, config);

    const unmarked = hooks.find(
      (h) => h.cardId === 'core-villain-mix-unmarked-00',
    );
    assert.ok(unmarked, 'a matched Escape: line yields a hook even with no marker');
    assert.equal(unmarked!.timing, 'onEscape');
    assert.deepStrictEqual(unmarked!.effects, [], 'effects:[] when marker absent');

    const unmarkedOverrun = hooks.find(
      (h) => h.cardId === 'core-villain-mix-unmarked-overrun-00',
    );
    assert.ok(unmarkedOverrun, 'a matched Overrun: line yields a hook even with no marker');
    assert.equal(unmarkedOverrun!.timing, 'onEscape');
    assert.deepStrictEqual(unmarkedOverrun!.effects, []);
  });

  it("does not emit a hook with timing 'onOverrun' (synonym lock — D-18602)", () => {
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'siege',
          cards: [
            {
              slug: 'overrun-card',
              abilities: ['Overrun: Each player gains a Wound. [effect:gainWoundEachPlayer]'],
            },
          ],
        },
      ],
      [],
    );
    const hooks = buildVillainAbilityHooks(
      registry,
      makeConfig(['core/siege'], []),
    );
    for (const hook of hooks) {
      assert.notEqual(
        hook.timing as string,
        'onOverrun',
        "'onOverrun' must never appear as a hook timing (Overrun: collapses to onEscape at parse time)",
      );
    }
  });

  it('does not emit henchman onEscape hooks in v1 (D-18507-class filter mirror)', () => {
    // why: the henchman filter excludes every timing except onFight (the
    // executor-side rationale is identical to the D-18507 onAmbush deferral —
    // no real henchman in v1 data carries an [effect:]-marked Escape: line,
    // and the keyword-detection asymmetry would make emission unreachable).
    // The reveal-site fire still calls executeVillainAbilities on a henchman
    // escape; it safely no-ops via per-card hook lookup. This test pins the
    // emission boundary so a future WP that adds henchman onEscape coverage
    // updates both the parser AND this test together.
    const registry = makeRegistry(
      'core',
      [],
      [
        {
          slug: 'hand-ninjas',
          abilities: ['Escape: Each player gains a Wound. [effect:gainWoundEachPlayer]'],
        },
        {
          slug: 'doombot-legion',
          abilities: ['Overrun: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
        },
      ],
    );
    const hooks = buildVillainAbilityHooks(
      registry,
      makeConfig([], ['core/hand-ninjas', 'core/doombot-legion']),
    );
    const henchHooks = hooks.filter((h) =>
      h.cardId.startsWith('henchman-'),
    );
    assert.equal(
      henchHooks.length,
      0,
      'henchman Escape:/Overrun: lines yield zero hooks in v1',
    );
  });
});

describe('buildVillainAbilityHooks — villain per-copy fan-out (WP-191)', () => {
  it('emits one hook per (copy instance × matched ability line) keyed by the copy-indexed id', () => {
    // why: WP-191 / D-18704 — a villain card with copies:2 must produce hooks
    // under both -00 and -01 instance ids (matching the zone-instance grammar
    // the Fight fire site passes), exactly as henchmen already fan out. Before
    // this WP villains keyed the single definition id and never resolved.
    const registry = makeRegistry(
      'core',
      [
        {
          slug: 'brotherhood',
          cards: [
            {
              slug: 'magneto',
              copies: 2,
              abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
            },
          ],
        },
      ],
      [],
    );
    const hooks = buildVillainAbilityHooks(registry, makeConfig(['core/brotherhood'], []));

    const magnetoHooks = hooks.filter((h) =>
      h.cardId.startsWith('core-villain-brotherhood-magneto-'),
    );
    assert.equal(magnetoHooks.length, 2, 'copies:2 must yield 2 villain hook instances');
    for (let copyIndex = 0; copyIndex < 2; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const match = magnetoHooks.find(
        (h) => h.cardId === `core-villain-brotherhood-magneto-${paddedIndex}`,
      );
      assert.ok(match, `hook for core-villain-brotherhood-magneto-${paddedIndex} must exist`);
      assert.equal(match!.timing, 'onFight');
      assert.deepStrictEqual(match!.effects, ['koHeroCurrentPlayer']);
    }

    // why: copies must not alias a shared effects array (D-13502).
    assert.notEqual(
      magnetoHooks[0]!.effects,
      magnetoHooks[1]!.effects,
      'each copy must own a freshly-constructed effects array',
    );
  });
});
