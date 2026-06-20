# EC-298 — Empowered via a Class-Count Value Primitive (Execution Checklist)

**Source:** docs/ai/work-packets/WP-267-empowered-class-count-primitive.md
**Layer:** Game Engine / Contracts + Implementation (`packages/game-engine/src/{rules,hero,setup}/**`) + Lever-3 instruments (`scripts/coverage/**`, `docs/ai/coverage/**`).
**No `data/cards/**` change** (the `[keyword:Empowered] by [hc:X]` markers already exist; the parser translates them).
**Decision:** D-24044 (reserved at draft; landed at execution). Extends D-24029/D-24030/D-24031.

Authoritative execution contract for WP-267. Compliance is binary.

---

## Before Starting
- [ ] On `main`, clean, ff-synced to `58a5f017` (or later). `pnpm -r build` + `pnpm --filter @legendary-arena/game-engine test` exit 0; `pnpm sim:coverage --check`, `pnpm ledger:heroes:check`, `pnpm sim:runtime-observed:check` OK on the base.
- [ ] Read WP-256's shipped surface: `rules/effectPrimitive.types.ts` (the value-expression union + the closed parameter-array drift pattern), `hero/effectPrimitive.interpret.ts` (`VALUE_EXPRESSION_EVALUATORS` + the `evaluateCardPrintedStat` precedent + the runtime dispatch guard), `rules/heroCompositions.ts` (`HERO_COMPOSITION_MARKERS` + `HERO_COMPOSITION_MARKER_NAMES`), and `setup/heroAbility.setup.ts` (Step 1a `[hc:X]` → `heroClassConditions`; the `[keyword:X]` loop's composition-marker branch + `unresolvedMarkers` fallback).
- [ ] Read `hero/heroConditions.evaluate.ts` `heroClassMatch` — the `G.cardTraits[id].heroClass` read pattern the count mirrors (note: Empowered does NOT self-exclude).
- [ ] Confirm `G.hq` shape: `HqZone = [HqSlot×5]`, `HqSlot = CardExtId | null` (`board/city.types.ts`).
- [ ] Record the sentinel replay `finalStateHash` — it MUST be unchanged at close (the harness uses `EMPTY_REGISTRY` → hero hooks `[]` → Empowered never fires in a fixture).
- [ ] Note the committed `runtime-observed-hollows.json` BEFORE values (summary.distinctMechanics, summary.totalObservations, byMechanic.empowered) — the regen delta is a measured output, not a pre-locked number.

---

## Locked Values
- **WP:** WP-267. **EC:** EC-298. **Decision:** D-24044, reserved.
- **The Empowered composition (built per parsed color — the `buildEmpoweredComposition(heroClass)` output):**
  ```
  gain-resource{ resource:attack, amount: count-cards-by-class-in-zone{ heroClass:<normalizedHeroClass>, zone:hq } }
  ```
