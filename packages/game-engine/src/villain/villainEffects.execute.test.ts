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
import {
  executeVillainAbilities,
  selectDefaultKoTarget,
  buildKoEligibleTargets,
} from './villainEffects.execute.js';
import { resolveKoHeroChoice } from '../moves/koHeroChoice.resolve.js';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId, PlayerZones } from '../state/zones.types.js';
import type { VillainAbilityHook } from '../rules/villainAbility.types.js';
import { LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR } from '../rules/villainAbility.types.js';

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
  hq?: (CardExtId | null)[];
  villainAttachedHeroes?: Record<string, CardExtId[]>;
  cardStats?: Record<string, { cost: number }>;
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
    villainAttachedHeroes: options.villainAttachedHeroes ?? {},
    hq: (options.hq ?? [null, null, null, null, null]) as LegendaryGameState['hq'],
    heroDeck: options.heroDeck ?? [],
    escapedPile: options.escapedPile ?? [],
    cardStats: options.cardStats ?? {},
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
  timing: 'onAmbush' | 'onFight' | 'onEscape',
  effects: string[],
): VillainAbilityHook {
  // why: WP-252 — the helper takes legacy keyword strings. keywords[] is that
  // string array; effects[] is the translated descriptor array, mirroring the
  // parser's dual output for hand-built fixtures. Unknown strings (safe-skip
  // tests) translate to {} (no primitive) → the executor's handler lookup
  // misses → safe-skip, exactly as before.
  const keywords = effects as VillainAbilityHook['keywords'];
  const descriptors: VillainAbilityHook['effects'] = [];
  for (const keyword of keywords) {
    descriptors.push({ ...LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR[keyword] });
  }
  return {
    cardId: cardId as CardExtId,
    timing,
    keywords,
    effects: descriptors,
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

describe('executeVillainAbilities — koHeroCurrentPlayer (WP-242 park → resolve)', () => {
  // why: WP-242 / D-24006 — koHeroCurrentPlayer is now INTERACTIVE for the
  // current player. 0 eligible → no-op + no append; exactly 1 eligible →
  // auto-KO + no append (decision C); ≥2 eligible → append a pending choice
  // and KO nothing (the player picks via resolveKoHeroChoice). The legacy
  // auto-pick now applies only to the each-player variants (unchanged).
  it('≥2 eligible (discard + hand) → appends one pending choice and KOs nothing', () => {
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

    assert.deepStrictEqual(G.ko, [], 'nothing KOd yet — the player must choose');
    assert.equal(G.pendingKoHeroChoices?.length, 1, 'one pending choice appended');
    assert.deepStrictEqual(
      G.pendingKoHeroChoices?.[0],
      { choiceType: 'ko-hero', playerID: '0' },
      'pending entry records the current player',
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.discard,
      ['core-hero-b-00', 'core-hero-a-00', WOUND],
      'discard untouched while pending',
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.hand,
      ['core-hero-z-00'],
      'hand untouched while pending',
    );
  });

  it('≥2 eligible in hand only → appends one pending choice (no auto-KO)', () => {
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

    assert.deepStrictEqual(G.ko, [], 'wounds are not eligible; the two hand heroes are a choice');
    assert.equal(G.pendingKoHeroChoices?.length, 1, 'one pending choice appended');
    assert.equal(G.playerZones['0']!.hand.length, 2, 'hand untouched while pending');
  });

  it('exactly 1 eligible → auto-KOs that card and appends nothing (decision C)', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: [WOUND] as CardExtId[],
          discard: ['core-hero-a-00', WOUND] as CardExtId[],
          inPlay: [],
          victory: [],
        },
        '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(G.ko, ['core-hero-a-00'], 'the single eligible hero is auto-KOd');
    assert.equal(
      G.pendingKoHeroChoices === undefined || G.pendingKoHeroChoices.length === 0,
      true,
      'no pending choice appended when exactly 1 eligible',
    );
    assert.equal(
      G.playerZones['0']!.discard.includes('core-hero-a-00' as CardExtId),
      false,
      'auto-KO target removed from discard',
    );
  });

  it('0 eligible (wounds only) → no-op, no KO, no append', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': { deck: [], hand: [], discard: [WOUND] as CardExtId[], inPlay: [], victory: [] },
        '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');
    assert.deepStrictEqual(G.ko, [], 'no KO when no hero is available');
    assert.equal(
      G.pendingKoHeroChoices === undefined || G.pendingKoHeroChoices.length === 0,
      true,
      'no pending choice appended when 0 eligible',
    );
  });

  it('a single move firing koHeroCurrentPlayer twice appends TWO pending entries (multi-KO queue)', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer', 'koHeroCurrentPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: ['core-hero-a-00', 'core-hero-b-00'] as CardExtId[],
          discard: [],
          inPlay: [],
          victory: [],
        },
        '1': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');
    assert.equal(G.pendingKoHeroChoices?.length, 2, 'two pending entries (one per firing)');
    assert.deepStrictEqual(G.ko, [], 'nothing KOd while both choices are pending');
  });
});

describe('buildKoEligibleTargets (WP-242)', () => {
  it('spans discard → hand → inPlay in array index order, excluding wounds', () => {
    const zones = {
      deck: [],
      hand: ['core-hand-a' as CardExtId, WOUND],
      discard: ['core-disc-a' as CardExtId, WOUND, 'core-disc-b' as CardExtId],
      inPlay: ['core-play-a' as CardExtId],
      victory: [],
    } as unknown as PlayerZones;

    assert.deepStrictEqual(buildKoEligibleTargets(zones), [
      { zone: 'discard', cardId: 'core-disc-a' },
      { zone: 'discard', cardId: 'core-disc-b' },
      { zone: 'hand', cardId: 'core-hand-a' },
      { zone: 'inPlay', cardId: 'core-play-a' },
    ]);
  });

  it('dedupes the same ext_id within a zone (one option) but keeps it across zones (two options)', () => {
    const zones = {
      deck: [],
      hand: ['dup' as CardExtId],
      discard: ['dup' as CardExtId, 'dup' as CardExtId],
      inPlay: [],
      victory: [],
    } as unknown as PlayerZones;

    assert.deepStrictEqual(buildKoEligibleTargets(zones), [
      { zone: 'discard', cardId: 'dup' },
      { zone: 'hand', cardId: 'dup' },
    ]);
  });

  it('returns an empty list when only wounds are present', () => {
    const zones = {
      deck: [],
      hand: [WOUND],
      discard: [WOUND],
      inPlay: [],
      victory: [],
    } as unknown as PlayerZones;
    assert.deepStrictEqual(buildKoEligibleTargets(zones), []);
  });
});

