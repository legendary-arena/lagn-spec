---
title: Complete-Game Fixtures
type: Tutorial
tags:
  - testing
  - regression
  - determinism
  - layer-engine
  - drift-detection
related:
  - turn-system.md
  - rule-execution-pipeline.md
  - villain-deck.md
  - cardextid.md
  - master-strike.md
  - scheme-twist.md
status: canonical
source:
  - ../docs/ai/work-packets/WP-158-complete-game-regression-tests.md
  - ../docs/ai/execution-checklists/EC-172-complete-game-regression-tests.checklist.md
  - ../docs/ai/DECISIONS.md
  - ../docs/ai/REFERENCE/complete-game-tests.md
  - ../packages/game-engine/src/test/fixtures/runFixture.ts
  - ../packages/game-engine/src/test/fixtures/fixtureSchema.ts
  - ../packages/game-engine/src/test/fixtures/replayFixtures.test.ts
  - ../scripts/record-game-fixture.mjs
last-reviewed: 2026-05-18
---

# Complete-Game Fixtures

## Summary

Complete-game fixtures are `*.replay.json` files that capture a full
game from setup to either endgame or move-list exhaustion. The engine
replays each fixture deterministically and asserts the resulting
trajectory against a pinned baseline — bug fixes become regression
nets, intentional behaviour changes break fixtures noisily and
require explicit regeneration. This page is the authoring tutorial:
how to add a new fixture, how to re-record one after legitimate
engine changes, and the constraints the harness enforces.

The harness is **engine-only** — no upstream framework `Server()`,
no Socket.IO transport, no live registry reads. It is a separate
pipeline from the determinism-only forensic harness at
`packages/game-engine/src/replay/replay.execute.ts` (locked under
[DECISIONS.md D-0205](../docs/ai/DECISIONS.md)) and was introduced
by [WP-158](../docs/ai/work-packets/WP-158-complete-game-regression-tests.md)
under [DECISIONS.md D-15801](../docs/ai/DECISIONS.md).

## Mechanics

### Where fixtures live

Every fixture is a JSON file under one canonical directory:

```
packages/game-engine/src/test/fixtures/games/
└── sentinel-core-doom-2p.replay.json
```

The driver at
[`packages/game-engine/src/test/fixtures/replayFixtures.test.ts`](../packages/game-engine/src/test/fixtures/replayFixtures.test.ts)
globs `*.replay.json` from that directory at test time. Adding a
fixture is a pure-data change: no test code modification, no
import, no manual wiring. The next `pnpm --filter @legendary-arena/game-engine test`
run picks up every new file automatically.

The fixture's `name` field must equal its filename basename
(excluding `.replay.json`). The validator at
[`fixtureSchema.ts`](../packages/game-engine/src/test/fixtures/fixtureSchema.ts)
rejects mismatches with a full-sentence error — this prevents
misaligned diffs when files are renamed on one side but not the
other.

### Fixture file format

The full schema, with field semantics inline:

