/**
 * Pure resolver for count-scaled hero ability effects.
 *
 * resolveCountSource maps a HeroCountSource to the non-negative integer count
 * an `attack-per-count` effect scales by. It is pure and total: it reads only
 * `G`, never mutates, never throws, and returns 0 for any source it does not
 * recognize (the union is closed, so this is defensive). No randomness, no
 * clock, no I/O. Classification is by ext_id string and `G` reads only — no
 * registry access (counts are resolved from card ext_ids already present in
 * the zones, not from card definitions).
 *
 * No boardgame.io imports. No .reduce(). No throws.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { HeroCountSource } from '../rules/heroCountSource.js';
import { BYSTANDER_EXT_ID } from '../setup/pilesInit.js';

// why: villain-deck bystanders carry the `bystander-villain-deck-NN` ext_id
// form (villainDeck.setup.ts), distinct from the global-pile `pile-bystander`
// form (BYSTANDER_EXT_ID). The victory pile may hold both, so the count must
// span both ext_id forms.
const VILLAIN_DECK_BYSTANDER_PREFIX = 'bystander-villain-deck-';

/**
 * Returns true when an ext_id names a bystander in either ext_id form.
 *
 * @param extId - The card ext_id stored in a zone.
 * @returns Whether the ext_id is a bystander (pile or villain-deck form).
 */
function isBystanderExtId(extId: CardExtId): boolean {
  // why: victory-bystanders counts both bystander ext_id forms
  // (pile-bystander + bystander-villain-deck-NN); villain/henchman/tactic
  // victory-pile cards do not match either form and are excluded.
  return extId === BYSTANDER_EXT_ID || extId.startsWith(VILLAIN_DECK_BYSTANDER_PREFIX);
}

/**
 * Counts the player's victory-pile bystanders across both ext_id forms.
 *
 * @param G - Game state (read-only).
 * @param playerID - The player whose victory pile to count.
 * @returns The number of bystander entries in that player's victory pile.
 */
function countVictoryBystanders(G: LegendaryGameState, playerID: string): number {
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return 0;
  }

  let bystanderCount = 0;
  for (const extId of playerZones.victory) {
    if (isBystanderExtId(extId)) {
      bystanderCount++;
    }
  }
  return bystanderCount;
}

/**
 * Resolves a count source to the non-negative integer it represents.
 *
 * Pure and total: reads only `G`, never mutates or throws, and returns 0 for
 * any unrecognized source. The returned value is the count an `attack-per-count`
 * effect multiplies by its per-unit magnitude.
 *
 * @param G - Game state (read-only).
 * @param playerID - The active player whose state to read.
 * @param source - The count source to resolve.
 * @returns A non-negative integer count (0 for an unknown source).
 */
export function resolveCountSource(
  G: LegendaryGameState,
  playerID: string,
  source: HeroCountSource,
): number {
  switch (source) {
    case 'victory-bystanders': {
      return countVictoryBystanders(G, playerID);
    }
    default: {
      // why: defensive — the union is closed, but an unrecognized source must
      // resolve to 0 (a skipped no-op grant) rather than throw.
      return 0;
    }
  }
}
