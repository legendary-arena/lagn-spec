# PACKET-TEMPLATE.md — Mandatory Structure for All Work Packets

> **This file is the authoritative template for every work packet in
> `docs/ai/work-packets/`. Copy it in full, fill in the `[...]` placeholders,
> and delete this instruction block before saving the packet.**
>
> Every section is mandatory. Do not omit sections or merge them.
> Section ordering is fixed.
>
> **Before using this template, confirm:**
> - `docs/ai/ARCHITECTURE.md` has been read (it overrides anything in the packet)
> - `docs/ai/work-packets/WORK_INDEX.md` Notes for dependent WPs have been read
> - No external URLs (SharePoint, OneDrive, PowerBI) appear anywhere in the packet
>   — replace all of them with local file references before saving

---

# WP-[NNN] — [Short Title]

**Status:** Ready
**Primary Layer:** [Game Engine / Contracts | Game Engine / Implementation | Server | etc.]
**Dependencies:** WP-[NNN], WP-[NNN]
**User-Visible Surface:** [play.legendary-arena.com | cards.legendary-arena.com | dashboard | wiki | **none — infrastructure** (refactor / tooling / contract / behavior-identical change; no user-observable difference)]

> Pick exactly one. This is not cosmetic — it determines the Definition of Done
> (see `## User-Visible Impact` and the conditional gate in `## Definition of Done`).
> A behavior-identical refactor, a coverage gate, an internal contract, or an
> engine change a player cannot perceive is **`none — infrastructure`**; say so
> plainly rather than implying visible progress. (D-24026)

---

## Session Context

> Provide one sentence that names the most relevant prior work Claude needs to
> keep in mind while reading this packet. Pull from WORK_INDEX.md Notes.
> This prevents Claude from re-deriving conventions that are already locked.
>
> Example: "WP-009A/009B established the HookDefinition + ImplementationMap
> pipeline; WP-010 locked the ENDGAME_CONDITIONS counter contract; this packet
> builds on both without modifying their outputs."

