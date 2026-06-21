# WP-270 — Registry Viewer Hero Mechanic Filter Surface

**Status:** Reviewed — ready to execute (drafted + reviewed 2026-06-20; **tightened 2026-06-20** — **fixed the locked empty-fallback literal (it omitted the schema-REQUIRED `generatedAt`, so precondition H would have failed and STOPped execution; corrected to carry the `1970-01-01T00:00:00.000Z` sentinel)**, A–F→A–H precondition-count fix, decisive mechanic-predicate test path [pure exported helper co-located in the client; no conditional 8th file], client tests reworded to client-behavior not producer-schema re-test, empty-fallback single-constant lock, `hidden !== true` grep gate; gates re-run post-tightening — pre-flight READY · copilot PASS · lint PASS).
**Primary Layer:** Registry Viewer (`apps/registry-viewer`)
**Dependencies:** WP-269 (publishes `data/metadata/card-mechanics.json` to R2 and exports `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema` — this WP consumes both; WP-269 must land first)

---

## Session Context

WP-269 (producer) lands a viewer-safe, normalized hero-mechanic feed at `/metadata/card-mechanics.json` (staged `data/metadata/card-mechanics.json`, published to R2) plus a `CardMechanicsIndexSchema` in the registry package. This WP (consumer) wires that feed into the registry-viewer so a user can **filter cards by hero mechanic** — the immediate user value the operator asked for ("query published hero mechanics in registry-viewer").

The viewer already has the full pattern: a Zod-validated R2-fetched singleton client (`cardTypesClient.ts`, `cardAbilitiesClient.ts`) feeding a chip-ribbon filter (`AbilityEffectFilter.vue`) applied in `App.vue`'s `applyFilters()` after the registry query. This WP clones that path for mechanics. Critically, cards are filtered by the feed's **per-card `cards{ extId: { mechanics } }` mapping** — the viewer never parses ability text at runtime (the producer already did the work).

The feed is non-blocking by contract: a missing or invalid `card-mechanics.json` degrades to an empty mechanic set (the ribbon hides / is empty), exactly like the existing taxonomy clients. The card grid always renders.

---

## Goal

After this session, the registry-viewer fetches `/metadata/card-mechanics.json` through a new `cardMechanicsClient.ts` (cached singleton, `safeParse`, non-blocking empty fallback), validates it with `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema`, and renders a **mechanic filter ribbon** (`MechanicFilter.vue`) showing only non-`hidden` mechanics. Selecting one or more mechanics filters the card grid (OR within selected mechanics, AND with the active text query + existing filters) using the feed's per-card mapping. A missing/invalid feed leaves the grid fully functional with no mechanic ribbon. `pnpm --filter registry-viewer typecheck`, `test`, and `build` all exit 0.

---

## Assumes (Hard-Gate Preconditions — MUST PASS BEFORE EDIT)

