/**
 * Parameterized reveal branch-list contracts + the legacy-keyword translation seam.
 *
 * WP-253 / D-24024 collapses the 8 fragmented `reveal-*` HeroKeywords into a single
 * parameterized `reveal` descriptor consumed by one HERO_EFFECT_HANDLERS entry. A
 * RevealRule is an ordered { predicate, actions[] } branch; the reveal handler peeks
 * the deck top and applies the first matching rule (unless the rule opts into
 * `continue`). The 8 legacy card markers keep working unchanged:
 * revealRulesForLegacyKeyword translates each into the branch-list its former
 * dedicated handler hard-coded — so `data/cards/**` needs no re-marking.
 *
 * No boardgame.io imports. No registry imports. Contracts + a pure translation
 * function only. No .reduce().
 */

import type { HeroKeyword } from './heroKeywords.js';

// ---------------------------------------------------------------------------
// Predicate + action kinds (closed canonical unions, drift-detected)
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of reveal predicate kinds. A predicate is tested against
 * the revealed deck-top card's cost.
 */
export type RevealPredicateKind =
  | 'always'
  | 'cost-lte'
  | 'cost-gte'
  | 'cost-zero'
  | 'cost-odd';

// why: canonical drift array (D-24024) — adding a predicate kind requires updating
// THIS array, the RevealPredicateKind union, AND a DECISIONS.md entry together
// (code-style §Drift Detection). The drift test in revealRule.test.ts pins parity.
export const REVEAL_PREDICATE_KINDS: readonly RevealPredicateKind[] = [
  'always',
  'cost-lte',
  'cost-gte',
  'cost-zero',
  'cost-odd',
] as const;

/**
 * Closed canonical union of reveal action kinds. An action mutates G when its
 * rule's predicate matches.
 */
export type RevealActionKind =
  | 'draw'
  | 'ko'
  | 'attack-by-cost'
  | 'attack-fixed'
  | 'choose-discard-or-return';

// why: canonical drift array (D-24024) — adding an action kind requires updating
// THIS array, the RevealActionKind union, AND a DECISIONS.md entry together
// (code-style §Drift Detection). The drift test in revealRule.test.ts pins parity.
export const REVEAL_ACTION_KINDS: readonly RevealActionKind[] = [
  'draw',
  'ko',
  'attack-by-cost',
  'attack-fixed',
  'choose-discard-or-return',
] as const;

// ---------------------------------------------------------------------------
// Branch-list shapes
// ---------------------------------------------------------------------------

/**
 * A cost predicate evaluated against the revealed deck-top card's cost.
 * `threshold` applies to `cost-lte` / `cost-gte` only.
 */
export interface RevealPredicate {
  kind: RevealPredicateKind;
  threshold?: number;
}

/**
 * One action applied when a rule's predicate matches. `amount` applies to
 * `attack-fixed` only (the fixed attack grant).
 */
export interface RevealAction {
  kind: RevealActionKind;
  amount?: number;
}

/**
 * One ordered branch in a reveal descriptor. The handler evaluates rules
 * top-to-bottom: the default (no `continue`) stops after the first matching
 * rule; `continue: true` applies the matched rule's actions AND keeps evaluating
 * later rules (the reveal-attack-choose attack-then-always-park shape).
 */
export interface RevealRule {
  predicate: RevealPredicate;
  actions: RevealAction[];
  continue?: boolean;
}

// ---------------------------------------------------------------------------
// Legacy reveal keyword family (frozen translation input)
// ---------------------------------------------------------------------------

/**
 * The 8 legacy reveal HeroKeywords the parser translates into the collapsed
 * `reveal` descriptor. Frozen: no `reveal-*` keyword is ever appended again —
 * a new reveal variant is a branch-list parameter, not a new keyword + handler
 * + drift-test + WP. (D-24024)
 */
export const REVEAL_KEYWORDS: readonly HeroKeyword[] = [
  'reveal',
  'reveal-ko',
  'reveal-min',
  'reveal-ko-or-draw',
  'reveal-cost-attack',
  'reveal-odd-draw',
  'reveal-attack-choose',
  'reveal-ko-attack',
] as const;

/**
 * The reveal keywords whose translation reads a magnitude. The two tiers gate
 * differently (see revealRulesForLegacyKeyword): the valid tier (`reveal`,
 * `reveal-min`) accepts M=0; the positive tier (`reveal-ko-or-draw`,
 * `reveal-attack-choose`, `reveal-ko-attack`) requires M >= 1. The no-magnitude
 * keywords (`reveal-ko`, `reveal-odd-draw`, `reveal-cost-attack`) are absent.
 * (D-24024)
 */
export const REVEAL_KEYWORDS_REQUIRING_MAGNITUDE: ReadonlySet<HeroKeyword> =
  new Set<HeroKeyword>([
    'reveal',
    'reveal-min',
    'reveal-ko-or-draw',
    'reveal-attack-choose',
    'reveal-ko-attack',
  ]);

// ---------------------------------------------------------------------------
// Magnitude validity (duplicated locally — duplicate-first)
// ---------------------------------------------------------------------------

/**
 * Returns true if magnitude is a finite integer >= 0. Mirrors isValidMagnitude
 * in heroEffects.execute.ts; duplicated locally per duplicate-first so this
 * contracts module needs no executor import (and stays boardgame.io-free).
 *
 * @param magnitude - The magnitude a legacy reveal keyword carried.
 * @returns Whether the magnitude is a valid non-negative integer.
 */
