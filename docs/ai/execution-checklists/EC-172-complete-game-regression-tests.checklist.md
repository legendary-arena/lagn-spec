# EC-172 — Complete-Game Regression Tests (Execution Checklist)

**Source:** docs/ai/work-packets/WP-158-complete-game-regression-tests.md
**Layer:** Game Engine (`packages/game-engine/src/test/fixtures/**`) + scripts

## Before Starting
- [ ] `pnpm install` && `pnpm -r build` exit 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` baseline = 705, 0 failures (per WP-151)
- [ ] `git diff main -- packages/game-engine/src/replay/` empty (untouched baseline)
- [ ] `core/dr-doom` + one core scheme + one core villain/henchman/hero group exist in `data/cards/`

## Locked Values (do not re-derive)
- **Fixture file shape:** `{ name: string, meta: { version: 1, createdAt: ISO8601, engineVersion: string }, input: { seed: string, playerCount: number, playerOrder: string[], setupConfig: MatchSetupConfig, moves: ReplayMove[] }, expected: { finalStateHash: 64-char lc hex sha256, messages: string[], snapshotPerTurn: MatchSnapshot[], outcome: object | null } }`
- **Canonical JSON for `finalStateHash`:** keys ASCII-lex sorted; arrays preserve original order; `undefined` omitted; `null` preserved; numbers native JSON; no whitespace beyond `JSON.stringify` defaults; sha256 → 64-char lowercase hex
- **Seed transform:** string → `hashSeedString(seed)` (djb2, mirrors `simulation.runner.ts:87-93`) → 32-bit unsigned → `createMulberry32(int)`. Direct numeric parsing of the seed string is FORBIDDEN.
- **`messages` source of truth:** `expected.messages` is `G.messages` read byte-identically at end-of-run. No filtering, no reformatting, no reconstruction from state deltas. The engine's append-only event log IS the oracle.
- **`snapshotPerTurn` boundary:** captured AFTER the move that triggered `events.endTurn()` completes AND after `currentPlayer` rotation + stage reset; BEFORE the next turn's first move dispatches. One entry per completed turn; never mid-turn, never partial.
- **MatchSetupConfig 9 fields (00.2 §8.1):** `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`. ID format `<setAbbr>/<slug>` on all 5 entity-ID fields (D-10014).
- **Move dispatch source:** `CORE_MOVE_NAMES` constants array — no literal move-name strings as MOVE_MAP keys
- **Recorder default `maxMoves`:** 10000; recorder throws full-sentence error on overflow naming fixture, seed, current turn
- **Fixture format version:** `meta.version = 1`; validator rejects any other value
- **Recorder output byte-stability:** identical inputs produce byte-identical fixture JSON across runs (key order, array order, number formatting all stable)
- **Decision:** D-15801

## Guardrails
- **Determinism integrity (single source of randomness + opaque dispatch).** `runFixture` and `record-game-fixture.mjs` share ONE dispatch loop — recorder CALLS `runFixture` (or shared helper); duplicating the loop is FORBIDDEN. Exactly ONE mulberry32 per fixture invocation, seeded from `hashSeedString(input.seed)`; no secondary PRNG. `ReplayMove` objects pass to MOVE_MAP UNTRANSFORMED — no normalization/enrichment/defaulting/key-reorder between fixture parse and dispatch.
- **Within-run double-run guard.** `runFixture` runs the dispatch loop TWICE in-process per fixture and asserts byte-identical results BEFORE comparing to `expected`. Catches hidden mutable state leakage between dispatches.
- **Cross-run test isolation + aliasing defense.** Each fixture in `replayFixtures.test.ts` gets a FRESH `LegendaryGameState` and FRESH mulberry32 instance — zero state, PRNG, or message-buffer sharing across fixtures. `FixtureRunResult.messages` MUST be a defensive shallow copy of `G.messages` (`[...G.messages]`) — never a direct reference. Aligns with WP-028 / D-2802 aliasing-defense precedent (`[...cardKeywords]` fix).
- **Endgame discipline.** Dispatch loop terminates IMMEDIATELY when `evaluateEndgame(G)` returns non-null. If `moves[]` has remaining entries, throw `"Fixture <name> has N moves past endgame at turn T"`. Snapshot-count invariant `snapshotPerTurn.length === completedTurnCount` asserted at end-of-run.
- **Validator strictness (no silent failures).** `MOVE_MAP[moveName]` returning `undefined` THROWS a full-sentence error naming fixture, move index, unknown name — never silently warns/skips (WP-080 warn-and-continue is for `replay.execute.ts` only). `validateFixture(input, filenameBasename)` REJECTS fixtures whose `name` ≠ `filenameBasename`, missing `meta.version`/`meta.createdAt`/`meta.engineVersion`, non-ISO-8601 `createdAt`, or `meta.version !== 1`.
- **Boundary discipline.** Zero imports of `boardgame.io` (per D-3701), `@legendary-arena/registry`, or any forbidden randomness/wall-clock source anywhere under `packages/game-engine/src/test/fixtures/**` or `scripts/record-game-fixture.mjs`. Zero modifications to `packages/game-engine/src/replay/**` (D-0205) or `packages/game-engine/src/simulation/**` (WP-036 Scope Lock). No new npm dependency; schema validator hand-written, never Zod.
- **Failure reporter format.** On oracle mismatch: fixture name, failing oracle (`outcome|messages|finalStateHash`), first mismatch index for array oracles, expected-vs-actual truncated to 200 chars/side. Driver MUST surface `validateFixture` failures via `assert.fail` — never `try/catch` swallow.
- **Source-of-truth discipline.** Sentinel fixture's `expected` block is produced by the recorder, never hand-edited. If recorder output differs from committed file, the file is wrong.

## Required `// why:` Comments
- `runFixture.ts` mulberry32 instantiation: seed-faithful pipeline is the D-0205-anticipated separate harness, not a modification of `replay.execute.ts`
- `runFixture.ts` second in-process replay: within-run determinism guard against PRNG state leakage between dispatches
- `runFixture.ts` `evaluateEndgame` termination: extra moves past endgame are fixture-corruption, not soft warnings
- `record-game-fixture.mjs` `maxMoves` cap: infinite-loop guard for autoplay-mode policies that fail to terminate

## Files to Produce
**New (7):**
- `packages/game-engine/src/test/fixtures/fixtureSchema.ts` — types + hand-written validator (name/filename, version, ISO8601 createdAt, engineVersion)
- `packages/game-engine/src/test/fixtures/hashGameState.ts` — canonical-JSON sha256
- `packages/game-engine/src/test/fixtures/runFixture.ts` — seed-faithful dispatch loop (shared by recorder + driver)
- `packages/game-engine/src/test/fixtures/replayFixtures.test.ts` — `node:test` driver (per-fixture isolation, double-run guard, tiered oracle reporter)
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json` — sentinel fixture
- `scripts/record-game-fixture.mjs` — CLI recorder (autoplay + explicit-moves modes); calls `runFixture`
- `docs/ai/REFERENCE/complete-game-tests.md` — operator docs

**Modified (3):** `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-15801), `docs/ai/work-packets/WORK_INDEX.md` (flip WP-158 to `[x]`)

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` = baseline + new tests, 0 failures, 0 skipped
- [ ] Verification Step 3 (recorder regenerates sentinel byte-identically except `name`) passes
- [ ] Verification Step 4 (`git diff main -- packages/game-engine/src/replay/` empty) passes
- [ ] Verification Steps 5 & 6 (forbidden-import + forbidden-randomness greps) return zero matches
- [ ] Verification Step 8 (deliberate-mutation smoke test) passes then reverts cleanly
- [ ] Sentinel fixture's `name` field matches filename basename `sentinel-core-doom-2p`
- [ ] Sentinel fixture's `meta.version === 1`, `meta.createdAt` is ISO 8601, `meta.engineVersion` populated
- [ ] STATUS.md, DECISIONS.md (D-15801), WORK_INDEX.md (WP-158 → `[x]`) all updated
- [ ] Commit message body declares `01.5 NOT INVOKED`

## Common Failure Smells
- "Recorder says pass, test says fail" → recorder and runner have diverged dispatch loops; recorder is reimplementing instead of calling `runFixture`
- Hash differs across machines / Node versions → canonical-JSON rule violated (number formatting, key sort, or arrays accidentally sorted)
- Off-by-one snapshot count → captured before/during `endTurn` instead of after stage reset + player rotation; OR `snapshotPerTurn.length !== completedTurnCount` assertion missing
- `messages` carries "unknown move name" warnings → MOVE_MAP missing entry; should THROW, not warn (the `replay.execute.ts` warn-and-continue is intentionally not adopted)
- Test passes once then fails on rerun → mulberry32 instance shared across fixture invocations; each `runFixture` call must instantiate fresh
- Tests interfere with each other → per-fixture isolation broken; check that test driver constructs fresh G + PRNG per fixture, not module-level
- "Fixture has N moves past endgame" error → recorder over-captured (autoplay policy returned moves after endgame triggered) OR hand-written fixture's move list extends past the evaluateEndgame trigger
- Driver silently skips a fixture → `validateFixture` failure swallowed; driver must surface via `assert.fail`, never `try/catch` swallow
- `name`/filename drift → fixture was renamed on disk but `name` field wasn't updated (or vice versa); validator catches this at load
