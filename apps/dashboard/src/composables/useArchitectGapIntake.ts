import { computed, type ComputedRef } from 'vue';
import type { RuntimeObservedEntry, RuntimeObservedExample } from '../types/coverage.js';
import type { ArchitectGapCandidate, ArchitectTargetLayer } from '../types/architectGap.js';
import type { ArchitectGapProjection, PipelineItem } from './useAgentPipeline.js';

// ============================================================================
// WP-260 / EC-291 — Architect-lane gap intake producer.
//
// Projects WP-259's runtime-observed by-mechanic tally
// (`useCoverageLedger().runtimeObservedByMechanic`) into runtime-confirmed
// hollow-effect backlog candidates for the Pipeline page's Architect lane.
// Mirrors the WP-239 `useTriageStatus` precedent: a pure projection that
// receives its input by dependency injection and returns a
// `ComputedRef<Projection>`; the projection type itself lives with its consumer
// in `useAgentPipeline.ts` (D-23901) to keep the import one-directional. The
// producer never fetches — it reads only the injected lookup.
// ============================================================================

/** The locked meta tag carried by every Architect-lane gap backlog item. */
const HOLLOW_GAP_META = 'Hollow gap';

/**
 * A runtime-observed example paired with the target layer its `cardType` maps
 * to. Returned only for examples whose card type is in the fixed map.
 */
interface MappableExample {
  readonly example: RuntimeObservedExample;
  readonly proposedTargetLayer: ArchitectTargetLayer;
}

/**
 * Map an example card's `cardType` to its proposed implementation layer, or
 * `null` when the type is outside the fixed map. The mapping is the only place a
 * `proposedTargetLayer` is decided — an unmapped card type yields no candidate
 * rather than an invented layer (DESIGN §9). Explicit `if` chain, never a
 * literal-reason comparison (the card type, not the opaque reason, drives this).
 */
function targetLayerForCardType(cardType: string): ArchitectTargetLayer | null {
  if (cardType === 'hero') {
    return 'game-engine-hero';
  }
  if (cardType === 'villain') {
    return 'game-engine-villain';
  }
  if (cardType === 'henchman') {
    return 'game-engine-villain';
  }
  return null;
}

/**
 * Find the first example whose `cardType` maps to a target layer, preserving the
 * overlay's example order. Returns `null` when no example is mappable, which
 * makes the whole mechanic ineligible.
 */
function firstMappableExample(examples: readonly RuntimeObservedExample[]): MappableExample | null {
  for (const example of examples) {
    const proposedTargetLayer = targetLayerForCardType(example.cardType);
    if (proposedTargetLayer !== null) {
      return { example, proposedTargetLayer };
    }
  }
  return null;
}

/**
 * Deterministic candidate ordering: `observedCount` descending (most-hit gaps
 * lead), then `mechanic` ascending, then `exampleCardId` ascending as the final
 * stable tie-breaker. The last key is unreachable while mechanics are unique map
 * keys, but it keeps the order total and render-stable regardless of input.
 */
function compareCandidates(left: ArchitectGapCandidate, right: ArchitectGapCandidate): number {
  if (left.observedCount !== right.observedCount) {
    return right.observedCount - left.observedCount;
  }
  if (left.mechanic !== right.mechanic) {
    return left.mechanic < right.mechanic ? -1 : 1;
  }
  if (left.exampleCardId !== right.exampleCardId) {
    return left.exampleCardId < right.exampleCardId ? -1 : 1;
  }
  return 0;
}

/**
 * Render one candidate as a Pipeline lane item. The label names the mechanic,
 * its opaque reason, and how many times it bit a player in play; the id is keyed
 * by the (unique) mechanic so Vue keys stay stable across renders.
 */
function toBacklogItem(candidate: ArchitectGapCandidate): PipelineItem {
  return {
    id: `architect-gap-${candidate.mechanic}`,
    label: `${candidate.mechanic} — ${candidate.reason} (${candidate.observedCount}× in play)`,
    meta: HOLLOW_GAP_META,
  };
}

/**
 * Project the runtime-observed by-mechanic tally into Architect-lane gap
 * candidates. The `runtimeObservedByMechanic` lookup is injected (the
 * `ComputedRef` `useCoverageLedger()` exposes); the page samples `.value` once
 * and folds the projection's `backlog` into the Architect lane.
 *
 * why (selection rule, DESIGN §6.3): a mechanic is a runtime-confirmed gap only
 * when its by-mechanic entry was ACTUALLY hit in play (`hitCount > 0`) and
 * carries at least one example whose `cardType` maps to a target layer. Map
 * membership alone is the runtime-observed presence — a static-unsupported
 * mechanic that never bit a player is absent from this lookup and yields no
 * candidate. The `reason` is opaque pass-through evidence; the producer never
 * compares it against a literal value (D-20703).
 */
export function useArchitectGapIntake(
  runtimeObservedByMechanic: ComputedRef<Record<string, RuntimeObservedEntry>>,
): ComputedRef<ArchitectGapProjection> {
  return computed<ArchitectGapProjection>(() => {
    const byMechanic = runtimeObservedByMechanic.value;
    const candidates: ArchitectGapCandidate[] = [];

    for (const [mechanic, entry] of Object.entries(byMechanic)) {
      if (entry.hitCount <= 0) {
        continue;
      }
      const mappable = firstMappableExample(entry.examples);
      if (mappable === null) {
        continue;
      }
      const { example, proposedTargetLayer } = mappable;
      candidates.push({
        mechanic,
        exampleCardId: example.cardId,
        cardType: example.cardType,
        timing: example.timing,
        reason: example.reason,
        observedCount: entry.hitCount,
        // why: WP-259 exposes no dedicated row id, so the mechanic key is the
        // stable source identifier — do not synthesize a new one.
        sourceRow: mechanic,
        proposedTargetLayer,
      });
    }

    candidates.sort(compareCandidates);

    const backlog: PipelineItem[] = candidates.map(toBacklogItem);
    return { candidates, backlog };
  });
}