- **New value-expression type (1):** `count-cards-by-class-in-zone` → appended to `VALUE_EXPRESSION_TYPES` (now `['card-printed-stat','count-cards-by-class-in-zone']`, length 2). **New parameter union:** `EffectCountZoneKind = ['hq']` → `EFFECT_COUNT_ZONE_KINDS`. **Unchanged:** `EFFECT_NODE_TYPES` (3), `EFFECT_ZONE_KINDS` (`[deck,discard]`), `EFFECT_RESOURCE_KINDS`, `EFFECT_CARD_POSITIONS`, `EFFECT_OWNER_KINDS`, `HERO_KEYWORDS` (17).
- **`count-cards-by-class-in-zone` semantics (locked):** `zone` is closed to `'hq'` → read `G.hq` (explicit branch, no dynamic access). For each slot: skip `null`; read `G.cardTraits[slot]?.heroClass`; count `=== expression.heroClass`. **Missing `G.hq` (non-array) OR missing `G.cardTraits` → return 0**, warn to `G.messages`, never throw. **No self-exclusion** (unlike `heroClassMatch` — Empowered counts ALL HQ cards of the class). Iteration is index-ordered (deterministic).
- **Builder (locked):** `buildEmpoweredComposition(normalizedHeroClass)` returns a freshly-constructed `gain-resource` node each call (no shared mutable const aliased into a hook — mirrors WP-256's `structuredClone` discipline; a builder returns a new object, so no clone needed, but it MUST NOT return a module-level singleton).
- **Parser seam (locked):** for a `[keyword:X]` token whose normalized name ∈ `PARAMETERIZED_COMPOSITION_MARKER_NAMES` (`empowered`): resolve ONLY the unconditional core form. The text **immediately after the marker** must match `^\s*by\s*\[hc:([a-z0-9-]+)\]`; do NOT broad-scan later text. Compute `normalizedHeroClass = normalizeTraitSlug(color)`. **On match** → push `buildEmpoweredComposition(normalizedHeroClass)` to `primitiveEffects`, and remove ONE `{ type:'heroClassMatch', value: normalizedHeroClass }` from `heroClassConditions` per consumed param. This suppression is only for the consumed Empowered parameter; it prevents `[hc:COLOR]` from wrongly gating the hook. **On no match or deferred form** → push the token to `unresolvedMarkers` so the Honest-Partial Invariant holds. NEVER push `empowered` to `hook.keywords` (`isValidHeroKeyword('empowered')` stays false). **Conditional-prefix Empowered forms are deferred for WP-267 and MUST NOT be accidentally implemented by treating the prefix as a normal gate** — operationally, if consuming the parameter leaves any residual gating class/team condition derived from that line (an `[hc:X]:` / `[team:X]:` prefix), defer (record unresolved, emit nothing).
- **`HERO_COMPOSITION_MARKER_NAMES` (locked):** = the **de-duplicated** union of `Object.keys(HERO_COMPOSITION_MARKERS)` and `PARAMETERIZED_COMPOSITION_MARKER_NAMES`, preferably via a `Set`. This is what the coverage probe + ledger import from `dist` to know the core-form `empowered` marker is composition-supported. Fixed-color Empowered rows leave `unsupportedMechanics` WITHOUT a coverage-script edit because the WP-256 machinery already counts `primitiveEffects.length > 0` as EXECUTABLE. Deferred Empowered variants must still surface through the unresolved-marker / hollow path.
- **Executor (locked):** NO change to `heroEffects.execute.ts` — the WP-256 `hook.primitiveEffects` loop (inside the conditions-passed gate, after legacy `effects`) already runs the Empowered composition. Empowered is condition-gated by any genuine pre-existing hook conditions, which is correct.
- **Provenance (locked):** `mechanic-provenance.json` gains `"empowered": { "wp": "WP-267", "decision": "D-24044" }`. NO coverage-script edit.
- **Regenerate-then-commit:** run `pnpm sim:coverage --update-baseline`, `pnpm ledger:heroes`, `pnpm sim:runtime-observed` AFTER the code change + `pnpm -r build`, and commit the regenerated `hero-effect-coverage.baseline.json` + `hero-mechanic-ledger.{json,csv}` + `runtime-observed-hollows.json` in the SAME commit so `--check` (CI) compares against the new baseline.
- **Commit message (execution):** `EC-298: empowered via a class-count value primitive (D-24044)`. (`EC-###:` prefix — code staged. The drafting commit is a separate `SPEC:`.)

---

## Guardrails
- **Honest-Partial Invariant (HIGHEST RISK):** implementing the core MUST NOT silence the deferred variants. A `[keyword:Empowered]` with no anchored `by [hc:COLOR]` tail (color-of-choice, etc.) and a `[keyword:Double/Triple Empowered]` token MUST still reach `unresolvedMarkers` → `parse-unrecognized` runtime hollow. Test it explicitly. Do NOT make `empowered` unconditionally "resolved."
- **No broad parser capture:** the core Empowered parameter must be adjacent to the marker tail. Use an anchored tail match equivalent to `^\s*by\s*\[hc:([a-z0-9-]+)\]` against the text immediately after the `[keyword:Empowered]` token. Do not scan across sentence boundaries or later hook text to find a color.
- **Conditional-prefix Empowered remains deferred:** a hook shaped like `[hc:X]: ... [keyword:Empowered] by [hc:Y]` MUST NOT become executable in this WP merely because `[keyword:Empowered] by [hc:Y]` is present. The unconditional core form is the only implementation target; if consuming the parameter leaves a residual gating condition, defer.
- **`EffectCountZoneKind` is its own union** — do NOT add `hq` to `EFFECT_ZONE_KINDS` (that union is the per-player move-card endpoint set; the interpreter's `getZoneArray` resolves `playerZones`, not `G.hq`). The count reads `G.hq` directly.
- **No node-type growth** — `EFFECT_NODE_TYPES` stays 3. Empowered reuses `gain-resource`; only a VALUE expression is added.
- **No self-exclusion in the count** — `heroClassMatch` excludes the triggering card; Empowered counts every HQ card of the class. Do not copy the self-exclusion branch.
- **`data/cards/**` — zero diff.** The markers exist; the parser translates.
- **No coverage-SCRIPT edit** — `scripts/coverage/hero-effect-coverage.mjs` / `scripts/coverage/hero-mechanic-ledger.mjs` already recognize composition markers (WP-256). If they need editing, the `HERO_COMPOSITION_MARKER_NAMES` union (Locked Values) was done wrong.
- **No `boardgame.io`/registry import in the interpreter**; reads `G.hq`/`G.cardTraits` + `addResources` only. No `.reduce()`; explicit `for...of`. No `ctx.random.*` (Empowered is deterministic).
- **Unknown value-expression type / missing `G.hq` / missing `cardTraits` → warn + return 0, never throw**; dispatch guarded BEFORE indexing `VALUE_EXPRESSION_EVALUATORS` (the WP-256 guard). Warning emission best-effort (`if (Array.isArray(G.messages))`).
- **No barrel / `notableEvents` / `apps/arena-client` / tracked `apps/dashboard` change.** The value-expression type is engine-internal. If `tsc`/`vue-tsc` wants one touched, the AST leaked — re-confine; never `as any`.
- **Scope to ONLY Empowered's unconditional core** — no player-choice/multiplier/conditional-gate primitive, no second parameterized marker, no general markup-AST parser (D-24029 §10).

---

## Required `// why:` Comments
- At `count-cards-by-class-in-zone` evaluator: reads the SHARED `G.hq` zone (not a per-player zone) + `G.cardTraits[id].heroClass` (mirrors the WP-179 `heroClassMatch` read); no self-exclusion (Empowered counts all HQ cards of the class); missing HQ/cardTraits → 0 (deterministic, never throws).
- At `VALUE_EXPRESSION_TYPES` / `EFFECT_COUNT_ZONE_KINDS`: canonical drift arrays — adding a member needs array + union + DECISIONS (code-style §Drift Detection / D-24030).
- At `EffectCountZoneKind`: a SEPARATE shared/board-zone union, distinct from the per-player move-card `EFFECT_ZONE_KINDS` (D-24044).
- At the parser parameterized-marker branch: `empowered` resolves to a built composition ONLY when an anchored `by [hc:COLOR]` tail is present AND no residual condition gates it; otherwise it stays an unresolved marker so the deferred variants keep their hollow signal (the Honest-Partial Invariant); the consumed `[hc:COLOR]` is suppressed from `heroClassConditions` (using the same normalized value) so the count parameter does not gate the hook.
- At `buildEmpoweredComposition` / `PARAMETERIZED_COMPOSITION_MARKER_NAMES`: parameterized composition (a builder + a parse step), distinct from the static `HERO_COMPOSITION_MARKERS` rows (D-24044); the deduped names union feeds the coverage probe + ledger.

---

## Files to Produce
- `packages/game-engine/src/rules/effectPrimitive.types.ts` — **modified (contract)** — `count-cards-by-class-in-zone` type + interface; `EffectCountZoneKind` + `EFFECT_COUNT_ZONE_KINDS`.
- `packages/game-engine/src/hero/effectPrimitive.interpret.ts` — **modified** — `evaluateCountCardsByClassInZone` + registration.
- `packages/game-engine/src/rules/heroCompositions.ts` — **modified (data)** — `buildEmpoweredComposition` + `PARAMETERIZED_COMPOSITION_MARKER_NAMES` + extended (deduped) `HERO_COMPOSITION_MARKER_NAMES`.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — parameterized-marker parse (anchored tail) + condition suppression + Honest-Partial unresolved fallback.
- `packages/game-engine/src/rules/effectPrimitive.test.ts` — **modified** — drift (2 value-expr types; `EFFECT_COUNT_ZONE_KINDS`) + count-evaluator + Empowered-composition behavior.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — the §Required parser test cases below; `HERO_KEYWORDS` 17.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — Empowered integration (HQ count → `+Attack`); test-only.
- `scripts/coverage/mechanic-provenance.json` — **modified (data)** — `empowered` row.
- `scripts/coverage/hero-effect-coverage.baseline.json` — **regenerated**.
- `docs/ai/coverage/hero-mechanic-ledger.json` + `.csv` — **regenerated**.
- `docs/ai/coverage/runtime-observed-hollows.json` — **regenerated** (competent sweep; empowered core-form hits clear).
- (NO coverage-script / `index.ts` / `notableEvents` / arena-client / dashboard-source / replay-hash files.)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24044), `WORK_INDEX.md` (WP-267 ✅), `EC_INDEX.md` (EC-298 Done), `05-ROADMAP-MINDMAP.md`.

**Explicit non-change:** `packages/game-engine/src/hero/heroEffects.execute.ts` MUST NOT change. The existing WP-256 `primitiveEffects` loop is the executor path; this WP only adds a value-expression evaluator and parser/builder support. `heroEffects.execute.test.ts` is integration coverage of that existing path, not a code edit to the executor.

---

## Required parser test cases (`rules/heroAbility.setup.test.ts`)
- `[keyword:Empowered] by [hc:strength]` resolves to the expected primitive effect and suppresses exactly one `heroClassMatch(strength)`.
- `[keyword:Empowered]. Then by [hc:strength] ...` does NOT resolve Empowered (no broad forward scan); `empowered` → `unresolvedMarkers`.
- `[hc:strength]: You get [keyword:Empowered] by [hc:tech]` remains **unresolved** for WP-267 (conditional-prefix deferred); no composition emitted.
- `[keyword:Double Empowered] by [hc:strength]` remains **unresolved**; no composition emitted.
- If duplicate class markers exist, only the consumed Empowered parameter condition is suppressed; unrelated/genuine conditions remain.

---

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail.
- [ ] Drift: `VALUE_EXPRESSION_TYPES` = 2, `EFFECT_COUNT_ZONE_KINDS` = `['hq']`, both match unions; `VALUE_EXPRESSION_EVALUATORS` keys deep-equal `VALUE_EXPRESSION_TYPES`; `EFFECT_NODE_TYPES`/`EFFECT_ZONE_KINDS`/`HERO_KEYWORDS` unchanged.
- [ ] Evaluator: counts HQ cards of a class (no self-exclusion); `null` slots skipped; missing `G.hq`/`G.cardTraits` → 0; the Empowered composition grants `+Attack` = count.
- [ ] Parser: `[keyword:Empowered] by [hc:strength]` → `primitiveEffects` (built composition); `[hc:strength]` NOT a `heroClassMatch` condition; `empowered` ∉ `keywords`. **Deferred forms (anchored-miss, conditional-prefix, Double/Triple) → `unresolvedMarkers`** (Honest-Partial tests pass).
- [ ] `pnpm sim:coverage --update-baseline` then `--check` OK. **Inspect the baseline `git diff`:** the fixed-color core-form Empowered rows leave `unsupportedMechanics` / `noEffect`; deferred-variant cards stay `noEffect`; no unrelated set moves.
- [ ] `pnpm ledger:heroes` then `:check` OK (core `empowered` rows executable + `effectPrimitive.interpret.ts` handler + `WP-267`/`D-24044` provenance).
- [ ] `pnpm sim:runtime-observed` twice → byte-identical; `pnpm sim:runtime-observed:check` OK; `hollowEffectsDropped` = 0; record the measured empowered obs-count delta (per §Close Notes).
- [ ] `git diff --name-only -- data/cards/` → empty. `git diff --name-only -- packages/game-engine/src/index.ts apps/arena-client/ apps/dashboard/src/ scripts/coverage/hero-effect-coverage.mjs scripts/coverage/hero-mechanic-ledger.mjs packages/game-engine/src/hero/heroEffects.execute.ts` → empty; sentinel `finalStateHash` unchanged.
- [ ] `git diff --name-only` → only Files to Produce + governance (the gitignored `apps/dashboard/src/data/*.json` copies absent).
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-267 node present).

