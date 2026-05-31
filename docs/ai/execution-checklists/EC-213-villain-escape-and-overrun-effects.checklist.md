# EC-213 — Villain & Henchman Escape + Overrun Effects (Execution Checklist)

**Source:** docs/ai/work-packets/WP-186-villain-escape-and-overrun-effects.md
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting
- [ ] **WP-185 landed** ✅ — `G.villainAbilityHooks` exists; `buildVillainAbilityHooks`, `executeVillainAbilities`, `VILLAIN_ABILITY_TIMINGS`, `VILLAIN_EFFECT_KEYWORDS` all exported. **HARD-STOP if missing.**
- [ ] **WP-188 landed** ⛔ HARD BLOCKER — escape/overrun `[effect:]` markers exist in card data. Verify with `grep -rnE "(Escape|Overrun):.*\[effect:" data/cards/` (alternation matches BOTH prefixes so the gate does not falsely report "blocked" if WP-188 marked only `Overrun:` lines, or only `Escape:` lines); if it returns nothing, **STOP and report `BLOCKED: WP-188`**. Wiring the `onEscape` pipeline against marker-free escape data fires on nothing (dead WP).
- [ ] **WP-191 landed** ⛔ DoD GATE — villain ext_id grammar reconciliation (D-18704..D-18708 close D-18508) MUST be present so the §Files #7c real-registry villain end-to-end test can pass. Verify with `git log --oneline --grep "WP-191" origin/main | head -1` (expect a match) AND a spot grep for the keying invariant test added by WP-191. If absent, the wiring + synthetic-hook work (§Files #7a, #7b) is implementable but DoD cannot be claimed — **STOP and report `BLOCKED: WP-191`** rather than ship a partial-coverage close. WP-186's fire site is structurally correct without WP-191; the gate is about end-to-end verifiability, not wiring correctness.
- [ ] WP-009A / WP-009B / WP-014A / WP-014B / WP-015 / WP-017 complete ✅
- [ ] Read WP-185 + EC-212 in full — every locked value carries forward; this WP touches the same files and the same `[effect:]` marker model
- [ ] Read DECISIONS.md **D-18508 + D-18704..D-18708** — D-18508 (villain ext_id grammar gap) is CLOSED by WP-191 ✅ (landed 2026-05-30 at `20de3ae`). Per-card lookup tables are now keyed by zone-instance ext_id, so villain `onEscape` hook lookups resolve end-to-end on real cards. Henchman escapes always fired. Synthetic-hook tests still prove the wiring; the new Files #7c real-registry test verifies the reconciled grammar is consumed correctly. Do NOT re-derive the grammar or treat real-villain firing as a regression — it should work.
- [ ] Read WP-188 + EC-215 — the upstream data WP; its `_unassigned` block documents what WP-186 safe-skips (esp. the each-player-KO cluster)
- [ ] Read `packages/game-engine/src/rules/villainAbility.types.ts` (timing union being extended)
- [ ] Read `packages/game-engine/src/setup/villainAbility.setup.ts` (parser — reads `[effect:]` markers generically; this WP adds prefix detection only)
- [ ] Read `packages/game-engine/src/villain/villainEffects.execute.ts` (executor — NOT modified by this WP; dispatch is by hook lookup, not timing)
- [ ] Read `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — escape branch (the new fire site)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0; test exits 0 (post-WP-185 baseline)

## Locked Values (do not re-derive)
- `VillainAbilityTiming = 'onAmbush' | 'onFight' | 'onEscape'` — **three entries, this order**. The third entry is new in this WP.
- `VILLAIN_ABILITY_TIMINGS = ['onAmbush', 'onFight', 'onEscape'] as const` — order locked.
- `VILLAIN_EFFECT_KEYWORDS` is **unchanged from WP-185** — still exactly five entries: `'gainWoundEachPlayer' | 'gainWoundCurrentPlayer' | 'koHeroCurrentPlayer' | 'heroDeckTopToEscape' | 'captureBystander'`. **Adding a sixth here is FAIL.**
- `VillainAbilityHook` interface is unchanged.
- **Detection model (same as WP-185):** effects come from `[effect:<VillainEffectKeyword>]` markers on the line (authored by WP-188), NOT from `[icon:]` / `[keyword:]` / free-text. WP-186 adds ONLY prefix→timing detection.
- Parser prefix → timing map (case-insensitive, leading whitespace trimmed): `Ambush:` → `onAmbush` (WP-185); `Fight:` → `onFight` (WP-185); `Escape:` → `onEscape` (this WP); `Overrun:` → `onEscape` (this WP — v1 synonym).
- Escape fire site: inside `if (pushResult.escapedCard !== null) { ... }` in `villainDeck.reveal.ts`, **appended after** `resolveEscapedBystanders`. NO reordering of pre-existing operations.
- Pre-existing escape branch ordering (preserved exactly): (1) counter increment `ENDGAME_CONDITIONS.ESCAPED_VILLAINS`; (2) append to `G.escapedPile`; (3) generic current-player wound (`gainWound`); (4) `resolveEscapedBystanders`; (5) **NEW** `executeVillainAbilities(G, ctx, pushResult.escapedCard, 'onEscape')`.
- **Escape resolves before Ambush (cross-branch ordering lock):** within one reveal the escape branch (`onEscape` fire site) runs **before** the city-entry `hasAmbush(...)` block (`onAmbush` fire site for the entering card), per the canonical Reveal → Fight → Side-Effect ordering. This holds today by sequential structure in `performVillainReveal`; do NOT reorder the two fire sites. The `reveal.test.ts` ordering test (Files to Produce #7b) pins it.
- Generic per-escape current-player wound (WP-015) is **preserved**, NOT replaced — card-specific effects layer on top.
- `captureBystander` under `onEscape` attaches to the **escaped card** now in `G.escapedPile` (D-18603) — the fire site runs after the escaping card's bystanders are released.
- `koHeroCurrentPlayer` auto-resolution (if reached via an escape marker): zone-priority (discard before hand), then `ext_id` lexical — **NOT VP-based** (D-18503; per-card VP not in engine runtime state). Inherited from WP-185.
- **Each-player-KO escape lines are NOT in the MVP vocabulary** (D-18802) — WP-188 leaves them marker-free with `reason: "no-vocabulary-keyword"`; WP-186 safe-skips them (`effects: []`). Do NOT add an each-player-KO keyword or branch — that is WP-189 (engine keyword) + WP-190 (curation), both drafted, downstream of this WP.
- **WP-191 consumption (D-18508 CLOSED).** Per-card lookup tables are keyed by zone-instance ext_id (D-18704..D-18708). At the escape fire site `pushResult.escapedCard` IS the zone-instance ext_id the lookup expects. Villain `onEscape` hook lookups resolve end-to-end on real cards. The new Files #7c real-registry test pins this; if it fails, investigate WP-191's reconciliation as the first hypothesis (NOT a pre-existing limitation to dismiss).

## Guardrails
- No `@legendary-arena/registry` import in any modified file; no `boardgame.io` import in `villainAbility.types.ts`
- No `.reduce()` for multi-step branching
- Moves never throw — `executeVillainAbilities` returns `void` and silently no-ops on empty/unknown effects (WP-185 contract carried forward)
- Call signature: pass the **local `ctx`** (`= context.ctx`, the `{ currentPlayer }` object) as the 2nd arg — exactly as the WP-185 `onAmbush` call does (`executeVillainAbilities(G, ctx, cardId, 'onAmbush')`). Do NOT wrap it as `{ ctx }`; the executor reads `ctx.currentPlayer` directly, so wrapping resolves `currentPlayer` to `undefined`
- The parser change is **prefix detection only** — do NOT add `[icon:]` / `[keyword:]` / free-text effect parsing; reuse WP-185's `[effect:]` marker reader unchanged
- `'onOverrun'` MUST NOT appear in `VILLAIN_ABILITY_TIMINGS` — `Overrun:` is a synonym of `Escape:` per D-18602
- `VILLAIN_EFFECT_KEYWORDS` array length MUST remain 5; the executor file (`villainEffects.execute.ts`) is NOT modified — dispatch is by per-card hook lookup, not by a timing-specific branch
- The pre-existing WP-014A/WP-015 escape branch ordering MUST be preserved exactly (counter → escape-pile → generic wound → bystander release → new call)
- Per-copy hook objects freshly constructed (D-13502; carried from WP-185)
- The drift-detection test must be updated from two entries to three; do NOT leave it asserting two

## Required `// why:` Comments
- `VILLAIN_ABILITY_TIMINGS` declaration: update the `// why:` comment to note three entries, WP-186 introducing `'onEscape'`
- `villainAbility.setup.ts` prefix-detection branch for `Escape:` / `Overrun:`: why both prefixes emit the same `onEscape` timing (D-18602 — v1 synonym; printed villain `Overrun:` behaves like `Escape:`; distinct `'onOverrun'` deferred to a future scheme-text WP); and why detection is prefix-only while effects still come from `[effect:]` markers (same model as WP-185)
- `villainDeck.reveal.ts` new fire-site call: why placed AFTER `resolveEscapedBystanders` (so a `captureBystander` escape effect attaches to the post-release escaped card per D-18603); and why the generic WP-015 escape wound is preserved above it (system-level penalty; card text layers on top)
- (No `// why:` needed in `villainEffects.execute.ts` — it is not modified)

