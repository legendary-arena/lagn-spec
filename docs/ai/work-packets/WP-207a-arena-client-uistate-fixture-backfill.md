# WP-207a — Arena Client `UIState.notableEvents` Fixture Backfill

**Status:** Ready
**Primary Layer:** Client (`apps/arena-client/src/fixtures/uiState/`)
**Dependencies:** WP-200, WP-201 (both landed; introduced `UIState.notableEvents` as a required field but only partially backfilled callers)

---

## Session Context

WP-200 + WP-201 added `notableEvents` as a required field on `UIState` (the arena-client UI projection type) and updated the engine + composables, but left the standalone fixture files in `apps/arena-client/src/fixtures/uiState/` carrying the pre-notable-events shape. The result is a `vue-tsc` typecheck failure that has been red on every main commit since the WP-201 merge. This WP backfills the two fixture surfaces only; the test files that construct inline `UIState` objects are scoped to the paired WP-207b.

---

## Goal

After this session, `apps/arena-client/src/fixtures/uiState/index.ts` and `apps/arena-client/src/fixtures/uiState/typed.ts` each construct `UIState` objects that carry the required `notableEvents: NotableGameEvent[]` field with an empty-array default, satisfying `vue-tsc --noEmit` for those two files. The fixture exports retain their existing names, shapes, and `Partial<UIState>` override semantics — the only addition is the `notableEvents: []` field on every literal `UIState` object construction site inside these two files.

---

## Assumes

- WP-200 complete. Specifically:
  - `apps/arena-client/src/types/uiState.ts` (or wherever `UIState` is defined) exports `UIState` with `notableEvents: NotableGameEvent[]` as a required field
  - `NotableGameEvent` is importable from `@legendary-arena/game-engine` (or an arena-client re-export)
- WP-201 complete. Specifically:
  - `apps/arena-client/src/composables/useNotableEventStream.ts` consumes `UIState.notableEvents`
- `pnpm --filter @legendary-arena/arena-client typecheck` currently exits 2 (FAILING) — this WP must move it toward exit 0; full green requires the paired WP-207b + WP-208 to also land
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms arena-client lives on the client side of the engine boundary; this packet touches client-only fixtures and may not reach into engine package code.
- `apps/arena-client/src/fixtures/uiState/index.ts` — read entirely before modifying. This is the canonical fixture surface consumed by tests, dev tooling, and Storybook-equivalent surfaces. The existing `Partial<UIState>` override pattern (lines ~50-60) is preserved verbatim; the only change is adding `notableEvents: []` to the three literal `UIState` constructions reported by the CI typecheck.
- `apps/arena-client/src/fixtures/uiState/typed.ts` — read entirely before modifying. Same three literal-construction sites as `index.ts`, exported as typed re-exports.
- The `UIState` type definition file (path discovered during read-first; commonly `apps/arena-client/src/types/uiState.ts` or a re-export from `@legendary-arena/game-engine`) — confirm the exact required type of `notableEvents` (almost certainly `NotableGameEvent[]` per WP-201).
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error messages), Rule 14 (field names match data contract). The added `notableEvents` field uses the canonical name from WP-201; no abbreviation or paraphrase.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.

---

## Scope (In)

- Add `notableEvents: []` field to every literal `UIState` construction site inside `apps/arena-client/src/fixtures/uiState/index.ts` (3 sites reported by CI: lines 54, 56, 58)
- Add `notableEvents: []` field to every literal `UIState` construction site inside `apps/arena-client/src/fixtures/uiState/typed.ts` (3 sites reported by CI: lines 18, 19, 20)
- Verify `pnpm --filter @legendary-arena/arena-client typecheck` no longer reports errors for these 6 lines (other errors from WP-207b + WP-208 scope may remain)

## Out of Scope

- Modifying any test file under `apps/arena-client/src/` (WP-207b scope — `AutoplayControls.test.ts`, `NotableEventOverlay.test.ts`, `TopHudBar.test.ts`, `useNotableEventStream.test.ts`, `PlayMobile.test.ts`, `mutationDetector.test.ts`, `mutationMiddleware.test.ts`, `autoplayPlayback.test.ts`)
- Modifying any file under `apps/registry-viewer/src/` (WP-208 scope — `Category` literal union extension in `devLog.ts`)
- Modifying the `UIState` type definition itself (the type contract is correct; only callers are stale)
- Changing the `Partial<UIState>` override pattern or the existing fixture export names
- Adding new fixture exports, new test infrastructure, or new helper functions
- Touching any engine, registry, server, or shared-tooling package code

---

## Files Expected to Change

- `apps/arena-client/src/fixtures/uiState/index.ts` — modified (add `notableEvents: []` to 3 literal `UIState` construction sites)
- `apps/arena-client/src/fixtures/uiState/typed.ts` — modified (add `notableEvents: []` to 3 literal `UIState` construction sites)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status update Ready → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status update Ready → Done)

5 files total (2 source + 3 governance). No DECISIONS.md entry — this WP makes no new decisions; it is a mechanical backfill of an existing contract.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (N/A — this WP touches no randomness)
- Never throw inside boardgame.io move functions — N/A (no move functions touched)
- Never persist `G`, `ctx`, or any runtime state — N/A (no persistence touched)
- `G` must be JSON-serializable at all times — N/A (no `G` touched)
- ESM only, Node v22+ — all changes use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.) — N/A (no built-in imports added)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — no abbreviations, descriptive names, `// why:` comments for non-obvious code
- Full file contents required for every modified file in the session output — no diffs, no snippets, no "show only the changed section"

