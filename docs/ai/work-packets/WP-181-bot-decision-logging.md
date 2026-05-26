# WP-181 — Bot Decision Logging

## Goal

After this WP, every bot turn produces 1–2 human-readable decision log
messages in `G.messages` explaining what the bot chose, why, and what
alternatives it considered. Players watching bot games (autoplay or PvP
with bot) can see the rationale — the game acts like a radio announcer
narrating not just *what* happened but *why*.

## Assumes

- WP-049 (T2 Competent Heuristic AI) is complete ✅
  - `ai.competent.ts` exports `createCompetentHeuristicPolicy(seed): AIPolicy`
  - `selectBestMove(legalMoves, view, nextRandom): LegalMove` scores all
    moves via `scoreOneMove()` and breaks ties with seeded PRNG
- WP-036 (simulation runner) is complete ✅
  - `simulation.runner.ts` runs the per-turn loop:
    `buildUIState → filterUIStateForAudience → getLegalMoves → policy.decideTurn() → dispatch via MOVE_MAP`
  - The runner pushes warnings into `G.messages` today
- `G.messages: string[]` is append-only, deterministic, no timestamps
  (WP-028 message contract)
- `AIPolicy.decideTurn()` returns `ClientTurnIntent` — no access to `G`
- D-0701: AI is tooling, not gameplay — receives
  `filterUIStateForAudience` view (same as humans)
- D-3604: Two-domain PRNG invariant — policy PRNG never shares state
  with run-level shuffle PRNG
- Baseline at `origin/main` @ `99e0df4` (2026-05-26)

