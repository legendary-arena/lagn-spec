# WP-252 — Parameterized Villain Effect Primitives (Reopens D-20201 / D-18901)

**Status:** Draft — pending review. **Execution-BLOCKED until WP-251 merges to `main`** (the executor mirrors the merged `HERO_EFFECT_HANDLERS` shape; pre-flight RS-1).
**Primary Layer:** Game Engine / Contracts + Implementation
**Dependencies:** WP-251 ✅-on-merge (the `HERO_EFFECT_HANDLERS` ImplementationMap pattern this mirrors), WP-185 ✅, WP-189 ✅, WP-202 ✅, WP-214 ✅ (the villain keywords being collapsed), WP-009B ✅ (ImplementationMap precedent), WP-250 ✅ (coverage gate — hero-only; see §Debuggability)

---

## Session Context

WP-251 routed the hero effect switch through an `ImplementationMap` (Lever 2). The villain executor (`applyVillainEffect`) is still a 10-case switch whose keyword vocabulary is fragmented along target × magnitude × selector axes — `koHeroEachPlayer`/`koHeroEachPlayerMag2`, `gainWoundEachPlayer`/`gainWoundCurrentPlayer`, three `captureHqHero*` — under D-20201 (closed-union-per-magnitude) + D-18901 (incremental-expansion-per-keyword). This packet is Lever 1 of `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md`: it parameterizes the descriptor and collapses the vocabulary into primitives, reopening D-20201/D-18901.

---

## Goal

After this session, villain effects execute through a `VILLAIN_EFFECT_HANDLERS` ImplementationMap keyed by a small closed `VillainEffectPrimitive` set, consuming a parameterized `VillainEffectDescriptor { primitive, target?, magnitude?, selector? }`. The ten fragmented keywords collapse into five primitives (`ko-hero`, `gain-wound`, `capture-hq-hero`, `hero-deck-top-to-escape`, `capture-bystander`); `koHeroEachPlayerMag2`'s literal `for i<2` loop becomes a `magnitude`-driven loop. The setup parser **translates the legacy `[effect:<keyword>]` tokens** through a frozen table into parameterized descriptors AND accepts new `[effect:<primitive>:<target>:<magnitude>]` tokens. **Card data is unchanged this packet** (legacy markers still parse, now translated). A new magnitude/target variant (`magnitude:3`, a future axis) then needs **zero engine code** — a data marker only. This retires the closed-union-per-magnitude policy (D-20201) and the incremental-expansion-per-keyword policy (D-18901). Crucially, the hook's **applied-effects / narrative surface stays keyword-typed** via a `descriptor → legacy keyword` reverse-map, so `G.notableEvents`, the `EFFECT_KEYWORD_LABELS` table, the replay state-hash, and the arena-client `UIState.notableEvents` projection are **byte-identical** — the parameterization is internal to dispatch.

---

## Assumes

- WP-251 merged: `heroEffects.execute.ts` uses `HERO_EFFECT_HANDLERS` (the pattern to mirror).
- `packages/game-engine/src/rules/villainAbility.types.ts` exports `VillainEffectKeyword` + `VILLAIN_EFFECT_KEYWORDS` (10) + `VillainAbilityHook { cardId, timing, keywords, effects: VillainEffectKeyword[] }`.
- `packages/game-engine/src/villain/villainEffects.execute.ts` exports `executeVillainAbilities` + `applyVillainEffect` (the 10-case switch; `koHeroEachPlayerMag2` has a literal `for (let i=0; i<2; i++)` inner loop).
- `packages/game-engine/src/setup/villainAbility.setup.ts` parses `[effect:<keyword>]` against `VILLAIN_EFFECT_KEYWORDS`.
- `scripts/convert-cards/apply-effect-markers.mjs` holds a hand-synced keyword array.
- `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 on the base.

If any is false, this packet is **BLOCKED**. WP-251 must be **merged to `main`** before execution (not merely drafted) — pre-flight is NOT READY until then.

---

## Context (Read First)

- `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md §5` — Lever 1.
- `docs/ai/DECISIONS.md` D-20201 + D-18901 — the policies being reopened; quote their rejection reasons (parser regex + dispatch contract + overlay validator + drift tests would all change; "only N=2 empirically"). This packet's DECISIONS entry must counter both premises.
- `docs/ai/ARCHITECTURE.md §The Rule Execution Pipeline` — ImplementationMap runtime-only; no functions in `G`; `for`/`for...of`, no `.reduce()`; unknown → warn-and-continue.
- `packages/game-engine/src/villain/villainEffects.execute.ts` — read entirely; each handler body is the current case body moved verbatim, with the `koHeroEachPlayerMag2` literal-2 loop generalized to `magnitude` and `koHeroCurrentPlayer`'s interactive park-choice preserved exactly.
- `packages/game-engine/src/rules/villainAbility.types.ts` + `villainAbility.types.test.ts` — the frozen 10-keyword array + its append-only/parity drift tests.
- `packages/game-engine/src/hero/heroEffects.execute.ts` (post-WP-251) — the `HERO_EFFECT_HANDLERS` shape to mirror.
- `docs/ai/REFERENCE/00.6-code-style.md` — no abbreviations, `// why:`, no `.reduce()`.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- Never `Math.random()`; randomness via `ctx.random.*`.
- Never throw in effect execution — unknown primitive → warn to `G.messages` and continue.
- `G` stays JSON-serializable — `VillainEffectDescriptor` is plain data (no functions); `VILLAIN_EFFECT_HANDLERS` is a module-level runtime const, never in `G`.
- ESM, Node v22+, `node:` prefix, `.test.ts`, no `.reduce()`, full file contents.

