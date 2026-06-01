# WP-194 — Setup-Matrix Sweep Runner (Scheme × Mastermind, Manifest-Only)

## Goal

After this WP, `node scripts/sweep-setup-matrix.mjs --run-id <id> --seed <s>
--setup <path> --scheme-ids <path> --mastermind-ids <path> --policy
random|heuristic` produces a deterministic, resumable traversal of the
`schemeId × mastermindId` cross-product over a base setup envelope, dispatches
`simulateOneGameAndCaptureMoves` per cell, and emits a JSONL manifest at
`sweep-output/<run-id>/manifest.jsonl` (gitignored). The sweep is the
**execution-layer primitive** that WP-195's anomaly-oracle layer consumes; it
classifies, aggregates, and triages nothing on its own.

WP-194 is **runner infrastructure**, not a coverage claim. The sweep enumerates
a defined two-dimensional slice of setup-space; broader axes (villain groups,
hero decks, player counts) are deferred to a follow-up WP. The matrix-builder
core uses a generic N-axis cartesian-product helper so future axes can be
added without rewriting the enumeration engine.

Out of this WP, WP-195 (anomaly oracle) consumes the JSONL manifest as a
materialised stream of cell results and layers classification, aggregation,
and operator-facing reporting on top. WP-195 is NOT drafted yet — it is a
strict dependent and remains deferred until WP-194 stabilises.

## Assumes

- WP-193 (Policy-Mode Fixture Recording) complete ✅
  - `packages/game-engine/src/simulation/simulation.runner.ts` exports
    `simulateOneGameAndCaptureMoves(setupConfig, registry, policies,
    seed, gameIndex): CapturedGameResult`
  - `CapturedGameResult` exports `moves: readonly ReplayMove[]`,
    `outcome: CapturedOutcomeSummary`, `endgameReached: boolean`
  - `CapturedOutcomeSummary` exports `winner: EndgameOutcome | null`,
    `escapedVillains: number`
  - The seat-derived seed convention `${operatorSeed}::seat:${i}` and the
    `SEAT_SEED_SEPARATOR` constant are locked under D-19303
  - The canonical setup envelope shape (`{ schemaVersion: "1.0",
    playerCount, heroSelectionMode, composition }`) is locked under
    EC-220 §Locked Values
- WP-036 (Simulation Runner) complete ✅
  - `runSimulation` available for cross-check tests
  - `createRandomPolicy` / `createCompetentHeuristicPolicy` factories
    available
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline 930)
- `pnpm -r build` exits 0
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
   Contract, §Persistence Boundaries
3. `.claude/rules/architecture.md` — Layer Boundary; pure-helper rule
4. `.claude/rules/code-style.md` — naming, comments, functions
5. `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4, 6, 9, 11, 13, 14
6. `docs/ai/DECISIONS.md` — scan for:
   - **D-0205** — separate seed-faithful pipeline vs `replay.execute.ts`
   - **D-0701** — AI is tooling, not gameplay; receives
     `filterUIStateForAudience` view
   - **D-0702** — balance changes require simulation validation
   - **D-2705** — static MOVE_MAP pattern
   - **D-2801** — local structural interface for `FnContext`
   - **D-3604** — two-domain PRNG invariant (policy PRNG never shares
     state with run-level shuffle PRNG)
   - **D-15801** — seed-faithful pipeline rationale + the explicit
     commitment NOT to modify `replay.execute.ts`
   - **D-19301..D-19303** — WP-193 single-oracle-path, lobby-move
     exclusion, seat-derived seed convention; WP-194 layers cell-derived
     seeds ON TOP of seat-derived seeds (nesting, not replacement)
7. `docs/ai/REFERENCE/complete-game-tests.md` — operator reference; the
   `--policy mode (WP-193)` subsection describes the dispatch primitive
   WP-194 composes
8. `docs/ai/work-packets/WP-193-policy-mode-fixture-recording.md` — the
   parent WP; especially §Non-Negotiable Constraints (the single-oracle
   path the sweep MUST NOT bypass at the cell level)
9. `docs/ai/execution-checklists/EC-220-policy-mode-fixture-recording.checklist.md` —
   §Locked Values + §Guardrails
10. `packages/game-engine/src/simulation/simulation.runner.ts` — the
    capture primitive WP-194 calls per cell
11. `scripts/record-game-fixture.mjs` — the recorder precedent for
    `EMPTY_REGISTRY` + CLI shape patterns the sweep script mirrors

## Scope (In)

### A) Sweep dimensions (MVP — locked)

The sweep enumerates the cross-product:

```
schemeId × mastermindId
```

All remaining `MatchSetupConfig` fields are **held constant** and are
sourced from a single operator-provided setup envelope:

```jsonc
{
  "schemaVersion": "1.0",
  "playerCount": <integer ≥ 1, ≤ 5>,
  "heroSelectionMode": "GROUP_STANDARD",
  "composition": { /* the 9-field MatchSetupConfig; schemeId + mastermindId are overridden per cell, the other 7 fields are held verbatim */ }
}
```

The sweep therefore traverses a two-dimensional slice of the full
setup-space. This is an intentional scope boundary for WP-194; broader
setup-space traversal (e.g., `villainGroupIds`, `henchmanGroupIds`,
`heroDeckIds`, `playerCount`) is deferred to a follow-up WP.

This WP does NOT claim full gameplay coverage. It constructs a
deterministic and resumable traversal primitive over a bounded subset
of setup-space.

### B) Matrix-builder primitive (engine — pure helper)

- **`packages/game-engine/src/simulation/sweep.runner.ts`** — **new**:
  - Generic N-axis cartesian-product helper:
    ```typescript
    export function* cartesianProduct<T>(
      axes: readonly (readonly T[])[],
    ): Generator<readonly T[]>
    ```
    Yields one tuple per cross-product combination, in lexicographic
    order over the input axes. Zero axes yields a single empty tuple.
    Future WPs add a new axis by extending the `axes` argument array —
    the enumeration core is untouched (D-19401 extensibility mandate).
  - Cell-result type:
    ```typescript
    export interface SweepCellResult {
      readonly cellIndex: number;
      readonly schemeId: string;
      readonly mastermindId: string;
      readonly cellSeed: string;
      readonly outcome: CapturedOutcomeSummary;
      readonly endgameReached: boolean;
      readonly moveCount: number;
    }
    ```
    `cellIndex` is the per-run 0-based ordinal over the lex-sorted
    cross-product enumeration the dispatcher derives — deterministic
    given the lex-sorted axes, NOT stable across axis-file changes
    (the identity key for resume + dedup is the
    `(schemeId, mastermindId)` pair). `cellSeed` is the per-cell seed
    produced by the locked convention (see §C).
  - Sweep dispatcher:
    ```typescript
    export function sweepSetupMatrix(
      baseSetupConfig: MatchSetupConfig,
      playerCount: number,
      schemeIds: readonly string[],
      mastermindIds: readonly string[],
      registry: CardRegistryReader,
      buildPolicies: (cellSeed: string, playerCount: number) => readonly AIPolicy[],
      runSeed: string,
      onCellComplete: (cell: SweepCellResult) => void,
      shouldSkipCell?: (schemeId: string, mastermindId: string) => boolean,
    ): void
    ```
    **Iteration order is locked** (D-19401): both axes are sorted
    lexicographically ascending before enumeration (outer = schemeId,
    inner = mastermindId). The dispatcher does the sort itself; the
    caller need not pre-sort. Sorting is a stable copy of the input
    arrays — the operator's axis files are not mutated.
    For each non-skipped cell, the dispatcher builds a per-cell
    `composition` (cloning `baseSetupConfig` with `schemeId` +
    `mastermindId` substituted), derives `cellSeed` via the locked
    convention, calls `buildPolicies(cellSeed, playerCount)` for the
    policy list, calls `simulateOneGameAndCaptureMoves` for the cell
    dispatch, projects the result into a `SweepCellResult`, and
    invokes `onCellComplete(cell)`. The dispatcher is a **pure
    function** modulo the operator-supplied callback; no IO; no
    wall-clock; no randomness outside the seeded mulberry32 chain.
  - **`cellIndex` is the per-run enumeration index over the sorted
    cross-product** — informational for progress reporting only. It is
    NOT a stable identifier across axis-file changes (adding a new
    schemeId that lex-sorts earlier shifts every subsequent
    `cellIndex`). The identity key for resume + dedup is the
    `(schemeId, mastermindId)` pair, NOT `cellIndex`.
  - The dispatcher does NOT swallow exceptions per cell. If
    `simulateOneGameAndCaptureMoves` throws (which today it does not —
    the function returns a degenerate `CapturedGameResult` on empty
    inputs), the exception propagates to the caller, which is
    responsible for the manifest fatal-cell record (see §D) and
    process exit. Per-cell error classification + recovery is WP-195's
    seam.
  - Add `// why:` comments on:
    - the cartesian-product helper (why generic N-axis: future-axes
      extension without rewriting the enumeration core; D-19401)
    - the per-cell seed derivation (literal `::cell:` separator; cite
      D-19402; nesting on top of WP-193's seat-derived seeds preserves
      the two-domain PRNG invariant — D-3604)
    - the `EMPTY_REGISTRY`-via-host posture (sweep dispatcher is
      registry-agnostic; the caller supplies the registry reader —
      WP-194 MVP uses `EMPTY_REGISTRY` from the script, following the
      WP-193 recorder precedent)

