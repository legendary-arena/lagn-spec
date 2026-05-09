---
title: CardExtId
type: Concept
tags:
  - layer-engine
  - layer-registry
  - data-shape
  - zones
  - persistence
  - determinism
  - contract
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - rule-execution-pipeline.md
  - turn-system.md
  - card-type-taxonomy.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../.claude/rules/game-engine.md
  - ../.claude/rules/architecture.md
  - ../.claude/rules/registry.md
  - ../packages/game-engine/src/state/zones.types.ts
  - ../packages/game-engine/src/matchSetup.types.ts
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-006A-player-state-zones-contracts.md
  - ../docs/ai/work-packets/WP-113-engine-server-registry-wiring-and-validator-alignment.md
  - ../docs/ai/REFERENCE/00.2-data-requirements.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# CardExtId

## Summary

`CardExtId` is the named type alias for **string** identifiers used
across every zone, pile, and card-keyed map in the engine. Its sole
purpose is to mark a string as "this is a card identifier, resolved
by the registry — not stored content." Every zone in `G` stores
`CardExtId` strings exclusively; full card objects, display data,
and database primary keys never enter `G`.

## Mechanics

### The type alias

The full definition lives in
[`zones.types.ts:25`](../packages/game-engine/src/state/zones.types.ts):

```ts
export type CardExtId = string;
```

The alias has no runtime structure beyond `string`. Its value is in
the *intent* it communicates at type-check time: every consumer that
touches `G.playerZones`, `G.piles`, `G.villainDeck`,
`G.attachedBystanders`, `G.cardKeywords`, `G.cardStats`, or any
other card-keyed map sees `CardExtId` and knows the value is a
registry-resolvable identifier, not card content.

### The `<setAbbr>/<slug>` format

Per D-10014 (locked by WP-113), all `CardExtId` values follow the
exact format:

```
<setAbbr>/<slug>
```

- `setAbbr` — the set abbreviation from `data/metadata/sets.json`
  (e.g., `core`, `mdns`, `wpnx`)
- `slug` — the card's lowercase-hyphen slug from the per-set JSON
  (e.g., `black-widow`, `dr-doom`)
- Exactly one `/` separator; no leading or trailing whitespace; no
  empty components

A helper `parseQualifiedId` (duplicated locally inside builders to
avoid circular imports — see
[`buildSchemeSetupInstructions.ts`](../packages/game-engine/src/setup/buildSchemeSetupInstructions.ts))
returns `{ setAbbr, slug }` or `null`. The validator boundary
(`validateMatchSetup`) is the authoritative format-error reporter;
builders treat malformed IDs as graceful skips.

### The zone-storage invariant

Every zone in `G` is typed `Zone = CardExtId[]`. The
[`zones.types.ts`](../packages/game-engine/src/state/zones.types.ts)
header carries the rationale:

> Zones store ext_id strings rather than full card objects because
> `G` must remain JSON-serializable and small. Card display data
> (images, text, costs) is resolved by the UI via the card registry
> at render time. Storing full card objects would bloat `G`, break
> serialization guarantees, and duplicate data that the registry
> already owns.

This is enforced by
[`game-engine.md` "Zone Mutation Rules"](../.claude/rules/game-engine.md):

- Zones contain `CardExtId` strings only — never card objects,
  metadata, or DB IDs
- All zone mutations route through `zoneOps.ts`
- Helpers return new arrays; never mutate inputs
- No `.reduce()` in zone operations

### Top-of-deck convention

Every zone is an ordered array. The top of any deck is at index `0`:

```ts
G.villainDeck.deck[0]    // top of villain deck
G.playerZones[id].deck[0] // top of a player's draw pile
```

Removing the top card uses `slice(1)` to produce a new array
(consistent with the no-`.reduce()`, no-mutate-inputs rule). This
convention is locked by
[WP-014A](../docs/ai/work-packets/WP-014A-villain-reveal-pipeline.md) for
the villain deck and applies uniformly across player decks.

### The resolution boundary

`CardExtId` is the seam between the engine and the registry:

- **The engine** holds IDs in `G`. It never holds card content. It
  never imports `@legendary-arena/registry` at runtime.
- **The registry** resolves IDs to `FlatCard` records (see the
  Registry Layer in
  [`architecture.md`](../.claude/rules/architecture.md)).
- **The UI** calls the registry to render display data
  (image, name, abilities, cost) for any `CardExtId` it needs to
  show.

Setup-time builders receive the registry as a function argument and
resolve IDs once, storing per-card maps like `G.cardStats` and
`G.cardKeywords` that moves can read in O(1) without ever touching
the registry again. Per
[`game-engine.md` "Registry Boundary"](../.claude/rules/game-engine.md):
*"setup resolves, moves operate on resolved data."*

## Interactions

- **Every zone-touching mechanic.** [Villain Deck](villain-deck.md)
  reveal, [Master Strike](master-strike.md) classification,
  [Scheme Twist](scheme-twist.md) reveal, hero-deck draws — all
  operate on `CardExtId` strings and never on card content.
