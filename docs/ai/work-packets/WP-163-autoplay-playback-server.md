# WP-163 — Autoplay Playback Controls (Server)

**Status:** Draft
**Primary Layer:** Server (`apps/server/src/autoplay/`)
**Dependencies:** WP-090 (Socket.IO transport), WP-118 (HTTP API Surface Catalog, D-11804) — both Done
**Paired with:** WP-164 (Autoplay Playback Controls — Client). WP-164 hard-depends on
this WP's six endpoints landing on `main` first.
**EC:** EC-180
**Baseline:** `origin/main` at `7b0f944` (drafted 2026-05-19); verify HEAD at execution.

---

## Goal

After this packet, the server side of media-player-style playback for the
"Watch Bot Play" feature exists. A spectator watching an autoplay match can
pause the bot loop, resume it, single-step forward, step backward through
already-played moves, restart to the first captured state, and fast-forward
to the live edge. Six new REST endpoints under `/api/match/autoplay/:matchId/*`
drive a per-match, in-process, cursor-based snapshot history buffer. Rewinds
are **visual only** — no `boardgame.io` state is ever mutated, and the playback
buffer is never persisted. The client UI that consumes these endpoints is
WP-164 and is out of scope here.

---

## Assumes

- WP-090 Socket.IO transport is live; `apps/server/src/autoplay/autoplay.mjs`
  already broadcasts state to spectators via `transport.pubSub` (verified at
  `autoplay.mjs:178`). Source: WORK_INDEX WP-090 (Done).
- The autoplay bot loop exists at `apps/server/src/autoplay/autoplay.mjs` with
  `registerAutoplayRoutes(router, context)` and `runBotMatch(...)`, and imports
  `buildUIState` + `filterUIStateForAudience` from `@legendary-arena/game-engine`
  (verified at `autoplay.mjs:16-23`). Source: current `main`.
- `koa-body` is loaded via `createRequire` and applied per-route
  (`autoplay.mjs:30,62`). New bodyless POSTs do **not** use `koaBody()`.
- WP-118 / D-11804 governs the API catalog: whole-row replace, closed `Status`
  and `Auth` sets. Source: `.claude/rules/work-packets.md §API Catalog Update
  Obligation`.
- No other autoplay WP is in progress (one-packet-per-session rule).

If any of the above is false, this packet is **BLOCKED**.

---

## Context

The "Watch Bot Play" feature (`autoplay.mjs`) currently runs bots end-to-end at
a fixed `delayMs` cadence with no spectator controls — you watch from start to
finish or not at all. This WP adds the server half of a media-player control
surface so a spectator can pause, single-step, rewind, and fast-forward.

The defining constraint is that **rewind must not touch authoritative game
state**. The engine owns truth (`ARCHITECTURE.md §Architectural Principles #2`);
a spectator scrubbing backward is a presentation concern, not a state
transition. So the controller keeps an in-process ring of derived snapshots and
serves historical `UIState` projections over REST. The live Socket.IO broadcast
always wins; the REST rewind response is a one-shot override the client paints
over its current view.

This is split from the client work (WP-164) because it crosses a layer boundary:
the server owns the controller, endpoints, and bot-loop integration; the client
owns the control bar, the playback service, and the Pinia injection. A single WP
spanning both layers would exceed the file-count and layer-crossing thresholds
in `01.0a §Step 3`. The two WPs share an `## Assumes` chain: WP-164 cannot
execute until WP-163's endpoints exist on `main`.

