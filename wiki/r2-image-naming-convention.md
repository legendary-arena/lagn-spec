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

The ribbon is a two-letter code that identifies the card family. The codes are
assigned in [`convert-cards-v15.mjs`](../scripts/convert-cards/convert-cards-v15.mjs)
(heroes via [`heroImageUrl.ts`](../packages/registry/src/heroImageUrl.ts)):

| Ribbon | Card type | Filename pattern | Example |
|---|---|---|---|
| `hr` | Hero | `{set}-hr-{heroSlug}-{sides…}.webp` | `nmut-hr-wolfsbane-night-vision.webp` |
| `mm` | Mastermind (base) | `{set}-mm-{mmSlug}.webp` | `bkpt-mm-killmonger.webp` |
| `me` | Mastermind (epic) | `{set}-me-{mmSlug}.webp` | `bkpt-me-killmonger.webp` |
| `mt` | Mastermind (tactic) | `{set}-mt-{mmSlug}-{cardSlug}.webp` | `2099-mt-sinister-six-2099-electro-2099.webp` |
| `vi` | Villain | `{set}-vi-{groupSlug}-{cardSlug}.webp` | `2099-vi-alchemax-enforcers-cyber-nostra.webp` |
| `hm` | Henchman | `{set}-hm-{groupSlug}.webp` (group) / `{set}-hm-{groupSlug}-{cardSuffix}.webp` (per-card) | `core-hm-hand-ninjas.webp` |
| `sc` | Scheme | `{set}-sc-{schemeSlug}.webp` | `2099-sc-pull-reality-into-cyberspace.webp` |
| `by` | Bystander | `{set}-by-{slug}.webp` | `{set}-by-{slug}.webp` |
| `wd` | Wound | `{set}-wd-{slug}.webp` | `core-wd-wound.webp` |

Base and epic mastermind filenames carry a **single** slug — the redundant
double slug (`bkpt-mm-killmonger-killmonger.webp`) was removed; tactic and
villain cards keep both the group/mastermind slug and the per-card slug because
those families have multiple distinct cards under one parent.

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

## Interactions

- **[Card Type Taxonomy](card-type-taxonomy.md).** The card-type taxonomy in
  [`data/metadata/card-types.json`](../data/metadata/card-types.json) is the
  canonical list of card types (`hero`, `mastermind`, `villain`, `henchman`,
  `scheme`, `bystander`, `wound`, `sidekick`, `shield`, `other`, plus
  sub-chips). Each *imaged* type maps to a ribbon code above. The taxonomy
  names the types; this page documents how each is named on R2. Note the
  taxonomy file itself does **not** carry the ribbon codes — see Edge Cases.
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

- **Ribbon codes are not in `card-types.json`.** The pre-WP-084 taxonomy file
  carried a `prefix` field (shape `{ id, slug, name, displayName, prefix }`),
  and a stale comment in `convert-cards-v15.mjs` still reads "prefix comes
  directly from card-types.json." WP-086 reintroduced the file with the shape
  `{ slug, label, emoji?, order, parentType }` — **no prefix field** — so the
  ribbon codes now live only as hardcoded literals in the convert pipeline.
  Adding a new entry to `card-types.json` does **not** create an image ribbon;
  the convert pipeline is the source of truth for ribbons.
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

- [`data/metadata/card-types.json`](../data/metadata/card-types.json) — the
  card-type taxonomy (type list; no ribbon codes).
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
- [`data/metadata/card-types.json`](../data/metadata/card-types.json) — card-type
  taxonomy
- [DECISIONS.md](../docs/ai/DECISIONS.md) — D-13802, D-14701, D-14702
  (hero filename rules)
- [Card Type Taxonomy](card-type-taxonomy.md) — the type list and its
  pre/post-WP-086 shape change
