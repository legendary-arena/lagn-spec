# EC-300 — Hero Mechanic Metadata Feed (Execution Checklist)

**Source:** docs/ai/work-packets/WP-269-hero-mechanic-metadata-feed.md
**Layer:** Shared tooling (`scripts/`) + Registry (`packages/registry`) + Metadata staging (`data/metadata/`)

## Before Starting (Hard Gate — run each; STOP if any fails)
- [ ] Ledger source exists + hero-scoped: `node -e "const d=require('./docs/ai/coverage/hero-mechanic-ledger.json'); process.exit(d.cardType==='hero'&&Array.isArray(d.rows)?0:1)"` → exit 0
- [ ] Metadata staging precedent present: `test -f data/metadata/card-types.json` → OK
- [ ] No feed yet: `test -f data/metadata/card-mechanics.json` → **ABSENT**
- [ ] Registry schema export site present: `test -f packages/registry/src/schema.ts` → OK
- [ ] Engine dist present (transform reads it for source classification): `test -d packages/game-engine/dist` (else `pnpm -r build`)
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Published path: exactly `data/metadata/card-mechanics.json`; R2 `/metadata/card-mechanics.json`
- Schema export: `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema`
- Contract: `{ version:1, scope:"hero", generatedAt, mechanics:[{slug,label,scope,source,cardCount,cardIds,hidden}], cards:{ extId:{mechanics:[]} } }`
- `source` closed union: `keyword` | `composition-marker` | `free-text`
- `scope`: the literal `"hero"`
- `hidden` default: **`true`** (fail-closed — any mechanic absent from `scripts/coverage/mechanic-labels.json` is hidden)
- `mechanics[]` sorted by `slug`; `cardIds` sorted; `cardCount === cardIds.length`
- npm scripts: `mechanics:metadata`, `mechanics:metadata:check`
- DECISIONS reservation: **D-24046**

## Guardrails
- `packages/registry/src/schema.ts` MUST NOT import `@legendary-arena/game-engine` (or any non-`zod`, non-Node module) — schema is data-only; the engine-dist read lives ONLY in `scripts/build-card-mechanics-metadata.mjs`
- Transform is **deterministic**: no `Date.now()`/wall-clock; `generatedAt` derives from input; identical input ⇒ byte-identical output; `--check` regenerates in memory + exits non-zero on drift
- Feed carries ONLY the contract fields — drop ledger `status`/`handler`/`wp`/`decision`
- `for...of` grouping (no `.reduce()` with branching); full-sentence errors
- Do NOT touch any `apps/registry-viewer` or `apps/dashboard` file (that is WP-270)
- `scope` is the literal `"hero"` — do not emit other scopes (WP-271)
- If the ledger shape changed (no `rows[]` / not hero): STOP and reconcile
- If `--check` can't be made byte-stable: STOP and fix the ordering (explicit sort), not the gate

## Required `// why:` Comments
- On the `hidden: true` fail-closed default (raw/free-text tokens hidden until curated).
- On the game-engine **dist** read in the transform (build-script-only; explains why the engine import is acceptable here but forbidden in the schema/viewer).
- On `generatedAt` being input-derived (determinism / `--check` byte-stability).

## Files to Produce
- `scripts/build-card-mechanics-metadata.mjs` — **new** — transform + `--check`
- `scripts/coverage/mechanic-labels.json` — **new** — curated label + hidden side-table
- `data/metadata/card-mechanics.json` — **new** — generated artifact (committed)
- `packages/registry/src/schema.ts` — **modified** — additive `CardMechanicsIndexSchema` + types
- `package.json` — **modified** — `mechanics:metadata(:check)` scripts
- `.github/workflows/ci.yml` — **modified** — freshness gate
- `docs/ai/DECISIONS.md` — **modified** — D-24046
- `docs/ai/STATUS.md` / `WORK_INDEX.md` / `EC_INDEX.md` — **modified** — governance close

## After Completing
- [ ] `pnpm mechanics:metadata` → file with `version`/`scope:"hero"`/`generatedAt`/`mechanics[]`/`cards{}`
- [ ] Per-mechanic: `cardCount===cardIds.length`, `source` ∈ closed union, sorted by slug
- [ ] Fail-closed: a mechanic absent from `mechanic-labels.json` → `hidden:true`; `(unmarked)`/near-dupes hidden
- [ ] `grep -n 'game-engine' packages/registry/src/schema.ts` → **NO MATCH**
- [ ] `pnpm --filter @legendary-arena/registry test` → exit 0 (schema accept + reject tests)
- [ ] `pnpm mechanics:metadata:check` → exit 0 clean; non-zero after a deliberate edit
- [ ] Determinism: two runs byte-identical (`diff -q`)
- [ ] `git diff --name-only | grep -E '^apps/(registry-viewer|dashboard)/'` → **NO MATCH**
- [ ] `pnpm -r build` + `pnpm test` exit 0
- [ ] STATUS/WORK_INDEX/EC_INDEX flipped; D-24046 landed
- [ ] Commit prefix: `EC-300:` (code) + `SPEC:` (governance)

## Common Failure Smells
- `--check` flaps run-to-run → nondeterministic ordering; add explicit `.sort()` on mechanics + cardIds, derive `generatedAt` from input
- Visible junk chips downstream → fail-closed default not applied; absent-from-labels must be `hidden:true`
- Schema pulls Node modules into the viewer build later → an engine/Node import leaked into `schema.ts`; keep it `zod`-only
- `cardCount` ≠ `cardIds.length` → grouping double-counts; dedupe cardIds per mechanic
- Ledger `status`/`handler` leaked into the feed → drop them; the feed is filter-only
