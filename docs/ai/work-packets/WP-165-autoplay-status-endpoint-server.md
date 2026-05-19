# WP-165 — Autoplay Status Endpoint (Server)

**Status:** Draft
**Primary Layer:** Server (`apps/server/src/autoplay/`)
**Dependencies:** WP-163 (autoplay playback controls — server) — Done 2026-05-19
**Paired with:** WP-164 (client). WP-164 hard-depends on this endpoint landing on `main`.
**EC:** EC-182
**Baseline:** `origin/main` at `39c06c2` (drafted 2026-05-19); verify HEAD at execution.

---

## Goal

After this packet, the autoplay server surface exposes one side-effect-free
read endpoint, `GET /api/match/autoplay/:matchId/status`, that returns the
current playback envelope for a running autoplay match (`200`) or a not-found
envelope when no playback controller is registered for the match (`404`). This
lets the WP-164 client distinguish an autoplay ("Watch Bot Play") match — which
the playback control bar applies to — from a normal live multiplayer match,
**without** a URL marker and **without** a side-effectful probe. The endpoint
reuses WP-163's existing `getController` and `buildResponse` helpers and adds no
new playback logic.

---

## Assumes

- WP-163 is Done: `apps/server/src/autoplay/autoplay.mjs` has the module-level
  `autoplayControllers` map, the `getController(koaContext)` helper, the
  exported `buildResponse(controller, options)` helper, and the
  `handlePlaybackRequest(koaContext, core)` 404/500 wrapper. Source: WORK_INDEX
  WP-163 (Done 2026-05-19).
- The six POST control endpoints exist and are unchanged by this WP.
- `:matchId` is read via `koaContext.params.matchId` on the boardgame.io
  `server.router` (established by WP-163).

If any of the above is false, this packet is **BLOCKED**.

---

## Context

WP-164 (client) needs to decide whether to render the playback control bar.
The autoplay spectator URL (`?match=…&player=0&credentials=…`, produced by
`LobbyView.startAutoplay`) is structurally identical to a normal live-match
URL, so the presence of `?match` alone cannot distinguish the two. A read-only
status endpoint is the cleanest gate: the client probes it once on mount, shows
the bar and seeds its initial state on `200`, and hides the bar on `404`. A
`GET` is safe and idempotent — unlike probing a POST control (which would have
side effects) — and avoids coupling the lobby/app routing layer to the autoplay
feature with a new query-param marker (D-16501).

This is split from the client work (WP-164) because it is a **server** surface
addition; the WP-163/WP-164 split is precisely on the server/client layer
boundary, and a new server endpoint belongs in a server WP.