describe('koHeroCurrentPlayer eligible-collapse (WP-242)', () => {
  it('a 2-entry queue whose first resolution drops the eligible set to 1 still leaves the second entry (resolve never auto-resolves the collapse)', () => {
    // why: D-24007 — only the parker auto-resolves. After the first
    // resolveKoHeroChoice the second pending entry remains even though only
    // one eligible card is left; it STILL requires an explicit resolve.
    const G = makeG({
      playerZones: {
        '0': {
          deck: [],
          hand: ['hero-a' as CardExtId, 'hero-b' as CardExtId],
          discard: [],
          inPlay: [],
          victory: [],
        },
      },
    });
    G.pendingKoHeroChoices = [
      { choiceType: 'ko-hero', playerID: '0' },
      { choiceType: 'ko-hero', playerID: '0' },
    ];

    // Resolve the first choice — KO hero-a, leaving hero-b as the only eligible.
    resolveKoHeroChoice(
      { G, playerID: '0' } as unknown as Parameters<typeof resolveKoHeroChoice>[0],
      { zone: 'hand', cardId: 'hero-a' as CardExtId },
    );

    assert.deepStrictEqual(G.ko, ['hero-a'], 'first resolve KOs hero-a');
    assert.equal(G.pendingKoHeroChoices.length, 1, 'second entry still pending — no auto-resolve');
    assert.deepStrictEqual(G.playerZones['0']!.hand, ['hero-b'], 'hero-b NOT auto-KOd');
  });
});

