# Card Data Patches

This directory holds per-set patch files consumed by
`scripts/convert-cards/convert-cards-v15.mjs`. Each patch is named
`{setAbbr}.patch.json` (e.g., `bkwd.patch.json`) and is merged into the
output of the npm-derived `@master-strike/data` source after the base
conversion runs.

## Patch operations

Each section entry (`heroes[]`, `masterminds[]`, `villains[]`, etc.) carries
an `_op` field selecting the merge mode:

- `"_op": "merge"` (default) — find the existing item by `slug` and apply
  field-by-field overrides. Card-level overrides match by `slug`. The
  optional `_slug` field on a top-level item or card renames the slug
  during merge (used to fix npm-source typos).
- `"_op": "append"` — the item does not exist in npm data; add it to the
  array.

Set-level fields (no `_op`):

- `_abilityTokenRewrite` — map of literal-string → literal-string
  substitutions applied to every `abilities[]` line in the set after all
  section patches have merged. Used to fix systematic upstream tokenization
  errors without duplicating ability strings.

## v17 — `physicalCards[]` block (WP-138 Phase 1a)

A `heroes[].physicalCards[]` block declares the physical-card abstraction
introduced by WP-138 / D-13801..D-13806. A "physical card" is a single
artifact in the deck; for solo cards it has one side, for split-side cards
(e.g., Falcon / Winter Soldier's Attune / Atone) it has two.

**The block is optional.** When absent, the converter falls through to the
solo auto-path: every `cards[]` entry becomes a single-side `physicalCard`
(D-13803 uniform model). Heroes whose deck contains genuinely split-side
cards must declare those pairs explicitly via this block — auto-detection
from `cardCounts` patterns is forbidden by D-13805.

### Field semantics

```jsonc
{
  "_op": "merge",
  "slug": "falcon-winter-soldier",
  "physicalCards": [
    { "id": "p1", "count": 5, "sides": ["attune", "atone"] },
    { "id": "p2", "count": 5, "sides": ["relocate", "reload"] },
    { "id": "p3", "count": 3, "sides": ["new-wings", "new-plan"] },
    { "id": "p4", "count": 1, "sides": ["captain-americas-legacy"] }
  ],
  "cards": [ /* ... per-side gameplay entries ... */ ]
}
```

- `id` — `^p\d+$` (e.g., `p1`, `p2`). **Deterministic and stable**:
  re-running `convert-cards-v15.mjs` against unchanged input must produce
  byte-identical IDs. Patch declarations are walked in array order and
  numbered `p1`, `p2`, ... — re-ordering the patch's `physicalCards[]`
  array re-numbers the IDs. Stable IDs are load-bearing for replay
  integrity, diff review, and CI reproducibility.
- `count` — positive integer; how many copies of this physical card live
  in the hero's deck reservoir.
- `sides` — array of one or two `cards[].slug` values naming the gameplay
  faces of this physical card. Validator-enforced `1 <= length <= 2`
  (raising the ceiling requires its own DECISIONS entry per D-13802).
- `imageUrl` — **NOT specified in the patch.** The converter computes it
  from `(setAbbr, heroSlug, sortedSides)` per D-13802:
  - One side: `{abbr}-hr-{hero}-{slug}.webp`
  - Two sides: `{abbr}-hr-{hero}-{sortedA}-{sortedB}.webp` where
    `sortedA` / `sortedB` come from `Array.prototype.sort()` with **no
    comparator argument** (UTF-16 code-unit ordering; see D-13802 for the
    full forbidden list of locale-aware comparison APIs).

### Drift validation contract

For every hero with `cardCounts` populated AND a patch-declared
`physicalCards[]`, the converter validates per side:

```
sum(physicalCards[].count for physicalCards whose sides[] includes sideSlug)
  === cardCounts[sideName]
```

A mismatch fails conversion with a full-sentence error naming the hero,
the side, the expected count, and the actual count.

Falcon / Winter Soldier worked example:

| Side                   | cardCounts | physicalCard | physicalCard count | Sum |
|------------------------|------------|--------------|--------------------|-----|
| Attune                 | 5          | p1           | 5                  | 5   |
| Atone                  | 5          | p1           | 5                  | 5   |
| Relocate               | 5          | p2           | 5                  | 5   |
| Reload                 | 5          | p2           | 5                  | 5   |
| New Wings              | 3          | p3           | 3                  | 3   |
| New Plan               | 3          | p3           | 3                  | 3   |
| Captain America's Legacy | 1        | p4           | 1                  | 1   |

`physicalCards.length === 4`; `sum(count) === 5 + 5 + 3 + 1 === 14` deck
instances. The seven `cards[]` entries are the per-side gameplay views;
the four `physicalCards[]` entries are the deck primitive.

### Audit warnings (Phase 1a)

The converter emits a stderr warning for every hero whose `cardCounts`
shows a paired-equal pattern (two cards with the same count and rarity)
but lacks an explicit `physicalCards[]` declaration. These are the
candidate split-side heroes for Phase 1b patch curation. Without
`--strict`, warnings are non-fatal; with `--strict` (or env
`LEGENDARY_CONVERT_STRICT=1`) the script exits non-zero. CI green-state
under Phase 1a expects `--strict` to FAIL until Phase 1b lands every
per-set patch.

### Constraints (enforced at registry load)

- **No orphan sides** (WP-138 §8): every `physicalCards[].sides[]` entry
  must resolve to an existing `cards[].slug` under the same hero.
- **No duplicate side membership** (WP-138 §9): a side slug appears in
  at most one `physicalCard` within a given hero. Cross-hero reuse is
  permitted (a slug like `night-vision` can recur under multiple heroes).

## Phase 1b worklist

Heroes confirmed split-side from the 2026-05-07 v16 image migration audit
(44 unmatched files): bkwd (other than falcon-winter-soldier), entire
mgtg roster, and split heroes in msis, msmc, msp1, wpnx, wwhk, xmen.
Phase 1b is a follow-up Work Packet after WP-138 lands.
