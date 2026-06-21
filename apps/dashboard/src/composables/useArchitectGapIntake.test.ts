import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computed } from 'vue';
import { useArchitectGapIntake } from './useArchitectGapIntake.js';
import type { RuntimeObservedEntry, RuntimeObservedExample } from '../types/coverage.js';

/**
 * Build a `RuntimeObservedExample` with sensible defaults. Callers override the
 * card type / id / reason to exercise specific mapping and pass-through paths.
 */
function makeExample(overrides: Partial<RuntimeObservedExample> = {}): RuntimeObservedExample {
  return {
    cardId: 'card-default',
    cardType: 'hero',
    timing: 'on-play',
    reason: 'no-handler',
    ...overrides,
  };
}

/**
 * Build a `RuntimeObservedEntry` with one mappable hero example and `hitCount`
 * 1. Callers override `hitCount` / `examples` to exercise selection rules. The
 * `byReason` and `lastSeenTurn` fields are present but never read by the
 * producer (they are not part of the candidate contract).
 */
function makeEntry(overrides: Partial<RuntimeObservedEntry> = {}): RuntimeObservedEntry {
  return {
    hitCount: 1,
    lastSeenTurn: 7,
    byReason: { 'no-handler': 1, 'unsupported-keyword': 0, 'parse-unrecognized': 0 },
    examples: [makeExample()],
    ...overrides,
  };
}

/**
 * Run the producer over a plain by-mechanic map (the shape `useCoverageLedger()`
 * exposes), wrapping it in the `ComputedRef` the producer expects, and return
 * the resolved projection.
 */
function project(byMechanic: Record<string, RuntimeObservedEntry>) {
  return useArchitectGapIntake(computed(() => byMechanic)).value;
}

describe('useArchitectGapIntake', () => {
  describe('selection', () => {
    it('should_emit_one_candidate_with_exact_copied_fields_for_a_hit_mechanic', () => {
      const projection = project({
        stun: makeEntry({
          hitCount: 4,
          examples: [
            makeExample({
              cardId: 'rlmk-black-bolt',
              cardType: 'hero',
              timing: 'on-fight',
              reason: 'unsupported-keyword',
            }),
          ],
        }),
      });

      assert.equal(projection.candidates.length, 1);
      assert.deepEqual(projection.candidates[0], {
        mechanic: 'stun',
        exampleCardId: 'rlmk-black-bolt',
        cardType: 'hero',
        timing: 'on-fight',
        reason: 'unsupported-keyword',
        observedCount: 4,
        sourceRow: 'stun',
        proposedTargetLayer: 'game-engine-hero',
      });
    });

    it('should_map_villain_and_henchman_card_types_to_the_villain_layer', () => {
      const projection = project({
        ambush: makeEntry({ examples: [makeExample({ cardType: 'villain' })] }),
        swarm: makeEntry({ examples: [makeExample({ cardType: 'henchman' })] }),
      });

      const byMechanic = new Map(projection.candidates.map((c) => [c.mechanic, c]));
      assert.equal(byMechanic.get('ambush')!.proposedTargetLayer, 'game-engine-villain');
      assert.equal(byMechanic.get('swarm')!.proposedTargetLayer, 'game-engine-villain');
    });

    it('should_emit_no_candidate_for_an_empty_map', () => {
      const projection = project({});
      assert.equal(projection.candidates.length, 0);
      assert.equal(projection.backlog.length, 0);
    });

    it('should_emit_no_candidate_when_hitCount_is_zero', () => {
      const projection = project({ stun: makeEntry({ hitCount: 0 }) });
      assert.equal(projection.candidates.length, 0);
    });

    it('should_emit_no_candidate_when_there_are_no_examples', () => {
      const projection = project({ stun: makeEntry({ examples: [] }) });
      assert.equal(projection.candidates.length, 0);
    });

    it('should_emit_no_candidate_when_no_example_has_a_mappable_card_type', () => {
      const projection = project({
        plot: makeEntry({ examples: [makeExample({ cardType: 'mastermind' })] }),
      });
      assert.equal(projection.candidates.length, 0);
    });

    it('should_emit_no_candidate_when_the_only_example_is_a_scheme', () => {
      const projection = project({
        twist: makeEntry({ examples: [makeExample({ cardType: 'scheme' })] }),
      });
      assert.equal(projection.candidates.length, 0);
    });
  });

  describe('example selection', () => {
    it('should_use_the_first_example_when_multiple_are_mappable', () => {
      const projection = project({
        stun: makeEntry({
          examples: [
            makeExample({ cardId: 'first-hero', cardType: 'hero' }),
            makeExample({ cardId: 'second-villain', cardType: 'villain' }),
          ],
        }),
      });

      assert.equal(projection.candidates.length, 1);
      assert.equal(projection.candidates[0]!.exampleCardId, 'first-hero');
      assert.equal(projection.candidates[0]!.proposedTargetLayer, 'game-engine-hero');
    });

    it('should_skip_an_unmapped_first_example_and_use_a_later_mappable_one', () => {
      const projection = project({
        stun: makeEntry({
          examples: [
            makeExample({ cardId: 'unmapped-mastermind', cardType: 'mastermind' }),
            makeExample({ cardId: 'mapped-villain', cardType: 'villain' }),
          ],
        }),
      });

      assert.equal(projection.candidates.length, 1);
      assert.equal(projection.candidates[0]!.exampleCardId, 'mapped-villain');
      assert.equal(projection.candidates[0]!.cardType, 'villain');
      assert.equal(projection.candidates[0]!.proposedTargetLayer, 'game-engine-villain');
    });
  });

  describe('reason pass-through', () => {
    it('should_preserve_reason_strings_exactly_including_unknown_future_values', () => {
      const projection = project({
        stun: makeEntry({
          examples: [makeExample({ reason: 'some-future-reason-not-yet-in-the-taxonomy' })],
        }),
      });

      assert.equal(projection.candidates.length, 1);
      assert.equal(projection.candidates[0]!.reason, 'some-future-reason-not-yet-in-the-taxonomy');
    });
  });

  describe('ordering', () => {
    it('should_order_by_observedCount_desc_then_mechanic_asc', () => {
      // Insertion order (alpha, gamma, beta) differs from the sorted order, so a
      // pass can only come from the comparator, not Object.entries iteration.
      const projection = project({
        alpha: makeEntry({ hitCount: 2 }),
        gamma: makeEntry({ hitCount: 5 }),
        beta: makeEntry({ hitCount: 5 }),
      });

      assert.deepEqual(
        projection.candidates.map((c) => c.mechanic),
        ['beta', 'gamma', 'alpha'],
      );
    });
  });

  describe('backlog rendering', () => {
    it('should_derive_backlog_items_one_to_one_from_ordered_candidates', () => {
      const projection = project({
        alpha: makeEntry({ hitCount: 2, examples: [makeExample({ reason: 'no-handler' })] }),
        beta: makeEntry({
          hitCount: 5,
          examples: [makeExample({ reason: 'unsupported-keyword' })],
        }),
      });

      assert.equal(projection.backlog.length, projection.candidates.length);
      assert.deepEqual(projection.backlog, [
        {
          id: 'architect-gap-beta',
          label: 'beta — unsupported-keyword (5× in play)',
          meta: 'Hollow gap',
        },
        {
          id: 'architect-gap-alpha',
          label: 'alpha — no-handler (2× in play)',
          meta: 'Hollow gap',
        },
      ]);
    });
  });
});