describe('executeVillainAbilities — starting-SHIELD KO priority (D-20602)', () => {
  // why: D-20602 amends D-18503's lex-asc tie-break. Pure lex-asc always KOs
  // recruited heroes ('core/...' < 'starting-shield-...' lexically), which
  // defeats deck-thinning. The amended heuristic prefers starting-shield
  // ext_ids first so auto-resolution KOs the worst cards instead of the
  // best. These tests pin the new priority across both zones and both
  // dispatch cases (current-player and each-player).
  const SHIELD_AGENT = 'starting-shield-agent' as CardExtId;
  const SHIELD_TROOPER = 'starting-shield-trooper' as CardExtId;

  // why: WP-242 — the starter-first / zone-priority selection now lives in the
  // bot default pick `selectDefaultKoTarget` (reused for auto-1 and the sim
  // bot). These tests assert that selection directly (the human-facing choice
  // shows ALL eligible targets; the priority only governs the auto-resolution).
  it('selectDefaultKoTarget prefers starting SHIELD card over a recruited hero in discard', () => {
    const zones = {
      deck: [],
      hand: [],
      // why: 'core/spider-man/...' lex-sorts before 'starting-shield-...';
      // pure lex-asc would have picked the recruited hero (pre-D-20602).
      discard: ['core/spider-man/strike' as CardExtId, SHIELD_AGENT, SHIELD_TROOPER],
      inPlay: [],
      victory: [],
    } as unknown as PlayerZones;

    assert.deepStrictEqual(
      selectDefaultKoTarget(zones),
      { zone: 'discard', cardId: SHIELD_AGENT },
      'auto-pick selects the lex-first starting SHIELD card, NOT the recruited hero',
    );
  });

  it('selectDefaultKoTarget prefers starting SHIELD card in hand (discard had only wounds)', () => {
    const zones = {
      deck: [],
      hand: ['core/hulk/smash' as CardExtId, SHIELD_TROOPER, SHIELD_AGENT],
      discard: [WOUND],
      inPlay: [],
      victory: [],
    } as unknown as PlayerZones;

    assert.deepStrictEqual(
      selectDefaultKoTarget(zones),
      { zone: 'hand', cardId: SHIELD_AGENT },
      'falls through to hand and picks the lex-first starting SHIELD card',
    );
  });

  it('selectDefaultKoTarget falls back to lex-asc among recruited heroes when no starting SHIELD cards present', () => {
    const zones = {
      deck: [],
      hand: [],
      discard: [
        'core/wolverine/claws' as CardExtId,
        'core/black-widow/spy' as CardExtId,
      ],
      inPlay: [],
      victory: [],
    } as unknown as PlayerZones;

    assert.deepStrictEqual(
      selectDefaultKoTarget(zones),
      { zone: 'discard', cardId: 'core/black-widow/spy' },
      'lex-asc tie-break still applies among non-starting cards (D-18503 preserved)',
    );
  });

  it('selectDefaultKoTarget discard zone priority is preserved even when only the hand holds a starting card', () => {
    // why: starting-first tier ordering does NOT override the zone-priority
    // (discard before hand) lock from D-18503. A recruited hero in discard
    // is the auto-pick before a starting card in hand.
    const zones = {
      deck: [],
      hand: [SHIELD_AGENT],
      discard: ['core/spider-man/strike' as CardExtId],
      inPlay: [],
      victory: [],
    } as unknown as PlayerZones;

    assert.deepStrictEqual(
      selectDefaultKoTarget(zones),
      { zone: 'discard', cardId: 'core/spider-man/strike' },
      'discard always beats hand, regardless of starting-card tier',
    );
  });

  it('koHeroEachPlayer applies starting-first priority per player', () => {
    // why: per-player resolver is shared (D-18902), so each-player dispatch
    // inherits the new priority. Player 0 has both a recruited hero AND a
    // starting card in discard — starting wins. Player 1 has only a recruited
    // hero — falls back to lex-asc.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: [],
          discard: ['core/spider-man/strike' as CardExtId, SHIELD_AGENT],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [],
          discard: ['core/hulk/smash' as CardExtId, 'core/wolverine/claws' as CardExtId],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      [SHIELD_AGENT, 'core/hulk/smash'],
      'player 0 KOs starting SHIELD; player 1 KOs lex-first recruited hero',
    );
  });

  it('determinism: selectDefaultKoTarget starting-first priority is stable across two identical calls', () => {
    const build = () =>
      ({
        deck: [],
        hand: ['core/wolverine/claws' as CardExtId],
        discard: [SHIELD_TROOPER, 'core/spider-man/strike' as CardExtId, SHIELD_AGENT, WOUND],
        inPlay: [],
        victory: [],
      } as unknown as PlayerZones);

    const first = selectDefaultKoTarget(build());
    const second = selectDefaultKoTarget(build());

    assert.deepStrictEqual(first, second, 'identical pick across two calls');
    assert.deepStrictEqual(
      first,
      { zone: 'discard', cardId: SHIELD_AGENT },
      'lex-first starting card wins',
    );
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

describe('executeVillainAbilities — onEscape dispatch (WP-186)', () => {
  it('gainWoundEachPlayer fires via onEscape dispatch (hook lookup by timing)', () => {
    // why: the executor is timing-agnostic and dispatches by per-card hook
    // lookup (`getVillainHooksForCard(cardId, timing)`); adding the onEscape
    // timing must reach the same effect-apply path with no executor-side
    // branching. Hook for 'v-escapee' onEscape with gainWoundEachPlayer →
    // every player gets one wound from the pool.
    const G = makeG({
      hooks: [hook('v-escapee', 'onEscape', ['gainWoundEachPlayer'])],
      wounds: ['w0', 'w1', 'w2'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-escapee' as CardExtId, 'onEscape');

    assert.equal(G.playerZones['0']!.discard.length, 1, 'player 0 gains a wound');
    assert.equal(G.playerZones['1']!.discard.length, 1, 'player 1 gains a wound');
    assert.equal(G.piles.wounds.length, 1, 'wound pile decreased by 2');
    assert.equal(G.turnEconomy.woundsDrawn, 1, 'only current player projected');
  });

  it('does not fire onAmbush or onFight hooks for the same card when called with onEscape', () => {
    // why: timing filter must isolate dispatch — the same card may carry
    // onAmbush and onFight hooks (from other ability lines); onEscape must
    // execute only the onEscape hooks.
    const G = makeG({
      hooks: [
        hook('v-x', 'onAmbush', ['gainWoundEachPlayer']),
        hook('v-x', 'onFight', ['koHeroCurrentPlayer']),
        hook('v-x', 'onEscape', ['gainWoundCurrentPlayer']),
      ],
      wounds: ['w0', 'w1'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onEscape');

    assert.equal(G.playerZones['0']!.discard.length, 1, 'current player gains a wound');
    assert.equal(G.playerZones['1']!.discard.length, 0, 'other player unaffected');
    assert.equal(G.piles.wounds.length, 1);
    assert.equal(G.turnEconomy.woundsDrawn, 1);
    assert.deepStrictEqual(G.ko, [], 'no KO — onFight hook did not fire');
  });

  it('captureBystander under onEscape attaches to the escaped card and does NOT auto-award (D-18603)', () => {
    // why: the executor auto-awards a captured bystander only on 'onFight'
    // (the Fight fire site runs post-award and would otherwise strand the
    // bystander). Under 'onEscape' the bystander attaches to the escaped
    // card now in G.escapedPile and follows it out of the city; the reveal
    // fire site calls executeVillainAbilities AFTER resolveEscapedBystanders
    // has released the escaping card's pre-escape attachments, so this new
    // attachment is to a clean slot.
    const G = makeG({
      hooks: [hook('v-escaped', 'onEscape', ['captureBystander'])],
      bystanders: ['b0', 'b1'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-escaped' as CardExtId, 'onEscape');

    assert.deepStrictEqual(
      G.attachedBystanders['v-escaped' as CardExtId],
      ['b0'],
      'captured bystander attaches to the escaped card (D-18603)',
    );
    assert.deepStrictEqual(G.piles.bystanders, ['b1'], 'one bystander drawn from supply');
    assert.deepStrictEqual(
      G.playerZones['0']!.victory,
      [],
      'no auto-award under onEscape — only onFight awards (timing branch)',
    );
  });

  it('safe-skips an onEscape hook with empty effects (e.g. each-player-KO line left marker-free by WP-188)', () => {
    // why: WP-188 leaves unmarked escape lines marker-free with
    // reason:"no-vocabulary-keyword" (e.g. the each-player-KO pattern; D-18802).
    // The parser still emits a hook with effects:[] so the timing is recorded;
    // the executor must no-op without touching any state.
    const G = makeG({
      hooks: [hook('v-unmarked', 'onEscape', [])],
      wounds: ['w0'] as CardExtId[],
      bystanders: ['b0'] as CardExtId[],
    });
    executeVillainAbilities(G, CTX, 'v-unmarked' as CardExtId, 'onEscape');
    assert.equal(G.piles.wounds.length, 1, 'no mutation from an empty-effects hook');
    assert.equal(G.piles.bystanders.length, 1, 'bystander pile untouched');
    assert.deepStrictEqual(G.attachedBystanders, {});
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

// ---------------------------------------------------------------------------
// WP-189: koHeroEachPlayer dispatch
// ---------------------------------------------------------------------------

describe('executeVillainAbilities — koHeroEachPlayer (WP-189)', () => {
  it('KOs exactly one hero from every player with ≥1 eligible hero; skips players with zero eligible heroes', () => {
    // why: 3-player fixture exercises the eligible-hero split per the
    // hardened §AC. Player 0: hero in discard (KO target). Player 1: hero
    // only in hand (KO falls through to hand). Player 2: wounds only (zero
    // eligible — silent skip). Expected: G.ko = [p0-discard-hero,
    // p1-hand-hero] in iteration order; player 2 unchanged.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: ['core-hero-p0-hand-z' as CardExtId],
          discard: ['core-hero-p0-disc-b' as CardExtId, 'core-hero-p0-disc-a' as CardExtId, WOUND],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: ['core-hero-p1-hand-m' as CardExtId, 'core-hero-p1-hand-a' as CardExtId],
          discard: [WOUND],
          inPlay: [],
          victory: [],
        },
        '2': {
          deck: [],
          hand: [],
          discard: [WOUND],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      ['core-hero-p0-disc-a', 'core-hero-p1-hand-a'],
      'KOs in sorted-player order: player 0 from discard (lex-first non-wound), player 1 from hand (lex-first)',
    );
    assert.equal(
      G.playerZones['0']!.discard.includes('core-hero-p0-disc-a' as CardExtId),
      false,
      "player 0's chosen discard hero removed",
    );
    assert.equal(
      G.playerZones['1']!.hand.includes('core-hero-p1-hand-a' as CardExtId),
      false,
      "player 1's chosen hand hero removed",
    );
    assert.deepStrictEqual(
      G.playerZones['2']!.hand,
      [],
      'player 2 hand untouched (zero eligible heroes)',
    );
    assert.deepStrictEqual(
      G.playerZones['2']!.discard,
      [WOUND],
      'player 2 discard untouched (wound-only is zero eligible heroes)',
    );
  });

  it('player iteration is lexically sorted ascending (D-18902 — not insertion order)', () => {
    // why: the locked iteration contract uses Object.keys(G.playerZones).sort()
    // (default JavaScript string compare). For 1-5-player boardgame.io
    // string ids the orderings coincide observationally, but the explicit
    // sort is the auditable determinism contract. This test inserts the
    // players in REVERSED order ('2', '1', '0') to prove the dispatch
    // iterates in sorted order regardless of insertion order.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
      playerZones: {
        '2': {
          deck: [],
          hand: [],
          discard: ['core-hero-z-z2' as CardExtId],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [],
          discard: ['core-hero-z-z1' as CardExtId],
          inPlay: [],
          victory: [],
        },
        '0': {
          deck: [],
          hand: [],
          discard: ['core-hero-z-z0' as CardExtId],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      ['core-hero-z-z0', 'core-hero-z-z1', 'core-hero-z-z2'],
      'G.ko mutation order matches sorted player ids (0, 1, 2), not insertion order (2, 1, 0)',
    );
  });

  it('bot-parity: legacy auto-resolution (koHeroEachPlayer) and the new selectDefaultKoTarget→resolve KO the SAME cardId (load-bearing)', () => {
    // why: WP-242 / D-24009 — the bot's KO target MUST be byte-identical to
    // today's auto-resolution. (a) Run the legacy resolver on a single-player
    // G via koHeroEachPlayer (it delegates to koOneHeroForPlayer) and capture
    // the KO'd cardId. (b) Run the new flow — selectDefaultKoTarget then
    // resolveKoHeroChoice with its result — and capture the KO'd cardId. The
    // two cardIds MUST be identical (the bot-determinism anchor).
    const buildZones = () => ({
      deck: ['core-hero-deck-d' as CardExtId],
      hand: ['core-hero-hand-h' as CardExtId, 'core-hero-hand-z' as CardExtId],
      discard: ['core-hero-disc-b' as CardExtId, 'core-hero-disc-a' as CardExtId, WOUND],
      inPlay: ['core-hero-play-p' as CardExtId],
      victory: ['core-hero-vict-v' as CardExtId],
    });

    // (a) legacy auto-resolution path
    const gLegacy = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
      playerZones: { '0': buildZones() },
    });
    executeVillainAbilities(gLegacy, CTX, 'v-x' as CardExtId, 'onFight');
    assert.equal(gLegacy.ko.length, 1, 'legacy resolver KOs exactly one card');
    const legacyKoId = gLegacy.ko[0];

    // (b) new selectDefaultKoTarget → resolveKoHeroChoice path
    const gNew = makeG({ playerZones: { '0': buildZones() } });
    gNew.pendingKoHeroChoices = [{ choiceType: 'ko-hero', playerID: '0' }];
    const defaultTarget = selectDefaultKoTarget(gNew.playerZones['0']!);
    assert.ok(defaultTarget !== null, 'a default target exists');
    resolveKoHeroChoice(
      { G: gNew, playerID: '0' } as unknown as Parameters<typeof resolveKoHeroChoice>[0],
      defaultTarget!,
    );
    assert.equal(gNew.ko.length, 1, 'new flow KOs exactly one card');
    const newKoId = gNew.ko[0];

    assert.equal(newKoId, legacyKoId, 'bot KO target is byte-identical to legacy auto-resolution');
    assert.equal(gNew.pendingKoHeroChoices.length, 0, 'new flow front-pops the resolved choice');
  });

  it('determinism (audit-exact): two identical dispatches produce identical KO targets, mutation order, and messages', () => {
    // why: the hardened §AC determinism criterion enumerates three deep-
    // equality classes: per-player KO target ext_ids, G.ko mutation order,
    // G.messages sequence. This test snapshots all three across two runs of
    // identical input G.
    const buildG = () =>
      makeG({
        hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
        playerZones: {
          '0': {
            deck: [],
            hand: ['core-hero-p0-hand' as CardExtId],
            discard: ['core-hero-p0-d2' as CardExtId, 'core-hero-p0-d1' as CardExtId],
            inPlay: [],
            victory: [],
          },
          '1': {
            deck: [],
            hand: ['core-hero-p1-hand-m' as CardExtId, 'core-hero-p1-hand-a' as CardExtId],
            discard: [],
            inPlay: [],
            victory: [],
          },
        },
      });

    const first = buildG();
    executeVillainAbilities(first, CTX, 'v-x' as CardExtId, 'onFight');

    const second = buildG();
    executeVillainAbilities(second, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      first.ko,
      second.ko,
      'G.ko targets identical across two runs (mutation order pinned)',
    );
    assert.deepStrictEqual(
      first.playerZones['0']!.discard,
      second.playerZones['0']!.discard,
      'player 0 discard identical across runs',
    );
    assert.deepStrictEqual(
      first.playerZones['1']!.hand,
      second.playerZones['1']!.hand,
      'player 1 hand identical across runs',
    );
    assert.deepStrictEqual(
      (first as { messages?: unknown }).messages,
      (second as { messages?: unknown }).messages,
      'G.messages identical sequence across runs',
    );
  });

  it('koHeroCurrentPlayer non-regression: on multi-player G, only the current player is targeted', () => {
    // why: WP-189 only adds the koHeroEachPlayer keyword; the
    // koHeroCurrentPlayer semantics (current-player only) MUST be unchanged
    // post-shared-resolver-rename. This regression test confirms invoking
    // koHeroCurrentPlayer from a multi-player G targets ONLY currentPlayer.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: [],
          discard: ['core-hero-p0-a' as CardExtId],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [],
          discard: ['core-hero-p1-a' as CardExtId],
          inPlay: [],
          victory: [],
        },
        '2': {
          deck: [],
          hand: [],
          discard: ['core-hero-p2-a' as CardExtId],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      ['core-hero-p0-a'],
      'only current player 0 is targeted; other players untouched',
    );
    assert.deepStrictEqual(
      G.playerZones['1']!.discard,
      ['core-hero-p1-a'],
      'player 1 discard untouched',
    );
    assert.deepStrictEqual(
      G.playerZones['2']!.discard,
      ['core-hero-p2-a'],
      'player 2 discard untouched',
    );
  });

  it('safe-skips when G.playerZones is empty (no throw)', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
      playerZones: {},
    });
    assert.doesNotThrow(() =>
      executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight'),
    );
    assert.deepStrictEqual(G.ko, [], 'no KO when there are no players');
  });
});

// ---------------------------------------------------------------------------
// WP-202: koHeroEachPlayerMag2 dispatch
// ---------------------------------------------------------------------------

describe('executeVillainAbilities — koHeroEachPlayerMag2 (WP-202)', () => {
  it('multi-player magnitude-2: each player with ≥2 eligible heroes loses exactly 2 in discard-then-hand ext_id-lexical order', () => {
    // why: WP-202 §AC Behavior — a 2-player fixture where each player has
    // both discard and hand heroes. Per the locked rule: discard priority
    // ascending by ext_id, then hand ascending by ext_id, two iterations
    // per player. Player 0: discard ['p0-d-b', 'p0-d-a'] → iteration 1
    // picks 'p0-d-a', iteration 2 picks 'p0-d-b' (still in discard before
    // hand). Player 1: discard ['p1-d-c'] → iteration 1 picks 'p1-d-c',
    // iteration 2 falls through to hand and picks 'p1-h-a'. G.ko order
    // follows iteration order (player 0 twice, then player 1 twice).
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayerMag2'])],
      playerZones: {
        '0': {
          deck: [],
          hand: ['core-hero-p0-h-z' as CardExtId],
          discard: [
            'core-hero-p0-d-b' as CardExtId,
            'core-hero-p0-d-a' as CardExtId,
            WOUND,
          ],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [
            'core-hero-p1-h-b' as CardExtId,
            'core-hero-p1-h-a' as CardExtId,
          ],
          discard: ['core-hero-p1-d-c' as CardExtId],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      [
        'core-hero-p0-d-a',
        'core-hero-p0-d-b',
        'core-hero-p1-d-c',
        'core-hero-p1-h-a',
      ],
      'G.ko mutation order: player 0 discard×2, then player 1 discard then hand',
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.discard,
      [WOUND],
      "player 0 discard heroes removed; wound stays",
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.hand,
      ['core-hero-p0-h-z'],
      'player 0 hand untouched (both iterations satisfied from discard)',
    );
    assert.deepStrictEqual(
      G.playerZones['1']!.discard,
      [],
      'player 1 discard consumed (only 1 hero there)',
    );
    assert.deepStrictEqual(
      G.playerZones['1']!.hand,
      ['core-hero-p1-h-b'],
      "player 1 hand: 'a' removed, 'b' retained",
    );
  });

  it('partial-eligibility per player: 1 eligible loses 1; 0 eligible loses 0; 3+ eligible loses exactly 2', () => {
    // why: WP-202 §AC Behavior — the silent-no-op-per-iteration semantics
    // and the strict 2-cap. Player 0 has 1 eligible hero (second iteration
    // no-ops). Player 1 has 0 eligible heroes (both iterations no-op).
    // Player 2 has 3 eligible heroes (third is not touched).
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayerMag2'])],
      playerZones: {
        '0': {
          deck: [],
          hand: ['core-hero-p0-h-a' as CardExtId],
          discard: [WOUND],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [],
          discard: [WOUND],
          inPlay: [],
          victory: [],
        },
        '2': {
          deck: [],
          hand: [],
          discard: [
            'core-hero-p2-d-c' as CardExtId,
            'core-hero-p2-d-b' as CardExtId,
            'core-hero-p2-d-a' as CardExtId,
          ],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      [
        'core-hero-p0-h-a',
        'core-hero-p2-d-a',
        'core-hero-p2-d-b',
      ],
      'G.ko: p0 loses 1 (only hero), p1 loses 0 (silent), p2 loses exactly 2 of 3',
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.hand,
      [],
      "player 0 hand empty (its sole hero KO'd on iteration 1)",
    );
    assert.deepStrictEqual(
      G.playerZones['1']!.discard,
      [WOUND],
      'player 1 untouched (zero eligible)',
    );
    assert.deepStrictEqual(
      G.playerZones['2']!.discard,
      ['core-hero-p2-d-c'],
      "player 2 retains the lex-largest hero ('c'); 'a' and 'b' KO'd",
    );
  });

  it('mixed eligibility across players: one player loses 2, another loses 1, another loses 0 in the same dispatch', () => {
    // why: WP-202 §AC Behavior — verifies per-player iteration is
    // independent (no cross-player coupling). Player 0 has 2 eligible
    // heroes (loses 2), player 1 has 1 eligible (loses 1), player 2 has 0
    // eligible (loses 0). All in a single dispatch.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayerMag2'])],
      playerZones: {
        '0': {
          deck: [],
          hand: [],
          discard: [
            'core-hero-p0-d-b' as CardExtId,
            'core-hero-p0-d-a' as CardExtId,
          ],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: ['core-hero-p1-h-a' as CardExtId],
          discard: [],
          inPlay: [],
          victory: [],
        },
        '2': {
          deck: [],
          hand: [WOUND],
          discard: [],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      ['core-hero-p0-d-a', 'core-hero-p0-d-b', 'core-hero-p1-h-a'],
      'G.ko: p0 loses 2 from discard, p1 loses 1 from hand, p2 loses 0',
    );
    assert.deepStrictEqual(
      G.playerZones['2']!.hand,
      [WOUND],
      'player 2 untouched (wound is not a hero)',
    );
  });

  it('single-player parity (load-bearing): koHeroEachPlayerMag2(G) ≡ koHeroEachPlayer(koHeroEachPlayer(G)) byte-identical', () => {
    // why: WP-202 §AC Behavior — the load-bearing magnitude-2-equals-
    // magnitude-1-twice parity guard. On a single-player G with ≥2
    // eligible heroes, dispatching koHeroEachPlayerMag2 once must produce
    // byte-identical post-state to dispatching koHeroEachPlayer twice in
    // sequence. The deep-equality classes covered: G.ko, every player
    // zone (hand/discard/inPlay/victory/deck), G.attachedBystanders,
    // G.messages. This pins D-18902's shared-resolver mutation-location
    // lock and D-20201's literal-2-equals-twice-magnitude-1 semantics.
    const buildG = (effect: 'koHeroEachPlayer' | 'koHeroEachPlayerMag2') =>
      makeG({
        hooks: [hook('v-x', 'onFight', [effect])],
        playerZones: {
          '0': {
            deck: ['core-hero-deck-d' as CardExtId],
            hand: [
              'core-hero-hand-h' as CardExtId,
              'core-hero-hand-z' as CardExtId,
            ],
            discard: [
              'core-hero-disc-b' as CardExtId,
              'core-hero-disc-a' as CardExtId,
              WOUND,
            ],
            inPlay: ['core-hero-play-p' as CardExtId],
            victory: ['core-hero-vict-v' as CardExtId],
          },
        },
        attachedBystanders: {
          ['v-other' as CardExtId]: ['by-1' as CardExtId],
        },
      });

    // Run koHeroEachPlayer twice in sequence against a fresh G.
    const gTwice = buildG('koHeroEachPlayer');
    executeVillainAbilities(gTwice, CTX, 'v-x' as CardExtId, 'onFight');
    executeVillainAbilities(gTwice, CTX, 'v-x' as CardExtId, 'onFight');

    // Run koHeroEachPlayerMag2 once against an identically-shaped fresh G.
    const gMag2 = buildG('koHeroEachPlayerMag2');
    executeVillainAbilities(gMag2, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(gMag2.ko, gTwice.ko, 'G.ko deep-equal');
    assert.deepStrictEqual(
      gMag2.playerZones['0']!.discard,
      gTwice.playerZones['0']!.discard,
      'player 0 discard deep-equal',
    );
    assert.deepStrictEqual(
      gMag2.playerZones['0']!.hand,
      gTwice.playerZones['0']!.hand,
      'player 0 hand deep-equal',
    );
    assert.deepStrictEqual(
      gMag2.playerZones['0']!.inPlay,
      gTwice.playerZones['0']!.inPlay,
      'player 0 inPlay deep-equal',
    );
    assert.deepStrictEqual(
      gMag2.playerZones['0']!.victory,
      gTwice.playerZones['0']!.victory,
      'player 0 victory deep-equal',
    );
    assert.deepStrictEqual(
      gMag2.playerZones['0']!.deck,
      gTwice.playerZones['0']!.deck,
      'player 0 deck deep-equal',
    );
    assert.deepStrictEqual(
      gMag2.attachedBystanders,
      gTwice.attachedBystanders,
      'G.attachedBystanders deep-equal',
    );
    // why: messages is a separate JSON array; the shared resolver pushes
    // none today, but deep equality pins it so a future per-branch
    // message divergence (which would violate the mutation-location
    // lock) fails this test.
    assert.deepStrictEqual(
      (gMag2 as { messages?: unknown }).messages,
      (gTwice as { messages?: unknown }).messages,
      'G.messages deep-equal',
    );
  });

  it('determinism (audit-exact): two identical dispatches produce identical KO targets, mutation order, and messages', () => {
    // why: WP-202 §AC Behavior — three deep-equality classes per the
    // determinism criterion: per-player KO target ext_ids, G.ko mutation
    // order, G.messages sequence. Snapshots all three across two runs of
    // identical input G.
    const buildG = () =>
      makeG({
        hooks: [hook('v-x', 'onFight', ['koHeroEachPlayerMag2'])],
        playerZones: {
          '0': {
            deck: [],
            hand: ['core-hero-p0-h' as CardExtId],
            discard: [
              'core-hero-p0-d2' as CardExtId,
              'core-hero-p0-d1' as CardExtId,
            ],
            inPlay: [],
            victory: [],
          },
          '1': {
            deck: [],
            hand: [
              'core-hero-p1-h-m' as CardExtId,
              'core-hero-p1-h-a' as CardExtId,
            ],
            discard: [],
            inPlay: [],
            victory: [],
          },
        },
      });

    const first = buildG();
    executeVillainAbilities(first, CTX, 'v-x' as CardExtId, 'onFight');

    const second = buildG();
    executeVillainAbilities(second, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      first.ko,
      second.ko,
      'G.ko targets identical across two runs (mutation order pinned)',
    );
    assert.deepStrictEqual(
      first.playerZones['0']!.discard,
      second.playerZones['0']!.discard,
      'player 0 discard identical across runs',
    );
    assert.deepStrictEqual(
      first.playerZones['1']!.hand,
      second.playerZones['1']!.hand,
      'player 1 hand identical across runs',
    );
    assert.deepStrictEqual(
      (first as { messages?: unknown }).messages,
      (second as { messages?: unknown }).messages,
      'G.messages identical sequence across runs',
    );
  });

  it('koHeroEachPlayer non-regression: magnitude-1 dispatch still produces exactly one KO per eligible player', () => {
    // why: WP-202 §AC Behavior — adding the magnitude-2 branch must NOT
    // change the magnitude-1 branch's behavior. A two-player G with ≥1
    // eligible hero per player should yield exactly 2 KOs (one per
    // player), not 4.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroEachPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: [],
          discard: [
            'core-hero-p0-d-b' as CardExtId,
            'core-hero-p0-d-a' as CardExtId,
          ],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [
            'core-hero-p1-h-b' as CardExtId,
            'core-hero-p1-h-a' as CardExtId,
          ],
          discard: [],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      ['core-hero-p0-d-a', 'core-hero-p1-h-a'],
      'magnitude-1 still produces exactly one KO per player (not two)',
    );
    assert.deepStrictEqual(
      G.playerZones['0']!.discard,
      ['core-hero-p0-d-b'],
      "player 0 retains lex-larger discard hero",
    );
    assert.deepStrictEqual(
      G.playerZones['1']!.hand,
      ['core-hero-p1-h-b'],
      "player 1 retains lex-larger hand hero",
    );
  });

  it('koHeroCurrentPlayer non-regression: only the current player is targeted (single KO)', () => {
    // why: WP-202 §AC Behavior — the current-player branch must remain
    // single-target. A 3-player G dispatched via koHeroCurrentPlayer
    // produces exactly 1 KO on the current player, leaving the other two
    // untouched. This pins that the magnitude-2 addition did not bleed
    // into the current-player branch.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['koHeroCurrentPlayer'])],
      playerZones: {
        '0': {
          deck: [],
          hand: [],
          discard: ['core-hero-p0-a' as CardExtId],
          inPlay: [],
          victory: [],
        },
        '1': {
          deck: [],
          hand: [],
          discard: ['core-hero-p1-a' as CardExtId],
          inPlay: [],
          victory: [],
        },
        '2': {
          deck: [],
          hand: [],
          discard: ['core-hero-p2-a' as CardExtId],
          inPlay: [],
          victory: [],
        },
      },
    });
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(
      G.ko,
      ['core-hero-p0-a'],
      'only current player 0 is targeted; other players untouched',
    );
    assert.deepStrictEqual(
      G.playerZones['1']!.discard,
      ['core-hero-p1-a'],
      'player 1 discard untouched',
    );
    assert.deepStrictEqual(
      G.playerZones['2']!.discard,
      ['core-hero-p2-a'],
      'player 2 discard untouched',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-200 — return-shape assertions (additive)
// ---------------------------------------------------------------------------

describe('executeVillainAbilities — WP-200 return shape', () => {
  it('returns the applied keywords in dispatch order for a multi-effect hook', () => {
    const G = makeG({
      hooks: [
        hook('v-x', 'onFight', ['captureBystander', 'gainWoundCurrentPlayer']),
      ],
      bystanders: ['b0'] as CardExtId[],
      wounds: ['w0'] as CardExtId[],
    });
    const applied = executeVillainAbilities(
      G,
      CTX,
      'v-x' as CardExtId,
      'onFight',
    );
    assert.deepStrictEqual(applied, ['captureBystander', 'gainWoundCurrentPlayer']);
  });

  it('returns [] when no hooks match the (cardId, timing)', () => {
    const G = makeG({
      hooks: [hook('v-x', 'onAmbush', ['captureBystander'])],
      bystanders: ['b0'] as CardExtId[],
    });
    const applied = executeVillainAbilities(
      G,
      CTX,
      'v-x' as CardExtId,
      'onFight',
    );
    assert.deepStrictEqual(applied, []);
  });

  it('returns [] when villainAbilityHooks is empty (guard path)', () => {
    const G = makeG({ hooks: [] });
    const applied = executeVillainAbilities(
      G,
      CTX,
      'v-x' as CardExtId,
      'onFight',
    );
    assert.deepStrictEqual(applied, []);
  });

  it('post-safe-skip: out-of-vocab effects are NOT in the returned array', () => {
    // why: WP-200 D-20003 — the executor's `appliedEffects[]` lists only
    // effects whose case branch ran. Parsed-but-unknown keywords (default
    // branch) are excluded. Constructing a hook with an out-of-vocab token
    // via the `as` cast simulates the malformed-hook code path that the
    // safe-skip default branch handles.
    const G = makeG({
      hooks: [
        hook('v-x', 'onFight', [
          'captureBystander',
          'totallyMadeUpKeyword',
        ]),
      ],
      bystanders: ['b0'] as CardExtId[],
    });
    const applied = executeVillainAbilities(
      G,
      CTX,
      'v-x' as CardExtId,
      'onFight',
    );
    assert.deepStrictEqual(applied, ['captureBystander']);
  });

  it('mutation-guarded short-circuit still appears in the applied array', () => {
    // why: WP-200 — empty-pile / missing-zone guards short-circuit the case
    // body but the keyword was attempted; emissions sites need to know which
    // effect tokens fired their dispatch branch (so the narrative reflects
    // intent, not whether the mutation succeeded). Empty wound pile must
    // still surface `gainWoundCurrentPlayer` in the applied array.
    const G = makeG({
      hooks: [hook('v-x', 'onFight', ['gainWoundCurrentPlayer'])],
      wounds: [],
    });
    const applied = executeVillainAbilities(
      G,
      CTX,
      'v-x' as CardExtId,
      'onFight',
    );
    assert.deepStrictEqual(applied, ['gainWoundCurrentPlayer']);
  });
});

// ---------------------------------------------------------------------------
// WP-214: captureHqHero* keyword dispatch
// ---------------------------------------------------------------------------

describe('executeVillainAbilities — captureHqHeroRightmost (WP-214)', () => {
  it('captures the rightmost non-null HQ hero and attaches to the villain', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroRightmost'])],
      hq: ['h0' as CardExtId, null, 'h2' as CardExtId, null, 'h4' as CardExtId],
    });
    executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');

    assert.deepStrictEqual(
      G.villainAttachedHeroes['v-skrull'],
      ['h4'],
      'h4 at index 4 is the rightmost non-null slot',
    );
    assert.equal(G.hq[4], null, 'HQ slot 4 vacated after capture');
  });

  it('no-op when HQ is entirely null — returns safely without throw', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroRightmost'])],
      hq: [null, null, null, null, null],
    });
    assert.doesNotThrow(() =>
      executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush'),
    );
    assert.deepStrictEqual(G.villainAttachedHeroes, {});
  });

  it('appears in the applied array when HQ has a target', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroRightmost'])],
      hq: [null, null, null, null, 'h4' as CardExtId],
    });
    const applied = executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');
    assert.deepStrictEqual(applied, ['captureHqHeroRightmost']);
  });
});

describe('executeVillainAbilities — captureHqHeroHighestCost (WP-214)', () => {
  it('captures the highest-cost HQ hero and attaches to the villain', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroHighestCost'])],
      hq: ['h0' as CardExtId, 'h1' as CardExtId, 'h2' as CardExtId, null, null],
      cardStats: { h0: { cost: 3 }, h1: { cost: 7 }, h2: { cost: 2 } },
    });
    executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');

    assert.deepStrictEqual(G.villainAttachedHeroes['v-skrull'], ['h1'], 'h1 has cost 7 — highest');
    assert.equal(G.hq[1], null, 'HQ slot 1 vacated');
  });

  it('appears in the applied array', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroHighestCost'])],
      hq: [null, 'h1' as CardExtId, null, null, null],
      cardStats: { h1: { cost: 4 } },
    });
    const applied = executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');
    assert.deepStrictEqual(applied, ['captureHqHeroHighestCost']);
  });
});

describe('executeVillainAbilities — captureHqHeroLowestCost (WP-214)', () => {
  it('captures the lowest-cost HQ hero and attaches to the villain', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroLowestCost'])],
      hq: ['h0' as CardExtId, 'h1' as CardExtId, 'h2' as CardExtId, null, null],
      cardStats: { h0: { cost: 3 }, h1: { cost: 7 }, h2: { cost: 1 } },
    });
    executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');

    assert.deepStrictEqual(G.villainAttachedHeroes['v-skrull'], ['h2'], 'h2 has cost 1 — lowest');
    assert.equal(G.hq[2], null, 'HQ slot 2 vacated');
  });

  it('appears in the applied array', () => {
    const G = makeG({
      hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroLowestCost'])],
      hq: ['h0' as CardExtId, null, null, null, null],
      cardStats: { h0: { cost: 2 } },
    });
    const applied = executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');
    assert.deepStrictEqual(applied, ['captureHqHeroLowestCost']);
  });
});

