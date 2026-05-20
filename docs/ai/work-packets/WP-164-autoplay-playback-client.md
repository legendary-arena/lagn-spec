# WP-164 — Autoplay Playback Controls (Client)

**Status:** Draft
**Primary Layer:** Client (`apps/arena-client/src/`)
**Dependencies:** WP-163 (autoplay server controls) — Done 2026-05-19; WP-165
(autoplay status endpoint) — Done 2026-05-19 (`b39f17b`); WP-161
(`apiBaseUrl` / `buildApiUrl` helper, D-16101) — Done; WP-061 (UIState store) — Done
**Paired with:** WP-165 (server status endpoint).
**EC:** EC-181
**Baseline:** `origin/main` at `b39f17b` (drafted 2026-05-19; baseline refreshed
2026-05-19 after WP-165 landed); verify HEAD at execution.

---

## Goal

After this packet, a spectator watching an autoplay ("Watch Bot Play") match
sees a media-player-style control bar on `PlayDesktop.vue`: pause, resume,
step-back, step-forward, restart, and go-to-end. The bar consumes WP-163's six
REST control endpoints, injects rewind snapshots into the existing Pinia
`useUiStateStore` via its existing `setSnapshot` action, and surfaces a visible
"REWIND" affordance while the spectator is viewing historical (not live) state.
The client owns no game logic; Socket.IO live broadcasts unconditionally
overwrite injected rewind state (D-16301). The bar appears **only** for autoplay
matches, gated on WP-165's `GET …/status` probe — never in normal multiplayer.

---

## Assumes

- **WP-165** is Done: `GET /api/match/autoplay/:matchId/status` is live on
  `main` (`b39f17b`) and returns the `{ ok, paused, historyLength, cursor, mode }`
  envelope (`200`) or the not-found envelope (`404`).
- WP-163 is Done: the six `POST /api/match/autoplay/:matchId/*` endpoints exist
  with the `{ ok, paused, historyLength, cursor, mode, uiState?, error? }`
  envelope and `mode ∈ { 'live', 'paused' }` (D-16304 as-built — there is **no**
  `'rewind'` mode value).
- WP-161 `buildApiUrl(path)` exists at
  `apps/arena-client/src/lib/api/apiBaseUrl.ts` (D-16101) — the service prefixes
  every path with it; no relative or hardcoded URLs.
- `useUiStateStore().setSnapshot(next: UIState | null): void` exists in
  `apps/arena-client/src/stores/uiState.ts` (reused unchanged).
- `App.vue` `parseQuery` already parses `match` → `live.matchID`; the autoplay
  URL is `?match=…&player=0&credentials=…` (`LobbyView.startAutoplay`), so
  `App.vue` holds `matchID` for the live route.
- **`matchID` is NOT yet available inside `PlayDesktop.vue`.** As-built, the live
  route mounts `App.vue:367 <PlayViewport :submit-move>` →
  `PlayViewport.vue:55 <PlayDesktop :submit-move>`; `PlayDesktop.vue`'s only prop
  is `submitMove`, and no store/composable carries `matchID` (`stores/**` has
  zero `matchId` references). Delivering `matchID` to the bar therefore requires
  an **additive prop pass-through**: `App.vue` binds `matchID` onto
  `<PlayViewport>`, `PlayViewport.vue` forwards it to `<PlayDesktop>`, and
  `PlayDesktop.vue` gains a `matchId` prop. This is a prop pass-through of an
  **already-parsed** value — **no** `parseQuery` change and **no** `?autoplay`
  query key, so D-16501 is intact.

If any of the above is false, this packet is **BLOCKED**.

---

## Context

WP-163 (server) shipped the playback controller + control endpoints; WP-165
(server) adds the status probe. This WP is the client consumer. It is split
from the server work on the layer boundary: this packet touches
`apps/arena-client/**` only.

**Gating correction vs. the original prep (resolved at draft time against the
as-built contract):** the prep assumed the bar would render whenever `?match`
is present and would key the rewind affordance on `mode === 'rewind'`. Both are
wrong against the as-built WP-163 surface: (a) a normal multiplayer URL also has
`?match`, so the bar would wrongly appear in PvP — instead the bar is gated on
WP-165's `GET …/status` (200 = autoplay, 404 = not); (b) `mode` is only
`'live' | 'paused'` (no `'rewind'`), so the "viewing history" affordance is
derived from cursor position: **`isRewound = cursor < historyLength - 1`**, kept
distinct from `mode` (which is still read directly, never recomputed, D-16304).

