# EC-170 — Horrors Pile (Execution Checklist)

**Source:** docs/ai/work-packets/WP-156-horrors-pile.md
**Layer:** Game Engine (`packages/game-engine/src/`) — types, setup, validation, UI projection, replay hash

## Before Starting
- [ ] WP-128 + WP-135 + WP-155 complete on `main` (projection extensions + graduation template + economy)
- [ ] Confirm `uiState.build.ts` contains `horrorsCount = 0` with `// SAFE-SKIP-WP128` marker
- [ ] Confirm `zones.types.ts` exports `GlobalPiles` with: `bystanders`, `wounds`, `officers`, `sidekicks`
- [ ] Confirm `buildInitialGameState.ts` constructs `G.piles` (this is the single initialization path)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0 and `test` exits 0; record baseline counts

## Locked Values (do not re-derive)
- `G.piles.horrors: Zone` (i.e., `CardExtId[]`) — on `GlobalPiles`
- `UISharedPilesState.horrorsCount: number` — locked by WP-128, D-12802
- MVP value: `[]` (empty array) — no scheme currently populates it
- Projection: `gameState.piles.horrors.length` — never a separate counter
- Existing `GlobalPiles` fields (`bystanders`, `wounds`, `officers`, `sidekicks`) — unchanged
- Single initialization path: `buildInitialGameState.ts` — no second init location

## Guardrails
- `G.piles.horrors` is a non-player-owned global zone — inert in MVP
- No move or effect in this WP may read or mutate `G.piles.horrors`
- No hooks, callbacks, or conditional logic for scheme-driven population
- All entries MUST be `CardExtId` strings (zone contract)
- No `.reduce()` in zone operations or effect application
- No `boardgame.io` imports in pure helpers
- Replay hash changes MUST be attributable ONLY to `piles.horrors` addition (expected delta: `G.piles` gains `horrors: []`) — no gameplay behavior changes
- Do not introduce a second initialization path for `G.piles`

## Required `// why:` Comments
- `horrors` field declaration in `GlobalPiles`: non-player-owned, scheme-controlled, read-only in MVP
- `piles.horrors` initialization in `buildInitialGameState`: empty — no scheme currently populates
- 01.5 replay hash literal: new G field (`piles.horrors`) changes hash

## Files to Produce
- `packages/game-engine/src/state/zones.types.ts` — **modified** — add `horrors: Zone` to `GlobalPiles`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — initialize `piles.horrors` as `[]`
- `packages/game-engine/src/state/zones.validate.ts` — **modified** — include `horrors` in structural validation
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — graduate safe-skip with real projection
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — real projection assertion
- `packages/game-engine/src/state/zones.validate.test.ts` — **modified** — add `horrors` to fixtures
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — hash literal update
- `docs/ai/DECISIONS.md` — **modified** — D-156xx entry
- `docs/ai/STATUS.md` — **modified** — dated completion
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-156

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `G.piles.horrors` initialized as `[]` in `buildInitialGameState` and validated via zone validation
- [ ] `G.piles.horrors.length === 0` after setup (MVP guarantee verified in tests)
- [ ] `horrorsCount` projection returns `0` when `piles.horrors` is empty
- [ ] All `horrors` entries validated as `CardExtId` strings (zone validation test)
- [ ] No move or effect references `G.piles.horrors` (grep-verified: matches only in types, setup, validate, projection, and tests)
- [ ] `computeStateHash` changes with `piles.horrors` addition (01.5 cascade resolved)
- [ ] One `// SAFE-SKIP-WP128` marker removed from `uiState.build.ts`
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-156xx: horrors pile placement + MVP-empty rationale)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-170 → Done
- [ ] No files outside the "Files to Produce" list were modified

## Common Failure Smells
- Validation passes but `horrors` missing → validation not updated correctly
- Replay hash changes beyond expected delta → unintended state mutation introduced
- `horrors` field appears in any move function → pile inertness violated (no reads/writes in MVP)
- Setup tests fail on missing field → pile not initialized in `buildInitialGameState`
- Projection returns non-zero → pile populated when it should be empty in MVP
- Second initialization site found → single-path constraint violated
- `horrorsCount` projection throws or returns undefined → projection not safely wired to `.length`
