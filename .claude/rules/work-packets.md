# Legendary Arena — Claude Rules: Work Packets

This file governs **how Claude may interact with the Work Packet system**.
It does **not** define the packets themselves.

The authoritative source of Work Packet content, order, status, and dependencies
is:

- `docs/ai/work-packets/WORK_INDEX.md`

This file exists solely to enforce correct behavior during
AI-assisted development sessions.

Work Packet execution must respect layer ownership as defined in
**`docs/ai/ARCHITECTURE.md` -- "Layer Boundary (Authoritative)"**.

No Work Packet may redefine layer responsibilities.

---

## Authority & Source of Truth

In all cases:

- WORK_INDEX.md is authoritative for:
  - Which Work Packets exist
  - Execution order and dependencies
  - Review status
  - Completion state
- This file **must never restate packet content or status**
- Claude must always consult WORK_INDEX.md before:
  - Starting a session
  - Selecting a packet
  - Claiming readiness to execute work

If any conflict exists, **WORK_INDEX.md wins**.

---

## Core Invariants (Non-Negotiable)

### One Packet per Session
- Exactly **one Work Packet per Claude Code session**
- Claude must never combine work from multiple packets in one session
- If work spans packets, stop and hand off to the next packet explicitly

Source: WORK_INDEX.md, Format Rules

### Dependency Discipline
- A Work Packet may not be executed until **all listed dependencies are complete**
- Parallel execution is allowed **only if explicitly documented as parallel-safe**
- Claude must verify dependency completion in WORK_INDEX.md before starting

Never assume dependencies are met.

Source: WORK_INDEX.md (dependency chain + parallel-safe notes)

### Review Gate
- Any packet marked **Needs review** must NOT be executed by Claude
- Review is a prerequisite to execution, not an optional step
- Claude may participate in review, but may not execute unreviewed packets

Source: WORK_INDEX.md, Review Status Legend

### Status Updates
- Packet status is updated **only when Definition of Done is fully met**
- Partial completion does not permit status changes
- Claude must not "pre-mark" or "optimistically mark" packets complete

Status updates belong in WORK_INDEX.md only.

---

## Foundation Prompts Rule

- Foundation Prompts (00.4 -> 00.5 -> 01 -> 02) are **not Work Packets**
- They must be run **once**, in order, before WP-002 may execute
- If any Foundation Prompt fails, Claude must stop

Source: WORK_INDEX.md, Foundation Prompts

---

## Prohibited Behaviors [Guardrail]

Claude must never:

- Invent a new Work Packet without updating WORK_INDEX.md first
- Execute a packet not listed in WORK_INDEX.md
- Modify historical Work Packets marked complete
- Skip dependency checks "because it probably works"
- Update packet status outside WORK_INDEX.md
- Merge A-packet contract changes into B-packets
- Relitigate conventions already settled and documented
- Use chat history as authoritative memory instead of repo docs

When unsure, stop and ask -- never guess.

---

## Conventions Are Locked

The conventions listed in WORK_INDEX.md are **settled decisions**.
Claude must enforce them without re-debate unless DECISIONS.md is explicitly updated.

Examples (non-exhaustive):
- Zones store CardExtId strings only
- `Game.setup()` may throw; moves never throw
- No boardgame.io imports in pure helpers
- `.test.ts` is the only valid test extension
- Prior packet contract files must not be modified

Source: WORK_INDEX.md, Conventions Established Across WPs

---

## API Catalog Update Obligation (per D-11804)

Any Work Packet that adds, modifies, removes, or changes the status of an
HTTP endpoint exposed by `apps/server`, OR that adds, modifies, removes, or
changes the status of a library function reachable via direct import from
`apps/server/src/**` recorded in the catalog as `Library-only`, MUST update
`docs/ai/REFERENCE/api-endpoints.md` in the same commit. The affected row
is replaced **entirely** (no partial-column updates per D-11804
replace-whole-row merge semantics — partial-update is FAIL). Closed sets
are enforced: `Status` ∈ `{ Wired, Shipped-but-unwired, Library-only,
Pending }`; `Auth` ∈ `{ guest, handle-required,
authenticated-session-required }` (per D-9905). Canonical field names in
request and response schemas match
`docs/ai/REFERENCE/00.2-data-requirements.md` exactly. The companion
draft-time gate is `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §21`;
both gates must pass.

---

## Adding or Extending Work Packets

Claude may assist only if **all** of the following are done:

1. Packet file created using the canonical template (00.1)
2. Packet added to WORK_INDEX.md in the correct phase *before execution*
3. Dependencies explicitly listed
4. Lint checklist (00.3) passes

If any step is missing, Claude must stop.

---

## Invocation Artifacts (Commit Policy)

Files under `docs/ai/invocations/` and `docs/ai/session-context/` follow
two different commit dispositions. The rule exists to keep governance
artifacts separable from working memory.

| File pattern | Disposition |
|---|---|
| `docs/ai/session-context/session-context-wp*.md` | **Committed** governance artifact. Captures the reconciled state at session start; future sessions read it. |
| `docs/ai/invocations/preflight-*.md` | **Scratchpad by default. Not committed** unless an EC or WP explicitly cites it as a normative input or output. |
| `docs/ai/invocations/copilot-*.md` | **Scratchpad by default. Not committed** (same reason). |
| `docs/ai/invocations/session-*.md` | **Scratchpad by default. Not committed** unless cited normatively (e.g., as the canonical session-prompt artifact for an EC). Applies to both WP-scoped sessions (`session-wp137-...md`) and ad-hoc operator sessions (`session-claude-branch-cleanup.md`). |

**Why scratchpad-by-default:** preflight, copilot, and session-prompt
invocation files behave like REPL transcripts and compiler logs — they
help the executor that day, but rarely carry information that future
WPs depend on. The reconciled session-context file is the artifact
future WPs read.

**Enforcement:** `.gitignore` excludes the three scratchpad patterns
under `docs/ai/invocations/`. Already-tracked files from earlier WPs
are unaffected (gitignore applies only to untracked files); they remain
in history but are not the convention going forward.

**Override:** if a specific WP or EC needs an invocation file as a
normative artifact (e.g., a copilot conversation cited verbatim by the
EC for traceability), commit it via `git add -f <path>` and document
the override in the WP / EC body. Otherwise, do not retro-commit.

---

## Final Rule

WORK_INDEX.md is the execution spine of the project.

Claude's role is to:
- Read it
- Respect it
- Enforce it

Not to reinterpret or replace it.