```
{
  "name": "<must equal filename basename, excluding .replay.json>",
  "meta": {
    "version": 1,
    "createdAt": "<ISO 8601 timestamp; operator-supplied at record time>",
    "engineVersion": "<git short SHA or semver; operator-supplied at record time>"
  },
  "input": {
    "seed": "<deterministic seed string; transformed via hashSeedString -> mulberry32>",
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

The `meta.version` field is locked to `1`. Future schema changes
increment the version and migrate fixtures explicitly under a
separate WP. The `expected.outcome.winner` field is one of
`"heroes-win"`, `"scheme-wins"`, or `null` (the engine's canonical
`EndgameOutcome` plus `null` when the move list exhausted without
endgame).

The 9 `setupConfig` fields are locked by
[`docs/ai/REFERENCE/00.2-data-requirements.md`](../docs/ai/REFERENCE/00.2-data-requirements.md)
§8.1; entity IDs use the `<setAbbr>/<slug>` qualified form per
[CardExtId](cardextid.md).

### Minimal valid fixture

A fixture passes validation if it satisfies the schema in
§Fixture file format. The smallest valid fixture has:

- A non-empty `name` field matching its filename basename
- A `meta` block with `version: 1`, an ISO 8601 `createdAt`, and
  a non-empty `engineVersion` string
- An `input` block with a non-empty `seed`, a positive integer
  `playerCount` matching `playerOrder.length`, a 9-field
  `setupConfig`, and a (possibly empty) `moves[]` array
- An `expected` block with a 64-char lowercase hex
  `finalStateHash`, a string-array `messages` (may be empty), a
  `snapshotPerTurn` array (may be empty), and an `outcome` object
  with `winner ∈ { null, "heroes-win", "scheme-wins" }` and a
  `counters` record (may be `{}`)

**Empty arrays are valid.** Zero moves means the dispatch loop
exits immediately; the fixture pins only the
`buildInitialGameState` output (setup determinism). Zero
snapshots correspond to zero completed turns (no `endTurn`
dispatched). Empty `messages` is rare in practice —
`buildInitialGameState` typically emits diagnostic warnings
against the empty `CardRegistryReader` stub — but is
theoretically valid.

**The smallest fixture you would actually commit** has a move
list that exercises at least one turn rotation, so the
`snapshotPerTurn` oracle has data to assert against. Anything
less is a setup-only fixture and provides no in-play regression
coverage.

**Copy-paste template.** Recorder fills in `expected.*`; never
hand-edit:

```
{
  "name": "minimal-example",
  "meta": {
    "version": 1,
    "createdAt": "2026-01-01T00:00:00Z",
    "engineVersion": "abc1234"
  },
  "input": {
    "seed": "minimal-example-v1",
    "playerCount": 2,
    "playerOrder": ["0", "1"],
    "setupConfig": {
      "schemeId":        "core/legacy-virus-the",
      "mastermindId":    "core/dr-doom",
      "villainGroupIds": ["core/brotherhood"],
      "henchmanGroupIds":["core/savage-land-mutates"],
      "heroDeckIds":     ["core/black-widow"],
      "bystandersCount": 0,
      "woundsCount":     0,
      "officersCount":   0,
      "sidekicksCount":  0
    },
    "moves": []
  },
  "expected": {
    "finalStateHash":  "<recorder fills this in>",
    "messages":        [],
    "snapshotPerTurn": [],
    "outcome":         { "winner": null, "counters": {} }
  }
}
```

To use this template: save as
`scripts/_my-fixture-input.tmp.json`, run the recorder per
§Adding a new fixture step 3 — the recorder reads `input` +
`meta`, produces `expected`, writes the full fixture under
`packages/game-engine/src/test/fixtures/games/`.

### The three oracle layers

The driver asserts the trajectory in **order**, surfacing the first
failing layer so the diff lands at the right grain.

| Layer | What it catches | Diff grain |
|---|---|---|
| `outcome` | Winner change; endgame-counter divergence (e.g. `escapedVillains` off by one) | The match-level result; you immediately know "the wrong side won." |
| `messages` | First divergent message at index N; readable trace of the turn-and-action where behaviour changed | One-line text diff; usually points directly at the offending move + parameter. |
| `finalStateHash` | Subtle state-placement differences the message log doesn't surface (zone counts, counter increments, `hookRegistry` shape, scheme/mastermind state) | Opaque sha256; surfaces drift no narrative log would catch. |

A passing fixture passes all three layers. A failing fixture is
reported at the **first** layer that mismatches — fixing that
layer often resolves the others automatically.

### Failure classification (debug vs re-record)

When a fixture fails, the right response depends on **why** the
oracle mismatched. The harness does not classify failures — it
detects and reports them; PR review classifies and decides.
Use this table:

| Failure pattern | Classification | Action |
|---|---|---|
| `outcome.winner` flipped (e.g. heroes-win → scheme-wins) | Behaviour change | If PR sanctions a rule change: re-record. Otherwise: debug. |
| `outcome.counters` drifted (e.g. `escapedVillains 3 → 4`) | Endgame-counter drift | Review PR intent first; same disposition as above. |
| `messages` differs at index N — text only, no length change | Wording change | Almost always intentional (rule text, error message, log refactor). Re-record. Surface in PR description. |
| `messages` differs at index N — different action sequence | Behaviour change at turn N | Compare expected/actual at the divergence index to identify which move's effect changed. Debug or re-record per PR intent. |
| `messages` length changed | Different effect-count per move | Debug first — extra/missing messages usually indicate a rule-pipeline change (hook firing more or fewer times). |
| `snapshotPerTurn` differs but `messages` matches | Silent state drift | High-signal: a move mutated state without emitting a message. Debug first; may be a silent regression. |
| `finalStateHash` differs but `messages` + `snapshotPerTurn` match | Subtle G-shape change | Almost always 01.5 wiring (new `G` field, default-value change, shape tweak). Re-record. |
| Hash differs across machines on the same checkout | Determinism bug | **STOP.** Do not commit. Fix the nondeterminism source (PRNG state leak, wall-clock leak, Set/Map serialization order) before any further fixture work. |
| `input` block differs between expected fixture and PR-modified version | Fixture re-scoping | **REJECT** the PR. Re-recording must preserve the `input` block exactly — only `expected` may change. Re-scoping is a different scenario and needs a separate fixture. |
| `Fixture <name> has N moves past endgame at turn T` (thrown) | Fixture corruption | The move list extends past the endgame-triggering move. Trim the list and re-record, OR fix the engine if endgame fired too early. |
| `validateFixture` throws (`name` ≠ filename, missing meta, etc.) | Schema violation | Fix the fixture file — never the validator. |

**Message drift is never automatically ignored.** Every drift
surfaces as a test failure. The operator decides at PR time
whether it's an intentional re-record or a regression. There
is no "ignore-by-default" message-allowlist; introducing one
would defeat the messages oracle's role.

### Adding a new fixture: step-by-step

There is no "import" — fixtures are pure data. The workflow has
three steps: write an input block, run the recorder, commit the
result.

**Step 1 — Write the input block** as a temp JSON file in your
scratch area (anywhere outside `packages/game-engine/src/test/fixtures/games/`
so the test driver doesn't try to replay an incomplete file).
Example: `scripts/_my-scenario-input.tmp.json`.

```
{
  "seed": "my-scenario-v1",
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
    { "playerId": "1", "moveName": "setPlayerReady",   "args": { "ready": true } },
    { "playerId": "0", "moveName": "startMatchIfReady", "args": null }
    /* ...rest of move list... */
  ]
}
```

The move-name vocabulary is closed. The dispatchable moves are
exactly the keys registered in
[`packages/game-engine/src/game.ts`](../packages/game-engine/src/game.ts)
`LegendaryGame.moves` plus lobby-phase moves:

| Move name | Stage gate | Args | Notes |
|---|---|---|---|
| `setPlayerReady` | any | `{ "ready": true }` | Lobby move; sets `G.lobby.ready[playerID]` |
| `startMatchIfReady` | any | `null` | Lobby move; transitions to play phase (no-op `setPhase` in harness) |
| `drawCards` | start, main | `{ "count": N }` | Draws N cards from the player's deck into hand |
| `playCard` | main | `{ "cardId": "<ext_id>" }` | Plays a card from hand to inPlay |
| `revealVillainCard` | start | `null` | Reveals top of villain deck; routes per [Villain Deck](villain-deck.md) |
| `fightVillain` | main | `{ "cardId": "<ext_id>" }` | Defeats a villain in the City |
| `recruitHero` | main | `{ "hqIndex": 0..4 }` | Recruits a hero from HQ |
| `fightMastermind` | main | `null` | Fights the active mastermind tactic |
| `advanceStage` | any | `null` | Advances `G.currentStage`: start → main → cleanup → next turn |
| `endTurn` | cleanup | `null` | Triggers turn rotation + per-turn snapshot capture |

See [Turn System](turn-system.md) for the stage-gating contract.
Unknown move names **throw** at dispatch (NOT the warn-and-continue
pattern that `replay.execute.ts` uses — that pattern is
intentionally not adopted here; see Edge Cases below).

**Step 2 — Build the engine** so the recorder can import the
compiled `runFixture.js`:

```
pnpm --filter @legendary-arena/game-engine build
```

**Step 3 — Run the recorder** to produce the full fixture file:

```
node scripts/record-game-fixture.mjs `
  --name my-scenario `
  --seed my-scenario-v1 `
  --created-at "2026-05-17T14:30:00Z" `
  --engine-version "$(git rev-parse --short HEAD)" `
  --input scripts/_my-scenario-input.tmp.json
```

