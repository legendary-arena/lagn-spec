# EC-243 — Once-Per-Turn Villain Reveal Guard (Execution Checklist)

**Source:** docs/ai/work-packets/WP-212-villain-reveal-once-per-turn-guard.md
**Layer:** Game Engine

## Before Starting
- [ ] `villainDeck.reveal.ts` exports `revealVillainCard` (wrapper, stage-gated) + `performVillainReveal` (shared body)
- [ ] `schemeTwistResolvers.ts` calls `performVillainReveal(...)` directly (lines 230, 491) — chained reveals
- [ ] `game.ts` play phase turn `onBegin` already sets `G.currentStage` + `G.turnEconomy`
- [ ] `sentinel-core-doom-2p.replay.json` carries `expected.finalStateHash` / `.messages` / `.outcome`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- Field name: `villainRevealedThisTurn` — `?: boolean` (OPTIONAL, not required); turn-scoped boolean ONLY (never a counter/enum/timestamp)
- Start stage: `TURN_STAGES[0] === 'start'`
- Wrapper order (exact, no statement reordered/interleaved): (1) `if (G.currentStage !== 'start') return;` (2) `if (G.villainRevealedThisTurn) return;` (3) `performVillainReveal(...)` (4) `G.villainRevealedThisTurn = true;`
- Set is UNCONDITIONAL — consumed on the *attempt*, not the reveal *success* (empty-deck no-op still sets `true`)
- Reset in `onBegin`: `G.villainRevealedThisTurn = false;`

## Guardrails
- Guard goes in the `revealVillainCard` WRAPPER ONLY — `performVillainReveal` MUST NOT reference the flag
- Field is OPTIONAL — making it required forces edits to 21 full-`G` literals (out of scope)
- Do NOT modify `schemeTwistResolvers.ts` or the `performVillainReveal` pipeline (steps 1–7)
- Do NOT add a `G.messages` entry for the blocked reveal (silent no-op per Move Validation Contract)
- Move never throws — guard is an early `return`, not a throw
- Blocked reveal = ZERO mutation: assert `deepStrictEqual` against a `structuredClone(G)` snapshot, not just unchanged deck/City
- Fixture re-pin: ONLY `expected.finalStateHash` may change; `expected.messages` + `expected.outcome` byte-identical — else STOP

## Required `// why:` Comments
- `types.ts` new field: optional so existing full-`G` literals need no edit; absent ⇒ not yet revealed
- `buildInitialGameState.ts`: reveal not yet occurred at setup; `onBegin` resets each turn
- `game.ts` onBegin reset: allowance refreshes each turn; without it reveals break from turn 2
- `villainDeck.reveal.ts` guard: once-per-turn; chained reveals call `performVillainReveal` directly, bypassing this
- `villainDeck.reveal.ts` set: player's single start-of-turn reveal consumed
- reveal test (chained-reveal case): proves scheme-twist reveals unaffected by the wrapper guard

## Files to Produce
- `packages/game-engine/src/types.ts` — **modified** — optional `villainRevealedThisTurn?: boolean` after `currentStage`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — init `false` in `baseState`
- `packages/game-engine/src/game.ts` — **modified** — reset `false` in play phase turn `onBegin`
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — wrapper guard + set-after-reveal
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **modified** — 5 guard tests (exactly-1-reveal / whole-G-deepEqual-on-block / shared-body-ignores-flag / empty-deck-still-consumes / JSON-serializable)
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json` — **modified** — re-pin `finalStateHash`

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `Select-String villainDeck.reveal.ts -Pattern "villainRevealedThisTurn"` → matches only in the wrapper
- [ ] `git diff` of the fixture shows ONLY the `finalStateHash` line changed
- [ ] `git diff --name-only` shows only the 9 WP-listed files; `schemeTwistResolvers.ts` untouched
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated — D-20901 (wrapper-only once-per-turn guard), D-20902 (optional-field rationale), D-20903 (behaviour-neutral hash re-pin)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells
- Chained scheme-twist reveals stop firing → guard wrongly placed in `performVillainReveal`, not the wrapper
- 21 test files suddenly fail to compile → field declared required instead of optional
- Fixture `messages`/`outcome` oracle changes → guard is blocking a legitimate single reveal; investigate before re-pinning
- Reveals work on turn 1 but never after → missing `onBegin` reset
- Empty-deck reveal can be retried same turn → flag set guarded on reveal success instead of unconditionally
