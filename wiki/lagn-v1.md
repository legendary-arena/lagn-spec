---
title: LAGN v1.0 Specification
type: Tool
tags:
  - lagn
  - game-notation
  - schema
  - specification
  - open-standard
related:
  - complete-game-fixtures.md
status: canonical
source:
  - ../packages/lagn-spec/src/validator.ts
  - ../packages/lagn-spec/README.md
  - ../docs/ai/work-packets/WP-244-lagn-spec-publication.md
  - ../docs/ai/execution-checklists/EC-275-lagn-spec-publication.checklist.md
last-reviewed: 2026-06-12
---

# LAGN v1.0 Specification

## Summary

LAGN (Legendary Arena Game Notation) is the open standard format for
representing Legendary Arena game state: match setup, card catalog metadata,
and deterministic replay logs. Published as an NPM package (`@legendary-arena/lagn@1.0.0`)
with Zod validator, auto-generated JSON Schema, TypeScript types, and CLI tooling.
LAGN enables third-party tools, bots, and replay systems to work with
Legendary Arena game data in a stable, interoperable format.

## Mechanics

### Three-Tier Format

LAGN defines three optional tiers that can be combined or used independently:

**Tier 1: Game Setup (Required)**

Mandatory fields defining the match configuration:

```json
{
  "game_id": "string (UUID v4)",
  "variant": "classic|custom",
  "player_count": "integer 2-5",
  "outcome": "victory|loss",
  "loss_reason": "mastermind_defeated|villain_escape|player_elimination|unavailable (Tier 2+)",
  "setup": {
    "mastermind_id": "CardExtId",
    "scheme_id": "CardExtId",
    "villain_group_ids": ["CardExtId", ...],
    "henchman_group_ids": ["CardExtId", ...],
    "hero_deck_ids": ["CardExtId", ...],
    "bystanders_count": "integer >= 0",
    "wounds_count": "integer >= 0",
    "officers_count": "integer >= 0",
    "sidekicks_count": "integer >= 0"
  }
}
```

**Tier 2: Card Catalog (Optional)**

Extended card metadata for offline analysis:

```json
{
  "card_catalog": {
    "mastermind": {
      "id": "CardExtId",
      "name": "string",
      "rarity": "common|uncommon|rare|super_rare|ultra_rare"
    },
    "schemes": [...],
    "villain_groups": [...],
    "henchmen": [...],
    "heroes": [...],
    "cards": [
      {
        "ext_id": "CardExtId",
        "set_abbr": "string",
        "slug": "string",
        "name": "string",
        "type": "mastermind|scheme|villain|henchman|hero|bystander|officer|sidekick",
        "cost": "integer",
        "attack": "integer",
        "health": "integer"
      }
    ]
  }
}
```

**Tier 3: Replay Log (Optional)**

Deterministic turn-by-turn log for perfect replay and audit:

```json
{
  "replay": {
    "turns": [
      {
        "turn_number": "integer >= 0",
        "turn_player_index": "integer 0-(player_count-1)",
        "villain_events": [
          {
            "seq": "integer",
            "event_type": "patrol|strike|escape|scheme_twist|master_strike|extra_turn",
            "card_id": "CardExtId (when event_type has a card)"
          }
        ],
        "player_actions": [
          {
            "seq": "integer (strictly increasing from 0)",
            "action_type": "play|recruit|attack|defend|draw|discard",
            "source_card_id": "CardExtId (when applicable)",
            "target": "object (varies by action_type)"
          }
        ]
      }
    ]
  }
}
```

### Zod Validator & Source of Truth

The entire specification is defined in
[`packages/lagn-spec/src/validator.ts`](../packages/lagn-spec/src/validator.ts)
as a single authoritative Zod schema. The schema:

- Validates all three tiers in isolation or combination
- Enforces strict data types and closed enumerations
- Validates `seq` constraint (strictly increasing sequences, no gaps/duplicates)
- Exports the `validate(data)` function returning `{ valid: boolean, errors?: string[] }`
- Exports `summarize(data)` returning metadata: `{ valid, game_id, variant, player_count, outcome }`
- Exports `generateSchema()` returning a plain JSON Schema object (never hand-edited)

### TypeScript Types

Inferred from the Zod schema via `z.infer<typeof lagnSchema>`, exported as:

- `LAGN` — the full data structure
- `GameSetup`, `CardCatalog`, `Replay` — tier structures
- `Card`, `Action`, `VillainEvent`, `Turn`, `GameResult` — component types
- `ActionType`, `VillainPhaseEvent`, `Outcome`, `LossCondition`, `RarityCode`, `HeroClass`, `CardType` — enumerations

### JSON Schema Generation & Hosting

