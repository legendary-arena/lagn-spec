# EC-296 — Autoplay "Bot Match Stopped" Banner + Stall-Detection Poll (Client) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-262-autoplay-stall-banner-client.md
**Layer:** App (`apps/arena-client/`) — client only

## Before Starting
- [ ] WP-261/EC-292 Done — the `aborted` / `abortReason?` envelope is on `main` (`api-endpoints.md` autoplay rows; baseline `32823aa6`)
- [ ] WP-164/EC-181 Done — `autoplayPlayback.ts` (`getStatus`, `resolveAutoplayGating`, `STATUS_RETRY_DELAY_MS`) + `AutoplayControls.vue` (the `expired` span pattern) + `PlayDesktop.vue` mount exist
- [ ] WP-165/EC-182 Done — `GET .../status` returns 200 (incl. aborted-but-registered) or neutral 404
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (baseline)
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (baseline)
- [ ] **Scaffold (lightweight lane):** prototype the poll + banner inside `AutoplayControls.vue`, run the arena-client suite, record the result. If `PlayDesktop.vue` must change (5th file / mount-wiring) → self-demote to two-session lane.

## Locked Values (do not re-derive)
- Client envelope mirror keys:
  - `aborted: boolean` — always present
  - `abortReason?: string` — present iff `aborted === true`
  - Structural mirror of the WP-261 server envelope; NO server-layer type import
- `STALL_POLL_INTERVAL_MS = 3000` unless scaffold reveals an existing client cadence convention that should be reused. The constant is defined once in `autoplayPlayback.ts` and consumed by `AutoplayControls.vue`.
- `interpretStallProbe(response)` accepts only settled probe results: `AutoplayControlResponse | null`.
  - `'aborted'` = envelope exists and `aborted === true`
  - `'stopped'` = `response === null` OR `response.gameOver === true`
  - `'continue'` = normal live envelope
- Thrown `getStatus` faults are handled by the poll caller, logged, and do NOT raise the banner.
- Banner element: `data-testid="autoplay-aborted"`; text includes the server `abortReason` sentence and extends the existing `autoplay-controls__expired` visual pattern.
- `mode` is read directly, never recomputed (D-16304). Live broadcast wins; no debounce / merge behavior is introduced (D-16301 / D-16309).

## Guardrails
- If `initialStatus.aborted === true`, seed `aborted` + `abortReason` and render the banner immediately — do NOT start the poll. (Likewise no poll start when `initialStatus.gameOver === true` / `isGameOver`.)
- The stall poll updates ONLY `aborted` / `abortReason` — it MUST NOT write `cursor` / `historyLength` / `mode` / `paused`, MUST NOT call the full control-response application path, and MUST NOT inject a `uiState` (a rewound spectator is never yanked to the live edge)
- No overlapping probes: if a previous `getStatus` is still in flight when the next interval fires, the next tick is SKIPPED
- The poll stops on abort, on game-over/stopped, on unmount, and on match-id disposal; the interval is cleared on unmount (no leaked timer)
- A probe that resolves AFTER unmount / match-id disposal MUST NOT mutate component state (no post-unmount Vue warnings)
- A `null`/404 probe = controller torn down / no longer observable → `'stopped'`, NOT an error; a thrown probe fault is logged at the caller and polling continues (transient ≠ abort)
- `aborted` disables ONLY the live-advancing controls (toggle, step-forward, go-to-end), on the same footing as `isGameOver`; step-back / restart stay enabled while `historyLength > 0` (review window)
- Client-only: NO `apps/server/**`, NO `packages/**`, NO `docs/ai/REFERENCE/api-endpoints.md` diff; the service imports no `boardgame.io` / server / setup-surface type (WP-164 / D-14401)
- The bar still mounts only when the mount probe confirms autoplay; a 404 PvP match stays hidden

