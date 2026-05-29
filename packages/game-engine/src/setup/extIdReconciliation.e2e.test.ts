/**
 * End-to-end ext_id grammar reconciliation test (WP-191 / EC-218).
 *
 * Drives buildInitialGameState on a POPULATED mock registry (villains with
 * copies > 1, vAttack, an `Ambush:` line carrying `[effect:captureBystander]`,
 * and a `Fight:` line; a hero deck with physicalCards + an MVP-keyword ability
 * line) and proves the four per-card lookup tables resolve end-to-end at the
 * zone-instance grammar:
 *
 *   - villain `fightCost` is spent at the copy-indexed City id,
 *   - a villain `Ambush:` effect fires (hasAmbush true + executeVillainAbilities),
 *   - a villain `Fight:` effect fires (one KO),
 *   - a hero ability fires (getHooksForCard hits the slash instance id).
 *
 * Plus the reconciliation invariant: every key in G.cardStats / G.cardKeywords /
 * G.villainAbilityHooks / G.heroAbilityHooks is a valid instance key (no
 * definition/dash-keyed table re-introduced). A failure here means a per-card
 * lookup table drifted back to a definition/dash key — the whole D-18508 bug
 * class. This test MUST NOT hand-author any lookup-table key: every key is
 * obtained via buildInitialGameState, and every hit is asserted using an id
 * that originated in a G deck / city / hand / hero zone, so a self-consistent
 * fake cannot pass while real games stay broken.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialGameState } from './buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { fightVillain } from '../moves/fightVillain.js';
import { executeVillainAbilities } from '../villain/villainEffects.execute.js';
import { executeHeroEffects } from '../hero/heroEffects.execute.js';
import { hasAmbush } from '../board/boardKeywords.logic.js';
import { getHooksForCard } from '../rules/heroAbility.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { LegendaryGameState, CardExtId } from '../types.js';

// ---------------------------------------------------------------------------
// Populated mock registry
// ---------------------------------------------------------------------------

const SET_ABBR = 'core';

/**
 * Builds a populated registry: a Brotherhood villain group (magneto with an
 * Ambush:captureBystander line, mystique with a Fight:koHeroCurrentPlayer
 * line, both copies:2), a Hand Ninjas henchman group with a Fight line, and a
 * Spider-Man hero deck whose cards carry MVP-keyword ability lines. listCards
 * returns villain FlatCards (the definition keys buildCardKeywords gates on)
 * but NO hero FlatCards, so buildCardStats §1's dead dash rows are not emitted
 * and cannot pollute the reconciliation invariant (those rows are out of scope
 * per D-18707 and only appear when listCards exposes hero cards).
 */
function buildPopulatedRegistry(): CardRegistryReader {
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
          {
            slug: 'mystique',
            copies: 2,
            vAttack: '4',
            abilities: ['Fight: KO one of your Heroes. [effect:koHeroCurrentPlayer]'],
          },
        ],
      },
    ],
    henchmen: [
      {
        slug: 'hand-ninjas',
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
          { slug: 'web-strike', name: 'Web Strike', rarityLabel: 'Common 1', attack: '2', recruit: null, cost: 0, abilities: ['[keyword:ko] KO this card.'] },
          { slug: 'spider-sense', name: 'Spider Sense', rarityLabel: 'Common 2', attack: null, recruit: '2', cost: 3, abilities: ['You get +1[icon:recruit].'] },
          { slug: 'wall-crawl', name: 'Wall Crawl', rarityLabel: 'Uncommon', attack: '1', recruit: '1', cost: 4, abilities: ['You get +1[icon:attack].'] },
          { slug: 'the-amazing', name: 'The Amazing Spider-Man', rarityLabel: 'Rare', attack: '4', recruit: null, cost: 6, abilities: ['You get +3[icon:attack].'] },
        ],
        physicalCards: [
          { id: 'p1', count: 5, sides: ['web-strike'] },
          { id: 'p2', count: 3, sides: ['spider-sense'] },
          { id: 'p3', count: 3, sides: ['wall-crawl'] },
          { id: 'p4', count: 3, sides: ['the-amazing'] },
        ],
      },
    ],
    bystanders: [],
    wounds: [],
    other: [],
  };

  // why: buildCardKeywords gates `ambush` emission on the villain definition
  // key existing in listCards (a real listed villain). Provide villain
  // FlatCards only — NO hero FlatCards (see buildPopulatedRegistry doc).
  const flatCards = [
    { key: 'core-villain-brotherhood-magneto', cardType: 'villain', slug: 'magneto', setAbbr: SET_ABBR },
    { key: 'core-villain-brotherhood-mystique', cardType: 'villain', slug: 'mystique', setAbbr: SET_ABBR },
  ];

  return {
    listCards: () => flatCards,
    listSets: () => [{ abbr: SET_ABBR }],
    getSet: (abbr: string) => (abbr === SET_ABBR ? setData : undefined),
  } as unknown as CardRegistryReader;
}

