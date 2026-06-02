/**
 * Tests for scheme twist resolver functions (WP-182 / EC-209).
 *
 * Each resolver is tested for its core behavior, edge cases (empty
 * supplies, missing params), and message generation.
 *
 * No boardgame.io imports. Uses node:test and node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEME_TWIST_RESOLVERS } from './schemeTwistResolvers.js';
import type { LegendaryGameState } from '../types.js';
import type { RevealContext } from '../villainDeck/villainDeck.reveal.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const identityRandom = { Shuffle: <T,>(deck: T[]) => [...deck] };

function makeRevealContext(currentPlayer: string = '0'): RevealContext {
  return { random: identityRandom, ctx: { currentPlayer } };
}

const emptyImplementationMap: ImplementationMap = {};

/**
 * Creates a minimal LegendaryGameState for resolver testing.
 */
function makeResolverState(overrides?: {
  schemeId?: string;
  playerCount?: number;
  wounds?: string[];
  bystanders?: string[];
}): LegendaryGameState {
  const playerCount = overrides?.playerCount ?? 1;
  const playerZones: Record<string, LegendaryGameState['playerZones'][string]> = {};
  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    playerZones[String(playerIndex)] = {
      deck: [],
      hand: [],
      discard: [],
      inPlay: [],
      victory: [],
    };
  }

  return {
    matchConfiguration: {
      schemeId: overrides?.schemeId ?? 'test-scheme',
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
      schemeId: overrides?.schemeId ?? 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
    },
    currentStage: 'main' as LegendaryGameState['currentStage'],
    playerZones,
    piles: {
      bystanders: overrides?.bystanders ?? [],
      wounds: overrides?.wounds ?? ['wound-1', 'wound-2', 'wound-3', 'wound-4', 'wound-5'],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: [],
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    turnEconomy: {
      attack: 0,
      recruit: 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
    cardStats: {},
    cardTraits: {},
    mastermind: {
      id: 'test-mastermind',
      baseCardId: 'test-mastermind-base',
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    },
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    heroDeck: [],
    escapedPile: [],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
    heroAbilityHooks: [],
    scheme: { twistPile: [] },
    schemeSetupInstructions: [],
    cardKeywords: {},
    cardDisplayData: {},
    // why: WP-200 — resolvers now push to `gameState.notableEvents` at
    // their terminal point. Initialise to [] so direct-resolver tests
    // exercise the emission without throwing on a missing field.
    notableEvents: [],
  } as unknown as LegendaryGameState;
}

// ===========================================================================
// reveal-or-punish
// ===========================================================================

describe('reveal-or-punish resolver', () => {
  const resolver = SCHEME_TWIST_RESOLVERS['reveal-or-punish'];

  it('player with matching heroClass avoids penalty', () => {
    const gameState = makeResolverState({ playerCount: 1, wounds: ['w1', 'w2'] });
    gameState.playerZones['0']!.hand = ['hero-tech-1'];
    gameState.cardTraits['hero-tech-1'] = { heroClass: 'tech', team: null };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      condition: { field: 'heroClass', value: 'tech' },
      penalty: 'gainWound',
    });

    assert.equal(gameState.piles.wounds.length, 2, 'wound supply unchanged');
    const matchMessage = gameState.messages.find((message) => message.includes('condition met'));
    assert.ok(matchMessage, 'must log condition-met message');
  });

  it('player without matching heroClass gains wound', () => {
    const gameState = makeResolverState({ playerCount: 1, wounds: ['w1', 'w2'] });
    gameState.playerZones['0']!.hand = ['hero-strength-1'];
    gameState.cardTraits['hero-strength-1'] = { heroClass: 'strength', team: null };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      condition: { field: 'heroClass', value: 'tech' },
      penalty: 'gainWound',
    });

    assert.equal(gameState.piles.wounds.length, 1, 'one wound consumed from supply');
    assert.equal(gameState.playerZones['0']!.discard.length, 1, 'wound in discard');
  });

  it('player without matching hero discards hand when penalty is discardHand', () => {
    const gameState = makeResolverState({ playerCount: 1 });
    gameState.playerZones['0']!.hand = ['card-a', 'card-b', 'card-c'];
    gameState.cardTraits['card-a'] = { heroClass: 'strength', team: null };
    gameState.cardTraits['card-b'] = { heroClass: 'covert', team: null };
    gameState.cardTraits['card-c'] = { heroClass: null, team: null };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      condition: { field: 'heroClass', value: 'tech' },
      penalty: 'discardHand',
    });

    assert.equal(gameState.playerZones['0']!.hand.length, 0, 'hand is empty');
    assert.equal(gameState.playerZones['0']!.discard.length, 3, 'all cards in discard');
  });

  it('handles multiple players independently', () => {
    const gameState = makeResolverState({ playerCount: 2, wounds: ['w1', 'w2'] });
    gameState.playerZones['0']!.hand = ['hero-tech-1'];
    gameState.cardTraits['hero-tech-1'] = { heroClass: 'tech', team: null };
    gameState.playerZones['1']!.hand = ['hero-strength-1'];
    gameState.cardTraits['hero-strength-1'] = { heroClass: 'strength', team: null };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      condition: { field: 'heroClass', value: 'tech' },
      penalty: 'gainWound',
    });

    assert.equal(gameState.piles.wounds.length, 1, 'one wound consumed (player 1 failed)');
    assert.equal(gameState.playerZones['0']!.discard.length, 0, 'player 0 matched — no wound');
    assert.equal(gameState.playerZones['1']!.discard.length, 1, 'player 1 failed — got wound');
  });

  it('handles team-based condition', () => {
    const gameState = makeResolverState({ playerCount: 1, wounds: ['w1'] });
    gameState.playerZones['0']!.hand = ['hero-avenger-1'];
    gameState.cardTraits['hero-avenger-1'] = { heroClass: null, team: 'avengers' };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      condition: { field: 'team', value: 'avengers' },
      penalty: 'gainWound',
    });

    assert.equal(gameState.piles.wounds.length, 1, 'wound supply unchanged (player matched)');
  });

  it('pushes message and returns on invalid params', () => {
    const gameState = makeResolverState();

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.ok(
      gameState.messages.some((message) => message.includes('invalid params')),
      'must push invalid-params message',
    );
  });

  it('handles empty wound supply gracefully', () => {
    const gameState = makeResolverState({ playerCount: 1, wounds: [] });
    gameState.playerZones['0']!.hand = ['hero-strength-1'];
    gameState.cardTraits['hero-strength-1'] = { heroClass: 'strength', team: null };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      condition: { field: 'heroClass', value: 'tech' },
      penalty: 'gainWound',
    });

    assert.equal(gameState.playerZones['0']!.discard.length, 0, 'no wound gained');
    assert.ok(
      gameState.messages.some((message) => message.includes('wound supply empty')),
      'must log wound supply empty message',
    );
  });
});

