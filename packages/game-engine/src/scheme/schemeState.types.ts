/**
 * Scheme runtime state for the Legendary Arena game engine.
 *
 * SchemeState holds destination piles for resolved scheme cards.
 * Built at setup time; mutated only by revealVillainCard.
 */

import type { CardExtId } from '../state/zones.types.js';

/**
 * Runtime scheme state tracking resolved scheme-twist cards.
 *
 * Lives at G.scheme. Separate from G.schemeSetupInstructions which
 * stores the one-time setup instruction list (D-2601).
 */
export interface SchemeState {
  // why: append-only destination pile for resolved scheme-twist cards.
  // Order is chronological (insertion order); no reshuffle in MVP.
  /** Resolved scheme-twist cards — append-only, chronological. */
  twistPile: CardExtId[];
}
