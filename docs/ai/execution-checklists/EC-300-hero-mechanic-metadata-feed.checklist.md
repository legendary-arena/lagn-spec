# EC-300 — Hero Mechanic Metadata Feed (Execution Checklist)

**Source:** docs/ai/work-packets/WP-269-hero-mechanic-metadata-feed.md
**Layer:** Shared tooling (`scripts/`) + Registry (`packages/registry`) + Metadata staging (`data/metadata/`)

## Before Starting (Hard Gate — run each; STOP if any fails)
- [ ] Ledger source exists + hero-scoped: `node -e "const d=require('./docs/ai/coverage/hero-mechanic-ledger.json'); process.exit(d.cardType==='hero'&&Array.isArray(d.rows)?0:1)"` → exit 0
- [ ] Metadata staging precedent present: `test -f data/metadata/card-types.json` → OK
- [ ] No feed yet: `test -f data/metadata/card-mechanics.json` → **ABSENT** on a first run. If PRESENT, inspect `git status` + provenance; continue ONLY if it is this WP-branch's own regenerated artifact. STOP if it came from another branch / WP / abandoned attempt.
- [ ] Registry schema export site present: `test -f packages/registry/src/schema.ts` → OK
- [ ] Engine dist exposes the EXACT classification inputs on their real submodule paths (NOT the barrel — it omits MVP/composition): `node -e "Promise.all([import('./packages/game-engine/dist/rules/heroKeywords.js'),import('./packages/game-engine/dist/hero/heroEffects.execute.js'),import('./packages/game-engine/dist/rules/heroCompositions.js')]).then(([k,e,c])=>process.exit(Array.isArray(k.HERO_KEYWORDS)&&Array.isArray(e.MVP_KEYWORDS)&&Array.isArray(c.HERO_COMPOSITION_MARKER_NAMES)?0:1)).catch(()=>process.exit(1))"` → exit 0 (else `pnpm -r build`; if still failing STOP — reuse the dist exports, do not duplicate the sets)
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Published path: exactly `data/metadata/card-mechanics.json`; R2 `/metadata/card-mechanics.json`
- Schema export: `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema`
- Contract: `{ version:1, scope:"hero", generatedAt, mechanics:[{slug,label,scope,source,cardCount,cardIds,hidden}], cards:{ extId:{mechanics:[]} } }`
- `source` closed union: `keyword` | `composition-marker` | `free-text`
- `scope`: the literal `"hero"`
- `hidden` default: **`true`** (fail-closed — any mechanic absent from `scripts/coverage/mechanic-labels.json` is hidden); ≥1 mechanic MUST be curated visible (`hidden: false`)
- Slug normalization: lowercase → strip wrapping punctuation → non-alphanumeric runs to single `-` → empty becomes `unmarked` (so `(unmarked)` → `unmarked`); the raw ledger string is NOT carried
- `generatedAt` sentinel: `"1970-01-01T00:00:00.000Z"` (ledger has no timestamp; resolution chain in WP-269 Contract)
- Source priority: composition-marker (`HERO_COMPOSITION_MARKER_NAMES`) → keyword (`HERO_KEYWORDS`) → free-text; reuse the engine-dist sets, do not duplicate
- Output ordering: locked top-level + per-entry property order; `mechanics[]` / `cardIds` / `cards{}` keys / per-card mechanics sorted + de-duped; 2-space indent + trailing newline
- Transform self-validates output via `CardMechanicsIndexSchema` (from `../packages/registry/dist/schema.js`) before write/compare
- Schema rejects (`.superRefine`): missing/wrong `version`, non-`hero` scope, bad `source`, dup slugs, dup cardIds, `cardCount`≠length, both join directions
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
- On `generatedAt` being the input-derived fixed sentinel (determinism / `--check` byte-stability).
- On the slug normalization that maps the `(unmarked)` sentinel to `unmarked` (the feed carries only UI-safe slugs).
- On the transform self-validating its output against `CardMechanicsIndexSchema` (producer and schema can never drift apart).

## Files to Produce
- `scripts/build-card-mechanics-metadata.mjs` — **new** — transform + `--check` (self-validates output against the schema)
- `scripts/coverage/mechanic-labels.json` — **new** — curated label + hidden side-table
- `data/metadata/card-mechanics.json` — **new** — generated artifact (committed)
- `packages/registry/src/schema.ts` — **modified** — additive `CardMechanicsIndexSchema` + types (`.superRefine` join + dedup invariants)
- `packages/registry/src/schema.cardMechanicsIndex.test.ts` — **new** — `node:test` accept/reject coverage (mirrors `schema.schemeDeckCounts.test.ts` naming)
- `package.json` — **modified** — `mechanics:metadata(:check)` scripts
- `.github/workflows/ci.yml` — **modified** — freshness gate
- `docs/ai/DECISIONS.md` — **modified** — D-24046
- `docs/ai/STATUS.md` / `WORK_INDEX.md` / `EC_INDEX.md` — **modified** — governance close

## After Completing
- [ ] `pnpm mechanics:metadata` → file with `version`/`scope:"hero"`/`generatedAt`/`mechanics[]`/`cards{}`
- [ ] Per-mechanic: `cardCount===cardIds.length`, `source` ∈ closed union, sorted by slug, slug normalized (no `(`/`)`/uppercase)
- [ ] Bidirectional join: every `cardIds[]` ref resolves in `cards{}` with that slug, AND every `cards[].mechanics[]` slug ∈ `mechanics[]`
- [ ] Fail-closed: a mechanic absent from `mechanic-labels.json` → `hidden:true`; `unmarked`/`cyber-mod-wound`/`cyber-mod-4-wounds` absent or hidden (NORMALIZED slugs)
- [ ] Visible curation: ≥1 mechanic with `hidden:false`
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
- A verification or test checks `slug==='(unmarked)'` → wrong; the slug is normalized to `unmarked` (parens stripped)
- `F` precondition fails on `MVP_KEYWORDS`/`HERO_COMPOSITION_MARKER_NAMES` undefined → you imported the dist **barrel**; import each from its submodule (`hero/heroEffects.execute.js` / `rules/heroCompositions.js`)
- `--check` green but the feed is all-hidden → no visible mechanic curated; add ≥1 `hidden:false` to `mechanic-labels.json`
- Labels file has a slug not in the current ledger → stale curation; the transform must FAIL (not warn) so drift surfaces
