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
- `koHeroEachPlayer` semantics: KO **exactly one** hero per player using deterministic auto-resolution (no filters, no conditions, no choice).
- **Player iteration contract (locked).** Derive the iteration order from `Object.keys(G.playerZones).sort()` (default JavaScript string compare → lexical ascending). Do NOT rely on `Object.keys` insertion order; do NOT use `Number()` conversion. For 1–5-player Legendary matches (boardgame.io string IDs `'0'`..`'N-1'`) lexical ascending equals numeric ascending, so this is observationally equal to the pre-existing `gainWoundEachPlayer` iteration; the explicit sort makes the determinism contract auditable.
- **Shared-resolver contract (MANDATORY).** A **single** per-player KO resolver exists; both `koHeroCurrentPlayer` and `koHeroEachPlayer` MUST call it. The existing `koHeroForCurrentPlayer(G, playerId)` at `villain/villainEffects.execute.ts` lines 193-220 is already structurally generic (its parameter is any player id); the implementation may rename/repurpose it (e.g., `koOneHeroForPlayer`) or extract a new helper, but a duplicated copy in the `koHeroEachPlayer` branch body is **FAIL**. The shared resolver MUST perform the `koCard` mutation itself; callers MUST NOT post-process or modify its output.
- Per-player resolution rule: discard before hand, then `ext_id` lexical ascending; **silent no-op** for a player with zero eligible heroes. **NOT VP-based** (D-18503). **NOT interactive.**
- `koHeroCurrentPlayer` is **behaviorally unchanged** (current-player only); only its callable identity (or the shared resolver it delegates to) is reused.
- This WP edits **no card data** and **no overlay script** — markers are WP-190's job.

## Guardrails
- No `@legendary-arena/registry` import; no `boardgame.io` import in `villainAbility.types.ts`
- No `.reduce()` in the executor branch; use `for...of` over players with a descriptive loop variable
- Moves never throw — `koHeroEachPlayer` silently skips a player with no eligible hero
- **MANDATORY shared resolver** — `koHeroCurrentPlayer` and `koHeroEachPlayer` MUST call one shared per-player resolution helper; a duplicated copy in the `koHeroEachPlayer` branch body is **FAIL** (00.6 §16.1; abstraction at the 2nd call site is correctness-critical because parity is the invariant). The shared resolver MUST perform the `koCard` mutation; callers MUST NOT post-process or modify its output.
- **Player iteration MUST sort** — derive iteration order from `Object.keys(G.playerZones).sort()` (default lexical ascending). Do NOT rely on `Object.keys` insertion order.
- Do NOT reorder the first five keywords; append `koHeroEachPlayer` at position 6 only
- Do NOT change `koHeroCurrentPlayer` semantics
- Do NOT add a VP-based or interactive resolution
- Do NOT add a second keyword (discard / filtered / magnitude) — KO-only expansion
- `G.villainAbilityHooks` / `G` stays JSON-serializable
- Drift-detection test MUST be updated from five to six entries; do NOT leave it asserting five

## Required `// why:` Comments
- `VILLAIN_EFFECT_KEYWORDS` canonical array: record the incremental-expansion governance clause (D-18901) — each-player vocabulary grows keyword-by-keyword only for unconditional magnitude-1 patterns; conditional/filtered each-player effects stay out of MVP
- `villainEffects.execute.ts` `koHeroEachPlayer` branch: why it iterates `Object.keys(G.playerZones).sort()` (lexical ascending — explicit sort makes determinism auditable; do not rely on insertion order); why it delegates to the shared resolver (parity with `koHeroCurrentPlayer`; D-18902); why it is auto-resolved not interactive and not VP-based (D-18503)
- The shared per-player KO resolver (renamed/repurposed or newly extracted): why both branches must resolve identically (single source of truth for KO targeting; replay determinism); why the resolver itself performs the `koCard` mutation (callers do not post-process its output, so the mutation site is uniform across branches)

