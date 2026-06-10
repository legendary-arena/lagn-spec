---
title: R2 Image Naming Convention
type: Concept
tags:
  - layer-registry
  - card-type
  - data-shape
  - data-pipeline
  - images
related:
  - card-type-taxonomy.md
  - cardextid.md
status: canonical
source:
  - ../packages/registry/src/heroImageUrl.ts
  - ../scripts/convert-cards/convert-cards-v15.mjs
  - ../data/metadata/card-types.json
  - ../docs/ai/DECISIONS.md
last-reviewed: 2026-06-10
---

# R2 Image Naming Convention

## Summary

Every card's printed-card image is stored on Cloudflare R2 under a
deterministic URL derived from the card's set abbreviation, a two-letter
**ribbon** code for its card type, and the card's lowercase-hyphen slug(s).
The convention is what the card-conversion pipeline emits into each card's
`imageUrl` field and what the Registry Viewer fetches for display. This page is
the reference for that convention — useful when a new set is released and its
images must be named to match.

## Mechanics

### Host and directory

The R2 host is the single constant `R2_BASE_URL` in
[`heroImageUrl.ts`](../packages/registry/src/heroImageUrl.ts):

```
https://images.legendary-arena.com
```

Every image lives in a per-set directory keyed by the set abbreviation, so the
full shape is:

```
{R2_BASE_URL}/{setAbbr}/{setAbbr}-{ribbon}-{slug(s)}.webp
```

- `{setAbbr}` appears twice — once as the directory, once as the filename prefix
  (e.g. `nmut/`, `2099/`, `core/`).
- All images are `.webp`.
- Slugs are **lowercase, hyphen-separated** — never underscores, never
  uppercase. `S.H.I.E.L.D.` normalizes to the slug `shield` in the pipeline.

### Ribbon codes by card type

The ribbon is a two-letter code identifying the card family. The complete,
authoritative registry of card-type prefixes is the project's upstream card-data
source — the 37-entry `modern-master-strike/src/data/card-types.json` (sibling
repo). Each entry is `{ id, slug, name, displayName, prefix }`; the six hero
rarity slots all share the `hr` prefix.

| Prefix | Card type | Slug(s) |
|---|---|---|
| `sc` | Scheme | `scheme` |
| `st` | Scheme Twist | `scheme-twist` |
| `sx` | Scheme Transform | `scheme-transform` |
| `sv` | Scheme Veiled | `scheme-veiled` |
| `mm` | Mastermind | `mastermind` |
| `ma` | Mastermind Adapting | `mastermind-adapting` |
| `mp` | Mastermind Adapting Epic | `mastermind-adapting-epic` |
| `me` | Mastermind Epic | `mastermind-epic` |
| `mt` | Mastermind Tactics | `mastermind-tactics` |
| `mc` | Mastermind Tactics Epic | `mastermind-tactics-epic` |
| `ms` | Mastermind Strike | `mastermind-strike` |
| `vi` | Villain | `villain` |
| `hm` | Henchman | `henchman` |
| `hr` | Hero (all rarities) | `hero-common1` · `hero-common2` · `hero-common3` · `hero-uncommon` · `hero-uncommon2` · `hero-rare` |
| `sk` | Sidekick | `sidekick` |
| `ss` | Sidekick Special | `sidekick-special` |
| `sa` | S.H.I.E.L.D. Agent | `shield-agent` |
| `so` | S.H.I.E.L.D. Officer | `shield-officer` |
| `sp` | S.H.I.E.L.D. Officer Special | `shield-officer-special` |
| `tr` | S.H.I.E.L.D. Trooper | `shield-trooper` |
| `by` | Bystander | `bystander` |
| `bh` | Bystander Heroic | `bystander-heroic` |
| `bs` | Bystander Special | `bystander-special` |
| `wd` | Wound | `wound` |
| `we` | Wound Enraging | `wound-enraging` |
| `wg` | Wound Grievous | `wound-grievous` |
| `am` | Ambitions | `ambitions` |
| `ho` | Horror | `horror` |
| `lo` | Location | `location` |
| `sr` | Start | `start` |
| `to` | Token | `token` |
| `tp` | Trap | `trap` |

> **Two `card-types.json` files — do not confuse them.** The prefix registry
> above is the **upstream** `modern-master-strike/src/data/card-types.json`. The
> **in-repo** [`data/metadata/card-types.json`](../data/metadata/card-types.json)
> is a separate Registry-Viewer taxonomy carrying `slug` / `label` / `emoji` /
> `order` / `parentType` and **no prefix** — see Edge Cases.

### Filename patterns

Every image is `{set}-{prefix}-{slug(s)}.webp`. The convert pipeline currently
auto-composes `imageUrl`s for the core imaged families:

| Family | Pattern | Example |
|---|---|---|
| Hero (`hr`) | `{set}-hr-{heroSlug}-{sides…}.webp` | `nmut-hr-wolfsbane-night-vision.webp` |
| Mastermind base (`mm`) | `{set}-mm-{mmSlug}.webp` | `bkpt-mm-killmonger.webp` |
| Mastermind epic (`me`) | `{set}-me-{mmSlug}.webp` | `bkpt-me-killmonger.webp` |
| Mastermind tactic (`mt`) | `{set}-mt-{mmSlug}-{cardSlug}.webp` | `2099-mt-sinister-six-2099-electro-2099.webp` |
| Villain (`vi`) | `{set}-vi-{groupSlug}-{cardSlug}.webp` | `2099-vi-alchemax-enforcers-cyber-nostra.webp` |
| Henchman (`hm`) | `{set}-hm-{groupSlug}.webp` (group) / `{set}-hm-{groupSlug}-{cardSuffix}.webp` (per-card) | `core-hm-hand-ninjas.webp` |
| Scheme (`sc`) | `{set}-sc-{schemeSlug}.webp` | `2099-sc-pull-reality-into-cyberspace.webp` |
| Bystander (`by`) | `{set}-by-{slug}.webp` | `{set}-by-{slug}.webp` |
| Wound (`wd`) | `{set}-wd-{slug}.webp` | `core-wd-wound.webp` |

Base and epic mastermind filenames carry a **single** slug — the redundant
double slug (`bkpt-mm-killmonger-killmonger.webp`) was removed; tactic and
villain cards keep both the group/mastermind slug and the per-card slug because
those families have multiple distinct cards under one parent. The remaining
prefixes in the registry (e.g. `st`, `sa`, `tr`, `am`, `to`) name their card
families' images by the same `{set}-{prefix}-{slug}.webp` rule; their URLs are
not separately auto-composed by the current in-repo pipeline.

### Hero filename variants

Heroes are the most structured family because a hero card can be single-sided,
a two-sided split card, or carry a companion character. The builder is
[`heroImageUrl.ts`](../packages/registry/src/heroImageUrl.ts):

- **Solo (one side):** `{set}-hr-{heroSlug}-{sides[0]}.webp`
  — `nmut-hr-wolfsbane-night-vision.webp`
- **Split (two sides):** `{set}-hr-{heroSlug}-{sides[0]}-{sides[1]}.webp`
  — `bkwd-hr-falcon-winter-soldier-attune-atone.webp`
- **Companion:** the companion slug is inserted between the hero slug and the
  side segment — `{set}-hr-{heroSlug}-{companionSlug}-{sides…}.webp`
  — `mgtg-hr-drax-rhomann-dey-remove-his-spine-also-illegal.webp`

`sides` must contain exactly one or two entries; for two-sided cards the array
order is the physical-side order and is **not** sorted (D-14702), while
single-side ordering follows the UTF-16 sort lock (D-13802). The optional
companion slug must match `^[a-z0-9-]+$`.

### Adding a new set

When a new set is released, its images join this same convention — the set's
abbreviation (`setAbbr`) becomes both the R2 directory and the filename prefix,
and every card's filename follows the ribbon table above. Two halves are
involved:

1. **URL generation (automatic).** The set's npm-derived source files are placed
   under `scripts/convert-cards/inputs/cards/` (with any per-set fixups under
   `scripts/convert-cards/inputs/patches/` and count inputs under
   `scripts/convert-cards/inputs/`). The convert pipeline assigns the ribbon per
   card family and writes `data/cards/{setAbbr}.json` with each card's `imageUrl`
   already composed to this convention — the URLs are generated, never
   hand-written.
2. **Image assets (manual).** The actual `.webp` files must exist on R2 under
   `{setAbbr}/` at the exact `{setAbbr}-{ribbon}-{slug}.webp` paths the generated
   `imageUrl`s point to. Producing and uploading those assets is the manual
   side; a mismatch between a generated `imageUrl` and the uploaded object name
   is what shows up as a broken image in the Registry Viewer.

A set that only adds new cards of **existing** card types needs no code change —
the ribbons already cover those families, so it is effectively a data drop into
`scripts/convert-cards/inputs/`. A set that introduces a brand-new card *type*
(and therefore a new ribbon) requires a convert-pipeline change, because ribbons
are assigned in code rather than derived from `card-types.json` (see Edge Cases).

## Interactions

- **[Card Type Taxonomy](card-type-taxonomy.md).** The card-type taxonomy in
  [`data/metadata/card-types.json`](../data/metadata/card-types.json) is the
  canonical list of card types (`hero`, `mastermind`, `villain`, `henchman`,
  `scheme`, `bystander`, `wound`, `sidekick`, `shield`, `other`, plus
  sub-chips). Each *imaged* type maps to a ribbon code above. The taxonomy
  names the types; this page documents how each is named on R2. Note the
  **in-repo** taxonomy file does **not** carry the ribbon codes; the upstream
  `card-types.json` is the prefix registry — see Ribbon codes by card type and
  Edge Cases.
- **[CardExtId](cardextid.md).** A `CardExtId` is `<setAbbr>/<slug>` — the same
  `setAbbr` and slug components that compose the image filename. The image URL
  is an orthogonal projection of the same identity parts into an R2 path.
- **Convert pipeline.** [`convert-cards-v15.mjs`](../scripts/convert-cards/convert-cards-v15.mjs)
  reads the npm-derived set sources under `scripts/convert-cards/inputs/`,
  assigns the ribbon per family, and writes the resulting `imageUrl` into each
  card object in `data/cards/{setAbbr}.json`.
