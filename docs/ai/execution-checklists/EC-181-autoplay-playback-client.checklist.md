# EC-181 — Autoplay Playback Controls (Client) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-164-autoplay-playback-client.md
**Layer:** Client (`apps/arena-client/src/`)

## Before Starting
- [ ] **WP-165** (autoplay status endpoint) is `Done`; `GET /api/match/autoplay/:matchId/status` is live on `main`
- [ ] WP-163 / EC-180 is `Done`; the six POST control endpoints are live; `mode ∈ { 'live', 'paused' }` (no `'rewind'` value)
- [ ] `git rev-parse origin/main` matches local `main` HEAD; record it
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `buildApiUrl(path)` exists at `apps/arena-client/src/lib/api/apiBaseUrl.ts` (D-16101)
- [ ] `useUiStateStore().setSnapshot(next: UIState | null): void` exists in `apps/arena-client/src/stores/uiState.ts` — if drifted, STOP
- [ ] `App.vue parseQuery` parses `match` → `live.matchID`; confirm how `PlayDesktop.vue` receives `matchID` before writing the mount
- [ ] WP-164 §Pre-Flight Verdict = READY (after WP-165 lands); §Copilot Check Verdict = PASS

## Locked Values (do not re-derive)
- Service functions: `getStatus` (GET) + `pause` / `resume` / `stepForward` / `stepBack` / `restart` / `goToEnd` (POST)
- Routes: `GET /api/match/autoplay/:matchId/status`; `POST /api/match/autoplay/:matchId/{pause,resume,step-forward,step-back,restart,go-to-end}`
- All paths built via `buildApiUrl(...)` (D-16101) — no relative / hardcoded URLs
- Envelope: `{ ok, paused, historyLength, cursor, mode, uiState?, error? }` (D-16304); `mode` read DIRECTLY, never recomputed
- `getStatus` resolves the envelope on `200`, `null` on `404`
- REWIND affordance keyed on `isRewound = cursor < historyLength - 1` (NOT `mode === 'rewind'` — that value does not exist)
- Glyphs: `⏮ ⏪ ⏸/▶ ⏩ ⏭` (five buttons + one pause/resume toggle)
- Disabled-when (verbatim): `step-back` ↔ `cursor === 0` OR `!paused`; `step-forward` ↔ `!paused`; `restart` ↔ `!paused` OR `historyLength === 0`; `go-to-end` ↔ game over (from the live store snapshot)
- Pause/resume: show `pause` when `!paused`; show `resume` when `paused`
- `setSnapshot` called via `useUiStateStore().setSnapshot(response.uiState)` ONLY when `response.uiState` is truthy

## Guardrails
- Bar renders ONLY when `getStatus(matchId)` resolves non-null (`200`) — NOT on `?match` presence; no PvP render
- No `?autoplay` URL marker; `LobbyView.vue` / `App.vue` are NOT modified (D-16501 — the status probe is the gate)
- Single ingestion path: the service is the ONLY new non-test caller of `setSnapshot`; no component / page calls it directly
- Live broadcast wins (D-16301): a Socket.IO broadcast after a rewind unconditionally overwrites injected state — NO merge, NO reconciliation
- No debounce / throttle on button events (D-16309)
- No direct `fetch` outside the service module; components/pages call service functions only
- No `@legendary-arena/game-engine/setup` import anywhere in `apps/arena-client` (D-14401)
- `uiState.ts` MUST NOT appear in `git diff --name-only`; no new Pinia store

## Required `// why:` Comments
- `autoplayPlayback.ts` snapshot-injection branch — does not race Socket.IO (live broadcast overwrites via existing transport; D-16301)
- `autoplayPlayback.ts` `mode` consumption — server's `mode` is authoritative; client never recomputes (D-16304)
- `AutoplayControls.vue` REWIND indicator — `isRewound` (cursor behind live edge) lets a spectator tell historical from live; distinct from `mode`
- `PlayDesktop.vue` conditional mount — bar renders only when the `getStatus` probe confirms an autoplay match (D-16501)

## Files to Produce
- `apps/arena-client/src/services/autoplayPlayback.ts` — **new** — `getStatus` + six controls via `buildApiUrl`; inject `setSnapshot` iff `uiState` present
- `apps/arena-client/src/services/autoplayPlayback.test.ts` — **new** — setter iff `uiState`; `mode` pass-through; `getStatus` null-on-404; correct paths
- `apps/arena-client/src/components/AutoplayControls.vue` — **new** — 5 buttons + toggle; disabled matrix; `isRewound` affordance; no `fetch`, no store import
- `apps/arena-client/src/components/AutoplayControls.test.ts` — **new** — disabled matrix; REWIND toggles with `isRewound`; button→service; no `setSnapshot`
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — call `getStatus(matchID)`; mount `<AutoplayControls>` only when it resolves non-null; seed initial state
- `docs/ai/STATUS.md` / `docs/ai/work-packets/WORK_INDEX.md` / `docs/ai/execution-checklists/EC_INDEX.md` / `docs/05-ROADMAP-MINDMAP.md` — **modified** — close WP-164 / EC-181

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `rg "game-engine/setup" apps/arena-client/src` → zero (D-14401)
- [ ] `uiState.ts` absent from `git diff --name-only`
- [ ] `setSnapshot` called from exactly one new non-test site (`autoplayPlayback.ts`)
- [ ] `AutoplayControls.vue` calls no `fetch` and does not import `useUiStateStore`
- [ ] `LobbyView.vue` / `App.vue` absent from `git diff --name-only` (bar gated by the status probe, not a URL marker)
- [ ] Commit prefix `EC-181:` (staged files under `apps/arena-client/`)

## Common Failure Smells
- Bar visible in a normal PvP match → gated on `?match` instead of the `getStatus` probe
- REWIND never shows → keyed on `mode === 'rewind'` (nonexistent) instead of `isRewound = cursor < historyLength - 1`
- Rewind state flickers back to live mid-step → client added merge/reconciliation instead of letting the broadcast win (D-16301)
- `setSnapshot` called with null/undefined → injection branch missing the truthiness guard
- Build fails on a forbidden import → `game-engine/setup` pulled in for a type (D-14401)
