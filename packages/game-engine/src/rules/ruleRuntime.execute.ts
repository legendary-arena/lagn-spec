/**
 * Deterministic rule hook execution for the Legendary Arena game engine.
 *
 * executeRuleHooks collects RuleEffect[] from registered hooks in
 * deterministic order without modifying G. The ImplementationMap pattern
 * maps data-only HookDefinition entries to handler functions at runtime.
 *
 * No boardgame.io imports. No G mutation. No .sort() (delegated to
 * getHooksForTrigger from WP-009A).
 */

import type { RuleTriggerName, RuleEffect, HookRegistry } from './ruleHooks.types.js';
import type { LegendaryGameState } from '../types.js';
import { getHooksForTrigger } from './ruleHooks.registry.js';

// why: ImplementationMap stores handler functions keyed by hook id, separate
// from HookDefinition, because G must be JSON-serializable. Functions cannot
// live in G. The ImplementationMap is built once at startup and passed into
// lifecycle hooks — never stored in any field of G.

/**
 * Maps hook definition ids to their handler functions.
 *
 * Handler functions receive the current game state, a context object, a
 * trigger payload, and the implementation map itself. They return an array
 * of RuleEffect descriptions that will be applied separately by
 * applyRuleEffects.
 *
 * The ctx parameter uses `unknown` to avoid importing boardgame.io in
 * rules files. Default stub implementations do not use ctx.
 *
 * why: the 4th `implementationMap` parameter lets handlers that need to
 * chain another hook-driven action (e.g., the Midtown Bank Robbery twist
 * chaining an extra villain-deck reveal via performVillainReveal) thread
 * the map through without importing DEFAULT_IMPLEMENTATION_MAP, which
 * would create a rules ↔ villainDeck import cycle.
 */
export type ImplementationMap = Record<
  string,
  (
    gameState: LegendaryGameState,
    ctx: unknown,
    payload: unknown,
    implementationMap: ImplementationMap,
  ) => RuleEffect[]
>;

// why: executeRuleHooks returns effects without applying them. This lets
// tests assert what would happen without modifying G. It also allows callers
// to inspect, filter, or replay the effect list before application.

/**
 * Collects RuleEffect[] from all hooks registered for the given trigger.
 *
 * Hooks are retrieved in deterministic order via getHooksForTrigger (sorted
 * by priority ascending, then by id lexically). For each hook, the
 * corresponding handler is looked up in the implementationMap by hook id.
 * If no handler exists, a warning is logged and the hook is skipped.
 *
 * This function NEVER modifies G. It only reads G and the registry.
 *
 * @param gameState - Current game state (read-only access).
 * @param ctx - boardgame.io context (passed through to handlers).
 * @param triggerName - The trigger that fired.
 * @param payload - Trigger-specific payload data.
 * @param registry - The hook registry to query.
 * @param implementationMap - Handler functions keyed by hook id.
 * @returns Flat array of RuleEffect descriptions in hook execution order.
 */
export function executeRuleHooks(
  gameState: LegendaryGameState,
  ctx: unknown,
  triggerName: RuleTriggerName,
  payload: unknown,
  registry: HookRegistry,
  implementationMap: ImplementationMap,
): RuleEffect[] {
  const sortedHooks = getHooksForTrigger(registry, triggerName);
  const allEffects: RuleEffect[] = [];

  for (const hookDefinition of sortedHooks) {
    const handler = implementationMap[hookDefinition.id];

    if (!handler) {
      continue;
    }

    const effects = handler(gameState, ctx, payload, implementationMap);

    for (const effect of effects) {
      allEffects.push(effect);
    }
  }

  return allEffects;
}