**Packet-specific:**
- **Behavior-identical via translation.** Every legacy keyword maps (frozen table) to a descriptor whose handler reproduces the current case body exactly: `koHeroCurrentPlayer` → `ko-hero{target:'current'}` (the interactive park-choice path, unchanged); `koHeroEachPlayer` → `ko-hero{target:'each',magnitude:1}`; `koHeroEachPlayerMag2` → `ko-hero{target:'each',magnitude:2}` (literal-2 loop → `magnitude` loop); `gainWound{Each,Current}Player` → `gain-wound{target}`; `captureHqHero{Rightmost,HighestCost,LowestCost}` → `capture-hq-hero{selector}`; `heroDeckTopToEscape`/`captureBystander` → standalone primitives (the latter keeps its `onFight`-only post-award branch).
- **Card data unchanged** (`data/cards/**` zero diff) — the parser translates legacy tokens; no re-marking this packet.
- **Legacy union frozen, not extended.** `VillainEffectKeyword` + `VILLAIN_EFFECT_KEYWORDS` (10) stay as the parser's translation input only; **no keyword is ever appended again** (D-20201/D-18901 retired). New variants are descriptor params via parameterized tokens.
- **Behavior-identity guarantee (reverse-map — the load-bearing constraint).** `VillainAbilityHook.effects` becomes `VillainEffectDescriptor[]` (the dispatch input), but the **applied-effects surface stays `VillainEffectKeyword[]`**: `executeVillainAbilities`'s return, `notableEvents.appliedEffects`, the `EFFECT_KEYWORD_LABELS` narrative table, the replay state-hash, and the arena-client `UIState.notableEvents` projection are **UNCHANGED**. The executor derives each applied keyword by reverse-mapping the dispatched descriptor via `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD`. Because this WP changes no card data (every token is legacy → one of the 10 known descriptors), every descriptor reverse-maps to exactly its legacy keyword → byte-identical narratives + hash + arena-client. Therefore `notableEvents.types.ts`, `notableEvents.compose.ts`, the arena-client notable-event consumers + UIState fixtures, and the sentinel `finalStateHash` are **NOT in scope and MUST NOT change** — this is what keeps the packet genuinely behavior-identical and off the WP-166/207/227 arena-client `vue-tsc` recurrence.
- **`keywords` and `effects` are now DISTINCT arrays.** `buildVillainAbilityHooks` currently assigns the *same reference* to both. After this WP, `keywords: VillainEffectKeyword[]` (legacy list, unchanged type) and `effects: VillainEffectDescriptor[]` (translated descriptors) are built separately; rewrite the `// why: same reference` comment to document the split (pre-flight PS-2).
- Mirror WP-251: `VILLAIN_EFFECT_HANDLERS: Record<VillainEffectPrimitive, VillainEffectHandler>`, handlers branch on `target`/`selector`/`magnitude`.

**Session protocol:**
- If a legacy case body is ambiguous to generalize (esp. the `koHeroCurrentPlayer` interactive park vs `koHeroEachPlayer` auto path), stop and ask — do not merge their semantics beyond the documented `target` branch.

---

## Debuggability & Diagnostics

