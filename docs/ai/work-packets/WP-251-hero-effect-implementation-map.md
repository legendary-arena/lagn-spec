# WP-251 — Hero Effect ImplementationMap (Open Dispatch, Behavior-Preserving)

**Status:** Draft — pending review
**Primary Layer:** Game Engine / Implementation
**Dependencies:** WP-021 ✅, WP-022 ✅, WP-023 ✅ (hero ability hooks + `executeSingleEffect`), WP-009B ✅ (the ImplementationMap pattern this mirrors), WP-247 ✅, WP-248 ✅ (latest hero keywords), WP-250 ✅ (the coverage gate that guards this refactor)

---

## Session Context

WP-009B established the data-only-hook + ImplementationMap pipeline for schemes/masterminds (handlers keyed by string in a runtime-only map outside `G`; `applyRuleEffects` dispatches via for-of; unknown types warn-and-continue); WP-021/022/023 built the hero ability executor as a hardcoded `switch` in `executeSingleEffect`; WP-250 shipped the `pnpm sim:coverage` gate. This packet routes the hero switch through an ImplementationMap **without changing any behavior** — it is the Lever 2 foundation for the Lever 1 parameterization (WP-252), per `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md`.

---

## Goal

After this session, `packages/game-engine/src/hero/heroEffects.execute.ts` dispatches hero effects through an open `HERO_EFFECT_HANDLERS` registry (a runtime-only `Record<HeroKeyword, HeroEffectHandler>`, functions held outside `G`) instead of a hardcoded `switch`. Every currently-executed keyword maps to a handler whose body is its current `switch` case, **moved verbatim** — execution is byte-for-byte identical. Adding a future effect becomes "register a handler + a drift-test entry," not "edit a 350-line switch." No keyword vocabulary, parser, card data, move, or public contract changes. The WP-250 coverage gate proves zero regression (`noEffect` per set unchanged).

---

## Assumes

- WP-021/022/023 complete. Specifically:
  - `packages/game-engine/src/hero/heroEffects.execute.ts` exports `executeHeroEffects` and `executeSingleEffect(G, ctx, playerID, cardId, effect)` with a `switch (effect.type)` over the MVP keyword set.
  - `packages/game-engine/src/rules/heroKeywords.ts` exports `HeroKeyword` + `HERO_KEYWORDS`.
  - `packages/game-engine/src/rules/heroAbility.types.ts` exports `HeroEffectDescriptor { type, magnitude?, countSource?, rewardType? }`.
- WP-250 complete: `pnpm sim:coverage --check` exists and is green on `main`.
- `pnpm --filter @legendary-arena/game-engine build` and `test` exit 0 on `main`.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md §5` — Lever 2 (this packet) + Lever 1 (WP-252) + why this lands first.
- `docs/ai/ARCHITECTURE.md §The Rule Execution Pipeline` — the ImplementationMap is runtime-only; `G` is never a function store; `applyRuleEffects` uses `for`/`for...of`, never `.reduce()`; unknown effects warn-and-continue, never throw.
- `packages/game-engine/src/rules/ruleRuntime.execute.ts` + `ruleRuntime.impl.ts` — the WP-009B `ImplementationMap = Record<string, handler>` + `DEFAULT_IMPLEMENTATION_MAP` to mirror.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — read it ENTIRELY; this packet moves each `switch` case body into a handler with **no logic change** and must preserve every pre-dispatch gate (condition evaluation in `executeHeroEffects`, magnitude validation, the `MVP_KEYWORDS` / `NO_MAGNITUDE_KEYWORDS` checks).
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6 (`// why:`), Rule 10 (no factories/HOFs unless framework-required — the registry is a plain data map of named functions, not a factory), Rule 12 (flat files).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness via `ctx.random.*` / the existing `ShuffleProvider`.
- Never throw inside move/effect execution — unknown keyword → warn to `G.messages` and continue (preserve current `default` behavior).
- `G` stays JSON-serializable — the `HERO_EFFECT_HANDLERS` map is a module-level runtime const of named functions; it is **never** written into `G`, a hook, or a descriptor.
- ESM only, Node v22+; `node:` prefix on built-ins; `.test.ts` test files.
- No `.reduce()` in the dispatch or any handler — `for`/`for...of` only.
- Full file contents for every new/modified file in the output.

