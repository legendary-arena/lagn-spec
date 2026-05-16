# EC-167 — Mastermind Attached Bystanders (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-154-mastermind-attached-bystanders.md`
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting

- [ ] WP-128 complete — `uiState.build.ts` has `// SAFE-SKIP-WP128` at mastermind attached bystanders site
- [ ] `UIMastermindState.attachedBystanders: UIDisplayEntry[]` exists in `uiState.types.ts`
- [ ] `MastermindState` exists with fields: `id`, `baseCardId`, `tacticsDeck`, `tacticsDefeated`
- [ ] `mastermindStrikeHandler` exists in `mastermindHandlers.ts`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)

- Top-of-zone = index `0` (matches villain deck reveal: `deck[0]`)
- `UIDisplayEntry` shape: `{ extId: string; display: UICardDisplay }` (WP-128)
- `G.messages` type: `string[]` — plain strings only; empty-supply message prefix: `[Master Strike]`
- `MastermindState` existing fields unchanged: `id`, `baseCardId`, `tacticsDeck`, `tacticsDefeated`
- D-12805 Interpretation B: `G.mastermind.attachedBystanders` is mastermind-side only; `G.attachedBystanders` is city-villain
- `G.mastermind.attachedBystanders` is append-only during strike (no reorder, no removal, no dedup)
- Decision ID: D-15401
- Commit prefix: `EC-167:` (code), `SPEC:` (governance close)
- Replay `// why:` text: `WP-154 adds G.mastermind.attachedBystanders (01.5 cascade)`

## Guardrails

- `G.mastermind.attachedBystanders` contains only `CardExtId` strings — never `undefined`, `null`, or objects
- Capture removes from index `0` of `G.piles.bystanders` — never last, never random
- Do not use `.shift()`, `.pop()`, or `.splice()` on zones — removal from index 0 MUST produce a new array (`slice(1)` or destructuring)
- Projection must be aliasing-safe: new array, new entry objects (no shared refs to G data); must preserve source array order
- Do not introduce a new `RuleEffectType` — capture logic is inline in `mastermindStrikeHandler`
- Do not modify `G.attachedBystanders` (city-villain) — negative test required
- Do not import `@legendary-arena/registry` in the strike handler

## Required `// why:` Comments

- Replay hash literal update: `// why: WP-154 adds G.mastermind.attachedBystanders (01.5 cascade)`
- Empty-supply log message in strike handler: `// why: bystander supply exhausted, no capture per D-15401`

## Files to Produce

- `packages/game-engine/src/mastermind/mastermind.types.ts` — **modified** — add `attachedBystanders: CardExtId[]`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — initialize field as `[]`
- `packages/game-engine/src/rules/mastermindHandlers.ts` — **modified** — capture logic in strike handler
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — graduate projection, remove marker
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — projection assertions
- `packages/game-engine/src/rules/mastermindHandlers.test.ts` — **modified** — capture + negative tests
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — hash literal update
- `docs/ai/DECISIONS.md` — **modified** — D-15401

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `rg "SAFE-SKIP-WP128" packages/game-engine/src/ui/uiState.build.ts --count` reduced by 1
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-15401)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells

- Replay hash test fails unexpectedly → forgot 01.5 cascade (new G field changes hash)
- Aliasing test passes trivially → projected array is the same reference as G source; must assert `!==`
- Strike captures wrong bystander → used `pop()` (last) instead of index `0` (top)
- Grep gate inflated → `// why:` comment repeats policed literal; paraphrase instead
