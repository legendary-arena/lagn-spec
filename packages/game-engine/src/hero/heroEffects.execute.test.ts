/**
 * Tests for hero effect execution (WP-022).
 *
 * Verifies the 4 MVP keywords ('draw', 'attack', 'recruit', 'ko'),
 * conditional skip behavior, unsupported keyword handling, magnitude
 * validation, execution order, determinism, and JSON serializability.
 *
 * No boardgame.io imports. Uses makeMockCtx for ShuffleProvider.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeHeroEffects, selectDefaultOptionalKoTarget, MVP_KEYWORDS, HANDLED_KEYWORDS, HERO_EFFECT_HANDLERS } from './heroEffects.execute.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { LegendaryGameState, PendingHeroChoice } from '../types.js';
import type { HeroAbilityHook, HeroEffectDescriptor } from '../rules/heroAbility.types.js';
import type { HeroKeyword } from '../rules/heroKeywords.js';
import { revealRulesForLegacyKeyword } from '../rules/revealRule.js';
import { HERO_COMPOSITION_MARKERS, buildEmpoweredComposition } from '../rules/heroCompositions.js';

// why: WP-253 Amendment-A — the pre-existing reveal fixtures hand-built legacy
// `{ type: 'reveal-ko' }` descriptors; once those keywords lose their handlers
// (folded into the single 'reveal' handler, D-24024) the executor reads
// `effect.revealRules`, so every reveal fixture migrates its INPUT shape to the
// collapsed descriptor. This is a fixture-shape migration, NOT a behavior change:
// revealRulesForLegacyKeyword translates the legacy keyword's magnitude into the
// exact branch-list its former handler hard-coded, so every assertion OUTPUT stays
// byte-identical. The hook's `keywords` field keeps the legacy keyword (narrative).
function legacyRevealEffect(keyword: HeroKeyword, magnitude: number | undefined): HeroEffectDescriptor {
  return { type: 'reveal', revealCount: 1, revealRules: revealRulesForLegacyKeyword(keyword, magnitude) };
}

// ---------------------------------------------------------------------------
// Registry drift (WP-251 / D-24022)
// ---------------------------------------------------------------------------

describe('HERO_EFFECT_HANDLERS registry drift (WP-251 / D-24022; re-spec WP-253 / D-24024)', () => {
  // why: replacing the exhaustive `switch` with a map removes TypeScript's
  // exhaustiveness check, so this runtime guard takes its place. WP-253 splits the
  // single concern into two: HANDLED_KEYWORDS pins handler completeness (a handler
  // key not in it, or a HANDLED keyword with no handler, fails); MVP_KEYWORDS pins
  // executable-keyword coverage (a keyword with neither a handler NOR a reveal
  // translation fails). The hard count drops 15 → 8 because the 7 legacy reveal-*
  // keywords lost their dedicated handlers (folded into the one 'reveal' handler).
  it('keys equal HANDLED_KEYWORDS exactly (bidirectional)', () => {
    const handlerKeys = Object.keys(HERO_EFFECT_HANDLERS).sort();
    const handledKeys = [...HANDLED_KEYWORDS].sort();
    assert.deepStrictEqual(
      handlerKeys,
      handledKeys,
      'HERO_EFFECT_HANDLERS keys must equal HANDLED_KEYWORDS exactly',
    );
  });

  it('has exactly 8 handlers and none for the deferred keywords', () => {
    assert.equal(Object.keys(HERO_EFFECT_HANDLERS).length, 8);
    assert.equal(HERO_EFFECT_HANDLERS['wound'], undefined);
    assert.equal(HERO_EFFECT_HANDLERS['conditional'], undefined);
  });

  // why: every executable keyword must be reachable — EITHER it has a handler, OR
  // it is a frozen legacy reveal keyword that translates to a non-empty reveal
  // branch-list for a valid magnitude (M=1 is valid for every magnitude-requiring
  // reveal keyword and ignored by the no-magnitude ones). A keyword with neither
  // fails here, so the reveal collapse cannot silently drop an executable keyword.
  it('every MVP_KEYWORD is handled directly or via reveal translation (D-24024)', () => {
    for (const keyword of MVP_KEYWORDS) {
      const hasHandler = HERO_EFFECT_HANDLERS[keyword as HeroKeyword] !== undefined;
      const translates = revealRulesForLegacyKeyword(keyword as HeroKeyword, 1).length > 0;
      assert.ok(
        hasHandler || translates,
        `MVP keyword "${keyword}" must be handled directly or via reveal translation`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for hero effect testing.
 *
 * @param overrides - Partial overrides for player zones and hooks.
 * @returns A minimal LegendaryGameState.
 */
function makeTestState(overrides?: {
  deck?: string[];
  hand?: string[];
  discard?: string[];
  inPlay?: string[];
  victory?: string[];
  bystanders?: string[];
  heroAbilityHooks?: HeroAbilityHook[];
  turnEconomyAttack?: number;
  turnEconomyRecruit?: number;
  ko?: string[];
  cardStats?: Record<string, { attack: number; recruit: number; cost: number; fightCost: number; fightCostMode: 'static' | 'dynamic'; fightCostBase: number }>;
  pendingHeroChoice?: PendingHeroChoice;
}): LegendaryGameState {
  return {
    matchConfiguration: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    },
    selection: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
    },
    currentStage: 'main' as LegendaryGameState['currentStage'],
    playerZones: {
      '0': {
        deck: overrides?.deck ?? [],
        hand: overrides?.hand ?? [],
        discard: overrides?.discard ?? [],
        inPlay: overrides?.inPlay ?? [],
        victory: overrides?.victory ?? [],
      },
    },
    piles: {
      bystanders: overrides?.bystanders ?? [],
      wounds: [],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: [],
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: overrides?.ko ?? [],
    attachedBystanders: {},
    turnEconomy: {
      attack: overrides?.turnEconomyAttack ?? 0,
      recruit: overrides?.turnEconomyRecruit ?? 0,
      spentAttack: 0,
      spentRecruit: 0,
    },
    cardStats: overrides?.cardStats ?? {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
    },
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
    heroAbilityHooks: overrides?.heroAbilityHooks ?? [],
    ...(overrides?.pendingHeroChoice !== undefined ? { pendingHeroChoice: overrides.pendingHeroChoice } : {}),
  };
}

