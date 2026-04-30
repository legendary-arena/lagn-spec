# Pre-Flight Invocation — WP-119 (Architecture Doc Hygiene)

**Target Work Packet:** `WP-119`
**Title:** Architecture Doc Hygiene
**Previous WP Status:** WP-114 Done 2026-04-29 (commits `c059199` + `8e67447` per WORK_INDEX). WP-115/116/117/118 are STUB DRAFT (untracked / pre-lint slot reservations).
**Pre-Flight Date:** 2026-04-30
**Invocation Stage:** Pre-Execution (Scope & Readiness)
**Work Packet Class:** Governance / Documentation (no code; no `G` mutation; no engine touch; no contracts; no tests). Pure doc edits to `docs/**` and `.claude/rules/architecture.md`. No EC required (D-10001 precedent applies cleanly; SPEC: prefix; no `apps/`/`packages/` files staged).

---

## Pre-Flight Intent

Validate readiness and lock scope for WP-119. Not implementing. Not generating doc text. If a blocking condition is found, return **NOT READY** with PS-N actions enumerated.

---

## Authority Chain — Confirmed Read

| Doc | Status | Notes |
|---|---|---|
| `.claude/CLAUDE.md` (root) | Read | Governance hierarchy, EC mode rules confirmed. |
| `.claude/rules/architecture.md` | Read | Layer Boundary table at lines 161-167; preplan import row at 163. |
| `.claude/rules/code-style.md` | Read | Style guide — applies to prose only. |
| `.claude/rules/work-packets.md` | Read | Invocation artifacts policy: preflight-wp*.md is scratchpad-by-default, not committed unless WP cites it. WP-119 does not cite this file as normative; this preflight is informational. |
| `docs/ai/ARCHITECTURE.md` | Read (Layer Boundary section + preplan citations) | 8 distinct preplan-wording sites identified. |
| `docs/02-ARCHITECTURE.md` | Read (lines 60-90, plus preplan grep) | Confirms `replay-producer` is **completely absent** from this file — not just the diagram. |
| `docs/01-VISION.md §17` | Read (lines 232-237) | **§17 is "Accessibility & Inclusivity" — covers keyboard nav, screen readers, high-contrast, color-blind support. Does NOT mention i18n.** |
| `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17.1` | Read (lines 401-418) | Trigger #9 groups "Accessibility or internationalization surfaces (Vision §17)" — the lint checklist treats them as one trigger surface even though Vision §17 itself covers only accessibility. |
| `docs/ai/work-packets/WORK_INDEX.md` | Read (line 2429 row) | WP-119 reserved as "STUB DRAFT 2026-04-29 (pre-lint, pre-pre-flight)". |
| `docs/ai/DECISIONS.md` | Read (D-6301 + D-10001 + D-10001 Amendment) | D-6301 establishes `apps/replay-producer` (`cli-producer-app` category); D-10001 + Amendment is the no-EC precedent WP-119 cites. D-11901 unused. |
| `apps/replay-producer/package.json` + `src/cli.ts` | Confirmed exists | Real shipped CLI app per WP-063 (closed 2026-04-19 at `97560b1`). |
| Target WP file | Read end-to-end | 246 lines. 16 AC checkboxes; 9 verification commands; 7 DoD items. Lint Self-Review section is empty. |

---

## Vision Sanity Check

**§17.1 Trigger evaluation:** Trigger #9 (Accessibility or internationalization surfaces — Vision §17) is **Triggered** by the i18n posture line. ✅

**§17 authority check:** ⚠ **MISMATCH FOUND.**

The WP's `## Vision Alignment` block says:

> **Vision clauses touched:** §17 (Accessibility / Internationalization).

And the AC requires:

> Section cites Vision §17 (literal string `Vision §17` appears within the section)

But Vision §17 (`docs/01-VISION.md` lines 232-237) reads:

