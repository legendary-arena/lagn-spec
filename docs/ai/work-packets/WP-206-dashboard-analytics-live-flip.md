# WP-206 — Dashboard Analytics MOCK→LIVE Flip (Client / Cookie-Authenticated Fetch)

## Goal

Flip the three operator-dashboard analytics widgets (`TrafficSourcesWidget`,
`ActivationFunnelWidget`, `RetentionCohortsWidget`) from MOCK mode to LIVE
mode by swapping the `fetchTrafficSources` / `fetchActivationFunnel` /
`fetchRetentionCohorts` exports in `apps/dashboard/src/services/mocks.ts`
from the existing mock factories to real-HTTP fetch wrappers that hit
WP-205's 3 GET endpoints (`/api/analytics/traffic-sources`,
`/api/analytics/activation-funnel`, `/api/analytics/retention-cohorts`)
and re-envelope the bare server `{ data: T[] }` response into
`ServiceResponse<T>` with `source: 'LIVE'` + `updatedAt: Date.now()`
captured at fetch RESPONSE time.

Operator-visible outcome: each of the 3 analytics widgets renders the
`LIVE` source badge instead of `MOCK`. Until per-app client emission
WPs land (separate future work — arena-client signups, marketing-site
visitor attribution, registry-viewer referrals), the `analytics_events`
table is empty, so each widget's 4-state Widget Contract drops to the
`empty` arm with a freshness chip reading `LIVE · just now`. This is
the intended steady state until events flow.

The flip is gated by `import.meta.env.VITE_USE_MOCKS !== 'true'`:
production CF Pages env carries `VITE_USE_MOCKS=true` today (deliberately,
per DOMAINS.md §dashboard), and the operator flips it to `false`
post-merge to take LIVE mode live. Local-dev + test runs (where the env
var is unset) default to MOCK to preserve the current dev ergonomics.

> **Invariant:** widget files contain ZERO HTTP-fetch logic — the
> `services/mocks.ts` re-export seam is the sole MOCK↔LIVE boundary.
> `TrafficSourcesWidget.vue` / `ActivationFunnelWidget.vue` /
> `RetentionCohortsWidget.vue` are byte-identical pre/post flip
> (the WP-203 §Composable Source Contract upgrade-path invariant
> carry-forward; verified by close-out `git diff --name-only` on
> the three widget files returning empty).

> **Terminology convention.** "MOCK mode" = the existing `analyticsMocks.ts`
> factories produce the data (current default). "LIVE mode" = the new
> `analyticsLiveFetchers.ts` async fetch wrappers produce the data
> (gated on `VITE_USE_MOCKS !== 'true'` + `VITE_API_BASE_URL` set).
> "LIVE-flip seam" = the conditional re-export in `mocks.ts`. "Empty
> sentinel" = the initial-state `ServiceResponse<T>` returned by a
> LIVE fetcher BEFORE the network fetch resolves (carries
> `data: []`, `source: 'LIVE'`, `updatedAt: Date.now()`).

---

## Assumes

- **WP-205 ✅ (hard-dep — server endpoints).** Migration
  `017_create_analytics_events.sql` + 3 GET endpoints
  (`/api/analytics/traffic-sources`, `/api/analytics/activation-funnel`,
  `/api/analytics/retention-cohorts`) + the locked
  `{ data: readonly T[] }` envelope landed at `4b245d7` (post-PR #200
  squash-merge). Each GET is `authenticated-session-required` per
  D-20503 and SQL-pre-sorted ASC per D-20501.
- **WP-203 ✅ (hard-dep — dashboard composables + widgets +
  Composable Source Contract).** The 3 composables
  (`useTrafficSources` / `useActivationFunnel` / `useRetentionCohorts`)
  accept `() => ServiceResponse<readonly T[]>` per D-20302 carry-forward;
  the 3 widgets import `fetchX` re-export aliases from `mocks.ts` and
  contain ZERO literal `mockX` tokens (verified by WP-203 close-out
  grep). This WP swaps the `mocks.ts` re-exports without touching the
  composables OR the widgets.
- **WP-197 ✅ (hard-dep — deploy posture + dashboard auth).** Dashboard
  surface is `authenticated-session-required` per D-19702; CF Pages
  Production env carries `VITE_USE_MOCKS=true` today and is flipped to
  `false` by the operator post-WP-206-merge. The dashboard runs in the
  operator's Hanko-authenticated browser session per WP-131; LIVE
  fetches reuse the same-origin-equivalent session via
  `credentials: 'include'` (cookie-bound auth) on cross-origin requests
  from `dashboard.legendary-arena.com` to `api.legendary-arena.com`.
- **WP-131 ✅ + WP-126 ✅ (Hanko verifier).** Production server wires
  `requireAuthenticatedSession` against a real `SessionVerifier` per
  D-13101; the 3 GET endpoints' auth gate is genuine in production
  (not the dev-mode 'session_verifier_not_configured' fallback).
- **WP-118 ✅ (api-endpoints catalog).** The 4 analytics rows
  (`POST /api/analytics/events` + 3 GETs) are already on the catalog
  per the WP-205 close. This WP does NOT add rows; it consumes the
  3 GET rows from the client side. No catalog edit needed per D-11804
  (the catalog tracks server-registered routes — this is a client-side
  consumer change).
- **DOMAINS.md alignment.**
  [docs/ops/DOMAINS.md §dashboard](../../ops/DOMAINS.md) explicitly
  anticipates this WP — line 208: `"VITE_API_BASE_URL is deliberately
  not set — the dashboard ships in mock mode and makes zero HTTP calls
  to api.legendary-arena.com until the real-data wiring WP lands."`
  WP-206 IS the real-data wiring WP for the 3 analytics widgets.
