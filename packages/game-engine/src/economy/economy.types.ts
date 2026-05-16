/**
 * Economy types for the Legendary Arena game engine.
 *
 * TurnEconomy tracks per-turn attack/recruit point accumulation and spending.
 * CardStatEntry holds parsed card stat values resolved at setup time.
 *
 * All fields are integers >= 0. The parser enforces this at setup time.
 */

/**
 * Per-turn economy tracking for attack and recruit points.
 *
 * Reset to all zeros at the start of each player turn. Accumulated by
 * playCard, spent by fightVillain and recruitHero.
 */
export interface TurnEconomy {
  /** Total attack points accumulated this turn from played hero cards. */
  attack: number;
  /** Total recruit points accumulated this turn from played hero cards. */
  recruit: number;
  /** Attack points spent this turn on fighting villains/henchmen. */
  spentAttack: number;
  /** Recruit points spent this turn on recruiting heroes. */
  spentRecruit: number;
  /** Piercing damage accumulated this turn. No MVP producer — always 0 until a future hero ability WP. */
  piercing: number;
  /** Number of wound cards drawn by the current player this turn. */
  woundsDrawn: number;
}

// why: stats resolved at setup time from registry so moves never query
// registry at runtime — same pattern as G.villainDeckCardTypes (WP-014).
// Read-only after setup; only economy helpers may produce new values.
/**
 * Parsed card stat values for a single card.
 *
 * Built at setup time from registry data. Keyed by CardExtId in
 * G.cardStats. Moves read these values without registry access.
 */
export interface CardStatEntry {
  /** Hero printed base attack value (playCard adds to economy). */
  attack: number;
  /** Hero printed base recruit value (playCard adds to economy). */
  recruit: number;
  /** Hero recruit cost (recruitHero validates spend against this). */
  cost: number;
  /**
   * Villain/henchman fight requirement parsed from vAttack.
   * fightVillain validates available attack against this value.
   * For hero cards this is always 0 (heroes are never fought).
   */
  fightCost: number;
}
