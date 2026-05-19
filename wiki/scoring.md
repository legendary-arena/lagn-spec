---
title: Scoring
type: System
tags:
  - layer-engine
  - scoring
  - par
  - leaderboard
  - determinism
  - persistence
  - drift-detection
  - vision
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - scheme.md
  - rule-execution-pipeline.md
  - turn-system.md
  - cardextid.md
  - card-type-taxonomy.md
  - board-keywords.md
status: canonical
source:
  - ../.claude/skills/legendary-game-engine/SKILL.md
  - ../packages/game-engine/src/scoring/scoring.types.ts
  - ../packages/game-engine/src/scoring/parScoring.types.ts
  - ../packages/game-engine/src/scoring/parScoring.keys.ts
  - ../packages/game-engine/src/scoring/parScoring.logic.ts
  - ../packages/game-engine/src/scoring/scoring.logic.ts
  - ../packages/game-engine/src/scoring/scoringConfigLoader.ts
  - ../docs/01-VISION.md
  - ../docs/12-SCORING-REFERENCE.md
  - ../docs/12.1-PAR-ARTIFACT-INTEGRITY.md
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-020-vp-scoring-win-summary-minimal-mvp.md
  - ../docs/ai/work-packets/WP-027-determinism-replay-verification-harness.md
  - ../docs/ai/work-packets/WP-048-par-scenario-scoring-leaderboards.md
  - ../docs/ai/work-packets/WP-049-par-simulation-engine.md
  - ../docs/ai/work-packets/WP-050-par-artifact-storage.md
  - ../docs/ai/work-packets/WP-051-par-publication-server-gate.md
  - ../docs/ai/work-packets/WP-053a-par-artifact-scoring-config.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Scoring

## Summary

Scoring is the engine's two-layer measurement system: a per-match
**Final Score** computed from match outcomes, normalized against a
per-scenario **PAR baseline** that represents competent rules-faithful
play. Both layers are end-of-match-only, deterministic, JSON-
serializable, and config-version-pinned so historical results stay
comparable. The structural separation between *how hard the scenario
is* (PAR) and *how heroic you were inside it* (Final Score) is locked
by VISION §20–26 and is the architectural anchor for every leaderboard
surface.

## Mechanics

### The two-layer model

The system has two distinct measurement layers, mirroring the golf
metaphor in [VISION §20](../docs/01-VISION.md):

- **Layer A — PAR (course rating).** Static per-scenario expected
  outcome for a competent team. Encoded as `ParBaseline` (rounds,
  bystanders, victory points, escapes). Never adapts to the team
  that played.
- **Layer B — Final Score (execution quality).** Computed per
  match: `finalScore = rawScore - parScore`. Lower is better;
  negative is under PAR. Driven by the same formula applied to the
  match's `ScoringInputs` and to the scenario's `ParBaseline`, then
  subtracted.

This page documents the layer separation, the type contracts, the
determinism invariants, and the persistence boundary. The numerical
formula and worked weight values live in
[`docs/12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md) and
are not duplicated here.

### Identity keys

Two canonical string keys identify a scoring context:

- **`ScenarioKey`** — `"{schemeSlug}::{mastermindSlug}::{sorted-villainGroupSlugs-joined-by-+}"`,
  built by `buildScenarioKey` in
  [`parScoring.keys.ts`](../packages/game-engine/src/scoring/parScoring.keys.ts).
- **`TeamKey`** — `"{sorted-heroSlugs-joined-by-+}"`, built by
  `buildTeamKey`.

Both keys are **never constructed by hand**. The sort + join
algorithm is the only valid construction path; producing keys from
unsorted slug lists silently breaks leaderboard joins.

### Self-contained scenario configs (D-4805)

Every scenario carries a complete `ScenarioScoringConfig`:

```ts
interface ScenarioScoringConfig {
  scenarioKey: ScenarioKey;
  weights: ScoringWeights;
  caps: ScoringCaps;
  penaltyEventWeights: PenaltyEventWeights;
  parBaseline: ParBaseline;
  scoringConfigVersion: number;
  createdAt: string;   // ISO-8601, class-2 metadata
  updatedAt: string;   // ISO-8601, class-2 metadata
}
```

The reference defaults in
[`12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md) are
**authoring guidance, not runtime merge targets** — `validateScoringConfig`
rejects any configuration missing any required field, including any
`PenaltyEventType` key. A scenario config is either valid in full or
invalid in full; partial configs do not run.

