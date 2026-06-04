# WP-207b — Arena Client `UIState.notableEvents` Test Backfill

**Status:** Ready
**Primary Layer:** Client (`apps/arena-client/src/**/*.test.ts` + test-adjacent files)
**Dependencies:** WP-200, WP-201, WP-207a (all landed; WP-207a fixes the fixture files, this packet fixes the 8 test files that inline-construct `UIState` objects)

---

## Session Context

Paired follow-up to WP-207a. WP-200 + WP-201 made `UIState.notableEvents` a required field, and WP-207a backfilled the two standalone fixture files in `apps/arena-client/src/fixtures/uiState/`. This WP backfills the 8 test files that inline-construct `UIState` objects directly inside their test bodies — they were not caught by WP-207a's fixture-file scope. After this WP and WP-208 land, the `Typecheck Arena Client` CI step turns green for the first time since the WP-201 merge.

---

## Goal

After this session, the 8 test files listed in `## Files Expected to Change` either (a) carry `notableEvents: []` on every inline `UIState` construction site, or (b) for the one file with a non-trivial type-narrowing failure (`useNotableEventStream.test.ts`), the narrowed-to-`never` symptom is resolved through the minimum-surface change needed to satisfy `vue-tsc --noEmit`. The arena-client `typecheck` script exits 0 after this WP + WP-207a land (WP-208 is required for the registry-viewer step but does not gate this one).

---

## Assumes

- WP-207a complete. Specifically:
  - `apps/arena-client/src/fixtures/uiState/index.ts` and `typed.ts` carry `notableEvents: []` on all 6 prior failure sites
  - The 6 fixture-file typecheck errors from the WP-201-era cascade are resolved
- WP-200 + WP-201 complete. Specifically:
  - `UIState.notableEvents: NotableGameEvent[]` is required
  - `NotableGameEvent` is importable
  - `useNotableEventStream` composable signature is the one shipped with WP-201
- `pnpm --filter @legendary-arena/arena-client typecheck` after WP-207a still reports the 8 test-file error clusters listed below
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms test files in arena-client stay on the client side of the engine boundary; no engine code touched.
- `docs/ai/work-packets/WP-207a-arena-client-uistate-fixture-backfill.md` — read the sibling WP to confirm the mechanical-backfill pattern; the 7 simple test files follow the same pattern.
- `apps/arena-client/src/composables/useNotableEventStream.ts` — read entirely. The composable's return type is the load-bearing reference for understanding the TS2339 errors at `useNotableEventStream.test.ts:106` and `:148` (the symptom is `.type` on `never`, suggesting a type-narrowing failure inside the test rather than a fixture backfill).
- `apps/arena-client/src/composables/useNotableEventStream.test.ts` — read entirely before modifying. The failure pattern here is different from the other 7 files; understand the test's intent before patching.
- `apps/arena-client/src/preplan/mutationDetector.test.ts` and `mutationMiddleware.test.ts` — both fail with TS2375 (exactOptionalPropertyTypes). The fix may require explicit `notableEvents: []` on the test's `makeUIState`-style helper rather than just on inline literals. Read both before editing either.
- `apps/arena-client/tsconfig.json` — confirm `exactOptionalPropertyTypes` setting. Treat it as load-bearing; do not relax it.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 14 (canonical field names).
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.

---

## Scope (In)

