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
import type { CardExtId } from '../state/zones.types.js';
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
 *
 * WP-200 / D-20003 (signature widening, 01.5 cascade allowlist extension):
 * `twistCardId` is the 5th positional parameter carrying the zone-instance
 * ext_id of the scheme-twist card that triggered. Each resolver pushes one
 * `schemeTwistResolved` event to `G.notableEvents` at its terminal point,
 * stamping the event with `twistCardId`. Injected by the dispatcher
 * (`schemeHandlers.ts:schemeTwistHandler`) from the trigger payload —
 * resolvers do not source it from `G` (the cardId is in-flight between
 * deck removal and twist-pile routing at resolver-call time, so no G
 * field carries it).
 *
 * The 5th param is optional in the type so legacy direct-resolver test
 * call sites compile unchanged; resolver implementations fall back to a
 * sentinel ext_id on the optional path. The production dispatch path
 * always passes the real cardId.
 */
export type SchemeTwistResolver = (
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
  params: Record<string, unknown>,
  twistCardId?: CardExtId,
) => void;
