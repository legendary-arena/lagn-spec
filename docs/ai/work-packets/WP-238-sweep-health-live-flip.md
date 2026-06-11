# WP-238 — Sweep-Health LIVE Flip (Point the Dashboard at `GET /api/sweep/latest`)

**Status:** Draft
**Primary Layer:** Dashboard (`apps/dashboard/**`) only. No server, engine, registry, or migration change; no new endpoint; no new npm dependency.
**Dependencies:** WP-209 ✅ (`GET /api/sweep/latest` shipped + `sweep_runs` storage), WP-210 ✅ (`SweepHealthWidget` + `useSweepHealth` mock-first), WP-211 ✅ (sweep type drift guard), WP-206 ✅ (`isLiveModeEnabled` + analytics LIVE-fetch pattern), WP-230 ✅ (Pipeline page sweep summary bar), WP-235 ✅ (Pipeline health-rate trend). Parallel-safe with WP-239.

---

## Goal

After this session the dashboard's sweep panels show **real nightly/weekly sweep
results instead of synthetic mock data**. When the deploy environment has
`VITE_USE_MOCKS` off and a non-empty `VITE_API_BASE_URL`, both the `/system`
`SweepHealthWidget` and the `/pipeline` sweep summary bar + health-rate trend
render the live `GET /api/sweep/latest` payload (latest run + last 30 runs);
in local-dev and tests they keep the MOCK factory. This closes the
WP-210-promised "single-file LIVE flip" for sweep, mirroring how WP-206 flipped
the WP-203 analytics widgets.

## Assumes

- `apps/dashboard/src/services/analyticsLiveFetchers.ts` exists and exports
  `isLiveModeEnabled()` plus the three `fetch*Live` analytics fetchers, using a
  synchronous-getter + module-cached `Ref` + fail-silent pattern (WP-206).
- `apps/dashboard/src/services/mocks.ts` already gates analytics via
  `const liveMode = isLiveModeEnabled()` and `liveMode ? fetchXLive : mockX`
  ternaries (lines ~44, ~57–59), and re-exports `mockSweepHealth` +
  `fetchSweepHealth` from `./sweepHealthMocks.js` (lines ~83–84).
- `apps/dashboard/src/services/sweepHealthMocks.ts` exports
  `mockSweepHealth(range: DateRange, nowMs: number): ServiceResponse<SweepHealthSnapshot>`
  with `source: 'MOCK'`.
- `apps/dashboard/src/composables/useSweepHealth.ts` consumes a
  `SweepHealthFetchState = { response: ServiceResponse<SweepHealthSnapshot> | null; error: ApiError | null }`
  and already handles all four arms (`loading | empty | error | data`).
- `apps/dashboard/src/widgets/SweepHealthWidget.vue` and
  `apps/dashboard/src/pages/pipeline/PipelinePage.vue` both import
  `fetchSweepHealth` from `'../services/mocks.js'` / `'../../services/mocks.js'`
  and build `{ response: fetchSweepHealth(range.value, nowMs), error: null }`.
- `apps/dashboard/src/types/sweep.ts` defines `SweepHealthSnapshot` (`{ latest: SweepRunSummary | null; recentRuns: readonly SweepRunSummary[] }`)
  and `SweepRunSummary`, with `anomalyCounts` keyed by opaque `string` (D-20703).
- `GET /api/sweep/latest` is catalogued `Wired`, `authenticated-session-required`,
  returns `{ data: { latest, recentRuns } }`, and the shipped analytics LIVE
  fetchers already authenticate successfully against the same
  `requireAuthenticatedSession` orchestrator (WP-112).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

## Session Context

