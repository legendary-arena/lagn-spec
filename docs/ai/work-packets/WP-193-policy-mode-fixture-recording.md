# WP-193 — Policy-Mode Fixture Recording (Close WP-158 `--policy` Deferral)

## Goal

After this WP, `scripts/record-game-fixture.mjs --policy <random|heuristic>
--seed <s> --setup <path>` produces a deterministic `.replay.json` fixture
identical in shape to the `--input`-mode output. The recorder closes the
deferral WP-158 explicitly left open ("`--policy` mode is accepted by the
CLI for forward compatibility but is deferred to a follow-up WP …
functional autoplay requires exporting `runFixture` internals or
duplicating the dispatch loop, both of which the WP-158 guardrails
reject").

The architectural seam that resolves the deferral: the existing
simulation runner (`packages/game-engine/src/simulation/simulation.runner.ts`)
is used as a **move generator** that returns a captured
`ReplayMove[]`; that move list then flows through `runFixture` unchanged
(the same path `--input` mode takes today) to produce the `expected`
oracle block. The simulation never produces an oracle; `runFixture`
remains the single oracle source. No second execution path is added; the
existing two paths (`runFixture`, `simulation.runner`) are not
duplicated, and `runFixture`'s public API is not widened.

Out of this WP, WP-194 (matrix sweep) and WP-195 (anomaly oracle) can
both consume the new fixture-generation primitive. Those WPs are NOT
drafted yet — they are strict dependents and are deferred to a paired
draft after WP-193 stabilises.

## Assumes

- WP-158 (Complete-Game Regression Tests) complete ✅
  - `packages/game-engine/src/test/fixtures/runFixture.ts` exports
    `runFixture(fixture: FixtureFile, registry: CardRegistryReader): FixtureRunResult`
  - `packages/game-engine/src/test/fixtures/fixtureSchema.ts` exports
    `validateFixture(parsed: unknown, expectedName: string): FixtureFile`
  - `scripts/record-game-fixture.mjs` exists with `--input` mode wired
    and `--policy` mode CLI-accepted-but-throws (the deferral this WP
    closes)
  - One sentinel fixture exists at
    `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
- WP-036 (Simulation Runner) complete ✅
  - `packages/game-engine/src/simulation/simulation.runner.ts` exports
    `runSimulation(config: SimulationConfig, registry: CardRegistryReader): SimulationResult`
  - Internal per-game function (`simulateOneGame`) exists with a
    per-turn loop:
    `buildUIState → filterUIStateForAudience → getLegalMoves →
     policy.decideTurn() → dispatch via MOVE_MAP`
  - Local `hashSeedString` (djb2) + `createMulberry32` PRNG construction
    matches `runFixture.ts`'s local copies byte-for-byte (this is the
    cross-path determinism contract this WP load-bears on)
- WP-049 (T2 Competent Heuristic AI) complete ✅
  - `createCompetentHeuristicPolicy(seed: string): AIPolicy`
- T1 random policy complete ✅
  - `createRandomPolicy(seed: string): AIPolicy`
- WP-181 (Bot Decision Logging) complete ✅
  - `ClientTurnIntent.decisionLog?: string[]` is additive and optional;
    captured fixtures will carry `[Bot]` decision messages in
    `expected.messages` without any change to this WP
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0
- `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`,
  `docs/ai/REFERENCE/complete-game-tests.md`,
  `docs/ai/work-packets/WORK_INDEX.md`, and
  `docs/ai/execution-checklists/EC_INDEX.md` all exist

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

## Context (Read First)

Before writing a single line:

1. `.claude/CLAUDE.md` — execution checklist authority, lint gate
2. `docs/ai/ARCHITECTURE.md` — §Game Engine Layer, §Move Validation
   Contract, §The Rule Execution Pipeline, §Persistence Boundaries
3. `.claude/rules/architecture.md` — Layer Boundary; pure-helper rule
4. `.claude/rules/code-style.md` — naming, comments, functions
5. `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4, 6, 9, 11, 13, 14
6. `docs/ai/DECISIONS.md` — scan for:
   - **D-0205** — separate seed-faithful pipeline vs
     `replay.execute.ts` (the precedent that authorises a separate
     replay loop and the reason `runFixture` exists alongside
     `replay.execute.ts`)
   - **D-0701** — AI is tooling, not gameplay; receives
     `filterUIStateForAudience` view
   - **D-0702** — balance changes require simulation validation
   - **D-2705** — static MOVE_MAP pattern (the precedent
     `runFixture` + `simulation.runner.ts` both follow)
   - **D-2801** — local structural interface for `FnContext`
   - **D-3604** — two-domain PRNG invariant (policy PRNG never shares
     state with run-level shuffle PRNG); this is the determinism boundary
     WP-193 must preserve
   - **D-15801** — seed-faithful pipeline rationale + the explicit
     commitment NOT to modify `replay.execute.ts`
7. `docs/ai/REFERENCE/complete-game-tests.md` — the operator reference
   for the fixture harness; in particular the §"Recorder `--policy`
   mode is deferred" section (this WP flips that section to
   "implemented in WP-193")
8. `docs/ai/work-packets/WP-158-complete-game-regression-tests.md` —
   the parent WP; especially its §Non-Negotiable Constraints
   (the recorder-must-not-duplicate-loop rule)
9. `docs/ai/execution-checklists/EC-172-complete-game-regression-tests.checklist.md` —
   §Guardrails — Determinism integrity (the shared-loop invariant)
10. `packages/game-engine/src/simulation/simulation.runner.ts` — read
    fully; the per-game function is the structure WP-193 extends
11. `packages/game-engine/src/test/fixtures/runFixture.ts` — read
    fully; verify the PRNG construction matches simulation's
12. `packages/game-engine/src/simulation/ai.types.ts` — `AIPolicy`,
    `LegalMove`, `SimulationConfig`
