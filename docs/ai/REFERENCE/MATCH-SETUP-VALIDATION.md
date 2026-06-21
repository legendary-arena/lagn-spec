# MATCH-SETUP-VALIDATION.md

**Legendary Arena -- Match Setup Validation Rules**

**Status:** Canonical
**Applies to:** Server, Match Creation, Replays, Simulation, PAR
**Audience:** Server, Engine, Tooling, AI, Ops
**Authority:** Subordinate to `MATCH-SETUP-SCHEMA.md`,
`MATCH-SETUP-JSON-SCHEMA.json`,
`ARCHITECTURE.md`, `DECISIONS.md`

---

## Purpose

This document defines the **authoritative validation process** for
**Match Setup** in Legendary Arena.

Validation exists to ensure that **every match**:

- is deterministic
- is replayable
- is verifiable
- is safe to simulate
- cannot introduce rule drift or hidden authority

This document specifies **where validation occurs**, **what is validated**,
and **what must happen on failure**.

---

## Core Principle

> **Invalid match setup must be rejected before a game exists.**

There is no such thing as:

- "best-effort setup"
- "fallback defaults"
- "temporary overrides"

If match setup validation fails, **match creation fails**.

---

## Validation Boundary

Match Setup validation **must occur before**:

- `Game.setup(ctx, setupData)`
- any randomization
- any replay write
- any DB persistence of a new match
- any simulation or PAR run

Validation **must not** occur:

- during moves
- mid-game
- inside scoring logic

---

## Existing Validation Infrastructure

The engine already provides two validation layers (see D-1244, D-1247):

### Layer 1: Lobby Gate (`game.ts:92-101`)

`validateSetupData` is called by boardgame.io at the lobby create endpoint.
It checks that `setupData` (the composition block) is present.
Returning a string triggers a 400 response.

### Layer 2: Engine Gate (`matchSetup.validate.ts:108-204`)

`validateMatchSetup()` performs full shape and registry validation inside
`Game.setup()`. It uses the `ValidateMatchSetupResult` contract:

```ts
validateMatchSetup(
  input: unknown,
  registry: CardRegistryReader,
): ValidateMatchSetupResult
// where ValidateMatchSetupResult =
//   | { ok: true; value: MatchSetupConfig }
//   | { ok: false; errors: MatchSetupError[] }
```

This function:

- Is pure (no side effects)
- Never throws
- Validates all 9 composition fields (shape + types)
- Validates all ext_ids against the card registry
- Accumulates all errors (does not fail on first)

### Layer 1b: Lobby Pre-Check (Client — `apps/arena-client`)

Before submission, `apps/arena-client`'s `parseLoadoutJson` (the lobby shape
guard, WP-092) performs a client-side **envelope-grammar** pre-check of the
five composition entity-id fields (`schemeId`, `mastermindId`, and each entry
of `villainGroupIds` / `henchmanGroupIds` / `heroDeckIds`), rejecting any id
not in the set-qualified `<setAbbr>/<slug>` form with error code
`"unqualified_ext_id"` and a full-sentence "re-export your loadout" message.
This catches a stale pre-D-24018 export (flat-card keys like
`core-scheme-midtown-bank-robbery` or bare slugs like `black-widow`) in the
lobby instead of as an opaque `Game.setup()` 500. It is **grammar-only** — the
engine (Layer 2) remains the sole authority on ext_id existence and charset —
and **layer-boundary-safe**: the grammar mirrors the engine's `parseQualifiedId`
(D-10014) but is re-derived by hand, since arena-client may not import the
registry or the engine setup surface at runtime (D-14401). Both the
MATCH-SETUP and LAGN intake paths route through `parseLoadoutJson`, so both
gain the guard. See WP-254 / D-24025.

### What Does Not Exist Yet

Envelope validation (schemaVersion, setupId, seed, playerCount, themeId,
expansions) is **not yet implemented**. Per D-1247, the envelope is consumed
by the server before the composition reaches the engine. Server-side
envelope validation is a future implementation concern.

---

## Validation Stages (Mandatory Order)

