# EC-287 — Berserk via Composable Effect Primitives (Execution Checklist)

**Source:** docs/ai/work-packets/WP-256-berserk-effect-primitives.md
**Layer:** Game Engine / Contracts + Implementation (`packages/game-engine/src/{rules,hero,setup}/**`) + Lever-3 instruments (`scripts/**`, `docs/ai/coverage/**`).
**No `data/cards/**` change** (the 29 `[keyword:Berserk]` markers already exist; the parser translates them).
**Decisions:** D-24030 + D-24031 (reserved at draft; landed at execution). Implements the ratified **D-24029**.

Authoritative execution contract for WP-256. Compliance is binary.

---

## Before Starting

- [ ] On `main`, clean, ff-synced to `f295f6ae` (or later). `pnpm -r build` + `pnpm --filter @legendary-arena/game-engine test` exit 0; `pnpm sim:coverage --check` + `pnpm ledger:heroes:check` OK on the base.
- [ ] Read `heroEffects.execute.ts` (the `reveal` handler's `G.cardStats[topCardId]` read + the `cardStats === undefined` skip — the `card-printed-stat` precedent), `revealRule.ts` (the closed-drift-array + dual-grammar precedent), and `setup/heroAbility.setup.ts` Steps 2–4 (where the composition-marker step slots in) + `buildHeroAbilityHooks` (where `primitiveEffects` is assembled onto the hook).
- [ ] Record the sentinel replay `finalStateHash` — it MUST be unchanged at close (the harness uses `EMPTY_REGISTRY` → hero hooks `[]` → Berserk never fires in a fixture).
- [ ] Confirm `[keyword:Berserk]` lives on **hero** ability lines in `wpnx` (10) + `xmen` (19) only; villain Berserk + the `[keyword:Berserks]` plural are out of scope.

---

## Locked Values

- **WP:** WP-256. **EC:** EC-287. **Decisions:** D-24030 (primitive registry) + D-24031 (composition seam), reserved.
- **The Berserk composition (verbatim — the one seeded `HERO_COMPOSITION_MARKERS['berserk']`):**
  ```
  sequence[ move-card{from:{owner:current-player,zone:deck,position:top}, to:{owner:current-player,zone:discard}, bind:discardedCard},
            gain-resource{resource:attack, amount:card-printed-stat{card:{ref:discardedCard}, stat:attack}} ]
  ```
- **Closed node types (3, locked):** `sequence`, `move-card`, `gain-resource` → `EFFECT_NODE_TYPES`. **Value-expression types (1):** `card-printed-stat` → `VALUE_EXPRESSION_TYPES`. **Parameter unions:** `EFFECT_RESOURCE_KINDS = [attack, recruit]`, `EFFECT_ZONE_KINDS = [deck, discard]`, `EFFECT_CARD_POSITIONS = [top]`, `EFFECT_OWNER_KINDS = [current-player]`. `recruit`/`discard`-already-present and `recruit` stat are in scope **because the Recruit cousin must be data, not an engine edit** — omitting them would force a union edit for the cousin.
- **Context lifetime (load-bearing — D-24029 §9):** `interpretHeroPrimitiveEffect` creates a fresh `EffectExecutionContext` (a local `Map<string, CardExtId>`) **per top-level node**; `sequence` threads the SAME context to its steps; the context is **NEVER** assigned onto `G` or `ctx`. `bind` writes the moved card id; `ref` reads it. A persisted binding breaks the persistence boundary + risks replay double-application.
- **`move-card` semantics (locked):** resolve `from` endpoint → `playerZones[zone]`; `position:'top'` = index 0; move that id via `moveCardFromZone(from, to, topId)`; set `context.set(bind, topId)` when `bind` present AND the move found a card. **Empty source zone → no move, no bind, NO reshuffle** (mirrors the `reveal` D-21502 empty-deck no-op). `to` endpoint appends (position irrelevant).
- **`card-printed-stat` (locked):** resolve `card.ref` from the context → card id; return `G.cardStats[id]?.[stat] ?? 0`. **Missing ref OR missing `cardStats` entry → 0** (deterministic; the S.H.I.E.L.D.-starter D-21502 limitation, accepted), warn to `G.messages`, never throw.
- **`gain-resource` (locked):** evaluate `amount` (a value expression) → number; `attack` → `addResources(G.turnEconomy, amount, 0)`; `recruit` → `addResources(G.turnEconomy, 0, amount)`. **Undefined `G.turnEconomy` → warn + skip** (mirrors the reveal attack guard).
- **Parser seam (locked):** in the `[keyword:X]` handling, when `normalizedKeyword ∈ HERO_COMPOSITION_MARKERS`, push a **deep copy** of that AST (`structuredClone` or a fresh literal — NEVER the shared registry object) onto a `primitiveEffects` accumulator — do **NOT** push to `hook.keywords` (`berserk` is not a `HeroKeyword`; `isValidHeroKeyword('berserk')` stays false). The copy is mandatory: a hook that aliased the module-level registry AST would let one match mutate the shared constant (D-13502 freshly-constructed-hook discipline). Assemble `hook.primitiveEffects` in `buildHeroAbilityHooks` only when non-empty (mirror the `hook.effects`/`hook.conditions` conditional-construction guards — `exactOptionalPropertyTypes`: assign the field only when present, never `: x ?? undefined`).
- **Executor seam (locked):** iterate `hook.primitiveEffects` **inside** the `evaluateAllConditions(...)`-passed block (same gate as legacy `effects`), **AFTER** the legacy `effects` loop, in array order, calling `interpretHeroPrimitiveEffect(G, ctx, playerID, node)` per node. The legacy-then-primitive order is **locked for determinism** — a line carrying both a legacy effect (e.g. a `[icon:recruit]`) and the Berserk composition applies them in a fixed order (RISK-2; `// why:` required). `ctx` is threaded for signature parity but unused by Berserk's primitives (`_ctx`).
- **Drift authority (locked):** `EFFECT_NODE_HANDLERS` keys deep-equal `EFFECT_NODE_TYPES`; `VALUE_EXPRESSION_EVALUATORS` keys deep-equal `VALUE_EXPRESSION_TYPES` (bidirectional, both directions asserted — the WP-251 `HANDLED_KEYWORDS` pattern). Each parameter array asserts array/union parity. **`HERO_KEYWORDS` stays 17 — do NOT edit its drift test.**
- **Runtime dispatch guard (locked):** never call `EFFECT_NODE_HANDLERS[node.type](...)` / `VALUE_EXPRESSION_EVALUATORS[amount.type](...)` without first confirming the key resolves (mirror `executeSingleEffect`'s `if (handler === undefined) return;`). Closed TypeScript unions are compile-time only; the AST is data and a regenerated/loaded artifact may be malformed. Unknown node → warn + skip; unknown value expression → warn + return `0`; **never throw**.
- **Best-effort warning (locked):** warning emission to `G.messages` is non-throwing — a small `if (Array.isArray(G.messages)) G.messages.push(...)` guard so a minimal test `G` without `messages` still skips/defaults deterministically rather than throwing while warning.
- **Context isolation (locked):** the context is not merely absent from `G`; it is also unavailable across separate top-level `interpretHeroPrimitiveEffect` calls. A later top-level `ref` to an earlier `bind` returns `0` and warns. Tested explicitly (not only the not-in-`G` assertion).
- **Registry clone (locked):** parser tests prove the parsed hook owns a **deep copy** of the Berserk AST — mutating `hook.primitiveEffects[0]` in the test does NOT mutate `HERO_COMPOSITION_MARKERS['berserk']`.
- **Coverage + ledger (locked):** import `HERO_COMPOSITION_MARKER_NAMES` from the engine `dist` into both scripts. Coverage: `classifyHook` → `EXECUTABLE` when `primitiveEffects?.length > 0`; `KNOWN_MARKUP_KEYWORDS = new Set([...HERO_KEYWORDS, ...HERO_COMPOSITION_MARKER_NAMES])`. Ledger: `statusForMechanic` → `executable` when the name is a composition marker; the handler column for those points at `hero/effectPrimitive.interpret.ts` (not `heroEffects.execute.ts#<name>`). Provenance: `berserk → {wp:"WP-256", decision:"D-24031"}`.
- **Regenerate-then-commit:** run `pnpm sim:coverage --update-baseline` and `pnpm ledger:heroes` AFTER the code change + `pnpm -r build`, and commit the regenerated `hero-effect-coverage.baseline.json` + `hero-mechanic-ledger.{json,csv}` in the SAME commit so `--check` (CI) compares against the new baseline.
- **Commit message (execution):** `EC-287: berserk via composable effect primitives — bootstrap primitive registry (D-24030, D-24031)`. (`EC-###:` prefix — code staged. The drafting commit is a separate `SPEC:`.)

---

## Guardrails

- **The `bind`/`ref` context is NEVER written to `G`/`ctx`** — it is a local `Map` per top-level effect. (Highest-risk invariant — assert `JSON.stringify(G)` carries no binding key in a test.)
- `HeroKeyword` / `HERO_KEYWORDS` — **frozen at 17**; no `berserk` member; its drift test is untouched. `MVP_KEYWORDS` / `HANDLED_KEYWORDS` — untouched.
- No mechanic-shaped macro primitive (`discard-top-gain-from-stat` would FAIL D-24029 §6) — only the orthogonal `sequence`/`move-card`/`gain-resource`/`card-printed-stat`/`bind`.
- `data/cards/**` — **zero diff** (the markers exist; the parser translates).
- The AST is plain data; the ImplementationMaps + `HERO_COMPOSITION_MARKERS` are module-level consts outside `G` — `G` stays JSON-serializable.
- No `.reduce()`; explicit `for...of`. No `boardgame.io`/registry import in the interpreter (`zoneOps` + `addResources` only). `ctx.random.*` only if randomness is ever needed (Berserk needs none).
- Unknown node type / value-expression type / missing `ref` / missing `cardStats` → warn to `G.messages` + safe default (skip / 0), **never throw** — and the dispatch is **guarded before indexing** the ImplementationMap (a malformed `node.type` must not crash via `MAP[type](...)` on `undefined`). Warning emission is best-effort: a missing/non-array `G.messages` must not throw while warning.
- Empty deck → `move-card` no-op (no reshuffle); the unbound `ref` → `+0` gain. Do NOT add a reshuffle (it would need `ctx.random` + an interaction model out of scope).
- **No primitive-level condition system / X-Force logic / compound Berserk parser.** Existing hook conditions MAY gate Berserk (reuse of the existing seam — `primitiveEffects` run inside the conditions gate); that is allowed and intended, NOT a new variant. Adding a `conditional`/`if-team` primitive or a second composition row IS out of scope.
- **No barrel change** (`packages/game-engine/src/index.ts`) — scripts import from `dist/` module paths; `apps/**` does not import `EffectNode`. **No `notableEvents` / `apps/arena-client/**` / sentinel `*.replay.json` change** — the AST is engine-internal, not projected to `UIState`. If `tsc`/`vue-tsc` wants one touched, the AST leaked — re-confine; never `as any`, never widen the allowlist.
- **Scope to ONLY what Berserk + its Recruit cousin need** — do not seed a second composition marker, a general AST-from-markup parser, or any primitive beyond the five. The cousin is proven by a test, not a card.

---

## Required `// why:` Comments

- At `interpretHeroPrimitiveEffect` (context creation) + the `EffectExecutionContext` type: the context is per-top-level, lexically scoped to its `sequence`, NEVER written to `G` — transient, re-derived on replay (D-24029 §9 / D-24030).
- At `EFFECT_NODE_TYPES` / `VALUE_EXPRESSION_TYPES` / each parameter array: canonical drift arrays — adding a member needs array + union + DECISIONS (code-style §Drift Detection / D-24030).
- At `move-card`'s empty-source no-op: mirrors the `reveal` D-21502 empty-deck posture; no reshuffle (would need `ctx.random`).
- At `card-printed-stat`'s missing-`cardStats` → 0: the S.H.I.E.L.D.-starter D-21502 limitation, deterministic, accepted (the `reveal` handler skips the same case).
- At the parser composition-marker step: `berserk` attaches to `primitiveEffects`, never `hook.keywords` — the open mechanic space, not a `HeroKeyword` (D-24031); a cousin is a registry row, not an engine edit; the attached AST is a deep copy (no aliasing the shared registry const).
- At the executor `primitiveEffects` loop: legacy `effects` run first, then `primitiveEffects` in array order, inside the conditions gate — order locked for determinism (RISK-2).
- At `HERO_COMPOSITION_MARKERS` / `HERO_COMPOSITION_MARKER_NAMES`: the open mechanic-space data surface the coverage probe + ledger read (D-24031).

---

## Files to Produce

- `packages/game-engine/src/rules/effectPrimitive.types.ts` — **new (contract)** — AST/value unions + the 6 closed arrays + `ZoneEndpoint`/`CardReference`/`EffectExecutionContext`.
- `packages/game-engine/src/hero/effectPrimitive.interpret.ts` — **new** — `EFFECT_NODE_HANDLERS` + `VALUE_EXPRESSION_EVALUATORS` + per-top-level context + `interpretHeroPrimitiveEffect`.
- `packages/game-engine/src/rules/heroCompositions.ts` — **new (data)** — `HERO_COMPOSITION_MARKERS` (seeded `berserk`) + `HERO_COMPOSITION_MARKER_NAMES`.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `primitiveEffects?: EffectNode[]` on `HeroAbilityHook`.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — composition-marker step → `primitiveEffects`; assembled in `buildHeroAbilityHooks`.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — interpret `hook.primitiveEffects` inside the conditions-passed block.
- `packages/game-engine/src/rules/effectPrimitive.test.ts` — **new** — drift + interpreter behavior + Recruit-cousin-as-data + context-not-in-`G` + empty-deck + missing-stats + unknown-node warn-not-throw.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — `[keyword:Berserk]` → `primitiveEffects`; `hook.keywords` excludes `berserk`; 17-entry drift untouched.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — `executeHeroEffects` primitive path fires + is condition-gated.
- `scripts/hero-effect-coverage.mjs` — **modified** — `primitiveEffects` → EXECUTABLE; known-markup ∪ composition names.
- `scripts/hero-mechanic-ledger.mjs` — **modified** — composition → executable + interpreter handler column.
- `scripts/coverage/mechanic-provenance.json` — **modified (data)** — `berserk` row.
- `scripts/coverage/hero-effect-coverage.baseline.json` — **regenerated**.
- `docs/ai/coverage/hero-mechanic-ledger.json` + `.csv` — **regenerated**.
- (NO `index.ts` / `notableEvents` / arena-client / replay-hash files.)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24030 + D-24031), `WORK_INDEX.md` (WP-256 ✅), `EC_INDEX.md` (EC-287 Done), `05-ROADMAP-MINDMAP.md`.

---

## After Completing

- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail.
- [ ] Interpreter tests pass: Berserk discards deck-top + `+Attack`=printed attack; **Recruit cousin AST → `+Recruit` with no engine edit**; empty-deck no-op + `+0`; missing-`cardStats` → `+0`; unknown node/value warns-not-throws; **`G` carries no binding key after interpretation**.
- [ ] Drift: `EFFECT_NODE_TYPES`=3, `VALUE_EXPRESSION_TYPES`=1, parameter arrays match unions; both ImplementationMaps deep-equal their arrays; `HERO_KEYWORDS`=17 unchanged.
- [ ] Parser: `[keyword:Berserk]` → `hook.primitiveEffects` (Berserk AST); `hook.keywords` excludes `berserk`. Executor: primitive path fires post-conditions; a failed condition skips it.
- [ ] Unknown node/value dispatch is runtime-guarded and tested; a malformed `type` warns-not-throws (would crash a direct map index).
- [ ] Binding isolation is tested across separate top-level interpretations (a later `ref` to an earlier `bind` → `0` + warn).
- [ ] Parser deep-copy is tested; mutating a parsed hook's primitive AST does NOT mutate `HERO_COMPOSITION_MARKERS['berserk']`.
- [ ] `pnpm sim:coverage --update-baseline` then `--check` OK. **Inspect the baseline `git diff` (RISK-1 — `--check` against a regenerated baseline is otherwise trivially green):** the ONLY changes are `wpnx`/`xmen` hero `noEffect` decreasing, `berserk` removed from `unsupportedMechanics`, and corpus `executable` rising — **no other set's numbers move**, `berserks` (plural) stays. `pnpm ledger:heroes` then `:check` OK (`berserk` rows executable + `WP-256`/`D-24031` provenance + interpreter handler column).
- [ ] `git diff --name-only -- data/cards/` → empty. `git diff --name-only -- packages/game-engine/src/index.ts apps/arena-client/ packages/game-engine/src/events/ packages/game-engine/src/test/fixtures/` → empty; sentinel `finalStateHash` unchanged.
- [ ] `git diff --name-only` → only Files to Produce + governance.
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-256 node present).

