# Code Style & Conventions — Claude Enforcement Rules

This file defines **enforceable code-style rules for AI-assisted development**.

If a code-style rule conflicts with system architecture, data flow,
or persistence boundaries, **`docs/ai/ARCHITECTURE.md` is authoritative and wins**.

This file must never override architectural constraints.

Code-style rules must not violate architectural layer boundaries defined in
**`docs/ai/ARCHITECTURE.md` -- "Layer Boundary (Authoritative)"**.

Style preferences never override layer responsibility.

Its purpose is to prevent architectural drift and common AI failure modes.

This file does NOT replace:
- `docs/ai/ARCHITECTURE.md` (system design & boundaries)
- `docs/ai/REFERENCE/00.6-code-style.md` (human-facing style guide with examples)

For detailed examples and rationale, consult `00.6-code-style.md`.

---

## Rule Levels

- **Invariant** — must never be violated
- **Convention** — default unless explicitly justified and logged

All rules below are **Invariants unless stated otherwise**.

---

## Guiding Principle

All code must be readable and modifiable by a **junior developer** (1-2 years
experience). The goal is **human-style code: explicit, boring, and obviously
correct**. Clever code is a liability. When in doubt, write it out.

---

## Module System

- ESM-only — no CommonJS, no `require()`
- Use the `node:` prefix for all Node.js built-in imports
  (e.g., `import { readFile } from 'node:fs/promises'`)
- File extensions: `.mjs` for standalone scripts; `.js` acceptable in packages
  with `"type": "module"`; never `.cjs`
- No barrel re-exports, no `import * as` — import exactly what you use by name

Source: 00.6 Rules 9, 13

---

## Naming

- Full English words only — no abbreviations (except `i` in classic `for` loops)
- Forbidden abbreviations include: `cfg`, `vg`, `mm`, `sch`, `res`, `req`, `e`,
  `cb`, `fn`, `msg`, `ver`, `fix` — use descriptive replacements
- `G` and `ctx` are exceptions inside boardgame.io move functions only (framework
  requires these names); use descriptive names elsewhere
- Boolean names must start with `is`, `has`, or `can`
- Loop variables must be descriptive (`for (const villainGroup of villainGroups)`,
  not `for (const v of villainGroups)`)
- Field names in code must match `00.2-data-requirements.md` exactly — never
  rename, abbreviate, or "improve" canonical field names

Source: 00.6 Rules 4, 14

---

## Functions

- Each function should fit on one screen (~20-30 lines, not counting JSDoc)
- If longer, break into named sub-functions with descriptive names
- Every function must have a JSDoc comment
- No factory functions for one-time setup — build inline if only used once
- No higher-order functions (currying, closures-as-config) unless the framework
  (boardgame.io, Express) explicitly requires them

Source: 00.6 Rules 2, 5, 10

---

## Abstraction & Control Flow

- **Duplicate first, abstract only when a third copy appears** — a wrong
  abstraction is harder to maintain than copy-paste
- No nested or chained ternaries — use `if/else if/else` blocks
- No dynamic property access for known keys — write out property names explicitly
- No `Array.reduce()` for multi-step operations with branching logic — use
  explicit `for...of` loops with descriptive variables
- `.reduce()` is acceptable only for simple accumulation (summing, joining)

Source: 00.6 Rules 1, 3, 7, 8

---

## Comments

- Comments explain **WHY**, not **WHAT** — do NOT restate code
- Every `ctx.events.setPhase()` call requires a `// why:` comment
- Every `ctx.events.endTurn()` call requires a `// why:` comment
- `// why:` comments are also required for:
  - Constants whose values are not self-evident
  - Catch blocks that swallow errors instead of re-throwing
  - `HEAD` requests where `GET` might seem more natural
  - CJS path checks in an ESM project
  - `process.env.APPDATA` usage (Windows-specific)
  - Any use of `ctx.random.*`

Source: 00.6 Rule 6

---

## Error Handling

- Error messages must be **full sentences** including:
  1. What failed (entity name, field, or operation)
  2. What to check or do (where possible)
