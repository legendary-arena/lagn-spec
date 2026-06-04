# EC-234 — Dashboard Analytics MOCK→LIVE Flip (Execution Checklist)

**Source:** docs/ai/work-packets/WP-206-dashboard-analytics-live-flip.md
**Layer:** Dashboard — `apps/dashboard/src/services/` (new `analyticsLiveFetchers.{ts,test.ts}` + modified `mocks.ts`) + surgical 2-line CORS edit on `apps/server/src/server.mjs`

> Use locked values from WP-206 verbatim. EC-234 is the operational
> order + gates + failure smells; if EC-234 and WP-206 conflict, WP-206
> wins.

## Execution Order (Locked)

1. **Sub-task A — LIVE fetcher module + tests (2 files)**
   - Create `apps/dashboard/src/services/analyticsLiveFetchers.ts`
     with 3 exported async wrappers + the locked
     `MISSING_BASE_URL_WARNING` + `FETCH_OPTIONS` + sentinel factory.
   - Create `apps/dashboard/src/services/analyticsLiveFetchers.test.ts`
     with ≥ 10 tests per WP-206 §Acceptance Criteria → LIVE-fetcher
     behavior.
   - Gate: `pnpm --filter @legendary-arena/dashboard build` + `test`
     exit 0; ≥ 10 new tests pass.
   - **Commit Sub-task A** with prefix `EC-234:`.

2. **Sub-task B — LIVE-flip gate + server CORS (2 files)**
   - Modify `apps/dashboard/src/services/mocks.ts` — replace the 3
     `fetchX` static re-exports with an `isLiveMode`-gated const
     export block per WP-206 §Scope (In). `mockX` re-exports preserved
     byte-identical.
   - Modify `apps/server/src/server.mjs` — add 2 entries to the CORS
     `origins` array (`https://dashboard.legendary-arena.com` +
     `http://localhost:4173`) with a `// why:` block citing WP-206 +
     DOMAINS.md §dashboard.
   - Gate: full builds + tests across dashboard + server exit 0; widget
     + composable byte-identity grep clean; LIVE-flip gate grep + CORS
     grep return expected counts.
   - **Commit Sub-task B** with prefix `EC-234:`.

### Governance close (Sub-task B same session)

3. `docs/ai/STATUS.md` — `### WP-206 / EC-234 Executed` block.
4. `docs/ai/DECISIONS.md` — D-20601 byte-identical to §DECISIONS.md
   Verbatim Block below.
5. `docs/ai/work-packets/WORK_INDEX.md` — WP-206 `[x]`.
6. `docs/ai/execution-checklists/EC_INDEX.md` — EC-234 Done.
7. **Commit governance** with prefix `SPEC:`.

## Before Starting

- [ ] **WP-205 landed** ✅ — `4b245d7` (PR #200 squash-merged
  2026-06-04). Verify: `git log origin/main --oneline -5 | head -3`
  shows the WP-205 squash-merge.
- [ ] **WP-203 landed** ✅ — composables + widgets + Composable Source
  Contract. Verify: `grep -nE "fetchTrafficSources|fetchActivationFunnel|fetchRetentionCohorts"
  apps/dashboard/src/services/mocks.ts` returns ≥ 3 matches.
- [ ] **WP-197 landed** ✅ — deploy posture +
  `VITE_USE_MOCKS=true` on production. Verify: `cat
  apps/dashboard/.env.example` shows the env var declared.
- [ ] **WP-131 / WP-126 landed** ✅ — Hanko verifier wired in
  production server.
- [ ] Read WP-206 §Goal, §Assumes, §Non-Negotiable Constraints,
  §Acceptance Criteria — those sections are authoritative.
- [ ] Read `apps/dashboard/src/services/mocks.ts` (current 256-line
  shape; the 3 `fetchX` re-exports at lines 30-34 are the seam).
- [ ] Read `apps/dashboard/src/services/analyticsMocks.ts` (mock
  factories that remain after the flip — preserved byte-identical).
- [ ] Read `apps/dashboard/src/composables/useTrafficSources.ts`
  lines 43-56 (composable contract that the LIVE fetchers MUST
  preserve via the Ref-backed sync getter pattern).
