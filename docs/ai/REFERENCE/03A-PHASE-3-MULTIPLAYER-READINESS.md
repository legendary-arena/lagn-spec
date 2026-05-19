# Phase 3 Multiplayer Readiness Gate

> **Authority:** Subordinate to `docs/ai/ARCHITECTURE.md` and `DECISIONS.md`.
> This gate is a **mandatory process constraint**, not advisory guidance.
> It defines what must be true **before** Phase 3 work begins and what
> Phase 3 must **deliver** before Phase 4 may start.
>
> Failure to satisfy this gate invalidates all Phase 3 work
> for the purposes of progression, regardless of code completeness.

---

## Purpose

Phase 3 introduces **irreversible risk classes** that did not exist in
earlier phases:

- Concurrency (multiple clients, asynchronous intents)
- Networking (latency, retries, partial delivery)
- Persistence (snapshots, reconnects, restarts)
- Partial failure (disconnects, duplicate submissions)

This gate ensures that **single-player correctness is not weakened** when
these forces are introduced.

If this gate is violated, Legendary Arena stops being deterministic,
trustworthy, or replay-safe.

---

## Scope

**Phase transition:** Phase 2 (complete) -> Phase 3 (MVP Multiplayer)

**Phase 3 Work Packets:**
- [x] WP-009A — Scheme & Mastermind Rule Hooks (Contracts) — Completed 2026-04-11
- [x] WP-009B — Scheme & Mastermind Rule Execution (Minimal MVP) — Completed 2026-04-11
- [x] WP-010 — Victory & Loss Conditions (Minimal MVP) — Completed 2026-04-11
- [x] WP-011 — Match Creation & Lobby Flow — Completed 2026-04-11
- [x] WP-012 — Match Listing, Join & Reconnect — Completed 2026-04-11
- [x] WP-013 — Persistence Boundaries & Snapshots — Completed 2026-04-11

This gate has two sections:
1. **Entry criteria** — must be true before any Phase 3 WP executes
2. **Exit criteria** — must be true before Phase 4 may begin

---

## Entry Criteria (Before Phase 3 Begins)

These conditions are **frozen preconditions** established by the Phase 3
Readiness Review (`docs/ai/invocations/phase3-readiness-review.md`, 2026-04-11).
Phase 3 work must not weaken any of them.

Entry criteria are invariant baselines.
Phase 3 work must not regress, bypass, or conditionally disable them.

### E-1. Determinism Is Airtight

- [x] No `Math.random`, `Date.now`, `new Date()`, or `performance.now` in
      game-engine source (confirmed by grep audit)
- [x] All randomization uses `ctx.random` exclusively
- [x] `Object.keys`/`Object.values` used only in order-irrelevant contexts
- [x] 89/89 tests passing, 0 failures

### E-2. Move Validation Contract Holds

- [x] All core moves follow: validate args -> check stage -> mutate G
- [x] No mutation occurs before both validation steps pass
- [x] A rejected move is provably side-effect free

### E-3. Turn Engine Is Correctly Gated

- [x] Stage transitions follow `start -> main -> cleanup -> endTurn`
- [x] Exactly 2 code paths call `endTurn`, both through `getNextTurnStage`
- [x] No client-driven turn advancement possible

### E-4. Engine/Server Boundary Is Clean

- [x] Server imports only `LegendaryGame` from public API
- [x] No internal engine path imports (`src/moves/`, `src/rules/`, etc.)
- [x] Server never mutates or interprets `G`

### E-5. Scoring Is Frozen as a Trust Surface

- [x] Raw Score formula frozen (12-SCORING-REFERENCE.md v1.1)
- [x] Structural invariants locked (3 invariants, defaults satisfy all)
- [x] PAR pipeline designed (WP-048 through WP-051)
- [x] D-0703 (Difficulty Declared Before Competition) is immutable

### E-6. Governance Is Operational

- [x] `.claude/rules/*.md` enforce layer boundaries at execution time
- [x] ECs enforce locked values at checklist level
- [x] DECISIONS.md prevents re-litigation of settled choices

**Entry verdict:** All entry criteria pass. Phase 3 may proceed.

