# EC-252 — Hero Reveal Attack-Choose Executor (Execution Checklist)

**Source:** docs/ai/work-packets/WP-220-hero-reveal-attack-choose-executor.md
**Layer:** Game Engine + Offline Tooling + Card Data
**Status:** Draft — pre-flight READY + copilot PASS recorded in WP-220 (2026-06-06); ready for execution

## Before Starting

- [ ] WP-219 merged to origin/main — commit `dc6df11` present in `git log`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — baseline **1144** passing
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `git diff --name-only data/cards/ packages/game-engine/` — empty (clean baseline)
- [ ] `HERO_KEYWORDS` has exactly 13 entries before this session starts
- [ ] `G.pendingHeroChoice` does NOT exist in `LegendaryGameState` before execution

## Locked Values (do not re-derive)

- New keyword string: `'reveal-attack-choose'` (exact form)
- Token form: `[keyword:reveal-attack-choose:N]` — magnitude required; no bare form
- `PendingHeroChoice.choiceType` discriminant: `'discard-or-return'`
- `resolveHeroChoice` move signature: `resolveHeroChoice({ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs): void` — `(context, args)` shape (NOT positional); `ResolveHeroChoiceArgs.resolution` ∈ `'discard'` | `'return'`
- Absent-value form for `G.pendingHeroChoice`: **`undefined`** (locked — matches `villainRevealedThisTurn?: boolean` and all other optional G fields; `null` is never used)
- Attack grant condition: `cardStats.cost <= effect.magnitude`
- Attack grant amount: `G.turnEconomy.attack += cardStats.cost`
- Turn-end guard sites (**BOTH required**): (a) `coreMoves.impl.ts` — top of `endTurn()`, after the stage-gate check and **before** the inPlay/hand→discard sweep; (b) `game.ts` — `advanceStage()`, guard `G.currentStage === 'cleanup' && G.pendingHeroChoice !== undefined` before delegating to `advanceTurnStage`. The `endTurn`-only guard is insufficient: `advanceStage` reaches `events.endTurn()` via `turnLoop.ts` at cleanup.
- HERO_KEYWORDS count after: **14**

## Guardrails

- `reveal-attack-choose` MUST NOT be in `NO_MAGNITUDE_KEYWORDS` — it requires a valid magnitude
- `G.pendingHeroChoice` is set ONLY in the `reveal-attack-choose` executor case
- `G.pendingHeroChoice` is cleared ONLY in `resolveHeroChoice`
- If `G.pendingHeroChoice !== undefined` at executor entry, the executor MUST return silently
  without overwriting it (reject-second policy, D-22001)
- `G.pendingHeroChoice` is assigned AFTER the `G.turnEconomy` guard — if `G.turnEconomy` is
  undefined the pending field is NOT set; the ordering is load-bearing
- `resolveHeroChoice` MUST use the `(context, args)` move signature (`{ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs`) — NOT a positional `(G, ctx, playerID, resolution)` signature, which boardgame.io 0.50.x mis-binds
- `resolveHeroChoice` MUST clear the pending field before returning, even when the zone move fails
- BOTH turn-end callsites MUST guard `G.pendingHeroChoice !== undefined` (`undefined` is the only locked absent-value form — do not use `null`):
  - `coreMoves.impl.ts` `endTurn()`: guard at the TOP, after the stage gate, BEFORE the inPlay/hand→discard sweep (a guard after the sweep would discard the hand without ending the turn)
  - `game.ts` `advanceStage()`: guard `G.currentStage === 'cleanup' && G.pendingHeroChoice !== undefined` before delegating to `advanceTurnStage`
- `isRevealAttackChooseCandidate` MUST require the reveal anchor AND the `Discard it or put it back` phrase
- `isRevealAttackChooseCandidate` MUST route BEFORE `isRevealCostAttackCandidate` in `collectProposeRowsForSet`
- `assertValidToken` MUST reject `[keyword:reveal-attack-choose]` (no magnitude) and `[keyword:reveal-attack-choose:0]`
- No `.reduce()` in zone operations; no direct G mutation outside Immer draft context

## Required `// why:` Comments

- `heroKeywords.ts`, `'reveal-attack-choose'` entry: cite D-22003
- `heroEffects.execute.ts`, `reveal-attack-choose` case opening: cite D-22003 with full-sentence description
- `resolveHeroChoice` move, pending-clear line: cite D-22002
- `endTurn()` turn-end guard (`coreMoves.impl.ts`): cite D-22002 with full-sentence explanation
- `advanceStage()` cleanup-stage guard (`game.ts`): cite D-22002 with full-sentence explanation

## Files to Produce