The whole sweep + closed-loop backend shipped (WP-193/194/195 runner+oracle,
WP-209/234 storage+cron, WP-231/232/233 triage), but the dashboard's sweep
panels were authored MOCK-first per the WP-197 D-19702 / WP-204 D-20402
convention: `fetchSweepHealth` is a straight re-export of `mockSweepHealth`
([mocks.ts](../../../apps/dashboard/src/services/mocks.ts) line 84), so every
sweep number an operator sees is synthetic. Unlike the analytics widgets — which
WP-206 already flipped through the shared `isLiveModeEnabled()` gate — sweep was
never given a LIVE fetcher, and its `fetchSweepHealth` alias is **not** gated by
`liveMode`. This WP adds the missing sweep LIVE fetcher and routes the existing
alias through the same gate, so the widgets/pages change zero bytes and the flip
is a one-file seam in `mocks.ts`, exactly as WP-210 promised.

The analytics envelope is `{ data: readonly T[] }`; the sweep envelope is an
**object** `{ data: { latest, recentRuns } }`. That is the only structural
deviation from the WP-206 pattern, and it lives entirely inside the new fetcher's
shape guard.

## Scope (In)

**A) New sweep LIVE fetcher — `apps/dashboard/src/services/sweepLiveFetchers.ts` (NEW)**
Mirror `analyticsLiveFetchers.ts` for a single resource:
- `fetchSweepHealthLive(range: DateRange, _nowMs: number): ServiceResponse<SweepHealthSnapshot>`
  — a **synchronous getter**: returns the module-cached `ServiceResponse` if
  present, else a fresh LIVE empty sentinel `{ data: { latest: null, recentRuns: [] }, updatedAt: now(), source: 'LIVE' }`,
  and fires a fire-and-forget `void (async () => { … })()` fetch that populates
  the cached `Ref` on success.
- Re-import (do NOT re-derive) `isLiveModeEnabled` from `./analyticsLiveFetchers.js`;
  re-validate it at fetch time before issuing the request.
- `FETCH_OPTIONS` identical to the analytics fetchers (`credentials: 'include'`,
  `Accept: application/json`) so the dashboard session is forwarded **exactly as
  the working analytics LIVE fetchers do** — match their auth mechanism verbatim.
- URL: `${VITE_API_BASE_URL}/api/sweep/latest` (the file legitimately reads the
  base URL, like the analytics fetchers; the env-var gate lives in
  `isLiveModeEnabled`).
- `isValidSweepEnvelope(value): value is { data: SweepHealthSnapshot }` — validates
  `data` is a non-null object, `latest === null` OR `typeof latest === 'object'`,
  `Array.isArray(recentRuns)`, AND every element of `recentRuns` is a non-null
  object. Lightweight structural check only — not full field validation (the drift
  test guards field sets). On any shape mismatch / HTTP error / network reject,
  fail silently and preserve prior cache state (no throw to the widget).
- **Async safety:** the fire-and-forget closure is fully wrapped in `try/catch`,
  including the `await response.json()` parse — no error may escape the closure.
- A single module-level cached `Ref<ServiceResponse<SweepHealthSnapshot>>` (one
  resource — the endpoint ignores query params per WP-209), cleared only via
  `__testHooks.clearCache()` (process-lifetime; no TTL / interval / refetch), plus a
  `__testHooks` object (`setNow`, `setEnv`, `resetWarningGuard`, `clearCache`)
  matching the analytics test seams. `now()` inside the fetcher is the module-level
  time provider that `__testHooks.setNow` overrides — never a bare `Date.now()` —
  so the sentinel `updatedAt` is deterministic in tests.
- **Single in-flight fetch:** cache-write-before-fetch is the dedup mechanism —
  seeding the cached `Ref` before firing means a later-tick call returns the cached
  entry and does NOT fire a second request; a module-level `inFlight` guard is an
  acceptable belt-and-suspenders equivalent. Replicate whichever mechanism the
  analytics fetchers use. Net invariant: at most one network request per resource
  for the process lifetime.
- **`range` is ignored intentionally** (API v1 ignores query params) and MUST NOT
  be serialized into the request URL.
