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

// why: D-24031 — the canonical key array, derived from HERO_COMPOSITION_MARKERS so it can
// never drift from the registry. The coverage probe + mechanic ledger import this (from
// dist) to recognize composition markers without duplicating the vocabulary.
/**
 * All hero composition marker names. Single source of truth, derived from the registry.
 */
export const HERO_COMPOSITION_MARKER_NAMES: readonly string[] = Object.keys(HERO_COMPOSITION_MARKERS);