- **[Scheme](scheme.md).** `MatchSetupConfig.schemeId` is a
  `CardExtId` — the same alias used for any other card identifier.
  The 9 locked `MatchSetupConfig` fields each carry one or more
  `CardExtId` values.
- **[Rule Execution Pipeline](rule-execution-pipeline.md).** Trigger
  payloads carry `CardExtId` (e.g., `OnCardRevealedPayload.cardId`,
  `OnSchemeTwistRevealedPayload.cardId`,
  `OnMastermindStrikeRevealedPayload.cardId`). Handlers receive IDs,
  not card objects.
- **Persistence.** Because `CardExtId` is `string`, every zone and
  card-keyed map serializes cleanly. The persistence boundary
  (`G` is runtime-only; only snapshots and configuration may be
  persisted, per [10-GLOSSARY.md](../docs/10-GLOSSARY.md) "Persistence &
  Snapshots") relies on this.
- **`PlayerId` distinction.** `PlayerId` is a separate alias
  (introduced by WP-087) used as the key type for
  `Record<PlayerId, …>` maps like `G.playerZones`. `PlayerId` and
  `CardExtId` are both string aliases but mark distinct domains —
  do not interchange them.

## Edge Cases

- **Format violations are validator territory.** A `CardExtId`
  missing the `/` separator, with extra slashes, or with empty
  components fails validation at the `validateMatchSetup` boundary.
  Builders downstream treat malformed IDs as graceful skips
  (returning `[]` or logging a `G.messages` entry) rather than
  re-reporting the format error — the validator is the
  authoritative reporter (D-10014).
- **`CardExtId` is not a database primary key.** Per
  [00.2 §Cross-service Identifiers](../docs/ai/REFERENCE/00.2-data-requirements.md),
  PostgreSQL tables in the `legendary.*` namespace use `bigserial`
  PKs internally and `text ext_id` columns for cross-service
  identification. A `CardExtId` value is the `ext_id`, not the
  numeric PK. Server code that needs to bridge the two does the
  lookup at the database boundary; engine code never sees a numeric
  PK.
- **Image URLs use hyphens, not underscores.** Card images live at
  `https://images.barefootbetters.com/` and the URL slug uses
  hyphens (e.g., `iron-man.jpg`). Underscores are forbidden by
  registry convention; the same hyphen rule applies to `CardExtId`
  slugs.
- **Aliasing does not enforce uniqueness.** `CardExtId = string`
  means TypeScript will not catch a value like `"not-a-real-id"` at
  compile time. Uniqueness is enforced by the registry's loaded
  index, not by the type system. Code that constructs
  `CardExtId` values without registry input is suspect.
- **Don't narrow at function signatures.** A function accepting
  `cardId: string` and one accepting `cardId: CardExtId` are
  structurally identical. Prefer the named alias for documentation
  intent; do not write helpers that accept `string` and rely on
  callers to pre-validate.

## Code Touchpoints

- [`packages/game-engine/src/state/zones.types.ts`](../packages/game-engine/src/state/zones.types.ts)
  — `CardExtId`, `Zone`, `PlayerZones`, `PlayerState`
- [`packages/game-engine/src/matchSetup.types.ts`](../packages/game-engine/src/matchSetup.types.ts)
  — `MatchSetupConfig` (every card-identifier field is `CardExtId`)
- [`packages/game-engine/src/moves/zoneOps.ts`](../packages/game-engine/src/moves/zoneOps.ts)
  — pure helpers for zone mutation (no `.reduce()`, no
  `boardgame.io` import)
- [`packages/game-engine/src/setup/buildSchemeSetupInstructions.ts`](../packages/game-engine/src/setup/buildSchemeSetupInstructions.ts)
  — `parseQualifiedId` helper (locally duplicated to avoid circular
  imports)

## History

- WP-006A: `CardExtId` introduced as a named alias in
  `zones.types.ts`; zone shapes locked to `CardExtId[]`
- WP-113: `<setAbbr>/<slug>` format locked across the engine,
  validator, registry, and builders (D-10014)

## References

- [`.claude/rules/game-engine.md`](../.claude/rules/game-engine.md)
  — Registry Boundary; Zone Mutation Rules
- [`.claude/rules/architecture.md`](../.claude/rules/architecture.md)
  — Zone Contents (CardExtId-only invariant)
- [`.claude/rules/registry.md`](../.claude/rules/registry.md)
  — Card Data Locations; Card Field Data Quality
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — Layer
  Boundary; Persistence Boundary; WP-006A / WP-113 review notes
- [`docs/ai/REFERENCE/00.2-data-requirements.md`](../docs/ai/REFERENCE/00.2-data-requirements.md)
  — Cross-service identifiers (`ext_id text` columns); image URL
  hyphen rule
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) — `CardExtId`,
  `PlayerZones`, `GlobalPiles`, `slug`, `ext_id`
- [WP-006A](../docs/ai/work-packets/WP-006A-player-state-zones-contracts.md),
  [WP-113](../docs/ai/work-packets/WP-113-engine-server-registry-wiring-and-validator-alignment.md)