---

## Close Notes Required in PR / Commit Body
Record the following measured outputs:
- Base `runtime-observed-hollows.json`: `summary.distinctMechanics`, `summary.totalObservations`, `byMechanic.empowered`.
- Final `runtime-observed-hollows.json` after two byte-identical runs: `summary.distinctMechanics`, `summary.totalObservations`, `byMechanic.empowered`.
- Measured empowered observation delta.
- Confirmation that `hollowEffectsDropped` remains `0`.
- Confirmation that `data/cards/**` is byte-unchanged.
- Confirmation that `heroEffects.execute.ts`, the coverage scripts, barrel exports, arena client, and tracked dashboard source are unchanged.

---

## Common Failure Smells
- A deferred-variant Empowered card stopped surfacing as a runtime hollow → the Honest-Partial Invariant was violated; `empowered` was made unconditionally "resolved." Resolve ONLY when an anchored `by [hc:COLOR]` matched AND no residual gate remains; else `unresolvedMarkers`.
- A conditional-prefix Empowered (`[hc:X]: ...Empowered by [hc:Y]`) became executable → the prefix was left as a normal gate; conditional-prefix Empowered is deferred for WP-267.
- A later-sentence `[hc:...]` got bound to Empowered → the match was a broad forward scan, not an anchored marker-tail match.
- The suppression left a false `heroClassMatch` behind → suppression used the raw color, not `normalizeTraitSlug(color)` (the same value passed to the builder).
- `EFFECT_ZONE_KINDS` gained `hq` → wrong union; that is the per-player move-card endpoint set. `hq` belongs to `EffectCountZoneKind` (shared zone, read from `G.hq`).
- `EFFECT_NODE_TYPES` changed → wrong model; Empowered adds a VALUE expression, not a node type.
- The count excluded a card (self-exclusion) → copied from `heroClassMatch`; Empowered counts every HQ card of the class.
- A coverage SCRIPT (`hero-effect-coverage.mjs` / `hero-mechanic-ledger.mjs`) or `heroEffects.execute.ts` is in the diff → no edit is needed (the WP-256 machinery + `primitiveEffects` loop already handle recognition/execution); a `HERO_COMPOSITION_MARKER_NAMES` union mistake or a stray executor edit crept in.
- `data/cards/**` in the diff → re-marking crept in; revert.
- `index.ts` / `apps/dashboard/src/` (tracked) / `apps/arena-client/**` in the diff → the value-expression type leaked out of the engine; re-confine.
- `sim:runtime-observed` not byte-identical across runs → a non-deterministic source crept into the count (unordered iteration); `G.hq` iteration is index-ordered — keep it so.
- An `empowered`-specific `if` in the interpreter → the interpreter stays mechanic-agnostic; Empowered lives in the builder + parse step, the interpreter only knows `count-cards-by-class-in-zone`.