**Authority chain (read order at execution):**
- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` + `§Persistence Boundaries`
- `.claude/rules/architecture.md` (Server Layer)
- `.claude/rules/work-packets.md §API Catalog Update Obligation`
- `.claude/skills/legendary-server/SKILL.md`
- `.claude/skills/legendary-persistence/SKILL.md`
- This WP (WP-163)
- EC-180
- `docs/ai/REFERENCE/00.6-code-style.md`
- `apps/server/src/autoplay/autoplay.mjs` (current bot loop)
- `docs/ai/REFERENCE/api-endpoints.md` (row format + closed sets)

---

## Scope (In)

### A. Playback controller (new pure helper)

`apps/server/src/autoplay/playbackController.mjs` — a factory
`createPlaybackController()` returning an object with:

- `pushState(snapshot)` — append a `PlaybackStateSnapshot` to history, cap at
  `maxHistory = 100` (drop oldest), and reset `cursor` to the live edge
  (`stateHistory.length - 1`). **This is the only site that writes `cursor`.**
- `waitIfPaused()` — returns a `Promise<void>` that resolves immediately when
  not paused, or when `resume()` / a single-step release fires. Single in-flight
  consumer only.
- `pause()` / `resume()` — toggle the paused flag; `resume()` releases any
  pending `waitIfPaused()` and restores live cadence.
- `stepForward()` → `StepForwardResult` — see Contract.
- `stepBack()` → `PlaybackStateSnapshot | null` — decrement cursor, return that
  snapshot; `null` when already at `cursor === 0`.
- `restart()` → `PlaybackStateSnapshot` — set cursor to `0`, return snapshot[0].
- `goToEnd()` → `void` — set cursor to the live edge, resume, and switch the
  loop's inter-move delay to `playbackDelayOverride`.
- Read accessors: `getCursor()`, `getMode()`, `getHistoryLength()`, `isPaused()`,
  `getActiveDelay()`.

No `boardgame.io` import. No `Math.random()`. No I/O.

### B. Bot-loop integration (modify `autoplay.mjs`)

- Module-level `autoplayControllers = new Map()` keyed by `matchId`.
- A controller is created in `runBotMatch` immediately after match init and an
  **initial `pushState`** is taken **before** the first `waitIfPaused()` gate, so
  history length is `>= 1` before any pause is possible.
- Every real-move boundary calls `controller.pushState(snapshot)` then
  `await controller.waitIfPaused()`.
- The loop's `delay(...)` calls read `controller.getActiveDelay()` (returns
  `delayMs` normally, `playbackDelayOverride` after `goToEnd()`).
- The controller is removed from the map on **every** exit path of `runBotMatch`
  (gameover, error, turn-limit, phase-bailout).

### C. Six REST endpoints (modify `autoplay.mjs`)

Registered in `registerAutoplayRoutes` **without** `koaBody()`:

- `POST /api/match/autoplay/:matchId/pause`
- `POST /api/match/autoplay/:matchId/resume`
- `POST /api/match/autoplay/:matchId/step-forward`
- `POST /api/match/autoplay/:matchId/step-back`
- `POST /api/match/autoplay/:matchId/restart`
- `POST /api/match/autoplay/:matchId/go-to-end`

Plus two private helpers: `getController(koaContext)` (resolves the controller
from `:matchId`; `404` envelope if absent) and `buildResponse(controller,
options)` (assembles the standardized envelope; always reads `mode` from
`controller.getMode()`).

### D. Tests (`playbackController.test.mjs`, new)

`node:test`, `.test.mjs`. Covers: state-machine transitions (pause/resume/step
in every order), race-edge (concurrent state-mutating calls → last-write-wins,
single `waitIfPaused` consumer), cursor-boundary (`stepBack` at `0` → `null`;
`stepForward` at live edge → `live-move`), fast-forward (`goToEnd` switches
active delay), lifecycle-leak (N=10 sequential matches leave the map empty), and
the `mode`-passthrough drift test (every endpoint envelope carries `mode`).

### E. Governance

- `docs/ai/REFERENCE/api-endpoints.md` — six new whole rows (D-11804).
- `docs/ai/DECISIONS.md` — D-16301 through D-16309.
- `docs/ai/STATUS.md` — note autoplay now supports playback controls.
- `docs/ai/work-packets/WORK_INDEX.md` — WP-163 row.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-180 row.

## Scope (Out)

- **Client UI** — `apps/arena-client/**` is WP-164's surface; untouched here.
- **Any persistence path** for the playback buffer — no DB, Redis, file, or log
  write (D-16306).
- **`packages/game-engine/**` runtime code** — type-only imports of `UIState` are
  fine; no engine logic changes.
- **`replayGame()` / replay infrastructure** — seed-accurate rewind is out of
  scope per `MOVE_LOG_FORMAT.md` Gap #4.
- **Refactoring `runBotMatch`** beyond the three insertion points (controller
  create + initial push, per-move push + gate, exit cleanup) and the
  `getActiveDelay()` delay substitution.
- **`transport.pubSub` calls for rewind** — rewind is REST-only (D-16303).
- **A mutex or queue** on the controller — single-consumer / last-write-wins is
  the locked model (D-16309).
- **The existing `POST /api/match/autoplay` creation endpoint** — its body and
  behavior are unchanged.

---

## Contract

### Response envelope (`AutoplayControlResponse`) — D-16304

Every endpoint, on every status (200 and error), returns this shape:

```ts
interface AutoplayControlResponse {
  ok: boolean;
  paused: boolean;
  historyLength: number;
  cursor: number;
  mode: 'live' | 'paused';   // ALWAYS present; read from controller.getMode()
  uiState?: UIState;         // only on rewind responses (see matrix)
  error?: string;            // full-sentence message on non-200
}
```

`mode` is computed **only** by `controller.getMode()` (`'paused'` when the loop
is gated, `'live'` otherwise). Endpoint handlers never recompute the predicate
inline.

### Endpoint Behavior Matrix — D-16304

| Endpoint | `uiState` in 200 response | `mode` after success |
|---|---|---|
| `pause` | no | `paused` |
| `resume` | no | `live` |
| `step-forward` (cursor branch) | yes | `paused` |
| `step-forward` (live-move branch) | no | `paused` |
| `step-back` | yes | `paused` |
| `restart` | yes | `paused` |
| `go-to-end` | no | `live` |

This matrix is a closed set. Adding, removing, or re-labelling a row requires a
new DECISIONS entry.

### `StepForwardResult` discriminated union — D-16302

```ts
type StepForwardResult =
  | { type: 'cursor'; snapshot: PlaybackStateSnapshot }  // cursor < live edge
  | { type: 'live-move' };                                // cursor at live edge
```

- `'cursor'`: cursor was behind the live edge; it advances by one and the
  snapshot at the new cursor is returned. No real move occurs.
- `'live-move'`: cursor was at the live edge; the controller releases the pending
  `waitIfPaused()` for **exactly one** real move. The `'live-move'` branch does
  **not** itself call `submitMove` — it signals the bot loop to advance once.

### `PlaybackStateSnapshot` — D-16305

```ts
interface PlaybackStateSnapshot {
  G: unknown;                 // engine G at capture (runtime-only, never persisted)
  ctx: { phase: string; turn: number; currentPlayer: string };  // strict 3 keys
}
```

Snapshots are treated as **immutable** after `pushState()` — no deep mutation.
The synthetic ctx passed to `buildUIState` on rewind uses exactly these three
keys.

### Rewind `uiState` audience filter — D-16303

Rewind responses (`step-back`, `restart`, `step-forward` cursor branch) compute
`uiState` as:

```js
filterUIStateForAudience(buildUIState(snapshot.G, syntheticCtx), audience)
```

Skipping the filter is a hidden-information leak. The `audience` value MUST match
the existing spectator broadcast pattern in `autoplay.mjs` — confirmed at
execution start (see RS-1).

### HTTP status rules

- `200` — success (always returns the envelope with `ok: true`).
- `404` — no controller registered for `:matchId` (`ok: false`).
- `409` — invalid state transition: `step-back`/`step-forward`/`restart`/
  `go-to-end` when no match is running, or `step-back` at `cursor === 0`
  (`ok: false`).
- `500` — unexpected fault (`ok: false`).

Every non-200 response still carries the full envelope (including `mode`).

### API Catalog rows (D-11804)

Six new whole rows in `docs/ai/REFERENCE/api-endpoints.md`, each with
`Status: Wired`, `Auth: guest`. Closed sets per D-9905 / D-11804.

---

## Locked Contract Values

| Item | Value | Decision |
|---|---|---|
| History cap | `maxHistory = 100` | D-16302 |
| Go-to-end delay | `playbackDelayOverride = 10` (ms) | D-16307 |
| Response envelope keys | `{ ok, paused, historyLength, cursor, mode, uiState?, error? }` | D-16304 |
| `mode` closed set | `'live' \| 'paused'` | D-16304 |
| Snapshot ctx keys | `{ phase, turn, currentPlayer }` (exactly 3) | D-16305 |
| Cursor write site | `pushState()` only | D-16301 |
| Concurrency model | single-consumer / last-write-wins (no mutex) | D-16309 |
| API catalog row | `Status: Wired`, `Auth: guest` | D-11804 |

---

## Non-Negotiable Constraints

**Server-wide (always apply):**
- ESM only, Node v22+
- Human-style code (00.6); full English words
- Test files `.test.mjs` for server, `node:test` runner
- Full-sentence error messages
- pnpm workspace

**Packet-specific:**
- `playbackController.mjs` MUST NOT import `boardgame.io` (pure helper).
- No `Math.random()`, clocks, timers-as-state, or wall-clock reads in the
  controller (delays are passed in; `setTimeout` for `delay()` stays in
  `autoplay.mjs`).
- The playback buffer is **Class 1 Runtime State** (D-16306) — never written to
  any DB, Redis, file, or log.
- Rewind is REST-only — no `transport.pubSub` for rewind (D-16303).
- `cursor` is written by `pushState()` and nowhere else (D-16301).
- New endpoints accept no body — no `koaBody()`.
- Controller removed from the map on every `runBotMatch` exit path (D-16308).
- Single in-flight `waitIfPaused()` consumer; no mutex/queue (D-16309).

---

## Acceptance Criteria

- [ ] `createPlaybackController()` exposes the methods in §A; no `boardgame.io`
      import.
- [ ] `runBotMatch` takes an initial `pushState` before the first
      `waitIfPaused()` (history length `>= 1` before any pause).
- [ ] Six endpoints registered, all bodyless (no `koaBody()`).
- [ ] Every endpoint returns the `AutoplayControlResponse` envelope with `mode`
      present on 200 and error responses.
- [ ] `step-forward` returns `uiState` only on the `cursor` branch; the
      `live-move` branch releases exactly one real move and does not call
      `submitMove` itself.
- [ ] `step-back` at `cursor === 0` returns `409` (or `null` snapshot per the
      controller contract) — never a negative cursor.
- [ ] `step-back` / `restart` / `step-forward (cursor)` apply
      `filterUIStateForAudience`.
- [ ] `goToEnd()` switches the active delay to `playbackDelayOverride`; `resume()`
      restores `delayMs`.
- [ ] Controller map is empty after a match ends (lifecycle-leak test, N=10).
- [ ] `cursor` is written only by `pushState()` (single-site grep).
- [ ] API catalog has six new whole rows, `Status: Wired`, `Auth: guest`.
- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` passes (one pre-existing
      `join-match.test.ts` failure may persist per WP-159 STATUS note; not this
      WP's regression).

---

## Verification Steps

```bash
# 1. Build
pnpm install && pnpm --filter @legendary-arena/server build

# 2. Controller + endpoint tests
pnpm --filter @legendary-arena/server test
#    → playbackController.test.mjs passes (state-machine, race-edge,
#      cursor-boundary, fast-forward, lifecycle-leak N=10, mode-drift)

# 3. Single cursor-write site
rg -n "\.cursor\s*=" apps/server/src/autoplay/playbackController.mjs
#    → exactly the pushState assignment(s); no endpoint or external write

# 4. No boardgame.io import in the controller
rg -n "boardgame\.io" apps/server/src/autoplay/playbackController.mjs
#    → zero matches

# 5. Exactly six new playback routes
rg -n "router\.post\('/api/match/autoplay/:matchId/" apps/server/src/autoplay/autoplay.mjs
#    → exactly 6 matches

# 6. No koaBody on the new endpoints
#    → manual: the six playback router.post calls have no koaBody() arg

# 7. No persistence path for the buffer
rg -n "INSERT|UPDATE|writeFile|redis|db\.set" apps/server/src/autoplay/playbackController.mjs
#    → zero matches

# 8. API catalog rows present
rg -n "/api/match/autoplay/:matchId/" docs/ai/REFERENCE/api-endpoints.md
#    → 6 rows, Status: Wired, Auth: guest
```

---

## Definition of Done

1. `pnpm --filter @legendary-arena/server build` exits 0.
2. `playbackController.mjs` + `playbackController.test.mjs` created; tests pass.
3. `autoplay.mjs` modified: controller map, initial push, per-move push + gate,
   `getActiveDelay()` delay substitution, six bodyless endpoints, `getController`
   + `buildResponse` helpers, cleanup on every exit path.
4. Every endpoint returns the standardized envelope with `mode` on all paths.
5. Rewind responses apply `filterUIStateForAudience`.
6. `cursor` single-write-site grep passes; no `boardgame.io` import in controller.
7. Lifecycle-leak test (N=10) green; controller map empty after match end.
8. `docs/ai/REFERENCE/api-endpoints.md` — six new whole rows (D-11804),
   `Status: Wired`, `Auth: guest`.
9. `docs/ai/DECISIONS.md` D-16301..D-16309 flipped from Drafted to Active.
10. `docs/ai/STATUS.md` updated.
11. `docs/ai/work-packets/WORK_INDEX.md` WP-163 checked off with date.
12. `docs/ai/execution-checklists/EC_INDEX.md` EC-180 marked Done.

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-16301 | `pushState()` is the sole writer of `cursor`; every real-move boundary calls it, which resets cursor to the live edge. The live Socket.IO broadcast always wins over a REST rewind response. | One reconciliation site prevents cursor/history drift. Rewind is a transient client overlay, not a competing source of truth. |
| D-16302 | History is **cursor-based** (not pop-based), capped at `maxHistory = 100`. `stepForward()` returns a `StepForwardResult` discriminated union. An initial `pushState` precedes the first pause gate. | Cursor-based history lets the viewer scrub both directions without destroying buffered states; the union cleanly separates "advance cursor over history" from "let the bot make one real move." |
| D-16303 | Rewind delivers `uiState` via the REST response only — never `transport.pubSub`. Rewind `uiState` MUST pass through `filterUIStateForAudience`. | A second broadcast path would desync spectators and risk hidden-info leaks; REST keeps rewind a per-requester overlay. |
| D-16304 | Standardized `AutoplayControlResponse` envelope with a `mode` field present on every response (200 and error), computed only by `controller.getMode()`. The Endpoint Behavior Matrix is a closed set. | The client should not recompute a live/paused predicate; one authoritative field avoids client/server drift. |
| D-16305 | `PlaybackStateSnapshot` carries `G` plus a strict 3-key `ctx` (`phase`, `turn`, `currentPlayer`); snapshots are immutable after capture. | Minimal ctx is all `buildUIState` needs for rewind; immutability prevents accidental mutation of buffered history. |
| D-16306 | The playback buffer is **Class 1 Runtime State** — never persisted to any DB, Redis, file, or log. | `G` and derived runtime state are runtime-only (`ARCHITECTURE.md §Persistence Boundaries`); a playback buffer is not a save-game. |
| D-16307 | `go-to-end` resumes the loop and substitutes `playbackDelayOverride = 10` ms for `delayMs` in the bot loop's inter-move delays; `resume()` restores `delayMs`. | A viewer who fast-forwards to catch up wants the action to move quickly, not snap back to slow cadence. |
| D-16308 | The controller's lifecycle is bound to `runBotMatch`: created at match init, removed from the map on every exit path. | Without explicit teardown the controller map leaks one entry per match indefinitely. |
| D-16309 | Single-consumer / last-write-wins concurrency: one in-flight `waitIfPaused()` Promise, no mutex, no queue. Concurrent state-mutating calls take last-write-wins. | The bot loop is the only `waitIfPaused()` consumer; HTTP control calls are rare and human-paced. A mutex is premature optimization for a single-writer loop. |

---

## Anti-Patterns to Avoid

- Do NOT write `cursor` anywhere except `pushState()`.
- Do NOT persist the playback buffer to any store (DB/Redis/file/log).
- Do NOT add `transport.pubSub` calls for rewind — REST response only.
- Do NOT call `submitMove` from the `step-forward` `'live-move'` branch; signal
  the gate instead.
- Do NOT recompute the live/paused predicate inline in handlers — read
  `controller.getMode()`.
- Do NOT import `boardgame.io` into `playbackController.mjs`.
- Do NOT add a mutex/queue to the controller (D-16309 rejects it).
- Do NOT apply `koaBody()` to the bodyless playback endpoints.
- Do NOT refactor `runBotMatch` beyond the four named touch points.

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Spectators desync after a rewind | Rewind emitted via `transport.pubSub` instead of REST (D-16303 violation) |
| Hidden cards visible after step-back | `filterUIStateForAudience` skipped on the rewind response |
| Controller map grows unbounded across matches | Cleanup missing on one `runBotMatch` exit path (D-16308) |
| `cursor` goes negative or past live edge | A write outside `pushState()`; or `stepBack` not guarding `cursor === 0` |
| `mode` missing on an error response | Handler builds the error body without `buildResponse()` / `getMode()` |
| Pause never releases | More than one `waitIfPaused()` consumer, or `resume()` not resolving the pending Promise |

---

## Pre-Flight Verdict

**READY TO EXECUTE.** Dependencies (WP-090, WP-118) verified Done. No blocking
deps. Repo green at baseline `7b0f944`. Two RS items deferred to execution start:

- **RS-1:** the exact `audience` value for `filterUIStateForAudience` on rewind —
  executor MUST match the existing spectator broadcast pattern in `autoplay.mjs`.
- **RS-2:** confirm the `:matchId` route-param accessor (`koaContext.params`)
  against the installed `@koa/router` version before writing handlers.

Full record: `docs/ai/invocations/preflight-wp163-wp164-autoplay-playback.md`.

## Copilot Check Verdict

**PASS.** Reviewed against the `01.7` 30-mode lens. The high-risk modes for this
surface — `G`/snapshot persistence drift (#2, #8), hidden-info leak via UIState
(#9), dual-path desync (#10), controller-map memory leak (#18), cursor drift
(#19) — are each mitigated by an explicit decision (D-16306, D-16303, D-16303,
D-16308, D-16301 respectively) and a corresponding test. No HOLD, no SUSPEND, no
unresolved RISK. Full record:
`docs/ai/invocations/copilot-wp163-wp164-autoplay-playback.md`.

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | Single WP per session | PASS |
| 2 | Dependency discipline | PASS — WP-090, WP-118 Done |
| 3 | Review gate | N/A — draft, not execution |
| 4 | Layer boundary | PASS — Server layer only; type-only engine import |
| 5 | File count | PASS — 2 new + 1 modified source + 5 governance; single-layer |
| 6 | Contract stability | PASS — additive endpoints; no existing contract modified |
| 7 | Auth posture | PASS — new endpoints `Auth: guest` (closed set, D-9905) |
| 8 | Determinism | PASS — no `Math.random()`; controller takes delays as input |
| 9 | Persistence boundary | PASS — buffer is Class 1 Runtime State; no store (D-16306) |
| 10 | Test coverage | PASS — controller fully testable via `node:test` `.test.mjs` |
| 11 | Error handling | PASS — full-sentence messages; closed HTTP status rules |
| 12 | Code style (00.6) | PASS — ESM, full words, no abbreviations, `for...of` |
| 13 | Module system | PASS — ESM only |
| 14 | Naming | PASS — descriptive names; `playbackDelayOverride` not `delayOverride` |
| 15 | Comments | PASS — `// why:` sites enumerated in EC-180 |
| 16 | Drift detection | N/A — no canonical arrays touched |
| 17 | Vision alignment | PASS — spectator presentation; determinism preserved |
| 18 | Pre-planning | N/A |
| 19 | Replay safety | PASS — explicitly out of scope; `replayGame()` untouched |
| 20 | Funding surface gate | N/A — no money-flow surface |
| 21 | API catalog (D-11804) | PASS — six new whole rows committed with the code |