**Packet-specific:**
- Read-only on `UIState` type definition — the type contract is correct; do not modify it
- Read-only on all 8 test files in scope of WP-207b — listed in `## Out of Scope`
- `notableEvents: []` field uses literal empty-array default; do not import or invoke any factory or mock-event helper for the default value
- The field name is exactly `notableEvents` per WP-201 — no abbreviation, no paraphrase, no rename
- Existing `Partial<UIState>` override pattern in `index.ts` is preserved verbatim — only the literal `UIState` construction inside the function body adds the new field
- No `// why:` comment is required on the `notableEvents: []` addition itself — the WP-201 contract makes it self-explanatory; if a reviewer would need to ask "why is this empty?", the answer is "no notable events occurred in this fixture state, per WP-201"

**Session protocol:**
- If the `UIState` type definition reveals `notableEvents` is NOT required (the CI errors were caused by a different fix that already landed): STOP and report. This WP is unnecessary.
- If the count of literal `UIState` construction sites in either file differs from the CI report (3 sites each, lines as cited): STOP and ask before proceeding. Drift between CI report and actual code is a signal.
- If any of the 6 backfill sites already carries `notableEvents`: STOP and report. The fix is partially applied; investigate before continuing.

**Locked contract values:**
- Field name: `notableEvents` (per WP-201; not `notable_events`, `events`, `gameEvents`)
- Default value: `[]` (literal empty array; not `null`, `undefined`, or a factory call)
- Field position in object literals: append at the end of each `UIState` construction site (does not matter semantically; locked for diff consistency)

---

## Acceptance Criteria

1. `apps/arena-client/src/fixtures/uiState/index.ts` contains exactly 3 occurrences of `notableEvents: []` inside literal `UIState` construction sites (one per site reported by CI lines 54, 56, 58)
2. `apps/arena-client/src/fixtures/uiState/typed.ts` contains exactly 3 occurrences of `notableEvents: []` inside literal `UIState` construction sites (one per site reported by CI lines 18, 19, 20)
3. `pnpm --filter @legendary-arena/arena-client typecheck` no longer reports the 6 specific `notableEvents` errors at the CI-reported line numbers in these two files (other errors from WP-207b + WP-208 scope may remain unaddressed)
4. The `Partial<UIState>` override pattern in `index.ts` is preserved byte-identical at all sites that previously used it
5. No file outside `## Files Expected to Change` is modified — verified by `git status` showing only the 2 source files + 3 governance files as modified
6. No new imports added to either fixture file (the empty-array literal needs no import)
7. No new helper functions or factory calls introduced in either fixture file
8. `git diff --stat apps/arena-client/src/fixtures/uiState/` shows additions only (no deletions to the existing fixture content)

---

## Verification Steps

Run each command in order. Each command must produce the expected output before proceeding.

```bash
# 1. Confirm exactly 3 notableEvents additions to index.ts
grep -c "notableEvents: \[\]" apps/arena-client/src/fixtures/uiState/index.ts
# Expected: 3

# 2. Confirm exactly 3 notableEvents additions to typed.ts
grep -c "notableEvents: \[\]" apps/arena-client/src/fixtures/uiState/typed.ts
# Expected: 3

# 3. Confirm typecheck no longer reports the 6 fixture-file notableEvents errors
pnpm --filter @legendary-arena/arena-client typecheck 2>&1 | grep -E "fixtures/uiState/(index|typed)\.ts.*notableEvents" | wc -l
# Expected: 0

# 4. Confirm working tree matches the expected file list
git status --short | wc -l
# Expected: 5 (2 source + 3 governance)

git status --short | grep -v "^.M" | wc -l
# Expected: 0 (no untracked, only modified)

# 5. Confirm no unintended files modified
git diff --name-only | sort
# Expected (exactly these 5 paths):
# apps/arena-client/src/fixtures/uiState/index.ts
# apps/arena-client/src/fixtures/uiState/typed.ts
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Definition of Done

- [ ] All 8 Acceptance Criteria pass
- [ ] All 5 Verification Steps produce the expected output
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-207a + the 6 backfill sites)
- [ ] `docs/ai/DECISIONS.md` NOT updated (this WP makes no new decisions; mechanical backfill of an existing contract)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] No files outside `## Files Expected to Change` were modified — verified by `git status`
- [ ] Commit message uses `EC-238:` prefix per the commit hygiene gate (this is code under `apps/` so SPEC: / INFRA: do not apply)

---

## Vision Alignment

**N/A.** This WP backfills the `notableEvents` field on two test/dev fixture files. It touches no §17.1 trigger surface: no scoring, no replays, no player identity, no multiplayer sync, no determinism guarantees, no card data, no monetization, no live ops, no accessibility, no Registry Viewer public surface. The fixture files are dev-only consumers of an existing UI projection type; the field they backfill was already approved as part of WP-200 + WP-201 vision review.

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. The change is internal test-fixture maintenance with no UI surface.

---

## API Catalog Update

**N/A.** This WP touches no HTTP endpoint, no `apps/server/src/**` library function, no route registration, no catalog row. The change is client-side fixture file maintenance only.
