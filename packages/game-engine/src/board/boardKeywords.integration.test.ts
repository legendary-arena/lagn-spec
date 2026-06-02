/**
 * Integration tests for board keyword behavior.
 *
 * Tests Patrol cost modifier in fightVillain, Guard blocking in fightVillain,
 * and Ambush wound gain in revealVillainCard.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fightVillain } from '../moves/fightVillain.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import type { LegendaryGameState } from '../types.js';
import type { BoardKeyword } from './boardKeywords.types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { CityZone } from './city.types.js';
import type { VillainAbilityHook } from '../rules/villainAbility.types.js';

/**
 * Creates a minimal LegendaryGameState for board keyword integration testing.
 *
 * All fields required by LegendaryGameState are provided with safe defaults.
 * Override specific fields via the overrides parameter.
 */
function makeTestGameState(overrides?: {
  city?: CityZone;
  cardKeywords?: Record<CardExtId, BoardKeyword[]>;
  cardStats?: Record<string, { attack: number; recruit: number; cost: number; fightCost: number }>;
  currentStage?: LegendaryGameState['currentStage'];
  attackPoints?: number;
  playerCount?: number;
  woundCount?: number;
  villainDeck?: { deck: CardExtId[]; discard: CardExtId[] };
  villainDeckCardTypes?: Record<string, string>;
  villainAbilityHooks?: VillainAbilityHook[];
}): LegendaryGameState {
  const playerCount = overrides?.playerCount ?? 2;
  const woundCount = overrides?.woundCount ?? 10;

  const playerZones: Record<string, { deck: CardExtId[]; hand: CardExtId[]; discard: CardExtId[]; inPlay: CardExtId[]; victory: CardExtId[] }> = {};
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    playerZones[String(playerIndex)] = {
      deck: [],
      hand: [],
      discard: [],
      inPlay: [],
      victory: [],
    };
  }

  const wounds: CardExtId[] = [];
  for (let woundIndex = 0; woundIndex < woundCount; woundIndex++) {
    wounds.push(`wound-${String(woundIndex).padStart(2, '0')}` as CardExtId);
  }

  return {
    matchConfiguration: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: woundCount,
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
    currentStage: overrides?.currentStage ?? 'main' as LegendaryGameState['currentStage'],
    playerZones,
    piles: {
      bystanders: [],
      wounds,
      officers: [],
      sidekicks: [],
    },
    messages: [],
    // why: WP-200 — required by `LegendaryGameState`; the four fire-site
    // emissions push to this array. Initialised here so tests that call
    // fightVillain / revealVillainCard / scheme-twist resolvers / strike
    // handler do not throw on a missing field.
    notableEvents: [],
    counters: {},
    hookRegistry: [],
    villainDeck: overrides?.villainDeck ?? { deck: [], discard: [] },
    villainDeckCardTypes: (overrides?.villainDeckCardTypes ?? {}) as Record<CardExtId, never>,
    ko: [],
    attachedBystanders: {},
    turnEconomy: {
      attack: overrides?.attackPoints ?? 0,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
    cardStats: (overrides?.cardStats ?? {}) as Record<CardExtId, never>,
    cardKeywords: overrides?.cardKeywords ?? {},
    mastermind: {
      id: 'test-mastermind' as CardExtId,
      baseCardId: 'test-mastermind-base' as CardExtId,
      tacticsDeck: [],
      tacticsDefeated: [],
    },
    city: overrides?.city ?? [null, null, null, null, null],
    hq: [null, null, null, null, null],
    lobby: { requiredPlayers: playerCount, ready: {}, started: false },
    heroAbilityHooks: [],
    villainAbilityHooks: overrides?.villainAbilityHooks ?? [],
  };
}

/**
 * Creates a minimal move context compatible with boardgame.io 0.50.x.
 */
function makeMoveContext(gameState: LegendaryGameState, playerId: string) {
  return {
    G: gameState,
    ctx: { currentPlayer: playerId, numPlayers: Object.keys(gameState.playerZones).length },
    playerID: playerId,
    random: {
      // why: shuffle reverses array for deterministic testing (makeMockCtx convention)
      Shuffle: <T>(array: T[]): T[] => [...array].reverse(),
      D4: () => 1,
      D6: () => 1,
      D8: () => 1,
      D10: () => 1,
      D12: () => 1,
      D20: () => 1,
      Die: () => [1],
      Number: () => 0,
    },
    events: {
      setPhase: () => {},
      endTurn: () => {},
      setStage: () => {},
      endStage: () => {},
    },
  };
}

