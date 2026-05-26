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

  // why: setup-time snapshot of the scheme card's abilities text from the
  // registry. Projected through UIState so the play surface can tell the
  // player what the scheme does and what happens on a Scheme Twist.
  // Optional on the G type so existing test fixtures compile without
  // modification; the builder always populates it.
  /** Scheme card ability text lines. Built at setup, read-only at runtime. */
  readonly gameText?: readonly string[];
}
