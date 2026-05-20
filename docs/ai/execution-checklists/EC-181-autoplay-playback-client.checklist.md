# EC-181 — Autoplay Playback Controls (Client) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-164-autoplay-playback-client.md
**Layer:** Client (`apps/arena-client/src/`)

## Before Starting
- [ ] **WP-165** (autoplay status endpoint) is `Done` on `main` (`b39f17b`); `GET /api/match/autoplay/:matchId/status` is live (`autoplay.mjs:352`)
- [ ] WP-163 / EC-180 is `Done`; the six POST control endpoints are live; `mode ∈ { 'live', 'paused' }` (no `'rewind'` value)
- [ ] `git rev-parse origin/main` matches local `main` HEAD; record it (baseline `b39f17b`)
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `buildApiUrl(path)` exists at `apps/arena-client/src/lib/api/apiBaseUrl.ts` (D-16101)
- [ ] `useUiStateStore().setSnapshot(next: UIState | null): void` exists in `apps/arena-client/src/stores/uiState.ts` — if drifted, STOP
- [ ] `matchId` reaches `PlayDesktop.vue` ONLY via the prop-drill `App.vue` (`liveParams.matchID`) → `PlayViewport.vue` → `PlayDesktop.vue`; no store carries it. `App.vue parseQuery` / routing stays unchanged (additive `:match-id` bind only, D-16501)
- [ ] WP-164 §Pre-Flight Verdict = READY; §Copilot Check Verdict = PASS

## Locked Values (do not re-derive)
- Service functions: `getStatus` (GET) + `pause` / `resume` / `stepForward` / `stepBack` / `restart` / `goToEnd` (POST)
- Routes: `GET /api/match/autoplay/:matchId/status`; `POST /api/match/autoplay/:matchId/{pause,resume,step-forward,step-back,restart,go-to-end}`
- All paths built via `buildApiUrl(...)` (D-16101) — no relative / hardcoded URLs
- Envelope: `{ ok, paused, historyLength, cursor, mode, uiState?, error? }` (D-16304); `mode` read DIRECTLY, never recomputed
- `getStatus` resolution (Locked): `200` → parsed envelope; `404` → `null`; ANY other status (`500`) / network / parse error → **throws** (NOT coerced to `null` — a non-404 fault must not be misread as "not autoplay")
- `STATUS_RETRY_DELAY_MS = 1000` — on an INITIAL `getStatus` `null` (404), retry EXACTLY ONCE after this delay. Bounded: second `200` → show bar; second `null` → autoplay absent, bar stays hidden, NO further retries; a thrown error is not a `null` outcome (surface it, leave bar hidden) (WP-165 transient-404 guard, D-16501)
- `mode` vs `isRewound` are INDEPENDENT axes: `mode` (`'live' | 'paused'`) = control state read directly; `isRewound = cursor < historyLength - 1` = view state derived client-side. All four combinations valid; `live + isRewound` is transient (next broadcast resets cursor). NEVER assume `mode === 'paused'` implies rewound, or that `mode` encodes view state
- REWIND affordance keyed on `isRewound` (NOT `mode === 'rewind'` — that value does not exist)
- Service state ownership: the service is STATELESS wrt playback state (no `paused`/`cursor`/`historyLength`/`mode`, no cache); the COMPONENT owns those and updates them from the initial `getStatus` probe + each control response
- Glyphs: `⏮ ⏪ ⏸/▶ ⏩ ⏭` (five buttons + one pause/resume toggle)
- Disabled-when (verbatim): `step-back` ↔ `cursor === 0` OR `!paused`; `step-forward` ↔ `!paused`; `restart` ↔ `!paused` OR `historyLength === 0`; `go-to-end` ↔ game over (read PASSIVELY from the live `useUiStateStore` snapshot — never computed/inferred on the client)
- Pause/resume: show `pause` when `!paused`; show `resume` when `paused`
- `setSnapshot` called via `useUiStateStore().setSnapshot(response.uiState)` ONLY when `response.uiState` is truthy, passing the value EXACTLY (no transformation / merge / partial patch); NEVER with `null`/`undefined` and NEVER from the `getStatus` path
- Live-overwrite site (Locked): the existing live ingestion path `apps/arena-client/src/client/bgioClient.ts` calls `setSnapshot(currentUIState)` per broadcast — this WP MUST NOT modify it; injected rewind snapshots are temporary and replaced by the next broadcast (D-16301)
- `matchId` delivery (Locked): additive prop-drill `App.vue :match-id` → `PlayViewport.vue` (forward to `<PlayDesktop>`, NOT `<PlayMobile>`) → `PlayDesktop.vue matchId` prop. No `parseQuery` change, no `?autoplay` key, no store read (D-16501)

