# WP-262 — Autoplay "Bot Match Stopped" Banner + Stall-Detection Poll (Client)

**Layer:** App (`apps/arena-client/**`) — client only
**EC:** EC-296
**Baseline:** `origin/main` @ `32823aa6` (WP-261 merged — the `aborted` / `abortReason` envelope is live)
**User-Visible Surface:** `play.legendary-arena.com` — the "Watch Bot Play" autoplay control bar. The spectator sees a "Bot match stopped" banner instead of a silent frozen board. **D-24026 live-verification APPLIES** (post-deploy).

---

## 1. Goal

When a server-side autoplay ("Watch Bot Play") bot loop stops abnormally, the
spectator must **see** it. WP-261 made the server emit `aborted` + `abortReason`
on the playback envelope, but the arena-client probes that envelope **only once
at mount** (`resolveAutoplayGating`), so a match that aborts mid-playback still
leaves the spectator on a frozen board with no signal. WP-262 closes the loop on
the client: a bounded **stall-detection poll** notices the abort, the control bar
renders a **"Bot match stopped"** banner carrying the server's public-safe
`abortReason`, and the live-advancing controls disable (treating an abort like a
game over for control purposes) while the rewind controls stay usable so the
spectator can scrub the captured history during the server's 5-minute review
window.

---

## 2. Assumes

- **WP-261 / EC-292 (Autoplay Bot-Loop Crash Surfacing) — Done** (`32823aa6`).
  The playback envelope (`GET .../status` + the six control routes) now carries
  `aborted: boolean` (always) + `abortReason?: string` (present iff
  `aborted === true`, a public-safe full sentence). The aborted controller stays
  registered for the 5-minute review window (returns `200`, not `404`). Source:
  WORK_INDEX WP-261; DECISIONS D-24037; `api-endpoints.md` autoplay rows.
- **WP-164 / EC-181 (Autoplay Playback Controls — Client) — Done.** Establishes
  the `autoplayPlayback.ts` service (`getStatus`, the six control functions, the
  pure `resolveAutoplayGating` mount-gating helper, `STATUS_RETRY_DELAY_MS`), the
  `AutoplayControls.vue` bar (owns playback state, has the `expired` /
  "Session expired" span pattern WP-262 extends), and the `PlayDesktop.vue` mount
  that drills `initialStatus` + `isGameOver`. Source: WORK_INDEX WP-164; EC-181.
- **WP-165 / EC-182 (Autoplay Status Endpoint) — Done.** `GET .../status`
  returns the envelope (200, including an aborted-but-registered controller) or
  a neutral 404; the poll reuses `getStatus` and does not change the endpoint
  contract.
- **D-16301 / D-16304 / D-16309 (client playback posture).** The live broadcast
  wins (last-write-wins, no merge); `mode` is read directly, never recomputed;
  no debounce, single-writer. WP-262's poll must not violate these — it updates
  only the abort state, never cursor / mode / historyLength.

---

## 3. Context

**Why now.** WP-261 is the server half of a deliberate layer-split (its `§Context`
names WP-262 as the reserved client fast-follow). The server contract is now
concrete and on `main`, so the UI WP that consumes it is unblocked — UI WPs are
deferred until the contract they consume exists, and it now does.

**The gap WP-262 closes.** `AutoplayControls.vue` learns playback state from
exactly two sources today: the `initialStatus` mount probe and each control
response (`applyResponse`). Neither fires on its own — so an abort that happens
while the spectator is just *watching* (the common case: a crash, a deploy-wipe
of the in-memory match store, a KO-hero stall the server now aborts) is never
observed. The bar keeps showing the last live frame. The stall-detection poll is
the out-of-band signal that the Socket.IO live transport cannot provide (a freeze
*is* the absence of broadcasts).

**Live repro nuance.** The banner requires the client to observe a `200` status
envelope with `aborted: true` during the server's review window — i.e. an
**in-process** abort: a bot-loop crash caught by `withRegisteredController`, a
loop-detected stall, or a `db.fetch` that returns null while the server **process
survives**. A full process restart (a Render redeploy) wipes the
`autoplayControllers` map too, so the post-restart status probe returns `404` →
classified `'stopped'`, NOT the abort banner. The deploy-wipe freeze is therefore
NOT a reliable banner repro; see §6 "Live verification posture" for the correct
one.

