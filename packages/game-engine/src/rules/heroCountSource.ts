/**
 * Canonical count-source taxonomy for count-scaled hero ability effects.
 *
 * A HeroCountSource names the "for each X" quantity an `attack-per-count`
 * effect scales by (see the `attack-per-count` keyword in heroKeywords.ts).
 * The grant is `magnitude × resolveCountSource(G, playerID, source)`, where
 * the source is resolved to a non-negative integer by the pure resolver in
 * hero/heroCountSource.resolve.ts.
 *
 * Like HeroKeyword, this is a closed union paired with a canonical array for
 * drift-detection. Adding a new source requires a DECISIONS.md entry, updating
 * BOTH the union type and the HERO_COUNT_SOURCES array, AND adding a matching
 * branch to resolveCountSource (plus a parity drift test). This keeps the
 * "+N attack for each X" family parameterized — a new source is one enum entry
 * plus one resolver branch, never a new keyword per card.
 *
 * No boardgame.io imports. No registry imports. Contracts only.
 */

// ---------------------------------------------------------------------------
// HeroCountSource
// ---------------------------------------------------------------------------

// why: count sources are semantic labels only; adding a source requires a
// DECISIONS.md entry, updating both the union type and the canonical array,
// and adding a resolveCountSource branch. This prevents ad-hoc source
// proliferation and keeps the count-scaled-attack family parameterized.

/**
 * Closed canonical union of count-source labels for count-scaled hero effects.
 *
 * Each value names a quantity in `G` that an `attack-per-count` effect scales
 * by. The label carries no resolution logic on its own — resolveCountSource
 * dispatches on it.
 */
export type HeroCountSource =
  | 'victory-bystanders'; // why: D-24016 — counts the player's victory-pile bystanders (both ext_id forms)

// why: canonical array for drift-detection. Must match HeroCountSource union
// exactly. Drift-detection test in hero/heroCountSource.resolve.test.ts asserts
// array/union parity.

/**
 * All count sources in canonical order. Single source of truth.
 */
export const HERO_COUNT_SOURCES: readonly HeroCountSource[] = [
  'victory-bystanders', // why: D-24016 — counts the player's victory-pile bystanders (both ext_id forms)
] as const;