// ===========================================================================
// chained-reveals
// ===========================================================================

describe('chained-reveals resolver', () => {
  const resolver = SCHEME_TWIST_RESOLVERS['chained-reveals'];

  it('calls performVillainReveal the specified number of times', () => {
    const gameState = makeResolverState();
    gameState.villainDeck.deck = ['villain-1', 'villain-2'];
    gameState.villainDeckCardTypes = {
      'villain-1': 'villain',
      'villain-2': 'villain',
    };
    gameState.hookRegistry = [];

    resolver(
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { revealCount: 2 },
    );

    assert.equal(gameState.villainDeck.deck.length, 0, 'both cards revealed from deck');
  });

  it('stops early when villain deck is exhausted', () => {
    const gameState = makeResolverState();
    gameState.villainDeck.deck = ['villain-1'];
    gameState.villainDeckCardTypes = { 'villain-1': 'villain' };

    resolver(
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { revealCount: 3 },
    );

    assert.ok(
      gameState.messages.some((message) => message.includes('exhausted')),
      'must log exhaustion message',
    );
  });

  it('pushes message and returns on invalid params', () => {
    const gameState = makeResolverState();

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.ok(
      gameState.messages.some((message) => message.includes('invalid params')),
      'must push invalid-params message',
    );
  });
});

// ===========================================================================
// wound-all
// ===========================================================================