**Lane (recommendation, executor confirms at scaffold).** Single application
layer (`arena-client`) with four implementation/test files plus governance-close
docs. The implementation itself is provisionally **lightweight-lane-eligible**
(D-24028): the poll and banner are scoped to the already-mounted
`AutoplayControls.vue`, no server/engine/package surface is touched, and no
mount wiring is expected. The executor MUST self-demote to the two-session lane
if scaffold shows any of the following: `PlayDesktop.vue` must change, a fifth
arena-client implementation file is required, the poll cannot remain local to
the bar, or any lightweight eligibility criterion breaks. Governance index/status
updates do not by themselves invalidate the lightweight lane, but they remain
part of the close.

---

## 4. Scope

### Scope (In)

1. **Mirror the abort fields onto the client envelope type.** Add
   `aborted: boolean` + `abortReason?: string` to the local
   `AutoplayControlResponse` interface in `autoplayPlayback.ts` (structural
   mirror of the WP-261 server envelope; the client imports no server-layer
   type, per WP-164). Read directly, never recomputed.
1A. **Seed aborted state from `initialStatus`.** If the mount-time
   `initialStatus` already carries `aborted: true`, the bar renders the stopped
   banner immediately and the poll does not start. WP-262 is not only a
   mid-playback detection feature; it also respects an already-aborted envelope
   delivered by the existing mount probe (the common review-window case: a
   spectator loads the page while the controller is already aborted).
2. **Stall-detection poll.** While the bar is shown and the match is neither
   aborted nor game-over, re-probe `getStatus(matchId)` every
   `STALL_POLL_INTERVAL_MS`. The poll updates **only** abort state
   (`aborted` / `abortReason`). It MUST NOT touch `cursor`, `historyLength`,
   `mode`, or `paused`; it MUST NOT call the existing full-response application
   path; and it MUST NOT inject `uiState`. The poll stops on: abort detected,
   game-over/stopped detected, component unmount, or match-id disposal. The poll
   also MUST avoid overlapping probes: if a previous `getStatus` call is still
   in flight when the next interval fires, the next tick is skipped.
3. **"Bot match stopped" banner.** When `aborted`, render a banner carrying the
   server's `abortReason` sentence, extending the existing
   `autoplay-controls__expired` span pattern (new `data-testid="autoplay-aborted"`).
4. **Disable live controls on abort.** Treat `aborted` like `isGameOver` for the
   live-advancing controls (pause/resume toggle, step-forward, go-to-end): they
   disable. The rewind controls (step-back, restart) stay enabled while history
   exists, so the spectator can review the captured run during the server's
   5-minute review window.
5. **A pure poll-decision helper.** Add a small pure, testable helper
   (`interpretStallProbe`) that classifies an already-settled status probe
   result (`AutoplayControlResponse | null`): `'aborted'` for an envelope with
   `aborted === true`, `'stopped'` for `gameOver === true` or `null`/404, and
   `'continue'` for a normal live envelope. The helper does NOT catch thrown
   faults because thrown faults occur before a probe result exists; the poll
   caller catches/logs transient thrown faults and keeps polling. Mirrors the
   existing `resolveAutoplayGating` pure-helper split so the decision is
   unit-tested without timers.

### Scope (Out)

- **No server or engine change.** WP-261's envelope is consumed as-is; no new
  field, no change to the six control routes / status probe / `api-endpoints.md`.
- **No change to mount-time gating** (`resolveAutoplayGating`) beyond reusing
  `getStatus`; the bar still mounts only when the mount probe confirms autoplay.
- **No change to the rewind / audience / snapshot-injection contract**
  (D-16301 / D-16303 / D-16304 / D-16309) — the poll injects no `uiState` and
  reads no snapshot.
- **No `PlayDesktop.vue` change** (the poll lives in the bar); if that proves
  impossible at scaffold, self-demote the lane and re-scope, do not silently add
  the file.
- **No new persistence, no store change** beyond the existing `setSnapshot`
  path (which the poll does not touch).
- **No change to PvP / non-autoplay matches** — a 404 mount probe still hides
  the bar.

---

## 5. Files Expected to Change

