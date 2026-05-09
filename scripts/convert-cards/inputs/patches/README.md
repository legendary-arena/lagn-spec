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

## v18 — `_skipPair[]` annotation (WP-140 Phase 1b)

A `heroes[]._skipPair[]` block declares that a given pair of `cards[].slug`
values share a coincidental matching `cardCounts` value but are NOT split-side
faces of one physical card. The convert script reads the annotation, validates
its shape per the matching contract below, and downgrades any audit warning
whose cluster is fully covered by `_skipPair` entries (or by an explicit
`physicalCards[]` declaration) from "candidate paired-equal pattern" to
"explicitly skipped." Skipped clusters do NOT emit a warning under `--strict`
mode.

why: cross-references D-13901 + the WP-140 §Scope A worked example.
The annotation grammar locks under D-13901 the false-positive escape hatch for
heroes whose paired-equal `cardCounts` patterns are coincidences (Common 1
and Common 2 in a 4-card hero both having count 5; Uncommon and Uncommon 2
both having count 3; etc.), distinguishing them from true split-side dual-faced
cards (e.g., the Falcon / Winter Soldier reference under v17 above).

### Field semantics

```jsonc
{
  "_op": "merge",
  "slug": "howard-the-duck",
  "_skipPair": [
    ["traveling-companion", "rebel-without-a-cause"]
  ],
  "cards": [ /* ... per-side gameplay entries unchanged ... */ ]
}
```

Each entry is a 2-element array of card slugs naming a coincidental pair
under that hero. The slugs match `cards[].slug` literally — no case folding,
Unicode normalization, whitespace stripping, or locale-aware comparison.

### Matching contract (D-13901)

- **Unordered 2-set semantics:** `["a","b"]` matches the same audit
  candidate as `["b","a"]`.
- **Exact slug equality:** literal string match against `cards[].slug`. No
  case folding, Unicode normalization, whitespace stripping, or locale-aware
  comparison.
- **Length lock:** each entry MUST have exactly 2 elements; length-1 or
  length-3+ entries fail conversion with a full-sentence error.
- **No duplicate entries:** within a hero's `_skipPair[]`, no two entries
  may be the same unordered 2-set. (Cross-hero reuse is permitted and
  expected — a slug like `night-vision` may recur under multiple heroes.)
- **Existing-slug requirement:** every slug must resolve to an existing
  `cards[].slug` under the same hero. Unknown slugs fail conversion.
- **Mutual exclusion with `physicalCards[]`:** a slug declared in any
  `physicalCards[].sides` entry MUST NOT also appear in any `_skipPair`
  entry for the same hero. The two structures are alternative resolution
  paths; a slug uses exactly one.

### Cluster coverage rule (D-13901 §7.4)

A "paired-equal candidate cluster" is the maximal set of `cards[]` under a
hero sharing the same `cardCounts` value. Clusters are identified BEFORE
`_skipPair` filtering and treated as **atomic** for resolution: every
member slug of every cluster MUST appear in **exactly one** of
`physicalCards[].sides` OR `_skipPair`.

For a hero with any patch declaration (either `physicalCards[]` or
`_skipPair[]`), the convert script enforces this coverage rule and throws
a full-sentence error naming the uncovered cluster member(s) on violation.
Heroes with no patch declaration preserve WP-138 Phase 1a's
audit-warning-as-uncovered behavior so the extension is backward-compatible
with un-curated sets.

For 2-clusters of false positives (the vast majority): a single
`_skipPair[]` entry covers both members.

For 3+-clusters of false positives (rare): `_skipPair` cannot cover the
cluster atomically because `_skipPair` entries are 2-element and the
"exactly one" rule forbids a slug appearing in multiple `_skipPair` entries.
Resolution requires an explicit `physicalCards[]` declaration listing the
cluster members as 1-side entries. The convert script's auto-fill then
synthesizes 1-side `physicalCards` for the remaining hero cards under
D-13803 uniform model.

### Idempotency invariant (D-13901 §7.5)

`_skipPair` affects audit-warning emission ONLY. It MUST NOT modify
`physicalCards[]` synthesis output (`id`, `count`, `sides`, `imageUrl`).
Any `data/cards/*.json` difference between a run with `_skipPair` populated
and the same run with the annotation removed (other than the warning
suppression itself) is a conversion failure. The convert script preserves
this by applying `_skipPair` strictly as a warning filter, never as input
to `synthesizePhysicalCards`.

### Worked example

Howard the Duck (`3dtc.patch.json`) has two cards both at `cardCounts === 5`
— `Traveling Companion` and `Rebel Without a Cause`. They are not split-side
faces; they are independent Common 1 and Common 2 cards whose count
coincides under the standard rarity layout (5 / 5 / 3 / 1). Resolution:

```jsonc
{
  "heroes": [
    {
      "_op": "merge",
      "slug": "howard-the-duck",
      "_skipPair": [
        ["traveling-companion", "rebel-without-a-cause"]
      ]
    }
  ]
}
```

After Phase 1b lands, re-running `node scripts/convert-cards/convert-cards-v15.mjs`
emits no `📎 Pair:` summary for `howard-the-duck` (no splits) and a single
`📎 SkipPair: hero=howard-the-duck pairs=1 slugs=[(rebel-without-a-cause,traveling-companion)]`
log line — pair sorted within (UTF-16 code-unit ordering per D-13802 sort
posture) and surfaced inline for forensic audit. Under `--strict` mode the
convert script exits 0 (the cluster is fully covered).

## Phase 1b worklist (resolved)

Heroes confirmed split-side via the npm-source `divided: 1` / `divided: 2`
fields — paired across consecutive cards within a hero — were curated under
WP-140 Phase 1b across `bkwd` (already done in WP-138), `cvwr`, `mgtg`,
`msis`, and `xmen` (the five sets whose npm sources contain `divided:`
entries). The remaining audit-warning candidates from WP-138 Phase 1a's
262-entry worklist were resolved as false positives via `_skipPair`
annotations (or via `physicalCards[]` 1-side declarations for 3+-clusters
where `_skipPair` cannot cover atomically).

After Phase 1b, `LEGENDARY_CONVERT_STRICT=1 node scripts/convert-cards/convert-cards-v15.mjs`
exits **0** — the inverse of WP-138 Phase 1a's expected `--strict` exit-1
posture. CI green-state restored.
