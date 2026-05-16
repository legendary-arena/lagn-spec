# EC-169 — Turn Economy Piercing and Wounds Drawn (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-155-turn-economy-piercing-and-wounds-drawn.md`
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting

- [ ] WP-128 complete — `uiState.build.ts` lines 480–481 have `// SAFE-SKIP-WP128` markers for `piercing` and `woundsDrawn`
- [ ] `UITurnEconomyState.piercing: number` and `UITurnEconomyState.woundsDrawn: number` exist in `uiState.types.ts`
- [ ] `TurnEconomy` in `economy.types.ts` has exactly 4 fields: `attack`, `recruit`, `spentAttack`, `spentRecruit`
- [ ] `resetTurnEconomy()` in `economy.logic.ts` returns object with those 4 fields
- [ ] Confirm ONLY `gainWound` call sites affecting current player are: escape (~line 134) and Ambush (~line 173) — if others exist, STOP and extend scope
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)

- `TurnEconomy` new fields: `piercing: number` and `woundsDrawn: number` (integers >= 0)
- `resetTurnEconomy()` post-WP returns: `{ attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 }`
- `woundsDrawn` incremented only for **current player** — Ambush guard: `playerId === ctx.currentPlayer`
- `piercing` has no producer in MVP — always `0` in gameplay
- Projection: `gameState.turnEconomy.piercing` and `gameState.turnEconomy.woundsDrawn`
- Decision ID prefix: D-155xx
- Commit prefix: `EC-169:` (code), `SPEC:` (governance close)
- Replay `// why:` text: `WP-155 adds TurnEconomy.piercing and .woundsDrawn (01.5 cascade)`

## Guardrails

- Do NOT modify `gainWound` helper in `wounds.logic.ts` — increment at call sites only
- Ambush handler loops all players but only increments `woundsDrawn` for current player
- `piercing` field: add to type + reset only; `G.turnEconomy.piercing` MUST NOT be incremented anywhere in this WP
- Wound accounting: increment once per wound transferred to current player, immediately adjacent to transfer logic
- No `.reduce()` in any new or modified code
- `economy.logic.ts` is a pure helper — no `boardgame.io` imports
- Do not touch the `horrorsCount` safe-skip marker (that is WP-156 scope)
- `G` must remain JSON-serializable — both new fields are plain numbers
- 01.5 hash change must be attributable ONLY to new fields — no behavioral or sequencing changes

## Required `// why:` Comments

- Replay hash literal update: `// why: WP-155 adds TurnEconomy.piercing and .woundsDrawn (01.5 cascade)`
- Escape wound increment: `// why: track current player wound for UI economy projection`
- Ambush wound increment (current player guard): `// why: woundsDrawn tracks current player only — other players' Ambush wounds are not projected`

## Files to Produce

- `packages/game-engine/src/economy/economy.types.ts` — **modified** — add `piercing` and `woundsDrawn` fields
- `packages/game-engine/src/economy/economy.logic.ts` — **modified** — update `resetTurnEconomy()` return
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — increment at both call sites
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — graduate projections, remove 2 markers
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — projection assertions
- `packages/game-engine/src/economy/economy.logic.test.ts` — **modified** — `resetTurnEconomy` 6-field assertion
- `packages/game-engine/src/economy/economy.integration.test.ts` — **modified** — mock factory update
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — hash literal update

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count` returns 1 (only `horrorsCount` remains)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-155xx)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells

- Replay hash test fails unexpectedly → forgot 01.5 cascade (new G fields change hash)
- `woundsDrawn` overcounts in multiplayer → Ambush increments for all players instead of current only
- `woundsDrawn` does not increment → increment placed outside guarded current-player condition or misplaced relative to wound transfer
- `resetTurnEconomy` tests fail with property-count mismatch → forgot to add both new fields to return
- Economy integration tests fail → mock factory still returns 4-field object instead of 6
