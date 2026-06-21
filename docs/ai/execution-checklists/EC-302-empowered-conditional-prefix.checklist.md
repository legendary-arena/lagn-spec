# EC-302 — Empowered: Conditional-Prefix Class-Gated Core Form (Execution Checklist)

**Source:** docs/ai/work-packets/WP-272-empowered-conditional-prefix.md
**Layer:** Game Engine — parser only (`packages/game-engine/src/setup/heroAbility.setup.ts` + tests) + Lever-3 instruments (`scripts/coverage/**`, `docs/ai/coverage/**`).
**No `data/cards/**` change** (the `[hc:X]: … [keyword:Empowered] by [hc:Y]` markers already exist; the parser translates them).
**Decision:** D-24047 (reserved at draft; landed at execution). Lifts D-24044's conditional-prefix deferral for the class-gated case.

Authoritative execution contract for WP-272. Compliance is binary.

---

## Before Starting
- [ ] On `main`, clean, ff-synced to `a54726b7` (or later). `pnpm -r build` + `pnpm --filter @legendary-arena/game-engine test` exit 0; `pnpm sim:coverage --check`, `pnpm ledger:heroes:check`, `pnpm sim:runtime-observed:check` OK on the base.
- [ ] Read WP-267's parser branch in `setup/heroAbility.setup.ts`: `isParameterizedCompositionMarker`, `EMPOWERED_PARAM_TAIL_PATTERN`, `tryResolveEmpoweredCore` (sole-condition core; clears `conditions` on resolve), and the caller's `resolvedMarkers`/`unresolvedMarkers` push sites + `conditions.splice` suppression. Read `buildEmpoweredComposition` (`rules/heroCompositions.ts`).
- [ ] Confirm the executor runs `hook.primitiveEffects` INSIDE the conditions-passed gate (`hero/heroEffects.execute.ts`) — retaining the prefix `heroClassMatch` IS the conditional behavior; do NOT edit the executor.
- [ ] Record the sentinel replay `finalStateHash` — it MUST be unchanged at close (`EMPTY_REGISTRY` → hero hooks `[]` → Empowered never fires in a fixture).
- [ ] Note the committed `runtime-observed-hollows.json` BEFORE values (`summary.distinctMechanics`, `summary.totalObservations`, `byMechanic.empowered`) — the regen delta is a measured output, not a pre-locked number.

---

## Locked Values
- **WP:** WP-272. **EC:** EC-302. **Decision:** D-24047, reserved.
- **Reused verbatim (no edit):** `buildEmpoweredComposition(heroClass)` → `gain-resource{ resource:attack, amount: count-cards-by-class-in-zone{ heroClass:<normalizedColor>, zone:hq } }`; the `count-cards-by-class-in-zone` evaluator; the WP-256 `primitiveEffects` executor loop. **Unchanged:** `VALUE_EXPRESSION_TYPES` (2), `EFFECT_NODE_TYPES` (3), `EFFECT_ZONE_KINDS`, `EFFECT_COUNT_ZONE_KINDS` (`['hq']`), `HERO_KEYWORDS` (17).
- **New prefix-gate constant (locked):** `EMPOWERED_PREFIX_GATE_PATTERN = /^\s*\[hc:([a-z0-9-]+)\]\s*:/i` — anchored, non-global, stateless `.exec` (mirrors `EMPOWERED_PARAM_TAIL_PATTERN`).
- **Structural resolve gate (locked — ALL must hold; condition-counting alone is FORBIDDEN):** (1) normalized marker name is exactly `empowered`; (2) `abilityText` contains **exactly one** `[keyword:Empowered]` (case-insensitive count); (3) `EMPOWERED_PREFIX_GATE_PATTERN` matches `abilityText` → prefix class `X`; (4) the text immediately after the marker matches `EMPOWERED_PARAM_TAIL_PATTERN` → count color `Y`; (5) the text immediately after the consumed tail does NOT continue `^\s*and\s*\[hc:`; (6) `abilityText` contains NO `[team:…]` token.
- **On resolve (locked):** push `buildEmpoweredComposition(normalizeTraitSlug(Y))` to `primitiveEffects`; push `empowered` to `resolvedMarkers` (same gate); remove **exactly one** `{ type:'heroClassMatch', value: normalizeTraitSlug(Y) }` from `heroClassConditions`; **retain** `heroClassMatch(normalizeTraitSlug(X))` (the gate). NEVER clear all conditions on this path. NEVER push `empowered` to `hook.keywords`.
- **Order (locked):** in the `empowered` branch, attempt `tryResolveEmpoweredCore` FIRST (unchanged sole-condition core); only if it returns undefined attempt `tryResolveEmpoweredConditionalPrefix`; if both fail, push to `unresolvedMarkers` (unchanged Honest-Partial fallback).
- **Regenerate-then-commit:** run `pnpm sim:coverage --update-baseline`, `pnpm ledger:heroes`, `pnpm sim:runtime-observed` AFTER the parser change + `pnpm -r build`, and commit the regenerated `hero-effect-coverage.baseline.json` + `hero-mechanic-ledger.{json,csv}` + `runtime-observed-hollows.json` in the SAME commit so `--check` (CI) compares against the new baseline.
- **Commit message (execution):** `EC-302: empowered conditional-prefix class-gated core form (D-24047)`. (`EC-###:` prefix — code staged. The drafting commit is a separate `SPEC:`.)

