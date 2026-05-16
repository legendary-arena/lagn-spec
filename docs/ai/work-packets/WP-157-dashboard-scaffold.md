# WP-157 — Dashboard Scaffold: Monorepo Integration + PrimeVue

**Status:** Draft
**Primary Layer:** Client / new app (`apps/dashboard`)
**Dependencies:** None (parallel-safe with WP-153–156)
**EC:** EC-168
**Baseline:** `origin/main` at time of execution

---

## Goal

After this packet, `apps/dashboard/` exists as a Vite-built Vue 3 + PrimeVue 4
SPA deployable to `dashboard.legendary-arena.com` via a separate Cloudflare
Pages project. It renders five pages (Overview, Players, Monetization,
Gameplay, System Health) plus a hidden Debug page, all with mock data. It
includes a feature-flag composable, data-freshness indicators on every widget,
URL-state for date range, a drilldown pattern (KPI click → PrimeVue DataTable),
and role-based route guards. The app builds and typechecks cleanly within the
pnpm workspace. No backend dependency exists at this stage.

---

## Assumes

- `pnpm install` and `pnpm -r build` exit 0 against `main`.
- Cloudflare Pages project for `apps/dashboard` can be created (DNS zone is
  on Cloudflare, per `docs/ops/DOMAINS.md`).
- PrimeVue 4 is available on npm (current stable: ^4.x).
- No shared contracts package exists yet �� types are local to the dashboard
  until a future WP extracts them (D-15704).
- No existing `apps/dashboard/` directory on `main`.

If any of the above is false, this packet is **BLOCKED**.

---

## Context

The project needs an internal admin dashboard at
`dashboard.legendary-arena.com` for operational analytics, system health
monitoring, and live-match visibility. This packet lands the frontend SPA
scaffold in the monorepo with mock data — no backend endpoints required.
The dashboard is operator-facing (not player-facing) and uses PrimeVue 4
as its component library (D-15701).

Prior art: `apps/legends-board` (WP-143) is the closest architectural
sibling — a data-only Vue 3 + Vite SPA deployed to Cloudflare Pages with
no engine/server runtime imports. The dashboard adds Pinia, PrimeVue, and
Axios on top of that shape.

**Why a single WP (not split):** this is a single-layer (Client) scaffold
with no engine, server, or cross-layer contract changes. All ~30 files are
new; no existing contract files are modified. Splitting would produce
artificial dependencies between halves that share no boundary.