> #### 17. Accessibility & Inclusivity
> - Full keyboard navigation, screen-reader support, high-contrast modes, and color-blind friendly indicators
> - Tooltips, rules explanations, and the game log must be clear and comprehensive
> - Accessibility enhancements must never alter rules or give any player an advantage

**Vision §17 does not mention internationalization, i18n, locales, or translation.** The 00.3 §17.1 trigger framework groups accessibility and i18n under §17 as a *trigger surface*, but Vision itself is silent on i18n. WP-119's premise is correct (the architecture doc has no stated i18n posture); but its Vision Alignment overstates §17's actual scope.

**Conflict assertion validity:** The current WP says "No conflict — the WP commits to 'deferred', which is consistent with §17 not having committed to a specific i18n implementation." This is technically true (silence ≠ conflict), but the framing implies §17 has an i18n posture that this WP defers within. It does not.

**Recommended correction:** WP-119's i18n section and DECISIONS entry must:
1. Cite Vision §17 only as the **trigger-surface anchor** per 00.3 §17.1 #9.
2. Explicitly acknowledge that Vision §17 covers accessibility, not i18n, and that this WP fills the vision-level i18n gap at the architecture-doc level.
3. Not claim that Vision §17 authorizes a deferred i18n posture (it neither authorizes nor forbids it).

This is a **PS-N (BLOCKING)** — see PS-1.

**§20 Funding Surface Gate:** N/A. Pure doc cleanup. No funding affordances; no donation surface; no subscription path. ✅

**Determinism preservation:** N/A. No engine / replay / RNG touched. ✅

---

## Dependency & Sequencing Check

**Stated:** "Dependencies: None — these are independent low-risk doc cleanups."

**Verified:**
- WP-063 (replay-producer) Done 2026-04-19 at `97560b1` ✅ (the diagram-update item depends on this WP being shipped, which it is).
- D-6301 exists at `DECISIONS.md` line 5015 ✅.
- No other WPs gate WP-119.
- WP-115/116/117/118 are STUB DRAFT and parallel-safe (per their own status); WP-119's `## Internationalization` insertion location does not collide with any of their planned sections (HTTP API Surface, Disconnect & Reconnect Semantics, Client Routing).

**Sequencing risk:** None. WP-119 can land before or after WP-115/116/117/118 with no contention.

✅ Dependency chain clean.

---

## Dependency Contract Verification

**N/A** — WP-119 introduces no new types, schemas, contracts, or functions. The "preplan import-rule wording" change is a prose alignment, not a contract change. The WP-specific constraint **"The preplan-wording fix must not change the *rule*"** (Non-Negotiable Constraints line 97) ensures contract preservation.

✅ Contract surface: untouched.

---

## Input Data Traceability Check

**N/A** — no data inputs (no card JSON, no schema files, no fixtures).

---

## Structural Readiness Check (Types & Contracts)

**N/A** — no TypeScript code, no Zod schemas, no contract files.

---

## Runtime Readiness Check (Mutation & Framework)

**N/A** — no runtime code, no `G` access, no boardgame.io integration, no framework touch.

---

## Maintainability & Upgrade Readiness (Senior Review)

| Concern | Verdict | Notes |
|---|---|---|
| Will future readers find the i18n posture? | ✅ | Section header `## Internationalization` + cross-link in `docs/02-ARCHITECTURE.md`. Plus 00.3 §17.1 #9 trigger forces future i18n-touching WPs to land in `## Vision Alignment` review. |
| Will the preplan-wording alignment hold under future edits? | ⚠ | Three files, three independent prose surfaces. If a future WP edits one file's preplan paragraph without grepping the other two, drift returns. **Mitigation:** WP-119 should add a one-line "if you change this, change the other two" cross-reference comment in each file. (See PS-3 — RECOMMENDED, not BLOCKING.) |
| Does the diagram update generalize? | ✅ | Adding a single `apps/replay-producer` node + Package Boundaries row is mechanically appendable; future apps follow the same pattern. |
| Does the deferred-i18n posture lock-in correctly? | ✅ | Scope §C explicitly forbids ad-hoc string abstraction. AC item 4 checks the prohibition is in the section text. Step 3c verification command makes the prohibition grep-able. |