The `generateSchema()` function produces a valid JSON Schema (draft 2020-12).
The schema is auto-generated on every build and never hand-edited.

**Public schema URLs:**

- `https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json` — Cloudflare CDN
- `https://www.npmjs.com/package/@legendary-arena/lagn` — NPM package export (`"./schema"` entrypoint)

### CLI Tool

The `lagn` CLI command (installed via `npm install -g @legendary-arena/lagn`):

```bash
lagn validate <file.lagn.json>
```

**Exit codes:**

- `0` — File is valid; message: `✓ Valid LAGN file: game_id=..., variant=..., players=..., outcome=...`
- `1` — File is invalid; prints errors to stderr
- `2` — File not found or I/O error; prints error to stderr

### NPM Package Metadata

Published as `@legendary-arena/lagn@1.0.0`:

- **Main entry:** `dist/index.js` (exports `validate`, `summarize`, `generateSchema`, types)
- **Schema export:** `"./schema"` entrypoint resolves to `schemas/lagn-v1.json`
- **CLI binary:** `lagn` (installed to `node_modules/.bin/lagn` via `"bin"` field)

## Interactions

- **Game Engine.** The engine's `MatchSetupConfig` shape (9 locked fields)
  aligns with LAGN Tier 1 `GameSetup`. Engine builders produce data in
  LAGN-compatible format for future serialization.
- **Registry.** LAGN Tier 2 card catalog is sourced from
  [`@legendary-arena/registry`](../packages/registry/); card `ext_id` format
  matches the registry's `CardExtId` type.
- **Replay Producer.** [`apps/replay-producer`](../apps/replay-producer) emits
  LAGN Tier 3 replay logs from deterministic turn sequences.
- **Third-party tools.** LAGN enables external bot frameworks, analysis
  pipelines, and replay viewers to validate and process Legendary Arena
  game data without importing engine code.

## Edge Cases

- **Tier independence.** Tiers 2 and 3 are optional; a minimal valid LAGN
  file contains only Tier 1 (setup). Tools consuming LAGN must handle
  any combination.
- **CardExtId format validation.** Card IDs must match `<setAbbr>/<slug>`
  format per
  [D-10014](../docs/ai/DECISIONS.md#d-10014).
  Malformed IDs fail validation.
- **seq constraint.** Replay actions and villain events within a turn are
  validated as **strictly increasing sequences starting at 0**, with no
  gaps and no duplicates. Out-of-order or duplicate `seq` values fail.
- **JSON Schema versioning.** The schema URI includes the version
  (`lagn-v1.json`). Future major versions (v2, v3) will publish to
  separate schema files; consumers must pin their expected version
  explicitly.
- **CLI exit behavior.** The CLI exits with code 1 on validation failure
  and code 2 on I/O errors. Non-zero exit codes allow shell scripts to
  detect and react to both cases.

## Code Touchpoints

- [`packages/lagn-spec/src/validator.ts`](../packages/lagn-spec/src/validator.ts)
  — Zod schema (authoritative source of truth), `validate()`, `summarize()`,
  `generateSchema()`
- [`packages/lagn-spec/src/types.ts`](../packages/lagn-spec/src/types.ts)
  — Auto-inferred TypeScript types via `z.infer<typeof lagnSchema>`
- [`packages/lagn-spec/src/index.ts`](../packages/lagn-spec/src/index.ts)
  — Public API exports
- [`packages/lagn-spec/src/cli.ts`](../packages/lagn-spec/src/cli.ts)
  — CLI entrypoint (shebang `#!/usr/bin/env node`)
- [`packages/lagn-spec/src/validator.test.ts`](../packages/lagn-spec/src/validator.test.ts)
  — 21 tests covering all three tiers, seq constraints, and summarize()
- [`packages/lagn-spec/scripts/generate-schema.mjs`](../packages/lagn-spec/scripts/generate-schema.mjs)
  — Generates `schemas/lagn-v1.json` at build time

## References

- [WP-244 — LAGN Spec Publication](../docs/ai/work-packets/WP-244-lagn-spec-publication.md)
  — Design and delivery specification
- [EC-275 — LAGN Spec Publication](../docs/ai/execution-checklists/EC-275-lagn-spec-publication.checklist.md)
  — Execution checklist with locked values and guardrails
- [Complete Game Fixtures](complete-game-fixtures.md) — Example LAGN files
  demonstrating all three tiers
- [`@legendary-arena/lagn` on NPM](https://www.npmjs.com/package/@legendary-arena/lagn)
  — Published package
- [JSON Schema Standard (2020-12)](https://json-schema.org/draft/2020-12/json-schema-core.html)
  — Schema specification version
