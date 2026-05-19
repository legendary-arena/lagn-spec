## Prompt — Standardized Work Packet Completeness Check (MVP Gate)

**FULL CONTENTS MODE**

You are operating inside the Legendary Arena AI coordination system.

Your task is to perform a **Standardization Completeness Pass** over all existing
Work Packets (WPs) to determine whether the MVP design phase is **provisionally complete**.

This task is **analysis and reporting only**.
Do NOT create new Work Packets.
Do NOT modify existing Work Packets.
Do NOT execute Foundation Prompts.

---

## Authority Hierarchy (Non-Negotiable)

You MUST enforce this hierarchy during the completeness check:

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` (including Layer Boundary)
3. `.claude/rules/*.md`
4. `docs/ai/work-packets/WORK_INDEX.md`
5. Existing Work Packets
6. `docs/ai/REFERENCE/*`

If any artifact contradicts a higher-authority document, that is a finding.

---

## Authoritative Definition: "Standardized Work Packets"

For the purposes of this task, **all Work Packets are considered standardized**
*only if every condition below is true*:

- They conform to `docs/ai/work-packets/PACKET-TEMPLATE.md`
- They are indexed and dependency-ordered in `docs/ai/work-packets/WORK_INDEX.md`
- They are marked `✅ Reviewed` in WORK_INDEX.md (not `⚠️ Needs review`)
- All cross-cutting invariants are captured in:
  - `docs/ai/ARCHITECTURE.md`
  - `docs/ai/DECISIONS.md`
  - `docs/ai/DECISIONS_INDEX.md`
- The governance enforcement layer (`.claude/rules/*.md`) is consistent with
  ARCHITECTURE.md and does not contradict any WP
- The Lint Gate in `.claude/CLAUDE.md` correctly references
  `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`
- No packet relies on tacit knowledge (e.g., "we'll remember this later")
- Packet boundaries are stable (no implicit ownership or blurred responsibility)

If and only if all of the above are true, **design is provisionally complete
for the MVP scope**.

---

## Inputs (Authoritative Sources)

You must treat the following as the **only authoritative inputs**:

| Source | Path |
|---|---|
| Work Packets | `docs/ai/work-packets/WP-*.md` |
| Work Index | `docs/ai/work-packets/WORK_INDEX.md` |
| Packet Template | `docs/ai/work-packets/PACKET-TEMPLATE.md` |
| Architecture | `docs/ai/ARCHITECTURE.md` |
| Decisions | `docs/ai/DECISIONS.md` |
| Decisions Index | `docs/ai/DECISIONS_INDEX.md` |
| Claude Config | `.claude/CLAUDE.md` |
| Rules Files | `.claude/rules/*.md` (all 7 files) |
| REFERENCE Docs | `docs/ai/REFERENCE/00.1` through `00.6`, `01`, `02` |

---

## Analysis Tasks (Required)

You MUST perform the following checks:

### 1. Template Conformance Check

For each WP:
- Verify it follows `PACKET-TEMPLATE.md` section order exactly
- Required sections: Session Context, Goal, Assumes, Context (Read First),
  Non-Negotiable Constraints, Scope (In), Out of Scope, Files Expected to
  Change, Acceptance Criteria, Verification Steps, Definition of Done
- Identify any missing required sections
- Identify any legacy or non-standard sections (e.g., `## Contract`,
  `## Design Principle (Locked)`, `## Close-Out Updates`)
- Verify test files use `.test.ts` (never `.test.mjs`)
- Verify verification steps use `pnpm` commands (never `node --test <file>`)

### 2. Index & Dependency Check

- Verify every WP file has a corresponding entry in `WORK_INDEX.md`
- Verify every WORK_INDEX entry has a corresponding WP file
- Confirm all entries are marked `✅ Reviewed` (not `⚠️ Needs review`)
- Confirm dependency order is acyclic and coherent
- Identify any implicit dependencies not recorded in the `Dependencies:` header
- Verify phase placement is correct for each WP

### 3. Cross-Cutting Invariant Check

- Identify any invariant stated in WPs but missing from:
  - `docs/ai/ARCHITECTURE.md`
  - `docs/ai/DECISIONS.md`
- Identify any invariant duplicated inconsistently across WPs
- Verify the "MVP Gameplay Invariants" section in ARCHITECTURE.md covers:
  - Endgame & Counters
  - Registry & Runtime Boundary
  - Zones, State & Serialization
  - Moves & Determinism
  - Economy vs Scoring
  - Data Representation Before Execution
  - Debuggability & Diagnostics
- Verify all `G` fields from WP-002 through WP-026 appear in the Field
  Classification Reference table

### 4. Governance Layer Consistency Check

- Verify `.claude/rules/*.md` files are consistent with ARCHITECTURE.md
  Layer Boundary section
- Verify each rules file has a Layer Boundary cross-reference
- Verify `.claude/CLAUDE.md` Lint Gate references are accurate
- Verify the Debuggability invariant is enforced across three layers:
  - `docs/ai/ARCHITECTURE.md` (invariant)
  - `.claude/skills/legendary-game-engine/SKILL.md` (runtime enforcement)
  - `docs/ai/work-packets/PACKET-TEMPLATE.md` (template section)
- Identify any drift between rules files and WP content

### 5. Tacit Knowledge Scan

Flag any WP that relies on:
- "Obvious" behavior without specification
- Unstated ordering rules
- Assumptions about future packets without explicit "Out of Scope" marking
- External URLs (SharePoint, PowerBI, OneDrive) — these are forbidden
- References to files or exports that don't exist in the dependency chain

### 6. Boundary Stability Check

For each WP, confirm:
- Clear ownership of state and behavior
- No overlap with responsibilities claimed by another WP
- No ambiguous "shared" responsibility without an architectural anchor
- Layer Boundary is respected (engine logic in engine, server wiring in server,
  registry data in registry)

---

## Output Requirements (Strict)

You must output, in order:

### 1. Summary Verdict

One of **only** the following statements:

- ✅ *"All Work Packets are standardized. MVP design is provisionally complete."*

OR

- ❌ *"Work Packets are NOT fully standardized. MVP design is NOT complete."*

No hedging language.

---

### 2. Findings Table

A table with columns:

| WP | Issue Type | Description | Blocking? |
|----|-----------|-------------|-----------|

Issue Type must be one of:
- Template non-conformance
- Missing index entry
- Missing invariant capture
- Governance drift
- Tacit knowledge reliance
- Boundary ambiguity
- External URL violation

Blocking = Yes / No

---

### 3. Required Remediations (If Any)

If the verdict is ❌, list:
- Exact files requiring updates
- Type of action required (standardize / clarify / promote invariant / remove
  external URL / fix governance drift)
- Whether a **new Work Packet** is required (default: **NO** unless provable)

You must justify any claim that a new WP is required.

---

### 4. Governance Layer Health

Regardless of verdict, report:
- Number of `.claude/rules/*.md` files with Layer Boundary references
  (expected: 7 of 7)
- Whether CLAUDE.md Lint Gate is accurate
- Whether ARCHITECTURE.md "MVP Gameplay Invariants" has all 7 subsections
- Whether DECISIONS.md and DECISIONS_INDEX.md are synchronized

---

### 5. Execution Readiness Statement

If and only if the verdict is ✅, conclude with:

> "All Work Packets are standardized and consistent with the governance layer.
> Foundation Prompt execution (00.4 -> 00.5 -> 01 -> 02) may proceed,
> followed by Work Packet execution in WORK_INDEX dependency order.
> No additional Work Packets are required to close MVP design."

---

## Prohibited Actions

You must NOT:
- Propose new features
- Suggest speculative Work Packets
- Modify scope definitions
- Collapse or merge existing WPs
- Execute Foundation Prompts
- Modify any files

This is a **gate check**, not a design session.

---

## Final Constraint

If uncertainty exists, err on the side of:
- ❌ NOT complete
- Explicitly stating what prevents completion

Begin the Standardization Completeness Pass now.