[One sentence. Reference specific WP numbers and what they locked. Do not
describe this packet's own goal here — that belongs in ## Goal.]

---

## Goal

[One paragraph. Describe what `@legendary-arena/game-engine` (or the relevant
package) can do after this session that it could not do before. Be concrete:
name the specific exports, behaviors, or states that will exist.]

---

## User-Visible Impact

> One short paragraph, written for the operator (not the engineer). After this
> packet ships and deploys, what does a **player** (play.legendary-arena.com), a
> **visitor** (cards.legendary-arena.com), or an **operator** (dashboard) see or
> experience differently? Name the concrete surface and interaction.
>
> If the honest answer is "nothing a human can observe," write exactly:
> **"None — infrastructure. No user-observable change; this packet's payoff is
> [cheaper future work / a regression gate / a contract other packets build on]."**
> That is a legitimate and common answer — but it MUST be stated, so a run of
> infrastructure packets is never mistaken for visible progress. (D-24026)

[What a player / visitor / operator sees differently — or the explicit
"None — infrastructure" statement above.]

---

## Assumes

> List only the specific prior work Claude must verify before writing a single
> line. Reference exact exported names and file paths where possible.

- WP-[NNN] complete. Specifically:
  - `packages/game-engine/src/[path].ts` exports `[SpecificThing]` ([WP-NNN])
  - `packages/game-engine/src/[path].ts` exports `[SpecificThing]` ([WP-NNN])
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists (created in WP-013)

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

> List every file Claude must read before writing a single line.
> ARCHITECTURE.md is always first. No external URLs — local paths only.
> Replace any SharePoint/OneDrive/PowerBI links with local file references
> (e.g., `data/metadata/card-types.json` instead of a SharePoint link to it).

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Section [N]` — read `[subsection name]`. This
  documents [what the section contains and why it matters for this packet].
  [Add more ARCHITECTURE.md references as needed. Every packet must reference
  at least one specific section and subsection.]
- `packages/game-engine/src/[relevant-file].ts` — read it entirely before
  modifying. [Explain why — what prior work does it contain that this packet
  must not break?]
- `docs/ai/REFERENCE/00.2-data-requirements.md §[N]` — [what constraint or
  data shape does this section define that is relevant here?]
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable
  constraints: no DB queries in move functions; all moves must be deterministic;
  `ctx.random.*` is the only permitted randomness source.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix), Rule 11
  (full-sentence error messages), Rule 13 (ESM only), Rule 14 (field names
  match data contract).
- [Add references to specific local data files where needed, e.g.:]
  `data/metadata/card-types.json` — confirm exact slug strings before naming
  any trigger, type, or constant that maps to a card type.

---

## Non-Negotiable Constraints

> This section replaces the old free-form `## Contract` section. It is a flat
> bullet list using "never" / "must" language. Pre-filled items below apply to
> every game-engine packet and must not be removed. Add packet-specific items
> after the divider.

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- [Add constraints specific to this packet. Examples:]
- All [zone/counter/hook] references use the constants from [specific file] —
  never string literals
- `[specific file from a prior packet]` must not be modified — it is a locked
  contract
- Every call to `ctx.events.[endTurn|setPhase]()` must have a `// why:` comment
- [etc.]

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human
  before proceeding — never guess or invent field names, type shapes, or file
  paths

**Locked contract values (inline the relevant ones — do not paraphrase or
re-derive from memory; delete rows that do not apply to this packet):**

> These are the locked values most likely to be mistyped or re-derived
> incorrectly. Paste them verbatim into the packet so Claude never has to
> navigate to another file for a short constant or field name.

- **MatchSetupConfig fields** (any packet touching setup or validation):
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`,
  `sidekicksCount`

- **Phase names** (any packet touching boardgame.io phases):
  `'lobby'` | `'setup'` | `'play'` | `'end'`

- **TurnStage values** (any packet touching stage gating or turn loop):
  `'start'` | `'main'` | `'cleanup'`

- **PlayerZones keys** (any packet touching player zones):
  `deck` | `hand` | `discard` | `inPlay` | `victory`

- **GlobalPiles keys** (any packet touching global piles):
  `bystanders` | `wounds` | `officers` | `sidekicks`

- **MoveError shape** (any packet defining or using validators):
  `{ code: string; message: string; path: string }`

- **ENDGAME_CONDITIONS keys** (any packet incrementing endgame counters):
  `ESCAPED_VILLAINS = 'escapedVillains'`,
  `SCHEME_LOSS = 'schemeLoss'`,
  `MASTERMIND_DEFEATED = 'mastermindDefeated'`

- **legendary.\* namespace** (any packet touching PostgreSQL or migrations):
  All tables live in the `legendary.*` schema (e.g., `legendary.rules`,
  `legendary.sets`). PKs use `bigserial`. Cross-service IDs use `ext_id text`.

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection. Logging, breakpoints, or "printf debugging"
are not acceptable debugging strategies.

The following requirements are mandatory:

- Behavior introduced by this packet must be fully reproducible given:
  - identical setup configuration
  - identical RNG seed (if applicable)
  - identical ordered inputs or moves

- Execution must be externally observable via deterministic state changes.
  Invisible or implicit side effects are not permitted.

- This packet must not introduce any state mutation that:
  - cannot be inspected post-execution, or
  - cannot be validated via tests or replay analysis.

- The following invariants must always hold after execution:
  - runtime state remains JSON-serializable
  - packet-owned zones, counters, or fields contain no invalid entries
  - no cross-packet state is mutated outside declared scope

- Failures attributable to this packet must be localizable via:
  - violation of declared invariants, or
  - unexpected mutation of packet-owned state

- When execution performs non-obvious behavior,
  at least one human-readable entry SHOULD be appended to `G.messages`
  to support replay inspection and debugging.

---

## Scope (In)

> Describe exactly what Claude must create or modify, organized by file or
> sub-task. Use subsection headers (A, B, C...) for readability. Be explicit
> about function signatures, type shapes, and `// why:` comment requirements.
> Avoid prose that describes intent without specifying the concrete output.
>
> If this packet defines any canonical constant array (e.g., `MATCH_PHASES`,
> `TURN_STAGES`, `CORE_MOVE_NAMES`, `RULE_TRIGGER_NAMES`, or any similar
> locked set of values), a drift-detection test is required in the test file:
> assert the array contains exactly the expected values. Add a `// why:`
> comment on the test: failure here means a value was added to the type but
> not the array, or vice versa.

### A) [First deliverable — new or modified file]
- **`src/[path]/[file].ts`** — [new | modified]:
  - `[functionOrTypeName]([signature]): [returnType]` — [what it does]
  - Add `// why:` comment on [specific decision that needs explanation]
  - [etc.]

### B) [Second deliverable]
- [...]

### C) Tests
Add `node:test` tests in `src/[path]/[file].test.ts`:
- [What each test proves. Be specific about the assertion, not just the scenario.]
- All trigger/constant drift tests: `[CONSTANT_ARRAY]` contains exactly
  `[N]` expected values
- `JSON.stringify(G)` succeeds after every state-mutating operation
- Does not import from `boardgame.io` or `boardgame.io/testing`
- Uses `makeMockCtx` from `src/test/mockCtx.ts`

---

## Out of Scope

> Be specific. Name the mechanics, files, or behaviors that are NOT part of
> this packet, especially things that might seem adjacent.

- No [specific mechanic] — that is [WP-NNN]
- No [related file] modifications — it is a locked contract from [WP-NNN]
- No database, network, or filesystem access in any helper
- No server or UI changes
- Refactors, cleanups, or "while I'm here" improvements are **out of scope**
  unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

> Complete list. Every file is either `**new**` or `**modified**`. No other
> files may be modified.

- `packages/game-engine/src/[path]/[file].ts` — **new** — [one-line description]
- `packages/game-engine/src/[path]/[file].ts` — **modified** — [what changes]
- `packages/game-engine/src/[path]/[file].test.ts` — **new** — `node:test` coverage

No other files may be modified.

---

## Acceptance Criteria

> Binary checklist. Every item must be pass/fail — no partial credit.
> Group by sub-task to match Scope sections.

All items must be binary pass/fail. No partial credit.

### [Sub-task A name]
- [ ] [Specific, verifiable assertion. Name the exact export, field, value, or
      behavior being checked.]
- [ ] [e.g.] `src/[path]/[file].ts` exports `[TypeName]` with exactly
      [N] fields: [field1], [field2], [field3]
- [ ] `[functionName]` returns `{ ok: false }` when [specific invalid input]
- [ ] No `throw` statement in `[filename]`
      (confirmed with `Select-String`)
- [ ] No import from `boardgame.io` in `[filename]`
      (confirmed with `Select-String`)

### [Sub-task B name]
- [ ] [...]

### Tests
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (all test files)
- [ ] Drift test: `[CONSTANT_ARRAY]` contains exactly `[N]` expected values
- [ ] `JSON.stringify(G)` succeeds — confirmed by integration test
- [ ] Test file does not import from `boardgame.io`
- [ ] Test uses `node:test` and `node:assert` only
- [ ] Test uses `makeMockCtx` from `src/test/mockCtx.ts`

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)