## Files to Produce
- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — add `'koHeroEachPlayer'` to the union; append at position 6 of `VILLAIN_EFFECT_KEYWORDS`; update the array `// why:` with the D-18901 clause
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — add the `koHeroEachPlayer` dispatch branch; extract/reuse the shared per-player KO resolver; no change to the other four branches
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — drift-detection updated to six-entry array ↔ union
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — `koHeroEachPlayer` tests: multi-player KO (every player with ≥1 eligible hero loses exactly one; every player with zero eligible heroes is skipped without mutation), `koHeroCurrentPlayer` regression unaffected, **shared-resolver parity** on a single-player `G` (deep equality across `G.ko`, every player zone, `G.attachedBystanders`, `G.messages`), **determinism** (two dispatches against identical `G` produce identical per-player KO target `ext_id`s, identical `G.ko` mutation order, and identical `G.messages` sequence by deep equality)

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: `koHeroEachPlayer` present in `villainAbility.types.ts` (union + array) and `villainEffects.execute.ts`
- [ ] Grep: zero `@legendary-arena/registry` / `boardgame.io` matches in the modified engine files (pure-helper rule)
- [ ] **Shared-resolver structural grep.** `grep -nE "<resolverName>\(" packages/game-engine/src/villain/villainEffects.execute.ts` returns exactly **2 call sites** (one inside the `koHeroCurrentPlayer` case, one inside the `koHeroEachPlayer` case body); the function declaration is excluded by the `(` filter. `<resolverName>` is whatever the implementation chose (e.g., `koOneHeroForPlayer` if the existing `koHeroForCurrentPlayer` was renamed). If the count is not 2, the resolver is either duplicated, mis-named, or not wired into one of the branches.
- [ ] **Negative grep — no duplicated zone search in the `koHeroEachPlayer` branch.** `grep -nE "selectKoHeroTarget|moveCardFromZone" packages/game-engine/src/villain/villainEffects.execute.ts` returns matches ONLY inside the shared resolver, never inside the `koHeroEachPlayer` case body (audit the surrounding context to confirm). Matches inside the `koHeroEachPlayer` case = duplicated resolution = FAIL.
- [ ] **Shared-resolver parity test PASSES.** Given a single-player `G`, dispatching `koHeroCurrentPlayer` and dispatching `koHeroEachPlayer` produce identical post-state by deep equality across `G.ko`, every player zone (`hand`, `discard`, `inPlay`, `victory`, `deck`), `G.attachedBystanders`, and `G.messages`.
- [ ] **Determinism test PASSES.** Two dispatches of `koHeroEachPlayer` against an identical mock `G` produce identical KO target `ext_id`s for every player, identical mutation order in `G.ko`, and identical `G.messages` sequence (deep equality).
- [ ] `git diff --stat data/ scripts/` is empty (no card data, no overlay script touched)
- [ ] Drift-detection test passes on the six-entry array
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-18901..D-18902; `WORK_INDEX.md` WP-189 `[x]`; `EC_INDEX.md` EC-216 Done

## Common Failure Smells
- Adding a second keyword (`discardCardEachPlayer`, a filtered/magnitude variant) → KO-only scope violation; that is a separate WP
- Duplicating the per-player KO resolution instead of sharing one helper → 00.6 §16.1 violation + drift risk between the two branches; the shared-resolver parity test will fail. Surface tell: the `selectKoHeroTarget` / `moveCardFromZone` negative grep returns matches inside the `koHeroEachPlayer` case body
- Caller post-processing the shared resolver's output (e.g., the `koHeroEachPlayer` branch re-reads `G.ko` after each call to push a custom message) → mutation-location violation; the resolver owns the mutation, callers do not modify or augment it. The two branches must reach byte-identical post-state on a single-player `G`
- Inserting `koHeroEachPlayer` mid-array (shifting the first five) → breaks WP-187's executed markers + the overlay script's hardcoded copy; must append at position 6
- VP-based or interactive KO target selection → D-18503 violation; auto-resolve by zone (discard→hand) then ext_id lexical
- Iterating `Object.keys(G.playerZones)` without `.sort()` → relies on insertion order; replay-hash unstable if a future setup change reorders insertion. Lexical ascending via `.sort()` is the locked contract
- Sorting numerically (`Number(playerId)`) instead of lexically → contract drift; for 1–5 players the orderings coincide, but the WP locks lexical for auditability and robustness to future non-numeric ids
- `koHeroEachPlayer` throwing when a player has no hero → move-contract violation; silent skip
- Touching card data or `apply-effect-markers.mjs` → out-of-scope FAIL; markers are WP-190
- Forgetting to update the drift test from five to six → test FAIL surfaces immediately
- Changing `koHeroCurrentPlayer` while extracting the shared helper → regression; current-player branch must behave identically post-refactor (verified by the parity test on a single-player `G`)