## Guardrails
- Bar renders ONLY when `getStatus(matchId)` resolves non-null (`200`) — NOT on `?match` presence; no PvP render
- First `404` is NOT definitive: retry the probe EXACTLY ONCE after `STATUS_RETRY_DELAY_MS` before hiding; bounded — no third attempt, no loop; `getStatus` stays a single request (retry lives in the `PlayDesktop.vue` mount logic)
- A non-404 `getStatus` failure (`500` / network) THROWS — do NOT coerce it to `null` (that would mask a real fault as "not autoplay")
- `mode` and `isRewound` are independent — do NOT conflate them; REWIND keys on `isRewound` only; `mode` is never recomputed and never a value other than `'live' | 'paused'`
- Game-over is read PASSIVELY from the `useUiStateStore` snapshot — the component never computes/infers it
- Service is STATELESS for playback state; the component owns `paused`/`cursor`/`historyLength`/`mode` — do NOT let the service become a store
- No `?autoplay` URL marker; `LobbyView.vue` NOT modified; the ONLY `App.vue` edit is the additive `:match-id` prop bind — `parseQuery` / route logic untouched (D-16501 — the status probe is the gate)
- Single ingestion path: the service is the ONLY new non-test caller of `setSnapshot`; no component / page calls it directly; the injected `uiState` is passed EXACTLY (no transform/merge), never `null`/`undefined`
- Live broadcast wins (D-16301): the existing `client/bgioClient.ts` `setSnapshot(currentUIState)` per-broadcast write overwrites injected state — NO merge, NO reconciliation; `bgioClient.ts` is NOT modified
- No debounce / throttle on button events (D-16309)
- No direct `fetch` outside the service module; components/pages call service functions only
- No `@legendary-arena/game-engine/setup` import anywhere in `apps/arena-client` (D-14401)
- `uiState.ts` and `client/bgioClient.ts` MUST NOT appear in `git diff --name-only`; no new Pinia store

## Required `// why:` Comments
- `autoplayPlayback.ts` snapshot-injection branch — does not race Socket.IO (live broadcast overwrites via existing transport; D-16301)
- `autoplayPlayback.ts` `mode` consumption — server's `mode` is authoritative; client never recomputes (D-16304)
- `AutoplayControls.vue` REWIND indicator — `isRewound` (cursor behind live edge) lets a spectator tell historical from live; distinct from `mode`
- `PlayDesktop.vue` conditional mount — bar renders only when the `getStatus` probe confirms an autoplay match (D-16501)
- `autoplayPlayback.ts` `getStatus` non-404 branch — only `404` maps to `null` (not autoplay); other faults rethrow so an outage is not silently read as a normal PvP match
- `PlayDesktop.vue` bounded retry — exactly one retry absorbs the WP-165 transient-init 404; a second `null` is final (no loop)

