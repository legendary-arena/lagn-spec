# Complete-Game Regression Tests — Operator Reference

> **Reference document. Operator-facing.** Lives alongside the harness
> rails shipped by WP-158 + EC-172 + D-15801.

The complete-game regression suite replays complete game trajectories
(setup → endgame, or setup → exhausted move list) against the engine
and asserts that the engine's behaviour matches a pinned baseline.
Bug fixes become pinned fixtures that cannot silently regress;
intentional behaviour changes break fixtures noisily and force a
regenerate-and-review cycle — the snapshot-test pattern applied to
whole games rather than fragments.

The harness is **engine-only**. No `boardgame.io` server, no Socket.IO
transport, no live registry reads. Distinct from
`packages/game-engine/src/replay/replay.execute.ts`, which remains
the determinism-only forensic harness under D-0205; the two pipelines
coexist with distinct contracts (see §Engine-only fidelity below).

---

## Fixture file format

Fixtures live under `packages/game-engine/src/test/fixtures/games/`
and use the `*.replay.json` extension. The full schema:

```jsonc
{
  "name": "<must equal filename basename, excluding .replay.json>",
  "meta": {
    "version": 1,
    "createdAt": "<ISO 8601 timestamp; operator-supplied at record time>",
    "engineVersion": "<git short SHA or semver; operator-supplied at record time>"
  },
  "input": {
    "seed": "<deterministic seed string; transformed via hashSeedString → mulberry32>",
    "playerCount": 2,
    "playerOrder": ["0", "1"],
    "setupConfig": {
      "schemeId":        "core/legacy-virus-the",
      "mastermindId":    "core/dr-doom",
      "villainGroupIds": ["core/brotherhood"],
      "henchmanGroupIds":["core/savage-land-mutates"],
      "heroDeckIds":     ["core/black-widow", "core/captain-america"],
      "bystandersCount": 12,
      "woundsCount":     30,
      "officersCount":   16,
      "sidekicksCount":  16
    },
    "moves": [
      { "playerId": "0", "moveName": "setPlayerReady",   "args": { "ready": true } },
      { "playerId": "0", "moveName": "drawCards",        "args": { "count": 6 } },
      { "playerId": "0", "moveName": "advanceStage",     "args": null }
    ]
  },
  "expected": {
    "finalStateHash":  "<64-char lowercase hex sha256 of canonical-JSON-serialized G>",
    "messages":        [ /* G.messages verbatim */ ],
    "snapshotPerTurn": [ /* createSnapshot() output, one per completed turn */ ],
    "outcome":         { "winner": "heroes-win", "counters": { /* G.counters */ } }
  }
}
```

The fixture's `name` field **MUST equal the filename basename**
(excluding the `.replay.json` extension). The validator rejects
mismatches with a full-sentence error — this prevents misaligned
diffs and incorrect fixture reuse when files are renamed on one side
but not the other.

`meta.version` is locked to `1` for the current schema. Future schema
changes will increment the version and migrate existing fixtures
explicitly in a separate WP.

`expected.outcome.winner` is one of `"heroes-win"`, `"scheme-wins"`,
or `null` (the engine's canonical `EndgameOutcome` values, plus
`null` when the move list exhausted without triggering endgame).

---

## The three oracle layers

The driver asserts the trajectory in **order**, surfacing the first
failing layer. The order is coarsest → tightest so the diff lands at
the right grain.

| Layer | What it catches | Diff grain |
|---|---|---|
| `outcome` | Winner change; endgame-counter divergence (e.g. `escapedVillains` off by one) | The match-level result; you immediately know "the wrong side won." |
| `messages` | First divergent message at index N; readable trace of the turn-and-action where behaviour changed | One-line text diff; usually points directly at the offending move + parameter. |
| `finalStateHash` | Subtle state-placement differences the message log doesn't surface (zone counts, counter increments, hookRegistry shape) | Opaque hash; surfaces drift that no narrative log would catch. |

A passing fixture passes all three layers. A failing fixture is
reported at the FIRST layer that mismatches — fixing that layer
often resolves the others automatically.

---

## How to add a fixture