**Authority chain (read order at execution):**
- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` (D-14401 — no
  `game-engine/setup` import on the client)
- `.claude/rules/architecture.md` (App / arena-client section)
- `.claude/rules/code-style.md`
- WP-163 (envelope, Endpoint Behavior Matrix, `uiState` delivery — D-16301..D-16309)
- WP-165 (status probe contract — D-16501)
- This WP (WP-164)
- EC-181
- `docs/ai/REFERENCE/00.6-code-style.md`
- `apps/arena-client/src/stores/uiState.ts` (`setSnapshot`)
- `apps/arena-client/src/lib/api/apiBaseUrl.ts` (`buildApiUrl`)
- `apps/arena-client/src/pages/PlayDesktop.vue` (mount point)
- `apps/arena-client/src/App.vue` `parseQuery` (`match` → `matchID`)

---

## Scope (In)

- **`apps/arena-client/src/services/autoplayPlayback.ts`** (new) — a service
  module with a locally-declared `AutoplayControlResponse` type matching the
  D-16304 envelope. Functions: `getStatus(matchId)` (GET; resolves to the
  envelope on `200`, `null` on `404`), and the six controls `pause`, `resume`,
  `stepForward`, `stepBack`, `restart`, `goToEnd` (each POST). Every request
  goes through `buildApiUrl(...)` (no direct relative/hardcoded URLs). When a
  control response carries a truthy `uiState`, the service calls
  `useUiStateStore().setSnapshot(response.uiState)` — the **only** new non-test
  caller of `setSnapshot`.
- **`apps/arena-client/src/services/autoplayPlayback.test.ts`** (new) —
  `getStatus`: `200` → returns the parsed object, `404` → returns `null`, any
  other status (`500`) / network error → **throws** (not coerced to `null`);
  control responses: `uiState` present → `setSnapshot` called with that value
  exactly, `uiState` absent → `setSnapshot` NOT called; `mode` passed through
  unchanged; each function posts/gets the correct path via `buildApiUrl`.
- **`apps/arena-client/src/components/AutoplayControls.vue`** (new) — five
  buttons + one pause/resume toggle (glyphs `⏮ ⏪ ⏸/▶ ⏩ ⏭`); disabled-when
  matrix (below); visible REWIND affordance when `isRewound`; NO direct `fetch`;
  NO `useUiStateStore` import.
- **`apps/arena-client/src/components/AutoplayControls.test.ts`** (new) —
  disabled matrix; each button calls the matching service function; component
  never calls `setSnapshot`; REWIND affordance transitions: `stepBack` →
  `isRewound` becomes `true`; stepping forward to the live edge →
  `isRewound` becomes `false`; pause while rewound → REWIND still indicated
  (`paused === true` AND `isRewound === true`); a control response updates local
  `paused` / `cursor` / `historyLength` / `mode` correctly.
- **`apps/arena-client/src/pages/PlayDesktop.vue`** (modified) — add a `matchId`
  prop (string; the value drilled from `App.vue` via `PlayViewport.vue`). On
  mount, when `matchId` is present, call `getStatus(matchId)`; on an initial
  `null` (404), retry once after `STATUS_RETRY_DELAY_MS` (1000 ms) before
  deciding. Mount `<AutoplayControls :matchId="matchId" :initialStatus="status" />`
  only when a probe resolves `200` (non-null); a persistent `null` keeps the bar
  hidden. Seed the bar's initial `paused` / `cursor` / `historyLength` / `mode`
  from the status response.
- **`apps/arena-client/src/pages/PlayViewport.vue`** (modified) — add a `matchId`
  prop and forward it to `<PlayDesktop :match-id="matchId">` (alongside the
  existing `:submit-move`). `PlayMobile` is out of scope (desktop-only bar); the
  prop need not be forwarded to `<PlayMobile>`.
- **`apps/arena-client/src/App.vue`** (modified — **additive prop bind only**) —
  bind the already-parsed `liveParams.matchID` onto
  `<PlayViewport :match-id="…">` for the `live` route. **No** `parseQuery` change,
  **no** `?autoplay` query key, no new route state (D-16501 intact).
- **Governance:** `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md`
  (WP-164 row), `docs/ai/execution-checklists/EC_INDEX.md` (EC-181 row),
  `docs/05-ROADMAP-MINDMAP.md`.

## Scope (Out)

- **Server code** — WP-163 / WP-165.
- **`LobbyView.vue`** — unchanged; the status probe gates the bar, so no
  `?autoplay` URL marker is needed (D-16501).
- **`App.vue` `parseQuery` / routing logic** — unchanged. The only `App.vue`
  edit permitted is the **additive `:match-id` prop bind** in Scope (In); the
  query parsing, route discriminator, and live-client wiring are NOT touched
  (D-16501 — no new query key, no parseQuery change).
- **`uiState.ts` or any Pinia store** — reuse `setSnapshot`; no new store, no
  store edit. `uiState.ts` must NOT appear in `git diff --name-only`.
- **`client/bgioClient.ts`** — the existing live ingestion path that calls
  `setSnapshot` on each broadcast (D-16301 overwrite site); reused unchanged. It
  must NOT appear in `git diff --name-only`.
- **`game-engine/setup` import** — forbidden on the client (D-14401).
- **Debounce / throttle** on button events — the server is last-write-wins
  (D-16309); the client does not police rate.
- **Styling polish** beyond the REWIND indicator — a follow-up WP.
- **Recomputing `mode`** on the client — read it directly (D-16304).

---

## Contract

### Service (`autoplayPlayback.ts`)

```ts
interface AutoplayControlResponse {
  ok: boolean;
  paused: boolean;
  historyLength: number;
  cursor: number;
  mode: 'live' | 'paused';
  uiState?: UIState;
  error?: string;
}

