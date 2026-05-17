# WP-158 — Complete-Game Regression Tests (Seed-Faithful Fixture Harness)

**Status:** Draft (Needs review)
**Primary Layer:** Game Engine (`packages/game-engine/src/test/fixtures/**`) + scripts
**Dependencies:** WP-013, WP-027, WP-036, WP-079, WP-080 (all Done)
**EC:** [EC-172](../execution-checklists/EC-172-complete-game-regression-tests.checklist.md)
**Baseline:** `origin/main` at `e60ee59` (WP drafted 2026-05-16). Execution session re-confirms baseline at start.
**01.5:** NOT INVOKED — no modification to `LegendaryGameState`, `buildInitialGameState`, `LegendaryGame.moves`, or any phase hook

---

## Goal

After this packet, the engine has a fixture-driven regression suite that
replays a complete game from setup to endgame against a pinned baseline.
The deliverable is the harness (driver, hash helper, schema), a CLI
recorder, one sentinel fixture proving the end-to-end pipeline, and the
operator documentation. A subsequent follow-up WP grows the fixture
corpus; this WP ships the rails.

The harness is **engine-only** (no boardgame.io server, no Socket.IO
transport) and uses a **seed-faithful mulberry32 shuffle** so the same
fixture replays byte-identically on any machine. It does not modify
`packages/game-engine/src/replay/replay.execute.ts`, which remains
contract-locked as the determinism-only harness under D-0205. The new
harness is the seed-faithful pipeline that D-0205 anticipated as a
separate addition.

---

## Assumes

- `pnpm install` and `pnpm -r build` exit 0 against `main`.
- `pnpm --filter @legendary-arena/game-engine test` passes on `main` (705 tests baseline per WP-151 row in WORK_INDEX.md).
- `packages/game-engine/src/replay/replay.types.ts` exports `ReplayInput` and `ReplayMove` with the shapes documented in the file header (verified at read time).
- `packages/game-engine/src/simulation/simulation.runner.ts` exports `runSimulation` and contains the locally-defined `hashSeedString`, `createMulberry32`, and `shuffleWithPrng` helpers (per WP-036 Scope Lock — they remain unexported and are referenced as a structural precedent, not imported).
- `packages/game-engine/src/test/mockCtx.ts` exports `makeMockCtx` with `MockCtxOverrides`.
- `packages/game-engine/src/persistence/snapshot.create.ts` exports `createSnapshot(G, ctx, matchId) → Readonly<MatchSnapshot>`.
- `packages/game-engine/src/setup/buildInitialGameState.ts` exports `buildInitialGameState(config, registry, setupContext)`.
- `packages/game-engine/src/endgame/endgame.evaluate.ts` exports `evaluateEndgame(G)` returning `null` or an outcome object.
- Card registry data at `data/cards/*.json` is loadable via the existing test-fixture pattern (empty-list `CardRegistryReader` stub is sufficient for hand-crafted setup configs; one real-data setup config is used by the sentinel fixture).
- The MVP card set covered by the sentinel fixture (`core/dr-doom` mastermind, one core scheme, one core villain group, one core henchman group, one core hero deck) exists in the registry on `main`.

If any of the above is false, this packet is **BLOCKED**.

---

## Context

The engine has ~705 tests as of WP-151 (per WORK_INDEX.md), all of which exercise **fragments** of play — a turn, a phase, a single rule hook, a single move. None replays a **complete game from setup to endgame** against a pinned baseline. A refactor that quietly changes draw order, message wording, or endgame-counter math can pass `pnpm test` and only surface during live play. The recent autoplay-bot work (commits `4787723`, `384d684`, `e60ee59`, `5c8e3c9`) is exactly the kind of churn this gap leaves unguarded — each commit fixed a player-visible behavior, but a regression in any of them would not be caught by the existing test suite until a human noticed during play.

This WP closes that gap with a **fixture-driven regression suite**: small JSON files capturing the full input (seed + setup + ordered moves) and the full output trajectory (final state hash + message log + per-turn snapshots + outcome) of complete games. The driver replays each fixture and asserts trajectory equivalence; bug fixes become pinned fixtures that cannot silently regress; intentional behavior changes break fixtures noisily and force regenerate-and-review (the snapshot-test pattern, applied to whole games).

**Prior art:** `packages/game-engine/src/replay/replay.execute.ts` (WP-027, narrowed by WP-079, extended by WP-080) is the closest architectural sibling — but it's contract-locked under D-0205 as the determinism-only harness using reverse-shuffle, deliberately not seed-faithful. Its own docstring says "a future feature that reconstructs the `ctx.random.*` sequence ... must therefore be built on a separate pipeline gated on D-0203; this function cannot substitute for one." This WP IS that separate pipeline, scoped to engine-only regression testing (not production replay reconstruction, which remains a future feature). `packages/game-engine/src/simulation/simulation.runner.ts` (WP-036) is the second precedent: it already runs full games with seed-faithful mulberry32 + a local `MOVE_MAP`, but discards the move list. The new fixture harness mirrors WP-036's primitives and dispatch shape exactly — same `hashSeedString`, same `createMulberry32`, same `shuffleWithPrng`, same `MOVE_MAP` pattern — applied in the opposite direction (consume a recorded move list, produce trajectory; not consume a policy, discard moves).