**Authority chain (read order at execution):**
- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)`
- `.claude/rules/code-style.md`
- This WP (WP-157)
- EC-168
- `docs/ai/REFERENCE/00.6-code-style.md`

---

## Scope (In)

- New `apps/dashboard/` directory (entire source tree)
- Root `package.json` (add `dash:dev` and `dash:build` scripts)
- `docs/ops/DOMAINS.md` (add `dashboard.legendary-arena.com` entry)
- `docs/ai/DECISIONS.md` (D-15701 through D-15707)
- `docs/ai/work-packets/WORK_INDEX.md` (add WP-157 row)
- `docs/ai/execution-checklists/EC_INDEX.md` (add EC-168 row)

## Scope (Out)

- `packages/` — no new packages created (contracts deferred to WP-159)
- `apps/server/` — no backend endpoints (deferred to WP-160)
- `apps/arena-client/` — untouched
- `apps/legends-board/` — untouched
- `apps/registry-viewer/` — untouched
- `packages/game-engine/` — untouched
- `packages/registry/` — untouched
- `data/migrations/` — no schema changes
- `docs/ai/REFERENCE/api-endpoints.md` — no new endpoint rows
- Cloudflare Pages deployment (post-merge ops step, not in this WP)
- Real WebSocket connection (placeholder only; WP-161)
- `packages/contracts/` directory (WP-159)

---

## Files Expected to Change

**New files (~30):**
- `apps/dashboard/package.json`
- `apps/dashboard/index.html`
- `apps/dashboard/tsconfig.json`
- `apps/dashboard/vite.config.ts`
- `apps/dashboard/.env.example`
- `apps/dashboard/src/main.ts`
- `apps/dashboard/src/App.vue`
- `apps/dashboard/src/env.d.ts`
- `apps/dashboard/src/types/index.ts`
- `apps/dashboard/src/router/index.ts`
- `apps/dashboard/src/layouts/AppLayout.vue`
- `apps/dashboard/src/stores/auth.ts`
- `apps/dashboard/src/stores/metrics.ts`
- `apps/dashboard/src/stores/alerts.ts`
- `apps/dashboard/src/services/api.ts`
- `apps/dashboard/src/services/endpoints.ts`
- `apps/dashboard/src/services/mocks.ts`
- `apps/dashboard/src/services/websocket.ts`
- `apps/dashboard/src/composables/useFetch.ts`
- `apps/dashboard/src/composables/useRealtimeMetrics.ts`
- `apps/dashboard/src/composables/useFeatureFlags.ts`
- `apps/dashboard/src/composables/useDateRange.ts`
- `apps/dashboard/src/composables/useDataFreshness.ts`
- `apps/dashboard/src/widgets/KpiCard.vue`
- `apps/dashboard/src/widgets/ActivePlayersWidget.vue`
- `apps/dashboard/src/widgets/MatchesRunningWidget.vue`
- `apps/dashboard/src/widgets/RevenueTodayWidget.vue`
- `apps/dashboard/src/widgets/ServerStatusWidget.vue`
- `apps/dashboard/src/widgets/DauChartWidget.vue`
- `apps/dashboard/src/widgets/RevenueChartWidget.vue`
- `apps/dashboard/src/widgets/AlertsPanel.vue`
- `apps/dashboard/src/components/charts/BaseChart.vue`
- `apps/dashboard/src/pages/auth/LoginPage.vue`
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue`
- `apps/dashboard/src/pages/players/PlayerAnalyticsPage.vue`
- `apps/dashboard/src/pages/monetization/MonetizationPage.vue`
- `apps/dashboard/src/pages/gameplay/GameplayPage.vue`
- `apps/dashboard/src/pages/system/SystemHealthPage.vue`
- `apps/dashboard/src/pages/debug/DebugPage.vue`
- `apps/dashboard/src/utils/format.ts`

**Modified files (4):**
- `package.json` (root) — add `dash:dev` and `dash:build` scripts
- `docs/ops/DOMAINS.md` — add `dashboard.` entry (state: `planned`)
- `docs/ai/DECISIONS.md` — D-15701 through D-15707
- `docs/ai/work-packets/WORK_INDEX.md` — add WP-157 row

---

## Contract

This section defines the API/data/UI surface this WP locks.

### Service Response Envelope

All service functions in `endpoints.ts` MUST return:

```ts
interface ServiceResponse<T> {
  data: T
  updatedAt: number   // epoch ms (Date.now() at response time)
  source: 'LIVE' | 'CACHED' | 'MOCK'
}
```

Mock services set `source: 'MOCK'` and `updatedAt: Date.now()`.
When real endpoints land (future WP), the server populates `updatedAt`
from the aggregate's last-computed timestamp.

The `useDataFreshness()` composable consumes this envelope directly —
widgets never manually construct freshness state.

### Error Envelope

All service-layer failures MUST be normalized into:

```ts
interface ApiError {
  message: string     // full-sentence, human-readable
  code?: string       // machine-readable error code (e.g., 'unauthorized', 'timeout')
  retryable?: boolean // hint for UI (show retry button vs. permanent error)
}
```

Constraints:
- No raw Axios errors escape the service layer
- The `api.ts` interceptor catches and wraps all non-2xx responses
- Widgets receive `ApiError` via composables; they never import Axios types

### Widget Contract

Every widget in `src/widgets/` MUST satisfy:

1. **Fetch its own data** via a composable (never accept data as a prop
   from the page)
2. **Render four states:**
   - Loading (skeleton or spinner)
   - Error (message + optional retry)
   - Empty (explicit "no data" indicator)
   - Data (the normal display)
3. **Display freshness** (source badge + relative timestamp from
   `useDataFreshness`)
4. **Be mount-safe** — no side effects outside `<script setup>` lifecycle
   hooks; no global state mutation on mount

Pages lay out widgets in CSS grids. Pages do NOT fetch data, pass data
props, or manage widget state.

### Polling Contract