describe('Board keywords integration', () => {
  // -------------------------------------------------------------------------
  // Test 1: Patrol — fight requires extra attack
  // -------------------------------------------------------------------------
  it('fight against Patrol villain requires extra attack', () => {
    const gameState = makeTestGameState({
      city: [null, 'v-patrol' as CardExtId, null, null, null],
      cardKeywords: { 'v-patrol': ['patrol'] },
      cardStats: { 'v-patrol': { attack: 0, recruit: 0, cost: 0, fightCost: 3 } },
      attackPoints: 3,
    });

    // 3 attack vs 3 base + 1 patrol = 4 required — should fail
    const context = makeMoveContext(gameState, '0');
    fightVillain(context as never, { cityIndex: 1 });
    assert.equal(gameState.city[1], 'v-patrol', 'Card should remain — insufficient attack for Patrol');

    // Set attack to 4 — now sufficient
    gameState.turnEconomy.attack = 4;
    gameState.turnEconomy.spentAttack = 0;
    fightVillain(context as never, { cityIndex: 1 });
    assert.equal(gameState.city[1], null, 'Card should be removed — sufficient attack with Patrol');
  });

  // -------------------------------------------------------------------------
  // Test 2: Guard — blocks fight at lower index
  // -------------------------------------------------------------------------
  it('fight blocked by Guard returns void with no mutation', () => {
    const gameState = makeTestGameState({
      city: [null, 'v-target' as CardExtId, null, 'v-guard' as CardExtId, null],
      cardKeywords: { 'v-guard': ['guard'] },
      cardStats: {
        'v-target': { attack: 0, recruit: 0, cost: 0, fightCost: 1 },
        'v-guard': { attack: 0, recruit: 0, cost: 0, fightCost: 1 },
      },
      attackPoints: 10,
    });

    const cityCopy: CityZone = [...gameState.city];
    const context = makeMoveContext(gameState, '0');
    fightVillain(context as never, { cityIndex: 1 });

    assert.deepStrictEqual(gameState.city, cityCopy, 'City should be unchanged — Guard blocks');
  });

  // -------------------------------------------------------------------------
  // Test 3: Guard — targeting Guard itself succeeds
  // -------------------------------------------------------------------------
  it('fight targeting Guard card itself succeeds (not self-blocking)', () => {
    const gameState = makeTestGameState({
      city: [null, null, null, 'v-guard' as CardExtId, null],
      cardKeywords: { 'v-guard': ['guard'] },
      cardStats: { 'v-guard': { attack: 0, recruit: 0, cost: 0, fightCost: 1 } },
      attackPoints: 10,
    });

    const context = makeMoveContext(gameState, '0');
    fightVillain(context as never, { cityIndex: 3 });

    assert.equal(gameState.city[3], null, 'Guard card should be removed — self-targeting allowed');
    assert.ok(
      gameState.playerZones['0']!.victory.includes('v-guard' as CardExtId),
      'Guard card should be in victory pile',
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Ambush — wound gain on City entry
  // -------------------------------------------------------------------------
  it('Ambush dispatches a gainWoundEachPlayer hook on City entry', () => {
    // why: WP-185 deleted the hardcoded Ambush wound loop (D-18504). Wounding
    // now flows through executeVillainAbilities, gated by hasAmbush, applying
    // the card's parsed [effect:] hooks. A gainWoundEachPlayer hook reproduces
    // the each-player wound behavior the hardcode used to provide.
    const ambushCardId = 'v-ambush' as CardExtId;
    const gameState = makeTestGameState({
      currentStage: 'start' as LegendaryGameState['currentStage'],
      villainDeck: { deck: [ambushCardId], discard: [] },
      villainDeckCardTypes: { 'v-ambush': 'villain' },
      cardKeywords: { 'v-ambush': ['ambush'] },
      villainAbilityHooks: [
        {
          cardId: ambushCardId,
          timing: 'onAmbush',
          keywords: ['gainWoundEachPlayer'],
          effects: ['gainWoundEachPlayer'],
        },
      ],
      playerCount: 2,
      woundCount: 10,
    });

    const woundsBefore = gameState.piles.wounds.length;
    const player0DiscardBefore = gameState.playerZones['0']!.discard.length;
    const player1DiscardBefore = gameState.playerZones['1']!.discard.length;

    const context = makeMoveContext(gameState, '0');
    revealVillainCard(context as never);

    // Both players should have gained a wound
    assert.equal(
      gameState.playerZones['0']!.discard.length,
      player0DiscardBefore + 1,
      'Player 0 should have gained a wound from Ambush',
    );
    assert.equal(
      gameState.playerZones['1']!.discard.length,
      player1DiscardBefore + 1,
      'Player 1 should have gained a wound from Ambush',
    );
    assert.equal(
      gameState.piles.wounds.length,
      woundsBefore - 2,
      'Wound pile should have decreased by 2',
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: Serialization proof
  // -------------------------------------------------------------------------
  it('JSON.stringify(G) succeeds after keyword interactions', () => {
    const gameState = makeTestGameState({
      city: [null, 'v-patrol' as CardExtId, null, 'v-guard' as CardExtId, null],
      cardKeywords: {
        'v-patrol': ['patrol'],
        'v-guard': ['guard'],
        'v-ambush': ['ambush'],
      },
      cardStats: {
        'v-patrol': { attack: 0, recruit: 0, cost: 0, fightCost: 3 },
        'v-guard': { attack: 0, recruit: 0, cost: 0, fightCost: 1 },
      },
      attackPoints: 10,
    });

    // Fight the Guard to trigger keyword logic
    const context = makeMoveContext(gameState, '0');
    fightVillain(context as never, { cityIndex: 3 });

    const serialized = JSON.stringify(gameState);
    assert.equal(typeof serialized, 'string');
    assert.ok(serialized.length > 0);
  });
});