## Context (Read First)

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` — §Game Engine Layer, §Move Validation
   Contract, §The Rule Execution Pipeline
3. `.claude/rules/architecture.md` — Layer Boundary
4. `.claude/rules/code-style.md` — naming, comments, functions
5. `docs/ai/REFERENCE/00.6-code-style.md`
6. `docs/ai/DECISIONS.md` — scan for D-0701, D-3604, D-2705
7. `packages/game-engine/src/simulation/ai.competent.ts` — current scoring
8. `packages/game-engine/src/simulation/ai.types.ts` — `AIPolicy`, `LegalMove`
9. `packages/game-engine/src/simulation/simulation.runner.ts` — dispatch loop
10. `packages/game-engine/src/simulation/ai.competent.test.ts` — existing tests
11. `packages/game-engine/src/network/intent.types.ts` — `ClientTurnIntent`

## Scope (In)

1. **Extend `AIPolicy` return type** — add an optional `decisionLog?: string[]`
   field to `ClientTurnIntent` so the policy can return rationale alongside
   the chosen move without changing the core interface. The field is additive
   and optional — existing callers are unaffected.

2. **Return scored-move rationale from `selectBestMove`** — refactor
   `selectBestMove` to return both the winning `LegalMove` and a decision
   summary (chosen move + score, top alternatives + scores, tie count).
   Introduce a local `BestMoveResult` interface:
   ```
   interface BestMoveResult {
     readonly move: LegalMove;
     readonly decisionLog: string[];
   }
   ```

3. **Format decision messages** — produce 1–2 message lines per bot decision:
   - Line 1: `[Bot] Chose: <moveName> (score <N>)` with args context
     (e.g., city index, HQ index)
   - Line 2 (conditional): `[Bot] Over: <alt1> (<score1>), <alt2> (<score2>)`
     — top 2 scoring alternatives that scored above lifecycle-move threshold
     (`SCORE_ADVANCE_STAGE_BASE = 10`). Omitted when no alternatives scored
     above the threshold.

4. **Wire into the simulation runner** — after `policy.decideTurn()` returns
   an intent, the runner reads `intent.decisionLog` and pushes each line
   into `G.messages` (before dispatching the move).

5. **Test coverage** — new tests in `ai.competent.test.ts`:
   - `selectBestMove` returns `decisionLog` alongside the chosen move
   - `decisionLog` contains the `[Bot]` prefix tag
   - `decisionLog` is deterministic across identical seeds
   - `decisionLog` includes alternative scores when alternatives exist
   - `decisionLog` omits alternatives line when all alternatives are
     lifecycle moves

## Out of Scope

- Wiring `GameLogPanel` into the live play views (separate task)
- Changing scoring heuristics or adding new ones
- Structured message types or rich event objects (keep `string[]`)
- Client-side message filtering or styling of `[Bot]` messages
- Autoplay playback controls changes
- Any changes to `G.messages` append contract or UIState projection

## Files Expected to Change

- `packages/game-engine/src/network/intent.types.ts` — **modified** —
  add optional `decisionLog?: string[]` to `ClientTurnIntent`
- `packages/game-engine/src/simulation/ai.competent.ts` — **modified** —
  `selectBestMove` returns `BestMoveResult`; `decideTurn` populates
  `intent.decisionLog`
- `packages/game-engine/src/simulation/simulation.runner.ts` — **modified** —
  push `intent.decisionLog` entries into `G.messages` after `decideTurn()`
- `packages/game-engine/src/simulation/ai.competent.test.ts` — **modified** —
  new tests for decision log output

## Non-Negotiable Constraints

### Engine-wide (always apply — do not remove)

- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- Every file must be provided in FULL — no diffs, no snippets, no "show
  only the changed section"
- All randomness via `ctx.random.*` or seeded PRNG — never `Math.random()`
- `G` is never persisted to a database
- Moves never throw; only `Game.setup()` may throw
- No `.reduce()` in zone operations or effect application
- No boardgame.io imports in simulation files
- No `@legendary-arena/registry` imports in engine files

### Packet-specific

- `decisionLog` field on `ClientTurnIntent` MUST be optional (`?`) —
  existing callers that don't set it must compile without changes
- Decision messages MUST be deterministic — no timestamps, no
  floating-point in message strings, no `Date.now()` (replay-safe)
- Decision messages MUST use the `[Bot]` prefix tag for future
  filterability
- The `BestMoveResult` interface is LOCAL to `ai.competent.ts` — not
  exported, not in `ai.types.ts`
- `selectBestMove` return type changes from `LegalMove` to
  `BestMoveResult` — this is an internal refactor, not an API change
- The runner pushes decision log BEFORE dispatching the move (so the
  log appears in `G.messages` before the move's own messages)
- D-3604 invariant: decision PRNG never shares state with run-level
  shuffle PRNG — the logging change must not perturb either PRNG domain
- Score values in messages are integers (the heuristic scores are
  already integers) — no floating-point formatting

### Session protocol

- Stop and ask on unclear items
- If a file outside the allowlist needs modification, invoke 01.5

### Locked contract values

- `[Bot]` prefix tag — verbatim in every decision log message
- Lifecycle-move threshold: `SCORE_ADVANCE_STAGE_BASE` (10) — alternatives
  at or below this score are omitted from the "Over:" line
- Scoring constants unchanged:
  `SCORE_FIGHT_MASTERMIND_BASE=1500`, `SCORE_IMMINENT_ESCAPE_BONUS=800`,
  `SCORE_BYSTANDER_RESCUE_BONUS=500`, `SCORE_REVEAL_VILLAIN_BASE=400`,
  `SCORE_PLAY_CARD_BASE=200`, `SCORE_DRAW_CARDS_BASE=150`,
  `SCORE_FIGHT_VILLAIN_BASE=100`, `SCORE_RECRUIT_BASE=50`,
  `SCORE_ADVANCE_STAGE_BASE=10`, `SCORE_END_TURN_BASE=5`

## Contract

### `ClientTurnIntent` (additive)

```typescript
export interface ClientTurnIntent {
  matchId: string;
  playerId: string;
  turnNumber: number;
  move: { name: string; args: unknown };
  clientStateHash?: string;
  /** Optional bot decision rationale lines. */
  decisionLog?: string[];
}
```

### `BestMoveResult` (local to `ai.competent.ts`)

```typescript
interface BestMoveResult {
  readonly move: LegalMove;
  readonly decisionLog: string[];
}
```

### Decision message format

```
[Bot] Chose: fightVillain[2] (score 600)
[Bot] Over: recruitHero[0] (50), advanceStage (10)
```

- Line 1 always present when policy returns a decision
- Line 2 present only when at least one alternative scored above the
  lifecycle-move threshold (10)
- Args rendered as `[argValue]` when args has a single numeric field
  (`cityIndex`, `hqIndex`, `count`); omitted for zero-arg moves
  (`fightMastermind`, `endTurn`, `advanceStage`, `revealVillainCard`)

## Acceptance Criteria

1. `ClientTurnIntent.decisionLog` is an optional `string[]` field
2. `selectBestMove` in `ai.competent.ts` returns a `BestMoveResult`
   with both `move` and `decisionLog`
3. Every decision log line starts with `[Bot] `
4. `decisionLog` line 1 contains the chosen move name and its integer score
5. `decisionLog` line 2 lists alternatives above the lifecycle threshold
   when present
6. `decisionLog` line 2 is omitted when no alternatives score above
   the lifecycle threshold
7. The simulation runner pushes `intent.decisionLog` entries into
   `G.messages` before dispatching the move
8. Decision log output is deterministic — same seed + same inputs =
   same messages
9. Existing tests pass without modification (the `decisionLog` field
   is additive and optional)
10. New tests cover items 2–8 above
11. `pnpm --filter @legendary-arena/game-engine build` exits 0
12. `pnpm --filter @legendary-arena/game-engine test` exits 0

## Verification Steps

```powershell
# Build
pnpm --filter @legendary-arena/game-engine build

