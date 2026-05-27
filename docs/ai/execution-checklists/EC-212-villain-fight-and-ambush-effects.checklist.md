# EC-212 — Villain & Henchman Fight + Ambush Effects (Execution Checklist)

**Source:** docs/ai/work-packets/WP-185-villain-fight-and-ambush-effects.md
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting
- [ ] WP-009A + WP-009B complete ✅ (rule hook contracts + pipeline)
- [ ] WP-014A + WP-014B complete ✅ (villain reveal pipeline + classification)
- [ ] WP-016 + WP-017 complete ✅ (`fightVillain` move; `koCard` / `gainWound` / bystander helpers)
- [ ] WP-021 + WP-022 complete ✅ (hero ability hook precedent — mirror its shape)
- [ ] WP-025 complete ✅ (`G.cardKeywords`; `buildCardKeywords.ts:detectAmbush`)
- [ ] Read `packages/game-engine/src/rules/heroAbility.types.ts` (precedent for `VillainAbilityHook`)
- [ ] Read `packages/game-engine/src/setup/heroAbility.setup.ts` (precedent for parser)
- [ ] Read `packages/game-engine/src/hero/heroEffects.execute.ts` (precedent for executor + MVP keyword discipline)
- [ ] Read `packages/game-engine/src/moves/fightVillain.ts` (Fight: fire site)
- [ ] Read `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` (Ambush: fire site; lines 203-228 deleted)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline)

## Locked Values (do not re-derive)
- `VillainAbilityTiming = 'onAmbush' | 'onFight'` — **two entries, this order**. `'onEscape'` is reserved for WP-186 and MUST NOT appear in this WP.
- `VILLAIN_ABILITY_TIMINGS = ['onAmbush', 'onFight'] as const`
- `VillainEffectKeyword` union = exactly five entries: `'gainWoundEachPlayer' | 'gainWoundCurrentPlayer' | 'koHeroCurrentPlayer' | 'heroDeckTopToEscape' | 'captureBystander'`
- `VILLAIN_EFFECT_KEYWORDS` canonical order = `['gainWoundEachPlayer', 'gainWoundCurrentPlayer', 'koHeroCurrentPlayer', 'heroDeckTopToEscape', 'captureBystander']`
- `VillainAbilityHook` interface: `{ cardId: CardExtId; timing: VillainAbilityTiming; keywords: VillainEffectKeyword[]; effects: VillainEffectKeyword[]; }`
- `G.villainAbilityHooks: Readonly<VillainAbilityHook[]>` — new field on `LegendaryGameState`
- `koHeroCurrentPlayer` auto-resolution order: lowest-VP hero in discard, then lowest-VP hero in hand, ties broken by ext_id lexically; silent no-op if neither
- Henchman ability text source: **group-level** `group.abilities[]` — fans out to every card-instance ext_id within the group
- Ambush dispatch is gated by `hasAmbush(cardId, G.cardKeywords ?? {})` — keep the fast pre-check
- Fight: fire site order: **after** bystander award, **before** message push, in `fightVillain.ts`
- Hardcoded `gainWound` Ambush placeholder at `villainDeck.reveal.ts:203-228` is **deleted**, not gated

## Guardrails
- No `@legendary-arena/registry` import in `villainAbility.types.ts`, `villainAbility.setup.ts`, or `villainEffects.execute.ts`
- No `boardgame.io` import in `villainAbility.types.ts` or `villainEffects.execute.ts`
- No `.reduce()` for multi-step branching; use `for...of` with descriptive loop variables
- Moves never throw — `executeVillainAbilities` returns `void` and silently no-ops on unknown effects
- Out-of-vocabulary effects safely no-op — no `console.warn`, no throw, no message push
- Per-copy hook objects are freshly constructed (no shared references across card-instance ext_ids per D-13502)
- Setup parser must handle henchman group-level ability text — read `group.abilities[]`, emit one hook per card-instance ext_id in the group
- `G.villainAbilityHooks` is JSON-serializable — no functions, no Maps, no Sets, no class instances
- Drift-detection tests are mandatory for both canonical arrays; bidirectional union ↔ array assertion

