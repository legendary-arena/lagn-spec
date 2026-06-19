# EC-297 — Simulation onBegin Parity (Execution Checklist)

**Source:** docs/ai/work-packets/WP-266-sim-onbegin-parity.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/**` + `src/test/fixtures/runFixture.ts`)

## Before Starting
- [ ] WP-193 on `main` — `runPerTurnLoop` in `simulation.runner.ts`; its turn-transition block resets `currentStage` + `turnEconomy` only; local `shuffleWithPrng`
- [ ] WP-195 on `main` — `simulateOneGame` per-game loop in `par.aggregator.ts`; same shape; local `shuffleWithPrng`
- [ ] WP-212 on `main` — `villainRevealedThisTurn` guard (`villainDeck.reveal.ts`); WP-236 on `main` — `onBegin` auto-draw + `drawCardsIntoHand` / `HAND_SIZE` (`moves/drawCards.logic.ts`); `ShuffleProvider` exported from `setup/shuffle.ts`
- [ ] WP-263 on `main` — `cell.hollowEffects` sweep projection; WP-259 on `main` — `runtime-observed-hollows.mjs` + the committed artifact + the `sim:runtime-observed:check` CI step
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/game-engine test` exits 0 (records the baseline pass count; this run is the `finalStateHash` guard)

## Locked Values (do not re-derive)
- Helper name **exactly** `applyOnBeginParity`; signature `(gameState: LegendaryGameState, playerId: string, shuffleProvider: ShuffleProvider): void`; file `packages/game-engine/src/simulation/onBeginParity.ts`.
- Helper body order **exactly**: `villainRevealedThisTurn = false` → `hasDrawnThisTurn = false` → if zones exist: `drawCardsIntoHand(zones, Math.max(0, HAND_SIZE - hand.length), shuffleProvider)` → `hasDrawnThisTurn = true`. Mirrors `onBegin` / the existing `runFixture` inline block. **Does NOT** fire rule hooks, reset stage/economy, or add a `G` field.
- Each caller passes the provider **inline**: `{ random: { Shuffle: <T>(deck: T[]): T[] => shuffleWithPrng(deck, nextRandom) } }` (built from the file's own `shuffleWithPrng` + `nextRandom`). The helper has NO Fisher-Yates of its own.
- Call sites: runner + aggregator call the helper **once before the `while` loop** (turn 1) AND **once in the `if (endTurnFlag.triggered)` block** (after `currentPlayer` advance + stage/economy reset); `runFixture.rotateToNextTurn` calls it in place of its inline block (no extra turn-1 call).
- Reveal gate **exactly**: `if (stage === 'start' && !gameState.villainRevealedThisTurn)` (item 5 in `ai.legalMoves.ts`); ordering otherwise unchanged.
- Artifact regen command: `pnpm sim:runtime-observed` (default write mode); policy stays **random** (NOT competent — that is WP-265).

## Guardrails
- **One shared helper, no duplicate inline copies** — extracting at the THIRD use (runFixture + runner + aggregator) is the §16.1-sanctioned point; shipping two near-identical inline copies is the FAIL.
- **Game-determinism preserved** — `runFixture` routed through the helper MUST be byte-behavior-identical; `replayFixtures.test.ts` (the `finalStateHash` gate) MUST stay green. Do NOT add a new hash fixture or sentinel.
- **Sim trajectories change on purpose** — the runner + aggregator now play cards; the engine suite stays green because every assertion is structural (shape / finiteness / drift-guard / capture↔replay), NOT a pinned seeded outcome. Do NOT "fix" a green test to pin a new outcome.
- **No new randomness / clock / IO / `G` field / export** — draw only from the caller's `shuffleProvider`; `index.ts` byte-unchanged; the file-header invariants hold (forbidden-surface list = D-3701).
- **No result-shape change** — `CapturedGameResult` / `SweepCellResult` / `CapturedOutcomeSummary` / `SimulationResult` untouched; the field-set drift guards stay green and are NOT edited.
- **`onTurnStart` rule hooks stay deferred** (D-0205) — the helper mirrors only the reset+draw part of `onBegin`.
- **`runFixture` unused-import cleanup** — drop `HAND_SIZE` / `drawCardsIntoHand` (now unused); KEEP `shuffleWithPrng` (still used by `buildMoveContext`). The engine build must show no unused-import error.
- **Artifact byproduct only** — touch `runtime-observed-hollows.mjs` ONLY to correct the now-false zero-state/passive prose in `matrixDescription`; regenerate the JSON; do NOT switch the policy to competent or alter the harness logic (WP-265's job).
- **Boundary-based stops only** — stop only to change a result shape, cross a layer, add a contract file, or on scope-classification ambiguity.

## Required `// why:` Comments
- Inside `applyOnBeginParity` — that it mirrors the play-phase `onBegin` reset+draw and intentionally does NOT fire rule hooks (D-0205, observation-only).
- Each runner/aggregator call site — the turn-1-before-loop call (opening draw deferred by `buildInitialGameState`) and the transition-block call (incoming player).
- The reveal gate — `!villainRevealedThisTurn` mirrors the move-level guard so a policy cannot re-pick a no-op reveal forever.

## Files to Produce
- `packages/game-engine/src/simulation/onBeginParity.ts` — **new** — the shared `applyOnBeginParity` helper
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — import + two call sites in `runPerTurnLoop`
- `packages/game-engine/src/simulation/par.aggregator.ts` — **modified** — import + two call sites in `simulateOneGame`
- `packages/game-engine/src/test/fixtures/runFixture.ts` — **modified** — route `rotateToNextTurn` through the helper; swap the now-unused import
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — **modified** — one-shot reveal gate (item 5)
- `packages/game-engine/src/simulation/onBeginParity.test.ts` — **new** — helper unit tests (flag state, draw-to-HAND_SIZE, empty-deck safety, determinism)
- `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — **modified** — reveal-gate coverage (offered iff `!villainRevealedThisTurn`)
- `scripts/runtime-observed-hollows.mjs` — **modified** — correct the now-false zero-state prose in `matrixDescription`
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified** — regenerated (random policy now surfaces hollows)

## After Completing
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 (incl. `replayFixtures.test.ts` — the `finalStateHash` gate)
- [ ] `node scripts/runtime-observed-hollows.mjs --check` 0; `node scripts/hero-effect-coverage.mjs --check` 0; `node scripts/hero-mechanic-ledger.mjs --check` 0
- [ ] `git diff --name-only -- data/cards/ packages/game-engine/src/index.ts` empty
- [ ] `git diff --name-only` = the 9 Files to Produce + governance only
- [ ] `docs/ai/DECISIONS.md` D-24043 → Active; `docs/ai/STATUS.md` records **infrastructure only — no user-observable change** (D-24026 N/A)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-266 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-297 Done; `docs/05-ROADMAP-MINDMAP.md` WP-266 node; `node scripts/roadmap-counts.mjs --check` 0

## Common Failure Smells
- `replayFixtures.test.ts` failing → the `runFixture` routing diverged from its old inline block (wrong helper body order, or stage/economy reset moved into the helper). The helper must do flags+draw ONLY.
- A `simulation` / `par.aggregator` test failing on a pinned winner/turn-count/score → someone "re-baselined" a structural test into an outcome test; revert — the suite asserts structure, not seeded outcomes.
- Two near-identical inline onBegin blocks left in runner + aggregator → §16.1 violation; they must call the shared helper.
- `index.ts` in the diff → a new export crept in; the helper is engine-internal, not public.
- `runtime-observed-hollows.json` regenerated with a competent policy, or `matrixDescription` still saying "passive / zero-state" → wrong: policy stays random; prose must reflect that random now draws + plays.
- A field-set drift test (`CapturedGameResult` / `SweepCellResult`) failing → a result field was added by mistake; WP-266 adds none.
- A registry / `boardgame.io` import in `onBeginParity.ts` → header-invariant break; the helper is pure.
- `runFixture` build error "HAND_SIZE declared but never used" → the unused import was not dropped after routing through the helper.
