# EC-246 — Villain Hero Capture & Dynamic Attack Resolution (Execution Checklist)

**Source:** docs/ai/work-packets/WP-214-villain-hero-capture-and-dynamic-attack.md
**Layer:** Game Engine + Card Data

## Before Starting
- [ ] WP-185 complete — `executeVillainAbilities` exists in `villainEffects.execute.ts`
- [ ] WP-187 complete — `apply-effect-markers.mjs` + `villain-effect-markers.json` exist
- [ ] WP-191 complete — villain hooks key by zone-instance ext_id (`{set}-villain-{group}-{card}-NN`)
- [ ] WP-202 complete — `VILLAIN_EFFECT_KEYWORDS` has 7 entries (positions 0–6)
- [ ] WP-200 complete — `G.notableEvents` exists
- [ ] `G.attachedBystanders: Record<CardExtId, CardExtId[]>` exists in `types.ts`
- [ ] `G.cardStats` has `cost` and `fightCost` fields on `CardStatEntry`
- [ ] `G.hq` is a 5-tuple `[HqSlot, HqSlot, HqSlot, HqSlot, HqSlot]` (rightmost = index 4)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- G field: `villainAttachedHeroes: Record<CardExtId, CardExtId[]>` (mirrors `attachedBystanders`)
- Fight destination: player's **discard** pile (not victory)
- Escape destination: `G.ko` (KO pile)
- HQ rightmost index: `4`
- New keywords at positions 7, 8, 9: `captureHqHeroRightmost`, `captureHqHeroHighestCost`, `captureHqHeroLowestCost`
- `fightCostMode` values: `'static' | 'dynamic'` (closed 2-value union)
- Dynamic cost formula: `fightCostBase + sum(captured hero costs)`
- Dynamic cost reads `CardStatEntry.cost` (hero recruit cost) — NEVER `fightCost`
- `vAttack: "*"` → `fightCostMode: 'dynamic'`, `fightCostBase: 0`, `fightCost: 0`
- `vAttack: "N+"` → `fightCostMode: 'dynamic'`, `fightCostBase: N`, `fightCost: N`
- Tie-break for cost selectors: rightmost index (highest) wins
- HQ scan order: left→right (index 0 → 4); rightmost scan: index 4 → 0
- Null HQ slots: skipped by selector; all-null → safe no-op returning `null`
- Empty Hero Deck on refill: HQ slot stays `null`; no error
- `resolveFightCost` is the **single authoritative source** — UI MUST NOT recompute
- Capture atomicity: remove from HQ → attach to villain → refill HQ within single effect
- `villainAttachedHeroes[v]` entry deleted (not set to `[]`) when length reaches 0

## Guardrails
- `heroCapture.logic.ts` helpers are **pure** — no `ctx`, no randomness, no boardgame.io import
- `resolveFightCost` is **pure** — no `ctx`, always returns deterministic integer ≥ 0; guard `G.villainAttachedHeroes[v] ?? []` (entry is `undefined` when absent, not `[]`)
- Moves never throw — capture/award/KO return silently on empty inputs
- No hero ext_id may exist in more than one zone simultaneously
- `.reduce()` forbidden in zone operations or effect application — use `for...of`
- Capture keywords MUST NOT mutate player zones, `G.ko`, `G.attachedBystanders`, economy, or any G field outside `G.hq`, `G.heroDeck`, `G.villainAttachedHeroes`
- `fightVillain.ts` replaces `G.cardStats[cardId]?.fightCost ?? 0` with `resolveFightCost(G, cardId)` — patrol modifier stays additive on top
- Existing tests must not break — static villains return `fightCost` unchanged
- `buildCardStats` parser must guard `vAttack` for `undefined`/`null` before pattern matching (`"*"` / `"N+"` checks throw on `undefined`)

## Required `// why:` Comments
- `resolveFightCost`: why it reads `CardStatEntry.cost` (hero recruit cost), not `fightCost`
- `buildCardStats` `"*"` / `"N+"` parser: why `fightCostMode` defaults to `'static'`
- `awardAttachedHeroes`: why heroes go to discard (not victory) — card text "Gain that Hero"
- `koAttachedHeroesOnEscape`: why heroes go to KO pile on escape
- Each `captureHqHero*` keyword case: why the selector strategy (rightmost / highest / lowest)
- `villainAttachedHeroes` entry deletion: why delete vs set to `[]`

## Files to Produce
- `src/board/heroCapture.logic.ts` — **new** — captureHeroFromHq, awardAttachedHeroes, koAttachedHeroesOnEscape
- `src/board/heroCapture.logic.test.ts` — **new** — unit tests for capture helpers
- `src/economy/economy.resolve.ts` — **new** — resolveFightCost pure function
- `src/economy/economy.resolve.test.ts` — **new** — dynamic cost resolution tests
- `src/types.ts` — **modified** — add `villainAttachedHeroes` to `LegendaryGameState`
- `src/economy/economy.types.ts` — **modified** — add `fightCostMode` + `fightCostBase` to `CardStatEntry`
- `src/rules/villainAbility.types.ts` — **modified** — extend union + array (7 → 10)
- `src/villain/villainEffects.execute.ts` — **modified** — three new case branches
- `src/villain/villainEffects.execute.test.ts` — **modified** — tests for new keywords
- `src/economy/economy.logic.ts` — **modified** — handle `vAttack: "*"` and `"N+"` in `buildCardStats`
- `src/economy/economy.logic.test.ts` — **modified** — dynamic attack parsing tests
- `src/setup/buildInitialGameState.ts` — **modified** — initialize `villainAttachedHeroes: {}`
- `src/moves/fightVillain.ts` — **modified** — call awardAttachedHeroes + resolveFightCost
- `src/villainDeck/villainDeck.reveal.ts` — **modified** — call koAttachedHeroesOnEscape
- `src/ui/uiState.types.ts` — **modified** — project villainAttachedHeroes + resolved fight cost
- `src/ui/uiState.build.ts` — **modified** — build projection
- `scripts/convert-cards/inputs/villain-effect-markers.json` — **modified** — add HQ-capture markers
- `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — add 3 keywords to local array
- `data/cards/*.json` (bounded) — **modified** — injected `[effect:]` markers
- `docs/ai/DECISIONS.md` — **modified** — D-21401+ entries
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — status flip
- `docs/ai/STATUS.md` — **modified** — status entry

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] ≥ 25 net-new tests
- [ ] All existing tests pass (no regressions)
- [ ] `docs/ai/DECISIONS.md` updated (D-21401+)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/STATUS.md` updated
- [ ] Replay fixture re-pinned if hash shifts (behaviour-neutral)
- [ ] `grep -rn "villainAttachedHeroes" packages/game-engine/src/types.ts` returns ≥ 1 match
- [ ] `grep -c "captureHqHero" packages/game-engine/src/rules/villainAbility.types.ts` returns 3

## Common Failure Smells
- Dynamic cost returning `NaN` — two root causes: (1) reading `fightCost` instead of `cost` from captured hero, (2) iterating `undefined` instead of `[]` when villain has no attached heroes (missing `?? []` guard)
- Hero appearing in two zones after capture — atomicity broken; check HQ slot nulled before attach
- Patrol modifier doubling — `resolveFightCost` must NOT add patrol; `fightVillain.ts` adds patrol on top of the resolved base
- `villainAttachedHeroes` key mismatch — must use zone-instance ext_id (copy-indexed), not definition id
- Static villains returning wrong cost — `resolveFightCost` must fall through to `fightCost` for `'static'` mode
