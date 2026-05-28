/**
 * Executor tests for executeVillainAbilities.
 *
 * Covers each MVP effect keyword, koHeroCurrentPlayer zone-priority + ext_id
 * ordering + wound exclusion, captureBystander onFight immediate-award (no
 * stranded bystander), safe-skip on empty piles / empty effects /
 * out-of-vocabulary, deterministic replay, and the missing-hooks guard.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeVillainAbilities } from './villainEffects.execute.js';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { VillainAbilityHook } from '../rules/villainAbility.types.js';

const WOUND = 'pile-wound' as CardExtId;
const CTX = { currentPlayer: '0' };

interface MakeGOptions {
  hooks?: VillainAbilityHook[];
  playerZones?: Record<
    string,
    {
      deck: CardExtId[];
      hand: CardExtId[];
      discard: CardExtId[];
      inPlay: CardExtId[];
      victory: CardExtId[];
    }
  >;
  wounds?: CardExtId[];
  bystanders?: CardExtId[];
  heroDeck?: CardExtId[];
  escapedPile?: CardExtId[];
  attachedBystanders?: Record<CardExtId, CardExtId[]>;
  ko?: CardExtId[];
}

/**
 * Builds a minimal LegendaryGameState exercising only the fields the executor
 * reads. Cast through unknown because the executor never touches the rest.
 */
function makeG(options: MakeGOptions): LegendaryGameState {
  const playerZones =
    options.playerZones ??
    {
      '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
    };
  return {
    villainAbilityHooks: options.hooks ?? [],
    playerZones,
    piles: {
      bystanders: options.bystanders ?? [],
      wounds: options.wounds ?? [],
      officers: [],
      sidekicks: [],
      horrors: [],
    },
    ko: options.ko ?? [],
    attachedBystanders: options.attachedBystanders ?? {},
    heroDeck: options.heroDeck ?? [],
    escapedPile: options.escapedPile ?? [],
    turnEconomy: {
      attack: 0,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
  } as unknown as LegendaryGameState;
}

/**
 * Builds a single hook for one card/timing/effect set.
 */
function hook(
  cardId: string,
  timing: 'onAmbush' | 'onFight',
  effects: string[],
): VillainAbilityHook {
  return {
    cardId: cardId as CardExtId,
    timing,
    keywords: effects as VillainAbilityHook['keywords'],
    effects: effects as VillainAbilityHook['effects'],
  };
}

describe('executeVillainAbilities — gainWoundEachPlayer', () => {
  it('gives every player one wound and projects only the current player', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onAmbush', ['gainWoundEachPlayer'])],
      wounds: ['w0', 'w1', 'w2'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onAmbush');

    assert.equal(G.playerZones['0']!.discard.length, 1, 'player 0 gains a wound');
    assert.equal(G.playerZones['1']!.discard.length, 1, 'player 1 gains a wound');
    assert.equal(G.piles.wounds.length, 1, 'wound pile decreased by 2');
    assert.equal(G.turnEconomy.woundsDrawn, 1, 'only current player projected');
  });
});

describe('executeVillainAbilities — gainWoundCurrentPlayer', () => {
  it('gives only the current player a wound', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['gainWoundCurrentPlayer'])],
      wounds: ['w0', 'w1'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.equal(G.playerZones['0']!.discard.length, 1, 'current player gains a wound');
    assert.equal(G.playerZones['1']!.discard.length, 0, 'other player unaffected');
    assert.equal(G.piles.wounds.length, 1);
    assert.equal(G.turnEconomy.woundsDrawn, 1);
  });
});

describe('executeVillainAbilities — koHeroCurrentPlayer', () => {
  it('KOs the lexically-smallest non-wound card from discard (priority over hand)', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: ['core-hero-z-00'] as CardExtId[],
          discard: ['core-hero-b-00', 'core-hero-a-00', WOUND] as CardExtId[],
          inPlay: [],
          victory: [],
        },
        '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(G.ko, ['core-hero-a-00'], 'KOs the lexical-first discard hero');
    assert.equal(
      G.playerZones['0']!.discard.includes('core-hero-a-00' as CardExtId),
      false,
      'KO target removed from discard',
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.hand,
      ['core-hero-z-00'],
      'hand untouched when discard had a hero',
    );
  });

  it('falls through to hand when discard holds only wounds', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: ['core-hero-m-00', 'core-hero-a-00'] as CardExtId[],
          discard: [WOUND, WOUND] as CardExtId[],
          inPlay: [],
          victory: [],
        },
        '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(G.ko, ['core-hero-a-00'], 'KOs the lexical-first hand hero');
    assert.equal(G.playerZones['0']!.discard.length, 2, 'wound-only discard untouched');
  });

  it('no-ops when neither zone has a hero (wounds only)', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': { deck: [], hand: [], discard: [WOUND] as CardExtId[], inPlay: [], victory: [] },
        '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');
    assert.deepStrictEqual(G.ko, [], 'no KO when no hero is available');
  });
});

