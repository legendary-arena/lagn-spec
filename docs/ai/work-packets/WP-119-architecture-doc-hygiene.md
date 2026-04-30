# WP-119 — Architecture Doc Hygiene

**Status:** Draft (stub — pre-lint, pre-pre-flight)
**Primary Layer:** Governance / Documentation (no code; pure doc edits)
**Dependencies:** None — these are independent low-risk doc cleanups.

---

## Session Context

Three small drift items in `docs/02-ARCHITECTURE.md` and `docs/ai/ARCHITECTURE.md` were identified during a 2026-04-29 architecture review:

1. The `apps/replay-producer` package (D-6301, WP-063) has shipped but is missing from the System Layers ASCII diagram in `docs/02-ARCHITECTURE.md`.
2. The wording for `packages/preplan` import rules currently uses three coexisting phrasings across the architecture surface — `(types only)` in import-rules tables (consistent across all three files); `TYPE-only imports` (uppercase) in the `docs/02-ARCHITECTURE.md` System Layers ASCII diagram (line 65 only); `read-only against engine projections` in `docs/02-ARCHITECTURE.md` prose (line 70-71); `read-only types` / `read-only snapshots` / `read-only toward the engine` in `docs/ai/ARCHITECTURE.md` and `.claude/rules/architecture.md` Pre-Planning Layer prose. Each individual phrasing is correct; the inconsistency creates a future-reader risk that someone will infer two different rules. This WP picks one canonical prose phrasing and propagates it across all surfaces. (Pre-flight 2026-04-30 corrected the original Session Context which had attributed "read-only against engine projections" to the wrong file — see [preflight-wp119.md](../invocations/preflight-wp119.md) PS-2.)
3. The architecture doc has no stated posture on internationalization (i18n). The MVP is English-only; absent a written line, this gap will be relitigated each time a UI WP touches user-visible text.

This packet bundles all three into a single doc-hygiene WP.

---

## Goal

After this session:

- `apps/replay-producer` appears in the System Layers diagram in `docs/02-ARCHITECTURE.md` as a CLI consumer of `packages/game-engine`.
- The preplan import-rule wording uses identical canonical phrasing across `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, and `.claude/rules/architecture.md`.
- A new one-paragraph `## Internationalization` section exists in `docs/ai/ARCHITECTURE.md` (and a one-line summary in `docs/02-ARCHITECTURE.md`) stating: "MVP is English-only; i18n is deferred; no `i18n` library is adopted; user-visible strings live where they are used."
- A single `D-11901` entry in `DECISIONS.md` anchors the i18n posture (the diagram and wording fixes are pure cleanups, no decision).

This WP changes no code, no tests, no contracts, no APIs.

---

## Vision Alignment

> Trigger surfaces from §17.1:
> - #9 (Accessibility or internationalization surfaces — Vision §17): **Triggered** by the i18n posture line.

**Vision clauses touched:** §17 (Accessibility & Inclusivity) — cited as the lint-trigger anchor per 00.3 §17.1 #9. **Note:** Vision §17 itself covers accessibility (keyboard nav, screen-reader support, high-contrast modes, color-blind indicators), not internationalization. This WP fills the vision-level i18n gap at the architecture-doc level. NG-1..NG-7 not crossed.

**Conflict assertion:** No conflict. Vision §17 is silent on i18n; deferral here neither contradicts nor expands §17. Future i18n adoption that touches accessibility surfaces (e.g., RTL layouts that affect screen-reader order) will trigger §17 review properly.

**Determinism preservation:** N/A — no engine / replay / RNG surface touched.

**§20 Funding Surface Gate:** N/A — pure documentation cleanup; no funding affordances per WP-097 §A/§B/§C; no user-visible copy referencing donations or tournament funding.

---

## Execution Checklist (EC)

**No EC is required for WP-119.** No `EC-*-*.checklist.md` file is created for this WP; no `EC_INDEX.md` row is added. This Work Packet is the sole authoritative execution contract.

