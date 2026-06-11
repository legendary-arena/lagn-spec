# EC-269 — Sweep-Health LIVE Flip (Execution Checklist)

**Source:** docs/ai/work-packets/WP-238-sweep-health-live-flip.md
**Layer:** Dashboard (`apps/dashboard/**`) only — no server/engine/registry/migration change.

> Use locked values from WP-238 verbatim. EC-269 is the operational order +
> gates + failure smells; if EC-269 and WP-238 conflict, WP-238 wins.

## Before Starting

- [ ] WP-206 shipped: `apps/dashboard/src/services/analyticsLiveFetchers.ts` exports `isLiveModeEnabled` and the `fetch*Live` analytics fetchers; read it entirely as the structural template.
- [ ] WP-210/211 shipped: `types/sweep.ts` (`SweepHealthSnapshot`, `SweepRunSummary`), `sweepHealthMocks.ts` (`mockSweepHealth`), and `types/sweep.drift.test.ts` exist.
- [ ] Confirm `mocks.ts` already has `const liveMode = isLiveModeEnabled()` and the analytics `liveMode ? …Live : mockX` ternaries (lines ~44, ~57–59).
- [ ] **Baseline record (paste into the session log):** `pnpm --filter @legendary-arena/dashboard test` pass/fail counts; `pnpm --filter @legendary-arena/dashboard typecheck` (`vue-tsc --noEmit`) exit code + any pre-existing errors; `pnpm --filter @legendary-arena/dashboard build` exit code.
- [ ] Confirm how the **shipped analytics LIVE fetchers authenticate** (cookie via `credentials: 'include'` vs Authorization header) and replicate that mechanism EXACTLY — do not invent a new one.
- [ ] Read WP-238 §Goal, §Session Context, §Scope (In/Out), §Locked Contract Values, §Acceptance Criteria.

## Locked Values (verbatim from WP-238 — do not re-derive)

- LIVE-mode gate (D-20601, reused): `isLiveModeEnabled()` from `./analyticsLiveFetchers.js` — single source of truth; no second gate.
- Endpoint: `GET /api/sweep/latest` (no query params; v1 ignores them).
- Live envelope: `{ data: { latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] } }` — `data` is an OBJECT, not an array.
- LIVE empty sentinel: `{ data: { latest: null, recentRuns: [] }, updatedAt: now(), source: 'LIVE' }`.
- Source label: `'LIVE'` on every live response; `'MOCK'` stays only in `sweepHealthMocks.ts`.
- Fetch options: `{ credentials: 'include', headers: { Accept: 'application/json' } }` — identical to analytics LIVE fetchers.
- `anomalyCounts` opacity (D-20703): keys stay opaque `string`; copy verbatim; never enumerate a closed anomaly-class union.
- Cache lifetime: process-lifetime; cleared only via `__testHooks.clearCache()`; at most one request per resource; no TTL/interval/refetch.
- `range`: ignored (API v1); never serialized into the URL.
- Time source: module-level `now()` overridden by `__testHooks.setNow`; no bare `Date.now()`.
- Envelope guard depth: `data` non-null object; `latest` null-or-object; `recentRuns` array of non-null objects (lightweight only).
- Flip seam: one line in `mocks.ts` — `export const fetchSweepHealth = liveMode ? fetchSweepHealthLive : mockSweepHealth;`.

## Guardrails

- **App layer only.** Touch only `apps/dashboard/src/services/**` + the 5 governance files. No server/engine/registry/migration edit.
- **No second env gate.** Import `isLiveModeEnabled`; never read `import.meta.env.VITE_USE_MOCKS` inside `mocks.ts`. The new fetcher MAY read `VITE_API_BASE_URL` for the URL (analytics parity), but the boolean gate is the shared predicate only.
- **Widgets/pages are frozen.** `SweepHealthWidget.vue` and `PipelinePage.vue` must end byte-identical (git diff empty). The only seam is the `fetchSweepHealth` alias in `mocks.ts`.
- **Synchronous getter.** `fetchSweepHealthLive` returns a `ServiceResponse` immediately (cached or sentinel); the fetch is fire-and-forget. Never return a `Promise`.
- **Cache-write-before-fetch.** Populate/seed the cached `Ref` before firing the async closure so a same-tick second call sees it.
- **Single in-flight fetch.** At most one network request per resource for the process lifetime. Cache-write-before-fetch already yields this (a later-tick call returns the cached entry, not a new fetch); an explicit module-level `inFlight` guard is an acceptable equivalent. Replicate the analytics fetcher's mechanism.
- **No implicit refresh.** No re-fetch after the initial request unless the cache is explicitly cleared via `__testHooks.clearCache()`. No TTL, interval, polling, or parameter-driven invalidation.
- **`range` is frozen.** The `range` parameter is ignored (API v1) and MUST NOT be serialized into the URL.
- **Async safety.** The fire-and-forget closure is fully wrapped in `try/catch`, including `await response.json()`. No error escapes the closure.
- **Deterministic time.** Use the module-level `now()` overridden by `__testHooks.setNow`; never a bare `Date.now()` in the fetcher.
- **Fail-silent.** No error path throws to the widget; preserve prior cache state; DEV-only one-shot `console.warn` on missing URL.
- **Object-envelope guard.** `isValidSweepEnvelope` validates `data` non-null object, `latest === null` or object, `recentRuns` an array of non-null objects — NOT the analytics `{ data: [] }` array shape. Lightweight structural check only; field sets are the drift test's job.
- **`typecheck` is a DoD gate.** `vite build` and `node:test` do not typecheck; run `vue-tsc --noEmit` explicitly.