**Why a single WP (not split):** all new code lives under `packages/game-engine/src/test/fixtures/**` + one CLI script + one doc — 7 new files, 3 modified governance docs, 10 files total. No existing engine, registry, server, or preplan code is modified. The work is a single-layer addition with no contract crossings. Splitting (e.g., "harness first, fixtures second") would create an artificial seam: the harness without at least one fixture has no test coverage and no proof it works end-to-end. Better to ship a working pipeline with one sentinel fixture and defer the broader fixture corpus to a follow-up WP that adds N more fixtures, none of which require harness changes.

**Authority chain (read order at execution):**

- `.claude/CLAUDE.md`
- `.claude/rules/architecture.md` §Layer Boundary
- `.claude/rules/game-engine.md` (entire file — applies to every new file under `packages/game-engine/**`)
- `.claude/rules/code-style.md`
- `docs/ai/ARCHITECTURE.md` §Layer Boundary (Authoritative), §The Rule Execution Pipeline, §Persistence Boundaries
- `docs/ai/DECISIONS.md` — scan for: D-0201 (Replay as a First-Class Feature), D-0205 (RNG Truth Source for Replay), D-2705 (static MOVE_MAP precedent), D-2801 (local structural interface), D-3601 (engine category — no registry runtime import), WP-036 Scope Lock notes
- `docs/ai/MOVE_LOG_FORMAT.md` §Known Gaps / Risks Gap #4
- `docs/ai/REFERENCE/00.2-data-requirements.md` §8.1 (`MatchSetupConfig` 9 locked fields), §7.1 (`CardExtId`)
- `docs/ai/REFERENCE/00.6-code-style.md` (entire file — every produced source file must satisfy these rules)
- This WP (WP-158) and its EC-172
- `docs/ai/work-packets/WP-027-determinism-and-replay-verification-harness.md` (the original replay-harness packet)
- `docs/ai/work-packets/WP-079-engine-replay-harness-determinism-only.md` (the D-0205 narrowing)
- `docs/ai/work-packets/WP-080-replay-harness-step-level-api.md` (`applyReplayStep` precedent)
- `docs/ai/work-packets/WP-036-ai-playtesting-and-balance-simulation.md` (mulberry32 + MOVE_MAP pattern this harness mirrors)
- `packages/game-engine/src/replay/replay.execute.ts` (the file we must NOT modify)
- `packages/game-engine/src/simulation/simulation.runner.ts` (the structural precedent)

---

## Scope (In)

- New directory `packages/game-engine/src/test/fixtures/` containing the harness modules and one sentinel fixture
- New CLI `scripts/record-game-fixture.mjs` (autoplay-mode + explicit-moves-mode)
- New operator doc `docs/ai/REFERENCE/complete-game-tests.md`
- `docs/ai/DECISIONS.md` — append a single decision entry recording the seed-faithful-pipeline choice and the `replay.execute.ts` non-modification commitment (D-15801)
- `docs/ai/STATUS.md` — append a dated session-completion entry
- `docs/ai/work-packets/WORK_INDEX.md` — flip the WP-158 row from `[ ]` to `[x]` with commit hash on completion (the row is added in a separate governance commit per the Adding-a-New-Work-Packet workflow, see §Verification Steps)

## Out of Scope

- Any change to `packages/game-engine/src/replay/**` — `replay.execute.ts` is contract-locked under D-0205 and stays that way
- Any change to `packages/game-engine/src/simulation/**` — the structural precedent is referenced, not imported or refactored
- Any change to `packages/game-engine/src/moves/**`, `packages/game-engine/src/turn/**`, `packages/game-engine/src/villainDeck/**`, `packages/game-engine/src/persistence/**`, `packages/game-engine/src/endgame/**` — the harness consumes these layers, never modifies them
- Any change to `packages/game-engine/src/game.ts` or the registered `LegendaryGame.moves` map
- Full-stack server-driven fixtures (boardgame.io `Master` + Socket.IO transport) — the engine-only surface is the user's explicit choice; a future WP may add a sibling full-stack harness
- Production replay of real `ctx.random.*` sequences from live matches — that remains a future feature gated on D-0203, not this WP
- Auto-regeneration of fixtures on commit — humans review the diff; no pre-commit hook is added
- Growing the fixture corpus beyond one sentinel fixture — the harness is the contract this WP ships; new fixtures land in a follow-up WP as bugs are pinned
- Any modification to existing tests under `packages/game-engine/src/**/*.test.ts` — the existing 705 baseline must remain unchanged in count and behavior
- Any new npm dependency — the harness uses only Node v22+ built-ins (`node:crypto`, `node:fs/promises`, `node:path`, `node:test`, `node:assert/strict`). Schema validation is hand-written, not Zod, to keep the engine package's dependency surface unchanged.
- A `--strict` recorder flag (would fail on extra moves past endgame, unused snapshots, unexpected messages). Initial recorder is unconditionally strict at endgame termination per the locked constraint above; the optional flag-controlled extension is deferred to a follow-up WP if a non-strict recording mode is ever needed for debugging.
- Fixture format version increments (`meta.version > 1`). The current schema ships at version 1; any future schema change is a separate WP that bumps the validator and migrates existing fixtures.