describe('executeHeroEffects', () => {
  // why: makeMockCtx provides ShuffleProvider-compatible context
  // (random.Shuffle reverses arrays for determinism)
  const mockCtx = makeMockCtx();

  // -------------------------------------------------------------------------
  // Test 1: draw keyword
  // -------------------------------------------------------------------------
  it('draw effect draws N cards from deck to hand', () => {
    const gameState = makeTestState({
      deck: ['card-a', 'card-b', 'card-c'],
      hand: [],
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['draw'],
          effects: [{ type: 'draw', magnitude: 2 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.playerZones['0'].hand.length, 2,
      'Player should have drawn 2 cards into hand.');
    assert.equal(gameState.playerZones['0'].deck.length, 1,
      'Deck should have 1 card remaining after drawing 2.');
  });

  // -------------------------------------------------------------------------
  // Test 2: attack keyword
  // -------------------------------------------------------------------------
  it('attack effect increases turnEconomy.attack by N', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack'],
          effects: [{ type: 'attack', magnitude: 3 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 3,
      'turnEconomy.attack should increase by 3.');
    assert.equal(gameState.turnEconomy.recruit, 0,
      'turnEconomy.recruit should remain unchanged.');
  });

  // -------------------------------------------------------------------------
  // Test 3: recruit keyword
  // -------------------------------------------------------------------------
  it('recruit effect increases turnEconomy.recruit by N', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['recruit'],
          effects: [{ type: 'recruit', magnitude: 2 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.recruit, 2,
      'turnEconomy.recruit should increase by 2.');
    assert.equal(gameState.turnEconomy.attack, 0,
      'turnEconomy.attack should remain unchanged.');
  });

  // -------------------------------------------------------------------------
  // Test 4: ko keyword
  // -------------------------------------------------------------------------
  it('ko effect removes the played card from inPlay and adds to G.ko', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x', 'hero-y'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['ko'],
          effects: [{ type: 'ko' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].inPlay, ['hero-y'],
      'hero-x should be removed from inPlay.');
    assert.deepEqual(gameState.ko, ['hero-x'],
      'hero-x should be added to the KO pile.');
  });

  // -------------------------------------------------------------------------
  // Test 5: conditional hook skipped
  // -------------------------------------------------------------------------
  it('hook with conditions is skipped — no G mutation', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack'],
          conditions: [{ type: 'heroClassMatch', value: 'strength' }],
          effects: [{ type: 'attack', magnitude: 5 }],
        },
      ],
    });

    // Snapshot relevant subtrees before execution
    const economyBefore = { ...gameState.turnEconomy };
    const inPlayBefore = [...gameState.playerZones['0'].inPlay];

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.turnEconomy, economyBefore,
      'turnEconomy should not change when conditions are present.');
    assert.deepEqual(gameState.playerZones['0'].inPlay, inPlayBefore,
      'inPlay should not change when conditions are present.');
  });

  // -------------------------------------------------------------------------
  // Test 6: unsupported keyword skipped
  // -------------------------------------------------------------------------
  it('unsupported keyword (wound) is skipped — no G mutation', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['wound'],
          effects: [{ type: 'wound', magnitude: 1 }],
        },
      ],
    });

    const economyBefore = { ...gameState.turnEconomy };
    const koBefore = [...gameState.ko];

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.turnEconomy, economyBefore,
      'turnEconomy should not change for unsupported keyword.');
    assert.deepEqual(gameState.ko, koBefore,
      'KO pile should not change for unsupported keyword.');
  });

  // -------------------------------------------------------------------------
  // Test 12: rescue — moves top bystander to victory (AC-3)
  // -------------------------------------------------------------------------
  it('rescue effect moves top bystander to victory zone', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      bystanders: ['b-1', 'b-2'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['rescue'],
          effects: [{ type: 'rescue', magnitude: 1 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].victory, ['b-1'],
      'b-1 should be moved to the victory zone.');
    assert.deepEqual(gameState.piles.bystanders, ['b-2'],
      'bystander pile should have b-2 remaining.');
  });

  // -------------------------------------------------------------------------
  // Test 13: rescue — empty bystander pile is a silent no-op (AC-4)
  // -------------------------------------------------------------------------
  it('rescue effect is a no-op when bystander pile is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      bystanders: [],
      victory: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['rescue'],
          effects: [{ type: 'rescue', magnitude: 1 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].victory, [],
      'victory zone should remain empty when no bystanders available.');
    assert.deepEqual(gameState.piles.bystanders, [],
      'bystander pile should remain empty.');
  });

  // -------------------------------------------------------------------------
  // Test 14: rescue — magnitude defaults to 1 when undefined
  // -------------------------------------------------------------------------
  it('rescue effect defaults to magnitude 1 when magnitude is undefined', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      bystanders: ['b-1', 'b-2', 'b-3'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['rescue'],
          effects: [{ type: 'rescue' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.playerZones['0'].victory.length, 1,
      'exactly 1 bystander should be rescued when magnitude is undefined.');
    assert.equal(gameState.piles.bystanders.length, 2,
      'bystander pile should have 2 remaining.');
  });

  // -------------------------------------------------------------------------
  // Test 15: reveal — draws card when cost <= threshold (AC-5)
  // -------------------------------------------------------------------------
  it('reveal effect draws top card to hand when cost is within threshold', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['hero-y'],
      'hero-y should move to hand when its cost is within threshold.');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should be empty after the card is drawn.');
  });

  // -------------------------------------------------------------------------
  // Test 16: reveal — card stays on deck when cost > threshold (AC-6)
  // -------------------------------------------------------------------------
  it('reveal effect leaves card on deck when cost exceeds threshold', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'hero-y should remain on top of deck when cost exceeds threshold.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when card is not drawn.');
  });

  // -------------------------------------------------------------------------
  // Test 17: reveal — empty deck is a silent no-op (AC-7)
  // -------------------------------------------------------------------------
  it('reveal effect is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should remain empty.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when deck is empty.');
  });

  // -------------------------------------------------------------------------
  // Test 18: reveal — missing cardStats entry is a silent no-op (AC-8)
  // -------------------------------------------------------------------------
  it('reveal effect is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['starter-agent'],
      cardStats: {},
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['starter-agent'],
      'starter-agent should remain on deck when its stats are unknown.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when stats entry is missing.');
  });

  // -------------------------------------------------------------------------
  // Test 19: reveal — invalid magnitude skips execution
  // -------------------------------------------------------------------------
  it('reveal effect is skipped when magnitude is undefined', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when reveal magnitude is undefined.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should be unchanged when reveal magnitude is undefined.');
  });

  // -------------------------------------------------------------------------
  // Test 7: undefined/empty effects array
  // -------------------------------------------------------------------------
  it('hook with undefined or empty effects produces no mutation', () => {
    const gameState = makeTestState({
      inPlay: ['hero-a', 'hero-b'],
      heroAbilityHooks: [
        {
          cardId: 'hero-a' as string,
          timing: 'onPlay',
          keywords: ['attack'],
          // effects is undefined
        },
        {
          cardId: 'hero-b' as string,
          timing: 'onPlay',
          keywords: ['recruit'],
          effects: [],
        },
      ],
    });

    const economyBefore = { ...gameState.turnEconomy };

    executeHeroEffects(gameState, mockCtx, '0', 'hero-a' as string);
    executeHeroEffects(gameState, mockCtx, '0', 'hero-b' as string);

    assert.deepEqual(gameState.turnEconomy, economyBefore,
      'turnEconomy should not change for hooks with no effects.');
  });

  // -------------------------------------------------------------------------
  // Test 8: invalid magnitude skipped
  // -------------------------------------------------------------------------
  it('effect with invalid magnitude is skipped — no mutation', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack'],
          effects: [
            { type: 'attack', magnitude: undefined },
            { type: 'attack', magnitude: NaN },
            { type: 'attack', magnitude: -1 },
            { type: 'attack', magnitude: 1.5 },
            { type: 'attack', magnitude: Infinity },
          ],
        },
      ],
    });

    const economyBefore = { ...gameState.turnEconomy };

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.turnEconomy, economyBefore,
      'turnEconomy should not change for any invalid magnitude.');
  });

  // -------------------------------------------------------------------------
  // Test 9: multiple effects execute in descriptor array order
  // -------------------------------------------------------------------------
  it('multiple effects on one card execute in descriptor array order', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack', 'recruit'],
          effects: [
            { type: 'attack', magnitude: 2 },
            { type: 'recruit', magnitude: 3 },
          ],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 2,
      'Attack should increase by 2 (first effect).');
    assert.equal(gameState.turnEconomy.recruit, 3,
      'Recruit should increase by 3 (second effect).');
  });

  // -------------------------------------------------------------------------
  // Test 10: determinism
  // -------------------------------------------------------------------------
  it('identical deep-cloned inputs produce identical G', () => {
    const makeState = () => makeTestState({
      deck: ['card-a', 'card-b', 'card-c'],
      hand: [],
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['draw', 'attack'],
          effects: [
            { type: 'draw', magnitude: 1 },
            { type: 'attack', magnitude: 2 },
          ],
        },
      ],
    });

    const stateA = makeState();
    const stateB = makeState();

    executeHeroEffects(stateA, mockCtx, '0', 'hero-x' as string);
    executeHeroEffects(stateB, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(stateA.playerZones, stateB.playerZones,
      'Player zones should be identical after identical execution.');
    assert.deepEqual(stateA.turnEconomy, stateB.turnEconomy,
      'turnEconomy should be identical after identical execution.');
    assert.deepEqual(stateA.ko, stateB.ko,
      'KO pile should be identical after identical execution.');
  });

  // -------------------------------------------------------------------------
  // Test 20: reveal-ko — KOs top card when cost is 0 (AC-21)
  // -------------------------------------------------------------------------
  it('reveal-ko effect KOs the top deck card when its cost is 0', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['starter-agent'],
      cardStats: {
        'starter-agent': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko'],
          effects: [legacyRevealEffect('reveal-ko', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.ko, ['starter-agent'],
      'starter-agent should be added to the KO pile when its cost is 0.');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'starter-agent should be removed from deck after reveal-ko fires (AC-23).');
    assert.equal(gameState.playerZones['0'].deck.length, 0,
      'deck should shrink by 1 after reveal-ko fires on a cost-0 card (AC-23).');
    assert.equal(gameState.ko.length, 1,
      'KO pile should grow by 1 after reveal-ko fires on a cost-0 card (AC-23).');
  });

  // -------------------------------------------------------------------------
  // Test 21: reveal-ko — card stays on deck when cost > 0 (AC-21)
  // -------------------------------------------------------------------------
  it('reveal-ko effect is a no-op when top card cost is greater than 0', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko'],
          effects: [legacyRevealEffect('reveal-ko', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when cost is greater than 0.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when cost is greater than 0.');
  });

  // -------------------------------------------------------------------------
  // Test 22: reveal-ko — empty deck is a silent no-op (AC-21, D-21502)
  // -------------------------------------------------------------------------
  it('reveal-ko effect is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko'],
          effects: [legacyRevealEffect('reveal-ko', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when deck is empty.');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should remain empty.');
  });

  // -------------------------------------------------------------------------
  // Test 23: reveal-ko — missing cardStats entry is a silent no-op (AC-22)
  // -------------------------------------------------------------------------
  it('reveal-ko effect is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      cardStats: {},
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko'],
          effects: [legacyRevealEffect('reveal-ko', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when stats entry is missing.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['unknown-card'],
      'deck should remain unchanged when stats entry is missing.');
  });

  // -------------------------------------------------------------------------
  // Test 24: reveal-min — draws top card when cost >= threshold (AC-3)
  // -------------------------------------------------------------------------
  it('reveal-min effect draws top card to hand when cost meets the threshold', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-min'],
          effects: [legacyRevealEffect('reveal-min', 3)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['hero-y'],
      'hero-y should move to hand when cost equals the threshold.');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should be empty after the card is drawn.');
  });

  // -------------------------------------------------------------------------
  // Test 25: reveal-min — card stays on deck when cost < threshold (AC-4)
  // -------------------------------------------------------------------------
  it('reveal-min effect leaves card on deck when cost is below the threshold', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-min'],
          effects: [legacyRevealEffect('reveal-min', 3)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'hero-y should remain on deck when cost is below the threshold.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when cost is below the threshold.');
  });

  // -------------------------------------------------------------------------
  // Test 26: reveal-min — empty deck is a silent no-op (AC-5)
  // -------------------------------------------------------------------------
  it('reveal-min effect is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-min'],
          effects: [legacyRevealEffect('reveal-min', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should remain empty.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when deck is empty.');
  });

  // -------------------------------------------------------------------------
  // Test 27: reveal-min — missing cardStats entry is a silent no-op (AC-22)
  // -------------------------------------------------------------------------
  it('reveal-min effect is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      cardStats: {},
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-min'],
          effects: [legacyRevealEffect('reveal-min', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['unknown-card'],
      'deck should remain unchanged when stats entry is missing.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when stats entry is missing.');
  });

  // -------------------------------------------------------------------------
  // Test 28: reveal-min — undefined magnitude skips execution (AC-3)
  // -------------------------------------------------------------------------
  it('reveal-min effect is skipped when magnitude is undefined', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 5, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-min'],
          effects: [legacyRevealEffect('reveal-min', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when reveal-min magnitude is undefined.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should be unchanged when reveal-min magnitude is undefined.');
  });

  // -------------------------------------------------------------------------
  // Test 29: reveal-ko-or-draw — cost-0 card is KO'd and removed from deck (AC-6, AC-7)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw KOs and removes deck top when cost is 0, card is NOT in hand', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['starter-agent'],
      hand: [],
      cardStats: {
        'starter-agent': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should be empty after cost-0 card is KO\'d (AC-23).');
    assert.equal(gameState.playerZones['0'].deck.length, 0,
      'deck should shrink by 1 after reveal-ko-or-draw fires on a cost-0 card.');
    assert.deepEqual(gameState.ko, ['starter-agent'],
      'starter-agent should be in the KO pile.');
    assert.equal(gameState.ko.length, 1,
      'KO pile should grow by 1 after reveal-ko-or-draw fires on a cost-0 card.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty — KO branch takes precedence over draw branch (AC-7).');
  });

  // -------------------------------------------------------------------------
  // Test 30: reveal-ko-or-draw — cost-1 card is drawn (AC-8)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw draws top card to hand when cost is within draw range', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['hero-y'],
      'hero-y should move to hand when cost is within the draw range (AC-8).');
    assert.equal(gameState.playerZones['0'].deck.length, 0,
      'deck should shrink by 1 after draw fires.');
    assert.equal(gameState.playerZones['0'].hand.length, 1,
      'hand should grow by 1 after draw fires.');
    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when card is drawn.');
  });

  // -------------------------------------------------------------------------
  // Test 31: reveal-ko-or-draw — cost equals magnitude is drawn (boundary, AC-9)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw draws top card when cost equals magnitude (boundary)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['hero-y'],
      'hero-y should be drawn when cost equals magnitude (boundary case AC-9).');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should be empty after draw.');
    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when card is drawn.');
  });

  // -------------------------------------------------------------------------
  // Test 32: reveal-ko-or-draw — cost exceeds magnitude is a no-op (AC-10)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw is a no-op when top card cost exceeds magnitude', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when cost exceeds magnitude (AC-10).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when cost exceeds magnitude.');
    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when cost exceeds magnitude.');
  });

  // -------------------------------------------------------------------------
  // Test 33: reveal-ko-or-draw — undefined magnitude skips execution (AC-11)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw is skipped when magnitude is undefined', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when magnitude is undefined (AC-11).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should be unchanged when magnitude is undefined.');
    assert.deepEqual(gameState.ko, [],
      'KO pile should be unchanged when magnitude is undefined.');
  });

  // -------------------------------------------------------------------------
  // Test 34: reveal-ko-or-draw — magnitude 0 is treated as invalid (AC-12)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw is skipped when magnitude is 0', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 0)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when magnitude is 0 (AC-12).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should be unchanged when magnitude is 0.');
    assert.deepEqual(gameState.ko, [],
      'KO pile should be unchanged when magnitude is 0.');
  });

  // -------------------------------------------------------------------------
  // Test 35: reveal-ko-or-draw — empty deck is a no-op (AC-13)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should remain empty when reveal-ko-or-draw fires on empty deck (AC-13).');
    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when deck is empty.');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when deck is empty.');
  });

  // -------------------------------------------------------------------------
  // Test 36: reveal-ko-or-draw — missing cardStats is a no-op (AC-14)
  // -------------------------------------------------------------------------
  it('reveal-ko-or-draw is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      cardStats: {},
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['unknown-card'],
      'deck should remain unchanged when cardStats entry is missing (AC-14).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when cardStats entry is missing.');
    assert.deepEqual(gameState.ko, [],
      'KO pile should remain empty when cardStats entry is missing.');
  });

  // -------------------------------------------------------------------------
  // Test 37: reveal-cost-attack — cost-3 top card grants 3 attack; deck unchanged (AC-4, AC-25)
  // -------------------------------------------------------------------------
  it('reveal-cost-attack grants attack equal to card cost; deck identity preserved', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      turnEconomyAttack: 0,
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-cost-attack'],
          effects: [legacyRevealEffect('reveal-cost-attack', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 3,
      'attack should increase by 3 when top card cost is 3 (AC-4).');
    assert.equal(gameState.playerZones['0'].deck.length, 1,
      'deck length should be unchanged after reveal-cost-attack (AC-25).');
    assert.equal(gameState.playerZones['0'].deck[0], 'hero-y',
      'deck[0] must still be hero-y — no zone mutation allowed (AC-25).');
  });

  // -------------------------------------------------------------------------
  // Test 38: reveal-cost-attack — cost-0 top card grants 0 attack; deck unchanged (AC-5)
  // -------------------------------------------------------------------------
  it('reveal-cost-attack grants 0 attack for cost-0 card; deck unchanged', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['starter-agent'],
      hand: [],
      turnEconomyAttack: 2,
      cardStats: {
        'starter-agent': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-cost-attack'],
          effects: [legacyRevealEffect('reveal-cost-attack', undefined)],
        },
      ],
    });

    const attackBefore = gameState.turnEconomy.attack;

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, attackBefore,
      'attack should equal attackBefore when cost is 0 (AC-5); executor fires but +0 means no change.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['starter-agent'],
      'deck should be unchanged after reveal-cost-attack on cost-0 card.');
  });

  // -------------------------------------------------------------------------
  // Test 39: reveal-cost-attack — empty deck is a silent no-op (AC-6)
  // -------------------------------------------------------------------------
  it('reveal-cost-attack is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      turnEconomyAttack: 1,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-cost-attack'],
          effects: [legacyRevealEffect('reveal-cost-attack', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 1,
      'attack should remain unchanged when deck is empty (AC-6).');
  });

  // -------------------------------------------------------------------------
  // Test 40: reveal-cost-attack — missing cardStats is a silent no-op (AC-7)
  // -------------------------------------------------------------------------
  it('reveal-cost-attack is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      cardStats: {},
      turnEconomyAttack: 1,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-cost-attack'],
          effects: [legacyRevealEffect('reveal-cost-attack', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 1,
      'attack should remain unchanged when cardStats entry is missing (AC-7).');
    assert.deepEqual(gameState.playerZones['0'].deck, ['unknown-card'],
      'deck should remain unchanged when cardStats entry is missing.');
  });

  // -------------------------------------------------------------------------
  // Test 41: reveal-cost-attack — undefined G.turnEconomy is a silent no-op (AC-8)
  // -------------------------------------------------------------------------
  it('reveal-cost-attack is a no-op when G.turnEconomy is undefined', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-cost-attack'],
          effects: [legacyRevealEffect('reveal-cost-attack', undefined)],
        },
      ],
    });

    // Simulate missing turnEconomy
    (gameState as unknown as { turnEconomy: undefined }).turnEconomy = undefined as unknown as typeof gameState.turnEconomy;

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.strictEqual((gameState as unknown as { turnEconomy: unknown }).turnEconomy, undefined,
      'G.turnEconomy should remain undefined after guard fires (AC-8).');
    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when G.turnEconomy guard fires.');
  });

  // -------------------------------------------------------------------------
  // Test 42: reveal-odd-draw — cost-1 top card is drawn; exact topCardId in hand (AC-9, AC-26)
  // -------------------------------------------------------------------------
  it('reveal-odd-draw draws top card to hand when cost is odd (cost 1)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-odd-draw'],
          effects: [legacyRevealEffect('reveal-odd-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.playerZones['0'].deck.length, 0,
      'deck should shrink by 1 when cost is odd (AC-9).');
    assert.equal(gameState.playerZones['0'].hand.length, 1,
      'hand should grow by 1 when cost is odd (AC-9).');
    assert.ok(gameState.playerZones['0'].hand.includes('hero-y'),
      'the exact topCardId (hero-y) must be in hand after odd-draw fires (AC-26).');
  });

  // -------------------------------------------------------------------------
  // Test 43: reveal-odd-draw — cost-3 top card is drawn (AC-10)
  // -------------------------------------------------------------------------
  it('reveal-odd-draw draws top card to hand when cost is odd (cost 3)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-odd-draw'],
          effects: [legacyRevealEffect('reveal-odd-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.ok(gameState.playerZones['0'].hand.includes('hero-y'),
      'hero-y should be drawn when cost is 3 (odd) (AC-10).');
    assert.equal(gameState.playerZones['0'].deck.length, 0,
      'deck should be empty after draw.');
  });

  // -------------------------------------------------------------------------
  // Test 44: reveal-odd-draw — cost-0 top card is a no-op (AC-11)
  // -------------------------------------------------------------------------
  it('reveal-odd-draw is a no-op when top card cost is 0 (even)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['starter-agent'],
      hand: [],
      cardStats: {
        'starter-agent': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-odd-draw'],
          effects: [legacyRevealEffect('reveal-odd-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['starter-agent'],
      'deck should be unchanged when cost is 0 (even) (AC-11).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when cost is 0 (even) (AC-11).');
  });

  // -------------------------------------------------------------------------
  // Test 45: reveal-odd-draw — cost-2 top card is a no-op (AC-12)
  // -------------------------------------------------------------------------
  it('reveal-odd-draw is a no-op when top card cost is 2 (even)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-odd-draw'],
          effects: [legacyRevealEffect('reveal-odd-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['hero-y'],
      'deck should be unchanged when cost is 2 (even) (AC-12).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when cost is 2 (even) (AC-12).');
  });

  // -------------------------------------------------------------------------
  // Test 46: reveal-odd-draw — empty deck is a silent no-op (AC-13)
  // -------------------------------------------------------------------------
  it('reveal-odd-draw is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      hand: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-odd-draw'],
          effects: [legacyRevealEffect('reveal-odd-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should remain empty (AC-13).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when deck is empty (AC-13).');
  });

  // -------------------------------------------------------------------------
  // Test 47: reveal-odd-draw — missing cardStats is a silent no-op (AC-14)
  // -------------------------------------------------------------------------
  it('reveal-odd-draw is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      hand: [],
      cardStats: {},
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-odd-draw'],
          effects: [legacyRevealEffect('reveal-odd-draw', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['unknown-card'],
      'deck should remain unchanged when cardStats entry is missing (AC-14).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when cardStats entry is missing (AC-14).');
  });

  // -------------------------------------------------------------------------
  // Test 48: reveal-attack-choose — cost-2 top card with magnitude-4: attack +2; pending set (AC-4)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose grants attack equal to card cost when cost <= magnitude; sets pendingHeroChoice; card stays at deck[0]', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      turnEconomyAttack: 0,
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 2,
      'attack should increase by 2 when cost-2 card and magnitude-4 (cost <= magnitude) (AC-4).');
    assert.notEqual(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must be set after executor fires (AC-4).');
    assert.equal(gameState.pendingHeroChoice?.choiceType, 'discard-or-return',
      'choiceType must be discard-or-return (AC-4).');
    assert.equal(gameState.pendingHeroChoice?.cardId, 'hero-y',
      'cardId must be the top card id (AC-4).');
    assert.equal(gameState.pendingHeroChoice?.playerID, '0',
      'playerID must match the active player (AC-4).');
    assert.equal(gameState.playerZones['0']!.deck[0], 'hero-y',
      'deck[0] must still be hero-y — card stays on deck until choice resolved (AC-4).');
    assert.equal(gameState.playerZones['0']!.deck.length, 1,
      'deck must be unchanged in length after reveal-attack-choose (AC-4).');
  });

  // -------------------------------------------------------------------------
  // Test 49: reveal-attack-choose — cost-5 top card with magnitude-4: attack unchanged; pending still set (AC-5)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose leaves attack unchanged when cost > magnitude; still sets pendingHeroChoice', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      hand: [],
      turnEconomyAttack: 0,
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 5, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 0,
      'attack must remain 0 when cost-5 > magnitude-4 (attack not granted) (AC-5).');
    assert.notEqual(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must still be set even when attack grant does not fire (AC-5).');
    assert.equal(gameState.playerZones['0']!.deck[0], 'hero-y',
      'card must remain at deck[0] when cost exceeds magnitude (AC-5).');
  });

  // -------------------------------------------------------------------------
  // Test 50: reveal-attack-choose — cost-0 top card: attack +0; pending set (AC-6)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose grants 0 attack for cost-0 card; pendingHeroChoice still set', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['starter-agent'],
      hand: [],
      turnEconomyAttack: 2,
      cardStats: {
        'starter-agent': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 2,
      'attack should remain 2 (cost-0 adds 0 to existing 2) when cost is 0 (AC-6).');
    assert.notEqual(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must be set even when attack grant adds 0 (cost-0 is <= magnitude) (AC-6).');
  });

  // -------------------------------------------------------------------------
  // Test 51: reveal-attack-choose — empty deck: no-op; pendingHeroChoice NOT set (AC-7)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose is a no-op when deck is empty; pendingHeroChoice not set', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      turnEconomyAttack: 1,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 1,
      'attack must remain unchanged when deck is empty (AC-7).');
    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must NOT be set when deck is empty (AC-7).');
  });

  // -------------------------------------------------------------------------
  // Test 52: reveal-attack-choose — missing cardStats: no-op; pendingHeroChoice NOT set (AC-8)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose is a no-op when top card has no cardStats entry; pendingHeroChoice not set', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      cardStats: {},
      turnEconomyAttack: 1,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 1,
      'attack must remain unchanged when cardStats entry is missing (AC-8).');
    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must NOT be set when cardStats entry is missing (AC-8).');
  });

  // -------------------------------------------------------------------------
  // Test 53: reveal-attack-choose — G.turnEconomy undefined: no-op; pendingHeroChoice NOT set (AC-9)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose is a no-op when G.turnEconomy is undefined; pendingHeroChoice not set', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
    });

    // Simulate missing turnEconomy — guard must fire BEFORE the pending assignment
    (gameState as unknown as { turnEconomy: undefined }).turnEconomy = undefined as unknown as typeof gameState.turnEconomy;

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.strictEqual((gameState as unknown as { turnEconomy: unknown }).turnEconomy, undefined,
      'G.turnEconomy should remain undefined after guard fires (AC-9).');
    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must NOT be set when G.turnEconomy guard fires — guard ordering is load-bearing (AC-9).');
  });

  // -------------------------------------------------------------------------
  // Test 54: reveal-attack-choose — reject-second: second call with pending set is a no-op (AC-10)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose is a no-op when pendingHeroChoice is already set (reject-second policy)', () => {
    const existingPending: PendingHeroChoice = {
      choiceType: 'discard-or-return',
      cardId: 'original-card',
      playerID: '0',
    };
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      turnEconomyAttack: 0,
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 4)],
        },
      ],
      pendingHeroChoice: existingPending,
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 0,
      'attack must remain unchanged when reject-second guard fires (AC-10).');
    assert.equal(gameState.pendingHeroChoice, existingPending,
      'original pendingHeroChoice must be preserved; second call must not overwrite it (AC-10).');
    assert.equal(gameState.pendingHeroChoice?.cardId, 'original-card',
      'original cardId must be intact after reject-second no-op (AC-10).');
  });

  // -------------------------------------------------------------------------
  // Test 55: reveal-attack-choose — undefined magnitude: skipped via pre-check gate (AC-11)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose is skipped when magnitude is undefined', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', undefined)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must NOT be set when magnitude is undefined (AC-11).');
    assert.equal(gameState.turnEconomy.attack, 0,
      'attack must remain unchanged when magnitude is undefined (AC-11).');
  });

  // -------------------------------------------------------------------------
  // Test 56: reveal-attack-choose — magnitude-0: skipped via < 1 guard (AC-12)
  // -------------------------------------------------------------------------
  it('reveal-attack-choose is skipped when magnitude is 0 (zero threshold invalid)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['hero-y'],
      cardStats: {
        'hero-y': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-attack-choose'],
          effects: [legacyRevealEffect('reveal-attack-choose', 0)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.pendingHeroChoice, undefined,
      'pendingHeroChoice must NOT be set when magnitude is 0 (< 1 guard fires) (AC-12).');
    assert.equal(gameState.turnEconomy.attack, 0,
      'attack must remain unchanged when magnitude is 0 (AC-12).');
  });

  // -------------------------------------------------------------------------
  // Test 11: JSON serialization
  // -------------------------------------------------------------------------
  it('JSON.stringify(G) succeeds after execution', () => {
    const gameState = makeTestState({
      deck: ['card-a'],
      hand: [],
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['draw', 'attack', 'recruit'],
          effects: [
            { type: 'draw', magnitude: 1 },
            { type: 'attack', magnitude: 2 },
            { type: 'recruit', magnitude: 1 },
          ],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    const serialized = JSON.stringify(gameState);
    assert.ok(typeof serialized === 'string' && serialized.length > 0,
      'Game state should be JSON-serializable after hero effect execution.');
  });

  // -------------------------------------------------------------------------
  // Tests 57–63: reveal-ko-attack (D-22301, WP-223)
  // -------------------------------------------------------------------------

  // Test 57: KOs top card and grants attack when cost = 0 (happy path)
  it('reveal-ko-attack KOs top deck card and grants fixed attack when cost is 0', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-zero-card', 'second-card'],
      turnEconomyAttack: 2,
      cardStats: {
        'cost-zero-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-attack'],
          effects: [legacyRevealEffect('reveal-ko-attack', 1)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.ko, ['cost-zero-card'],
      'cost-zero-card must be moved to the KO pile when cost is 0.');
    assert.equal(gameState.playerZones['0'].deck.length, 1,
      'Deck must shrink by 1 after KO fires.');
    assert.equal(gameState.playerZones['0'].deck[0], 'second-card',
      'second-card must remain at deck[0] after cost-zero-card is KO\'d.');
    assert.equal(gameState.turnEconomy.attack, 3,
      'Attack must increase by magnitude (1) when cost is 0.');
  });

  // Test 58: No zone mutation when cost > 0 — card stays at deck[0]
  it('reveal-ko-attack is a no-op when top deck card cost is greater than 0', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['costly-card'],
      turnEconomyAttack: 2,
      cardStats: {
        'costly-card': { attack: 0, recruit: 0, cost: 3, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-attack'],
          effects: [legacyRevealEffect('reveal-ko-attack', 1)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['costly-card'],
      'Deck must be unchanged when cost is greater than 0.');
    assert.deepEqual(gameState.ko, [],
      'KO pile must remain empty when cost is greater than 0.');
    assert.equal(gameState.turnEconomy.attack, 2,
      'Attack must NOT change when cost is greater than 0.');
  });

  // Test 59: Atomicity — moveCardFromZone found:false → attack NOT granted
  it('reveal-ko-attack does not grant attack when moveCardFromZone returns found:false (atomicity)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-zero-card'],
      turnEconomyAttack: 5,
      cardStats: {
        'cost-zero-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-attack'],
          effects: [legacyRevealEffect('reveal-ko-attack', 1)],
        },
      ],
    });

    // Force moveCardFromZone to return found:false by overriding indexOf on the deck array.
    // deck[0] and deck.length remain valid (guards pass), but indexOf returns -1
    // so moveCardFromZone sees the card as absent — simulating a KO failure.
    // This state is unreachable in production but validates the atomicity invariant.
    const deckRef = gameState.playerZones['0'].deck;
    (deckRef as unknown as { indexOf: (item: string) => number }).indexOf = () => -1;

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 5,
      'Attack must NOT be granted when moveCardFromZone returns found:false (atomicity contract).');
    assert.deepEqual(gameState.ko, [],
      'KO pile must remain empty when moveCardFromZone returns found:false.');
  });

  // Test 60: Silent no-op when deck is empty
  it('reveal-ko-attack is a no-op when deck is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      turnEconomyAttack: 3,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-attack'],
          effects: [legacyRevealEffect('reveal-ko-attack', 1)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 3,
      'Attack must remain unchanged when deck is empty.');
    assert.deepEqual(gameState.ko, [],
      'KO pile must remain empty when deck is empty.');
  });

  // Test 61: Silent no-op when top card has no cardStats entry
  it('reveal-ko-attack is a no-op when top card has no cardStats entry', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['unknown-card'],
      turnEconomyAttack: 4,
      cardStats: {},
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-attack'],
          effects: [legacyRevealEffect('reveal-ko-attack', 1)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 4,
      'Attack must remain unchanged when cardStats entry is missing.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['unknown-card'],
      'Deck must be unchanged when cardStats entry is missing.');
    assert.deepEqual(gameState.ko, [],
      'KO pile must remain empty when cardStats entry is missing.');
  });

  // Test 62: Silent no-op when G.turnEconomy is undefined
  it('reveal-ko-attack is a no-op when G.turnEconomy is undefined; no crash', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-zero-card'],
      cardStats: {
        'cost-zero-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-attack'],
          effects: [legacyRevealEffect('reveal-ko-attack', 1)],
        },
      ],
    });

    // why: simulate missing turnEconomy — guard must fire BEFORE any zone mutation
    (gameState as unknown as { turnEconomy: undefined }).turnEconomy = undefined as unknown as typeof gameState.turnEconomy;

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.strictEqual((gameState as unknown as { turnEconomy: unknown }).turnEconomy, undefined,
      'G.turnEconomy must remain undefined; executor must not crash when it is missing.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['cost-zero-card'],
      'Deck must be unchanged when G.turnEconomy guard fires — no zone mutation before the guard.');
    assert.deepEqual(gameState.ko, [],
      'KO pile must remain empty when G.turnEconomy guard fires.');
  });

  // Test 63: Silent no-op for invalid magnitudes (undefined, 0, negative)
  it('reveal-ko-attack is a no-op when magnitude is invalid (undefined, 0, negative)', () => {
    const invalidMagnitudes = [undefined, 0, -1, 1.5, NaN, Infinity];

    for (const magnitude of invalidMagnitudes) {
      const gameState = makeTestState({
        inPlay: ['hero-x'],
        deck: ['cost-zero-card'],
        turnEconomyAttack: 7,
        cardStats: {
          'cost-zero-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        },
        heroAbilityHooks: [
          {
            cardId: 'hero-x' as string,
            timing: 'onPlay',
            keywords: ['reveal-ko-attack'],
            effects: [legacyRevealEffect('reveal-ko-attack', magnitude as number)],
          },
        ],
      });

      executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

      assert.equal(gameState.turnEconomy.attack, 7,
        `Attack must remain unchanged for invalid magnitude: ${String(magnitude)}.`);
      assert.deepEqual(gameState.playerZones['0'].deck, ['cost-zero-card'],
        `Deck must be unchanged for invalid magnitude: ${String(magnitude)}.`);
      assert.deepEqual(gameState.ko, [],
        `KO pile must remain empty for invalid magnitude: ${String(magnitude)}.`);
    }
  });
});