function isValidRevealMagnitude(magnitude: number | undefined): magnitude is number {
  if (magnitude === undefined) {
    return false;
  }
  if (!Number.isFinite(magnitude)) {
    return false;
  }
  if (magnitude < 0) {
    return false;
  }
  if (!Number.isInteger(magnitude)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Legacy keyword → branch-list translation (the migration seam)
// ---------------------------------------------------------------------------

/**
 * Translates a legacy reveal keyword + its magnitude into the ordered branch-list
 * its former dedicated handler hard-coded. The 8 card markers keep working
 * unchanged — the parser emits a `reveal` descriptor carrying these rules, and the
 * single reveal handler reproduces the legacy behavior exactly.
 *
 * TWO magnitude tiers reproduce the legacy handlers' self-guards (D-24024 /
 * confirmation RESIDUAL-1):
 *  - Valid tier {reveal, reveal-min}: no `< 1` self-guard today — they reached the
 *    executor through the pre-gate's isValidMagnitude, which accepts 0. Return []
 *    ONLY for an INVALID magnitude. M=0 is VALID: `reveal` 0 builds `cost-lte 0`
 *    (draws a cost-0 card); `reveal-min` 0 builds `cost-gte 0` (draws EVERY card).
 *  - Positive tier {reveal-ko-or-draw, reveal-attack-choose, reveal-ko-attack}:
 *    each had a `magnitude < 1 → return` whole-effect self-guard. Return [] for an
 *    INVALID OR `< 1` magnitude (e.g. reveal-ko-or-draw M=0 on a cost-0 card today
 *    does NOT KO — the cost-zero rule has no threshold to gate it).
 *  - No-magnitude {reveal-ko, reveal-odd-draw, reveal-cost-attack}: magnitude
 *    ignored; always return the branch-list.
 * Empty rules ([]) make the collapsed `reveal` handler a no-op, reproducing the
 * legacy skip.
 *
 * @param keyword - A legacy reveal HeroKeyword (one of REVEAL_KEYWORDS).
 * @param magnitude - The magnitude the card marker carried (may be undefined).
 * @returns The translated branch-list, or [] for a non-reveal keyword or a
 *   magnitude that fails the keyword's tier.
 */
export function revealRulesForLegacyKeyword(
  keyword: HeroKeyword,
  magnitude: number | undefined,
): RevealRule[] {
  // No-magnitude keywords — magnitude ignored; always emit the branch-list.
  if (keyword === 'reveal-ko') {
    return [{ predicate: { kind: 'cost-zero' }, actions: [{ kind: 'ko' }] }];
  }
  if (keyword === 'reveal-odd-draw') {
    return [{ predicate: { kind: 'cost-odd' }, actions: [{ kind: 'draw' }] }];
  }
  if (keyword === 'reveal-cost-attack') {
    return [{ predicate: { kind: 'always' }, actions: [{ kind: 'attack-by-cost' }] }];
  }
  // Valid-magnitude tier — no-op only on an INVALID magnitude (M=0 is valid).
  if (keyword === 'reveal') {
    if (!isValidRevealMagnitude(magnitude)) {
      return [];
    }
    return [{ predicate: { kind: 'cost-lte', threshold: magnitude }, actions: [{ kind: 'draw' }] }];
  }
  if (keyword === 'reveal-min') {
    if (!isValidRevealMagnitude(magnitude)) {
      return [];
    }
    return [{ predicate: { kind: 'cost-gte', threshold: magnitude }, actions: [{ kind: 'draw' }] }];
  }
  // Positive-magnitude tier — no-op on an INVALID OR `< 1` magnitude.
  if (keyword === 'reveal-ko-or-draw') {
    if (!isValidRevealMagnitude(magnitude) || magnitude < 1) {
      return [];
    }
    // why: KO-before-draw, first-match-wins — a cost-0 card KOs and NEVER reaches
    // the draw rule (no `continue` on the cost-zero rule). (D-21802)
    return [
      { predicate: { kind: 'cost-zero' }, actions: [{ kind: 'ko' }] },
      { predicate: { kind: 'cost-lte', threshold: magnitude }, actions: [{ kind: 'draw' }] },
    ];
  }
  if (keyword === 'reveal-attack-choose') {
    if (!isValidRevealMagnitude(magnitude) || magnitude < 1) {
      return [];
    }
    // why: attack-then-always-park — the cost-lte rule grants attack on match AND
    // sets `continue` so the `always → choose` rule still parks the discard-or-return
    // choice regardless of the cost predicate. (D-22003)
    return [
      { predicate: { kind: 'cost-lte', threshold: magnitude }, actions: [{ kind: 'attack-by-cost' }], continue: true },
      { predicate: { kind: 'always' }, actions: [{ kind: 'choose-discard-or-return' }] },
    ];
  }
  if (keyword === 'reveal-ko-attack') {
    if (!isValidRevealMagnitude(magnitude) || magnitude < 1) {
      return [];
    }
    // why: atomic KO-then-fixed-attack — magnitude is the fixed attack grant (NOT a
    // cost ceiling); the attack follows the KO only when the KO move succeeds. (D-22301)
    return [
      { predicate: { kind: 'cost-zero' }, actions: [{ kind: 'ko' }, { kind: 'attack-fixed', amount: magnitude }] },
    ];
  }
  // why: a non-reveal keyword has no reveal translation — empty rules. The parser
  // only routes REVEAL_KEYWORDS members here, so this is defensive (D-24024).
  return [];
}