- [ ] Read `apps/dashboard/src/widgets/TrafficSourcesWidget.vue`
  lines 6, 32-36 (widget call site that MUST stay byte-identical).
- [ ] Read `apps/server/src/server.mjs` lines 362-370 (CORS origins
  array that gets the 2-entry addition).
- [ ] Read `apps/dashboard/src/env.d.ts` (env-var typings — confirm
  `VITE_API_BASE_URL` + `VITE_USE_MOCKS` already declared).
- [ ] `pnpm --filter @legendary-arena/dashboard build` +
  `pnpm --filter @legendary-arena/dashboard test` exit 0 (anchor
  dashboard baseline test count). `pnpm --filter @legendary-arena/server
  build` + `test` exit 0 (anchor server baseline — 516 tests).

## Locked Values (verbatim from WP-206)

> Full constant strings + URL templates live in WP-206 §Non-Negotiable
> Constraints → Locked LIVE-fetcher contract values. Copy byte-identical
> into `analyticsLiveFetchers.ts`; do NOT re-derive.

- **`MISSING_BASE_URL_WARNING` string (locked):** exactly
  `'[analytics] LIVE mode requested but VITE_API_BASE_URL is unset;
  falling back to MOCK. Set the env var in the deployment
  environment.'` — single-quoted, no trailing whitespace; only string
  literal in source code that mentions the env var name.
- **`FETCH_OPTIONS` (locked):** `{ credentials: 'include', headers: {
  Accept: 'application/json' } }` — every `fetch` call uses this
  exact options object. `credentials: 'omit'` or
  `'same-origin'` is FORBIDDEN.
- **Empty sentinel shape (D-20601):** `{ data: [], updatedAt:
  Date.now(), source: 'LIVE' }`. Returned synchronously on first
  call for a key and on every error path.
- **One-shot guard mechanism (D-20601):** module-level `let
  hasWarnedAboutMissingBaseUrl = false;` flipped to `true` after
  first warning emission; subsequent calls skip the warning. Process
  lifetime; fresh process re-warns once. Test asserts via
  `mock.method(console, 'warn')` capture.
- **`isLiveMode` gate condition (D-20601):** the boolean is `true`
  iff ALL of: `import.meta.env.VITE_USE_MOCKS !== 'true'` AND
  `typeof import.meta.env.VITE_API_BASE_URL === 'string'` AND
  `import.meta.env.VITE_API_BASE_URL.length > 0`. Any condition
  failing → fall through to `mockX`.
- **URL templates (locked):**
  - `${VITE_API_BASE_URL}/api/analytics/traffic-sources?range=${range}`
  - `${VITE_API_BASE_URL}/api/analytics/activation-funnel?range=${range}`
  - `${VITE_API_BASE_URL}/api/analytics/retention-cohorts?cohortCount=${cohortCount}`
- **Cache key types (D-20601):** `range: DateRange` (closed
  `'7d'|'14d'|'30d'|'90d'`) for traffic-sources + activation-funnel;
  `cohortCount: number` for retention-cohorts. Module-level
  `Map<key, Ref<ServiceResponse<readonly T[]>>>` per fetcher.
- **`source: 'LIVE'` literal (D-20601):** every successful response
  + every empty sentinel carries this literal. `'CACHED'` FORBIDDEN
  in v1.
- **`updatedAt` capture timing (D-20601):** RESPONSE time — captured
  immediately before the cached ref's value is replaced, NOT at
  function call entry. Sentinel emission uses `Date.now()` at the
  sentinel-build-time (separate capture).
- **Server CORS additions (locked):** literal strings
  `'https://dashboard.legendary-arena.com'` and `'http://localhost:4173'`
  appended to the existing 7-entry `origins` array. NO other entry
  edit.

## Guardrails

### Semantic (the lines you must not cross)

- **Widget byte-identity (D-20302 carry-forward).** `git diff
  --name-only apps/dashboard/src/widgets/{TrafficSources,
  ActivationFunnel,RetentionCohorts}Widget.vue` returns empty at
  close. NO widget edit; the Composable Source Contract was
  specifically designed for this moment.
- **Composable byte-identity.** Same as above for the 3
  `use{TrafficSources,ActivationFunnel,RetentionCohorts}.ts`
  composables. NO composable edit.
