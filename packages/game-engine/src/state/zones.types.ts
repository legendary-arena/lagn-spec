/**
 * Canonical zone and player state contracts for the Legendary Arena game engine.
 *
 * This file is the single source of truth for all zone, pile, and player state
 * type definitions. All other files must import from here (or via the re-exports
 * in types.ts / index.ts).
 *
 * No boardgame.io imports allowed — these are pure data contracts.
 */

import type { PlayerId } from '../types.js';

// why: Zones store ext_id strings rather than full card objects because G must
// remain JSON-serializable and small. Card display data (images, text, costs)
// is resolved by the UI via the card registry at render time. Storing full card
// objects would bloat G, break serialization guarantees, and duplicate data that
// the registry already owns.

/**
 * Named type alias for card ext_id strings stored in zones and piles.
 *
 * All zones in G store CardExtId strings exclusively — never full card
 * objects, display names, or database IDs.
 */
export type CardExtId = string;

/**
 * A zone is an ordered array of card ext_id strings.
 *
 * Every player zone and global pile is typed as Zone. The array ordering
 * is meaningful (e.g., deck[0] is the top card).
 */
export type Zone = CardExtId[];

/**
 * Per-player card zones. All arrays contain CardExtId strings only.
 *
 * After setup, only `deck` is non-empty. Cards enter other zones
 * exclusively through game moves — never through setup initialization.
 */
export interface PlayerZones {
  /** The player's draw pile. Shuffled at setup. */
  deck: Zone;
  /** Cards in the player's hand. Empty at setup. */
  hand: Zone;
  /** The player's discard pile. Empty at setup. */
  discard: Zone;
  /** Cards currently in play this turn. Empty at setup. */
  inPlay: Zone;
  /** Defeated villains and rescued bystanders. Empty at setup. */
  victory: Zone;
}

/**
 * Complete state for a single player, including their identity and zones.
 */
export interface PlayerState {
  /** The player's unique identifier (boardgame.io uses "0", "1", etc.). */
  playerId: string;
  /** The player's card zones. */
  zones: PlayerZones;
}

/**
 * Shared global card piles. Sizes come from MatchSetupConfig count fields.
 * All arrays contain CardExtId strings only.
 */
export interface GlobalPiles {
  /** Bystander cards. Size equals config.bystandersCount. */
  bystanders: Zone;
  /** Wound cards. Size equals config.woundsCount. */
  wounds: Zone;
  /** S.H.I.E.L.D. Officer cards. Size equals config.officersCount. */
  officers: Zone;
  /** Sidekick cards. Size equals config.sidekicksCount. */
  sidekicks: Zone;
  // why: non-player-owned, scheme-controlled, read-only in MVP. No scheme
  // currently populates this pile; it exists for the projection contract
  // (UISharedPilesState.horrorsCount per D-12802) and future scheme WPs.
  /** Horror cards. Scheme-controlled; empty in MVP. */
  horrors: Zone;
}

/**
 * Structured validation error for zone shape checks.
 *
 * This is intentionally distinct from MoveError (which uses { code, message, path }
 * and is defined in WP-008A). Zone validation errors identify a field and describe
 * the structural problem — they are diagnostic, not move-result errors.
 */
export type ZoneValidationError = {
  /** The field path that failed validation (e.g., "playerZones", "piles.bystanders"). */
  field: string;
  /** Human-readable description of the structural problem. */
  message: string;
};

/**
 * Minimal interface representing the game state shape that zone validators check.
 *
 * This is intentionally minimal — it includes only the fields required for
 * structural zone validation. It does not mirror the full LegendaryGameState.
 */
export interface GameStateShape {
  /** Per-player card zones, keyed by player ID ("0", "1", ...). */
  playerZones: Record<PlayerId, PlayerZones>;
  /** Shared global card piles (bystanders, wounds, officers, sidekicks). */
  piles: GlobalPiles;
}