describe('wound-all resolver', () => {
  const resolver = SCHEME_TWIST_RESOLVERS['wound-all'];

  it('each player gains the specified number of wounds', () => {
    const gameState = makeResolverState({
      playerCount: 2,
      wounds: ['w1', 'w2', 'w3', 'w4'],
    });

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      woundCount: 1,
    });

    assert.equal(gameState.playerZones['0']!.discard.length, 1, 'player 0 got 1 wound');
    assert.equal(gameState.playerZones['1']!.discard.length, 1, 'player 1 got 1 wound');
    assert.equal(gameState.piles.wounds.length, 2, 'wound supply reduced by 2');
  });

  it('stops early when wound supply runs out mid-distribution', () => {
    const gameState = makeResolverState({
      playerCount: 2,
      wounds: ['w1'],
    });

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      woundCount: 1,
    });

    assert.equal(gameState.playerZones['0']!.discard.length, 1, 'player 0 got wound');
    assert.equal(gameState.playerZones['1']!.discard.length, 0, 'player 1 got no wound');
    assert.equal(gameState.piles.wounds.length, 0, 'wound supply empty');
  });

  it('pushes message and returns on invalid params', () => {
    const gameState = makeResolverState();

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.ok(
      gameState.messages.some((message) => message.includes('invalid params')),
      'must push invalid-params message',
    );
  });
});

// ===========================================================================
// ko-from-hq
// ===========================================================================

describe('ko-from-hq resolver', () => {
  const resolver = SCHEME_TWIST_RESOLVERS['ko-from-hq'];

  it('KOs the two cheapest heroes from HQ', () => {
    const gameState = makeResolverState();
    gameState.hq = ['hero-a', 'hero-b', 'hero-c', null, null] as LegendaryGameState['hq'];
    gameState.cardStats['hero-a'] = { attack: 0, recruit: 0, cost: 5, fightCost: 0 };
    gameState.cardStats['hero-b'] = { attack: 0, recruit: 0, cost: 2, fightCost: 0 };
    gameState.cardStats['hero-c'] = { attack: 0, recruit: 0, cost: 3, fightCost: 0 };
    gameState.heroDeck = ['hero-d', 'hero-e'];

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      koCount: 2,
    });

    assert.ok(gameState.ko.includes('hero-b'), 'cheapest hero (cost 2) KO\'d');
    assert.ok(gameState.ko.includes('hero-c'), 'second cheapest hero (cost 3) KO\'d');
    assert.ok(!gameState.ko.includes('hero-a'), 'most expensive hero (cost 5) spared');
  });

  it('tie-breaks by slot index (lower index first)', () => {
    const gameState = makeResolverState();
    gameState.hq = ['hero-a', 'hero-b', null, null, null] as LegendaryGameState['hq'];
    gameState.cardStats['hero-a'] = { attack: 0, recruit: 0, cost: 3, fightCost: 0 };
    gameState.cardStats['hero-b'] = { attack: 0, recruit: 0, cost: 3, fightCost: 0 };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      koCount: 1,
    });

    assert.ok(gameState.ko.includes('hero-a'), 'slot 0 hero KO\'d on tie');
    assert.ok(!gameState.ko.includes('hero-b'), 'slot 1 hero spared on tie');
  });

  it('refills vacated HQ slots from hero deck', () => {
    const gameState = makeResolverState();
    gameState.hq = ['hero-a', null, null, null, null] as LegendaryGameState['hq'];
    gameState.cardStats['hero-a'] = { attack: 0, recruit: 0, cost: 1, fightCost: 0 };
    gameState.heroDeck = ['hero-refill'];

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      koCount: 1,
    });

    assert.ok(gameState.ko.includes('hero-a'), 'hero KO\'d');
    assert.equal(gameState.hq[0], 'hero-refill', 'slot refilled from hero deck');
    assert.equal(gameState.heroDeck.length, 0, 'hero deck consumed');
  });

  it('respects costThreshold filter', () => {
    const gameState = makeResolverState();
    gameState.hq = ['hero-cheap', 'hero-expensive', null, null, null] as LegendaryGameState['hq'];
    gameState.cardStats['hero-cheap'] = { attack: 0, recruit: 0, cost: 2, fightCost: 0 };
    gameState.cardStats['hero-expensive'] = { attack: 0, recruit: 0, cost: 6, fightCost: 0 };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      koCount: 2,
      costThreshold: 3,
    });

    assert.ok(gameState.ko.includes('hero-cheap'), 'cheap hero KO\'d (cost <= threshold)');
    assert.ok(!gameState.ko.includes('hero-expensive'), 'expensive hero spared (cost > threshold)');
  });

  it('handles fewer eligible heroes than koCount gracefully', () => {
    const gameState = makeResolverState();
    gameState.hq = ['hero-a', null, null, null, null] as LegendaryGameState['hq'];
    gameState.cardStats['hero-a'] = { attack: 0, recruit: 0, cost: 1, fightCost: 0 };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      koCount: 3,
    });

    assert.equal(gameState.ko.length, 1, 'only the 1 available hero KO\'d');
    assert.ok(
      gameState.messages.some((message) => message.includes('Only 1')),
      'must log partial-KO message',
    );
  });

  it('handles empty HQ', () => {
    const gameState = makeResolverState();

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {
      koCount: 2,
    });

    assert.equal(gameState.ko.length, 0, 'no KOs on empty HQ');
    assert.ok(
      gameState.messages.some((message) => message.includes('No eligible heroes')),
      'must log no-eligible message',
    );
  });

  it('pushes message and returns on invalid params', () => {
    const gameState = makeResolverState();

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.ok(
      gameState.messages.some((message) => message.includes('invalid params')),
      'must push invalid-params message',
    );
  });
});

