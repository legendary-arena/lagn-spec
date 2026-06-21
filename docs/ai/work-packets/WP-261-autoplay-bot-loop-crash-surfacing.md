# WP-261 — Autoplay Bot-Loop Crash Surfacing + Defensive Stage Progress (Server)

**Layer:** Server (`apps/server/src/autoplay/**`) — wiring only
**EC:** EC-292
**Baseline:** `origin/main` @ `aaf52bff` (worktree drafting baseline)
**User-Visible Surface:** indirect — the abort becomes observable over the
existing autoplay HTTP envelope (`GET .../status` + the six control routes).
The client banner that *renders* it is the paired follow-up **WP-262** (see
§Context); WP-261 ships the server contract WP-262 consumes.

---

## 1. Goal

When the server-side "Watch Bot Play" bot loop dies or stalls, the autoplay
match must stop **observably** instead of silently freezing on the last
broadcast frame. Today an unhandled fault in the bot loop is `console.error`'d
and the playback controller is **deleted immediately**, so every connected
spectator sits on a frozen board with zero signal — and a parked player-choice
in certain stages can spin the loop to its 400-turn cap (a ~10-minute "freeze").
WP-261 makes the loop fail loud and bounded: (a) any abnormal exit marks the
controller **aborted** and keeps it alive for the existing 5-minute review
window, surfacing `aborted` + `abortReason` on the playback envelope; (b) each
stage transition is verified to make progress, aborting instead of spinning;
(c) **every** stage drives its move selection through the engine's
`getLegalMoves`, so a parked `resolveKoHeroChoice` / `resolveOptionalKoReward`
choice resolves in any stage rather than stalling the loop.

---

## 2. Assumes

- **WP-163 / EC-180 (Autoplay Playback Server) — Done.** Establishes
  `playbackController.mjs` (pure helper, no `boardgame.io`), the
  `autoplayControllers` map, `withRegisteredController`, `recordAndPace`, and
  the `buildResponse` envelope. Source: WORK_INDEX WP-163; EC-180.
- **WP-165 / EC-182 (Autoplay Status Endpoint) — Done.** `GET
  /api/match/autoplay/:matchId/status` returns the envelope (200) or a neutral
  404; the WP-164 client probes it to distinguish an autoplay match from a
  normal live match. Source: WORK_INDEX WP-165.
- **WP-200 / EC-200 (Autoplay Controls v2) — Done.** Added `speedMode` +
  `gameOver` to the envelope and the game-over 5-minute review window
  (`markGameOver` + deferred `delete`). WP-261 reuses that review-window
  mechanism for the abort path. Source: EC-200.
- **getLegalMoves pending-choice short-circuits — present on `main`.**
  `packages/game-engine/src/simulation/ai.legalMoves.ts` returns EXACTLY
  `[resolveOptionalKoReward]` (D-24019) or `[resolveKoHeroChoice]` (D-24009)
  when the corresponding choice is parked. WP-261 consumes this contract;
  it does **not** modify the engine.
- **D-16308 (controller removed on every `runBotMatch` exit path).** The
  normal exit already *defers* removal 5 minutes (review window); the error
  exit deletes immediately. WP-261 brings the error exit to parity (deferred +
  flagged), preserving D-16308's eventual-removal guarantee. Source: EC-180
  Guardrail; DECISIONS D-16308.
- **D-11804 (API catalog update obligation).** The autoplay status + control
  rows are cataloged in `api-endpoints.md` (`Status: Wired`, `Auth: guest`).
  Adding envelope fields modifies their response schema → whole-row update in
  the same commit. Source: `.claude/rules/work-packets.md §API Catalog`.

---

## 3. Context

**Why now.** A recurring field freeze on `play.legendary-arena.com` "Watch Bot
Play" was diagnosed from a client diagnostics capture (match `UDK-shUse1C`,
build `d6387ec`): healthy, internally-consistent engine state frozen at
`turn 3, currentStage: "start"` immediately after the turn-3 reveal chain
completed, with an empty client console buffer (`entryCount: 0`). The reveal
pipeline and `advanceStage` are fully fail-closed in the engine (moves never
throw); the snapshot rules out the spin path (only one reveal this turn,
`villainDeckCount 41`). The freeze is therefore **server-side**: the bot loop
stopped — most likely an unhandled rejection in the post-reveal
`recordAndPace` / `db.fetch` / `submitMove` path (none of which is wrapped),
after which `runBotMatch`'s catch only logs and `withRegisteredController`
deletes the controller, leaving the client frozen with no error frame. (A
secondary cause — the known in-memory match-store deploy-wipe, where a mid-match
redeploy makes `db.fetch` return `null` and the loop exits via `if (!state)
break` — produces the same silent freeze; WP-261's abort surfacing covers it
too.) Server logs would name the exact exception but are not required: the
structural fixes harden all three causes (crash / store-wipe / choice-spin)
regardless.