- Add `notableEvents: []` to every inline `UIState` construction site in the 8 test files listed in `## Files Expected to Change`
- For `useNotableEventStream.test.ts`: resolve the TS2339 `.type` on `never` errors at lines 106 and 148 via the minimum-surface change needed (likely: add a missing type annotation on the local `currentEvent` ref or extend the `uiStateWith` helper signature; investigate during execution)
- For `mutationDetector.test.ts` and `mutationMiddleware.test.ts`: resolve the TS2375 exactOptionalPropertyTypes errors at the cited line numbers; the most likely fix is appending `notableEvents: []` to the local `makeUIState` helper's literal `UIState` body
- Verify `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 after this WP lands (assuming WP-207a is already on `main`)

## Out of Scope

- Modifying the `UIState` type definition or any type under `apps/arena-client/src/types/`
- Modifying `apps/arena-client/src/composables/useNotableEventStream.ts` (the composable implementation) — only the test file is in scope
- Modifying any file under `apps/arena-client/src/fixtures/uiState/` (WP-207a scope)
- Modifying any file under `apps/registry-viewer/src/` (WP-208 scope)
- Relaxing `exactOptionalPropertyTypes` or any other tsconfig setting
- Adding new test cases, expanding existing test coverage, or rewriting test scaffolding beyond the minimum surface needed to fix typecheck
- Touching any engine, registry, server, or shared-tooling package code

---

## Files Expected to Change

- `apps/arena-client/src/components/AutoplayControls.test.ts` — modified (append `notableEvents: []` to inline `UIState` at line ~65)
- `apps/arena-client/src/components/play/NotableEventOverlay.test.ts` — modified (append `notableEvents: []` or fix typed casts at lines 23, 40, 165, 176, 190, 222, 229, 236, 243, 250 per CI report)
- `apps/arena-client/src/components/play/TopHudBar.test.ts` — modified (append `notableEvents: []` to inline `UIState` at line ~11)
- `apps/arena-client/src/composables/useNotableEventStream.test.ts` — modified (resolve TS2339 `.type` on `never` at lines 106 and 148 via minimum-surface change; investigate during execution before patching)
- `apps/arena-client/src/pages/PlayMobile.test.ts` — modified (append `notableEvents: []` to inline `UIState` at line ~15)
- `apps/arena-client/src/preplan/mutationDetector.test.ts` — modified (append `notableEvents: []` to local `makeUIState` helper's literal `UIState` body at line ~18; resolve exactOptionalPropertyTypes mismatch)
- `apps/arena-client/src/preplan/mutationMiddleware.test.ts` — modified (append `notableEvents: []` to local helper at line ~65; resolve exactOptionalPropertyTypes mismatch)
- `apps/arena-client/src/services/autoplayPlayback.test.ts` — modified (append `notableEvents: []` to inline `UIState` at line ~79)
- `docs/ai/STATUS.md` — modified (Done entry for WP-207b)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status Ready → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status Ready → Done)

11 files total (8 source + 3 governance). This exceeds the §1 lint guidance of ~8 files; the bundling is justified because (a) all 8 source files are touched by the same root cause (missing `notableEvents` field on inline `UIState` construction sites), (b) splitting would create artificial sub-WPs with no independent test value, and (c) all 8 are required for the `Typecheck Arena Client` CI step to turn green — a partial fix leaves the gate red.

No DECISIONS.md entry — this WP makes no new decisions; it is a mechanical backfill of an existing contract.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (N/A — no randomness touched)
- Never throw inside boardgame.io move functions — N/A (no move functions touched)
- Never persist `G`, `ctx`, or any runtime state — N/A
- `G` must be JSON-serializable at all times — N/A
- ESM only, Node v22+ — all changes use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports — applies to any new imports if added
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — no abbreviations, descriptive names, `// why:` comments for non-obvious code
- Full file contents required for every modified file in the session output — no diffs, no snippets

**Packet-specific:**
- Read-only on `UIState` type definition; the contract is correct
- Read-only on the `useNotableEventStream.ts` composable implementation (only the test is in scope)
- Read-only on `tsconfig.json` — do not relax `exactOptionalPropertyTypes` or any other strict setting
- Read-only on all 2 fixture files under `apps/arena-client/src/fixtures/uiState/` (WP-207a scope)
- For the 7 mechanical files: `notableEvents: []` is the literal empty-array default; no factory call, no helper, no factory function
- For `useNotableEventStream.test.ts`: the fix may differ — read the file first, understand the TS2339 `never` narrowing, and apply the smallest possible change that resolves the error without adding new test behavior
- For `mutationDetector.test.ts` and `mutationMiddleware.test.ts`: the fix is most likely appending `notableEvents: []` to the local helper's `UIState` literal; if the helper does not exist, the fix is on inline literals
- The field name is exactly `notableEvents` per WP-201 — no abbreviation, no paraphrase
- No `// why:` comment is required on backfill additions — the WP-201 contract is self-explanatory
- If the `useNotableEventStream.test.ts` fix requires more than 5 lines of change: STOP and report (the WP scope assumes a small fix; larger refactor signals scope creep)
- Tests use `node:test` and `node:assert` only (preserve existing test infrastructure verbatim)