When full Match Setup validation is implemented, it must be performed
in the following order. Each stage **must fail fast** (do not proceed
to the next stage if the current stage fails).

---

### Stage 1 -- Envelope Validation (Server Layer)

Validate the Match Setup envelope before extracting composition.

This stage ensures:

- `schemaVersion` is supported (currently: `"1.0"`)
- `setupId` is present and non-empty
- `createdAt` is a valid ISO-8601 timestamp
- `createdBy` is one of `"player"`, `"system"`, `"simulation"`
- `seed` is present and non-empty
- `playerCount` is between 1 and 5 (per D-1245, matching engine limits)
- `themeId` exists in THEME-SCHEMA (if provided)
- `expansions` is non-empty and all entries are recognized
- if `heroSelectionMode` is present, it must be one of the allowed enum
  values (`GROUP_STANDARD` in v1); if absent, the envelope is treated
  as `heroSelectionMode: "GROUP_STANDARD"` for downstream consumers.
  An unrecognized value is rejected with error code
  `"unsupported_hero_selection_mode"` and the full-sentence error
  message template (normative, verbatim; `<value>` is the only
  permitted substitution):
  `The loadout envelope's heroSelectionMode is <value>, which is not a supported rule mode in v1 of the match setup schema. Supported modes: GROUP_STANDARD. (HERO_DRAFT is reserved for a future release and is not yet implemented.)`
  See `DECISIONS.md` D-9301 and
  `MATCH-SETUP-SCHEMA.md §Field Semantics / Hero Selection Mode`.

**Owner:** Server layer (`apps/server`)
**Output:** Validated envelope + extracted composition block
**On failure:** Reject match creation with structured error

---

### Stage 2 -- Structural Validation (Schema)

Validate the full document against `MATCH-SETUP-JSON-SCHEMA.json`.

This stage ensures:

- Required fields are present at all levels
- Unknown fields are rejected (`additionalProperties: false`)
- Field types are correct
- Arrays respect `minItems` and `uniqueItems`
- Composition entity-id patterns match `^[a-z0-9-]+/[a-z0-9-]+$` — the
  set-qualified `<setAbbr>/<slug>` form (per `MATCH-SETUP-JSON-SCHEMA.json`
  and D-10014), not the bare `^[a-z0-9-]+$`. (D-24018 widened the canonical
  schema pattern to the qualified form when the Registry Viewer began
  emitting set-qualified ids; D-24025 reconciled this prose, which had
  retained the stale single-segment pattern.)

`additionalProperties: false` enforces fail-closed behavior structurally.
Per D-1246, no separate ban list is needed for specific field names.

**Output:** Typed, schema-valid object
**On failure:** Reject match creation

---

### Stage 3 -- Composition Validation (Engine Layer)

Validate the composition block using the existing `validateMatchSetup()`
function in `matchSetup.validate.ts`.

This stage ensures:

- All 9 composition fields are present and correctly typed
  - `schemeId`, `mastermindId` (non-empty strings)
  - `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds` (non-empty string arrays)
  - `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount` (non-negative integers)
- All ext_id references exist in the card registry

**Owner:** Engine layer (`packages/game-engine`)
**Output:** Validated `MatchSetupConfig`
**On failure:** Reject match creation (Game.setup() throws per D-0102)

---

### Stage 4 -- Player Count Compatibility (Future)

Validate that `playerCount` is compatible with:

- scheme requirements (if scheme imposes player count constraints)
- mastermind requirements (if any)
- hero count rules (if any)

This stage must **only validate**. It must **not** mutate setup or
auto-adjust composition.

**Status:** Not yet implemented. Basic range validation (1-5) is already
enforced by the JSON Schema's `minimum`/`maximum` constraints on
`playerCount`. Only scheme-specific or mastermind-specific player count
rules are deferred to this stage.

---

## Validation Failure Semantics

On failure:

- The match **must not be created**
- No match ID should be generated
- No DB write should occur
- No side effects should remain

### Existing Error Contract

The engine uses `MatchSetupError` (`matchSetup.types.ts:65-71`):