---

## Guardrails
- **Honest-Partial Invariant (HIGHEST RISK):** resolving the conditional-prefix form MUST NOT silence the still-deferred variants. Color-of-choice, multi-class, choose-one (two-marker), team-gated, Double/Triple, and hero-name/multicolored/team-target Empowered MUST still reach `unresolvedMarkers`. Test each explicitly.
- **Structural gate, NOT condition-counting:** a residual-conditions-are-all-`heroClassMatch` check is UNSAFE — `wtif/star-lord-tchalla/fight-or-flight` (`Choose one: Empowered by [hc:strength], or by [hc:covert]`) would mis-resolve, treating the second choose-one branch's `[hc:covert]` as a gate. The single-marker guard (gate #2) is what rejects it. Do NOT drop it.
- **Suppress only the consumed param; retain the gate.** Remove exactly ONE `heroClassMatch(normalizeTraitSlug(Y))`; keep `heroClassMatch(normalizeTraitSlug(X))`. Use `normalizeTraitSlug` for both (the same value the tail/prefix regexes produce). Never `conditions.splice(0, …)` on this path.
- **No executor / interpreter / builder / contract edit.** Only `setup/heroAbility.setup.ts` (production) changes. If `tsc` wants `heroEffects.execute.ts`/`effectPrimitive.*`/`heroCompositions.ts` touched, the design leaked — re-confine; never `as any`.
- **No WP-267 behavior change.** `one-hit-wonder` (single marker, no leading `[hc:X]:` prefix) and `fight-or-flight` (two markers) MUST stay on the unchanged core path / unresolved exactly as before. Add a regression test asserting the core-form `[keyword:Empowered] by [hc:strength]` still resolves.
- **`data/cards/**` — zero diff.** The markers exist; the parser translates.
- **No coverage-SCRIPT edit** — `hero-effect-coverage.mjs` / `hero-mechanic-ledger.mjs` already classify executable + by-hook composition markers. Only their generated artifacts regenerate.
- **No `boardgame.io`/registry import**; no `.reduce()`; explicit guards; the parser never throws on malformed text (record unresolved + continue).

---

## Required `// why:` Comments
- At `EMPOWERED_PREFIX_GATE_PATTERN`: anchored leading class-condition prefix; mirrors the anchored tail constant; non-global stateless `.exec` (D-24047).
- At `tryResolveEmpoweredConditionalPrefix` (the structural gate): resolve ONLY the canonical single-marker + leading `[hc:X]:` + anchored fixed-color tail + no `and [hc:Y]` + no team shape; a condition-counting gate would mis-resolve choose-one (fight-or-flight) — the single-marker guard prevents it (the Honest-Partial Invariant).
- At the suppression: remove only the consumed count param `heroClassMatch(normalizeTraitSlug(Y))` and RETAIN the prefix gate `heroClassMatch(normalizeTraitSlug(X))` — the retained gate IS the conditional behavior the WP-256 executor honors (D-24047, lifts D-24044's conditional-prefix deferral).
- At the resolve-order branch: try the unchanged sole-condition core first, then conditional-prefix, then the unresolved fallback — the core path + one-hit-wonder/fight-or-flight stay unchanged.

---

## Files to Produce
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — `EMPOWERED_PREFIX_GATE_PATTERN` + `tryResolveEmpoweredConditionalPrefix` + the resolve-order branch + suppress-one-retain-gate.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — §Required parser test cases below; `HERO_KEYWORDS` 17.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — conditional-prefix integration (gate passes → `+Attack` = HQ count; gate fails → nothing, no hollow); test-only.
- `scripts/coverage/hero-effect-coverage.baseline.json` — **regenerated**.
- `docs/ai/coverage/hero-mechanic-ledger.json` + `.csv` — **regenerated**.
- `docs/ai/coverage/runtime-observed-hollows.json` — **regenerated** (competent sweep; conditional-prefix `empowered` hits clear).
- (NO interpreter / builder / contract / executor / coverage-script / `index.ts` / `notableEvents` / arena-client / dashboard-source / `mechanic-provenance.json` / `data/cards` files.)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24047), `WORK_INDEX.md` (WP-272 ✅), `EC_INDEX.md` (EC-302 Done), `05-ROADMAP-MINDMAP.md`.

**Explicit non-change:** `packages/game-engine/src/hero/heroEffects.execute.ts`, `packages/game-engine/src/hero/effectPrimitive.interpret.ts`, `packages/game-engine/src/rules/{heroCompositions,effectPrimitive.types}.ts` MUST be byte-unchanged.