**Session protocol:**
- If any of the 8 source files has had its line numbers shifted since the CI report (e.g., a parallel commit landed): re-run the typecheck and locate the actual current sites before editing. Do not blindly trust the line numbers in this WP body.
- If the `useNotableEventStream.test.ts` fix is unclear after reading the composable: STOP and ask. Do not guess.
- If any file is already partially fixed (carries `notableEvents` at some sites but not all): STOP and report.

**Locked contract values:**
- Field name: `notableEvents` (per WP-201)
- Default value: `[]` (literal empty array for the 7 simple files)
- For `useNotableEventStream.test.ts`: there is no locked value — the fix is type-narrowing, not contract-backfill
- File set: exactly the 8 source paths listed in `## Files Expected to Change` — no other source paths

---

## Acceptance Criteria

1. Every literal `UIState` construction site in the 7 simple test files carries `notableEvents: []` — verified by `grep -rn "notableEvents" apps/arena-client/src/` showing matches in all 7 paths
2. `useNotableEventStream.test.ts` lines 106 and 148 no longer report TS2339 `.type` on `never` — verified by post-fix typecheck output
3. `mutationDetector.test.ts:18` and `mutationMiddleware.test.ts:65` no longer report TS2375 exactOptionalPropertyTypes errors — verified by post-fix typecheck output
4. `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (assuming WP-207a is on `main`; WP-208 affects registry-viewer typecheck independently)
5. `useNotableEventStream.ts` (the composable implementation) is byte-identical to the pre-WP state — verified by `git diff` showing it unchanged
6. `tsconfig.json` is byte-identical to the pre-WP state — no strict-mode relaxation
7. No new test cases added; no existing test behavior altered beyond the type-fix surface — verified by reading the diff against the failing-test-list and confirming structural-only changes
8. No file outside `## Files Expected to Change` is modified — verified by `git status` matching the 11-file expected list exactly
9. No new imports added to any file unless required for the `useNotableEventStream.test.ts` fix; if added, the import is named and explicit (no `import *`)

---

## Verification Steps

Run each command in order. Each command must produce the expected output before proceeding.

```bash
# 1. Confirm the full typecheck passes after both WP-207a and WP-207b are applied
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exit 0; no error output

# 2. Confirm composable implementation untouched
git diff --stat apps/arena-client/src/composables/useNotableEventStream.ts
# Expected: empty output

# 3. Confirm tsconfig untouched
git diff --stat apps/arena-client/tsconfig.json
# Expected: empty output

# 4. Confirm fixture files untouched (WP-207a scope, already on main)
git diff --stat apps/arena-client/src/fixtures/uiState/
# Expected: empty output

# 5. Confirm exactly 11 files in the working tree match the expected set
git diff --name-only | sort
# Expected (exactly these 11 paths):
# apps/arena-client/src/components/AutoplayControls.test.ts
# apps/arena-client/src/components/play/NotableEventOverlay.test.ts
# apps/arena-client/src/components/play/TopHudBar.test.ts
# apps/arena-client/src/composables/useNotableEventStream.test.ts
# apps/arena-client/src/pages/PlayMobile.test.ts
# apps/arena-client/src/preplan/mutationDetector.test.ts
# apps/arena-client/src/preplan/mutationMiddleware.test.ts
# apps/arena-client/src/services/autoplayPlayback.test.ts
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Definition of Done

- [ ] All 9 Acceptance Criteria pass
- [ ] All 5 Verification Steps produce the expected output
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-207b + the 8 source paths)
- [ ] `docs/ai/DECISIONS.md` NOT updated (mechanical backfill; no new decisions)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] No files outside `## Files Expected to Change` were modified — verified by `git status`
- [ ] Commit message uses `EC-239:` prefix per the commit hygiene gate

---

## Vision Alignment

**N/A.** This WP backfills the `notableEvents` field on 8 test files. It touches no §17.1 trigger surface: no scoring, no replays, no player identity, no multiplayer sync, no determinism guarantees, no card data, no monetization, no live ops, no accessibility, no Registry Viewer public surface. The fix is test infrastructure maintenance against a contract already vision-reviewed under WP-200 + WP-201.

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. Test-file infrastructure only.

---

## API Catalog Update

**N/A.** This WP touches no HTTP endpoint, no `apps/server/src/**` library function, no route registration, no catalog row. Test-file infrastructure only.