- **`docs/ai/DECISIONS.md` reservation (drafted at WP-206 drafting
  time; flips Reserved → Active at execution close):**
  - **D-20601** — LIVE-flip posture: (a) async fetch wrappers cache
    the in-flight `ServiceResponse<T>` per `(range)` (or
    `(cohortCount)`) key in a module-level `ref` so the composable's
    synchronous `() => ServiceResponse` getter contract is preserved;
    Vue reactivity propagates fetch completion to the widget;
    (b) `source: 'LIVE'` and `updatedAt: Date.now()` are captured at
    the network RESPONSE time, NOT at sentinel-emission time
    (sentinel uses `Date.now()` at emission, then gets overwritten on
    fetch resolve); (c) fetch failure (network error, 4xx, 5xx,
    invalid JSON) collapses to the empty sentinel (`data: []`) and
    the widget renders its existing `empty` arm — operator-visible
    error display deferred to a future error-UX WP; (d) auth uses
    `credentials: 'include'` cookie-bound session — no Bearer header
    construction at the dashboard layer; (e) `VITE_USE_MOCKS !==
    'true'` is the LIVE gate; missing `VITE_API_BASE_URL` while in
    LIVE mode falls back to MOCK with a one-shot `console.warn` per
    process for local-dev ergonomics.
