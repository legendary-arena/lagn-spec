# EC-150 — PhysicalCard companionSlug + Physical-Side Order (Execution Checklist)

**Source:** docs/ai/work-packets/WP-147-physical-card-companion-slug-and-side-order.md
**Layer:** Registry (schema + new module) + Tooling (`scripts/convert-cards/`) + Data (`data/cards/mgtg.json`)

## Before Starting

- [ ] Lint gate `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` passed for this session
- [ ] WP-137, WP-138, WP-140 EXECUTED (not just drafted) — `WORK_INDEX.md` shows `[x]` for each
- [ ] Registry baseline (`pnpm --filter @legendary-arena/registry build` + `test`) green pre-execution; record baseline test count
- [ ] Engine baseline (`pnpm --filter @legendary-arena/game-engine build` + `test`) green and recorded — must remain UNCHANGED after this WP
- [ ] `docs/ai/DECISIONS.md` most recent entry is D-14503 or later (post-WP-145); D-14701, D-14702 land at execution
- [ ] `data/cards/mgtg.json` currently has Drax `physicalCards[]` p1..p6 and no `companionSlug` fields anywhere (verified at draft time)

## Locked Values (do not re-derive)

- `heroImageUrl` signature: `heroImageUrl(setAbbr: string, heroSlug: string, sides: readonly string[], companionSlug?: string): string`
- Filename when `companionSlug` present: `{setAbbr}-hr-{heroSlug}-{companionSlug}-{sides.join('-')}.webp`
- Filename when `companionSlug` absent: `{setAbbr}-hr-{heroSlug}-{sides.join('-')}.webp`
- Two-side sides[] order: **source-data order, NO `.sort()`** (D-14702 narrow override of D-13802)
- `companionSlug` regex: `^[a-z0-9-]+$`, min length 1, **optional** field on `PhysicalCardSchema`
- `R2_BASE_URL` value (unchanged this WP): `https://images.barefootbetters.com` — host migration is a separate orthogonal WP
- Drax p1: `{ id: "p1", count: 2, sides: ["remove-his-spine", "also-illegal"], companionSlug: "rhomann-dey", imageUrl: "https://images.barefootbetters.com/mgtg/mgtg-hr-drax-rhomann-dey-remove-his-spine-also-illegal.webp" }`
- Drax p3: `{ id: "p3", count: 3, sides: ["i-am-invisible", "xandar-is-invincible"], companionSlug: "irani-rael", imageUrl: "https://images.barefootbetters.com/mgtg/mgtg-hr-drax-irani-rael-i-am-invisible-xandar-is-invincible.webp" }`
- Test-count delta: **+14 tests** (+4 schema in `registry.smoke.test.ts`, +10 in new `heroImageUrl.test.ts` — last case is a determinism duplicate-call assertion)
- Decisions in numeric order: D-14701 (companionSlug), D-14702 (two-side physical-side order overrides D-13802)
- Drax `hero.slug` stays `"drax"`, `hero.name` stays `"Drax"` — companion is per-physicalCard, NOT a hero pairing

## Guardrails

- D-13802 sort lock **REMAINS in effect** for single-side filenames and any future automatic ordering; only `sides.length === 2` is overridden, scoped narrowly by D-14702
- `companionSlug` is **optional** — the 1245 existing single-side and 39 existing two-side physicalCards must validate without modification
- 1245 existing single-side `imageUrl` values must remain **bit-identical** after the change (single-side path semantically unchanged)
- 39 existing two-side `imageUrl` values must remain **bit-identical** as well (their current `sides[]` arrays are already alphabetical, so the no-sort change produces the same URLs by construction); reordering those entries is audit-scope follow-up, NOT this WP
- Every `heroImageUrl()` call site in `convert-cards-v15.mjs` passes **four** positional arguments — pass `undefined` explicitly when no companion source exists; no call site may omit the 4th arg
- `convert-cards-v15.mjs` imports `heroImageUrl` and `R2_BASE_URL` from `../../packages/registry/dist/heroImageUrl.js`; deletes the local function + constant
- Only Drax in `mgtg.json` is touched — p2, p4, p5, p6 unchanged; no other hero in `mgtg.json`; no other set's JSON
- All 4 cross-field invariants in `HeroSchema.superRefine` continue to pass for the existing data (non-empty `physicalCards`, orphan-side, duplicate-membership, cardCounts drift)
- **Engine + server source UNTOUCHED** — `git diff packages/game-engine/ apps/server/` MUST be empty post-execution
- No new npm dependencies; no Math.random; no boardgame.io imports anywhere new
- Audit of the 37 OTHER existing two-side physicalCards across other sets is **explicit out-of-scope follow-up**; do not adjust their `sides[]` order in this WP

## Required `// why:` Comments