// ---------------------------------------------------------------------------
// WP-253 — parameterized reveal collapse (D-24024)
//
// Valid-magnitude-tier M=0 byte-identity (reveal / reveal-min must NOT no-op at
// M=0) and the multi-peek revealCount loop. The per-keyword legacy-equivalence of
// the 8 reveal handlers is proven by the migrated reveal fixtures above (Amendment-A).
// ---------------------------------------------------------------------------

describe('executeHeroEffects reveal collapse (WP-253 / D-24024)', () => {
  const mockCtx = makeMockCtx();

  it('reveal M=0 draws a cost-0 card (valid tier — M=0 builds cost-lte 0, must NOT no-op)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-zero-card'],
      hand: [],
      cardStats: {
        'cost-zero-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 0)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['cost-zero-card'],
      'reveal M=0 must draw the cost-0 card (cost-lte 0 matches a cost-0 top).');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should be empty after the cost-0 card is drawn.');
  });

  it('reveal M=0 leaves a cost-1 card on deck (cost-lte 0 does not match cost 1)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-one-card'],
      hand: [],
      cardStats: {
        'cost-one-card': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 0)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['cost-one-card'],
      'reveal M=0 must leave a cost-1 card on deck (cost-lte 0 fails for cost 1).');
    assert.deepEqual(gameState.playerZones['0'].hand, [],
      'hand should remain empty when the top card cost exceeds 0.');
  });

  it('reveal-min M=0 draws every card (valid tier — M=0 builds cost-gte 0, draws even a high-cost top)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['pricey-card'],
      hand: [],
      cardStats: {
        'pricey-card': { attack: 0, recruit: 0, cost: 5, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-min'],
          effects: [legacyRevealEffect('reveal-min', 0)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['pricey-card'],
      'reveal-min M=0 must draw any card (cost-gte 0 matches every non-negative cost).');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck should be empty after the card is drawn.');
  });

  it('reveal-ko-or-draw M=0 is a whole no-op (positive tier — < 1 returns empty rules)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-zero-card'],
      hand: [],
      cardStats: {
        'cost-zero-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal-ko-or-draw'],
          effects: [legacyRevealEffect('reveal-ko-or-draw', 0)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['cost-zero-card'],
      'reveal-ko-or-draw M=0 must NOT KO the cost-0 card (positive tier — empty rules).');
    assert.deepEqual(gameState.ko, [],
      'KO pile must remain empty at reveal-ko-or-draw M=0.');
  });

  it('revealCount=2 peeks twice, re-reading deck[0] after the first deck-mutating draw', () => {
    // why: the count>1 loop re-reads deck[0] each iteration; a deck-mutating action
    // (draw) shifts the top so the second peek sees a genuinely new card. count=1 is
    // byte-identical for all 8 legacy reveals; this exercises the loop mechanism only.
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['top-card', 'next-card', 'bottom-card'],
      hand: [],
      cardStats: {
        'top-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'next-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'bottom-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          // why: revealCount 2 with a draw rule that always matches (cost-lte 5) —
          // each iteration draws the new top, so two cards move to hand in deck order.
          effects: [{ type: 'reveal', revealCount: 2, revealRules: revealRulesForLegacyKeyword('reveal', 5) }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['top-card', 'next-card'],
      'both top cards must be drawn in deck order (loop re-reads deck[0] after each draw).');
    assert.deepEqual(gameState.playerZones['0'].deck, ['bottom-card'],
      'only the third card remains on deck after two peeks.');
  });

  it('revealCount=2 stops early when the deck empties mid-loop (no throw)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['only-card'],
      hand: [],
      cardStats: {
        'only-card': { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [{ type: 'reveal', revealCount: 2, revealRules: revealRulesForLegacyKeyword('reveal', 5) }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['only-card'],
      'the single card is drawn on the first peek; the second peek finds an empty deck and stops.');
    assert.deepEqual(gameState.playerZones['0'].deck, [],
      'deck is empty after the only card is drawn.');
  });

  // -------------------------------------------------------------------------
  // WP-255 / D-24027 — reveal-top-N peek-advance (the multi-peek WP-253 deferred)
  // -------------------------------------------------------------------------

  it('reveal-top-3 draws every cost-≤-2 card and advances the peek past the rest in exact deck order (D-24027)', () => {
    // why: the peek-offset advances past a card a rule leaves on the deck so the reveal
    // reaches the cards beneath it; the remaining deck order is asserted EXACTLY (not
    // membership) to pin the advance — this is "The Amazing Spider-Man" in miniature.
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-1', 'cost-5', 'cost-2', 'cost-9'],
      hand: [],
      cardStats: {
        'cost-1': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'cost-5': { attack: 0, recruit: 0, cost: 5, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'cost-2': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'cost-9': { attack: 0, recruit: 0, cost: 9, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [{ type: 'reveal', revealCount: 3, revealRules: revealRulesForLegacyKeyword('reveal', 2) }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['cost-1', 'cost-2'],
      'reveal-top-3 draws the two cost-≤-2 cards (cost-1, then cost-2) in reveal order.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['cost-5', 'cost-9'],
      'cost-5 (peeked, over threshold → offset advanced past it) and cost-9 (never reached — only 3 peeks) stay on deck in exact order.');
    assert.ok(JSON.stringify(gameState).length > 0,
      'JSON.stringify(G) must succeed after a reveal-top-N effect (the descriptor is plain data).');
  });

  it('reveal-top-3 skips an unstatted S.H.I.E.L.D. starter in the window and does NOT abort the reveal (copilot #22)', () => {
    // why: a peeked card with no cardStats entry is SKIPPED-AND-ADVANCED, not a whole-effect
    // abort — the cards beneath it still reveal. The starter is left on the deck (a cost-0
    // starter is revealed-but-not-drawn, the accepted D-21502 limitation).
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-1', 'shield-starter', 'cost-2', 'cost-9'],
      hand: [],
      cardStats: {
        'cost-1': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'cost-2': { attack: 0, recruit: 0, cost: 2, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'cost-9': { attack: 0, recruit: 0, cost: 9, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [{ type: 'reveal', revealCount: 3, revealRules: revealRulesForLegacyKeyword('reveal', 2) }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['cost-1', 'cost-2'],
      'the eligible cards around the unstatted starter are still drawn — the missing-stats peek did not abort the reveal.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['shield-starter', 'cost-9'],
      'the unstatted shield-starter is left in place (skipped, not drawn, not KOd); cost-9 was never reached.');
  });

  it('reveal-top-3 over a short deck stops cleanly at the deck end (no throw)', () => {
    // why: revealCount (3) exceeds the deck size (2). The loop draws the eligible card,
    // advances past the over-threshold one, then stops at peekOffset >= deck.length — the
    // only whole-loop exit — without throwing or indexing past the array.
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: ['cost-1', 'cost-5'],
      hand: [],
      cardStats: {
        'cost-1': { attack: 0, recruit: 0, cost: 1, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
        'cost-5': { attack: 0, recruit: 0, cost: 5, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 },
      },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [{ type: 'reveal', revealCount: 3, revealRules: revealRulesForLegacyKeyword('reveal', 2) }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].hand, ['cost-1'],
      'the single cost-≤-2 card is drawn; the short deck does not loop forever or throw.');
    assert.deepEqual(gameState.playerZones['0'].deck, ['cost-5'],
      'cost-5 (over threshold) stays on deck; the loop stops once the offset overruns the deck end.');
  });
});

// ---------------------------------------------------------------------------
// WP-247 — attack-per-count executor (D-24016)
// ---------------------------------------------------------------------------

describe('executeHeroEffects attack-per-count (WP-247)', () => {
  // why: makeMockCtx provides ShuffleProvider-compatible context; attack-per-count
  // does not draw, but executeHeroEffects requires a ctx argument.
  const mockCtx = makeMockCtx();

  it('grants magnitude × victory-pile bystander count (m=2, N=3 → +6 attack)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      victory: ['pile-bystander', 'bystander-villain-deck-02', 'pile-bystander'],
      turnEconomyAttack: 0,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack-per-count'],
          effects: [{ type: 'attack-per-count', magnitude: 2, countSource: 'victory-bystanders' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 6,
      'attack should increase by magnitude (2) × bystander count (3) = 6.');
  });

  it('grants 0 attack when the victory pile holds no bystanders', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      victory: [],
      turnEconomyAttack: 1,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack-per-count'],
          effects: [{ type: 'attack-per-count', magnitude: 3, countSource: 'victory-bystanders' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 1,
      'attack should be unchanged (grant of 3 × 0 = 0) when there are no bystanders.');
  });

  it('is a skipped no-op when the effect carries no countSource', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      victory: ['pile-bystander', 'pile-bystander'],
      turnEconomyAttack: 4,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack-per-count'],
          effects: [{ type: 'attack-per-count', magnitude: 2 }],
        },
      ],
    });

    const messageCountBefore = gameState.messages.length;

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 4,
      'attack should be unchanged when countSource is missing (skipped no-op).');
    assert.equal(gameState.messages.length, messageCountBefore,
      'no message should be appended for a missing-countSource no-op.');
  });

  it('leaves G JSON-serializable after a count-scaled attack grant', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      victory: ['pile-bystander', 'bystander-villain-deck-01'],
      turnEconomyAttack: 0,
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack-per-count'],
          effects: [{ type: 'attack-per-count', magnitude: 1, countSource: 'victory-bystanders' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 2,
      'attack should increase by 1 × 2 = 2.');
    const serialized = JSON.stringify(gameState);
    assert.ok(serialized.length > 0, 'JSON.stringify(G) must succeed after a count-scaled grant.');
  });
});

