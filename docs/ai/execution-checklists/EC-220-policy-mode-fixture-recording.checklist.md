# EC-220 — Policy-Mode Fixture Recording (Execution Checklist)

**Source:** docs/ai/work-packets/WP-193-policy-mode-fixture-recording.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/`) + Scripts (`scripts/record-game-fixture.mjs`)

## Pre-Session Actions (PS-1..PS-3) — Blocking

> Per Issue 30 of the 01.7 lens raised in copilot-check 2026-05-31:
> D-19301..D-19303 are load-bearing for this WP. Execution may NOT
> begin until these three actions resolve.

- [ ] **PS-1 — D-entries locked verbatim.** The three DECISIONS.md entries below MUST be transcribed into `docs/ai/DECISIONS.md` BYTE-IDENTICALLY to the strings in `§Locked Values — DECISIONS.md verbatim block` below. The executor MUST NOT paraphrase. The executor MUST NOT modify the wording during SPEC-hardening of the EC; tightening D-entry wording requires a separate SPEC commit landing BEFORE the implementation session.
- [ ] **PS-2 — Index rows confirmed Pending.** `docs/ai/work-packets/WORK_INDEX.md` has a `[ ]` row for WP-193 with status `pending`; `docs/ai/execution-checklists/EC_INDEX.md` has an EC-220 row with status `Draft`. (Both landed in the Phase 1 SPEC PR.)
- [ ] **PS-3 — `// why:` comments cite the locked D-entries verbatim by number.** The four `// why:` comments mandated under `§Required // why: Comments` cite `D-19301`, `D-19302`, `D-19303` verbatim — paraphrased citations (e.g., "the single-oracle-path decision") are FAIL.

If any PS item is unsatisfied at session start, the executor STOPS and reports a `BLOCKED` disposition rather than attempting workarounds.

## Before Starting
- [ ] WP-158 complete ✅ — `runFixture(fixture, registry): FixtureRunResult` exported from `packages/game-engine/src/test/fixtures/runFixture.ts`; `validateFixture` exported from `fixtureSchema.ts`; recorder `--input` mode wired; sentinel fixture present at `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`. Confirm: `grep -n "deferred to a follow-up WP" scripts/record-game-fixture.mjs` returns 1 match (the throw this WP removes).
- [ ] WP-036 complete ✅ — `simulation.runner.ts` exports `runSimulation`; internal `simulateOneGame` per-turn loop exists; `hashSeedString` (djb2) + `createMulberry32` are byte-identical to the local copies in `runFixture.ts`.
- [ ] WP-049 complete ✅ — `createCompetentHeuristicPolicy(seed)` exported.
- [ ] T1 random policy ✅ — `createRandomPolicy(seed)` exported.
- [ ] WP-181 complete ✅ — `ClientTurnIntent.decisionLog?: string[]` additive + optional (captured `[Bot]` messages flow through unmodified).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (record baseline test count).
- [ ] `pnpm -r build` exits 0 (record baseline).

## Locked Values (do not re-derive)
- **Seat-derived seed convention:** `${operatorSeed}::seat:${i}` where `i` is the 0-based seat index matching `playerOrder[i]`. The literal separator `::seat:` is locked — do not paraphrase, abbreviate, or reorder. This string appears **verbatim** in the recorder source.
- **Policy factory map** — `seed` here refers to the seat-derived seed `${operatorSeed}::seat:${i}`, not the bare operator seed:
  - `'random'` → `createRandomPolicy(seed)`
  - `'heuristic'` → `createCompetentHeuristicPolicy(seed)`
  - Any other `--policy` value → full-sentence error, no fallback
- **`CapturedOutcomeSummary` fields (exactly two, both readonly):** `winner: EndgameOutcome | null`, `escapedVillains: number`. No third field. `EndgameOutcome` is imported `type`-only from `../endgame/endgame.types.js` (`EndgameOutcome = 'heroes-win' | 'scheme-wins'`; matches `FixtureOutcome.winner` in `fixtureSchema.ts`).
- **`CapturedGameResult` fields (exactly three, all readonly):** `moves: readonly ReplayMove[]`, `outcome: CapturedOutcomeSummary`, `endgameReached: boolean`. No fourth field.
- **`simulateOneGameAndCaptureMoves` signature (locked):** `(setupConfig: MatchSetupConfig, registry: CardRegistryReader, policies: readonly AIPolicy[], seed: string, gameIndex: number) => CapturedGameResult`.
- **Setup envelope shape consumed by `--setup`** (verbatim):
  ```jsonc
  {
    "schemaVersion": "1.0",
    "playerCount": <integer ≥ 1, ≤ 5>,
    "heroSelectionMode": "GROUP_STANDARD",
    "composition": { /* the 9-field MatchSetupConfig */ }
  }
  ```
