/**
 * Tests for the effect primitive registry + interpreter (WP-256 / D-24030 / D-24031).
 *
 * Covers: closed-array drift (node/value/parameter unions) + bidirectional registry-key
 * parity (the WP-251 pattern); Berserk end-to-end as data; the Recruit cousin as data
 * (NO engine edit); empty-deck no-op; missing-cardStats → +0; unknown node/value warn-not-
 * throw (a malformed type that would crash a direct map index); the load-bearing invariant
 * (the bind/ref context is never written to G); context isolation across separate top-level
 * interpretations; and best-effort warning with a minimal G.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECT_NODE_TYPES,
  VALUE_EXPRESSION_TYPES,
  EFFECT_RESOURCE_KINDS,
  EFFECT_ZONE_KINDS,
  EFFECT_CARD_POSITIONS,
  EFFECT_OWNER_KINDS,
} from './effectPrimitive.types.js';
import type { EffectNode } from './effectPrimitive.types.js';
import {
  EFFECT_NODE_HANDLERS,
  VALUE_EXPRESSION_EVALUATORS,
  interpretHeroPrimitiveEffect,
} from '../hero/effectPrimitive.interpret.js';
import { HERO_COMPOSITION_MARKERS } from './heroCompositions.js';
import type { LegendaryGameState } from '../types.js';
import type { CardStatEntry } from '../economy/economy.types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Builds a full CardStatEntry from partial overrides. */
function makeCardStat(overrides: Partial<CardStatEntry>): CardStatEntry {
  return {
    attack: 0,
    recruit: 0,
    cost: 0,
    fightCost: 0,
    fightCostMode: 'static',
    fightCostBase: 0,
    ...overrides,
  };
}

/**
 * Builds a minimal LegendaryGameState exposing only the slice the interpreter reads
 * (playerZones['0'].deck/discard, cardStats, turnEconomy, messages). Cast through unknown
 * — the interpreter is a pure function over this narrow surface (the makeMockCtx posture).
 */