| File | Disposition |
|---|---|
| `apps/arena-client/src/services/autoplayPlayback.ts` | modified — add `aborted` / `abortReason?` to `AutoplayControlResponse`; add `STALL_POLL_INTERVAL_MS`; add pure `interpretStallProbe` helper |
| `apps/arena-client/src/services/autoplayPlayback.test.ts` | modified — field-parse + `interpretStallProbe` classification tests |
| `apps/arena-client/src/components/AutoplayControls.vue` | modified — seed `aborted`/`abortReason` from `initialStatus`; stall poll (abort-state-only, single in-flight probe, unmount-safe); "Bot match stopped" banner; live-control disable on abort |
| `apps/arena-client/src/components/AutoplayControls.test.ts` | modified — initial-aborted renders + no poll start; banner carries the reason; live controls disabled + rewind kept; poll stops on abort/game-over/unmount; no overlapping probes; no state mutation after unmount; poll never moves the cursor |
| `docs/ai/DECISIONS.md` | modified — land D-24042 (Drafted → Active at execution) |
| `docs/ai/STATUS.md` | modified — client abort-banner note |
| `docs/ai/work-packets/WORK_INDEX.md` | modified — check off WP-262 |
| `docs/ai/execution-checklists/EC_INDEX.md` | modified — EC-296 → Done |
| `docs/05-ROADMAP-MINDMAP.md` | modified — add the `WP-262 ✅` node + `roadmap-counts.mjs --write` |

Runtime-wiring note (`01.5`): none expected — the poll lives inside the
already-mounted `AutoplayControls.vue`. If the scaffold shows the page mount
must change, that is the self-demotion trigger (§3 lane note).

---

## 6. Contract

### Client envelope mirror (consumes D-24037)

The local `AutoplayControlResponse` gains `aborted: boolean` (always present) +
`abortReason?: string` (present iff `aborted === true`). Both are read directly
from the parsed envelope; neither is recomputed on the client.

### Stall-detection poll (D-24042)

- Interval: `STALL_POLL_INTERVAL_MS` — locked in `autoplayPlayback.ts`, consumed
  by `AutoplayControls.vue`.
- Initial state:
  - If `initialStatus.aborted === true`, seed `aborted` + `abortReason`, render
    the banner immediately, and do not start the poll.
  - If `initialStatus.gameOver === true` or `isGameOver === true`, do not start
    the poll.
- Runtime:
  - Runs only while the bar is mounted, the active `matchId` is current, the
    match is not aborted, and the match is not game-over.
  - Each tick calls `getStatus(matchId)` unless a previous probe is still in
    flight. Overlapping probes are forbidden.
  - Each settled probe is classified via `interpretStallProbe(response)`:
    - `'aborted'` → set `aborted` + `abortReason`, stop polling.
    - `'stopped'` → stop polling. This covers game-over and `null`/404
      controller teardown / no-longer-observable. No abort banner is shown
      unless the server returns `aborted: true`.
    - `'continue'` → keep polling.
  - A thrown probe fault is logged and polling continues. A transient network
    or fetch failure is not treated as an abort.
- Mutation boundary:
  - The poll updates **only** `aborted` / `abortReason`.
  - The poll MUST NOT call the full control-response application path.
  - The poll MUST NOT write `cursor`, `historyLength`, `mode`, or `paused`.
  - The poll MUST NOT inject a `uiState` snapshot (D-16301 / D-16309 preserved;
    a rewound spectator stays put).
- Cleanup:
  - The interval is cleared on unmount.
  - A probe that resolves after unmount or after match-id disposal MUST NOT
    mutate component state.

### Banner + controls (D-24042)

- When `aborted`, the bar renders a `data-testid="autoplay-aborted"` element
  whose text includes the server's `abortReason` sentence, extending the
  existing `expired` span pattern.
- `aborted` disables the live-advancing controls (toggle, step-forward,
  go-to-end) on the same footing as `isGameOver`; step-back / restart stay
  enabled while `historyLength > 0`.

### Live verification posture (D-24026)

D-24026 applies because the visible behavior is on `play.legendary-arena.com`.
The banner is expected only when the client can observe a status envelope with
`aborted: true` during the server's review window. A `null`/404 status response
means the autoplay controller is no longer observable and is classified as
`'stopped'`, not `'aborted'`; that path stops the poll but does not render the
stopped banner.

**Preferred live repro.** Verify against any server-side abort path that
preserves the controller and returns `200` from `GET .../status` with
`aborted: true` during the review window (the in-process crash / stall path). A
deploy-wipe may be used as a live repro ONLY if scaffold or prior WP-261 evidence
confirms the deployed environment preserves enough controller state for the
status route to return the aborted envelope rather than a neutral 404. If the
deploy-wipe produces 404, record that as a stopped-controller case, NOT a banner
failure.

---

## 7. Acceptance Criteria

- [ ] `AutoplayControlResponse` carries `aborted: boolean` + `abortReason?: string`;
  a parsed envelope with `aborted: true` exposes both.
