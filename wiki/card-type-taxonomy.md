---
title: Card Type Taxonomy
type: Concept
tags:
  - layer-registry
  - card-type
  - taxonomy
  - drift-detection
  - registry-viewer
  - data-shape
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - rule-execution-pipeline.md
  - turn-system.md
  - cardextid.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../.claude/skills/legendary-registry/SKILL.md
  - ../packages/registry/src/schema.ts
  - ../data/metadata/card-types.json
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-084-delete-unused-auxiliary-metadata.md
  - ../docs/ai/work-packets/WP-086-registry-viewer-card-types-upgrade.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Card Type Taxonomy

## Summary

The Card Type Taxonomy is the registry-side closed-set classification
of card archetypes — the canonical answer to "what kind of card is
this?" It lives in
[`data/metadata/card-types.json`](../data/metadata/card-types.json)
as 13 entries (10 top-level archetypes plus 3 SHIELD sub-chips),
validated by a strict Zod schema. The taxonomy drives the Registry
Viewer's classification ribbon and is **not** consumed by the engine
or the registry loaders — its readers are UI-side only.

## Mechanics

### Shape and contents

Each entry conforms to `CardTypeEntrySchema` in
[`packages/registry/src/schema.ts`](../packages/registry/src/schema.ts):

```ts
{
  slug:       string;            // lowercase-hyphen identifier
  label:      string;            // human-readable display name
  emoji?:     string;            // optional icon (one per entry)
  order:      number;            // non-negative integer; sort key
  parentType: string | null;     // null for top-level; otherwise a slug ref
}
```

The schema uses `.strict()` so unknown fields are rejected at fetch
time. The 13 current entries:

**Top-level (10):** `hero` · `mastermind` · `villain` · `henchman` ·
`scheme` · `bystander` · `wound` · `sidekick` · `shield` · `other`

**SHIELD sub-chips (3):** `shield-agent` · `shield-officer` ·
`shield-trooper` (each with `parentType: "shield"`)

### Two-tier hierarchy via `parentType`

The taxonomy is intentionally shallow:

- **Top-level entries** carry `parentType: null`.
- **Sub-chip entries** carry `parentType: "<slug>"` referencing a
  top-level entry. Currently only `shield` is subdivided.

Non-null `parentType` references are validated *at fetch time* by
[`apps/registry-viewer/src/lib/cardTypesClient.ts`](../apps/registry-viewer/src/lib/cardTypesClient.ts)
against the loaded slug set — orphan references would surface as
runtime validation failures, not Zod schema errors. (Relational
invariants between entries are not expressible in Zod.)

### Consumer boundary

The taxonomy file is consumed exclusively by the Registry Viewer's
ribbon generator. Per
[`registry.md` "Critical Metadata Distinction"](../.claude/skills/legendary-registry/SKILL.md):

- **`createRegistryFromLocalFiles` and `createRegistryFromHttp`
  never read this file.** They read `sets.json` only.
- The card-types JSON is fetched and validated by the viewer at
  app startup, not by any engine or server code path.

This is the boundary that makes the file safe to evolve
independently of `G`, moves, or scoring.

### Why `.strict()` matters

The strict schema is a deliberate drift-detection lever (see WP-086
and the `.strict()` precedent later extended to
`card-abilities.json` per WP-125). A future writer adding an
unknown field — `description`, `color`, `icon` — gets a Zod parse
error at fetch time rather than silent ingestion. New fields require
an explicit schema change, which surfaces as an explicit Work
Packet decision.

## Interactions

- **[Villain Deck](villain-deck.md).** `RevealedCardType` (the
  engine's 5-value union: `villain` · `henchman` · `bystander` ·
  `scheme-twist` · `mastermind-strike`) is a strict subset of this
  taxonomy. Only types that can actually be drawn from the villain
  deck appear there; the wider taxonomy includes `hero`,
  `sidekick`, `wound`, `shield`, and the SHIELD sub-chips, which
  never enter `G.villainDeckCardTypes`. The two are kept in sync
  by reviewer discipline, not by code.
- **[Scheme](scheme.md).** The taxonomy entry
  `{ slug: 'scheme', label: 'Scheme', emoji: '📜', order: 50,
  parentType: null }` is the registry-side classification for
  Scheme cards. The Scheme entity's runtime / setup behaviour is
  documented on its own page; this entry is the *taxonomy* row, not
  the entity.
