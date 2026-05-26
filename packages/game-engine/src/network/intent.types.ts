/**
 * Network intent contracts for the Legendary Arena multiplayer layer.
 *
 * These types define the canonical format for client move submissions
 * and the structured validation results returned by the engine.
 * Transport-agnostic — works with boardgame.io's existing networking
 * or any future transport.
 *
 * // why: clients submit intents, engine validates (D-0401).
 * Transport-agnostic by design — no WebSocket, HTTP, or framework
 * dependency in this file.
 */

// why: network files are engine category (D-3201) and must not import
// boardgame.io (D-2801). Only the fields actually read by
// validateIntent are included — readonly to prevent accidental mutation.
/**
 * Local structural interface for the boardgame.io ctx fields needed by
 * intent validation. Avoids importing boardgame.io into engine-category
 * network files.
 */
export interface IntentValidationContext {
  readonly currentPlayer: string;
  readonly turn: number;
}

/**
 * Canonical format for all client move submissions. Data-only,
 * JSON-serializable — no functions, no class instances.
 *
 * // why: clients submit intents, engine validates (D-0401).
 * Transport-agnostic — this shape works with boardgame.io's existing
 * networking or any future transport layer.
 */
export interface ClientTurnIntent {
  /** Unique match identifier. */
  matchId: string;
  /** Player submitting the intent. */
  playerId: string;
  /** Turn number the client believes it is on. */
  turnNumber: number;
  /** The move the client wants to execute. */
  move: {
    /** Move name (must be a registered move). */
    name: string;
    /** Move arguments (validated structurally, then by the move itself). */
    args: unknown;
  };
  /** Optional client state hash for desync detection. */
  clientStateHash?: string;
  // why: optional so existing callers that don't set it compile without changes.
  /** Optional bot decision rationale lines. */
  decisionLog?: string[];
}

/**
 * The 5 canonical rejection codes for intent validation.
 *
 * Each code corresponds to a specific validation failure in
 * validateIntent. The set is intentionally small and closed — future
 * codes require a governance decision.
 */
export type IntentRejectionCode =
  | 'WRONG_PLAYER'
  | 'WRONG_TURN'
  | 'INVALID_MOVE'
  | 'MALFORMED_ARGS'
  | 'DESYNC_DETECTED';

/**
 * Structured validation outcome. Validation never throws — it always
 * returns one of these two shapes.
 */
export type IntentValidationResult =
  | { valid: true }
  | { valid: false; reason: string; code: IntentRejectionCode };