- **MatchSetupConfig fields** (verbatim, 00.2 §8.1): `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`.
- **`ReplayMove` shape** (verbatim, `replay.types.ts`): `{ readonly playerId: string; readonly moveName: string; readonly args: unknown }`.
- **`playerOrder` derivation in `--policy` mode (locked):** `["0", "1", …, String(playerCount - 1)]`.
- **`MAX_TURNS_PER_GAME` = 200** (existing simulation cap; do not change).
- **`--max-moves` default = 10000** (existing recorder cap; do not change).
- **Captured trace excludes lobby moves** (D-19302) — no `setPlayerReady` / `startMatchIfReady` in the emitted `moves[]`.

### DECISIONS.md verbatim block (PS-1 source)

> Transcribe these three entries BYTE-IDENTICALLY into `docs/ai/DECISIONS.md` during Commit B (governance close). Do not paraphrase, reorder, or reflow. Status flips from `(proposed)` to `Active` at landing time.

**D-19301 — Recorder `--policy` mode uses simulation as move-generator + `runFixture` as oracle producer.** Rationale: WP-158 deferred `--policy` mode after rejecting two paths — exporting `runFixture` internals (API widening) and duplicating the dispatch loop (EC-172 §Guardrails violation). WP-193 resolves the deferral via a third path: simulation generates moves through its existing engine-state pipeline; those moves flow through `runFixture` unchanged to produce the oracle. The shared-loop invariant (EC-172 §Guardrails — Determinism integrity) is preserved because `runFixture` remains the single oracle source; `--policy` and `--input` paths converge on the same `runFixture` call. Closes the WP-158 deferral.

