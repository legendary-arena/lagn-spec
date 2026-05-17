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
last-reviewed: 2026-05-17
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