---

## Files Expected to Change

**New files (7):**

- `packages/game-engine/src/test/fixtures/fixtureSchema.ts` — new — TypeScript types (`FixtureFile`, `FixtureRunResult`, `FixtureMeta`, `FixtureInput`, `FixtureExpected`) and a hand-written `validateFixture(input, filenameBasename)` for the `.replay.json` format. Fixture shape: `{ name, meta: { version: 1, createdAt: ISO8601, engineVersion }, input: { seed, playerCount, playerOrder, setupConfig, moves }, expected: { finalStateHash, messages, snapshotPerTurn, outcome } }`. Validator rejects mismatched `name`/filename, missing/wrong `meta.version`, missing `meta.engineVersion`, non-ISO-8601 `meta.createdAt`. No Zod dependency added.
- `packages/game-engine/src/test/fixtures/hashGameState.ts` — new — canonical-JSON-serialization helper (sorted keys, deterministic ordering) + `node:crypto` sha256 producing the `finalStateHash` oracle.
- `packages/game-engine/src/test/fixtures/runFixture.ts` — new — the seed-faithful play-the-moves loop. Reads a fixture, builds initial state via `buildInitialGameState`, dispatches each move via a locally-defined `MOVE_MAP` (mirroring the WP-036 precedent), uses a mulberry32 shuffle bound to the fixture's `seed`, captures per-turn snapshots via `createSnapshot`, returns a result block matching the fixture's `expected` shape. No `boardgame.io` import.
- `packages/game-engine/src/test/fixtures/replayFixtures.test.ts` — new — `node:test` driver. Globs `packages/game-engine/src/test/fixtures/games/*.replay.json` at test time. For each fixture: invokes `runFixture`, computes the three oracle layers (`outcome`, `messages`, `finalStateHash`), asserts with `node:assert/strict`. On mismatch, reports the first failing oracle layer to point the diff at the right grain.
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json` — new — the sole initial fixture. Hand-crafted 2-player game with `core/dr-doom` mastermind, a small move sequence that reaches an endgame condition deterministically. Proves the harness end-to-end. Future fixtures land in a follow-up WP.
- `scripts/record-game-fixture.mjs` — new — CLI recorder. Two modes: `--policy random|heuristic` (autoplay-mode, reuses the same seed-faithful loop as `runFixture` plus the policies from `packages/game-engine/src/simulation/`) and `--input <path>` (explicit-moves mode, reads a hand-written `input` block, runs the loop, emits the full fixture). Both modes write the resulting fixture JSON to disk under `packages/game-engine/src/test/fixtures/games/`.
- `docs/ai/REFERENCE/complete-game-tests.md` — new — operator documentation. Covers: fixture format, the three oracle layers, how to add a fixture, how to regenerate one after an intentional behavior change, the engine-only-fidelity limitation, the seed-domain-is-fixture-internal limitation, the phase-hook-gap limitation.

**Modified files (3):**

- `docs/ai/DECISIONS.md` — modified — append a single new section dated 2026-05-16 (`## 2026-05-16 — D-15801 — Seed-Faithful Fixture Harness as a Separate Pipeline from replay.execute.ts`) recording: (a) the choice of mulberry32 over reverse-shuffle for fixtures; (b) the non-modification commitment to `replay.execute.ts`; (c) the engine-only-surface scope; (d) the deferral of full-stack and production-replay variants.
- `docs/ai/STATUS.md` — modified — append a dated entry under `## 2026-05-16 — WP-158 Complete` summarizing what shipped.
- `docs/ai/work-packets/WORK_INDEX.md` — modified — add a new row in Phase 7 listing WP-158, then on Definition-of-Done flip the row from `[ ]` to `[x] WP-158 — Complete-Game Regression Tests (Seed-Faithful Fixture Harness) — Done YYYY-MM-DD (commit <hash>)`.

---

## Contract

The surfaces this WP locks (and that future WPs may consume without re-deriving):

### Fixture file format (`*.replay.json`)

```jsonc
{
  "name": "<must equal filename basename, excluding .replay.json>",
  "meta": {
    "version": 1,
    "createdAt": "<ISO 8601 timestamp>",
    "engineVersion": "<git short SHA or semver at record time>"
  },
  "input": {
    "seed": "<string; transformed via hashSeedString → mulberry32>",
    "playerCount": <number>,
    "playerOrder": ["0", "1", ...],
    "setupConfig": { /* MatchSetupConfig — 9 locked fields per 00.2 §8.1 */ },
    "moves": [
      { "playerId": "0", "moveName": "drawCards", "args": { "count": 6 } },
      { "playerId": "0", "moveName": "revealVillainCard", "args": null }
    ]
  },
  "expected": {
    "finalStateHash": "<64-char lowercase hex sha256 of canonical-JSON-serialized G>",
    "messages": [ /* G.messages verbatim, byte-identical */ ],
    "snapshotPerTurn": [ /* createSnapshot() output, one per completed turn */ ],
    "outcome": { "winner": "<heroes-win|villains-win|null>", "counters": { /* G.counters */ } }
  }
}
```