---

## Code Category Boundary Check

**N/A** — no code touched. The Non-Negotiable Constraint "Files under `packages/`, `apps/`, `data/`, or any test files MUST NOT be modified" is enforced by Verification Step 5 (`git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` returns empty).

✅ Layer Boundary: untouched.

---

## Scope Lock (Critical)

### WP-119 Is Allowed To

- Add an `apps/replay-producer` node to the System Layers ASCII diagram in `docs/02-ARCHITECTURE.md` (appended only, no reflow).
- Add an `apps/replay-producer` row to the Package Boundaries table in `docs/02-ARCHITECTURE.md`.
- Pick **one** canonical phrasing for the preplan import rule and apply it consistently to the table entry and prose in `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, and `.claude/rules/architecture.md`. The recommended phrasing per Scope §B is "type-only imports at compile time; reads engine state via projections passed in by the host app".
- Add a new `## Internationalization` section to `docs/ai/ARCHITECTURE.md` (one paragraph; cite Vision §17 with the scoping caveat from PS-1; state the deferred posture; forbid ad-hoc string abstraction).
- Add a one-line summary of the i18n posture to `docs/02-ARCHITECTURE.md`.
- Append `D-11901` to `docs/ai/DECISIONS.md`.
- Update `docs/ai/STATUS.md` (one line).
- Check WP-119 off in `docs/ai/work-packets/WORK_INDEX.md`.

### WP-119 Is Explicitly NOT Allowed To

- Modify any file under `apps/`, `packages/`, `data/`, or any `*.test.ts` / `*.test.mjs` file.
- Modify `.claude/rules/*.md` other than `.claude/rules/architecture.md` (the preplan-wording alignment is the only `.claude/rules/` edit).
- Adopt or evaluate any i18n library (`vue-i18n`, `@formatjs/intl`, `react-intl`, etc.).
- Move, rename, or restructure existing System Layers diagram nodes.
- Edit historical WPs even if their preplan phrasing is now stale.
- Expand scope to a fourth drift item if one is noticed during execution (Non-Negotiable Constraints session protocol: STOP and add to a follow-up WP).
- Bundle WP-115/116/117/118 i18n-relevant prose into this WP's `## Internationalization` section.

### File Allowlist (6 files; cap = 8)

1. `docs/ai/ARCHITECTURE.md`
2. `docs/02-ARCHITECTURE.md`
3. `.claude/rules/architecture.md`
4. `docs/ai/DECISIONS.md`
5. `docs/ai/STATUS.md`
6. `docs/ai/work-packets/WORK_INDEX.md`

Verification Step 6 (`git diff --name-only`) must return exactly these six paths. Any other file modified → execution session is in scope-violation territory.

---

## Test Expectations (Locked Before Execution)

**No new tests.** **No baseline change expected.**

Engine baseline: `pnpm -r test` exits 0 with current pass/fail/suite counts. WP-119 must not shift these. Verification Step 7 enforces.

If `pnpm -r test` deltas appear post-execution: scope violation, abort, investigate.

---

## Mutation Boundary Confirmation

**N/A** — no code, no `G`, no `ctx`. The WP body explicitly forbids these via Non-Negotiable Constraints.

---

## Risk & Ambiguity Review (Resolve Now, Lock for Execution)