**Split decision (one WP, single layer).** The full remedy crosses server →
client, so it is split on the layer boundary into a paired set:

- **WP-261 (this packet, server, priority):** the bot-loop hardening +
  abort-observable-via-envelope. Single layer (`apps/server/src/autoplay/**`).
  Lands the no-silent-freeze guarantee on its own.
- **WP-262 (client, fast-follow — reserved, not yet drafted):** arena-client
  stall-detection (it currently probes status only once at mount, so it would
  not *notice* an abort) + a "Bot match stopped" banner extending the existing
  `expired` / "Session expired" pattern, and disabling the playback controls
  when `aborted`. WP-262 `§Assumes WP-261` for the `aborted` / `abortReason`
  envelope fields; it is drafted in a follow-up session once this contract is
  concrete (UI WPs are deferred until the contract they consume exists).

**Layer-boundary note.** Every WP-261 change is wiring: reading
`state.G.currentStage` / `state._stateID` for routing and progress detection is
the loop's existing pattern (e.g., the playCard silent-rejection check at
`autoplay.mjs:621`); driving move selection through the engine's `getLegalMoves`
moves *more* decisions into the engine, not fewer. No game logic, no `G`
mutation, no rule interpretation is added to the server.

---

## 4. Scope

### Scope (In)

1. **`markAborted(reason)` on the playback controller** — a new terminal flag
   (`isAborted` + `abortReason`) that, like `markGameOver`, pauses the
   controller; plus `isAborted()` / `getAbortReason()` accessors. `aborted`
   and `gameOver` are **distinct** states (an abort is not a natural end).
2. **Abort-on-abnormal-exit in `withRegisteredController`** — the catch path
   marks the controller aborted with the fault message and defers removal by
   the same 5-minute review window as the normal (game-over) path, instead of
   deleting immediately. The normal-exit path marks game-over **only if not
   already aborted** (so a loop-detected stall is preserved).
3. **Envelope fields `aborted` (always) + `abortReason?` (when aborted)** on
   `buildResponse`. The 404 not-found envelope keeps `aborted: false` among its
   neutral defaults.
4. **Defensive per-stage progress assertions** in `runBotMatchLoop` — after a
   stage-advancing move (`revealVillainCard` / `advanceStage` / `endTurn` /
   `resolve*`), re-fetch and verify `_stateID` changed (or stage advanced); a
   move expected to progress that leaves `_stateID` unchanged aborts the loop
   (`markAborted`) instead of re-dispatching to `maxTurns`.
5. **Route ALL stages through `getLegalMoves` before dispatch** — every stage
   (`start`, `main`, `cleanup`, and any existing resolve/transition branch)
   first observes `getLegalMoves(G, ctx)`. If the legal moves are parked-choice
   short-circuits (`resolveKoHeroChoice` / `resolveOptionalKoReward`), the loop
   dispatches that resolve move regardless of stage. If no parked choice is
   present, a stage-specific fallback may be dispatched **only if that fallback
   move is present in the legal-move list**. The current main filter
   (`recruitHero|fightVillain|fightMastermind|advanceStage`) must preserve and
   handle `resolveKoHeroChoice` / `resolveOptionalKoReward` instead of dropping
   them — today it drops the resolve short-circuit, so a choice parked mid-main
   by a `fightVillain` spins too; this closes that path as well.
6. **A pure-helper module `botLoopProgress.mjs`** (no `boardgame.io`, no I/O)
   holding the testable decisions: find-the-pending-choice-move, has-progressed,
   and the full-sentence stall/abort message builder. Mirrors the EC-180 split
   that keeps `playbackController.mjs` `boardgame.io`-free.
7. **API catalog update** (`api-endpoints.md`) — whole-row replacement of the
   autoplay status + six control rows to add `aborted` / `abortReason` to the
   documented response schema (D-11804).