## Files to Produce
- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — extend `VillainAbilityTiming` union + `VILLAIN_ABILITY_TIMINGS` array to three entries; update `// why:`
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** — extend prefix detection to `Escape:` / `Overrun:` (both → `onEscape`); reuse the existing `[effect:]` marker reader; add no new markup namespace
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — append one line inside the existing escape branch (after `resolveEscapedBystanders`): `executeVillainAbilities(G, ctx, pushResult.escapedCard, 'onEscape');`
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — drift-detection extended to three-entry array
- `packages/game-engine/src/setup/villainAbility.setup.test.ts` — **modified** — `Escape:` + `Overrun:` prefix detection → `onEscape`; per-card + group-level; marker-present (effects populated) and marker-absent (effects empty) cases
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — add `onEscape` dispatch tests (esp. `gainWoundEachPlayer`); include a `captureBystander`-under-`onEscape` test asserting attachment to the escaped card's ext_id in `G.attachedBystanders` (D-18603 — the executor auto-awards a captured bystander only on `onFight`, so under `onEscape` it stays attached)
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **modified** — (a) escape integration test: escaped card carrying `[effect:gainWoundEachPlayer]` fires (all players wounded) AND generic current-player escape wound + bystander release + counter + escape-pile push all still occur in order; (b) **escape-before-Ambush ordering test (#7b)** — one reveal that both escapes a prior occupant (`onEscape` marker) AND brings in an entering card (`onAmbush` marker), proving `onEscape` resolves first. The executor pushes no per-effect `G.messages`, so use a non-commutative observable: a **finite wound pool** contended by an asymmetric pair (escaped card `[effect:gainWoundCurrentPlayer]`, entering card `[effect:gainWoundEachPlayer]`), `G.piles.wounds` sized to exhaust partway, so escape-first vs ambush-first yields different per-player wound counts. The test FAILS if the Ambush fire site is moved before the escape branch; (c) **real-registry villain end-to-end (#7c)** — build initial game state via `buildInitialGameState` against the real registry, escape a real villain whose `Escape:` line carries `[effect:gainWoundEachPlayer]` (authored by WP-188), assert every player's wound count increases. Villain identified by zone-instance ext_id (`{set}-villain-{group}-{card}-NN`) — same grammar WP-191 keys lookups by. Pair with a henchman end-to-end escape for symmetry. This is the test that would FAIL under the old D-18508 grammar gap and PASSES under WP-191's reconciliation.
- `docs/ai/STATUS.md` — **modified** — add `### WP-186 Executed` summary block (per WP-186 DoD).
- `docs/ai/DECISIONS.md` — **modified** — add D-18601..D-18603 (per WP-186 DoD).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — flip WP-186 row to `[x]` with completion date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip EC-213 row to `Done`.

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (post-WP-185 baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: zero `@legendary-arena/registry` matches in any modified file; zero `boardgame.io` in `villainAbility.types.ts`
- [ ] Grep: `'onEscape'` appears in `villainAbility.types.ts`, `villainDeck.reveal.ts`, and test files
- [ ] Grep: `escape:` and `overrun:` prefix detection both present in `villainAbility.setup.ts`
- [ ] Grep: `villainDeck.reveal.ts` contains one `executeVillainAbilities(..., 'onEscape')` call in the escape branch and one `executeVillainAbilities(..., 'onAmbush')` call in the city-entry Ambush branch (no other `executeVillainAbilities` call introduced by WP-186)
- [ ] Grep: zero `'onOverrun'` matches anywhere in `packages/game-engine/src/` (synonym lock)
- [ ] `git diff --stat packages/game-engine/src/villain/villainEffects.execute.ts` is empty (executor untouched)
- [ ] `VILLAIN_EFFECT_KEYWORDS` array intact at five entries — the drift-detection test is authoritative for the count; sanity-check the declaration line `VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword[] = [` is unchanged (do NOT rely on a raw `grep -c "VILLAIN_EFFECT_KEYWORDS"` substring count — comments/type-name references make it brittle)
- [ ] Files #7c real-registry villain end-to-end test PASSES (villain `onEscape` fires on a real villain card; WP-191 reconciliation consumed correctly). Paired henchman end-to-end test also passes.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-18601..D-18603; `WORK_INDEX.md` WP-186 `[x]`; `EC_INDEX.md` EC-213 Done

## Common Failure Smells
- Executing before WP-188 lands → `onEscape` hooks all carry `effects: []`; pipeline fires on nothing (dead WP). The HARD BLOCKER grep prevents this.
- Adding a sixth `VILLAIN_EFFECT_KEYWORDS` entry (e.g. `koHeroEachPlayer`) to cover the dominant escape pattern → vocabulary-lock violation; that is a separate WP-185-side WP (D-18802 defers it)
- Forcing an each-player-KO escape line onto `koHeroCurrentPlayer` → semantics FAIL; it stays marker-free and safe-skips
- Introducing `'onOverrun'` as a distinct timing → D-18602 violation; v1 lock is synonym
- Adding `[icon:]` / `[keyword:]` / free-text parsing in the parser → model violation; WP-186 reads the same `[effect:]` markers as WP-185, prefix detection only
- Placing the new `executeVillainAbilities` call BEFORE `resolveEscapedBystanders` → `captureBystander` observes pre-release state; D-18603 violation
- Moving the city-entry Ambush fire site (`hasAmbush(...)` block) ahead of the escape branch, or otherwise letting the entering card's `onAmbush` resolve before the escaped card's `onEscape` → inverts the canonical Reveal → Fight → Side-Effect ordering; the #7b ordering test catches it
- Replacing the generic WP-015 escape wound with card-specific effects (instead of layering) → silently breaks legacy behavior; locked-ordering violation
- Modifying `villainEffects.execute.ts` to add an `onEscape` branch → out-of-scope FAIL; the executor is timing-agnostic (dispatches by hook lookup)
- Re-deriving a VP-based KO sort → D-18503 violation; order by zone (discard→hand) then ext_id lexical
- Forgetting to update the drift-detection test from two entries to three → test FAIL surfaces immediately
- Treating a real-game villain `onEscape` no-op as the pre-existing D-18508 limitation → STALE; WP-191 ✅ closed D-18508 at `20de3ae`. A real-villain `onEscape` no-op is now a regression (likely either Files #7c not implemented or WP-191's reconciliation not consumed at the fire site) — investigate, do NOT dismiss. Synthetic-hook tests still author hooks keyed to the escaped instance; the new #7c real-registry test asserts end-to-end firing against the WP-191-reconciled grammar
- Wrapping the executor's 2nd arg as `{ ctx }` instead of passing the local `ctx` → executor reads `ctx.currentPlayer` and gets `undefined`; match the WP-185 `onAmbush` call exactly