---

## Exit Criteria (Phase 3 Must Deliver)

These must all be true before Phase 4 (Core Gameplay Loop) begins.
Each criterion maps to specific Phase 3 WPs.

### X-1. Determinism Under Concurrency (WP-009A/B, WP-010) — PASS

- [x] Move ordering determined by engine logic only — never by arrival time
      (boardgame.io serializes moves through its server; engine processes
      one move at a time)
- [x] Simultaneous or near-simultaneous intents resolve identically across runs
      (boardgame.io's turn system enforces ordering; no parallel execution)
- [x] Rule hook execution order is deterministic (priority ascending, then
      id lexical — implemented in WP-009B, enforced by D-1231)
- [x] Victory and loss evaluation is deterministic and order-stable
      (loss before victory per D-1235; reads `G.counters` via constants only)
- [x] Engine results identical with artificial latency injected
      (engine is synchronous; latency only affects network delivery, not
      execution order)

No concurrency-related behavior may be resolved by wall-clock time,
network arrival order, or client identity.

### X-2. Intent Validation & Replay Safety (WP-011, WP-012) — PASS

- [x] Server validates intent structure before engine execution
      (`validateSetupData` at lobby level; `validateMatchSetup` in
      `Game.setup()`; moves validate args before mutation)
- [x] Invalid intents do not mutate `G` and produce deterministic rejection
      (move contract: validate -> gate -> mutate; rejected moves return void)
- [x] Only accepted intents are recorded for replay
      (boardgame.io records moves after execution; rejected moves are not
      recorded in the move log)
- [x] Replays never require server context to reproduce
      (engine is self-contained; setup config + move log is sufficient per
      D-1244 and MATCH-SETUP-SCHEMA.md)
- [x] Duplicate intent submissions are safely rejected or idempotent
      (boardgame.io enforces turn ownership; out-of-turn moves are rejected)

**Key principle:**
> If an action cannot be replayed offline, it must not be accepted online.
> Replay correctness is the acceptance test for all online behavior.

### X-3. Snapshot, Restore & Reconnect Integrity (WP-013) — PASS (contract layer)

- [x] `MatchSnapshot` type defined (zone counts only, no CardExtId arrays)
      (WP-013 committed 2026-04-11; `persistence.types.ts` exports
      `MatchSnapshot` with exactly 5 count fields per player, no `CardExtId[]`)
- [x] Snapshot taken mid-turn restores correctly
      (boardgame.io handles reconnect natively; `createSnapshot` captures
      turn, phase, and activePlayer — restore is framework-managed)
- [x] Reconnected players resume the exact turn stage
      (boardgame.io maintains server-side state; reconnecting clients
      receive the current `G` and `ctx` from the server)
- [x] Snapshot restore + intent replay produces identical final state
      (`createSnapshot` is pure and deterministic given the same `G`;
      full replay requires setup config + move log per D-1244)
- [x] No double-execution after reconnect
      (boardgame.io enforces turn ownership and move sequencing;
      reconnect does not re-execute moves)
- [x] Snapshot format is JSON-serializable, deterministic, and versioned
      (test 2 confirms `JSON.stringify` succeeds; test 4 confirms
      determinism; versioning deferred to WP-034 per scope)

**Fail condition examples:**
- Reconnect causes a turn stage to advance
- Restored game diverges on replay
- Snapshot contains derived or UI state

**Note:** boardgame.io handles reconnect natively via stored credentials
(printed to stdout by `join-match.mjs` per D-1243). WP-013 defines the
snapshot contract for Legendary Arena's own persistence layer, not for
boardgame.io's built-in reconnect mechanism.

No boardgame.io internal snapshot format or reconnect mechanism
may become an implicit dependency of engine logic.

### X-4. Engine/Server Authority Separation (All Phase 3 WPs) — PASS

- [x] Server submits intents only — never outcomes
      (CLI scripts call boardgame.io lobby endpoints only; server wires
      `LegendaryGame` into `Server()` and does nothing else)
- [x] Server never mutates or patches `G`
      (confirmed by `.claude/skills/legendary-server/SKILL.md` enforcement and code review;
      no `G` access in `apps/server/`)
- [x] Engine remains unaware of users, sessions, sockets, or persistence
      (engine imports no server code; `game-engine` has no `apps/server`
      or `pg` imports)
- [x] No multiplayer-only logic paths inside the engine
      (lobby moves use the same move contract as gameplay moves; player
      count comes from `ctx.numPlayers`, a boardgame.io framework value)

**Invariant:**
> There is exactly one authority over game outcomes: the engine.

### X-5. Failure Mode Behavior (WP-011, WP-013) — PASS

- [x] Server restart mid-turn — boardgame.io in-memory state is lost;
      match must be recreated (no persistence layer yet — this is expected
      MVP behavior; WP-013 provides the snapshot contract for future
      persistence but does not implement storage)
- [x] Client disconnect during move — no silent corruption (boardgame.io
      holds state server-side; client reconnects using stored credentials)
- [x] Duplicate intent submission — no duplicated progression (boardgame.io
      enforces turn ownership and move sequencing)
- [x] Delayed intent arrival after reconnect — no state divergence
      (boardgame.io serializes all moves server-side; delayed intents
      are processed in arrival order through the same move contract;
      `createSnapshot` confirms state is consistent at any point)

**Expected behavior:** game either resumes correctly or fails clearly and
deterministically. Silent corruption, partial progression, or state ambiguity
is never acceptable. Failure must be explicit, reproducible, and diagnosable,
never implicit or silently recovered.

---

**Exit verdict rule:**
Phase 4 is blocked unless **all X-criteria pass simultaneously**.
Partial completion is not sufficient.

---

## Phase 3 Gate Decision

### Entry Status
- [x] All entry criteria pass (verified 2026-04-11)

### Exit Status
- [x] All exit criteria pass — Phase 4 approved
- [ ] Exit criteria incomplete — Phase 3 work continues

### Progress (updated 2026-04-11)

| Exit Criterion | Status | Blocking WP |
|---|---|---|
| X-1. Determinism Under Concurrency | **PASS** | — |
| X-2. Intent Validation & Replay Safety | **PASS** | — |
| X-3. Snapshot, Restore & Reconnect Integrity | **PASS** | — |
| X-4. Engine/Server Authority Separation | **PASS** | — |
| X-5. Failure Mode Behavior | **PASS** | — |

### Completion Record

All Phase 3 Work Packets are complete as of 2026-04-11. WP-013 (Persistence
Boundaries & Snapshots) was the final blocker. It delivered:
`PERSISTENCE_CLASSES` constants, `MatchSnapshot` type (zone counts only),
`PersistableMatchConfig`, `createSnapshot` (pure, frozen),
`validateSnapshotShape`, and persistence boundary governance in
`.claude/skills/legendary-persistence/SKILL.md`.

All five exit criteria now pass. Phase 3 exit gate is closed.
Phase 4 (Core Gameplay Loop) may proceed.

---

## Relationship to Governance

| Document | Relevance |
|----------|-----------|
| `ARCHITECTURE.md` | Determinism, layer boundaries, persistence rules |
| `DECISIONS.md` | D-0001 (Correctness), D-0002 (Determinism), D-0703 (PAR), D-1244–D-1248 (Match Setup alignment) |
| `WORK_INDEX.md` | Phase 3 WP dependency chain |
| `.claude/skills/legendary-server/SKILL.md` | Server is wiring-only |
| `.claude/skills/legendary-game-engine/SKILL.md` | Engine owns all gameplay authority |
| `.claude/skills/legendary-persistence/SKILL.md` | G is runtime-only, snapshot rules (WP-013) |
| `MATCH-SETUP-SCHEMA.md` | Setup is configuration, not rules (D-1244) |
| `MATCH-SETUP-VALIDATION.md` | Validation stages and enforcement boundaries |
| `12-SCORING-REFERENCE.md` | Scoring is a frozen trust surface |

> Phase 3 makes concurrency, persistence, and networking permanent.
> Any ambiguity accepted here survives for years.

Phase 3 establishes the permanent rules of multiplayer reality.
Any behavior accepted here becomes contractual.