The `input` block structurally extends `ReplayInput` from `packages/game-engine/src/replay/replay.types.ts` (Class 2 persistable shape, already a stable contract) with an explicit `playerCount` field. The `expected` block, `meta` block, and field names are locked by this WP.

### Harness API (importable from `packages/game-engine/src/test/fixtures/`)

- `validateFixture(input: unknown, filenameBasename: string): FixtureFile` — schema validator; throws full-sentence error on violation.
- `runFixture(fixture: FixtureFile, registry: CardRegistryReader): FixtureRunResult` — pure function; deterministic; same inputs always produce same outputs. `FixtureRunResult` carries `finalStateHash: string`, `messages: string[]`, `snapshotPerTurn: MatchSnapshot[]`, `outcome: object | null`.
- `hashGameState(state: LegendaryGameState): string` — canonical-JSON sha256 (ASCII-lex key sort, preserved array order, omitted-undefined, native numbers, 64-char lowercase hex).

### Oracle layers (asserted in this order; first failure determines the diff grain)

1. `outcome` — coarsest; flips on winner/loser change or endgame-counter divergence.
2. `messages` — readable diff; first divergent index points at the turn-and-action where behavior changed.
3. `finalStateHash` — tightest; catches subtle state-placement differences the message log doesn't surface.

### Recorder CLI (`scripts/record-game-fixture.mjs`)

- `--name <fixture-name>` (required)
- `--seed <seed-string>` (required)
- `--created-at <ISO 8601 timestamp>` (required; operator-supplied — recorder MUST NOT read wall-clock)
- `--engine-version <git SHA or semver>` (required; operator-supplied — recorder MUST NOT shell out to git)
- `--policy random|heuristic --setup <setup-json-path>` (autoplay mode) OR `--input <input-block-path>` (explicit-moves mode); exactly one mode required
- `--max-moves <N>` (default `10000`; throws on overflow)

Both modes call `runFixture` for dispatch — duplicating the loop is FORBIDDEN. Output is byte-stable across repeat invocations on identical input (which requires `--created-at` and `--engine-version` to be the same; the operator supplies both, so byte-stability is operator-controlled).

**Operator workflow note:** to record a new fixture, the typical invocation is a one-line shell wrapper that captures the current time and git SHA before invoking the recorder, e.g., `node scripts/record-game-fixture.mjs --created-at "$(Get-Date -Format 'o')" --engine-version "$(git rev-parse --short HEAD)" --name ... --seed ...`. The recorder itself stays pure; the wall-clock and git reads happen in the operator's shell.

### Behavioral contract enforced by `runFixture`