13. `packages/game-engine/src/replay/replay.types.ts` — `ReplayMove`
    (the move-record shape captured-move-list entries adopt)
14. `scripts/record-game-fixture.mjs` — read fully; the `--input`
    mode is the path `--policy` will join after the move list is
    captured

## Scope (In)

### A) Move-capturing simulation entry point

- **`packages/game-engine/src/simulation/simulation.runner.ts`** —
  **modified**:
  - Extract the per-turn loop currently embedded in `simulateOneGame`
    into an internal helper that accepts an optional
    `onMoveDispatched?: (move: ReplayMove) => void` callback. The
    existing `simulateOneGame` keeps its behaviour by passing
    `undefined`; the dispatch path is unchanged in either case.
  - Export a new function:
    ```typescript
    import type { EndgameOutcome } from '../endgame/endgame.types.js';

    export interface CapturedOutcomeSummary {
      readonly winner: EndgameOutcome | null;
      readonly escapedVillains: number;
    }
    export interface CapturedGameResult {
      readonly moves: readonly ReplayMove[];
      readonly outcome: CapturedOutcomeSummary;
      readonly endgameReached: boolean;
    }
    export function simulateOneGameAndCaptureMoves(
      setupConfig: MatchSetupConfig,
      registry: CardRegistryReader,
      policies: readonly AIPolicy[],
      seed: string,
      gameIndex: number,
    ): CapturedGameResult;
    ```
  - **Why a narrower outcome summary rather than the existing
    internal `GameOutcome`:** the recorder needs just enough to (a)
    compare against the `runFixture` outcome for the round-trip
    test and (b) carry forward into future WP-194/195 consumers
    without coupling them to simulation's full internal aggregate
    shape. The narrower `CapturedOutcomeSummary` (two fields) is
    the minimum sufficient surface; exporting the broader
    `GameOutcome` would widen the simulation module's public
    contract under a packet whose theme is "smallest seam
    possible." If a future WP needs more outcome fields, it adds
    them to `CapturedOutcomeSummary` deliberately rather than
    inheriting them silently from `GameOutcome` evolution.
    - `policies[i]` is applied when the active player's `playerId ===
      String(i)` (same convention as `runSimulation`)
    - `seed` is the run seed; `gameIndex` mirrors `runSimulation`'s
      per-game index so the PRNG stream is identical to game `gameIndex`
      of a `runSimulation` call with the same `(seed, setupConfig,
      policies)`
    - `endgameReached` is `true` iff the loop exited via
      `evaluateEndgame` returning non-null; `false` iff the
      `MAX_TURNS_PER_GAME` cap was hit
  - The callback fires AFTER the move dispatch has returned and the
    `endTurnFlag` has been read (so each captured `ReplayMove` represents
    a successfully-dispatched move, not a candidate); the captured order
    is the dispatch order
  - Add `// why:` comments on:
    - the callback fire site (why-AFTER-dispatch + WP-193 reference)
    - the extracted helper's signature (why a callback rather than a
      mutable parameter)
    - the `CapturedGameResult.endgameReached` field (why this signal
      matters for the recorder, even though WP-193 does not surface a
      "hit-cap" anomaly — that's WP-195's job)

### B) Recorder `--policy` mode

- **`scripts/record-game-fixture.mjs`** — **modified**:
  - Replace the existing `--policy` throw with a real implementation
  - New CLI shape (additive to the existing `--input` mode):
    - `--policy random|heuristic` (REQUIRED in `--policy` mode)
    - `--setup <path>` (REQUIRED in `--policy` mode; path to a JSON
      file matching the canonical setup-envelope shape)
    - `--seed`, `--created-at`, `--engine-version`, `--name`,
      `--max-moves` — same semantics as `--input` mode
  - The `--policy` setup file is the **canonical setup envelope**
    (the shape `apps/arena-client/public/loadout-test.json` uses):
    ```jsonc
    {
      "schemaVersion": "1.0",
      "playerCount": <N>,
      "heroSelectionMode": "GROUP_STANDARD",
      "composition": { /* the 9-field MatchSetupConfig */ }
    }
    ```
    The recorder extracts `composition` and `playerCount`; it
    constructs `playerOrder` as `["0", "1", ..., String(playerCount - 1)]`
    (locked convention — the deterministic seat-ordering source for
    `--policy` mode)
  - `--policy` execution path:
    1. Parse + validate operator meta (`--name`, `--seed`,
       `--created-at`, `--engine-version`) — same path as `--input`
       mode, no inherited-from-fixture path (the setup envelope does
       not carry these fields)
    2. Load and validate the setup envelope JSON; extract
       `composition` and `playerCount`
    3. Build the policy list — one entry per seat, all seats using the
       same policy family, each seat receiving a deterministic
       seat-derived seed:
       - `--policy random` → for `i` in `0..playerCount-1`:
         `createRandomPolicy(\`${operatorMeta.seed}::seat:${i}\`)`
       - `--policy heuristic` → for `i` in `0..playerCount-1`:
         `createCompetentHeuristicPolicy(\`${operatorMeta.seed}::seat:${i}\`)`
       - **Why seat-derived seeds, not the bare run seed for every
         seat:** instantiating every seat's policy with the same
         literal seed is deterministic but produces correlated PRNG
         streams across seats — identical legal-move sets at
         identical filtered UIStates would yield identical
         tie-breaks at every seat. Seat-derived seeds preserve
         determinism while decorrelating seat-local behaviour, which
         keeps future matrix sweeps informative.
       - **Why one policy family across all seats:** WP-193 is
         generating fixtures, not running balance comparisons;
         per-seat policy *family* heterogeneity (random vs heuristic
         head-to-head) is a WP-194 concern. Per-seat *seed* derivation
         is the only intra-policy variation locked here. Both
         decisions are pinned at D-19303 (proposed).
    4. Call `simulateOneGameAndCaptureMoves(composition, EMPTY_REGISTRY,
       policies, operatorMeta.seed, /* gameIndex */ 0)` to capture the
       `ReplayMove[]`
    5. Assemble the bare-input block:
       `{ seed, playerCount, playerOrder, setupConfig: composition,
       moves: capturedResult.moves }`
    6. Call `recordFromInput(input, operatorMeta)` — the existing
       `--input`-mode helper. From this point the path is byte-identical
       to `--input` mode: `validateFixture → runFixture →
       writeFixtureFile`
  - `assertMoveCountUnderCap` continues to apply (this is the
    infinite-loop guard that motivated WP-158's deferral worry — it
    now meaningfully fires in `--policy` mode)
  - The setup envelope's `heroSelectionMode` field is read and
    propagated forward only if the recorder needs it; v1 ignores it
    (the engine's setup pipeline already handles the
    `GROUP_STANDARD` default per D-9301). If a future WP adds
    `heroSelectionMode` plumbing, this WP does not introduce that
    dependency.
  - Add `// why:` comments on:
    - the policy-list construction (D-19303 link)
    - the `playerOrder` derivation (deterministic seat-ordering convention)
    - the captured-moves → `recordFromInput` handoff (the shared-loop
      invariant preservation; WP-158 + EC-172 references)