---

## Verification Steps

> Step 1 is always the build command. Step 2 is always the full test run.
> Subsequent steps are packet-specific Select-String or curl checks.
> Every code block must be properly fenced with triple backticks.
> Every command shows its expected output as a comment.

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all tests
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — confirm [specific constraint, e.g. no throw in validator]
Select-String -Path "packages\game-engine\src\[path]\[file].ts" -Pattern "throw "
# Expected: no output

# Step 4 — confirm [specific constraint, e.g. no boardgame.io import]
Select-String -Path "packages\game-engine\src\[path]\[file].ts" -Pattern "boardgame.io"
# Expected: no output

# Step 5 — confirm no Math.random (if randomness is in scope)
Select-String -Path "packages\game-engine\src" -Pattern "Math.random" -Recurse
# Expected: no output

# Step 6 — confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

> Claude Code must execute every verification command in `## Verification Steps`
> before checking any item below. Reading the code is not sufficient — run the
> commands.
>
> Every item must be true before this packet is considered complete.
> The last three items (STATUS.md, DECISIONS.md, WORK_INDEX.md) are mandatory
> for every packet without exception.
>
> **"Done" means observable, not merged.** Green tests + a merged PR are
> NECESSARY but, for any packet whose `## User-Visible Surface` is NOT
> `none — infrastructure`, NOT SUFFICIENT. A user-facing packet is done only
> when the change is confirmed **live on its named surface** — see the
> conditional gate below. (D-24026)

This packet is complete when ALL of the following are true:

- [ ] **User-visible verification (CONDITIONAL on `## User-Visible Surface`):**
  - If the surface is **not** `none — infrastructure`: the change is confirmed
    **live on the named deployed surface** — a real match on
    play.legendary-arena.com, the deployed cards/dashboard page, etc. — with
    observable evidence captured (a screenshot, an observed behavior, or a
    deploy-confirmed commit SHA serving the change). Tests that prove behavior
    identity or correctness are necessary but do NOT satisfy this item.
  - If the surface **is** `none — infrastructure`: the `docs/ai/STATUS.md` entry
    states plainly **"No user-observable change — infrastructure only"** (with
    the payoff named), so a run of such packets is never read as visible progress.

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (all test files)
- [ ] [Packet-specific DoD items, e.g.:]
- [ ] No `throw` in `[specific file]` (confirmed with `Select-String`)
- [ ] No `Math.random` in any new or modified file (confirmed with `Select-String`)
- [ ] No `boardgame.io` import in `[specific pure helper file]` (confirmed with
      `Select-String`)
- [ ] WP-[NNN-1]A outputs (`[file1].ts`, `[file2].ts`) were not modified
      (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — what [capability] is now available; what
      a match can do at the end of this packet that it could not before
- [ ] `docs/ai/DECISIONS.md` updated — at minimum: [name the specific decisions
      this packet makes that are not obvious, e.g. "why X uses Y approach rather
      than Z approach"]
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-[NNN] checked off with today's date