- **`source: 'LIVE'` literal-locked (D-20601).** Every successful
  fetch + every empty sentinel carries this literal string. `'CACHED'`
  emission anywhere = HARD FAIL.
- **`updatedAt` capture timing (D-20601).** RESPONSE time only; the
  test asserts the timestamp advances between sentinel emission and
  fetch resolve.
- **Cookie-credentials auth (D-20601).** `credentials: 'include'`
  on every fetch. Bearer Authorization header construction at the
  dashboard layer = HARD FAIL.
- **Empty-sentinel error path (D-20601).** Network reject / 4xx /
  5xx / invalid JSON / payload shape mismatch → empty sentinel; widget
  renders its existing `empty` arm. NO raw error message reaches the
  user-facing surface.
- **Per-key cache (D-20601).** `Map<key, Ref<ServiceResponse>>` per
  fetcher; module-level lifetime. Second call with same key returns
  cached ref's `.value` without kicking off a second fetch.
- **`isLiveMode` gate (D-20601).** Triple-condition AND: `VITE_USE_MOCKS
  !== 'true'` AND `VITE_API_BASE_URL` is string AND non-empty. Defense
  against the `VITE_USE_MOCKS=false` + unset URL crash mode.
- **One-shot warning posture (D-20601).** Missing-URL warning emits
  exactly once per process via module-level boolean; warning text
  byte-identical to `MISSING_BASE_URL_WARNING`.
- **No new `ServiceResponse<T>['source']` literal.** The union stays
  `'LIVE' | 'CACHED' | 'MOCK'` per the existing types file. Adding
  a 4th value is out of scope.
- **API catalog NOT touched.** This WP is a client-side consumer of
  existing endpoints; D-11804 catalog tracks server routes only. NO
  edit to `docs/ai/REFERENCE/api-endpoints.md`.

### Execution (the things you must not touch)

- **Layer boundary:** zero
  `@legendary-arena/(game-engine|registry|preplan|server)` imports
  in `apps/dashboard/src/services/`. Verified by grep at close.
- **No new npm dependencies:** `apps/dashboard/package.json`,
  `apps/server/package.json`, `pnpm-lock.yaml` zero diff. Browser
  `fetch` + Vue `ref` only.
- **No engine / registry / preplan edits.** `packages/` zero diff.
- **No arena-client / registry-viewer edits.** `apps/arena-client/`
  + `apps/registry-viewer/` zero diff.
- **Pre-existing server route file diffs:** `git diff --name-only
  apps/server/src/{billing,profile,teams,entitlements,leaderboards,
  analytics,autoplay,legends,par,db,auth,identity}` returns empty
  (no incidental edits to non-CORS server surfaces).
- **`Math.random` scope:** forbidden in
  `apps/dashboard/src/services/analyticsLiveFetchers.ts`. v1 has no
  randomized retry / jittered backoff.
- **`localeCompare` scope:** forbidden in the new files (D-19605 /
  D-19908 carry-forward).
- **`mockX` re-export preservation:** the existing `mockTrafficSources
  / mockActivationFunnel / mockRetentionCohorts` re-export block in
  `mocks.ts` stays byte-identical; tests continue to import these.
- **CORS `origins` array preservation:** the existing 7 entries
  preserved byte-identical; the 2 new entries are PURE additions
  adjacent to the existing list.

## Required `// why:` Comments

- `analyticsLiveFetchers.ts` `MISSING_BASE_URL_WARNING` constant —
  `// why:` citing D-20601 (graceful local-dev fallback; production
  loud signal via warning emission; exact text locked by EC-234
  §Locked Values).
