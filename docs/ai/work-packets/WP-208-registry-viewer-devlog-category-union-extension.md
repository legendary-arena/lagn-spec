# WP-208 — Registry Viewer `devLog` Category Union Extension (`cardPatterns` + `schemeTwist`)

**Status:** Ready
**Primary Layer:** Registry Viewer (`apps/registry-viewer/src/lib/devLog.ts`)
**Dependencies:** WP-183 (added `cardPatternsClient.ts` + `schemeTwistClient.ts` calling `devLog("cardPatterns", ...)` and `devLog("schemeTwist", ...)` but did not extend the `Category` literal union)

---

## Session Context

WP-183 added the `cardPatterns` and `schemeTwist` taxonomy clients to the registry viewer; both call `devLog(<category>, ...)` with new literal category names. WP-183 did not extend the `Category` literal union in `devLog.ts`, so `vue-tsc --noEmit` rejects every call site with TS2345 ("Argument of type X is not assignable to parameter of type 'Category'"). The Build Registry Viewer CI step has been red on every main commit since the WP-183 merge. This WP extends the union with the two missing literals; the fix is one line in one file.

---

## Goal

After this session, `apps/registry-viewer/src/lib/devLog.ts:20` includes `"cardPatterns"` and `"schemeTwist"` as members of the `Category` string-literal union. `pnpm --filter registry-viewer typecheck` exits 0; the 15 TS2345 errors across `cardPatternsClient.ts` and `schemeTwistClient.ts` are resolved without any modification to either client file.

---

## Assumes

- WP-183 complete. Specifically:
  - `apps/registry-viewer/src/lib/cardPatternsClient.ts` calls `devLog("cardPatterns", ...)` at 7 sites (lines 71, 98, 105, 142, 183, 203, 231 per CI report)
  - `apps/registry-viewer/src/lib/schemeTwistClient.ts` calls `devLog("schemeTwist", ...)` at 8 sites (lines 40, 44, 83, 91, 116, 120, 142, 149 per CI report)
- `apps/registry-viewer/src/lib/devLog.ts:20` currently defines `Category` as: `type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities";` (7 members, no `cardPatterns`, no `schemeTwist`)
- `pnpm --filter registry-viewer typecheck` currently exits 2 with 15 TS2345 errors in the two client files
- `pnpm --filter registry-viewer build` currently fails with the same typecheck error
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms `apps/registry-viewer` is its own layer (UI-only consumer of registry data); this WP touches a single dev-log utility inside it.
- `apps/registry-viewer/src/lib/devLog.ts` — read entirely. The `Category` union at line 20 is the canonical taxonomy of dev-log categories. The extension is purely additive (append two members to the union); no semantics change.
- `apps/registry-viewer/src/lib/cardPatternsClient.ts` — read enough to confirm all 7 call sites use the literal string `"cardPatterns"`. This is the consumer; the WP must not modify it.
- `apps/registry-viewer/src/lib/schemeTwistClient.ts` — read enough to confirm all 8 call sites use the literal string `"schemeTwist"`. Same: consumer-only, do not modify.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 14 (canonical field names). The two added union members preserve the existing camelCase + lowercase-first naming convention of the union.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.

---

## Scope (In)

- Extend the `Category` type alias in `apps/registry-viewer/src/lib/devLog.ts:20` from 7 members to 9 members by appending `"cardPatterns"` and `"schemeTwist"` (in that order, at the end of the union)
- Verify `pnpm --filter registry-viewer typecheck` exits 0 after the extension
- Verify `pnpm --filter registry-viewer build` exits 0 after the extension

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

4 files total (1 source + 3 governance). No DECISIONS.md entry — the `Category` taxonomy is internal dev-log machinery with no contract semantics; appending literals to it is implementation, not policy.

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
- No `// why:` comment required on the union extension itself (additive type widening with no semantic surprise)
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

---

## Acceptance Criteria

1. `apps/registry-viewer/src/lib/devLog.ts:20` defines `Category` as a 9-member literal union ending with `... | "cardPatterns" | "schemeTwist";`
2. The 7 prior union members (`"registry"`, `"theme"`, `"filter"`, `"render"`, `"glossary"`, `"cardTypes"`, `"cardAbilities"`) appear in the same order and unchanged
3. `pnpm --filter registry-viewer typecheck` exits 0; no TS2345 errors in `cardPatternsClient.ts` or `schemeTwistClient.ts`
4. `pnpm --filter registry-viewer build` exits 0
5. `cardPatternsClient.ts` and `schemeTwistClient.ts` are byte-identical to their pre-WP state — verified by `git diff` showing them unchanged
6. The `devLog` function signature and body in `devLog.ts` are byte-identical pre/post (only the `Category` type alias changes) — verified by inspection of the diff
7. No file outside `## Files Expected to Change` is modified — verified by `git status` matching the 4-file expected list exactly
8. No new imports added to `devLog.ts`

---

## Verification Steps

Run each command in order. Each command must produce the expected output before proceeding.

```bash
# 1. Confirm the union has 9 members in the expected form
grep -E '^type Category =' apps/registry-viewer/src/lib/devLog.ts
# Expected: type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";

# 2. Confirm typecheck passes
pnpm --filter registry-viewer typecheck
# Expected: exit 0; no error output

# 3. Confirm build passes
pnpm --filter registry-viewer build
# Expected: exit 0

# 4. Confirm the two client files are untouched
git diff --stat apps/registry-viewer/src/lib/cardPatternsClient.ts apps/registry-viewer/src/lib/schemeTwistClient.ts
# Expected: empty output

# 5. Confirm exactly 4 files in the working tree match the expected set
git diff --name-only | sort
# Expected (exactly these 4 paths):
# apps/registry-viewer/src/lib/devLog.ts
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Definition of Done

- [ ] All 8 Acceptance Criteria pass
- [ ] All 5 Verification Steps produce the expected output
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-208 + the union extension)
- [ ] `docs/ai/DECISIONS.md` NOT updated (additive type widening; no new contract semantics)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] No files outside `## Files Expected to Change` were modified — verified by `git status`
- [ ] Commit message uses `EC-240:` prefix per the commit hygiene gate

---

## Vision Alignment

**N/A.** This WP extends a dev-only `Category` literal union inside a `devLog` utility that is no-op'd unless `DEBUG_VIEWER` is true. It does not change any public surface of the Registry Viewer (Vision §10a), does not affect card data semantics (Vision §1, §2, §10), does not touch identity / fairness / replays / scoring / monetization / accessibility. The change is purely build-infrastructure per §17.3 ("It does not require vision citations for purely structural WPs (e.g., test harness wiring, build infrastructure)").

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. The change is internal dev-log machinery with no UI surface and no user-facing behavior.

---

## API Catalog Update

**N/A.** This WP touches no HTTP endpoint, no `apps/server/src/**` library function, no route registration, no catalog row. The change is client-side type-system maintenance only.