The recorder writes
`packages/game-engine/src/test/fixtures/games/my-scenario.replay.json`.
Delete the temp input file (it should not be committed). Run
`pnpm --filter @legendary-arena/game-engine test` once to confirm
the new fixture passes, then commit the fixture file alongside the
source change it pins.

### Authoring decision matrix

When in doubt, consult this table before opening a
fixture-touching PR. It removes ambiguity at review time and
keeps fixture intent aligned with PR intent:

| You are doing this | What the fixtures should look like |
|---|---|
| Fixing a bug that changes player-visible behaviour | One new fixture pins the bug-fix scenario; re-record any existing fixtures the fix legitimately changes |
| Implementing a new mechanic (scheme / mastermind tactic / hero ability / board keyword) | One new fixture per scenario the mechanic activates — see Fixture granularity below |
| Refactoring with zero behavioural change | **Zero** fixtures change. If any fixture fails, the refactor was not behaviour-preserving — debug. |
| Changing a message string (rule text, error wording, log format) | Existing fixtures' `messages` oracles fail; re-record affected fixtures; surface the wording change in the PR description |
| Adding a new `G` field via 01.5 wiring | Existing fixtures' `finalStateHash` oracles fail; re-record affected fixtures (the new field changes the canonical-JSON shape) |
| Adding a new move to `LegendaryGame.moves` | Add the move to `MOVE_MAP` in [`runFixture.ts`](../packages/game-engine/src/test/fixtures/runFixture.ts) in the same PR; existing fixtures unaffected unless the new move replaces a path the existing fixtures exercise |
| Bumping `meta.version` from 1 to 2 | Out of scope for any current WP — see Schema versioning and migration below |