1. Write a hand-crafted `input` block JSON file in your scratch area
   (e.g. `scripts/_my-fixture-input.tmp.json`). The `input` block
   carries `seed`, `playerCount`, `playerOrder`, `setupConfig`, and
   `moves`. The 9-field `MatchSetupConfig` is locked by 00.2 §8.1.
   Move names must match `LegendaryGame.moves` keys (see
   `packages/game-engine/src/game.ts`).
2. Build the engine: `pnpm --filter @legendary-arena/game-engine build`.
3. Run the recorder:

   ```pwsh
   node scripts/record-game-fixture.mjs `
     --name <fixture-name> `
     --seed <seed-string> `
     --created-at "<ISO 8601 timestamp>" `
     --engine-version "<git short SHA or semver>" `
     --input scripts/_my-fixture-input.tmp.json
   ```

   The recorder writes the full fixture to
   `packages/game-engine/src/test/fixtures/games/<fixture-name>.replay.json`.
   Delete the scratch input file after the recorder succeeds.
4. Run the test suite once to confirm the new fixture passes:
   `pnpm --filter @legendary-arena/game-engine test`. The driver
   globs the fixtures directory and replays each one in turn.
5. Commit the new fixture file alongside the source change it pins.

**Alternative — `--policy` mode (WP-193).** When the operator does not
want to hand-author a move list, the recorder can capture one from a
deterministic autoplay policy:

```pwsh
node scripts/record-game-fixture.mjs `
  --name <fixture-name> `
  --seed <seed-string> `
  --created-at "<ISO 8601 timestamp>" `
  --engine-version "<git short SHA or semver>" `
  --policy random `
  --setup apps/arena-client/public/loadout-test.json