/**
 * The Brotherhood / Hand Ninjas / Doc Ock / Bank Job loadout config.
 */
function buildPopulatedConfig(): MatchSetupConfig {
  return {
    schemeId: 'core/bank-job',
    mastermindId: 'core/doc-ock',
    villainGroupIds: ['core/brotherhood'],
    henchmanGroupIds: ['core/hand-ninjas'],
    heroDeckIds: ['core/spider-man'],
    bystandersCount: 8,
    woundsCount: 8,
    officersCount: 5,
    sidekicksCount: 5,
  };
}

/**
 * Builds the initial game state for the populated loadout.
 */
function buildPopulatedGameState(): LegendaryGameState {
  return buildInitialGameState(buildPopulatedConfig(), buildPopulatedRegistry(), makeMockCtx({ numPlayers: 2 }));
}

/** Collects every hero slash-instance id reachable in the hero reservoir. */
function heroReservoirIds(gameState: LegendaryGameState): CardExtId[] {
  const ids: CardExtId[] = [...gameState.heroDeck];
  for (const slot of gameState.hq) {
    if (slot !== null) ids.push(slot);
  }
  return ids;
}

/** Minimal move context for the fightVillain fire site (reads G + ctx only). */
type FightVillainContext = Parameters<typeof fightVillain>[0];

// ---------------------------------------------------------------------------
// Reconciliation invariant
// ---------------------------------------------------------------------------

/**
 * Asserts one lookup-table key conforms to the WP-191 instance grammar.
 *
 * Forbidden: any key containing `-hero-` (a dash/slot hero key) or a
 * `-villain-` key lacking the `-NN` copy suffix (a villain definition key).
 * Slash keys (hero instances) must carry the `#` copy suffix. Henchman /
 * mastermind / starting / bystander / scheme-twist / master-strike keys trip
 * none of these and are left untouched.
 */
