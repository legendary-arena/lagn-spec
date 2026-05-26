# EC-207 — Bot Decision Logging (Execution Checklist)

**Source:** docs/ai/work-packets/WP-181-bot-decision-logging.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/` + `packages/game-engine/src/network/`)

## Before Starting
- [ ] WP-049 (T2 Competent Heuristic AI) complete ✅
- [ ] WP-036 (simulation runner) complete ✅
- [ ] Read `ai.competent.ts`, `ai.types.ts`, `simulation.runner.ts`, `intent.types.ts`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- `[Bot]` prefix tag — verbatim in every decision log message
- Lifecycle-move threshold: `SCORE_ADVANCE_STAGE_BASE` (10)
- Scoring constants unchanged (values in WP-181 §Locked contract values)
- `BestMoveResult` is LOCAL to `ai.competent.ts` — not exported
- `decisionLog` field on `ClientTurnIntent` MUST be optional (`?`)
- Line 1 format: `[Bot] Chose: <moveName>[<argValue>] (score <N>)`
- Line 2 format: `[Bot] Over: <alt1> (<score1>), <alt2> (<score2>)`
- Runner pushes decision log BEFORE dispatching the move

## Guardrails
- No `Math.random()` anywhere in simulation files
- No `boardgame.io` imports in simulation files
- No `@legendary-arena/registry` imports in engine files
- No `.reduce()` in scoring or message formatting
- Decision messages are deterministic — no timestamps, no floating-point
- D-3604: decision PRNG must not be perturbed by the logging change
- `selectBestMove` return type change is internal — not exported from module
- Existing `ai.competent.test.ts` tests must pass without modification

## Required `// why:` Comments
- `BestMoveResult` interface: why local and not exported
- `decisionLog` field on `ClientTurnIntent`: why optional
- Runner `decisionLog` push loop: why before dispatch (ordering)
- Lifecycle threshold in alternative filtering: why `SCORE_ADVANCE_STAGE_BASE`

## Files to Produce
- `packages/game-engine/src/network/intent.types.ts` — **modified** — add `decisionLog?: string[]`
- `packages/game-engine/src/simulation/ai.competent.ts` — **modified** — `selectBestMove` returns `BestMoveResult`; `decideTurn` populates `decisionLog`
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — push `intent.decisionLog` into `G.messages`
- `packages/game-engine/src/simulation/ai.competent.test.ts` — **modified** — new tests for decision log

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] Grep: `decisionLog` appears in `intent.types.ts` (1 declaration)
- [ ] Grep: `BestMoveResult` matches ONLY in `ai.competent.ts`
- [ ] Grep: `[Bot]` appears ≥2 times in `ai.competent.ts`
- [ ] Grep: `decisionLog` appears in `simulation.runner.ts`
- [ ] Grep: zero `Math.random` in `packages/game-engine/src/simulation/`
- [ ] Grep: zero `boardgame.io` imports in `packages/game-engine/src/simulation/`
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (if decisions made)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` flipped to Done

## Common Failure Smells
- Floating-point scores in message strings → use integer-only formatting
- `decisionLog` not optional → breaks all existing `ClientTurnIntent` callers
- Runner pushes log AFTER dispatch → bot messages appear after move messages
- `BestMoveResult` exported from module → unintended API surface growth
- PRNG call count changes → breaks determinism / replay hash regression