- `packages/game-engine/src/types.ts` — **modified** — `PendingHeroChoice` + `pendingHeroChoice?`
- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — add `'reveal-attack-choose'`
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — executor case + MVP_KEYWORDS
- `packages/game-engine/src/moves/heroChoice.resolve.ts` — **new** — `resolveHeroChoice` move + `ResolveHeroChoiceArgs` payload type
- `packages/game-engine/src/game.ts` — **modified** — import + `moves:` registration (`{ move: resolveHeroChoice, client: false }`) + `advanceStage` cleanup-stage pending-choice guard
- `packages/game-engine/src/moves/coreMoves.impl.ts` — **modified** — turn-end guard at the top of `endTurn()` (before the zone sweep)
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — ≥9 executor cases
- `packages/game-engine/src/moves/heroChoice.resolve.test.ts` — **new** — ≥8 resolveHeroChoice + turn-end-guard cases (both `endTurn` and `advanceStage`), co-located with the move
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — 13 → 14 drift test
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — pattern + detection + routing
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — 1 new entry
- `data/cards/2099.json` — **modified** — overhorns-and-underhorns markup
- `docs/ai/DECISIONS.md` — **modified** — D-22001..D-22003 Active
- `docs/ai/STATUS.md` — **modified**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified**
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified**

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0, count ≥ **1161**
- [ ] `pnpm -r build` exits 0
- [ ] `G.pendingHeroChoice` field present in `LegendaryGameState` with correct optional type (`PendingHeroChoice | undefined`)
- [ ] `resolveHeroChoice` uses `(context, args)` signature with `ResolveHeroChoiceArgs.resolution`
- [ ] `resolveHeroChoice` registered in `game.ts` `moves:` map as `{ move: resolveHeroChoice, client: false }`
- [ ] `resolveHeroChoice({...}, { resolution: 'discard' })` moves card deck→discard; clears pending
- [ ] `resolveHeroChoice({...}, { resolution: 'return' })` no-ops zone; clears pending
- [ ] `endTurn` move blocked (no `events.endTurn()`, hand NOT swept) while `G.pendingHeroChoice` is set
- [ ] `advanceStage` move at cleanup blocked (no `events.endTurn()`, `currentStage` stays `cleanup`) while `G.pendingHeroChoice` is set
- [ ] `grep "\[keyword:reveal-attack-choose:4\]" data/cards/2099.json | wc -l` = 1
- [ ] `--validate` exits 0
- [ ] D-22001..D-22003 Active in DECISIONS.md
- [ ] HERO_KEYWORDS count = 14 (drift-detection test passes)
- [ ] `assertValidToken` rejects bare form and `:0` form (`[1-9]\d*` pattern in `VALID_TOKEN_PATTERN`)
- [ ] No files outside §Files Expected to Change modified

## Common Failure Smells

- Test count < 1161 → turn-end guard test missing, resolveHeroChoice test file not wired to test runner, or `game.ts` registration test absent
- `resolveHeroChoice` not callable from client → `game.ts` registration missing or `client: true` instead of `client: false`
- `G.pendingHeroChoice` set even on empty deck → guard fires after pending assignment; reorder guards before the pending set
- `G.pendingHeroChoice` set when `G.turnEconomy` is undefined → turnEconomy guard is missing or placed after the pending assignment; move it before
- Second `reveal-attack-choose` call overwrites first pending choice → reject-second guard (`if (G.pendingHeroChoice !== undefined) { break; }`) is missing
- `G.pendingHeroChoice` not cleared when `moveResult.found = false` → clear-before-return invariant violated
- Attack granted for cost-5 card with magnitude-4 → cost-ceiling condition inverted; must be `cost <= magnitude`
- `isRevealAttackChooseCandidate` matches plain `reveal-cost-attack` lines → missing Discard-or-return phrase check
- `--propose` shows 0 rows for overhorns → reveal anchor regex doesn't match actual card text; run `--propose` and inspect before editing curated map
- Turn ends via "Pass Priority" (`advanceStage`) at cleanup with a pending choice → the `advanceStage` guard in `game.ts` is missing; the `endTurn`-move guard alone does NOT cover the `advanceStage` → `advanceTurnStage` → `events.endTurn()` path
- Hand vanishes when turn-end is blocked → `endTurn` guard placed after the inPlay/hand→discard sweep instead of at the top; move it before the sweep
- `resolveHeroChoice` never resolves / `resolution` is undefined at runtime → positional `(G, ctx, playerID, resolution)` signature used; must be `({ G, playerID }: MoveContext, args: ResolveHeroChoiceArgs)`
- Turn still ends with pending choice outstanding → a guard is checking the wrong field name or wrong nullish check, or only one of the two callsites is guarded
