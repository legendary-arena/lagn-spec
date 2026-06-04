# WP-213 — Registry Viewer `devLog` Category: Derive Union From a `LOG_CATEGORIES` Single-Source Array

**Status:** Reviewed — ready to execute (pre-flight READY + copilot CONFIRM + lint PASS, 2026-06-04)
**Primary Layer:** Registry Viewer (`apps/registry-viewer/src/lib/devLog.ts`)
**Dependencies:** WP-208 (extends the `Category` union to its 9-member form — `"cardPatterns"` + `"schemeTwist"`; this WP converts that completed union to a derived type and must run after it)

---

## Session Context

The `Category` literal union in `apps/registry-viewer/src/lib/devLog.ts` is a hand-maintained closed union. Every new `devLog`-consuming domain has had to edit the union line by hand or the Registry Viewer typecheck goes red: WP-086 appended `"cardTypes"`, WP-125 appended `"cardAbilities"`, and WP-208 appended `"cardPatterns"` + `"schemeTwist"` — the last of which sat as red CI on every `main` commit between the WP-183 merge and the WP-208 fix. `DECISIONS.md` D-12501 §7 records this as a "known mechanical dependency": the closed union *forces* every new domain to extend it.

This WP retires that chore. It replaces the hand-written union with a single source of truth — a `const LOG_CATEGORIES = [...] as const` array — and derives the type via `type Category = (typeof LOG_CATEGORIES)[number]`. After this lands, a future domain adds **one array element** and the union widens automatically; the union can never drift from the array because it *is* the array. No behavior changes: `devLog`'s signature, body, and the resolved `Category` type are identical pre/post.

This is the structural follow-up flagged at WP-208 review time. WP-208 ships the urgent CI unblock under the existing convention; WP-213 changes the mechanism so the convention stops costing a WP each time.

---

## Goal

After this session, `apps/registry-viewer/src/lib/devLog.ts` declares a module-local `const LOG_CATEGORIES` (`as const`, the 9 category literals in the **locked canonical order** under `## Non-Negotiable Constraints → Locked contract values` — never inferred from current file state) and defines `type Category = (typeof LOG_CATEGORIES)[number]` in place of the hand-written union. `pnpm --filter registry-viewer typecheck` and `pnpm --filter registry-viewer build` both exit 0; the resolved `Category` type is identical to the prior 9-member union (proven by both client files continuing to typecheck unchanged). The audit-trail `// why:` comment is rewritten to explain the new single-source mechanism while preserving the extension history. `DECISIONS.md` records D-21001 amending D-12501 §7 (the hand-extension chore is retired).

---

## Assumes (Hard-Gate Preconditions — MUST PASS BEFORE EDIT)

Run each command. If ANY produces output other than the stated expectation, this packet is **BLOCKED** — STOP and report; do not edit.

```bash
# A1. All 9 category literals are present (layout-independent — distinct-literal count).
#     Guards against a false STOP when the only difference is benign reformatting.
grep -oE '"(registry|theme|filter|render|glossary|cardTypes|cardAbilities|cardPatterns|schemeTwist)"' apps/registry-viewer/src/lib/devLog.ts | sort -u | wc -l
# Expected: 9 (the nine distinct literals exist somewhere in the file — union and/or comment).

# A2. WP-208 has landed: the union is the canonical 9-member form (single physical line).
grep -Fx 'type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";' apps/registry-viewer/src/lib/devLog.ts
# Expected: exact match (one line). A2 is the canonical gate. If A1 = 9 but A2 has NO
# match, the union was reformatted (line-wrapped) — STOP and report; reformatting the
# union is a WP-208-scope concern, not something this WP silently absorbs. If A1 < 9,
# WP-208 has not landed (or a parallel conversion already happened) — STOP.

# B. No LOG_CATEGORIES array exists yet (this WP introduces it)
grep -F 'LOG_CATEGORIES' apps/registry-viewer/src/lib/devLog.ts
# Expected: NO MATCH (empty output, grep exit 1).

# C. Category is currently module-local (not exported) — posture this WP preserves
grep -E '^export (type )?Category' apps/registry-viewer/src/lib/devLog.ts
# Expected: NO MATCH (the type alias is not exported).

# D. Baseline is green BEFORE the edit (WP-208 fixed the typecheck)
pnpm --filter registry-viewer typecheck
# Expected: exit 0.

# E. The two consumer clients exist and call the new literals (the type-identity proof surface)
grep -c 'devLog("cardPatterns"' apps/registry-viewer/src/lib/cardPatternsClient.ts   # Expected: 7
grep -c 'devLog("schemeTwist"'  apps/registry-viewer/src/lib/schemeTwistClient.ts    # Expected: 8

# F. Governance docs exist
test -f docs/ai/DECISIONS.md && test -f docs/ai/ARCHITECTURE.md && echo "F_OK"
# Expected: F_OK
```