---

## Common Failure Smells

- `JSON.stringify(G)` carries `discardedCard` (or any binding) → the context was written to `G`; it MUST be a local `Map`. (D-24029 §9 — the load-bearing invariant.)
- `HERO_KEYWORDS` gained `berserk` / its drift test changed → wrong model; `berserk` is a composition marker, NOT a keyword. Revert; attach to `primitiveEffects`.
- A `berserk`-specific `if` in the interpreter → the interpreter must be mechanic-agnostic; Berserk lives only in the `HERO_COMPOSITION_MARKERS` data row.
- The Recruit cousin needed a union/keyword/handler edit → `recruit` was missing from `EFFECT_RESOURCE_KINDS`/stat; it must be seeded so the cousin is pure data.
- `move-card` reshuffles on empty deck → out of scope (would need `ctx.random`); it must no-op.
- `card-printed-stat` throws on a starter with no `cardStats` → must return 0 (D-21502).
- `data/cards/**` in the diff → re-marking crept in; the parser translates existing markers. Revert.
- `index.ts` / `notableEvents` / `apps/arena-client/**` in the diff → the AST leaked out of the engine; re-confine.
- `sim:coverage --check` FAILs with a set's `noEffect` rising → `classifyHook` didn't count `primitiveEffects` as EXECUTABLE, or the baseline wasn't regenerated.
- `berserk` still in `unsupportedMechanics` → `KNOWN_MARKUP_KEYWORDS` didn't union `HERO_COMPOSITION_MARKER_NAMES`.
- A second composition marker, a primitive-level condition system, or a general markup-AST parser appeared → premature abstraction (D-24029 §10); scope is `berserk` only + the cousin test.
- The WP claims conditional Berserk is out of scope, but existing hook conditions gate primitive effects naturally → wording drift; that gating is ALLOWED (reuse of the existing hook seam), forbidden only as a NEW primitive-level condition system.
- An unknown node/value crashes because the code indexed an ImplementationMap directly → the runtime guard is missing; closed TypeScript unions do not protect malformed data.
- A `ref` in one top-level primitive effect can read a `bind` from a previous top-level effect → context leaked across evaluations (must be per-call).
- A hook mutated the shared `HERO_COMPOSITION_MARKERS['berserk']` const (a later interpretation saw stale/mutated AST) → the parser attached the registry object instead of a deep copy.
- The baseline `--check` is green but the baseline diff moved a set OTHER than `wpnx`/`xmen` → `classifyHook` or `KNOWN_MARKUP_KEYWORDS` changed more than intended (RISK-1); inspect, do not rubber-stamp the regen.
