# EC-240 — Registry Viewer `devLog` Category Union Extension (Execution Checklist)

**Source:** docs/ai/work-packets/WP-208-registry-viewer-devlog-category-union-extension.md
**Layer:** Registry Viewer (`apps/registry-viewer/src/lib/devLog.ts`)

## Before Starting (Hard Gate — run each; STOP if any fails)
- [ ] Both clients exist: `test -f apps/registry-viewer/src/lib/cardPatternsClient.ts && test -f apps/registry-viewer/src/lib/schemeTwistClient.ts`
- [ ] Call-site counts match: `grep -c 'devLog("cardPatterns"' …/cardPatternsClient.ts` → **7**; `grep -c 'devLog("schemeTwist"' …/schemeTwistClient.ts` → **8**
- [ ] Union missing both literals: `grep -E '"cardPatterns"|"schemeTwist"' apps/registry-viewer/src/lib/devLog.ts` → **NO MATCH**
- [ ] Union currently 7-member form: `grep -Fx 'type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities";' apps/registry-viewer/src/lib/devLog.ts` → **exact match**
- [ ] Typecheck currently red: `pnpm --filter registry-viewer typecheck` → **exit != 0**, TS2345 referencing `cardPatterns` / `schemeTwist`
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- New union members (exact spelling, exact order): `"cardPatterns"` THEN `"schemeTwist"`
- Append position: AFTER `"cardAbilities"` (the current last member); do not reorder prior members
- Final union member count: 9 (7 prior + 2 new)
- File modified: exactly `apps/registry-viewer/src/lib/devLog.ts` (no other source path)
- Expected final type line (byte-for-byte, single physical line):
  ```ts
  type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";
  ```
- Audit-trail `// why:` comment appended above the union (preserve the existing `"cardAbilities"` block — append, do not overwrite). Exact prose is the executor's, but it MUST name both new members, cite WP-183 as the origin, and cite the WP-086 / WP-125 precedent:
  ```ts
  // why: "cardPatterns" + "schemeTwist" appended under EC-240 / WP-208 —
  // mechanical dependency of cardPatternsClient.ts + schemeTwistClient.ts
  // (added by WP-183). WP-086 ("cardTypes") and WP-125 ("cardAbilities",
  // D-12501 §7) are the precedent: the same closed-union audit-trail extension.
  ```

## Guardrails
- Read-only on `cardPatternsClient.ts` and `schemeTwistClient.ts` (consumers are correct; the union is stale)
- Read-only on `devLog` function signature and body (only the type alias changes)
- Append-only on the union (do not reorder, rename, or remove existing members)
- No new imports added to `devLog.ts`
- Source change confined to `devLog.ts`, and within it to the union line + its audit-trail comment; `devLog` signature/body/JSDoc/imports byte-identical
- Extend the audit-trail `// why:` comment per WP-086 / WP-125 precedent (see Required `// why:` Comments below) — do NOT drop or stale it
- If the union already contains either new literal: STOP (parallel fix landed)
- If the clients use a literal differing from `"cardPatterns"` / `"schemeTwist"`: STOP and ask (scope mismatch)

## Required `// why:` Comments
- **One required.** Extend the audit-trail `// why:` comment above the `Category` union to document the `"cardPatterns"` + `"schemeTwist"` extension, matching the file's established convention (WP-086 added `"cardTypes"`; WP-125 added `"cardAbilities"`; D-12501 §7 locks the closed-union audit-trail). The note must name both new members, cite WP-183 as the mechanical-dependency origin, and cite the WP-086 / WP-125 precedent. Preserve the existing `"cardAbilities"` provenance lines. (Form given under Locked Values.)

## Files to Produce
- `apps/registry-viewer/src/lib/devLog.ts` — **modified** — extend `Category` at line 20 by 2 literals
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-208
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `grep -Fx 'type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";' apps/registry-viewer/src/lib/devLog.ts` → exact whole-line match
- [ ] Audit comment present: `grep -E 'cardPatterns.*schemeTwist|schemeTwist.*cardPatterns' apps/registry-viewer/src/lib/devLog.ts | grep -F 'WP-208'` → at least one match
- [ ] `pnpm --filter registry-viewer typecheck` exits 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `git diff apps/registry-viewer/src/lib/cardPatternsClient.ts apps/registry-viewer/src/lib/schemeTwistClient.ts` → **empty** (consumers byte-identical; not `--stat`, which can hide content edits)
- [ ] Post-fix sanity — fix is exercised: `grep -c 'devLog("cardPatterns"' …/cardPatternsClient.ts` → 7; `grep -c 'devLog("schemeTwist"' …/schemeTwistClient.ts` → 8
- [ ] Source change confined: `git diff --unified=0 apps/registry-viewer/src/lib/devLog.ts` touches only the union line + its `// why:` comment (no devLog function / JSDoc / import hunks)
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
- Audit-trail comment missing or still naming only `"cardAbilities"` → stale; extend it to cover the two new members (the file convention requires the trail)
- Existing `"cardAbilities"` provenance lines overwritten → restore them; the new note is appended, not a replacement
- `git diff --unified=0 devLog.ts` shows hunks in the `devLog` function or JSDoc → out-of-scope edit; revert to union line + comment only