### Fixture granularity

There is no hard limit on fixture size, but these conventions
keep the corpus useful and the signal-to-noise ratio high:

**Prefer one fixture per scenario, not per assertion.** A
fixture that pins *"Black Widow's Stealth ability draws a card
when played alongside a Tech card"* is a single scenario, even
though three oracles assert against it. Splitting that into
three fixtures (one per oracle) creates redundant setup cost
and weakens the readability of the corpus.

**Keep fixtures small enough to read.** A 200-move fixture
becomes hard to triage when it fails. If a single scenario
genuinely needs that many moves, consider splitting on
narrative seams (one fixture per major turn or phase
transition). Recommended soft cap: **≈ 50 moves** for
hand-crafted fixtures. Beyond that, the `--policy` autoplay
mode (deferred — see Edge Cases) is the better fit when it
lands.

**One mechanic per fixture, plus the minimum scaffolding to
reach it.** A fixture for Master Strike should not also
exercise hero recruitment unless the test scenario specifically
requires both. Cross-mechanic fixtures are valuable for
integration coverage but should be intentional, not accidental.

**Bug-fix fixtures are the most valuable kind.** A reproducer
fixture filed at bug-discovery time, then pinned to the bug-fix
PR, becomes a permanent regression net for that exact bug. This
is the snapshot-test pattern's strongest use case — capture the
exact move sequence that reproduces the bug, then pin the
post-fix trajectory.