**D-19302 — Captured trace excludes lobby moves.** Rationale: simulation starts from `buildInitialGameState`'s output at `phase = 'play'`; `runFixture` also starts from `buildInitialGameState`'s output and dispatches whatever `moves[]` it receives. Lobby moves are not required for the dispatch loop to function — they appear in the sentinel fixture because it was hand-crafted with the full lobby sequence. Emitting synthetic lobby moves in `--policy` mode would require simulation to also dispatch them (so its starting state matches runFixture's post-lobby state), adding a lobby-semantics dependency simulation does not have today. The simpler choice — skip lobby moves entirely — preserves simulation's existing semantics and keeps the captured trace minimal. Hand-crafted fixtures via `--input` mode are unaffected and may continue to include lobby moves.

**D-19303 — `--policy` mode uses one policy family across all seats, with seat-derived deterministic seeds.** Rationale: WP-193 closes the `--policy` deferral, not the policy-family-heterogeneity question (e.g., random vs heuristic head-to-head) — that's a matrix-sweep concern owned by WP-194. Within a single policy family, instantiating every seat with the same literal seed produces correlated PRNG streams across seats: identical legal-move sets at identical filtered UIStates yield identical tie-breaks at every seat. The locked construction is `factory(\`${operatorSeed}::seat:${i}\`)` for each seat `i`, which preserves determinism while decorrelating seat-local behaviour. The literal separator `::seat:` is part of the locked contract — the recorder source carries it verbatim. WP-194 may extend the recorder (or add a sibling tool) to accept a per-seat policy-family list; that extension does not retro-violate WP-193 because the seat-derived seed convention is orthogonal to family selection.

## Guardrails
- **Single oracle path.** The recorder's `--policy` execution path MUST converge with `--input` at `recordFromInput(input, operatorMeta)`; the assembled `expected` block MUST be produced by `runFixture`. The recorder MUST NOT call `executeOnce` directly, MUST NOT bypass `validateFixture`, MUST NOT call `evaluateEndgame` or `hashGameState` for oracle purposes. (WP-158 §Contract + EC-172 §Guardrails — Determinism integrity.)
- **No second execution path.** `simulateOneGameAndCaptureMoves` reuses the existing `simulateOneGame` per-turn loop via an `onMoveDispatched?` callback side-channel; it MUST NOT introduce a parallel dispatch loop. The callback fires AFTER dispatch returns and AFTER `endTurnFlag` is read.
- **`runFixture` public API NOT widened.** No new exports added to `packages/game-engine/src/test/fixtures/runFixture.ts` or `fixtureSchema.ts`. No test in this WP imports `hashSeedString` or `createMulberry32` from either file (cross-path determinism is proven indirectly via the round-trip test; helper-level testing is rejected — it would require exporting helpers and widening API).
- **`GameOutcome` stays internal.** `simulation.runner.ts` MUST NOT export `GameOutcome`; only `CapturedGameResult` + `CapturedOutcomeSummary` are public.
- **Two-domain PRNG invariant (D-3604) preserved.** Policy PRNG (seeded via factory arg) and run-level shuffle PRNG (mulberry32 from `hashSeedString(seed)`) MUST remain distinct instances. The seat-derived seeds feed policy factories only; the run-level shuffle PRNG is unchanged.
- **No `Math.random` anywhere in `packages/game-engine/src/simulation/`.**
- **No `boardgame.io` import in `packages/game-engine/src/simulation/`.**
- **No `@legendary-arena/registry` import in `packages/game-engine/src/simulation/`.**
- **`--input` mode behaviour byte-identical pre/post.** Re-recording the sentinel fixture via `--input` MUST produce the same bytes as before this WP landed. (Round-trip test in §After Completing is the proof.)
- **`replay.execute.ts` NOT modified** (D-0205 / D-15801 lock).
- **No new npm dependencies.**
- **Per-seat policy heterogeneity (random vs heuristic at adjacent seats) NOT introduced** — that is WP-194's seam. One policy family across all seats; only the seed varies per seat (D-19303).

## Required `// why:` Comments
- `simulation.runner.ts` — extracted per-turn helper, callback fire site: cite **D-19301** (single-oracle-path; runFixture is the only oracle producer) + WP-193; explain why the callback fires AFTER move dispatch + AFTER `endTurnFlag` read.
- `simulation.runner.ts` — `CapturedGameResult.endgameReached` field: why exposed (WP-195 anomaly-oracle hook) and why WP-193 does not classify the cap-hit case.
- `simulation.runner.ts` — `CapturedOutcomeSummary` definition: why narrower than the internal `GameOutcome` (smallest-seam posture; deliberate non-export of `GameOutcome`).
- `record-game-fixture.mjs` — policy-list construction: cite **D-19303**; the `${operatorSeed}::seat:${i}` separator is the locked decorrelation-without-heterogeneity convention.
- `record-game-fixture.mjs` — `playerOrder` derivation: cite the locked seat-ordering convention.
- `record-game-fixture.mjs` — captured-moves → `recordFromInput(input, operatorMeta)` handoff: cite **WP-158 §Contract + EC-172 §Guardrails**; this is the convergence point that preserves the shared-loop invariant.
- `record-game-fixture.mjs` — lobby-move omission from the captured trace: cite **D-19302**.

## Files to Produce
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** — extract per-turn loop into a callback-able helper; export `CapturedGameResult`, `CapturedOutcomeSummary`, `simulateOneGameAndCaptureMoves`. `GameOutcome` stays internal. `runSimulation` + `simulateOneGame` behaviour byte-identical (pure extraction).
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` — **new** — node:test coverage: non-empty trace, determinism, PRNG-stream parity with `runSimulation` (via observable `SimulationResult` fields — no private helper access), round-trip outcome equality via `runFixture`, `endgameReached` stability across repeated runs.
- `scripts/record-game-fixture.mjs` — **modified** — implement `--policy` mode (replace the deferral throw); preserve `--input` mode byte-identically; route the captured `moves[]` through the existing `recordFromInput` helper.
- `docs/ai/REFERENCE/complete-game-tests.md` — **modified** — replace §"Recorder `--policy` mode is deferred" with §"`--policy` mode (WP-193)"; add a workflow paragraph under §"How to add a fixture".
- `docs/ai/STATUS.md` — **modified** — `### WP-193 / EC-220 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — append D-19301, D-19302, D-19303.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-193 row `[x]` with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-220 row flipped to Done.

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + new file; new file contributes ≥7 tests — the 5 base tests plus the Issue 4 field-set assertions and the Issue 11 dispatch-order invariant).
- [ ] **Field-set drift assertions (Issue 4 fix).** New test file asserts `Object.keys(captured).sort()` deep-equals `['endgameReached', 'moves', 'outcome']` AND `Object.keys(captured.outcome).sort()` deep-equals `['escapedVillains', 'winner']`. Failure means a fourth field silently landed on either type.
- [ ] **Dispatch-order invariant assertion (Issue 11 fix).** New test file uses a spy policy that records each `(playerId, moveName, args)` returned from `decideTurn`; after the capture, the test asserts `captured.moves` (comparable form) deep-equals `spy.recordedDispatches` (comparable form). Frame the assertion as `must-never-happen: captured move order diverges from dispatch order`.
- [ ] **`CapturedOutcomeSummary.winner` is typed `EndgameOutcome | null`** (Issue 21 fix). Confirm via `grep -n "winner: EndgameOutcome" packages/game-engine/src/simulation/simulation.runner.ts` returns ≥1 match AND `grep -n "winner: string" packages/game-engine/src/simulation/simulation.runner.ts` returns zero matches.
- [ ] `grep -n "export function simulateOneGameAndCaptureMoves\|export interface CapturedGameResult\|export interface CapturedOutcomeSummary" packages/game-engine/src/simulation/simulation.runner.ts` returns exactly 3 matches.
- [ ] `grep -n "export.*GameOutcome" packages/game-engine/src/simulation/simulation.runner.ts` returns **zero matches** (internal-only invariant).
- [ ] `grep -rn "Math\.random" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -rn "from 'boardgame.io" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -rn "from '@legendary-arena/registry'" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -n "deferred to a follow-up WP" scripts/record-game-fixture.mjs` returns zero matches (throw removed).
- [ ] `grep -n "::seat:" scripts/record-game-fixture.mjs` returns ≥1 match (locked separator present verbatim).
- [ ] `grep -n "simulateOneGameAndCaptureMoves" scripts/record-game-fixture.mjs` returns ≥1 match.
- [ ] `git diff --stat` shows **zero change** to `packages/game-engine/src/test/fixtures/runFixture.ts`, `packages/game-engine/src/test/fixtures/fixtureSchema.ts`, `packages/game-engine/src/replay/replay.execute.ts`.
- [ ] Verification Step 9 (smoke `--policy random` recording) exits 0 and produces `packages/game-engine/src/test/fixtures/games/wp193-smoke-random.replay.json`.
- [ ] Verification Step 10 (round-trip with **same `--name`**) overwrites the same file with byte-identical content (Compare-Object on `$first` vs new file = empty).
- [ ] Smoke fixture deleted: `git status` + `git ls-files --others --exclude-standard` show no `wp193-smoke-*` files before the implementation commit.
- [ ] `git diff --name-only` matches the §Files to Produce list exactly (no out-of-scope edits).
- [ ] `docs/ai/STATUS.md` updated; `DECISIONS.md` carries D-19301..D-19303 **byte-identically to the §DECISIONS.md verbatim block above** (PS-1 enforcement — no paraphrase); `WORK_INDEX.md` WP-193 `[x]`; `EC_INDEX.md` EC-220 Done; `complete-game-tests.md` deferred-section flipped.

