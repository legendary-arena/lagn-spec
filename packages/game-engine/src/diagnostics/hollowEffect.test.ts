/**
 * Tests for the hollow-effect contract + writer (WP-257 / D-24033 + D-24034).
 *
 * Covers: EFFECT_EXECUTION_REASONS canonical-array drift (matches its union
 * exactly, in order, no duplicates); isHollowReason flags exactly the three
 * hollow reasons; recordHollowEffect lazy-init + cap + hollowEffectsDropped;
 * non-array G.messages is a guarded no-op (no throw); JSON-serializability.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECT_EXECUTION_REASONS,
  isHollowReason,
  HOLLOW_EFFECTS_CAP,
  DEFERRED_BY_DESIGN_MECHANICS,
} from './hollowEffect.types.js';
import type {
  EffectExecutionReason,
  HollowEffectRecord,
} from './hollowEffect.types.js';
import { recordHollowEffect } from './hollowEffect.record.js';
import type { LegendaryGameState } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal G exercising only the fields recordHollowEffect touches
 * (messages + the lazy-init diagnostics channel). Cast through unknown because
 * the writer never reads the rest.
 */
function makeG(messages?: unknown): LegendaryGameState {
  return {
    messages: messages === undefined ? [] : messages,
  } as unknown as LegendaryGameState;
}

/**
 * Builds a HollowEffectRecord with sensible defaults for writer tests.
 */