function makeState(options: {
  deck?: string[];
  discard?: string[];
  attack?: number;
  recruit?: number;
  cardStats?: Record<string, CardStatEntry>;
  omitMessages?: boolean;
  omitTurnEconomy?: boolean;
}): LegendaryGameState {
  const state: Record<string, unknown> = {
    playerZones: {
      '0': {
        deck: options.deck ?? [],
        hand: [],
        discard: options.discard ?? [],
        inPlay: [],
        victory: [],
      },
    },
    cardStats: options.cardStats ?? {},
    messages: [],
    turnEconomy: {
      attack: options.attack ?? 0,
      recruit: options.recruit ?? 0,
      spentAttack: 0,
      spentRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
  };
  if (options.omitMessages) {
    delete state.messages;
  }
  if (options.omitTurnEconomy) {
    delete state.turnEconomy;
  }
  return state as unknown as LegendaryGameState;
}

/** A throwaway boardgame.io ctx — Berserk's primitives never read it. */
const CTX = {};

// why: D-24031 / §Acceptance D — the Recruit-stat Berserk cousin authored as PURE DATA,
// identical shape with resource:'recruit' + stat:'recruit'. This AST is fed directly to
// the interpreter to prove the cousin needs NO new keyword, primitive, handler, or union.
const RECRUIT_COUSIN: EffectNode = {
  type: 'sequence',
  steps: [
    {
      type: 'move-card',
      from: { owner: 'current-player', zone: 'deck', position: 'top' },
      to: { owner: 'current-player', zone: 'discard' },
      bind: 'discardedCard',
    },
    {
      type: 'gain-resource',
      resource: 'recruit',
      amount: { type: 'card-printed-stat', card: { ref: 'discardedCard' }, stat: 'recruit' },
    },
  ],
};

// ---------------------------------------------------------------------------
// Closed-array drift (code-style §Drift Detection / D-24030)
// ---------------------------------------------------------------------------

describe('effect primitive closed-array drift (D-24030)', () => {
  it('EFFECT_NODE_TYPES has exactly the 3 canonical node types, in order, no duplicates', () => {
    assert.deepStrictEqual([...EFFECT_NODE_TYPES], ['sequence', 'move-card', 'gain-resource']);
    assert.equal(EFFECT_NODE_TYPES.length, 3, 'EFFECT_NODE_TYPES must have exactly 3 entries');
    assert.equal(new Set(EFFECT_NODE_TYPES).size, EFFECT_NODE_TYPES.length, 'no duplicate node types');
  });

  it('VALUE_EXPRESSION_TYPES has exactly the 1 canonical value-expression type', () => {
    assert.deepStrictEqual([...VALUE_EXPRESSION_TYPES], ['card-printed-stat']);
    assert.equal(VALUE_EXPRESSION_TYPES.length, 1, 'VALUE_EXPRESSION_TYPES must have exactly 1 entry');
  });

  it('parameter unions match their canonical arrays exactly', () => {
    assert.deepStrictEqual([...EFFECT_RESOURCE_KINDS], ['attack', 'recruit']);
    assert.deepStrictEqual([...EFFECT_ZONE_KINDS], ['deck', 'discard']);
    assert.deepStrictEqual([...EFFECT_CARD_POSITIONS], ['top']);
    assert.deepStrictEqual([...EFFECT_OWNER_KINDS], ['current-player']);
  });

  it('EFFECT_NODE_HANDLERS keys equal EFFECT_NODE_TYPES exactly (bidirectional)', () => {
    assert.deepStrictEqual(
      Object.keys(EFFECT_NODE_HANDLERS).sort(),
      [...EFFECT_NODE_TYPES].sort(),
      'EFFECT_NODE_HANDLERS keys must equal EFFECT_NODE_TYPES exactly (no missing or extra handler)',
    );
  });

  it('VALUE_EXPRESSION_EVALUATORS keys equal VALUE_EXPRESSION_TYPES exactly (bidirectional)', () => {
    assert.deepStrictEqual(
      Object.keys(VALUE_EXPRESSION_EVALUATORS).sort(),
      [...VALUE_EXPRESSION_TYPES].sort(),
      'VALUE_EXPRESSION_EVALUATORS keys must equal VALUE_EXPRESSION_TYPES exactly',
    );
  });
});

// ---------------------------------------------------------------------------
// Berserk executes deterministically as data (§Acceptance B)
// ---------------------------------------------------------------------------

describe('interpretHeroPrimitiveEffect — Berserk', () => {
  it('discards the deck-top card and grants +Attack equal to its printed attack', () => {
    const G = makeState({
      deck: ['top', 'second', 'third'],
      cardStats: { top: makeCardStat({ attack: 3 }) },
    });

    interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);

    assert.deepStrictEqual(G.playerZones['0']!.deck, ['second', 'third'], 'top card left the deck');
    assert.deepStrictEqual(G.playerZones['0']!.discard, ['top'], 'top card moved to discard');
    assert.equal(G.turnEconomy!.attack, 3, '+Attack equals the discarded card printed attack');
  });

  it('empty deck → no move, +0 (no reshuffle)', () => {
    const G = makeState({ deck: [], discard: ['already'] });

    interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);

    assert.deepStrictEqual(G.playerZones['0']!.deck, [], 'deck stays empty (no reshuffle)');
    assert.deepStrictEqual(G.playerZones['0']!.discard, ['already'], 'discard unchanged');
    assert.equal(G.turnEconomy!.attack, 0, 'an unbound ref grants +0');
  });

  it('missing cardStats entry → card still discards, +0 (D-21502 starter limitation)', () => {
    const G = makeState({ deck: ['orphan', 'next'], cardStats: {} });

    interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);

    assert.deepStrictEqual(G.playerZones['0']!.discard, ['orphan'], 'card still moves to discard');
    assert.equal(G.turnEconomy!.attack, 0, 'a card with no cardStats grants +0');
  });

  it('replays identically given the same setup (determinism)', () => {
    const first = makeState({ deck: ['top', 'b'], cardStats: { top: makeCardStat({ attack: 4 }) } });
    const second = makeState({ deck: ['top', 'b'], cardStats: { top: makeCardStat({ attack: 4 }) } });

    interpretHeroPrimitiveEffect(first, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);
    interpretHeroPrimitiveEffect(second, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);

    assert.deepStrictEqual(first.playerZones['0'], second.playerZones['0']);
    assert.deepStrictEqual(first.turnEconomy, second.turnEconomy);
  });

  it('does NOT mutate the shared HERO_COMPOSITION_MARKERS registry AST', () => {
    const before = JSON.stringify(HERO_COMPOSITION_MARKERS['berserk']);
    const G = makeState({ deck: ['top'], cardStats: { top: makeCardStat({ attack: 2 }) } });

    interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);

    assert.equal(
      JSON.stringify(HERO_COMPOSITION_MARKERS['berserk']),
      before,
      'the interpreter reads the AST; it must never mutate the shared registry const',
    );
  });
});

// ---------------------------------------------------------------------------
// The cousin is data (§Acceptance D)
// ---------------------------------------------------------------------------

describe('interpretHeroPrimitiveEffect — the Recruit cousin is pure data', () => {
  it('a recruit-stat composition AST grants +Recruit with NO engine edit', () => {
    const G = makeState({
      deck: ['top', 'second'],
      cardStats: { top: makeCardStat({ recruit: 5 }) },
    });

    interpretHeroPrimitiveEffect(G, CTX, '0', RECRUIT_COUSIN);

    assert.deepStrictEqual(G.playerZones['0']!.discard, ['top'], 'top card discarded');
    assert.equal(G.turnEconomy!.recruit, 5, '+Recruit equals the discarded card printed recruit');
    assert.equal(G.turnEconomy!.attack, 0, 'no attack granted by the recruit cousin');
  });
});

