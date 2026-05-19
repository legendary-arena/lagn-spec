# WP-164 — Autoplay Playback Controls (Client)

**Status:** Draft
**Primary Layer:** Client (`apps/arena-client/src/`)
**Dependencies:** WP-163 (autoplay server controls) — Done 2026-05-19; **WP-165
(autoplay status endpoint) — hard-dep, must land on `main` first**; WP-161
(`apiBaseUrl` / `buildApiUrl` helper, D-16101) — Done; WP-061 (UIState store) — Done
**Paired with:** WP-165 (server status endpoint).
**EC:** EC-181
**Baseline:** `origin/main` at `39c06c2` (drafted 2026-05-19); verify HEAD at execution.

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
  `main` and returns the `{ ok, paused, historyLength, cursor, mode }` envelope
  (`200`) or the not-found envelope (`404`). **WP-164 is BLOCKED until WP-165
  merges.**
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
  URL is `?match=…&player=0&credentials=…` (`LobbyView.startAutoplay`), so the
  live route mounts with `matchID` available.

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
- **`apps/arena-client/src/services/autoplayPlayback.test.ts`** (new) — setter
  invoked iff `uiState` present; `mode` passed through unchanged; each function
  posts/gets the correct path via `buildApiUrl`; `getStatus` returns `null` on
  `404`.
- **`apps/arena-client/src/components/AutoplayControls.vue`** (new) — five
  buttons + one pause/resume toggle (glyphs `⏮ ⏪ ⏸/▶ ⏩ ⏭`); disabled-when
  matrix (below); visible REWIND affordance when `isRewound`; NO direct `fetch`;
  NO `useUiStateStore` import.
- **`apps/arena-client/src/components/AutoplayControls.test.ts`** (new) —
  disabled matrix; REWIND toggles with `isRewound`; each button calls the
  matching service function; component never calls `setSnapshot`.
- **`apps/arena-client/src/pages/PlayDesktop.vue`** (modified) — on mount, when
  `matchID` is present, call `getStatus(matchID)`; on an initial `null` (404),
  retry once after `STATUS_RETRY_DELAY_MS` (1000 ms) before deciding. Mount
  `<AutoplayControls :matchId="matchID" :initialStatus="status" />` only when a
  probe resolves `200` (non-null); a persistent `null` keeps the bar hidden.
  Seed the bar's initial `paused` / `cursor` / `historyLength` / `mode` from the
  status response.
- **Governance:** `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md`
  (WP-164 row), `docs/ai/execution-checklists/EC_INDEX.md` (EC-181 row),
  `docs/05-ROADMAP-MINDMAP.md`.

## Scope (Out)

- **Server code** — WP-163 / WP-165.
- **`LobbyView.vue` / `App.vue`** — unchanged; the status probe gates the bar,
  so no `?autoplay` URL marker and no `parseQuery` change is needed (D-16501).
- **`uiState.ts` or any Pinia store** — reuse `setSnapshot`; no new store, no
  store edit. `uiState.ts` must NOT appear in `git diff --name-only`.
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
- After any control response, if `response.uiState` is truthy, call
  `useUiStateStore().setSnapshot(response.uiState)`. When absent, do **not** call
  the setter.
- `mode` is read directly from the response; never recomputed.

### Control bar state + display predicates

- Bar state (`paused`, `cursor`, `historyLength`, `mode`) is seeded from the
  `getStatus` probe and updated from each control response.
- **`isRewound = cursor < historyLength - 1`** — drives the REWIND affordance
  (the spectator is viewing a historical frame, not the live edge). Distinct
  from `mode`.

### Status-probe gating + retry (D-16501 / WP-165 transient-404 caveat)

- On mount with a `matchID`, call `getStatus(matchID)`.
- A `200` (non-null) result ⇒ autoplay match: show the bar and seed initial
  state.
- A `null` (`404`) result on the **first** probe ⇒ retry **once** after
  `STATUS_RETRY_DELAY_MS = 1000` ms. Only a **second** `null` is treated as "not
  an autoplay match" (the bar stays hidden). `getStatus` itself stays a single
  request; the retry lives in the mount/gating logic.
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

### Live-broadcast-wins (D-16301)

A Socket.IO broadcast arriving after a rewind unconditionally overwrites the
injected snapshot through the existing transport ingestion path. No merge, no
reconciliation on the client.

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
- [ ] `PlayDesktop.vue` mounts the bar only when `getStatus` resolves non-null;
      seeds initial state from the probe.
- [ ] Live broadcast overwrites rewound state (no client merge).
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
rg -n "setSnapshot" apps/arena-client/src --glob '!**/*.test.ts'      # → uiState.ts def + 1 new site (autoplayPlayback.ts)
rg -n "fetch\(" apps/arena-client/src/components/AutoplayControls.vue # → zero
git diff --name-only | rg "uiState.ts"                                # → no match
rg -n "buildApiUrl\(" apps/arena-client/src/services/autoplayPlayback.ts  # → 7 (status + 6 controls)
```

## Definition of Done

1. `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test`
   passes.
2. Service, component, and `PlayDesktop.vue` mount implemented per Scope (In).
3. Bar gated on `getStatus` 200; REWIND affordance keyed on `isRewound`.
4. Single `setSnapshot` new site; `uiState.ts` unchanged; no
   `game-engine/setup` import; no direct `fetch` in the component.
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
- Do NOT key the REWIND affordance on `mode === 'rewind'` — that value does not
  exist; use `isRewound = cursor < historyLength - 1`.
- Do NOT recompute `mode` from `cursor`/`historyLength`.
- Do NOT call `setSnapshot` from a component/page, with `null`, or when
  `uiState` is absent.
- Do NOT add merge/reconciliation for rewound vs. live state.
- Do NOT import `useUiStateStore` into `AutoplayControls.vue`, or `fetch`
  directly from it.
- Do NOT edit `uiState.ts`, add a Pinia store, or import `game-engine/setup`.

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

---

## Pre-Flight Verdict

**NOT READY (BLOCKED on WP-165).** Scope, contract, and locked values are
resolved and consistent with the as-built WP-163 surface. The single hard
blocker is WP-165 (the status endpoint) not yet on `main`. Once WP-165 merges,
re-run pre-flight; the verdict flips to READY (no other open items). One item
to confirm at execution: how `PlayDesktop.vue` receives `matchID` (App.vue live
route props vs. a direct `parseQuery` read) — `match` is parsed in
`App.vue:parseQuery` today.

## Copilot Check Verdict

**PASS (pending the WP-165 dependency).** High-risk modes are mitigated:
hidden-info leak (server-side `filterUIStateForAudience`, WP-163 D-16303 — the
client only paints what the server returns); dual-path desync (D-16301 live
broadcast wins, single ingestion path through `setSnapshot`); layer leak
(D-14401 grep gate); store erosion (`uiState.ts` excluded from the diff). No new
RISK beyond the WP-165 sequencing dependency.

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | Single WP per session | PASS (paired-draft with WP-165; one execution session each) |
| 2 | Dependency discipline | BLOCKED — hard-dep WP-165 must land first (parked accordingly) |
| 3 | Review gate | N/A — draft |
| 4 | Layer boundary | PASS — `apps/arena-client/**` only |
| 5 | File count | PASS — 3 source (2 new + 1 mod) + 2 tests + governance |
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