getStatus(matchId: string): Promise<AutoplayControlResponse | null>  // null on 404
pause / resume / stepForward / stepBack / restart / goToEnd(matchId: string): Promise<AutoplayControlResponse>
```

- Paths: `getStatus` → `GET buildApiUrl('/api/match/autoplay/${matchId}/status')`;
  controls → `POST buildApiUrl('/api/match/autoplay/${matchId}/{action}')`
  (`step-forward` / `step-back` / `go-to-end` use the hyphenated route spellings).
- `mode` is read directly from the response; never recomputed.

#### `getStatus` resolution contract (Locked)

- On `200` → resolve the parsed `AutoplayControlResponse` envelope.
- On `404` → resolve `null` (the sole "not an autoplay match" signal).
- On **any other status (e.g. `500`) or a network/parse error** → **throw** a
  full-sentence error (00.6 Rule 11). A non-404 failure MUST NOT be coerced to
  `null`. // why: a `null` means "not autoplay" and hides the bar; silently
  mapping a `500`/network fault to `null` would mask a real outage as a normal
  PvP match. The mount logic distinguishes `null` (hide) from a thrown error
  (a real fault it does not swallow into the gating decision).

#### `setSnapshot` injection rule (Locked)

- After any **control** response, call `useUiStateStore().setSnapshot(...)` **iff
  `response.uiState` is truthy**, passing `response.uiState` **exactly** — no
  transformation, no merge, no partial patch.
- Never call `setSnapshot` with `null` or `undefined`, and never from the
  `getStatus` path (status carries no `uiState`; it is metadata only per WP-165).
- // why: overwrite semantics must stay total — the injected frame fully
  replaces the store snapshot, mirroring the live-broadcast write so the two
  paths never disagree on shape.

#### Service state ownership (Locked)

- The service is **stateless with respect to playback state**: it issues
  requests and returns responses (and performs the `setSnapshot` side effect on a
  truthy `uiState`); it stores **no** `paused` / `cursor` / `historyLength` /
  `mode`, holds no cache, and exposes no shared mutable module state.
- The **component** (`AutoplayControls.vue`, seeded by `PlayDesktop.vue`) owns
  `paused` / `cursor` / `historyLength` / `mode` and MUST update them from (a) the
  initial `getStatus` probe and (b) each control response.
- **Full-replace (Locked):** each control response **fully replaces** the
  component's local `paused` / `cursor` / `historyLength` / `mode` — no partial
  update, no merge with prior state. Combined with the client's last-write-wins
  posture (no debounce, D-16309), the UI always reflects the latest response
  received.
- // why: prevents the service from drifting into a de-facto store and creating
  a second source of truth for playback state alongside the component; full-replace
  keeps the bar deterministic and avoids drift from incremental patching.

### Control bar state + display predicates

- Bar state (`paused`, `cursor`, `historyLength`, `mode`) is seeded from the
  `getStatus` probe and updated from each control response.
- **`isRewound = cursor < historyLength - 1`** — drives the REWIND affordance
  (the spectator is viewing a historical frame, not the live edge). Distinct
  from `mode`.

#### `mode` vs `isRewound` (Locked Semantics)

`mode` and `isRewound` are **independent axes** and MUST NOT be conflated —
`mode` is *control* state (server-owned); `isRewound` is *view/timeline* state
(client-derived).

- `mode` = CONTROL state, read directly from the response (D-16304):
  - `'live'` → autoplay loop is running.
  - `'paused'` → autoplay loop is gated.
- `isRewound` = VIEW state, derived client-side:
  - `true` → `cursor < historyLength - 1` (viewing a historical frame).
  - `false` → `cursor === historyLength - 1` (at the live edge).
- The four combinations are all valid (the client must not assume any are
  impossible):

  | `mode` | `isRewound` | Meaning |
  |---|---|---|
  | `paused` | `false` | paused at the live edge |
  | `paused` | `true` | paused while viewing history (the typical rewind state) |
  | `live` | `false` | normal autoplay |
  | `live` | `true` | transient only — the next live broadcast resets the cursor to the live edge (D-16301) |

<!-- why: prevents conflating playback control (mode) with timeline position
(isRewound) — e.g. assuming `mode === 'paused'` implies rewound, or that `mode`
encodes view state. The REWIND affordance keys on isRewound alone. -->

`mode` is **never** a value other than `'live' | 'paused'` — there is no
`'rewind'` mode (WP-163 D-16304 as-built). REWIND is presentation derived from
`isRewound`, never from `mode`.

### Status-probe gating + retry (D-16501 / WP-165 transient-404 caveat)

- **`matchId` required (Locked):** `matchId` is required for autoplay behavior.
  If the prop is `undefined` / `null` / empty, `getStatus` MUST NOT be called and
  the bar MUST NOT render. // why: avoids an invalid `…/undefined/status` request
  and an inconsistent gating state (the live route always supplies `matchID`, so
  this is a defensive boundary guard).
- On mount with a present `matchId` prop, call `getStatus(matchId)`.
- A `200` (non-null) result ⇒ autoplay match: show the bar and seed initial
  state.
- **A thrown `getStatus` error (non-404 / network — see the resolution
  contract) ⇒ the bar remains hidden and the error is surfaced (console / test
  harness); it is NEVER treated as "not an autoplay match."** A thrown error is
  distinct from a `null` result.
- A `null` (`404`) result on the **first** probe ⇒ retry **exactly once** after
  `STATUS_RETRY_DELAY_MS = 1000` ms. The retry is bounded:
  - If the second attempt resolves a `200` (non-null) ⇒ autoplay match: show the
    bar and seed state (recovered from a transient init `404`).
  - If the second attempt also resolves `null` ⇒ autoplay is considered
    **absent**: the bar **remains hidden**. **No further retries are allowed.**
  - A thrown error (non-404 / network — see the `getStatus` resolution contract)
    is **not** a `null`: it does not count as the bounded retry outcome and is
    not swallowed into "not autoplay" (surface/log it; leave the bar hidden).
- `getStatus` itself stays a single request; the retry lives in the mount/gating
  logic. // why: a fixed single retry prevents an unbounded retry loop or
  oscillating bar visibility while still absorbing the WP-165 transient-init 404.
- This single retry is a **defensive guard**: WP-163 registers the controller
  before the autoplay-create response returns, so a stable `404` normally means
  "not autoplay" — but the retry prevents a false-negative if controller
  registration timing ever shifts. The bar defaults hidden until a `200`, so a
  normal match never flickers (the retry runs in the background; the bar was
  never shown).

### Disabled-when matrix (verbatim)

| Control | Disabled when |
|---|---|
| `step-back` | `cursor === 0` OR `!paused` |
| `step-forward` | `!paused` |
| `restart` | `!paused` OR `historyLength === 0` |
| `go-to-end` | game is over (from the live `useUiStateStore` snapshot) |
| pause/resume toggle | shows `pause` when `!paused`; `resume` when `paused` |

- **Game-over source (Locked):** game-over MUST be read from the
  `useUiStateStore` snapshot (the engine-derived live state). The component reads
  it **passively** — it MUST NOT compute, infer, or re-derive game-over from any
  other field. // why: game-over is engine truth; duplicating that logic on the
  client would create a second, drift-prone definition.

### Live-broadcast-wins (D-16301)

A Socket.IO broadcast arriving after a rewind unconditionally overwrites the
injected snapshot. No merge, no reconciliation on the client.

- **Overwrite mechanism (Locked):** the overwrite happens in the **existing**
  live ingestion path — `apps/arena-client/src/client/bgioClient.ts` calls
  `useUiStateStore().setSnapshot(currentUIState)` on every board update. This WP
  **MUST NOT** modify that path (`bgioClient.ts` is out of scope and must not
  appear in `git diff --name-only`).
- Injected rewind snapshots are therefore **temporary**: the next live broadcast
  always replaces them via the same `setSnapshot` store seam the autoplay service
  writes to, so both paths share one ingestion surface and cannot disagree on
  shape. // why: makes the "live wins" behavior traceable to the concrete
  existing write site rather than an abstract "transport path."

---

## Non-Negotiable Constraints

- Tests are `.test.ts` (arena-client runner globs `src/**/*.test.ts` via
  `node:test` + `@legendary-arena/vue-sfc-loader`).
- Single ingestion path: the service is the only new non-test caller of
  `setSnapshot`; no component / page calls it directly.
- No direct `fetch` outside the service; components/pages call service functions.
- No `@legendary-arena/game-engine/setup` import anywhere in `apps/arena-client`
  (D-14401).
- `uiState.ts` reused unchanged; no new Pinia store.
- No debounce / throttle (D-16309). `mode` read directly (D-16304).
- The bar renders only when `getStatus` resolved `200` (autoplay match).

---

## Acceptance Criteria

- [ ] `autoplayPlayback.ts` exposes `getStatus` + the six controls; all paths
      via `buildApiUrl`; `setSnapshot` called iff `uiState` truthy.
- [ ] `AutoplayControls.vue` renders 5 buttons + pause/resume toggle with the
      disabled matrix; REWIND affordance visible iff `isRewound`; no `fetch`, no
      store import.
- [ ] `matchId` is drilled `App.vue` → `PlayViewport.vue` → `PlayDesktop.vue`
      (additive prop only; `App.vue` `parseQuery` / routing unchanged).
- [ ] `PlayDesktop.vue` mounts the bar only when `getStatus(matchId)` resolves
      non-null; seeds initial state from the probe.
- [ ] Gating is covered by tests: bounded retry (initial `null` → retry → `null`
      ⇒ bar hidden, no third attempt; initial `null` → retry → `200` ⇒ bar shown);
      `getStatus` throws ⇒ bar stays hidden (NOT coerced to "not autoplay");
      `matchId` absent ⇒ `getStatus` not called + bar not rendered. (Extract the
      gating decision into a testable unit if mounting the full page is impractical.)
- [ ] Live broadcast overwrites rewound state (no client merge): an injected
      rewind snapshot is replaced when `bgioClient.ts` next calls `setSnapshot`
      — `bgioClient.ts` is unchanged.
- [ ] `rg "game-engine/setup" apps/arena-client/src` → zero.
- [ ] `setSnapshot` called from exactly one new non-test site
      (`autoplayPlayback.ts`); `uiState.ts` not in the diff.
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test`
      passes.