- **Registry Viewer.** `apps/registry-viewer` consumes each card's `imageUrl`
  field verbatim to render tiles and the detail panel; it does not recompute the
  URL. A mis-named R2 object surfaces as a broken image in the viewer.

## Edge Cases

- **The prefix registry lives upstream, not in the in-repo taxonomy.** The
  authoritative prefix mapping is the upstream
  `modern-master-strike/src/data/card-types.json` (37 entries, each with a
  `prefix`). The **in-repo** [`data/metadata/card-types.json`](../data/metadata/card-types.json)
  is a *different* file — the Registry-Viewer taxonomy reintroduced by WP-086
  with the shape `{ slug, label, emoji?, order, parentType }` and **no prefix
  field** (the pre-WP-084 in-repo file did carry a `prefix`; WP-086 dropped it).
  Inside this repo, the convert pipeline therefore carries the imaged-subset
  prefixes as hardcoded literals; adding an entry to the in-repo
  `card-types.json` does **not** create an image ribbon. Making the in-repo
  naming data-driven — so the prefix registry lives in this repo as the single
  source — would mean importing the prefixes into `data/metadata/card-types.json`,
  extending its strict Zod schema with a `prefix` / `ribbon` field, and wiring
  the convert pipeline to read it. That is a data-plus-code change at Work-Packet
  scope, would require its own DECISIONS entry, and is not in place today.
- **Not every taxonomy type is imaged.** The convert pipeline emits ribbon
  images for hero, mastermind (base/epic/tactic), villain, henchman, scheme,
  bystander, and wound. Other taxonomy entries (`sidekick`, `shield` and its
  sub-chips, `other` and its sub-chips such as scheme-twist and master-strike)
  do not get their own ribbon family from the pipeline — they are either
  deck-internal card kinds or are not separately imaged.
- **Two-sided hero ordering is not sorted (D-14702).** For `sides.length === 2`,
  the source-data order is preserved verbatim (side A first). This narrowly
  overrides the D-13802 UTF-16 sort lock, which still governs single-side
  filenames and any future automatic ordering.
- **Side-count ceiling is two (D-13802).** `heroImageUrl` throws if `sides` is
  not an array of length 1 or 2; raising the ceiling requires a new DECISIONS
  entry.
- **`S.H.I.E.L.D.` normalization.** The convert pipeline rewrites
  `s.h.i.e.l.d.` to the slug `shield` before composing filenames, so dotted
  source names never leak into URLs.
- **The host moved.** Image URLs were historically on
  `images.barefootbetters.com`; the current host is
  `images.legendary-arena.com`, the single constant `R2_BASE_URL`. Any older
  reference to the barefootbetters host is stale.

## Code Touchpoints

- [`packages/registry/src/heroImageUrl.ts`](../packages/registry/src/heroImageUrl.ts)
  — `R2_BASE_URL` constant and the hero (`hr`) URL builder (solo / split /
  companion).
- [`scripts/convert-cards/convert-cards-v15.mjs`](../scripts/convert-cards/convert-cards-v15.mjs)
  — assigns the `mm` / `me` / `mt` / `vi` / `hm` / `sc` / `by` / `wd` ribbons
  and writes `imageUrl` into the generated card JSON.

## Data Files

- `modern-master-strike/src/data/card-types.json` (upstream, sibling repo) — the
  authoritative 37-entry card-type **prefix** registry.
- [`data/metadata/card-types.json`](../data/metadata/card-types.json) — the
  in-repo Registry-Viewer taxonomy (type list; **no** prefix codes).
- `data/cards/{setAbbr}.json` — the generated per-set card data; each card
  object carries the composed `imageUrl`.

## History

- D-13802 — sides UTF-16 sort lock and the two-side ceiling for hero filenames.
- D-14701 — optional `companionSlug` on the physical-card schema; placed between
  hero slug and side segment in the filename.
- D-14702 — two-side hero filenames preserve source-data side order (no sort),
  narrowly overriding D-13802.
- Card-type-taxonomy history: the `prefix` field was present pre-WP-084, dropped
  by the WP-086 reintroduction — see [Card Type Taxonomy](card-type-taxonomy.md).

## References

- [`heroImageUrl.ts`](../packages/registry/src/heroImageUrl.ts) — host constant
  and hero URL builder
- [`convert-cards-v15.mjs`](../scripts/convert-cards/convert-cards-v15.mjs) —
  ribbon assignment and `imageUrl` generation
- `modern-master-strike/src/data/card-types.json` (upstream card-data origin,
  sibling repo) — the authoritative 37-entry card-type **prefix** registry
  (`sc`, `st`, `sa`, `tr`, …)
- [`data/metadata/card-types.json`](../data/metadata/card-types.json) — in-repo
  Registry-Viewer taxonomy (no prefix codes)
- [DECISIONS.md](../docs/ai/DECISIONS.md) — D-13802, D-14701, D-14702
  (hero filename rules)
- [Card Type Taxonomy](card-type-taxonomy.md) — the type list and its
  pre/post-WP-086 shape change