```ts
interface MatchSetupError {
  readonly field: string;
  readonly message: string;
}
```

This is **not** `MoveError` (per D-1208). `MatchSetupError` is specific
to setup validation and uses a simpler shape.

Error messages must be:

- Full sentences (per code-style rule 11)
- Deterministic
- Non-leaky (no internal stack traces)

---

## Replay & Verification Requirements

Validation must guarantee that:

- Storing match setup + move log is sufficient to replay
- No external configuration affects outcome
- Removing UI, defaults, or services does not invalidate replay

Replays that reference an invalid or unverifiable setup **must be rejected**.

---

## Simulation & PAR Requirements

All simulation and PAR systems must:

- Validate match setup **before** simulation
- Reject invalid setups instead of correcting them
- Treat match setup as immutable

PAR correctness depends on **setup correctness**.
Simulation shortcuts are not permitted.

---

## Test Coverage Requirements

The following test cases are mandatory for any validation implementation.

### Valid Cases

- Minimal valid setup: 1 expansion (`"base"`), 1 villain group, 1 henchman
  group, 1 hero deck, valid counts
- Valid setup with optional `themeId`
- Valid setup with `createdBy: "simulation"`
- Valid envelope with `heroSelectionMode: "GROUP_STANDARD"` explicitly
  present (the only v1-allowed value)
- Valid envelope with `heroSelectionMode` absent (backward-compat case:
  consumers must treat the absent field as `heroSelectionMode:
  "GROUP_STANDARD"` per `MATCH-SETUP-SCHEMA.md §Field Semantics / Hero
  Selection Mode`)

### Invalid Cases -- Structural

- Missing or empty `seed`
- Empty `expansions` array
- Unknown top-level field (rejected by `additionalProperties: false`)
- Unknown composition field (e.g. `villainGroups` instead of `villainGroupIds`)
- Duplicate `villainGroupIds` or `heroDeckIds` entries
- Invalid `playerCount` (0, negative, or > 5)
- Unrecognized `heroSelectionMode` value (e.g. `"HERO_DRAFT"`,
  `"MADE_UP"`, or any other non-`"GROUP_STANDARD"` string) — Stage 1
  rejects with error code `"unsupported_hero_selection_mode"` and the
  full-sentence error message template documented above. `"HERO_DRAFT"`
  is reserved for a future release and is deliberately **not** in the
  v1 allowed enum; see `DECISIONS.md` D-9301.

### Invalid Cases -- Registry

- `mastermindId` not found in registry
- `schemeId` not found in registry
- Array entry in `villainGroupIds` not found in registry

### Invalid Cases -- Type Errors

- Count field with negative value
- Count field with non-integer (e.g. 3.5)
- String field with empty string
- Array field that is not an array

### Existing Test Coverage

`matchSetup.contracts.test.ts` already covers:

- Valid config with all ext_ids in registry
- Missing required field
- Invalid count field (negative)
- Unknown ext_id
- Null, undefined, number, and array inputs (no-throw contract)
- Error accumulation (all 9 fields invalid)
- CardRegistryReader boundary (no registry import)
- MatchConfiguration/MatchSetupConfig compatibility

Envelope validation tests should be added when server-side validation
is implemented.

---

## Logging & Observability

Validation failures should be logged with:

- `setupId` (if present)
- error codes or field names (not raw payloads)
- source (`player`, `system`, `simulation`)

Logs must not include:

- full setup payloads
- personally identifying information

---

## Summary

Match Setup validation is:

- a **hard gate**
- a **trust boundary**
- a **determinism guarantee**
- a **competitive integrity requirement**

It is not a convenience feature.

> **If setup is wrong, the game must not exist.**

---

## Relationship Map

```
MATCH-SETUP-JSON-SCHEMA.json  ->  structural correctness
MATCH-SETUP-SCHEMA.md         ->  semantic meaning & governance
MATCH-SETUP-VALIDATION.md     ->  enforcement & behavior
matchSetup.validate.ts         ->  engine-layer implementation
matchSetup.types.ts            ->  authoritative type contract
```

All three reference documents are required. None is optional.