**Packet-specific:**
- **Behavior-identical, full stop.** Each handler body is the corresponding `switch` case body, moved verbatim (same helpers: `drawFromPlayerDeck`, `addResources`, `koCard`, `moveCardFromZone`, `moveAllCards`, `shuffleDeck`, `resolveCountSource`; same `G.messages` strings; same `G.pendingOptionalKoRewards` push; same order). No logic is "improved," merged, or simplified.
- The registry is keyed by `HeroKeyword` (typed — preserves drift-detection + exhaustiveness); this is NOT an open-string map. The openness gained is "new effect = a handler + an entry," not abandoning the union.
- **Zero change** to: `heroKeywords.ts` (the `HeroKeyword` union / `HERO_KEYWORDS`), `heroAbility.types.ts`, `heroAbility.setup.ts` (the parser), any `data/cards/*.json`, any move, `game.ts`, and the villain executor.
- The handler signature is exactly the current per-case contract: `(G, ctx, playerID, cardId, effect): void`.
- All pre-dispatch gating (condition evaluation, `isValidMagnitude`, `MVP_KEYWORDS`/`NO_MAGNITUDE_KEYWORDS` membership) is preserved exactly — only the case dispatch becomes a map lookup.

**Session protocol:**
- If any pre-dispatch gate or case body is ambiguous, stop and ask — never "tidy" a case during the move.

---

## Debuggability & Diagnostics

- Behavior is reproducible from identical setup + seed + moves (no new randomness, no clock, no IO).
- The refactor is externally verified two ways: the full engine test suite stays green (every existing `heroEffects.execute.test.ts` assertion passes unmodified), and `pnpm sim:coverage --check` exits 0 (the per-set `noEffect` taxonomy is identical because no parser/keyword changed).
- A new drift test makes the registry self-describing: `HERO_EFFECT_HANDLERS` keys must exactly equal the executed-keyword set.

---

## Scope (In)

### A) The handler type + registry
- **`packages/game-engine/src/hero/heroEffects.execute.ts`** — modified (or extract handlers to a new `heroEffects.handlers.ts` if the file would exceed ~1 screen per function; keep one file if cleaner):
  - Define `type HeroEffectHandler = (G: LegendaryGameState, ctx: unknown, playerID: string, cardId: CardExtId, effect: HeroEffectDescriptor) => void;`
  - Define `const HERO_EFFECT_HANDLERS: Partial<Record<HeroKeyword, HeroEffectHandler>>` — one named function per currently-executed keyword (`draw`, `attack`, `recruit`, `ko`, `rescue`, `reveal`, `reveal-ko`, `reveal-min`, `reveal-ko-or-draw`, `reveal-cost-attack`, `reveal-odd-draw`, `reveal-attack-choose`, `reveal-ko-attack`, `attack-per-count`, `optional-ko-reward`). Each function body is the verbatim current `case` body. `Partial<>` because `wound`/`conditional` are intentionally unmapped (the current deferred set).
  - Add `// why:` on the registry: it mirrors WP-009B's ImplementationMap; handlers live outside `G`; dispatch is data-driven so a new effect is a map entry, not a switch edit (cite the design doc + reserved D-24022).