// ---------------------------------------------------------------------------
// WP-257 — hollow-effect detection (D-24033 + D-24034)
//
// Villain detection writes at the executor's existing out-of-vocab skip site +
// for each unresolved [effect:X] marker. The VillainEffectKeyword[] applied
// return stays byte-unchanged (detection is purely additive). cardType is
// resolved from G.villainDeckCardTypes (henchman vs villain).
// ---------------------------------------------------------------------------

describe('executeVillainAbilities — hollow-effect detection (WP-257)', () => {
  /** Reads the lazy-init diagnostics records (empty array when never written). */
  function records(G: LegendaryGameState) {
    return G.diagnostics?.hollowEffects ?? [];
  }

  /** Attaches a messages array + cardType map so the record + message line surface. */
  function withDiagnosticsFields(
    G: LegendaryGameState,
    cardTypes?: Record<string, 'villain' | 'henchman'>,
  ): LegendaryGameState {
    (G as { messages?: unknown }).messages = [];
    if (cardTypes !== undefined) {
      (G as { villainDeckCardTypes?: unknown }).villainDeckCardTypes = cardTypes;
    }
    return G;
  }

  it('an out-of-vocabulary descriptor records a hollow record (cardType villain)', () => {
    // why: the hook helper maps 'notARealKeyword' through the empty
    // LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR entry → a {} descriptor with no
    // primitive → applyVillainEffect reaches no handler → no-handler hollow.
    const G = withDiagnosticsFields(
      makeG({ hooks: [hook('v-x', 'onAmbush', ['notARealKeyword'])] }),
    );
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onAmbush');

    assert.equal(records(G).length, 1, 'exactly one hollow record');
    assert.equal(records(G)[0]!.reason, 'no-handler');
    assert.equal(records(G)[0]!.cardType, 'villain');
    assert.equal(records(G)[0]!.timing, 'onAmbush');
  });

  it('resolves cardType henchman from G.villainDeckCardTypes', () => {
    const G = withDiagnosticsFields(
      makeG({ hooks: [hook('henchman-doombot-00', 'onFight', ['notARealKeyword'])] }),
      { 'henchman-doombot-00': 'henchman' },
    );
    executeVillainAbilities(G, CTX, 'henchman-doombot-00' as CardExtId, 'onFight');

    assert.equal(records(G).length, 1);
    assert.equal(records(G)[0]!.cardType, 'henchman');
  });

  it('a recognized ambush descriptor that no-ops records NO hollow event', () => {
    // why: captureHqHeroRightmost with an all-null HQ reaches its real handler and
    // intentionally no-ops — a reachable outcome, NOT hollow (the keystone).
    const G = withDiagnosticsFields(
      makeG({
        hooks: [hook('v-skrull', 'onAmbush', ['captureHqHeroRightmost'])],
        hq: [null, null, null, null, null],
      }),
    );
    executeVillainAbilities(G, CTX, 'v-skrull' as CardExtId, 'onAmbush');

    assert.equal(records(G).length, 0, 'a reachable handler that no-ops is not hollow');
  });

  it('an empty-wound-pile gainWound records NO hollow event (reachable no-op)', () => {
    const G = withDiagnosticsFields(
      makeG({ hooks: [hook('v-x', 'onFight', ['gainWoundCurrentPlayer'])], wounds: [] }),
    );
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.equal(records(G).length, 0, 'empty wound pile is a reachable no-op, not hollow');
  });

  it('an unresolved [effect:X] marker records a parse-unrecognized hollow event', () => {
    const G = withDiagnosticsFields(makeG({ hooks: [] }));
    // why: hand-build a hook carrying an unresolvedMarkers field (the parser
    // surfaces these; the hook helper does not).
    (G as { villainAbilityHooks: VillainAbilityHook[] }).villainAbilityHooks = [
      {
        cardId: 'v-x' as CardExtId,
        timing: 'onFight',
        keywords: [],
        effects: [],
        unresolvedMarkers: ['mind-control'],
      },
    ];
    executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.equal(records(G).length, 1, 'exactly one hollow record');
    assert.equal(records(G)[0]!.reason, 'parse-unrecognized');
    assert.equal(records(G)[0]!.mechanic, 'mind-control');
  });

  it('the VillainEffectKeyword[] applied return is byte-unchanged when an unhandled effect is present', () => {
    // why: detection is purely additive — a hook mixing a real keyword and an
    // out-of-vocab one returns ONLY the real applied keyword (post-safe-skip
    // contract), identical to before WP-257.
    const G = withDiagnosticsFields(
      makeG({
        hooks: [hook('v-x', 'onFight', ['captureBystander', 'totallyMadeUpKeyword'])],
        bystanders: ['b0'] as CardExtId[],
      }),
    );
    const applied = executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onFight');

    assert.deepStrictEqual(applied, ['captureBystander'], 'applied return byte-unchanged');
    assert.equal(records(G).length, 1, 'the unhandled effect still flags hollow');
  });

  it('does not throw when recording with a non-array G.messages (the makeG default)', () => {
    // why: makeG builds G without a messages array; the writer must no-op the
    // message push without throwing while still storing the record.
    const G = makeG({ hooks: [hook('v-x', 'onAmbush', ['notARealKeyword'])] });
    assert.doesNotThrow(() =>
      executeVillainAbilities(G, CTX, 'v-x' as CardExtId, 'onAmbush'),
    );
    assert.equal(records(G).length, 1, 'record stored even with non-array messages');
  });
});
