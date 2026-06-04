# WP-208 — Registry Viewer `devLog` Category Union Extension (`cardPatterns` + `schemeTwist`)

**Status:** Ready
**Primary Layer:** Registry Viewer (`apps/registry-viewer/src/lib/devLog.ts`)
**Dependencies:** WP-183 (added `cardPatternsClient.ts` + `schemeTwistClient.ts` calling `devLog("cardPatterns", ...)` and `devLog("schemeTwist", ...)` but did not extend the `Category` literal union)

---

## Session Context

WP-183 added the `cardPatterns` and `schemeTwist` taxonomy clients to the registry viewer; both call `devLog(<category>, ...)` with new literal category names. WP-183 did not extend the `Category` literal union in `devLog.ts`, so `vue-tsc --noEmit` rejects every call site with TS2345 ("Argument of type X is not assignable to parameter of type 'Category'"). The Build Registry Viewer CI step has been red on every main commit since the WP-183 merge. This WP extends the union with the two missing literals and extends the audit-trail `// why:` comment above the union per the file's established convention (every prior extension — `"cardTypes"` via WP-086, `"cardAbilities"` via WP-125 — added one; the convention is locked by `DECISIONS.md` D-12501 §7). The source change is confined to one file (`devLog.ts`): the union line plus its audit-trail comment.

---

## Goal

After this session, the `Category` string-literal union in `apps/registry-viewer/src/lib/devLog.ts` includes `"cardPatterns"` and `"schemeTwist"`, and the audit-trail `// why:` comment above the union documents that extension (citing WP-183 as the mechanical-dependency origin and WP-086 / WP-125 as precedent, per D-12501 §7). `pnpm --filter registry-viewer typecheck` exits 0; the 15 TS2345 errors across `cardPatternsClient.ts` and `schemeTwistClient.ts` are resolved without any modification to either client file.

---

## Assumes (Hard-Gate Preconditions — MUST PASS BEFORE EDIT)

Run each command. If ANY produces output other than the stated expectation,
this packet is **BLOCKED** — STOP and report; do not edit.

```bash
# A. The two consumer clients exist (added by WP-183)
test -f apps/registry-viewer/src/lib/cardPatternsClient.ts && \
test -f apps/registry-viewer/src/lib/schemeTwistClient.ts && echo "A_OK"
# Expected: A_OK

# B. The clients call devLog with the two expected literals (and only those two)
grep -c 'devLog("cardPatterns"' apps/registry-viewer/src/lib/cardPatternsClient.ts
# Expected: 7
grep -c 'devLog("schemeTwist"'  apps/registry-viewer/src/lib/schemeTwistClient.ts
# Expected: 8

# C. The union does NOT yet contain either new literal
grep -E '"cardPatterns"|"schemeTwist"' apps/registry-viewer/src/lib/devLog.ts
# Expected: NO MATCH (empty output, grep exit 1)

# D. The union is currently the 7-member form ending in "cardAbilities"
grep -Fx 'type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities";' apps/registry-viewer/src/lib/devLog.ts
# Expected: exact match (one line)

# E. Typecheck is currently red with the 15 TS2345 errors
pnpm --filter registry-viewer typecheck
# Expected: exit != 0; TS2345 errors referencing "cardPatterns" / "schemeTwist"

# F. Governance docs exist
test -f docs/ai/DECISIONS.md && test -f docs/ai/ARCHITECTURE.md && echo "F_OK"
# Expected: F_OK
```