- [ ] `interpretStallProbe` returns `'aborted'` for an `aborted === true`
  envelope, `'stopped'` for a `gameOver === true` envelope and for `null`
  (404 / torn-down), and `'continue'` for a normal live envelope — covered by
  unit tests with no timers.
- [ ] With a mocked probe returning an aborted envelope, the bar renders the
  `autoplay-aborted` banner containing the `abortReason` text, and the toggle /
  step-forward / go-to-end controls become disabled while step-back / restart
  stay enabled (history present).
- [ ] A poll tick that observes an aborted envelope does **not** change the
  displayed `cursor` / position label (proves abort-state-only update — a
  rewound spectator is not yanked forward).
- [ ] The poll stops after an abort, after game-over, and on unmount (no further
  `getStatus` calls; injected fake-timer / spy asserts this and the cleared
  interval).
- [ ] If `initialStatus.aborted === true`, the bar renders
  `data-testid="autoplay-aborted"` immediately and does not start the stall poll.
- [ ] The poll never runs overlapping `getStatus` probes; if one probe is still
  pending, the next interval tick is skipped.
- [ ] A probe that resolves after unmount does not mutate component state and
  does not emit Vue test warnings.
- [ ] `interpretStallProbe` is only responsible for settled results
  (`AutoplayControlResponse | null`); thrown probe faults are handled by the poll
  caller and do not raise the banner.
- [ ] A normal (non-autoplay) match still hides the bar; a transient thrown
  probe fault does not raise the banner.
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
  (`vue-tsc`); `pnpm --filter @legendary-arena/arena-client test` passes the
  new/extended suites.
- [ ] No server/engine diff: `git diff --name-only` shows no `apps/server/**`,
  `packages/**`, or `docs/ai/REFERENCE/api-endpoints.md` change.
- [ ] **D-24026 live-verification:** on `play.legendary-arena.com`, an autoplay
  bot match with an observable aborted status envelope (`GET .../status` returns
  `200` with `aborted: true`) shows the "Bot match stopped" banner within a few
  poll intervals. If the attempted live repro returns `null`/404 instead, the
  expected client behavior is to stop polling without rendering the abort banner;
  record that as a stopped-controller observation and keep live abort-banner
  verification pending.

---

## 8. Verification Steps

1. `pnpm --filter @legendary-arena/arena-client typecheck` — `vue-tsc` clean.
2. `pnpm --filter @legendary-arena/arena-client test` — `autoplayPlayback.test.ts`
   + `AutoplayControls.test.ts` green (field parse, `interpretStallProbe`,
   banner, control-disable, poll-stop, cursor-untouched).
2A. Fake-timer tests cover: initial aborted state, abort detection, stopped/null
   detection, thrown fault continuation, no overlapping probes, no state mutation
   after unmount, and cursor/position label unchanged by poll ticks.
3. `git diff --name-only` shows no `apps/server/**`, no `packages/**`, no
   `api-endpoints.md`.
4. `rg "STALL_POLL_INTERVAL_MS" apps/arena-client/src` — constant is defined once
   in `autoplayPlayback.ts` and consumed by `AutoplayControls.vue`; no duplicate
   local interval literals exist.
5. **D-24026 (post-deploy):** verify against an in-process abort path that returns
   `200` + `aborted: true` from `GET .../status` during the review window;
   confirm the "Bot match stopped" banner renders on `play.legendary-arena.com`.
   A 404/`null` probe is the stopped-controller path (no banner) — record it as
   such, not as a failure. Record the live evidence at govern-close.
6. `node scripts/roadmap-counts.mjs --check` — exits 0 after adding the
   `WP-262 ✅` mindmap node + regenerating the count table.

---

## 9. Definition of Done

- [ ] All §7 acceptance criteria pass.
- [ ] EC-296 satisfied item-for-item.
- [ ] D-24042 landed Active in `DECISIONS.md`.
- [ ] `arena-client` `typecheck` + `test` green; no `apps/server/**` /
  `packages/**` / `api-endpoints.md` diff.
- [ ] WORK_INDEX WP-262 checked off; EC_INDEX EC-296 → Done; STATUS.md note;
  `05-ROADMAP-MINDMAP.md` `WP-262 ✅` node + `roadmap-counts.mjs --check` exits 0.
- [ ] Commit topology: `EC-296:` implementation (the 4 arena-client files);
  `SPEC:` governance close (indices + DECISIONS + STATUS + mindmap).
