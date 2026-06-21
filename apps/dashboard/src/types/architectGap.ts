/**
 * The Architect-lane gap intake contract (WP-260 / D-24036) — the third surface
 * of the hollow-effect reporting loop (`DESIGN-HOLLOW-EFFECT-DETECTION.md §6.3`).
 * The dashboard Pipeline page's Architect lane surfaces, as draft-WP backlog
 * candidates, the card mechanics WP-259's `/coverage` overlay marks
 * runtime-confirmed hollow: declared abilities actually encountered in play whose
 * handlers were unreachable.
 *
 * why (DESIGN §9 — invent no facts): every field of an `ArchitectGapCandidate`
 * is either copied verbatim from the runtime-observed overlay evidence
 * (`useCoverageLedger().runtimeObservedByMechanic`) or derived by the fixed
 * `cardType` → target-layer mapping in `useArchitectGapIntake.ts`. Nothing is
 * synthesized. The dashboard reads downstream-derived data only; the engine
 * never knows the agent pipeline exists.
 */

/**
 * The proposed implementation layer for a runtime-confirmed gap. A closed union:
 * an example whose `cardType` falls outside the fixed map produces no candidate,
 * so the producer never invents a layer it cannot derive.
 */
export type ArchitectTargetLayer = 'game-engine-hero' | 'game-engine-villain';

/**
 * One runtime-confirmed hollow-effect gap, carrying the minimum diagnostic
 * evidence a human architect needs to draft a follow-up implementation WP. Field
 * names match `DESIGN-HOLLOW-EFFECT-DETECTION.md §6.3` exactly. Every field is
 * copied from the overlay evidence or derived by the locked `cardType` mapping
 * (see the producer); none is invented.
 */
export interface ArchitectGapCandidate {
  readonly mechanic: string;
  readonly exampleCardId: string;
  readonly cardType: string;
  readonly timing: string;
  readonly reason: string;
  readonly observedCount: number;
  readonly sourceRow: string;
  readonly proposedTargetLayer: ArchitectTargetLayer;
}
