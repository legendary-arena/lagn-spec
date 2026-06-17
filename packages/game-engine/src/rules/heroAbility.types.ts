/**
 * Hero ability hook contracts for the Legendary Arena game engine.
 *
 * Defines the data-only HeroAbilityHook interface, condition and effect
 * descriptors, and pure query/filter utilities. These contracts are
 * consumed at setup time and observed (read-only) by the rule engine.
 *
 * WP-021 scope: hooks are inert by design — no hero ability executes
 * effects. Execution is deferred to WP-022+.
 *
 * No boardgame.io imports. No registry imports. Contracts only.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { HeroKeyword, HeroAbilityTiming } from './heroKeywords.js';
import type { HeroCountSource } from './heroCountSource.js';
import type { RevealRule } from './revealRule.js';
import type { EffectNode } from './effectPrimitive.types.js';

// ---------------------------------------------------------------------------
// HeroAbilityHook — data-only interface
// ---------------------------------------------------------------------------

/**
 * Declarative, data-only representation of a hero card's ability.
 *
 * Built at setup time from registry card data. Stored in
 * G.heroAbilityHooks. Immutable during gameplay — moves must never
 * modify these hooks.
 *
 * Execution of hero abilities is deferred to WP-022+. This interface
 * describes what a hero card can do; it does not do it.
 */
export interface HeroAbilityHook {
  // why: must be a hero card CardExtId — links this hook to a specific
  // hero card in the match's hero decks
  cardId: CardExtId;
  // why: timing is a declarative label only — no execution semantics
  // are attached in WP-021. WP-022+ will use timing to determine when
  // the ability fires. Defaults to 'onPlay' — no NL inference.
  timing: HeroAbilityTiming;
  // why: keywords are labels only. They do not imply that a matching
  // HeroEffectDescriptor must exist. A hook may have keywords but no
  // effects, or effects but no keywords.
  keywords: HeroKeyword[];
  // why: conditions are declarative descriptors, not evaluation logic.
  // Resolution is deferred to WP-022+.
  conditions?: HeroCondition[];
  // why: effects are descriptors, not functions. They describe what an
  // effect would do; they do not do it. Execution is WP-022+.
  effects?: HeroEffectDescriptor[];
  // why: D-24031 — the OPEN composition-marker mechanic space (additive optional). A
  // composition marker (Berserk) attaches a DEEP COPY of its AST here, never to
  // hook.keywords (`berserk` is not a HeroKeyword). Each element is a top-level effect
  // the interpreter runs with its own fresh, never-persisted execution context.
  primitiveEffects?: EffectNode[];
  // why: WP-257 / D-24034 — raw `[keyword:X]`/`[effect:X]` marker tokens the parser
  // SAW but resolved to no keyword, descriptor, composition, or modifier. Hooks
  // otherwise carry parsed descriptors only, so an unresolved marker would leave an
  // empty hook INDISTINGUISHABLE from a pure flavor-text line — and flavor text must
  // NOT flag while an unresolved marker MUST. Surfacing the raw token here is what
  // makes `parse-unrecognized` detectable at runtime. Additive optional: absent or
  // empty means "no unresolved marker" (flavor text yields neither).
  unresolvedMarkers?: string[];
}

// ---------------------------------------------------------------------------
// HeroCondition — declarative condition descriptor
// ---------------------------------------------------------------------------

/**
 * Declarative condition descriptor for hero abilities (MVP).
 *
 * Describes when a hero ability applies. No evaluation logic is
 * implemented in WP-021.
 */
export interface HeroCondition {
  type: string;
  value: string;
}

// ---------------------------------------------------------------------------
// HeroEffectDescriptor — declarative effect descriptor
// ---------------------------------------------------------------------------

/**
 * Declarative effect descriptor for hero abilities (MVP).
 *
 * Describes what an effect would do. Does not execute it.
 */
export interface HeroEffectDescriptor {
  type: HeroKeyword;
  magnitude?: number;
  // why: D-24016 — for an 'attack-per-count' effect, countSource names the
  // quantity the per-unit magnitude scales by (resolved by resolveCountSource).
  // Other keywords ignore it; an 'attack-per-count' effect with no/invalid
  // countSource is a skipped no-op.
  countSource?: HeroCountSource;
  // why: D-24019 — for an 'optional-ko-reward' effect, rewardType is the reward
  // granted iff the player KOs a card (dispatched to the existing reward
  // executor: rescue / draw / attack / recruit). The existing magnitude field
  // carries the reward magnitude. Other keywords ignore it.
  rewardType?: HeroKeyword;
  // why: D-24024 — for a collapsed 'reveal' effect, revealCount is the number of
  // deck-top cards peeked (default 1; every legacy reveal peeks one) and revealRules
  // is the ordered branch-list the single reveal handler evaluates. Other keywords
  // ignore them. Top-level `magnitude` is NOT used by 'reveal': a cost threshold
  // lives in a predicate (RevealPredicate.threshold) and a fixed-attack grant in an
  // action (RevealAction.amount).
  revealCount?: number;
  revealRules?: RevealRule[];
}

// ---------------------------------------------------------------------------
// Query / filter utilities (pure, read-only)
// ---------------------------------------------------------------------------

/**
 * Returns hero ability hooks matching a specific timing value.
 *
 * @param hooks - Array of hero ability hooks to filter.
 * @param timing - Timing value to match.
 * @returns Filtered array of hooks with the specified timing.
 */
export function filterHooksByTiming(
  hooks: HeroAbilityHook[],
  timing: HeroAbilityTiming,
): HeroAbilityHook[] {
  const result: HeroAbilityHook[] = [];
  for (const hook of hooks) {
    if (hook.timing === timing) {
      result.push(hook);
    }
  }
  return result;
}

/**
 * Returns hero ability hooks matching a specific keyword.
 *
 * @param hooks - Array of hero ability hooks to filter.
 * @param keyword - Keyword to match.
 * @returns Filtered array of hooks containing the specified keyword.
 */
export function filterHooksByKeyword(
  hooks: HeroAbilityHook[],
  keyword: HeroKeyword,
): HeroAbilityHook[] {
  const result: HeroAbilityHook[] = [];
  for (const hook of hooks) {
    for (const hookKeyword of hook.keywords) {
      if (hookKeyword === keyword) {
        result.push(hook);
        break;
      }
    }
  }
  return result;
}

/**
 * Returns hero ability hooks for a specific card.
 *
 * @param hooks - Array of hero ability hooks to filter.
 * @param cardId - CardExtId to match.
 * @returns Filtered array of hooks for the specified card.
 */
export function getHooksForCard(
  hooks: HeroAbilityHook[],
  cardId: CardExtId,
): HeroAbilityHook[] {
  const result: HeroAbilityHook[] = [];
  for (const hook of hooks) {
    if (hook.cardId === cardId) {
      result.push(hook);
    }
  }
  return result;
}