- **`executeSingleEffect`** — replaced body: keep all current pre-dispatch gates, then `const handler = HERO_EFFECT_HANDLERS[effect.type]; if (handler === undefined) { /* existing default: warn-or-silent-skip exactly as today */ return; } handler(G, ctx, playerID, cardId, effect);` No `switch` over `effect.type` remains.
- **Promote `MVP_KEYWORDS` to an export** (the drift-test authority). The registry-drift test compares `Object.keys(HERO_EFFECT_HANDLERS)` against the exported `MVP_KEYWORDS` — NOT the coverage script's separate `EXECUTED_KEYWORDS` copy (that stays out of scope). // why: one in-engine source of truth for the executed set; no third copy. (RS-1 from pre-flight.)
- **Handler extraction (only if split to `heroEffects.handlers.ts`):** export `isValidMagnitude`, `drawFromPlayerDeck`, and `OPTIONAL_KO_REWARD_SEEDED_REWARDS` from `heroEffects.execute.ts` and import them — **never re-declare** them (the codebase already keeps a deliberate two-copy seed-reward split between setup + executor; do not add a third). If a single file is cleaner, keep inline and skip the exports. (Copilot Issue 12/25.)

### B) Tests
Add/extend `node:test` tests in `packages/game-engine/src/hero/heroEffects.execute.test.ts`:
- **Registry drift test (bidirectional):** `Object.keys(HERO_EFFECT_HANDLERS)` equals the exported `MVP_KEYWORDS` set exactly — every handler key ∈ `MVP_KEYWORDS` AND every `MVP_KEYWORDS` member has a handler. `// why:` a keyword added to one but not the other fails here.
- Every pre-existing `heroEffects.execute.test.ts` assertion passes **unmodified** (behavior identity).
- `JSON.stringify(G)` succeeds after dispatch (the map is not in `G`).
- No import from `boardgame.io`; uses `makeMockCtx`.

---

## Out of Scope

- **No vocabulary collapse / parameterization** — that is WP-252 (Lever 1).
- **No villain executor change** — WP-252 converts `applyVillainEffect`.
- No parser (`heroAbility.setup.ts`), markup, or `data/cards/*.json` change.
- No `HeroKeyword` union / `HERO_KEYWORDS` change; no new keyword; no executing `wound`/`conditional`.
- No move, `game.ts`, or UIState change.
- No behavior change of any kind — refactors that alter output are a failure, not a bonus.

---

## Files Expected to Change

- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — `HeroEffectHandler` type + `HERO_EFFECT_HANDLERS` registry; `executeSingleEffect` dispatches via the map; exports `MVP_KEYWORDS` (drift-test authority).
- `packages/game-engine/src/hero/heroEffects.handlers.ts` — **new (optional)** — extracted handler functions, if splitting keeps functions one-screen each. (If kept inline, omit.)
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — registry drift test + behavior-identity coverage.

Governance at close (Definition of Done): `STATUS.md`, `DECISIONS.md` (D-24022), `WORK_INDEX.md`, `EC_INDEX.md` (EC-282), `docs/05-ROADMAP-MINDMAP.md`.

No other files may be modified.

---

## Acceptance Criteria

All items binary pass/fail.

### A) Registry
- [ ] `heroEffects.execute.ts` defines `HeroEffectHandler` and `HERO_EFFECT_HANDLERS`; the map has exactly one handler per executed keyword (15 today) and none for `wound`/`conditional`.
- [ ] `executeSingleEffect` contains no `switch` over `effect.type` (confirmed with `Select-String`); it looks up `HERO_EFFECT_HANDLERS[effect.type]` and calls it, with the unknown-keyword path behaving exactly as the prior `default`.
- [ ] `HERO_EFFECT_HANDLERS` is a module-level const, never assigned into `G`, a hook, or a descriptor (confirmed by `JSON.stringify(G)` test + grep).

### B) Behavior identity
- [ ] Every pre-existing assertion in `heroEffects.execute.test.ts` passes unmodified.
- [ ] Registry drift test asserts **bidirectionally** that `Object.keys(HERO_EFFECT_HANDLERS)` equals the exported `MVP_KEYWORDS` set (handler-keys ⊆ MVP_KEYWORDS and every MVP_KEYWORDS member has a handler).
- [ ] `pnpm sim:coverage --check` exits 0 (per-set `noEffect` unchanged — proof of behavior identity at the corpus level).