- Exactly one mulberry32 PRNG per invocation, seeded from `hashSeedString(input.seed)`.
- `ReplayMove` objects dispatched to `MOVE_MAP` opaquely; no normalization, no defaulting, no key reordering.
- Loop terminates immediately when `evaluateEndgame(G)` returns non-null; remaining moves throw `"Fixture <name> has N moves past endgame at turn T"`.
- `snapshotPerTurn.length === completedTurnCount` asserted at end-of-run.
- `messages` read byte-identically from `G.messages`; no filtering, no reformatting, no reconstruction.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. No diffs. No snippets. No "show only the changed section" output anywhere.
- ESM only. Node v22+ built-ins only. No CommonJS, no `require()`.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`. Every produced source file must satisfy §16.1 through §16.7 of `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`.
- No `Math.random()`, no `Date.now()`, no `performance.now()`, no `new Date()`, no `process.env` read, no shelling out to `git` — anywhere under `packages/game-engine/src/test/fixtures/**` OR `scripts/record-game-fixture.mjs`. The recorder receives all time/version data via required CLI flags (`--created-at`, `--engine-version`), which arrive through `process.argv` (always permitted; that's how Node CLIs work). The full forbidden list of imports, I/O surfaces, wall-clock reads, and randomness sources is governed by D-3701; see that entry for the authoritative enumeration.
- No `.reduce()` with branching logic — use `for...of` (per §16.2).
- Every `ctx.events.endTurn()` or `ctx.events.setPhase()` call (if any are added — none should be needed here) requires a `// why:` comment.

**Packet-specific:**

- The new harness MUST NOT import `boardgame.io` directly or transitively. Move functions imported from `packages/game-engine/src/moves/**` already use the WP-080 local-structural-interface pattern (D-2801); the new harness uses the same pattern.
- The new harness MUST NOT import `@legendary-arena/registry`. The test driver constructs a minimal `CardRegistryReader` stub; the sentinel fixture's `setupConfig` is hand-crafted to be valid against the existing registry contract but the test driver does not read registry data at runtime.
- The new harness MUST NOT modify `packages/game-engine/src/replay/replay.execute.ts` or any other file under `packages/game-engine/src/replay/**`. D-0205 stands; the new harness is the separate seed-faithful pipeline D-0205 anticipated.
- The new harness MUST NOT modify any file under `packages/game-engine/src/simulation/**`. The mulberry32 + MOVE_MAP precedent is mirrored locally per the WP-036 Scope Lock convention (small PRNG helpers duplicated locally rather than extracted to a shared module).
- No new npm dependency is introduced. The harness uses Node v22+ built-ins only. Schema validation is hand-written, not Zod, to keep the engine package's dependency surface unchanged.
- The sentinel fixture's `finalStateHash`, `messages[]`, and `snapshotPerTurn` values MUST be produced by running `scripts/record-game-fixture.mjs` against the fixture's `input` block — never hand-edited. If the recorder produces different values than the committed fixture file, the fixture is wrong and the recorder is the truth.
- File globbing in `replayFixtures.test.ts` uses Node v22's `node:fs/promises.readdir` — no third-party glob library.
- **`ReplayMove` is opaque to the harness.** Between fixture parse and `MOVE_MAP` dispatch, `ReplayMove` objects MUST be passed through unchanged — no normalization, no enrichment, no defaulting of missing fields, no key reordering. The fixture is the source of truth for what was recorded; the harness is a faithful re-executor, not a transformer.
- **Single PRNG instance per fixture run.** Exactly one mulberry32 instance is constructed per fixture invocation, seeded from `hashSeedString(input.seed)`. No secondary PRNG may be created during a fixture run for shuffle, decision, or any other purpose. Move-time `random.Shuffle` calls all draw from the same instance.
- **Endgame termination is hard.** The dispatch loop MUST terminate immediately when `evaluateEndgame(G)` returns a non-null outcome. If the fixture contains additional `moves[]` entries beyond the move that triggered termination, the driver MUST surface a full-sentence error (`"Fixture <name> has N moves past endgame at turn T"`) — this is a fixture-corruption signal, not a soft warning.
- **Per-fixture test isolation.** Each fixture executed by `replayFixtures.test.ts` constructs a fresh `LegendaryGameState` (via `buildInitialGameState`) and a fresh mulberry32 instance. No game state, PRNG state, or message buffer is shared across fixtures. Each test case is a closed reproduction.
- **Fixture identity coupling.** The fixture's `name` field MUST equal its filename basename (excluding `.replay.json`). `validateFixture` rejects mismatches with a full-sentence error. This invariant prevents misaligned diffs, incorrect fixture reuse, and CI confusion when fixtures are renamed on one side but not the other.
- **Wall-clock and git purity (D-3701 alignment).** Neither the harness files (`packages/game-engine/src/test/fixtures/**`) NOR the recorder CLI (`scripts/record-game-fixture.mjs`) may read `Date.now()`, `new Date()`, `performance.now()`, or shell out to `git`. `meta.createdAt` and `meta.engineVersion` are supplied by the operator via required CLI flags (`--created-at`, `--engine-version`); the recorder propagates them into the fixture file as opaque strings. Verification Step 6's forbidden-randomness grep targets both the harness AND the recorder unchanged — no exception needed.

**Session protocol:**

- If the recorded `setupConfig` cannot be satisfied by the registry on `main` at execution time (e.g., a referenced scheme was renamed), STOP and ASK before adjusting the fixture. Do not silently substitute a different scheme/mastermind — the fixture identity is load-bearing.
- If `runFixture` produces a different `finalStateHash` on a clean checkout than what the recorder emits, STOP. The harness has a determinism bug and must be fixed before any fixture is committed. Do not commit a fixture whose hash depends on the machine that recorded it.
- If a fixture's `name` field does not match its filename basename (excluding `.replay.json`), `validateFixture` MUST throw. Do not silently rename either the `name` field or the file — STOP and ASK which side is correct.
- If `runFixture`'s in-process double-run produces different results within the same process, STOP. The harness has hidden mutable state leakage; fix the root cause before any fixture is committed.
- If `pnpm --filter @legendary-arena/game-engine test` baseline drifts from 705 to a different number between WP-151 and this WP's execution, re-confirm the baseline with the user before proceeding.

**Locked contract values:**

- The 9 fields of `MatchSetupConfig` (per 00.2 §8.1): `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`.
- Set-qualified `<setAbbr>/<slug>` ID format on all five entity-ID fields (per WP-113 / D-10014).
- Card type slug grammar uses hyphens, never underscores (per WP-014 convention; `'scheme-twist'` correct, `'scheme_twist'` wrong).
- `REVEALED_CARD_TYPES`, `MATCH_PHASES`, `TURN_STAGES`, `CORE_MOVE_NAMES`, `RULE_TRIGGER_NAMES`, `RULE_EFFECT_TYPES` are canonical readonly arrays — the harness must read move names from constants, never hardcode strings.
- The fixture-level oracle field names (`finalStateHash`, `messages`, `snapshotPerTurn`, `outcome`) and meta field names (`name`, `createdAt`, `engineVersion`, `version`) are locked by this WP; future fixtures must use these exact field names.
- **Messages source of truth:** the fixture's `expected.messages` array is derived exclusively from the engine's `G.messages: string[]` event log (the deterministic append-only surface established by WP-009B and reaffirmed across the engine convention table). Reconstructing messages from state deltas, filtering them, or reformatting them is FORBIDDEN — the harness reads `G.messages` byte-identically into the fixture.
- **Fixture format version:** `meta.version = 1` (current schema). Future schema changes increment this integer and update the validator; the driver rejects unknown versions with a full-sentence error naming the file and version number.
- **Recorder output byte-stability:** for identical input (same fixture name, same seed, same setup config, same move list OR same policy + same seed), the recorder produces byte-identical fixture JSON across runs. Object key ordering, array ordering, and numeric formatting are all stable across machines and Node v22 patch versions.

---

## Vision Alignment

**Vision clauses touched:** §3 (deterministic engine), §8 (RNG sourcing), §18 (replays as a first-class artifact), §22 (replay-faithfulness and competitive integrity).

**Conflict assertion:** No conflict — this WP preserves all touched clauses. The harness is engine-only and does not interact with leaderboards, PAR publication, or competitive replay verification (Vision §22 surfaces). It adds a regression net behind the existing determinism contract; it does not loosen any guarantee.

**Non-Goal proximity check:** None of NG-1..7 are crossed. The harness is developer-facing test tooling. No user-visible surface, no monetization surface, no competitive surface.

**Determinism preservation:** The new harness is deterministic by construction. Given identical fixture inputs (`seed`, `setupConfig`, `playerOrder`, `moves`), the harness produces byte-identical `finalStateHash`, `messages[]`, and `snapshotPerTurn` outputs across machines, runs, and Node versions within the v22 line. The harness does not introduce any new source of nondeterminism into the engine; it consumes the existing engine surface as-is and asserts its trajectory against pinned baselines. `replay.execute.ts`'s D-0205 determinism-only claim is preserved — the new harness is the separate seed-faithful pipeline D-0205 anticipated, not a modification of the existing one.

---

## Funding Surface Gate

N/A — this WP touches no §20.1 trigger surface: no global navigation funding affordances, no registry-viewer funding surfaces, no profile or account funding attribution surfaces, no tournament funding channels, no user-visible copy referencing donation or tournament funding. The deliverables are engine-internal test harness modules, a CLI recorder, and an operator-facing reference document — all developer-facing, none user-facing.

---

## API Catalog Update

N/A — this WP touches no §21.1 trigger surface: no HTTP endpoints are added, modified, removed, or status-changed in `apps/server`; no library functions reachable via direct import from `apps/server/src/**` recorded in the catalog as `Library-only` are added, modified, removed, or status-changed. The new files live under `packages/game-engine/src/test/fixtures/` and `scripts/`; neither path is reachable from `apps/server/src/**` and neither produces an HTTP surface.

---

## Acceptance Criteria

1. `packages/game-engine/src/test/fixtures/fixtureSchema.ts` exists, exports a `FixtureFile` TypeScript interface, and exports a `validateFixture(input: unknown, filenameBasename: string): FixtureFile` function that throws with a full-sentence message identifying the failing field on schema violations. The validator REJECTS fixtures with: missing or non-`1` `meta.version`; missing or non-ISO-8601 `meta.createdAt`; missing `meta.engineVersion`; `name` not equal to `filenameBasename`.
2. `packages/game-engine/src/test/fixtures/hashGameState.ts` exists and exports `hashGameState(state: LegendaryGameState): string` returning a 64-character lowercase hex sha256 of the canonical-key-sorted JSON serialization of `state` (object keys ASCII-lex sorted; arrays preserve original order; `undefined` omitted; `null` preserved; numbers native JSON).
3. `packages/game-engine/src/test/fixtures/runFixture.ts` exists, exports `runFixture(fixture: FixtureFile, registry: CardRegistryReader): FixtureRunResult` (where `FixtureRunResult` carries `finalStateHash`, `messages`, `snapshotPerTurn`, `outcome`), and at runtime: (a) constructs exactly one mulberry32 PRNG per invocation, seeded via `hashSeedString(fixture.input.seed)`; (b) dispatches each `ReplayMove` opaquely to `MOVE_MAP` with no transformation; (c) terminates the dispatch loop the first time `evaluateEndgame(G)` returns non-null and throws a full-sentence error if any `moves[]` remain; (d) captures one `snapshotPerTurn` entry per completed turn, asserting at end-of-run that `snapshotPerTurn.length === completedTurnCount`; (e) reads `messages` from `G.messages` with no filtering or reformatting, AND returns them as a defensive shallow copy (`[...G.messages]`) to prevent caller aliasing per WP-028 / D-2802 precedent. Contains no `boardgame.io` import, no `@legendary-arena/registry` import, no `Math.random` call, no `.reduce()` with branching logic.
4. `packages/game-engine/src/test/fixtures/replayFixtures.test.ts` exists, uses `node:test` + `node:assert/strict`, runs each fixture with a freshly-constructed game state and PRNG instance (no cross-fixture shared state), executes the dispatch loop twice in-process per fixture and asserts byte-identical results before comparing to `expected`, then asserts the three oracle layers in the order `outcome` → `messages` → `finalStateHash`, reporting the first failing layer with a descriptive `assert.fail` message naming the fixture, the failing oracle, the first mismatching index (for array oracles), and expected-vs-actual truncated to 200 chars per side.
5. `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json` exists, parses as JSON, satisfies `validateFixture`, and is replayed successfully by the driver in criterion 4 (all three oracles pass).
6. `scripts/record-game-fixture.mjs` exists, calls `runFixture` (or a shared helper) for its dispatch loop — duplicating the loop is FORBIDDEN. Accepts `--name <fixture-name>`, `--seed <seed-string>`, `--created-at <ISO8601>` (REQUIRED — operator-supplied; recorder MUST NOT read `Date.now()` / `new Date()` internally), `--engine-version <string>` (REQUIRED — operator-supplied git SHA or semver; recorder MUST NOT shell out to `git` internally), and either `--policy random|heuristic --setup <setup-json-path>` or `--input <input-block-path>`, defaults `--max-moves` to 10000 (throws full-sentence error on overflow), and on success writes a complete fixture file (including `meta.version: 1` + operator-supplied `meta.createdAt` + operator-supplied `meta.engineVersion`) to `packages/game-engine/src/test/fixtures/games/<fixture-name>.replay.json` with byte-stable output across repeat invocations on the same input.
7. `pnpm --filter @legendary-arena/game-engine test` exits 0 with the baseline test count (per `## Assumes`) plus the new fixture-driver test(s) fully accounted for (one test per fixture or one driver test, either is acceptable).
8. `pnpm -r build` exits 0 — the new TypeScript files type-check cleanly under the engine package's existing `tsconfig.json`.
9. `docs/ai/REFERENCE/complete-game-tests.md` exists and documents: the fixture file format with a full example, the three oracle layers and what each catches, the regeneration workflow, the recorder/runner shared-loop invariant, the messages-from-`G.messages` rule, and the three documented limitations (engine-only fidelity, seed-domain-is-fixture-internal, phase-hook gaps).
10. `docs/ai/DECISIONS.md` contains a new section `## 2026-05-16 — D-15801 — Seed-Faithful Fixture Harness as a Separate Pipeline from replay.execute.ts` with **Decision:**, **Rationale:**, **Alternatives rejected:**, and **Packet:** subsections.
11. A grep over `packages/game-engine/src/test/fixtures/**` and `scripts/record-game-fixture.mjs` for the literal token `boardgame.io` returns zero hits (per D-3701 forbidden-import enumeration).
12. A grep over `packages/game-engine/src/replay/**` for any modification timestamp newer than `main`'s baseline returns nothing — the contract-locked replay harness is untouched.

---

## Verification Steps

Run each command in PowerShell from the worktree root. Expected output shown inline.

```pwsh
# 1) Engine package type-checks and builds.
pnpm -r build
# Expected: all packages exit 0; no TypeScript errors.

# 2) Engine test suite runs with the new fixture driver.
pnpm --filter @legendary-arena/game-engine test
# Expected: baseline test count + N (where N = 1 per-driver or per-fixture, accounted for in step 7 of Acceptance Criteria). Exit code 0.

# 3) Recorder CLI reproduces the sentinel fixture byte-identically.
node scripts/record-game-fixture.mjs --name sentinel-core-doom-2p-reproduction --input packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json
# Then diff the regenerated file against the committed sentinel — they must be byte-identical except for the file name field.
# Use git diff or fc.exe; exact command:
git diff --no-index packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p-reproduction.replay.json
# Expected: only the "name" field differs. All hash, message, and snapshot fields are identical.
# Then delete the reproduction file so it doesn't pollute the test suite:
Remove-Item packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p-reproduction.replay.json

# 4) Replay-harness non-modification check.
git diff main -- packages/game-engine/src/replay/
# Expected: empty output (no diff). The contract-locked replay harness is untouched.

# 5) Forbidden-import grep (per D-3701).
Get-ChildItem -Recurse -File packages/game-engine/src/test/fixtures, scripts/record-game-fixture.mjs | Select-String -Pattern "boardgame\.io" -SimpleMatch
# Expected: no matches.

# 6) Forbidden randomness grep.
Get-ChildItem -Recurse -File packages/game-engine/src/test/fixtures, scripts/record-game-fixture.mjs | Select-String -Pattern "Math\.random|Date\.now|performance\.now|new Date\("
# Expected: no matches. (The harness uses only mulberry32 PRNG seeded from the fixture's seed string.)

# 7) Documentation file exists and is non-empty.
Test-Path docs/ai/REFERENCE/complete-game-tests.md
(Get-Item docs/ai/REFERENCE/complete-game-tests.md).Length -gt 0
# Expected: True; True.

# 8) Deliberate-mutation smoke test (run AFTER step 2 passes, then revert).
# In a scratch edit, change drawCards' default count from 6 to 5 inside packages/game-engine/src/moves/coreMoves.impl.ts:
#   (DO NOT COMMIT this change — it is the smoke test.)
# Then re-run:
pnpm --filter @legendary-arena/game-engine test
# Expected: the sentinel fixture's messages oracle fails with a turn-by-turn diff pointing at the changed draw step.
# Revert the edit:
git checkout -- packages/game-engine/src/moves/coreMoves.impl.ts
pnpm --filter @legendary-arena/game-engine test
# Expected: all tests pass again.
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All 12 Acceptance Criteria pass.
- [ ] All 8 Verification Steps execute with the documented expected output (Verification Step 8 is the smoke test; the engine code is reverted before completion).
- [ ] No files outside `## Files Expected to Change` were created or modified.
- [ ] `docs/ai/STATUS.md` updated with a dated `## 2026-05-16 — WP-158 Complete` entry summarizing what shipped.
- [ ] `docs/ai/DECISIONS.md` updated with the `D-15801` entry per Acceptance Criterion 10.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-158 flipped from `[ ]` to `[x] WP-158 — Complete-Game Regression Tests (Seed-Faithful Fixture Harness) — Done YYYY-MM-DD (commit <hash>)`.
- [ ] `packages/game-engine/src/replay/**` has zero modifications relative to baseline `main` (per Verification Step 4).
- [ ] `packages/game-engine/src/simulation/**` has zero modifications relative to baseline `main`.
- [ ] No new npm dependency added (`pnpm install` from a clean state produces no new transitive entries beyond the baseline lockfile).
- [ ] `01.5 NOT INVOKED` is explicitly declared in the session commit message body, per the WP-013-onward convention recorded in WORK_INDEX.md.

---

## Lint Gate Self-Review

Per 00.3 (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`). Performed against this WP at draft time, 2026-05-16.

| § | Check | Result |
|---|---|---|
| §1 Structure | All required sections present (Goal, Assumes, Context, Scope (In)/(Out), Files Expected to Change, Contract, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done); Out of Scope non-empty with ≥2 items | **PASS** (8 Out-of-Scope items listed) |
| §2 Non-Negotiable Constraints Block | Engine-wide constraints present; forbid diffs/snippets; ESM+Node v22+; cite `00.6-code-style.md`; packet-specific constraints + session protocol + locked contract values all present | **PASS** |
| §3 Assumes | Lists prior WPs, file dependencies with required exports, external state, baseline SHA | **PASS** |
| §4 Context References | All refs file-path-specific with section anchors; 00.2 §8.1 cited (touches data shapes); ARCHITECTURE.md §Layer Boundary cited; DECISIONS.md scan list explicit | **PASS** |
| §5 Output Completeness | 10 files marked new/modified with one-line descriptions; no ambiguous output language; the 3 "modified" files are governance-doc appends (standard close-out pattern shared by every WP) | **PASS** (10 ≤ ~8 soft cap; governance-doc appends are not split candidates) |
| §6 Naming Consistency | `MatchSetupConfig` 9 fields, `CardExtId`, `<setAbbr>/<slug>` ID format all cited correctly per 00.2 | **PASS** |
| §7 Dependency Discipline | No new npm dependency; "no new npm dependency" stated explicitly in Out of Scope and Constraints; forbidden packages not enabled | **PASS** |
| §8 Architectural Boundaries | Layer boundaries respected — new files live under `packages/game-engine/src/test/fixtures/` (engine package); explicitly forbids `boardgame.io` and `@legendary-arena/registry` imports; `apps/server` untouched | **PASS** |
| §9 Windows Compatibility | Verification commands use PowerShell idioms (`Get-ChildItem`, `Test-Path`, `Remove-Item`, `Select-String`) | **PASS** |
| §10 Env Var Hygiene | No env vars introduced | **N/A** (no env-var surface) |
| §11 Auth Clarity | No authentication touched | **N/A** (no auth surface anywhere in deliverables) |
| §12 Test Quality | Tests use `node:test` + `node:assert/strict`; no `boardgame.io` import; no network/DB; `makeMockCtx` is the existing reverse-shuffle helper used as-is by setup; harness's seed-faithful mulberry32 shuffle is move-time only (mirrors `simulation.runner.ts` precedent) | **PASS** |
| §13 Commands and Verification | All commands use `pnpm`; verification steps exact with inline expected output | **PASS** |
| §14 Acceptance Criteria Quality | 12 binary acceptance criteria, all observable, all reference specific file paths/function names; multi-clause ACs (#1, #3, #4, #6) are tightly tied to a single observable component | **PASS** |
| §15 Definition of Done | DoD includes STATUS.md / DECISIONS.md / WORK_INDEX.md updates + scope-boundary check + 01.5 declaration | **PASS** |
| §16 Code Style | WP is a spec, not code; the constraints section binds the executor to 00.6 explicitly | **PASS** |
| §17 Vision Alignment | Triggered (RNG sourcing §8, determinism §3, replays §18, §22 competitive integrity); `## Vision Alignment` block present with clause numbers, conflict assertion, NG check, determinism-preservation line | **PASS** |
| §18 Prose-vs-Grep | Verification Steps 5 & 6 grep for forbidden tokens; adjacent prose in Constraints cites D-3701 ("the full forbidden list of imports, I/O surfaces, wall-clock reads, and randomness sources is governed by D-3701") rather than enumerating verbatim | **PASS** |
| §19 Bridge-vs-HEAD Staleness | Not a repo-state-summarizing artifact (no Recent Commits / Repo-State Anchor sections) | **N/A** |
| §20 Funding Surface Gate | No §20.1 trigger surface touched; `## Funding Surface Gate` declares N/A with explicit one-line justification naming why | **PASS** |
| §21 API Catalog Update | No §21.1 trigger surface touched (no HTTP endpoints, no `apps/server/src/**` library functions); `## API Catalog Update` declares N/A with explicit one-line justification | **PASS** |

**Final Gate verdict: PASS.** Zero ❌ FAIL conditions triggered. Three N/A declarations (§10 env vars, §11 auth, §19 bridge-staleness) and two PASS-with-N/A-justification-inside-block (§20 funding gate, §21 API catalog).