## Verification Steps

```bash
pnpm -r build
pnpm --filter @legendary-arena/arena-client test
rg -n "game-engine/setup" apps/arena-client/src                       # → zero
# setSnapshot: the ONE new non-test caller is autoplayPlayback.ts. Pre-existing
# callers (client/bgioClient.ts, main.ts, components/replay/ReplayInspector.vue)
# + the uiState.ts definition are unchanged — none added or removed by this WP.
rg -n "setSnapshot" apps/arena-client/src/services/autoplayPlayback.ts   # → ≥1 (the sole new invocation site)
rg -n "fetch\(" apps/arena-client/src/components/AutoplayControls.vue # → zero
git diff --name-only | rg "uiState.ts|client/bgioClient.ts"           # → no match (both unchanged)
git diff --name-only | rg "App.vue|PlayViewport.vue"                  # → both present (additive matchId prop drill)
rg -n "parseQuery" apps/arena-client/src/App.vue                      # → unchanged count vs main (no parseQuery edit)
rg -n "buildApiUrl\(" apps/arena-client/src/services/autoplayPlayback.ts  # → 7 (status + 6 controls)
```

## Definition of Done

1. `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test`
   passes.
2. Service, component, `matchId` prop-drill (`App.vue` → `PlayViewport.vue` →
   `PlayDesktop.vue`), and `PlayDesktop.vue` mount implemented per Scope (In).