// ---------------------------------------------------------------------------
// D-24017 — hero-ability rescue observability (game-log feedback)
// ---------------------------------------------------------------------------

describe('executeHeroEffects rescue logging (D-24017)', () => {
  const mockCtx = makeMockCtx();

  it('appends a game-log line naming the rescued count on a successful rescue', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      bystanders: ['b-1', 'b-2'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['rescue'],
          effects: [{ type: 'rescue', magnitude: 1 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    // The rescue still happens (behavior unchanged) ...
    assert.deepEqual(gameState.playerZones['0'].victory, ['b-1'],
      'b-1 should be rescued to the victory zone.');
    // ... and is now observable in the game log.
    assert.ok(
      gameState.messages.some((line) => line.includes('rescued 1 bystander(s) via a hero ability')),
      'a successful hero rescue must append a game-log line naming the count.',
    );
  });

  it('appends a supply-empty game-log line when the Bystander supply is empty', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      bystanders: [],
      victory: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['rescue'],
          effects: [{ type: 'rescue', magnitude: 1 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    // The no-op behavior is unchanged ...
    assert.deepEqual(gameState.playerZones['0'].victory, [],
      'victory zone stays empty when the supply is empty.');
    // ... but the player now sees WHY nothing was rescued.
    assert.ok(
      gameState.messages.some((line) => line.includes('Bystander supply is empty')),
      'an empty-supply hero rescue must append a game-log line explaining the no-op.',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-248 — optional-KO-reward park case (D-24019)
// ---------------------------------------------------------------------------

describe('executeHeroEffects optional-ko-reward park (WP-248)', () => {
  const mockCtx = makeMockCtx();

  it('playing the effect with ≥1 card in hand/discard parks a choice (no auto-KO, no reward)', () => {
    const gameState = makeTestState({
      hand: ['card-h'],
      discard: ['card-d'],
      inPlay: ['hero-x'],
      bystanders: ['bystander-0'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['optional-ko-reward'],
          effects: [{ type: 'optional-ko-reward', magnitude: 1, rewardType: 'rescue' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.pendingOptionalKoRewards?.length, 1, 'exactly one choice parked');
    assert.deepStrictEqual(
      gameState.pendingOptionalKoRewards![0],
      { playerID: '0', rewardType: 'rescue', rewardMagnitude: 1, sourceCardId: 'hero-x' },
      'parked entry records player, reward, magnitude, and source card',
    );
    // No KO and no reward at play time.
    assert.deepStrictEqual(gameState.ko, [], 'no card KOd at play time');
    assert.deepStrictEqual(gameState.playerZones['0'].victory, [], 'no bystander rescued at play time');
    assert.deepStrictEqual(gameState.piles.bystanders, ['bystander-0'], 'bystander supply untouched at play time');
    // The park is SILENT (mirrors WP-242).
    assert.equal(gameState.messages.length, 0, 'the park appends no game-log line');
  });

  it('with 0 eligible cards (hand + discard both empty) it is a no-op plus a game-log line', () => {
    const gameState = makeTestState({
      hand: [],
      discard: [],
      inPlay: ['hero-x'],
      bystanders: ['bystander-0'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['optional-ko-reward'],
          effects: [{ type: 'optional-ko-reward', magnitude: 1, rewardType: 'rescue' }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.pendingOptionalKoRewards?.length ?? 0, 0, 'no choice parked when nothing is eligible');
    assert.ok(
      gameState.messages.some((line) => line.includes('both hand and discard pile are empty')),
      'a 0-eligible optional-KO-reward must append a game-log line explaining the no-op',
    );
  });
});

// ---------------------------------------------------------------------------
// WP-248 — selectDefaultOptionalKoTarget tie-break (D-24019)
// ---------------------------------------------------------------------------

describe('selectDefaultOptionalKoTarget tie-break (WP-248)', () => {
  /** Minimal PlayerZones for the selector (only discard + hand are scanned). */
  function zonesOf(hand: string[], discard: string[]) {
    return {
      deck: [],
      hand,
      discard,
      inPlay: [],
      victory: [],
    } as unknown as Parameters<typeof selectDefaultOptionalKoTarget>[0];
  }

  /** Minimal cardStats with only the cost field the selector reads. */
  function statsOf(costs: Record<string, number>) {
    const result: Record<string, { attack: number; recruit: number; cost: number; fightCost: number }> = {};
    for (const cardId of Object.keys(costs)) {
      result[cardId] = { attack: 0, recruit: 0, cost: costs[cardId]!, fightCost: 0 };
    }
    return result as unknown as Parameters<typeof selectDefaultOptionalKoTarget>[1];
  }

  it('picks the lowest-cost card across both zones (cost beats zone)', () => {
    const target = selectDefaultOptionalKoTarget(
      zonesOf(['cheap-hand'], ['pricey-discard']),
      statsOf({ 'cheap-hand': 1, 'pricey-discard': 3 }),
    );
    assert.deepStrictEqual(target, { zone: 'hand', cardId: 'cheap-hand' });
  });

  it('breaks a cost tie by preferring discard over hand', () => {
    const target = selectDefaultOptionalKoTarget(
      zonesOf(['hand-card'], ['discard-card']),
      statsOf({ 'hand-card': 2, 'discard-card': 2 }),
    );
    assert.deepStrictEqual(target, { zone: 'discard', cardId: 'discard-card' });
  });

  it('breaks a cost+zone tie by lowest array index', () => {
    const target = selectDefaultOptionalKoTarget(
      zonesOf([], ['first', 'second']),
      statsOf({ first: 2, second: 2 }),
    );
    assert.deepStrictEqual(target, { zone: 'discard', cardId: 'first' });
  });

  it('treats a card with no cardStats entry as cost 0', () => {
    const target = selectDefaultOptionalKoTarget(
      zonesOf(['unknown-card'], ['known-cost-1']),
      statsOf({ 'known-cost-1': 1 }),
    );
    assert.deepStrictEqual(target, { zone: 'hand', cardId: 'unknown-card' });
  });

  it('returns null when both zones are empty', () => {
    const target = selectDefaultOptionalKoTarget(zonesOf([], []), statsOf({}));
    assert.equal(target, null);
  });
});

// ---------------------------------------------------------------------------
// Primitive-effect path (WP-256 / D-24031)
// ---------------------------------------------------------------------------

describe('executeHeroEffects primitiveEffects path (WP-256 / D-24031)', () => {
  const mockCtx = makeMockCtx();

  const berserkStat = {
    attack: 4,
    recruit: 0,
    cost: 0,
    fightCost: 0,
    fightCostMode: 'static' as const,
    fightCostBase: 0,
  };

  it('a hook with primitiveEffects fires Berserk — deck-top discards and grants attack', () => {
    const gameState = makeTestState({
      deck: ['top', 'b', 'c'],
      inPlay: ['hero-x'],
      cardStats: { top: berserkStat },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          primitiveEffects: [HERO_COMPOSITION_MARKERS['berserk']!],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].discard, ['top'], 'top card discarded by Berserk');
    assert.deepEqual(gameState.playerZones['0'].deck, ['b', 'c'], 'top card left the deck');
    assert.equal(gameState.turnEconomy.attack, 4, '+Attack equals the discarded card printed attack');
  });

  it('a hook whose conditions fail does NOT fire primitiveEffects', () => {
    const gameState = makeTestState({
      deck: ['top', 'b'],
      inPlay: ['hero-x'],
      cardStats: { top: berserkStat },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          conditions: [{ type: 'heroClassMatch', value: 'strength' }],
          primitiveEffects: [HERO_COMPOSITION_MARKERS['berserk']!],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.deepEqual(gameState.playerZones['0'].deck, ['top', 'b'], 'deck unchanged when conditions fail');
    assert.deepEqual(gameState.playerZones['0'].discard, [], 'nothing discarded when conditions fail');
    assert.equal(gameState.turnEconomy.attack, 0, 'no attack granted when conditions fail');
  });

  it('legacy effects run before primitiveEffects (legacy-then-primitive order)', () => {
    // why: RISK-2 — a hook carrying BOTH a legacy effect (recruit) and the Berserk
    // composition applies them in a fixed order; both fire inside the conditions gate.
    const gameState = makeTestState({
      deck: ['top', 'b'],
      inPlay: ['hero-x'],
      cardStats: { top: berserkStat },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['recruit'],
          effects: [{ type: 'recruit', magnitude: 2 }],
          primitiveEffects: [HERO_COMPOSITION_MARKERS['berserk']!],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.recruit, 2, 'the legacy recruit effect fired');
    assert.equal(gameState.turnEconomy.attack, 4, 'the Berserk composition also fired');
    assert.deepEqual(gameState.playerZones['0'].discard, ['top'], 'Berserk discarded the deck-top card');
  });

  it('a hook with the Empowered composition grants +Attack equal to the HQ class count (WP-267)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          primitiveEffects: [buildEmpoweredComposition('strength')],
        },
      ],
    });
    // Populate the shared HQ + card traits the count reads (makeTestState defaults HQ empty).
    gameState.hq = ['s1', 't1', 's2', null, 's3'] as unknown as LegendaryGameState['hq'];
    gameState.cardTraits = {
      s1: { heroClass: 'strength', team: null },
      t1: { heroClass: 'tech', team: null },
      s2: { heroClass: 'strength', team: null },
      s3: { heroClass: 'strength', team: null },
    };

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(gameState.turnEconomy.attack, 3, '+Attack equals the 3 strength cards in the HQ');
  });
});

// ---------------------------------------------------------------------------
// WP-257 — hollow-effect detection (D-24033 + D-24034)
//
// The detector classifies on handler REACHABILITY, never by diffing G. These
// tests pin: an unknown/unsupported keyword flags hollow; an empty-supply rescue
// / failed condition / deferred mechanic / empty-deck reveal record NO hollow;
// a mixed hook (≥1 reachable + 1 unhandled) records NO hollow; an unresolved
// marker flags parse-unrecognized; the record turn defaults to 0 under a mock ctx.
// ---------------------------------------------------------------------------

describe('executeHeroEffects — hollow-effect detection (WP-257)', () => {
  const mockCtx = makeMockCtx();

  /** Reads the lazy-init diagnostics records (empty array when never written). */
  function records(gameState: LegendaryGameState) {
    return gameState.diagnostics?.hollowEffects ?? [];
  }

  it('unknown keyword (not a HeroKeyword) records ONE hollow record (unsupported-keyword)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          // why: an invented keyword cast as HeroKeyword simulates a token that is
          // not even a recognized keyword — dispatch cannot execute it.
          effects: [{ type: 'totally-made-up' as HeroKeyword }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 1, 'exactly one hollow record');
    assert.equal(records(gameState)[0]!.reason, 'unsupported-keyword');
    assert.equal(records(gameState)[0]!.cardType, 'hero');
    assert.equal(records(gameState)[0]!.mechanic, 'totally-made-up');
    assert.equal(records(gameState)[0]!.turn, 0, 'turn defaults to 0 under the mock ctx');
  });

  it('unsupported keyword (recognized HeroKeyword with no handler) is NOT hollow when deferred (wound)', () => {
    // why: `wound` is on DEFERRED_BY_DESIGN_MECHANICS — a recognized keyword with
    // no handler today, classified `deferred` (reachable), NOT hollow.
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['wound'],
          effects: [{ type: 'wound', magnitude: 1 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'a deferred mechanic records NO hollow event');
  });

  it('empty-bystander-supply rescue records NO hollow event (reachable handler, intentional no-op)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      bystanders: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['rescue'],
          effects: [{ type: 'rescue', magnitude: 1 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'empty supply is a reachable no-op, not hollow');
  });

  it('failed condition records NO hollow event (condition-failed reachable outcome)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['attack'],
          // why: heroClassMatch with no other in-play card of that class fails.
          conditions: [{ type: 'heroClassMatch', value: 'strength' }],
          effects: [{ type: 'attack', magnitude: 5 }],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'a failed condition is reachable, not hollow');
  });

  it('empty-deck reveal records NO hollow event (reachable handler, empty source)', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      deck: [],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: ['reveal'],
          effects: [legacyRevealEffect('reveal', 2)],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'an empty deck is a reachable no-op, not hollow');
  });

  it('mixed hook (one reachable effect + one unhandled) records NO hollow event', () => {
    // why: per-hook rule — a hook flags hollow only when NONE of its declared
    // effects reached a handler. A reachable draw alongside an unknown keyword on
    // the same hook means the hook is NOT hollow.
    const gameState = makeTestState({
      deck: ['card-a', 'card-b'],
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          effects: [
            { type: 'draw', magnitude: 1 },
            { type: 'totally-made-up' as HeroKeyword },
          ],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'a mixed hook with ≥1 reachable effect is not hollow');
    assert.equal(gameState.playerZones['0'].hand.length, 1, 'the reachable draw still fired');
  });

  it('unresolved marker on the hook records a parse-unrecognized hollow event', () => {
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          unresolvedMarkers: ['mind-swap'],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 1, 'exactly one hollow record');
    assert.equal(records(gameState)[0]!.reason, 'parse-unrecognized');
    assert.equal(records(gameState)[0]!.mechanic, 'mind-swap');
  });

  it('a flavor-text-only hook (no effects, no markers) records NO hollow event', () => {
    // why: a hook that declares nothing executable can never be hollow — a pure
    // flavor-text line surfaces no effects and an empty/absent unresolvedMarkers.
    const gameState = makeTestState({
      inPlay: ['hero-x'],
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'no declared effect → never hollow');
  });

  it('a primitive-only (Berserk) hook records NO hollow event (composition is reachable)', () => {
    const gameState = makeTestState({
      deck: ['top', 'b'],
      inPlay: ['hero-x'],
      cardStats: { top: { attack: 0, recruit: 0, cost: 0, fightCost: 0, fightCostMode: 'static', fightCostBase: 0 } },
      heroAbilityHooks: [
        {
          cardId: 'hero-x' as string,
          timing: 'onPlay',
          keywords: [],
          primitiveEffects: [HERO_COMPOSITION_MARKERS['berserk']!],
        },
      ],
    });

    executeHeroEffects(gameState, mockCtx, '0', 'hero-x' as string);

    assert.equal(records(gameState).length, 0, 'a recognized composition reaches the interpreter');
  });
});