**Authority chain (read order at execution):**
- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)`
- `.claude/rules/architecture.md` (Server Layer)
- `.claude/rules/work-packets.md §API Catalog Update Obligation`
- `.claude/skills/legendary-server/SKILL.md`
- This WP (WP-165)
- EC-182
- `apps/server/src/autoplay/autoplay.mjs` (WP-163 helpers to reuse)
- `docs/ai/REFERENCE/api-endpoints.md`

---

## Scope (In)

- **`apps/server/src/autoplay/autoplay.mjs`** — add one exported async handler
  `handleAutoplayStatusRequest(koaContext)` that calls
  `handlePlaybackRequest(koaContext, (controller) => { koaContext.body =
  buildResponse(controller); })`, and register it on
  `router.get('/api/match/autoplay/:matchId/status', handleAutoplayStatusRequest)`.
  No body. No `koaBody()`. No mutation of controller state.
- **`apps/server/src/autoplay/autoplayStatus.test.ts`** (new) — `node:test`,
  `.test.ts`: a registered controller returns the envelope (`ok: true`, `mode`
  present, no `uiState`); an unknown `:matchId` returns `404` with the
  not-found envelope; the handler never mutates controller state (cursor /
  paused unchanged across a status call).
- **`docs/ai/REFERENCE/api-endpoints.md`** — one new whole row (D-11804):
  `GET /api/match/autoplay/:matchId/status`, `Status: Wired`, `Auth: guest`.
- **Governance:** `docs/ai/DECISIONS.md` (D-16501),
  `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md`,
  `docs/ai/execution-checklists/EC_INDEX.md`,
  `docs/05-ROADMAP-MINDMAP.md`.

## Scope (Out)

- The six POST control endpoints — unchanged.
- `playbackController.mjs` — unchanged (no new controller methods; reuses
  existing accessors via `buildResponse`).
- Any client code — that is WP-164.
- Any new controller state, persistence, or `uiState` on the status response
  (status is metadata only: `paused` / `historyLength` / `cursor` / `mode`).
- Mutating controller state from the status path (it is strictly read-only).

---

## Contract

### `GET /api/match/autoplay/:matchId/status`

- **Auth:** `guest`. No request body.
- **`200`** when a controller is registered for `:matchId`: returns the
  `AutoplayControlResponse` envelope `{ ok: true, paused, historyLength,
  cursor, mode }` (the same shape `buildResponse` produces; **no `uiState`** —
  status carries metadata only). `mode` is read only from `controller.getMode()`
  (D-16304).
- **`404`** when no controller is registered: returns `{ ok: false, paused:
  false, historyLength: 0, cursor: -1, mode: 'live', error: 'No autoplay match
  is running for the requested match id.' }` — the same not-found envelope the
  POST handlers return via `handlePlaybackRequest`. `error` is a full sentence
  (00.6 Rule 11).
- **`500`** on unexpected fault: the standardized error envelope.
- **Read-only:** the handler never calls `pause` / `resume` / `step*` /
  `restart` / `goToEnd` / `pushState`; controller state is identical before and
  after a status call.

### Response type

```ts
type AutoplayStatusResponse = {
  ok: boolean;
  paused: boolean;
  historyLength: number;
  cursor: number;
  mode: 'live' | 'paused';   // closed set — see Mode Semantics
  error?: string;            // full-sentence message on non-200 (00.6 Rule 11)
};
```

The status response carries **no `uiState`** — it is metadata only (the control
endpoints, not status, deliver rewind frames).

### Mode Semantics (Locked)

- `mode` is a closed set: **`'live' | 'paused'`** (D-16304, as built by WP-163).
  There is **no `'rewind'` mode value.**
  - `'paused'` ⇔ the bot loop is gated (`controller.isPaused()`).
  - `'live'` ⇔ the loop is free-running.
- `mode` is computed inside `PlaybackController.getMode()` and exposed verbatim;
  the status endpoint MUST NOT recompute or reinterpret it.
- "Viewing history" (rewound) is **not** a `mode` value — it is the client-side
  derived predicate `cursor < historyLength - 1` (owned by WP-164). The server
  reports `cursor` / `historyLength`; the client derives rewound-ness.

<!-- why: locks the cross-WP contract so WP-163 (producer), WP-165 (reporter),
and WP-164 (consumer) cannot drift on what `mode` means. -->

### Fresh-controller / empty-history semantics

- A controller is registered the instant `runBotMatch` starts, **before** its
  first snapshot. A status call in that window returns `{ ok: true, paused:
  false, historyLength: 0, cursor: -1, mode: 'live' }` — a valid "autoplay match
  exists, no snapshot yet" state, **not** a broken match.
- After the first recorded snapshot (D-16302 corollary — taken before the first
  pause gate) `historyLength >= 1` and `cursor === historyLength - 1`.
- `200` means "this is an autoplay match" **regardless of `historyLength`**; the
  client shows the bar (controls disabled until history accrues).

### Client gating contract (consumed by WP-164)

- `200` ⇒ this is an autoplay match: WP-164 shows the control bar and seeds its
  initial `paused` / `cursor` / `historyLength` / `mode` from this response.
- `404` ⇒ not an autoplay match (or the match has ended and the controller was
  torn down per D-16308): WP-164 hides the control bar.
- **Transient 404 during init:** `runBotMatch` registers the controller
  asynchronously *after* the autoplay-create endpoint returns the `matchId`, so a
  status call issued immediately after navigation MAY `404` before the controller
  exists. The client (WP-164) MUST retry once after a short delay and treat only
  a **persistent** `404` as "not an autoplay match." WP-165 itself reports
  current state only — it does not retry, block, or pre-create a controller.

### API Catalog row (D-11804)

One new whole row in `docs/ai/REFERENCE/api-endpoints.md`: `Status: Wired`,
`Auth: guest`.

---

## Non-Negotiable Constraints

- ESM only; `.test.ts` test (server runner globs `src/**/*.test.ts`);
  full-sentence error messages.
- The status route is `GET` and bodyless — no `koaBody()`.
- The handler is strictly read-only — no controller mutation.
- Reuse WP-163's `getController` / `buildResponse` / `handlePlaybackRequest`;
  do not duplicate the 404/500 logic.
- `mode` is read only from `controller.getMode()` — never recomputed.
- No persistence; status reads the in-memory controller only.
- The endpoint exposes controller state only; it MUST NOT infer, embed, or
  branch on client-specific logic. Interpretation (bar gating, rewound-ness,
  the transient-404 retry) is owned by WP-164. // why: the server is a state
  provider, not a UI coordinator.

---

## Acceptance Criteria

- [ ] `GET /api/match/autoplay/:matchId/status` registered (bodyless, no
      `koaBody()`).
- [ ] `200` returns `{ ok, paused, historyLength, cursor, mode }` with no
      `uiState`; `404` returns the not-found envelope; both carry `mode`.
- [ ] The handler does not mutate controller state (verified by test).
- [ ] One new API-catalog row, `Status: Wired`, `Auth: guest`.
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test`
      passes (the pre-existing `join-match.test.ts` failure may persist).

## Verification Steps

```bash
# 1. Build the engine dep + run the server tests (server has no build script)
pnpm -r build
pnpm --filter @legendary-arena/server test
#    → autoplayStatus.test.ts passes (200 envelope, 404, read-only invariant)

# 2. Exactly one GET status route registration (matches the router.get(...)
#    call, not a comment or a bare path string elsewhere)
rg -n "router\.get\('/api/match/autoplay/:matchId/status'" apps/server/src/autoplay/autoplay.mjs
#    → exactly 1 match (the route registration)

# 3. Six POST control routes still present (WP-163 unchanged)
rg -c "router\.post\('/api/match/autoplay/:matchId/" apps/server/src/autoplay/autoplay.mjs
#    → 6

# 4. API catalog row present
rg -n "GET.*/api/match/autoplay/:matchId/status" docs/ai/REFERENCE/api-endpoints.md
#    → 1 row, Status: Wired, Auth: guest
```

## Definition of Done

1. `pnpm -r build` exits 0; server tests pass (modulo the pre-existing fail).
2. `handleAutoplayStatusRequest` + `GET …/status` route added; bodyless;
   read-only.
3. `autoplayStatus.test.ts` passes (200 envelope, 404, no-mutation invariant).
4. `api-endpoints.md` — one new whole row (D-11804), `Wired` / `guest`.
5. `docs/ai/DECISIONS.md` — D-16501 flipped Drafted → Active.
6. `docs/ai/STATUS.md`, `WORK_INDEX.md` (WP-165 `[x]`), `EC_INDEX.md` (EC-182
   Done), `05-ROADMAP-MINDMAP.md` updated.

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-16501 | Autoplay-match detection uses a side-effect-free `GET /api/match/autoplay/:matchId/status` endpoint (200 = autoplay match, 404 = not). The client gates its playback control bar on this probe rather than on a URL marker or a side-effectful POST probe. | A `GET` is safe/idempotent and reuses WP-163's `getController` + `buildResponse`. It keeps the lobby/app routing layer (`LobbyView.vue`, `App.vue` `parseQuery`) free of a feature-specific `?autoplay` query key, and avoids the alternative of probing a POST control (which would mutate state just to detect a match). The status response also seeds the client's initial bar state. |

---

## Pre-Flight Verdict

**READY TO EXECUTE.** Dependency WP-163 is Done; all reused helpers
(`getController`, `buildResponse`, `handlePlaybackRequest`, `autoplayControllers`)
are on `main` at `39c06c2`. No new RS items — the endpoint is a thin read-only
composition of existing, tested helpers.

## Copilot Check Verdict

**PASS.** Low risk: no new state, no persistence (status reads the in-memory
controller), no mutation (read-only handler — `mode` from `getMode()` only),
reuses the tested 404/500 wrapper. The one watch-item (status must not mutate
controller state) is locked by a constraint + a no-mutation test.

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | Single WP per session | PASS (paired-draft with WP-164; one execution session each) |
| 2 | Dependency discipline | PASS — WP-163 Done |
| 3 | Review gate | N/A — draft |
| 4 | Layer boundary | PASS — Server layer only |
| 5 | File count | PASS — 1 modified + 1 new test + governance |
| 6 | Contract stability | PASS — additive endpoint; WP-163 surface unchanged |
| 7 | Auth posture | PASS — `Auth: guest` (closed set, D-9905) |
| 8 | Determinism | N/A — no engine code |
| 9 | Persistence boundary | PASS — reads in-memory controller; no store |
| 10 | Test coverage | PASS — `autoplayStatus.test.ts` (200 / 404 / no-mutation) |
| 11 | Error handling | PASS — reuses `handlePlaybackRequest` 404/500 |
| 12 | Code style (00.6) | PASS — ESM, full words |
| 13 | Module system | PASS — ESM |
| 14 | Naming | PASS — `handleAutoplayStatusRequest` descriptive |
| 15 | Comments | PASS — `// why:` for the read-only GET intent (EC-182) |
| 16 | Drift detection | N/A |
| 17 | Vision alignment | PASS — spectator presentation |
| 18 | Pre-planning | N/A |
| 19 | Replay safety | N/A |
| 20 | Funding surface gate | N/A |
| 21 | API catalog (D-11804) | PASS — one new whole row with the code |