> **Slot-naming note:** Per repo precedent, EC slot numbers do not have to match WP numbers (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-102 → EC-117, EC-111 → EC-118, etc.). The EC-119 slot is already occupied by `EC-119-public-leaderboard-http-endpoints.checklist.md` (WP-115). This is irrelevant to WP-119 because no EC file is created.

**Rationale:** WP-119 matches the D-10001 risk profile (binary-verifiable, no engine mutation, no persistence, no ordering surface, no irreversible side effects). It modifies only `docs/**` and `.claude/rules/**` — **no files under `packages/` or `apps/` are staged**, so the commit-msg hook (`.githooks/commit-msg` Rule 5) does not require an `EC-###:` prefix and the D-10001 Amendment 2026-04-26 stub-workaround does not apply. WP-119 commits use `SPEC:` prefix, which Rule 5 permits when no code is staged.

The verification machinery an EC would normally extract is already inlined: `## Acceptance Criteria` carries 16 binary checks across four sub-groups (Diagram / Preplan wording / i18n / Hygiene); `## Verification Steps` carries 9 `Select-String` / `git diff` / `pnpm` commands; `## Definition of Done` re-asserts the build / test / scope gates. A separate EC would duplicate these without adding new safeguards.

**Citation:** `DECISIONS.md` D-10001 + Amendment 2026-04-26 (controlling precedent for no-EC WPs).

---

## Assumes

- `docs/02-ARCHITECTURE.md` and `docs/ai/ARCHITECTURE.md` exist.
- `.claude/rules/architecture.md` exists and contains the preplan import-rule table.
- `apps/replay-producer/package.json` exists (confirms the package is real).
- `docs/ai/DECISIONS.md` exists.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/02-ARCHITECTURE.md` — full read; locate the System Layers ASCII diagram and the preplan reference.
- `docs/ai/ARCHITECTURE.md` — full read; locate the preplan section + identify the right insertion point for the new `## Internationalization` section.
- `.claude/rules/architecture.md` — full read; locate the preplan row in the import-rules table and the prose under "Pre-Planning Layer".
- `apps/replay-producer/package.json` and `apps/replay-producer/src/cli.ts` — read to confirm what to render in the diagram (CLI tool, consumes `@legendary-arena/game-engine` only, no DB / no network).
- `docs/ai/DECISIONS.md` — read recent entries to match D-NNNN format.
- `docs/01-VISION.md §17` — confirm i18n posture matches vision.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — applies to prose written into the doc
- Full file contents for every modified file — no diffs, no snippets

**Packet-specific:**
- **No code changes.** Files under `packages/`, `apps/`, `data/`, or any test files MUST NOT be modified.
- **No content changes beyond the three identified items.** This is a hygiene WP, not a "while I'm here" rewrite. If other drift is noticed, log it as a follow-up WP rather than fixing inline.
- **The preplan-wording fix must not change the *rule*.** Both phrasings already encode the same constraint; this WP picks one canonical phrasing and propagates. The semantics MUST NOT shift.
- **The replay-producer diagram addition must not move existing nodes.** Add to the diagram; do not redraw.
- **The i18n posture is "deferred"** — do not commit to a specific library or strategy. Future WPs that adopt i18n make their own decision.

**Session protocol:**
- If a fourth drift item is noticed during reading, STOP and add it to a follow-up WP — do not extend this WP's scope.

**Locked contract values:**
- N/A — this WP touches no engine constants.

**Forbidden packages (per `00.3 §7`):**
- This WP introduces none. No `vue-i18n`, `@formatjs/intl`, etc.

---

## Scope (In)

### A) Diagram update
- **`docs/02-ARCHITECTURE.md`** — modified: extend the System Layers ASCII diagram to show `apps/replay-producer` as a CLI box consuming `packages/game-engine` (one new node, one new edge). Add a row to the Package Boundaries table covering `apps/replay-producer` (mirrors the existing rows).
- The new `apps/replay-producer` node is **appended** to the existing diagram without reflowing or reordering existing rows or columns. Existing nodes, edges, and table rows MUST NOT be edited.