function makeRecord(overrides?: Partial<HollowEffectRecord>): HollowEffectRecord {
  return {
    cardId: 'core/spider-man/astonishing-strength#0',
    cardType: 'hero',
    timing: 'onPlay',
    mechanic: 'made-up-keyword',
    reason: 'no-handler',
    turn: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Canonical-array drift (code-style §Drift Detection)
// ---------------------------------------------------------------------------

describe('EFFECT_EXECUTION_REASONS canonical-array drift (D-24033)', () => {
  // why: the union has no runtime presence, so this asserts the array matches the
  // exact 7-member union in the locked order. A reason added to the union but not
  // the array (or vice versa) fails here — same drift contract as REVEAL_ACTION_KINDS.
  it('has exactly the 7 canonical reasons, in order, no duplicates', () => {
    const expected: EffectExecutionReason[] = [
      'applied',
      'handler-noop',
      'condition-failed',
      'deferred',
      'no-handler',
      'unsupported-keyword',
      'parse-unrecognized',
    ];
    assert.deepStrictEqual(
      [...EFFECT_EXECUTION_REASONS],
      expected,
      'EFFECT_EXECUTION_REASONS must match the canonical reasons in order',
    );
    assert.equal(
      new Set(EFFECT_EXECUTION_REASONS).size,
      EFFECT_EXECUTION_REASONS.length,
      'no duplicate reasons',
    );
  });
});

// ---------------------------------------------------------------------------
// isHollowReason predicate
// ---------------------------------------------------------------------------

describe('isHollowReason', () => {
  it('flags exactly the three hollow reasons and no others', () => {
    const hollow: EffectExecutionReason[] = [
      'parse-unrecognized',
      'no-handler',
      'unsupported-keyword',
    ];
    const reachable: EffectExecutionReason[] = [
      'applied',
      'handler-noop',
      'condition-failed',
      'deferred',
    ];
    for (const reason of hollow) {
      assert.equal(isHollowReason(reason), true, `${reason} must be hollow`);
    }
    for (const reason of reachable) {
      assert.equal(isHollowReason(reason), false, `${reason} must NOT be hollow`);
    }
  });

  // why: every member of the canonical array is classified by the predicate —
  // exactly 3 true, 4 false — so a future reason cannot be silently un-classified.
  it('classifies every reason in the canonical array (3 hollow, 4 reachable)', () => {
    let hollowCount = 0;
    for (const reason of EFFECT_EXECUTION_REASONS) {
      if (isHollowReason(reason)) {
        hollowCount += 1;
      }
    }
    assert.equal(hollowCount, 3, 'exactly 3 of the 7 reasons are hollow');
  });
});

// ---------------------------------------------------------------------------
// DEFERRED_BY_DESIGN_MECHANICS allowlist
// ---------------------------------------------------------------------------

describe('DEFERRED_BY_DESIGN_MECHANICS', () => {
  it('contains wound and conditional (the no-handler-but-deferred mechanics)', () => {
    assert.equal(DEFERRED_BY_DESIGN_MECHANICS.has('wound'), true);
    assert.equal(DEFERRED_BY_DESIGN_MECHANICS.has('conditional'), true);
  });

  it('does not list any executable MVP keyword', () => {
    assert.equal(DEFERRED_BY_DESIGN_MECHANICS.has('draw'), false);
    assert.equal(DEFERRED_BY_DESIGN_MECHANICS.has('rescue'), false);
    assert.equal(DEFERRED_BY_DESIGN_MECHANICS.has('reveal'), false);
  });
});

// ---------------------------------------------------------------------------
// recordHollowEffect — lazy-init + cap + dropped + no-throw
// ---------------------------------------------------------------------------

describe('recordHollowEffect', () => {
  it('lazy-inits G.diagnostics on the first write', () => {
    const G = makeG();
    assert.equal(G.diagnostics, undefined, 'channel is absent before the first write');
    recordHollowEffect(G, makeRecord());
    assert.ok(G.diagnostics, 'channel materializes on first write');
    assert.equal(G.diagnostics!.hollowEffects.length, 1);
    assert.equal(G.diagnostics!.hollowEffectsDropped, 0);
  });

  it('appends a full-sentence G.messages line for a retained record', () => {
    const G = makeG();
    recordHollowEffect(G, makeRecord({ mechanic: 'phantom', timing: 'onPlay' }));
    assert.equal(G.messages.length, 1);
    assert.match(G.messages[0]!, /Unhandled effect observed/);
    assert.match(G.messages[0]!, /phantom/);
  });

  it('stores the record fields verbatim (the machine-readable contract)', () => {
    const G = makeG();
    const record = makeRecord({
      cardId: 'core/v/skrull#3',
      cardType: 'villain',
      timing: 'onAmbush',
      mechanic: 'mind-control',
      reason: 'parse-unrecognized',
      turn: 7,
    });
    recordHollowEffect(G, record);
    assert.deepStrictEqual(G.diagnostics!.hollowEffects[0], record);
  });

  it('caps the list at HOLLOW_EFFECTS_CAP and counts dropped overflow', () => {
    const G = makeG();
    const overflow = 5;
    for (let i = 0; i < HOLLOW_EFFECTS_CAP + overflow; i++) {
      recordHollowEffect(G, makeRecord({ mechanic: `m-${String(i)}` }));
    }
    assert.equal(
      G.diagnostics!.hollowEffects.length,
      HOLLOW_EFFECTS_CAP,
      'the list never exceeds the cap',
    );
    assert.equal(
      G.diagnostics!.hollowEffectsDropped,
      overflow,
      'every record past the cap is counted as dropped',
    );
  });

  it('does NOT append a G.messages line for a dropped (over-cap) record', () => {
    const G = makeG();
    for (let i = 0; i < HOLLOW_EFFECTS_CAP; i++) {
      recordHollowEffect(G, makeRecord());
    }
    const messagesAtCap = G.messages.length;
    recordHollowEffect(G, makeRecord({ mechanic: 'over-cap' }));
    assert.equal(G.messages.length, messagesAtCap, 'no message line for a dropped record');
    assert.equal(G.diagnostics!.hollowEffectsDropped, 1);
  });

  it('does not throw when G.messages is not an array (guarded no-op)', () => {
    const G = makeG(undefined as unknown);
    // why: simulate an older/narrow test mock that built G without a messages array.
    (G as { messages?: unknown }).messages = undefined;
    assert.doesNotThrow(() => recordHollowEffect(G, makeRecord()));
    assert.equal(G.diagnostics!.hollowEffects.length, 1, 'record still stored');
  });

  it('does not throw when G.messages is a non-array object', () => {
    const G = makeG({ notAnArray: true });
    assert.doesNotThrow(() => recordHollowEffect(G, makeRecord()));
    assert.equal(G.diagnostics!.hollowEffects.length, 1, 'record still stored');
  });

  it('produces a JSON-serializable channel (no functions/Maps/Sets)', () => {
    const G = makeG();
    recordHollowEffect(G, makeRecord());
    recordHollowEffect(G, makeRecord({ reason: 'unsupported-keyword' }));
    const roundTripped = JSON.parse(JSON.stringify(G.diagnostics));
    assert.deepStrictEqual(roundTripped, G.diagnostics);
  });

  it('is deterministic — identical writes produce identical channel state', () => {
    const buildAndWrite = (): LegendaryGameState => {
      const G = makeG();
      recordHollowEffect(G, makeRecord({ mechanic: 'a' }));
      recordHollowEffect(G, makeRecord({ mechanic: 'b', reason: 'parse-unrecognized' }));
      return G;
    };
    const first = buildAndWrite();
    const second = buildAndWrite();
    assert.deepStrictEqual(first.diagnostics, second.diagnostics);
  });
});