- [ ] **D-24026 live-verification recorded** — this WP has a real client surface;
  it is NOT `none — infrastructure`. The banner is confirmed on
  `play.legendary-arena.com` against an in-process abort path returning `200` +
  `aborted: true` (§6 Live verification posture). If no such envelope can be
  observed at close (e.g., only a 404/stopped path was reachable), mark the WP
  `Done — live-verify pending` and record the pending check + the
  stopped-controller observation explicitly.

---

## Gate Verdicts (`01.0a` Step 5 — recorded inline)

### Pre-Flight (`01.4`) — **READY TO EXECUTE**

- **WP class:** UI consumer (arena-client). Adds a poll + banner + control-disable
  that consume an already-shipped server envelope; no new endpoint, no engine
  touch, no `G`/`ctx`, no RNG.
- **Dependency & sequencing:** WP-261 ✅, WP-164 ✅, WP-165 ✅, WP-163 ✅ — all
  Done on `main` (`32823aa6`).
- **Dependency contract verification (read on `main`):**
  - The server envelope now carries `aborted` (always) + `abortReason?` (own key
    iff aborted) — shipped by WP-261, documented in `api-endpoints.md`.
  - **Load-bearing:** the banner fires ONLY when an **in-process** abort keeps
    the controller registered and `GET .../status` returns **200 with
    `aborted: true`** during the 5-minute review window (verified in WP-261's
    acceptance + `autoplayStatus.test.ts`). A full process restart (a Render
    redeploy) wipes the `autoplayControllers` map too → the probe returns 404 →
    classified `'stopped'`, NOT the banner. The deploy-wipe is therefore NOT a
    reliable banner repro; the live-verification (§6) targets the in-process
    crash/stall path. This nuance is the load-bearing correction from the
    operator review.
  - The client `AutoplayControlResponse` interface currently lacks `aborted` /
    `abortReason` (read in `autoplayPlayback.ts`); the bar learns state only at
    mount + on control responses (read in `AutoplayControls.vue`) — confirming
    the gap WP-262 closes.
  - `getStatus` already returns the parsed envelope on 200 / `null` on 404; the
    poll reuses `getStatus` and does not change the endpoint contract.
- **Vision sanity:** None — reliability/observability UX. No NG-1..7 surface (no
  identity / payment / cosmetics / scoring / leaderboard). Replay/rewind
  semantics are explicitly OUT of scope and unchanged (the poll injects no
  snapshot and reads no rewind frame), so no `00.3 §17.1` replay/RNG/determinism
  surface is *touched*. No `## Vision Alignment` block required.
- **Mutation boundary:** client-only; no server/engine diff; no persistence. The
  poll updates abort state only (never cursor/mode), so the WP-164 rewind UX and
  D-16301/D-16309 are preserved.
- **RS-1 (lane):** lightweight-lane-eligible provisionally (single layer, 4
  files, additive UX). The executor MUST scaffold-confirm and self-demote if
  `PlayDesktop.vue` must change. Note, not a blocker.
- **RS-2 (poll timer testability):** the poll uses `setInterval`; tests inject a
  fake timer / spy `getStatus` to assert poll-stop + cleared interval without
  real time. The `interpretStallProbe` decision is pure and timer-free. Note,
  not a blocker.
- **RS-3 (async-race correctness):** three race conditions are pinned as
  contract + acceptance tests (operator review): (a) `initialStatus.aborted`
  seeds the banner immediately with no poll start; (b) one in-flight probe at a
  time (skip a tick if the prior `getStatus` has not settled); (c) a probe that
  resolves after unmount / match-id disposal must not mutate state. Note, not a
  blocker.
- **Verdict:** READY — dependencies verified, the abort-observable-via-200
  contract confirmed (and the deploy-wipe→404 nuance corrected), scope locked.

### Copilot Check (`01.7`) — **PASS (with required contract tightening applied, operator review 2026-06-18)**

- **Required tightening applied (operator review):** (1) the "four files" lane
  language now means four arena-client implementation/test files plus the
  governance close (§3); (2) an **initial-aborted** case seeds the banner from
  `initialStatus` with no poll start (§4.1A, §6, §7); (3) **no overlapping
  probes** — a tick is skipped while a probe is in flight (§4.2, §6, §7);
  (4) `interpretStallProbe` classifies only settled results, NOT thrown faults —
  the caller handles thrown faults (§4.5, §6, EC Required Comments); (5) a probe
  resolving after unmount / match disposal must not mutate state (§6, §7); (6) the
  **deploy-wipe live repro was corrected** — the banner needs a `200`+`aborted`
  envelope, so the live-verification targets the in-process abort path, not a
  process restart that 404s (§3, §6, §7, §8).
