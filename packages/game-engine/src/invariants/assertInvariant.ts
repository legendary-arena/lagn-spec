/**
 * Runtime invariant assertion utility for the Legendary Arena game
 * engine.
 *
 * assertInvariant throws InvariantViolationError when a structural
 * invariant is violated. This is the ONE throwing path outside of
 * Game.setup() direct throws, and it is only reached from inside
 * Game.setup() per D-3102 Option B (setup-only wiring) — so the
 * existing `.claude/skills/legendary-game-engine/SKILL.md §Throwing Convention` row
 * for "Game.setup() may throw" already covers this case without a
 * new rule exception.
 */

import type { InvariantCategory } from './invariants.types.js';

/**
 * Error thrown by assertInvariant when a check condition fails.
 *
 * The category field lets post-mortem inspection classify the
 * failure without string-parsing the message. InvariantViolationError
 * is the only error type thrown by any file under src/invariants/.
 */
// why: invariant violations are distinct from gameplay conditions per
// D-0102 clarification. Structural corruption (card in two zones,
// function in G, non-finite counter) fails fast via this error.
// Gameplay conditions (insufficient attack, empty wounds pile, no
// valid target) are NOT violations — they are normal game states
// handled by moves returning void. Only the former path throws.
export class InvariantViolationError extends Error {
  readonly category: InvariantCategory;

  constructor(category: InvariantCategory, message: string) {
    super(message);
    this.name = 'InvariantViolationError';
    this.category = category;
  }
}

/**
 * Asserts that a runtime invariant condition holds. Throws
 * InvariantViolationError if the condition is false.
 *
 * @param condition - The condition to assert. False triggers a throw.
 * @param category - The invariant category the violation belongs to.
 * @param message - Full-sentence error message per Rule 11: state
 *   what failed and what to inspect.
 * @throws {InvariantViolationError} if condition is false.
 */
// why: throwing from the setup return path is permitted by the
// existing `.claude/skills/legendary-game-engine/SKILL.md §Throwing Convention` row 1
// ("Game.setup() — Throws Error — Match creation must abort early").
// Moves never throw per the three-step move contract (D-0102); only
// Game.setup() throws, and runAllInvariantChecks is called from
// Game.setup() under D-3102 Option B. No new rule exception is
// introduced by WP-031.
export function assertInvariant(
  condition: boolean,
  category: InvariantCategory,
  message: string,
): void {
  if (!condition) {
    throw new InvariantViolationError(category, message);
  }
}