```bash
# A. WP-269 landed: the schema is exported from the viewer-safe subpath
node -e "const s=require('./packages/registry/dist/schema.js'); if(!s.CardMechanicsIndexSchema) process.exit(1); console.log('A_OK');"
# Expected: A_OK  (run `pnpm -r build` first; STOP if absent — WP-269 not landed)

# B. WP-269 landed: the staged feed exists and validates
test -f data/metadata/card-mechanics.json && node -e "const s=require('./packages/registry/dist/schema.js'); const d=require('./data/metadata/card-mechanics.json'); const r=s.CardMechanicsIndexSchema.safeParse(d); process.exit(r.success?0:1);" && echo "B_OK"
# Expected: B_OK

# C. The viewer's taxonomy-client precedent exists (clone source)
test -f apps/registry-viewer/src/lib/cardTypesClient.ts && test -f apps/registry-viewer/src/components/AbilityEffectFilter.vue && echo "C_OK"
# Expected: C_OK

# D. No mechanic client/filter exists yet
test -f apps/registry-viewer/src/lib/cardMechanicsClient.ts && echo "EXISTS" || echo "ABSENT"
# Expected: ABSENT

# E. Baseline green BEFORE the edit
pnpm --filter registry-viewer typecheck   # Expected: exit 0
pnpm --filter registry-viewer test        # Expected: exit 0

# F. Governance docs exist
test -f docs/ai/DECISIONS.md && test -f docs/ai/ARCHITECTURE.md && echo "F_OK"

# G. Feed join is populated when mechanics exist (else a producer join gap)
node - <<'NODE'
const s = require('./packages/registry/dist/schema.js');
const d = require('./data/metadata/card-mechanics.json');
const r = s.CardMechanicsIndexSchema.safeParse(d);
if (!r.success) { console.error('schema invalid'); process.exit(1); }
if (r.data.mechanics.length > 0 && Object.keys(r.data.cards).length === 0) {
  console.error('JOIN_GAP: mechanics[] non-empty but cards{} empty');
  process.exit(1);
}
console.log('G_OK');
NODE
# Expected: G_OK  (if JOIN_GAP: STOP — WP-269 producer defect, not a consumer workaround)

# H. The empty fallback is schema-compatible (MUST include generatedAt — the schema requires it)
node -e "const s=require('./packages/registry/dist/schema.js'); const r=s.CardMechanicsIndexSchema.safeParse({version:1,scope:'hero',generatedAt:'1970-01-01T00:00:00.000Z',mechanics:[],cards:{}}); process.exit(r.success?0:1)" && echo "H_OK"
# Expected: H_OK  (if fails: STOP and align the locked fallback literals with the WP-269 schema — do not invent a viewer-only shape)
```

If precondition A, B, G, or H fails, **STOP** — this WP is blocked by the WP-269 producer contract and must not work around it in the viewer.

---

## Context (Read First)

- `apps/registry-viewer/src/lib/cardTypesClient.ts` — the singleton-client template: cached module-scope promise, fetch `{metadataBaseUrl}/metadata/<file>.json`, `.safeParse()` against a `@legendary-arena/registry/schema` import, non-blocking `[]`/empty fallback on HTTP or schema failure, `devLog` instrumentation. Mirror it exactly.
- `apps/registry-viewer/src/components/AbilityEffectFilter.vue` + its wiring in `App.vue` (`applyFilters()`, the chip-ribbon `v-if` guard, OR-within / AND-across semantics) — the filter-surface template. The mechanic filter mirrors this (multi-select chips, hidden when empty).
- `apps/registry-viewer/src/registry/shared.ts` (`applyQuery`) + `apps/registry-viewer/src/App.vue` (`applyFilters`) — mechanic filtering is applied in `applyFilters` **after** `registry.query()`, keeping the registry-side query pure (same layering as ability-effect + pattern filters).
- `packages/registry/src/schema.ts` `CardMechanicsIndexSchema` (from WP-269) — the validation contract; import via `@legendary-arena/registry/schema` (the barrel-avoidance subpath, per `cardTypesClient.ts:22–31`).
- `apps/registry-viewer/CLAUDE.md` + `.claude/rules/architecture.md §Import Rules` — the viewer may import `@legendary-arena/registry` subpaths + UI; MUST NOT import `game-engine`, `server`, `apps/dashboard`, or the repo-root coverage scripts.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4, Rule 6, Rule 11; `for...of` over `.reduce()`.

---

## Scope (In)