## Required `// why:` Comments

- `sweepLiveFetchers.ts` (D-20601) — why `isLiveModeEnabled` is imported, not re-derived (two gates would drift silently).
- `sweepLiveFetchers.ts` — why `credentials: 'include'` (forward the WP-112 session, matching the analytics fetchers).
- `sweepLiveFetchers.ts` — why the sentinel is seeded before the async fetch (same-tick dedupe).
- `sweepLiveFetchers.ts` (D-20703) — why `anomalyCounts` keys are copied verbatim and never branched on.
- `sweepLiveFetchers.ts` — why `range` is accepted in the signature but never serialized into the URL (API v1 ignores query params; signature parity with the mock).
- `sweepLiveFetchers.ts` — why at most one request fires per resource (cache-write-before-fetch dedup).
- `mocks.ts` (D-23802) — why the `fetchSweepHealth` alias is gated through the existing `liveMode` while keeping the `mockSweepHealth` re-export.

## Files to Produce

- `apps/dashboard/src/services/sweepLiveFetchers.ts` — **new** — `fetchSweepHealthLive` + `isValidSweepEnvelope` + cached `Ref` + `__testHooks`.
- `apps/dashboard/src/services/sweepLiveFetchers.test.ts` — **new** — fetcher unit tests mirroring `analyticsLiveFetchers.test.ts`.
- `apps/dashboard/src/services/mocks.ts` — **modified** — gate `fetchSweepHealth`; retain `mockSweepHealth` re-export; no `VITE_` literal.
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-238.
- `docs/ai/DECISIONS.md` — **modified** — D-23801, D-23802 (Active).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-238 checked off + date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-269 → Done.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — WP-238 node → Done.

~8 files: 3 App source/test + 5 governance.

## After Completing

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; net-new sweep-fetcher tests added; pre-existing green vs baseline.
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0; no new error vs baseline.
- [ ] `Select-String sweepLiveFetchers.ts -Pattern "fetchSweepHealthLive","isLiveModeEnabled","isValidSweepEnvelope"` → all match.
- [ ] `Select-String sweepLiveFetchers.ts -Pattern "credentials: 'include'"` → 1 match.
- [ ] `Select-String mocks.ts -Pattern "liveMode \? fetchSweepHealthLive : mockSweepHealth"` → 1 match.
- [ ] `(Select-String mocks.ts -Pattern "VITE_").Count` → 0.
- [ ] `git diff --stat SweepHealthWidget.vue PipelinePage.vue` → no output.
- [ ] `(Select-String sweepLiveFetchers.ts -Pattern "@legendary-arena/game-engine","apps/server").Count` → 0.
- [ ] `(Select-String mocks.ts -Pattern "import \{[^}]*isLiveModeEnabled").Count` → 1 (single gate import; with the VITE_ count 0 above).
- [ ] `(Select-String sweepLiveFetchers.ts -Pattern "setInterval","setTimeout").Count` → 0 (no polling/TTL); the request URL is `…/api/sweep/latest` with no `range` query.
- [ ] Fetcher test proves exactly one network request per resource across multiple calls (in-flight/dedup) and that the sentinel is replaced (not mutated) on success.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` updated (D-23801, D-23802 Active).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-269 → Done.
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-238 → Done.

## Common Failure Smells

- Re-reading `import.meta.env.VITE_USE_MOCKS` inside `mocks.ts` or the fetcher → two drifting gates. Use the shared `isLiveModeEnabled()` only.
- Returning a `Promise` from `fetchSweepHealthLive` → widget expects a synchronous `ServiceResponse`. Return cached-or-sentinel synchronously; populate async.
- Copy-pasting the analytics `{ data: [] }` array guard → the sweep envelope is an object. The guard must validate `{ latest, recentRuns }`.
- Editing `SweepHealthWidget.vue`/`PipelinePage.vue` "to wire it up" → the alias swap is the only seam; consumer diffs must be empty.
- Throwing on HTTP 401/500 → blanks the panel. Fail silently, keep prior cache, surface nothing to the widget.
- Dropping the `mockSweepHealth` re-export → factory-direct tests break. Keep both exports.
- Omitting `credentials: 'include'` → live call 401s against the session-gated endpoint.
- Treating the cached sentinel as "no data" and re-fetching → duplicate network calls. Cache-presence (any entry, including the sentinel) means do not fetch again.
- Wiring `range` into the URL "to be correct" → API v1 ignores it; keep the URL query-free.
- Letting an `await response.json()` rejection escape the closure → unhandled rejection. Wrap the entire closure in try/catch.

## DECISIONS.md Entries (D-23801..D-23802)

Reserved in docs/ai/DECISIONS.md (Reserved (proposed) at draft → Active at close):
**D-23801** — Sweep LIVE fetcher mirrors the WP-206 analytics live-fetch pattern: shared `isLiveModeEnabled()` gate, synchronous cached-`Ref` getter, fail-silent with prior-state preservation, `credentials:'include'` session parity, and an object-envelope `{latest,recentRuns}` shape guard (the one structural deviation from the array-envelope analytics fetchers).
**D-23802** — The `mocks.ts` flip seam gates `fetchSweepHealth` via the existing `liveMode` constant (`liveMode ? fetchSweepHealthLive : mockSweepHealth`); widget/page bytes are unchanged; MOCK stays the local-dev/test default; the `mockSweepHealth` re-export is retained for factory-direct tests. Fulfils the WP-210-promised single-file sweep LIVE flip.
