/**
 * Global piles initialization for Legendary Arena setup.
 *
 * Constructs typed GlobalPiles from MatchSetupConfig count fields.
 * This is a setup-time helper only — no gameplay logic, no validation.
 *
 * No boardgame.io imports allowed — this is a pure helper module.
 */

import type { CardExtId, GlobalPiles } from '../state/zones.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { ShuffleProvider } from './shuffle.js';
import { shuffleDeck } from './shuffle.js';

// why: Global pile cards (bystanders, wounds, officers, sidekicks) are
// generic game components — each pile contains identical copies of a single
// token card type. Token ext_ids use the "pile-" prefix convention rather
// than registry ext_ids because these are standard game components that
// exist in every Legendary game, not set-specific cards.

/** Well-known ext_id for Bystander pile cards. */
export const BYSTANDER_EXT_ID: CardExtId = 'pile-bystander';

/** Well-known ext_id for Wound pile cards. */
export const WOUND_EXT_ID: CardExtId = 'pile-wound';

/** Well-known ext_id for S.H.I.E.L.D. Officer pile cards. */
export const SHIELD_OFFICER_EXT_ID: CardExtId = 'pile-shield-officer';

/** Well-known ext_id for Sidekick pile cards. */
export const SIDEKICK_EXT_ID: CardExtId = 'pile-sidekick';

/**
 * Creates an array of identical CardExtId entries.
 *
 * @param extId - The ext_id string to repeat.
 * @param count - How many copies to create.
 * @returns Array of `count` copies of `extId`.
 */
function createPileCards(extId: CardExtId, count: number): CardExtId[] {
  const cards: CardExtId[] = [];

  for (let i = 0; i < count; i++) {
    cards.push(extId);
  }

  return cards;
}

/**
 * Builds the global piles from config count fields.
 *
 * Each pile is sized from the corresponding MatchSetupConfig count field
 * and shuffled using the deterministic RNG.
 *
 * @param config - Validated match setup config with count fields.
 * @param context - Shuffle provider with deterministic RNG.
 * @returns GlobalPiles with shuffled arrays of CardExtId strings.
 */
export function buildGlobalPiles(
  config: MatchSetupConfig,
  context: ShuffleProvider,
): GlobalPiles {
  // why: Each pile is shuffled for determinism consistency, even though
  // all cards in a given pile share the same ext_id. This ensures the
  // shuffle path is always exercised and the RNG state advances uniformly.
  return {
    bystanders: shuffleDeck(
      createPileCards(BYSTANDER_EXT_ID, config.bystandersCount),
      context,
    ),
    wounds: shuffleDeck(
      createPileCards(WOUND_EXT_ID, config.woundsCount),
      context,
    ),
    officers: shuffleDeck(
      createPileCards(SHIELD_OFFICER_EXT_ID, config.officersCount),
      context,
    ),
    sidekicks: shuffleDeck(
      createPileCards(SIDEKICK_EXT_ID, config.sidekicksCount),
      context,
    ),
    // why: empty — no scheme currently populates the Horrors pile. Future
    // scheme WPs will add population logic for schemes that use Horrors.
    horrors: [],
  };
}
