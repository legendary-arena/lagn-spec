# EC-239 — Arena Client `UIState.notableEvents` Test Backfill (Execution Checklist)

**Source:** docs/ai/work-packets/WP-207b-arena-client-uistate-test-backfill.md
**Layer:** Client (`apps/arena-client/src/**/*.test.ts`)

## Before Starting
- [ ] WP-207a landed on `main` (`apps/arena-client/src/fixtures/uiState/{index,typed}.ts` carry `notableEvents: []`)
- [ ] WP-200 + WP-201 landed on `main`
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 2 with errors confined to the 8 test files listed below; the 6 fixture errors are GONE
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Field name: `notableEvents` (per WP-201)
- Default value for 7 simple files: `[]` (literal empty array)
- File set: exactly 8 source paths (no additions, no substitutions):
  - `src/components/AutoplayControls.test.ts`
  - `src/components/play/NotableEventOverlay.test.ts`
  - `src/components/play/TopHudBar.test.ts`
  - `src/composables/useNotableEventStream.test.ts`
  - `src/pages/PlayMobile.test.ts`
  - `src/preplan/mutationDetector.test.ts`
  - `src/preplan/mutationMiddleware.test.ts`
  - `src/services/autoplayPlayback.test.ts`

## Guardrails
- Read-only on `useNotableEventStream.ts` (composable implementation — only the test file is in scope)
- Read-only on `UIState` type definition and `tsconfig.json` (no strict-mode relaxation)
- Read-only on WP-207a fixture files
- `useNotableEventStream.test.ts` fix is type-narrowing, NOT contract-backfill — read the file first; if the fix requires more than 5 lines of change, STOP and report
- `mutationDetector.test.ts` + `mutationMiddleware.test.ts` errors are TS2375 (exactOptionalPropertyTypes); the likely fix is appending `notableEvents: []` to the local `makeUIState` helper's `UIState` literal body
- If any line number in this checklist has shifted (parallel commit): re-run typecheck and locate actual current sites; do not blindly trust the WP-body line numbers
- No new test cases; no test-behavior changes beyond the type-fix surface
- Tests use `node:test` + `node:assert` only

## Required `// why:` Comments
- None for the 7 mechanical files (contract-driven backfill, self-explanatory)
- For `useNotableEventStream.test.ts`: if the fix involves a non-obvious type assertion or a tightened helper signature, attach a `// why: <reason>` comment explaining why the narrowed type is correct

## Files to Produce
- `apps/arena-client/src/components/AutoplayControls.test.ts` — **modified** — append `notableEvents: []` at the `UIState` literal (line ~65)
- `apps/arena-client/src/components/play/NotableEventOverlay.test.ts` — **modified** — append `notableEvents: []` or fix typed casts at 10 sites
- `apps/arena-client/src/components/play/TopHudBar.test.ts` — **modified** — append at line ~11
- `apps/arena-client/src/composables/useNotableEventStream.test.ts` — **modified** — resolve TS2339 `.type` on `never` at lines 106, 148
- `apps/arena-client/src/pages/PlayMobile.test.ts` — **modified** — append at line ~15
- `apps/arena-client/src/preplan/mutationDetector.test.ts` — **modified** — append at the `makeUIState` helper body (line ~18)
- `apps/arena-client/src/preplan/mutationMiddleware.test.ts` — **modified** — append at the helper body (line ~65)
- `apps/arena-client/src/services/autoplayPlayback.test.ts` — **modified** — append at line ~79
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-207b
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
- [ ] `git diff --stat apps/arena-client/src/composables/useNotableEventStream.ts` empty (implementation untouched)
- [ ] `git diff --stat apps/arena-client/tsconfig.json` empty (no strict-mode relaxation)
- [ ] `git diff --stat apps/arena-client/src/fixtures/uiState/` empty (WP-207a scope untouched)
- [ ] `git status --short | wc -l` returns 11 (8 source + 3 governance)
- [ ] `docs/ai/STATUS.md` Done entry references WP-207b + the 8 source paths
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-239:`

## Common Failure Smells
- Typecheck still red on tests → check field name (`notableEvents`, exact spelling) and literal value (`[]`)
- New tests added → out-of-scope; revert to type-fix surface only
- `useNotableEventStream.ts` (the composable) modified → out-of-scope; revert
- `tsconfig.json` modified → out-of-scope; revert and find the test-file-only fix
- Composable type signature changed → out-of-scope; the composable contract is correct, only the test consumer needs adjusting
- File count > 11 → an unintended file was touched; identify and revert
- File count < 11 → missed a file; cross-check against the locked file set