### B) Preplan-wording alignment

Pick one canonical phrasing for the preplan import rule. Recommended: **"type-only imports at compile time; reads engine state via projections passed in by the host app"**. Apply to **every** preplan-describing surface in each of the three files. Per pre-flight PS-3, partial alignment (one surface per file, missing the rest) is the most likely execution failure mode and is explicitly forbidden — the surface enumeration below is binding.

- **`docs/ai/ARCHITECTURE.md`** — modified:
  - Import-rules table row (line ~206): canonical phrasing in the "May import" cell
  - Pre-Planning Layer prose (line ~215): canonical phrasing in the post-table sentence ("read-only toward the engine")
  - Pre-Planning Layer subsection (line ~270-279): canonical phrasing in the "May" / "Direction" sub-points (currently uses "read-only types", "read-only state projections")
  - Dependency Direction diagram (line ~317): canonical phrasing in the parenthetical (currently `(types only, read-only)`)
- **`docs/02-ARCHITECTURE.md`** — modified:
  - System Layers ASCII diagram (line ~65): canonical phrasing in the preplan box (replacing `TYPE-only imports`)
  - Prose under diagram (line ~70-71): canonical phrasing in the "read-only against engine projections" sentence
  - Package Boundaries table (line ~82): canonical phrasing in the "May Import" cell (currently `**types only**`)
- **`.claude/rules/architecture.md`** — modified:
  - Import-rules table row (line ~163): canonical phrasing in the "May import" cell (currently `(types only)`)
  - Pre-Planning Layer subsection (line ~227-248): canonical phrasing in the "May" / "Direction" sub-points (currently uses "read-only types", "read-only snapshots", "(read-only types)")
  - Dependency Direction diagram (line ~289): canonical phrasing in the parenthetical (currently `(types only, read-only)`)
  - Forbidden-examples list (line ~300): canonical phrasing OR retained synonym (`type-only permitted`) — synonym permitted here since the line is a forbidden-examples enumeration, not a positive rule statement

Add a one-line HTML cross-reference comment immediately above each file's Pre-Planning Layer subsection header: `<!-- canonical phrasing per WP-119; if you edit this section, sync the other two files (docs/ai/ARCHITECTURE.md, docs/02-ARCHITECTURE.md, .claude/rules/architecture.md) -->`. This is the drift-prevention mechanism — without it, future edits to one file silently re-introduce divergence.

### C) i18n posture
- **`docs/ai/ARCHITECTURE.md`** — modified: add `## Internationalization` section (one paragraph). The section MUST include the literal string `Vision §17` AND a one-sentence acknowledgment that Vision §17 covers accessibility (not i18n), and that this WP fills the vision-level i18n gap at the architecture-doc level until a future Vision-amendment WP closes it at the vision level (out of scope for WP-119). State that MVP is English-only, i18n is deferred, no library is adopted, user-visible strings live where they are used.
- The section MUST also state that **future i18n adoption requires a dedicated WP and a `DECISIONS.md` entry**; ad-hoc string abstraction (e.g., `/locales/en/...`, `t('...')` wrappers, premature key extraction) is prohibited until that WP lands. This forecloses "soft i18n" creep.
- **`docs/02-ARCHITECTURE.md`** — modified: add a one-line summary under the relevant section pointing to the authoritative version.
- **`docs/ai/DECISIONS.md`** — modified: append `D-11901` anchoring the deferred-i18n posture. The D-11901 entry body MUST include the same scoping note as the architecture-doc section: cite Vision §17 as the lint-trigger anchor only; explicitly state Vision §17 does not address i18n; state that D-11901 fills that gap at the architecture-doc level until a future Vision-amendment WP closes it at the vision level.

### D) STATUS + WORK_INDEX
- **`docs/ai/STATUS.md`** — modified: one-line capability statement ("Architecture-doc hygiene cleanup at WP-119; i18n posture: deferred").
- **`docs/ai/work-packets/WORK_INDEX.md`** — modified: check WP-119 off.