Reported call-site lines for reference (verify, don't trust): `cardPatternsClient.ts`
sites 71, 98, 105, 142, 183, 203, 231; `schemeTwistClient.ts` sites 40, 44, 83, 91,
116, 120, 142, 149 (per the CI report). If precondition B's counts differ, the CI
report is stale — STOP and reconcile before editing.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms `apps/registry-viewer` is its own layer (UI-only consumer of registry data); this WP touches a single dev-log utility inside it.
- `apps/registry-viewer/src/lib/devLog.ts` — read entirely. The `Category` union at line 20 is the canonical taxonomy of dev-log categories. The extension is purely additive (append two members to the union); no semantics change. Note the audit-trail `// why:` comment directly above the union (lines 14–19) documenting the prior `"cardAbilities"` extension and citing WP-086's `"cardTypes"` addition as precedent. This WP extends that comment for the two new members — do not drop or stale it.
- `docs/ai/DECISIONS.md §D-12501 §7` — establishes that the `Category` union is a **closed union** whose extension by each new `devLog`-consuming domain is a known mechanical dependency carrying an audit trail. WP-086 added `"cardTypes"`; WP-125 added `"cardAbilities"`. This WP (under the same lock) adds `"cardPatterns"` + `"schemeTwist"`. No new decision is created — the extension operates under the existing D-12501 §7 lock.
- `apps/registry-viewer/src/lib/cardPatternsClient.ts` — read enough to confirm all 7 call sites use the literal string `"cardPatterns"`. This is the consumer; the WP must not modify it.
- `apps/registry-viewer/src/lib/schemeTwistClient.ts` — read enough to confirm all 8 call sites use the literal string `"schemeTwist"`. Same: consumer-only, do not modify.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 14 (canonical field names). The two added union members preserve the existing camelCase + lowercase-first naming convention of the union.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.

---

## Scope (In)

- Extend the `Category` type alias in `apps/registry-viewer/src/lib/devLog.ts:20` from 7 members to 9 members by appending `"cardPatterns"` and `"schemeTwist"` (in that order, at the end of the union)
- Extend the audit-trail `// why:` comment above the union to document the two new members, per the file's established convention (see Change Constraint below)
- Verify `pnpm --filter registry-viewer typecheck` exits 0 after the extension
- Verify `pnpm --filter registry-viewer build` exits 0 after the extension

## Change Constraint (Confinement)

The source change MUST be confined to `apps/registry-viewer/src/lib/devLog.ts`,
and within that file to exactly two things:

1. The `Category` union line — append `"cardPatterns"` and `"schemeTwist"`. It
   remains a **single physical line** (no line breaks, no trailing `|`, no
   reformatting of the existing members).
2. The audit-trail `// why:` comment directly above the union — extend it to
   document the two new members.

The `devLog` function signature, body, JSDoc, and imports must be **byte-identical**
pre/post. No whitespace-only or formatting-only changes anywhere else in the file.

Verify:

```bash
git diff --unified=0 apps/registry-viewer/src/lib/devLog.ts
# Expected: changes confined to the union line and its adjacent // why: comment;
# no hunks touching the devLog function, its JSDoc, or the imports.
```

## Out of Scope

- Modifying `cardPatternsClient.ts` or `schemeTwistClient.ts` in any way (the clients are correct; the union is stale)
- Modifying the `devLog` function signature or body (only the type alias changes)
- Reordering or renaming any existing `Category` member
- Extending the union to include any other literal not currently in use (e.g., do not preemptively add `"future-category"`; YAGNI)
- Adding tests, refactoring the dev-log infrastructure, or extracting the union to a shared types file
- Touching any other file under `apps/registry-viewer/src/` or any other package

---

## Files Expected to Change

- `apps/registry-viewer/src/lib/devLog.ts` — modified (extend `Category` union at line 20 by 2 literals)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status Ready → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status Ready → Done)

4 files total (1 source + 3 governance). No new DECISIONS.md entry — the `Category` union is a closed union whose per-domain extension is already locked as a known mechanical dependency by D-12501 §7. This WP executes that existing decision (as WP-086 and WP-125 did before it); it does not create a new one.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — N/A
- Never throw inside boardgame.io move functions — N/A
- Never persist `G`, `ctx`, or any runtime state — N/A
- `G` must be JSON-serializable at all times — N/A
- ESM only, Node v22+ — `devLog.ts` is already ESM; no change
- `node:` prefix on all Node.js built-in imports — N/A (no new imports added)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — preserve existing union formatting; no abbreviation
- Full file contents required for the modified file in the session output — no diffs, no snippets

**Packet-specific:**
- Read-only on `cardPatternsClient.ts` and `schemeTwistClient.ts` (the consumers are correct; only the union is stale)
- Read-only on `devLog` function signature and body (only the `Category` type alias changes)
- The two added literals use exact spelling: `"cardPatterns"` and `"schemeTwist"` (camelCase, lowercase-first, matching the existing union members `"cardTypes"` and `"cardAbilities"`)
- Append-only: the two new literals are appended AT THE END of the existing union, after `"cardAbilities"`. Do not reorder existing members.
- Extend the audit-trail `// why:` comment above the union to cover the two new members, per the file's established convention (WP-086 added `"cardTypes"`; WP-125 added `"cardAbilities"`; D-12501 §7 locks the closed-union audit-trail). The new note must cite WP-183 (the mechanical-dependency origin) and the WP-086 / WP-125 precedent. Preserve the existing `"cardAbilities"` provenance lines — append, do not overwrite.
- The extension is purely additive: existing call sites with any of the 7 prior literals continue to typecheck

**Session protocol:**
- If the `Category` union already includes `"cardPatterns"` or `"schemeTwist"`: STOP and report (a parallel fix has landed).
- If either `cardPatternsClient.ts` or `schemeTwistClient.ts` uses a literal other than the two expected (`"cardPatterns"` / `"schemeTwist"`): STOP and ask — the WP scope assumes the union extension matches the consumer literals exactly.
- If the `devLog` function signature has changed since the CI report (e.g., refactored to take an enum instead of a string literal union): STOP and report; the WP is out of date.