If precondition A fails because the union is already in the derived `(typeof LOG_CATEGORIES)[number]` form, a parallel fix has landed — STOP and report.

---

## Context (Read First)

Before writing a single line:

- `apps/registry-viewer/src/lib/devLog.ts` — read entirely. The `Category` union and its audit-trail `// why:` comment are the only things this WP changes. The `devLog` function below them is untouched.
- `docs/ai/DECISIONS.md §D-12501 §7` — the decision this WP amends. §7 frames the closed `Category` union as a known mechanical dependency that every new `devLog` domain must hand-extend. WP-213 changes that mechanism; D-21001 records the amendment. Scan the surrounding D-12501 block for the locked taxonomy-path / schema-name context so the amendment is scoped to §7 only (the rest of D-12501 is about the card-abilities effect-tag filter and is unaffected).
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms `apps/registry-viewer` is a UI-only layer; this WP touches one dev-log utility inside it and adds no imports, no exports, and no cross-layer edges.
- `.claude/rules/architecture.md §Layer Boundary` + `§Import Rules` — confirms the registry-viewer import rules; this WP introduces no import.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations — `LOG_CATEGORIES` is a full-word name), Rule 6 (`// why:` comments), and the "canonical readonly arrays" / drift-detection convention. Note that `LOG_CATEGORIES` is the *single-source-derived* shape (the union derives from the array), which is distinct from the engine's "canonical array PLUS separate union + drift test" shape — see Out of Scope.
- `docs/ai/work-packets/WP-208-registry-viewer-devlog-category-union-extension.md` — the immediately-prior WP on this file; establishes the audit-trail-comment convention this WP carries forward in rewritten form.

---

## Scope (In)

- In `apps/registry-viewer/src/lib/devLog.ts`, introduce a module-local `const LOG_CATEGORIES` initialized to the 9 category literals in the **locked canonical order** (`"registry"`, `"theme"`, `"filter"`, `"render"`, `"glossary"`, `"cardTypes"`, `"cardAbilities"`, `"cardPatterns"`, `"schemeTwist"`) — with an `as const` assertion. The order is **normative**: it MUST match the Locked contract values list byte-for-byte and MUST NOT be inferred by reading the file (a local reorder before this session must not silently change the output).
- Replace the hand-written `type Category = "..." | ...;` union with `type Category = (typeof LOG_CATEGORIES)[number];`.
- Rewrite the audit-trail `// why:` comment above the declaration to explain the single-source mechanism (each new domain appends one array element; the union derives and cannot drift) and preserve the extension history (`"cardTypes"` WP-086, `"cardAbilities"` WP-125, `"cardPatterns"` + `"schemeTwist"` WP-208) plus the D-12501 §7 → D-21001 amendment pointer.
- Verify `pnpm --filter registry-viewer typecheck` exits 0 and `pnpm --filter registry-viewer build` exits 0 after the change.
- Record D-21001 in `DECISIONS.md` amending D-12501 §7. The entry MUST: (a) explicitly reference D-12501 §7; (b) state that the manual per-domain union-extension requirement is retired; (c) describe the new mechanism (single-source-derived union — `Category` derives from `LOG_CATEGORIES` via `(typeof LOG_CATEGORIES)[number]`); (d) confirm no behavioral change (resolved `Category` type identical pre/post).

