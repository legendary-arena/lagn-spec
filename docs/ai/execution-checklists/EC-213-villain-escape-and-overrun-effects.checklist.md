# EC-213 — Villain & Henchman Escape + Overrun Effects (Execution Checklist)

**Source:** docs/ai/work-packets/WP-186-villain-escape-and-overrun-effects.md
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting
- [ ] **WP-185 landed** ✅ — `G.villainAbilityHooks` exists; `buildVillainAbilityHooks`, `executeVillainAbilities`, `VILLAIN_ABILITY_TIMINGS`, `VILLAIN_EFFECT_KEYWORDS` all exported from the engine package. **HARD-STOP: do not proceed if any of these is missing.**
- [ ] WP-009A / WP-009B / WP-014A / WP-014B / WP-015 / WP-017 complete ✅
- [ ] Read WP-185 + EC-212 in full — every locked value carries forward; this WP touches the same files
- [ ] Read `packages/game-engine/src/rules/villainAbility.types.ts` (the union being extended)
- [ ] Read `packages/game-engine/src/setup/villainAbility.setup.ts` (the parser being extended)
- [ ] Read `packages/game-engine/src/villain/villainEffects.execute.ts` (executor — NOT modified by this WP)
- [ ] Read `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — escape branch (the new fire site)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (post-WP-185 baseline)

## Locked Values (do not re-derive)
- `VillainAbilityTiming = 'onAmbush' | 'onFight' | 'onEscape'` — **three entries, this order**. The third entry is new in this WP.
- `VILLAIN_ABILITY_TIMINGS = ['onAmbush', 'onFight', 'onEscape'] as const` — order locked.
- `VILLAIN_EFFECT_KEYWORDS` is **unchanged from WP-185** — still exactly 5 entries: `'gainWoundEachPlayer' | 'gainWoundCurrentPlayer' | 'koHeroCurrentPlayer' | 'heroDeckTopToEscape' | 'captureBystander'`. **Adding a sixth here is FAIL.**
- `VillainAbilityHook` interface is unchanged.
- Parser prefix → timing map: `Ambush:` → `'onAmbush'` (WP-185); `Fight:` → `'onFight'` (WP-185); `Escape:` → `'onEscape'` (this WP); `Overrun:` → `'onEscape'` (this WP — v1 synonym).
- Escape fire site location: inside `if (pushResult.escapedCard !== null) { ... }` in `villainDeck.reveal.ts`, **appended after** `resolveEscapedBystanders` call (the bystander-release step). NO reordering of pre-existing operations.
- Pre-existing escape branch ordering (preserved exactly):
  1. Counter increment (`ENDGAME_CONDITIONS.ESCAPED_VILLAINS`)
  2. Append to `G.escapedPile`
  3. Generic current-player wound (`gainWound`)
  4. `resolveEscapedBystanders` (bystander release)
  5. **NEW:** `executeVillainAbilities(G, { ctx }, pushResult.escapedCard, 'onEscape')`
- `captureBystander` semantics under `onEscape`: attach 1 bystander from `G.piles.bystanders` to the **escaped card** (the card now in `G.escapedPile`, NOT to a card still in the city). Per D-18603.
- Generic per-escape wound (current player gains 1 wound when villain escapes the City) is **preserved**, NOT replaced by card-specific effects. They layer.

## Guardrails
- No `@legendary-arena/registry` import in any modified file
- No `boardgame.io` import in `villainAbility.types.ts`
- No `.reduce()` for multi-step branching
- Moves never throw — `executeVillainAbilities` returns `void` and silently no-ops on unknown effects (WP-185 contract carried forward)
- Out-of-vocabulary effects safely no-op
- The hardcoded WP-014A escape branch ordering MUST be preserved exactly (counter → escape-pile → wound → bystander release → new call)
- `'onOverrun'` MUST NOT appear in `VILLAIN_ABILITY_TIMINGS` — `Overrun:` is a synonym of `Escape:` in v1 per D-18602
- `VILLAIN_EFFECT_KEYWORDS` array length MUST remain 5; the executor file is NOT modified by this WP
- Per-copy hook objects freshly constructed (D-13502; carried from WP-185)
- The drift-detection test must be updated to the three-entry array; do NOT leave the test asserting two entries

## Required `// why:` Comments
- `VILLAIN_ABILITY_TIMINGS` declaration: update the `// why:` comment to note three entries with WP-186 introducing `'onEscape'`
- `villainAbility.setup.ts` prefix-detection branch for `Escape:` / `Overrun:`: why both prefixes emit the same timing (D-18602 — v1 synonym; printed `Overrun:` text on villain cards behaves identically to `Escape:`; distinct timing deferred to future scheme-text WP if needed)
- `villainDeck.reveal.ts` new fire-site call: why placed AFTER `resolveEscapedBystanders` (so a `captureBystander` Escape effect attaches a bystander to the post-release escaped card, per D-18603; placing before would attach to a card whose attached-bystanders are about to be released)
- `villainDeck.reveal.ts` retention of generic escape-wound: why the WP-015 legacy behavior is preserved (layering — card-specific Escape effects add on top, do not replace; rationale: the generic wound is a system-level escape penalty, the card-specific text is content-driven)

