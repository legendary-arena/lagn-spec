/**
 * Hero composition markers — the OPEN, data-authored mechanic space (D-24031).
 *
 * The OPEN half of the composable-primitive model (D-24029): a card MECHANIC (Berserk)
 * is a composition of primitives expressed as DATA, distinct from the closed primitive
 * registry (D-24030, `effectPrimitive.types.ts`). The setup parser recognizes a
 * `[keyword:X]` token whose normalized name is a key here and attaches a deep copy of its
 * AST to `HeroAbilityHook.primitiveEffects` — never to `hook.keywords` (`berserk` is not a
 * HeroKeyword). The coverage probe + mechanic ledger read this surface to recognize
 * composition markers without duplicating the vocabulary.
 *
 * Adding a mechanically-adjacent mechanic (the Recruit-stat Berserk cousin) is a new ROW
 * here — no new keyword, primitive, handler, union edit, or D-entry. Premature-abstraction
 * counter-pressure (D-24029 §10): only `berserk` is seeded this WP.
 *
 * No boardgame.io imports. No registry imports. Data only.
 */

import type { EffectNode } from './effectPrimitive.types.js';

// why: D-24031 — the open mechanic-space data surface the setup parser, coverage probe,
// and mechanic ledger read. Maps a card marker name to a top-level composition AST. A
// cousin is a new row here, never an engine edit (D-24029 §7 / §10).
/**
 * Card marker name → its top-level effect composition. Seeded with exactly one entry.
 */
export const HERO_COMPOSITION_MARKERS: Record<string, EffectNode> = {
  // why: Berserk (data/metadata/keywords-full.json) — "Discard the top card of your deck.
  // You get +Attack equal to the discarded card's printed Attack." A sequence: move the
  // deck-top card to the discard (binding its id), then gain attack equal to that card's
  // printed attack (read from the binding via card-printed-stat). The Recruit cousin is
  // the same shape with resource:'recruit' + stat:'recruit' — pure data, no engine edit.
  berserk: {
    type: 'sequence',
    steps: [
      {
        type: 'move-card',
        from: { owner: 'current-player', zone: 'deck', position: 'top' },
        to: { owner: 'current-player', zone: 'discard' },
        bind: 'discardedCard',
      },
      {
        type: 'gain-resource',
        resource: 'attack',
        amount: { type: 'card-printed-stat', card: { ref: 'discardedCard' }, stat: 'attack' },
      },
    ],
  },
};

// why: D-24044 — the first PARAMETERIZED composition marker. Unlike a static
// HERO_COMPOSITION_MARKERS row, Empowered's AST depends on a hero class parsed from the card
// text, so it is BUILT per parsed class rather than stored as a fixed row. The builder + a
// mechanic-specific parse step (heroAbility.setup.ts) is the parameterized analog of a static
// row; the interpreter stays mechanic-agnostic (it knows only the value expression).
/**
 * Builds the Empowered composition for one parsed hero class: gain +Attack equal to the
 * number of that-class cards currently in the HQ. Returns a FRESHLY-constructed node each
 * call (never a shared mutable singleton), so a parsed hook never aliases module state.
 *
 * @param heroClass - The normalized hero-class slug parsed from `Empowered by [hc:X]`.
 * @returns A `gain-resource` effect node granting +Attack by the HQ class count.
 */
export function buildEmpoweredComposition(heroClass: string): EffectNode {
  return {
    type: 'gain-resource',
    resource: 'attack',
    amount: { type: 'count-cards-by-class-in-zone', heroClass, zone: 'hq' },
  };
}

// why: D-24044 — parameterized composition marker names: recognized mechanics whose AST is
// built (not a static HERO_COMPOSITION_MARKERS row). Seeded with exactly `empowered`. The
// coverage probe + mechanic ledger read these via HERO_COMPOSITION_MARKER_NAMES below, so the
// marker leaves the unsupported list while the parser builds the per-class AST.
/**
 * All parameterized composition marker names (built per parsed parameter, not stored rows).
 */
export const PARAMETERIZED_COMPOSITION_MARKER_NAMES: readonly string[] = ['empowered'];

// why: D-24031 / D-24044 — the canonical key array the coverage probe + mechanic ledger import
// (from dist) to recognize BOTH static composition markers (HERO_COMPOSITION_MARKERS keys) and
// parameterized ones (PARAMETERIZED_COMPOSITION_MARKER_NAMES). Deduped via a Set so a name
// migrating between the two surfaces never double-lists.
/**
 * All hero composition marker names (static + parameterized), deduped. Single source of truth.
 */
export const HERO_COMPOSITION_MARKER_NAMES: readonly string[] = [
  ...new Set([
    ...Object.keys(HERO_COMPOSITION_MARKERS),
    ...PARAMETERIZED_COMPOSITION_MARKER_NAMES,
  ]),
];
