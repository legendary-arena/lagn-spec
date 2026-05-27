/**
 * Scheme twist resolver framework types.
 *
 * Defines the SchemeTwistConfig interface for data-driven scheme twist
 * dispatch, the SchemeTwistResolverId union for the resolver registry,
 * and the SchemeTwistResolver function signature.
 *
 * No boardgame.io imports. No registry imports.
 */

import type { LegendaryGameState } from '../types.js';
import type { RevealContext } from '../villainDeck/villainDeck.reveal.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';

/**
 * Identifies a registered scheme twist resolver function.
 */
export type SchemeTwistResolverId =
  | 'reveal-or-punish'
  | 'chained-reveals'
  | 'wound-all'
  | 'ko-from-hq'
  | 'midtown-bank-robbery';

/**
 * Configuration for a single scheme's twist behavior.
 *
 * Keyed by scheme ext_id in the config registry. The dispatcher looks
 * up the config by G.selection.schemeId, then dispatches to the
 * resolver identified by resolverId.
 */
export interface SchemeTwistConfig {
  /** Scheme ext_id (e.g. 'core/legacy-virus-the'). */
  schemeId: string;
  /** Which resolver function handles this scheme's twist. */
  resolverId: SchemeTwistResolverId;
  /** Resolver-specific parameters. */
  params: Record<string, unknown>;
  /** Override MVP_SCHEME_TWIST_THRESHOLD for this scheme. */
  lossThreshold?: number;
}

/**
 * Resolver function signature for scheme twist handlers.
 *
 * Resolvers mutate G directly. They push messages to gameState.messages.
 * They do NOT return RuleEffect[] — the generic counter-increment +
 * loss-check effects are appended by the dispatcher after the resolver runs.
 */
export type SchemeTwistResolver = (
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
  params: Record<string, unknown>,
) => void;