- `analyticsLiveFetchers.ts` `FETCH_OPTIONS` constant — `// why:`
  citing D-20601 cookie-credentials auth posture (no Bearer header
  construction at the dashboard layer; the Hanko session cookie is
  bound to the dashboard's CF-Access-gated browser session).
- `analyticsLiveFetchers.ts` `makeEmptySentinel` factory — `// why:`
  citing D-20601 empty-sentinel error-path posture + widget `empty`
  arm fallback.
- `analyticsLiveFetchers.ts` per-fetcher module-level cache — `// why:`
  citing D-20601 per-key cache discipline + SPA lifetime + Vue
  reactivity bridge (sync getter contract preservation).
- `analyticsLiveFetchers.ts` per-fetcher `updatedAt: Date.now()` at
  RESPONSE time — `// why:` citing D-20601 capture-timing lock.
- `analyticsLiveFetchers.ts` per-fetcher fetch-failure catch block —
  `// why:` citing D-20601 fail-silent posture (empty sentinel
  preserved; widget renders `empty` arm).
- `analyticsLiveFetchers.ts` one-shot warning guard — `// why:`
  citing D-20601 one-shot lifetime + EC §Locked Values one-shot
  guard mechanism + the WP-205 `userIdHash.ts` precedent.
- `mocks.ts` `isLiveMode` const — `// why:` citing D-20601 LIVE-flip
  seam + the triple-condition AND gate (defense against `VITE_USE_MOCKS=false`
  + unset URL crash mode).
- `mocks.ts` per-export const — `// why:` citing D-20302 widget
  byte-identity preservation + D-20601 LIVE-flip seam (the `fetchX`
  identifier stays; the binding behind it changes).
- `server.mjs` CORS array additions — `// why:` citing WP-206 +
  DOMAINS.md §dashboard (`dashboard.legendary-arena.com` is the
  live host since 2026-06-02; localhost:4173 is the Vite dev
  default for local-dev LIVE-mode against localhost:8080).

## Files to Produce

### Sub-task A — LIVE fetcher (2 files)

- `apps/dashboard/src/services/analyticsLiveFetchers.ts` — **new** —
  3 fetcher functions + locked constants + module-level caches.
- `apps/dashboard/src/services/analyticsLiveFetchers.test.ts` —
  **new** — ≥ 10 tests (`should_<behavior>_when_<condition>` naming).

### Sub-task B — LIVE-flip gate + server CORS (2 modified)

- `apps/dashboard/src/services/mocks.ts` — **modified** — replace
  the 3 `fetchX` static re-exports with an `isLiveMode`-gated const
  export block.
- `apps/server/src/server.mjs` — **modified** — 2 surgical entries
  added to the CORS `origins` array.

### Governance (4 modified)

- `docs/ai/STATUS.md` — **modified** — `### WP-206 / EC-234 Executed`
  block.
- `docs/ai/DECISIONS.md` — **modified** — D-20601 (proposed → Active
  byte-identical to §DECISIONS.md Verbatim Block below).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-206 `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-234
  Done.

**Total: 8 files** (2 new + 2 modified source + 4 governance).

## After Completing

### Sub-task A close

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 with
  baseline + **≥ 10 new tests** in `analyticsLiveFetchers.test.ts`.
- [ ] Locked-constant grep: `grep -nE "MISSING_BASE_URL_WARNING|FETCH_OPTIONS|makeEmptySentinel"
  apps/dashboard/src/services/analyticsLiveFetchers.ts` returns ≥ 3
  matches.
- [ ] `credentials: 'include'` grep: `grep -nE "credentials: 'include'"
  apps/dashboard/src/services/analyticsLiveFetchers.ts` returns ≥ 1
  match.
- [ ] `source: 'LIVE'` grep: at least 4 matches (sentinel factory +
  3 per-fetcher response wrapper sites).
- [ ] Layer-boundary grep on the new file: zero
  `@legendary-arena/(game-engine|registry|preplan|server)` matches.

### Sub-task B close

- [ ] `pnpm --filter @legendary-arena/dashboard build` + `test`
  exit 0; full dashboard test count unchanged from Sub-task A
  baseline + ≥ 10 new.
- [ ] `pnpm --filter @legendary-arena/server build` + `test` exit 0;
  full server test count = baseline (no new server tests; CORS array
  edit is non-functional regression-only).
- [ ] LIVE-flip gate grep on `mocks.ts`: `grep -nE "isLiveMode|fetchTrafficSourcesLive|fetchActivationFunnelLive|fetchRetentionCohortsLive"
  apps/dashboard/src/services/mocks.ts` returns ≥ 4 matches.
- [ ] `mockX` preservation: `grep -nE "mockTrafficSources|mockActivationFunnel|mockRetentionCohorts"
  apps/dashboard/src/services/mocks.ts` returns ≥ 3 matches (the
  preserved re-export block).
- [ ] CORS grep on `server.mjs`: `grep -nE "dashboard.legendary-arena.com|localhost:4173"
  apps/server/src/server.mjs` returns 2 matches.
- [ ] Widget byte-identity: `git diff --name-only
  apps/dashboard/src/widgets/TrafficSourcesWidget.vue
  apps/dashboard/src/widgets/ActivationFunnelWidget.vue
  apps/dashboard/src/widgets/RetentionCohortsWidget.vue` empty.
- [ ] Composable byte-identity: `git diff --name-only
  apps/dashboard/src/composables/useTrafficSources.ts
  apps/dashboard/src/composables/useActivationFunnel.ts
  apps/dashboard/src/composables/useRetentionCohorts.ts` empty.
- [ ] WP-203 close-out widget-mock-token grep: `grep -nE
  "mockTrafficSources|mockActivationFunnel|mockRetentionCohorts"
  apps/dashboard/src/widgets/TrafficSourcesWidget.vue
  apps/dashboard/src/widgets/ActivationFunnelWidget.vue
  apps/dashboard/src/widgets/RetentionCohortsWidget.vue` returns 0
  matches.
- [ ] Pre-existing route file diffs unchanged: `git diff --name-only
  apps/server/src/{billing,profile,teams,entitlements,leaderboards,
  analytics,autoplay,legends,par,db,auth,identity}` empty.

### Cross-cutting close

- [ ] **Layer-boundary grep:** zero
  `@legendary-arena/(game-engine|registry|preplan|server)` matches
  in `apps/dashboard/src/services/`.
- [ ] **No-new-deps gate:** `git diff --stat
  apps/dashboard/package.json apps/server/package.json pnpm-lock.yaml`
  empty.
- [ ] **No-engine-edits gate:** `git diff --name-only packages/
  apps/arena-client/ apps/registry-viewer/` empty.
- [ ] **No-`Math.random` in new dashboard service file:** `grep -nE
  "Math\.random" apps/dashboard/src/services/analyticsLiveFetchers.ts`
  returns 0.
- [ ] **No-`localeCompare` in new dashboard service file:** `grep -nE
  "localeCompare" apps/dashboard/src/services/analyticsLiveFetchers.ts`
  returns 0.
- [ ] **API catalog unchanged:** `git diff --name-only
  docs/ai/REFERENCE/api-endpoints.md` empty.
- [ ] **Manual smoke test (operator-runnable):** see WP-206
  §Verification Steps.
- [ ] `pnpm -r build` exits 0.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-20601
  landed Active byte-identical to §DECISIONS.md Verbatim Block
  below; `WORK_INDEX.md` WP-206 `[x]`; `EC_INDEX.md` EC-234 Done.

## Pre-Commit Failure Smells (Must Review Before Commit)

- **Any widget file in `git diff --name-only`** → widget byte-identity
  HARD FAIL.
- **Any composable file in `git diff --name-only`** → composable
  byte-identity HARD FAIL.
- **`source: 'CACHED'` emitted anywhere in
  `analyticsLiveFetchers.ts`** → D-20601 v1 source-literal HARD
  FAIL.
- **`credentials: 'omit'` or `credentials: 'same-origin'` in any
  fetch call** → D-20601 cookie-credentials HARD FAIL.
- **Bearer Authorization header constructed in
  `analyticsLiveFetchers.ts`** → D-20601 auth posture HARD FAIL.
- **`Math.random` anywhere in `analyticsLiveFetchers.ts`** → v1
  determinism scope violation.
- **`localeCompare` anywhere in the new dashboard files** →
  D-19605 / D-19908 HARD FAIL.
- **Raw error message rendered in widget UI** → D-20601 leakage
  gate HARD FAIL (the failure path is empty sentinel + widget's
  existing `empty` arm).
- **`isLiveMode` gate omits any of the three AND conditions** —
  defense against `VITE_USE_MOCKS=false` + unset URL crash mode
  HARD FAIL.
- **Missing-URL warning text drifts from
  `MISSING_BASE_URL_WARNING`** → EC §Locked Values HARD FAIL.
- **Missing-URL warning emits more than once per process** →
  one-shot guard regression HARD FAIL.
- **Existing 7 CORS origins modified or reordered** → D-19608
  pre-existing-surface-preservation HARD FAIL.
- **`apps/dashboard/package.json` or `pnpm-lock.yaml` diff** →
  new-dep violation.
- **`apps/server/package.json` diff** → new-dep violation.
- **Any `apps/server/src/billing/` etc. diff outside server.mjs** →
  scope creep.
- **`apps/dashboard/src/services/mocks.ts` `mockX` re-export block
  modified** → MOCK fallback regression HARD FAIL (tests depend
  on the byte-identical re-export).
- **`docs/ai/REFERENCE/api-endpoints.md` diff** → D-11804
  out-of-scope edit (catalog tracks server-registered routes only;
  this WP is a client consumer).
- **`@legendary-arena/server` import anywhere in
  `apps/dashboard/src/`** → layer boundary HARD FAIL.
- **Adding a 4th `source` literal to `ServiceResponse<T>`** → type
  surface change out of scope.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> Per PS-1 convention (mirrors WP-205 / WP-196 / WP-198 / WP-199 /
> WP-203 / WP-204 precedent): the D-20601 entry lands in
> `docs/ai/DECISIONS.md` at the execution-close governance commit
> byte-identical to the block below. Status flips from `Reserved
> (proposed)` at draft time to `Active` at landing time; no other
> field changes.

### D-20601 — Dashboard Analytics LIVE-Flip Posture: Cookie-Credentials Auth, Empty-Sentinel Error Path, Per-Key SPA Cache, `source: 'LIVE'` Literal-Locked

**Decision:**
The dashboard's 3 analytics widgets
(`TrafficSourcesWidget` / `ActivationFunnelWidget` /
`RetentionCohortsWidget`) flip from MOCK to LIVE via an
`isLiveMode`-gated conditional re-export in
`apps/dashboard/src/services/mocks.ts`. `isLiveMode` is `true`
iff ALL of: `import.meta.env.VITE_USE_MOCKS !== 'true'` AND
`typeof import.meta.env.VITE_API_BASE_URL === 'string'` AND
`import.meta.env.VITE_API_BASE_URL.length > 0`. Any condition
failing → fall through to the MOCK factories.

The LIVE fetchers
(`fetchTrafficSourcesLive` / `fetchActivationFunnelLive` /
`fetchRetentionCohortsLive` in
`apps/dashboard/src/services/analyticsLiveFetchers.ts`) preserve
the composable's synchronous `() => ServiceResponse<readonly T[]>`
getter contract via a module-level `Map<key, Ref<ServiceResponse>>`
per fetcher. First call with a given key returns the empty
sentinel (`data: []`, `source: 'LIVE'`, `updatedAt: Date.now()`)
synchronously and kicks off the async fetch via a fire-and-forget
closure. Vue reactivity propagates fetch completion to the
composable + widget.

`source: 'LIVE'` is the only literal value emitted by successful
LIVE-mode responses in v1. `'CACHED'` (stale-while-revalidate) is
deferred to a future hardening WP.

`updatedAt` is captured at the network RESPONSE time — immediately
before the cached ref's `.value` is replaced with the parsed data.
The empty sentinel captures `Date.now()` at sentinel-build-time so
the widget freshness chip reads `LIVE · just now` from widget mount;
the timestamp then advances on fetch resolve.

**Error-path posture (fail-silent to empty sentinel):**
Fetch failures (network reject, HTTP 4xx / 5xx, invalid JSON,
payload shape mismatch) all collapse to the empty sentinel. The
cached ref's value is NOT updated on failure (the empty sentinel
from initial emission is preserved). The widget renders its
existing `empty` arm with the `LIVE` source badge — no template
change required. Operator-visible structured error display (a
dedicated `error` arm with retry CTA, raw error message rendering,
etc.) is deferred to a future error-UX hardening WP. The trade-off
is documented; this v1 posture is intentional.

**Auth posture (cookie-credentials):**
Every fetch call uses
`{ credentials: 'include', headers: { Accept: 'application/json' } }`.
The Hanko session cookie is bound to the dashboard's parent host
(CF Access-gated `dashboard.legendary-arena.com`) and travels
cross-origin to `api.legendary-arena.com` via the standard CORS
cookie mechanism. The server adds
`https://dashboard.legendary-arena.com` (+ `http://localhost:4173`
for local dev) to its `origins` array. No Bearer Authorization
header construction at the dashboard layer.