### Scope Enforcement
- [ ] `git diff --name-only` touches only `packages/game-engine/src/hero/**` + governance files; `heroKeywords.ts`, `heroAbility.types.ts`, `heroAbility.setup.ts`, `data/cards/**`, and the villain executor are unchanged.

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):

- **§1–§6 (structure, constraints, prerequisites, context, output completeness, naming):** PASS — all required sections present; ≤3 code files; canonical names match `00.2`.
- **§7 dependency discipline:** PASS — no new npm deps.
- **§8 architectural boundaries:** PASS — Game Engine layer only; `G` JSON-serializable (handler map outside `G`); `ctx.random.*` only; no DB/network/IO; moves untouched.
- **§9 Windows / §10 env / §11 auth:** N/A — no shell scripts, env vars, or auth surface.
- **§12 test quality:** PASS — `node:test`, `makeMockCtx`, no `boardgame.io` import.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — `pnpm` commands exact; acceptance binary; DoD includes STATUS/DECISIONS/WORK_INDEX.
- **§16 code style:** PASS — named handlers (not factories/HOFs), no abbreviations, `// why:` on the registry + dispatch.
- **§17 Vision:** N/A — behavior-preserving dispatch refactor; touches no scoring/replay/identity/multiplayer/RNG/card-data/monetization/live-ops/accessibility/registry-viewer surface.
- **§18 prose-vs-grep:** PASS — the `switch (effect.type)` grep targets the source file, not this WP; no self-trip.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A — no repo-state-summary artifact, no funding surface, no HTTP endpoint or `apps/server` library function.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE** (re-run 2026-06-15). RS-1 (drift-test authority) + RS-2 (D-24022 reserved) resolved in-place above.
- **Copilot (`01.7`): PASS / CONFIRM** (re-run 2026-06-15). Issue 12/25 (handler-extraction symbol export) + Issue 4 (bidirectional drift) resolved in-place above; session-prompt generation authorized.

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0

# Step 2 — full engine test suite (behavior identity)
pnpm --filter @legendary-arena/game-engine test
# Expected: all pass, 0 fail; pre-existing heroEffects assertions unchanged

# Step 3 — no keyword switch remains
Select-String -Path "packages\game-engine\src\hero\heroEffects.execute.ts" -Pattern "switch \(effect.type\)|switch \(keyword\)"
# Expected: no output

# Step 4 — coverage unchanged (behavior identity at corpus level)
pnpm -r build
pnpm sim:coverage --check
# Expected: exits 0, "OK: no hero-effect coverage regression"

# Step 5 — handlers not in G
Select-String -Path "packages\game-engine\src\hero\heroEffects.execute.ts" -Pattern "G.*HERO_EFFECT_HANDLERS|pendingOptionalKoRewards.*HERO_EFFECT_HANDLERS"
# Expected: no output (registry never written into G)

# Step 6 — scope
git diff --name-only
# Expected: only packages/game-engine/src/hero/** + governance files
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0
- [ ] `pnpm sim:coverage --check` exits 0 (behavior identity)
- [ ] No `switch (effect.type)` in `heroEffects.execute.ts` (`Select-String`)
- [ ] `heroKeywords.ts` / `heroAbility.types.ts` / `heroAbility.setup.ts` / `data/cards/**` / villain executor unchanged (`git diff`)
- [ ] No files outside `## Files Expected to Change` modified (`git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — hero effects now dispatch via an ImplementationMap; foundation for WP-252
- [ ] `docs/ai/DECISIONS.md` updated — D-24022 (hero effects dispatch via a runtime `HERO_EFFECT_HANDLERS` ImplementationMap keyed by `HeroKeyword`, mirroring WP-009B; behavior-preserving; openness = handler-per-entry, union still typed/drift-detected)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-251 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-282 marked Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-251 node added under Hero Ability Coverage & Markup Pipeline; `node scripts/roadmap-counts.mjs --check` passes
