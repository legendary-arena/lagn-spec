# Legendary Arena — Move Log / Replay Format (PGN-Equivalent)

## Status
- Exists today?: **Partial**
  - **Present:** a purely in-memory replay contract (`ReplayInput` +
    `replayGame`) in `packages/game-engine/src/replay/`. This is a
    reconstruction-from-inputs model: given `setupConfig`, `playerOrder`,
    and an ordered `ReplayMove[]`, `replayGame()` rebuilds the final
    `LegendaryGameState` deterministically.
  - **Missing:** no persistence. The boardgame.io `Server()` is
    instantiated without a `db:` option (defaults to
    framework-provided `InMemory`). No code in `apps/server/**` writes
    `ReplayInput`, `LogEntry`, snapshots, or any move record to any
    store (PostgreSQL, filesystem, R2). No caller invokes
    `fetch({ log: true })`. No caller invokes `createSnapshot`.
    On process restart, all match state is lost.
- Canonical source of truth: **none persisted.** At runtime, the
  authoritative record is whatever the framework adapter retains for the
  match (state + metadata). In the current configuration this retention
  is in-process only (default `InMemory`). The `LogEntry[]` is written
  by the framework per move but is not consumed by this repo, so it
  cannot be treated as the authoritative record here.
- Last verified by code inspection: commit `1d709e5323c09a3a4da1b9c8d53057faa3218c3c`
- Repo root: `C:\pcloud\BB\DEV\legendary-arena`

## Non-goals
Scoping guard-rails for this document and any downstream Work Packet:

- Defining a bespoke move-log schema that duplicates boardgame.io
  `LogEntry`.
- Cryptographic tamper-proofing of replays. The existing state hash is
  djb2 and is explicitly non-crypto — see
  [packages/game-engine/src/replay/replay.hash.ts:35-36](packages/game-engine/src/replay/replay.hash.ts).
- Guaranteeing replay across engine code changes without an explicit
  schema / engine-version strategy (none exists today — see Gap #6).
- Redefining the `MatchSnapshot` contract. Per
  `.claude/skills/legendary-persistence/SKILL.md §Class 3`, snapshots store counts only
  and are Derived — they are not a replacement for a move log.

## Decision Points (Not decided here)
This document records current reality. The following architectural forks
are **implied by the gaps** and must be resolved — each via a
`docs/ai/DECISIONS.md` entry — before any persistence / replay Work
Packet is scoped:

1. **Canonical persisted artifact.**
   - A) boardgame.io-native: `initialState + LogEntry[]` retrieved via
     `fetch({ initialState: true, log: true })`.
   - B) engine-native: `ReplayInput` (current engine contract;
     unpersisted today).
   - C) both, with one derived from the other.
2. **Privacy boundary.** Persist private logs (admin / tournament
   tooling only), persist public-only logs, or persist a dual view.
   See also the Redaction risk in Known Gaps.
