# EC-216 — Villain Effect Vocabulary: `koHeroEachPlayer` (Execution Checklist)

**Source:** docs/ai/work-packets/WP-189-villain-effect-koheroeachplayer-vocabulary.md
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting
- [ ] **WP-185 landed** ✅ — `VILLAIN_EFFECT_KEYWORDS` (5 entries), `VillainEffectKeyword` union, `villain/villainEffects.execute.ts` executor with the `koHeroCurrentPlayer` branch + its deterministic resolution all exist. **HARD-STOP if missing → `BLOCKED: WP-185`.**
- [ ] WP-009A / WP-009B / WP-017 complete ✅ (`koCard` + zone helpers)
- [ ] Read WP-185 + EC-212 — the 5-keyword vocabulary, executor shape, and the D-18503 zone-priority KO resolution carry forward
- [ ] Read `packages/game-engine/src/rules/villainAbility.types.ts` (union + canonical array being extended)
- [ ] Read `packages/game-engine/src/villain/villainEffects.execute.ts` (executor; the `koHeroCurrentPlayer` branch + resolver are the model to reuse per-player)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0; test exits 0 (baseline)

## Locked Values (do not re-derive)
- Exactly **one** new keyword: `koHeroEachPlayer`. Vocabulary goes **5 → 6**.
- `VillainEffectKeyword` union gains `'koHeroEachPlayer'` as the **sixth** member.
- `VILLAIN_EFFECT_KEYWORDS` append position is **6 (end)**: `['gainWoundEachPlayer', 'gainWoundCurrentPlayer', 'koHeroCurrentPlayer', 'heroDeckTopToEscape', 'captureBystander', 'koHeroEachPlayer']`. The first five entries + order are **byte-identical** to WP-185 (WP-187's executed markers + the overlay script's hardcoded copy depend on this).
- `koHeroEachPlayer` semantics: for **each** player, KO **exactly one** hero, unconditional, no filter, deterministic.
- Player iteration order: **ascending player-ID order**.
- Per-player resolution: the **same shared helper** `koHeroCurrentPlayer` uses — discard before hand, then `ext_id` lexical ascending; **silent no-op** for a player with no hero. **NOT VP-based** (D-18503). **NOT interactive.**
- `koHeroCurrentPlayer` is **unchanged** (current-player only).
- This WP edits **no card data** and **no overlay script** — markers are WP-190's job.

## Guardrails
- No `@legendary-arena/registry` import; no `boardgame.io` import in `villainAbility.types.ts`
- No `.reduce()` in the executor branch; use `for...of` over players with a descriptive loop variable
- Moves never throw — `koHeroEachPlayer` silently skips a player with no eligible hero
- The two KO branches (`koHeroCurrentPlayer`, `koHeroEachPlayer`) MUST call **one shared** per-player resolution helper — no duplicated resolution logic (00.6 §16.1; abstract on the 2nd call site here because the logic is identical and correctness-critical)
- Do NOT reorder the first five keywords; append `koHeroEachPlayer` at position 6 only
- Do NOT change `koHeroCurrentPlayer` semantics
- Do NOT add a VP-based or interactive resolution
- Do NOT add a second keyword (discard / filtered / magnitude) — KO-only expansion
- `G.villainAbilityHooks` / `G` stays JSON-serializable
- Drift-detection test MUST be updated from five to six entries; do NOT leave it asserting five

## Required `// why:` Comments
- `VILLAIN_EFFECT_KEYWORDS` canonical array: record the incremental-expansion governance clause (D-18901) — each-player vocabulary grows keyword-by-keyword only for unconditional magnitude-1 patterns; conditional/filtered each-player effects stay out of MVP
- `villainEffects.execute.ts` `koHeroEachPlayer` branch: why it iterates players in ascending player-ID order and reuses the shared resolver (determinism + parity with `koHeroCurrentPlayer`; D-18902); why it is auto-resolved not interactive and not VP-based (D-18503)
- The shared per-player KO resolver (if newly extracted): why both branches must resolve identically (single source of truth for KO targeting; replay determinism)

## Files to Produce
- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — add `'koHeroEachPlayer'` to the union; append at position 6 of `VILLAIN_EFFECT_KEYWORDS`; update the array `// why:` with the D-18901 clause
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — add the `koHeroEachPlayer` dispatch branch; extract/reuse the shared per-player KO resolver; no change to the other four branches
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — drift-detection updated to six-entry array ↔ union
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — `koHeroEachPlayer` tests: multi-player KO, no-hero skip, determinism, `koHeroCurrentPlayer` unaffected, shared-resolver parity

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: `koHeroEachPlayer` present in `villainAbility.types.ts` (union + array) and `villainEffects.execute.ts`
- [ ] Grep: zero `@legendary-arena/registry` / `boardgame.io` matches in the modified engine files (pure-helper rule)
- [ ] `git diff --stat data/ scripts/` is empty (no card data, no overlay script touched)
- [ ] Drift-detection test passes on the six-entry array
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-18901..D-18902; `WORK_INDEX.md` WP-189 `[x]`; `EC_INDEX.md` EC-216 Done

## Common Failure Smells
- Adding a second keyword (`discardCardEachPlayer`, a filtered/magnitude variant) → KO-only scope violation; that is a separate WP
- Duplicating the per-player KO resolution instead of sharing one helper → 00.6 §16.1 violation + drift risk between the two branches
- Inserting `koHeroEachPlayer` mid-array (shifting the first five) → breaks WP-187's executed markers + the overlay script's hardcoded copy; must append at position 6
- VP-based or interactive KO target selection → D-18503 violation; auto-resolve by zone (discard→hand) then ext_id lexical
- Non-deterministic player iteration (e.g., unsorted `Object.keys`) → replay-hash instability; iterate ascending player-ID
- `koHeroEachPlayer` throwing when a player has no hero → move-contract violation; silent skip
- Touching card data or `apply-effect-markers.mjs` → out-of-scope FAIL; markers are WP-190
- Forgetting to update the drift test from five to six → test FAIL surfaces immediately
- Changing `koHeroCurrentPlayer` while extracting the shared helper → regression; current-player branch must behave identically post-refactor