### Scope (Out)

- **No client change.** The banner, stall-detection poll, and control-disable
  are WP-262.
- **No engine change.** `getLegalMoves`, `advanceStage`, the reveal pipeline,
  and the choice-park guards (D-24008/D-24009/D-24019) are consumed as-is.
- **No change to the deploy-wipe root cause** (in-memory match store; the
  separate Future-WP-I / Next-Horizons item). WP-261 makes that freeze
  *observable*, it does not prevent the store wipe.
- **No new persistence.** The controller and its flags remain Class-1 runtime
  state (D-16306) — never written to DB / Redis / file / log.
- **No change to `maxTurns`, `delayMs`, history cap, or the rewind/audience
  contract.**

---

## 5. Files Expected to Change

| File | Disposition |
|---|---|
| `apps/server/src/autoplay/playbackController.mjs` | modified — `markAborted` + `isAborted`/`getAbortReason`; envelope contributors |
| `apps/server/src/autoplay/playbackController.test.ts` | modified — abort flag state-machine tests |
| `apps/server/src/autoplay/autoplay.mjs` | modified — `withRegisteredController` abort exit, `buildResponse` fields, loop restructure (drain choices + progress assert) |
| `apps/server/src/autoplay/botLoopProgress.mjs` | **new** — pure helpers (no `boardgame.io`, no I/O) |
| `apps/server/src/autoplay/botLoopProgress.test.ts` | **new** — helper unit tests |
| `apps/server/src/autoplay/autoplayStatus.test.ts` | modified — `aborted`/`abortReason` envelope assertions |
| `docs/ai/REFERENCE/api-endpoints.md` | modified — whole-row update, autoplay status + 6 control rows (D-11804) |
| `docs/ai/DECISIONS.md` | modified — land D-24037 + D-24038 (Drafted → Active at execution) |
| `docs/ai/STATUS.md` | modified — autoplay reliability note |
| `docs/ai/work-packets/WORK_INDEX.md` | modified — check off WP-261 |
| `docs/ai/execution-checklists/EC_INDEX.md` | modified — EC-292 → Done |
| `docs/05-ROADMAP-MINDMAP.md` | modified — flip the existing `WP-261` node `📝 → ✅` and regenerate the count table via `node scripts/roadmap-counts.mjs --write` (D-24002; the node was added drafted in #386 — execution flips it, preventing the known finished-WP orphan-drift where ECs omit the mindmap) |

Runtime-wiring note (`01.5`): no wiring file outside the allowlist — the
autoplay routes are already registered (WP-163); WP-261 only changes their
response shape and the loop body.

---

## 6. Contract

### Playback envelope (additive, D-24037)

Every success envelope from `buildResponse` gains:

- `aborted: boolean` — always present. `false` during normal play and on a
  natural game over; `true` after an abnormal stop.
- `abortReason?: string` — present **iff** `aborted === true`.

`abortReason` is a **public-safe full sentence**. Because the autoplay endpoints
remain guest-accessible (`Auth: guest`), the envelope MUST NOT expose raw
exception messages, stack text, serialized errors, database errors, request
URLs, secrets, internal IDs, or infrastructure paths. The catch path stores the
public-safe reason on the controller — never the raw `error.message`; raw fault
detail stays in the existing server `console.error` logging only.

Allowed public reason shapes (full sentences):

- `"The bot loop stopped after an unexpected server error."`
- `"The bot loop stopped: the match state was no longer available."`
- `"The bot loop stopped: the start stage did not advance."`
- `"The bot loop stopped: no legal move was available for the current stage."`

`gameOver` and `aborted` are distinct terminal states; a given controller is at
most one of {playing, gameOver, aborted}. An abort is not a natural game end.
The 404 not-found envelope retains its neutral defaults plus `aborted: false`
and no `abortReason`.

### Controller (D-24037)

`markAborted(reason)` sets `isAborted = true`, `abortReason = reason`,
`isPaused = true`; it does **not** set `gameOver`. `isAborted()` /
`getAbortReason()` expose the state. Terminal: once aborted, the controller is
not re-marked, and a later normal-exit path must not overwrite it with
`gameOver`.

### Bot-loop progress invariant (D-24038)

1. Each stage reads `getLegalMoves(G, ctx)` before selecting a move.
2. If `getLegalMoves` returns a parked-choice short-circuit move, the loop
   dispatches that resolve move before any stage-specific fallback.
3. A stage-specific fallback move may be dispatched only when that move is
   present in the current legal-move list.
4. For each dispatch expected to advance the loop, capture the pre-dispatch
   `_stateID`, re-fetch after dispatch, and classify the result:
   - state missing/null → abort with the vanished-match reason;
   - game over / natural terminal state → exit through the normal game-over path;
   - `_stateID` changed → progress accepted;
   - `_stateID` unchanged → abort with the stage-did-not-advance reason.
5. The loop must never repeatedly dispatch an unchanged-state move until
   `maxTurns`.

### Abnormal-exit handling

The `withRegisteredController` catch path marks the controller aborted (with a
public-safe reason) and schedules the same deferred cleanup used by the normal
review window; it must **not** immediately delete the controller. It may rethrow
only if the existing autoplay launcher/caller already catches that rejection and
prevents an unhandled promise rejection; otherwise it logs through the existing
error path and settles after scheduling cleanup, introducing no new unhandled
rejection.

---

## 7. Acceptance Criteria

- [ ] A controller that has `markAborted(reason)` called reports
  `isAborted() === true`, `getAbortReason() === reason`, `isPaused() === true`,
  `isGameOver() === false`.
- [ ] `buildResponse` on a fresh controller yields `aborted: false` and **no
  own** `abortReason` key (a test asserting `Object.hasOwn(response,
  "abortReason") === false` — not merely `abortReason === undefined`); on an
  aborted controller yields `aborted: true` + a public-safe full-sentence
  `abortReason`.
- [ ] Guest-visible `abortReason` values are public-safe full sentences and do
  **not** include raw `error.message`, stack text, serialized errors, database
  errors, request URLs, secrets, internal IDs, or infrastructure paths — proven
  by a test that throws an error with a recognizable secret-like token and
  asserts that token is absent from the envelope.
- [ ] The abnormal-exit path does not leave an unhandled promise rejection in
  the autoplay launcher test/harness; the aborted controller remains registered
  synchronously after the fault is handled.
- [ ] Stage-specific fallback moves are dispatched only when present in
  `getLegalMoves(G, ctx)`; a parked `resolveKoHeroChoice` /
  `resolveOptionalKoReward` is dispatched ahead of any fallback in every stage.
- [ ] A vanished (missing/null) post-dispatch state aborts with the
  match-state-unavailable reason (`aborted: true`) instead of becoming a neutral
  clean break.
- [ ] A natural game-over post-dispatch state exits through the normal
  game-over path (`gameOver: true`, `aborted: false`) and is never mislabeled
  `aborted`.
- [ ] `GET .../status` on an aborted-but-still-registered controller returns
  `200` with `aborted: true` + `abortReason` (not a 404).
- [ ] `docs/05-ROADMAP-MINDMAP.md` shows the `WP-261` node flipped `📝 → ✅` and
  `node scripts/roadmap-counts.mjs --check` exits 0 (no orphan, table current).
- [ ] `botLoopProgress.mjs` exports pure functions covered by unit tests:
  pending-choice detection returns the resolve move when `getLegalMoves` is
  parked and `null` otherwise; has-progressed is `false` on equal `_stateID`.
- [ ] `rg "boardgame\.io" botLoopProgress.mjs` → zero.
- [ ] `withRegisteredController` keeps an aborted controller in the map until
  the deferred (5-minute) cleanup — verified by a fake-timer / injected-clock
  test or an exit-path unit test that asserts the map still holds the
  controller synchronously after the body throws.
- [ ] Engine untouched: `git diff --name-only` shows no `packages/**` change.
- [ ] `api-endpoints.md` autoplay status + 6 control rows show `aborted` /
  `abortReason?` in the response schema; `Status` / `Auth` unchanged
  (whole-row replacement, D-11804).
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test`
  passes the new/extended suites (pre-existing `join-match.test.ts` failure may
  persist per WP-159 STATUS — not introduced here).

---

## 8. Verification Steps

1. `pnpm -r build` (builds the game-engine dep the server imports).
2. `pnpm --filter @legendary-arena/server test` — `playbackController.test.ts`,
   `botLoopProgress.test.ts`, `autoplayStatus.test.ts` green.
3. `rg "boardgame\.io" apps/server/src/autoplay/botLoopProgress.mjs` → no match.
4. `rg "markAborted" apps/server/src/autoplay/autoplay.mjs` → present in the
   `withRegisteredController` catch and the loop stall sites.
5. Inspect `api-endpoints.md`: the autoplay rows carry the new response fields;
   the `Status`/`Auth` columns are unchanged.
6. D-24026 live-verification is **N/A for WP-261 on its own** (no client
   surface changes; the observable change is an API field). It is exercised by
   WP-262 when the banner ships. Record this N/A explicitly at govern-close.
7. `node scripts/roadmap-counts.mjs --check` — exits 0 after flipping the
   `WP-261` mindmap node `📝 → ✅` and regenerating the count table.

---

## 9. Definition of Done

- [ ] All §7 acceptance criteria pass.
- [ ] EC-292 satisfied item-for-item.
- [ ] D-24037 + D-24038 landed Active in `DECISIONS.md`.
- [ ] `api-endpoints.md` updated (whole-row, D-11804); `00.3 §21` companion
  gate passes.
- [ ] WORK_INDEX WP-261 checked off; EC_INDEX EC-292 → Done; STATUS.md note.
- [ ] `docs/05-ROADMAP-MINDMAP.md` `WP-261` node flipped `📝 → ✅` and
  `node scripts/roadmap-counts.mjs --check` exits 0.
- [ ] Commit topology:
  - **`EC-292:` implementation/schema commit** — `apps/server/src/autoplay/**`
    changes **plus** the coupled `docs/ai/REFERENCE/api-endpoints.md` whole-row
    update (the response schema changes with the server envelope, so D-11804's
    same-commit obligation places the catalog row here, not in the close).
  - **`SPEC:` governance close** — `DECISIONS.md`, `STATUS.md`, `WORK_INDEX.md`,
    `EC_INDEX.md`, and `docs/05-ROADMAP-MINDMAP.md`.
- [ ] No `packages/**` (engine) diff.

---

## Gate Verdicts (`01.0a` Step 5 — recorded inline)

### Pre-Flight (`01.4`) — **READY TO EXECUTE**

- **WP class:** Runtime Wiring (changes the bot-loop wiring + envelope shape;
  no `G` mutation, no new moves, no engine import added).
- **Dependency & sequencing:** WP-163 ✅, WP-165 ✅, WP-200 ✅ — all Done on
  `main`; the envelope, controller map, `withRegisteredController`, and the
  5-minute review window all exist (verified by reading `autoplay.mjs` /
  `playbackController.mjs` at baseline `aaf52bff`).
- **Dependency contract verification:** `getLegalMoves` returns EXACTLY
  `[resolveKoHeroChoice]` / `[resolveOptionalKoReward]` when parked (read in
  `ai.legalMoves.ts`); the envelope keys (`buildResponse`) and the existing
  game-over `markGameOver` + deferred-delete are present as the WP assumes. No
  engine type/field is consumed beyond `state.ctx` / `state.G.currentStage` /
  `state._stateID`, all already read by the loop.
- **Vision sanity:** None — reliability / observability WP. No NG-1..7 surface
  (no identity / payment / cosmetics / scoring / leaderboard). Determinism:
  N/A — the bot loop is non-authoritative wiring, adds no RNG, and consumes the
  deterministic `getLegalMoves` it already used in the main stage; `G` is not
  mutated. No `## Vision Alignment` block required (no `00.3 §17.1` trigger).
- **Mutation boundary:** the server reads `G`/`ctx` for routing + progress only
  (the established `autoplay.mjs:621` `_stateID` pattern); it writes nothing to
  `G`/`ctx`. Controller flags are Class-1 runtime state (D-16306).
- **RS-1 (testability of deferred cleanup):** `withRegisteredController`'s
  abort path uses the existing `setTimeout(delete, 5min)`. Tests assert the
  **synchronous** post-throw state (controller still mapped + `isAborted()`);
  the timer-driven delete reuses the already-shipped game-over mechanism and is
  not separately fake-timer-tested. Note, not a blocker.
- **RS-2 (crash vs stall coverage):** the loop-level catch (already present) is
  the safety net for a *throwing* fault — WP-261 makes it *observable*
  (markAborted, no silent delete). The §4(4)+(5) progress assertion + all-stage
  `getLegalMoves` drain cover the *non-throwing* stall/spin. The two together
  cover crash + store-wipe + choice-spin; no per-`db.fetch` try/catch is needed.
- **Verdict:** READY — dependencies verified, scope closed, ambiguities
  resolved.

### Copilot Check (`01.7`) — **PASS (with required tightening applied)**

- **Separation of concerns:** all changes are server wiring; routing more
  decisions through the engine's `getLegalMoves` *reduces* server-side move
  logic. No game logic added.
- **Determinism / immutability / persistence:** no RNG, no `G`/`ctx` mutation,
  no persistence — controller flags are runtime-only (D-16306).
- **Error/failure semantics (the point of the WP):** abort reasons are
  full-sentence; the silent-freeze failure mode becomes an explicit, bounded,
  observable abort. **Strong.**
- **Testing:** the decision logic is extracted into a pure helper
  (`botLoopProgress.mjs`, no `boardgame.io`) so it is unit-testable without the
  Master harness; controller + envelope tested via existing precedents.
- **Findings:** RISK (minor) — `withRegisteredController`'s 5-minute timer
  delete is not fake-timer-tested (RS-1 above); documented, acceptable.
- **Required tightening applied (operator review, 2026-06-18):**
  - guest-visible abort reasons are **public-safe** full sentences; raw
    exception detail never enters the envelope (§6, §7);
  - `withRegisteredController` abnormal-exit behavior is explicit about deferred
    cleanup **without introducing an unhandled promise rejection** (§6, §7);
  - every stage-specific fallback dispatch is **gated by `getLegalMoves`**
    (§4(5), §6);
  - post-dispatch state classification separates **missing state / natural
    game-over / progressed / no-progress stall** (§6, §7);
  - WP and EC file lists now agree on `docs/05-ROADMAP-MINDMAP.md`, with the
    node flipped `📝 → ✅` + counts regenerated (§5, §7, §8, §9);
  - API-catalog row updates ride the `EC-292:` implementation/schema commit;
    governance close stays a separate `SPEC:` commit (§9, D-11804).
- **Verdict:** PASS.

## Lint Gate Self-Review (`00.3`) — 21/21 resolved

- **§1 Structure / §2 Constraints / §3 Assumes / §4 Context / §5 Files:** all
  present (§§1–9 of this WP).
- **§6 Naming:** `aborted` / `abortReason` / `markAborted` / `isAborted`
  consistent throughout; no canonical field renamed.
- **§7 Dependency discipline:** hard-deps Done; no forward dependency.
- **§8 Architectural boundaries:** server layer only; `botLoopProgress.mjs`
  imports no `boardgame.io`; no engine/registry import added; no `G` mutation.
- **§9 Windows / §10 Env vars / §11 Auth:** N/A — no path/shell specifics, no
  env vars, autoplay endpoints stay `guest` (unchanged).
- **§12 Test quality:** `node:test`, `.test.ts`, no `boardgame.io/testing`;
  pure-helper + controller + envelope coverage.
- **§13 Verification / §14 Acceptance / §15 DoD:** present and testable.
  **§15.1 (D-24026 user-visible):** N/A — WP-261 changes an API response field,
  not a client surface; the live banner ships in WP-262. N/A recorded in §8/§9.
- **§16 Code style:** pure helpers, explicit control flow, full-sentence abort
  messages, mandated `// why:` comments (EC §Required Comments), no magic
  imports.
- **§17 Vision alignment:** no §17.1 trigger — `None — reliability WP`.
- **§18 Prose-vs-grep:** verification greps confirm *presence* (`rg
  "markAborted"`, `rg "boardgame\.io" botLoopProgress.mjs → zero`); the
  `boardgame.io`-zero grep on `botLoopProgress.mjs` requires that file carry no
  `boardgame.io` token in code *or* comment (drift note carried to the EC).
- **§19 Bridge-vs-HEAD:** N/A.
- **§20 Funding surface:** N/A — no monetization surface.
- **§21 API catalog:** **TRIGGERS** — modifies the response schema of cataloged
  autoplay endpoints. Whole-row replacement (D-11804); `Status`/`Auth` closed
  sets unchanged; canonical field names. In §5 allowlist + §6 contract + EC. The
  `00.3 §21` companion gate is satisfied in-scope (not N/A).