# Run all engine tests
pnpm --filter @legendary-arena/game-engine test

# Grep: decision log field exists on ClientTurnIntent
grep -r "decisionLog" packages/game-engine/src/network/intent.types.ts
# Expected: 1 match — the optional field declaration

# Grep: BestMoveResult is local to ai.competent.ts
grep -rn "BestMoveResult" packages/game-engine/src/simulation/
# Expected: matches ONLY in ai.competent.ts (interface + usage)

# Grep: [Bot] prefix in ai.competent.ts
grep -c "\[Bot\]" packages/game-engine/src/simulation/ai.competent.ts
# Expected: ≥2 (line 1 format + line 2 format)

# Grep: runner pushes decisionLog
grep -n "decisionLog" packages/game-engine/src/simulation/simulation.runner.ts
# Expected: ≥1 match in the per-turn loop

# Grep: no Math.random in simulation files
grep -rn "Math\.random" packages/game-engine/src/simulation/
# Expected: 0 matches

# Grep: no boardgame.io imports in simulation files
grep -rn "from 'boardgame.io" packages/game-engine/src/simulation/
# Expected: 0 matches
```

## Definition of Done

- [ ] All 12 acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `docs/ai/STATUS.md` updated with WP-181 / EC-207 block
- [ ] `docs/ai/DECISIONS.md` updated if decisions were made
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-181 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-207 flipped to Done
- [ ] No files outside `## Files Expected to Change` were modified
  (unless authorized by 01.5)

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §22 (replay faithfulness).

**Conflict assertion:** No conflict: this WP preserves all touched
clauses. Decision messages are deterministic (integer scores, no
timestamps, seeded PRNG-independent) and replay-safe (appended to
`G.messages` via the same pipeline as existing engine messages).

**Determinism preservation:** The change is deterministic and
replay-faithful. Decision log messages are derived solely from
heuristic scores (integer constants) and move names (string literals).
No floating-point, no wall-clock reads, no PRNG perturbation. Same
seed + same inputs = identical messages.

**Non-Goal proximity check:** NG-1..7 not crossed. This is an
engine-internal observability improvement; no monetization, ranking,
persuasive copy, or competitive surface touched.

## Lint Gate Self-Review

| § | Verdict | Notes |
|---|---------|-------|
| §1 | PASS | All 10 required sections present |
| §2 | PASS | Engine-wide + packet-specific + session protocol + locked values |
| §3 | PASS | All dependencies listed with completion status |
| §4 | PASS | Specific docs + sections cited |
| §5 | PASS | 4 files listed with new/modified + descriptions |
| §6 | PASS | No naming deviations from 00.2 |
| §7 | N/A | No new npm dependencies |
| §8 | PASS | Engine-only; no layer boundary violations |
| §9 | PASS | PowerShell verification commands |
| §10 | N/A | No env vars introduced |
| §11 | N/A | No auth touched |
| §12 | PASS | node:test only; no boardgame.io; no network/DB |
| §13 | PASS | Exact commands with expected output |
| §14 | PASS | 12 binary, observable acceptance criteria |
| §15 | PASS | STATUS, DECISIONS, WORK_INDEX, scope-boundary check |
| §16 | PASS | Code-style rules referenced; no premature abstraction |
| §17 | PASS | Vision Alignment present; §3, §22 cited; determinism line present |
| §18 | N/A | No literal-string-scoped grep gates that overlap with prose |
| §19 | N/A | Not a repo-state-summarizing artifact |
| §20 | N/A | No funding surface touched — engine-only observability change; no UI surfaces, no user-visible copy, no funding channels |
| §21 | N/A | No HTTP endpoints touched; no `apps/server/src/**` library functions added or modified |