### C) Reference documentation

- **`docs/ai/REFERENCE/complete-game-tests.md`** — **modified**:
  - Replace the §"Documented limitations — Recorder `--policy` mode is
    deferred" subsection with §"`--policy` mode (WP-193)": describes
    the new CLI shape, the setup-envelope contract, and the
    cross-path determinism guarantee (PRNG construction parity between
    simulation and `runFixture`)
  - Add a paragraph under §"How to add a fixture" describing the
    `--policy` workflow as an alternative to hand-crafted `--input`
    JSON
  - No other prose changes; the existing limitations subsection on
    "Phase-hook gaps" and "Seed domain is fixture-internal" continue
    to apply verbatim

### D) Tests

Add a new test file
`packages/game-engine/src/simulation/simulation.captureMoves.test.ts`
covering:

- `simulateOneGameAndCaptureMoves` returns a non-empty `moves` array
  for a known-runnable setup (one seat, random policy, sentinel-style
  composition)
- Determinism: two invocations with identical
  `(setupConfig, registry, policies, seed, gameIndex)` produce
  deep-equal `CapturedGameResult` values
- PRNG-stream alignment with `runSimulation`: a one-game
  `runSimulation` invocation with the same
  `(setupConfig, policies, seed)` produces an aggregate
  `SimulationResult` whose observable fields agree with the captured
  result — concretely, `result.winRate === 1` iff
  `captured.outcome.winner === 'heroes-win'`, and
  `result.escapedVillainsAverage === captured.outcome.escapedVillains`.
  This proves the recording side-channel does not perturb the
  simulation's PRNG state. (The test does not need to inspect any
  internal type — both sides are observed through their public APIs.)
- Round-trip: the captured `ReplayMove[]` when assembled into a
  `FixtureFile` and replayed through `runFixture` produces a
  `FixtureRunResult` whose `outcome` matches the captured `outcome`
  (same `winner` value; same `escapedVillains` counter)
- Within-run determinism guard (the WP-158 double-run guard inside
  `runFixture`) passes for the captured trace — i.e., the captured
  moves are deterministic-replay-safe
- `endgameReached` is surfaced in the captured result and asserted
  to be **stable across repeated runs with identical inputs** (same
  seed + same setupConfig + same policies → same `endgameReached`
  value). No specific value (true or false) is pinned: the chosen
  smoke setup may or may not reach endgame under
  `MAX_TURNS_PER_GAME = 200`, and WP-193 does not classify or
  triage the cap-hit case — that is WP-195's job. The field exists
  so WP-195 has a hook to consume; WP-193 only guarantees its
  determinism.
- **Field-set drift assertion (Issue 4 of 01.7 lens; raised in
  copilot-check):** the test file pins the exact field sets of both
  new types at runtime, mirroring the project's existing canonical
  readonly-array drift-detection discipline. Concretely:
  ```typescript
  const captured: CapturedGameResult = /* a real result */;
  const capturedKeys = Object.keys(captured).sort();
  assert.deepEqual(capturedKeys, ['endgameReached', 'moves', 'outcome']);
  const summary: CapturedOutcomeSummary = captured.outcome;
  const summaryKeys = Object.keys(summary).sort();
  assert.deepEqual(summaryKeys, ['escapedVillains', 'winner']);
  ```
  Failure means a future PR silently added a fourth field to either
  type. The grep gate (exactly 1 match per `export interface ...`
  declaration in `simulation.runner.ts`) remains the source-level
  drift gate; this is the runtime invariant pair.
- **Dispatch-order invariant assertion (Issue 11 of 01.7 lens;
  raised in copilot-check):** the test file asserts the captured
  `moves[]` order is byte-equal to the dispatch order produced by a
  spy policy. Concretely: instantiate a wrapping policy that records
  each `(playerId, moveName, args)` it returns from `decideTurn`;
  drive a short game; capture moves via
  `simulateOneGameAndCaptureMoves`; assert
  `captured.moves.map(toComparable) === spy.recordedDispatches.map(toComparable)`.
  Frame as `// must-never-happen: captured move order diverges
  from dispatch order`. The round-trip + outcome-equality test
  catches the gross failure (capture-before-dispatch); this test
  catches the subtler order regression.

Optionally, add a single integration test under the recorder if a
test surface exists for `scripts/*.mjs` (today it does not, per WP-158
precedent — the recorder is exercised by hand and via downstream test
files). This WP does NOT add a `scripts/` test harness; the
`simulation.captureMoves.test.ts` coverage is sufficient.

## Out of Scope

