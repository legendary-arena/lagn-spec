# EC-301 — Registry Viewer Hero Mechanic Filter Surface (Execution Checklist)

**Source:** docs/ai/work-packets/WP-270-registry-viewer-mechanic-filter-surface.md
**Layer:** Registry Viewer (`apps/registry-viewer`)

## Before Starting (Hard Gate — run each; STOP if any fails)
- [ ] WP-269 landed — schema exported: `node -e "const s=require('./packages/registry/dist/schema.js'); process.exit(s.CardMechanicsIndexSchema?0:1)"` → exit 0 (else `pnpm -r build`; STOP if still absent)
- [ ] WP-269 landed — feed validates: `node -e "const s=require('./packages/registry/dist/schema.js'); const d=require('./data/metadata/card-mechanics.json'); process.exit(s.CardMechanicsIndexSchema.safeParse(d).success?0:1)"` → exit 0
- [ ] Clone sources present: `test -f apps/registry-viewer/src/lib/cardTypesClient.ts && test -f apps/registry-viewer/src/components/AbilityEffectFilter.vue` → OK
- [ ] No mechanic client yet: `test -f apps/registry-viewer/src/lib/cardMechanicsClient.ts` → **ABSENT** for a fresh run; if PRESENT, continue only as an intentional EC-301 recovery after inspecting the existing file
- [ ] Feed join populated (else WP-269 producer defect → STOP): `node -e "const s=require('./packages/registry/dist/schema.js'); const r=s.CardMechanicsIndexSchema.safeParse(require('./data/metadata/card-mechanics.json')); if(!r.success)process.exit(1); process.exit(r.data.mechanics.length>0 && Object.keys(r.data.cards).length===0 ? 1 : 0)"` → exit 0
- [ ] Empty fallback validates: `node -e "const s=require('./packages/registry/dist/schema.js'); process.exit(s.CardMechanicsIndexSchema.safeParse({version:1,scope:'hero',mechanics:[],cards:{}}).success?0:1)"` → exit 0 (else STOP — align the fallback literals with the WP-269 schema)
- [ ] Baseline green: `pnpm --filter registry-viewer typecheck` → exit 0; `pnpm --filter registry-viewer test` → exit 0
- [ ] Working tree clean except intentional EC-301 recovery files

## Locked Values (do not re-derive)
- Fetched path: `{metadataBaseUrl}/metadata/card-mechanics.json`
- Schema: `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema` (subpath, NOT the barrel)
- Empty non-blocking fallback: `{ version: 1, scope: 'hero', mechanics: [], cards: {} }`, schema-validated (Before-Starting gate); STOP if it fails to validate against the WP-269 schema
- Filter composition: **OR within selected mechanics, AND with text query + existing filters**
- Hidden mechanics: render only `hidden !== true` — an omitted/undefined `hidden` is visible; only an explicit `hidden: true` is suppressed
- Card→mechanic source: the feed's `cards[extId].mechanics` mapping ONLY — never `parseAbilityText`

## Guardrails
- Import `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema` (subpath — barrel pulls Node-only modules into Rollup, per `cardTypesClient.ts:22–31`)
- The viewer MUST NOT import `@legendary-arena/game-engine`, `apps/server`, `apps/dashboard`, or any repo-root `scripts/` file (grep gate)
- `cardMechanicsClient.ts` mirrors `cardTypesClient.ts`: cached module-scope promise, `.safeParse()`, non-blocking empty fallback, `devLog`-instrumented — never throws
- Mechanic filtering applied in `App.vue` `applyFilters()` AFTER `registry.query()` (keep `applyQuery` pure), using the per-card mapping; `for...of` (no `.reduce()` with branching)
- Missing/invalid feed is non-fatal: empty structure → ribbon hidden → grid renders unchanged
- Do NOT touch any producer-side file (`scripts/`, `packages/registry`, `data/metadata/`, `.github/`) — that is WP-269
- If precondition A/B fails: STOP — WP-269 not landed; this WP is BLOCKED
- If a selected mechanic returns cards lacking it in the mapping: STOP — the mapping is the contract; do not parse ability text

## Required `// why:` Comments
- On the non-blocking empty fallback in `cardMechanicsClient.ts` (missing/invalid feed must not break the grid).
- On filtering via the per-card mapping rather than ability-text parsing (the producer already did the work; runtime parsing is forbidden).

## Files to Produce
- `apps/registry-viewer/src/lib/cardMechanicsClient.ts` — **new** — R2 singleton client
- `apps/registry-viewer/src/lib/cardMechanicsClient.test.ts` — **new** — accept/reject/empty-on-failure
- `apps/registry-viewer/src/components/MechanicFilter.vue` — **new** — multi-select ribbon (non-hidden only)
- `apps/registry-viewer/src/App.vue` — **modified** — load + state + ribbon + `applyFilters` wiring
- `docs/ai/STATUS.md` / `WORK_INDEX.md` / `EC_INDEX.md` — **modified** — governance close

## After Completing
- [ ] No forbidden import (incl. App.vue): `if grep -RInE "from\s+['\"][^'\"]*(@legendary-arena/game-engine|apps/server|apps/dashboard|(^|/|\.\./)scripts/)" apps/registry-viewer/src/lib/cardMechanicsClient.ts apps/registry-viewer/src/components/MechanicFilter.vue apps/registry-viewer/src/App.vue; then echo FAIL; exit 1; else echo OK; fi` → OK
- [ ] Schema subpath + path present: `grep -F '@legendary-arena/registry/schema' apps/registry-viewer/src/lib/cardMechanicsClient.ts` ≥1; `grep -F 'card-mechanics.json' apps/registry-viewer/src/lib/cardMechanicsClient.ts` ≥1
- [ ] No ability-text parsing: `if grep -RIn 'parseAbilityText' apps/registry-viewer/src/components/MechanicFilter.vue apps/registry-viewer/src/App.vue; then echo FAIL; exit 1; else echo OK; fi` → OK
- [ ] `pnpm --filter registry-viewer typecheck` exit 0; `test` exit 0 (new tests; prior count preserved); `build` exit 0
- [ ] No producer-side file: `if git diff --name-only | grep -E '^(scripts/|packages/registry/|data/metadata/|\.github/)'; then echo FAIL; exit 1; else echo OK; fi` → OK
- [ ] Working-tree scope exact — `git diff --name-only | sort` is only the Files-to-Produce set (4 viewer + 3 governance, + at most one existing App test-harness file); no producer/game-engine/dashboard/server/scripts file
- [ ] STATUS/WORK_INDEX/EC_INDEX flipped; DECISIONS **not** touched
- [ ] Commit prefix: `EC-301:` (code) + `SPEC:` (governance)

## Common Failure Smells
- Grid blanks when feed is missing → fallback not non-blocking; client must return the empty structure, never throw
- Hidden mechanics appear as chips → ribbon must filter `hidden !== true` (NOT `hidden === false` — that would also hide mechanics whose `hidden` is omitted)
- Filter parses ability text → use `cards[extId].mechanics`; runtime parsing is forbidden
- Mechanic filter ANDs within selections (no results when 2+ picked) → composition is OR-within-mechanics
- Barrel import breaks the browser build → import the schema from `/schema`, not the barrel
- Producer file shows in the diff → out of scope; revert (that's WP-269)