## Out of Scope

- Changing the `devLog` function signature, body, JSDoc, or imports in any way (only the type-alias mechanism and its comment change).
- Adding, removing, renaming, or reordering any category literal — the set stays exactly the 9 members WP-208 leaves in place.
- Modifying `cardPatternsClient.ts` or `schemeTwistClient.ts`, or any other file under `apps/registry-viewer/src/` (consumers are correct and stay byte-identical).
- Exporting `LOG_CATEGORIES` or `Category` from the module — both stay module-local, preserving the current no-public-surface posture. (The two clients pass string literals to `devLog`; they do not import the type.)
- Adding a drift-detection test or a type-equality assertion. The union derives from the array via `typeof[number]`, so divergence is structurally impossible — a drift test would assert a tautology, and the viewer has no Vue test harness at baseline (precedent: WP-184 / WP-208). Typecheck-green across the two clients is the type-identity proof.
- Adding `LOG_CATEGORIES` to the canonical-readonly-array list in `.claude/rules/code-style.md` or `00.6-code-style.md`. That list governs the engine's "array + separate union + drift test" pattern; this is the distinct "single-source-derived" pattern and needs no such registration.
- Touching any other package, the server, the engine, or card data.

---

## Change Constraint (Confinement)

The source change MUST be confined to `apps/registry-viewer/src/lib/devLog.ts`, and within that file to exactly two regions:

1. The audit-trail `// why:` comment block and the type-declaration region — replaced by the `LOG_CATEGORIES` const + the derived `type Category` + the rewritten comment.
2. Nothing else.

The `devLog` function (signature, body, JSDoc) and the file's single `import { DEBUG_VIEWER }` line must be **byte-identical** pre/post.

Verify:

```bash
git diff --unified=0 apps/registry-viewer/src/lib/devLog.ts
# Expected: hunks confined to the comment + type-declaration region near the top
# of the file; no hunks touching the devLog function, its JSDoc, or the import.
```

---

## Files Expected to Change

- `apps/registry-viewer/src/lib/devLog.ts` — modified (introduce `LOG_CATEGORIES`; derive `Category`; rewrite the audit-trail comment)
- `docs/ai/DECISIONS.md` — modified (new entry D-21001 amending D-12501 §7)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status flip)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status flip)

5 files total (1 source + 4 governance, including DECISIONS). Unlike WP-208, this WP **does** reserve a DECISIONS entry: it amends a recorded decision (D-12501 §7), it does not merely execute one.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — N/A (no runtime logic added; the const is data only)
- Never throw inside boardgame.io move functions — N/A (registry-viewer, no engine code)
- Never persist `G`, `ctx`, or any runtime state — N/A
- `G` must be JSON-serializable at all times — N/A
- ESM only, Node v22+ — `devLog.ts` is already ESM; no change
- `node:` prefix on all Node.js built-in imports — N/A (no new imports added)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — `LOG_CATEGORIES` is a full-word SCREAMING_SNAKE constant name; one element per line for readable diffs on future appends
- Full file contents required for the modified source file in the session output — no diffs, no snippets