---

## Required parser test cases (`rules/heroAbility.setup.test.ts`)
- `[hc:ranged]: You get [keyword:Empowered] by [hc:ranged]` → `primitiveEffects = [buildEmpoweredComposition('ranged')]`, exactly one retained `heroClassMatch('ranged')` gate, `empowered` ∈ `resolvedMarkers`, `empowered` ∉ `keywords`.
- Different-class `[hc:strength]: … [keyword:Empowered] by [hc:tech]` → built `count-by-class('tech', hq)`, retained `heroClassMatch('strength')`, only `heroClassMatch('tech')` suppressed.
- `Choose one: … [keyword:Empowered] by [hc:strength], or … [keyword:Empowered] by [hc:covert]` (two markers) → unresolved (single-marker guard).
- Multi-class `… [keyword:Empowered] by [hc:ranged] and [hc:strength]` → unresolved.
- Color-of-choice `You get [keyword:Empowered] by the color of your choice` → unresolved (anchored tail miss).
- Team-gated `[team:…]: … [keyword:Empowered] by [hc:covert]` → unresolved (team-token guard).
- Regression: `[keyword:Empowered] by [hc:strength]` (sole condition, no prefix) still resolves via the unchanged core path.

---

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail.
- [ ] Parser: conditional-prefix resolves with retained gate + one param suppressed; `empowered` ∉ `keywords`; deferred forms (choose-one, multi-class, color-of-choice, team-gated) → `unresolvedMarkers`; core form unchanged.
- [ ] Integration: gate-passes → `+Attack` = HQ class count; gate-fails → nothing (NOT a hollow).
- [ ] `pnpm sim:coverage --update-baseline` then `--check` OK. **Inspect the baseline `git diff`:** conditional-prefix `empowered` hooks leave `noEffect`/`unsupportedMechanics`; deferred-variant cards stay hollow; no unrelated set moves.
- [ ] `pnpm ledger:heroes` then `:check` OK (conditional-prefix `empowered` rows executable by-hook; deferred-variant rows stay unsupported).
- [ ] `pnpm sim:runtime-observed` twice → byte-identical; `:check` OK; `hollowEffectsDropped` = 0; record the measured `empowered` obs-count delta (per §Close Notes).
- [ ] `git diff --name-only -- data/cards/` → empty. `git diff --name-only -- packages/game-engine/src/index.ts packages/game-engine/src/hero/heroEffects.execute.ts packages/game-engine/src/hero/effectPrimitive.interpret.ts packages/game-engine/src/rules/heroCompositions.ts packages/game-engine/src/rules/effectPrimitive.types.ts apps/arena-client/ apps/dashboard/src/ scripts/coverage/hero-effect-coverage.mjs scripts/coverage/hero-mechanic-ledger.mjs scripts/coverage/mechanic-provenance.json` → empty; sentinel `finalStateHash` unchanged.
- [ ] `git diff --name-only` → only Files to Produce + governance (the gitignored `apps/dashboard/src/data/*.json` copies absent).
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-272 node present).

---

## Close Notes Required in PR / Commit Body
- Base + final `runtime-observed-hollows.json`: `summary.distinctMechanics`, `summary.totalObservations`, `byMechanic.empowered`; the measured `empowered` obs delta; `hollowEffectsDropped` remains `0`.
- The exact conditional-prefix card/hook flip set (executable-by-hook) from the regenerated ledger.
- Confirmation `data/cards/**`, the interpreter/builder/contract/executor, coverage scripts, `mechanic-provenance.json`, barrel, arena client, and tracked dashboard source are unchanged.

---

## Common Failure Smells
- A deferred-variant Empowered stopped surfacing as a hollow → the Honest-Partial Invariant was violated; resolve ONLY on the structural shape, else `unresolvedMarkers`.
- `fight-or-flight` (choose-one) became executable → the single-marker guard (gate #2) was dropped, or a condition-counting gate was used; restore the structural gate.
- The suppression cleared all conditions → the prefix gate was lost (the card fires unconditionally); remove exactly ONE `heroClassMatch(normalizeTraitSlug(Y))` and retain the gate.
- A different-class prefix left the wrong gate → suppression used the raw color or removed the prefix instead of the tail param; suppress the count color `Y`, retain the prefix `X`.
- `heroEffects.execute.ts` / interpreter / builder / contract in the diff → no edit is needed (the conditions-gate executor + WP-267 composition already do the work); re-confine.
- A coverage SCRIPT or `mechanic-provenance.json` in the diff → no edit is needed (WP-250/WP-268 machinery handles recognition); revert.
- `data/cards/**` in the diff → re-marking crept in; revert.
- `sim:runtime-observed` not byte-identical → a non-deterministic source crept in; the parser + the index-ordered HQ count are deterministic — keep them so.