3. Bar gated on `getStatus(matchId)` 200; REWIND affordance keyed on `isRewound`.
4. Single `setSnapshot` new site (`autoplayPlayback.ts`); `uiState.ts` and
   `client/bgioClient.ts` unchanged; `App.vue` change is the additive prop bind
   only (no `parseQuery` change); no `game-engine/setup` import; no direct
   `fetch` in the component.
5. `docs/ai/STATUS.md`, `WORK_INDEX.md` (WP-164 `[x]`), `EC_INDEX.md` (EC-181
   Done), `05-ROADMAP-MINDMAP.md` updated.

---

## Decisions Consumed (no new decisions)

WP-164 introduces no new `D-NNNNN` entries; it consumes:

- **D-16304** — `mode` is authoritative and read directly (`'live' | 'paused'`).
- **D-16301** — live broadcast wins over a REST rewind overlay.
- **D-16309** — no client debounce/throttle.
- **D-16501** — autoplay detection via the `GET …/status` probe (WP-165).
- **D-16101** — API URLs via `buildApiUrl`.
- **D-14401** — no `game-engine/setup` import on the client.

---

## Anti-Patterns to Avoid

- Do NOT render the bar based on `?match` presence — gate on `getStatus` 200.
- Do NOT treat the first `404` as definitive — retry once after
  `STATUS_RETRY_DELAY_MS` before hiding the bar (transient-init guard).
