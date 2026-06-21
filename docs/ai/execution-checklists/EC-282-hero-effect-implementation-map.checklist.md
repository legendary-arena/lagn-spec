# EC-282 — Hero Effect ImplementationMap (Execution Checklist)

**Source:** docs/ai/work-packets/WP-251-hero-effect-implementation-map.md
**Layer:** Game Engine / Implementation (`packages/game-engine/src/hero/**` + tests).
Behavior-preserving refactor. No vocabulary, parser, card-data, move, or contract change.

This EC is the authoritative execution contract for WP-251. Compliance is binary.

---

## Before Starting

- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 on the base.
- [ ] `pnpm -r build` + `pnpm sim:coverage --check` exit 0 on the base (record the baseline `OK` line).
- [ ] Read `heroEffects.execute.ts` end-to-end; list every `switch (effect.type)` case + its pre-dispatch gates.
- [ ] Read `ruleRuntime.execute.ts` / `ruleRuntime.impl.ts` (the WP-009B ImplementationMap to mirror).

---

## Locked Values

- **WP:** WP-251. **EC:** EC-282. **Decision:** D-24022 (reserved).
- **Handler type (locked):** `type HeroEffectHandler = (G: LegendaryGameState, ctx: unknown, playerID: string, cardId: CardExtId, effect: HeroEffectDescriptor) => void;` — identical to the current per-case contract.
- **Registry (locked):** `const HERO_EFFECT_HANDLERS: Partial<Record<HeroKeyword, HeroEffectHandler>>`, module-level runtime const, never assigned into `G`.
- **Mapped keywords (15, locked — exactly the current executed set):** `draw`, `attack`, `recruit`, `ko`, `rescue`, `reveal`, `reveal-ko`, `reveal-min`, `reveal-ko-or-draw`, `reveal-cost-attack`, `reveal-odd-draw`, `reveal-attack-choose`, `reveal-ko-attack`, `attack-per-count`, `optional-ko-reward`. **Unmapped (locked):** `wound`, `conditional`.
- **Drift authority (locked):** export `MVP_KEYWORDS` from `heroEffects.execute.ts`; the registry-drift test asserts `Object.keys(HERO_EFFECT_HANDLERS)` equals it **bidirectionally**. Do NOT key the test off the coverage script's `EXECUTED_KEYWORDS` copy (out of scope) or add a third list.
- **Handler-extraction symbol rule (locked):** if handlers move to `heroEffects.handlers.ts`, export `isValidMagnitude`, `drawFromPlayerDeck`, `OPTIONAL_KO_REWARD_SEEDED_REWARDS` from `heroEffects.execute.ts` and import them — never re-declare (no third seed-reward copy). Single-file inline is equally acceptable.
- **Behavior identity (locked):** each handler body = its current `switch` case body, moved verbatim — same helpers, same `G.messages` strings, same `G.pendingOptionalKoRewards` push, same order. No logic change.
- **Dispatch (locked):** `executeSingleEffect` keeps all pre-dispatch gates, then `HERO_EFFECT_HANDLERS[effect.type]` lookup → call, else the prior `default` behavior. No `switch (effect.type)` remains.
- **Commit message:** `EC-282: hero effect ImplementationMap — behavior-preserving switch → registry (D-24022)`. (Code-staged → `EC-###:` prefix, never `WP-NNN:`.)

---

## Guardrails

- `heroKeywords.ts`, `heroAbility.types.ts`, `heroAbility.setup.ts`, `data/cards/**`, `game.ts`, the villain executor, and every move file — **zero diff**.
- `HERO_EFFECT_HANDLERS` is never written into `G`, a hook, or a descriptor (functions stay outside `G`; `G` stays JSON-serializable).
- No `.reduce()` in dispatch or any handler; `for`/`for...of` only.
- No `Math.random()` / clock / IO introduced; randomness stays via the existing `ShuffleProvider`.
- Unknown keyword → the exact prior `default` behavior (warn-or-skip), never throw.
- This is a MOVE, not a rewrite: do not merge, simplify, reorder, or "improve" any case body during extraction.

---

## Required `// why:` Comments

- At `HERO_EFFECT_HANDLERS`: cite D-24022 — mirrors WP-009B's ImplementationMap; handlers live outside `G`; a new effect is a map entry + drift-test entry, not a switch edit; the union stays typed/drift-detected (`Partial<Record<HeroKeyword,…>>`).
- At the `executeSingleEffect` unknown-handler branch: cite that this preserves the prior `default` warn/skip exactly (no new throw).
- At the registry drift test: cite that a keyword in the map but not the executed set (or vice versa) fails here.

---

## Files to Produce

- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — type + registry + map-dispatch; no `switch (effect.type)`.
- `packages/game-engine/src/hero/heroEffects.handlers.ts` — **new (optional)** — extracted handlers if it keeps functions one-screen each; otherwise inline and omit.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — registry drift test + behavior-identity coverage; existing assertions unchanged.
- Governance: `STATUS.md`, `DECISIONS.md` (D-24022), `WORK_INDEX.md` (WP-251 ✅), `EC_INDEX.md` (EC-282 Done), `05-ROADMAP-MINDMAP.md` (node under Hero Ability Coverage & Markup Pipeline).

---

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail; pre-existing `heroEffects.execute.test.ts` assertions unmodified.
- [ ] `Select-String -Path packages\game-engine\src\hero\heroEffects.execute.ts -Pattern "switch \(effect.type\)|switch \(keyword\)"` → no output.
- [ ] Registry drift test asserts **bidirectionally** that `Object.keys(HERO_EFFECT_HANDLERS)` equals the exported `MVP_KEYWORDS` (15 keys; `wound`/`conditional` absent from both).
- [ ] `pnpm -r build` then `pnpm sim:coverage --check` → exit 0, same `OK` line as the baseline (behavior identity at corpus level).
- [ ] `git diff --name-only -- packages/game-engine/src/rules/heroKeywords.ts packages/game-engine/src/rules/heroAbility.types.ts packages/game-engine/src/setup/heroAbility.setup.ts data/cards/` → empty.
- [ ] `git diff --name-only` → only `packages/game-engine/src/hero/**` + governance files.
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-251 node present).

---

## Common Failure Smells

- `pnpm sim:coverage --check` non-zero after the refactor → behavior changed; a case body was altered during the move. Revert to verbatim.
- A pre-existing `heroEffects` test needs editing to pass → the refactor changed behavior; it must not.
- `heroKeywords.ts` / `heroAbility.types.ts` / parser / `data/cards/**` in the diff → out of scope; revert (vocabulary/parser changes are WP-252).
- A `switch` still present → dispatch wasn't fully moved to the registry.
- `JSON.stringify(G)` throws in a test → the handler map (a function container) leaked into `G`.