- **Matrix sweep over Scheme × Mastermind (or any other
  `MatchSetupConfig` field).** That is WP-194 — strictly dependent on
  WP-193 and intentionally deferred until WP-193 stabilises.
- **Anomaly oracle layer (soft-lock detection, hit-cap-not-endgame
  classification, illegal-state warning surfaces, normalised failure
  signatures, sweep summaries).** That is WP-195. WP-193 surfaces
  `endgameReached` as a field but does NOT classify, aggregate, or
  report on it.
- **Modifying `runFixture` or its public API.** The shared-loop
  invariant (EC-172 §Guardrails — Determinism integrity) is preserved
  precisely because `runFixture` is not changed. If a downstream test
  fails because `runFixture` needs a new export, WP-193 stops and the
  finding is escalated rather than worked around.
- **Modifying `replay.execute.ts`.** D-0205 / D-15801 lock this file
  as the determinism-only forensic harness. Out of scope per D-15801.
- **Per-seat policy heterogeneity in `--policy` mode.** All seats use
  the same policy factory in WP-193 (D-19303). Per-seat variation is
  a WP-194 concern.
- **Promoting `--policy`-recorded fixtures into the regression-test
  corpus.** Captured fixtures are written to the existing fixtures
  directory under whatever `--name` the operator supplies, but
  whether any captured fixture becomes a committed regression test
  is an operator decision, not a WP-193 behaviour. (Sweep output
  routing and `.gitignore` for bulk outputs is WP-194's concern.)
- **Lobby-move handling in the captured trace.** Simulation starts
  post-lobby (phase = 'play') after `buildInitialGameState`, and
  `runFixture` dispatches whatever `moves[]` it receives starting
  from the same `buildInitialGameState` output. The captured trace
  contains play-phase moves only; lobby moves are not emitted. This
  is a deliberate choice (D-19302 proposed) — see Non-Negotiable
  Constraints below.
- **CLI verb additions (subcommands, new help text formatting).** The
  recorder's CLI surface stays flag-based exactly as WP-158 defined it.
- **`scripts/` test harness creation.** Scripts continue to be exercised
  by the test files of the packages they consume (per WP-158 precedent).

## Files Expected to Change

- `packages/game-engine/src/simulation/simulation.runner.ts` —
  **modified** — extract per-turn loop into a callback-able helper;
  export `simulateOneGameAndCaptureMoves` and `CapturedGameResult`;
  add `// why:` comments on the recording side-channel
- `packages/game-engine/src/simulation/simulation.captureMoves.test.ts` —
  **new** — `node:test` coverage for the move-capture path
  (determinism, PRNG-stream parity with `runSimulation`, round-trip
  through `runFixture`, `endgameReached` for the sentinel setup)
- `scripts/record-game-fixture.mjs` — **modified** — implement
  `--policy` mode; replace the deferral throw with the real
  execution path; preserve `--input` mode byte-identically
- `docs/ai/REFERENCE/complete-game-tests.md` — **modified** — flip
  the deferred-`--policy` subsection to the implemented contract;
  add a workflow paragraph under §"How to add a fixture"
- `docs/ai/STATUS.md` — **modified** — note the recorder can now
  generate fixtures from a setup envelope + policy
- `docs/ai/DECISIONS.md` — **modified** — append D-19301 / D-19302 /
  D-19303 (proposed; see Contract below)
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-193 entry
  appended with completion date
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-220
  row added (the EC itself is drafted during SPEC-hardening; this WP
  references it forward)

No other files may be modified.

## Non-Negotiable Constraints

### Engine-wide (always apply — do not remove)

- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- Every new or modified file must be provided in FULL — no diffs,
  no snippets, no "show only the changed section"
- All randomness via `ctx.random.*` or seeded PRNG — never
  `Math.random()`
- `G` is never persisted to a database
- Moves never throw; only `Game.setup()` may throw
- No `.reduce()` in zone operations or effect application
- No `boardgame.io` imports in `packages/game-engine/src/simulation/`
- No `@legendary-arena/registry` imports in
  `packages/game-engine/src/simulation/`
- No filesystem, network, environment, or wall-clock reads inside
  `packages/game-engine/src/simulation/**` or
  `packages/game-engine/src/test/fixtures/**`. The recorder script
  (`scripts/record-game-fixture.mjs`) is the operator-facing CLI
  boundary and IS permitted to read `process.argv` + read JSON files
  via `node:fs/promises` (this is unchanged from WP-158)

### Packet-specific

- **Single execution path through `runFixture` for oracle production.**
  The recorder's `--policy` mode MUST construct a `FixtureFile`-shaped
  input and pass it to `runFixture` to produce the `expected` block —
  identical to `--input` mode. The recorder MUST NOT invoke any
  alternative oracle-producing primitive, MUST NOT call
  `executeOnce` directly, MUST NOT bypass `validateFixture`, MUST NOT
  call `evaluateEndgame` / `hashGameState` directly for oracle
  purposes. (WP-158 §Contract + EC-172 §Guardrails — Determinism
  integrity.)
- **Simulation produces moves only; never produces an oracle.**
  `simulateOneGameAndCaptureMoves` returns a `CapturedGameResult`
  whose role is move-generation. The `outcome` and `endgameReached`
  fields are exposed for the recorder's diagnostics + downstream
  consumers (WP-194/195); they are NOT the fixture's oracle. The
  fixture's `expected.outcome` is produced by `runFixture` on the
  captured move list.
- **Policy determinism boundary (locked).**
  - All policies passed to `simulateOneGameAndCaptureMoves` MUST be
    deterministic under their constructor seed
  - `--policy random` resolves to `createRandomPolicy(seed)` —
    seeded mulberry32 internally; no `Math.random`
  - `--policy heuristic` resolves to
    `createCompetentHeuristicPolicy(seed)` — seeded mulberry32
    internally for tie-breaking; no `Math.random`
  - No `Math.random` MAY appear anywhere in
    `packages/game-engine/src/simulation/`; the verification step
    asserts this with `Select-String`
  - The two-domain PRNG invariant (D-3604) is preserved: the
    policy PRNG (passed via the factory's seed argument) and the
    run-level shuffle PRNG (the mulberry32 instance constructed by
    `simulation.runner.ts` from `hashSeedString(seed)`) MUST remain
    distinct instances. The new code path may NOT collapse them.
- **PRNG construction parity (cross-path determinism contract).**
  `simulation.runner.ts:hashSeedString` and
  `simulation.runner.ts:createMulberry32` MUST remain byte-identical
  to `runFixture.ts:hashSeedString` and `runFixture.ts:createMulberry32`.
  The WP-193 changes MUST NOT alter either set. This invariant is
  **proven indirectly** by the round-trip + outcome-equality test
  (AC #13): if either path's PRNG construction drifts, the captured
  `ReplayMove[]` will reference cards in zones `runFixture` has not
  drawn yet (or vice versa), and the test fails loudly. Direct
  helper-level testing is rejected because it would require exporting
  the helpers from one or both files, contradicting the packet's own
  "do not widen `runFixture`'s API" posture. If a future WP wants
  helper-level parity testing, it must first ship a consolidation WP
  (extracting the helpers into a shared file with explicit
  layer-boundary review) — that consolidation is explicitly out of
  scope here.
- **No lobby moves in the captured trace.** The recorder's `--policy`
  mode produces fixtures whose `moves[]` contains play-phase moves
  only. `buildInitialGameState`'s output is the dispatch starting
  point for BOTH simulation and `runFixture`; lobby moves
  (`setPlayerReady`, `startMatchIfReady`) are not in scope for
  `--policy` mode. (D-19302 proposed.) Existing hand-crafted fixtures
  that include lobby moves continue to work unchanged through
  `--input` mode.
- **One policy *family* across all seats in `--policy` mode, with
  seat-derived deterministic seeds** (D-19303 proposed). Concretely:
  every seat receives a policy from the same factory
  (`createRandomPolicy` xor `createCompetentHeuristicPolicy`), but
  each seat's factory is invoked with
  `${operatorSeed}::seat:${i}` rather than the bare operator seed.
  Per-seat policy *family* heterogeneity (e.g., random vs heuristic
  at adjacent seats) is a WP-194 concern.
- **`playerOrder` is derived deterministically** as
  `["0", "1", …, String(playerCount - 1)]` in `--policy` mode.
- **Existing `--input` mode is byte-identical pre/post.** The
  recorder's `--input` execution path produces the same output for
  the same inputs after this WP as before. Verified by re-recording
  the sentinel fixture and asserting byte-identical output.
- **`runFixture`'s public API is not widened.** No new exports are
  added to `packages/game-engine/src/test/fixtures/runFixture.ts`
  in WP-193. If a future WP needs to widen it, that change ships
  under its own WP + EC + DECISIONS entry.
- **`replay.execute.ts` is not modified.** D-0205 / D-15801 lock.
- **No new npm dependencies.**

### Session protocol

- Stop and ask on unclear items (e.g., setup-envelope schema drift
  vs. canonical 9-field `MatchSetupConfig`).
- If a file outside `## Files Expected to Change` needs modification,
  invoke `docs/ai/REFERENCE/01.5-*.md` (allowlist amendment).

### Locked contract values

- **CLI shape (`--policy` mode):**
  ```
  node scripts/record-game-fixture.mjs \
    --name <fixture-name> \
    --seed <seed-string> \
    --created-at "<ISO 8601 timestamp>" \
    --engine-version "<git short SHA or semver>" \
    --policy random|heuristic \
    --setup <path-to-setup-envelope.json> \
    [--max-moves <N>]
  ```
- **Setup envelope shape consumed by `--setup`:**
  ```jsonc
  {
    "schemaVersion": "1.0",
    "playerCount": <integer ≥ 1, ≤ 5>,
    "heroSelectionMode": "GROUP_STANDARD",
    "composition": { /* the 9-field MatchSetupConfig */ }
  }
  ```
- **MatchSetupConfig fields** (verbatim from 00.2 §8.1):
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`,
  `sidekicksCount`
- **`ReplayMove` shape** (from `replay.types.ts`, locked):
  `{ readonly playerId: string; readonly moveName: string;
  readonly args: unknown }`
- **`MAX_TURNS_PER_GAME`** = 200 (existing simulation cap; do not
  change)
- **Maximum captured-move count** = `--max-moves` default 10000
  (existing recorder cap; do not change)
- **Policy factory map** (locked) — `seed` here refers to the
  seat-derived seed `${operatorSeed}::seat:${i}`, not the bare
  operator seed:
  - `'random'` → `createRandomPolicy(seed)`
  - `'heuristic'` → `createCompetentHeuristicPolicy(seed)`
  - Any other `--policy` value → full-sentence error, no fallback
- **Seat-derived seed convention** (locked):
  `${operatorSeed}::seat:${i}` where `i` is the 0-based seat index
  matching `playerOrder[i]`. The literal separator `::seat:` is
  locked — do not paraphrase, abbreviate, or reorder. This string
  appears verbatim in the recorder source.

## Contract

### New exports from `simulation.runner.ts`

```typescript
import type { EndgameOutcome } from '../endgame/endgame.types.js';

export interface CapturedOutcomeSummary {
  readonly winner: EndgameOutcome | null;
  readonly escapedVillains: number;
}

export interface CapturedGameResult {
  readonly moves: readonly ReplayMove[];
  readonly outcome: CapturedOutcomeSummary;
  readonly endgameReached: boolean;
}

export function simulateOneGameAndCaptureMoves(
  setupConfig: MatchSetupConfig,
  registry: CardRegistryReader,
  policies: readonly AIPolicy[],
  seed: string,
  gameIndex: number,
): CapturedGameResult;
```

**Why `winner: EndgameOutcome | null` rather than `string | null`:** the
narrower canonical union matches `FixtureOutcome.winner` at
`packages/game-engine/src/test/fixtures/fixtureSchema.ts` (also typed
`EndgameOutcome | null`), and converts AC #13's literal-string comparison
into a typed enum comparison. Bare `string` at the new boundary would
let a future change emit a typo or a new outcome value that compiles but
fails replay matching silently against the narrower fixture oracle. The
import is `import type { EndgameOutcome } from '../endgame/endgame.types.js'`
(`EndgameOutcome = 'heroes-win' | 'scheme-wins'`).

The existing internal `GameOutcome` interface in `simulation.runner.ts`
remains **internal** and is NOT exported by this WP. The recorder and
future consumers see only `CapturedOutcomeSummary`. The translation
from `GameOutcome` to `CapturedOutcomeSummary` happens inside
`simulateOneGameAndCaptureMoves` (a one-line projection).

### Proposed DECISIONS.md entries (drafted during SPEC-hardening)

- **D-19301 — Recorder `--policy` mode uses simulation as
  move-generator + `runFixture` as oracle producer.** Rationale: the
  WP-158 deferral specifically called out the architectural tension
  ("functional autoplay requires exporting `runFixture` internals or
  duplicating the dispatch loop"). The resolution is neither —
  simulation generates moves through its existing engine-state
  pipeline, those moves flow through `runFixture` unchanged. The
  shared-loop invariant (EC-172 §Guardrails) is preserved because
  `runFixture` remains the single oracle source; the recorder's
  `--policy` and `--input` paths converge on the same `runFixture`
  call. Closes the WP-158 deferral.
- **D-19302 — Captured trace excludes lobby moves.** Rationale:
  simulation starts from `buildInitialGameState`'s output at
  `phase = 'play'`; `runFixture` also starts from
  `buildInitialGameState`'s output and dispatches whatever `moves[]`
  it receives (lobby moves are not required for the dispatch loop
  to function — they were included in the sentinel fixture because
  it was hand-crafted that way). Emitting synthetic lobby moves
  would require simulation to also dispatch them so its starting
  state matches runFixture's post-lobby state — adding a dependency
  on lobby-move semantics inside simulation that doesn't exist
  today. The simpler choice (skip lobby moves) preserves
  simulation's existing semantics and keeps the captured trace
  minimal. Hand-crafted fixtures via `--input` mode are unaffected
  and may continue to include lobby moves.
- **D-19303 — `--policy` mode uses one policy *family* across all
  seats, with seat-derived deterministic seeds.** Rationale: WP-193
  is about closing the `--policy` deferral, not about exercising
  policy-family heterogeneity (e.g., random vs heuristic
  head-to-head) — that's a matrix-sweep concern owned by WP-194.
  But within a single policy family, instantiating every seat with
  the same literal seed produces correlated PRNG streams across
  seats: identical legal-move sets at identical filtered UIStates
  yield identical tie-breaks. The locked construction is
  `factory(\`${operatorSeed}::seat:${i}\`)` for each seat `i`,
  which preserves determinism while decorrelating seat-local
  behaviour. The literal separator `::seat:` is part of the locked
  contract — the recorder source carries it verbatim. Future
  matrix-sweep work in WP-194 may extend the recorder (or add a
  sibling tool) to accept a per-seat policy-family list; that
  extension does not retro-violate WP-193 because the seat-derived
  seed convention is orthogonal to family selection.

These three decisions are the architectural commitments WP-193
load-bears on. During SPEC-hardening, the EC will pin verbatim
strings of each so the executor cannot drift.

### Cross-path determinism contract (load-bearing)

For the `--policy` mode to produce a valid fixture, the following
contract MUST hold:

> Given any `(seed, setupConfig, policies, gameIndex)`, the
> `ReplayMove[]` returned by `simulateOneGameAndCaptureMoves` MUST
> replay deterministically through `runFixture(input, registry)`
> where `input` is the fixture built from those captured moves.
> Deterministically means: `runFixture`'s
> `assertDoubleRunAgreement` passes (the within-run guard); AND the
> `FixtureRunResult.outcome` matches `CapturedGameResult.outcome`
> field-for-field.

This contract is asserted by the round-trip test described in §D
above. If the contract is violated by a future change, the round-trip
test fails and the recorder stops producing valid fixtures — surfacing
the drift loudly rather than silently.

## Acceptance Criteria

### Move-capturing simulation

1. `packages/game-engine/src/simulation/simulation.runner.ts` exports
   `simulateOneGameAndCaptureMoves` with the signature in §Contract
   above
2. `simulation.runner.ts` exports `CapturedGameResult` with exactly
   three readonly fields (`moves`, `outcome`, `endgameReached`) AND
   `CapturedOutcomeSummary` with exactly two readonly fields
   (`winner: EndgameOutcome | null`, `escapedVillains: number`). The
   existing internal `GameOutcome` interface is NOT exported.
   `EndgameOutcome` is imported `type`-only from
   `../endgame/endgame.types.js`.
3. `simulateOneGameAndCaptureMoves` is a deterministic function of
   `(setupConfig, registry, policies, seed, gameIndex)`: two
   invocations with deep-equal arguments produce deep-equal results
4. The captured `ReplayMove[]` is non-empty for the sentinel setup
   under either policy (sanity check — a zero-move trace would
   indicate a regression in either the simulation runner or the
   move-capture wiring)
5. No `Math.random` in `packages/game-engine/src/simulation/`
   (drift gate; existing invariant preserved)
6. No `boardgame.io` import in
   `packages/game-engine/src/simulation/` (drift gate; existing
   invariant preserved)

### Recorder `--policy` mode

7. `node scripts/record-game-fixture.mjs --policy random --setup
   <sentinel-envelope> --seed <s> --name <n> --created-at <t>
   --engine-version <v>` produces a `.replay.json` file at
   `packages/game-engine/src/test/fixtures/games/<n>.replay.json`
8. Two invocations with identical
   `(--policy, --setup, --seed, --name, --created-at, --engine-version)`
   produce **byte-identical** output files (canonical-JSON
   determinism)
9. The produced fixture validates via `validateFixture` and replays
   cleanly via `runFixture` (i.e., `runFixture`'s
   `assertDoubleRunAgreement` passes)
10. **Round-trip property:** re-recording the produced fixture via
    `--input <produced-fixture-path>` using the same `--name`,
    `--created-at`, and `--engine-version` produces a byte-identical
    output file. This is the load-bearing cross-mode determinism test.
11. The deferral error message that previously fired on `--policy` is
    removed from `record-game-fixture.mjs`; the `--policy` /
    `--input` mutual-exclusion check is preserved (exactly one of
    them MUST be supplied)

### Tests

12. `pnpm --filter @legendary-arena/game-engine test` exits 0 with
    new tests in
    `packages/game-engine/src/simulation/simulation.captureMoves.test.ts`
13. The cross-path determinism contract is asserted indirectly: for the
    same `(setupConfig, registry, policies, seed, gameIndex)`, the
    captured `ReplayMove[]` replays through `runFixture(...)`
    deterministically and produces an `outcome` field-equal to the
    captured `outcome`. This assertion fails loudly if either path's
    PRNG construction drifts — the move list would either reference
    cards in the wrong zones or fail `runFixture`'s
    `assertDoubleRunAgreement` guard. Direct private-helper invocation
    is deliberately NOT used (it would require exporting
    `hashSeedString` / `createMulberry32` from one or both files,
    widening the public API in contradiction of the packet's own
    "do not widen `runFixture`'s API" posture).
14. The round-trip test asserts
    `runFixture(buildFixtureFromCapturedMoves(captured), registry).outcome`
    matches `captured.outcome` field-for-field
15. **Field-set drift tests** (per Issue 4 fix): runtime assertions
    pin `Object.keys(captured).sort() === ['endgameReached', 'moves', 'outcome']`
    AND `Object.keys(captured.outcome).sort() === ['escapedVillains', 'winner']`
16. **Dispatch-order invariant test** (per Issue 11 fix): a spy
    policy records its dispatch sequence; the captured `moves[]`
    must be byte-equal to that sequence (must-never-happen invariant
    for captured-vs-dispatched order divergence)

### Build + scope

17. `pnpm --filter @legendary-arena/game-engine build` exits 0
18. `pnpm -r build` exits 0
19. No files outside `## Files Expected to Change` were modified
    (`git diff --name-only` matches the file list exactly)

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — full monorepo build
pnpm -r build
# Expected: exits 0

# Step 3 — run all game-engine tests (includes the new
# simulation.captureMoves.test.ts file)
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing.
# New test file should contribute at least 5 tests
# (non-empty trace, determinism, PRNG parity, round-trip, endgameReached).

# Step 4 — confirm new exports exist on simulation.runner.ts
Select-String -Path "packages\game-engine\src\simulation\simulation.runner.ts" `
  -Pattern "export function simulateOneGameAndCaptureMoves"
# Expected: 1 match

Select-String -Path "packages\game-engine\src\simulation\simulation.runner.ts" `
  -Pattern "export interface CapturedGameResult"
# Expected: 1 match

# Step 5 — confirm no Math.random in simulation/
Select-String -Path "packages\game-engine\src\simulation\" -Pattern "Math\.random" -Recurse
# Expected: no output

# Step 6 — confirm no boardgame.io import in simulation/
Select-String -Path "packages\game-engine\src\simulation\" -Pattern "from 'boardgame.io" -Recurse
# Expected: no output

# Step 7 — confirm the deferral throw is gone from the recorder
Select-String -Path "scripts\record-game-fixture.mjs" -Pattern "deferred to a follow-up WP"
# Expected: no output

# Step 8 — confirm --policy mode is wired
Select-String -Path "scripts\record-game-fixture.mjs" -Pattern "simulateOneGameAndCaptureMoves"
# Expected: 1 match (the import + call site, depending on style — at
# least one)

# Step 9 — run a real --policy recording end-to-end against the
# sentinel envelope (the loadout-test.json shape) and assert the
# output validates cleanly. Replace <seed>, <ts>, <ver> with stable
# values.
node scripts/record-game-fixture.mjs `
  --name wp193-smoke-random `
  --seed wp193-smoke-seed-1 `
  --created-at "2026-05-31T00:00:00.000Z" `
  --engine-version "wp193-smoke" `
  --policy random `
  --setup apps/arena-client/public/loadout-test.json
# Expected: stdout — Recorded fixture "wp193-smoke-random" to <path>
# Expected: exit 0
# Expected: <path> exists and is non-empty

# Step 10 — round-trip: re-record from the just-produced fixture using
# the SAME --name (which overwrites the file in place) and assert
# full-file byte identity. Proves --policy and --input modes converge
# at the fixture level.
$firstPath = "packages/game-engine/src/test/fixtures/games/wp193-smoke-random.replay.json"
$first = Get-Content $firstPath -Raw
node scripts/record-game-fixture.mjs `
  --name wp193-smoke-random `
  --input $firstPath `
  --created-at "2026-05-31T00:00:00.000Z" `
  --engine-version "wp193-smoke"
# Expected: exits 0
# Expected: $firstPath was overwritten in place; its new content is
# byte-identical to $first (no normalization required)

# Step 11 — delete the smoke fixture produced by Steps 9 + 10
# (Step 10 overwrote the Step 9 file in place, so only one file exists)
Remove-Item packages/game-engine/src/test/fixtures/games/wp193-smoke-random.replay.json
# Expected: exits 0; file no longer exists

# Step 12 — confirm no files outside scope changed (must run AFTER
# Step 11 — the smoke fixture would otherwise appear as an
# unexpected new file)
git diff --name-only
git ls-files --others --exclude-standard
# Expected: only files listed in ## Files Expected to Change appear
# in either output; no `wp193-smoke-*` paths remain
```

After Step 12, the smoke fixture is gone. The decision to promote a
`--policy`-recorded fixture into the committed corpus is a separate
operator action, outside this WP's scope — Steps 9 + 10 produce a
disposable smoke artifact, not a regression-corpus entry.

## Definition of Done

- [ ] All 19 acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] No `Math.random` in any new or modified file (confirmed with
      Select-String)
- [ ] No `boardgame.io` import in any new or modified simulation file
      (confirmed with Select-String)
- [ ] The deferral throw is removed from `record-game-fixture.mjs`
      (confirmed with Select-String)
- [ ] WP-158 outputs (`runFixture.ts`, `fixtureSchema.ts`,
      `replay.execute.ts`) were NOT modified (confirmed with
      `git diff`)
- [ ] Verification Step 10 (round-trip byte-identity) passes
- [ ] Smoke fixture from Verification Steps 9 + 10 is deleted before
      commit (`git status` shows no `wp193-smoke-*` files; Step 10
      overwrites the Step 9 file in place, so there is only one to
      delete)
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only` matches the file list exactly)
- [ ] `docs/ai/STATUS.md` updated with WP-193 / EC-220 block —
      "recorder can now generate fixtures from a setup envelope +
      policy via `--policy random|heuristic --setup <path>`"
- [ ] `docs/ai/DECISIONS.md` updated with D-19301, D-19302, D-19303
      verbatim (proposed strings from §Contract above; the EC-220
      SPEC-hardening pass may tighten the wording before execution)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-193 checked off with
      today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-220 flipped
      to Done
- [ ] `docs/ai/REFERENCE/complete-game-tests.md` updated: the
      §"Recorder `--policy` mode is deferred" subsection is replaced
      with §"`--policy` mode (WP-193)"

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §22 (replay
faithfulness), §11 (testing rigor).

**Conflict assertion:** No conflict. WP-193 strengthens all three
clauses:

- §3 (determinism): the cross-path determinism contract between
  simulation and `runFixture` is now mechanically asserted by the
  PRNG-parity drift test and the round-trip test. Drift in either
  direction surfaces loudly.
- §22 (replay faithfulness): every fixture produced by `--policy`
  mode is a complete `ReplayInput` — seed, setupConfig, playerOrder,
  moves[] — that can be replayed against any future engine build
  for regression testing or bug repro.
- §11 (testing rigor): the WP closes a known capability gap that
  has limited the regression-test corpus to one hand-crafted
  fixture for ~3 months. The slope to "many fixtures across many
  scenarios" is unblocked.

**Non-Goal proximity check:** NG-1..7 not crossed. This WP is an
operator-facing tool (the recorder) that produces test artifacts
(fixtures); no monetization, ranking, persuasive copy, identity
storage, or competitive surface is touched. The `--policy random`
naming is forward-compat: the policy is internally seeded mulberry32,
not pseudo-random in any user-facing or competitive sense.

**Determinism preservation:** The change is deterministic and
replay-faithful by construction:

- The captured move list is a pure function of
  `(setupConfig, registry, policies, seed, gameIndex)`
- Both simulation and `runFixture` use the same `hashSeedString` +
  `createMulberry32` constants; the PRNG-parity drift test pins
  that contract
- The round-trip test pins the cross-path replay contract
- `runFixture`'s internal within-run double-run guard fires
  against the captured trace, providing a third independent
  determinism check

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---------|-------|
| §1  | PASS | All 10 required sections present (Goal, Assumes, Context, Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done) |
| §2  | PASS | Engine-wide + packet-specific + session protocol + locked contract values; full-file output mandated; refs `00.6-code-style.md` |
| §3  | PASS | Assumes lists WP-158, WP-036, WP-049, T1 random policy, WP-181, plus the exact exports each must provide |
| §4  | PASS | Specific docs + section numbers cited; DECISIONS scan list enumerated by D-number |
| §5  | PASS | 8 files listed with new/modified + descriptions; bounded |
| §6  | PASS | `MatchSetupConfig` field names verbatim from 00.2 §8.1; `ReplayMove` shape verbatim from `replay.types.ts`; no abbreviations introduced |
| §7  | PASS | No new npm dependencies |
| §8  | PASS | Engine-only (`simulation/`) + `scripts/` (CLI boundary) + reference docs; no layer boundary violations; `runFixture` API not widened; `replay.execute.ts` not modified |
| §9  | PASS | Verification Steps use PowerShell + `Select-String` + Windows-style paths |
| §10 | N/A | No env vars introduced |
| §11 | N/A | No auth touched |
| §12 | PASS | `node:test` only; no boardgame.io; no network/DB; new test file at `*.test.ts` |
| §13 | PASS | Exact commands with expected output; PowerShell shell consistency |
| §14 | PASS | 19 binary, observable acceptance criteria grouped by sub-task |
| §15 | PASS | STATUS, DECISIONS, WORK_INDEX, EC_INDEX, scope-boundary check, smoke-fixture cleanup all in DoD |
| §16 | PASS | Code-style rules referenced; no premature abstraction (the callback-able helper is shared by two real call sites — existing `simulateOneGame` and the new capture variant) |
| §17 | PASS | Vision Alignment present; §3, §11, §22 cited; determinism-preservation line present; NG check explicit |
| §18 | N/A | No literal-string-scoped grep gates that overlap with prose |
| §19 | N/A | Not a repo-state-summarizing artifact |
| §20 | N/A | No funding surface touched — internal tooling change; no UI surfaces, no user-visible copy, no funding channels |
| §21 | N/A | No HTTP endpoints touched; no `apps/server/src/**` library functions added or modified |