## Files to Produce
- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — extend `VillainAbilityTiming` union and `VILLAIN_ABILITY_TIMINGS` array to three entries; update `// why:` comment
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** — extend prefix detection to `Escape:` and `Overrun:` (both → `onEscape`); reuse existing markup-extraction logic
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — append one line inside the existing escape branch (after `resolveEscapedBystanders`): `executeVillainAbilities(G, { ctx }, pushResult.escapedCard, 'onEscape');`
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — drift-detection assertions extended to three-entry array
- `packages/game-engine/src/setup/villainAbility.setup.test.ts` — **modified** — add tests: `Escape:` detection → `onEscape`; `Overrun:` detection → `onEscape`; per-card and group-level shapes both covered
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — add `onEscape` dispatch tests covering each MVP effect keyword
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **modified** — add escape integration test: a villain with `Escape: Each player gains a Wound` text escapes; assert generic escape-wound + per-player ambush-style wound BOTH apply; bystander release ordering preserved

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (post-WP-185 baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: zero `@legendary-arena/registry` matches in any of the seven modified files
- [ ] Grep: zero `boardgame.io` matches in `villainAbility.types.ts`
- [ ] Grep: `'onEscape'` appears in `villainAbility.types.ts`; appears in `villainDeck.reveal.ts`; appears in test files
- [ ] Grep: `'Escape:'` and `'Overrun:'` both appear in `villainAbility.setup.ts`
- [ ] Grep: `executeVillainAbilities` count in `villainDeck.reveal.ts` is exactly 2 (one onAmbush from WP-185 + one onEscape from WP-186)
- [ ] Grep: zero `'onOverrun'` matches anywhere in `packages/game-engine/src/` (synonym lock)
- [ ] `VILLAIN_EFFECT_KEYWORDS` count remains 5 entries (effect-keyword vocabulary unchanged)
- [ ] `docs/ai/STATUS.md` updated with `### WP-186 Executed` block
- [ ] `docs/ai/DECISIONS.md` updated with D-18601..D-18603
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-186 flipped to `[x]` with completion date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-213 flipped to `Done`

## Common Failure Smells
- Adding a sixth entry to `VILLAIN_EFFECT_KEYWORDS` to handle a specific Escape card → vocabulary-lock violation; safe-skip is correct
- Introducing `'onOverrun'` as a distinct timing → D-18602 violation; v1 lock is synonym
- Placing the new `executeVillainAbilities` call BEFORE `resolveEscapedBystanders` → `captureBystander` would observe pre-release bystander state; D-18603 violation
- Replacing the generic escape-wound with card-specific Escape effects (rather than layering) → silently breaks WP-015 legacy behavior; locked-ordering violation
- Reordering or modifying any of the four pre-existing escape branch operations → out-of-scope FAIL
- Forgetting to update the drift-detection test from two entries to three → test FAIL surfaces immediately
- Adding `Overrun:` handling at the executor level (rather than at the parser level via synonym mapping) → architecture FAIL; the synonym lock is a parser-time fold, not an executor-time branch
- `executeVillainAbilities` throws on a missing `pushResult.escapedCard` (null) → move-contract FAIL; the guarding `if` already filters null, but defensive code that throws is still wrong
- Touching `villainEffects.execute.ts` to add an `onEscape` branch → out-of-scope FAIL; the executor is timing-agnostic and dispatches by hook lookup, NOT by timing-specific code paths