- `packages/registry/src/schema.ts` `PhysicalCardSchema.companionSlug`: anchor D-14701 (per-physical-card companion character)
- `packages/registry/src/heroImageUrl.ts` function header: anchor D-14701 (companionSlug) + D-14702 (physical-side order)
- `packages/registry/src/heroImageUrl.ts` two-side join (no `.sort()`): anchor D-14702 explicitly
- `packages/registry/src/heroImageUrl.ts` `R2_BASE_URL` export: anchor "URL assembly only, no network access; host migration is a separate orthogonal WP"
- `packages/registry/src/heroImageUrl.test.ts` the `["b","a"]` test: anchor D-14702 (order preserved even when not alphabetical)
- `scripts/convert-cards/convert-cards-v15.mjs` import line: anchor "reach into registry's built `dist/` rather than workspace export; one function does not justify making `scripts/convert-cards/` a workspace package"

## Files to Produce

- `packages/registry/src/schema.ts` — modified — add optional `companionSlug` to `PhysicalCardSchema`
- `packages/registry/src/heroImageUrl.ts` — **new** — exports `heroImageUrl()` + `R2_BASE_URL`
- `packages/registry/src/heroImageUrl.test.ts` — **new** — 9 unit tests
- `packages/registry/src/registry.smoke.test.ts` — modified — +4 tests (companionSlug accept/reject/absent + Drax data shape)
- `scripts/convert-cards/convert-cards-v15.mjs` — modified — delete local `heroImageUrl` + `R2_BASE_URL`; import from registry dist; every call site passes 4 args
- `data/cards/mgtg.json` — modified — Drax `physicalCards[]` p1 + p3 only (locked literal values above)
- `docs/ai/REFERENCE/00.2-data-requirements.md` — modified — document `companionSlug` + D-14702 note on two-side ordering
- `docs/ai/DECISIONS.md` — modified — append D-14701 + D-14702 (Context/Decision/Rationale/Consequences each)
- `docs/ai/STATUS.md` — modified — note `companionSlug` + Drax first application + audit-follow-up reminder
- `docs/ai/work-packets/WORK_INDEX.md` — modified — WP-147 row Draft → Done with date
- `docs/ai/execution-checklists/EC_INDEX.md` — modified — EC-150 row Draft → Done with date

**Explicitly NOT touched** (verify via `git diff --stat`): `packages/game-engine/`, `apps/**`, all `data/cards/*.json` except `mgtg.json`, the 37 non-Drax two-side `physicalCards[]` entries across other sets.

## After Completing

- [ ] Registry build green; `dist/heroImageUrl.js` exists (Step 1b); registry test green with **+14 tests** vs pre-WP baseline
- [ ] Engine + apps baseline UNCHANGED: `git diff --stat packages/game-engine/ apps/` empty
- [ ] `git diff --name-only data/cards/` shows exactly `data/cards/mgtg.json`
- [ ] Verification Steps 3, 4, 4b, 4c, 5 all produce expected output (no local definitions; import present; no 3-arg calls; positive 4-arg sanity match; Drax data shape `OK`)
- [ ] DECISIONS.md contains `### D-14701` and `### D-14702` headers, each with Context/Decision/Rationale/Consequences
- [ ] `WORK_INDEX.md` WP-147 row Draft → Done with date + commit; `EC_INDEX.md` EC-150 row Draft → Done; `STATUS.md` updated

## Common Failure Smells

- Existing data fails to validate post-WP: `companionSlug` made required instead of `.optional()` on `PhysicalCardSchema`
- Two-side filename came out alphabetically reordered: `.sort()` not removed from the new `heroImageUrl.ts`, or a second sort slipped into a call site
- Drax p1 `imageUrl` reads `also-illegal-remove-his-spine` (alphabetical): `sides[]` array in `mgtg.json` p1 was left in the old alphabetical order — must be `["remove-his-spine", "also-illegal"]`
- `dist/heroImageUrl.js` missing after `pnpm registry:build`: registry `tsconfig.build.json` `include` pattern doesn't cover the new file — adjust to match `src/**/*.ts`
- Engine test count drifts: scope creep — engine source touched when it should not be; revert engine edits
- 3-arg `heroImageUrl(...)` call still present: audit missed a call site — Verification Step 4b is the mechanical catch
- Registry build red with "Cannot find module '../../packages/registry/dist/heroImageUrl.js'" when running convert script: registry was not built before script invocation — `pnpm --filter @legendary-arena/registry build` first
- Companion slug inserted in the **wrong position** (after sides instead of between heroSlug and sides — e.g., `mgtg-hr-drax-i-am-invisible-xandar-is-invincible-irani-rael.webp`): incorrect template assembly in `heroImageUrl()`; segment order must be `setAbbr-hr-heroSlug-[companionSlug-]sides`
