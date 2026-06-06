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
import { executeHeroEffects } from './heroEffects.execute.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { LegendaryGameState } from '../types.js';
import type { HeroAbilityHook } from '../rules/heroAbility.types.js';

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
          effects: [{ type: 'reveal', magnitude: 2 }],
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
          effects: [{ type: 'reveal', magnitude: 2 }],
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
          effects: [{ type: 'reveal', magnitude: 2 }],
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
          effects: [{ type: 'reveal', magnitude: 2 }],
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
          effects: [{ type: 'reveal' }],
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
          effects: [{ type: 'reveal-ko' }],
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
          effects: [{ type: 'reveal-ko' }],
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
          effects: [{ type: 'reveal-ko' }],
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
          effects: [{ type: 'reveal-ko' }],
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
          effects: [{ type: 'reveal-min', magnitude: 3 }],
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
          effects: [{ type: 'reveal-min', magnitude: 3 }],
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
          effects: [{ type: 'reveal-min', magnitude: 2 }],
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
          effects: [{ type: 'reveal-min', magnitude: 2 }],
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
          effects: [{ type: 'reveal-min' }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 2 }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 2 }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 2 }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 2 }],
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
          effects: [{ type: 'reveal-ko-or-draw' }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 0 }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 2 }],
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
          effects: [{ type: 'reveal-ko-or-draw', magnitude: 2 }],
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
});