**Packet-specific:**
- Read-only on `cardPatternsClient.ts` and `schemeTwistClient.ts` (consumers are correct and unchanged)
- Read-only on the `devLog` function signature, body, JSDoc, and the module import (only the type-alias mechanism + its comment change)
- The 9 literals carried into `LOG_CATEGORIES` are exactly the post-WP-208 members, in the locked canonical order — no additions, removals, renames, or reordering. **Do NOT alphabetize or otherwise reorder** the array; order stability preserves diff clarity and audit traceability (the array reads as the extension timeline).
- **Type-identity guarantee — all three must hold, or the derived type diverges:** (a) the literal *set* is exactly the 9 locked members; (b) each literal's string *casing* is byte-identical (camelCase, lowercase-first); (c) the `as const` assertion is present. Without `as const` the element type widens to `string` and `Category` silently collapses to `string` (every string would typecheck — the gate is defeated with no error). The executor MUST verify all three; a green typecheck alone does not prove (c) held, because a collapsed `string` type also typechecks.
- `LOG_CATEGORIES` and `Category` remain **module-local** — no `export` is added. Rationale: exporting would expand the registry-viewer's public surface and let external code couple to dev-only logging categories, breaking UI-layer isolation. The two clients pass string literals to `devLog`; they do not import the type, so no export is warranted.
- A `// why:` comment is REQUIRED on the `LOG_CATEGORIES` / derived-type region, explaining the single-source-derived mechanism and preserving the extension history (rewrites, does not merely delete, WP-208's audit-trail comment)

**Session protocol:**
- If the union is not in the expected 9-member hand-written form (precondition A2 has no match): STOP and report — either WP-208 has not landed, the union was reformatted (A1 = 9 but A2 fails), or a parallel conversion already happened.
- If `LOG_CATEGORIES` already exists in the file: STOP (a parallel fix landed).
- If either client has started importing `Category` or `LOG_CATEGORIES` as a type/value (rather than passing string literals): STOP and ask — exporting becomes in scope and the no-public-surface posture must be revisited.
- If adding `as const` + the derived type surfaces any new typecheck error in a consumer (it should not — the resolved type is identical): STOP and report; do not "fix" a consumer to make it pass.
- **Failure escalation (no speculative fixes):** if any invariant or verification step fails and the root cause is not immediately clear, STOP — capture the `git diff` of `devLog.ts` and the full `pnpm --filter registry-viewer typecheck` output, and report before attempting any correction. Do not iterate blindly on the type alias.

**Locked contract values:**
- `LOG_CATEGORIES` element set + order (exact, byte-for-byte): `"registry"`, `"theme"`, `"filter"`, `"render"`, `"glossary"`, `"cardTypes"`, `"cardAbilities"`, `"cardPatterns"`, `"schemeTwist"`
- Derived type form (exact): `type Category = (typeof LOG_CATEGORIES)[number];`
- Array element count: 9 (unchanged from the WP-208 union member count)
- File modified: exactly one source path — `apps/registry-viewer/src/lib/devLog.ts`
- DECISIONS reservation: D-21001 (amends D-12501 §7)
- Suggested final form (exact prose of the comment is the executor's, but it MUST name the single-source mechanism, preserve the WP-086 / WP-125 / WP-208 history, and point D-12501 §7 → D-21001):
  ```ts
  // why: devLog categories are the single-source-derived taxonomy here. Each
  // new devLog-consuming domain appends ONE element to LOG_CATEGORIES; Category
  // derives from it via (typeof LOG_CATEGORIES)[number], so the union can never
  // drift from the array. This retires the hand-maintained closed-union chore
  // recorded at D-12501 §7 (see D-21001). Extension history: "cardTypes"
  // (WP-086), "cardAbilities" (WP-125), "cardPatterns" + "schemeTwist" (WP-208).
  // To add a new domain "fooBar": append "fooBar", to the array (keep the as
  // const) and nothing else — do NOT edit the Category line, do NOT reorder.
  const LOG_CATEGORIES = [
    "registry",
    "theme",
    "filter",
    "render",
    "glossary",
    "cardTypes",
    "cardAbilities",
    "cardPatterns",
    "schemeTwist",
  ] as const;

  type Category = (typeof LOG_CATEGORIES)[number];
  ```

---

## Acceptance Criteria

1. `devLog.ts` declares a module-local `const LOG_CATEGORIES` with an `as const` assertion, containing exactly the 9 locked literals in the locked order — verified by Verification Step 1.
2. `devLog.ts` defines `type Category = (typeof LOG_CATEGORIES)[number];` and contains no hand-written `type Category = "..." | ...` union — verified by Verification Steps 2 and 3.
3. `LOG_CATEGORIES` and `Category` are not exported (`grep -E '^export' ` on the declarations returns nothing) — the no-public-surface posture is preserved.
4. The audit-trail `// why:` comment names the single-source mechanism, preserves the WP-086 / WP-125 / WP-208 history, and points D-12501 §7 → D-21001 — verified by Verification Step 4.
5. `pnpm --filter registry-viewer typecheck` exits 0; no error in `cardPatternsClient.ts` or `schemeTwistClient.ts` (the resolved `Category` type is identical to the prior union — both clients still typecheck unchanged).
6. `pnpm --filter registry-viewer build` exits 0.
7. The two clients still call the new literals (`grep` shows 7 `devLog("cardPatterns"` + 8 `devLog("schemeTwist"` sites) — confirms the derived type is exercised, not dead-coded.
8. `cardPatternsClient.ts` and `schemeTwistClient.ts` are byte-identical to their pre-WP state — `git diff` shows **no output** for either.
9. The `devLog` function signature, body, JSDoc, and the module import are byte-identical pre/post (only the comment + type-declaration region changes) — verified by `git diff --unified=0`.
10. No file outside `## Files Expected to Change` is modified — `git status` matches the 5-file expected list exactly.
11. `DECISIONS.md` contains a new D-21001 entry amending D-12501 §7; no other D-entry is modified.

---

## Verification Steps

Run each command in order. Each must produce the expected output before proceeding.

```bash
# 1. Confirm the single-source array exists with as const and the 9 locked members
grep -F 'const LOG_CATEGORIES = [' apps/registry-viewer/src/lib/devLog.ts   # Expected: one match
grep -F '] as const;' apps/registry-viewer/src/lib/devLog.ts                # Expected: at least one match
grep -cE '"(registry|theme|filter|render|glossary|cardTypes|cardAbilities|cardPatterns|schemeTwist)",?' apps/registry-viewer/src/lib/devLog.ts
# Expected: 9 (the nine literal members; clients are a different file)

# 2. Confirm the derived type is present
grep -F 'type Category = (typeof LOG_CATEGORIES)[number];' apps/registry-viewer/src/lib/devLog.ts
# Expected: exact match (one line).

# 3. Confirm NO hand-written union remains
grep -E '^type Category = "' apps/registry-viewer/src/lib/devLog.ts
# Expected: NO MATCH (empty output, grep exit 1).

# 4. Confirm the audit-trail comment carries history + the D-pointer
grep -F 'D-21001' apps/registry-viewer/src/lib/devLog.ts   # Expected: at least one match
grep -F 'WP-208'  apps/registry-viewer/src/lib/devLog.ts   # Expected: at least one match (history preserved)

# 5. Confirm no export was added to the declarations
grep -E '^export (const LOG_CATEGORIES|type Category)' apps/registry-viewer/src/lib/devLog.ts
# Expected: NO MATCH.

# 6. Confirm typecheck passes (resolved Category type unchanged ⇒ clients still green)
pnpm --filter registry-viewer typecheck
# Expected: exit 0; no error output.

# 7. Confirm build passes
pnpm --filter registry-viewer build
# Expected: exit 0.

# 8. Post-fix sanity — the derived type is exercised by live call sites
grep -c 'devLog("cardPatterns"' apps/registry-viewer/src/lib/cardPatternsClient.ts   # Expected: 7
grep -c 'devLog("schemeTwist"'  apps/registry-viewer/src/lib/schemeTwistClient.ts    # Expected: 8

# 9. Confirm the clients are byte-identical (no diff at all)
git diff apps/registry-viewer/src/lib/cardPatternsClient.ts apps/registry-viewer/src/lib/schemeTwistClient.ts
# Expected: empty output (zero bytes).

# 10. Confirm the source change is confined to the comment + type region
git diff --unified=0 apps/registry-viewer/src/lib/devLog.ts
# Expected: no hunks touching the devLog function, its JSDoc, or the import line.

# 10b. Sharper negative guard — inspect the exact words that changed
git diff --word-diff apps/registry-viewer/src/lib/devLog.ts
# Expected: ONLY the removal of the hand-written union + its old comment and the
# addition of LOG_CATEGORIES + the derived type + rewritten comment. ANY word-level
# change inside the devLog function body, its JSDoc, or the import is a HARD FAIL.

# 11. Confirm exactly 5 files in the working tree match the expected set
git diff --name-only | sort
# Expected (exactly these 5 paths):
# apps/registry-viewer/src/lib/devLog.ts
# docs/ai/DECISIONS.md
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Definition of Done (Binary Gate — ALL must pass)

- [ ] All preconditions passed before the edit (A1 + A2 + B–F)
- [ ] All 11 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output (1–11, including 10b)
- [ ] `LOG_CATEGORIES` present with `as const` + the 9 locked members in order (Step 1)
- [ ] `type Category = (typeof LOG_CATEGORIES)[number];` present; no hand-written union remains (Steps 2–3)
- [ ] Neither `LOG_CATEGORIES` nor `Category` is exported (Step 5)
- [ ] Audit-trail comment carries the WP-086 / WP-125 / WP-208 history + the D-21001 pointer (Step 4)
- [ ] Typecheck exits 0; build exits 0
- [ ] Both clients show zero `git diff` output (byte-identical)
- [ ] Source change confined to the comment + type-declaration region (Step 10)
- [ ] Exactly 5 files modified, matching `## Files Expected to Change`
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-213 + the derived-type conversion)
- [ ] `docs/ai/DECISIONS.md` updated — new D-21001 amending D-12501 §7; no other entry touched
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped to Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped to Done
- [ ] Commit message uses `EC-244:` prefix per the commit hygiene gate

---

## Lint Gate Self-Review (00.3 — 21 sections)

Run 2026-06-04 against this WP + EC-244. Result: **PASS** (all sections PASS or
justified N/A; one minor RISK noted at §5, non-blocking).

- **§1 Structure** — PASS (all required sections present + non-empty; Out of Scope lists 7 explicit exclusions).
- **§2 Non-Negotiable Constraints** — PASS (Engine-wide + Packet-specific + Session protocol + Locked contract values; full-file-contents required, diffs/snippets forbidden; references 00.6-code-style.md).
- **§3 Assumes** — PASS (hard-gate preconditions A1/A2 + B–F name every file/state dependency with exact expected output; A2 is the canonical gate).
- **§4 Context** — PASS (devLog.ts, D-12501 §7, ARCHITECTURE §Layer Boundary, `.claude/rules/architecture.md`, 00.6, WP-208 — all specific). 00.2 N/A — no card-data/setup-payload shapes touched (a dev-log `Category` tag is not a 00.2 field).
- **§5 Files Expected to Change** — PASS with minor RISK. 5 files (1 source + 4 governance incl. DECISIONS), each marked modified + described; bounded < 8. **RISK (non-blocking):** EC-244 is 85 non-empty content lines vs the 01.0a 60-line guideline — overage is the verbatim locked-declaration block (the EC's drift-prevention payload) and is consistent with recent ECs (EC-241 = 187, EC-242 = 102, EC-240 = 63). No fix required.
- **§6 Naming** — PASS (`LOG_CATEGORIES` is full-word SCREAMING_SNAKE; the 9 literals carry byte-identical casing from the WP-208 union; no 00.2 contradiction).
- **§7 Dependencies** — PASS (no new npm deps).
- **§8 Architectural Boundaries** — PASS (registry-viewer UI layer; no engine/server/pg import; type-alias mechanism only, no new import, no export, no cross-layer edge).
- **§9 Windows Compatibility** — PASS (verification uses `pnpm --filter` (pwsh-compatible) + `grep`/`wc` runnable via the Bash tool, an established repo convention for registry-viewer WPs).
- **§10 Env Vars** — N/A (none).
- **§11 Auth** — N/A (no authentication surface).
- **§12 Test Quality** — N/A (WP adds no tests; the derived type makes a drift test a tautology — typecheck-green across both clients is the type-identity proof; §16.1 YAGNI).
- **§13 Verification Commands** — PASS (all `pnpm`; exact commands with expected output; the word-diff guard at Step 10b sharpens confinement).
- **§14 Acceptance Criteria** — PASS (11 binary, observable, file-specific items aligned to the deliverables).
- **§15 Definition of Done** — PASS (STATUS.md, DECISIONS.md D-21001, WORK_INDEX.md, EC_INDEX.md updates + scope-boundary check).
- **§16 Code Style** — PASS (no abstraction/ternary/dynamic-key; the one required `// why:` comment explains the single-source mechanism; no new import; `LOG_CATEGORIES` one-element-per-line for readable append diffs).
- **§17 Vision Alignment** — PASS (N/A declared with §17.3 build-infra justification + clause cites; see below).
- **§18 Prose-vs-Grep** — N/A (the grepped tokens `"cardPatterns"`/`"schemeTwist"`/`LOG_CATEGORIES` are the literals/identifier being *added*, not forbidden import/call identifiers; §18 does not apply).
- **§19 Bridge-vs-HEAD** — commit-time discipline, not a draft-lint FAIL; STATUS Done entry authored at execution against live HEAD.
- **§20 Funding Surface Gate** — PASS (N/A declared with justification + WP-097 / D-9701 / D-9801 authority cite; see below).
- **§21 API Catalog** — PASS (N/A declared with justification — no HTTP endpoint / `apps/server/src/**` library function touched).

No ❌ FAIL condition triggers. Gate satisfied.

## Gate Verdicts (Phase 1)

- **Pre-flight (`01.4`):** READY TO EXECUTE (2026-06-04). Hard-dep WP-208 shipped (`d51c82f`); repo green; scope locked; RS-1 (EC line count) + RS-2 (D-21001 amends D-12501 §7) resolved.
- **Copilot check (`01.7`):** PASS → CONFIRM (2026-06-04). Type-safety / contract-integrity / scope-governance categories explicitly locked; mutation / determinism / persistence categories structurally N/A for a UI-layer type-alias change. Headline risk (#21 type-widening via missing `as const`) is the most rigorously locked item.
- Scratchpad: `docs/ai/invocations/preflight-wp213-devlog-category-derived.md` (gitignored).

## Vision Alignment

**N/A — purely structural.** Per lint §17.3, this WP touches none of the §17.1 trigger surfaces. It converts a dev-only `Category` literal union (inside a `devLog` utility that is no-op'd and DCE-stripped unless `DEBUG_VIEWER` is true) from a hand-written union to a derived type. No public Registry Viewer surface changes (Vision §10a — the dev logger is not a user-facing surface); no card-data semantics (Vision §1, §2, §10); no identity, fairness, replay, scoring, monetization, determinism-of-gameplay, or accessibility surface is touched. The resolved `Category` type and all runtime behavior are identical pre/post.

---

## Funding Surface Gate

**N/A — no funding surface touched.** This WP touches no §20.1 trigger surface: no global navigation funding affordance, no registry-viewer funding affordance, no profile/account funding attribution, no tournament-funding-channel integration, and no user-visible funding copy. The change is internal dev-log type-system maintenance with no UI surface and no user-facing copy. (Authority chain for the gate, cited per §20 form: WP-097, D-9701, D-9801.)

---

## API Catalog Update

**N/A — no API surface touched.** Per lint §21.4: this WP touches no HTTP endpoint, no route registration, and no `apps/server/src/**` library function recorded in the catalog. The change is client-side type-system maintenance inside `apps/registry-viewer` only; `docs/ai/REFERENCE/api-endpoints.md` is unaffected.