3. **RNG truth source.** boardgame.io's seeded `ctx.random.*` vs the
   engine's own `ReplayInput.seed` + a deterministic PRNG. These must
   agree, or replays will not reproduce live matches (see Gap #4).

## Purpose
Grounded in actual consumers found in the code:

- **Determinism verification** — `verifyDeterminism(input, registry)` in
  [packages/game-engine/src/replay/replay.verify.ts:39-54](packages/game-engine/src/replay/replay.verify.ts) runs
  `replayGame` twice and compares `computeStateHash` outputs. Used by
  `replay.verify.test.ts` to prove the engine is deterministic.
- **Final-state hashing** — `computeStateHash(G)` in
  [packages/game-engine/src/replay/replay.hash.ts:67-70](packages/game-engine/src/replay/replay.hash.ts) produces
  a djb2 hex hash over a canonical (sorted-key) JSON serialization of
  `LegendaryGameState`.

No other consumers found. No replay, analysis, debugging, tournament,
spectate, or reconnection code reads a persisted move log — because no
persisted move log exists.

## boardgame.io Built-In Usage
- **Adapter class used by `Server({ db })`:** **defaulted to `InMemory`.**
  `Server()` is called with only `games` and `origins` in
  [apps/server/src/server.mjs:90-98](apps/server/src/server.mjs). No `db:` option,
  no import of `FlatFile` / `LocalStorage` / `bgio-postgres` / any
  `StorageAPI.Async` or `Sync` subclass anywhere in the repo.
- **Is the stock `LogEntry` the canonical record?** **Neither used nor
  wrapped.** Grep for `LogEntry|deltalog|_stateID` across the repo
  (excluding `node_modules/`) returns hits only in this invocation's own
  documentation files — zero hits in source code. Whatever the in-memory
  `InMemory` adapter stores per the framework contract is never imported,
  read, or referenced by this repo.
- **Is `fetch({ log: true })` invoked anywhere?** **No.** Zero source-
  code hits. **The framework's `LogEntry[]` is therefore Diagnostic at
  best — it is written by the framework to `InMemory` and never consumed.**
- **Do any Legendary Arena moves declare `redact`?** **No.** The eight
  moves registered in `LegendaryGame.moves`
  ([packages/game-engine/src/game.ts:176-185](packages/game-engine/src/game.ts)) —
  `drawCards`, `playCard`, `endTurn`, `advanceStage`, `revealVillainCard`,
  `fightVillain`, `recruitHero`, `fightMastermind` — plus `setPlayerReady`
  and `startMatchIfReady` contain no `redact:` property. All `redact`
  string hits in the repo live in `packages/game-engine/src/ui/uiState.filter.ts`
  and describe UI-audience hand filtering, **not** the boardgame.io
  move-log redaction contract.
- **Is the `log` plugin (`state.plugins.log`) configured?** **No.**
  `LegendaryGame` declares no `plugins` key at all (see the full Game
  object in [packages/game-engine/src/game.ts:81-261](packages/game-engine/src/game.ts)).
- **Is `initialState` persisted and used for replay?** **No.** The
  framework's `InMemory` adapter holds `initialState` in memory per
  the boardgame.io contract, but no code in this repo retrieves it via
  `fetch({ initialState: true })` or similar. The engine's own
  `ReplayInput` contract does **not** store a serialized
  `LegendaryGameState` as its starting point — it stores
  `setupConfig: MatchSetupConfig` and reconstructs initial state via
  `buildInitialGameState()`.

## Canonical Artifacts

### 1. Framework-owned in-memory log (boardgame.io `InMemory`)
- **Artifact:** `LogEntry[]` stored in the framework's default `InMemory`
  adapter (node_modules reference:
  `node_modules/.pnpm/boardgame.io@0.50.2/node_modules/boardgame.io/src/server/db/inmemory.ts`).
- **Classification:** **Diagnostic** (not Canonical). Written per move by
  framework internals; never consumed by this repo.
- **Storage medium / location:** Process memory, lost on restart.
- **Write trigger / frequency:** Framework-internal, one `LogEntry` per
  reducer run (move / game event / undo / redo), per
  `node_modules/.../boardgame.io/src/core/reducer.ts::initializeDeltalog()`.
- **Read path(s) / consumers:** **None in this repo.** Zero call sites of
  `fetch({ log: true })`.
- **Ordering mechanism:** Framework-owned `_stateID` monotonic counter
  (per `node_modules/.../boardgame.io/src/types.ts`). Not enforced or
  preserved by this repo because this repo never reads it.
- **Versioning:** None. The framework ships no schema version on
  `LogEntry` itself.

### 2. `ReplayInput` (in-memory, unpersisted)
- **Artifact:** `ReplayInput` — see
  [packages/game-engine/src/replay/replay.types.ts:34-39](packages/game-engine/src/replay/replay.types.ts).
- **Classification:** Canonical *in intent* (explicitly named as the
  "canonical replay input contract" in its own doc comment), but
  **currently Diagnostic in practice** — no writer persists it, no reader
  loads it from persistent storage. It exists only as a function-call
  contract to `replayGame()` and `verifyDeterminism()`.
- **Storage medium / location:** Caller's memory. Every test that uses it
  constructs it inline (`packages/game-engine/src/replay/replay.verify.test.ts`).
- **Write trigger / frequency:** None automatic. Constructed by tests.
- **Read path(s) / consumers:**
  `replayGame()` [packages/game-engine/src/replay/replay.execute.ts:138-178](packages/game-engine/src/replay/replay.execute.ts) and
  `verifyDeterminism()` [packages/game-engine/src/replay/replay.verify.ts:39-54](packages/game-engine/src/replay/replay.verify.ts).
- **Ordering mechanism:** Array order of `input.moves: ReplayMove[]`.
  Enforced by the `for (const move of input.moves)` loop at
  [packages/game-engine/src/replay/replay.execute.ts:156](packages/game-engine/src/replay/replay.execute.ts) — no
  explicit ordering field, no sort; insertion order is the ordering.
- **Versioning:** None. No `schemaVersion` field on `ReplayInput`.

### 3. `MatchSnapshot` (pure helper, unpersisted)
- **Artifact:** `MatchSnapshot` — shape defined in
  `packages/game-engine/src/persistence/persistence.types.ts`, derived by
  `createSnapshot(G, ctx, matchId)` in
  `packages/game-engine/src/persistence/snapshot.create.ts`.
- **Classification:** **Derived** by design (per `.claude/skills/legendary-persistence/SKILL.md`
  — "zone counts only, never zone contents; safe to delete without
  affecting game integrity"). **Not wired into any persistence path.**
- **Write trigger / frequency:** None. `createSnapshot` has zero callers
  outside its own unit test (`snapshot.create.test.ts`). Grep for
  `createSnapshot` in `apps/` returns zero hits.
- **Read path(s) / consumers:** None.
- **Ordering mechanism:** N/A — snapshots are point-in-time counts, not
  an ordered series.
- **Versioning:** None.

## Data Model

### Move Record Schema

The **actual** in-memory serialized shape used by this repo's replay
harness (`ReplayMove`), from
[packages/game-engine/src/replay/replay.types.ts:21-25](packages/game-engine/src/replay/replay.types.ts):

```ts
interface ReplayMove {
  readonly playerId: string;
  readonly moveName: string;
  readonly args: unknown;
}
```

Field-by-field against the invocation's checklist:

| Field | Present? | Notes |
|---|---|---|
| `gameId` / `matchId` | **Unknown / not on the move record.** `ReplayInput` has no `matchId` field; the only match identifier in the codebase is `matchID` generated by the boardgame.io lobby API (see `apps/server/scripts/create-match.mjs:100-102`). It is not joined to `ReplayInput`. |
| `playerId` / seat | Yes — `ReplayMove.playerId: string`. `ReplayInput.playerOrder: string[]` holds the seat sequence. |
| `moveName` | Yes — `ReplayMove.moveName: string`. Dispatched via the static `MOVE_MAP` in [replay.execute.ts:77-88](packages/game-engine/src/replay/replay.execute.ts). |
| `args` / `payload` | Yes — `ReplayMove.args: unknown`. Type-erased; trusted to match the dispatched move's signature. |
| `seq` / `ply` / `turn` / explicit ordering field | **None.** Ordering is the position in `moves: ReplayMove[]`. |
| `timestamp` | **Not present.** |
| `stateHash` | Present at the **result** layer (`ReplayResult.stateHash`), not per-move. Computed over the final `G` only. |
| `RNG seed / state` | `ReplayInput.seed: string` is stored but **not currently used.** The replay harness hardwires a reverse-shuffle (`Shuffle: (deck) => [...deck].reverse()`) at [replay.execute.ts:121-123](packages/game-engine/src/replay/replay.execute.ts) and a comment at `replay.execute.ts:119-120` says the seed is "stored for future seed-faithful replay." |
| `schemaVersion` | **None.** |

The framework-owned `LogEntry` shape (from
`node_modules/.../boardgame.io/src/types.ts`) exists in memory but is not
read; its fields (`action`, `_stateID`, `turn`, `phase`, `redact?`,
`automatic?`, `metadata?`, `patch?`) are not surfaced anywhere in this
repo's source.

### Snapshot Schema (if applicable)

`MatchSnapshot` shape lives in
`packages/game-engine/src/persistence/persistence.types.ts` and is
summarised in `.claude/skills/legendary-persistence/SKILL.md §Class 3`. Top-level keys:
`matchId`, `snapshotAt`, `turn`, `phase`, `activePlayer`, `players[]`
(per-player `deckCount` / `handCount` / `discardCount` / `inPlayCount` /
`victoryCount` — counts only), `counters`, `messages`, optional
`outcome`. Per the architecture rule, zone contents (`CardExtId[]`) are
deliberately excluded. Linkage to move ranges: **none** —
`MatchSnapshot` carries no move offset, no `_stateID`, no `ReplayInput`
cursor.

## Replay Semantics
- **Replay input(s) required to reproduce the game:**
  `ReplayInput { seed, setupConfig: MatchSetupConfig, playerOrder: string[], moves: ReplayMove[] }`.
  Plus a `CardRegistryReader` passed as a separate argument to
  `replayGame(input, registry)`.
- **Determinism & RNG:** `replayGame` builds initial state with
  `makeMockCtx({ numPlayers })` ([replay.execute.ts:149](packages/game-engine/src/replay/replay.execute.ts))
  and substitutes the framework `random.Shuffle` with a fixed
  reverse-shuffle ([replay.execute.ts:121-123](packages/game-engine/src/replay/replay.execute.ts)).
  The stored `seed` is not consumed; the comment at
  `replay.execute.ts:119-120` acknowledges this as MVP. `events.endTurn`
  and `events.setPhase` are no-ops during replay
  ([replay.execute.ts:110-117](packages/game-engine/src/replay/replay.execute.ts)) —
  the reconstruction relies on the recorded move stream including any
  explicit `advanceStage` / `endTurn` moves. There is no live
  boardgame.io runtime in the replay path.
- **Validation / integrity:** `computeStateHash(finalState)` via djb2
  over sorted-key JSON
  ([replay.hash.ts:67-70](packages/game-engine/src/replay/replay.hash.ts));
  `verifyDeterminism` runs `replayGame` twice and compares. The
  file comment ([replay.hash.ts:35-36](packages/game-engine/src/replay/replay.hash.ts))
  explicitly states djb2 is "not cryptographically secure — used only
  for replay determinism verification." No signatures, no tamper
  detection, no per-move invariant cross-check.

## Evidence Map (No Guessing)

### Write path
- **Path:** `apps/server/src/server.mjs`
- **Symbol:** `startServer()` → `Server({ games: [LegendaryGame], origins: [...] })`
- **Snippet:**
  ```js
  const server = Server({
    games: [LegendaryGame],
    origins: [
      'https://cards.barefootbetters.com',
      'http://localhost:5173',
    ],
  });
  ```
  ([apps/server/src/server.mjs:90-98](apps/server/src/server.mjs))
- **What it proves:** No `db:` key is passed. Per boardgame.io defaults,
  the `InMemory` adapter is used. No `ReplayInput` writer exists; no
  explicit `setState(matchID, state, deltalog)` caller in repo code.
  Whatever persists is framework-internal and in-process memory only.

- **Path:** `apps/server/src/rules/loader.mjs`
- **Symbol:** `loadRules()`
- **Snippet:** `pool.query('SELECT rule_id, code, label, card_types, raw FROM legendary.rules')`
  ([apps/server/src/rules/loader.mjs:44-47](apps/server/src/rules/loader.mjs))
- **What it proves:** The only PostgreSQL access in `apps/server/` is a
  startup-time **read** of the glossary rules text. No `INSERT`,
  `UPDATE`, or `CREATE TABLE` exists anywhere under `apps/` (verified
  by case-insensitive Grep — 0 hits).

### Read path (for a persisted move log)
- **Path / Symbol:** *none found.*
- **Queries that returned zero hits in repo source (outside `node_modules/`
  and `docs/ai/{invocations,session-context}/`):**
  - `LogEntry|deltalog|_stateID` — 0 source-code hits (matches only in
    this invocation's own docs).
  - `fetch\({\s*log` — 0 hits.
  - `StorageAPI|\bAsync\b|\bSync\b.*db` (boardgame.io storage base classes) — 0 hits.
  - `bgio-postgres|bgio-firebase` — 0 hits.
  - `FlatFile|InMemory|LocalStorage` as imports from `boardgame.io` — 0 hits.
  - `ReplayInput|replayGame|verifyDeterminism` in `apps/**` — 0 hits
    (verified by Grep: "No matches found"). All usages live inside
    `packages/game-engine/src/replay/**` tests.
  - `createSnapshot|validateSnapshotShape` in `apps/**` — 0 hits.
- **What it proves:** There is no reader. No code path in this repo
  loads a persisted move log, snapshot, or replay input from any store.

### Serialized shape
- **Path:** `packages/game-engine/src/replay/replay.types.ts`
- **Symbols:** `ReplayMove`, `ReplayInput`, `ReplayResult`
- **Snippet:**
  ```ts
  export interface ReplayMove {
    readonly playerId: string;
    readonly moveName: string;
    readonly args: unknown;
  }
  export interface ReplayInput {
    readonly seed: string;
    readonly setupConfig: MatchSetupConfig;
    readonly playerOrder: string[];
    readonly moves: ReplayMove[];
  }
  ```
  ([packages/game-engine/src/replay/replay.types.ts:21-39](packages/game-engine/src/replay/replay.types.ts))
- **What it proves:** This is the only move-record shape defined in the
  repo. It is a function-call contract, not a serialization contract —
  no schema / JSON Schema / Zod validator for it exists.

### Ordering rule + where enforced
- **Path:** `packages/game-engine/src/replay/replay.execute.ts`
- **Symbol:** `replayGame()` move loop
- **Snippet:**
  ```ts
  for (const move of input.moves) {
    const moveFn = MOVE_MAP[move.moveName];
    ...
  }
  ```
  ([packages/game-engine/src/replay/replay.execute.ts:156](packages/game-engine/src/replay/replay.execute.ts))
- **What it proves:** Ordering is **array-insertion order** on
  `ReplayInput.moves`. There is no explicit `seq` / `ply` field, no
  `ORDER BY`, no sort. The framework's own `_stateID` monotonic
  ordering is not adopted or mirrored.

### Query log (zero-hit queries are evidence)
**Search method:** Claude Code `Grep` tool (ripgrep under the hood),
executed from the repo root `C:\pcloud\BB\DEV\legendary-arena`.
Exclusions applied per query via the `glob` parameter — most queries
excluded `node_modules/**`; queries targeting repo code excluded
`docs/ai/invocations/**` and `docs/ai/session-context/**` where noted
(those two directories contain this invocation's own documentation and
inflate match counts). File-pattern searches used the `Glob` tool. Raw
`grep` / `rg` via Bash is forbidden by `.claude/CLAUDE.md`.

| Query | Hits (source code) | Notes |
|---|---|---|
| `LogEntry\|deltalog\|_stateID` | 0 | Matches in docs only. |
| `redact` | 0 as move property; 10 in `ui/uiState.filter.ts` (UI audience filter) | No move-level `redact:` declarations. |
| `plugins\s*:` | 0 | No `LegendaryGame.plugins` key. |
| `db\s*:\|FlatFile\|InMemory\|LocalStorage\|bgio-postgres` in `apps/` | 0 | Confirms `Server()` is called without `db:`. |
| `INSERT\|CREATE TABLE\|ALTER TABLE` (case-insensitive) in `apps/` | 0 | No SQL writes anywhere. |
| `pg\.Pool\|new Pool\|pg\.Client\|new Client\(` in `apps/` | 1 (`rules/loader.mjs:114`) | Rules-glossary read only. |
| `R2\|S3\|putObject\|getObject\|bucket` in `apps/` | R2 references are all read-only card/metadata fetches in `registry-viewer` | No game-state writes to R2. |
| `writeFile\|fs/promises` in `apps/server/` | 1 (`create-match.mjs:17`, reads setup JSON) | No game-state writes. |
| `ReplayInput\|replayGame\|verifyDeterminism` in `apps/` | 0 | Replay harness is engine-internal and test-only. |
| `createSnapshot\|validateSnapshotShape` in `apps/` | 0 | Snapshots are never created by server code. |
| `initialState` in `apps/` source (excluding `dist/`) | 0 | No `fetch({ initialState: true })` call site. |

## Known Gaps / Risks (Descriptive, not prescriptive)

1. **No persistence.** `Server()` defaults to `InMemory`. A process
   restart loses every in-progress match — matches, credentials,
   in-memory `LogEntry[]`, and any hope of post-mortem replay.
2. **Write-only framework log.** Even the framework-managed `LogEntry[]`
   in `InMemory` is never read by this repo. Per this invocation's own
   rubric, that classifies it as **Diagnostic**, not **Canonical**.
3. **Replay harness is not wired to real matches.** `ReplayInput` and
   `replayGame()` exist and are proven deterministic by
   `replay.verify.test.ts`, but no server code ever *constructs* a
   `ReplayInput` from a live match. There is no writer, no reader, no
   round-trip test against a real boardgame.io match.
4. **Seed is stored but ignored during replay — BLOCKER for any
   "replay live matches" feature.** `ReplayInput.seed` exists;
   `replayGame` hardcodes a reverse-shuffle and ignores the seed (see
   comment at [replay.execute.ts:119-120](packages/game-engine/src/replay/replay.execute.ts)).
   Replay is "deterministic" only because a fixed mock RNG is used in
   both the initial and replay runs — it would not reproduce the
   outcome of a live match driven by boardgame.io's seeded
   `ctx.random.*`. Any Work Packet that claims to "replay matches" must
   either (a) replace the reverse-shuffle with RNG semantics that match
   live matches, or (b) explicitly label itself
   *debug-only / determinism-only* and not claim live-match
   reconstruction.
5. **No linkage between match identity and replay identity.**
   `ReplayInput` has no `matchId`; `MatchSnapshot.matchId` exists but
   `MatchSnapshot` is itself unpersisted. Nothing ties a live
   boardgame.io `matchID` back to a recoverable replay input.
6. **No schema versioning.** Neither `ReplayInput` nor
   `MatchSnapshot` carries `schemaVersion`. Any future shape change is
   a silent compatibility break for stored artifacts (should any ever
   be stored).
7. **No layer-boundary violations observed.** Persistence code is
   correctly absent from `packages/game-engine/**` — the engine does
   not write to PostgreSQL, filesystem, or network. The gap is
   that the server layer does not yet fill in the persistence it is
   supposed to own.

8. **Redaction / hidden-information risk for any future persistence.**
   Evidence from this run: no Legendary Arena move declares the
   boardgame.io `redact` property; the only `redact*` code path lives
   in `packages/game-engine/src/ui/uiState.filter.ts` and is an
   audience-scoped **UI filter**, not a persistence policy. Today's
   eight registered moves appear to operate on public `CardExtId`
   strings only, but move args are typed `unknown` in `ReplayMove`
   and there is no enforced contract that args carry no hidden
   information. If a future move selects from a hidden zone, reveals
   top-of-deck, or otherwise carries private state in its args, a
   naive "persist the log" implementation would leak that information
   to anyone with log access (admins, tournament tooling,
   theoretically opposing players). This must be addressed as a
   *design* question before logs are persisted — the existing UI
   filter does not substitute for move-level `redact` declarations or
   a dual-view (public / privileged) persisted log.

## Recommendations (Optional, clearly separated)

These are proposals, not decisions. Each substantive architectural
choice below requires a `docs/ai/DECISIONS.md` entry before a Work
Packet is scoped against it (per `.claude/rules/work-packets.md`).

Preference order is the invocation's: extend the boardgame.io built-in
contract rather than invent a parallel move log.

**Entry criterion (applies to any "replay" WP below):** seed
faithfulness must be resolved first — either by replacing the
hardwired reverse-shuffle in `replay.execute.ts:121-123` with RNG
semantics matching live matches, or by explicitly labelling the WP as
*debug-only / determinism-only*. Without this, any "replay" feature is
not actually replaying matches. Tracked as Gap #4 above.

1. **Persistent boardgame.io storage adapter + replay API.**
   Add a `db:` option to the `Server({...})` call in
   `apps/server/src/server.mjs`. Options in decreasing order of
   preference: `bgio-postgres` (community adapter; this repo already
   has a PostgreSQL + `pg` dependency via the rules loader); a custom
   `StorageAPI.Async` subclass that writes to PostgreSQL's existing
   `legendary.*` schema; or `FlatFile` for local dev only.
   Proposed WP title: **"Persistent boardgame.io storage adapter and
   replay fetch path."**
   *Acceptance:* (a) a server restart does not lose in-progress
   matches; (b) a replay / fetch endpoint returns `initialState + log`
   for a given `matchID` via `fetch({ log: true, initialState: true })`.
   If (b) is not satisfied, the log remains Diagnostic, not Canonical.
   Requires a `DECISIONS.md` entry first, selecting the adapter.

2. **Per-move `stateHash` stamping via the log plugin.** Configure
   `LegendaryGame.plugins.log` so each `LogEntry.metadata` captures a
   per-move `stateHash` (using `computeStateHash` from
   `packages/game-engine/src/replay/replay.hash.ts`) and an echo of
   the seed source. This turns the framework log into a tamper-evident
   trail (within the limits of djb2 — see Non-goals) without replacing
   `LogEntry`. Proposed WP title:
   **"boardgame.io log plugin: per-move stateHash stamping."**
   *Acceptance:* every `LogEntry` emitted during a live match includes
   deterministic `metadata.stateHash` computed from a defined view of
   state (public or privileged — see Decision Point 2). Two runs of
   the same match produce byte-identical hash sequences.

3. **Unify the replay harness with the framework log.** Today
   `ReplayInput` is a parallel, engine-local contract. Instead of
   persisting `ReplayInput`, persist the framework's
   `initialState + LogEntry[]` pair and add a thin adapter that
   projects a `LogEntry[]` back into the existing `replayGame`
   pipeline — or retire `replayGame` in favour of rerunning the
   boardgame.io reducer. Proposed WP title:
   **"Unify engine replay harness with boardgame.io log contract."**
   *Acceptance:* given `initialState + log` as input, one canonical
   pipeline reproduces the final `stateHash` and (if Recommendation 2
   shipped) each per-move `stateHash`. Requires a `DECISIONS.md` entry
   because it changes engine API surface (`ReplayInput` would become
   derived, not authoritative).

### If Persistence Is Added: Minimum Identity Envelope (Checklist)
Forward-looking only — not decided by this document. Whatever canonical
artifact is chosen in Decision Point 1, any persisted replay/log record
will need at minimum:

- `matchId` — the boardgame.io `matchID` generated by the lobby API
  (today surfaced only in `apps/server/scripts/create-match.mjs:100-102`).
- `schemaVersion` — for the persisted payload shape; today neither
  `ReplayInput` nor `MatchSnapshot` carries one (Gap #6).
- `gameVersion` — git SHA or semver of the engine build that produced
  the record; required so replays can detect incompatible engine
  changes.
- `createdAt` — optional operational metadata; `MatchSnapshot` already
  carries `snapshotAt` as ISO 8601 precedent.
- `playerOrder` and/or a player-identity mapping — `ReplayInput`
  already has `playerOrder: string[]`; if persisted alongside, must
  remain consistent with the boardgame.io `matchData` player
  assignments.

Proposing a new move-record schema that duplicates `LogEntry` is
explicitly out of scope (see Non-goals) and is **not** recommended here.

WP proposals listed above must **not** be added to
`docs/ai/work-packets/WORK_INDEX.md` by this run — the invocation
forbids it. Titles only; scoping happens via the governed flow.

## Human-Readable Notation Layer (Optional, only if a format was found)

No persisted format exists today. If / when `LogEntry[]` is wired up per
Recommendation 1, a PGN-style rendering directly off
`LogEntry.action.payload` is straightforward and requires no storage
change. Illustrative style only:

```
T12 P2: playCard(args={ cardExtId: "xm-wolverine-berserker-rage" }) [_stateID:47]
T12 P2: fightVillain(args={ cardExtId: "skr-dr-doom-mastermind" }) → outcome derived from next G diff [_stateID:48]
T12 P2: endTurn() [_stateID:49]
```

Move-name and argument shape would come from `ReplayMove.moveName` /
`ReplayMove.args` (or equivalently `LogEntry.action.payload`). Outcomes
are not in the move record and must be inferred by diffing successive
`G` states — this is a renderer concern, not a storage one.
