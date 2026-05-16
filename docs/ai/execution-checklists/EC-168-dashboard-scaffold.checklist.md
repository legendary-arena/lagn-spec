# EC-168 — Dashboard Scaffold (Execution Checklist)

**Source:** docs/ai/work-packets/WP-157-dashboard-scaffold.md
**Layer:** Client (`apps/dashboard`)

## Before Starting
- [ ] `pnpm install` && `pnpm -r build` exit 0 (full monorepo green)
- [ ] PrimeVue 4 available on npm (`npm view primevue version` returns 4.x)
- [ ] No existing `apps/dashboard/` directory

## Locked Values (do not re-derive)
- Package: `@legendary-arena/dashboard`; PrimeVue 4 Aura; ECharts via `vue-echarts`; Axios; Pinia
- Test runner: `node:test` via tsx loader
- URL param: `?range=7d|14d|30d|90d` (default `7d`; invalid → `7d`)
- Feature flags: `VITE_FEATURE_FLAGS` (comma-split, trim, case-sensitive, unknown ignored)
- Service envelope: `{ data: T, updatedAt: number, source: 'LIVE'|'CACHED'|'MOCK' }`
- Error envelope: `{ message: string, code?: string, retryable?: boolean }`
- Poll interval: 30s default (composable-controlled, not widget-controlled)
- Route roles: `('admin' | 'operator' | 'finance' | 'support')[]`
- Decisions: D-15701 through D-15707

## Guardrails
- Zero imports from `@legendary-arena/(game-engine|registry|preplan|server)` or `boardgame.io`
- Zero calls to `api.legendary-arena.com` or `legendary-arena-server.onrender.com`
- No `package-lock.json`; no Vuestic/Vuetify/Element Plus; no `packages/contracts/`
- No raw Axios errors escape service layer — all normalized to `ApiError`
- Every widget: 4-state (loading/error/empty/data) + freshness badge + fetches own data
- Pages never pass data props to widgets; polling controlled by composables only

## Required `// why:` Comments
- None mandated (no engine state, no `ctx.events.*`, no `ctx.random.*`)

## Files to Produce
**New (~40 in `apps/dashboard/`):**
- Config: `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `.env.example`
- Bootstrap: `src/main.ts`, `src/App.vue`, `src/env.d.ts`
- Types: `src/types/index.ts` (ServiceResponse, ApiError, domain)
- Router: `src/router/index.ts` (role guards, redirect rules)
- Layout: `src/layouts/AppLayout.vue`
- Stores: `src/stores/{auth,metrics,alerts}.ts`
- Services: `src/services/{api,endpoints,mocks,websocket}.ts`
- Composables: `src/composables/{useFetch,useRealtimeMetrics,useFeatureFlags,useDateRange,useDataFreshness}.ts`
- Widgets: `src/widgets/{KpiCard,ActivePlayers,MatchesRunning,RevenueToday,ServerStatus,DauChart,RevenueChart,AlertsPanel}.vue`
- Pages: 7 (Login, Overview, PlayerAnalytics, Monetization, Gameplay, SystemHealth, Debug)
- Helpers: `src/utils/format.ts`, `src/components/charts/BaseChart.vue`

**Modified (4):** root `package.json`, `docs/ops/DOMAINS.md`, `docs/ai/DECISIONS.md`, `WORK_INDEX.md`

## After Completing
- [ ] `pnpm install` && `pnpm --filter @legendary-arena/dashboard build` && `typecheck` exit 0
- [ ] `pnpm -r build` exits 0 (full monorepo green)
- [ ] Dev server renders all 5 pages + debug with mock data
- [ ] Every widget: 4-state rendering + freshness badge (source + timestamp)
- [ ] Services return `ServiceResponse<T>`; no `AxiosError` refs outside `services/api.ts`
- [ ] `?range=7d` read by composable; invalid values default; DataTable has sort/filter/pagination/dataKey
- [ ] `/debug` shows: flags, API URL, WS URL, mock mode, build timestamp, version, WS state
- [ ] Auth: unauthenticated→`/login`; unauthorized role→`/` (not login)
- [ ] Zero grep: `@legendary-arena/(game-engine|registry|preplan|server)`, `boardgame.io`
- [ ] Governance: DECISIONS (D-15701–D-15707), WORK_INDEX (WP-157 row), DOMAINS.md updated

## Common Failure Smells
- PrimeVue not rendering → missing `app.use(PrimeVue)` or theme CSS not in `main.ts`
- Freshness badge empty → widget not consuming `ServiceResponse` envelope from service
- Widget shows data but no loading/error → missing 4-state template guards
- Raw Axios error in widget → `api.ts` interceptor not wrapping; check error normalization