### Integer-encoded weights (centesimal)

`ScoringWeights` and `PenaltyEventWeights` are **integers**, not
floats. The
[`parScoring.types.ts`](../packages/game-engine/src/scoring/parScoring.types.ts)
header is explicit: weights are stored at centesimal precision (×100)
to avoid floating-point determinism issues; display layers divide by
100 to render decimal values. The engine never sees fractional
weights. This is one of the determinism invariants and is non-
negotiable across all platforms (Windows / Linux / Render hosts).

### `scoringConfigVersion` pin

Every `ScoreBreakdown` and `LeaderboardEntry` carries the integer
`scoringConfigVersion` of the config that produced it. The version
increments on **any** weight, cap, or PAR change. Consumers compare
results only against peers under the same version; cross-version
comparison is never silently allowed. This is the immutability
guarantee VISION §22 requires: "Once declared, PAR baselines are
immutable for the purpose of competition."

### `PenaltyEventType` closed taxonomy

```ts
type PenaltyEventType =
  | 'villainEscaped'
  | 'bystanderLost'
  | 'schemeTwistNegative'
  | 'mastermindTacticUntaken'
  | 'scenarioSpecificPenalty';
```

`PENALTY_EVENT_TYPES` is the canonical readonly array, kept in
one-to-one correspondence via drift-detection tests. Each type has
its own integer weight; there is no shared escape multiplier. Per
the source `// why:` comment, the per-event weights encode the
moral hierarchy from VISION §21 (e.g., `bystanderLost` is more
severe than `villainEscaped`).

### Derivation boundary (D-4801, D-4804)

`ScoringInputs` is derived from a completed match by
`deriveScoringInputs(replayResult, finalGameState)`:

- **End-of-match only (D-4804).** Callers must not invoke the
  derivation mid-match; partial state produces invalid scoring.
- **Team-aggregate VP (D-4803).** `victoryPoints` is summed across
  all players, not stored per-player.
- **Replay-driven.** `rounds` reads from `replayResult.moveCount`
  in MVP. Future WPs may refine the rounds metric.

The derivation step is the single boundary between match runtime
and the scoring system. Once `ScoringInputs` exists, the rest of
the pipeline is pure.

### Pipeline shape

```
ScoringInputs ──┐
                ├──> buildScoreBreakdown ──> ScoreBreakdown
ScenarioConfig ─┘                                │
                                                 ├──> LeaderboardEntry
ReplayHash ──────────────────────────────────────┘    (server-built)
```

`ScoreBreakdown` is the immutable result the engine returns:
`weightedRoundCost`, `weightedPenaltyTotal`, `penaltyBreakdown`,
`weightedBystanderReward`, `weightedVictoryPointReward`, `rawScore`,
`parScore`, `finalScore`, plus the inputs and version pin. Every
intermediate component is exposed so leaderboard UIs and
post-match summaries never recompute.

`LeaderboardEntry` (defined in the engine, instantiated in the
server) wraps a `ScoreBreakdown` with `replayHash` (WP-027
`computeStateHash` output), `playerIdentifiers`, and the same
`scoringConfigVersion` pin.

### JSON-serializable invariant (D-4806)

Every public scoring type must survive
`JSON.parse(JSON.stringify(…))` with structural equality. No
functions, Maps, Sets, Dates, or class instances appear in any
exported type. This invariant is what makes scoring results safe to
persist as snapshots, ship to the leaderboard server, and replay
deterministically across deploys.

### MVP VP table (Layer-A inputs only)

The MVP victory-point inventory in
[`scoring.types.ts`](../packages/game-engine/src/scoring/scoring.types.ts)
defines five named constants used to compute per-player VP from
`G.playerZones[…].victory` and the wounds piles. These are inputs
to Layer A's victory-point category — not the Final Score
formula directly. Card-text-specific VP modifiers are deferred to
future WPs per the source `// why:` comment.

## Interactions

- **[Scheme](scheme.md), Mastermind, and Villain Groups.** Together
  they form the scenario identity — the `ScenarioKey` is derived
  exclusively from these slugs. PAR is keyed on the scenario, never
  on the team that plays it.