- **Separation of concerns:** all changes are client presentation + a status
  poll; the abort *decision* stays server-side (WP-261). The client mirrors the
  envelope shape structurally (no server-layer type import, per WP-164).
- **Determinism / immutability / persistence:** no RNG, no `G`/`ctx`, no
  persistence; the poll is read-only (`getStatus`) and injects no snapshot.
- **Error/UX semantics (the point of the WP):** a silent frozen board becomes an
  explicit "Bot match stopped" banner carrying the server's public-safe reason;
  live controls disable while rewind stays usable for the review window.
  **Strong.**
- **Testing:** the poll decision is extracted to a pure `interpretStallProbe`
  (no timers) and the timer lifecycle is fake-timer-tested; the banner +
  control-disable assert against the rendered bar.
- **Findings:** RISK (minor) — the poll adds periodic `getStatus` traffic for the
  bar's lifetime; mitigated by stopping on abort/game-over/unmount and a
  multi-second interval. Documented, acceptable.
- **Findings:** RISK (minor) — abort-state-only poll discipline is load-bearing
  (a full `applyResponse` would yank a rewound spectator forward); pinned by a
  guardrail + an acceptance test (cursor-untouched-on-poll). Acceptable.
- **Verdict:** PASS.

## Lint Gate Self-Review (`00.3`) — 21/21 resolved

- **§1 Structure / §2 Constraints / §3 Assumes / §4 Context / §5 Files:** present
  via §§1–9 (numbered WP house style, matching the immediate WP-261 precedent;
  `Scope (Out)` = Out-of-Scope, ≥2 explicit exclusions; constraints distributed
  across §Scope (Out) + §6 Contract locked values + the EC-296 Guardrails /
  Locked Values). Drift note: `00.3 §1`'s literal `## Non-Negotiable Constraints`
  / `## Context (Read First)` / `## Out of Scope` headings predate the numbered
  format every WP since ~WP-255 uses; flagged to the operator, not self-fixed.
- **§6 Naming:** `aborted` / `abortReason` / `STALL_POLL_INTERVAL_MS` /
  `interpretStallProbe` / `autoplay-aborted` consistent; mirrors the WP-261
  field names exactly; no canonical name renamed.
- **§7 Dependency discipline:** no new npm dep; consumes existing service +
  Vue; hard-deps Done.
- **§8 Architectural boundaries:** App layer only; the service imports no
  `boardgame.io` / server / registry / setup-surface type (WP-164 / D-14401);
  no engine or `apps/server` import; no game logic in the component.
- **§9 Windows / §10 Env vars / §11 Auth:** N/A — no shell/path specifics, no
  env vars; autoplay endpoints stay `guest` (the client adds no auth).
- **§12 Test quality:** `node:test`, `.test.ts`; the service test imports no
  `boardgame.io`; the pure helper + timer lifecycle + banner/control coverage.
- **§13 Verification / §14 Acceptance / §15 DoD:** present, binary, testable.
  **§15.1 (D-24026 user-visible):** APPLIES — `User-Visible Surface =
  play.legendary-arena.com`; DoD carries a live-on-surface item (banner observed
  post-deploy, reproducible via the deploy-wipe).
- **§16 Code style:** pure helper, explicit control flow, full-sentence error
  copy, `// why:` at the poll / interpret / disable sites (EC Required Comments),
  no `import *`; functions ≤30 lines (EC failure-smell pins the interval cleanup).
- **§17 Vision alignment:** N/A — reliability/observability UX; touches no
  §17.1 surface (no scoring/replay-semantics/identity/sync/RNG/determinism/
  card-data/monetization). Replay/rewind behavior is out of scope and unchanged.
- **§18 Prose-vs-grep:** the one grep step (`rg "STALL_POLL_INTERVAL_MS"`) checks
  presence/count of a constant the WP defines; no forbidden-token prose conflict.
- **§19 Bridge-vs-HEAD:** N/A — not a repo-state-summarizing artifact.
- **§20 Funding surface:** N/A — no navigation/profile/registry funding
  affordance, no donate/support copy; this is the autoplay spectator bar.
- **§21 API catalog:** N/A — client-only; consumes the WP-261 envelope already
  cataloged; adds/modifies no `apps/server` HTTP endpoint and no
  `apps/server/src/**` library function. `api-endpoints.md` is explicitly OUT of
  scope (§4).