## Common Failure Smells
- Exporting `GameOutcome` (or `hashSeedString` / `createMulberry32`) from any file → API-widening violation; the WP load-bears on these staying internal. Fix: keep the export list at exactly the three new symbols and project `GameOutcome` → `CapturedOutcomeSummary` internally.
- Recorder calls `executeOnce`, `evaluateEndgame`, or `hashGameState` directly → bypass of `runFixture`'s within-run double-run guard; oracle path no longer single. Fix: route through `recordFromInput` exactly as `--input` mode does.
- Captured trace starts with `setPlayerReady` / `startMatchIfReady` → D-19302 violation; simulation does not dispatch lobby moves and the captured trace must mirror that.
- Every seat passed the bare `operatorSeed` (no `::seat:` segment) → correlated PRNG streams across seats; D-19303 violation. Fix: per-seat seeds via the locked separator.
- Round-trip test compares fixtures with differing `name` → AC #10 contradiction (same `--name` is mandatory; Step 10 overwrites in place).
- Test count drift on pre-existing simulation tests → the extraction is not pure; `simulateOneGame` / `runSimulation` behaviour changed. Fix: extract the per-turn loop as a no-callback default; existing call sites must remain byte-equivalent.
- New test file imports `hashSeedString` / `createMulberry32` from either source → silent API widening + the very contradiction WP-193 rejects. Cross-path determinism is proven via the round-trip + outcome-equality test, not via private-helper invocation.
- `runSimulation`'s public signature changed → out of scope; only the internal per-turn loop is extracted, `runSimulation` is untouched at the call site.
- Smoke fixture left on disk at commit time → the regression suite will glob it. The cleanup `Remove-Item` (Verification Step 11) is mandatory; verify with both `git status` AND `git ls-files --others` (untracked-but-present files don't show in `git status` unless added).
- `CapturedOutcomeSummary.winner` typed `string | null` instead of `EndgameOutcome | null` → Issue 21 widening violation; lets a typo or new outcome value compile but fail replay matching silently. Fix: `import type { EndgameOutcome } from '../endgame/endgame.types.js'` and use it.
- Field-set drift test missing or only checking `>= 3` keys → Issue 4 prevention defeated. The test MUST assert `deepEqual` against the exact sorted array, not a count or superset.
- Dispatch-order test asserts `length` only or compares unsorted sets → Issue 11 prevention defeated. The test MUST assert byte-equal ordered sequences (the invariant is *order*, not membership).
- `// why:` comment cites "the single-oracle-path decision" or paraphrases D-19301..D-19303 → PS-3 violation. The comment MUST cite the D-number verbatim (`D-19301`, `D-19302`, `D-19303`).
- DECISIONS.md entry for D-19301..D-19303 deviates from the EC's §DECISIONS.md verbatim block → PS-1 violation. The transcription must be byte-identical; a single reworded sentence is FAIL.