```

`--setup` points at a canonical setup-envelope JSON
(`{ schemaVersion: "1.0", playerCount, heroSelectionMode, composition }`).
The recorder builds one policy per seat with a seat-derived seed
`${operatorSeed}::seat:${i}`, captures the dispatched `ReplayMove[]`
through the existing simulation runner, and routes the trace through
`recordFromInput` so the convergence point with `--input` mode at
`validateFixture → runFixture → writeFixtureFile` is preserved. The
captured trace is play-phase moves only (lobby moves are not emitted
in this mode — see §"`--policy` mode (WP-193)" below).
Disposable smoke recordings are appropriate; whether a captured fixture
is promoted into the committed regression corpus is an operator decision
outside `--policy` mode's scope.

**Do not hand-edit the `expected` block.** The recorder is the
source of truth — if the recorder produces different values than
the committed fixture, the file is wrong and the recorder is
authoritative. Hand-editing the trajectory is the fastest way to
make a fixture lie about engine behaviour.

---

## How to regenerate a fixture after an intentional behaviour change

When a code change legitimately alters engine behaviour (a bug fix,
a rule clarification, a balance tweak), the affected fixtures will
fail their oracle assertions. Regenerate them:

1. Confirm the behaviour change is intentional and the WP/EC body
   sanctions it. (If it surfaced unexpectedly, the change is a
   regression — debug instead.)
2. Re-record the affected fixture by passing the **committed
   fixture itself** as `--input`:

   ```pwsh
   node scripts/record-game-fixture.mjs `
     --name <fixture-name> `
     --created-at "<ISO 8601 timestamp>" `
     --engine-version "<git short SHA or semver>" `
     --input packages/game-engine/src/test/fixtures/games/<fixture-name>.replay.json
   ```

   `--seed` is inherited from the source fixture's `input.seed`.
   `--created-at` and `--engine-version` may be inherited from the
   source's `meta` block if you omit the CLI flags; supplying them
   explicitly overrides.
3. Review the diff. The `expected` block changes are the new
   trajectory; the `input` block must NOT change (you are not
   re-scoping the fixture — you are re-recording the same scenario
   against new engine behaviour).
4. Commit the regenerated fixture in the same commit as the
   behaviour change. The PR review IS the trajectory-change review.

If the diff surfaces unrelated changes (different fixtures, different
fields), the engine has a determinism bug or the harness has a
contract bug. STOP and investigate before committing.

---

## The recorder/runner shared-loop invariant

The recorder CLI (`scripts/record-game-fixture.mjs`) and the test
driver (`replayFixtures.test.ts`) BOTH call `runFixture` for engine
state advancement. Duplicating the dispatch loop is **forbidden** by
EC-172 §Guardrails — Determinism integrity. If the recorder says a
fixture passes but the test says it fails, the two dispatch loops
have diverged; the fix is always to consolidate behind `runFixture`,
never to special-case the recorder.

`runFixture` internally executes the dispatch loop **twice** per
invocation and asserts byte-identical results before returning — the
within-run determinism guard. This catches hidden mutable state
leakage between dispatches: if a move accidentally mutates
module-level state, or if the PRNG instance is shared across
invocations, the second run diverges and the harness throws.

---

## Messages source-of-truth

`expected.messages` is `G.messages` read **byte-identically** at the
end of the dispatch loop. The harness does NOT filter, reformat, or
reconstruct messages from state deltas. The engine's `G.messages`
append-only event log IS the oracle; if it changes, the fixture
changes.

The harness returns the messages as a **defensive shallow copy**
(`[...G.messages]`) so caller-side mutation cannot reach back into
the (already-unreachable) game state. Aligns with WP-028 / D-2802
aliasing-defense precedent.

---

## Snapshot timing

`expected.snapshotPerTurn[i]` is captured AFTER the move that
triggered `events.endTurn()` completes AND after `currentPlayer`
rotation + stage reset; BEFORE the next turn's first move dispatches.
One entry per completed turn; never mid-turn, never partial.

The invariant `snapshotPerTurn.length === completedTurnCount` is
asserted at end-of-run. Mismatch indicates a harness bug, not a
fixture bug.

`snapshotAt` is normalised to `fixture.meta.createdAt` for
determinism — `createSnapshot` internally reads `new Date()`, but
the harness replaces that wall-clock value with the operator-supplied
fixture timestamp so two invocations produce byte-identical
snapshots. All per-turn snapshots therefore share the same
`snapshotAt`; semantically this is "the wall-clock the fixture was
recorded at," not "this exact turn happened at."

---

## Documented limitations

### Engine-only fidelity (no boardgame.io server)

The harness drives engine moves directly through a structurally-typed
local move-context interface (D-2801 pattern, mirroring
`replay.execute.ts` and `simulation.runner.ts`). It does NOT spin up
a `boardgame.io` `Server()`, does NOT route messages through
`Master`, and does NOT exercise the Socket.IO transport. Bugs that
live exclusively in the network layer (transport framing, reconnect
semantics, multi-client race conditions) are NOT caught by these
fixtures — they need a separate full-stack harness that a future WP
may build.

What IS caught: every move-function bug, every rule-pipeline bug,
every endgame-evaluation bug, every snapshot-shape bug, every
state-mutation bug that lives inside the engine package.

### Seed domain is fixture-internal

The seed string transforms via `hashSeedString → createMulberry32`
into a single PRNG instance used for ALL move-time
`context.random.Shuffle` calls. Setup-time shuffling still uses the
reverse-shuffle `makeMockCtx` provides (matches the existing test
convention). The fixture's `seed` does NOT correspond to any live
production seed — it is a fixture-internal value chosen for
trajectory reproducibility, not a seed-replay of a real match.

Production replay of `ctx.random.*` from live boardgame.io matches
remains a future feature gated on D-0203, not this harness.

### Phase-hook gaps (setPhase + endTurn no-ops)

Move functions that invoke `context.events.setPhase(...)` become
no-ops in the harness; the harness tracks phase externally as
`'play'` and never transitions. Move functions that invoke
`context.events.endTurn()` flip an external flag that the harness
checks after dispatch to drive rotation + snapshot capture. The
phase-hook side effects boardgame.io would otherwise fire
(`onPhaseBegin`, `onPhaseEnd`, `onTurnBegin`, `onTurnEnd`) are
**not** executed by the harness; the dispatch loop performs the
minimal subset (stage reset + economy reset) needed to keep the
next turn's stage-gated moves valid.

If a future fixture-driven bug surfaces a phase-hook-only behaviour,
that fixture needs harness extension. Until then, the gap is a
deliberate trade-off: the harness stays small and stays engine-only
in exchange for not exercising phase-hook side effects.

### `--policy` mode (WP-193)

The recorder's `--policy random|heuristic --setup <path>` mode produces
a deterministic fixture from a captured simulation trace. The CLI shape:

```pwsh
node scripts/record-game-fixture.mjs `
  --name <fixture-name> `
  --seed <seed-string> `
  --created-at "<ISO 8601 timestamp>" `
  --engine-version "<git short SHA or semver>" `
  --policy random|heuristic `
  --setup <path-to-setup-envelope.json> `
  [--max-moves <N>]
```