- **[Villain Deck](villain-deck.md).** Three of the five
  `PenaltyEventType` values are sourced from the villain-deck
  pipeline:
  - `villainEscaped` — counted from
    `ENDGAME_CONDITIONS.ESCAPED_VILLAINS`
  - `bystanderLost` — counted from bystander-resolution paths
  - `schemeTwistNegative` — counted from scheme-twist outcomes that
    qualify (per the per-scenario penalty config)
- **[Scheme Twist](scheme-twist.md).** The `schemeTwistNegative`
  penalty event ties scoring to twist outcomes. The Scheme Twist
  page documents the trigger; this page documents the penalty
  taxonomy that consumes it.
- **Endgame.** Final scoring is end-of-match only and runs once
  `endIf` (per `evaluateEndgame` in
  [`game-engine.md` Endgame](../.claude/skills/legendary-game-engine/SKILL.md))
  has resolved. `computeFinalScores` reads `G` without mutating it
  and never triggers endgame logic.
- **Persistence.** `ScoreBreakdown` and `LeaderboardEntry` are the
  only scoring artifacts that cross the persistence boundary. `G`
  itself is never persisted (per
  [`architecture.md` "G and ctx Are Runtime-Only"](../.claude/rules/architecture.md));
  scoring summaries are derived records, not save-game state.
- **Replay verification.** `replayHash` (WP-027) is the proof that a
  `LeaderboardEntry` is reproducible by re-running the replay
  through the engine. VISION §24 requires every leaderboard entry
  be replay-verified; this hash is the structural enforcement.

## Edge Cases

- **Cross-version comparison is never silent.** A `ScoreBreakdown`
  produced under `scoringConfigVersion: 3` is not directly
  comparable to one under `version: 4`. Leaderboard surfaces must
  filter by version; the engine offers no implicit migration of
  historical scores. VISION §22 requires this — refinements create
  new versions, never retroactive adjustments.
- **`null` caps mean "no cap", not zero.** `ScoringCaps.bystanderCap`
  and `victoryPointCap` are `number | null`. `null` is the explicit
  sentinel for "uncapped" (per WP-029 D-2901 precedent —
  `exactOptionalPropertyTypes` is enabled, so `undefined` is not
  interchangeable with `null`).
- **Keys are slug-sorted before join.** A `ScenarioKey` built from
  `['x', 'a', 'b']` and one built from `['a', 'b', 'x']` must
  produce the same string. Hand-constructing keys without the sort
  step yields different string identities for the same scenario —
  silent leaderboard fragmentation.
- **`PenaltyEventWeights` must cover every `PenaltyEventType`.**
  `validateScoringConfig` rejects configs missing any key. There
  is no fallback to zero for unset weights; a missing weight is a
  validation error, not a silent default.
- **Drift hazard.** Adding a `PenaltyEventType` requires updating
  the union, the `PENALTY_EVENT_TYPES` array, every existing
  `ScenarioScoringConfig.penaltyEventWeights` map (since
  `validateScoringConfig` requires full coverage), and any scoring
  code that fans out on the type. The drift-detection test catches
  the array-vs-union mismatch; existing-config back-population is
  on the migration author.
- **Scoring never throws on partial state.** Engine code paths that
  encounter incomplete or malformed scoring inputs return
  validation results (`ScoringConfigValidationResult`) or push
  diagnostic messages — they do not throw. Only `Game.setup()` may
  throw per
  [`game-engine.md` Throwing Convention](../.claude/skills/legendary-game-engine/SKILL.md).
- **`computeFinalScores` is read-only.** Per the
  [10-GLOSSARY.md](../docs/10-GLOSSARY.md) entry: "reads `G` without
  mutating it. Never triggers endgame logic. Never queries the
  registry." Calling it during a match for preview purposes is
  technically possible but violates D-4804 (end-of-match only) —
  the result is not meaningful mid-match.

## Code Touchpoints