- No `.reduce()`; explicit `for…of` where iteration is needed; every function has
  JSDoc; `// why:` on the credentials choice, the sentinel-before-fetch ordering,
  and the object-envelope guard.

**B) Flip seam — `apps/dashboard/src/services/mocks.ts` (MODIFIED)**
Replace the ungated dual re-export at lines ~83–84 with the gated form, mirroring
the analytics block:
- Keep `export { mockSweepHealth } from './sweepHealthMocks.js';` (tests assert the
  factory directly).
- Add `import { fetchSweepHealthLive } from './sweepLiveFetchers.js';`
- `export const fetchSweepHealth = liveMode ? fetchSweepHealthLive : mockSweepHealth;`
  (reusing the existing `const liveMode = isLiveModeEnabled()` — do NOT introduce a
  second gate; the file must stay free of `VITE_`-prefixed literals).

**C) Fetcher tests — `apps/dashboard/src/services/sweepLiveFetchers.test.ts` (NEW)**
Mirror `analyticsLiveFetchers.test.ts`: `isLiveModeEnabled` truth table reuse, the
`isValidSweepEnvelope` object-shape guard (valid, `latest: null`, missing keys,
non-array `recentRuns`, and a `recentRuns` element that is not an object),
happy-path sentinel-then-populate, cache hit / dedupe, sentinel non-regression on
error, network-reject / HTTP-error / invalid-JSON paths, the one-shot missing-URL
warning, and `credentials: 'include'` presence on the issued request. Plus three
deterministic invariants: (a) the sentinel identity is **replaced, not mutated**,
on a successful fetch; (b) the cached reference is **stable** across calls when no
update occurs; (c) the in-flight guard yields **exactly one** network request
across multiple calls (fetch-spy count). `node:test` + `node:assert/strict` only;
no network; no boardgame.io.

## Out of Scope

- **Server-side changes** — `GET /api/sweep/latest`, `sweep.routes.ts`,
  `sweep.types.ts`, and the `sweep_runs` table are untouched; this is a pure
  client-consumption flip.
- **Widget / page / composable edits** — `SweepHealthWidget.vue`,
  `PipelinePage.vue`, `useSweepHealth.ts`, `useSweepTrend.ts`, and
  `useAgentPipeline.ts` change **zero bytes**; the `fetchSweepHealth` alias
  identifier is the only seam.
- **`endpoints.ts` `isMockMode()`** — the legacy direct-env reader is not used and
  is not modified; the sweep fetcher uses the shared `isLiveModeEnabled()` only.
- **`useMockModeIndicator.ts`** — already gates on `isLiveModeEnabled()`; the
  mock-mode banner needs no change.
- **Triage surfaces** (inspection / handoff) — that is WP-239.
- **Mock factory shape** — `sweepHealthMocks.ts` is not changed; MOCK stays the
  local-dev/test default.
- **New caching/retry/polling infrastructure** — match the analytics fetch-once
  cached-`Ref` behaviour; no refetch loop, no SWR.
- **`anomalyCounts` opacity** — D-20703 holds; the fetcher copies keys verbatim
  and never branches on anomaly kind.

## Files Expected to Change

- `apps/dashboard/src/services/sweepLiveFetchers.ts` — **new** — `fetchSweepHealthLive` synchronous getter + `isValidSweepEnvelope` object guard + cached `Ref` + `__testHooks`; mirrors `analyticsLiveFetchers.ts` for one object-envelope resource.
- `apps/dashboard/src/services/sweepLiveFetchers.test.ts` — **new** — fetcher unit tests mirroring `analyticsLiveFetchers.test.ts`.
- `apps/dashboard/src/services/mocks.ts` — **modified** — gate `fetchSweepHealth` behind the existing `liveMode` (`liveMode ? fetchSweepHealthLive : mockSweepHealth`); retain the `mockSweepHealth` re-export; no new env-var literal.
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-238.
- `docs/ai/DECISIONS.md` — **modified** — D-23801, D-23802 (Active at close).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-238 checked off with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-269 status flipped to Done.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — WP-238 node flipped to Done.

