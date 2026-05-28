/**
 * Villain & henchman ability hook contracts for the Legendary Arena game engine.
 *
 * Defines the data-only VillainAbilityHook descriptor, the canonical timing
 * and effect-keyword unions with their drift-detection arrays, and a pure
 * query helper. These contracts are built once at setup time (from registry
 * card text) and observed read-only by the Fight/Ambush executor.
 *
 * Mirrors the WP-021 HeroAbilityHook shape. This module imports no game
 * framework and no registry package — contracts only.
 */

import type { CardExtId } from '../state/zones.types.js';

// ---------------------------------------------------------------------------
// VillainAbilityTiming
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of villain/henchman ability timing labels.
 *
 * `onAmbush` fires when a villain enters the City; `onFight` fires when a
 * villain or henchman is defeated. Timing is read from the `Ambush:` /
 * `Fight:` text prefix at setup time — there is no NL inference.
 */
export type VillainAbilityTiming = 'onAmbush' | 'onFight';

// why: drift-detection array — must match the VillainAbilityTiming union
// exactly (the villainAbility.types.test.ts drift test asserts bidirectional
// parity). `'onEscape'` is deliberately ABSENT: it is reserved for WP-186 and
// adding it here is out of WP-185's scope. Adding a timing requires updating
// both this array and the union together, plus a DECISIONS.md entry.
/**
 * All villain ability timings in canonical order. Single source of truth.
 */
export const VILLAIN_ABILITY_TIMINGS: readonly VillainAbilityTiming[] = [
  'onAmbush',
  'onFight',
] as const;

// ---------------------------------------------------------------------------
// VillainEffectKeyword
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of executable villain effect keywords (MVP v1).
 *
 * These are the only effect tokens the executor knows how to apply. Effect
 * keywords are sourced exclusively from `[effect:<VillainEffectKeyword>]`
 * markers on ability lines (authored by WP-187) — never from free text or
 * the `[keyword:]` / `[icon:]` namespaces.
 */
export type VillainEffectKeyword =
  | 'gainWoundEachPlayer'
  | 'gainWoundCurrentPlayer'
  | 'koHeroCurrentPlayer'
  | 'heroDeckTopToEscape'
  | 'captureBystander';

// why: drift-detection array — must match the VillainEffectKeyword union
// exactly. The five-keyword vocabulary is the locked MVP per WP-185
// §Non-Negotiable Constraints; adding a sixth keyword requires a new WP and a
// DECISIONS.md entry (see WP-189 for the planned `koHeroEachPlayer` addition).
// The order here is the canonical emission order for multi-marker lines.
/**
 * All villain effect keywords in canonical order. Single source of truth.
 */
export const VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword[] = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
] as const;

// ---------------------------------------------------------------------------
// VillainAbilityHook — data-only descriptor
// ---------------------------------------------------------------------------

/**
 * Declarative, data-only representation of one villain/henchman ability line.
 *
 * Built at setup time from registry card text and stored in
 * G.villainAbilityHooks. Immutable during gameplay — moves must never modify
 * these hooks.
 *
 * `keywords` and `effects` are identical arrays in v1 (schema parity with
 * HeroAbilityHook; reserved for future divergence where `keywords` could
 * carry non-executable markers while `effects` stays the executable subset).
 */
export interface VillainAbilityHook {
  /** The card-instance ext_id this hook fires for. */
  cardId: CardExtId;
  /** When the hook fires, derived from the ability-line text prefix. */
  timing: VillainAbilityTiming;
  /** Recognized effect keywords on this line (identical to `effects` in v1). */
  keywords: VillainEffectKeyword[];
  /** Executable effect keywords applied left-to-right by the executor. */
  effects: VillainEffectKeyword[];
}

// ---------------------------------------------------------------------------
// Query helper (pure, read-only)
// ---------------------------------------------------------------------------

/**
 * Returns the hooks for a specific card and timing.
 *
 * Filters by both the card-instance ext_id and the timing label so the
 * executor receives exactly the hooks that should fire at a given fire site.
 *
 * @param hooks - The full villain ability hook table (G.villainAbilityHooks).
 * @param cardId - The card-instance ext_id to match.
 * @param timing - The timing label to match.
 * @returns A freshly-constructed array of matching hooks (never the input).
 */
export function getVillainHooksForCard(
  hooks: readonly VillainAbilityHook[],
  cardId: CardExtId,
  timing: VillainAbilityTiming,
): VillainAbilityHook[] {
  const result: VillainAbilityHook[] = [];
  for (const hook of hooks) {
    if (hook.cardId === cardId && hook.timing === timing) {
      result.push(hook);
    }
  }
  return result;
}