## Files to Produce
- `apps/arena-client/src/services/autoplayPlayback.ts` — **new** — `getStatus` + six controls via `buildApiUrl`; inject `setSnapshot` iff `uiState` present
- `apps/arena-client/src/services/autoplayPlayback.test.ts` — **new** — `getStatus`: `200` → object, `404` → `null`, `500`/network → THROWS; control responses: `uiState` present → `setSnapshot` called with that value exactly, absent → NOT called; `mode` pass-through; correct `buildApiUrl` paths
- `apps/arena-client/src/components/AutoplayControls.vue` — **new** — 5 buttons + toggle; disabled matrix; `isRewound` affordance; no `fetch`, no store import
- `apps/arena-client/src/components/AutoplayControls.test.ts` — **new** — disabled matrix; button→service; component never calls `setSnapshot`; REWIND transitions (`stepBack` → `isRewound` true; forward-to-live → `isRewound` false); pause-while-rewound still indicates REWIND; a control response updates local `paused`/`cursor`/`historyLength`/`mode`
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — add a `matchId` prop; call `getStatus(matchId)` (retry once on an initial 404 after `STATUS_RETRY_DELAY_MS`, bounded); mount `<AutoplayControls>` only when a probe resolves non-null; seed initial state. Cover the bounded-retry gating (null→retry→null ⇒ hidden; null→retry→200 ⇒ shown) with a test — extract a pure gating helper if mounting the full page is impractical
- `apps/arena-client/src/pages/PlayViewport.vue` — **modified** — add a `matchId` prop and forward it to `<PlayDesktop :match-id>` (NOT `<PlayMobile>`)
- `apps/arena-client/src/App.vue` — **modified (additive only)** — bind `liveParams.matchID` onto `<PlayViewport :match-id>` for the `live` route; NO `parseQuery` / route change
- `docs/ai/STATUS.md` / `docs/ai/work-packets/WORK_INDEX.md` / `docs/ai/execution-checklists/EC_INDEX.md` / `docs/05-ROADMAP-MINDMAP.md` — **modified** — close WP-164 / EC-181

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `rg "game-engine/setup" apps/arena-client/src` → zero (D-14401)
- [ ] `uiState.ts` AND `client/bgioClient.ts` absent from `git diff --name-only`
- [ ] `setSnapshot` called from exactly one new non-test site (`autoplayPlayback.ts`); pre-existing callers (`client/bgioClient.ts`, `main.ts`, `components/replay/ReplayInspector.vue`) unchanged
- [ ] `AutoplayControls.vue` calls no `fetch` and does not import `useUiStateStore`
- [ ] `LobbyView.vue` absent from `git diff --name-only`; `App.vue` + `PlayViewport.vue` PRESENT (additive `matchId` prop drill); `rg "parseQuery" App.vue` count unchanged vs `main` (no parse logic edit)
- [ ] Commit prefix `EC-181:` (staged files under `apps/arena-client/`)

## Common Failure Smells
- Bar visible in a normal PvP match → gated on `?match` instead of the `getStatus` probe
- Bar never appears for a valid autoplay match → first transient `404` treated as definitive (missing the single retry)
- REWIND never shows → keyed on `mode === 'rewind'` (nonexistent) instead of `isRewound = cursor < historyLength - 1`
- Rewind state flickers back to live mid-step → client added merge/reconciliation instead of letting the broadcast win (D-16301)
- `setSnapshot` called with null/undefined → injection branch missing the truthiness guard
- Build fails on a forbidden import → `game-engine/setup` pulled in for a type (D-14401)
- Bar hidden during a real outage / never recovers → non-404 `getStatus` fault coerced to `null` instead of thrown
- Probe loops / bar visibility oscillates → retry not bounded to exactly one attempt
- REWIND shows/clears at the wrong time → `mode` and `isRewound` conflated (they are independent axes)
- `go-to-end` enable state wrong at game end → game-over computed on the client instead of read from the store snapshot
- Rewind state never overwritten by live → `bgioClient.ts` modified, or a merge added instead of letting the existing `setSnapshot` write win
- Bar never probes (`matchId` undefined in `PlayDesktop.vue`) → prop not forwarded by `PlayViewport.vue`, or `App.vue :match-id` bind omitted
- `App.vue` diff touches `parseQuery` / route logic → scope creep; only the additive `:match-id` bind is permitted (D-16501)