The setup envelope is the canonical shape consumed by
`apps/arena-client/public/loadout-test.json`:

```jsonc
{
  "schemaVersion": "1.0",
  "playerCount": <integer 1..5>,
  "heroSelectionMode": "GROUP_STANDARD",
  "composition": { /* the 9-field MatchSetupConfig */ }
}
```

The recorder extracts `composition` and `playerCount`, derives
`playerOrder` as `["0", "1", …, String(playerCount - 1)]`, and builds
one policy per seat with the locked seat-derived seed convention
`${operatorSeed}::seat:${i}` (literal `::seat:` separator; D-19303).
`--policy random` resolves to `createRandomPolicy`; `--policy heuristic`
resolves to `createCompetentHeuristicPolicy` (both from
`packages/game-engine/src/simulation/`).

The captured `ReplayMove[]` flows through `recordFromInput` →
`runFixture` — the same path `--input` mode takes — so `runFixture`
remains the single oracle source (D-19301; EC-172 §Guardrails —
Determinism integrity). The recorder never produces an oracle itself.

**Cross-path determinism guarantee.** Both `runFixture` and
`simulation.runner.ts` construct their mulberry32 PRNG from
`hashSeedString(seed)` using byte-identical local helpers. The
round-trip test in `simulation.captureMoves.test.ts` asserts that a
captured trace replayed through `runFixture` produces an `outcome`
field-equal to the captured `outcome` — if either path's PRNG
construction drifts, the trace references cards in wrong zones and
`runFixture` fails loudly.

**Lobby moves are excluded from the captured trace (D-19302).**
Simulation starts post-lobby at `phase = 'play'` after
`buildInitialGameState`; `runFixture` also starts from
`buildInitialGameState`'s output. Lobby moves (`setPlayerReady`,
`startMatchIfReady`) are not in simulation's MOVE_MAP and are not
emitted in `--policy` mode. Hand-crafted fixtures via `--input` mode
are unaffected and may continue to include lobby moves.

**One policy family across all seats.** Per-seat policy *family*
heterogeneity (e.g., random vs heuristic head-to-head) is a future
matrix-sweep concern (WP-194); WP-193 locks one family, with only the
seat seed varying per seat.

### Setup-matrix sweep (WP-194)

`scripts/sweep-setup-matrix.mjs` wraps WP-193's capture primitive in a
deterministic, resumable traversal of the `schemeId × mastermindId`
cross-product over a base setup envelope. The sweep is a **traversal
primitive**, not a coverage claim — it enumerates a defined
two-dimensional slice of setup-space and records raw cell results to a
manifest. Classification, aggregation, and anomaly triage are deferred
to WP-195 (anomaly oracle layer, not yet drafted).

The CLI shape:

```pwsh
node scripts/sweep-setup-matrix.mjs `
  --run-id <id-matching-/^[A-Za-z0-9._-]+$/> `
  --seed <seed-string> `
  --setup <path-to-setup-envelope.json> `
  --scheme-ids <path-to-scheme-ids-list.json> `
  --mastermind-ids <path-to-mastermind-ids-list.json> `
  --policy random|heuristic `
  [--max-cells <N>]