- **Repo posture.** Single-repo (`apps/dashboard/` only with one
  surgical CORS-allowlist line added to `apps/server/src/server.mjs`).
  No engine, registry, preplan, or migration code touched. No new npm
  dependencies (uses the browser's built-in `fetch`).
- **Drafting baseline:** `origin/main @ 4b245d7` (post-WP-205 close;
  PR #200 squash-merged 2026-06-04).

---

## Context (Read First)

> **Line-number references are advisory at drafting time.** Re-verify
> with `grep -n` if `main` has moved between draft and execute.

- **WP-205**
  (`docs/ai/work-packets/WP-205-analytics-events-server.md` §Downstream)
  — explicitly anticipates this WP: `"Dashboard MOCK→LIVE flip —
  single-file edit to apps/dashboard/src/services/mocks.ts swapping
  fetchX re-exports from mock factories to a real HTTP fetch wrapper
  that hits the 3 new GET endpoints + wraps the bare { data: T[] }
  envelope into ServiceResponse<T> with source: 'LIVE' + updatedAt:
  Date.now() at the call site. Small follow-up WP; ~1 file + tests."`
  WP-206 is that "small follow-up WP" — actual surface is 3 files
  (new `analyticsLiveFetchers.ts` + edited `mocks.ts` + 1-line server
  CORS edit) + 1 test file.
- **WP-203**
  (`docs/ai/work-packets/WP-203-dashboard-acquisition-activation-retention.md`
  §Composable Source Contract) — locks the 3 composables' contract at
  `() => ServiceResponse<readonly T[]>` so the LIVE flip is a pure
  getter substitution. WP-203 close-out grep verified widget files
  contain ZERO literal `mockX` tokens; this WP preserves that gate.
- **WP-197 / D-19702**
  (`docs/ai/DECISIONS.md §D-19702`) — initial production deploy ships
  with `VITE_USE_MOCKS=true`; real-data wiring is per-widget-domain
  follow-up WPs. WP-206 is the analytics-domain follow-up.
- **`apps/dashboard/src/services/mocks.ts`** (lines 15-34) — current
  `mocks.ts` re-exports `mockX` aliases AND `fetchX` aliases from
  `analyticsMocks.ts`. The dual-export pattern (per D-20302) lets
  tests import `mockX` directly while widgets import the abstracting
  `fetchX` alias — the alias is the LIVE-flip seam this WP swaps.
- **`apps/dashboard/src/services/analyticsMocks.ts`** — the MOCK
  factories that remain after the flip; tests continue importing
  `mockX` from `mocks.ts` (transitively re-exported), so factory-side
  determinism tests keep working unchanged.
- **`apps/dashboard/src/composables/useTrafficSources.ts`** (lines
  43-56) — composable signature `(responseGetter: () =>
  ServiceResponse<readonly TrafficSource[]>) => UseTrafficSourcesReturn`
  with `source` / `updatedAt` passthrough via `computed(() =>
  response.value.{source,updatedAt})`. The Vue reactivity tracks the
  underlying `Ref` access inside the LIVE fetcher's cache map, so
  fetch resolution propagates to the widget transparently — no
  composable-side change needed.
- **`apps/dashboard/src/widgets/TrafficSourcesWidget.vue`** (lines
  6, 32-36) — widget pattern locked: `import { fetchTrafficSources }
  from '../services/mocks.js'`; `const response = computed(() =>
  fetchTrafficSources(range.value, nowMs))`; `const breakdown =
  useTrafficSources(() => response.value)`. WP-206 changes NOTHING in
  this file (widget byte-identity invariant).
- **`apps/server/src/server.mjs`** (lines 362-370) — CORS `origins`
  array currently lists 7 hostnames (play / apex / www / pages.dev /
  cards.barefootbetters / cards.legendary-arena / localhost:5173).
  WP-206 adds an 8th entry: `'https://dashboard.legendary-arena.com'`
  + `'http://localhost:4173'` (Vite dashboard dev port). This is
  the one Server-layer edit in this WP — surgical 2-line array
  insertion; no logic change.
- **`apps/dashboard/src/env.d.ts`** + **`apps/dashboard/.env.example`**
  — `VITE_API_BASE_URL` + `VITE_USE_MOCKS` already declared. No
  schema change needed; this WP consumes both.
- **`docs/ops/DOMAINS.md §dashboard`** (lines 201-221) — names
  `dashboard.legendary-arena.com` as the operator dashboard's live
  host; explicitly anticipates this WP's existence.
- **`.claude/rules/{architecture,code-style,work-packets}.md`** —
  dashboard layer + server layer the only crossings. Per `code-style`
  no `Math.random`, no `localeCompare`, full English names, JSDoc on
  every function, `// why:` on the LIVE-flip seam + the CORS array
  edit + the empty-sentinel emission.

---

## Why now

WP-205 just shipped (PR #200, 2026-06-04). The server endpoints are
live and reachable; the dashboard widgets are still showing MOCK data.
The MOCK→LIVE flip is the natural next step that activates the
end-to-end pipeline operator → dashboard → API → DB → dashboard. Even
though `analytics_events` is empty until per-app client emission
lands, flipping to LIVE now (a) proves the wiring works end-to-end in
production; (b) lets the operator see the freshness chip transition
from `MOCK · 12s ago` to `LIVE · just now` when events start flowing
(no widget redeploy needed); (c) preempts the alternative where each
per-app emission WP would individually have to verify "does my
endpoint actually surface in the dashboard?" by leaving the LIVE
plumbing already in place.

The Composable Source Contract pattern (D-19607 / D-20302) was
specifically designed for this moment — widget templates are
byte-identical pre/post flip, so the operator can review the actual
diff (~3 small files) without worrying about template regressions.

Deferring this WP keeps the dashboard in a "looks live but is
actually mocked" state indefinitely, which is a slow-burn governance
debt: every subsequent dashboard widget added will have to decide
whether to mock or wire, with no precedent established for the wire
path. WP-206 sets that precedent.

---

## Scope (In)

### New file (1)

- **`apps/dashboard/src/services/analyticsLiveFetchers.ts`** — exports
  `fetchTrafficSourcesLive(range, nowMs)`,
  `fetchActivationFunnelLive(range, nowMs)`,
  `fetchRetentionCohortsLive(cohortCount, nowMs)` (and `_Live` suffix
  is deliberate — the unsuffixed `fetchX` exports in `mocks.ts` are
  the public-to-widgets seam; this file is the LIVE implementation
  detail). Each:
  - Maintains a module-level `Map<key, Ref<ServiceResponse<T>>>` cache
    keyed by the input parameter (`range` string OR `cohortCount`
    number). Vue's `ref()` wraps the `ServiceResponse` so subsequent
    composable evaluations see fetch completion reactively.
  - First call for a given key: creates the cache entry with an empty
    sentinel (`data: []`, `source: 'LIVE'`, `updatedAt: Date.now()`),
    kicks off the async fetch via a fire-and-forget closure.
  - Subsequent calls for the same key: return the cached `ref.value`
    immediately (which may or may not have been updated by a resolved
    fetch). The Vue reactivity makes the widget update when the value
    changes.
  - On fetch resolve with HTTP 200 + valid JSON shape: updates the
    cached ref to `{ data: payload.data, source: 'LIVE', updatedAt:
    Date.now() }`.
  - On fetch failure (network error, non-200 status, JSON parse
    error, payload shape mismatch): leaves the empty sentinel in
    place, optionally emits a debug `console.warn` (gated on
    `import.meta.env.DEV`). Operator sees the `empty` arm with `LIVE`
    badge — error UX is a future hardening WP.
  - URL composed via `import.meta.env.VITE_API_BASE_URL + '/api/analytics/...'`.
    If `VITE_API_BASE_URL` is missing or empty, emit a one-shot
    `console.warn` per process and return the empty sentinel
    (graceful local-dev fallback).
  - Fetch options: `{ credentials: 'include', headers: { 'Accept':
    'application/json' } }` for cookie-bound cross-origin auth.

### Modified file (1) — `apps/dashboard/src/services/mocks.ts`

- The 3 `fetchX` re-exports change from:
  ```typescript
  export {
    mockTrafficSources as fetchTrafficSources,
    mockActivationFunnel as fetchActivationFunnel,
    mockRetentionCohorts as fetchRetentionCohorts,
  } from './analyticsMocks.js';
  ```
  to a conditional re-export block gated on `import.meta.env.VITE_USE_MOCKS`:
  ```typescript
  // why: D-20601 LIVE-flip seam — VITE_USE_MOCKS !== 'true' AND
  // VITE_API_BASE_URL set → use the LIVE fetchers (real HTTP
  // against WP-205's GET endpoints); otherwise (default + local-dev
  // + tests) fall through to the MOCK factories. The `fetchX`
  // identifier preserves widget byte-identity per WP-203 §Composable
  // Source Contract.
  const isLiveMode = import.meta.env.VITE_USE_MOCKS !== 'true'
    && typeof import.meta.env.VITE_API_BASE_URL === 'string'
    && import.meta.env.VITE_API_BASE_URL.length > 0;
  export const fetchTrafficSources = isLiveMode
    ? fetchTrafficSourcesLive
    : mockTrafficSources;
  // ... (analogous for fetchActivationFunnel + fetchRetentionCohorts)
  ```
  The `mockX` exports continue unchanged (tests + the MOCK fallback
  path still consume them).

### Modified file (1) — `apps/server/src/server.mjs`

- Add 2 entries to the CORS `origins` array:
  - `'https://dashboard.legendary-arena.com'` — production dashboard
    host per DOMAINS.md §dashboard.
  - `'http://localhost:4173'` — Vite dev server default for the
    dashboard (`pnpm --filter @legendary-arena/dashboard dev`) so
    local-dev LIVE-mode against `localhost:8080` server works
    without ceremony.
- No other origins change; no logic change; surgical 2-line array
  insertion adjacent to the existing 7-entry list with a `// why:`
  citing WP-206.

### New file (1) — `apps/dashboard/src/services/analyticsLiveFetchers.test.ts`

- node:test cases (≥ 10) covering: happy-path JSON envelope unwrap
  + ServiceResponse wrapping; `source: 'LIVE'` literal in every
  successful response; `updatedAt` captured at fetch RESPONSE time
  (not at sentinel-emission time — assertion uses a fake `now()` via
  module-level injection); per-key caching (second call with same
  key returns same ref); per-key cache miss on different key kicks
  off a second fetch; fetch failure (network reject, non-200
  status, invalid JSON, payload shape mismatch) all collapse to
  empty sentinel; missing `VITE_API_BASE_URL` returns empty
  sentinel + emits exactly ONE `console.warn` per process (one-shot
  guard); `credentials: 'include'` + `Accept: application/json` are
  set on the fetch call (verified via spy); URL construction
  appends `?range=...` for the 2 range-keyed endpoints and
  `?cohortCount=...` for the retention endpoint.

### Governance (4 files)

- **`docs/ai/STATUS.md`** — `### WP-206 / EC-234 Executed` block.
- **`docs/ai/DECISIONS.md`** — D-20601 reserved at draft; Active at
  execution close (byte-identical to EC §DECISIONS.md Verbatim Block
  per PS-1 transcription convention mirroring WP-205).
- **`docs/ai/work-packets/WORK_INDEX.md`** — flip WP-206 row to `[x]`
  with completion date.
- **`docs/ai/execution-checklists/EC_INDEX.md`** — flip EC-234 row to
  `Done`.

## Out of Scope

- **Per-app client emission.** No `apps/arena-client/`, marketing
  site, or `apps/registry-viewer/` files touched. Emission is a
  separate set of future WPs (one per emitter app) per WP-205
  §Downstream.
- **The other 3 dashboard analytics-adjacent surfaces.**
  `OpsAtAGlanceStripWidget` / `PublicSurfaceHealthWidget` /
  `ErrorRateMonitorWidget` / `InfraCostWatchdogWidget` (all from
  WP-204) stay MOCK. They depend on a paired server WP (not yet
  drafted; previously sketched as WP-206 but that slot is taken by
  this WP — re-slot when the paired ops-server WP drafts).
- **Operator-visible error UX.** Fetch failures collapse to the empty
  sentinel + the widget's existing `empty` arm. A dedicated `error`
  arm with retry CTA, structured error display, etc., is a future
  error-UX hardening WP.
- **Loading skeleton state.** Empty sentinel renders the widget's
  existing `empty` arm immediately. A dedicated `loading` arm
  (currently template-only with a CSS spinner; not state-machine
  wired) is a future polish WP.
- **Mid-flight refetch cancellation.** If the operator switches the
  date-range rapidly (14d → 30d → 90d), the older fetches resolve
  into their cache entries normally (each entry persists for the SPA
  lifetime). No `AbortController` plumbing in v1. A future
  performance WP can introduce abort-on-key-change if observed
  necessary.
- **Stale-while-revalidate cache invalidation.** Cache entries are
  populated once per key per SPA lifetime; no TTL, no
  invalidate-on-window-focus refetch. If the operator wants fresh
  data they reload the page. A future polish WP can introduce
  background refetch on a configurable interval.
- **Server-side cache headers.** WP-205 already locked
  `Cache-Control: no-store` per D-11504; this WP relies on that lock
  (intermediate proxies must not cache the GET responses).
- **`VITE_FEATURE_FLAGS` integration.** The flip is gated purely on
  `VITE_USE_MOCKS` + `VITE_API_BASE_URL`; no feature flag
  per-environment slicing in v1 (operator flips the env var in CF
  Pages to gate; full rollback is one env-var-revert away).
- **Bundle-size regression analysis.** The new fetcher file is small
  (< 2 KB minified) and is statically imported at module load; no
  dynamic-import code-splitting in v1.
- **Engine / registry / preplan / client / shared-tooling code.**
  None touched.

---

## Files Expected to Change

### New (2)

1. `apps/dashboard/src/services/analyticsLiveFetchers.ts` — **new** —
   exports 3 async fetch wrappers with Vue ref-backed sync getters;
   empty-sentinel posture; cookie-credentials; missing-env-var
   one-shot warn fallback.
2. `apps/dashboard/src/services/analyticsLiveFetchers.test.ts` —
   **new** — node:test cases (≥ 10) per §Scope (In) coverage list.

### Modified (2)

3. `apps/dashboard/src/services/mocks.ts` — **modified** — replace
   the 3 `fetchX` static re-exports with a `isLiveMode`-gated
   const-export block; no other line changes; `mockX` re-exports
   preserved byte-identical so tests + MOCK fallback paths keep
   working.
4. `apps/server/src/server.mjs` — **modified** — add 2 entries to
   the CORS `origins` array (`https://dashboard.legendary-arena.com`
   + `http://localhost:4173`) with a `// why:` block citing WP-206.

### Governance (4 modified)

5. `docs/ai/STATUS.md` — **modified** — `### WP-206 / EC-234
   Executed` block.
6. `docs/ai/DECISIONS.md` — **modified** — D-20601 (proposed →
   Active per the PS-1 verbatim-transcription convention).
7. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-206 row
   `[x]`.
8. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** —
   EC-234 row Done.

**Total: 8 files** (2 new + 2 modified source + 4 governance).

No engine / registry / preplan / arena-client / registry-viewer /
shared-tooling files changed.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**

- Full file contents for every new or modified file. **No diffs.**
- ESM only, Node v22+ (server) / Vite-bundled (dashboard).
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — full
  English names, JSDoc on every function, `// why:` on
  non-obvious decisions, no `.reduce()` with branching, explicit
  `for...of`, no `localeCompare` for ordering.
- No new npm dependencies. Browser `fetch` + Vue `ref` only.
- No `@legendary-arena/(game-engine|registry|preplan|server)` imports
  in `apps/dashboard/**`. Layer boundary preserved.

**Packet-specific (carry-forward + new):**

- **Widget byte-identity invariant (D-20302 carry-forward).**
  `git diff --name-only apps/dashboard/src/widgets/{TrafficSources,ActivationFunnel,RetentionCohorts}Widget.vue`
  returns empty at close. The 3 widget files are NOT touched —
  verified by `git status` grep AND by re-running the WP-203
  close-out widget-mock-token grep (`grep -nE "mockTrafficSources|mockActivationFunnel|mockRetentionCohorts" apps/dashboard/src/widgets/{TrafficSources,ActivationFunnel,RetentionCohorts}Widget.vue`
  returns ZERO matches).
- **Composable byte-identity invariant.** `git diff --name-only
  apps/dashboard/src/composables/{useTrafficSources,useActivationFunnel,useRetentionCohorts}.ts`
  returns empty at close. The 3 composable files are NOT touched.
- **LIVE-flip gate posture (D-20601).** `isLiveMode` is `true`
  iff BOTH `import.meta.env.VITE_USE_MOCKS !== 'true'` AND
  `typeof import.meta.env.VITE_API_BASE_URL === 'string'` AND
  `import.meta.env.VITE_API_BASE_URL.length > 0`. Any of the three
  conditions failing → MOCK fallback. Defense against the failure
  mode where production env carries `VITE_USE_MOCKS=false` but
  `VITE_API_BASE_URL` is unset (would otherwise produce a fetch
  to `undefined/api/...` and crash).
- **`source: 'LIVE'` literal-locked (D-20601).** Every successful
  fetch response wraps with the literal string `'LIVE'`. No
  `'CACHED'` variant in v1 (would require stale-while-revalidate
  semantics not yet locked).
- **`updatedAt` capture timing (D-20601).** Captured at the
  network RESPONSE time (immediately before the cached ref's
  value is replaced), NOT at sentinel-emission time. The empty
  sentinel uses `Date.now()` at the SENTINEL-emission time so
  the widget freshness chip reads `LIVE · just now` from the
  moment of widget mount; on fetch resolve the timestamp jumps
  forward by however long the fetch took.
- **Empty-sentinel error-path posture (D-20601).** Network reject /
  non-200 status / invalid JSON / payload-shape mismatch all
  collapse to the empty sentinel (`data: []`, `source: 'LIVE'`,
  `updatedAt: Date.now()`). The widget's existing `empty` arm
  renders — no template change required. Operator-visible
  structured error display is deferred to a future hardening WP.
- **Per-key cache discipline (D-20601).** The module-level cache
  is `Map<key, Ref<ServiceResponse<T>>>` where `key` is the
  range string for traffic-sources + activation-funnel, and the
  `cohortCount` number for retention-cohorts. Second call with
  the same key returns the cached ref — no redundant network
  fetch. SPA lifetime persistence; no TTL.
- **Cookie-credentials auth (D-20601).** Every `fetch` call passes
  `{ credentials: 'include', headers: { 'Accept': 'application/json' } }`.
  No Bearer header construction at the dashboard layer (the Hanko
  session cookie is bound to the dashboard's parent host per
  CF Access). The operator's authenticated browser session carries
  through transparently.
- **Server CORS allowlist update locked.** The 2 entries added to
  `apps/server/src/server.mjs` `origins` array are byte-literally
  `'https://dashboard.legendary-arena.com'` and
  `'http://localhost:4173'`. Adjacent `// why:` cites WP-206 +
  the DOMAINS.md §dashboard reference.
- **Missing-env one-shot warn posture (D-20601).** If `isLiveMode`
  is true BUT `import.meta.env.VITE_API_BASE_URL` is checked and
  somehow comes back empty mid-execution (defense), emit exactly
  one `console.warn` per process via a module-level boolean
  guard. The fixed warning message: `'[analytics] LIVE mode
  requested but VITE_API_BASE_URL is unset; falling back to MOCK.
  Set the env var in the deployment environment.'`
- **No raw error message in user-facing context (D-20601).**
  Caught errors are inspected via `instanceof Error` for the
  debug log only (gated on `import.meta.env.DEV`); the user-facing
  surface (the widget) never displays the error string.
- **No `Math.random` in `apps/dashboard/src/services/analyticsLiveFetchers.ts`.**
  Determinism scope — the fetcher's behavior is purely a function
  of (input key, network response). No randomized retry, no
  jittered backoff in v1.
- **No `localeCompare` in any new dashboard code.** Unicode
  code-unit comparison only (D-19605 / D-19908 carry-forward).
- **No new dashboard npm dependency.**
  `git diff --stat apps/dashboard/package.json pnpm-lock.yaml` empty.

**Forbidden (hard stops) — most likely traps:**

- Touching any of the 3 widget files (`TrafficSourcesWidget.vue` /
  `ActivationFunnelWidget.vue` / `RetentionCohortsWidget.vue`) —
  widget byte-identity HARD FAIL.
- Touching any of the 3 composable files — composable byte-identity
  HARD FAIL.
- `source: 'CACHED'` literal emission anywhere — v1 has no
  stale-while-revalidate, so the only valid LIVE-mode source label
  is `'LIVE'`.
- `Bearer ${token}` Authorization header construction at the
  dashboard layer — D-20601 cookie-auth posture HARD FAIL.
- `credentials: 'omit'` or `credentials: 'same-origin'` (default
  without `include`) — cross-origin cookie won't reach the API HARD
  FAIL.
- Emitting raw error messages in the widget's user-facing surface —
  D-20601 leakage gate HARD FAIL.
- Adding a TTL / `setTimeout` background refetch — out of v1 scope.
- Adding `AbortController` plumbing — out of v1 scope.
- Importing from `apps/server/src/**` into `apps/dashboard/src/**` —
  layer boundary HARD FAIL (the dashboard learns the GET endpoint
  paths via the api-endpoints catalog + this WP body, not via
  symbol import).
- Adding `'CACHED'` to the `ServiceResponse<T>['source']` union —
  type change; defer to a future WP that actually implements
  stale-while-revalidate.

See EC-234 §Pre-Commit Failure Smells for the full enumeration.

**Locked LIVE-fetcher contract values:**

```typescript
// apps/dashboard/src/services/analyticsLiveFetchers.ts additions
// (verbatim — copy as-is; the empty-sentinel + isLiveMode +
// MISSING_BASE_URL_WARNING are EC-234 §Locked Values)

const MISSING_BASE_URL_WARNING =
  '[analytics] LIVE mode requested but VITE_API_BASE_URL is unset; falling back to MOCK. Set the env var in the deployment environment.';

function makeEmptySentinel<T>(): ServiceResponse<readonly T[]> {
  return { data: [], updatedAt: Date.now(), source: 'LIVE' };
}

// fetch options (locked — every analytics fetch uses these exactly)
const FETCH_OPTIONS: RequestInit = {
  credentials: 'include',
  headers: { Accept: 'application/json' },
};
```

**Locked auth + CORS matrix:**

| Endpoint | Auth | CORS allowlist entry |
|---|---|---|
| `GET /api/analytics/traffic-sources` | cookie-bound Hanko session via `credentials: 'include'` | `https://dashboard.legendary-arena.com` + `http://localhost:4173` |
| `GET /api/analytics/activation-funnel` | same | same |
| `GET /api/analytics/retention-cohorts` | same | same |

**Locked URL construction:**

- `${import.meta.env.VITE_API_BASE_URL}/api/analytics/traffic-sources?range=${range}`
- `${import.meta.env.VITE_API_BASE_URL}/api/analytics/activation-funnel?range=${range}`
- `${import.meta.env.VITE_API_BASE_URL}/api/analytics/retention-cohorts?cohortCount=${cohortCount}`

`encodeURIComponent` NOT required for the closed-set `range` values
(`'7d'|'14d'|'30d'|'90d'`) or the integer `cohortCount` per the
WP-205 route validator's closed-set rejection — any out-of-set value
returns 400 BEFORE reaching the SQL layer, and our caller (the
composable) only ever passes validated values.

---

## Acceptance Criteria

### LIVE-fetcher behavior (D-20601)

- [ ] `fetchTrafficSourcesLive('14d', nowMs)` returns an empty
  sentinel synchronously on first call (`data: []`,
  `source: 'LIVE'`, `updatedAt` ≈ `Date.now()`); the in-flight
  fetch is kicked off in the background.
- [ ] When the fetch resolves with HTTP 200 +
  `{ data: [...TrafficSource items...] }`, the cached ref's
  `.value` updates to the parsed data; Vue reactivity propagates
  the change to the composable.
- [ ] `source: 'LIVE'` literal appears in every successful response;
  no `'CACHED'` literal emitted anywhere.
- [ ] `updatedAt` is captured at network RESPONSE time — assertion
  test uses an injected fake `now()` to verify the timestamp
  advances between sentinel emission and fetch resolve.
- [ ] Second call with the same key returns the cached ref's `.value`
  without kicking off a second fetch (verified via fetch-spy count).
- [ ] Call with a different key kicks off a second fetch (cache
  miss; verified via fetch-spy count).
- [ ] Fetch reject (network error) → empty sentinel preserved; no
  exception propagates to the caller.
- [ ] HTTP 401 / 403 / 500 status → empty sentinel preserved.
- [ ] Invalid JSON in response body → empty sentinel preserved.
- [ ] Payload shape mismatch (`{ data: 'not-array' }` or `{ unrelated:
  ... }`) → empty sentinel preserved.
- [ ] Missing `VITE_API_BASE_URL` env var → empty sentinel returned
  + exactly ONE `console.warn` per process emitted with the locked
  message text (one-shot guard).
- [ ] `credentials: 'include'` + `Accept: application/json` set on
  every fetch call (verified via spy).
- [ ] URL construction matches the locked patterns (verified via
  fetch-spy URL arg).
- [ ] Activation-funnel fetcher exhibits identical behavior axes
  with the `range` query param.
- [ ] Retention-cohorts fetcher exhibits identical behavior axes
  with the `cohortCount` query param (integer in URL).

### LIVE-flip gate (mocks.ts)

- [ ] When `import.meta.env.VITE_USE_MOCKS === 'true'`, `fetchX`
  exports resolve to the `mockX` factories regardless of
  `VITE_API_BASE_URL`.
- [ ] When `import.meta.env.VITE_USE_MOCKS !== 'true'` AND
  `VITE_API_BASE_URL` is set, `fetchX` exports resolve to the
  `_Live` variants.
- [ ] When `import.meta.env.VITE_USE_MOCKS !== 'true'` AND
  `VITE_API_BASE_URL` is unset, `fetchX` exports resolve to the
  `mockX` factories (graceful fallback).
- [ ] `mockX` exports (`mockTrafficSources` /
  `mockActivationFunnel` / `mockRetentionCohorts`) continue to
  be re-exported byte-identical so tests can import them
  directly.

### Server CORS

- [ ] `apps/server/src/server.mjs` `origins` array contains
  `'https://dashboard.legendary-arena.com'` and
  `'http://localhost:4173'`.
- [ ] Adjacent `// why:` cites WP-206 + DOMAINS.md §dashboard.
- [ ] No other entry in the `origins` array changes (byte-identical
  preservation of the existing 7 entries).
- [ ] No other server file changes.

### Widget + composable preservation

- [ ] `git diff --name-only apps/dashboard/src/widgets/{TrafficSources,ActivationFunnel,RetentionCohorts}Widget.vue`
  empty.
- [ ] `git diff --name-only apps/dashboard/src/composables/{useTrafficSources,useActivationFunnel,useRetentionCohorts}.ts`
  empty.
- [ ] Re-run WP-203 close-out widget-mock-token grep on the 3
  widget files: ZERO matches for `mockTrafficSources|mockActivationFunnel|mockRetentionCohorts`.

### Build / Test / Layer

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 with
  **≥ 10 net-new tests** in `analyticsLiveFetchers.test.ts`.
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
  (CORS array edit doesn't change anything materially).
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
  (existing 516 tests pass; no new tests added on the server side).
- [ ] Layer-boundary grep: zero
  `@legendary-arena/(game-engine|registry|preplan|server)` matches
  in `apps/dashboard/src/services/analyticsLiveFetchers.ts`.
- [ ] No-new-deps gate:
  `git diff --stat apps/dashboard/package.json apps/server/package.json pnpm-lock.yaml`
  empty.
- [ ] No-engine-edits gate: `git diff --name-only packages/
  apps/arena-client/ apps/registry-viewer/` empty.
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Build + test the dashboard
pnpm --filter @legendary-arena/dashboard build
pnpm --filter @legendary-arena/dashboard test

# Build + test the server (CORS-only edit; existing tests still pass)
pnpm --filter @legendary-arena/server build
pnpm --filter @legendary-arena/server test

# LIVE-flip gate grep
grep -nE "isLiveMode|fetchTrafficSourcesLive" apps/dashboard/src/services/mocks.ts
# Expected: ≥ 2 matches (gate constant + at least one Live reference).

# Empty-sentinel posture grep
grep -nE "makeEmptySentinel|MISSING_BASE_URL_WARNING" apps/dashboard/src/services/analyticsLiveFetchers.ts
# Expected: ≥ 3 matches (sentinel factory + the warning constant).

# `credentials: 'include'` posture
grep -nE "credentials: 'include'" apps/dashboard/src/services/analyticsLiveFetchers.ts
# Expected: ≥ 1 match.

# CORS update
grep -nE "dashboard.legendary-arena.com|localhost:4173" apps/server/src/server.mjs
# Expected: 2 matches.

# Widget + composable byte-identity
git diff --name-only apps/dashboard/src/widgets/TrafficSourcesWidget.vue apps/dashboard/src/widgets/ActivationFunnelWidget.vue apps/dashboard/src/widgets/RetentionCohortsWidget.vue apps/dashboard/src/composables/useTrafficSources.ts apps/dashboard/src/composables/useActivationFunnel.ts apps/dashboard/src/composables/useRetentionCohorts.ts
# Expected: empty.

# Layer boundary
grep -rnE "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/src/services/
# Expected: zero matches.

# No-new-deps
git diff --stat apps/dashboard/package.json apps/server/package.json pnpm-lock.yaml
# Expected: empty.

# Manual smoke test (operator-runnable):
# 1. Start the server locally with ANALYTICS_USER_ID_SALT set + dev mode.
# 2. POST a few synthetic events to the capture endpoint.
# 3. Start the dashboard with VITE_USE_MOCKS=false +
#    VITE_API_BASE_URL=http://localhost:8080 and pnpm dev.
# 4. Open /players in the browser; verify TrafficSourcesWidget renders
#    `LIVE` badge and shows the synthetic events.
```

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-206 / EC-234 Executed` block
  (2 source files + server CORS + 4 governance; ≥ 10 net-new tests;
  widget + composable byte-identity verified by grep + `git diff`;
  cross-cutting gates clean).
- [ ] `docs/ai/DECISIONS.md` has D-20601 landed Active byte-identical
  to EC-234 §DECISIONS.md Verbatim Block per PS-1 transcription
  convention.
- [ ] `WORK_INDEX.md`: WP-206 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-234 row Done.
- [ ] No source file outside the 8-file §Files Expected to Change
  list was modified.

---

## Vision Alignment

**Vision clauses touched:** §3 (Trust & Fairness — analytics surface
remains operator-internal; cookie-bound auth via Hanko preserves the
existing trust model), §11 (Identity — LIVE-mode auth path uses the
operator's existing Hanko-validated browser session; no new identity
surface).

**Conflict assertion:** `No conflict: this WP preserves all touched
clauses.` Operator-internal capture + operator-only authenticated
fetches; the LIVE flip introduces no new identity, payment, or
public-facing affordance.

**Non-Goal proximity check:** `N/A — WP touches no monetization or
competitive surface.` Analytics LIVE-flip observes funnel + cohort +
channel attribution; no revenue, royalty, or NG-1..7 monetization
boundary touched.

**Determinism preservation:** `N/A — WP touches no scoring, replay,
RNG, or simulation surface.` LIVE fetchers are deterministic with
respect to (input key, network response) — no randomized retry, no
jittered backoff.

---

## Funding Surface Gate

N/A — dashboard analytics WP; no §20.1 trigger surface touched (no
navigation funding affordance, no registry-viewer surface, no
profile attribution, no user-visible donate copy).

---

## API Catalog Update

N/A. WP-206 is a client-side consumer of the existing 3 WP-205 GET
endpoints. Per D-11804, the catalog tracks server-registered routes
+ library-only library functions reachable from `apps/server/src/**`.
Dashboard service files are NOT in scope of the catalog. The 4
analytics rows landed at WP-205 close (catalog already correct).

---

## Anti-Patterns to Avoid

- Do NOT touch any widget file. The Composable Source Contract was
  specifically designed so the flip is a getter substitution.
- Do NOT touch any composable file. Same rationale.
- Do NOT emit `source: 'CACHED'` anywhere. v1 has no
  stale-while-revalidate; the literal `'LIVE'` is the only valid
  successful-response label.
- Do NOT construct a Bearer Authorization header at the dashboard
  layer. The cookie-credentials posture is the locked auth path.
- Do NOT show raw fetch error messages in the widget UI. Empty
  sentinel + the widget's existing `empty` arm is the locked v1
  error UX.
- Do NOT introduce a TTL / setTimeout background refetch. SPA
  lifetime cache is the v1 contract.
- Do NOT introduce AbortController plumbing. Mid-flight refetch
  cancellation is deferred.
- Do NOT add a 5th `source` literal value to `ServiceResponse<T>`.
  The union is `'LIVE' | 'CACHED' | 'MOCK'` and stays closed in v1.
- Do NOT import any `@legendary-arena/server` symbol into the
  dashboard layer. Layer boundary HARD FAIL.
- Do NOT skip the `VITE_API_BASE_URL` presence check. Production
  configurations where `VITE_USE_MOCKS=false` is set but the URL is
  unset MUST fall back to MOCK + emit the locked warning, NOT crash
  with `fetch undefined/api/...`.
- Do NOT modify the `mockX` re-export block. Tests + the MOCK
  fallback path depend on it.
- Do NOT remove or rename any existing entry in the server CORS
  origins array. The 2 new entries are PURE additions.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph + user-visible outcome | ✅ (LIVE badge replaces MOCK; empty data until emission lands; one-env-var operator flip) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-205 ✅, WP-203 ✅, WP-197 ✅, WP-131 ✅, WP-126 ✅, WP-118 ✅; DOMAINS.md citation explicit) |
| 3 | Context (Read First) specific (paths + section refs + D-entry refs) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ (Out of Scope enumerates 9 distinct deferrals) |
| 5 | Files Expected to Change matches contract | ✅ (8 files: 2 new + 2 modified source + 4 governance) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ (5-heading grouping; binary checks; specific tokens) |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — dashboard + surgical server CORS edit | ✅ (no engine/registry/preplan/arena-client/registry-viewer touches; server edit is a 2-line CORS-array insertion adjacent to the existing pattern) |
| 11 | Identity model — cookie-bound Hanko session via `credentials: 'include'` | ✅ (D-20601; no new identity surface; relies on the operator's existing CF-Access-gated browser session) |
| 12 | Test rules — `node:test`; ≥ 10 net-new tests; no boardgame.io / engine import | ✅ |
| 13 | pnpm/node commands only; expected output shown | ✅ |
| 14 | Acceptance criteria binary + specific | ✅ |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX scope-bound | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing | ✅ |
| 17 | Vision Alignment present; clauses §3 / §11 | ✅ |
| 18 | Prose-vs-grep: verification greps scoped to file/path/token | ✅ |
| 19 | Bridge-vs-HEAD staleness | N/A |
| 20 | Funding surface N/A with justification | ✅ (dashboard analytics; no §20.1 trigger) |
| 21 | API catalog update obligation satisfied | ✅ (N/A justified — catalog tracks server-registered routes; dashboard service files out of scope; WP-205 already landed the 4 analytics rows) |

---

## Pre-Flight Self-Check (01.4 — inline)

| Axis | Verdict |
|---|---|
| All hard-dep WPs landed on `main`? | ✅ — WP-205 ✅ (4b245d7), WP-203 ✅, WP-197 ✅, WP-131 ✅, WP-126 ✅, WP-118 ✅. |
| Baseline reproducible? | ✅ — `origin/main @ 4b245d7` cited in §Assumes. |
| Slug supersession-clean? | ✅ — `git log --grep="analytics.*live\|live.*flip\|mock.*live"` returns no prior match; no `*live*` or `*flip*` WP/EC files exist with this slug; `gh pr list --search "analytics live flip"` returns no match. |
| File allowlist tight? | ✅ — 8 files total; surface < 10-file split threshold. |
| Locked values verbatim copyable? | ✅ — `MISSING_BASE_URL_WARNING` + `FETCH_OPTIONS` + URL templates all written byte-exact in §Locked contract values. |
| Layer boundary respected? | ✅ — single dashboard layer file + 1-line surgical server CORS edit per existing pattern; no engine / registry / preplan / arena-client / registry-viewer touches. |
| Test surface bounded + countable? | ✅ — ≥ 10 net-new node:test cases in `analyticsLiveFetchers.test.ts`; no integration test framework added. |
| Forbidden patterns enumerated? | ✅ — 11 traps listed under §Non-Negotiable Constraints → Forbidden. |
| Definition of Done binary? | ✅ — 6 checkbox items; each independently verifiable via grep / build / git diff. |

**Pre-flight verdict: READY TO EXECUTE.**

---

## Copilot Self-Check (01.7 — inline; 30 failure-mode audit)

Audited against the 30 standard failure modes (full enumeration in
`01.7-copilot-check.md`). The 30 modes group into Authority,
Architecture, Concurrency, Determinism, Persistence, Public
Contracts, Testing, Build, and Style axes. WP-206 carries zero
substantive issues across all 30 modes — small surface +
established pattern (D-19607 / D-20302 Composable Source Contract
carry-forward) + locked CORS posture + locked auth posture +
locked URL construction + locked error-path posture leave little
surface for a copilot finding to land.

Two RISK-level observations documented inline:

- **R1 — Empty-sentinel error UX (D-20601 acknowledged).** Failed
  fetches collapse to the widget's existing `empty` arm rather
  than a dedicated `error` arm with retry CTA. This is an explicit
  v1 trade-off documented in §Scope (Out) and D-20601 rationale;
  hardening WP can introduce structured error display later.
  Accepted (RISK, not BLOCK).
- **R2 — SPA-lifetime cache without TTL (D-20601 acknowledged).**
  Cache entries persist for the SPA's lifetime; no
  background-refetch. Operator wanting fresh data reloads. Documented
  in §Scope (Out) as a future polish item. Accepted (RISK, not
  BLOCK).

**Copilot verdict: PASS / CONFIRM (2 RISK documented inline).**

---

*Drafted: 2026-06-04. Baseline `origin/main @ 4b245d7` (post-WP-205
PR #200 squash-merge). Paired client-side follow-up to WP-205 +
WP-203 per WP-205 §Downstream. Closest precedent: WP-205 (server
endpoints) + WP-203 (composable + widget contracts + MOCK→LIVE
upgrade-path invariant). Reserves D-20601 (LIVE-flip posture).
Hard-deps: WP-205 ✅, WP-203 ✅, WP-197 ✅, WP-131 ✅, WP-126 ✅,
WP-118 ✅ — all landed. Defers: per-app client emission (separate
future WPs); operator-visible error UX (future hardening WP);
stale-while-revalidate cache invalidation + background refetch
(future polish WP); the other 3 dashboard analytics-adjacent
surfaces (`OpsAtAGlance` / `PublicSurfaceHealth` /
`ErrorRateMonitor` / `InfraCostWatchdog` widgets from WP-204 — wait
for the paired ops-server WP).*