- Do NOT retry more than once, and do NOT loop the probe — the retry is bounded
  to exactly one attempt; a second `null` is final.
- Do NOT coerce a non-404 `getStatus` failure (`500` / network) to `null` — that
  would mask a real fault as "not autoplay"; let it throw.
- Do NOT key the REWIND affordance on `mode === 'rewind'` — that value does not
  exist; use `isRewound = cursor < historyLength - 1`.
- Do NOT recompute `mode` from `cursor`/`historyLength`, or assume `mode` and
  `isRewound` are linked (they are independent axes).
- Do NOT compute / infer game-over on the client — read it passively from the
  `useUiStateStore` snapshot.
- Do NOT store playback state (`paused`/`cursor`/`historyLength`/`mode`) in the
  service — the component owns it; the service is stateless.
- Do NOT call `setSnapshot` from a component/page, with `null`, or when
  `uiState` is absent; do NOT transform/merge the injected `uiState`.
- Do NOT add merge/reconciliation for rewound vs. live state, or modify
  `client/bgioClient.ts` (the existing live overwrite path).
- Do NOT import `useUiStateStore` into `AutoplayControls.vue`, or `fetch`
  directly from it.
- Do NOT edit `uiState.ts`, add a Pinia store, or import `game-engine/setup`.
- Do NOT add a `parseQuery` change, a `?autoplay` query key, or new route state
  to `App.vue` — the only permitted `App.vue` edit is the additive `:match-id`
  prop bind (D-16501).
- Do NOT read `matchId` from a store/composable in `PlayDesktop.vue` — it is
  prop-drilled `App.vue` → `PlayViewport.vue` → `PlayDesktop.vue` (no store
  carries it).
- Do NOT call `getStatus` or render the bar when `matchId` is missing
  (`undefined` / `null` / empty) — guard first.
- Do NOT partial-update or merge the bar's local `paused`/`cursor`/
  `historyLength`/`mode` — each control response fully replaces them.
