# SAFE-KNOBS.md

**Legendary Arena -- Customer-Safe Configuration Knobs**

**Status:** Canonical
**Applies to:** Customer Feedback, Balance Iteration, Presets, Themes, Match Setup
**Audience:** Product, Engine, Content, Tooling, Ops
**Authority:** Subordinate to `ARCHITECTURE.md`, `DECISIONS.md`,
`MATCH-SETUP-SCHEMA.md`, `MATCH-SETUP-VALIDATION.md`

---

## Purpose

This document defines **"safe knobs"** -- configuration surfaces that may be
adjusted in response to customer feedback **without requiring engine changes**.

Safe knobs exist to:

- enable rapid iteration from customer and playtest feedback
- preserve deterministic replays and simulations
- avoid destabilizing the engine or rule execution
- separate product tuning from engine correctness

Safe knobs are configuration parameters that must be expressible entirely
as data in match setup or its envelope. Runtime switches, feature flags,
and conditional logic are not safe knobs.

Safe knobs are a **product policy**, not a technical schema.

---

## Core Principle

> **Safe knobs affect *what game is played*, not *how the rules execute*.**

A safe knob:

- is data-driven
- is deterministic
- is validated before runtime
- does not alter rule logic or scoring
- does not change move legality or resolution order
- preserves replay integrity

If a requested change cannot be expressed as a safe knob, it requires:

- an engine change, and
- a formal decision record in `DECISIONS.md`.

---

## Knob Hierarchy

Safe knobs are grouped by risk and exposure level. All knobs reference
fields from `MatchSetupConfig` (the engine's 9-field contract in
`matchSetup.types.ts`) or the Match Setup envelope (per D-1247).

No knob may move to a higher tier without a documented decision.

---

## Tier 1 -- Fully Safe (Expose Early)

These knobs are safe to expose immediately and encourage customer feedback.

### 1. Match Composition Counts

Adjustable fields in `MatchSetupConfig` (composition block):

- `bystandersCount` -- number of bystander cards
- `woundsCount` -- number of wound cards
- `officersCount` -- number of S.H.I.E.L.D. Officer cards
- `sidekicksCount` -- number of Sidekick cards

**Why safe:**

- Influence pacing and difficulty only
- Do not modify rules or card behavior
- Fully deterministic and replay-safe
- Already validated by the engine (`isNonNegativeInteger` in
  `matchSetup.validate.ts`)

**Typical feedback translation:**

> "2-player games feel slow"
> -> reduce `bystandersCount` in 2-player presets

---

### 2. Content Selection (Heroes / Villains / Schemes)

Selectable fields in `MatchSetupConfig` (composition block):

- `heroDeckIds` -- hero decks available in HQ and player decks
- `villainGroupIds` -- villain groups in the villain deck
- `henchmanGroupIds` -- henchman groups in the villain deck
- `schemeId` -- scheme for this match
- `mastermindId` -- mastermind for this match

**Why safe:**

- Selection, not behavior
- All IDs validated against the card registry at setup time
- Replays record the resolved composition, not the selection intent

**Rule:**

> Selection may vary; execution may not.

---

## Tier 2 -- Safe with Guardrails (Expose Deliberately)

These knobs are safe **if constrained and documented**.

### 3. Player-Count-Aware Presets

Presets may produce different match setups based on `playerCount`.

**Important distinction:**

- Presets generate a `MatchSetupConfig` (composition)
- Presets are **not** part of `MatchSetupConfig` or the match setup envelope
- Replays store the resolved composition, not the preset identifier

**Guardrail:**

> Presets must never inject conditional logic into gameplay.
> The engine receives the same 9-field composition regardless of how it
> was generated.

Example (forbidden):
"If playerCount === 2, heroes draw an extra card each turn."
This is a rule change disguised as a preset -- it belongs in the engine
with a decision record, not in a configuration surface.

---

### 4. Expansion Pool Selection

Envelope field (per D-1247):

- `expansions` -- restricts available content pool

**Why safe:**

- Restricts which content IDs are valid for composition selection
- Does not alter rules or card behavior
- Registry validation enforces that all composition IDs belong to
  enabled expansions

**Typical feedback translation:**