**Per-key cache discipline (SPA lifetime):**
Each fetcher maintains a `Map<key, Ref<ServiceResponse<T>>>` cache
where `key` is the `range` string (closed `'7d'|'14d'|'30d'|'90d'`)
for traffic-sources + activation-funnel, and the `cohortCount`
integer for retention-cohorts. Second call with the same key returns
the cached ref's `.value` without kicking off a redundant fetch.
Cache entries persist for the SPA's lifetime; no TTL, no
background-refetch, no `AbortController` mid-flight cancellation.
A fresh data load requires a page reload. All deferred to future
polish WPs.

**Missing-URL one-shot warning posture:**
If `isLiveMode` evaluates `true` but `VITE_API_BASE_URL` is somehow
missing or empty at fetch time (defense against the
`VITE_USE_MOCKS=false` + unset URL crash mode), each fetcher
returns the empty sentinel synchronously AND emits exactly one
`console.warn` per process via a module-level boolean guard. The
locked warning message:
`'[analytics] LIVE mode requested but VITE_API_BASE_URL is unset;
falling back to MOCK. Set the env var in the deployment
environment.'`

**Rationale:**
The composable + widget pattern locked under D-19607 (Shared Source
Contract) + D-20302 (MOCK→LIVE upgrade-path invariant) was
specifically designed so the LIVE flip is a getter substitution —
widget files stay byte-identical pre/post flip. WP-203 close-out
already verified the widgets contain ZERO literal `mockX` tokens;
this WP preserves that gate by introducing a `_Live`-suffixed
parallel set of getters that the `mocks.ts` seam chooses between
via `isLiveMode`.