function assertValidInstanceKey(key: string, source: string): void {
  assert.ok(
    !key.includes('-hero-'),
    `${source} key '${key}' is a forbidden dash/slot hero key (must be a slash instance id)`,
  );
  if (key.includes('-villain-')) {
    assert.ok(
      /-\d\d$/.test(key),
      `${source} key '${key}' is a forbidden villain definition key (missing the -NN copy suffix)`,
    );
  }
  if (key.includes('/')) {
    assert.ok(
      key.includes('#'),
      `${source} key '${key}' is a slash key without a # copy suffix (incomplete hero instance id)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ext_id grammar reconciliation — reconciliation invariant (WP-191)', () => {
  it('every lookup-table key is a valid instance key (no definition/dash key)', () => {
    const gameState = buildPopulatedGameState();

    for (const key of Object.keys(gameState.cardStats)) {
      assertValidInstanceKey(key, 'cardStats');
    }
    for (const key of Object.keys(gameState.cardKeywords)) {
      assertValidInstanceKey(key, 'cardKeywords');
    }
    for (const hook of gameState.villainAbilityHooks) {
      assertValidInstanceKey(hook.cardId, 'villainAbilityHooks');
    }
    for (const hook of gameState.heroAbilityHooks) {
      assertValidInstanceKey(hook.cardId, 'heroAbilityHooks');
    }
  });

  it('every villain in the villain deck has a fightCost stat equal to its vAttack', () => {
    const gameState = buildPopulatedGameState();

    // why: vAttack lives only on the registry villain card; the runtime fight
    // site reads G.cardStats[cityCardId].fightCost. Before WP-191 this missed
    // (definition key vs copy-indexed city id) and defaulted to 0.
    const expectedFightCost: Record<string, number> = { magneto: 6, mystique: 4 };
    const villainIds = gameState.villainDeck.deck.filter(
      (id) => gameState.villainDeckCardTypes[id] === 'villain',
    );
    assert.ok(villainIds.length > 0, 'fixture must place villains in the deck');

    for (const villainId of villainIds) {
      const entry = gameState.cardStats[villainId];
      assert.ok(entry, `cardStats must include villain instance ${villainId}`);
      const cardSlug = villainId.includes('magneto') ? 'magneto' : 'mystique';
      assert.equal(
        entry.fightCost,
        expectedFightCost[cardSlug],
        `${villainId} fightCost must equal the card's parsed vAttack (no 0 default)`,
      );
    }
  });

  it('henchman keys remain copy-indexed (regression guard)', () => {
    const gameState = buildPopulatedGameState();

    for (let copyIndex = 0; copyIndex < 10; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const henchmanId = `henchman-hand-ninjas-${paddedIndex}` as CardExtId;
      assert.ok(
        gameState.cardStats[henchmanId],
        `henchman cardStats must remain copy-indexed (${henchmanId})`,
      );
      const henchmanHook = gameState.villainAbilityHooks.find((h) => h.cardId === henchmanId);
      assert.ok(
        henchmanHook,
        `henchman villainAbilityHooks must remain copy-indexed (${henchmanId})`,
      );
    }
  });

  it('gate-consistency: every onAmbush hook satisfies hasAmbush at the instance id (D-18507)', () => {
    const gameState = buildPopulatedGameState();
    const keywords = gameState.cardKeywords ?? {};

    const ambushHooks = gameState.villainAbilityHooks.filter((h) => h.timing === 'onAmbush');
    assert.ok(ambushHooks.length > 0, 'fixture must produce onAmbush hooks');
    for (const hook of ambushHooks) {
      assert.equal(
        hasAmbush(hook.cardId, keywords),
        true,
        `onAmbush hook ${hook.cardId} must satisfy hasAmbush at the copy-indexed instance id`,
      );
    }
  });
});