- **[CardExtId](cardextid.md).** Orthogonal axes: a `CardExtId`
  identifies *which* card; a `cardType` slug identifies *what kind
  of* card. Both are string-typed, but they classify along
  independent dimensions and never substitute for one another.
- **Registry Viewer (`apps/registry-viewer`).** The sole consumer.
  The taxonomy drives the classification ribbon, ordering (via
  `order`), display (via `label`, `emoji`), and SHIELD sub-chip
  expansion (via `parentType`).

## Edge Cases

- **The silent-failure precedent (D-1203).** Confusing
  `card-types.json` with `sets.json` is the canonical silent-data-
  loss bug in this codebase. `card-types.json` entries lack `abbr`
  and `releaseDate`, so feeding them to `SetIndexEntrySchema`
  produces zero sets with no error thrown. WP-003 fixed the
  original occurrence; the `// why:` comment at the loader fetch
  site is preserved across WP-084 deletion + WP-086 reintroduction
  because the failure mode is independent of which auxiliary file
  is involved. See
  [`registry.md` "The Silent Failure Mode"](../.claude/skills/legendary-registry/SKILL.md).
- **Pre-WP-084 vs post-WP-086 shape incompatibility.** Before
  2026-04-21, `card-types.json` had 37 entries with the shape
  `{ id, slug, name, displayName, prefix }`. WP-084 deleted the
  file (it was unused). WP-086 reintroduced it on 2026-04-29 with a
  new 13-entry shape `{ slug, label, emoji?, order, parentType }`.
  **The shapes are incompatible.** Code that referenced the old
  shape no longer exists in the codebase; the audit trail for the
  delete-then-recreate is preserved in D-1203 and D-8601.
- **`parentType` orphan references are not Zod-checkable.** A
  malformed entry like `{ slug: 'rogue-agent', parentType: 'spies' }`
  passes Zod (the schema only requires `parentType` to be `string |
  null`). Orphan detection happens at fetch time in the viewer
  client. Adding new sub-chips requires both adding the entry and
  ensuring the parent slug exists.
- **`emoji` is optional but ordering is not.** Every entry must
  declare a non-negative integer `order`. Entries with the same
  `order` are sorted by `slug` lexically as a tie-breaker (viewer-
  side convention).
- **Engine code MUST NOT read this file.** Per
  [`registry.md` "Prohibited Behaviors"](../.claude/skills/legendary-registry/SKILL.md),
  game logic, move logic, or persistence in the registry package is
  forbidden. The taxonomy lives at the registry layer; engine
  decisions about classification (e.g.,
  `G.villainDeckCardTypes`) are resolved at setup time from per-set
  card data, not from `card-types.json`.

## Code Touchpoints

- [`data/metadata/card-types.json`](../data/metadata/card-types.json)
  — the 13 canonical entries
- [`packages/registry/src/schema.ts`](../packages/registry/src/schema.ts)
  — `CardTypeEntrySchema` (`.strict()`), `CardTypesIndexSchema`,
  derived types `CardTypeEntry`, `CardTypesIndex`
- [`apps/registry-viewer/src/lib/cardTypesClient.ts`](../apps/registry-viewer/src/lib/cardTypesClient.ts)
  — sole consumer; orphan-reference validation at fetch time

## History

- WP-001 / WP-003: Original `card-types.json` (37 entries; shape `{ id, slug, name, displayName, prefix }`); silent-failure precedent identified and locked as D-1203
- WP-084: File deleted on 2026-04-21 — the auxiliary metadata was unused at that point
- WP-086: File reintroduced on 2026-04-29 with the new 13-entry shape `{ slug, label, emoji?, order, parentType }` and `.strict()` schema; D-8601 records the reintroduction; consumed by the registry-viewer ribbon generator only

## References

- [`.claude/skills/legendary-registry/SKILL.md`](../.claude/skills/legendary-registry/SKILL.md)
  — Critical Metadata Distinction; The Silent Failure Mode;
  Prohibited Behaviors
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — Registry
  Layer; Layer Boundary
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) — `card-types.json`
  (historical), `CardRegistry`, `slug`, `RevealedCardType`
- [WP-084](../docs/ai/work-packets/WP-084-delete-unused-auxiliary-metadata.md),
  [WP-086](../docs/ai/work-packets/WP-086-registry-viewer-card-types-upgrade.md)
