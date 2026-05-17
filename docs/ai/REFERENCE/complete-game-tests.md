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

### Recorder `--policy` mode is deferred

The recorder accepts `--policy random|heuristic --setup <path>` for
forward compatibility, but the autoplay implementation is deferred
to a follow-up WP. Implementing it inline would either require
exporting `runFixture` internals (widening the harness public API)
or replicating the dispatch loop (forbidden by EC-172 §Guardrails).
The sentinel and any near-term fixtures use `--input` mode with
hand-crafted move lists. The error message the recorder emits on
`--policy` invocation explains the deferral with a single
full-sentence message.

When `--policy` mode lands, it will share the dispatch primitive
with `runFixture` (so the recorder/runner shared-loop invariant
holds) and consume `createRandomPolicy` /
`createCompetentHeuristicPolicy` from
`packages/game-engine/src/simulation/`.

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