describe('executeVillainAbilities — heroDeckTopToEscape', () => {
  it('moves the top hero-deck card to the escaped pile', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onAmbush', ['heroDeckTopToEscape'])],
      heroDeck: ['h0', 'h1'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onAmbush');

    assert.deepStrictEqual(G.heroDeck, ['h1']);
    assert.deepStrictEqual(G.escapedPile, ['h0']);
  });

  it('no-ops on an empty hero deck', () => {
    const G = makeG({ hooks: [hook('v-x', 'onAmbush', ['heroDeckTopToEscape'])] });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onAmbush');
    assert.deepStrictEqual(G.escapedPile, []);
  });
});

describe('executeVillainAbilities — captureBystander', () => {
  it('onAmbush attaches a bystander to the revealed villain', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onAmbush', ['captureBystander'])],
      bystanders: ['b0', 'b1'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onAmbush');

    assert.deepStrictEqual(G.attachedBystanders['v-x' as CardExtId], ['b0']);
    assert.deepStrictEqual(G.piles.bystanders, ['b1']);
    assert.deepStrictEqual(G.playerZones['0']!.victory, [], 'not awarded on ambush');
  });

  it('onFight attaches AND immediately awards (no stranded bystander)', () => {
    const G = makeG({
      hooks: [hook('v-y', 'onFight', ['captureBystander'])],
      bystanders: ['b0'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-y' as CardExtId, 'onFight');

    assert.equal(
      G.attachedBystanders['v-y' as CardExtId],
      undefined,
      'no bystander left stranded on the defeated villain',
    );
    assert.deepStrictEqual(G.playerZones['0']!.victory, ['b0'], 'bystander awarded to current player');
    assert.deepStrictEqual(G.piles.bystanders, []);
  });

  it('no-ops when the bystander pile is empty', () => {
    const G = makeG({ hooks: [hook('v-y', 'onFight', ['captureBystander'])], bystanders: [] });
    executeVillainAbilities(G, CTX, 'v-y' as CardExtId, 'onFight');
    assert.deepStrictEqual(G.playerZones['0']!.victory, []);
    assert.deepStrictEqual(G.attachedBystanders, {});
  });
});

describe('executeVillainAbilities — safe-skip paths', () => {
  it('no-ops a hook with empty effects', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', [])],
      wounds: ['w0'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');
    assert.equal(G.piles.wounds.length, 1, 'no mutation from an empty-effects hook');
  });

  it('silently skips an out-of-vocabulary effect without throwing', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['notARealKeyword'])],
      wounds: ['w0'] as CardExtId[],
    });
    assert.doesNotThrow(() =>
      executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight'),
    );
    assert.equal(G.piles.wounds.length, 1, 'unknown effect causes no mutation');
  });

  it('no-ops when G.villainAbilityHooks is undefined (defensive guard)', () => {
    const G = makeG({});
    // why: simulate a pre-WP-185 / narrow test mock missing the field.
    (G as { villainAbilityHooks?: unknown }).villainAbilityHooks = undefined;
    assert.doesNotThrow(() =>
      executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight'),
    );
  });

  it('no-ops when no hook matches the cardId/timing', () => {
    const G = makeG({
      hooks: [hook('v-other', 'onFight', ['gainWoundCurrentPlayer'])],
      wounds: ['w0'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');
    assert.equal(G.piles.wounds.length, 1, 'non-matching cardId fires nothing');
  });
});

describe('executeVillainAbilities — determinism', () => {
  it('produces identical state across two identical runs', () => {
    const build = () =>
      makeG({
        hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
        playerZones: {
          '0': {
            deck: [],
            hand: [],
            discard: ['core-hero-b-00', 'core-hero-a-00'] as CardExtId[],
            inPlay: [],
            victory: [],
          },
          '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
        },
      });

    const first = build();
    executeVillainAbilities(first, CTX, 'v-x' as CardExtId, 'onFight');
    const second = build();
    executeVillainAbilities(second, CTX, 'v-x' as CardExtId, 'onFight');

    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });
});
