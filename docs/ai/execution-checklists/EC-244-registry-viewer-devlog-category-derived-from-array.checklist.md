# EC-244 — Registry Viewer `devLog` Category Derived From `LOG_CATEGORIES` (Execution Checklist)

**Source:** docs/ai/work-packets/WP-213-registry-viewer-devlog-category-derived-from-array.md
**Layer:** Registry Viewer (`apps/registry-viewer/src/lib/devLog.ts`)

## Before Starting (Hard Gate — run each; STOP if any fails)
- [ ] (A1) All 9 literals present, layout-independent: `grep -oE '"(registry|theme|filter|render|glossary|cardTypes|cardAbilities|cardPatterns|schemeTwist)"' apps/registry-viewer/src/lib/devLog.ts | sort -u | wc -l` → **9**
- [ ] (A2) WP-208 landed — canonical single-line union: `grep -Fx 'type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities" | "cardPatterns" | "schemeTwist";' apps/registry-viewer/src/lib/devLog.ts` → **exact match**. A2 is the gate; if A1 = 9 but A2 misses, the union was reformatted → STOP (WP-208-scope concern)
- [ ] No array yet: `grep -F 'LOG_CATEGORIES' apps/registry-viewer/src/lib/devLog.ts` → **NO MATCH**
- [ ] `Category` not exported: `grep -E '^export (type )?Category' apps/registry-viewer/src/lib/devLog.ts` → **NO MATCH**
- [ ] Baseline green BEFORE edit: `pnpm --filter registry-viewer typecheck` → **exit 0**
- [ ] Clients call the literals: `grep -c 'devLog("cardPatterns"' …/cardPatternsClient.ts` → **7**; `grep -c 'devLog("schemeTwist"' …/schemeTwistClient.ts` → **8**
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Array members (exact, **locked canonical order**): `"registry"`, `"theme"`, `"filter"`, `"render"`, `"glossary"`, `"cardTypes"`, `"cardAbilities"`, `"cardPatterns"`, `"schemeTwist"` (9 — unchanged from the WP-208 union). The order is **normative** — use this list, do NOT infer it by reading the file (guards against a local reorder silently changing the output). Do NOT alphabetize.
- **Type-identity guard — all three or the type diverges:** (a) exact 9-member set; (b) byte-identical casing (camelCase, lowercase-first); (c) `as const` present. Missing `as const` widens elements to `string` and collapses `Category` to `string` — every string then typechecks, so a green typecheck does NOT prove `as const` held. Verify all three explicitly.
- Derived type (exact): `type Category = (typeof LOG_CATEGORIES)[number];`
- `LOG_CATEGORIES` and `Category` stay **module-local** — no `export` (exporting would couple external code to dev-only categories and break UI-layer isolation; clients pass string literals, they do not import the type)
- File modified: exactly `apps/registry-viewer/src/lib/devLog.ts` (no other source path)
- DECISIONS reservation: **D-21001** (amends D-12501 §7). The entry MUST: (a) reference D-12501 §7; (b) state the manual per-domain extension requirement is retired; (c) describe the single-source-derived mechanism; (d) confirm no behavioral change.
- Expected final declaration region:
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

## Guardrails
- Read-only on `cardPatternsClient.ts` and `schemeTwistClient.ts` (consumers correct; byte-identical pre/post)
- Read-only on the `devLog` function signature/body/JSDoc and the module `import` (only the comment + type-declaration region changes)
- Same 9 literals, same order — no add/remove/rename/reorder
- No `export` added; no new import added
- `as const` is mandatory (see Locked Values)
- Source change confined to the comment + type region: `git diff --unified=0 devLog.ts` shows no `devLog`-function / JSDoc / import hunks
- If the union is already derived (`(typeof LOG_CATEGORIES)[number]`): STOP (parallel fix landed)
- If a client has begun importing `Category` / `LOG_CATEGORIES`: STOP and ask (exporting + no-public-surface posture must be revisited)
- **No speculative fixes:** if any invariant/step fails with an unclear root cause, STOP — capture `git diff devLog.ts` + full `pnpm --filter registry-viewer typecheck` output, report before correcting