- Behavior reproducible from setup + seed + moves; the only RNG is the existing per-effect logic, unchanged.
- **Guarding (honest scope):** the WP-250 `pnpm sim:coverage` gate is **hero-only**, so it does NOT guard this villain refactor. Behavior identity is proven by: the full engine test suite (`villainEffects.execute.test.ts` + the villain integration tests + the WP-200 label-table exhaustiveness test) passing with assertions that map each **legacy keyword** to its unchanged effect; plus a new **translation-equivalence** test asserting each legacy token produces the descriptor whose handler matches the pre-refactor output. A villain coverage-gate extension is a future Lever-3 follow-up (noted, not in scope).
- New drift tests make the primitive set + translation table self-describing.

---

## Scope (In)

### A) Contracts — `villainAbility.types.ts`
- Add `VillainEffectPrimitive` closed union (`'ko-hero' | 'gain-wound' | 'capture-hq-hero' | 'hero-deck-top-to-escape' | 'capture-bystander'`) + canonical `VILLAIN_EFFECT_PRIMITIVES` array.
- Add `VillainEffectDescriptor { primitive: VillainEffectPrimitive; target?: 'current' | 'each'; magnitude?: number; selector?: 'rightmost' | 'highest-cost' | 'lowest-cost' }`.
- Change `VillainAbilityHook.effects` to `VillainEffectDescriptor[]`; keep `keywords: VillainEffectKeyword[]` (now a **distinct array**, no longer the same reference as `effects`).
- Keep `VillainEffectKeyword` + `VILLAIN_EFFECT_KEYWORDS` (10) **frozen** as the translation input; add `// why:` they are retired-but-frozen (no further appends; D-20201/D-18901 reopened — cite D-24023).
- Export a frozen `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR: Record<VillainEffectKeyword, VillainEffectDescriptor>` translation table **and its inverse `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD`** (descriptor → its legacy keyword), used by the executor to keep the applied-effects/narrative surface keyword-typed. The inverse is total over the 10 legacy descriptors.