## Required `// why:` Comments
- `VILLAIN_ABILITY_TIMINGS` declaration: why drift-detection array exists (must match union exactly; adding `'onEscape'` requires WP-186)
- `VILLAIN_EFFECT_KEYWORDS` declaration: why this five-keyword vocabulary is the MVP lock (WP-185 §Non-Negotiable Constraints; expansion = future WP)
- `villainAbility.setup.ts` henchman group-level fan-out loop: why one ability text becomes N hooks (group-level shape in registry data; each card-instance ext_id needs its own hook entry per D-13502)
- `villainEffects.execute.ts` `koHeroCurrentPlayer` auto-resolution helper: why deterministic VP-ascending sort over discard then hand (replay determinism — interactive choice deferred per WP-185 §Out of Scope)
- `villainEffects.execute.ts` out-of-vocabulary switch default: why silent no-op rather than warn or throw (move contract — moves never throw; matches WP-022 hero-effects precedent for unsupported keywords)
- `fightVillain.ts` insertion point: why after bystander award and before message push (so a Fight `captureBystander` observes post-award pile state)
- `villainDeck.reveal.ts` Ambush replacement: why the hardcoded `gainWound` loop is deleted (per D-18504; D-2403 safe-skip note superseded for Ambush case)

## Files to Produce
- `packages/game-engine/src/rules/villainAbility.types.ts` — **new** — timing + effect keyword unions, canonical arrays, `VillainAbilityHook` interface, `getVillainHooksForCard` pure filter
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **new** — structural `VillainAbilityRegistryReader`; `buildVillainAbilityHooks(registry, matchConfig)` produces hook table; handles villain per-card AND henchman group-level shapes
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **new** — `executeVillainAbilities(G, ctx, cardId, timing)`; per-keyword switch; safe-skip default
- `packages/game-engine/src/types.ts` — **modified** — add `villainAbilityHooks: Readonly<VillainAbilityHook[]>` to `LegendaryGameState`; re-export new types
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — one new line: `G.villainAbilityHooks = buildVillainAbilityHooks(registry, matchConfig);` in the composition block
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** — add `executeVillainAbilities(G, ctx, cardId, 'onFight')` after Step 3b, before message push
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — replace lines 203-228 (hardcoded ambush wound loop) with a single `executeVillainAbilities(G, { ctx }, cardId, 'onAmbush')` call gated by `hasAmbush(...)`
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **new** — drift-detection (TIMINGS + EFFECT_KEYWORDS); `getVillainHooksForCard` query tests
- `packages/game-engine/src/setup/villainAbility.setup.test.ts` — **new** — Ambush + Fight detection; henchman group-level fan-out; structured markup extraction; free-text → empty effects; deterministic emission order
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **new** — per-effect-keyword behavior; fire-site integration via direct calls; safe-skip on empty piles; deterministic replay

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: zero `@legendary-arena/registry` matches in the three new engine files
- [ ] Grep: zero `boardgame.io` matches in `villainAbility.types.ts` and `villainEffects.execute.ts`
- [ ] Grep: zero `"gained a wound from Ambush"` matches anywhere in `packages/game-engine/src/villainDeck/`
- [ ] Grep: exactly one `executeVillainAbilities` match in `fightVillain.ts`; exactly one in `villainDeck.reveal.ts`
- [ ] `docs/ai/STATUS.md` updated with `### WP-185 Executed` block
- [ ] `docs/ai/DECISIONS.md` updated with D-18501..D-18504
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-185 flipped to `[x]` with completion date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-212 flipped to `Done`

## Common Failure Smells
- Adding `'onEscape'` to `VILLAIN_ABILITY_TIMINGS` "to get a head start on WP-186" → scope-creep FAIL; WP-186 owns that addition
- Wrapping the deleted Ambush hardcode in `if (false)` or a feature flag instead of deleting it → D-18504 violation
- Henchman ability text emitted as one hook for the group rather than fanning out to every card-instance ext_id → D-13502 aliasing precedent violation
- `koHeroCurrentPlayer` using `Math.random()` or seed-less first-card pick → determinism FAIL; auto-resolution must be VP-ascending + ext_id lexical tie-break
- Adding `console.warn` on out-of-vocabulary effects → WP-022 precedent violation; safe-skip means silent
- `executeVillainAbilities` throws on a missing `payload.cardId` or unknown cardId → move-contract FAIL; moves never throw
- Fight: fire site placed before bystander award → ordering FAIL; Fight `captureBystander` would observe pre-award state
- Setup parser reads `@legendary-arena/registry` instead of using local structural `VillainAbilityRegistryReader` → layer-boundary FAIL
- Adding a sixth effect keyword to satisfy a single card → vocabulary-lock violation; safe-skip is the correct response
- Aliasing the same `VillainAbilityHook` object across multiple card-instance ext_ids in a henchman group → D-13502 violation; each ext_id gets a freshly-constructed object literal