**Locked contract values:**
- New union members: `"cardPatterns"` and `"schemeTwist"` (exact spelling, in that order)
- Append position: after `"cardAbilities"` (the current last member)
- Final union member count: 9 (7 prior + 2 new)
- File modified: exactly one source path — `apps/registry-viewer/src/lib/devLog.ts`
- Exact final union line (byte-for-byte, single physical line):
  ```ts
  type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";
  ```
- Audit-trail comment to append above the union (preserving the existing `"cardAbilities"` block). Suggested form — exact prose is the executor's, but it MUST name `"cardPatterns"` + `"schemeTwist"`, cite WP-183 as the origin, and cite the WP-086 / WP-125 precedent:
  ```ts
  // why: "cardPatterns" + "schemeTwist" appended under EC-240 / WP-208 —
  // mechanical dependency of cardPatternsClient.ts + schemeTwistClient.ts
  // (added by WP-183), which call devLog("cardPatterns", ...) /
  // devLog("schemeTwist", ...). WP-086 ("cardTypes") and WP-125
  // ("cardAbilities", D-12501 §7) are the precedent: the same closed-union
  // audit-trail extension.
  ```

---

## Acceptance Criteria

1. The `Category` union line matches the locked final form exactly (byte-for-byte) — verified by `grep -Fx` (Verification Step 1)
2. The 7 prior union members (`"registry"`, `"theme"`, `"filter"`, `"render"`, `"glossary"`, `"cardTypes"`, `"cardAbilities"`) appear in the same order and unchanged
3. The audit-trail `// why:` comment above the union names both new members and cites WP-183 + the WP-086 / WP-125 precedent; the existing `"cardAbilities"` provenance lines are preserved
4. `pnpm --filter registry-viewer typecheck` exits 0; no TS2345 errors in `cardPatternsClient.ts` or `schemeTwistClient.ts`
5. `pnpm --filter registry-viewer build` exits 0
6. The two clients still call the new literals (`grep` shows 7 `devLog("cardPatterns"` + 8 `devLog("schemeTwist"` sites) — confirms the fix is exercised, not dead-coded
7. `cardPatternsClient.ts` and `schemeTwistClient.ts` are byte-identical to their pre-WP state — verified by `git diff` showing **no output** for either
8. The `devLog` function signature, body, JSDoc, and imports in `devLog.ts` are byte-identical pre/post (only the `Category` union line and its audit-trail comment change) — verified by `git diff --unified=0`
9. No file outside `## Files Expected to Change` is modified — verified by `git status` matching the 4-file expected list exactly
10. No new imports added to `devLog.ts`

---

## Verification Steps

Run each command in order. Each command must produce the expected output before proceeding.

```bash
# 1. Confirm the union line matches the locked final form EXACTLY (whole-line, fixed-string)
grep -Fx 'type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";' apps/registry-viewer/src/lib/devLog.ts
# Expected: exact match (one line). No match ⇒ formatting drift or wrong literals; STOP.

# 2. Confirm the audit-trail comment documents the new members
grep -E 'cardPatterns.*schemeTwist|schemeTwist.*cardPatterns' apps/registry-viewer/src/lib/devLog.ts | grep -F 'WP-208'
# Expected: at least one matching // why: comment line referencing WP-208

# 3. Confirm typecheck passes
pnpm --filter registry-viewer typecheck
# Expected: exit 0; no error output

# 4. Confirm build passes
pnpm --filter registry-viewer build
# Expected: exit 0

# 5. Confirm the two client files are byte-identical (no diff at all)
git diff apps/registry-viewer/src/lib/cardPatternsClient.ts apps/registry-viewer/src/lib/schemeTwistClient.ts
# Expected: empty output (zero bytes). Any output ⇒ a consumer was touched; STOP.

# 6. Post-fix sanity — confirm the fix is actually exercised by live call sites
grep -c 'devLog("cardPatterns"' apps/registry-viewer/src/lib/cardPatternsClient.ts   # Expected: 7
grep -c 'devLog("schemeTwist"'  apps/registry-viewer/src/lib/schemeTwistClient.ts    # Expected: 8

# 7. Confirm the source change is confined to the union line + its comment
git diff --unified=0 apps/registry-viewer/src/lib/devLog.ts
# Expected: hunks confined to the Category union line and its adjacent // why:
# comment; no hunks touching the devLog function, its JSDoc, or the imports.

# 8. Confirm exactly 4 files in the working tree match the expected set
git diff --name-only | sort
# Expected (exactly these 4 paths):
# apps/registry-viewer/src/lib/devLog.ts
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Definition of Done (Binary Gate — ALL must pass)

- [ ] All 6 Preconditions passed before the edit
- [ ] All 10 Acceptance Criteria pass
- [ ] All 8 Verification Steps produce the expected output
- [ ] Union line matches the locked final form exactly (Verification Step 1)
- [ ] Audit-trail `// why:` comment names both new members + cites WP-183 and the WP-086 / WP-125 precedent (Verification Step 2)
- [ ] Typecheck exits 0; build exits 0
- [ ] Both clients show zero `git diff` output (byte-identical)
- [ ] Source change confined to the union line + its comment (Verification Step 7)
- [ ] Exactly 4 files modified, matching `## Files Expected to Change`
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-208 + the union extension)
- [ ] `docs/ai/DECISIONS.md` NOT updated — the extension operates under the existing D-12501 §7 closed-union lock; no NEW decision is created
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] Commit message uses `EC-240:` prefix per the commit hygiene gate

