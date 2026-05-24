# EC-192 — Fix `Bystanders Rescued` Counter Undercount (Supply-Pile Bystanders) (Execution Checklist)

**Source:** (no WP — ad-hoc INFRA defect fix; follows the EC-110 / EC-166 / EC-177 / EC-178 / EC-183 precedent)
**Layer:** Game Engine (`packages/game-engine/src/ui/`) + Client (`apps/arena-client/src/composables/`)

## Before Starting
- [x] Reproduce: a live autoplay match's victory pile contained 3 bystanders (2× `bystander-villain-deck-NN` + 1× `pile-bystander`) but the HUD showed `Bystanders rescued: 2`. Verified against `play.legendary-arena.com` match `KsCd4tP6uSw` 2026-05-23 — Pinia store `progress.bystandersRescued = 2`, `victoryCards` contained 1 `pile-bystander` entry that the projection missed.
- [x] Root cause: `countBystandersRescued` in `uiState.build.ts` and `classify` in `useVictoryPileComposition.ts` both filtered exclusively on the `villainDeckCardTypes[id] === 'bystander'` / `extId.startsWith('bystander')` prefix path. The supply-pile bystander token (`BYSTANDER_EXT_ID = 'pile-bystander'`, defined in `pilesInit.ts:22`) lands in victory via two paths — attached-bystander awards on villain defeat (`awardAttachedBystanders` in `board/bystanders.logic.ts`) and direct hero-ability rescues — and was never counted by either consumer. `scoring.logic.ts:65` already handles both sources correctly via `cardType === 'bystander' || cardId === BYSTANDER_EXT_ID`; this EC mirrors that dual condition into the two projection / display consumers.
- [x] `pnpm -r build` exits 0; engine + arena-client tests green pre-change

## Locked Values (do not re-derive)
- Engine projection: `countBystandersRescued` MUST count entries where `villainDeckCardTypes[cardExtId] === 'bystander'` OR `cardExtId === BYSTANDER_EXT_ID` (dual condition, verbatim from `scoring.logic.ts:65`)
- Composable classifier: `classify` MUST bin `BYSTANDER_EXT_ID` (`'pile-bystander'`) into `bystandersRescued` BEFORE the prefix check
- Composable classifier: `classify` MUST bin `WOUND_EXT_ID` (`'pile-wound'`) into `woundsInPile` BEFORE the prefix check (dormant misfit fixed in the same pass)
- Composable classifier: `classify` MUST bin ext_ids starting with `'master-strike-'` into `mastermindCards` (dormant misfit fixed in the same pass — Master Strikes don't land in victory under MVP routing but the heuristic must be correct under real ext_ids)
- Existing prefix branches (`bystander*`, `wound*`, `henchman*`, `mastermind*`, `strike-*`) retained as defensive fallthrough
- `BYSTANDER_EXT_ID` and `WOUND_EXT_ID` imported from `@legendary-arena/game-engine` (Runtime-Safe Engine Surface only — no `/setup` subpath)

## Guardrails
- Do NOT modify `scoring.logic.ts` — VP computation is already correct and was verified against the live store (`victoryVP: 33` matched per-card arithmetic exactly: 7 villains + 8 henchmen + 3 bystanders + 3 tactics × 5)
- Do NOT touch zone routing — no card moves to a new zone; this is a projection / display fix only
- Do NOT modify `filterUIStateForAudience` — the audience filter is unchanged
- Do NOT introduce a new well-known ext_id constant on the client — re-use the engine's `BYSTANDER_EXT_ID` / `WOUND_EXT_ID` exports (single source of truth)
- The Master Strike prefix is declared as a local `MASTER_STRIKE_PREFIX` constant in the composable with a `// why:` explaining the defensive posture (no engine constant exists; the literal lives in `villainDeck.setup.ts:279`)
- Scope is `uiState.build.ts` + `useVictoryPileComposition.ts` + their tests; no contract change, no new decision

## Required `// why:` Comments
- `countBystandersRescued` — three-clause: (1) bystanders in victory come from two sources (villain-deck + supply-pile), (2) `pile-bystander` is NOT in `villainDeckCardTypes`, (3) mirrors `scoring.logic.ts:computeFinalScores` so HUD counter and VP agree
- `classify` — three-clause: (1) well-known generic-component ext_ids checked first as literal equality, (2) tokens emitted by `pilesInit` and not in `villainDeckCardTypes`, (3) mirrors the dual condition in both engine sites
- `MASTER_STRIKE_PREFIX` constant — explain that Master Strikes don't land in victory under MVP routing but the heuristic must be correct under real ext_ids; the literal lives in `villainDeck.setup.ts` (no shared constant exported)

## Files to Produce
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — extend `countBystandersRescued` to also count `BYSTANDER_EXT_ID`; add `BYSTANDER_EXT_ID` to the existing `buildInitialGameState.js` import
- `packages/game-engine/src/ui/uiState.build.progress.test.ts` — **modified** — add 2 regression tests: (1) `pile-bystander` without a `villainDeckCardTypes` entry counts, (2) a mixed villain-deck + supply-pile pile sums correctly
- `apps/arena-client/src/composables/useVictoryPileComposition.ts` — **modified** — import `BYSTANDER_EXT_ID` / `WOUND_EXT_ID` from `@legendary-arena/game-engine`; add `MASTER_STRIKE_PREFIX` local constant; extend `classify` with the three literal / prefix branches
- `apps/arena-client/src/composables/useVictoryPileComposition.test.ts` — **modified** — add 4 regression tests: (1) `pile-bystander`, (2) `pile-wound`, (3) `master-strike-NN`, (4) mixed villain-deck + supply-pile bystanders
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add the EC-192 ad-hoc row (no `WORK_INDEX.md` row)

## After Completing
- [x] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline 787 → 789, +2 regression tests)
- [x] `pnpm --filter arena-client test` exits 0 (baseline 384 → 388, +4 regression tests)
- [x] `pnpm --filter arena-client build` exits 0
- [ ] Commit prefix `EC-192:` for staged files under `packages/` + `apps/`; EC file + EC_INDEX row in a `SPEC:` governance commit
- [ ] Production verification: after deploy, observe `Bystanders rescued` increments correctly across hero-ability rescues AND villain-defeat bystander awards

## Common Failure Smells
- HUD counter still misses pile-bystander → engine still gates on `villainDeckCardTypes[id] === 'bystander'` only (missing the `|| cardExtId === BYSTANDER_EXT_ID` branch)
- Composable still puts pile-bystander into villainsDefeated → literal-equality branch added but ordered AFTER the catch-all (must be FIRST so it short-circuits before the prefix paths)
- New test asserts on `villainsDefeated` count without accounting for the pre-fix misclassification → check the test fixture's expected value against the corrected heuristic, not the buggy production output