> "Too many keywords for new players"
> -> restrict expansion pool to `["base"]`

---

## Tier 3 -- Gated / Informational (Document Now, Enable Later)

These knobs are safe conceptually but not fully wired yet.

### 5. Deterministic Seed

Envelope field:

- `seed` -- deterministic random seed

**Current state (per D-1248):**

- Seed is captured and stored in the match setup envelope
- boardgame.io manages its own PRNG internally via `ctx.random`
- Seed-to-PRNG wiring is a future integration task
- Seed currently serves as a replay/simulation matching identifier

Until seed wiring is complete, seed must not be treated as an active
gameplay control.

**Rule:**

> Seed must never alter rules or execution logic.

---

### 6. Theme-Generated Defaults (Not Overrides)

Envelope field:

- `themeId` -- optional narrative intent (non-authoritative per
  MATCH-SETUP-SCHEMA.md)

Themes may:

- recommend composition (suggest hero/villain/scheme combinations)
- generate presets (produce a complete `MatchSetupConfig`)

Themes must **never**:

- override rules
- change scoring
- alter card semantics
- inject values that bypass composition validation

**Rule:**

> Themes influence setup selection, never execution.
> Themes suggest; match setup decides. (MATCH-SETUP-SCHEMA.md)

---

## Explicitly Non-Configurable Surfaces (Not Safe Knobs)

The following may **not** be adjusted via customer configuration.
Changes to these require an engine modification and a `DECISIONS.md` entry.

- Turn structure (`start` -> `main` -> `cleanup`; per `.claude/skills/legendary-game-engine/SKILL.md`)
- Rule execution order (priority ascending, then id lexical; per D-1231)
- Keyword behavior (card text interpretation)
- Scoring formulas (frozen per `12-SCORING-REFERENCE.md`)
- Victory and loss conditions (per D-1235, D-1236, D-1237)
- Move legality and stage gating (per D-1223)
- Randomness resolution logic (`ctx.random` only; per D-0002)
- Phase sequence (`lobby` -> `setup` -> `play` -> `end`)

Any customer request affecting these areas is **not a tuning request** --
it is a product or rules decision that must go through governance.

---

## Handling Customer Feedback

Customer feedback should be normalized into configuration impacts:

| Customer Feedback | Safe-Knob Translation |
|---|---|
| "Games take too long" | Adjust count fields (Tier 1) |
| "Too swingy" | Restrict content selection (Tier 1) |
| "Hard for new players" | Curated presets with limited expansions (Tier 2) |
| "2-player feels off" | Player-count-aware presets (Tier 2) |
| "I want to replay the same game" | Seed capture (Tier 3, future wiring) |
| "Too many unfamiliar cards" | Restrict expansion pool (Tier 2) |

If feedback cannot be expressed via a safe knob, it is **not a tuning
request** -- it is a product or rules decision.

---

## Compatibility Intent

Safe knobs are expected to evolve. Where possible:

- changes should remain backward-compatible
- existing match setups should continue to replay correctly
- presets may change, but resolved compositions must not
- new knobs require `schemaVersion` bump if they change the
  `MATCH-SETUP-JSON-SCHEMA.json` structure (per extensibility rules
  in MATCH-SETUP-SCHEMA.md)
- existing match setups stored in replays are immutable and must
  always remain loadable

---

## Summary

Safe knobs allow Legendary Arena to:

- iterate rapidly on balance
- incorporate customer feedback safely
- protect engine stability
- preserve replay and simulation guarantees

> **Tune with data.
> Decide with governance.
> Change rules deliberately.**

---

## Cross-References

- `MATCH-SETUP-SCHEMA.md` -- authoritative setup contract
- `MATCH-SETUP-JSON-SCHEMA.json` -- machine-enforceable schema
- `MATCH-SETUP-VALIDATION.md` -- enforcement boundaries
- `THEME-SCHEMA.md` -- theme intent and constraints
- `DECISIONS.md` -- D-1244 (composition alignment), D-1247 (two-layer
  structure), D-1248 (seed wiring gap)
- `.claude/skills/legendary-game-engine/SKILL.md` -- engine invariants
- `12-SCORING-REFERENCE.md` -- frozen scoring surface