---

## Lint Gate Self-Review (00.3 — 21 sections)

Run 2026-06-04 against this WP + EC-240. Result: **PASS** (all sections PASS or
justified N/A; one minor RISK noted, non-blocking).

- **§1 Structure** — PASS (all required sections present + non-empty; Out of Scope lists 6 explicit exclusions).
- **§2 Non-Negotiable Constraints** — PASS (Engine-wide + Packet-specific + Session protocol + Locked contract values; full-file-contents required, diffs/snippets forbidden; references 00.6-code-style.md).
- **§3 Assumes** — PASS (hard-gate preconditions A–F name every file/state dependency with exact expected output).
- **§4 Context** — PASS (ARCHITECTURE §Layer Boundary, devLog.ts, D-12501 §7, both clients, 00.6, 00.1 — all specific). 00.2 N/A — no card-data/setup-payload shapes touched (a dev-log `Category` tag is not a 00.2 field).
- **§5 Files Expected to Change** — PASS (4 files, each marked modified + described; bounded < 8).
- **§6 Naming** — PASS (`"cardPatterns"`/`"schemeTwist"` match the union's camelCase lowercase-first convention; no 00.2 contradiction).
- **§7 Dependencies** — PASS (no new npm deps).
- **§8 Architectural Boundaries** — PASS (registry-viewer layer; no engine/server/pg import; type-alias only, no R2 fetch, no game logic).
- **§9 Windows Compatibility** — **RISK (minor, non-blocking).** Verification/precondition commands use POSIX `test`/`grep`/`wc`. This is an established repo convention for `apps/registry-viewer` WPs and is runnable via the Bash tool available in-environment; `pnpm --filter` commands are pwsh-compatible. Executor may translate greps to PowerShell `Select-String` if running under pwsh. No fix required.
- **§10 Env Vars** — N/A (none).
- **§11 Auth** — N/A (no authentication surface).
- **§12 Test Quality** — N/A (WP adds no tests; typecheck exit 0 is the invariant gate — a bespoke union test would be YAGNI per §16.1).
- **§13 Verification Commands** — PASS (all `pnpm`; exact commands with expected output; §9 grep caveat noted above).
- **§14 Acceptance Criteria** — PASS (10 binary, observable, file-specific items aligned to the deliverables).
- **§15 Definition of Done** — PASS (STATUS.md, WORK_INDEX.md, EC_INDEX.md updates + scope-boundary check; DECISIONS explicitly NOT updated, justified).
- **§16 Code Style** — PASS (no abstraction/ternary/dynamic-key; audit comment explains WHY; no new import; preserves union formatting).
- **§17 Vision Alignment** — PASS (N/A declared with §17.3 build-infra justification + clause cites; see below).
- **§18 Prose-vs-Grep** — N/A (the grepped tokens `"cardPatterns"`/`"schemeTwist"` are the literals being *added*, not forbidden import/call identifiers; §18 does not apply).
- **§19 Bridge-vs-HEAD** — commit-time discipline, not a draft-lint FAIL; STATUS Done entry authored at execution against live HEAD.
- **§20 Funding Surface Gate** — PASS (N/A declared with justification; see below).
- **§21 API Catalog** — PASS (N/A declared with justification — no HTTP endpoint / `apps/server/src/**` library function touched).

No ❌ FAIL condition triggers. Gate satisfied.

## Vision Alignment

**N/A.** This WP extends a dev-only `Category` literal union inside a `devLog` utility that is no-op'd unless `DEBUG_VIEWER` is true. It does not change any public surface of the Registry Viewer (Vision §10a), does not affect card data semantics (Vision §1, §2, §10), does not touch identity / fairness / replays / scoring / monetization / accessibility. The change is purely build-infrastructure per §17.3 ("It does not require vision citations for purely structural WPs (e.g., test harness wiring, build infrastructure)").

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. The change is internal dev-log machinery with no UI surface and no user-facing behavior.

---

## API Catalog Update

**N/A.** This WP touches no HTTP endpoint, no `apps/server/src/**` library function, no route registration, no catalog row. The change is client-side type-system maintenance only.
