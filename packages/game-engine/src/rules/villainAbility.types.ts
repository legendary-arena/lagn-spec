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
 * villain or henchman is defeated; `onEscape` fires when a villain or
 * henchman is pushed off the City escape edge. Timing is read from the
 * `Ambush:` / `Fight:` / `Escape:` (or `Overrun:`) text prefix at setup
 * time — there is no NL inference.
 */
export type VillainAbilityTiming = 'onAmbush' | 'onFight' | 'onEscape';

// why: drift-detection array — must match the VillainAbilityTiming union
// exactly (the villainAbility.types.test.ts drift test asserts bidirectional
// parity). The three-entry canonical order is locked: 'onAmbush' (city
// entry, WP-185), 'onFight' (defeat, WP-185), 'onEscape' (escape edge,
// WP-186 / D-18601). 'onOverrun' is deliberately absent — `Overrun:` is a
// v1 synonym of `Escape:` and emits `onEscape` at parse time (D-18602).
// Adding a timing requires updating both this array and the union together,
// plus a DECISIONS.md entry.
/**
 * All villain ability timings in canonical order. Single source of truth.
 */
export const VILLAIN_ABILITY_TIMINGS: readonly VillainAbilityTiming[] = [
  'onAmbush',
  'onFight',
  'onEscape',
] as const;

// ---------------------------------------------------------------------------
// VillainEffectKeyword
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of executable villain effect keywords (MVP v1).
 *
 * These are the only effect tokens the executor knows how to apply. Effect
 * keywords are sourced exclusively from `[effect:<VillainEffectKeyword>]`
 * markers on ability lines (authored by WP-187 / WP-188 / WP-190) — never
 * from free text or the `[keyword:]` / `[icon:]` namespaces.
 */
export type VillainEffectKeyword =
  | 'gainWoundEachPlayer'
  | 'gainWoundCurrentPlayer'
  | 'koHeroCurrentPlayer'
  | 'heroDeckTopToEscape'
  | 'captureBystander'
  | 'koHeroEachPlayer'
  | 'koHeroEachPlayerMag2';

// why: drift-detection array — must match the VillainEffectKeyword union
// exactly. The seven-keyword vocabulary is the current locked MVP set. The
// first five (positions 1-5) carry forward unchanged from WP-185
// §Non-Negotiable Constraints — WP-187's executed markers and the overlay
// script's hardcoded copy depend on byte-identical ordering of positions
// 1-5, so insertions are appended at the end only.
// `koHeroEachPlayer` was added at position 6 by WP-189 to close the
// dominant blocked each-player-KO pattern (D-18901): each-player vocabulary
// is expanded incrementally, keyword-by-keyword, only where unconditional
// magnitude-1 patterns are present in the current dataset. Conditional and
// filtered each-player effects (cost-gated, class-gated, "or gains a
// Wound", source-filtered, compound clauses) remain out of scope for the MVP.
// `koHeroEachPlayerMag2` was added at position 7 by WP-202 to close the
// unconditional unfiltered magnitude-2 each-player-KO subset (D-20201):
// magnitude-N each-player-KO uses closed-union-per-magnitude keywords
// appended at position N (`koHeroEachPlayerMag2`, `koHeroEachPlayerMag3`
// if ever needed); parameterized markers (`[effect:koHeroEachPlayer:N]`)
// are rejected for v1 because the parser regex + executor dispatch
// contract + overlay validator + every drift test would all need to
// change for parameterization; the closed-union approach extends the
// WP-189 append-only-position-N pattern with no parser change, and the
// corpus shows only N=2 in v1 (zero N≥3 lines empirically). Any future
// addition requires a new WP plus a DECISIONS.md entry. The order here
// is the canonical emission order for multi-marker lines.
/**
 * All villain effect keywords in canonical order. Single source of truth.
 */
export const VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword[] = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
  'koHeroEachPlayer',
  'koHeroEachPlayerMag2',
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