The Vue `ref`-backed sync getter pattern bridges async fetch to the
composable's synchronous contract without changing the composable
signature. Vue's reactivity system propagates fetch completion to
the widget transparently — the widget's existing 4-state
`if (series.length === 0) return 'empty'; return 'data'` logic
handles the loading→loaded transition without modification.

Cookie-credentials auth matches the existing dashboard-wide auth
posture (the operator is already Hanko-authenticated in their
CF-Access-gated browser session; `credentials: 'include'` simply
forwards that cookie cross-origin). Constructing a Bearer header
at the dashboard layer would duplicate the cookie posture for no
benefit.

Empty-sentinel error path is the simplest v1 posture: it lets the
LIVE flip ship without an `error`-arm template change in any
widget. The trade-off (no operator-visible structured error
display) is acceptable because (a) the dashboard already surfaces
operational health via the `/system` page widgets; (b) the
analytics surface is operator-internal and the operator can inspect
network errors via browser devtools when needed; (c) introducing
an `error` arm now would require template edits across 3 widgets
and a dedicated 5th state-machine state, which is overkill for a
"flip the seam" WP.

Per-key SPA-lifetime cache without TTL is also the simplest v1
posture: it lets the operator see consistent data across navigation
without redundant network traffic, and a page reload is a familiar
"force fresh" gesture. Stale-while-revalidate + background refetch
on focus + AbortController on key change are all genuine
engineering scope that v1 does not need.

**Implementation locations:**
- `apps/dashboard/src/services/analyticsLiveFetchers.ts` — 3
  fetcher functions + locked constants + module-level caches.
- `apps/dashboard/src/services/analyticsLiveFetchers.test.ts` — ≥
  10 tests covering happy-path + caching + error paths +
  missing-URL + auth + URL construction.
- `apps/dashboard/src/services/mocks.ts` — the `isLiveMode`-gated
  conditional re-export block.
- `apps/server/src/server.mjs` — CORS `origins` array gets 2 new
  entries (`https://dashboard.legendary-arena.com` +
  `http://localhost:4173`).

**Packet:** WP-206 (EC-234).

**Drafted:** 2026-06-04 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---