---

## Out of Scope

- **No code changes.** Strictly doc hygiene.
- **No new architecture sections** beyond `## Internationalization`. The WP-116 / WP-117 / WP-118 sections are separate WPs.
- **No i18n library evaluation** or strategy work — the posture is "deferred".
- **No replay-producer behavior changes.** The CLI is unchanged; only its diagram representation is added.
- **No `.claude/rules/*.md` rewrites** beyond the preplan-wording alignment.
- **No retroactive changes** to historical WPs even if they used the older preplan phrasing — they are immutable per `.claude/rules/work-packets.md`.
- **No prose enumeration audit beyond the three Scope §A / §B / §C surfaces.** This WP only adds `apps/replay-producer` to the System Layers ASCII diagram and the Package Boundaries table. Other prose in `docs/02-ARCHITECTURE.md` that enumerates apps (e.g., monorepo-overview paragraphs, narrative descriptions of the project's app surface) may remain incomplete with respect to `apps/replay-producer`; a follow-up hygiene WP can do that audit if drift becomes load-bearing. Per pre-flight PS-5, hygiene is bounded.

---

## Files Expected to Change

- `docs/ai/ARCHITECTURE.md` — **modified** — preplan wording + new `## Internationalization` section
- `docs/02-ARCHITECTURE.md` — **modified** — diagram update + preplan wording + i18n one-liner
- `.claude/rules/architecture.md` — **modified** — preplan wording alignment
- `docs/ai/DECISIONS.md` — **modified** — D-11901 (i18n posture)
- `docs/ai/STATUS.md` — **modified** — capability line
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-119 row with date + commit hash. Per pre-flight PS-6, the close-out commit MUST also fix the stale `D-NNN01` placeholder in the WP-119 reservation row body (line ~2429) to read `D-11901` (the resolved decision ID). Both edits — placeholder fix + check-off — happen in the same close-out commit; no separate commit.

6 files. Well under the 8-file cap.

No other files may be modified.

---

## Acceptance Criteria

### Diagram
- [ ] `docs/02-ARCHITECTURE.md` System Layers diagram contains a node labeled `apps/replay-producer` (or equivalent)
- [ ] The diagram shows an edge from `apps/replay-producer` into `packages/game-engine` (CLI consumer)
- [ ] No other diagram nodes were removed or moved
- [ ] Package Boundaries table contains a row for `apps/replay-producer`

### Preplan wording
- [ ] `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, and `.claude/rules/architecture.md` use identical canonical phrasing for the preplan import rule
- [ ] The semantic constraint (type-only imports, no runtime engine code, no boardgame.io import, no writes to G/ctx) is preserved

### i18n
- [ ] `docs/ai/ARCHITECTURE.md` contains `## Internationalization` section
- [ ] Section explicitly says: MVP is English-only, i18n is deferred, no library adopted
- [ ] Section cites Vision §17 (literal string `Vision §17` appears within the section) AND explicitly acknowledges Vision §17 covers accessibility, not i18n
- [ ] Section explicitly forbids ad-hoc string abstraction and requires a future dedicated WP + `DECISIONS.md` entry to introduce i18n
- [ ] `docs/02-ARCHITECTURE.md` has the one-line summary + cross-link
- [ ] `docs/ai/DECISIONS.md` contains `D-11901` for the i18n posture

### Hygiene
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-119 checked off with date + commit hash
- [ ] No code files modified (`git diff -- 'apps/**' 'packages/**' 'data/**'` is empty)
- [ ] No files outside `## Files Expected to Change` modified

---

## Verification Steps

```pwsh
# Step 1 — replay-producer in diagram
Select-String -Path "docs\02-ARCHITECTURE.md" -Pattern "replay-producer"
# Expected: at least one match inside the System Layers section + one in the Package Boundaries table

# Step 2 — preplan wording is consistent across all three files
Select-String -Path "docs\ai\ARCHITECTURE.md","docs\02-ARCHITECTURE.md",".claude\rules\architecture.md" -Pattern "type-only" -Context 0,1
# Expected: matches in all three files using the same canonical phrasing

# Step 3 — i18n section exists
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "^## Internationalization"
# Expected: one match

# Step 3b — i18n section cites Vision §17 verbatim
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "Vision §17"
# Expected: at least one match (within the Internationalization section body)

# Step 3c — i18n section forecloses ad-hoc string abstraction
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "ad-hoc|dedicated WP"
# Expected: at least one match within the Internationalization paragraph

# Step 3d — i18n section explicitly scopes Vision §17 to accessibility
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "accessibility" -Context 0,2
# Expected: at least one match within the Internationalization section body acknowledging that Vision §17 covers accessibility (not i18n). Soft check — visual inspection confirms the acknowledgment sentence is present per PS-1.

# Step 4 — i18n DECISIONS entry
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^### D-11901"
# Expected: one match

# Step 5 — no code touched
git diff --name-only -- "apps/**" "packages/**" "data/**"
# Expected: no output

# Step 6 — scope check
git diff --name-only
# Expected: only the six files in ## Files Expected to Change

# Step 7 — full test suite regression check
pnpm -r test
# Expected: exits 0; baseline unchanged (no code changes should mean no test deltas)
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm -r test` exits 0
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated with D-11901
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-119 checked off with today's date + commit hash
- [ ] No files outside `## Files Expected to Change` modified
- [ ] Lint-gate self-review passes (§17 i18n trigger confirmed; §20 N/A justified)

---

## Lint Self-Review

> Run against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §1–§20. Date filled: 2026-04-30. Filled after PS-1 + PS-2 of [preflight-wp119.md](../invocations/preflight-wp119.md) landed.

| § | Title | Status | Justification |
|---|---|---|---|
| 1 | Work Packet Structure | **PASS** | All 10 required sections present and non-empty: Goal (line 21), Assumes (63), Context (Read First) (74), Scope (In) (112), Out of Scope (135), Files Expected to Change (146), Non-Negotiable Constraints (87), Acceptance Criteria (161), Verification Steps (189), Definition of Done (235). Out of Scope explicitly excludes 6 things (no code changes, no new sections, no library evaluation, no replay-producer behavior, no rules rewrites, no retroactive WP edits). |
| 2 | Non-Negotiable Constraints Block | **PASS** | Engine-wide constraints state ESM/Node v22+, full file contents, code-style ref to `00.6-code-style.md`. Packet-specific constraints cover the 5 substantive locks (no code changes, no scope creep, semantic-preservation of preplan rule, no diagram reflow, deferred-i18n posture). Session protocol present (STOP if a fourth drift item appears). Locked contract values N/A — explicitly noted. No body/constraint contradictions. |
| 3 | Prerequisites (`## Assumes`) | **PASS** | All four assumptions are factual file-existence checks (`docs/02-ARCHITECTURE.md`, `docs/ai/ARCHITECTURE.md`, `.claude/rules/architecture.md` with the preplan import-rule table, `apps/replay-producer/package.json`, `docs/ai/DECISIONS.md`). Each one would silently fail this WP if absent (executor would either skip the diagram update or fail the cross-file alignment check). All four were verified present at pre-flight 2026-04-30. |
| 4 | Context References (`## Context (Read First)`) | **PASS** | Six specific docs listed, each with a sub-task instruction (full read / locate / read to confirm). Includes `docs/ai/ARCHITECTURE.md` (the boundary-touching authoritative doc), `docs/ai/DECISIONS.md` (the prior-decision scan), `.claude/rules/architecture.md` (the layer-boundary enforcement view), `docs/01-VISION.md §17` (the vision-trigger anchor). 00.2 not listed — N/A; this WP touches no card data or schemas. |
| 5 | Output Completeness | **PASS** | 6 files listed with `— modified` markers and one-line descriptions. Under the `~8 files` soft cap (line 126 of 00.3 — note this is in §5, not §10 as some other WPs have miscited). No ambiguous output language ("modify the existing", "show the diff", "add the following code") anywhere in the WP body. Every file referenced in the body (e.g., `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md`) appears in the Files list. |
| 6 | Naming Consistency | **PASS** | WP-119 introduces no new field/parameter/file names. Names mentioned (`apps/replay-producer`, `packages/preplan`, `packages/game-engine`, `Vision §17`, `D-11901`, `D-6301`, `WP-063`) all match canonical usage in their source docs. No setup-payload, card-data, or boardgame.io-contract names touched. |
| 7 | Dependency Discipline | **PASS** | Forbidden-packages block at line 107-108 explicitly excludes `vue-i18n`, `@formatjs/intl`. No new dependencies introduced; the i18n posture is "deferred — no library adopted". §C explicitly forbids ad-hoc string abstraction (forecloses sneak-imports of i18n libraries via "we just need a tiny helper"). |
| 8 | Architectural Boundaries | **PASS** | No code touched (Verification Step 5: `git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` must be empty). Backend / Game Logic / Frontend / Scripts subsections are all N/A — pure doc-edit. The Layer Boundary semantics in `.claude/rules/architecture.md` are preserved by the Non-Negotiable Constraint that the preplan-wording fix MUST NOT change the rule (line 97). |
| 9 | Windows Compatibility | **PASS** | Verification Steps use `pwsh` syntax (`Select-String`, `Test-Path` not used here but `git diff` and `pnpm` are cross-platform). Path separators in grep targets use `\` (e.g., `docs\ai\ARCHITECTURE.md`, `docs\02-ARCHITECTURE.md`, `.claude\rules\architecture.md`). No bash-isms (`grep`, `sed`, `awk`, Unix-only `diff`). |
| 10 | Environment Variable Hygiene | **N/A** | Pure doc-hygiene WP. No environment variables introduced, modified, or referenced. No `.env.example` updates. No secrets. No `VITE_` frontend-exposed vars. No JWT_SECRET use. The N/A justification names *why*: docs-only WP; no runtime, no build, no deploy surface touched. |
| 11 | Authentication Clarity | **N/A** | No auth surfaces touched. No identity-model commitments. No JWT use. No protected-endpoint definitions. The WP touches Vision §17 (Accessibility) — entirely orthogonal to identity (Vision §3 / §11). The N/A justification names *why*: doc-hygiene WP with no endpoint, session, or identity-model surface. |
| 12 | Test Quality | **N/A** | No tests produced. Verification Step 7 (`pnpm -r test`) is a regression check, not new-test creation; expected behavior is exits 0 with baseline counts unchanged (since no code is touched, no test deltas can occur). The N/A justification names *why*: doc-only WP; tests are run only as a no-delta regression sanity check. |
| 13 | Commands and Verification | **PASS** | Verification Steps 1–7 are exact `Select-String` / `git diff` / `pnpm` commands with explicit "Expected:" lines. All `pnpm` (not `npm run`). Steps 3b / 3c / 3d added during PS-1 to verify the new compound i18n AC items. Step 5 (no-code) and Step 6 (scope) provide hard scope-boundary enforcement. |
| 14 | Acceptance Criteria Quality | **PASS (with note)** | 16 binary observable items across 4 sub-groups (Diagram / Preplan wording / i18n / Hygiene). Above the recommended 6–12 range (00.3 §14 line 299) — **note:** the 6–12 range is a soft guidance, not a FAIL trigger; the 16-item count is justified by the WP genuinely covering 4 independent drift fixes that need separate verification. Every item is observable (file exists, literal string appears, scope-grep returns empty). No subjective language ("works correctly", "looks good"). All items align with deliverables — no phantom checks. |
| 15 | Definition of Done | **PASS** | DoD has 7 items including: all AC pass, `pnpm -r test` exits 0, STATUS.md updated, DECISIONS.md updated with D-11901, WORK_INDEX.md WP-119 checked off with date+commit hash, no out-of-scope files modified, lint-gate self-review passes. The scope-boundary check is present (the "no out-of-scope files" line). |
| 16 | Code Style | **N/A** | Doc-only WP — no code produced. §16.1–§16.7 (premature abstraction, control flow, names, function size, comments-explain-why, magic imports, error-message form) all apply to code, not prose. The Engine-wide constraint `Human-style code per 00.6-code-style.md — applies to prose written into the doc` is a soft-applicability flag; §16's binary checks are about code. The N/A justification names *why*: WP produces no `.ts` / `.mjs` files; only `.md` doc edits. |
| 17 | Vision Alignment | **PASS** | Triggered by §17.1 #9 (Accessibility or internationalization surfaces — Vision §17). Required content per §17.2: Vision clauses listed (§17 with explicit scope-acknowledgment that §17 covers accessibility, not i18n — corrected by PS-1). Conflict assertion present: "No conflict — Vision §17 is silent on i18n; deferral here neither contradicts nor expands §17." Non-Goal proximity: "NG-1..NG-7 not crossed." Determinism preservation: N/A justified (no engine/replay/RNG surface). PS-1 of preflight-wp119.md is the artifact-of-record for the §17 over-citation correction. |
| 18 | Prose-vs-Grep Discipline | **PASS** | None of WP-119's verification grep patterns target the §18.1 forbidden-token list (`Math\.random`, `Date\.now`, `performance\.now`, `new Date(`, `boardgame\.io`, `@legendary-arena/registry`, `apps/server`). The grep targets are positive identifiers (`replay-producer`, `type-only`, `^## Internationalization`, `Vision §17`, `ad-hoc\|dedicated WP`, `accessibility`, `^### D-11901`) — strings that SHOULD appear, not strings that must be absent. No false-positive vector. The WP body's mention of `boardgame.io` in the preplan-rule preservation context is not grepped by any verification step, so §18 risk is zero. |
| 19 | Bridge-vs-HEAD Staleness Rule | **N/A** | This WP authors no `session-context-wp*.md` bridge, no `STATUS.md §Current State` snapshot of recent commits, no `01.6-*.md` post-mortem with Final Baseline / Scope-Lock Adherence / Pre-Flight RS-# Disposition sections. The WORK_INDEX check-off carries today's date + commit hash, both of which are pinned at commit time — no staleness vector. The STATUS.md update is a one-line capability statement, not a repo-state snapshot. The N/A justification names *why*: WP produces no commit-history-summarizing artifact; the only date-stamped surfaces (WORK_INDEX row, STATUS.md line, D-11901 entry) are pinned at commit time. |
| 20 | Funding Surface Gate Trigger | **N/A** | None of the §20.1 trigger surfaces present: no global navigation funding affordances (per WP-097 §A); no registry-viewer funding affordances (§B); no user-profile funding attribution (§C); no tournament-funding-channel integrations; no user-visible "donate" / "support tournaments" copy in any of the 6 modified files. The N/A justification names *why* (per §20.1 non-tautological requirement): pure documentation cleanup; the 6 files modified are architecture / decisions / status / governance docs only; no UI surfaces, no user-visible copy, no funding channels referenced. The "Governance-doc exclusion" carve-out at §20.1 line 619-627 explicitly applies — WP-119 mentions no funding policy at all (it does not even cite WP-097 in body content; the §20 line in Vision Alignment is the lint-gate compliance line itself, not a funding-policy reference). |

**Summary:** 14 PASS, 6 N/A, 0 FAIL.

**Cross-file note (out of scope for WP-119, flagged for future hygiene WP):** This pre-flight surfaced that WP-118 and WP-116 cite the 8-file cap as `00.3 §10 line 126` — but §10 is "Environment Variable Hygiene" (line 234). The 8-file cap is in §5 "Output Completeness" (line 116-126). WP-119's Files Expected to Change does NOT make this miscitation (it just says "Well under the 8-file cap" without §-citation). Other WPs' miscitation is a candidate finding for a future hygiene WP, not a WP-119 issue.
