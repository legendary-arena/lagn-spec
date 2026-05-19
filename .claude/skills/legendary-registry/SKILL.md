---
name: legendary-registry
description: Authoritative enforcement rules for the Registry layer. Apply when editing packages/registry/**, loading or validating card/metadata JSON, defining Zod schemas, exposing CardRegistry, or questions about registry→engine data flow at setup time.
---
---
paths:
  - "packages/registry/**"
  - "data/**"
---

# Card Registry Rules — Claude Enforcement

This file defines **non-negotiable rules for the card registry and card data**.
It exists to prevent silent data corruption and invalid coupling between
registry, engine, and server layers.

This file enforces the **Registry layer** responsibilities defined in
**`docs/ai/ARCHITECTURE.md` -- "Layer Boundary (Authoritative)"**.

The registry is a **data input layer only** and must not cross into
engine or server concerns.

It enforces decisions formalised in:
- WP-003 -- Card Registry Verification & Defect Correction
- `docs/ai/ARCHITECTURE.md` (Registry sections)
- `docs/ai/work-packets/WORK_INDEX.md`

This file does NOT implement registry logic.
If a conflict exists, **ARCHITECTURE.md wins**.

---

## Scope

Applies to:
- `packages/registry/**`
- `data/**` (metadata, cards, schema assumptions)

Does NOT apply to:
- `packages/game-engine/**` (engine consumes registry output only)
- `apps/server/**` (server wires registry, does not interpret card data)

---

## Registry Package [Invariant]

**@legendary-arena/registry** is responsible for:
- Loading card data (local files or R2/HTTP)
- Validating card data shapes against Zod schemas
- Exposing an immutable `CardRegistry`

It must do **nothing else**.

Two loaders:
- `createRegistryFromLocalFiles` -- local file system
- `createRegistryFromHttp` -- R2/HTTP

### Import Rules
The registry package must NOT import:
- `@legendary-arena/game-engine`
- `apps/server`
- Any `apps/*` package
- `pg` or any database driver

Violations are architectural bugs.

Source: ARCHITECTURE.md, Package Import Rules

---

## Schema Authority [Invariant]

- **`packages/registry/src/schema.ts`** is the single source of truth for all
  field shapes and nullable/optional constraints
- All loaders must validate against these schemas
- Permissiveness in schemas reflects **real data quirks** -- do not "tighten"
  schemas casually
- Comments inside `schema.ts` document the data quirks that drove permissiveness
  decisions -- read them before modifying
- `schema.ts` must not be modified without strong reason and a `DECISIONS.md` entry

### Immutable Files (from WP-003)
These files are confirmed correct and must not be modified without justification:
- `src/schema.ts` -- Zod schemas
- `src/shared.ts` -- `flattenSet()`, `applyQuery()`, `buildHealthReport()`
- `src/impl/localRegistry.ts` -- local file loader (already uses `sets.json`)

If schema behavior seems wrong, stop and re-read WP-003 before changing it.

---

## Critical Metadata Distinction (DO NOT MIX) [Invariant]

Two files look similar but serve completely different roles.
Confusing them causes **silent failure with zero errors**.

### `data/metadata/sets.json` -- Set Index

```
{ id, abbr, pkgId, slug, name, releaseDate, type }
```

- Validated by `SetIndexEntrySchema`
- Used by both loaders to enumerate which card sets exist
- The `abbr` field locates per-set card files (e.g., `mdns.json`)
- **This is what loaders must fetch to enumerate sets**

### `data/metadata/card-types.json` -- Card-Type Taxonomy (Ribbon)

```
{ slug, label, emoji?, order, parentType }
```

- 13 entries (10 top-level + 3 SHIELD sub-chips) classifying card archetypes
- Has NO `abbr` or `releaseDate` fields
- Validated by `CardTypeEntrySchema` `.strict()` (`packages/registry/src/schema.ts`)
- Reintroduced under WP-086 (2026-04-29) after WP-084 deletion (2026-04-21);
  the pre-deletion 37-entry `{ id, slug, name, displayName, prefix }` shape is
  no longer in use anywhere — the new shape is incompatible with the old one
- Consumed by `apps/registry-viewer/src/lib/cardTypesClient.ts` (WP-086 ribbon
  generator); never consumed by `createRegistryFromLocalFiles` or
  `createRegistryFromHttp`
- **This is NOT a set index and must never be used where `sets.json` is expected**

### The Silent Failure Mode

If code fetches `card-types.json` where `sets.json` is expected:
- `card-types.json` entries lack `abbr` and `releaseDate`
- Every entry fails `SetIndexEntrySchema` silently
- Zod produces **zero sets with no error thrown**
- The registry appears to load successfully but contains no data

This was the confirmed bug in `httpRegistry.ts` fixed by WP-003 (D-1203). The
fix added a `// why:` comment at the fetch site distinguishing the two files;
the comment is preserved across WP-084 deletion + WP-086 reintroduction
because the silent-failure pattern is independent of which specific file is
involved -- any auxiliary metadata file with a non-overlapping shape can
trigger the same zero-results silent failure if fetched at the wrong seam.

Source: ARCHITECTURE.md, Registry Metadata File Shapes; WP-003 Defect 1; D-1203;
WP-086 / D-8601 (reintroduction with new shape)

---

## Card Field Data Quality [Invariant]

Hero card numeric fields are NOT clean integers in the raw data.
Any code that reads or parses these fields must treat them as
`string | number | undefined`:

| Field | Examples | Why |
|---|---|---|
| `cost` | `0`, `3`, `"2*"` | Star-cost modifier (confirmed WP-003) |
| `attack` | `0`, `3`, `"2+"` | Plus-modifier for conditional bonuses |
| `recruit` | `0`, `2`, `"1+"` | Plus-modifier for conditional bonuses |
| `vAttack` | `8`, `"8+"` | Mastermind fight values |

**Parsing rule:** Strip trailing `+` or `*`, parse integer base. On unexpected
input, return `0` and emit deterministic warning -- never throw. Parser
implemented in WP-018 `economy.logic.ts`. All packets from WP-018 onward must
use it rather than assume integers.

**`FlatCard.cost`** must be `string | number | undefined` -- never narrowed to
`number | undefined`. This was Defect 2 fixed by WP-003 (amwp Wasp has `"2*"`
star-cost cards).

Source: ARCHITECTURE.md, Card Field Data Quality; WP-003 Defect 2

---

## Card Data Locations

- **Local cards (this repo):** `data/cards/[set-abbr].json`
- **External card source:** `C:\Users\jjensen\bbcode\modern-master-strike\src\data\cards\` (40 set files)
- **Card images:** `https://images.barefootbetters.com/` (R2)
- Image URLs use **hyphens**, not underscores

### Card JSON Structure (per-set file)

```json
{
  "id": 1,
  "abbr": "core",
  "heroes": [{
    "name": "Black Widow",
    "slug": "black-widow",
    "team": "avengers",
    "cards": [{
      "name": "Mission Accomplished",
      "slug": "mission-accomplished",
      "rarity": 1,
      "hc": "tech",
      "cost": 2,
      "attack": null,
      "recruit": null,
      "imageUrl": "https://...",
      "abilities": ["Draw a Card.", "[hc:tech]: Rescue a Bystander."]
    }]
  }]
}
```

Note: `attack` and `recruit` can be `null`, a number, or a string like `"2+"`.

---

## Registry Smoke Test

The only `@legendary-arena/registry` test file is `src/registry.smoke.test.ts`
(created by WP-003):
- Uses `node:test` and `node:assert` only -- no Jest or Vitest
- Creates local registry from `data/metadata/` and `data/cards/`
- Confirms `listSets().length > 0` and `listCards().length > 0`
- Does not import from `game-engine`, `server`, or any database package

---

## Prohibited Behaviors [Guardrail]

Claude must never:
- Import `game-engine`, `server`, or `pg` into registry code
- Modify `schema.ts`, `shared.ts`, or `localRegistry.ts` without strong
  justification and a `DECISIONS.md` entry
- Use `card-types.json` where `sets.json` is expected
- Narrow `FlatCard.cost` back to `number | undefined`
- Tighten Zod schemas without understanding the real data quirks they accommodate
- Assume card numeric fields are clean integers
- Use underscores in card type slugs
- Add game logic, move logic, or persistence to the registry package

---

## When Unsure -- STOP

If a change appears to:
- Alter a Zod schema
- Change which metadata file a loader fetches
- Modify field types in `FlatCard` or related interfaces
- Add imports from other packages

STOP and consult:
- `packages/registry/src/schema.ts` (read the comments)
- WP-003
- `docs/ai/ARCHITECTURE.md`
- `DECISIONS.md`

Do not guess. Registry mistakes cause silent data loss.