```

`--setup` consumes the same canonical envelope shape WP-193's `--policy`
mode does. `--scheme-ids` and `--mastermind-ids` each point at a JSON
file containing an array of non-empty unique strings — the two axes the
sweep cross-products. The empty axis case is permitted (yields a
zero-cell no-op sweep); duplicates within an axis are a full-sentence
error. `--policy` resolves to the same `createRandomPolicy` /
`createCompetentHeuristicPolicy` factories WP-193 uses, applied per
seat with the nested seed convention described below. `--max-cells`
defaults to `10000`; a soft stderr warning fires for
`5000 < cellCount ≤ max-cells`. An over-cap configuration emits a
full-sentence error BEFORE any dispatch and exits non-zero (no partial
manifest is written).

**Per-cell seed convention (D-19402).** Each cell's seed is
`${runSeed}::cell:${schemeId}:${mastermindId}` with the literal
`::cell:` separator carried verbatim by the engine's
`CELL_SEED_SEPARATOR` export. The intra-cell-coordinate `:` between
`schemeId` and `mastermindId` is the single-colon coordinate join, NOT
the `::cell:` separator. Per-seat seeds nest on top of the cell seed
via `${cellSeed}::seat:${seatIndex}` (WP-193 D-19303 preserved); the
two-domain PRNG invariant (D-3604) holds at every level of the
`runSeed → cellSeed → seatSeed` chain.

**Lex-sort iteration order (D-19401).** The dispatcher (`sweepSetupMatrix`
in `packages/game-engine/src/simulation/sweep.runner.ts`) stable-copies
and lex-sorts both axes before enumeration — outer loop = `schemeId`,
inner loop = `mastermindId`. The operator's axis files are not mutated.
Iteration order is a determinism guarantee, not an implementation
detail: resume logic + manifest line order both depend on it.
`cellIndex` is the per-run 0-based ordinal over the lex-sorted product
and is informational only; the identity key for resume + dedup is the
`(schemeId, mastermindId)` pair.

**Manifest format (canonical JSONL).** Output is written to
`sweep-output/<run-id>/manifest.jsonl`, one line per cell, no enclosing
array, no header, no pretty-print. Success records carry seven keys,
sorted lexicographically:

```jsonc
{
  "cellIndex": <0-based ordinal>,
  "cellSeed": "<runSeed>::cell:<schemeId>:<mastermindId>",
  "endgameReached": <boolean>,
  "mastermindId": "<id>",
  "moveCount": <integer ≥ 0>,
  "outcome": { "escapedVillains": <integer>, "winner": "heroes-win" | "scheme-wins" | null },
  "schemeId": "<id>"
}
```

On a thrown cell the script appends a fatal record (closed five-key
shape) and exits non-zero:

```jsonc
{
  "cellSeed": "<cellSeed of throwing cell>",
  "error": "<full-sentence error message>",
  "mastermindId": "<id of throwing cell>",
  "schemeId": "<id of throwing cell>",
  "type": "fatal"
}
```

The `type` field is the discriminator that distinguishes fatal records
from success records (success records carry no `type` field).

**Resume idempotency.** Re-running with identical CLI args reads any
existing manifest, parses each line to extract its
`(schemeId, mastermindId)` pair, builds a skip-set, and dispatches only
the missing cells. Same args + same axis-file contents +
non-truncated existing manifest → byte-identical final manifest
compared to a single-pass run. Fatal records participate in the
skip-set the same way success records do: to retry a fatal cell the
operator must either remove the fatal record from the manifest or run
under a new `--run-id` (there is no `--retry-fatal` flag in v1).

**Gitignored bulk output.** `sweep-output/` is listed in `.gitignore`
under a WP-194 comment so the bulk artifact never enters the repo.
Pruning the directory is an operator-driven concern outside this WP.

**Deferred-coverage notice.** The sweep does NOT claim full gameplay
coverage. It claims a deterministic, resumable traversal primitive
over a bounded subset of setup-space (schemeId × mastermindId only;
the remaining seven `MatchSetupConfig` fields are held verbatim from
the base envelope). Broader axes (villain groups, hero decks, player
counts), anomaly classification, and aggregate reporting are deferred
to a follow-up WP. WP-194 emits raw cell results; downstream consumers
(WP-195) own interpretation.

---

## Authority chain

- `docs/ai/work-packets/WP-158-complete-game-regression-tests.md` —
  authoritative design
- `docs/ai/execution-checklists/EC-172-complete-game-regression-tests.checklist.md` —
  binding execution contract
- `docs/ai/DECISIONS.md §D-15801` — seed-faithful-pipeline rationale
  + `replay.execute.ts` non-modification commitment
- `packages/game-engine/src/test/fixtures/` — harness source
- `scripts/record-game-fixture.mjs` — operator-facing recorder CLI
- `packages/game-engine/src/replay/replay.execute.ts` — the
  determinism-only forensic harness this WP did NOT modify (D-0205)