- Single-word or terse error messages are forbidden
- Every `async` function doing I/O must handle errors explicitly with try/catch
- Never swallow errors silently — if intentionally ignored, a `// why:` comment
  is required explaining why it is safe
- Never let errors bubble up without context

Source: 00.6 Rules 11, 15

---

## File Structure [Convention]

- Flat file structure — avoid deeply nested folder hierarchies
- New modules go in the most obvious existing folder
- Do not create a new sub-folder for a single file

Source: 00.6 Rule 12

---

## Testing

- Test runner: `node:test` (native Node.js)
- Test files: `*.test.ts` (never `.test.mjs`)
- `makeMockCtx` reverses arrays (proves shuffle ran)
- No `boardgame.io/testing` imports — use `makeMockCtx`
- No live server required for unit tests
- Tests must fail loudly on invariant violation — silent passes are bugs

---

## Drift Detection

- The following are **canonical readonly arrays**:
  - `MATCH_PHASES`
  - `TURN_STAGES`
  - `CORE_MOVE_NAMES`
  - `RULE_TRIGGER_NAMES`
  - `RULE_EFFECT_TYPES`
  - `REVEALED_CARD_TYPES`
- Drift-detection tests must assert arrays exactly match their union types
- Never update a union type without updating its canonical array
- Never update a canonical array without updating its union type
- Adding a new phase, stage, move, trigger, effect, or card type requires updating BOTH

---

## Pure Helpers (No boardgame.io Imports)

A **pure helper** is:
- Deterministic
- Side-effect free
- Independently testable
- Has no `boardgame.io` import
- Performs no I/O

The following files must never import `boardgame.io`:
- `zoneOps.ts` — zone mutation helpers
- `turnPhases.logic.ts` — stage ordering
- `zones.validate.ts` — zone shape validators
- All files under `src/rules/` — rule hooks and execution

---

## Data Contracts

- `MatchSetupConfig` has **9 locked fields**:
  - `schemeId`
  - `mastermindId`
  - `villainGroupIds`
  - `henchmanGroupIds`
  - `heroDeckIds`
  - `bystandersCount`
  - `woundsCount`
  - `officersCount`
  - `sidekicksCount`
- Do not rename, abbreviate, or add fields
- The 9-field lock applies specifically to the **composition block**
  (`MatchSetupConfig`). The match-setup **envelope** is extensible per
  `MATCH-SETUP-SCHEMA.md §Extensibility Rules` and currently includes
  the additive optional field `heroSelectionMode` (introduced in
  WP-093; see `DECISIONS.md` D-9301). This clarification does not
  alter the composition lock.
- If a field name in `00.2` seems wrong, STOP — raise it as a question, update
  `00.2` first with a `DECISIONS.md` entry, then update code
- Zones contain **CardExtId strings only** — never full card objects
- `CardExtId = string` is a named type alias, not a plain string

---

## Contract Files

- B-packets must NOT modify A-packet contract files (drift prevention)
- Contract files (`.types.ts`, `.validate.ts`, `.gating.ts`) are locked once created
- Any contract change requires:
  - Architecture review
  - `DECISIONS.md` entry

---

## Patterns to Avoid (Non-Negotiable)

- Never use `.reduce()` in zone operations or effect application
- Never hardcode stage, phase, trigger, effect, or counter strings — use constants
- Never infer state from UI models or projections
- Never optimize for brevity over determinism or clarity

For architectural constraints (G serialization, persistence, determinism,
phase/turn transitions), see `.claude/rules/architecture.md` and
`.claude/skills/legendary-game-engine/SKILL.md`.


---

## When Unsure — STOP

If a change appears to:
- Modify a contract file
- Alter a canonical array
- Introduce a new phase, stage, trigger, or effect
- Blur engine vs helper boundaries
- Touch persistence or snapshot logic

STOP and consult:
- `ARCHITECTURE.md`
- `WORK_INDEX.md`
- `DECISIONS.md`

Do not guess. Do not "fill in the gap".
