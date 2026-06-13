/**
 * End-to-end regression: a henchman Fight: koHeroCurrentPlayer fires
 * through buildInitialGameState → fightVillain, and the target selection
 * honors D-20602 (starter SHIELD card preferred over a recruited hero).
 *
 * The existing extIdReconciliation.e2e.test.ts proves the path for a
 * VILLAIN (mystique) and proves henchman HOOKS exist at the right
 * ext_id, but no test previously exercised the henchman fight → KO
 * end-to-end. This file closes that gap so a future regression of the
 * henchman Fight: dispatch (or of D-20602's target priority through the
 * dispatch boundary) fails loudly here instead of silently in
 * production autoplay.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialGameState } from './buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { fightVillain } from '../moves/fightVillain.js';
import { resolveKoHeroChoice } from '../moves/koHeroChoice.resolve.js';
import { selectDefaultKoTarget } from '../villain/villainEffects.execute.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { LegendaryGameState, CardExtId } from '../types.js';

const SET_ABBR = 'core';

function buildSentinelFocusedRegistry(): CardRegistryReader {
  const setData = {
    abbr: SET_ABBR,
    villains: [
      {
        slug: 'brotherhood',
        cards: [
          {
            slug: 'magneto',
            copies: 2,
            vAttack: '6',
            abilities: ['Ambush: This captures a Bystander. [effect:captureBystander]'],
          },
        ],
      },
    ],
    henchmen: [
      {
        slug: 'sentinel',
        vAttack: '3',
        abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
      },
    ],
    masterminds: [
      {
        slug: 'doc-ock',
        cards: [
          { name: 'Doctor Octopus', slug: 'doc-ock-base', tactic: false, vAttack: '8', abilities: [] },
          { name: 'Tentacle Slam', slug: 'tentacle-slam', tactic: true, vAttack: '5', abilities: [] },
        ],
      },
    ],
    schemes: [{ slug: 'bank-job', cards: [{ abilities: [] }] }],
    heroes: [
      {
        slug: 'spider-man',
        cards: [
          { slug: 'web-strike', name: 'Web Strike', rarityLabel: 'Common 1', attack: '2', recruit: null, cost: 0, abilities: [] },
        ],
        physicalCards: [
          { id: 'p1', count: 5, sides: ['web-strike'] },
        ],
      },
    ],
    bystanders: [],
    wounds: [],
    other: [],
  };

  const flatCards = [
    { key: 'core-villain-brotherhood-magneto', cardType: 'villain', slug: 'magneto', setAbbr: SET_ABBR },
  ];

  return {
    listCards: () => flatCards,
    listSets: () => [{ abbr: SET_ABBR }],
    getSet: (abbr: string) => (abbr === SET_ABBR ? setData : undefined),
  } as unknown as CardRegistryReader;
}

function buildSentinelFocusedConfig(): MatchSetupConfig {
  return {
    schemeId: 'core/bank-job',
    mastermindId: 'core/doc-ock',
    villainGroupIds: ['core/brotherhood'],
    henchmanGroupIds: ['core/sentinel'],
    heroDeckIds: ['core/spider-man'],
    bystandersCount: 8,
    woundsCount: 8,
    officersCount: 5,
    sidekicksCount: 5,
  };
}

type FightVillainContext = Parameters<typeof fightVillain>[0];

describe('henchman Sentinel Fight: koHeroCurrentPlayer fires end-to-end', () => {
  it('emits 10 onFight hooks keyed on henchman-sentinel-NN', () => {
    const gameState = buildInitialGameState(
      buildSentinelFocusedConfig(),
      buildSentinelFocusedRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );

    const sentinelHooks = gameState.villainAbilityHooks.filter((h) =>
      h.cardId.startsWith('henchman-sentinel-'),
    );
    assert.equal(sentinelHooks.length, 10, 'one hook per henchman copy (00–09)');
    for (const hook of sentinelHooks) {
      assert.equal(hook.timing, 'onFight');
      assert.deepStrictEqual(hook.effects, ['koHeroCurrentPlayer']);
    }
  });

  it('WP-242: ≥2 eligible in discard → fightVillain PARKS a choice (no auto-KO); resolving the default KOs the starter SHIELD (D-20602)', () => {
    const gameState = buildInitialGameState(
      buildSentinelFocusedConfig(),
      buildSentinelFocusedRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );

    const sentinelId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('henchman-sentinel-'),
    );
    assert.ok(sentinelId, 'fixture must produce a sentinel instance in the deck');

    gameState.city[0] = sentinelId!;
    gameState.currentStage = 'main';
    gameState.turnEconomy = {
      attack: 10,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    };
    gameState.playerZones['0']!.discard = [
      'core/spider-man/web-strike#00' as CardExtId,
      'starting-shield-agent' as CardExtId,
    ];

    const koBefore = gameState.ko.length;
    const context = {
      G: gameState,
      ctx: { currentPlayer: '0' },
    } as unknown as FightVillainContext;
    fightVillain(context, { cityIndex: 0 });

    // why: WP-242 — two eligible heroes is a player choice now; the Fight
    // effect parks instead of auto-KOing.
    assert.equal(gameState.ko.length, koBefore, 'no auto-KO when ≥2 eligible — a choice is parked');
    assert.equal(gameState.pendingKoHeroChoices?.length, 1, 'one pending KO choice appended');

    // Resolve via the default (bot/auto) pick — D-20602 starter-first priority.
    const defaultTarget = selectDefaultKoTarget(gameState.playerZones['0']!);
    assert.deepStrictEqual(
      defaultTarget,
      { zone: 'discard', cardId: 'starting-shield-agent' },
      'D-20602: starter SHIELD is the default/auto KO target ahead of the recruited hero',
    );
    resolveKoHeroChoice(
      { G: gameState, playerID: '0' } as unknown as Parameters<typeof resolveKoHeroChoice>[0],
      defaultTarget!,
    );
    assert.deepStrictEqual(
      gameState.ko,
      ['starting-shield-agent'],
      'resolving KOs the starter SHIELD card',
    );
    assert.equal(gameState.pendingKoHeroChoices!.length, 0, 'queue front-popped after resolve');
  });

  it('D-20603: turn-1 autoplay state (cards in inPlay, empty hand+discard) KOs from inPlay', () => {
    // why: this is the production-observed bug Jeff reported, now FIXED
    // by D-20603. Autoplay flow per turn:
    //   1. Bot plays all hand cards via `playCard` (hand → inPlay)
    //   2. Spend loop runs `fightVillain` against any affordable target
    //   3. End-of-turn cleanup moves inPlay → discard
    // So during the spend loop on turn 1, the bot's state is:
    //   hand:    [] (all played)
    //   inPlay:  [starter SHIELD cards]
    //   discard: [] (nothing in the discard yet — cleanup runs at end)
    // Pre-D-20603 the resolver only inspected discard then hand — both
    // empty here — so koOneHeroForPlayer no-opped and G.ko stayed empty
    // even though 6 perfectly KO-able starter cards sat in inPlay. The
    // Sentinel still went to victory pile but the KO pile UI stayed
    // empty, defeating the deck-thinning purpose of the printed text.
    // D-20603 adds inPlay as the third tier so the KO fires correctly,
    // preserving D-20602's starter-first priority within the tier.
    const gameState = buildInitialGameState(
      buildSentinelFocusedConfig(),
      buildSentinelFocusedRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );

    const sentinelId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('henchman-sentinel-'),
    );
    assert.ok(sentinelId);

    gameState.city[0] = sentinelId!;
    gameState.currentStage = 'main';
    gameState.turnEconomy = {
      attack: 10,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    };
    // why: the turn-1 spend-phase shape — starter SHIELD cards committed
    // to inPlay (already generated their attack), hand drained, discard
    // empty because the turn hasn't ended yet.
    gameState.playerZones['0']!.hand = [];
    gameState.playerZones['0']!.discard = [];
    gameState.playerZones['0']!.inPlay = [
      'starting-shield-trooper' as CardExtId,
      'starting-shield-trooper' as CardExtId,
      'starting-shield-trooper' as CardExtId,
      'starting-shield-agent' as CardExtId,
      'starting-shield-agent' as CardExtId,
      'starting-shield-agent' as CardExtId,
    ];

    const koBefore = gameState.ko.length;
    const inPlayBefore = [...gameState.playerZones['0']!.inPlay];
    const context = {
      G: gameState,
      ctx: { currentPlayer: '0' },
    } as unknown as FightVillainContext;
    fightVillain(context, { cityIndex: 0 });

    assert.equal(gameState.city[0], null, 'sentinel still leaves city');
    assert.ok(
      gameState.playerZones['0']!.victory.includes(sentinelId!),
      'sentinel still enters victory pile',
    );
    // why: WP-242 — six eligible inPlay heroes is a player choice; the Fight
    // effect parks rather than auto-KOing.
    assert.equal(
      gameState.ko.length,
      koBefore,
      'WP-242: no auto-KO when ≥2 eligible — a choice is parked',
    );
    assert.equal(gameState.pendingKoHeroChoices?.length, 1, 'one pending KO choice appended');

    // why: D-20603 inPlay tier + D-20602 starter-first carries forward into the
    // bot/auto default pick — Agent sorts lex-before Trooper, so the first agent
    // is the default target.
    const defaultTarget = selectDefaultKoTarget(gameState.playerZones['0']!);
    assert.deepStrictEqual(
      defaultTarget,
      { zone: 'inPlay', cardId: 'starting-shield-agent' },
      'D-20603 + D-20602: default KO target is the first inPlay starter agent',
    );
    resolveKoHeroChoice(
      { G: gameState, playerID: '0' } as unknown as Parameters<typeof resolveKoHeroChoice>[0],
      defaultTarget!,
    );
    assert.deepStrictEqual(
      gameState.ko,
      ['starting-shield-agent'],
      'resolving KOs the inPlay starter agent',
    );
    assert.equal(
      gameState.playerZones['0']!.inPlay.length,
      inPlayBefore.length - 1,
      'inPlay loses exactly one card to the resolved KO',
    );
  });

  it('D-20603: zone priority is discard → hand → inPlay (discard still wins)', () => {
    // why: the third tier MUST NOT preempt the first two. When a player
    // has heroes in discard (the common case from turn 2+), the resolver
    // KOs from discard exactly as before D-20603. Pinning this ensures
    // the broadening is additive and the existing zone-priority lock
    // from D-18503 carries forward.
    const gameState = buildInitialGameState(
      buildSentinelFocusedConfig(),
      buildSentinelFocusedRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );

    const sentinelId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('henchman-sentinel-'),
    );
    assert.ok(sentinelId);

    gameState.city[0] = sentinelId!;
    gameState.currentStage = 'main';
    gameState.turnEconomy = {
      attack: 10,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    };
    gameState.playerZones['0']!.discard = ['starting-shield-trooper' as CardExtId];
    gameState.playerZones['0']!.hand = ['starting-shield-agent' as CardExtId];
    gameState.playerZones['0']!.inPlay = ['starting-shield-agent' as CardExtId];

    const context = {
      G: gameState,
      ctx: { currentPlayer: '0' },
    } as unknown as FightVillainContext;
    fightVillain(context, { cityIndex: 0 });

    // why: WP-242 — three eligible heroes across three zones is a player
    // choice; the Fight effect parks. The default pick still honours the
    // discard → hand → inPlay zone priority (D-18503).
    assert.deepStrictEqual(gameState.ko, [], 'no auto-KO when ≥2 eligible — parked');
    assert.equal(gameState.pendingKoHeroChoices?.length, 1, 'one pending KO choice appended');
    const defaultTarget = selectDefaultKoTarget(gameState.playerZones['0']!);
    assert.deepStrictEqual(
      defaultTarget,
      { zone: 'discard', cardId: 'starting-shield-trooper' },
      'discard wins over hand and inPlay (D-18503 zone priority preserved)',
    );
    resolveKoHeroChoice(
      { G: gameState, playerID: '0' } as unknown as Parameters<typeof resolveKoHeroChoice>[0],
      defaultTarget!,
    );
    assert.deepStrictEqual(
      gameState.ko,
      ['starting-shield-trooper'],
      'resolving the default KOs the discard trooper',
    );
    assert.equal(
      gameState.playerZones['0']!.hand.length,
      1,
      'hand untouched',
    );
    assert.equal(
      gameState.playerZones['0']!.inPlay.length,
      1,
      'inPlay untouched',
    );
  });

  it('D-20603: zone priority is discard → hand → inPlay (hand wins over inPlay when discard empty)', () => {
    const gameState = buildInitialGameState(
      buildSentinelFocusedConfig(),
      buildSentinelFocusedRegistry(),
      makeMockCtx({ numPlayers: 2 }),
    );

    const sentinelId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('henchman-sentinel-'),
    );
    assert.ok(sentinelId);

    gameState.city[0] = sentinelId!;
    gameState.currentStage = 'main';
    gameState.turnEconomy = {
      attack: 10,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    };
    gameState.playerZones['0']!.discard = [];
    gameState.playerZones['0']!.hand = ['starting-shield-trooper' as CardExtId];
    gameState.playerZones['0']!.inPlay = ['starting-shield-agent' as CardExtId];

    const context = {
      G: gameState,
      ctx: { currentPlayer: '0' },
    } as unknown as FightVillainContext;
    fightVillain(context, { cityIndex: 0 });

    // why: WP-242 — two eligible heroes (hand + inPlay) is a player choice; the
    // Fight effect parks. The default pick honours hand-over-inPlay priority.
    assert.deepStrictEqual(gameState.ko, [], 'no auto-KO when ≥2 eligible — parked');
    assert.equal(gameState.pendingKoHeroChoices?.length, 1, 'one pending KO choice appended');
    const defaultTarget = selectDefaultKoTarget(gameState.playerZones['0']!);
    assert.deepStrictEqual(
      defaultTarget,
      { zone: 'hand', cardId: 'starting-shield-trooper' },
      'hand wins over inPlay when discard is empty',
    );
    resolveKoHeroChoice(
      { G: gameState, playerID: '0' } as unknown as Parameters<typeof resolveKoHeroChoice>[0],
      defaultTarget!,
    );
    assert.deepStrictEqual(
      gameState.ko,
      ['starting-shield-trooper'],
      'resolving the default KOs the hand trooper',
    );
    assert.equal(
      gameState.playerZones['0']!.inPlay.length,
      1,
      'inPlay untouched while hand had a target',
    );
  });
});