- Default poll interval: **30 seconds** (configurable per composable, not per widget)
- No widget sets its own interval — intervals are controlled by
  `useFetch` / `useRealtimeMetrics` composables
- Polling stops when the component unmounts (`onUnmounted` cleanup)
- Polling pauses when the browser tab is hidden (`document.hidden`)
- In mock mode, polling still runs (exercises the refresh path with
  randomized mock data)

### Feature Flags Contract

Env var: `VITE_FEATURE_FLAGS` (comma-separated string)

Parsing rules:
- Split on comma
- Trim whitespace from each token
- Case-sensitive (no normalization)
- Unknown flags are silently ignored (no warnings, no errors)
- Empty string or missing env var = no flags enabled

Composable API:
```ts
const flags = useFeatureFlags()
flags.isEnabled('alerts')  // boolean
flags.all                  // readonly string[]
```

### Route Guard Contract

| Condition | Action |
|-----------|--------|
| Unauthenticated + protected route | Redirect to `/login` with `?redirect=` |
| Authenticated + insufficient role | Redirect to `/` (overview), NOT to login |
| Authenticated + visiting `/login` | Redirect to `/` (overview) |

### URL State Contract

- `?range=` param accepts: `7d`, `14d`, `30d`, `90d`
- Default: `7d` (applied when param is missing or invalid)
- Invalid values silently fall back to `7d`
- Reflected in composable state on initial page load
- Widgets re-fetch data when range changes

### Debug Page Contract

The `/debug` route MUST display:

- Feature flags (resolved list from `useFeatureFlags().all`)
- API base URL (`VITE_API_BASE_URL`)
- WS URL (`VITE_WS_URL`)
- Mock mode (`VITE_USE_MOCKS` — true/false)
- Build timestamp (injected at build time via Vite `define`)
- App version (from `package.json` version field)
- WebSocket connection state placeholder (connected/disconnected/disabled)

### DataTable Contract (PrimeVue)

Every PrimeVue DataTable instance MUST include:

- Column sorting (`:sortable="true"`)
- Column filtering (header filter row)
- Pagination (`:paginator="true"`, `:rows="20"`)
- Stable row key (`:dataKey="id"` or equivalent unique field)
- Loading state (`:loading` bound to the composable's loading ref)

---

## Locked Contract Values

| Item | Value | Decision |
|------|-------|----------|
| App name | `@legendary-arena/dashboard` | — |
| Deploy target | `dashboard.legendary-arena.com` (separate CF Pages project) | — |
| Component library | PrimeVue 4 (Aura theme preset) | D-15701 |
| Test runner | `node:test` via tsx loader | monorepo convention |
| State management | Pinia | matches arena-client |
| Charts | ECharts via `vue-echarts` | — |
| HTTP client | Axios | matches arena-client |
| Date range URL param | `?range=7d\|14d\|30d\|90d` (default `7d`) | D-15706 |
| Default poll interval | 30 seconds | D-15703 |
| Default mock mode | `VITE_USE_MOCKS=true` | — |
| Service envelope | `{ data: T, updatedAt: number, source: 'LIVE'\|'CACHED'\|'MOCK' }` | D-15705 |
| Error envelope | `{ message: string, code?: string, retryable?: boolean }` | — |

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ for tooling
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file (no diffs, no snippets)
- Test files `.test.ts`
- Full-sentence error messages
- pnpm workspace (not npm) — no `package-lock.json`

**Packet-specific:**
- The SPA MUST NOT import `@legendary-arena/game-engine`,
  `@legendary-arena/registry`, `@legendary-arena/preplan`, or
  `@legendary-arena/server` at runtime.
- The SPA MUST NOT call any URL on `api.legendary-arena.com` or
  `legendary-arena-server.onrender.com` in this packet. All data comes
  from mocks.
- PrimeVue 4 is the sole component library (D-15701). No Vuestic UI, no
  Vuetify, no Element Plus.
- Every widget MUST conform to the Widget Contract (4-state + freshness).
- Kill switch: Cloudflare redirect rule to maintenance page (no in-app
  mechanism needed) — documented in deployment notes, not coded.

---

## Acceptance Criteria

- [ ] All 5 pages + debug page render with mock data in the browser
- [ ] KPI widgets on Overview show: value, loading skeleton, freshness badge
- [ ] Clicking a KPI card navigates to a detail page with a DataTable
- [ ] DataTable supports sorting any column, filtering, and pagination
- [ ] Changing `?range=14d` in the URL bar updates widget date filtering
- [ ] Removing the `?range=` param defaults to 7d behavior
- [ ] Feature flag `VITE_FEATURE_FLAGS=alerts` enables the AlertsPanel
- [ ] An `analyst` role user cannot access `/monetization` or `/system`
- [ ] An `admin` role user can access all routes
- [ ] Debug page shows all 7 required fields
- [ ] Mock data includes realistic values (not placeholder zeros)
- [ ] Every widget shows source badge (`MOCK`) and relative timestamp
- [ ] Widgets show loading state on initial mount before data arrives
- [ ] Service errors render as widget error state (not console-only)

---

## Verification Steps

Operator-runnable steps to confirm the scaffold works end-to-end:

```bash
# 1. Install and build
pnpm install
pnpm -r build

# 2. Run dashboard dev server
pnpm dash:dev

# 3. Open browser at http://localhost:5173
#    → Should redirect to /login (unauthenticated)

# 4. Login with any email (mock mode accepts all)
#    → Should land on /overview with 4 KPI cards + 2 charts + alerts

# 5. Verify freshness badges
#    → Every widget should show "MOCK" badge + "Updated Xs ago"

# 6. Navigate to /players
#    → DataTable renders with mock data, sortable columns, filter row

# 7. Change URL to ?range=30d
#    → Composable state updates; widgets re-fetch (mock randomizes)

# 8. Navigate to /debug
#    → Shows feature flags, env vars, mock mode, build timestamp, version

# 9. Grep for forbidden imports
rg "@legendary-arena/(game-engine|registry|preplan|server)" apps/dashboard/
#    → Zero matches

rg "boardgame.io" apps/dashboard/
#    → Zero matches

rg "AxiosError" apps/dashboard/ --glob "!**/api.ts"
#    → Zero matches (raw Axios types only in api.ts)

# 10. Full monorepo build
pnpm -r build
#    → Exits 0
```

---

## Definition of Done

1. `pnpm install` exits 0 from repo root
2. `pnpm --filter @legendary-arena/dashboard build` exits 0
3. `pnpm --filter @legendary-arena/dashboard typecheck` exits 0
4. `pnpm --filter @legendary-arena/dashboard dev` serves on localhost; all 5 pages + debug render with mock data
5. Every widget conforms to Widget Contract (4-state rendering + freshness)
6. Service functions return `ServiceResponse<T>` envelope
7. No raw Axios errors outside `services/api.ts`
8. URL `?range=7d` is reflected in widget date filtering; invalid values default to `7d`
9. `/debug` route renders all 7 required fields
10. PrimeVue DataTable on Players and/or Monetization page with sort + filter + pagination + dataKey
11. Zero imports from `@legendary-arena/game-engine`, `registry`, `preplan`, or `server`
12. `pnpm -r build` (full monorepo) exits 0
13. Login page renders; auth store persists/hydrates from localStorage
14. Role-based route guard: unauthenticated→login, unauthorized→overview
15. `docs/ai/DECISIONS.md` updated (D-15701 through D-15707)
16. `docs/ai/work-packets/WORK_INDEX.md` updated with WP-157 row
17. `docs/ops/DOMAINS.md` updated with `dashboard.legendary-arena.com`

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-15701 | Dashboard uses PrimeVue 4 (Aura theme preset) | Best-in-class DataTable; design-token system; tree-shaking; active maintenance (PrimeTek since 2008); unstyled escape hatch. Reviewed against Vuestic (limited DataTable, smaller community), Naive UI (bus-factor), Vuetify (heavy, slow). |
| D-15702 | Analytics architecture = event pipeline + aggregate tables (not raw PG queries) | Dashboard is time-series analytics, not CRUD. Raw match-history queries won't scale. Aggregates (`daily_metrics`, `kpi_snapshots`) serve dashboard reads. Schema designed in a future WP. |
| D-15703 | Real-time is polling-first; WS reserved for alerts + live matches only. Default poll interval: 30s. | Reduces backend complexity, simplifies debugging, avoids auth edge cases. Polling composables for most widgets; targeted WS for alert push only (future WP). |
| D-15704 | Dashboard types live locally in `apps/dashboard/src/types/` until a future WP extracts them to `packages/contracts/` | Avoids blocking frontend scaffold on contract-package design. Real contract emerges after the analytics data model is proven. |
| D-15705 | Every widget renders a data-freshness indicator via `ServiceResponse` envelope (`source` badge + relative `updatedAt` timestamp) | Ops tooling trust requirement — operators must know if data is live, cached, or mocked, and how stale it is. |
| D-15706 | URL state for date range (`?range=7d`); default `7d`; invalid values fall back silently | Dashboards must be shareable and bookmarkable. Composable reads/writes the URL param reactively. |
| D-15707 | Route role meta supports `admin`, `operator`, `finance`, `support` | Future-proofs role expansion without route restructuring. Only `admin` / `analyst` wired in this packet. |

---

## Future Work (Explicitly Deferred)

These are anticipated follow-on packets. Numbers are provisional until
drafted and registered in `WORK_INDEX.md`.

| Provisional WP | Title | Hard-Dep |
|----------------|-------|----------|
| WP-158 (provisional) | Analytics Event Pipeline & Aggregate Tables | WP-157 (for contract context) |
| WP-159 (provisional) | Dashboard Shared Contracts Package (`packages/contracts/`) | WP-158 |
| WP-160 (provisional) | Dashboard API Endpoints (wires 7 routes in `apps/server`) | WP-158 + WP-159 |
| WP-161 (provisional) | Selective Real-Time + Alert Config Table | WP-160 |

Post-WP-161 backlog (no numbers assigned):
- httpOnly cookies + refresh token rotation
- Client error reporting endpoint (`POST /api/dash/errors`)
- Store-level unit tests (once endpoints are real)
- Cloudflare redirect kill switch documentation
- Deployment environment isolation (dev/staging/prod CF Pages)

---

## Anti-Patterns to Avoid

- Do NOT import any `@legendary-arena/*` workspace package at runtime
- Do NOT call real backend URLs; mock everything
- Do NOT introduce boardgame.io as a dependency
- Do NOT persist anything to PostgreSQL from this app
- Do NOT add this app to the `game-engine → server` dependency chain
- Do NOT use Vuestic UI, Vuetify, Element Plus, or any non-PrimeVue component library
- Do NOT create a `packages/contracts/` directory in this packet (deferred)
- Do NOT let raw Axios errors propagate past the service layer
- Do NOT let widgets accept data props from pages (widget-owns-data pattern)
- Do NOT let widgets set their own poll intervals

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | Single WP per session | PASS — one packet, one session |
| 2 | Dependency discipline | PASS — no dependencies (parallel-safe) |
| 3 | Review gate | N/A — this is the draft, not execution |
| 4 | Layer boundary | PASS — Client layer only; no engine/server/registry imports |
| 5 | File count | PASS — ~34 new + 4 modified; single-layer scaffold justifies count |
| 6 | Contract stability | PASS — no existing contracts modified; all new |
| 7 | Auth posture | N/A — no real auth endpoints wired; mock-only |
| 8 | Determinism | N/A — no engine code |
| 9 | Persistence boundary | PASS — no database access; no G persistence |
| 10 | Test coverage | PASS — test runner wired; `node:test` via tsx |
| 11 | Error handling | PASS — `ApiError` envelope; full-sentence messages |
| 12 | Code style (00.6) | PASS — ESM, full words, no abbreviations |
| 13 | Module system | PASS — ESM only; `node:` prefix for built-ins |
| 14 | Naming | PASS — descriptive composable/widget/page names |
| 15 | Comments | PASS — no `// why:` required (no engine state) |
| 16 | Drift detection | N/A — no canonical arrays or union types in engine |
| 17 | Vision alignment | PASS — internal ops tool; does not touch gameplay, scoring, or player-facing surfaces; NG-1..NG-7 not crossed |
| 18 | Pre-planning | N/A — no preplan layer touched |
| 19 | Replay safety | N/A — no engine state |
| 20 | Funding surface gate | N/A — no money-flow or entitlement surface |
| 21 | API catalog (D-11804) | N/A — no new HTTP endpoints in `apps/server`; deferred to WP-160 |
