/**
 * Scheme twist handler dispatcher for the ImplementationMap.
 *
 * The exported `schemeTwistHandler` is a config-driven dispatcher that
 * looks up the active scheme in SCHEME_TWIST_CONFIGS, resolves the
 * matching SchemeTwistResolver, and delegates twist behavior. The
 * generic counter-increment + scheme-loss threshold check runs for
 * every scheme after the resolver (or fallback) completes.
 *
 * No boardgame.io imports. No registry imports.
 */

import type { RuleEffect } from './ruleHooks.types.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';
import type { LegendaryGameState } from '../types.js';
import type { RevealContext } from '../villainDeck/villainDeck.reveal.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';
import { SCHEME_TWIST_RESOLVERS } from './schemeTwistResolvers.js';
import { SCHEME_TWIST_CONFIGS } from './schemeTwistConfigs.js';

// why: MVP uses a fixed threshold. Most standard Legendary schemes trigger
// loss at 7 twists. Per-scheme overrides come from SchemeTwistConfig.lossThreshold.
const MVP_SCHEME_TWIST_THRESHOLD = 7;

/**
 * Builds the shared counter-increment + scheme-loss effects that fire for
 * every scheme twist regardless of the card-specific text.
 *
 * @param gameState - Current game state (read-only).
 * @param threshold - Twist count at which scheme loss triggers.
 * @returns Generic RuleEffect[] applied to every twist.
 */
function buildGenericTwistEffects(
  gameState: LegendaryGameState,
  threshold: number,
): RuleEffect[] {
  const effects: RuleEffect[] = [];

  effects.push({
    type: 'modifyCounter',
    counter: 'schemeTwistCount',
    delta: 1,
  });

  effects.push({
    type: 'queueMessage',
    message: 'Scheme twist revealed — twist count incremented.',
  });

  // why: scheme-loss is mediated through counters, not direct endgame
  // calls. The endgame evaluator reads G.counters to determine loss.
  // We predict the post-effect count by adding 1 to the current value
  // because applyRuleEffects has not yet applied the increment above.
  const predictedTwistCount =
    (gameState.counters.schemeTwistCount ?? 0) + 1;

  if (predictedTwistCount >= threshold) {
    effects.push({
      type: 'modifyCounter',
      counter: ENDGAME_CONDITIONS.SCHEME_LOSS,
      delta: 1,
    });

    effects.push({
      type: 'queueMessage',
      message: 'Scheme loss triggered — twist threshold reached.',
    });
  }

  return effects;
}

/**
 * Scheme twist handler dispatcher.
 *
 * Looks up the active scheme in SCHEME_TWIST_CONFIGS. If a config exists,
 * resolves the matching SchemeTwistResolver and calls it with config params.
 * If no config exists, runs the generic fallback (counter increment only).
 *
 * @param gameState - Current game state (mutated by resolvers).
 * @param ctx - boardgame.io context (passed through to chained reveals).
 * @param _payload - Trigger payload ({ cardId } from villain reveal).
 * @param implementationMap - Handler map threaded through chained reveals.
 * @returns Array of RuleEffect descriptions to apply.
 */
export function schemeTwistHandler(
  gameState: LegendaryGameState,
  ctx: unknown,
  _payload: unknown,
  implementationMap: ImplementationMap,
): RuleEffect[] {
  const schemeId = gameState.selection.schemeId;
  const config = SCHEME_TWIST_CONFIGS.get(schemeId);

  if (config) {
    const resolver = SCHEME_TWIST_RESOLVERS[config.resolverId];

    if (resolver) {
      // why: ctx satisfies RevealContext structurally — boardgame.io's
      // FnContext exposes both `random` and `ctx.currentPlayer`. Cast is
      // safe because executeRuleHooks always forwards the engine-supplied
      // FnContext, and performVillainReveal only reads the narrow shape.
      resolver(
        gameState,
        ctx as RevealContext,
        implementationMap,
        config.params,
      );
    } else {
      gameState.messages.push(
        `[Scheme Twist] Resolver "${config.resolverId}" not found in registry for scheme "${schemeId}".`,
      );
    }
  } else {
    // why: config-not-found is safe because the generic counter-increment
    // and loss-check still run below. Unconfigured schemes simply get the
    // counter-only behavior — no card-specific effects.
    gameState.messages.push(
      `[Scheme Twist] No resolver configured for scheme "${schemeId}" — counter increment only.`,
    );
  }

  // why: lossThreshold from config overrides the default when present,
  // allowing per-scheme twist thresholds (e.g. schemes that require fewer
  // or more twists before loss). If no config or no override, use the MVP default.
  const effectiveThreshold = config?.lossThreshold ?? MVP_SCHEME_TWIST_THRESHOLD;

  return buildGenericTwistEffects(gameState, effectiveThreshold);
}
