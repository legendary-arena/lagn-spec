/**
 * Pure helper deriving the active player's victory-pile composition counters
 * from `players[ownIndex].victoryCards[]` projected by WP-128.
 *
 * Per D-12906 the universal counters (Bystanders rescued, Villains defeated,
 * Henchmen defeated, Mastermind cards, Wounds in pile) are derived at render
 * time from `UIDisplayEntry.display` payloads. Scenario-specific counters
 * (S.H.I.E.L.D. Level, HYDRA Level, Smashes, Bindings) are deferred to a
 * future board-layout-WP per `DESIGN-BOARD-LAYOUT.md §7.2 #6` and ship as
 * an empty array in WP-129 — derivation hook reserved.
 *
 * The helper bins each entry by extId-prefix heuristic:
 *   - `'bystander*'`    → bystanders rescued
 *   - `'wound*'`        → wounds in pile
 *   - `'mastermind*'`   → mastermind cards
 *   - `'henchman*'`     → henchmen defeated
 *   - everything else   → villains defeated (covers core villains, scheme
 *                          twists routed to victory, etc.)
 *
 * The heuristic is conservative — when WP-130's metadata hook lands, the
 * caller can replace the prefix matching with metadata-driven binning
 * without changing the consumer's contract.
 *
 * @see WP-129 §Acceptance Criteria — Composition counters
 * @see DECISIONS.md D-12906
 * @see DESIGN-BOARD-LAYOUT.md §7.2 #6
 */

import {
  BYSTANDER_EXT_ID,
  WOUND_EXT_ID,
  type UIDisplayEntry,
} from '@legendary-arena/game-engine';

// why: master-strike ext_ids are emitted by the villain-deck builder as
// `master-strike-{NN}` (see villainDeck.setup.ts §MASTER_STRIKE_COUNT
// loop). They don't appear in the victory pile under MVP rules — defeated
// Master Strikes route to G.mastermind.strikePile, not player victory —
// but classify defensively so a future routing change (or a recorded
// fixture replay) doesn't silently misbin them as villainsDefeated.
const MASTER_STRIKE_PREFIX = 'master-strike-';

export interface VictoryPileComposition {
  bystandersRescued: number;
  villainsDefeated: number;
  henchmenDefeated: number;
  mastermindCards: number;
  woundsInPile: number;
  /**
   * Scenario-specific counter set; empty in WP-129 per D-12906 deferred
   * derivation hook. Future WP populates these via metadata file or
   * card-effect discovery.
   */
  scenarioSpecific: { name: string; value: number }[];
}

const ZERO: VictoryPileComposition = {
  bystandersRescued: 0,
  villainsDefeated: 0,
  henchmenDefeated: 0,
  mastermindCards: 0,
  woundsInPile: 0,
  scenarioSpecific: [],
};

function classify(extId: string): keyof Omit<VictoryPileComposition, 'scenarioSpecific'> {
  // why: prefix-heuristic per D-12906 — conservative matching against the
  // canonical CardExtId patterns set by the registry. The order matters:
  // mastermind/henchman/bystander/wound prefixes are checked first; the
  // catch-all bins to villainsDefeated.
  //
  // why: well-known generic-component ext_ids (BYSTANDER_EXT_ID =
  // 'pile-bystander', WOUND_EXT_ID = 'pile-wound') are checked first as
  // literal equality before the prefix paths. These tokens are emitted by
  // pilesInit (NOT registered in G.villainDeckCardTypes) and land in the
  // victory pile via attached-bystander awards on villain defeat and via
  // hero-ability rescues. Without these checks they fall through to the
  // catch-all and miscount as villainsDefeated — mirrors the same dual
  // condition the engine uses in scoring.logic.ts:computeFinalScores and
  // uiState.build.ts:countBystandersRescued.
  if (extId === BYSTANDER_EXT_ID || extId.startsWith('bystander')) {
    return 'bystandersRescued';
  }
  if (extId === WOUND_EXT_ID || extId.startsWith('wound')) {
    return 'woundsInPile';
  }
  if (
    extId.startsWith(MASTER_STRIKE_PREFIX) ||
    extId.startsWith('mastermind') ||
    extId.startsWith('strike-')
  ) {
    return 'mastermindCards';
  }
  if (extId.startsWith('henchman')) {
    return 'henchmenDefeated';
  }
  return 'villainsDefeated';
}

/**
 * Compute the composition counters for the supplied victory-pile entries.
 * Pure function — same input always yields the same output.
 */
export function useVictoryPileComposition(
  victoryCards: UIDisplayEntry[] | undefined,
): VictoryPileComposition {
  if (victoryCards === undefined || victoryCards.length === 0) {
    return { ...ZERO, scenarioSpecific: [] };
  }
  const composition: VictoryPileComposition = {
    bystandersRescued: 0,
    villainsDefeated: 0,
    henchmenDefeated: 0,
    mastermindCards: 0,
    woundsInPile: 0,
    scenarioSpecific: [],
  };
  for (const entry of victoryCards) {
    const bin = classify(entry.extId);
    composition[bin] += 1;
  }
  return composition;
}