- Do NOT surface a thrown `getStatus` error as "not an autoplay match" — keep the
  bar hidden and surface the error; only a `null` (404) means "not autoplay."

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Bar appears in a normal PvP match | Gated on `?match` instead of the `getStatus` probe |
| Bar never appears for a valid autoplay match | Treated the first transient `404` as definitive — no single retry |
| REWIND indicator never shows | Keyed on the non-existent `mode === 'rewind'` instead of `isRewound` |
| Rewind state flickers back to live mid-step | Client added merge/reconciliation instead of letting the broadcast win (D-16301) |
| `setSnapshot` called with null/undefined | Injection branch missing the truthiness guard |
| Build fails on a forbidden import | `game-engine/setup` pulled in for a type (D-14401) |
| `matchId` is `undefined` in `PlayDesktop.vue` (bar never probes) | Prop not drilled through `PlayViewport.vue`, or `App.vue` `:match-id` bind omitted |
| Bar hidden during a real server outage / never recovers | A non-404 `getStatus` fault (`500`/network) coerced to `null` instead of thrown |
| Probe retries indefinitely / bar visibility oscillates | Retry not bounded to exactly one attempt |
| REWIND shows/clears at the wrong time | `mode` and `isRewound` conflated instead of treated as independent axes |
| `go-to-end` enable state wrong at game end | Game-over computed on the client instead of read from the `useUiStateStore` snapshot |

---

## Pre-Flight Verdict

**READY TO EXECUTE** (re-run 2026-05-19 against `origin/main = b39f17b`,
post-WP-165). All dependencies are Done on `main` (WP-061, WP-163, WP-165,
WP-161). All cited symbols verified present: `buildApiUrl` (`apiBaseUrl.ts:44`),
`setSnapshot(next: UIState | null)` (`uiState.ts:35`), the status route
(`autoplay.mjs:352`), the live-overwrite site (`bgioClient.ts:197`). Contract
fidelity confirmed: `200` envelope `{ ok, paused, historyLength, cursor, mode }`
(no `uiState`), `404` not-found envelope, `mode ∈ { 'live', 'paused' }`.

**Resolved blocker (was the prior NOT-READY):** the original draft assumed
`PlayDesktop.vue` already had `matchID`. It does not — the live tree is
`App.vue → PlayViewport.vue → PlayDesktop.vue` and only `submit-move` is passed
down, with no store carrying `matchID`. The fix is an **additive `matchId`
prop-drill** through both intermediate layers (Scope (In)); `App.vue`'s
`parseQuery` / routing stays unchanged, so D-16501 is intact. Scope (Out),
the file allowlist, and the EC were corrected to match. No open items remain.

## Copilot Check Verdict

**PASS.** High-risk modes are mitigated: hidden-info leak (server-side
`filterUIStateForAudience`, WP-163 D-16303 — the client only paints what the
server returns); dual-path desync (D-16301 live broadcast wins, single ingestion
path through `setSnapshot`); layer leak (D-14401 grep gate); store erosion
(`uiState.ts` + `bgioClient.ts` excluded from the diff). The `matchId` prop-drill
is the one watch-item — bounded to an additive prop on `App.vue` /
`PlayViewport.vue` / `PlayDesktop.vue` with no `parseQuery` change, verified by
the `parseQuery`-unchanged grep gate.

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | Single WP per session | PASS (paired-draft with WP-165; one execution session each) |
| 2 | Dependency discipline | PASS — hard-deps WP-163 / WP-165 / WP-161 / WP-061 all Done on `main` (`b39f17b`) |
| 3 | Review gate | N/A — draft |
| 4 | Layer boundary | PASS — `apps/arena-client/**` only |
| 5 | File count | PASS — 5 source (2 new + 3 mod: `PlayDesktop.vue`, `PlayViewport.vue`, `App.vue` additive prop) + 2 tests + governance |
| 6 | Contract stability | PASS — consumes WP-163/165; no contract redefinition |
| 7 | Auth posture | N/A — consumes `guest` endpoints |
| 8 | Determinism | N/A — no engine code |
| 9 | Persistence boundary | PASS — no storage; reuses `setSnapshot` |
| 10 | Test coverage | PASS — service + component `.test.ts` |
| 11 | Error handling | PASS — `getStatus` null-on-404; full-sentence messages |
| 12 | Code style (00.6) | PASS — ESM, full words |
| 13 | Module system | PASS — ESM |
| 14 | Naming | PASS — `isRewound`, `getStatus` descriptive |
| 15 | Comments | PASS — `// why:` sites enumerated in EC-181 |
| 16 | Drift detection | N/A |
| 17 | Vision alignment | PASS — spectator UX; no PvP-interaction terms |
| 18 | Pre-planning | N/A |
| 19 | Replay safety | N/A |
| 20 | Funding surface gate | N/A |
| 21 | API catalog (D-11804) | N/A — consumes endpoints; adds none |