## Required `// why:` Comments
- **One required.** Rewrite the audit-trail `// why:` comment above the declaration to explain the single-source mechanism (append one array element → union derives → cannot drift), preserve the WP-086 / WP-125 / WP-208 extension history, and point D-12501 §7 → D-21001. (Form given under Locked Values.)

## Files to Produce
- `apps/registry-viewer/src/lib/devLog.ts` — **modified** — introduce `LOG_CATEGORIES`; derive `Category`; rewrite the audit-trail comment
- `docs/ai/DECISIONS.md` — **modified** — new D-21001 amending D-12501 §7
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-213
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — status → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — status → Done

## After Completing
- [ ] `grep -F 'const LOG_CATEGORIES = [' apps/registry-viewer/src/lib/devLog.ts` → one match; `grep -F '] as const;' …` → match
- [ ] `grep -F 'type Category = (typeof LOG_CATEGORIES)[number];' apps/registry-viewer/src/lib/devLog.ts` → exact match
- [ ] `grep -E '^type Category = "' apps/registry-viewer/src/lib/devLog.ts` → **NO MATCH** (no hand-written union remains)
- [ ] `grep -E '^export (const LOG_CATEGORIES|type Category)' apps/registry-viewer/src/lib/devLog.ts` → **NO MATCH**
- [ ] Audit comment carries history + pointer: `grep -F 'D-21001' …/devLog.ts` and `grep -F 'WP-208' …/devLog.ts` → each ≥ 1 match
- [ ] `pnpm --filter registry-viewer typecheck` exits 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `git diff apps/registry-viewer/src/lib/cardPatternsClient.ts apps/registry-viewer/src/lib/schemeTwistClient.ts` → **empty** (consumers byte-identical)
- [ ] Post-fix sanity: `grep -c 'devLog("cardPatterns"' …/cardPatternsClient.ts` → 7; `grep -c 'devLog("schemeTwist"' …/schemeTwistClient.ts` → 8
- [ ] Source change confined: `git diff --unified=0 apps/registry-viewer/src/lib/devLog.ts` touches only the comment + type region
- [ ] Sharper negative guard: `git diff --word-diff apps/registry-viewer/src/lib/devLog.ts` shows ONLY union/comment removal + `LOG_CATEGORIES`/derived-type/comment addition — ANY word change in the `devLog` body, JSDoc, or import is a HARD FAIL
- [ ] `git status --short | wc -l` returns 5 (1 source + 4 governance)
- [ ] `docs/ai/STATUS.md` Done entry references WP-213 + the derived-type conversion
- [ ] `docs/ai/DECISIONS.md` has D-21001 amending D-12501 §7; no other entry touched
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-244:`

## Common Failure Smells
- `Category` collapses to `string` (clients accept any string) → missing `as const` on `LOG_CATEGORIES`; add it
- Typecheck red on a client after conversion → the resolved type should be identical; do NOT edit the client — re-check `as const` and the member set/order, then STOP and report if it persists
- `noUnusedLocals` complains about `LOG_CATEGORIES` → it shouldn't (the `typeof` query counts as a use); do NOT add an `export` to silence it — investigate the real cause
- Array alphabetized or reordered "for tidiness" → revert; the order is the locked extension timeline (diff clarity + audit traceability), not a style choice
- 6+ files modified → out-of-scope file touched; revert
- `git diff --unified=0 devLog.ts` shows hunks in the `devLog` function or JSDoc → out-of-scope edit; revert to the comment + type region only
- WP-086 / WP-125 / WP-208 history dropped from the comment → restore it (the rewrite preserves provenance, it doesn't erase it)
- D-12501 §7 left unamended → add D-21001; the mechanism this WP changes is a recorded decision, not undocumented machinery
