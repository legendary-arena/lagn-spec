# EC-240 — Registry Viewer `devLog` Category Union Extension (Execution Checklist)

**Source:** docs/ai/work-packets/WP-208-registry-viewer-devlog-category-union-extension.md
**Layer:** Registry Viewer (`apps/registry-viewer/src/lib/devLog.ts`)

## Before Starting
- [ ] WP-183 landed on `main` (`cardPatternsClient.ts` + `schemeTwistClient.ts` exist and call `devLog("cardPatterns", ...)` / `devLog("schemeTwist", ...)`)
- [ ] `apps/registry-viewer/src/lib/devLog.ts:20` defines `Category` as 7 members ending with `"cardAbilities"` (no `cardPatterns`, no `schemeTwist` yet)
- [ ] `pnpm --filter registry-viewer typecheck` currently exits 2 with 15 TS2345 errors in `cardPatternsClient.ts` (7) and `schemeTwistClient.ts` (8)
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- New union members (exact spelling, exact order): `"cardPatterns"` THEN `"schemeTwist"`
- Append position: AFTER `"cardAbilities"` (the current last member); do not reorder prior members
- Final union member count: 9 (7 prior + 2 new)
- File modified: exactly `apps/registry-viewer/src/lib/devLog.ts` (no other source path)
- Expected final type line:
  ```ts
  type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";
  ```

## Guardrails
- Read-only on `cardPatternsClient.ts` and `schemeTwistClient.ts` (consumers are correct; the union is stale)
- Read-only on `devLog` function signature and body (only the type alias changes)
- Append-only on the union (do not reorder, rename, or remove existing members)
- No new imports added to `devLog.ts`
- No `// why:` comment required (additive type widening, no semantic surprise)
- If the union already contains either new literal: STOP (parallel fix landed)
- If the clients use a literal differing from `"cardPatterns"` / `"schemeTwist"`: STOP and ask (scope mismatch)

## Required `// why:` Comments
- None. The union extension is contract-aligned with the consuming clients (WP-183) and self-explanatory.

## Files to Produce
- `apps/registry-viewer/src/lib/devLog.ts` — **modified** — extend `Category` at line 20 by 2 literals
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-208
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `grep -E '^type Category =' apps/registry-viewer/src/lib/devLog.ts` matches the expected line exactly
- [ ] `pnpm --filter registry-viewer typecheck` exits 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `git diff --stat apps/registry-viewer/src/lib/cardPatternsClient.ts apps/registry-viewer/src/lib/schemeTwistClient.ts` empty (consumers untouched)
- [ ] `git status --short | wc -l` returns 4 (1 source + 3 governance)
- [ ] `docs/ai/STATUS.md` Done entry references WP-208 + the union extension
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-240:`

## Common Failure Smells
- Typecheck still red on clients → check exact spelling of new literals (`"cardPatterns"` and `"schemeTwist"`; both camelCase, lowercase-first)
- Build red but typecheck green → unrelated; investigate the build error separately
- 5+ files modified → out-of-scope file touched; revert
- New imports in `devLog.ts` → out-of-scope; revert (the union extension needs no import)
- Reordering of existing union members → revert to append-only
