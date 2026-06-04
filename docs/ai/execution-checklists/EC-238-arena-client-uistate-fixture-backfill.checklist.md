# EC-238 — Arena Client `UIState.notableEvents` Fixture Backfill (Execution Checklist)

**Source:** docs/ai/work-packets/WP-207a-arena-client-uistate-fixture-backfill.md
**Layer:** Client (`apps/arena-client/src/fixtures/uiState/`)

## Before Starting
- [ ] WP-200 + WP-201 landed on `main` (verified via `git log --oneline main | grep -E "WP-20[01]"`)
- [ ] `UIState` type definition has `notableEvents` as a required field (read first; STOP if it is optional or missing — this WP is unnecessary)
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` currently exits 2 with the 6 expected errors at `fixtures/uiState/index.ts:54,56,58` and `fixtures/uiState/typed.ts:18,19,20`
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Field name: `notableEvents` (exact spelling per WP-201; not `notable_events`, `events`, `gameEvents`)
- Default value: `[]` (literal empty array; not `null`, `undefined`, or factory call)
- Field position: appended at end of each `UIState` construction site (locked for diff consistency)
- File set: exactly `apps/arena-client/src/fixtures/uiState/index.ts` and `apps/arena-client/src/fixtures/uiState/typed.ts` — no other paths
- Site count: exactly 3 sites per file = 6 total backfill insertions

## Guardrails
- Read-only on `UIState` type definition; do not modify the type contract
- Read-only on all 8 test files reserved for WP-207b (listed in WP `## Out of Scope`)
- No new imports added to either fixture file (literal `[]` needs no import)
- No new helper functions or factory calls — literal empty-array default only
- `Partial<UIState>` override pattern in `index.ts` preserved byte-identical
- If site count differs from 3 per file: STOP and report (CI report drift signal)
- If any of the 6 sites already carries `notableEvents`: STOP and report (partial fix already applied)

## Required `// why:` Comments
- None. The `notableEvents: []` addition is contract-driven by WP-201 and self-explanatory; no `// why:` comment is required on the field itself.

## Files to Produce
- `apps/arena-client/src/fixtures/uiState/index.ts` — **modified** — append `notableEvents: []` to 3 literal `UIState` construction sites (lines 54, 56, 58)
- `apps/arena-client/src/fixtures/uiState/typed.ts` — **modified** — append `notableEvents: []` to 3 literal `UIState` construction sites (lines 18, 19, 20)
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-207a
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — status Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — status Ready → Done

## After Completing
- [ ] `grep -c "notableEvents: \[\]" apps/arena-client/src/fixtures/uiState/index.ts` returns 3
- [ ] `grep -c "notableEvents: \[\]" apps/arena-client/src/fixtures/uiState/typed.ts` returns 3
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck 2>&1 | grep -E "fixtures/uiState/(index|typed)\.ts.*notableEvents" | wc -l` returns 0
- [ ] `git status --short | wc -l` returns 5 (2 source + 3 governance)
- [ ] `docs/ai/STATUS.md` Done entry references WP-207a + the 6 backfill sites
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-207a flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-238 flipped Ready → Done
- [ ] Commit prefix: `EC-238:` (code under `apps/` mandates EC-### per commit hygiene gate)

## Common Failure Smells
- "Cannot find name `NotableGameEvent`" → an unnecessary import was added; remove it (the empty-array literal needs no type import)
- Field count grep returns 4+ → over-applied; one of the 3 sites was already correct or a non-`UIState` literal was modified
- Field count grep returns 1-2 → under-applied; missed one or more sites
- Typecheck still red on `fixtures/uiState/*` → check field name spelling (must be exactly `notableEvents`) or check the literal value (must be exactly `[]`)
- New errors in test files → out-of-scope file was touched; revert and stay inside the fixture-file boundary