- Add `apps/registry-viewer/src/lib/cardMechanicsClient.ts` — a cached singleton fetching `{metadataBaseUrl}/metadata/card-mechanics.json`, validating with `CardMechanicsIndexSchema`, returning the parsed `CardMechanicsIndex` or a non-blocking empty structure (`{ version: 1, scope: 'hero', generatedAt: '1970-01-01T00:00:00.000Z', mechanics: [], cards: {} }` — the schema-validated literals from precondition H; `generatedAt` is REQUIRED by the schema, so the fallback carries the producer's sentinel) on HTTP/schema failure. `devLog`-instrumented (mirror `cardTypesClient.ts`).
- Add `apps/registry-viewer/src/lib/cardMechanicsClient.test.ts` — `node:test` coverage of the viewer client's *use* of the schema and of the exported mechanic predicate: (a) a valid mocked fetch returns the parsed mechanics index; (b) a malformed mocked fetch returns the locked empty fallback; (c) a failed/unavailable fetch returns the locked empty fallback; (d) the predicate matches cards via `cards[extId].mechanics` — empty selection → all cards pass; one slug → only cards mapped to it; applied to a query-result subset → only the BOTH-satisfying subset. These verify client behavior; they do NOT re-test or redefine the producer `CardMechanicsIndexSchema` (that is WP-269's `schema.cardMechanicsIndex.test.ts`).
- Add `apps/registry-viewer/src/components/MechanicFilter.vue` — a multi-select chip ribbon listing only mechanics where `hidden !== true` (label + cardCount), emitting the selected slug set. No visible ribbon when the visible mechanic list is empty (including the missing/invalid-feed fallback case, AND the case where every mechanic is `hidden: true`).
- Modify `apps/registry-viewer/src/App.vue` — load the feed at mount (parallel with the other non-blocking taxonomy fetches), hold selected-mechanic state, render `MechanicFilter`, and apply mechanic filtering in `applyFilters()` using the feed's per-card `cards{ extId: { mechanics } }` mapping: a card passes if it has ANY selected mechanic (OR within mechanics), composed with the existing query + filters (AND across). No runtime ability-text parsing.
- Expose the mechanic-match logic as a **pure exported function co-located in `cardMechanicsClient.ts`** (e.g. `cardMatchesMechanics(index, cardExtId, selectedSlugs)` — true when no mechanic is selected, or when the card's `cards[extId].mechanics` includes ANY selected slug). `App.vue`'s `applyFilters()` calls it inline **after** `applyQuery()` (mirroring how the WP-125 ability-effect filter is applied against the post-query set), so the OR-within / AND-across composition is structural. The filter-correctness coverage lives in the already-listed `cardMechanicsClient.test.ts` (item above). **There is no separate App-level/SFC test and no new production helper file:** the viewer has no `App.vue`/`applyFilters` SFC test harness (verified — only pure `.ts` helpers like `applyQuery` are unit-tested, per `registry/shared.test.ts`), so the predicate is tested at the `.ts` layer exactly as `applyQuery` is. Do NOT add an unlisted helper or an eighth production file.

## Out of Scope

- Any producer-side change (transform, schema, `data/metadata/`, CI gate) — that is WP-269.
- Deriving mechanics from ability text at runtime — the per-card mapping in the feed is the sole source.
- Showing `hidden: true` mechanics in the default ribbon (they may exist in the feed for diagnostics but must not render as primary chips; the ribbon shows only `hidden !== true` — realizes AC-7 at the UI layer).
- Villain/mastermind/scheme/henchman mechanics (the feed is hero-scoped; all-types is WP-271).
- Importing `game-engine`, `apps/dashboard`, `apps/server`, or repo-root coverage scripts.
- Mirroring the `/coverage` dashboard (status/observed-in-play/handler columns).

---

## Files Expected to Change

- `apps/registry-viewer/src/lib/cardMechanicsClient.ts` — **new** (R2 singleton client)
- `apps/registry-viewer/src/lib/cardMechanicsClient.test.ts` — **new** (client/schema tests)
- `apps/registry-viewer/src/components/MechanicFilter.vue` — **new** (filter ribbon)
- `apps/registry-viewer/src/App.vue` — **modified** (load + state + ribbon + `applyFilters` wiring)
- `docs/ai/STATUS.md` — **modified** (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** (status flip)
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** (status flip)

**Exactly 7 files (4 viewer + 3 governance).** The mechanic-match predicate is a pure exported function co-located in the already-listed `cardMechanicsClient.ts`, and its correctness is tested in the already-listed `cardMechanicsClient.test.ts` — so there is **no conditional eighth file and no new production helper**. No new DECISIONS entry — this WP consumes the D-24046 contract WP-269 locks; it creates no new decision (the filter semantics mirror the existing ability-effect filter).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — N/A
- Never throw inside boardgame.io move functions — N/A
- ESM only, Node v22+; `node:` prefix on built-ins
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — `for...of` filtering (no `.reduce()` with branching), full-word names, `// why:` on the non-blocking fallback and the per-card-mapping filter
- Full file contents required for every new/modified file — no diffs, no snippets

**Packet-specific:**
- `cardMechanicsClient.ts` imports `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema` (the subpath, NOT the barrel — barrel pulls Node-only modules into the Rollup graph, per `cardTypesClient.ts:22–31`).
- The viewer MUST NOT import `@legendary-arena/game-engine`, `apps/server`, `apps/dashboard`, or any repo-root `scripts/` file — enforced by a grep gate (realizes **AC-2**).
- Card→mechanic filtering uses the feed's `cards{ extId: { mechanics } }` mapping only — NO `parseAbilityText`/ability-text scan for filtering.
- Missing/invalid feed is non-fatal: the client returns the empty structure, the ribbon hides, the grid renders unchanged (realizes **AC-4**).
- Define the locked empty fallback **once** as a module-level constant in `cardMechanicsClient.ts` and return that constant from EVERY HTTP/schema/fetch failure path — do not reconstruct or partially duplicate the literal across branches (a branch returning `{ mechanics: [], cards: {} }` without `version`/`scope`/`generatedAt` would violate the schema-validated-fallback contract from precondition H — `generatedAt` is a REQUIRED schema field).
- The ribbon renders mechanics where `hidden !== true`; only an explicit `hidden: true` suppresses a chip (an omitted/undefined `hidden` is visible) — realizes **AC-7**.
- Mechanic filter composes as OR-within-selected, AND-with-existing-query/filters (mirror `AbilityEffectFilter` semantics — realizes **AC-5/AC-6**).

**Session protocol:**
- If precondition A/B fails (schema or feed absent): STOP — WP-269 has not landed; this WP is BLOCKED.
- If the feed validates but `cards{}` is empty while `mechanics[]` is non-empty: STOP and report (producer join gap — a WP-269 defect, not something the consumer works around).
- If filtering by a mechanic returns cards whose `cards[extId].mechanics` lacks it: STOP — the mapping is the contract; do not fall back to ability-text parsing.

**Locked contract values:**
- Fetched path: `{metadataBaseUrl}/metadata/card-mechanics.json`
- Schema: `CardMechanicsIndexSchema` from `@legendary-arena/registry/schema`
- Empty fallback: `{ version: 1, scope: 'hero', generatedAt: '1970-01-01T00:00:00.000Z', mechanics: [], cards: {} }` (non-blocking), schema-validated per precondition H — `generatedAt` is a REQUIRED schema field, so the fallback carries the producer's `1970-01-01T00:00:00.000Z` sentinel; if these literals don't validate against the WP-269 `CardMechanicsIndexSchema`, STOP and align with the producer contract (do not invent a viewer-only shape)
- Filter composition: OR-within-mechanics, AND-across-filters
- Hidden mechanics: render only mechanics where `hidden !== true` (omitted/undefined `hidden` is visible)

---

## Acceptance Criteria

1. `apps/registry-viewer` static imports do NOT include `apps/dashboard`, repo-root coverage scripts, or `@legendary-arena/game-engine` — verified by grep (**AC-2**).
2. A valid `card-mechanics.json` loads and `CardMechanicsIndexSchema.safeParse()` succeeds; the parsed mechanics reach the UI (**AC-3**).
3. An invalid or unavailable `card-mechanics.json` leaves the card grid fully rendered, the mechanic ribbon empty/absent, and throws no unhandled exception (**AC-4**).
4. Selecting a mechanic shows only cards whose feed mapping (`cards[extId].mechanics`) includes it (**AC-5**).
5. With an active name query (or other filter), selecting a mechanic yields cards satisfying BOTH (**AC-6**).
6. The ribbon renders only mechanics where `hidden !== true`; only explicit `hidden: true` entries are suppressed and an omitted `hidden` renders (**AC-7**).
7. `cardMechanicsClient.ts` mirrors the `cardTypesClient.ts` singleton pattern (cached promise, `safeParse`, non-blocking fallback).
8. `pnpm --filter registry-viewer typecheck` exits 0; `test` exits 0 (new tests included, prior count preserved); `build` exits 0.
9. No producer-side file (`scripts/`, `packages/registry`, `data/metadata/`, CI) is modified.

---

## Verification Steps

```bash
# 1. No forbidden imports anywhere in the viewer's new/changed code (incl. App.vue)
if grep -RInE "from\s+['\"][^'\"]*(@legendary-arena/game-engine|apps/server|apps/dashboard|(^|/|\.\./)scripts/)" \
  apps/registry-viewer/src/lib/cardMechanicsClient.ts \
  apps/registry-viewer/src/components/MechanicFilter.vue \
  apps/registry-viewer/src/App.vue; then
  echo "FAIL: forbidden viewer import"; exit 1
else echo "OK: no forbidden viewer imports"; fi

# 2. Client uses the schema subpath + the locked metadata path
grep -F "@legendary-arena/registry/schema" apps/registry-viewer/src/lib/cardMechanicsClient.ts   # Expected: >=1 match
grep -F "card-mechanics.json" apps/registry-viewer/src/lib/cardMechanicsClient.ts                # Expected: >=1 match

# 3. Mechanic filtering never parses ability text
if grep -RIn "parseAbilityText" \
  apps/registry-viewer/src/components/MechanicFilter.vue \
  apps/registry-viewer/src/App.vue; then
  echo "FAIL: mechanic filter must not parse ability text"; exit 1
else echo "OK: no ability-text parsing in the mechanic filter surface"; fi

# 3b. Ribbon suppression uses explicit hidden!==true, not !hidden / hidden===false
grep -RInF "hidden !== true" apps/registry-viewer/src/components/MechanicFilter.vue apps/registry-viewer/src/App.vue
# Expected: >=1 match (the locked contract: only an explicit hidden:true suppresses a chip;
# an omitted/undefined hidden renders. `!mechanic.hidden` or `hidden === false` is WRONG.)

# 4. Typecheck / test / build
pnpm --filter registry-viewer typecheck   # Expected: exit 0
pnpm --filter registry-viewer test        # Expected: exit 0 (new tests pass)
pnpm --filter registry-viewer build       # Expected: exit 0

# 5. No producer-side files touched (binary gate)
if git diff --name-only | grep -E '^(scripts/|packages/registry/|data/metadata/|\.github/)'; then
  echo "FAIL: producer-side file modified"; exit 1
else echo "OK: no producer-side files"; fi

# 6. Working-tree scope is EXACTLY the 7 listed files — no eighth file
git diff --name-only | sort
# Expected: exactly the 4 viewer + 3 governance files (cardMechanicsClient.ts,
# cardMechanicsClient.test.ts, MechanicFilter.vue, App.vue, STATUS.md, WORK_INDEX.md,
# EC_INDEX.md). No new helper, no eighth file, no producer-side / game-engine /
# dashboard / server / scripts file.
```

---

## Definition of Done (Binary Gate — ALL must pass)

- [ ] All preconditions (A–H) passed before the edit
- [ ] All 9 Acceptance Criteria pass, including the mapped consumer-surface gates AC-2 through AC-7
- [ ] All 7 Verification Steps (1, 2, 3, 3b, 4, 5, 6) produce the expected output
- [ ] `cardMechanicsClient.ts` mirrors the `cardTypesClient` singleton + non-blocking fallback
- [ ] The locked empty fallback is defined once as a module-level constant and returned from every HTTP/schema/fetch failure path
- [ ] The mechanic-match predicate is a pure exported function in `cardMechanicsClient.ts`, covered by `cardMechanicsClient.test.ts` (no SFC harness, no new helper file)
- [ ] Mechanic filtering uses the per-card mapping only (no runtime ability parsing)
- [ ] Missing/invalid feed is non-fatal; grid renders
- [ ] Hidden mechanics excluded from the ribbon via `hidden !== true` (not `!hidden` / `hidden === false`)
- [ ] No `game-engine` / `apps/dashboard` / `apps/server` / `scripts/` import in the viewer
- [ ] No producer-side file modified; working-tree scope is exactly the 7 listed files
- [ ] `typecheck` + `test` + `build` exit 0
- [ ] `docs/ai/STATUS.md` Done entry names WP-270 + the filter surface
- [ ] `docs/ai/DECISIONS.md` NOT updated — consumes D-24046; no new decision
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix `EC-301:` for code, `SPEC:` for governance close

---

## Pre-Flight + Copilot Re-Gate (2026-06-20, post-tightening)

The original review verdicts predate the 2026-06-20 tightening (A–H precondition-count
fix, the decisive mechanic-predicate test path, the client-behavior test reword, the
empty-fallback single-constant lock, and the `hidden !== true` grep gate). Both gates
were re-run against the tightened WP-270 + EC-301 per `01.0a` Step 5's re-run rule.

**Pre-flight (`01.4`): READY TO EXECUTE.** The hard-dep (WP-269) is verified landed on
`main` — `CardMechanicsIndexSchema` exported from `@legendary-arena/registry/schema`,
the staged `data/metadata/card-mechanics.json` validates, and the producer join is
populated (134 mechanics / 309 cards). Running precondition H empirically (not asserting
it) **caught a contract defect the original carried**: the locked empty-fallback literal
omitted `generatedAt`, which the landed schema requires, so H — and therefore execution —
would have STOPped on the first run. The fallback was corrected to carry the producer's
`1970-01-01T00:00:00.000Z` sentinel and now validates; this is the empirical-independence
payoff of running the gate rather than reasoning it READY. Scope is locked at exactly 7 files; the
tightening **removed** the one open ambiguity the original carried — the conditional
"extract a helper / add an unlisted eighth file" branch — by grounding the predicate as
a pure exported function in the already-listed client (verified: the viewer has no
`App.vue`/`applyFilters` SFC harness; pure `.ts` helpers are the unit-test surface, per
`registry/shared.test.ts`). Architectural boundary holds (viewer imports only
`@legendary-arena/registry` subpaths + UI; grep-gated against game-engine / dashboard /
server / scripts). **Empirical Scaffold N/A** — this WP consumes a published feed and
adds a filter surface; it does not tighten validation on an existing input path with
pre-existing fixtures. **Mutation Boundary N/A** — no `G`/move mutation (viewer-only).

**Copilot (`01.7`): PASS.** No RISK/BLOCK across the lens. Separation of concerns (the
predicate is a pure read over the feed's per-card mapping; no ability-text parsing),
non-blocking degradation (single empty-fallback constant returned from every failure
path), contract fidelity (`hidden !== true` ribbon semantics grep-gated; OR-within /
AND-across composition structural via post-`applyQuery` application), scope/governance
(exactly 7 files, two-commit topology, no new DECISIONS — consumes D-24046), and
testing (client-behavior + predicate-correctness in `cardMechanicsClient.test.ts`, not a
re-test of the producer schema) are all explicitly covered. The tightening strengthened
the artifact and closed the unlisted-file loophole rather than introducing new risk.

## Lint Gate Self-Review (00.3 — 21 sections)

Run 2026-06-20; **re-run 2026-06-20 post-tightening** against this WP + EC-301. Result: **PASS** (all sections PASS or justified N/A).

- **§1 Structure** — PASS (all sections present; Out of Scope lists 6 exclusions).
- **§2 Non-Negotiable Constraints** — PASS (Engine-wide + Packet-specific + Session protocol + Locked values; full-file-contents required; references 00.6).
- **§3 Assumes** — PASS (preconditions A–H; A/B gate the WP-269 hard-dep, G/H gate the producer join + fallback shape, with exact expected output).
- **§4 Context** — PASS (cardTypesClient template, AbilityEffectFilter template, applyQuery/applyFilters, the WP-269 schema, viewer CLAUDE.md + import rules, 00.6). 00.2 N/A — mechanic slugs are coverage tokens, not 00.2 fields.
- **§5 Files Expected to Change** — PASS (exactly 7 files, marked new/modified + described; no conditional 8th — the mechanic predicate is co-located in the listed `cardMechanicsClient.ts` and tested in the listed `cardMechanicsClient.test.ts`).
- **§6 Naming** — PASS (`cardMechanicsClient`/`MechanicFilter` mirror `cardTypesClient`/`AbilityEffectFilter`; full words).
- **§7 Dependencies** — PASS (no new npm deps).
- **§8 Architectural Boundaries** — PASS (viewer layer; explicit grep gate forbids game-engine/dashboard/server/scripts imports — the core subject; schema consumed via the established subpath).
- **§9 Windows Compatibility** — PASS (`pnpm --filter` + `grep` via Bash tool, established convention).
- **§10 Env Vars** — N/A.
- **§11 Auth** — N/A.
- **§12 Test Quality** — PASS (`node:test`; no boardgame.io/testing; no network — the client test stubs fetch; non-blocking-fallback + filter-correctness are invariant-focused).
- **§13 Verification Commands** — PASS (all `pnpm`/`grep`; exact with expected output).
- **§14 Acceptance Criteria** — PASS (9 binary, observable; mapped to the consumer-surface gates AC-2 through AC-7).
- **§15 Definition of Done** — PASS (STATUS + WORK_INDEX + EC_INDEX + scope-boundary; DECISIONS explicitly NOT updated, justified).
- **§16 Code Style** — PASS (`for...of` filtering, no reduce-with-branching, `// why:` on fallback + mapping filter, no new import beyond the schema subpath).
- **§17 Vision Alignment** — PASS (N/A declared with §17.3 justification; the Registry Viewer §10a surface gains an internal filter affordance but no card-data semantics / identity / monetization change — see below).
- **§18 Prose-vs-Grep** — N/A (Verification-1/3 grep forbidden imports + `parseAbilityText`; the WP prose discusses them as forbidden, but the greps target the viewer source not this doc).
- **§19 Bridge-vs-HEAD** — commit-time discipline; STATUS entry at execution against live HEAD.
- **§20 Funding Surface Gate** — N/A declared with justification (see below).
- **§21 API Catalog** — N/A — consumes a static R2 JSON, no HTTP endpoint / `apps/server/src/**` function touched.

No ❌ FAIL triggers. Gate satisfied.

## Vision Alignment

**N/A for the trigger surfaces — internal Registry Viewer filter affordance.** Per §17.3, this adds a search/filter control to the Registry Viewer (Vision §10a) but changes no card-data semantics, no identity/fairness/replay/scoring/monetization/accessibility surface. It surfaces an existing derived taxonomy (the coverage mechanics) as a filter; the data is read-only and the card grid behavior is otherwise unchanged. No NG-1..7 proximity.

## Funding Surface Gate

**N/A — no funding surface touched.** No §20.1 trigger: no navigation/registry-viewer funding affordance, no profile/account funding attribution, no tournament-funding integration, no user-visible funding copy. A mechanic filter chip is not a funding surface. (Authority chain per §20 form: WP-097, D-9701, D-9801.)

## API Catalog Update

**N/A — no API surface touched.** Per §21.4: consumes a static R2 metadata JSON; no HTTP endpoint or `apps/server/src/**` library function added/modified. `docs/ai/REFERENCE/api-endpoints.md` unaffected.