// ===========================================================================
// midtown-bank-robbery (migrated)
// ===========================================================================

describe('midtown-bank-robbery resolver', () => {
  const resolver = SCHEME_TWIST_RESOLVERS['midtown-bank-robbery'];

  it('captures 2 bystanders when Bank is occupied and supply is sufficient', () => {
    const gameState = makeResolverState({ bystanders: ['b1', 'b2', 'b3'] });
    gameState.city[1] = 'villain-bank';
    gameState.attachedBystanders['villain-bank'] = [];
    gameState.villainDeck.deck = ['villain-next'];
    gameState.villainDeckCardTypes = { 'villain-next': 'villain' };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.equal(
      gameState.attachedBystanders['villain-bank']!.length,
      2,
      'Bank villain has 2 bystanders',
    );
  });

  it('logs empty-Bank message when Bank has no occupant', () => {
    const gameState = makeResolverState({ bystanders: ['b1', 'b2'] });
    gameState.villainDeck.deck = ['villain-next'];
    gameState.villainDeckCardTypes = { 'villain-next': 'villain' };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.ok(
      gameState.messages.some((message) => message.includes('Bank is empty')),
      'must log Bank-empty message',
    );
  });

  it('chains a villain-deck reveal', () => {
    const gameState = makeResolverState({ bystanders: ['b1', 'b2', 'b3'] });
    gameState.city[1] = 'villain-bank';
    gameState.attachedBystanders['villain-bank'] = [];
    gameState.villainDeck.deck = ['villain-chained'];
    gameState.villainDeckCardTypes = { 'villain-chained': 'villain' };

    resolver(gameState, makeRevealContext(), emptyImplementationMap, {});

    assert.equal(gameState.city[0], 'villain-chained', 'chained reveal placed card in city');
    assert.equal(gameState.villainDeck.deck.length, 0, 'villain deck consumed');
  });

  it('handles empty bystander supply without throwing', () => {
    const gameState = makeResolverState({ bystanders: [] });
    gameState.city[1] = 'villain-bank';
    gameState.attachedBystanders['villain-bank'] = [];
    gameState.villainDeck.deck = ['villain-next'];
    gameState.villainDeckCardTypes = { 'villain-next': 'villain' };

    assert.doesNotThrow(() => {
      resolver(gameState, makeRevealContext(), emptyImplementationMap, {});
    });

    assert.ok(
      gameState.messages.some((message) => message.includes('no bystanders to capture')),
      'must log supply-empty message',
    );
  });
});

// ===========================================================================
// WP-200 — schemeTwistResolved emission per resolver
// ===========================================================================

import type { CardExtId as CardExtIdAlias } from '../state/zones.types.js';

const TWIST_CARD_ID = 'core-scheme-twist-test' as CardExtIdAlias;