| # | Risk | Severity | Resolution |
|---|---|---|---|
| R-1 | Vision §17 over-citation (see Vision Sanity Check) | **BLOCKING** | PS-1 below. |
| R-2 | Preplan-wording attribution in Session Context is factually wrong | **BLOCKING** | PS-2 below. |
| R-3 | Lint Self-Review section is empty; the WP's own Context line says "To be filled in by the packet author before pre-flight invocation" | **BLOCKING** | PS-4 below. Ordering: this could be addressed during execution (the WP body is itself amendable), but the WP's own rule says it must precede pre-flight. Strict reading → resolve before execution. |
| R-4 | The three preplan-wording surfaces are more divergent than the WP's Session Context describes (see Risk Detail R-4 below) | **RISK / Recommended** | PS-3 below. |
| R-5 | `apps/replay-producer` is absent from the *entire* `docs/02-ARCHITECTURE.md`, not just the diagram. The WP's scope (one diagram node + one Package Boundaries row) leaves any prose enumerations of apps still incomplete | **RISK / Recommended** | PS-5 below. |
| R-6 | WORK_INDEX.md row at line 2429 still references the placeholder `D-NNN01` (predates the D-11901 fix) | **RISK / Recommended** | PS-6 below — paired update at execution time, not pre-flight blocking. |
| R-7 | The "identical canonical phrasing" requirement creates an obligation that future edits to any of the three files must keep them in sync (drift recurrence) | LOW | Mitigation in PS-3 (cross-reference comment); not blocking. |

### Risk Detail R-4 — Preplan-wording landscape (corrected)

The WP's Session Context says:

> The wording for `packages/preplan` import rules differs subtly between `docs/ai/ARCHITECTURE.md` ("read-only against engine projections") and `.claude/rules/architecture.md` / `docs/02-ARCHITECTURE.md` ("TYPE-only imports from engine").

**Actual state across the three files:**

| File | Line | Phrasing | Surface |
|---|---|---|---|
| `docs/ai/ARCHITECTURE.md` | 206 | `(types only)` | Layer Boundary import-rules table |
| `docs/ai/ARCHITECTURE.md` | 215 | `read-only toward the engine` | Prose, post-table |
| `docs/ai/ARCHITECTURE.md` | 270-279 | `read-only types`, `read-only state projections` | Pre-Planning Layer subsection prose |
| `docs/ai/ARCHITECTURE.md` | 317 | `(types only, read-only)` | Dependency Direction diagram |
| `docs/02-ARCHITECTURE.md` | 65 | `TYPE-only imports` (uppercase) | System Layers ASCII diagram |
| `docs/02-ARCHITECTURE.md` | 70-71 | `read-only against engine projections` | Prose under diagram |
| `docs/02-ARCHITECTURE.md` | 82 | `**types only**` (bold lowercase) | Package Boundaries table |
| `.claude/rules/architecture.md` | 163 | `(types only)` | Layer Boundary import-rules table |
| `.claude/rules/architecture.md` | 227-248 | `read-only types`, `read-only snapshots`, `(read-only types)` | Pre-Planning Layer subsection prose |
| `.claude/rules/architecture.md` | 289 | `(types only, read-only)` | Dependency Direction diagram |
| `.claude/rules/architecture.md` | 300 | `type-only permitted` | Forbidden-examples list |

**Two findings:**
1. The phrase "read-only against engine projections" attributed by the WP to `docs/ai/ARCHITECTURE.md` actually lives in `docs/02-ARCHITECTURE.md` (line 70-71). The WP swapped the file attribution.
2. The phrase "TYPE-only imports" (uppercase) is the only surface that uses uppercase TYPE — and it's only in `docs/02-ARCHITECTURE.md` line 65 (the ASCII diagram). All three files agree on lowercase `(types only)` in their tables.