// ---------------------------------------------------------------------------
// The load-bearing invariant — context never written to G (D-24029 §9)
// ---------------------------------------------------------------------------

describe('interpretHeroPrimitiveEffect — the bind/ref context is never in G', () => {
  it('G carries no binding key after interpretation', () => {
    const G = makeState({ deck: ['top'], cardStats: { top: makeCardStat({ attack: 7 }) } });

    interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);

    assert.ok(
      !JSON.stringify(G).includes('discardedCard'),
      'the bind name must never be serialized into G (the load-bearing replay invariant)',
    );
  });

  it('bindings are isolated per top-level call — a later ref cannot read an earlier bind', () => {
    const G = makeState({ deck: ['top'], cardStats: { top: makeCardStat({ attack: 6 }) } });

    // Call 1 binds discardedCard and grants +6.
    interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!);
    assert.equal(G.turnEconomy!.attack, 6, 'call 1 granted the discarded card attack');

    // Call 2 is a SEPARATE top-level effect referencing the same binding name; its fresh
    // context has no discardedCard, so the ref resolves to 0 (+0) and warns.
    const standaloneGain: EffectNode = {
      type: 'gain-resource',
      resource: 'attack',
      amount: { type: 'card-printed-stat', card: { ref: 'discardedCard' }, stat: 'attack' },
    };
    interpretHeroPrimitiveEffect(G, CTX, '0', standaloneGain);

    assert.equal(G.turnEconomy!.attack, 6, 'call 2 added +0 — the earlier binding is not visible');
    assert.ok(
      G.messages.some((message) => message.includes('unbound binding "discardedCard"')),
      'an unbound ref in a separate top-level call warns',
    );
  });
});

// ---------------------------------------------------------------------------
// Runtime dispatch guard — unknown node/value warn, never throw (§Acceptance B)
// ---------------------------------------------------------------------------

describe('interpretHeroPrimitiveEffect — runtime dispatch guard', () => {
  it('an unknown node type warns and skips (does NOT throw — a direct map index would crash)', () => {
    const G = makeState({ deck: ['top'], cardStats: { top: makeCardStat({ attack: 9 }) } });
    const malformed = { type: 'bogus-node' } as unknown as EffectNode;

    assert.doesNotThrow(() => interpretHeroPrimitiveEffect(G, CTX, '0', malformed));
    assert.deepStrictEqual(G.playerZones['0']!.deck, ['top'], 'no mutation on an unknown node');
    assert.equal(G.turnEconomy!.attack, 0, 'no mutation on an unknown node');
    assert.ok(
      G.messages.some((message) => message.includes('unknown node type "bogus-node"')),
      'an unknown node type warns',
    );
  });

  it('an unknown value-expression type warns and resolves to 0 (does NOT throw)', () => {
    const G = makeState({ deck: ['top'], cardStats: { top: makeCardStat({ attack: 9 }) } });
    const gainWithBadAmount = {
      type: 'gain-resource',
      resource: 'attack',
      amount: { type: 'bogus-value' },
    } as unknown as EffectNode;

    assert.doesNotThrow(() => interpretHeroPrimitiveEffect(G, CTX, '0', gainWithBadAmount));
    assert.equal(G.turnEconomy!.attack, 0, 'an unknown value expression resolves to +0');
    assert.ok(
      G.messages.some((message) => message.includes('unknown value-expression type "bogus-value"')),
      'an unknown value-expression type warns',
    );
  });

  it('warning emission is best-effort — a G without a messages array does not throw', () => {
    const G = makeState({ deck: ['orphan'], cardStats: {}, omitMessages: true });

    // The missing-cardStats path attempts a warning; with no messages array it must still
    // default deterministically (discard the card, +0) rather than throw.
    assert.doesNotThrow(() => interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!));
    assert.deepStrictEqual(G.playerZones['0']!.discard, ['orphan'], 'card still discards without a messages array');
    assert.equal(G.turnEconomy!.attack, 0, '+0 without a messages array');
  });

  it('a gain-resource with no turn economy warns and skips (no throw)', () => {
    const G = makeState({ deck: ['top'], cardStats: { top: makeCardStat({ attack: 3 }) }, omitTurnEconomy: true });

    assert.doesNotThrow(() => interpretHeroPrimitiveEffect(G, CTX, '0', HERO_COMPOSITION_MARKERS['berserk']!));
    // The move still ran (deck-top discarded); only the gain skipped.
    assert.deepStrictEqual(G.playerZones['0']!.discard, ['top'], 'the move-card step still ran');
  });
});