### B) Executor — `villainEffects.execute.ts`
- Replace the `applyVillainEffect` switch with `VILLAIN_EFFECT_HANDLERS: Record<VillainEffectPrimitive, VillainEffectHandler>` (mirror `HERO_EFFECT_HANDLERS`). Handler signature `(G, currentPlayer, cardId, timing, descriptor): boolean`.
- `ko-hero` handler: `target==='current'` → the unchanged interactive park-choice; `target==='each'` → loop `descriptor.magnitude ?? 1` times over sorted players (the generalized Mag2 loop).
- `gain-wound`, `capture-hq-hero` handlers branch on `target`/`selector` (verbatim case bodies). `hero-deck-top-to-escape`, `capture-bystander` standalone (preserve `captureBystander`'s `onFight` gate).
- `executeVillainAbilities` iterates `hook.effects` (descriptors), dispatches via the map; unknown primitive → warn+continue. Its applied-effects accumulator **stays `VillainEffectKeyword[]`** — push `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD[descriptor]` (the reverse-map), NOT the descriptor — so the return type, `notableEvents`, narrative labels, and the replay hash are unchanged.

### C) Parser — `villainAbility.setup.ts`
- Accept BOTH: legacy `[effect:<keyword>]` (validate ∈ `VILLAIN_EFFECT_KEYWORDS`, then translate via `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR`) AND parameterized `[effect:<primitive>(:<target|selector>)?(:<magnitude>)?]` (validate primitive ∈ `VILLAIN_EFFECT_PRIMITIVES`, parse params). Emit `VillainEffectDescriptor[]`.
- `// why:` the dual grammar is the D-24023 migration seam — legacy markers keep working, new markers are parameterized.

### D) Overlay validator — `scripts/convert-cards/apply-effect-markers.mjs`
- Widen only the **validator** portion to recognize parameterized tokens, and add the 5 primitives to the hand-synced list (keeping the 10 legacy keywords recognized). The **emitter/heuristics are unchanged** — they keep emitting legacy `[effect:<keyword>]` tokens, so `data/cards/**` stays byte-unchanged. Emitter migration to parameterized tokens is deferred to WP-253.

### E) Tests
- `villainAbility.types.test.ts`: `VILLAIN_EFFECT_PRIMITIVES` drift (exactly 5); the frozen 10-keyword drift test stays; **translation-table parity** — every `VillainEffectKeyword` has a `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR` entry whose `primitive` ∈ the union; **reverse-map round-trip** — every legacy keyword round-trips keyword→descriptor→keyword identically (totality of `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD` over the 10). Migrate the existing `getVillainHooksForCard` fixtures' `effects: [<keyword>]` literals to `VillainEffectDescriptor[]` (the `keywords` field stays keyword-typed). The frozen-keyword count/order assertion is what "stays unchanged"; the fixture `effects` literals DO change.
- `villainEffects.execute.test.ts`: handler behavior per primitive; **legacy-translation equivalence** (each legacy keyword's translated descriptor yields the pre-refactor output, incl. `koHeroEachPlayerMag2` == `ko-hero{each,2}` two-KO behavior); `JSON.stringify(G)` ok; no `boardgame.io` import.

---

## Out of Scope

- **No hero vocabulary collapse** — the hero `reveal-*` family parameterization is WP-253 (the sweep built on WP-251 + this).
- **No card-data re-marking** — `data/cards/**` zero diff (parser translates legacy).
- No appending to `VillainEffectKeyword` (it is frozen/retired).
- No villain coverage-gate extension (future Lever-3 follow-up).
- No new villain mechanic/timing; no move behavior change.
- **No change to `notableEvents.types.ts` / `notableEvents.compose.ts` / `EFFECT_KEYWORD_LABELS`, the arena-client notable-event consumers + UIState fixtures, or the sentinel replay `finalStateHash`** — the reverse-map keeps the applied-effects surface keyword-typed and byte-identical (these MUST show zero diff).
- No parameterized card-data tokens (the parser accepts them, but no card uses them this WP); descriptor-keyed narrative labels (for future parameterized-only tokens) are WP-253.

---

## Files Expected to Change

- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — primitive union + descriptor + frozen `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR` + inverse `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD`; `effects` retyped, `keywords` kept keyword-typed (distinct array).
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — switch → `VILLAIN_EFFECT_HANDLERS`; `magnitude`-driven each-player KO.
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** — dual (legacy + parameterized) token grammar → descriptors.
- `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — accept parameterized tokens; primitives in the hand-synced list.
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — primitive drift + translation parity.
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — handler + legacy-equivalence tests.
- (No notable-events / arena-client / replay-hash files — the reverse-map keeps the applied-effects surface keyword-typed, so those compile + hash unchanged. If `tsc` surfaces a `hook.effects` consumer the reverse-map does NOT cover, **STOP** — the descriptor leaked past the executor; re-confine it, do not widen the allowlist.)

Governance at close: `STATUS.md`, `DECISIONS.md` (D-24023 + reopen D-20201/D-18901), `WORK_INDEX.md`, `EC_INDEX.md` (EC-283), `docs/05-ROADMAP-MINDMAP.md`.

No other files may be modified. (`data/cards/**` MUST be unchanged.)

---

## Acceptance Criteria

### A) Contracts
- [ ] `VILLAIN_EFFECT_PRIMITIVES` has exactly 5 primitives; `VillainEffectDescriptor` has the 4 fields; `VillainAbilityHook.effects` is `VillainEffectDescriptor[]`.
- [ ] `VILLAIN_EFFECT_KEYWORDS` still has the 10 frozen keywords (drift test unchanged); `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR` maps all 10.

### B) Executor + behavior identity
- [ ] No `switch` over the effect keyword/primitive remains in `villainEffects.execute.ts` (dispatch via `VILLAIN_EFFECT_HANDLERS`).
- [ ] `koHeroEachPlayerMag2` translates to `ko-hero{target:'each',magnitude:2}` and KOs two heroes per player (test); `koHeroEachPlayer` → magnitude 1.
- [ ] Every pre-existing `villainEffects.execute.test.ts` / villain integration assertion passes (behavior identity); translation-equivalence test passes for all 10 legacy keywords.

### C) Parser
- [ ] Legacy `[effect:koHeroEachPlayerMag2]` and parameterized `[effect:ko-hero:each:2]` both parse to the same descriptor (test).
- [ ] `data/cards/**` is byte-unchanged (`git diff` empty).

### Behavior-identity surface (reverse-map)
- [ ] `executeVillainAbilities` still returns `VillainEffectKeyword[]` (reverse-mapped), not descriptors; reverse-map round-trip test passes for all 10 legacy keywords.
- [ ] `keywords` and `effects` are distinct arrays (not the same reference).
- [ ] `git diff --name-only` shows **no** change to `packages/game-engine/src/events/notableEvents.{types,compose}.ts`, any `apps/arena-client/**`, or the sentinel `*.replay.json` fixture.

### Scope
- [ ] `git diff --name-only -- data/cards/` empty.
- [ ] No files outside `## Files Expected to Change` modified.

---

## Verification Steps

```pwsh
# Step 1 — build (surfaces every hook.effects consumer needing the descriptor type)
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0 (all consumers updated)

# Step 2 — full engine test suite (behavior identity + translation equivalence)
pnpm --filter @legendary-arena/game-engine test
# Expected: all pass, 0 fail

# Step 3 — no effect switch remains
Select-String -Path "packages\game-engine\src\villain\villainEffects.execute.ts" -Pattern "switch \(effect\)|switch \(.*[Kk]eyword\)|switch \(.*primitive\)"
# Expected: no output

# Step 4 — card data untouched
git diff --name-only -- data/cards/
# Expected: no output

# Step 5 — Mag2 generalized to magnitude (no literal-2 loop)
Select-String -Path "packages\game-engine\src\villain\villainEffects.execute.ts" -Pattern "iteration < 2|i < 2"
# Expected: no output (loop is magnitude-driven)

# Step 5b — applied-effects surface kept keyword-typed via reverse-map: these MUST be unchanged
git diff --name-only -- packages/game-engine/src/events/ apps/arena-client/ packages/game-engine/src/test/fixtures/
# Expected: no output (notableEvents + arena-client + sentinel replay hash untouched)

# Step 6 — scope
git diff --name-only
# Expected: only the Files Expected to Change + governance
```

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):

- **§1–§6 (structure, constraints, prerequisites, context, output, naming):** PASS — all sections present; canonical names match `00.2`; ≤8 code files.
- **§7 dependency discipline:** PASS — no new npm deps.
- **§8 architectural boundaries:** PASS — Game Engine layer; `VillainEffectDescriptor` is plain data and `VILLAIN_EFFECT_HANDLERS` lives outside `G` (JSON-serializable); `ctx.random.*` only; no DB/network.
- **§9 Windows / §10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — `node:test`, `makeMockCtx`, no `boardgame.io`; reverse-map round-trip + legacy-equivalence tests added.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands; binary criteria; DoD includes STATUS/DECISIONS/WORK_INDEX.
- **§16 code style:** PASS — named handlers, no abbreviations, `// why:` on the dual-grammar + reverse-map + frozen-union sites; no `.reduce()`.
- **§17 Vision:** Triggered (touches the replay state-hash surface). **Determinism preserved:** the reverse-map keeps the applied-effects/`notableEvents` surface keyword-identical, so the sentinel `finalStateHash` is byte-unchanged and replay determinism (Vision §3/§8) is not affected. No scoring/identity/leaderboard surface touched. No Vision conflict.
- **§18 prose-vs-grep:** PASS — the `switch`/`iteration < 2` greps target source files, not this WP.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A — no repo-state-summary artifact, no funding surface, no HTTP endpoint / `apps/server` library function.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): NOT READY (as first drafted)** → reworked. PS-1 (the `appliedEffects`→`notableEvents`→replay-hash→arena-client ripple) resolved by the **reverse-map** design (those surfaces stay keyword-typed + untouched); PS-2 (the `keywords`/`effects` shared-array split) now explicit; RS-1 (sequencing) recorded as Execution-BLOCKED until WP-251 merges.
- **Copilot (`01.7`): BLOCK (as first drafted)** → same findings resolved by the rework.
- **Re-run complete (2026-06-15):** pre-flight **READY TO EXECUTE** (modulo the WP-251-merge gate); copilot **PASS / CONFIRM**. PS-1 (reverse-map verified byte-identical at the accumulator — total + injective inverse table, preserved conditional-push + dispatch order), PS-2 (distinct arrays), and RS-1 (sequencing) all resolved/gated; no new failure modes. **Execution stays BLOCKED until WP-251 merges to `main`.**

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0
- [ ] `data/cards/**` byte-unchanged (`git diff`)
- [ ] No effect `switch` and no literal-2 loop in `villainEffects.execute.ts` (`Select-String`)
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/STATUS.md` updated — villain effects parameterized; D-20201/D-18901 retired; new variants are data-only
- [ ] `docs/ai/DECISIONS.md` updated — **D-24023** (parameterized `VillainEffectDescriptor` + `VILLAIN_EFFECT_HANDLERS` ImplementationMap; dual legacy/parameterized parser grammar) and **D-20201 + D-18901 reopened** → status Superseded, with the rationale: the WP-250 coverage gate now catches regressions and the corpus shows 122 unmodeled mechanics, flipping the cost/benefit the original decisions weighed
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-252 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-283 marked Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-252 node added; `node scripts/roadmap-counts.mjs --check` passes