describe('WP-200 — schemeTwistResolved emission per resolver', () => {
  it('revealOrPunish emits exactly one event with resolverKey "revealOrPunish"', () => {
    const gameState = makeResolverState({ playerCount: 1, wounds: ['w1'] });
    gameState.playerZones['0']!.hand = ['hero-tech-1'];
    gameState.cardTraits['hero-tech-1'] = { heroClass: 'tech', team: null };

    SCHEME_TWIST_RESOLVERS['reveal-or-punish'](
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { condition: { field: 'heroClass', value: 'tech' }, penalty: 'gainWound' },
      TWIST_CARD_ID,
    );

    assert.equal(gameState.notableEvents.length, 1, 'exactly one event emitted');
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'schemeTwistResolved');
    if (event.type === 'schemeTwistResolved') {
      assert.equal(event.twistCardId, TWIST_CARD_ID);
      assert.equal(event.resolverKey, 'revealOrPunish');
      assert.ok(event.narrative.length > 0, 'narrative is non-empty');
    }
  });

  it('chainedReveals emits exactly one event with resolverKey "chainedReveals"', () => {
    const gameState = makeResolverState();
    gameState.villainDeck.deck = ['villain-1'];
    gameState.villainDeckCardTypes = { 'villain-1': 'villain' };

    SCHEME_TWIST_RESOLVERS['chained-reveals'](
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { revealCount: 1 },
      TWIST_CARD_ID,
    );

    // why: WP-200 — the chained reveal's villain card triggers no recursive
    // schemeTwistResolved emission (it routes through onCardRevealed, not
    // onSchemeTwistRevealed), so the resolver's own terminal emission is
    // the only event in the array.
    assert.equal(gameState.notableEvents.length, 1);
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'schemeTwistResolved');
    if (event.type === 'schemeTwistResolved') {
      assert.equal(event.resolverKey, 'chainedReveals');
    }
  });

  it('woundAll emits exactly one event with resolverKey "woundAll"', () => {
    const gameState = makeResolverState({ playerCount: 1, wounds: ['w1'] });

    SCHEME_TWIST_RESOLVERS['wound-all'](
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { woundCount: 1 },
      TWIST_CARD_ID,
    );

    assert.equal(gameState.notableEvents.length, 1);
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'schemeTwistResolved');
    if (event.type === 'schemeTwistResolved') {
      assert.equal(event.resolverKey, 'woundAll');
    }
  });

  it('koFromHq emits exactly one event with resolverKey "koFromHq"', () => {
    const gameState = makeResolverState();
    gameState.hq = ['hero-a', null, null, null, null] as LegendaryGameState['hq'];
    gameState.cardStats['hero-a'] = { attack: 0, recruit: 0, cost: 1, fightCost: 0 };

    SCHEME_TWIST_RESOLVERS['ko-from-hq'](
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { koCount: 1 },
      TWIST_CARD_ID,
    );

    assert.equal(gameState.notableEvents.length, 1);
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'schemeTwistResolved');
    if (event.type === 'schemeTwistResolved') {
      assert.equal(event.resolverKey, 'koFromHq');
    }
  });

  it('midtownBankRobbery emits exactly one event with resolverKey "midtownBankRobbery"', () => {
    const gameState = makeResolverState({ bystanders: ['b1', 'b2'] });
    gameState.city[1] = 'villain-bank';
    gameState.attachedBystanders['villain-bank'] = [];
    gameState.villainDeck.deck = ['villain-next'];
    gameState.villainDeckCardTypes = { 'villain-next': 'villain' };

    SCHEME_TWIST_RESOLVERS['midtown-bank-robbery'](
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      {},
      TWIST_CARD_ID,
    );

    // why: WP-200 — chained villain reveal does not emit
    // schemeTwistResolved (it's a villain card, not a twist), so only the
    // outer midtownBankRobbery emission lands in the array.
    assert.equal(gameState.notableEvents.length, 1);
    const event = gameState.notableEvents[0]!;
    assert.equal(event.type, 'schemeTwistResolved');
    if (event.type === 'schemeTwistResolved') {
      assert.equal(event.resolverKey, 'midtownBankRobbery');
      assert.equal(event.twistCardId, TWIST_CARD_ID);
    }
  });

  it('falls back to UNKNOWN_TWIST_CARD_ID when called without the 5th argument', () => {
    // why: WP-200 — legacy direct-resolver tests pre-date the 5th param;
    // the resolver implementation falls back to a sentinel so the
    // emission still produces a well-typed event without breaking the
    // earlier tests.
    const gameState = makeResolverState({ playerCount: 1, wounds: ['w1'] });
    SCHEME_TWIST_RESOLVERS['wound-all'](
      gameState,
      makeRevealContext(),
      emptyImplementationMap,
      { woundCount: 1 },
    );
    assert.equal(gameState.notableEvents.length, 1);
    const event = gameState.notableEvents[0]!;
    if (event.type === 'schemeTwistResolved') {
      assert.equal(event.twistCardId, 'unknown-twist-card');
    }
  });
});
