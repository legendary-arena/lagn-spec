# EC-234 — Dashboard Analytics MOCK→LIVE Flip (Execution Checklist)

**Source:** docs/ai/work-packets/WP-206-dashboard-analytics-live-flip.md
**Layer:** Dashboard — `apps/dashboard/src/services/` (new `analyticsLiveFetchers.{ts,test.ts}` + modified `mocks.ts`) + surgical 2-line CORS edit on `apps/server/src/server.mjs`

> Use locked values from WP-206 verbatim. EC-234 is the operational
> order + gates + failure smells; if EC-234 and WP-206 conflict, WP-206
> wins.

## Execution Order (Locked)

1. **Sub-task A — LIVE fetcher module + tests (2 files)**
   - Create `apps/dashboard/src/services/analyticsLiveFetchers.ts`
     with the locked helpers + 3 synchronous fetcher getters:
     - `MISSING_BASE_URL_WARNING` + `FETCH_OPTIONS` constants
       (verbatim from §Locked Values).
     - Module-private `let now: () => number = () => Date.now();`
       (the SINGLE permitted `Date.now()` call in the module).
     - Exported `isLiveModeEnabled()` shared predicate (the LIVE
       gate's single source of truth).
     - Exported `isValidEnvelope<T>(value)` type-predicate (the
       single payload guard).
     - Exported `makeLiveEmptySentinel<T>()` factory.
     - Exported `__testHooks = { setNow(fn) { now = fn; } }`
       (test-only escape hatch).
     - 3 synchronous getter exports
       (`fetchTrafficSourcesLive` / `fetchActivationFunnelLive` /
       `fetchRetentionCohortsLive`) — each one follows the locked
       cache-write-before-fetch order: build sentinel →
       `cache.set` → invoke internal async fetch closure →
       return `ref.value`. Internal async closures are NOT
       exported.
     - Module-level per-fetcher `Map<key, Ref<ServiceResponse>>`
       caches + one-shot missing-URL warning guard.
   - Create `apps/dashboard/src/services/analyticsLiveFetchers.test.ts`
     with ≥ 14 tests per WP-206 §Acceptance Criteria → LIVE-fetcher
     behavior (concurrent same-key dedupe + sentinel non-regression
     + `__testHooks.setNow` time injection + `isValidEnvelope` /
     `isLiveModeEnabled` direct unit + DEV-only console gating +
     error paths + missing-URL + auth + URL construction).
   - Gate: `pnpm --filter @legendary-arena/dashboard build` + `test`
     exit 0; ≥ 14 new tests pass; helper grep returns ≥ 6 matches;
     no exported async fetch leak; exactly 1 `Date.now()` match.
   - **Commit Sub-task A** with prefix `EC-234:`.

2. **Sub-task B — LIVE-flip gate + server CORS (2 files)**
   - Modify `apps/dashboard/src/services/mocks.ts` — replace the 3
     `fetchX` static re-exports with an
     `isLiveModeEnabled()`-gated const export block per WP-206
     §Scope (In). `mocks.ts` imports the shared predicate from
     `./analyticsLiveFetchers.js`; **no inline env-var check** on
     this side (`grep -nE "VITE_USE_MOCKS|VITE_API_BASE_URL"
     apps/dashboard/src/services/mocks.ts` returns 0 at close —
     single-source-of-truth gate enforced). `mockX` re-exports
     preserved byte-identical.
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

> Full constant strings + URL templates + helper signatures live in
> WP-206 §Non-Negotiable Constraints → Locked LIVE-fetcher contract
> values. Copy byte-identical into `analyticsLiveFetchers.ts`; do
> NOT re-derive.

- **`MISSING_BASE_URL_WARNING` string (locked):** exactly
  `'[analytics] LIVE mode requested but VITE_API_BASE_URL is unset;
  falling back to MOCK. Set the env var in the deployment
  environment.'` — single-quoted, no trailing whitespace; only string
  literal in source code that mentions the env var name.
- **`FETCH_OPTIONS` (locked):** `{ credentials: 'include', headers: {
  Accept: 'application/json' } }` — every `fetch` call uses this
  exact options object. `credentials: 'omit'` or
  `'same-origin'` is FORBIDDEN.
- **Live empty sentinel shape (D-20601):** `{ data: [], updatedAt:
  now(), source: 'LIVE' }` (note `now()`, not `Date.now()` —
  module-private injectable time source). Constructed by
  `makeLiveEmptySentinel<T>()` (the `Live` prefix is locked; it
  disambiguates against MOCK-factory empty outputs at every cache-
  touch point). Returned synchronously on first call for a key and
  on every error path SUBJECT to the sentinel non-regression
  invariant (see Guardrails).
- **One-shot guard mechanism (D-20601):** module-level `let
  hasWarnedAboutMissingBaseUrl = false;` flipped to `true` after
  first warning emission; subsequent calls skip the warning. Process
  lifetime; fresh process re-warns once. Test asserts via
  `mock.method(console, 'warn')` capture.
- **`isLiveModeEnabled()` shared predicate (D-20601):** exported
  function returning `true` iff ALL of: `import.meta.env.VITE_USE_MOCKS
  !== 'true'` AND `typeof import.meta.env.VITE_API_BASE_URL ===
  'string'` AND `import.meta.env.VITE_API_BASE_URL.length > 0`.
  Single source of truth for the gate — `mocks.ts` imports it for
  routing; every LIVE fetcher calls it for defensive re-validation
  before fetch. Inline env-var checks at either call site are
  FORBIDDEN.
- **`isValidEnvelope<T>(value)` shared guard (D-20601):** exported
  type-predicate `value is { data: readonly T[] }` — `true` iff
  `value` is a non-null object AND
  `Array.isArray((value as { data?: unknown }).data)`. All three
  fetchers reuse it; inline `Array.isArray` at a fetcher call site
  is FORBIDDEN.
- **Injectable time source (D-20601):** module-private `let now: ()
  => number = () => Date.now();`. Direct `Date.now()` calls anywhere
  else in the module are FORBIDDEN — verification grep allows
  exactly 1 `Date.now()` match (the initializer line). Tests use
  the exported `__testHooks.setNow(fn)` escape hatch and reset in
  teardown.
- **`__testHooks` shape (locked):** exported `const __testHooks =
  { setNow(fn: () => number): void { now = fn; } };`. Production
  code never invokes `__testHooks` — grep guards by counting
  matches in non-test source files = 1 (the declaration only).
- **Cache-write-before-fetch order (locked):** every fetcher's
  cache-miss branch executes the lines in this exact source order:
  `(1) const liveRef = ref(makeLiveEmptySentinel<T>()); (2)
  cache.set(key, liveRef); (3) void runFetchClosure(key,
  liveRef); (4) return liveRef.value;`. Any reordering that
  inverts (2) and (3) violates the concurrent-dedupe invariant.
- **Sentinel non-regression invariant (D-20601):** once a cached
  `ref.value` has been replaced with successfully-fetched data,
  NO code path may overwrite it back to a live empty sentinel.
  In v1 (no refetch) this is structurally upheld by never re-entering
  the cache-miss branch for an existing key; the invariant locks
  the future SWR / refetch WPs against silent good-data
  downgrades.
- **Console policy (locked):** production builds emit ONLY
  `console.warn(MISSING_BASE_URL_WARNING)` (one-shot). Every
  `console.debug` / `console.error` site MUST be wrapped in
  `if (import.meta.env.DEV) { ... }`. Bare `console.log` FORBIDDEN.
- **URL templates (locked):**
  - `${VITE_API_BASE_URL}/api/analytics/traffic-sources?range=${range}`
  - `${VITE_API_BASE_URL}/api/analytics/activation-funnel?range=${range}`
  - `${VITE_API_BASE_URL}/api/analytics/retention-cohorts?cohortCount=${cohortCount}`
- **Cache key types (D-20601):** `range: DateRange` (closed
  `'7d'|'14d'|'30d'|'90d'`) for traffic-sources + activation-funnel;
  `cohortCount: number` for retention-cohorts. Module-level
  `Map<key, Ref<ServiceResponse<readonly T[]>>>` per fetcher.
- **`source: 'LIVE'` literal (D-20601):** every successful response
  + every live empty sentinel carries this literal. `'CACHED'`
  FORBIDDEN in v1.
- **`updatedAt` capture timing (D-20601):** RESPONSE time — captured
  via `now()` immediately before the cached ref's value is replaced,
  NOT at function call entry. Sentinel emission uses `now()` at the
  sentinel-build-time (separate capture).
- **Public export surface (locked):** the module exports exactly
  (a) the 3 synchronous getters
  `fetchTrafficSourcesLive` / `fetchActivationFunnelLive` /
  `fetchRetentionCohortsLive`; (b) the helpers
  `isLiveModeEnabled` / `isValidEnvelope` /
  `makeLiveEmptySentinel`; (c) the `__testHooks` namespace.
  Exporting `async function fetch*` is FORBIDDEN — every async
  closure is internal.
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
  fetch + every live empty sentinel carries this literal string.
  `'CACHED'` emission anywhere = HARD FAIL.
- **`updatedAt` capture timing + injectable `now()` (D-20601).**
  RESPONSE time only — captured via the module-private `now()`
  function. Direct `Date.now()` calls beyond the one-line `now`
  default initializer = HARD FAIL. Tests inject via
  `__testHooks.setNow(fn)`.
- **Cookie-credentials auth (D-20601).** `credentials: 'include'`
  on every fetch. Bearer Authorization header construction at the
  dashboard layer = HARD FAIL.
- **Empty-sentinel error path (D-20601).** Network reject / 4xx /
  5xx / invalid JSON / payload shape mismatch → live empty
  sentinel (subject to non-regression invariant below); widget
  renders its existing `empty` arm. NO raw error message reaches
  the user-facing surface.
- **Sentinel non-regression invariant (D-20601).** Once a cached
  `ref.value` has been replaced with successfully-fetched data,
  no code path may overwrite it back to a live empty sentinel.
  Locks the future SWR / refetch WPs against silent good-data
  downgrades.
- **Cache-write-before-fetch invariant (D-20601).** Cache-miss
  branch ordering is locked: build sentinel → `cache.set` →
  invoke fetch closure → return `ref.value`. Inverting the
  `cache.set` and fetch-invoke lines = concurrent-dedupe HARD
  FAIL (a two-same-tick test will catch it).
- **Per-key cache (D-20601).** `Map<key, Ref<ServiceResponse>>` per
  fetcher; module-level lifetime. Second call with same key returns
  cached ref's `.value` without kicking off a second fetch.
- **Single-source-of-truth LIVE gate (D-20601).** The shared
  exported `isLiveModeEnabled()` function is the ONLY place the
  triple-condition AND lives: `VITE_USE_MOCKS !== 'true'` AND
  `VITE_API_BASE_URL` is string AND non-empty. `mocks.ts` imports
  and calls it; every LIVE fetcher calls it for defensive
  re-validation. Inline env-var references in `mocks.ts` source =
  HARD FAIL (defense against silent two-gate drift over time).
- **JSON envelope guard reuse (D-20601).** All three fetchers
  validate the response via the same exported
  `isValidEnvelope<T>(value): value is { data: readonly T[] }`
  predicate. Inline `Array.isArray(...)` at a fetcher call site
  = single-validator HARD FAIL.
- **Console policy in production (D-20601).** Only the one-shot
  `console.warn(MISSING_BASE_URL_WARNING)` may fire in production.
  Every `console.debug` / `console.error` site is wrapped in
  `if (import.meta.env.DEV) { ... }`. Bare `console.log` or
  unwrapped DEV-tier output = HARD FAIL.
- **Public export surface (D-20601).** The module exports exactly
  the 3 synchronous getters + `isLiveModeEnabled` /
  `isValidEnvelope` / `makeLiveEmptySentinel` / `__testHooks`.
  Exporting `async function fetch*` = HARD FAIL (breaks the
  composable's synchronous-getter contract).
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
- `analyticsLiveFetchers.ts` `makeLiveEmptySentinel` factory — `// why:`
  citing D-20601 empty-sentinel error-path posture + widget `empty`
  arm fallback + the `Live` prefix's disambiguation role at cache-
  touch points.
- `analyticsLiveFetchers.ts` `isLiveModeEnabled` export — `// why:`
  citing D-20601 single-source-of-truth LIVE gate + defense against
  two-gate drift between `mocks.ts` and the fetchers.
- `analyticsLiveFetchers.ts` `isValidEnvelope` export — `// why:`
  citing D-20601 JSON envelope guard reuse (one validator, three
  fetchers) + the WP-205 server-envelope contract being the
  element-level schema authority.
- `analyticsLiveFetchers.ts` module-private `now` declaration —
  `// why:` citing D-20601 injectable-time-source posture +
  `__testHooks.setNow` swap point + the no-direct-Date.now rule.
- `analyticsLiveFetchers.ts` `__testHooks` export — `// why:`
  TEST-ONLY escape hatch for `now` injection; production code
  never invokes (verification grep counts call sites in
  non-test source = 0).
- `analyticsLiveFetchers.ts` per-fetcher cache-write-before-fetch
  block — `// why:` citing D-20601 cache-write-before-fetch
  invariant (cache.set BEFORE async-fetch invoke; concurrent
  same-tick callers share the in-flight fetch — exactly ONE
  network call per (key, process)).
- `analyticsLiveFetchers.ts` per-fetcher module-level cache —
  `// why:` citing D-20601 per-key cache discipline + SPA
  lifetime + Vue reactivity bridge (sync getter contract
  preservation).
- `analyticsLiveFetchers.ts` per-fetcher `updatedAt: now()` at
  RESPONSE time — `// why:` citing D-20601 capture-timing lock +
  injectable-now posture.
- `analyticsLiveFetchers.ts` per-fetcher fetch-failure catch
  block — `// why:` citing D-20601 fail-silent posture (live
  empty sentinel preserved; widget renders `empty` arm) + sentinel
  non-regression invariant (populated `ref.value` is not
  downgraded on error).
- `analyticsLiveFetchers.ts` DEV-wrapped debug log site — `// why:`
  citing D-20601 console policy (production builds emit only the
  one-shot warn; `console.debug` / `console.error` are DEV-only).
- `analyticsLiveFetchers.ts` one-shot warning guard — `// why:`
  citing D-20601 one-shot lifetime + EC §Locked Values one-shot
  guard mechanism + the WP-205 `userIdHash.ts` precedent.
- `mocks.ts` `liveMode` const (consuming `isLiveModeEnabled()`) —
  `// why:` citing D-20601 LIVE-flip seam + single-source-of-truth
  gate import (no inline env-var check on this side; the helper
  is the only source).
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
  the 3 `fetchX` static re-exports with an
  `isLiveModeEnabled()`-gated const export block (consumes the
  shared predicate; zero inline `VITE_USE_MOCKS` /
  `VITE_API_BASE_URL` references on this side).
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
  baseline + **≥ 14 new tests** in `analyticsLiveFetchers.test.ts`
  covering the full §Acceptance Criteria → LIVE-fetcher behavior
  matrix (concurrent same-key dedupe, sentinel non-regression,
  `__testHooks.setNow` time injection, `isValidEnvelope` direct
  unit test, `isLiveModeEnabled` truth table, DEV-only console
  gating).
- [ ] Locked-constant + helper grep: `grep -nE "MISSING_BASE_URL_WARNING|FETCH_OPTIONS|makeLiveEmptySentinel|isLiveModeEnabled|isValidEnvelope|__testHooks"
  apps/dashboard/src/services/analyticsLiveFetchers.ts` returns ≥ 6
  matches (each of the 6 identifiers declared once).
- [ ] `credentials: 'include'` grep: `grep -nE "credentials: 'include'"
  apps/dashboard/src/services/analyticsLiveFetchers.ts` returns ≥ 1
  match.
- [ ] `source: 'LIVE'` grep: at least 4 matches (sentinel factory +
  3 per-fetcher response wrapper sites).
- [ ] Cache-write-before-fetch ordering (manual review gate):
  `grep -nE "cache\.set|\.set\(.*ref\(" apps/dashboard/src/services/analyticsLiveFetchers.ts`
  returns ≥ 3 matches (one per fetcher). Manually verify each
  `cache.set` precedes its corresponding async-fetch invocation in
  source order.
- [ ] No exported async fetch leakage: `grep -nE "^export async function|^export const fetch[A-Z][A-Za-z]* = async"
  apps/dashboard/src/services/analyticsLiveFetchers.ts` returns 0
  matches (public getters are synchronous; async closures are
  internal).
- [ ] Direct `Date.now()` audit: `grep -nE "Date\.now\(\)"
  apps/dashboard/src/services/analyticsLiveFetchers.ts` returns
  exactly 1 match (the `let now = () => Date.now();` initializer).
- [ ] Console-policy audit: every `console.(debug|error)` match in
  `analyticsLiveFetchers.ts` source is preceded by an
  `if (import.meta.env.DEV)` gate within 1 line (manual review or
  paired grep:
  `grep -nB1 "console\.(debug|error)" apps/dashboard/src/services/analyticsLiveFetchers.ts | grep -E "import\.meta\.env\.DEV"`
  returns count equal to the unwrapped grep count).
- [ ] Layer-boundary grep on the new file: zero
  `@legendary-arena/(game-engine|registry|preplan|server)` matches.

### Sub-task B close

- [ ] `pnpm --filter @legendary-arena/dashboard build` + `test`
  exit 0; full dashboard test count unchanged from Sub-task A
  baseline + ≥ 10 new.
- [ ] `pnpm --filter @legendary-arena/server build` + `test` exit 0;
  full server test count = baseline (no new server tests; CORS array
  edit is non-functional regression-only).
- [ ] Shared LIVE-gate consumption + Live-fetcher imports on
  `mocks.ts`: `grep -nE "isLiveModeEnabled|fetchTrafficSourcesLive|fetchActivationFunnelLive|fetchRetentionCohortsLive"
  apps/dashboard/src/services/mocks.ts` returns ≥ 4 matches
  (gate import + 3 fetcher imports/usages).
- [ ] `mocks.ts` does NOT re-derive the env-var gate:
  `grep -nE "VITE_USE_MOCKS|VITE_API_BASE_URL" apps/dashboard/src/services/mocks.ts`
  returns 0 matches. Single-source-of-truth gate HARD FAIL if
  non-zero.
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
- **`isLiveModeEnabled()` omits any of the three AND conditions** —
  defense against `VITE_USE_MOCKS=false` + unset URL crash mode
  HARD FAIL.
- **`mocks.ts` source contains `VITE_USE_MOCKS` or
  `VITE_API_BASE_URL`** — single-source-of-truth HARD FAIL.
  `mocks.ts` consumes `isLiveModeEnabled()`; it does NOT
  re-derive the condition.
- **Async fetch closure invoked BEFORE `cache.set` in any
  fetcher** — cache-write-before-fetch invariant HARD FAIL;
  concurrent same-tick callers would double-fetch.
- **A populated `ref.value` is overwritten with a live empty
  sentinel on an error path** — sentinel non-regression HARD
  FAIL; locks the contract against the future SWR / refetch WPs.
- **Direct `Date.now()` call in `analyticsLiveFetchers.ts` source
  beyond the `let now = () => Date.now();` initializer** —
  injectable-time HARD FAIL; bypasses `__testHooks.setNow`.
- **`Array.isArray(...)` inlined at a fetcher call site** —
  validator-reuse HARD FAIL; the single `isValidEnvelope<T>`
  is the only payload guard.
- **`export async function fetch*` or `export const fetch* = async`
  in `analyticsLiveFetchers.ts`** — public async leakage HARD FAIL;
  the public getters are synchronous and the async closures stay
  internal.
- **`console.debug` / `console.error` / `console.log` not
  wrapped in `if (import.meta.env.DEV)`** — console policy HARD
  FAIL; production builds would emit dev-tier noise.
- **`__testHooks.setNow` invoked outside test source** —
  production code touching the test escape hatch HARD FAIL.
- **`makeEmptySentinel` (no `Live` prefix) defined or referenced**
  — locked-naming HARD FAIL; the factory is
  `makeLiveEmptySentinel` per EC §Locked Values.
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

### D-20601 — Dashboard Analytics LIVE-Flip Posture: Single-Source-of-Truth Gate, Cache-Write-Before-Fetch, Cookie-Credentials Auth, Sentinel Non-Regression, Injectable `now()`, Shared Envelope Guard, Console Policy, Per-Key SPA Cache, `source: 'LIVE'` Literal-Locked

**Decision:**
The dashboard's 3 analytics widgets
(`TrafficSourcesWidget` / `ActivationFunnelWidget` /
`RetentionCohortsWidget`) flip from MOCK to LIVE via an
`isLiveModeEnabled()`-gated conditional re-export in
`apps/dashboard/src/services/mocks.ts`. The `isLiveModeEnabled()`
predicate is exported from
`apps/dashboard/src/services/analyticsLiveFetchers.ts` and returns
`true` iff ALL of: `import.meta.env.VITE_USE_MOCKS !== 'true'` AND
`typeof import.meta.env.VITE_API_BASE_URL === 'string'` AND
`import.meta.env.VITE_API_BASE_URL.length > 0`. Any condition
failing → fall through to the MOCK factories. The predicate is
the **single source of truth** for the LIVE-mode gate — both
`mocks.ts` (routing) AND every LIVE fetcher (defensive
re-validation at fetch time) consume it. Inline `import.meta.env`
references in `mocks.ts` are FORBIDDEN; the gate must not be
re-derived at any other site (defense against silent two-gate
drift over the long tail of future edits).

The LIVE fetchers
(`fetchTrafficSourcesLive` / `fetchActivationFunnelLive` /
`fetchRetentionCohortsLive` in
`apps/dashboard/src/services/analyticsLiveFetchers.ts`) preserve
the composable's synchronous `() => ServiceResponse<readonly T[]>`
getter contract via a module-level `Map<key, Ref<ServiceResponse>>`
per fetcher. First call with a given key returns the live empty
sentinel (`makeLiveEmptySentinel<T>()` — `{ data: [], updatedAt:
now(), source: 'LIVE' }`) synchronously and kicks off the async
fetch via a fire-and-forget closure. Vue reactivity propagates
fetch completion to the composable + widget. The factory's
`Live` prefix is deliberate — at cache-touch points it
disambiguates against MOCK-factory empty-state outputs.

**Cache-write-before-fetch invariant.** On a cache miss for
`key`, the cache-miss branch executes in this exact source order:
(1) construct `liveRef = ref(makeLiveEmptySentinel<T>())`;
(2) `cache.set(key, liveRef)`; (3) invoke the async fetch closure
(fire-and-forget); (4) return `liveRef.value`. Concurrent same-key
calls within a single tick see the populated cache on step 2 and
skip directly to the cached-branch path — exactly ONE network
fetch per (key, process) is initiated. Inverting steps 2 and 3
would let same-tick callers race past the empty cache and
double-fetch; the test suite verifies via fetch-spy count after
a two-same-tick exercise.

**Sentinel non-regression invariant.** Once a cached `ref.value`
has been replaced with successfully-fetched data, no code path
may overwrite it back to a live empty sentinel. In v1 (no
refetch) the invariant is structurally upheld by never re-entering
the cache-miss branch for an existing key; locking it now means
the future SWR / background-refetch / abort-on-key-change WPs
inherit the rule that a failed refetch must preserve the prior
good data, not silently downgrade it.

`source: 'LIVE'` is the only literal value emitted by successful
LIVE-mode responses in v1. `'CACHED'` (stale-while-revalidate) is
deferred to a future hardening WP.

`updatedAt` is captured at the network RESPONSE time — immediately
before the cached ref's `.value` is replaced with the parsed data.
The live empty sentinel captures `now()` at sentinel-build-time so
the widget freshness chip reads `LIVE · just now` from widget
mount; the timestamp then advances on fetch resolve.

**Injectable `now()` (test determinism).** The fetcher module
declares a module-private `let now: () => number = () =>
Date.now();` invoked at every timestamp capture site. Direct
`Date.now()` calls anywhere else in the module are FORBIDDEN —
exactly one match in source is allowed (the initializer). Tests
swap via the exported `__testHooks.setNow(fn)` escape hatch and
reset in teardown. Production code never invokes `__testHooks`.

**Shared JSON envelope guard.** All three fetchers validate the
response payload via the same exported `isValidEnvelope<T>(value):
value is { data: readonly T[] }` type-predicate — `true` iff
`value` is a non-null object AND
`Array.isArray((value as { data?: unknown }).data)`. Inline
`Array.isArray(...)` at fetcher call sites is FORBIDDEN.
Element-level schema validation is the server's job per the
WP-205 envelope contract; the dashboard's guard is strictly
structural.

**Console policy (production).** The ONLY console output
permitted to fire in production builds is the one-shot
`console.warn(MISSING_BASE_URL_WARNING)`. Every `console.debug` /
`console.error` site MUST be wrapped in
`if (import.meta.env.DEV) { ... }`. Bare `console.log` FORBIDDEN.
This keeps production logs / Sentry-style integrations free of
dev-tier debug noise while preserving rich local-dev visibility.

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
If `isLiveModeEnabled()` evaluates `true` at routing time (in
`mocks.ts`) but returns `false` at fetch time (the defensive
re-check inside the fetcher — defense against the
`VITE_USE_MOCKS=false` + unset URL crash mode AND against
mid-execution env-var corruption), each fetcher returns the live
empty sentinel synchronously AND emits exactly one `console.warn`
per process via a module-level boolean guard. The locked warning
message:
`'[analytics] LIVE mode requested but VITE_API_BASE_URL is unset;
falling back to MOCK. Set the env var in the deployment
environment.'` Per the production console policy this is the
ONLY console output permitted to fire in production builds.

**Rationale:**
The composable + widget pattern locked under D-19607 (Shared Source
Contract) + D-20302 (MOCK→LIVE upgrade-path invariant) was
specifically designed so the LIVE flip is a getter substitution —
widget files stay byte-identical pre/post flip. WP-203 close-out
already verified the widgets contain ZERO literal `mockX` tokens;
this WP preserves that gate by introducing a `_Live`-suffixed
parallel set of getters that the `mocks.ts` seam chooses between
via the shared `isLiveModeEnabled()` predicate.

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
  synchronous fetcher getters (`fetchTrafficSourcesLive` /
  `fetchActivationFunnelLive` / `fetchRetentionCohortsLive`) +
  shared `isLiveModeEnabled` + `isValidEnvelope` +
  `makeLiveEmptySentinel` helpers + module-private injectable
  `now()` + `__testHooks.setNow` escape hatch +
  `MISSING_BASE_URL_WARNING` + `FETCH_OPTIONS` constants +
  module-level per-fetcher caches + one-shot warning guard.
- `apps/dashboard/src/services/analyticsLiveFetchers.test.ts` — ≥
  14 tests covering happy-path + caching + concurrent same-key
  dedupe + sentinel non-regression + `__testHooks` time injection
  + `isValidEnvelope` direct unit + `isLiveModeEnabled` truth
  table + DEV-only console gating + error paths + missing-URL +
  auth + URL construction.
- `apps/dashboard/src/services/mocks.ts` — the
  `isLiveModeEnabled()`-gated conditional re-export block
  (consumes the shared predicate; no inline env-var check on
  this side).
- `apps/server/src/server.mjs` — CORS `origins` array gets 2 new
  entries (`https://dashboard.legendary-arena.com` +
  `http://localhost:4173`).

**Packet:** WP-206 (EC-234).

**Drafted:** 2026-06-04 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---
