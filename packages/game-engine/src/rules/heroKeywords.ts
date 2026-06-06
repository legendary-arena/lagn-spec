/**
 * Canonical keyword and timing taxonomies for hero ability hooks.
 *
 * Both HeroKeyword and HeroAbilityTiming are closed unions with canonical
 * arrays for drift-detection. Adding a new entry to either requires a
 * DECISIONS.md entry and updating both the union type and its canonical
 * array.
 *
 * No boardgame.io imports. No registry imports. Contracts only.
 */

// ---------------------------------------------------------------------------
// HeroKeyword
// ---------------------------------------------------------------------------

// why: keywords are semantic labels only; adding a keyword requires a
// DECISIONS.md entry and updating both the union type and the canonical
// array. This prevents ad-hoc keyword proliferation.

/**
 * Closed canonical union of hero ability keyword labels.
 *
 * Keywords are semantic labels only — they do not imply magnitude,
 * effect resolution, or execution semantics.
 */
export type HeroKeyword =
  | 'draw'
  | 'attack'
  | 'recruit'
  | 'ko'
  | 'rescue'
  | 'wound'
  | 'reveal'
  | 'reveal-ko'
  | 'reveal-min'
  | 'reveal-ko-or-draw' // why: D-21802
  | 'reveal-cost-attack' // why: D-21901
  | 'reveal-odd-draw' // why: D-21902
  | 'reveal-attack-choose' // why: D-22003
  | 'conditional';

// why: canonical array for drift-detection. Must match HeroKeyword
// union exactly. Drift-detection test in heroAbility.setup.test.ts
// asserts array/union parity.

/**
 * All hero keywords in canonical order. Single source of truth.
 */
export const HERO_KEYWORDS: readonly HeroKeyword[] = [
  'draw',
  'attack',
  'recruit',
  'ko',
  'rescue',
  'wound',
  'reveal',
  'reveal-ko',
  'reveal-min',
  'reveal-ko-or-draw', // why: D-21802
  'reveal-cost-attack', // why: D-21901
  'reveal-odd-draw', // why: D-21902
  'reveal-attack-choose', // why: D-22003
  'conditional',
] as const;

// ---------------------------------------------------------------------------
// HeroAbilityTiming
// ---------------------------------------------------------------------------

// why: timing labels are declarative only — no execution semantics.
// Defaults to 'onPlay' when markup does not encode timing explicitly.
// Same closed-union pattern as HeroKeyword.

/**
 * Closed canonical union of hero ability timing labels.
 *
 * Adding a new timing requires a DECISIONS.md entry and updating both
 * the type and the HERO_ABILITY_TIMINGS array.
 */
export type HeroAbilityTiming =
  | 'onPlay'
  | 'onFight'
  | 'onRecruit'
  | 'onKO'
  | 'onReveal';

// why: canonical array for drift-detection. Must match HeroAbilityTiming
// union exactly. Same pattern as HERO_KEYWORDS.

/**
 * All hero ability timings in canonical order. Single source of truth.
 */
export const HERO_ABILITY_TIMINGS: readonly HeroAbilityTiming[] = [
  'onPlay',
  'onFight',
  'onRecruit',
  'onKO',
  'onReveal',
] as const;
