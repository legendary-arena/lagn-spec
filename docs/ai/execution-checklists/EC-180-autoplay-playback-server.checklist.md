# EC-180 — Autoplay Playback Controls (Server) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-163-autoplay-playback-server.md
**Layer:** Server (`apps/server/src/autoplay/`)

## Before Starting
- [ ] `git rev-parse origin/main` matches local `main` HEAD; record it
- [ ] WP-090 (Socket.IO transport) and WP-118 (API catalog, D-11804) are Done
- [ ] `autoplay.mjs` imports `buildUIState` + `filterUIStateForAudience` (line 16-23)
- [ ] `koa-body` loaded via `createRequire`, applied per-route (line 30, 62)
- [ ] WP-163 §Pre-Flight Verdict = READY; §Copilot Check Verdict = PASS
- [ ] `pnpm -r build` exits 0 (the server has no build script; this builds the game-engine dep)
- [ ] `pnpm --filter @legendary-arena/server test` runs (pre-existing `join-match.test.ts` fail may persist per WP-159 STATUS; not blocking)
- [ ] RS-1: confirm rewind `audience` matches the existing spectator broadcast in `autoplay.mjs`
- [ ] RS-2: confirm `:matchId` accessor (`koaContext.params`) against installed `@koa/router`

## Locked Values (do not re-derive)
- `maxHistory = 100`
- `playbackDelayOverride = 10` (ms); `resume()` restores `delayMs`
- Envelope keys: `{ ok, paused, historyLength, cursor, mode, uiState?, error? }`
- `mode` ∈ `'live' | 'paused'`; read ONLY from `controller.getMode()`
- `StepForwardResult` = `{ type: 'cursor', snapshot } | { type: 'live-move' }`
- Snapshot ctx keys: `{ phase, turn, currentPlayer }` (exactly 3)
- Six routes: `POST /api/match/autoplay/:matchId/{pause,resume,step-forward,step-back,restart,go-to-end}`
- HTTP rules: `200` success / `404` no controller / `409` invalid transition (incl. step-back at `cursor === 0`) / `500` unexpected — all return the envelope
- API catalog row: `Status: Wired`, `Auth: guest`
- Endpoint Behavior Matrix (uiState? / mode): pause(no/paused), resume(no/live), step-forward cursor(yes/paused), step-forward live-move(no/paused), step-back(yes/paused), restart(yes/paused), go-to-end(no/live)

## Guardrails
- `pushState()` is the ONLY writer of `cursor` (D-16301); live broadcast wins over REST rewind
- `playbackController.mjs` MUST NOT import `boardgame.io`; no `Math.random()`, no I/O
- Playback buffer is Class 1 Runtime State — no DB / Redis / file / log write (D-16306)
- Rewind via REST response only — no `transport.pubSub` for rewind (D-16303)
- Rewind `uiState` MUST pass through `filterUIStateForAudience` (D-16303) — hidden-info leak otherwise
- `step-forward` `'live-move'` branch does NOT call `submitMove` — it releases the gate for one move
- Six new endpoints take no body — no `koaBody()`
- Controller removed from the map on EVERY `runBotMatch` exit path (D-16308)
- Single in-flight `waitIfPaused()` consumer; no mutex/queue (D-16309)
- Initial `pushState` precedes the first `waitIfPaused()` gate (history ≥ 1)

## Required `// why:` Comments
- `playbackController.mjs::waitIfPaused` — single-consumer / last-write-wins (D-16309)
- `playbackController.mjs::pushState` — 100-entry cap (D-16302) AND sole cursor-write site (D-16301)
- `playbackController.mjs::stepForward` — discriminated union; `'live-move'` does not call `submitMove`
- `autoplay.mjs` initial-push site — history ≥ 1 before any pause (D-16302 corollary)
- `autoplay.mjs::runBotMatch` exit cleanup — controller-map leak risk (D-16308)
- `autoplay.mjs` step-forward handler — `uiState` returned only on `result.type === 'cursor'`
- `autoplay.mjs::buildResponse` — `mode` always read from controller, never inline

## Files to Produce
- `apps/server/src/autoplay/playbackController.mjs` — **new** — controller factory (pure helper)
- `apps/server/src/autoplay/playbackController.test.ts` — **new** — state-machine / race / cursor-boundary / lifecycle-leak (N=10) / mode-drift
- `apps/server/src/autoplay/autoplay.mjs` — **modified** — controller map, initial + per-move push, gate, `getActiveDelay()`, six bodyless endpoints, `getController`/`buildResponse`, exit cleanup
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — six new whole rows (D-11804)
- `docs/ai/DECISIONS.md` — **modified** — flip D-16301..D-16309 Drafted → Active
- `docs/ai/STATUS.md` — **modified** — autoplay playback note
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-163
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — mark EC-180 Done

## After Completing
- [ ] `pnpm -r build` exits 0 (the server has no build script; this builds the game-engine dep)
- [ ] `playbackController.test.ts` passes (incl. N=10 lifecycle-leak, mode-drift)
- [ ] `rg "cursor\s*=" autoplay.mjs` → zero (A2: the wiring layer never writes cursor; the controller owns it)
- [ ] `rg "router\.post\('/api/match/autoplay/:matchId/" autoplay.mjs` → exactly 6
- [ ] `rg "boardgame\.io" playbackController.mjs` → zero
- [ ] `api-endpoints.md` has 6 new rows, `Status: Wired`, `Auth: guest`
- [ ] D-16301..D-16309 Active; STATUS.md updated; WORK_INDEX WP-163 checked off; EC_INDEX EC-180 Done
- [ ] Commit prefix `EC-180:` (staged files under `apps/`)

## Common Failure Smells
- Spectators desync after rewind → rewind went via `transport.pubSub` instead of REST
- Hidden cards visible after step-back → `filterUIStateForAudience` skipped
- Controller map grows across matches → cleanup missing on a `runBotMatch` exit path
- `mode` missing on an error body → handler bypassed `buildResponse()` / `getMode()`
- Pause never releases → multiple `waitIfPaused()` consumers or `resume()` not resolving the pending Promise