## Required `// why:` Comments
- `autoplayPlayback.ts::interpretStallProbe` — why `null`/404 is classified `'stopped'` instead of `'aborted'`: the controller is no longer observable, so the client cannot safely invent an abort banner
- `AutoplayControls.vue` poll site — why the poll updates abort state ONLY: cursor/mode/history/paused remain owned by control responses and live broadcasts per D-16301/D-16309; a rewound spectator must not be pulled to the live edge by a background status probe
- `AutoplayControls.vue` poll site — why overlapping probes are skipped and why a resolved probe is ignored after unmount / match disposal
- `AutoplayControls.vue` disable site — why `aborted` disables live-advancing controls on the same footing as game-over while keeping rewind available during the review window

## Files to Produce
- `apps/arena-client/src/services/autoplayPlayback.ts` — **modified** — `aborted`/`abortReason?` on the interface; `STALL_POLL_INTERVAL_MS`; pure `interpretStallProbe`
- `apps/arena-client/src/services/autoplayPlayback.test.ts` — **modified** — field parse + `interpretStallProbe` classification (no timers)
- `apps/arena-client/src/components/AutoplayControls.vue` — **modified** — abort state, stall poll (abort-state-only + cleanup), `autoplay-aborted` banner, live-control disable
- `apps/arena-client/src/components/AutoplayControls.test.ts` — **modified** — banner + reason, control disable/rewind-kept, poll stop on abort/game-over/unmount, cursor untouched on poll
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified (execution amendment, 2026-06-18)** — `enableAutoUnmount(afterEach)` leak-guard. `PlayDesktop` mounts `AutoplayControls`, which now arms the stall-detection `setInterval` on mount; without auto-unmount the leaked interval keeps the `node:test` event loop alive and hangs the suite. Same-layer arena-client **test-hygiene** file within the lightweight lane's "+ ≤ 1 same-layer runtime-wiring file" allowance — it is NOT a `PlayDesktop.vue` production / mount-wiring change, the poll still lives entirely in the bar, so this is **not** a self-demotion trigger.
- `docs/ai/DECISIONS.md` — **modified** — D-24042 Drafted → Active
- `docs/ai/STATUS.md` — **modified** — client abort-banner note
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-262
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-296 Done
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — add `WP-262 ✅` node + `roadmap-counts.mjs --write`

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (`vue-tsc`)
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (new/extended suites green)
- [ ] `git diff --name-only` shows NO `apps/server/**`, NO `packages/**`, NO `api-endpoints.md`
- [ ] `rg "STALL_POLL_INTERVAL_MS" apps/arena-client/src` → defined once (service), consumed by the bar
- [ ] **Live-on-surface (D-24026):** "Bot match stopped" banner observed on `play.legendary-arena.com` against an in-process abort path that returns `200` + `aborted: true` from `GET .../status` during the review window. A deploy-wipe that returns 404 is the stopped-controller path (no banner) — record it as such, NOT a failure. If no `200`+`aborted` envelope is observable at close, mark `Done — live-verify pending` + record the stopped-controller observation.
- [ ] D-24042 Active; STATUS.md note; WORK_INDEX WP-262 checked; EC_INDEX EC-296 Done; `05-ROADMAP-MINDMAP.md` `WP-262 ✅` + `roadmap-counts.mjs --check` exits 0
- [ ] Commit prefix `EC-296:` (arena-client code); `SPEC:` governance close

## Common Failure Smells
- Poll tick jumps a rewound spectator to the live edge → the poll called `applyResponse` (full overwrite) instead of updating abort state only
- Banner never appears mid-match → the bar still has no poll; it only learns state at mount / on click
- Initial aborted controller shows no banner until the first interval → the component failed to seed abort state from `initialStatus`
- Duplicate / overlapping status calls under fake timers → the interval fires while an earlier async `getStatus` is still pending; add an in-flight guard
- Vue warning after unmount → an awaited probe resolves after component disposal and still mutates state
- `vue-tsc` red on `main` after merge → `typecheck` was skipped (build/test don't type-check the SFC; recurring WP-166/207/227 trap)
- Leaked timer / test hang → the interval is not cleared on unmount
- Deploy-wipe used as the only live proof but status returns 404 → that verifies the stopped-controller path, not the abort-banner path