The committed corpus starts at **one sentinel fixture**. The
broader corpus is a follow-up WP whose scope is exactly *"grow
the corpus"*. At that point, this guidance solidifies into
explicit per-category quotas (e.g. *"one fixture per scheme,
one per mastermind, one per hero ability tier"*).

### Recorder CLI reference

| Flag | Required? | Notes |
|---|---|---|
| `--name <fixture-name>` | yes | Becomes both the file basename and the fixture's `name` field |
| `--seed <seed-string>` | yes (or inherited) | Deterministic seed; inherited from source fixture's `input.seed` when `--input` carries a full fixture |
| `--created-at <ISO 8601>` | yes (or inherited) | Operator-supplied timestamp; the recorder MUST NOT read the wall-clock |
| `--engine-version <string>` | yes (or inherited) | Operator-supplied git SHA or semver; the recorder MUST NOT shell out to git |
| `--input <path>` | exclusive with `--policy` | Path to either a bare input block JSON file OR a full existing fixture file |
| `--policy random\|heuristic --setup <path>` | exclusive with `--input` | CLI-accepted but currently throws "deferred to follow-up WP" — use `--input` mode |
| `--max-moves <N>` | optional (default 10000) | Throws if the move list exceeds N |

When `--input` is a full fixture file, the recorder inherits
`seed`, `createdAt`, and `engineVersion` from the source's meta /
input blocks unless overridden by CLI flags. This is the standard
flow for re-recording an existing fixture after a legitimate
engine change.

### Re-recording after intentional engine changes

When a code change legitimately alters engine behaviour (a bug
fix, a rule clarification, a balance tweak), affected fixtures
will fail their oracle assertions on the next test run.
Regenerate them:

1. Confirm the behaviour change is intentional and the WP / EC
   body sanctions it. (If it surfaced unexpectedly, the change is
   a regression — debug instead.)
2. Re-record the affected fixture by passing the committed
   fixture itself as `--input`:

   ```
   node scripts/record-game-fixture.mjs `
     --name <fixture-name> `
     --created-at "<ISO 8601 timestamp>" `
     --engine-version "$(git rev-parse --short HEAD)" `
     --input packages/game-engine/src/test/fixtures/games/<fixture-name>.replay.json
   ```

   `--seed` is inherited from the source fixture's `input.seed`.
3. Review the diff. The `expected` block changes are the new
   trajectory; the `input` block must **NOT** change (you are not
   re-scoping the fixture — you are re-recording the same scenario
   against new engine behaviour).
4. Commit the regenerated fixture in the same commit as the
   behaviour change. The PR review IS the trajectory-change
   review.

Do not hand-edit the `expected` block. The recorder is the source
of truth — if the recorder produces different values than the
committed fixture, the file is wrong and the recorder is
authoritative.

### Debugging a failed fixture

When `pnpm --filter @legendary-arena/game-engine test` reports
a fixture failure, work through these steps in order:

**Step 1 — Read the failure header.** The driver reports the
fixture name, the failing oracle layer
(`outcome` / `messages` / `finalStateHash`), and the first
divergence index for array oracles, with expected/actual
truncated to 200 chars per side:

```
Fixture "sentinel-core-doom-2p" — MESSAGES oracle mismatch at index 3.
Expected: "Player 0 drew 6 cards."
Actual:   "Player 0 drew 5 cards."
```

**Step 2 — Classify the failure** using the table in §Failure
classification.

**Step 3 — Locate the offending move.** For `messages` /
`snapshotPerTurn` divergence at index N: open the committed
fixture file, scroll to the corresponding entry, and identify
which move dispatched immediately before. Convention:
`snapshotPerTurn[k]` is the state after the (k+1)-th `endTurn`
completed.

**Step 4 — Reproduce locally** with the smallest possible
scope:

```
pnpm --filter @legendary-arena/game-engine test --test-name-pattern "complete-game fixture"
```

This runs only the fixture driver, skipping the rest of the
~750-test engine suite.

**Step 5 — Diff against a clean checkout.** Stash your changes
(`git stash`), re-run the fixture suite on `origin/main`,
observe the hash + messages + snapshots. Restore your changes
(`git stash pop`), re-run, and diff. The delta narrows the
fault to your changes.

**Step 6 — Decide.** Based on step 2's classification:

- **Intentional change with PR sanction** → re-record the
  fixture per §Re-recording after intentional engine changes,
  surface the trajectory delta in the PR description.
- **Unintended regression** → fix the engine, leave the
  fixture untouched, re-run.
- **Determinism bug (hash differs across machines on the same
  checkout)** → **STOP** fixture work entirely. Fix the source
  of nondeterminism (PRNG state leak, wall-clock leak, Set
  serialization order) before any further fixture commits.

**Step 7 — Verify the fix.** Run the full engine test suite
(`pnpm --filter @legendary-arena/game-engine test`); confirm
the fixture is green plus all pre-existing tests are still
green; commit.

### Schema versioning and migration

`meta.version` is currently locked to **1**. The validator
rejects any other value with a full-sentence error naming the
file and version number.

**There is no migration tooling at v1.** All committed
fixtures share the same schema; nothing migrates between
versions because no other versions exist.

**The v2 story (when it arrives):** A future WP whose specific
scope is *"bump fixture schema to v2"* will:

1. Define the v2 shape and the v1 → v2 mapping in its
   §Contract block
2. Update `validateFixture` to accept both versions during a
   transition window (or only v2, if migration is mechanical
   and one-shot)
3. Author a migration script under `scripts/` that reads each
   committed v1 fixture, applies the mapping, and writes the
   v2 form
4. Run the script, regenerate all `expected` blocks via the
   recorder, commit the v2 fixtures in a single PR
5. Drop v1 acceptance after the transition window closes

**Until that WP lands:**

- Do not hand-bump `meta.version`
- Do not commit fixtures with `meta.version != 1`
- Do not mix a hypothetical schema upgrade with a behaviour
  change in the same PR — the trajectory delta becomes
  impossible to attribute

The schema is intentionally narrow at v1. The first concrete
v2 trigger (e.g. needing to record cross-process replay seeds,
adding per-snapshot custom metadata, persisting policy
identifiers from autoplay mode) is what motivates v2 — not a
speculative upgrade.

### Snapshot timing and determinism

Per-turn snapshots are captured **after** the move that triggered
`events.endTurn()` completes AND after `currentPlayer` rotation +
stage reset; **before** the next turn's first move dispatches. One
entry per completed turn; never mid-turn, never partial. The
invariant `snapshotPerTurn.length === completedTurnCount` is
asserted at end-of-run; mismatch indicates a harness bug, not a
fixture bug.

The `snapshotAt` field on each snapshot is normalised to the
fixture's `meta.createdAt`. The underlying `createSnapshot` helper
internally reads `new Date()` (permitted in the persistence module
but not the harness), so the harness replaces that wall-clock
value with the operator-supplied fixture timestamp. This keeps
two invocations byte-identical. All per-turn snapshots therefore
share the same `snapshotAt` — semantically "the wall-clock the
fixture was recorded at," not "this exact turn happened at."

The dispatch loop runs **twice in-process per fixture** as a
within-run determinism guard. Two independent executions are
asserted byte-identical before the result is compared against
the fixture's `expected` block. Catches hidden mutable state
leakage between dispatches: if a move accidentally mutates
module-level state, or if the PRNG instance is shared across
invocations, the second run diverges and the harness throws.

### Anti-patterns

Each of these makes the harness less useful or unreliable.
Catch them at PR review:

- **Hand-editing the `expected` block.** The recorder is the
  source of truth. If the recorder produces different values
  than the committed file, the file is wrong — not the
  recorder.
- **Using fixtures for fuzz testing.** Fixtures pin specific
  scenarios; they are not a property-based testing surface.
  Property tests belong in their own `*.test.ts` files using
  `node:test` directly.
- **Encoding multiple unrelated mechanics in one fixture.** A
  fixture that fails because of an unrelated mechanic in the
  same move list creates triage cost and weakens the failure
  signal. Keep fixtures narrow per §Fixture granularity.
- **Relying on real registry data.** The harness uses a
  minimal empty-result `CardRegistryReader` stub. Setup-time
  builders produce empty villain decks, empty hero decks, and
  empty mastermind tactics. Fixtures that assume real card
  data populated via the registry will not work until a future
  WP extends the harness.
- **Ignoring stage gating.** Moves dispatched in the wrong
  stage silently no-op (per the engine's
  [move validation contract](../.claude/rules/game-engine.md)).
  The fixture parses fine and runs; the trajectory oracle
  catches the missing effect later. Always sequence
  `advanceStage` correctly:
  `start → main → cleanup → endTurn`.
- **Adding scratch input files to the fixtures directory.**
  The test driver globs `*.replay.json` from
  `packages/game-engine/src/test/fixtures/games/`. Any
  malformed file in that directory breaks the driver. Keep
  temp input blocks outside this directory (e.g. under
  `scripts/_my-input.tmp.json`).
- **Re-scoping a fixture during regeneration.** Re-recording
  must preserve the `input` block exactly. Changing the seed,
  player count, setup config, or move list is **not**
  re-recording — it is a new fixture and should be committed
  as one.
- **Setting `meta.version != 1`.** v2 is not defined yet; see
  §Schema versioning and migration.
- **Hand-crafting `finalStateHash` values.** The hash is a
  canonical-JSON sha256 of `G`. You cannot compute it by hand
  reliably. Let the recorder generate it.
- **Wrapping `validateFixture` in `try/catch` inside the
  driver.** The driver MUST surface validator throws via
  `assert.fail`; silently swallowing them lets malformed
  fixtures register as passes.

## Interactions

- **[Turn System](turn-system.md)** — The harness drives turn
  rotation externally because `events.endTurn()` becomes a flag
  flip in the absence of the upstream framework's own turn
  machinery. Stage gating still applies — moves silently no-op
  if dispatched in the wrong stage, exactly as in production.
  Fixtures that violate stage gating produce empty effects, which
  the `messages` oracle catches.
- **[Rule Execution Pipeline](rule-execution-pipeline.md)** —
  Every move dispatched by the harness participates in the
  standard `executeRuleHooks` → `applyRuleEffects` pipeline.
  Scheme Twist, Master Strike, hero abilities, and board-keyword
  effects all fire identically to a live match.
- **[Villain Deck](villain-deck.md)** — `revealVillainCard` is
  one of the recorder-dispatchable moves. The 5-element
  `RevealedCardType` taxonomy drives reveal routing identically
  to production (bystanders to mastermind or frontmost villain,
  scheme-twist via `onSchemeTwistRevealed`, mastermind-strike
  via `onMastermindStrikeRevealed`).
- **[CardExtId](cardextid.md)** — All `cardId` references in
  `playCard` / `fightVillain` / `recruitHero` move args use the
  `<setAbbr>/<slug>` qualified form. Well-known SHIELD card IDs
  (`starting-shield-agent`, `starting-shield-trooper`) are
  permitted because they are non-set-specific game components.
- **[Master Strike](master-strike.md) + [Scheme Twist](scheme-twist.md)**
  — Both triggers fire deterministically when revealed by the
  recorded `revealVillainCard` sequence. Fixtures that pin
  master-strike or scheme-twist behaviour pin the trigger
  payload via the `messages` oracle and the counter state via
  the `outcome` oracle.

## Edge Cases

- **Empty registry stub.** The harness uses a minimal
  `CardRegistryReader` stub (all three methods return empty).
  `buildInitialGameState` accepts this; the resulting `G` has a
  bystander-only villain deck (bystander cards are not
  registry-derived) and empty mastermind tactics / hero deck.
  Sentinel-level fixtures work with the empty stub; richer
  fixtures that need real card data must wait for a future
  harness extension or use only well-known starting cards
  (`starting-shield-agent`, `starting-shield-trooper`).
- **Move-list past endgame.** The dispatch loop terminates
  immediately when `evaluateEndgame(G)` returns non-null. If the
  fixture contains more moves after the endgame-triggering move,
  the harness throws `Fixture <name> has N moves past endgame
  at turn T` — this is a fixture-corruption signal, not a soft
  warning. Recorder-generated fixtures never contain extras;
  hand-crafted move lists must respect the terminal move.
- **Unknown move names.** `MOVE_MAP[unknown]` **throws** with a
  full-sentence error naming the fixture, move index, and the
  unknown name. This deliberately diverges from
  `replay.execute.ts`'s warn-and-continue pattern: that
  forensic harness preserves possibly-broken historical traces;
  the regression harness exists to detect bugs, so silent skip
  would defeat the purpose. Per [DECISIONS.md D-15801](../docs/ai/DECISIONS.md).
- **Name / filename drift.** The validator rejects fixtures
  whose `name` field does not exactly equal the filename
  basename (excluding `.replay.json`). Rename either side and
  the other must follow; do not commit a fixture that fails
  this check.
- **Per-fixture isolation.** Each fixture is replayed with a
  freshly-constructed `LegendaryGameState` and a freshly-seeded
  mulberry32 PRNG. No cross-fixture sharing. If two fixtures
  interfere, the harness has a bug — file an issue rather than
  working around it.
- **Hash drift across machines.** The canonical-JSON sha256
  rules (ASCII-lex key sort at every depth, arrays preserve
  order, `undefined` omitted, `null` preserved, native JSON
  numbers, no whitespace beyond `JSON.stringify` defaults) are
  the only way the hash stays stable across machines and Node
  v22 patch versions. If a fixture's hash differs between two
  clean checkouts, the harness has a determinism bug; **do not**
  commit a hash-divergent fixture.
- **`--policy` mode deferred.** The recorder accepts
  `--policy random|heuristic --setup <path>` for forward
  compatibility but currently throws a "deferred to follow-up
  WP" error on invocation. Implementing functional autoplay
  would either require exporting harness internals (widening
  `runFixture`'s public API) or duplicating the dispatch loop
  (forbidden by the EC-172 guardrails). Use `--input` mode with
  hand-crafted move lists until the follow-up WP lands.

### Common failure smells

Pattern-match these to their usual root causes before diving
into the full §Debugging a failed fixture playbook. Lifted from
[EC-172 §Common Failure Smells](../docs/ai/execution-checklists/EC-172-complete-game-regression-tests.checklist.md):

- **"Recorder says pass, test says fail"** → recorder and
  runner have diverged dispatch loops; the recorder is
  reimplementing instead of calling `runFixture`. Should be
  caught at code review; if it slips through, the fix is
  always to consolidate behind `runFixture`, never to special-
  case the recorder.
- **Hash differs across machines / Node versions** →
  canonical-JSON rule violated (number formatting, key sort,
  or arrays accidentally sorted somewhere). Audit
  [`hashGameState.ts`](../packages/game-engine/src/test/fixtures/hashGameState.ts)
  and any state-shaping code introduced since the last
  passing fixture.
- **Off-by-one snapshot count** → captured before / during
  `endTurn` instead of after stage reset + player rotation; OR
  the `snapshotPerTurn.length !== completedTurnCount`
  invariant assertion is missing.
- **`messages` carries "unknown move name" warnings** →
  `MOVE_MAP` is missing an entry. The harness should **throw**
  for this case (not warn) per the validator-strictness
  guardrail — if you see a warning instead, the strictness was
  loosened accidentally.
- **Test passes once then fails on rerun** → mulberry32
  instance shared across fixture invocations; each
  `runFixture` call must instantiate a fresh PRNG. Per-fixture
  isolation is broken.
- **Tests interfere with each other** → per-fixture isolation
  broken; check that the test driver constructs a fresh `G` +
  PRNG per fixture, not at module load time.
- **Driver silently skips a fixture** → `validateFixture`
  failure swallowed. The driver MUST surface validator throws
  via `assert.fail`; never wrap in `try/catch`. Listed as an
  anti-pattern above.
- **`name` / filename drift** → fixture was renamed on disk
  but the `name` field wasn't updated (or vice versa). The
  validator catches this at load with a full-sentence error.
- **Message drift at index 0** → likely a setup-config or
  registry-stub change; the first message is almost always a
  setup-time diagnostic. Audit changes to
  [`buildInitialGameState`](../packages/game-engine/src/setup/buildInitialGameState.ts)
  or the empty-registry stub before treating this as a
  gameplay regression.
- **Snapshot count mismatch with no message divergence** →
  harness bug, not a fixture bug. The dispatch loop captured a
  snapshot at the wrong boundary, or skipped one. File an
  issue against the harness rather than patching the fixture.
- **`Fixture <name> has N moves past endgame at turn T`** →
  the recorder over-captured (autoplay policy returned moves
  after endgame triggered, when `--policy` lands) OR a
  hand-written fixture's move list extends past the
  `evaluateEndgame` trigger. Trim the move list, re-record.

## Code Touchpoints

- [`packages/game-engine/src/test/fixtures/fixtureSchema.ts`](../packages/game-engine/src/test/fixtures/fixtureSchema.ts)
  — Types + hand-written validator; no Zod dependency.
- [`packages/game-engine/src/test/fixtures/hashGameState.ts`](../packages/game-engine/src/test/fixtures/hashGameState.ts)
  — Canonical-JSON sha256; distinct from `replay/replay.hash.ts`
  (which uses djb2 for the determinism-only harness).
- [`packages/game-engine/src/test/fixtures/runFixture.ts`](../packages/game-engine/src/test/fixtures/runFixture.ts)
  — Seed-faithful dispatch loop; mulberry32 PRNG; opaque
  `ReplayMove` dispatch; endgame-termination throw; defensive
  `[...G.messages]` shallow copy; in-process double-run guard.
- [`packages/game-engine/src/test/fixtures/replayFixtures.test.ts`](../packages/game-engine/src/test/fixtures/replayFixtures.test.ts)
  — `node:test` driver; per-fixture isolation; tiered oracle
  reporter with truncated expected/actual.
- [`scripts/record-game-fixture.mjs`](../scripts/record-game-fixture.mjs)
  — CLI recorder; calls `runFixture` for dispatch; canonical
  JSON output; byte-stable across runs.
- [`packages/game-engine/src/replay/replay.execute.ts`](../packages/game-engine/src/replay/replay.execute.ts)
  — The determinism-only forensic harness this WP did **NOT**
  modify; locked under DECISIONS.md D-0205.

## Data Files

- `packages/game-engine/src/test/fixtures/games/*.replay.json` —
  Committed fixture corpus. The driver globs this directory at
  test time.

## References

- [WP-158 — Complete-Game Regression Tests (Seed-Faithful Fixture Harness)](../docs/ai/work-packets/WP-158-complete-game-regression-tests.md)
  — Authoritative design.
- [EC-172 — Complete-Game Regression Tests checklist](../docs/ai/execution-checklists/EC-172-complete-game-regression-tests.checklist.md)
  — Binding execution contract (Locked Values, Guardrails,
  Required `// why:` Comments, Common Failure Smells).
- [DECISIONS.md D-15801 — Seed-Faithful Fixture Harness as a Separate Pipeline](../docs/ai/DECISIONS.md)
  — The decision that locks the new harness as a separate
  pipeline from `replay.execute.ts` and enumerates rejected
  alternatives.
- [DECISIONS.md D-0205 — RNG Truth Source for Replay](../docs/ai/DECISIONS.md)
  — The pre-existing narrowing that contract-locks
  `replay.execute.ts` as determinism-only and anticipated the
  separate seed-faithful pipeline WP-158 implements.
- [DECISIONS.md D-2802 — Aliasing Defense](../docs/ai/DECISIONS.md)
  — The precedent for the defensive `[...G.messages]` shallow
  copy returned by `runFixture`.
- [`docs/ai/REFERENCE/complete-game-tests.md`](../docs/ai/REFERENCE/complete-game-tests.md)
  — Reference operator docs; this wiki page is the tutorial
  companion.
- [WP-036 — AI Playtesting & Balance Simulation](../docs/ai/work-packets/WP-036-ai-playtesting-and-balance-simulation.md)
  — The scope-locked precedent whose `hashSeedString` /
  `createMulberry32` / `shuffleWithPrng` / `MOVE_MAP` pattern
  the harness mirrors locally.
- [10-GLOSSARY.md](../docs/10-GLOSSARY.md) — `MatchSetupConfig`,
  `CardExtId`, `ReplayMove`, `EndgameOutcome` terminology
  authority.
