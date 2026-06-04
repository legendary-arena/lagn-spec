# EC-238 — Arena Client `UIState.notableEvents` Fixture Backfill (Execution Checklist)

**Source:** docs/ai/work-packets/WP-207a-arena-client-uistate-fixture-backfill.md
**Layer:** Client (`apps/arena-client/src/fixtures/uiState/` — JSON fixtures)

## Before Starting
- [ ] WP-200 + WP-201 landed on `main` (verified via `git log --oneline main | grep -E "WP-20[01]"`)
- [ ] Engine `UIState` has `notableEvents: NotableGameEvent[]` as a required field (`packages/game-engine/src/ui/uiState.types.ts`; obey WP Hard Stop Conditions if it is optional or missing — this WP is then unnecessary)
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` currently exits 2 with the 6 fixture errors at `fixtures/uiState/index.ts:54,56,58` and `fixtures/uiState/typed.ts:18,19,20`
- [ ] `git status --porcelain` returns empty (working tree clean before starting)

## Locked Values (do not re-derive)
- Member name: `notableEvents` (exact spelling per WP-200; not `notable_events`, `events`, `gameEvents`)
- Default value: `[]` (literal empty JSON array; not `null`, a sample list, or omission)
- Member position: appended as the last top-level member of each JSON object (locked for diff consistency; JSON key order is insignificant)
- File set: exactly the 3 JSON fixtures `mid-turn.json`, `endgame-win.json`, `endgame-loss.json` — **not** `index.ts` / `typed.ts`
- Site count: exactly 1 member per JSON file = 3 total backfill insertions

## Guardrails
- Edit JSON only. Do **not** modify `index.ts` or `typed.ts` — both are correct; their typecheck errors are downstream of the stale JSON, and editing them masks the real fix.
- Read-only on the engine `UIState` type definition; do not modify the contract
- Read-only on all inline-`UIState` test files reserved for WP-207b (listed in WP `## Out of Scope`)
- Change exactly one thing per JSON file: add the `"notableEvents"` member. Do not reorder, reformat, or alter any existing member. Each file must remain valid JSON (the preceding member gains a trailing comma).
- Do not run `lint --fix`, Prettier, or any formatter that rewrites unrelated lines — this is a surgical 3-member backfill; an auto-formatter pass would blow the additions-only diff surface
- Obey WP `## Hard Stop Conditions (Authoritative)` — single source of truth for every STOP trigger (member not required, CI-line mismatch, a fixture already carrying `notableEvents`, or a *different* required member surfacing after the fix). Do not restate the triggers here.

## Required `// why:` Comments
- None. JSON fixtures carry no comments, and the empty-array default is contract-driven by WP-200.

## Files to Produce
- `apps/arena-client/src/fixtures/uiState/mid-turn.json` — **modified** — add top-level `"notableEvents": []`
- `apps/arena-client/src/fixtures/uiState/endgame-win.json` — **modified** — add top-level `"notableEvents": []`
- `apps/arena-client/src/fixtures/uiState/endgame-loss.json` — **modified** — add top-level `"notableEvents": []`
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-207a
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — status Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — status Ready → Done

## After Completing
- [ ] `for f in mid-turn endgame-win endgame-loss; do grep -c '"notableEvents"' apps/arena-client/src/fixtures/uiState/$f.json; done` returns `1` for each
- [ ] Each fixture parses and `notableEvents === []`: `node -e "const o=require('./apps/arena-client/src/fixtures/uiState/mid-turn.json'); process.exit(Array.isArray(o.notableEvents)&&o.notableEvents.length===0?0:1)"` (repeat per file)
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck 2>&1 | grep -E "fixtures/uiState/(index|typed)\.ts" | wc -l` returns 0
- [ ] `git diff --name-only apps/arena-client/src/fixtures/uiState/index.ts apps/arena-client/src/fixtures/uiState/typed.ts | wc -l` returns 0 (the `.ts` modules untouched)
- [ ] `git status --porcelain | wc -l` returns 6 (3 source + 3 governance); the listed paths match the WP `## Files Expected to Change` set exactly
- [ ] `docs/ai/STATUS.md` Done entry references WP-207a + the 3 JSON backfills
- [ ] WORK_INDEX + EC_INDEX rows for WP-207a / EC-238 flipped Ready → Done
- [ ] Commit prefix: `EC-238:` (data under `apps/` mandates EC-### per commit hygiene gate)

## Common Failure Smells
- Edited `index.ts` / `typed.ts` instead of the JSON → wrong locus; the `.ts` modules are correct. Revert and edit the JSON.
- Typecheck still red on `fixtures/uiState/*` → check the member spelling (`"notableEvents"`) and value (`[]`), or a different required member is missing (WP Hard Stop #4 — STOP).
- A fixture no longer parses → trailing-comma or bracket error; the preceding member needs its comma and the new member must sit inside the closing brace.
- `git diff` shows reordered/reformatted existing members (not just the 3 added members) → a formatter ran; revert and re-apply by hand.
- Member count grep returns 0 or 2+ → under/over-applied; exactly one `"notableEvents"` per file.