The actual divergence the WP wants to fix is best characterized as **prose-vs-diagram capitalization drift in `docs/02-ARCHITECTURE.md`** plus **absence of a single canonical prose phrasing across the three Pre-Planning subsections** (each file's prose uses its own combination of "type-only", "types only", "read-only types", "read-only snapshots", "read-only against engine projections", "read-only toward the engine").

The WP's recommended canonical phrasing — "type-only imports at compile time; reads engine state via projections passed in by the host app" — is reasonable, but it must be applied to all of these surfaces (table + prose + diagram + forbidden-examples-list), not just one.

PS-2 below corrects the Session Context; PS-3 expands Scope §B to enumerate the surfaces explicitly so the executor doesn't miss one.

---

## Pre-Flight Verdict (Binary)

**Initial verdict (2026-04-30):** NOT READY. Three blocking findings (R-1, R-2, R-3) and three recommended actions (R-4, R-5, R-6).

**Final verdict (2026-04-30, after PS resolution):** ✅ **READY.** All blocking PS items resolved (PS-1, PS-2, PS-4); all recommended PS items accepted and applied (PS-3, PS-5, PS-6). WP-119 is execution-ready under a new session. See Pre-Flight Verdict Disposition below for the full sign-off.

---

## Pre-Session Actions (PS-N)

### PS-1 (BLOCKING) — Correct Vision §17 framing in Vision Alignment + Scope §C + AC

**Problem:** Vision §17 covers Accessibility & Inclusivity, not internationalization. WP-119's `## Vision Alignment` block and Scope §C imply Vision §17 has an i18n posture; it does not.

**Required edits to WP-119 body:**

1. **`## Vision Alignment` block** — replace:

   > **Vision clauses touched:** §17 (Accessibility / Internationalization). NG-1..NG-7 not crossed.

   with:

   > **Vision clauses touched:** §17 (Accessibility & Inclusivity) — cited as the lint-trigger anchor per 00.3 §17.1 #9. **Note:** Vision §17 itself covers accessibility (keyboard nav, screen-reader support, high-contrast modes, color-blind indicators), not internationalization. This WP fills the vision-level i18n gap at the architecture-doc level. NG-1..NG-7 not crossed.

   And replace:

   > **Conflict assertion:** No conflict — the WP commits to "deferred", which is consistent with §17 not having committed to a specific i18n implementation.

   with:

   > **Conflict assertion:** No conflict. Vision §17 is silent on i18n; deferral here neither contradicts nor expands §17. Future i18n adoption that touches accessibility surfaces (e.g., RTL layouts that affect screen-reader order) will trigger §17 review properly.

2. **Scope §C** — augment the section requirement:

   > The section MUST include the literal string `Vision §17` AND a one-sentence acknowledgment that Vision §17 covers accessibility (not i18n), and that this WP fills the vision-level i18n gap at the architecture-doc level.

3. **Acceptance Criteria — i18n group** — replace:

   > Section cites Vision §17 (literal string `Vision §17` appears within the section)

   with:

   > Section cites Vision §17 (literal string `Vision §17` appears within the section) AND explicitly acknowledges Vision §17 covers accessibility, not i18n

4. **D-11901 entry body** must include the same scoping note: cite Vision §17 as the trigger anchor; explicitly state Vision §17 does not address i18n; state that this decision fills that gap at the architecture-doc level until a future Vision-amendment WP closes it at the vision level (out of scope for WP-119).

**Why blocking:** Without this correction, the WP creates a pseudo-citation that future readers will follow back to Vision §17 expecting i18n authority and find none. That's exactly the kind of "explicit decision, no silent drift" anti-pattern Vision §14 forbids.

---

### PS-2 (BLOCKING) — Correct preplan-wording attribution in Session Context

**Problem:** The Session Context paragraph item 2 says:

> The wording for `packages/preplan` import rules differs subtly between `docs/ai/ARCHITECTURE.md` ("read-only against engine projections") and `.claude/rules/architecture.md` / `docs/02-ARCHITECTURE.md` ("TYPE-only imports from engine").

This is factually wrong on two counts (per Risk Detail R-4):
1. "read-only against engine projections" appears in `docs/02-ARCHITECTURE.md` (line 70-71), not `docs/ai/ARCHITECTURE.md`.
2. The "TYPE-only imports" uppercase phrasing appears **only** in `docs/02-ARCHITECTURE.md` line 65 (the ASCII diagram), not across two files.

**Required edit:** Replace Session Context item 2 with:

> The wording for `packages/preplan` import rules currently uses three coexisting phrasings across the architecture surface — `(types only)` in import-rules tables (consistent across all three files); `TYPE-only imports` (uppercase) in the `docs/02-ARCHITECTURE.md` diagram; `read-only against engine projections` in `docs/02-ARCHITECTURE.md` prose; `read-only types` / `read-only snapshots` / `read-only toward the engine` in `docs/ai/ARCHITECTURE.md` and `.claude/rules/architecture.md` Pre-Planning Layer prose. Each individual phrasing is correct; the inconsistency creates a future-reader risk that someone will infer two different rules. This WP picks one canonical prose phrasing and propagates it across all surfaces.

**Why blocking:** The Session Context is the executor's read-first orientation. Wrong attribution wastes execution time when the executor opens the wrong file looking for the wrong string. Worse, it suggests the WP author didn't verify the claim — which weakens reviewer trust in the rest of the WP.

---

### PS-3 (RECOMMENDED — not blocking) — Expand Scope §B to enumerate all preplan surfaces

**Problem:** Scope §B currently says "Apply to the preplan paragraph + any table entry" for each file. Per Risk Detail R-4, each file has 3-4 surfaces. An executor reading "the preplan paragraph" may align only one of them and leave the others.

**Recommended edit:** Replace Scope §B with an explicit per-file surface enumeration:

> ### B) Preplan-wording alignment
>
> Pick one canonical phrasing for the preplan import rule. Recommended: "type-only imports at compile time; reads engine state via projections passed in by the host app". Apply to **every** preplan-describing surface in each of the three files:
>
> - **`docs/ai/ARCHITECTURE.md`** — modified:
>   - Import-rules table row (line ~206): canonical phrasing in the "May import" cell
>   - Pre-Planning Layer prose (line ~215): canonical phrasing in the post-table sentence
>   - Pre-Planning Layer subsection (line ~270-279): canonical phrasing in the "May" / "Direction" sub-points
>   - Dependency Direction diagram (line ~317): canonical phrasing in the parenthetical
> - **`docs/02-ARCHITECTURE.md`** — modified:
>   - System Layers ASCII diagram (line ~65): canonical phrasing in the preplan box (replacing `TYPE-only imports`)
>   - Prose under diagram (line ~70-71): canonical phrasing in the "read-only against engine projections" sentence
>   - Package Boundaries table (line ~82): canonical phrasing in the "May Import" cell
> - **`.claude/rules/architecture.md`** — modified:
>   - Import-rules table row (line ~163): canonical phrasing in the "May import" cell
>   - Pre-Planning Layer subsection (line ~227-248): canonical phrasing in the "May" / "Direction" sub-points
>   - Dependency Direction diagram (line ~289): canonical phrasing in the parenthetical
>   - Forbidden-examples list (line ~300): canonical phrasing or kept synonym (`type-only permitted`)
>
> Add a one-line cross-reference comment to each file's Pre-Planning section: `<!-- canonical phrasing per WP-119; if you edit this, sync the other two files -->`.

**Why recommended:** Without this, a partial alignment is the most likely execution outcome (the executor finds the obvious surface in each file and stops). The cross-reference comments are the drift-prevention mechanism.

**Why not blocking:** Even a partial alignment is strictly better than the current state, and the canonical phrasing requirement (AC item: "use identical canonical phrasing") still forces re-read at execution. But the AC verification (Step 2 grep for "type-only") only catches surfaces where the canonical phrasing actually lands — surfaces left with the old phrasing are silently invisible to the verification.

---

### PS-4 (BLOCKING) — Fill in Lint Self-Review §1-§20

**Problem:** WP-119 line 245 says:

> ## Lint Self-Review
> > To be filled in by the packet author before pre-flight invocation.

The section is empty. The WP's own rule says it must precede pre-flight. The user is asking for pre-flight now. Strict reading: the lint self-review must complete before this pre-flight is normative.

**Required:** Run the 00.3 lint self-review against WP-119 and fill in PASS / N/A with one-line justification per §1-§20. Most sections will be N/A for this governance-only WP. Sections that must be PASS-justified explicitly:
- §7 (Forbidden packages) — PASS, no new dependencies
- §10 (File-count cap) — PASS, 6 files, under the ~8 cap
- §17 (Vision Alignment) — PASS after PS-1 lands; trigger #9 confirmed
- §18 (Prose-vs-Grep Discipline) — verify the i18n section's prose doesn't contain forbidden tokens that the verification grep would match-by-accident
- §20 (Funding Surface Gate) — N/A justified

**Pragmatic resolution:** Either the user fills this in before execution, or it's done as the first task of the executing session before any doc edits are made. Either way, it must precede the actual edits.

**Why blocking:** It's the WP's own rule. Bypassing it would be procedural drift exactly of the kind §14 forbids.

---

### PS-5 (RECOMMENDED — not blocking) — Clarify replay-producer scope edge case

**Problem:** `apps/replay-producer` is missing from the entire `docs/02-ARCHITECTURE.md` document, not just the System Layers diagram (verified by grep returning zero matches in the whole file). The WP's scope (one diagram node + one Package Boundaries row) is sufficient to fix the diagram and the table, but any prose elsewhere in the doc that enumerates apps will remain incomplete.

**Recommended edit:** Add to Out of Scope:

> - **No prose enumeration audit.** This WP only adds `apps/replay-producer` to the System Layers diagram and the Package Boundaries table. Other prose in `docs/02-ARCHITECTURE.md` that enumerates apps (e.g., monorepo-overview paragraphs) may remain incomplete; a follow-up WP can do that audit. Hygiene is bounded.

**Why recommended:** Closes a possible scope-creep ambiguity. Without it, an executor could reasonably ask "should I also add replay-producer to the monorepo-overview prose?" and either answer (yes / no) is defensible — better to lock the answer to "no, follow-up WP" up front.

**Why not blocking:** The WP's existing "no while-I'm-here rewrites" rule already covers this, but explicit is better than implicit for an executor under time pressure.

---

### PS-6 (RECOMMENDED — not blocking) — WORK_INDEX row D-11901 sync

**Problem:** WORK_INDEX.md line 2429 still references "One `D-NNN01` entry for i18n posture" — predates the D-NNN01 → D-11901 fix.

**Recommended edit:** Update the WORK_INDEX row to read "One `D-11901` entry for i18n posture" as part of the WP-119 close-out commit. This is a paired update that lands with WP-119's WORK_INDEX check-off, not a separate edit.

**Why not blocking:** The check-off itself is in scope for WP-119 (Files Expected to Change line 153). The placeholder-fix is mechanical and lands naturally during the WP-119 commit. Pre-flight just flags it so it isn't forgotten.

---

## Authorized Next Step

**The WP is NOT YET READY for execution.** PS-1, PS-2, PS-4 are blocking and must land in the WP body before the executing session begins.

PS-3, PS-5, PS-6 are strongly recommended; the user can accept them, downgrade them to in-execution adjustments, or reject them with a one-line justification.

**Recommended sequence:**
1. User reviews this pre-flight.
2. PS-1 + PS-2 land as direct edits to `docs/ai/work-packets/WP-119-architecture-doc-hygiene.md` (single `SPEC:` commit; the WP body is itself a doc).
3. PS-3, PS-5, PS-6 either land alongside or are explicitly deferred with a note.
4. PS-4 (Lint Self-Review) is filled in either by the user or as the first action of the executing session.
5. Once PS-1/2/4 are resolved, this pre-flight document is amended at the bottom with "Pre-Session Actions — ALL RESOLVED YYYY-MM-DD" and execution can begin under a new session.

**Pre-flight file disposition:** Per `.claude/rules/work-packets.md`, this file lives in `docs/ai/invocations/` as a scratchpad-by-default. WP-119 does not currently cite it as a normative artifact; it is informational. If the user wants this committed for traceability, `git add -f` per the override clause.

---

## Findings — Compact Summary

| # | Finding | Severity | PS-N |
|---|---|---|---|
| 1 | Vision §17 covers accessibility, not i18n; WP over-cites it as i18n authority | **BLOCKING** | PS-1 |
| 2 | Session Context attributes "read-only against engine projections" to the wrong file | **BLOCKING** | PS-2 |
| 3 | Lint Self-Review section is empty; WP's own rule requires it before pre-flight | **BLOCKING** | PS-4 |
| 4 | Preplan-wording divergence is more complex than Session Context describes; surfaces enumeration is incomplete | RECOMMENDED | PS-3 |
| 5 | `apps/replay-producer` is absent from entire `02-ARCHITECTURE.md`, not just diagram; scope edge case | RECOMMENDED | PS-5 |
| 6 | WORK_INDEX row still has `D-NNN01` placeholder (predates the D-11901 fix) | RECOMMENDED | PS-6 |

**Strengths preserved (do not change):**
- D-10001-aligned no-EC rationale is correct.
- D-11901 numbering is correct and unused.
- File scope (6 files, well under cap) is realistic.
- "No while-I'm-here rewrites" rule is appropriate for a hygiene WP.
- The stealth-i18n-drift exclusion (Scope §C "ad-hoc string abstraction prohibited") is the substantive governance lock that justifies this WP existing at all.
- §20 Funding Surface Gate N/A justification is correct.
- Verification Steps 3b / 3c / 4 / 5 / 6 are binary-pass/fail.

---

## Pre-Flight Verdict Disposition

- [x] PS-1 resolved 2026-04-30 — Vision Alignment block, Scope §C, AC i18n group, and D-11901 entry-body requirement all amended in WP-119 body. New verification Step 3d added as soft check for the accessibility-acknowledgment sentence.
- [x] PS-2 resolved 2026-04-30 — Session Context item 2 rewritten with corrected file attribution and full preplan-wording landscape (3 coexisting phrasings, surface enumeration). Cross-link back to this pre-flight added.
- [x] PS-3 **accepted** 2026-04-30 — Scope §B rewritten as a per-file surface enumeration (4 surfaces in `docs/ai/ARCHITECTURE.md`, 3 in `docs/02-ARCHITECTURE.md`, 4 in `.claude/rules/architecture.md`). Cross-reference HTML comment requirement added at each Pre-Planning Layer subsection header. Partial alignment is now explicitly forbidden by the binding surface list.
- [x] PS-4 resolved 2026-04-30 — `## Lint Self-Review` filled with §1–§20 grid: 14 PASS, 6 N/A, 0 FAIL. §14 marked PASS-with-note (16 AC items vs the 6–12 soft recommendation; justified by 4 independent drift fixes). Surfaced a cross-file finding (WP-118/116 miscite 8-file cap as §10 — should be §5) flagged for a future hygiene WP, not a WP-119 issue.
- [x] PS-5 **accepted** 2026-04-30 — New Out of Scope bullet added: "No prose enumeration audit beyond the three Scope §A/§B/§C surfaces". Locks the executor's interpretation to "diagram + Package Boundaries row only"; defers any monorepo-overview prose audit to a follow-up hygiene WP.
- [x] PS-6 **accepted** 2026-04-30 — Files Expected to Change line for `WORK_INDEX.md` updated to require both edits in the close-out commit: (a) check off WP-119 row with date + commit hash, (b) fix the stale `D-NNN01` placeholder in the row body (line ~2429) to read `D-11901`. Both edits in the same close-out commit; no separate commit.
- [x] Pre-flight verdict flipped from NOT READY → **READY** 2026-04-30. All blocking items resolved; all recommended items accepted and applied to WP-119 body.

**Status as of 2026-04-30 (FINAL):** WP-119 is execution-ready. The executing session under a new conversation context may proceed using this pre-flight as the authoritative scope-lock reference. PS items map to specific WP-119 body sections so the executor can re-verify alignment without re-reading this file in full.

When all blocking items are unchecked, this pre-flight remains binding. When all blocking items are checked and the verdict is flipped, the executing session may proceed under a new conversation context with this file as the authoritative scope-lock reference.