~8 files: 3 App source/test + 5 governance. No engine/server/registry/migration change, no new endpoint, no new dependency.

## Locked Contract Values

- **LIVE-mode gate (D-20601, reused):** `isLiveModeEnabled()` imported from `./analyticsLiveFetchers.js` — the single source of truth (`VITE_USE_MOCKS !== 'true'` AND `VITE_API_BASE_URL` is a non-empty string). `mocks.ts` and the new fetcher MUST NOT re-derive the env gate.
- **Endpoint:** `GET /api/sweep/latest` (no query params; v1 ignores `?limit/?since/?runId` per WP-209).
- **Live envelope:** `{ data: { latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] } }` — `data` is an OBJECT, not an array.
- **LIVE empty sentinel:** `{ data: { latest: null, recentRuns: [] }, updatedAt: now(), source: 'LIVE' }`.
- **Source label:** `'LIVE'` on every live `ServiceResponse`; `'MOCK'` stays only in `sweepHealthMocks.ts`.
- **Fetch options:** `{ credentials: 'include', headers: { Accept: 'application/json' } }` — identical to the analytics LIVE fetchers (forwards the WP-112 session).
- **`anomalyCounts` opacity (D-20703):** keys stay opaque `string`; the fetcher copies them verbatim and never enumerates a closed anomaly-class union.
- **Cache lifetime:** process-lifetime only — no automatic invalidation, TTL, interval, or refetch; cleared only via `__testHooks.clearCache()`. At most one network request per resource for the process lifetime.
- **`range` handling:** the `range` parameter is ignored intentionally (API v1 ignores query params) and MUST NOT be serialized into the request URL.
- **Time source:** `now()` is the module-level time provider overridden by `__testHooks.setNow` — never a bare `Date.now()` inside the fetcher.
- **Envelope guard depth:** `data` is a non-null object; `latest` is `null` or an object; `recentRuns` is an array of non-null objects. Lightweight structural check only (field sets are the drift test's responsibility).
- **Flip seam:** exactly one line in `mocks.ts` changes the `fetchSweepHealth` binding from a `mockSweepHealth` re-export to `liveMode ? fetchSweepHealthLive : mockSweepHealth`.

## Acceptance Criteria

1. `apps/dashboard/src/services/sweepLiveFetchers.ts` exists and exports `fetchSweepHealthLive` (synchronous getter) and `__testHooks`; it imports `isLiveModeEnabled` from `./analyticsLiveFetchers.js` and does not define a second env gate.
2. `fetchSweepHealthLive` returns a `ServiceResponse<SweepHealthSnapshot>` synchronously: a cached value if present, else the LIVE empty sentinel with `source: 'LIVE'`.
3. The issued request targets `…/api/sweep/latest` with `credentials: 'include'`, validates the object envelope via `isValidSweepEnvelope`, and on any error preserves prior cache state without throwing.
4. `mocks.ts` exports `fetchSweepHealth` as `liveMode ? fetchSweepHealthLive : mockSweepHealth`, still re-exports `mockSweepHealth`, and contains zero `VITE_`-prefixed literals.
5. `SweepHealthWidget.vue` and `PipelinePage.vue` are byte-identical to their pre-session content (`git diff` empty for both).
6. With `VITE_USE_MOCKS=true` (or unset URL), `fetchSweepHealth === mockSweepHealth` (MOCK default preserved for local-dev/tests).
7. `sweepLiveFetchers.test.ts` covers: gate truth table, the four envelope-guard cases, sentinel-then-populate, cache dedupe, error non-regression, and credentials presence — and all pass.
8. `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 with no new error vs the baseline recorded at session start.
9. `pnpm --filter @legendary-arena/dashboard test` exits 0 with net-new sweep-fetcher tests added and the pre-existing suite still green.
10. `pnpm --filter @legendary-arena/dashboard build` exits 0.
11. Across multiple `fetchSweepHealthLive` calls (same or later tick, before/after resolve), exactly **one** network request is issued per resource — verified by a fetch-spy count test; no TTL/interval/polling exists.
12. `mocks.ts` imports `isLiveModeEnabled` exactly once and contains no other environment-derived branching — the `liveMode` constant is the only gate.

## Verification Steps

```pwsh
# 1. New fetcher present with the synchronous getter + shared gate
Select-String -Path "apps/dashboard/src/services/sweepLiveFetchers.ts" -Pattern "fetchSweepHealthLive","isLiveModeEnabled","isValidSweepEnvelope"
# Expected: all three patterns match

# 2. Credentials are forwarded (session auth parity with analytics)
Select-String -Path "apps/dashboard/src/services/sweepLiveFetchers.ts" -Pattern "credentials: 'include'"
# Expected: 1 match

# 3. Flip seam in mocks.ts is gated; mock factory still re-exported
Select-String -Path "apps/dashboard/src/services/mocks.ts" -Pattern "fetchSweepHealth = liveMode \? fetchSweepHealthLive : mockSweepHealth"
Select-String -Path "apps/dashboard/src/services/mocks.ts" -Pattern "export \{ mockSweepHealth \}"
# Expected: 1 match each

# 4. mocks.ts re-derives no env gate
(Select-String -Path "apps/dashboard/src/services/mocks.ts" -Pattern "VITE_").Count
# Expected: 0

# 5. Consumers untouched
git diff --stat -- apps/dashboard/src/widgets/SweepHealthWidget.vue apps/dashboard/src/pages/pipeline/PipelinePage.vue
# Expected: no output (zero changes)

# 6. No engine/server import leaked into the dashboard
(Select-String -Path "apps/dashboard/src/services/sweepLiveFetchers.ts" -Pattern "@legendary-arena/game-engine","apps/server").Count
# Expected: 0

# 7. mocks.ts gate is singular — isLiveModeEnabled imported once; no second env gate
(Select-String -Path "apps/dashboard/src/services/mocks.ts" -Pattern "import \{[^}]*isLiveModeEnabled").Count
# Expected: 1   (combined with step 4's VITE_ count = 0)

# 8. Single-request / in-flight dedup proven by the fetcher test; no polling timers
Select-String -Path "apps/dashboard/src/services/sweepLiveFetchers.test.ts" -Pattern "callCount","single","in-flight"
(Select-String -Path "apps/dashboard/src/services/sweepLiveFetchers.ts" -Pattern "setInterval","setTimeout").Count
# Expected: >= 1 dedup assertion present; 0 timer matches

# 9. Build / test / typecheck
pnpm --filter @legendary-arena/dashboard typecheck   # Expected: exit 0, no new error vs baseline
pnpm --filter @legendary-arena/dashboard test        # Expected: exit 0, sweep-fetcher tests added, pre-existing green
pnpm --filter @legendary-arena/dashboard build       # Expected: exit 0
```

## Definition of Done

- [ ] All 12 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (net-new sweep-fetcher tests; pre-existing green)
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 — NO new error vs the baseline recorded at session start
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] `SweepHealthWidget.vue` and `PipelinePage.vue` are byte-identical (git diff empty)
- [ ] `mocks.ts` contains zero `VITE_`-prefixed literals and gates `fetchSweepHealth` via the existing `liveMode`
- [ ] Governance updated: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-23801, D-23802 Active), `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`, `docs/05-ROADMAP-MINDMAP.md`
- [ ] No files outside `## Files Expected to Change` were modified

## Vision Alignment

**N/A.** This WP lands an operator-only internal transport change: it moves
already-persisted sweep summaries from the server read path onto an operator
screen. It touches no §17.1 trigger surface — no scoring/PAR/leaderboard, no
replay storage, no RNG sourcing, no determinism guarantee, no card data, no
monetization or public surface. The sweep results themselves are produced by the
engine simulation (WP-193/195) and are unchanged here; this WP neither computes
nor alters them. Per the WP-235 precedent (also a sweep-derived operator
surface, marked N/A), no `## Vision Alignment` clause list is required.

## Funding Surface Gate

**N/A.** No global-nav funding affordance, no Registry-viewer funding surface, no
account funding attribution, no user-visible funding copy (WP-097 G-1..G-7 all
untouched). Operator-only dashboard.

## API Catalog Update

**N/A.** No HTTP endpoint and no `apps/server/src/**` library function is added,
modified, removed, or status-changed. `GET /api/sweep/latest` is already
catalogued `Wired` / `authenticated-session-required`
([api-endpoints.md](../REFERENCE/api-endpoints.md) line 159) and that row already
describes it as feeding the dashboard; this WP only makes the client actually
consume it, leaving the catalog row correct as-is. Per §21.4, this is the N/A
path with justification.

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-11:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present and non-empty; Out of Scope lists 8 exclusions (server, consumers, `endpoints.ts`, mock-mode banner, triage, mock shape, caching infra, anomaly opacity) |
| 2 | PASS | Engine-wide + packet-specific constraints carried via the standard preamble; locked values explicit; ESM/Node v22/`node:`/full-file/human-style per 00.6 apply |
| 3 | PASS | `## Assumes` lists every dependency file with required exports/shapes; BLOCKED clause present |
| 4 | PASS | Context cited with specific files + the live-fetch precedent (`analyticsLiveFetchers.ts`), D-20601/D-20703, ARCHITECTURE Layer Boundary |
| 5 | PASS | ~8 files, each with disposition; App-layer only; bounded |
| 6 | PASS | `SweepHealthSnapshot`/`SweepRunSummary`/`anomalyCounts`/`isLiveModeEnabled` match shipped names exactly |
| 7 | PASS | No new npm dependency; built-in `fetch` only |
| 8 | PASS | Dashboard-only; no DB/WebSocket/engine boundary crossed; `apps/dashboard` imports no `apps/server`/engine |
| 9 | PASS | PowerShell `Select-String` greps; no Unix assumptions |
| 10 | PASS | No new env var introduced (reuses `VITE_USE_MOCKS` / `VITE_API_BASE_URL` via the shared gate); no secret in output |
| 11 | N/A | No new auth model; reuses the shipped WP-112 session via `credentials: 'include'` parity |
| 12 | PASS | `node:test`/`node:assert` only; no boardgame.io; no network/DB in tests |
| 13 | PASS | Exact `pnpm --filter` commands with expected output |
| 14 | PASS | 12 binary, observable acceptance criteria aligned to deliverables |
| 15 | PASS | DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/ROADMAP + scope-boundary check |
| 16 | PASS | Human-style: no premature abstraction, explicit control flow, no `.reduce()`, JSDoc, `// why:` on non-obvious choices |
| 17 | N/A | No scoring/replay/RNG/card-data/monetization surface (see Vision Alignment) |
| 18 | PASS | Greps target presence patterns, not forbidden-token enumerations; no prose enumerates a forbidden list |
| 19 | N/A | Not a repo-state-summarizing artifact |
| 20 | N/A | No funding surface (see Funding Surface Gate) |
| 21 | N/A | No endpoint/library-function surface touched (see API Catalog Update) |

Reserved decisions (Active at close): **D-23801** — sweep LIVE fetcher mirrors
the WP-206 analytics pattern (shared `isLiveModeEnabled` gate, synchronous
cached-`Ref` getter, fail-silent, `credentials:'include'` session parity,
object-envelope `{latest,recentRuns}` shape guard). **D-23802** — `mocks.ts` flip
seam gates `fetchSweepHealth` via the existing `liveMode`; widgets/pages stay
byte-identical; MOCK remains the local-dev/test default; `mockSweepHealth`
re-export retained.