### C) Locked seed conventions

**Cell-seed convention (locked — D-19402):**

```
${runSeed}::cell:${schemeId}:${mastermindId}
```

The literal separator `::cell:` is locked — do not paraphrase,
abbreviate, or reorder. The sweep runner source carries a
`CELL_SEED_SEPARATOR` constant with the verbatim string. The full
literal `::cell:` MUST appear in the source (so the structural grep
gate from EC-221 §After Completing passes).

**Per-seat seeds within a cell** continue to use the WP-193 D-19303
convention, applied to `cellSeed` rather than `runSeed`:

```
${cellSeed}::seat:${seatIndex}
```

This nests the seed domains:

```
runSeed                                                   (operator)
  → cellSeed = runSeed + "::cell:" + schemeId + ":" + mastermindId
      → seatSeed = cellSeed + "::seat:" + seatIndex
          → policy PRNG (mulberry32 via createRandomPolicy / heuristic)
```

The run-level shuffle PRNG (constructed by `simulateOneGameAndCaptureMoves`
from `hashSeedString(cellSeed)`) and the per-seat policy PRNGs remain
distinct instances; the D-3604 two-domain invariant holds at every
level of the nesting.

### D) Operator-facing sweep CLI

- **`scripts/sweep-setup-matrix.mjs`** — **new**:
  - CLI flags (all required unless noted):
    - `--run-id <id>` — non-empty string; becomes the subdir name
      under `sweep-output/`. Sanitised: must match
      `/^[A-Za-z0-9._-]+$/`; any other character is a full-sentence
      error.
    - `--seed <seed-string>` — the run-level seed
    - `--setup <path>` — path to the base setup envelope JSON (same
      canonical shape EC-220 locks; the script substitutes `schemeId`
      and `mastermindId` per cell)
    - `--scheme-ids <path>` — path to a JSON array of non-empty
      strings; the schemeId axis
    - `--mastermind-ids <path>` — path to a JSON array of non-empty
      strings; the mastermindId axis
    - `--policy random|heuristic` — policy family (same locked map as
      EC-220; any other value → full-sentence error, no fallback)
    - `[--max-cells <N>]` — optional safety cap; **default `10000`**.
      The cross-product cell count is asserted ≤ cap BEFORE dispatch
      begins; an over-cap configuration is a full-sentence error and
      exits non-zero. The cap exists to surface configuration errors
      (an operator passing a 10K-mastermind list, or a typo'd axis
      file) before consuming an hour of wall-clock. The real
      expected load is ~32 schemes × ~32 masterminds ≈ 1024 cells;
      10 000 is a ~10× safety margin that still permits modest
      expansion (e.g., multi-set or a partial extra axis under a
      future WP).
    - **Soft warning at `cellCount > 5000`.** The script emits a
      one-line stderr warning (`Sweep warning: <N> cells exceeds soft
      threshold 5000 — verify axis files are not a misconfiguration`)
      but proceeds. No behaviour change; the operator can disable the
      warning by raising `--max-cells` to a value ≥ `cellCount` (the
      warning is gated on `5000 < cellCount ≤ max-cells`).
  - Execution path:
    1. Parse + validate CLI args
    2. Load + validate the base setup envelope (reuse the EC-220
       canonical-envelope validator pattern; the script may extract
       the validator into the engine package if cleaner, or inline
       the same shape checks — implementer's choice within scope)
    3. Load + validate the two axis files (each must be a JSON array
       of non-empty unique strings; duplicates within an axis are a
       full-sentence error)
    4. Assert `schemeIds.length * mastermindIds.length <= max-cells`
    5. Ensure `sweep-output/<run-id>/` exists (`mkdir { recursive: true }`)
    6. Resume scan: if `sweep-output/<run-id>/manifest.jsonl` exists,
       parse each line, build the skip-set of completed
       `(schemeId, mastermindId)` pairs. Malformed lines emit a
       full-sentence warning to stderr but are not fatal (the
       corresponding cells are re-run).
    7. Build the per-cell `buildPolicies` callback using the locked
       seat-derived seed convention (`${cellSeed}::seat:${i}`)
    8. Open the manifest file in append mode
    9. Call `sweepSetupMatrix(...)` with an `onCellComplete` callback
       that serialises the cell result as canonical JSON
       (lexicographic-sorted keys, no trailing whitespace), appends
       it as a single JSONL line, and flushes synchronously
    10. **Fatal-cell abort behaviour.** The script wraps the
        `sweepSetupMatrix` call in a single try/catch at the OUTER
        boundary. If any cell throws, the script:
        - appends a single fatal-record JSONL line to the manifest
          (canonical JSON, sorted keys):
          ```jsonc
          {
            "cellSeed": "<cellSeed of throwing cell>",
            "error": "<full-sentence error message>",
            "mastermindId": "<id of throwing cell>",
            "schemeId": "<id of throwing cell>",
            "type": "fatal"
          }
          ```
          The fatal record is a closed-set five-key shape; its `type`
          field discriminates it from cell-result records (which
          carry no `type` field). The `cellSeed` field aligns with
          the success-record schema and removes ambiguity between
          run seed and cell seed for downstream consumers (WP-195).
          Future `--resume` runs MUST treat fatal records the same
          way as cell-result records for the purpose of building the
          skip-set (the throwing cell is in the skip-set; **to retry
          a fatal cell, the operator must either remove the fatal
          record from the manifest or run under a new `--run-id`**).
        - emits the error to stderr verbatim
        - exits with non-zero status
        This preserves resumability + visibility + reproducibility
        on failure without continuing execution past the throwing
        cell. Per-cell error classification + recovery remains
        WP-195's seam.
    11. After successful completion, emit a one-line summary to
        stdout reporting processed cells, resume-skipped cells, and
        fatal abort count. On the successful exit path, fatal abort
        count is always 0; non-zero counts only appear via the
        fatal-record path above, after which the script has already
        exited non-zero.
  - The script honors the WP-193 boundary: `runFixture` is NOT called
    per cell. The sweep consumes `CapturedGameResult` directly — the
    `CapturedOutcomeSummary` projection IS the per-cell oracle for
    sweep purposes (NOT for fixture purposes; the sweep does not write
    fixtures). This is explicitly allowed by WP-193 §Contract:
    "`CapturedOutcomeSummary` is for round-trip determinism comparison
    + downstream consumers (WP-194/195); they are NOT the fixture's
    oracle."
  - Add `// why:` comments on:
    - cell-seed derivation: cite **D-19402**; the literal `::cell:`
      separator
    - per-seat policy construction within a cell: cite **D-19303**;
      the nested seed convention preserves the D-3604 two-domain
      invariant
    - manifest-only output: cite **D-19403**; per-cell fixture
      generation is out of scope
    - resume-on-existing-manifest behaviour: idempotency contract
      (same args + same axis files → same final manifest content)

### E) Manifest format (canonical JSONL)

Each line in `sweep-output/<run-id>/manifest.jsonl` is a canonical-JSON
object with exactly seven keys, lexicographically sorted:

```jsonc
{
  "cellIndex": <0-based ordinal in cross-product enumeration>,
  "cellSeed": "<runSeed>::cell:<schemeId>:<mastermindId>",
  "endgameReached": <boolean>,
  "mastermindId": "<id>",
  "moveCount": <integer ≥ 0>,
  "outcome": { "escapedVillains": <integer>, "winner": "heroes-win" | "scheme-wins" | null },
  "schemeId": "<id>"
}
```

`moveCount` is `captured.moves.length`. The manifest is a stream
artifact (JSONL, append-only, one line per cell, no enclosing array);
WP-195 will consume it line-by-line. No header, no trailing comma, no
pretty-print.

### F) Gitignore

- **`.gitignore`** — **modified**:
  - Append a `sweep-output/` rule so bulk sweep artifacts do not enter
    the repo. The rule MUST appear under a comment that names WP-194
    so a future operator can trace its origin.

### G) Operator reference documentation

- **`docs/ai/REFERENCE/complete-game-tests.md`** — **modified**:
  - Add a §"Setup-matrix sweep (WP-194)" section after the
    §"`--policy` mode (WP-193)" section, documenting the sweep CLI
    shape, the axis-file format, the manifest record format, the
    resume-on-existing-manifest behaviour, the gitignored bulk-output
    convention, and the deferred-coverage notice (WP-194 is a
    traversal primitive, not a coverage claim).
  - No other prose changes.

### H) Tests

Add a new test file
`packages/game-engine/src/simulation/sweep.runner.test.ts` covering:

- **cartesianProduct invariants**:
  - Zero axes → exactly one tuple, empty
  - One axis with N items → N tuples, each containing one item
  - Two axes with M × N items → M·N tuples, in lexicographic order
    (outer axis varies slowest)
  - Three axes (the extensibility smoke) — assert the count and the
    first/last tuples to confirm the generic N-axis behaviour
- **sweepSetupMatrix invariants**:
  - Empty schemeIds OR empty mastermindIds → callback never invoked
  - Two-by-two (2 schemes × 2 masterminds) → callback invoked exactly
    four times, in lexicographic cell-index order, with the cellSeed
    containing the literal `::cell:` separator and the schemeId +
    mastermindId substrings verbatim
  - Determinism: two invocations with identical args produce identical
    callback sequences (deep-equal `SweepCellResult` per cell, same
    order)
  - Skip predicate: a predicate that returns true for half the cells
    causes the callback to fire only for the remaining cells (and
    cellIndex values reflect the original enumeration order, not the
    post-skip order)
  - Two-domain PRNG nesting: the per-cell `cellSeed` is byte-equal to
    `${runSeed}::cell:${schemeId}:${mastermindId}`; this is asserted
    against the literal-string output of a known input (load-bearing
    drift gate for D-19402)
- **Field-set drift assertion** (mirror of EC-220 §Field-set drift):
  ```typescript
  const cell: SweepCellResult = /* a real result */;
  const keys = Object.keys(cell).sort();
  assert.deepEqual(keys, [
    'cellIndex', 'cellSeed', 'endgameReached',
    'mastermindId', 'moveCount', 'outcome', 'schemeId',
  ]);
  ```

The dispatcher is exercised against a minimal `CardRegistryReader` stub
(same `{ listCards: () => [] }` pattern WP-036 / WP-193 tests already
use). No real card data; no `boardgame.io` import; no
`@legendary-arena/registry` import.

## Out of Scope

- **Additional sweep axes** (`villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `playerCount`). The matrix-builder is N-axis-generic
  via `cartesianProduct`, but WP-194's CLI accepts only the two
  schemeId / mastermindId axes. Adding more axes requires a follow-up
  WP that extends the CLI + manifest record shape; the enumeration
  engine is not touched.
- **Per-seat policy heterogeneity** (random vs heuristic at adjacent
  seats). One policy family across all seats in a cell; D-19303
  preserved. Heterogeneity is a separate seam owned by a later WP
  (orthogonal to the matrix axes).
- **Per-cell fixture file generation.** The sweep emits the manifest
  only; per-cell `.replay.json` fixtures are NOT written under any
  flag in v1. An opt-in `--write-fixtures` mode could land in a future
  WP if operators surface a real use case.
- **Anomaly classification / aggregation / triage.** The sweep records
  raw cell results into the manifest. Classifying which cells are
  anomalous (hit-cap-not-endgame, soft-lock, illegal-state warnings,
  normalised failure signatures, distribution summaries) is **WP-195**.
  WP-194 is the execution-layer primitive; WP-195 is the analysis
  layer.
- **Real-registry-driven scheme/mastermind script effects.** WP-194
  uses `EMPTY_REGISTRY` in the MVP implementation. This means
  gameplay resolution uses the baseline engine logic without
  set-specific card script behaviours loaded from a registry.
  Variation across cells is therefore driven by:
  - differing `MatchSetupConfig` values (`schemeId`, `mastermindId`
    flow through the engine setup pipeline and influence message
    logs, zone identifiers, and any setup-time branching that keys
    off the ID strings), AND
  - per-cell deterministic seeds (`cellSeed` derives from
    `(runSeed, schemeId, mastermindId)`, so each cell's PRNG stream
    is uncorrelated with adjacent cells),

  NOT by dynamically loaded registry-backed card script data. Full
  registry-backed resolution is deferred to a follow-up WP that
  introduces a script-layer registry loading surface (the recorder
  + the engine package both lock `EMPTY_REGISTRY` today; that
  constraint stays in this WP).
- **Modifying `runFixture` or `simulation.runner.ts` public APIs.** No
  new exports added to either; WP-193's surface is consumed verbatim.
- **Modifying `replay.execute.ts`.** D-0205 / D-15801 lock; out of
  scope.
- **Per-cell error catch + classification.** The dispatcher does NOT
  swallow exceptions per cell in v1; a throwing cell aborts the sweep.
  Per-cell error handling is WP-195's seam.
- **Sweep-output retention / pruning policy.** The gitignored
  `sweep-output/` directory grows monotonically. Operator-driven
  pruning is a tooling concern outside this WP.

## Files Expected to Change

- `packages/game-engine/src/simulation/sweep.runner.ts` — **new** —
  exports `cartesianProduct`, `SweepCellResult`, `sweepSetupMatrix`,
  and `CELL_SEED_SEPARATOR` (the literal `::cell:` carries verbatim).
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **new** —
  `node:test` coverage for the cartesian-product enumeration, the
  dispatcher determinism + skip-predicate + cellSeed-derivation, the
  field-set drift assertion, and the extensibility smoke (three-axis
  cartesian product).
- `scripts/sweep-setup-matrix.mjs` — **new** — operator-facing CLI
  that loads the base envelope + axis files, resumes from any existing
  manifest, calls `sweepSetupMatrix`, and appends canonical-JSON
  lines to the manifest.
- `.gitignore` — **modified** — add a `sweep-output/` rule under a
  WP-194 comment.
- `docs/ai/REFERENCE/complete-game-tests.md` — **modified** — add
  §"Setup-matrix sweep (WP-194)" section.
- `docs/ai/STATUS.md` — **modified** — WP-194 / EC-221 Executed block.
- `docs/ai/DECISIONS.md` — **modified** — append D-19401, D-19402,
  D-19403 (proposed; verbatim block in §Contract below).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-194 entry
  appended with completion date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-221
  row added (the EC itself is drafted during SPEC-hardening; this WP
  references it forward).

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
  `packages/game-engine/src/simulation/**`. The sweep script
  (`scripts/sweep-setup-matrix.mjs`) is the operator-facing CLI
  boundary and IS permitted to read `process.argv` + read/write JSON
  files via `node:fs/promises` (this matches the WP-193 recorder
  posture exactly)

### Packet-specific

- **Sweep dimensions are locked to schemeId × mastermindId.** The
  CLI accepts exactly two axis flags (`--scheme-ids` and
  `--mastermind-ids`); the manifest record carries exactly the seven
  keys listed in §E. Adding a new axis is a follow-up WP's scope.
- **Matrix-builder is N-axis-generic** (D-19401). The
  `cartesianProduct` helper takes a `readonly (readonly T[])[]`; the
  enumeration core does NOT special-case two-axis input. Future WPs
  add a third axis by extending the input array; the helper is
  untouched.
- **Iteration order is locked** (D-19401). Both axes are sorted
  lexicographically ascending; the outer loop is `schemeId`, the
  inner is `mastermindId`. The dispatcher does the sort itself
  (stable copy of the input arrays); the caller does not pre-sort.
  This is a determinism guarantee, not an implementation detail —
  resume logic + manifest line order both depend on it.
- **Per-cell seed convention is locked** (D-19402). The literal
  separator `::cell:` appears verbatim in the sweep runner source
  (carried as `CELL_SEED_SEPARATOR`). The cell-seed derivation is
  `${runSeed}${CELL_SEED_SEPARATOR}${schemeId}:${mastermindId}`; the
  `:` between schemeId and mastermindId is intentional and is NOT
  the `::cell:` separator (it is the intra-cell-coordinate
  separator).
- **Per-seat seeds nest on top of cell seeds** (D-19303 preserved).
  Within a cell, seat seeds are `${cellSeed}::seat:${i}` using the
  WP-193 `SEAT_SEED_SEPARATOR`. The two-domain PRNG invariant
  (D-3604) holds at every level of the nesting.
- **Sweep does NOT bypass WP-193's contracts.** Per-cell dispatch
  uses `simulateOneGameAndCaptureMoves` exactly as the recorder does;
  `runFixture` is NOT called per cell because the sweep does not
  produce fixtures (the manifest is the artifact). The
  `CapturedOutcomeSummary` projection is the per-cell oracle for
  sweep-analysis purposes (WP-193 §Contract explicitly anticipates
  this consumer path).
- **Manifest is canonical-JSON one-line-per-cell** (JSONL). Each line
  has exactly the seven keys listed in §E, lexicographically sorted;
  no enclosing array; no header; no pretty-print.
- **Output routes to `sweep-output/<run-id>/manifest.jsonl`** which is
  gitignored (D-19403). The bulk directory grows monotonically;
  pruning is operator-driven.
- **Resume-on-existing-manifest is the default behaviour.** Re-running
  with identical CLI args reads the existing manifest, builds a
  skip-set, and appends only new cells. Idempotency: same args + same
  axis-file contents + non-truncated existing manifest → same final
  manifest content as a single-pass run.
- **Per-cell exceptions abort the sweep in v1, but a fatal-record
  manifest line is appended before exit.** No per-cell try/catch
  inside the dispatcher; the script wraps the `sweepSetupMatrix` call
  in a single outer try/catch and, on any thrown cell, appends the
  fatal-record JSONL line (§D step 10), emits the error to stderr,
  and exits non-zero. The fatal record preserves resumability +
  visibility + reproducibility on failure. **To retry a fatal cell,
  the operator must either remove the fatal record from the manifest
  or run under a new `--run-id`** — there is no `--retry-fatal` flag
  in v1 (a future ergonomics enhancement only if operators surface
  real pain). WP-195 owns error classification; WP-194's posture is
  "fail loudly at the first throwing cell, but leave a discoverable
  forensic trail."
- **Cell-count cap defaults to 10 000** (`--max-cells`). The cap is
  asserted BEFORE dispatch begins; an over-cap configuration emits a
  full-sentence error and exits non-zero. A soft stderr warning
  fires for `5000 < cellCount ≤ max-cells` (no behaviour change;
  signal only).
- **`runFixture.ts`, `fixtureSchema.ts`, `replay.execute.ts` are NOT
  modified.** D-0205 / D-15801 / EC-172 §Guardrails preserved.
- **No new npm dependencies.**

### Session protocol

- Stop and ask on unclear items (e.g., axis-file shape ambiguity vs.
  the canonical 9-field `MatchSetupConfig`).
- If a file outside `## Files Expected to Change` needs modification,
  invoke `docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md`
  (allowlist amendment).

### Locked contract values

- **CLI shape (locked):**
  ```
  node scripts/sweep-setup-matrix.mjs \
    --run-id <id-matching-/^[A-Za-z0-9._-]+$/> \
    --seed <seed-string> \
    --setup <path-to-base-envelope.json> \
    --scheme-ids <path-to-scheme-ids-list.json> \
    --mastermind-ids <path-to-mastermind-ids-list.json> \
    --policy random|heuristic \
    [--max-cells <N>]
  ```
- **Axis file shape (locked):** a JSON array of non-empty unique
  strings. Empty array is permitted (yields zero cells — a no-op
  sweep). Duplicates within an axis are a full-sentence error.
- **Manifest record shape** — the seven canonical keys listed in §E,
  lexicographically sorted, JSONL.
- **Cell-seed separator** = `::cell:` (locked verbatim — appears in
  the sweep runner source as a literal string carried by
  `CELL_SEED_SEPARATOR`).
- **Seat-seed separator** = `::seat:` (preserved from WP-193 D-19303;
  applied to `cellSeed` rather than `runSeed`).
- **`MAX_CELLS_DEFAULT`** = 10 000 (CLI default for `--max-cells`).
- **`SOFT_CELL_WARNING_THRESHOLD`** = 5000 (script-side stderr
  warning gate; no behaviour change).
- **`sweep-output/`** = locked bulk-output root (gitignored).
- **Iteration order** = lexicographic ascending on both axes; outer
  loop `schemeId`, inner loop `mastermindId`. `cellIndex` is the
  per-run enumeration index over the sorted cross-product and is
  informational only; the identity key for resume + dedup is the
  `(schemeId, mastermindId)` pair.
- **Fatal-record shape** (locked five-key closed set):
  `{ cellSeed, error, mastermindId, schemeId, type: "fatal" }` —
  canonical-JSON, sorted keys, JSONL single-line. The `type` field
  is the discriminator that distinguishes fatal records from
  cell-result records (which have no `type` field). The `cellSeed`
  field aligns with the success-record schema (where `cellSeed`
  already exists) and removes downstream parsing ambiguity for
  WP-195.

## Contract

### New exports from `sweep.runner.ts`

```typescript
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { AIPolicy } from './ai.types.js';
import type { CapturedOutcomeSummary } from './simulation.runner.js';

export const CELL_SEED_SEPARATOR: '::cell:';

export interface SweepCellResult {
  readonly cellIndex: number;
  readonly schemeId: string;
  readonly mastermindId: string;
  readonly cellSeed: string;
  readonly outcome: CapturedOutcomeSummary;
  readonly endgameReached: boolean;
  readonly moveCount: number;
}

export function* cartesianProduct<T>(
  axes: readonly (readonly T[])[],
): Generator<readonly T[]>;

export function sweepSetupMatrix(
  baseSetupConfig: MatchSetupConfig,
  playerCount: number,
  schemeIds: readonly string[],
  mastermindIds: readonly string[],
  registry: CardRegistryReader,
  buildPolicies: (cellSeed: string, playerCount: number) => readonly AIPolicy[],
  runSeed: string,
  onCellComplete: (cell: SweepCellResult) => void,
  shouldSkipCell?: (schemeId: string, mastermindId: string) => boolean,
): void;
```

No other exports. `cartesianProduct` is generic on `T` so future
axes (string-typed today; potentially structured-typed later if a
follow-up WP adds a richer axis shape) are accommodated without
rewriting the helper.

### Proposed DECISIONS.md entries (drafted during SPEC-hardening)

- **D-19401 — Sweep dimensions for WP-194 MVP are `schemeId ×
  mastermindId`; matrix-builder is N-axis-generic; iteration order
  is lexicographic ascending on both axes.** Rationale: WP-194
  is the execution-layer primitive (deterministic traversal of a
  defined slice of setup-space); WP-195 owns the analysis layer.
  Expanding the matrix to additional axes (villain groups, hero
  decks, player counts) at this stage would push WP-194 into
  combinatorics-explosion territory (10^5+ cells for the full
  cross-product) and into pseudo-statistical interpretation that
  belongs in WP-195. The MVP locks Scheme × Mastermind because those
  are the two top-level drivers in the setup envelope's
  composition. The matrix-builder core is implemented as an N-axis
  `cartesianProduct` helper so future axes can be added without
  rewriting the enumeration engine; only the CLI surface + manifest
  record shape need to grow when the axis count grows. Iteration
  order is lex-sorted ascending (outer = schemeId, inner =
  mastermindId), the dispatcher does the sort itself (stable copy
  of input arrays). The sort is a determinism guarantee, not an
  implementation detail — resume logic + manifest line order both
  depend on it; `cellIndex` is the per-run enumeration index over
  the sorted product and is informational only (the identity key
  for resume + dedup is `(schemeId, mastermindId)`). This WP does
  NOT claim full gameplay coverage; it claims a deterministic,
  resumable traversal primitive over a bounded subset of setup-space.
- **D-19402 — Per-cell seed convention is
  `${runSeed}::cell:${schemeId}:${mastermindId}`.** Rationale:
  per-cell PRNG streams MUST be decorrelated across cells so cell
  outcomes vary even when the underlying card data does not (the
  WP-194 MVP uses `EMPTY_REGISTRY`, mirroring the WP-193 recorder
  precedent). The locked separator `::cell:` mirrors the WP-193
  `::seat:` convention: a literal string carried verbatim in the
  sweep runner source as `CELL_SEED_SEPARATOR`, with grep-gated
  presence in the source file. The intra-cell-coordinate separator
  `:` between schemeId and mastermindId is NOT the `::cell:`
  separator (it is the single-colon coordinate join); this
  distinction is intentional. Per-seat seeds within a cell nest on
  top: `${cellSeed}::seat:${seatIndex}` using the WP-193
  `SEAT_SEED_SEPARATOR`. The D-3604 two-domain PRNG invariant
  (policy PRNG vs run-level shuffle PRNG) holds at every level of
  the nesting.
- **D-19403 — Sweep output is manifest-only (JSONL); per-cell
  fixture files are NOT written; the abort path emits a fatal
  record before exit.** Rationale: WP-194 is for aggregate analysis
  (consumed by WP-195), not for growing the regression-test corpus.
  Committing per-cell fixtures would (a) bloat the repo
  monotonically as sweeps accumulate and (b) blur the WP-193
  contract that fixture promotion is an operator decision rather
  than a sweep behaviour. The manifest at
  `sweep-output/<run-id>/manifest.jsonl` is canonical-JSON
  one-line-per-cell, with the seven keys listed in §E, sorted
  lexicographically. The `sweep-output/` directory is gitignored
  (so the bulk artifact does not enter the repo). On a thrown
  cell, the script appends a fatal-record JSONL line
  (`{ cellSeed, error, mastermindId, schemeId, type: "fatal" }`,
  canonical JSON, sorted keys, closed five-key shape) before
  exiting non-zero — preserving resumability + visibility +
  reproducibility. Fatal records are indistinguishable from
  cell-result records to the resume scanner's identity-key check
  (the `(schemeId, mastermindId)` pair); the `type` field is the
  disambiguator for downstream consumers (e.g., WP-195) that need
  to distinguish abort-cells from completed-cells. An opt-in
  `--write-fixtures` flag could land in a follow-up WP if
  operators surface a real use case for per-cell fixture promotion.

These three decisions are the architectural commitments WP-194
load-bears on. During SPEC-hardening, the EC will pin verbatim
strings of each so the executor cannot drift.

### Cross-path determinism contract (preserved from WP-193)

The sweep dispatcher consumes `simulateOneGameAndCaptureMoves`
unchanged. Per-cell determinism is the WP-193 contract; per-cell
result deep-equality across re-runs with identical CLI args is
asserted by the test file. The sweep adds NO new randomness sources:

- `cartesianProduct` is pure enumeration over the input axes
- `cellSeed` derivation is deterministic string concatenation
- `simulateOneGameAndCaptureMoves` is the WP-193 primitive (already
  deterministic from `(setupConfig, registry, policies, seed,
  gameIndex)`)
- `buildPolicies` is the operator-supplied factory; the recorder /
  sweep script uses the locked seat-derived seed convention

Manifest byte-stability across re-runs: the manifest is canonical
JSON with sorted keys; re-running with identical CLI args produces a
byte-identical manifest (modulo line order, which is also stable
because the cross-product enumeration is deterministic).

## Acceptance Criteria

### Matrix-builder primitive

1. `packages/game-engine/src/simulation/sweep.runner.ts` exports
   `cartesianProduct`, `SweepCellResult`, `sweepSetupMatrix`, and
   `CELL_SEED_SEPARATOR` — exactly four new symbols
2. `CELL_SEED_SEPARATOR` is the literal string `'::cell:'` (drift
   gate; grep returns ≥1 match in the source)
3. `cartesianProduct` is generic on `T` (signature
   `<T>(axes: readonly (readonly T[])[]): Generator<readonly T[]>`);
   the implementation does NOT reference `string` or any other
   concrete type
4. **`sweepSetupMatrix` enumerates lex-sorted cells.** When invoked
   with axis arrays in any order, the dispatcher sorts both axes
   lexicographically ascending (stable copy; input arrays not
   mutated) and invokes `onCellComplete` in `(schemeId asc,
   mastermindId asc)` order. Asserted by a test that passes
   shuffled axis arrays and confirms the callback sequence matches
   the lex-sorted order.
5. `sweepSetupMatrix` invokes `onCellComplete` exactly
   `schemeIds.length * mastermindIds.length` times when no
   `shouldSkipCell` predicate is provided, **assuming the
   script-side axis-file loader has already validated that each
   axis contains unique strings**. The dispatcher itself does NOT
   dedup; duplicate values within an axis would produce duplicate
   cells (rejected upstream by the loader).
6. `sweepSetupMatrix` is a deterministic function of its inputs +
   the operator-supplied callback (two invocations with deep-equal
   args produce deep-equal callback sequences AND deep-equal
   `SweepCellResult` payloads)
7. The per-cell `cellSeed` byte-equals
   `${runSeed}${CELL_SEED_SEPARATOR}${schemeId}:${mastermindId}` for
   every cell (asserted against literal-string output of a known
   input — load-bearing drift gate for D-19402)
8. **`cellIndex` is the per-run enumeration index over the
   lex-sorted product** (informational, not stable across axis-file
   changes); identity for resume + dedup is the
   `(schemeId, mastermindId)` pair, NOT `cellIndex`
9. No `Math.random` code call sites in
   `packages/game-engine/src/simulation/` (drift gate; existing
   invariant preserved; JSDoc-convention mentions retained)
10. No `boardgame.io` import in
    `packages/game-engine/src/simulation/` (drift gate; existing
    invariant preserved)
11. No `@legendary-arena/registry` import in
    `packages/game-engine/src/simulation/` (drift gate; existing
    invariant preserved)

### Sweep CLI

12. `node scripts/sweep-setup-matrix.mjs --run-id <id> --seed <s>
    --setup <base-envelope> --scheme-ids <axis-1> --mastermind-ids
    <axis-2> --policy random` produces
    `sweep-output/<id>/manifest.jsonl` with exactly
    `schemeIds.length * mastermindIds.length` lines on a successful
    run
13. Each manifest cell-result line is a canonical JSON object with
    exactly the seven keys listed in §E
    (`Object.keys(line).sort()` deep-equals
    `['cellIndex', 'cellSeed', 'endgameReached', 'mastermindId',
    'moveCount', 'outcome', 'schemeId']`); no extra keys, no
    missing keys, no `type` field
14. Two invocations with identical CLI args produce **byte-identical**
    manifest files (after the first invocation, the second is a no-op
    resume — it appends zero new lines)
15. Resume-from-partial-manifest: when `manifest.jsonl` contains a
    proper subset of the cross-product, re-running appends only the
    missing cells; the final manifest content (all lines, considered
    as a set keyed on `(schemeId, mastermindId)`) equals a
    single-pass run's content
16. The deferral throw / "WP-194 deferred" placeholder (if any) is
    not present anywhere; the script is fully wired
17. The `--policy` value is `random` or `heuristic`; any other value
    → full-sentence error, no fallback
18. **`--max-cells` defaults to 10 000.** The default is asserted by
    grepping the script source for the literal `10000`; an over-cap
    configuration (cell count > `--max-cells` value supplied)
    emits a full-sentence error BEFORE any dispatch and exits
    non-zero; no partial manifest is written
19. **Soft warning fires when `5000 < cellCount ≤ max-cells`.** A
    single-line stderr warning containing the substring
    `exceeds soft threshold 5000` is emitted; the sweep proceeds
    normally (no behaviour change)
20. **Fatal abort path is implemented in the script as a
    contract** (structural verification only, no runtime
    fault-injection harness in WP-194). The script source carries
    an outer try/catch around `sweepSetupMatrix` that, on any
    thrown cell, appends a canonical-JSON fatal-record line to the
    manifest BEFORE exit. The fatal record is a closed five-key
    shape: `Object.keys(line).sort()` deep-equals
    `['cellSeed', 'error', 'mastermindId', 'schemeId', 'type']`,
    with `type === 'fatal'` and no other keys. The script exits
    non-zero after the fatal append. Verified by grep on the
    script source for the literal `"type": "fatal"` discriminator
    and the outer try/catch shape; a true behavioural test would
    require a fault-injection harness which is deferred to WP-195
    (where error classification is in scope). A resumed run treats
    the `(schemeId, mastermindId)` of any fatal record as "already
    handled" (skipped); to retry a fatal cell, the operator must
    either remove the fatal record from the manifest or run under
    a new `--run-id`.

### Tests

21. `pnpm --filter @legendary-arena/game-engine test` exits 0 with
    new tests in
    `packages/game-engine/src/simulation/sweep.runner.test.ts`
22. The new test file contributes **≥9 tests** covering:
    - `cartesianProduct` zero-axis / one-axis / two-axis /
      three-axis enumeration (4 tests — the three-axis test
      doubles as the D-19401 extensibility smoke)
    - `sweepSetupMatrix` lex-sort invariant: shuffled axis input
      → lex-sorted callback sequence (1 test)
    - `sweepSetupMatrix` callback count + determinism across
      identical re-invocations (1 test)
    - `sweepSetupMatrix` skip predicate honoured; cells excluded
      from callback but `cellIndex` reflects original enumeration
      order (1 test)
    - `cellSeed` byte-equality drift gate (1 test —
      load-bearing for D-19402)
    - Field-set drift assertion on `SweepCellResult` (1 test)
23. The field-set drift assertion pins
    `Object.keys(cell).sort()` deep-equal to
    `['cellIndex', 'cellSeed', 'endgameReached', 'mastermindId',
    'moveCount', 'outcome', 'schemeId']`
24. The pre-existing simulation tests are byte-identical in count
    (no drift on the WP-193 baseline 930)

### Build + scope

25. `pnpm --filter @legendary-arena/game-engine build` exits 0
26. `pnpm -r build` exits 0
27. No files outside `## Files Expected to Change` were modified
    (`git diff --name-only` matches the file list exactly)
28. `runFixture.ts`, `fixtureSchema.ts`, `replay.execute.ts`,
    `simulation.runner.ts` are NOT modified (zero diff)
29. `.gitignore` carries a `sweep-output/` rule under a comment
    that names WP-194 (so a future operator can trace its origin)

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — full monorepo build
pnpm -r build
# Expected: exits 0

# Step 3 — run all game-engine tests (includes the new
# sweep.runner.test.ts file)
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing.
# Pre-existing simulation test count preserved (930 baseline + ≥9 new).

# Step 4 — confirm new exports exist on sweep.runner.ts
Select-String -Path "packages\game-engine\src\simulation\sweep.runner.ts" `
  -Pattern "export function cartesianProduct|export interface SweepCellResult|export function sweepSetupMatrix|export const CELL_SEED_SEPARATOR"
# Expected: 4 matches

# Step 5 — confirm CELL_SEED_SEPARATOR literal
Select-String -Path "packages\game-engine\src\simulation\sweep.runner.ts" `
  -Pattern "'::cell:'"
# Expected: 1 match

# Step 6 — confirm no Math.random / boardgame.io / registry imports in simulation/
Select-String -Path "packages\game-engine\src\simulation\" -Pattern "Math\.random\(" -Recurse
# Expected: no code-line matches (pre-existing JSDoc convention comments may remain)

Select-String -Path "packages\game-engine\src\simulation\" -Pattern "from 'boardgame.io" -Recurse
# Expected: no output

Select-String -Path "packages\game-engine\src\simulation\" -Pattern "from '@legendary-arena/registry'" -Recurse
# Expected: no output

# Step 7 — confirm sweep CLI is wired (deferral placeholder absent)
Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "deferred to a follow-up WP|TODO|FIXME"
# Expected: no output

Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "sweepSetupMatrix"
# Expected: ≥1 match (the import + call site)

Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "'::cell:'"
# Expected: 0 matches (the separator is imported as CELL_SEED_SEPARATOR; the literal lives only in sweep.runner.ts)

# Step 8 — confirm script-side locked constants
Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "MAX_CELLS_DEFAULT.*10000|10000.*MAX_CELLS"
# Expected: ≥1 match (default cap locked at 10000)

Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "5000"
# Expected: ≥1 match (soft warning threshold)

Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern '"type": "fatal"|"type":\s*"fatal"'
# Expected: ≥1 match (fatal-record discriminator)

# Step 9 — confirm .gitignore covers sweep-output with WP-194 comment
Select-String -Path ".gitignore" -Pattern "^sweep-output/"
# Expected: 1 match

Select-String -Path ".gitignore" -Pattern "WP-194"
# Expected: ≥1 match (WP-194 origin comment above the rule)

# Step 10 — smoke sweep against a 2x2 matrix (intentionally shuffled
# to verify lex-sort invariant)
#
# Use the WP-193 loadout envelope as the base and a hand-crafted
# 2-entry scheme list and 2-entry mastermind list. The order in the
# axis files is intentionally NOT lex-sorted; the dispatcher must
# emit cells in lex-sorted order regardless.
$schemeIds = '["smoke/scheme-b", "smoke/scheme-a"]'
$mastermindIds = '["smoke/mastermind-y", "smoke/mastermind-x"]'
Set-Content -Path "smoke-wp194-schemes.json" -Value $schemeIds
Set-Content -Path "smoke-wp194-masterminds.json" -Value $mastermindIds

node scripts/sweep-setup-matrix.mjs `
  --run-id wp194-smoke `
  --seed wp194-smoke-seed-1 `
  --setup apps/arena-client/public/loadout-test.json `
  --scheme-ids smoke-wp194-schemes.json `
  --mastermind-ids smoke-wp194-masterminds.json `
  --policy random
# Expected: exits 0; stdout reports "4 cells processed, 0 skipped, 0 errors"
# Expected: sweep-output/wp194-smoke/manifest.jsonl exists with exactly 4 lines
# Expected: no soft-warning stderr line (cellCount = 4 ≤ 5000)

(Get-Content sweep-output/wp194-smoke/manifest.jsonl | Measure-Object -Line).Lines
# Expected: 4

# Step 11 — verify lex-sort iteration order in the manifest
$lines = Get-Content sweep-output/wp194-smoke/manifest.jsonl
# Expected lex order: (scheme-a, mastermind-x), (scheme-a, mastermind-y),
#                    (scheme-b, mastermind-x), (scheme-b, mastermind-y)
$lines[0]
# Expected: contains "schemeId":"smoke/scheme-a" AND "mastermindId":"smoke/mastermind-x" AND "cellIndex":0
$lines[3]
# Expected: contains "schemeId":"smoke/scheme-b" AND "mastermindId":"smoke/mastermind-y" AND "cellIndex":3

# Step 12 — verify cell-result field-set (no `type` field on success records)
$firstParsed = $lines[0] | ConvertFrom-Json
($firstParsed.PSObject.Properties.Name | Sort-Object) -join ','
# Expected: "cellIndex,cellSeed,endgameReached,mastermindId,moveCount,outcome,schemeId"

# Step 13 — resume idempotency: re-run with identical args
$before = Get-Content sweep-output/wp194-smoke/manifest.jsonl -Raw
node scripts/sweep-setup-matrix.mjs `
  --run-id wp194-smoke `
  --seed wp194-smoke-seed-1 `
  --setup apps/arena-client/public/loadout-test.json `
  --scheme-ids smoke-wp194-schemes.json `
  --mastermind-ids smoke-wp194-masterminds.json `
  --policy random
# Expected: exits 0; stdout reports "0 cells processed, 4 skipped, 0 errors"
$after = Get-Content sweep-output/wp194-smoke/manifest.jsonl -Raw
# Expected: $before -eq $after (byte-identical; second invocation appends nothing)

# Step 14 — over-cap rejection
node scripts/sweep-setup-matrix.mjs `
  --run-id wp194-overcap `
  --seed s `
  --setup apps/arena-client/public/loadout-test.json `
  --scheme-ids smoke-wp194-schemes.json `
  --mastermind-ids smoke-wp194-masterminds.json `
  --policy random `
  --max-cells 1
# Expected: exits non-zero; stderr contains full-sentence error naming
# the cell count (4) and the cap (1); no manifest file produced under
# sweep-output/wp194-overcap/

# Step 15 — clean up the smoke artifacts
Remove-Item -Recurse -Force sweep-output/wp194-smoke
if (Test-Path sweep-output/wp194-overcap) {
  Remove-Item -Recurse -Force sweep-output/wp194-overcap
}
Remove-Item smoke-wp194-schemes.json
Remove-Item smoke-wp194-masterminds.json
# Expected: exits 0; no smoke-wp194-* or sweep-output/wp194-* remain

# Step 16 — confirm no files outside scope changed
git diff --name-only
git ls-files --others --exclude-standard
# Expected: only files listed in ## Files Expected to Change appear in either output;
# no smoke artifacts remain
```

After Step 15, the smoke artifacts are gone. The decision to commit a
real sweep manifest into a follow-up analysis WP is a separate operator
action, outside this WP's scope.

## Definition of Done

- [ ] All 29 acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] No new `Math.random()` call sites in any new or modified file
- [ ] No `boardgame.io` import in any new or modified file under
      `packages/game-engine/src/simulation/`
- [ ] No `@legendary-arena/registry` import in any new or modified
      file under `packages/game-engine/src/simulation/`
- [ ] WP-193 outputs (`simulation.runner.ts`, the recorder) are NOT
      modified (confirmed with `git diff`)
- [ ] WP-158 outputs (`runFixture.ts`, `fixtureSchema.ts`,
      `replay.execute.ts`) are NOT modified (confirmed with
      `git diff`)
- [ ] Verification Step 13 (resume idempotency) passes byte-identically
- [ ] Verification Step 14 (over-cap rejection) exits non-zero
      without producing a partial manifest
- [ ] Smoke artifacts from Verification Steps 10–14 are deleted
      before commit (`git status` + `git ls-files --others
      --exclude-standard` show no `sweep-output/wp194-*/`,
      `smoke-wp194-*` paths)
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only` matches the file list exactly)
- [ ] `.gitignore` carries the `sweep-output/` rule under a WP-194
      comment
- [ ] `docs/ai/STATUS.md` updated with WP-194 / EC-221 block
- [ ] `docs/ai/DECISIONS.md` updated with D-19401, D-19402, D-19403
      verbatim (proposed strings from §Contract above; the EC-221
      SPEC-hardening pass may tighten the wording before execution)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-194 checked off with
      today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-221 flipped to
      Done
- [ ] `docs/ai/REFERENCE/complete-game-tests.md` carries the new
      §"Setup-matrix sweep (WP-194)" section

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §11 (testing rigor),
§22 (replay faithfulness).

**Conflict assertion:** No conflict. WP-194 strengthens all three
clauses:

- §3 (determinism): the sweep dispatcher is a pure function modulo
  the operator-supplied callback; the per-cell seed derivation is
  deterministic; manifest byte-stability across re-runs is asserted
  by the resume-idempotency test.
- §22 (replay faithfulness): each cell's per-cell seed deterministically
  identifies a replayable run; an operator can extract any cell's seed
  from the manifest and reproduce the run via the WP-193 recorder
  (`--policy <family> --seed <cellSeed>` with the corresponding
  schemeId / mastermindId substituted into a one-off envelope).
- §11 (testing rigor): the sweep gives WP-195 a deterministic
  materialised stream of cell outcomes over a bounded slice of
  setup-space. Statistical and anomaly-detection work in WP-195
  operates on a stable substrate.

**Non-Goal proximity check:** NG-1..7 not crossed. WP-194 is an
internal operator-facing tool (the sweep CLI) that produces a
gitignored bulk artifact (the manifest); no monetization, ranking,
persuasive copy, identity storage, or competitive surface is touched.
The `--policy random|heuristic` selection is forward-compat: both
policies are internally seeded mulberry32, not pseudo-random in any
user-facing or competitive sense.

**Determinism preservation:** The sweep is deterministic and
replay-faithful by construction:

- `cartesianProduct` enumeration is deterministic (lexicographic over
  the input axes)
- `cellSeed` derivation is deterministic string concatenation
- `simulateOneGameAndCaptureMoves` is the WP-193 primitive (already
  deterministic from `(setupConfig, registry, policies, seed,
  gameIndex)`)
- Manifest entries are canonical JSON (sorted keys, no trailing
  whitespace); JSONL one-line-per-cell preserves order

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---------|-------|
| §1  | PASS | All 10 required sections present (Goal, Assumes, Context, Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done) |
| §2  | PASS | Engine-wide + packet-specific + session protocol + locked contract values; full-file output mandated; refs `00.6-code-style.md` |
| §3  | PASS | Assumes lists WP-193 + WP-036 and the exact exports each must provide |
| §4  | PASS | Specific docs + section numbers cited; DECISIONS scan list enumerated by D-number |
| §5  | PASS | 9 files listed with new/modified + descriptions; bounded |
| §6  | PASS | `MatchSetupConfig` field names verbatim from 00.2 §8.1; setup envelope shape verbatim from EC-220; manifest keys closed-set |
| §7  | PASS | No new npm dependencies |
| §8  | PASS | Engine-only (`simulation/`) + `scripts/` (CLI boundary) + reference docs + `.gitignore`; no layer boundary violations; `runFixture` API not widened; `simulation.runner.ts` exports not widened; `replay.execute.ts` not modified |
| §9  | PASS | Verification Steps use PowerShell + `Select-String` + Windows-style paths |
| §10 | N/A | No env vars introduced |
| §11 | N/A | No auth touched |
| §12 | PASS | `node:test` only; no boardgame.io; no network/DB; new test file at `*.test.ts` |
| §13 | PASS | Exact commands with expected output; PowerShell shell consistency |
| §14 | PASS | 29 binary, observable acceptance criteria grouped by sub-task |
| §15 | PASS | STATUS, DECISIONS, WORK_INDEX, EC_INDEX, scope-boundary check, smoke-artifact cleanup all in DoD |
| §16 | PASS | Code-style rules referenced; the matrix builder is N-axis-generic so future extensions reuse the helper rather than duplicate it |
| §17 | PASS | Vision Alignment present; §3, §11, §22 cited; determinism-preservation line present; NG check explicit |
| §18 | N/A | No literal-string-scoped grep gates that overlap with prose |
| §19 | N/A | Not a repo-state-summarizing artifact |
| §20 | N/A | No funding surface touched — internal tooling change; no UI surfaces, no user-visible copy, no funding channels |
| §21 | N/A | No HTTP endpoints touched; no `apps/server/src/**` library functions added or modified |