- [`packages/game-engine/src/scoring/parScoring.types.ts`](../packages/game-engine/src/scoring/parScoring.types.ts)
  — `ScenarioKey`, `TeamKey`, `ScoringWeights`, `ScoringCaps`,
  `PenaltyEventType`, `PENALTY_EVENT_TYPES`, `PenaltyEventWeights`,
  `ParBaseline`, `ScenarioScoringConfig`, `ScoringInputs`,
  `ScoreBreakdown`, `LeaderboardEntry`,
  `ScoringConfigValidationResult`
- [`packages/game-engine/src/scoring/parScoring.keys.ts`](../packages/game-engine/src/scoring/parScoring.keys.ts)
  — `buildScenarioKey`, `buildTeamKey` (canonical-form constructors)
- [`packages/game-engine/src/scoring/parScoring.logic.ts`](../packages/game-engine/src/scoring/parScoring.logic.ts)
  — `deriveScoringInputs`, `buildScoreBreakdown`,
  `validateScoringConfig`
- [`packages/game-engine/src/scoring/scoring.types.ts`](../packages/game-engine/src/scoring/scoring.types.ts)
  — VP table constants, `PlayerScoreBreakdown`, `FinalScoreSummary`;
  re-exports the PAR types
- [`packages/game-engine/src/scoring/scoring.logic.ts`](../packages/game-engine/src/scoring/scoring.logic.ts)
  — `computeFinalScores` (per-player VP aggregation; pure read of `G`)
- [`packages/game-engine/src/scoring/scoringConfigLoader.ts`](../packages/game-engine/src/scoring/scoringConfigLoader.ts)
  — config loader / validation entry point

## History

- WP-020: VP scoring + win summary; `computeFinalScores` introduced; economy-vs-scoring separation locked
- WP-027: `computeStateHash` introduced — produces the `replayHash` consumed by `LeaderboardEntry`
- WP-048: PAR type family introduced (`ScenarioKey`, `TeamKey`, `ScenarioScoringConfig`, `ScoreBreakdown`, `LeaderboardEntry`); D-4801 / D-4803 / D-4804 / D-4805 / D-4806 locked
- WP-049: PAR simulation engine — heuristic AI runs to compute the 55th-percentile baseline (per VISION §26 phase 2)
- WP-050: PAR artifact storage — server-side persistence of versioned configs
- WP-051: PAR publication server gate — server-side admission rule for new config versions
- WP-053a: `ScenarioScoringConfig` extension landed; PAR config authoring origin moved to `data/scoring-configs/` (D-5306a)

## References

- [`docs/01-VISION.md`](../docs/01-VISION.md) §20–26 — PAR-Based Scenario
  Scoring; the two-layer model (Layer A / Layer B); deterministic
  evaluation; replay-verified competitive integrity; immutability of
  declared baselines
- [`docs/12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md) —
  the formula, weights, caps, and worked examples (canonical home;
  not duplicated in the wiki)
- [`docs/12.1-PAR-ARTIFACT-INTEGRITY.md`](../docs/12.1-PAR-ARTIFACT-INTEGRITY.md)
  — rationale for hashing PAR artifacts
- [`.claude/skills/legendary-game-engine/SKILL.md`](../.claude/skills/legendary-game-engine/SKILL.md)
  — Throwing Convention; Endgame `endIf` contract; Move Validation
  Contract (validators return — only `Game.setup()` may throw)
- [`.claude/rules/architecture.md`](../.claude/rules/architecture.md)
  — Persistence boundary (`G` is runtime-only; snapshots are
  derived records)
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — WP-020 review
  notes; PAR pipeline summary
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) —
  `ENDGAME_CONDITIONS`, `evaluateEndgame`, `EndgameResult`,
  `computeFinalScores`
- [WP-020](../docs/ai/work-packets/WP-020-vp-scoring-win-summary-minimal-mvp.md),
  [WP-027](../docs/ai/work-packets/WP-027-determinism-replay-verification-harness.md),
  [WP-048](../docs/ai/work-packets/WP-048-par-scenario-scoring-leaderboards.md),
  [WP-049](../docs/ai/work-packets/WP-049-par-simulation-engine.md),
  [WP-050](../docs/ai/work-packets/WP-050-par-artifact-storage.md),
  [WP-051](../docs/ai/work-packets/WP-051-par-publication-server-gate.md),
  [WP-053a](../docs/ai/work-packets/WP-053a-par-artifact-scoring-config.md)