describe('ext_id grammar reconciliation — end-to-end effect resolution (WP-191)', () => {
  it('fighting a villain spends its fightCost AND fires its Fight: effect (one KO)', () => {
    const gameState = buildPopulatedGameState();

    // why: obtain a real copy-indexed mystique instance from the villain deck
    // (NOT hand-authored) and move it into the City — exactly the id the fight
    // fire site reads.
    const mystiqueId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('core-villain-brotherhood-mystique-'),
    );
    assert.ok(mystiqueId, 'fixture must produce a mystique instance in the deck');

    // Give the current player a hero in discard so the Fight: KO has a target.
    const heroKoTarget = heroReservoirIds(gameState).find((id) =>
      id.startsWith('core/spider-man/'),
    );
    assert.ok(heroKoTarget, 'fixture must produce hero reservoir cards');

    gameState.city[0] = mystiqueId!;
    gameState.currentStage = 'main';
    gameState.turnEconomy = {
      attack: 10,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    };
    gameState.playerZones['0']!.discard = [heroKoTarget!];

    const koBefore = gameState.ko.length;

    const context = {
      G: gameState,
      ctx: { currentPlayer: '0' },
    } as unknown as FightVillainContext;
    fightVillain(context, { cityIndex: 0 });

    assert.equal(
      gameState.turnEconomy.spentAttack,
      4,
      'fightVillain must spend the mystique fightCost (4) — proving G.cardStats hits the city instance id',
    );
    assert.equal(gameState.city[0], null, 'the fought villain must leave the City');
    assert.ok(
      gameState.playerZones['0']!.victory.includes(mystiqueId!),
      'the fought villain must enter the victory pile',
    );
    assert.equal(
      gameState.ko.length,
      koBefore + 1,
      'the Fight: koHeroCurrentPlayer effect must fire exactly one KO via the now-hitting hook lookup',
    );
    assert.ok(
      gameState.ko.includes(heroKoTarget!),
      'the hero in discard must be the KO target',
    );
  });

  it('a villain Ambush: effect fires (hasAmbush true + captureBystander attaches)', () => {
    const gameState = buildPopulatedGameState();

    const magnetoId = gameState.villainDeck.deck.find((id) =>
      id.startsWith('core-villain-brotherhood-magneto-'),
    );
    assert.ok(magnetoId, 'fixture must produce a magneto instance in the deck');

    // The reveal fire site gates on hasAmbush(cityId) then fires onAmbush.
    assert.equal(
      hasAmbush(magnetoId!, gameState.cardKeywords ?? {}),
      true,
      'hasAmbush must be true for the copy-indexed magneto instance id',
    );

    gameState.city[1] = magnetoId!;
    const bystandersBefore = gameState.piles.bystanders.length;
    assert.ok(bystandersBefore > 0, 'bystander pile must be non-empty to capture from');

    executeVillainAbilities(gameState, { currentPlayer: '0' }, magnetoId!, 'onAmbush');

    assert.equal(
      gameState.piles.bystanders.length,
      bystandersBefore - 1,
      'captureBystander must remove one bystander from the supply',
    );
    const attached = gameState.attachedBystanders[magnetoId!];
    assert.ok(
      Array.isArray(attached) && attached.length === 1,
      'the captured bystander must attach to the magneto instance — proving the onAmbush hook lookup hits',
    );
  });

  it('playing a hero fires its ability (getHooksForCard hits the slash instance id)', () => {
    const gameState = buildPopulatedGameState();

    // web-strike carries [keyword:ko]; obtain a real reservoir instance id.
    const heroKoId = heroReservoirIds(gameState).find((id) =>
      id.startsWith('core/spider-man/web-strike#'),
    );
    assert.ok(heroKoId, 'fixture must produce a web-strike hero instance');

    assert.ok(
      getHooksForCard(gameState.heroAbilityHooks, heroKoId!).length >= 1,
      'getHooksForCard must return a hook for the slash-format played-card id',
    );

    // Play it into inPlay, then fire the hero effect (the coreMoves play site
    // calls executeHeroEffects with the played-card zone id).
    gameState.playerZones['0']!.inPlay = [heroKoId!];
    executeHeroEffects(gameState, makeMockCtx(), '0', heroKoId!);

    assert.ok(
      gameState.ko.includes(heroKoId!),
      'the [keyword:ko] ability must KO the played card — proving the hero hook lookup hits',
    );
    assert.ok(
      !gameState.playerZones['0']!.inPlay.includes(heroKoId!),
      'the KO must remove the played card from inPlay',
    );
  });

  it('hero setup coverage: every reservoir hero instance with an ability line has ≥1 hook', () => {
    const gameState = buildPopulatedGameState();

    const heroIds = heroReservoirIds(gameState).filter((id) => id.startsWith('core/spider-man/'));
    assert.ok(heroIds.length > 0, 'fixture must populate the hero reservoir');

    // Every spider-man card carries an MVP-keyword ability line, so every
    // reservoir instance must resolve to at least one hook (hooks built under
    // the right slash instance ids, not merely built).
    for (const heroId of heroIds) {
      assert.ok(
        getHooksForCard(gameState.heroAbilityHooks, heroId).length >= 1,
        `hero reservoir instance ${heroId} must have at least one ability hook`,
      );
    }
  });
});
